import assert from "node:assert/strict";
import test from "node:test";
import { handleLinkWish, handlePublicWish } from "../src/public-care-back-wish.js";

const SECRET = "test-secret-for-care-back-public-wish-0123456789";
const ORIGIN = "https://mmdbkk.com";

function request(path, body, cookie = "") {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function publicStore() {
  const byRequest = new Map();
  const byTokenHash = new Map();
  return {
    async createOrLoad(input) {
      if (byRequest.has(input.requestId)) return byRequest.get(input.requestId);
      const wish = {
        record_id: "recABCDEFGHIJKLMN",
        wish_id: "wish_0123456789abcdef0123456789abcdef",
        wish_text: input.wishText,
        wish_option: input.wishOption,
        wish_status: "completed",
        idempotency_key: input.requestId,
        link_token_hash: input.linkTokenHash,
        claim_record_id: "",
        submitted_at: input.now,
      };
      byRequest.set(input.requestId, wish);
      byTokenHash.set(input.linkTokenHash, wish);
      return wish;
    },
    async linkToClaim(input) {
      const wish = byTokenHash.get(input.linkTokenHash);
      if (!wish) throw new Error("not found");
      wish.claim_record_id = input.claimRecordId;
      wish.link_token_hash = input.verifiedCustomerRefHash;
      return wish;
    },
  };
}

test("public Wish succeeds without LINE session and grants no benefits", async () => {
  const env = { LIFF_SESSION_SECRET: SECRET, PUBLIC_CARE_BACK_WISH_STORE: publicStore() };
  const response = await handlePublicWish(request("/member/api/care-back/public-wish", {
    wish_text: "สุขสันต์วันเกิด MMD ครับ",
    request_id: "wish-public-request-0001",
    language: "th",
  }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.state, "completed");
  assert.match(payload.wish_link_token, /^pw_[A-Za-z0-9_-]+$/);
  assert.equal(payload.benefits.verification_required, true);
  assert.equal(payload.benefits.coupon, false);
  assert.equal(payload.benefits.membership_extension, false);
  assert.equal(payload.benefits.points, false);
  assert.equal(payload.grants.membership, false);
  assert.equal(payload.grants.points, false);
});

test("public Wish rejects browser-supplied member or claim authority", async () => {
  const env = { LIFF_SESSION_SECRET: SECRET, PUBLIC_CARE_BACK_WISH_STORE: publicStore() };
  for (const extra of [{ member_id: "mem_fake" }, { campaign_claim_id: "claim_fake" }, { points: 999999 }]) {
    const response = await handlePublicWish(request("/member/api/care-back/public-wish", {
      wish_text: "สุขสันต์วันเกิดครับ",
      request_id: `wish-reject-${Object.keys(extra)[0]}-0001`,
      ...extra,
    }), env);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "BROWSER_IDENTITY_REJECTED");
  }
});

test("verified LIFF session can link an existing public Wish and start benefit evaluation", async () => {
  const store = publicStore();
  const env = {
    LIFF_SESSION_SECRET: SECRET,
    PUBLIC_CARE_BACK_WISH_STORE: store,
    CARE_BACK_STORE: {
      async openOrResume(input) {
        assert.equal(input.wishSubmitted, true);
        assert.equal(input.memberId, "mem_001");
        return {
          claim_reference: "CAREBACK-001",
          claim_status: "identity_verified",
          review_status: "pending",
          coupon_state: "wish_required",
          membership_benefit: { type: "membership_extension", days: 180, state: "pending_application" },
          points_policy: { rate_thb_per_point: 100, renewal_bonus_points: 0, reconciliation_state: "pending" },
          wish_submitted: true,
        };
      },
    },
  };

  const publicResponse = await handlePublicWish(request("/member/api/care-back/public-wish", {
    wish_text: "ขอบคุณ MMD ครับ",
    request_id: "wish-public-link-0001",
  }), env);
  const publicPayload = await publicResponse.json();

  const token = "session-token-0123456789abcdef";
  const hash = await keyedDigest(`session:${token}`);
  const session = {
    expires_at: Date.now() + 60_000,
    member_exists: true,
    member_id: "mem_001",
    identity_key: "identity_hash_001",
    member_profile: { membership_status: "active" },
    campaign_claim_id: "careback001",
    campaign_claim_record_id: "recABCDEFGHIJKLMN",
  };
  env.LIFF_IDENTITY_KV = {
    async get(key, mode) {
      assert.equal(mode, "json");
      return key === `liff:session:${hash}` ? session : null;
    },
  };

  const response = await handleLinkWish(request("/member/api/care-back/link-wish", {
    wish_link_token: publicPayload.wish_link_token,
  }, `__Host-mmd_liff_session=${token}`), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.linked, true);
  assert.equal(payload.benefits.verification_required, false);
  assert.equal(payload.benefits.evaluation_started, true);
  assert.equal(payload.claim.wish_submitted, true);
  assert.equal(payload.grants.points, false);
});

async function keyedDigest(value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
