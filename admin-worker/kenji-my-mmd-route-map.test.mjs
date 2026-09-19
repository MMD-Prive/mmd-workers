import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handleKenjiPublicKnowledgeRequest } from "./src/kenji-public-knowledge-runtime.js";

describe("Kenji MY MMD route map", () => {
  it("uses canonical Public / Private membership and payment routes in the static public fallback", async () => {
    const request = new Request("https://mmdbkk.com/v1/public/kenji/knowledge/published");
    const response = await handleKenjiPublicKnowledgeRequest(request, {});
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.data_status, "static_fallback");

    const card = payload.cards.find((item) => item.id === "kenji_20_008_membership_intake_catalog");
    assert.ok(card);
    assert.equal(card.response_mode, "auto_reply_allowed");
    assert.equal(card.risk_level, "medium");
    assert.equal(card.source_path, "/sigil/member/membership");
    assert.match(card.customer_answer, /https:\/\/mmdbkk\.com\/pay\/membership/);
    assert.match(card.customer_answer, /https:\/\/mmdbkk\.com\/sigil\/member\/membership/);
    assert.match(card.customer_answer, /intent=renew/);
    assert.match(card.customer_answer, /https:\/\/mmdbkk\.com\/member\/payments/);
    assert.match(card.customer_answer, /\/pay\/checkout\?t=/);
    assert.match(card.customer_answer, /\/sigil\/pay\?t=/);
    assert.doesNotMatch(card.customer_answer, /\/sigil\/pay\/renewal/);
    assert.doesNotMatch(card.customer_answer, /\/pay\/renewal/);

    const payment = payload.cards.find((item) => item.id === "kenji_20_006_payment_proof");
    assert.ok(payment);
    assert.match(payment.customer_answer, /\/member\/payments/);
    assert.match(payment.customer_answer, /\/pay\/checkout\?t=/);
    assert.match(payment.customer_answer, /\/sigil\/pay\?t=/);
    assert.doesNotMatch(payment.customer_answer, /\/sigil\/pay\/renewal/);
  });
});
