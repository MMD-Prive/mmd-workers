#!/usr/bin/env node
"use strict";

// Airtable returns field-name keyed payloads by default. The Per-Rename v1
// migration intentionally uses stable field IDs throughout, so force Airtable
// GET responses to be keyed by field ID without changing the migration's
// write contract or exposing customer data.
const realFetch = globalThis.fetch;
if (typeof realFetch !== "function") throw new Error("fetch_not_available");

globalThis.fetch = function mmdPerRenameFieldIdFetch(input, init = {}) {
  try {
    const method = String(init?.method || "GET").toUpperCase();
    const url = new URL(typeof input === "string" ? input : input.url);
    if (method === "GET" && url.hostname === "api.airtable.com") {
      url.searchParams.set("returnFieldsByFieldId", "true");
      if (typeof input === "string") input = url.toString();
      else input = new Request(url.toString(), input);
    }
  } catch (_) {
    // Preserve the original fetch behavior for any non-URL input. The migration
    // itself will fail closed if Airtable cannot be read.
  }
  return realFetch(input, init);
};

require("./line-ofc-per-rename-backfill-v1.js");
