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
    raw: "fldn7MS0D9cdyQLtF",
    received: "fldvkKwCgOtDq0UNn",
  },
};

const REAL_UID = /^U[0-9a-f]{32}$/i;
const MIN_NORMALIZED_LENGTH = 8;
const MAX_HASHES_PER_IDENTITY = 120;
const MAX_TIMED_HASHES_PER_IDENTITY = 300;
const MAX_WINDOW_HASHES_PER_IDENTITY = 1600;
const RECEIVE_WINDOW_BEFORE_SECONDS = 15;
const RECEIVE_WINDOW_AFTER_SECONDS = 2;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function saltedHash(salt, value) {
  return crypto.createHash("sha256").update(salt).update("\0").update(value).digest("hex");
}

function eventSecondFromRaw(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return null;
  }
  const timestamp = Number(data?.line_event?.timestamp ?? data?.lineEvent?.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return Math.floor(timestamp > 1e11 ? timestamp / 1000 : timestamp);
}

function receivedSecond(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : null;
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

function addOwnedHash(mapByUid, ownersByHash, uid, hash, length) {
  if (!mapByUid.has(uid)) mapByUid.set(uid, new Map());
  const currentLength = mapByUid.get(uid).get(hash) || 0;
  if (length > currentLength) mapByUid.get(uid).set(hash, length);
  if (!ownersByHash.has(hash)) ownersByHash.set(hash, new Set());
  ownersByHash.get(hash).add(uid);
}

function uniqueCandidates(mapByUid, ownersByHash, uid, limit) {
  return [...(mapByUid.get(uid) || new Map()).entries()]
    .filter(([hash]) => (ownersByHash.get(hash)?.size || 0) === 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([hash]) => hash);
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

  const inbox = await airtableList(INBOX_TABLE, [F.inbox.uid, F.inbox.text, F.inbox.raw, F.inbox.received]);
  const hashesByUid = new Map();
  const ownersByHash = new Map();
  const timedHashesByUid = new Map();
  const ownersByTimedHash = new Map();
  const windowHashesByUid = new Map();
  const ownersByWindowHash = new Map();
  let inboxRowsForKnownUid = 0;
  let eligibleTextRows = 0;
  let timedFingerprintRows = 0;
  let receivedWindowRows = 0;

  for (const record of inbox) {
    const fields = record.fields || {};
    const uid = normalizeText(fields[F.inbox.uid]);
    if (!representativeByUid.has(uid)) continue;
    inboxRowsForKnownUid++;
    const text = normalizeText(fields[F.inbox.text]);
    if (text) {
      const eventSecond = eventSecondFromRaw(fields[F.inbox.raw]);
      if (eventSecond !== null) {
        timedFingerprintRows++;
        addOwnedHash(
          timedHashesByUid,
          ownersByTimedHash,
          uid,
          saltedHash(salt, `ts:${eventSecond}\0${text}`),
          text.length
        );
      }
      const received = receivedSecond(fields[F.inbox.received]);
      if (received !== null) {
        receivedWindowRows++;
        for (let delta = -RECEIVE_WINDOW_BEFORE_SECONDS; delta <= RECEIVE_WINDOW_AFTER_SECONDS; delta++) {
          addOwnedHash(
            windowHashesByUid,
            ownersByWindowHash,
            uid,
            saltedHash(salt, `ts:${received + delta}\0${text}`),
            text.length
          );
        }
      }
    }
    if (text.length < MIN_NORMALIZED_LENGTH) continue;
    eligibleTextRows++;
    addOwnedHash(hashesByUid, ownersByHash, uid, saltedHash(salt, text), text.length);
  }

  const identities = [];
  let identitiesWithUniqueFingerprints = 0;
  let identitiesWithUniqueTimedFingerprints = 0;
  let identitiesWithUniqueReceivedWindowFingerprints = 0;
  let uniqueFingerprintCount = 0;
  let uniqueTimedFingerprintCount = 0;
  let uniqueReceivedWindowFingerprintCount = 0;
  for (const [uid, representative] of representativeByUid) {
    const candidates = uniqueCandidates(hashesByUid, ownersByHash, uid, MAX_HASHES_PER_IDENTITY);
    const timedCandidates = uniqueCandidates(timedHashesByUid, ownersByTimedHash, uid, MAX_TIMED_HASHES_PER_IDENTITY);
    const windowCandidates = uniqueCandidates(windowHashesByUid, ownersByWindowHash, uid, MAX_WINDOW_HASHES_PER_IDENTITY);
    if (candidates.length) identitiesWithUniqueFingerprints++;
    if (timedCandidates.length) identitiesWithUniqueTimedFingerprints++;
    if (windowCandidates.length) identitiesWithUniqueReceivedWindowFingerprints++;
    uniqueFingerprintCount += candidates.length;
    uniqueTimedFingerprintCount += timedCandidates.length;
    uniqueReceivedWindowFingerprintCount += windowCandidates.length;
    identities.push({
      handle: representative.recordId,
      fingerprint_count: candidates.length,
      timed_fingerprint_count: timedCandidates.length,
      window_fingerprint_count: windowCandidates.length,
      hashes: candidates,
      timed_hashes: timedCandidates,
      window_hashes: windowCandidates,
    });
  }

  identities.sort((a, b) => a.handle.localeCompare(b.handle));
  const payload = {
    version: "line-ofc-console-fingerprint-index-v1.2",
    generated_at: new Date().toISOString(),
    normalization: "NFKC + collapse whitespace + trim",
    timed_fingerprint: "LINE event epoch-second + normalized text",
    received_window_fingerprint: `received_at candidate seconds -${RECEIVE_WINDOW_BEFORE_SECONDS}..+${RECEIVE_WINDOW_AFTER_SECONDS} + normalized text`,
    salt,
    counts: {
      staging_rows: staging.length,
      unique_staging_line_user_ids: representativeByUid.size,
      console_inbox_rows: inbox.length,
      console_rows_for_known_line_user_ids: inboxRowsForKnownUid,
      eligible_text_rows: eligibleTextRows,
      timed_fingerprint_rows: timedFingerprintRows,
      received_window_rows: receivedWindowRows,
      identities_with_unique_fingerprints: identitiesWithUniqueFingerprints,
      identities_without_unique_fingerprints: representativeByUid.size - identitiesWithUniqueFingerprints,
      identities_with_unique_timed_fingerprints: identitiesWithUniqueTimedFingerprints,
      identities_without_unique_timed_fingerprints: representativeByUid.size - identitiesWithUniqueTimedFingerprints,
      identities_with_unique_received_window_fingerprints: identitiesWithUniqueReceivedWindowFingerprints,
      identities_without_unique_received_window_fingerprints: representativeByUid.size - identitiesWithUniqueReceivedWindowFingerprints,
      unique_fingerprints_exported: uniqueFingerprintCount,
      unique_timed_fingerprints_exported: uniqueTimedFingerprintCount,
      unique_received_window_fingerprints_exported: uniqueReceivedWindowFingerprintCount,
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
    event_timestamp_exported: false,
    received_at_exported: false,
  }) + "\n");
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  process.exitCode = 1;
});
