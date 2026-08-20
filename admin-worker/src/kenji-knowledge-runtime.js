const AIRTABLE_API = "https://api.airtable.com/v0";

export const KENJI_KNOWLEDGE_AUTH_ME_PATH = "/v1/admin/auth/me";
export const KENJI_KNOWLEDGE_META_PATH = "/v1/admin/kenji/knowledge/meta";
export const KENJI_KNOWLEDGE_LIST_PATH = "/v1/admin/kenji/knowledge/list";
export const KENJI_KNOWLEDGE_DRAFT_PATH = "/v1/admin/kenji/knowledge/draft";
export const KENJI_KNOWLEDGE_PUBLISHED_PATH = "/v1/internal/kenji/knowledge/published";
export const KENJI_KNOWLEDGE_DETAIL_PREFIX = "/v1/admin/kenji/knowledge/";

const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const DEFAULT_TABLE_ID = "tblsLd1uVOtG2kHoU";
const ADMIN_GATE_SESSION_COOKIE = "mmd_admin_gate_v1";
const ADMIN_GATE_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_GATE_ALLOWED_BASE_URLS = new Set([
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

const STATIC_CANONICAL_CARDS = Object.freeze([
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
    internal_instruction:
      "Kenji is routing brain only. Never sell access, approve, confirm funds, confirm booking, or act as final approver.",
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
    internal_instruction:
      "Collect minimum brief and route only. Do not confirm venue, model, therapist, availability, assignment, booking, or price.",
  },
  {
    id: "kenji_20_008_membership_intake_catalog",
    title: "Kenji AI 2.0 — MY MMD Canonical Route Map",
    category: "membership",
    language: "th",
    status: "active",
    response_mode: "auto_reply_allowed",
    risk_level: "medium",
    source_path: "/sigil/member/membership",
    customer_answer:
      "ถ้าต้องการจัดการ MY MMD ผมพาไปหน้าที่ตรงกับเรื่องได้ครับ: MY MMD Home /member/dashboard สำหรับดูสถานะและทางเข้าหลัก, Membership /sigil/member/membership สำหรับเลือกแพ็กเกจ สมัคร ต่ออายุ อัปเกรด หรือไปต่อเรื่องการชำระเงิน, Renewal / Access Conditions /sigil/membership สำหรับอ่านเงื่อนไขการต่ออายุและสิทธิ์, Renewal payment /sigil/pay/renewal สำหรับขั้นตอนชำระต่ออายุ, Booking Request /sigil/booking สำหรับส่งคำขอจอง และ Payment Proof /confirm/payment-proof สำหรับส่งหลักฐานการชำระเงินครับ การชำระเงิน สิทธิ์สมาชิก การจอง และ access จะยืนยันได้หลัง MMD ตรวจสอบจากข้อมูลทางการแล้วเท่านั้นครับ",
    internal_instruction:
      "Canonical MY MMD route map: /member/dashboard = MY MMD Home / member status hub; /sigil/member/membership = canonical member package selection and member-facing membership actions; /sigil/membership = renewal/access conditions page, not checkout; /sigil/pay/renewal = renewal payment flow; /sigil/booking = booking request gate; /confirm/payment-proof = payment evidence submission; /sigil/onboarding = onboarding entry when a flow explicitly requires onboarding. /member/membership is legacy compatibility and must not be recommended in new replies. Preserve query params t, code, promo, session_id, package when present. Never confirm payment, membership, booking, availability, Black Card, VIP, SVIP, or access from chat alone.",
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
    internal_instruction:
      "Drop Public Access 690 as main route. Legacy received/proof pages may remain as evidence/status compatibility only. Block pay-to-view, instant unlock, and old upstream wording.",
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
    internal_instruction:
      "Proof is evidence only. Never say paid, verified, approved, activated, successful, or confirmed before Money Truth confirms.",
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
    internal_instruction:
      "Forbidden customer-facing examples: Payment Successful, Paid, Verified, Approved, ชำระเงินสำเร็จแล้ว, อนุมัติแล้ว, ยืนยันแล้ว, จ่ายแล้ว, ระบบ, ทีม, Admin, Staff, Operator, Handler, MMD Assistant, MMS Assistant, Chang, Ewvon, Ops Owner, Sales Owner. Preferred: MMD, Companion, รับหลักฐานแล้ว, รอตรวจยอดจริง, MMD ตรวจยอดจริง, ส่งหลักฐานให้ MMD ตรวจสอบ.",
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
    internal_instruction:
      "Final lock 2026-08-19. One idempotent claim only. Login/identity alone never issues a coupon or points. Wish saved is mandatory before coupon activation. Current active/grace: +180 days from real expiry, no automatic bonus. Expired: verified renewal/payment and restored active/grace before +90 days and +150 points. New Standard +150, New Premium +250, approved special selection up to +350 after verified membership/payment. Trial/Guest Pass has no automatic welcome points. Reconcile only verified payments at 100 THB = 1 Point. Proof is evidence only. Black Card is review only; VIP is not a package; SVIP is private Per review. Reject new claims after 2026-09-30 while allowing existing verified claims to resume. Never mutate payment, membership, points, coupon, Black Card, or SVIP from browser/chat.",
  },
]);

export function isKenjiKnowledgeRequest(path, method = "GET") {
  const normalizedMethod = clean(method).toUpperCase();
  if (normalizedMethod === "OPTIONS" && isKenjiKnowledgePath(path)) return true;
  if ((normalizedMethod === "GET" || normalizedMethod === "HEAD") && path === KENJI_KNOWLEDGE_AUTH_ME_PATH) return true;
  if ((normalizedMethod === "GET" || normalizedMethod === "HEAD") && path === KENJI_KNOWLEDGE_META_PATH) return true;
  if ((normalizedMethod === "GET" || normalizedMethod === "HEAD") && path === KENJI_KNOWLEDGE_LIST_PATH) return true;
  if ((normalizedMethod === "GET" || normalizedMethod === "HEAD") && path === KENJI_KNOWLEDGE_PUBLISHED_PATH) return true;
  if ((normalizedMethod === "POST" || normalizedMethod === "HEAD") && path === KENJI_KNOWLEDGE_DRAFT_PATH) return true;
  if ((normalizedMethod === "GET" || normalizedMethod === "HEAD") && isKnowledgeDetailPath(path)) return true;
  return false;
}

export function isKenjiKnowledgePath(path) {
  return path === KENJI_KNOWLEDGE_AUTH_ME_PATH ||
    path === KENJI_KNOWLEDGE_META_PATH ||
    path === KENJI_KNOWLEDGE_LIST_PATH ||
    path === KENJI_KNOWLEDGE_DRAFT_PATH ||
    path === KENJI_KNOWLEDGE_PUBLISHED_PATH ||
    isKnowledgeDetailPath(path);
}

export async function handleKenjiKnowledgeRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();
  const cors = corsHeaders(request, env);

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const originOk = isAllowedOrigin(request, env);
  if (!originOk) return withCors(json({ ok: false, error: "origin_not_allowed" }, 403, request), cors);

  if (!isKenjiKnowledgeRequest(path, method)) {
    return withCors(json({ ok: false, error: "not_found" }, 404, request), cors);
  }

  const authed = isAuthed(request, env);
  if (!authed) {
    return withCors(json({ ok: false, authenticated: false, error: "unauthorized" }, 401, request), cors);
  }

  if (path === KENJI_KNOWLEDGE_AUTH_ME_PATH) {
    return withCors(jsonForMethod(request, {
      ok: true,
      authenticated: true,
      worker: "admin-worker",
      scope: "internal_admin",
      source: "admin-worker",
      mode: "kenji_knowledge_runtime_auth",
    }), cors);
  }

  if (path === KENJI_KNOWLEDGE_META_PATH) {
    const storage = storageStatus(env);
    return withCors(jsonForMethod(request, {
      ok: true,
      source: "admin-worker",
      mode: "kenji_knowledge_runtime",
      storage,
      table: storage.table,
      supports: {
        list: true,
        detail: true,
        draft_persist: storage.persisted,
        published_runtime: true,
        fallback_static_cards: true,
      },
      static_count: STATIC_CANONICAL_CARDS.length,
    }), cors);
  }

  if (path === KENJI_KNOWLEDGE_LIST_PATH) {
    const query = parseListQuery(url.searchParams);
    const result = await loadKnowledgeCards(env, { ...query, publishedOnly: false });
    return withCors(jsonForMethod(request, {
      ok: true,
      source: "admin-worker",
      mode: "kenji_knowledge_list",
      data_status: result.cards.length ? result.data_status : "empty",
      storage: result.storage,
      query,
      cards: result.cards,
      items: result.cards,
      count: result.cards.length,
      total: result.cards.length,
      has_more: false,
    }, result.status), cors);
  }

  if (path === KENJI_KNOWLEDGE_PUBLISHED_PATH) {
    const result = await loadKnowledgeCards(env, { publishedOnly: true, limit: 100 });
    return withCors(jsonForMethod(request, {
      ok: true,
      source: "admin-worker",
      mode: "published_runtime",
      data_status: result.cards.length ? result.data_status : "empty",
      storage: result.storage,
      cards: result.cards,
      items: result.cards,
      count: result.cards.length,
      total: result.cards.length,
      has_more: false,
    }, result.status), cors);
  }

  if (path === KENJI_KNOWLEDGE_DRAFT_PATH) {
    if (method === "HEAD") {
      return withCors(jsonForMethod(request, { ok: true, source: "admin-worker", mode: "kenji_knowledge_draft" }), cors);
    }
    const parsed = await parseJsonObject(request);
    if (!parsed.ok) return withCors(json({ ok: false, error: "invalid_json" }, 400, request), cors);
    const result = await persistDraft(env, parsed.data);
    return withCors(json({
      ok: result.ok,
      source: "admin-worker",
      mode: "kenji_knowledge_draft",
      draft_received: true,
      storage: result.storage,
      card: result.card || null,
      record_id: result.record_id || null,
      error: result.error || undefined,
    }, result.status), cors);
  }

  if (isKnowledgeDetailPath(path)) {
    const id = path.slice(KENJI_KNOWLEDGE_DETAIL_PREFIX.length);
    if (!isSafeId(id)) return withCors(json({ ok: false, error: "invalid_id", id }, 400, request), cors);
    const result = await loadKnowledgeCards(env, { publishedOnly: false, q: id, limit: 100 });
    const card = result.cards.find((item) => item.id === id || item.knowledge_id === id);
    if (!card) return withCors(json({ ok: false, source: "admin-worker", mode: "kenji_knowledge_read", error: "not_found", id, storage: result.storage }, 404, request), cors);
    return withCors(jsonForMethod(request, { ok: true, source: "admin-worker", mode: "kenji_knowledge_read", storage: result.storage, card }), cors);
  }

  return withCors(json({ ok: false, error: "not_found" }, 404, request), cors);
}

async function loadKnowledgeCards(env, query = {}) {
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
        storage: { ...storage, persisted: false, reason: String(error?.message || error || "airtable_failed"), fallback: "static_canonical_cards" },
        data_status: "static_fallback",
        cards: filterCards(STATIC_CANONICAL_CARDS.map(normalizeStaticCard), query),
      };
    }
  } else {
    cards = STATIC_CANONICAL_CARDS.map(normalizeStaticCard);
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
  if (!response.ok) throw new Error(`airtable_knowledge_${response.status}`);
  const payload = await response.json();
  const records = Array.isArray(payload.records) ? payload.records : [];
  return records.map(recordToCard).filter(Boolean);
}

async function persistDraft(env, body = {}) {
  const storage = storageStatus(env);
  const card = normalizeDraft(body);
  if (!storage.persisted) {
    return { ok: true, status: 200, storage, card, record_id: null };
  }

  const response = await fetch(`${AIRTABLE_API}/${knowledgeBaseId(env)}/${encodeURIComponent(knowledgeTableId(env))}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records: [{ fields: cardToAirtableFields(card) }], typecast: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, storage, card, error: payload.error?.message || `airtable_create_${response.status}` };
  }
  const record = Array.isArray(payload.records) ? payload.records[0] : null;
  return { ok: true, status: 200, storage, card: record ? recordToCard(record) : card, record_id: record?.id || null };
}

function recordToCard(record = {}) {
  const fields = record.fields || {};
  const id = clean(fields[FIELD.knowledgeId]) || record.id;
  const payload = parsePayload(fields[FIELD.payloadJson]);
  return compact({
    id,
    knowledge_id: id,
    record_id: record.id,
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
    updated_at: record.createdTime || clean(fields.updated_at),
  });
}

function normalizeStaticCard(card) {
  return compact({
    ...card,
    knowledge_id: card.id,
    allowed_channels: ["LINE_OFC", "Webflow", "SIGIL Board", "Admin Console"],
    effective_from: "2026-08-20",
    owner: "Boss Per",
    reviewed_by: "Boss Per",
    payload_json: {},
  });
}

function normalizeDraft(body = {}) {
  const title = clean(body.title || body.name || "Kenji Knowledge Draft").slice(0, 180);
  const id = sanitizeId(body.knowledge_id || body.id || `kenji_draft_${Date.now().toString(36)}`);
  const status = clean(body.status || (body.publish === true ? "active" : "draft"));
  return compact({
    id,
    knowledge_id: id,
    title,
    category: clean(body.category || "admin_policy"),
    language: clean(body.language || "th"),
    customer_answer: clean(body.customer_answer || body.answer || body.copy || body.content || ""),
    answer: clean(body.customer_answer || body.answer || body.copy || body.content || ""),
    internal_instruction: clean(body.internal_instruction || body.instruction || body.note || ""),
    allowed_channels: arrayValue(body.allowed_channels || body.channels || ["Admin Console"]),
    response_mode: clean(body.response_mode || "draft_only"),
    risk_level: clean(body.risk_level || "medium"),
    status,
    effective_from: clean(body.effective_from || new Date().toISOString().slice(0, 10)),
    source_path: clean(body.source_path || "internal/admin/kenji-knowledge"),
    source_ref: clean(body.source_ref || "kenji-knowledge-runtime"),
    owner: clean(body.owner || "Boss Per"),
    reviewed_by: clean(body.reviewed_by || ""),
    review_note: clean(body.review_note || "Created through Kenji Knowledge runtime draft endpoint."),
    payload_json: body.payload_json && typeof body.payload_json === "object" ? body.payload_json : {},
  });
}

function cardToAirtableFields(card) {
  return compact({
    [FIELD.knowledgeId]: card.knowledge_id || card.id,
    [FIELD.title]: card.title,
    [FIELD.category]: card.category,
    [FIELD.language]: card.language,
    [FIELD.customerAnswer]: card.customer_answer,
    [FIELD.internalInstruction]: card.internal_instruction,
    [FIELD.allowedChannels]: card.allowed_channels,
    [FIELD.responseMode]: card.response_mode,
    [FIELD.riskLevel]: card.risk_level,
    [FIELD.status]: card.status,
    [FIELD.effectiveFrom]: card.effective_from,
    [FIELD.sourcePath]: card.source_path,
    [FIELD.sourceRef]: card.source_ref,
    [FIELD.owner]: card.owner,
    [FIELD.reviewedBy]: card.reviewed_by,
    [FIELD.reviewNote]: card.review_note,
    [FIELD.payloadJson]: JSON.stringify(card.payload_json || {}, null, 2),
  });
}

function airtableFormula(query = {}) {
  const filters = [];
  if (query.publishedOnly) {
    filters.push("OR({status} = 'active', {status} = 'approved')");
  } else if (query.status) {
    const status = query.status === "published" ? "active" : query.status;
    filters.push(`{status} = '${escapeFormula(status)}'`);
  }
  if (query.language) filters.push(`{language} = '${escapeFormula(query.language)}'`);
  if (query.category) filters.push(`{category} = '${escapeFormula(query.category)}'`);
  if (query.q) {
    const q = escapeFormula(query.q.toLowerCase());
    filters.push(`OR(FIND('${q}', LOWER({knowledge_id} & '')), FIND('${q}', LOWER({title} & '')), FIND('${q}', LOWER({customer_answer} & '')), FIND('${q}', LOWER({internal_instruction} & '')))`);
  }
  if (!filters.length) return "";
  return filters.length === 1 ? filters[0] : `AND(${filters.join(",")})`;
}

function filterCards(cards, query = {}) {
  let result = Array.isArray(cards) ? cards.slice() : [];
  if (query.publishedOnly) result = result.filter((card) => ["active", "approved", "published"].includes(clean(card.status).toLowerCase()));
  if (query.status) result = result.filter((card) => clean(card.status).toLowerCase() === clean(query.status).toLowerCase() || (query.status === "published" && clean(card.status).toLowerCase() === "active"));
  if (query.language) result = result.filter((card) => clean(card.language).toLowerCase() === clean(query.language).toLowerCase());
  if (query.category) result = result.filter((card) => clean(card.category).toLowerCase() === clean(query.category).toLowerCase());
  if (query.q) {
    const needle = clean(query.q).toLowerCase();
    result = result.filter((card) => JSON.stringify(card).toLowerCase().includes(needle));
  }
  return result.slice(0, clampLimit(query.limit || 100));
}

function parseListQuery(params) {
  return {
    q: clean(params.get("q")) || null,
    status: clean(params.get("status")) || null,
    language: clean(params.get("language")) || null,
    category: clean(params.get("category") || params.get("lane")) || null,
    limit: clampLimit(params.get("limit") || 25),
  };
}

function storageStatus(env = {}) {
  const configured = Boolean(env.AIRTABLE_API_KEY && knowledgeBaseId(env) && knowledgeTableId(env));
  return configured
    ? { persisted: true, provider: "airtable", base_id: knowledgeBaseId(env), table: knowledgeTableId(env) }
    : { persisted: false, reason: "missing_airtable_env", fallback: "static_canonical_cards" };
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
  if (!allowed.length) return true;
  return allowed.includes(origin);
}

function isAuthed(request, env = {}) {
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (bearer && ((env.ADMIN_BEARER && bearer === env.ADMIN_BEARER) || (env.INTERNAL_TOKEN && bearer === env.INTERNAL_TOKEN))) return true;

  const confirmKey = request.headers.get("X-Confirm-Key") || "";
  if (confirmKey && env.CONFIRM_KEY && confirmKey === env.CONFIRM_KEY) return true;

  const session = readAdminGateSession(request);
  if (!session || session.ok !== true) return false;
  if (!session.baseUrl || !ADMIN_GATE_ALLOWED_BASE_URLS.has(session.baseUrl)) return false;
  if (!Number.isFinite(session.at) || Date.now() - session.at > ADMIN_GATE_TTL_MS) return false;
  const sessionBearer = clean(session.bearer);
  if (sessionBearer && ((env.ADMIN_BEARER && sessionBearer === env.ADMIN_BEARER) || (env.INTERNAL_TOKEN && sessionBearer === env.INTERNAL_TOKEN))) return true;
  const sessionConfirmKey = clean(session.confirmKey);
  if (sessionConfirmKey && env.CONFIRM_KEY && sessionConfirmKey === env.CONFIRM_KEY) return true;
  return false;
}

function readAdminGateSession(request) {
  const raw = parseCookieMap(request.headers.get("Cookie") || "").get(ADMIN_GATE_SESSION_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(atob(decodeURIComponent(raw)));
  } catch (_) {
    return null;
  }
}

function parseCookieMap(header = "") {
  const map = new Map();
  for (const part of String(header || "").split(";")) {
    const [name, ...rest] = part.split("=");
    const key = clean(name);
    if (!key) continue;
    map.set(key, rest.join("=").trim());
  }
  return map;
}

function corsHeaders(request, env = {}) {
  const headers = new Headers();
  const origin = request.headers.get("Origin") || "";
  if (origin && isAllowedOrigin(request, env)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET,POST,HEAD,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  cors.forEach((value, key) => headers.set(key, value));
  headers.set("Cache-Control", "no-store");
  headers.set("X-MMD-Kenji-Knowledge", "runtime-v1");
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

async function parseJsonObject(request) {
  try {
    const data = await request.json();
    return { ok: Boolean(data && typeof data === "object" && !Array.isArray(data)), data };
  } catch (_) {
    return { ok: false, data: null };
  }
}

function isKnowledgeDetailPath(path) {
  return path.startsWith(KENJI_KNOWLEDGE_DETAIL_PREFIX) && ![
    KENJI_KNOWLEDGE_META_PATH,
    KENJI_KNOWLEDGE_LIST_PATH,
    KENJI_KNOWLEDGE_DRAFT_PATH,
  ].includes(path);
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

function sanitizeId(value) {
  const id = clean(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return isSafeId(id) ? id : `kenji_${Date.now().toString(36)}`;
}

function isSafeId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/.test(clean(value));
}

function escapeFormula(value) {
  return clean(value).replace(/'/g, "\\'");
}