import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "create-session-manual-client-fallback-"));
const outfile = join(tmp, "internal-routes.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [join(workerRoot, "src/internal-routes.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  conditions: ["worker", "browser"],
  target: "es2022",
});

const { handleInternalRoutes } = await import(pathToFileURL(outfile).href);

test.after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test("zero-match client lookup returns owner manual-name fallback for public-only reconciliation", async () => {
  const calls = [];
  const request = new Request("https://mmdbkk.com/v1/admin/clients/lineage-lookup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "mmd_admin_gate_v1=safe-test-cookie",
    },
    body: JSON.stringify({ query: "หนุ่ย" }),
  });

  const response = await handleInternalRoutes(request, {
    ADMIN_WORKER: {
      fetch: async (input) => {
        calls.push(input);
        return Response.json({
          ok: true,
          source: "canonical_client_lineage",
          records: [],
          count: 0,
          lineage_warnings: [],
        });
      },
    },
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(body.manual_fallback, true);
  assert.equal(body.count, 1);
  assert.equal(body.records.length, 1);
  assert.equal(body.records[0].client_name, "หนุ่ย");
  assert.equal(body.records[0].remembered_name, "หนุ่ย");
  assert.equal(body.records[0].client_id, "");
  assert.equal(body.records[0].membership_status, "guest_public_only");
  assert.equal(body.records[0].identity_status, "pending_reconcile");
  assert.equal(body.records[0].manual_public_only, true);
  assert.equal(body.records[0].entitlement_snapshot_source, "none");
  assert.ok(body.records[0].legacy_tags.includes("public_only"));
  assert.ok(body.lineage_warnings.includes("manual_public_only_pending_reconcile"));
});

test("existing canonical lookup results are never replaced by manual fallback", async () => {
  const request = new Request("https://mmdbkk.com/v1/admin/clients/lineage-lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Per Client" }),
  });

  const response = await handleInternalRoutes(request, {
    ADMIN_WORKER: {
      fetch: async () => Response.json({
        ok: true,
        records: [{ client_id: "recCanonical", client_name: "Per Client" }],
        count: 1,
        lineage_warnings: [],
      }),
    },
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  });

  const body = await response.json();
  assert.equal(body.manual_fallback, undefined);
  assert.deepEqual(body.records, [{ client_id: "recCanonical", client_name: "Per Client" }]);
});
