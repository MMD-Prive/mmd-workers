import assert from 'node:assert/strict';
import test from 'node:test';
import { environmentName, verifyProductionApproval } from './admin-production-approval.mjs';

const sha = 'a'.repeat(40);
const base = {
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: sha, APPROVED_SHA: sha, APPROVAL_REF: 'owner-approved-specific-workflow',
  GITHUB_REPOSITORY: 'MMD-Prive/mmd-workers', GH_TOKEN: 'fixture-not-a-real-token',
};
const protectedEnvironment = () => ({
  name: environmentName, can_admins_bypass: false,
  protection_rules: [{ type: 'required_reviewers', prevent_self_review: true,
    reviewers: [{ type: 'Team', reviewer: { id: 1 } }] }],
});
const response = (value, status = 200) => async () => ({ status, json: async () => value });

for (const [name, override] of [
  ['push', { GITHUB_EVENT_NAME: 'push' }],
  ['pull_request', { GITHUB_EVENT_NAME: 'pull_request' }],
  ['workflow_run', { GITHUB_EVENT_NAME: 'workflow_run' }],
  ['schedule', { GITHUB_EVENT_NAME: 'schedule' }],
  ['non-main', { GITHUB_REF: 'refs/heads/feature' }],
  ['tag', { GITHUB_REF: 'refs/tags/main' }],
  ['different SHA', { APPROVED_SHA: 'b'.repeat(40) }],
  ['short SHA', { GITHUB_SHA: 'aaaaaaa', APPROVED_SHA: 'aaaaaaa' }],
  ['blank approval', { APPROVAL_REF: '  ' }],
  ['missing approval', { APPROVAL_REF: undefined }],
  ['missing token', { GH_TOKEN: undefined }],
]) test(`reject ${name} before any network request`, async () => {
  let calls = 0;
  await assert.rejects(verifyProductionApproval({ ...base, ...override }, async () => { calls++; }));
  assert.equal(calls, 0);
});

for (const status of [401, 403, 404, 429, 500]) test(`fail closed on protection HTTP ${status}`, async () => {
  await assert.rejects(verifyProductionApproval(base, response({}, status)));
});

for (const [name, change] of [
  ['unprotected environment', x => { x.protection_rules = []; }],
  ['wrong environment', x => { x.name = 'other'; }],
  ['self review', x => { x.protection_rules[0].prevent_self_review = false; }],
  ['admin bypass', x => { x.can_admins_bypass = true; }],
  ['unknown bypass', x => { delete x.can_admins_bypass; }],
  ['no reviewers', x => { x.protection_rules[0].reviewers = []; }],
  ['invalid reviewer', x => { x.protection_rules[0].reviewers[0].reviewer.id = 0; }],
  ['ambiguous rules', x => { x.protection_rules.push(x.protection_rules[0]); }],
]) test(`reject ${name}`, async () => {
  const value = protectedEnvironment(); change(value);
  await assert.rejects(verifyProductionApproval(base, response(value)));
});

test('network and malformed response errors stop approval', async () => {
  await assert.rejects(verifyProductionApproval(base, async () => { throw new Error('offline'); }));
  await assert.rejects(verifyProductionApproval(base, async () => ({ status: 200, json: async () => { throw new Error('invalid JSON'); } })));
});

test('valid protection uses exactly one GET, with no production writes', async () => {
  let calls = 0;
  const result = await verifyProductionApproval(base, async (url, options) => {
    calls++;
    assert.equal(url, `https://api.github.com/repos/MMD-Prive/mmd-workers/environments/${environmentName}`);
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    return { status: 200, json: async () => protectedEnvironment() };
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { environment: environmentName, approved_sha: sha });
});
