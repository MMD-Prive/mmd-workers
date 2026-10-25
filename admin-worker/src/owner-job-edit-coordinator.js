import { at, loadJob, revision, buildEdit, reply, S, J } from './owner-job-edit.js';

// A per-session durable journal serializes this editor's writes. Other lifecycle
// writers remain authoritative: re-read before both writes and stop on conflict.
export class JobEditJournal {
  constructor(storage,env){this.storage=storage;this.env=env;this.busy=false;}
  async fetch(request){
    if(new URL(request.url).pathname==='/history'){
      const rows=await this.storage.list({prefix:'audit:',reverse:true,limit:20});
      const pending=await this.storage.get('pending');
      return reply({ok:true,pending:pending?{request_id:pending.body.request_id,reason:pending.body.reason}:null,history:[...rows.values()].map(a=>({at:a.at,by:a.actor.id,reason:a.body.reason,before:a.before,after:a.after}))});
    }
    if(this.busy)return reply({ok:false,error:'edit_in_progress'},409);
    this.busy=true;
    try{return await this.apply(await request.json());}
    catch(e){return reply({ok:false,error:e.status?e.message:'edit_recovery_required'},e.status||503);}
    finally{this.busy=false;}
  }
  async apply({body,actor}){
    const bodyHash=await revision({body,actor});
    const complete=await this.storage.get('done:'+body.request_id);
    if(complete){if(complete.hash!==bodyHash)return reply({ok:false,error:'request_id_reused'},409);const pending=await this.storage.get('pending');if(pending?.hash===bodyHash)await this.storage.delete('pending');return reply({...complete.result,idempotent:true});}
    let journal=await this.storage.get('pending');
    if(journal&&(journal.hash!==bodyHash))return reply({ok:false,error:'edit_recovery_required',request_id:journal.body.request_id},409);
    if(!journal){
      const data=await loadJob(this.env,body.session_id);
      if(await revision(data)!==body.revision)return reply({ok:false,error:'job_changed_reload'},409);
      const model=await at(this.env,'models',{id:body.model_id,fields:['fldShiT60bmCxFxRu','fld0maFkh4NHpsPxA','fldRcAE3bL8dKmURH']});
      const atTime=new Date().toISOString(),plan=buildEdit(data,body,model,actor,atTime);
      journal={hash:bodyHash,body,actor,at:atTime,data,plan};
      // Persist recovery and full before-image before making any external write.
      await this.storage.put('pending',journal);
    }
    const {data,plan}=journal;
    // GETs and comparisons exclude fields owned by unrelated workflows. A stale
    // lifecycle/payment acknowledgement is still included in the session revision.
    let current=await loadJob(this.env,body.session_id);
    const matches=(record,patch)=>Object.entries(patch).every(([k,v])=>JSON.stringify(record.fields[k]??(v===false?false:null))===JSON.stringify(v===''?null:v));
    const beforeJob=await revision(current.job)===await revision(data.job);
    const beforeSession=await revision(current.session)===await revision(data.session);
    const afterJob=matches(current.job,plan.jobPatch),afterSession=matches(current.session,plan.sessionPatch);
    if(!((beforeJob||afterJob)&&(beforeSession||afterSession)))return reply({ok:false,error:'edit_conflict_requires_review'},409);
    if(!afterJob)await at(this.env,'jobs',{id:data.job.id,patch:plan.jobPatch});
    current=await loadJob(this.env,body.session_id);
    if(!matches(current.job,plan.jobPatch)||(!matches(current.session,plan.sessionPatch)&&await revision(current.session)!==await revision(data.session)))return reply({ok:false,error:'edit_conflict_requires_review'},409);
    if(!matches(current.session,plan.sessionPatch))await at(this.env,'sessions',{id:data.session.id,patch:plan.sessionPatch});
    const final=await loadJob(this.env,body.session_id);
    if(!matches(final.job,plan.jobPatch)||!matches(final.session,plan.sessionPatch))return reply({ok:false,error:'edit_recovery_required'},503);
    const result={ok:true,session_id:body.session_id,amount:plan.amount,payout:plan.payout,paid:plan.paid,remaining:plan.remaining,notification_sent:false,payment_verification_changed:false};
    const summary=d=>({model_id:d.session.fields[S.model]?.[0],model_name:d.session.fields[S.name],amount:d.session.fields[S.amount],payout:d.session.fields[S.payout]});
    await this.storage.put({['audit:'+journal.at+':'+body.request_id]:{...journal,before:summary(data),after:summary(final)},['done:'+body.request_id]:{hash:bodyHash,result}});
    await this.storage.delete('pending');
    return reply(result);
  }
}
