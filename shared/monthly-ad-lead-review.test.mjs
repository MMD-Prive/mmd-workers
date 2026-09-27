import test from "node:test";
import assert from "node:assert/strict";
import { reviewMonthlyAdLead } from "./monthly-ad-lead-review.mjs";

const event = { card_id: "21829530", trigger: "EMs19", line_user_id: "U0123456789abcdef0123456789abcdef" };
function readers(overrides = {}) {
  const calls = [];
  const wrap = (name, value) => async () => { calls.push(name); return value; };
  return { calls, methods: {
    resolveCustomer: wrap("identity", { status: "resolved", status_verified: true, customer_status: "vip_relationship", client_id: "recExact", per_rename: "พี่โจ้ - VIP - private note" }),
    readVerifiedSpend: wrap("spend", { verified: true, per_job_thb: 15000 }),
    resolveClickedModel: wrap("model", { status: "resolved", owner_approved: true, canonical_model_id: "recModel" }),
    resolveTypedModel: wrap("typed_model", { status: "resolved", owner_approved: true, canonical_model_id: "recTypedModel" }),
    readReviewedHistory: wrap("history", { reviewed: true, summary: "ชอบงานดินเนอร์" }),
    readOwnerRate: wrap("rate", { owner_approved: true, client_id: "recExact", model_id: "recModel", customer_sell_rate_thb: 20000 }),
    ...overrides,
  } };
}

test("resolves the exact customer, verified per-job spend, click, reviewed history and owner rate in order", async () => {
  const { calls, methods } = readers();
  const result = await reviewMonthlyAdLead(event, methods);
  assert.deepEqual(calls, ["identity", "spend", "model", "history", "rate"]);
  assert.equal(result.status, "owner_review_ready");
  assert.equal(result.address, "พี่โจ้");
  assert.equal(result.customer_status, "vip_relationship");
  assert.equal(result.entry_kind, "card_action_text");
  assert.equal(result.attribution, "line_text_origin_unverified");
  assert.equal(result.verified_budget_per_job_thb, 15000);
  assert.equal(result.owner_rate_thb, 20000);
  assert.match(result.suggested_per_reply_for_review, /^พี่โจ้ครับ เห็นข้อความแล้วครับ/);
  assert.doesNotMatch(result.suggested_per_reply_for_review, /ลูกค้า|VIP|15000|20000/);
  assert.equal(result.customer_reply, "");
  assert.doesNotMatch(JSON.stringify(result), /private note|U012345/);
});

test("without a safe Per rename the suggested reply stays neutral", async () => {
  const { methods } = readers({ resolveCustomer: async () => ({
    status: "resolved", status_verified: true, customer_status: "new_contact",
    client_id: "recExact", per_rename: "Joe - private note",
  }) });
  const result = await reviewMonthlyAdLead(event, methods);
  assert.equal(result.address, "");
  assert.match(result.suggested_per_reply_for_review, /^เห็นข้อความแล้วครับ/);
  assert.doesNotMatch(result.suggested_per_reply_for_review, /Joe|ลูกค้า/);
});

test("typed Model names resolve through a separate lookup without claiming a Card click", async () => {
  const { calls, methods } = readers();
  const result = await reviewMonthlyAdLead({ line_user_id: event.line_user_id, message_text: "สนใจ Jasper" }, methods);
  assert.deepEqual(calls, ["identity", "spend", "typed_model", "history", "rate"]);
  assert.equal(result.entry_kind, "typed_model_name");
  assert.equal(result.card_id, null);
  assert.equal(result.canonical_model_id, "recTypedModel");
  assert.equal(result.owner_rate_thb, null, "an offer for another Model must not be reused");
  assert.equal(result.attribution, "line_text_origin_unverified");
});

test("unresolved identity stops all customer-specific reads", async () => {
  const { calls, methods } = readers({ resolveCustomer: async () => { calls.push("identity"); return { status: "ambiguous" }; } });
  const result = await reviewMonthlyAdLead(event, methods);
  assert.equal(result.status, "identity_review_required");
  assert.deepEqual(calls, ["identity"]);
});

test("missing model binding or unverified spend does not solicit an automatic rate", async () => {
  const { calls, methods } = readers({
    resolveClickedModel: async () => { calls.push("model"); return { canonical_model_id: null }; },
    readVerifiedSpend: async () => { calls.push("spend"); return { verified: false, per_job_thb: 99999 }; },
  });
  const result = await reviewMonthlyAdLead(event, methods);
  assert.equal(result.status, "evidence_review_required");
  assert.equal(result.verified_budget_per_job_thb, null);
  assert.equal(result.owner_rate_thb, null);
  assert.deepEqual(calls, ["identity", "spend", "model", "history"]);
});
