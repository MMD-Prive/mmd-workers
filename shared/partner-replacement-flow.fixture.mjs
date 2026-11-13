// LOCAL MOCK ONLY. Memory survives new handler instances, not a process restart.
// No network, signing key, binding, real notification or production writer.
import {createPartnerReplacementFlow} from './partner-replacement-flow.mjs';
import {projectJobUpdate} from './job-update-view.mjs';
const copy = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function createPartnerReplacementFixture() {
  let clock = Date.parse('2026-11-13T10:00:00Z'), tail = Promise.resolve(), writes = 0, serial = 1;
  const row = {session_id:'session_DEMO_B', generation:1, revision:'revision_DEMO_1',
    model:'model_DEMO_A', partner:'partner_DEMO', customer:'customer_DEMO',
    partner_snapshot:{partner:'partner_DEMO',model:'model_DEMO_A'}, state:'confirmed',
    credential:1, model_credentials:1, model_ack:true, customer_ack:true, ready:true,
    reconfirm_ack:true, replacement_verified:false, pending:null, fields:{},
    financial:{amount:10000, payout:6000, paid:3000, due:7000}};
  const actors = {
    owner:{id:'owner_DEMO',role:'owner',partner:'partner_DEMO'},
    otherOwner:{id:'owner_OTHER',role:'owner',partner:'partner_OTHER'},
    partner:{id:'partner_DEMO',role:'partner',partner:'partner_DEMO'},
    customer:{id:'customer_DEMO',role:'customer'}, otherCustomer:{id:'customer_OTHER',role:'customer'},
    modelA:{id:'model_DEMO_A',role:'model'}, modelB:{id:'model_DEMO_B',role:'model'},
  };
  const links = new Map([['link_DEMO_1',{session_id:row.session_id,generation:1,revision:row.revision,
    credential:1,role:'customer',customer:row.customer,expires_at:clock+3600000}]]);
  const receipts = new Map();
  let approval = null;
  const faults = {beforeWrite:null,afterWrite:null,unknown:false,receiptFailure:false};
  const lock = async fn => {const previous=tail;let release;tail=new Promise(r=>{release=r;});await previous;try{return await fn();}finally{release();}};
  const providers = {
    now:()=>clock,
    resolveActor:async context=>copy(actors[context] || null),
    readCustomerLink:async id=>copy(links.get(id)),
    reviewReplacement:async(_row,input)=>['model_DEMO_A','model_DEMO_B'].includes(input.next_model)?copy(approval):null,
    withSessionFence:async(sid, fn)=>lock(()=>fn({
      read:async()=>sid===row.session_id?copy(row):null,
      receipt:async key=>copy(receipts.get(key)),
      claim:async pending=>{if(row.pending)throw Error('pending');row.pending=pending;},
      owns:async pending=>row.pending===pending,
      releaseOwn:async pending=>{if(row.pending===pending)row.pending=null;},
      complete:async(pending,key,value)=>{if(faults.receiptFailure)throw Error('receipt unavailable');
        if(row.pending!==pending)throw Error('pending replaced');receipts.set(key,copy(value));row.pending=null;},
    })),
    prepare:async({row:before,input})=>{
      if(faults.beforeWrite){const hook=faults.beforeWrite;faults.beforeWrite=null;await hook();}
      return async()=>{
        const at=new Date(clock+1000).toISOString();
        // Keep the intended display evidence separate from the readback so a
        // partial write cannot validate itself by returning its own fields.
        const expectedFields=input.action==='replace'
          ? {model_name:input.next_model,note:'[MMD JOB EDIT v1] '+JSON.stringify({
            request_id:'replacement_demo_'+(before.generation+1),at,model_name:input.next_model})}
          : input.action==='acknowledge' ? {...copy(before.fields),customer_ack_at:at} : copy(before.fields);
        writes++;clock+=1000;
        const result={expected_fields:copy(expectedFields)};
        if(input.action==='replace') {
          row.generation++; row.revision='revision_DEMO_'+row.generation;
          row.model=input.next_model;row.partner_snapshot={partner:row.partner,model:row.model};
          row.state='offered';row.model_ack=false;row.customer_ack=false;row.reconfirm_ack=false;row.ready=false;
          row.replacement_verified=true;
          row.fields=copy(expectedFields);
        } else if(input.action==='issue_customer_link') {
          row.credential++;const link_id='link_DEMO_'+(++serial);
          links.set(link_id,{session_id:row.session_id,generation:row.generation,revision:row.revision,
            credential:row.credential,role:'customer',customer:row.customer,expires_at:clock+3600000});result.link_id=link_id;
        } else {row.customer_ack=true;row.fields=copy(expectedFields);}
        if(faults.afterWrite){const hook=faults.afterWrite;faults.afterWrite=null;await hook();}
        if(faults.unknown)throw Error('response lost');
        return result;
      };
    },
    verifyReadback:({before,after,input,written})=>{
      if(!written?.expected_fields || !same(after.fields,written.expected_fields))return false;
      // Use the same projector consumed by the app read views. Matching flags
      // alone is insufficient when the edit/ack evidence is absent or stale.
      const display=projectJobUpdate({fields:after.fields});
      const expectedState=!after.customer_ack?'awaiting_customer':!after.model_ack?'awaiting_model':'acknowledged';
      if(!display || display.state!==expectedState)return false;
      if(after.session_id!==before.session_id || after.partner!==before.partner || after.customer!==before.customer ||
        after.model_credentials!==before.model_credentials || !same(after.financial,before.financial))return false;
      if(input.action==='replace') return after.generation===before.generation+1 && after.revision!==before.revision &&
        after.model===input.next_model && same(after.partner_snapshot,{partner:before.partner,model:input.next_model}) &&
        after.state==='offered' && after.credential===before.credential && !after.model_ack && !after.customer_ack && !after.reconfirm_ack && !after.ready;
      if(after.generation!==before.generation || after.revision!==before.revision || after.model!==before.model ||
        !same(after.partner_snapshot,before.partner_snapshot) || after.state!==before.state || after.model_ack!==before.model_ack ||
        after.ready!==before.ready || after.reconfirm_ack!==before.reconfirm_ack)return false;
      if(input.action==='acknowledge')return after.customer_ack && after.credential===before.credential;
      const link=links.get(written?.link_id);
      return after.customer_ack===before.customer_ack && after.credential===before.credential+1 && link?.credential===after.credential && link.role==='customer' &&
        link.session_id===after.session_id && link.generation===after.generation && link.revision===after.revision && link.customer===after.customer;
    },
  };
  return {
    instance:()=>createPartnerReplacementFlow({enabled:true,createProviders:()=>providers}),
    // This is a mock review of an exact snapshot, NOT real Partner settlement approval.
    approve:next_model=>{approval={ok:true,before:copy({...row,pending:null}),next_model,partner:row.partner};},
    input:(action,extra={})=>({action,session_id:row.session_id,generation:row.generation,
      revision:row.revision,operation_id:'operation_DEMO_'+action+'_'+row.generation+'_'+row.credential,...extra}),
    snapshot:()=>copy(row),writes:()=>writes,links:()=>copy([...links.entries()]),faults,
    advance:ms=>{clock+=ms;},external:patch=>Object.assign(row,copy(patch)),
    corruptLink:(id,patch)=>links.set(id,{...links.get(id),...patch}),
    // Read-only views enforce role scope and never synthesize action authority.
    view:actorName=>{const actor=actors[actorName];
      if(!actor || actor.role==='customer'&&actor.id!==row.customer || actor.role==='model'&&actor.id!==row.model ||
        ['owner','partner'].includes(actor.role)&&actor.partner!==row.partner)return {ok:false,code:'ownership_required'};
      return {ok:true,session_id:row.session_id,generation:row.generation,revision:row.revision,
        model_name:row.model,state:row.state,allowed_actions:[],job_update:projectJobUpdate({fields:row.fields})};},
  };
}
