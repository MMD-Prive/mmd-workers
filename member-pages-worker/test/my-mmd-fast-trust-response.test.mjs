import test from "node:test";
import assert from "node:assert/strict";
import { applyMyMmdFastTrustResponse } from "../src/my-mmd-fast-trust-response.js";

const SECRET = "s".repeat(64);
const TOKEN = "fast-trust-session-token";
const LINE_ID = `U${"b".repeat(32)}`;

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makeEnv(rename) {
  const hash = await hmacHex(SECRET, `session:${TOKEN}`);
  return {
    LIFF_SESSION_SECRET: SECRET,
    LIFF_IDENTITY_KV: {
      async get(key, format) {
        assert.equal(format, "json");
        if (key !== `liff:session:${hash}`) return null;
        return {
          line_user_id: LINE_ID,
          member_exists: true,
          expires_at: Date.now() + 60_000,
        };
      },
    },
    AIRTABLE_API_KEY: "test",
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_HTTP: {
      async fetch() {
        return Response.json({
          records: [{ id: "recFastTrust", fields: { line_user_id: LINE_ID, line_renamed_name: rename } }],
        });
      },
    },
  };
}

function request(path) {
  return new Request(`https://mmdbkk.com${path}`, {
    method: "GET",
    headers: { cookie: `__Host-mmd_liff_session=${TOKEN}` },
  });
}

test("Fast Trust SVIP replaces new/checking dashboard state and grants access", async () => {
  const env = await makeEnv("โจ SVIP");
  const response = new Response(JSON.stringify({
    greetingName: "โจ",
    identity: { displayName: "โจ", primaryChannel: "line" },
    membership: {
      level: "unknown",
      levelVerified: false,
      status: "checking",
      access: "checking",
      lifecycle: "new",
      nextAction: { kind: "signup", label: "สมัครสมาชิก", url: "/sigil/member/membership" },
    },
    lifecycle: "new",
    nextAction: { kind: "signup", label: "สมัครสมาชิก", url: "/sigil/member/membership" },
    legacyDisplay: { displayOnly: true },
  }), { status: 200, headers: { "content-type": "application/json" } });

  const patched = await applyMyMmdFastTrustResponse(request("/api/member/app/dashboard"), response, env);
  const body = await patched.json();
  assert.equal(body.membership.level, "svip");
  assert.equal(body.membership.levelVerified, true);
  assert.equal(body.membership.status, "active");
  assert.equal(body.membership.access, "granted");
  assert.equal(body.membership.lifecycle, "active");
  assert.equal(body.lifecycle, "active");
  assert.equal(body.nextAction.kind, "care_back_wish");
  assert.equal(body.legacyDisplay, null);
  assert.equal(body.fastTrust.tierSource, "line_oa_renamed_name_fast_trust");
  assert.equal(patched.headers.get("x-mmd-fast-trust"), "true");
});

test("Fast Trust Black Card patches direct member dashboard while history remains pending", async () => {
  const env = await makeEnv("โป้ BlackCard");
  const response = Response.json({
    ok: true,
    data: {
      dashboard_state: "checking",
      data_status: "checking",
      member: {
        display_name: "โป้",
        tier: { value: null, status: "checking" },
        membership_status: { value: null, status: "checking" },
      },
      points: { value: null, status: "checking" },
      messages: [{ code: "member_checking", text: "กำลังตรวจสอบข้อมูล" }],
    },
  });

  const patched = await applyMyMmdFastTrustResponse(request("/api/member/dashboard"), response, env);
  const body = await patched.json();
  assert.equal(body.data.member.tier.value, "Black Card");
  assert.equal(body.data.member.tier.status, "verified");
  assert.equal(body.data.member.membership_status.value, "active");
  assert.equal(body.data.dashboard_state, "partial");
  assert.equal(body.data.fast_trust.history_state, "recovery_pending");
  assert.equal(body.data.messages.some((item) => item.code === "history_recovery_pending"), true);
});

test("non trusted rename leaves response unchanged", async () => {
  const env = await makeEnv("ลูกค้า Premium");
  const original = { membership: { level: "unknown", levelVerified: false, status: "checking", access: "checking" } };
  const response = Response.json(original);
  const patched = await applyMyMmdFastTrustResponse(request("/api/member/app/membership"), response, env);
  assert.deepEqual(await patched.json(), original);
  assert.equal(patched.headers.get("x-mmd-fast-trust"), null);
});
