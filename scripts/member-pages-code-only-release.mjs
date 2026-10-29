// Strict-inherit, code-only release transport for member-pages-worker.
// Importing this file never contacts GitHub or Cloudflare.
import assert from 'node:assert/strict';
import {COMPANION_BASE_VERSION,COMPANION_BASE_DEPLOYMENT,COMPANION_CANDIDATE_SHA256,ACTIVE_ARTIFACT_SHA256,decodeBaselineModule,buildReviewedCompanionArtifact} from './member-pages-artifact-delta.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyOwnerApproval, createSafePreflightDiagnostics } from './member-pages-owner-approval.mjs';

export const ACCOUNT = 'b176eda1172b741fd2e58904cc9d77c5';
export const ZONE = '2d62396174fa2ddadbbcd0e8cf0f3367';
export const ROOT = `/accounts/${ACCOUNT}/workers/scripts/member-pages-worker`;
export const VERSION_ROOT = `/accounts/${ACCOUNT}/workers/workers/member-pages-worker/versions`;
export const CODE_ONLY_BASE_SHA = '05db9f10d32650a7b922475ea7e070f72ece4070';
export const CODE_ONLY_PREVIOUS_SOURCE_SHA = '151d21eabd988396eef36b944c931b23e51cea69';
export const CODE_ONLY_GRAPHICS_BASE_SHA = 'a815e173fff1471901dae55646c984ed0b5f23f3';
export const CODE_ONLY_GRAPHICS_SOURCE_SHA = 'a53571bc9d572755dff65599767d09a240d74b93';
export const CODE_ONLY_STARTUP_BASE_SHA = 'ebf5236b6d9a3e9bea28c89db1f6c2e18b8ddebc';
export const CODE_ONLY_SOURCE_SHA = 'fe5f9d98876b600421c5614efc049ffc890b8adb';
export const CODE_ONLY_MY_MMD_SOURCE_SHA = '871d99cd9eb1c8d53e1d473160119030dca01d4c';
export const CODE_ONLY_SOURCE_CONFIG_BLOB = 'e26a9d3436140f381f5d6f55311c43c81e7deb40';
// #2843 is an isolated candidate scope. The active d81d1bad version was
// uploaded from an earlier Worker artifact with six in-bundle edits, so this
// inventory does not authorize changing the executable source pin below.
export const COMPANION_DELTA_BASE_SHA = '5f7f09bffb6584df5a7322d178b39945fdef1aba';
export const COMPANION_DELTA_SOURCE_SHA = '7f9c8f9f410a0ed0003d07de0c0675a0a56748d8';
export const COMPANION_DELTA_BLOBS = {
  'member-pages-worker/src/liff-customer-brand-v6.js': '2d0ca3be2e7101e71147bc9d3e4b37c78fd9291b',
  'member-pages-worker/src/liff-member-shell.js': 'adf08770907963156a528241a0a052a9773df90f',
  'member-pages-worker/src/liff-personal-main-public-images.js': 'e2f2afeb7e9b338eec4514ba98428d1b6932d08e',
  'member-pages-worker/src/liff-personal-main.js': '6dfa638dbdf1369d2fefabdaf6ef1d66fad6fac9',
  'member-pages-worker/test/liff-member-shell.test.mjs': 'fcd3eb34c60b3d1f2348f56d8cd74fb50300e9d7',
  'member-pages-worker/test/liff-personal-main.test.mjs': '472ad05be48c0590e73bc34f1eee8d9bf733da11',
};

export function validateCompanionDelta(paths, readBlob) {
  assert.deepEqual([...paths].sort(), Object.keys(COMPANION_DELTA_BLOBS).sort(),
    'Companion source delta differs from reviewed #2843 paths');
  for (const [path, expected] of Object.entries(COMPANION_DELTA_BLOBS)) {
    assert.equal(readBlob(COMPANION_DELTA_SOURCE_SHA, path), expected,
      'Companion reviewed source blob drift');
  }
  return Object.keys(COMPANION_DELTA_BLOBS).sort();
}
// Every runtime, test, and build-control path changed since the original startup release.
// The source pin and exact path inventory prevent a later main change entering this release.
export const CODE_ONLY_POST_STARTUP_PATHS = [
  'member-pages-worker/src/index.js',
  'member-pages-worker/src/kenji-member-session-truth.js',
  'member-pages-worker/src/liff-account-view.js',
  'member-pages-worker/src/liff-customer-brand-v6.js',
  'member-pages-worker/src/liff-customer-graphics.js',
  'member-pages-worker/src/liff-customer-progress.js',
  'member-pages-worker/src/liff-gateway-airtable.js',
  'member-pages-worker/src/liff-identity-foundation.js',
  'member-pages-worker/src/liff-lovable-design.js',
  'member-pages-worker/src/liff-member-shell.js',
  'member-pages-worker/src/liff-personal-main.js',
  'member-pages-worker/src/liff-promotion-client.js',
  'member-pages-worker/src/liff-promotion-purchase.js',
  'member-pages-worker/src/liff-renewal-card.js',
  'member-pages-worker/src/member-app-api-runtime.js',
  'member-pages-worker/src/member-personal-main.js',
  'member-pages-worker/src/model-drive-directory.js',
  'member-pages-worker/src/my-mmd-canonical-entitlement-bridge.js',
  'member-pages-worker/src/runtime-index.js',
  'member-pages-worker/test/liff-account-view.test.mjs',
  'member-pages-worker/test/liff-commerce-ui.test.mjs',
  'member-pages-worker/test/liff-identity-foundation.test.mjs',
  'member-pages-worker/test/liff-member-compact-v4.test.mjs',
  'member-pages-worker/test/liff-member-shell.test.mjs',
  'member-pages-worker/test/liff-personal-main.test.mjs',
  'member-pages-worker/test/liff-promotion-purchase.test.mjs',
  'member-pages-worker/test/liff-quick-membership.test.mjs',
  'member-pages-worker/test/liff-renewal-card.test.mjs',
  'member-pages-worker/test/member-app-api.runtime.test.mjs',
  'member-pages-worker/test/member-personal-main.test.mjs',
  'member-pages-worker/test/model-drive-directory.test.mjs',
  'member-pages-worker/test/my-mmd-canonical-profile-presentation.test.mjs',
  'member-pages-worker/wrangler.toml',
  'package.json',
  'shared/mms-chat-policy.mjs',
  'shared/model-decline-options.mjs',
  'shared/model-decline-options.test.mjs',
  'shared/model-travel-client-source.mjs',
  'shared/model-travel-client.mjs',
  'shared/model-travel-client.test.mjs',
  'shared/personal-main-catalog.mjs',
  'shared/private-model-work-capabilities.mjs',
].sort();
export const CODE_ONLY_STARTUP_PATHS = [
  'member-pages-worker/src/liff-member-shell.js',
  'member-pages-worker/test/liff-member-shell.test.mjs',
];
// Exact #2529 test-only bridge. No wildcard dependency/config exclusion.
export const CODE_ONLY_STARTUP_BRIDGE_BLOBS = {
  'package.json': ['1754df992f1ed4c554c2af6142773fe3900d01cf', '8cfde2e341c8ac76233b6016a369d257f4da8981'],
  'shared/model-travel-client.test.mjs': ['33451c30e74975ad98ad2ab64dbf8094a0a5d82f', '7604afd2fa32a4fd53fcc5937a0ce236bd204988'],
  'shared/public-session-extension-integration-contract.test.mjs': ['5faf2549728070ef893ac5f7a90276a8f7638cd1', '5e8ff576addf8d5d603777be857dbdd6029aade2'],
};
export const CODE_ONLY_GRAPHICS_PATHS = [
  'member-pages-worker/src/liff-customer-graphics.js',
  'member-pages-worker/src/liff-customer-progress.js',
  'member-pages-worker/src/liff-member-shell.js',
  'member-pages-worker/test/liff-member-shell.test.mjs',
].sort();
// These are the only source roots permitted by the bundle input-map guard.
// Root dependency/build controls are also immutable across the non-bundle bridge.
export const CODE_ONLY_RUNTIME_BOUNDARIES = [
  'member-pages-worker', 'shared', 'auth-worker',
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml',
  'yarn.lock', 'bun.lock', 'bun.lockb', '.npmrc',
  'wrangler.toml', 'wrangler.json', 'wrangler.jsonc', 'tsconfig.json', 'jsconfig.json',
];
// Preserve the previously reviewed source boundary, then add only the V4 delta.
export const CODE_ONLY_INCLUDED_PULL_REQUESTS = [
  { number: 2522, merge_sha: '5e89a7386aa1e41d80ce3e945201b96b352ae799' },
  { number: 2523, merge_sha: '151d21eabd988396eef36b944c931b23e51cea69' },
  { number: 2537, merge_sha: CODE_ONLY_GRAPHICS_SOURCE_SHA },
  { number: 2544, merge_sha: CODE_ONLY_SOURCE_SHA },
];
export const CODE_ONLY_MY_MMD_INCLUDED_PULL_REQUESTS = [
  ...CODE_ONLY_INCLUDED_PULL_REQUESTS,
  { number: 2617, merge_sha: '8f6d736826f0ccccda53aee6ac600bdd332560c9' },
  { number: 2618, merge_sha: '875f86e9c88dc99bf9fafd3d2661b13a9e31b6d9' },
  { number: 2642, merge_sha: '0a3b400362467ae111e35bde0f1cd722b85304a2' },
  { number: 2650, merge_sha: '865d5a4b0f0fe441a3a8913e5c813e862b93abac' },
  { number: 2652, merge_sha: CODE_ONLY_MY_MMD_SOURCE_SHA },
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
  assert.equal(sha, CODE_ONLY_SOURCE_SHA, 'only the exact reviewed Graphics V4 startup source may be bundled');
  for (const ancestor of [CODE_ONLY_BASE_SHA, CODE_ONLY_GRAPHICS_BASE_SHA, CODE_ONLY_STARTUP_BASE_SHA, ...CODE_ONLY_INCLUDED_PULL_REQUESTS.map(pr => pr.merge_sha)]) {
    assert.equal(isAncestor(ancestor, sha), true, 'reviewed release commit missing from source history');
  }
}

export function validateMyMmdSourceHistory(sha, isAncestor) {
  assert.equal(sha, CODE_ONLY_MY_MMD_SOURCE_SHA, 'only the exact reviewed MY MMD source may be bundled');
  for (const ancestor of [CODE_ONLY_BASE_SHA, CODE_ONLY_GRAPHICS_BASE_SHA, CODE_ONLY_STARTUP_BASE_SHA,
    ...CODE_ONLY_MY_MMD_INCLUDED_PULL_REQUESTS.map(pr => pr.merge_sha)]) {
    assert.equal(isAncestor(ancestor, sha), true, 'reviewed MY MMD release commit missing from source history');
  }
}

export function validatePostStartupSourcePaths(paths) {
  assert.deepEqual([...paths].sort(), CODE_ONLY_POST_STARTUP_PATHS,
    'post-startup source delta differs from reviewed runtime and test paths');
  return [...CODE_ONLY_POST_STARTUP_PATHS];
}

export function validateGraphicsSourcePaths(paths) {
  assert.deepEqual([...paths].sort(), CODE_ONLY_GRAPHICS_PATHS,
    'Graphics V4 delta must contain exactly the four reviewed files');
  return [...CODE_ONLY_GRAPHICS_PATHS];
}

export function validateStartupBridge(paths, readBlob) {
  assert.deepEqual([...paths].sort(), Object.keys(CODE_ONLY_STARTUP_BRIDGE_BLOBS).sort(), 'unexpected startup bridge paths');
  for (const [path, [before, after]] of Object.entries(CODE_ONLY_STARTUP_BRIDGE_BLOBS)) {
    assert.equal(readBlob(CODE_ONLY_GRAPHICS_SOURCE_SHA, path), before, 'startup bridge base blob drift');
    assert.equal(readBlob(CODE_ONLY_STARTUP_BASE_SHA, path), after, 'startup bridge reviewed blob drift');
  }
}

// Release tooling may advance on main; the deployed application source cannot.
export function inspectCodeOnlyCheckouts(releaseSha, sourceDirectory, {
  releaseDirectory = process.cwd(),
  targetSourceSha = CODE_ONLY_SOURCE_SHA,
  baselineSourceSha,
  diagnostic = () => {},
  git = (cwd, ...args) => execFileSync('git', args, {
    cwd, encoding:'utf8', stdio:['ignore','pipe','ignore'],
  }).trim(),
} = {}) {
  diagnostic('SOURCE_CHECKOUT');
  assert.match(releaseSha || '', /^[a-f0-9]{40}$/);
  assert.ok(sourceDirectory, 'separate pinned source checkout required');
  assert.notEqual(resolve(sourceDirectory), resolve(releaseDirectory), 'source must be separate from release tooling');
  assert.ok([CODE_ONLY_SOURCE_SHA, CODE_ONLY_MY_MMD_SOURCE_SHA].includes(targetSourceSha), 'unreviewed source pin');
  for (const [directory, expected] of [[releaseDirectory, releaseSha], [sourceDirectory, targetSourceSha]]) {
    assert.equal(resolve(git(directory, 'rev-parse', '--show-toplevel')), resolve(directory), 'checkout root mismatch');
    assert.equal(git(directory, 'rev-parse', 'HEAD'), expected, 'checkout SHA mismatch');
    assert.equal(git(directory, 'status', '--porcelain', '--untracked-files=all', '--ignored'), '', 'dirty checkout');
  }
  const sourceSha = git(sourceDirectory, 'rev-parse', 'HEAD');
  diagnostic('SOURCE_HISTORY');
  const isAncestor = (ancestor, target) => {
    git(sourceDirectory, 'merge-base', '--is-ancestor', ancestor, target);
    return true;
  };
  if (targetSourceSha === CODE_ONLY_MY_MMD_SOURCE_SHA) validateMyMmdSourceHistory(sourceSha, isAncestor);
  else validateCodeOnlySourceHistory(sourceSha, isAncestor);
  git(releaseDirectory, 'merge-base', '--is-ancestor', sourceSha, releaseSha);
  if (targetSourceSha === CODE_ONLY_MY_MMD_SOURCE_SHA && baselineSourceSha) {
    assert.match(baselineSourceSha, /^[a-f0-9]{40}$/, 'active source annotation missing');
    git(sourceDirectory, 'merge-base', '--is-ancestor', baselineSourceSha, sourceSha);
  }
  // First retain the complete original #2522/#2523 review boundary.
  diagnostic('SOURCE_BASE_SCOPE');
  const previousScope = validateCodeOnlySourcePaths(
    git(sourceDirectory, 'diff', '--name-only', CODE_ONLY_BASE_SHA, CODE_ONLY_PREVIOUS_SOURCE_SHA).split('\n').filter(Boolean),
    {sha:CODE_ONLY_PREVIOUS_SOURCE_SHA, readBlob:(reference, path)=>git(sourceDirectory, 'rev-parse', reference+':'+path)});
  // Other Workers, presentation assets and release tooling advanced in main.
  // They are not accepted as runtime changes: prove the entire permitted input
  // trees and dependency/config controls stayed identical before V4 was added.
  diagnostic('SOURCE_RUNTIME_BRIDGE');
  git(sourceDirectory, 'merge-base', '--is-ancestor', CODE_ONLY_PREVIOUS_SOURCE_SHA, CODE_ONLY_GRAPHICS_BASE_SHA);
  assert.equal(git(sourceDirectory, 'diff', CODE_ONLY_PREVIOUS_SOURCE_SHA, CODE_ONLY_GRAPHICS_BASE_SHA,
    '--', ...CODE_ONLY_RUNTIME_BOUNDARIES), '', 'runtime dependency/config drift before Graphics V4');
  diagnostic('SOURCE_GRAPHICS_SCOPE');
  const graphicsPaths = validateGraphicsSourcePaths(
    git(sourceDirectory, 'diff', '--name-only', CODE_ONLY_GRAPHICS_BASE_SHA, CODE_ONLY_GRAPHICS_SOURCE_SHA).split('\n').filter(Boolean));
  diagnostic('SOURCE_STARTUP_BRIDGE');
  git(sourceDirectory, 'merge-base', '--is-ancestor', CODE_ONLY_GRAPHICS_SOURCE_SHA, CODE_ONLY_STARTUP_BASE_SHA);
  const bridgePaths = git(sourceDirectory, 'diff', '--name-only', CODE_ONLY_GRAPHICS_SOURCE_SHA,
    CODE_ONLY_STARTUP_BASE_SHA, '--', ...CODE_ONLY_RUNTIME_BOUNDARIES).split('\n').filter(Boolean);
  validateStartupBridge(bridgePaths, (reference, path) => git(sourceDirectory, 'rev-parse', reference+':'+path));
  diagnostic('SOURCE_STARTUP_SCOPE');
  const startupPaths = git(sourceDirectory, 'diff', '--name-only', CODE_ONLY_STARTUP_BASE_SHA,
    CODE_ONLY_SOURCE_SHA).split('\n').filter(Boolean);
  assert.deepEqual([...startupPaths].sort(), CODE_ONLY_STARTUP_PATHS, 'startup delta must contain exactly the two reviewed files');
  let postStartupPaths = [];
  if (targetSourceSha === CODE_ONLY_MY_MMD_SOURCE_SHA) {
    diagnostic('SOURCE_POST_STARTUP_SCOPE');
    postStartupPaths = validatePostStartupSourcePaths(
      git(sourceDirectory, 'diff', '--name-only', CODE_ONLY_SOURCE_SHA, sourceSha,
        '--', ...CODE_ONLY_RUNTIME_BOUNDARIES).split('\n').filter(Boolean));
    assert.equal(git(sourceDirectory, 'rev-parse', sourceSha + ':member-pages-worker/wrangler.toml'),
      CODE_ONLY_SOURCE_CONFIG_BLOB, 'pinned Worker config blob drift');
    diagnostic('SOURCE_MAIN_PARITY');
    assert.equal(git(releaseDirectory, 'diff', '--name-only', sourceSha, releaseSha,
      '--', ...CODE_ONLY_RUNTIME_BOUNDARIES), '', 'release main changed Worker runtime or dependency controls');
  }
  const sourceScope = {...previousScope,
    included_paths:[...new Set([...previousScope.included_paths, ...graphicsPaths, ...postStartupPaths])].sort(),
    graphics_delta:{base_sha:CODE_ONLY_GRAPHICS_BASE_SHA, source_sha:CODE_ONLY_GRAPHICS_SOURCE_SHA, paths:graphicsPaths},
    startup_delta:{base_sha:CODE_ONLY_STARTUP_BASE_SHA, paths:startupPaths},
    ...(targetSourceSha === CODE_ONLY_MY_MMD_SOURCE_SHA ? {post_startup_delta:{base_sha:CODE_ONLY_SOURCE_SHA,
      source_sha:sourceSha, paths:postStartupPaths}} : {}),
    exact_test_only_bridge:{from:CODE_ONLY_GRAPHICS_SOURCE_SHA, to:CODE_ONLY_STARTUP_BASE_SHA, paths:bridgePaths},
    unchanged_runtime_bridge:{from:CODE_ONLY_PREVIOUS_SOURCE_SHA, to:CODE_ONLY_GRAPHICS_BASE_SHA}};
  diagnostic('SOURCE_CONFIG');
  if (targetSourceSha === CODE_ONLY_MY_MMD_SOURCE_SHA) {
    assert.equal(git(sourceDirectory, 'diff', '--name-only', CODE_ONLY_SOURCE_SHA, sourceSha,
      '--', 'member-pages-worker/wrangler.toml').trim(), 'member-pages-worker/wrangler.toml',
      'unexpected Worker config scope');
  } else {
    assert.equal(git(sourceDirectory, 'diff', CODE_ONLY_BASE_SHA, sourceSha, '--', 'member-pages-worker/wrangler.toml'), '',
      'Worker config/migrations changed; separate release review required');
  }
  return { method:'separate-pinned-source-checkout', source_sha:sourceSha, release_sha:releaseSha,
    config_unchanged:targetSourceSha === CODE_ONLY_SOURCE_SHA, comparison_base_sha:CODE_ONLY_BASE_SHA,
    included_pull_requests:targetSourceSha === CODE_ONLY_MY_MMD_SOURCE_SHA
      ? CODE_ONLY_MY_MMD_INCLUDED_PULL_REQUESTS : CODE_ONLY_INCLUDED_PULL_REQUESTS, source_scope:sourceScope };
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
      || new RegExp(`^${VERSION_ROOT}/${id}\\?include=modules$`, 'i').test(path)
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
  const diagnostics = createSafePreflightDiagnostics();
  const state = { phase: 'preflight', worker: 'member-pages-worker', source_sha: io.sha, release_sha:io.releaseSha };
  const save = phase => { state.phase = phase; io.save({ ...state }); };
  try {
    await io.approve(diagnostics.mark);
    diagnostics.mark('RELEASE_SOURCE_PIN');
    const artifactMode=io.mode==='companion-artifact';
    assert.ok(io.mode===undefined || artifactMode,'unsupported release mode');
    assert.equal(io.sha, artifactMode ? COMPANION_DELTA_SOURCE_SHA : CODE_ONLY_MY_MMD_SOURCE_SHA, 'release source must be the exact reviewed merge');
    if(artifactMode){
      assert.equal(io.expectedVersion,COMPANION_BASE_VERSION);
      assert.equal(io.expectedDeployment,COMPANION_BASE_DEPLOYMENT);
    }
    assert.match(io.releaseSha || '', /^[a-f0-9]{40}$/);
    const call = (suffix, init) => io.call(ROOT + suffix, init);
    diagnostics.mark('CF_DEPLOYMENT_READ');
    const deployment = (await call('/deployments'))?.deployments?.[0];
    diagnostics.mark('CF_BASELINE_CHECK');
    const current = activeVersion(deployment);
    assert.equal(current, io.expectedVersion, 'active version differs from approved preflight');
    assert.equal(deployment.id, io.expectedDeployment, 'active deployment differs from approved preflight');
    diagnostics.mark('CF_VERSION_READ');
    const baseline = await call('/versions/' + current);
    assert.equal(baseline.id, current, 'active version readback mismatch');
    diagnostics.mark('CF_BASELINE_SOURCE_READ');
    const baselineAnnotation = await io.call(VERSION_ROOT + '/' + current);
    assert.equal(baselineAnnotation?.id, current, 'active version annotation identity mismatch');
    const baselineSourceSha = versionAnnotations(baselineAnnotation)?.['workers/commit_sha'];
    diagnostics.mark('CF_BASELINE_SOURCE_CHECK');
    let artifactBaseline;
    if(artifactMode){
      artifactBaseline=decodeBaselineModule(await io.call(VERSION_ROOT+'/'+current+'?include=modules'));
      state.baseline_artifact_sha256=ACTIVE_ARTIFACT_SHA256;
      state.delta_source_sha=io.sha;
    }else{
      assert.match(baselineSourceSha || '', /^[a-f0-9]{40}$/, 'active source provenance missing');
      state.baseline_source_sha = baselineSourceSha;
    }
    diagnostics.mark('CF_CONFIG_CHECK');
    const config = versionConfiguration(baseline);
    const metadata = uploadMetadata(baseline, io.sha);
    if(artifactMode) metadata.annotations['workers/message']=`member-pages artifact-delta base=${COMPANION_BASE_VERSION} delta-sha=${io.sha} bundle-sha256=${COMPANION_CANDIDATE_SHA256}`;
    state.configuration_digest = digest(config);
    diagnostics.mark('CF_SETTINGS_READ');
    state.settings_digest = digest(await call('/script-settings'));
    const boundary = async () => ({
      routes: ordered(await io.call(`/zones/${ZONE}/workers/routes`)),
      schedules: ordered((await call('/schedules'))?.schedules || []),
      subdomain: await call('/subdomain'),
    });
    diagnostics.mark('CF_BOUNDARY_READ');
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
    diagnostics.mark('CF_LATEST_CHECK');
    assert.equal((await call('/versions'))?.items?.[0]?.id, current, 'latest version is not the active version');
    diagnostics.mark('CF_BASELINE_RECHECK');
    await unchanged(deployment, current);
    state.baseline_version = current;
    state.baseline_deployment = deployment.id;
    state.source_evidence = await io.sourceCheck(diagnostics.mark, baselineSourceSha);
    diagnostics.mark('BUNDLE_BUILD');
    const module = artifactMode ? buildReviewedCompanionArtifact(artifactBaseline) : await io.bundle(baseline);
    diagnostics.mark('BUNDLE_CHECK');
    assert.ok(module instanceof Uint8Array && module.byteLength > 0, 'compiled Worker module required');
    state.bundle_sha256 = createHash('sha256').update(module).digest('hex');
    await io.approve(diagnostics.mark);
    diagnostics.mark('CF_BASELINE_RECHECK');
    await unchanged(deployment, current);

    const form = new FormData();
    form.set('metadata', JSON.stringify(metadata));
    form.set('worker.js', new Blob([module], { type: 'application/javascript+module' }), 'worker.js');
    save('upload-attempted-outcome-unknown');
    diagnostics.mark('UPLOAD_REQUEST');
    const uploaded = await call('/versions?bindings_inherit=strict', { method: 'POST', body: form });
    diagnostics.mark('UPLOAD_ID_CHECK');
    assert.ok(UUID.test(uploaded?.id || '') && uploaded.id !== current, 'ambiguous uploaded version; stop');
    state.uploaded_version = uploaded.id;
    save('uploaded-not-promoted');
    diagnostics.mark('UPLOADED_VERSION_READ');
    const exact = await call('/versions/' + uploaded.id);
    diagnostics.mark('UPLOADED_ID_CHECK');
    assert.equal(exact.id, uploaded.id, 'uploaded version identity mismatch');
    diagnostics.mark('UPLOADED_CONFIG_CHECK');
    same(versionConfiguration(exact), config, 'Worker configuration changed during code-only upload');
    diagnostics.mark('UPLOADED_ANNOTATION_READ');
    const annotationReadback = await io.call(VERSION_ROOT + '/' + uploaded.id);
    diagnostics.mark('UPLOADED_ANNOTATION_ID_CHECK');
    assert.equal(annotationReadback?.id, uploaded.id, 'uploaded version annotation identity mismatch');
    diagnostics.mark('UPLOADED_ANNOTATION_CHECK');
    const exactAnnotations = versionAnnotations(annotationReadback);
    assert.equal(exactAnnotations?.['workers/commit_sha'], metadata.annotations['workers/commit_sha'], 'source SHA annotation mismatch');
    assert.equal(exactAnnotations?.['workers/message'], metadata.annotations['workers/message'], 'source message annotation mismatch');
    if(artifactMode){
      const artifact=await io.call(VERSION_ROOT+'/'+uploaded.id+'?include=modules');
      assert.equal(artifact?.id,uploaded.id,'uploaded artifact identity mismatch');
      assert.equal(artifact.modules?.length,1,'uploaded artifact module scope mismatch');
      assert.equal(artifact.modules[0].name,artifact.main_module,'uploaded main module mismatch');
      assert.equal(createHash('sha256').update(Buffer.from(artifact.modules[0].content_base64 || '', 'base64')).digest('hex'),
        COMPANION_CANDIDATE_SHA256,'uploaded candidate bytes mismatch');
    }

    diagnostics.mark('UPLOADED_LATEST_READ');
    const versions = (await call('/versions'))?.items;
    diagnostics.mark('UPLOADED_LATEST_CHECK');
    assert.equal(versions?.[0]?.id, uploaded.id, 'uploaded version is not latest');
    diagnostics.mark('UPLOADED_PREDECESSOR_CHECK');
    assert.equal(versions?.[1]?.id, current, 'active predecessor changed');
    diagnostics.mark('OWNER_PROMOTION_APPROVAL');
    await io.approve(diagnostics.mark);
    diagnostics.mark('PROMOTION_BASELINE_CHECK');
    await unchanged(deployment, uploaded.id);

    save('promotion-attempted-outcome-unknown');
    diagnostics.mark('PROMOTION_REQUEST');
    const promoted = await call('/deployments', { method: 'POST', body: JSON.stringify({
      strategy: 'percentage', versions: [{ version_id: uploaded.id, percentage: 100 }],
    }) });
    diagnostics.mark('PROMOTION_ID_CHECK');
    assert.ok(UUID.test(promoted?.id || '') && promoted.id !== deployment.id, 'ambiguous promotion; stop');
    state.deployment = promoted.id;
    diagnostics.mark('PROMOTION_RECEIPT_READ');
    const receipt = await call('/deployments/' + promoted.id);
    diagnostics.mark('PROMOTION_RECEIPT_CHECK');
    assert.equal(receipt.id, promoted.id);
    assert.equal(activeVersion(receipt), uploaded.id);
    diagnostics.mark('POST_PROMOTION_BASELINE_CHECK');
    await unchanged(receipt, uploaded.id);
    diagnostics.mark('POST_PROMOTION_CONFIG_READ');
    const promotedVersion = await call('/versions/' + uploaded.id);
    diagnostics.mark('POST_PROMOTION_CONFIG_CHECK');
    same(versionConfiguration(promotedVersion), config, 'post-promotion configuration changed');
    save('complete');
    return { ...state, phase: 'complete' };
  } catch (error) {
    state.stopped_after = state.phase;
    state.diagnostic = diagnostics.snapshot();
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
  for (const required of ['member-pages-worker/src/runtime-index.js',
    'member-pages-worker/src/liff-customer-graphics.js', 'member-pages-worker/src/liff-customer-progress.js']) {
    assert.ok(inputs.includes(required), 'missing required Graphics V4 bundle input');
  }
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

export function inspectCompanionReleaseCheckout(releaseSha, directory=process.cwd()) {
  const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  assert.match(releaseSha || '',/^[a-f0-9]{40}$/);
  assert.equal(resolve(git('rev-parse','--show-toplevel')),resolve(directory),'checkout root mismatch');
  assert.equal(git('rev-parse','HEAD'),releaseSha,'release checkout SHA drift');
  assert.equal(git('status','--porcelain','--untracked-files=all','--ignored'),'','dirty release checkout');
  git('merge-base','--is-ancestor',COMPANION_DELTA_SOURCE_SHA,releaseSha);
  const paths=git('diff','--name-only',COMPANION_DELTA_BASE_SHA,COMPANION_DELTA_SOURCE_SHA).split('\n').filter(Boolean);
  validateCompanionDelta(paths,(sha,path)=>git('rev-parse',sha+':'+path));
  return {method:'verified-active-artifact-delta',delta_source_sha:COMPANION_DELTA_SOURCE_SHA,
    baseline_artifact_sha256:ACTIVE_ARTIFACT_SHA256,candidate_sha256:COMPANION_CANDIDATE_SHA256};
}

async function main() {
  assert.equal(process.argv[2], '--execute-approved', 'explicit approved execution flag required');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true', 'Owner approval input required');
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT, 'wrong Cloudflare account');
  const releaseSha = process.env.GITHUB_SHA;
  const sourceDirectory = process.env.SOURCE_DIRECTORY;
  const artifactMode=process.env.RELEASE_MODE==='companion-artifact';
  assert.ok(process.env.RELEASE_MODE===undefined || ['release','companion-artifact'].includes(process.env.RELEASE_MODE),'unsupported release mode');
  const approve = async diagnostic => {
    await verifyOwnerApproval(process.env, fetch, {diagnostic});
    if(artifactMode) inspectCompanionReleaseCheckout(releaseSha);
    else inspectCodeOnlyCheckouts(releaseSha, sourceDirectory,
      {diagnostic, targetSourceSha:CODE_ONLY_MY_MMD_SOURCE_SHA});
  };
  const dir = mkdtempSync(join(tmpdir(),'mmd-member-pages-code-only-'));
  const journal = resolve(process.env.RUNNER_TEMP || dir,'member-pages-code-only-receipt.json');
  await releaseMemberPagesCodeOnly({
    sha:artifactMode ? COMPANION_DELTA_SOURCE_SHA : CODE_ONLY_MY_MMD_SOURCE_SHA,
    ...(artifactMode ? {mode:'companion-artifact'} : {}),
    releaseSha,
    expectedVersion: process.env.EXPECTED_VERSION,
    expectedDeployment: process.env.EXPECTED_DEPLOYMENT,
    approve,
    call: createTransport(process.env.CLOUDFLARE_API_TOKEN),
    sourceCheck: async (diagnostic, baselineSourceSha) => artifactMode ? inspectCompanionReleaseCheckout(releaseSha) : inspectCodeOnlyCheckouts(releaseSha, sourceDirectory,
      {diagnostic, targetSourceSha:CODE_ONLY_MY_MMD_SOURCE_SHA, baselineSourceSha}),
    bundle: async () => buildMemberPagesBundle(dir, sourceDirectory),
    save: value => writeFileSync(journal,JSON.stringify(value,null,2),{mode:0o600}),
  });
  console.log('Member Pages code-only release readback complete; no business-write smoke was run.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Code-only release stopped. Inspect its sanitized receipt; never retry automatically.'); process.exitCode = 1; });
}
