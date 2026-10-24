import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Last main baseline before PR 2706. Advance only in a separately reviewed release change.
export const CONFIRMATION_RELEASE_BASELINE = 'ce0a67e364352d8cc75827b4f4b89aac6498b9cb';
const CONFIRMATION_PATHS = new Set([
  'payments-worker/confirmation-ack.js',
  'payments-worker/model-confirm-no-silent-failure.test.mjs',
  'webflow/sigil/confirm/job-model-v15-i18n.js',
  'webflow/sigil/confirm/job-model-v15-no-silent-failure.test.mjs',
]);
const validSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) && !/^0+$/.test(value);
const blocked = reason => ({ ownerApprovedRequired: true, reason });

export function classifyConfirmationRelease({ event, before, after, head, files, confirmationChanges }) {
  // Manual releases use the existing exact-SHA, environment-protected workflow.
  if (event !== 'push') return blocked('use_owner_approved_workflow');
  if (!validSha(before) || !validSha(after) || after !== head) return blocked('unverified_source_range');
  if (!Array.isArray(files) || !files.length || files.some(file => typeof file !== 'string' || !file)) {
    return blocked('unverified_diff');
  }
  if (!Array.isArray(confirmationChanges) || confirmationChanges.some(file => typeof file !== 'string' || !CONFIRMATION_PATHS.has(file))) return blocked('unverified_confirmation_baseline');
  if (confirmationChanges.length) return blocked('confirmation_owner_approval_required');
  if (files.some(file => CONFIRMATION_PATHS.has(file))) return blocked('confirmation_owner_approval_required');
  return { ownerApprovedRequired: false, reason: 'unrelated_push' };
}

const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export function inspectConfirmationRelease(env, readGit = git) {
  const context = { event: env.EVENT_NAME, before: env.BEFORE_SHA, after: env.AFTER_SHA };
  if (context.event !== 'push') return blocked('use_owner_approved_workflow');
  if (!validSha(context.before) || !validSha(context.after)) return blocked('unverified_source_range');
  try {
    const head = readGit(['rev-parse', 'HEAD']).trim();
    if (head !== context.after) return blocked('unverified_source_range');
    // Renames must include the original path so moving the writer cannot bypass the guard.
    const files = readGit(['diff', '--name-only', '--no-renames', '-z', context.before, context.after, '--'])
      .split('\0').filter(Boolean);
    // A later unrelated push must not implicitly deploy the still-held confirmation changes.
    const confirmationChanges = readGit(['diff', '--name-only', '--no-renames', '-z', CONFIRMATION_RELEASE_BASELINE, head, '--', ...CONFIRMATION_PATHS])
      .split('\0').filter(Boolean);
    return classifyConfirmationRelease({ ...context, head, files, confirmationChanges });
  } catch { return blocked('diff_unavailable'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const decision = inspectConfirmationRelease(process.env);
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  appendFileSync(process.env.GITHUB_OUTPUT, `owner_approved_required=${decision.ownerApprovedRequired}\n`);
  console.log(`Payments release guard: ${decision.reason}`);
}
