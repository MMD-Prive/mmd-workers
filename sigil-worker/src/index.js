const WORKER_NAME_FALLBACK = "sigil-worker";
const MODE = "read_only";
const SOURCE = "worker";

const BOARD_STATUS_PATH = "/v1/sigil/board/status";
const BOARD_QUEUE_PATH = "/v1/sigil/board/queue";

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

      if (url.pathname === BOARD_STATUS_PATH || url.pathname === BOARD_QUEUE_PATH) {
        if (request.method !== "GET") return methodNotAllowed(corsHeaders);
        const cards = await loadBoardCards(env);
        if (url.pathname === BOARD_STATUS_PATH) return json(statusResponse(cards), 200, corsHeaders);
        return json(queueResponse(cards), 200, corsHeaders);
      }

      return json({ ok: false, error: "not_found" }, 404, corsHeaders);
    } catch (error) {
      console.error(JSON.stringify({ worker: workerName(env), error: errorMessage(error) }));
      return json({ ok: false, error: "board_source_unavailable" }, 503, corsHeaders);
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

function queueResponse(cards) {
  return {
    ok: true,
    source: SOURCE,
    mode: MODE,
    cards,
  };
}

async function loadBoardCards(env) {
  const raw = await readBoardSource(env);
  const records = normalizeSourceRecords(raw);
  return records.map(sanitizeCard).filter(Boolean);
}

async function readBoardSource(env) {
  if (env?.SIGIL_BOARD_QUEUE_JSON) return parseJson(env.SIGIL_BOARD_QUEUE_JSON);
  if (Array.isArray(env?.SIGIL_BOARD_QUEUE_RECORDS)) return env.SIGIL_BOARD_QUEUE_RECORDS;

  const kv = env?.SIGIL_BOARD_QUEUE_KV || env?.SIGIL_BOARD_KV;
  if (kv && typeof kv.get === "function") {
    const stored = await kv.get("sigil:board:queue", "json");
    if (stored) return stored;
  }

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
  const status = safeText(readAlias(fields, ["status", "Status", "state", "State"]), inferStatus(lane));
  const priority = allowedValue(readAlias(fields, ["priority", "Priority"]), ALLOWED_PRIORITIES, inferPriority(fields, lane, status));
  const risk = safeText(readAlias(fields, ["risk", "Risk", "risk_note", "Risk Note"]), inferRisk(fields, lane));
  const nextAction = safeText(readAlias(fields, ["next_action", "Next Action", "next", "Next"]), inferNextAction(lane));
  const owner = allowedValue(readAlias(fields, ["owner", "Owner", "assignee", "Assignee"]), ALLOWED_OWNERS, inferOwner(lane, risk));
  const title = safeText(readAlias(fields, ["title", "Title", "name", "Name", "subject", "Subject"]), inferTitle(lane));
  const summary = safeText(readAlias(fields, ["summary", "Summary", "note_summary", "Note Summary"]), inferSummary(lane, risk));
  const needsPerDecision = Boolean(readAlias(fields, ["needs_per_decision", "Needs Per Decision"])) || inferNeedsPerDecision(fields, lane, risk);

  return {
    id: stableCardId(record, fields, index),
    title,
    lane,
    status,
    priority,
    risk,
    next_action: nextAction,
    owner,
    needs_per_decision: needsPerDecision,
    summary,
  };
}

function countCards(cards) {
  const counts = { ...EMPTY_COUNTS };
  for (const card of cards) {
    const haystack = `${card.lane} ${card.status} ${card.priority} ${card.risk} ${card.title}`.toLowerCase();
    if (card.priority === "Critical" || /critical|mismatch|privacy|complaint|route|auth|risk/.test(haystack)) counts.critical += 1;
    if (card.needs_per_decision || /per|svip|black card|rollback|private review|refund/.test(haystack)) counts.ready_for_per += 1;
    if (card.lane === "Payment" || /payment|slip|proof|paid|transfer/.test(haystack)) counts.payment_pending += 1;
    if (/need info|missing|incomplete|unknown|reference/.test(haystack)) counts.need_info += 1;
  }
  return counts;
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

function safeText(value, fallback = "") {
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
  return output.slice(0, 180);
}

function allowedValue(value, allowed, fallback) {
  const cleanValue = safeText(value, "");
  return allowed.has(cleanValue) ? cleanValue : fallback;
}

function inferLane(fields) {
  const text = JSON.stringify(fields || {}).toLowerCase();
  if (/black/.test(text)) return "Black Card";
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

function inferSummary(lane, risk) {
  if (lane === "Payment") return "สลิปเป็นหลักฐานเท่านั้น ต้องตรวจยอดจริงก่อนเปลี่ยนสถานะ";
  if (lane === "Black Card") return "Black Card เป็น private review เท่านั้น ไม่มี auto approval";
  if (lane === "Private Review") return "เคสนี้ต้องให้ Per ตัดสินใจแบบ manual";
  return risk || "ข้อมูลนี้เป็น advisory read-only";
}

function inferNeedsPerDecision(fields, lane, risk) {
  const text = `${JSON.stringify(fields || {})} ${lane} ${risk}`.toLowerCase();
  return /mismatch|vip|svip|black card|refund|manual review|complaint|rollback|per/.test(text);
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function shortHash(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(36).slice(0, 10);
}

function methodNotAllowed(headers) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("allow", "GET, OPTIONS");
  return json({ ok: false, error: "method_not_allowed" }, 405, responseHeaders);
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
  headers.set("access-control-allow-methods", "GET,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,x-request-id");
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
  countCards,
  sanitizeCard,
  statusResponse,
  queueResponse,
};
