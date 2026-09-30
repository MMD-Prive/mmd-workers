import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";
import { resolveExactModel, projectKenjiSafeModel } from "./kenji-model-access-rpc.js";
import { handleClientIntelligenceRequest } from "./client-intelligence-endpoint.js";
import { listApprovedPrivatePhotos } from "../../shared/private-media.mjs";

export const HYPE_SVIP_PHOTO_REVEAL_PATH = "/v1/internal/hype/svip-photo-reveal";
export const HYPE_SVIP_PHOTO_REVEAL_POLICY = "svip_exact_customer_photo_reveal_v1_20260930";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_CLIENTS_TABLE = "tblVv58TCbwh5j1fS";
const DEFAULT_ENTITLEMENTS_TABLE = "Member Entitlements";
const DEFAULT_KEYWORD_PROFILES_TABLE = "MMD — Model Keyword Profiles";
const DEFAULT_GRANTS_TABLE = "MMD — Private Flash Preview Grants";

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function token(value) {
  return clean(value, 160).toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function list(value, max = 20) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return [...new Set(values.map((item) => clean(item?.name || item, 120)).filter(Boolean))].slice(0, max);
}

function linked(value) {
  return (Array.isArray(value) ? value : value ? [value] : []).map((item) => clean(item?.id || item, 100)).filter(Boolean);
}

function formula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function baseId(env = {}) {
  return clean(env.AIRTABLE_BASE_ID, 200);
}

function apiKey(env = {}) {
  return clean(env.AIRTABLE_API_KEY, 1200);
}

async function airtableList(env, table, filterByFormula, maxRecords = 20) {
  if (!apiKey(env) || !baseId(env) || !table) throw new Error("airtable_config_missing");
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", String(Math.min(100, Math.max(1, maxRecords))));
  url.searchParams.set("maxRecords", String(Math.min(100, Math.max(1, maxRecords))));
  if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);
  const response = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${apiKey(env)}`, accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw new Error("airtable_read_failed");
  return payload.records;
}

async function airtableCreate(env, table, fields) {
  if (!apiKey(env) || !baseId(env) || !table) throw new Error("airtable_config_missing");
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey(env)}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ fields, typecast: false }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error("airtable_write_failed");
  return payload;
}

function bearer(request) {
  const match = clean(request?.headers?.get("authorization"), 2000).match(/^Bearer\s+(.+)$/i);
  return clean(match?.[1], 1200);
}

function authorizedServiceRequest(request, env = {}) {
  let hostname = "";
  try { hostname = new URL(request.url).hostname; } catch { return false; }
  return hostname === "admin-worker.local"
    && clean(request.headers.get("x-mmd-internal-call")).toLowerCase() === "true"
    && clean(request.headers.get("x-mmd-service-binding")) === "member-dashboard-chat-worker"
    && Boolean(clean(env.INTERNAL_TOKEN, 1200))
    && bearer(request) === clean(env.INTERNAL_TOKEN, 1200);
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store, private",
      "x-mmd-hype-photo-reveal": HYPE_SVIP_PHOTO_REVEAL_POLICY,
    },
  });
}

function clientRestriction(fields = {}) {
  if (fields.blocked === true) return "client_blocked";
  const lifecycle = [fields.status, fields.client_status, fields.member_status, fields.access_status]
    .map(token)
    .filter(Boolean);
  if (lifecycle.some((value) => ["blocked", "suspended", "revoked"].includes(value))) return "client_blocked";

  const explicitNames = [
    "no_sell", "no-sell", "do_not_sell", "do_not_offer", "sales_blocked",
    "caution", "caution_flag", "risk_flag", "risk_status", "sales_status",
  ];
  for (const name of explicitNames) {
    const value = fields[name];
    if (value === true) return name.includes("caution") || name.includes("risk") ? "client_caution" : "client_no_sell";
    const normalized = token(value);
    if (["block", "blocked", "no_sell", "do_not_sell", "stop", "caution", "warning", "risk", "high_risk"].includes(normalized)) {
      return name.includes("caution") || name.includes("risk") ? "client_caution" : "client_no_sell";
    }
  }

  for (const [name, value] of Object.entries(fields)) {
    if (!/(?:no.?sell|do.?not.?sell|caution|risk|sales.?block)/i.test(name)) continue;
    if (value === true) return /caution|risk/i.test(name) ? "client_caution" : "client_no_sell";
    const normalized = token(value);
    if (normalized && !["false", "none", "clear", "ok", "normal", "0"].includes(normalized)) {
      return /caution|risk/i.test(name) ? "client_caution" : "client_no_sell";
    }
  }
  return "";
}

function modelRestriction(fields = {}) {
  const status = token(fields.status || fields.model_status);
  if (status && status !== "active") return "model_not_active";
  for (const name of ["no_sell", "do_not_sell", "sales_blocked", "caution", "caution_flag", "risk_flag"]) {
    const value = fields[name];
    if (value === true) return /caution|risk/.test(name) ? "model_caution" : "model_no_sell";
    const normalized = token(value);
    if (["block", "blocked", "no_sell", "do_not_sell", "stop", "caution", "warning", "risk", "high_risk"].includes(normalized)) {
      return /caution|risk/.test(name) ? "model_caution" : "model_no_sell";
    }
  }
  return "";
}

export function evaluateSvipPhotoProfile(profile = {}) {
  const fields = profile?.fields || profile || {};
  if (token(fields.status) !== "active") return { ok: false, reason: "photo_profile_not_active" };
  const scopes = list(fields.allowed_customer_scope).map(token);
  const policy = token(fields.photo_visibility_policy);
  if (policy === "no_photo") return { ok: false, reason: "photo_policy_no_photo" };
  if (policy === "per_review") return { ok: false, reason: "photo_policy_per_review" };
  if (scopes.includes("per_review")) return { ok: false, reason: "photo_scope_per_review" };
  const scopeAllowsSvip = scopes.includes("svip") || scopes.includes("all_active_members");
  if (!scopeAllowsSvip) return { ok: false, reason: "photo_scope_excludes_svip" };
  if (!["vip_svip_black_card_only", "active_eligible_only"].includes(policy)) {
    return { ok: false, reason: "photo_policy_unknown" };
  }
  return { ok: true, policy, scopes };
}

function intelligenceRestriction(payload = {}) {
  if (payload?.data_status !== "live" || payload?.identity?.status !== "canonical") return "client_intelligence_unavailable";
  if (Array.isArray(payload.unresolved) && payload.unresolved.length) return "client_intelligence_unresolved";
  const notices = Array.isArray(payload?.ai?.notices) ? payload.ai.notices : [];
  if (notices.some((notice) => ["critical", "attention"].includes(token(notice?.severity)))) return "client_intelligence_caution";
  const safety = payload?.ai?.suggested_reply?.safety || {};
  if (safety.review_required === true || safety.handoff_required === true || safety.stale === true || safety.live_truth_required === true) {
    return "client_intelligence_review_required";
  }
  return "";
}

async function exactClientByLine(env, lineUserId) {
  const table = clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS, 160) || DEFAULT_CLIENTS_TABLE;
  const records = await airtableList(env, table, `{line_user_id}='${formula(lineUserId)}'`, 2);
  if (records.length !== 1) return { status: records.length > 1 ? "ambiguous" : "not_found" };
  return { status: "resolved", record: records[0] };
}

async function activeSvipEntitlement(env, lineUserId) {
  const table = clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS, 160) || DEFAULT_ENTITLEMENTS_TABLE;
  const field = clean(env.AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD, 120) || "line_user_id";
  const records = await airtableList(env, table, `{${field}}='${formula(lineUserId)}'`, 100);
  const snapshot = resolveMemberEntitlements(records);
  if (snapshot?.schema_version !== "my_mmd_entitlement_resolver_v1" || snapshot?.fail_closed !== true) {
    return { ok: false, reason: "entitlement_contract_invalid", snapshot: null };
  }
  const active = new Set(Array.isArray(snapshot?.capability_state?.active) ? snapshot.capability_state.active.map(token) : []);
  const ok = snapshot.member_blocked !== true
    && active.has("svip")
    && snapshot.access?.new_model_reveals_allowed === true;
  return { ok, reason: ok ? "" : "active_svip_required", snapshot };
}

async function exactActiveKeywordProfile(env, modelId) {
  const table = clean(env.AIRTABLE_TABLE_MODEL_KEYWORD_PROFILES_ID || env.AIRTABLE_TABLE_MODEL_KEYWORD_PROFILES, 160) || DEFAULT_KEYWORD_PROFILES_TABLE;
  const records = await airtableList(env, table, `FIND('${formula(modelId)}',ARRAYJOIN({Model}))`, 20);
  const active = records.filter((record) => token(record?.fields?.status) === "active" && linked(record?.fields?.Model).includes(modelId));
  return active.length === 1 ? { status: "resolved", record: active[0] } : { status: active.length > 1 ? "ambiguous" : "not_found" };
}

async function activeNoSellRule(env, modelId) {
  const table = clean(env.AIRTABLE_TABLE_MODEL_OFFER_RULES_ID || env.AIRTABLE_TABLE_MODEL_OFFER_RULES, 160);
  if (!table) return { blocked: false, source: "not_configured" };
  const records = await airtableList(env, table, `FIND('${formula(modelId)}',ARRAYJOIN({Model}))`, 100);
  const relevant = records.filter((record) => linked(record?.fields?.Model).includes(modelId));
  const off = relevant.filter((record) => {
    const fields = record?.fields || {};
    const status = token(fields.status);
    const visibility = token(fields.sales_visibility);
    return ["active", "approved", "live", "published"].includes(status) && visibility === "off";
  });
  return off.length ? { blocked: true, source: "model_sales_control", count: off.length } : { blocked: false, source: "model_sales_control" };
}

async function readClientIntelligence(env, clientId) {
  const request = new Request(`https://admin-worker.local/v1/admin/clients/intelligence?client_id=${encodeURIComponent(clientId)}`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  const response = await handleClientIntelligenceRequest(request, env);
  const payload = await response.json().catch(() => ({}));
  return response.ok ? payload : { data_status: "unavailable" };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function grantFields(env = {}) {
  return {
    grantId: clean(env.AT_FLASH_GRANTS__GRANT_ID, 120) || "grant_id",
    client: clean(env.AT_FLASH_GRANTS__CLIENT, 120) || "Client",
    model: clean(env.AT_FLASH_GRANTS__MODEL, 120) || "Model",
    mediaAsset: clean(env.AT_FLASH_GRANTS__MEDIA_ASSET, 120) || "Media Asset",
    grantStatus: clean(env.AT_FLASH_GRANTS__GRANT_STATUS, 120) || "grant_status",
    requiredGate: clean(env.AT_FLASH_GRANTS__REQUIRED_GATE, 120) || "required_gate",
    depositVerified: clean(env.AT_FLASH_GRANTS__DEPOSIT_VERIFIED, 120) || "deposit_verified",
    officialVerificationRef: clean(env.AT_FLASH_GRANTS__OFFICIAL_VERIFICATION_REF, 120) || "official_verification_ref",
    durationSec: clean(env.AT_FLASH_GRANTS__DURATION_SEC, 120) || "duration_sec",
    viewLimit: clean(env.AT_FLASH_GRANTS__VIEW_LIMIT, 120) || "view_limit",
    viewCount: clean(env.AT_FLASH_GRANTS__VIEW_COUNT, 120) || "view_count",
    previewTokenHash: clean(env.AT_FLASH_GRANTS__PREVIEW_TOKEN_HASH, 120) || "preview_token_hash",
    signedUrlStatus: clean(env.AT_FLASH_GRANTS__SIGNED_URL_STATUS, 120) || "signed_url_status",
    expiresAt: clean(env.AT_FLASH_GRANTS__EXPIRES_AT, 120) || "expires_at",
    watermarkCode: clean(env.AT_FLASH_GRANTS__WATERMARK_CODE, 120) || "watermark_code",
    authorizedBy: clean(env.AT_FLASH_GRANTS__AUTHORIZED_BY, 120) || "authorized_by",
    authorizedAt: clean(env.AT_FLASH_GRANTS__AUTHORIZED_AT, 120) || "authorized_at",
    grantNote: clean(env.AT_FLASH_GRANTS__GRANT_NOTE, 120) || "grant_note",
    payloadJson: clean(env.AT_FLASH_GRANTS__PAYLOAD_JSON, 120) || "payload_json",
  };
}

async function createPhotoGrant(env, { clientId, modelId, mediaRecordId, eventRef = "", requestedModelRef = "" }) {
  const fields = grantFields(env);
  const grantId = `svip_photo_${crypto.randomUUID()}`;
  const rawToken = base64Url(`${crypto.randomUUID()}:${Date.now()}:${grantId}`);
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const table = clean(env.AIRTABLE_TABLE_PRIVATE_FLASH_PREVIEW_GRANTS, 180) || DEFAULT_GRANTS_TABLE;
  await airtableCreate(env, table, {
    [fields.grantId]: grantId,
    [fields.client]: [clientId],
    [fields.model]: [modelId],
    [fields.mediaAsset]: [mediaRecordId],
    [fields.grantStatus]: "active",
    [fields.requiredGate]: "svip_exact_customer_photo_reveal",
    [fields.depositVerified]: false,
    [fields.officialVerificationRef]: eventRef || HYPE_SVIP_PHOTO_REVEAL_POLICY,
    [fields.durationSec]: 3,
    [fields.viewLimit]: 1,
    [fields.viewCount]: 0,
    [fields.previewTokenHash]: await sha256(rawToken),
    [fields.signedUrlStatus]: "not_issued",
    [fields.expiresAt]: expiresAt,
    [fields.watermarkCode]: grantId.slice(-8),
    [fields.authorizedBy]: "hype:svip_exact_customer_photo_reveal",
    [fields.authorizedAt]: issuedAt,
    [fields.grantNote]: "Photo-only exact-customer reveal. No rate, availability, offer, booking or payment authority.",
    [fields.payloadJson]: JSON.stringify({
      authorization_basis: "active_svip_exact_customer_photo_reveal",
      access_lane: "private_preview",
      preview_kind: "private_pic",
      consume_on: "open",
      photo_only: true,
      sales_authority: false,
      availability_authority: false,
      booking_authority: false,
      payment_authority: false,
      policy_version: HYPE_SVIP_PHOTO_REVEAL_POLICY,
      issue_reason: "svip_exact_customer_requested_approved_photo_set",
      issued_at: issuedAt,
      issued_by: "hype:svip_exact_customer_photo_reveal",
      customer_binding: "exact_canonical_line_client",
      client_record_id: clientId,
      model_record_id: modelId,
      media_record_id: mediaRecordId,
      requested_model_ref: requestedModelRef,
      event_ref: eventRef,
    }),
  });
  return {
    viewer_url: `https://www.mmdbkk.com/api/member/app/private-preview/view#t=${encodeURIComponent(rawToken)}`,
    expires_at: expiresAt,
  };
}

function review(reason, extra = {}) {
  return { ok: true, status: "review_required", handoff_required: true, reason_code: reason, ...extra };
}

export async function resolveHypeSvipPhotoReveal(env = {}, input = {}) {
  const lineUserId = clean(input.line_user_id, 80);
  const query = clean(input.query, 120);
  const eventRef = clean(input.event_ref, 160);
  if (!/^U[A-Za-z0-9_-]{16,64}$/.test(lineUserId) || !query) return review("identity_or_model_required");

  const clientResult = await exactClientByLine(env, lineUserId);
  if (clientResult.status !== "resolved") return review(clientResult.status === "ambiguous" ? "canonical_client_ambiguous" : "canonical_client_unresolved");
  const client = clientResult.record;
  const clientId = clean(client.id, 100);
  const clientLine = clean(client?.fields?.line_user_id, 80);
  if (clientLine !== lineUserId) return review("canonical_client_line_mismatch");

  const directRestriction = clientRestriction(client.fields || {});
  if (directRestriction) return review(directRestriction);

  const entitlement = await activeSvipEntitlement(env, lineUserId);
  if (!entitlement.ok) {
    return { ok: true, status: "not_authorized", handoff_required: false, reason_code: entitlement.reason };
  }

  const intelligence = await readClientIntelligence(env, clientId);
  const caution = intelligenceRestriction(intelligence);
  if (caution) return review(caution);

  const resolvedModel = await resolveExactModel(env, query);
  if (resolvedModel.status !== "resolved" || resolvedModel.records.length !== 1) {
    return review(resolvedModel.records?.length > 1 ? "model_ambiguous" : "model_unresolved");
  }
  const model = resolvedModel.records[0];
  const modelId = clean(model.id, 100);
  const modelBlock = modelRestriction(model.fields || {});
  if (modelBlock) return review(modelBlock);

  const noSell = await activeNoSellRule(env, modelId);
  if (noSell.blocked) return review("model_sales_control_no_sell");

  const profileResult = await exactActiveKeywordProfile(env, modelId);
  if (profileResult.status !== "resolved") return review(profileResult.status === "ambiguous" ? "photo_profile_ambiguous" : "photo_profile_missing");
  const photoPolicy = evaluateSvipPhotoProfile(profileResult.record);
  if (!photoPolicy.ok) return review(photoPolicy.reason);

  const media = await listApprovedPrivatePhotos(env, modelId);
  if (!media.length) return review("approved_photo_set_empty");

  const safeModel = projectKenjiSafeModel(model);
  if (!safeModel) return review("customer_safe_model_projection_failed");

  if (input.dry_run === true) {
    return {
      ok: true,
      status: "dry_run_ready",
      handoff_required: true,
      reason_code: "dry_run_ready",
      policy_version: HYPE_SVIP_PHOTO_REVEAL_POLICY,
      customer_binding: "exact_canonical_line_client",
      model: {
        model_code: clean(safeModel.model_code, 60),
        working_name: clean(safeModel.working_name, 120),
      },
      photo_count: media.length,
      audit_preview: {
        client_record_id: clientId,
        model_record_id: modelId,
        media_record_ids: media.map((item) => item.media_record_id),
        requested_model_ref: query,
        event_ref: eventRef,
        issue_reason: "svip_exact_customer_requested_approved_photo_set",
      },
      authority: {
        photo_reveal: false,
        rate: false,
        sales_offer: false,
        availability: false,
        booking: false,
        payment: false,
      },
    };
  }

  const grants = [];
  for (const item of media) {
    grants.push(await createPhotoGrant(env, {
      clientId,
      modelId,
      mediaRecordId: item.media_record_id,
      eventRef,
      requestedModelRef: query,
    }));
  }

  return {
    ok: true,
    status: "ready",
    handoff_required: false,
    policy_version: HYPE_SVIP_PHOTO_REVEAL_POLICY,
    customer_binding: "exact_canonical_line_client",
    model: {
      model_code: clean(safeModel.model_code, 60),
      working_name: clean(safeModel.working_name, 120),
    },
    photo_count: grants.length,
    photos: grants,
    authority: {
      photo_reveal: true,
      rate: false,
      sales_offer: false,
      availability: false,
      booking: false,
      payment: false,
    },
  };
}

export async function handleHypeSvipPhotoRevealRpc(request, env = {}) {
  if (new URL(request.url).pathname !== HYPE_SVIP_PHOTO_REVEAL_PATH || request.method !== "POST") {
    return json({ ok: false, error: "not_found" }, 404);
  }
  if (!authorizedServiceRequest(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const body = await request.json().catch(() => ({}));
  try {
    return json(await resolveHypeSvipPhotoReveal(env, body));
  } catch (error) {
    console.error("hype_svip_photo_reveal_failed", {
      name: clean(error?.name || "Error", 80),
      message: clean(error?.message || error, 180),
    });
    return json({ ok: false, status: "unavailable", error: "photo_reveal_runtime_unavailable" }, 503);
  }
}
