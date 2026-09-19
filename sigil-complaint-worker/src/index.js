const WORKER_NAME_FALLBACK = "sigil-complaint-worker";
const MODE = "r2_binary_intake";
const COMPLAINT_EVIDENCE_PATH = "/member/api/recovery/complaint-evidence";
const COMPLAINT_CASE_KV_PREFIX = "sigil:complaint:case:v1:";
const BOARD_CARDS_KV_KEY = "sigil:board:v1:cards";
const MAX_EVIDENCE_FILES_PER_SIDE = 12;
const MAX_EVIDENCE_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_EVIDENCE_FILES = MAX_EVIDENCE_FILES_PER_SIDE * 2;
const EVIDENCE_R2_PREFIX = "sigil/complaints/v1";
const ALLOWED_EVIDENCE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "pdf"]);
const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const ALLOWED_COMPLAINT_LANES = new Set(["client", "assistant", "model"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = corsFor(request, env);

    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

      if (url.pathname === "/health" || url.pathname === "/ping") {
        if (request.method !== "GET") return methodNotAllowed(corsHeaders, "GET, OPTIONS");
        return json({
          ok: true,
          worker: workerName(env),
          mode: MODE,
          evidence_storage: evidenceBucket(env) ? "cloudflare_r2" : "metadata_only",
        }, 200, corsHeaders);
      }

      if (url.pathname === COMPLAINT_EVIDENCE_PATH) {
        if (request.method !== "POST") return methodNotAllowed(corsHeaders, "POST, OPTIONS");
        return handleComplaintEvidence(request, env, corsHeaders);
      }

      return json({ ok: false, error: "not_found", worker: workerName(env), path: url.pathname }, 404, corsHeaders);
    } catch (error) {
      console.error(JSON.stringify({ worker: workerName(env), path: url.pathname, error: errorMessage(error) }));
      return json({ ok: false, error: "internal_error", message: errorMessage(error) }, 500, corsHeaders);
    }
  },
};

async function handleComplaintEvidence(request, env, corsHeaders) {
  const contentType = request.headers.get("content-type") || "";
  if (!/multipart\/form-data/i.test(contentType)) {
    return json({ ok: false, error: "invalid_content_type", message: "multipart/form-data is required" }, 415, corsHeaders);
  }

  const formData = await request.formData();
  const now = new Date().toISOString();
  const complaintId = makeComplaintId(formData, now);
  const lane = normalizeComplaintLane(formData.get("lane"));

  const clientFiles = fileEntries(formData, "client_evidence[]", "client_evidence");
  const modelFiles = fileEntries(formData, "model_evidence[]", "model_evidence");
  const allFiles = [...clientFiles.map((file) => ["client", file]), ...modelFiles.map((file) => ["model", file])];
  const fileError = validateEvidenceFiles(allFiles);
  if (fileError) return json(fileError, 400, corsHeaders);

  const evidenceStorage = await storeEvidenceFiles(env, complaintId, allFiles, now);
  const evidenceMeta = buildEvidenceRecord(evidenceStorage, allFiles);

  const caseRecord = normalizeComplaintCase({
    complaint_id: complaintId,
    lane,
    token: safeText(formData.get("token"), "", 500) || null,
    session_id: safeText(formData.get("session_id"), "", 120) || null,
    case_id: safeText(formData.get("case_id"), "", 120) || null,
    source: safeText(formData.get("source"), "webflow", 80),
    client_name: safeText(formData.get("client_name"), "", 120),
    model_name: safeText(formData.get("model_name"), "", 120),
    case_date: safeText(formData.get("case_date"), "", 40),
    case_time: safeText(formData.get("case_time"), "", 40),
    case_location: safeText(formData.get("case_location"), "", 180),
    client_statement: safeLongText(formData.get("client_statement"), 4000),
    assistant_statement: safeLongText(formData.get("assistant_statement"), 4000),
    model_statement: safeLongText(formData.get("model_statement"), 4000),
    lane_statement: safeLongText(formData.get("lane_statement"), 4000),
    statement: safeLongText(formData.get("statement"), 5000),
    workflow_status: safeText(formData.get("workflow_status"), "received_with_evidence", 80),
    next_step: safeText(formData.get("next_step"), "mmd_assistant_review", 80),
    final_approver: safeText(formData.get("final_approver"), "Boss Per", 80),
    page: safeText(formData.get("page"), "mmd-private-care-complaint", 120),
    route: safeText(formData.get("route"), "", 160),
    referrer: safeText(formData.get("referrer"), "", 260),
    user_agent: safeText(formData.get("user_agent"), "", 260),
    received_at: now,
    evidence: evidenceMeta,
  });

  const kvWrite = await writeStoredComplaintCase(env, caseRecord);
  const boardWrite = await appendComplaintBoardCard(env, caseRecord);
  const webhooks = await forwardComplaintWebhooks(env, caseRecord);

  return json(
    {
      ok: true,
      source: kvWrite.persisted ? "kv" : "ephemeral",
      mode: MODE,
      message: "Complaint evidence received",
      complaint: caseRecord,
      storage: {
        case_record: kvWrite,
        board_card: boardWrite,
        r2: evidenceStorage.storage,
        google_drive: webhooks.google_drive,
        telegram: webhooks.telegram,
      },
    },
    200,
    corsHeaders,
  );
}

function makeComplaintId(formData, now) {
  const explicit = safeText(formData.get("case_id"), "", 120);
  if (/^cmp_[a-z0-9_\-]+$/i.test(explicit)) return explicit;
  const sid = safeText(formData.get("session_id"), "", 120);
  const token = safeText(formData.get("token"), "", 500);
  const fingerprint = [sid, token, formData.get("client_name"), formData.get("model_name"), now].join("|");
  return `cmp_${Date.now().toString(36)}_${shortHash(fingerprint)}`;
}

function normalizeComplaintLane(value) {
  const lane = String(value || "client").trim().toLowerCase();
  return ALLOWED_COMPLAINT_LANES.has(lane) ? lane : "client";
}

function fileEntries(formData, arrayKey, fallbackKey) {
  const entries = [...formData.getAll(arrayKey), ...formData.getAll(fallbackKey)];
  return entries.filter((entry) => isFileLike(entry) && entry.size > 0);
}

function isFileLike(value) {
  return value && typeof value === "object" && typeof value.name === "string" && typeof value.size === "number";
}

function validateEvidenceFiles(pairs) {
  if (pairs.length > MAX_TOTAL_EVIDENCE_FILES) {
    return { ok: false, error: "too_many_files", message: `แนบไฟล์ได้รวมสูงสุด ${MAX_TOTAL_EVIDENCE_FILES} ไฟล์` };
  }

  const sideCounts = { client: 0, model: 0 };
  for (const [side, file] of pairs) {
    sideCounts[side] += 1;
    if (sideCounts[side] > MAX_EVIDENCE_FILES_PER_SIDE) {
      return { ok: false, error: "too_many_files", message: `${side} evidence แนบไฟล์ได้สูงสุด ${MAX_EVIDENCE_FILES_PER_SIDE} ไฟล์` };
    }

    if (file.size > MAX_EVIDENCE_FILE_BYTES) {
      return { ok: false, error: "file_too_large", message: `ไฟล์ ${file.name} มีขนาดเกิน 15MB` };
    }

    const ext = fileExtension(file.name);
    const typeOk = ALLOWED_EVIDENCE_MIME_TYPES.has(String(file.type || "").toLowerCase());
    const extOk = ALLOWED_EVIDENCE_EXTENSIONS.has(ext);
    if (!typeOk && !extOk) {
      return { ok: false, error: "unsupported_file_type", message: `ไฟล์ ${file.name} ไม่ใช่ประเภทที่รองรับ` };
    }
  }

  return null;
}

async function storeEvidenceFiles(env, complaintId, pairs, receivedAt) {
  const bucket = evidenceBucket(env);
  if (!bucket || typeof bucket.put !== "function") {
    return {
      storage: {
        persisted: false,
        provider: "metadata_only",
        reason: "missing_SIGIL_COMPLAINT_EVIDENCE_R2",
      },
      files: pairs.map(([side, file], index) => ({ side, ...evidenceFileMeta(file, { index }) })),
    };
  }

  const files = [];
  for (let index = 0; index < pairs.length; index += 1) {
    const [side, file] = pairs[index];
    const r2Key = evidenceR2Key(complaintId, side, file, index);
    await bucket.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: String(file.type || "application/octet-stream"),
      },
      customMetadata: {
        complaint_id: complaintId,
        side,
        original_name: safeText(file.name, "untitled", 160),
        received_at: receivedAt,
      },
    });
    files.push({
      side,
      ...evidenceFileMeta(file, {
        index,
        storage_status: "stored",
        storage_provider: "cloudflare_r2",
        r2_key: r2Key,
      }),
    });
  }

  return {
    storage: {
      persisted: true,
      provider: "cloudflare_r2",
      binding: "SIGIL_COMPLAINT_EVIDENCE_R2",
      files_written: files.length,
      prefix: `${EVIDENCE_R2_PREFIX}/${complaintId}`,
    },
    files,
  };
}

function buildEvidenceRecord(evidenceStorage, originalPairs) {
  const files = evidenceStorage.files || [];
  return {
    client: files.filter((file) => file.side === "client").map(stripEvidenceSide),
    model: files.filter((file) => file.side === "model").map(stripEvidenceSide),
    total_files: originalPairs.length,
    total_bytes: originalPairs.reduce((sum, pair) => sum + Number(pair[1].size || 0), 0),
    binary_storage: evidenceStorage.storage?.persisted ? "cloudflare_r2" : "metadata_only",
    storage_provider: evidenceStorage.storage?.provider || "metadata_only",
    storage: evidenceStorage.storage,
    note: evidenceStorage.storage?.persisted
      ? "Raw evidence bytes were stored in private Cloudflare R2. Use admin-signed access before sharing."
      : "This worker stored evidence metadata only because SIGIL_COMPLAINT_EVIDENCE_R2 was not bound.",
  };
}

function stripEvidenceSide(file) {
  const { side, ...rest } = file;
  return rest;
}

function evidenceFileMeta(file, extra = {}) {
  return {
    name: safeText(file.name, "untitled", 160),
    size: Number(file.size || 0),
    type: safeText(file.type, "application/octet-stream", 80),
    extension: fileExtension(file.name),
    storage_status: extra.storage_status || "metadata_received",
    storage_provider: extra.storage_provider || "metadata_only",
    ...(extra.r2_key ? { r2_key: extra.r2_key } : {}),
  };
}

function evidenceBucket(env) {
  return env?.SIGIL_COMPLAINT_EVIDENCE_R2 || env?.COMPLAINT_EVIDENCE_R2 || null;
}

function evidenceR2Key(complaintId, side, file, index) {
  const ext = fileExtension(file.name) || "bin";
  const safeSide = ALLOWED_COMPLAINT_LANES.has(side) ? side : "client";
  const fingerprint = shortHash([complaintId, side, index, file.name, file.size, file.type].join("|"));
  const ordinal = String(index + 1).padStart(2, "0");
  return `${EVIDENCE_R2_PREFIX}/${complaintId}/${safeSide}/${ordinal}-${fingerprint}.${ext}`;
}

function fileExtension(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function normalizeComplaintCase(value) {
  return {
    complaint_id: value.complaint_id,
    lane: value.lane,
    token: value.token,
    session_id: value.session_id,
    case_id: value.case_id,
    source: value.source,
    client_name: value.client_name,
    model_name: value.model_name,
    case_date: value.case_date,
    case_time: value.case_time,
    case_location: value.case_location,
    client_statement: value.client_statement,
    assistant_statement: value.assistant_statement,
    model_statement: value.model_statement,
    lane_statement: value.lane_statement,
    statement: value.statement,
    workflow_status: value.workflow_status,
    next_step: value.next_step,
    final_approver: value.final_approver,
    page: value.page,
    route: value.route,
    referrer: value.referrer,
    user_agent: value.user_agent,
    received_at: value.received_at,
    evidence: value.evidence,
  };
}

async function writeStoredComplaintCase(env, caseRecord) {
  const kv = env?.SIGIL_COMPLAINT_KV || env?.SIGIL_BOARD_KV || null;
  if (!kv || typeof kv.put !== "function") return { persisted: false, reason: "missing_complaint_kv" };
  const keys = complaintLookupKeys(caseRecord);
  const value = JSON.stringify(caseRecord);

  try {
    await Promise.all(keys.map((key) => kv.put(key, value)));
    return { persisted: true, keys_written: keys.length };
  } catch (error) {
    console.error(JSON.stringify({ worker: workerName(env), source: "complaint_kv_write", error: errorMessage(error) }));
    return { persisted: false, reason: errorMessage(error) };
  }
}

async function appendComplaintBoardCard(env, caseRecord) {
  const kv = env?.SIGIL_BOARD_KV;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") return { persisted: false, reason: "missing_SIGIL_BOARD_KV" };

  try {
    const existing = normalizeSourceRecords(parseJson(await kv.get(BOARD_CARDS_KV_KEY)));
    const card = complaintBoardCard(caseRecord);
    const next = [card, ...existing.filter((item) => stableCardId(item, item.fields || item, 0) !== card.id)].slice(0, 200);
    await kv.put(BOARD_CARDS_KV_KEY, JSON.stringify({ cards: next, updated_at: new Date().toISOString(), source: "complaint_evidence" }));
    return { persisted: true, card_id: card.id };
  } catch (error) {
    console.error(JSON.stringify({ worker: workerName(env), source: "complaint_board_write", error: errorMessage(error) }));
    return { persisted: false, reason: errorMessage(error) };
  }
}

function normalizeSourceRecords(source) {
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.cards)) return source.cards;
  if (Array.isArray(source?.records)) return source.records;
  if (Array.isArray(source?.items)) return source.items;
  return [];
}

function complaintLookupKeys(caseRecord) {
  return [
    `${COMPLAINT_CASE_KV_PREFIX}id:${caseRecord.complaint_id}`,
    caseRecord.session_id ? `${COMPLAINT_CASE_KV_PREFIX}sid:${caseRecord.session_id}` : "",
    caseRecord.token ? `${COMPLAINT_CASE_KV_PREFIX}token:${shortHash(String(caseRecord.token))}` : "",
  ].filter(Boolean);
}

function complaintBoardCard(caseRecord) {
  const titleName = caseRecord.client_name || caseRecord.model_name || caseRecord.complaint_id;
  return {
    id: `sigil_card_${shortHash(caseRecord.complaint_id)}`,
    title: `Private care complaint: ${safeText(titleName, "new case", 60)}`,
    lane: caseRecord.lane === "model" ? "Model" : "Private Review",
    status: "Need Info",
    priority: complaintPriority(caseRecord),
    risk: complaintRisk(caseRecord),
    next_action: "MMD Assistant ตรวจข้อมูลและหลักฐานก่อนส่งต่อ Per หากจำเป็น",
    owner: caseRecord.lane === "assistant" ? "Kenji" : "MMD",
    needs_per_decision: complaintNeedsPer(caseRecord),
    summary: safeText(caseRecord.lane_statement || caseRecord.statement || "Complaint evidence received", "Complaint evidence received", 180),
    received_at: caseRecord.received_at,
  };
}

function complaintPriority(caseRecord) {
  const text = `${caseRecord.statement} ${caseRecord.lane_statement} ${caseRecord.case_location}`.toLowerCase();
  if (/privacy|safe|leak|refund|คืนเงิน|ไม่ปลอดภัย|ละเมิด|ข้อมูล/.test(text)) return "Critical";
  if (caseRecord.evidence?.total_files > 0) return "High";
  return "Medium";
}

function complaintRisk(caseRecord) {
  const text = `${caseRecord.statement} ${caseRecord.lane_statement}`.toLowerCase();
  if (/privacy|leak|ข้อมูล|ความปลอดภัย|ละเมิด/.test(text)) return "Safety review required";
  if (/refund|คืนเงิน|payment|จ่าย|ชำระ/.test(text)) return "Refund or payment review";
  return "Private care review";
}

function complaintNeedsPer(caseRecord) {
  return complaintPriority(caseRecord) === "Critical" || /refund|คืนเงิน|privacy|leak|ละเมิด|ความปลอดภัย/i.test(`${caseRecord.statement} ${caseRecord.lane_statement}`);
}

async function forwardComplaintWebhooks(env, caseRecord) {
  const googleDrive = await forwardJsonWebhook(env?.COMPLAINT_GOOGLE_DRIVE_WEBHOOK_URL, caseRecord, "google_drive");
  const telegram = await forwardJsonWebhook(env?.COMPLAINT_TELEGRAM_WEBHOOK_URL, complaintTelegramPayload(caseRecord), "telegram");
  return { google_drive: googleDrive, telegram };
}

async function forwardJsonWebhook(url, payload, label) {
  if (!url) return { forwarded: false, reason: `missing_${label}_webhook_url` };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { forwarded: res.ok, status: res.status };
  } catch (error) {
    return { forwarded: false, reason: errorMessage(error) };
  }
}

function complaintTelegramPayload(caseRecord) {
  return {
    type: "mmd_private_care_complaint",
    complaint_id: caseRecord.complaint_id,
    lane: caseRecord.lane,
    client_name: caseRecord.client_name,
    model_name: caseRecord.model_name,
    priority: complaintPriority(caseRecord),
    needs_per_decision: complaintNeedsPer(caseRecord),
    evidence_count: caseRecord.evidence?.total_files || 0,
    evidence_storage: caseRecord.evidence?.binary_storage || "metadata_only",
    received_at: caseRecord.received_at,
  };
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
    if (fields?.[key] !== undefined && fields?.[key] !== null && fields?.[key] !== "") return fields[key];
  }
  return "";
}

function corsFor(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = allowedOrigins(env);
  const allowOrigin = origin && allowed.has(origin) ? origin : "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-mmd-client, x-mmd-route, x-confirm-key",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

function allowedOrigins(env) {
  return new Set(
    String(env?.ALLOWED_ORIGINS || "https://mmdbkk.com,https://www.mmdbkk.com,https://sigil.mmdbkk.com,https://mmdprive.webflow.io")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function methodNotAllowed(corsHeaders, allow = "GET, OPTIONS") {
  return json({ ok: false, error: "method_not_allowed" }, 405, { ...corsHeaders, allow });
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function parseJson(value) {
  if (!value) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
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

function safeLongText(value, maxLength = 4000) {
  let output = String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
  output = output
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[masked]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[masked]")
    .replace(/\bU[a-f0-9]{20,}\b/gi, "[masked]")
    .replace(/\b\d{7,}:[A-Za-z0-9_-]{20,}\b/g, "[masked]")
    .replace(/https?:\/\/\S+/gi, "[masked]")
    .replace(/\b(token|secret|passphrase|api[_ -]?key|bank|slip[_ -]?url)\b/gi, "[redacted]");
  return output.slice(0, maxLength);
}

function shortHash(value) {
  let hash = 5381;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function workerName(env) {
  return env?.WORKER_NAME || WORKER_NAME_FALLBACK;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}
