import test from "node:test";
import assert from "node:assert/strict";

import {
  HYPE_STUCK_SLA_POLICY,
  HYPE_STUCK_SLA_SCHEMA,
  HYPE_CROSS_SYSTEM_STUCK_SLA_INTERNALS,
  buildCrossSystemStuckSlaWatch,
} from "./src/hype-cross-system-stuck-sla.js";
import { buildHypeOwnerSummaryProjection } from "./src/hype-owner-summary.js";

const NOW = new Date("2026-09-21T12:00:00.000Z");

function allSourcesAvailable() {
  return Object.fromEntries([
    "payment_proofs",
    "entitlement_notifications",
    "job_confirmations",
    "recovery_queue",
    "coupon_manual_review",
    "telegram_binds",
  ].map((key) => [key, { available: true, record_count: 1, reason: null }]));
}

test("cross-system watch ranks six bounded operational stuck lanes without leaking authority or secrets", () => {
  const watch = buildCrossSystemStuckSlaWatch({
    payment_proofs: [{
      proof_id: "proof-payment-1",
      customer_name: "คุณเอ็ม",
      created_at: "2026-09-21T04:00:00.000Z",
      payment_ref: "must-not-project",
    }],
    entitlement_notifications: [{
      id: "recEntitlement12345",
      createdTime: "2026-09-21T07:00:00.000Z",
      fields: {
        entitlement_id: "entitlement-1",
        package_code: "premium",
        access_status: "active",
        source: "renewal",
        telegram_access_status: "pending_invite",
        line_user_id: "U11111111111111111111111111111111",
      },
    }],
    job_confirmations: [{
      id: "recSession1234567",
      fields: {
        fldLTq2kZbyRv22IA: "SES-1",
        fldHw5HdDDdkHXMhG: "JOB-1",
        fldMvnQ0BzDfHUYjT: "คุณเอ็ม",
        flddVz6eoWRHrzIQr: "Model A",
        fld57fhdWqIcOy4Jp: { id: "selConfirmed", name: "confirmed", color: "greenBright" },
        fldFJI1Leni6wvzR4: "2026-09-21T05:00:00.000Z",
        fldJSS5GNN7quJwa8: "2026-09-21T05:10:00.000Z",
        fldpnqoIsUMfN7y3c: "2026-09-21",
        fldVElAODigVt7AcR: "2026-09-21T06:00:00.000Z",
      },
    }],
    recovery_queue: {
      ok: true,
      queue: {
        open_count: 1,
        attention: [{
          case_ref: "HYPE-PER-20260921-acde1234",
          client_name: "คุณเชน",
          domain: "booking",
          sla_status: "watch",
          since_update_minutes: 150,
          assignment_status: "unassigned",
          href: "/internal/admin/recovery?case_ref=HYPE-PER-20260921-acde1234",
        }],
      },
    },
    coupon_manual_review: [{
      id: "recClaim12345678",
      fields: {
        claim_id: "care-back-claim-1",
        campaign_id: "6-years-care-back",
        claim_status: { id: "selApproved", name: "benefit_approved", color: "greenBright" },
        review_status: { id: "selReviewApproved", name: "approved", color: "greenBright" },
        match_status: { id: "selManual", name: "manual_review", color: "yellowBright" },
        updated_at: "2026-09-20T10:00:00.000Z",
      },
    }],
    telegram_binds: [
      {
        id: "recBind123456789",
        fields: {
          bind_id: "tgb_safe_reference",
          role: "partner",
          status: { id: "selPending", name: "pending", color: "yellowBright" },
          created_at: "2026-09-21T11:48:00.000Z",
          expires_at: "2026-09-21T12:03:00.000Z",
          token_hash: "must-not-project",
          start_arg: "bind_must-not-project",
        },
      },
      {
        id: "recBindConsumed12",
        fields: {
          bind_id: "tgb_consumed",
          role: "client",
          status: "consumed",
          created_at: "2026-09-21T09:00:00.000Z",
        },
      },
    ],
  }, NOW, { sourceStatus: allSourcesAvailable() });

  assert.equal(watch.schema, HYPE_STUCK_SLA_SCHEMA);
  assert.equal(watch.policy_version, HYPE_STUCK_SLA_POLICY);
  assert.equal(watch.status, "overdue");
  assert.equal(watch.complete, true);
  assert.equal(watch.counts.total, 5);
  assert.equal(watch.counts.overdue, 3);
  assert.equal(watch.counts.watch, 2);
  assert.equal(watch.counts.owner_actionable_overdue, 1);
  assert.equal(watch.counts.stale_terminal_records, 1);
  assert.deepEqual(watch.counts.owner_actionable_by_kind, {
    entitlement_notification_incomplete: 1,
  });
  assert.deepEqual(watch.counts.by_kind, {
    payment_proof_pending: 1,
    entitlement_notification_incomplete: 1,
    job_confirmation_pending: 1,
    recovery_unassigned: 1,
    telegram_bind_unconsumed: 1,
  });
  assert.deepEqual(watch.stale_terminal_by_kind, {
    coupon_manual_review_terminal: 1,
  });
  assert.equal(watch.items[0].sla_status, "overdue");
  assert.equal(watch.items.at(-1).sla_status, "watch");
  assert.equal(watch.business_truth_mutated, false);
  assert.equal(watch.operational_only, true);

  const serialized = JSON.stringify(watch);
  assert.doesNotMatch(serialized, /must-not-project|U11111111111111111111111111111111|token_hash|start_arg|payment_ref/i);
});

test("CARE BACK coupon manual review counts only unresolved review states", () => {
  const watch = buildCrossSystemStuckSlaWatch({
    payment_proofs: [],
    entitlement_notifications: [],
    job_confirmations: [],
    recovery_queue: { ok: true, queue: { open_count: 0, attention: [] } },
    coupon_manual_review: [
      {
        id: "recStaleApproved",
        fields: {
          claim_id: "claim-stale",
          campaign_id: "6-years-care-back",
          claim_status: "benefit_approved",
          review_status: "approved",
          match_status: "manual_review",
          updated_at: "2026-09-20T10:00:00.000Z",
        },
      },
      {
        id: "recNeedsReview",
        fields: {
          claim_id: "claim-review",
          campaign_id: "6-years-care-back",
          claim_status: "manual_review",
          review_status: "pending",
          match_status: "manual_review",
          updated_at: "2026-09-20T10:00:00.000Z",
        },
      },
    ],
    telegram_binds: [],
  }, NOW, { sourceStatus: allSourcesAvailable() });

  assert.equal(watch.counts.total, 1);
  assert.equal(watch.counts.overdue, 1);
  assert.equal(watch.counts.owner_actionable_overdue, 1);
  assert.equal(watch.counts.stale_terminal_records, 1);
  assert.deepEqual(watch.counts.owner_actionable_by_kind, { coupon_manual_review: 1 });
  assert.deepEqual(watch.stale_terminal_by_kind, { coupon_manual_review_terminal: 1 });
  assert.equal(watch.items[0].reference, "claim-review");
  assert.equal(watch.items[0].detail, "Coupon claim ยังมี unresolved manual review");
});

test("missing source remains partial instead of being reported healthy", () => {
  const sourceStatus = allSourcesAvailable();
  sourceStatus.telegram_binds = { available: false, record_count: 0, reason: "airtable_unavailable" };
  const watch = buildCrossSystemStuckSlaWatch({
    payment_proofs: [],
    entitlement_notifications: [],
    job_confirmations: [],
    recovery_queue: { ok: true, queue: { open_count: 0, attention: [] } },
    coupon_manual_review: [],
    telegram_binds: [],
  }, NOW, { sourceStatus });

  assert.equal(watch.status, "partial");
  assert.equal(watch.complete, false);
  assert.equal(watch.attention_required, false);
  assert.deepEqual(watch.unavailable_sources, ["telegram_binds"]);
  assert.match(watch.summary, /source unavailable/i);
});

test("a capped recent-first Airtable candidate window is partial rather than falsely clear", async () => {
  let requestedUrl = "";
  const result = await HYPE_CROSS_SYSTEM_STUCK_SLA_INTERNALS.airtableList({
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_HTTP: {
      fetch: async (request) => {
        requestedUrl = request.url;
        return new Response(JSON.stringify({
          records: [{ id: "recNewest", fields: { updated_at: NOW.toISOString() } }],
          offset: "next-page-exists",
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  }, "tblTest", {
    maxRecords: 1,
    fields: ["updated_at"],
    sort: [{ field: "updated_at", direction: "desc" }],
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.complete, false);
  assert.match(decodeURIComponent(requestedUrl), /sort\[0\]\[field\]=updated_at/);
  assert.match(decodeURIComponent(requestedUrl), /sort\[0\]\[direction\]=desc/);

  const sourceStatus = allSourcesAvailable();
  sourceStatus.entitlement_notifications = {
    available: true,
    complete: false,
    record_count: 1,
    reason: "candidate_window_truncated",
  };
  const watch = buildCrossSystemStuckSlaWatch({
    payment_proofs: [],
    entitlement_notifications: [],
    job_confirmations: [],
    recovery_queue: { ok: true, queue: { open_count: 0, attention: [] } },
    coupon_manual_review: [],
    telegram_binds: [],
  }, NOW, { sourceStatus });

  assert.equal(watch.status, "partial");
  assert.equal(watch.complete, false);
  assert.deepEqual(watch.unavailable_sources, ["entitlement_notifications"]);
  assert.equal(watch.sources.entitlement_notifications.reason, "candidate_window_truncated");
});

test("expired Telegram binds older than the bounded window do not crowd out current incidents", () => {
  const watch = buildCrossSystemStuckSlaWatch({
    payment_proofs: [],
    entitlement_notifications: [],
    job_confirmations: [],
    recovery_queue: { ok: true, queue: { open_count: 0, attention: [] } },
    coupon_manual_review: [],
    telegram_binds: [{
      id: "recAncientBind",
      fields: {
        bind_id: "tgb_ancient",
        role: "client",
        status: "pending",
        created_at: "2026-09-18T12:00:00.000Z",
        expires_at: "2026-09-18T12:15:00.000Z",
      },
    }],
  }, NOW, { sourceStatus: allSourcesAvailable() });

  assert.equal(watch.counts.total, 0);
  assert.equal(watch.items.length, 0);
  assert.equal(watch.status, "clear");
});

test("owner summary projects STUCK / NEEDS ATTENTION as read-only action", () => {
  const stuck = buildCrossSystemStuckSlaWatch({
    payment_proofs: [{ proof_id: "proof-1", customer_name: "คุณเอ็ม", created_at: "2026-09-21T04:00:00.000Z" }],
    entitlement_notifications: [],
    job_confirmations: [],
    recovery_queue: { ok: true, queue: { open_count: 0, attention: [] } },
    coupon_manual_review: [],
    telegram_binds: [],
  }, NOW, { sourceStatus: allSourcesAvailable() });

  const summary = buildHypeOwnerSummaryProjection({
    generated_at: NOW.toISOString(),
    counts: {},
    status: {},
  }, NOW, null, null, null, stuck);

  assert.equal(summary.counts.stuck_total, 1);
  assert.equal(summary.counts.stuck_overdue, 1);
  assert.equal(summary.stuck_sla_watch.status, "overdue");
  assert.equal(summary.next_actions[0].label, "ดู STUCK / NEEDS ATTENTION");
  assert.equal(summary.next_actions[0].href, "/internal/admin/payments");
  assert.equal(summary.authority.stuck_sla_operational_only, true);
  assert.equal(summary.authority.stuck_sla_may_mutate_business_truth, false);
});
