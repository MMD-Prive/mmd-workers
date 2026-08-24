import assert from "node:assert/strict";
import { describe, it } from "node:test";

import worker from "../src/index.js";

class MemoryKv {
  constructor() { this.values = new Map(); }
  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, String(value)); }
  async delete(key) { this.values.delete(key); }
}

async function digest(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function memberEnv(handler, session = {}) {
  const secret = "test-only-liff-session-secret-1234567890";
  const token = "a".repeat(64);
  const kv = new MemoryKv();
  const hash = await digest(secret, `session:${token}`);
  await kv.put(`liff:session:${hash}`, JSON.stringify({
    session_id: "session_mms_001",
    member_exists: true,
    member_id: "member_001",
    expires_at: Date.now() + 60_000,
    rotation: 0,
    ...session,
  }));
  return {
    token,
    env: {
      LIFF_SESSION_SECRET: secret,
      LIFF_IDENTITY_KV: kv,
      MMS_WORKER: { fetch: handler },
    },
  };
}

function request(path, token, body) {
  return new Request(`https://mmdbkk.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      accept: "application/json",
      origin: "https://mmdbkk.com",
      ...(token ? { cookie: `__Host-mmd_liff_session=${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("MMS member API facade", () => {
  it("proxies the public catalog through the service binding", async () => {
    const seen = [];
    const response = await worker.fetch(request("/member/api/liff/mms/catalog"), {
      MMS_WORKER: {
        async fetch(upstream) {
          seen.push(new URL(upstream.url));
          return Response.json({ ok: true, data: { skills: [], zones: [], max_selected_skills: 6 } });
        },
      },
    });

    assert.equal(response.status, 200);
    assert.equal(seen[0].hostname, "mms.internal");
    assert.equal(seen[0].pathname, "/mms/api/catalog");
  });

  it("requires a verified LIFF member before matching", async () => {
    const response = await worker.fetch(request("/member/api/liff/mms/match", "", {
      recipient_gender: "male",
      zone: "sukhumvit",
      skills: ["thai_massage"],
    }), { LIFF_SESSION_SECRET: "test-secret", LIFF_IDENTITY_KV: new MemoryKv() });

    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "LIFF_SESSION_REQUIRED");
  });

  it("forwards only customer-safe match criteria and rotates the session", async () => {
    let upstreamBody;
    const { token, env } = await memberEnv(async (upstream) => {
      upstreamBody = await upstream.json();
      assert.equal(new URL(upstream.url).hostname, "mms.internal");
      return Response.json({ ok: true, data: { requires_manual_coordination: false, matches: [] } });
    });
    const response = await worker.fetch(request("/member/api/liff/mms/match", token, {
      recipient_gender: "female",
      zone: "sukhumvit",
      skills: ["aroma_therapy_oil", "women_massage"],
    }), env);

    assert.equal(response.status, 200);
    assert.deepEqual(upstreamBody, {
      recipient_gender: "female",
      zone: "sukhumvit",
      skills: ["aroma_therapy_oil", "women_massage"],
    });
    assert.match(response.headers.get("set-cookie") || "", /__Host-mmd_liff_session=/);
  });

  it("injects the server-verified member reference into prebooking", async () => {
    let upstreamBody;
    const { token, env } = await memberEnv(async (upstream) => {
      upstreamBody = await upstream.json();
      return Response.json({ ok: true, prebooking: { prebooking_id: "mmspre_123" } }, { status: 201 });
    });
    const response = await worker.fetch(request("/member/api/liff/mms/prebookings", token, {
      idempotency_key: "mms-prebooking-request-001",
      recipient_gender: "male",
      zone: "sathorn_silom",
      service_date: "2026-08-30",
      service_time: "19:30",
      duration_minutes: 90,
      skills: ["thai_massage"],
      requested_therapist_ids: [],
      note: "Condominium lobby pickup",
      language: "th",
    }), env);

    assert.equal(response.status, 201);
    assert.equal(upstreamBody.member_ref, "member_001");
    assert.equal(Object.hasOwn(upstreamBody, "line_user_id"), false);
  });

  it("rejects browser-supplied member identity", async () => {
    const { token, env } = await memberEnv(async () => Response.json({ ok: true }));
    const response = await worker.fetch(request("/member/api/liff/mms/prebookings", token, {
      idempotency_key: "mms-prebooking-request-002",
      member_ref: "spoofed_member",
    }), env);

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "BROWSER_IDENTITY_REJECTED");
  });
});
