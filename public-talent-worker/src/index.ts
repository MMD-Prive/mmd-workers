type TalentCategory = "PM" | "PC" | "PF";
type ReferralStatus =
  | "received"
  | "screening"
  | "needs_info"
  | "shortlisted"
  | "per_review"
  | "accepted"
  | "declined"
  | "archived";

type Env = {
  AIRTABLE_API_KEY: string;
  AIRTABLE_BASE_ID: string;
  AIRTABLE_TABLE_PUBLIC_TALENT_REFERRALS: string;
  PUBLIC_TALENT_ASSETS: R2Bucket;
  ALLOWED_ORIGINS?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_PUBLIC_TALENT_THREAD_ID?: string;
};

type ReferralInput = {
  talent_category: TalentCategory;
  talent_subtype?: string | null;
  referrer_name: string;
  referrer_contact: string;
  referrer_line_id?: string | null;
  talent_name: string;
  talent_location?: string | null;
  profile_url?: string | null;
  followers?: number | null;
  media_history?: string | null;
  reason_to_review: string;
  source_path?: string;
  consent: boolean;
  files?: Array<{ asset_ref: string; file_name?: string; file_type?: string; file_size?: number }>;
};

const TABLE_FIELDS = {
  referralId: "fldtmbLYAWhGUdviM",
  talentCategory: "fldjakaVRhnau8AzU",
  talentSubtype: "fldFEOOImAY4O1dnP",
  talentName: "fldobFgn6fhtcpC1t",
  talentLocation: "fld77CdkD8AuMXOhs",
  profileUrl: "fldyDZKbMrSpC2CLf",
  followerCount: "fldJa56lJnE0jUkXj",
  mediaHistory: "fldhKR820lk2TcuB5",
  reasonToReview: "fldO1OO0LAF2ZVy0A",
  referrerName: "fldq1FpMwkY9ikZ1Y",
  referrerContact: "fldeJkA0C4v4RqVM6",
  lineId: "fldu1fHJaLYhS1M4q",
  status: "fldlLaRBjH5doUBIh",
  reviewPriority: "fld4AG4z0GVqx4B87",
  duplicateKey: "fldjPFJtT1aPfAB8h",
  idempotencyKey: "fldfZpsxpAzFNUQaw",
  sourcePath: "fld80IZ1du8IB94DF",
  consent: "fldWMg9CH3oYxLioE",
  createdAt: "fldsM7xpRB3I08gxF",
  perDecisionRequired: "flda6Vcfo3MzJCufJ",
  publicStatusNoteTh: "fldLLMaEQ49qcZlBe",
  telegramNotifiedAt: "fldzNLWEbzTwdyYkZ",
  payloadJson: "fldId3DvGzZnpnseI"
} as const;

const CATEGORY_LABELS: Record<TalentCategory, string> = {
  PM: "PM — Public Model",
  PC: "PC — Public Creator",
  PF: "PF — Public Figure"
};

const SUBTYPES = new Set([
  "fashion",
  "commercial",
  "fitness",
  "pageant",
  "lifestyle",
  "instagram",
  "tiktok",
  "youtube",
  "mixed_creator",
  "actor",
  "artist",
  "host",
  "tv_personality",
  "sports_figure",
  "other"
]);

const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_FILES = 8;
const SOURCE_PATH = "/public/talent/referral";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json(request, env, { ok: true, service: "public-talent-worker" });
      }

      if (request.method === "POST" && url.pathname === "/v1/public-talent/upload") {
        return await handleUpload(request, env);
      }

      if (request.method === "POST" && url.pathname === "/v1/public-talent/referral") {
        return await handleReferral(request, env, ctx);
      }

      if (request.method === "GET" && url.pathname === "/v1/public-talent/referral/status") {
        return await handleStatus(request, env, url);
      }

      return error(request, env, "not_found", "Endpoint not found.", 404);
    } catch (cause) {
      console.error("public-talent-worker fatal", cause);
      return error(request, env, "internal_error", "ระบบไม่สามารถรับข้อมูลได้ในขณะนี้", 500);
    }
  }
} satisfies ExportedHandler<Env>;

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return error(request, env, "invalid_content_type", "ต้องส่งไฟล์แบบ multipart/form-data", 415);
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return error(request, env, "file_required", "ไม่พบไฟล์", 400);
  if (!MIME_TYPES.has(file.type)) return error(request, env, "invalid_file_type", "รองรับ JPG, PNG, WebP และ PDF", 400);
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return error(request, env, "invalid_file_size", "ไฟล์ต้องมีขนาดไม่เกิน 15 MB", 400);

  const assetRef = `pta_${crypto.randomUUID().replaceAll("-", "")}`;
  const safeName = sanitizeFileName(file.name || "upload");
  const key = `public-talent/intake/${assetRef}/${safeName}`;

  await env.PUBLIC_TALENT_ASSETS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      asset_ref: assetRef,
      original_name: safeName,
      uploaded_at: new Date().toISOString()
    }
  });

  return json(request, env, {
    ok: true,
    asset_ref: assetRef,
    file_name: safeName,
    file_type: file.type,
    file_size: file.size
  }, 201);
}

async function handleReferral(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return error(request, env, "invalid_content_type", "ต้องส่งข้อมูลแบบ application/json", 415);
  }

  const input = (await request.json()) as ReferralInput;
  const validation = validateInput(input);
  if (validation) return error(request, env, "validation_error", validation, 400);

  const idempotencyKey = clean(request.headers.get("Idempotency-Key"), 160) || clean((input as any).idempotency_key, 160) || "";
  if (idempotencyKey) {
    const existingByIdempotency = await findOne(env, `{${TABLE_FIELDS.idempotencyKey}}='${escapeFormula(idempotencyKey)}'`);
    if (existingByIdempotency) return referralResponse(request, env, existingByIdempotency, true);
  }

  const duplicateKey = await buildDuplicateKey(input);
  const existing = await findOne(env, `AND({${TABLE_FIELDS.duplicateKey}}='${escapeFormula(duplicateKey)}',NOT({${TABLE_FIELDS.status}}='archived'))`);
  if (existing) return referralResponse(request, env, existing, true);

  const files = await verifyAssets(env, input.files || []);
  if (files.length > MAX_FILES) return error(request, env, "too_many_files", `แนบไฟล์ได้ไม่เกิน ${MAX_FILES} ไฟล์`, 400);

  const referralId = makeReferralId();
  const now = new Date().toISOString();
  const status: ReferralStatus = "received";
  const fields: Record<string, unknown> = {
    [TABLE_FIELDS.referralId]: referralId,
    [TABLE_FIELDS.talentCategory]: CATEGORY_LABELS[input.talent_category],
    [TABLE_FIELDS.talentName]: clean(input.talent_name, 180),
    [TABLE_FIELDS.referrerName]: clean(input.referrer_name, 180),
    [TABLE_FIELDS.referrerContact]: clean(input.referrer_contact, 240),
    [TABLE_FIELDS.reasonToReview]: clean(input.reason_to_review, 5000),
    [TABLE_FIELDS.status]: status,
    [TABLE_FIELDS.reviewPriority]: "normal",
    [TABLE_FIELDS.duplicateKey]: duplicateKey,
    [TABLE_FIELDS.sourcePath]: SOURCE_PATH,
    [TABLE_FIELDS.consent]: true,
    [TABLE_FIELDS.createdAt]: now,
    [TABLE_FIELDS.perDecisionRequired]: input.talent_category === "PF",
    [TABLE_FIELDS.publicStatusNoteTh]: publicStatusCopy(status),
    [TABLE_FIELDS.payloadJson]: JSON.stringify(redactedPayload(input, files))
  };

  if (input.talent_subtype) fields[TABLE_FIELDS.talentSubtype] = input.talent_subtype;
  if (input.talent_location) fields[TABLE_FIELDS.talentLocation] = clean(input.talent_location, 180);
  if (input.profile_url) fields[TABLE_FIELDS.profileUrl] = normalizeUrl(input.profile_url);
  if (typeof input.followers === "number") fields[TABLE_FIELDS.followerCount] = Math.max(0, Math.floor(input.followers));
  if (input.media_history) fields[TABLE_FIELDS.mediaHistory] = clean(input.media_history, 5000);
  if (input.referrer_line_id) fields[TABLE_FIELDS.lineId] = clean(input.referrer_line_id, 120);
  if (idempotencyKey) fields[TABLE_FIELDS.idempotencyKey] = idempotencyKey;

  const record = await airtableCreate(env, fields);
  ctx.waitUntil(notifyTelegram(env, referralId, input, record.id));

  return json(request, env, {
    ok: true,
    referral_id: referralId,
    status,
    public_status_note: publicStatusCopy(status),
    next_url: `/public/talent-referral/received?referral_id=${encodeURIComponent(referralId)}`
  }, 201);
}

async function handleStatus(request: Request, env: Env, url: URL): Promise<Response> {
  const referralId = clean(url.searchParams.get("referral_id"), 80);
  if (!referralId) return error(request, env, "referral_id_required", "กรุณาระบุ referral_id", 400);

  const record = await findOne(env, `{${TABLE_FIELDS.referralId}}='${escapeFormula(referralId)}'`);
  if (!record) return error(request, env, "not_found", "ไม่พบรายการนี้", 404);

  const status = String(record.fields[TABLE_FIELDS.status] || "received") as ReferralStatus;
  return json(request, env, {
    ok: true,
    referral_id: referralId,
    status,
    public_status_note: String(record.fields[TABLE_FIELDS.publicStatusNoteTh] || publicStatusCopy(status))
  });
}

function validateInput(input: ReferralInput): string | null {
  if (!input || typeof input !== "object") return "ข้อมูลไม่ถูกต้อง";
  if (!(["PM", "PC", "PF"] as string[]).includes(input.talent_category)) return "กรุณาเลือกประเภท Talent";
  if (input.talent_subtype && !SUBTYPES.has(input.talent_subtype)) return "Talent subtype ไม่ถูกต้อง";
  if (!clean(input.referrer_name, 180)) return "กรุณาระบุชื่อผู้แนะนำ";
  if (!clean(input.referrer_contact, 240)) return "กรุณาระบุช่องทางติดต่อ";
  if (!clean(input.talent_name, 180)) return "กรุณาระบุชื่อ Talent";
  if (!clean(input.reason_to_review, 5000)) return "กรุณาระบุเหตุผลที่ MMD ควรพิจารณา";
  if (input.profile_url && !isHttpUrl(input.profile_url)) return "Profile URL ไม่ถูกต้อง";
  if (input.followers != null && (!Number.isFinite(input.followers) || input.followers < 0)) return "Follower count ไม่ถูกต้อง";
  if (input.consent !== true) return "ต้องยืนยันสิทธิ์ในการส่งข้อมูล";
  if ((input.files || []).length > MAX_FILES) return `แนบไฟล์ได้ไม่เกิน ${MAX_FILES} ไฟล์`;
  return null;
}

async function verifyAssets(env: Env, files: NonNullable<ReferralInput["files"]>) {
  const verified: Array<Record<string, unknown>> = [];
  for (const file of files) {
    if (!/^pta_[a-f0-9]{32}$/i.test(file.asset_ref || "")) throw new Error("invalid asset_ref");
    const listed = await env.PUBLIC_TALENT_ASSETS.list({ prefix: `public-talent/intake/${file.asset_ref}/`, limit: 1 });
    if (!listed.objects.length) throw new Error("uploaded asset not found");
    const object = listed.objects[0];
    verified.push({
      asset_ref: file.asset_ref,
      file_name: clean(file.file_name || object.key.split("/").pop(), 240),
      file_type: clean(file.file_type, 120),
      file_size: typeof file.file_size === "number" ? file.file_size : object.size
    });
  }
  return verified;
}

async function buildDuplicateKey(input: ReferralInput): Promise<string> {
  const profile = input.profile_url ? normalizeUrl(input.profile_url).toLowerCase() : "";
  const basis = profile || `${normalizeText(input.talent_name)}|${normalizeText(input.talent_location || "")}|${input.talent_category}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function redactedPayload(input: ReferralInput, files: Array<Record<string, unknown>>) {
  return {
    talent_category: input.talent_category,
    talent_subtype: input.talent_subtype || null,
    talent_name: clean(input.talent_name, 180),
    talent_location: clean(input.talent_location, 180) || null,
    profile_url: input.profile_url ? normalizeUrl(input.profile_url) : null,
    followers: typeof input.followers === "number" ? Math.floor(input.followers) : null,
    media_history: clean(input.media_history, 5000) || null,
    reason_to_review: clean(input.reason_to_review, 5000),
    referrer_name: clean(input.referrer_name, 180),
    referrer_contact: maskContact(input.referrer_contact),
    referrer_line_id: input.referrer_line_id ? "provided" : null,
    source_path: SOURCE_PATH,
    consent: true,
    files
  };
}

async function notifyTelegram(env: Env, referralId: string, input: ReferralInput, recordId: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const text = [
    "Public Talent Referral received",
    `ID: ${referralId}`,
    `Category: ${input.talent_category}${input.talent_subtype ? ` / ${input.talent_subtype}` : ""}`,
    `Talent: ${clean(input.talent_name, 120)}`,
    `Location: ${clean(input.talent_location, 120) || "-"}`,
    `Airtable record: ${recordId}`
  ].join("\n");

  const body: Record<string, unknown> = { chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true };
  if (env.TELEGRAM_PUBLIC_TALENT_THREAD_ID) body.message_thread_id = Number(env.TELEGRAM_PUBLIC_TALENT_THREAD_ID);

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) console.error("telegram notification failed", await response.text());
}

async function airtableCreate(env: Env, fields: Record<string, unknown>) {
  const response = await fetch(airtableUrl(env), {
    method: "POST",
    headers: airtableHeaders(env),
    body: JSON.stringify({ records: [{ fields }], typecast: false })
  });
  const body = await response.json() as any;
  if (!response.ok) throw new Error(`Airtable create failed: ${JSON.stringify(body)}`);
  return body.records[0] as { id: string; fields: Record<string, unknown> };
}

async function findOne(env: Env, formula: string) {
  const url = new URL(airtableUrl(env));
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", formula);
  const response = await fetch(url, { headers: airtableHeaders(env) });
  const body = await response.json() as any;
  if (!response.ok) throw new Error(`Airtable query failed: ${JSON.stringify(body)}`);
  return (body.records?.[0] || null) as { id: string; fields: Record<string, unknown> } | null;
}

function airtableUrl(env: Env) {
  return `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_TABLE_PUBLIC_TALENT_REFERRALS)}`;
}

function airtableHeaders(env: Env) {
  return { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, "Content-Type": "application/json" };
}

function referralResponse(request: Request, env: Env, record: { fields: Record<string, unknown> }, duplicate: boolean) {
  const referralId = String(record.fields[TABLE_FIELDS.referralId] || "");
  const status = String(record.fields[TABLE_FIELDS.status] || "received") as ReferralStatus;
  return json(request, env, {
    ok: true,
    duplicate,
    referral_id: referralId,
    status,
    public_status_note: String(record.fields[TABLE_FIELDS.publicStatusNoteTh] || publicStatusCopy(status)),
    next_url: `/public/talent-referral/received?referral_id=${encodeURIComponent(referralId)}`
  });
}

function publicStatusCopy(status: ReferralStatus) {
  const copy: Record<ReferralStatus, string> = {
    received: "MMD ได้รับข้อมูลแล้ว และกำลังจัดคิวตรวจสอบครับ",
    screening: "ข้อมูลอยู่ระหว่างการตรวจสอบเบื้องต้นครับ",
    needs_info: "MMD ต้องการข้อมูลเพิ่มเติมก่อนพิจารณาต่อครับ",
    shortlisted: "รายการนี้ผ่านการคัดกรองเบื้องต้นแล้วครับ",
    per_review: "รายการนี้อยู่ระหว่างการพิจารณาโดยเปอร์ครับ",
    accepted: "MMD จะติดต่อกลับเพื่อดำเนินการขั้นต่อไปครับ",
    declined: "MMD ยังไม่สามารถดำเนินการต่อกับรายการนี้ได้ครับ",
    archived: "รายการนี้ถูกปิดและเก็บไว้ในระบบแล้วครับ"
  };
  return copy[status] || copy.received;
}

function corsHeaders(request: Request, env: Env) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  });
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(request: Request, env: Env, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request, env) });
}

function error(request: Request, env: Env, code: string, message: string, status: number) {
  return json(request, env, { ok: false, error: { code, message } }, status);
}

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}

function normalizeText(value: string) {
  return clean(value, 240).toLowerCase().normalize("NFKC").replace(/\s+/g, " ");
}

function normalizeUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString();
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function escapeFormula(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sanitizeFileName(value: string) {
  return clean(value, 160).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upload";
}

function maskContact(value: string) {
  const text = clean(value, 240);
  if (text.length <= 4) return "provided";
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function makeReferralId() {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `ptr_${ymd}_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
}
