import test from "node:test";
import assert from "node:assert/strict";

import {
  HYPE_HANDOFF_STATUS_PATH,
  handleHypeHandoffStatusRpc,
} from "./src/hype-handoff-runtime.js";

const BASE_ENV = {
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_API_KEY: "airtable-test-token",
  AIRTABLE_TABLE_CLIENTS_ID: "tblClients",
  AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID: "tblMatrix",
  AIRTABLE_TABLE_BOOKING_REQUESTS_ID: "tblBookingRequests",
  AIRTABLE_TABLE_SESSIONS: "tblSessions",
  AIRTABLE_TABLE_JOBS: "tblJobs",
};

const CLIENT_ID = "recClientA1";
const TELEGRAM_ID = "111111";
const LIFE_UPDATED = "2026-09-19T13:00:00.000Z";

function internalRequest(body) {
  return new Request("https://admin-worker.internal" + HYPE_HANDOFF_STATUS_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-service-binding": "telegram-worker",
    },
    body: JSON.stringify(body),
  });
}

function clientRecord(id = CLIENT_ID, telegramId = TELEGRAM_ID) {
  return {
    id,
    fields: {
      telegram_user_id: telegramId,
      telegram_verification_status: "verified",
      line_user_id: "U0123456789abcdef0123456789abcdef",
      "Client Name": "Client A",
    },
  };
}

function recoveryMatrix({
  caseRef,
  domain,
  options,
  state = "reviewing",
  assignment = true,
}) {
  return {
    id: "recMatrixPicker",
    fields: {
      Client: [CLIENT_ID],
      pending_reference: caseRef,
      version: 7,
      state_updated_at: LIFE_UPDATED,
      conversation_stage: "handoff_" + state,
      payload_json: JSON.stringify({
        handoff_id: caseRef,
        handoff_target: "per",
        handoff_tracking: {
          id: caseRef,
          target: "per",
          state,
          updated_at: LIFE_UPDATED,
          actor_role: "owner",
        },
        recovery_case: {
          schema: "mmd.recovery_case.v1",
          taxonomy_version: "mmd-recovery-outcome-taxonomy-v1-20260919",
          case_ref: caseRef,
          domain,
          state,
          outcome_code: "intake_received",
          actor_role: "owner",
          updated_at: LIFE_UPDATED,
          business_truth_mutated: false,
        },
        recovery_assignment: assignment ? {
          policy_version: "mmd-recovery-assignment-v1-20260919",
          status: "assigned",
          assignee_key: "credential:per",
          assignee_label: "Per",
          assignee_role: "owner",
          assignee_lane: "owner",
          claimed_at: "2026-09-19T12:45:00.000Z",
          updated_at: "2026-09-19T12:45:00.000Z",
          revision: 2,
          coordination_only: true,
          grants_authority: false,
        } : undefined,
        recovery_correlation: {
          domain,
          state: "ambiguous",
          correlated: false,
          case_ref: caseRef,
          candidate_count: options.length,
          options,
          method: "customer_select_owned_" + domain,
          source_authority: domain === "mmd_shop"
            ? "member-pages-worker"
            : domain === "booking"
              ? "sigil-booking-worker"
              : "mms-worker/member-prebookings",
          live_refresh_status: "fresh",
          picker_revision: 1,
          picker_status: "active",
          picker_issued_at: "2026-09-19T12:50:00.000Z",
          picker_reissue_count: 0,
        },
        business_truth_mutated: false,
      }),
    },
  };
}

function bookingOption(ref, date, model) {
  return {
    booking_ref: ref,
    request_status: "pending",
    preferred_date: date,
    preferred_time: "19:00",
    selected_model_name: model,
    summary: model + " · private",
    created_at: "2026-09-19T10:00:00.000Z",
  };
}

function bookingRecord(ref, sessionId) {
  return {
    id: "recBooking" + ref.slice(-2),
    fields: {
      booking_ref: ref,
      "Request Status": "pending",
      "Created At": "2026-09-19T10:00:00.000Z",
      "Preferred Date": "2026-10-03",
      "Preferred Time": "20:30",
      "Selected Model Name": "Current Model",
      lane: "private",
      resolver_payload_json: JSON.stringify({
        canonical_client_id: CLIENT_ID,
        job_creation_state: "created",
        job_receipt: sessionId ? { session_id: sessionId } : {},
      }),
    },
  };
}

function mmsOption(ref, date, zone) {
  return {
    request_id: ref,
    prebooking_id: ref,
    status: "matching",
    prebooking_status: "matching",
    service_date: date,
    service_time: "19:00",
    zone,
    skills: ["Aroma Oil"],
    created_at: "2026-09-19T10:00:00.000Z",
  };
}

function shopOrder(id, itemName) {
  return {
    order_id: id,
    order_date: "2026-09-19T10:00:00.000Z",
    order_status: "confirmed",
    payment_status: "paid",
    total_thb: 2500,
    items: [{ item_name: itemName, quantity: 1, line_total_thb: 2500, status: "confirmed" }],
    fulfillment: { state: "packing", delivery_method: "delivery" },
  };
}

test("Booking stale picker reissues revision 2; old revision cannot bind a new index and duplicate stale callback is idempotent", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const caseRef = "HYPE-PER-20260920100000-acde1001";
  const refA = "kenji_aaaaaaaaaaaaaaaaaaaaaaaa";
  const refB = "kenji_bbbbbbbbbbbbbbbbbbbbbbbb";
  const refD = "kenji_dddddddddddddddddddddddd";
  let matrix = recoveryMatrix({
    caseRef,
    domain: "booking",
    options: [
      bookingOption(refA, "2026-10-02", "Model A"),
      bookingOption(refB, "2026-10-03", "Model B"),
    ],
  });
  const originalPayload = JSON.parse(matrix.fields.payload_json);
  const originalAssignment = structuredClone(originalPayload.recovery_assignment);
  let matrixPatchCount = 0;
  let bookingAuthorityReads = 0;

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = String(init.method || "GET").toUpperCase();

    if (parsed.pathname.endsWith("/tblClients") || parsed.pathname.endsWith("/tblClients/" + CLIENT_ID)) {
      return Response.json(parsed.pathname.endsWith("/" + CLIENT_ID)
        ? clientRecord()
        : { records: [clientRecord()] });
    }

    if (parsed.pathname.endsWith("/tblMatrix") && method === "GET") {
      return Response.json({ records: [matrix] });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && method === "PATCH") {
      matrixPatchCount += 1;
      const body = JSON.parse(String(init.body || "{}"));
      matrix = {
        id: matrix.id,
        fields: { ...matrix.fields, ...body.records[0].fields },
      };
      return Response.json({ records: [matrix] });
    }

    if (parsed.pathname.endsWith("/tblBookingRequests")) {
      bookingAuthorityReads += 1;
      const formula = decodeURIComponent(parsed.searchParams.get("filterByFormula") || "");
      if (formula.includes("FIND(")) {
        return Response.json({
          records: [
            bookingRecord(refA, "sess_a"),
            bookingRecord(refD, "sess_d"),
          ],
        });
      }
      if (formula.includes(refB)) return Response.json({ records: [] });
      if (formula.includes(refD)) return Response.json({ records: [bookingRecord(refD, "sess_d")] });
      if (formula.includes(refA)) return Response.json({ records: [bookingRecord(refA, "sess_a")] });
      return Response.json({ records: [] });
    }

    if (parsed.pathname.endsWith("/tblSessions")) {
      const formula = decodeURIComponent(parsed.searchParams.get("filterByFormula") || "");
      if (formula.includes("sess_d")) {
        return Response.json({ records: [{
          id: "recSessionD",
          fields: { session_id: "sess_d", job_id: "JOB-D", session_state: "confirmed" },
        }] });
      }
      return Response.json({ records: [] });
    }

    if (parsed.pathname.endsWith("/tblJobs")) {
      const formula = decodeURIComponent(parsed.searchParams.get("filterByFormula") || "");
      if (formula.includes("sess_d")) {
        return Response.json({ records: [{
          id: "recJobD",
          fields: { session_id: "sess_d", job_id: "JOB-D", status: "confirmed" },
        }] });
      }
      return Response.json({ records: [] });
    }

    throw new Error("unexpected fetch " + parsed.pathname + " " + method);
  };

  try {
    const stale = await handleHypeHandoffStatusRpc(internalRequest({
      operation: "select_recovery_booking",
      telegram_user_id: TELEGRAM_ID,
      handoff_id: caseRef,
      picker_revision: 1,
      selection_index: 1,
    }), BASE_ENV);
    const staleBody = await stale.json();

    assert.equal(stale.status, 200);
    assert.equal(staleBody.state, "picker_reissued");
    assert.equal(staleBody.replayed, false);
    assert.equal(staleBody.handoff_id, caseRef);
    assert.equal(staleBody.recovery_correlation.picker_revision, 2);
    assert.equal(staleBody.recovery_correlation.picker_status, "reissued");
    assert.equal(staleBody.recovery_correlation.picker_reissue_count, 1);
    assert.equal(staleBody.recovery_correlation.last_reissue_source, "r1_1");
    assert.equal(staleBody.recovery_correlation.correlated, false);
    assert.equal(staleBody.recovery_correlation.booking_ref, null);
    assert.deepEqual(
      staleBody.recovery_correlation.options.map((item) => item.booking_ref),
      [refA, refD],
    );
    assert.equal(matrixPatchCount, 1);

    const storedAfterRefresh = JSON.parse(matrix.fields.payload_json);
    assert.equal(storedAfterRefresh.handoff_tracking.state, "reviewing");
    assert.equal(storedAfterRefresh.handoff_tracking.updated_at, LIFE_UPDATED);
    assert.equal(storedAfterRefresh.recovery_case.updated_at, LIFE_UPDATED);
    assert.deepEqual(storedAfterRefresh.recovery_assignment, originalAssignment);
    assert.equal(storedAfterRefresh.recovery_case.outcome_code, "intake_received");
    assert.equal(matrix.fields.state_updated_at, LIFE_UPDATED);
    assert.equal(storedAfterRefresh.business_truth_mutated, false);

    const readsAfterFirst = bookingAuthorityReads;
    const duplicateOld = await handleHypeHandoffStatusRpc(internalRequest({
      operation: "select_recovery_booking",
      telegram_user_id: TELEGRAM_ID,
      handoff_id: caseRef,
      picker_revision: 1,
      selection_index: 1,
    }), BASE_ENV);
    const duplicateBody = await duplicateOld.json();

    assert.equal(duplicateOld.status, 200);
    assert.equal(duplicateBody.state, "picker_reissued");
    assert.equal(duplicateBody.replayed, true);
    assert.equal(duplicateBody.recovery_correlation.picker_revision, 2);
    assert.equal(duplicateBody.recovery_correlation.booking_ref, null);
    assert.equal(duplicateBody.recovery_correlation.options[1].booking_ref, refD);
    assert.equal(matrixPatchCount, 1);
    assert.equal(bookingAuthorityReads, readsAfterFirst);

    const currentSelection = await handleHypeHandoffStatusRpc(internalRequest({
      operation: "select_recovery_booking",
      telegram_user_id: TELEGRAM_ID,
      handoff_id: caseRef,
      picker_revision: 2,
      selection_index: 1,
    }), BASE_ENV);
    const selectedBody = await currentSelection.json();

    assert.equal(currentSelection.status, 200);
    assert.equal(selectedBody.state, "correlated");
    assert.equal(selectedBody.replayed, false);
    assert.equal(selectedBody.recovery_correlation.booking_ref, refD);
    assert.equal(selectedBody.recovery_correlation.session_id, "sess_d");
    assert.equal(selectedBody.recovery_correlation.job_id, "JOB-D");
    assert.equal(selectedBody.recovery_correlation.picker_revision, 2);
    assert.equal(selectedBody.recovery_correlation.picker_status, "selected");
    assert.equal(matrixPatchCount, 2);

    const storedAfterBind = JSON.parse(matrix.fields.payload_json);
    assert.equal(storedAfterBind.handoff_tracking.state, "reviewing");
    assert.equal(storedAfterBind.handoff_tracking.updated_at, LIFE_UPDATED);
    assert.equal(storedAfterBind.recovery_case.updated_at, LIFE_UPDATED);
    assert.deepEqual(storedAfterBind.recovery_assignment, originalAssignment);
    assert.equal(matrix.fields.state_updated_at, LIFE_UPDATED);
    assert.equal(storedAfterBind.business_truth_mutated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stale refresh with one Booking candidate requires a new explicit tap before binding", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const caseRef = "HYPE-PER-20260920101000-acde1002";
  const refA = "kenji_aaaaaaaaaaaaaaaaaaaaaaaa";
  const refB = "kenji_bbbbbbbbbbbbbbbbbbbbbbbb";
  const refC = "kenji_cccccccccccccccccccccccc";
  let matrix = recoveryMatrix({
    caseRef,
    domain: "booking",
    state: "acknowledged",
    options: [
      bookingOption(refA, "2026-10-02", "Model A"),
      bookingOption(refB, "2026-10-03", "Model B"),
    ],
  });
  let patchCount = 0;

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = String(init.method || "GET").toUpperCase();
    if (parsed.pathname.endsWith("/tblClients") || parsed.pathname.endsWith("/tblClients/" + CLIENT_ID)) {
      return Response.json(parsed.pathname.endsWith("/" + CLIENT_ID)
        ? clientRecord()
        : { records: [clientRecord()] });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && method === "GET") return Response.json({ records: [matrix] });
    if (parsed.pathname.endsWith("/tblMatrix") && method === "PATCH") {
      patchCount += 1;
      const body = JSON.parse(String(init.body || "{}"));
      matrix = { id: matrix.id, fields: { ...matrix.fields, ...body.records[0].fields } };
      return Response.json({ records: [matrix] });
    }
    if (parsed.pathname.endsWith("/tblBookingRequests")) {
      const formula = decodeURIComponent(parsed.searchParams.get("filterByFormula") || "");
      if (formula.includes("FIND(")) return Response.json({ records: [bookingRecord(refC, "sess_c")] });
      if (formula.includes(refB)) return Response.json({ records: [] });
      if (formula.includes(refC)) return Response.json({ records: [bookingRecord(refC, "sess_c")] });
      return Response.json({ records: [] });
    }
    if (parsed.pathname.endsWith("/tblSessions")) {
      const formula = decodeURIComponent(parsed.searchParams.get("filterByFormula") || "");
      return formula.includes("sess_c")
        ? Response.json({ records: [{ id: "recSessionC", fields: { session_id: "sess_c", job_id: "JOB-C", session_state: "confirmed" } }] })
        : Response.json({ records: [] });
    }
    if (parsed.pathname.endsWith("/tblJobs")) {
      const formula = decodeURIComponent(parsed.searchParams.get("filterByFormula") || "");
      return formula.includes("sess_c")
        ? Response.json({ records: [{ id: "recJobC", fields: { session_id: "sess_c", job_id: "JOB-C", status: "confirmed" } }] })
        : Response.json({ records: [] });
    }
    throw new Error("unexpected fetch " + parsed.pathname + " " + method);
  };

  try {
    const refresh = await handleHypeHandoffStatusRpc(internalRequest({
      operation: "select_recovery_booking",
      telegram_user_id: TELEGRAM_ID,
      handoff_id: caseRef,
      picker_revision: 1,
      selection_index: 1,
    }), BASE_ENV);
    const refreshBody = await refresh.json();

    assert.equal(refresh.status, 200);
    assert.equal(refreshBody.state, "picker_reissued");
    assert.equal(refreshBody.recovery_correlation.picker_revision, 2);
    assert.equal(refreshBody.recovery_correlation.candidate_count, 1);
    assert.equal(refreshBody.recovery_correlation.correlated, false);
    assert.equal(refreshBody.recovery_correlation.booking_ref, null);
    assert.equal(refreshBody.recovery_correlation.options[0].booking_ref, refC);
    assert.equal(patchCount, 1);

    const confirm = await handleHypeHandoffStatusRpc(internalRequest({
      operation: "select_recovery_booking",
      telegram_user_id: TELEGRAM_ID,
      handoff_id: caseRef,
      picker_revision: 2,
      selection_index: 0,
    }), BASE_ENV);
    const confirmBody = await confirm.json();

    assert.equal(confirm.status, 200);
    assert.equal(confirmBody.state, "correlated");
    assert.equal(confirmBody.recovery_correlation.booking_ref, refC);
    assert.equal(confirmBody.recovery_correlation.picker_revision, 2);
    assert.equal(patchCount, 2);
    assert.equal(matrix.fields.state_updated_at, LIFE_UPDATED);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stale refresh with zero candidates keeps the same Case active without guessing", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const caseRef = "HYPE-PER-20260920102000-acde1003";
  const refA = "kenji_aaaaaaaaaaaaaaaaaaaaaaaa";
  const refB = "kenji_bbbbbbbbbbbbbbbbbbbbbbbb";
  let matrix = recoveryMatrix({
    caseRef,
    domain: "booking",
    state: "sent",
    options: [
      bookingOption(refA, "2026-10-02", "Model A"),
      bookingOption(refB, "2026-10-03", "Model B"),
    ],
  });

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = String(init.method || "GET").toUpperCase();
    if (parsed.pathname.endsWith("/tblClients") || parsed.pathname.endsWith("/tblClients/" + CLIENT_ID)) {
      return Response.json(parsed.pathname.endsWith("/" + CLIENT_ID)
        ? clientRecord()
        : { records: [clientRecord()] });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && method === "GET") return Response.json({ records: [matrix] });
    if (parsed.pathname.endsWith("/tblMatrix") && method === "PATCH") {
      const body = JSON.parse(String(init.body || "{}"));
      matrix = { id: matrix.id, fields: { ...matrix.fields, ...body.records[0].fields } };
      return Response.json({ records: [matrix] });
    }
    if (parsed.pathname.endsWith("/tblBookingRequests")) return Response.json({ records: [] });
    throw new Error("unexpected fetch " + parsed.pathname + " " + method);
  };

  try {
    const response = await handleHypeHandoffStatusRpc(internalRequest({
      operation: "select_recovery_booking",
      telegram_user_id: TELEGRAM_ID,
      handoff_id: caseRef,
      picker_revision: 1,
      selection_index: 1,
    }), BASE_ENV);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.state, "no_current_candidates");
    assert.equal(body.handoff_id, caseRef);
    assert.equal(body.recovery_correlation.picker_revision, 2);
    assert.equal(body.recovery_correlation.picker_status, "no_current_candidates");
    assert.equal(body.recovery_correlation.candidate_count, 0);
    assert.deepEqual(body.recovery_correlation.options, []);

    const stored = JSON.parse(matrix.fields.payload_json);
    assert.equal(stored.handoff_tracking.state, "sent");
    assert.equal(stored.handoff_tracking.updated_at, LIFE_UPDATED);
    assert.equal(stored.recovery_case.updated_at, LIFE_UPDATED);
    assert.equal(stored.business_truth_mutated, false);
    assert.equal(matrix.fields.state_updated_at, LIFE_UPDATED);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MMS stale picker refreshes current owned Pre-bookings under the same Case revision", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const caseRef = "HYPE-PER-20260920103000-acde1004";
  const ref1 = "mmspre_111111111111111111111111";
  const ref2 = "mmspre_222222222222222222222222";
  const ref3 = "mmspre_333333333333333333333333";
  let matrix = recoveryMatrix({
    caseRef,
    domain: "mms",
    state: "acknowledged",
    options: [
      mmsOption(ref1, "2026-10-02", "Sukhumvit"),
      mmsOption(ref2, "2026-10-03", "Silom"),
    ],
  });
  let mmsReads = 0;

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = String(init.method || "GET").toUpperCase();
    if (parsed.pathname.endsWith("/tblClients") || parsed.pathname.endsWith("/tblClients/" + CLIENT_ID)) {
      return Response.json(parsed.pathname.endsWith("/" + CLIENT_ID)
        ? clientRecord()
        : { records: [clientRecord()] });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && method === "GET") return Response.json({ records: [matrix] });
    if (parsed.pathname.endsWith("/tblMatrix") && method === "PATCH") {
      const body = JSON.parse(String(init.body || "{}"));
      matrix = { id: matrix.id, fields: { ...matrix.fields, ...body.records[0].fields } };
      return Response.json({ records: [matrix] });
    }
    throw new Error("unexpected fetch " + parsed.pathname + " " + method);
  };

  const env = {
    ...BASE_ENV,
    MMS_WORKER: {
      async fetch(request) {
        const url = new URL(request.url);
        assert.equal(url.pathname, "/internal/mms/member/prebookings");
        assert.equal(url.searchParams.get("member_ref"), CLIENT_ID);
        mmsReads += 1;
        return Response.json({
          ok: true,
          data: {
            requests: [
              mmsOption(ref1, "2026-10-02", "Sukhumvit"),
              mmsOption(ref3, "2026-10-04", "Sathorn"),
            ],
          },
        });
      },
    },
  };

  try {
    const response = await handleHypeHandoffStatusRpc(internalRequest({
      operation: "select_recovery_mms",
      telegram_user_id: TELEGRAM_ID,
      handoff_id: caseRef,
      picker_revision: 1,
      selection_index: 1,
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.state, "picker_reissued");
    assert.equal(body.handoff_id, caseRef);
    assert.equal(body.recovery_correlation.picker_revision, 2);
    assert.deepEqual(
      body.recovery_correlation.options.map((item) => item.prebooking_id),
      [ref1, ref3],
    );
    assert.equal(body.recovery_correlation.prebooking_id, null);
    assert.equal(mmsReads, 2);

    const stored = JSON.parse(matrix.fields.payload_json);
    assert.equal(stored.handoff_tracking.state, "acknowledged");
    assert.equal(stored.handoff_tracking.updated_at, LIFE_UPDATED);
    assert.equal(matrix.fields.state_updated_at, LIFE_UPDATED);
    assert.equal(stored.business_truth_mutated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Shop stale picker refreshes owned Orders and preserves lifecycle/SLA metadata", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const caseRef = "HYPE-PER-20260920104000-acde1005";
  const orderA = shopOrder("MMD-ORDER-A", "GG Water 25ml");
  const orderB = shopOrder("MMD-ORDER-B", "GG Water 50ml");
  const orderC = shopOrder("MMD-ORDER-C", "GG Water 10ml");
  let matrix = recoveryMatrix({
    caseRef,
    domain: "mmd_shop",
    state: "reviewing",
    options: [
      { order_id: orderA.order_id, order_date: orderA.order_date, order_status: "confirmed", payment_status: "paid", fulfillment_state: "packing", total_thb: 2500, item_summary: "GG Water 25ml" },
      { order_id: orderB.order_id, order_date: orderB.order_date, order_status: "confirmed", payment_status: "paid", fulfillment_state: "packing", total_thb: 2500, item_summary: "GG Water 50ml" },
    ],
  });
  let shopReads = 0;

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = String(init.method || "GET").toUpperCase();
    if (parsed.pathname.endsWith("/tblClients") || parsed.pathname.endsWith("/tblClients/" + CLIENT_ID)) {
      return Response.json(parsed.pathname.endsWith("/" + CLIENT_ID)
        ? clientRecord()
        : { records: [clientRecord()] });
    }
    if (parsed.pathname.endsWith("/tblMatrix") && method === "GET") return Response.json({ records: [matrix] });
    if (parsed.pathname.endsWith("/tblMatrix") && method === "PATCH") {
      const body = JSON.parse(String(init.body || "{}"));
      matrix = { id: matrix.id, fields: { ...matrix.fields, ...body.records[0].fields } };
      return Response.json({ records: [matrix] });
    }
    throw new Error("unexpected fetch " + parsed.pathname + " " + method);
  };

  const env = {
    ...BASE_ENV,
    MEMBER_PAGES_SHOP_ORDERS: {
      async fetch(request) {
        shopReads += 1;
        const body = JSON.parse(await request.clone().text());
        if (body.order_id === orderB.order_id) {
          return Response.json({
            ok: true,
            authority: "mmd.hype_shop_orders_projection.v1",
            orders: [],
            correlation: {
              requested_order_id: orderB.order_id,
              exact_owned_match: false,
              auto_correlation_allowed: false,
              candidate_count: 0,
              candidate_order_id: null,
              candidate_order_ids: [],
              method: "explicit_order_id_not_owned_or_missing",
            },
            guardrails: { read_only: true },
          });
        }
        return Response.json({
          ok: true,
          authority: "mmd.hype_shop_orders_projection.v1",
          orders: [orderA, orderC],
          correlation: {
            requested_order_id: null,
            exact_owned_match: false,
            auto_correlation_allowed: false,
            candidate_count: 2,
            candidate_order_id: null,
            candidate_order_ids: [orderA.order_id, orderC.order_id],
            method: "ambiguous_recent_owned_orders",
          },
          guardrails: { read_only: true },
        });
      },
    },
  };

  try {
    const response = await handleHypeHandoffStatusRpc(internalRequest({
      operation: "select_recovery_order",
      telegram_user_id: TELEGRAM_ID,
      handoff_id: caseRef,
      picker_revision: 1,
      selection_index: 1,
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.state, "picker_reissued");
    assert.equal(body.recovery_correlation.picker_revision, 2);
    assert.deepEqual(
      body.recovery_correlation.options.map((item) => item.order_id),
      [orderA.order_id, orderC.order_id],
    );
    assert.equal(body.recovery_correlation.order_id, null);
    assert.equal(shopReads, 2);

    const stored = JSON.parse(matrix.fields.payload_json);
    assert.equal(stored.handoff_tracking.state, "reviewing");
    assert.equal(stored.handoff_tracking.updated_at, LIFE_UPDATED);
    assert.equal(stored.recovery_case.updated_at, LIFE_UPDATED);
    assert.equal(matrix.fields.state_updated_at, LIFE_UPDATED);
    assert.equal(stored.business_truth_mutated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authority unavailable and foreign or terminal picker callbacks fail safely without guessing", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const caseRef = "HYPE-PER-20260920105000-acde1006";
  const refA = "kenji_aaaaaaaaaaaaaaaaaaaaaaaa";
  const refB = "kenji_bbbbbbbbbbbbbbbbbbbbbbbb";
  let matrix = recoveryMatrix({
    caseRef,
    domain: "booking",
    options: [
      bookingOption(refA, "2026-10-02", "Model A"),
      bookingOption(refB, "2026-10-03", "Model B"),
    ],
  });

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = String(init.method || "GET").toUpperCase();

    if (parsed.pathname.endsWith("/tblClients")) {
      const formula = decodeURIComponent(parsed.searchParams.get("filterByFormula") || "");
      return Response.json({
        records: [formula.includes("222222")
          ? clientRecord("recClientB2", "222222")
          : clientRecord()],
      });
    }
    if (parsed.pathname.endsWith("/tblClients/" + CLIENT_ID)) return Response.json(clientRecord());
    if (parsed.pathname.endsWith("/tblClients/recClientB2")) return Response.json(clientRecord("recClientB2", "222222"));
    if (parsed.pathname.endsWith("/tblMatrix") && method === "GET") return Response.json({ records: [matrix] });
    if (parsed.pathname.endsWith("/tblMatrix") && method === "PATCH") {
      const body = JSON.parse(String(init.body || "{}"));
      matrix = { id: matrix.id, fields: { ...matrix.fields, ...body.records[0].fields } };
      return Response.json({ records: [matrix] });
    }
    if (parsed.pathname.endsWith("/tblBookingRequests")) {
      return Response.json({ ok: false }, { status: 503 });
    }
    throw new Error("unexpected fetch " + parsed.pathname + " " + method);
  };

  try {
    const unavailable = await handleHypeHandoffStatusRpc(internalRequest({
      operation: "select_recovery_booking",
      telegram_user_id: TELEGRAM_ID,
      handoff_id: caseRef,
      picker_revision: 1,
      selection_index: 1,
    }), BASE_ENV);
    const unavailableBody = await unavailable.json();

    assert.equal(unavailable.status, 200);
    assert.equal(unavailableBody.state, "authority_unavailable");
    assert.equal(unavailableBody.recovery_correlation.picker_revision, 1);
    assert.equal(unavailableBody.recovery_correlation.picker_status, "stale");
    assert.equal(unavailableBody.recovery_correlation.correlated, false);
    assert.equal(unavailableBody.handoff_id, caseRef);
    assert.equal(matrix.fields.state_updated_at, LIFE_UPDATED);

    const foreign = await handleHypeHandoffStatusRpc(internalRequest({
      operation: "select_recovery_booking",
      telegram_user_id: "222222",
      handoff_id: caseRef,
      picker_revision: 1,
      selection_index: 0,
    }), BASE_ENV);
    const foreignBody = await foreign.json();
    assert.equal(foreign.status, 404);
    assert.equal(foreignBody.error, "handoff_not_found");

    const payload = JSON.parse(matrix.fields.payload_json);
    payload.handoff_tracking.state = "customer_notified";
    payload.recovery_case.state = "customer_notified";
    matrix.fields.payload_json = JSON.stringify(payload);

    const terminal = await handleHypeHandoffStatusRpc(internalRequest({
      operation: "select_recovery_booking",
      telegram_user_id: TELEGRAM_ID,
      handoff_id: caseRef,
      picker_revision: 1,
      selection_index: 0,
    }), BASE_ENV);
    const terminalBody = await terminal.json();
    assert.equal(terminal.status, 409);
    assert.equal(terminalBody.error, "recovery_case_terminal");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
