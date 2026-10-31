// One reviewed insertion into the active LINE booking handler. No full rebuild,
// business writes, flag changes, automatic retry, or rollback.
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
export const HANDLER = 'tryHandleKenjiLv5LineOperationalRequest';
export const ANCHOR = '  const currentIntent = inferLineIntent(raw, event);\n';
export const GUARD_LINE = '  if (careBackOctoberReply(currentIntent, raw, Date.now())) return null;';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const MODULE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:mjs|js)$/;
const SOURCE = 'member-dashboard-chat-worker/src/kenji-lv5-line-operational-request.mjs';
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
const canonical = value => JSON.stringify(sort(value));

function uniqueOffset(code, marker, message) {
  const offset = code.indexOf(marker);
  assert.ok(offset >= 0 && code.indexOf(marker, offset + marker.length) === -1, message);
  return offset;
}

export function handlerPart(code) {
  assert.equal(typeof code, 'string', 'module text required');
  const marker = `async function ${HANDLER}(`;
  // Keep the async keyword within the reviewed digest and replacement bytes.
  const start = uniqueOffset(code, marker, 'exactly one async operational handler required');
  assert.equal(uniqueOffset(code, `function ${HANDLER}(`, 'operational handler declaration must be unique'), start + 'async '.length,
    'unexpected operational handler declaration');
  const close = code.indexOf('\n}\n', start);
  assert.ok(close > start, 'reviewed top-level function boundary missing');
  return { start, end: close + 3, text: code.slice(start, close + 3) };
}

function validateHelper(code) {
  uniqueOffset(code, 'function careBackOctoberReply(', 'existing common CARE BACK helper required once');
}

export function validateSourcePatch(source) {
  const part = handlerPart(source);
  const anchor = uniqueOffset(part.text, ANCHOR, 'source intent anchor must be unique');
  const guard = uniqueOffset(part.text, GUARD_LINE, 'source CARE BACK guard must be unique');
  assert.ok(guard >= anchor + ANCHOR.length, 'source guard must follow intent classification');
  assert.equal(part.text.slice(anchor + ANCHOR.length, guard).replace(/\/\/[^\n]*/g, '').trim(), '',
    'source guard must precede runtime and booking work');
  assert.match(source, /import\s*\{\s*careBackOctoberReply\s*\}\s*from\s*['"]\.\/kenji-care-back-october\.mjs['"]/, 'source must import approved common reply helper');
  return true;
}

export function patchPrecedence(code, expectedHandlerDigest) {
  assert.match(expectedHandlerDigest || '', SHA256, 'reviewed handler SHA-256 required');
  validateHelper(code);
  const part = handlerPart(code);
  assert.equal(digest(part.text), expectedHandlerDigest, 'reviewed operational handler drift');
  const anchor = uniqueOffset(part.text, ANCHOR, 'compiled intent anchor must be unique');
  assert.ok(!part.text.includes(GUARD_LINE), 'CARE BACK guard already present; do not redeploy');
  const insertion = anchor + ANCHOR.length;
  const replacement = part.text.slice(0, insertion) + GUARD_LINE + '\n' + part.text.slice(insertion);
  const candidate = code.slice(0, part.start) + replacement + code.slice(part.end);
  const after = handlerPart(candidate);
  assert.equal(candidate.slice(0, after.start) + part.text + candidate.slice(after.end), code,
    'unrelated runtime bytes changed');
  return {
    code: candidate,
    preservation: {
      baseline_sha256: digest(code), candidate_sha256: digest(candidate),
      baseline_handler_sha256: expectedHandlerDigest, candidate_handler_sha256: digest(after.text),
      functions: [HANDLER], inserted_guard: GUARD_LINE.trim(), unrelated_runtime_bytes_unchanged: true,
    },
  };
}

export function validateExpectedInputs(env) {
  assert.match(env.EXPECTED_VERSION || '', UUID, 'fresh active version UUID required');
  assert.match(env.EXPECTED_DEPLOYMENT || '', UUID, 'fresh active deployment UUID required');
  assert.match(env.EXPECTED_HANDLER_SHA256 || '', SHA256, 'reviewed active handler SHA-256 required');
  assert.match(env.EXPECTED_MODULE || '', MODULE, 'exact active single JavaScript module filename required');
  return {
    version: env.EXPECTED_VERSION, deployment: env.EXPECTED_DEPLOYMENT,
    handlerDigest: env.EXPECTED_HANDLER_SHA256, moduleName: env.EXPECTED_MODULE,
  };
}

export function transport(token, { allowWrites = false, request = fetch } = {}) {
  assert.ok(token, 'Cloudflare credential required');
  return async (path, { method = 'GET', body } = {}) => {
    const read = method === 'GET' && (
      new RegExp(`^${ROOT}/(deployments(?:/[a-f0-9-]{36})?|versions(?:/[a-f0-9-]{36})?|script-settings|schedules|subdomain)$`, 'i').test(path)
      || path === `/zones/${ZONE}/workers/routes`);
    const write = allowWrites && method === 'POST'
      && [ROOT + '/versions?bindings_inherit=strict', ROOT + '/deployments'].includes(path);
    assert.ok(read || write, 'outside CARE BACK precedence code-only scope');
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
  assert.match(name, MODULE, 'unexpected active module filename');
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
  assert.match(module.name, MODULE, 'unexpected active module filename');
  validateHelper(module.code);
  const part = handlerPart(module.code);
  uniqueOffset(part.text, ANCHOR, 'inspection intent anchor must be unique');
  const readback = (await get('/deployments'))?.deployments?.[0];
  assert.equal(canonical(readback), canonical(deployment), 'deployment changed during inspection');
  assert.equal((await get('/versions'))?.items?.[0]?.id, versionId, 'latest upload changed during inspection');
  assert.equal(digest(canonical(versionConfiguration(await get('/versions/' + versionId)))), configurationDigest,
    'version configuration changed during inspection');
  await io.approve();
  return {
    schema: 'kenji-care-back-precedence-inspection.v1', production_mutation: false,
    worker: 'member-dashboard-chat-worker', source_sha: io.sha, inspected_at: io.now(),
    expected_version: versionId, expected_deployment: deployment.id,
    expected_module: module.name, expected_handler_sha256: digest(part.text),
    module_sha256: digest(module.code), configuration_sha256: configurationDigest,
    guard_already_present: part.text.includes(GUARD_LINE),
  };
}

export function overlayBuildEvidence(input) {
  const result = createBuildEvidence(input);
  // The shared guard's default label is for admin-worker; this overlay uploads worker.js.
  result.artifact.modules[0].name = 'worker.js';
  result.artifact.module_manifest_digest.value = digest(canonical(result.artifact.modules));
  return result;
}

async function main() {
  validateSourcePatch(readFileSync(SOURCE, 'utf8'));
  if (process.argv[2] === '--check-source') {
    console.log('CARE BACK source delegates before booking state reads and writes.');
    return;
  }
  const mode = process.argv[2];
  assert.ok(['--inspect-approved', '--execute-approved'].includes(mode), 'explicit inspection or release mode required');
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
    save('care-back-precedence-inspection.json', report);
    console.log(JSON.stringify(report));
    return;
  }
  const expected = validateExpectedInputs(process.env);
  const releaseId = `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT}`;
  const dir = mkdtempSync(join(tmpdir(), 'care-back-precedence-'));
  let preservation;
  const state = await releaseCurrentSession({
    root: ROOT, metadataFactory: uploadMetadata, sha, approve,
    expectedVersion: expected.version, expectedDeployment: expected.deployment,
    call: transport(token, { allowWrites: true }), now,
    sourceCheck: async version => {
      assert.equal(version.id, expected.version, 'reviewed baseline version mismatch');
      return { commit_sha: sha, dirty_tree: false, dirty_path_count: 0,
        method: 'one-guard-CARE-BACK-precedence-overlay', baseline_version: expected.version,
        baseline_module: expected.moduleName, baseline_handler_sha256: expected.handlerDigest };
    },
    bundle: async () => {
      const module = await readActiveModule(token);
      assert.equal(module.name, expected.moduleName, 'reviewed active module filename drift');
      const patched = patchPrecedence(module.code, expected.handlerDigest);
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
        worker: 'member-dashboard-chat-worker', handler: HANDLER, baseline: expected.version,
        module: expected.moduleName, handler_sha256: expected.handlerDigest, guard: GUARD_LINE.trim(),
      })) }), preservation }),
    save: receipt => save('care-back-precedence-receipt.json', receipt),
  });
  console.log(JSON.stringify({ phase: state.phase, source_sha: sha, baseline_version: state.baseline_version,
    uploaded_version: state.uploaded_version, deployment: state.deployment,
    unrelated_runtime_bytes_unchanged: preservation?.unrelated_runtime_bytes_unchanged === true }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`CARE BACK precedence operation stopped: ${error.message}; no automatic retry.`);
    process.exitCode = 1;
  });
}
