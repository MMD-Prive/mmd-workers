import test from 'node:test';
import assert from 'node:assert/strict';
import { handleReplaySafeShopCheckout } from '../src/shop-checkout-idempotency.js';
import { handleShopCatalog } from '../src/shop-catalog.js';
import { MmdShopStockCoordinator } from '../src/mmd-shop-stock-coordinator.js';

function storage() {
 const rows=new Map();let tail=Promise.resolve();
 const api={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>{rows.set(k,structuredClone(v))},setAlarm:async()=>{},transaction(fn){const p=tail.then(()=>fn(api));tail=p.catch(()=>{});return p}};return api;
}
const PID='recAAAAAAAAAAAAAA';
function setup() {
 const original=globalThis.fetch,objects=new Map(),counts={orders:0,customers:0,reservations:0,payments:0,items:0},seen=[];
 const tables={products:'tblzsmNLfP6J0kQ90',customers:'tbllkfCySeL9fSfZw',orders:'tblr8lbi2wMuRM1N4',items:'tbl37Iprxz4OLL65P',stock:'tblwFgl4et1TOgtNn'};
 const product={id:PID,fields:{fld0oKjoZrb1IqntV:'Cotton Travel Pouch',fldhJE7UEE4VYHjR6:'POUCH-01',fldve5nrQmymoZgiX:['both'],fldxYkkvmK9izvACA:'active',fldJCZ7YzsUjIItKf:['recSSSSSSSSSSSSSS'],fldD6Q5yido7pTlU0:1000,fldo4N9GRq6rHPiCh:800}};
 const orders=[];
 globalThis.fetch=async(input,init={})=>{
  const req=input instanceof Request?input:new Request(input,init),url=new URL(req.url),parts=url.pathname.split('/'),table=parts[3],id=parts[4];
  assert.equal(url.hostname,'api.airtable.com');
  if(req.method==='GET'){
   if(table===tables.products && id===PID)return Response.json(product);
   if(table===tables.stock)return Response.json({records:[{id:'recBBBBBBBBBBBBBB',fields:{fldVc73xUxjrfSjHY:[PID],fldvjoRuM1mrR6ItQ:5,fldZW2m1Xq8q0ZH9Z:'active'}}]});
   if(table===tables.customers)return Response.json({records:[]});
  }
  const body=await req.json();
  if(req.method==='POST'){
   let key=Object.entries(tables).find(([,v])=>v===table)?.[0];assert.ok(['orders','customers','items'].includes(key));counts[key]++;
   const records=(body.records||[]).map((x,i)=>({id:'rec'+(key==='orders'?'O':key==='customers'?'C':'I').repeat(13)+i,fields:x.fields}));
   if(key==='orders')orders.push(...records);return Response.json({records});
  }
  if(req.method==='PATCH')return Response.json({id,fields:body.fields});
  throw Error('unexpected_mock_request');
 };
 const env={AIRTABLE_BASE_ID:'appTest',AIRTABLE_TOKEN:'fixture-token',PAYMENTS_WORKER:{fetch:async req=>{counts.payments++;seen.push(await req.json());return Response.json({ok:true,payment_ref:'shop_fixture',customer_payment_url:'https://mmdbkk.com/pay/checkout?t=signed-fixture'})}}};
 env.MMD_SHOP_STOCK_COORDINATOR={idFromName:x=>x,get:id=>{
  if(id==='global')return{fetch:async(url,init)=>{assert.equal(new URL(url).pathname,'/reserve');const p=JSON.parse(init.body);counts.reservations++;return Response.json({ok:true,reservation:{schema:'mmd_shop_stock_reservation_v1',state:'reserved',order_id:p.order_id,expires_at:new Date(Date.now()+2700000).toISOString(),items:[]}})}};
  if(!objects.has(id))objects.set(id,new MmdShopStockCoordinator({storage:storage(),waitUntil:()=>{}},env));
  return objects.get(id);
 }};
 return{env,counts,seen,orders,product,restore(){globalThis.fetch=original}};
}
function request(shop='shop',key='sc1_'+'a'.repeat(32),price=800,changes={}){
 const body={customer:{name:'Fixture User',phone:'0800000000'},shipping:{delivery_method:'pickup'},source_path:'/untrusted;shop_brand=mmd-shop',shop_brand:'forged',member_id:'forged',items:[{product_id:PID,quantity:1,expected_unit_price_thb:price}],...changes};
 const headers={'content-type':'application/json'};if(key)headers['idempotency-key']=key;
 return new Request('https://mmdbkk.com/'+shop+'/api/checkout',{method:'POST',headers,body:JSON.stringify(body)});
}
for(const[shop,price,prefix]of[['shop',800,'HIMAI-'],['mmd-shop',1000,'MMD-']])test(shop+' full checkout ingress: concurrent replay causes exactly one order, reservation and payment intent',async()=>{
 const x=setup();try{
  const results=await Promise.all(Array.from({length:8},()=>handleReplaySafeShopCheckout(request(shop,undefined,price),x.env)));
  assert.ok(results.every(r=>r.status===200||r.status===409));
  const successes=await Promise.all(results.filter(r=>r.status===200).map(r=>r.json()));
  const fresh=successes.filter(r=>r.idempotent===false);assert.equal(fresh.length,1);
  const first=fresh[0];const replay=await(await handleReplaySafeShopCheckout(request(shop,undefined,price),x.env)).json();
  assert.equal(first.total_thb,price);assert.ok(first.order_id.startsWith(prefix));assert.equal(replay.order_id,first.order_id);assert.equal(replay.payment_url,first.payment_url);assert.equal(replay.idempotent,true);
  assert.deepEqual(x.counts,{orders:1,customers:1,reservations:1,payments:1,items:1});
  assert.equal(x.seen[0].amount,price);assert.equal(x.orders[0].fields.fld97aHqq3IbPam84,shop==='shop'?'Himai Shop':'MMD Shop');
  assert.match(x.orders[0].fields.fldWG0u77XQ5W0wpT,new RegExp('source_path=/'+shop+';'));assert.doesNotMatch(x.orders[0].fields.fldWG0u77XQ5W0wpT,/untrusted|forged/);
 }finally{x.restore()}
});
test('price changes are rejected before customer/order/stock/payment writes',async()=>{const x=setup();try{const r=await handleReplaySafeShopCheckout(request('shop',undefined,1000),x.env);const body=await r.json();assert.equal(r.status,409);assert.equal(body.error,'cart_price_changed');assert.equal(body.new_attempt_allowed,true);assert.equal(x.counts.orders,0);assert.equal(x.counts.customers,0);assert.equal(x.counts.reservations,0)}finally{x.restore()}});
test('same key cannot be switched to the other shop',async()=>{const x=setup();try{await handleReplaySafeShopCheckout(request(),x.env);const r=await handleReplaySafeShopCheckout(request('mmd-shop',undefined,1000),x.env);assert.equal(r.status,409);assert.equal((await r.json()).error,'checkout_key_conflict');assert.equal(x.counts.orders,1)}finally{x.restore()}});
test('missing idempotency key fails before every domain write',async()=>{const x=setup();try{const r=await handleReplaySafeShopCheckout(request('shop',''),x.env);assert.equal(r.status,428);assert.equal(x.counts.orders,0);assert.equal(x.counts.payments,0)}finally{x.restore()}});
test('missing durable binding fails closed and never falls back to unprotected checkout',async()=>{const x=setup();try{delete x.env.MMD_SHOP_STOCK_COORDINATOR;const r=await handleReplaySafeShopCheckout(request(),x.env);assert.equal(r.status,503);assert.equal(x.counts.orders,0)}finally{x.restore()}});
test('blank Himai price never falls back to MMD price',async()=>{const x=setup();try{x.product.fields.fldo4N9GRq6rHPiCh=null;const r=await handleReplaySafeShopCheckout(request(),x.env);assert.equal((await r.json()).error,'product_price_unavailable');assert.equal(x.counts.orders,0)}finally{x.restore()}});
test('restricted SKU stays closed on both shops before any mutation',async()=>{const x=setup();try{x.product.fields.fldhJE7UEE4VYHjR6='PPP25-FIXTURE';for(const[shop,price,key]of[['shop',800,'b'],['mmd-shop',1000,'c']]){const r=await handleReplaySafeShopCheckout(request(shop,'sc1_'+key.repeat(32),price),x.env);assert.equal(r.status,403)}assert.equal(x.counts.orders,0)}finally{x.restore()}});
test('GET checkout method guard remains read-only after new ingress wrapper',async()=>{const x=setup();try{const r=await handleReplaySafeShopCheckout(new Request('https://mmdbkk.com/shop/api/checkout'),x.env);assert.equal(r.status,405);assert.equal(x.counts.orders,0)}finally{x.restore()}});
test('oversized JSON request is rejected before creating a durable checkout object',async()=>{const x=setup();try{const r=await handleReplaySafeShopCheckout(request('shop',undefined,800,{padding:'x'.repeat(18000)}),x.env);assert.equal(r.status,413);assert.equal(x.counts.orders,0)}finally{x.restore()}});

test('a visible legacy product without brand approval cannot advertise checkout eligibility',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{
  const path=new URL(String(input)).pathname;
  if(path.includes('tblzsmNLfP6J0kQ90'))return Response.json({records:[{id:PID,fields:{'Product Name':'Cotton Travel Pouch','SKU':'POUCH-01','Status':'active','Himai Selling Price THB':800,'MMD Shop Selling Price THB':1000}}]});
  if(path.includes('tblwFgl4et1TOgtNn'))return Response.json({records:[{id:'recBBBBBBBBBBBBBB',fields:{'Product':[PID],'Quantity Remaining':5,'Batch Status':'active'}}]});
  if(path.includes('tbl81bnFyASeXCj9x'))return Response.json({records:[]});
  throw Error('unexpected_request');
 };
 try{for(const shop of ['shop','mmd-shop']){const response=await handleShopCatalog(new Request('https://mmdbkk.com/'+shop+'/api/products'),{AIRTABLE_BASE_ID:'appTest',AIRTABLE_TOKEN:'fixture'});const data=await response.json();assert.equal(data.products.length,1);assert.equal(data.products[0].checkout_eligible,false)}}finally{globalThis.fetch=original}
});
