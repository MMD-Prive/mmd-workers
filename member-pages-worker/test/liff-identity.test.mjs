import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import worker from "../src/index.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

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
  constructor() { this.records = []; }
  async upsertSession(session, recordId = "") {
    const id = recordId || `rec_${this.records.length + 1}`;
    const index = this.records.findIndex((record) => record.record_id === id);
    const record = { ...session, record_id: id };
    if (index >= 0) this.records[index] = record;
    else this.records.push(record);
    return { record_id: id };
  }
  async recordDecision() {}
  async loadScreen() { return null; }
  async resolvePackage() { return null; }
  async hasHallAudienceInventory() { return false; }
}

function resolver(memberExists = false) {
  return {
    fetch: async () => new Response(JSON.stringify({ ok: true, data: { member_exists: memberExists } }), {
      headers: { "content-type": "application/json" },
    }),
  };
}

function env() {
  return {
    LINE_LOGIN_CHANNEL_ID: "2000000000",
    LIFF_SESSION_SECRET: "test-only-session-secret-not-production",
    MEMBER_STATUS_RESOLVER_SECRET: "test-only-member-status-resolver-secret-1234567890",
    LIFF_IDENTITY_KV: new MemoryKv(),
    MEMBER_STATUS_RESOLVER: resolver(),
    LIFF_GATEWAY_STORE: new MemoryGatewayStore(),
  };
}

function mockLineVerify() {
  globalThis.fetch = async () => new Response(JSON.stringify({
    sub: "Userver-verified-only",
    aud: "2000000000",
    exp: Math.floor(Date.now() / 1000) + 600,
  }), { headers: { "content-type": "application/json" } });
}

describe("LIFF identity API production entrypoint", () => {
  it("disables the browser-supplied identity bridge at the actual Worker entrypoint", async () => {
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/identify", {
      method: "POST",
      headers: { origin: "https://mmdbkk.com", "content-type": "application/json" },
      body: JSON.stringify({ line_user_id: "Uspoof", member_id: "MMD-1" }),
    }), env());
    const body = await response.json();

    assert.equal(response.status, 410);
    assert.equal(body.error.code, "LEGACY_LIFF_IDENTITY_DISABLED");
    assert.doesNotMatch(JSON.stringify(body), /Uspoof|MMD-1/);
  });

  it("routes a verified start through the real entrypoint and stores no raw LINE subject", async () => {
    const runtime = env();
    mockLineVerify();
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/start?t=opaque-entry", {
      method: "POST",
      headers: { origin: "https://mmdbkk.com", "content-type": "application/json" },
      body: JSON.stringify({ id_token: "opaque-id-token", liff_intent: "signup" }),
    }), runtime);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.next_screen_key, "audience_select");
    assert.equal(runtime.LIFF_GATEWAY_STORE.records.length, 1);
    assert.doesNotMatch(JSON.stringify(runtime.LIFF_GATEWAY_STORE.records[0]), /Userver-verified-only|opaque-id-token|opaque-entry/i);
    assert.deepEqual(body.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
  });

  it("continues to delegate existing member pages to the legacy renderer", async () => {
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/membership", { method: "GET" }), {});
    assert.equal(response.status, 301);
    assert.equal(new URL(response.headers.get("location")).pathname, "/sigil/member/membership");
  });
});
