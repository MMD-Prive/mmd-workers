import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/a/member-intelligence.js',import.meta.url),'utf8');
const clean=v=>String(v??'').trim(), lower=v=>clean(v).toLowerCase();
function fn(name,next,bindings={}){
  const at=source.indexOf('  function '+name+'(');
  const end=source.indexOf('\n  '+next,at);
  assert.ok(at>=0&&end>at);
  return new Function(...Object.keys(bindings),source.slice(at,end)+';return '+name)(...Object.values(bindings));
}
test('negative and unknown access never render as allowed',()=>{
  const tone=fn('accessTone','function renderEvidence',{lower});
  for(const value of ['inactive','not_allowed','ineligible','revoked'])assert.equal(tone(value),'bad');
  for(const value of ['unknown','active_pending','not_active'])assert.notEqual(tone(value),'ok');
  assert.equal(tone('active'),'ok');
});
test('review_required identity and unknown access never show context ready',()=>{
  const review=fn('reviewRecommendation','function accessTone',{lower});
  assert.equal(review({verification_status:'review_required',access_status:'active',membership_status:'active'}).tone,'warn');
  assert.equal(review({verification_status:'verified',access_status:'unknown',membership_status:'active'}).tone,'warn');
  assert.equal(review({verification_status:'verified',access_status:'active',membership_status:'unknown'}).tone,'warn');
  assert.equal(review({verification_status:'verified',access_status:'active',membership_status:'active'}).tone,'ok');
});
test('relationship status active is not a membership tier',()=>{
  const memory=fn('memoryFromIntelligence','function recordName',{recordName:()=>''});
  assert.equal(memory({relationship:{relationship_state:'active'},current_state:{membership:{status:'unknown'}}},{}).relationship_tier,'');
});
test('latest search wins when older search finishes or fails later',async()=>{
  for(const failed of [false,true]){
    const at=source.indexOf('  async function loadRecords('),end=source.indexOf('\n  async function openDirectClient',at);
    const state={searchSeq:0,selectionSeq:0,recoverySeq:0,selected:{client_id:'old'},records:[],recoveryByClient:new Map(),intelligenceCache:new Map()};
    let finishOld,failOld;
    const old=new Promise((resolve,reject)=>{finishOld=resolve;failOld=reject});
    const dependencies={state,byId:()=>null,setDetailVisible:()=>{},resetDraftUi:()=>{},syncRecoveryFilterUi:()=>{},setStatus:()=>{},api:(_url,options)=>JSON.parse(options.body).query==='old'?old:Promise.resolve({records:[{client_id:'new'}]}),renderRecords:()=>{},loadRecoveryQueue:()=>{},clean,lower,location:{search:''},URLSearchParams,selectRecord:()=>{},renderRecoveryQueueSummary:()=>{},failureMessage:()=>''};
    const run=new Function(...Object.keys(dependencies),source.slice(at,end)+';return loadRecords')(...Object.values(dependencies));
    const first=run('old');
    assert.equal(state.selected,null,'old detail is cleared as soon as search starts');
    await run('new');
    failed?failOld(new Error('network')):finishOld({records:[{client_id:'old'}]});
    await first;
    assert.equal(state.records[0].client_id,'new');
  }
});

