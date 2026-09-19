import { resolveCanonicalClientForLine } from "./member-app-client-history.js";

export const MEMBER_TELEGRAM_BIND_PATH = "/member/api/liff/telegram-bind";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const BINDS_TABLE_DEFAULT = "tblnoEmhS3EpdtV6E";
const BOT_USERNAME_DEFAULT = "mmdprivebot";
const SESSION_TTL_GUARD_MS = 1;
const BIND_TTL_MS = 15 * 60 * 1000;

export function isMemberTelegramBindPath(url) {
  return Boolean(url && normalizePath(url.pathname) === MEMBER_TELEGRAM_BIND_PATH);
}

export async function handleMemberTelegramBind(request, env = {}) {
  if (request.method !== "POST") return response({ ok:false,error:"method_not_allowed" },405);
  if (!sameOrigin(request)) return response({ ok:false,error:"origin_not_allowed" },403);
  if (new URL(request.url).search) return response({ ok:false,error:"browser_authority_rejected" },400);

  const session = await readVerifiedLiffSession(request, env);
  if (!session.ok) return response({ ok:false,error:session.error },session.status);
  const lineUserId = clean(session.data.line_user_id,80);
  if (!/^U[0-9a-f]{32}$/i.test(lineUserId)) return response({ ok:false,error:"line_identity_invalid" },401);

  const client = await resolveCanonicalClientForLine(env,lineUserId).catch(()=>null);
  if (!client?.id || !client?.fields) return response({ ok:false,error:"client_not_found" },404);
  const status = normalizeStatus(client.fields.telegram_verification_status);
  const existingId = clean(client.fields.telegram_user_id,40);
  if (status === "verified" && /^\d{5,20}$/.test(existingId)) {
    return response({
      ok:true,state:"connected",telegram_connected:true,
      telegram_username:safeUsername(client.fields.telegram_username)||null,
      connect_url:null,expires_at:null,
    },200);
  }
  if (status === "conflict") return response({ok:false,error:"telegram_binding_conflict"},409);

  const raw=randomToken(24);
  const startArg=`bind_${raw}`;
  const tokenHash=await sha256Hex(startArg);
  const now=new Date();
  const expires=new Date(now.getTime()+BIND_TTL_MS);
  const created=await airtableCreate(env,bindsTable(env),{
    bind_id:`tgb_${crypto.randomUUID().replace(/-/g,"")}`,
    token_hash:tokenHash,
    role:"client",
    Client:[client.id],
    status:"pending",
    created_at:now.toISOString(),
    expires_at:expires.toISOString(),
  });
  if(!created.ok) return response({ok:false,error:"telegram_bind_issue_failed"},503);
  const bot=clean(env.TELEGRAM_BOT_USERNAME||BOT_USERNAME_DEFAULT,80).replace(/^@/,"");
  return response({
    ok:true,state:"connect_required",telegram_connected:false,
    connect_url:`https://t.me/${encodeURIComponent(bot)}?start=${encodeURIComponent(startArg)}`,
    expires_at:expires.toISOString(),
  },200);
}

async function readVerifiedLiffSession(request,env){
  const token=cookieValue(request,SESSION_COOKIE);
  const secret=clean(env.LIFF_SESSION_SECRET,500);
  if(!token||secret.length<32||!env.LIFF_IDENTITY_KV?.get) return {ok:false,status:401,error:"liff_session_required"};
  const hash=await hmacHex(secret,`session:${token}`);
  const session=await env.LIFF_IDENTITY_KV.get(`liff:session:${hash}`,"json").catch(()=>null);
  if(!session||typeof session!=="object"||Number(session.expires_at||0)<Date.now()+SESSION_TTL_GUARD_MS) return {ok:false,status:401,error:"liff_session_invalid"};
  if(session.read_grace_only===true) return {ok:false,status:401,error:"liff_session_superseded"};
  if(!/^U[0-9a-f]{32}$/i.test(clean(session.line_user_id,80))) return {ok:false,status:401,error:"line_identity_invalid"};
  return {ok:true,data:session};
}
async function airtableCreate(env,table,fields){
  const key=clean(env.AIRTABLE_API_KEY,2000),base=clean(env.AIRTABLE_BASE_ID,100);
  if(!key||!base) return {ok:false,status:503};
  const res=await fetch(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`,{
    method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},
    body:JSON.stringify({records:[{fields}],typecast:true}),
  });
  const data=await res.json().catch(()=>({}));
  return res.ok?{ok:true,record:data.records?.[0]||null}:{ok:false,status:res.status};
}
function sameOrigin(request){const origin=clean(request.headers.get("origin"),300);if(!origin)return false;try{return origin===new URL(request.url).origin;}catch{return false;}}
function cookieValue(request,name){for(const p of clean(request.headers.get("cookie"),10000).split(";")){const i=p.indexOf("=");if(i>0&&p.slice(0,i).trim()===name)return p.slice(i+1).trim();}return "";}
async function hmacHex(secret,value){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const d=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function sha256Hex(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(v||"")));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function randomToken(bytes=24){const b=new Uint8Array(bytes);crypto.getRandomValues(b);let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function bindsTable(env){return clean(env.AIRTABLE_TABLE_TELEGRAM_IDENTITY_BINDS||BINDS_TABLE_DEFAULT,180);}
function normalizeStatus(v){return clean(Array.isArray(v)?v[0]:v,80).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");}
function safeUsername(v){const x=clean(v,80).replace(/^@/,"");return /^[A-Za-z0-9_]{3,64}$/.test(x)?x:"";}
function normalizePath(v){const p=String(v||"/").replace(/\/{2,}/g,"/");return p.length>1?p.replace(/\/+$/,""):p;}
function clean(v,max=5000){return String(v==null?"":v).trim().slice(0,max);}
function response(payload,status){return Response.json(payload,{status,headers:{"cache-control":"no-store"}});}
