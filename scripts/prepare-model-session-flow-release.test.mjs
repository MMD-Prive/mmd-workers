import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingPlan,components} from './prepare-model-session-flow-release.mjs';
const events=components.find(c=>c.worker==='events-worker');
const base={worker:'events-worker',active_version:'synthetic-version',bindings:[{name:'EXISTING_SECRET',type:'secret_text'},{name:'TELEGRAM_ROUTER',type:'service'}],runtime:{compatibility_date:'2026-02-27'},crons:['*/15 * * * *']};
test('Payments uses only the merged canonical config',()=>{
  const c=components[0];assert.equal(c.config,'payments-worker/wrangler.merged.toml');assert.equal(c.main,'index.session-paid-projection-wrapper.js');
});
test('Events plan adds only the missing private completion bucket and preserves all bindings without values',()=>{
  const plan=bindingPlan(events,base);
  assert.deepEqual(plan.add,[{name:'SESSION_COMPLETION_STATE',type:'r2_bucket',bucket_name:'mmd-private-model-media'}]);
  assert.deepEqual(plan.inherit,[{name:'EXISTING_SECRET',type:'inherit'},{name:'TELEGRAM_ROUTER',type:'inherit'}]);
  assert.deepEqual(plan.remove,[]);assert.deepEqual(plan.rotate,[]);assert.equal(plan.upload_authorized,false);
  assert.deepEqual(plan.preserve_crons,base.crons);
});
test('existing correct completion binding is inherited, never duplicated',()=>{
  const plan=bindingPlan(events,{...base,bindings:[...base.bindings,{name:'SESSION_COMPLETION_STATE',type:'r2_bucket',bucket_name:'mmd-private-model-media'}]});
  assert.equal(plan.add.length,0);assert.equal(plan.inherit.length,3);
});
test('wrong bucket, duplicate bindings or wrong baseline fail closed',()=>{
  assert.throws(()=>bindingPlan(events,{...base,bindings:[{name:'SESSION_COMPLETION_STATE',type:'r2_bucket',bucket_name:'public'}]}),/conflict/);
  assert.throws(()=>bindingPlan(events,{...base,bindings:[base.bindings[0],base.bindings[0]]}),/Duplicate/);
  assert.throws(()=>bindingPlan(events,{...base,worker:'admin-worker'}),/baseline/);
});
