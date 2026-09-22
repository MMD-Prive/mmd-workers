import { createConfirmTokenRecord, getConfirmTokenTtlSeconds, signConfirmToken } from "./index.js";

const PATH_INTENT = "/v1/internal/payments/session-extension/intent";
const PATH_STATUS = "/v1/internal/payments/session-extension/status";
const API = "https://api.airtable.com/v0";
const DEFAULT_PAYMENTS = "tblWGGJJOx5eBvBZJ";

const F = Object.freeze({
  ref:"fldOO6SY49iDw8VBZ",
  amount:"fldvCSwrUW8OMAooS",
  status:"fldEJ1hmm7KwWuI6q",
  method:"fldsblzIn0wzan3c9",
  notes:"fldjsZIKoJPawlb2u",
  intent:"fld04fr3bRJTohO6y",
  verification:"fldJ7a0Ube9F0bmRy",
  createdAt:"flduxcPpowBxEZSLu",
  sessionId:"fld2wdhBvc8xrV6y5",
  stage:"fldrr9g8ZZjqAbdKQ",
  type:"fldydUWHhqVLMkNSC",
  officialAt:"fldPNK6qgxCSdaJRM",
  officialRef:"flddkMKy5H8RbFwt9",
  officialBy:"fld208LCmQZB5llNo",
  officialReason:"fldXH56EPA122RoGa",
});

function clean(v,max=4000){return String(v==null?"":v).trim().slice(0,max)}
function normalizePath(v){const p=clean(v||"/").replace(/\/{2,}/g,"/");return p.length>1?p.replace(/\/+$/g,""):p}
function amount(v){const n=Number(String(v??"").replace(/,/g,""));return Number.isFinite(n)&&n>0&&n<=10_000_000?Math.round((n+Number.EPSILON)*100)/100:null}
function compact(o){return Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined&&v!==null&&v!==""))}
function formula(v){return String(v||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
function json(data,status=200){return Response.json(data,{status,headers:{"cache-control":"no-store, private","x-mmd-payment-authority":"payments-worker","x-mmd-extension-payment":"v1"}})}
function error(status,code){return json({ok:false,error:code,authority:"payments-worker"},status)}

async function constantTimeEqual(a,b){
  const e=new TextEncoder();
  const [aa,bb]=await Promise.all([crypto.subtle.digest("SHA-256",e.encode(clean(a))),crypto.subtle.digest("SHA-256",e.encode(clean(b)))]);
  const x=new Uint8Array(aa),y=new Uint8Array(bb);let d=0;
  for(let i=0;i<x.length;i++)d|=x[i]^y[i];
  return d===0;
}
async function authed(request,env){
  const direct=clean(request.headers.get("X-Internal-Token"),5000);
  const bearer=clean(request.headers.get("Authorization"),5000).replace(/^Bearer\s+/i,"");
  const candidate=direct||bearer;
  const expected=[clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS,5000),clean(env.AUTH_SERVICE_IMMIGRATE_TO_PAYMENTS,5000)].filter(Boolean);
  if(!candidate||!expected.length)return false;
  for(const secret of expected)if(await constantTimeEqual(candidate,secret))return true;
  return false;
}
function requireEnv(env){
  if(!clean(env.AIRTABLE_API_KEY)||!clean(env.AIRTABLE_BASE_ID))throw Object.assign(new Error("airtable_not_ready"),{status:503});
  if(!clean(env.PAYMENT_CONFIRMATION_SIGNING_SECRET||env.CONFIRM_KEY))throw Object.assign(new Error("payment_signing_not_ready"),{status:503});
  if(!env.PAY_SESSIONS_KV?.put)throw Object.assign(new Error("payment_token_store_not_ready"),{status:503});
}
async function afetch(env,url,init={}){
  const request=new Request(url,{...init,headers:{Authorization:`Bearer ${clean(env.AIRTABLE_API_KEY)}`,"Content-Type":"application/json",...(init.headers||{})}});
  const response=env.AIRTABLE_HTTP?.fetch?await env.AIRTABLE_HTTP.fetch(request):await fetch(request);
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(`airtable_${response.status}`);e.status=response.status;throw e}
  return payload;
}
function table(env){return clean(env.AIRTABLE_TABLE_PAYMENTS||env.AIRTABLE_TABLE_PAYMENTS_ID)||DEFAULT_PAYMENTS}
async function findByRef(env,ref){
  const url=new URL(`${API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table(env))}`);
  url.searchParams.set("maxRecords","2");
  url.searchParams.set("filterByFormula",`{Payment Reference}='${formula(ref)}'`);
  const data=await afetch(env,url.toString());
  const rows=Array.isArray(data.records)?data.records:[];
  if(rows.length>1){const e=new Error("payment_ref_ambiguous");e.status=409;throw e}
  return rows[0]||null;
}
async function writeIntent(env,record,fields){
  if(record?.id){
    const data=await afetch(env,`${API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table(env))}/${encodeURIComponent(record.id)}`,{method:"PATCH",body:JSON.stringify({fields,typecast:false})});
    return {mode:"update",record_id:data.id||record.id};
  }
  const data=await afetch(env,`${API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table(env))}`,{method:"POST",body:JSON.stringify({records:[{fields}],typecast:false})});
  const created=data.records?.[0];
  if(!created?.id){const e=new Error("payment_create_malformed");e.status=502;throw e}
  return {mode:"create",record_id:created.id};
}
function field(fields,id,...names){
  if(fields?.[id]!==undefined)return fields[id];
  for(const name of names)if(fields?.[name]!==undefined)return fields[name];
  return undefined;
}
function normalized(v){return clean(v,120).toLowerCase().replace(/[\s-]+/g,"_")}
function paymentSnapshot(record){
  const f=record?.fields||{};
  return {
    payment_ref:clean(field(f,F.ref,"Payment Reference","payment_ref"),220),
    session_id:clean(field(f,F.sessionId,"session_id","Session ID"),220),
    amount_thb:amount(field(f,F.amount,"Amount","amount_thb")),
    payment_status:normalized(field(f,F.status,"Payment Status","payment_status")),
    verification_status:normalized(field(f,F.verification,"Verification Status","verification_status")),
    stage:normalized(field(f,F.stage,"payment_stage","stage")),
    type:normalized(field(f,F.type,"payment_type")),
    official_verified_at:clean(field(f,F.officialAt,"official_verified_at"),120)||null,
    official_verification_ref:clean(field(f,F.officialRef,"official_verification_ref"),220)||null,
    official_verified_by:clean(field(f,F.officialBy,"official_verified_by"),160)||null,
    official_match_reason:clean(field(f,F.officialReason,"official_match_reason"),500)||null,
  };
}
export function extensionPaymentVerified(snapshot,expected={}){
  if(!snapshot)return false;
  const exactRef=clean(snapshot.payment_ref)===clean(expected.payment_ref);
  const exactSession=clean(snapshot.session_id)===clean(expected.session_id);
  const exactAmount=amount(snapshot.amount_thb)===amount(expected.amount_thb);
  const stage=normalized(snapshot.stage||snapshot.type);
  const stageOk=stage==="extension"&&(!snapshot.type||normalized(snapshot.type)==="extension");
  const paid=new Set(["paid","success","completed"]).has(normalized(snapshot.payment_status));
  const verified=new Set(["verified","official_verified","approved"]).has(normalized(snapshot.verification_status));
  const officialRef=clean(snapshot.official_verification_ref);
  const officialRefOk=!officialRef||officialRef===clean(expected.payment_ref);
  return exactRef&&exactSession&&exactAmount&&stageOk&&paid&&verified&&officialRefOk;
}

async function handleIntent(request,env){
  if(!(await authed(request,env)))return error(401,"service_auth_required");
  requireEnv(env);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object"||Array.isArray(body))return error(400,"invalid_extension_payment_intent");
  const requestId=clean(body.request_id,180);
  const sessionId=clean(body.session_id,220);
  const paymentRef=clean(body.payment_ref,220);
  const price=amount(body.amount_thb??body.amount);
  if(!requestId||!sessionId||!/^pay_ext_[a-f0-9]{24}$/.test(paymentRef)||price==null)return error(400,"invalid_extension_payment_subject");
  const existing=await findByRef(env,paymentRef);
  if(existing){
    const snap=paymentSnapshot(existing);
    if(snap.session_id!==sessionId||snap.amount_thb!==price||normalized(snap.stage||snap.type)!=="extension")return error(409,"extension_payment_ref_conflict");
  }
  const now=new Date().toISOString();
  const note=[
    "schema=mmd_public_session_extension_v1",
    `request_id=${requestId}`,
    `session_id=${sessionId}`,
    "payment_stage=extension",
    body.original_end_at?`original_end_at=${clean(body.original_end_at,120)}`:"",
    body.requested_end_at?`requested_end_at=${clean(body.requested_end_at,120)}`:"",
  ].filter(Boolean).join("; ");
  const fields=compact({
    [F.ref]:paymentRef,
    [F.amount]:price,
    [F.status]:existing?undefined:"Pending",
    [F.method]:existing?undefined:"PromptPay",
    [F.notes]:note,
    [F.intent]:existing?undefined:"Pending Confirmation",
    [F.verification]:existing?undefined:"pending_review",
    [F.createdAt]:existing?undefined:now,
    [F.sessionId]:sessionId,
    [F.stage]:"extension",
    [F.type]:"extension",
  });
  const write=await writeIntent(env,existing,fields);
  const iat=Math.floor(Date.now()/1000),exp=iat+getConfirmTokenTtlSeconds(env);
  const claims={kind:"customer_confirm",role:"customer",session_id:sessionId,payment_ref:paymentRef,payment_type:"extension",iat,exp};
  const secret=clean(env.PAYMENT_CONFIRMATION_SIGNING_SECRET||env.CONFIRM_KEY,5000);
  const token=await signConfirmToken(claims,secret);
  await createConfirmTokenRecord(env,token,claims);
  const web=clean(env.WEB_BASE_URL||"https://mmdbkk.com").replace(/\/+$/,"");
  return json({
    ok:true,authority:"payments-worker",schema:"public_session_extension_payment_v1",
    request_id:requestId,session_id:sessionId,payment_ref:paymentRef,payment_stage:"extension",
    amount_thb:price,customer_payment_url:`${web}/pay/checkout?t=${encodeURIComponent(token)}`,
    payment_write:write,
  });
}
async function handleStatus(request,env){
  if(!(await authed(request,env)))return error(401,"service_auth_required");
  requireEnv(env);
  const body=await request.json().catch(()=>null);
  const paymentRef=clean(body?.payment_ref,220),sessionId=clean(body?.session_id,220),price=amount(body?.amount_thb??body?.amount);
  if(!paymentRef||!sessionId||price==null)return error(400,"invalid_extension_payment_status_subject");
  const record=await findByRef(env,paymentRef);
  if(!record)return json({ok:true,authority:"payments-worker",found:false,verified:false,payment_ref:paymentRef});
  const snapshot=paymentSnapshot(record);
  const exact=snapshot.payment_ref===paymentRef&&snapshot.session_id===sessionId&&snapshot.amount_thb===price&&normalized(snapshot.stage||snapshot.type)==="extension";
  if(!exact)return error(409,"extension_payment_subject_mismatch");
  return json({
    ok:true,authority:"payments-worker",found:true,verified:extensionPaymentVerified(snapshot,{payment_ref:paymentRef,session_id:sessionId,amount_thb:price}),
    payment_ref:paymentRef,payment_stage:"extension",payment_status:snapshot.payment_status,verification_status:snapshot.verification_status,
    official_verified_at:snapshot.official_verified_at,
  });
}

export function isPublicSessionExtensionPaymentPath(input){
  const path=normalizePath(input instanceof URL?input.pathname:new URL(String(input)).pathname);
  return path===PATH_INTENT||path===PATH_STATUS;
}
export async function handlePublicSessionExtensionPayment(request,env){
  const path=normalizePath(new URL(request.url).pathname);
  if(request.method!=="POST")return error(405,"method_not_allowed");
  try{
    if(path===PATH_INTENT)return handleIntent(request,env);
    if(path===PATH_STATUS)return handleStatus(request,env);
    return error(404,"not_found");
  }catch(e){return error(Number(e?.status)||500,clean(e?.message||e||"extension_payment_failed",300))}
}

export const PUBLIC_EXTENSION_PAYMENT_INTERNALS=Object.freeze({paymentSnapshot});
