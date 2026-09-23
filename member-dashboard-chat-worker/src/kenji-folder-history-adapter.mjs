import {
  buildAssessmentInput,
  buildCustomerSafeReply,
  evaluateCustomerHistory,
  normalizeFolderMention,
  resolveFolderMention,
} from "./kenji-folder-history-assessment.mjs";

export const KENJI_FOLDER_ASSESSMENT_ENABLED_ENV = "KENJI_FOLDER_HISTORY_ASSESSMENT_ENABLED";
export const KENJI_FOLDER_ASSESSMENT_CANARY_ENV = "KENJI_FOLDER_HISTORY_ASSESSMENT_CANARY_HASHES";
export const KENJI_FOLDER_ASSESSMENT_TABLE = "MMD — Kenji Customer History Assessments";
export const KENJI_MODEL_KEYWORD_TABLE = "MMD — Model Keyword Profiles";
export const KENJI_CONSOLE_INBOX_TABLE = "MMD — Console Inbox";
export const KENJI_FOLDER_ASSESSMENT_ROLLOUT_STAGE = "internal_canary";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(asString(value).toLowerCase());
}

function bounded(value, max) {
  return asString(value).slice(0, max);
}

function escapeFormula(value) {
  return asString(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseCanaryHashes(value) {
  const raw = asString(value);
  if (!raw) return new Set();
  return new Set(raw.split(/[,\s]+/).filter((item) => /^[a-f0-9]{64}$/i.test(item)).map((item) => item.toLowerCase()));
}

async function sha256Hex(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value || "")),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function eventText(event = {}) {
  if (event?.type === "message" && event?.message?.type === "text") return bounded(event.message.text, 800);
  if (event?.type === "postback") return bounded(event?.postback?.displayText || event?.postback?.data, 800);
  return "";
}

function eventId(event = {}) {
  return asString(event?.message?.id || event?.webhookEventId || event?.replyToken);
}

function lineUserId(event = {}) {
  const value = asString(event?.source?.userId || event?.line_user_id);
  return /^U[a-f0-9]{32}$/i.test(value) ? value : "";
}

function parsePayload(value) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(asString(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function fieldsFromRecord(record) {
  return record?.fields && typeof record.fields === "object" ? record.fields : {};
}

function selectValue(value) {
  if (Array.isArray(value)) return value.map((item) => item?.name || item).filter(Boolean);
  if (value && typeof value === "object") return value.name || "";
  return asString(value);
}

function keywordCatalogEntry(record) {
  const fields = fieldsFromRecord(record);
  const aliases = selectValue(fields.search_aliases);
  return {
    model_key: asString(fields.model_key),
    folder_name: asString(fields.folder_name),
    display_name: asString(fields.working_name),
    aliases: Array.isArray(aliases) ? aliases : asString(aliases).split(/\r?\n/).filter(Boolean),
    status: asString(fields.status).toLowerCase(),
    include_in_public_kenji: asString(fields.include_in_public_kenji).toLowerCase(),
  };
}

function isApprovedKeywordEntry(entry) {
  const status = entry.status;
  const include = entry.include_in_public_kenji;
  return (!status || ["active", "approved", "published"].includes(status))
    && (!include || ["yes", "true", "approved", "active"].includes(include));
}

export function findFolderMentionInText(text, catalog = []) {
  const normalizedText = normalizeFolderMention(text);
  if (!normalizedText) return { status: "missing", normalized: "", matches: [] };

  const candidates = [];
  for (const rawEntry of catalog) {
    const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
    const names = [
      entry.folder_name,
      entry.model_key,
      entry.display_name,
      ...(Array.isArray(entry.aliases) ? entry.aliases : []),
    ].map(normalizeFolderMention).filter(Boolean);
    for (const name of names) {
      if (normalizedText === name || normalizedText.includes(name)) {
        candidates.push({ mention: name, entry });
      }
    }
  }

  if (!candidates.length) return { status: "not_found", normalized: normalizedText, matches: [] };

  const longest = Math.max(...candidates.map((item) => item.mention.length));
  const matches = candidates
    .filter((item) => item.mention.length === longest)
    .map((item) => item.entry)
    .filter((entry, index, all) => (
      all.findIndex((other) => asString(other.model_key) === asString(entry.model_key)) === index
    ));

  if (matches.length > 1) {
    return {
      status: "ambiguous",
      normalized: candidates.find((item) => item.mention.length === longest)?.mention || normalizedText,
      matches,
    };
  }

  return {
    status: "matched",
    normalized: candidates.find((item) => item.mention.length === longest)?.mention || normalizedText,
    match: matches[0],
    matches,
  };
}

async function airtableList(env, table, params = {}, fetchImpl = fetch) {
  const baseId = asString(env.AIRTABLE_BASE_ID);
  const apiKey = asString(env.AIRTABLE_API_KEY);
  if (!baseId || !apiKey || !table) return [];
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
    });
  } catch (_) {
    return [];
  }
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.records) ? payload.records : [];
}

export async function fetchModelFolderCatalog({ env = {}, fetchImpl = fetch } = {}) {
  const table = asString(env.AIRTABLE_KENJI_MODEL_KEYWORD_TABLE || KENJI_MODEL_KEYWORD_TABLE);
  const records = await airtableList(env, table, {
    pageSize: 100,
    "fields[]": ["model_key", "folder_name", "working_name", "search_aliases", "status", "include_in_public_kenji"],
  }, fetchImpl);
  return records.map(keywordCatalogEntry).filter(isApprovedKeywordEntry);
}

function historyMessageFromRecord(record) {
  const fields = fieldsFromRecord(record);
  const payload = parsePayload(fields.payload_json);
  const text = bounded(payload.raw_text || fields.admin_note, 1600);
  return {
    role: "customer",
    text,
    occurred_at: asString(fields.created_at),
    source_ref_hash: "",
    _source_ref: asString(fields.line_id || fields.inbox_id),
  };
}

export async function fetchSameCustomerLineHistory({
  env = {},
  lineUserId: customerLineUserId = "",
  fetchImpl = fetch,
} = {}) {
  const userId = asString(customerLineUserId);
  if (!/^U[a-f0-9]{32}$/i.test(userId)) return [];
  const table = asString(env.AIRTABLE_CONSOLE_INBOX_TABLE || KENJI_CONSOLE_INBOX_TABLE);
  const formula = `AND({line_user_id}="${escapeFormula(userId)}",{source}="line")`;
  const records = await airtableList(env, table, {
    pageSize: 50,
    filterByFormula: formula,
    "fields[]": ["inbox_id", "line_id", "created_at", "admin_note", "payload_json", "intent", "source"],
  }, fetchImpl);
  return records
    .map(historyMessageFromRecord)
    .filter((item) => item.text)
    .sort((left, right) => String(left.occurred_at).localeCompare(String(right.occurred_at)))
    .slice(-50);
}

async function persistAssessment({ env = {}, record = {}, fetchImpl = fetch } = {}) {
  const baseId = asString(env.AIRTABLE_BASE_ID);
  const apiKey = asString(env.AIRTABLE_API_KEY);
  const table = asString(env.AIRTABLE_KENJI_HISTORY_ASSESSMENT_TABLE || KENJI_FOLDER_ASSESSMENT_TABLE);
  if (!baseId || !apiKey || !table) return { ok: false, error: "airtable_config_missing" };

  let response;
  try {
    response = await fetchImpl(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ records: [{ fields: record }] }),
    });
  } catch (_) {
    return { ok: false, error: "assessment_write_failed" };
  }
  if (!response.ok) return { ok: false, error: "assessment_write_failed", status: response.status };
  const payload = await response.json().catch(() => ({}));
  return { ok: true, id: asString(payload?.records?.[0]?.id) };
}

function safeEvidenceHashes(history = []) {
  return history
    .map((item) => asString(item.source_ref_hash))
    .filter((item) => /^[a-f0-9]{64}$/i.test(item))
    .slice(-50)
    .join("\n");
}

export async function runKenjiFolderHistoryAssessment({
  env = {},
  event = {},
  catalog = null,
  history = null,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  if (!isEnabled(env[KENJI_FOLDER_ASSESSMENT_ENABLED_ENV])) {
    return { enabled: false, eligible: false, persisted: false, reason: "feature_flag_off" };
  }

  const customerLineId = lineUserId(event);
  if (!customerLineId) {
    return { enabled: true, eligible: false, persisted: false, reason: "customer_identity_missing" };
  }

  const customerHash = await sha256Hex(customerLineId);
  const canaryHashes = parseCanaryHashes(env[KENJI_FOLDER_ASSESSMENT_CANARY_ENV]);
  if (!canaryHashes.has(customerHash)) {
    return { enabled: true, eligible: false, persisted: false, reason: "not_in_canary" };
  }

  const text = eventText(event);
  const resolvedCatalog = Array.isArray(catalog) ? catalog : await fetchModelFolderCatalog({ env, fetchImpl });
  const mention = findFolderMentionInText(text, resolvedCatalog);
  if (mention.status === "not_found" || mention.status === "missing") {
    return { enabled: true, eligible: true, persisted: false, reason: "folder_mention_not_found" };
  }

  const resolvedHistory = Array.isArray(history)
    ? history
    : await fetchSameCustomerLineHistory({ env, lineUserId: customerLineId, fetchImpl });

  const folderResolution = resolveFolderMention(mention.normalized, mention.matches || []);
  const input = buildAssessmentInput({
    folderMention: mention.normalized,
    folderResolution,
    history: resolvedHistory,
    customerContext: { history_window: "same_customer_same_channel_50" },
  });
  const assessment = evaluateCustomerHistory(input);
  const conversationHash = await sha256Hex(`${customerLineId}:line`);
  const sourceHash = await sha256Hex(eventId(event) || `${customerLineId}:${now.toISOString()}`);
  const assessmentId = `kha_${await sha256Hex(`${customerLineId}:${eventId(event)}:${now.toISOString()}`).then((value) => value.slice(0, 48))}`;
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const record = {
    assessment_id: assessmentId,
    request_id: sourceHash,
    customer_id_hash: customerHash,
    conversation_id_hash: conversationHash,
    channel: "LINE",
    model_key: bounded(assessment.model_key, 120),
    folder_status: assessment.folder_status,
    history_window: "same_customer_same_channel_50",
    history_message_count: Number(assessment.history_message_count) || 0,
    signals: Array.isArray(assessment.signals) ? assessment.signals : [],
    readiness: assessment.readiness,
    decision: assessment.decision,
    next_action: assessment.next_action,
    confidence: assessment.confidence,
    policy_version: assessment.policy_version,
    rollout_stage: KENJI_FOLDER_ASSESSMENT_ROLLOUT_STAGE,
    review_status: "pending",
    reviewed_by: "",
    created_at: now.toISOString(),
    expires_at: expiresAt,
    evidence_refs_hash: safeEvidenceHashes(resolvedHistory),
    redaction_status: "redacted",
    customer_reply_safe: assessment.customer_reply_safe ? "true" : "false",
  };
  const persisted = await persistAssessment({ env, record, fetchImpl });
  return {
    enabled: true,
    eligible: true,
    persisted: persisted.ok,
    record_id: persisted.id || "",
    reason: persisted.ok ? "assessment_persisted" : persisted.error,
    folder_status: assessment.folder_status,
    model_key: assessment.model_key,
    decision: assessment.decision,
    next_action: assessment.next_action,
    customer_reply: buildCustomerSafeReply(assessment),
  };
}
