import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { handleMedicalVerifiedRequest, MEDICAL_REQUEST_PATH } = await import("../src/medical-verified-request.js");
const SECRET = "x".repeat(40);

async function digest(value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function env(records = []) {
  const token = "medical-test-session";
  const key = `liff:session:${await digest(`session:${token}`)}`;
  const writes = [];
  const state = { records };
  return {
    value: {
      LIFF_SESSION_SECRET: SECRET,
      AIRTABLE_API_KEY: "token",
      AIRTABLE_BASE_ID: "base",
      LIFF_IDENTITY_KV: { async get(requestKey) { return requestKey === key ? { expires_at: Date.now() + 60_000, line_user_id: "U" + "a".repeat(32), member_exists: true, member_id: "member-verified-1", member_profile: { membership_status: "active" } } : null; } },
      AIRTABLE_HTTP: { async fetch(request) {
        const url = new URL(request.url);
        if (request.method === "GET") return Response.json({ records: state.records });
        const body = await request.json(); writes.push(body.records[0].fields); state.records.push({ id: "rec-medical-1", fields: body.records[0].fields }); return Response.json({ records: state.records.slice(-1) }, { status: 201 });
      } },
      __writes: writes,
      __token: token,
    },
  };
}

function request(method, body, token = "medical-test-session") {
  return new Request(`https://www.mmdbkk.com${MEDICAL_REQUEST_PATH}`, { method, headers: { origin: "https://www.mmdbkk.com", cookie: `__Host-mmd_liff_session=${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
}

const valid = { purpose: "non_clinical_presence", preferred_date: "2026-10-01", time_window: "afternoon", area: "Bangkok", model_preference: "Verified model", acknowledgements: ["not_emergency", "no_diagnosis_or_treatment", "mmd_review_required"] };

test("medical verified request is identity-gated and only creates a review request", async () => {
  const fixture = await env();
  const response = await handleMedicalVerifiedRequest(request("POST", valid), fixture.value);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.state, "pending_mmd_scope_review");
  assert.equal(body.booking_created, false);
  assert.equal(body.payment_required, false);
  assert.equal(fixture.value.__writes.length, 1);
  const fields = fixture.value.__writes[0];
  assert.equal(fields["Request Status"], "review_required");
  assert.equal(fields["Contact Value"], undefined);
  assert.match(fields["Raw Safety Note"], /No diagnosis/);
  assert.match(fields.resolver_payload_json, /verified_customer_ref_hash/);
  assert.doesNotMatch(fields.resolver_payload_json, /Uaaaaaaaa/);
});

test("medical verified request rejects unverified sessions and free-form medical data", async () => {
  const fixture = await env();
  const unauthenticated = await handleMedicalVerifiedRequest(request("GET", null, "not-a-session"), fixture.value);
  assert.equal(unauthenticated.status, 401);
  const unsafe = await handleMedicalVerifiedRequest(request("POST", { ...valid, symptoms: "sensitive" }), fixture.value);
  assert.equal(unsafe.status, 400);
  assert.equal(fixture.value.__writes.length, 0);
});

test("medical verified request is idempotent for the same verified structured brief", async () => {
  const fixture = await env();
  const first = await handleMedicalVerifiedRequest(request("POST", valid), fixture.value);
  const second = await handleMedicalVerifiedRequest(request("POST", valid), fixture.value);
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).idempotent, true);
  assert.equal(fixture.value.__writes.length, 1);
});
