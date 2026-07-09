const WORKER_NAME_FALLBACK = "sigil-worker";
const MODE = "read_only";
const SOURCE = "worker";

const BOARD_STATUS_PATH = "/v1/sigil/board/status";
const BOARD_QUEUE_PATH = "/v1/sigil/board/queue";
const BOARD_CARDS_KV_KEY = "sigil:board:v1:cards";
const BOARD_META_KV_KEY = "sigil:board:v1:meta";
const DEFAULT_QUEUE_LIMIT = 50;
const MAX_QUEUE_LIMIT = 100;

const RECOVERY_COUPON_STATUS_PATH = "/api/recovery/coupon/status";
const RECOVERY_COUPON_ACK_PATH = "/api/recovery/coupon/ack";
const RECOVERY_COUPON_KV_PREFIX = "sigil:recovery:coupon:v1:";
const DEFAULT_RECOVERY_COUPON = Object.freeze({
  coupon_id: "CPN-APOLOGY-JET-001",
  discount_percent: 10,
  client_name: "คุณเจต",
  status: "Active",
  validity: "Valid 60 days",
});

const EMPTY_COUNTS = Object.freeze({
  critical: 0,
  ready_for_per: 0,
  payment_pending: 0,
  need_info: 0,
});

const ALLOWED_LANES = new Set([
  "Payment",
  "Member",
  "Booking",
  "Partner",
  "Model",
  "Private Review",
  "Black Card",
  "Route",
  "Risk",
  "Need Info",
]);
const ALLOWED_OWNERS = new Set(["MMD", "Per", "Kenji", "Ewvon", "Yuki", "Admin"]);
const ALLOWED_PRIORITIES = new Set(["Critical", "High", "Medium", "Low"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = corsFor(request, env);

    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

      if (url.pathname === "/health" || url.pathname === "/ping") {
        if (request.method !== "GET") return methodNotAllowed(corsHeaders);
        return json({ ok: true, worker: workerName(env), mode: MODE }, 200, corsHeaders);
      }

      if (isRecoveryCouponPath(url.pathname)) {
        return handleRecoveryCouponRequest(request, env, corsHeaders);
      }

      if (url.pathname === BOARD_STATUS_PATH || url.pathname === BOARD_QUEUE_PATH) {
        if (request.method !== "GET") return methodNotAllowed(corsHeaders);
        const cards = await loadBoardCards(env);
        if (url.pathname === BOARD_STATUS_PATH) return json(statusResponse(cards), 200, corsHeaders);
        return json(queueResponse(cards, queueLimitFrom(url)), 200, corsHeaders);
      }

      return json({ ok: false, error: "not_found" }, 404, corsHeaders);
    } catch (error) {
      console.error(JSON.stringify({ worker: workerName(env), error: errorMessage(error) }));
      const emptyCards = [];
      if (url.pathname === BOARD_STATUS_PATH) return json(statusResponse(emptyCards), 200, corsHeaders);
      if (url.pathname === BOARD_QUEUE_PATH) return json(queueResponse(emptyCards, queueLimitFrom(url)), 200, corsHeaders);
      if (isRecoveryCouponPath(url.pathname)) {
        return json({ ok: false, error: "internal_error", message: errorMessage(error) }, 500, corsHeaders);
      }
      return json({ ok: false, error: "internal_error" }, 500, corsHeaders);
    }
  },
};

function statusResponse(cards, lastChecked = new Date().toISOString()) {
  return {
    ok: true,
    source: SOURCE,
    mode: MODE,
    last_checked: lastChecked,
    counts: countCards(cards),
  };
}

function queueResponse(cards, limit = DEFAULT_QUEUE_LIMIT) {
  const sortedCards = sortCards(cards);
  const returnedCards = sortedCards.slice(0, limit);
  return {
    ok: true,
    source: SOURCE,
    mode: MODE,
    total_cards: cards.length,
    returned_cards: returnedCards.length,
    limit,
    cards: returnedCards,
  };
}

async function handleRecoveryCouponRequest(request, env, corsHeaders) {
  const url = new URL(request.url);

  if (url.pathname === RECOVERY_COUPON_STATUS_PATH) {
    if (request.method !== "GET") return methodNotAllowed(corsHeaders, "GET, OPTIONS");
    return handleRecoveryCouponStatus(request, env, corsHeaders);
  }

  if (url.pathname === RECOVERY_COUPON_ACK_PATH) {
    if (request.method !== "POST") return methodNotAllowed(corsHeaders, "POST, OPTIONS");
    return handleRecoveryCouponAck(request, env, corsHeaders);
  }

  return json({ ok: false, error: "not_found" }, 404, corsHeaders);
}

async function handleRecoveryCouponStatus(request, env, corsHeaders) {
  const url = new URL(request.url);
  const lookup = recoveryCouponLookupFromUrl(url);
  const stored = await readStoredRecoveryCoupon(env, lookup);
  const coupon = normalizeRecoveryCoupon({
    ...DEFAULT_RECOVERY_COUPON,
    ...stored,
    coupon_id: stored?.coupon_id || lookup.coupon_id || DEFAULT_RECOVERY_COUPON.coupon_id,
    token: stored?.token || lookup.token || null,
    session_id: stored?.session_id || lookup.session_id || null,
  });

  return json(
    {
      ok: true,
      source: stored ? "kv" : "fallback",
      mode: MODE,
      coupon,
    },
    200,
    corsHeaders,
  );
}

async function handleRecoveryCouponAck(request, env, corsHeaders) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return json({ ok: false, error: "invalid_json", message: "valid JSON payload is required" }, 400, corsHeaders);
  }

  const couponId = safeText(body.coupon_id || body.couponId || DEFAULT_RECOVERY_COUPON.coupon_id, DEFAULT_RECOVERY_COUPON.coupon_id, 120);
  if (!couponId) {
    return json({ ok: false, error: "missing_coupon_id", message: "coupon_id is required" }, 400, corsHeaders);
  }

  const now = new Date().toISOString();
  const coupon = normalizeRecoveryCoupon({
    ...DEFAULT_RECOVERY_COUPON,
    coupon_id: couponId,
    discount_percent: readNumber(body.discount_percent || body.discount, DEFAULT_RECOVERY_COUPON.discount_percent),
    client_name: safeText(body.client_name || body.clientName || DEFAULT_RECOVERY_COUPON.client_name, DEFAULT_RECOVERY_COUPON.client_name, 120),
    status: "Claimed",
    validity: safeText(body.validity || DEFAULT_RECOVERY_COUPON.validity, DEFAULT_RECOVERY_COUPON.validity, 120),
    token: safeText(body.token, "", 500) || null,
    session_id: safeText(body.session_id || body.sid, "", 120) || null,
    route: safeText(body.route, "", 160) || null,
    page: safeText(body.page, "recovery-coupon", 120),
    acknowledged_at: now,
    updated_at: now,
  });

  const write = await writeStoredRecoveryCoupon(env, coupon);

  return json(
    {
      ok: true,
      source: write.persisted ? "kv" : "ephemeral",
      mode: MODE,
      message: "Coupon acknowledged",
      coupon,
      storage: write,
    },
    200,
    corsHeaders,
  );
}

function recoveryCouponLookupFromUrl(url) {
  return {
    token: safeText(url.searchParams.get("t"), "", 500),
    session_id: safeText(url.searchParams.get("sid"), "", 120),
    coupon_id: safeText(url.searchParams.get("coupon") || url.searchParams.get("coupon_id"), "", 120),
  };
}

async function readStoredRecoveryCoupon(env, lookup) {
  const kv = recoveryCouponKv(env);
  if (!kv || typeof kv.get !== "function") return null;

  const keys = recoveryCouponLookupKeys(lookup);
  for (const key of keys) {
    try {
      const raw = await kv.get(key);
      const parsed = parseJson(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (error) {
      console.error(JSON.stringify({ worker: workerName(env), source: "recovery_coupon_kv_read", error: errorMessage(error) }));
    }
  }

  return null;
}

async function writeStoredRecoveryCoupon(env, coupon) {
  const kv = recoveryCouponKv(env);
  if (!kv || typeof kv.put !== "function") return { persisted: false, reason: "missing_SIGIL_RECOVERY_KV" };

  const keys = recoveryCouponLookupKeys({
    coupon_id: coupon.coupon_id,
    token: coupon.token,
    session_id: coupon.session_id,
  });
  const value = JSON.stringify(coupon);

  try {
    await Promise.all(keys.map((key) => kv.put(key, value)));
    return { persisted: true, keys_written: keys.length };
  } catch (error) {
    console.error(JSON.stringify({ worker: workerName(env), source: "recovery_coupon_kv_write", error: errorMessage(error) }));
    return { persisted: false, reason: errorMessage(error) };
  }
}

function recoveryCouponKv(env) {
  return env?.SIGIL_RECOVERY_KV || env?.RECOVERY_COUPON_KV || env?.SIGIL_BOARD_KV || null;
}

function recoveryCouponLookupKeys(lookup) {
  return [
    lookup?.coupon_id ? `${RECOVERY_COUPON_KV_PREFIX}coupon:${lookup.coupon_id}` : "",
    lookup?.session_id ? `${RECOVERY_COUPON_KV_PREFIX}sid:${lookup.session_id}` : "",
    lookup?.token ? `${RECOVERY_COUPON_KV_PREFIX}token:${shortHash(String(lookup.token))}` : "",
  ].filter(Boolean);
}

function normalizeRecoveryCoupon(value) {
  return {
    coupon_id: safeText(value?.coupon_id || DEFAULT_RECOVERY_COUPON.coupon_id, DEFAULT_RECOVERY_COUPON.coupon_id, 120),
    discount_percent: readNumber(value?.discount_percent || value?.discount, DEFAULT_RECOVERY_COUPON.discount_percent),
    client_name: safeText(value?.client_name || DEFAULT_RECOVERY_COUPON.client_name, DEFAULT_RECOVERY_COUPON.client_name, 120),
    status: normalizeRecoveryStatus(value?.status || value?.coupon_status || DEFAULT_RECOVERY_COUPON.status),
    validity: safeText(value?.validity || DEFAULT_RECOVERY_COUPON.validity, DEFAULT_RECOVERY_COUPON.validity, 120),
    token: value?.token || null,
    session_id: value?.session_id || null,
    route: value?.route || null,
    page: value?.page || null,
    acknowledged_at: value?.acknowledged_at || null,
    updated_at: value?.updated_at || null,
  };
}

function normalizeRecoveryStatus(value) {
  const raw = safeText(value, "Active", 40);
  const normalized = raw.toLowerCase();
  if (normalized === "active") return "Active";
  if (normalized === "claimed") return "Claimed";
  if (normalized === "used") return "Used";
  if (normalized === "expired") return "Expired";
  if (normalized === "revoked") return "Revoked";
  return raw;
}

function readNumber(value, fallback) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function isRecoveryCouponPath(pathname) {
  return pathname === RECOVERY_COUPON_STATUS_PATH || pathname === RECOVERY_COUPON_ACK_PATH;
}

async function loadBoardCards(env) {
  const raw = await readBoardSource(env);
  const records = normalizeSourceRecords(raw);
  return records.map(sanitizeCard).filter(Boolean);
}

async function readBoardSource(env) {
  const kv = env?.SIGIL_BOARD_KV;
  if (kv && typeof kv.get === "function") {
    try {
      const stored = await kv.get(BOARD_CARDS_KV_KEY);
      return parseJson(stored);
    } catch (error) {
      console.error(JSON.stringify({ worker: workerName(env), source: "kv", error: errorMessage(error) }));
      return [];
    }
  }

  if (env?.SIGIL_BOARD_QUEUE_JSON) return parseJson(env.SIGIL_BOARD_QUEUE_JSON);
  if (Array.isArray(env?.SIGIL_BOARD_QUEUE_RECORDS)) return env.SIGIL_BOARD_QUEUE_RECORDS;

  return [];
}

function normalizeSourceRecords(source) {
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.cards)) return source.cards;
  if (Array.isArray(source?.records)) return source.records;
  if (Array.isArray(source?.items)) return source.items;
  return [];
}

function sanitizeCard(record, index) {
  if (!record || typeof record !== "object") return null;
  const fields = record.fields && typeof record.fields === "object" ? record.fields : record;

  const lane = allowedValue(readAlias(fields, ["lane", "Lane", "category", "Category", "type", "Type"]), ALLOWED_LANES, inferLane(fields));
  let status = safeText(readAlias(fields, ["status", "Status", "state", "State"]), inferStatus(lane));
  const priority = allowedValue(readAlias(fields, ["priority", "Priority"]), ALLOWED_PRIORITIES, inferPriority(fields, lane, status));
  let risk = safeText(readAlias(fields, ["risk", "Risk", "risk_note", "Risk Note"]), inferRisk(fields, lane), 120);
  let nextAction = safeText(readAlias(fields, ["next_action", "Next Action", "next", "Next"]), inferNextAction(lane), 120);
  const owner = allowedValue(readAlias(fields, ["owner", "Owner", "assignee", "Assignee"]), ALLOWED_OWNERS, inferOwner(lane, risk));
  let title = safeText(readAlias(fields, ["title", "Title", "name", "Name", "subject", "Subject"]), inferTitle(lane), 90);
  let summary = safeText(readAlias(fields, ["summary", "Summary", "note_summary", "Note Summary"]), inferSummary(lane), 180);
  const needsPerDecisionRaw = readAlias(fields, ["needs_per_decision", "Needs Per Decision"]);
  const needsPerDecision = needsPerDecisionRaw !== "" ? safeBoolean(needsPerDecisionRaw) : inferNeedsPerDecision(fields, lane, risk);
  status = normalizeBoardStatus(status, { lane, priority, owner, needsPerDecision });
  title = deepFieldSanitize("title", title, lane);
  status = deepFieldSanitize("status", status, lane);
  risk = deepFieldSanitize("risk", risk, lane);
  nextAction = deepFieldSanitize("next_action", nextAction, lane);
  summary = deepFieldSanitize("summary", summary, lane);

  return {
    id: stableCardId(record, fields, index),
    title,
    lane: deepFieldSanitize("lane", lane, lane) || "Risk",
    status,
    priority: deepFieldSanitize("priority", priority, lane) || "Low",
    risk,
    next_action: nextAction,
    owner: deepFieldSanitize("owner", owner, lane) || "MMD",
    needs_per_decision: needsPerDecision,
    summary,
  };
}

function countCards(cards) {
  const counts = { ...EMPTY_COUNTS };
  for (const card of cards) {
    const status = String(card.status || "").toLowerCase();
    if (card.priority === "Critical" || card.lane === "Risk") counts.critical += 1;
    if (card.needs_per_decision === true || card.owner === "Per" || card.owner === "Ewvon") counts.ready_for_per += 1;
    if (card.lane === "Payment" && /pending|review|need info/.test(status)) counts.payment_pending += 1;
    if (card.lane === "Need Info" || /need info|awaiting info|missing info/.test(status)) counts.need_info += 1;
  }
  return counts;
}

function sortCards(cards) {
  return [...cards].sort((left, right) => cardSortScore(right) - cardSortScore(left));
}

function cardSortScore(card) {
  const status = String(card.status || "").toLowerCase();
  const priorityScore = { Critical: 100000, High: 1000, Medium: 100, Low: 10 }[card.priority] || 0;
  let score = priorityScore;
  if (card.priority === "Critical") score += 50000;
  if (card.needs_per_decision === true) score += 20000;
  if (card.owner === "Per" || card.owner === "Ewvon") score += 10000;
  if (card.lane === "Payment" && /pending|review|need info/.test(status)) score += 5000;
  if (card.lane === "Need Info") score += 2500;
  return score;
}

function normalizeBoardStatus(status, card) {
  const cleanStatus = safeText(status, "Read Only", 40);
  const readyForPer = card.needsPerDecision === true || card.owner === "Per" || card.owner === "Ewvon";
  if (/^ready for per$/i.test(cleanStatus) && !readyForPer) return "Awaiting Info";
  if (card.needsPerDecision === false && card.owner === "Kenji" && card.priority === "Low" && /^ready for per$/i.test(cleanStatus)) return "Awaiting Info";
  return cleanStatus;
}

function stableCardId(record, fields, index) {
  const explicit = safeText(readAlias(fields, ["id", "card_id", "Card ID"]), "");
  if (/^sigil_card_[a-z0-9]+$/i.test(explicit)) return explicit.toLowerCase();

  const fingerprint = [
    readAlias(fields, ["title", "Title", "name", "Name", "subject", "Subject"]),
    readAlias(fields, ["lane", "Lane", "category", "Category"]),
    readAlias(fields, ["status", "Status"]),
    readAlias(fields, ["priority", "Priority"]),
    readAlias(fields, ["owner", "Owner"]),
    index,
  ].map((value) => String(value || "")).join("|");

  return `sigil_card_${shortHash(fingerprint)}`;
}

function readAlias(fields, aliases) {
  for (const key of aliases) {
    if (fields[key] !== undefined && fields[key] !== null && fields[key] !== "") return fields[key];
  }
  return "";
}

function safeText(value, fallback = "", maxLength = 180) {
  let output = Array.isArray(value) ? value.join(", ") : String(value == null ? "" : value);
  output = output.replace(/\s+/g, " ").trim();
  if (!output) output = fallback;
  output = output
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[masked]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[masked]")
    .replace(/\bU[a-f0-9]{20,}\b/gi, "[masked]")
    .replace(/\b\d{7,}:[A-Za-z0-9_-]{20,}\b/g, "[masked]")
    .replace(/https?:\/\/\S+/gi, "[masked]")
    .replace(/\b(token|secret|passphrase|api[_ -]?key|bank|slip[_ -]?url)\b/gi, "[redacted]");
  return output.slice(0, maxLength);
}

function deepFieldSanitize(field, value, lane) {
  const text = safeText(value, "", field === "title" ? 90 : field === "next_action" || field === "risk" ? 120 : 180);
  if (!hasBadText(text)) return text;
  if (field === "summary") return safeSummaryForLane(lane);
  if (field === "title") return safeTitleForLane(lane);
  if (field === "next_action") return inferNextAction(lane);
  if (field === "risk") return lane === "Payment" ? "Slip evidence only" : "Read-only advisory";
  if (field === "status") return lane === "Need Info" ? "Awaiting Info" : "Read Only";
  return "";
}

function hasBadText(value) {
  return /rec[A-Za-z0-9]{10,}|Canonical Client|LINE Official immigration identity|line_user_i|line_user_id|nickname:|emails:|email|phone|telegram:|@[A-Za-z0-9_]|proof_attached|requested_path|payment_method|bank|raw_payload|admin_note|token|secret|passphrase|api_key|SVIP|Black Card|VIP/.test(String(value || ""));
}

function allowedValue(value, allowed, fallback) {
  const cleanValue = safeText(value, "");
  return allowed.has(cleanValue) ? cleanValue : fallback;
}

function inferLane(fields) {
  const text = JSON.stringify(fields || {}).toLowerCase();
  if (/black/.test(text)) return "Private Review";
  if (/svip|vip|rollback|private/.test(text)) return "Private Review";
  if (/payment|slip|proof|transfer|refund/.test(text)) return "Payment";
  if (/booking|location|model/.test(text)) return /model/.test(text) ? "Model" : "Booking";
  if (/member|identity/.test(text)) return "Member";
  if (/route|auth/.test(text)) return "Route";
  if (/missing|need info|incomplete/.test(text)) return "Need Info";
  return "Risk";
}

function inferStatus(lane) {
  if (lane === "Payment" || lane === "Need Info") return "Need Info";
  if (lane === "Private Review" || lane === "Black Card") return "Ready for Per";
  return "Read Only";
}

function inferPriority(fields, lane, status) {
  const text = `${JSON.stringify(fields || {})} ${lane} ${status}`.toLowerCase();
  if (/critical|mismatch|privacy|complaint|auth|route error/.test(text)) return "Critical";
  if (/payment|svip|black card|refund|private review|per/.test(text)) return "High";
  if (/missing|booking|partner|model|review/.test(text)) return "Medium";
  return "Low";
}

function inferRisk(fields, lane) {
  const text = JSON.stringify(fields || {}).toLowerCase();
  if (lane === "Payment") return "Slip evidence only";
  if (lane === "Black Card") return "Ewvon private review only";
  if (/svip/.test(text)) return "Per manual decision only";
  if (/privacy|complaint|auth|route/.test(text)) return "Safety review required";
  return "Read-only advisory";
}

function inferNextAction(lane) {
  if (lane === "Payment") return "ตรวจยอดจากระบบทางการก่อนตอบ";
  if (lane === "Black Card") return "ส่งเป็น private review ให้ Ewvon";
  if (lane === "Private Review") return "สรุป advisory ให้ Per";
  if (lane === "Need Info" || lane === "Booking") return "ขอข้อมูลเพิ่มก่อนเดินเรื่อง";
  return "อ่านข้อมูลและจัดลำดับต่อ";
}

function inferOwner(lane, risk) {
  if (lane === "Black Card" || /ewvon/i.test(risk)) return "Ewvon";
  if (lane === "Private Review" || /per/i.test(risk)) return "Per";
  if (lane === "Route" || lane === "Risk") return "Admin";
  return "MMD";
}

function inferTitle(lane) {
  if (lane === "Payment") return "Payment proof review";
  if (lane === "Black Card") return "Black Card Private Review";
  if (lane === "Private Review") return "Private review queue";
  if (lane === "Booking") return "Booking context request";
  if (lane === "Member") return "Member identity review";
  return "Operational board item";
}

function inferSummary(lane) {
  return safeSummaryForLane(lane);
}

function safeSummaryForLane(lane) {
  if (lane === "Payment") return "รายการชำระเงินต้องตรวจสอบจากระบบทางการก่อนตอบ";
  if (lane === "Need Info") return "ต้องขอข้อมูลเพิ่มเติมก่อนเดินเรื่อง";
  if (lane === "Private Review") return "ต้องสรุปเข้าคิวพิจารณาแบบส่วนตัว";
  if (lane === "Black Card") return "ต้องตรวจสอบในชั้น private review เท่านั้น";
  return "รายการนี้เป็น read-only advisory สำหรับตรวจสอบต่อ";
}

function safeTitleForLane(lane) {
  if (lane === "Payment") return "Payment review";
  if (lane === "Need Info") return "Need info review";
  if (lane === "Private Review" || lane === "Black Card") return "Private review item";
  if (lane === "Booking") return "Booking review";
  return "Board review item";
}

function inferNeedsPerDecision(fields, lane, risk) {
  const text = [
    readAlias(fields, ["title", "Title", "name", "Name", "subject", "Subject"]),
    readAlias(fields, ["status", "Status", "state", "State"]),
    readAlias(fields, ["summary", "Summary", "note_summary", "Note Summary"]),
    readAlias(fields, ["next_action", "Next Action", "next", "Next"]),
    lane,
    risk,
  ].join(" ").toLowerCase();
  return /mismatch|vip|svip|black card|refund|manual review|complaint|rollback|per/.test(text);
}

function parseJson(value) {
  if (!value) return [];
  if (Array.isArray(value) || typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function safeBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = String(value == null ? "" : value).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return false;
}

function shortHash(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(36).slice(0, 10);
}

function methodNotAllowed(headers, allow = "GET, OPTIONS") {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("allow", allow);
  return json({ ok: false, error: "method_not_allowed" }, 405, responseHeaders);
}

function queueLimitFrom(url) {
  const requested = Number(url.searchParams.get("limit") || DEFAULT_QUEUE_LIMIT);
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_QUEUE_LIMIT;
  return Math.min(MAX_QUEUE_LIMIT, Math.floor(requested));
}

function corsFor(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = (env?.ALLOWED_ORIGINS || "https://mmdbkk.com,https://www.mmdbkk.com,https://sigil.mmdbkk.com,https://mmdprive.webflow.io")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const headers = new Headers();

  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,x-request-id,x-mmd-client,x-mmd-proxy,x-mmd-route");
  headers.set("access-control-max-age", "86400");

  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
  }

  return headers;
}

function json(body, status = 200, headers = new Headers()) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body, null, 2), { status, headers: responseHeaders });
}

function workerName(env) {
  return safeText(env?.WORKER_NAME, WORKER_NAME_FALLBACK);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export const testInternals = {
  BOARD_STATUS_PATH,
  BOARD_QUEUE_PATH,
  BOARD_CARDS_KV_KEY,
  BOARD_META_KV_KEY,
  DEFAULT_QUEUE_LIMIT,
  MAX_QUEUE_LIMIT,
  RECOVERY_COUPON_STATUS_PATH,
  RECOVERY_COUPON_ACK_PATH,
  RECOVERY_COUPON_KV_PREFIX,
  countCards,
  queueLimitFrom,
  sanitizeCard,
  sortCards,
  statusResponse,
  queueResponse,
  normalizeRecoveryCoupon,
  recoveryCouponLookupKeys,
};
