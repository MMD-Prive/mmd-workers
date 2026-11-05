import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('./model-console-v3-i18n.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('./model-console-registered-entry.html',import.meta.url),'utf8');
const actionCode=source.slice(source.indexOf('function actions(s)'),source.indexOf('function render()'));
function renderActions(state, allowed, paymentReadiness){
 const children=[];const host={innerHTML:'',append:b=>children.push(b)};
 const nextCode=source.match(/next=(\{.*?\}),v=/)[1];
 const next=vm.runInNewContext('('+nextCode+')');
 const context={L:'th',$:()=>host,document:{createElement:()=>({dataset:{}})},ses:{allowed_actions:allowed,payment_readiness:paymentReadiness},next,d:()=>({ac:{start_travel:'เริ่มเดินทาง',mark_arrived:'ถึงจุดนัดแล้ว'}})};
 vm.runInNewContext(actionCode+';actions('+JSON.stringify(state)+');',context);return children;
}
test('latest v3 shows the real travel action for a confirmed owned-session presentation',()=>{
 assert.match(source,/confirmed:\['start_travel'\]/);
 const buttons=renderActions('confirmed',['start_travel']);assert.equal(buttons.length,1);assert.equal(buttons[0].dataset.action,'start_travel');assert.equal(buttons[0].textContent,'เริ่มเดินทาง');
});
test('travel advances to arrival and does not offer start travel again',()=>{
 const buttons=renderActions('en_route',['mark_arrived']);assert.deepEqual(buttons.map(b=>b.dataset.action),['mark_arrived']);
 assert.equal(renderActions('separated').length,0);assert.equal(renderActions('unknown').length,0);
});
test('missing, malformed or empty backend permission fails closed',()=>{
 for(const allowed of [undefined,null,{},'start_travel',[]])assert.equal(renderActions('confirmed',allowed).length,0);
});
test('payment gate cannot be bypassed by UI state or an inconsistent action list',()=>{
 // Readiness alone must not bypass the lifecycle or server permission gate.
 const ready={status:'ready'};
 for(const state of ['offered','confirmed','en_route','nearby','arrived','met_customer','final_payment_pending','work_started','work_finished','separated','unknown']){
  assert.equal(renderActions(state,['start_work'],ready).length,0,`start_work must not render for ${state}`);
 }
 for(const allowed of [undefined,null,{},'start_work',[],['start_travel'],[{action:'start_work'}]]){
  assert.equal(renderActions('final_payment_confirmed',allowed,ready).length,0,'ready payment still requires an explicit allowed_actions entry');
 }
});
test('start work fails closed when payment readiness is missing, malformed, pending or held',()=>{
 // Do not default this fixture to ready: omitted backend data must remain denied.
 for(const readiness of [undefined,null,{},[],true,'ready',{status:true},{status:'READY'},{status:''},{status:'pending'},{status:'hold'},{status:'unknown'},{status:'unavailable'}]){
  assert.equal(renderActions('final_payment_confirmed',['start_work'],readiness).length,0,`start_work must not render for readiness ${JSON.stringify(readiness)}`);
 }
});
test('start work renders only with confirmed state, server permission and ready payment',()=>{
 assert.deepEqual(
  renderActions('final_payment_confirmed',['start_work'],{status:'ready'}).map(b=>b.dataset.action),
  ['start_work'],
 );
 // An over-broad permission list must not add actions from another lifecycle state.
 assert.deepEqual(
  renderActions('final_payment_confirmed',['start_travel','mark_arrived','start_work','confirm_separated'],{status:'ready'}).map(b=>b.dataset.action),
  ['start_work'],
 );
});
test('finished work retains separation action only when server allows it',()=>{
 assert.deepEqual(renderActions('work_finished',['confirm_separated']).map(b=>b.dataset.action),['confirm_separated']);
 assert.equal(renderActions('work_finished',[]).length,0);
 assert.equal(renderActions('separated',['confirm_separated']).length,0);
});
test('unavailable is offered only for server-authorized offered jobs',()=>{
 assert.deepEqual(renderActions('offered',['decline_job']).map(b=>b.textContent),['ไม่สะดวก']);
 assert.equal(renderActions('confirmed',['decline_job']).length,0);
 assert.equal(renderActions('offered',[]).length,0);
});
test('action submission rechecks backend hints, state and in-flight lock before a request',async()=>{
 const act=source.slice(source.indexOf('async function act(a,proposal)'),source.indexOf('function support(k)'));
 for(const [current,allowed,posting,busy,expected] of [['confirmed',['start_travel'],0,0,1],['confirmed',[],0,0,0],['work_started',['start_travel'],0,0,0],['confirmed',['start_travel'],1,0,0],['confirmed',['start_travel'],0,1,0]]){
  const requests=[];
  const context={posting,busy,ses:{session_id:'owned_fixture',state:current,allowed_actions:allowed},next:vm.runInNewContext('('+source.match(/next=(\{.*?\}),v=/)[1]+')'),state:s=>s.state,lock(){},note(){},load:async()=>{},d:()=>({}),R:{dataset:{actionEndpoint:'/mock-action'}},v:s=>s.session_id,j:async()=>({ok:true}),fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true}}};
  await vm.runInNewContext(act+';act("start_travel")',context);
  assert.equal(requests.length,expected);if(expected)assert.equal(requests[0].session_id,'owned_fixture');
 }
});
test('restored entry cannot initiate legacy sibling LIFF login or reload',()=>{
 assert.doesNotMatch(bootstrap,/<script|liff\.init|liff\.login|location\.reload/);
 assert.match(source,/miniapp\.line\.me\/2010864854-N34SgCqq/);
 assert.match(source,/JSON\.stringify\(\{action:a,session_id:/);
});
