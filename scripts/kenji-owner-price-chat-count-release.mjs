// Correct one reviewed live price-evidence expression. Never rebuild main.
// Importing/testing this module performs no network requests or production writes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  ACCOUNT, ZONE, activeVersion, createBuildEvidence, releaseCurrentSession,
  uploadMetadata, validateSourceState, versionConfiguration,
} from './admin-current-session-code-only.mjs';
import { digest, parseWranglerVersion } from './admin-held-viewer-code-only.mjs';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';

export const ROOT = `/accounts/${ACCOUNT}/workers/scripts/member-dashboard-chat-worker`;
export const FUNCTION_NAME = 'Dc';
export const BASELINE_FUNCTION_SHA256 = '7f2ec7daae6d59f5c1d479a05422fe09e84c935b52e52634359df57aa04c7295';
export const BEFORE = 'ready:l.size>=2&&d.size>=2';
export const AFTER = 'ready:d.size>=2';
const FIXTURE = new URL('../member-dashboard-chat-worker/test/fixtures/kenji-owner-price-assessment-live-20261031.txt', import.meta.url);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
// The unchanged release orchestrator uploads exactly worker.js.
export const MODULE_NAME = 'worker.js';
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
const canonical = value => JSON.stringify(sort(value));

function uniqueOffset(code, marker, reason) {
  const at = code.indexOf(marker);
  assert.ok(at >= 0 && code.indexOf(marker, at + marker.length) === -1, reason);
  return at;
}

export function validateRecoveredFunction(source) {
  assert.equal(typeof source, 'string', 'recovered function text required');
  assert.equal(digest(source), BASELINE_FUNCTION_SHA256, 'reviewed price function drift');
  uniqueOffset(source, BEFORE, 'reviewed price expression must occur once');
  assert.ok(source.startsWith(`function ${FUNCTION_NAME}(`), 'observed price function name changed');
  return source;
}

export function recoveredFunction() {
  const raw = readFileSync(FIXTURE, 'utf8');
  return validateRecoveredFunction(raw.endsWith('\n') ? raw.slice(0, -1) : raw);
}

export function priceFunctionPart(code) {
  assert.equal(typeof code, 'string', 'complete module text required');
  const source = recoveredFunction();
  const start = uniqueOffset(code, source, 'exact reviewed price function must occur once');
  return { start, end: start + source.length, text: source };
}

export function patchOwnerPriceChatCount(code, expectedModuleDigest) {
  assert.match(expectedModuleDigest || '', SHA256, 'reviewed whole-module SHA-256 required');
  assert.equal(digest(code), expectedModuleDigest, 'reviewed whole-module drift');
  const part = priceFunctionPart(code);
  const replacement = part.text.replace(BEFORE, AFTER);
  assert.equal(replacement.replace(AFTER, BEFORE), part.text, 'price-function changes exceed the reviewed expression');
  const candidate = code.slice(0, part.start) + replacement + code.slice(part.end);
  assert.equal(candidate.slice(0, part.start) + part.text + candidate.slice(part.start + replacement.length), code,
    'unrelated runtime bytes changed');
  return {
    code: candidate,
    preservation: {
      baseline_sha256: digest(code), candidate_sha256: digest(candidate),
      baseline_function_sha256: BASELINE_FUNCTION_SHA256, candidate_function_sha256: digest(replacement),
      functions: [FUNCTION_NAME], before: BEFORE, after: AFTER,
      unrelated_runtime_bytes_unchanged: true, remaining_evidence_checks_unchanged: true,
    },
  };
}

export function validateExpectedInputs(env) {
  assert.match(env.EXPECTED_VERSION || '', UUID, 'fresh active version UUID required');
  assert.match(env.EXPECTED_DEPLOYMENT || '', UUID, 'fresh active deployment UUID required');
  assert.equal(env.EXPECTED_MODULE, MODULE_NAME, 'reviewed single worker.js module required');
  assert.match(env.EXPECTED_MODULE_SHA256 || '', SHA256, 'reviewed whole-module SHA-256 required');
  assert.equal(env.EXPECTED_FUNCTION_SHA256, BASELINE_FUNCTION_SHA256, 'reviewed price function SHA-256 required');
  return { version: env.EXPECTED_VERSION, deployment: env.EXPECTED_DEPLOYMENT,
    moduleName: MODULE_NAME, moduleDigest: env.EXPECTED_MODULE_SHA256,
    functionDigest: BASELINE_FUNCTION_SHA256 };
}

export function transport(token, { allowWrites = false, request = fetch } = {}) {
  assert.ok(token, 'Cloudflare credential required');
  return async (path, { method = 'GET', body } = {}) => {
    const read = method === 'GET' && (
      new RegExp(`^${ROOT}/(deployments(?:/[a-f0-9-]{36})?|versions(?:/[a-f0-9-]{36})?|script-settings|schedules|subdomain)$`, 'i').test(path)
      || path === `/zones/${ZONE}/workers/routes`);
    const write = allowWrites && method === 'POST'
      && [ROOT + '/versions?bindings_inherit=strict', ROOT + '/deployments'].includes(path);
    assert.ok(read || write, 'outside owner-price code-only scope');
    let response;
    try {
      response = await request('https://api.cloudflare.com/client/v4' + path, {
        method, body, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`,
          ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      });
    } catch { throw new Error('Cloudflare transport failed; stop without automatic retry'); }
    const data = await response.json().catch(() => null);
    assert.ok(response.ok && data?.success === true, `Cloudflare ${method} failed (${response.status}); stop without retry`);
    return data.result;
  };
}

export async function readActiveModule(token, request = fetch) {
  assert.ok(token, 'Cloudflare credential required');
  const response = await request('https://api.cloudflare.com/client/v4' + ROOT + '/content/v2', {
    method: 'GET', headers: { Authorization: `Bearer ${token}` },
    redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, 'active module read failed');
  const parts = [...(await response.formData()).entries()];
  assert.equal(parts.length, 1, 'single-module runtime required');
  const [name, blob] = parts[0];
  assert.equal(name, MODULE_NAME, 'unexpected active module filename');
  assert.ok(typeof blob !== 'string' && blob.size > 0 && blob.size < 20 * 1024 * 1024,
    'unexpected active module shape or size');
  return { name, code: await blob.text() };
}

export async function inspectBaseline(io) {
  await io.approve();
  const get = suffix => io.call(ROOT + suffix);
  const deployment = (await get('/deployments'))?.deployments?.[0];
  const versionId = activeVersion(deployment);
  const version = await get('/versions/' + versionId);
  assert.equal(version.id, versionId, 'inspection version mismatch');
  const configurationDigest = digest(canonical(versionConfiguration(version)));
  assert.equal((await get('/versions'))?.items?.[0]?.id, versionId, 'latest upload differs from active version');
  const module = await io.readModule();
  assert.equal(module.name, MODULE_NAME, 'unexpected active module filename');
  priceFunctionPart(module.code);
  const readback = (await get('/deployments'))?.deployments?.[0];
  assert.equal(canonical(readback), canonical(deployment), 'deployment changed during inspection');
  assert.equal((await get('/versions'))?.items?.[0]?.id, versionId, 'latest upload changed during inspection');
  assert.equal(digest(canonical(versionConfiguration(await get('/versions/' + versionId)))), configurationDigest,
    'version configuration changed during inspection');
  await io.approve();
  return {
    schema: 'kenji-owner-price-chat-count-inspection.v1', production_mutation: false,
    worker: 'member-dashboard-chat-worker', source_sha: io.sha, inspected_at: io.now(),
    expected_version: versionId, expected_deployment: deployment.id,
    expected_module: module.name, expected_module_sha256: digest(module.code),
    expected_function_sha256: BASELINE_FUNCTION_SHA256, configuration_sha256: configurationDigest,
    proposed_change: { before: BEFORE, after: AFTER },
  };
}

export function overlayBuildEvidence(input) {
  const result = createBuildEvidence(input);
  result.artifact.modules[0].name = MODULE_NAME;
  result.artifact.module_manifest_digest.value = digest(canonical(result.artifact.modules));
  return result;
}

async function main() {
  recoveredFunction();
  if (process.argv[2] === '--check-source') {
    console.log('Recovered owner-price function matches the reviewed SHA-256; only the distinct-customer gate is removed.');
    return;
  }
  const mode = process.argv[2];
  assert.ok(['--inspect-approved', '--execute-approved'].includes(mode), 'explicit protected inspection or release mode required');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true', 'owner-authorized dispatch required');
  const sha = process.env.GITHUB_SHA;
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const approve = async () => {
    await verifyProductionApproval(process.env);
    assert.equal((await inspectEnvironment(process.env)).ready, true, 'protected main-only production environment required');
    validateSourceState({ expectedSha: sha, headSha: git('rev-parse', 'HEAD'),
      dirtyStatus: git('status', '--porcelain=v1', '--untracked-files=all') });
  };
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const now = () => new Date().toISOString();
  const save = (name, state) => writeFileSync(join(process.env.RUNNER_TEMP || tmpdir(), name),
    JSON.stringify(state, null, 2), { mode: 0o600 });
  if (mode === '--inspect-approved') {
    const report = await inspectBaseline({ sha, approve, now,
      call: transport(token), readModule: () => readActiveModule(token) });
    save('owner-price-chat-count-inspection.json', report);
    console.log(JSON.stringify(report));
    return;
  }
  const expected = validateExpectedInputs(process.env);
  const releaseId = `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT}`;
  const dir = mkdtempSync(join(tmpdir(), 'owner-price-chat-count-'));
  let preservation;
  const state = await releaseCurrentSession({
    root: ROOT, metadataFactory: uploadMetadata, sha, approve,
    expectedVersion: expected.version, expectedDeployment: expected.deployment,
    call: transport(token, { allowWrites: true }), now,
    sourceCheck: async version => {
      assert.equal(version.id, expected.version, 'reviewed baseline version mismatch');
      return { commit_sha: sha, dirty_tree: false, dirty_path_count: 0,
        method: 'one-expression-owner-price-chat-count-overlay', baseline_version: expected.version,
        baseline_module: expected.moduleName, baseline_module_sha256: expected.moduleDigest,
        baseline_function_sha256: expected.functionDigest };
    },
    bundle: async () => {
      const module = await readActiveModule(token);
      assert.equal(module.name, expected.moduleName, 'reviewed active module filename drift');
      const patched = patchOwnerPriceChatCount(module.code, expected.moduleDigest);
      preservation = patched.preservation;
      const syntaxFile = join(dir, 'candidate.mjs');
      writeFileSync(syntaxFile, patched.code, { mode: 0o600 });
      try { execFileSync(process.execPath, ['--check', syntaxFile], { stdio: 'ignore' }); }
      catch { throw new Error('complete candidate module syntax check failed'); }
      return new TextEncoder().encode(patched.code);
    },
    buildEvidence: code => ({ ...overlayBuildEvidence({ code, releaseId, nodeVersion: process.version,
      wranglerVersion: parseWranglerVersion(execFileSync('wrangler', ['--version'], { encoding: 'utf8' })),
      lockfile: readFileSync('package-lock.json'), wranglerConfig: new TextEncoder().encode(JSON.stringify({
        worker: 'member-dashboard-chat-worker', function: FUNCTION_NAME, baseline: expected.version,
        module: expected.moduleName, module_sha256: expected.moduleDigest,
        function_sha256: expected.functionDigest, before: BEFORE, after: AFTER,
      })) }), preservation }),
    save: receipt => save('owner-price-chat-count-receipt.json', receipt),
  });
  console.log(JSON.stringify({ phase: state.phase, source_sha: sha, baseline_version: state.baseline_version,
    uploaded_version: state.uploaded_version, deployment: state.deployment,
    unrelated_runtime_bytes_unchanged: preservation?.unrelated_runtime_bytes_unchanged === true }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Owner-price operation stopped: ${error.message}; no automatic retry.`);
    process.exitCode = 1;
  });
}
