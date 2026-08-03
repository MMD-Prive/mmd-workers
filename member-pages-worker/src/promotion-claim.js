const CLAIM_PATH = "/v1/internal/promotions/claims/open";

export async function handlePromotionClaim(request, env = {}) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: apiHeaders() });
  if (request.method !== "POST") return response({ ok:false,error:"method_not_allowed" },405);
  const token = bearer(request); if (!token) return response({ ok:false,error:"line_access_token_required" },401);
  const verified = await verifyLineToken(token, env); if (!verified.ok) return response({ ok:false,error:verified.error },verified.status);
  const snapshot = await resolveSnapshot(verified.userId, env); if (!snapshot.ok) return response({ ok:false,error:snapshot.error },snapshot.status);
  if (!env.PROMOTION_WORKER?.fetch) return response({ ok:false,error:"promotion_worker_binding_missing" },503);
  const identityHash = await hmac(verified.userId, env.LINE_ID_HASH_SECRET);
  const client = await request.json().catch(() => ({}));
  const upstream = await env.PROMOTION_WORKER.fetch(new Request("https://promotion-worker.local" + CLAIM_PATH, {
    method:"POST", headers:{ "content-type":"application/json", "x-mmd-service-binding":"member-pages-worker",
      "x-mmd-internal-secret":String(env.INTERNAL_SERVICE_SECRET||""), "x-request-id":request.headers.get("x-request-id")||crypto.randomUUID() },
    body:JSON.stringify({ campaignId:"mmd_6th_anniversary_2026", identityHash, memberId:snapshot.data.memberId,
      clientId:snapshot.data.clientId, snapshot:snapshot.data, source:"verified_line", clientContext:{ promo:safe(client.promo), code:safe(client.code) } }) }));
  const payload = await upstream.json().catch(() => ({ error:"invalid_promotion_response" }));
  return response(upstream.ok ? { ok:true,data:payload.data,resumed:Boolean(payload.resumed) } : { ok:false,error:payload.error||"claim_open_failed" }, upstream.status);
}

export async function verifiedMemberContext(request, env = {}) {
  const token = bearer(request);
  if (!token) return { ok:false,status:401,error:"line_access_token_required" };
  const verified = await verifyLineToken(token, env);
  if (!verified.ok) return verified;
  const snapshot = await resolveSnapshot(verified.userId, env);
  if (!snapshot.ok) return snapshot;
  try {
    return { ok:true,status:200,identityHash:await hmac(verified.userId, env.LINE_ID_HASH_SECRET),snapshot:snapshot.data };
  } catch {
    return { ok:false,status:503,error:"member_identity_hash_unavailable" };
  }
}

export async function verifyLineToken(token, env = {}) {
  const endpoint = String(env.LINE_PROFILE_ENDPOINT || "https://api.line.me/v2/profile");
  let result; try { result = await fetch(endpoint,{headers:{authorization:`Bearer ${token}`,accept:"application/json"}}); }
  catch { return {ok:false,status:502,error:"line_verification_unavailable"}; }
  const body = await result.json().catch(() => ({})); const userId = safe(body.userId);
  if (!result.ok || !/^U[a-f0-9]{32}$/i.test(userId)) return {ok:false,status:401,error:"invalid_or_expired_line_token"};
  return {ok:true,status:200,userId};
}

async function resolveSnapshot(lineUserId, env) {
  if (!env.PROMOTION_MEMBER_STATUS_RESOLVER?.fetch) return {ok:false,status:503,error:"member_status_resolver_missing"};
  const upstream = await env.PROMOTION_MEMBER_STATUS_RESOLVER.fetch(new Request("https://mmd-auth-worker.local/v1/internal/members/by-line",{
    method:"POST",headers:{"content-type":"application/json","x-mmd-service-binding":"member-pages-worker",
      "x-mmd-internal-secret":String(env.INTERNAL_SERVICE_SECRET||"")},body:JSON.stringify({lineUserId})}));
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return {ok:false,status:upstream.status,error:payload.error||"member_snapshot_failed"};
  const data = payload.data || payload;
  if (!Array.isArray(data.membershipHistory)) return {ok:false,status:409,error:"membership_history_required"};
  return {ok:true,data};
}

async function hmac(value, secret) { const raw=String(secret||""); if(raw.length<32) throw new Error("line_id_hash_secret_missing");
  const e=new TextEncoder(); const key=await crypto.subtle.importKey("raw",e.encode(raw),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,e.encode(value))); return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join(""); }
function bearer(request){const value=String(request.headers.get("authorization")||"");return /^Bearer\s+/i.test(value)?value.replace(/^Bearer\s+/i,"").trim():"";}
function safe(value){return String(value||"").trim().slice(0,160);}
function apiHeaders(){return {"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"https://mmdbkk.com","access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"authorization,content-type,x-request-id","vary":"origin"};}
function response(value,status=200){return new Response(JSON.stringify(value),{status,headers:apiHeaders()});}
