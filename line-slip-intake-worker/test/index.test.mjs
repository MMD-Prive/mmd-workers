import assert from "node:assert/strict";
import test from "node:test";

import { processSlipQueueMessage } from "../src/index.js";

const NOW = new Date("2026-09-04T12:00:00.000Z");
const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const PAYMENT_REF = "ABCDEF1234567890";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function queueBody() {
  return {
    schema: "line_slip_intake_queue_v1",
    line_event_id: "msg-image-1",
    message_id: "msg-image-1",
    webhook_event_id: "evt-image-1",
    enqueued_at: NOW.toISOString(),
  };
}

function makeHarness({ recentContext = "ส่งสลิปการโอนครับ", existingProof = null } = {}) {
  const calls = [];
  const r2Writes = [];
  const telegramBodies = [];
  const proofCreates = [];
  const proofUpdates = [];
  let lineDownloads = 0;

  const env = {
    MMD_RUNTIME_SCOPE: "staging",
    AIRTABLE_BASE_ID: "appTestSlipIntake1",
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_SYNC_TABLE: "MMD — Console Inbox",
    AIRTABLE_TABLE_PAYMENT_PROOFS: "MMD — Payment Proofs",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_TABLE_SESSIONS: "Sessions",
    AIRTABLE_TABLE_PAYMENTS: "Payments",
    AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS: "MMD — LIFF Renewal Sessions",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    MMD_SLIP_EXTRACTOR_TOKEN: "extractor-token",
    LINE_SLIP_CONFIDENCE_THRESHOLD: "0.85",
    HYPE_ALERT_REQUIRED: "true",
    AUTH_SERVICE_LINE_TO_TELEGRAM: "line-to-telegram-secret",
    TELEGRAM_OPS_CHAT_ID: "-100123",
    TG_THREAD_PAYMENT: "21",
    SLIP_EVIDENCE_R2: {
      put: async (key, bytes, options) => {
        r2Writes.push({ key, byteLength: bytes.byteLength, options });
      },
    },
    SLIP_EXTRACTOR: {
      fetch: async (request) => {
        const url = new URL(request.url);
        assert.equal(request.headers.get("authorization"), "Bearer extractor-token");
        if (url.pathname === "/v1/extract/qr") {
          return jsonResponse({
            result: {
              payment_ref: "",
              amount_thb: 690,
              paid_at: "",
              payer_name: "",
              provider: "promptpay",
              confidence_score: 0.55,
            },
          });
        }
        if (url.pathname === "/v1/extract/ocr") {
          return jsonResponse({
            result: {
              payment_ref: PAYMENT_REF,
              amount_thb: 690,
              paid_at: "2026-09-04T11:58:00+07:00",
              payer_name: "Synthetic Payer",
              sender_bank: "TEST BANK",
              receiver_bank: "MMD BANK",
              provider: "bank_transfer",
              confidence_score: 0.97,
            },
          });
        }
        throw new Error(`unexpected extractor path ${url.pathname}`);
      },
    },
    TELEGRAM_WORKER: {
      fetch: async (request) => {
        assert.equal(new URL(request.url).pathname, "/telegram/internal/send");
        assert.equal(request.headers.get("authorization"), "Bearer line-to-telegram-secret");
        const body = await request.json();
        telegramBodies.push(body);
        return jsonResponse({ ok: true, telegram: { ok: true } });
      },
    },
  };

  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), init });

    if (url.hostname === "api-data.line.me") {
      lineDownloads += 1;
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x01, 0x02]);
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(bytes.byteLength),
        },
      });
    }

    if (url.hostname !== "api.airtable.com") throw new Error(`unexpected fetch ${url}`);
    const table = decodeURIComponent(url.pathname.split("/").pop());
    const formula = url.searchParams.get("filterByFormula") || "";
    const method = String(init.method || "GET").toUpperCase();

    if (table === "MMD — Console Inbox" && method === "GET") {
      if (formula.includes("{line_id}='msg-image-1'")) {
        return jsonResponse({
          records: [{
            id: "recInboxImage",
            createdTime: NOW.toISOString(),
            fields: {
              line_id: "msg-image-1",
              line_user_id: LINE_USER_ID,
              intent: "note_only",
              admin_note: "[message] LINE event",
              payload_json: JSON.stringify({
                source_user_id: LINE_USER_ID,
                source_message_id: "msg-image-1",
                received_at: NOW.toISOString(),
                parsed_intent: "note_only",
                raw_text: "",
              }),
            },
          }],
        });
      }
      if (formula.includes("{line_user_id}=")) {
        return jsonResponse({
          records: [
            {
              id: "recInboxImage",
              createdTime: NOW.toISOString(),
              fields: {
                admin_note: "[message] LINE event",
                payload_json: JSON.stringify({ received_at: NOW.toISOString(), raw_text: "" }),
              },
            },
            {
              id: "recInboxText",
              createdTime: "2026-09-04T11:59:00.000Z",
              fields: {
                admin_note: recentContext,
                payload_json: JSON.stringify({ received_at: "2026-09-04T11:59:00.000Z", raw_text: recentContext }),
              },
            },
          ],
        });
      }
    }

    if (table === "MMD — Payment Proofs") {
      if (method === "GET") {
        if (formula.includes("{proof_id}=") && !formula.includes("!='")) {
          return jsonResponse({ records: existingProof ? [existingProof] : [] });
        }
        return jsonResponse({ records: [] });
      }
      if (method === "POST") {
        const body = JSON.parse(init.body);
        proofCreates.push(body.fields);
        return jsonResponse({ id: "recProofCreated", fields: body.fields });
      }
      if (method === "PATCH") {
        const body = JSON.parse(init.body);
        proofUpdates.push(body);
        return jsonResponse({ records: body.records || [] });
      }
    }

    if (table === "Members" && method === "GET") {
      return jsonResponse({ records: [{ id: "recMember" }] });
    }
    if ((table === "Payments" || table === "Sessions" || table === "MMD — LIFF Renewal Sessions") && method === "GET") {
      return jsonResponse({ records: [] });
    }

    throw new Error(`unexpected airtable call: ${method} ${table} ${formula}`);
  };

  return {
    env,
    fetchImpl,
    calls,
    r2Writes,
    telegramBodies,
    proofCreates,
    proofUpdates,
    get lineDownloads() { return lineDownloads; },
  };
}

test("payment-context image becomes durable pending proof and redacted HYPE alert", async () => {
  const harness = makeHarness();
  const result = await processSlipQueueMessage(queueBody(), harness.env, {
    fetchImpl: harness.fetchImpl,
    now: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, "pending");
  assert.equal(result.reviewRequired, false);
  assert.equal(harness.lineDownloads, 1);
  assert.equal(harness.r2Writes.length, 1);
  assert.match(harness.r2Writes[0].key, /^line-ofc\/payment-proofs\/2026\/09\/line_[a-f0-9]{24}\/original\.jpg$/);
  assert.equal(harness.r2Writes[0].options.customMetadata.proof_id, result.proofId);

  assert.equal(harness.proofCreates.length, 1);
  const created = harness.proofCreates[0];
  assert.equal(created.status, "pending");
  assert.equal(created.channel, "line_ofc");
  assert.equal(created.amount_thb, 690);
  assert.equal(created.payment_ref, PAYMENT_REF);
  assert.deepEqual(created.member, ["recMember"]);
  assert.equal("paid" in created, false);
  assert.equal("verified" in created, false);

  const note = JSON.parse(created.note);
  assert.equal(note.schema, "line_ofc_payment_proof_queue_v1");
  assert.equal(note.payments_worker_handoff.state, "pending");
  assert.equal(note.payments_worker_handoff.official_verification_required, true);
  assert.equal(note.payments_worker_handoff.may_mark_paid, false);
  assert.equal(note.payments_worker_handoff.may_award_points, false);
  assert.equal(note.payments_worker_handoff.may_extend_membership, false);
  assert.equal(note.payments_worker_handoff.may_confirm_session, false);
  assert.equal(note.line_user_id_hash.length, 64);
  assert.equal(JSON.stringify(note).includes(LINE_USER_ID), false);

  assert.equal(harness.telegramBodies.length, 1);
  const telegram = harness.telegramBodies[0];
  assert.equal(telegram.flow, "payment_proof");
  assert.equal(telegram.message_thread_id, 21);
  assert.match(telegram.text, /Status: pending/);
  assert.match(telegram.text, /ABCD…7890/);
  assert.doesNotMatch(telegram.text, new RegExp(PAYMENT_REF));
  assert.doesNotMatch(telegram.text, new RegExp(LINE_USER_ID));

  assert.equal(harness.proofUpdates.length, 1);
  const update = harness.proofUpdates[0];
  assert.equal(Array.isArray(update.records), true);
  assert.equal(update.records[0].id, "recProofCreated");
  const updatedNote = JSON.parse(update.records[0].fields.note);
  assert.equal(updatedNote.hype_alert_status, "sent");
});

test("clear model/profile image context is ignored before LINE download or R2", async () => {
  const harness = makeHarness({ recentContext: "ขอดูรูปนายแบบ GWs13 ครับ" });
  const result = await processSlipQueueMessage(queueBody(), harness.env, {
    fetchImpl: harness.fetchImpl,
    now: NOW,
  });

  assert.deepEqual(result, { ok: true, ignored: true, state: "non_payment_image" });
  assert.equal(harness.lineDownloads, 0);
  assert.equal(harness.r2Writes.length, 0);
  assert.equal(harness.proofCreates.length, 0);
  assert.equal(harness.telegramBodies.length, 0);
});

test("durable proof replay is idempotent and does not download or persist image again", async () => {
  const existingProof = {
    id: "recExistingProof",
    fields: {
      proof_id: "placeholder",
      amount_thb: 690,
      payment_ref: PAYMENT_REF,
      note: JSON.stringify({
        schema: "line_ofc_payment_proof_queue_v1",
        hype_alert_status: "sent",
      }),
      status: "pending",
    },
  };
  const harness = makeHarness({ existingProof });
  const result = await processSlipQueueMessage(queueBody(), harness.env, {
    fetchImpl: harness.fetchImpl,
    now: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.deduped, true);
  assert.equal(result.state, "pending");
  assert.equal(harness.lineDownloads, 0);
  assert.equal(harness.r2Writes.length, 0);
  assert.equal(harness.proofCreates.length, 0);
  assert.equal(harness.telegramBodies.length, 0);
});

test("queue body cannot bypass staging scope or schema gate", async () => {
  const harness = makeHarness();
  await assert.rejects(
    processSlipQueueMessage({ ...queueBody(), schema: "wrong" }, harness.env, { fetchImpl: harness.fetchImpl, now: NOW }),
    /queue_schema_invalid/,
  );
  await assert.rejects(
    processSlipQueueMessage(queueBody(), { ...harness.env, MMD_RUNTIME_SCOPE: "production" }, { fetchImpl: harness.fetchImpl, now: NOW }),
    /staging_scope_required/,
  );
});
