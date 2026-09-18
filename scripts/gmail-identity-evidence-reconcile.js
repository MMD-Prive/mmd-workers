#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");

const AIRTABLE_API = "https://api.airtable.com/v0";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const BASE = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const SEARCH_QUERY = 'from:drive-shares-dm-noreply@google.com subject:"Share request for" -in:spam -in:trash';
const BATCH_KEY = "gmail_drive_reconcile_v1";
const SOURCE_TYPE = "gmail_folder_invite";
const APPROVED_ACCESS_STATUS = "approved_evidence";
const INTERNAL_EMAILS = new Set(["malemodel.bkk@gmail.com", "mmdprive@gmail.com"]);
const GOOGLE_SYSTEM_DOMAINS = new Set(["google.com", "googlemail.com"]);
const REC = /^rec[A-Za-z0-9]{14}$/;

const TABLES = Object.freeze({
  clients: "tblVv58TCbwh5j1fS",
  historicalEvidence: "tbl4wqlFG9Ovmtp4c",
  staging: "tblXAPkTK6KzUmFBD",
  accessEvidence: "tbl7ZfZzVu6nQOS1n",
});

const F = Object.freeze({
  clients: Object.freeze({
    name: "fldrHqkGQzvBLRxlP",
    contactEmail: "fldQ8TKFjyxs0Cjrk",
    lineUserId: "fld5HfSGChKFbd4uh",
    compatEmail: "fldbAlmCs8VpI9Clw",
  }),
  historical: Object.freeze({
    primaryEmail: "fldm3yZbdMfBr6plM",
    client: "fldCgJySJI8ArvjGv",
    matchStatus: "fld6zIrxafGZE79qJ",
    matchReason: "fldsAanki33CxCqNF",
  }),
  staging: Object.freeze({
    stagingId: "fldia4f7scUMA8paC",
    sourceAccount: "fldveSjt6uckxSkQh",
    messageId: "fldZ1AaJJ096CXUpD",
    threadId: "fldX6EW2QYoNx8WqW",
    senderEmail: "fldq7Xf8IdvfoJRcp",
    senderName: "fld33bPkRRGycggNU",
    subject: "fldTXGun0nNwrekct",
    snippet: "fldwKZK0qfD8AIGXP",
    emailDate: "fldo57oJcSiZ9RIGt",
    matchedClient: "fldhRHfsA9HtBiO1y",
    matchType: "fldeT3VJQJWQc8wMr",
    confidence: "fld0RMYVI96KcTEQt",
    reviewStatus: "fld20lKuYfjnqEhHX",
    batchKey: "fld2xI01Bd6qfuFmG",
    reviewActor: "fldTanSMSzrZ0rO5V",
  }),
  access: Object.freeze({
    evidenceId: "fldBeTf0MP8WSuPxA",
    client: "fldvf5oQMeetKPAM9",
    sourceType: "fldxTRDiJ3OBMKz9v",
    sourceGmailAccount: "fldeuVqTZGDOcY9v6",
    gmailMessageId: "fldhRSMurUJiH9W7T",
    identityEmail: "flddqGQcrlTRZl8d5",
    reviewStatus: "fldukVc0xg2zPfgJJ",
    requesterEmail: "fldTaArdfL79QXWBB",
    requesterName: "fldmrpPEUORHuhGZm",
    evidenceDatetime: "fldK6etoPfa4qhERM",
    gmailThreadId: "fldUF5tnwNFrGGm86",
    subject: "fldRohjyy6oXTCjLQ",
    confidence: "fld02jKhHn5nrBNSr",
    reconciliationNotes: "fldC6t4yeWPVActnE",
    metadataJson: "fldPjCxGUUsPhM1Gr",
  }),
});

const MAILBOXES = Object.freeze([
  Object.freeze({
    email: "malemodel.bkk@gmail.com",
    slug: "malemodel",
    refreshEnv: "GOOGLE_GMAIL_MALEMODEL_REFRESH_TOKEN",
    legacyRefreshEnv: "GOOGLE_DRIVE_REFRESH_TOKEN",
  }),
  Object.freeze({
    email: "mmdprive@gmail.com",
    slug: "mmdprive",
    refreshEnv: "GOOGLE_GMAIL_MMDPRIVE_REFRESH_TOKEN",
    legacyRefreshEnv: "GOOGLE_DRIVE_FALLBACK_REFRESH_TOKEN",
  }),
]);

const clean = (value, max = 100000) => String(value ?? "").replace(/\0/g, "").trim().slice(0, max);
const normalizeStatus = (value) => clean(value, 120).toLowerCase().replace(/[\s-]+/g, "_");
const linkIds = (value) => Array.isArray(value)
  ? value.map((item) => clean(typeof item === "object" ? item?.id : item, 80)).filter((id) => REC.test(id))
  : [];

function validEmail(value, { allowInternal = false } = {}) {
  const email = clean(value, 254).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i.test(email)) return "";
  if (!allowInternal && INTERNAL_EMAILS.has(email)) return "";
  const [local = "", domain = ""] = email.split("@");
  if (/(?:^|\.)(?:example\.com|example\.invalid|invalid|localhost)$/i.test(domain)) return "";
  if (/(?:noreply|no-reply|do-not-reply|donotreply|mailer-daemon)/i.test(local)) return "";
  return email;
}

function requesterEmail(value) {
  const email = validEmail(value);
  if (!email) return "";
  const domain = email.split("@")[1] || "";
  if (GOOGLE_SYSTEM_DOMAINS.has(domain)) return "";
  return email;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((v) => clean(v, 500)).filter(Boolean))];
}

function emailsInText(value) {
  const text = clean(value);
  const matches = text.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi) || [];
  return uniqueStrings(matches.map(requesterEmail).filter(Boolean));
}

function decodeBase64Url(value) {
  const source = clean(value).replace(/-/g, "+").replace(/_/g, "/");
  if (!source) return "";
  const padded = source + "=".repeat((4 - (source.length % 4 || 4)) % 4);
  try { return Buffer.from(padded, "base64").toString("utf8"); } catch { return ""; }
}

function htmlToText(value) {
  return clean(value)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectMessageText(payload) {
  const chunks = [];
  function walk(part) {
    if (!part || typeof part !== "object") return;
    const mime = clean(part.mimeType, 100).toLowerCase();
    const body = decodeBase64Url(part?.body?.data);
    if (body) chunks.push(mime.includes("html") ? htmlToText(body) : body);
    for (const child of Array.isArray(part.parts) ? part.parts : []) walk(child);
  }
  walk(payload);
  return chunks.join("\n").slice(0, 200000);
}

function header(payload, name) {
  const target = String(name || "").toLowerCase();
  const hit = (Array.isArray(payload?.headers) ? payload.headers : []).find((item) => String(item?.name || "").toLowerCase() === target);
  return clean(hit?.value, 2000);
}

function inferRequesterName(text, email) {
  if (!email) return "";
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`(?:^|\\n)\\s*([^\\n<>]{1,100}?)\\s*[<(]?${escaped}[)>]?`, "i"),
    new RegExp(`([^\\n<>]{1,80}?)\\s+${escaped}`, "i"),
  ];
  for (const pattern of patterns) {
    const match = clean(text, 200000).match(pattern);
    if (!match?.[1]) continue;
    const value = clean(match[1], 100)
      .replace(/^(?:from|requester|requested by|user|name)\s*[:：-]\s*/i, "")
      .replace(/["'<>]/g, "")
      .trim();
    if (value && !value.includes("@") && value.length >= 2) return value;
  }
  return "";
}

function parseDriveShareMessage(message, mailbox) {
  const payload = message?.payload || {};
  const bodyText = collectMessageText(payload);
  const snippet = clean(message?.snippet, 2000);
  const candidates = uniqueStrings([...emailsInText(bodyText), ...emailsInText(snippet)]);
  const singleEmail = candidates.length === 1 ? candidates[0] : "";
  const when = Number(message?.internalDate || 0) > 0 ? new Date(Number(message.internalDate)).toISOString() : "";
  return {
    mailbox,
    messageId: clean(message?.id, 120),
    threadId: clean(message?.threadId, 120),
    subject: header(payload, "subject"),
    snippet,
    emailDate: when,
    requesterCandidates: candidates,
    requesterEmail: singleEmail,
    requesterName: singleEmail ? inferRequesterName(bodyText || snippet, singleEmail) : "",
  };
}

function addIndex(index, email, clientId, source) {
  const normalized = validEmail(email, { allowInternal: false });
  if (!normalized || !REC.test(clientId)) return;
  if (!index.has(normalized)) index.set(normalized, new Map());
  const byClient = index.get(normalized);
  if (!byClient.has(clientId)) byClient.set(clientId, new Set());
  byClient.get(clientId).add(source);
}

function buildIdentityIndex({ clients, historicalEvidence, accessEvidence }) {
  const index = new Map();
  const clientsById = new Map((clients || []).map((record) => [record.id, record]));
  for (const record of clients || []) {
    addIndex(index, record?.fields?.[F.clients.contactEmail], record.id, "client_primary");
    addIndex(index, record?.fields?.[F.clients.compatEmail], record.id, "client_compat");
  }
  const acceptedHistoricalStatuses = new Set(["matched", "approved", "verified", "committed"]);
  for (const record of historicalEvidence || []) {
    const ids = linkIds(record?.fields?.[F.historical.client]).filter((id) => clientsById.has(id));
    const status = normalizeStatus(record?.fields?.[F.historical.matchStatus]);
    if (ids.length !== 1 || !acceptedHistoricalStatuses.has(status)) continue;
    addIndex(index, record?.fields?.[F.historical.primaryEmail], ids[0], "historical_exact");
  }
  for (const record of accessEvidence || []) {
    const fields = record?.fields || {};
    const ids = linkIds(fields[F.access.client]).filter((id) => clientsById.has(id));
    if (ids.length !== 1 || normalizeStatus(fields[F.access.reviewStatus]) !== APPROVED_ACCESS_STATUS) continue;
    addIndex(index, fields[F.access.identityEmail], ids[0], "approved_access_evidence");
  }
  return { index, clientsById };
}

function resolveIdentity(index, email) {
  const normalized = validEmail(email);
  const byClient = normalized ? index.get(normalized) : null;
  if (!byClient || byClient.size === 0) return { state: "unmatched", email: normalized, clientIds: [], sources: [] };
  const clientIds = [...byClient.keys()].sort();
  if (clientIds.length !== 1) {
    return {
      state: "conflict",
      email: normalized,
      clientIds,
      sources: uniqueStrings([...byClient.values()].flatMap((set) => [...set])).sort(),
    };
  }
  return {
    state: "exact",
    email: normalized,
    clientId: clientIds[0],
    clientIds,
    sources: [...byClient.get(clientIds[0])].sort(),
  };
}

function exactMatchType(sources) {
  return sources.includes("client_primary") ? "exact_primary_email" : "exact_alias_email";
}

function normalizeForCompare(value) {
  if (Array.isArray(value)) return [...value].map((v) => clean(typeof v === "object" ? v?.id : v, 500)).sort();
  if (value && typeof value === "object") return value;
  return value ?? null;
}

function changedFields(existingFields, desiredFields) {
  const patch = {};
  for (const [key, desired] of Object.entries(desiredFields || {})) {
    const current = existingFields?.[key];
    if (JSON.stringify(normalizeForCompare(current)) !== JSON.stringify(normalizeForCompare(desired))) patch[key] = desired;
  }
  return patch;
}

class Airtable {
  constructor() {
    this.token = clean(process.env.AIRTABLE_API_KEY || process.env.MMS_AIRTABLE_API_TOKEN, 4000);
    if (!this.token) throw new Error("airtable_not_configured");
    this.last = 0;
  }

  async request(table, { method = "GET", body, query = {} } = {}) {
    const url = new URL(`${AIRTABLE_API}/${BASE}/${table}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const delay = this.last + 235 - Date.now();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      this.last = Date.now();
      let response;
      try {
        response = await fetch(url, {
          method,
          headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        if (attempt === 6) throw error;
        await new Promise((resolve) => setTimeout(resolve, 600 * (2 ** attempt)));
        continue;
      }
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 6) {
        throw new Error(`airtable_${response.status}:${clean(payload?.error?.message || payload?.error?.type || JSON.stringify(payload), 600)}`);
      }
      const retryAfter = Number(response.headers.get("retry-after") || 0) * 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter, 800 * (2 ** attempt))));
    }
    throw new Error("airtable_retry_exhausted");
  }

  async list(table) {
    const records = [];
    let offset = "";
    do {
      const payload = await this.request(table, {
        query: {
          pageSize: 100,
          returnFieldsByFieldId: "true",
          ...(offset ? { offset } : {}),
        },
      });
      records.push(...(Array.isArray(payload.records) ? payload.records : []));
      offset = clean(payload.offset, 500);
    } while (offset);
    return records;
  }

  async create(table, rows) {
    for (let index = 0; index < rows.length; index += 10) {
      await this.request(table, {
        method: "POST",
        body: { records: rows.slice(index, index + 10).map((fields) => ({ fields })), typecast: false },
      });
    }
  }

  async update(table, rows) {
    for (let index = 0; index < rows.length; index += 10) {
      await this.request(table, {
        method: "PATCH",
        body: { records: rows.slice(index, index + 10), typecast: false },
      });
    }
  }
}

class Gmail {
  constructor({ allowDriveTokenFallback = false } = {}) {
    this.clientId = clean(process.env.GOOGLE_GMAIL_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID, 2000);
    this.clientSecret = clean(process.env.GOOGLE_GMAIL_CLIENT_SECRET || process.env.GOOGLE_DRIVE_CLIENT_SECRET, 4000);
    this.allowDriveTokenFallback = allowDriveTokenFallback;
  }

  mailboxConfig(mailbox) {
    const primary = clean(process.env[mailbox.refreshEnv], 6000);
    const legacy = this.allowDriveTokenFallback ? clean(process.env[mailbox.legacyRefreshEnv], 6000) : "";
    const refreshToken = primary || legacy;
    if (!this.clientId || !this.clientSecret || !refreshToken) return null;
    return { ...mailbox, refreshToken };
  }

  async accessToken(config) {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const token = clean(payload.access_token, 8000);
    if (!response.ok || !token) throw new Error(`gmail_oauth_failed:${config.slug}:${response.status}`);
    return token;
  }

  async request(token, path, query = {}) {
    const url = new URL(`${GMAIL_API}${path}`);
    for (const [key, value] of Object.entries(query || {})) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`gmail_${response.status}:${clean(payload?.error?.status || payload?.error?.message || "request_failed", 300)}`);
    return payload;
  }

  async verifyMailbox(token, expectedEmail) {
    const profile = await this.request(token, "/users/me/profile");
    const actual = validEmail(profile?.emailAddress, { allowInternal: true });
    if (!actual || actual !== expectedEmail.toLowerCase()) throw new Error(`gmail_mailbox_mismatch:${expectedEmail}:${actual || "unknown"}`);
  }

  async listMessages(token, maxMessages = 0) {
    const ids = [];
    let pageToken = "";
    do {
      const payload = await this.request(token, "/users/me/messages", {
        q: SEARCH_QUERY,
        maxResults: 500,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const message of Array.isArray(payload.messages) ? payload.messages : []) {
        const id = clean(message?.id, 120);
        if (id) ids.push(id);
        if (maxMessages > 0 && ids.length >= maxMessages) return ids.slice(0, maxMessages);
      }
      pageToken = clean(payload.nextPageToken, 1000);
    } while (pageToken);
    return ids;
  }

  async getMessages(token, ids) {
    const out = [];
    const chunkSize = 12;
    for (let index = 0; index < ids.length; index += chunkSize) {
      const chunk = ids.slice(index, index + chunkSize);
      const batch = await Promise.all(chunk.map((id) => this.request(token, `/users/me/messages/${encodeURIComponent(id)}`, { format: "full" })));
      out.push(...batch);
    }
    return out;
  }
}

function stagingId(mailbox, messageId) {
  return `gdrive_${mailbox.slug}_${messageId}`.slice(0, 240);
}

function accessEvidenceId(mailbox, messageId) {
  return `gmail_${mailbox.slug}_${messageId}`.slice(0, 240);
}

function makeStagingFields(parsed, resolution) {
  const base = {
    [F.staging.stagingId]: stagingId(parsed.mailbox, parsed.messageId),
    [F.staging.sourceAccount]: parsed.mailbox.email,
    [F.staging.messageId]: parsed.messageId,
    [F.staging.threadId]: parsed.threadId,
    [F.staging.subject]: parsed.subject,
    [F.staging.snippet]: parsed.snippet,
    [F.staging.emailDate]: parsed.emailDate,
    [F.staging.batchKey]: BATCH_KEY,
  };
  if (parsed.requesterEmail) base[F.staging.senderEmail] = parsed.requesterEmail;
  if (parsed.requesterName) base[F.staging.senderName] = parsed.requesterName;

  if (parsed.requesterCandidates.length > 1) {
    return {
      ...base,
      [F.staging.matchType]: "multiple_match_review",
      [F.staging.confidence]: 0,
      [F.staging.reviewStatus]: "review_required",
      [F.staging.reviewActor]: "system_gmail_ingest",
    };
  }
  if (!parsed.requesterEmail || resolution.state === "unmatched") {
    return {
      ...base,
      [F.staging.matchType]: "no_match_staging_only",
      [F.staging.confidence]: 0,
      [F.staging.reviewStatus]: "review_required",
      [F.staging.reviewActor]: "system_gmail_ingest",
    };
  }
  if (resolution.state === "conflict") {
    return {
      ...base,
      [F.staging.matchType]: "multiple_match_review",
      [F.staging.confidence]: 0,
      [F.staging.reviewStatus]: "review_required",
      [F.staging.reviewActor]: "system_exact_lineage_conflict",
    };
  }
  return {
    ...base,
    [F.staging.matchedClient]: [resolution.clientId],
    [F.staging.matchType]: exactMatchType(resolution.sources),
    [F.staging.confidence]: 100,
    [F.staging.reviewStatus]: "committed",
    [F.staging.reviewActor]: "system_exact_lineage",
  };
}

function makeAccessFields(parsed, resolution) {
  return {
    [F.access.evidenceId]: accessEvidenceId(parsed.mailbox, parsed.messageId),
    [F.access.client]: [resolution.clientId],
    [F.access.sourceType]: SOURCE_TYPE,
    [F.access.sourceGmailAccount]: parsed.mailbox.email,
    [F.access.gmailMessageId]: parsed.messageId,
    [F.access.identityEmail]: parsed.requesterEmail,
    [F.access.reviewStatus]: APPROVED_ACCESS_STATUS,
    [F.access.requesterEmail]: parsed.requesterEmail,
    ...(parsed.requesterName ? { [F.access.requesterName]: parsed.requesterName } : {}),
    ...(parsed.emailDate ? { [F.access.evidenceDatetime]: parsed.emailDate } : {}),
    ...(parsed.threadId ? { [F.access.gmailThreadId]: parsed.threadId } : {}),
    ...(parsed.subject ? { [F.access.subject]: parsed.subject } : {}),
    [F.access.confidence]: 100,
    [F.access.reconciliationNotes]: "identity_only_no_membership_mutation",
    [F.access.metadataJson]: JSON.stringify({
      schema_version: 1,
      match: exactMatchType(resolution.sources),
      lineage: "one_to_one",
      lineage_sources: resolution.sources,
      folder_name_used_for_identity: false,
      membership_mutated: false,
      points_mutated: false,
      entitlements_mutated: false,
    }),
  };
}

function shouldPreserveCommittedStaging(existing) {
  const status = normalizeStatus(existing?.fields?.[F.staging.reviewStatus]);
  const clientIds = linkIds(existing?.fields?.[F.staging.matchedClient]);
  return status === "committed" && clientIds.length === 1;
}

async function run({ apply = false, reportPath = "", assertIdempotent = false, allowUnconfigured = false, allowDriveTokenFallback = false, maxMessages = 0 } = {}) {
  const at = new Airtable();
  const gmail = new Gmail({ allowDriveTokenFallback });
  const [clients, historicalEvidence, stagingRows, accessRows] = await Promise.all([
    at.list(TABLES.clients),
    at.list(TABLES.historicalEvidence),
    at.list(TABLES.staging),
    at.list(TABLES.accessEvidence),
  ]);

  const { index: identityIndex, clientsById } = buildIdentityIndex({ clients, historicalEvidence, accessEvidence: accessRows });
  const existingStagingById = new Map(stagingRows.map((record) => [clean(record?.fields?.[F.staging.stagingId], 300), record]).filter(([id]) => id));
  const existingAccessById = new Map(accessRows.map((record) => [clean(record?.fields?.[F.access.evidenceId], 300), record]).filter(([id]) => id));

  const report = {
    mode: apply ? "apply" : "dry_run",
    batch_key: BATCH_KEY,
    scanned_messages: 0,
    parsed_single_requester: 0,
    requester_email_ambiguous: 0,
    requester_email_missing: 0,
    exact_one_to_one: 0,
    lineage_conflicts: 0,
    lineage_unmatched: 0,
    staging_creates: 0,
    staging_updates: 0,
    access_creates: 0,
    access_updates: 0,
    client_contact_email_updates: 0,
    client_compat_email_updates: 0,
    preserved_committed_staging: 0,
    skipped_mailboxes: [],
    mailbox_counts: {},
  };

  const parsedMessages = [];
  for (const mailbox of MAILBOXES) {
    const config = gmail.mailboxConfig(mailbox);
    if (!config) {
      if (!allowUnconfigured) throw new Error(`gmail_not_configured:${mailbox.slug}`);
      report.skipped_mailboxes.push(mailbox.slug);
      report.mailbox_counts[mailbox.slug] = 0;
      continue;
    }
    const token = await gmail.accessToken(config);
    await gmail.verifyMailbox(token, mailbox.email);
    const ids = await gmail.listMessages(token, maxMessages);
    const messages = await gmail.getMessages(token, ids);
    report.mailbox_counts[mailbox.slug] = messages.length;
    for (const message of messages) parsedMessages.push(parseDriveShareMessage(message, mailbox));
  }

  report.scanned_messages = parsedMessages.length;
  const stagingCreates = [];
  const stagingUpdates = [];
  const accessCreates = [];
  const accessUpdates = [];
  const clientPatches = new Map();

  for (const parsed of parsedMessages) {
    let resolution = { state: "unmatched", sources: [], clientIds: [] };
    if (parsed.requesterCandidates.length > 1) report.requester_email_ambiguous += 1;
    else if (!parsed.requesterEmail) report.requester_email_missing += 1;
    else {
      report.parsed_single_requester += 1;
      resolution = resolveIdentity(identityIndex, parsed.requesterEmail);
      if (resolution.state === "exact") report.exact_one_to_one += 1;
      else if (resolution.state === "conflict") report.lineage_conflicts += 1;
      else report.lineage_unmatched += 1;
    }

    const sid = stagingId(parsed.mailbox, parsed.messageId);
    const existingStaging = existingStagingById.get(sid);
    const desiredStaging = makeStagingFields(parsed, resolution);
    if (existingStaging && shouldPreserveCommittedStaging(existingStaging) && resolution.state !== "exact") {
      report.preserved_committed_staging += 1;
    } else if (!existingStaging) {
      stagingCreates.push(desiredStaging);
    } else {
      const patch = changedFields(existingStaging.fields || {}, desiredStaging);
      if (Object.keys(patch).length) stagingUpdates.push({ id: existingStaging.id, fields: patch });
    }

    if (resolution.state !== "exact") continue;
    const eid = accessEvidenceId(parsed.mailbox, parsed.messageId);
    const existingAccess = existingAccessById.get(eid);
    const desiredAccess = makeAccessFields(parsed, resolution);
    if (!existingAccess) accessCreates.push(desiredAccess);
    else {
      const patch = changedFields(existingAccess.fields || {}, desiredAccess);
      if (Object.keys(patch).length) accessUpdates.push({ id: existingAccess.id, fields: patch });
    }

    const client = clientsById.get(resolution.clientId);
    if (!client) continue;
    const fields = client.fields || {};
    const currentPrimary = validEmail(fields[F.clients.contactEmail]);
    const currentCompat = validEmail(fields[F.clients.compatEmail]);
    const patch = clientPatches.get(client.id) || {};
    if (!currentPrimary) patch[F.clients.contactEmail] = parsed.requesterEmail;
    if (!currentCompat) patch[F.clients.compatEmail] = parsed.requesterEmail;
    if (Object.keys(patch).length) clientPatches.set(client.id, patch);
  }

  const clientUpdates = [...clientPatches.entries()].map(([id, fields]) => ({ id, fields }));
  report.staging_creates = stagingCreates.length;
  report.staging_updates = stagingUpdates.length;
  report.access_creates = accessCreates.length;
  report.access_updates = accessUpdates.length;
  report.client_contact_email_updates = clientUpdates.filter((row) => Object.hasOwn(row.fields, F.clients.contactEmail)).length;
  report.client_compat_email_updates = clientUpdates.filter((row) => Object.hasOwn(row.fields, F.clients.compatEmail)).length;
  report.pending_mutations = report.staging_creates + report.staging_updates + report.access_creates + report.access_updates + clientUpdates.length;

  if (apply) {
    if (stagingCreates.length) await at.create(TABLES.staging, stagingCreates);
    if (stagingUpdates.length) await at.update(TABLES.staging, stagingUpdates);
    if (accessCreates.length) await at.create(TABLES.accessEvidence, accessCreates);
    if (accessUpdates.length) await at.update(TABLES.accessEvidence, accessUpdates);
    if (clientUpdates.length) await at.update(TABLES.clients, clientUpdates);
  }

  report.completed_at = new Date().toISOString();
  if (reportPath) fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (assertIdempotent && report.pending_mutations !== 0) throw new Error(`idempotency_failed:${report.pending_mutations}`);
  return report;
}

function selfTest() {
  assert.equal(validEmail(" Person@Gmail.com "), "person@gmail.com");
  assert.equal(requesterEmail("malemodel.bkk@gmail.com"), "");
  assert.equal(requesterEmail("drive-shares-dm-noreply@google.com"), "");
  assert.deepEqual(emailsInText("Owner malemodel.bkk@gmail.com; requester Test.User@gmail.com"), ["test.user@gmail.com"]);

  const fakeMessage = {
    id: "abc123",
    threadId: "thread123",
    internalDate: "1789376400000",
    snippet: "John Example (john.customer@gmail.com) is requesting access",
    payload: {
      headers: [{ name: "Subject", value: "Share request for Test Folder" }],
      mimeType: "text/plain",
      body: { data: Buffer.from("John Example (john.customer@gmail.com) is requesting access to a Drive folder owned by malemodel.bkk@gmail.com").toString("base64url") },
    },
  };
  const parsed = parseDriveShareMessage(fakeMessage, MAILBOXES[0]);
  assert.equal(parsed.requesterEmail, "john.customer@gmail.com");
  assert.equal(parsed.requesterCandidates.length, 1);
  assert.equal(parsed.subject, "Share request for Test Folder");

  const clients = [
    { id: "rec12345678901234", fields: { [F.clients.contactEmail]: "john.customer@gmail.com" } },
  ];
  const { index } = buildIdentityIndex({ clients, historicalEvidence: [], accessEvidence: [] });
  const exact = resolveIdentity(index, "john.customer@gmail.com");
  assert.equal(exact.state, "exact");
  assert.equal(exact.clientId, "rec12345678901234");
  assert.equal(exactMatchType(exact.sources), "exact_primary_email");

  addIndex(index, "john.customer@gmail.com", "recABCDEFGHIJKLMN", "historical_exact");
  assert.equal(resolveIdentity(index, "john.customer@gmail.com").state, "conflict");

  assert.deepEqual(changedFields({ a: ["rec12345678901234"] }, { a: ["rec12345678901234"] }), {});
  assert.deepEqual(changedFields({ a: 1 }, { a: 2 }), { a: 2 });
  process.stdout.write("self-test passed\n");
}

function parseArgs(argv) {
  const args = [...argv];
  const value = (flag, fallback = "") => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };
  const max = Number(value("--max-messages", process.env.GMAIL_RECONCILE_MAX_MESSAGES || "0"));
  return {
    selfTest: args.includes("--self-test"),
    apply: args.includes("--apply"),
    reportPath: value("--report"),
    assertIdempotent: args.includes("--assert-idempotent"),
    allowUnconfigured: args.includes("--allow-unconfigured"),
    allowDriveTokenFallback: args.includes("--allow-drive-token-fallback"),
    maxMessages: Number.isFinite(max) && max > 0 ? Math.floor(max) : 0,
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) selfTest();
  else run(options).catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  F,
  MAILBOXES,
  addIndex,
  buildIdentityIndex,
  changedFields,
  emailsInText,
  exactMatchType,
  parseDriveShareMessage,
  requesterEmail,
  resolveIdentity,
  run,
  stagingId,
  accessEvidenceId,
};
