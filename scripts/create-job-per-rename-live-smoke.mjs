#!/usr/bin/env node
import fs from "node:fs";

import { resolvePerRenameAlias } from "../admin-worker/src/per-rename-client-search.js";

const API = "https://api.airtable.com/v0";
const base = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const table = process.env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID || "tblwn6I9VWie5d7Ui";
const clientsTable = process.env.AIRTABLE_TABLE_CLIENTS_ID || "tblVv58TCbwh5j1fS";
const token = String(process.env.AIRTABLE_API_KEY || "").trim();
const outPath = process.argv[2] || "/tmp/mmd-create-job-per-rename-canary.txt";

if (!token) throw new Error("AIRTABLE_API_KEY is required");

const clean = (value) => String(value ?? "").trim();
const norm = (value) => clean(value)
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}@._+]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

function linkedIds(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const one = clean(value);
  return one ? [one] : [];
}

async function readRows() {
  const params = new URLSearchParams();
  params.set("pageSize", "100");
  for (const field of [
    "identity_key",
    "preferred_name",
    "linked_client",
    "resolution_status",
    "session_lookup_status",
    "source_type",
  ]) params.append("fields[]", field);

  const rows = [];
  let offset = "";
  do {
    if (offset) params.set("offset", offset);
    else params.delete("offset");
    const response = await fetch(`${API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`airtable_${response.status}`);
    const body = await response.json();
    rows.push(...(Array.isArray(body.records) ? body.records : []));
    offset = clean(body.offset);
  } while (offset && rows.length < 1000);
  return rows;
}

const rows = (await readRows()).filter((record) => {
  const f = record?.fields || {};
  const ids = linkedIds(f.linked_client);
  return clean(f.identity_key).toLowerCase().startsWith("line_ofc_per_rename:")
    && norm(f.source_type) === "line_ofc_staging"
    && norm(f.resolution_status) === "linked"
    && norm(f.session_lookup_status) === "canonical_ready"
    && ids.length === 1
    && norm(f.preferred_name);
});

const groups = new Map();
for (const record of rows) {
  const f = record.fields || {};
  const firstToken = norm(f.preferred_name).split(" ")[0];
  if (!firstToken || firstToken.length < 2) continue;
  const clientId = linkedIds(f.linked_client)[0];
  const entry = groups.get(firstToken) || { rows: 0, clients: new Set() };
  entry.rows += 1;
  entry.clients.add(clientId);
  groups.set(firstToken, entry);
}

const candidate = [...groups.entries()]
  .filter(([, value]) => value.clients.size >= 2)
  .sort((a, b) => a[1].clients.size - b[1].clients.size || a[1].rows - b[1].rows)[0];

if (!candidate) throw new Error("no_multi_client_per_rename_canary_available");

const [query, metadata] = candidate;
fs.writeFileSync(outPath, query, { mode: 0o600 });
console.log(`Per Rename production canary prepared: ${metadata.clients.size} canonical clients`);

try {
  const resolved = await resolvePerRenameAlias({
    AIRTABLE_API_KEY: token,
    AIRTABLE_BASE_ID: base,
    AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID: table,
    AIRTABLE_TABLE_CLIENTS_ID: clientsTable,
  }, query);
  const resolvedCount = Array.isArray(resolved?.records) ? resolved.records.length : resolved?.record ? 1 : 0;
  console.log(`Direct Per Rename resolver state=${clean(resolved?.state) || "missing"} count=${resolvedCount}`);
} catch (error) {
  const raw = clean(error?.message || error);
  const safe = /^airtable_[A-Za-z0-9]+_\d{3}$/.test(raw) || raw === "per_rename_storage_not_ready"
    ? raw
    : "per_rename_resolver_error";
  console.error(`Direct Per Rename resolver failed: ${safe}`);
  process.exit(2);
}
