import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderModelJobBrief} from './model-job-brief.mjs';
const setup=()=>new JSDOM('<main><section class="smcv3-summary"></section><button disabled data-action="start_work">Start</button></main>');
test('customer deposit/full payment never becomes a model payout, with lane-specific copy',()=>{
 const dom=setup(),root=dom.window.document.querySelector('main');
 for(const [lane,brand]of [['public_model','MMD'],['private_model','SĪGIL']]){
  const session={session_id:'s',state:'confirmed',model_work_lane:lane,customer_payment:{schema:'model_customer_payment_v1',source:'payments_verified_ledger',session_id:'s',status:'deposit_paid'}};
  renderModelJobBrief(root,session);assert.match(root.textContent,new RegExp('ลูกค้าโอนมัดจำแล้ว · '+brand));
  assert.doesNotMatch(root.querySelector('dl>div:last-child dd').textContent,/โอนแล้ว/);
  renderModelJobBrief(root,{...session,customer_payment:{...session.customer_payment,status:'fully_paid'}});assert.match(root.textContent,/ลูกค้าชำระครบแล้ว/);
  renderModelJobBrief(root,{...session,customer_payment:{...session.customer_payment,session_id:'other'}});assert.match(root.textContent,/ยังยืนยันสถานะชำระไม่ได้/);
 }
 dom.window.close();
});
for(const [lane,brand]of [['public_model','MMD'],['private_model','SĪGIL']])test(lane+' labels follow authenticated work lane, not skin',()=>{
 const dom=setup(),root=dom.window.document.querySelector('main');root.dataset.modelBrandLane='opposite-skin';
 const s={session_id:'s',state:'closed',model_work_lane:lane,payout_terms:{money_lane:lane},pay_model_thb:5000,payout:{status:'paid',verified:true,source:'owner_verified_transfer',amount_thb:5000,paid_at:'2026-01-01T00:00:00Z'}};
 renderModelJobBrief(root,s);assert.match(root.textContent,new RegExp(brand+' โอนค่าตัวให้คุณแล้ว'));
 assert.match(root.textContent,/การชำระของลูกค้ายังยืนยันสถานะชำระไม่ได้/);assert.doesNotMatch(root.textContent,/มัดจำแล้ว|เปอร์/);
 renderModelJobBrief(root,{...s,payout_terms:{money_lane:lane==='public_model'?'private_model':'public_model'}});
 assert.doesNotMatch(root.querySelector('dl>div:last-child dd').textContent,/MMD|SĪGIL/);dom.window.close();
});
test('paid UI requires complete canonical projection and clears proof on refresh',()=>{
 const dom=setup(),root=dom.window.document.querySelector('main');
 const session={session_id:'s',state:'closed',pay_model_thb:5000,payout:{status:'paid',verified:true,source:'owner_verified_transfer',amount_thb:5000,paid_at:'2026-01-01T00:00:00Z'}};
 renderModelJobBrief(root,session);assert.match(root.querySelector('dl>div:last-child dd').textContent,/โอนแล้ว/);
 for(const change of [{verified:false},{amount_thb:6000},{source:'preview'},{paid_at:'bad'}]){
  renderModelJobBrief(root,{...session,payout:{...session.payout,...change}});assert.doesNotMatch(root.querySelector('dl>div:last-child dd').textContent,/โอนแล้ว/);
 }
 renderModelJobBrief(root,{session_id:'other',state:'closed'});assert.doesNotMatch(root.querySelector('dl>div:last-child dd').textContent,/โอนแล้ว/);dom.window.close();
});
test('only essential fields, client display name preserved as text, no customer pricing or bank data',()=>{
 const dom=setup(),root=dom.window.document.querySelector('main'),button=root.querySelector('button');
 renderModelJobBrief(root,{session_id:'session-A',client_name:'คุณเอ <img src=x>',end_time:'21:00',pay_model_thb:5000,state:'confirmed',customer_amount_due_thb:99000,bank_account:'secret-account',phone:'secret-phone'});
 assert.match(root.textContent,/คุณเอ <img src=x>/);assert.equal(root.querySelector('img'),null);
 assert.doesNotMatch(root.textContent,/99000|secret-account|secret-phone/);
 assert.equal(root.querySelector('button'),button);assert.equal(button.disabled,true);
 dom.window.close();
});
for(const [state,expected]of [['confirmed','ยังไม่ถึงขั้นตอนจ่าย'],['under_review','รอตรวจจบงาน'],['payout_pending','รอโอน'],['closed','ยังยืนยันการโอนไม่ได้']]){
 test(state+' never claims a transfer without evidence',()=>{
  const dom=setup(),root=dom.window.document.querySelector('main');
  renderModelJobBrief(root,{session_id:'s',state,pay_model_thb:5000});assert.match(root.textContent,new RegExp(expected));
  assert.doesNotMatch(root.querySelector('dl>div:last-child dd').textContent,/โอนแล้ว|โอนสำเร็จ/);dom.window.close();
 });
}
test('invalid/missing amounts never become zero; refresh replaces old identity; lock clears the panel',()=>{
 const dom=setup(),root=dom.window.document.querySelector('main');
 for(const value of [null,undefined,'5000',0,-1,NaN,Infinity]){
  renderModelJobBrief(root,{session_id:'s',client_name:'เก่า',pay_model_thb:value});assert.match(root.textContent,/ยังยืนยันยอดไม่ได้/);
 }
 renderModelJobBrief(root,{session_id:'new',client_name:'ใหม่',pay_model_thb:6000});assert.doesNotMatch(root.textContent,/เก่า/);
 assert.equal(root.querySelectorAll('[data-model-job-brief]').length,1);
 renderModelJobBrief(root,null);assert.equal(root.querySelector('[data-model-job-brief]'),null);dom.window.close();
});
