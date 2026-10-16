import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=fs.readFileSync(new URL('./model-console-v3-i18n.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('./model-console-registered-entry.html',import.meta.url),'utf8');
const actionCode=source.slice(source.indexOf('function actions(s)'),source.indexOf('function render()'));
function renderActions(state){
 const children=[];const host={innerHTML:'',append:b=>children.push(b)};
 const context={$:()=>host,document:{createElement:()=>({dataset:{}})},next:{confirmed:['start_travel'],en_route:['mark_arrived'],arrived:['mark_met_customer'],work_started:['mark_work_finished'],work_finished:['confirm_separated']},d:()=>({ac:{start_travel:'เริ่มเดินทาง',mark_arrived:'ถึงจุดนัดแล้ว'}})};
 vm.runInNewContext(actionCode+';actions('+JSON.stringify(state)+');',context);return children;
}
test('latest v3 shows the real travel action for a confirmed owned-session presentation',()=>{
 assert.match(source,/confirmed:\['start_travel'\]/);
 const buttons=renderActions('confirmed');assert.equal(buttons.length,1);assert.equal(buttons[0].dataset.action,'start_travel');assert.equal(buttons[0].textContent,'เริ่มเดินทาง');
});
test('travel advances to arrival and does not offer start travel again',()=>{
 const buttons=renderActions('en_route');assert.deepEqual(buttons.map(b=>b.dataset.action),['mark_arrived']);
 assert.equal(renderActions('separated').length,0);assert.equal(renderActions('unknown').length,0);
});
test('restored entry cannot initiate legacy sibling LIFF login or reload',()=>{
 assert.doesNotMatch(bootstrap,/<script|liff\.init|liff\.login|location\.reload/);
 assert.match(source,/miniapp\.line\.me\/2010864854-N34SgCqq/);
 assert.match(source,/JSON\.stringify\(\{action:a,session_id:/);
});
