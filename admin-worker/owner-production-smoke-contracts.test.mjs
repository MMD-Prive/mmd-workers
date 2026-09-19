import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

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

  const stepName = "      - name: Smoke authenticated CEO models page and live model APIs";
  assert.equal(workflow.split(stepName).length - 1, 1, "authenticated CEO model smoke must exist exactly once");
  const pageProbe = 'page_code="$(curl';
  assert.equal(workflow.split(pageProbe).length - 1, 1, "CEO model page probe must exist exactly once");

  const stepStart = workflow.indexOf(stepName);
  const runStart = workflow.indexOf("        run: |\n", stepStart);
  assert.ok(stepStart >= 0 && runStart > stepStart, "authenticated CEO model smoke run block missing");
  const script = workflow
    .slice(runStart + "        run: |\n".length)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n");

  const syntax = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr || "CEO model supply smoke shell syntax failed");
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
