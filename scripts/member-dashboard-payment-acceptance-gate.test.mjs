import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const workflow = readFileSync(new URL("../.github/workflows/deploy-member-dashboard-chat-worker.yml", import.meta.url), "utf8");
test("Worker release has no authenticated payment or pending-intent creation capability", () => {
  assert.doesNotMatch(workflow, /name: Authenticated My MMD Payment Center acceptance/);
  assert.doesNotMatch(workflow, /MY_MMD_E2E_ID_TOKEN|payment_center_pending_intent_approved|PAYMENT_CENTER_INTENT_APPROVED/);
  assert.doesNotMatch(workflow, /-X POST[^\n]*(?:public-membership\/purchase|member\/api\/liff\/start)/);
  assert.doesNotMatch(workflow, /name: Smoke internal AI service binding/);
});
test("explicit release approval is exact-SHA and main-only, not payment authorization", () => {
  assert.match(workflow, /github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main' && inputs.production_approved == true && inputs.approved_sha == github.sha/);
  assert.match(workflow, /default: false/);
  assert.doesNotMatch(workflow, /^  (?:push|workflow_run|schedule):/m);
  assert.doesNotMatch(workflow, /-X POST .*\/member\/api\/liff/);
});
