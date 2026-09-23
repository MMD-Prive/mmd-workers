import assert from "node:assert/strict";
import test from "node:test";

import { observeOne } from "./src/membership-genuine-liff-acceptance-observer.js";

const renewalId = "recAAAAAAAAAAAAAA";
const entitlementId = "recBBBBBBBBBBBBBB";
const lineUserId = "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function fixture({ acceptance = "recorded", acceptanceAt = "2026-09-23T13:05:00.000Z", activeThrough = "2029-09-14", tierSource = "my_mmd_entitlement_resolver_v1" } = {}) {
  const updates = [];
  const env = {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        const table = parts[2];
        const recordId = parts[3] || "";
        if (request.method === "PATCH") {
          const body = await request.json();
          updates.push({ table, recordId, body });
          return json({ id: recordId, fields: body.fields || {} });
        }
        if (recordId === entitlementId) {
          return json({
            id: entitlementId,
            fields: {
              entitlement_id: "renewal_016257231759cor07646",
              package_code: "premium",
              access_status: "active",
              renewal_status: "renewed",
              expire_at: "2029-09-14T00:00:00.000Z",
            },
          });
        }
        return json({ error: "not_found" }, 404);
      },
    },
    MEMBER_PAGES_MEMBER_WALLET: {
      async fetch(request) {
        const body = await request.json();
        assert.equal(body.line_user_id, lineUserId);
        assert.equal(request.headers.get("x-mmd-internal-call"), "true");
        assert.equal(request.headers.get("x-mmd-service-binding"), "admin-worker");
        return json({
          ok: true,
          membership: {
            level: "private_premium",
            label: "Premium",
            lifecycle: "active",
            active_through: activeThrough,
            source: "my_mmd_entitlement_resolver_v1",
          },
          acceptance: acceptance === "recorded" ? {
            status: "recorded",
            evidence_id: "mmdacc_aaaaaaaaaaaaaaaaaaaaaaaa",
            result: "protected_member_resolved",
            tier: "Premium",
            tier_source: tierSource,
            recorded_at: acceptanceAt,
          } : {
            status: "missing",
            evidence_id: null,
            result: null,
            tier: null,
            tier_source: null,
            recorded_at: null,
          },
        });
      },
    },
  };

  const renewal = {
    id: renewalId,
    fields: {
      renewal_flow_status: "materialized",
      line_user_id: lineUserId,
      requested_package: "premium",
      renewal_amount_thb: 1999,
      materialized_at: "2026-09-23T13:00:42.319Z",
      "Member Entitlement": [entitlementId],
      review_note: "payment materialized",
    },
  };

  return { env, renewal, updates };
}

test("closes only after genuine canonical LIFF dashboard acceptance recorded after materialization", async () => {
  const h = fixture();
  const result = await observeOne(h.env, h.renewal);

  assert.equal(result.status, "closed");
  assert.equal(result.evidence_id, "mmdacc_aaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(result.active_through, "2029-09-14");
  assert.equal(h.updates.length, 1);
  assert.equal(h.updates[0].recordId, renewalId);
  assert.match(h.updates[0].body.fields.review_note, /genuine_liff_acceptance=closed/);
  assert.match(h.updates[0].body.fields.review_note, /evidence_id=mmdacc_aaaaaaaaaaaaaaaaaaaaaaaa/);
  assert.match(h.updates[0].body.fields.review_note, /active_through=2029-09-14/);
});

test("missing genuine acceptance stays pending and never mutates renewal", async () => {
  const h = fixture({ acceptance: "missing" });
  const result = await observeOne(h.env, h.renewal);

  assert.deepEqual(result, { status: "pending", reason: "genuine_liff_acceptance_missing" });
  assert.equal(h.updates.length, 0);
});

test("acceptance recorded before payment materialization cannot close E2E", async () => {
  const h = fixture({ acceptanceAt: "2026-09-23T12:59:59.000Z" });
  const result = await observeOne(h.env, h.renewal);

  assert.deepEqual(result, { status: "pending", reason: "genuine_liff_acceptance_predates_materialization" });
  assert.equal(h.updates.length, 0);
});

test("non-canonical acceptance authority cannot close E2E", async () => {
  const h = fixture({ tierSource: "line_oa_renamed_name_fast_trust" });
  const result = await observeOne(h.env, h.renewal);

  assert.deepEqual(result, { status: "pending", reason: "genuine_liff_authority_mismatch" });
  assert.equal(h.updates.length, 0);
});

test("stale active-through cannot close E2E", async () => {
  const h = fixture({ activeThrough: "2028-09-14" });
  const result = await observeOne(h.env, h.renewal);

  assert.deepEqual(result, { status: "pending", reason: "genuine_liff_active_through_stale" });
  assert.equal(h.updates.length, 0);
});

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
