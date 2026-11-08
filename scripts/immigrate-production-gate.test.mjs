import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { verifyImmigrateMutation } from './immigrate-production-gate.mjs';
import { soloReviewer } from './admin-production-approval.mjs';

const sha = 'a'.repeat(40);
const environment = 'mmd-production-mutation';
const env = {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_REPOSITORY: 'MMD-Prive/mmd-workers',
  GITHUB_SHA: sha,
  APPROVED_SHA: sha,
  APPROVAL_REF: 'fixture approval',
  PRODUCTION_APPROVED: 'true',
  PRODUCTION_ENVIRONMENT_NAME: environment,
  GH_TOKEN: 'fixture',
};
const git = action => action === 'rev-parse' ? sha : '';
const protection = {
  name: environment,
  can_admins_bypass: false,
  deployment_branch_policy: { custom_branch_policies: true, protected_branches: false },
  protection_rules: [{
    type: 'required_reviewers', prevent_self_review: false,
    reviewers: [{ type: 'User', reviewer: soloReviewer }],
  }],
};

const fixtures = ({ main = sha, protectedEnvironment = protection, branch = 'main' } = {}) => async (url, options) => {
  assert.match(url, /^https:\/\/api\.github\.com\/repos\/MMD-Prive\/mmd-workers\//);
  assert.ok(!options.method || options.method === 'GET');
  if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: main } });
  if (url.endsWith('/deployment-branch-policies?per_page=100')) {
    return Response.json({ total_count: 1, branch_policies: [{ name: branch, type: 'branch' }] });
  }
  if (url.endsWith('/environments?per_page=100')) return Response.json({ total_count: 1, environments: [protectedEnvironment] });
  if (url.endsWith('/environments/' + environment)) return Response.json(protectedEnvironment);
  throw Error('Unexpected request');
};

for (const [label, overrides, reason] of [
  ['push', { GITHUB_EVENT_NAME: 'push' }, /manual dispatch required/],
  ['pull request', { GITHUB_EVENT_NAME: 'pull_request' }, /manual dispatch required/],
  ['rerun', { GITHUB_RUN_ATTEMPT: '2' }, /production reruns/],
  ['missing attempt', { GITHUB_RUN_ATTEMPT: '' }, /production reruns/],
  ['approval missing', { PRODUCTION_APPROVED: 'false' }, /explicit production approval/],
  ['different SHA', { APPROVED_SHA: 'b'.repeat(40) }, /match the run SHA/],
  ['other branch', { GITHUB_REF: 'refs/heads/test' }, /production must use main/],
]) {
  test(`${label} stops before any production access`, async () => {
    let requests = 0;
    await assert.rejects(verifyImmigrateMutation({ ...env, ...overrides }, async () => { requests++; }, git), reason);
    assert.equal(requests, 0);
  });
}

test('the guard fails closed on stale main, changed protection, wrong checkout, and local changes', async () => {
  await assert.rejects(verifyImmigrateMutation(env, fixtures({ main: 'b'.repeat(40) }), git), /no longer current main/);
  await assert.rejects(verifyImmigrateMutation(env, fixtures({ protectedEnvironment: { ...protection, can_admins_bypass: true } }), git), /bypass/);
  await assert.rejects(verifyImmigrateMutation(env, fixtures({ branch: 'staging' }), git), /allow only main/);
  await assert.rejects(verifyImmigrateMutation(env, fixtures(), () => 'b'.repeat(40)), /checkout does not match/);
  await assert.rejects(verifyImmigrateMutation(env, fixtures(), action => action === 'rev-parse' ? sha : 'modified'), /checkout must be clean/);
  await verifyImmigrateMutation(env, fixtures(), git);
});

test('both production workflows require independent first-attempt manual SHA approval and a protected job', () => {
  const dir = new URL('../.github/workflows/', import.meta.url);
  const read = file => readFileSync(new URL(file, dir), 'utf8');
  for (const [file, job, token] of [
    ['deploy-immigrate-worker-code-only.yml', 'release', 'IMMIGRATE_CODE_DEPLOY_TOKEN'],
    ['apply-immigrate-routes-approved.yml', 'apply', 'IMMIGRATE_ROUTE_MUTATION_TOKEN'],
  ]) {
    const workflow = read(file);
    assert.match(workflow, /^on:\n  workflow_dispatch:/m);
    assert.doesNotMatch(workflow, /^  (push|pull_request|workflow_run|repository_dispatch|workflow_call):/m);
    const jobBlock = workflow.split(`\n  ${job}:\n`)[1];
    assert.ok(jobBlock);
    assert.match(jobBlock, /^    if: github\.event_name == 'workflow_dispatch' && github\.run_attempt == '1' && github\.ref == 'refs\/heads\/main' && inputs\.production_approved == true && inputs\.approval_ref != '' && inputs\.approved_sha == github\.sha/m);
    assert.match(jobBlock, /^    environment: mmd-production-mutation$/m);
    assert.match(jobBlock, /^    needs: (approval-policy|review-plan)$/m);
    assert.match(jobBlock, new RegExp(`secrets\\.${token}`));
    assert.doesNotMatch(workflow.split(`\n  ${job}:\n`)[0], /secrets\./);
  }
  const routes = read('apply-immigrate-routes-approved.yml');
  assert.match(routes, /review-plan:\n    needs: approval-policy/);
  assert.match(routes, /--review >> "\$GITHUB_STEP_SUMMARY"/);
  assert.doesNotMatch(routes, /wrangler|IMMIGRATE_CODE_DEPLOY_TOKEN/);
  const deploy = read('deploy-immigrate-worker-code-only.yml');
  assert.match(deploy, /node \.\.\/scripts\/immigrate-production-gate\.mjs\n[^\n]*\n\s*wrangler versions upload/);
  assert.doesNotMatch(deploy, /ROUTE_MUTATION_TOKEN|\/workers\/routes/);
});

test('legacy workflow definitions and their CEO downstream have no production write lane', () => {
  const dir = new URL('../.github/workflows/', import.meta.url);
  for (const file of ['deploy-immigrate-worker.yml', 'member-intelligence-runtime.yml']) {
    const workflow = readFileSync(new URL(file, dir), 'utf8');
    assert.doesNotMatch(workflow, /CLOUDFLARE_(API|ROUTES_API)_TOKEN|\/workers\/routes|wrangler (deploy|versions deploy)/);
    assert.doesNotMatch(workflow, /wrangler[^\n]*versions upload(?! --dry-run)/);
  }
  assert.equal(existsSync(new URL('sync-ceo-route-worker.yml', dir)), false);
});
