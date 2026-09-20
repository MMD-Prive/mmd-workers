import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchApprovedJobLinks } from "./src/payment-approved-job-link-dispatch.js";

const SESSION_FIELDS = {
  sessionId: "fldLTq2kZbyRv22IA",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  jobType: "fldjK3U9bghnj7xUe",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  customerUrl: "fldi9ZdoiUXzSv1rI",
  modelUrl: "fld0mFma9J9yfEaKb",
  clientLink: "fld6P6if0vDZCeV0C",
  customerLineUserId: "fld5tzCzdTTh8AJyI",
  canonicalModel: "fldrXQAyOMPCvbOaY",
};

function envFor(record, {
  clientRecord = { id: "recClient123", fields: { fld5HfSGChKFbd4uh: "U11111111111111111111111111111111" } },
  modelRecord = { id: "recModel123", fields: { fld2ywTFI6MZhX6PV: "U22222222222222222222222222222222" } },
} = {}) {
  return {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "airtable-test",
    AIRTABLE_TABLE_SESSIONS: "tblC98mKWbzmPuNzX",
    TELEGRAM_INTERNAL_SEND_URL: "https://telegram.example/internal/send",
    INTERNAL_TOKEN: "internal-test",
    TELEGRAM_CHAT_ID: "-1003546439681",
    TG_THREAD_PAYMENTS_CONFIRM: "22",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
        const table = parts[2] || "";
        const recordId = parts[3] || "";
        if (table === "tblC98mKWbzmPuNzX" && !recordId) {
          assert.match(url.searchParams.get("filterByFormula") || "", /session_id/);
          return Response.json({ records: record ? [record] : [] });
        }
        if ((table === "tblVv58TCbwh5j1fS" || table === "Clients") && recordId === clientRecord?.id) {
          return Response.json(clientRecord);
        }
        if ((table === "tblI4B0bI446vp9GX" || table === "Models") && recordId === modelRecord?.id) {
          return Response.json(modelRecord);
        }
        return Response.json({}, { status: 404 });
      },
    },
  };
}

function sessionRecord() {
  return {
    id: "recSession12345678",
    fields: {
      [SESSION_FIELDS.sessionId]: "sess_approved_1",
      [SESSION_FIELDS.clientName]: "คุณแชมป์",
      [SESSION_FIELDS.modelName]: "Simba",
      [SESSION_FIELDS.jobType]: "MK",
      [SESSION_FIELDS.jobDate]: "2026-09-20",
      [SESSION_FIELDS.startTime]: "2026-09-20T20:00:00+07:00",
      [SESSION_FIELDS.endTime]: "2026-09-20T22:00:00+07:00",
      [SESSION_FIELDS.locationName]: "Bangkok",
      [SESSION_FIELDS.customerUrl]: "https://www.mmdbkk.com/sigil/confirm/job-confirmation?t=member-secret",
      [SESSION_FIELDS.modelUrl]: "https://www.mmdbkk.com/sigil/confirm/job-model?t=model-secret",
      [SESSION_FIELDS.clientLink]: ["recClient123"],
      [SESSION_FIELDS.customerLineUserId]: "U11111111111111111111111111111111",
      [SESSION_FIELDS.canonicalModel]: ["recModel123"],
    },
  };
}

test("deposit approval sends each confirmation URL to the correct LINE identity and reports to internal Telegram", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request && !init ? input : new Request(input, init);
    calls.push({ url: request.url, headers: request.headers, body: await request.json() });
    return Response.json({ ok: true });
  };
  try {
    const result = await dispatchApprovedJobLinks(envFor(sessionRecord()), {
      session_id: "sess_approved_1",
      payment_stage: "deposit",
      payment_ref: "pay_approved_1",
    });
    assert.equal(result.dispatched, true);
    assert.equal(result.status, "sent");
    assert.equal(result.customer_line_sent, true);
    assert.equal(result.model_line_sent, true);

    const lineCalls = calls.filter((call) => call.url === "https://api.line.me/v2/bot/message/push");
    assert.equal(lineCalls.length, 2);
    const customerPush = lineCalls.find((call) => call.body.to === "U11111111111111111111111111111111");
    const modelPush = lineCalls.find((call) => call.body.to === "U22222222222222222222222222222222");
    assert.ok(customerPush);
    assert.ok(modelPush);
    assert.match(customerPush.body.messages[0].text, /job-confirmation\?t=member-secret/);
    assert.doesNotMatch(customerPush.body.messages[0].text, /job-model\?t=model-secret/);
    assert.match(modelPush.body.messages[0].text, /job-model\?t=model-secret/);
    assert.doesNotMatch(modelPush.body.messages[0].text, /job-confirmation\?t=member-secret/);

    const telegram = calls.find((call) => call.url === "https://telegram.example/internal/send");
    assert.ok(telegram);
    assert.equal(telegram.headers.get("x-internal-token"), "internal-test");
    assert.equal(telegram.body.message_thread_id, 22);
    assert.match(telegram.body.text, /PAYMENT APPROVED · CONFIRMATION URLS/);
    assert.match(telegram.body.text, /MEMBER URL: https:\/\/www\.mmdbkk\.com\/sigil\/confirm\/job-confirmation\?t=member-secret/);
    assert.match(telegram.body.text, /MODEL URL: https:\/\/www\.mmdbkk\.com\/sigil\/confirm\/job-model\?t=model-secret/);
    assert.match(telegram.body.text, /Manual confirm fallback/);
    assert.match(telegram.body.text, /Customer LINE: <b>sent<\/b>/);
    assert.match(telegram.body.text, /Model LINE: <b>sent<\/b>/);
  } finally {
    globalThis.fetch = original;
  }
});

test("non-initial payment stage never re-releases job URLs", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("telegram must not be called"); };
  try {
    const result = await dispatchApprovedJobLinks(envFor(sessionRecord()), {
      session_id: "sess_approved_1",
      payment_stage: "final",
      payment_ref: "pay_final_1",
    });
    assert.deepEqual(result, { status: "not_applicable", dispatched: false });
  } finally {
    globalThis.fetch = original;
  }
});

test("missing or malformed held links fail closed without Telegram dispatch", async () => {
  const record = sessionRecord();
  record.fields[SESSION_FIELDS.customerUrl] = "https://evil.example/member?t=secret";
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("telegram must not be called"); };
  try {
    const result = await dispatchApprovedJobLinks(envFor(record), {
      session_id: "sess_approved_1",
      payment_stage: "full",
      payment_ref: "pay_full_1",
    });
    assert.equal(result.dispatched, false);
    assert.equal(result.status, "links_not_ready");
  } finally {
    globalThis.fetch = original;
  }
});


test("same LINE identity for customer and model fails closed and only alerts ops", async () => {
  const record = sessionRecord();
  const same = "U33333333333333333333333333333333";
  record.fields[SESSION_FIELDS.customerLineUserId] = same;
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request && !init ? input : new Request(input, init);
    calls.push({ url: request.url, body: await request.json() });
    return Response.json({ ok: true });
  };
  try {
    const result = await dispatchApprovedJobLinks(envFor(record, {
      modelRecord: { id: "recModel123", fields: { fld2ywTFI6MZhX6PV: same } },
    }), {
      session_id: "sess_approved_1",
      payment_stage: "deposit",
      payment_ref: "pay_approved_collision",
    });
    assert.equal(result.customer_line_sent, false);
    assert.equal(result.model_line_sent, false);
    assert.equal(result.line_identity_collision, true);
    assert.equal(calls.filter((call) => call.url === "https://api.line.me/v2/bot/message/push").length, 0);
    const telegram = calls.find((call) => call.url === "https://telegram.example/internal/send");
    assert.match(telegram.body.text, /identity collision/);
  } finally {
    globalThis.fetch = original;
  }
});
