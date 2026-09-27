import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/deploy-member-pages-worker.yml", import.meta.url);
const workflow = await readFile(workflowPath, "utf8");

test("default member-pages deploy never provisions a Worker secret", () => {
  assert.doesNotMatch(workflow, /wrangler(?:@\S+)?\s+secret\s+put/i);
  assert.doesNotMatch(workflow, /Provision Airtable API secret/i);
});

test("synthetic production writes require manual dispatch and an explicit test-plan reference", () => {
  assert.match(workflow, /synthetic_write_acceptance:/);
  assert.match(workflow, /test_plan_ref:/);
  const guardedWrites = workflow.match(/if: github\.event_name == 'workflow_dispatch' && inputs\.synthetic_write_acceptance == true/g) || [];
  assert.equal(guardedWrites.length, 2, "both Birthday Wish writes and public Wish POST smoke must be manually gated");
  assert.match(workflow, /SYNTHETIC_TEST_PLAN_REF: \$\{\{ inputs\.test_plan_ref \}\}/);
  assert.match(workflow, /if \[ -z "\$SYNTHETIC_TEST_PLAN_REF" \]/);
  assert.match(workflow, /SYNTHETIC_WRITE_ACCEPTANCE/);
});

test("read-only production preflights remain available during a normal deploy", () => {
  assert.match(workflow, /Verify Airtable LIFF gateway access/);
  assert.match(workflow, /Verify MY MMD ETA event store access/);
  assert.match(workflow, /Validate Cloudflare deploy/);
  assert.match(workflow, /--dry-run --keep-vars/);
});
