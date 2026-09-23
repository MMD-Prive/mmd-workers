import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileReviewedMembershipEntitlement,
  resolveWriteThroughPlan,
} from "./reviewed-membership-write-through.js";

const EMAIL = "member@example.com";
const MEMBER_ID = "MMD-001";
const MEMBER_RECORD_ID = "recMember12345678";
const NOW = "2026-09-13T04:30:00.000Z";

function member(overrides = {}) {
  return {
    id: MEMBER_RECORD_ID,
    fields: {
      member_id: MEMBER_ID,
      "Contact Email": EMAIL,
      line_id: "U1234567890abcdef1234567890abcdef",
      ...overrides,
    },
  };
}

function entitlement({ packageCode = "standard", capability = "private_standard", startAt = "2026-01-01T00:00:00.000Z", expireAt = "2026-12-31T00:00:00.000Z", status = "active", id = "ent_existing" } = {}) {
  return {
    id: `rec${id.padEnd(14, "0").slice(0, 14)}`,
    fields: {
      entitlement_id: id,
      member: [MEMBER_RECORD_ID],
      member_id: MEMBER_ID,
      member_email: EMAIL,
      line_user_id: "U1234567890abcdef1234567890abcdef",
      member_status: status,
      member_lifecycle_status: status,
      access_status: status,
      capability,
      entitlement_level: capability,
      package_code: packageCode,
      start_at: startAt,
      expire_at: expireAt,
      source_ref: `existing:${id}`,
    },
  };
}

function packageRecord(code, overrides = {}) {
  const premium = code === "premium";
  return {
    id: premium ? "recPackagePremium0" : "recPackageStandard",
    fields: {
      code,
      is_active: true,
      require_approval: false,
      duration_days: premium ? 730 : 365,
      price: premium ? 2999 : 1199,
      renew_price: premium ? 2500 : 1000,
      ...overrides,
    },
  };
}

function harness({ members = [member()], entitlements = [], packages = [packageRecord("standard"), packageRecord("premium")], failCreate = false } = {}) {
  let counter = 1;
  const writes = [];
  const tables = { members: structuredClone(members), entitlements: structuredClone(entitlements), packages: structuredClone(packages) };
  const env = {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_TABLE_MEMBERS: "members",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "entitlements",
    AIRTABLE_TABLE_PACKAGES: "packages",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").pop());
        const rows = tables[table];
        if (!rows) return json({ error: "table_not_found" }, 404);

        if (request.method === "GET") {
          const formula = url.searchParams.get("filterByFormula") || "";
          let found = rows;
          const exact = extractExact(formula);
          if (exact) {
            const [field, value] = exact;
            found = found.filter((row) => String(row.fields?.[field] ?? "") === value);
          }
          const lower = extractLower(formula);
          if (lower) {
            const [field, value] = lower;
            found = found.filter((row) => String(row.fields?.[field] ?? "").toLowerCase() === value.toLowerCase());
          }
          return json({ records: found.slice(0, Number(url.searchParams.get("maxRecords") || 100)) }, 200);
        }

        if (request.method === "POST") {
          if (failCreate && table === "entitlements") return json({ error: "synthetic_write_failure" }, 503);
          const body = await request.json();
          writes.push({ table, method: "POST", body: structuredClone(body) });
          const created = (body.records || []).map((item) => {
            const row = { id: `recCreated${String(counter++).padStart(8, "0")}`, fields: structuredClone(item.fields || {}) };
            rows.push(row);
            return row;
          });
          return json({ records: created }, 200);
        }

        if (request.method === "PATCH") {
          const body = await request.json();
          writes.push({ table, method: "PATCH", body: structuredClone(body) });
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
  return { env, tables, writes };
}

function reviewedRequest({ amount = 1199, packageCode = "standard", stage = "membership", email = EMAIL, paymentRef = "PAY-001", extra = {} } = {}) {
  return new Request("https://payments.local/v1/internal/payments/reviewed-proof", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      payment_stage: stage,
      payment_ref: paymentRef,
      amount_thb: amount,
      member_email: email,
      package_code: packageCode,
      ...extra,
    }),
  });
}

function reviewedResponse(extra = {}) {
  return new Response(JSON.stringify({ ok: true, authority: "payments-worker", payment_review_console: true, ...extra }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function createdEntitlements(h) {
  return h.tables.entitlements.filter((row) => String(row.fields?.source_ref || "").startsWith("payment:"));
}

function json(value, status) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function extractExact(formula) {
  const match = /^\{([^}]+)}='((?:\\'|[^'])*)'$/.exec(formula);
  return match ? [match[1], match[2].replace(/\\'/g, "'").replace(/\\\\/g, "\\")] : null;
}

function extractLower(formula) {
  const match = /^LOWER\(\{([^}]+)}\)='((?:\\'|[^'])*)'$/.exec(formula);
  return match ? [match[1], match[2].replace(/\\'/g, "'").replace(/\\\\/g, "\\")] : null;
}

test("new Standard 1,199 payment materializes one active canonical entitlement", async () => {
  const h = harness();
  const response = await reconcileReviewedMembershipEntitlement(reviewedRequest(), reviewedResponse(), h.env);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.entitlement_materialized, true);
  assert.equal(body.membership_write_through.status, "materialized");
  assert.equal(body.membership_write_through.action, "signup");
  assert.equal(body.membership_write_through.package_code, "standard");
  assert.equal(body.membership_write_through.capability, "private_standard");
  assert.equal(body.membership_write_through.membership_term, "1_year_plus_180_days");
  assert.equal(body.membership_write_through.promotion.code, "care_back_private_standard_2026");
  const rows = createdEntitlements(h);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fields.member_id, MEMBER_ID);
  assert.equal(rows[0].fields.member_email, EMAIL);
  assert.equal(rows[0].fields.member_lifecycle_status, "active");
  assert.equal(rows[0].fields.payment_ref, "PAY-001");
});

test("active Standard renewal extends from current expiry rather than approval time", async () => {
  const h = harness({ entitlements: [entitlement({ expireAt: "2026-12-31T00:00:00.000Z" })] });
  const plan = await resolveWriteThroughPlan(h.env, {
    payment_stage: "membership",
    payment_ref: "PAY-RENEW-1",
    amount_thb: 1000,
    member_email: EMAIL,
    package_code: "standard",
  }, { verified_at: NOW });
  assert.equal(plan.status, "ready");
  assert.equal(plan.action, "renewal");
  assert.equal(plan.start_at, "2026-12-31T00:00:00.000Z");
  assert.equal(plan.proposed_expire_at, "2028-06-28T00:00:00.000Z");
  assert.equal(plan.membership_expiry_rule, "1_year_from_current_expiry_plus_care_back_private_standard_2026");
});

test("legacy discounted Standard renewal amount remains accepted only with matching history", async () => {
  const withHistory = harness({ entitlements: [entitlement()] });
  const ready = await resolveWriteThroughPlan(withHistory.env, {
    payment_stage: "membership", payment_ref: "PAY-DISC-1", amount_thb: 799, member_email: EMAIL, package_code: "standard",
  }, { verified_at: NOW });
  assert.equal(ready.status, "ready");
  assert.equal(ready.action, "renewal");

  const withoutHistory = harness();
  const review = await resolveWriteThroughPlan(withoutHistory.env, {
    payment_stage: "membership", payment_ref: "PAY-DISC-2", amount_thb: 799, member_email: EMAIL, package_code: "standard",
  }, { verified_at: NOW });
  assert.equal(review.status, "review_required");
  assert.equal(review.reason, "renewal_history_not_found");
});

test("Premium renewal extends two calendar years plus the current CARE BACK year", async () => {
  const h = harness({ entitlements: [entitlement({ packageCode: "premium", capability: "private_premium", expireAt: "2027-02-28T08:15:00.000Z" })] });
  const plan = await resolveWriteThroughPlan(h.env, {
    payment_stage: "membership", payment_ref: "PAY-PREM-1", amount_thb: 2500, member_email: EMAIL, package_code: "premium",
  }, { verified_at: NOW });
  assert.equal(plan.status, "ready");
  assert.equal(plan.action, "renewal");
  assert.equal(plan.proposed_expire_at, "2030-02-28T08:15:00.000Z");
  assert.equal(plan.membership_term, "2_years_plus_1_year");
  assert.equal(plan.promotion.code, "care_back_private_premium_2026");
});

test("expired membership restarts from Official Verify time instead of expired date", async () => {
  const h = harness({ entitlements: [entitlement({ expireAt: "2026-01-01T00:00:00.000Z" })] });
  const plan = await resolveWriteThroughPlan(h.env, {
    payment_stage: "membership", payment_ref: "PAY-EXPIRED", amount_thb: 1000, member_email: EMAIL, package_code: "standard",
  }, { verified_at: NOW });
  assert.equal(plan.status, "ready");
  assert.equal(plan.start_at, NOW);
  assert.equal(plan.proposed_expire_at, "2028-03-11T04:30:00.000Z");
  assert.equal(plan.membership_expiry_rule, "1_year_from_verified_payment_plus_care_back_private_standard_2026");
});

test("Public 690 payment maps to public_member without requiring Private package catalog", async () => {
  const h = harness({ packages: [] });
  const plan = await resolveWriteThroughPlan(h.env, {
    payment_stage: "membership", payment_ref: "PAY-PUBLIC", amount_thb: 690, member_email: EMAIL, package_code: "mmd_member",
  }, { verified_at: NOW });
  assert.equal(plan.status, "ready");
  assert.equal(plan.capability, "public_member");
  assert.equal(plan.membership_term, "1_year");
});

test("Public Member canonical write typecasts policy-owned legacy Airtable selects", async () => {
  const h = harness({ packages: [] });
  const response = await reconcileReviewedMembershipEntitlement(
    reviewedRequest({ amount: 690, packageCode: "mmd_member", paymentRef: "PAY-PUBLIC-WRITE" }),
    reviewedResponse(),
    h.env,
  );
  const body = await response.json();
  assert.equal(body.entitlement_materialized, true);
  assert.equal(body.membership_write_through.package_code, "mmd_member");
  assert.equal(body.membership_write_through.capability, "public_member");
  const write = h.writes.find((item) => item.table === "entitlements" && item.method === "POST");
  assert.ok(write);
  assert.equal(write.body.typecast, true);
  assert.equal(write.body.records[0].fields.member_status, "active");
  assert.equal(write.body.records[0].fields.member_lifecycle_status, "active");
  assert.equal(write.body.records[0].fields.access_status, "active");
  assert.equal(write.body.records[0].fields.entitlement_level, "public_member");
  assert.equal(write.body.records[0].fields.package_code, "mmd_member");
});

test("Elite and Red Card plans preserve canonical package identity and term", async () => {
  for (const [packageCode, amount, capability, years] of [
    ["elite", 4990, "public_member", "2_years"],
    ["red_card", 11499, "red_card", "1_year"],
  ]) {
    const h = harness({ packages: [] });
    const plan = await resolveWriteThroughPlan(h.env, {
      payment_stage: "membership",
      payment_ref: `PAY-${packageCode.toUpperCase()}`,
      amount_thb: amount,
      member_email: EMAIL,
      package_code: packageCode,
    }, { verified_at: NOW });
    assert.equal(plan.status, "ready");
    assert.equal(plan.package_code, packageCode);
    assert.equal(plan.capability, capability);
    assert.equal(plan.membership_term, years);
  }
});

test("amount and package mismatch never materialize entitlement", async () => {
  const h = harness();
  const response = await reconcileReviewedMembershipEntitlement(
    reviewedRequest({ amount: 2999, packageCode: "standard", paymentRef: "PAY-MISMATCH" }),
    reviewedResponse(),
    h.env,
  );
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.entitlement_materialized, false);
  assert.equal(body.manual_membership_review_required, true);
  assert.equal(body.membership_write_through.reason, "membership_amount_package_mismatch");
  assert.equal(createdEntitlements(h).length, 0);
});

test("blocked canonical member fails closed", async () => {
  const h = harness({ entitlements: [entitlement({ status: "blocked" })] });
  const plan = await resolveWriteThroughPlan(h.env, {
    payment_stage: "membership", payment_ref: "PAY-BLOCKED", amount_thb: 1000, member_email: EMAIL, package_code: "standard",
  }, { verified_at: NOW });
  assert.equal(plan.status, "review_required");
  assert.equal(plan.reason, "canonical_member_blocked");
});

test("same reviewed payment is idempotent and never creates a second entitlement", async () => {
  const h = harness();
  const request1 = reviewedRequest({ paymentRef: "PAY-IDEM" });
  const first = await reconcileReviewedMembershipEntitlement(request1, reviewedResponse(), h.env);
  assert.equal((await first.json()).membership_write_through.duplicate, false);
  const request2 = reviewedRequest({ paymentRef: "PAY-IDEM" });
  const second = await reconcileReviewedMembershipEntitlement(request2, reviewedResponse(), h.env);
  const body = await second.json();
  assert.equal(body.membership_write_through.status, "materialized");
  assert.equal(body.membership_write_through.duplicate, true);
  assert.equal(createdEntitlements(h).length, 1);
});

test("entitlement storage failure keeps money truth but surfaces manual reconciliation", async () => {
  const h = harness({ failCreate: true });
  const response = await reconcileReviewedMembershipEntitlement(reviewedRequest({ paymentRef: "PAY-FAIL" }), reviewedResponse(), h.env);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.entitlement_materialized, false);
  assert.equal(body.membership_write_through.status, "failed");
  assert.equal(body.manual_membership_review_required, true);
});

test("service deposit response is unchanged and never touches membership tables", async () => {
  const h = harness();
  const response = await reconcileReviewedMembershipEntitlement(
    reviewedRequest({ stage: "deposit", amount: 5000, packageCode: "", paymentRef: "JOB-001" }),
    reviewedResponse({ marker: "unchanged" }),
    h.env,
  );
  const body = await response.json();
  assert.equal(body.marker, "unchanged");
  assert.equal("membership_write_through" in body, false);
  assert.equal(createdEntitlements(h).length, 0);
});

test("existing recovery materialization remains authoritative and is not duplicated", async () => {
  const h = harness();
  const response = await reconcileReviewedMembershipEntitlement(
    reviewedRequest({ amount: 1000, packageCode: "standard", paymentRef: "PAY-RECOVERY" }),
    reviewedResponse({ entitlement_materialized: true, entitlement_record_id: "recRecovery123456", membership_expire_at: "2027-09-13T00:00:00.000Z", recovery_context: true }),
    h.env,
  );
  const body = await response.json();
  assert.equal(body.membership_write_through.status, "materialized");
  assert.equal(body.membership_write_through.source, "liff_renewal_recovery");
  assert.equal(createdEntitlements(h).length, 0);
});
