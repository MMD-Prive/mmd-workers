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
const env = { AIRTABLE_API_KEY: "k" };

test("handler guards: auth, origin, confirm, id", async () => {
  assert.equal((await handleAdminJobVoidRequest(req({}), env, null)).status, 401);
  assert.equal((await handleAdminJobVoidRequest(req({ session_id: "sess_dup1", confirm: true }, "https://evil.com"), env, {})).status, 403);
  assert.equal((await handleAdminJobVoidRequest(req({ session_id: "sess_dup1" }), env, {})).status, 400);
  assert.equal((await handleAdminJobVoidRequest(req({ session_id: 'a"b', confirm: true }), env, {})).status, 400);
  assert.equal((await handleAdminJobVoidRequest(req({ session_id: "sess_dup1", confirm: true }), env, { role: "mms_partner" })).status, 403);
});

test("handler voids unpaid job and marks intent; never DELETEs", async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body });
    if ((init.method || "GET") === "PATCH") return new Response("{}");
    if (String(url).includes("tblC98mKWbzmPuNzX")) return new Response(JSON.stringify({ records: [{ id: "recS", fields: sess() }] }));
    if (String(url).includes("tblWGGJJOx5eBvBZJ")) return new Response(JSON.stringify({ records: [{ id: "recP", fields: {} }] }));
    return new Response(JSON.stringify({ records: [] }));
  };
  try {
    const res = await handleAdminJobVoidRequest(req({ session_id: "sess_dup1", confirm: true, reason: "ซ้ำ" }), env, { id: "per" });
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
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push(init.method || "GET");
    if (String(url).includes("tblC98mKWbzmPuNzX")) return new Response(JSON.stringify({ records: [{ id: "recS", fields: sess() }] }));
    if (String(url).includes("tblfJfM4Sqag9zrLi")) return new Response(JSON.stringify({ records: [{ id: "recProof" }] }));
    return new Response(JSON.stringify({ records: [] }));
  };
  try {
    const res = await handleAdminJobVoidRequest(req({ session_id: "sess_dup1", confirm: true }), env, {});
    assert.equal(res.status, 409);
    assert.ok(!calls.includes("PATCH"));
  } finally { globalThis.fetch = orig; }
});
