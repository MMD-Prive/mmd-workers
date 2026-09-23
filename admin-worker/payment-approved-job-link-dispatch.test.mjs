import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchApprovedJobLinks, drainApprovedJobLinkNotifications } from "./src/payment-approved-job-link-dispatch.js";
import { memoryR2 } from "../shared/test/payment-memory-r2.mjs";

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
  clientRecord = { id: "recClient123", fields: {
    fld5HfSGChKFbd4uh: "U11111111111111111111111111111111",
    fldAmysO51nIneg0C: "111111111",
    fldlPum9VYKboCofh: "verified",
  } },
  modelRecord = { id: "recModel123", fields: {
    fld2ywTFI6MZhX6PV: "U22222222222222222222222222222222",
    fldLogasesRw5zwyB: "222222222",
    fldlSR082K0O0wLqY: "verified",
  } },
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

test("deposit approval sends each confirmation URL to the correct verified LINE and Telegram identities and reports to Ops", async () => {
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
    assert.equal(result.customer_telegram_sent, true);
    assert.equal(result.model_telegram_sent, true);
    assert.equal(result.telegram_identity_collision, false);

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

    const telegramCalls = calls.filter((call) => call.url === "https://telegram.example/internal/send");
    assert.equal(telegramCalls.length, 3);
    const customerTelegram = telegramCalls.find((call) => String(call.body.chat_id) === "111111111");
    const modelTelegram = telegramCalls.find((call) => String(call.body.chat_id) === "222222222");
    const telegram = telegramCalls.find((call) => String(call.body.chat_id) === "-1003546439681");
    assert.ok(customerTelegram);
    assert.ok(modelTelegram);
    assert.ok(telegram);
    assert.match(customerTelegram.body.text, /job-confirmation\?t=member-secret/);
    assert.doesNotMatch(customerTelegram.body.text, /job-model\?t=model-secret/);
    assert.match(modelTelegram.body.text, /job-model\?t=model-secret/);
    assert.doesNotMatch(modelTelegram.body.text, /job-confirmation\?t=member-secret/);
    assert.equal(telegram.headers.get("x-internal-token"), "internal-test");
    assert.equal(telegram.body.message_thread_id, 22);
    assert.match(telegram.body.text, /PAYMENT APPROVED · CONFIRMATION URLS/);
    assert.match(telegram.body.text, /MEMBER URL: https:\/\/www\.mmdbkk\.com\/sigil\/confirm\/job-confirmation\?t=member-secret/);
    assert.match(telegram.body.text, /MODEL URL: https:\/\/www\.mmdbkk\.com\/sigil\/confirm\/job-model\?t=model-secret/);
    assert.match(telegram.body.text, /Manual confirm fallback/);
    assert.match(telegram.body.text, /Customer LINE: <b>sent<\/b>/);
    assert.match(telegram.body.text, /Model LINE: <b>sent<\/b>/);
    assert.match(telegram.body.text, /Customer Telegram: <b>sent<\/b>/);
    assert.match(telegram.body.text, /Model Telegram: <b>sent<\/b>/);
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
      clientRecord: { id: "recClient123", fields: { fld5HfSGChKFbd4uh: same } },
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
    const telegram = calls.find((call) => call.url === "https://telegram.example/internal/send" && String(call.body.chat_id) === "-1003546439681");
    assert.match(telegram.body.text, /identity collision/);
  } finally {
    globalThis.fetch = original;
  }
});


test("same verified Telegram identity for customer and model fails closed for DMs while Ops receives audit", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request && !init ? input : new Request(input, init);
    calls.push({ url: request.url, body: await request.json() });
    return Response.json({ ok: true });
  };
  try {
    const sameTelegram = "333333333";
    const result = await dispatchApprovedJobLinks(envFor(sessionRecord(), {
      clientRecord: { id: "recClient123", fields: {
        fld5HfSGChKFbd4uh: "U11111111111111111111111111111111",
        fldAmysO51nIneg0C: sameTelegram,
        fldlPum9VYKboCofh: "verified",
      } },
      modelRecord: { id: "recModel123", fields: {
        fld2ywTFI6MZhX6PV: "U22222222222222222222222222222222",
        fldLogasesRw5zwyB: sameTelegram,
        fldlSR082K0O0wLqY: "verified",
      } },
    }), {
      session_id: "sess_approved_1",
      payment_stage: "deposit",
      payment_ref: "pay_approved_tg_collision",
    });
    assert.equal(result.telegram_identity_collision, true);
    assert.equal(result.customer_telegram_sent, false);
    assert.equal(result.model_telegram_sent, false);
    assert.equal(calls.filter((call) => call.url === "https://telegram.example/internal/send" && String(call.body.chat_id) === sameTelegram).length, 0);
    const ops = calls.find((call) => call.url === "https://telegram.example/internal/send" && String(call.body.chat_id) === "-1003546439681");
    assert.ok(ops);
    assert.match(ops.body.text, /Telegram dispatch held: customer\/model identity collision/);
  } finally {
    globalThis.fetch = original;
  }
});

test("unverified Telegram bindings never receive confirmation URLs", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request && !init ? input : new Request(input, init);
    calls.push({ url: request.url, body: await request.json() });
    return Response.json({ ok: true });
  };
  try {
    const result = await dispatchApprovedJobLinks(envFor(sessionRecord(), {
      clientRecord: { id: "recClient123", fields: {
        fld5HfSGChKFbd4uh: "U11111111111111111111111111111111",
        fldAmysO51nIneg0C: "444444444",
        fldlPum9VYKboCofh: "not_connected",
      } },
      modelRecord: { id: "recModel123", fields: {
        fld2ywTFI6MZhX6PV: "U22222222222222222222222222222222",
        fldLogasesRw5zwyB: "555555555",
        fldlSR082K0O0wLqY: "conflict",
      } },
    }), {
      session_id: "sess_approved_1",
      payment_stage: "deposit",
      payment_ref: "pay_approved_unverified_tg",
    });
    assert.equal(result.customer_telegram_sent, false);
    assert.equal(result.model_telegram_sent, false);
    assert.equal(result.customer_telegram_status, "telegram_identity_missing_or_unverified");
    assert.equal(result.model_telegram_status, "telegram_identity_missing_or_unverified");
    assert.equal(calls.some((call) => ["444444444", "555555555"].includes(String(call.body.chat_id))), false);
  } finally {
    globalThis.fetch = original;
  }
});

for (const failedTarget of ["customer_line", "ops"]) test(`durable retry resends only ${failedTarget} after an outage`, async () => {
  const original = globalThis.fetch;
  const env = { ...envFor(sessionRecord()), LINE_SLIP_EVIDENCE: memoryR2() };
  const calls = [];
  let healthy = false;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request && !init ? input : new Request(input, init);
    const body = await request.json();
    const target = body.to === "U11111111111111111111111111111111" ? "customer_line"
      : String(body.chat_id) === "-1003546439681" ? "ops" : body.to || body.chat_id;
    calls.push({ target, retryKey: request.headers.get("x-line-retry-key") });
    if (!healthy && target === failedTarget) throw new Error("simulated_connection_reset");
    return Response.json({ ok: true });
  };
  try {
    const input = { session_id: "sess_approved_1", payment_stage: "deposit", payment_ref: "pay_approved_1" };
    const first = await dispatchApprovedJobLinks(env, input);
    assert.equal(first.retry_queued, true);
    assert.equal(first.delivery_durable, true);
    assert.equal(calls.length, 5, "one transport failure does not stop other recipients");
    healthy = true;
    const sweep = await drainApprovedJobLinkNotifications(env, { now: Date.now() + 120000 });
    assert.equal(sweep.delivered, 1);
    assert.equal(calls.length, 6);
    assert.equal(calls.at(-1).target, failedTarget);
    if (failedTarget === "customer_line") {
      assert.match(calls[0].retryKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.equal(calls.at(-1).retryKey, calls[0].retryKey);
    }
    assert.equal((await dispatchApprovedJobLinks(env, input)).delivery_status, "delivered");
    assert.equal(calls.length, 6);
  } finally { globalThis.fetch = original; }
});

test("LINE acknowledgement for an already accepted retry key counts as delivered", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request && !init ? input : new Request(input, init);
    return request.url.includes("api.line.me")
      ? Response.json({ message: "already accepted" }, { status: 409, headers: { "x-line-accepted-request-id": "original-request" } })
      : Response.json({ ok: true });
  };
  try {
    const result = await dispatchApprovedJobLinks({ ...envFor(sessionRecord()), LINE_SLIP_EVIDENCE: memoryR2() }, {
      session_id: "sess_approved_1", payment_stage: "deposit", payment_ref: "pay_approved_1",
    });
    assert.equal(result.customer_line_sent, true);
    assert.equal(result.model_line_sent, true);
    assert.equal(result.retry_queued, false);
  } finally { globalThis.fetch = original; }
});

test("a cancelled job stops an outstanding link notification without sending", async () => {
  const record = sessionRecord();
  record.fields.fldmwuvOaiCFdzzRa = "cancelled";
  const env = { ...envFor(record), LINE_SLIP_EVIDENCE: memoryR2() };
  const original = globalThis.fetch;
  globalThis.fetch = async () => assert.fail("cancelled job notification");
  try {
    const result = await dispatchApprovedJobLinks(env, { session_id: "sess_approved_1", payment_stage: "deposit", payment_ref: "pay_approved_1" });
    assert.equal(result.status, "session_cancelled");
    assert.equal(result.delivery_status, "manual_review");
    assert.equal(result.retry_queued, false);
  } finally { globalThis.fetch = original; }
});
