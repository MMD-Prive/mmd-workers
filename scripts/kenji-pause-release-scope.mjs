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
  'member-dashboard-chat-worker/src/kenji-context-followup.mjs',
  'member-dashboard-chat-worker/src/kenji-seed-line-runtime.mjs',
  'member-dashboard-chat-worker/src/kenji-line-booking-accumulator.mjs',
  'member-dashboard-chat-worker/test/kenji-context-followup.test.mjs',
  '.github/workflows/kenji-context-followup-ci.yml',
  '.github/workflows/kenji-code-only-promote.yml',
  'scripts/kenji-code-only-promote.mjs',
  'scripts/kenji-code-only-promote.test.mjs',
]);

export function deployRequired(event, files, beforeConfig, afterConfig) {
  if (event !== 'push') return true;
  assert.ok(files.length, 'Empty or unavailable push diff; stop');
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
    required = deployRequired(event, files, files.includes(configPath) ? read(before) : '', files.includes(configPath) ? read(after) : '');
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `deploy_required=${required}\n`);
  console.log(required ? 'Normal release scope: existing deployment policy applies' : 'Pause/Kenji-scoped change: skip entire deployment job including route sync; Kenji runtime release requires separate manual approval');
}
