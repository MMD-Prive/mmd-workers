import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentProofOpsSummary } from './payment-proof-ops-summary.mjs';
const copy = { customerUnknown:'unknown customer', currency:'THB', amountUnreadable:'unreadable', amountPending:'reading', renewal:'renewal', signup:'signup', purposeUnknown:'unresolved purpose', bankUnverified:'not verified' };
test('verified rename is a display label, not money or purpose authority', () => {
  const result = paymentProofOpsSummary({ copy, customer:{status:'matched',rename_source:'exact_line_client_per_rename_v1',per_rename:'โต 27 กพ 68',display_name:'Octo789'}, extraction:{amount_thb:null,extraction_error:'ocr_unavailable'}, intelligence:{} });
  assert.deepEqual(result,{name:'โต 27 กพ 68',amount:'unreadable',purpose:'unresolved purpose',bankStatus:'not verified'});
});
test('ambiguous or unproven rename cannot replace original display label', () => {
  for (const customer of [{status:'ambiguous',rename_source:'exact_line_client_per_rename_v1'}, {status:'matched',rename_source:'name_search'}]) {
    assert.equal(paymentProofOpsSummary({copy,customer:{...customer,per_rename:'wrong',display_name:'original'}}).name,'original');
  }
});
test('invalid amounts stay unknown, never zero; extraction pending differs from failed', () => {
  for (const amount_thb of [null,undefined,0,-1,NaN,Infinity,'2500','']) {
    assert.equal(paymentProofOpsSummary({copy,extraction:{amount_thb}}).amount,'reading');
  }
  assert.equal(paymentProofOpsSummary({copy,extraction:{amount_thb:2500}}).amount,'2,500 THB');
});
test('only supported classified purpose is displayed; past history is not signup', () => {
  assert.equal(paymentProofOpsSummary({copy,intelligence:{tracking_kind:'membership_renewal'}}).purpose,'renewal');
  assert.equal(paymentProofOpsSummary({copy,intelligence:{tracking_kind:'membership_signup'}}).purpose,'signup');
  assert.equal(paymentProofOpsSummary({copy,intelligence:{tracking_kind:'unresolved_payment',historical_member:true}}).purpose,'unresolved purpose');
});
