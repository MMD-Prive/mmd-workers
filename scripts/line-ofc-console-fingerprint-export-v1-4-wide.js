#!/usr/bin/env node
"use strict";

// Audit-only wide receive-time matcher for the 2026-09-06 LINE OA backup.
// Reuses the reviewed v1.3 exporter and changes only the candidate window/cap.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const sourcePath = path.join(__dirname, "line-ofc-console-fingerprint-export-v1.js");
let source = fs.readFileSync(sourcePath, "utf8");
const replacements = [
  ["const MAX_WINDOW_HASHES_PER_IDENTITY = 1600;", "const MAX_WINDOW_HASHES_PER_IDENTITY = 12000;"],
  ["const RECEIVE_WINDOW_BEFORE_SECONDS = 15;", "const RECEIVE_WINDOW_BEFORE_SECONDS = 90;"],
  ["const RECEIVE_WINDOW_AFTER_SECONDS = 2;", "const RECEIVE_WINDOW_AFTER_SECONDS = 5;"],
  ['version: "line-ofc-console-fingerprint-index-v1.3",', 'version: "line-ofc-console-fingerprint-index-v1.4-wide90",'],
];
for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`expected_source_marker_missing:${before}`);
  source = source.replace(before, after);
}
const tempPath = path.join(os.tmpdir(), `line-ofc-console-fingerprint-wide-${process.pid}.js`);
fs.writeFileSync(tempPath, source);
require(tempPath);
