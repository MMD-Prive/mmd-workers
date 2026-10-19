// Strict-inherit, code-only release transport for member-pages-worker.
// Importing this file never contacts GitHub or Cloudflare.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyOwnerApproval } from './member-pages-owner-approval.mjs';

export const ACCOUNT = 'b176eda1172b741fd2e58904cc9d77c5';
export const ZONE = '2d62396174fa2ddadbbcd0e8cf0f3367';
export const ROOT = `/accounts/${ACCOUNT}/workers/scripts/member-pages-worker`;
export const VERSION_ROOT = `/accounts/${ACCOUNT}/workers/workers/member-pages-worker/versions`;
export const CODE_ONLY_BASE_SHA = '05db9f10d32650a7b922475ea7e070f72ece4070';
export const CODE_ONLY_SOURCE_SHA = '151d21eabd988396eef36b944c931b23e51cea69';
// This release explicitly includes both merged changes; keep the original
// comparison base so the additional Points source is visible in its scope.
export const CODE_ONLY_INCLUDED_PULL_REQUESTS = [
  { number: 2522, merge_sha: '5e89a7386aa1e41d80ce3e945201b96b352ae799' },
  { number: 2523, merge_sha: '151d21eabd988396eef36b944c931b23e51cea69' },
];
// These exact blobs belong to another Worker and are never release inputs.
export const CODE_ONLY_EXCLUDED_CHANGE = {
  number: 2524,
  merge_sha: '7e8e08fc95a3258251523d29299c82fe838dc22d',
  paths: [
    'member-dashboard-chat-worker/src/index.js',
    'member-dashboard-chat-worker/src/kenji-line-continuity-runtime.mjs',
    'member-dashboard-chat-worker/test/kenji-line-continuity-runtime.test.mjs',
    'member-dashboard-chat-worker/test/kenji-model-layer.test.mjs',
    'member-dashboard-chat-worker/test/line-mmd-membership-keyword-reply.test.mjs',
    'member-dashboard-chat-worker/test/line-webhook.test.mjs',
  ],
};
export const CODE_ONLY_PATHS = [
  '.github/workflows/deploy-member-pages-worker-code-only.yml',
  'member-pages-worker/src/liff-member-shell.js',
  'member-pages-worker/src/my-mmd-lifetime-points.js',
  'member-pages-worker/src/points-display-source-guard.js',
  'member-pages-worker/test/kenji-line-member-truth.test.mjs',
  'member-pages-worker/test/liff-member-compact-v4.test.mjs',
  'member-pages-worker/test/liff-member-shell.test.mjs',
  'member-pages-worker/test/liff-quick-membership.test.mjs',
  'member-pages-worker/test/member-history-preview.test.mjs',
  'member-pages-worker/test/points-display-source-guard.test.mjs',
  'scripts/member-pages-code-only-release.mjs',
  'scripts/member-pages-code-only-release.test.mjs',
].sort();
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
const canonical = value => JSON.stringify(sort(value));
const ordered = value => [...value].sort((a, b) => canonical(a).localeCompare(canonical(b)));
const same = (a, b, reason) => assert.equal(canonical(a), canonical(b), reason);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');

export function validateCodeOnlySourcePaths(paths = [], { sha, readBlob } = {}) {
  const excluded = paths.filter(path => CODE_ONLY_EXCLUDED_CHANGE.paths.includes(path));
  assert.deepEqual(paths.filter(path => !CODE_ONLY_EXCLUDED_CHANGE.paths.includes(path)).sort(),
    CODE_ONLY_PATHS, 'source diff is outside the reviewed code-only file set');
  if (excluded.length) {
    assert.deepEqual([...excluded].sort(), [...CODE_ONLY_EXCLUDED_CHANGE.paths].sort(), 'incomplete excluded PR scope');
    assert.match(sha || '', /^[a-f0-9]{40}$/);
    assert.equal(typeof readBlob, 'function', 'excluded changes require exact Git blob evidence');
    for (const path of excluded) {
      const original = readBlob(CODE_ONLY_EXCLUDED_CHANGE.merge_sha, path);
      const current = readBlob(sha, path);
      assert.match(original || '', /^[a-f0-9]{40}$/);
      assert.match(current || '', /^[a-f0-9]{40}$/);
      assert.equal(current, original, 'excluded PR file changed after review');
    }
  }
  return { included_paths:[...CODE_ONLY_PATHS], excluded_changes:excluded.length
    ? [{number:CODE_ONLY_EXCLUDED_CHANGE.number, merge_sha:CODE_ONLY_EXCLUDED_CHANGE.merge_sha, paths:[...excluded].sort()}] : [] };
}

export function validateCodeOnlySourceHistory(sha, isAncestor) {
  assert.equal(sha, CODE_ONLY_SOURCE_SHA, 'only the exact reviewed PR 2523 source may be bundled');
  for (const ancestor of [CODE_ONLY_BASE_SHA, ...CODE_ONLY_INCLUDED_PULL_REQUESTS.map(pr => pr.merge_sha)]) {
    assert.equal(isAncestor(ancestor, sha), true, 'reviewed release commit missing from source history');
  }
}

// Release tooling may advance on main; the deployed application source cannot.
export function inspectCodeOnlyCheckouts(releaseSha, sourceDirectory, {
  releaseDirectory = process.cwd(),
  git = (cwd, ...args) => execFileSync('git', args, {
    cwd, encoding:'utf8', stdio:['ignore','pipe','ignore'],
  }).trim(),
} = {}) {
  assert.match(releaseSha || '', /^[a-f0-9]{40}$/);
  assert.ok(sourceDirectory, 'separate pinned source checkout required');
  assert.notEqual(resolve(sourceDirectory), resolve(releaseDirectory), 'source must be separate from release tooling');
  for (const [directory, expected] of [[releaseDirectory, releaseSha], [sourceDirectory, CODE_ONLY_SOURCE_SHA]]) {
    assert.equal(resolve(git(directory, 'rev-parse', '--show-toplevel')), resolve(directory), 'checkout root mismatch');
    assert.equal(git(directory, 'rev-parse', 'HEAD'), expected, 'checkout SHA mismatch');
    assert.equal(git(directory, 'status', '--porcelain', '--untracked-files=all', '--ignored'), '', 'dirty checkout');
  }
  const sourceSha = git(sourceDirectory, 'rev-parse', 'HEAD');
  validateCodeOnlySourceHistory(sourceSha, (ancestor, target) => {
    git(sourceDirectory, 'merge-base', '--is-ancestor', ancestor, target);
    return true;
  });
  git(releaseDirectory, 'merge-base', '--is-ancestor', sourceSha, releaseSha);
  const sourceScope = validateCodeOnlySourcePaths(
    git(sourceDirectory, 'diff', '--name-only', CODE_ONLY_BASE_SHA, sourceSha).split('\n').filter(Boolean),
    {sha:sourceSha, readBlob:(reference, path)=>git(sourceDirectory, 'rev-parse', reference+':'+path)});
  assert.equal(git(sourceDirectory, 'diff', CODE_ONLY_BASE_SHA, sourceSha, '--', 'member-pages-worker/wrangler.toml'), '',
    'Worker config/migrations changed; separate release review required');
  return { method:'separate-pinned-source-checkout', source_sha:sourceSha, release_sha:releaseSha,
    config_unchanged:true, comparison_base_sha:CODE_ONLY_BASE_SHA,
    included_pull_requests:CODE_ONLY_INCLUDED_PULL_REQUESTS, source_scope:sourceScope };
}

export function activeVersion(deployment) {
  assert.ok(UUID.test(deployment?.id || ''), 'exact active deployment required');
  assert.equal(deployment.strategy, 'percentage', 'unknown allocation strategy');
  assert.equal(deployment.versions?.length, 1, 'split traffic requires review');
  assert.equal(deployment.versions[0].percentage, 100, '100% active baseline required');
  assert.ok(UUID.test(deployment.versions[0].version_id || ''), 'exact active version required');
  return deployment.versions[0].version_id;
}

export function versionConfiguration(version) {
  const resources = version?.resources;
  assert.ok(resources?.script && resources?.script_runtime && Array.isArray(resources.bindings), 'baseline inventory incomplete');
  assert.ok(Object.keys(resources).every(key => ['bindings','script','script_runtime','assets'].includes(key)), 'unknown Worker resource configuration');
  assert.ok(!resources.assets && !resources.script.assets && !resources.script.containers, 'assets/containers need separate review');
  assert.ok(Object.keys(resources.script).every(key => ['etag','last_deployed_from','handlers','named_handlers','placement','placement_mode','assets','containers'].includes(key)), 'unknown Worker script configuration');
  const names = new Set();
  const bindings = resources.bindings.map(binding => {
    assert.ok(binding?.name && binding?.type && !names.has(binding.name), 'invalid or duplicate binding');
    names.add(binding.name);
    // Never read, compare, or place secret values in a receipt.
    return ['secret_text', 'secret_key'].includes(binding.type)
      ? { name: binding.name, type: binding.type } : binding;
  });
  const { etag, last_deployed_from, ...script } = resources.script;
  return { bindings: ordered(bindings), runtime: resources.script_runtime, script,
    cache_options: version.cache_options ?? null };
}

export function uploadMetadata(version, sha) {
  assert.match(sha || '', /^[a-f0-9]{40}$/);
  versionConfiguration(version);
  const r = version.resources;
  const runtime = r.script_runtime;
  assert.ok(Object.keys(runtime).every(key => ['compatibility_date','compatibility_flags','usage_model','limits','migration_tag'].includes(key)), 'unknown runtime setting');
  assert.match(runtime.compatibility_date || '', /^\d{4}-\d{2}-\d{2}$/);
  const metadata = {
    main_module: 'worker.js',
    bindings: r.bindings.map(binding => ({ name: binding.name, type: 'inherit' })),
    compatibility_date: runtime.compatibility_date,
    compatibility_flags: runtime.compatibility_flags || [],
    annotations: { 'workers/commit_sha': sha, 'workers/message': `member-pages code-only source-sha=${sha}` },
  };
  if (runtime.usage_model !== undefined) metadata.usage_model = runtime.usage_model;
  if (runtime.limits !== undefined) metadata.limits = runtime.limits;
  if (r.script.placement) metadata.placement = r.script.placement;
  else if (r.script.placement_mode === 'smart') metadata.placement = { mode: 'smart' };
  else assert.ok(!r.script.placement_mode || r.script.placement_mode === 'off', 'unknown placement setting');
  if (version.cache_options != null) metadata.cache_options = version.cache_options;
  return metadata;
}

export function versionAnnotations(version) {
  const topLevel = version?.annotations;
  const metadata = version?.metadata?.annotations;
  if (topLevel && metadata) same(topLevel, metadata, 'conflicting Worker version annotations');
  return topLevel || metadata || null;
}

export function createTransport(token, request = fetch) {
  assert.ok(token, 'Cloudflare credential required');
  return async (path, { method = 'GET', body } = {}) => {
    const id = '[a-f0-9-]{36}';
    const reads = new RegExp(`^${ROOT}/(deployments(?:/${id})?|versions(?:/${id})?|script-settings|schedules|subdomain)$`, 'i').test(path)
      || new RegExp(`^${VERSION_ROOT}/${id}$`, 'i').test(path)
      || path === `/zones/${ZONE}/workers/routes`;
    const writes = method === 'POST' && [ROOT + '/versions?bindings_inherit=strict', ROOT + '/deployments'].includes(path);
    assert.ok((method === 'GET' && reads) || writes, 'Cloudflare call outside code-only allowlist');
    let response;
    try {
      response = await request('https://api.cloudflare.com/client/v4' + path, {
        method, body, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`,
          ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      });
    } catch { throw new Error('Cloudflare transport failed; outcome may be unknown; do not retry'); }
    const payload = await response.json().catch(() => null);
    assert.ok(response.ok && payload?.success === true, `Cloudflare ${method} failed (${response.status}); stop without retry`);
    return payload.result;
  };
}

export async function releaseMemberPagesCodeOnly(io) {
  const state = { phase: 'preflight', worker: 'member-pages-worker', source_sha: io.sha, release_sha:io.releaseSha };
  const save = phase => { state.phase = phase; io.save({ ...state }); };
  try {
    await io.approve();
    assert.equal(io.sha, CODE_ONLY_SOURCE_SHA, 'release source must be the exact PR 2523 merge');
    assert.match(io.releaseSha || '', /^[a-f0-9]{40}$/);
    const call = (suffix, init) => io.call(ROOT + suffix, init);
    const deployment = (await call('/deployments'))?.deployments?.[0];
    const current = activeVersion(deployment);
    assert.equal(current, io.expectedVersion, 'active version differs from approved preflight');
    assert.equal(deployment.id, io.expectedDeployment, 'active deployment differs from approved preflight');
    const baseline = await call('/versions/' + current);
    assert.equal(baseline.id, current, 'active version readback mismatch');
    const config = versionConfiguration(baseline);
    const metadata = uploadMetadata(baseline, io.sha);
    state.configuration_digest = digest(config);
    state.settings_digest = digest(await call('/script-settings'));
    const boundary = async () => ({
      routes: ordered(await io.call(`/zones/${ZONE}/workers/routes`)),
      schedules: ordered((await call('/schedules'))?.schedules || []),
      subdomain: await call('/subdomain'),
    });
    const environment = await boundary();
    state.boundary_digest = digest(environment);
    const unchanged = async (expectedDeployment, latestVersion) => {
      const currentDeployment = (await call('/deployments'))?.deployments?.[0];
      activeVersion(currentDeployment);
      same(currentDeployment, expectedDeployment, 'active deployment drift');
      assert.equal((await call('/versions'))?.items?.[0]?.id, latestVersion, 'latest version drift');
      assert.equal(digest(await call('/script-settings')), state.settings_digest, 'Worker settings drift');
      assert.equal(digest(await boundary()), state.boundary_digest, 'routes, schedules, or subdomain drift');
    };
    assert.equal((await call('/versions'))?.items?.[0]?.id, current, 'latest version is not the active version');
    await unchanged(deployment, current);
    state.baseline_version = current;
    state.baseline_deployment = deployment.id;
    state.source_evidence = await io.sourceCheck();
    const module = await io.bundle(baseline);
    assert.ok(module instanceof Uint8Array && module.byteLength > 0, 'compiled Worker module required');
    state.bundle_sha256 = createHash('sha256').update(module).digest('hex');
    await io.approve();
    await unchanged(deployment, current);

    const form = new FormData();
    form.set('metadata', JSON.stringify(metadata));
    form.set('worker.js', new Blob([module], { type: 'application/javascript+module' }), 'worker.js');
    save('upload-attempted-outcome-unknown');
    const uploaded = await call('/versions?bindings_inherit=strict', { method: 'POST', body: form });
    assert.ok(UUID.test(uploaded?.id || '') && uploaded.id !== current, 'ambiguous uploaded version; stop');
    state.uploaded_version = uploaded.id;
    save('uploaded-not-promoted');
    const exact = await call('/versions/' + uploaded.id);
    assert.equal(exact.id, uploaded.id, 'uploaded version identity mismatch');
    same(versionConfiguration(exact), config, 'Worker configuration changed during code-only upload');
    const annotationReadback = await io.call(VERSION_ROOT + '/' + uploaded.id);
    assert.equal(annotationReadback?.id, uploaded.id, 'uploaded version annotation identity mismatch');
    const exactAnnotations = versionAnnotations(annotationReadback);
    assert.equal(exactAnnotations?.['workers/commit_sha'], metadata.annotations['workers/commit_sha'], 'source SHA annotation mismatch');
    assert.equal(exactAnnotations?.['workers/message'], metadata.annotations['workers/message'], 'source message annotation mismatch');
    const versions = (await call('/versions'))?.items;
    assert.equal(versions?.[0]?.id, uploaded.id, 'uploaded version is not latest');
    assert.equal(versions?.[1]?.id, current, 'active predecessor changed');
    await io.approve();
    await unchanged(deployment, uploaded.id);

    save('promotion-attempted-outcome-unknown');
    const promoted = await call('/deployments', { method: 'POST', body: JSON.stringify({
      strategy: 'percentage', versions: [{ version_id: uploaded.id, percentage: 100 }],
    }) });
    assert.ok(UUID.test(promoted?.id || '') && promoted.id !== deployment.id, 'ambiguous promotion; stop');
    state.deployment = promoted.id;
    const receipt = await call('/deployments/' + promoted.id);
    assert.equal(receipt.id, promoted.id);
    assert.equal(activeVersion(receipt), uploaded.id);
    await unchanged(receipt, uploaded.id);
    same(versionConfiguration(await call('/versions/' + uploaded.id)), config, 'post-promotion configuration changed');
    save('complete');
    return { ...state, phase: 'complete' };
  } catch (error) {
    state.stopped_after = state.phase;
    save('stopped');
    throw error;
  }
}

export function validateBundleFiles(files) {
  assert.deepEqual(files.filter(name => !['README.md','runtime-index.js.map'].includes(name)).sort(),
    ['runtime-index.js'], 'unexpected/multiple Worker modules; review bundle format');
}

export function validateBundleSourceMap(map, mapDirectory, repositoryRoot = process.cwd()) {
  assert.equal(map?.version, 3, 'bundle source map required');
  assert.ok(Array.isArray(map.sources) && map.sources.length > 0, 'bundle input inventory missing');
  assert.ok(typeof map.mappings === 'string' && map.mappings.length > 0, 'bundle mappings missing');
  assert.ok(typeof (map.sourceRoot ?? '') === 'string', 'unknown bundle source root');
  const root = resolve(mapDirectory, map.sourceRoot || '');
  const inputs = map.sources.map(source => {
    assert.equal(typeof source, 'string', 'unknown bundle input');
    const path = relative(repositoryRoot, resolve(root, source)).split(sep).join('/');
    assert.ok(['member-pages-worker/', 'shared/', 'auth-worker/'].some(prefix => path.startsWith(prefix)),
      'bundle includes an unreviewed dependency or another Worker');
    return path;
  });
  assert.ok(inputs.includes('member-pages-worker/src/runtime-index.js'), 'unexpected bundle entry point');
  return [...new Set(inputs)].sort();
}

export function buildMemberPagesBundle(dir, sourceDirectory, run = execFileSync) {
  assert.ok(sourceDirectory, 'pinned bundle source directory required');
  run('wrangler', ['versions','upload','--dry-run','--env=','--config','member-pages-worker/wrangler.toml','--outdir',dir], {
    cwd:sourceDirectory, stdio: 'ignore', env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_KEY: '',
      WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(tmpdir(),`mmd-member-pages-wrangler-${process.pid}.log`) },
  });
  validateBundleFiles(readdirSync(dir));
  validateBundleSourceMap(JSON.parse(readFileSync(join(dir,'runtime-index.js.map'),'utf8')),dir,sourceDirectory);
  return readFileSync(join(dir,'runtime-index.js'));
}

async function main() {
  assert.equal(process.argv[2], '--execute-approved', 'explicit approved execution flag required');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true', 'Owner approval input required');
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT, 'wrong Cloudflare account');
  const releaseSha = process.env.GITHUB_SHA;
  const sourceDirectory = process.env.SOURCE_DIRECTORY;
  const approve = async () => {
    await verifyOwnerApproval(process.env);
    inspectCodeOnlyCheckouts(releaseSha, sourceDirectory);
  };
  const dir = mkdtempSync(join(tmpdir(),'mmd-member-pages-code-only-'));
  const journal = resolve(process.env.RUNNER_TEMP || dir,'member-pages-code-only-receipt.json');
  await releaseMemberPagesCodeOnly({
    sha:CODE_ONLY_SOURCE_SHA,
    releaseSha,
    expectedVersion: process.env.EXPECTED_VERSION,
    expectedDeployment: process.env.EXPECTED_DEPLOYMENT,
    approve,
    call: createTransport(process.env.CLOUDFLARE_API_TOKEN),
    sourceCheck: async () => inspectCodeOnlyCheckouts(releaseSha, sourceDirectory),
    bundle: async () => buildMemberPagesBundle(dir, sourceDirectory),
    save: value => writeFileSync(journal,JSON.stringify(value,null,2),{mode:0o600}),
  });
  console.log('Member Pages code-only release readback complete; no business-write smoke was run.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Code-only release stopped. Inspect its sanitized receipt; never retry automatically.'); process.exitCode = 1; });
}
