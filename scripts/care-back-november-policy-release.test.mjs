import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PATCH_SCHEMA, REVIEWED_UPLOADS, sha256, parsePatchManifest, buildPolicyModules, checkModuleSyntax,
  validateReleaseInputs, verifyPolicyApproval, createPolicyTransport, releasePolicyPatch,
} from './care-back-november-policy-release.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const D = '33333333-3333-4333-8333-333333333333';
const E = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const SHA = 'a'.repeat(40);
const ACCOUNT = 'b176eda1172b741fd2e58904cc9d77c5';
const ZONE = '2d62396174fa2ddadbbcd0e8cf0f3367';
const before = 'function currentPrivateMembershipPromotion() { return 180; }';
const after = 'function currentPrivateMembershipPromotion() { return 6; }';
const baseCode = before + '\nexport default { fetch() { return new Response("fixture"); } };\n';
const newCode = baseCode.replace(before, after);
const wrapper = 'export const unchanged = true;\n';
const asRaw = value => Buffer.from(JSON.stringify(value));
const patch = (id, old, next) => ({ id, before: old, after: next, before_sha256: sha256(old), after_sha256: sha256(next) });

function fixture(worker = 'payments-worker') {
  const manifest = {
    schema: PATCH_SCHEMA, worker, baseline_version: A, baseline_deployment: D, main_module: 'worker.js',
    modules: [
      { name: 'worker.js', type: 'esm', before_sha256: sha256(baseCode), after_sha256: sha256(newCode), patches: [patch('currentPrivateMembershipPromotion', before, after)] },
      { name: 'preserved.mjs', type: 'esm', before_sha256: sha256(wrapper), after_sha256: sha256(wrapper), patches: [] },
    ],
  };
  const artifact = { id: A, main_module: 'worker.js', modules: [
    { name: 'worker.js', content_base64: Buffer.from(baseCode).toString('base64') },
    { name: 'preserved.mjs', content_base64: Buffer.from(wrapper).toString('base64') },
  ] };
  return { manifest, artifact };
}
const parse = manifest => parsePatchManifest(asRaw(manifest), sha256(asRaw(manifest)), manifest.worker);
function env(worker = 'payments-worker') {
  return {
    CARE_BACK_WORKER: worker, CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'MMD-Prive/mmd-workers', GITHUB_REPOSITORY_ID: '1121397236',
    GITHUB_ACTOR: 'mmdprive', GITHUB_ACTOR_ID: '216427112', GITHUB_TRIGGERING_ACTOR: 'mmdprive',
    GITHUB_RUN_ID: '1234567', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: SHA, APPROVED_SHA: SHA,
    EXPECTED_VERSION: A, EXPECTED_DEPLOYMENT: D, EXPECTED_MODULE_SHA256: sha256(baseCode),
    EXPECTED_MANIFEST_SHA256: sha256(asRaw(fixture(worker).manifest)), PATCH_MANIFEST: 'reviewed.json',
    GH_TOKEN: 'github-fixture', PRODUCTION_APPROVED: 'true', APPROVAL_REF: 'owner-approved-fixture',
    PRODUCTION_ENVIRONMENT_NAME: worker === 'payments-worker' ? 'mmd-production-mutation' : 'member-pages-code-only-owner',
  };
}

function harness({ worker = 'payments-worker', mode = 'inspect', mutate = () => {} } = {}) {
  const f = fixture(worker);
  const root = '/accounts/' + ACCOUNT + '/workers/scripts/' + worker;
  const versionRoot = '/accounts/' + ACCOUNT + '/workers/workers/' + worker + '/versions';
  const config = {
    resources: {
      script: { etag: 'baseline-etag', handlers: ['fetch'], placement_mode: 'off' },
      script_runtime: { compatibility_date: '2026-01-20', compatibility_flags: [], usage_model: 'standard' },
      bindings: [{ name: 'FLAG', type: 'plain_text', text: 'on' }, { name: 'SECRET', type: 'secret_text' }],
    },
  };
  const state = {
    deployment: { id: D, strategy: 'percentage', versions: [{ version_id: A, percentage: 100 }] },
    latest: [A], settings: { logpush: false }, routes: [{ id: 'route-one', pattern: '*.example.test/*', script: worker }],
    schedules: [], subdomain: { enabled: false, previews_enabled: false },
    uploaded: null, annotations: null, uploadedArtifact: null, approvals: 0, sourceChecks: 0,
    calls: [], receipts: [],
  };
  const io = {
    worker, mode, releaseSha: SHA, manifestBytes: asRaw(f.manifest),
    expectedManifestHash: sha256(asRaw(f.manifest)), expectedModuleHash: sha256(baseCode),
    expectedVersion: A, expectedDeployment: D,
    async sourceCheck() { state.sourceChecks += 1; mutate('source', state); },
    async approve() { state.approvals += 1; mutate('approval', state); },
    save(value) { state.receipts.push(structuredClone(value)); },
    async call(path, init = {}) {
      const method = init.method || 'GET';
      state.calls.push({ path, method });
      mutate(method + ' ' + path, state);
      if (method === 'POST' && path === root + '/versions?bindings_inherit=strict') {
        const metadata = JSON.parse(init.body.get('metadata'));
        assert.deepEqual(metadata.bindings, [{ name: 'FLAG', type: 'inherit' }, { name: 'SECRET', type: 'inherit' }]);
        assert.equal(metadata.compatibility_date, config.resources.script_runtime.compatibility_date);
        assert.equal(metadata.annotations['workers/commit_sha'], undefined);
        assert.equal(metadata.main_module, 'worker.js');
        state.annotations = { ...metadata.annotations, 'workers/triggered_by': 'version_upload' };
        state.uploaded = { id: B, ...structuredClone(config) };
        state.uploadedArtifact = { id: B, main_module: 'worker.js', modules: [] };
        for (const [name, file] of init.body.entries()) {
          if (name === 'metadata') continue;
          state.uploadedArtifact.modules.push({ name, content_base64: Buffer.from(await file.arrayBuffer()).toString('base64') });
        }
        state.latest = [B, A];
        mutate('uploaded', state);
        return { id: B };
      }
      if (method === 'POST' && path === root + '/deployments') {
        assert.deepEqual(JSON.parse(init.body), { strategy: 'percentage', versions: [{ version_id: B, percentage: 100 }] });
        state.deployment = { id: E, strategy: 'percentage', versions: [{ version_id: B, percentage: 100 }] };
        mutate('promoted', state);
        return { id: E };
      }
      assert.equal(method, 'GET', 'unexpected mutation');
      if (path === root + '/deployments') return { deployments: [structuredClone(state.deployment)] };
      if (path === root + '/deployments/' + E) return structuredClone(state.deployment);
      if (path === root + '/versions') return { items: state.latest.map(id => ({ id })) };
      if (path === root + '/versions/' + A) return { id: A, ...structuredClone(config) };
      if (path === root + '/versions/' + B) return structuredClone(state.uploaded);
      if (path === versionRoot + '/' + A + '?include=modules') return structuredClone(f.artifact);
      if (path === versionRoot + '/' + B + '?include=modules') return structuredClone(state.uploadedArtifact);
      if (path === versionRoot + '/' + B) return { id: B, annotations: structuredClone(state.annotations) };
      if (path === root + '/script-settings') return structuredClone(state.settings);
      if (path === root + '/schedules') return { schedules: structuredClone(state.schedules) };
      if (path === root + '/subdomain') return structuredClone(state.subdomain);
      if (path === '/zones/' + ZONE + '/workers/routes') return structuredClone(state.routes);
      throw new Error('unexpected fixture read ' + path);
    },
  };
  return { ...f, io, state, root, versionRoot };
}
const posts = h => h.state.calls.filter(c => c.method === 'POST');

test('exact manifest pin and worker identity are independent requirements', () => {
  const f = fixture();
  assert.equal(parse(f.manifest).worker, 'payments-worker');
  assert.throws(() => parsePatchManifest(asRaw(f.manifest), '0'.repeat(64), 'payments-worker'), /manifest hash drift/);
  assert.throws(() => parsePatchManifest(asRaw(f.manifest), sha256(asRaw(f.manifest)), 'member-pages-worker'), /worker mismatch/);
});

for (const [label, mutate] of [
  ['unknown schema', m => m.schema = 'other'],
  ['unknown fields', m => m.upload_url = 'https://example.test'],
  ['unsupported worker', m => m.worker = 'admin-worker'],
  ['duplicate module', m => m.modules.push(structuredClone(m.modules[0]))],
  ['unpatched module change', m => m.modules[1].after_sha256 = 'f'.repeat(64)],
  ['wrong before function hash', m => m.modules[0].patches[0].before_sha256 = 'f'.repeat(64)],
  ['wrong after function hash', m => m.modules[0].patches[0].after_sha256 = 'f'.repeat(64)],
  ['duplicate function identity', m => m.modules[0].patches.push(structuredClone(m.modules[0].patches[0]))],
]) test('manifest rejects ' + label, () => {
  const { manifest } = fixture(); mutate(manifest); assert.throws(() => parse(manifest));
});

test('patch preserves all unedited bytes and wrapper modules exactly', () => {
  const f = fixture();
  const modules = buildPolicyModules(f.artifact, parse(f.manifest));
  assert.equal(modules[0].bytes.toString(), newCode);
  assert.equal(modules[1].bytes.toString(), wrapper);
  assert.equal(checkModuleSyntax(modules).length, 2);
});

test('baseline bytes and the full module inventory must match the pinned artifact', () => {
  for (const mutate of [
    a => a.modules[0].content_base64 = Buffer.from('export default {};').toString('base64'),
    a => a.modules.pop(),
    a => a.modules.push({ name: 'extra.mjs', content_base64: 'eA==' }),
    a => a.id = OTHER,
    a => a.main_module = 'preserved.mjs',
  ]) {
    const f = fixture(); mutate(f.artifact); assert.throws(() => buildPolicyModules(f.artifact, f.manifest));
  }
});

test('two matching before anchors cannot produce a release candidate', () => {
  const f = fixture(); const code = baseCode + before + '\n';
  f.artifact.modules[0].content_base64 = Buffer.from(code).toString('base64');
  f.manifest.modules[0].before_sha256 = sha256(code);
  assert.throws(() => buildPolicyModules(f.artifact, f.manifest), /ambiguous artifact anchor/);
});

test('overlapping independently pinned function or snippet replacements are rejected', () => {
  const f = fixture();
  f.manifest.modules[0].patches.push(patch('currentPrivateMembershipPromotion-snippet', 'return 180;', 'return 12;'));
  assert.throws(() => buildPolicyModules(f.artifact, f.manifest), /overlapping artifact edits/);
});

test('reverse replacement must also have one exact occurrence', () => {
  const f = fixture();
  const code = baseCode + '\n' + after;
  const candidate = code.replace(before, after);
  f.artifact.modules[0].content_base64 = Buffer.from(code).toString('base64');
  Object.assign(f.manifest.modules[0], { before_sha256: sha256(code), after_sha256: sha256(candidate) });
  assert.throws(() => buildPolicyModules(f.artifact, f.manifest), /ambiguous artifact anchor/);
});

test('candidate full-module checksum must equal the separately reviewed after hash', () => {
  const f = fixture(); f.manifest.modules[0].after_sha256 = 'f'.repeat(64);
  assert.throws(() => buildPolicyModules(f.artifact, f.manifest), /candidate module hash drift/);
});

test('syntax proof checks the whole module, including unchanged surrounding code', () => {
  assert.throws(() => checkModuleSyntax([{ name: 'worker.js', bytes: Buffer.from(newCode + '\nfunction broken(') }]));
});

test('inspect is the default input mode and production needs exact existing environment', () => {
  const e = env(); delete e.PRODUCTION_APPROVED; delete e.APPROVAL_REF;
  assert.equal(validateReleaseInputs(e).mode, 'inspect');
  assert.throws(() => validateReleaseInputs(e, 'execute-approved'));
  assert.equal(validateReleaseInputs(env(), 'execute-approved').mode, 'execute-approved');
  assert.throws(() => validateReleaseInputs({ ...env(), PRODUCTION_ENVIRONMENT_NAME: 'mmd-admin-worker-solo-mutation' }, 'execute-approved'));
});

test('wrong account, actor, rerun, branch, SHA, worker or missing hash cannot run', () => {
  for (const [key, value] of [
    ['CLOUDFLARE_ACCOUNT_ID', 'other'], ['GITHUB_ACTOR_ID', '1'], ['GITHUB_RUN_ATTEMPT', '2'],
    ['GITHUB_REF', 'refs/heads/feature'], ['APPROVED_SHA', 'b'.repeat(40)],
    ['CARE_BACK_WORKER', 'admin-worker'], ['EXPECTED_MODULE_SHA256', ''], ['EXPECTED_MANIFEST_SHA256', ''],
  ]) assert.throws(() => validateReleaseInputs({ ...env(), [key]: value }));
});

test('member-pages approval refuses an unsupported workflow without altering the existing verifier', async () => {
  const e = env('member-pages-worker');
  const owner = { login: 'mmdprive', id: 216427112 };
  const request = async () => Response.json({
    id: Number(e.GITHUB_RUN_ID), repository: { id: 1121397236 }, event: 'workflow_dispatch',
    head_branch: 'main', head_sha: SHA, path: '.github/workflows/deploy-care-back-november-policy.yml',
    actor: owner, triggering_actor: owner, run_attempt: 1,
  });
  await assert.rejects(verifyPolicyApproval(e, request), /wrong workflow or ref/);
});

test('payments reuses the current production protection verifier and its sole reviewer policy', async () => {
  const e = env();
  let calls = 0;
  const request = async url => {
    calls += 1;
    assert.match(url, /environments\/mmd-production-mutation$/);
    return Response.json({ name: 'mmd-production-mutation', can_admins_bypass: false,
      protection_rules: [{ type: 'required_reviewers', prevent_self_review: false,
        reviewers: [{ type: 'User', reviewer: { login: 'mmdprive', id: 216427112 } }] }] });
  };
  const receipt = await verifyPolicyApproval(e, request);
  assert.equal(receipt.environment, 'mmd-production-mutation');
  assert.equal(calls, 1);
});

test('transport defaults to GET-only and cannot target another worker or configuration mutation', async () => {
  let calls = 0;
  const request = async () => { calls += 1; return Response.json({ success: true, result: {} }); };
  const root = '/accounts/' + ACCOUNT + '/workers/scripts/payments-worker';
  const read = createPolicyTransport('fixture', 'payments-worker', { request });
  await read(root + '/deployments');
  await assert.rejects(read(root + '/deployments', { method: 'POST', body: '{}' }));
  await assert.rejects(read(root + '/settings', { method: 'PATCH', body: '{}' }));
  await assert.rejects(read(root.replace('payments-worker', 'member-pages-worker') + '/deployments'));
  assert.equal(calls, 1);
  const write = createPolicyTransport('fixture', 'payments-worker', { request, allowWrites: true });
  await write(root + '/versions?bindings_inherit=strict', { method: 'POST', body: new FormData() });
  await assert.rejects(write(root + '/versions', { method: 'POST', body: new FormData() }));
  assert.equal(calls, 2);
});

test('read-only inspection proves candidate modules and makes zero mutation or approval calls', async () => {
  const h = harness();
  const result = await releasePolicyPatch(h.io);
  assert.equal(result.phase, 'inspected');
  assert.equal(result.modules[0].sha256, sha256(newCode));
  assert.equal(posts(h).length, 0);
  assert.equal(h.state.approvals, 0);
});

for (const worker of ['payments-worker', 'member-pages-worker']) test(worker + ' exact approved release inherits all configuration and reads back both mutations', async () => {
  const h = harness({ worker, mode: 'execute-approved' });
  const result = await releasePolicyPatch(h.io);
  assert.equal(result.phase, 'complete');
  assert.equal(result.uploaded_version, B);
  assert.equal(result.deployment, E);
  assert.deepEqual(posts(h).map(c => c.path), [h.root + '/versions?bindings_inherit=strict', h.root + '/deployments']);
  assert.equal(h.state.approvals, 3);
  assert.equal(h.state.sourceChecks, 3);
  assert.equal(h.state.uploadedArtifact.modules[1].content_base64, Buffer.from(wrapper).toString('base64'));
  const receiptText = JSON.stringify(h.state.receipts);
  assert.doesNotMatch(receiptText, /return 180|return 6|SECRET|github-fixture|content_base64/);
});

for (const [label, mutate] of [
  ['different active deployment', s => s.deployment.id = OTHER],
  ['split traffic', s => s.deployment.versions = [{ version_id: A, percentage: 50 }, { version_id: OTHER, percentage: 50 }]],
  ['foreign latest upload', s => s.latest = [OTHER, A]],
]) test(label + ' stops before upload', async () => {
  const h = harness({ mode: 'execute-approved' }); mutate(h.state);
  await assert.rejects(releasePolicyPatch(h.io));
  assert.equal(posts(h).length, 0);
});

for (const [label, change] of [
  ['settings', s => s.settings.logpush = true],
  ['routes', s => s.routes[0].pattern = 'changed.example.test/*'],
  ['schedules', s => s.schedules.push({ cron: '* * * * *' })],
  ['subdomain', s => s.subdomain.enabled = true],
]) test(label + ' drift during pre-upload checks stops with no write', async () => {
  let reads = 0;
  const h = harness({ mode: 'execute-approved', mutate(event, s) {
    if (event.endsWith('/deployments') && event.startsWith('GET') && ++reads === 2) change(s);
  } });
  await assert.rejects(releasePolicyPatch(h.io));
  assert.equal(posts(h).length, 0);
});

for (const count of [1, 2, 3]) test('approval rejection at check ' + count + ' prevents the next mutation', async () => {
  const h = harness({ mode: 'execute-approved', mutate(event, s) {
    if (event === 'approval' && s.approvals === count) throw new Error('approval-fixture-rejected');
  } });
  await assert.rejects(releasePolicyPatch(h.io), /approval-fixture-rejected/);
  assert.equal(posts(h).length, count === 3 ? 1 : 0);
});

test('main/source checkout drift after inspection cannot upload', async () => {
  const h = harness({ mode: 'execute-approved', mutate(event, s) {
    if (event === 'source' && s.sourceChecks === 2) throw new Error('source-drift');
  } });
  await assert.rejects(releasePolicyPatch(h.io), /source-drift/);
  assert.equal(posts(h).length, 0);
});

for (const [label, change] of [
  ['configuration', s => s.uploaded.resources.bindings[0].text = 'changed'],
  ['module bytes', s => s.uploadedArtifact.modules[0].content_base64 = Buffer.from('export default {};').toString('base64')],
  ['annotations', s => s.annotations['workers/message'] = 'changed'],
  ['server trigger', s => s.annotations['workers/triggered_by'] = 'deployment'],
  ['missing server trigger', s => delete s.annotations['workers/triggered_by']],
  ['unexpected commit provenance', s => s.annotations['workers/commit_sha'] = SHA],
  ['unknown annotation', s => s.annotations['workers/unreviewed'] = 'extra'],
  ['predecessor', s => s.latest = [B, OTHER, A]],
]) test('uploaded ' + label + ' drift prevents promotion and is never retried', async () => {
  const h = harness({ mode: 'execute-approved', mutate(event, s) { if (event === 'uploaded') change(s); } });
  await assert.rejects(releasePolicyPatch(h.io));
  assert.equal(posts(h).length, 1);
  assert.equal(h.state.receipts.at(-1).stopped_after, 'uploaded-not-promoted');
});

test('unknown upload outcome is journaled without retry or promotion', async () => {
  const h = harness({ mode: 'execute-approved', mutate(event) {
    if (event.startsWith('POST') && event.includes('/versions?')) throw new Error('unknown-outcome');
  } });
  await assert.rejects(releasePolicyPatch(h.io), /unknown-outcome/);
  assert.equal(posts(h).length, 1);
  assert.equal(h.state.receipts.at(-1).stopped_after, 'upload-attempted-outcome-unknown');
});

test('post-promotion configuration drift cannot be reported as complete or automatically rolled back', async () => {
  const h = harness({ mode: 'execute-approved', mutate(event, s) {
    if (event === 'promoted') s.uploaded.resources.script_runtime.compatibility_date = '2027-01-01';
  } });
  await assert.rejects(releasePolicyPatch(h.io), /post-promotion configuration changed/);
  assert.equal(posts(h).length, 2);
  assert.equal(h.state.receipts.at(-1).phase, 'stopped');
});

test('workflow keeps Member Pages in the existing approved path and payment release under its existing environment', () => {
  const member = readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml', import.meta.url), 'utf8');
  const separate = readFileSync(new URL('../.github/workflows/deploy-care-back-november-policy.yml', import.meta.url), 'utf8');
  const memberJob = member.slice(member.indexOf('  care-back-november-release:'));
  assert.match(memberJob, /needs: \[production-approval\]/);
  assert.match(memberJob, /environment: member-pages-code-only-owner/);
  assert.match(memberJob, /care-back-november-policy-release\.mjs/);
  assert.match(memberJob, /--promote-reviewed-upload/);
  assert.match(memberJob, /--execute-approved/);
  assert.doesNotMatch(memberJob, /wrangler|versions upload|versions deploy/);
  assert.match(separate, /default: inspect/);
  assert.match(separate, /uses: \.\/\.github\/workflows\/admin-production-approval\.yml/);
  assert.match(separate, /inputs\.worker == 'payments-worker'/);
  assert.match(separate, /environment: mmd-production-mutation/);
  assert.match(separate, /options: \[inspect, release, promote-reviewed-upload\]/);
  assert.match(member, /- care-back-november-resume/);
});

async function recoveryHarness(worker = 'payments-worker', mutateResume = () => {}) {
  let recovering = false;
  const h = harness({ worker, mode: 'execute-approved', mutate(event, state) {
    if (recovering) mutateResume(event, state);
  } });
  const approve = h.io.approve;
  h.io.approve = async () => {
    await approve();
    if (h.state.approvals === 3) throw new Error('fixture stopped before promotion');
  };
  await assert.rejects(releasePolicyPatch(h.io), /fixture stopped before promotion/);
  const receipt = h.state.receipts.at(-1);
  const contract = {
    version: B, tooling_sha: SHA, manifest_sha256: h.io.expectedManifestHash,
    configuration_sha256: receipt.configuration_sha256,
    settings_sha256: receipt.settings_sha256,
    boundary_sha256: receipt.boundary_sha256,
  };
  h.io.approve = approve;
  h.io.mode = 'promote-reviewed-upload';
  h.io.releaseSha = 'b'.repeat(40);
  h.state.calls = []; h.state.receipts = []; h.state.approvals = 0; h.state.sourceChecks = 0;
  recovering = true;
  return { ...h, options: { reviewedUploads: { [worker]: contract } }, contract };
}

for (const worker of ['payments-worker', 'member-pages-worker']) test(worker + ' explicit recovery verifies the existing upload and performs only one promotion', async () => {
  const h = await recoveryHarness(worker);
  const result = await releasePolicyPatch(h.io, h.options);
  assert.equal(result.phase, 'complete');
  assert.equal(result.uploaded_version, B);
  assert.equal(result.uploaded_tooling_sha, SHA);
  assert.equal(result.release_sha, 'b'.repeat(40));
  assert.deepEqual(posts(h).map(c => c.path), [h.root + '/deployments']);
  assert.equal(h.state.approvals, 2);
  assert.equal(h.state.sourceChecks, 2);
});

for (const [label, change] of [
  ['active deployment', h => h.state.deployment.id = OTHER],
  ['foreign latest upload', h => h.state.latest = [OTHER, B, A]],
  ['predecessor', h => h.state.latest = [B, OTHER, A]],
  ['original configuration receipt', h => h.contract.configuration_sha256 = 'f'.repeat(64)],
  ['settings since original upload', h => h.state.settings.logpush = true],
  ['routes since original upload', h => h.state.routes[0].pattern = 'changed.example.test/*'],
  ['uploaded configuration', h => h.state.uploaded.resources.bindings[0].text = 'changed'],
  ['uploaded module bytes', h => h.state.uploadedArtifact.modules[0].content_base64 = Buffer.from('export default {};').toString('base64')],
  ['uploaded module inventory', h => h.state.uploadedArtifact.modules.pop()],
  ['original upload provenance', h => h.state.annotations['workers/message'] += '-changed'],
  ['server annotation', h => h.state.annotations['workers/triggered_by'] = 'deployment'],
]) test('recovery ' + label + ' drift stops with zero writes', async () => {
  const h = await recoveryHarness(); change(h);
  await assert.rejects(releasePolicyPatch(h.io, h.options));
  assert.equal(posts(h).length, 0);
});

for (const [event, count] of [['approval', 1], ['approval', 2], ['source', 1], ['source', 2]]) test('recovery checks ' + event + ' at check ' + count, async () => {
  const h = await recoveryHarness('payments-worker', (current, state) => {
    if (current === event && (event === 'approval' ? state.approvals : state.sourceChecks) === count) throw new Error('fixture recovery rejected');
  });
  await assert.rejects(releasePolicyPatch(h.io, h.options), /fixture recovery rejected/);
  assert.equal(posts(h).length, 0);
});

test('unknown recovery promotion outcome is journaled without retry or upload', async () => {
  const h = await recoveryHarness('payments-worker', event => {
    if (event.startsWith('POST') && event.endsWith('/deployments')) throw new Error('fixture promotion outcome unknown');
  });
  await assert.rejects(releasePolicyPatch(h.io, h.options), /fixture promotion outcome unknown/);
  assert.deepEqual(posts(h).map(c => c.path), [h.root + '/deployments']);
  assert.equal(h.state.receipts.at(-1).stopped_after, 'promotion-attempted-outcome-unknown');
});

test('recovery transport cannot upload, even when execution is approved', async () => {
  const paths = [];
  const root = '/accounts/' + ACCOUNT + '/workers/scripts/payments-worker';
  const call = createPolicyTransport('fixture', 'payments-worker', {
    allowWrites: true, promoteOnly: true,
    request: async url => { paths.push(url); return Response.json({ success: true, result: {} }); },
  });
  await assert.rejects(call(root + '/versions?bindings_inherit=strict', { method: 'POST', body: new FormData() }));
  await call(root + '/deployments', { method: 'POST', body: '{}' });
  assert.deepEqual(paths, ['https://api.cloudflare.com/client/v4' + root + '/deployments']);
});

test('production recovery pins exactly the two reviewed manifests and still requires fresh owner approval', async () => {
  for (const [worker, file] of [
    ['payments-worker', 'care-back-november-payments-20261101.json'],
    ['member-pages-worker', 'care-back-november-memberpages-20261101.json'],
  ]) {
    const contract = REVIEWED_UPLOADS[worker];
    assert.ok(Object.isFrozen(contract));
    assert.equal(sha256(readFileSync(new URL('./fixtures/' + file, import.meta.url))), contract.manifest_sha256);
    for (const key of ['configuration_sha256', 'settings_sha256', 'boundary_sha256']) assert.match(contract[key], /^[a-f0-9]{64}$/);
    const e = { ...env(worker), EXPECTED_MANIFEST_SHA256: contract.manifest_sha256 };
    assert.equal(validateReleaseInputs(e, 'promote-reviewed-upload').mode, 'promote-reviewed-upload');
    for (const change of [
      { EXPECTED_MANIFEST_SHA256: 'f'.repeat(64) }, { PRODUCTION_APPROVED: 'false' },
      { GITHUB_RUN_ATTEMPT: '2' }, { APPROVED_SHA: 'b'.repeat(40) },
    ]) assert.throws(() => validateReleaseInputs({ ...e, ...change }, 'promote-reviewed-upload'));
  }
  const h = await recoveryHarness();
  await assert.rejects(releasePolicyPatch(h.io), /unreviewed recovery manifest/);
  assert.equal(posts(h).length, 0);
});

