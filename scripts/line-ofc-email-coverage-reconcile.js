#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");

const API = "https://api.airtable.com/v0";
const BASE = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const TABLES = {
  clients: "tblVv58TCbwh5j1fS",
  console: "tblFHmfpB2TTrzO2e",
  legacyStaging: "tbl1u0foFBvgFpT9G",
  currentStaging: "tblOs8yyLK09SKrCt",
  historicalEvidence: "tbl4wqlFG9Ovmtp4c",
  emailIdentity: "tblXAPkTK6KzUmFBD",
  members: "tblgWc5VRon5o8Mhk",
};
const REAL_LINE = /^U[0-9a-f]{32}$/i;
const INTERNAL = new Set(["malemodel.bkk@gmail.com", "mmdprive@gmail.com"]);
const BAD_DOMAIN = /(?:^|\.)(?:example\.com|example\.invalid|invalid|localhost)$/i;
const BAD_LOCAL = /(?:smoke|test|dummy|example|noreply|no-reply|do-not-reply|donotreply)/i;
const EMAIL_RE = /\b[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi;
const clean = (v, n = 100000) => String(v ?? "").replace(/\0/g, "").trim().slice(0, n);
const linkIds = (v) => Array.isArray(v) ? v.map((x) => clean(typeof x === "object" ? x.id : x, 80)).filter((x) => /^rec[A-Za-z0-9]{14}$/.test(x)) : [];
function validEmail(v) {
  const x = clean(v, 254).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i.test(x)) return "";
  const [local, domain] = x.split("@");
  if (INTERNAL.has(x) || BAD_DOMAIN.test(domain) || BAD_LOCAL.test(local)) return "";
  return x;
}
function emailsIn(v) {
  const out = new Set();
  for (const m of clean(v).matchAll(EMAIL_RE)) {
    const x = validEmail(m[0]);
    if (x) out.add(x);
  }
  return [...out];
}
function pickField(fields, names) {
  const idx = new Map(Object.keys(fields || {}).map((k) => [k.toLowerCase(), k]));
  for (const n of names) {
    const k = idx.get(n.toLowerCase());
    if (k) return fields[k];
  }
  return undefined;
}
function exactClientIds(fields) {
  for (const names of [
    ["Canonical Client"], ["matched_client"], ["matched client"], ["Client"], ["client"]
  ]) {
    const ids = linkIds(pickField(fields, names));
    if (ids.length) return ids;
  }
  return [];
}
class Airtable {
  constructor() {
    this.token = clean(process.env.AIRTABLE_API_KEY || process.env.MMS_AIRTABLE_API_TOKEN, 3000);
    if (!this.token) throw new Error("airtable_not_configured");
    this.last = 0;
  }
  async request(table, { method = "GET", body, query = {} } = {}) {
    const u = new URL(`${API}/${BASE}/${table}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
    for (let attempt = 0; attempt < 7; attempt++) {
      const wait = this.last + 235 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      let res;
      try {
        res = await fetch(u, { method, headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      } catch (e) {
        if (attempt === 6) throw e;
        await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      if (![429, 500, 502, 503, 504].includes(res.status) || attempt === 6) throw new Error(`airtable_${res.status}:${clean(data?.error?.message || data?.error?.type || JSON.stringify(data), 500)}`);
      await new Promise((r) => setTimeout(r, Math.max(Number(res.headers.get("retry-after") || 0) * 1000, 800 * 2 ** attempt)));
    }
  }
  async list(table) {
    const all = [];
    let offset = "";
    do {
      const d = await this.request(table, { query: { pageSize: 100, ...(offset ? { offset } : {}) } });
      all.push(...(d.records || []));
      offset = clean(d.offset, 500);
    } while (offset);
    return all;
  }
  async update(table, rows) {
    for (let i = 0; i < rows.length; i += 10) {
      await this.request(table, { method: "PATCH", body: { records: rows.slice(i, i + 10), typecast: false } });
    }
  }
}
function addEvidence(store, clientId, email, source, score, detail = "") {
  email = validEmail(email);
  if (!clientId || !email) return;
  if (!store.has(clientId)) store.set(clientId, new Map());
  const map = store.get(clientId);
  const prev = map.get(email) || { email, maxScore: 0, weight: 0, sources: new Set(), details: new Set() };
  prev.maxScore = Math.max(prev.maxScore, score);
  prev.weight += score;
  prev.sources.add(source);
  if (detail) prev.details.add(detail);
  map.set(email, prev);
}
function addFromText(store, ids, text, source, score, detail = "") {
  if (ids.length !== 1) return;
  for (const e of emailsIn(text)) addEvidence(store, ids[0], e, source, score, detail);
}
function candidateRank(a, b) {
  return b.maxScore - a.maxScore || b.sources.size - a.sources.size || b.weight - a.weight || a.email.localeCompare(b.email);
}
function choose(map) {
  const arr = [...(map?.values() || [])].sort(candidateRank);
  if (!arr.length) return { state: "missing" };
  const top = arr[0], second = arr[1];
  if (second && top.maxScore === second.maxScore && top.sources.size === second.sources.size && top.weight === second.weight) return { state: "conflict", top, second, all: arr };
  return { state: "selected", top, all: arr };
}
function provenanceLine(uid, chosen) {
  const src = [...chosen.sources].sort().join(",");
  return `[[LINE_OFC_EMAIL_V2:${uid}]] email_recovered=true sources=${src}`;
}
async function run({ apply = false, reportPath = "", assertIdempotent = false } = {}) {
  const at = new Airtable();
  const [clients, consoleRows, legacyRows, currentRows, historyRows, emailRows, members] = await Promise.all([
    at.list(TABLES.clients), at.list(TABLES.console), at.list(TABLES.legacyStaging), at.list(TABLES.currentStaging), at.list(TABLES.historicalEvidence), at.list(TABLES.emailIdentity), at.list(TABLES.members),
  ]);
  const realClients = clients.filter((r) => REAL_LINE.test(clean(r.fields?.line_user_id)));
  const byId = new Map(realClients.map((r) => [r.id, r]));
  const byLine = new Map(realClients.map((r) => [clean(r.fields?.line_user_id), r.id]));
  const evidence = new Map();

  // Existing canonical Client email is highest authority and is never overwritten.
  for (const r of realClients) {
    for (const e of [r.fields?.["Contact Email"], r.fields?.email]) {
      const v = validEmail(e); if (v) addEvidence(evidence, r.id, v, "client_existing", 100);
    }
    addFromText(evidence, [r.id], r.fields?.notes_raw, "client_notes", 78);
  }

  // Structured historical LINE evidence with an exact canonical Client link.
  for (const r of historyRows) {
    const ids = exactClientIds(r.fields || {}).filter((id) => byId.has(id));
    if (ids.length !== 1) continue;
    const primary = validEmail(pickField(r.fields, ["Primary Email Candidate"]));
    if (primary) addEvidence(evidence, ids[0], primary, "line_historical_structured", 96);
    for (const e of emailsIn(pickField(r.fields, ["Email Candidates"]))) addEvidence(evidence, ids[0], e, "line_historical_candidates", 92);
  }

  // Legacy staging contains Per's historical Notes/profile blocks. Require exact linked Client when available,
  // otherwise exact real LINE user ID -> canonical Client. Never use fuzzy/name-only matching for an email write.
  for (const r of legacyRows) {
    let ids = exactClientIds(r.fields || {}).filter((id) => byId.has(id));
    if (ids.length !== 1) {
      const uid = clean(pickField(r.fields, ["line_user_id", "LINE User ID"]), 80);
      const id = byLine.get(uid); ids = id ? [id] : [];
    }
    if (ids.length !== 1) continue;
    const direct = validEmail(pickField(r.fields, ["email_candidate", "Email Candidate", "email"]));
    if (direct) addEvidence(evidence, ids[0], direct, "legacy_staging_email", 97);
    addFromText(evidence, ids, pickField(r.fields, ["raw_note", "Raw Note", "notes"]), "legacy_staging_note", 94);
    addFromText(evidence, ids, pickField(r.fields, ["membership_parse_json"]), "legacy_staging_parse", 90);
  }

  // New privacy staging exact Client linkage.
  for (const r of currentRows) {
    const ids = exactClientIds(r.fields || {}).filter((id) => byId.has(id));
    if (ids.length !== 1) continue;
    const direct = validEmail(pickField(r.fields, ["Email", "email"]));
    if (direct) addEvidence(evidence, ids[0], direct, "current_staging_email", 96);
    addFromText(evidence, ids, pickField(r.fields, ["Raw LINE Notes", "raw_note"]), "current_staging_note", 93);
  }

  // Console Inbox: all rows are already canonical-linked from v1; now also parse payload_json, which v1 skipped.
  for (const r of consoleRows) {
    const ids = exactClientIds(r.fields || {}).filter((id) => byId.has(id));
    if (ids.length !== 1) continue;
    const direct = validEmail(pickField(r.fields, ["member_email"]));
    if (direct) addEvidence(evidence, ids[0], direct, "console_member_email", 95);
    addFromText(evidence, ids, pickField(r.fields, ["admin_note"]), "console_admin_note", 88);
    addFromText(evidence, ids, pickField(r.fields, ["payload_json"]), "console_payload_json", 91);
  }

  // Gmail identity staging may already contain exact matched_client evidence from either MMD mailbox.
  for (const r of emailRows) {
    const ids = exactClientIds(r.fields || {}).filter((id) => byId.has(id));
    if (ids.length !== 1) continue;
    const status = clean(pickField(r.fields, ["review_status"])).toLowerCase();
    const matchType = clean(pickField(r.fields, ["match_type"])).toLowerCase();
    if (/reject|blocked|ambiguous|no_match/.test(status + " " + matchType)) continue;
    const sender = validEmail(pickField(r.fields, ["sender_email"]));
    if (sender) addEvidence(evidence, ids[0], sender, "gmail_identity_staging", 93);
    addFromText(evidence, ids, pickField(r.fields, ["proposed_client_updates_json"]), "gmail_proposed_update", 94);
  }

  const report = {
    mode: apply ? "apply" : "dry_run",
    line_clients: realClients.length,
    before_with_valid_email: 0,
    selected_from_evidence: 0,
    conflicts: 0,
    still_missing: 0,
    planned_client_updates: 0,
    planned_member_updates: 0,
    source_hits: {},
    final_projected_coverage: 0,
  };
  const updates = [];
  const selectedByClient = new Map();
  for (const r of realClients) {
    const existing = validEmail(r.fields?.["Contact Email"]) || validEmail(r.fields?.email);
    if (existing) report.before_with_valid_email++;
    const c = choose(evidence.get(r.id));
    if (existing) {
      selectedByClient.set(r.id, existing);
      continue;
    }
    if (c.state === "conflict") { report.conflicts++; continue; }
    if (c.state !== "selected") { report.still_missing++; continue; }
    const chosen = c.top;
    selectedByClient.set(r.id, chosen.email);
    report.selected_from_evidence++;
    for (const s of chosen.sources) report.source_hits[s] = (report.source_hits[s] || 0) + 1;
    const uid = clean(r.fields?.line_user_id, 80);
    const oldNotes = clean(r.fields?.notes_raw);
    const marker = provenanceLine(uid, chosen);
    const fields = { "Contact Email": chosen.email, email: chosen.email };
    if (!oldNotes.includes(`[[LINE_OFC_EMAIL_V2:${uid}]]`)) fields.notes_raw = oldNotes ? `${oldNotes}\n${marker}` : marker;
    updates.push({ id: r.id, fields });
  }
  report.planned_client_updates = updates.length;
  report.final_projected_coverage = selectedByClient.size;
  report.still_missing = realClients.length - report.final_projected_coverage - report.conflicts;

  // Fill blank email fields of already-linked Member rows only. Never create Member/entitlement state.
  const memberUpdates = [];
  for (const m of members) {
    const links = linkIds(pickField(m.fields || {}, ["Clients", "Client", "Canonical Client"]));
    if (links.length !== 1) continue;
    const e = selectedByClient.get(links[0]);
    if (!e) continue;
    const current = validEmail(m.fields?.["Contact Email"]) || validEmail(m.fields?.email);
    if (current) continue;
    memberUpdates.push({ id: m.id, fields: { "Contact Email": e, email: e } });
  }
  report.planned_member_updates = memberUpdates.length;

  if (apply) {
    if (updates.length) await at.update(TABLES.clients, updates);
    if (memberUpdates.length) await at.update(TABLES.members, memberUpdates);
  }
  report.pending_mutations = report.planned_client_updates + report.planned_member_updates;
  report.completed_at = new Date().toISOString();
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report) + "\n");
  if (assertIdempotent && report.pending_mutations !== 0) throw new Error(`idempotency_failed:${report.pending_mutations}`);
  return report;
}
function selfTest() {
  assert.equal(validEmail("Person@Gmail.com"), "person@gmail.com");
  assert.equal(validEmail("mmdprive@gmail.com"), "");
  assert.equal(validEmail("smoke+1@example.com"), "");
  assert.deepEqual(emailsIn("Gmail: good.person@gmail.com / mmdprive@gmail.com"), ["good.person@gmail.com"]);
  const s = new Map(); addEvidence(s, "rec123", "a@gmail.com", "structured", 96); addEvidence(s, "rec123", "b@gmail.com", "note", 80);
  assert.equal(choose(s.get("rec123")).top.email, "a@gmail.com");
  process.stdout.write("self-test passed\n");
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) selfTest();
  else {
    const apply = args.includes("--apply");
    const i = args.indexOf("--report");
    run({ apply, reportPath: i >= 0 ? args[i + 1] : "", assertIdempotent: args.includes("--assert-idempotent") }).catch((e) => { console.error(e?.stack || e); process.exitCode = 1; });
  }
}
