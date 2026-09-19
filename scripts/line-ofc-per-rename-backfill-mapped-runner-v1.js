#!/usr/bin/env node
"use strict";

// Migration-specific schema adapter. Pre-Session Client Index has a governed
// Source Type single-select and its existing LINE value is `line_ofc_staging`.
// Keep the richer Per-Rename provenance in snapshot/notes while storing the
// governed enum. On reads, project that enum back to the logical migration
// source only for `line_ofc_per_rename:` keys so the core backfill can retain
// true zero-write idempotency without changing unrelated index records.
const INDEX_TABLE = "tblwn6I9VWie5d7Ui";
const KEY_FIELD = "fldOZE5KckVNY7rE7";
const SOURCE_FIELD = "fldMocKAUyU54M8hb";
const KEY_PREFIX = "line_ofc_per_rename:";
const LOGICAL_SOURCE = "line_ofc_per_rename_full_backfill_v1";
const AIRTABLE_SOURCE = "line_ofc_staging";

const realFetch = globalThis.fetch;
if (typeof realFetch !== "function") throw new Error("fetch_not_available");

function isIndexUrl(url) {
  return url.hostname === "api.airtable.com" && url.pathname.includes(`/${INDEX_TABLE}`);
}
function adaptWriteBody(bodyText) {
  const data = JSON.parse(String(bodyText || "{}"));
  const rows = Array.isArray(data.records) ? data.records : [data];
  for (const row of rows) {
    const fields = row?.fields;
    if (fields && fields[SOURCE_FIELD] === LOGICAL_SOURCE) fields[SOURCE_FIELD] = AIRTABLE_SOURCE;
  }
  return JSON.stringify(data);
}
function adaptReadData(data) {
  for (const row of data?.records || []) {
    const fields = row?.fields || {};
    if (String(fields[KEY_FIELD] || "").startsWith(KEY_PREFIX) && fields[SOURCE_FIELD] === AIRTABLE_SOURCE) {
      fields[SOURCE_FIELD] = LOGICAL_SOURCE;
    }
  }
  return data;
}

globalThis.fetch = async function mmdPerRenameIndexSchemaAdapter(input, init = {}) {
  let url;
  try { url = new URL(typeof input === "string" ? input : input.url); }
  catch (_) { return realFetch(input, init); }
  const method = String(init?.method || "GET").toUpperCase();
  let nextInit = init;
  if (isIndexUrl(url) && method !== "GET" && init?.body) {
    nextInit = { ...init, body: adaptWriteBody(init.body) };
  }
  const res = await realFetch(input, nextInit);
  if (isIndexUrl(url) && method === "GET" && res.ok) {
    const data = adaptReadData(await res.json());
    return new Response(JSON.stringify(data), {
      status: res.status,
      statusText: res.statusText,
      headers: { "content-type": "application/json" },
    });
  }
  return res;
};

require("./line-ofc-per-rename-backfill-v1-runner.js");
