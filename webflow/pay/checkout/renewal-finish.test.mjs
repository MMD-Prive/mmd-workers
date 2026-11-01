import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('./footer.html',import.meta.url),'utf8');
const helpers=html.slice(html.indexOf('function isRenewalPayment('),html.indexOf('function syncProofState('));
function setup(){
 const context={document:{createElement(tag){return {tag,children:[],attributes:{},append(...items){this.children.push(...items);},setAttribute(k,v){this.attributes[k]=v;}};}}};
 runInNewContext(helpers,context);return context;
}
for(const tier of ['standard','premium'])test(`${tier} Finish requires actual backend proof receipt, preserves pending, and offers clear destinations`,()=>{
 const c=setup(),p={payment_type:'membership',session_id:'liffrenew_'+tier+'_'+'a'.repeat(24),payment_ref:'fixture-ref'};
 const receipt={ok:true,evidence_submitted:true,payment_ref:p.payment_ref,proof_id:'webproof_fixture',payment_status:'pending',verification_status:'pending_verification'};
 assert.equal(c.renewalEvidenceState(p,receipt),'pending_verification');
 for(const mutate of [r=>delete r.proof_id,r=>r.evidence_submitted=false,r=>r.payment_ref='foreign',r=>r.ok=false,r=>r.payment_status='paid']){
  const invalid={...receipt};mutate(invalid);assert.equal(c.renewalEvidenceState(p,invalid),'');
 }
 const before=structuredClone(p),state={children:[],append(x){this.children.push(x);}};
 c.syncRenewalFinish(p,'pending_verification',state);assert.equal(state.children.length,1);
 const children=state.children[0].children;
 assert.equal(children[0].textContent,'ส่งหลักฐานแล้ว · รอตรวจสอบ');
 assert.equal(children[2].textContent,'เสร็จสิ้น · Finish');assert.equal(children[2].href,'/member/payments');
 assert.equal(children[3].textContent,'กลับ MY MMD');assert.equal(children[3].href,'/member/my-mmd');
 assert.deepEqual(p,before);
 const verified={...receipt,payment_status:'paid',verification_status:'verified'};assert.equal(c.renewalEvidenceState(p,verified),'paid');
});
test('ordinary checkout, unknown identity, unpaid and verified states get no pending Finish',()=>{
 const c=setup();
 for(const p of [{payment_type:'deposit',session_id:'service'},{payment_type:'membership',session_id:'public-signup'}]){
  const state={children:[],append(x){this.children.push(x);}};c.syncRenewalFinish(p,'pending_verification',state);assert.equal(state.children.length,0);
 }
 for(const status of ['awaiting_payment','paid','expired','cancelled']){
  const state={children:[],append(x){this.children.push(x);}};c.syncRenewalFinish({payment_type:'membership',session_id:'liffrenew_standard_'+'a'.repeat(24)},status,state);assert.equal(state.children.length,0);
 }
});
test('checkout scripts parse; Renewal receipt is validated before setting pending state',()=>{
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())assert.doesNotThrow(()=>new Function(m[1]));
 assert.match(html,/if\(renewal&&!nextState\)throw new Error/);
 assert.ok(html.indexOf('if(renewal&&!nextState)')<html.indexOf('if(payment)payment.status=nextState'));
 assert.doesNotMatch(helpers,/fetch\(|localStorage|sessionStorage|\.closeWindow\(|\.submit\(/);
});
