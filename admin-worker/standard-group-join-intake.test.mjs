import assert from "node:assert/strict";
import test from "node:test";
import {
  handleStandardJoinIntakeRpc,
  readStandardJoinQueue,
  isStandardJoinIntakeRpcRequest,
} from "./src/premium-group-cleanup/standard-join-intake.js";
import { handlePremiumGroupCleanupOwnerRequest } from "./src/premium-group-cleanup/owner.js";

const env = {
  TELEGRAM_STANDARD_JOIN_CAPTURE_ENABLED: "true",
  AIRTABLE_API_KEY: "fixture-only-token",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
};
const url = "https://admin-worker.internal/__internal/telegram-standard-join-intake";
const payload = (over = {}) => ({
  room: "standard",
  telegram_user_id_numeric: "1234567890",
  telegram_username: "example_member",
  telegram_display_name: "Example Member",
  requested_at_unix: 1794120000,
  hype_check_state: "canonical_verified",
  hype_membership_level: "private_standard",
  hype_membership_lifecycle: "active",
  ...over,
});
const request = (body = payload(), overrides = {}) => new Request(
  overrides.url || url,
  { method: overrides.method || "POST",
    headers: overrides.headers || { "x-mmd-service-binding": "telegram-worker", "content-type": "application/json" },
    body: JSON.stringify(body) },
);

test("standard join RPC is private, caller-checked and disabled by default", async () => {
  assert.equal(isStandardJoinIntakeRpcRequest("/__internal/telegram-standard-join-intake"), true);
  const publicHost = await handleStandardJoinIntakeRpc(request(payload(), { url: "https://www.mmdbkk.com/__internal/telegram-standard-join-intake" }), env);
  assert.equal(publicHost.status, 403);
  const fakeHeader = await handleStandardJoinIntakeRpc(request(payload(), { headers: { "x-mmd-service-binding": "other-service" } }), env);
  assert.equal(fakeHeader.status, 403);
  const disabled = await handleStandardJoinIntakeRpc(request(), { ...env, TELEGRAM_STANDARD_JOIN_CAPTURE_ENABLED: "false" }, {
    fetch: async () => { throw new Error("must never fetch"); },
  });
  assert.equal(disabled.status, 200);
  assert.deepEqual(await disabled.json(), { ok: true, captured: false, state: "disabled" });
});

test("standard join RPC never persists invalid identity/date or non-Standard requests", async () => {
  for (const item of [
    payload({ room: "premium" }),
    payload({ telegram_user_id_numeric: "0" }),
    payload({ requested_at_unix: "not_a_date" }),
    payload({ telegram_username: "@unsafe/name" }),
  ]) {
    const res = await handleStandardJoinIntakeRpc(request(item), env, {
      fetch: async () => { throw new Error("must never fetch"); },
    });
    assert.equal(res.status, 400);
  }
});

test("join request creates minimal private Airtable record; replay preserves owner decision", async () => {
  const calls = [];
  let stored = null;
  const fakeFetch = async (rawUrl, options = {}) => {
    const q = new URL(rawUrl);
    const method = options.method || "GET";
    calls.push({ method, pathname: q.pathname });
    assert.equal(options.headers.authorization, "Bearer fixture-only-token");
    assert.ok(q.pathname.includes("/tblGFkPcMFsxsW5Ul"));
    if (method === "PATCH") {
      assert.ok(q.pathname.endsWith("/tblGFkPcMFsxsW5Ul/recEXAMPLE1234567"));
      const patch = JSON.parse(options.body);
      assert.equal(patch.fields.hype_check_state, "canonical_verified");
      assert.ok(patch.fields.hype_checked_at);
      assert.equal(Object.hasOwn(patch.fields, "review_status"), false);
      assert.equal(Object.hasOwn(patch.fields, "telegram_user_id_numeric"), false);
      return Response.json({ id: "recEXAMPLE1234567", fields: { ...stored, ...patch.fields, review_status: "owner_verified" } });
    }
    if (method === "GET") {
      assert.match(q.searchParams.get("filterByFormula"), /join_key/);
      return Response.json({ records: stored ? [{ id: "recEXAMPLE1234567", fields: { ...stored, review_status: "owner_verified" } }] : [] });
    }
    assert.equal(method, "POST");
    const sent = JSON.parse(options.body);
    assert.deepEqual(sent.performUpsert, { fieldsToMergeOn: ["join_key"] });
    stored = sent.records[0].fields;
    assert.equal(stored.join_key, "standard:1234567890");
    assert.equal(stored.telegram_user_id_numeric, "1234567890");
    assert.equal(stored.room, "standard");
    assert.equal(stored.telegram_username, "example_member");
    assert.equal(stored.hype_check_state, "canonical_verified");
    assert.equal(stored.hype_membership_level, "private_standard");
    assert.equal(stored.hype_membership_lifecycle, "active");
    assert.match(stored.hype_checked_at, /^\d{4}-\d\d-\d\dT/);
    for (const privateKey of ["phone", "email", "line_user_id", "user_chat_id", "review_status", "owner_review_note", "membership_tier"]) {
      assert.equal(Object.hasOwn(stored, privateKey), false);
    }
    return Response.json({ records: [{ id: "recEXAMPLE1234567", fields: stored }] });
  };
  const first = await handleStandardJoinIntakeRpc(request(), env, { fetch: fakeFetch });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).captured, true);
  const second = await handleStandardJoinIntakeRpc(request(), env, { fetch: fakeFetch });
  assert.equal((await second.json()).state, "already_recorded");
  assert.equal(calls.filter(x => x.method === "POST").length, 1);
  assert.equal(calls.filter(x => x.method === "PATCH").length, 1);
});

test("owner queue uses only Telegram identity candidates; never publishes phone/email", async () => {
  const fetchFake = async (rawUrl) => {
    const u = new URL(rawUrl);
    if (u.pathname.endsWith("tblGFkPcMFsxsW5Ul")) {
      return Response.json({ records: [
        { id: "recJOINEXAMPLE01", fields: {
          room: "standard", telegram_user_id_numeric: "1234567890",
          telegram_username: "example_member", telegram_display_name: "Example Member",
          requested_at: "2026-11-08T05:00:00.000Z",
          hype_check_state: "canonical_verified",
          hype_membership_level: "private_standard",
          hype_membership_lifecycle: "active",
          hype_checked_at: "2026-11-08T05:00:01.000Z",
        } },
      ] });
    }
    if (u.pathname.endsWith("tblQVya3rvb1CpRrB")) return Response.json({ records: [] });
    if (u.pathname.endsWith("tblCVwWXwyEhU2AEN")) {
      return Response.json({ records: [
        { id: "recSOURCEEXAMPLE", fields: {
          line_oa_customer_ref: "LINE-A Example", nickname: "Nick",
          telegram_username: "example_member", telegram_display_name: "Example Member",
          telegram_user_id_numeric: "1234567890", possible_duplicate: false,
          phone: "0890000000", email: "secret@example.test",
        } },
      ] });
    }
    throw new Error("unexpected Airtable table");
  };
  const out = await readStandardJoinQueue(env, { fetch: fetchFake });
  assert.equal(out.ok, true);
  assert.equal(out.count, 1);
  assert.equal(out.items[0].possible_match_count, 1);
  assert.equal(out.items[0].possible_matches[0].evidence, "numeric_id_exact");
  assert.equal(out.items[0].review_status, "pending_owner_review");
  assert.equal(out.items[0].hype_check_state, "canonical_verified");
  assert.equal(out.items[0].hype_membership_level, "private_standard");
  assert.equal(out.items[0].hype_membership_lifecycle, "active");
  assert.equal(out.sends_nothing, true);
  assert.equal(out.approves_nothing, true);
  assert.equal(out.removes_nothing, true);
  const printed = JSON.stringify(out);
  assert.ok(!printed.includes("0890000000"));
  assert.ok(!printed.includes("secret@example.test"));
  assert.ok(!printed.includes("1234567890"));
});

test("join queue stays owner-only and read-only at /internal/admin/premium-group-cleanup/join-requests", async () => {
  const req = () => new Request("https://www.mmdbkk.com/internal/admin/premium-group-cleanup/join-requests");
  let read = 0;
  const deps = {
    readStandardJoinQueue: async () => { read++; return { ok: true, items: [], count: 0, dry_run: true }; },
    readActor: async () => ({ role: "owner" }),
  };
  const owner = await handlePremiumGroupCleanupOwnerRequest(req(), env, deps);
  assert.equal(owner.status, 200);
  assert.equal((await owner.json()).count, 0);
  const notOwner = await handlePremiumGroupCleanupOwnerRequest(req(), env, {
    ...deps, readActor: async () => ({ role: "admin" }),
  });
  assert.equal(notOwner.status, 403);
  assert.equal(read, 1);
});


test("Premium capture uses a distinct private table, independent feature flag and stable key", async () => {
  const envPremium = { ...env, TELEGRAM_PREMIUM_JOIN_CAPTURE_ENABLED: "true" };
  const requestPremium = () => new Request("https://admin-worker.internal/__internal/telegram-group-join-intake", {
    method: "POST",
    headers: { "x-mmd-service-binding": "telegram-worker", "content-type": "application/json" },
    body: JSON.stringify(payload({
      room: "premium",
      join_outcome: "approved_by_existing_handler",
      telegram_user_id_numeric: "1234567890",
    })),
  });
  const calls = [];
  const fakeFetch = async (raw, options = {}) => {
    const url = new URL(raw);
    assert.ok(url.pathname.endsWith("/tblQVya3rvb1CpRrB"));
    calls.push(options.method || "GET");
    if (!options.method) return Response.json({ records: [] });
    const body = JSON.parse(options.body);
    assert.equal(body.records[0].fields.join_key, "premium:1234567890");
    assert.equal(body.records[0].fields.room, "premium");
    assert.equal(body.records[0].fields.join_outcome, "approved_by_existing_handler");
    assert.equal(body.records[0].fields.telegram_user_id_numeric, "1234567890");
    assert.ok(!Object.hasOwn(body.records[0].fields, "review_status"));
    return Response.json({ records: [{ id: "recPREMIUM1234567" }] });
  };
  const result = await handleStandardJoinIntakeRpc(requestPremium(), envPremium, { fetch: fakeFetch });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).room, "premium");
  assert.deepEqual(calls, ["GET", "POST"]);

  const disabled = await handleStandardJoinIntakeRpc(requestPremium(), env, {
    fetch: async () => { throw new Error("No network on disabled capture"); },
  });
  assert.deepEqual(await disabled.json(), { ok: true, captured: false, state: "disabled" });

  const legacyPremium = await handleStandardJoinIntakeRpc(request(payload({ room: "premium" })), envPremium);
  assert.equal(legacyPremium.status, 400);
});

test("combined Owner queue keeps Premium and Standard independent and redacts identifiers", async () => {
  const example = (room) => ({
    join_key: room + ":1234567890", room,
    telegram_user_id_numeric: "1234567890",
    telegram_username: "example_member",
    telegram_display_name: "Example Member",
    requested_at: "2026-11-08T05:00:00.000Z",
    hype_check_state: "canonical_verified",
    hype_membership_level: "private_premium",
    hype_membership_lifecycle: "active",
    ...(room === "premium" ? { join_outcome: "approved_by_existing_handler" } : {}),
  });
  const fetchFake = async (raw) => {
    const path = new URL(raw).pathname;
    if (path.endsWith("tblGFkPcMFsxsW5Ul")) return Response.json({ records: [{ id: "recSTD12345678900", fields: example("standard") }] });
    if (path.endsWith("tblQVya3rvb1CpRrB")) return Response.json({ records: [{ id: "recPRE12345678900", fields: example("premium") }] });
    if (path.endsWith("tblCVwWXwyEhU2AEN")) return Response.json({ records: [
      { id: "recSOURCE12345678", fields: {
        line_oa_customer_ref: "LINE Ref A",
        telegram_username: "example_member",
        telegram_user_id_numeric: "1234567890",
        phone: "0811111111",
        email: "private@example.test",
      } },
    ] });
    throw new Error("Unexpected table");
  };
  const out = await readStandardJoinQueue(env, { fetch: fetchFake });
  assert.equal(out.count, 2);
  assert.deepEqual(out.by_room, { standard: 1, premium: 1 });
  assert.deepEqual(out.capture_enabled, { standard: true, premium: false });
  assert.deepEqual(new Set(out.items.map(i => i.room)), new Set(["standard","premium"]));
  assert.equal(out.items.find(i => i.room === "premium").join_outcome, "approved_by_existing_handler");
  assert.equal(out.items.find(i => i.room === "standard").join_outcome, "pending_owner_review");
  assert.equal(out.roster_complete, false);
  assert.equal(out.approves_nothing, true);
  const printed=JSON.stringify(out);
  for(const secret of ["0811111111","private@example.test","1234567890"]) assert.equal(printed.includes(secret), false);
});
