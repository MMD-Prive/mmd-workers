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
    assert.equal(card.source_path, "/pay/membership");
    assert.match(card.customer_answer, /690 บาท \/ 1 ปี/);
    assert.match(card.customer_answer, /4,990 บาท \/ 2 ปี/);
    assert.match(card.customer_answer, /11,499 บาท \/ 1 ปี/);
    assert.match(card.customer_answer, /https:\/\/mmdbkk\.com\/pay\/membership/);
    assert.match(card.customer_answer, /https:\/\/mmdbkk\.com\/tmib/);
    assert.doesNotMatch(card.customer_answer, /Black Card.*11,499/i);

    const cta = payload.cards.find((item) => item.id === "kenji_20_002_route_map");
    assert.ok(cta);
    assert.equal(cta.response_mode, "auto_reply_allowed");
    // The internal docs/knowledge source is stripped from the public runtime.
    assert.equal(cta.source_path, undefined);
    assert.match(cta.customer_answer, /หา Model/);
    assert.match(cta.customer_answer, /TMIB/);

    const payment = payload.cards.find((item) => item.id === "kenji_20_006_payment_proof");
    assert.ok(payment);
    assert.match(payment.customer_answer, /\/member\/payments/);
    assert.match(payment.customer_answer, /\/pay\/checkout\?t=/);
    assert.match(payment.customer_answer, /\/sigil\/pay\?t=/);
    assert.doesNotMatch(payment.customer_answer, /\/sigil\/pay\/renewal/);
  });
});
