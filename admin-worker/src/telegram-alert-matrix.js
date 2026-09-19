export const TELEGRAM_ALERT_MATRIX_VERSION = "mmd_telegram_alert_matrix_v1";
export const TELEGRAM_ALERT_MATRIX = Object.freeze({
  payment_match_uncertain:{lane:"payments",severity:"warning",dedupe_window_seconds:900},
  membership_review_required:{lane:"membership",severity:"warning",dedupe_window_seconds:900},
  identity_client_verification_failed:{lane:"identity",severity:"warning",dedupe_window_seconds:900},
  model_confirmation_overdue:{lane:"jobs",severity:"warning",dedupe_window_seconds:900},
  job_start_missing_confirmations:{lane:"jobs",severity:"critical",dedupe_window_seconds:900},
  complaint_dispute_opened:{lane:"care",severity:"critical",dedupe_window_seconds:900},
  payout_ready:{lane:"payout",severity:"info",dedupe_window_seconds:1800},
  auth_system_degraded:{lane:"system",severity:"critical",dedupe_window_seconds:900},
});
const clean=(v,n=500)=>String(v??"").trim().slice(0,n);
function bindingReady(env={}){return Boolean(env.TELEGRAM_WORKER&&typeof env.TELEGRAM_WORKER.fetch==="function");}
function endpoint(env={}){const raw=clean(env.TELEGRAM_INTERNAL_SEND_URL||env.TELEGRAM_URL||env.TELEGRAM_WORKER_BASE,500);if(!raw)return"";try{const u=new URL(raw);if(u.pathname==="/"||!u.pathname)u.pathname="/telegram/internal/send";return u.toString();}catch{return"";}}
export function telegramAlertDiagnostic(env={}){
  const token=clean(env.AUTH_SERVICE_ADMIN_TO_TELEGRAM||env.AUTH_SERVICE_LINE_TO_TELEGRAM||env.TELEGRAM_INTERNAL_TOKEN||env.INTERNAL_API_TOKEN,1000), chat=clean(env.HYPE_CHAT_ID||env.TELEGRAM_OPS_CHAT_ID,100), thread=clean(env.HYPE_THREAD_ID||env.TELEGRAM_OPS_THREAD_ID,100), transport=bindingReady(env)?"service_binding":endpoint(env)?"https_fallback":"missing";
  const missing=[];if(transport==="missing")missing.push("transport");if(!token)missing.push("service_credential");if(!chat)missing.push("chat_route");if(!thread)missing.push("thread_route");
  return{version:TELEGRAM_ALERT_MATRIX_VERSION,state:missing.length===0?"configured":missing.length<=2?"partial":"degraded",configured:missing.length===0,transport,missing,events:Object.keys(TELEGRAM_ALERT_MATRIX)};
}
export async function sendCanonicalTelegramAlert(env={},input={}){
  const event=clean(input.event,80).toLowerCase(), spec=TELEGRAM_ALERT_MATRIX[event];if(!spec)return{ok:false,skipped:true,reason:"unknown_alert_event"};
  const diagnostic=telegramAlertDiagnostic(env);if(!diagnostic.configured)return{ok:false,skipped:true,reason:"telegram_config_missing",diagnostic};
  const token=clean(env.AUTH_SERVICE_ADMIN_TO_TELEGRAM||env.AUTH_SERVICE_LINE_TO_TELEGRAM||env.TELEGRAM_INTERNAL_TOKEN||env.INTERNAL_API_TOKEN,1000), text=clean(input.text,3500), idempotency_key=clean(input.idempotency_key||`${event}:${input.reference_id||input.session_id||"unknown"}`,240);if(!token||!text)return{ok:false,skipped:true,reason:"telegram_payload_incomplete"};
  const body={flow:`mmd_ops_${spec.lane}`,chat_id:clean(env.HYPE_CHAT_ID||env.TELEGRAM_OPS_CHAT_ID,100),message_thread_id:Number(clean(env.HYPE_THREAD_ID||env.TELEGRAM_OPS_THREAD_ID,20))||undefined,text,idempotency_key,metadata:{event,severity:spec.severity,authority:"notification_only",matrix_version:TELEGRAM_ALERT_MATRIX_VERSION}};
  const req=new Request(bindingReady(env)?"https://telegram-worker/telegram/internal/send":endpoint(env),{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json",accept:"application/json"},body:JSON.stringify(body)});
  try{const r=bindingReady(env)?await env.TELEGRAM_WORKER.fetch(req):await fetch(req);const p=await r.json().catch(()=>null);return{ok:r.ok&&p?.ok!==false,status:r.status,event,lane:spec.lane,transport:diagnostic.transport,delivery:r.ok?"accepted":"failed"};}catch{return{ok:false,event,lane:spec.lane,transport:diagnostic.transport,delivery:"failed",reason:"telegram_transport_failed"};}
}
