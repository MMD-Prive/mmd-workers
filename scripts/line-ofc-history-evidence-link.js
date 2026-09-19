#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");

const API = "https://api.airtable.com/v0";
const BASE = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const TABLES = {
  clients: "tblVv58TCbwh5j1fS",
  console: "tblFHmfpB2TTrzO2e",
  history: "tbl4wqlFG9Ovmtp4c",
};
const REAL_LINE = /^U[0-9a-f]{32}$/i;
const REC = /^rec[A-Za-z0-9]{14}$/;
const INTERNAL_EMAILS = new Set(["malemodel.bkk@gmail.com", "mmdprive@gmail.com"]);
const clean = (v, n = 100000) => String(v ?? "").replace(/\0/g, "").trim().slice(0, n);
const links = (v) => Array.isArray(v) ? v.map((x) => clean(typeof x === "object" ? x.id : x, 80)).filter((x) => REC.test(x)) : [];
function email(v) {
  const x = clean(v, 254).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i.test(x)) return "";
  if (INTERNAL_EMAILS.has(x) || /(?:^|\.)(?:example\.com|example\.invalid|invalid|localhost)$/i.test(x.split("@")[1] || "")) return "";
  return x;
}
function phone(v) {
  const raw = clean(v, 80);
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (/^0[689]\d{8}$/.test(digits)) return `+66${digits.slice(1)}`;
  if (/^66[689]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^[689]\d{8}$/.test(digits)) return `+66${digits}`;
  if (raw.startsWith("+") && /^\d{8,15}$/.test(digits)) return `+${digits}`;
  return "";
}
function telegram(v) {
  const raw = clean(v, 120);
  const m = raw.match(/@([A-Za-z0-9_]{5,32})/);
  return m ? `@${m[1].toLowerCase()}` : "";
}
function handle(v) {
  let x = clean(v, 160).normalize("NFKC").toLowerCase();
  x = x.replace(/^https?:\/\/line\.me\/ti\/p\//, "").replace(/^@/, "").trim();
  if (!x || x === "-" || x === "no" || /^\d{9,15}$/.test(x) || /\s/.test(x)) return "";
  return /^[a-z0-9._-]{3,64}$/i.test(x) ? x : "";
}
function exactField(fields, names) {
  const m = new Map(Object.keys(fields || {}).map((k) => [k.toLowerCase(), k]));
  for (const n of names) {
    const k = m.get(n.toLowerCase());
    if (k) return fields[k];
  }
  return undefined;
}
function addIndex(index, key, clientId) {
  if (!key || !clientId) return;
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(clientId);
}
function getSet(index, key) { return key && index.has(key) ? new Set(index.get(key)) : new Set(); }
function unique(set) { return set.size === 1 ? [...set][0] : ""; }
function union(sets) { const out = new Set(); for (const s of sets) for (const v of s) out.add(v); return out; }

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
    const all = []; let offset = "";
    do {
      const d = await this.request(table, { query: { pageSize: 100, ...(offset ? { offset } : {}) } });
      all.push(...(d.records || [])); offset = clean(d.offset, 500);
    } while (offset);
    return all;
  }
  async update(table, rows) {
    for (let i = 0; i < rows.length; i += 10) {
      await this.request(table, { method: "PATCH", body: { records: rows.slice(i, i + 10), typecast: false } });
    }
  }
}

function buildIndexes(realClients, consoleRows) {
  const byId = new Map(realClients.map((r) => [r.id, r]));
  const I = { email: new Map(), phone: new Map(), telegram: new Map(), handle: new Map() };
  for (const r of realClients) {
    const f = r.fields || {};
    addIndex(I.email, email(f["Contact Email"] || f.email), r.id);
    addIndex(I.phone, phone(f["Phone Number"] || f.phone), r.id);
    addIndex(I.telegram, telegram(f.telegram_username || f.username), r.id);
    addIndex(I.handle, handle(f.username), r.id);
  }
  let consoleExactRows = 0;
  for (const r of consoleRows) {
    const f = r.fields || {};
    const ids = links(f["Canonical Client"] || f.canonical_client || f.matched_client).filter((id) => byId.has(id));
    if (ids.length !== 1) continue;
    consoleExactRows++;
    const id = ids[0];
    addIndex(I.email, email(f.member_email), id);
    addIndex(I.phone, phone(f.member_phone), id);
    addIndex(I.telegram, telegram(f.telegram_username), id);
    addIndex(I.handle, handle(f.line_id), id);
  }
  return { I, byId, consoleExactRows };
}

function resolveHistory(row, I) {
  const f = row.fields || {};
  const e = email(exactField(f, ["Primary Email Candidate"]));
  const p = phone(exactField(f, ["Primary Phone Candidate"]));
  const t = telegram(exactField(f, ["Telegram Candidates"]));
  const h = handle(exactField(f, ["LINE ID Candidates"]));
  const strong = [
    ["email", e, getSet(I.email, e)],
    ["phone", p, getSet(I.phone, p)],
    ["telegram", t, getSet(I.telegram, t)],
    ["line_handle", h, getSet(I.handle, h)],
  ].filter(([, key, set]) => key && set.size);
  const strongUnion = union(strong.map((x) => x[2]));
  if (strongUnion.size === 1) {
    const id = unique(strongUnion);
    const signals = strong.filter((x) => x[2].has(id)).map((x) => x[0]);
    return { state: "matched", id, score: signals.length >= 2 ? 100 : 97, reason: `exact_${signals.join("+")}` };
  }
  if (strongUnion.size > 1) return { state: "conflict", reason: "conflicting_exact_contact_signals" };
  return { state: "unmatched", reason: "no_exact_contact_signal" };
}

async function run({ apply = false, reportPath = "", assertIdempotent = false } = {}) {
  const at = new Airtable();
  const [clients, consoleRows, historyRows] = await Promise.all([at.list(TABLES.clients), at.list(TABLES.console), at.list(TABLES.history)]);
  const realClients = clients.filter((r) => REAL_LINE.test(clean(r.fields?.line_user_id)));
  const { I, byId, consoleExactRows } = buildIndexes(realClients, consoleRows);
  const report = { mode: apply ? "apply" : "dry_run", line_clients: realClients.length, console_exact_rows: consoleExactRows, history_rows: historyRows.length, already_linked: 0, matched_exact_contact: 0, ambiguous: 0, unmatched: 0, planned_history_updates: 0, reason_counts: {} };
  const updates = [];
  for (const r of historyRows) {
    const existing = links(exactField(r.fields || {}, ["Canonical Client"])).filter((id) => byId.has(id));
    if (existing.length === 1) { report.already_linked++; continue; }
    const z = resolveHistory(r, I);
    report.reason_counts[z.reason] = (report.reason_counts[z.reason] || 0) + 1;
    if (z.state === "matched") {
      report.matched_exact_contact++;
      updates.push({ id: r.id, fields: { "Canonical Client": [z.id], "Match Status": "matched", "Match Score": z.score, "Match Reason": z.reason } });
    } else if (z.state === "conflict") report.ambiguous++;
    else report.unmatched++;
  }
  report.planned_history_updates = updates.length;
  if (apply && updates.length) await at.update(TABLES.history, updates);
  report.pending_mutations = updates.length;
  report.completed_at = new Date().toISOString();
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report) + "\n");
  if (assertIdempotent && report.pending_mutations !== 0) throw new Error(`idempotency_failed:${report.pending_mutations}`);
  return report;
}

function selfTest() {
  assert.equal(phone("098-550-1084"), "+66985501084");
  assert.equal(telegram("TG @User_Name"), "@user_name");
  assert.equal(handle("Bhutorn"), "bhutorn");
  const I = { email: new Map(), phone: new Map(), telegram: new Map(), handle: new Map() };
  addIndex(I.phone, "+66985501084", "rec12345678901234");
  const exact = resolveHistory({ fields: { "Primary Phone Candidate": "+66985501084" } }, I);
  assert.equal(exact.id, "rec12345678901234");
  const namesOnly = resolveHistory({ fields: { "Customer Label": "แมค VIP", "Nickname Candidates": "แมค" } }, I);
  assert.equal(namesOnly.state, "unmatched");
  process.stdout.write("self-test passed\n");
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) selfTest();
  else {
    const i = args.indexOf("--report");
    run({ apply: args.includes("--apply"), reportPath: i >= 0 ? args[i + 1] : "", assertIdempotent: args.includes("--assert-idempotent") }).catch((e) => { console.error(e?.stack || e); process.exitCode = 1; });
  }
}
