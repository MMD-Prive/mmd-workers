import { extensionIdentity, pricePublicExtension, PUBLIC_EXTENSION_POLICY_VERSION } from "../../shared/public-session-extension-v1.mjs";

const API="https://api.airtable.com/v0";
const EXT_TABLE_DEFAULT="tblbIhMUXMAYlXmpi";
const SESSIONS_DEFAULT="tblC98mKWbzmPuNzX";
const PAYMENTS_DEFAULT="tblWGGJJOx5eBvBZJ";
const PAYOUT_DEFAULT="tbl2624vwyWkOeP0y";

export const MEMBER_EXTENSION_PATH="/api/member/app/session/extension";
export const MEMBER_EXTENSION_REQUEST_PATH="/api/member/app/session/extension/request";

const EF=Object.freeze({
  requestId:"fldWgNAnDzvKFPqgK",session:"fldJgynlVTWudlHAq",sessionId:"fldYkRVUJkztQ2ThT",
  kind:"flddIurJJZlZHmOtg",status:"fld2mTgTg7JZePg9z",lane:"fld14fjGt8shKWb73",
  packageCode:"fldO8jptuBhZi6gZd",originalEnd:"fld4eFaGprFvrcFrm",requestedEnd:"fldVsKOtXr1SP3plX",
  minutes:"fldJBdPuy1jhUwtrk",customerAmount:"fldkGgu84J4sQjxfg",modelPayout:"fldDdV5lu1GNWrbZZ",
  policy:"fld0otgJgiw1ZXJb1",requestNote:"fld4JDK7pbPPx7nBv",modelNote:"fldLalD8oFLEV0EV0",
  modelAt:"fldPCYvCRPCTbold6",paymentRef:"fldQHdL9CPy52I7aX",paymentStage:"fldBbN30nVWgAdZnc",
  paymentVerifiedAt:"fldDXMFpqv9h1kdF5",mmdConfirmedAt:"fldnIGX0Cr90NjKS1",createdAt:"fldMxXMJpo1zhSofK",
  updatedAt:"fldd3BmpwWa8ylpeb",idempotency:"fldudZC4mExHcwQMm",audit:"fldSWvZLwv0Uswtu4",
  paymentUrl:"fld5dDpTX3wZHinLq",payoutAdjustmentId:"fldPvkTnIw9iHFykM",sessionPatchAt:"fld0KR4NfVr7bJCZu",
  confirmedEnd:"fld87sZVYMsT9BlQ7",paymentCheckAt:"fldrxFAMis8KsMzpT",
});
const PF=Object.freeze({
  ref:"fldOO6SY49iDw8VBZ",amount:"fldvCSwrUW8OMAooS",status:"fldEJ1hmm7KwWuI6q",
  verification:"fldJ7a0Ube9F0bmRy",sessionId:"fld2wdhBvc8xrV6y5",stage:"fldrr9g8ZZjqAbdKQ",
  type:"fldydUWHhqVLMkNSC",officialAt:"fldPNK6qgxCSdaJRM",officialRef:"flddkMKy5H8RbFwt9",
});
const OPEN=new Set(["requested","model_approved","payment_required","payment_pending","payment_verified"]);
const ACTIVE=new Set(["work_started","in_progress"]);
const TERMINAL=new Set(["model_declined","mmd_confirmed","cancelled"]);

function clean(v,max=4000){return String(v==null?"":v).trim().slice(0,max)}
function code(v){return clean(v,120).toLowerCase().replace(/[\s-]+/g,"_")}
function normalizePath(v){const p=clean(v||"/").replace(/\/{2,}/g,"/");return p.length>1?p.replace(/\/+$/g,""):p}
function formula(v){return String(v||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
function amount(v){const n=Number(String(v??"").replace(/,/g,""));return Number.isFinite(n)&&n>=0?Math.round((n+Number.EPSILON)*100)/100:null}
function json(data,status=200){return Response.json(data,{status,headers:{"cache-control":"no-store","x-mmd-member-app-api":"v1","x-mmd-session-extension":"v1"}})}
function fail(status,codeValue,message=codeValue){return json({ok:false,error:{code:codeValue,message}},status)}
function sameOrigin(request){const o=clean(request.headers.get("origin"),400).toLowerCase();return o==="https://mmdbkk.com"||o==="https://www.mmdbkk.com"}
function table(env,key,fallback){return clean(env[key]||fallback,200)}

async function afetch(env,url,init={}){
  if(!clean(env.AIRTABLE_API_KEY)||!clean(env.AIRTABLE_BASE_ID))throw new Error("airtable_not_ready");
  const req=new Request(url,{...init,headers:{authorization:`Bearer ${clean(env.AIRTABLE_API_KEY)}`,"content-type":"application/json",accept:"application/json",...(init.headers||{})}});
  const res=env.AIRTABLE_HTTP?.fetch?await env.AIRTABLE_HTTP.fetch(req):await fetch(req);
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const e=new Error(`airtable_${res.status}`);e.status=res.status;throw e}
  return data;
}
function baseUrl(env,tableName){return `${API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`}
async function list(env,tableName,filterByFormula,maxRecords=20,sortField=""){
  const url=new URL(baseUrl(env,tableName));
  url.searchParams.set("maxRecords",String(maxRecords));
  if(filterByFormula)url.searchParams.set("filterByFormula",filterByFormula);
  if(sortField){url.searchParams.set("sort[0][field]",sortField);url.searchParams.set("sort[0][direction]","desc")}
  const d=await afetch(env,url.toString());
  return Array.isArray(d.records)?d.records:[];
}
async function getById(env,tableName,id){return afetch(env,`${baseUrl(env,tableName)}/${encodeURIComponent(id)}`)}
async function patch(env,tableName,id,fields,typecast=false){return afetch(env,`${baseUrl(env,tableName)}/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({fields,typecast})})}
async function create(env,tableName,fields,typecast=false){
  const d=await afetch(env,baseUrl(env,tableName),{method:"POST",body:JSON.stringify({records:[{fields}],typecast})});
  return d.records?.[0]||null;
}
function oneLink(v){return Array.isArray(v)&&v.length===1?clean(typeof v[0]==="string"?v[0]:v[0]?.id,80):""}
function memberOwnsSession(record,identity){
  const f=record?.fields||{};
  const line=clean(f.line_user_id,160);
  const member=clean(oneLink(f.member_id)||f.member_id,160);
  if(line&&line!==identity.lineUserId)return false;
  if(member&&identity.memberId&&member!==identity.memberId)return false;
  return line===identity.lineUserId||Boolean(member&&identity.memberId&&member===identity.memberId);
}
async function ownedSession(env,identity,sessionId){
  const tableName=table(env,"AIRTABLE_TABLE_SESSIONS",SESSIONS_DEFAULT);
  const rows=await list(env,tableName,`{session_id}='${formula(sessionId)}'`,2);
  if(rows.length!==1||!memberOwnsSession(rows[0],identity))return null;
  return rows[0];
}
async function currentActiveOwnedSession(env,identity){
  const tableName=table(env,"AIRTABLE_TABLE_SESSIONS",SESSIONS_DEFAULT);
  const clauses=[`{line_user_id}='${formula(identity.lineUserId)}'`];
  if(identity.memberId)clauses.push(`FIND('${formula(identity.memberId)}',ARRAYJOIN({member_id}))`);
  const rows=await list(env,tableName,clauses.length===1?clauses[0]:`OR(${clauses.join(",")})`,50);
  return rows.find((r)=>memberOwnsSession(r,identity)&&ACTIVE.has(sessionState(r.fields)))||null;
}
function sessionState(f={}){
  return code(f.model_session_state||f.session_state||f.state||f["Session Status"]||f.status);
}
function sessionLane(f={}){return code(f.model_work_lane)}
function sessionPackage(f={}){return code(f.model_package_code||f.package_code)}
function sessionEndIso(f={}){
  const raw=clean(f.end_time||f["End Time"],120);
  const parsed=Date.parse(raw);
  if(Number.isFinite(parsed))return new Date(parsed).toISOString();
  const date=clean(f.job_date||f["Session Date"],20);
  const m=raw.match(/^(\d{1,2}):(\d{2})/);
  if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&m){
    const p=Date.parse(`${date}T${m[1].padStart(2,"0")}:${m[2]}:00+07:00`);
    if(Number.isFinite(p))return new Date(p).toISOString();
  }
  return "";
}
function safeExtension(record){
  if(!record)return null;const f=record.fields||{};
  return {
    request_id:clean(f[EF.requestId],180),request_kind:code(f[EF.kind]),status:code(f[EF.status]),
    original_end_at:clean(f[EF.originalEnd],120)||null,requested_end_at:clean(f[EF.requestedEnd],120)||null,
    requested_minutes:Number.isFinite(Number(f[EF.minutes]))?Number(f[EF.minutes]):null,
    customer_amount_thb:amount(f[EF.customerAmount]),
    payment_ref:clean(f[EF.paymentRef],220)||null,payment_stage:code(f[EF.paymentStage])||null,
    customer_payment_url:safePaymentUrl(f[EF.paymentUrl]),
    model_decision_at:clean(f[EF.modelAt],120)||null,payment_verified_at:clean(f[EF.paymentVerifiedAt],120)||null,
    mmd_confirmed_at:clean(f[EF.mmdConfirmedAt],120)||null,confirmed_end_at:clean(f[EF.confirmedEnd],120)||null,
  };
}
function safePaymentUrl(value){
  try{const u=new URL(clean(value,8192));if(u.protocol!=="https:"||u.hostname!=="mmdbkk.com"||u.pathname!=="/sigil/pay"||u.hash)return null;
    const keys=[...u.searchParams.keys()];if(keys.length!==1||keys[0]!=="t"||!u.searchParams.get("t"))return null;return u.toString();
  }catch{return null}
}
async function extensionRows(env,sessionId){
  return list(env,table(env,"AIRTABLE_TABLE_SESSION_EXTENSION_REQUESTS",EXT_TABLE_DEFAULT),`{session_id}='${formula(sessionId)}'`,20,"updated_at");
}
function exactSessionLink(extension,sessionRecord){return oneLink(extension?.fields?.[EF.session])===clean(sessionRecord?.id,80)}
async function currentExtension(env,session){
  const rows=await extensionRows(env,clean(session.fields?.session_id,180));
  return rows.find((row)=>exactSessionLink(row,session)&&OPEN.has(code(row.fields?.[EF.status])))||
    rows.find((row)=>exactSessionLink(row,session))||null;
}
async function paymentRecord(env,paymentRef){
  if(!paymentRef)return null;
  const rows=await list(env,table(env,"AIRTABLE_TABLE_PAYMENTS",PAYMENTS_DEFAULT),`{Payment Reference}='${formula(paymentRef)}'`,2);
  return rows.length===1?rows[0]:null;
}
function paymentVerified(record,extension){
  const f=record?.fields||{},ef=extension?.fields||{};
  const expectedRef=clean(ef[EF.paymentRef],220),expectedSession=clean(ef[EF.sessionId],220),expectedAmount=amount(ef[EF.customerAmount]);
  const ref=clean(f[PF.ref]||f["Payment Reference"]||f.payment_ref,220);
  const sid=clean(f[PF.sessionId]||f.session_id,220);
  const gotAmount=amount(f[PF.amount]??f.Amount??f.amount_thb);
  const stage=code(f[PF.stage]||f.payment_stage||f[PF.type]||f.payment_type);
  const status=code(f[PF.status]||f["Payment Status"]||f.payment_status);
  const verification=code(f[PF.verification]||f["Verification Status"]||f.verification_status);
  const officialRef=clean(f[PF.officialRef]||f.official_verification_ref,220);
  return ref===expectedRef&&sid===expectedSession&&gotAmount===expectedAmount&&stage==="extension"
    &&new Set(["paid","completed","success"]).has(status)
    &&new Set(["verified","official_verified","approved"]).has(verification)
    &&(!officialRef||officialRef===expectedRef);
}
async function findPayoutAdjustment(env,adjustmentId){
  const rows=await list(env,table(env,"AIRTABLE_TABLE_MODEL_PAYOUT_ADJUSTMENTS",PAYOUT_DEFAULT),`{adjustment_id}='${formula(adjustmentId)}'`,2);
  return rows.length===1?rows[0]:null;
}
async function finalizeVerifiedExtension(env,session,extension){
  const ef=extension.fields||{},now=new Date().toISOString();
  if(code(ef[EF.status])==="mmd_confirmed")return extension;
  if(!["payment_required","payment_pending","payment_verified","model_approved"].includes(code(ef[EF.status])))return extension;
  const payment=await paymentRecord(env,clean(ef[EF.paymentRef],220));
  await patch(env,table(env,"AIRTABLE_TABLE_SESSION_EXTENSION_REQUESTS",EXT_TABLE_DEFAULT),extension.id,{[EF.paymentCheckAt]:now});
  if(!paymentVerified(payment,extension)){
    if(payment&&code(ef[EF.status])!=="payment_pending"){
      return patch(env,table(env,"AIRTABLE_TABLE_SESSION_EXTENSION_REQUESTS",EXT_TABLE_DEFAULT),extension.id,{[EF.status]:"payment_pending",[EF.updatedAt]:now},true);
    }
    return extension;
  }

  const current=await getById(env,table(env,"AIRTABLE_TABLE_SESSIONS",SESSIONS_DEFAULT),session.id);
  const currentEnd=sessionEndIso(current.fields||{});
  const original=clean(ef[EF.originalEnd],120),requested=clean(ef[EF.requestedEnd],120);
  if(currentEnd!==original&&currentEnd!==requested){
    return patch(env,table(env,"AIRTABLE_TABLE_SESSION_EXTENSION_REQUESTS",EXT_TABLE_DEFAULT),extension.id,{
      [EF.status]:"review_required",[EF.updatedAt]:now,[EF.paymentVerifiedAt]:now,
      [EF.audit]:JSON.stringify({schema:"public_session_extension_v1",reason:"session_end_changed_after_request",current_end_at:currentEnd,original_end_at:original,requested_end_at:requested}),
    },true);
  }

  const payoutId=clean(ef[EF.payoutAdjustmentId],180)||`payout_${clean(ef[EF.requestId],180).replace(/^ext_/,"ext_")}`;
  let adjustment=await findPayoutAdjustment(env,payoutId);
  const basePayout=amount(current.fields?.pay_model_thb)??0,extra=amount(ef[EF.modelPayout])??0;
  if(!adjustment){
    adjustment=await create(env,table(env,"AIRTABLE_TABLE_MODEL_PAYOUT_ADJUSTMENTS",PAYOUT_DEFAULT),{
      adjustment_id:payoutId,Session:[session.id],session_id:clean(ef[EF.sessionId],180),
      model_name:clean(current.fields?.model_name||current.fields?.["Assigned Model"],160),
      direction:"add",adjustment_type:"overtime",amount_thb:extra,payout_before_thb:basePayout,payout_after_thb:basePayout+extra,
      note:`Public Session Extension ${clean(ef[EF.requestId],180)} · ${clean(ef[EF.originalEnd],120)} → ${clean(ef[EF.requestedEnd],120)}`,
      created_by:"member-pages-worker:public_session_extension_v1",created_at:now,source:"public_session_extension_v1",
      idempotency_key:clean(ef[EF.idempotency],220),
    },true);
  }

  if(currentEnd===original){
    await patch(env,table(env,"AIRTABLE_TABLE_SESSIONS",SESSIONS_DEFAULT),session.id,{end_time:requested});
  }
  return patch(env,table(env,"AIRTABLE_TABLE_SESSION_EXTENSION_REQUESTS",EXT_TABLE_DEFAULT),extension.id,{
    [EF.status]:"mmd_confirmed",[EF.paymentVerifiedAt]:now,[EF.mmdConfirmedAt]:now,[EF.sessionPatchAt]:now,
    [EF.confirmedEnd]:requested,[EF.payoutAdjustmentId]:payoutId,[EF.updatedAt]:now,
    [EF.audit]:JSON.stringify({schema:"public_session_extension_v1",event:"mmd_confirmed",payment_ref:clean(ef[EF.paymentRef],220),payout_adjustment_id:payoutId,official_end_at:requested}),
  },true);
}

async function requestExtension(request,env,identity){
  if(!sameOrigin(request))return fail(403,"SAME_ORIGIN_REQUIRED","Open MY MMD through MMD.");
  const body=await request.json().catch(()=>null);
  const sessionId=clean(body?.session_id,180),kind=code(body?.request_kind||"extend_time");
  if(!sessionId)return fail(400,"SESSION_ID_REQUIRED");
  if(!["extend_time","change_plan"].includes(kind))return fail(400,"INVALID_EXTENSION_KIND");
  const session=await ownedSession(env,identity,sessionId);
  if(!session)return fail(404,"SESSION_NOT_FOUND");
  const lane=sessionLane(session.fields),state=sessionState(session.fields);
  if(lane!=="public_model")return fail(409,"PUBLIC_EXTENSION_NOT_AVAILABLE","This job uses case-locked money and requires MMD review.");
  if(!ACTIVE.has(state))return fail(409,"SESSION_NOT_ACTIVE","Extension opens only after the confirmed Public session has started.");

  const existing=await currentExtension(env,session);
  if(existing&&OPEN.has(code(existing.fields?.[EF.status])))return json({ok:true,idempotent:true,extension:safeExtension(existing),can_request:false});

  const originalEnd=sessionEndIso(session.fields);
  if(!originalEnd)return fail(503,"OFFICIAL_END_TIME_UNAVAILABLE");
  const packageCode=sessionPackage(session.fields);
  const note=clean(body?.note,600);
  let requestedEnd=originalEnd,minutes=0,priced;
  if(kind==="extend_time"){
    minutes=Number(body?.requested_minutes);
    if(!Number.isInteger(minutes))return fail(400,"REQUESTED_MINUTES_REQUIRED");
    requestedEnd=new Date(Date.parse(originalEnd)+minutes*60_000).toISOString();
    priced=pricePublicExtension({requestKind:kind,packageCode,originalEndAt:originalEnd,requestedEndAt:requestedEnd});
  }else{
    priced=pricePublicExtension({requestKind:kind,packageCode,originalEndAt:originalEnd,requestedEndAt:originalEnd});
  }
  const ids=await extensionIdentity({sessionId,requestKind:kind,originalEndAt:originalEnd,requestedEndAt:requestedEnd});
  const rows=await extensionRows(env,sessionId);
  const duplicate=rows.find((row)=>clean(row.fields?.[EF.requestId],180)===ids.request_id&&exactSessionLink(row,session));
  if(duplicate)return json({ok:true,idempotent:true,extension:safeExtension(duplicate),can_request:false});

  const now=new Date().toISOString();
  const status=priced.ok?"requested":"review_required";
  const record=await create(env,table(env,"AIRTABLE_TABLE_SESSION_EXTENSION_REQUESTS",EXT_TABLE_DEFAULT),{
    [EF.requestId]:ids.request_id,[EF.session]:[session.id],[EF.sessionId]:sessionId,[EF.kind]:kind,[EF.status]:status,
    [EF.lane]:"public_model",[EF.packageCode]:packageCode,[EF.originalEnd]:originalEnd,[EF.requestedEnd]:requestedEnd,
    [EF.minutes]:kind==="extend_time"?minutes:undefined,[EF.customerAmount]:priced.ok?priced.customer_amount_thb:undefined,
    [EF.modelPayout]:priced.ok?priced.model_payout_thb:undefined,[EF.policy]:PUBLIC_EXTENSION_POLICY_VERSION,[EF.requestNote]:note||undefined,
    [EF.paymentRef]:priced.ok?ids.payment_ref:undefined,[EF.paymentStage]:priced.ok?"extension":undefined,
    [EF.createdAt]:now,[EF.updatedAt]:now,[EF.idempotency]:ids.idempotency_key,
    [EF.audit]:JSON.stringify({schema:"public_session_extension_v1",event:"customer_requested",pricing:priced}),
  },true);
  return json({ok:true,created:true,extension:safeExtension(record),can_request:false},201);
}

export function isMemberAppSessionExtensionPath(input){
  const path=normalizePath(input instanceof URL?input.pathname:new URL(String(input)).pathname);
  return path===MEMBER_EXTENSION_PATH||path===MEMBER_EXTENSION_REQUEST_PATH;
}
export async function handleMemberAppSessionExtensionApi(request,env={},readSession){
  const path=normalizePath(new URL(request.url).pathname);
  const method=request.method.toUpperCase();
  if(path===MEMBER_EXTENSION_PATH&&method!=="GET")return fail(405,"METHOD_NOT_ALLOWED");
  if(path===MEMBER_EXTENSION_REQUEST_PATH&&method!=="POST")return fail(405,"METHOD_NOT_ALLOWED");
  const identity=await readSession(request,env);
  if(!identity?.lineUserId)return fail(401,"MEMBER_SESSION_REQUIRED","Open MY MMD through LINE and sign in again.");
  try{
    if(path===MEMBER_EXTENSION_REQUEST_PATH)return requestExtension(request,env,identity);
    const requestedId=clean(new URL(request.url).searchParams.get("session_id"),180);
    const session=requestedId?await ownedSession(env,identity,requestedId):await currentActiveOwnedSession(env,identity);
    if(!session)return json({ok:true,session:null,extension:null,can_request:false});
    let extension=await currentExtension(env,session);
    if(extension&&["model_approved","payment_required","payment_pending","payment_verified"].includes(code(extension.fields?.[EF.status]))){
      extension=await finalizeVerifiedExtension(env,session,extension);
    }
    const refreshedSession=code(extension?.fields?.[EF.status])==="mmd_confirmed"
      ? await getById(env,table(env,"AIRTABLE_TABLE_SESSIONS",SESSIONS_DEFAULT),session.id)
      : session;
    return json({
      ok:true,
      session:{session_id:clean(refreshedSession.fields?.session_id,180),status:sessionState(refreshedSession.fields),official_end_at:sessionEndIso(refreshedSession.fields),package_code:sessionPackage(refreshedSession.fields),model_work_lane:sessionLane(refreshedSession.fields)},
      extension:safeExtension(extension),
      can_request:sessionLane(refreshedSession.fields)==="public_model"&&ACTIVE.has(sessionState(refreshedSession.fields))&&(!extension||!OPEN.has(code(extension.fields?.[EF.status]))),
    });
  }catch(e){return fail(Number(e?.status)||500,"SESSION_EXTENSION_UNAVAILABLE",clean(e?.message||e||"extension_unavailable",300))}
}

export const MEMBER_EXTENSION_INTERNALS=Object.freeze({sessionEndIso,paymentVerified,safeExtension,finalizeVerifiedExtension});
