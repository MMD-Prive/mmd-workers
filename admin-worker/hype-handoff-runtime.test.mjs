import test from "node:test";
import assert from "node:assert/strict";

import {
  HYPE_CONTINUITY_PATH,
  HYPE_HANDOFF_PATH,
  HYPE_TRANSACTION_INTAKE_PATH,
  HYPE_SUPERVISED_EXECUTION_PATH,
  handleHypeContinuityRpc,
  handleHypeHandoffRpc,
  handleHypeTransactionIntakeRpc,
  handleHypeSupervisedExecutionRpc,
  normalizeTransactionFields,
  mergeTransactionDraft,
  canonicalTransactionRoute,
  transactionGuardrails,
  executeP6Booking,
  executeP6Mms,
  executeP6PaymentProof,
  executeP6Renewal,
  safeExecutionReceipt,
  p6ExecutionGuardrails,
  buildExecutionId,
} from "./src/hype-handoff-runtime.js";

const ENV = {
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_API_KEY: "airtable-test-token",
  AIRTABLE_TABLE_CLIENTS_ID: "tblClients",
  AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID: "tblMatrix",
};

function internalRequest(path, body, caller = "telegram-worker") {
  return new Request(`https://admin-worker.internal${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-service-binding": caller,
    },
    body: JSON.stringify(body),
  });
}

test("HYPE continuity and handoff endpoints are service-binding only", async () => {
  const publicContinuity = await handleHypeContinuityRpc(
    new Request(`https://www.mmdbkk.com${HYPE_CONTINUITY_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mmd-service-binding": "telegram-worker" },
      body: "{}",
    }),
    ENV,
  );
  assert.equal(publicContinuity.status, 403);

  const wrongCaller = await handleHypeHandoffRpc(
    internalRequest(HYPE_HANDOFF_PATH, { telegram_user_id: "111111", target: "kenji" }, "browser"),
    ENV,
  );
  assert.equal(wrongCaller.status, 403);

  const transactionWrongCaller = await handleHypeTransactionIntakeRpc(
    internalRequest(HYPE_TRANSACTION_INTAKE_PATH, { telegram_user_id: "111111", mode: "booking" }, "browser"),
    ENV,
  );
  assert.equal(transactionWrongCaller.status, 403);

  const executionWrongCaller = await handleHypeSupervisedExecutionRpc(
    internalRequest(HYPE_SUPERVISED_EXECUTION_PATH, { telegram_user_id: "111111", operation: "execute" }, "browser"),
    ENV,
  );
  assert.equal(executionWrongCaller.status, 403);
});

test("HYPE continuity writes a bounded cross-channel Matrix row for a linked canonical client", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblClients")) {
      return Response.json({
        records: [{
          id: "recClientA1",
          fields: {
            telegram_user_id: "111111",
            telegram_verification_status: "verified",
            line_user_id: "U0123456789abcdef0123456789abcdef",
            "Client Name": "Client A",
          },
        }],
      });
    }

    if (parsed.pathname.endsWith("/tblMatrix") && (!init.method || init.method === "GET")) {
      return Response.json({ records: [] });
    }

    if (parsed.pathname.endsWith("/tblMatrix") && init.method === "POST") {
      const payload = JSON.parse(String(init.body || "{}"));
      writes.push(payload);
      return Response.json({ records: [{ id: "recMatrixA1", fields: payload.records?.[0]?.fields || {} }] });
    }

    throw new Error(`unexpected fetch ${parsed.pathname} ${init.method || "GET"}`);
  };

  try {
    const response = await handleHypeContinuityRpc(internalRequest(HYPE_CONTINUITY_PATH, {
      telegram_user_id: "111111",
      command: "payment",
      customer_message: "เช็กยอด",
      projection: {
        ok: true,
        state: "ready",
        membership: { level: "private_premium", lifecycle: "active", blocked: false },
        job: { active_count: 1, next: { status: "confirmed", model_name: "Model A", start_at: "2026-09-20T19:00:00+07:00" } },
        payment: { status: "pending_review", paid: false, review_required: true, outstanding_amount_thb: 5000 },
        next_action: { action: "review_payment", label: "รอ MMD ตรวจหลักฐาน" },
      },
    }), ENV);

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.persisted, true);
    assert.equal(body.line_continuity_ready, true);
    assert.equal(writes.length, 1);

    const fields = writes[0].records[0].fields;
    assert.equal(fields.channel, "telegram_hype");
    assert.equal(fields.last_customer_intent, "payment");
    assert.equal(fields.conversation_stage, "awaiting_payment_verification");
    assert.equal(fields.handoff_required, false);
    assert.match(fields.continuity_summary, /Payment proof is awaiting canonical review/);
    assert.match(fields.important_open_loops_json, /payment_verification/);
    assert.match(fields.do_not_ask_again_json, /telegram_identity/);

    const serialized = JSON.stringify(fields);
    assert.doesNotMatch(serialized, /AIRTABLE_API_KEY|airtable-test-token|raw_private_note|payment_ref_raw/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE continuity stays canonical-only when LINE identity is not linked", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let matrixTouched = false;

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblClients")) {
      return Response.json({
        records: [{
          id: "recClientA1",
          fields: {
            telegram_user_id: "111111",
            telegram_verification_status: "verified",
            "Client Name": "Client A",
          },
        }],
      });
    }
    matrixTouched = true;
    throw new Error("matrix must not be touched without LINE identity");
  };

  try {
    const response = await handleHypeContinuityRpc(internalRequest(HYPE_CONTINUITY_PATH, {
      telegram_user_id: "111111",
      command: "status",
      projection: { ok: true, state: "ready" },
    }), ENV);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.persisted, false);
    assert.equal(body.state, "canonical_only");
    assert.equal(body.reason, "line_identity_not_linked");
    assert.equal(matrixTouched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("P5 transaction helpers prepare booking and MMS drafts without protected truth", () => {
  const booking = mergeTransactionDraft("booking", {}, normalizeTransactionFields("booking", {
    service_intent: "dining",
    preferred_date: "2026-09-25",
    preferred_time: "19:30",
    area: "Sathorn",
    model_preference: "Book EI",
    payment_ref: "must-not-copy",
    canonical_client_id: "must-not-copy",
  }));

  assert.equal(booking.complete, true);
  assert.deepEqual(booking.missing_fields, []);
  assert.equal(booking.fields.service_intent, "dining");
  assert.equal(booking.fields.area, "Sathorn");
  assert.equal(Object.hasOwn(booking.fields, "payment_ref"), false);
  assert.equal(Object.hasOwn(booking.fields, "canonical_client_id"), false);

  const mms = mergeTransactionDraft("mms", {}, normalizeTransactionFields("mms", {
    zone: "sathorn_silom",
    service_date: "2026-09-26",
    service_time: "20:00",
    skills: ["aroma_therapy_oil"],
  }));
  assert.equal(mms.complete, false);
  assert.deepEqual(mms.missing_fields, ["recipient_gender"]);
});

test("P5 payment proof stores evidence presence only and never raw Telegram media identifiers", () => {
  const proof = normalizeTransactionFields("payment_proof", {
    evidence_present: true,
    evidence_type: "photo",
    file_id: "AgAC-secret-file-id",
    file_unique_id: "secret-unique-id",
    payment_ref: "pay-secret",
  });
  assert.deepEqual(proof, {
    evidence_present: true,
    evidence_type: "photo",
  });

  const guardrails = transactionGuardrails();
  assert.equal(guardrails.raw_payment_media_persisted, false);
  assert.equal(guardrails.payment_verified, false);
  assert.equal(guardrails.business_truth_mutated, false);
});

test("P5 canonical transaction routes preserve lane authority and only accept signed payment handoff", () => {
  const privateRenewal = canonicalTransactionRoute("renewal", {
    entitlement_live: { membership_level: "private_premium", lifecycle: "active" },
  });
  assert.equal(privateRenewal.href, "/sigil/member/membership?intent=renew");

  const publicRenewal = canonicalTransactionRoute("renewal", {
    entitlement_live: { membership_level: "public_member", lifecycle: "active" },
  });
  assert.equal(publicRenewal.href, "/pay/membership");

  const signedProof = canonicalTransactionRoute("payment_proof", {
    next_actions: [{ href: "/sigil/pay?t=abcDEF_123", action: "continue_payment" }],
  });
  assert.equal(signedProof.kind, "signed_payment_proof");
  assert.equal(signedProof.href, "/sigil/pay?t=abcDEF_123");

  const unsafeProof = canonicalTransactionRoute("payment_proof", {
    next_actions: [{ href: "https://evil.example/pay?t=secret" }],
  });
  assert.equal(unsafeProof.kind, "payment_status_resume");
  assert.equal(unsafeProof.href, "/member/payments");
});


test("P6 execution IDs are deterministic for the same draft and lane", async () => {
  const a = await buildExecutionId("HYPE-DRAFT-BOOKING-ABC123", "booking");
  const b = await buildExecutionId("HYPE-DRAFT-BOOKING-ABC123", "booking");
  const other = await buildExecutionId("HYPE-DRAFT-BOOKING-ABC123", "mms");
  assert.equal(a, b);
  assert.notEqual(a, other);
  assert.match(a, /^HYPE-EXEC-BOOKING-[a-f0-9]{16}$/);
});

test("P6 booking refuses canonical materialization until explicit Model preference exists", async () => {
  const result = await executeP6Booking({}, {
    draft: {
      fields: {
        service_intent: "dining",
        preferred_date: "2026-09-25",
        preferred_time: "19:30",
        area: "Sathorn",
      },
    },
  });
  assert.equal(result.status, "review_required");
  assert.equal(result.details.blocker, "model_preference_required");
  assert.equal(result.canonical_href, "/booking");
});

test("P6 payment proof only prepares the canonical signed handoff and never verifies payment", () => {
  const ready = executeP6PaymentProof({
    route: { kind: "signed_payment_proof", href: "/sigil/pay?t=signed_123" },
    draft: { fields: { evidence_present: true, evidence_type: "photo" } },
  });
  assert.equal(ready.status, "customer_action_required");
  assert.equal(ready.authority, "payments-worker");
  assert.equal(ready.canonical_href, "/sigil/pay?t=signed_123");
  assert.equal(ready.details.raw_media_transferred, false);
  assert.equal(ready.details.payment_verified, false);
  assert.equal(ready.details.payment_marked_paid, false);

  const missingIntent = executeP6PaymentProof({
    route: { kind: "payment_status_resume", href: "/member/payments" },
    draft: { fields: { evidence_present: true } },
  });
  assert.equal(missingIntent.status, "review_required");
  assert.equal(missingIntent.canonical_href, "/member/payments");
});

test("P6 renewal queues current-package intent without granting or renewing membership", () => {
  const result = executeP6Renewal({
    route: { kind: "private_renewal_entry", href: "/sigil/member/membership?intent=renew" },
  });
  assert.equal(result.status, "queued");
  assert.equal(result.details.package_change_requested, false);
  assert.equal(result.details.membership_renewed, false);
  assert.equal(result.details.entitlement_granted, false);
});

test("P6 MMS creates an idempotent canonical prebooking without inventing duration", { concurrency: false }, async () => {
  const seen = [];
  const env = {
    MMS_WORKER: {
      async fetch(request) {
        const body = JSON.parse(await request.text());
        seen.push(body);
        return Response.json({
          ok: true,
          prebooking: {
            prebooking_id: "mmspre_1234567890abcdef12345678",
            status: "Options Ready",
          },
          matched_therapist_ids: ["therapist_a"],
          storage: { coordinator: "persisted", airtable: "synced" },
        }, { status: 201 });
      },
    },
  };

  const result = await executeP6Mms(env, {
    executionId: "HYPE-EXEC-MMS-abcdef1234567890",
    canonicalClientId: "recClientA1",
    lineUserId: "U0123456789abcdef0123456789abcdef",
    draft: {
      fields: {
        recipient_gender: "female",
        zone: "sukhumvit",
        service_date: "2026-09-26",
        service_time: "20:00",
        skills: ["aroma_therapy_oil"],
      },
    },
  });

  assert.equal(result.status, "materialized");
  assert.equal(result.authority, "mms-worker");
  assert.equal(result.details.booking_confirmed, false);
  assert.equal(result.details.therapist_confirmed, false);
  assert.equal(seen.length, 1);
  assert.equal(Object.hasOwn(seen[0], "duration_minutes"), false);
  assert.equal(seen[0].idempotency_key, "HYPE-EXEC-MMS-abcdef1234567890");
});

test("P6 MMS preserves explicit Therapist preference by forcing review instead of dropping it", async () => {
  let called = false;
  const result = await executeP6Mms({
    MMS_WORKER: {
      async fetch() {
        called = true;
        throw new Error("should not call MMS worker");
      },
    },
  }, {
    executionId: "HYPE-EXEC-MMS-abcdef1234567890",
    canonicalClientId: "recClientA1",
    lineUserId: "U0123456789abcdef0123456789abcdef",
    draft: {
      fields: {
        recipient_gender: "female",
        zone: "sukhumvit",
        service_date: "2026-09-26",
        service_time: "20:00",
        skills: ["aroma_therapy_oil"],
        therapist_preference: "Therapist A",
      },
    },
  });

  assert.equal(result.status, "review_required");
  assert.equal(result.details.blocker, "therapist_preference_requires_canonical_resolution");
  assert.equal(called, false);
});

test("P6 receipts expose only bounded customer-safe execution fields", () => {
  const safe = safeExecutionReceipt({
    schema: "mmd.hype_supervised_execution.v1",
    execution_id: "HYPE-EXEC-BOOKING-abcdef1234567890",
    draft_id: "HYPE-DRAFT-BOOKING-ABC123",
    mode: "booking",
    status: "materialized",
    authority: "sigil-booking-worker",
    canonical_ref: "kenji_ref_123",
    canonical_href: "https://evil.example/internal/admin?token=secret",
    replay_safe: true,
    created_at: "2026-09-19T10:00:00.000Z",
    details: {
      mutation_scope: "booking_request_draft_only",
      final_confirmation: false,
      payment_confirmed: false,
      secret: "must-not-copy",
    },
  });
  assert.equal(safe.canonical_href, "");
  assert.equal(Object.hasOwn(safe.details, "secret"), false);
  assert.equal(safe.details.final_confirmation, false);

  const guardrails = p6ExecutionGuardrails();
  assert.equal(guardrails.idempotent, true);
  assert.equal(guardrails.payment_marked_paid, false);
  assert.equal(guardrails.job_confirmed, false);
  assert.equal(guardrails.membership_renewed, false);
  assert.equal(guardrails.mms_booking_confirmed, false);
});
