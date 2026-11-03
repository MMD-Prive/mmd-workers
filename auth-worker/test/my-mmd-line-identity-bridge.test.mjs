import assert from "node:assert/strict";
import test from "node:test";

import worker, { recoverCanonicalMemberLineLink } from "../src/my-mmd-line-identity-bridge.js";

import currentWorker from "../src/my-mmd-runtime-index.js";

const LINE_ID = `U${"a".repeat(32)}`;

function response(records, status = 200) {
  return Response.json({ records }, { status });
}

function baseEnv(handler) {
  return {
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "MMD — Member Entitlements",
    AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "line_id",
    AIRTABLE_MEMBERS_EMAIL_FIELD: "Contact Email",
    AIRTABLE_CLIENTS_LINE_USER_ID_FIELD: "line_user_id",
    AIRTABLE_CLIENTS_EMAIL_FIELDS: "Contact Email,email",
    AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD: "line_user_id",
    AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD: "member_email",
    AIRTABLE_HTTP: { fetch: handler },
  };
}

function tableName(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[2] || "");
}

test("exact Client email remains a recovery hint and never writes the Members LINE field", async () => {
  const writes = [];
  const env = baseEnv(async (request) => {
    const url = new URL(request.url);
    const table = tableName(url);
    if (request.method === "PATCH") {
      const body = await request.json();
      writes.push({ table, record: decodeURIComponent(url.pathname.split("/").pop()), body });
      return Response.json({ id: "recMember01", fields: body.fields });
    }
    if (table === "Clients") {
      return response([{ id: "recClient01", fields: { line_user_id: LINE_ID, "Contact Email": "member@example.com" } }]);
    }
    if (table === "MMD — Member Entitlements") return response([]);
    if (table === "LINE OFC Client Import Staging") return response([]);
    if (table === "Members") {
      return response([{ id: "recMember01", fields: { "Contact Email": "member@example.com", line_id: "", "Membership Tier": "Premium" } }]);
    }
    return response([]);
  });

  const result = await recoverCanonicalMemberLineLink(env, LINE_ID);
  assert.equal(result.linked, false);
  assert.equal(result.reason, "owner_review_required");
  assert.deepEqual(writes, []);
});

test("exact canonical staging Client link does not authorize an email-derived Member link", async () => {
  const writes = [];
  let canonicalFormula = "";
  const env = baseEnv(async (request) => {
    const url = new URL(request.url);
    const table = tableName(url);
    if (request.method === "PATCH") {
      const body = await request.json();
      writes.push({ table, record: decodeURIComponent(url.pathname.split("/").pop()), body });
      return Response.json({ id: "recMemberCanonical", fields: body.fields });
    }
    if (table === "MMD — LINE OFC Client Import Staging") {
      canonicalFormula = url.searchParams.get("filterByFormula") || "";
      return response([{ id: "recCanonicalStage01", fields: {
        "LINE User ID": LINE_ID,
        "Canonical Client": ["recClientCanonical01"],
      } }]);
    }
    if (table === "Clients") {
      if (url.searchParams.get("filterByFormula")?.startsWith("RECORD_ID()")) {
        return response([{ id: "recClientCanonical01", fields: { "Contact Email": "canonical@example.com" } }]);
      }
      return response([]);
    }
    if (table === "MMD — Member Entitlements" || table === "LINE OFC Client Import Staging") return response([]);
    if (table === "Members") {
      return response([{ id: "recMemberCanonical", fields: { "Contact Email": "canonical@example.com", line_id: "" } }]);
    }
    return response([]);
  });

  const result = await recoverCanonicalMemberLineLink(env, LINE_ID);
  assert.equal(result.linked, false);
  assert.equal(result.reason, "owner_review_required");
  assert.equal(canonicalFormula, `{LINE User ID}='${LINE_ID}'`);
  assert.deepEqual(writes, []);
});

test("fails closed when canonical evidence points at different emails", async () => {
  let writes = 0;
  const env = baseEnv(async (request) => {
    const table = tableName(request.url);
    if (request.method === "PATCH") { writes += 1; return Response.json({ id: "unexpected" }); }
    if (table === "Clients") {
      return response([{ id: "recClient01", fields: { line_user_id: LINE_ID, "Contact Email": "one@example.com" } }]);
    }
    if (table === "MMD — Member Entitlements") {
      return response([{ id: "recEntitle1", fields: { line_user_id: LINE_ID, member_email: "two@example.com" } }]);
    }
    if (table === "LINE OFC Client Import Staging") return response([]);
    return response([]);
  });

  const result = await recoverCanonicalMemberLineLink(env, LINE_ID);
  assert.equal(result.linked, false);
  assert.equal(result.reason, "canonical_email_ambiguous");
  assert.equal(writes, 0);
});

test("committed exact LINE staging link does not authorize an email-derived Member link", async () => {
  const writes = [];
  const env = baseEnv(async (request) => {
    const url = new URL(request.url);
    const table = tableName(url);
    if (request.method === "PATCH") {
      const body = await request.json();
      writes.push(body);
      return Response.json({ id: "recMember02", fields: body.fields });
    }
    if (table === "Clients") {
      if (url.searchParams.get("filterByFormula")?.startsWith("RECORD_ID()")) {
        return response([{ id: "recClient02", fields: { line_user_id: LINE_ID, email: "linked@example.com" } }]);
      }
      return response([]);
    }
    if (table === "MMD — Member Entitlements") return response([]);
    if (table === "LINE OFC Client Import Staging") {
      return response([{ id: "recStage001", fields: {
        line_user_id: LINE_ID,
        match_type: "line_user_id_exact",
        decision: "link_existing_client",
        review_status: "committed",
        dry_run_only: false,
        matched_client: ["recClient02"],
      } }]);
    }
    if (table === "Members") {
      return response([{ id: "recMember02", fields: { "Contact Email": "linked@example.com", line_id: "", "Membership Status": "Expired" } }]);
    }
    return response([]);
  });

  const result = await recoverCanonicalMemberLineLink(env, LINE_ID);
  assert.equal(result.linked, false);
  assert.equal(result.reason, "owner_review_required");
  assert.deepEqual(writes, []);
});

for (const scenario of ["entitlement_member_conflict", "canonical_staging_unavailable", "members_paginated", "already_linked", "explicit_entitlement_link"]) {
  test(`${scenario}: recovery never writes or certifies a Member link`, async () => {
    const calls = [];
    const memberId = "rec" + "A".repeat(14);
    const env = baseEnv(async (request) => {
      const url = new URL(request.url);
      const table = tableName(url);
      calls.push({ method: request.method, table });
      assert.equal(request.method, "GET", "identity recovery must remain read-only");
      if (table === "Clients" || table === "LINE OFC Client Import Staging") return response([]);
      if (table === "MMD — LINE OFC Client Import Staging") {
        return response([], scenario === "canonical_staging_unavailable" ? 503 : 200);
      }
      if (table === "MMD — Member Entitlements") {
        return response([{ id: "rec" + "E".repeat(14), fields: {
          line_user_id: LINE_ID,
          member_email: "synthetic@example.test",
          member: [scenario === "explicit_entitlement_link" ? memberId : "rec" + "B".repeat(14)],
        } }]);
      }
      if (table === "Members") return Response.json({
        records: [{ id: memberId, fields: {
          "Contact Email": "synthetic@example.test",
          line_id: scenario === "already_linked" ? LINE_ID : "",
        } }],
        ...(scenario === "members_paginated" ? { offset: "unread-conflict" } : {}),
      });
      throw new Error(`unexpected table ${table}`);
    });
    const result = await recoverCanonicalMemberLineLink(env, LINE_ID);
    assert.deepEqual(result, { linked: false, reason: "owner_review_required" });
    assert.ok(calls.length > 0);
    assert.ok(calls.every(call => call.method === "GET"));
  });
}

function profileRequest() {
  return new Request("https://mmd-auth-worker.internal/__internal/member-profile/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }),
  });
}

test("unresolved profile retains its response and signals owner review without retry or write", async t => {
  let normalReads = 0;
  const payload = { ok: true, data: { member_exists: false } };
  t.mock.method(currentWorker, "fetch", async () => { normalReads++; return Response.json(payload); });
  const env = baseEnv(async request => {
    assert.equal(request.method, "GET");
    const table = tableName(request.url);
    if (table === "Clients") return response([{ id: "recClient01", fields: { line_user_id: LINE_ID, email: "synthetic@example.test" } }]);
    if (table === "Members") return response([{ id: "recMember01", fields: { "Contact Email": "synthetic@example.test" } }]);
    return response([]);
  });
  const result = await worker.fetch(profileRequest(), env, {});
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), payload);
  assert.equal(result.headers.get("x-mmd-line-identity-recovery"), "owner_review_required");
  assert.equal(result.headers.get("x-mmd-identity-authority"), "member-link-review");
  assert.equal(normalReads, 1);
});

test("normal already-resolved Member profile is preserved without recovery or writes", async t => {
  const calls = [];
  const payload = { ok: true, data: { member_exists: true, member_id: "mmd_verified", profile: { membership_status: "active" } } };
  t.mock.method(currentWorker, "fetch", async () => Response.json(payload));
  const env = baseEnv(async request => {
    calls.push({ method: request.method, table: tableName(request.url) });
    assert.equal(request.method, "GET");
    assert.equal(tableName(request.url), "MMD — LINE OFC Client Import Staging", "existing mapping must skip recovery");
    return response([]);
  });
  const result = await worker.fetch(profileRequest(), env, {});
  assert.deepEqual(await result.json(), payload);
  assert.equal(result.headers.get("x-mmd-line-identity-recovery"), null);
  assert.deepEqual(calls, [{ method: "GET", table: "MMD — LINE OFC Client Import Staging" }]);
});

test("existing Fast Trust projection remains read-only and skips Member-link recovery", async t => {
  t.mock.method(currentWorker, "fetch", async () => Response.json({ ok: true, data: { member_exists: false } }));
  const env = baseEnv(async request => {
    assert.equal(request.method, "GET");
    assert.equal(tableName(request.url), "MMD — LINE OFC Client Import Staging");
    return response([{ id: "recTrusted01", fields: { "LINE User ID": LINE_ID, "Current LINE Rename": "Synthetic VIP" } }]);
  });
  const result = await worker.fetch(profileRequest(), env, {});
  const payload = await result.json();
  assert.equal(payload.data.fast_trust, true);
  assert.equal(payload.data.profile.tier, "VIP");
  assert.match(payload.data.member_id, /^fasttrust_/);
  assert.equal(result.headers.get("x-mmd-line-identity-recovery"), null);
});
