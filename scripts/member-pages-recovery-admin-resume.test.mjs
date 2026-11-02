import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { adminOnlyTransport, RELEASE, createAdminResumeAdapter } from './member-pages-recovery-admin-resume.mjs';
import { metadataFor } from './member-pages-recovery-artifact-release.mjs';
// Exercise the exact executor with small fixture bytes, replacing only the two
// artifact hash literals. Production pins remain tested separately below.
const bytes = Buffer.from('reviewed fixture');
const digest = createHash('sha256').update(bytes).digest('hex');
let source = readFileSync(new URL('./member-pages-recovery-admin-resume.mjs', import.meta.url), 'utf8');
source = source.replaceAll(RELEASE.adminCandidateHash, digest).replaceAll(RELEASE.memberHash, digest).replaceAll(RELEASE.adminBaselineHash, digest).replace("'./member-pages-recovery-artifact-release.mjs'", JSON.stringify(new URL('./member-pages-recovery-artifact-release.mjs', import.meta.url).href));
const { executeAdminOnlyResume } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const adminDeployment = '00000000-0000-4000-8000-000000000001';
function fixture() {
  const calls = [], receipts = [];
  const make = (member) => ({ version: { id: member ? RELEASE.memberVersion : RELEASE.adminVersion, resources: { script: {}, script_runtime: { migration_tag: member ? 'v5-customer-request-mutation' : 'v1', compatibility_date: '2026-01-01' }, bindings: member ? [{name:'CUSTOMER_REQUEST_MUTATION', namespace_id:RELEASE.memberNamespace}] : [] } }, deployment: { id: member ? RELEASE.memberDeployment : adminDeployment, versions: [{ version_id: member ? RELEASE.memberVersion : RELEASE.adminVersion, percentage: 100 }] }, module_bytes: bytes, latest_version: member ? RELEASE.memberVersion : RELEASE.adminVersion, settings: { observability: { enabled: true } } });
  const io = {
    approve: async () => {}, save: async r => receipts.push(r), snapshot: async worker => make(worker === 'member-pages-worker'),
    originalMemberVersion: async () => ({ id: RELEASE.memberOriginalVersion, resources: { script: {}, script_runtime: { migration_tag: 'v3-remembered-login-device' }, bindings: [] } }),
    verifyUploaded: async () => {},
    deploy: async (worker, meta) => { calls.push(worker); assert.equal(worker, 'admin-worker'); assert.equal(meta.migrations, undefined); },
    verifyDeployed: async () => ({ version: { id: 'new-admin' }, deployment: { id: 'new-deploy', versions: [{ percentage: 100 }] } }),
  };
  return { io, calls, receipts, make, plan: { adminBytes: bytes, adminDeployment } };
}
test('production pins match the recorded release, not the earlier local artifacts', () => {
  assert.equal(RELEASE.memberHash, 'e0dcf07e9dbc8c1d74e1c2b5b8afe7db4b2e6f34ae5a69cc308142d89e00ec58');
  assert.equal(RELEASE.adminCandidateHash, 'ebd12d214c1526374019338b2f720c30f08811b76f9142a7c57eeade9a2ac180');
});
test('resume performs exactly one admin mutation and zero member mutations', async () => {
  const f = fixture(); const r = await executeAdminOnlyResume(f.io, f.plan);
  assert.deepEqual(f.calls, ['admin-worker']); assert.equal(r.phase, 'complete'); assert.equal(r.member_writes, 0);
});
test('member drift blocks all writes', async () => {
  const f = fixture(); f.io.snapshot = async worker => { const s = f.make(worker === 'member-pages-worker'); if (worker === 'member-pages-worker') s.latest_version = 'drift'; return s; };
  await assert.rejects(executeAdminOnlyResume(f.io, f.plan)); assert.deepEqual(f.calls, []);
});
test('admin drift between approval and PUT blocks all writes', async () => {
  const f = fixture(); let n = 0; f.io.snapshot = async worker => { const s = f.make(worker === 'member-pages-worker'); if (worker === 'admin-worker' && ++n === 2) s.settings.observability.enabled = false; return s; };
  await assert.rejects(executeAdminOnlyResume(f.io, f.plan)); assert.deepEqual(f.calls, []);
});
test('lost admin response records unknown outcome without retry', async () => {
  const f = fixture(); f.io.deploy = async worker => { f.calls.push(worker); throw Error('lost response'); };
  await assert.rejects(executeAdminOnlyResume(f.io, f.plan)); assert.deepEqual(f.calls, ['admin-worker']);
  assert.equal(f.receipts.at(-1).phase, 'partial-or-unknown-admin-deployment'); assert.equal(f.receipts.at(-1).admin_attempt, 'started');
});
test('transport rejects member PUT, all POST and foreign origins before requests', async () => {
  let calls = 0; const request = adminOnlyTransport(async () => { calls++; });
  const root = 'https://api.cloudflare.com/client/v4/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/scripts/';
  assert.throws(() => request(root + 'member-pages-worker?bindings_inherit=strict', { method: 'PUT' }));
  assert.throws(() => request(root + 'admin-worker/deployments', { method: 'POST' }));
  assert.throws(() => request('https://example.com/', { method: 'GET' })); assert.equal(calls, 0);
  await request(root + 'admin-worker?bindings_inherit=strict', { method: 'PUT' }); assert.equal(calls, 1);
});
test('real adapter accepts omitted empty flags but rejects nonempty drift', async () => {
  const version = '11111111-1111-4111-8111-111111111111'; let flags;
  const metadata = metadataFor({ resources: { script: {}, bindings: [], script_runtime: { compatibility_date: '2026-01-01' } } }, { unchanged_prefix_suffix: true }, 'admin-worker', {});
  const request = async u => { let result;
    if (u.endsWith('/deployments')) result = { deployments: [{ id: 'deployment', versions: [{ version_id: version, percentage: 100 }] }] };
    else if (u.includes('include=modules')) result = { modules: [{ name: 'worker.js', content_base64: bytes.toString('base64') }] };
    else if (u.endsWith('/script-settings')) result = {};
    else if (u.endsWith('/versions')) result = { items: [{ id: version }] };
    else result = { id: version, resources: { bindings: [], script_runtime: { compatibility_date: '2026-01-01', ...(flags === undefined ? {} : { compatibility_flags: flags }) } } };
    return Response.json({ success: true, result }); };
  const io = createAdminResumeAdapter({ token: 'synthetic', request });
  const run = () => io.verifyDeployed('admin-worker', 'old', digest, {}, metadata, {});
  await run(); flags = ['nodejs_compat']; await assert.rejects(run());
});

test('member namespace or mutable settings drift blocks admin PUT', async () => {
  for (const kind of ['namespace', 'settings']) {
    const f = fixture(); let n = 0;
    f.io.snapshot = async worker => { const s = f.make(worker === 'member-pages-worker'); if (worker === 'member-pages-worker') { n++; if (kind === 'namespace') s.version.resources.bindings[0].namespace_id = 'wrong'; if (kind === 'settings' && n === 2) s.settings.observability.enabled = false; } return s; };
    await assert.rejects(executeAdminOnlyResume(f.io, f.plan)); assert.deepEqual(f.calls, []);
  }
});
