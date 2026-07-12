const WORKER_NAME_FALLBACK = "mmd-care-intake-worker";
const MODE = "private_care_metadata_intake";
const COMPLAINT_PATH = "/member/api/recovery/complaint-evidence";
const STATUS_PATH = "/member/api/recovery/complaint-status";
const CASE_KEY_PREFIX = "mmd:private-care:complaint:v1:";
const BOARD_CARDS_KEY = "sigil:board:v1:cards";
const MAX_FILES_PER_SIDE = 12;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_FILES = MAX_FILES_PER_SIDE * 2;
const AIRTABLE_BASE_ID_DEFAULT = "appsV1ILPRfIjkaYg";
const AIRTABLE_CASE_TABLE_DEFAULT = "private_care_cases";
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "pdf"]);
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf"]);
const ALLOWED_LANES = new Set(["client", "internal", "model"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

      if (url.pathname === "/ping" || url.pathname === "/health") {
        if (request.method !== "GET") return methodNotAllowed(cors, "GET, OPTIONS");
        return json({ ok: true, worker: workerName(env), mode: MODE, complaint_path: COMPLAINT_PATH, status_path: STATUS_PATH }, 200, cors);
      }

      if (url.pathname === COMPLAINT_PATH) {
        if (request.method !== "POST") return methodNotAllowed(cors, "POST, OPTIONS");
        return handleComplaint(request, env, cors);
      }

      if (url.pathname === STATUS_PATH) {
        if (request.method !== "GET") return methodNotAllowed(cors, "GET, OPTIONS");
        return handleComplaintStatus(request, env, cors);
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

  const r2Write = await storeEvidenceInR2(env, record, files.all, now);
  record.evidence = {
    client: files.client.map((file) => fileMeta(file, r2Write.objectsByName.get(file.name))),
    model: files.model.map((file) => fileMeta(file, r2Write.objectsByName.get(file.name))),
    total_files: files.all.length,
    total_bytes: files.all.reduce((sum, pair) => sum + Number(pair[1].size || 0), 0),
    binary_storage: r2Write.stored_files > 0 ? "stored_in_r2" : "not_stored_in_kv",
    note: r2Write.stored_files > 0 ? "Evidence binaries stored in private Cloudflare R2." : "Metadata intake only. Evidence binaries were not stored.",
  };

  const card = boardCard(record);
  const caseWrite = await writeCase(env, record);
  const boardWrite = await writeBoardCard(env, card);
  const airtableWrite = await upsertAirtableCase(env, record, card, r2Write);
  const webhooks = await forwardWebhooks(env, record);

  return json({
    ok: true,
    source: airtableWrite.persisted ? "airtable" : caseWrite.persisted ? "kv" : "ephemeral",
    mode: MODE,
    message: "Private care complaint received",
    binary_storage: record.evidence.binary_storage,
    complaint: record,
    storage: {
      case_record: caseWrite,
      board_card: boardWrite,
      airtable: airtableWrite,
      r2: { enabled: r2Write.enabled, stored_files: r2Write.stored_files, objects: r2Write.objects },
      google_drive: webhooks.google_drive,
      telegram: webhooks.telegram,
    },
  }, 200, cors);
}

async function handleComplaintStatus(request, env, cors) {
  const url = new URL(request.url);
  const id = clean(url.searchParams.get("id") || url.searchParams.get("complaint_id") || url.searchParams.get("case_id"), "", 160);
  const sid = clean(url.searchParams.get("sid") || url.searchParams.get("session_id"), "", 160);
  const token = clean(url.searchParams.get("t") || url.searchParams.get("token") || url.searchParams.get("code"), "", 500);

  if (!id && !sid && !token) {
    return json({ ok: false, error: "missing_lookup", message: "Complaint ID, session_id, or token is required" }, 400, cors);
  }

  const airtable = await findAirtableCase(env, { id, sid, token });
  if (airtable.found) return json({ ok: true, source: "airtable", case: publicCaseFromAirtable(airtable.record) }, 200, cors);

  const kv = await findKvCase(env, { id, sid, token });
  if (kv.found) return json({ ok: true, source: "kv", case: publicCaseFromRecord(kv.record) }, 200, cors);

  return json({ ok: false, error: "not_found", message: "Private care case not found", airtable, kv }, 404, cors);
}

function buildComplaintRecord(form, now) {
  const lane = normalizeLane(form.get("lane"));
  const explicitCaseId = clean(form.get("case_id"), "", 120);
  const sessionId = clean(form.get("session_id"), "", 120);
  const token = clean(form.get("token"), "", 500);
  const clientName = clean(form.get("client_name"), "", 120);
  const modelName = clean(form.get("model_name"), "", 120);
  const complaintId = /^(cmp|complaint)_[a-z0-9_-]+$/i.test(explicitCaseId)
    ? explicitCaseId
    : `cmp_${Date.now().toString(36)}_${shortHash([sessionId, token, clientName, modelName, now].join("|"))}`;

  return {
    complaint_id: complaintId,
    lane,
    token: token || null,
    token_hash: token ? shortHash(token) : "",
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
    language: clean(form.get("language"), "th", 12),
    received_at: now,
    updated_at: now,
  };
}

function evidenceFiles(form) {
  const client = fileEntries(form, "client_evidence[]", "client_evidence");
  const model = fileEntries(form, "model_evidence[]", "model_evidence");
  return { client, model, all: [...client.map((file) => ["client", file]), ...model.map((file) => ["model", file])] };
}

function fileEntries(form, arrayKey, fallbackKey) {
  return [...form.getAll(arrayKey), ...form.getAll(fallbackKey)].filter((entry) => entry && typeof entry === "object" && typeof entry.name === "string" && typeof entry.size === "number" && entry.size > 0);
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

async function storeEvidenceInR2(env, record, pairs, now) {
  const bucket = env?.COMPLAINT_EVIDENCE_R2;
  const result = { enabled: Boolean(bucket && typeof bucket.put === "function"), stored_files: 0, objects: [], objectsByName: new Map() };
  if (!result.enabled || pairs.length === 0) return result;

  for (const [side, file] of pairs) {
    const key = `complaints/${record.complaint_id}/${side}/${safeTimestamp(now)}-${safeFileName(file.name)}`;
    await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { complaint_id: record.complaint_id, side } });
    const object = { side, name: clean(file.name, "untitled", 160), r2_key: key, storage_status: "stored_in_r2" };
    result.objects.push(object);
    result.objectsByName.set(file.name, object);
    result.stored_files += 1;
  }

  return result;
}

function fileMeta(file, stored) {
  return { name: clean(file.name, "untitled", 160), size: Number(file.size || 0), type: clean(file.type, "application/octet-stream", 80), extension: extension(file.name), storage_status: stored?.storage_status || "metadata_received", r2_key: stored?.r2_key || "" };
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

async function findKvCase(env, lookup) {
  const kv = env?.SIGIL_COMPLAINT_KV || env?.SIGIL_BOARD_KV || null;
  if (!kv || typeof kv.get !== "function") return { found: false, reason: "missing_kv" };

  const keys = [
    lookup.id ? `${CASE_KEY_PREFIX}id:${lookup.id}` : "",
    lookup.sid ? `${CASE_KEY_PREFIX}sid:${lookup.sid}` : "",
    lookup.token ? `${CASE_KEY_PREFIX}token:${shortHash(lookup.token)}` : "",
  ].filter(Boolean);

  for (const key of keys) {
    const record = parseJson(await kv.get(key));
    if (record?.complaint_id) return { found: true, key, record };
  }

  return { found: false, reason: "not_found" };
}

async function writeBoardCard(env, card) {
  const kv = env?.SIGIL_BOARD_KV;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") return { persisted: false, reason: "missing_SIGIL_BOARD_KV" };

  try {
    const existing = normalizeCards(parseJson(await kv.get(BOARD_CARDS_KEY)));
    const next = [card, ...existing.filter((item) => item?.id !== card.id)].slice(0, 200);
    await kv.put(BOARD_CARDS_KEY, JSON.stringify({ cards: next, updated_at: new Date().toISOString(), source: workerName(env) }));
    return { persisted: true, card_id: card.id, card };
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
    owner: record.lane === "internal" ? "Kenji" : "MMD",
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

async function upsertAirtableCase(env, record, card, r2Write) {
  const airtable = airtableConfig(env);
  if (!airtable.enabled) return { persisted: false, reason: airtable.reason };

  const existing = await findAirtableCase(env, { id: record.complaint_id });
  const fields = airtableFields(record, card, r2Write);

  try {
    if (existing.found && existing.record?.id) {
      const patch = await airtableFetch(env, `/${airtable.baseId}/${encodeURIComponent(airtable.tableName)}/${existing.record.id}`, { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) });
      return { persisted: true, mode: "updated", record_id: patch.id };
    }

    const created = await airtableFetch(env, `/${airtable.baseId}/${encodeURIComponent(airtable.tableName)}`, { method: "POST", body: JSON.stringify({ fields, typecast: true }) });
    return { persisted: true, mode: "created", record_id: created.id };
  } catch (error) {
    return { persisted: false, reason: errorMessage(error) };
  }
}

async function findAirtableCase(env, lookup) {
  const airtable = airtableConfig(env);
  if (!airtable.enabled) return { found: false, reason: airtable.reason };

  const formulas = [];
  if (lookup.id) formulas.push(`{complaint_id}=${airtableString(lookup.id)}`);
  if (lookup.sid) formulas.push(`{session_id}=${airtableString(lookup.sid)}`);
  if (lookup.token) formulas.push(`{token_hash}=${airtableString(shortHash(lookup.token))}`);
  if (!formulas.length) return { found: false, reason: "missing_lookup" };

  const qs = new URLSearchParams({ maxRecords: "1", filterByFormula: formulas.length === 1 ? formulas[0] : `OR(${formulas.join(",")})` });

  try {
    const data = await airtableFetch(env, `/${airtable.baseId}/${encodeURIComponent(airtable.tableName)}?${qs.toString()}`);
    const record = Array.isArray(data.records) ? data.records[0] : null;
    return record ? { found: true, record } : { found: false, reason: "not_found" };
  } catch (error) {
    return { found: false, reason: errorMessage(error) };
  }
}

function airtableFields(record, card, r2Write) {
  return {
    complaint_id: record.complaint_id,
    session_id: record.session_id || "",
    token_hash: record.token_hash || "",
    client_name: record.client_name || "",
    model_name: record.model_name || "",
    lane: record.lane || "client",
    status: normalizeWorkflowStatus(record.workflow_status),
    priority: card.priority,
    risk: card.risk,
    received_at: record.received_at,
    updated_at: record.updated_at || record.received_at,
    case_date: record.case_date || "",
    case_time: record.case_time || "",
    case_location: record.case_location || "",
    evidence_count: record.evidence?.total_files || 0,
    r2_enabled: Boolean(r2Write.enabled),
    r2_stored_files: r2Write.stored_files || 0,
    board_card_id: card.id,
    next_action: card.next_action,
    needs_per_decision: Boolean(card.needs_per_decision),
    language: record.language || "th",
    source_page: record.page || "",
    source_route: record.route || "",
    public_status_note_th: "Kenji รับเรื่องไว้ในระบบแล้วครับ และ MMD จะตรวจข้อมูลอย่างระวัง",
    public_status_note_en: "Kenji has received this case and MMD will review the details carefully.",
    internal_note: card.summary || "",
    storage_json: JSON.stringify({ r2: { enabled: r2Write.enabled, stored_files: r2Write.stored_files, objects: r2Write.objects }, evidence: record.evidence }),
    payload_json: JSON.stringify(redactedRecord(record)),
  };
}

function normalizeWorkflowStatus(value) {
  const text = String(value || "received").toLowerCase();
  if (/review|mmd_assistant_review|checking/.test(text)) return "reviewing";
  if (/need|waiting/.test(text)) return "need_info";
  if (/per|owner|boss/.test(text)) return "per_review";
  if (/closed|done|resolved|completed/.test(text)) return "closed";
  return "received";
}

function publicCaseFromAirtable(record) {
  const fields = record?.fields || {};
  return publicCaseFromRecord({
    complaint_id: fields.complaint_id,
    session_id: fields.session_id,
    lane: fields.lane || "Private Review",
    workflow_status: fields.status,
    priority: fields.priority,
    risk: fields.risk,
    received_at: fields.received_at,
    updated_at: fields.updated_at,
    evidence: { total_files: Number(fields.evidence_count || fields.r2_stored_files || 0) },
    board_card_id: fields.board_card_id,
    next_action: fields.next_action,
    needs_per_decision: fields.needs_per_decision,
    public_status_note_th: fields.public_status_note_th,
    public_status_note_en: fields.public_status_note_en,
  });
}

function publicCaseFromRecord(record) {
  return {
    complaint_id: record.complaint_id,
    session_id: record.session_id || null,
    status: normalizeWorkflowStatus(record.workflow_status || record.status),
    lane: record.lane === "model" ? "Model" : "Private Review",
    priority: record.priority || priorityFor(record),
    risk: record.risk || riskFor(record),
    received_at: record.received_at || null,
    updated_at: record.updated_at || record.received_at || null,
    evidence_count: Number(record.evidence?.total_files || record.evidence_count || 0),
    board_card_id: record.board_card_id || (record.complaint_id ? `sigil_card_${shortHash(record.complaint_id)}` : ""),
    next_action: record.next_action || "MMD Assistant ตรวจข้อมูลและหลักฐานก่อนส่งต่อ Per หากจำเป็น",
    needs_per_decision: Boolean(record.needs_per_decision),
    public_status_note_th: record.public_status_note_th || "Kenji รับเรื่องไว้ในระบบแล้วครับ และ MMD จะตรวจข้อมูลอย่างระวัง",
    public_status_note_en: record.public_status_note_en || "Kenji has received this case and MMD will review the details carefully.",
  };
}

function airtableConfig(env) {
  const token = env?.AIRTABLE_API_TOKEN || env?.AIRTABLE_TOKEN;
  if (!token) return { enabled: false, reason: "missing_AIRTABLE_API_TOKEN" };
  return {
    enabled: true,
    token,
    baseId: env?.AIRTABLE_BASE_ID || AIRTABLE_BASE_ID_DEFAULT,
    tableName: env?.AIRTABLE_PRIVATE_CARE_CASES_TABLE || AIRTABLE_CASE_TABLE_DEFAULT,
  };
}

async function airtableFetch(env, path, init = {}) {
  const airtable = airtableConfig(env);
  const res = await fetch(`https://api.airtable.com/v0${path}`, {
    ...init,
    headers: { authorization: `Bearer ${airtable.token}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `airtable_${res.status}`);
  return data;
}

function airtableString(value) {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
  return { type: "mmd_private_care_complaint", complaint_id: record.complaint_id, lane: record.lane, client_name: record.client_name, model_name: record.model_name, priority: priorityFor(record), evidence_count: record.evidence?.total_files || 0, received_at: record.received_at };
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = new Set(String(env?.ALLOWED_ORIGINS || "https://mmdbkk.com,https://www.mmdbkk.com,https://sigil.mmdbkk.com,https://mmdprive.webflow.io").split(",").map((item) => item.trim()).filter(Boolean));
  return {
    "access-control-allow-origin": origin && allowed.has(origin) ? origin : "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-mmd-client, x-mmd-route, x-confirm-key",
    "access-control-max-age": "86400",
    vary: "Origin",
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
  if (lane === "assistant" || lane === "mmd") return "internal";
  if (lane.includes("model")) return "model";
  if (lane.includes("client") || lane.includes("member")) return "client";
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

function redactedRecord(record) {
  const copy = { ...record };
  delete copy.token;
  return copy;
}

function safeTimestamp(value) {
  return String(value || new Date().toISOString()).replace(/[-:T.Z]/g, "").slice(0, 14);
}

function safeFileName(name) {
  return clean(name, "evidence", 120).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "evidence";
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
