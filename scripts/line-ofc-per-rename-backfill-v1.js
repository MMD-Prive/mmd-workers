#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const API = "https://api.airtable.com/v0";
const BASE = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const TABLES = {
  clients: "tblVv58TCbwh5j1fS",
  staging: "tblOs8yyLK09SKrCt",
  preSession: "tblwn6I9VWie5d7Ui",
};
const F = {
  clients: {
    uid: "fld5HfSGChKFbd4uh",
    name: "fldrHqkGQzvBLRxlP",
  },
  staging: {
    key: "fld7PhMqb4TS2efKp",
    status: "fldhoCFkMCaP5PmVF",
    uid: "fldjanE2xn2N46F5R",
    display: "fldB6Ni6TmR25ISDF",
    rename: "fldOC1bxBGpBrf3U1",
    sourceHash: "fldYR6KgXdkReO5ui",
    importedAt: "fldGKl8Z1muNPTLlp",
    client: "fldtJMOL83srrdD1u",
    note: "fldwosm9YOwpxouwX",
  },
  index: {
    key: "fldOZE5KckVNY7rE7",
    sourceType: "fldMocKAUyU54M8hb",
    sourceRecordId: "fldHTQl1kiQZTnkwO",
    preferredName: "fldJFmSmwcSU7QLt4",
    uid: "fldOvU690mT3dT9uS",
    display: "fld6KHx1bEYUlqUJq",
    legacySignals: "fldbsvqEw9QmzOO5s",
    client: "fldWeLiUcBUPye8me",
    resolution: "fldUQAVa7BUmQDJLn",
    lookup: "fld9aOsZJkmeniJTq",
    confidence: "fldpTgkWwrQcXmrL5",
    candidateOnly: "fldev7DZkXWWECMiC",
    rightsSource: "fldIKlPKsfzLkQmqf",
    snapshot: "fldon59do6v01lg6R",
    syncedAt: "fldBpvZ9cc3SRJW4w",
    notes: "fldmVJxFA5SaSmGCa",
  },
};

const REAL_UID = /^U[0-9a-f]{32}$/i;
const BAD_RENAME = /(?:line[_\s-]?webhook|event\s*:|message\s*:|has_text|diagnostic|smoke|unknown|system|test(?:ing)?)/i;
const SOURCE = "line_ofc_per_rename_full_backfill_v1";
const PREFIX = "line_ofc_per_rename_v1_";

function clean(v, n = 2000) {
  return String(v ?? "").replace(/\0/g, "").trim().slice(0, n);
}
function norm(v) {
  return clean(v, 500).replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
}
function field(row, names) {
  for (const name of names) {
    if (row && Object.prototype.hasOwnProperty.call(row, name) && clean(row[name])) return row[name];
  }
  return "";
}
function validRename(v) {
  const s = clean(v, 500);
  return Boolean(s && s.length <= 500 && !BAD_RENAME.test(s));
}
function parseDate(v) {
  const t = Date.parse(clean(v, 80));
  return Number.isFinite(t) ? t : 0;
}
function hashRow(row) {
  return crypto.createHash("sha256").update(JSON.stringify({
    uid: row.uid,
    rename: row.rename,
    display: row.display,
    capturedAt: row.capturedAt || "",
  })).digest("hex");
}
function linkIds(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => clean(typeof x === "object" ? x.id : x, 80)).filter(Boolean).sort();
}
function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(linkIds(a)) === JSON.stringify(linkIds(b));
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
  return clean(a, 100000) === clean(b, 100000);
}
function diffFields(current, wanted) {
  const patch = {};
  for (const [k, v] of Object.entries(wanted)) {
    if (v === undefined || v === null) continue;
    if (!sameValue(current?.[k], v)) patch[k] = v;
  }
  return patch;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const header = (rows.shift() || []).map((x) => clean(x, 200));
  return rows.filter((r) => r.some((x) => clean(x))).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
function readSource(path) {
  const text = fs.readFileSync(path, "utf8");
  if (/\.json$/i.test(path)) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    throw new Error("source_json_rows_required");
  }
  return parseCsv(text);
}
function normalizeSourceRow(row) {
  const uid = clean(field(row, ["LINE User ID", "line_user_id", "lineUserId", "userId", "uid"]), 80);
  const rename = clean(field(row, ["Current LINE Rename", "current_line_rename", "line_renamed_name", "Per Rename", "per_rename", "nickname"]), 500);
  const display = clean(field(row, ["Display Name", "display_name", "line_display_name", "displayName"]), 160);
  const capturedAt = clean(field(row, ["Captured At", "captured_at", "Updated At", "updated_at", "Imported At", "imported_at", "timestamp"]), 80);
  return { uid, rename, display, capturedAt };
}

function consolidateSource(rawRows) {
  const groups = new Map();
  let invalidUid = 0, invalidRename = 0;
  for (const raw of rawRows) {
    const row = normalizeSourceRow(raw);
    if (!REAL_UID.test(row.uid)) { invalidUid++; continue; }
    if (!validRename(row.rename)) { invalidRename++; continue; }
    const key = row.uid.toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const selected = [], unresolved = [];
  let duplicateRows = 0, duplicateGroups = 0, sameRenameDuplicateGroups = 0, latestResolvedGroups = 0;
  for (const [uidKey, rows] of groups) {
    if (rows.length > 1) { duplicateGroups++; duplicateRows += rows.length - 1; }
    const byRename = new Map();
    for (const r of rows) {
      const k = norm(r.rename);
      if (!byRename.has(k)) byRename.set(k, []);
      byRename.get(k).push(r);
    }
    if (byRename.size === 1) {
      if (rows.length > 1) sameRenameDuplicateGroups++;
      selected.push(rows.slice().sort((a, b) => parseDate(b.capturedAt) - parseDate(a.capturedAt))[0]);
      continue;
    }
    const dated = rows.filter((r) => parseDate(r.capturedAt) > 0).sort((a, b) => parseDate(b.capturedAt) - parseDate(a.capturedAt));
    if (dated.length === rows.length && dated.length > 1 && parseDate(dated[0].capturedAt) > parseDate(dated[1].capturedAt)) {
      selected.push(dated[0]);
      latestResolvedGroups++;
    } else {
      unresolved.push({ uid: uidKey, count: rows.length, renameCount: byRename.size });
    }
  }
  return {
    selected,
    unresolved,
    counts: {
      source_rows: rawRows.length,
      valid_source_rows: [...groups.values()].reduce((n, x) => n + x.length, 0),
      invalid_line_user_id_rows: invalidUid,
      invalid_rename_rows: invalidRename,
      unique_line_user_ids: groups.size,
      duplicate_rows: duplicateRows,
      duplicate_groups: duplicateGroups,
      same_rename_duplicate_groups: sameRenameDuplicateGroups,
      conflicting_rename_groups_resolved_by_latest_timestamp: latestResolvedGroups,
      unresolved_rename_conflict_groups: unresolved.length,
      selected_unique_identities: selected.length,
    },
  };
}

function auditExisting(rows) {
  const groups = new Map();
  let validRows = 0, invalidUidRows = 0, nonemptyRenameRows = 0;
  for (const r of rows) {
    const f = r.fields || {};
    const uid = clean(f[F.staging.uid], 80);
    const rename = clean(f[F.staging.rename], 500);
    if (!REAL_UID.test(uid)) { invalidUidRows++; continue; }
    validRows++;
    if (rename) nonemptyRenameRows++;
    const k = uid.toUpperCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ rename, key: clean(f[F.staging.key], 220) });
  }
  let duplicateGroups = 0, duplicateRows = 0, renameConflictGroups = 0, perRenameV1Rows = 0;
  for (const rowsForUid of groups.values()) {
    if (rowsForUid.length > 1) { duplicateGroups++; duplicateRows += rowsForUid.length - 1; }
    const names = new Set(rowsForUid.map((x) => norm(x.rename)).filter(Boolean));
    if (names.size > 1) renameConflictGroups++;
    perRenameV1Rows += rowsForUid.filter((x) => x.key.startsWith(PREFIX)).length;
  }
  return {
    existing_staging_rows: rows.length,
    valid_line_user_id_rows: validRows,
    invalid_line_user_id_rows: invalidUidRows,
    nonempty_current_line_rename_rows: nonemptyRenameRows,
    unique_line_user_ids: groups.size,
    duplicate_groups: duplicateGroups,
    duplicate_rows: duplicateRows,
    rename_conflict_groups: renameConflictGroups,
    per_rename_v1_rows: perRenameV1Rows,
  };
}

class Airtable {
  constructor() {
    this.token = clean(process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN, 3000);
    if (!this.token) throw new Error("airtable_not_configured");
  }
  async request(path, init = {}) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`${API}/${BASE}/${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...(init.headers || {}) },
      });
      if (res.ok) return res.json();
      if (![429, 500, 502, 503, 504].includes(res.status) || attempt === 3) throw new Error(`airtable_${res.status}`);
      await new Promise((r) => setTimeout(r, 300 * (2 ** attempt)));
    }
  }
  async list(table, fields = []) {
    let offset = ""; const out = [];
    do {
      const q = new URLSearchParams({ pageSize: "100" });
      for (const f of fields) q.append("fields[]", f);
      if (offset) q.set("offset", offset);
      const data = await this.request(`${table}?${q}`);
      out.push(...(data.records || []));
      offset = data.offset || "";
    } while (offset);
    return out;
  }
  async create(table, fields) {
    return this.request(table, { method: "POST", body: JSON.stringify({ fields }) });
  }
  async update(table, id, fields) {
    return this.request(`${table}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ fields }) });
  }
}

async function applySource(air, source, apply) {
  const clients = await air.list(TABLES.clients, [F.clients.uid, F.clients.name]);
  const staging = await air.list(TABLES.staging, Object.values(F.staging));
  const index = await air.list(TABLES.preSession, Object.values(F.index));

  const clientsByUid = new Map();
  for (const r of clients) {
    const uid = clean(r.fields?.[F.clients.uid], 80).toUpperCase();
    if (!REAL_UID.test(uid)) continue;
    if (!clientsByUid.has(uid)) clientsByUid.set(uid, []);
    clientsByUid.get(uid).push(r.id);
  }
  const stageByKey = new Map(staging.map((r) => [clean(r.fields?.[F.staging.key], 220), r]));
  const indexByKey = new Map(index.map((r) => [clean(r.fields?.[F.index.key], 220), r]));

  const counts = {
    canonical_linked: 0,
    unresolved_no_client: 0,
    duplicate_canonical_line_user_id: 0,
    staging_create: 0,
    staging_update: 0,
    staging_noop: 0,
    index_create: 0,
    index_update: 0,
    index_noop: 0,
  };
  const now = new Date().toISOString();

  for (const row of source.selected) {
    const uidKey = row.uid.toUpperCase();
    const matches = clientsByUid.get(uidKey) || [];
    const matched = matches.length === 1;
    const duplicateClient = matches.length > 1;
    if (matched) counts.canonical_linked++;
    else if (duplicateClient) counts.duplicate_canonical_line_user_id++;
    else counts.unresolved_no_client++;

    const suffix = uidKey.toLowerCase();
    const stageKey = PREFIX + suffix;
    const stageCurrent = stageByKey.get(stageKey);
    const status = matched ? "matched" : "review_required";
    const stageFields = {
      [F.staging.key]: stageKey,
      [F.staging.status]: status,
      [F.staging.uid]: row.uid,
      [F.staging.display]: row.display,
      [F.staging.rename]: row.rename,
      [F.staging.sourceHash]: hashRow(row),
      [F.staging.importedAt]: row.capturedAt && parseDate(row.capturedAt) ? new Date(parseDate(row.capturedAt)).toISOString() : now,
      [F.staging.note]: matched
        ? "Per-Rename Full Backfill v1. Exact LINE User ID linked to one canonical Client. Rename is identity/search evidence only; no membership, entitlement, points, payment, job, or session mutation."
        : duplicateClient
          ? "Per-Rename Full Backfill v1. Duplicate canonical Clients share this LINE User ID; review required. Rename is not authority for canonical linking or rights."
          : "Per-Rename Full Backfill v1. No canonical Client with this exact LINE User ID yet; keep as searchable identity evidence only.",
    };
    if (matched) stageFields[F.staging.client] = [matches[0]];
    else stageFields[F.staging.client] = [];
    const stagePatch = diffFields(stageCurrent?.fields || {}, stageFields);
    let stageRecordId = stageCurrent?.id || "";
    if (!stageCurrent) {
      counts.staging_create++;
      if (apply) stageRecordId = (await air.create(TABLES.staging, stageFields)).id;
    } else if (Object.keys(stagePatch).length) {
      counts.staging_update++;
      if (apply) await air.update(TABLES.staging, stageCurrent.id, stagePatch);
    } else counts.staging_noop++;

    const indexKey = `line_ofc_per_rename:${suffix}`;
    const idxCurrent = indexByKey.get(indexKey);
    const idxFields = {
      [F.index.key]: indexKey,
      [F.index.sourceType]: SOURCE,
      [F.index.sourceRecordId]: stageRecordId || stageCurrent?.id || stageKey,
      [F.index.preferredName]: row.rename,
      [F.index.uid]: row.uid,
      [F.index.display]: row.display,
      [F.index.legacySignals]: "Current Per rename from LINE OFC. Identity/search evidence only; exact LINE User ID is the dedupe key.",
      [F.index.resolution]: matched ? "linked" : duplicateClient ? "review_required" : "candidate",
      [F.index.lookup]: matched ? "canonical_ready" : duplicateClient ? "review_required" : "searchable_candidate",
      [F.index.confidence]: matched ? "verified" : duplicateClient ? "medium" : "high",
      [F.index.candidateOnly]: !matched,
      [F.index.rightsSource]: "my_mmd_entitlement_resolver_v1",
      [F.index.snapshot]: JSON.stringify({ version: "line-ofc-per-rename-v1", source: SOURCE, identity_only: true }),
      [F.index.syncedAt]: now,
      [F.index.notes]: matched
        ? "Current Per rename linked by exact LINE User ID. Client Search may use this as highest-priority alias; rights remain backend-resolver-owned."
        : "Current Per rename stored for discovery only. No name-only canonical link is allowed.",
    };
    if (matched) idxFields[F.index.client] = [matches[0]];
    else idxFields[F.index.client] = [];
    const idxPatch = diffFields(idxCurrent?.fields || {}, idxFields);
    if (!idxCurrent) {
      counts.index_create++;
      if (apply) await air.create(TABLES.preSession, idxFields);
    } else if (Object.keys(idxPatch).length) {
      counts.index_update++;
      if (apply) await air.update(TABLES.preSession, idxCurrent.id, idxPatch);
    } else counts.index_noop++;
  }
  return counts;
}

function parseArgs(argv) {
  const out = { apply: false, audit: false, selfTest: false, assertIdempotent: false, input: "", report: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--dry-run") out.apply = false;
    else if (a === "--audit-existing") out.audit = true;
    else if (a === "--self-test") out.selfTest = true;
    else if (a === "--assert-idempotent") out.assertIdempotent = true;
    else if (a === "--input") out.input = argv[++i] || "";
    else if (a === "--report") out.report = argv[++i] || "";
    else throw new Error(`unknown_arg:${a}`);
  }
  return out;
}
function writeReport(path, report) {
  const text = JSON.stringify(report, null, 2) + "\n";
  if (path) fs.writeFileSync(path, text);
  process.stdout.write(text);
}
function selfTest() {
  const csv = 'LINE User ID,Current LINE Rename,Display Name,Captured At\nU1234567890abcdef1234567890abcdef,"ก้อง - SVIP - (KKKsk)",KKKsk,2026-09-15T18:00:00Z\n';
  const parsed = parseCsv(csv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]["Current LINE Rename"], "ก้อง - SVIP - (KKKsk)");
  const same = consolidateSource([
    { line_user_id: "U1234567890abcdef1234567890abcdef", current_line_rename: "A" },
    { line_user_id: "U1234567890abcdef1234567890abcdef", current_line_rename: "A" },
  ]);
  assert.equal(same.counts.unique_line_user_ids, 1);
  assert.equal(same.counts.duplicate_rows, 1);
  assert.equal(same.counts.unresolved_rename_conflict_groups, 0);
  const newest = consolidateSource([
    { line_user_id: "U1234567890abcdef1234567890abcdef", current_line_rename: "Old", captured_at: "2026-09-01T00:00:00Z" },
    { line_user_id: "U1234567890abcdef1234567890abcdef", current_line_rename: "New", captured_at: "2026-09-15T00:00:00Z" },
  ]);
  assert.equal(newest.selected[0].rename, "New");
  const conflict = consolidateSource([
    { line_user_id: "U1234567890abcdef1234567890abcdef", current_line_rename: "A" },
    { line_user_id: "U1234567890abcdef1234567890abcdef", current_line_rename: "B" },
  ]);
  assert.equal(conflict.counts.unresolved_rename_conflict_groups, 1);
  assert.equal(conflict.selected.length, 0);
  assert.equal(validRename("line_webhook, event:message"), false);
  process.stdout.write(JSON.stringify({ ok: true, self_test: "passed" }) + "\n");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.selfTest) return selfTest();
  const air = new Airtable();
  const report = { version: "line-ofc-per-rename-full-backfill-v1", mode: args.apply ? "apply" : "dry_run" };

  const existing = await air.list(TABLES.staging, [F.staging.key, F.staging.uid, F.staging.rename, F.staging.client]);
  report.existing_verified_staging = auditExisting(existing);

  if (args.input) {
    const source = consolidateSource(readSource(args.input));
    report.source = source.counts;
    report.plan = await applySource(air, source, args.apply);
    if (args.assertIdempotent) {
      const writes = report.plan.staging_create + report.plan.staging_update + report.plan.index_create + report.plan.index_update;
      if (writes !== 0) throw new Error(`not_idempotent:${writes}`);
    }
  } else {
    report.source = { provided: false };
    report.plan = { mutation: false, reason: "no_current_per_rename_source_file" };
  }
  writeReport(args.report, report);
}

main().catch((error) => {
  process.stderr.write(JSON.stringify({ ok: false, error: clean(error?.message || error, 300) }) + "\n");
  process.exitCode = 1;
});
