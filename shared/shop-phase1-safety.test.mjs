import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { resolvePersistedShopBrand, shopPaymentThreads } from './shop-brand-context.mjs';
import { CHECKOUT_STATE_KEY, runCheckoutOnce, expireCheckoutReceipt } from './shop-checkout-once.mjs';

export function durableStorage() {
  const rows = new Map(); let tail = Promise.resolve();
  const storage = { async get(key) { return structuredClone(rows.get(key)); }, async put(key, value) { rows.set(key, structuredClone(value)); }, async setAlarm() {}, transaction(fn) { const p = tail.then(() => fn(storage)); tail = p.catch(() => {}); return p; } };
  return storage;
}
const receipt = () => Response.json({ ok: true, shop: 'shop', order_id: 'HIMAI-TEST', payment_url: 'https://mmdbkk.com/pay/checkout?t=test-signed-token', payment_ref: 'shop_test', payment_status: 'pending', fulfillment: { recipient_name: 'must-not-be-cached' } });
const options = (storage, execute, extra = {}) => ({ storage, execute, fingerprint: 'hash', shop: 'shop', orderId: 'HIMAI-TEST', ...extra });

test('persisted brand chooses independent names and Telegram lanes', () => {
  for (const [id, brand, thread] of [['HIMAI-1','shop',158],['MMD-1','mmd-shop',161]]) {
    const resolved = resolvePersistedShopBrand({ fields: { 'Order ID': id, Notes: 'shop_brand=' + brand } });
    assert.equal(resolved.key,brand); assert.equal(shopPaymentThreads({},resolved).thread_id,thread);
  }
});
test('conflicting or unknown persisted brand is a review error, not a guessed shop', () => {
  assert.throws(() => resolvePersistedShopBrand({ order_id:'HIMAI-1',shop_brand:'mmd-shop' }), /shop_brand_conflict/);
  assert.throws(() => resolvePersistedShopBrand({ shop_brand:'unknown' }), /shop_brand_unknown/);
  assert.equal(resolvePersistedShopBrand({ order_id:'old-order' }).key,'mmd-shop');
});
test('concurrent requests execute once and return the original signed link after completion', async () => {
  const storage=durableStorage(); let executeCount=0, release;
  const waiting=new Promise(r=>{release=r});
  const execute=async ({ checkpoint }) => { executeCount++; await checkpoint('before_order_write'); await waiting; return receipt(); };
  const first=runCheckoutOnce(options(storage,execute));
  await new Promise(r=>setImmediate(r));
  const competing=await Promise.all(Array.from({length:8},()=>runCheckoutOnce(options(storage,execute))));
  assert.ok(competing.every(r=>r.status===409)); release();
  const original=await (await first).json();
  const replay=await (await runCheckoutOnce(options(storage,execute))).json();
  assert.equal(executeCount,1);assert.equal(replay.idempotent,true);assert.equal(replay.payment_url,original.payment_url);
  const stored=await storage.get(CHECKOUT_STATE_KEY);
  assert.equal(stored.response.fulfillment,undefined);assert.equal(stored.response.payment_status,undefined);
});
test('same key with another payload or shop cannot retrieve the earlier receipt', async()=>{
  const storage=durableStorage();await runCheckoutOnce(options(storage,receipt));
  for(const extra of [{fingerprint:'other'},{shop:'mmd-shop'}]) {
    const r=await runCheckoutOnce(options(storage,()=>{throw Error('must_not_run')},extra));
    assert.equal(r.status,409);assert.equal((await r.json()).payment_url,undefined);
  }
});
test('crash after a write checkpoint never starts a second order after process restart',async()=>{
  const storage=durableStorage();let writes=0;
  const execute=async({checkpoint})=>{await checkpoint('before_order_write');writes++;throw Error('simulated_process_loss')};
  await runCheckoutOnce(options(storage,execute,{now:()=>1000}));
  const r=await runCheckoutOnce(options(storage,execute,{now:()=>200000}));
  assert.equal((await r.json()).error,'checkout_recovery_required');assert.equal(writes,1);
});
test('storage failure before durable claim prevents execution',async()=>{
  const storage=durableStorage();storage.transaction=async()=>{throw Error('unavailable')};let calls=0;
  const r=await runCheckoutOnce(options(storage,()=>{calls++;return receipt()}));assert.equal(r.status,503);assert.equal(calls,0);
});
test('lost completion write is held for review, never blindly retried',async()=>{
  const storage=durableStorage(),put=storage.put;let calls=0;
  storage.put=async(key,value)=>{if(value.state==='complete')throw Error('write_lost');return put(key,value)};
  await runCheckoutOnce(options(storage,async({checkpoint})=>{calls++;await checkpoint('order_created');return receipt()}));
  storage.put=put;
  const r=await runCheckoutOnce(options(storage,()=>{calls++;return receipt()},{now:()=>Date.now()+200000}));
  assert.equal(r.status,409);assert.equal(calls,1);
});
test('expiry removes private cached payload but retains anti-replay tombstone',async()=>{
  const storage=durableStorage();await runCheckoutOnce(options(storage,receipt,{now:()=>1000}));
  await expireCheckoutReceipt(storage,3600000);
  assert.equal((await storage.get(CHECKOUT_STATE_KEY)).response,undefined);
  const r=await runCheckoutOnce(options(storage,()=>{throw Error('no_reexecution')},{now:()=>3600000}));
  assert.equal((await r.json()).error,'checkout_resume_expired');
});
test('validation rejection before domain writes explicitly permits a new corrected attempt',async()=>{
  const r=await runCheckoutOnce(options(durableStorage(),()=>Response.json({ok:false,error:'cart_price_changed'},{status:409})));
  assert.equal((await r.json()).new_attempt_allowed,true);
});

const safetySource=await readFile(new URL('../webflow/shared/shop-checkout-safety.js',import.meta.url),'utf8');
function webStorage(){const rows=new Map();return{getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)}}
function browserContext(fetchImpl=async()=>receipt(),session=webStorage(),local=webStorage()){
 const host={localStorage:local,sessionStorage:session,crypto:webcrypto,location:{origin:'https://mmdbkk.com'},fetch:fetchImpl};
 vm.runInNewContext(safetySource,{window:host,URL,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,Map,Date,JSON});return{host,api:host.MMDShopCheckoutSafety};
}
const product={id:'recAAAAAAAAAAAAAA',sku:'BAG-01',product_name:'Travel Pouch',selling_price_thb:800,checkout_eligible:true,stock_status:'tracked',available:3};
const cart=[{product_id:product.id,name:product.product_name,sku:product.sku,unit_price_thb:500,qty:1}];
const payload={customer:{name:'Test User',phone:'0800000000',email:''},shipping:{delivery_method:'pickup'},source_path:'/shop',items:[{product_id:product.id,quantity:1,expected_unit_price_thb:800}]};
test('unloaded catalog never clears a stored cart',()=>{const{api}=browserContext();const r=api.reconcile(cart,[],false);assert.equal(r.changed,false);assert.equal(r.items.length,1)});
test('price-only changes are persisted by cart reconciliation',()=>{const{api}=browserContext();const r=api.reconcile(cart,[product],true);assert.equal(r.changed,true);assert.equal(r.items[0].unit_price_thb,800);assert.equal(api.reconcile(r.items,[product],true).changed,false)});
test('cart merges duplicate lines, caps quantity and excludes unavailable items',()=>{const{api}=browserContext();let r=api.reconcile([{...cart[0],qty:2},{...cart[0],qty:9}],[product],true);assert.equal(r.items.length,1);assert.equal(r.items[0].qty,3);assert.equal(api.reconcile(cart,[{...product,checkout_eligible:false}],true).items.length,0)});
test('storage-denied cart remains usable in memory without reverting to stale stored values',()=>{const{api}=browserContext(undefined,webStorage(),{getItem(){throw Error('denied')},setItem(){throw Error('denied')}});const s=api.cartStore('cart');s.write(cart);assert.equal(s.read()[0].unit_price_thb,500)});
test('browser double-click creates one request only',async()=>{
 let calls=0,release;const waiting=new Promise(r=>release=r);const{api}=browserContext(async()=>{calls++;await waiting;return receipt()});
 const c=api.checkoutClient('shop','/shop/api/checkout'),first=c.submit(payload);await assert.rejects(c.submit(payload),/checkout_in_progress/);await new Promise(r=>setTimeout(r,10));release();await first;assert.equal(calls,1);
});
test('lost response and reload resend the same key and exact saved draft',async()=>{
 const session=webStorage(),requests=[];let first=true;
 const fetchImpl=async(url,init)=>{requests.push({key:init.headers['idempotency-key'],body:init.body});if(first){first=false;throw Error('network_lost')}return receipt()};
 let{api}=browserContext(fetchImpl,session);await assert.rejects(api.checkoutClient('shop','/shop/api/checkout').submit(payload));
 ({api}=browserContext(fetchImpl,session));const result=await api.checkoutClient('shop','/shop/api/checkout').resume();
 assert.equal(result.order_id,'HIMAI-TEST');assert.deepEqual(requests[0],requests[1]);assert.equal(requests.length,2);
});
test('no persistent attempt storage means no checkout POST',async()=>{
 let calls=0;const{api}=browserContext(async()=>{calls++;return receipt()},{getItem(){throw Error('denied')},setItem(){throw Error('denied')}});
 await assert.rejects(api.checkoutClient('shop','/shop/api/checkout').submit(payload),/checkout_storage_required/);assert.equal(calls,0);
});
test('unknown previous attempt cannot be replaced with a different payload',async()=>{
 const{api}=browserContext(async()=>{throw Error('lost')});const c=api.checkoutClient('shop','/shop/api/checkout');await assert.rejects(c.submit(payload));await assert.rejects(c.submit({...payload,customer:{name:'Other'}}),/checkout_previous_attempt_pending/);
});
test('checkout redirect keeps signed t and rejects foreign hosts, credentials and wrong paths',()=>{
 const{api}=browserContext();assert.match(api.paymentDestination('https://mmdbkk.com/pay/checkout?t=a%2Bb'),/t=a%2Bb/);
 for(const url of ['https://evil.invalid/pay/checkout?t=x','http://mmdbkk.com/pay/checkout?t=x','https://x@mmdbkk.com/pay/checkout?t=x','https://mmdbkk.com/shop?t=x'])assert.throws(()=>api.paymentDestination(url),/invalid_payment_destination/);
});
test('successful receipt does not imply paid and explicit new-cart intent releases it',async()=>{
 let calls=0;const{api}=browserContext(async()=>{calls++;return receipt()});const c=api.checkoutClient('shop','/shop/api/checkout');const first=await c.submit(payload);await c.submit(payload);assert.equal(calls,1);assert.equal(first.payment_status,undefined);c.resetCompleted();await c.submit(payload);assert.equal(calls,2);
});
test('TH, EN and ZH all provide recovery, retry and empty-state labels',()=>{const{api}=browserContext();for(const lang of ['th','en','zh'])for(const key of ['resume','unknown','storage','expired','retry','empty'])assert.notEqual(api.extra(key,lang),key)});
