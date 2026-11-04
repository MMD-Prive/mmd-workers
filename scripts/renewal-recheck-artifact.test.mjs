import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { currentPrivateMembershipPromotion } from '../shared/membership-promotion-policy.mjs';
import { buildRenewalRecheckArtifact } from './renewal-recheck-artifact.mjs';
const manifest=JSON.parse(readFileSync(new URL('../release/renewal-recheck-20261104/artifact-delta.json',import.meta.url)));
function evaluate(source,name,input) {
 const token=v=>String(v||'').trim().toLowerCase();
 const constants={ token2:token, token5:token, __name:()=>{},
 CARE_BACK_START_MS:Date.parse('2026-08-01T00:00:00+07:00'),CARE_BACK_START_AT:'2026-08-01T00:00:00+07:00',
 PROMO_HONORED_BEFORE_MS:Date.parse('2027-01-01T00:00:00+07:00'),PROMO_HONORED_BEFORE:'2027-01-01T00:00:00+07:00',
 PROMO_PUBLIC_ENDS_BEFORE:'2026-11-01T00:00:00+07:00',
 PRIVATE_CARE_BACK:{standard:{code:'care_back_private_standard_2026',bonus_days:180,bonus_years:0,label:'CARE BACK +180 days'},premium:{code:'care_back_private_premium_2026',bonus_days:0,bonus_years:1,label:'CARE BACK +1 year'}},
 privateRenewalTiming:(expire,paid)=>({expiry_known:Number.isFinite(Date.parse(expire)),active:Date.parse(expire)>Date.parse(paid),expired_one_year_or_more:Date.parse(paid)-Date.parse(expire)>=365*86400000}),input};
 return JSON.parse(JSON.stringify(vm.runInNewContext(source+';currentPrivateMembershipPromotion(input)',constants)));
}
for(const [name,spec] of Object.entries(manifest.workers)) {
 test(name+': exact deployed policy patch preserves historical payments and matches source for new payments',()=>{
  const edit=spec.edits[0];
  for(const tier of ['standard','premium']) for(const paid of ['2026-09-01T00:00:00Z','2026-11-01T03:00:00Z','2026-11-04T08:59:59.999Z','2026-11-04T09:00:00Z','2026-12-31T16:59:59.999Z','2026-12-31T17:00:00Z']) {
   for(const action of ['renewal','signup']) {
    const input={package_code:tier,paid_at:paid,existing_member:true,prior_expire_at:'2026-10-01T00:00:00Z',action};
    const patched=evaluate(edit.after,name,input);
    if(Date.parse(paid)<Date.parse(manifest.effective_paid_at)||action==='signup')assert.deepEqual(patched,evaluate(edit.before,name,input));
    else assert.deepEqual(patched,currentPrivateMembershipPromotion(input));
   }
  }
 });
 test(name+': rejects drifted or missing baseline rather than building from main',()=>{
  assert.throws(()=>buildRenewalRecheckArtifact(name,'unrelated bundle'),/artifact drift/);
 });
}
