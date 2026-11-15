import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,MODEL,OTHER,apiModule} from './helpers/partner-fixture.mjs';

test('roster order persists with compare-and-swap, refuses stale writes and never mutates sales or notifies',async t=>{
 const f=await fixture();t.after(f.restore);
 const first=await(await f.call('/v1/partner/roster-order')).json();
 assert.deepEqual(first.model_ids,[]);assert.equal(first.revision,null);
 const saved=await(await f.call('/v1/partner/roster-order',{body:{revision:null,model_ids:[MODEL]}})).json();assert.ok(saved.ok);assert.ok(saved.revision);
 const stale=await f.call('/v1/partner/roster-order',{body:{revision:null,model_ids:[]}});assert.equal(stale.status,409);
 const loaded=await(await f.call('/v1/partner/roster-order')).json();assert.deepEqual(loaded.model_ids,[MODEL]);
 const next=await f.call('/v1/partner/roster-order',{body:{revision:loaded.revision,model_ids:[]}});assert.equal(next.status,200);
 assert.deepEqual(f.writes,[]);assert.deepEqual(f.messages,[]);
});
test('foreign, removed, duplicate and revoked-account orders cannot be saved',async t=>{
 const f=await fixture();t.after(f.restore);
 for(const [ids,status] of [[[OTHER],403],[[MODEL,MODEL],400]])assert.equal((await f.call('/v1/partner/roster-order',{body:{revision:null,model_ids:ids}})).status,status);
 f.db.Referrals[0].fields[apiModule.MODEL_REFERRALS.ownershipStatus]='revoked';
 assert.equal((await f.call('/v1/partner/roster-order',{body:{revision:null,model_ids:[MODEL]}})).status,403);
 assert.equal(f.objects.size,0);
 f.db.Partners[0].fields[apiModule.MODEL_PARTNERS.accessTokenHash]='revoked';
 assert.equal((await f.call('/v1/partner/roster-order')).status,401);
});
test('read order drops models no longer in the active roster',async t=>{
 const f=await fixture();t.after(f.restore);
 await f.call('/v1/partner/roster-order',{body:{revision:null,model_ids:[MODEL]}});
 f.db.Referrals[0].fields[apiModule.MODEL_REFERRALS.ownershipStatus]='transferred';
 const result=await(await f.call('/v1/partner/roster-order')).json();assert.deepEqual(result.model_ids,[]);
});
