import test from "node:test";
import assert from "node:assert/strict";
import { TG_THREADS, formatTelegramMessage, resolveTelegramFlow, telegramTopics } from "../lib/telegram.js";

test("topic registry keeps core MMD operations topics explicit", () => {
  assert.deepEqual(
    telegramTopics({}).map(({ key, thread_id }) => [key, thread_id]),
    [
      ["membership", 20],
      ["payment", 21],
      ["alerts", 9],
      ["points", 17],
      ["system_log", 22],
      ["public_model", 155],
      ["booking", 1399],
    ],
  );
  assert.equal(telegramTopics({}).find((topic) => topic.key === "public_model")?.label, "MMD • Applications");
});

test("optional operations topics join registry only when configured", () => {
  assert.deepEqual(
    telegramTopics({
      TG_THREAD_CREW: "88",
      TG_THREAD_RULES_CUSTOMER: "101",
      TG_THREAD_RULES_MODEL: "102",
    }).slice(-3).map(({ key, thread_id }) => [key, thread_id]),
    [
      ["crew", 88],
      ["rules_customer", 101],
      ["rules_model", 102],
    ],
  );
});

test("rules and crew fall back to canonical existing rooms when dedicated topics are absent", () => {
  const threads = TG_THREADS({});
  assert.equal(threads.crew, 9);
  assert.equal(threads.human_handoff, 9);
  assert.equal(threads.rules_customer, 22);
  assert.equal(threads.customer_rules_ack, 22);
  assert.equal(threads.rules_model, 22);
  assert.equal(threads.model_rules_ack, 22);
});

test("dedicated rules and crew topics override safe fallbacks when configured", () => {
  const threads = TG_THREADS({
    TG_THREAD_CREW: "88",
    TG_THREAD_RULES_CUSTOMER: "101",
    TG_THREAD_RULES_MODEL: "102",
  });
  assert.equal(threads.human_handoff, 88);
  assert.equal(threads.customer_rules_ack, 101);
  assert.equal(threads.model_rules_ack, 102);
});

test("operational flow aliases route through the central registry", () => {
  const threads = TG_THREADS({
    TG_THREAD_CREW: "88",
    TG_THREAD_RULES_CUSTOMER: "101",
    TG_THREAD_RULES_MODEL: "102",
  });
  assert.equal(threads.alert, 9);
  assert.equal(threads.recovery, 9);
  assert.equal(threads.system_log, 22);
  assert.equal(threads.applications, 155);
  assert.equal(threads.application, 155);
  assert.equal(threads.mmd_application, 155);
  assert.equal(threads.public_model_application, 155);
  assert.equal(threads.mms_application, 155);
  assert.equal(threads.mms_therapist_application, 155);
  assert.equal(threads.booking_draft, 1399);
  assert.equal(threads.dispatch, 1399);
  assert.equal(threads.human_handoff, 88);
  assert.equal(threads.customer_rules_ack, 101);
  assert.equal(threads.model_rules_ack, 102);
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

test("dispatch lifecycle routes into booking", () => {
  assert.equal(resolveTelegramFlow({ flow: "dispatch", event: "arrived" }), "booking");
  assert.equal(resolveTelegramFlow({ flow: "booking_dispatch", event: "work_started" }), "booking");
});

test("payment proof and verified alerts use the canonical HYPE payment topic", () => {
  const threads = TG_THREADS({ TG_THREAD_PAYMENT: "21", TG_THREAD_CONFIRM: "99" });
  assert.equal(threads.payment_proof, 21);
  assert.equal(threads.payment_verified, 21);
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
