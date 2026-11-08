import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyImmigrateMutation } from './immigrate-production-gate.mjs';
import { applyRoutePlan, buildRoutePlan, readApprovedRoutePlan, routePlanDigest } from './immigrate-worker-route-plan.mjs';

const sha = 'a'.repeat(40);
const scope = 'member-intelligence';
const worker = 'immigrate-worker';
const route = (pattern, id = '1'.repeat(32), script = worker) => ({ pattern, id, script });
const required = [
  route('mmdbkk.com/internal/admin/control-room*'),
  route('www.mmdbkk.com/internal/admin/control-room*', '2'.repeat(32)),
];
const obsolete = route('mmdbkk.com/a/member-intelligence.js', '3'.repeat(32));
const foreign = route('www.mmdbkk.com/a/member-intelligence.js', '4'.repeat(32), 'another-worker');
const routes = [...required, obsolete, foreign];
const plan = buildRoutePlan({ sha, scope, routes });

function cloudflare(initial) {
  let current = structuredClone(initial);
  const methods = [];
  const request = async (url, options) => {
    assert.match(url, /^https:\/\/api\.cloudflare\.com\/client\/v4\/zones\/[^/]+\/workers\/routes(?:\/[^/]+)?$/);
    methods.push(options.method);
    if (options.method === 'DELETE') current = current.filter(row => row.id !== url.split('/').at(-1));
    if (options.method === 'POST') current.push({ id: 'f'.repeat(32), ...JSON.parse(options.body) });
    return Response.json({ success: true, result: current });
  };
  return { request, methods, current: () => current };
}

test('the route plan binds exact scoped operations, IDs and SHA to its digest', () => {
  assert.deepEqual(plan, { sha, scope, add: [], remove: [{ pattern: obsolete.pattern, id: obsolete.id }] });
  const input = { sha, scope, json: JSON.stringify(plan), digest: routePlanDigest(plan) };
  assert.deepEqual(readApprovedRoutePlan(input), plan);
  assert.throws(() => readApprovedRoutePlan({ ...input, sha: 'b'.repeat(40) }), /SHA differs/);
  assert.throws(() => readApprovedRoutePlan({ ...input, digest: '0'.repeat(64) }), /digest differs/);
  assert.throws(() => readApprovedRoutePlan({ ...input, json: JSON.stringify({ ...plan, remove: [...plan.remove, ...plan.remove] }) }), /duplicate/);
  assert.throws(() => readApprovedRoutePlan({ ...input, json: JSON.stringify({ ...plan, remove: [route('mmdbkk.com/internal/admin/mms*')] }) }), /outside scope/);
  assert.throws(() => buildRoutePlan({ sha, scope, routes: [required[0], obsolete] }), /required route ownership/);
});

test('an approved plan deletes only its old Worker-owned route', async () => {
  const fixture = cloudflare(routes);
  const result = await applyRoutePlan({ plan, token: 'test', authorize: async () => {}, request: fixture.request });
  assert.equal(result.removed, 1);
  assert.deepEqual(fixture.current(), [...required, foreign]);
  assert.equal(fixture.methods.filter(method => method === 'DELETE').length, 1);
  assert.ok(!fixture.methods.includes('POST'));
});

test('CEO route plan creates only missing exact routes and refuses foreign ownership', async () => {
  const ceo = 'mmdbkk.com/internal/ceo*';
  const current = [route(ceo)];
  const ceoPlan = buildRoutePlan({ sha, scope: 'ceo', routes: current });
  assert.deepEqual(ceoPlan.add, ['www.mmdbkk.com/internal/ceo*']);
  const fixture = cloudflare(current);
  assert.equal((await applyRoutePlan({ plan: ceoPlan, token: 'test', authorize: async () => {}, request: fixture.request })).added, 1);
  assert.equal(fixture.methods.filter(method => method === 'POST').length, 1);
  assert.throws(() => buildRoutePlan({ sha, scope: 'ceo', routes: [route(ceo, '1'.repeat(32), 'another-worker')] }), /route ownership conflict/);
});

test('a changed obsolete owner or route ID requires a new approval and writes nothing', async () => {
  for (const altered of [{ ...obsolete, id: 'f'.repeat(32) }, { ...obsolete, script: 'another-worker' }]) {
    const fixture = cloudflare([...required, altered, foreign]);
    await assert.rejects(applyRoutePlan({ plan, token: 'test', authorize: async () => {}, request: fixture.request }), /differ from the approved plan/);
    assert.ok(fixture.methods.every(method => method === 'GET'));
  }
});

test('push and rerun never reach the Cloudflare route client', async () => {
  for (const [event, attempt] of [['push', '1'], ['workflow_dispatch', '2']]) {
    const fixture = cloudflare(routes);
    await assert.rejects(applyRoutePlan({
      plan, token: 'test', request: fixture.request,
      authorize: () => verifyImmigrateMutation({
        GITHUB_REPOSITORY: 'MMD-Prive/mmd-workers', GITHUB_EVENT_NAME: event, GITHUB_RUN_ATTEMPT: attempt,
      }),
    }), /manual dispatch|required|production reruns/);
    assert.deepEqual(fixture.methods, []);
  }
});
