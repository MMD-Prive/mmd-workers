import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyConfirmationRelease, inspectConfirmationRelease, CONFIRMATION_RELEASE_BASELINE } from './payments-confirmation-release-guard.mjs';

const before = '1'.repeat(40), after = '2'.repeat(40);
const patch = [
  'payments-worker/confirmation-ack.js',
  'payments-worker/model-confirm-no-silent-failure.test.mjs',
  'webflow/sigil/confirm/job-model-v15-i18n.js',
  'webflow/sigil/confirm/job-model-v15-no-silent-failure.test.mjs',
];
const classify = files => classifyConfirmationRelease({ event: 'push', before, after, head: after, files, confirmationChanges: [] });
const source = name => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');

test('PR 2706 and each protected path require owner-approved release, including mixed pushes', () => {
  assert.equal(classify(patch).ownerApprovedRequired, true);
  for (const file of patch) {
    assert.equal(classify([file]).ownerApprovedRequired, true);
    assert.equal(classify([file, 'payments-worker/index.js', 'payments-worker/wrangler.merged.toml']).ownerApprovedRequired, true);
  }
  assert.equal(classify([...patch,
    '.github/workflows/deploy-payments-worker.yml',
    'scripts/payments-confirmation-release-guard.mjs',
    'scripts/payments-confirmation-release-guard.test.mjs',
  ]).ownerApprovedRequired, true);
});

test('unrelated verified push retains the existing integrated release decision', () => {
  assert.deepEqual(classify(['payments-worker/final-payment-flow.js']), { ownerApprovedRequired: false, reason: 'unrelated_push' });
});

test('manual, missing/zero SHA, wrong checkout, and empty diff fail closed', () => {
  for (const override of [
    { event: 'workflow_dispatch' }, { event: 'pull_request' }, { before: undefined },
    { before: '0'.repeat(40) }, { after: 'not-a-sha' }, { head: before },
    { files: [] }, { files: null }, { files: [null] },
  ]) {
    assert.equal(classifyConfirmationRelease({ event: 'push', before, after, head: after, files: ['payments-worker/index.js'], confirmationChanges: [], ...override }).ownerApprovedRequired, true);
  }
});

test('git failures and missing refs cannot enable the credential-bearing job', () => {
  for (const failureAt of ['head', 'diff']) {
    const result = inspectConfirmationRelease({ EVENT_NAME: 'push', BEFORE_SHA: before, AFTER_SHA: after }, args => {
      if (args[0] === 'rev-parse' && failureAt !== 'head') return after;
      throw new Error('PRIVATE_SENTINEL');
    });
    assert.equal(result.ownerApprovedRequired, true);
    assert.equal(result.reason, 'diff_unavailable');
    assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  }
  let calls = 0;
  assert.equal(inspectConfirmationRelease({ EVENT_NAME: 'workflow_dispatch' }, () => { calls++; }).ownerApprovedRequired, true);
  assert.equal(calls, 0);
});

test('actual git adapter uses verified refs, NUL-delimited paths, and includes deleted rename source', () => {
  const calls = [];
  const decision = inspectConfirmationRelease({ EVENT_NAME: 'push', BEFORE_SHA: before, AFTER_SHA: after }, args => {
    calls.push(args);
    if (args[0] === 'rev-parse') return `${after}\n`;
    return args.includes(CONFIRMATION_RELEASE_BASELINE) ? 'payments-worker/confirmation-ack.js\0' : 'payments-worker/confirmation-ack.js\0payments-worker/new-name.js\0';
  });
  assert.equal(decision.ownerApprovedRequired, true);
  assert.deepEqual(calls, [['rev-parse', 'HEAD'], ['diff', '--name-only', '--no-renames', '-z', before, after, '--'], ['diff', '--name-only', '--no-renames', '-z', CONFIRMATION_RELEASE_BASELINE, after, '--', ...patch]]);
});

test('CLI emits only the closed GitHub output for manual dispatch and no caller secrets', t => {
  const dir = mkdtempSync(join(tmpdir(), 'mmd-confirm-release-guard-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const output = join(dir, 'output');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./payments-confirmation-release-guard.mjs', import.meta.url))], {
    env: { ...process.env, EVENT_NAME: 'workflow_dispatch', GITHUB_OUTPUT: output, PRIVATE_SENTINEL: 'not-for-output' }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(output, 'utf8'), 'owner_approved_required=true\n');
  assert.match(result.stdout, /use_owner_approved_workflow/);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_SENTINEL|not-for-output/);
});

test('the guard gates the whole integrated job, before secret rotation, upload, deploy, and schedule', () => {
  const workflow = source('deploy-payments-worker.yml');
  const start = workflow.indexOf('  scope:'), deploy = workflow.indexOf('  validate-and-deploy:');
  const scope = workflow.slice(start, deploy);
  const job = workflow.slice(deploy);
  assert.match(scope, /owner_approved_required: \$\{\{ steps.confirmation_guard.outputs.owner_approved_required \}\}/);
  assert.match(scope, /run: node scripts\/payments-confirmation-release-guard.mjs/);
  assert.match(scope, /fetch-depth: 0/);
  assert.doesNotMatch(scope, /\$\{\{\s*secrets\.|npx[^\n]*wrangler|\bcurl\s/);
  assert.match(job, /needs: scope\n    if: needs.scope.outputs.projection_only != 'true' && needs.scope.outputs.owner_approved_required == 'false'/);
  for (const marker of ['Rotate payments-to-Telegram service secret', 'id: upload', 'id: deploy_version', 'Ensure payment notification retry schedule']) {
    assert.ok(job.indexOf(marker) > job.indexOf('owner_approved_required'), marker);
  }
});

test('owner-approved exact-SHA/environment gates remain and receipt validation precedes upload', () => {
  const workflow = source('deploy-payments-worker-owner-approved.yml');
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule|workflow_run):/m);
  for (const gate of ["github.ref == 'refs/heads/main'", "github.actor == 'mmdprive'", "github.triggering_actor == 'mmdprive'", 'github.run_attempt == 1', 'inputs.production_approved == true', 'inputs.approved_sha == github.sha', 'environment: mmd-production-mutation', "if: needs.verify-protection.result == 'success'"]) {
    assert.ok(workflow.includes(gate), gate);
  }
  assert.match(workflow, /uses: \.\/\.github\/workflows\/admin-production-approval.yml/);
  assert.match(workflow, /ref: \$\{\{ inputs.approved_sha \}\}/);
  const validation = workflow.indexOf('Validate model acknowledgement receipts before release');
  assert.ok(validation > 0 && validation < workflow.indexOf('id: upload'));
  for (const file of ['payments-worker/confirmation-ack.test.mjs', 'payments-worker/confirmation-ack-revision.test.mjs', 'payments-worker/model-confirm-no-silent-failure.test.mjs', 'webflow/sigil/confirm/job-model-v15-no-silent-failure.test.mjs']) {
    assert.ok(workflow.indexOf(file, validation) < workflow.indexOf('id: upload') && workflow.indexOf(file, validation) >= 0);
  }
  assert.doesNotMatch(workflow, /wrangler(?:@\S+)?\s+(?:versions\s+)?secret\s+put|ensure-payment-notification-cron/);
});

test('release guard syntax and regression tests run in PR and main safety CI', () => {
  const workflow = source('admin-workflow-safety-ci.yml');
  assert.equal((workflow.match(/'scripts\/payments-confirmation-release-guard\*'/g) || []).length, 2);
  assert.match(workflow, /node --check scripts\/payments-confirmation-release-guard.mjs/);
  assert.match(workflow, /node --test scripts\/payments-confirmation-release-guard.test.mjs/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\n    branches: \[main\]/);
});


test('later unrelated pushes cannot deploy held confirmation changes; unavailable baseline also stays closed', () => {
  const context = { event: 'push', before, after, head: after, files: ['payments-worker/index.js'] };
  for (const confirmationChanges of [patch, undefined, ['unverified-path']]) {
    assert.equal(classifyConfirmationRelease({ ...context, confirmationChanges }).ownerApprovedRequired, true);
  }
  const result = inspectConfirmationRelease({ EVENT_NAME: 'push', BEFORE_SHA: before, AFTER_SHA: after }, args => {
    if (args[0] === 'rev-parse') return after;
    if (args.includes(CONFIRMATION_RELEASE_BASELINE)) throw new Error('missing baseline');
    return 'payments-worker/index.js\0';
  });
  assert.equal(result.ownerApprovedRequired, true);
});

test('verified unrelated pushes with unchanged confirmation files remain eligible for the existing pipeline', () => {
  const result = inspectConfirmationRelease({ EVENT_NAME: 'push', BEFORE_SHA: before, AFTER_SHA: after }, args => {
    if (args[0] === 'rev-parse') return after;
    return args.includes(CONFIRMATION_RELEASE_BASELINE) ? '' : 'payments-worker/index.js\0';
  });
  assert.equal(result.ownerApprovedRequired, false);
});
