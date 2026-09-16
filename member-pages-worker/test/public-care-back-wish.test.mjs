import assert from "node:assert/strict";
import test from "node:test";
import { handleLinkWish, handlePublicWish } from "../src/public-care-back-wish.js";

const SECRET = "test-secret-for-care-back-public-wish-0123456789";
const ORIGIN = "https://mmdbkk.com";
const IDENTITY = "a".repeat(64);

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
    async linkVerified(input) {
      const wish = byTokenHash.get(input.linkTokenHash);
      if (!wish) throw new Error("not found");
      wish.claim_record_id = input.claimRecordId || "";
      wish.link_token_hash = input.verifiedCustomerRefHash;
      return wish;
    },
  };
}

function verifiedCouponStore(expectedIdentity = IDENTITY) {
  return {
    async issueOrResume(input) {
      assert.equal(input.identityHash, expectedIdentity);
      return {
        state: "ready",
        status: "active",
        code: "ABC234",
        max_discount_percent: 10,
        approved_discount_percent: null,
        activated_at: "2026-09-06T00:00:00.000Z",
        expires_at: "2026-11-06T00:00:00.000Z",
        single_use: true,
      };
    },
  };
}

test("public Wish succeeds without LINE session or LIFF secret and only offers optional coupon verification", async () => {
  const env = { PUBLIC_CARE_BACK_WISH_STORE: publicStore() };
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
  assert.equal(payload.benefits.verification_required, false);
  assert.equal(payload.benefits.coupon, false);
  assert.equal(payload.benefits.coupon_after_verification, true);
  assert.equal(payload.benefits.membership_extension, false);
  assert.equal(payload.benefits.points, false);
  assert.equal(payload.final_display.next_action, "optional_coupon_verification");
  assert.match(response.headers.get("set-cookie") || "", /mmd_care_back_wish_link=pw_/);
  assert.equal(payload.grants.membership, false);
  assert.equal(payload.grants.points, false);
});

test("public Wish replay remains idempotent without LIFF secret", async () => {
  const env = { PUBLIC_CARE_BACK_WISH_STORE: publicStore() };
  const body = {
    wish_text: "ขอบคุณ MMD สำหรับ 6 ปีครับ",
    request_id: "wish-public-replay-0001",
    language: "th",
  };
  const first = await handlePublicWish(request("/member/api/care-back/public-wish", body), env);
  const second = await handlePublicWish(request("/member/api/care-back/public-wish", body), env);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const firstPayload = await first.json();
  const secondPayload = await second.json();
  assert.equal(firstPayload.wish_link_token, secondPayload.wish_link_token);
  assert.equal(secondPayload.state, "completed");
});

test("public Wish rejects browser-supplied member or claim authority", async () => {
  const env = { PUBLIC_CARE_BACK_WISH_STORE: publicStore() };
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

test("Airtable public Wish uses the existing member_page source choice with strict typecasting off and no LIFF secret", async () => {
  const originalFetch = globalThis.fetch;
  let postBody = null;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || "GET";
    if (method === "GET") return Response.json({ records: [] });
    if (method === "POST") {
      postBody = JSON.parse(init.body);
      const fields = postBody.fields;
      return Response.json({ id: "recABCDEFGHIJKLMN", fields });
    }
    throw new Error(`unexpected Airtable method ${method} for ${url}`);
  };
  try {
    const env = {
      AIRTABLE_API_KEY: "pat_test",
      AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
      AIRTABLE_TABLE_CARE_BACK_BIRTHDAY_WISHES: "tblvMJjYXy29mgDLb",
    };
    const response = await handlePublicWish(request("/member/api/care-back/public-wish", {
      wish_text: "ขอบคุณสำหรับ 6 ปีครับ",
      request_id: "wish-airtable-source-0001",
      language: "th",
    }), env);
    assert.equal(response.status, 200, await response.text());
    assert.equal(postBody.typecast, false);
    assert.equal(postBody.fields.source, "member_page");
    assert.equal(postBody.fields.source_path, "/promotion/6-years-care-back/wish");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verified LIFF member links an existing public Wish, receives coupon, and keeps member benefits separate", async () => {
  const store = publicStore();
  const env = {
    LIFF_SESSION_SECRET: SECRET,
    PUBLIC_CARE_BACK_WISH_STORE: store,
    VERIFIED_WISH_COUPON_STORE: verifiedCouponStore(),
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
    identity_key: IDENTITY,
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
  assert.equal(payload.benefits.coupon, true);
  assert.equal(payload.benefits.membership_evaluation_started, true);
  assert.equal(payload.coupon.state, "ready");
  assert.equal(payload.coupon.code, "ABC234");
  assert.equal(payload.coupon.max_discount_percent, 10);
  assert.equal(payload.coupon.approved_discount_percent, null);
  assert.equal(payload.claim.wish_submitted, true);
  assert.match(response.headers.get("set-cookie") || "", /mmd_care_back_wish_link=; Max-Age=0/);
  assert.equal(payload.grants.points, false);
});

test("verified LIFF non-member also receives the Wish coupon without a member claim", async () => {
  const store = publicStore();
  const env = {
    LIFF_SESSION_SECRET: SECRET,
    PUBLIC_CARE_BACK_WISH_STORE: store,
    VERIFIED_WISH_COUPON_STORE: verifiedCouponStore(),
  };
  const publicResponse = await handlePublicWish(request("/member/api/care-back/public-wish", {
    wish_text: "สุขสันต์วันเกิดครับ",
    request_id: "wish-public-new-line-0001",
  }), env);
  const publicPayload = await publicResponse.json();

  const token = "session-token-new-0123456789abcdef";
  const hash = await keyedDigest(`session:${token}`);
  env.LIFF_IDENTITY_KV = {
    async get(key, mode) {
      assert.equal(mode, "json");
      if (key !== `liff:session:${hash}`) return null;
      return {
        expires_at: Date.now() + 60_000,
        member_exists: false,
        member_id: null,
        identity_key: IDENTITY,
        pending_identity_id: "pending_001",
      };
    },
  };

  const response = await handleLinkWish(request("/member/api/care-back/link-wish", {
    wish_link_token: publicPayload.wish_link_token,
  }, `__Host-mmd_liff_session=${token}`), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.linked, true);
  assert.equal(payload.benefits.coupon, true);
  assert.equal(payload.benefits.membership_evaluation_started, false);
  assert.equal(payload.coupon.state, "ready");
  assert.equal(payload.claim, null);
});

async function keyedDigest(value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("publication opt-in is strictly boolean and never accepts browser member authority", async () => {
  for (const consent of ['true', 1, null, {}]) {
    const response = await handlePublicWish(request('/member/api/care-back/public-wish', {
      wish_text: 'Private by default', request_id: 'wish-consent-validation-001', public_display_consent: consent,
    }), { PUBLIC_CARE_BACK_WISH_STORE: publicStore() });
    assert.equal(response.status, 400);
  }
  const response = await handlePublicWish(request('/member/api/care-back/public-wish', {
    wish_text: 'Cannot self-verify', request_id: 'wish-consent-authority-001', public_display_consent: true, public_display_member_verified: true,
  }), { PUBLIC_CARE_BACK_WISH_STORE: publicStore() });
  assert.equal(response.status, 400);
});

test("Airtable feed exposes only explicitly consenting verified linked member wishes, with no identity fields", async () => {
  const { handlePublicCareBackWishRoute } = await import('../src/public-care-back-wish.js');
  const originalFetch = globalThis.fetch;
  const time = '2026-09-16T12:00:00.000Z';
  const payload = { public_display_consent: true, public_display_consent_version: 'wish-wall-v1', public_display_consented_at: time, public_display_member_verified: true, public_display_member_verified_at: time, wish_kind: 'verified_identity_linked' };
  const row = (changes = {}, fields = {}) => ({ id: 'recABCDEFGHIJKLMN', fields: { campaign_id: 'care_back', wish_status: 'completed', wish_text: 'Approved member wish', submitted_at: time, 'Campaign Claim': ['recABCDEFGHIJKLMN'], verified_customer_ref_hash: 'private-hash', payload_json: JSON.stringify({ ...payload, ...changes }), ...fields } });
  globalThis.fetch = async (url) => {
    assert.match(String(url), /sort%5B0%5D%5Bdirection%5D=desc/);
    return Response.json({ records: [
      row(), row({ public_display_consent: false }), row({ public_display_consent: 'true' }),
      row({ public_display_member_verified: false }), row({ public_display_member_verified: 'true' }),
      row({ public_display_consented_at: null }), row({ wish_kind: 'public_unlinked' }),
      row({}, { 'Campaign Claim': [] }), row({}, { payload_json: '{}' }),
      row({}, { payload_json: 'malformed' }), row({}, { wish_text: '<script>alert(1)</script>' }),
    ] });
  };
  try {
    const response = await handlePublicCareBackWishRoute(new Request(ORIGIN + '/member/api/care-back/public-wish'), {
      AIRTABLE_API_KEY: 'pat_test', AIRTABLE_BASE_ID: 'appsV1ILPRfIjkaYg',
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: true, wishes: [{ text: 'Approved member wish', submitted_at: time }] });
  } finally { globalThis.fetch = originalFetch; }
});

test("publication consent persists across real Airtable linking; member eligibility comes only from signed session", async () => {
  const originalFetch = globalThis.fetch;
  for (const [consent, member, membershipStatus] of [[true, true, 'active'], [false, true, 'active'], [true, false, 'active'], [true, true, 'blocked']]) {
    let stored;
    globalThis.fetch = async (url, init = {}) => {
      if ((init.method || 'GET') === 'GET') return Response.json({ records: stored ? [stored] : [] });
      const fields = JSON.parse(init.body).fields;
      if (init.method === 'POST') stored = { id: 'recABCDEFGHIJKLMN', fields };
      else stored = { ...stored, fields: { ...stored.fields, ...fields } };
      return Response.json(stored);
    };
    try {
      const env = {
        AIRTABLE_API_KEY: 'pat_test', AIRTABLE_BASE_ID: 'appsV1ILPRfIjkaYg', LIFF_SESSION_SECRET: SECRET,
        LIFF_IDENTITY_KV: { get: async () => ({ expires_at: Date.now() + 60000, identity_key: IDENTITY, member_exists: member, member_id: member ? 'mem_001' : '', member_profile: { membership_status: membershipStatus }, campaign_claim_id: 'careback001', campaign_claim_record_id: 'recABCDEFGHIJKLMN' }) },
        VERIFIED_WISH_COUPON_STORE: verifiedCouponStore(),
        CARE_BACK_STORE: { openOrResume: async () => ({}) },
      };
      const saved = await handlePublicWish(request('/member/api/care-back/public-wish', { wish_text: 'My wish', request_id: 'wish-store-consent-00001', public_display_consent: consent }), env);
      const savedBody = await saved.json();
      assert.equal(saved.status, 200);
      assert.equal(JSON.parse(stored.fields.payload_json).public_display_consent, consent);
      const linked = await handleLinkWish(request('/member/api/care-back/link-wish', { wish_link_token: savedBody.wish_link_token }, '__Host-mmd_liff_session=session-verified'), env);
      assert.equal(linked.status, 200);
      const data = JSON.parse(stored.fields.payload_json);
      assert.equal(data.public_display_consent, consent);
      assert.equal(data.public_display_member_verified, member && membershipStatus !== 'blocked');
    } finally { globalThis.fetch = originalFetch; }
  }
});
