import legacyWorker, {
  modelMediaPolicy,
  normalizeEtaMinutes,
  normalizeLineEnvironment,
  normalizeModelIdentityName,
  normalizeModelProfilePatch,
  parseCookieHeader,
  resolveLineChannelId,
} from "./model-liff-worker-pre-manual-review.js";

export {
  modelMediaPolicy,
  normalizeEtaMinutes,
  normalizeLineEnvironment,
  normalizeModelIdentityName,
  normalizeModelProfilePatch,
  parseCookieHeader,
  resolveLineChannelId,
};

// Kept for source compatibility with existing policy tests/importers. Runtime
// first-time identity resolution no longer calls this helper: every unlinked
// verified LINE identity requires explicit owner review.
export { chooseIdentityCandidate } from "./model-liff-worker-pre-manual-review.js";

export const MODEL_IDENTITY_FIRST_POLICY = "owner_review_required";

const EXCHANGE_PATH = "/v1/model/liff/exchange";
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const CLAIMS_TABLE_DEFAULT = "tbluoZ5JiRcoUP6WT";
const MODELS_TABLE_DEFAULT = "Models";
const CLAIM_SOURCE = "mmd_model_liff_exchange";
const CLAIM_VERSION = "model_liff_owner_review_v2";

export default {
  async fetch(request, env = {}, ctx) {
    const path = normalizePath(new URL(request.url).pathname);
    if (path !== EXCHANGE_PATH || request.method.toUpperCase() !== "POST") {
      return legacyWorker.fetch(request, env, ctx);
    }
    return handleOwnerReviewedExchange(request, env, ctx);
  },
};

async function handleOwnerReviewedExchange(request, env, ctx) {
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);

  const delegated = request.clone();
  const body = await request.json().catch(() => ({}));
  const idToken = clean(body?.idToken || body?.id_token);
  const environment = normalizeLineEnvironment(body?.environment);
  if (!idToken) return json({ ok: false, error: "id_token_required" }, 400, request, env);

  const channelId = resolveLineChannelId(env, environment);
  const lineIdentity = await verifyLineIdToken(idToken, channelId);
  if (!lineIdentity.ok) return json({ ok: false, error: lineIdentity.error }, lineIdentity.status, request, env);

  const lineUserId = clean(lineIdentity.profile?.sub);
  if (!isCanonicalLineUserId(lineUserId)) return json({ ok: false, error: "line_identity_invalid" }, 401, request, env);

  // Existing canonical binding is safe to delegate. The legacy worker will
  // issue the normal Model session and retain all existing profile/session rules.
  const existing = await findModelsByLineUserId(env, lineUserId);
  if (!existing.ok) return json({ ok: false, error: "model_lookup_unavailable" }, existing.status || 503, request, env);
  if (existing.records.length === 1) return legacyWorker.fetch(delegated, env, ctx);

  const nowIso = new Date().toISOString();
  const lineHash = await sha256Hex(lineUserId);
  const lineDisplayName = clean(lineIdentity.profile?.name).slice(0, 160);
  const linePictureUrl = normalizeLinePictureUrl(lineIdentity.profile?.picture);
  const status = existing.records.length > 1 ? "conflict" : "verified_unlinked";
  const safeNote = existing.records.length > 1
    ? "Verified LINE identity is attached to multiple Model records; owner review required."
    : "Verified first-time LINE identity captured. Owner must select the canonical Model record and its Drive folder before access is linked.";

  const claim = await upsertIdentityClaim(env, {
    lineUserId,
    lineHash,
    lineDisplayName,
    linePictureUrl,
    environment,
    status,
    nowIso,
    safeNote,
  });
  if (!claim.ok) return json({ ok: false, error: "identity_claim_unavailable" }, claim.status || 503, request, env);

  return json({
    ok: false,
    state: "identity_review_required",
    error: "identity_review_required",
    reason: existing.records.length > 1 ? "identity_binding_conflict" : "owner_model_link_required",
    claim_status: status,
    claim_id: clean(claim.record?.fields?.claim_id) || `model_line_${lineHash.slice(0, 24)}`,
    message: "ยืนยัน LINE สำเร็จแล้ว MMD กำลังเชื่อมโปรไฟล์ให้ครับ ไม่ต้องส่ง LINE User ID ซ้ำ",
  }, 202, request, env);
}

async function findModelsByLineUserId(env, lineUserId) {
  const fields = [...new Set([clean(env.AT_MODELS__LINE_USER_ID), "line_user_id", "LINE User ID"].filter(Boolean))];
  const records = new Map();
  for (const field of fields) {
    const result = await airtableList(env, modelsTable(env), `{${field}}="${escapeFormula(lineUserId)}"`, 3);
    if (result.schemaError) continue;
    if (!result.ok) return { ok: false, status: result.status || 503, records: [] };
    for (const record of result.records) records.set(record.id, record);
  }
  return { ok: true, records: [...records.values()] };
}

async function upsertIdentityClaim(env, input) {
  const table = claimsTable(env);
  const search = await airtableList(env, table, `{line_user_id}="${escapeFormula(input.lineUserId)}"`, 3);
  if (!search.ok) return { ok: false, status: search.status || 503 };
  if (search.records.length > 1) return { ok: false, status: 409 };

  const fields = {
    claim_id: `model_line_${input.lineHash.slice(0, 24)}`,
    line_user_id: input.lineUserId,
    line_user_id_hash: input.lineHash,
    line_display_name: input.lineDisplayName || "",
    line_picture_url: input.linePictureUrl || "",
    line_environment: input.environment,
    claim_status: input.status,
    verified_at: input.nowIso,
    source: CLAIM_SOURCE,
    verification_version: CLAIM_VERSION,
    safe_note: clean(input.safeNote).slice(0, 1000),
  };

  if (search.records[0]) {
    const updated = await airtableUpdateRecord(env, table, search.records[0].id, fields, true);
    return updated.ok ? { ok: true, record: updated.record } : { ok: false, status: updated.status || 503 };
  }
  const created = await airtableCreateRecord(env, table, fields, true);
  return created.ok ? { ok: true, record: created.record } : { ok: false, status: created.status || 503 };
}

export function normalizeLinePictureUrl(value) {
  const raw = clean(value);
  if (!raw || raw.length > 2048) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href.slice(0, 2048) : "";
  } catch {
    return "";
  }
}

async function verifyLineIdToken(idToken, channelId) {
  const form = new URLSearchParams();
  form.set("id_token", idToken);
  form.set("client_id", channelId);
  let response;
  try {
    response = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch {
    return { ok: false, status: 503, error: "line_verify_unavailable" };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.sub || clean(data?.aud) !== clean(channelId)) {
    return { ok: false, status: 401, error: "invalid_line_id_token" };
  }
  return { ok: true, status: 200, profile: data };
}

async function airtableList(env, table, formula, pageSize = 10) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503, records: [] };
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (formula) params.set("filterByFormula", formula);
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = JSON.stringify(data || {});
    return { ok: false, status: response.status, schemaError: response.status === 422 || /unknown field|invalid.*field/i.test(detail), records: [] };
  }
  return { ok: true, status: 200, records: Array.isArray(data.records) ? data.records : [] };
}

async function airtableCreateRecord(env, table, fields, typecast = false) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503 };
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast }),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, status: 201, record: data.records?.[0] || null } : { ok: false, status: response.status };
}

async function airtableUpdateRecord(env, table, recordId, fields, typecast = false) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ id: recordId, fields }], typecast }),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, status: 200, record: data.records?.[0] || null } : { ok: false, status: response.status };
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isCanonicalLineUserId(value) { return /^U[0-9a-f]{32}$/i.test(clean(value)); }
function modelsTable(env) { return clean(env.AIRTABLE_TABLE_MODELS || MODELS_TABLE_DEFAULT); }
function claimsTable(env) { return clean(env.AIRTABLE_TABLE_MODEL_LINE_IDENTITY_CLAIMS || CLAIMS_TABLE_DEFAULT); }
function clean(value) { return String(value ?? "").trim(); }
function escapeFormula(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function isAllowedOrigin(request, env) {
  const origin = clean(request.headers.get("origin"));
  if (!origin) return true;
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(clean).filter(Boolean));
  return allowed.has(origin);
}
function corsHeaders(request, env) {
  const origin = clean(request.headers.get("origin"));
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  });
  if (origin && isAllowedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  return headers;
}
function json(payload, status, request, env) {
  const headers = corsHeaders(request, env);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers });
}