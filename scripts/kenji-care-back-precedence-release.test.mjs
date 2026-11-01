import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROOT, HANDLER, ANCHOR, GUARD_LINE, handlerPart, patchPrecedence,
  validateSourcePatch, validateExpectedInputs, transport, readActiveModule,
  inspectBaseline, overlayBuildEvidence,
} from './kenji-care-back-precedence-release.mjs';
import { digest } from './admin-held-viewer-code-only.mjs';

const VERSION = '11111111-1111-4111-8111-111111111111';
const DEPLOYMENT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const code = `const untouchedFlags = { modelOnly: true, modelPaused: false };
function careBackOctoberReply(intent) {
  return intent === 'care_back_new_member' ? { text: 'CARE BACK' } : null;
}
async function ${HANDLER}(raw, event) {
${ANCHOR}
  await readBooking();
  return 'named-model-booking';
}
const untouchedTail = 'unchanged';
`;
const hash = () => digest(handlerPart(code).text);

test('one guard preserves the async handler and every unrelated byte, and runs before booking work', async () => {
  const result = patchPrecedence(code, hash());
  assert.equal(result.preservation.unrelated_runtime_bytes_unchanged, true);
  assert.deepEqual(result.preservation.functions, [HANDLER]);
  assert.ok(result.code.includes(ANCHOR + GUARD_LINE + '\n'));
  assert.ok(handlerPart(result.code).text.startsWith('async function '));
  assert.equal(result.code.replace(GUARD_LINE + '\n', ''), code);
  let bookingReads = 0;
  const handler = new Function('inferLineIntent', 'readBooking', result.code + `\nreturn ${HANDLER};`)(
    raw => raw, async () => { bookingReads += 1; });
  assert.equal(await handler('care_back_new_member', {}), null);
  assert.equal(bookingReads, 0);
  assert.equal(await handler('named_model', {}), 'named-model-booking');
  assert.equal(bookingReads, 1);
});

test('reviewed digest, unique declarations/anchor, existing helper and unpatched baseline are mandatory', () => {
  assert.throws(() => patchPrecedence(code, ''), /SHA-256 required/);
  assert.throws(() => patchPrecedence(code.replace('await readBooking()', 'await otherRead()'), hash()), /handler drift/);
  assert.throws(() => patchPrecedence(code + handlerPart(code).text, hash()), /exactly one async/);
  assert.throws(() => handlerPart(code + handlerPart(code).text.replace('async function ', 'function ')), /declaration must be unique/);
  assert.throws(() => handlerPart(code.replace('async function ', 'function ')), /exactly one async/);
  const duplicateAnchor = code.replace(ANCHOR, ANCHOR + ANCHOR);
  assert.throws(() => patchPrecedence(duplicateAnchor, digest(handlerPart(duplicateAnchor).text)), /anchor must be unique/);
  assert.throws(() => patchPrecedence(code.replace('function careBackOctoberReply(', 'function unrelated('), hash()), /helper required once/);
  const patched = patchPrecedence(code, hash()).code;
  assert.throws(() => patchPrecedence(patched, digest(handlerPart(patched).text)), /already present/);
});

test('source guard must use the approved helper and precede any booking/runtime work', () => {
  const importLine = `import { careBackOctoberReply } from './kenji-care-back-october.mjs';\n`;
  const source = importLine + patchPrecedence(code, hash()).code;
  assert.equal(validateSourcePatch(source), true);
  assert.throws(() => validateSourcePatch(source.replace(importLine, '')), /source must import/);
  assert.throws(() => validateSourcePatch(source.replace(ANCHOR + GUARD_LINE, ANCHOR + '  await readBooking();\n' + GUARD_LINE)), /precede runtime and booking/);
  assert.throws(() => validateSourcePatch(source.replace(GUARD_LINE, GUARD_LINE + '\n' + GUARD_LINE)), /guard must be unique/);
});

test('release requires all four exact inspection values and rejects path-shaped module names', () => {
  const valid = { EXPECTED_VERSION: VERSION, EXPECTED_DEPLOYMENT: DEPLOYMENT,
    EXPECTED_HANDLER_SHA256: hash(), EXPECTED_MODULE: 'worker.js' };
  assert.deepEqual(validateExpectedInputs(valid), { version: VERSION, deployment: DEPLOYMENT,
    handlerDigest: hash(), moduleName: 'worker.js' });
  for (const key of Object.keys(valid)) assert.throws(() => validateExpectedInputs({ ...valid, [key]: '' }));
  for (const value of ['../worker.js', '/tmp/worker.js', 'worker.js?query=1', 'metadata', '*.js']) {
    assert.throws(() => validateExpectedInputs({ ...valid, EXPECTED_MODULE: value }), /module filename required/);
  }
});

test('read-only transport cannot upload or promote, and all transports forbid unrelated writes', async () => {
  let requests = 0;
  const request = async (url, init) => {
    requests += 1;
    assert.equal(init.redirect, 'error');
    return Response.json({ success: true, result: { ok: true } });
  };
  const inspect = transport('test-only-token', { request });
  for (const path of [ROOT + '/versions?bindings_inherit=strict', ROOT + '/deployments']) {
    await assert.rejects(inspect(path, { method: 'POST' }), /outside CARE BACK/);
  }
  assert.equal(requests, 0);
  assert.deepEqual(await inspect(ROOT + '/deployments'), { ok: true });
  const release = transport('test-only-token', { allowWrites: true, request });
  for (const [method, path] of [
    ['PATCH', ROOT + '/script-settings'], ['POST', ROOT + '/secrets'], ['PUT', ROOT],
    ['GET', ROOT.replace('member-dashboard-chat-worker', 'admin-worker') + '/deployments'],
    ['POST', ROOT + '/versions'], ['POST', '/zones/example/workers/routes'],
  ]) await assert.rejects(release(path, { method }), /outside CARE BACK/);
  assert.equal(requests, 1);
  assert.deepEqual(await release(ROOT + '/versions?bindings_inherit=strict', { method: 'POST', body: new FormData() }), { ok: true });
  assert.equal(requests, 2);
});

test('transport never retries failed reads or ambiguous writes', async () => {
  let attempts = 0;
  const release = transport('test-only-token', { allowWrites: true, request: async () => {
    attempts += 1; throw new Error('unknown transport result');
  } });
  await assert.rejects(release(ROOT + '/deployments', { method: 'POST', body: '{}' }), /without automatic retry/);
  assert.equal(attempts, 1);
});

test('active module reader uses only fixed GET and accepts one observed JavaScript module', async () => {
  const form = new FormData();
  form.set('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');
  const module = await readActiveModule('test-only-token', async (url, init) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4' + ROOT + '/content/v2');
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    return new Response(form);
  });
  assert.deepEqual(module, { name: 'worker.js', code });
  form.set('second.js', new Blob(['extra']), 'second.js');
  await assert.rejects(readActiveModule('test-only-token', async () => new Response(form)), /single-module/);
  await assert.rejects(readActiveModule('test-only-token', async () => new Response('', { status: 403 })), /active module read failed/);
});

function inspectionFixture({ deploymentDrift = false, uploadDrift = false } = {}) {
  const deployment = { id: DEPLOYMENT, strategy: 'percentage', versions: [{ version_id: VERSION, percentage: 100 }] };
  const version = { id: VERSION, resources: { script: { placement_mode: 'off' },
    script_runtime: { compatibility_date: '2026-10-01', compatibility_flags: [] },
    bindings: [{ name: 'TEST_SECRET', type: 'secret_text', text: 'NEVER_OUTPUT_THIS_VALUE' }] } };
  let approvals = 0, deploymentsRead = 0, versionsRead = 0;
  const calls = [];
  return {
    io: {
      sha: 'a'.repeat(40), now: () => '2026-10-31T09:30:00Z',
      approve: async () => { approvals += 1; }, readModule: async () => ({ name: 'worker.js', code }),
      call: async (path, options) => {
        assert.equal(options, undefined, 'inspection must never supply a mutation');
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
      },
    },
    approvals: () => approvals, calls,
  };
}

test('inspection returns only sanitized exact baseline inputs, checks readback, and never writes', async () => {
  const fixture = inspectionFixture();
  const report = await inspectBaseline(fixture.io);
  assert.equal(report.production_mutation, false);
  assert.equal(report.expected_version, VERSION);
  assert.equal(report.expected_deployment, DEPLOYMENT);
  assert.equal(report.expected_module, 'worker.js');
  assert.equal(report.expected_handler_sha256, hash());
  assert.equal(report.guard_already_present, false);
  assert.equal(fixture.approvals(), 2);
  assert.equal(fixture.calls.length, 6);
  assert.doesNotMatch(JSON.stringify(report), /TEST_SECRET|NEVER_OUTPUT_THIS_VALUE/);
});

test('inspection refuses concurrent deployment/upload drift and active split traffic', async () => {
  await assert.rejects(inspectBaseline(inspectionFixture({ deploymentDrift: true }).io), /deployment changed/);
  await assert.rejects(inspectBaseline(inspectionFixture({ uploadDrift: true }).io), /latest upload changed/);
  const fixture = inspectionFixture();
  const originalCall = fixture.io.call;
  fixture.io.call = async path => path.endsWith('/deployments')
    ? { deployments: [{ id: DEPLOYMENT, strategy: 'percentage', versions: [{ version_id: VERSION, percentage: 50 }, { version_id: OTHER, percentage: 50 }] }] }
    : originalCall(path);
  await assert.rejects(inspectBaseline(fixture.io), /split traffic/);
});

test('build evidence names the exact uploaded module without weakening pinned toolchain checks', () => {
  const inputs = { code: new TextEncoder().encode(code), releaseId: '123.1', nodeVersion: 'v22.21.1',
    wranglerVersion: '4.105.0', lockfile: new TextEncoder().encode('{}'), wranglerConfig: new TextEncoder().encode('{}') };
  const evidence = overlayBuildEvidence(inputs);
  assert.equal(evidence.artifact.modules[0].name, 'worker.js');
  assert.equal(evidence.artifact.digest.value, digest(code));
  assert.equal(evidence.artifact.module_manifest_digest.algorithm, 'sha256');
  assert.throws(() => overlayBuildEvidence({ ...inputs, nodeVersion: 'v24.0.0' }), /unexpected Node/);
  assert.throws(() => overlayBuildEvidence({ ...inputs, wranglerVersion: '4.0.0' }), /unexpected Wrangler/);
});

test('workflow keeps manual protected production gates and runs actual precedence regression', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-kenji-care-back-precedence.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(push|schedule):/m);
  assert.match(workflow, /environment: mmd-production-mutation/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /inputs\.approved_sha == github\.sha/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/admin-production-approval\.yml/);
  assert.match(workflow, /needs: \[production-approval, contracts\]/);
  assert.match(workflow, /node-version: '22'/);
  assert.match(workflow, /member-dashboard-chat-worker\/test\/kenji-care-back-booking-precedence\.test\.mjs/);
  assert.match(workflow, /member-dashboard-chat-worker\/test\/kenji-care-back-october\.test\.mjs/);
  assert.match(workflow, /member-dashboard-chat-worker\/test\/kenji-model-only-owner-lock\.test\.mjs/);
  assert.match(workflow, /inspect\) node scripts\/kenji-care-back-precedence-release\.mjs --inspect-approved/);
  assert.match(workflow, /release\) node scripts\/kenji-care-back-precedence-release\.mjs --execute-approved/);
});
