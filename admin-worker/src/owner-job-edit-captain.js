import { at, revision, S, J, marker, name } from './owner-job-edit.js';
import { readModelSources } from './create-job-drive-discovery.js';

// A narrow amendment of an existing paid job, never a new booking or collection.
export const CAPTAIN = Object.freeze({session:'sess_mw4pp2cg_d5788ca38716eab1',
  model:'rec25Xt7QODd763vI', previousModel:'recNxQLPgFVmRsOcg', partner:'recjegeHuesDmm7QP',
  modelName:'EMs20 - Zero', customer:33000, partnerCost:23000, received:7500});
const P={session:'fld2wdhBvc8xrV6y5',ref:'fldOO6SY49iDw8VBZ',amount:'fldvCSwrUW8OMAooS',
  status:'fldEJ1hmm7KwWuI6q',intent:'fld04fr3bRJTohO6y',verified:'fldJ7a0Ube9F0bmRy'};
const stop=(message,status=409)=>{throw Object.assign(Error(message),{status});};
function scope(data){
  const f=data.session.fields;
  if(f[S.id]!==CAPTAIN.session||data.job.fields[J.id]!==CAPTAIN.session)stop('amendment_wrong_job');
  if(![CAPTAIN.previousModel,CAPTAIN.model].includes(f[S.model]?.[0])||
     ![CAPTAIN.previousModel,CAPTAIN.model].includes(data.job.fields[J.model]?.[0])||
     f[S.model]?.length!==1||data.job.fields[J.model]?.length!==1)stop('amendment_identity_changed');
  if(data.balance.verified_paid_thb!==CAPTAIN.received||data.balance.credit_applied_thb!==0||data.balance.overpaid_amount_thb!==0)stop('amendment_settlement_changed');
  if(/cancel|refund|void|closed|complet/i.test(name(f[S.status]))||
     (f[S.state]&&!['offered','confirmed','offer_declined','offer_expired'].includes(name(f[S.state]))))stop('job_already_started');
  if(Number(f[S.travel]||0)!==0||Number(f[S.modelTravel]||0)!==0||
     /\[MMD_MEMBERSHIP_ACTION_V1\]|\[MMD MEMBERSHIP|\[SIGIL Membership/i.test(f[S.note]||f[S.notes]||''))stop('pricing_review_required');
}
async function evidence(env,data){
  scope(data);
  try{
    const model=await at(env,'models',{id:CAPTAIN.model,fields:['fldShiT60bmCxFxRu','fldRcAE3bL8dKmURH']});
    if(model.id!==CAPTAIN.model||name(model.fields?.fldRcAE3bL8dKmURH).toLowerCase()!=='active')stop('model_unavailable');
    const sources=await readModelSources(env,CAPTAIN.model);
    if(sources.status!=='verified'||sources.items.length!==1||sources.items[0].partner_record_id!==CAPTAIN.partner)stop('amendment_relationship_unverified');
    const payments=await at(env,'payments',{complete:true,formula:`{${P.session}}="${CAPTAIN.session}"`,fields:Object.values(P)});
    const rows=payments.records;
    // Deliberately fail closed: an Airtable URL does not prove a signed link is revoked.
    if(data.session.fields[S.customerLink]||data.session.fields[S.modelLink])stop('amendment_existing_links_require_review');
    if(!Array.isArray(rows)||rows.length!==1)stop('amendment_payment_links_require_review');
    const f=rows[0].fields;
    if(!f[P.ref]||f[P.ref]!==data.session.fields[S.paymentRef]||f[P.amount]!==CAPTAIN.received||
       name(f[P.status]).toLowerCase()!=='paid'||name(f[P.intent]).toLowerCase()!=='confirmed'||
       name(f[P.verified]).toLowerCase()!=='verified')stop('amendment_payment_links_require_review');
    return {source_revision:sources.items[0].source_revision,model_revision:await revision(model),payments_revision:await revision(rows),payment_ref:f[P.ref]};
  }catch(e){if(e.status)throw e;stop('amendment_evidence_unavailable',503);}
}
export async function verifyCaptainEvidence(env,data,expected){
  const current=await evidence(env,data);
  if(await revision(current)!==await revision(expected))stop('amendment_evidence_changed');
}
export async function captainProposal(env,data){
  const proof=await evidence(env,data);
  return {amendment:'captain-zero',model_id:CAPTAIN.model,model_name:CAPTAIN.modelName,partner_name:'Kendo',
    customer_total:CAPTAIN.customer,partner_cost:CAPTAIN.partnerCost,received:CAPTAIN.received,remaining:25500,
    evidence_revision:await revision(proof),payment_intent_created:false,
    remark:'เปลี่ยนชื่อในงานเดิม Rossi → Zero; คงทะเบียนโมเดลเดิม ไม่สร้างลิงก์ชำระหรือเรียกมัดจำเพิ่ม ต้นทุนรวม Kendo รวมค่าตัวโมเดลและค่าดูแลแล้ว ไม่แยกส่วนแบ่งในการแก้งานนี้'};
}
export async function buildCaptainEdit(env,data,body,model,actor,now){
  if(actor.role!=='owner')stop('forbidden',403);
  const allowed=['amendment','session_id','model_id','revision','request_id','reason','evidence_revision'];
  if(Object.keys(body).some(k=>!allowed.includes(k))||body.model_id!==CAPTAIN.model||body.session_id!==CAPTAIN.session||
     !/^[-\w]{16,80}$/.test(body.request_id||'')||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>300)stop('invalid_edit',400);
  const proof=await evidence(env,data);
  if(await revision(proof)!==body.evidence_revision)stop('amendment_evidence_changed');
  const f=data.session.fields;
  // Existing Partner settlements cannot be replaced through this one-time amendment.
  if(f[S.partner]||f[S.locked]||marker(f[S.note]||f[S.notes],'SIGIL Partner Snapshot v1'))stop('partner_settlement_review_required');
  if(f[S.source]){let source;try{source=JSON.parse(f[S.source]);}catch{stop('pricing_review_required');}if(source.partner_record_id||source.source_kind==='partner')stop('partner_settlement_review_required');}
  const old=marker(f[S.note]||f[S.notes],'MMD SERVICE PRICING v1');
  if(old?.addons?.some(a=>Number(a.client_amount_thb)||Number(a.model_payout_thb)))stop('pricing_review_required');
  const amendment={request_id:body.request_id,at:now,by:actor.id,reason:body.reason.trim(),
    model_record_id:CAPTAIN.model,model_name:CAPTAIN.modelName,partner_record_id:CAPTAIN.partner,
    customer_total_thb:33000,partner_cost_thb:23000,received_unchanged_thb:7500,remaining_thb:25500,
    previous_job_name:data.job.fields[J.name],previous_session_name:f[S.name],previous_registry_name:model.fields.fldShiT60bmCxFxRu,
    model_payout_thb:null,settlement_mode:'bundled_partner_rate',automatic_collection:false};
  const sigil={...(marker(f[S.note]||f[S.notes],'SIGIL Pricing v1')||{}),full_price_thb:40000,discount_thb:7000,
    discount_kind:'special_price',discount_reason:body.reason.trim(),net_price_thb:33000,balance_thb:25500,
    deposit_received_thb:7500,deposit_basis_thb:40000};
  const note=source=>String(source||'').split('\n').filter(l=>!/^\s*\[(MMD SERVICE PRICING v1|MMD MODEL PAYOUT BREAKDOWN v1|SIGIL Pricing v1)\]/.test(l)).join('\n')+
    '\n[SIGIL Pricing v1] '+JSON.stringify(sigil)+'\n[MMD JOB EDIT v1] '+JSON.stringify(amendment);
  const source=JSON.stringify({source_kind:'partner',model_record_id:CAPTAIN.model,partner_record_id:CAPTAIN.partner,
    partner_cost_thb:23000,partner_rate_includes_model:true,source_revision:proof.source_revision,selected_at:now,settlement_mode:'bundled_partner_rate'});
  const sessionPatch={[S.model]:[CAPTAIN.model],[S.name]:CAPTAIN.modelName,[S.assigned]:CAPTAIN.modelName,
    [S.amount]:33000,[S.payout]:null,[S.due]:25500,[S.source]:source,[S.locked]:true,
    [S.note]:note(f[S.note]),[S.notes]:note(f[S.notes]),[S.ack]:null,[S.ackIp]:'',
    [S.customerAck]:null,[S.customerAckIp]:'',[S.reconfirmAck]:null,[S.ready]:false};
  if(f[S.state]){sessionPatch[S.state]='offered';sessionPatch[S.stateAt]=now;}
  if(f[S.reconfirm])sessionPatch[S.reconfirm]='pending';
  const jobPatch={[J.model]:[CAPTAIN.model],[J.name]:CAPTAIN.modelName,[J.amount]:33000,[J.note]:note(data.job.fields[J.note])};
  if([...Object.values(sessionPatch),...Object.values(jobPatch)].some(v=>typeof v==='string'&&v.length>7000))stop('audit_capacity_reached');
  return {sessionPatch,jobPatch,amount:33000,payout:null,paid:7500,remaining:25500,changedModel:true,captainEvidence:proof};
}
