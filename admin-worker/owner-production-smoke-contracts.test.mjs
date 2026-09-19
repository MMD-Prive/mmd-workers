import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("CEO model supply smoke follows the current v3 Webflow contract", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/model-supply-production-ingress.yml", root),
    "utf8",
  );

  assert.match(workflow, /model-supply-v3/);
  assert.doesNotMatch(workflow, /grep -q 'model-supply-v1'/);
  assert.match(workflow, /SUPPLY INTELLIGENCE/);
  assert.match(workflow, /\/v1\/admin\/models\/list\?limit=100/);
  assert.match(workflow, /\/v1\/admin\/models\/resolve-source\?q=/);
  assert.match(workflow, /x-mmd-admin-post-login/);
  assert.match(workflow, /dashboard-first/);
  assert.match(workflow, /x-mmd-admin-next/);
  assert.match(workflow, /\/internal\/admin\/dashboard/);
  assert.doesNotMatch(workflow, /location: \/internal\/ceo\/models/);
  assert.match(workflow, /p\.authority !== 'backend'/);
  assert.match(workflow, /p\.published !== false \|\| p\.can_publish !== false/);
});

test("historical controlled smoke checks business safety, not one transport status", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/historical-backfill-authenticated-controlled-smoke.yml", root),
    "utf8",
  );

  assert.match(workflow, /200\|201/);
  assert.match(workflow, /p\.duplicate!==false/);
  assert.match(workflow, /p\.state!==\"pending\"/);
  assert.match(workflow, /p\.guardrails\?\.may_mark_paid!==false/);
  assert.match(workflow, /p\.money_truth_mutated!==false/);
  assert.match(workflow, /historical_proof_sha_mismatch/);
  assert.match(workflow, /decision:\"reject\"/);
  assert.match(workflow, /p\.state!==\"rejected\"/);
});
