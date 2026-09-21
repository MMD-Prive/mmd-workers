import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleShopIntent, maybeHandleShopConfirmationDetails, enrichShopConfirmVerify, reconcileReviewedShopPayment } from './shop-payment-v1.js';
import { paymentSnapshot, paymentProofTelegramRoute } from './unified-payment-proof.js';

function fixture(shop) {
  const original = globalThis.fetch, writes = [], messages = [], values = new Map();
  const orderId = (shop === 'shop' ? 'HIMAI' : 'MMD') + '-FIXTURE-1';
  const name = shop === 'shop' ? 'Himai Shop' : 'MMD Shop';
  const order = { id: 'recOrder123456789', fields: {
    flde515MCoEq08YzU: orderId, fld97aHqq3IbPam84: name, fldnCO3H5CpJoYmWD: 'draft',
    fldUpDeLdO6D9OUcd: 'pending', fldYIwMzRJdKdznkY: 100, fldWG0u77XQ5W0wpT: `schema=mmd_shop_order_v1; shop_brand=${shop}`,
  } };
  let payment = null;
  const env = {
    AIRTABLE_BASE_ID: 'appFixture', AIRTABLE_API_KEY: 'fixture-not-a-secret',
    PAYMENT_CONFIRMATION_SIGNING_SECRET: 'fixture-signing-secret-only',
    PAY_SESSIONS_KV: { async get(k) { return values.get(k); }, async put(k,v) { values.set(k,v); } },
    AUTH_SERVICE_PAYMENTS_TO_TELEGRAM: 'fixture-not-a-secret',
    TELEGRAM_WORKER: { async fetch(request) { messages.push(await request.json()); return Response.json({ok:true, telegram:{ok:true}}); } },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input)); assert.equal(url.hostname, 'api.airtable.com');
    const [, , table, id] = url.pathname.split('/').filter(Boolean), method = init.method || 'GET';
    if (method === 'GET') return Response.json({ records: table === 'tblr8lbi2wMuRM1N4' ? [structuredClone(order)] : table === 'tblWGGJJOx5eBvBZJ' ? (payment ? [structuredClone(payment)] : []) : [] });
    const body = JSON.parse(init.body); writes.push({table,method});
    if (method === 'POST' && table === 'tblWGGJJOx5eBvBZJ') {
      payment = { id: 'recPayment1234567', fields: body.records ? body.records[0].fields : body.fields };
      return Response.json({ records:[structuredClone(payment)], ...structuredClone(payment) });
    }
    if (method === 'PATCH' && id === order.id) { Object.assign(order.fields, body.fields); return Response.json(structuredClone(order)); }
    throw new Error('Unexpected fixture write');
  };
  return { env, name, shop, orderId, order, writes, messages, payment:()=>payment, restore:()=>{ globalThis.fetch=original; } };
}
function request(path, body) { return new Request('https://payments.internal'+path, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)}); }
for (const shop of ['shop','mmd-shop']) {
  test(`${shop}: signed payment details and enriched claims retain server brand, exact token and pending evidence state`, {concurrency:false}, async()=>{
    const f=fixture(shop);
    try {
      const response=await handleShopIntent(request('/v1/pay/shop-intent',{order_id:f.orderId,amount:100,shop_brand:'attacker',notes:'shop_brand=attacker'}),f.env);
      const intent=await response.json(); assert.equal(response.status,200,JSON.stringify(intent));
      assert.equal(intent.shop_brand,shop); assert.equal(intent.shop_name,f.name);
      assert.ok(f.payment().fields.fldjsZIKoJPawlb2u.includes(`shop_brand=${shop}`));
      const token=new URL(intent.customer_payment_url).searchParams.get('t'); assert.equal(token,intent.customer_t);
      const details=await (await maybeHandleShopConfirmationDetails(request('/v1/confirm/details',{t:token}),f.env)).json();
      assert.equal(details.model_name,f.name); assert.equal(details.shop_order.shop_brand,shop);
      assert.equal(details.payment.verified,false); assert.equal(details.payment.proof_received,false);
      assert.equal(details.payment_status,'pending'); assert.equal(f.order.fields.fldUpDeLdO6D9OUcd,'pending');
      const claims=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'));
      const enriched=await (await enrichShopConfirmVerify(request('/v1/confirm/verify',{t:token}),Response.json({ok:true,claims}),f.env)).json();
      assert.equal(enriched.claims.model_name,f.name); assert.equal(enriched.claims.shop_brand,shop); assert.equal(enriched.claims.payment.verified,false);
      f.payment().fields.fld04fr3bRJTohO6y='manual_slip_evidence_received';
      const evidence=await (await maybeHandleShopConfirmationDetails(request('/v1/confirm/details',{t:token}),f.env)).json();
      assert.equal(evidence.payment.proof_received,true); assert.equal(evidence.payment.verified,false);
      assert.equal(f.messages.length,0);
    } finally {f.restore();}
  });
  test(`${shop}: verified-payment notification uses the stored order brand`, {concurrency:false},async()=>{
    const f=fixture(shop);
    try {
      const res=await reconcileReviewedShopPayment(request('/review',{payment_stage:'shop',order_id:f.orderId,payment_ref:'fixture',amount_thb:100,shop_brand:shop==='shop'?'mmd-shop':'shop'}),Response.json({ok:true}),f.env);
      const payload=await res.json(); assert.equal(res.status,200,JSON.stringify(payload));
      assert.equal(f.messages.length,1); assert.equal(f.messages[0].flow,shop==='shop'?'himai_payments':'mmd_shop_payments');
      assert.ok(f.messages[0].text.startsWith(shop==='shop'?'<b>HIMAI SHOP':'<b>MMD SHOP'));
      assert.equal(payload.shop_order_settlement.shop_brand,shop);
    } finally {f.restore();}
  });
  test(`${shop}: payment proof routing ignores browser brand claims`,()=>{
    const form=new FormData(); form.set('shop_brand',shop==='shop'?'mmd-shop':'shop'); form.set('payment_stage','shop');
    const snapshot=paymentSnapshot({fields:{'Session ID':(shop==='shop'?'HIMAI':'MMD')+'-FIXTURE-1',Notes:`shop_brand=${shop}`,payment_stage:'shop'}},form);
    const route=paymentProofTelegramRoute({},snapshot,'/shop');
    assert.equal(snapshot.shop_brand,shop); assert.equal(route.thread_id,shop==='shop'?158:161); assert.equal(route.alerts_thread_id,shop==='shop'?159:162);
  });
}
test('conflicting server brand fails before payment intent writes', {concurrency:false},async()=>{
  const f=fixture('shop'); f.order.fields.fld97aHqq3IbPam84='MMD Shop';
  try { const res=await handleShopIntent(request('/v1/pay/shop-intent',{order_id:f.orderId,amount:100}),f.env); assert.equal(res.status,409); assert.equal((await res.json()).error,'shop_brand_conflict'); assert.equal(f.writes.length,0); } finally {f.restore();}
});
test('payment proof document allowlist includes Himai without opening arbitrary destinations',async()=>{
  const text=await readFile(new URL('../telegram-worker/src/index.js',import.meta.url),'utf8');
  const group=text.slice(text.indexOf('const allowedThreads = new Set'),text.indexOf('const allowedThreads = new Set')+650);
  assert.match(group,/TG_THREAD_HIMAI_PAYMENTS \|\| 158/); assert.match(group,/TG_THREAD_MMD_SHOP_PAYMENTS \|\| 161/);
  assert.match(group,/allowedThreads\.has/);
});
