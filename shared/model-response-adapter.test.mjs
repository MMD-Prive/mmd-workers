import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createModelResponseAdapter} from './model-response-adapter.mjs';
import {normalizeModelDecline} from './model-decline-options.mjs';
import {legacyHandlerSource} from './model-response-legacy-writer.fixture.mjs';
const consoleProjection={normalized_state:'confirmed',page:'confirmed',route:'/model/session/confirmed',allowed_actions:['start_travel'],job_type:'fixture',job_date:'2099-11-05',start_time:'2099-11-05T12:00:00+07:00',end_time:'2099-11-05T13:00:00+07:00',location_name:'Fixture location',google_map_url:'https://maps.example.invalid/fixture',package_code:'fixture',model_work_lane:'public_model',pay_model_thb:100,payout_terms:{policy_version:'fixture',money_lane:'public_model',compensation_mode:'public_package_matrix',package_code:'fixture',base_payout_thb:100,public_package_matrix_applies:true,public_ot_matrix_applies:true,overtime_payout_thb_per_hour:10,reimbursable_expenses:['parking'],extension_requires_model_approval:true,extension_requires_mmd_confirmation:true}};
function setup(){
 const cachedAuthority={};
 const records=new Map();let etag=0,writes=0,notices=0;let state='offered',binding='binding-1',ownership=true,loseResponse=false,revision='rev1',beforeFence=null;let queue=Promise.resolve();
 const bucket={async get(k){let x=records.get(k);return x?{json:async()=>JSON.parse(x.body)}:null},async put(k,body,{onlyIf}){let old=records.get(k);if(onlyIf.etagDoesNotMatch&&old)return null;if(onlyIf.etagMatches&&old?.etag!==onlyIf.etagMatches)return null;let tag=String(++etag);records.set(k,{body,etag:tag});return{etag:tag}}};
 const session={id:'recFixture',fields:{session_id:'sess_fixture',model_session_state:state}};
 const ctx=()=>({ok:true,tables:{sessions:{table:'Sessions'}},session:{id:session.id,fields:{...session.fields}}});
 const legacy=vm.runInNewContext(legacyHandlerSource+';handleModelSessionAction',{
  safeJson:r=>r.json(),resolveModelSessionContext:async()=>ctx(),modelSessionActionTargetsContext:(b,c)=>b.session_id===c.session.fields.session_id,str:x=>String(x??''),modelSessionJson:(x,s=200)=>Response.json(x,{status:s}),
  modelSessionResponseSession:(_t,r)=>({...consoleProjection,...r.fields,state:r.fields.model_session_state,normalized_state:r.fields.model_session_state,token:'private-fixture',internal_notes:'private-fixture'}),normalizeModelSessionAction:x=>x,normalizeModelDecline,
  PUBLIC_EXTENSION_MODEL_ACTIONS:new Set(),MODEL_SESSION_MODEL_ALLOWED_ACTIONS:new Set(['accept_job','decline_job','start_travel']),MODEL_SESSION_MODEL_BLOCKED_ACTIONS:new Set(),
  modelSessionStateFromRecord:(_t,r)=>({field:'model_session_state',state:r.fields.model_session_state}),normalizeSessionState:x=>x,
  resolveModelSessionTransition:(a,s)=>({ok:a==='start_travel'?s==='confirmed':s==='offered',to:a==='start_travel'?'en_route':a==='accept_job'?'confirmed':'offer_declined'}),
  airtablePatchById:async(_e,_t,id,patch)=>{assert.equal(id,session.id);assert.deepEqual(Object.keys(patch),['model_session_state']);writes++;Object.assign(session.fields,patch);state=patch.model_session_state;return{ok:true,id,fields:{...session.fields}}},
  notifyTravelEvent:async()=>{notices++;return{delivered:true,status:'accepted_by_mock_transport'}},requestMemberReplyRefresh:()=>{throw Error('must not notify')},
 });
 const handler=createModelResponseAdapter({bucket,readAuthority:async()=>Object.assign(cachedAuthority,{ok:ownership,allowed:state==='offered',session_id:'sess_fixture',model_id:'recModel',offer_revision:revision,binding}),withOfferFence:async(_expected,callback)=>{let release;const prior=queue;queue=new Promise(r=>release=r);await prior;try{if(beforeFence){beforeFence();beforeFence=null;}return await callback();}finally{release();}},writer:async(r,e)=>{const out=await legacy(r,e);if(loseResponse)throw Error('response lost');return out}});
 const input={action:'accept_job',session_id:'sess_fixture',offer_revision:'rev1',operation_id:'operation_000001'};
 const call=body=>handler(new Request('https://local.invalid/v1/model/session/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{}).then(r=>r.json());
 return{call,input,records,writes:()=>writes,notices:()=>notices,state:()=>state,setBinding:x=>binding=x,deny:()=>ownership=false,lose:()=>loseResponse=true,reissueBeforeWrite:()=>beforeFence=()=>revision='rev2',changeBindingBeforeWrite:()=>beforeFence=()=>binding='binding-2'};
}
for(const action of ['accept_job','decline_job'])test(action+' uses original writer once across tabs and preserves durable proposal',async()=>{
 const f=setup(),input={...f.input,action,...(action==='decline_job'?{reason:'Unavailable',availability_options:['2099-11-05T12:00']}: {})};
 const results=await Promise.all([f.call(input),f.call({...input,operation_id:'operation_other_tab'})]);assert.equal(f.writes(),1);assert.equal(f.state(),action==='accept_job'?'confirmed':'offer_declined');const first=results.find(x=>x.ok);assert.ok(first);assert.equal(first.session.session_id,'sess_fixture');assert.equal(first.session.model_session_state,f.state());assert.deepEqual(await f.call(input),first);
 if(action==='decline_job')assert.deepEqual(JSON.parse([...f.records.values()][0].body).proposal.options,['2099-11-05T12:00']);
});
test('opposite responses from two tabs cannot both write',async()=>{const f=setup();await f.call(f.input);const r=await f.call({...f.input,action:'decline_job',availability_options:['2099-11-05T12:00']});assert.equal(r.receipt.code,'response_operation_conflict');assert.equal(f.writes(),1)});
test('response lost after old writer committed never invokes writer again',async()=>{const f=setup();f.lose();assert.equal((await f.call(f.input)).receipt.outcome,'unknown');assert.equal((await f.call({...f.input,operation_id:'operation_other_tab'})).receipt.outcome,'unknown');assert.equal(f.writes(),1)});
test('ownership and binding are checked on replay',async()=>{const f=setup();await f.call(f.input);f.setBinding('changed');assert.equal((await f.call(f.input)).receipt.code,'response_operation_conflict');f.deny();assert.equal((await f.call(f.input)).receipt.code,'response_not_authorized');assert.equal(f.writes(),1)});

test('reissue after journal claim but before the fenced write prevents mutation',async()=>{const f=setup();f.reissueBeforeWrite();const result=await f.call(f.input);assert.equal(result.receipt.outcome,'unknown');assert.equal(f.writes(),0);assert.equal(f.state(),'offered');});
test('session result and persisted replay exclude unapproved writer fields',async()=>{const f=setup();const first=await f.call(f.input);assert.equal(first.ok,true);assert.doesNotMatch(JSON.stringify(first),/private-fixture|token|internal_notes/);assert.deepEqual(await f.call({...f.input,operation_id:'operation_other_tab'}),first);assert.doesNotMatch(JSON.stringify([...f.records.values()]),/private-fixture|internal_notes/);});
test('missing fence fails closed without calling authority, storage or writer',async()=>{const unexpected=()=>{throw Error('must not call')};const handler=createModelResponseAdapter({bucket:{get:unexpected,put:unexpected},readAuthority:unexpected,writer:unexpected});const response=await handler(new Request('https://local.invalid/action',{method:'POST',body:JSON.stringify({action:'accept_job'})}),{});assert.equal(response.status,503);assert.equal((await response.json()).error,'offer_fence_unavailable');});

test('cached authority object mutated inside fence cannot hide a binding change',async()=>{const f=setup();f.changeBindingBeforeWrite();const result=await f.call(f.input);assert.equal(result.receipt.outcome,'unknown');assert.equal(f.writes(),0);assert.equal(f.state(),'offered');});
test('complete Console projection survives first response and cross-tab replay',async()=>{const f=setup();const first=await f.call(f.input);assert.equal(first.ok,true);assert.deepEqual(first.session,{...consoleProjection,session_id:'sess_fixture',state:'confirmed',model_session_state:'confirmed'});const replay=await f.call({...f.input,operation_id:'operation_other_tab'});assert.deepEqual(replay,first);assert.equal(f.writes(),1);});

// In-process simulated lifecycle only: no LINE or production transport is used.
test('simulated acceptance then travel preserves session and returns mock notification receipt',async()=>{
 const f=setup();const accepted=await f.call(f.input);assert.equal(accepted.ok,true);assert.equal(f.notices(),0);
 const travel=await f.call({action:'start_travel',session_id:accepted.session.session_id});
 assert.equal(travel.ok,true);assert.equal(travel.session.session_id,'sess_fixture');assert.equal(travel.session.model_session_state,'en_route');
 assert.deepEqual(travel.notification,{delivered:true,status:'accepted_by_mock_transport'});assert.equal(f.notices(),1);
 const repeated=await f.call({action:'start_travel',session_id:'sess_fixture'});assert.equal(repeated.ok,false);assert.equal(f.notices(),1);assert.equal(f.writes(),2);
});
test('simulated decline and mismatched session cannot start travel or notify',async()=>{
 const f=setup();await f.call({...f.input,action:'decline_job',availability_options:['2099-11-05T12:00']});
 assert.equal((await f.call({action:'start_travel',session_id:'sess_fixture'})).ok,false);
 assert.equal((await f.call({action:'start_travel',session_id:'another_session'})).ok,false);
 assert.equal(f.writes(),1);assert.equal(f.notices(),0);
});
