import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const directory = new URL('../.github/workflows/', import.meta.url);
const files = [
  'deploy-admin-worker.yml', 'audience-production-ingress.yml',
  'calendar-production-connection.yml', 'control-room-v2-production-acceptance.yml',
  'create-job-per-rename-production-smoke.yml', 'deploy-kenji-recommendation-layer.yml',
  'ensure-admin-kenji-query-routes.yml', 'historical-backfill-authenticated-controlled-smoke.yml',
  'historical-backfill-route-gate.yml', 'kenji-ceo-actions-production-smoke.yml',
  'mms-admin-production-state.yml', 'model-asset-readiness-route-sync.yml',
  'model-media-real-e2e-production-smoke.yml', 'model-supply-production-ingress.yml',
  'model-wish-review-route-sync.yml', 'owner-actions-daily-adoption.yml',
  'owner-book-ei-verify.yml', 'owner-payment-reissue.yml',
  'private-model-liff-production-smoke.yml', 'private-model-work-production-smoke.yml',
  'repair-admin-login-routes.yml', 'repair-control-room-dashboard-route.yml',
  'kenji-ceo-control-production-smoke.yml', 'mmd-rich-menu-production-acceptance.yml',
];
const read = file => readFileSync(new URL(file, directory), 'utf8');
const condition = "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.production_approved == true && inputs.approval_ref != '' && inputs.approved_sha == github.sha";
const localValidation = new Set(['validate', 'contract', 'validate-contract']);
function jobs(source) {
  return [...source.split('\njobs:\n')[1].matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)]
    .map(([, id, body]) => ({ id, body }));
}

function assertSafety(source) {
  assert.doesNotMatch(source.split('\njobs:')[0], /^  (workflow_run|schedule):/m);
  assert.match(source, /production_approved:[\s\S]*?type: boolean\n        required: true\n        default: false/);
  assert.match(source, /approval_ref:[\s\S]*?type: string\n        required: true/);
  assert.match(source, /approved_sha:[\s\S]*?type: string\n        required: true/);
  const parsedJobs = jobs(source);
  assert.ok(parsedJobs.length >= 2);
  assert.ok(parsedJobs.some(job => job.id === 'production-approval'));
  for (const { id, body } of parsedJobs) {
    if (localValidation.has(id)) {
      const executable = body.split('\n').filter(line => !/^\s*grep\s/.test(line)).join('\n');
      assert.doesNotMatch(executable, /secrets\.|wrangler\s+(deploy|secret|route)|curl |fetch\(/);
      continue;
    }
    assert.ok(body.includes(`    if: ${condition}\n`), `${id}: exact manual/approval/SHA guard required`);
    if (id === 'production-approval') {
      assert.match(body, /uses: \.\/\.github\/workflows\/admin-production-approval.yml/);
      assert.match(body, /approval_ref: \$\{\{ inputs.approval_ref \}\}/);
      assert.match(body, /approved_sha: \$\{\{ inputs.approved_sha \}\}/);
    } else {
      assert.match(body, /^    needs: \[production-approval(?:, [\w-]+)*\]$/m);
      assert.match(body, /^    environment: mmd-production-mutation$/m);
      assert.doesNotMatch(body, /ref: main\b/);
    }
  }
}

for (const file of files) test(`${file}: production work is independently approval-gated`, () => {
  const source = read(file);
  assertSafety(source);
  // Only Calendar retains a legacy branch CI trigger. No push can reach production.
  if (file !== 'calendar-production-connection.yml') assert.doesNotMatch(source.split('\njobs:')[0], /^  push:/m);
});

test('no remaining workflow automatically fans out from Deploy admin-worker', () => {
  for (const file of readdirSync(directory).filter(file => /\.ya?ml$/.test(file))) {
    const header = read(file).split('\njobs:')[0];
    assert.ok(!(/workflow_run:/.test(header) && /Deploy admin-worker/.test(header)), file);
  }
});

test('approval helper workflow has no production credentials or mutation command', () => {
  const source = read('admin-production-approval.yml');
  assert.match(source, /^  workflow_call:/m);
  assert.match(source, /ref: \$\{\{ github.sha \}\}/);
  assert.doesNotMatch(source, /secrets\.|secrets: inherit|wrangler|curl|environment:/);
});

test('automatic CI is credential-free and runs gate and current-session regressions', () => {
  const source = read('admin-workflow-safety-ci.yml');
  assert.match(source, /^  pull_request:/m);
  assert.match(source, /^  push:/m);
  assert.match(source, /branches: \[main\]/);
  assert.match(source, /admin-production-approval.test.mjs scripts\/admin-workflow-safety.test.mjs/);
  assert.match(source, /model-current-session.test.mjs admin-worker\/model-session-runtime-v1a.test.mjs/);
  assert.doesNotMatch(source, /secrets\.|wrangler|curl |workflow_run:|environment:/);
});

test('guard mutations fail regression: fan-out, missing needs/environment, and permissive condition', () => {
  const source = read('owner-payment-reissue.yml');
  for (const altered of [
    source.replace('  workflow_dispatch:', '  workflow_run:\n    workflows: [Deploy admin-worker]\n  workflow_dispatch:'),
    source.replace('    needs: [production-approval]\n', ''),
    source.replace('    environment: mmd-production-mutation\n', ''),
    source.replaceAll(condition, "github.event_name == 'push'"),
    source.replace('        default: false', '        default: true'),
  ]) assert.throws(() => assertSafety(altered));
});

test('workflow conditions deny automatic events and unapproved/mismatched dispatches', () => {
  const evaluate = new Function('github', 'inputs', `return ${condition};`);
  const github = { event_name: 'workflow_dispatch', ref: 'refs/heads/main', sha: 'a'.repeat(40) };
  const inputs = { production_approved: true, approval_ref: 'owner-ref', approved_sha: github.sha };
  assert.equal(evaluate(github, inputs), true);
  for (const event_name of ['push', 'pull_request', 'workflow_run', 'schedule']) {
    assert.equal(evaluate({ ...github, event_name }, inputs), false);
  }
  assert.equal(evaluate(github, { ...inputs, production_approved: false }), false);
  assert.equal(evaluate(github, { ...inputs, approved_sha: 'b'.repeat(40) }), false);
  assert.equal(evaluate(github, { ...inputs, approval_ref: '' }), false);
  assert.equal(evaluate({ ...github, ref: 'refs/heads/feature' }, inputs), false);
});
