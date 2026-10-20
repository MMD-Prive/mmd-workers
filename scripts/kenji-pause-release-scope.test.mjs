import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deployRequired } from './kenji-pause-release-scope.mjs';
const config = 'member-dashboard-chat-worker/wrangler.toml';
test('exact rights alias uses manual Kenji-only release and never masks mixed deployment', () => {
  const files = ['member-dashboard-chat-worker/src/kenji-line-rights-check.mjs', 'member-dashboard-chat-worker/test/kenji-line-rights-check.test.mjs', 'scripts/kenji-pause-release-scope.mjs', 'scripts/kenji-pause-release-scope.test.mjs'];
  assert.equal(deployRequired('push', files), false);
  assert.equal(deployRequired('push', [...files, 'mms-worker/src/index.js']), true);
  assert.equal(deployRequired('push', [...files, config], '', 'LINE_AUTO_REPLY_ENABLED = "false"'), true);
});
test('owner pause config and guard files skip automatic release', () => {
  assert.equal(deployRequired('push', [config, 'scripts/kenji-pause-release-scope.mjs'], '# old\nLINE_AUTO_REPLY_ENABLED = "true"\nX = "same"', '# paused\nLINE_AUTO_REPLY_ENABLED = "false"\nX = "same"'), false);
});
test('test-only correction skips release', () => {
  assert.equal(deployRequired('push', ['member-dashboard-chat-worker/test/kenji-model-only-owner-lock.test.mjs']), false);
});
test('runtime change or unrelated config never qualifies as pause-only', () => {
  assert.equal(deployRequired('push', [config, 'member-dashboard-chat-worker/src/index.js'], '', ''), true);
  assert.equal(deployRequired('push', [config], 'X = "old"', 'LINE_AUTO_REPLY_ENABLED = "false"\nX = "new"'), true);
  assert.equal(deployRequired('push', [config], '', 'LINE_AUTO_REPLY_ENABLED = "true"'), true);
});
test('manual release remains explicit and unavailable diff stops', () => {
  assert.equal(deployRequired('workflow_dispatch', []), true);
  assert.throws(() => deployRequired('push', []));
});
test('scope gate protects the entire credential-bearing deployment job', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-member-dashboard-chat-worker.yml', import.meta.url), 'utf8');
  assert.match(workflow, /validate-and-deploy:\n    needs: release-scope\n    if: needs.release-scope.outputs.deploy_required == 'true'/);
  const scope = workflow.slice(workflow.indexOf('  release-scope:'), workflow.indexOf('  validate-and-deploy:'));
  assert.doesNotMatch(scope, /secrets\.|wrangler|route_sync/);
  assert.match(scope, /fetch-depth: 0/);
});
