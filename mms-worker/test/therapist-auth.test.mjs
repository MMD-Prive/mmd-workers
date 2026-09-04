import test from "node:test";
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
const AUTH_ME = `${BASE_URL}/male-massage/therapists/api/auth/me`;
const AUTH_LOGOUT = `${BASE_URL}/male-massage/therapists/api/auth/logout`;

const env = {
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
