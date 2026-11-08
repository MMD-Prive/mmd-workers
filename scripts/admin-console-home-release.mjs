// Guarded Console-home release. Importing this module performs no I/O.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { releaseCurrentSession, createTransport, uploadMetadata, validateSourceState, ROOT } from './admin-current-session-code-only.mjs';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';
import { BASELINE_VERSION, BASELINE_DEPLOYMENT, BASELINE_SOURCE, SOURCE_PARENT, LIVE_SHA256,
  SOURCE_HASHES, RUNTIME_PATHS, digest, validateSources, validateBaseline, patchConsoleHome } from './admin-console-home-overlay.mjs';
import { testConsoleHomeCandidate } from './admin-console-home-candidate-test.mjs';

const HOME = '/internal/admin/console';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

export async function readLiveModule(token, request = fetch) {
  try {
    assert.ok(typeof token === 'string' && token.length <= 4096 && /^[A-Za-z0-9._~+/-]+=*$/.test(token));
    const response = await request('https://api.cloudflare.com/client/v4' + ROOT + '/content/v2', {
      method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /multipart\/form-data/i);
    const entries = [...(await response.formData()).entries()];
    assert.equal(entries.length, 1);
    assert.equal(entries[0][0], 'worker.js');
    const file = entries[0][1];
    assert.ok(file && typeof file === 'object' && file.name === 'worker.js'
      && file.size > 0 && file.size < 20 * 1024 * 1024);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const code = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.equal(digest(new TextEncoder().encode(code)), digest(bytes));
    return code;
  } catch { throw new Error('Console-home live module read failed; stop without retry.'); }
}

export function buildEvidence(code, preservation, releaseId) {
  assert.match(releaseId || '', /^\d+\.\d+$/);
  assert.equal(process.version, 'v22.23.4', 'reviewed Node runtime required');
  assert.ok(code instanceof Uint8Array && code.byteLength > 0);
  assert.equal(preservation?.baseline_sha256, LIVE_SHA256);
  assert.equal(preservation?.candidate_sha256, digest(code));
  assert.equal(preservation?.unrelated_runtime_bytes_unchanged, true);
  assert.equal(preservation?.reverse_patch_equals_baseline, true);
  assert.deepEqual(preservation?.runtime_paths, [...RUNTIME_PATHS]);
  assert.deepEqual(preservation?.source_hashes, SOURCE_HASHES);
  const modules = [{ name: 'worker.js', bytes: code.byteLength, digest: { algorithm: 'sha256', value: digest(code) } }];
  return { release_id: releaseId,
    toolchain: { node: process.version, transformation: 'exact-live-byte-console-home-overlay' },
    reviewed_source_hashes: SOURCE_HASHES,
    lockfile: { path: 'package-lock.json', digest: { algorithm: 'sha256', value: digest(readFileSync('package-lock.json')) } },
    artifact: { digest: modules[0].digest, modules,
      module_manifest_digest: { algorithm: 'sha256', value: digest(JSON.stringify(modules)) } },
    preservation, verification: { delivered_artifact_contracts: 'passed', business_requests: 'mocked-only' } };
}

// Public checks use no credentials, cookies, login POSTs or business APIs.
export async function verifyPublicConsoleHome(request = fetch) {
  try {
    const results = [];
    for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
      const origin = 'https://' + host;
      const get = (path, method = 'GET') => request(origin + path, {
        method, redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' },
      });
      const gates = [];
      for (const path of ['/internal/admin', HOME]) {
        const response = await get(path);
        assert.equal(response.status, 303, 'signed-out gate must remain active');
        const location = new URL(response.headers.get('location'), origin);
        assert.equal(location.origin, origin);
        assert.equal(location.pathname, '/internal/admin/login');
        assert.equal(location.searchParams.get('next'), path);
        assert.equal(await response.text(), '', 'signed-out gate must not return a document');
        const head = await get(path, 'HEAD');
        assert.equal(head.status, 401);
        assert.equal(await head.text(), '');
        gates.push({ path, get: response.status, head: head.status, login_return_preserved: true });
      }
      const login = await get('/internal/admin/login');
      assert.equal(login.status, 200);
      assert.match(login.headers.get('content-type') || '', /text\/html/i);
      const html = await login.text();
      const inputs = [...html.matchAll(/<input\b[^>]*>/gi)].map(match => match[0])
        .filter(tag => /\bname=["']next["']/i.test(tag));
      assert.equal(inputs.length, 1, 'one default next input required');
      assert.match(inputs[0], /\btype=["']hidden["']/i);
      assert.match(inputs[0], /\bvalue=["']\/internal\/admin\/console["']/);
      results.push({ host, gates, login: { get: login.status, default_next: HOME } });
    }
    return results;
  } catch { throw new Error('Console-home public acceptance failed; inspect the receipt without retrying the release.'); }
}

async function main() {
  assert.equal(process.argv[2], '--execute-approved');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true');
  assert.equal(process.env.PRODUCTION_ENVIRONMENT_NAME, 'mmd-production-mutation');
  assert.equal(process.env.GITHUB_REPOSITORY, 'MMD-Prive/mmd-workers');
  assert.equal(process.env.EXPECTED_VERSION, BASELINE_VERSION);
  assert.equal(process.env.EXPECTED_DEPLOYMENT, BASELINE_DEPLOYMENT);
  assert.equal(process.version, 'v22.23.4');
  assert.ok(process.env.RUNNER_TEMP);
  const sha = process.env.GITHUB_SHA;
  assert.match(sha || '', /^[a-f0-9]{40}$/);
  const releaseId = `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT}`;
  assert.match(releaseId, /^\d+\.\d+$/);
  const state = { scope: 'admin-console-home-only', phase: 'preflight', source_sha: sha, release_id: releaseId,
    source_parent_sha: SOURCE_PARENT, baseline_source_sha: BASELINE_SOURCE,
    baseline_version: BASELINE_VERSION, baseline_deployment: BASELINE_DEPLOYMENT,
    baseline_module_sha256: LIVE_SHA256, runtime_paths: [...RUNTIME_PATHS] };
  const save = phase => {
    state.phase = phase;
    state.recorded_at = new Date().toISOString();
    writeFileSync(join(process.env.RUNNER_TEMP, 'admin-console-home-receipt.json'), JSON.stringify(state, null, 2), { mode: 0o600 });
  };
  let failureStage = 'protected_source_validation', sourceState, preservation;
  const approve = async () => {
    await verifyProductionApproval(process.env);
    assert.equal((await inspectEnvironment(process.env)).ready, true, 'protected main-only environment required');
    const response = await fetch('https://api.github.com/repos/MMD-Prive/mmd-workers/git/ref/heads/main', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' },
    });
    assert.equal(response.status, 200, 'current main read required');
    assert.equal((await response.json()).object?.sha, sha, 'approved SHA is no longer current main');
    sourceState = validateSourceState({ expectedSha: sha, headSha: git('rev-parse', 'HEAD'),
      dirtyStatus: git('status', '--porcelain=v1', '--untracked-files=all') });
    git('merge-base', '--is-ancestor', SOURCE_PARENT, sha);
    assert.equal(RUNTIME_PATHS.length, 4);
    assert.deepEqual(Object.keys(SOURCE_HASHES).sort(), [...RUNTIME_PATHS].sort());
    validateSources();
  };
  try {
    save('preflight');
    const call = createTransport(process.env.CLOUDFLARE_API_TOKEN);
    failureStage = 'code_release';
    const released = await releaseCurrentSession({ sha, approve,
      expectedVersion: BASELINE_VERSION, expectedDeployment: BASELINE_DEPLOYMENT, call,
      sourceCheck: async (version, deployment) => {
        validateBaseline(version, deployment);
        return { ...sourceState, method: 'exact-live-byte-console-home-overlay',
          baseline_source_sha: BASELINE_SOURCE, source_parent_sha: SOURCE_PARENT,
          runtime_source_sha: sha, runtime_paths: [...RUNTIME_PATHS], reviewed_source_hashes: SOURCE_HASHES,
          configuration_diff: false };
      },
      metadataFactory: (version, sourceSha) => {
        const metadata = uploadMetadata(version, sourceSha);
        metadata.annotations['workers/message'] = `Console home only; baseline=${BASELINE_VERSION} release=${sourceSha}`;
        return metadata;
      },
      bundle: async () => {
        const live = await readLiveModule(process.env.CLOUDFLARE_API_TOKEN);
        assert.equal(digest(live), LIVE_SHA256, 'live baseline module drift');
        const patched = patchConsoleHome(live);
        testConsoleHomeCandidate(patched.code); // Credentials stripped; network blocked; actual candidate, fixture data only.
        preservation = patched.preservation;
        return new TextEncoder().encode(patched.code);
      },
      buildEvidence: code => buildEvidence(code, preservation, releaseId),
      now: () => new Date().toISOString(),
      save: receipt => { state.code = receipt; save('code:' + receipt.phase); },
    });
    assert.equal(released.phase, 'complete');
    const expected = { id: released.deployment, strategy: 'percentage',
      versions: [{ version_id: released.uploaded_version, percentage: 100 }] };
    const verifyActive = async () => {
      const active = (await call(ROOT + '/deployments')).deployments?.[0];
      assert.deepEqual({ id: active?.id, strategy: active?.strategy, versions: active?.versions }, expected,
        'deployment drift during final acceptance');
      assert.equal((await call(ROOT + '/versions')).items?.[0]?.id, released.uploaded_version,
        'latest upload drift during final acceptance');
    };
    failureStage = 'live_artifact_readback';
    save('live-artifact-readback-pending');
    await verifyActive();
    const observed = digest(await readLiveModule(process.env.CLOUDFLARE_API_TOKEN));
    assert.equal(observed, preservation.candidate_sha256, 'delivered artifact digest mismatch');
    state.live_artifact_readback = { sha256: observed, version_id: released.uploaded_version,
      deployment_id: released.deployment, checked_at: new Date().toISOString() };
    failureStage = 'public_acceptance';
    save('public-acceptance-pending');
    state.public_acceptance = await verifyPublicConsoleHome();
    failureStage = 'final_active_readback';
    await verifyActive();
    state.final_active_readback = { ...expected, checked_at: new Date().toISOString() };
    save('complete');
    console.log('Console home verified: exact delivered artifact, default login destination and signed-out gates.');
    console.log(JSON.stringify({ version: released.uploaded_version, deployment: released.deployment,
      source_sha: sha, console: 'https://www.mmdbkk.com/internal/admin/console' }));
  } catch {
    state.stopped_after = state.phase;
    state.failure_stage = failureStage;
    try { save('stopped-no-automatic-retry'); } catch { /* Preserve the last successfully saved receipt. */ }
    throw new Error('Console-home release stopped; inspect the sanitized receipt before any recovery.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Console-home release stopped. Inspect the sanitized receipt; do not retry an uncertain upload or deployment.');
    process.exitCode = 1;
  });
}
