const WORKER_NAME_FALLBACK = "mmd-care-intake-worker";
const MODE = "private_care_metadata_intake";
const COMPLAINT_PATH = "/member/api/recovery/complaint-evidence";
const CASE_KEY_PREFIX = "mmd:private-care:complaint:v1:";
const BOARD_CARDS_KEY = "sigil:board:v1:cards";
const MAX_FILES_PER_SIDE = 12;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_FILES = MAX_FILES_PER_SIDE * 2;
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "pdf"]);
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf"]);
const ALLOWED_LANES = new Set(["client", "assistant", "model"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

      if (url.pathname === "/ping" || url.pathname === "/health") {
        if (request.method !== "GET") return methodNotAllowed(cors, "GET, OPTIONS");
        return json({ ok: true, worker: workerName(env), mode: MODE }, 200, cors);
      }

      if (url.pathname === COMPLAINT_PATH) {
        if (request.method !== "POST") return methodNotAllowed(cors, "POST, OPTIONS");
        return handleComplaint(request, env, cors);
      }

      return json({ ok: false, error: "not_found", path: url.pathname }, 404, cors);
    } catch (error) {
      console.error(JSON.stringify({ worker: workerName(env), path: url.pathname, error: errorMessage(error) }));
      return json({ ok: false, error: "internal_error", message: errorMessage(error) }, 500, cors);
    }
  },
};

async function handleComplaint(request, env, cors) {
  const contentType = request.headers.get("content-type") || "";
  if (!/multipart\/form-data/i.test(contentType)) {
    return json({ ok: false, error: "invalid_content_type", message: "multipart/form-data is required" }, 415, cors);
  }

  const form = await request.formData();
  const now = new Date().toISOString();
  const record = buildComplaintRecord(form, now);
  const files = evidenceFiles(form);
  const validationError = validateEvidence(files.all);
  if (validationError) return json(validationError, 400, cors);

  record.evidence = {
    client: files.client.map(fileMeta),
    model: files.model.map(fileMeta),
    total_files: files.all.length,
    total_bytes: files.all.reduce((sum, pair) => sum + Number(pair[1].size || 0), 0),
    binary_storage: "not_stored_in_kv",
    note: "Metadata intake only. Add R2 or Drive binary upload before treating this as final evidence archive.",
  };

  const caseWrite = await writeCase(env, record);
  const boardWrite = await writeBoardCard(env, record);
  const webhooks = await forwardWebhooks(env, record);

  return json({
    ok: true,
    source: caseWrite.persisted ? "kv" : "ephemeral",
    mode: MODE,
    message: "Private care complaint received",
    complaint: record,
    storage: {
      case_record: caseWrite,
      board_card: boardWrite,
      google_drive: webhooks.google_drive,
      telegram: webhooks.telegram,
    },
  }, 200, cors);
}

function buildComplaintRecord(form, now) {
  const lane = normalizeLane(form.get("lane"));
  const explicitCaseId = clean(form.get("case_id"), "", 120);
  const sessionId = clean(form.get("session_id"), "", 120);
  const token = clean(form.get("token"), "", 500);
  const clientName = clean(form.get("client_name"), "", 120);
  const modelName = clean(form.get("model_name"), "", 120);
  const complaintId = /^cmp_[a-z0-9_-]+$/i.test(explicitCaseId)
    ? explicitCaseId
    : `cmp_${Date.now().toString(36)}_${shortHash([sessionId, token, clientName, modelName, now].join("|"))}`;

  return {
    complaint_id: complaintId,
    lane,
    token: token || null,
    session_id: sessionId || null,
    case_id: explicitCaseId || null,
    source: clean(form.get("source"), "webflow", 80),
    client_name: clientName,
    model_name: modelName,
    case_date: clean(form.get("case_date"), "", 40),
    case_time: clean(form.get("case_time"), "", 40),
    case_location: clean(form.get("case_location"), "", 180),
    client_statement: cleanLong(form.get("client_statement"), 4000),
    assistant_statement: cleanLong(form.get("assistant_statement"), 4000),
    model_statement: cleanLong(form.get("model_statement"), 4000),
    lane_statement: cleanLong(form.get("lane_statement"), 4000),
    statement: cleanLong(form.get("statement"), 5000),
    workflow_status: clean(form.get("workflow_status"), "received_with_evidence", 80),
    next_step: clean(form.get("next_step"), "mmd_assistant_review", 80),
    final_approver: clean(form.get("final_approver"), "Boss Per", 80),
    page: clean(form.get("page"), "mmd-private-care-complaint", 120),
    route: clean(form.get("route"), "", 160),
    referrer: clean(form.get("referrer"), "", 260),
    user_agent: clean(form.get("user_agent"), "", 260),
    received_at: now,
  };
}

function evidenceFiles(form) {
  const client = fileEntries(form, "client_evidence[]", "client_evidence");
  const model = fileEntries(form, "model_evidence[]", "model_evidence");
  return {
    client,
    model,
    all: [...client.map((file) => ["client", file]), ...model.map((file) => ["model", file])],
  };
}

function fileEntries(form, arrayKey, fallbackKey) {
  return [...form.getAll(arrayKey), ...form.getAll(fallbackKey)].filter((entry) => {
    return entry && typeof entry === "object" && typeof entry.name === "string" && typeof entry.size === "number" && entry.size > 0;
  });
}

function validateEvidence(pairs) {
  if (pairs.length > MAX_TOTAL_FILES) return { ok: false, error: "too_many_files", message: `แนบไฟล์ได้รวมสูงสุด ${MAX_TOTAL_FILES} ไฟล์` };

  const counts = { client: 0, model: 0 };
  for (const [side, file] of pairs) {
    counts[side] += 1;
    if (counts[side] > MAX_FILES_PER_SIDE) return { ok: false, error: "too_many_files", message: `${side} evidence แนบไฟล์ได้สูงสุด ${MAX_FILES_PER_SIDE} ไฟล์` };
    if (file.size > MAX_FILE_BYTES) return { ok: false, error: "file_too_large", message: `ไฟล์ ${file.name} มีขนาดเกิน 15MB` };
    const typeOk = ALLOWED_TYPES.has(String(file.type || "").toLowerCase());
    const extOk = ALLOWED_EXTENSIONS.has(extension(file.name));
    if (!typeOk && !extOk) return { ok: false, error: "unsupported_file_type", message: `ไฟล์ ${file.name} ไม่ใช่ประเภทที่รองรับ` };
  }

  return null;
}

function fileMeta(file) {
  return {
    name: clean(file.name, "untitled", 160),
    size: Number(file.size || 0),
    type: clean(file.type, "application/octet-stream", 80),
    extension: extension(file.name),
    storage_status: "metadata_received",
  };
}

async function writeCase(env, record) {
  const kv = env?.SIGIL_COMPLAINT_KV || env?.SIGIL_BOARD_KV || null;
  if (!kv || typeof kv.put !== "function") return { persisted: false, reason: "missing_kv" };
  const keys = [
    `${CASE_KEY_PREFIX}id:${record.complaint_id}`,
    record.session_id ? `${CASE_KEY_PREFIX}sid:${record.session_id}` : "",
    record.token ? `${CASE_KEY_PREFIX}token:${shortHash(record.token)}` : "",
  ].filter(Boolean);

  try {
    await Promise.all(keys.map((key) => kv.put(key, JSON.stringify(record))));
    return { persisted: true, keys_written: keys.length };
  } catch (error) {
    return { persisted: false, reason: errorMessage(error) };
  }
}

async function writeBoardCard(env, record) {
  const kv = env?.SIGIL_BOARD_KV;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") return { persisted: false, reason: "missing_SIGIL_BOARD_KV" };
  const card = boardCard(record);

  try {
    const existing = normalizeCards(parseJson(await kv.get(BOARD_CARDS_KEY)));
    const next = [card, ...existing.filter((item) => item?.id !== card.id)].slice(0, 200);
    await kv.put(BOARD_CARDS_KEY, JSON.stringify({ cards: next, updated_at: new Date().toISOString(), source: "mmd-care-intake-worker" }));
    return { persisted: true, card_id: card.id };
  } catch (error) {
    return { persisted: false, reason: errorMessage(error) };
  }
}

function boardCard(record) {
  const titleName = record.client_name || record.model_name || record.complaint_id;
  const priority = priorityFor(record);
  return {
    id: `sigil_card_${shortHash(record.complaint_id)}`,
    title: `Private care complaint: ${clean(titleName, "new case", 60)}`,
    lane: record.lane === "model" ? "Model" : "Private Review",
    status: "Need Info",
    priority,
    risk: riskFor(record),
    next_action: "MMD Assistant ตรวจข้อมูลและหลักฐานก่อนส่งต่อ Per หากจำเป็น",
    owner: record.lane === "assistant" ? "Kenji" : "MMD",
    needs_per_decision: priority === "Critical",
    summary: clean(record.lane_statement || record.statement || "Complaint evidence received", "Complaint evidence received", 180),
    received_at: record.received_at,
  };
}

function priorityFor(record) {
  const text = `${record.statement} ${record.lane_statement} ${record.case_location}`.toLowerCase();
  if (/privacy|safe|leak|refund|คืนเงิน|ไม่ปลอดภัย|ละเมิด|ข้อมูล/.test(text)) return "Critical";
  if (record.evidence?.total_files > 0) return "High";
  return "Medium";
}

function riskFor(record) {
  const text = `${record.statement} ${record.lane_statement}`.toLowerCase();
  if (/privacy|leak|ข้อมูล|ความปลอดภัย|ละเมิด/.test(text)) return "Safety review required";
  if (/refund|คืนเงิน|payment|จ่าย|ชำระ/.test(text)) return "Refund or payment review";
  return "Private care review";
}

async function forwardWebhooks(env, record) {
  return {
    google_drive: await postJson(env?.COMPLAINT_GOOGLE_DRIVE_WEBHOOK_URL, record, "google_drive"),
    telegram: await postJson(env?.COMPLAINT_TELEGRAM_WEBHOOK_URL, telegramPayload(record), "telegram"),
  };
}

async function postJson(url, payload, label) {
  if (!url) return { forwarded: false, reason: `missing_${label}_webhook_url` };
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    return { forwarded: res.ok, status: res.status };
  } catch (error) {
    return { forwarded: false, reason: errorMessage(error) };
  }
}

function telegramPayload(record) {
  return {
    type: "mmd_private_care_complaint",
    complaint_id: record.complaint_id,
    lane: record.lane,
    client_name: record.client_name,
    model_name: record.model_name,
    priority: priorityFor(record),
    evidence_count: record.evidence?.total_files || 0,
    received_at: record.received_at,
  };
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = new Set(String(env?.ALLOWED_ORIGINS || "https://mmdbkk.com,https://www.mmdbkk.com,https://sigil.mmdbkk.com,https://mmdprive.webflow.io").split(",").map((item) => item.trim()).filter(Boolean));
  return {
    "access-control-allow-origin": origin && allowed.has(origin) ? origin : "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-mmd-client, x-mmd-route, x-confirm-key",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

function normalizeCards(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.cards)) return value.cards;
  if (Array.isArray(value?.records)) return value.records;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function normalizeLane(value) {
  const lane = String(value || "client").trim().toLowerCase();
  return ALLOWED_LANES.has(lane) ? lane : "client";
}

function extension(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function parseJson(value) {
  if (!value) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

function clean(value, fallback = "", maxLength = 180) {
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

function cleanLong(value, maxLength = 4000) {
  return clean(value, "", maxLength);
}

function methodNotAllowed(cors, allow = "GET, OPTIONS") {
  return json({ ok: false, error: "method_not_allowed" }, 405, { ...cors, allow });
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

function shortHash(value) {
  let hash = 5381;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

function workerName(env) {
  return env?.WORKER_NAME || WORKER_NAME_FALLBACK;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}
