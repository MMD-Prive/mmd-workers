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

test('dynamic status removes stale translation binding and opts out of autobind',()=>{
  const attrs=new Map([['data-i18n-text','member.requests.status.reviewing'],['data-mmd-i18n-autobound','text']]);
  const el={setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),textContent:''};
  const paint=fn('setText','function setTone',{byId:()=>el,display:v=>String(v)});
  paint('miAccess','active');
  assert.equal(el.textContent,'active');
  assert.ok(attrs.has('data-mmd-i18n-skip'));
  assert.ok(!attrs.has('data-i18n-text'));
});

test('finished empty and unknown evidence never retain loading state',()=>{
  const values={};
  const paint=fn('paintMemory','async function selectRecord',{state:{},clean,lower,setText:(id,value)=>values[id]=value,setTone:()=>{},setLayerTone:()=>{},renderEvidence:()=>{},reviewRecommendation:()=>({label:'รอตรวจหลักฐานตัวตน',tone:'warn'}),accessTone:()=> 'warn'});
  for(const memory of [null,{}, {access_status:'unknown'}, {access_status:'WAITING'}]){
    paint({},memory);
    assert.equal(values.miAccess,'ยังยืนยันสิทธิ์ไม่ได้');
    assert.notEqual(values.miReview,'WAITING');
  }
  paint({},{access_status:'active'});
  assert.equal(values.miAccess,'active');
  paint({},{access_status:'denied'});
  assert.equal(values.miAccess,'denied');
});

test('search replaces Webflow submit with lookup controls: click, Enter and Escape',()=>{
  const calls=[];
  const element=()=>({handlers:{},setAttribute(){},addEventListener(k,v){this.handlers[k]=v},append(...children){this.children=children}});
  const input=Object.assign(element(),{value:' ตั้ว '});
  const original={className:'mi-search-row',replaceWith(node){this.replacement=node}};
  const install=fn('installSearchControls','function boot',{byId:id=>id==='miSearch'?input:original,document:{createElement:element},loadRecords:q=>calls.push(q),clean});
  assert.equal(install(),input);
  const controls=original.replacement;
  assert.equal(controls.children[1].type,'button');
  controls.children[1].handlers.click();
  input.value='โป้';
  for(const key of ['Enter','Escape'])input.handlers.keydown({key,preventDefault(){},stopPropagation(){}});
  assert.deepEqual(calls,['ตั้ว','โป้','']);
});

