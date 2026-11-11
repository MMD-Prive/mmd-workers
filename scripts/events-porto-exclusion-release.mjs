// Porto only, one Standard round. No work runs on import.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';
import { validateSourceState } from './admin-current-session-code-only.mjs';
import { releaseEventsRotation, createTransport, ROOT, ACCOUNT } from './events-rotation-release-transport.mjs';

export const MANIFEST = 'release/events-porto-exclusion/overlay-manifest.json';
export const OWNER_REQUEST = 'Sentinel_96f4a14c0dd481919bba7618d7a0a314';
export const BASELINE_HASH = 'd517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee';
export const CANDIDATE_HASH = 'c7a2013edcc2502d804ffba0b083e896d3f3850e335bc7ed55c410b8bcf72387';
export const MANIFEST_HASH = '47ea02c699deb6831c17c5cfc830a0c07691d4dfb9b160ab3c6349a9d4dfb0b7';
export const ROUND_DATE = '2026-11-11';
const BUCKET = 'mmd-hype-compcard-state';
const R2 = `/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects`;
export const ROUND_KEYS = [
  `hype-compcards/v1/plans/${ROUND_DATE}/standard.json`,
  `hype-compcards/v1/deliveries/${ROUND_DATE}/standard/premium.json`,
  `hype-compcards/v1/deliveries/${ROUND_DATE}/standard/standard.json`,
];
export const digest = value => createHash('sha256').update(value).digest('hex');
export function validateManifestBytes(bytes) {
  assert.equal(digest(bytes), MANIFEST_HASH, 'Porto manifest differs from exact reviewed scope');
  const manifest = JSON.parse(bytes);
  assert.deepEqual(manifest.scope, { model_id: 'recnl4Fksh6pXEwA1', canonical_name: 'Porto MJ', date: ROUND_DATE, slot: 'standard' });
  assert.equal(manifest.worker, 'events-worker');
  assert.equal(manifest.module, 'model-eta-wrapper.js');
  assert.equal(manifest.baseline_sha256, BASELINE_HASH);
  assert.equal(manifest.candidate_sha256, CANDIDATE_HASH);
  assert.equal(manifest.replacements.length, 2);
  assert.ok(manifest.replacements.every(row => row.section === 'compcard-daily'));
  return manifest;
}
export function applyPortoOverlay(code, manifest) {
  assert.equal(digest(code), BASELINE_HASH, 'active module differs from pinned baseline');
  assert.equal(manifest.baseline_sha256, BASELINE_HASH);
  assert.equal(manifest.candidate_sha256, CANDIDATE_HASH);
  assert.equal(manifest.replacements.length, 2);
  let candidate = code;
  for (const change of manifest.replacements) {
    assert.equal(change.section, 'compcard-daily');
    assert.ok(change.before && change.after && change.before !== change.after);
    const position = candidate.indexOf(change.before);
    assert.ok(position >= 0 && candidate.indexOf(change.before, position + change.before.length) === -1, 'ambiguous anchor');
    assert.equal(candidate.slice(0, position).match(/\/\/ src\/[^\n]+/g)?.at(-1), '// src/compcard-daily.js');
    candidate = candidate.replace(change.before, change.after);
  }
  assert.equal(digest(candidate), CANDIDATE_HASH, 'candidate differs from reviewed Porto module');
  let restored = candidate;
  for (const change of [...manifest.replacements].reverse()) restored = restored.replace(change.after, change.before);
  assert.equal(restored, code, 'unrelated bytes changed');
  return candidate;
}
export function assertReleaseWindow(now = Date.now()) {
  assert.ok(Number.isSafeInteger(now) && now >= Date.parse('2026-11-10T17:00:00Z')
    && now < Date.parse('2026-11-11T12:55:00Z'), 'release must finish preparation before 19:55 ICT on the exact round date');
}
export async function readActiveModule(token, expectedName, request = fetch) {
  assert.ok(['model-eta-wrapper.js', 'worker.js'].includes(expectedName));
  const response = await request('https://api.cloudflare.com/client/v4' + ROOT + '/content/v2', {
    method: 'GET', headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, 'cannot read exact active module');
  const entries = [...(await response.formData()).entries()];
  assert.equal(entries.length, 1, 'unexpected module or source map');
  assert.equal(entries[0][0], expectedName);
  assert.ok(typeof entries[0][1] !== 'string' && entries[0][1].size < 1024 * 1024);
  return entries[0][1].text();
}
export async function readRoundState(token, request = fetch) {
  const headers = { Authorization: 'Bearer ' + token };
  const get = path => request('https://api.cloudflare.com/client/v4' + path, {
    method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  const rows = [];
  for (const key of ROUND_KEYS) {
    const response = await get(R2 + '?prefix=' + encodeURIComponent(key) + '&per_page=2');
    assert.equal(response.status, 200, 'cannot establish round-state inventory');
    const list = await response.json();
    assert.equal(list?.success, true);
    assert.ok(Array.isArray(list.result) && list.result.length <= 1
      && !list.result_info?.is_truncated && !list.result_info?.cursor
      && list.result.every(row => row.key === key), 'round-state inventory ambiguous');
    if (!list.result.length) { rows.push({ key, sha256: null, record: null }); continue; }
    const object = await get(R2 + '/' + key);
    assert.equal(object.status, 200, 'round-state object missing after inventory');
    const text = await object.text();
    assert.ok(Buffer.byteLength(text) < 100000, 'round-state object oversized');
    const record = JSON.parse(text);
    assert.ok(record && typeof record === 'object' && !Array.isArray(record));
    rows.push({ key, sha256: digest(text), record });
  }
  const plan = rows[0].record;
  if (!plan) assert.ok(rows.slice(1).every(row => row.record === null), 'orphan round receipts');
  else {
    assert.equal(plan.schema, 'hype_compcard_plan_v1');
    assert.equal(plan.date, ROUND_DATE); assert.equal(plan.slot, 'standard');
    const { digest: claimed, ...payload } = plan;
    assert.equal(digest(JSON.stringify(payload)), claimed, 'frozen plan integrity changed');
    assert.ok(Array.isArray(plan.destinations) && plan.destinations.length > 0
      && new Set(plan.destinations).size === plan.destinations.length
      && plan.destinations.every(destination => ['premium', 'standard'].includes(destination)));
    for (const row of rows.slice(1)) if (row.record) {
      const destination = row.key.split('/').at(-1).replace('.json', '');
      assert.equal(row.record.schema, 'hype_compcard_delivery_v1');
      assert.ok(['pending', 'preparing', 'sending', 'not_sent', 'sent', 'blocked', 'delivery_uncertain'].includes(row.record.status));
      for (const [field, value] of Object.entries({ date: plan.date, slot: plan.slot, destination,
        model_id: plan.model_id, card_id: plan.card_id, plan_digest: plan.digest,
        approved_sha256: plan.sha256, expected_chat_id: plan.chat_ids?.[destination] })) assert.equal(row.record[field], value);
    }
  }
  // Sanitize receipt: no captions, private metadata, or source object contents.
  return rows.map(row => ({ key: row.key, sha256: row.sha256, status: row.record?.status ?? null,
    model_id: row.record?.model_id ?? null }));
}
export function testPortoCandidate(candidate, baseline, manifestBytes) {
  const directory = mkdtempSync(join(tmpdir(), 'events-porto-tests-'));
  writeFileSync(join(directory, 'live-baseline.mjs'), baseline);
  writeFileSync(join(directory, 'porto-only-candidate.mjs'), candidate);
  writeFileSync(join(directory, 'porto-only-overlay.json'), manifestBytes);
  writeFileSync(join(directory, 'candidate.test.mjs'), readFileSync('release/events-porto-exclusion/candidate.test.mjs'));
  execFileSync(process.execPath, ['--check', 'porto-only-candidate.mjs'], { cwd: directory, stdio: 'inherit', timeout: 60000 });
  execFileSync(process.execPath, ['--test', 'candidate.test.mjs'], { cwd: directory, stdio: 'inherit', timeout: 60000 });
}
export function withPortoBoundary(transport, readRound, expectedRound, now = Date.now) {
  return async (path, init) => {
    if (init?.method === 'POST') {
      assertReleaseWindow(now());
      assert.deepEqual(await readRound(), expectedRound(), 'round evidence changed immediately before mutation');
      assertReleaseWindow(now());
    }
    return transport(path, init);
  };
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
async function main() {
  assert.equal(process.argv[2], '--execute-approved');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true');
  assert.equal(process.env.APPROVAL_REF, OWNER_REQUEST, 'exact current Porto request required');
  const manifestBytes = readFileSync(MANIFEST);
  const manifest = validateManifestBytes(manifestBytes);
  const sha = process.env.GITHUB_SHA;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  let roundState;
  const approve = async () => {
    await verifyProductionApproval(process.env);
    assert.equal((await inspectEnvironment(process.env)).ready, true, 'protected main-only reviewer environment required');
    validateSourceState({ expectedSha: sha, headSha: git('rev-parse', 'HEAD'), dirtyStatus: git('status', '--porcelain=v1', '--untracked-files=all') });
    assertReleaseWindow();
    const current = await readRoundState(token);
    if (roundState) assert.deepEqual(current, roundState, 'round plan or evidence changed; stop without mutation');
    else roundState = current;
    assertReleaseWindow();
  };
  assert.equal(process.env.EXPECTED_VERSION, manifest.expected_version);
  assert.equal(process.env.EXPECTED_DEPLOYMENT, manifest.expected_deployment);
  const releaseId = process.env.GITHUB_RUN_ID + '.' + process.env.GITHUB_RUN_ATTEMPT;
  assert.match(releaseId, /^\d+\.\d+$/);
  const journal = join(process.env.RUNNER_TEMP, 'events-porto-exclusion-release.json');
  await releaseEventsRotation({
    sha, approve, expectedVersion: manifest.expected_version, expectedDeployment: manifest.expected_deployment,
    call: withPortoBoundary(createTransport(token), () => readRoundState(token), () => roundState),
    sourceCheck: async version => {
      assert.equal(version.resources.bindings.find(row => row.name === 'HYPE_PROMOTION_ENABLED')?.text, 'false');
      const bucket = version.resources.bindings.find(row => row.name === 'HYPE_COMPCARD_STATE');
      assert.equal(bucket?.type, 'r2_bucket'); assert.equal(bucket.bucket_name, BUCKET);
      return { commit_sha: sha, dirty_tree: false, method: 'exact-live-porto-only-standard-round-overlay',
        baseline_module_sha256: BASELINE_HASH, candidate_module_sha256: CANDIDATE_HASH };
    },
    bundle: async () => {
      const baseline = await readActiveModule(token, manifest.module);
      const candidate = applyPortoOverlay(baseline, manifest);
      testPortoCandidate(candidate, baseline, manifestBytes);
      return new TextEncoder().encode(candidate);
    },
    buildEvidence: code => ({ release_id: releaseId, toolchain: { node: process.version, compiler: 'none-exact-overlay' },
      artifact: { digest: { algorithm: 'sha256', value: digest(code) } },
      preservation: { unrelated_bytes_preserved: true, sections: manifest.sections, manifest_sha256: digest(manifestBytes) } }),
    verifyActiveModule: async expected => {
      assert.equal(digest(await readActiveModule(token, 'worker.js')), expected, 'active module digest mismatch');
      assert.deepEqual(await readRoundState(token), roundState, 'round evidence changed during release');
    },
    now: () => new Date().toISOString(),
    save: state => writeFileSync(journal, JSON.stringify({ ...state, round_state: roundState }, null, 2), { mode: 0o600 }),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Porto-only release stopped. Inspect receipt; never retry an uncertain mutation.'); process.exitCode = 1; });
}
