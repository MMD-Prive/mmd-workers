import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCandidate } from './kenji-3186-delta.mjs';
import { versionConfiguration, uploadMetadata, validateSourceState } from './admin-current-session-code-only.mjs';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';

const manifest = 'scripts/kenji-3186-upload-manifest.json';
export const pin = Object.freeze(JSON.parse(fs.readFileSync(new URL('./kenji-3186-upload-manifest.json', import.meta.url))));
const root = '/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/';
const script = root + 'scripts/member-dashboard-chat-worker';
const uploadPath = script + '/versions?bindings_inherit=strict';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const artifact = id => root + 'workers/' + pin.workerId + '/versions/' + id + '?include=modules';
const hash = b => createHash('sha256').update(b).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd();

export function transport(token, fetcher = fetch) {
  assert(token);
  return async (path, method = 'GET', body) => {
    const id = path.match(/\/versions\/([a-f0-9-]+)(?:\?include=modules)?$/)?.[1];
    const read = method === 'GET' && ([script + '/deployments', script + '/versions', script + '/script-settings'].includes(path) ||
      (id && uuid.test(id) && [script + '/versions/' + id, artifact(id)].includes(path)));
    assert(read || (method === 'POST' && path === uploadPath && body instanceof FormData), 'outside upload-only scope');
    const res = await fetcher('https://api.cloudflare.com/client/v4' + path, {
      method, body, headers: { authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(30000)
    });
    assert(res.ok, 'Cloudflare request failed');
    const data = await res.json();
    assert.equal(data.success, true);
    return data.result;
  };
}

export async function runUpload({ call, approve, source, save }) {
  const receipt = { phase: 'preflight', worker: pin.worker, source_sha: pin.mergeSha, candidate_sha256: pin.candidateHash };
  const stage = phase => { receipt.phase = phase; save({ ...receipt }); };
  const active = async () => {
    const d = (await call(script + '/deployments')).deployments[0];
    assert.equal(d.id, pin.deployment);
    assert.deepEqual(d.versions, [{ version_id: pin.version, percentage: 100 }]);
  };
  const bytes = async id => {
    assert.match(id, uuid);
    const v = await call(artifact(id));
    assert.equal(v.id, id);
    assert.equal(v.modules.length, 1);
    assert.equal(v.modules[0].name, pin.module);
    return Buffer.from(v.modules[0].content_base64, 'base64');
  };
  const assertModelOff = v => assert(v.resources.bindings.some(b => b.name === 'LINE_KENJI_MODEL_ENABLED' && b.type === 'plain_text' && b.text === 'false'));
  stage('preflight');
  await approve();
  await active();
  const v = await call(script + '/versions/' + pin.version);
  assert.equal(v.id, pin.version);
  assertModelOff(v);
  const { etag, ...scriptConfig } = v.resources.script;
  assert.equal(hash(JSON.stringify({ bindings: v.resources.bindings, script: scriptConfig, runtime: v.resources.script_runtime })), pin.configHash);
  const config = versionConfiguration(v);
  const settingsHash = hash(JSON.stringify(await call(script + '/script-settings')));
  const candidate = buildCandidate(await bytes(pin.version), source, pin);
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: candidate, stdio: ['pipe', 'pipe', 'pipe'] });
  const metadata = uploadMetadata(v, pin.mergeSha);
  metadata.main_module = pin.module;
  metadata.annotations['workers/message'] = 'Kenji #3186 upload-only source-sha=' + pin.mergeSha;
  const form = new FormData();
  form.set('metadata', JSON.stringify(metadata));
  form.set(pin.module, new Blob([candidate], { type: 'application/javascript+module' }), pin.module);
  await approve();
  await active();
  assert.equal(hash(JSON.stringify(await call(script + '/script-settings'))), settingsHash);
  const versions = (await call(script + '/versions')).items;
  assert(Array.isArray(versions));
  assert(!versions.some(x => Object.values(x.annotations || {}).includes(metadata.annotations['workers/message'])), 'candidate already uploaded');
  stage('upload-attempted-outcome-unknown');
  const uploaded = await call(uploadPath, 'POST', form);
  assert.match(uploaded.id, uuid);
  assert.notEqual(uploaded.id, pin.version);
  receipt.candidate_version = uploaded.id;
  stage('uploaded-not-promoted');
  const readback = await call(script + '/versions/' + uploaded.id);
  assert.equal(readback.id, uploaded.id);
  assert.equal(readback.annotations?.['workers/message'], metadata.annotations['workers/message']);
  assertModelOff(readback);
  assert.deepEqual(versionConfiguration(readback), config);
  assert.equal(hash(await bytes(uploaded.id)), pin.candidateHash);
  assert.equal(hash(JSON.stringify(await call(script + '/script-settings'))), settingsHash);
  await active();
  receipt.model_off = true;
  receipt.baseline_traffic = 100;
  receipt.config_parity = true;
  receipt.owner_overlay_verified_by_exact_candidate_hash = true;
  stage('upload-readback-complete');
  return receipt;
}

async function main() {
  const env = process.env;
  assert.equal(env.GITHUB_ACTOR, 'mmdprive');
  assert.equal(env.GITHUB_RUN_ATTEMPT, '1');
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.equal(env.PRODUCTION_APPROVED, 'true');
  const approve = async () => {
    await verifyProductionApproval(env);
    assert.equal((await inspectEnvironment(env)).ready, true);
    validateSourceState({ expectedSha: env.GITHUB_SHA, headSha: git('rev-parse', 'HEAD'), dirtyStatus: git('status', '--porcelain=v1', '--untracked-files=all') });
    assert.equal(git('ls-files', manifest), manifest);
    assert.equal(git('merge-base', pin.mergeSha, 'HEAD'), pin.mergeSha);
  };
  const save = state => fs.writeFileSync(join(env.RUNNER_TEMP, 'kenji-3186-upload-receipt.json'), JSON.stringify(state, null, 2), { mode: 0o600 });
  const source = file => execFileSync('git', ['show', pin.mergeSha + ':member-dashboard-chat-worker/src/' + file], { encoding: 'utf8' });
  console.log(JSON.stringify(await runUpload({ call: transport(env.CLOUDFLARE_API_TOKEN), approve, source, save })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Kenji #3186 upload-only stopped; inspect receipt before any further action.'); process.exitCode = 1; });
}
