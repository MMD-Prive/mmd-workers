import test from "node:test";
import assert from "node:assert/strict";
import { TG_THREADS, formatTelegramMessage, resolveTelegramFlow, telegramTopics } from "../lib/telegram.js";

test("topic registry keeps the latest canonical MMD operations topic map", () => {
  assert.deepEqual(
    telegramTopics({}).map(({ key, thread_id }) => [key, thread_id]),
    [
      ["booking", 1399],
      ["membership", 20],
      ["points", 17],
      ["payment", 22],
      ["alerts", 9],
      ["public_model", 155],
      ["himai_orders", 157],
      ["himai_payments", 158],
      ["himai_alerts", 159],
      ["mmd_shop_orders", 160],
      ["mmd_shop_payments", 161],
      ["mmd_shop_alerts", 162],
      ["legacy_archive", 134],
      ["rules_model", 39],
      ["rules_customer", 29],
    ],
  );
  assert.equal(telegramTopics({}).find((topic) => topic.key === "public_model")?.label, "MMD • Applications");
});

test("canonical env names override compatibility aliases", () => {
  const threads = TG_THREADS({
    TG_THREAD_PAYMENTS_MEMBERSHIP: "120",
    TG_THREAD_MEMBERSHIP: "20",
    TG_THREAD_PAYMENTS_CONFIRM: "122",
    TG_THREAD_PAYMENT: "21",
    TG_THREAD_CONFIRM: "99",
    TG_THREAD_BOOKING_DRAFT: "1398",
    TG_THREAD_BOOKING: "1399",
    TG_THREAD_LEGACY_ARCHIVE: "234",
    TG_THREAD_SYSTEM_LOG: "22",
  });
  assert.equal(threads.membership, 120);
  assert.equal(threads.payment_proof, 122);
  assert.equal(threads.booking_draft, 1398);
  assert.equal(threads.system_log, 234);
});

test("crew remains optional while rules use their dedicated canonical rooms", () => {
  const threads = TG_THREADS({});
  assert.equal(threads.crew, 9);
  assert.equal(threads.human_handoff, 9);
  assert.equal(threads.rules_customer, 29);
  assert.equal(threads.customer_rules_ack, 29);
  assert.equal(threads.rules_model, 39);
  assert.equal(threads.model_rules_ack, 39);
});

test("operational flow aliases route through the central registry", () => {
  const threads = TG_THREADS({ TG_THREAD_CREW: "88" });
  assert.equal(threads.alert, 9);
  assert.equal(threads.recovery, 9);
  assert.equal(threads.system_log, 134);
  assert.equal(threads.legacy_archive, 134);
  assert.equal(threads.applications, 155);
  assert.equal(threads.public_model_application, 155);
  assert.equal(threads.mms_therapist_application, 155);
  assert.equal(threads.booking_draft, 1399);
  assert.equal(threads.dispatch, 1399);
  assert.equal(threads.himai_orders, 157);
  assert.equal(threads.himai_payments, 158);
  assert.equal(threads.himai_alerts, 159);
  assert.equal(threads.mmd_shop_orders, 160);
  assert.equal(threads.mmd_shop_payments, 161);
  assert.equal(threads.mmd_shop_alerts, 162);
  assert.equal(threads.human_handoff, 88);
});

test("legacy rules acknowledgements no longer fall into payment confirm", () => {
  assert.equal(
    resolveTelegramFlow({
      flow: "confirm",
      rules: { version: "v4" },
      page: { path: "/rules/customer" },
    }),
    "rules_customer",
  );

  assert.equal(
    resolveTelegramFlow({
      flow: "confirm",
      rules: { version: "v4" },
      page: { path: "/rules/model" },
    }),
    "rules_model",
  );
});

test("system log compatibility traffic is archived", () => {
  assert.equal(resolveTelegramFlow({ flow: "system_log" }), "legacy_archive");
  assert.equal(resolveTelegramFlow({ flow: "system" }), "legacy_archive");
});

test("dispatch lifecycle routes into booking", () => {
  assert.equal(resolveTelegramFlow({ flow: "dispatch", event: "arrived" }), "booking");
  assert.equal(resolveTelegramFlow({ flow: "booking_dispatch", event: "work_started" }), "booking");
});

test("payment proof and verified alerts use canonical Payments Confirm thread 22", () => {
  const threads = TG_THREADS({ TG_THREAD_PAYMENTS_CONFIRM: "22", TG_THREAD_PAYMENT: "21", TG_THREAD_CONFIRM: "99" });
  assert.equal(threads.payment_proof, 22);
  assert.equal(threads.payment_verified, 22);
});

test("payment alert formatter keeps proof and verified states distinct", () => {
  const proof = formatTelegramMessage({
    flow: "payment_proof",
    proof_id: "proof_123",
    amount_thb: 690,
    currency: "THB",
    ref: "ABCD…WXYZ",
    status: "pending",
    ts: "2026-09-04T03:00:00.000Z",
  });
  const verified = formatTelegramMessage({
    flow: "payment_verified",
    amount_thb: 690,
    currency: "THB",
    ref: "ABCD…WXYZ",
    status: "verified",
    ts: "2026-09-04T03:05:00.000Z",
  });

  assert.match(proof, /PAYMENT PROOF RECEIVED/);
  assert.match(proof, /Status:<\/b> pending/);
  assert.match(verified, /PAYMENT VERIFIED/);
  assert.match(verified, /Status:<\/b> verified/);
});

test("Applications formatter distinguishes MMD Public Model and MMS Therapist events", () => {
  const mmd = formatTelegramMessage({ flow: "public_model_application", ts: "2026-09-13T00:00:00.000Z" });
  const mms = formatTelegramMessage({ flow: "mms_therapist_application", ts: "2026-09-13T00:00:00.000Z" });
  assert.match(mmd, /PUBLIC MODEL APPLICATION/);
  assert.match(mms, /MMS • THERAPIST APPLICATION/);
});

test("rules formatter keeps customer and model acknowledgements distinct", () => {
  const customer = formatTelegramMessage({
    flow: "rules_customer",
    rules: { version: "v4", url: "/rules/customer" },
    member: { member_id: "MMD-001", name: "Test" },
    ts: "2026-09-13T00:00:00.000Z",
  });
  const model = formatTelegramMessage({
    flow: "rules_model",
    rules: { version: "v4", url: "/rules/model" },
    member: { member_id: "MODEL-001", name: "Test Model" },
    ts: "2026-09-13T00:00:00.000Z",
  });

  assert.match(customer, /RULES \(CUSTOMER\)/);
  assert.match(model, /RULES \(MODEL\)/);
});
