const AIRTABLE_API = "https://api.airtable.com/v0";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const TOKEN_BYTES = 32;
const DEFAULT_TOKEN_TTL_DAYS = 30;
const WORKER_NAME = "partners-worker";
const AGREEMENT_VERSION = "SIGIL_PARTNER_TERMS_V2";

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
}

interface AirtableRecord {
  id: string;
  fields?: Record<string, AirtableValue>;
}

interface AirtableListResponse {
  records?: AirtableRecord[];
}

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
  const fileCategory = cleanText(form.get("file_category")) || "partner_upload";
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
  const partnerName = payload.partner_name || payload.name || "Partner";
  const score = computePartnerScore(payload);
  const nowIso = new Date().toISOString();
  const uploads = [...(payload.uploaded_files || []), ...(payload.files || [])].filter(hasR2Key);
  const existingPartner = payload.email
    ? await findFirstByFormula(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, `{Email}="${formulaString(payload.email)}"`)
    : null;

  const partnerFields = compactFields({
    "Partner ID": existingPartner?.id || `ptr_${requestId}`,
    "Partner Name": partnerName,
    Name: partnerName,
    Email: cleanText(payload.email),
    Phone: cleanText(payload.phone),
    "LINE ID": cleanText(payload.line_id),
    Telegram: cleanText(payload.telegram),
    Company: cleanText(payload.company),
    Website: cleanText(payload.website),
    Notes: cleanText(payload.notes),
    "Request ID": requestId,
    "Referral Source": cleanText(payload.referral_source),
    "Partner Score": score,
    [FIELD_PARTNER_APPROVAL_STATUS]: existingPartner ? fieldString(existingPartner.fields, [FIELD_PARTNER_APPROVAL_STATUS, "Approval Status"]) || "needs_follow_up" : "needs_follow_up",
    "Created By Worker": WORKER_NAME,
    "Payload JSON": stableJson(payload),
  });

  const partnerRecord = existingPartner
    ? await airtableUpdate(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, existingPartner.id, partnerFields)
    : await airtableCreate(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, partnerFields);

  const modelApplicationRecord = shouldCreateModelApplication(payload, uploads)
    ? await airtableCreate(env, env.AIRTABLE_TABLE_MODEL_APPLICATIONS, compactFields({
      "Application ID": `app_${requestId}`,
      "Request ID": requestId,
      "Partner": [partnerRecord.id],
      "Talent Name": cleanText(payload.talent_name),
      "Talent Type": cleanText(payload.talent_type),
      "Model": cleanText(payload.model_id),
      "Status": "partner_submitted",
      "Created By Worker": WORKER_NAME,
      "Payload JSON": stableJson(payload),
    }))
    : null;

  const referralRecord = shouldCreateReferral(payload)
    ? await airtableCreate(env, env.AIRTABLE_TABLE_MODEL_REFERRALS, compactFields({
      "Referral ID": `ref_${requestId}`,
      "Request ID": requestId,
      "Partner": [partnerRecord.id],
      "Model": cleanText(payload.model_id),
      "Talent Name": cleanText(payload.talent_name),
      "Ownership Status": "pending_review",
      "Created By Worker": WORKER_NAME,
      Notes: cleanText(payload.notes),
    }))
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
      [FIELD_ASSET_FILE_CATEGORY]: cleanText(upload.file_category),
      [FIELD_ASSET_R2_KEY]: cleanText(upload.r2_key),
      [FIELD_ASSET_R2_BUCKET]: cleanText(upload.r2_bucket) || env.PARTNER_ASSETS_BUCKET_NAME,
      [FIELD_ASSET_STORAGE_PROVIDER]: "cloudflare_r2",
      [FIELD_ASSET_PORTFOLIO_URL]: cleanText(upload.portfolio_url),
      [FIELD_ASSET_UPLOADED_AT]: nowIso,
      [FIELD_ASSET_REVIEW_STATUS]: "pending_review",
      [FIELD_ASSET_VISIBILITY]: "private",
      [FIELD_ASSET_SIGNED_URL_STATUS]: "not_issued",
      [FIELD_ASSET_NOTES]: cleanText(payload.notes),
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
    "Approved At": new Date().toISOString(),
    "Approved By": "partners-worker-admin",
  };

  let recognizedLink = "";
  if (action === "recognized") {
    const token = randomToken();
    fields[FIELD_PARTNER_ACCESS_TOKEN_HASH] = await sha256Hex(token);
    fields["Access Token Expires At"] = new Date(Date.now() + tokenTtlMs(body.expires_in_days)).toISOString();
    fields["Agreement Version"] = "";
    fields["Agreement Accepted At"] = "";
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

  await airtableUpdate(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, partner.id, compactFields({
    "Agreement Version": cleanText(body.agreement_version) || AGREEMENT_VERSION,
    "Agreement Accepted At": new Date().toISOString(),
    Status: "Active",
  }));

  return { ok: true, partner_id: partner.id, redirect: withT(env.DASHBOARD_URL, cleanText(body.t)) };
}

async function handleDashboard(url: URL, env: Env): Promise<Record<string, JsonValue>> {
  const partner = await verifyPartnerByToken(url.searchParams.get("t"), env);
  const referrals = await listByFormula(env, env.AIRTABLE_TABLE_MODEL_REFERRALS, `FIND("${formulaString(partner.id)}", ARRAYJOIN({Partner}))`);
  const commissions = await listByFormula(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS, `OR({partner_id}="${formulaString(partner.id)}",{Partner ID}="${formulaString(partner.id)}")`);
  const summary = summarizePartner(partner, referrals, commissions);

  return {
    ok: true,
    summary: summaryToJson(summary),
    referrals: referrals.map(normalizeRecord),
    commissions: commissions.map(normalizeRecord),
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
  const response = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${path}`, {
    method,
    headers: airtableHeaders(env),
    body: JSON.stringify({ fields, typecast: true }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Airtable ${method} ${table} failed: ${response.status} ${text}`);
  }

  return JSON.parse(text) as AirtableRecord;
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
    return (await readJsonObject(request)) as PartnerRequestPayload;
  }

  const form = await request.formData();
  const filesJson = cleanText(form.get("uploaded_files")) || cleanText(form.get("files"));
  const payload: PartnerRequestPayload = {
    request_id: cleanText(form.get("request_id")),
    partner_name: cleanText(form.get("partner_name")) || cleanText(form.get("name")),
    email: cleanText(form.get("email")),
    phone: cleanText(form.get("phone")),
    line_id: cleanText(form.get("line_id")),
    telegram: cleanText(form.get("telegram")),
    company: cleanText(form.get("company")),
    website: cleanText(form.get("website")),
    notes: cleanText(form.get("notes")),
    referral_source: cleanText(form.get("referral_source")),
    talent_name: cleanText(form.get("talent_name")),
    talent_type: cleanText(form.get("talent_type")),
    model_id: cleanText(form.get("model_id")),
    uploaded_files: filesJson ? parseUploadArray(filesJson) : [],
  };

  return payload;
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

function normalizeRecord(record: AirtableRecord): Record<string, JsonValue> {
  return {
    id: record.id,
    fields: normalizeFields(record.fields || {}),
  };
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

function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
