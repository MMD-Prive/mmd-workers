import test from "node:test";
import { createHash, createHmac, generateKeyPairSync, sign } from "node:crypto";
import { requireMyMmsApprovedTherapist } from "../src/my-mms-access-runtime.mjs";
import { handleMmsTherapistProfileRequest } from "../src/therapist-profile-runtime.mjs";
import assert from "node:assert/strict";

import {
  handleMmsTherapistAuthRequest,
  isMmsTherapistAuthRequest,
  therapistAuthContract,
  therapistAuthErrorResponse,
} from "../src/therapist-auth-runtime.mjs";

const ORIGIN = "https://www.mmdbkk.com";
const CHANNEL_ID = "2011999999";
const BASE_URL = "https://www.mmdbkk.com";
const AUTH_LINE = `${BASE_URL}/male-massage/therapists/api/auth/line`;
const AUTH_TELEGRAM = `${BASE_URL}/male-massage/therapists/api/auth/telegram`;
const AUTH_ME = `${BASE_URL}/male-massage/therapists/api/auth/me`;
const AUTH_LOGOUT = `${BASE_URL}/male-massage/therapists/api/auth/logout`;

const env = {
  MMS_PRIVATE_UPLOADS: { get() {}, put() {} },
  MMS_THERAPIST_AUTH_ENABLED: "true",
  MMS_THERAPIST_LINE_CHANNEL_ID: CHANNEL_ID,
  MMS_THERAPIST_SESSION_SECRET: "session-secret-for-tests-1234567890-abcdef",
  MMS_THERAPIST_IDENTITY_PEPPER: "identity-pepper-for-tests-123456789-abcdef",
  AIRTABLE_API_TOKEN: "test-airtable-token",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_THERAPISTS_TABLE_ID: "tblTC9ZHQa4hAUwLu",
  ALLOWED_ORIGINS: `${ORIGIN},https://mmdbkk.com`,
};

function activeTherapist(overrides = {}) {
  return {
    id: "recTestTherapist12345",
    fields: {
      "Therapist ID": "mmst_testtherapist0001",
      "Display Name": "Test Therapist",
      "Availability Status": "Available",
      Status: "Active",
      "Therapist Auth Status": "Active",
      "LINE Subject Hash": "server-side-hash-only",
      ...overrides,
    },
  };
}

function linePayload(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "https://access.line.me",
    sub: "U1234567890abcdef1234567890abcdef",
    aud: CHANNEL_ID,
    exp: now + 600,
    iat: now - 5,
    name: "Must Not Be Trusted Or Persisted",
    ...overrides,
  };
}

function jsonRequest(url, body, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function call(request, runtimeEnv = env) {
  try {
    return await handleMmsTherapistAuthRequest(request, runtimeEnv);
  } catch (error) {
    return therapistAuthErrorResponse(error, request, runtimeEnv);
  }
}

function installFetchMock({
  verify = linePayload(),
  subjectRecords = [activeTherapist()],
  inviteRecords = [],
  therapistRecords = [activeTherapist()],
  updatedRecord = activeTherapist(),
  onPatch = null,
} = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin === "https://api.line.me") {
      assert.equal(url.pathname, "/oauth2/v2.1/verify");
      assert.equal(init.method, "POST");
      const params = new URLSearchParams(String(init.body || ""));
      assert.equal(params.get("client_id"), CHANNEL_ID);
      assert.ok(params.get("id_token"));
      return Response.json(verify);
    }

    assert.equal(url.origin, "https://api.airtable.com");
    assert.match(String(init.headers?.Authorization || ""), /^Bearer /);

    if (String(init.method || "GET").toUpperCase() === "PATCH") {
      const body = JSON.parse(String(init.body || "{}"));
      if (onPatch) onPatch(body);
      return Response.json({ ...updatedRecord, fields: { ...updatedRecord.fields, ...(body.fields || {}) } });
    }

    const formula = url.searchParams.get("filterByFormula") || "";
    if (formula.includes("LINE Subject Hash")) return Response.json({ records: subjectRecords });
    if (formula.includes("Therapist Access Invite Hash")) return Response.json({ records: inviteRecords });
    if (formula.includes("Therapist ID")) return Response.json({ records: therapistRecords });
    throw new Error(`unexpected Airtable formula: ${formula}`);
  };
  return () => { globalThis.fetch = originalFetch; };
}

function cookieFrom(response) {
  const setCookie = response.headers.get("Set-Cookie") || "";
  const pair = setCookie.split(";")[0];
  assert.match(pair, /^__Secure-mms_therapist_session=/);
  return pair;
}

test("recognizes only the dedicated MMS Therapist auth paths", () => {
  assert.equal(isMmsTherapistAuthRequest("/male-massage/therapists/api/auth/line"), true);
  assert.equal(isMmsTherapistAuthRequest(new URL(AUTH_TELEGRAM).pathname), true);
  assert.equal(isMmsTherapistAuthRequest("/male-massage/therapists/api/auth/me"), true);
  assert.equal(isMmsTherapistAuthRequest("/male-massage/therapists/api/auth/logout"), true);
  assert.equal(isMmsTherapistAuthRequest("/member/api/liff/start"), false);
  assert.equal(therapistAuthContract.session.role, "mms_therapist");
});

test("auth is disabled by default and fails closed", async () => {
  const response = await call(jsonRequest(AUTH_LINE, { id_token: "token" }), {
    ...env,
    MMS_THERAPIST_AUTH_ENABLED: "false",
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "THERAPIST_AUTH_NOT_ENABLED");
});

test("rejects browser login from an untrusted origin", async () => {
  const request = jsonRequest(AUTH_LINE, { id_token: "token" }, { Origin: "https://evil.example" });
  const response = await call(request);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "ORIGIN_NOT_ALLOWED");
});

test("server verifies LINE ID token audience and never trusts client profile data", async () => {
  const restore = installFetchMock({ verify: linePayload({ aud: "9999999999" }) });
  try {
    const response = await call(jsonRequest(AUTH_LINE, {
      id_token: "header.payload.signature",
      line_user_id: "attacker-controlled",
      display_name: "attacker-controlled",
    }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "LINE_ID_TOKEN_INVALID");
  } finally {
    restore();
  }
});

test("unlinked LINE identity requires explicit linking instead of matching application LINE handle", async () => {
  const restore = installFetchMock({ subjectRecords: [] });
  try {
    const response = await call(jsonRequest(AUTH_LINE, {
      id_token: "header.payload.signature",
      application_line_handle: "untrusted-handle",
    }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "THERAPIST_LINK_REQUIRED");
  } finally {
    restore();
  }
});

test("valid linked Active therapist gets a role-scoped secure cookie and safe profile only", async () => {
  let patchBody = null;
  const restore = installFetchMock({ onPatch: (body) => { patchBody = body; } });
  try {
    const rawIdToken = "header.payload.signature";
    const response = await call(jsonRequest(AUTH_LINE, { id_token: rawIdToken }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.data, {
      therapist_id: "mmst_testtherapist0001",
      display_name: "Test Therapist",
      availability_status: "Available",
      role: "mms_therapist",
      next_route: "/male-massage/therapists/me",
    });

    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /U1234567890abcdef|header\.payload|test-airtable-token|server-side-hash-only/);
    const cookie = response.headers.get("Set-Cookie") || "";
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\/male-massage\/therapists/);
    assert.match(cookie, /Max-Age=28800/);
    assert.ok(patchBody?.fields?.["Therapist Access Last Login At"]);
    assert.doesNotMatch(JSON.stringify(patchBody), /U1234567890abcdef|header\.payload/);
  } finally {
    restore();
  }
});

test("one-time invite binds only the verified LINE subject hash and consumes the invite", async () => {
  const invite = "random-256-bit-style-invite-token-for-test-only";
  const unlinked = activeTherapist({
    "Therapist Auth Status": "Unlinked",
    "LINE Subject Hash": "",
    "Therapist Access Invite Hash": "server-computed-invite-hash",
    "Therapist Access Invite Expires At": new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  let patchBody = null;
  const restore = installFetchMock({
    subjectRecords: [],
    inviteRecords: [unlinked],
    updatedRecord: activeTherapist(),
    onPatch: (body) => { patchBody = body; },
  });

  try {
    const response = await call(jsonRequest(AUTH_LINE, {
      id_token: "header.payload.signature",
      invite_token: invite,
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.role, "mms_therapist");
    assert.equal(patchBody.fields["Therapist Auth Status"], "Active");
    assert.equal(patchBody.fields["Therapist Access Invite Hash"], null);
    assert.equal(patchBody.fields["Therapist Access Invite Expires At"], null);
    assert.match(patchBody.fields["LINE Subject Hash"], /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(patchBody), new RegExp(invite));
    assert.doesNotMatch(JSON.stringify(patchBody), /U1234567890abcdef/);
  } finally {
    restore();
  }
});

test("session /me revalidates canonical therapist status and blocks inactive therapists", async () => {
  let restore = installFetchMock();
  let cookie;
  try {
    const login = await call(jsonRequest(AUTH_LINE, { id_token: "header.payload.signature" }));
    assert.equal(login.status, 200);
    cookie = cookieFrom(login);
  } finally {
    restore();
  }

  restore = installFetchMock({ therapistRecords: [activeTherapist({ Status: "Inactive" })] });
  try {
    const response = await call(new Request(AUTH_ME, { headers: { Cookie: cookie } }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "THERAPIST_ACCESS_DENIED");
  } finally {
    restore();
  }
});

test("customer or member shaped session cannot open Therapist auth", async () => {
  const fakeMemberCookie = "__Secure-mms_therapist_session=v1.eyJyb2xlIjoibW1kX21lbWJlciJ9.deadbeef";
  const response = await call(new Request(AUTH_ME, { headers: { Cookie: fakeMemberCookie } }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "THERAPIST_SESSION_INVALID");
});

test("logout clears the Therapist cookie at the Therapist path", async () => {
  const response = await call(new Request(AUTH_LOGOUT, {
    method: "POST",
    headers: { Origin: ORIGIN },
  }));
  assert.equal(response.status, 204);
  const cookie = response.headers.get("Set-Cookie") || "";
  assert.match(cookie, /^__Secure-mms_therapist_session=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Path=\/male-massage\/therapists/);
});

test("issued session rejects a changed LINE link in auth, app and profile; newly logged-in account works", async () => {
  let restore = installFetchMock();
  let cookie;
  try {
    const login = await call(jsonRequest(AUTH_LINE, { id_token: "fixture-token" }));
    assert.equal(login.status, 200);
    cookie = cookieFrom(login);
    assert.equal((await call(new Request(AUTH_ME, { headers: { Cookie: cookie } }))).status, 200);
  } finally { restore(); }

  const changed = activeTherapist({ "LINE Subject Hash": "replacement-account-hash", "MY MMS Access": "Approved" });
  restore = installFetchMock({ therapistRecords: [changed], updatedRecord: changed, subjectRecords: [changed] });
  try {
    const request = new Request(AUTH_ME, { headers: { Cookie: cookie } });
    assert.equal((await call(request)).status, 401);
    await assert.rejects(requireMyMmsApprovedTherapist(request, env), e => e.code === "THERAPIST_SESSION_INVALID");
    await assert.rejects(handleMmsTherapistProfileRequest(new Request(BASE_URL + "/male-massage/therapists/api/auth/profile", { headers: { Cookie: cookie } }), env), e => e.code === "THERAPIST_SESSION_INVALID");
    const login = await call(jsonRequest(AUTH_LINE, { id_token: "replacement-fixture-token" }));
    const freshRequest = new Request(AUTH_ME, { headers: { Cookie: cookieFrom(login) } });
    assert.equal((await call(freshRequest)).status, 200);
    assert.equal((await requireMyMmsApprovedTherapist(freshRequest, env)).fields["Therapist ID"], changed.fields["Therapist ID"]);
  } finally { restore(); }
});

test("legacy signed session without LINE binding requires login again across all private surfaces", async () => {
  const now = Math.floor(Date.now() / 1000);
  const encoded = Buffer.from(JSON.stringify({ v: 1, role: "mms_therapist", therapist_id: "mmst_testtherapist0001", iat: now, exp: now + 600 })).toString("base64url");
  const signature = createHmac("sha256", env.MMS_THERAPIST_SESSION_SECRET).update("mms-therapist-session-v1." + encoded).digest("hex");
  const Cookie = "__Secure-mms_therapist_session=v1." + encoded + "." + signature;
  const restore = installFetchMock();
  try {
    const request = new Request(AUTH_ME, { headers: { Cookie } });
    assert.equal((await call(request)).status, 401);
    await assert.rejects(requireMyMmsApprovedTherapist(request, env), e => e.code === "THERAPIST_SESSION_INVALID");
    await assert.rejects(handleMmsTherapistProfileRequest(new Request(BASE_URL + "/male-massage/therapists/api/auth/profile", { headers: { Cookie } }), env), e => e.code === "THERAPIST_SESSION_INVALID");
  } finally { restore(); }
});

test("revoked or unlinked Therapist cannot use an otherwise valid bound session", async () => {
  let restore = installFetchMock();
  let Cookie;
  try { Cookie = cookieFrom(await call(jsonRequest(AUTH_LINE, { id_token: "fixture-token" }))); }
  finally { restore(); }
  for (const fields of [{ "Therapist Auth Status": "Revoked" }, { "LINE Subject Hash": "" }]) {
    restore = installFetchMock({ therapistRecords: [activeTherapist(fields)] });
    try {
      const request = new Request(AUTH_ME, { headers: { Cookie } });
      assert.equal((await call(request)).status, 403);
      await assert.rejects(requireMyMmsApprovedTherapist(request, env), e => e.code === "THERAPIST_ACCESS_DENIED");
      await assert.rejects(handleMmsTherapistProfileRequest(new Request(BASE_URL + "/male-massage/therapists/api/auth/profile", { headers: { Cookie } }), env), e => e.code === "THERAPIST_ACCESS_DENIED");
    } finally { restore(); }
  }
});

for(const status of [429,500,503])test(`LINE verifier ${status} is unavailable, not an invalid identity`,async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;assert.equal(new URL(String(input)).origin,'https://api.line.me');assert.ok(init.signal);return new Response('',{status});};
 try{const req=jsonRequest(AUTH_LINE,{id_token:'synthetic-fixture'});let response;try{response=await handleMmsTherapistAuthRequest(req,env);}catch(e){response=therapistAuthErrorResponse(e,req,env);}assert.equal(response.status,503);assert.equal((await response.json()).error.code,'LINE_VERIFY_UNAVAILABLE');assert.equal(calls,1);assert.equal(response.headers.get('set-cookie'),null);}finally{globalThis.fetch=original;}
});

test("Telegram gates the session, preserves unused invites, and binds private access to the same account", async (t) => {
  const runtimeEnv = {
    ...env,
    MMS_THERAPIST_TELEGRAM_REQUIRED: "true",
    MMS_THERAPIST_TELEGRAM_CLIENT_ID: "123456789",
    MMS_THERAPIST_TELEGRAM_CLIENT_SECRET: "fixture-only",
  };
  const telegramId = 987654321;
  const line = linePayload();
  const lineHash = createHmac("sha256", env.MMS_THERAPIST_IDENTITY_PEPPER)
    .update(["mms-therapist-line-v1", CHANNEL_ID, line.sub].join("\0")).digest("hex");
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "telegram-fixture", alg: "RS256", use: "sig" };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  let record = activeTherapist({
    "Therapist Auth Status": "Unlinked",
    "LINE Subject Hash": "",
    "Therapist Access Invite Expires At": new Date(Date.now() + 600_000).toISOString(),
    "Therapist Telegram User ID": String(telegramId),
    "MY MMS Access": "Approved",
  });
  let patchCount = 0, tokenCalls = 0, duplicate = false, corruptSignature = false;
  let telegramClaims = {};
  let authorizationUrl;
  const spent = new Set();
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin === "https://api.line.me") return Response.json(line);
    if (url.href === "https://oauth.telegram.org/token") {
      tokenCalls += 1;
      assert.equal(init.redirect, "error");
      const form = new URLSearchParams(init.body);
      assert.equal(form.get("redirect_uri"), AUTH_TELEGRAM);
      assert.equal(createHash("sha256").update(form.get("code_verifier")).digest("base64url"),
        authorizationUrl.searchParams.get("code_challenge"));
      const code = form.get("code");
      if (spent.has(code)) return Response.json({ error: "invalid_grant" }, { status: 400 });
      spent.add(code);
      const now = Math.floor(Date.now() / 1000);
      const payload = encode({
        iss: url.origin, aud: runtimeEnv.MMS_THERAPIST_TELEGRAM_CLIENT_ID,
        sub: "fixture-subject", id: telegramId, iat: now, exp: now + 300, ...telegramClaims,
      });
      const signed = encode({ alg: "RS256", kid: jwk.kid }) + "." + payload;
      const signature = sign("sha256", Buffer.from(corruptSignature ? signed + "tampered" : signed), privateKey);
      return Response.json({ id_token: signed + "." + signature.toString("base64url") });
    }
    if (url.href === "https://oauth.telegram.org/.well-known/jwks.json") return Response.json({ keys: [jwk] });
    assert.equal(url.origin, "https://api.airtable.com");
    if (init.method === "PATCH") {
      patchCount += 1;
      record = { ...record, fields: { ...record.fields, ...JSON.parse(init.body).fields } };
      return Response.json(record);
    }
    const formula = url.searchParams.get("filterByFormula");
    if (formula.includes("LINE Subject Hash")) return Response.json({ records: record.fields["LINE Subject Hash"] ? [record] : [] });
    if (formula.includes("Therapist Access Invite Hash")) return Response.json({ records: record.fields["LINE Subject Hash"] ? [] : [record] });
    if (formula.includes("Therapist Telegram User ID")) {
      return Response.json({ records: duplicate ? [record, { ...record, id: "recDuplicateTherapist" }] : [record] });
    }
    assert.ok(formula.includes("Therapist ID"));
    return Response.json({ records: [record] });
  };

  const start = async () => {
    const response = await call(jsonRequest(AUTH_LINE, { id_token: "line-fixture", invite_token: "invite-fixture" }), runtimeEnv);
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.deepEqual(Object.keys(data).sort(), ["authorization_url", "telegram_required"]);
    assert.equal(data.telegram_required, true);
    authorizationUrl = new URL(data.authorization_url);
    assert.equal(authorizationUrl.origin + authorizationUrl.pathname, "https://oauth.telegram.org/auth");
    assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
    const cookie = response.headers.get("set-cookie");
    assert.match(cookie, /^__Host-mms_therapist_telegram=.+; Path=\/; Max-Age=300; HttpOnly; Secure; SameSite=Lax$/);
    return { cookie: cookie.split(";")[0], state: authorizationUrl.searchParams.get("state") };
  };
  const finish = (flow, extra) => call(new Request(AUTH_TELEGRAM + "?" + new URLSearchParams({ state: flow.state, ...extra }), {
    headers: flow.cookie ? { Cookie: flow.cookie } : {},
  }), runtimeEnv);
  const assertDenied = (response, reason) => {
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/male-massage/therapists/login?telegram_verification=" + reason);
    assert.doesNotMatch(response.headers.get("set-cookie") || "", /mms_therapist_session=/);
  };
  const assertPrivateDenied = async (Cookie) => {
    const req = new Request(AUTH_ME, { headers: { Cookie } });
    assert.equal((await call(req, runtimeEnv)).status, 401);
    await assert.rejects(requireMyMmsApprovedTherapist(req, runtimeEnv), e => e.code === "THERAPIST_SESSION_INVALID");
    await assert.rejects(handleMmsTherapistProfileRequest(new Request(BASE_URL + "/male-massage/therapists/api/auth/profile", { headers: { Cookie } }), runtimeEnv), e => e.code === "THERAPIST_SESSION_INVALID");
  };

  const first = await start();
  assert.equal((await call(new Request(AUTH_ME, { headers: { Cookie: first.cookie } }), runtimeEnv)).status, 401);
  assertDenied(await finish({ ...first, cookie: "" }, { code: "no-cookie" }), "expired");
  assertDenied(await finish({ ...first, state: "wrong-state" }, { code: "wrong-state" }), "expired");
  assertDenied(await finish(first, { error: "access_denied" }), "cancelled");
  assert.equal(tokenCalls, 0);

  telegramClaims = { id: telegramId + 1 };
  assertDenied(await finish(await start(), { code: "wrong-account" }), "account");
  telegramClaims = { aud: "wrong-client" };
  assertDenied(await finish(await start(), { code: "wrong-audience" }), "expired");
  telegramClaims = {};
  corruptSignature = true;
  assertDenied(await finish(await start(), { code: "wrong-signature" }), "expired");
  corruptSignature = false;
  duplicate = true;
  assertDenied(await finish(await start(), { code: "duplicate-link" }), "account");
  duplicate = false;
  assert.equal(patchCount, 0);

  const flow = await start();
  const response = await finish(flow, { code: "correct-account" });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/male-massage/therapists/app");
  assert.equal(response.headers.getSetCookie().length, 2);
  const Cookie = response.headers.getSetCookie().find(cookie => cookie.startsWith("__Secure-mms_therapist_session=")).split(";")[0];
  assert.equal(record.fields["LINE Subject Hash"], lineHash);
  assert.equal(record.fields["Therapist Access Invite Hash"], null);
  assert.equal(patchCount, 1);
  assertDenied(await finish(flow, { code: "correct-account" }), "expired");
  assert.equal(patchCount, 1);

  const request = new Request(AUTH_ME, { headers: { Cookie } });
  const me = await call(request, runtimeEnv);
  assert.equal(me.status, 200);
  assert.doesNotMatch(await me.text(), new RegExp(String(telegramId)));
  assert.equal((await requireMyMmsApprovedTherapist(request, runtimeEnv)).id, record.id);
  const legacy = await call(jsonRequest(AUTH_LINE, { id_token: "line-fixture" }), env);
  await assertPrivateDenied(cookieFrom(legacy));
  record.fields["Therapist Telegram User ID"] = String(telegramId + 1);
  await assertPrivateDenied(Cookie);
});
