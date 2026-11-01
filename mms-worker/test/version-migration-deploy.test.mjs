import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadMmsVersion } from '../../scripts/upload-mms-worker-version.mjs';
const config = { name: 'mms-worker', migrations: [{ tag: 'v3-relax-spa-ledger', new_sqlite_classes: ['RelaxSpaLedger'] }] };
const migration = { status: 1, output: 'Version upload failed. You attempted to upload a version of a Worker that includes a Durable Object migration, but migrations must be fully applied via a non-versioned deployment. [code: 10211]' };
function run(responses, overrides = {}) {
  const calls = [];
  const result = uploadMmsVersion({ config, tag: 'gha-fixture', message: 'fixture', secretsFile: '/tmp/mms-test.env', ...overrides, run(args) { calls.push(args); return responses.shift(); } });
  return { result, calls };
}
test('ordinary version uploads never perform a direct deployment', () => {
  const { calls, result } = run([{ status: 0, output: 'Worker Version ID: ordinary' }]);
  assert.equal(calls.length, 1); assert.equal(result.migrationApplied, false);
});
test('confirmed migration applies with identical secrets and retained vars, then uploads the promotable version', () => {
  const { calls, result } = run([migration, { status: 0, output: 'Current Version ID: direct' }, { status: 0, output: 'Worker Version ID: promotable' }], {allowMigration:true});
  assert.deepEqual(calls[1], ['deploy', '--keep-vars', '--env=', '--message', 'fixture', '--secrets-file', '/tmp/mms-test.env']);
  assert.ok(calls[1].includes('--keep-vars')); assert.equal(calls[1].at(-1), '/tmp/mms-test.env');
  assert.ok(!calls[1].includes('--tag')); assert.deepEqual(calls[1].slice(3, 5), ['--message', 'fixture']);
  assert.deepEqual(calls[0], calls[2]); assert.equal(result.output, 'Worker Version ID: promotable');
  assert.equal(result.migrationApplied, true);
});
test('authorization, network, and loosely matching errors cannot trigger direct deployment even when migration opt-in is set', () => {
  for (const output of ['Authentication error [code: 10000]', 'Network error', 'migration [code: 10211]']) {
    let calls = 0;
    assert.throws(() => uploadMmsVersion({ config, allowMigration: true, run() { calls++; return { status: 1, output }; } }), /refusing direct deploy/);
    assert.equal(calls, 1);
  }
});
test('route mutation and wrong-worker configurations are rejected before any upload or migration fallback', () => {
  for (const invalid of [{ ...config, routes: [{ pattern: '*/*' }] }, { ...config, route: '*/*' }, { ...config, triggers: { crons: ['* * * * *'] } }, { ...config, name: 'other-worker' }]) {
    assert.throws(() => run([migration], { config: invalid, allowMigration: true }), /route-free/);
  }
});
test('failed direct migration cannot upload or promote another version', () => {
  let calls = 0;
  assert.throws(() => uploadMmsVersion({ config, allowMigration:true, run() { calls++; return calls === 1 ? migration : { status: 1, output: 'deploy failed' }; } }), /migration deployment failed/);
  assert.equal(calls, 2);
});
test('failed post-migration upload cannot masquerade as successful version upload', () => {
  assert.throws(() => run([migration, { status: 0, output: 'direct' }, { status: 1, output: 'network failure' }], {allowMigration:true}), /after migration deployment/);
});


test('normal code-only release refuses even a confirmed migration without direct deployment',()=>{
 let calls=0;
 assert.throws(()=>uploadMmsVersion({config,run(){calls++;return migration;}}),/separate explicit approval; refusing direct deploy/);
 assert.equal(calls,1);
});
