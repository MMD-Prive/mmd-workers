import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  ROOT, MODULE_NAME, BEFORE, AFTER, BASELINE_FUNCTION_SHA256,
  recoveredFunction, validateRecoveredFunction, patchOwnerPriceChatCount,
  validateExpectedInputs, readActiveModule, transport, inspectBaseline,
  overlayBuildEvidence,
} from './kenji-owner-price-chat-count-release.mjs';
import { digest } from './admin-held-viewer-code-only.mjs';
import { RECOVERED_HELPER_SOURCE, RECOVERED_HELPER_SHA256 } from '../member-dashboard-chat-worker/test/fixtures/kenji-owner-price-helpers-live-20261031.mjs';

const VERSION = '11111111-1111-4111-8111-111111111111';
const DEPLOYMENT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const SOURCE = recoveredFunction();
const PREFIX = 'const retained = { ownerRules: true, faq: false, namedModelOnly: true };\n';
const SUFFIX = '\nconst retainedCustomerHistoryGuard = "identity,review,job brief,offer,prior customer rate,media permissions";\n';
const MODULE = PREFIX + SOURCE + SUFFIX;

function actualAssessment(patched = false) {
  assert.equal(RECOVERED_HELPER_SHA256, 'e997f2deefe4831a531c894af10bc3d7ba59d50172531342f5ca58fa4407d06e');
  assert.equal(digest(RECOVERED_HELPER_SOURCE), RECOVERED_HELPER_SHA256);
  // Execute the actual recovered function and its actual trusted helpers.
  // No evidence-validation helper is replaced by a test mock.
  const source = patched ? SOURCE.replace(BEFORE, AFTER) : SOURCE;
  return new Function(RECOVERED_HELPER_SOURCE + '\n' + source + '\nreturn Dc;')();
}

const CLIENT = 'client-one';
const MODEL = { id: 'model-one', fields: { unique_key: 'GWs37', working_name: 'Example model', folder_name: 'GWs37', nickname: 'Example' } };
const BRIEF = { date: '2026-11-04', time: '18:00', location: 'Bangkok', duration_hours: 2, work_lane: 'pn' };
function row(id, fields = {}) {
  return { id, fields: {
    decision: 'approve_service_history', review_status: 'approved', reviewed_by: 'per',
    reviewed_at: '2026-10-30T12:00:00+07:00', approved_service_amount_thb: 8000,
    Client: [CLIENT], 'LINE OFC Import Row': ['chat-' + id],
    approved_model_text: 'GWs37', approved_service_type: 'PN',
    approved_start_time: '2026-10-20T18:00:00+07:00', approved_end_time: '2026-10-20T20:00:00+07:00',
    approved_service_date: '2026-10-20', ...fields,
  } };
}

test('actual live assessment reproduces the same-customer two-chat bug and changes only readiness', () => {
  const rows = [row('one'), row('two', { approved_service_amount_thb: 9000, approved_service_date: '2026-10-25' }),
    row('other-model', { approved_model_text: 'other model', approved_service_amount_thb: 7000 })];
  const input = structuredClone({ rows, model: MODEL, client: CLIENT, brief: BRIEF });
  const before = actualAssessment()(rows, MODEL, CLIENT, BRIEF);
  const after = actualAssessment(true)(rows, MODEL, CLIENT, BRIEF);
  assert.equal(before.ready, false);
  assert.equal(after.ready, true);
  assert.deepEqual({ ...after, ready: before.ready }, before);
  assert.equal(after.customer_history_count, 3);
  assert.equal(after.comparison_count, 2);
  assert.equal(after.distinct_chat_count, 2);
  assert.equal(after.prior_customer_rate, 9000);
  assert.equal(after.min_rate, 8000);
  assert.equal(after.max_rate, 9000);
  assert.deepEqual({ rows, model: MODEL, client: CLIENT, brief: BRIEF }, input);
});

test('actual assessment still accepts the previously eligible two-customer evidence without changing customer context', () => {
  const rows = [row('one'), row('two', { Client: ['client-two'], approved_service_amount_thb: 9500 })];
  const before = actualAssessment()(rows, MODEL, CLIENT, BRIEF);
  const after = actualAssessment(true)(rows, MODEL, CLIENT, BRIEF);
  assert.equal(after.ready, true);
  assert.deepEqual(after, before);
  assert.equal(after.customer_history_count, 1);
  assert.equal(after.prior_customer_rate, 8000);
});

test('actual assessment still rejects one chat, duplicate source references and absent work lane', () => {
  const assess = actualAssessment(true);
  assert.equal(assess([row('one')], MODEL, CLIENT, BRIEF).ready, false);
  const duplicate = assess([row('one'), row('two', { 'LINE OFC Import Row': ['chat-one'] })], MODEL, CLIENT, BRIEF);
  assert.equal(duplicate.ready, false);
  assert.equal(duplicate.distinct_chat_count, 1);
  assert.equal(assess([row('one'), row('two')], MODEL, CLIENT, { ...BRIEF, work_lane: '' }).ready, false);
});

test('actual trusted checks still exclude unreviewed, invalid, mismatched Model/lane/duration evidence', () => {
  const assess = actualAssessment(true);
  const cases = [
    ['unreviewed', { review_status: 'pending' }],
    ['missing review status', { review_status: '' }],
    ['wrong reviewer', { reviewed_by: 'customer' }],
    ['invalid review date', { reviewed_at: 'not a date' }],
    ['unapproved decision', { decision: 'pending_service_history' }],
    ['zero amount', { approved_service_amount_thb: 0 }],
    ['negative amount', { approved_service_amount_thb: -8000 }],
    ['invalid amount', { approved_service_amount_thb: 'unknown' }],
    ['missing client link', { Client: [] }],
    ['ambiguous client links', { Client: [CLIENT, 'client-two'] }],
    ['missing chat source', { 'LINE OFC Import Row': [] }],
    ['different Model', { approved_model_text: 'GWs99' }],
    ['different work lane', { approved_service_type: 'Travel' }],
    ['different duration', { approved_end_time: '2026-10-20T21:00:00+07:00' }],
    ['invalid time', { approved_start_time: 'not a time' }],
  ];
  for (const [label, fields] of cases) {
    const rows = [row('one'), row('two', fields)];
    const before = actualAssessment()(rows, MODEL, CLIENT, BRIEF);
    const after = assess(rows, MODEL, CLIENT, BRIEF);
    assert.equal(after.ready, false, label);
    assert.deepEqual(after, before, label + ': unrelated assessment fields changed');
  }
});

test('the observed real function is immutable and exactly one expression changes in the complete module', () => {
  assert.equal(digest(SOURCE), BASELINE_FUNCTION_SHA256);
  const patched = patchOwnerPriceChatCount(MODULE, digest(MODULE));
  assert.equal(patched.code, PREFIX + SOURCE.replace(BEFORE, AFTER) + SUFFIX);
  assert.equal(patched.code.replace(AFTER, BEFORE), MODULE);
  assert.equal(patched.preservation.unrelated_runtime_bytes_unchanged, true);
  assert.equal(patched.preservation.remaining_evidence_checks_unchanged, true);
  assert.deepEqual(patched.preservation.functions, ['Dc']);
  assert.equal(patched.preservation.baseline_function_sha256, BASELINE_FUNCTION_SHA256);
  assert.equal(patched.preservation.candidate_sha256, digest(patched.code));
});

test('module/function drift, duplicate target, missing target and already corrected code stop', () => {
  assert.throws(() => patchOwnerPriceChatCount(MODULE, ''), /whole-module SHA-256 required/);
  assert.throws(() => patchOwnerPriceChatCount(MODULE + '// drift', digest(MODULE)), /whole-module drift/);
  const modified = MODULE.replace('approve_service_history', 'unreviewed_history');
  assert.throws(() => patchOwnerPriceChatCount(modified, digest(modified)), /exact reviewed price function/);
  const duplicated = MODULE + SOURCE;
  assert.throws(() => patchOwnerPriceChatCount(duplicated, digest(duplicated)), /must occur once/);
  const corrected = patchOwnerPriceChatCount(MODULE, digest(MODULE)).code;
  assert.throws(() => patchOwnerPriceChatCount(corrected, digest(corrected)), /exact reviewed price function/);
  assert.throws(() => validateRecoveredFunction(SOURCE.replace(BEFORE, AFTER)), /function drift/);
});

test('release requires fresh exact version, deployment, module and both reviewed digests', () => {
  const valid = { EXPECTED_VERSION: VERSION, EXPECTED_DEPLOYMENT: DEPLOYMENT,
    EXPECTED_MODULE: MODULE_NAME, EXPECTED_MODULE_SHA256: digest(MODULE),
    EXPECTED_FUNCTION_SHA256: BASELINE_FUNCTION_SHA256 };
  assert.deepEqual(validateExpectedInputs(valid), { version: VERSION, deployment: DEPLOYMENT,
    moduleName: MODULE_NAME, moduleDigest: digest(MODULE), functionDigest: BASELINE_FUNCTION_SHA256 });
  for (const key of Object.keys(valid)) assert.throws(() => validateExpectedInputs({ ...valid, [key]: '' }));
  for (const name of ['../worker.js', 'worker.mjs', 'other.js', '/tmp/worker.js']) {
    assert.throws(() => validateExpectedInputs({ ...valid, EXPECTED_MODULE: name }), /single worker.js/);
  }
  assert.throws(() => validateExpectedInputs({ ...valid, EXPECTED_FUNCTION_SHA256: 'a'.repeat(64) }), /function SHA-256/);
});

test('active source reader uses fixed GET, rejects extra modules and never accepts a different filename', async () => {
  const form = new FormData();
  form.set('worker.js', new Blob([MODULE], { type: 'application/javascript+module' }), 'worker.js');
  const result = await readActiveModule('fixture-token', async (url, init) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4' + ROOT + '/content/v2');
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    return new Response(form);
  });
  assert.deepEqual(result, { name: MODULE_NAME, code: MODULE });
  form.set('extra.js', new Blob(['extra']), 'extra.js');
  await assert.rejects(readActiveModule('fixture-token', async () => new Response(form)), /single-module/);
  form.delete('worker.js');
  await assert.rejects(readActiveModule('fixture-token', async () => new Response(form)), /filename/);
});

test('transport cannot mutate on inspection, write unrelated resources, or retry an uncertain write', async () => {
  let count = 0;
  const request = async (_url, init) => {
    count += 1;
    assert.equal(init.redirect, 'error');
    return Response.json({ success: true, result: { ok: true } });
  };
  const inspect = transport('fixture-token', { request });
  await assert.rejects(inspect(ROOT + '/deployments', { method: 'POST', body: '{}' }), /outside owner-price/);
  assert.equal(count, 0);
  assert.deepEqual(await inspect(ROOT + '/deployments'), { ok: true });
  const release = transport('fixture-token', { allowWrites: true, request });
  for (const [method, path] of [
    ['PATCH', ROOT + '/script-settings'], ['POST', ROOT + '/secrets'], ['PUT', ROOT],
    ['POST', ROOT + '/versions'], ['POST', '/zones/example/workers/routes'],
  ]) await assert.rejects(release(path, { method }), /outside owner-price/);
  assert.equal(count, 1);
  await release(ROOT + '/versions?bindings_inherit=strict', { method: 'POST', body: new FormData() });
  assert.equal(count, 2);
  let uncertain = 0;
  const broken = transport('fixture-token', { allowWrites: true, request: async () => {
    uncertain += 1; throw new Error('unknown write outcome');
  } });
  await assert.rejects(broken(ROOT + '/deployments', { method: 'POST', body: '{}' }), /without automatic retry/);
  assert.equal(uncertain, 1);
});

function inspectionFixture({ deploymentDrift = false, uploadDrift = false, module = MODULE } = {}) {
  const deployment = { id: DEPLOYMENT, strategy: 'percentage', versions: [{ version_id: VERSION, percentage: 100 }] };
  const version = { id: VERSION, resources: { script: { placement_mode: 'off' },
    script_runtime: { compatibility_date: '2026-10-01', compatibility_flags: [] },
    bindings: [{ name: 'TEST_SECRET', type: 'secret_text', text: 'SECRET_MUST_NOT_APPEAR' },
      { name: 'KENJI_OWNER_LINE_RULES_ENABLED', type: 'plain_text', text: 'true' },
      { name: 'KENJI_OWNER_LINE_FAQ_ENABLED', type: 'plain_text', text: 'false' }] } };
  let approvals = 0, deploymentsRead = 0, versionsRead = 0;
  const calls = [];
  return {
    io: { sha: 'a'.repeat(40), now: () => '2026-10-31T12:00:00Z',
      approve: async () => { approvals += 1; }, readModule: async () => ({ name: MODULE_NAME, code: module }),
      call: async (path, options) => {
        assert.equal(options, undefined, 'inspection must not send write options');
        calls.push(path);
        if (path === ROOT + '/deployments') {
          deploymentsRead += 1;
          return { deployments: [{ ...deployment, id: deploymentDrift && deploymentsRead > 1 ? OTHER : DEPLOYMENT }] };
        }
        if (path === ROOT + '/versions') {
          versionsRead += 1;
          return { items: [{ id: uploadDrift && versionsRead > 1 ? OTHER : VERSION }] };
        }
        if (path === ROOT + '/versions/' + VERSION) return version;
        throw new Error('unexpected inspection endpoint');
      } },
    approvals: () => approvals, calls,
  };
}

test('inspection returns sanitized exact provenance and rejects concurrent deployment/upload changes', async () => {
  const fixture = inspectionFixture();
  const report = await inspectBaseline(fixture.io);
  assert.equal(report.production_mutation, false);
  assert.equal(report.expected_version, VERSION);
  assert.equal(report.expected_deployment, DEPLOYMENT);
  assert.equal(report.expected_module_sha256, digest(MODULE));
  assert.equal(report.expected_function_sha256, BASELINE_FUNCTION_SHA256);
  assert.deepEqual(report.proposed_change, { before: BEFORE, after: AFTER });
  assert.equal(fixture.approvals(), 2);
  assert.doesNotMatch(JSON.stringify(report), /TEST_SECRET|SECRET_MUST_NOT_APPEAR/);
  await assert.rejects(inspectBaseline(inspectionFixture({ deploymentDrift: true }).io), /deployment changed/);
  await assert.rejects(inspectBaseline(inspectionFixture({ uploadDrift: true }).io), /latest upload changed/);
  await assert.rejects(inspectBaseline(inspectionFixture({ module: MODULE.replace(BEFORE, AFTER) }).io), /exact reviewed/);
});

test('build evidence keeps unchanged release toolchain checks and records the exact uploaded module', () => {
  const inputs = { code: new TextEncoder().encode(MODULE), releaseId: '123.1', nodeVersion: 'v22.21.1',
    wranglerVersion: '4.105.0', lockfile: new TextEncoder().encode('{}'), wranglerConfig: new TextEncoder().encode('{}') };
  const result = overlayBuildEvidence(inputs);
  assert.equal(result.artifact.modules[0].name, MODULE_NAME);
  assert.equal(result.artifact.digest.value, digest(MODULE));
  assert.throws(() => overlayBuildEvidence({ ...inputs, nodeVersion: 'v24.0.0' }), /unexpected Node/);
  assert.throws(() => overlayBuildEvidence({ ...inputs, wranglerVersion: '4.0.0' }), /unexpected Wrangler/);
});

test('workflow keeps protected manual release, matching main SHA, credentials out of contracts and no unrelated deployment', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-kenji-owner-price-chat-count.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(push|schedule|workflow_run):/m);
  assert.match(workflow, /environment: mmd-production-mutation/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /inputs\.approved_sha == github\.sha/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/admin-production-approval\.yml/);
  assert.match(workflow, /needs: \[production-approval, contracts\]/);
  assert.match(workflow, /node-version: '22\.21\.1'/);
  assert.match(workflow, /--inspect-approved/);
  assert.match(workflow, /--execute-approved/);
  assert.match(workflow, /EXPECTED_MODULE_SHA256/);
  assert.match(workflow, /EXPECTED_FUNCTION_SHA256/);
  assert.doesNotMatch(workflow.split('  production-approval:')[0], /secrets\./);
  assert.doesNotMatch(workflow, /wrangler(?:@[^ ]+)? (?:deploy|versions upload)|route[_ -]sync|mms-worker/);
});
