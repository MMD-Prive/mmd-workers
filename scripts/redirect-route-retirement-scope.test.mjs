import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRetirementScope, selectRetirementRoutes, assertRouteStillApproved, selectRollbackRoutes } from './redirect-route-retirement-scope.mjs';
const route = { id: 'a'.repeat(32), pattern: 'fixture.invalid/legacy/*', script: 'mmd-redirect-worker' };
const scope = () => ({ zone: 'c'.repeat(32), script: route.script, approval_ref: 'fixture-approval', routes: [{ ...route }] });
const context = { zone: 'c'.repeat(32), approvalRef: 'fixture-approval' };
for (const [name, value] of [
  ['missing manifest', null], ['wrong zone', { ...scope(), zone: 'other' }],
  ['wrong approval', { ...scope(), approval_ref: 'other' }], ['empty scope', { ...scope(), routes: [] }],
  ['wrong script', { ...scope(), script: 'other-worker' }],
  ['duplicate scope', { ...scope(), routes: [route, route] }],
]) test(name + ' stops before route selection', () => assert.throws(() => validateRetirementScope(value, context)));
for (const [name, inventory] of [
  ['owner drift', [{ ...route, script: 'other-worker' }]],
  ['pattern drift', [{ ...route, pattern: 'fixture.invalid/other/*' }]],
  ['extra legacy route', [route, { ...route, id: 'b'.repeat(32) }]],
  ['missing inventory', null],
]) test(name + ' blocks deletion scope', () => assert.throws(() => selectRetirementRoutes(scope(), inventory)));
test('exact scope selects only the approved route', () => {
  const approved = validateRetirementScope(scope(), context);
  assert.deepEqual(selectRetirementRoutes(approved, [route, { ...route, id: 'b'.repeat(32), script: 'other-worker' }]), [route]);
});

test('workflow validates scope before Cloudflare work and selects exact inventory before DELETE', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../.github/workflows/retire-mmd-redirect-worker-production.yml', import.meta.url), 'utf8');
  assert.ok(source.indexOf('Require owner-approved exact route manifest') < source.indexOf('Preflight replacement surfaces'));
  assert.ok(source.indexOf('selectRetirementRoutes(scope, routes)') < source.indexOf('method: "DELETE"'));
  assert.match(source, /validateRetirementScope\(scope, \{ zone: process.env.CLOUDFLARE_ZONE_ID, approvalRef: process.env.APPROVAL_REF \}\)/);
});

for (const [name, live] of [
  ['owner changed immediately before deletion', [{ ...route, script: 'other-worker' }]],
  ['pattern changed immediately before deletion', [{ ...route, pattern: 'fixture.invalid/changed/*' }]],
  ['route disappeared before deletion', []],
]) test(name + ' stops deletion', () => assert.throws(() => assertRouteStillApproved(scope(), route, live)));
test('rechecked exact route remains eligible', () => assertRouteStillApproved(scope(), route, [route]));
test('rollback selects only confirmed deletions, never the whole planned snapshot', () => {
  const other = { ...route, id: 'b'.repeat(32), pattern: 'fixture.invalid/second/*' };
  const approved = { ...scope(), routes: [route, other] };
  assert.deepEqual(selectRollbackRoutes(approved, [route], []), [route]);
  assert.deepEqual(selectRollbackRoutes(approved, [], []), []);
});
test('rollback never overwrites a changed owner or recreated route', () => {
  assert.deepEqual(selectRollbackRoutes(scope(), [route], [{ ...route, script: 'other-worker' }]), []);
  assert.deepEqual(selectRollbackRoutes(scope(), [route], [{ ...route, id: 'b'.repeat(32) }]), []);
});
test('forged or duplicated deletion journal fails before rollback writes', () => {
  assert.throws(() => selectRollbackRoutes(scope(), [{ ...route, id: 'b'.repeat(32) }], []));
  assert.throws(() => selectRollbackRoutes(scope(), [route, route], []));
});
test('workflow journals confirmed DELETEs and rechecks each mutation', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../.github/workflows/retire-mmd-redirect-worker-production.yml', import.meta.url), 'utf8');
  assert.ok(source.indexOf('assertRouteStillApproved(scope, route, inventory)') < source.indexOf('method: "DELETE"'));
  assert.ok(source.indexOf('deleted.push(') > source.indexOf('if (!response.ok || payload?.success !== true)', source.indexOf('method: "DELETE"')));
  const rollback = source.slice(source.indexOf('- name: Roll back only confirmed deletions'));
  assert.doesNotMatch(rollback, /readFileSync[^\n]*snapshot.json/);
  assert.ok(rollback.indexOf('selectRollbackRoutes(scope, snapshot, routes)') < rollback.indexOf('method: "POST"'));
});

for (const [name, routes] of [
  ['invalid exact route ID', [{ ...route, id: 'not-an-id' }]],
  ['empty pattern', [{ ...route, pattern: '' }]],
  ['duplicate IDs with distinct patterns', [route, { ...route, pattern: 'fixture.invalid/second/*' }]],
  ['duplicate patterns with distinct IDs', [route, { ...route, id: 'b'.repeat(32) }]],
  ['route owner disagrees with manifest', [{ ...route, script: 'other-worker' }]],
]) test(name + ' rejects the manifest', () => {
  assert.throws(() => validateRetirementScope({ ...scope(), routes }, context));
});
