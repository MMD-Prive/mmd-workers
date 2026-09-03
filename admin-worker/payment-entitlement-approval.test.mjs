import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  handlePaymentEntitlementApproval,
  PAYMENT_ENTITLEMENT_APPROVAL_PATH,
} from "./src/payment-entitlement-approval.js";

const EMAIL = "member@example.com";
const EVENT_ID = "mmdpe_test_001";
const PAYMENT_REF = "PP-TEST-001";

function standardEntitlement(overrides = {}) {
  const now = Date.now();
  return {
    id: overrides.id || "rec_standard_001",
    fields: {
      entitlement_id: "std_001",
      member_email: EMAIL,
      member_status: "active",
      access_status: "active",
      capability: "private_standard",
      entitlement_level: "private_standard",
      package_code: "standard",
      start_at: new Date(now - 7 * 86400000).toISOString(),
      expire_at: new Date(now + 30 * 86400000).toISOString(),
      source: "existing_membership",
      source_ref: "existing:std_001",
      ...overrides.fields,
    },
  };
}

function paymentEvidence({
  event = "membership_payment_verified",
  email = EMAIL,
  product = "black_card",
  paymentReference = PAYMENT_REF,
  memberMatch = true,
  canonicalIds = ["rec_standard_001"],
  result = "success",
  reason = "pending_canonical_resolution",
} = {}) {
  return {
    id: "rec_access_payment_001",
    fields: {
      Action: "membership_payment_evidence",
      Target: "membership_payment_event",
      Result: result,
      "Event ID": EVENT_ID,
      "Member Email": email,
      "Source Ref": "operator-payment:mmd:test:001",
      Reason: reason,
      "Before JSON": JSON.stringify({
        event,
        payment_reference: paymentReference,
        product,
        member_match: memberMatch,
        canonical_member_record_ids: canonicalIds,
        verified_at: "2026-09-03T11:00:00.000Z",
      }),
    },
  };
}

function makeHarness({ entitlements = [standardEntitlement()], evidence = paymentEvidence() } = {}) {
  let counter = 100;
  const tables = {
    "System — Access Log": [structuredClone(evidence)],
    "MMD — Member Entitlements": structuredClone(entitlements),
  };

  const env = {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_TABLE_ACCESS_LOG: "System — Access Log",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "MMD — Member Entitlements",
    AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD: "member_email",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").pop());
        const rows = tables[table];
        if (!rows) return json({ error: "table_not_found" }, 404);

        if (request.method === "GET") {
          const formula = url.searchParams.get("filterByFormula") || "";
          let found = rows;

          const eventId = extractFormulaValue(formula, "Event ID");
          if (eventId) found = found.filter((row) => String(row.fields?.["Event ID"] || "") === eventId);

          const emailMatch = /LOWER\(\{[^}]+\}\)='([^']+)'/i.exec(formula);
          if (emailMatch) {
            const email = emailMatch[1].toLowerCase();
            found = found.filter((row) => String(row.fields?.member_email || "").toLowerCase() === email);
          }

          const sourceRef = extractFormulaValue(formula, "source_ref");
          const entitlementId = extractFormulaValue(formula, "entitlement_id");
          if (sourceRef || entitlementId) {
            found = found.filter((row) =>
              (sourceRef && String(row.fields?.source_ref || "") === sourceRef)
              || (entitlementId && String(row.fields?.entitlement_id || "") === entitlementId)
            );
          }

          const max = Number(url.searchParams.get("maxRecords") || found.length || 100);
          return json({ records: found.slice(0, max) }, 200);
        }

        if (request.method === "POST") {
          const body = await request.json();
          const created = [];
          for (const item of body.records || []) {
            const record = { id: `rec_created_${counter++}`, fields: structuredClone(item.fields || {}) };
            rows.push(record);
            created.push(record);
          }
          return json({ records: created }, 200);
        }

        if (request.method === "PATCH") {
          const body = await request.json();
          const updated = [];
          for (const item of body.records || []) {
            const row = rows.find((candidate) => candidate.id === item.id);
            if (!row) continue;
            row.fields = { ...row.fields, ...structuredClone(item.fields || {}) };
            updated.push(row);
          }
          return json({ records: updated }, updated.length ? 200 : 404);
        }

        return json({ error: "method_not_allowed" }, 405);
      },
    },
  };

  return { env, tables };
}

function approvalRequest(overrides = {}) {
  return new Request(`https://mmdbkk.com${PAYMENT_ENTITLEMENT_APPROVAL_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      decision: "approve",
      event_id: EVENT_ID,
      approval_reason: "Payment verified by owner review",
      ...overrides,
    }),
  });
}

async function call(harness, { actor = { id: "boss-per", role: "owner" }, body = {} } = {}) {
  const response = await handlePaymentEntitlementApproval(approvalRequest(body), harness.env, actor);
  return { response, body: await response.json() };
}

function entitlementWrites(harness) {
  return harness.tables["MMD — Member Entitlements"].filter((row) => row.fields?.source === "admin_payment_approval");
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function extractFormulaValue(formula, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\{${escaped}\\}='([^']+)'`, "i").exec(formula);
  return match?.[1] || "";
}

test("verified matched payment + owner approval materializes black card and resolves canonical snapshot", async () => {
  const h = makeHarness();
  const { response, body } = await call(h);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.duplicate, false);
  assert.equal(body.authority, "my_mmd_entitlement_resolver_v1");
  assert.deepEqual(body.snapshot.capability_state.active.sort(), ["black_card", "private_standard"].sort());
  assert.equal(body.snapshot.access.new_protected_grants_allowed, true);
  const writes = entitlementWrites(h);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].fields.capability, "black_card");
  assert.equal(writes[0].fields.package_code, "black_card");
  assert.equal(writes[0].fields.access_status, "active");
  assert.match(writes[0].fields.source_ref, /^operator-payment:/);
  assert.ok(h.tables["System — Access Log"].some((row) => row.fields?.Action === "membership_entitlement_materialized"));
});

test("payment evidence without explicit approval never writes entitlement", async () => {
  const h = makeHarness();
  const { response, body } = await call(h, { body: { decision: "review" } });
  assert.equal(response.status, 400);
  assert.equal(body.error, "explicit_approval_required");
  assert.equal(entitlementWrites(h).length, 0);
});

test("rejected payment never writes entitlement", async () => {
  const h = makeHarness({ evidence: paymentEvidence({ event: "membership_payment_rejected" }) });
  const { response, body } = await call(h);
  assert.equal(response.status, 409);
  assert.equal(body.error, "payment_not_verified");
  assert.equal(entitlementWrites(h).length, 0);
});

test("unknown member fails closed without entitlement write", async () => {
  const h = makeHarness({ entitlements: [], evidence: paymentEvidence({ canonicalIds: [], memberMatch: true }) });
  const { response, body } = await call(h);
  assert.equal(response.status, 409);
  assert.equal(body.error, "canonical_member_match_lost");
  assert.equal(entitlementWrites(h).length, 0);
});

test("exact replay is idempotent and returns existing materialization", async () => {
  const h = makeHarness();
  const first = await call(h);
  assert.equal(first.response.status, 200);
  const second = await call(h);
  assert.equal(second.response.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(entitlementWrites(h).length, 1);
});

test("same payment reference attached to a different member conflicts", async () => {
  const conflicting = {
    id: "rec_conflict",
    fields: {
      entitlement_id: "mmdpe_ent_conflict",
      member_email: "other@example.com",
      member_status: "active",
      access_status: "expired",
      capability: "black_card",
      entitlement_level: "black_card",
      package_code: "black_card",
      source: "admin_payment_approval",
      source_ref: `operator-payment:${PAYMENT_REF}`,
    },
  };
  const h = makeHarness({ entitlements: [standardEntitlement(), conflicting] });
  const { response, body } = await call(h);
  assert.equal(response.status, 409);
  assert.equal(body.error, "payment_entitlement_conflict");
  assert.equal(entitlementWrites(h).length, 1);
});

test("blocked or revoked member fails closed", async () => {
  for (const memberStatus of ["blocked", "suspended", "revoked"]) {
    const h = makeHarness({ entitlements: [standardEntitlement({ fields: { member_status: memberStatus } })] });
    const { response, body } = await call(h);
    assert.equal(response.status, 409, memberStatus);
    assert.equal(body.error, "canonical_member_blocked", memberStatus);
    assert.equal(entitlementWrites(h).length, 0, memberStatus);
  }
});

test("service reviewer cannot approve protected Black Card access", async () => {
  const h = makeHarness();
  const { response, body } = await call(h, { actor: { id: "service-admin", role: "reviewer" } });
  assert.equal(response.status, 403);
  assert.equal(body.error, "protected_approval_requires_owner");
  assert.equal(entitlementWrites(h).length, 0);
});

test("bridge stays free of Lovable/Supabase/Telegram/Drive authority", () => {
  const source = fs.readFileSync(new URL("./src/payment-entitlement-approval.js", import.meta.url), "utf8").toLowerCase();
  for (const forbidden of ["supabase", "telegram", "google drive", "lovable_"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("active entrypoint and wrangler expose only the exact approval route", () => {
  const entry = fs.readFileSync(new URL("./src/admin-login-hero-worker.js", import.meta.url), "utf8");
  const wrangler = fs.readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
  assert.match(entry, /handlePaymentEntitlementApproval/);
  assert.match(entry, /isPaymentEntitlementApprovalRequest/);
  assert.match(wrangler, /mmdbkk\.com\/v1\/admin\/membership\/payment-entitlement\/approve/);
  assert.match(wrangler, /www\.mmdbkk\.com\/v1\/admin\/membership\/payment-entitlement\/approve/);
  assert.doesNotMatch(wrangler, /pattern\s*=\s*"(?:www\.)?mmdbkk\.com\/v1\/admin\/\*"/);
});
