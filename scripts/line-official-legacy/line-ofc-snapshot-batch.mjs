import fs from "node:fs";
import crypto from "node:crypto";

const DEFAULT_REASON = "Snapshot LINE OFC evidence before resolver/history review";
const VALID_SOURCE_PRIORITY = new Set(["line_ofc", "owner_confirmed", "customer_note", "model_group_album"]);
const MAX_EVIDENCE_PER_CASE = 2;
const IMPORT_PATH = "/v1/admin/kenji/control/line-ofc/import";

function clean(value = "", max = 50000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function normalizeJson(value, max = 50000) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return clean(value, max);
  return clean(JSON.stringify(value), max);
}

function hashSnapshot(input) {
  const material = JSON.stringify({
    line_user_id: input.line_user_id || "",
    current_line_rename: input.current_line_rename || "",
    display_name: input.display_name || "",
    raw_line_notes: input.raw_line_notes || "",
    membership_application_sensitive: input.membership_application_sensitive || "",
    behaviour_care_context: input.behaviour_care_context || "",
    service_history_candidate: input.service_history_candidate || "",
  });
  return `sha256:${crypto.createHash("sha256").update(material).digest("hex")}`;
}

function safeImportId(input, index) {
  const supplied = clean(input.import_id, 180);
  if (supplied) return supplied;
  const base = clean(input.case_key || input.line_user_id || input.current_line_rename || `snapshot-${index + 1}`, 80)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `snapshot-${index + 1}`;
  return `line-ofc-snapshot:${new Date().toISOString().slice(0, 10)}:${base}:${String(index + 1).padStart(3, "0")}`;
}

export function buildLineOfcSnapshotPayload(input = {}, index = 0) {
  const sourcePriority = clean(input.source_priority || "line_ofc", 80).toLowerCase();
  if (!VALID_SOURCE_PRIORITY.has(sourcePriority)) throw new Error(`invalid_source_priority:${sourcePriority}`);
  const payload = {
    import_id: safeImportId(input, index),
    line_user_id: clean(input.line_user_id, 180),
    email: clean(input.email, 254).toLowerCase(),
    phone: clean(input.phone, 80),
    display_name: clean(input.display_name, 160),
    telegram_username: clean(input.telegram_username, 160),
    telegram_user_id: clean(input.telegram_user_id, 160),
    current_line_rename: clean(input.current_line_rename, 500),
    raw_line_notes: clean(input.raw_line_notes, 50000),
    membership_application_sensitive: clean(input.membership_application_sensitive, 50000),
    behaviour_care_context: clean(input.behaviour_care_context, 30000),
    service_history_candidate: normalizeJson(input.service_history_candidate, 50000),
    source_hash: clean(input.source_hash, 180),
    reason: clean(input.reason || DEFAULT_REASON, 1000),
  };
  if (!payload.line_user_id) throw new Error("line_user_id_required");
  if (!payload.raw_line_notes && !payload.membership_application_sensitive && !payload.behaviour_care_context && !payload.service_history_candidate) {
    throw new Error("snapshot_evidence_required");
  }
  if (!payload.source_hash) payload.source_hash = hashSnapshot(payload);
  payload._snapshot_meta = {
    source_priority: sourcePriority,
    case_key: clean(input.case_key || payload.line_user_id, 180),
    evidence_rank: Number(input.evidence_rank || index + 1),
    snapshot_window: clean(input.snapshot_window, 200),
    owner_review_note: clean(input.owner_review_note, 1000),
  };
  return payload;
}

export function buildSnapshotBatch(input = {}) {
  const rows = Array.isArray(input) ? input : Array.isArray(input.snapshots) ? input.snapshots : [input];
  const counts = new Map();
  return rows.map((row, index) => {
    const payload = buildLineOfcSnapshotPayload(row, index);
    const key = payload._snapshot_meta.case_key || payload.line_user_id;
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    if (count > MAX_EVIDENCE_PER_CASE) throw new Error(`too_many_evidence_items_for_case:${key}`);
    return payload;
  });
}

export function stripMetaForImport(payload) {
  const { _snapshot_meta, ...body } = payload;
  return body;
}

async function postSnapshots(payloads, { url, token, dryRun = false } = {}) {
  if (!url) throw new Error("LINE_OFC_IMPORT_URL_required");
  if (!token) throw new Error("LINE_OFC_IMPORT_TOKEN_required");
  const results = [];
  for (const payload of payloads) {
    const body = stripMetaForImport(payload);
    if (dryRun) {
      results.push({ import_id: body.import_id, dry_run: true, body });
      continue;
    }
    const idempotencyKey = `line-ofc-snapshot:${body.import_id}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        "x-internal-token": token,
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`line_ofc_import_http_${response.status}:${text.slice(0, 500)}`);
    results.push(JSON.parse(text));
  }
  return results;
}

function usage() {
  return `Usage:\n  node scripts/line-official-legacy/line-ofc-snapshot-batch.mjs input.json > payloads.json\n  LINE_OFC_IMPORT_URL=https://www.mmdbkk.com${IMPORT_PATH} LINE_OFC_IMPORT_TOKEN=... node scripts/line-official-legacy/line-ofc-snapshot-batch.mjs input.json --post\n\nInput can be { snapshots: [...] } or a single snapshot object.`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file || ["-h", "--help"].includes(file)) {
    console.log(usage());
    process.exit(file ? 0 : 1);
  }
  const input = JSON.parse(fs.readFileSync(file, "utf8"));
  const payloads = buildSnapshotBatch(input);
  const shouldPost = process.argv.includes("--post");
  const dryRun = process.argv.includes("--dry-run");
  const importUrl = process.env.LINE_OFC_IMPORT_URL || `https://www.mmdbkk.com${IMPORT_PATH}`;
  const token = process.env.LINE_OFC_IMPORT_TOKEN || process.env.INTERNAL_TOKEN || "";
  (shouldPost ? postSnapshots(payloads, { url: importUrl, token, dryRun }) : Promise.resolve(payloads))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exitCode = 1;
    });
}
