import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const directory = new URL('../.github/workflows/', import.meta.url);
const read = file => readFileSync(new URL(file, directory), 'utf8');
const condition = "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.production_approved == true && inputs.approval_ref != '' && inputs.approved_sha == github.sha && github.run_attempt == 1";
const files = [
  'deploy-telegram-worker.yml', 'sync-telegram-worker-routes.yml',
  'telegram-worker-maintenance.yml', 'deploy-admin-worker-direct-hotfix.yml',
];

// Same source-contract approach as admin-workflow-safety.test.mjs.
function jobs(source) {
  return [...source.split('\njobs:\n')[1].matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)]
    .map(([, id, body]) => ({ id, body }));
}

function assertManual(source) {
  const header = source.split('\njobs:')[0];
  assert.match(header, /^  workflow_dispatch:/m);
  assert.doesNotMatch(header, /^  (push|pull_request|pull_request_target|workflow_run|workflow_call|schedule|repository_dispatch):/m);
  assert.match(header, /production_approved:[\s\S]*?type: boolean\n        required: true\n        default: false/);
  assert.match(header, /approval_ref:[\s\S]*?type: string\n        required: true/);
  assert.match(header, /approved_sha:[\s\S]*?type: string\n        required: true/);
  assert.match(header, /permissions:\n  contents: read/);
  assert.doesNotMatch(header, /secrets\.|write-all|actions: write|contents: write/);
  assert.match(header, /cancel-in-progress: false/);
  const parsed = jobs(source);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, 'production-approval');
  for (const { id, body } of parsed) {
    assert.ok(body.includes(`    if: ${condition}\n`), `${id}: exact guard required`);
    assert.doesNotMatch(body, /continue-on-error:\s*true/);
    if (id === 'production-approval') {
      assert.match(body, /uses: \.\/\.github\/workflows\/admin-production-approval.yml/);
      assert.match(body, /approval_ref: \$\{\{ inputs.approval_ref \}\}/);
      assert.match(body, /approved_sha: \$\{\{ inputs.approved_sha \}\}/);
      assert.doesNotMatch(body, /secrets\.|secrets: inherit/);
    } else {
      assert.match(body, /^    needs: \[production-approval\]$/m);
      assert.match(body, /^    environment: mmd-production-mutation$/m);
      assert.match(body, /ref: \$\{\{ github.sha \}\}/);
      assert.match(body, /persist-credentials: false/);
      assert.doesNotMatch(body, /ref: main\b|actions\/workflows\/.*dispatches/);
    }
  }
}

for (const file of files) {
  test(`${file}: manual exact-SHA owner approval, no rerun`, () => assertManual(read(file)));
  test(`${file}: guard regressions are rejected`, () => {
    const source = read(file);
    for (const altered of [
      source.replace('  workflow_dispatch:', '  push:\n    branches: [main]\n  workflow_dispatch:'),
      source.replace('  workflow_dispatch:', '  workflow_run:\n    workflows: [Deploy telegram-worker]\n  workflow_dispatch:'),
      source.replaceAll(condition, "github.event_name == 'push'"),
      source.replaceAll(' && github.run_attempt == 1', ''),
      source.replace('        default: false', '        default: true'),
      source.replace('    needs: [production-approval]\n', ''),
      source.replace('    environment: mmd-production-mutation\n', ''),
      source.replace('ref: ${{ github.sha }}', 'ref: main'),
    ]) assert.throws(() => assertManual(altered));
  });
}

test('job guards deny push, fork PR, absent approval, mismatched SHA and reruns', () => {
  const evaluate = new Function('github', 'inputs', `return ${condition};`);
  const github = { event_name: 'workflow_dispatch', ref: 'refs/heads/main', sha: 'a'.repeat(40), run_attempt: 1 };
  const inputs = { production_approved: true, approval_ref: 'owner-fixture', approved_sha: github.sha };
  assert.equal(evaluate(github, inputs), true);
  for (const event_name of ['push', 'pull_request', 'pull_request_target', 'workflow_run', 'workflow_call', 'schedule', 'repository_dispatch']) {
    assert.equal(evaluate({ ...github, event_name }, inputs), false);
  }
  for (const override of [{ production_approved: false }, { approval_ref: '' }, { approved_sha: 'b'.repeat(40) }]) {
    assert.equal(evaluate(github, { ...inputs, ...override }), false);
  }
  assert.equal(evaluate({ ...github, run_attempt: 2 }, inputs), false);
  assert.equal(evaluate({ ...github, ref: 'refs/heads/unreviewed' }, inputs), false);
});

test('Telegram release has no route, secret, webhook, room or message side effects', () => {
  const source = read('deploy-telegram-worker.yml');
  assert.doesNotMatch(source, /CLOUDFLARE_ROUTES|ZONE_ID|INTERNAL_API_TOKEN|TELEGRAM_BOT_TOKEN|AUTH_SERVICE_|smoke_topics|telegram-workflow-operations|ensure-canonical|premium-room|topics\/smoke|setChatMenuButton|secret put|secret bulk|triggers deploy/);
  assert.doesNotMatch(source, /--retry|wrangler@4(?:\s|$)|wrangler[^\n]*\sdeploy\b/);
  assert.match(source, /wrangler@4\.105\.0 versions upload --keep-vars/);
  assert.match(source, /deploy-uploaded-worker-version.mjs telegram-worker "\$version_id"/);
  assert.match(source, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
  for (const marker of ['mmd-concierge-capability-pack-v1-20260919', 'mmd-recovery-outcome-taxonomy-v1-20260919', 'mmd.hype_conversational_understanding.v2']) {
    assert.ok(source.includes(marker), 'existing health capability guard retained');
  }
  assert.doesNotMatch(source, /-X POST|\.\.\/admin-worker|npm run deploy/);
  const validation = source.split('      - name: Validate source and tests')[1].split('      - name: Upload and promote')[0];
  assert.doesNotMatch(validation, /secrets\./);
});

test('route sync has its own diff approval and only route credentials', () => {
  const source = read('sync-telegram-worker-routes.yml');
  assert.match(source, /approved_missing_patterns:[\s\S]*?type: string\n        required: true/);
  assert.match(source, /APPROVED_MISSING_PATTERNS: \$\{\{ inputs.approved_missing_patterns \}\}/);
  assert.match(source, /run: node scripts\/telegram-workflow-operations.mjs sync-routes/);
  assert.doesNotMatch(source, /wrangler|CLOUDFLARE_API_TOKEN|TELEGRAM_BOT_TOKEN|INTERNAL_API_TOKEN/);
});

test('maintenance is one opt-in operation with per-step credentials, not a deployment', () => {
  const source = read('telegram-worker-maintenance.yml');
  assert.match(source, /default: none/);
  assert.doesNotMatch(source, /^    env:/m);
  for (const operation of ['webhook', 'menu', 'premium-room', 'topic-smoke']) {
    assert.equal(source.split(`if: inputs.operation == '${operation}'`).length - 1, 1);
    assert.match(source, new RegExp(`run: node scripts/telegram-workflow-operations.mjs ${operation}\\n`));
  }
  assert.doesNotMatch(source, /wrangler|sync-routes|CLOUDFLARE_ROUTES|--retry|secret put/);
  for (const file of files.slice(0, 3)) assert.match(read(file), /group: deploy-telegram-worker-production/);
});

test('CI runs split-workflow regressions without production access', () => {
  const source = read('admin-workflow-safety-ci.yml');
  assert.equal(source.split("- 'scripts/telegram-workflow-*'").length - 1, 2);
  assert.match(source, /node --test scripts\/telegram-workflow-safety.test.mjs scripts\/telegram-workflow-operations.test.mjs scripts\/deploy-uploaded-worker-version.test.mjs/);
  assert.doesNotMatch(source, /secrets\.|environment:|wrangler|curl /);
});

test('no downstream workflow runs automatically on Telegram deploy completion', () => {
  for (const file of readdirSync(directory).filter(file => /\.ya?ml$/.test(file))) {
    const header = read(file).split('\njobs:')[0];
    assert.ok(!(/workflow_run:/.test(header) && /Deploy telegram-worker/.test(header)), file);
  }
});
