import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import worker from "../src/liff-stable-session-binding.js";

const realFetch = globalThis.fetch;
const LINE_ID = `U${"a".repeat(32)}`;

afterEach(() => { globalThis.fetch = realFetch; });

class MemoryKv {
  constructor() { this.map = new Map(); }
  async get(key, type) {
    const value = this.map.get(key);
    if (value == null) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.map.set(key, String(value)); }
  async delete(key) { this.map.delete(key); }
}

class MemoryGatewayStore {
  constructor() { this.records = []; this.decisions = []; }
  async upsertSession(session, recordId = "") {
    const id = recordId || `rec_liff_${this.records.length + 1}`;
    const index = this.records.findIndex((row) => row.record_id === id);
    const row = { ...session, record_id: id };
    if (index >= 0) this.records[index] = row;
    else this.records.push(row);
    return { record_id: id };
  }
  async recordDecision(value) { this.decisions.push({ ...value }); }
  async loadScreen() { return null; }
  async resolvePackage() { return null; }
  async hasHallAudienceInventory() { return false; }
  async resolveMembershipReview() {
    return { membership_review: { exists: false, state: "none", authoritative: true }, source_state: "none" };
  }
}

function environment() {
  return {
    LINE_LOGIN_CHANNEL_ID: "2000000000",
    LINE_DASHBOARD_CHANNEL_ID: "2010862595",
    LIFF_SESSION_SECRET: "stable-session-test-secret-12345678901234567890",
    MEMBER_STATUS_RESOLVER_SECRET: "member-resolver-test-secret-12345678901234567890",
    LIFF_IDENTITY_KV: new MemoryKv(),
    LIFF_GATEWAY_STORE: new MemoryGatewayStore(),
    MEMBER_STATUS_RESOLVER: {
      async fetch(request) {
        const body = await request.json();
        assert.equal(body.line_user_id, LINE_ID);
        return Response.json({
          ok: true,
          data: {
            member_exists: true,
            member_id: "MMD-STABLE-001",
            profile: {
              display_name: "Stable Member",
              tier: "Premium",
              membership_status: "active",
              points: 0,
              points_records_count: 0,
              history: [],
            },
          },
        });
      },
    },
  };
}

function enableLineVerify() {
  globalThis.fetch = async (_url, init) => {
    const params = new URLSearchParams(init.body);
    const clientId = params.get("client_id");
    return Response.json({
      sub: LINE_ID,
      aud: clientId,
      exp: Math.floor(Date.now() / 1000) + 600,
    });
  };
}

function cookieFrom(response) {
  const raw = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie().find((item) => item.startsWith("__Host-mmd_liff_session=")) || ""
    : response.headers.get("set-cookie") || "";
  return raw.split(";", 1)[0];
}

async function call(runtime, path, { method = "GET", cookie = "", body } = {}) {
  const headers = { origin: "https://mmdbkk.com" };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return worker.fetch(new Request(`https://mmdbkk.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), runtime);
}

test("stale concurrent GET may reuse the previous token briefly, but writes stay fail-closed", async () => {
  const runtime = environment();
  enableLineVerify();

  const started = await call(runtime, "/member/api/liff/start", {
    method: "POST",
    body: { id_token: "valid", liff_intent: "status" },
  });
  assert.equal(started.status, 200);
  const originalCookie = cookieFrom(started);
  assert.match(originalCookie, /^__Host-mmd_liff_session=/);

  const firstRead = await call(runtime, "/member/api/liff/status", { cookie: originalCookie });
  assert.equal(firstRead.status, 200);
  assert.equal(firstRead.headers.get("x-mmd-liff-session-overlap"), "read-only-30s-v1");
  const currentCookie = cookieFrom(firstRead);
  assert.match(currentCookie, /^__Host-mmd_liff_session=/);
  assert.notEqual(currentCookie, originalCookie);

  // Simulates a sibling My MMD read that left the browser with the same
  // pre-rotation cookie. It must not become a false sign-out / SessionGate.
  const staleSiblingRead = await call(runtime, "/member/api/liff/status", { cookie: originalCookie });
  assert.equal(staleSiblingRead.status, 200);
  assert.equal(staleSiblingRead.headers.get("x-mmd-liff-session-overlap"), "read-only-30s-v1");

  // The overlap is read-only. A stale browser token cannot mutate LIFF state.
  const staleWrite = await call(runtime, "/member/api/liff/intent", {
    method: "POST",
    cookie: originalCookie,
    body: { intent: "booking_request" },
  });
  assert.equal(staleWrite.status, 401);
  const staleWritePayload = await staleWrite.json();
  assert.equal(staleWritePayload.error.code, "LIFF_SESSION_INVALID");
  assert.equal(staleWrite.headers.get("x-mmd-liff-session-overlap"), "stale-write-rejected-v1");

  // The current rotated cookie remains fully usable.
  const currentRead = await call(runtime, "/member/api/liff/status", { cookie: currentCookie });
  assert.equal(currentRead.status, 200);
});
