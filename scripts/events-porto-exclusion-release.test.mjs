import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { automaticModelAllowed, chooseDailyCard } from '../events-worker/src/compcard-policy.js';
import {
  MANIFEST, MANIFEST_HASH, BASELINE_HASH, CANDIDATE_HASH, OWNER_REQUEST, ROUND_KEYS, ROUND_DATE, RELEASE_WINDOW, validateQuietSchedule,
  digest, validateManifestBytes, applyPortoOverlay, assertReleaseWindow, readActiveModule, readRoundState as readRoundStateAt, withPortoBoundary,
} from './events-porto-exclusion-release.mjs';

const manifestBytes = readFileSync(MANIFEST);
const manifest = validateManifestBytes(manifestBytes);
const release = readFileSync('scripts/events-porto-exclusion-release.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/deploy-events-porto-exclusion-code-only.yml', 'utf8');
test('reviewed schedule rejects flag, cadence, timing, cron and duplicate-binding drift', () => {
  const values = { HYPE_COMPCARD_ENABLED: 'true', HYPE_STANDARD_ENABLED: 'true', HYPE_INTAKE_ENABLED: 'true',
    HYPE_PROMOTION_ENABLED: 'false', HYPE_COMPCARD_SEND_AT_ICT: '16:30', HYPE_STANDARD_SEND_AT_ICT: '20:00',
    HYPE_PROMOTION_SEND_AT_ICT: '20:00', HYPE_CADENCE_START_DATE: '2026-10-23', HYPE_PROMOTION_WEEKDAYS: '2,5' };
  const version = { resources: { bindings: Object.entries(values).map(([name, text]) => ({ name, text, type: 'plain_text' })) } };
  const schedules = { schedules: [{ cron: '*/15 * * * *', created_on: 'ignored-metadata' }] };
  assert.doesNotThrow(() => validateQuietSchedule(version, schedules));
  for (const binding of version.resources.bindings) {
    const changed = structuredClone(version);
    changed.resources.bindings.find(row => row.name === binding.name).text = 'changed';
    assert.throws(() => validateQuietSchedule(changed, schedules));
  }
  for (const schedule of [undefined, {}, { schedules: [] }, { schedules: [{ cron: '*/5 * * * *' }] },
    { schedules: [{ cron: '*/15 * * * *' }, { cron: '1 * * * *' }] }]) assert.throws(() => validateQuietSchedule(version, schedule));
  const duplicate = structuredClone(version); duplicate.resources.bindings.push(duplicate.resources.bindings[0]);
  assert.throws(() => validateQuietSchedule(duplicate, schedules));
});
test('normal-source policy keeps Porto excluded across static and intake cards on future dates', () => {
  assert.equal(automaticModelAllowed('recnl4Fksh6pXEwA1'), false);
  assert.equal(automaticModelAllowed('recW0Whpu9maVjYF6'), false);
  assert.equal(automaticModelAllowed('recOtherModel01'), true);
  for (const date of ['2026-11-11', '2026-11-12', '2027-02-15']) for (const source of [undefined, 'owner_drive_intake']) {
    const card = { id: 'porto', model_id: 'recnl4Fksh6pXEwA1', category: 'standard', display_name: 'Porto MJ', ...(source ? { source } : {}) };
    assert.equal(chooseDailyCard([card], [], date), null);
    const other = { ...card, id: 'other', model_id: 'recOtherModel01', display_name: 'Other' };
    assert.equal(chooseDailyCard([card, other], [], date).model_id, other.model_id);
  }
});
test('normal-source dispatch rechecks the identity rule for frozen plans in both model slots before delivery', () => {
  const daily = readFileSync('events-worker/src/compcard-daily.js', 'utf8');
  assert.match(daily, /const modelSlot = slot === "model" \|\| slot === "standard"/);
  const frozen = daily.indexOf('let plan =');
  const prepare = daily.indexOf('prepare: async', frozen);
  const guard = daily.indexOf('if (!automaticModelAllowed(card.model_id)) throw problem("compcard_automatic_selection_excluded", false);', prepare);
  const reserve = daily.indexOf('await reserveCompcardExposure', prepare);
  const deliver = daily.indexOf('deliver:', prepare);
  assert.ok(frozen >= 0 && prepare > frozen && guard > prepare && reserve > guard && deliver > reserve);
  const modelBlock = daily.lastIndexOf('if (modelSlot) {', guard);
  assert.ok(modelBlock > prepare && guard - modelBlock < 300);
});
const QUIET_NOW = Date.parse('2026-11-12T15:00:00Z');
const readRoundState = (token, request) => readRoundStateAt(token, request, QUIET_NOW);
const STANDARD_KEYS = ROUND_KEYS.slice(4, 8);
const json = value => new Response(JSON.stringify(value), { status: 200 });
function roundFixture(records = {}) {
  const calls = [];
  return { calls, request: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(new URL(url).origin, 'https://api.cloudflare.com');
    const parsed = new URL(url);
    if (parsed.searchParams.has('prefix')) {
      const key = parsed.searchParams.get('prefix');
      assert.ok(ROUND_KEYS.includes(key));
      assert.equal(parsed.searchParams.get('per_page'), '2');
      return json({ success: true, result: records[key] ? [{ key, size: Buffer.byteLength(records[key]) }] : [] });
    }
    const key = ROUND_KEYS.find(key => parsed.pathname.endsWith('/' + key));
    assert.ok(key && records[key]);
    return new Response(records[key], { status: 200 });
  } };
}
function frozen(status = 'pending') {
  const plan = { schema: 'hype_compcard_plan_v1', date: ROUND_DATE, slot: 'standard', model_id: 'recnl4Fksh6pXEwA1', category: 'standard', card_id: 'porto-card', file_id: 'porto-file', sha256: 'a'.repeat(64), destinations: ['premium', 'standard'], chat_ids: { premium: '-1001668261779', standard: '-1002073919780' } };
  plan.digest = digest(JSON.stringify(plan));
  const receipt = destination => ({ schema: 'hype_compcard_delivery_v1', date: plan.date, slot: plan.slot, destination, model_id: plan.model_id, card_id: plan.card_id, plan_digest: plan.digest, approved_sha256: plan.sha256, expected_chat_id: plan.chat_ids[destination], status, attempts: 1, lease_until: 0 });
  return { [STANDARD_KEYS[0]]: JSON.stringify(plan), [STANDARD_KEYS[1]]: JSON.stringify(receipt('premium')), [STANDARD_KEYS[2]]: JSON.stringify(receipt('standard')) };
}

test('manifest is fixed to canonical Porto, both model slots, ongoing scope and exact hashes', () => {
  assert.equal(digest(manifestBytes), MANIFEST_HASH);
  assert.equal(manifest.baseline_sha256, BASELINE_HASH);
  assert.equal(manifest.candidate_sha256, CANDIDATE_HASH);
  assert.deepEqual(manifest.scope, { model_id: 'recnl4Fksh6pXEwA1', canonical_name: 'Porto MJ', slots: ['model', 'standard'], persistence: 'until_explicitly_reenabled', selection_sources: ['static_manifest', 'approved_intake'] });
  assert.equal(manifest.replacements.length, 2);
  for (const row of manifest.replacements) assert.equal(row.section, 'compcard-daily');
  assert.equal(OWNER_REQUEST, 'Sentinel_7d526138545c8191b8f609294acbe26f');
});
test('any manifest-byte, scope, hash or baseline drift is rejected', () => {
  assert.throws(() => validateManifestBytes(Buffer.concat([manifestBytes, Buffer.from(' ')])), /differs/);
  const changed = structuredClone(manifest); changed.scope.date = '2026-11-12';
  assert.throws(() => validateManifestBytes(Buffer.from(JSON.stringify(changed))), /differs/);
  assert.throws(() => applyPortoOverlay('unreviewed code', manifest), /baseline/);
});
test('release has a new explicit after-catchup window, never an automatic rollover', () => {
  assert.equal(ROUND_DATE, '2026-11-12');
  assert.deepEqual(RELEASE_WINDOW, { start: '2026-11-12T14:45:00Z', end: '2026-11-12T16:45:00Z' });
  assert.doesNotThrow(() => assertReleaseWindow(Date.parse(RELEASE_WINDOW.start)));
  assert.doesNotThrow(() => assertReleaseWindow(Date.parse(RELEASE_WINDOW.end) - 1));
  for (const value of [NaN, Date.parse('2026-11-11T12:54:00Z'), Date.parse('2026-11-12T13:00:00Z'),
    Date.parse('2026-11-12T14:29:59Z'), Date.parse(RELEASE_WINDOW.start) - 1,
    Date.parse(RELEASE_WINDOW.end), Date.parse('2026-11-13T15:00:00Z')]) assert.throws(() => assertReleaseWindow(value));
});
test('dedicated workflow keeps main SHA, reviewer environment, concurrency and read-only Actions permissions', () => {
  assert.match(workflow, /inputs.approved_sha == github.sha/g);
  assert.match(workflow, /github.ref == 'refs\/heads\/main'/g);
  assert.match(workflow, /needs: \[production-approval, contracts\]/);
  assert.match(workflow, /uses: .\/.github\/workflows\/admin-production-approval.yml/);
  assert.match(workflow, /environment: mmd-production-mutation/);
  assert.match(workflow, /environment_name: mmd-production-mutation/);
  assert.match(workflow, /'deploy-events-worker-production'/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /contents: read\n  actions: read/);
  assert.equal((workflow.match(/secrets\./g) || []).length, 1);
  assert.match(workflow, /secrets.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow, /write-all|contents: write|actions: write|pull_request_target|wrangler.*deploy/);
});
test('entry reuses unchanged protected transport and validates production scope each approval stage', () => {
  assert.match(release, /import .*verifyProductionApproval.*admin-production-approval/);
  assert.match(release, /import .*inspectEnvironment.*admin-production-validation/);
  assert.match(release, /import .*releaseEventsRotation.*events-rotation-release-transport/);
  assert.match(release, /await verifyProductionApproval\(process.env\)/);
  assert.match(release, /inspectEnvironment\(process.env\)/);
  assert.match(release, /validateSourceState\(/);
  assert.match(release, /APPROVAL_REF, OWNER_REQUEST/);
  assert.match(release, /EXPECTED_VERSION, manifest.expected_version/);
  assert.match(release, /EXPECTED_DEPLOYMENT, manifest.expected_deployment/);
  assert.match(release, /current = await readCurrent\(\)/);
  assert.match(release, /assert.deepEqual\(current, roundState/);
  assert.match(release, /HYPE_PROMOTION_ENABLED.*text, 'false'/);
  assert.match(release, /HYPE_COMPCARD_STATE/);
  assert.match(release, /verifyActiveModule: async expected/);
  assert.doesNotMatch(release, /events-model-rotation\/overlay-manifest|events-model-rotation-release.mjs|testHistoryReviewCandidate|wrangler/);
});
test('module read is GET-only with exact endpoint/name and no redirect', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    const form = new FormData(); form.set('model-eta-wrapper.js', new Blob(['fixture-code']), 'model-eta-wrapper.js');
    return { status: 200, formData: async () => form };
  };
  assert.equal(await readActiveModule('fixture', 'model-eta-wrapper.js', request), 'fixture-code');
  assert.equal(calls.length, 1); assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].url.endsWith('/events-worker/content/v2'));
  await assert.rejects(readActiveModule('fixture', 'other.js', request));
  await assert.rejects(readActiveModule('fixture', 'worker.js', request));
  await assert.rejects(readActiveModule('fixture', 'worker.js', async () => ({ status: 403 })));
});
test('all three slots and destinations are inventoried using twelve exact-key GETs', async () => {
  const f = roundFixture(); const state = await readRoundState('fixture', f.request);
  assert.equal(f.calls.length, 12);
  assert.deepEqual(state, ROUND_KEYS.map(key => ({ key, sha256: null, status: null, model_id: null })));
});
for (const status of ['pending', 'not_sent', 'sent', 'blocked', 'delivery_uncertain']) test(`frozen Porto ${status} evidence is observed without any mutation`, async () => {
  const records = frozen(status); const original = JSON.stringify(records);
  const f = roundFixture(records); const state = await readRoundState('fixture', f.request);
  assert.equal(f.calls.length, 15); assert.equal(JSON.stringify(records), original);
  assert.deepEqual(state.slice(5, 7).map(row => row.status), [status, status]);
  assert.ok(state.slice(4, 7).every(row => row.sha256));
  assert.ok(state.every(row => !('record' in row) && !('captions' in row)));
});
test('newly frozen plan or changed receipt changes the snapshot and cannot compare equal', async () => {
  const absent = await readRoundState('fixture', roundFixture().request);
  const pending = await readRoundState('fixture', roundFixture(frozen()).request);
  const sent = await readRoundState('fixture', roundFixture(frozen('sent')).request);
  assert.notDeepEqual(absent, pending); assert.notDeepEqual(pending, sent);
});
test('both model and standard evidence preserves partial sent and uncertain outcomes without writes', async () => {
  const records = frozen('sent');
  const uncertain = JSON.parse(records[STANDARD_KEYS[2]]); uncertain.status = 'delivery_uncertain';
  uncertain.error = 'receipt unverified'; uncertain.receipt = null;
  records[STANDARD_KEYS[2]] = JSON.stringify(uncertain);
  const model = JSON.parse(records[STANDARD_KEYS[0]]);
  model.slot = 'model'; model.category = 'exclusive'; model.model_id = 'different-model';
  model.destinations = ['premium', 'preview']; model.chat_ids = { premium: '-1001668261779', preview: '-1002393788585' };
  delete model.digest; model.digest = digest(JSON.stringify(model));
  records[ROUND_KEYS[0]] = JSON.stringify(model);
  for (const [index, destination] of [[1, 'premium'], [3, 'preview']]) records[ROUND_KEYS[index]] = JSON.stringify({
    ...JSON.parse(records[STANDARD_KEYS[1]]), slot: 'model', destination, model_id: model.model_id,
    plan_digest: model.digest, expected_chat_id: model.chat_ids[destination], receipt: { message_id: index + 100 },
  });
  const before = JSON.stringify(records);
  const result = await readRoundState('fixture', roundFixture(records).request);
  assert.equal(JSON.stringify(records), before);
  assert.equal(result[1].status, 'sent'); assert.equal(result[3].status, 'sent');
  assert.equal(result[5].status, 'sent'); assert.equal(result[6].status, 'delivery_uncertain');
});
test('in-flight, active lease, future retry and malformed evidence stop without cleanup', async () => {
  for (const update of [{ status: 'preparing' }, { status: 'sending' }, { lease_until: QUIET_NOW + 1 },
    { next_attempt_at: QUIET_NOW + 1 }, { attempts: 4 }, { attempts: -1 }, { lease_until: -1 },
    { next_attempt_at: -1 }, { destination: 'preview' }]) {
    const records = frozen(); const receipt = JSON.parse(records[STANDARD_KEYS[1]]);
    Object.assign(receipt, update); records[STANDARD_KEYS[1]] = JSON.stringify(receipt);
    const before = JSON.stringify(records);
    await assert.rejects(readRoundState('fixture', roundFixture(records).request));
    assert.equal(JSON.stringify(records), before);
  }
});
test('promotion evidence and receipts outside the frozen destinations stop the release', async () => {
  for (const key of ROUND_KEYS.slice(8)) await assert.rejects(readRoundState('fixture', roundFixture({ [key]: '{}' }).request), /promotion/);
  const records = frozen(); records[STANDARD_KEYS[3]] = records[STANDARD_KEYS[1]];
  await assert.rejects(readRoundState('fixture', roundFixture(records).request), /outside/);
});
test('expired or not-yet-open round read makes no requests', async () => {
  let calls = 0;
  for (const now of [Date.parse(RELEASE_WINDOW.start) - 1, Date.parse(RELEASE_WINDOW.end)]) {
    await assert.rejects(readRoundStateAt('fixture', async () => { calls++; }, now));
  }
  assert.equal(calls, 0);
});
test('each release boundary reads the pinned schedule and both model rounds', () => {
  assert.match(release, /validateQuietSchedule\(await transport\(ROOT \+ '\/versions\/' \+ manifest.expected_version\)/);
  assert.match(release, /await transport\(ROOT \+ '\/schedules'\)/);
  assert.match(release, /withPortoBoundary\(transport, readCurrent, \(\) => roundState\)/);
  assert.match(release, /assert.deepEqual\(await readCurrent\(\), roundState/);
  assert.match(release, /release_window: RELEASE_WINDOW/);
});
test('round reads fail closed on denied, truncated, ambiguous, orphan or invalid state', async () => {
  await assert.rejects(readRoundState('fixture', async () => new Response('', { status: 403 })));
  await assert.rejects(readRoundState('fixture', async () => json({ success: true, result: [], result_info: { is_truncated: true } })));
  await assert.rejects(readRoundState('fixture', async () => json({ success: true, result: [{ key: 'unrelated' }] })));
  const orphan = frozen(); delete orphan[STANDARD_KEYS[0]];
  await assert.rejects(readRoundState('fixture', roundFixture(orphan).request), /orphan/);
  const corrupt = frozen(); const plan = JSON.parse(corrupt[STANDARD_KEYS[0]]); plan.model_id = 'other'; corrupt[STANDARD_KEYS[0]] = JSON.stringify(plan);
  await assert.rejects(readRoundState('fixture', roundFixture(corrupt).request), /integrity/);
  const mismatch = frozen(); const receipt = JSON.parse(mismatch[STANDARD_KEYS[1]]); receipt.plan_digest = 'b'.repeat(64); mismatch[STANDARD_KEYS[1]] = JSON.stringify(receipt);
  await assert.rejects(readRoundState('fixture', roundFixture(mismatch).request));
});
for (const path of ['/versions?bindings_inherit=strict', '/deployments']) {
  test(`expiry and round drift are checked immediately before ${path}`, async () => {
    let writes = 0; let reads = 0;
    const transport = async () => { writes++; return 'passed'; };
    const state = [{ key: 'fixture', sha256: null }];
    const read = async () => { reads++; return structuredClone(state); };
    const early = () => QUIET_NOW;
    assert.equal(await withPortoBoundary(transport, read, () => state, early)(path, { method: 'POST' }), 'passed');
    assert.equal(writes, 1); assert.equal(reads, 1);
    await assert.rejects(withPortoBoundary(transport, async () => { throw new Error('R2 permission denied'); }, () => state, early)(path, { method: 'POST' }), /permission/);
    assert.equal(writes, 1);
    await assert.rejects(withPortoBoundary(transport, async () => [], () => state, early)(path, { method: 'POST' }), /changed/);
    assert.equal(writes, 1);
    let ticks = 0;
    await assert.rejects(withPortoBoundary(transport, read, () => state, () => Date.parse(RELEASE_WINDOW.end) - (ticks++ ? 0 : 1))(path, { method: 'POST' }));
    assert.equal(writes, 1);
  });
}
test('boundary wrapper never retries an uncertain mutation or changes read-only transport calls', async () => {
  let calls = 0; let reads = 0;
  const wrapped = withPortoBoundary(async () => { calls++; throw new Error('outcome unknown'); }, async () => { reads++; return []; }, () => [], () => QUIET_NOW);
  await assert.rejects(wrapped('/deployments', { method: 'POST' }), /unknown/);
  assert.equal(calls, 1); assert.equal(reads, 1);
  await assert.rejects(wrapped('/deployments'), /unknown/);
  assert.equal(calls, 2); assert.equal(reads, 1);
});
