import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPartnerReplacementFlow} from './partner-replacement-flow.mjs';
import {createPartnerReplacementFixture} from './partner-replacement-flow.fixture.mjs';
import {assertEditable,S} from '../admin-worker/src/owner-job-edit.js';
const fixture = createPartnerReplacementFixture;
async function replace(f,model='model_DEMO_B') {
  f.approve(model);const input=f.input('replace',{next_model:model});
  const result=await f.instance()('owner',input);assert.equal(result.ok,true);return {input,result};
}
async function issue(f) {
  const result=await f.instance()('owner',f.input('issue_customer_link'));assert.equal(result.ok,true);return result.link_id;
}
async function ready(){const f=fixture();await replace(f);const link=await issue(f);return {f,link};}
test('default gate is closed before providers, identity or input are accessed',async()=>{
  let calls=0;const run=createPartnerReplacementFlow({createProviders:()=>{calls++;throw Error();}});
  assert.equal((await run('owner',{enabled:true})).code,'runtime_gate_closed');assert.equal(calls,0);
});
test('default review refuses Partner replacement, including client-supplied approval',async()=>{
  const f=fixture(),input=f.input('replace',{next_model:'model_DEMO_B'});
  assert.equal((await f.instance()('owner',input)).code,'partner_settlement_review_required');
  assert.equal((await f.instance()('owner',{...input,approved:true})).code,'invalid_request');assert.equal(f.writes(),0);
});
for(const actor of ['missing','otherOwner','partner','customer','modelA'])test(actor+' cannot replace or issue a customer link',async()=>{
  const f=fixture();f.approve('model_DEMO_B');
  for(const input of [f.input('replace',{next_model:'model_DEMO_B'}),f.input('issue_customer_link')])assert.equal((await f.instance()(actor,input)).ok,false);
  assert.equal(f.writes(),0);
});
test('review is snapshot-bound and cannot select another Partner model',async()=>{
  const f=fixture();f.approve('model_DEMO_B');f.external({revision:'new_revision'});
  assert.equal((await f.instance()('owner',f.input('replace',{next_model:'model_DEMO_B'}))).code,'replacement_review_stale');
  f.approve('model_OTHER');assert.equal((await f.instance()('owner',f.input('replace',{next_model:'model_OTHER'}))).code,'partner_settlement_review_required');assert.equal(f.writes(),0);
});
test('readback is required before customer-only issuance',async()=>{
  const f=fixture();assert.equal((await f.instance()('owner',f.input('issue_customer_link'))).code,'replacement_readback_required');assert.equal(f.links().length,1);
});
test('replacement preserves session and finance, resets acknowledgements, updates Partner snapshot',async()=>{
  const f=fixture(),before=f.snapshot();await replace(f);const after=f.snapshot();
  assert.equal(after.session_id,before.session_id);assert.equal(after.generation,2);assert.equal(after.state,'offered');
  assert.deepEqual(after.partner_snapshot,{partner:'partner_DEMO',model:'model_DEMO_B'});
  assert.deepEqual(after.financial,before.financial);assert.equal(after.model_credentials,before.model_credentials);
  for(const key of ['customer_ack','model_ack','reconfirm_ack','ready'])assert.equal(after[key],false);
  for(const actor of ['customer','modelB','partner']){const view=f.view(actor);assert.equal(view.session_id,before.session_id);assert.equal(view.job_update.state,'awaiting_customer');assert.deepEqual(view.allowed_actions,[]);assert.equal('financial' in view,false);}
  assert.equal(f.view('modelA').code,'ownership_required');assert.equal(f.view('otherCustomer').code,'ownership_required');
});
test('new customer link accepts only its generation; old link and old model remain blocked',async()=>{
  const {f,link}=await ready();assert.equal((await f.instance()('customer',f.input('acknowledge',{link_id:'link_DEMO_1'}))).code,'confirmation_link_superseded');
  const result=await f.instance()('customer',f.input('acknowledge',{link_id:link}));assert.equal(result.ok,true);assert.equal(result.notification_sent,false);
  assert.equal(f.view('modelB').job_update.state,'awaiting_model');assert.equal(f.snapshot().model_ack,false);assert.equal(f.snapshot().state,'offered');
});
test('A to B to A has distinct generations and never resurrects old links',async()=>{
  const f=fixture();await replace(f);const old=await issue(f);await replace(f,'model_DEMO_A');
  assert.equal(f.snapshot().generation,3);assert.equal((await f.instance()('customer',f.input('acknowledge',{link_id:old}))).code,'confirmation_link_superseded');
  assert.equal(f.view('modelB').ok,false);
});
for(const [label,patch,code] of [
  ['role',{role:'model'},'confirmation_link_invalid'],['customer',{customer:'other'},'confirmation_link_invalid'],
  ['session',{session_id:'other'},'confirmation_link_invalid'],['generation',{generation:999},'confirmation_link_superseded'],
  ['revision',{revision:'old'},'confirmation_link_superseded'],['expiry',{expires_at:0},'confirmation_link_expired'],
  ['missing expiry',{expires_at:undefined},'confirmation_link_expired'],
])test('link rejects wrong '+label,async()=>{const {f,link}=await ready();f.corruptLink(link,patch);assert.equal((await f.instance()('customer',f.input('acknowledge',{link_id:link}))).code,code);assert.equal(f.snapshot().customer_ack,false);});
test('foreign customer and model cannot use a valid customer link',async()=>{const {f,link}=await ready();for(const actor of ['otherCustomer','modelB','partner'])assert.equal((await f.instance()(actor,f.input('acknowledge',{link_id:link}))).code,'ownership_required');});
test('expired session cannot supply an actor; expired confirmation link is rejected',async()=>{const {f,link}=await ready();assert.equal((await f.instance()('missing',f.input('acknowledge',{link_id:link}))).code,'authentication_required');f.advance(3600001);assert.equal((await f.instance()('customer',f.input('acknowledge',{link_id:link}))).code,'confirmation_link_expired');});
for(const action of ['replace','issue_customer_link','acknowledge'])test(action+' deduplicates across handler instances and tabs',async()=>{
  const f=fixture();let extra={},actor='owner';
  if(action==='replace'){f.approve('model_DEMO_B');extra={next_model:'model_DEMO_B'};}else{await replace(f);if(action==='acknowledge'){extra={link_id:await issue(f)};actor='customer';}}
  const input=f.input(action,extra),before=f.writes();
  const results=await Promise.all([f.instance()(actor,input),f.instance()(actor,input)]);
  assert.ok(results.every(r=>r.ok));assert.equal(results.filter(r=>r.replay).length,1);assert.equal(f.writes()-before,1);
  assert.equal((await f.instance()(actor,input)).replay,true);assert.equal(f.writes()-before,1);
});
test('different operation IDs cannot write the same acknowledgement twice',async()=>{const {f,link}=await ready();const run=f.instance(),input=f.input('acknowledge',{link_id:link});await run('customer',input);const n=f.writes();assert.equal((await run('customer',{...input,operation_id:'another_op'})).replay,true);assert.equal(f.writes(),n);});
test('same operation changed payload conflicts; replay after later generation is stale',async()=>{
  const f=fixture(),first=await replace(f);assert.equal((await f.instance()('owner',{...first.input,next_model:'model_OTHER'})).code,'operation_conflict');
  await replace(f,'model_DEMO_A');assert.equal((await f.instance()('owner',first.input)).code,'offer_changed');
});
test('reissue invalidates older credential without touching model credential or generation',async()=>{
  const {f,link}=await ready(),before=f.snapshot(),newLink=await issue(f);
  assert.notEqual(link,newLink);assert.equal(f.snapshot().generation,before.generation);assert.equal(f.snapshot().model_credentials,before.model_credentials);
  assert.equal((await f.instance()('customer',f.input('acknowledge',{link_id:link}))).code,'confirmation_link_superseded');
});
for(const action of ['replace','issue_customer_link','acknowledge']){
  async function setup(){const f=fixture();let extra={},actor='owner';if(action==='replace'){f.approve('model_DEMO_B');extra={next_model:'model_DEMO_B'};}else{await replace(f);if(action==='acknowledge'){extra={link_id:await issue(f)};actor='customer';}}return {f,actor,input:f.input(action,extra)};}
  test(action+' pre-write failure releases only its own pending; safe retry works',async()=>{
    const {f,actor,input}=await setup(),before=f.writes();f.faults.beforeWrite=()=>{throw Error('no write');};
    assert.equal((await f.instance()(actor,input)).code,'prewrite_rejected');assert.equal(f.snapshot().pending,null);assert.equal(f.writes(),before);
    assert.equal((await f.instance()(actor,input)).ok,true);
  });
  test(action+' cannot erase another pending marker on pre-write failure',async()=>{
    const {f,actor,input}=await setup();f.faults.beforeWrite=()=>{f.external({pending:{key:'other_writer'}});throw Error('no write');};
    await f.instance()(actor,input);assert.equal(f.snapshot().pending.key,'other_writer');
  });
  test(action+' attempted-write unknown stays pending and blocks all retries',async()=>{
    const {f,actor,input}=await setup();f.faults.unknown=true;
    assert.equal((await f.instance()(actor,input)).code,'outcome_unknown');assert.ok(f.snapshot().pending);
    f.faults.unknown=false;const before=f.writes();assert.equal((await f.instance()(actor,input)).code,'pending_reconciliation');
    assert.equal((await f.instance()('owner',f.input('issue_customer_link'))).code,'pending_reconciliation');assert.equal(f.writes(),before);
  });
}
test('revision and finance are re-read at the write boundary',async()=>{
  for(const patch of [{revision:'changed_revision'},{financial:{amount:1}},{partner_snapshot:{model:'other'}}]){
    const f=fixture();f.approve('model_DEMO_B');f.faults.beforeWrite=()=>f.external(patch);
    assert.equal((await f.instance()('owner',f.input('replace',{next_model:'model_DEMO_B'}))).code,'offer_changed');assert.equal(f.writes(),0);assert.equal(f.snapshot().pending,null);
  }
});
test('bad readback and failed receipt preserve unknown pending',async()=>{
  for(const mode of ['readback','receipt']){const f=fixture();f.approve('model_DEMO_B');if(mode==='readback')f.faults.afterWrite=()=>f.external({partner_snapshot:{model:'old'}});else f.faults.receiptFailure=true;
    assert.equal((await f.instance()('owner',f.input('replace',{next_model:'model_DEMO_B'}))).code,'outcome_unknown');assert.ok(f.snapshot().pending);}
});
for(const state of ['en_route','started','completed','cancelled'])test('cannot replace a '+state+' job',async()=>{const f=fixture();f.external({state});f.approve('model_DEMO_B');assert.equal((await f.instance()('owner',f.input('replace',{next_model:'model_DEMO_B'}))).code,'job_already_started');assert.equal(f.writes(),0);});
test('actual owner writer still refuses Partner settlement edits',()=>{
  const data={balance:{schema:'verified_session_balance_v1',session_id:'sess_demo',total_amount_thb:10000,verified_paid_thb:3000,verified_deposit_thb:3000,paid_credit_thb:0,bonus_credit_thb:0,credit_applied_thb:0,remaining_amount_thb:7000,overpaid_amount_thb:0},session:{fields:{[S.id]:'sess_demo',[S.amount]:10000,[S.partner]:'partner_DEMO'}}};
  assert.throws(()=>assertEditable(data),/partner_settlement_review_required/);
});
test('actual pair/model reissue guard still requires Partner issuer and respects pause',async()=>{
  const source=await readFile(new URL('../payments-worker/confirmation-link-reissue.js',import.meta.url),'utf8');
  const guard=vm.runInNewContext(source.slice(source.indexOf('const AIRTABLE_API'),source.indexOf('async function airtable')).replaceAll('export const ','const ')+';partnerModelLinkReissueGuard',{Response});
  const session={fields:{fld0jkscGAtyX7i2J:'partner_DEMO',fldfqNBNKkmQdr6Fp:'{"system":"co_partner"}'}};
  assert.equal((await guard(session).json()).error,'partner_model_link_managed_by_issuer');
  const paused=guard(session,{PARTNER_MODEL_LINK_ISSUANCE_PAUSED:'true'});assert.equal(paused.status,503);assert.equal((await paused.json()).error,'model_link_issuance_paused');
});
test('a replaced pending marker stops execution before the write',async()=>{
  const f=fixture();f.approve('model_DEMO_B');f.faults.beforeWrite=()=>f.external({pending:{key:'other_writer'}});
  assert.equal((await f.instance()('owner',f.input('replace',{next_model:'model_DEMO_B'}))).code,'pending_reconciliation');
  assert.equal(f.snapshot().pending.key,'other_writer');assert.equal(f.writes(),0);
});
test('review is invalidated by financial or Partner snapshot change even at the same generation',async()=>{
  for(const patch of [{financial:{amount:10001}},{partner_snapshot:{model:'changed_model'}}]){
    const f=fixture();f.approve('model_DEMO_B');f.external(patch);
    assert.equal((await f.instance()('owner',f.input('replace',{next_model:'model_DEMO_B'}))).code,'replacement_review_stale');assert.equal(f.writes(),0);
  }
});

test('a link expiring during prepare is rejected before any acknowledgement write',async()=>{
  const {f,link}=await ready(),writes=f.writes();
  f.advance(3599999);
  f.faults.beforeWrite=()=>f.advance(2);
  const result=await f.instance()('customer',f.input('acknowledge',{link_id:link}));
  assert.equal(result.code,'confirmation_link_expired');
  assert.equal(f.writes(),writes);assert.equal(f.snapshot().customer_ack,false);
  assert.equal(f.snapshot().pending,null);
  assert.equal(f.view('customer').job_update.state,'awaiting_customer');
  // A known pre-write rejection must not prevent issuance of a fresh link.
  const freshLink=await issue(f);
  assert.equal((await f.instance()('customer',f.input('acknowledge',{link_id:freshLink}))).ok,true);
});
for(const [label,patch,code] of [
  ['exact expiry',{expires_at:Date.parse('2026-11-13T10:00:02Z')},'confirmation_link_expired'],
  ['missing expiry',{expires_at:undefined},'confirmation_link_expired'],
  ['wrong role',{role:'model'},'confirmation_link_invalid'],
  ['wrong customer',{customer:'customer_OTHER'},'confirmation_link_invalid'],
  ['wrong session',{session_id:'session_OTHER'},'confirmation_link_invalid'],
  ['new revision',{revision:'revision_CHANGED'},'confirmation_link_superseded'],
  ['new credential',{credential:999},'confirmation_link_superseded'],
])test('fresh link validation catches '+label+' changed during prepare',async()=>{
  const {f,link}=await ready(),writes=f.writes();
  f.faults.beforeWrite=()=>f.corruptLink(link,patch);
  assert.equal((await f.instance()('customer',f.input('acknowledge',{link_id:link}))).code,code);
  assert.equal(f.writes(),writes);assert.equal(f.snapshot().pending,null);
});
test('valid fresh link still writes once and replays the recorded outcome',async()=>{
  const {f,link}=await ready(),input=f.input('acknowledge',{link_id:link}),writes=f.writes();
  f.faults.beforeWrite=()=>f.advance(2000);
  const result=await f.instance()('customer',input);assert.equal(result.ok,true);
  assert.equal(result.session.customer_ack,true);assert.equal(f.view('customer').job_update.state,'awaiting_model');
  assert.equal((await f.instance()('customer',input)).replay,true);assert.equal(f.writes(),writes+1);
});

for(const [action,label,change] of [
  ['replace','missing edit marker',fields=>{delete fields.note;}],
  ['replace','malformed edit marker',fields=>{fields.note='[MMD JOB EDIT v1] invalid';}],
  ['replace','wrong display model',fields=>{fields.model_name='model_OTHER';}],
  ['replace','old edit event with the same model',fields=>{
    const event=JSON.parse(fields.note.split('] ')[1]);event.request_id='replacement_demo_old';
    event.at='2026-11-12T10:00:00Z';fields.note='[MMD JOB EDIT v1] '+JSON.stringify(event);
  }],
  ['acknowledge','missing acknowledgement timestamp',fields=>{delete fields.customer_ack_at;}],
  ['acknowledge','stale acknowledgement timestamp',fields=>{fields.customer_ack_at='2026-11-12T10:00:00Z';}],
  ['acknowledge','invalid acknowledgement timestamp',fields=>{fields.customer_ack_at='not-a-date';}],
  ['acknowledge','model acknowledgement without model authority',fields=>{fields.model_ack_at=fields.customer_ack_at;}],
  ['issue_customer_link','lost display evidence during issuance',fields=>{delete fields.note;}],
])test(action+' readback with '+label+' stays unknown and pending',async()=>{
  const f=fixture();let extra={next_model:'model_DEMO_B'},actor='owner';
  if(action==='replace')f.approve(extra.next_model);
  else {await replace(f);extra={};if(action==='acknowledge'){extra={link_id:await issue(f)};actor='customer';}}
  const input=f.input(action,extra),writes=f.writes();
  f.faults.afterWrite=()=>{const fields=f.snapshot().fields;change(fields);f.external({fields});};
  const result=await f.instance()(actor,input);
  assert.deepEqual(result,{ok:false,code:'outcome_unknown'});assert.ok(f.snapshot().pending);
  assert.equal(f.writes(),writes+1);
  assert.equal((await f.instance()(actor,input)).code,'pending_reconciliation');
  assert.equal((await f.instance()('owner',f.input('issue_customer_link'))).code,'pending_reconciliation');
  assert.equal(f.writes(),writes+1);
});
test('successful replacement, issuance and acknowledgement agree with all permitted read views',async()=>{
  const f=fixture();
  const replaced=await replace(f);assert.equal(replaced.result.session.customer_ack,false);
  const link=await issue(f);
  for(const actor of ['customer','modelB','partner'])assert.equal(f.view(actor).job_update.state,'awaiting_customer');
  const input=f.input('acknowledge',{link_id:link}),ack=await f.instance()('customer',input);
  assert.equal(ack.ok,true);assert.equal(ack.session.customer_ack,true);
  for(const actor of ['customer','modelB','partner']){
    const view=f.view(actor);assert.equal(view.job_update.state,'awaiting_model');
    assert.equal(view.session_id,ack.session.session_id);assert.equal(view.generation,ack.session.generation);
    assert.deepEqual(view.allowed_actions,[]);
  }
  assert.equal(f.snapshot().pending,null);assert.equal(f.view('modelA').ok,false);
});
