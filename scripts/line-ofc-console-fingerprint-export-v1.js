#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

const AIRTABLE_API = "https://api.airtable.com/v0";
const BASE_ID = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const TOKEN = process.env.AIRTABLE_API_KEY || "";
const STAGING_TABLE = "tblOs8yyLK09SKrCt";
const INBOX_TABLE = "tblFHmfpB2TTrzO2e";
const OUTPUT = process.argv[2] || "/tmp/line-ofc-fingerprint-index-v1.json";

const F = {
  staging: {
    key: "fld7PhMqb4TS2efKp",
    uid: "fldjanE2xn2N46F5R",
  },
  inbox: {
    uid: "fldizotASR8QgtSVK",
    text: "fld9NbPo1Q3E6MfB8",
  },
};

const REAL_UID = /^U[0-9a-f]{32}$/i;
const MIN_NORMALIZED_LENGTH = 8;
const MAX_HASHES_PER_IDENTITY = 120;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function saltedHash(salt, value) {
  return crypto.createHash("sha256").update(salt).update("\0").update(value).digest("hex");
}

async function airtableList(tableId, fieldIds) {
  if (!TOKEN) throw new Error("missing_airtable_token");
  const out = [];
  let offset = "";
  do {
    const url = new URL(`${AIRTABLE_API}/${BASE_ID}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const fieldId of fieldIds) url.searchParams.append("fields[]", fieldId);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`airtable_${tableId}_${res.status}:${body.slice(0, 160)}`);
    }
    const data = await res.json();
    out.push(...(data.records || []));
    offset = data.offset || "";
  } while (offset);
  return out;
}

function rankStagingKey(key) {
  const v = String(key || "");
  if (v.startsWith("line_ofc_contact_v1_")) return 0;
  if (v.startsWith("line_ofc_identity_")) return 1;
  return 2;
}

async function main() {
  const salt = crypto.randomBytes(24).toString("hex");
  const staging = await airtableList(STAGING_TABLE, [F.staging.key, F.staging.uid]);

  const representativeByUid = new Map();
  for (const record of staging) {
    const fields = record.fields || {};
    const uid = normalizeText(fields[F.staging.uid]);
    if (!REAL_UID.test(uid)) continue;
    const key = normalizeText(fields[F.staging.key]);
    const current = representativeByUid.get(uid);
    const candidate = { recordId: record.id, key, rank: rankStagingKey(key) };
    if (!current || candidate.rank < current.rank || (candidate.rank === current.rank && candidate.key < current.key)) {
      representativeByUid.set(uid, candidate);
    }
  }

  const inbox = await airtableList(INBOX_TABLE, [F.inbox.uid, F.inbox.text]);
  const hashesByUid = new Map();
  const ownersByHash = new Map();
  let inboxRowsForKnownUid = 0;
  let eligibleTextRows = 0;

  for (const record of inbox) {
    const fields = record.fields || {};
    const uid = normalizeText(fields[F.inbox.uid]);
    if (!representativeByUid.has(uid)) continue;
    inboxRowsForKnownUid++;
    const text = normalizeText(fields[F.inbox.text]);
    if (text.length < MIN_NORMALIZED_LENGTH) continue;
    eligibleTextRows++;
    const hash = saltedHash(salt, text);
    if (!hashesByUid.has(uid)) hashesByUid.set(uid, new Map());
    const currentLength = hashesByUid.get(uid).get(hash) || 0;
    if (text.length > currentLength) hashesByUid.get(uid).set(hash, text.length);
    if (!ownersByHash.has(hash)) ownersByHash.set(hash, new Set());
    ownersByHash.get(hash).add(uid);
  }

  const identities = [];
  let identitiesWithUniqueFingerprints = 0;
  let uniqueFingerprintCount = 0;
  for (const [uid, representative] of representativeByUid) {
    const candidates = [...(hashesByUid.get(uid) || new Map()).entries()]
      .filter(([hash]) => (ownersByHash.get(hash)?.size || 0) === 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_HASHES_PER_IDENTITY)
      .map(([hash]) => hash);
    if (candidates.length) identitiesWithUniqueFingerprints++;
    uniqueFingerprintCount += candidates.length;
    identities.push({
      handle: representative.recordId,
      fingerprint_count: candidates.length,
      hashes: candidates,
    });
  }

  identities.sort((a, b) => a.handle.localeCompare(b.handle));
  const payload = {
    version: "line-ofc-console-fingerprint-index-v1",
    generated_at: new Date().toISOString(),
    normalization: "NFKC + collapse whitespace + trim",
    salt,
    counts: {
      staging_rows: staging.length,
      unique_staging_line_user_ids: representativeByUid.size,
      console_inbox_rows: inbox.length,
      console_rows_for_known_line_user_ids: inboxRowsForKnownUid,
      eligible_text_rows: eligibleTextRows,
      identities_with_unique_fingerprints: identitiesWithUniqueFingerprints,
      identities_without_unique_fingerprints: representativeByUid.size - identitiesWithUniqueFingerprints,
      unique_fingerprints_exported: uniqueFingerprintCount,
    },
    identities,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(payload));
  process.stdout.write(JSON.stringify({
    ok: true,
    version: payload.version,
    output: OUTPUT,
    counts: payload.counts,
    raw_text_exported: false,
    line_user_id_exported: false,
  }) + "\n");
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exitCode = 1;
});
