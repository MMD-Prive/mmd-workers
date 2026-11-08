import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { environmentName, verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';

export async function verifyImmigrateMutation(env, request = fetch, git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim()) {
  assert.equal(env.GITHUB_REPOSITORY, 'MMD-Prive/mmd-workers', 'unexpected repository');
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch', 'manual dispatch required');
  assert.equal(env.GITHUB_RUN_ATTEMPT, '1', 'production reruns require a new dispatch and approval');
  assert.equal(env.PRODUCTION_APPROVED, 'true', 'explicit production approval input required');
  assert.equal(env.PRODUCTION_ENVIRONMENT_NAME, environmentName, 'protected production environment required');
  await verifyProductionApproval(env, request);
  assert.equal((await inspectEnvironment(env, request)).ready, true, 'production protection must allow only main');
  assert.equal(git('rev-parse', 'HEAD'), env.GITHUB_SHA, 'checkout does not match the approved SHA');
  assert.equal(git('status', '--porcelain=v1', '--untracked-files=all'), '', 'approved checkout must be clean');

  const current = await request('https://api.github.com/repos/MMD-Prive/mmd-workers/git/ref/heads/main', {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(current.status, 200, 'current main must be readable');
  assert.equal((await current.json()).object?.sha, env.GITHUB_SHA, 'approved SHA is no longer current main');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyImmigrateMutation(process.env);
}
