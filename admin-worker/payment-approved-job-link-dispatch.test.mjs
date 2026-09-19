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
};

function envFor(record) {
  return {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "airtable-test",
    AIRTABLE_TABLE_SESSIONS: "tblC98mKWbzmPuNzX",
    TELEGRAM_INTERNAL_SEND_URL: "https://telegram.example/internal/send",
    INTERNAL_TOKEN: "internal-test",
    TELEGRAM_CHAT_ID: "-1003546439681",
    TG_THREAD_CONFIRM: "22",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        assert.match(url.searchParams.get("filterByFormula") || "", /session_id/);
        return Response.json({ records: record ? [record] : [] });
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
    },
  };
}

test("deposit approval releases both server-held job URLs to internal Telegram", async () => {
  const original = globalThis.fetch;
  let telegram = null;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request && !init ? input : new Request(input, init);
    telegram = { url: request.url, headers: request.headers, body: await request.json() };
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
    assert.equal(telegram.url, "https://telegram.example/internal/send");
    assert.equal(telegram.headers.get("x-internal-token"), "internal-test");
    assert.match(telegram.body.text, /PAYMENT APPROVED · JOB LINKS RELEASED/);
    assert.match(telegram.body.text, /MEMBER URL: https:\/\/www\.mmdbkk\.com\/sigil\/confirm\/job-confirmation\?t=member-secret/);
    assert.match(telegram.body.text, /MODEL URL: https:\/\/www\.mmdbkk\.com\/sigil\/confirm\/job-model\?t=model-secret/);
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
