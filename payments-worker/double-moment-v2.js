import {readInvitationPage,validateInvitationRead} from './double-moment-invitation-reader.js';
import {doubleMomentTestAccess} from './double-moment-test-access.js';
import {statusFor} from './double-moment-status.js';
import {handleConfirmApplyPromo} from './confirmation-promo.js';
import {handleCanonicalConfirmLink} from './canonical-confirm-link.js';
import {DoubleMomentApprovals} from './double-moment-approvals.js';
import {canonicalEligibility,canonicalJobEvidence} from './double-moment-canonical-source.js';
import {createCanonicalDoubleMomentAuthority} from './double-moment-canonical-source.js';
import {doubleMomentAdapters as db} from './double-moment-purchase-v1.js';
import {formulaValue} from './lib/payment-primitives.js';
import {handleUnifiedPaymentIntent,mintCustomerToken} from './unified-payment-proof.js';
import phase1Worker from './index.phase1.js';
import {DOUBLE_MOMENT_POLICY,recordedPolicy,addPolicyMonths} from './double-moment-policy.js';
import {readDoubleMomentOwnerClaims} from './double-moment-owner-list.js';
import {DoubleMomentCheckout} from './double-moment-checkout.js';
import {readCreditSession,sessionCreditIdentity} from './double-moment-balance.js';
import {refreshFinalPaymentBalanceCache} from './final-payment-flow.js';
export {DOUBLE_MOMENT_POLICY} from './double-moment-policy.js';
const CAMPAIGN='promo_double_moment_sep2026';
const ROOT='/v1/confirm/double-moment/';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store, private','x-mmd-payment-authority':'payments-worker'}});
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{status});};
const validClient=value=>/^rec[A-Za-z0-9]{14}$/.test(value||'');
const parse=value=>{try{return JSON.parse(value||'{}')}catch{return {}}};
async function unique(env,key,formula){
 const url=new URL('https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+db.table(env,key));url.searchParams.set('maxRecords','2');url.searchParams.set('filterByFormula',formula);
 const result=await db.airtableFetch(env,url,{method:'GET'});
 if(!Array.isArray(result.records)||result.offset||result.records.length>1)fail('ambiguous_'+key);
 return result.records[0]||null;
}
const claimById=(env,id)=>unique(env,'claims',`{claim_id}='${formulaValue(id)}'`);
const creditById=(env,id)=>unique(env,'credits',`{credit_id}='${formulaValue(id)}'`);
const paymentByRef=(env,id)=>unique(env,'payments',`OR({payment_ref}='${formulaValue(id)}',{Payment Reference}='${formulaValue(id)}')`);
async function authority(env,path,body){
 if(!env.AUTH_SERVICE_MEMBER_TO_PAYMENTS)fail('eligibility_authority_unavailable',503);
 const source=env.DOUBLE_MOMENT_ELIGIBILITY_RESOLVER||createCanonicalDoubleMomentAuthority(env);
 const response=await source.fetch(new Request('https://double-moment-authority.internal/'+path,{method:'POST',headers:{'content-type':'application/json','x-internal-token':env.AUTH_SERVICE_MEMBER_TO_PAYMENTS},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)}));
 const payload=await response.json();if(!response.ok||payload?.ok!==true||payload.authority!=='double_moment_canonical_v2')fail('canonical_eligibility_unavailable',503);return payload.data;
}
async function eligibility(env,body){
 if(!/^U[0-9a-f]{32}$/i.test(body.line_user_id||'')||!body.member_id)fail('canonical_member_required',422);
 doubleMomentTestAccess(env,body);
 const client=await db.clientForLine(env,body.line_user_id);if(!client)fail('canonical_client_required',422);
 const data=await authority(env,'eligibility',{line_user_id:body.line_user_id,member_id:body.member_id,client_record_id:client,campaign_id:CAMPAIGN});
 const now=Date.now();
 if(!data||data.client_record_id!==client||data.member_id!==body.member_id||data.line_user_id!==body.line_user_id||data.campaign_id!==CAMPAIGN||data.membership_status!=='active'||!(Date.parse(data.membership_expires_at)>now)||data.invitation_status!=='approved'||!data.invitation_id||!/^[-a-zA-Z0-9_]{1,80}$/.test(data.round_id||'')||!(Date.parse(data.invitation_starts_at)<=now&&Date.parse(data.invitation_expires_at)>now)||data.purchase_allowed!==true)fail('campaign_not_eligible',403);
 doubleMomentTestAccess(env,body,data);
 return {...data,claim_id:'dm2_'+(await db.sha256(CAMPAIGN+':'+client+':'+data.round_id)).slice(0,24)};
}
function assertOwner(payment,claim){
 const p=payment?.fields||{},c=claim?.fields||{};
 if(!db.verifiedDoubleMomentPayment(payment))fail('payment_not_verified');
 if(!validClient(c.matched_client_id)||!Array.isArray(p.Client)||p.Client.length!==1||p.Client[0]!==c.matched_client_id||p.campaign_claim_id!==c.claim_id||p.campaign_code!==CAMPAIGN||p.package_code&&p.package_code!==DOUBLE_MOMENT_POLICY.package_code||p['Package Code']&&p['Package Code']!==DOUBLE_MOMENT_POLICY.package_code||c.campaign_id!==CAMPAIGN)fail('payment_claim_owner_mismatch');
 if(c.payment_reference!==p.payment_ref&&c.payment_reference!==p['Payment Reference'])fail('payment_claim_reference_mismatch');
 const member=p.member_id;if(member&&member!==c.matched_member_id)fail('payment_claim_member_mismatch');
}
function assertRecordedPolicies(meta,payment){
 const saved=parse(payment?.fields?.promo_payload_json);
 if(recordedPolicy(meta)!==recordedPolicy(saved)||saved.round_id!==meta.round_id||saved.invitation_id!==meta.invitation_id)fail('purchase_policy_conflict');
}
function namespace(env,client){if(!validClient(client))fail('invalid_client_reference',422);if(!env.DOUBLE_MOMENT_COORDINATOR?.get)fail('coordinator_unavailable',503);return env.DOUBLE_MOMENT_COORDINATOR.get(env.DOUBLE_MOMENT_COORDINATOR.idFromName(client));}
async function dispatch(env,client,body){
 const token=env.AUTH_SERVICE_MEMBER_TO_PAYMENTS;if(!token)fail('service_auth_unavailable',503);
 return namespace(env,client).fetch(new Request('https://double-moment-coordinator.internal/run',{method:'POST',headers:{'content-type':'application/json','x-internal-token':token},body:JSON.stringify(body)}));
}
export function isDoubleMomentRequest(path,method){const p=path.replace(/\/+$/,'');return p===ROOT+'health'&&method==='GET'||[ROOT+'customer-context',ROOT+'customer-checkout',ROOT+'invitation-history',ROOT+'offer',ROOT+'start',ROOT+'redeem',ROOT+'extend',ROOT+'owner-claims',ROOT+'extension-context',ROOT+'approval-context',ROOT+'approve-invitation',ROOT+'approve-job',ROOT+'revoke-approval',ROOT+'resolve-discount'].includes(p)&&method==='POST';}
export async function handleDoubleMomentRequest(request,env){
 try{
 const path=new URL(request.url).pathname.replace(/\/+$/,'');if(!isDoubleMomentRequest(path,request.method))return json({ok:false,error:'route_not_found'},404);
 if(path===ROOT+'health')return json({ok:true,...DOUBLE_MOMENT_POLICY,purchase_enabled:env.DOUBLE_MOMENT_PURCHASE_ENABLED==='true',eligibility_authority_configured:!!env.DOUBLE_MOMENT_ELIGIBILITY_RESOLVER||!!(env.AIRTABLE_BASE_ID&&(env.AIRTABLE_API_KEY||env.AIRTABLE_TOKEN)),job_policy_authority_configured:!!env.DOUBLE_MOMENT_JOB_POLICY_RESOLVER||!!env.DOUBLE_MOMENT_COORDINATOR,coordinator_configured:!!env.DOUBLE_MOMENT_COORDINATOR});
 if(!db.trustedCaller(request,env))return json({ok:false,error:'service_auth_required'},401);
 const body=await request.json();
 if([ROOT+'customer-context',ROOT+'customer-checkout'].includes(path)){
  const checkout=path.endsWith('/customer-checkout');
  if(!env.AUTH_SERVICE_MEMBER_TO_PAYMENTS||request.headers.get('x-internal-token')!==env.AUTH_SERVICE_MEMBER_TO_PAYMENTS)return json({ok:false,error:'member_service_required'},403);
  const keys=checkout?['line_user_id','session_id','claim_id']:['line_user_id','session_id'];
  if(!body||Object.keys(body).some(k=>!keys.includes(k))||!/^U[0-9a-f]{32}$/i.test(body.line_user_id||'')||checkout&&!/^dm2_[a-f0-9]{24}$/.test(body.claim_id||''))fail('invalid_customer_credit_request',400);
  const client=await db.clientForLine(env,body.line_user_id),session=await readCreditSession(env,body.session_id),identity=sessionCreditIdentity(session);
  if(client!==identity.client_record_id)fail('credit_owner_mismatch',403);
  const result=await dispatch(env,client,{...body,...identity,action:checkout?'customer-checkout':'customer-context'});
  if(!checkout||!result.ok)return result;
  const data=await result.json(),summary=await refreshFinalPaymentBalanceCache(env,identity.session_id);
  if(summary.remaining_amount_thb!==data.amount_due_thb)fail('final_payment_amount_mismatch');
  const token=await mintCustomerToken(env,{session_id:identity.session_id,payment_ref:data.payment_ref,payment_type:'final'});
  return json({...data,balance:{total_amount_thb:summary.total_amount_thb,verified_paid_thb:summary.verified_paid_thb,paid_credit_thb:summary.paid_credit_thb,bonus_credit_thb:summary.bonus_credit_thb,remaining_amount_thb:summary.remaining_amount_thb},customer_payment_url:'https://mmdbkk.com/pay/checkout?t='+encodeURIComponent(token)});
 }
 if([ROOT+'extend',ROOT+'owner-claims',ROOT+'extension-context'].includes(path)){
  const admin=env.AUTH_SERVICE_ADMIN_TO_PAYMENTS;
  if(!admin||request.headers.get('x-internal-token')!==admin)return json({ok:false,error:'admin_service_required'},403);
  if(path===ROOT+'owner-claims')return json(await readDoubleMomentOwnerClaims(env,body));
  return await namespace(env,body.client_record_id).fetch(new Request('https://double-moment-coordinator.internal/'+path.slice(ROOT.length),{method:'POST',headers:{'content-type':'application/json','x-internal-token':admin},body:JSON.stringify(body)}));
 }
 if(path===ROOT+'invitation-history'){
  const admin=env.AUTH_SERVICE_ADMIN_TO_PAYMENTS;
  if(!admin||request.headers.get('x-internal-token')!==admin)return json({ok:false,error:'admin_service_required'},403);
  validateInvitationRead(body);
  if(Boolean(body.object_id)===Boolean(body.client_record_id))fail('one_read_target_required',422);
  if(body.object_id&&!/^[a-f0-9]{64}$/.test(body.object_id))fail('invalid_read_object',422);
  const ns=env.DOUBLE_MOMENT_COORDINATOR;if(!ns)fail('coordinator_unavailable',503);
  const stub=body.object_id?ns.get(ns.idFromString(body.object_id)):namespace(env,body.client_record_id);
  return await stub.fetch(new Request('https://double-moment-coordinator.internal/run',{method:'POST',headers:{'content-type':'application/json','x-internal-token':admin},body:JSON.stringify({...body,action:'invitation-history'})}));
 }
 if(['approval-context','approve-invitation','approve-job','revoke-approval','resolve-discount'].some(name=>path===ROOT+name)){
  const admin=env.AUTH_SERVICE_ADMIN_TO_PAYMENTS;if(!admin||request.headers.get('x-internal-token')!==admin)return json({ok:false,error:'admin_service_required'},403);
  return await namespace(env,body.client_record_id).fetch(new Request('https://double-moment-coordinator.internal/run',{method:'POST',headers:{'content-type':'application/json','x-internal-token':admin},body:JSON.stringify({...body,action:path.slice(ROOT.length)})}));
 }
 if(path===ROOT+'redeem'){
  const claim=await claimById(env,body.claim_id);if(!claim)fail('claim_not_found');
  return await dispatch(env,claim.fields.matched_client_id,{action:'redeem',claim_id:body.claim_id,job_id:body.job_id});
 }
 if(env.DOUBLE_MOMENT_PURCHASE_ENABLED!=='true')return json({ok:false,error:'PROMOTION_PURCHASE_DISABLED'},404);
 const data=await eligibility(env,body);return await dispatch(env,data.client_record_id,{action:path.endsWith('/offer')?'offer':'start',identity:body,expected_claim:data.claim_id});
 }catch(error){return json({ok:false,error:error.message},statusFor(error));}
}
export async function reconcileDoubleMomentReviewedProof(request,response,env){
 if(!response?.ok)return response;
 const receipt=await response.clone().json().catch(()=>null);if(!receipt?.ok)return response;
 const body=await request.clone().json().catch(()=>({}));const ref=body.payment_ref||body.transaction_ref||receipt.payment_ref;if(!ref)return response;
 try{
 const payment=await paymentByRef(env,ref);const p=payment?.fields||{};
 if(p.campaign_code!==CAMPAIGN&&p.package_code!==DOUBLE_MOMENT_POLICY.package_code&&p['Package Code']!==DOUBLE_MOMENT_POLICY.package_code)return response;
 const claim=await claimById(env,p.campaign_claim_id);if(!claim)fail('claim_not_found');assertOwner(payment,claim);
 const result=await dispatch(env,claim.fields.matched_client_id,{action:'activate',payment_ref:ref,claim_id:claim.fields.claim_id});
 const data=await result.json();if(!result.ok)return json(data,result.status);
 return json({...receipt,double_moment:data.double_moment});
 }catch(error){return json({ok:false,error:error.message},statusFor(error));}
}
// One persistent actor per canonical Client serializes all rounds, activation and redemption.
// A per-instance queue serializes async work; durable journals guard restarts and uncertain writes.
export class DoubleMomentCoordinator {
 constructor(ctx,env){this.ctx=ctx;this.storage=ctx.storage;this.approvals=new DoubleMomentApprovals(ctx.storage);this.env={...env,DOUBLE_MOMENT_APPROVAL_STORE:this.approvals};this.checkout=new DoubleMomentCheckout(this);this.env.DOUBLE_MOMENT_CREDIT_READER=session=>this.checkout.creditBalance(session);this.tail=Promise.resolve();this.downstream=request=>handleUnifiedPaymentIntent(request,env,next=>phase1Worker.fetch(next,env,ctx));}
 async fetch(request){
  if(!db.trustedCaller(request,this.env))return json({ok:false,error:'service_auth_required'},401);
  if(['/extend','/extension-context'].includes(new URL(request.url).pathname))return this.runExtension(request);
  const checkoutBody=await request.clone().json().catch(()=>null);
  if(['customer-context','customer-checkout','credit-balance','final-intent'].includes(checkoutBody?.action))return this.runCheckout(checkoutBody,request);
  const result=this.tail.then(async()=>{try{const body=await request.json();if(body.action==='invitation-history'){if(!this.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS||request.headers.get('x-internal-token')!==this.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS)return json({ok:false,error:'admin_service_required'},403);return json(await readInvitationPage(this.storage,body));}if(['execute-coupon','execute-manual'].includes(body.action))return await this.executeMutation(body);if(['discount-begin','discount-complete'].includes(body.action))return await this.discount(body);if(body.action==='approval-read'){const data=body.kind==='invitation'?await this.approvals.invitation(body.client_record_id,body.member_id):await this.approvals.job(body.client_record_id,body.job_id,body.snapshot_hash);return json({ok:true,data});}if(['approval-context','approve-invitation','approve-job','revoke-approval','resolve-discount'].includes(body.action))return await this.approve(body,request);if(body.action==='activate')return await this.activate(body);if(body.action==='redeem')return await this.redeem(body);if(!['offer','start'].includes(body.action))fail('invalid_action',400);return await this.purchase(body);}catch(error){return json({ok:false,error:error.message},statusFor(error));}});
  this.tail=result.catch(()=>{});return result;
 }
 async runCheckout(body,request){
  const result=this.tail.then(async()=>{try{
   if(body.action==='final-intent'&&(!this.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS||request.headers.get('x-internal-token')!==this.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS))return json({ok:false,error:'admin_service_required'},403);
   if(body.action==='credit-balance'){const s=await readCreditSession(this.env,body.session_id);if(sessionCreditIdentity(s).client_record_id!==body.client_record_id)fail('credit_owner_mismatch',403);return json(await this.checkout.creditBalance(s));}
   return json(await this.checkout[body.action==='customer-context'?'context':body.action==='customer-checkout'?'checkout':'finalIntent'](body));
  }catch(e){return json({ok:false,error:e.message},statusFor(e));}});this.tail=result.catch(()=>{});return result;
 }
 async runExtension(request){
  const result=this.tail.then(async()=>{try{return new URL(request.url).pathname==='/extension-context'?await this.extensionContext(await request.json(),request):await this.extend(await request.json(),request);}catch(error){return json({ok:false,error:error.message},statusFor(error));}});
  this.tail=result.catch(()=>{});return result;
 }
 async executeMutation(body){
  const evidence=await canonicalJobEvidence(this.env,body,true);
  if(evidence.session_id!==body.session_id)fail('discount_session_mismatch');
  if(await this.storage.get('job:'+body.job_id))fail('double_moment_already_reserved_or_used');
  if(body.action==='execute-manual'){
   const approval=await this.storage.get('approval:job:'+body.job_id);
   if(approval?.status==='approved')await this.approvals.revoke('job',body.job_id,'payments-worker','financial_context_changed');
  }
  if(body.action==='execute-manual'){const parsed=JSON.parse(body.request.body);const input=parsed.operational_status==='pending_client_link'?parsed.held_job:parsed;if(input?.session_id!==body.session_id)fail('discount_execution_owner_mismatch');}
  const scoped={...this.env,DOUBLE_MOMENT_EXPECTED_DISCOUNT_OWNER:{client:body.client_record_id,job:body.job_id,session:body.session_id},DOUBLE_MOMENT_DISCOUNT_EXECUTOR:input=>this.discount(input)};
  const request=new Request(body.request.url,{method:body.request.method,headers:body.request.headers,body:body.request.body});
  return body.action==='execute-coupon'?handleConfirmApplyPromo(request,scoped):handleCanonicalConfirmLink(request,scoped);
 }
 async discount(body){
  const evidence=await canonicalJobEvidence(this.env,body,true);
  if(evidence.session_id!==body.session_id)fail('discount_session_mismatch');
  const key='discount:'+body.job_id, prior=await this.storage.get(key);
  if(await this.storage.get('job:'+body.job_id))fail('double_moment_already_reserved_or_used');
  if(!/^[a-f0-9]{64}$/.test(body.operation_id||''))fail('invalid_discount_operation');
  if(prior&&prior.status!=='cancelled'&&prior.operation_id!==body.operation_id)fail('discount_operation_already_exists');
  if(body.action==='discount-complete'){
   if(!prior||prior.status==='cancelled'||prior.lease_id!==body.lease_id)fail('discount_operation_missing_or_stale');
   await this.storage.put(key,{...prior,status:'applied'});return json({ok:true});
  }
  const approval=await this.storage.get('approval:job:'+body.job_id);
  const active=prior&&prior.status!=='cancelled'?prior:{operation_id:body.operation_id,status:'pending',snapshot_hash:evidence.snapshot_hash,lease_id:crypto.randomUUID(),generation:(prior?.generation||0)+1};
  const writes={[key]:active};
  if(approval?.status==='approved'){
   const at=new Date().toISOString();writes['approval:job:'+body.job_id]={...approval,status:'revoked',revoked_by:'payments-worker',revoked_at:at,revoke_reason:'financial_context_changed'};
   writes['approval-audit:discount:'+body.operation_id+':'+approval.approval_id]={event:'revoked_before_discount',at,approval_id:approval.approval_id};
  }
  await this.storage.put(writes);return json({ok:true,lease_id:active.lease_id});
 }
 async approve(body,request){
  const admin=this.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS;
  if(!admin||request.headers.get('x-internal-token')!==admin)return json({ok:false,error:'admin_service_required'},403);
  if(body.action==='approval-context')return json({ok:true,...await canonicalJobEvidence(this.env,body,true),discount:await this.storage.get('discount:'+body.job_id)||null});
  if(body.action==='resolve-discount'){
   const key='discount:'+body.job_id, row=await this.storage.get(key);
   const evidence=await canonicalJobEvidence(this.env,body,true);
   if(!row||row.operation_id!==body.operation_id||!body.evidence_ref||!body.actor_id||!['applied','cancelled'].includes(body.resolution))fail('invalid_discount_resolution');
   if(body.resolution==='cancelled'&&(evidence.snapshot_hash!==row.snapshot_hash||body.coupon_reservation_released!==true))fail('discount_cancellation_unproven');
   const at=new Date().toISOString();await this.storage.put({[key]:{...row,status:body.resolution,resolved_by:body.actor_id,evidence_ref:body.evidence_ref},['approval-audit:discount-resolution:'+row.lease_id]:{event:body.resolution,actor:body.actor_id,evidence_ref:body.evidence_ref,at}});return json({ok:true});
  }
  if(body.action==='revoke-approval')return json({ok:true,data:await this.approvals.revoke(body.kind,body.reference_id,body.actor_id,body.reason)});
  const input={...body};delete input.action;delete input.actor_id;
  if(body.action==='approve-invitation'){
   input.kind='invitation';const member=await canonicalEligibility(this.env,body);
   if(member.membership_status!=='active'||!(Date.parse(member.membership_expires_at)>Date.now()))fail('canonical_active_member_required',403);
  }else{
   input.kind='job';if((await this.storage.get('discount:'+body.job_id))?.status&& (await this.storage.get('discount:'+body.job_id)).status!=='cancelled')fail('job_has_discount_or_pending_mutation');const evidence=await canonicalJobEvidence(this.env,body);
   if(evidence.snapshot_hash!==body.snapshot_hash||evidence.session_id!==body.session_id)fail('job_snapshot_changed');
  }
  return json({ok:true,data:await this.approvals.approve(input,body.actor_id)});
 }
 async purchase(body){
  if(this.env.DOUBLE_MOMENT_PURCHASE_ENABLED!=='true')return json({ok:false,error:'PROMOTION_PURCHASE_DISABLED'},404);
  const data=await eligibility(this.env,body.identity);if(data.claim_id!==body.expected_claim)fail('eligibility_changed');
  const key='purchase:'+data.claim_id;let journal=await this.storage.get(key);
  const existing=await claimById(this.env,data.claim_id);
  if(existing?.fields?.claim_status==='applied')return json({ok:true,status:'already_activated',payment_available:false,entitlement_granted:false});
  const testAccess=doubleMomentTestAccess(this.env,body.identity,data);
  if(testAccess){
   // Permanent per-Client slot: changing test_id/round cannot reset the cap.
   const slotKey='controlled-test-purchase:v1',slot=await this.storage.get(slotKey);
   if(slot&&(slot.claim_id!==data.claim_id||slot.member_id!==data.member_id||slot.invitation_id!==data.invitation_id))fail('TEST_PURCHASE_LIMIT_REACHED',409);
   if(!slot&&body.action!=='offer')await this.storage.put(slotKey,{claim_id:data.claim_id,member_id:data.member_id,invitation_id:data.invitation_id,test_id:testAccess.test_id,amount_thb:20000,reserved_at:new Date().toISOString(),ends_at:testAccess.ends_at});
  }
  const saved=existing?parse(existing.fields.payload_json):null;
  const policy=existing?recordedPolicy(saved):DOUBLE_MOMENT_POLICY;
  if(existing&&(existing.fields.matched_client_id!==data.client_record_id||existing.fields.matched_member_id!==data.member_id||saved.round_id!==data.round_id||saved.invitation_id!==data.invitation_id))fail('existing_claim_conflict');
  if(body.action==='offer')return json({ok:true,...policy,status:'ready',payment_available:true});
  if(journal?.result){
   const refreshed=await this.checkoutReply(journal.result);await this.storage.put(key,{...journal,result:refreshed});return json(refreshed);
  }
  let claim=existing;
  const metadata=saved||{policy:{...policy},client_record_id:data.client_record_id,member_id:data.member_id,round_id:data.round_id,invitation_id:data.invitation_id};
  if(!claim){
   if(journal?.claim_attempted)fail('claim_write_uncertain_requires_review',503);
   journal={...journal,claim_attempted:true};await this.storage.put(key,journal);
   claim=await db.createRecord(this.env,db.table(this.env,'claims'),{claim_id:data.claim_id,campaign_id:CAMPAIGN,matched_client_id:data.client_record_id,matched_member_id:data.member_id,payment_required:true,payment_status:'pending',claim_status:'pending_payment',payload_json:JSON.stringify(metadata),created_at:new Date().toISOString()});
   if(!claim?.id)fail('claim_not_persisted',503);
  }
  let result=journal?.intent_result;
  if(!result){
   if(journal?.intent_attempted)fail('payment_intent_uncertain_requires_review',503);
   doubleMomentTestAccess(this.env,body.identity,data);
   journal={...journal,intent_attempted:true};await this.storage.put(key,journal);
   const response=await this.downstream(new Request('https://payments.internal/v1/pay/verify',{method:'POST',headers:{'x-internal-token':this.env.AUTH_SERVICE_MEMBER_TO_PAYMENTS,'content-type':'application/json'},body:JSON.stringify({session_id:'dm_'+data.claim_id,payment_stage:'full',amount:20000,package_code:DOUBLE_MOMENT_POLICY.package_code,notes:'MMD DOUBLE MOMENT · '+data.claim_id})}));
   result=await response.json();if(!response.ok||!result.ok||!result.payment_ref)fail('payment_intent_not_persisted',503);
   journal.intent_result=result;await this.storage.put(key,journal);
  }
  if(result.session_id!=='dm_'+data.claim_id||result.unified_payment_flow!=='v1')fail('payment_intent_identity_mismatch');
  const payment=await paymentByRef(this.env,result.payment_ref);
  const pf=payment?.fields||{};
  const amount=Number(pf.amount_thb??pf.Amount??pf['Amount (THB no decimals)']);
  const owner=pf.Client;
  if(!payment?.id||amount!==20000||pf.session_id!=='dm_'+data.claim_id||(pf.package_code||pf['Package Code'])!==DOUBLE_MOMENT_POLICY.package_code||owner&&(!Array.isArray(owner)||owner.length!==1||owner[0]!==data.client_record_id))fail('payment_intent_owner_mismatch');
  // The actor binds only its own deterministic, still-pending intent to the resolved owner.
  if(!owner&&(!['pending','unpaid'].includes(String(pf['Payment Status']||pf.payment_status).toLowerCase())||!['pending','unverified'].includes(String(pf['Verification Status']||pf.verification_status).toLowerCase())))fail('unowned_verified_intent_requires_review');
  await db.patchRecord(this.env,db.table(this.env,'payments'),payment.id,{Client:[data.client_record_id],member_id:data.member_id,campaign_code:CAMPAIGN,campaign_claim_id:data.claim_id,'Campaign Claim':[claim.id],promo_status:'pending_payment',promo_payload_json:JSON.stringify(metadata)});
  await db.patchRecord(this.env,db.table(this.env,'claims'),claim.id,{payment_reference:result.payment_ref,payload_json:JSON.stringify(metadata)});
  const reply=await this.checkoutReply({...result,...policy,claim_id:data.claim_id,campaign_id:CAMPAIGN,purchase_amount_thb:20000,activation_state:'awaiting_official_payment_verification',entitlement_granted:false});
  await this.storage.put(key,{...journal,result:reply});return json(reply);
 }
 async checkoutReply(result){
  // The shared intent flow selects a SIGIL surface for this package. Keep the
  // same official token and verification authority, but use the member checkout.
  const token=await mintCustomerToken(this.env,{session_id:result.session_id,payment_ref:result.payment_ref,payment_type:'full'});
  const {customer_t:omit,...safe}=result;
  return {...safe,customer_payment_url:'https://mmdbkk.com/pay/checkout?t='+encodeURIComponent(token),payment_surface:'public'};
 }
 async activate(body){
  const claim=await claimById(this.env,body.claim_id),payment=await paymentByRef(this.env,body.payment_ref);assertOwner(payment,claim);
  const c=claim.fields,meta=parse(c.payload_json),paymentMeta=parse(payment.fields.promo_payload_json);
  if(meta.policy?.policy_version!==paymentMeta.policy?.policy_version&&[meta.policy?.policy_version,paymentMeta.policy?.policy_version].some(v=>['v2','v3'].includes(v)))fail('purchase_policy_conflict');
  if(meta.policy?.policy_version&&!['v1','v2','v3'].includes(meta.policy.policy_version))fail('unknown_policy_version');
  const v3=meta.policy?.policy_version==='v3',v2=['v2','v3'].includes(meta.policy?.policy_version);
  // A historical purchase keeps its recorded terms; missing historical policy defaults to v1/180.
  const recorded=meta.policy||paymentMeta.policy||{...paymentMeta,...meta};
  if(v2&&(recordedPolicy(meta)!==recordedPolicy(paymentMeta)||paymentMeta.round_id!==meta.round_id||paymentMeta.invitation_id!==meta.invitation_id))fail('purchase_policy_conflict');
  const extension=await this.storage.get('extension:'+c.claim_id);
  if(extension&&!extension.complete)fail('extension_pending_requires_retry',503);
  const days=v2?120:Number(recorded.validity_days||180);if(![120,180].includes(days))fail('historical_policy_requires_review');
  const key='activation:'+c.claim_id;let journal=await this.storage.get(key);
  if(journal?.policy_version&&journal.policy_version!==(meta.policy?.policy_version||'v1'))fail('purchase_policy_conflict');
  const ids=v2?[c.claim_id+':paid:1',c.claim_id+':paid:2',c.claim_id+':bonus:1',c.claim_id+':bonus:2']:[c.claim_id+':paid',c.claim_id+':bonus:1',c.claim_id+':bonus:2'];
  const previous=await Promise.all(ids.map(id=>creditById(this.env,id)));
  const dates=[...new Set(previous.filter(Boolean).map(row=>row.fields['Issued At']))];if(dates.length>1||dates.some(date=>!Number.isFinite(Date.parse(date))))fail('existing_credit_dates_conflict');
  const issuedAt=journal?.issued_at||dates[0]||c.applied_at||new Date().toISOString();
  const recordedExpiry=previous.find(Boolean)?.fields['Expires At'];
  const expiresAt=journal?.expires_at||recordedExpiry||recorded.expires_at||(v3?addPolicyMonths(issuedAt,3):db.addDaysIso(issuedAt,days));
  if(!Number.isFinite(Date.parse(issuedAt))||!Number.isFinite(Date.parse(expiresAt)))fail('invalid_activation_dates');
  if(v2&&!v3&&Date.parse(expiresAt)-Date.parse(issuedAt)!==120*86400000)fail('new_policy_expiry_conflict');
  if(v3){
   if(c.claim_status==='applied'&&!journal)fail('activation_journal_missing',503);
   if(expiresAt!==(extension?.complete?extension.expires_at:addPolicyMonths(issuedAt,3)))fail('new_policy_expiry_conflict');
  }
  journal=journal||{policy_version:meta.policy?.policy_version||'v1',issued_at:issuedAt,expires_at:expiresAt,attempted:[]};await this.storage.put(key,journal);
  const results=[];
  for(let i=0;i<ids.length;i++){
   const paid=v2?i<2:i===0,sequence=v2?(i%2)+1:(i===0?null:i);
   const amount=paid?(v2?10000:20000):3500;
   const fields=db.creditFields({creditId:ids[i],clientRecordId:c.matched_client_id,memberId:c.matched_member_id,paymentRecordId:payment.id,paymentRef:body.payment_ref,claimId:c.claim_id,amount,creditType:paid?'paid_credit':'bonus_credit',authority:v2?'double_moment_coordinator':paid?'payment_authority':'campaign_worker',bonusSequence:sequence,issuedAt,expiresAt});
   fields['Policy Version']=v3?'v3':v2?'v2':'v1';
   if(v2){fields['Verified By']='payments-worker:double-moment-'+fields['Policy Version'];fields['Created By']='payments-worker:double-moment-'+fields['Policy Version'];if(paid)fields['Customer Display Note']='MMD DOUBLE MOMENT · เครดิตครั้งที่ '+sequence+' จำนวน 10,000 บาท';}
   let row=previous[i];
   if(row){const f=row.fields;if(f['Original Amount THB']!==amount||f['Campaign Claim ID']!==c.claim_id||f.source_payment_ref!==body.payment_ref||JSON.stringify(f.Client)!==JSON.stringify([c.matched_client_id])||f['Policy Version']!==fields['Policy Version']||f['Issued At']!==issuedAt||f['Expires At']!==expiresAt)fail('existing_credit_conflict');}
   else{
    if(journal.attempted.includes(ids[i]))fail('credit_write_uncertain_requires_review',503);
    journal.attempted.push(ids[i]);await this.storage.put(key,journal);
    row=await db.createRecord(this.env,db.table(this.env,'credits'),fields);if(!row?.id)fail('credit_not_persisted',503);
   }
   results.push({credit_id:ids[i],record_id:row.id});
  }
  await db.patchRecord(this.env,db.table(this.env,'claims'),claim.id,{claim_status:'applied',payment_status:'verified',applied_at:issuedAt,payload_json:JSON.stringify({...meta,expires_at:expiresAt,issued_at:issuedAt})});
  await db.patchRecord(this.env,db.table(this.env,'payments'),payment.id,{promo_status:'activated'});
  await this.storage.put(key,{...journal,complete:true});
  return json({ok:true,double_moment:{activated:true,campaign_id:CAMPAIGN,claim_id:c.claim_id,total_credit_thb:27000,expires_at:expiresAt,credits:results}});
 }
 async extensionContext(body,request){
  if(!this.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS||request.headers.get('x-internal-token')!==this.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS)return json({ok:false,error:'admin_service_required'},403);
  if(!body||Object.keys(body).some(k=>!['client_record_id','claim_id'].includes(k))||!validClient(body.client_record_id)||!/^dm(?:2)?_[a-f0-9]{24}$/.test(body.claim_id||''))fail('invalid_extension',422);
  const claim=await claimById(this.env,body.claim_id),c=claim?.fields||{},meta=parse(c.payload_json);
  if(c.matched_client_id!==body.client_record_id||c.campaign_id!==CAMPAIGN)fail('extension_owner_mismatch',403);
  const data={claim_id:c.claim_id,client_record_id:c.matched_client_id,member_id:c.matched_member_id||'',round_id:meta.round_id||'',policy_version:meta.policy?.policy_version||'v1',issued_at:meta.issued_at||c.applied_at||null,expires_at:meta.expires_at||null,can_extend:false,options:[],blocked_reason:'legacy_terms_preserved'};
  if(data.policy_version!=='v3')return json({ok:true,...data});
  if(c.claim_status!=='applied')return json({ok:true,...data,blocked_reason:'claim_not_active'});
  recordedPolicy(meta);
  const payment=await paymentByRef(this.env,c.payment_reference);assertOwner(payment,claim);assertRecordedPolicies(meta,payment);
  const activation=await this.storage.get('activation:'+c.claim_id),extension=await this.storage.get('extension:'+c.claim_id);
  if(!activation?.complete||activation.issued_at!==meta.issued_at)fail('activation_journal_missing',503);
  const expected=extension?.expires_at||addPolicyMonths(activation.issued_at,3);
  const pending=extension&&!extension.complete;
  const expiryOptions=pending?[extension.from,extension.expires_at]:[expected];
  if(!expiryOptions.includes(meta.expires_at)||!expiryOptions.includes(activation.expires_at))fail('extension_expiry_changed');
  let unused=0,used=0;
  for(const kind of ['paid','bonus'])for(const sequence of [1,2]){
   const row=await creditById(this.env,c.claim_id+':'+kind+':'+sequence),f=row?.fields||{},amount=kind==='paid'?10000:3500;
   if(!row||f['Campaign Claim ID']!==c.claim_id||JSON.stringify(f.Client)!==JSON.stringify([c.matched_client_id])||f.source_payment_ref!==c.payment_reference||f['Policy Version']!=='v3'||f['Credit Authority']!=='double_moment_coordinator'||f['Original Amount THB']!==amount||f['Issued At']!==activation.issued_at||!expiryOptions.includes(f['Expires At'])||f['Verification Status']!=='verified')fail('extension_credit_conflict');
   if(!['available','used'].includes(f.Status)||f['Reserved Amount THB']!==0||f['Available Amount THB']!==(f.Status==='used'?0:amount)||f['Applied Amount THB']!==(f.Status==='used'?amount:0))return json({ok:true,...data,blocked_reason:'extension_credit_on_hold_or_changed'});
   if(kind==='paid'){if(f.Status==='available')unused++;else used++;}
  }
  data.remaining_moments=unused;data.used_moments=used;data.maximum_expires_at=addPolicyMonths(activation.issued_at,5);
  if(!unused)return json({ok:true,...data,blocked_reason:'extension_no_unused_moments'});
  if(pending){
   const saved=extension.request;
   const fields=['client_record_id','claim_id','request_id','expected_expires_at','expires_at','reason'];
   const retry=saved&&saved.actor_id==='per'&&saved.client_record_id===c.matched_client_id&&saved.claim_id===c.claim_id&&saved.request_id===extension.request_id&&saved.expires_at===extension.expires_at;
   return json({ok:true,...data,blocked_reason:'extension_pending_requires_retry',pending_request:retry?Object.fromEntries(fields.map(k=>[k,saved[k]])):null});
  }
  data.options=[4,5].map(months=>({months,expires_at:addPolicyMonths(activation.issued_at,months)})).filter(o=>Date.parse(o.expires_at)>Math.max(Date.parse(meta.expires_at),Date.now()));
  return json({ok:true,...data,can_extend:data.options.length>0,blocked_reason:data.options.length?null:'extension_outside_five_month_limit'});
 }
 async extend(body,request){
  if(!this.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS||request.headers.get('x-internal-token')!==this.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS)return json({ok:false,error:'admin_service_required'},403);
  const allowed=['client_record_id','claim_id','request_id','expected_expires_at','expires_at','reason','actor_id'];
  if(!body||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k))||body.actor_id!=='per'||!validClient(body.client_record_id)||!/^dm2_[a-f0-9]{24}$/.test(body.claim_id||'')||!/^[-\w]{16,80}$/.test(body.request_id||'')||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>300)fail('invalid_extension',422);
  const claim=await claimById(this.env,body.claim_id),c=claim?.fields||{},meta=parse(c.payload_json);
  if(c.matched_client_id!==body.client_record_id)fail('extension_owner_mismatch',403);
  if(c.claim_status!=='applied'||recordedPolicy(meta).policy_version!=='v3')fail('extension_requires_active_v3_claim');
  const payment=await paymentByRef(this.env,c.payment_reference);assertOwner(payment,claim);assertRecordedPolicies(meta,payment);
  const activationKey='activation:'+c.claim_id,activation=await this.storage.get(activationKey);
  if(!activation?.complete||activation.issued_at!==meta.issued_at)fail('activation_journal_missing',503);
  const max=addPolicyMonths(activation.issued_at,5),target=body.expires_at;
  if(typeof target!=='string'||!Number.isFinite(Date.parse(target))||new Date(target).toISOString()!==target||Date.parse(target)>Date.parse(max)||Date.parse(target)<=Date.now())fail('extension_outside_five_month_limit');
  const key='extension:'+c.claim_id,receiptKey='extension-receipt:'+c.claim_id+':'+body.request_id;
  let pending=await this.storage.get(key);
  const fingerprint=await db.sha256(JSON.stringify(allowed.map(k=>body[k])));
  const receipt=await this.storage.get(receiptKey);
  if(receipt){if(receipt.fingerprint!==fingerprint)fail('extension_request_changed');return json({ok:true,...receipt.result,replayed:true});}
  if(pending&&!pending.complete){if(pending.fingerprint!==fingerprint)fail('extension_pending_requires_retry',503);}
  else{
   const expected=pending?.expires_at||addPolicyMonths(activation.issued_at,3);
   if(meta.expires_at!==expected||activation.expires_at!==expected||body.expected_expires_at!==expected)fail('extension_expiry_changed');
   if(Date.parse(target)<=Date.parse(expected))fail('extension_must_increase_expiry');
   pending={fingerprint,request:{...body},request_id:body.request_id,actor_id:body.actor_id,reason:body.reason.trim(),from:expected,expires_at:target,issued_at:activation.issued_at,complete:false};
  }
  if(![pending.from,target].includes(meta.expires_at)||![pending.from,target].includes(activation.expires_at))fail('extension_expiry_changed');
  const rows=[];
  // Validate all four rows before writing any. A HOLD, changed owner or changed
  // amount during an incomplete extension must not be overwritten by a retry.
  for(const kind of ['paid','bonus'])for(const sequence of [1,2]){
   const row=await creditById(this.env,c.claim_id+':'+kind+':'+sequence),f=row?.fields||{},amount=kind==='paid'?10000:3500;
   if(!row||f['Campaign Claim ID']!==c.claim_id||JSON.stringify(f.Client)!==JSON.stringify([c.matched_client_id])||f.source_payment_ref!==c.payment_reference||f['Policy Version']!=='v3'||f['Credit Authority']!=='double_moment_coordinator'||f['Original Amount THB']!==amount||f['Issued At']!==activation.issued_at||![pending.from,target].includes(f['Expires At'])||f['Verification Status']!=='verified')fail('extension_credit_conflict');
   if(!['available','used'].includes(f.Status)||f['Reserved Amount THB']!==0||f['Available Amount THB']!==(f.Status==='used'?0:amount)||f['Applied Amount THB']!==(f.Status==='used'?amount:0))fail('extension_credit_on_hold_or_changed');
   rows.push(row);
  }
  if(rows.every(row=>row.fields.Status==='used'))fail('extension_no_unused_moments');
  await this.storage.put(key,pending);
  for(const row of rows)if(row.fields['Expires At']!==target)await db.patchRecord(this.env,db.table(this.env,'credits'),row.id,{'Expires At':target});
  if(meta.expires_at!==target)await db.patchRecord(this.env,db.table(this.env,'claims'),claim.id,{payload_json:JSON.stringify({...meta,expires_at:target})});
  const result={claim_id:c.claim_id,request_id:body.request_id,expires_at:target,maximum_expires_at:max};
  await this.storage.put({[activationKey]:{...activation,expires_at:target},[key]:{...pending,complete:true},[receiptKey]:{fingerprint,result}});
  return json({ok:true,...result});
 }
 async redeem(body){
  const claim=await claimById(this.env,body.claim_id);const c=claim?.fields||{},meta=parse(c.payload_json);
  if((await this.storage.get('discount:'+body.job_id))?.status&& (await this.storage.get('discount:'+body.job_id)).status!=='cancelled')fail('job_has_discount_or_pending_mutation');
  if(c.claim_status!=='applied'||!['v2','v3'].includes(meta.policy?.policy_version))fail('legacy_or_inactive_claim_requires_existing_flow');
  recordedPolicy(meta);
  if(meta.policy.policy_version==='v3'){
   const activation=await this.storage.get('activation:'+c.claim_id),extension=await this.storage.get('extension:'+c.claim_id);
   if(extension&&!extension.complete)fail('extension_pending_requires_retry',503);
   if(!activation?.complete||meta.issued_at!==activation.issued_at||meta.expires_at!==activation.expires_at||meta.expires_at!==(extension?.expires_at||addPolicyMonths(activation.issued_at,3)))fail('activation_journal_missing',503);
   const payment=await paymentByRef(this.env,c.payment_reference);assertOwner(payment,claim);assertRecordedPolicies(meta,payment);
  }
  if(!/^[a-zA-Z0-9_-]{1,120}$/.test(body.job_id||''))fail('invalid_job',400);
  if(!(Date.parse(meta.expires_at)>Date.now()))fail('credit_expired');
  const job=await authority(this.env,'job',{job_id:body.job_id,claim_id:body.claim_id,client_record_id:c.matched_client_id});
  if(job.job_id!==body.job_id||job.client_record_id!==c.matched_client_id||job.credit_redemption_authorized!==true||!Number.isInteger(job.service_amount_thb)||job.service_amount_thb<20000||job.other_promotion_applied!==false||job.coupon_applied!==false)fail('job_not_eligible',403);
  const jobKey='job:'+body.job_id;const jobOwner=await this.storage.get(jobKey);
  if(jobOwner&&jobOwner!==body.claim_id)fail('job_already_used_for_another_claim');
  const key='redemption:'+body.claim_id;let allocations=await this.storage.get(key)||[];
  let allocation=allocations.find(x=>x.job_id===body.job_id);
  if(allocation?.complete)return json({ok:true,...allocation,replayed:true});
  if(!allocation){if(allocations.length>=2)fail('two_moments_already_allocated');allocation={job_id:body.job_id,sequence:allocations.length+1,paid_credit_thb:10000,bonus_credit_thb:3500,complete:false};allocations.push(allocation);await this.storage.put({[jobKey]:body.claim_id,[key]:allocations});}
  const debit=[];
  for(const kind of ['paid','bonus']){
   const row=await creditById(this.env,body.claim_id+':'+kind+':'+allocation.sequence);if(!row)fail('allocation_credit_missing');
   const f=row.fields,amount=kind==='paid'?10000:3500;
   if(f['Policy Version']!==meta.policy.policy_version||f['Credit Authority']!=='double_moment_coordinator'||f['Campaign Claim ID']!==body.claim_id||JSON.stringify(f.Client)!==JSON.stringify([c.matched_client_id])||f['Original Amount THB']!==amount||f['Expires At']!==meta.expires_at||f['Verification Status']!=='verified')fail('allocation_credit_conflict');
   const already=f.Status==='used'&&f['Applied Amount THB']===amount&&f['Available Amount THB']===0&&f['Reserved Amount THB']===0;
   if(!already&&(f.Status!=='available'||f['Available Amount THB']!==amount||f['Applied Amount THB']!==0||f['Reserved Amount THB']!==0))fail('allocation_credit_not_available');
   if(!already)debit.push({row,amount});
  }
  for(const {row,amount} of debit)await db.patchRecord(this.env,db.table(this.env,'credits'),row.id,{'Available Amount THB':0,'Applied Amount THB':amount,Status:'used'});
  allocation.complete=true;await this.storage.put(key,allocations);return json({ok:true,...allocation});
 }
}
