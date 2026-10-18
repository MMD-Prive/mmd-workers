import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('./model-console-v3-i18n.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('./model-console-registered-entry.html',import.meta.url),'utf8');
const actionCode=source.slice(source.indexOf('function actions(s)'),source.indexOf('function render()'));
function renderActions(state, allowed){
 const children=[];const host={innerHTML:'',append:b=>children.push(b)};
 const nextCode=source.match(/next=(\{.*?\}),v=/)[1];
 const next=vm.runInNewContext('('+nextCode+')');
 const context={$:()=>host,document:{createElement:()=>({dataset:{}})},ses:{allowed_actions:allowed},next,d:()=>({ac:{start_travel:'เริ่มเดินทาง',mark_arrived:'ถึงจุดนัดแล้ว'}})};
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
 for(const state of ['met_customer','final_payment_pending','confirmed','unknown'])assert.equal(renderActions(state,['start_work']).length,0);
 assert.equal(renderActions('final_payment_confirmed',[]).length,0);
 assert.deepEqual(renderActions('final_payment_confirmed',['start_work']).map(b=>b.dataset.action),['start_work']);
});
test('finished work retains separation action only when server allows it',()=>{
 assert.deepEqual(renderActions('work_finished',['confirm_separated']).map(b=>b.dataset.action),['confirm_separated']);
 assert.equal(renderActions('work_finished',[]).length,0);
 assert.equal(renderActions('separated',['confirm_separated']).length,0);
});
test('action submission rechecks backend hints and state before making a request',()=>{
 assert.match(source,/async function act\(a\)\{if\(busy\|\|!ses\|\|!\(next\[state\(ses\)\]\|\|\[\]\)\.includes\(a\)\|\|!Array\.isArray\(ses.allowed_actions\)\|\|!ses.allowed_actions.includes\(a\)\)return/);
});
test('restored entry cannot initiate legacy sibling LIFF login or reload',()=>{
 assert.doesNotMatch(bootstrap,/<script|liff\.init|liff\.login|location\.reload/);
 assert.match(source,/miniapp\.line\.me\/2010864854-N34SgCqq/);
 assert.match(source,/JSON\.stringify\(\{action:a,session_id:/);
});
