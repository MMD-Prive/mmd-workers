#!/usr/bin/env node

/**
 * LINE Official legacy export normalizer.
 *
 * Preview-only tool:
 * - reads CSV or JSON rows exported from LINE Official / manual sheets
 * - normalizes labels, tags, and notes into review records
 * - writes JSON preview to stdout
 * - does not write Airtable
 * - does not send LINE
 * - does not create Sessions or Payments automatically
 */

const fs = require("fs");
const path = require("path");
const {
  clean,
  extractTags,
  parseCanonicalLineOfc,
  parseMemberSinceToken,
} = require("./canonical-parser.js");

function usage() {
  console.error("Usage: node scripts/line-official-legacy/normalize-line-official-export.js <export.csv|export.json>");
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
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = (rows.shift() || []).map((header) => clean(header));
  return rows
    .filter((items) => items.some((item) => clean(item)))
    .map((items, index) => {
      const out = { __row: index + 2 };
      headers.forEach((header, headerIndex) => {
        out[header || `column_${headerIndex + 1}`] = clean(items[headerIndex]);
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
  const lowerMap = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = lowerMap.get(name.toLowerCase());
    if (key) return clean(row[key]);
  }
  return "";
}

function parseLabel(label) {
  const usernameMatch = label.match(/\(([^)]+)\)/);
  const withoutHandle = label.replace(/\([^)]*\)/g, "").trim();
  const firstPart = clean(withoutHandle.split("-")[0]);
  return {
    parsed_client_name: firstPart ? (firstPart.startsWith("คุณ") ? firstPart : `คุณ${firstPart}`) : "",
    parsed_username: usernameMatch ? clean(usernameMatch[1]) : "",
  };
}

function parseMemTag(tag) {
  const parsed = parseMemberSinceToken(tag);
  return parsed.value || parsed.raw;
}

function parseMoney(value) {
  const match = clean(value).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function noteField(note, label) {
  const pattern = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, "im");
  const match = clean(note).match(pattern);
  return match ? clean(match[1]) : "";
}

function parseServiceNote(note) {
  const raw = clean(note);
  if (!/MMD Confirmation/i.test(raw)) return [];

  const timeLabel = noteField(raw, "Time");
  const timeMatch = timeLabel.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  const service = {
    source: "line_official_note",
    raw_heading: "MMD Confirmation",
    job_type: noteField(raw, "Job"),
    model_label: noteField(raw, "Model"),
    customer_name: noteField(raw, "Customer"),
    date_label: noteField(raw, "Date"),
    start_time: timeMatch ? timeMatch[1] : "",
    end_time: timeMatch ? timeMatch[2] : "",
    time_label: timeLabel,
    location_name: noteField(raw, "Location"),
    map_url: noteField(raw, "Google Maps") || noteField(raw, "Map URL"),
    amount_thb: parseMoney(noteField(raw, "Amount")),
    deposit_amount_thb: parseMoney(noteField(raw, "Deposit")),
    balance_amount_thb: parseMoney(noteField(raw, "Balance")),
    payment_ref: "",
    session_id: "",
    confidence: 0.9,
  };

  return [service];
}

function normalizeRow(row, sourceFile, index) {
  const rawLabel = pick(row, ["label", "display_label", "rename", "name", "display name", "customer"]);
  const lineId = pick(row, ["line_id", "line id", "handle", "username"]);
  const lineUserId = pick(row, ["line_user_id", "line user id", "userId", "user_id"]);
  const rawTags = pick(row, ["tags", "tag", "hashtags", "legacy_tags"]);
  const note = pick(row, ["note", "notes", "memo", "description"]);
  const tags = extractTags(rawLabel, rawTags, note);
  const labelParts = parseLabel(rawLabel);
  const canonical = parseCanonicalLineOfc({
    nickname: rawLabel,
    line_display_name: pick(row, ["line_display_name", "display_name", "display name"]),
    line_user_id: lineUserId,
    username: lineId || labelParts.parsed_username,
    tags: rawTags,
    note,
  });
  const memHints = tags
    .filter((tag) => /^#mem/i.test(tag))
    .map(parseMemTag)
    .filter(Boolean)
    .sort();
  const serviceHistory = parseServiceNote(note);
  const legacySvipHint = tags.some((tag) => /svip/i.test(tag)) || /svip/i.test(rawLabel);
  const legacyVipHint = legacySvipHint || tags.some((tag) => /(^#vip$|-vip-)/i.test(tag)) || /\bvip\b/i.test(rawLabel);
  const possiblePackageHint = legacySvipHint || legacyVipHint
    ? "black_card_review"
    : tags.some((tag) => /^lite$/i.test(tag))
      ? "standard"
      : "";

  return {
    source: "line_official_legacy",
    source_file: path.basename(sourceFile),
    source_row: row.__row || index + 1,
    raw_display_label: rawLabel,
    parsed_client_name: labelParts.parsed_client_name,
    parsed_username: labelParts.parsed_username,
    line_id: lineId || labelParts.parsed_username,
    line_user_id: lineUserId,
    legacy_tags: tags,
    membership_start_hint: memHints[0] || "",
    membership_latest_hint: memHints[memHints.length - 1] || "",
    legacy_vip_hint: legacyVipHint,
    legacy_svip_hint: legacySvipHint,
    is_client_hint: tags.some((tag) => /^#client$/i.test(tag)),
    is_purchased_hint: tags.some((tag) => /^#purchased$/i.test(tag)),
    risk_discretion_hint: tags.some((tag) => /^#burn$/i.test(tag)),
    opportunity_hint: tags.some((tag) => /^#potential$/i.test(tag)),
    possible_package_hint: possiblePackageHint,
    service_history: serviceHistory,
    spend_total_verified: 0,
    spend_total_unverified: serviceHistory.reduce((sum, item) => sum + Number(item.amount_thb || 0), 0),
    points_estimated: 0,
    points_verified: 0,
    import_confidence: serviceHistory.length ? 0.78 : tags.length ? 0.4 : 0.2,
    canonical_membership: canonical,
    membership_status: canonical.membership_status,
    membership_tier: canonical.membership_tier,
    membership_package: canonical.membership_package,
    member_since: canonical.member_since,
    member_since_raw: canonical.member_since_raw,
    has_purchased: canonical.has_purchased,
    parse_confidence: canonical.parse_confidence,
    parse_warnings: canonical.parse_warnings,
    normalized_name: canonical.normalized_name,
    username_candidate: canonical.username_candidate,
    mmd_client_name_candidate: canonical.mmd_client_name_candidate,
    recommended_actions: [
      "create_internal_legacy_note",
      lineUserId ? "upsert_client_review" : "needs_line_user_id",
      serviceHistory.length ? "stage_service_history_review" : "preserve_identity_context",
      "do_not_send_sigil_dashboard_card_yet",
    ],
    unknown_tags: tags.filter((tag) => {
      return !/^#(client|purchased|vip|svip|burn|potential)$/i.test(tag)
        && !/^#mem/i.test(tag)
        && !/^-s?vip-$/i.test(tag)
        && !/^lite$/i.test(tag);
    }),
    warnings: [
      !lineUserId ? "line_user_id_missing" : "",
      "session_id_missing",
      "payment_ref_missing",
      serviceHistory.length ? "payment_not_verified" : "",
    ].filter(Boolean),
  };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    usage();
    process.exitCode = 1;
    return;
  }

  const rows = readRows(filePath);
  const normalized = rows.map((row, index) => normalizeRow(row, filePath, index));
  process.stdout.write(`${JSON.stringify({ ok: true, count: normalized.length, records: normalized }, null, 2)}\n`);
}

if (require.main === module) main();

// TODO: Future Airtable write phase should use explicit dry-run/apply modes,
// idempotency keys, table-specific schema validation, and Per approval gates.

module.exports = {
  normalizeRow,
  parseCsv,
  readRows,
};
