import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { activeVersion, createBuildEvidence, createTransport, releaseCurrentSession, ROOT, uploadMetadata, validateBundleFiles, validateReceiptLinks, validateSourceState, ZONE } from './admin-current-session-code-only.mjs';

const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const sha = 'a'.repeat(40);
const clone = x => structuredClone(x);
test('bundle allows only the primary module and its local-only source map/readme', () => {
  validateBundleFiles(['admin-login-hero-worker.js', 'admin-login-hero-worker.js.map', 'README.md']);
  for (const files of [[], ['other.js'], ['admin-login-hero-worker.js', 'extra.js'],
    ['admin-login-hero-worker.js', 'asset.wasm'], ['admin-login-hero-worker.js', 'nested']]) {
    assert.throws(() => validateBundleFiles(files));
  }
});
test('source state records the full matching SHA and rejects any dirty path', () => {
  assert.deepEqual(validateSourceState({ expectedSha: sha, headSha: sha, dirtyStatus: '' }),
    { commit_sha: sha, dirty_tree: false, dirty_path_count: 0 });
  assert.throws(() => validateSourceState({ expectedSha: sha, headSha: sha, dirtyStatus: ' M admin-worker/index.js' }), /dirty checkout/);
  assert.throws(() => validateSourceState({ expectedSha: sha, headSha: id(1), dirtyStatus: '' }), /checkout SHA mismatch/);
});
test('build evidence hashes lockfile, generated config and exact uploaded module without source contents', () => {
  const code = new Uint8Array([1, 2, 3]);
  const evidence = createBuildEvidence({ code, releaseId: '1200.1', nodeVersion: 'v22.23.3',
    wranglerVersion: '4.105.0', lockfile: new Uint8Array([4, 5]), wranglerConfig: new Uint8Array([6, 7]) });
  assert.equal(evidence.artifact.digest.value, evidence.artifact.modules[0].digest.value);
  assert.equal(evidence.artifact.modules[0].bytes, 3);
  assert.equal(evidence.artifact.digest.algorithm, 'sha256');
  assert.equal(evidence.lockfile.digest.algorithm, 'sha256');
  assert.equal(evidence.additional_inputs[0].digest.algorithm, 'sha256');
  assert.equal(Object.hasOwn(evidence.artifact.modules[0], 'content'), false);
  assert.throws(() => createBuildEvidence({ code, releaseId: '1200.1', nodeVersion: 'v20.1.0',
    wranglerVersion: '4.105.0', lockfile: new Uint8Array([4]), wranglerConfig: new Uint8Array([5]) }), /unexpected Node.js toolchain/);
});
test('receipt chain rejects missing and mismatched upload/deployment evidence', () => {
  const build = createBuildEvidence({ code: new Uint8Array([1]), releaseId: '1001.1', nodeVersion: 'v22.1.0',
    wranglerVersion: '4.105.0', lockfile: new Uint8Array([2]), wranglerConfig: new Uint8Array([3]) });
  const source = { commit_sha: sha, dirty_tree: false };
  const upload = { release_id: '1001.1', version_id: id(3), recorded_at: '2026-10-21T00:00:00.000Z' };
  const deployment = { deployment_id: id(4), readback_at: '2026-10-21T00:00:01.000Z',
    version_id: id(3), strategy: 'percentage', allocations: [{ version_id: id(3), percentage: 100 }] };
  assert.equal(validateReceiptLinks({ source, build, upload, deployment }), true);
  assert.throws(() => validateReceiptLinks({ source, build, upload: null, deployment }), /upload response version missing/);
  assert.throws(() => validateReceiptLinks({ source, build, upload: { ...upload, release_id: '9999.1' }, deployment }), /does not link to this build/);
  assert.throws(() => validateReceiptLinks({ source, build, upload, deployment: { ...deployment, version_id: id(5) } }), /differs from upload response/);
  assert.throws(() => validateReceiptLinks({ source: { ...source, dirty_tree: true }, build, upload, deployment }), /dirty source/);
});
function fixture(options = {}) {
  const initial = { id: id(1), strategy: 'percentage', versions: [{ version_id: id(2), percentage: 100 }] };
  const version = { id: id(2), resources: {
    bindings: [{ name: 'MODEL_SESSION_SIGNING_SECRET', type: 'secret_text' },
      { name: 'MODE', type: 'plain_text', text: 'unchanged-fixture' },
      { name: 'DATABASE', type: 'kv_namespace', namespace_id: 'fixture-namespace' }],
    script_runtime: { compatibility_date: '2026-01-01', compatibility_flags: [], migration_tag: 'existing' },
    script: { etag: 'old-code', handlers: ['fetch', 'scheduled'], named_handlers: [] },
  } };
  let uploaded = false, promoted = false, approvals = 0;
  const requests = [], receipts = [];
  const io = {
    sha, expectedVersion: id(2), expectedDeployment: id(1),
    sourceCheck: async () => { if (options.sourceError) throw new Error('source provenance missing'); return { commit_sha: sha, dirty_tree: false, method: 'fixture' }; },
    buildEvidence: async code => createBuildEvidence({ code, releaseId: '1001.1', nodeVersion: 'v22.1.0',
      wranglerVersion: '4.105.0', lockfile: new Uint8Array([4]), wranglerConfig: new Uint8Array([5]) }),
    now: () => '2026-10-21T00:00:00.000Z',
    approve: async () => { approvals++; if (approvals === options.rejectApproval) throw new Error('approval blocked'); },
    bundle: async () => { if (options.bundleError) throw new Error('bundle error'); return new Uint8Array([1, 2, 3]); },
    save: value => receipts.push(clone(value)),
    call: async (path, init = {}) => {
      const method = init.method || 'GET';
      requests.push({ path, method, body: init.body });
      let result;
      if (path === ROOT + '/versions?bindings_inherit=strict' && method === 'POST') {
        if (options.uploadError) throw new Error('migration or network error; outcome unknown');
        uploaded = true;
        result = { id: id(3) };
      } else if (path === ROOT + '/deployments' && method === 'POST') {
        if (options.promoteError) throw new Error('promotion outcome unknown');
        promoted = true;
        result = { id: id(4) };
      } else if (path === ROOT + '/deployments' || path === ROOT + '/deployments/' + id(4)) {
        const current = promoted ? { ...initial, id: id(4), versions: [{ version_id: id(3), percentage: 100 }] } : initial;
        result = path.endsWith('/deployments') ? { deployments: [clone(current)] } : clone(current);
      } else if (path === ROOT + '/versions') {
        result = { items: (uploaded ? [id(3), id(2)] : [id(2)]).map(id => ({ id })) };
      } else if (path === ROOT + '/versions/' + id(2)) result = clone(version);
      else if (path === ROOT + '/versions/' + id(3)) result = {
        ...clone(version), id: id(3), annotations: { 'workers/commit_sha': sha },
        resources: { ...clone(version.resources), script: { ...clone(version.resources.script), etag: 'new-code' } },
      };
      else if (path.endsWith('/script-settings')) result = { logpush: false, observability: { enabled: true } };
      else if (path.endsWith('/schedules')) result = { schedules: [{ cron: '*/5 * * * *' }] };
      else if (path.endsWith('/subdomain')) result = { enabled: true, previews_enabled: false };
      else if (path === `/zones/${ZONE}/workers/routes`) result = [{ pattern: 'mmdbkk.com/v1/model/session/current*', script: 'admin-worker' }];
      else throw new Error('unexpected request: ' + path);
      return options.alter ? options.alter(clone(result), { path, method, uploaded, promoted, requests }) : result;
    },
  };
  return { io, requests, receipts, version, writes: () => requests.filter(x => x.method === 'POST') };
}

test('happy path: one strict-inherit upload, one exact promotion, GET-only boundary reads', async () => {
  const f = fixture();
  const result = await releaseCurrentSession(f.io);
  assert.equal(result.phase, 'complete');
  assert.deepEqual(f.writes().map(x => x.path), [ROOT + '/versions?bindings_inherit=strict', ROOT + '/deployments']);
  const metadata = JSON.parse(f.writes()[0].body.get('metadata'));
  assert.deepEqual(metadata.bindings, f.version.resources.bindings.map(b => ({ name: b.name, type: 'inherit' })));
  assert.equal(JSON.stringify(metadata).includes('unchanged-fixture'), false);
  assert.deepEqual(JSON.parse(f.writes()[1].body), { strategy: 'percentage', versions: [{ version_id: id(3), percentage: 100 }] });
  assert.equal(f.receipts.some(x => JSON.stringify(x).includes('unchanged-fixture')), false);
  assert.equal(result.deployment, id(4));
  const completedReceipt = f.receipts.find(x => x.phase === 'complete');
  assert.equal(completedReceipt.source_evidence.commit_sha, sha);
  assert.equal(completedReceipt.source_evidence.dirty_tree, false);
  assert.equal(completedReceipt.upload_response.version_id, id(3));
  assert.equal(completedReceipt.deployment_evidence.deployment_id, id(4));
  assert.deepEqual(completedReceipt.deployment_evidence.allocations, [{ version_id: id(3), percentage: 100 }]);
  assert.equal(completedReceipt.build_evidence.artifact.digest.value, completedReceipt.bundle_sha256);
});

test('missing/mismatched build receipt stops before any upload', async () => {
  for (const mode of ['missing', 'mismatch']) {
    const f = fixture();
    if (mode === 'missing') f.io.buildEvidence = undefined;
    else f.io.buildEvidence = async () => ({ release_id: '1001.1', artifact: { digest: { algorithm: 'sha256', value: '0'.repeat(64) } } });
    await assert.rejects(releaseCurrentSession(f.io));
    assert.equal(f.writes().length, 0);
  }
});

for (const [stage, writes] of [[1, 0], [2, 0], [3, 1]]) test(`approval denial at stage ${stage} stops before next mutation`, async () => {
  const f = fixture({ rejectApproval: stage });
  await assert.rejects(releaseCurrentSession(f.io));
  assert.equal(f.writes().length, writes);
});

for (const key of ['expectedVersion', 'expectedDeployment']) test(`wrong ${key} prevents upload`, async () => {
  const f = fixture(); f.io[key] = id(99);
  await assert.rejects(releaseCurrentSession(f.io));
  assert.equal(f.writes().length, 0);
});

for (const [name, options, writes] of [
  ['bundle failure', { bundleError: true }, 0],
  ['source provenance missing', { sourceError: true }, 0],
  ['upload error/migration', { uploadError: true }, 1],
  ['promotion unknown', { promoteError: true }, 2],
]) test(`${name}: never retry, fall back, or automatically roll back`, async () => {
  const f = fixture(options);
  await assert.rejects(releaseCurrentSession(f.io));
  assert.equal(f.writes().length, writes);
  assert.equal(f.receipts.at(-1).phase, 'stopped');
});

for (const [name, change] of [
  ['binding', x => { x.resources.bindings[1].text = 'changed'; }],
  ['secret name', x => { x.resources.bindings[0].name = 'OTHER_SECRET'; }],
  ['runtime', x => { x.resources.script_runtime.compatibility_date = '2026-02-01'; }],
  ['migration tag', x => { x.resources.script_runtime.migration_tag = 'new'; }],
  ['handlers', x => { x.resources.script.handlers = ['fetch']; }],
  ['source', x => { x.annotations['workers/commit_sha'] = 'b'.repeat(40); }],
]) test(`uploaded ${name} mismatch blocks promotion`, async () => {
  const f = fixture({ alter(x, context) { if (context.path === ROOT + '/versions/' + id(3)) change(x); return x; } });
  await assert.rejects(releaseCurrentSession(f.io));
  assert.equal(f.writes().length, 1);
});

for (const path of ['/script-settings', '/schedules', '/subdomain', 'workers/routes', '/versions', '/deployments']) {
  test(`${path} drift after upload blocks promotion`, async () => {
    const f = fixture({ alter(x, context) {
      if (context.uploaded && !context.promoted && context.method === 'GET' && context.path.endsWith(path)) {
        if (path === '/versions') x.items[0].id = id(99);
        else if (path === '/deployments') x.deployments[0].id = id(99);
        else if (Array.isArray(x)) x.push({ pattern: 'changed', script: 'other-worker' });
        else x.drift = true;
        if (path === '/schedules') x.schedules.push({ cron: '* * * * *' });
      }
      return x;
    } });
    await assert.rejects(releaseCurrentSession(f.io));
    assert.equal(f.writes().length, 1);
  });
}

test('inactive latest version prevents inheritance from the wrong configuration', async () => {
  const f = fixture({ alter(x, c) { if (c.path === ROOT + '/versions') x.items[0].id = id(99); return x; } });
  await assert.rejects(releaseCurrentSession(f.io)); assert.equal(f.writes().length, 0);
});

test('post-promotion drift is reported without automatic recovery mutation', async () => {
  const f = fixture({ alter(x, c) { if (c.promoted && c.path.endsWith('/subdomain')) x.enabled = false; return x; } });
  await assert.rejects(releaseCurrentSession(f.io));
  assert.equal(f.writes().length, 2);
  assert.equal(f.receipts.at(-1).stopped_after, 'promotion-attempted-outcome-unknown');
});

test('split/unknown allocation, duplicate bindings, and unknown runtime fail closed', () => {
  const f = fixture();
  assert.throws(() => activeVersion({ id: id(1), strategy: 'percentage', versions: [] }));
  f.version.resources.bindings.push(f.version.resources.bindings[0]);
  assert.throws(() => uploadMetadata(f.version, sha));
  const other = fixture().version; other.resources.script_runtime.unknown = true;
  assert.throws(() => uploadMetadata(other, sha));
});

for (const [method, path] of [
  ['PUT', ROOT], ['PATCH', ROOT + '/settings'], ['POST', ROOT + '/schedules'],
  ['POST', `/zones/${ZONE}/workers/routes`], ['POST', ROOT + '/secrets'],
  ['DELETE', ROOT + '/versions/' + id(3)], ['POST', ROOT + '/versions'],
  ['GET', ROOT.replace('admin-worker', 'payments-worker') + '/settings'],
  ['POST', 'https://outside.example/path'],
]) test(`transport rejects ${method} ${path} before fetch`, async () => {
  let calls = 0;
  const request = createTransport('fixture', async () => { calls++; });
  await assert.rejects(request(path, { method })); assert.equal(calls, 0);
});

test('transport never retries or exposes upstream bodies', async () => {
  let calls = 0;
  const request = createTransport('fixture', async (_, options) => {
    calls++; assert.equal(options.redirect, 'error');
    return { ok: false, status: 400, json: async () => ({ success: false, errors: ['private-upstream'] }) };
  });
  await assert.rejects(request(ROOT + '/versions?bindings_inherit=strict', { method: 'POST', body: new FormData() }),
    error => !error.message.includes('private-upstream'));
  assert.equal(calls, 1);
});

test('workflow is manual, exact-SHA, independently protected, and not the broad deployment path', () => {
  const source = readFileSync(new URL('../.github/workflows/deploy-admin-current-session-code-only.yml', import.meta.url), 'utf8');
  assert.match(source, /^  workflow_dispatch:/m);
  assert.doesNotMatch(source, /^  (push|pull_request|schedule|workflow_run):/m);
  assert.match(source, /default: false/);
  assert.match(source, /actions: read/);
  assert.equal((source.match(/inputs.approved_sha == github.sha/g) || []).length, 2);
  assert.match(source, /needs: \[production-approval\]\n    environment: mmd-production-mutation/);
  assert.match(source, /EXPECTED_VERSION: \$\{\{ inputs.expected_version \}\}/);
  assert.match(source, /EXPECTED_DEPLOYMENT: \$\{\{ inputs.expected_deployment \}\}/);
  assert.doesNotMatch(source, /ensure-private|ensure-payment|ensure.*routes|wrangler deploy|wrangler secret|secrets: inherit|--var|--keep-vars/);
  assert.equal((source.match(/secrets\./g) || []).length, 1);
  assert.match(source, /node scripts\/admin-current-session-code-only.mjs --execute-approved/);
  assert.match(source, /current-session-code-only-receipt-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(source, /retention-days: 90/);
});
