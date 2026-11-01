import test from 'node:test';
import assert from 'node:assert/strict';
import { StageShopLedger, stageShopCatalog } from '../src/shop-ledger-stage.mjs';

class Store {
  constructor() { this.rows = new Map(); this.queue = Promise.resolve(); }
  async get(key) { return structuredClone(this.rows.get(key)); }
  transaction(fn) { const p = this.queue.then(async () => {
    const next = structuredClone(this.rows); const result = await fn({ get: async k => structuredClone(next.get(k)), put: async (k,v) => next.set(k,structuredClone(v)) }); this.rows = next; return result;
  }); this.queue = p.catch(() => {}); return p; }
}
const owner = { id: 'stage-owner', role: 'owner', shop_keys: ['kalima', 'relax'] };
const partner = shop => ({ id: 'stage-partner-' + shop, role: 'partner', shop_keys: [shop] });
const input = shop => ({ request_key: 'synthetic-request-1', course_id: shop + ':course:1', minutes: 60, therapist_amount: 80000, customer_amount: 250000 });
const rejects = (fn, code) => assert.rejects(fn, e => e.code === code);

test('approved shop catalogs use exact satang, separate IDs, durations and no Therapist', () => {
  assert.deepEqual(stageShopCatalog('kalima').courses.flatMap(c=>c.rates.map(r=>[r.minutes,r.room_course_amount])), [[60,99900],[90,119900],[120,149900],[90,159900]]);
  assert.deepEqual(stageShopCatalog('relax').courses.flatMap(c=>c.rates.map(r=>[r.minutes,r.room_course_amount])), [[60,99900],[90,119900],[120,149900],[60,119900],[90,139900],[120,169900],[90,159900],[90,169900]]);
  assert.notEqual(stageShopCatalog('kalima').ledger_key,stageShopCatalog('relax').ledger_key);
  for(const s of ['kalima','relax']) assert.equal(stageShopCatalog(s).agreement.therapist_included,false);
});
test('same request key in two shops creates isolated quotes and persists across ledger instances', async () => {
  const storage=new Store(), ledger=new StageShopLedger(storage);
  const [a,b]=await Promise.all(['kalima','relax'].map(s=>ledger.quote(owner,s,input(s))));
  assert.notEqual(a.id,b.id);assert.equal(a.plan.shares.spa,99900);assert.equal(a.plan.shares.therapist,80000);assert.equal(a.plan.shares.mms,70100);
  const reloaded=new StageShopLedger(storage);
  for(const s of ['kalima','relax']) {const snapshot=await reloaded.snapshot(owner,s);assert.equal(snapshot.ledger.quotes.length,1);assert.equal(snapshot.ledger.quotes[0].shop_key,s);}
});
test('Partner cannot read another shop, write quotes or see Therapist/customer/MMS amounts', async () => {
  const ledger=new StageShopLedger(new Store());await ledger.quote(owner,'kalima',input('kalima'));
  await rejects(()=>ledger.snapshot(partner('kalima'),'relax'),'STAGE_SHOP_ACCESS_DENIED');
  await rejects(()=>ledger.quote(partner('kalima'),'kalima',input('kalima')),'OWNER_REQUIRED');
  const snapshot=await ledger.snapshot(partner('kalima'),'kalima'), q=snapshot.ledger.quotes[0];
  assert.equal(q.room_course_amount,99900);for(const key of ['plan','therapist_amount','customer_amount','mms_amount','created_by'])assert.equal(q[key],undefined);
});
test('cross-shop course, overrides, independent extras and unknown costs fail without mutations', async () => {
  const storage=new Store(),ledger=new StageShopLedger(storage);
  for(const [patch,code] of [[{course_id:'relax:course:1'},'STAGE_COURSE_SCOPE_MISMATCH'],[{shop_key:'relax'},'STAGE_SHOP_SCOPE_MISMATCH'],[{minutes:75},'STAGE_COURSE_DURATION_INVALID'],[{room_amount:1},'SHOP_RATE_OVERRIDE_FORBIDDEN'],[{therapist_amount:null},'AMOUNT_INVALID'],[{extras_amount:100},'SHOP_EXTRAS_OUTSIDE_MMS'],[{customer_amount:1},'ALLOCATION_EXCEEDS_REVENUE']])await rejects(()=>ledger.quote(owner,'kalima',{...input('kalima'),...patch}),code);
  assert.equal(storage.rows.size,0);
});
test('duplicate and concurrent clicks create one quote; different input cannot overwrite it', async () => {
  const ledger=new StageShopLedger(new Store());const results=await Promise.all([ledger.quote(owner,'relax',input('relax')),ledger.quote(owner,'relax',input('relax'))]);assert.deepEqual(results[0],results[1]);
  await rejects(()=>ledger.quote(owner,'relax',{...input('relax'),customer_amount:260000}),'REQUEST_KEY_REUSED');
  assert.equal((await ledger.snapshot(owner,'relax')).ledger.quotes.length,1);
});
