import assert from "node:assert/strict";
import test from "node:test";

import {
  enrichLineageWithPreSessionIndex,
  PRE_SESSION_CLIENT_INDEX_VERSION,
  resolveHistoricalSessionAlias,
  toCandidateRecord,
} from "./src/pre-session-client-index.js";

const env = {
  AIRTABLE_API_KEY: "airtable-test",
  AIRTABLE_BASE_ID: "base-test",
  AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID: "pre_session",
};

function lookupRequest(query) {
  return new Request("https://admin-worker.internal/v1/admin/clients/lineage-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
}

function manualFallbackResponse(query) {
  return new Response(JSON.stringify({
    ok: true,
    source: "canonical_client_lineage",
    authority: "airtable_operational_records",
    entitlement_policy: "display_snapshot_only_backend_rechecks",
    records: [{
      client_id: "",
      client_name: query,
      membership_status: "guest_public_only",
      identity_status: "pending_reconcile",
      manual_public_only: true,
      lineage_source: "owner_manual_name_pending_reconcile",
      entitlement_snapshot_source: "none",
    }],
    count: 1,
    lineage_warnings: ["manual_public_only_pending_reconcile"],
    manual_fallback: true,
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-MMD-Client-Lineage": "canonical-v3-remembered-name-first",
    },
  });
}

function installAirtableMock(records, { status = 200 } = {}) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    calls.push(url);
    return new Response(JSON.stringify(status === 200 ? { records } : { error: "fixture_failure" }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return () => {
    globalThis.fetch = original;
    return calls;
  };
}

const seedCandidate = {
  id: "recIndex1",
  fields: {
    identity_key: "identity_seed:recSeed1",
    source_type: "identity_seed",
    source_record_id: "recSeed1",
    identity_email: "known@example.com",
    preferred_name: "",
    line_user_id: "",
    line_display_name: "",
    linked_client: [],
    resolution_status: "candidate",
    session_lookup_status: "searchable_candidate",
    confidence: "low",
    candidate_only: true,
    current_rights_source: "my_mmd_entitlement_resolver_v1",
  },
};

test("linked historical session alias resolves to its canonical Client", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    calls.push(url);
    if (decodeURIComponent(url.pathname).endsWith("/tblC98mKWbzmPuNzX")) {
      return new Response(JSON.stringify({ records: [{
        id: "recSession1",
        fields: {
          fldMvnQ0BzDfHUYjT: "หนุ่ม 22 พค 69",
          fld6P6if0vDZCeV0C: ["recBfl0cQacqLpUz6"],
        },
      }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (decodeURIComponent(url.pathname).endsWith("/tblVv58TCbwh5j1fS/recBfl0cQacqLpUz6")) {
      return new Response(JSON.stringify({
        id: "recBfl0cQacqLpUz6",
        fields: {
          "Client Name": "Wathiwut",
          nickname: "หนุ่ม",
          line_user_id: "U72db171bb69abd511645c83d0c5ea9d6",
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected Airtable call ${url}`);
  };
  try {
    const response = await enrichLineageWithPreSessionIndex(
      lookupRequest("หนุ่ม"),
      manualFallbackResponse("หนุ่ม"),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-client-history-alias"), "resolved");
    const body = await response.json();
    assert.equal(body.manual_fallback, false);
    assert.equal(body.historical_session_alias, true);
    assert.equal(body.records.length, 1);
    assert.equal(body.records[0].client_id, "recBfl0cQacqLpUz6");
    assert.equal(body.records[0].canonical_name, "Wathiwut");
    assert.equal(body.records[0].matched_on, "historical_session_alias");
    assert.equal(body.records[0].manual_public_only, false);
    assert.equal(body.records[0].identity_status, "canonical_client_linked");
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("historical alias mapped to multiple canonical Clients stays unresolved", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (decodeURIComponent(url.pathname).endsWith("/tblC98mKWbzmPuNzX")) {
      return new Response(JSON.stringify({ records: [
        { id: "recSession1", fields: { fldMvnQ0BzDfHUYjT: "ก้อง SVIP", fld6P6if0vDZCeV0C: ["recClientA"] } },
        { id: "recSession2", fields: { fldMvnQ0BzDfHUYjT: "ก้อง", fld6P6if0vDZCeV0C: ["recClientB"] } },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (decodeURIComponent(url.pathname).endsWith("/pre_session")) {
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected call ${url}`);
  };
  try {
    const response = await enrichLineageWithPreSessionIndex(
      lookupRequest("ก้อง"),
      manualFallbackResponse("ก้อง"),
      env,
    );
    const body = await response.json();
    assert.equal(body.manual_fallback, true);
    assert.match(body.lineage_warnings.join(" "), /historical_session_alias_ambiguous/);
  } finally {
    globalThis.fetch = original;
  }
});

test("pre-session index replaces free-form fallback with a known identity candidate", async () => {
  const restore = installAirtableMock([seedCandidate]);
  try {
    const response = await enrichLineageWithPreSessionIndex(
      lookupRequest("known@example.com"),
      manualFallbackResponse("known@example.com"),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-pre-session-index"), PRE_SESSION_CLIENT_INDEX_VERSION);
    const body = await response.json();

    assert.equal(body.ok, true);
    assert.equal(body.manual_fallback, false);
    assert.equal(body.pre_session_candidates, true);
    assert.equal(body.records.length, 1);
    const record = body.records[0];
    assert.equal(record.client_id, "");
    assert.equal(record.member_email, "known@example.com");
    assert.equal(record.client_name, "known@example.com");
    assert.equal(record.matched_on, "pre_session_email");
    assert.equal(record.pre_session_candidate, true);
    assert.equal(record.candidate_only, true);
    assert.equal(record.identity_status, "pending_reconcile");
    assert.equal(record.manual_public_only, true);
    assert.equal(record.membership_status, "guest_public_only");
    assert.equal(record.package_code, "");
    assert.equal(record.tier, "");
    assert.equal(record.entitlement_snapshot_source, "none");
    assert.equal(record.current_rights_source, "my_mmd_entitlement_resolver_v1");
    assert.match(body.lineage_warnings.join(" "), /pre_session_candidate_identity_pending_reconcile/);
    assert.doesNotMatch(body.lineage_warnings.join(" "), /manual_public_only_pending_reconcile/);

    const calls = restore();
    assert.equal(calls.length, 2);
    assert.equal(decodeURIComponent(calls[1].pathname).endsWith("/pre_session"), true);
    const formula = calls[1].searchParams.get("filterByFormula") || "";
    assert.match(formula, /identity_email/);
    assert.match(formula, /preferred_name/);
    assert.doesNotMatch(formula, /membership|entitlement|points|payment/i);
  } catch (error) {
    restore();
    throw error;
  }
});

test("candidate adapter never turns seed evidence into membership or entitlement truth", () => {
  const record = toCandidateRecord(seedCandidate, "known@example.com");
  assert.ok(record);
  assert.equal(record.client_id, "");
  assert.equal(record.member_id, "");
  assert.equal(record.membership_status, "guest_public_only");
  assert.equal(record.package_code, "");
  assert.equal(record.tier, "");
  assert.equal(record.entitlement_snapshot_source, "none");
  assert.equal(record.manual_public_only, true);
  assert.equal(record.current_rights_source, "my_mmd_entitlement_resolver_v1");
});

test("blocked, review-required, non-candidate, and already-linked rows cannot bypass reconciliation", () => {
  const cases = [
    { resolution_status: "blocked" },
    { resolution_status: "review_required" },
    { session_lookup_status: "review_required" },
    { candidate_only: false },
    { linked_client: ["recCanonical1"] },
  ];

  for (const patch of cases) {
    const record = { ...seedCandidate, fields: { ...seedCandidate.fields, ...patch } };
    assert.equal(toCandidateRecord(record, "known@example.com"), null);
  }
});

test("canonical lineage result always wins and skips pre-session Airtable lookup", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("should_not_call");
  };
  try {
    const canonical = new Response(JSON.stringify({
      ok: true,
      records: [{ client_id: "recCanonical", client_name: "Known Canonical" }],
      count: 1,
      manual_fallback: false,
      lineage_warnings: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    const response = await enrichLineageWithPreSessionIndex(lookupRequest("Known Canonical"), canonical, env);
    const body = await response.json();
    assert.equal(body.records[0].client_id, "recCanonical");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("pre-session source failure preserves existing public-only manual fallback", async () => {
  const restore = installAirtableMock([], { status: 503 });
  try {
    const response = await enrichLineageWithPreSessionIndex(
      lookupRequest("unknown@example.com"),
      manualFallbackResponse("unknown@example.com"),
      env,
    );
    const body = await response.json();
    assert.equal(body.manual_fallback, true);
    assert.equal(body.records[0].manual_public_only, true);
    assert.equal(response.headers.get("x-mmd-pre-session-index"), "source-unavailable");
    assert.match(body.lineage_warnings.join(" "), /pre_session_index:airtable_tblC98mKWbzmPuNzX_503/);
  } finally {
    restore();
  }
});

test("resolveHistoricalSessionAlias returns none for unlinked historical sessions", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ records: [{
    id: "recSessionUnlinked",
    fields: { fldMvnQ0BzDfHUYjT: "Guest Name", fld6P6if0vDZCeV0C: [] },
  }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const result = await resolveHistoricalSessionAlias(env, "Guest Name");
    assert.equal(result.state, "none");
  } finally {
    globalThis.fetch = original;
  }
});
