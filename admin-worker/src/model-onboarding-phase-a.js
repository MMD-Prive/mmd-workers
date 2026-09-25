import { normalizeLineEnvironment, resolveLineChannelId } from "./model-liff-worker-pre-manual-review.js";

const EXCHANGE_PATH = "/v1/model/liff/exchange";
const FLOW = "phase_a_no_media";
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const APPLICATIONS_BASE = "appsV1ILPRfIjkaYg";
const APPLICATIONS_TABLE = "tblwUa8ySWln8OfaJ";
const CLAIMS_TABLE = "tbluoZ5JiRcoUP6WT";
const FORM_VERSION = "mmd-app-phase-a-no-media-v1";
const APPLICATION_FIELDS = Object.freeze({
  applicationId: "fldE5jq01JlYtvSP7",
  applicationType: "fld3KMefCywUTNIoQ",
  nickname: "fldUIqNSM6Z9dK8Tj",
  age: "fldSRAY0jIsd7Plq9",
  height: "fldGbBKCkWXwdAtFV",
  weight: "fldMcoQsTEGRl1eYa",
  location: "fldz32ZjP0ptkHfRZ",
  payloadJson: "fldJ9ldETtMF2Qbqf",
  intakeStatus: "fldHk2h9Rf6g5UlZw",
  submittedAt: "fldRs4JdlxOdtlqp9",
  formVersion: "fldorknU7XdCVbrTN",
  photoCount: "fldoEssk98FpMqsxo",
  bodyPhotoCount: "fldCrBc6G3BVrvrds",
  documentCount: "fldHFmaRBsfMKjfMO",
});
const FORM_KEYS = new Set([
  "nickname", "initials", "self_description", "public_client_gender", "private_opt_in",
  "private_client_gender", "has_prior_work", "per_only_remark", "age", "height_cm",
  "weight_kg", "province", "languages", "video_call_preference", "preferred_at_bangkok",
]);
const GENDERS = new Set(["women", "men", "all"]);
const LANGUAGES = new Set(["thai", "english", "chinese", "japanese", "korean", "other"]);
const VIDEO_CALL = new Set(["comfortable", "not_yet"]);

const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const formulaString = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function isPhaseAExchange(body) {
  return body?.flow === FLOW;
}

export function normalizePhaseAForm(input, { complete = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "application_invalid" };
  const unknown = Object.keys(input).find((key) => !FORM_KEYS.has(key));
  if (unknown) return { ok: false, error: "unsupported_field" };
  for (const [key, max] of [["nickname", 80], ["initials", 2], ["self_description", 1200], ["per_only_remark", 1500], ["province", 120], ["preferred_at_bangkok", 24]]) {
    if (input[key] != null && String(input[key]).trim().length > max) return { ok: false, error: `${key}_too_long` };
  }
  const form = {
    nickname: clean(input.nickname, 80),
    initials: clean(input.initials, 8).toUpperCase(),
    self_description: clean(input.self_description, 1200),
    public_client_gender: clean(input.public_client_gender, 20),
    private_opt_in: input.private_opt_in === true,
    private_client_gender: input.private_opt_in === true ? clean(input.private_client_gender, 20) : "",
    has_prior_work: input.has_prior_work === true,
    per_only_remark: input.has_prior_work === true ? clean(input.per_only_remark, 1500) : "",
    age: input.age === "" || input.age == null ? null : Number(input.age),
    height_cm: input.height_cm === "" || input.height_cm == null ? null : Number(input.height_cm),
    weight_kg: input.weight_kg === "" || input.weight_kg == null ? null : Number(input.weight_kg),
    province: clean(input.province, 120),
    languages: Array.isArray(input.languages) ? [...new Set(input.languages.map((x) => clean(x, 20).toLowerCase()))] : [],
    video_call_preference: clean(input.video_call_preference, 20),
    preferred_at_bangkok: clean(input.preferred_at_bangkok, 24),
  };
  if (input.private_opt_in !== undefined && typeof input.private_opt_in !== "boolean") return { ok: false, error: "private_opt_in_invalid" };
  if (input.has_prior_work !== undefined && typeof input.has_prior_work !== "boolean") return { ok: false, error: "has_prior_work_invalid" };
  if (input.languages !== undefined && !Array.isArray(input.languages)) return { ok: false, error: "languages_invalid" };
  if (form.nickname.length > 80 || form.initials && !/^[A-Z]{2}$/.test(form.initials)) return { ok: false, error: "name_invalid" };
  if (form.public_client_gender && !GENDERS.has(form.public_client_gender)) return { ok: false, error: "public_client_gender_invalid" };
  if (form.private_client_gender && !GENDERS.has(form.private_client_gender)) return { ok: false, error: "private_client_gender_invalid" };
  if (form.languages.some((language) => !LANGUAGES.has(language))) return { ok: false, error: "languages_invalid" };
  if (form.video_call_preference && !VIDEO_CALL.has(form.video_call_preference)) return { ok: false, error: "video_call_preference_invalid" };
  for (const [key, min, max] of [["age", 18, 100], ["height_cm", 130, 230], ["weight_kg", 35, 200]]) {
    if (form[key] !== null && (!Number.isInteger(form[key]) || form[key] < min || form[key] > max)) return { ok: false, error: `${key}_invalid` };
  }
  if (form.preferred_at_bangkok && !validBangkokTime(form.preferred_at_bangkok)) return { ok: false, error: "preferred_at_invalid" };
  if (complete) {
    if (!form.nickname || !/^[A-Z]{2}$/.test(form.initials) || !form.self_description) return { ok: false, error: "identity_step_incomplete" };
    if (!GENDERS.has(form.public_client_gender) || (form.private_opt_in && !GENDERS.has(form.private_client_gender))) return { ok: false, error: "boundary_step_incomplete" };
    if (input.private_opt_in === undefined || input.has_prior_work === undefined) return { ok: false, error: "choice_required" };
    if (form.has_prior_work && !form.per_only_remark) return { ok: false, error: "prior_work_remark_required" };
    if (form.age === null || form.height_cm === null || form.weight_kg === null || !form.province || !form.languages.length) return { ok: false, error: "basic_step_incomplete" };
    if (!VIDEO_CALL.has(form.video_call_preference) || !form.preferred_at_bangkok) return { ok: false, error: "availability_step_incomplete" };
  }
  return { ok: true, form };
}

function validBangkokTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:(00|30)$/.test(value)) return false;
  const parsed = new Date(`${value}:00+07:00`);
  return Number.isFinite(parsed.getTime()) && parsed.getTime() >= Date.now() && parsed.getTime() <= Date.now() + 90 * 86400000
    && new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(parsed).replace(" ", "T") === value;
}

export function safePhaseAForm(form = {}) {
  const { per_only_remark, ...safe } = form;
  return safe;
}

function json(request, env, payload, status = 200) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", vary: "Origin" });
  const origin = clean(request.headers.get("origin"));
  if (origin && allowedOrigin(request, env)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

function allowedOrigin(request, env) {
  const origin = clean(request.headers.get("origin"));
  if (!origin) return true;
  return String(env.ALLOWED_ORIGINS || "").split(",").map((part) => part.trim()).includes(origin);
}

async function listAirtable(env, table, formula, maxRecords = 3, base = env.AIRTABLE_BASE_ID) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(base)) return { ok: false };
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", String(maxRecords));
  url.searchParams.set("pageSize", String(maxRecords));
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", formula);
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, schemaError: response.status === 422, records: Array.isArray(data.records) ? data.records : [] };
  } catch { return { ok: false }; }
}

async function identityState(env, subject, displayName) {
  const modelTable = clean(env.AIRTABLE_TABLE_MODELS || "Models");
  const lineFields = [...new Set([clean(env.AT_MODELS__LINE_USER_ID), "line_user_id", "LINE User ID"].filter(Boolean))];
  const matches = new Map();
  let validLineField = false;
  for (const field of lineFields) {
    const result = await listAirtable(env, modelTable, `{${field}}=${formulaString(subject)}`);
    if (result.schemaError) continue;
    if (!result.ok) return { state: "unavailable" };
    validLineField = true;
    for (const record of result.records) matches.set(record.id, record);
  }
  if (!validLineField) return { state: "unavailable" };
  if (matches.size > 1) return { state: "identity_review_required", reason: "identity_binding_conflict" };
  if (matches.size === 1) return { state: "existing_bound" };
  const hash = await sha256(subject);
  const claim = await listAirtable(env, clean(env.AIRTABLE_TABLE_MODEL_LINE_IDENTITY_CLAIMS || CLAIMS_TABLE), `{claim_id}=${formulaString(`model_line_${hash.slice(0, 24)}`)}`, 2);
  if (!claim.ok) return { state: "unavailable" };
  if (claim.records.length) return { state: "identity_review_required", reason: "prior_identity_claim" };
  if (!displayName) return { state: "identity_review_required", reason: "line_display_name_missing" };
  const name = formulaString(displayName);
  const candidates = await listAirtable(env, modelTable, `OR(LOWER({working_name})=LOWER(${name}),LOWER({nickname})=LOWER(${name}),LOWER({folder_name})=LOWER(${name}),LOWER({unique_key})=LOWER(${name}))`, 2);
  if (!candidates.ok) return { state: "unavailable" };
  if (candidates.records.length) return { state: "identity_review_required", reason: "possible_existing_model" };
  return { state: "verified_new", hash };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyLine(idToken, channelId) {
  try {
    const body = new URLSearchParams({ id_token: idToken, client_id: channelId });
    const response = await fetch(LINE_VERIFY_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || clean(data.aud) !== channelId || !/^U[0-9a-f]{32}$/i.test(clean(data.sub))) return { ok: false, error: "invalid_line_id_token", status: 401 };
    return { ok: true, subject: clean(data.sub), displayName: clean(data.name, 160) };
  } catch { return { ok: false, error: "line_verify_unavailable", status: 503 }; }
}

export async function handlePhaseAExchange(request, env, body) {
  if (new URL(request.url).pathname !== EXCHANGE_PATH || request.method.toUpperCase() !== "POST") return json(request, env, { ok: false, error: "not_found" }, 404);
  if (!allowedOrigin(request, env)) return json(request, env, { ok: false, error: "origin_not_allowed" }, 403);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json(request, env, { ok: false, error: "invalid_json" }, 400);
  if (Object.keys(body).some((key) => !["flow", "action", "idToken", "environment", "application"].includes(key))) return json(request, env, { ok: false, error: "unsupported_field" }, 400);
  const action = clean(body.action, 30);
  if (!["inspect", "save_draft", "submit"].includes(action)) return json(request, env, { ok: false, error: "action_invalid" }, 400);
  const idToken = clean(body.idToken, 8000);
  if (!idToken) return json(request, env, { ok: false, error: "id_token_required" }, 400);
  const environment = normalizeLineEnvironment(body.environment);
  const identity = await verifyLine(idToken, resolveLineChannelId(env, environment));
  if (!identity.ok) return json(request, env, { ok: false, error: identity.error }, identity.status);
  const state = await identityState(env, identity.subject, identity.displayName);
  if (state.state === "unavailable") return json(request, env, { ok: false, error: "identity_lookup_unavailable" }, 503);
  if (state.state === "identity_review_required") return json(request, env, { ok: false, state: state.state, reason: state.reason }, 202);
  if (state.state === "existing_bound") return json(request, env, { ok: true, state: state.state });
  const coordinator = env.MODEL_ACTIVATION_COORDINATOR;
  if (!coordinator?.idFromName || !coordinator?.get) return json(request, env, { ok: false, error: "draft_store_unavailable" }, 503);
  let form;
  if (action !== "inspect") {
    const normalized = normalizePhaseAForm(body.application, { complete: action === "submit" });
    if (!normalized.ok) return json(request, env, { ok: false, error: normalized.error }, 400);
    form = normalized.form;
  }
  const stub = coordinator.get(coordinator.idFromName(`phase-a:${state.hash}`));
  try {
    const response = await stub.fetch("https://model-activation.internal/phase-a", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, hash: state.hash, form }),
    });
    const payload = await response.json().catch(() => ({}));
    return json(request, env, { ...payload, state: payload.status === "pending_review" ? "pending_review" : "verified_new" }, response.status);
  } catch { return json(request, env, { ok: false, error: "draft_store_unavailable" }, 503); }
}

export async function handlePhaseADurableRequest(state, env, request) {
  const input = await request.json().catch(() => null);
  if (request.method.toUpperCase() !== "POST" || !input || !/^[0-9a-f]{64}$/.test(input.hash) || !["inspect", "save_draft", "submit", "per_remark"].includes(input.action)) return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  const normalized = ["inspect", "per_remark"].includes(input.action) ? null : normalizePhaseAForm(input.form, { complete: input.action === "submit" });
  if (normalized && !normalized.ok) return Response.json({ ok: false, error: normalized.error }, { status: 400 });
  if (input.action === "per_remark") {
    const stored = await state.storage.get("phase_a_application");
    if (!stored || stored.hash !== input.hash || stored.status !== "pending_review") return Response.json({ ok: false, error: "per_remark_unavailable" }, { status: 404 });
    return Response.json({ ok: true, remark: clean(stored.form?.per_only_remark, 1500) });
  }
  if (input.action === "inspect") {
    const stored = await state.storage.get("phase_a_application");
    if (stored?.hash && stored.hash !== input.hash) return Response.json({ ok: false, error: "subject_conflict" }, { status: 409 });
    return Response.json({ ok: true, status: stored?.status || "draft", application: safePhaseAForm(stored?.form || {}), application_id: stored?.application_id || "" });
  }
  return state.blockConcurrencyWhile(async () => {
    const current = await state.storage.get("phase_a_application");
    if (current?.hash && current.hash !== input.hash) return Response.json({ ok: false, error: "subject_conflict" }, { status: 409 });
    if (current?.status === "pending_review") return Response.json({ ok: true, status: "pending_review", application_id: current.application_id, idempotent: true });
    if (input.action === "save_draft") {
      await state.storage.put("phase_a_application", { hash: input.hash, status: "draft", form: normalized.form, updated_at: new Date().toISOString() });
      return Response.json({ ok: true, status: "draft", application: safePhaseAForm(normalized.form) });
    }
    const applicationId = `pma_liff_${input.hash.slice(0, 32)}`;
    const persisted = await persistApplication(env, applicationId, input.hash, normalized.form);
    if (!persisted.ok) return Response.json({ ok: false, error: persisted.error }, { status: persisted.status });
    await state.storage.put("phase_a_application", { hash: input.hash, status: "pending_review", form: normalized.form, application_id: applicationId, submitted_at: persisted.submittedAt });
    return Response.json({ ok: true, status: "pending_review", application_id: applicationId, idempotent: persisted.idempotent });
  });
}

async function persistApplication(env, applicationId, hash, form) {
  const base = clean(env.PUBLIC_MODEL_APPLICATIONS_BASE_ID || APPLICATIONS_BASE);
  const table = clean(env.PUBLIC_MODEL_APPLICATIONS_TABLE_ID || APPLICATIONS_TABLE);
  const existing = await listAirtable(env, table, `{application_id}=${formulaString(applicationId)}`, 2, base);
  if (!existing.ok) return { ok: false, error: "application_lookup_unavailable", status: 503 };
  if (existing.records.length > 1) return { ok: false, error: "application_identity_conflict", status: 409 };
  if (existing.records.length === 1) {
    const fields = existing.records[0].fields || {};
    let payload;
    try { payload = JSON.parse(clean(fields[APPLICATION_FIELDS.payloadJson]) || "{}"); }
    catch { return { ok: false, error: "application_identity_conflict", status: 409 }; }
    if (payload.line_subject_sha256 !== hash || payload.form_version !== FORM_VERSION) return { ok: false, error: "application_identity_conflict", status: 409 };
    return { ok: true, idempotent: true, submittedAt: clean(fields[APPLICATION_FIELDS.submittedAt]) };
  }
  const submittedAt = new Date().toISOString();
  const { per_only_remark, ...reviewForm } = form;
  const payload = { ...reviewForm, intro: form.self_description, line_subject_sha256: hash, form_version: FORM_VERSION, display_name: `${form.nickname} ${form.initials}` };
  const fields = {
    [APPLICATION_FIELDS.applicationId]: applicationId,
    [APPLICATION_FIELDS.applicationType]: "public_model",
    [APPLICATION_FIELDS.nickname]: form.nickname,
    [APPLICATION_FIELDS.age]: form.age,
    [APPLICATION_FIELDS.height]: form.height_cm,
    [APPLICATION_FIELDS.weight]: form.weight_kg,
    [APPLICATION_FIELDS.location]: form.province,
    [APPLICATION_FIELDS.payloadJson]: JSON.stringify(payload),
    [APPLICATION_FIELDS.intakeStatus]: "private_review_pending",
    [APPLICATION_FIELDS.submittedAt]: submittedAt,
    [APPLICATION_FIELDS.formVersion]: FORM_VERSION,
    [APPLICATION_FIELDS.photoCount]: 0,
    [APPLICATION_FIELDS.bodyPhotoCount]: 0,
    [APPLICATION_FIELDS.documentCount]: 0,
  };
  try {
    const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`, {
      method: "PATCH", headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ performUpsert: { fieldsToMergeOn: ["application_id"] }, records: [{ fields }], typecast: false }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.records) || data.records.length !== 1) return { ok: false, error: "application_write_unavailable", status: 503 };
    return { ok: true, idempotent: false, submittedAt };
  } catch { return { ok: false, error: "application_write_unavailable", status: 503 }; }
}
