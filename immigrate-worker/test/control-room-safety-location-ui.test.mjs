import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = await readFile(
  join(workerRoot, "../webflow/internal/admin/control-room/safety-location-control-v1.js"),
  "utf8",
);

assert.match(source, /\/v1\/admin\/dashboard\?view=jobs&page_size=50/);
assert.match(source, /\/studio\/api\/model\/location\/safety-check/);
assert.match(source, /credentials:\s*["']include["']/);

for (const reason of [
  "model_unreachable",
  "arrival_disputed",
  "separation_disputed",
  "session_integrity",
  "safety_incident",
  "model_requested_help",
]) {
  assert.match(source, new RegExp(reason));
}

assert.match(source, /const DURATIONS = \[15, 30, 60\]/);
assert.match(source, /session_id:\s*selectedSessionId/);
assert.match(source, /reason_code:\s*String\(reasonSelect\.value/);
assert.match(source, /duration_minutes:\s*selectedDuration/);
assert.match(source, /method:\s*["']DELETE["']/);
assert.match(source, /check_id/);
assert.match(source, /Refresh latest location/);
assert.match(source, /FIRST_POINT_MAX_POLLS = 6/);
assert.match(source, /stores_history|ไม่เก็บประวัติเส้นทาง/);
assert.match(source, /180 วินาที/);

// The browser must not become a tracking authority or persist coordinates.
assert.doesNotMatch(source, /localStorage/);
assert.doesNotMatch(source, /sessionStorage/);
assert.doesNotMatch(source, /watchPosition/);
assert.doesNotMatch(source, /maps\.google|google\.com\/maps/i);
assert.doesNotMatch(source, /Authorization|X-Confirm-Key|ADMIN_BEARER|CONFIRM_KEY/);

// Coordinates are rendered only from the audited backend snapshot and never put into URLs.
assert.match(source, /snapshot\.location/);
assert.match(source, /Number\(locationData\.lat\)\.toFixed\(6\)/);
assert.match(source, /Number\(locationData\.lng\)\.toFixed\(6\)/);
assert.doesNotMatch(source, /searchParams\.set\(["']lat|searchParams\.set\(["']lng/);

console.log("Control Room Safety Location UI contract: PASS");
