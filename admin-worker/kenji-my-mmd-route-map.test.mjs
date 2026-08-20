import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handleKenjiPublicKnowledgeRequest } from "./src/kenji-public-knowledge-runtime.js";

describe("Kenji MY MMD route map", () => {
  it("uses canonical MY MMD routes in the static public fallback", async () => {
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
    assert.match(card.customer_answer, /\/member\/dashboard/);
    assert.match(card.customer_answer, /\/sigil\/member\/membership/);
    assert.match(card.customer_answer, /\/sigil\/membership/);
    assert.match(card.customer_answer, /\/sigil\/pay\/renewal/);
    assert.match(card.customer_answer, /\/sigil\/booking/);
    assert.match(card.customer_answer, /\/confirm\/payment-proof/);
    assert.doesNotMatch(card.customer_answer, /\/member\/membership(?:\s|$)/);
  });
});
