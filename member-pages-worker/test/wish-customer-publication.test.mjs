import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCanonicalCareBackLinkWish } from '../src/care-back-liff-orchestrator.js';
import { handleLinkWish, handlePublicWishFeed } from '../src/public-care-back-wish.js';

function setup({ member = true, status = 'active' } = {}) {
  let linked;
  let issued = 0;
  const env = {
    LIFF_SESSION_SECRET: 'test-only-secret-0123456789-0123456789',
    LIFF_IDENTITY_KV: {
      get: async () => ({
        expires_at: Date.now() + 60000,
        identity_key: 'a'.repeat(64),
        member_exists: member,
        member_id: member ? 'M001' : '',
        member_profile: { membership_status: status },
      }),
    },
    PUBLIC_CARE_BACK_WISH_STORE: {
      createOrLoad: async () => ({}),
      linkVerified: async input => {
        linked = input;
        return { wish_text: 'Thank you', submitted_at: '2026-09-01T00:00:00Z' };
      },
    },
    VERIFIED_WISH_COUPON_STORE: {
      issueOrResume: async () => {
        issued++;
        return { state: 'ready', status: 'active', code: 'ABC234' };
      },
    },
  };
  const request = new Request('https://mmdbkk.com/member/api/care-back/link-wish', {
    method: 'POST',
    headers: {
      origin: 'https://mmdbkk.com',
      'content-type': 'application/json',
      cookie: '__Host-mmd_liff_session=test-session',
    },
    body: JSON.stringify({ wish_link_token: 'pw_' + 'A'.repeat(43) }),
  });
  return { env, request, linked: () => linked, issued: () => issued };
}

test('active, grace and expired members publish the Wish and receive the coupon immediately', async () => {
  for (const status of ['active', 'grace', 'expired']) {
    const x = setup({ status });
    const response = await handleLinkWish(x.request, x.env);
    const result = await response.json();
    assert.equal(response.status, 200, status);
    assert.equal(x.linked().memberVerified, true, status);
    assert.equal(x.linked().customerVerified, false, status);
    assert.equal(result.publication.state, 'public_after_consent', status);
    assert.equal(result.benefits.member_eligible, true, status);
    assert.equal(result.benefits.coupon, true, status);
    assert.equal(result.coupon.state, 'ready', status);
    assert.equal(x.issued(), 1, status);
  }
});

test('verified LINE identity without a Member row links privately and receives no coupon', async () => {
  const x = setup({ member: false });
  const response = await handleCanonicalCareBackLinkWish(x.request, x.env);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(x.linked().memberVerified, false);
  assert.equal(result.linked, true);
  assert.equal(result.publication.state, 'private_non_member');
  assert.equal(result.benefits.coupon, false);
  assert.equal(result.coupon.state, 'not_eligible');
  assert.equal(x.issued(), 0);
});

test('unknown and restricted member states keep Wishes private and do not issue coupons', async () => {
  for (const status of ['under_review', 'blocked', 'suspended', 'revoked']) {
    const x = setup({ status });
    const response = await handleLinkWish(x.request, x.env);
    const result = await response.json();
    assert.equal(response.status, 200, status);
    assert.equal(x.linked().memberVerified, false, status);
    assert.equal(result.publication.state, 'private_non_member', status);
    assert.equal(result.coupon.state, 'not_eligible', status);
    assert.equal(x.issued(), 0, status);
  }
});

test('public feed accepts only consenting member-verified Wishes and exposes only text/date', async () => {
  const timestamp = '2026-09-01T00:00:00Z';
  const good = {
    fields: {
      campaign_id: 'care_back',
      wish_status: 'completed',
      wish_text: 'Thank you MMD',
      submitted_at: timestamp,
      payload_json: JSON.stringify({
        public_display_consent: true,
        public_display_consent_version: 'wish-wall-v1',
        public_display_consented_at: timestamp,
        public_display_member_verified: true,
        public_display_member_verified_at: timestamp,
        wish_kind: 'verified_identity_linked',
      }),
    },
  };
  const serviceOnly = {
    fields: {
      ...good.fields,
      payload_json: JSON.stringify({
        public_display_consent: true,
        public_display_consent_version: 'wish-wall-v1',
        public_display_consented_at: timestamp,
        public_display_customer_verified: true,
        public_display_customer_verified_at: timestamp,
        wish_kind: 'verified_identity_linked',
      }),
    },
  };
  const env = {
    PUBLIC_CARE_BACK_WISH_STORE: {
      createOrLoad() {},
      linkVerified() {},
      listPublicCandidates: async () => [good, serviceOnly],
    },
  };
  const response = await handlePublicWishFeed(new Request('https://mmdbkk.com/member/api/care-back/public-wish'), env);
  assert.deepEqual(await response.json(), {
    ok: true,
    wishes: [{ text: 'Thank you MMD', submitted_at: '2026-09-01T00:00:00.000Z' }],
  });
});
