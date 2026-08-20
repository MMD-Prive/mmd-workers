const AIRTABLE_API = "https://api.airtable.com/v0";

export const KENJI_KNOWLEDGE_PUBLIC_PUBLISHED_PATH = "/v1/public/kenji/knowledge/published";

const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const DEFAULT_TABLE_ID = "tblsLd1uVOtG2kHoU";
const PUBLIC_SAFE_ALLOWED_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);

const FIELD = Object.freeze({
  knowledgeId: "knowledge_id",
  title: "title",
  category: "category",
  language: "language",
  customerAnswer: "customer_answer",
  internalInstruction: "internal_instruction",
  allowedChannels: "allowed_channels",
  responseMode: "response_mode",
  riskLevel: "risk_level",
  status: "status",
  effectiveFrom: "effective_from",
  sourcePath: "source_path",
  sourceRef: "source_ref",
  owner: "owner",
  reviewedBy: "reviewed_by",
  reviewNote: "review_note",
  payloadJson: "payload_json",
});

const STATIC_PUBLIC_CARDS = Object.freeze([
  {
    id: "kenji_20_001_role",
    title: "Kenji AI 2.0 — Member Concierge Role",
    category: "admin_policy",
    language: "th",
    status: "active",
    response_mode: "handoff_required",
    risk_level: "medium",
    source_path: "line_ofc/kenji-2.0",
    customer_answer:
      "ผมช่วยดูเส้นทางที่เหมาะกับ request ของคุณก่อนนะครับ บาง request ต้องให้ MMD พิจารณาความเหมาะสมก่อน โดยเฉพาะ Private Talent, MMS Wellness, Partner Venue หรือ access ที่มีรายละเอียดเฉพาะ",
  },
  {
    id: "kenji_20_002_route_map",
    title: "Kenji AI 2.0 — MMD / MMS / Relax Spa by 9 Route Map",
    category: "booking",
    language: "th",
    status: "active",
    response_mode: "auto_reply_allowed",
    risk_level: "medium",
    source_path: "line_ofc/kenji-2.0",
    customer_answer:
      "ผมช่วยแยกเส้นทางให้ครับ: MMD Companion สำหรับ social / dining / event / appearance, MMS Wellness สำหรับ male massage หรือ recovery service, และ Partner Venue เช่น Relax Spa by 9 เมื่อจำเป็นต้องมีสถานที่หรืออุปกรณ์พร้อม ทั้งหมดต้องให้ MMD ตรวจความเหมาะสมก่อนยืนยันครับ",
  },
  {
    id: "kenji_20_008_membership_intake_catalog",
    title: "Kenji AI 2.0 — Membership Intake Service Catalog",
    category: "membership",
    language: "th",
    status: "active",
    response_mode: "handoff_required",
    risk_level: "high",
    source_path: "/member/membership",
    customer_answer:
      "ถ้าคุณสนใจ Membership Access ผมช่วยรับความสนใจและแยกเส้นทางให้ MMD review ก่อนครับ ขั้นตอนนี้เป็น intake และ review เท่านั้น ยังไม่ใช่การยืนยัน membership, talent availability, ราคา, booking หรือ access ครับ",
  },
  {
    id: "kenji_20_007_drop_690_guard",
    title: "Kenji AI 2.0 — Drop 690 Main Route Guard",
    category: "admin_policy",
    language: "th",
    status: "active",
    response_mode: "handoff_required",
    risk_level: "critical",
    source_path: "webflow/customer-facing-routing",
    customer_answer:
      "ผมจะไม่พาไปเส้น Public Access 690 แบบ pay-to-view หรือ instant unlock แล้วครับ ถ้าเป็น request ใหม่ ผมจะพาไป Reviewed Access / Membership Intake หรือ Payment Proof ตามบริบท และให้ MMD ตรวจความเหมาะสมก่อนเสมอ",
  },
  {
    id: "kenji_20_006_payment_proof",
    title: "Kenji AI 2.0 — Payment Proof Handoff",
    category: "payment",
    language: "th",
    status: "active",
    response_mode: "handoff_required",
    risk_level: "critical",
    source_path: "/confirm/payment-proof",
    customer_answer:
      "ถ้าต้องส่งหลักฐาน ผมจะพาไปหน้า Payment Proof ครับ: https://mmdbkk.com/confirm/payment-proof\n\nMMD จะรับหลักฐานไว้ตรวจยอดจริงก่อนอัปเดตขั้นตอนถัดไป หลักฐานอย่างเดียวยังไม่ถือว่ายืนยันยอดหรืออนุมัติ request ครับ",
  },
  {
    id: "kenji_20_009_web_forbidden_terms",
    title: "Kenji AI 2.0 — Web Forbidden Terms Guard",
    category: "admin_policy",
    language: "th",
    status: "active",
    response_mode: "handoff_required",
    risk_level: "critical",
    source_path: "webflow/customer-facing-copy",
    customer_answer:
      "ผมจะใช้ถ้อยคำที่ปลอดภัยและให้ MMD ตรวจสอบก่อนเสมอครับ ถ้ามีเรื่องชำระเงินหรือ access ผมจะพาไปหน้าที่ถูกต้องและใช้คำว่า รับหลักฐานแล้ว / รอตรวจยอดจริง / MMD ตรวจยอดจริง เท่านั้น",
  },
  {
    id: "kenji_20_011_care_back_2026",
    title: "Kenji AI 2.0 — CARE BACK 2026 Final Lock",
    category: "promotion",
    language: "th",
    status: "active",
    response_mode: "auto_reply_allowed",
    risk_level: "critical",
    source_path: "/promotion/6-years-care-back",
    customer_answer:
      "CARE BACK เป็นสิทธิ์ดูแลกลับที่ MMD ตรวจจากสถานะและประวัติจริงครับ เริ่มจากยืนยันผ่าน LINE แล้วส่ง Birthday Wish ให้บันทึกสำเร็จก่อน คูปองส่วนตัว 10% จึงจะเปิดได้ 1 ครั้งและมีอายุ 30 วันหลัง activation ส่วน Membership และ Points จะมีผลหลัง MMD ตรวจข้อมูล การสมัคร หรือการชำระเงินที่เกี่ยวข้องเรียบร้อยแล้วเท่านั้นครับ",
  },
]);

const HIDDEN_PUBLIC_CARD_RE = /\b(cloudflare|deploy|deployment|smoke|wrangler|worker|version id|route trigger|auth header|admin cookie|internal_token|confirm_key|secret)\b/i;

export function isKenjiPublicKnowledgeRequest(path, method = "GET") {
  const normalizedMethod = clean(method).toUpperCase();
  if (normalizedMethod === "OPTIONS" && path === KENJI_KNOWLEDGE_PUBLIC_PUBLISHED_PATH) return true;
  return (normalizedMethod === "GET" || normalizedMethod === "HEAD") && path === KENJI_KNOWLEDGE_PUBLIC_PUBLISHED_PATH;
}

export async function handleKenjiPublicKnowledgeRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();
  const cors = corsHeaders(request, env);

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (path !== KENJI_KNOWLEDGE_PUBLIC_PUBLISHED_PATH) {
    return withCors(json({ ok: false, error: "not_found" }, 404, request), cors);
  }
  if (!isAllowedOrigin(request, env)) {
    return withCors(json({ ok: false, error: "origin_not_allowed" }, 403, request), cors);
  }

  const result = await loadPublicKnowledgeCards(env, { publishedOnly: true, limit: 100 });
  const publicCards = result.cards.map(toPublicCard).filter(isPublicCard);
  const canonicalCards = STATIC_PUBLIC_CARDS.map(toPublicCard).filter(isPublicCard);
  const liveCards = mergePublicCards(publicCards);
  const cards = mergePublicCards(liveCards, canonicalCards);
  const dataStatus = publicCards.length ? result.data_status : "static_fallback";

  return withCors(jsonForMethod(request, {
    ok: true,
    source: "admin-worker",
    mode: "public_published_runtime",
    data_status: dataStatus,
    storage: publicStorageStatus(result.storage),
    coverage: {
      airtable_count: liveCards.length,
      canonical_fallback_count: Math.max(0, cards.length - liveCards.length),
    },
    cards,
    items: cards,
    count: cards.length,
    total: cards.length,
    has_more: false,
  }, result.status || 200), cors);
}

function mergePublicCards(...groups) {
  const merged = [];
  const seen = new Set();
  for (const group of groups) {
    for (const card of Array.isArray(group) ? group : []) {
      const id = clean(card.id || card.knowledge_id).toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(card);
    }
  }
  return merged;
}

async function loadPublicKnowledgeCards(env, query = {}) {
  const storage = storageStatus(env);
  let cards = [];
  let dataStatus = "static_fallback";

  if (storage.persisted) {
    try {
      cards = await fetchAirtableCards(env, query);
      dataStatus = cards.length ? "live" : "empty";
    } catch (error) {
      return {
        status: 200,
        storage: { persisted: false, provider: "static", reason: "airtable_unavailable", fallback: "static_public_cards" },
        data_status: "static_fallback",
        cards: STATIC_PUBLIC_CARDS.map(normalizeStaticCard),
      };
    }
  } else {
    cards = STATIC_PUBLIC_CARDS.map(normalizeStaticCard);
  }

  return {
    status: 200,
    storage,
    data_status: dataStatus,
    cards: filterCards(cards, query),
  };
}

async function fetchAirtableCards(env, query = {}) {
  const baseId = knowledgeBaseId(env);
  const tableId = knowledgeTableId(env);
  const limit = clampLimit(query.limit || 100);
  const params = new URLSearchParams({
    maxRecords: String(limit),
    pageSize: String(Math.min(limit, 100)),
  });

  const formula = airtableFormula(query);
  if (formula) params.set("filterByFormula", formula);
  params.append("sort[0][field]", FIELD.effectiveFrom);
  params.append("sort[0][direction]", "desc");
  params.append("sort[1][field]", FIELD.title);
  params.append("sort[1][direction]", "asc");

  const response = await fetch(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableId)}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) throw new Error(`airtable_public_knowledge_${response.status}`);
  const payload = await response.json();
  const records = Array.isArray(payload.records) ? payload.records : [];
  return records.map(recordToCard).filter(Boolean);
}

function recordToCard(record = {}) {
  const fields = record.fields || {};
  const id = clean(fields[FIELD.knowledgeId]) || record.id;
  const payload = parsePayload(fields[FIELD.payloadJson]);
  return compact({
    id,
    knowledge_id: id,
    title: clean(fields[FIELD.title]) || id,
    category: clean(fields[FIELD.category]) || payload.category,
    language: clean(fields[FIELD.language]) || payload.language || "th",
    customer_answer: clean(fields[FIELD.customerAnswer]) || payload.customer_answer,
    answer: clean(fields[FIELD.customerAnswer]) || payload.customer_answer,
    internal_instruction: clean(fields[FIELD.internalInstruction]) || payload.internal_instruction,
    allowed_channels: arrayValue(fields[FIELD.allowedChannels]),
    response_mode: clean(fields[FIELD.responseMode]) || payload.response_mode,
    risk_level: clean(fields[FIELD.riskLevel]) || payload.risk_level,
    status: clean(fields[FIELD.status]) || payload.status,
    effective_from: clean(fields[FIELD.effectiveFrom]),
    source_path: clean(fields[FIELD.sourcePath]) || payload.source_path,
    source_ref: clean(fields[FIELD.sourceRef]) || payload.source_ref,
    owner: clean(fields[FIELD.owner]) || payload.owner,
    reviewed_by: clean(fields[FIELD.reviewedBy]) || payload.reviewed_by,
    review_note: clean(fields[FIELD.reviewNote]) || payload.review_note,
    payload_json: payload,
  });
}

function normalizeStaticCard(card) {
  return compact({
    ...card,
    knowledge_id: card.id,
    allowed_channels: ["Webflow", "LINE_OFC"],
    effective_from: "2026-08-09",
    payload_json: {},
  });
}

function toPublicCard(card = {}) {
  const safeSourcePath = publicSourcePath(card.source_path);
  return compact({
    id: clean(card.id || card.knowledge_id),
    knowledge_id: clean(card.knowledge_id || card.id),
    title: clean(card.title),
    category: clean(card.category),
    language: clean(card.language) || "th",
    status: clean(card.status),
    response_mode: clean(card.response_mode),
    risk_level: clean(card.risk_level),
    source_path: safeSourcePath,
    customer_answer: clean(card.customer_answer || card.answer),
    answer: clean(card.customer_answer || card.answer),
  });
}

function isPublicCard(card = {}) {
  const id = clean(card.id || card.knowledge_id).toLowerCase();
  if (!id || /deploy|cloudflare|smoke|wrangler|worker/.test(id)) return false;
  if (!clean(card.customer_answer || card.answer)) return false;
  const status = clean(card.status).toLowerCase();
  if (status && !["active", "approved", "published"].includes(status)) return false;
  const unsafeText = [
    card.title,
    card.source_path,
    card.source_ref,
    card.internal_instruction,
    card.review_note,
    JSON.stringify(card.payload_json || {}),
  ].map(clean).join(" ");
  return !HIDDEN_PUBLIC_CARD_RE.test(unsafeText);
}

function publicSourcePath(value = "") {
  const path = clean(value);
  if (!path) return "";
  if (/^(internal|admin|docs\/knowledge)/i.test(path)) return "";
  if (/cloudflare|deploy|smoke|wrangler|worker/i.test(path)) return "";
  return path;
}

function airtableFormula(query = {}) {
  const filters = [];
  if (query.publishedOnly) filters.push("OR({status} = 'active', {status} = 'approved', {status} = 'published')");
  if (!filters.length) return "";
  return filters.length === 1 ? filters[0] : `AND(${filters.join(",")})`;
}

function filterCards(cards, query = {}) {
  let result = Array.isArray(cards) ? cards.slice() : [];
  if (query.publishedOnly) result = result.filter((card) => ["active", "approved", "published"].includes(clean(card.status).toLowerCase()));
  return result.slice(0, clampLimit(query.limit || 100));
}

function storageStatus(env = {}) {
  const configured = Boolean(env.AIRTABLE_API_KEY && knowledgeBaseId(env) && knowledgeTableId(env));
  return configured
    ? { persisted: true, provider: "airtable" }
    : { persisted: false, provider: "static", reason: "missing_airtable_env", fallback: "static_public_cards" };
}

function publicStorageStatus(storage = {}) {
  return compact({
    persisted: Boolean(storage.persisted),
    provider: storage.persisted ? "airtable" : "static",
    fallback: storage.fallback,
  });
}

function knowledgeBaseId(env = {}) {
  return clean(env.AIRTABLE_KENJI_KNOWLEDGE_BASE_ID || env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID);
}

function knowledgeTableId(env = {}) {
  return clean(env.AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID || env.AIRTABLE_KNOWLEDGE_TABLE_ID || DEFAULT_TABLE_ID);
}

function isAllowedOrigin(request, env = {}) {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return true;
  const allowed = clean(env.ALLOWED_ORIGINS)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!allowed.length) return PUBLIC_SAFE_ALLOWED_ORIGINS.has(origin) || origin.endsWith(".mmdbkk.com");
  return allowed.includes(origin);
}

function corsHeaders(request, env = {}) {
  const headers = new Headers();
  const origin = request.headers.get("Origin") || "";
  if (origin && isAllowedOrigin(request, env)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  cors.forEach((value, key) => headers.set(key, value));
  headers.set("Cache-Control", "no-store");
  headers.set("X-MMD-Kenji-Knowledge", "public-runtime-v1");
  return new Response(response.body, { status: response.status, headers });
}

function jsonForMethod(request, data, status = 200) {
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status, headers: { "Content-Type": "application/json" } });
  }
  return json(data, status, request);
}

function json(data, status = 200, request = null) {
  const body = request && request.method.toUpperCase() === "HEAD" ? null : JSON.stringify(stripUndefined(data));
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text = clean(value);
  return text ? [text] : [];
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, stripUndefined(item)]));
  return value;
}

function parsePayload(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = clean(value);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function clampLimit(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return 25;
  return Math.min(number, 100);
}
