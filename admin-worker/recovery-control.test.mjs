import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import coreWorker from "./src/admin-login-hero-worker-core.js";
import { createCredentialBoundAdminSession } from "./src/credential-bound-admin-session.js";
import {
  RECOVERY_CONTROL_API_PATH,
  RECOVERY_CONTROL_PAGE_PATH,
  RECOVERY_PICKER_INTELLIGENCE_VERSION,
  RECOVERY_QUEUE_ASSIGNMENT_VERSION,
  RECOVERY_QUEUE_SLA_VERSION,
  buildRecoveryControlTransition,
  handleRecoveryControl,
  isRecoveryOperatorActor,
  projectRecoveryRecord,
  readRecoveryQueueIntelligence,
  recoverySlaIndicator,
} from "./src/recovery-control.js";

const CASE_REF = "HYPE-PER-20260919150000-acde1234";
const CLIENT_ID = "recClientA1";

function actor(role = "admin", auth = "credential") {
  return { id: role === "owner" ? "per" : "ops-1", role, auth_method: auth };
}

function env() {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "appTest0000000000",
    AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID: "tblMatrix",
    AIRTABLE_TABLE_CLIENTS_ID: "tblClients",
    AIRTABLE_TABLE_BOOKING_REQUESTS_ID: "tblBookingRequests",
    ADMIN_LOGIN_CREDENTIAL: "owner-credential",
    ADMIN_SESSION_SECRET: "owner-session-secret",
  };
}

function matrixRecord(state = "reviewing", outcome = "awaiting_operations") {
  return {
    id: "recMatrixA1",
    fields: {
      Client: [CLIENT_ID],
      pending_reference: CASE_REF,
      state_updated_at: "2026-09-19T15:00:00.000Z",
      payload_json: JSON.stringify({
        display_name: "คุณเชน",
        private_note: "must-not-leak",
        handoff_target: "per",
        handoff_tracking: {
          id: CASE_REF,
          target: "per",
          state,
          actor_role: "operator",
          updated_at: "2026-09-19T15:00:00.000Z",
        },
        recovery_case: {
          case_ref: CASE_REF,
          domain: "booking",
          state,
          outcome_code: outcome,
          actor_role: "operator",
          updated_at: "2026-09-19T15:00:00.000Z",
        },
        recovery_correlation: {
          domain: "booking",
          state: "confirmed",
          correlated: true,
          case_ref: CASE_REF,
          booking_ref: "kenji_0123456789abcdef01234567",
          session_id: "sess_exact_001",
          job_id: "JOB-EXACT-001",
          session_state: "confirmed",
          job_state: "confirmed",
          exact_correlation: true,
          payment_ref: "must-not-leak",
        },
        business_truth_mutated: false,
      }),
      version: 4,
    },
  };
}

function pickerRecord(status = "reissued", revision = 2, state = "reviewing") {
  const row = matrixRecord(state);
  const payload = JSON.parse(row.fields.payload_json);
  payload.recovery_correlation = {
    domain: "booking",
    state: status === "no_current_candidates" ? "no_current_candidates" : "ambiguous",
    correlated: false,
    case_ref: CASE_REF,
    candidate_count: status === "no_current_candidates" ? 0 : 2,
    options: status === "no_current_candidates" ? [] : [
      {
        booking_ref: "kenji_aaaaaaaaaaaaaaaaaaaaaaaa",
        request_status: "pending",
        preferred_date: "2026-10-02",
        preferred_time: "19:00",
        selected_model_name: "Model A",
        summary: "Model A · private",
      },
      {
        booking_ref: "kenji_bbbbbbbbbbbbbbbbbbbbbbbb",
        request_status: "pending",
        preferred_date: "2026-10-03",
        preferred_time: "20:00",
        selected_model_name: "Model B",
        summary: "Model B · private",
      },
    ],
    method: "stale_picker_reissued",
    source_authority: "sigil-booking-worker",
    live_refresh_status: status === "stale" ? "unavailable" : "fresh",
    picker_revision: revision,
    picker_status: status,
    picker_issued_at: "2026-09-19T14:00:00.000Z",
    picker_reissued_at: "2026-09-19T14:30:00.000Z",
    picker_reissue_count: Math.max(0, revision - 1),
    last_stale_reason: status === "stale" ? "booking_authority_unavailable" : "selected_candidate_stale",
    last_reissue_source: "r1_1",
  };
  payload.recovery_assignment = {
    policy_version: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
    status: "assigned",
    assignee_key: "credential:per",
    assignee_label: "Per",
    assignee_role: "owner",
    assignee_lane: "owner",
    claimed_at: "2026-09-19T14:10:00.000Z",
    updated_at: "2026-09-19T14:10:00.000Z",
    revision: 2,
    coordination_only: true,
    grants_authority: false,
  };
  row.fields.payload_json = JSON.stringify(payload);
  return row;
}

function request(path, options = {}) {
  return new Request("https://mmdbkk.com" + path, options);
}

test("Recovery Control recognizes credential-bound owner/admin only", () => {
  assert.equal(isRecoveryOperatorActor(actor("owner")), true);
  assert.equal(isRecoveryOperatorActor(actor("admin")), true);
  assert.equal(isRecoveryOperatorActor(actor("admin", "service")), false);
  assert.equal(isRecoveryOperatorActor({ role: "mms_partner", auth_method: "credential" }), false);
});

test("Recovery Control transition policy is monotonic and domain-safe", () => {
  assert.deepEqual(
    buildRecoveryControlTransition({ state: "prepared", domain: "booking" }, "acknowledge", ""),
    { ok: true, next_state: "acknowledged" },
  );
  assert.equal(
    buildRecoveryControlTransition({ state: "prepared", domain: "booking" }, "review", "").error,
    "review_not_allowed_from_current_state",
  );
  assert.deepEqual(
    buildRecoveryControlTransition({ state: "prepared", domain: "booking" }, "set_outcome", "awaiting_customer"),
    { ok: true, next_state: "prepared", outcome_code: "awaiting_customer" },
  );
  assert.equal(
    buildRecoveryControlTransition({ state: "reviewing", domain: "booking" }, "resolve", "").error,
    "terminal_outcome_required",
  );
  assert.equal(
    buildRecoveryControlTransition({ state: "reviewing", domain: "booking" }, "resolve", "reshipment_arranged").error,
    "terminal_outcome_required",
  );
  assert.deepEqual(
    buildRecoveryControlTransition({ state: "reviewing", domain: "booking" }, "resolve", "rebooking_arranged"),
    { ok: true, next_state: "resolved", outcome_code: "rebooking_arranged" },
  );
  assert.deepEqual(
    buildRecoveryControlTransition({ state: "resolved", domain: "booking" }, "customer_notified", ""),
    { ok: true, next_state: "customer_notified" },
  );
});

test("Recovery Control projection excludes private payload fields and exposes bounded Booking correlation", () => {
  const projected = projectRecoveryRecord(matrixRecord());
  assert.equal(projected.case_ref, CASE_REF);
  assert.equal(projected.customer.display_name, "คุณเชน");
  assert.equal(projected.domain, "booking");
  assert.equal(projected.state, "reviewing");
  assert.equal(projected.assignment.policy_version, RECOVERY_QUEUE_ASSIGNMENT_VERSION);
  assert.equal(projected.assignment.status, "unassigned");
  assert.equal(projected.assignment.grants_authority, false);
  assert.equal(projected.picker.policy_version, RECOVERY_PICKER_INTELLIGENCE_VERSION);
  assert.equal(projected.picker.queue_state, "selected");
  assert.equal(projected.picker.interaction_only, true);
  assert.equal(projected.picker.business_truth_inferred, false);
  assert.equal(projected.correlation.booking_ref, "kenji_0123456789abcdef01234567");
  assert.equal(projected.correlation.session_id, "sess_exact_001");
  assert.equal(projected.correlation.job_id, "JOB-EXACT-001");
  assert.doesNotMatch(JSON.stringify(projected), /private_note|payment_ref|must-not-leak/);
});


test("Recovery Queue derives case age and operational SLA only from workflow timestamps", () => {
  const now = new Date("2026-09-19T22:00:00.000Z");
  const projected = projectRecoveryRecord(matrixRecord("reviewing"), now);
  assert.equal(projected.age.minutes, 420);
  assert.equal(projected.age.bucket, "4_12h");
  assert.equal(projected.sla.policy_version, RECOVERY_QUEUE_SLA_VERSION);
  assert.equal(projected.sla.status, "overdue");
  assert.equal(projected.sla.target_minutes, 360);
  assert.equal(projected.sla.since_update_minutes, 420);
  assert.equal(projected.sla.breached_by_minutes, 60);
  assert.equal(projected.sla.operational_only, true);
  assert.equal(projected.sla.business_truth_inferred, false);
  assert.equal(projected.next_attention, "review_and_update_outcome");

  const resolved = recoverySlaIndicator("resolved", "2026-09-19T21:00:00.000Z", now);
  assert.equal(resolved.status, "fresh");
  assert.equal(resolved.target_minutes, 120);
  assert.equal(resolved.attention_required, false);
});

test("Recovery Queue filters domain/state and ranks overdue attention first", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const booking = pickerRecord("reissued", 2, "reviewing");
  const bookingPayload = JSON.parse(booking.fields.payload_json);
  delete bookingPayload.recovery_assignment;
  booking.fields.payload_json = JSON.stringify(bookingPayload);
  const shop = matrixRecord("acknowledged");
  shop.id = "recMatrixShop";
  shop.fields.pending_reference = "HYPE-PER-20260919193000-acde5678";
  const shopPayload = JSON.parse(shop.fields.payload_json);
  shopPayload.display_name = "คุณ Shop";
  shopPayload.handoff_tracking.id = shop.fields.pending_reference;
  shopPayload.handoff_tracking.state = "acknowledged";
  shopPayload.handoff_tracking.updated_at = "2026-09-19T21:00:00.000Z";
  shopPayload.recovery_case.case_ref = shop.fields.pending_reference;
  shopPayload.recovery_case.domain = "mmd_shop";
  shopPayload.recovery_case.state = "acknowledged";
  shopPayload.recovery_assignment = {
    policy_version: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
    status: "assigned",
    assignee_key: "credential:ops_2",
    assignee_label: "Operator",
    assignee_role: "admin",
    assignee_lane: "operator",
    claimed_at: "2026-09-19T20:55:00.000Z",
    updated_at: "2026-09-19T20:55:00.000Z",
    revision: 1,
    coordination_only: true,
    grants_authority: false,
  };
  shopPayload.recovery_correlation = {
    domain: "mmd_shop",
    correlated: true,
    state: "correlated",
    case_ref: shop.fields.pending_reference,
    order_id: "MMD-ORDER-1",
    payment_status: "paid",
    fulfillment_state: "packing",
  };
  shop.fields.payload_json = JSON.stringify(shopPayload);

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "api.airtable.com") return Response.json({ records: [shop, booking] });
    throw new Error("unexpected_fetch:" + url.toString());
  };

  try {
    const now = new Date("2026-09-19T22:00:00.000Z");
    const all = await readRecoveryQueueIntelligence(env(), { limit: 12, domain: "all", state: "open" }, now);
    assert.equal(all.ok, true);
    assert.equal(all.queue.open_count, 2);
    assert.equal(all.queue.attention_count, 1);
    assert.equal(all.queue.overdue_count, 1);
    assert.equal(all.queue.assigned_count, 1);
    assert.equal(all.queue.unassigned_count, 1);
    assert.equal(all.queue.attention_unassigned_count, 1);
    assert.equal(all.queue.picker_waiting_reselection_count, 1);
    assert.equal(all.queue.picker_authority_unavailable_count, 0);
    assert.equal(all.queue.picker_no_candidates_count, 0);
    assert.equal(all.queue.picker_selected_count, 1);
    assert.equal(all.queue.picker_watch_count, 1);
    assert.equal(all.queue.picker_attention[0].picker_state, "waiting_reselection");
    assert.equal(all.queue.picker_attention[0].picker_revision, 2);
    assert.equal(all.cases[0].case_ref, CASE_REF);
    assert.equal(all.cases[0].sla.status, "overdue");
    assert.equal(all.queue.operational_only, true);
    assert.equal(all.queue.business_truth_inferred, false);

    const filtered = await readRecoveryQueueIntelligence(env(), { limit: 12, domain: "mmd_shop", state: "acknowledged" }, now);
    assert.equal(filtered.cases.length, 1);
    assert.equal(filtered.cases[0].domain, "mmd_shop");
    assert.equal(filtered.cases[0].state, "acknowledged");
    assert.equal(filtered.queue.by_domain.booking, 1);
    assert.equal(filtered.queue.by_domain.mmd_shop, 1);

    const unassigned = await readRecoveryQueueIntelligence(env(), { limit: 12, domain: "all", state: "open", assignment: "unassigned" }, now);
    assert.equal(unassigned.cases.length, 1);
    assert.equal(unassigned.cases[0].case_ref, CASE_REF);
    assert.equal(unassigned.filters.assignment, "unassigned");

    const reselection = await readRecoveryQueueIntelligence(env(), {
      limit: 12,
      domain: "all",
      state: "open",
      picker: "waiting_reselection",
    }, now);
    assert.equal(reselection.cases.length, 1);
    assert.equal(reselection.cases[0].case_ref, CASE_REF);
    assert.equal(reselection.cases[0].picker.queue_state, "waiting_reselection");
    assert.equal(reselection.filters.picker, "waiting_reselection");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Recovery Control ignores generic handoffs that are not Recovery Cases", () => {
  const row = matrixRecord();
  const payload = JSON.parse(row.fields.payload_json);
  delete payload.recovery_case;
  row.fields.payload_json = JSON.stringify(payload);
  assert.equal(projectRecoveryRecord(row), null);
});

test("Recovery Control page is noindex and rejects non-credential actors", async () => {
  const forbidden = await handleRecoveryControl(
    request(RECOVERY_CONTROL_PAGE_PATH),
    env(),
    actor("admin", "service"),
  );
  assert.equal(forbidden.status, 403);

  const page = await handleRecoveryControl(
    request(RECOVERY_CONTROL_PAGE_PATH),
    env(),
    actor("admin"),
  );
  assert.equal(page.status, 200);
  assert.match(page.headers.get("x-robots-tag") || "", /noindex/);
  const html = await page.text();
  assert.match(html, /Recovery Control/);
  assert.match(html, /MMD Shop, Booking และ MMS/);
  assert.match(html, /ทุก Assignment/);
  assert.match(html, /ทุก Picker/);
  assert.match(html, /Refresh Current Choices/);
  assert.match(html, /mmd-recovery-assignment-v1-20260919/);
  assert.match(html, /mmd-recovery-picker-intelligence-v1-20260920/);
});

test("Recovery Control API list and exact read are bounded", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "api.airtable.com") return Response.json({ records: [matrixRecord()] });
    throw new Error("unexpected_fetch:" + url.toString());
  };
  try {
    const list = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH + "?limit=12"),
      env(),
      actor("admin"),
    );
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.cases.length, 1);
    assert.equal(listBody.cases[0].case_ref, CASE_REF);
    assert.equal(listBody.filters.state, "open");
    assert.equal(listBody.filters.assignment, "all");
    assert.equal(listBody.filters.picker, "all");
    assert.equal(listBody.sla_version, RECOVERY_QUEUE_SLA_VERSION);
    assert.equal(listBody.picker_intelligence_version, RECOVERY_PICKER_INTELLIGENCE_VERSION);
    assert.equal(listBody.assignment_version, RECOVERY_QUEUE_ASSIGNMENT_VERSION);
    assert.equal(listBody.queue.operational_only, true);
    assert.equal(listBody.queue.business_truth_inferred, false);
    assert.doesNotMatch(JSON.stringify(listBody), /private_note|payment_ref|must-not-leak/);

    const exact = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH + "?case_ref=" + encodeURIComponent(CASE_REF)),
      env(),
      actor("owner"),
    );
    assert.equal(exact.status, 200);
    const exactBody = await exact.json();
    assert.equal(exactBody.case.domain, "booking");
    assert.equal(exactBody.case.controls.can_resolve, true);
    assert.equal(exactBody.guardrails.payment_mutated, false);
    assert.equal(exactBody.guardrails.browser_service_binding_exposed, false);
    assert.equal(exactBody.guardrails.assignment_coordination_metadata_only, true);
    assert.equal(exactBody.guardrails.assignment_grants_authority, false);
    assert.equal(exactBody.guardrails.picker_manual_refresh_owner_only, true);
    assert.equal(exactBody.guardrails.picker_manual_refresh_grants_authority, false);
    assert.equal(exactBody.guardrails.picker_manual_refresh_selects_candidate, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Recovery assignment claim/release stays coordination-only and never resets SLA clock", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let stored = matrixRecord("reviewing");
  const originalStateUpdatedAt = stored.fields.state_updated_at;
  const originalPayload = JSON.parse(stored.fields.payload_json);
  const originalWorkflowUpdatedAt = originalPayload.handoff_tracking.updated_at;
  let patchCount = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase();
    if (url.hostname !== "api.airtable.com") throw new Error("unexpected_fetch:" + url.toString());
    if (method === "GET") return Response.json({ records: [stored] });
    if (method === "PATCH") {
      patchCount += 1;
      const body = JSON.parse(String(init.body || "{}"));
      stored = { id: stored.id, fields: { ...stored.fields, ...body.records[0].fields } };
      return Response.json({ records: [stored] });
    }
    throw new Error("unexpected_method:" + method);
  };

  try {
    const claim = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({ case_ref: CASE_REF, action: "claim" }),
      }),
      env(),
      actor("admin"),
    );
    assert.equal(claim.status, 200);
    const claimBody = await claim.json();
    assert.equal(claimBody.case.assignment.status, "assigned");
    assert.equal(claimBody.case.assignment.assignee_label, "Operator");
    assert.equal(claimBody.case.assignment.coordination_only, true);
    assert.equal(claimBody.case.assignment.grants_authority, false);
    assert.equal(claimBody.guardrails.assignment_grants_authority, false);
    assert.equal(claimBody.guardrails.assignment_resets_sla, false);
    assert.equal(patchCount, 1);
    assert.equal(stored.fields.state_updated_at, originalStateUpdatedAt);
    const claimedPayload = JSON.parse(stored.fields.payload_json);
    assert.equal(claimedPayload.handoff_tracking.updated_at, originalWorkflowUpdatedAt);
    assert.equal(claimedPayload.recovery_case.state, "reviewing");
    assert.equal(claimedPayload.business_truth_mutated, false);

    const release = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({ case_ref: CASE_REF, action: "release" }),
      }),
      env(),
      actor("admin"),
    );
    assert.equal(release.status, 200);
    const releaseBody = await release.json();
    assert.equal(releaseBody.case.assignment.status, "unassigned");
    assert.equal(patchCount, 2);
    assert.equal(stored.fields.state_updated_at, originalStateUpdatedAt);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Recovery assignment conflicts fail closed and Owner may takeover/release without business mutation", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let stored = matrixRecord("reviewing");
  const payload = JSON.parse(stored.fields.payload_json);
  payload.recovery_assignment = {
    policy_version: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
    status: "assigned",
    assignee_key: "credential:ops_2",
    assignee_label: "Operator",
    assignee_role: "admin",
    assignee_lane: "operator",
    claimed_at: "2026-09-19T15:10:00.000Z",
    updated_at: "2026-09-19T15:10:00.000Z",
    revision: 1,
    coordination_only: true,
    grants_authority: false,
  };
  stored.fields.payload_json = JSON.stringify(payload);
  let patchCount = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase();
    if (url.hostname !== "api.airtable.com") throw new Error("unexpected_fetch:" + url.toString());
    if (method === "GET") return Response.json({ records: [stored] });
    if (method === "PATCH") {
      patchCount += 1;
      const body = JSON.parse(String(init.body || "{}"));
      stored = { id: stored.id, fields: { ...stored.fields, ...body.records[0].fields } };
      return Response.json({ records: [stored] });
    }
    throw new Error("unexpected_method:" + method);
  };

  try {
    const conflict = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({ case_ref: CASE_REF, action: "claim" }),
      }),
      env(),
      actor("admin"),
    );
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error, "recovery_assignment_conflict");
    assert.equal(patchCount, 0);

    const forbiddenRelease = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({ case_ref: CASE_REF, action: "release" }),
      }),
      env(),
      actor("admin"),
    );
    assert.equal(forbiddenRelease.status, 403);
    assert.equal((await forbiddenRelease.json()).error, "recovery_assignment_release_forbidden");
    assert.equal(patchCount, 0);

    const forbiddenTakeover = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({ case_ref: CASE_REF, action: "takeover" }),
      }),
      env(),
      actor("admin"),
    );
    assert.equal(forbiddenTakeover.status, 403);
    assert.equal((await forbiddenTakeover.json()).error, "recovery_assignment_takeover_owner_required");
    assert.equal(patchCount, 0);

    const takeover = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({ case_ref: CASE_REF, action: "takeover" }),
      }),
      env(),
      actor("owner"),
    );
    assert.equal(takeover.status, 200);
    const takeoverBody = await takeover.json();
    assert.equal(takeoverBody.case.assignment.assignee_label, "Per");
    assert.equal(takeoverBody.case.assignment.assignee_lane, "owner");
    assert.equal(patchCount, 1);

    const ownerRelease = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({ case_ref: CASE_REF, action: "release" }),
      }),
      env(),
      actor("owner"),
    );
    assert.equal(ownerRelease.status, 200);
    assert.equal((await ownerRelease.json()).case.assignment.status, "unassigned");
    assert.equal(patchCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Owner manual picker refresh reissues canonical choices without resetting lifecycle, SLA, assignment, or outcome", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let stored = pickerRecord("reissued", 2, "reviewing");
  const before = JSON.parse(stored.fields.payload_json);
  const originalTrackingUpdatedAt = before.handoff_tracking.updated_at;
  const originalRecoveryUpdatedAt = before.recovery_case.updated_at;
  const originalOutcome = before.recovery_case.outcome_code;
  const originalAssignment = structuredClone(before.recovery_assignment);
  const originalStateUpdatedAt = stored.fields.state_updated_at;
  let patchCount = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase();
    if (url.hostname !== "api.airtable.com") throw new Error("unexpected_fetch:" + url.toString());

    if (url.pathname.endsWith("/tblClients/" + CLIENT_ID)) {
      return Response.json({
        id: CLIENT_ID,
        fields: {
          telegram_user_id: "111111",
          telegram_verification_status: "verified",
          line_user_id: "U0123456789abcdef0123456789abcdef",
          "Client Name": "คุณเชน",
        },
      });
    }

    if (url.pathname.endsWith("/tblBookingRequests")) {
      return Response.json({
        records: [
          {
            id: "recBookingC",
            fields: {
              booking_ref: "kenji_cccccccccccccccccccccccc",
              "Request Status": "pending",
              "Created At": "2026-09-19T16:00:00.000Z",
              "Preferred Date": "2026-10-04",
              "Preferred Time": "21:00",
              "Selected Model Name": "Model C",
              lane: "private",
              resolver_payload_json: JSON.stringify({ canonical_client_id: CLIENT_ID }),
            },
          },
        ],
      });
    }

    if (url.pathname.endsWith("/tblMatrix") && method === "GET") {
      return Response.json({ records: [stored] });
    }
    if (url.pathname.endsWith("/tblMatrix") && method === "PATCH") {
      patchCount += 1;
      const body = JSON.parse(String(init.body || "{}"));
      stored = { id: stored.id, fields: { ...stored.fields, ...body.records[0].fields } };
      return Response.json({ records: [stored] });
    }

    throw new Error("unexpected_fetch:" + url.toString() + ":" + method);
  };

  try {
    const response = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({
          case_ref: CASE_REF,
          action: "refresh_picker",
          picker_revision: 2,
        }),
      }),
      env(),
      actor("owner"),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.action, "refresh_picker");
    assert.equal(body.picker_state, "picker_reissued");
    assert.equal(body.replayed, false);
    assert.equal(body.case.picker.revision, 3);
    assert.equal(body.case.picker.queue_state, "waiting_reselection");
    assert.equal(body.case.picker.candidate_count, 1);
    assert.equal(body.case.picker.delivery_status, "pending_customer_delivery");
    assert.equal(body.case.picker.delivery_revision, 3);
    assert.equal(body.case.controls.can_refresh_picker, true);
    assert.equal(body.guardrails.picker_manual_refresh_grants_authority, false);
    assert.equal(patchCount, 1);

    const after = JSON.parse(stored.fields.payload_json);
    assert.equal(after.handoff_tracking.state, "reviewing");
    assert.equal(after.handoff_tracking.updated_at, originalTrackingUpdatedAt);
    assert.equal(after.recovery_case.updated_at, originalRecoveryUpdatedAt);
    assert.equal(after.recovery_case.outcome_code, originalOutcome);
    assert.deepEqual(after.recovery_assignment, originalAssignment);
    assert.equal(stored.fields.state_updated_at, originalStateUpdatedAt);
    assert.equal(after.business_truth_mutated, false);
    assert.equal(after.recovery_correlation.correlated, false);
    assert.equal(after.recovery_correlation.picker_revision, 3);
    assert.equal(after.recovery_correlation.candidate_count, 1);
    assert.equal(after.recovery_correlation.picker_delivery_status, "pending_customer_delivery");
    assert.equal(after.recovery_correlation.picker_delivery_revision, 3);

    const duplicate = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({
          case_ref: CASE_REF,
          action: "refresh_picker",
          picker_revision: 2,
        }),
      }),
      env(),
      actor("owner"),
    );
    const duplicateBody = await duplicate.json();
    assert.equal(duplicate.status, 200);
    assert.equal(duplicateBody.replayed, true);
    assert.equal(duplicateBody.case.picker.revision, 3);
    assert.equal(patchCount, 1);

    const adminDenied = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({
          case_ref: CASE_REF,
          action: "refresh_picker",
          picker_revision: 3,
        }),
      }),
      env(),
      actor("admin"),
    );
    assert.equal(adminDenied.status, 403);
    assert.equal((await adminDenied.json()).error, "recovery_picker_refresh_owner_required");
    assert.equal(patchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Recovery Control writes require same-origin browser request before Airtable mutation", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("must_not_fetch");
  };
  try {
    const response = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
        body: JSON.stringify({ case_ref: CASE_REF, action: "review" }),
      }),
      env(),
      actor("admin"),
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "forbidden_origin");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Recovery Control resolves through shared transition engine without mutating business truth", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let stored = matrixRecord();
  let patchCount = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase();
    if (url.hostname !== "api.airtable.com") throw new Error("unexpected_fetch:" + url.toString());

    if (method === "GET") return Response.json({ records: [stored] });
    if (method === "PATCH") {
      patchCount += 1;
      const body = JSON.parse(String(init.body || "{}"));
      const row = body.records[0];
      stored = {
        id: stored.id,
        fields: { ...stored.fields, ...row.fields },
      };
      return Response.json({ records: [stored] });
    }
    throw new Error("unexpected_method:" + method);
  };

  try {
    const response = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({
          case_ref: CASE_REF,
          action: "resolve",
          outcome_code: "rebooking_arranged",
        }),
      }),
      env(),
      actor("owner"),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.case.state, "resolved");
    assert.equal(body.case.outcome_code, "rebooking_arranged");
    assert.equal(body.guardrails.job_mutated, false);
    assert.equal(body.guardrails.payment_mutated, false);
    assert.equal(patchCount, 1);

    const persisted = JSON.parse(stored.fields.payload_json);
    assert.equal(persisted.recovery_case.state, "resolved");
    assert.equal(persisted.recovery_case.outcome_code, "rebooking_arranged");
    assert.equal(persisted.business_truth_mutated, false);
    assert.equal(persisted.recovery_correlation.job_id, "JOB-EXACT-001");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("active admin core gates Recovery Control and dispatches authenticated page", { concurrency: false }, async () => {
  const runtimeEnv = env();

  const unauth = await coreWorker.fetch(
    request(RECOVERY_CONTROL_API_PATH + "?limit=1", { headers: { Accept: "application/json" } }),
    runtimeEnv,
    {},
  );
  assert.equal(unauth.status, 401);

  const token = await createCredentialBoundAdminSession(
    request("/internal/admin/login/session"),
    actor("owner"),
    runtimeEnv,
  );
  const authed = await coreWorker.fetch(
    request(RECOVERY_CONTROL_PAGE_PATH, {
      headers: { Cookie: "mmd_admin_gate_v1=" + token, Accept: "text/html" },
    }),
    runtimeEnv,
    {},
  );
  assert.equal(authed.status, 200);
  assert.match(await authed.text(), /Recovery Control/);
});

test("wrangler owns exact and query-safe Recovery Control routes only", async () => {
  const wrangler = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");
  const routes = [
    "mmdbkk.com/internal/admin/recovery",
    "www.mmdbkk.com/internal/admin/recovery",
    "mmdbkk.com/internal/admin/recovery*",
    "www.mmdbkk.com/internal/admin/recovery*",
    "mmdbkk.com/v1/admin/recovery/cases",
    "www.mmdbkk.com/v1/admin/recovery/cases",
    "mmdbkk.com/v1/admin/recovery/cases*",
    "www.mmdbkk.com/v1/admin/recovery/cases*",
  ];
  for (const route of routes) assert.ok(wrangler.includes('pattern = "' + route + '"'), "missing route " + route);
  assert.equal(wrangler.includes('pattern = "mmdbkk.com/internal/admin/*"'), false);
});
