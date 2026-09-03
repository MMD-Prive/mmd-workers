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
    session_id: "session_find_001",
    member_exists: true,
    member_id: "member_001",
    member_profile: {
      customer_360: {
        member: { display_name: "Member Test" },
      },
    },
    expires_at: Date.now() + 60_000,
    rotation: 0,
    ...session,
  }));
  return {
    token,
    env: {
      LIFF_SESSION_SECRET: secret,
      LIFF_IDENTITY_KV: kv,
      SIGIL_BOOKING_WORKER: { fetch: handler },
    },
  };
}

function browserRequest(path, token, body) {
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

function validFindBody(overrides = {}) {
  return {
    service_intent: "travel",
    model_preference: "Kenji",
    request_note: "อยากได้คนคุยง่าย สบาย ๆ",
    preferred_date: "2026-09-20",
    preferred_time: "19:30",
    area: "Sathorn",
    duration: "half_day",
    source: "find-your-mmd",
    promo: "",
    code: "",
    ...overrides,
  };
}

describe("Find Your MMD member API", () => {
  it("resolves the verified member then creates a canonical booking draft", async () => {
    const seen = [];
    const { token, env } = await memberEnv(async (upstream) => {
      const url = new URL(upstream.url);
      const body = await upstream.json();
      seen.push({ path: url.pathname, body });

      if (url.pathname === "/sigil/api/client/resolve") {
        return Response.json({
          ok: true,
          booking_ref: body.booking_ref,
          session_id: body.session_id,
          member_status: "active",
          access_scope: "public_private",
          can_search_private_models: true,
        });
      }
      if (url.pathname === "/sigil/api/booking/intake") {
        return Response.json({
          ok: true,
          record_id: "recSHOULDNOTLEAK01",
          booking_ref: body.booking_ref,
          session_id: body.session_id,
          telegram_notify: { ok: true },
        });
      }
      return Response.json({ ok: false }, { status: 404 });
    });

    const response = await worker.fetch(browserRequest("/member/api/liff/requests", token, validFindBody()), env);
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.ok, true);
    assert.match(payload.request_ref, /^mmdreq_[a-f0-9]{32}$/);
    assert.equal(payload.request_id, payload.request_ref);
    assert.equal(payload.status, "draft");
    assert.equal(payload.access_scope, "public_private");
    assert.equal(Object.hasOwn(payload, "record_id"), false);
    assert.match(response.headers.get("set-cookie") || "", /__Host-mmd_liff_session=/);

    assert.equal(seen.length, 2);
    assert.equal(seen[0].path, "/sigil/api/client/resolve");
    assert.equal(seen[0].body.line_or_member_id, "member_001");
    assert.equal(seen[0].body.client_nickname, "Member Test");
    assert.equal(seen[1].path, "/sigil/api/booking/intake");
    assert.equal(seen[1].body.booking_ref, seen[0].body.booking_ref);
    assert.equal(seen[1].body.session_id, seen[0].body.session_id);
    assert.equal(seen[1].body.line_or_member_id, "member_001");
    assert.equal(seen[1].body.model_search_query, "Kenji");
    assert.equal(seen[1].body.preferred_date, "2026-09-20");
    assert.equal(seen[1].body.preferred_time, "19:30");
    assert.equal(seen[1].body.city, "Sathorn");
    assert.equal(seen[1].body.next_url, "https://mmdbkk.com/member/requests");
    assert.match(seen[1].body.client_notes, /Sathorn/);
  });

  it("maps a Private Request into the review lane without trusting browser entitlement claims", async () => {
    let intake;
    const { token, env } = await memberEnv(async (upstream) => {
      const url = new URL(upstream.url);
      const body = await upstream.json();
      if (url.pathname === "/sigil/api/client/resolve") {
        return Response.json({
          ok: true,
          booking_ref: body.booking_ref,
          session_id: body.session_id,
          member_status: "expired",
          access_scope: "public_only",
          can_search_private_models: false,
        });
      }
      intake = body;
      return Response.json({ ok: true, booking_ref: body.booking_ref, session_id: body.session_id });
    });

    const response = await worker.fetch(browserRequest("/member/api/liff/requests", token, validFindBody({ service_intent: "private" })), env);

    assert.equal(response.status, 201);
    assert.equal(intake.lane, "private");
    assert.equal(intake.job_class, "private_review");
    assert.equal(intake.private_allowed, false);
    assert.equal(intake.access_scope, "public_only");
  });

  it("rejects browser-supplied member identity before calling an upstream", async () => {
    let calls = 0;
    const { token, env } = await memberEnv(async () => {
      calls += 1;
      return Response.json({ ok: true });
    });

    const response = await worker.fetch(browserRequest("/member/api/liff/requests", token, validFindBody({ member_id: "spoofed_member" })), env);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "BROWSER_IDENTITY_REJECTED");
    assert.equal(calls, 0);
  });

  it("requires a verified LIFF member session", async () => {
    const response = await worker.fetch(browserRequest("/member/api/liff/requests", "", validFindBody()), {
      LIFF_SESSION_SECRET: "test-only-secret-123456789",
      LIFF_IDENTITY_KV: new MemoryKv(),
      SIGIL_BOOKING_WORKER: { fetch: async () => Response.json({ ok: true }) },
    });
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error.code, "LIFF_SESSION_REQUIRED");
  });

  it("returns only public-safe model autocomplete fields", async () => {
    const { token, env } = await memberEnv(async (upstream) => {
      const url = new URL(upstream.url);
      assert.equal(url.pathname, "/sigil/api/models/search");
      assert.equal(url.searchParams.get("scope"), "public");
      assert.equal(url.searchParams.get("q"), "Kenji");
      return Response.json({
        ok: true,
        items: [{
          display_name: "Kenji",
          model_key: "kenji",
          cover_url: "https://cdn.prod.website-files.com/site/kenji.webp",
          model_id: "recPRIVATE1234567",
          model_record_id: "recPRIVATE1234567",
          r2_key: "private/key.webp",
          drive_folder_id: "drive-secret",
        }],
      });
    });

    const response = await worker.fetch(browserRequest("/member/api/liff/find/models/search?q=Kenji", token), env);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.items, [{
      display_name: "Kenji",
      model_key: "kenji",
      cover_url: "https://cdn.prod.website-files.com/site/kenji.webp",
    }]);
    assert.equal(Object.hasOwn(payload.items[0], "model_id"), false);
    assert.equal(Object.hasOwn(payload.items[0], "r2_key"), false);
    assert.equal(Object.hasOwn(payload.items[0], "drive_folder_id"), false);
  });
});