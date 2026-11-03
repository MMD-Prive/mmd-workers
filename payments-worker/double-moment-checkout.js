import {doubleMomentAdapters as db} from './double-moment-purchase-v1.js';
import {formulaValue} from './lib/payment-primitives.js';
import {canonicalJobEvidence,canonicalJob} from './double-moment-canonical-source.js';
import {readCreditSession,sessionCreditIdentity,creditError} from './double-moment-balance.js';
import {readVerifiedSessionBalance} from './verified-session-balance.js';
import {ensureFinalPaymentIntentUnlocked} from './final-payment-flow.js';
import {stablePaymentRef} from './unified-payment-proof.js';
const fail=(m,status=409)=>{throw creditError(m,status);};
const campaign='promo_double_moment_sep2026';
const parse=x=>{try{return JSON.parse(x||'{}');}catch{fail('credit_claim_unconfirmed',503);}};
async function records(env,key,formula){
 const url=new URL('https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+db.table(env,key));
 url.searchParams.set('filterByFormula',formula);url.searchParams.set('pageSize','100');
 const rows=[],seen=new Set();
 for(let i=0;i<10;i++){
  const d=await db.airtableFetch(env,url,{method:'GET'});if(!Array.isArray(d.records))fail('credit_ledger_unavailable',503);rows.push(...d.records);
  if(!d.offset)return rows;if(typeof d.offset!=='string'||seen.has(d.offset))fail('credit_ledger_unavailable',503);seen.add(d.offset);url.searchParams.set('offset',d.offset);
 }
 fail('credit_ledger_incomplete',503);
}
export class DoubleMomentCheckout {
 constructor(actor){this.actor=actor;this.env=actor.env;this.storage=actor.storage;}
 async claim(id,client){
  const rows=await records(this.env,'claims',`{claim_id}='${formulaValue(id)}'`);
  if(rows.length!==1)fail('credit_claim_unconfirmed',503);
  const c=rows[0].fields||{},meta=parse(c.payload_json);
  if(c.claim_id!==id||c.matched_client_id!==client||c.campaign_id!==campaign)fail('credit_owner_mismatch',403);
  if(meta.policy?.policy_version==='v3'){
   const activation=await this.storage.get('activation:'+id),extension=await this.storage.get('extension:'+id);
   if(!activation?.complete||activation.issued_at!==meta.issued_at||activation.expires_at!==meta.expires_at||extension&&!extension.complete)fail('credit_activation_unconfirmed',503);
   const payments=await records(this.env,'payments',`OR({payment_ref}='${formulaValue(c.payment_reference)}',{Payment Reference}='${formulaValue(c.payment_reference)}')`);
   const p=payments[0]?.fields||{};
   if(payments.length!==1||!db.verifiedDoubleMomentPayment(payments[0])||JSON.stringify(p.Client)!==JSON.stringify([client])||p.campaign_claim_id!==id||p.campaign_code!==campaign)fail('credit_purchase_unconfirmed');
  }
  return {c,meta};
 }
 async rows(id,client,version){
  const wanted=['paid','bonus'].flatMap(kind=>[1,2].map(sequence=>id+':'+kind+':'+sequence));
  const found=await records(this.env,'credits',`OR(${wanted.map(key=>`{credit_id}='${formulaValue(key)}'`).join(',')})`);
  if(found.length!==wanted.length||new Set(found.map(r=>r.fields?.credit_id)).size!==wanted.length||new Set(found.map(r=>r.id)).size!==wanted.length||found.some(r=>!r.id||!wanted.includes(r.fields?.credit_id)))fail('credit_ledger_unavailable',503);
  const result=[];
  for(const kind of ['paid','bonus'])for(const sequence of [1,2]){
   const rows=found.filter(r=>r.fields?.credit_id===id+':'+kind+':'+sequence);
   if(rows.length!==1)fail('credit_ledger_unavailable',503);
   const f=rows[0].fields||{},amount=kind==='paid'?10000:3500;
   if(f.credit_id!==id+':'+kind+':'+sequence||JSON.stringify(f.Client)!==JSON.stringify([client])||f['Campaign Claim ID']!==id||f['Policy Version']!==version||f['Credit Authority']!=='double_moment_coordinator'||f['Verification Status']!=='verified'||f['Original Amount THB']!==amount||f['Reserved Amount THB']!==0||!['available','used'].includes(f.Status)||f['Available Amount THB']!==(f.Status==='used'?0:amount)||f['Applied Amount THB']!==(f.Status==='used'?amount:0))fail('credit_on_hold_or_changed');
   result.push(f);
  }
  if(new Set(result.map(f=>f['Expires At'])).size!==1||new Set(result.map(f=>f['Issued At'])).size!==1)fail('credit_expiry_unconfirmed');
  return result;
 }
 async creditBalance(session){
  const identity=sessionCreditIdentity(session),claimId=await this.storage.get('job:'+identity.job_id);
  if(!claimId){
   for(const allocations of (await this.storage.list({prefix:'redemption:'})).values())if(!Array.isArray(allocations)||allocations.some(a=>a.job_id===identity.job_id))fail('credit_job_journal_unconfirmed',503);
   return {ok:true,...identity,claim_id:null,paid_credit_thb:0,bonus_credit_thb:0};
  }
  const {c,meta}=await this.claim(claimId,identity.client_record_id);
  if(c.claim_status!=='applied'||!['v2','v3'].includes(meta.policy?.policy_version))fail('credit_claim_unconfirmed');
  const allocations=await this.storage.get('redemption:'+claimId);
  if(!Array.isArray(allocations))fail('credit_allocation_unconfirmed',503);
  const matches=allocations.filter(a=>a.job_id===identity.job_id);
  if(matches.length!==1||!matches[0].complete||![1,2].includes(matches[0].sequence)||matches[0].paid_credit_thb!==10000||matches[0].bonus_credit_thb!==3500)fail('credit_allocation_pending',503);
  const rows=await this.rows(claimId,identity.client_record_id,meta.policy.policy_version);
  if(rows.some(f=>f['Expires At']!==meta.expires_at)||rows.filter(f=>f.credit_id.endsWith(':'+matches[0].sequence)).some(f=>f.Status!=='used'))fail('credit_allocation_unconfirmed',503);
  return {ok:true,...identity,claim_id:claimId,paid_credit_thb:10000,bonus_credit_thb:3500};
 }
 async session(body,customer=false){
  const session=await readCreditSession(this.env,body.session_id),identity=sessionCreditIdentity(session);
  if(identity.client_record_id!==body.client_record_id)fail('credit_owner_mismatch',403);
  if(customer){
   const client=await db.clientForLine(this.env,body.line_user_id);
   if(client!==identity.client_record_id)fail('credit_owner_mismatch',403);
  }
  const evidence=await canonicalJobEvidence(this.env,identity);
  if(evidence.session_id!==identity.session_id)fail('credit_session_mismatch',403);
  return {session,identity};
 }
 async context(body){
  const {session,identity}=await this.session(body,true);
  const approved=await canonicalJob(this.env,identity);
  const credit=await this.creditBalance(session),summary=await readVerifiedSessionBalance(this.env,session);
  const claims=await records(this.env,'claims',`AND({campaign_id}='${campaign}',{matched_client_id}='${formulaValue(identity.client_record_id)}')`);
  const ids=new Set(),items=[];
  for(const row of claims){
   const c=row.fields||{},m=parse(c.payload_json),version=m.policy?.policy_version||'v1';
   if(!/^dm(?:2)?_[a-f0-9]{24}$/.test(c.claim_id||'')||c.matched_client_id!==identity.client_record_id||ids.has(c.claim_id))fail('credit_claim_unconfirmed',503);ids.add(c.claim_id);
   let remaining=null,eligible=false,blocked='legacy_terms_preserved';
   if(['v2','v3'].includes(version)&&c.claim_status==='applied'){
    const rows=await this.rows(c.claim_id,identity.client_record_id,version);remaining=rows.filter(f=>f.credit_id.includes(':paid:')&&f.Status==='available').length;
    const extension=await this.storage.get('extension:'+c.claim_id);
    eligible=remaining>0&&Date.parse(m.expires_at)>Date.now()&&(!extension||extension.complete)&&(!credit.claim_id||credit.claim_id===c.claim_id)&&approved.credit_redemption_authorized===true;
    blocked=eligible?null:'credit_not_available_for_job';
   }
   items.push({claim_id:c.claim_id,round_id:m.round_id||null,policy_version:version,expires_at:m.expires_at||null,remaining_moments:remaining,eligible,blocked_reason:blocked,selected:credit.claim_id===c.claim_id});
  }
  const lane=String(session.fields?.fldzYGziqLqTQaoaK??session.fields?.model_work_lane??'').toLowerCase();
  return {ok:true,session_id:identity.session_id,brand_audience:['private','vip','svip','private_model'].includes(lane)?'sigil':['public','pn','public_model'].includes(lane)?'public':null,items,selected_claim_id:credit.claim_id,balance:this.balance(summary)};
 }
 balance(s){return {total_amount_thb:s.total_amount_thb,verified_paid_thb:s.verified_paid_thb,paid_credit_thb:s.paid_credit_thb??0,bonus_credit_thb:s.bonus_credit_thb??0,remaining_amount_thb:s.remaining_amount_thb};}
 async finalIntent(body){
  const {identity}=await this.session(body),key='final-intent:'+identity.session_id;
  const result=await ensureFinalPaymentIntentUnlocked(this.env,identity.session_id,async()=>{
   if(await this.storage.get(key))fail('final_intent_write_unknown_review_required',503);
   await this.storage.put(key,{status:'pending',session_id:identity.session_id});
  });
  await this.storage.put(key,{status:'complete',session_id:identity.session_id,payment_ref:result.payment_ref});return {ok:true,...result};
 }
 async checkout(body){
  const {session,identity}=await this.session(body,true);
  const prior=await this.storage.get('job:'+identity.job_id);
  if(prior&&prior!==body.claim_id)fail('job_already_used_for_another_claim');
  // A partially committed debit is resumed by the existing allocation journal.
  // Before its first write, compare the predicted due with every existing final.
  if(!prior){
   const {meta}=await this.claim(body.claim_id,identity.client_record_id);
   if(!['v2','v3'].includes(meta.policy?.policy_version))fail('legacy_terms_preserved');
   await this.rows(body.claim_id,identity.client_record_id,meta.policy.policy_version);
   const summary=await readVerifiedSessionBalance(this.env,session);
   const due=(Math.round(summary.total_amount_thb*100)-Math.round(summary.verified_paid_thb*100)-1350000)/100;
   if(summary.verified_deposit_thb<=0||due<=0)fail('credit_checkout_amount_requires_review');
   const ref=await stablePaymentRef(identity.session_id,'final'),existing=summary.records.filter(p=>p.stage==='final'||p.ref===ref);
   if(existing.length>1||existing.some(p=>p.ref!==ref||p.verified||Number(p.amount)!==due))fail('final_payment_amount_mismatch');
   if(await this.storage.get('final-intent:'+identity.session_id)&&!existing.length)fail('final_intent_write_unknown_review_required',503);
  }
  const debit=await this.actor.redeem({claim_id:body.claim_id,job_id:identity.job_id});
  if(!debit.ok){const d=await debit.json();fail(d.error,debit.status);}
  return this.finalIntent(identity);
 }
}
