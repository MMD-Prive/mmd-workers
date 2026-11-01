import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBlackCardPayment } from '../src/blackcard-payment.js';

const url = id => `https://mmdbkk.com/member/api/liff/blackcard/exclusive/${id}`;
const session = async () => ({ lineUserId:'U'+'a'.repeat(32), readGraceOnly:false });
function fixture(status='verified') {
  const calls=[];
  const env={
    AUTH_SERVICE_MEMBER_TO_PAYMENTS:'internal-test-token',
    PAYMENTS_WORKER:{async fetch(request){calls.push(['payment',await request.json()]);return Response.json({ok:true,package_code:'black_card',status,session_id:'bcard_test',payment_ref:'pay_test'});}},
    PRIVATE_MODEL_MEDIA:{async get(key){calls.push(['r2',key]);return {body:new Uint8Array([82,73,70,70]),httpMetadata:{contentType:'image/webp'}};}},
  };
  return {env,calls};
}
test('verified LINE customer receives only the chosen private image through the BFF',async()=>{
  const {env,calls}=fixture();
  const response=await handleBlackCardPayment(new Request(url('hito')),env,session);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'image/webp');
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('vary'),'Cookie');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[82,73,70,70]);
  assert.deepEqual(calls,[['payment',{line_user_id:'U'+'a'.repeat(32),action:'read'}],['r2','blackcard/exclusive/hito.webp']]);
});
test('pending proof, missing LINE session, and unknown ID cannot read private bytes',async()=>{
  const pending=fixture('pending_verification');
  assert.equal((await handleBlackCardPayment(new Request(url('hiei')),pending.env,session)).status,403);
  assert.equal(pending.calls.some(([kind])=>kind==='r2'),false);
  const missing=fixture();
  assert.equal((await handleBlackCardPayment(new Request(url('hiei')),missing.env,async()=>null)).status,401);
  assert.deepEqual(missing.calls,[]);
  assert.equal((await handleBlackCardPayment(new Request(url('constructor')),missing.env,session)).status,404);
  assert.deepEqual(missing.calls,[]);
});
test('query, cross-site, and wrong method fail before payment or R2 reads',async()=>{
  const {env,calls}=fixture();
  assert.equal((await handleBlackCardPayment(new Request(url('hima')+'?t=token'),env,session)).status,403);
  assert.equal((await handleBlackCardPayment(new Request(url('hiro'),{headers:{origin:'https://evil.test'}}),env,session)).status,403);
  assert.equal((await handleBlackCardPayment(new Request(url('hiro'),{method:'POST'}),env,session)).status,405);
  assert.deepEqual(calls,[]);
});
