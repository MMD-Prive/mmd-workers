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
    resolveClickedModel: wrap("model", { canonical_model_id: "recModel" }),
    readReviewedHistory: wrap("history", { reviewed: true, summary: "ชอบงานดินเนอร์" }),
    readOwnerRate: wrap("rate", { owner_approved: true, customer_sell_rate_thb: 20000 }),
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
  assert.equal(result.verified_budget_per_job_thb, 15000);
  assert.equal(result.owner_rate_thb, 20000);
  assert.equal(result.customer_reply, "");
  assert.doesNotMatch(JSON.stringify(result), /private note|U012345/);
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
