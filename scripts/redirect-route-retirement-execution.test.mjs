import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as guards from './redirect-route-retirement-scope.mjs';
const source = await readFile(new URL('../.github/workflows/retire-mmd-redirect-worker-production.yml', import.meta.url), 'utf8');
const route = { id: 'a'.repeat(32), pattern: 'fixture.invalid/legacy/*', script: 'mmd-redirect-worker' };
async function execute({ drift = false, rollback = false, occupied = false, missingScope = false, malformedScope = false, extraLive = false, ambiguousDelete = false, journalFailure = false, pending = false, rollbackFailure = false, rollbackReadbackFailure = false } = {}) {
  const scope = { zone: 'c'.repeat(32), script: route.script, approval_ref: 'fixture', routes: [route] };
  const files = new Map([['ops/approved-mmd-redirect-retirement.json', JSON.stringify(scope)]]);
  if (malformedScope) files.set('ops/approved-mmd-redirect-retirement.json', '{bad-json');
  if (missingScope) files.delete('ops/approved-mmd-redirect-retirement.json');
  if (pending) files.set('/fixture/mmd-redirect-routes.pending.json', JSON.stringify({ route }));
  if (rollback) files.set('/fixture/mmd-redirect-routes.deleted.json', JSON.stringify([route]));
  const calls = []; let reads = 0, removed = false, restored = false;
  const context = vm.createContext({
    process: { env: { CLOUDFLARE_ZONE_ID: scope.zone, CLOUDFLARE_ROUTES_API_TOKEN: 'fixture', RUNNER_TEMP: '/fixture', GITHUB_OUTPUT: '/fixture/output', APPROVAL_REF: 'fixture' } },
    console: { log() {}, error() {} },
    fetch: async (url, options = {}) => {
      const method = options.method || 'GET'; calls.push(method);
      if (method === 'GET') {
        reads++;
        let inventory = rollback ? (occupied ? [{ ...route, script: 'other-worker' }] : restored && !rollbackReadbackFailure ? [{ ...route, id: 'd'.repeat(32) }] : [])
          : removed ? [] : [{ ...route, script: drift && reads > 1 ? 'other-worker' : route.script }];
        if (extraLive && reads > 1 && !removed) inventory.push({ ...route, id: 'b'.repeat(32), pattern: 'fixture.invalid/extra/*' });
        return { ok: true, json: async () => ({ success: true, result: inventory }) };
      }
      if (method === 'POST' && rollbackFailure) return { ok: false, json: async () => ({ success: false }) };
      if (method === 'POST') restored = true;
      if (method === 'DELETE') { removed = true; if (ambiguousDelete) throw Error('fixture connection lost after DELETE'); }
      return { ok: true, json: async () => ({ success: true }) };
    },
  });
  const synthetic = values => new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
  const guardModule = synthetic(guards); await guardModule.link(() => {}); await guardModule.evaluate();
  const fs = { existsSync: path => files.has(path), unlinkSync: path => files.delete(path), readFileSync: path => { if (!files.has(path)) throw Error('missing fixture'); return files.get(path); }, writeFileSync: (path, value) => { if (journalFailure && removed && path.endsWith('.deleted.json')) throw Error('fixture journal disk failure'); files.set(path, value); }, appendFileSync() {} };
  const title = rollback ? '- name: Roll back only confirmed deletions' : '- name: Snapshot and retire exact approved';
  const section = source.slice(source.indexOf(title));
  const inline = section.match(/          node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/)[1].replace(/^          /gm, '');
  const module = new vm.SourceTextModule(inline, { context, importModuleDynamically: async () => guardModule });
  await module.link(() => synthetic({ default: fs }));
  let error;
  try { await module.evaluate(); } catch (e) { error = e; }
  return { calls, files, error };
}
test('actual deletion step writes confirmed journal only after approved DELETE', async () => {
  const result = await execute(); assert.ifError(result.error);
  assert.deepEqual(result.calls, ['GET', 'GET', 'DELETE', 'GET']);
  assert.deepEqual(JSON.parse(result.files.get('/fixture/mmd-redirect-routes.deleted.json')), [route]);
});
test('actual deletion step detects owner drift before DELETE', async () => {
  const result = await execute({ drift: true }); assert.ok(result.error);
  assert.ok(!result.calls.includes('DELETE'));
  assert.deepEqual(JSON.parse(result.files.get('/fixture/mmd-redirect-routes.deleted.json')), []);
});
test('actual rollback step skips a route now owned by another Worker', async () => {
  const result = await execute({ rollback: true, occupied: true }); assert.ifError(result.error);
  assert.ok(!result.calls.includes('POST'));
});
test('actual rollback step restores confirmed absent route only', async () => {
  const result = await execute({ rollback: true }); assert.ifError(result.error);
  assert.equal(result.calls.filter(method => method === 'POST').length, 1);
});

test('deletion step rejects missing scope before network access', async () => {
  const result = await execute({ missingScope: true }); assert.ok(result.error);
  assert.deepEqual(result.calls, []);
});
test('extra legacy route introduced before DELETE blocks mutation', async () => {
  const result = await execute({ extraLive: true }); assert.ok(result.error);
  assert.ok(!result.calls.includes('DELETE'));
});
for (const [name, options] of [
  ['ambiguous DELETE response', { ambiguousDelete: true }],
  ['confirmed DELETE followed by journal failure', { journalFailure: true }],
]) test(name + ' retains pending evidence for manual reconciliation', async () => {
  const result = await execute(options); assert.ok(result.error);
  assert.ok(result.files.has('/fixture/mmd-redirect-routes.pending.json'));
  assert.equal(result.calls.filter(method => method === 'DELETE').length, 1);
  assert.ok(!result.calls.includes('POST'));
});

test('pending DELETE evidence blocks actual rollback before network or restore', async () => {
  const result = await execute({ rollback: true, pending: true }); assert.ok(result.error);
  assert.deepEqual(result.calls, []);
});
test('actual rollback POST failure is reported as a failure', async () => {
  const result = await execute({ rollback: true, rollbackFailure: true }); assert.ok(result.error);
  assert.equal(result.calls.filter(method => method === 'POST').length, 1);
});

test('successful rollback POST without matching readback remains a failure', async () => {
  const result = await execute({ rollback: true, rollbackReadbackFailure: true }); assert.ok(result.error);
  assert.equal(result.calls.filter(method => method === 'POST').length, 1);
});

test('malformed manifest stops actual deletion step before network', async () => {
  const result = await execute({ malformedScope: true }); assert.ok(result.error);
  assert.deepEqual(result.calls, []);
});
