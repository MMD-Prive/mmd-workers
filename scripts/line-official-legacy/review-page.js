#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { AirtableClient } = require("./dry-run-import.js");

const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";
const OUT_DIR = path.join(process.cwd(), "webflow/internal/line-ofc-review");
const DATA_FILE = "review-data.redacted.json";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--batch-id") out.batchId = argv[index + 1];
  }
  return out;
}

function selectName(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return clean(value.name || value.value || value.id);
  return clean(value);
}

function safeJson(value, fallback = {}) {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function scrubText(value) {
  return clean(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, (match) => {
      const digits = match.replace(/\D/g, "");
      return match.trim().startsWith("+") || digits.length >= 9 ? "[redacted-phone]" : match;
    });
}

function redactObject(value, key = "") {
  const lowerKey = key.toLowerCase();
  if (value == null) return value;
  if (lowerKey.includes("email")) return clean(value) ? "[redacted-email]" : "";
  if (lowerKey.includes("phone") || lowerKey.includes("tel")) return clean(value) ? "[redacted-phone]" : "";
  if (lowerKey.includes("line_user_id") || lowerKey === "line_id" || lowerKey.includes("payload")) return clean(value) ? "[redacted]" : "";
  if (Array.isArray(value)) return value.map((item) => redactObject(item, key));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactObject(childValue, childKey)]));
  }
  return scrubText(value);
}

function fieldsOf(record) {
  return record.fields || record.cellValuesByFieldId || record;
}

function field(fields, name, fallback = "") {
  return fields[name] == null ? fallback : fields[name];
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (!clean(value)) return [];
  return clean(value).split(/[, ]+/).map(clean).filter(Boolean);
}

function numberValue(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeReviewRecord(record) {
  const fields = fieldsOf(record);
  const membership = safeJson(field(fields, "membership_parse_json"), {});
  const proposed = safeJson(field(fields, "proposed_entitlement_json"), {});
  const raw = redactObject(safeJson(field(fields, "raw_row_json"), {}));
  const parsedStatus = selectName(field(fields, "parsed_membership_status")) || clean(membership.membership_status) || "none";
  const parsedClientLevel = selectName(field(fields, "parsed_client_level")) || clean(membership.client_level) || "unknown";
  const parsedTier = selectName(field(fields, "parsed_membership_tier")) || clean(membership.membership_tier) || "none";
  const parsedPackage = selectName(field(fields, "parsed_membership_package")) || clean(membership.membership_package) || "none";
  const matchConfidence = numberValue(field(fields, "match_confidence"));
  let matchType = selectName(field(fields, "match_type"));
  if (!matchType) {
    if (matchConfidence === 0) matchType = "no_match";
    else if (matchConfidence === 0.5) matchType = "multiple_candidates";
    else if (matchConfidence === 0.35) matchType = "fuzzy_name";
    else if (matchConfidence >= 0.94) matchType = "exact_match";
    else matchType = "unknown";
  }
  let reviewStatus = selectName(field(fields, "review_status"));
  if (!reviewStatus) {
    if (matchType === "no_match") reviewStatus = "staging_only";
    else if (matchType === "multiple_candidates" || matchType === "fuzzy_name" || parsedStatus === "review_required") reviewStatus = "review_required";
    else if (/^exact_/.test(matchType)) reviewStatus = "ready_to_review";
    else reviewStatus = "unknown";
  }
  const parseWarnings = arrayFrom(membership.parse_warnings || field(fields, "points_parse_warnings"));
  const allMemberTokens = arrayFrom(membership.all_member_tokens || membership.detected_tags).filter((token) => /^#mem/i.test(token));
  const multipleMatch = matchType === "multiple_candidates";
  const noMatch = matchType === "no_match" || reviewStatus === "staging_only";
  const reviewRequired = reviewStatus === "review_required" || parsedStatus === "review_required";
  const premiumHighAccess = ["premium", "vip", "blackcard", "svip"].includes(parsedClientLevel)
    || ["premium", "vip", "svip", "blackcard"].includes(parsedTier)
    || ["premium", "vip", "svip", "blackcard"].includes(parsedPackage);
  const memberEvidence = parsedStatus === "member" || premiumHighAccess;
  const potentiallyReady = reviewStatus === "ready_to_review" && /^exact_/.test(matchType);

  let safetyState = "Not executable on this page";
  if (multipleMatch) safetyState = "Choose client manually later";
  else if (reviewRequired) safetyState = "Blocked until human review";
  else if (noMatch) safetyState = "Staging only";

  return {
    record_id: record.id || "",
    import_id: clean(field(fields, "import_id")),
    import_batch_id: clean(field(fields, "import_batch_id")),
    review_status: reviewStatus || "unknown",
    match_type: matchType || "unknown",
    match_confidence: matchConfidence,
    parse_confidence: numberValue(field(fields, "parse_confidence")),
    line_display_name: scrubText(field(fields, "line_display_name")),
    line_renamed_name: scrubText(field(fields, "line_renamed_name")),
    line_tags_raw: scrubText(field(fields, "line_tags_raw")),
    parsed_client_level: parsedClientLevel,
    client_level_raw: scrubText(membership.client_level_raw || ""),
    client_level_tokens: redactObject(membership.client_level_tokens || []),
    parsed_membership_status: parsedStatus,
    parsed_membership_tier: parsedTier,
    parsed_membership_package: parsedPackage,
    parsed_member_since: scrubText(field(fields, "parsed_member_since") || membership.member_since),
    parsed_member_since_raw: scrubText(field(fields, "parsed_member_since_raw") || membership.member_since_raw),
    has_purchased: Boolean(field(fields, "parsed_has_purchased") || membership.has_purchased),
    chosen_member_since_token: scrubText(membership.chosen_member_since_token || ""),
    all_member_tokens: allMemberTokens.map(scrubText),
    proposed_entitlement_summary: {
      source: scrubText(proposed.source || "line_ofc"),
      client_level: scrubText(proposed.client_level || parsedClientLevel),
      membership_status: scrubText(proposed.membership_status || parsedStatus),
      membership_tier: scrubText(proposed.membership_tier || parsedTier),
      membership_package: scrubText(proposed.membership_package || parsedPackage),
      member_since: scrubText(proposed.member_since || membership.member_since || ""),
      member_since_raw: scrubText(proposed.member_since_raw || membership.member_since_raw || ""),
      has_purchased: Boolean(proposed.has_purchased || membership.has_purchased),
      review_required: Boolean(proposed.review_required || reviewRequired),
    },
    parse_warnings: parseWarnings.map(scrubText),
    raw_debug_redacted: raw,
    queue_flags: {
      review_required: reviewRequired,
      multiple_match: multipleMatch && reviewStatus === "review_required",
      multiple_match_review: multipleMatch && reviewStatus === "review_required",
      unknown_tier: parsedTier === "unknown" || parsedClientLevel === "unknown" || parsedPackage === "unknown",
      member_vip_premium_evidence: memberEvidence,
      premium_vip_svip_blackcard: premiumHighAccess,
      no_match_staging: noMatch,
      no_match_staging_only: noMatch,
      ready_after_manual_review: potentiallyReady,
      unsafe_to_commit: true,
      all_staging: true,
    },
    safety_state: safetyState,
    committable: false,
    unsafe_to_commit: true,
  };
}

function countBy(records, fn) {
  return records.reduce((acc, record) => {
    const key = fn(record) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function countDuplicateImportIds(rows) {
  const counts = countBy(rows, (row) => row.import_id);
  return Object.values(counts).filter((count) => count > 1).length;
}

function buildReviewData(records, batchId) {
  const rows = records.map(normalizeReviewRecord);
  const duplicateImportIdCount = countDuplicateImportIds(rows);
  const summary = {
    batch_id: batchId,
    total_rows: rows.length,
    review_required_count: rows.filter((row) => row.queue_flags.review_required).length,
    multiple_match_count: rows.filter((row) => row.queue_flags.multiple_match).length,
    unknown_tier_count: rows.filter((row) => row.queue_flags.unknown_tier).length,
    member_vip_premium_count: rows.filter((row) => row.queue_flags.member_vip_premium_evidence).length,
    no_match_count: rows.filter((row) => row.queue_flags.no_match_staging).length,
    unsafe_to_commit_count: rows.filter((row) => row.unsafe_to_commit).length,
    committable_count: rows.filter((row) => row.committable).length,
    duplicate_import_id_count: duplicateImportIdCount,
    ready_after_manual_review_count: rows.filter((row) => row.queue_flags.ready_after_manual_review).length,
    counts: {
      review_status: countBy(rows, (row) => row.review_status),
      match_type: countBy(rows, (row) => row.match_type),
      membership_status: countBy(rows, (row) => row.parsed_membership_status),
      client_level: countBy(rows, (row) => row.parsed_client_level),
      tier: countBy(rows, (row) => row.parsed_membership_tier),
      package: countBy(rows, (row) => row.parsed_membership_package),
    },
  };
  return {
    generated_at: new Date().toISOString(),
    guardrails: [
      "Review only",
      "No Clients patch",
      "No Member Entitlements write",
      "LINE OFC is membership source of truth",
      "Gmail paused",
    ],
    summary,
    rows,
  };
}

function jsonForHtml(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function renderHtml(data) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LINE OFC Review - ${data.summary.batch_id}</title>
  <link rel="stylesheet" href="./line-ofc-review.css">
</head>
<body>
  <main class="line-ofc-review-page" data-line-ofc-review-root>
    <script id="line-ofc-review-data" type="application/json">${jsonForHtml(data)}</script>
  </main>
  <script src="./line-ofc-review.js"></script>
</body>
</html>
`;
}

function renderCss() {
  return `.line-ofc-review-page{color-scheme:dark;min-height:100vh;background:#080807;color:#f5f0e6;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}.line-ofc-review-shell{max-width:1180px;margin:0 auto;padding:28px 18px 42px}.line-ofc-review-top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;border-bottom:1px solid rgba(212,175,55,.28);padding-bottom:18px}.line-ofc-review-kicker{color:#d4af37;text-transform:uppercase;font-size:12px;font-weight:700}.line-ofc-review-title{font-size:clamp(26px,4vw,44px);line-height:1.05;margin:6px 0 8px}.line-ofc-review-subtitle{color:#b9b0a1;margin:0;max-width:760px}.line-ofc-review-summary{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;margin:20px 0}.line-ofc-review-stat{border:1px solid rgba(212,175,55,.22);background:#11100e;border-radius:8px;padding:12px}.line-ofc-review-stat strong{display:block;font-size:24px;color:#fff}.line-ofc-review-stat span{font-size:12px;color:#b9b0a1}.line-ofc-review-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.line-ofc-review-actions button{border:1px solid rgba(212,175,55,.36);background:rgba(212,175,55,.12);color:#f5d36d;border-radius:8px;padding:10px 12px;font:inherit;font-weight:800;cursor:pointer}.line-ofc-review-guardrails{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.line-ofc-review-chip{border:1px solid rgba(212,175,55,.34);color:#f5d36d;background:rgba(212,175,55,.08);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:700}.line-ofc-review-controls{display:grid;grid-template-columns:1fr repeat(4,minmax(120px,170px));gap:10px;margin:18px 0}.line-ofc-review-input,.line-ofc-review-select{background:#12110f;color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:10px 12px;font:inherit;min-width:0}.line-ofc-review-tabs{display:flex;gap:8px;overflow:auto;padding:3px 0 12px}.line-ofc-review-tab{border:1px solid rgba(255,255,255,.14);background:#13120f;color:#cfc7b8;border-radius:8px;padding:9px 11px;white-space:nowrap;cursor:pointer}.line-ofc-review-tab.is-active{border-color:#d4af37;color:#fff;background:rgba(212,175,55,.12)}.line-ofc-review-list{display:grid;gap:12px}.line-ofc-review-card{border:1px solid rgba(255,255,255,.12);background:#10100e;border-radius:8px;padding:14px}.line-ofc-review-card-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.line-ofc-review-name{font-size:18px;font-weight:800;color:#fff}.line-ofc-review-muted{color:#aaa193;font-size:13px}.line-ofc-review-badges{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.line-ofc-review-badge{font-size:12px;border-radius:999px;background:#1c1a16;color:#e7ddc7;border:1px solid rgba(255,255,255,.12);padding:5px 8px}.line-ofc-review-badge-blocked{background:rgba(142,38,38,.18);border-color:rgba(255,100,100,.3);color:#ffb5a8}.line-ofc-review-badge-ready{background:rgba(212,175,55,.12);border-color:rgba(212,175,55,.3);color:#f5d36d}.line-ofc-review-decision{display:grid;grid-template-columns:minmax(150px,190px) minmax(130px,1fr) minmax(150px,1fr) minmax(240px,2fr);gap:9px;margin:12px 0;padding:12px;border:1px solid rgba(212,175,55,.2);border-radius:8px;background:#12110f}.line-ofc-review-decision label{display:grid;gap:5px;color:#958b7b;font-size:11px;text-transform:uppercase}.line-ofc-review-decision input,.line-ofc-review-decision select,.line-ofc-review-decision textarea{width:100%;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#080807;color:#fff;padding:9px 10px;font:inherit;text-transform:none}.line-ofc-review-decision .line-ofc-review-muted{grid-column:1/-1}.line-ofc-review-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0}.line-ofc-review-field{background:#15130f;border-radius:8px;padding:9px;min-width:0}.line-ofc-review-field span{display:block;color:#958b7b;font-size:11px;text-transform:uppercase}.line-ofc-review-field b{display:block;overflow-wrap:anywhere;font-size:13px;margin-top:3px}.line-ofc-review-tags{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#dec777;overflow-wrap:anywhere}.line-ofc-review-details{margin-top:10px;border-top:1px solid rgba(255,255,255,.09);padding-top:10px}.line-ofc-review-details summary{cursor:pointer;color:#d4af37;font-weight:700}.line-ofc-review-pre{white-space:pre-wrap;overflow:auto;background:#070707;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:10px;color:#d7d0c4;font-size:12px}.line-ofc-review-empty{border:1px dashed rgba(255,255,255,.2);border-radius:8px;padding:22px;color:#b9b0a1;text-align:center}.line-ofc-review-count{color:#b9b0a1;font-size:13px;margin:6px 0 12px}@media(max-width:900px){.line-ofc-review-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.line-ofc-review-controls{grid-template-columns:1fr 1fr}.line-ofc-review-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.line-ofc-review-decision{grid-template-columns:1fr 1fr}}@media(max-width:560px){.line-ofc-review-shell{padding:20px 12px 30px}.line-ofc-review-top{display:block}.line-ofc-review-actions{justify-content:flex-start;margin-top:14px}.line-ofc-review-summary,.line-ofc-review-controls,.line-ofc-review-grid,.line-ofc-review-decision{grid-template-columns:1fr}.line-ofc-review-card-head{display:block}}`;
}

function renderJs() {
  return `(() => {
  const DECISIONS = ["", "ignore", "link_existing_client", "create_new_client", "needs_human", "do_not_import"];
  const DECISION_SOURCE = "manual_review";
  const root = document.querySelector("[data-line-ofc-review-root]");
  const dataNode = document.getElementById("line-ofc-review-data");
  if (!root || !dataNode) return;

  const data = JSON.parse(dataNode.textContent);
  const rows = data.rows.slice();
  const summary = data.summary;
  const storageKey = "line-ofc-review-decisions:" + summary.batch_id;
  let activeQueue = "review_required";
  let decisions = loadDecisions();

  function text(value) {
    return String(value == null ? "" : value);
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function percent(value) {
    return Math.round(Number(value || 0) * 100) + "%";
  }

  function option(value, label) {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = label || value;
    return el;
  }

  function unique(items, mapper) {
    return Array.from(new Set(items.map(mapper).filter(Boolean))).sort();
  }

  function badge(value, className) {
    return '<span class="line-ofc-review-badge ' + (className || "") + '">' + escapeHtml(value) + '</span>';
  }

  function stat(value, label) {
    return '<div class="line-ofc-review-stat"><strong>' + escapeHtml(value) + '</strong><span>' + escapeHtml(label) + '</span></div>';
  }

  function localDecision(importId) {
    return decisions[importId] || {
      import_id: importId,
      review_decision: "",
      reviewed_by: "",
      reviewed_at: "",
      review_note: "",
      matched_client_id: "",
      decision_source: DECISION_SOURCE,
    };
  }

  function normalizeDecision(row, patch) {
    const previous = localDecision(row.import_id);
    const next = {
      import_id: row.import_id,
      review_decision: text(patch.review_decision ?? previous.review_decision),
      reviewed_by: text(patch.reviewed_by ?? previous.reviewed_by),
      reviewed_at: text(patch.reviewed_at ?? previous.reviewed_at),
      review_note: text(patch.review_note ?? previous.review_note),
      matched_client_id: text(patch.matched_client_id ?? previous.matched_client_id),
      decision_source: DECISION_SOURCE,
    };
    if (next.review_decision && !next.reviewed_at) next.reviewed_at = new Date().toISOString();
    return next;
  }

  function saveDecision(row, patch) {
    decisions[row.import_id] = normalizeDecision(row, patch);
    localStorage.setItem(storageKey, JSON.stringify(decisions));
    renderCount();
  }

  function loadDecisions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function exportableDecisions() {
    return Object.values(decisions)
      .filter((item) => item && item.import_id && item.review_decision)
      .map((item) => ({
        import_id: item.import_id,
        decision: item.review_decision,
        reviewed_by: item.reviewed_by,
        reviewed_at: item.reviewed_at,
        review_note: item.review_note,
        matched_client_id: item.matched_client_id,
        decision_source: DECISION_SOURCE,
      }));
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function csvEscape(value) {
    const raw = text(value);
    return /[",\\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
  }

  function exportJson() {
    const payload = {
      batch_id: summary.batch_id,
      exported_at: new Date().toISOString(),
      decision_source: DECISION_SOURCE,
      writes: "local_export_only",
      decisions: exportableDecisions(),
    };
    download(summary.batch_id + "-manual-review-decisions.json", JSON.stringify(payload, null, 2) + "\\n", "application/json");
  }

  function exportCsv() {
    const headers = ["import_id", "decision", "reviewed_by", "reviewed_at", "review_note", "matched_client_id", "decision_source"];
    const lines = [headers.join(",")].concat(exportableDecisions().map((item) => headers.map((key) => csvEscape(item[key])).join(",")));
    download(summary.batch_id + "-manual-review-decisions.csv", lines.join("\\n") + "\\n", "text/csv");
  }

  function card(row) {
    const safety = row.safety_state || "Review only";
    const safetyClass = /Blocked|Choose|Staging/.test(safety) ? "line-ofc-review-badge-blocked" : "line-ofc-review-badge-ready";
    const decision = localDecision(row.import_id);
    const decisionOptions = DECISIONS.map((item) => '<option value="' + escapeHtml(item) + '"' + (item === decision.review_decision ? " selected" : "") + ">" + escapeHtml(item || "Choose decision") + "</option>").join("");
    return '<article class="line-ofc-review-card" data-import-id="' + escapeHtml(row.import_id) + '">'
      + '<div class="line-ofc-review-card-head"><div><div class="line-ofc-review-name">' + escapeHtml(row.line_display_name || row.line_renamed_name || "Unnamed LINE row") + '</div><div class="line-ofc-review-muted">Rename: ' + escapeHtml(row.line_renamed_name || "") + '</div><div class="line-ofc-review-muted">Import: ' + escapeHtml(row.import_id) + '</div></div><div>' + badge(safety, safetyClass) + '</div></div>'
      + '<div class="line-ofc-review-badges">' + [row.review_status, row.match_type, row.parsed_client_level, row.parsed_membership_status, row.parsed_membership_tier, row.parsed_membership_package].map((item) => badge(item)).join("") + '</div>'
      + '<div class="line-ofc-review-decision"><label><span>Decision</span><select data-decision-field="review_decision">' + decisionOptions + '</select></label><label><span>Reviewed by</span><input data-decision-field="reviewed_by" value="' + escapeHtml(decision.reviewed_by) + '" placeholder="reviewer name"></label><label><span>Matched client id</span><input data-decision-field="matched_client_id" value="' + escapeHtml(decision.matched_client_id) + '" placeholder="rec..."></label><label><span>Review note</span><textarea data-decision-field="review_note" rows="2" placeholder="local note">' + escapeHtml(decision.review_note) + '</textarea></label><div class="line-ofc-review-muted">reviewed_at: ' + escapeHtml(decision.reviewed_at || "set when decision is chosen") + ' · decision_source: manual_review</div></div>'
      + '<div class="line-ofc-review-grid">' + [["Client level", row.parsed_client_level], ["Status", row.parsed_membership_status], ["Tier", row.parsed_membership_tier], ["Package", row.parsed_membership_package], ["Member since", row.parsed_member_since], ["Since raw", row.parsed_member_since_raw], ["Purchased", row.has_purchased ? "yes" : "no"], ["Review", row.review_status], ["Match", row.match_type], ["Match conf", percent(row.match_confidence)], ["Parse conf", percent(row.parse_confidence)], ["Chosen member evidence", row.chosen_member_since_token], ["Member evidence list", (row.all_member_tokens || []).join(", ")]].map((pair) => '<div class="line-ofc-review-field"><span>' + escapeHtml(pair[0]) + '</span><b>' + escapeHtml(pair[1] || "") + '</b></div>').join("") + '</div>'
      + '<div class="line-ofc-review-field"><span>LINE tags raw</span><b class="line-ofc-review-tags">' + escapeHtml(row.line_tags_raw) + '</b></div>'
      + '<div class="line-ofc-review-field"><span>Proposed entitlement summary</span><b>' + escapeHtml(JSON.stringify(row.proposed_entitlement_summary)) + '</b></div>'
      + '<div class="line-ofc-review-badges">' + (row.parse_warnings || []).map((item) => badge(item, "line-ofc-review-badge-blocked")).join("") + '</div>'
      + '<details class="line-ofc-review-details"><summary>raw/debug redacted</summary><pre class="line-ofc-review-pre">' + escapeHtml(JSON.stringify(row.raw_debug_redacted, null, 2)) + '</pre></details></article>';
  }

  root.innerHTML = '<div class="line-ofc-review-shell"><section class="line-ofc-review-top"><div><div class="line-ofc-review-kicker">MMD / SIGIL internal</div><h1 class="line-ofc-review-title">LINE OFC Review</h1><p class="line-ofc-review-subtitle">Batch ' + escapeHtml(summary.batch_id) + ' · review-only human decision layer · no commit action on this page</p></div><div class="line-ofc-review-actions"><button type="button" data-export-json>Export JSON</button><button type="button" data-export-csv>Export CSV</button></div></section><section class="line-ofc-review-summary">' + stat(summary.total_rows, "Total rows") + stat(summary.review_required_count, "Review required") + stat(summary.multiple_match_count, "Multiple match") + stat(summary.member_vip_premium_count, "Member / VIP / Premium") + stat(summary.no_match_count, "No match") + stat(summary.unsafe_to_commit_count, "Unsafe to commit") + '</section><section class="line-ofc-review-guardrails">' + data.guardrails.map((item) => '<span class="line-ofc-review-chip">' + escapeHtml(item) + '</span>').join("") + '</section><nav class="line-ofc-review-tabs"></nav><section class="line-ofc-review-controls"><input class="line-ofc-review-input" data-filter="search" placeholder="Search display, rename, import id"><select class="line-ofc-review-select" data-filter="status"></select><select class="line-ofc-review-select" data-filter="tier"></select><select class="line-ofc-review-select" data-filter="package"></select><select class="line-ofc-review-select" data-filter="match"></select></section><div class="line-ofc-review-count"></div><section class="line-ofc-review-list"></section></div>';

  const tabs = root.querySelector(".line-ofc-review-tabs");
  const list = root.querySelector(".line-ofc-review-list");
  const count = root.querySelector(".line-ofc-review-count");
  const filters = {
    status: root.querySelector('[data-filter="status"]'),
    tier: root.querySelector('[data-filter="tier"]'),
    package: root.querySelector('[data-filter="package"]'),
    match: root.querySelector('[data-filter="match"]'),
    search: root.querySelector('[data-filter="search"]'),
  };
  const queues = {
    review_required: "Review Required",
    multiple_match_review: "Multiple Match",
    member_vip_premium_evidence: "Member / VIP / Premium Evidence",
    no_match_staging_only: "No Match Staging",
    ready_after_manual_review: "Ready After Manual Review",
    all_staging: "All Staging",
  };

  Object.entries(queues).forEach(([key, label]) => {
    const button = document.createElement("button");
    button.className = "line-ofc-review-tab";
    button.type = "button";
    button.dataset.queue = key;
    button.textContent = label;
    button.addEventListener("click", () => {
      activeQueue = key;
      renderRows();
    });
    tabs.appendChild(button);
  });

  function fillSelect(select, label, mapper) {
    select.appendChild(option("", label));
    unique(rows, mapper).forEach((item) => select.appendChild(option(item, item)));
  }
  fillSelect(filters.status, "All statuses", (row) => row.review_status);
  fillSelect(filters.tier, "All tiers", (row) => row.parsed_membership_tier);
  fillSelect(filters.package, "All packages", (row) => row.parsed_membership_package);
  fillSelect(filters.match, "All match types", (row) => row.match_type);
  Object.values(filters).forEach((item) => {
    item.addEventListener("input", renderRows);
    item.addEventListener("change", renderRows);
  });
  root.querySelector("[data-export-json]").addEventListener("click", exportJson);
  root.querySelector("[data-export-csv]").addEventListener("click", exportCsv);

  function visibleRows() {
    const search = filters.search.value.toLowerCase();
    return rows.filter((row) => {
      const queueOk = !activeQueue || activeQueue === "all_staging" || (row.queue_flags && row.queue_flags[activeQueue]);
      const statusOk = !filters.status.value || row.review_status === filters.status.value;
      const tierOk = !filters.tier.value || row.parsed_membership_tier === filters.tier.value;
      const packageOk = !filters.package.value || row.parsed_membership_package === filters.package.value;
      const matchOk = !filters.match.value || row.match_type === filters.match.value;
      const searchOk = !search || [row.line_display_name, row.line_renamed_name, row.import_id].join(" ").toLowerCase().includes(search);
      return queueOk && statusOk && tierOk && packageOk && matchOk && searchOk;
    });
  }

  function renderCount() {
    const decisionCount = exportableDecisions().length;
    count.textContent = visibleRows().length + " rows shown · " + decisionCount + " local decisions ready to export";
  }

  function bindDecisionControls() {
    root.querySelectorAll("[data-import-id]").forEach((cardNode) => {
      const row = rows.find((item) => item.import_id === cardNode.dataset.importId);
      if (!row) return;
      cardNode.querySelectorAll("[data-decision-field]").forEach((field) => {
        field.addEventListener("change", () => saveDecision(row, { [field.dataset.decisionField]: field.value }));
        field.addEventListener("input", () => {
          if (field.tagName === "TEXTAREA" || field.type === "text") saveDecision(row, { [field.dataset.decisionField]: field.value });
        });
      });
    });
  }

  function renderRows() {
    Array.from(tabs.children).forEach((item) => item.classList.toggle("is-active", item.dataset.queue === activeQueue));
    const shown = visibleRows();
    list.innerHTML = shown.length ? shown.map(card).join("") : '<div class="line-ofc-review-empty">No rows match these filters.</div>';
    bindDecisionControls();
    renderCount();
  }

  renderRows();
})();`;
}

function renderWebflowEmbed(data) {
  return `<section class="line-ofc-review-page" data-line-ofc-review-root>
  <script id="line-ofc-review-data" type="application/json">${jsonForHtml(data)}</script>
</section>`;
}

function renderControlRoomIntegration(data) {
  return `# LINE OFC Review - Control Room Integration

## Recommendation

- Add route/page: \`/control-room/line-ofc-review\`
- Link label: \`LINE OFC Review\`
- Access: internal/admin only
- Mode: review-only
- No commit action on this page
- Data source: embedded \`review-data.redacted.json\` payload generated locally from \`${data.summary.batch_id}\`

## Guardrails

- Do not expose Airtable credentials in Webflow or frontend code.
- Do not call Airtable from the frontend.
- Do not patch Clients from this page.
- Do not create or merge Clients from this page.
- Do not write Member Entitlements from this page.
- Keep Gmail paused and out of this workflow.
- LINE OFC rename/tag evidence remains the membership source of truth.

## Future Commit Path

Future commit should be a separate guarded worker endpoint requiring \`t\`.
That endpoint should accept a reviewed local decision export, validate \`import_id\`
against staging, and apply only explicitly approved actions after a separate review
gate. It should not be wired to buttons on this review page.

## Webflow Paste Files

- Head CSS: \`webflow-head.css\`
- Embed block: \`webflow-embed.html\`
- Before body JS: \`webflow-before-body.js\`

The Webflow version reads only embedded redacted JSON. It has no Airtable API calls
and no secret-bearing frontend configuration.
`;
}

function writeReviewPage(data, outDir = OUT_DIR) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = {
    "index.html": renderHtml(data),
    "line-ofc-review.css": renderCss(),
    "line-ofc-review.js": renderJs(),
    [DATA_FILE]: `${JSON.stringify(data, null, 2)}\n`,
    "webflow-embed.html": `${renderWebflowEmbed(data)}\n`,
    "webflow-head.css": `${renderCss()}\n`,
    "webflow-before-body.js": `${renderJs()}\n`,
    "control-room-integration.md": renderControlRoomIntegration(data),
  };
  for (const [file, content] of Object.entries(files)) fs.writeFileSync(path.join(outDir, file), content);
  return Object.keys(files).map((file) => path.join(outDir, file));
}

async function fetchStagingBatch({ batchId, airtable = new AirtableClient() }) {
  return airtable.list(STAGING_TABLE, {
    filterByFormula: `{import_batch_id}="${clean(batchId).replace(/"/g, '\\"')}"`,
  });
}

async function runReviewPage({ batchId, airtable = new AirtableClient(), outDir = OUT_DIR }) {
  if (!process.env.AIRTABLE_API_KEY && airtable instanceof AirtableClient) throw new Error("airtable_not_configured");
  const records = await fetchStagingBatch({ batchId, airtable });
  const data = buildReviewData(records, batchId);
  const generatedFiles = writeReviewPage(data, outDir);
  return {
    ok: true,
    mode: "line_ofc_review_page",
    batch_id: batchId,
    generated_files: generatedFiles,
    summary: data.summary,
    sample_redacted_card_data: data.rows.slice(0, 3),
    airtable_reads_only: true,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.batchId) {
    console.error("Usage: npm run line-ofc:review-page -- --batch-id <batch_id>");
    process.exitCode = 1;
    return;
  }
  const result = await runReviewPage({ batchId: args.batchId });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  buildReviewData,
  normalizeReviewRecord,
  redactObject,
  renderCss,
  renderHtml,
  renderJs,
  renderControlRoomIntegration,
  runReviewPage,
  writeReviewPage,
};
