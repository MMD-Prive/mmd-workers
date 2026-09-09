import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "customer-360-"));
const outfile = join(tmp, "customer-360.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

try {
  await build({
    entryPoints: [join(workerRoot, "src/customer-360-ui-v1.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });

  const { renderCustomer360Page } = await import(pathToFileURL(outfile).href);
  const response = renderCustomer360Page();
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-customer-ui"), "customer-360-v1");
  assert.equal(response.headers.get("x-mmd-customer-authority"), "canonical-client-reviewed-match");
  assert.equal(response.headers.get("x-mmd-customer-data-ui"), "readable-v2");
  assert.equal(response.headers.get("x-mmd-customer-data-authority"), "identity-context-staging-only");
  assert.equal(response.headers.get("cache-control"), "no-store, private");

  assert.match(body, /Customer 360/);
  assert.match(body, /WHO → EVIDENCE → CONTEXT → REVIEW → NEXT ACTION/);
  assert.match(body, /\/v1\/admin\/customer-data\/queue/);
  assert.match(body, /\/v1\/admin\/customer-data\/backfill\/start/);
  assert.match(body, /\/v1\/admin\/clients\/lineage-lookup/);
  assert.match(body, /Idempotency-Key/);
  assert.match(body, /link_to_client/);
  assert.match(body, /create_candidate_only/);
  assert.match(body, /mark_review_required/);
  assert.match(body, /data-action="ignore"/);
  assert.match(body, /Create Session/);
  assert.match(body, /Kenji Context/);
  assert.match(body, /Money Control/);
  assert.match(body, /Access Intelligence/);
  assert.match(body, /Canonical Client = identity truth/);
  assert.match(body, /Payments worker = money truth/);
  assert.match(body, /Resolver = access truth/);
  assert.match(body, /Candidate ≠ Member/);
  assert.match(body, /นำเข้าจาก Console Inbox/);
  assert.match(body, /จับคู่แล้ว/);
  assert.doesNotMatch(body, /Admin Key/);
  assert.doesNotMatch(body, /Bearer/);
  assert.doesNotMatch(body, /prompt\(/);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
