import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCouponPresentation } from '../src/member-coupon-presentation.js';
test('expired issued coupons lose actions, used remains used, and input is not mutated', () => {
  const coupon = { state: 'issued', expiresAt: '2026-01-01', actionUrl: 'https://evil.example', redeemUrl: '/redeem', reference: 'private-code' };
  const result = projectCouponPresentation(coupon, Date.parse('2026-02-01'));
  assert.equal(result.state, 'expired'); assert.equal(result.actionUrl, undefined); assert.equal(result.redeemUrl, undefined); assert.equal(coupon.state, 'issued');
  assert.equal(projectCouponPresentation({ ...coupon, state: 'used' }).state, 'used');
});
test('only usable or wish-required states receive safe information navigation, never a redemption write', () => {
  assert.equal(projectCouponPresentation({ state: 'issued', expiresAt: '2099-01-01' }).actionUrl, '/member/liff?intent=status&view=coupons');
  assert.match(projectCouponPresentation({ state: 'checking', wishRequired: true }).actionUrl, /wish$/);
  assert.equal(projectCouponPresentation({ state: 'unavailable', wishRequired: true }).actionUrl, undefined);
});
