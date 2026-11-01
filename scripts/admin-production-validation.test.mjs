import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { inspectEnvironment } from './admin-production-validation.mjs';
import { soloReviewer } from './admin-production-approval.mjs';

const name = 'mmd-production-mutation';
const env = { GITHUB_REPOSITORY: 'MMD-Prive/mmd-workers', GH_TOKEN: 'fixture' };
function mock(overrides = {}) {
  const calls = [];
  const values = {
    list: { status: 200, value: { total_count: 1, environments: [{ name }] } },
    protection: { status: 200, value: { name, can_admins_bypass: false,
      protection_rules: [{ type: 'required_reviewers', prevent_self_review: false,
        reviewers: [{ type: 'User', reviewer: { ...soloReviewer } }] }],
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } } },
    branches: { status: 200, value: { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] } },
    ...overrides,
  };
  return { calls, values, request: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    assert.equal(options.redirect, 'error');
    const key = url.includes('deployment-branch-policies') ? 'branches' : url.includes('?per_page=100') ? 'list' : 'protection';
    return { status: values[key].status, json: async () => values[key].value };
  } };
}

test('valid exact main protection is ready after GET-only verification', async () => {
  const f = mock(); const result = await inspectEnvironment(env, f.request);
  assert.equal(result.status, 'protection_verified'); assert.equal(result.ready, true);
  assert.equal(f.calls.length, 3);
  assert.ok(!JSON.stringify(result).includes('fixture'));
});

test('missing environment is distinct from permission denied', async () => {
  const f = mock({ list: { status: 200, value: { total_count: 0, environments: [] } }, protection: { status: 404 } });
  const result = await inspectEnvironment(env, f.request);
  assert.equal(result.status, 'missing_environment'); assert.equal(result.ready, false);
  assert.equal(f.calls.length, 2);
});

for (const key of ['list', 'protection']) for (const status of [401, 403]) test(`${key} ${status} is a permission failure, not missing environment`, async () => {
  const f = mock({ [key]: { status } });
  assert.equal((await inspectEnvironment(env, f.request)).status, 'permission_denied');
});

for (const [label, mutate] of [
  ['reviewers missing', x => { x.protection_rules = []; }],
  ['independent review required', x => { x.protection_rules[0].prevent_self_review = true; }],
  ['wrong reviewer', x => { x.protection_rules[0].reviewers[0].reviewer.id = 1; }],
  ['multiple reviewers', x => { x.protection_rules[0].reviewers.push({ type: 'User', reviewer: { login: 'other', id: 2 } }); }],
  ['admin bypass', x => { x.can_admins_bypass = true; }],
  ['unknown bypass', x => { delete x.can_admins_bypass; }],
  ['invalid reviewer', x => { x.protection_rules[0].reviewers[0].reviewer.id = 0; }],
  ['duplicate review rules', x => { x.protection_rules.push(x.protection_rules[0]); }],
]) test(`${label} cannot reach reviewer gate`, async () => {
  const f = mock(); mutate(f.values.protection.value);
  const result = await inspectEnvironment(env, f.request);
  assert.equal(result.status, 'missing_protection'); assert.equal(result.ready, false);
});

for (const [label, mutate] of [
  ['wildcard', x => { x.branch_policies[0].name = '*'; }],
  ['tag', x => { x.branch_policies[0].type = 'tag'; }],
  ['extra branch', x => { x.total_count = 2; x.branch_policies.push({ name: 'other', type: 'branch' }); }],
]) test(`${label} does not satisfy main-only restriction`, async () => {
  const f = mock(); mutate(f.values.branches.value);
  const result = await inspectEnvironment(env, f.request);
  assert.equal(result.status, 'branch_restriction_unverified'); assert.equal(result.ready, false);
});

test('network error or malformed protection cannot pass', async () => {
  const f = mock({ protection: { status: 200, value: null } });
  assert.equal((await inspectEnvironment(env, f.request)).ready, false);
  assert.equal((await inspectEnvironment(env, async () => { throw Error('offline'); })).ready, false);
  assert.equal((await inspectEnvironment({}, async () => { throw Error('must not call'); })).status, 'permission_context_missing');
});

test('validation workflow never receives production credentials or invokes a mutator', () => {
  const source = readFileSync(new URL('../.github/workflows/admin-production-validation-only.yml', import.meta.url), 'utf8');
  assert.match(source, /actions: read/);
  assert.doesNotMatch(source, /secrets\.|secrets: inherit|wrangler|CLOUDFLARE_API_TOKEN|curl|--execute-approved/);
  assert.match(source, /needs.protection-read.outputs.ready == 'true'/);
  assert.match(source, /github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main'/);
  assert.match(source, /permissions: \{\}/);
  assert.match(source, /^  pull_request:/m);
});

test('environment plan records the owner-authorized policy applied and verified in GitHub', () => {
  const plan = JSON.parse(readFileSync(new URL('./admin-production-environment-plan.json', import.meta.url)));
  assert.equal(plan.applied, true); assert.equal(plan.configuration_change_authorized, true);
  assert.match(plan.approval_state, /applied and read-back verified on 2026-10-24/);
  assert.deepEqual(plan.desired_protection.reviewers, [{ type: 'User', id: 216427112, login: 'mmdprive' }]);
  assert.equal(plan.desired_protection.prevent_self_review, false);
  assert.equal(plan.desired_protection.can_admins_bypass, false);
});
