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
  'member-dashboard-chat-worker/src/kenji-line-rights-check.mjs',
  'member-dashboard-chat-worker/test/kenji-line-rights-check.test.mjs',
  'member-dashboard-chat-worker/src/kenji-context-followup.mjs',
  'member-dashboard-chat-worker/src/kenji-seed-line-runtime.mjs',
  'member-dashboard-chat-worker/src/kenji-line-booking-accumulator.mjs',
  'member-dashboard-chat-worker/test/kenji-context-followup.test.mjs',
  'member-dashboard-chat-worker/test/rich-menu-conversation.test.mjs',
  'member-dashboard-chat-worker/test/rich-menu-navigation-webhook.test.mjs',
  '.github/workflows/kenji-context-followup-ci.yml',
  '.github/workflows/kenji-code-only-promote.yml',
  'scripts/kenji-code-only-promote.mjs',
  'scripts/kenji-code-only-promote.test.mjs',
]);

// HENNA copy changes use an owner-approved code-only release, never the
// legacy job that deploys unrelated MMS code and reconciles routes.
const hennaCopyPaths = new Set([
  'member-dashboard-chat-worker/src/mms-line-runtime.mjs',
  'member-dashboard-chat-worker/test/mms-line-runtime.test.mjs',
  'scripts/kenji-pause-release-scope.mjs',
  'scripts/kenji-pause-release-scope.test.mjs',
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

export function deployRequired(event, files, beforeConfig, afterConfig, manifest = {}) {
  if (event !== 'push') return true;
  assert.ok(files.length, 'Empty or unavailable push diff; stop');
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
