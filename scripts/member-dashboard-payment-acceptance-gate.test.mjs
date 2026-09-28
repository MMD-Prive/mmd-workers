import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workflow = readFileSync(new URL("../.github/workflows/deploy-member-dashboard-chat-worker.yml", import.meta.url), "utf8");
const step = workflow.match(/^      - name: Authenticated My MMD Payment Center acceptance\n([\s\S]*?)(?=^      - name: Smoke internal AI service binding)/m)?.[1];
assert.ok(step, "Payment Center acceptance step must exist");
const script = step.match(/^        run: \|\n([\s\S]*)$/m)?.[1].split("\n").map((line) => line.startsWith("          ") ? line.slice(10) : line).join("\n");
assert.ok(script, "Payment Center acceptance shell script must exist");

test("a token alone cannot start an authenticated purchase on an automatic deploy", () => {
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && inputs\.payment_center_pending_intent_approved/);
  for (const [token, approval, plan] of [
    ["", "false", ""],
    ["example-token", "false", "test-plan-1"],
    ["example-token", "true", "   "],
  ]) {
    const dir = mkdtempSync(join(tmpdir(), "my-mmd-gate-"));
    try {
      const result = spawnSync("/bin/bash", ["-e", "-c", script], {
        env: {
          PATH: "/nonexistent", RUNNER_TEMP: dir,
          GITHUB_OUTPUT: join(dir, "output"), GITHUB_STEP_SUMMARY: join(dir, "summary"),
          MY_MMD_E2E_ID_TOKEN: token, PAYMENT_CENTER_INTENT_APPROVED: approval,
          PAYMENT_CENTER_TEST_PLAN: plan,
        },
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(readFileSync(join(dir, "output"), "utf8"), /^status=BLOCKED_MISSING_CONSENT_OR_TOKEN$/m);
      assert.match(readFileSync(join(dir, "summary"), "utf8"), /BLOCKED_MISSING_CONSENT_OR_TOKEN/);
      assert.doesNotMatch(result.stdout + result.stderr, /https:\/\/www\.mmdbkk\.com\/member\/api\/liff\/public-membership\/purchase/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("explicit manual approval reaches the acceptance flow, with failure reported separately", () => {
  const dir = mkdtempSync(join(tmpdir(), "my-mmd-gate-"));
  try {
    const stub = join(dir, "curl");
    writeFileSync(stub, `#!/bin/sh\necho attempted > "${join(dir, "attempted")}"\nexit 91\n`);
    chmodSync(stub, 0o755);
    const result = spawnSync("/bin/bash", ["-e", "-c", script], {
      env: {
        PATH: dir, RUNNER_TEMP: dir,
        GITHUB_OUTPUT: join(dir, "output"), GITHUB_STEP_SUMMARY: join(dir, "summary"),
        MY_MMD_E2E_ID_TOKEN: "example-token", PAYMENT_CENTER_INTENT_APPROVED: "true",
        PAYMENT_CENTER_TEST_PLAN: "approved-plan-reference",
      },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(dir, "attempted")), true);
    assert.match(readFileSync(join(dir, "output"), "utf8"), /^status=FAILED$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
