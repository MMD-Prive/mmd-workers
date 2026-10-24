import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deployRequired, PERSONAL_MAIN_RELEASE_PATHS, validatePersonalMainManifest } from './kenji-pause-release-scope.mjs';
const config = 'member-dashboard-chat-worker/wrangler.toml';
const richMenuPauseFiles = [
  '.github/workflows/kenji-context-followup-ci.yml',
  'member-dashboard-chat-worker/src/kenji-seed-line-runtime.mjs',
  'member-dashboard-chat-worker/test/rich-menu-conversation.test.mjs',
  'member-dashboard-chat-worker/test/rich-menu-navigation-webhook.test.mjs',
];
test('PR 2608 exact Rich Menu pause scope skips the entire automatic deployment job', () => {
  assert.equal(deployRequired('push', richMenuPauseFiles), false);
  assert.equal(deployRequired('push', [...richMenuPauseFiles,
    'scripts/kenji-pause-release-scope.mjs', 'scripts/kenji-pause-release-scope.test.mjs']), false);
  for (const file of richMenuPauseFiles) assert.equal(deployRequired('push', [file]), false);
});
test('Rich Menu scope never masks unrelated source, deployment workflow or configuration changes', () => {
  for (const unrelated of ['mms-member-worker/src/index.js', 'member-dashboard-chat-worker/src/index.js',
    'member-dashboard-chat-worker/src/rich-menu-unreviewed.mjs', '.github/workflows/unreviewed-deploy.yml']) {
    assert.equal(deployRequired('push', [...richMenuPauseFiles, unrelated]), true);
  }
  assert.equal(deployRequired('push', [...richMenuPauseFiles, config], '', 'LINE_AUTO_REPLY_ENABLED = "false"'), true);
  assert.equal(deployRequired('workflow_dispatch', richMenuPauseFiles), true);
});
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

const manifestBefore = JSON.stringify({scripts:{'test:member-pages-liff':'node --test existing.test.mjs'},dependencies:{safe:'1.0.0'}});
const manifestAfter = manifestBefore.replace('existing.test.mjs', 'existing.test.mjs member-pages-worker/test/member-personal-main.test.mjs member-pages-worker/test/liff-personal-main.test.mjs');
const manifest = {before:manifestBefore,after:manifestAfter};
// Exact changed paths of reviewed PR #2618 (3389d9b).
const personalMainFiles = [
  'member-dashboard-chat-worker/src/kenji-member-app.js',
  'member-dashboard-chat-worker/test/kenji-member-app.test.mjs',
  'member-pages-worker/src/kenji-member-session-truth.js',
  'member-pages-worker/src/liff-member-shell.js',
  'member-pages-worker/src/liff-personal-main.js',
  'member-pages-worker/src/member-app-api-runtime.js',
  'member-pages-worker/src/member-personal-main.js',
  'member-pages-worker/src/runtime-index.js',
  'member-pages-worker/test/liff-member-compact-v4.test.mjs',
  'member-pages-worker/test/liff-member-shell.test.mjs',
  'member-pages-worker/test/liff-personal-main.test.mjs',
  'member-pages-worker/test/liff-quick-membership.test.mjs',
  'member-pages-worker/test/member-personal-main.test.mjs',
  'shared/personal-main-catalog.mjs',
  'package.json',
];
test('PR 2618 exact delta and its guard patch never enter legacy deployment',()=>{
  assert.equal(deployRequired('push',personalMainFiles,'','',manifest),false);
  assert.equal(deployRequired('push',[...personalMainFiles,'scripts/kenji-pause-release-scope.mjs','scripts/kenji-pause-release-scope.test.mjs'],'','',manifest),false);
  for(const anchor of ['member-dashboard-chat-worker/src/kenji-member-app.js','member-pages-worker/src/liff-personal-main.js','member-pages-worker/src/member-personal-main.js','shared/personal-main-catalog.mjs'])assert.equal(deployRequired('push',[anchor]),false);
});
test('Personal Main mixed config, dependencies, workflows and unrelated runtime fail closed',()=>{
  for(const extra of [config,'member-pages-worker/wrangler.toml','package-lock.json','member-pages-worker/package.json',
    '.github/workflows/deploy-member-dashboard-chat-worker.yml','.github/workflows/unreviewed-deploy.yml',
    'mms-member-worker/src/index.js','member-dashboard-chat-worker/src/index.js','shared/payment-intelligence.mjs',
    'scripts/kenji-code-only-promote.mjs','unknown-file.js']){
    for(const files of [[...personalMainFiles,extra],[extra,...personalMainFiles]]){
      assert.throws(()=>deployRequired('push',files,'','LINE_AUTO_REPLY_ENABLED = "false"'),/PERSONAL_MAIN_MIXED_DELTA/);
    }
  }
});
test('Personal Main hold does not silently classify package-only or unrelated changes',()=>{
  assert.equal(deployRequired('push',['package.json']),true);
  assert.equal(deployRequired('push',['mms-member-worker/src/index.js']),true);
  assert.equal(deployRequired('workflow_dispatch',personalMainFiles),true);
});

test('every Personal Main runtime path detects and rejects a mixed push in either order',()=>{
 const runtime=[...PERSONAL_MAIN_RELEASE_PATHS].filter(p=>p.includes('/src/')||p.startsWith('shared/'));
 assert.equal(runtime.length,8);
 for(const file of runtime){
  assert.equal(deployRequired('push',[file]),false);
  for(const mixed of [[file,'member-dashboard-chat-worker/src/index.js'],['member-dashboard-chat-worker/src/index.js',file]])assert.throws(()=>deployRequired('push',mixed),/PERSONAL_MAIN_MIXED_DELTA/);
 }
});
test('only exact root manifest test-list addition is accepted',()=>{
 assert.doesNotThrow(()=>validatePersonalMainManifest(manifestBefore,manifestAfter));
 for(const after of [manifestAfter.replace('1.0.0','2.0.0'),manifestAfter.replace('node --test','node arbitrary.js --test'),manifestAfter.replace('"scripts":','"newKey":true,"scripts":'),manifestAfter+'\n',manifestBefore,'{invalid']){
  assert.throws(()=>deployRequired('push',['member-pages-worker/src/runtime-index.js','package.json'],'','',{before:manifestBefore,after}),/PERSONAL_MAIN_MANIFEST_DELTA/);
 }
 assert.throws(()=>deployRequired('push',['member-pages-worker/src/runtime-index.js','package.json']),/PERSONAL_MAIN_MANIFEST_DELTA/);
 assert.throws(()=>validatePersonalMainManifest('{invalid',manifestAfter),/PERSONAL_MAIN_MANIFEST_DELTA/);
 assert.throws(()=>validatePersonalMainManifest(manifestAfter,manifestAfter),/PERSONAL_MAIN_MANIFEST_DELTA/);
 for(const file of ['package.json','member-pages-worker/test/member-personal-main.test.mjs'])assert.equal(deployRequired('push',[file]),true);
});

const hennaFiles = ['member-dashboard-chat-worker/src/mms-line-runtime.mjs',
 'member-dashboard-chat-worker/test/mms-line-runtime.test.mjs',
 'scripts/kenji-pause-release-scope.mjs', 'scripts/kenji-pause-release-scope.test.mjs'];
test('HENNA copy release skips legacy deployment and route reconciliation', () => {
 assert.equal(deployRequired('push', hennaFiles), false);
 assert.equal(deployRequired('workflow_dispatch', hennaFiles), true);
 for (const extra of [config, 'mms-worker/src/index.js', 'shared/payment-intelligence.mjs', '.github/workflows/deploy-member-dashboard-chat-worker.yml']) {
  assert.throws(() => deployRequired('push', [...hennaFiles, extra]), /HENNA_COPY_MIXED_DELTA/);
 }
});

test('MMS Kenji control projection uses code-only release and rejects unrelated runtime or config',()=>{
 const files=['admin-worker/src/mms-ai-ops-read.js','admin-worker/src/mms-ai-ops-ui.js','admin-worker/mms-ai-ops.test.mjs',
 'admin-ai-ops-worker/src/mms-advisory.js','admin-ai-ops-worker/test/mms-advisory.test.mjs',
 'member-dashboard-chat-worker/src/index.js','member-dashboard-chat-worker/test/kenji-runtime-health.test.mjs',
 'scripts/kenji-pause-release-scope.mjs','scripts/kenji-pause-release-scope.test.mjs','.github/workflows/deploy-admin-ai-ops-worker.yml'];
 assert.equal(deployRequired('push',files),false);
 assert.equal(deployRequired('workflow_dispatch',files),true);
 for(const extra of [config,'mms-worker/src/core.mjs','admin-worker/src/auth.js','shared/canonical-payment-evidence.mjs']){
  assert.throws(()=>deployRequired('push',[...files,extra]),/MMS_KENJI_CONTROL_MIXED_DELTA/);
 }
 const workflow=readFileSync(new URL('../.github/workflows/deploy-admin-ai-ops-worker.yml',import.meta.url),'utf8');
 assert.match(workflow,/deploy-and-smoke:\n    needs: release-scope\n    if: needs.release-scope.outputs.deploy_required == 'true'/);
});

const lineEvidenceFiles = [
  'member-dashboard-chat-worker/src/line-group-ingress-front-gate.js',
  'member-dashboard-chat-worker/src/line-job-evidence-binding.mjs',
  'member-dashboard-chat-worker/test/line-job-evidence-binding.test.mjs',
];
test('LINE job evidence uses code-only release without legacy MMS deploy or routes', () => {
  for (const files of [lineEvidenceFiles, [...lineEvidenceFiles, 'scripts/kenji-pause-release-scope.mjs', 'scripts/kenji-pause-release-scope.test.mjs']]) {
    assert.equal(deployRequired('push', files), false);
  }
  for (const extra of [config, 'mms-worker/src/index.js', 'member-dashboard-chat-worker/src/index.js', '.github/workflows/deploy-member-dashboard-chat-worker.yml']) {
    assert.throws(() => deployRequired('push', [...lineEvidenceFiles, extra]), /LINE_JOB_EVIDENCE_MIXED_DELTA/);
  }
});
