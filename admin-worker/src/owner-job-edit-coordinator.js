import { applyAdminJobVoid } from './admin-job-void.js';
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
    try {
      const input = await request.json();
      if (new URL(request.url).pathname === '/void') {
        if (typeof input.body?.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.body.revision)) {
          return reply({ok:false,error:'invalid_revision'},400);
        }
        const hash = await revision({body: input.body, actor: input.actor});
        const done = await this.storage.get('void:done:' + hash);
        if (done) {
          const pending = await this.storage.get('void:pending');
          if (pending?.hash === hash) await this.storage.delete('void:pending');
          return reply({...done, idempotent: true});
        }
        if (await this.storage.get('pending')) return reply({ok:false,error:'edit_recovery_required'},409);
        if (!input.recover && !await this.storage.get('void:pending')) {
          const current = await loadJob(this.env, input.body.session_id);
          if (await revision(current) !== input.body.revision) {
            return reply({ok:false,error:'job_changed_reload'},409);
          }
        }
        return await applyAdminJobVoid(this.env, input, this.storage, hash);
      }
      if (await this.storage.get('void:pending')) return reply({ok:false,error:'void_outcome_unknown'},409);
      return await this.apply(input);
    }
    catch(e){return reply({ok:false,error:e.status?e.message:'edit_recovery_required'},e.status||503);}
    finally{this.busy=false;}
  }
  async apply({body,actor}){
    const bodyHash=await revision({body,actor});
    const complete=await this.storage.get('done:'+body.request_id);
    if(complete){if(complete.hash!==bodyHash)return reply({ok:false,error:'request_id_reused'},409);const pending=await this.storage.get('pending');if(pending?.hash===bodyHash)await this.storage.delete('pending');return reply({...complete.result,idempotent:true});}
    let journal=await this.storage.get('pending');
    if(journal&&(journal.hash!==bodyHash))return reply({ok:false,error:'edit_recovery_required',request_id:journal.body.request_id},409);
    let persisted = Boolean(journal);
    if(!journal){
      const data=await loadJob(this.env,body.session_id);
      if(await revision(data)!==body.revision)return reply({ok:false,error:'job_changed_reload'},409);
      const model=await at(this.env,'models',{id:body.model_id,fields:['fldShiT60bmCxFxRu','fld0maFkh4NHpsPxA','fldRcAE3bL8dKmURH']});
      const atTime=new Date().toISOString(),plan=buildEdit(data,body,model,actor,atTime);
      journal={hash:bodyHash,body,actor,at:atTime,data,plan};

    }
    const {data,plan}=journal;
    const persistBeforeWrite = async () => {
      if (persisted) return;
      await this.storage.put('pending', journal);
      persisted = true;
    };
    const unchangedSettlement=current=>data.balance&&current.balance&&['session_id','verified_paid_thb','verified_deposit_thb','paid_credit_thb','bonus_credit_thb','credit_applied_thb'].every(key=>current.balance[key]===data.balance[key]);
    // GETs and comparisons exclude fields owned by unrelated workflows. A stale
    // lifecycle/payment acknowledgement is still included in the session revision.
    let current=await loadJob(this.env,body.session_id);
    if(!unchangedSettlement(current))return reply({ok:false,error:'edit_settlement_changed_review_required'},409);
    const matches=(record,patch)=>Object.entries(patch).every(([k,v])=>JSON.stringify(record.fields[k]??(v===false?false:null))===JSON.stringify(v===''?null:v));
    const beforeJob=await revision(current.job)===await revision(data.job);
    const beforeSession=await revision(current.session)===await revision(data.session);
    const afterJob=matches(current.job,plan.jobPatch),afterSession=matches(current.session,plan.sessionPatch);
    if(!((beforeJob||afterJob)&&(beforeSession||afterSession)))return reply({ok:false,error:'edit_conflict_requires_review'},409);
    if(!afterJob){
      await persistBeforeWrite();
      await at(this.env,'jobs',{id:data.job.id,patch:plan.jobPatch});
    }
    current=await loadJob(this.env,body.session_id);
    if(!unchangedSettlement(current))return reply({ok:false,error:'edit_settlement_changed_review_required'},409);
    if(!matches(current.job,plan.jobPatch)||(!matches(current.session,plan.sessionPatch)&&await revision(current.session)!==await revision(data.session)))return reply({ok:false,error:'edit_conflict_requires_review'},409);
    if(!matches(current.session,plan.sessionPatch)){
      await persistBeforeWrite();
      await at(this.env,'sessions',{id:data.session.id,patch:plan.sessionPatch});
    }
    const final=await loadJob(this.env,body.session_id);
    if(!unchangedSettlement(final))return reply({ok:false,error:'edit_settlement_changed_review_required'},409);
    if(!matches(final.job,plan.jobPatch)||!matches(final.session,plan.sessionPatch))return reply({ok:false,error:'edit_recovery_required'},503);
    const result={ok:true,session_id:body.session_id,amount:plan.amount,payout:plan.payout,paid:plan.paid,remaining:plan.remaining,notification_sent:false,payment_verification_changed:false};
    const summary=d=>({model_id:d.session.fields[S.model]?.[0],model_name:d.session.fields[S.name],amount:d.session.fields[S.amount],payout:d.session.fields[S.payout]});
    await this.storage.put({['audit:'+journal.at+':'+body.request_id]:{...journal,before:summary(data),after:summary(final)},['done:'+body.request_id]:{hash:bodyHash,result}});
    await this.storage.delete('pending');
    return reply(result);
  }
}
