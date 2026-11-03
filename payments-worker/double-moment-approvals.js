// Dedicated Double Moment storage. Only an authenticated admin service may write.
const required=(value,pattern=/^[A-Za-z0-9_:-]{1,120}$/)=>{if(typeof value!=='string'||!pattern.test(value))throw Error('invalid_approval_reference');return value;};
export class DoubleMomentApprovals {
 constructor(storage){this.storage=storage;}
 async approve(input,actor){
  required(actor);required(input.client_record_id,/^rec[A-Za-z0-9]{14}$/);required(input.approval_id);required(input.evidence_ref);
  if(!['invitation','job'].includes(input.kind))throw Error('invalid_approval_kind');
  if(!Number.isFinite(Date.parse(input.expires_at))||Date.parse(input.expires_at)<=Date.now())throw Error('invalid_approval_expiry');
  const key='approval:'+input.kind+':'+required(input.kind==='invitation'?input.round_id:input.job_id);
  const priorAudit=await this.storage.get('approval-audit:'+input.approval_id);if(priorAudit&&priorAudit.key!==key)throw Error('approval_id_already_used');
  const old=await this.storage.get(key);
  if(old?.status==='revoked'&&old.approval_id===input.approval_id)throw Error('new_approval_id_required');
  if(old&&old.status!=='revoked'){if(old.approval_id===input.approval_id&&JSON.stringify(old.input)===JSON.stringify(input))return old;throw Error('approval_exists_revoke_before_replace');}
  if(input.kind==='invitation'){
   required(input.member_id);required(input.round_id);
   if(!Number.isFinite(Date.parse(input.starts_at))||Date.parse(input.starts_at)>=Date.parse(input.expires_at))throw Error('invalid_invitation_window');
  }else{
   required(input.job_id);required(input.session_id);required(input.snapshot_hash,/^[a-f0-9]{64}$/);
   if(!Number.isInteger(input.service_amount_thb)||input.service_amount_thb<20000||!Array.isArray(input.promotion_ids)||!Array.isArray(input.coupon_ids)||input.promotion_ids.length||input.coupon_ids.length)throw Error('job_stacking_or_amount_not_allowed');
   if(input.service_amount_excludes_tips_and_membership!==true)throw Error('service_amount_scope_unproven');
  }
  const row={...input,input:structuredClone(input),status:'approved',approved_by:actor,approved_at:new Date().toISOString()};
  await this.storage.put({[key]:row,['approval-audit:'+input.approval_id]:{event:'approved',actor,at:row.approved_at,key}});return row;
 }
 async revoke(kind,id,actor,reason){if(!['invitation','job'].includes(kind))throw Error('invalid_approval_kind');required(actor);required(reason);const key='approval:'+kind+':'+required(id);const row=await this.storage.get(key);if(!row)throw Error('approval_missing');if(row.status==='revoked')return row;const next={...row,status:'revoked',revoked_by:actor,revoked_at:new Date().toISOString(),revoke_reason:reason};await this.storage.put({[key]:next,['approval-audit:revoked:'+row.approval_id]:{event:'revoked',actor,at:next.revoked_at,key}});return next;}
 async invitation(client,member){const rows=await this.storage.list({prefix:'approval:invitation:'});const active=[...rows.values()].filter(x=>x.status==='approved'&&x.client_record_id===client&&x.member_id===member&&Date.parse(x.starts_at)<=Date.now()&&Date.parse(x.expires_at)>Date.now());if(active.length>1)throw Error('ambiguous_active_invitation');return active[0]||null;}
 async job(client,id,hash){const x=await this.storage.get('approval:job:'+required(id));if(!x||x.status!=='approved'||x.client_record_id!==client||x.snapshot_hash!==hash||Date.parse(x.expires_at)<=Date.now())throw Error('job_approval_missing_stale_or_revoked');return {job_id:id,client_record_id:client,service_amount_thb:x.service_amount_thb,credit_redemption_authorized:true,other_promotion_applied:x.promotion_ids.length>0,coupon_applied:x.coupon_ids.length>0};}
}
