import test from "node:test";
import assert from "node:assert/strict";
import { handlePromotionClaimOpen } from "../src/promotion-claim.js";

const LINE_ID = "U" + "a".repeat(32);

test("rejects an unverified browser-supplied identity", async () => {
  const response = await handlePromotionClaimOpen(new Request("https://mmdbkk.com/member/api/liff/promotion-claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ line_user_id: LINE_ID }),
  }), {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "line_access_token_required");
});

test("derives LINE subject server-side and forwards only its hash", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ userId: LINE_ID }), { status: 200, headers: { "content-type": "application/json" } });
  let forwarded;
  const env = {
    LINE_ID_HASH_SECRET: "x".repeat(48),
    INTERNAL_SERVICE_SECRET: "y".repeat(48),
    MEMBER_STATUS_RESOLVER: {
      fetch: async (request) => {
        const input = await request.json();
        assert.equal(input.lineUserId, LINE_ID);
        return Response.json({ data: { memberId: "mem_1", clientId: "client_1", membershipTier: "premium", membershipStartAt: "2025-01-01T00:00:00.000Z", membershipEndAt: "2026-12-31T00:00:00.000Z" } });
      },
    },
    PROMOTION_WORKER: {
      fetch: async (request) => {
        forwarded = await request.json();
        return Response.json({ claim: { claimId: "MMD6-2026-ABC", claimStatus: "matched", reviewStatus: "not_required", campaignReferenceDate: "2026-07-22T00:00:00.000Z" }, resumed: false });
      },
    },
  };
  try {
    const response = await handlePromotionClaimOpen(new Request("https://mmdbkk.com/member/api/liff/promotion-claim", {
      method: "POST",
      headers: { authorization: "Bearer verified-token", "content-type": "application/json" },
      body: JSON.stringify({ line_user_id: "U" + "b".repeat(32), promo: "MMD6" }),
    }), env);
    assert.equal(response.status, 200);
    assert.match(forwarded.lineUserIdHash, /^[a-f0-9]{64}$/);
    assert.equal("lineUserId" in forwarded, false);
    assert.equal((await response.json()).data.claim_reference, "MMD6-2026-ABC");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
