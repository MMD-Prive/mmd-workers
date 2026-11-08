import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../.github/workflows/deploy-kenji-member-ui-only.yml', import.meta.url), 'utf8');
const BASE = '9f576666e506d78630179604fbb2c4ec7fbd30b5';
const LIVE = '5e4f2868-6295-420e-8c0d-a67975e127ec';
const CANDIDATE = 'fb2caa7c717a70ff9047485ca0ea45612e1f8093';

test('Kenji UI-only release is manual and pinned to two immutable SHAs', () => {
  const trigger=source.split('\non:\n')[1]?.split('\npermissions:')[0]||'';
  assert.match(trigger,/workflow_dispatch:/);
  assert.doesNotMatch(trigger,/\b(push|pull_request|workflow_run|schedule):/);
  assert.ok(source.includes(BASE));
  assert.ok(source.includes(CANDIDATE));
  assert.ok(source.includes(LIVE));
  assert.match(source,/github\.ref == 'refs\/heads\/main'/);
  assert.match(source,/inputs\.approved_workflow_sha == github\.sha/);
  assert.match(source,/inputs\.candidate_sha == 'fb2caa7c717a70ff9047485ca0ea45612e1f8093'/);
  assert.match(source,/default: true/);
  assert.match(source,/default: false/);
  assert.match(source,/inputs\.dry_run_only == false/);
  assert.match(source,/inputs\.production_approved == true/);
});

test('the only permitted source delta is 3 Kenji UI files and 1 test', () => {
  for (const path of [
    'member-dashboard-chat-worker/src/kenji-member-app.js',
    'member-dashboard-chat-worker/src/kenji-member-brand-assets.js',
    'member-dashboard-chat-worker/src/kenji-next-lv-page.js',
    'member-dashboard-chat-worker/test/kenji-member-app.test.mjs',
  ]) assert.ok(source.includes(path), path);
  assert.match(source,/git diff --name-only --no-renames/);
  assert.match(source,/diff -u "\$RUNNER_TEMP\/kenji-expected-paths" "\$RUNNER_TEMP\/kenji-actual-paths"/);
  assert.match(source,/BFF\/identity\/chat logic changed/);
  assert.match(source,/member-dashboard-chat-worker\/wrangler\.toml/);
  assert.match(source,/src\/front-gate-index\.js/);
  assert.match(source,/src\/kenji-seed-line-runtime\.mjs/);
  assert.match(source,/LIVE LINE switch/);
});

test('release preserves bindings, verifies production identity and supports safe rollback', () => {
  assert.match(source,/group: deploy-member-dashboard-chat-worker-production/);
  assert.match(source,/environment: mmd-production-mutation/);
  assert.match(source,/PRODUCTION CHANGED: refusing isolated release/);
  assert.match(source,/assert\.deepEqual\(actual,live/);
  assert.match(source,/--keep-vars/);
  assert.match(source,/versions upload --dry-run/);
  assert.match(source,/versions upload --keep-vars/);
  assert.match(source,/versions deploy "\$KENJI_UPLOADED_VERSION@100%" -y/);
  assert.match(source,/versions deploy "\$BASELINE_VERSION@100%" -y/);
  assert.match(source,/steps\.promote\.outcome == 'success'/);
  assert.match(source,/version_id!==process\.env\.KENJI_UPLOADED_VERSION/);
  assert.doesNotMatch(source,/wrangler(?:@4)? deploy\s/);
  assert.doesNotMatch(source,/workers\/routes.*method: ["']POST/);
  assert.doesNotMatch(source,/working-directory: (?:admin-worker|payments-worker|member-pages-worker)/);
});

test('smoke protects Kenji, LINE, member auth and MY MMD', () => {
  for (const path of [
    '/member/kenji',
    '/api/member/kenji/chat',
    '/webhooks/line',
    '/webhooks/line/mms',
    '/my-mmd/payments',
    '/member/liff?intent=status',
  ]) assert.ok(source.includes(path), path);
  assert.match(source,/x-mmd-kenji: member-app-next-lv/);
  assert.match(source,/test "\$code" = "401"/);
  assert.match(source,/data:image\/png;base64/);
});
