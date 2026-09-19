import test from "node:test";
import assert from "node:assert/strict";
import { readMemberHistoryRecoveryStatus } from "./src/member-history-recovery.js";

import {
  ensureMemberHistoryRecoveryOnAccess,
  isMemberHistoryOnAccessPath,
  __test,
} from "./src/member-history-on-access.js";

const TOKEN = "session_token_123";

class FakeKv {
  constructor() {
    this.map = new Map();
    this.puts = [];
    this.deletes = [];
  }

  async get(key) {
    return this.map.get(key) || null;
  }

  async put(key, value, options) {
    this.map.set(key, value);
    this.puts.push({ key, value, options });
  }

  async delete(key) {
    this.map.delete(key);
    this.deletes.push(key);
  }
}

function memberRequest(path = "/api/member/app/dashboard", token = TOKEN) {
  return new Request(`https://mmdbkk.com${path}`, {
    method: "GET",
    headers: token ? { cookie: `foo=bar; __Host-mmd_liff_session=${token}` } : {},
  });
}

test("MY MMD member app and LIFF profile reads are recovery access paths", () => {
  assert.equal(isMemberHistoryOnAccessPath("https://mmdbkk.com/api/member/app/dashboard"), true);
  assert.equal(isMemberHistoryOnAccessPath("https://mmdbkk.com/api/member/app/history"), true);
  assert.equal(isMemberHistoryOnAccessPath("https://mmdbkk.com/member/api/liff/profile"), true);
  assert.equal(isMemberHistoryOnAccessPath("https://mmdbkk.com/member/api/liff/start"), false);
  assert.equal(isMemberHistoryOnAccessPath("https://mmdbkk.com/booking"), false);
});

test("first authenticated MY MMD read schedules recovery immediately", async () => {
  const kv = new FakeKv();
  const calls = [];
  const scheduler = async (token, env, ctx, trigger) => {
    calls.push({ token, env, ctx, trigger });
    return true;
  };
  const env = { LIFF_IDENTITY_KV: kv };
  const ctx = { waitUntil() {} };

  const result = await ensureMemberHistoryRecoveryOnAccess(memberRequest(), env, ctx, { scheduler });
  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].token, TOKEN);
  assert.equal(calls[0].trigger, "member_app_access");
  assert.equal(kv.puts.length, 1);
  assert.equal(kv.puts[0].options.expirationTtl, __test.ACCESS_DEDUPE_TTL_SECONDS);
});

test("same session is deduped so dashboard/profile/history do not enqueue duplicates", async () => {
  const kv = new FakeKv();
  let calls = 0;
  const scheduler = async () => {
    calls += 1;
    return true;
  };
  const env = { LIFF_IDENTITY_KV: kv };

  assert.equal(await ensureMemberHistoryRecoveryOnAccess(memberRequest("/api/member/app/dashboard"), env, {}, { scheduler }), true);
  assert.equal(await ensureMemberHistoryRecoveryOnAccess(memberRequest("/api/member/app/profile"), env, {}, { scheduler }), false);
  assert.equal(await ensureMemberHistoryRecoveryOnAccess(memberRequest("/api/member/app/history"), env, {}, { scheduler }), false);
  assert.equal(calls, 1);
});

test("failed scheduling clears the marker so the next authenticated read can retry", async () => {
  const kv = new FakeKv();
  let calls = 0;
  const scheduler = async () => {
    calls += 1;
    return calls > 1;
  };
  const env = { LIFF_IDENTITY_KV: kv };

  assert.equal(await ensureMemberHistoryRecoveryOnAccess(memberRequest(), env, {}, { scheduler }), false);
  assert.equal(kv.deletes.length, 1);
  assert.equal(await ensureMemberHistoryRecoveryOnAccess(memberRequest(), env, {}, { scheduler }), true);
  assert.equal(calls, 2);
});

test("missing member session cookie never schedules recovery", async () => {
  const kv = new FakeKv();
  let calls = 0;
  const scheduler = async () => {
    calls += 1;
    return true;
  };
  const result = await ensureMemberHistoryRecoveryOnAccess(memberRequest("/api/member/app/dashboard", ""), { LIFF_IDENTITY_KV: kv }, {}, { scheduler });
  assert.equal(result, false);
  assert.equal(calls, 0);
  assert.equal(kv.puts.length, 0);
});


test("history recovery status reader preserves reconciled as authoritative terminal state", async () => {
  const env = {
    LIFF_IDENTITY_KV: {
      async get(_key, format) {
        assert.equal(format, "json");
        return {
          state: "reconciled",
          current_points_total: 1250,
          pending_review_count: 0,
          reason: "note_first_recovery_complete",
          updated_at: "2026-09-19T12:00:00.000Z",
        };
      },
    },
  };
  const status = await readMemberHistoryRecoveryStatus(env, `U${"a".repeat(32)}`);
  assert.equal(status.state, "reconciled");
  assert.equal(status.current_points_total, 1250);
  assert.equal(status.pending_review_count, 0);
  assert.equal(status.reason, "note_first_recovery_complete");
});
