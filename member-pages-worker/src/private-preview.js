import { readMemberAppSession } from "./member-app-api.js";

const PREFIX = "/api/member/app/private-preview/";
const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_CLIENTS = "tblVv58TCbwh5j1fS";
const DEFAULT_GRANTS = "MMD — Private Flash Preview Grants";
const DEFAULT_MEDIA = "MMD — Model Media Assets";

export function isPrivatePreviewRequest(input) {
  const path = new URL(input instanceof Request ? input.url : String(input)).pathname.replace(/\/+$/, "");
  return path === `${PREFIX}status` || path === `${PREFIX}consume`;
}

export async function handlePrivatePreview(request, env = {}) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const expected = path === `${PREFIX}status` ? "GET" : "POST";
  if (request.method !== expected) return json({ ok:false, error:{ code:"METHOD_NOT_ALLOWED" } }, 405, { allow:expected });

  const identity = await readMemberAppSession(request, env);
  if (!identity?.lineUserId) return json({ ok:false, error:{ code:"MEMBER_SESSION_REQUIRED" } }, 401);

  const token = path.endsWith("/status")
    ? clean(new URL(request.url).searchParams.get("t"), 4096)
    : clean((await request.json().catch(() => null))?.t, 4096);
  if (!token) return json({ ok:false, error:{ code:"PREVIEW_TOKEN_REQUIRED" } }, 400);

  try {
    const clientId = await resolveClient(env, identity.lineUserId);
    if (!clientId) return json({ ok:false, error:{ code:"CLIENT_IDENTITY_UNRESOLVED" } }, 403);
    const grant = await resolveGrant(env, token, clientId);
    if (!grant.ok) return json({ ok:false, error:{ code:grant.code } }, grant.status);
    const gate = gateStub(env, grant.grantId);

    if (path.endsWith("/status")) {
      const gateState = await gate.fetch("https://private-preview.internal/status");
      if (gateState.status === 410) return json({ ok:false, error:{ code:"PREVIEW_CONSUMED" } }, 410);
      return json({ ok:true, preview:{
        kind:grant.kind,
        durationSec:grant.kind === "private_pic" ? 3 : null,
        viewLimit:1,
        consumeOn:grant.kind === "private_pic" ? "open" : "play_start",
        watermark:grant.watermark,
        expiresAt:grant.expiresAt,
      }});
    }

    const locked = await gate.fetch("https://private-preview.internal/consume", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({ expiresAt:grant.expiresAt }),
    });
    if (!locked.ok) return json({ ok:false, error:{ code:locked.status === 410 ? "PREVIEW_CONSUMED" : "PREVIEW_LOCK_FAILED" } }, locked.status);

    if (!env.MMD_MODEL_ASSETS?.get) return json({ ok:false, error:{ code:"MEDIA_STORAGE_UNAVAILABLE" } }, 503);
    const asset = await readAsset(env, grant.mediaRecordId);
    if (!asset?.key) return json({ ok:false, error:{ code:"PRIVATE_MEDIA_UNAVAILABLE" } }, 404);
    const object = await env.MMD_MODEL_ASSETS.get(asset.key);
    if (!object?.body) return json({ ok:false, error:{ code:"PRIVATE_MEDIA_UNAVAILABLE" } }, 404);

    await markConsumed(env, grant.recordId).catch(() => null);
    const headers = noStoreHeaders({
      "content-type":asset.contentType || (grant.kind === "private_clip" ? "video/mp4" : "image/jpeg"),
      "content-disposition":"inline",
      "x-content-type-options":"nosniff",
      "x-mmd-preview-kind":grant.kind,
      "x-mmd-preview-consumed":"true",
    });
    return new Response(object.body, { status:200, headers });
  } catch {
    return json({ ok:false, error:{ code:"PRIVATE_PREVIEW_UNAVAILABLE" } }, 503);
  }
}

export class PrivatePreviewGate {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/status") {
      const consumed = await this.state.storage.get("consumed");
      return new Response(null, { status:consumed ? 410 : 204, headers:noStoreHeaders() });
    }
    if (url.pathname !== "/consume" || request.method !== "POST") return new Response(null, { status:405 });
    return this.state.storage.transaction(async txn => {
      if (await txn.get("consumed")) return new Response(null, { status:410, headers:noStoreHeaders() });
      const body = await request.json().catch(() => ({}));
      const expiresAt = Date.parse(clean(body.expiresAt, 80));
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return new Response(null, { status:410, headers:noStoreHeaders() });
      await txn.put("consumed", { at:new Date().toISOString() });
      return new Response(null, { status:204, headers:noStoreHeaders() });
    });
  }
}

function gateStub(env, grantId) {
  if (!env.PRIVATE_PREVIEW_GATE?.idFromName) throw new Error("gate_not_configured");
  return env.PRIVATE_PREVIEW_GATE.get(env.PRIVATE_PREVIEW_GATE.idFromName(grantId));
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2,"0")).join("");
}
async function resolveClient(env, lineUserId) {
  const records = await list(env, env.AIRTABLE_TABLE_CLIENTS || DEFAULT_CLIENTS, `{line_user_id}='${formula(lineUserId)}'`, 2);
  return records.length === 1 ? records[0].id : "";
}
async function resolveGrant(env, token, clientId) {
  const hash = await sha256(token);
  const records = await list(env, env.AIRTABLE_TABLE_PRIVATE_FLASH_PREVIEW_GRANTS || DEFAULT_GRANTS, `{preview_token_hash}='${formula(hash)}'`, 2);
  if (records.length !== 1) return { ok:false, status:404, code:"PREVIEW_NOT_FOUND" };
  const record = records[0], f = record.fields || {};
  const clients = links(f.Client || f.client);
  if (!clients.includes(clientId)) return { ok:false, status:403, code:"PREVIEW_CLIENT_MISMATCH" };
  if (word(f.grant_status) !== "active") return { ok:false, status:410, code:"PREVIEW_CONSUMED" };
  const expiresAt = clean(f.expires_at,80);
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) return { ok:false, status:410, code:"PREVIEW_EXPIRED" };
  if (Number(f.view_count || 0) >= Math.max(1,Number(f.view_limit || 1))) return { ok:false, status:410, code:"PREVIEW_CONSUMED" };
  const payload = parse(f.payload_json);
  const kind = ["private_pic","private_clip"].includes(payload.preview_kind) ? payload.preview_kind : "";
  if (!kind) return { ok:false, status:409, code:"PREVIEW_POLICY_MISSING" };
  const mediaRecordId = links(f["Media Asset"] || f.media_asset)[0] || "";
  if (!mediaRecordId) return { ok:false, status:404, code:"PRIVATE_MEDIA_UNAVAILABLE" };
  return { ok:true, recordId:record.id, grantId:clean(f.grant_id,160), kind, expiresAt, watermark:clean(f.watermark_code,120), mediaRecordId };
}
async function readAsset(env, id) {
  const record = await get(env, env.AIRTABLE_TABLE_MODEL_MEDIA || DEFAULT_MEDIA, id);
  const f = record?.fields || {};
  if (word(f.review_status) !== "approved" || f.private_safe !== true) return null;
  return { key:clean(f.private_original_key,1000), contentType:clean(f.file_type,120) };
}
async function markConsumed(env, id) {
  return airtable(env, env.AIRTABLE_TABLE_PRIVATE_FLASH_PREVIEW_GRANTS || DEFAULT_GRANTS, id, {
    method:"PATCH", headers:{ "content-type":"application/json" },
    body:JSON.stringify({ fields:{ grant_status:"consumed", view_count:1, signed_url_status:"consumed" }, typecast:false }),
  });
}
async function list(env, table, filterByFormula, maxRecords) {
  const u=new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  u.searchParams.set("filterByFormula",filterByFormula);u.searchParams.set("maxRecords",String(maxRecords));
  const r=await airtable(env,table,"",{url:u});const p=await r.json();return r.ok&&Array.isArray(p.records)?p.records:[];
}
async function get(env, table, id) {
  const r=await airtable(env,table,id);if(!r.ok)return null;return r.json();
}
async function airtable(env, table, id="", init={}) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("airtable_not_configured");
  const url=init.url||`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}${id?"/"+encodeURIComponent(id):""}`;
  const headers=new Headers(init.headers||{});headers.set("authorization",`Bearer ${env.AIRTABLE_API_KEY}`);headers.set("accept","application/json");
  return (env.AIRTABLE_HTTP?.fetch||fetch)(new Request(url,{...init,headers}));
}
function parse(v){try{return typeof v==="object"&&v?v:JSON.parse(clean(v,20000)||"{}")}catch{return {}}}
function links(v){return Array.isArray(v)?v.map(String):v?[String(v)]:[]}
function formula(v){return String(v||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
function word(v){return clean(v,80).toLowerCase().replace(/[\s-]+/g,"_")}
function clean(v,max=500){return String(v??"").trim().slice(0,max)}
function noStoreHeaders(extra={}){return { "cache-control":"no-store, private, max-age=0", pragma:"no-cache", "referrer-policy":"no-referrer", ...extra }}
function json(body,status=200,extra={}){return Response.json(body,{status,headers:noStoreHeaders(extra)})}
