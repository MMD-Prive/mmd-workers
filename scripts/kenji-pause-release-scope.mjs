import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const configPath = 'member-dashboard-chat-worker/wrangler.toml';
const pausePaths = new Set([
  configPath,
  '.github/workflows/deploy-member-dashboard-chat-worker.yml',
  '.github/workflows/kenji-auto-reply-pause-ci.yml',
  'scripts/kenji-model-off-workflow.test.mjs',
  'scripts/kenji-pause-release-scope.mjs',
  'scripts/kenji-pause-release-scope.test.mjs',
  'member-dashboard-chat-worker/test/kenji-line-contextual-understanding-shadow.test.mjs',
  'member-dashboard-chat-worker/test/kenji-line-conversation-history.test.mjs',
  'member-dashboard-chat-worker/test/kenji-model-only-owner-lock.test.mjs',
]);
const normalize = value => value.split(/\r?\n/).map(line => line.trim())
  .filter(line => line && !line.startsWith('#') && !/^LINE_AUTO_REPLY_ENABLED\s*=/.test(line)).join('\n');

// These changes require a separately approved Kenji-only release. They must
// never enter the legacy job that deploys MMS and reconciles routes.
export const KENJI_MANUAL_RELEASE_PATHS = new Set([
  'member-dashboard-chat-worker/src/kenji-line-next-action.mjs',
  'member-dashboard-chat-worker/src/mmd-i18n.mjs',
  'member-pages-worker/src/kenji-line-member-truth.js',
  'member-dashboard-chat-worker/test/kenji-next-action.test.mjs',
  'member-dashboard-chat-worker/test/kenji-runtime-env-bindings.test.mjs',
  'member-dashboard-chat-worker/test/kenji-seed-runtime-cutover.test.mjs',
  'member-dashboard-chat-worker/src/kenji-line-live-truth.mjs',
  'member-dashboard-chat-worker/test/kenji-line-live-truth.test.mjs',
  'member-dashboard-chat-worker/src/kenji-line-rights-check.mjs',
  'member-dashboard-chat-worker/test/kenji-line-rights-check.test.mjs',
  'member-dashboard-chat-worker/src/kenji-context-followup.mjs',
  'member-dashboard-chat-worker/src/kenji-seed-line-runtime.mjs',
  'member-dashboard-chat-worker/src/rich-menu-conversation.mjs',
  'member-dashboard-chat-worker/src/rich-menu-navigation-reply.mjs',
  'member-dashboard-chat-worker/src/kenji-line-booking-accumulator.mjs',
  'member-dashboard-chat-worker/test/kenji-context-followup.test.mjs',
  'member-dashboard-chat-worker/test/rich-menu-conversation.test.mjs',
  'member-dashboard-chat-worker/test/rich-menu-navigation-reply.test.mjs',
  'member-dashboard-chat-worker/test/rich-menu-navigation-webhook.test.mjs',
  '.github/workflows/kenji-context-followup-ci.yml',
  '.github/workflows/kenji-code-only-promote.yml',
  '.github/workflows/per-support-code-only-release.yml',
  'scripts/kenji-code-only-promote.mjs',
  'scripts/kenji-code-only-promote.test.mjs',
]);

// Checkpts fast-path edits use the protected code-only release. Keep this
// exact set separate so unrelated index.js edits cannot bypass legacy scope.
const CHECKPTS_MANUAL_RELEASE_PATHS = new Set([
  'member-dashboard-chat-worker/src/checkpts-command.mjs',
  'member-dashboard-chat-worker/src/index.js',
  'member-dashboard-chat-worker/src/kenji-line-turn-aggregation.mjs',
  'member-dashboard-chat-worker/src/kenji-seed-line-runtime.mjs',
  'member-dashboard-chat-worker/src/rich-menu-conversation.mjs',
  'member-dashboard-chat-worker/test/checkpts-fastpath.test.mjs',
  'member-dashboard-chat-worker/test/kenji-line-rights-check.test.mjs',
  'member-dashboard-chat-worker/test/rich-menu-conversation.test.mjs',
  'member-dashboard-chat-worker/test/rich-menu-navigation-webhook.test.mjs',
  '.github/workflows/per-support-code-only-release.yml',
]);

// Checkpts reader recovery spans both Workers and must not run legacy route sync.
const CHECKPTS_READ_RELEASE_PATHS = new Set([
  'member-dashboard-chat-worker/src/kenji-seed-line-runtime.mjs',
  'member-dashboard-chat-worker/test/checkpts-fastpath.test.mjs',
  'member-pages-worker/src/member-history-recovery.js',
  'member-pages-worker/src/member-reply-snapshot.js',
  'member-pages-worker/src/member-reply-snapshot.test.mjs',
  'member-pages-worker/src/my-mmd-lifetime-points.js',
  'member-pages-worker/test/member-history-preload.test.mjs',
  'member-pages-worker/test/points-display-source-guard.test.mjs',
  'scripts/kenji-pause-release-scope.mjs',
  'scripts/kenji-pause-release-scope.test.mjs',
]);

// HENNA copy changes use an owner-approved code-only release, never the
// legacy job that deploys unrelated MMS code and reconciles routes.
const hennaCopyPaths = new Set([
  'member-dashboard-chat-worker/src/mms-line-runtime.mjs',
  'member-dashboard-chat-worker/test/mms-line-runtime.test.mjs',
  'scripts/kenji-pause-release-scope.mjs',
  'scripts/kenji-pause-release-scope.test.mjs',
]);

// MMS Kenji control truth spans read projections and authenticated runtime
// health. The approved code-only release must not run legacy route sync.
const mmsKenjiControlPaths = new Set([
  'admin-worker/src/mms-ai-ops-read.js',
  'admin-worker/src/mms-ai-ops-ui.js',
  'admin-worker/mms-ai-ops.test.mjs',
  'admin-ai-ops-worker/src/mms-advisory.js',
  'admin-ai-ops-worker/test/mms-advisory.test.mjs',
  'member-dashboard-chat-worker/src/index.js',
  'member-dashboard-chat-worker/test/kenji-runtime-health.test.mjs',
  'scripts/kenji-pause-release-scope.mjs',
  'scripts/kenji-pause-release-scope.test.mjs',
  '.github/workflows/deploy-admin-ai-ops-worker.yml',
]);

// Personal Main must use a separately approved code-only release for both owners.
// A mixed delta is an error, never permission to fall through to legacy deploy.
export const PERSONAL_MAIN_RELEASE_PATHS = new Set([
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
]);
const personalMainAnchors = new Set([...PERSONAL_MAIN_RELEASE_PATHS].filter(path =>
  path.includes('/src/') || path === 'shared/personal-main-catalog.mjs'));

export function validatePersonalMainManifest(before, after) {
  const error = 'PERSONAL_MAIN_MANIFEST_DELTA: only the reviewed LIFF test-list addition is allowed';
  assert.equal(typeof before, 'string', error);
  assert.equal(typeof after, 'string', error);
  let parsed;
  try { parsed = JSON.parse(before); } catch { assert.fail(error); }
  const command = parsed?.scripts?.['test:member-pages-liff'];
  assert.equal(typeof command, 'string', error);
  const added = ['member-pages-worker/test/member-personal-main.test.mjs',
    'member-pages-worker/test/liff-personal-main.test.mjs'];
  assert.ok(added.every(path => !command.includes(path)), error);
  const encoded = JSON.stringify(command);
  assert.equal(before.split(encoded).length, 2, error);
  const expected = before.replace(encoded, JSON.stringify(command + ' ' + added.join(' ')));
  // Exact text replacement also rejects unrelated keys, duplicate keys and formatting drift.
  assert.equal(after, expected, error);
}
const personalMainGuardPaths = new Set([
  'scripts/kenji-pause-release-scope.mjs',
  'scripts/kenji-pause-release-scope.test.mjs',
]);
const snapshotActivationPaths = new Set([
  configPath,
  'scripts/kenji-pause-release-scope.mjs',
  'scripts/kenji-pause-release-scope.test.mjs',
  'scripts/kenji-code-only-promote.mjs',
  'scripts/kenji-code-only-promote.test.mjs',
  '.github/workflows/per-support-code-only-release.yml',
]);
const autoReplyActivationPaths = new Set([
  configPath,
  '.github/workflows/deploy-member-dashboard-chat-worker.yml',
  '.github/workflows/per-support-code-only-release.yml',
  'scripts/kenji-model-off-workflow.test.mjs',
  'scripts/kenji-pause-release-scope.mjs',
  'scripts/kenji-pause-release-scope.test.mjs',
  'scripts/kenji-code-only-promote.mjs',
  'scripts/kenji-code-only-promote.test.mjs',
  'member-dashboard-chat-worker/test/kenji-line-contextual-understanding-shadow.test.mjs',
  'member-dashboard-chat-worker/test/kenji-line-conversation-history.test.mjs',
  'member-dashboard-chat-worker/test/kenji-model-only-owner-lock.test.mjs',
  'member-dashboard-chat-worker/test/kenji-private-membership-navigation.test.mjs',
]);

// LINE evidence binding uses a code-only release with live bindings preserved.
// It must never fall through to the legacy MMS deployment and route sync.
export const LINE_JOB_EVIDENCE_RELEASE_PATHS = new Set([
  'member-dashboard-chat-worker/src/line-group-ingress-front-gate.js',
  'member-dashboard-chat-worker/test/line-payment-proof-ingress.test.mjs',
  'member-dashboard-chat-worker/src/line-job-evidence-binding.mjs',
  'member-dashboard-chat-worker/test/line-job-evidence-binding.test.mjs',
  'payments-worker/cross-channel-proof-flow.test.mjs',
  '.github/workflows/deploy-payments-worker.yml',
  '.github/workflows/payment-evidence-delivery-contract.yml',
]);

// LINE status -> Lovable is a reviewed artifact delta, never legacy route sync.
const liffLovableReturnPaths = new Set([
  'member-dashboard-chat-worker/src/mms-line-front-gate.js',
  'member-dashboard-chat-worker/test/my-mmd-status-recovery-gate.test.mjs',
  'member-dashboard-chat-worker/test/my-mmd-lovable-return.test.mjs',
  'scripts/kenji-pause-release-scope.mjs',
  'scripts/kenji-pause-release-scope.test.mjs',
]);

export function deployRequired(event, files, beforeConfig, afterConfig, manifest = {}) {
  if (event !== 'push') return true;
  assert.ok(files.length, 'Empty or unavailable push diff; stop');
  if (files.includes('member-dashboard-chat-worker/src/mms-line-front-gate.js')) {
    assert.ok(files.every(file => liffLovableReturnPaths.has(file)),
      'LIFF_LOVABLE_RETURN_MIXED_DELTA: stop; separate release review required');
    return false;
  }
  if (files.includes(configPath) && files.includes('scripts/kenji-code-only-promote.mjs') &&
      files.every(file => autoReplyActivationPaths.has(file)) &&
      /^LINE_AUTO_REPLY_ENABLED\s*=\s*"false"$/m.test(beforeConfig) &&
      /^LINE_AUTO_REPLY_ENABLED\s*=\s*"true"$/m.test(afterConfig) &&
      normalize(beforeConfig) === normalize(afterConfig)) return false;
  if (files.includes('member-pages-worker/src/member-reply-snapshot.js') &&
      files.includes('member-dashboard-chat-worker/src/kenji-seed-line-runtime.mjs')) {
    assert.ok(files.every(file => CHECKPTS_READ_RELEASE_PATHS.has(file)),
      'CHECKPTS_READ_MIXED_DELTA: stop; separately review unrelated deployment changes');
    return false;
  }
  if (files.some(file => file === 'member-dashboard-chat-worker/src/checkpts-command.mjs' ||
    file === 'member-dashboard-chat-worker/test/checkpts-fastpath.test.mjs')) {
    assert.ok(files.every(file => CHECKPTS_MANUAL_RELEASE_PATHS.has(file) || pausePaths.has(file)),
      'CHECKPTS_MIXED_DELTA: stop; separately review unrelated deployment changes');
    return false;
  }
  if (files.includes(configPath) && files.every(file => snapshotActivationPaths.has(file)) &&
      files.includes('scripts/kenji-code-only-promote.mjs')) {
    const line = /^LINE_MEMBER_REPLY_SNAPSHOT_ENABLED\s*=\s*"(true|false)"$/m;
    assert.equal(beforeConfig.match(line)?.[1], 'false', 'Snapshot baseline must be OFF');
    assert.equal(afterConfig.match(line)?.[1], 'true', 'Snapshot candidate must be ON');
    assert.match(afterConfig, /^LINE_AUTO_REPLY_ENABLED\s*=\s*"false"$/m);
    assert.equal(beforeConfig.replace(line, ''), afterConfig.replace(line, ''),
      'Only the reviewed snapshot flag may change');
    return false;
  }
  if (files.some(file => LINE_JOB_EVIDENCE_RELEASE_PATHS.has(file))) {
    assert.ok(files.every(file => LINE_JOB_EVIDENCE_RELEASE_PATHS.has(file) || personalMainGuardPaths.has(file)),
      'LINE_JOB_EVIDENCE_MIXED_DELTA: stop; separately review unrelated deployment changes');
    return false;
  }
  if (files.includes('admin-worker/src/mms-ai-ops-read.js') && files.includes('member-dashboard-chat-worker/src/index.js')) {
    assert.ok(files.every(file => mmsKenjiControlPaths.has(file)), 'MMS_KENJI_CONTROL_MIXED_DELTA: stop; separate code-only release review required');
    return false;
  }
  if (files.includes('member-dashboard-chat-worker/src/mms-line-runtime.mjs')) {
    assert.ok(files.every(file => hennaCopyPaths.has(file)), 'HENNA_COPY_MIXED_DELTA: stop; separately review unrelated deployment changes');
    return false;
  }
  if (files.some(file => personalMainAnchors.has(file))) {
    assert.ok(files.every(file => PERSONAL_MAIN_RELEASE_PATHS.has(file) || personalMainGuardPaths.has(file)),
      'PERSONAL_MAIN_MIXED_DELTA: stop; separate review required before any legacy deployment');
    if (files.includes('package.json')) validatePersonalMainManifest(manifest.before, manifest.after);
    return false;
  }
  if (files.some(file => KENJI_MANUAL_RELEASE_PATHS.has(file)) &&
      files.every(file => KENJI_MANUAL_RELEASE_PATHS.has(file) || pausePaths.has(file)) &&
      !files.includes(configPath)) return false;
  if (files.some(file => !pausePaths.has(file))) return true;
  if (files.includes(configPath)) {
    if (!/^LINE_AUTO_REPLY_ENABLED\s*=\s*"false"$/m.test(afterConfig)) return true;
    if (normalize(beforeConfig) !== normalize(afterConfig)) return true;
  }
  return false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = process.env.EVENT_NAME;
  let required = true;
  if (event === 'push') {
    const before = process.env.BEFORE_SHA;
    const after = process.env.AFTER_SHA;
    for (const sha of [before, after]) assert.match(sha || '', /^(?!0{40}$)[a-f0-9]{40}$/);
    const git = args => execFileSync('git', args, { encoding: 'utf8' });
    const files = git(['diff', '--name-only', '--no-renames', '-z', before, after]).split('\0').filter(Boolean);
    const read = sha => git(['show', `${sha}:${configPath}`]);
    required = deployRequired(event, files, files.includes(configPath) ? read(before) : '', files.includes(configPath) ? read(after) : '',
      files.includes('package.json') ? {before:git(['show', `${before}:package.json`]), after:git(['show', `${after}:package.json`])} : {});
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `deploy_required=${required}\n`);
  console.log(required ? 'Normal release scope: existing deployment policy applies' : 'Manual-only scope: skip entire deployment job including route sync; runtime release requires separate approval');
}
