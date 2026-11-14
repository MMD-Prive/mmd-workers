import assert from 'node:assert/strict';
import { S,J,revision,loadJob } from './src/owner-job-edit.js';
import { CAPTAIN, captainProposal } from './src/owner-job-edit-captain.js';
import { JobEditJournal } from './src/owner-job-edit-coordinator.js';
export const actor={id:'fixture-owner',role:'owner'};
export const payment={id:'recPaymentFixture',fields:{fld2wdhBvc8xrV6y5:CAPTAIN.session,fldOO6SY49iDw8VBZ:'fixture-paid-ref',fldvCSwrUW8OMAooS:7500,fldEJ1hmm7KwWuI6q:'Paid',fld04fr3bRJTohO6y:'Confirmed',fldJ7a0Ube9F0bmRy:'verified'}};
export function setup({ installGlobalFetch = true } = {}){
  const state={cash:7500,relations:true,sourceUnavailable:false,failSession:false,writes:[],payCalls:[],payments:[structuredClone(payment)],
    model:{id:CAPTAIN.model,fields:{fldShiT60bmCxFxRu:'EMs20 - Rossi',fldRcAE3bL8dKmURH:'Active'}},
    session:{id:'recSessionFixture',fields:{[S.id]:CAPTAIN.session,[S.model]:[CAPTAIN.model],[S.name]:'EMs20 - Rossi',
      [S.amount]:25000,[S.payout]:15000,[S.deposit]:7500,[S.paymentRef]:'fixture-paid-ref',[S.status]:'Pending',[S.state]:'confirmed',
      [S.note]:'Historical quote kept',[S.ack]:'old',[S.customerAck]:'old',[S.ready]:true}},
    job:{id:'recJobFixture000',fields:{[J.id]:CAPTAIN.session,[J.model]:[CAPTAIN.previousModel],[J.name]:'Captain S',[J.amount]:25000}},memory:new Map()};
  const http=async req=>{
    const u=new URL(typeof req==='string'||req instanceof URL?req:req.url),method=req.method||'GET';
    if(u.pathname.includes('tblrmSsCZxJSCQR9n')){
      if(state.sourceUnavailable)throw Error('fixture failure');
      return Response.json({records:state.relations?[{id:'recRelationFixture',fields:{Model:[CAPTAIN.model],Partner:[CAPTAIN.partner],'Ownership Status':'verified'}}]:[]});
    }
    if(u.pathname.includes('tbl1ksDlsTiiGEHWe'))return Response.json({id:CAPTAIN.partner,fields:{fldXb55aiAjNPOUWc:'fixture-kendo',fldpJWfASq7PfkMgC:'Kendo',fldajmg66pf2ifGPu:'Active',fldwRzdtIoPbHKr7n:'recognized'}});
    if(u.pathname.includes('tblI4B0bI446vp9GX')){assert.equal(method,'GET');return Response.json(state.model);}
    if(u.pathname.includes('tblWGGJJOx5eBvBZJ')){assert.equal(method,'GET');return Response.json({records:state.payments});}
    const field=u.pathname.includes('tblC98mKWbzmPuNzX')?'session':u.pathname.includes('tbl0jxIjN8QYwGABX')?'job':null;
    assert.ok(field,'unexpected endpoint');
    if(method==='PATCH'){
      if(field==='session'&&state.failSession){state.failSession=false;throw Error('fixture failure');}
      state.writes.push(field);Object.assign(state[field].fields,(await req.json()).fields);
      for(const [k,v]of Object.entries(state[field].fields))if(v===null||v===''||v===false)delete state[field].fields[k];
      state.afterWrite?.(field);
      return Response.json(state[field]);
    }
    assert.equal(method,'GET');return Response.json({records:[state[field]]});
  };
  if(installGlobalFetch)globalThis.fetch=http;
  state.http=http;
  const env={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',AIRTABLE_HTTP:{fetch:http},AUTH_SERVICE_ADMIN_TO_PAYMENTS:'fixture',
    ADMIN_LOGIN_CREDENTIAL:'fixture',ADMIN_SESSION_SECRET:'fixture',PAYMENTS_WORKER:{fetch:async req=>{
      const path=new URL(req.url).pathname;state.payCalls.push(path);
      assert.equal(path,'/v1/internal/payments/balance');
      const total=state.session.fields[S.amount];return Response.json({ok:true,authority:'payments-worker',balance:{schema:'verified_session_balance_v1',session_id:CAPTAIN.session,
        total_amount_thb:total,verified_paid_thb:state.cash,verified_deposit_thb:state.cash,paid_credit_thb:0,bonus_credit_thb:0,credit_applied_thb:0,remaining_amount_thb:total-state.cash,overpaid_amount_thb:0}});
    }}};
  const storage={get:async k=>structuredClone(state.memory.get(k)),put:async(k,v)=>{if(typeof k==='object'){for(const [a,b]of Object.entries(k))state.memory.set(a,structuredClone(b));}else state.memory.set(k,structuredClone(v));},delete:async k=>state.memory.delete(k),list:async({prefix}={})=>new Map([...state.memory].filter(([key])=>!prefix||key.startsWith(prefix)))};
  state.env=env;state.storage=storage;state.journal=new JobEditJournal(storage,env);
  return state;
}
export async function body(h){const data=await loadJob(h.env,CAPTAIN.session);const p=await captainProposal(h.env,data);return {
  amendment:'captain-zero',session_id:CAPTAIN.session,model_id:CAPTAIN.model,revision:await revision(data),
  evidence_revision:p.evidence_revision,request_id:'captain-fixture-request',reason:'Owner agrees price and model replacement'};}
export const post=(b,who=actor)=>new Request('https://job-edit.internal/edit',{method:'POST',body:JSON.stringify({body:b,actor:who})});
