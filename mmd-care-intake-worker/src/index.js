const WORKER_NAME = "mmd-care-intake-worker";
const MODE = "private_care_metadata_intake";
const ACTIVE_ORIGINS = [
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://sigil.mmdbkk.com",
  "https://mmdprive.webflow.io"
];

const TEXT_FIELDS = [
  "lane",
  "token",
  "session_id",
  "case_id",
  "source",
  "client_name",
  "model_name",
  "case_date",
  "case_time",
  "case_location",
  "client_statement",
  "assistant_statement",
  "model_statement",
  "lane_statement",
  "statement",
  "workflow_status",
  "next_step",
  "final_approver",
  "page",
  "route",
  "referrer",
  "user_agent"
];

const CLIENT_FILE_FIELDS = ["client_evidence[]", "client_evidence"];
const MODEL_FILE_FIELDS = ["model_evidence[]", "model_evidence"];
const BOARD_CARD_KEY = "sigil:board:v1:cards";
const MAX_FILES_PER_SIDE = 12;
const MAX_FILES_TOTAL = 24;
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "pdf"]);
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf"
]);

export default {
  fetch(request, env = {}) {
    return handleRequest(request, env);
  }
};

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (request.method === "GET" && (url.pathname === "/ping" || url.pathname === "/health")) {
    return jsonResponse(request, env, {
      ok: true,
      worker: env.WORKER_NAME || WORKER_NAME,
      mode: MODE
    });
  }

  if (request.method === "POST" && url.pathname === "/member/api/recovery/complaint-evidence") {
    return handleComplaintEvidence(request, env);
  }

  return jsonResponse(request, env, {
    ok: false,
    error: "not_found"
  }, 404);
}

async function handleComplaintEvidence(request, env) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return jsonResponse(request, env, {
      ok: false,
      error: "invalid_content_type",
      message: "multipart/form-data is required"
    }, 415);
  }

  const form = await request.formData();
  const rawFields = collectTextFields(form);
  const fields = sanitizeFields(rawFields);
  const evidence = collectEvidence(form);
  const validationError = validateEvidence(evidence);

  if (validationError) {
    return jsonResponse(request, env, {
      ok: false,
      error: validationError.error,
      message: validationError.message
    }, validationError.status);
  }

  const now = new Date().toISOString();
  const complaintId = fields.case_id || `complaint_${crypto.randomUUID()}`;
  const tokenHash = rawFields.token ? await shortHash(rawFields.token) : "";
  const r2Storage = await storeEvidenceFiles(env, evidence, complaintId, now);
  const evidenceSummary = buildEvidenceSummary(evidence, r2Storage.files);
  const complaint = {
    id: complaintId,
    received_at: now,
    lane: normalizeLane(rawFields.lane),
    source: fields.source || "sigil-recovery-complaint",
    page: fields.page || "/sigil/recovery/complaint",
    route: fields.route || "/sigil/recovery/complaint",
    token_hash: tokenHash || null,
    session_id: fields.session_id || null,
    case_id: fields.case_id || null,
    binary_storage: "not_stored_in_kv",
    fields,
    evidence: evidenceSummary
  };

  const caseRecord = await persistCaseRecord(env, complaint);
  const boardCard = await upsertBoardCard(env, complaint, rawFields);
  const googleDrive = await notifyGoogleDrive(env.COMPLAINT_GOOGLE_DRIVE_WEBHOOK_URL, complaint);
  const telegram = await notifyTelegram(env.COMPLAINT_TELEGRAM_WEBHOOK_URL, complaint, boardCard.card);

  return jsonResponse(request, env, {
    ok: true,
    source: caseRecord.persisted ? "kv" : "ephemeral",
    mode: MODE,
    message: "Private care complaint received",
    binary_storage: "not_stored_in_kv",
    complaint,
    storage: {
      case_record: caseRecord,
      board_card: boardCard,
      r2: r2Storage.summary,
      google_drive: googleDrive,
      telegram
    }
  });
}

function collectTextFields(form) {
  const fields = {};
  for (const name of TEXT_FIELDS) {
    const value = form.get(name);
    if (typeof value === "string") {
      fields[name] = value.trim();
    }
  }
  return fields;
}

function sanitizeFields(fields) {
  const sanitized = {};
  for (const [key, value] of Object.entries(fields)) {
    sanitized[key] = sanitizeText(value);
  }
  if (sanitized.token) {
    sanitized.token = "[redacted]";
  }
  return sanitized;
}

function sanitizeText(value = "") {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted_email]")
    .replace(/(?:\+?\d[\s().-]*){8,}\d/g, "[redacted_phone]")
    .replace(/\bU[a-f0-9]{32}\b/gi, "[redacted_line_user_id]")
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, "[redacted_telegram_token]")
    .replace(/https?:\/\/[^\s]+/gi, "[redacted_url]")
    .replace(/\b(token|secret|passphrase|api key|bank|slip url)\b/gi, "[redacted_keyword]");
}

function collectEvidence(form) {
  return {
    client: CLIENT_FILE_FIELDS.flatMap((field) => form.getAll(field).filter(isFileLike)),
    model: MODEL_FILE_FIELDS.flatMap((field) => form.getAll(field).filter(isFileLike))
  };
}

function validateEvidence(evidence) {
  if (evidence.client.length > MAX_FILES_PER_SIDE) {
    return invalidFile("too_many_client_files", "Client evidence can include at most 12 files.");
  }

  if (evidence.model.length > MAX_FILES_PER_SIDE) {
    return invalidFile("too_many_model_files", "Model evidence can include at most 12 files.");
  }

  const allFiles = [...evidence.client, ...evidence.model];
  if (allFiles.length > MAX_FILES_TOTAL) {
    return invalidFile("too_many_files", "Complaint evidence can include at most 24 files total.");
  }

  for (const file of allFiles) {
    if (file.size > MAX_FILE_SIZE) {
      return invalidFile("file_too_large", `${file.name || "Evidence file"} is larger than 15MB.`);
    }

    const extension = fileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME.has(file.type)) {
      return invalidFile("unsupported_file_type", `${file.name || "Evidence file"} is not an allowed evidence type.`);
    }
  }

  return null;
}

function invalidFile(error, message) {
  return { status: 400, error, message };
}

async function storeEvidenceFiles(env, evidence, complaintId, receivedAt) {
  const files = { client: [], model: [] };
  const r2 = env.COMPLAINT_EVIDENCE_R2;
  if (!r2) {
    return {
      files,
      summary: {
        enabled: false,
        stored_files: 0,
        reason: "missing_COMPLAINT_EVIDENCE_R2"
      }
    };
  }

  for (const side of ["client", "model"]) {
    for (const file of evidence[side]) {
      const originalName = file.name || "";
      const safeName = safeEvidenceFilename(originalName);
      const r2Key = `complaints/${complaintId}/${side}/${receivedAtForKey(receivedAt)}-${safeName}`;
      await r2.put(r2Key, await file.arrayBuffer(), {
        httpMetadata: {
          contentType: file.type || "application/octet-stream"
        },
        customMetadata: {
          complaint_id: complaintId,
          side,
          original_name: originalName,
          received_at: receivedAt
        }
      });
      files[side].push({ r2_key: r2Key, safe_name: safeName });
    }
  }

  return {
    files,
    summary: {
      enabled: true,
      stored_files: files.client.length + files.model.length,
      bucket: "mmd-care-evidence",
      binding: "COMPLAINT_EVIDENCE_R2"
    }
  };
}

function buildEvidenceSummary(evidence, storedFiles = { client: [], model: [] }) {
  const client = evidence.client.map((file, index) => toEvidenceMetadata(file, storedFiles.client[index]));
  const model = evidence.model.map((file, index) => toEvidenceMetadata(file, storedFiles.model[index]));
  return {
    total_files: client.length + model.length,
    client,
    model
  };
}

function toEvidenceMetadata(file, storedFile) {
  const safeName = storedFile?.safe_name || safeEvidenceFilename(file.name || "");
  return {
    name: sanitizeText(file.name || "evidence"),
    safe_name: safeName,
    size: file.size,
    type: file.type,
    extension: fileExtension(file.name),
    storage_status: storedFile ? "stored_in_r2" : "metadata_received",
    r2_key: storedFile?.r2_key || null
  };
}

async function persistCaseRecord(env, complaint) {
  const kv = env.SIGIL_COMPLAINT_KV || env.SIGIL_BOARD_KV;
  if (!kv) {
    return {
      persisted: false,
      binding: null,
      keys: [],
      reason: "no_kv_binding"
    };
  }

  const keys = [`mmd:private-care:complaint:v1:id:${complaint.id}`];
  if (complaint.session_id) {
    keys.push(`mmd:private-care:complaint:v1:sid:${complaint.session_id}`);
  }
  if (complaint.token_hash) {
    keys.push(`mmd:private-care:complaint:v1:token:${complaint.token_hash}`);
  }

  const body = JSON.stringify(complaint);
  await Promise.all(keys.map((key) => kv.put(key, body)));

  return {
    persisted: true,
    binding: env.SIGIL_COMPLAINT_KV ? "SIGIL_COMPLAINT_KV" : "SIGIL_BOARD_KV",
    keys
  };
}

async function upsertBoardCard(env, complaint, rawFields) {
  const kv = env.SIGIL_BOARD_KV;
  const card = await buildBoardCard(complaint, rawFields);
  if (!kv) {
    return {
      persisted: false,
      key: BOARD_CARD_KEY,
      card,
      reason: "no_sigil_board_kv_binding"
    };
  }

  const existing = await readBoardCards(kv);
  const withoutCurrent = existing.filter((item) => item && item.id !== card.id);
  const nextCards = [...withoutCurrent, card];
  await kv.put(BOARD_CARD_KEY, JSON.stringify(nextCards));

  return {
    persisted: true,
    key: BOARD_CARD_KEY,
    card
  };
}

async function readBoardCards(kv) {
  const raw = await kv.get(BOARD_CARD_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed.cards)) {
      return parsed.cards;
    }
  } catch {
    return [];
  }

  return [];
}

async function buildBoardCard(complaint, rawFields) {
  const priority = pickPriority(rawFields, complaint.evidence.total_files);
  const risk = pickRisk(rawFields);
  const safeName = complaint.fields.client_name || complaint.fields.model_name || complaint.id;
  return {
    id: `sigil_card_${await shortHash(complaint.id)}`,
    title: `Private care complaint: ${safeName}`,
    lane: complaint.lane,
    status: "Need Info",
    priority,
    risk,
    next_action: "MMD Assistant ตรวจข้อมูลและหลักฐานก่อนส่งต่อ Per หากจำเป็น",
    owner: pickOwner(rawFields.lane),
    needs_per_decision: false,
    summary: "Complaint evidence received",
    received_at: complaint.received_at
  };
}

function normalizeLane(lane = "") {
  const normalized = lane.toLowerCase();
  if (normalized === "model" || normalized.includes("model") || normalized.includes("นายแบบ")) {
    return "Model";
  }
  return "Private Review";
}

function pickOwner(lane = "") {
  return lane.toLowerCase().includes("assistant") ? "Kenji" : "MMD";
}

function pickPriority(fields, evidenceCount) {
  const text = riskText(fields);
  if (hasAny(text, ["privacy", "leak", "refund", "คืนเงิน", "ไม่ปลอดภัย", "ละเมิด", "ข้อมูล", "safety"])) {
    return "Critical";
  }
  if (evidenceCount > 0) {
    return "High";
  }
  return "Medium";
}

function pickRisk(fields) {
  const text = riskText(fields);
  if (hasAny(text, ["privacy", "leak", "safety", "data", "ไม่ปลอดภัย", "ละเมิด", "ข้อมูล"])) {
    return "Safety review required";
  }
  if (hasAny(text, ["refund", "payment", "คืนเงิน"])) {
    return "Refund or payment review";
  }
  return "Private care review";
}

function riskText(fields) {
  return [
    fields.client_statement,
    fields.assistant_statement,
    fields.model_statement,
    fields.lane_statement,
    fields.statement,
    fields.workflow_status,
    fields.next_step
  ].filter(Boolean).join(" ").toLowerCase();
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

async function notifyGoogleDrive(url, complaint) {
  if (!url) {
    return {
      forwarded: false,
      reason: "missing_google_drive_webhook_url"
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(complaint)
    });
    return {
      forwarded: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      forwarded: false,
      reason: error instanceof Error ? error.message : "google_drive_webhook_error"
    };
  }
}

async function notifyTelegram(url, complaint, card) {
  if (!url) {
    return {
      forwarded: false,
      reason: "missing_telegram_webhook_url"
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "mmd_private_care_complaint",
        complaint_id: complaint.id,
        lane: complaint.lane,
        client_name: complaint.fields.client_name || "",
        model_name: complaint.fields.model_name || "",
        priority: card ? card.priority : "Medium",
        evidence_count: complaint.evidence.total_files,
        received_at: complaint.received_at
      })
    });
    return {
      forwarded: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      forwarded: false,
      reason: error instanceof Error ? error.message : "telegram_webhook_error"
    };
  }
}

function corsHeaders(request, env) {
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-mmd-client, x-mmd-route, x-confirm-key",
    "vary": "Origin"
  });

  const origin = request.headers.get("origin");
  if (origin && allowedOrigins(env).has(origin)) {
    headers.set("access-control-allow-origin", origin);
  }

  return headers;
}

function jsonResponse(request, env, body, status = 200) {
  const headers = corsHeaders(request, env);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function allowedOrigins(env) {
  const configured = typeof env.ALLOWED_ORIGINS === "string"
    ? env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
    : [];
  return new Set(configured.length ? configured : ACTIVE_ORIGINS);
}

function isFileLike(value) {
  return value && typeof value === "object" && typeof value.name === "string" && typeof value.size === "number";
}

function fileExtension(name = "") {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index + 1).toLowerCase();
}

function safeEvidenceFilename(name = "") {
  const withoutPath = name.split(/[\\/]+/).pop() || "";
  const trimmed = withoutPath.trim().toLowerCase();
  const fallback = trimmed || "evidence-file";
  const extension = fileExtension(fallback);
  const base = extension ? fallback.slice(0, -(extension.length + 1)) : fallback;
  const safeBase = base
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "") || "evidence-file";
  const safeExtension = extension.replace(/[^a-z0-9]+/g, "");
  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
}

function receivedAtForKey(receivedAt) {
  return receivedAt.replace(/[-:]/g, "").replace("T", "_").replace(/\.\d{3}Z$/, "");
}

async function shortHash(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
