import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
const reviewWrapperSource = readFileSync(new URL("./index.review-wrapper.js", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("./sigil-membership-payment-components.js", import.meta.url), "utf8");
const componentModule = await import(`data:text/javascript;base64,${Buffer.from(componentSource).toString("base64")}`);
const { parseSigilMembershipPaymentComponents } = componentModule;

function block(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing block start: ${start}`);
  assert.notEqual(to, -1, `missing block end: ${end}`);
  return source.slice(from, to);
}

test("payments worker stores current-job model payout only on Sessions.pay_model_thb", () => {
  const sessionWriter = block("async function createSessionIfMissing", "/* -------------------------------------------------- */\n/* telegram */");
  assert.match(sessionWriter, /pay_model_thb:\s*payload\.pay_model_thb/);
  assert.doesNotMatch(sessionWriter, /[\"']Pay Model[\"']\s*:/);
  assert.doesNotMatch(sessionWriter, /model_payout_amount_thb\s*:/);
});

test("Payments intent does not duplicate model payout truth", () => {
  const paymentWriter = block("async function createOrUpdatePaymentIntent", "async function updateSessionFromPayment");
  assert.doesNotMatch(paymentWriter, /pay_model_thb\s*:/);
  assert.doesNotMatch(paymentWriter, /[\"']Pay Model[\"']\s*:/);
  assert.doesNotMatch(paymentWriter, /model_payout_amount_thb\s*:/);
});

test("confirm-link keeps payout as internal input but does not forward it to payment intent", () => {
  const confirmLink = block("async function handleConfirmLink", "async function handleConfirmVerify");
  assert.match(confirmLink, /const pay_model_thb\s*=/);
  assert.match(confirmLink, /createSessionIfMissing\(env,\s*\{[\s\S]*?pay_model_thb,/);

  const paymentCallStart = confirmLink.indexOf("const payment_write = await createOrUpdatePaymentIntent");
  assert.notEqual(paymentCallStart, -1);
  const paymentCallEnd = confirmLink.indexOf("});", paymentCallStart);
  const paymentCall = confirmLink.slice(paymentCallStart, paymentCallEnd + 3);
  assert.doesNotMatch(paymentCall, /pay_model_thb/);
});

test("SIGIL combined renewal parses one customer payment into service and membership components", () => {
  const action = {
    version: "membership_action_v1",
    type: "renew",
    source: "sigil_jobs",
    include_in_payment: true,
    renewal_amount_thb: 2500,
    state: "pending_official_verify",
    materialization_policy: "official_verify_required",
    entitlement_mutation_allowed: false,
    points_eligible: false,
    service_spend_eligible: false,
    referral_reward_eligible: false,
    service_amount_thb: 8000,
    customer_total_thb: 10500,
  };
  const components = parseSigilMembershipPaymentComponents(
    `[MMD_MEMBERSHIP_ACTION_V1] ${JSON.stringify(action)}`,
    10500,
  );
  assert.equal(components.customer_total_thb, 10500);
  assert.equal(components.service_amount_thb, 8000);
  assert.equal(components.membership_renewal_amount_thb, 2500);
  assert.equal(components.points_eligible_amount_thb, 8000);
  assert.equal(components.membership_fee_points_eligible, false);
  assert.equal(components.membership_fee_service_spend_eligible, false);
  assert.equal(components.membership_fee_referral_reward_eligible, false);
});

test("SIGIL combined renewal fails closed when payment total does not match the component ledger", () => {
  const action = {
    version: "membership_action_v1",
    type: "renew",
    source: "sigil_jobs",
    include_in_payment: true,
    renewal_amount_thb: 2500,
    state: "pending_official_verify",
    materialization_policy: "official_verify_required",
    entitlement_mutation_allowed: false,
    points_eligible: false,
    service_spend_eligible: false,
    referral_reward_eligible: false,
    service_amount_thb: 8000,
    customer_total_thb: 10500,
  };
  assert.throws(
    () => parseSigilMembershipPaymentComponents(`[MMD_MEMBERSHIP_ACTION_V1] ${JSON.stringify(action)}`, 10000),
    /sigil_membership_action_payment_amount_mismatch/,
  );
});

test("reviewed combined renewal keeps bank amount but awards Base Points from service amount only", () => {
  assert.match(reviewWrapperSource, /workerWithSlipEvidence\.fetch\(notifyRequest, baseEnv, ctx\)/);
  assert.match(reviewWrapperSource, /amount_thb:\s*components\.points_eligible_amount_thb/);
  assert.match(reviewWrapperSource, /enforceSigilSessionServiceAmount\(env, body\.session_id, components\)/);
  assert.doesNotMatch(reviewWrapperSource, /amount_thb:\s*components\.customer_total_thb[\s\S]*awardBasePointsPhase1/);
});
