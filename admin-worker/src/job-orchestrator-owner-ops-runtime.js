import { sendCanonicalTelegramAlert, telegramAlertDiagnostic } from "./telegram-alert-matrix.js";
import { readCustomerCompletion, withSessionCompletionLock } from "../../shared/session-completion.mjs";
import { readVerifiedPayoutDestination, sendOwnerPayoutInstructions } from "./model-payout-destination.js";

// Kept separate from the owner-review queue at /v1/admin/dashboard/owner-actions.
export const OWNER_JOB_ACTIONS_PATH = "/v1/admin/jobs/owner-actions";
export const JOB_ORCHESTRATOR_AUTHORITY = "model_session_contract_v1";

const API = "https://api.airtable.com/v0";
const BASE = "appsV1ILPRfIjkaYg";
const SESSIONS = "tblC98mKWbzmPuNzX";
const PAYMENTS = "tblWGGJJOx5eBvBZJ";
const PAYOUTS = "tblMvsl7qYozD05e5";
const CARE = "tbltWzMBhWev4JR13";

export const OWNER_OPS_FIELDS = Object.freeze({
  session: Object.freeze({
    sessionId: "fldLTq2kZbyRv22IA", jobId: "fldHw5HdDDdkHXMhG", modelName: "flddVz6eoWRHrzIQr",
    clientName: "fldMvnQ0BzDfHUYjT", paymentRef: "fldojgjSQLaO0uQLX", modelPayout: "fldlTO5aNfqUmlNWm",
    customerAckAt: "fldJSS5GNN7quJwa8", modelAckAt: "fldFgkHXivIAThfDz", state: "fld57fhdWqIcOy4Jp",
    stateUpdatedAt: "fldFJI1Leni6wvzR4", completion: "fldsX182wBo1TdD5f", reviewedAt: "fldwFJHdx52esyQcq",
    holdReason: "fldLjo7Af3ISu9yf5",
  }),
  payment: Object.freeze({
    paymentRef: "fldOO6SY49iDw8VBZ", sessionId: "fld2wdhBvc8xrV6y5", verification: "fldJ7a0Ube9F0bmRy",
    statusFormula: "fld0aatroI5poWOSo", amount: "fldvCSwrUW8OMAooS", purpose: "fldrr9g8ZZjqAbdKQ", stage: "fldydUWHhqVLMkNSC",
  }),
  payout: Object.freeze({
    payoutRef: "fldrHeDeuv0ZP08L1", sessionId: "fldwmqaIq9QubX9Uy", modelName: "fldxsDAxjO9sDt3Ab",
    type: "fldgITP2xFiS2YHCG", amount: "fldTNf4UOoqc0KobP", paidAt: "fldUxokneJ2FBI6jo",
    status: "fldy2TgwO7Ayp6uhh", linkedTipRef: "fldE6ytRRoob0NYd8", linkedPaymentRef: "flduYN0QZI3HECj4w",
    slipAttachment: "fldzONvJF4NWV7Izc", slipUrl: "fldx8ekePcfFmUjND", verification: "fldbnm3clTmwhGiNu",
    verifiedBy: "fldz2xFFuQEiTIiQw", verifiedAt: "fldxCfwIzjM2wfsWl", notes: "fldDySELyceFl9aaf", privacy: "fldzN9hbCbWIbQOj1",
  }),
  care: Object.freeze({ complaintId: "fldxO9ZbQvw2kfXmT", sessionId: "fldsCZsKIU7k9ZJm3", status: "fldlW4GB2IoyjY5ee" }),
});

const F = OWNER_OPS_FIELDS;
const POST_WORK = new Set(["work_finished", "separated", "under_review", "payout_pending"]);
const OWNER_ROLES = new Set(["owner", "admin", "super_admin", "superadmin"]);
const str = (v, n = 500) => String(v ?? "").trim().slice(0, n);
const valueName = (v) => str(v && typeof v === "object" && !Array.isArray(v) ? v.name : v, 120).toLowerCase();
const cash = (v) => Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : null;
function cfg(env) { return { base: str(env.AIRTABLE_BASE_ID, 40) || BASE, token: str(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1200) }; }
async function at(env, table, suffix = "", { method = "GET", body, query = {} } = {}) {
  const c = cfg(env); if (!c.base || !c.token) throw new Error("airtable_not_configured");
  const u = new URL(`${API}/${encodeURIComponent(c.base)}/${encodeURIComponent(table)}${suffix}`);
  u.searchParams.set("returnFieldsByFieldId", "true");
  Object.entries(query).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v)); });
  const r = await fetch(u, { method, signal:AbortSignal.timeout(10000), headers: { authorization: `Bearer ${c.token}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const p = await r.json().catch(() => null); if (!r.ok) throw new Error(`airtable_${r.status}`); return p;
}
async function all(env, table, max = 300) { const out=[]; let offset=""; do { const p=await at(env,table,"",{query:{pageSize:100,...(offset?{offset}:{})}}); out.push(...(p?.records||[])); offset=str(p?.offset,500); } while(offset&&out.length<max); if(offset)throw new Error("owner_ops_source_incomplete"); return out; }
const patch = (env, table, id, fields) => at(env, table, `/${encodeURIComponent(id)}`, { method:"PATCH", body:{fields} });
const create = (env, table, fields) => at(env, table, "", { method:"POST", body:{fields} });

export function verifiedPaymentForSession(rows = [], sessionId = "", paymentRef = "") {
  const candidates = rows.filter(r => sessionId && str(r?.fields?.[F.payment.sessionId],120)===sessionId);
  return candidates.filter(r => valueName(r?.fields?.[F.payment.verification]) === "verified").sort((a,b) => {
    const rank = r => ["final","full"].includes(valueName(r?.fields?.[F.payment.stage])) ? 2 : 1; return rank(b)-rank(a);
  })[0] || null;
}
export function openCareForSession(rows = [], sessionId = "") { return rows.filter(r => str(r?.fields?.[F.care.sessionId],120)===sessionId && valueName(r?.fields?.[F.care.status])!=="closed"); }
export function payoutForSession(rows = [], sessionId = "") { return rows.find(r => str(r?.fields?.[F.payout.sessionId],120)===sessionId && valueName(r?.fields?.[F.payout.type])==="session_payout") || null; }
export function projectOwnerAction(session, { payment=null, payout=null, openCare=[] } = {}) {
  const x=session?.fields||{}, state=valueName(x[F.session.state]), completion=valueName(x[F.session.completion]), amount=cash(x[F.session.modelPayout]), payoutStatus=valueName(payout?.fields?.[F.payout.status]);
  const completionEvidence = readCustomerCompletion(x), approved = completionEvidence.approved;
  const clear = ["clear","resolved"].includes(completion) && !str(x[F.session.holdReason],240) &&
    (!completionEvidence.review?.private_care_recommended || Date.parse(x[F.session.reviewedAt]) >= Date.parse(completionEvidence.review.ts));
  const finalVerified = valueName(payment?.fields?.[F.payment.verification]) === "verified" && ["final","full"].includes(valueName(payment?.fields?.[F.payment.stage]));
  const payable = approved && clear && !openCare.length && finalVerified && amount > 0;
  const holds=[]; if(!approved)holds.push("customer_completion_required"); if(openCare.length)holds.push("open_private_care_case"); if(!payment)holds.push("payment_not_verified"); if(!(amount>0))holds.push("payout_amount_missing"); if(!["clear","resolved"].includes(completion))holds.push("completion_not_reviewed");
  return { session_id:str(x[F.session.sessionId],120), job_id:str(x[F.session.jobId],120)||null, client_name:str(x[F.session.clientName],160)||null, model_name:str(x[F.session.modelName],160)||null,
    state:state||null, customer_approved:approved, customer_review:readCustomerCompletion(x).review, confirmation_complete:Boolean(str(x[F.session.customerAckAt],80)&&str(x[F.session.modelAckAt],80)), completion_review_status:completion||null, payout_amount_thb:amount,
    payout_status:payoutStatus||null, payment_verified:Boolean(payment), open_care_case_count:openCare.length, payout_hold_reason:str(x[F.session.holdReason],240)||(holds.join(",")||null),
    actions:{ can_clear_completion:approved&&(["separated","under_review"].includes(state)||(state==="payout_pending"&&!clear))&&!openCare.length&&finalVerified&&amount>0, can_hold_completion:POST_WORK.has(state),
      can_mark_payout_ready:payable&&state==="under_review"&&payoutStatus!=="payout_paid",
      can_resend_payout_instructions:payable&&state==="payout_pending"&&payoutStatus==="payout_pending",
      can_mark_payout_paid:payable&&state==="payout_pending"&&payoutStatus==="payout_pending" } };
}

export async function listOwnerJobActions(env={}) {
  const [sessions,payments,payouts,care]=await Promise.all([all(env,SESSIONS),all(env,PAYMENTS),all(env,PAYOUTS),all(env,CARE)]);
  const items=sessions.filter(s=>{const q=valueName(s?.fields?.[F.session.state]);return POST_WORK.has(q)||q==="closed";}).map(s=>{const id=str(s?.fields?.[F.session.sessionId],120);return projectOwnerAction(s,{payment:verifiedPaymentForSession(payments,id,str(s?.fields?.[F.session.paymentRef],180)),payout:payoutForSession(payouts,id),openCare:openCareForSession(care,id)});}).filter(x=>x.session_id);
  const completion=items.filter(x=>["separated","under_review"].includes(x.state)&&!["clear","resolved"].includes(x.completion_review_status));
  const ready=items.filter(x=>x.actions.can_mark_payout_ready||x.state==="payout_pending");
  return {ok:true,authority:JOB_ORCHESTRATOR_AUTHORITY,counts:{completion_review:completion.length,payout_ready:ready.length,confirmation_incomplete:sessions.filter(s=>["offered","confirmed"].includes(valueName(s?.fields?.[F.session.state]))&&!(str(s?.fields?.[F.session.customerAckAt],80)&&str(s?.fields?.[F.session.modelAckAt],80))).length},items,telegram:telegramAlertDiagnostic(env)};
}
export async function readPayoutRetryAction(env, sessionId, recordId) {
  const [sessions,payments,payouts,care]=await Promise.all([all(env,SESSIONS),all(env,PAYMENTS),all(env,PAYOUTS),all(env,CARE)]);
  const matches=sessions.filter(r=>str(r?.fields?.[F.session.sessionId],120)===sessionId);
  const payoutMatches=payouts.filter(r=>str(r?.fields?.[F.payout.sessionId],120)===sessionId&&valueName(r?.fields?.[F.payout.type])==='session_payout');
  if(matches.length!==1||matches[0].id!==recordId||payoutMatches.length!==1)
    return {error:'session_or_payout_ambiguous'};
  const session=matches[0];
  return projectOwnerAction(session,{payment:verifiedPaymentForSession(payments,sessionId),payout:payoutMatches[0],openCare:openCareForSession(care,sessionId)});
}
function result(ok,status,extra={}) { return {ok,status,authority:JOB_ORCHESTRATOR_AUTHORITY,...extra}; }
export async function applyOwnerJobAction(env={}, body={}, actor={}) {
  if(!OWNER_ROLES.has(valueName(actor?.role))) return result(false,403,{error:"owner_or_admin_required"});
  const sessionId=str(body.session_id,120);
  if(!sessionId)return result(false,400,{error:"session_id_and_action_required"});
  return withSessionCompletionLock(env,sessionId,()=>applyOwnerJobActionLocked(env,body,actor));
}
async function applyOwnerJobActionLocked(env={}, body={}, actor={}) {
  if(!OWNER_ROLES.has(valueName(actor?.role))) return result(false,403,{error:"owner_or_admin_required"});
  const sessionId=str(body.session_id,120), action=valueName(body.action), reason=str(body.reason,500); if(!sessionId||!action)return result(false,400,{error:"session_id_and_action_required"});
  const [sessions,payments,payouts,care]=await Promise.all([all(env,SESSIONS),all(env,PAYMENTS),all(env,PAYOUTS),all(env,CARE)]);
  if(sessions.filter(r=>str(r?.fields?.[F.session.sessionId],120)===sessionId).length>1 || payouts.filter(r=>str(r?.fields?.[F.payout.sessionId],120)===sessionId&&valueName(r.fields?.[F.payout.type])==="session_payout").length>1) return result(false,409,{error:"session_or_payout_ambiguous"});
  const session=sessions.find(r=>str(r?.fields?.[F.session.sessionId],120)===sessionId); if(!session?.id)return result(false,404,{error:"session_not_found"});
  // Review revisions must advance even when HOLD and reapproval share a millisecond.
  const previousReviewAt=Date.parse(session.fields?.[F.session.reviewedAt]);
  const now=new Date(Math.max(Date.now(),Number.isFinite(previousReviewAt)?previousReviewAt+1:0)).toISOString();
  const state=valueName(session.fields?.[F.session.state]), paymentRef=str(session.fields?.[F.session.paymentRef],180), payment=verifiedPaymentForSession(payments,sessionId,paymentRef), openCare=openCareForSession(care,sessionId), payout=payoutForSession(payouts,sessionId), amount=cash(session.fields?.[F.session.modelPayout]);
  if (["clear_completion_review", "mark_payout_ready", "mark_payout_paid"].includes(action)) {
    const completion = readCustomerCompletion(session.fields);
    if (!completion.approved) return result(false,409,{error:"customer_completion_required"});
    if (completion.review?.private_care_recommended && action === "clear_completion_review" && reason.length < 5)
      return result(false,409,{error:"customer_review_resolution_required"});
    if (action !== "clear_completion_review" && (!["clear","resolved"].includes(valueName(session.fields[F.session.completion])) ||
        str(session.fields[F.session.holdReason],240) ||
        (completion.review?.private_care_recommended && !(Date.parse(session.fields[F.session.reviewedAt]) >= Date.parse(completion.review.ts)))))
      return result(false,409,{error:"completion_review_not_clear"});
    if (!payment || !["final","full"].includes(valueName(payment.fields?.[F.payment.stage])))
      return result(false,409,{error:"final_payment_not_verified"});
    if (action === "mark_payout_ready") {
      try { await readVerifiedPayoutDestination(env, session); }
      catch { return result(false,409,{error:"verified_payout_destination_required"}); }
    }
  }
  if (["clear_completion_review","mark_payout_ready","mark_payout_paid","hold_completion_review"].includes(action)) {
    const fresh=await at(env,SESSIONS,`/${encodeURIComponent(session.id)}`);
    if(JSON.stringify(fresh.fields)!==JSON.stringify(session.fields))return result(false,409,{error:"session_changed_retry"});
  }
  const deliverInstructions=()=>sendOwnerPayoutInstructions(env, session, amount, async fresh => {
      const [latestPayments,latestCare]=await Promise.all([all(env,PAYMENTS),all(env,CARE)]);
      const p=verifiedPaymentForSession(latestPayments,sessionId,str(fresh.fields.payment_ref,180));
      return Boolean(p)&&["final","full"].includes(valueName(p.fields?.[F.payment.stage]))&&!openCareForSession(latestCare,sessionId).length;
    });
  if(action==="clear_completion_review"&&state==="payout_pending"&&projectOwnerAction(session,{payment,payout,openCare}).actions.can_resend_payout_instructions)
    return result(true,200,{action,session_id:sessionId,state,completion_review_status:valueName(session.fields[F.session.completion]),idempotent:true,money_truth_changed:false});
  if(action==="mark_payout_ready" && state==="payout_pending"){
    if(valueName(payout?.fields?.[F.payout.status])!=="payout_pending")return result(false,409,{error:"payout_evidence_not_pending"});
    return result(true,200,{action,session_id:sessionId,state,payout_status:"payout_pending",idempotent:true,owner_notification:await deliverInstructions(),money_truth_changed:false});
  }
  if(action==="hold_completion_review") { if(!POST_WORK.has(state))return result(false,409,{error:"completion_hold_not_allowed_from_state",state}); if(reason.length<5)return result(false,400,{error:"hold_reason_required"}); await patch(env,SESSIONS,session.id,{[F.session.completion]:"hold",[F.session.holdReason]:reason,[F.session.reviewedAt]:now}); if(payout?.id&&valueName(payout.fields?.[F.payout.status])==="payout_pending")await patch(env,PAYOUTS,payout.id,{[F.payout.status]:"payout_under_review",[F.payout.notes]:`Hold: ${reason}`}); await sendCanonicalTelegramAlert(env,{event:"complaint_dispute_opened",session_id:sessionId,reference_id:sessionId,text:`MMD · Completion/Payout HOLD\nSession: ${sessionId}\nReason: ${reason}`,idempotency_key:`completion_hold:${sessionId}:${str(body.event_id||reason,120)}`}); return result(true,200,{action,session_id:sessionId,state,completion_review_status:"hold",money_truth_changed:false}); }
  if(action==="clear_completion_review") { if(!["separated","under_review","payout_pending"].includes(state))return result(false,409,{error:"completion_review_not_allowed_from_state",state}); if(openCare.length)return result(false,409,{error:"open_private_care_case",count:openCare.length}); if(!payment)return result(false,409,{error:"payment_not_verified"}); if(!(amount>0))return result(false,409,{error:"payout_amount_missing"}); const fields={[F.session.completion]:"clear",[F.session.reviewedAt]:now,[F.session.holdReason]:"",fldflz9XwR9vAQIBZ:JSON.stringify({...readCustomerCompletion(session.fields).evidence,owner_resolution:{at:now,actor_id:str(actor.id,120),reason}})}; if(["separated","payout_pending"].includes(state)){fields[F.session.state]="under_review";fields[F.session.stateUpdatedAt]=now;} await patch(env,SESSIONS,session.id,fields); return result(true,200,{action,session_id:sessionId,state:["separated","payout_pending"].includes(state)?"under_review":state,completion_review_status:"clear",money_truth_changed:false}); }
  if(action==="mark_payout_ready") { const completion=valueName(session.fields?.[F.session.completion]); if(!["under_review","payout_pending"].includes(state))return result(false,409,{error:"payout_ready_requires_under_review",state}); if(!["clear","resolved"].includes(completion))return result(false,409,{error:"completion_review_not_clear"}); if(openCare.length)return result(false,409,{error:"open_private_care_case",count:openCare.length}); if(!payment)return result(false,409,{error:"payment_not_verified"}); if(!(amount>0))return result(false,409,{error:"payout_amount_missing"}); const ref=`payout:${sessionId}:session_payout`; if(payout?.id){if(valueName(payout.fields?.[F.payout.status])==="payout_paid")return result(true,200,{action,session_id:sessionId,idempotent:true,payout_status:"payout_paid"}); await patch(env,PAYOUTS,payout.id,{[F.payout.status]:"payout_pending",[F.payout.verification]:"pending",[F.payout.amount]:amount,[F.payout.linkedPaymentRef]:paymentRef||str(payment.fields?.[F.payment.paymentRef],180)});} else await create(env,PAYOUTS,{[F.payout.payoutRef]:ref,[F.payout.sessionId]:sessionId,[F.payout.modelName]:str(session.fields?.[F.session.modelName],160),[F.payout.type]:"session_payout",[F.payout.amount]:amount,[F.payout.status]:"payout_pending",[F.payout.verification]:"pending",[F.payout.linkedPaymentRef]:paymentRef||str(payment.fields?.[F.payment.paymentRef],180),[F.payout.privacy]:"admin_only",[F.payout.notes]:`Ready to Pay by ${str(actor.id,120)||"owner"}`}); await patch(env,SESSIONS,session.id,{[F.session.state]:"payout_pending",[F.session.stateUpdatedAt]:now,[F.session.holdReason]:""}); await sendCanonicalTelegramAlert(env,{event:"payout_ready",session_id:sessionId,reference_id:ref,text:`MMD · READY TO PAY\nSession: ${sessionId}\nModel: ${str(session.fields?.[F.session.modelName],160)||"—"}\nAmount: ${amount.toLocaleString("en-US")} THB\nhttps://www.mmdbkk.com/internal/admin/jobs/completion?session_id=${encodeURIComponent(sessionId)}`,idempotency_key:ref}); const delivery=await deliverInstructions(); return result(true,200,{action,session_id:sessionId,state:"payout_pending",payout_ref:ref,payout_status:"payout_pending",owner_notification:delivery,money_truth_changed:false}); }
  if(action==="mark_payout_paid") { if(state!=="payout_pending")return result(false,409,{error:"payout_paid_requires_payout_pending",state}); if(!payout?.id||valueName(payout.fields?.[F.payout.status])!=="payout_pending")return result(false,409,{error:"payout_evidence_not_pending"}); const transfer=str(body.transfer_ref,240); if(transfer.length<4)return result(false,400,{error:"transfer_ref_required"}); if(openCare.length)return result(false,409,{error:"open_private_care_case",count:openCare.length}); const old=str(payout.fields?.[F.payout.notes],1600), note=[old,`owner_transfer_ref=${transfer}`,`marked_by=${str(actor.id,120)}`,`marked_at=${now}`].filter(Boolean).join("; ").slice(0,1900); const fields={[F.payout.status]:"payout_paid",[F.payout.verification]:"verified",[F.payout.paidAt]:now,[F.payout.verifiedBy]:str(actor.id,120)||"owner",[F.payout.verifiedAt]:now,[F.payout.notes]:note}; if(str(body.payout_slip_url,1000))fields[F.payout.slipUrl]=str(body.payout_slip_url,1000); await patch(env,PAYOUTS,payout.id,fields); await patch(env,SESSIONS,session.id,{[F.session.state]:"closed",[F.session.stateUpdatedAt]:now,[F.session.completion]:"resolved",[F.session.reviewedAt]:now,[F.session.holdReason]:""}); return result(true,200,{action,session_id:sessionId,state:"closed",payout_status:"payout_paid",money_truth_changed:false}); }
  return result(false,400,{error:"unsupported_owner_job_action"});
}
export function augmentDashboardPayload(payload, ops) { if(!payload||typeof payload!=="object"||!ops?.ok)return payload; return {...payload,counts:{...(payload.counts||{}),completion_review:ops.counts.completion_review,payout_ready:ops.counts.payout_ready,confirmation_incomplete:ops.counts.confirmation_incomplete},queues:{...(payload.queues||{}),completion_review:{count:ops.counts.completion_review,href:"/internal/admin/jobs/completion"},payout_ready:{count:ops.counts.payout_ready,href:"/internal/admin/jobs/completion"}},owner_actions:{authority:JOB_ORCHESTRATOR_AUTHORITY,href:"/internal/admin/jobs/all?ops=owner",items:ops.items.slice(0,20).map(({customer_review,...safe})=>safe)},telegram_alerts:ops.telegram}; }
export function isOwnerJobActionsRequest(url,method="GET"){const path=typeof url==="string"?new URL(url,"https://mmdbkk.com").pathname:url?.pathname;return path===OWNER_JOB_ACTIONS_PATH&&["GET","POST"].includes(String(method).toUpperCase());}
export function ownerActionHttpResponse(x){return Response.json(x,{status:Number(x?.status)||(x?.ok?200:500),headers:{"cache-control":"no-store, private","content-type":"application/json; charset=utf-8"}});}
