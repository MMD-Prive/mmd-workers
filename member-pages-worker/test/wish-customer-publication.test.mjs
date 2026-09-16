import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCanonicalCareBackLinkWish } from '../src/care-back-liff-orchestrator.js';
import { handleLinkWish, handlePublicWishFeed } from '../src/public-care-back-wish.js';

const lineId = 'U' + 'a'.repeat(32);
function setup({ member = true, completed = true, unavailable = false, status = 'active', linkedClient = 'recClient000001' } = {}) {
  let linked;
  let issued = 0;
  const env = {
    AIRTABLE_API_KEY: 'test', AIRTABLE_BASE_ID: 'appTest',
    LIFF_SESSION_SECRET: 'test-only-secret-0123456789-0123456789',
    LIFF_IDENTITY_KV: { get: async () => ({ expires_at: Date.now() + 60000, identity_key: 'a'.repeat(64), line_user_id: lineId, member_exists: member, member_id: member ? 'M001' : '', member_profile: { membership_status: status } }) },
    PUBLIC_CARE_BACK_WISH_STORE: {
      createOrLoad: async () => ({}),
      linkVerified: async input => { linked = input; return { wish_text: 'Thank you', submitted_at: '2026-09-01T00:00:00Z' }; },
    },
    VERIFIED_WISH_COUPON_STORE: { issueOrResume: async () => { issued++; return { state: 'ready' }; } },
    AIRTABLE_HTTP: { fetch: async request => {
      if (unavailable) return Response.json({}, { status: 503 });
      const url = new URL(request.url);
      if (url.pathname.endsWith('/Clients')) return Response.json({ records: [{ id: 'recClient000001', fields: { line_user_id: lineId, 'Client Name': 'Test customer' } }] });
      if (url.pathname.endsWith('/Sessions')) return Response.json({ records: completed ? [{ id: 'recSession00001', fields: { Client: [linkedClient], 'Session Status': 'completed', job_date: '2026-09-01', import_review_status: 'verified' } }] : [] });
      return Response.json({ records: [] });
    } },
  };
  const request = new Request('https://mmdbkk.com/member/api/care-back/link-wish', { method: 'POST', headers: { origin: 'https://mmdbkk.com', 'content-type': 'application/json', cookie: '__Host-mmd_liff_session=test-session' }, body: JSON.stringify({ wish_link_token: 'pw_' + 'A'.repeat(43) }) });
  return { env, request, linked: () => linked, issued: () => issued };
}

test('membership alone never publishes a Wish without completed service evidence', async () => {
  const x = setup({ completed: false });
  assert.equal((await handleLinkWish(x.request, x.env)).status, 200);
  assert.equal(x.linked().customerVerified, false);
});

test('verified past customer without a Member row links the Wish but receives no coupon grant', async () => {
  const x = setup({ member: false });
  const response = await handleCanonicalCareBackLinkWish(x.request, x.env);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(x.linked().customerVerified, true);
  assert.equal(result.linked, true);
  assert.equal(result.benefits.coupon, false);
  assert.equal(x.issued(), 0);
});

test('unavailable history and blocked accounts keep Wishes private', async () => {
  for (const options of [{ unavailable: true }, { status: 'blocked' }, { linkedClient: 'recOtherClient' }]) {
    const x = setup(options);
    assert.equal((await handleLinkWish(x.request, x.env)).status, 200);
    assert.equal(x.linked().customerVerified, false);
  }
});

test('public feed accepts verified service customers without Campaign Claims and exposes only text/date', async () => {
  const timestamp = '2026-09-01T00:00:00Z';
  const good = { fields: { campaign_id: 'care_back', wish_status: 'completed', wish_text: 'Thank you MMD', submitted_at: timestamp, payload_json: JSON.stringify({ public_display_consent: true, public_display_consent_version: 'wish-wall-v1', public_display_consented_at: timestamp, public_display_customer_verified: true, public_display_customer_verified_at: timestamp, wish_kind: 'verified_identity_linked' }) } };
  const env = { PUBLIC_CARE_BACK_WISH_STORE: { createOrLoad() {}, linkVerified() {}, listPublicCandidates: async () => [good, { fields: { ...good.fields, payload_json: '{}' } }] } };
  const response = await handlePublicWishFeed(new Request('https://mmdbkk.com/member/api/care-back/public-wish'), env);
  assert.deepEqual(await response.json(), { ok: true, wishes: [{ text: 'Thank you MMD', submitted_at: '2026-09-01T00:00:00.000Z' }] });
});
