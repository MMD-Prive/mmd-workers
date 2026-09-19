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

async function makeEnv(rename, { canonicalClient = false, airtableStatus = 200 } = {}) {
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
      async fetch(request) {
        const url = new URL(request.url);
        assert.equal(decodeURIComponent(url.pathname.split("/").pop()), "MMD — LINE OFC Client Import Staging");
        assert.equal(url.searchParams.get("filterByFormula"), `{LINE User ID}='${LINE_ID}'`);
        if (airtableStatus !== 200) {
          return Response.json({ error: { type: "TEST_FAILURE" } }, { status: airtableStatus });
        }
        return Response.json({
          records: [{
            id: "recFastTrust",
            fields: {
              "LINE User ID": LINE_ID,
              "Current LINE Rename": rename,
              ...(canonicalClient ? { "Canonical Client": [{ id: "recCanonicalClient" }] } : {}),
            },
          }],
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

test("Fast Trust patches the LIFF profile so protected tiers survive safe serialization", async () => {
  const env = await makeEnv("คิว - SVIP -");
  const response = Response.json({ ok: true, data: {
    display_name: "คิว",
    tier: "Member",
    membership_status: "checking",
    customer_360: { member: { display_name: "คิว", tier: "Member", membership_status: "checking" } },
  }});
  const patched = await applyMyMmdFastTrustResponse(request("/member/api/liff/profile"), response, env);
  const body = await patched.json();
  assert.equal(body.data.tier, "SVIP");
  assert.equal(body.data.membership_status, "active");
  assert.equal(body.data.customer_360.member.tier, "SVIP");
  assert.match(body.data.membership_expires_at, /^\d{4}-\d{2}-\d{2}$/);
});

test("known canonical Client never falls through to Guest/signup while membership recovery is pending", async () => {
  const env = await makeEnv("ลูกค้า Premium", { canonicalClient: true });
  const response = Response.json({
    state: "resolved",
    membership: {
      level: "guest",
      levelVerified: false,
      status: "checking",
      access: "checking",
      lifecycle: "new",
      nextAction: { kind: "signup", label: "สมัครสมาชิก", url: "/pay/membership" },
    },
    lifecycle: "new",
    nextAction: { kind: "signup", label: "สมัครสมาชิก", url: "/pay/membership" },
  });

  const patched = await applyMyMmdFastTrustResponse(request("/api/member/app/dashboard"), response, env);
  const body = await patched.json();

  assert.equal(body.state, "checking");
  assert.equal(body.membership.level, "unknown");
  assert.equal(body.membership.levelVerified, false);
  assert.equal(body.membership.lifecycle, "checking");
  assert.equal(body.lifecycle, "checking");
  assert.equal(body.nextAction.kind, "checking");
  assert.doesNotMatch(JSON.stringify(body), /"kind":"signup"/);
  assert.equal(patched.headers.get("x-mmd-member-resolution-guard"), "known_client_resolution_pending");
});

test("Fast Trust source failure fails neutral instead of showing Guest/signup", async () => {
  const env = await makeEnv("", { airtableStatus: 422 });
  const response = Response.json({
    state: "resolved",
    membership: {
      level: "guest",
      levelVerified: false,
      status: "checking",
      access: "checking",
      lifecycle: "new",
      nextAction: { kind: "signup", label: "สมัครสมาชิก", url: "/pay/membership" },
    },
    lifecycle: "new",
    nextAction: { kind: "signup", label: "สมัครสมาชิก", url: "/pay/membership" },
  });

  const patched = await applyMyMmdFastTrustResponse(request("/api/member/app/dashboard"), response, env);
  const body = await patched.json();

  assert.equal(body.state, "checking");
  assert.equal(body.membership.level, "unknown");
  assert.equal(body.membership.lifecycle, "checking");
  assert.equal(body.nextAction.kind, "checking");
  assert.equal(patched.headers.get("x-mmd-member-resolution-guard"), "fast_trust_source_unavailable");
  assert.equal(patched.headers.get("x-mmd-fast-trust-lookup"), "unavailable");
});

test("successful lookup with no canonical Client and no protected marker may remain a real Guest/new signup", async () => {
  const env = await makeEnv("ลูกค้าใหม่");
  const original = {
    state: "resolved",
    membership: {
      level: "guest",
      levelVerified: false,
      status: "checking",
      access: "checking",
      lifecycle: "new",
      nextAction: { kind: "signup", label: "สมัครสมาชิก", url: "/pay/membership" },
    },
    lifecycle: "new",
    nextAction: { kind: "signup", label: "สมัครสมาชิก", url: "/pay/membership" },
  };
  const patched = await applyMyMmdFastTrustResponse(
    request("/api/member/app/dashboard"),
    Response.json(original),
    env,
  );
  assert.deepEqual(await patched.json(), original);
  assert.equal(patched.headers.get("x-mmd-member-resolution-guard"), null);
});

test("non trusted rename leaves response unchanged", async () => {
  const env = await makeEnv("ลูกค้า Premium");
  const original = { membership: { level: "unknown", levelVerified: false, status: "checking", access: "checking" } };
  const response = Response.json(original);
  const patched = await applyMyMmdFastTrustResponse(request("/api/member/app/membership"), response, env);
  assert.deepEqual(await patched.json(), original);
  assert.equal(patched.headers.get("x-mmd-fast-trust"), null);
});


test("Fast Trust cannot override fresh canonical grace or a blocked member", async () => {
  const env = await makeEnv("โจ SVIP");
  for (const status of ["blocked", "suspended", "revoked", "expired", "pending_review", "grace"]) {
    const original = { level: "vip", status, access: "restricted" };
    const response = Response.json(original, { headers: status === "grace" ? { "x-mmd-member-display-authority": "my_mmd_entitlement_resolver_v1" } : {} });
    const patched = await applyMyMmdFastTrustResponse(request("/api/member/app/membership"), response, env);
    assert.deepEqual(await patched.json(), original);
  }
});
