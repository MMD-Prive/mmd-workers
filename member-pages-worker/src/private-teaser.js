import { readMemberAppSession } from "./member-app-api.js";
import { readEntitlementSnapshot } from "../../auth-worker/src/my-mmd-runtime-index.js";
import { resolveModelSalesOffer } from "../../shared/model-sales-control-v1.mjs";
import { assertPrivateObject } from "../../shared/private-media.mjs";

const PREFIX = "/api/member/app/private-teaser/";
const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_CLIENTS = "tblVv58TCbwh5j1fS";
const DEFAULT_MEDIA = "MMD — Model Media Assets";
const DEFAULT_RULES = "MMD — Model Offer Rules";
const DEFAULT_GRANTS = "MMD — Private Flash Preview Grants";
const DEFAULT_MODELS_TABLE = "tblI4B0bI446vp9GX";
const MODELS_WORKING_NAME_FIELD = "fldShiT60bmCxFxRu";
const TEASER_GRANT_TTL_MS = 15 * 60 * 1000;
const MAX_TEASER_ASSETS_PER_KIND = 5;

export function isPrivateTeaserRequest(input) {
  const path = new URL(input instanceof Request ? input.url : String(input)).pathname.replace(/\/+$/, "");
  return path === `${PREFIX}availability` || path === `${PREFIX}grant`;
}

// This is deliberately a verified-member API, not a public catalogue API.
// It returns counts only; no asset ids, storage identifiers, or thumbnails.
export async function handlePrivateTeaser(request, env = {}) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (!isPrivateTeaserRequest(request)) return json({ ok:false, error:{ code:"NOT_FOUND" } }, 404);
  const expected = path.endsWith("/availability") ? "GET" : "POST";
  if (request.method !== expected) return json({ ok:false, error:{ code:"METHOD_NOT_ALLOWED" } }, 405, { allow:expected });
  if (expected === "POST" && (!isFirstParty(request) || !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || ""))) {
    return json({ ok:false, error:{ code:"ORIGIN_OR_JSON_REQUIRED" } }, 403);
  }

  const identity = await readMemberAppSession(request, env);
  if (!identity?.lineUserId) return json({ ok:false, error:{ code:"MEMBER_SESSION_REQUIRED" } }, 401);

  const input = expected === "GET"
    ? Object.fromEntries(new URL(request.url).searchParams)
    : await request.json().catch(() => null);
  const suppliedModelId = recordId(input?.model_id || input?.model_record_id);
  const modelSlug = publicSlug(input?.model_slug || input?.model);
  const workLane = publicWorkLane(input?.work_lane || input?.service_lane || input?.service_type);
  if (!suppliedModelId && !modelSlug) return json({ ok:false, error:{ code:"MODEL_REQUIRED" } }, 400);

  try {
    // A customer-facing page has a safe display slug, never an Airtable record id.
    const modelId = suppliedModelId || await resolvePublicModelSlug(env, modelSlug);
    if (!modelId) return json({ ok:true, availability:{ eligible:false, reason:"MODEL_UNAVAILABLE" } });
    const context = await resolveTeaserContext(env, identity.lineUserId, modelId, workLane);
    if (!context.ok) return json({ ok:true, availability:{ eligible:false, reason:context.reason } });
    const kind = previewKind(input?.preview_kind || input?.kind);
    const assets = await eligibleAssets(env, modelId, kind);
    if (expected === "GET") {
      const counts = countByKind(assets);
      return json({
        ok:true,
        availability:{
          eligible: counts.private_pic + counts.private_clip > 0,
          pic_count: counts.private_pic,
          clip_count: counts.private_clip,
          // Presentation must never use this as entitlement or price evidence.
          sales_rule_version: context.offer.rule_version,
        },
      });
    }

    if (!kind) return json({ ok:false, error:{ code:"PREVIEW_KIND_REQUIRED" } }, 400);
    const selected = assets.find((asset) => asset.kind === kind);
    if (!selected) return json({ ok:true, grant:null, availability:{ eligible:false, reason:"NO_APPROVED_TEASER" } });
    const grant = await createTeaserGrant(env, {
      clientId:context.clientId,
      modelId,
      asset:selected,
      workLane,
    });
    return json({ ok:true, grant });
  } catch (error) {
    const status = Number(error?.status || 503);
    const code = clean(error?.code || "PRIVATE_TEASER_UNAVAILABLE", 80).toUpperCase();
    return json({ ok:false, error:{ code } }, Number.isInteger(status) && status >= 400 && status < 600 ? status : 503);
  }
}

async function resolveTeaserContext(env, lineUserId, modelId, workLane) {
  const clientId = await resolveClient(env, lineUserId);
  if (!clientId) return { ok:false, reason:"CLIENT_IDENTITY_UNRESOLVED" };
  const entitlement = await readEntitlementSnapshot(env, { line_user_id:lineUserId });
  if (entitlement?.source_status !== "verified" || entitlement?.fail_closed !== true || entitlement?.member_blocked === true) {
    return { ok:false, reason:"ENTITLEMENT_UNAVAILABLE" };
  }
  const ruleFilter = `FIND('${formula(modelId)}',ARRAYJOIN({Model}))`;
  const rules = await list(env, env.AIRTABLE_TABLE_MODEL_OFFER_RULES_ID || env.AIRTABLE_TABLE_MODEL_OFFER_RULES || DEFAULT_RULES, ruleFilter, 100);
  const relevant = rules.filter((record) => links(record?.fields?.Model || record?.fields?.model).includes(modelId));
  // No Model Offer Rule means no automated Teaser. Legacy visibility is not a grant.
  if (!relevant.length) return { ok:false, reason:"MODEL_OFFER_NOT_CONFIGURED" };
  const offer = resolveModelSalesOffer({
    model_id:modelId,
    client_id:clientId,
    requested_at:new Date().toISOString(),
    work_lane:workLane,
    entitlement_snapshot:entitlement,
    rules:relevant,
  });
  if (offer?.sellable !== true || offer?.visibility === "off" || offer?.requires_per_approval === true) {
    return { ok:false, reason:"MODEL_OFFER_NOT_ELIGIBLE" };
  }
  return { ok:true, clientId, offer };
}

async function eligibleAssets(env, modelId, requestedKind = "") {
  const filterByFormula = `FIND('${formula(modelId)}',ARRAYJOIN({Model}))`;
  const records = await list(env, env.AIRTABLE_TABLE_MODEL_MEDIA_ASSETS || env.AIRTABLE_TABLE_MODEL_MEDIA || DEFAULT_MEDIA, filterByFormula, 100);
  const output = [];
  for (const record of records) {
    const f = record?.fields || {};
    if (f.review_status !== "approved" || f.teaser_safe !== true || !["flash_preview", "private_gallery"].includes(f.media_type)) continue;
    const kind = f.file_type === "video/mp4" ? "private_clip" : /^image\/(?:jpeg|png|webp)$/.test(String(f.file_type || "")) ? "private_pic" : "";
    if (!kind || (requestedKind && requestedKind !== kind)) continue;
    if (output.filter((entry) => entry.kind === kind).length >= MAX_TEASER_ASSETS_PER_KIND) continue;
    try {
      const verified = await assertPrivateObject(env, record, false, kind);
      output.push({ recordId:record.id, kind, sha256:verified.sha256 });
    } catch {
      // A stale/modified object never becomes an availability signal.
    }
  }
  return output;
}

async function createTeaserGrant(env, input) {
  const token = base64Url(`${crypto.randomUUID()}:${Date.now()}`);
  const tokenHash = await sha256(token);
  const grantId = `teaser_grant_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + TEASER_GRANT_TTL_MS).toISOString();
  const fields = grantFields(env);
  const record = await create(env, env.AIRTABLE_TABLE_PRIVATE_FLASH_PREVIEW_GRANTS || DEFAULT_GRANTS, {
    [fields.grantId]:grantId,
    [fields.client]:[input.clientId],
    [fields.model]:[input.modelId],
    [fields.session]:[],
    [fields.payment]:[],
    [fields.mediaAsset]:[input.asset.recordId],
    [fields.grantStatus]:"active",
    [fields.requiredGate]:"verified_prebooking_eligibility",
    [fields.depositVerified]:false,
    [fields.officialVerificationRef]:"",
    [fields.durationSec]:input.asset.kind === "private_pic" ? 3 : 0,
    [fields.viewLimit]:1,
    [fields.viewCount]:0,
    [fields.previewTokenHash]:tokenHash,
    [fields.signedUrlStatus]:"not_issued",
    [fields.expiresAt]:expiresAt,
    [fields.watermarkCode]:grantId.slice(-8),
    [fields.authorizedBy]:"member-pages-worker:private-teaser-v1",
    [fields.authorizedAt]:new Date().toISOString(),
    [fields.grantNote]:"verified pre-booking teaser",
    [fields.payloadJson]:JSON.stringify({
      access_lane:"private_teaser",
      authorization_basis:"verified_prebooking_eligibility",
      preview_kind:input.asset.kind,
      consume_on:input.asset.kind === "private_pic" ? "open" : "play_start",
      work_lane:input.workLane,
      token_storage:"sha256_hash_only",
      media_sha256:input.asset.sha256,
    }),
  });
  if (!record?.id) throw failure("TEASER_GRANT_WRITE_FAILED", 503);
  return {
    status:"active",
    expires_at:expiresAt,
    preview_kind:input.asset.kind,
    duration_sec:input.asset.kind === "private_pic" ? 3 : null,
    view_limit:1,
    consume_on:input.asset.kind === "private_pic" ? "open" : "play_start",
    viewer_url:`/my-mmd/private-preview/view#t=${encodeURIComponent(token)}`,
  };
}

function grantFields(env) {
  return {
    grantId:env.AT_FLASH_GRANTS__GRANT_ID || "grant_id", client:env.AT_FLASH_GRANTS__CLIENT || "Client", model:env.AT_FLASH_GRANTS__MODEL || "Model",
    session:env.AT_FLASH_GRANTS__SESSION || "Session", payment:env.AT_FLASH_GRANTS__PAYMENT || "Payment", mediaAsset:env.AT_FLASH_GRANTS__MEDIA_ASSET || "Media Asset",
    grantStatus:env.AT_FLASH_GRANTS__GRANT_STATUS || "grant_status", requiredGate:env.AT_FLASH_GRANTS__REQUIRED_GATE || "required_gate",
    depositVerified:env.AT_FLASH_GRANTS__DEPOSIT_VERIFIED || "deposit_verified", officialVerificationRef:env.AT_FLASH_GRANTS__OFFICIAL_VERIFICATION_REF || "official_verification_ref",
    durationSec:env.AT_FLASH_GRANTS__DURATION_SEC || "duration_sec", viewLimit:env.AT_FLASH_GRANTS__VIEW_LIMIT || "view_limit", viewCount:env.AT_FLASH_GRANTS__VIEW_COUNT || "view_count",
    previewTokenHash:env.AT_FLASH_GRANTS__PREVIEW_TOKEN_HASH || "preview_token_hash", signedUrlStatus:env.AT_FLASH_GRANTS__SIGNED_URL_STATUS || "signed_url_status",
    expiresAt:env.AT_FLASH_GRANTS__EXPIRES_AT || "expires_at", watermarkCode:env.AT_FLASH_GRANTS__WATERMARK_CODE || "watermark_code",
    authorizedBy:env.AT_FLASH_GRANTS__AUTHORIZED_BY || "authorized_by", authorizedAt:env.AT_FLASH_GRANTS__AUTHORIZED_AT || "authorized_at",
    grantNote:env.AT_FLASH_GRANTS__GRANT_NOTE || "grant_note", payloadJson:env.AT_FLASH_GRANTS__PAYLOAD_JSON || "payload_json",
  };
}

async function resolveClient(env, lineUserId) {
  const records = await list(env, env.AIRTABLE_TABLE_CLIENTS || DEFAULT_CLIENTS, `{line_user_id}='${formula(lineUserId)}'`, 2);
  const f = records[0]?.fields || {};
  if (records.length !== 1 || f.blocked === true || [f.status,f.client_status,f.member_status].some((value) => /^(blocked|suspended|revoked)$/i.test(String(value || "")))) return "";
  return records[0].id;
}
async function resolvePublicModelSlug(env, slug) {
  if (!slug) return "";
  const table = env.AIRTABLE_TABLE_MODELS || DEFAULT_MODELS_TABLE;
  let offset = "", seen = 0, match = "";
  do {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100"); url.searchParams.set("returnFieldsByFieldId", "true"); url.searchParams.append("fields[]", MODELS_WORKING_NAME_FIELD);
    if (offset) url.searchParams.set("offset", offset);
    const response = await airtable(env, table, "", { url });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.records)) throw failure("TEASER_REGISTRY_UNAVAILABLE", 503);
    seen += payload.records.length;
    for (const record of payload.records) {
      if (publicSlug(record?.fields?.[MODELS_WORKING_NAME_FIELD]) !== slug) continue;
      if (match && match !== record.id) return ""; // display name ambiguity fails closed
      match = record.id;
    }
    offset = clean(payload.offset, 160);
  } while (offset && seen < 500);
  return recordId(match);
}
async function list(env, table, filterByFormula, maxRecords) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);
  url.searchParams.set("maxRecords", String(maxRecords));
  const response = await airtable(env, table, "", { url });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.records)) throw failure("TEASER_REGISTRY_UNAVAILABLE", 503);
  return payload.records;
}
async function create(env, table, fields) {
  const response = await airtable(env, table, "", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ fields, typecast:false }) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw failure("TEASER_GRANT_WRITE_FAILED", 503);
  return payload;
}
async function airtable(env, table, id = "", init = {}) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw failure("TEASER_REGISTRY_UNAVAILABLE", 503);
  const url = init.url || new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}${id ? `/${encodeURIComponent(id)}` : ""}`);
  const headers = new Headers(init.headers || {}); headers.set("authorization", `Bearer ${env.AIRTABLE_API_KEY}`); headers.set("accept", "application/json");
  return (env.AIRTABLE_HTTP?.fetch?.bind(env.AIRTABLE_HTTP) || fetch)(new Request(url, { ...init, headers }));
}
function isFirstParty(request) { const origin = request.headers.get("origin"); return origin === new URL(request.url).origin && ["https://mmdbkk.com", "https://www.mmdbkk.com"].includes(origin); }
function recordId(value) { const id = clean(value, 100); return /^rec[a-zA-Z0-9]+$/.test(id) ? id : ""; }
function publicSlug(value) { return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100); }
function publicWorkLane(value) { return clean(value, 80).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "companion"; }
function previewKind(value) { const token = clean(value, 40).toLowerCase().replace(/[\s-]+/g, "_"); return ["private_pic", "image"].includes(token) ? "private_pic" : ["private_clip", "video", "clip"].includes(token) ? "private_clip" : ""; }
function countByKind(items) { return { private_pic:items.filter((item) => item.kind === "private_pic").length, private_clip:items.filter((item) => item.kind === "private_clip").length }; }
function links(value) { return Array.isArray(value) ? value.map(String) : value ? [String(value)] : []; }
function formula(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function clean(value, max = 500) { return String(value ?? "").trim().slice(0, max); }
function failure(code, status) { return Object.assign(new Error(code), { code, status }); }
function base64Url(value) { return btoa(String(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
async function sha256(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function noStore(extra = {}) { return { "cache-control":"no-store, private, max-age=0", pragma:"no-cache", "referrer-policy":"no-referrer", ...extra }; }
function json(body, status = 200, extra = {}) { return Response.json(body, { status, headers:noStore(extra) }); }
