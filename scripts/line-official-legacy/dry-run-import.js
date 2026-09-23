#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  clean,
  parseCanonicalLineOfc,
} = require("./canonical-parser.js");
const { parseHistoricalNote } = require("./historical-note-parser.js");

const AIRTABLE_API = "https://api.airtable.com/v0";
const BASE_ID = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const CLIENTS_TABLE = process.env.AIRTABLE_CLIENTS_TABLE_ID || "tblVv58TCbwh5j1fS";
const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";
const CONSOLE_INBOX_TABLE = process.env.AIRTABLE_CONSOLE_INBOX_TABLE_ID || "tblFHmfpB2TTrzO2e";
const CONSOLE_INBOX_SOURCE_TITLE = "airtable_console_inbox";

const BLOCKED_FIELDS = [
  "membership_status",
  "membership_tier",
  "membership_package",
  "client_level",
  "member_since",
  "has_purchased",
  "Status",
  "Membership Status",
  "Membership Tier",
  "Membership Package",
];

function usage() {
  console.error("Usage: npm run line-ofc:dry-run -- --file <export.csv|export.json>");
  console.error("   or: npm run line-ofc:dry-run -- --source console-inbox");
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") out.file = argv[index + 1];
    if (arg === "--batch-id") out.batchId = argv[index + 1];
    if (arg === "--source") out.source = argv[index + 1];
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = (rows.shift() || []).map(clean);
  return rows
    .filter((items) => items.some((item) => clean(item)))
    .map((items, index) => {
      const out = { __row: index + 2 };
      headers.forEach((header, headerIndex) => {
        out[header || `column_${headerIndex + 1}`] = String(items[headerIndex] == null ? "" : items[headerIndex]);
      });
      return out;
    });
}

function readRows(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (/\.json$/i.test(filePath)) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.rows)) return parsed.rows;
    throw new Error("JSON export must be an array or { rows: [] }");
  }
  return parseCsv(text);
}

function pick(row, names) {
  const lowerMap = new Map(Object.keys(row || {}).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = lowerMap.get(name.toLowerCase());
    if (key) return clean(row[key]);
  }
  return "";
}

function pickRaw(row, names) {
  const lowerMap = new Map(Object.keys(row || {}).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = lowerMap.get(name.toLowerCase());
    if (key) return String(row[key] == null ? "" : row[key]);
  }
  return "";
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function normalizePhone(value) {
  const raw = clean(value);
  if (!raw) return "";
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = `+${digits.slice(1).replace(/\D/g, "")}`;
  else digits = digits.replace(/\D/g, "");
  const numeric = digits.startsWith("+") ? digits.slice(1) : digits;
  if (/^0\d{8,9}$/.test(numeric)) return `+66${numeric.slice(1)}`;
  if (/^66\d{8,9}$/.test(numeric)) return `+${numeric}`;
  if (/^\d{8,15}$/.test(numeric)) return `+${numeric}`;
  return "";
}

function redactValue(value) {
  const raw = clean(value);
  if (!raw) return "";
  return "[redacted]";
}

function redactSourceRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes("email") || lowerKey.includes("phone")) out[key] = redactValue(value);
    else if (lowerKey === "payload_json") out[key] = value ? "[redacted_payload_json]" : "";
    else out[key] = value;
  }
  return out;
}

function redactDebugFieldValue(key, value) {
  const lowerKey = key.toLowerCase();
  if (value === undefined) return undefined;
  if (value === null || value === "") return value;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.length ? `[redacted_array:${value.length}]` : [];
  if (lowerKey.endsWith("_json") || lowerKey.includes("raw") || lowerKey.includes("note")) {
    return "[redacted]";
  }
  if (
    lowerKey.includes("email") ||
    lowerKey.includes("phone") ||
    lowerKey.includes("name") ||
    lowerKey.includes("user") ||
    lowerKey.includes("client") ||
    lowerKey.includes("customer")
  ) {
    return "[redacted]";
  }
  return clean(value).slice(0, 120);
}

function redactDebugFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    out[key] = redactDebugFieldValue(key, value);
  }
  return out;
}

function extractAirtableErrorInfo(detail) {
  const airtableError = detail?.error;
  const type = typeof airtableError === "object" ? airtableError.type : "";
  const message = typeof airtableError === "object" ? airtableError.message : clean(airtableError);
  const text = JSON.stringify(detail || {});
  const fieldName =
    text.match(/Unknown field name:\s*\\"?([^"\\]+)\\"?/)?.[1] ||
    text.match(/Field\s+\\"([^"\\]+)\\"/)?.[1] ||
    text.match(/field\s+\\"([^"\\]+)\\"/i)?.[1] ||
    "";
  return { type, message, field_name: fieldName };
}

function buildDebugError(error) {
  return {
    error: error instanceof Error ? error.message : String(error),
    airtable: extractAirtableErrorInfo(error?.detail),
    detail: error?.detail || null,
    staging_rows_written_before_failure: error?.stagingRowsWrittenBeforeFailure,
    failing_import_id: error?.failingImportId,
    failing_payload_fields_redacted: redactDebugFields(error?.failingFields || {}),
  };
}

function safeImportToken(value) {
  return clean(value).replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function deriveLegacyTagsLabel(legacyTags) {
  return clean(legacyTags)
    .replace(/#[a-z0-9_ก-๙]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function encodeFormulaValue(value) {
  return clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

class AirtableClient {
  constructor({ apiKey = process.env.AIRTABLE_API_KEY, baseId = BASE_ID } = {}) {
    this.apiKey = clean(apiKey);
    this.baseId = clean(baseId);
  }

  async request(table, init = {}) {
    if (!this.apiKey || !this.baseId) throw new Error("airtable_not_configured");
    const recordPath = init.recordId ? `/${encodeURIComponent(init.recordId)}` : "";
    const url = new URL(`${AIRTABLE_API}/${this.baseId}/${encodeURIComponent(table)}${recordPath}`);
    for (const [key, value] of Object.entries(init.query || {})) url.searchParams.set(key, value);
    const timeoutMs = Number(process.env.AIRTABLE_REQUEST_TIMEOUT_MS || 30000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url.toString(), {
        method: init.method || "GET",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error(`airtable_request_timeout:${timeoutMs}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`airtable_request_failed:${response.status}`);
      error.detail = data;
      throw error;
    }
    return data;
  }

  async requestWithFieldFallback(table, init) {
    const body = { ...(init.body || {}) };
    const fields = { ...(body.fields || {}) };
    while (true) {
      try {
        return await this.request(table, { ...init, body: { ...body, fields } });
      } catch (error) {
        const detail = JSON.stringify(error.detail || {});
        const unknown = detail.match(/Unknown field name:\s*\\"?([^"\\]+)\\"?/)?.[1];
        if (unknown && Object.prototype.hasOwnProperty.call(fields, unknown)) {
          delete fields[unknown];
          if (Object.keys(fields).length) continue;
        }
        if (error.detail?.error?.type === "INVALID_MULTIPLE_CHOICE_OPTIONS") {
          const message = clean(error.detail?.error?.message);
          let removed = false;
          for (const [fieldName, value] of Object.entries(fields)) {
            if (typeof value === "string" && value && message.includes(value)) {
              delete fields[fieldName];
              removed = true;
            }
          }
          if (removed && Object.keys(fields).length) continue;
        }
        throw error;
      }
    }
  }

  async requestBatchWithFieldFallback(table, init) {
    const body = { ...(init.body || {}) };
    const records = (body.records || []).map((record) => ({
      ...(record.id ? { id: record.id } : {}),
      fields: { ...(record.fields || {}) },
    }));
    while (true) {
      try {
        return await this.request(table, { ...init, body: { ...body, records } });
      } catch (error) {
        const detail = JSON.stringify(error.detail || {});
        const unknown = detail.match(/Unknown field name:\s*\\"?([^"\\]+)\\"?/)?.[1];
        if (unknown) {
          let removed = false;
          for (const record of records) {
            if (Object.prototype.hasOwnProperty.call(record.fields, unknown)) {
              delete record.fields[unknown];
              removed = true;
            }
          }
          if (removed && records.some((record) => Object.keys(record.fields).length)) continue;
        }
        if (error.detail?.error?.type === "INVALID_MULTIPLE_CHOICE_OPTIONS") {
          const message = clean(error.detail?.error?.message);
          let removed = false;
          for (const record of records) {
            for (const [fieldName, value] of Object.entries(record.fields)) {
              if (typeof value === "string" && value && message.includes(value)) {
                delete record.fields[fieldName];
                removed = true;
              }
            }
          }
          if (removed && records.some((record) => Object.keys(record.fields).length)) continue;
        }
        throw error;
      }
    }
  }

  async list(table, query = {}) {
    const records = [];
    let offset = "";
    do {
      const data = await this.request(table, {
        query: {
          pageSize: "100",
          ...query,
          ...(offset ? { offset } : {}),
        },
      });
      records.push(...(data.records || []));
      offset = data.offset || "";
    } while (offset);
    return records;
  }

  async findOne(table, formula) {
    const data = await this.request(table, { query: { maxRecords: "1", filterByFormula: formula } });
    return data.records?.[0] || null;
  }
}

async function matchClients(airtable, parsed, rawRow, { allowUsernameExact = true, cache = {} } = {}) {
  const candidates = [];
  const add = (records, reason) => {
    for (const record of records) {
      if (!candidates.some((item) => item.record.id === record.id && item.reason === reason)) {
        candidates.push({ reason, record });
      }
    }
  };

  const lineUserId = clean(parsed.line_user_id || pick(rawRow, ["line_user_id", "line user id", "userId", "user_id"]));
  if (lineUserId) {
    add(cache.clientsAll ? cache.clientsAll.filter((record) => clean(record.fields?.line_user_id) === lineUserId) : await airtable.list(CLIENTS_TABLE, {
      filterByFormula: `{line_user_id}="${encodeFormulaValue(lineUserId)}"`,
    }), "line_user_id");
  }

  const phone = normalizePhone(pick(rawRow, ["phone", "Phone Number", "phone_number", "tel", "member_phone"]));
  if (phone) {
    if (!cache.clientsForPhoneMatch) cache.clientsForPhoneMatch = cache.clientsAll || await airtable.list(CLIENTS_TABLE);
    const all = cache.clientsForPhoneMatch;
    add(all.filter((record) => normalizePhone(record.fields?.["Phone Number"] || record.fields?.phone) === phone), "phone");
  }

  const email = normalizeEmail(pick(rawRow, ["email", "Contact Email", "primary_email", "member_email"]));
  if (email) {
    add(cache.clientsAll ? cache.clientsAll.filter((record) => {
      return normalizeEmail(record.fields?.["Contact Email"] || record.fields?.email) === email;
    }) : await airtable.list(CLIENTS_TABLE, {
      filterByFormula: `OR(LOWER({Contact Email})="${encodeFormulaValue(email)}",LOWER({email})="${encodeFormulaValue(email)}")`,
    }).catch(() => []), "email");
  }

  const username = clean(parsed.username_candidate);
  if (allowUsernameExact && username) {
    add(cache.clientsAll ? cache.clientsAll.filter((record) => {
      return normalizeEmail(record.fields?.line_id || record.fields?.username) === username.toLowerCase();
    }) : await airtable.list(CLIENTS_TABLE, {
      filterByFormula: `OR(LOWER({line_id}&"")="${encodeFormulaValue(username.toLowerCase())}",LOWER({username}&"")="${encodeFormulaValue(username.toLowerCase())}")`,
    }).catch(() => []), "username");
  }

  if (!candidates.length && parsed.normalized_name) {
    const name = encodeFormulaValue(parsed.normalized_name.toLowerCase());
    add(cache.clientsAll ? cache.clientsAll.filter((record) => {
      const fields = record.fields || {};
      return [
        fields["Client Name"],
        fields.nickname,
        fields.line_display_name,
      ].some((value) => normalizeEmail(value).includes(name));
    }) : await airtable.list(CLIENTS_TABLE, {
      maxRecords: "10",
      filterByFormula: `OR(FIND("${name}",LOWER({Client Name}&""))>0,FIND("${name}",LOWER({nickname}&""))>0,FIND("${name}",LOWER({line_display_name}&""))>0)`,
    }).catch(() => []), "fuzzy_name");
  }

  const strong = candidates.filter((item) => ["line_user_id", "phone", "email", "username"].includes(item.reason));
  const uniqueStrongIds = Array.from(new Set(strong.map((item) => item.record.id)));
  const uniqueCandidateIds = Array.from(new Set(candidates.map((item) => item.record.id)));
  if (uniqueCandidateIds.length > 1) {
    return { matchedClient: "", matchType: "multiple_candidates", matchConfidence: 0.5, reviewStatus: "review_required", candidates };
  }
  if (uniqueStrongIds.length === 1) {
    const selected = strong.find((item) => item.record.id === uniqueStrongIds[0]);
    return {
      matchedClient: uniqueStrongIds[0],
      matchType: `exact_${selected.reason}`,
      matchConfidence: selected.reason === "line_user_id" ? 0.99 : 0.94,
      reviewStatus: "ready_to_review",
      candidates,
    };
  }
  if (uniqueStrongIds.length > 1) {
    return { matchedClient: "", matchType: "multiple_candidates", matchConfidence: 0.5, reviewStatus: "review_required", candidates };
  }
  if (candidates.length) {
    return { matchedClient: "", matchType: "fuzzy_name", matchConfidence: 0.35, reviewStatus: "review_required", candidates };
  }
  return { matchedClient: "", matchType: "no_match", matchConfidence: 0, reviewStatus: "staging_only", candidates };
}

function buildStagingFields({ row, rowIndex, sourceFile, batchId, parsed, match }) {
  const sourceTitle = row.__source_file_title || path.basename(sourceFile || CONSOLE_INBOX_SOURCE_TITLE);
  const importId = row.__import_id || `line_ofc_${batchId}_${row.__row || rowIndex + 1}`;
  const rawNote = pickRaw(row, ["raw_note", "note", "notes", "memo", "description", "admin_note"]);
  const noteParse = parseHistoricalNote(rawNote);
  const proposedClientUpdates = {
    line_user_id: parsed.line_user_id,
    line_display_name: parsed.line_display_name,
    line_renamed_name: parsed.line_renamed_name,
  };
  const fields = {
    import_id: importId,
    import_batch_id: batchId,
    source_file_title: sourceTitle,
    line_user_id: parsed.line_user_id,
    line_display_name: parsed.line_display_name,
    line_renamed_name: parsed.line_renamed_name,
    line_tags_raw: parsed.line_tags_raw || parsed.detected_tags.join(", "),
    phone_candidate: normalizePhone(pick(row, ["phone", "Phone Number", "phone_number", "tel", "member_phone"])),
    email_candidate: normalizeEmail(pick(row, ["email", "Contact Email", "primary_email", "member_email"])),
    normalized_name: parsed.normalized_name,
    parsed_client_level: parsed.client_level,
    parsed_membership_status: parsed.membership_status,
    parsed_membership_tier: parsed.membership_tier,
    parsed_membership_package: parsed.membership_package,
    parsed_member_since: parsed.member_since,
    parsed_member_since_raw: parsed.member_since_raw,
    parsed_has_purchased: parsed.has_purchased,
    parse_confidence: parsed.parse_confidence,
    membership_parse_json: JSON.stringify(parsed, null, 2),
    matched_client: match.matchedClient ? [match.matchedClient] : undefined,
    match_type: match.matchType,
    match_confidence: match.matchConfidence,
    review_status: match.reviewStatus,
    proposed_client_updates_json: JSON.stringify(proposedClientUpdates, null, 2),
    proposed_entitlement_json: JSON.stringify({
      source: "line_ofc",
      client_level: parsed.client_level,
      client_level_raw: parsed.client_level_raw,
      client_level_tokens: parsed.client_level_tokens,
      membership_status: parsed.membership_status,
      membership_tier: parsed.membership_tier,
      membership_package: parsed.membership_package,
      member_since: parsed.member_since,
      member_since_raw: parsed.member_since_raw,
      has_purchased: parsed.has_purchased,
      review_required: match.reviewStatus !== "ready_to_review" || parsed.membership_status === "review_required" || parsed.client_level === "review_required",
    }, null, 2),
    blocked_fields_json: JSON.stringify(BLOCKED_FIELDS, null, 2),
    raw_note: noteParse.raw_note,
    note_detected_amounts: JSON.stringify(noteParse.note_detected_amounts, null, 2),
    note_detected_dates: JSON.stringify(noteParse.note_detected_dates, null, 2),
    note_detected_package: noteParse.note_detected_package,
    note_detected_membership_action: noteParse.note_detected_membership_action,
    note_detected_service_count: noteParse.note_detected_service_count,
    note_detected_payment_refs: JSON.stringify(noteParse.note_detected_payment_refs, null, 2),
    service_amount: noteParse.service_amount,
    tip_amount_mmd: noteParse.tip_amount_mmd,
    tip_amount_direct: noteParse.tip_amount_direct,
    membership_fee_amount: noteParse.membership_fee_amount,
    renewal_fee_amount: noteParse.renewal_fee_amount,
    referral_bonus_candidate: String(noteParse.referral_bonus_candidate),
    promotion_bonus_candidate: String(noteParse.promotion_bonus_candidate),
    unknown_amount: noteParse.unknown_amount,
    points_eligible_amount: noteParse.points_eligible_amount,
    points_ineligible_amount: noteParse.points_ineligible_amount,
    customer_detail_json: JSON.stringify(noteParse.customer_detail_json, null, 2),
    model_review_incentive_signal: noteParse.model_review_incentive_signal,
    historical_events_json: JSON.stringify(noteParse.historical_events_json, null, 2),
    proposed_points: noteParse.proposed_points,
    points_policy_basis: noteParse.points_policy_basis,
    points_confidence: noteParse.points_confidence,
    points_review_required: String(noteParse.points_review_required),
    points_parse_warnings: JSON.stringify(noteParse.points_parse_warnings, null, 2),
    dry_run_only: true,
    raw_row_json: JSON.stringify(row.__raw_row_redacted || redactSourceRow(row), null, 2),
    created_at: new Date().toISOString(),
  };
  if (!fields.parsed_member_since) delete fields.parsed_member_since;
  for (const fieldName of ["parsed_membership_status", "parsed_membership_tier", "parsed_membership_package"]) {
    if (!fields[fieldName] || fields[fieldName] === "none") delete fields[fieldName];
  }
  return fields;
}

async function writeStaging(airtable, fields) {
  const existing = await airtable.findOne(STAGING_TABLE, `{import_id}="${encodeFormulaValue(fields.import_id)}"`);
  if (existing?.id) {
    return airtable.requestWithFieldFallback(STAGING_TABLE, {
      method: "PATCH",
      recordId: existing.id,
      body: { fields },
    });
  }
  return airtable.requestWithFieldFallback(STAGING_TABLE, {
    method: "POST",
    body: { fields },
  });
}

function chunks(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function duplicateImportIds(fieldsList) {
  const seen = new Set();
  const duplicates = new Set();
  for (const fields of fieldsList) {
    const importId = clean(fields.import_id);
    if (!importId) continue;
    if (seen.has(importId)) duplicates.add(importId);
    seen.add(importId);
  }
  return Array.from(duplicates).sort();
}

async function writeStagingRows(airtable, fieldsList, batchId) {
  const duplicates = duplicateImportIds(fieldsList);
  if (duplicates.length) {
    const error = new Error(`duplicate_import_id:${duplicates.join(",")}`);
    error.duplicates = duplicates;
    throw error;
  }

  if (typeof airtable.requestBatchWithFieldFallback !== "function") {
    const written = [];
    for (const fields of fieldsList) written.push(await writeStaging(airtable, fields));
    return written;
  }

  const existing = await airtable.list(STAGING_TABLE, {
    filterByFormula: `{import_batch_id}="${encodeFormulaValue(batchId)}"`,
  });
  const existingByImportId = new Map(existing.map((record) => [clean(record.fields?.import_id), record.id]));
  const written = Array(fieldsList.length);
  const creates = [];
  const updates = [];
  fieldsList.forEach((fields, index) => {
    const id = existingByImportId.get(fields.import_id);
    if (id) updates.push({ index, id, fields });
    else creates.push({ index, fields });
  });

  for (const group of chunks(creates, 10)) {
    const data = await airtable.requestBatchWithFieldFallback(STAGING_TABLE, {
      method: "POST",
      body: { records: group.map((item) => ({ fields: item.fields })) },
    });
    (data.records || []).forEach((record, index) => {
      written[group[index].index] = record;
    });
  }

  for (const group of chunks(updates, 10)) {
    const data = await airtable.requestBatchWithFieldFallback(STAGING_TABLE, {
      method: "PATCH",
      body: { records: group.map((item) => ({ id: item.id, fields: item.fields })) },
    });
    (data.records || []).forEach((record, index) => {
      written[group[index].index] = record;
    });
  }

  return written;
}

function normalizeConsoleInboxRecord(record, index) {
  const fields = record?.fields ? record.fields : record;
  const inboxId = pick(fields, ["inbox_id"]) || record?.id || `${index + 1}`;
  const legacyTags = pick(fields, ["legacy_tags"]);
  const memberName = pick(fields, ["member_name"]);
  const explicitRenamedName = pick(fields, ["line_renamed_name"]);
  const legacyLabel = deriveLegacyTagsLabel(legacyTags);
  const lineRenamedName = explicitRenamedName || memberName || legacyLabel;
  const row = {
    __row: index + 1,
    __record_id: record?.id || "",
    __source: "console-inbox",
    __source_file_title: CONSOLE_INBOX_SOURCE_TITLE,
    __import_id: `line_ofc_console_${safeImportToken(inboxId)}`,
    __line_renamed_name_source: explicitRenamedName ? "line_renamed_name" : memberName ? "member_name" : legacyLabel ? "legacy_tags" : "missing",
    inbox_id: inboxId,
    member_name: memberName,
    member_email: pick(fields, ["member_email"]),
    member_phone: pick(fields, ["member_phone"]),
    line_user_id: pick(fields, ["line_user_id"]),
    line_id: pick(fields, ["line_id"]),
    legacy_tags: legacyTags,
    admin_note: pick(fields, ["admin_note"]),
    payload_json: pick(fields, ["payload_json"]),
    canonical_client: pick(fields, ["Canonical Client", "canonical_client"]),
    line_display_name: memberName,
    line_renamed_name: lineRenamedName,
    line_tags_raw: legacyTags,
    username: pick(fields, ["line_id"]),
    email: pick(fields, ["member_email"]),
    phone: pick(fields, ["member_phone"]),
  };
  row.__raw_row_redacted = redactSourceRow({
    inbox_id: row.inbox_id,
    record_id: row.__record_id,
    member_name: row.member_name,
    member_email: row.member_email,
    member_phone: row.member_phone,
    line_user_id: row.line_user_id,
    line_id: row.line_id,
    legacy_tags: row.legacy_tags,
    admin_note: row.admin_note,
    payload_json: row.payload_json,
    canonical_client: row.canonical_client,
    line_renamed_name_source: row.__line_renamed_name_source,
  });
  return row;
}

async function readConsoleInboxRows(airtable) {
  const records = await airtable.list(CONSOLE_INBOX_TABLE);
  return records.map(normalizeConsoleInboxRecord);
}

function applyConsoleInboxParseGuard(parsed, row) {
  if (row.__source !== "console-inbox" || row.__line_renamed_name_source === "line_renamed_name") return parsed;
  const warnings = [...(parsed.parse_warnings || []), `line_renamed_name_fallback:${row.__line_renamed_name_source}`];
  const confidenceCap = row.__line_renamed_name_source === "member_name" ? 0.72 : 0.45;
  return {
    ...parsed,
    parse_confidence: Math.min(parsed.parse_confidence, confidenceCap),
    parse_warnings: Array.from(new Set(warnings)),
  };
}

async function loadRows({ source, file, airtable }) {
  if (source === "console-inbox") return readConsoleInboxRows(airtable);
  if (!file) throw new Error("missing_file");
  return readRows(file);
}

async function runDryRunImport({
  file,
  source = "file",
  batchId = `line_ofc_${source === "console-inbox" ? "console_" : ""}${Date.now().toString(36)}`,
  airtable = new AirtableClient(),
}) {
  if (!["file", "console-inbox"].includes(source)) throw new Error(`unsupported_source:${source}`);
  const rows = await loadRows({ source, file, airtable });
  const matchCache = {};
  if (source === "console-inbox") {
    matchCache.clientsAll = await airtable.list(CLIENTS_TABLE);
    matchCache.clientsForPhoneMatch = matchCache.clientsAll;
  }
  const pending = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (process.env.LINE_OFC_PROGRESS === "1") {
      console.error(JSON.stringify({
        progress: "line_ofc_console_dry_run",
        row: index + 1,
        total: rows.length,
        import_id: row.__import_id || `line_ofc_${batchId}_${row.__row || index + 1}`,
      }));
    }
    const parsed = applyConsoleInboxParseGuard(parseCanonicalLineOfc({
      nickname: pick(row, ["nickname", "label", "display_label", "rename", "name", "display name", "customer"]),
      line_renamed_name: pick(row, ["line_renamed_name", "rename", "label", "display_label", "nickname"]),
      line_display_name: pick(row, ["line_display_name", "display_name", "display name"]),
      line_user_id: pick(row, ["line_user_id", "line user id", "userId", "user_id"]),
      username: pick(row, ["username", "line_id", "line id", "handle"]),
      email: pick(row, ["email", "Contact Email", "primary_email", "member_email"]),
      phone: pick(row, ["phone", "Phone Number", "phone_number", "tel", "member_phone"]),
      tags: pick(row, ["line_tags_raw", "tags", "tag", "hashtags", "legacy_tags"]),
      note: pick(row, ["note", "notes", "memo", "description"]),
      raw_note: pick(row, ["raw_note", "note", "notes", "memo", "description", "admin_note"]),
    }), row);
    const match = await matchClients(airtable, parsed, row, {
      allowUsernameExact: source !== "console-inbox",
      cache: matchCache,
    });
    const fields = buildStagingFields({ row, rowIndex: index, sourceFile: file, batchId, parsed, match });
    pending.push({
      fields,
      match,
      parsed,
    });
  }

  let stagingRows;
  try {
    stagingRows = await writeStagingRows(airtable, pending.map((item) => item.fields), batchId);
  } catch (error) {
    error.stagingRowsWrittenBeforeFailure = 0;
    error.failingImportId = pending[0]?.fields?.import_id || "";
    error.failingFields = pending[0]?.fields || {};
    throw error;
  }

  const results = pending.map((item, index) => {
    const staging = stagingRows[index] || {};
    return {
      import_id: item.fields.import_id,
      staging_record_id: staging.id,
      match_type: item.match.matchType,
      review_status: item.match.reviewStatus,
      parsed_membership_status: item.parsed.membership_status,
      parsed_client_level: item.parsed.client_level,
      parsed_membership_tier: item.parsed.membership_tier,
      parsed_membership_package: item.parsed.membership_package,
    };
  });
  return { ok: true, mode: "line_ofc_dry_run_import", source, batch_id: batchId, count: rows.length, results };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file && args.source !== "console-inbox") {
    usage();
    process.exitCode = 1;
    return;
  }
  const result = await runDryRunImport({ file: args.file, source: args.source || "file", batchId: args.batchId });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    if (process.env.LINE_OFC_DEBUG_AIRTABLE_ERROR === "1") {
      console.error(JSON.stringify(buildDebugError(error), null, 2));
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  });
}

module.exports = {
  AirtableClient,
  BLOCKED_FIELDS,
  CONSOLE_INBOX_TABLE,
  buildStagingFields,
  buildDebugError,
  duplicateImportIds,
  matchClients,
  normalizeConsoleInboxRecord,
  normalizeEmail,
  normalizePhone,
  parseArgs,
  readRows,
  runDryRunImport,
};
