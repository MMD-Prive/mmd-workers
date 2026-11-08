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
