const AIRTABLE_API = "https://api.airtable.com/v0";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const TOKEN_BYTES = 32;
const DEFAULT_TOKEN_TTL_DAYS = 30;
const WORKER_NAME = "partners-worker";
const AGREEMENT_VERSION = "SIGIL_PARTNER_TERMS_V2";
const PARTNER_ASSET_DEFAULT_CATEGORY = "other";
const REVIEW_STATUS_NEW = "new";
const VISIBILITY_PRIVATE_INTERNAL = "private_internal";
const SIGNED_URL_NOT_GENERATED = "not_generated";

const FIELD_PARTNER_APPROVAL_STATUS = "fldwRzdtIoPbHKr7n";
const FIELD_PARTNER_ACCESS_TOKEN_HASH = "fldoaCF4k4YqyuQ7Q";

const FIELD_ASSET_ID = "fld3NklN2iKsZfyx2";
const FIELD_ASSET_REQUEST_ID = "fldeqzo5t3Rn80Cxi";
const FIELD_ASSET_PARTNER = "fldfFnmGzuABMx73p";
const FIELD_ASSET_REFERRAL = "fldOdLWYrfJTrqlh0";
const FIELD_ASSET_MODEL_APPLICATION = "fldrO5jXtRC2625K9";
const FIELD_ASSET_MODEL = "fldziGhehbtACcMSy";
const FIELD_ASSET_TALENT_NAME = "fld13S676s8rVItvM";
const FIELD_ASSET_TALENT_TYPE = "fld1GUaBYlsc0qItX";
const FIELD_ASSET_FILE_NAME = "fldan0RC2OmKOx9ZS";
const FIELD_ASSET_FILE_TYPE = "fldRIWH1BoksjTifz";
const FIELD_ASSET_FILE_SIZE = "fldVSEnaet8QBVprU";
const FIELD_ASSET_FILE_CATEGORY = "fldxP9Dz5R5n8qc0m";
const FIELD_ASSET_R2_KEY = "fldwREciD1379aRmj";
const FIELD_ASSET_R2_BUCKET = "fldNbFcAfD8iSUBvT";
const FIELD_ASSET_STORAGE_PROVIDER = "flduFWON5ER5zwWZx";
const FIELD_ASSET_PORTFOLIO_URL = "fldluhKZtvnrJtrLI";
const FIELD_ASSET_UPLOADED_AT = "fldeeR5njPazmDppA";
const FIELD_ASSET_REVIEW_STATUS = "fldU74rreSrrPPR34";
const FIELD_ASSET_VISIBILITY = "fldOnuGVGUV3s0iue";
const FIELD_ASSET_SIGNED_URL_STATUS = "fldeRj8Qfh0Mtfnz4";
const FIELD_ASSET_NOTES = "fldG0NOMCIuDxdHNM";
const FIELD_ASSET_CREATED_BY_WORKER = "fldHxkxKp36tKRdx6";
const FIELD_ASSET_SOURCE_PATH = "fld8bzWD62f59lH3u";
const FIELD_ASSET_PAYLOAD_JSON = "fld9CgmkIQzqABY58";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type AirtableValue = JsonPrimitive | string[];
type AirtableFields = Record<string, AirtableValue | undefined>;

interface Env {
  PARTNER_ASSETS: R2Bucket;
  AIRTABLE_API_KEY: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_ADMIN_CHAT_ID?: string;
  TELEGRAM_ADMIN_THREAD_ID?: string;
  ADMIN_APPROVE_SECRET: string;
  AIRTABLE_BASE_ID: string;
  AIRTABLE_TABLE_MODEL_PARTNERS: string;
  AIRTABLE_TABLE_MODEL_REFERRALS: string;
  AIRTABLE_TABLE_PARTNER_COMMISSIONS: string;
  AIRTABLE_TABLE_MODEL_APPLICATIONS: string;
  AIRTABLE_TABLE_PARTNER_ASSETS: string;
  PARTNER_ASSETS_BUCKET_NAME: string;
  REVIEW_URL: string;
  DASHBOARD_URL: string;
  TERMS_URL: string;
  RECOGNIZED_URL: string;
  ALLOWED_ORIGINS: string;
  AIRTABLE_FIELD_ACCESS_TOKEN_EXPIRES_AT?: string;
  AIRTABLE_FIELD_PARTNER_ID?: string;
  AIRTABLE_FIELD_PARTNER_EMAIL?: string;
  AIRTABLE_FIELD_PARTNER_NAME?: string;
  AIRTABLE_FIELD_PARTNER_CONTACT_PHONE?: string;
  AIRTABLE_FIELD_PARTNER_LINE_ID?: string;
  AIRTABLE_FIELD_PARTNER_TELEGRAM?: string;
  AIRTABLE_FIELD_PARTNER_TYPE?: string;
  AIRTABLE_FIELD_PARTNER_STATUS?: string;
  AIRTABLE_FIELD_PARTNER_SCORE?: string;
  AIRTABLE_FIELD_PARTNER_NOTES?: string;
}

interface AirtableRecord {
  id: string;
  fields?: Record<string, AirtableValue>;
}

interface AirtableListResponse {
  records?: AirtableRecord[];
  offset?: string;
}

interface AirtableFieldInfo {
  id: string;
  name: string;
}

type AirtableSchema = Record<string, AirtableFieldInfo>;

interface UploadMetadata {
  asset_id?: string;
  request_id?: string;
  file_category?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  r2_key?: string;
  r2_bucket?: string;
  portfolio_url?: string;
  source_path?: string;
}

interface PartnerRequestPayload {
  request_id?: string;
  partner_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  line_id?: string;
  telegram?: string;
  company?: string;
  website?: string;
  notes?: string;
  referral_source?: string;
  contact?: string;
  name_alias?: string;
  access_source?: string;
  value_bring?: string;
  why_consider?: string;
  experience?: string;
  portfolio_url?: string;
  talent_location?: string;
  talent_details?: string;
  talent_name?: string;
  talent_type?: string;
  model_id?: string;
  uploaded_files?: UploadMetadata[];
  files?: UploadMetadata[];
}

interface PartnerSummary {
  tier: string;
  activeModels: number;
  pendingAmount: number;
  paidAmount: number;
}

class HttpError extends Error {
  readonly status: number;
  readonly payload: Record<string, JsonValue>;

  constructor(status: number, error: string, message?: string) {
    super(message || error);
    this.status = status;
    this.payload = { ok: false, error, message: message || error };
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = corsFor(request, env);

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      if (url.searchParams.has("token")) {
        throw new HttpError(400, "invalid_request", "Use t instead of token.");
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, worker: WORKER_NAME }, 200, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/upload") {
        const body = await handleUpload(request, env);
        return json(body, 200, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/request") {
        const body = await handlePartnerRequest(request, env, ctx);
        return json(body, 200, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/approve") {
        const body = await handleApprove(request, env, ctx);
        return json(body, 200, corsHeaders);
      }

      if (request.method === "GET" && url.pathname === "/v1/partner/verify") {
        const body = await handleVerify(url, env);
        return json(body, 200, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/accept-terms") {
        const body = await handleAcceptTerms(request, env);
        return json(body, 200, corsHeaders);
      }

      if (request.method === "GET" && url.pathname === "/v1/partner/dashboard") {
        const body = await handleDashboard(url, env);
        return json(body, 200, corsHeaders);
      }

      return json({ ok: false, error: "not_found" }, 404, corsHeaders);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(error.payload, error.status, corsHeaders);
      }

      console.error(JSON.stringify({ worker: WORKER_NAME, error: errorMessage(error) }));
      return json({ ok: false, error: "internal_error" }, 500, corsHeaders);
    }
  },
};

async function handleUpload(request: Request, env: Env): Promise<Record<string, JsonValue>> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new HttpError(415, "unsupported_media_type", "Upload requires multipart/form-data.");
  }

  const form = await request.formData();
  const requestId = cleanText(form.get("request_id"));
  const fileCategory = cleanText(form.get("file_category")) || PARTNER_ASSET_DEFAULT_CATEGORY;
  const file = form.get("file");

  if (!requestId) throw new HttpError(400, "missing_request_id");
  if (!(file instanceof File)) throw new HttpError(400, "missing_file");
  if (file.size <= 0) throw new HttpError(400, "empty_file");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "file_too_large", "Max file size is 20MB.");

  const fileType = normalizeFileType(file);
  if (!fileType) {
    throw new HttpError(400, "unsupported_file_type", "Allowed file types are jpg, png, webp, and pdf.");
  }

  const now = new Date();
  const safeName = safeFilename(file.name || `upload.${fileType.extension}`);
  const r2Key = `partner-requests/${safePathPart(requestId)}/uploads/${now.getTime()}-${safeName}`;

  await env.PARTNER_ASSETS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: fileType.contentType },
    customMetadata: {
      request_id: requestId,
      file_category: fileCategory,
      original_filename: file.name || safeName,
      created_by_worker: WORKER_NAME,
    },
  });

  const metadata: UploadMetadata = {
    asset_id: crypto.randomUUID(),
    request_id: requestId,
    file_category: fileCategory,
    file_name: safeName,
    file_type: fileType.contentType,
    file_size: file.size,
    r2_key: r2Key,
    r2_bucket: env.PARTNER_ASSETS_BUCKET_NAME,
    source_path: r2Key,
  };

  return { ok: true, upload: metadataToJson(metadata) };
}

async function handlePartnerRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Record<string, JsonValue>> {
  const payload = await readPartnerRequestPayload(request);
  const requestId = payload.request_id || crypto.randomUUID();
  const partnerName = partnerDisplayName(payload);
  const score = computePartnerScore(payload);
  const nowIso = new Date().toISOString();
  const uploads = [...(payload.uploaded_files || []), ...(payload.files || [])].filter(hasR2Key);
  const partnerSchema = await tableSchema(env, env.AIRTABLE_TABLE_MODEL_PARTNERS);
  const applicationSchema = await tableSchema(env, env.AIRTABLE_TABLE_MODEL_APPLICATIONS);
  const referralSchema = await tableSchema(env, env.AIRTABLE_TABLE_MODEL_REFERRALS);
  const existingPartner = await findExistingPartner(env, payload);
  const partnerFields = buildPartnerFields(env, partnerSchema, payload, requestId, partnerName, score, existingPartner);

  const partnerRecord = existingPartner
    ? await airtableUpdate(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, existingPartner.id, partnerFields)
    : await airtableCreate(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, partnerFields);

  const modelApplicationRecord = shouldCreateModelApplication(payload, uploads)
    ? await airtableCreate(env, env.AIRTABLE_TABLE_MODEL_APPLICATIONS, buildModelApplicationFields(applicationSchema, payload, requestId, uploads))
    : null;

  const referralRecord = shouldCreateReferral(payload)
    ? await airtableCreate(env, env.AIRTABLE_TABLE_MODEL_REFERRALS, buildReferralFields(referralSchema, payload, requestId, partnerRecord.id))
    : null;

  const assetRecords: AirtableRecord[] = [];
  for (const upload of uploads) {
    const assetFields = compactFields({
      [FIELD_ASSET_ID]: upload.asset_id || crypto.randomUUID(),
      [FIELD_ASSET_REQUEST_ID]: requestId,
      [FIELD_ASSET_PARTNER]: [partnerRecord.id],
      [FIELD_ASSET_REFERRAL]: referralRecord ? [referralRecord.id] : undefined,
      [FIELD_ASSET_MODEL_APPLICATION]: modelApplicationRecord ? [modelApplicationRecord.id] : undefined,
      [FIELD_ASSET_MODEL]: cleanText(payload.model_id),
      [FIELD_ASSET_TALENT_NAME]: cleanText(payload.talent_name),
      [FIELD_ASSET_TALENT_TYPE]: cleanText(payload.talent_type),
      [FIELD_ASSET_FILE_NAME]: cleanText(upload.file_name),
      [FIELD_ASSET_FILE_TYPE]: cleanText(upload.file_type),
      [FIELD_ASSET_FILE_SIZE]: upload.file_size,
      [FIELD_ASSET_FILE_CATEGORY]: cleanText(upload.file_category) || PARTNER_ASSET_DEFAULT_CATEGORY,
      [FIELD_ASSET_R2_KEY]: cleanText(upload.r2_key),
      [FIELD_ASSET_R2_BUCKET]: cleanText(upload.r2_bucket) || env.PARTNER_ASSETS_BUCKET_NAME,
      [FIELD_ASSET_STORAGE_PROVIDER]: "cloudflare_r2",
      [FIELD_ASSET_PORTFOLIO_URL]: cleanText(upload.portfolio_url) || cleanText(payload.portfolio_url),
      [FIELD_ASSET_UPLOADED_AT]: nowIso,
      [FIELD_ASSET_REVIEW_STATUS]: REVIEW_STATUS_NEW,
      [FIELD_ASSET_VISIBILITY]: VISIBILITY_PRIVATE_INTERNAL,
      [FIELD_ASSET_SIGNED_URL_STATUS]: SIGNED_URL_NOT_GENERATED,
      [FIELD_ASSET_NOTES]: partnerIntakeNotes(payload, requestId),
      [FIELD_ASSET_CREATED_BY_WORKER]: WORKER_NAME,
      [FIELD_ASSET_SOURCE_PATH]: cleanText(upload.source_path) || cleanText(upload.r2_key),
      [FIELD_ASSET_PAYLOAD_JSON]: stableJson(upload),
    });
    assetRecords.push(await airtableCreate(env, env.AIRTABLE_TABLE_PARTNER_ASSETS, assetFields));
  }

  ctx.waitUntil(notifyTelegram(env, [
    "SĪGIL Partner request",
    `Partner: ${partnerName}`,
    `Request: ${requestId}`,
    `Score: ${score}`,
    `Uploads: ${assetRecords.length}`,
  ].join("\n")));

  return {
    ok: true,
    request_id: requestId,
    partner_id: partnerRecord.id,
    model_application_id: modelApplicationRecord?.id || null,
    referral_id: referralRecord?.id || null,
    asset_count: assetRecords.length,
    redirect: env.REVIEW_URL,
  };
}

async function handleApprove(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Record<string, JsonValue>> {
  await requireAdmin(request, env);
  const body = await readJsonObject(request);
  const partnerId = cleanText(body.partner_id) || cleanText(body.record_id);
  const action = cleanText(body.action);
  const actions = new Set(["recognized", "not_recognized", "needs_follow_up", "archived"]);

  if (!partnerId) throw new HttpError(400, "missing_partner_id");
  if (!actions.has(action)) throw new HttpError(400, "invalid_action");

  const fields: AirtableFields = {
    [FIELD_PARTNER_APPROVAL_STATUS]: action,
  };

  let recognizedLink = "";
  if (action === "recognized") {
    const expiresAt = new Date(Date.now() + tokenTtlMs(body.expires_in_days)).toISOString();
    const token = randomToken(expiresAt);
    fields[FIELD_PARTNER_ACCESS_TOKEN_HASH] = await sha256Hex(token);
    const expiresAtField = await resolveAccessTokenExpiresAtField(env);
    if (expiresAtField) fields[expiresAtField] = expiresAt;
    recognizedLink = withT(env.RECOGNIZED_URL, token);
  }

  const partner = await airtableUpdate(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, partnerId, compactFields(fields));

  ctx.waitUntil(notifyTelegram(env, [
    "SĪGIL Partner approval",
    `Partner record: ${partner.id}`,
    `Action: ${action}`,
  ].join("\n")));

  return {
    ok: true,
    partner_id: partner.id,
    approval_status: action,
    recognized_link: recognizedLink || null,
  };
}

async function handleVerify(url: URL, env: Env): Promise<Record<string, JsonValue>> {
  const partner = await verifyPartnerByToken(url.searchParams.get("t"), env);
  return {
    ok: true,
    partner: {
      id: partner.id,
      name: fieldString(partner.fields, ["Partner Name", "Name"]) || "Partner",
      status: fieldString(partner.fields, [FIELD_PARTNER_APPROVAL_STATUS, "Approval Status"]) || "recognized",
    },
  };
}

async function handleAcceptTerms(request: Request, env: Env): Promise<Record<string, JsonValue>> {
  const body = await readJsonObject(request);
  const partner = await verifyPartnerByToken(cleanText(body.t), env);
  const schema = await tableSchema(env, env.AIRTABLE_TABLE_MODEL_PARTNERS);
  const fields: AirtableFields = {};
  setSchemaField(fields, schema, ["Agreement Version"], cleanText(body.agreement_version) || AGREEMENT_VERSION);
  setSchemaField(fields, schema, ["Agreement Accepted At"], new Date().toISOString());

  if (Object.keys(fields).length > 0) {
    await airtableUpdate(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, partner.id, fields);
  }

  return { ok: true, partner_id: partner.id, redirect: withT(env.DASHBOARD_URL, cleanText(body.t)) };
}

async function handleDashboard(url: URL, env: Env): Promise<Record<string, JsonValue>> {
  const partner = await verifyPartnerByToken(url.searchParams.get("t"), env);
  const referrals = (await listRecords(env, env.AIRTABLE_TABLE_MODEL_REFERRALS)).filter((record) => belongsToPartner(record, partner.id));
  const commissions = (await listRecords(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS)).filter((record) => belongsToPartner(record, partner.id));
  const summary = summarizePartner(partner, referrals, commissions);

  return {
    ok: true,
    summary: summaryToJson(summary),
    referrals: referrals.map(normalizeReferral),
    commissions: commissions.map(normalizeCommission),
  };
}

async function verifyPartnerByToken(rawToken: string | null, env: Env): Promise<AirtableRecord> {
  const token = cleanText(rawToken);
  if (!token) throw new HttpError(401, "missing_t");

  const tokenHash = await sha256Hex(token);
  const partner = await findFirstByFormula(
    env,
    env.AIRTABLE_TABLE_MODEL_PARTNERS,
    `{Access Token Hash}="${formulaString(tokenHash)}"`,
  );

  if (!partner) throw new HttpError(401, "invalid_t");

  const status = fieldString(partner.fields, [FIELD_PARTNER_APPROVAL_STATUS, "Approval Status"]);
  if (status !== "recognized" && status !== "Active") {
    throw new HttpError(403, "partner_not_recognized");
  }

  const tokenExpiresAt = tokenExpiry(token);
  if (tokenExpiresAt && Date.parse(tokenExpiresAt) <= Date.now()) {
    throw new HttpError(401, "expired_t");
  }

  const expiresAt = fieldString(partner.fields, ["Access Token Expires At"]);
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
    throw new HttpError(401, "expired_t");
  }

  return partner;
}

async function airtableCreate(env: Env, table: string, fields: AirtableFields): Promise<AirtableRecord> {
  return airtableWrite(env, table, "POST", undefined, fields);
}

async function airtableUpdate(env: Env, table: string, recordId: string, fields: AirtableFields): Promise<AirtableRecord> {
  return airtableWrite(env, table, "PATCH", recordId, fields);
}

async function airtableWrite(
  env: Env,
  table: string,
  method: "POST" | "PATCH",
  recordId: string | undefined,
  fields: AirtableFields,
): Promise<AirtableRecord> {
  requireAirtable(env);
  const path = recordId ? `${encodeURIComponent(table)}/${encodeURIComponent(recordId)}` : encodeURIComponent(table);
  const url = `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${path}`;
  let currentFields = compactFields(fields);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (Object.keys(currentFields).length === 0) {
      throw new Error(`Airtable ${method} ${table} failed: no compatible fields remain`);
    }

    const response = await fetch(url, {
      method,
      headers: airtableHeaders(env),
      body: JSON.stringify({ fields: currentFields, typecast: true }),
    });

    const text = await response.text();
    if (response.ok) {
      return JSON.parse(text) as AirtableRecord;
    }

    const rejectedField = airtableRejectedField(text, currentFields);
    if (rejectedField) {
      const nextFields = { ...currentFields };
      delete nextFields[rejectedField];
      currentFields = nextFields;
      console.warn(JSON.stringify({
        worker: WORKER_NAME,
        table,
        dropped_airtable_field: rejectedField,
        reason: "airtable_runtime_compatibility",
      }));
      continue;
    }

    throw new Error(`Airtable ${method} ${table} failed: ${response.status} ${text}`);
  }

  throw new Error(`Airtable ${method} ${table} failed after compatibility retries`);
}

async function findFirstByFormula(env: Env, table: string, formula: string): Promise<AirtableRecord | null> {
  const records = await listByFormula(env, table, formula, 1);
  return records[0] || null;
}

async function listByFormula(env: Env, table: string, formula: string, maxRecords = 100): Promise<AirtableRecord[]> {
  requireAirtable(env);
  const url = new URL(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", String(Math.min(maxRecords, 100)));
  url.searchParams.set("maxRecords", String(maxRecords));
  url.searchParams.set("filterByFormula", formula);

  const response = await fetch(url.toString(), { headers: airtableHeaders(env) });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Airtable list ${table} failed: ${response.status} ${text}`);
  }

  const data = JSON.parse(text) as AirtableListResponse;
  return data.records || [];
}

async function listRecords(env: Env, table: string, maxRecords = 100): Promise<AirtableRecord[]> {
  requireAirtable(env);
  const records: AirtableRecord[] = [];
  let offset = "";

  do {
    const url = new URL(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", String(Math.min(maxRecords - records.length, 100)));
    if (offset) url.searchParams.set("offset", offset);

    const response = await fetch(url.toString(), { headers: airtableHeaders(env) });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Airtable list ${table} failed: ${response.status} ${text}`);
    }

    const data = JSON.parse(text) as AirtableListResponse;
    records.push(...(data.records || []));
    offset = data.offset || "";
  } while (offset && records.length < maxRecords);

  return records.slice(0, maxRecords);
}

async function tableSchema(env: Env, tableIdOrName: string): Promise<AirtableSchema> {
  try {
    const response = await fetch(`${AIRTABLE_API}/meta/bases/${env.AIRTABLE_BASE_ID}/tables`, {
      headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
    });
    if (!response.ok) return {};

    const data = (await response.json()) as unknown;
    if (!isRecord(data) || !Array.isArray(data.tables)) return {};

    const table = data.tables.find((item: unknown) => {
      if (!isRecord(item)) return false;
      return cleanText(item.id) === tableIdOrName || cleanText(item.name) === tableIdOrName;
    });
    if (!isRecord(table) || !Array.isArray(table.fields)) return {};

    const schema: AirtableSchema = {};
    for (const field of table.fields) {
      if (!isRecord(field)) continue;
      const id = cleanText(field.id);
      const name = cleanText(field.name);
      if (!id || !name) continue;
      schema[id] = { id, name };
      schema[name] = { id, name };
    }
    return schema;
  } catch {
    return {};
  }
}

function airtableHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function requireAirtable(env: Env): void {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    throw new HttpError(500, "missing_airtable_env");
  }
}

async function resolveAccessTokenExpiresAtField(env: Env): Promise<string> {
  const configured = cleanText(env.AIRTABLE_FIELD_ACCESS_TOKEN_EXPIRES_AT);
  if (configured) return configured;

  const schema = await tableSchema(env, env.AIRTABLE_TABLE_MODEL_PARTNERS);
  return resolveSchemaField(schema, ["Access Token Expires At"]);
}

function airtableRejectedField(errorText: string, fields: AirtableFields): string {
  const keys = Object.keys(fields);
  if (!keys.length) return "";

  try {
    const parsed = JSON.parse(errorText) as unknown;
    if (isRecord(parsed) && isRecord(parsed.error)) {
      const message = cleanText(parsed.error.message);
      const exact = rejectedFieldFromMessage(message, keys);
      if (exact) return exact;
    }
  } catch {
    // Fall through to text matching below.
  }

  return rejectedFieldFromMessage(errorText, keys);
}

function rejectedFieldFromMessage(message: string, keys: string[]): string {
  const quoted = message.match(/(?:Unknown field name|Field)\s*:?\s*"([^"]+)"/i)?.[1]
    || message.match(/field\s+["']([^"']+)["']/i)?.[1]
    || "";
  if (quoted && keys.includes(quoted)) return quoted;

  const lower = message.toLowerCase();
  if (
    lower.includes("unknown field")
    || lower.includes("cannot accept")
    || lower.includes("computed field")
    || lower.includes("invalid multiple choice")
  ) {
    return keys.find((key) => lower.includes(key.toLowerCase())) || "";
  }

  return "";
}

async function notifyTelegram(env: Env, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) return;

  const payload: Record<string, string | number> = {
    chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
    text,
    disable_web_page_preview: 1,
  };

  if (env.TELEGRAM_ADMIN_THREAD_ID) {
    payload.message_thread_id = Number(env.TELEGRAM_ADMIN_THREAD_ID);
  }

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(JSON.stringify({ worker: WORKER_NAME, telegram_status: response.status }));
  }
}

async function requireAdmin(request: Request, env: Env): Promise<void> {
  const supplied = cleanText(request.headers.get("x-mmd-admin-secret"))
    || bearerToken(request.headers.get("authorization"));
  if (!env.ADMIN_APPROVE_SECRET || !supplied) {
    throw new HttpError(401, "missing_admin_auth");
  }

  const ok = await secureEqual(supplied, env.ADMIN_APPROVE_SECRET);
  if (!ok) throw new HttpError(403, "invalid_admin_auth");
}

async function readPartnerRequestPayload(request: Request): Promise<PartnerRequestPayload> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    return normalizePartnerPayload((await readJsonObject(request)) as PartnerRequestPayload);
  }

  const form = await request.formData();
  const filesJson = cleanText(form.get("uploaded_files")) || cleanText(form.get("files"));
  const payload: PartnerRequestPayload = {
    request_id: cleanText(form.get("request_id")),
    partner_name: cleanText(form.get("partner_name")) || cleanText(form.get("name")) || cleanText(form.get("name_alias")),
    name_alias: cleanText(form.get("name_alias")),
    email: cleanText(form.get("email")),
    phone: cleanText(form.get("phone")),
    contact: cleanText(form.get("contact")),
    line_id: cleanText(form.get("line_id")),
    telegram: cleanText(form.get("telegram")),
    company: cleanText(form.get("company")),
    website: cleanText(form.get("website")),
    notes: cleanText(form.get("notes")),
    referral_source: cleanText(form.get("referral_source")) || cleanText(form.get("access_source")),
    access_source: cleanText(form.get("access_source")),
    value_bring: cleanText(form.get("value_bring")),
    why_consider: cleanText(form.get("why_consider")),
    experience: cleanText(form.get("experience")),
    portfolio_url: cleanText(form.get("portfolio_url")),
    talent_location: cleanText(form.get("talent_location")),
    talent_details: cleanText(form.get("talent_details")),
    talent_name: cleanText(form.get("talent_name")),
    talent_type: cleanText(form.get("talent_type")),
    model_id: cleanText(form.get("model_id")),
    uploaded_files: filesJson ? parseUploadArray(filesJson) : [],
  };

  return normalizePartnerPayload(payload);
}

async function readJsonObject(request: Request): Promise<Record<string, JsonValue>> {
  const data = await request.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpError(400, "invalid_json");
  }
  return data as Record<string, JsonValue>;
}

function parseUploadArray(value: string): UploadMetadata[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).map((item) => ({
      asset_id: cleanText(item.asset_id),
      request_id: cleanText(item.request_id),
      file_category: cleanText(item.file_category),
      file_name: cleanText(item.file_name),
      file_type: cleanText(item.file_type),
      file_size: typeof item.file_size === "number" ? item.file_size : undefined,
      r2_key: cleanText(item.r2_key),
      r2_bucket: cleanText(item.r2_bucket),
      portfolio_url: cleanText(item.portfolio_url),
      source_path: cleanText(item.source_path),
    }));
  } catch {
    return [];
  }
}

function normalizePartnerPayload(payload: PartnerRequestPayload): PartnerRequestPayload {
  const contact = cleanText(payload.contact);
  const email = cleanText(payload.email) || emailFromContact(contact);
  const phone = cleanText(payload.phone) || phoneFromContact(contact);
  const referralSource = cleanText(payload.referral_source) || cleanText(payload.access_source);
  const partnerName = cleanText(payload.partner_name) || cleanText(payload.name) || cleanText(payload.name_alias);

  return {
    ...payload,
    partner_name: partnerName,
    name: cleanText(payload.name) || partnerName,
    name_alias: cleanText(payload.name_alias),
    email,
    phone,
    contact,
    referral_source: referralSource,
    access_source: cleanText(payload.access_source) || referralSource,
    notes: cleanText(payload.notes),
    value_bring: cleanText(payload.value_bring),
    why_consider: cleanText(payload.why_consider),
    experience: cleanText(payload.experience),
    portfolio_url: cleanText(payload.portfolio_url),
    talent_location: cleanText(payload.talent_location),
    talent_details: cleanText(payload.talent_details),
    talent_name: cleanText(payload.talent_name),
    talent_type: cleanText(payload.talent_type),
    model_id: cleanText(payload.model_id),
    uploaded_files: payload.uploaded_files || [],
    files: payload.files || [],
  };
}

function buildPartnerFields(
  env: Env,
  schema: AirtableSchema,
  payload: PartnerRequestPayload,
  requestId: string,
  partnerName: string,
  score: number,
  existingPartner: AirtableRecord | null,
): AirtableFields {
  const fields: AirtableFields = {
    [FIELD_PARTNER_APPROVAL_STATUS]: existingPartner
      ? fieldString(existingPartner.fields, [FIELD_PARTNER_APPROVAL_STATUS, "Approval Status"]) || "needs_follow_up"
      : "needs_follow_up",
  };

  setConfiguredOrSchemaField(fields, schema, env.AIRTABLE_FIELD_PARTNER_ID, ["Partner ID"], `ptr_${requestId}`);
  setConfiguredOrSchemaField(fields, schema, env.AIRTABLE_FIELD_PARTNER_NAME, ["Partner Name"], partnerName);
  setConfiguredOrSchemaField(fields, schema, env.AIRTABLE_FIELD_PARTNER_EMAIL, ["Email"], cleanText(payload.email));
  setConfiguredOrSchemaField(fields, schema, env.AIRTABLE_FIELD_PARTNER_CONTACT_PHONE, ["Contact Phone"], cleanText(payload.phone));
  setConfiguredOrSchemaField(fields, schema, env.AIRTABLE_FIELD_PARTNER_LINE_ID, ["LINE ID"], cleanText(payload.line_id));
  setConfiguredOrSchemaField(fields, schema, env.AIRTABLE_FIELD_PARTNER_TELEGRAM, ["Telegram ID", "Telegram Username"], cleanText(payload.telegram));
  setConfiguredOrSchemaField(fields, schema, env.AIRTABLE_FIELD_PARTNER_TYPE, ["Partner Type"], partnerType(payload));
  setConfiguredOrSchemaField(fields, schema, env.AIRTABLE_FIELD_PARTNER_STATUS, ["Status"], "needs_follow_up");
  setConfiguredOrSchemaField(fields, schema, env.AIRTABLE_FIELD_PARTNER_SCORE, ["Partner Score"], score);
  setConfiguredOrSchemaField(fields, schema, env.AIRTABLE_FIELD_PARTNER_NOTES, ["Notes Internal", "Notes"], partnerIntakeNotes(payload, requestId));

  return compactFields(fields);
}

function buildModelApplicationFields(
  schema: AirtableSchema,
  payload: PartnerRequestPayload,
  requestId: string,
  uploads: UploadMetadata[],
): AirtableFields {
  const fields: AirtableFields = {};
  setSchemaField(fields, schema, ["nickname"], cleanText(payload.name_alias) || cleanText(payload.talent_name));
  setSchemaField(fields, schema, ["Working Name"], cleanText(payload.talent_name) || partnerDisplayName(payload));
  setSchemaField(fields, schema, ["source"], cleanText(payload.access_source) || "partner_worker");
  setSchemaField(fields, schema, ["Saved By"], WORKER_NAME);
  setSchemaField(fields, schema, ["Created At"], new Date().toISOString());
  setSchemaField(fields, schema, ["consent"], true);
  setSchemaField(fields, schema, ["status"], "partner_submitted");
  setSchemaField(fields, schema, ["Notes"], partnerIntakeNotes(payload, requestId));
  setSchemaField(fields, schema, ["payload_json"], stableJson({ request_id: requestId, payload, uploaded_files: uploads }));
  setSchemaField(fields, schema, ["location"], cleanText(payload.talent_location));
  setSchemaField(fields, schema, ["intro"], cleanText(payload.talent_details) || cleanText(payload.why_consider));
  setSchemaField(fields, schema, ["experience"], cleanText(payload.experience));
  setSchemaField(fields, schema, ["instagram"], instagramFromPortfolio(payload.portfolio_url));
  return compactFields(fields);
}

function buildReferralFields(
  schema: AirtableSchema,
  payload: PartnerRequestPayload,
  requestId: string,
  partnerRecordId: string,
): AirtableFields {
  const fields: AirtableFields = {};
  setSchemaField(fields, schema, ["Referral ID"], `ref_${requestId}`);
  setSchemaField(fields, schema, ["Partner"], [partnerRecordId]);
  if (isAirtableRecordId(cleanText(payload.model_id))) {
    setSchemaField(fields, schema, ["Model"], [cleanText(payload.model_id)]);
  }
  setSchemaField(fields, schema, ["Ownership Status"], "pending_review");
  setSchemaField(fields, schema, ["Source Channel"], "webflow_partner");
  setSchemaField(fields, schema, ["Referred At"], new Date().toISOString());
  setSchemaField(fields, schema, ["Notes"], partnerIntakeNotes(payload, requestId));
  setSchemaField(fields, schema, ["Created By Worker"], WORKER_NAME);
  return compactFields(fields);
}

function partnerIntakeNotes(payload: PartnerRequestPayload, requestId: string): string {
  const lines = [
    ["Request ID", requestId],
    ["Partner Name", partnerDisplayName(payload)],
    ["Name Alias", payload.name_alias],
    ["Email", payload.email],
    ["Phone", payload.phone],
    ["Contact", payload.contact],
    ["Access Source", payload.access_source || payload.referral_source],
    ["Value Bring", payload.value_bring],
    ["Why Consider", payload.why_consider],
    ["Experience", payload.experience],
    ["Portfolio URL", payload.portfolio_url],
    ["Talent Name", payload.talent_name],
    ["Talent Type", payload.talent_type],
    ["Talent Location", payload.talent_location],
    ["Talent Details", payload.talent_details],
    ["Model ID", payload.model_id],
    ["Notes", payload.notes],
  ]
    .map(([label, value]) => {
      const text = cleanText(value);
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean);

  return lines.join("\n");
}

function partnerDisplayName(payload: PartnerRequestPayload): string {
  return cleanText(payload.partner_name) || cleanText(payload.name) || cleanText(payload.name_alias) || "Partner";
}

function partnerType(payload: PartnerRequestPayload): string {
  if (cleanText(payload.talent_name) || cleanText(payload.model_id)) return "talent_referral";
  if (cleanText(payload.portfolio_url)) return "portfolio_source";
  return "partner";
}

function setSchemaField(
  fields: AirtableFields,
  schema: AirtableSchema,
  candidates: Array<string | undefined>,
  value: AirtableValue | undefined,
): void {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value) && value.length === 0) return;
  const field = resolveSchemaField(schema, candidates);
  if (field) fields[field] = value;
}

function setConfiguredOrSchemaField(
  fields: AirtableFields,
  schema: AirtableSchema,
  configured: string | undefined,
  candidates: Array<string | undefined>,
  value: AirtableValue | undefined,
): void {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value) && value.length === 0) return;
  const configuredField = cleanText(configured);
  const field = configuredField ? schema[configuredField]?.id || configuredField : resolveSchemaField(schema, candidates);
  if (field) fields[field] = value;
}

function resolveSchemaField(schema: AirtableSchema, candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const key = cleanText(candidate);
    if (!key) continue;
    if (schema[key]) return schema[key].id || schema[key].name || key;
  }
  return "";
}

async function findExistingPartner(env: Env, payload: PartnerRequestPayload): Promise<AirtableRecord | null> {
  const schema = await tableSchema(env, env.AIRTABLE_TABLE_MODEL_PARTNERS);
  const configuredEmailField = cleanText(env.AIRTABLE_FIELD_PARTNER_EMAIL);
  const emailField = configuredEmailField
    ? schema[configuredEmailField]?.id || configuredEmailField
    : resolveSchemaField(schema, ["Email"]);
  const email = cleanText(payload.email);
  if (!emailField || !email) return null;
  return findFirstByFormula(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, `{${emailField}}="${formulaString(email)}"`);
}

function emailFromContact(value: string): string {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function phoneFromContact(value: string): string {
  return value.match(/(?:\+?\d[\d\s().-]{6,}\d)/)?.[0]?.trim() || "";
}

function instagramFromPortfolio(value: string | undefined): string {
  const text = cleanText(value);
  if (!text) return "";
  const match = text.match(/(?:instagram\.com\/|@)([A-Za-z0-9._]+)/i);
  return match ? `@${match[1]}` : "";
}

function isAirtableRecordId(value: string): boolean {
  return /^rec[A-Za-z0-9]{14,}$/.test(value);
}

function normalizeFileType(file: File): { extension: string; contentType: string } | null {
  const name = file.name.toLowerCase();
  const declared = (file.type || "").toLowerCase();
  if (declared === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (declared === "image/png" || name.endsWith(".png")) return { extension: "png", contentType: "image/png" };
  if (declared === "image/webp" || name.endsWith(".webp")) return { extension: "webp", contentType: "image/webp" };
  if (declared === "application/pdf" || name.endsWith(".pdf")) {
    return { extension: "pdf", contentType: "application/pdf" };
  }
  return null;
}

function computePartnerScore(payload: PartnerRequestPayload): number {
  let score = 40;
  if (payload.email) score += 10;
  if (payload.phone || payload.line_id || payload.telegram) score += 10;
  if (payload.company || payload.website) score += 10;
  if (payload.talent_name || payload.model_id) score += 15;
  if ((payload.uploaded_files || payload.files || []).length > 0) score += 15;
  return Math.min(score, 100);
}

function shouldCreateModelApplication(payload: PartnerRequestPayload, uploads: UploadMetadata[]): boolean {
  return Boolean(payload.talent_name || payload.talent_type || payload.model_id || uploads.length);
}

function shouldCreateReferral(payload: PartnerRequestPayload): boolean {
  return Boolean(payload.talent_name || payload.model_id);
}

function summarizePartner(
  partner: AirtableRecord,
  referrals: AirtableRecord[],
  commissions: AirtableRecord[],
): PartnerSummary {
  const pendingAmount = commissions.reduce((sum, record) => {
    const status = fieldString(record.fields, ["payout_status", "Payout Status"]);
    return status === "paid" ? sum : sum + fieldNumber(record.fields, ["amount_thb", "Amount THB", "commission_amount"]);
  }, 0);
  const paidAmount = commissions.reduce((sum, record) => {
    const status = fieldString(record.fields, ["payout_status", "Payout Status"]);
    return status === "paid" ? sum + fieldNumber(record.fields, ["amount_thb", "Amount THB", "commission_amount"]) : sum;
  }, 0);
  const activeModels = referrals.filter((record) => {
    const status = fieldString(record.fields, ["Ownership Status", "ownership_status"]);
    return status === "active" || status === "approved";
  }).length;

  return {
    tier: fieldString(partner.fields, ["Tier", "Partner Tier"]) || "Trusted",
    activeModels,
    pendingAmount,
    paidAmount,
  };
}

function normalizeReferral(record: AirtableRecord): Record<string, JsonValue> {
  const status = fieldString(record.fields, ["status", "Status", "ownership_status", "Ownership Status"]) || "pending_review";
  return {
    id: record.id,
    model: fieldDisplay(record.fields, ["model", "Model", "model_id", "Model ID", "model_name", "Model Name"]),
    referralDate: fieldString(record.fields, ["referral_date", "Referral Date", "created_at", "Created At", "Approved At"]),
    ownership: fieldString(record.fields, ["ownership_status", "Ownership Status", "ownership", "Ownership"]) || status,
    commissionType: fieldString(record.fields, ["commission_type", "Commission Type", "basis_rule", "Basis Rule"]),
    lastJob: fieldString(record.fields, ["last_job", "Last Job", "job_id", "Job ID", "session_id", "Session ID"]),
    status,
    statusLabel: statusLabel(status),
  };
}

function normalizeCommission(record: AirtableRecord): Record<string, JsonValue> {
  const status = fieldString(record.fields, ["payout_status", "Payout Status", "approval_status", "Approval Status", "eligibility_status", "Eligibility Status"]) || "pending";
  return {
    id: record.id,
    jobId: fieldString(record.fields, ["job_id", "Job ID", "session_id", "Session ID"]),
    model: fieldDisplay(record.fields, ["model", "Model", "model_id", "Model ID", "model_name", "Model Name"]),
    basisAmount: fieldNumber(record.fields, ["basis_amount", "Basis Amount", "basis_amount_thb", "Basis Amount THB", "amount_thb", "Amount THB"]),
    rate: fieldNumber(record.fields, ["rate", "Rate", "commission_rate", "Commission Rate", "split_percent", "Split Percent"]),
    commission: fieldNumber(record.fields, ["commission", "Commission", "commission_amount", "Commission Amount", "commission_amount_thb", "Commission Amount THB", "amount_thb", "Amount THB"]),
    status,
    statusLabel: statusLabel(status),
    paidAt: fieldString(record.fields, ["paid_at", "Paid At", "payout_paid_at", "Payout Paid At"]),
  };
}

function normalizeRecord(record: AirtableRecord): Record<string, JsonValue> {
  return {
    id: record.id,
    fields: normalizeFields(record.fields || {}),
  };
}

function belongsToPartner(record: AirtableRecord, partnerId: string): boolean {
  const fields = record.fields || {};
  const linkedPartnerIds = linkedRecordIds(fields, ["Partner", "partner", "Partners", "partners"]);
  if (linkedPartnerIds.includes(partnerId)) return true;

  const snapshot = fieldString(fields, [
    "partner_id",
    "Partner ID",
    "partner_record_id",
    "Partner Record ID",
    "partner_id_snapshot",
    "Partner ID Snapshot",
  ]);
  return snapshot === partnerId;
}

function linkedRecordIds(fields: Record<string, AirtableValue> | undefined, keys: string[]): string[] {
  for (const key of keys) {
    const value = fields?.[key];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function fieldDisplay(fields: Record<string, AirtableValue> | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = fields?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length) return value.join(", ");
  }
  return "";
}

function statusLabel(status: string): string {
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  const labels: Record<string, string> = {
    active: "Active",
    approved: "Approved",
    eligible: "Eligible",
    held: "Held",
    ineligible: "Ineligible",
    needs_follow_up: "Needs follow-up",
    new: "New",
    paid: "Paid",
    pending: "Pending",
    pending_payment: "Pending payment",
    pending_review: "Pending review",
    private_internal: "Private internal",
    queued: "Queued",
    recognized: "Recognized",
    unpaid: "Unpaid",
    void: "Void",
  };
  return labels[normalized] || status || "Pending";
}

function normalizeFields(fields: Record<string, AirtableValue>): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = Array.isArray(value) ? value : value;
  }
  return out;
}

function metadataToJson(metadata: UploadMetadata): Record<string, JsonValue> {
  const fields = compactFields(metadata as AirtableFields);
  const out: Record<string, AirtableValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = value;
  }
  return normalizeFields(out);
}

function summaryToJson(summary: PartnerSummary): Record<string, JsonValue> {
  return {
    tier: summary.tier,
    activeModels: summary.activeModels,
    pendingAmount: summary.pendingAmount,
    paidAmount: summary.paidAmount,
  };
}

function compactFields(fields: AirtableFields): AirtableFields {
  const out: AirtableFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

function fieldString(fields: Record<string, AirtableValue> | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = fields?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function fieldNumber(fields: Record<string, AirtableValue> | undefined, keys: string[]): number {
  for (const key of keys) {
    const value = fields?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function hasR2Key(upload: UploadMetadata): boolean {
  return Boolean(upload && upload.r2_key);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeFilename(value: string): string {
  return value.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(0, 140) || "upload";
}

function safePathPart(value: string): string {
  return value.replace(/[^\w\-]+/g, "_").slice(0, 96) || crypto.randomUUID();
}

function formulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function randomToken(expiresAt: string): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const nonce = base64Url(bytes);
  const payload = base64Url(new TextEncoder().encode(stableJson({ exp: expiresAt, nonce })));
  return `${payload}.${nonce}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function tokenExpiry(token: string): string {
  const payload = token.split(".")[0] || "";
  if (!payload) return "";

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = atob(padded);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!isRecord(parsed)) return "";
    return cleanText(parsed.exp);
  } catch {
    return "";
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function secureEqual(left: string, right: string): Promise<boolean> {
  const leftHash = await sha256Hex(left);
  const rightHash = await sha256Hex(right);
  return leftHash.length === rightHash.length && constantTimeEqual(leftHash, rightHash);
}

function constantTimeEqual(left: string, right: string): boolean {
  let result = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    result |= left.charCodeAt(index % left.length) ^ right.charCodeAt(index % right.length);
  }
  return result === 0;
}

function bearerToken(value: string | null): string {
  if (!value) return "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function tokenTtlMs(value: JsonValue | undefined): number {
  const days = typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(value, 365)) : DEFAULT_TOKEN_TTL_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

function withT(pathOrUrl: string, t: string): string {
  const base = pathOrUrl.startsWith("http") ? undefined : "https://mmdbkk.com";
  const url = new URL(pathOrUrl || "/", base);
  url.searchParams.set("t", t);
  return pathOrUrl.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
}

function corsFor(request: Request, env: Env): Headers {
  const headers = new Headers({
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-mmd-admin-secret",
    "access-control-max-age": "86400",
    vary: "Origin",
  });
  const origin = request.headers.get("origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
  }
  return headers;
}

function json(payload: JsonValue, status = 200, headers?: Headers): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
