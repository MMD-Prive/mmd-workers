#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

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

// A source file can legitimately omit Captured At. The migration previously
// used wall-clock time for those rows and for the pre-session sync timestamp,
// which meant re-running the exact same file always planned writes. Freeze the
// no-argument Date clock to the source file mtime for input runs. Explicit dates
// still behave normally. The same immutable source file now produces the same
// timestamps and therefore a true zero-write idempotency check on the next run.
const inputIndex = process.argv.indexOf("--input");
const inputPath = inputIndex >= 0 ? String(process.argv[inputIndex + 1] || "") : "";
if (inputPath) {
  const absoluteInput = path.resolve(inputPath);
  const stat = fs.statSync(absoluteInput);
  const frozenMs = Number(stat.mtimeMs) || Date.now();
  const RealDate = Date;
  class StableInputDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [frozenMs]));
    }
    static now() {
      return frozenMs;
    }
  }
  globalThis.Date = StableInputDate;
}

require("./line-ofc-per-rename-backfill-v1.js");
