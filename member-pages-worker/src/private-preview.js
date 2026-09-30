import {
  isSvipPhotoRevealGrantPayload,
  svipPhotoRevealCanServe,
  SVIP_PHOTO_REVEAL_MODE_HEADER,
} from "../../shared/svip-photo-reveal-rollout.mjs";
import { readMemberAppSession } from "./member-app-api.js";
import { assertPrivateObject, privateBucket } from "../../shared/private-media.mjs";
import { privatePreviewPage } from "./private-preview-page.js";

const PREFIX = "/api/member/app/private-preview/";
const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_CLIENTS = "tblVv58TCbwh5j1fS";
const DEFAULT_GRANTS = "MMD — Private Flash Preview Grants";
const DEFAULT_MEDIA = "MMD — Model Media Assets";

export function isPrivatePreviewRequest(input) {
  const path = new URL(input instanceof Request ? input.url : String(input)).pathname.replace(/\/+$/, "");
  return path === `${PREFIX}status` || path === `${PREFIX}consume` || path === `${PREFIX}view` || path === `${PREFIX}resume`;
}

export async function handlePrivatePreview(request, env = {}) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (!isPrivatePreviewRequest(request)) return json({ ok:false, error:{ code:"NOT_FOUND" } }, 404);
  if (path === `${PREFIX}view`) return request.method === "GET" ? privatePreviewPage() : json({ok:false,error:{code:"METHOD_NOT_ALLOWED"}},405);
  const expected = path === `${PREFIX}status` || path === `${PREFIX}resume` ? "GET" : "POST";
  if (request.method !== expected) return json({ ok:false, error:{ code:"METHOD_NOT_ALLOWED" } }, 405, { allow:expected });
  if (expected === "POST" && (request.headers.get("origin") !== new URL(request.url).origin || !["https://mmdbkk.com", "https://www.mmdbkk.com"].includes(new URL(request.url).origin))) return json({ ok:false, error:{code:"ORIGIN_NOT_ALLOWED"}},403);
  if (expected === "POST" && !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) return json({ok:false,error:{code:"JSON_REQUIRED"}},415);

  const identity = await readMemberAppSession(request, env);
  if (!identity?.lineUserId) return json({ ok:false, error:{ code:"MEMBER_SESSION_REQUIRED" } }, 401);

  try {
    const clientId = await resolveClient(env, identity.lineUserId);
    if (!clientId) return json({ ok:false, error:{ code:"CLIENT_IDENTITY_UNRESOLVED" } }, 403);

    if (path.endsWith("/resume")) {
      const grantId = clean(new URL(request.url).searchParams.get("g"), 160);
      if (!/^svip_photo_[0-9a-f-]{36}$/i.test(grantId)) return json({ ok:false, error:{ code:"PREVIEW_RESUME_INVALID" } }, 400);
      const grant = await resolveGrantById(env, grantId, clientId);
      if (!grant.ok) return json({ ok:false, error:{ code:grant.code } }, grant.status);
      if (grant.svipPhotoReveal && !svipPhotoRevealCanServe(request.headers.get(SVIP_PHOTO_REVEAL_MODE_HEADER))) {
        return json({ ok:false, error:{ code:"PREVIEW_DISABLED" } }, 423);
      }
      // The gate owns the entire resume rotation: mint -> Airtable hash write
      // -> active-token commit. Concurrent callers await the same in-flight
      // promise, so no caller can receive a bearer that another caller kills.
      const gate = gateStub(env, grant.recordId);
      const ttlMs = resumeTtlMs(env.PRIVATE_PREVIEW_RESUME_TTL_MS);
      const rotation = await gate.fetch("https://private-preview.internal/resume", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body:JSON.stringify({ grantRecordId:grant.recordId, ttlMs }),
      });
      if (rotation.status === 410) return json({ ok:false, error:{ code:"PREVIEW_CONSUMED" } }, 410);
      if (!rotation.ok) return json({ ok:false, error:{ code:"PREVIEW_LOCK_FAILED" } }, 503);
      const claim = await rotation.json().catch(() => ({}));
      const rawToken = clean(claim.token, 200);
      if (!rawToken || (claim.mode !== "reuse" && claim.mode !== "rotate")) {
        return json({ ok:false, error:{ code:"PREVIEW_LOCK_FAILED" } }, 503);
      }
      const target = new URL(`${PREFIX}view`, request.url);
      target.searchParams.set("g", grant.grantId);
      target.hash = `t=${encodeURIComponent(rawToken)}`;
      return new Response(null, {
        status: 303,
        headers: noStoreHeaders({
          location: target.toString(),
          "x-mmd-private-preview-resume": "one-tap-line-verify-v1",
        }),
      });
    }

    const token = path.endsWith("/status")
      ? clean(new URL(request.url).searchParams.get("t"), 4096)
      : clean((await request.json().catch(() => null))?.t, 4096);
    if (!token) return json({ ok:false, error:{ code:"PREVIEW_TOKEN_REQUIRED" } }, 400);

    const grant = await resolveGrant(env, token, clientId);
    if (!grant.ok) return json({ ok:false, error:{ code:grant.code } }, grant.status);
    if (grant.svipPhotoReveal && !svipPhotoRevealCanServe(request.headers.get(SVIP_PHOTO_REVEAL_MODE_HEADER))) {
      return json({ ok:false, error:{ code:"PREVIEW_DISABLED" } }, 423);
    }
    // Record ID, rather than a mutable display identifier, is the one-use key.
    const gate = gateStub(env, grant.recordId);
    const asset = await readAsset(env, grant.mediaRecordId, grant.kind, grant.modelId, grant.accessLane);

    if (path.endsWith("/status")) {
      const gateState = await gate.fetch("https://private-preview.internal/status");
      if (gateState.status === 410) return json({ ok:false, error:{ code:"PREVIEW_CONSUMED" } }, 410);
      if (gateState.status !== 204) return json({ok:false,error:{code:"PREVIEW_LOCK_FAILED"}},503);
      return json({ ok:true, preview:{
        kind:grant.kind,
        durationSec:grant.kind === "private_pic" ? 3 : null,
        viewLimit:1,
        consumeOn:grant.kind === "private_pic" ? "open" : "play_start",
        watermark:grant.watermark,
        expiresAt:grant.expiresAt,
        accessLane:grant.accessLane,
      }});
    }

    const locked = await gate.fetch("https://private-preview.internal/consume", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({ expiresAt:grant.expiresAt, grantRecordId:grant.recordId, clientId, mediaRecordId:grant.mediaRecordId, kind:grant.kind, mediaSha256:asset.sha256 }),
    });
    if (locked.status !== 204) return json({ ok:false, error:{ code:locked.status === 410 ? "PREVIEW_CONSUMED" : "PREVIEW_LOCK_FAILED" } }, locked.status === 410 ? 410 : 503);

    const object = await privateBucket(env).get(asset.key);
    if (!object?.body) return json({ ok:false, error:{ code:"PRIVATE_MEDIA_UNAVAILABLE" } }, 404);
    if (object.customMetadata?.sha256 !== asset.sha256) return json({ok:false,error:{code:"MEDIA_VERSION_CHANGED"}},409);

    // The durable consumption event is already committed atomically. The
    // canonical grant mirror must also succeed before any bytes leave here.
    await logConsumption(env, grant, clientId, asset.sha256);
    await markConsumed(env, grant.recordId);
    const headers = noStoreHeaders({
      "content-type":asset.contentType || (grant.kind === "private_clip" ? "video/mp4" : "image/jpeg"),
      "content-disposition":"inline",
      "x-content-type-options":"nosniff",
      "x-mmd-preview-kind":grant.kind,
      "x-mmd-preview-consumed":"true",
      "x-frame-options":"DENY",
    });
    return new Response(object.body, { status:200, headers });
  } catch {
    return json({ ok:false, error:{ code:"PRIVATE_PREVIEW_UNAVAILABLE" } }, 503);
  }
}

// Resume bearer rotation is serialized by the gate so that two concurrent
// /resume requests cannot mint competing tokens and invalidate each other.
//
// Bearer rotation protects link freshness only. One-use media access remains
// enforced exclusively by the atomic /consume transaction below.
const RESUME_TTL_DEFAULT_MS = 10_000;
const RESUME_TTL_MIN_MS = 2_000;
const RESUME_TTL_MAX_MS = 120_000;

export function resumeTtlMs(value) {
  const ttl = Number(value);
  if (!Number.isFinite(ttl) || ttl <= 0) return RESUME_TTL_DEFAULT_MS;
  return Math.min(RESUME_TTL_MAX_MS, Math.max(RESUME_TTL_MIN_MS, Math.floor(ttl)));
}

function mintResumeToken() {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

function resumeFailure(code, status = 503) {
  const error = new Error(code);
  error.resumeCode = code;
  error.resumeStatus = status;
  return error;
}

export class PrivatePreviewGate {
  constructor(state, env = {}) {
    this.state = state;
    this.env = env;
    this.rotation = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/status" && request.method === "GET") {
      const consumed = await this.state.storage.get("consumed");
      return new Response(null, { status:consumed ? 410 : 204, headers:noStoreHeaders() });
    }
    if (url.pathname === "/resume" && request.method === "POST") return this.resume(request);
    if (url.pathname !== "/consume" || request.method !== "POST") return new Response(null, { status:405 });

    // Consume semantics are intentionally unchanged. This transaction remains
    // the sole one-use authority for private media.
    const body = await request.json().catch(() => ({}));
    return this.state.storage.transaction(async txn => {
      if (await txn.get("consumed")) return new Response(null, { status:410, headers:noStoreHeaders() });
      const expiresAt = Date.parse(clean(body.expiresAt, 80));
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return new Response(null, { status:410, headers:noStoreHeaders() });
      await txn.put("consumed", {
        at:new Date().toISOString(), outcome:"consumed_before_delivery", grant_record_id:clean(body.grantRecordId,80),
        client_id:clean(body.clientId,80), media_record_id:clean(body.mediaRecordId,80), kind:clean(body.kind,40), media_sha256:clean(body.mediaSha256,64),
      });
      return new Response(null, { status:204, headers:noStoreHeaders() });
    });
  }

  async resume(request) {
    const body = await request.json().catch(() => ({}));
    const grantRecordId = clean(body.grantRecordId, 80);
    if (!/^rec[A-Za-z0-9]+$/.test(grantRecordId)) {
      return Response.json({ ok:false, error:"grant_record_required" }, { status:400, headers:noStoreHeaders() });
    }

    // No await is allowed between this check and assigning this.rotation.
    // That makes the in-flight promise the single owner for this DO instance.
    if (this.rotation) {
      if (this.rotation.grantRecordId !== grantRecordId) {
        return Response.json({ ok:false, error:"rotation_grant_mismatch" }, { status:409, headers:noStoreHeaders() });
      }
      return this.awaitRotation(this.rotation);
    }

    const rotation = {
      grantRecordId,
      ttlMs:resumeTtlMs(body.ttlMs),
      promise:null,
    };
    this.rotation = rotation;
    rotation.promise = this.performResumeRotation(rotation);

    try {
      const result = await rotation.promise;
      return Response.json(result, { headers:noStoreHeaders() });
    } catch (error) {
      return Response.json(
        { ok:false, error:clean(error?.resumeCode || "preview_resume_failed", 120) },
        { status:Number(error?.resumeStatus) || 503, headers:noStoreHeaders() },
      );
    } finally {
      if (this.rotation === rotation) this.rotation = null;
    }
  }

  async awaitRotation(rotation) {
    try {
      const result = await rotation.promise;
      return Response.json(result, { headers:noStoreHeaders() });
    } catch (error) {
      return Response.json(
        { ok:false, error:clean(error?.resumeCode || "preview_resume_failed", 120) },
        { status:Number(error?.resumeStatus) || 503, headers:noStoreHeaders() },
      );
    }
  }

  async performResumeRotation(rotation) {
    if (await this.state.storage.get("consumed")) throw resumeFailure("preview_consumed", 410);

    const active = await this.state.storage.get("active_resume");
    if (active && typeof active.token === "string" && active.token && Number(active.expiresAt) > Date.now()) {
      return { mode:"reuse", token:active.token, expires_at:Number(active.expiresAt) };
    }
    if (active) await this.state.storage.delete("active_resume");

    const rawToken = mintResumeToken();

    // Important ordering invariant:
    // 1) mint only in this DO;
    // 2) persist only the hash to Airtable;
    // 3) commit raw token as active in DO only after Airtable confirms the hash.
    // If the PATCH fails, the promise rejects, no active token is stored, every
    // waiter fails closed, and the next /resume starts a fresh self-healing run.
    try {
      await rotatePreviewToken(this.env, rotation.grantRecordId, rawToken);
    } catch {
      throw resumeFailure("preview_resume_write_failed", 503);
    }

    const expiresAt = Date.now() + rotation.ttlMs;
    try {
      await this.state.storage.transaction(async txn => {
        if (await txn.get("consumed")) throw resumeFailure("preview_consumed", 410);
        await txn.put("active_resume", { token:rawToken, expiresAt });
      });
    } catch (error) {
      if (error?.resumeCode) throw error;
      throw resumeFailure("preview_resume_commit_failed", 503);
    }

    if (typeof this.state.storage.setAlarm === "function") {
      await this.state.storage.setAlarm(expiresAt).catch(() => {});
    }
    return { mode:"rotate", token:rawToken, expires_at:expiresAt };
  }

  async alarm() {
    const active = await this.state.storage.get("active_resume");
    if (!active) return;
    const expiresAt = Number(active.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await this.state.storage.delete("active_resume");
      return;
    }
    if (typeof this.state.storage.setAlarm === "function") {
      await this.state.storage.setAlarm(expiresAt);
    }
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
  const f = records[0]?.fields || {};
  if ([f.status,f.client_status,f.member_status].some(value => /^(blocked|suspended|revoked)$/i.test(String(value || ""))) || f.blocked === true) return "";
  return records.length === 1 ? records[0].id : "";
}
function validateGrantRecord(record, clientId) {
  const f = record?.fields || {};
  const clients = links(f.Client || f.client);
  if (clients.length !== 1 || clients[0] !== clientId) return { ok:false, status:403, code:"PREVIEW_CLIENT_MISMATCH" };
  if (word(f.grant_status) !== "active") return { ok:false, status:410, code:"PREVIEW_CONSUMED" };
  const expiresAt = clean(f.expires_at,80);
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) return { ok:false, status:410, code:"PREVIEW_EXPIRED" };
  if (f.view_limit !== 1 || !Number.isInteger(f.view_count) || f.view_count !== 0) return { ok:false, status:410, code:"PREVIEW_CONSUMED" };
  const payload = parse(f.payload_json);
  const accessLane = payload.access_lane === "private_teaser" ? "private_teaser" : "private_preview";
  const kind = ["private_pic","private_clip"].includes(payload.preview_kind) ? payload.preview_kind : "";
  if (!kind) return { ok:false, status:409, code:"PREVIEW_POLICY_MISSING" };
  const mediaIds = links(f["Media Asset"] || f.media_asset), models = links(f.Model);
  const grantId = clean(f.grant_id,160);
  if (mediaIds.length !== 1 || models.length !== 1 || !grantId) return { ok:false, status:409, code:"PREVIEW_POLICY_MISSING" };
  return {
    ok:true,
    recordId:record.id,
    grantId,
    kind,
    expiresAt,
    watermark:clean(f.watermark_code,120),
    mediaRecordId:mediaIds[0],
    modelId:models[0],
    accessLane,
    svipPhotoReveal:isSvipPhotoRevealGrantPayload(payload),
  };
}
async function resolveGrant(env, token, clientId) {
  const hash = await sha256(token);
  const records = await list(env, env.AIRTABLE_TABLE_PRIVATE_FLASH_PREVIEW_GRANTS || DEFAULT_GRANTS, `{preview_token_hash}='${formula(hash)}'`, 2);
  if (records.length !== 1) return { ok:false, status:404, code:"PREVIEW_NOT_FOUND" };
  return validateGrantRecord(records[0], clientId);
}
async function resolveGrantById(env, grantId, clientId) {
  const records = await list(env, env.AIRTABLE_TABLE_PRIVATE_FLASH_PREVIEW_GRANTS || DEFAULT_GRANTS, `{grant_id}='${formula(grantId)}'`, 2);
  if (records.length !== 1) return { ok:false, status:404, code:"PREVIEW_NOT_FOUND" };
  return validateGrantRecord(records[0], clientId);
}
async function rotatePreviewToken(env, recordId, rawToken) {
  const hash = await sha256(rawToken);
  const timeoutMs = Math.min(15_000, Math.max(1_000, Number(env.AIRTABLE_REQUEST_TIMEOUT_MS) || 10_000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await airtable(env, env.AIRTABLE_TABLE_PRIVATE_FLASH_PREVIEW_GRANTS || DEFAULT_GRANTS, recordId, {
      method:"PATCH",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({ fields:{ preview_token_hash:hash, signed_url_status:"not_issued" }, typecast:false }),
      signal:controller.signal,
    });
    if (!response.ok) throw new Error("preview_resume_write_failed");
    const result = await response.json();
    if (result.id !== recordId || result.fields?.preview_token_hash !== hash) throw new Error("preview_resume_write_unconfirmed");
  } finally {
    clearTimeout(timer);
  }
}
async function readAsset(env, id, kind, modelId, accessLane = "private_preview") {
  const record = await get(env, env.AIRTABLE_TABLE_MODEL_MEDIA_ASSETS || env.AIRTABLE_TABLE_MODEL_MEDIA || DEFAULT_MEDIA, id);
  const f = record?.fields || {};
  if (links(f.Model).length !== 1 || f.Model[0] !== modelId) throw new Error("media_model_mismatch");
  if (accessLane === "private_teaser") {
    if (f.review_status !== "approved" || f.teaser_safe !== true) throw new Error("teaser_media_not_approved");
    return assertPrivateObject(env, record, false, kind);
  }
  return assertPrivateObject(env, record, true, kind);
}
async function markConsumed(env, id) {
  const response = await airtable(env, env.AIRTABLE_TABLE_PRIVATE_FLASH_PREVIEW_GRANTS || DEFAULT_GRANTS, id, {
    method:"PATCH", headers:{ "content-type":"application/json" },
    body:JSON.stringify({ fields:{ grant_status:"consumed", view_count:1, signed_url_status:"consumed" }, typecast:false }),
  });
  if (!response.ok) throw new Error("consumption_log_failed");
  const result = await response.json();
  if (result.id !== id || result.fields?.grant_status !== "consumed" || result.fields?.view_count !== 1) throw new Error("consumption_log_unconfirmed");
}
async function logConsumption(env, grant, clientId, mediaSha256) {
  const id = `consumption_${crypto.randomUUID()}`;
  const response = await airtable(env, env.AIRTABLE_TABLE_PRIVATE_MEDIA_CONSUMPTION_LOG || "tblcjjCW0pXvlhNQQ", "", {
    method:"POST", headers:{"content-type":"application/json"},
    body:JSON.stringify({fields:{consumption_id:id,Grant:[grant.recordId],"Media Asset":[grant.mediaRecordId],Client:[clientId],Model:[grant.modelId],media_kind:grant.kind,outcome:"consumed",consumed_at:new Date().toISOString(),duration_sec:grant.kind === "private_pic" ? 3 : 0,reason:"consumed_before_delivery",payload_json:JSON.stringify({media_sha256:mediaSha256,gate:"durable_one_use_v1",access_lane:grant.accessLane})},typecast:false}),
  });
  if (!response.ok) throw new Error("consumption_audit_failed");
  const result = await response.json();
  if (!result.id || result.fields?.consumption_id !== id || result.fields?.outcome !== "consumed") throw new Error("consumption_audit_unconfirmed");
}
async function list(env, table, filterByFormula, maxRecords) {
  const u=new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  u.searchParams.set("filterByFormula",filterByFormula);u.searchParams.set("maxRecords",String(maxRecords));
  const r=await airtable(env,table,"",{url:u});const p=await r.json();if(!r.ok||!Array.isArray(p.records))throw new Error("registry_unavailable");return p.records;
}
async function get(env, table, id) {
  const r=await airtable(env,table,id);if(!r.ok)throw new Error("registry_unavailable");return r.json();
}
async function airtable(env, table, id="", init={}) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("airtable_not_configured");
  const url=init.url||`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}${id?"/"+encodeURIComponent(id):""}`;
  const headers=new Headers(init.headers||{});headers.set("authorization",`Bearer ${env.AIRTABLE_API_KEY}`);headers.set("accept","application/json");
  return (env.AIRTABLE_HTTP?.fetch?.bind(env.AIRTABLE_HTTP)||fetch)(new Request(url,{...init,headers}));
}
function parse(v){try{return typeof v==="object"&&v?v:JSON.parse(clean(v,20000)||"{}")}catch{return {}}}
function links(v){return Array.isArray(v)?v.map(String):v?[String(v)]:[]}
function formula(v){return String(v||"").replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
function word(v){return clean(v,80).toLowerCase().replace(/[\s-]+/g,"_")}
function clean(v,max=500){return String(v??"").trim().slice(0,max)}
function noStoreHeaders(extra={}){return { "cache-control":"no-store, private, max-age=0", pragma:"no-cache", "referrer-policy":"no-referrer", ...extra }}
function json(body,status=200,extra={}){return Response.json(body,{status,headers:noStoreHeaders(extra)})}
