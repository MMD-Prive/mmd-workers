import legacyWorker, {
  modelMediaPolicy,
  normalizeEtaMinutes,
  normalizeLineEnvironment,
  normalizeModelProfilePatch,
  parseCookieHeader,
  resolveLineChannelId,
} from "./model-liff-worker-legacy.js";

export {
  modelMediaPolicy,
  normalizeEtaMinutes,
  normalizeLineEnvironment,
  normalizeModelProfilePatch,
  parseCookieHeader,
  resolveLineChannelId,
};

const EXCHANGE_PATH = "/v1/model/liff/exchange";
const COOKIE_NAME = "mmd_model_session_v1";
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const MODELS_TABLE_DEFAULT = "Models";
const CLAIMS_TABLE_DEFAULT = "tbluoZ5JiRcoUP6WT";
const CLAIM_VERSION = "model_liff_identity_first_v1";
const CLAIM_SOURCE = "mmd_model_liff_exchange";
const ACTIVE_SESSION_STATES = new Set([
  "confirmed",
  "accepted",
  "en_route",
  "traveling",
  "nearby",
  "arrived",
  "met_customer",
  "final_payment_pending",
  "final_payment_confirmed",
  "work_started",
  "work_finished",
]);
const DEFAULT_R2_CATEGORY_PATHS = [
  "MMD Public Models/MMD Travel Compcard",
  "MMD Public Models/MMD Travel Models",
  "MMD Public Models/MMD Travel Models/Straight",
  "MMD Public Models/MMD Travel Models/Gay",
  "MMD Public Models/MMD Travel Models/Both",
  "MMD Public Models/MMD Extreme Models",
  "MMD Public Models/MMD Extreme Models/Straight",
  "MMD Public Models/MMD Extreme Models/Gay",
  "MMD Public Models/MMD Extreme Models/Both",
  "Public Models/Extreme Models",
  "MMD Private Models/Standard Package",
  "MMD Private Models/Premium Package",
  "MMD Exclusive/MMD Exclusive Models",
  "Public Models/Extreme Models/Straight",
];

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    if (path === EXCHANGE_PATH && request.method.toUpperCase() === "POST") {
      return handleIdentityFirstExchange(request, env);
    }
    return legacyWorker.fetch(request, env, ctx);
  },
};

export function normalizeModelIdentityName(value = "") {
  return clean(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[._\-–—/\\()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function chooseIdentityCandidate(displayName, candidates = []) {
  const target = normalizeModelIdentityName(displayName);
  if (!target) return { action: "review", reason: "line_display_name_missing", candidate: null };

  const exact = candidates.filter((candidate) => {
    const aliases = Array.isArray(candidate?.aliases) ? candidate.aliases : [];
    return aliases.some((alias) => normalizeModelIdentityName(alias) === target);
  });

  if (exact.length !== 1) {
    return {
      action: "review",
      reason: exact.length > 1 ? "identity_candidate_ambiguous" : "identity_candidate_not_found",
      candidate: null,
    };
  }

  const candidate = exact[0];
  const supported = Boolean(candidate.has_active_session || candidate.has_source_evidence || candidate.has_r2_evidence);
  if (!supported) return { action: "review", reason: "identity_supporting_evidence_required", candidate };
  return { action: "bind", reason: "unique_exact_candidate_with_supporting_evidence", candidate };
}

async function handleIdentityFirstExchange(request, env) {
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);

  const body = await request.json().catch(() => ({}));
  const idToken = clean(body?.idToken || body?.id_token);
  const environment = normalizeLineEnvironment(body?.environment);
  if (!idToken) return json({ ok: false, error: "id_token_required" }, 400, request, env);

  const channelId = resolveLineChannelId(env, environment);
  const lineIdentity = await verifyLineIdToken(idToken, channelId);
  if (!lineIdentity.ok) return json({ ok: false, error: lineIdentity.error }, lineIdentity.status, request, env);

  const lineUserId = clean(lineIdentity.profile?.sub);
  if (!isCanonicalLineUserId(lineUserId)) {
    return json({ ok: false, error: "line_identity_invalid" }, 401, request, env);
  }
  const lineDisplayName = clean(lineIdentity.profile?.name).slice(0, 160);
  const nowIso = new Date().toISOString();
  const lineHash = await sha256Hex(lineUserId);

  // Existing canonical binding remains the fastest and safest path.
  const existingBindings = await findModelsByLineUserId(env, lineUserId);
  if (!existingBindings.ok) return json({ ok: false, error: existingBindings.error }, existingBindings.status, request, env);
  if (existingBindings.records.length > 1) {
    await upsertIdentityClaim(env, {
      lineUserId,
      lineHash,
      lineDisplayName,
      environment,
      status: "conflict",
      nowIso,
      safeNote: "Verified LINE identity is already attached to multiple model records; manual review required.",
    }).catch(() => null);
    return identityReviewResponse(request, env, "identity_binding_conflict", "conflict");
  }
  if (existingBindings.records.length === 1) {
    const model = modelSummary(existingBindings.records[0], env);
    if (!model.active) return json({ ok: false, error: "model_not_active" }, 403, request, env);
    await upsertIdentityClaim(env, {
      lineUserId,
      lineHash,
      lineDisplayName,
      environment,
      status: "linked",
      linkedModelId: model.record.id,
      nowIso,
      safeNote: "Verified LINE identity matched an existing canonical Models.line_user_id binding.",
    }).catch(() => null);
    return issueModelSession(request, env, { model, lineUserId, environment });
  }

  // First-time LINE identity MUST be persisted before any auto-bind is attempted.
  const claim = await upsertIdentityClaim(env, {
    lineUserId,
    lineHash,
    lineDisplayName,
    environment,
    status: "verified_unlinked",
    nowIso,
    safeNote: "Verified LINE identity captured; model resolution pending.",
  });
  if (!claim.ok) return json({ ok: false, error: "identity_claim_unavailable" }, 503, request, env);

  if (!lineDisplayName) {
    return identityReviewResponse(request, env, "line_display_name_missing", "verified_unlinked");
  }

  const candidateResult = await findExactModelCandidates(env, lineDisplayName);
  if (!candidateResult.ok) return json({ ok: false, error: candidateResult.error }, candidateResult.status, request, env);

  const hydrated = [];
  for (const record of candidateResult.records) {
    const session = await findActiveSessionForModel(env, record);
    if (!session.ok && session.status !== 404) {
      return json({ ok: false, error: session.error }, session.status, request, env);
    }
    const sourceEvidence = hasCanonicalSourceEvidence(record.fields || {});
    const r2Evidence = sourceEvidence ? null : await findR2Evidence(env, lineDisplayName);
    hydrated.push({
      record,
      aliases: modelAliases(record, env),
      has_active_session: session.ok,
      has_source_evidence: sourceEvidence,
      has_r2_evidence: Boolean(r2Evidence?.matched),
    });
  }

  const decision = chooseIdentityCandidate(lineDisplayName, hydrated);
  if (decision.action !== "bind" || !decision.candidate?.record?.id) {
    // If Models has no exact candidate, do a bounded R2 existence check so review
    // can distinguish "no evidence" from "source library evidence exists" without
    // exposing folder/media details to the browser.
    const r2 = hydrated.length ? null : await findR2Evidence(env, lineDisplayName);
    await upsertIdentityClaim(env, {
      lineUserId,
      lineHash,
      lineDisplayName,
      environment,
      status: "verified_unlinked",
      nowIso,
      safeNote: r2?.matched
        ? "Verified LINE identity has R2 source evidence but no unique canonical Models match; manual review required."
        : `Verified LINE identity unresolved: ${decision.reason}.`,
    }).catch(() => null);
    return identityReviewResponse(request, env, decision.reason, "verified_unlinked");
  }

  const candidateRecord = decision.candidate.record;
  const candidate = modelSummary(candidateRecord, env);
  if (!candidate.active) return json({ ok: false, error: "model_not_active" }, 403, request, env);

  // Re-check immediately before the atomic bind so one LINE subject cannot race
  // into two Models records.
  const collisionCheck = await findModelsByLineUserId(env, lineUserId);
  if (!collisionCheck.ok) return json({ ok: false, error: collisionCheck.error }, collisionCheck.status, request, env);
  if (collisionCheck.records.length) {
    const same = collisionCheck.records.length === 1 && collisionCheck.records[0].id === candidateRecord.id;
    if (!same) {
      await upsertIdentityClaim(env, {
        lineUserId,
        lineHash,
        lineDisplayName,
        environment,
        status: "conflict",
        nowIso,
        safeNote: "LINE identity collision detected immediately before model binding.",
      }).catch(() => null);
      return identityReviewResponse(request, env, "identity_binding_conflict", "conflict");
    }
  } else {
    const binding = await bindLineUserIdAtomic(env, {
      modelRecordId: candidateRecord.id,
      lineUserId,
      lineHash,
    });
    if (!binding.ok) {
      const conflict = /conflict|already_linked|already_used/i.test(binding.error || "");
      await upsertIdentityClaim(env, {
        lineUserId,
        lineHash,
        lineDisplayName,
        environment,
        status: conflict ? "conflict" : "verified_unlinked",
        nowIso,
        safeNote: conflict
          ? "Atomic LINE binding reported a conflict; manual review required."
          : "Atomic LINE binding was unavailable; identity remains verified and unlinked.",
      }).catch(() => null);
      if (conflict) return identityReviewResponse(request, env, "identity_binding_conflict", "conflict");
      return json({ ok: false, error: "identity_binding_unavailable" }, binding.status || 503, request, env);
    }
  }

  await upsertIdentityClaim(env, {
    lineUserId,
    lineHash,
    lineDisplayName,
    environment,
    status: "linked",
    linkedModelId: candidateRecord.id,
    nowIso,
    safeNote: "Auto-linked from verified LINE identity using one exact canonical model candidate plus trusted session/source evidence.",
  }).catch(() => null);

  return issueModelSession(request, env, { model: candidate, lineUserId, environment });
}

function identityReviewResponse(request, env, reason, claimStatus) {
  return json({
    ok: false,
    state: "identity_review_required",
    error: "identity_review_required",
    reason,
    claim_status: claimStatus,
    message: "กำลังเชื่อมโปรไฟล์ MMD MODEL กรุณารอการตรวจสอบข้อมูลครับ",
  }, 202, request, env);
}

async function issueModelSession(request, env, { model, lineUserId, environment }) {
  const sessionResult = await findActiveSessionForModel(env, model.record);
  if (!sessionResult.ok && sessionResult.status !== 404) {
    return json({ ok: false, error: sessionResult.error }, sessionResult.status, request, env);
  }
  const session = sessionResult.ok ? sessionResult : null;
  const ttlSeconds = clampInt(env.MODEL_LIFF_SESSION_TTL_SECONDS, 300, 28800, 3600);
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = {
    kind: "model_session",
    role: "model",
    session_id: session?.sessionId || undefined,
    payment_ref: session?.paymentRef || undefined,
    model_record_id: model.record.id,
    model_name: model.displayName,
    line_user_id: lineUserId,
    line_environment: environment,
    exp: expiresAtSeconds,
  };
  const token = await signPayload(payload, env);
  if (!token) return json({ ok: false, error: "signing_not_ready" }, 503, request, env);

  const response = json({
    ok: true,
    environment,
    identity_resolution: "linked",
    expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
    model: {
      id: model.record.id,
      code: model.code,
      display_name: model.displayName,
    },
    session: session ? { session_id: session.sessionId, state: session.state } : null,
  }, 200, request, env);
  response.headers.append("set-cookie", serializeSessionCookie(token, ttlSeconds));
  return response;
}

async function findModelsByLineUserId(env, lineUserId) {
  const fields = unique([
    clean(env.AT_MODELS__LINE_USER_ID),
    "line_user_id",
    "LINE User ID",
  ].filter(Boolean));
  const records = new Map();
  for (const field of fields) {
    const result = await airtableList(env, modelsTable(env), `{${field}}="${escapeFormula(lineUserId)}"`, 3);
    if (result.schemaError) continue;
    if (!result.ok) return { ok: false, status: 503, error: "model_lookup_unavailable", records: [] };
    for (const record of result.records) records.set(record.id, record);
  }
  return { ok: true, status: 200, records: [...records.values()] };
}

async function findExactModelCandidates(env, displayName) {
  const q = escapeFormula(displayName);
  // These four fields are canonical in the current Models schema. Keep matching
  // exact and bounded; fuzzy or image-based guessing must never auto-bind identity.
  const formula = `OR(LOWER({working_name})=LOWER("${q}"),LOWER({nickname})=LOWER("${q}"),LOWER({folder_name})=LOWER("${q}"),LOWER({unique_key})=LOWER("${q}"))`;
  const result = await airtableList(env, modelsTable(env), formula, 10);
  if (!result.ok) return { ok: false, status: result.status || 503, error: "model_candidate_lookup_unavailable", records: [] };
  const target = normalizeModelIdentityName(displayName);
  const records = result.records.filter((record) => modelAliases(record, env).some((alias) => normalizeModelIdentityName(alias) === target));
  return { ok: true, status: 200, records };
}

function modelAliases(record, env) {
  const fields = record?.fields || {};
  return unique([
    firstText(fields, ["working_name"]),
    firstText(fields, ["nickname"]),
    firstText(fields, ["folder_name"]),
    firstText(fields, ["unique_key"]),
    firstText(fields, [env.AT_MODELS__DISPLAY_NAME, "display_name", "Display Name", "name", "Name"]),
  ].filter(Boolean));
}

function hasCanonicalSourceEvidence(fields = {}) {
  return Boolean(firstText(fields, [
    "source_folder",
    "r2_prefix",
    "MMD Public Category",
    "private_tier",
  ]));
}

function modelSummary(record, env) {
  const fields = record?.fields || {};
  const status = firstText(fields, [env.AT_MODELS__STATUS, "status", "Status", "model_status", "Model Status"]);
  return {
    record,
    active: !status || !/inactive|disabled|suspended|blocked|archived|rejected|offboard/i.test(status),
    code: firstText(fields, [env.AT_MODELS__MODEL_CODE, "model_code", "Model Code", "unique_key"]),
    displayName: firstText(fields, [env.AT_MODELS__DISPLAY_NAME, "working_name", "display_name", "Display Name", "nickname", "Nickname", "name", "Name"]) || "Model",
  };
}

async function upsertIdentityClaim(env, input) {
  const table = claimsTable(env);
  const search = await airtableList(env, table, `{line_user_id}="${escapeFormula(input.lineUserId)}"`, 3);
  if (!search.ok) return { ok: false, status: search.status || 503 };
  if (search.records.length > 1) return { ok: false, status: 409, error: "identity_claim_conflict" };

  const fields = {
    claim_id: `model_line_${input.lineHash.slice(0, 24)}`,
    line_user_id: input.lineUserId,
    line_user_id_hash: input.lineHash,
    line_display_name: input.lineDisplayName || "",
    line_environment: input.environment,
    claim_status: input.status,
    verified_at: input.nowIso,
    source: CLAIM_SOURCE,
    verification_version: CLAIM_VERSION,
    safe_note: clean(input.safeNote).slice(0, 1000),
  };
  if (input.linkedModelId) {
    fields["Linked Model"] = [input.linkedModelId];
    fields.linked_at = input.nowIso;
  }

  if (search.records[0]) {
    const updated = await airtableUpdateRecord(env, table, search.records[0].id, fields, true);
    return updated.ok ? { ok: true, record: updated.record } : { ok: false, status: updated.status || 503 };
  }
  const created = await airtableCreateRecord(env, table, fields, true);
  return created.ok ? { ok: true, record: created.record } : { ok: false, status: created.status || 503 };
}

async function bindLineUserIdAtomic(env, { modelRecordId, lineUserId, lineHash }) {
  const namespace = env.MODEL_ACTIVATION_COORDINATOR;
  if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") {
    return { ok: false, status: 503, error: "activation_coordinator_not_ready" };
  }
  const id = namespace.idFromName(modelRecordId);
  const stub = namespace.get(id);
  const exp = Math.floor(Date.now() / 1000) + 10 * 60;
  const response = await stub.fetch("https://model-activation.internal/bind", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model_record_id: modelRecordId,
      line_user_id: lineUserId,
      jti: `identity_first_${lineHash.slice(0, 40)}`,
      exp,
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, ok: response.ok && data.ok !== false, status: response.status };
}

async function findActiveSessionForModel(env, modelRecord) {
  const table = clean(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
  const assignedField = clean(env.AT_SESSIONS__MODEL_RECORD_ID || "Assigned Model");
  const formula = `FIND("${escapeFormula(modelRecord.id)}",ARRAYJOIN({${assignedField}}))`;
  const result = await airtableList(env, table, formula, 20);
  if (!result.ok) return { ok: false, status: 503, error: "session_lookup_unavailable" };
  const sessionIdField = clean(env.AT_SESSIONS__SESSION_ID || "session_id");
  const stateFields = unique([env.AT_SESSIONS__STATE, env.AT_SESSIONS__STATUS, "session_state", "status"].map(clean).filter(Boolean));
  const paymentField = clean(env.AT_SESSIONS__PAYMENT_REF || "payment_ref");
  for (const record of result.records) {
    const state = firstText(record.fields || {}, stateFields).toLowerCase();
    if (state && !ACTIVE_SESSION_STATES.has(state)) continue;
    const sessionId = firstText(record.fields || {}, [sessionIdField]);
    if (!sessionId) continue;
    return { ok: true, status: 200, record, sessionId, paymentRef: firstText(record.fields || {}, [paymentField]), state: state || "confirmed" };
  }
  return { ok: false, status: 404, error: "active_session_not_found" };
}

async function findR2Evidence(env, displayName) {
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.list !== "function") return { matched: false };
  if (String(env.MODEL_R2_LOOKUP_ENABLED || "true").toLowerCase() === "false") return { matched: false };

  const categories = clean(env.MODEL_R2_CATEGORY_PATHS)
    ? clean(env.MODEL_R2_CATEGORY_PATHS).split(",").map(clean).filter(Boolean)
    : DEFAULT_R2_CATEGORY_PATHS;
  const root = clean(env.MODEL_R2_ROOT_PREFIX).replace(/^\/+|\/+$/g, "");
  const variants = unique([clean(displayName), slug(displayName)].filter(Boolean));

  for (const category of categories.slice(0, 24)) {
    const categoryClean = clean(category).replace(/^\/+|\/+$/g, "");
    for (const variant of variants) {
      const prefix = [root, categoryClean, variant].filter(Boolean).join("/") + "/";
      try {
        const listed = await env.MMD_MODEL_ASSETS.list({ prefix, limit: 1 });
        if ((Array.isArray(listed?.objects) && listed.objects.length) || (Array.isArray(listed?.delimitedPrefixes) && listed.delimitedPrefixes.length)) {
          return { matched: true };
        }
      } catch {
        return { matched: false };
      }
    }
  }
  return { matched: false };
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
  if (!response.ok || !data?.sub || clean(data?.aud) !== channelId) {
    return { ok: false, status: 401, error: "invalid_line_id_token" };
  }
  return { ok: true, status: 200, profile: data };
}

async function airtableList(env, table, formula, pageSize = 10) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503, records: [] };
  const params = new URLSearchParams();
  params.set("pageSize", String(pageSize));
  if (formula) params.set("filterByFormula", formula);
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = JSON.stringify(data || {});
    return { ok: false, status: response.status, schemaError: response.status === 422 || /unknown field|invalid.*field/i.test(message), records: [] };
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
  if (!response.ok) return { ok: false, status: response.status, error: data };
  return { ok: true, status: 201, record: data.records?.[0] || null };
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
  if (!response.ok) return { ok: false, status: response.status, error: data };
  return { ok: true, status: 200, record: data.records?.[0] || null };
}

async function signPayload(payload, env) {
  const secret = clean(env.MODEL_SESSION_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!secret) return "";
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacHex(encoded, secret);
  return `${encoded}.${signature}`;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function serializeSessionCookie(token, maxAge) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/v1/model; HttpOnly; Secure; SameSite=Lax`;
}

function isCanonicalLineUserId(value) {
  return /^U[0-9a-f]{32}$/i.test(clean(value));
}

function modelsTable(env) {
  return clean(env.AIRTABLE_TABLE_MODELS || MODELS_TABLE_DEFAULT);
}

function claimsTable(env) {
  return clean(env.AIRTABLE_TABLE_MODEL_LINE_IDENTITY_CLAIMS || CLAIMS_TABLE_DEFAULT);
}

function firstText(fields, names) {
  for (const name of names) {
    if (!name) continue;
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) {
      const item = value[0];
      if (item && typeof item === "object") return clean(item.name || item.id || item.value);
      return clean(item);
    }
    if (value !== undefined && value !== null && clean(value)) return clean(value);
  }
  return "";
}

function clean(value) {
  return String(value ?? "").trim();
}

function unique(values) {
  return [...new Set(values)];
}

function escapeFormula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function slug(value) {
  return normalizeModelIdentityName(value).replace(/[^a-z0-9ก-๙]+/gi, "-").replace(/^-+|-+$/g, "");
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
