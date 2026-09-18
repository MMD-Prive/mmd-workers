#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const zlib = require("node:zlib");
const fs = require("node:fs");

const API = "https://api.airtable.com/v0";
const BASE = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const TABLES = {
  source: "tblUXJvU47SzdVUwy",
  inbox: "tblFHmfpB2TTrzO2e",
  results: "tblkJST2MefkSZ43i",
};
const F = {
  source: {
    id: "fldoeByeRJ9AC2jVa",
    snapshot: "fld0DtHYItVLkHPYN",
    encoding: "fld7aZ5tjl8D5rwaP",
    index: "fld9zr3T7C9CcHwP5",
    total: "fldXus1nYGgrRmGPG",
    payload: "fldiU8tW2SiJH6ErX",
    chunkSha: "fldcIyu3Lf4hj64ui",
    fullSha: "fldCwnBuIt2Chelyp",
    status: "fldotTefHDjZQGIVn",
  },
  inbox: {
    uid: "fldizotASR8QgtSVK",
    payload: "fldn7MS0D9cdyQLtF",
  },
  result: {
    key: "fldt93c9z1XTBWW3D",
    snapshot: "fldptBC8bDXPIkRCO",
    chatRef: "fldZZTSCl54SeZxE0",
    rename: "fldrkQZPNyF6KbIB2",
    uid: "fldCJIm9WO6OouPST",
    status: "fldLDMwXydtm2HCwv",
    required: "fldfqi2ugZZTTwu1J",
    hits: "fldrrw1GRRkrHLxsP",
    candidates: "fld6v3Lboztg3zdhe",
    sourceSha: "fldECrmGuCqQQCrF4",
    note: "fldgtkr5FbfArGtMY",
  },
};
const REAL_UID = /^U[0-9a-f]{32}$/i;
const UNKNOWN = /^(?:unknown|ไม่ทราบ|ไม่ทราบชื่อ|-)?$/i;
const MATCH_STATUS = "ready_match";

function clean(v, n = 200000) {
  return String(v ?? "").replace(/\0/g, "").trim().slice(0, n);
}
function sha(v) {
  return crypto.createHash("sha256").update(String(v), "utf8").digest("hex");
}
function boolArg(name) {
  return process.argv.includes(name);
}
function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? clean(process.argv[i + 1], 1000) : "";
}
function parseJson(v) {
  try { return JSON.parse(String(v || "")); } catch (_) { return null; }
}
function sourceRowHash(snapshot, row) {
  return sha(JSON.stringify({ snapshot, r: row.r, n: row.n, u: row.u, e: row.e || [] }));
}

class Airtable {
  constructor() {
    this.token = clean(process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN, 3000);
    if (!this.token) throw new Error("airtable_not_configured");
  }
  async request(path, init = {}) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const url = new URL(`${API}/${BASE}/${path}`);
      if ((init.method || "GET") === "GET") url.searchParams.set("returnFieldsByFieldId", "true");
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
      });
      if (res.ok) return res.json();
      if (![429, 500, 502, 503, 504].includes(res.status) || attempt === 4) {
        throw new Error(`airtable_${res.status}`);
      }
      await new Promise((r) => setTimeout(r, 350 * (2 ** attempt)));
    }
  }
  async list(table, fields = []) {
    const out = [];
    let offset = "";
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
  async batchCreate(table, records) {
    for (let i = 0; i < records.length; i += 10) {
      await this.request(table, {
        method: "POST",
        body: JSON.stringify({ records: records.slice(i, i + 10).map((fields) => ({ fields })) }),
      });
    }
  }
  async batchUpdate(table, records) {
    for (let i = 0; i < records.length; i += 10) {
      await this.request(table, {
        method: "PATCH",
        body: JSON.stringify({ records: records.slice(i, i + 10) }),
      });
    }
  }
}

function decodeManifest(sourceRecords) {
  const chunks = sourceRecords
    .map((r) => ({ id: r.id, ...(r.fields || {}) }))
    .filter((f) => clean(f[F.source.status], 80) === MATCH_STATUS)
    .sort((a, b) => Number(a[F.source.index] || 0) - Number(b[F.source.index] || 0));
  if (!chunks.length) throw new Error("matcher_source_chunks_missing");
  const total = Number(chunks[0][F.source.total] || 0);
  if (!total || chunks.length !== total) throw new Error(`matcher_source_incomplete_${chunks.length}_of_${total || 0}`);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (Number(c[F.source.index]) !== i + 1) throw new Error("matcher_source_chunk_order_invalid");
    if (Number(c[F.source.total]) !== total) throw new Error("matcher_source_chunk_total_mismatch");
    const payload = clean(c[F.source.payload]);
    if (!payload || sha(payload) !== clean(c[F.source.chunkSha], 80)) throw new Error(`matcher_chunk_sha_invalid_${i + 1}`);
  }
  const full = chunks.map((c) => clean(c[F.source.payload])).join("");
  const expectedFull = clean(chunks[0][F.source.fullSha], 80);
  if (!expectedFull || chunks.some((c) => clean(c[F.source.fullSha], 80) !== expectedFull)) {
    throw new Error("matcher_full_sha_metadata_mismatch");
  }
  if (sha(full) !== expectedFull) throw new Error("matcher_full_sha_invalid");
  const parsed = JSON.parse(zlib.gunzipSync(Buffer.from(full, "base64")).toString("utf8"));
  if (!parsed || !Array.isArray(parsed.rows) || parsed.v !== "line-ofc-per-rename-manifest-v1") {
    throw new Error("matcher_manifest_invalid");
  }
  return { manifest: parsed, fullSha: expectedFull };
}

function buildInboxIndex(records) {
  const index = new Map();
  let usableEvents = 0;
  let invalidPayload = 0;
  let invalidUid = 0;
  for (const record of records) {
    const f = record.fields || {};
    const payload = parseJson(f[F.inbox.payload]);
    if (!payload) { invalidPayload++; continue; }
    const lineEvent = payload.line_event || payload.lineEvent || {};
    const message = lineEvent.message || {};
    const text = typeof message.text === "string" ? message.text : typeof payload.raw_text === "string" ? payload.raw_text : "";
    const uid = clean(lineEvent?.source?.userId || payload.source_user_id || f[F.inbox.uid], 80);
    const ms = Number(lineEvent.timestamp || 0);
    if (!REAL_UID.test(uid)) { invalidUid++; continue; }
    if (!text || !Number.isFinite(ms) || ms <= 0) continue;
    const second = Math.floor(ms / 1000);
    const key = `${second}:${sha(text)}`;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(uid);
    usableEvents++;
  }
  return { index, usableEvents, invalidPayload, invalidUid };
}

function matchManifest(manifest, inboxIndex, fullSha) {
  const results = [];
  const counts = {
    source_chat_rows: manifest.rows.length,
    source_snapshot_total_chats: Number(manifest.count || 0),
    exact_matches: 0,
    ambiguous_matches: 0,
    unmatched: 0,
    unknown_name_rows: 0,
    exact_named_matches: 0,
    exact_unknown_name_matches: 0,
    evidence_items: 0,
    evidence_hits: 0,
  };
  for (const row of manifest.rows) {
    const evidence = Array.isArray(row.e) ? row.e : [];
    counts.evidence_items += evidence.length;
    const hitUids = new Set();
    let evidenceHits = 0;
    for (const e of evidence) {
      const t = Number(e.t || 0);
      const h = clean(e.h, 80);
      if (!t || !/^[0-9a-f]{64}$/i.test(h)) continue;
      const perEvidence = new Set();
      for (const dt of [-1, 0, 1]) {
        const s = inboxIndex.get(`${t + dt}:${h}`);
        if (s) for (const uid of s) perEvidence.add(uid);
      }
      if (perEvidence.size) evidenceHits++;
      for (const uid of perEvidence) hitUids.add(uid);
    }
    counts.evidence_hits += evidenceHits;
    const rename = clean(row.n, 500);
    const unknown = Boolean(row.u) || UNKNOWN.test(rename);
    if (unknown) counts.unknown_name_rows++;
    let status = "unmatched";
    let uid = "";
    if (hitUids.size === 1 && evidenceHits >= 1) {
      uid = [...hitUids][0];
      status = unknown ? "exact_unknown_name" : "exact";
      counts.exact_matches++;
      if (unknown) counts.exact_unknown_name_matches++;
      else counts.exact_named_matches++;
    } else if (hitUids.size > 1) {
      status = "ambiguous";
      counts.ambiguous_matches++;
    } else {
      counts.unmatched++;
    }
    results.push({
      key: `line_oa_per_rename_20260906_${Number(row.r)}`,
      snapshot: clean(manifest.snapshot, 100),
      chatRef: Number(row.r),
      rename,
      uid,
      status,
      required: evidence.length ? 1 : 0,
      hits: evidenceHits,
      candidates: hitUids.size,
      sourceSha: sourceRowHash(clean(manifest.snapshot, 100), row),
      note: status === "exact"
        ? "Exact transcript SHA-256 + LINE event timestamp evidence resolved to one LINE User ID. Identity/search evidence only."
        : status === "exact_unknown_name"
          ? "Exact LINE User ID evidence found, but exported chat rename is Unknown; do not use as Per Rename alias."
          : status === "ambiguous"
            ? "Evidence points to more than one LINE User ID; review required."
            : "No exact transcript/timestamp identity evidence found in Console Inbox; keep unmatched.",
      fullSha,
    });
  }
  return { results, counts };
}

function resultFields(r) {
  return {
    [F.result.key]: r.key,
    [F.result.snapshot]: r.snapshot,
    [F.result.chatRef]: r.chatRef,
    [F.result.rename]: r.rename,
    [F.result.uid]: r.uid,
    [F.result.status]: r.status,
    [F.result.required]: r.required,
    [F.result.hits]: r.hits,
    [F.result.candidates]: r.candidates,
    [F.result.sourceSha]: r.sourceSha,
    [F.result.note]: r.note,
  };
}
function same(a, b) {
  return String(a ?? "") === String(b ?? "");
}
async function persistResults(air, results) {
  const existing = await air.list(TABLES.results, Object.values(F.result));
  const byKey = new Map(existing.map((r) => [clean(r.fields?.[F.result.key], 200), r]));
  const creates = [];
  const updates = [];
  let noop = 0;
  for (const r of results) {
    const fields = resultFields(r);
    const current = byKey.get(r.key);
    if (!current) { creates.push(fields); continue; }
    let changed = false;
    for (const [k, v] of Object.entries(fields)) {
      if (!same(current.fields?.[k], v)) { changed = true; break; }
    }
    if (changed) updates.push({ id: current.id, fields });
    else noop++;
  }
  await air.batchCreate(TABLES.results, creates);
  await air.batchUpdate(TABLES.results, updates);
  return { created: creates.length, updated: updates.length, noop };
}

function selfTest() {
  const text = "ผมขอ id line ไว้หน่อยได้ไหมคับ";
  const expected = "11b468c294f5b1a0787141841c73657347b497014f0826b0235e4be9baab426e";
  if (sha(text) !== expected) throw new Error("self_test_hash_failed");
  const uid = "U9ae902e1d7f6fefe7743346ea4b03ce2";
  const idx = new Map([[`1776588954:${expected}`, new Set([uid])]]);
  const manifest = {
    v: "line-ofc-per-rename-manifest-v1",
    snapshot: "2026-09-06T05:44:00+09:00",
    count: 1,
    rows: [{ r: 1, n: "Example Rename", u: false, e: [{ t: 1776588954, h: expected, l: 30 }] }],
  };
  const { results, counts } = matchManifest(manifest, idx, "x");
  if (counts.exact_named_matches !== 1 || results[0].uid !== uid || results[0].status !== "exact") {
    throw new Error("self_test_match_failed");
  }
  console.log(JSON.stringify({ ok: true, self_test: true }));
}

async function main() {
  if (boolArg("--self-test")) return selfTest();
  const apply = boolArg("--apply-results");
  const reportPath = argValue("--report");
  const air = new Airtable();
  const source = await air.list(TABLES.source, Object.values(F.source));
  const { manifest, fullSha } = decodeManifest(source);
  const inbox = await air.list(TABLES.inbox, Object.values(F.inbox));
  const built = buildInboxIndex(inbox);
  const matched = matchManifest(manifest, built.index, fullSha);
  const writeCounts = apply ? await persistResults(air, matched.results) : { created: 0, updated: 0, noop: 0 };
  const report = {
    ok: true,
    mode: apply ? "apply_results" : "dry_run",
    source_full_sha256: fullSha,
    inbox_records: inbox.length,
    usable_line_text_events: built.usableEvents,
    invalid_inbox_payloads: built.invalidPayload,
    invalid_inbox_uids: built.invalidUid,
    ...matched.counts,
    result_writes: writeCounts,
  };
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: clean(err?.message || err, 300) }));
  process.exit(1);
});
