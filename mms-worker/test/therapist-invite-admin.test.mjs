import test from "node:test";
import assert from "node:assert/strict";

import { maybeHandleTherapistAccessInvite } from "../src/therapist-invite-runtime.mjs";

const env = {
  AIRTABLE_API_TOKEN: "test-token",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_THERAPISTS_TABLE_ID: "tblTC9ZHQa4hAUwLu",
  MMS_THERAPIST_LOGIN_URL: "https://www.mmdbkk.com/male-massage/therapists/login",
};

function therapist(overrides = {}) {
  return {
    id: "recTestTherapist12345",
    fields: {
      "Therapist ID": "mmst_testtherapist0001",
      "Display Name": "Boss",
      Status: "Active",
      "Therapist Auth Status": "Unlinked",
      "LINE Subject Hash": "",
      ...overrides,
    },
  };
}

function request(body = {}) {
  return new Request("https://mms.internal/internal/mms/admin/therapists/mmst_testtherapist0001", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issue_access_invite: true, ...body }),
  });
}

function installFetchMock(record = therapist()) {
  const originalFetch = globalThis.fetch;
  let patchBody = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.airtable.com");
    if ((init.method || "GET").toUpperCase() === "PATCH") {
      patchBody = JSON.parse(String(init.body || "{}"));
      return Response.json({ ...record, fields: { ...record.fields, ...(patchBody.fields || {}) } });
    }
    return Response.json({ records: record ? [record] : [] });
  };
  return {
    restore() { globalThis.fetch = originalFetch; },
    get patchBody() { return patchBody; },
  };
}

test("admin issuer returns a one-time raw token but persists only its hash", async () => {
  const mock = installFetchMock();
  try {
    const response = await maybeHandleTherapistAccessInvite(request({ ttl_minutes: 30 }), env);
    assert.ok(response);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Cache-Control") || "", /no-store/);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.therapist.therapist_id, "mmst_testtherapist0001");
    assert.equal(payload.access_invite.one_time, true);
    assert.match(payload.access_invite.token, /^[A-Za-z0-9_-]{40,}$/);
    assert.match(payload.access_invite.login_url, /^https:\/\/www\.mmdbkk\.com\/male-massage\/therapists\/login\?invite=/);
    assert.match(mock.patchBody.fields["Therapist Access Invite Hash"], /^[a-f0-9]{64}$/);
    assert.notEqual(mock.patchBody.fields["Therapist Access Invite Hash"], payload.access_invite.token);
    assert.doesNotMatch(JSON.stringify(mock.patchBody), new RegExp(payload.access_invite.token));
    assert.equal(mock.patchBody.fields["Therapist Auth Status"], "Unlinked");
  } finally {
    mock.restore();
  }
});

test("issuer refuses inactive, suspended, revoked, or already-linked therapists", async () => {
  for (const record of [
    therapist({ Status: "Inactive" }),
    therapist({ "Therapist Auth Status": "Suspended" }),
    therapist({ "Therapist Auth Status": "Revoked" }),
    therapist({ "Therapist Auth Status": "Active", "LINE Subject Hash": "linked" }),
  ]) {
    const mock = installFetchMock(record);
    try {
      const response = await maybeHandleTherapistAccessInvite(request(), env);
      assert.ok(response);
      assert.equal(response.status, 409);
      assert.equal(mock.patchBody, null);
    } finally {
      mock.restore();
    }
  }
});

test("non-invite requests fall through to the normal runtime", async () => {
  const response = await maybeHandleTherapistAccessInvite(
    new Request("https://mms.internal/internal/mms/admin/therapists/mmst_testtherapist0001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Boss" }),
    }),
    env,
  );
  assert.equal(response, null);
});
