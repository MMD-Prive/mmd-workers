import test from "node:test";
import assert from "node:assert/strict";
import { decideVoid, buildVoidNote, handleAdminJobVoidRequest, VOID_SESSION as S } from "./src/admin-job-void.js";

const sess = (o = {}) => ({ [S.id]: "sess_dup1", [S.status]: { name: "Pending" }, [S.paymentStatus]: { name: "pending" }, [S.paymentRef]: "pay_dup1", [S.note]: "old note", ...o });

test("decideVoid allows unpaid pending job", () => {
  assert.deepEqual(decideVoid(sess()), { ok: true, already: false });
});
test("decideVoid idempotent for already cancelled", () => {
  assert.equal(decideVoid(sess({ [S.status]: { name: "Cancelled" } })).already, true);
});
test("decideVoid refuses paid/partial, evidence, verification, progressed jobs", () => {
  assert.equal(decideVoid(sess({ [S.paymentStatus]: { name: "paid" } })).error, "payment_activity_exists");
  assert.equal(decideVoid(sess({ [S.paymentStatus]: { name: "partial" } })).error, "payment_activity_exists");
  assert.equal(decideVoid(sess(), { proofs: [{ id: "r" }] }).error, "payment_evidence_exists");
  assert.equal(decideVoid(sess(), { payments: [{ fields: { fldJ7a0Ube9F0bmRy: { name: "notified" } } }] }).error, "payment_activity_exists");
  assert.equal(decideVoid(sess(), { payments: [{ fields: { fldJ7a0Ube9F0bmRy: { name: "failed" } } }] }).ok, true);
  assert.equal(decideVoid(sess({ [S.status]: { name: "Confirmed" } })).error, "job_already_progressed");
});
test("note appends, never replaces", () => {
  const n = buildVoidNote("old note", { actor: { id: "per" }, reason: "duplicate", at: "2026-10-09T00:00:00Z" });
  assert.ok(n.startsWith("old note\n[MMD JOB VOID v1] "));
  assert.match(n, /"reason":"duplicate"/);
});

const req = (body, origin = "https://www.mmdbkk.com") => new Request("https://www.mmdbkk.com/v1/admin/job/void", { method: "POST", headers: { Origin: origin, "content-type": "application/json" }, body: JSON.stringify(body) });
import { revision, S as EDIT } from "./src/owner-job-edit.js";
import { JobEditJournal } from "./src/owner-job-edit-coordinator.js";

const env = { AIRTABLE_API_KEY: "k" };
function setup() {
  const balance = {schema: "verified_session_balance_v1", session_id: "sess_dup1",
    total_amount_thb: 100, remaining_amount_thb: 100, verified_paid_thb: 0,
    verified_deposit_thb: 0, paid_credit_thb: 0, bonus_credit_thb: 0,
    credit_applied_thb: 0, overpaid_amount_thb: 0};
  const session = {id: "recS", fields: {...sess(), [EDIT.amount]: 100}};
  const job = {id: "recJ", fields: {}};
  const runtime = {...env, AIRTABLE_BASE_ID: "fixture", AUTH_SERVICE_ADMIN_TO_PAYMENTS: "fixture",
    PAYMENTS_WORKER: {fetch: async () => Response.json({ok: true, authority: "payments-worker", balance})},
    AIRTABLE_HTTP: {fetch: async request => Response.json({records: [request.url.includes("tblC98") ? session : job]})},
  };
  const entries = new Map();
  const storage = {
    get: async key => entries.get(key),
    put: async (key, value) => entries.set(key, value),
    delete: async key => entries.delete(key),
  };
  let journal = new JobEditJournal(storage, runtime);
  return {
    revision: () => revision({session, job, balance}),
    env: { ...runtime, JOB_EDIT_COORDINATOR: { getByName: id => {
      assert.equal(id, "sess_dup1");
      return { fetch: request => journal.fetch(request) };
    } } },
    pendingEdit: () => storage.put("pending", { body: {request_id: "mock-edit"} }),
    restart: () => { journal = new JobEditJournal(storage, runtime); },
    reopen: () => journal.fetch(new Request("https://job-edit.internal/edit", {
      method: "POST", body: JSON.stringify({ body: {session_id: "sess_dup1"} }),
    })),
  };
}

test("handler guards: auth, origin, confirm, id", async () => {
  assert.equal((await handleAdminJobVoidRequest(req({}), env, null)).status, 401);
  assert.equal((await handleAdminJobVoidRequest(req({ session_id: "sess_dup1", confirm: true }, "https://evil.com"), env, {})).status, 403);
  assert.equal((await handleAdminJobVoidRequest(req({ session_id: "sess_dup1" }), env, {})).status, 400);
  assert.equal((await handleAdminJobVoidRequest(req({ session_id: 'a"b', confirm: true }), env, {})).status, 400);
  assert.equal((await handleAdminJobVoidRequest(req({ session_id: "sess_dup1", confirm: true }), env, { role: "mms_partner" })).status, 403);
});

test("handler voids unpaid job and marks intent; never DELETEs", async () => {
  const local = setup();
  const calls = [];
  const orig = globalThis.fetch;
  let fields = sess();
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body });
    if ((init.method || "GET") === "PATCH") {
      if (String(url).endsWith("/recS")) fields = { ...fields, ...JSON.parse(init.body).fields };
      return new Response("{}");
    }
    if (String(url).includes("tblC98mKWbzmPuNzX")) return new Response(JSON.stringify({ records: [{ id: "recS", fields }] }));
    if (String(url).includes("tblWGGJJOx5eBvBZJ")) return new Response(JSON.stringify({ records: [{ id: "recP", fields: {} }] }));
    return new Response(JSON.stringify({ records: [] }));
  };
  try {
    const res = await handleAdminJobVoidRequest(req({ session_id: "sess_dup1", confirm: true, revision: await local.revision(), reason: "ซ้ำ" }), local.env, { id: "per" });
    const j = await res.json();
    assert.equal(res.status, 200);
    assert.equal(j.voided, true);
    assert.equal(j.payment_intents_marked, 1);
    assert.ok(!calls.some((c) => c.method === "DELETE"));
    const sp = calls.find((c) => c.method === "PATCH" && c.url.includes("recS"));
    assert.equal(JSON.parse(sp.body).fields[S.status], "Cancelled");
  } finally { globalThis.fetch = orig; }
});

test("handler refuses when proof exists, writes nothing", async () => {
  const local = setup();
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push(init.method || "GET");
    if (String(url).includes("tblC98mKWbzmPuNzX")) return new Response(JSON.stringify({ records: [{ id: "recS", fields: sess() }] }));
    if (String(url).includes("tblfJfM4Sqag9zrLi")) return new Response(JSON.stringify({ records: [{ id: "recProof" }] }));
    return new Response(JSON.stringify({ records: [] }));
  };
  try {
    const res = await handleAdminJobVoidRequest(req({ session_id: "sess_dup1", confirm: true, revision: await local.revision() }), local.env, {});
    assert.equal(res.status, 409);
    assert.ok(!calls.includes("PATCH"));
  } finally { globalThis.fetch = orig; }
});

test("shared coordinator blocks reopen during void and recovers committed timeout after restart", async () => {
  const local = setup();
  let fields = sess({ [S.paymentRef]: "" });
  let writes = 0;
  let entered, release;
  const writing = new Promise(resolve => { entered = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "PATCH") {
      writes += 1;
      fields = { ...fields, ...JSON.parse(init.body).fields };
      entered();
      await waiting;
      throw new Error("simulated lost response");
    }
    return Response.json({ records: [{ id: "recS", fields }] });
  };
  const expected = await local.revision();
  const cancel = (recover = false) => handleAdminJobVoidRequest(req({session_id: "sess_dup1", confirm: true, revision: expected, recover}), local.env, {id: "per"});
  try {
    const first = cancel();
    await Promise.race([writing, first.then(() => assert.fail("cancel returned before PATCH"))]);
    assert.equal((await local.reopen()).status, 409);
    release();
    assert.equal((await first).status, 503);
    local.restart();
    assert.equal((await (await local.reopen()).json()).error, "void_outcome_unknown");
    assert.equal((await cancel(true)).status, 200);
    local.restart();
    assert.equal((await (await cancel()).json()).idempotent, true);
    assert.equal(writes, 1);
  } finally {
    release();
    globalThis.fetch = original;
  }
});

test("cancel waits for an unresolved edit after restart", async () => {
  const local = setup();
  await local.pendingEdit();
  local.restart();
  const result = await handleAdminJobVoidRequest(req({session_id: "sess_dup1", confirm: true, revision: await local.revision()}), local.env, {id: "per"});
  assert.equal(result.status, 409);
  assert.equal((await result.json()).error, "edit_recovery_required");
});

test("missing cancel revision is rejected before coordinator", async () => {
  const result = await handleAdminJobVoidRequest(req({session_id: "sess_dup1", confirm: true}), env, {});
  assert.equal(result.status, 400);
  assert.equal((await result.json()).error, "invalid_revision");
});

test("unconfirmed write stays pending across restart and recovery never patches", async () => {
  const local = setup();
  const expected = await local.revision();
  const cancel = recover => handleAdminJobVoidRequest(req({
    session_id: "sess_dup1", confirm: true, revision: expected, recover,
  }), local.env, {id: "per"});
  const original = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "PATCH") {
      writes += 1;
      throw new Error("simulated timeout before commit");
    }
    return Response.json({records: [{id: "recS", fields: sess({[S.paymentRef]: ""})}]});
  };
  try {
    assert.equal((await cancel(true)).status, 404);
    assert.equal(writes, 0);
    assert.equal((await cancel(false)).status, 503);
    local.restart();
    const result = await cancel(true);
    assert.equal(result.status, 503);
    assert.equal((await result.json()).recovery_required, true);
    assert.equal((await local.reopen()).status, 409);
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = original;
  }
});
