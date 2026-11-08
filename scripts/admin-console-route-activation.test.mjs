import assert from 'node:assert/strict';
import test from 'node:test';
import { ROOT, ZONE } from './admin-current-session-code-only.mjs';
import { activateConsoleRoutes, createConsoleRoutesTransport, validateConsoleRouteBaseline,
  CONSOLE_ROUTES_PATH, CONSOLE_ROUTE_PATTERNS } from './admin-console-route-activation.mjs';

// All inventories, credentials and deployment identifiers here are synthetic.
const routeId = n => n.toString(16).padStart(32, '0');
const uuid = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const clone = value => structuredClone(value);
const timestamp = '2026-11-08T10:00:00.000Z';
const baseline = () => [
  { id: routeId(1), pattern: 'mmdbkk.com/v1/admin/*', script: 'admin-worker' },
  { id: routeId(2), pattern: 'www.mmdbkk.com/internal/admin/*', script: null, metadata: { preserved: true } },
];
const expectedDeployment = () => ({ id: uuid(1), strategy: 'percentage',
  versions: [{ version_id: uuid(2), percentage: 100 }] });

function fixture(options = {}) {
  const f = { live: baseline(), currentDeployment: expectedDeployment(), calls: [], receipts: [], trace: [],
    routeReads: 0, deploymentReads: 0, approvals: 0, posts: 0 };
  f.io = {
    baselineRoutes: baseline(), expectedDeployment: expectedDeployment(), now: () => timestamp,
    approve: async () => {
      f.approvals++; f.trace.push('approve');
      await options.approve?.(f);
    },
    save: async receipt => {
      await options.save?.(receipt, f);
      f.trace.push('receipt:' + receipt.phase);
      f.receipts.push(clone(receipt));
    },
    readDeployment: async () => {
      f.deploymentReads++; f.trace.push('deployment');
      await options.beforeDeployment?.(f);
      return clone(f.currentDeployment);
    },
    callRoutes: async (path, init = {}) => {
      assert.equal(path, CONSOLE_ROUTES_PATH);
      const method = init.method || 'GET';
      f.calls.push({ path, method, body: init.body }); f.trace.push(method);
      if (method === 'GET') {
        f.routeReads++;
        await options.beforeRoutes?.(f);
        // The Cloudflare list order is not a release invariant.
        return clone(f.live).reverse();
      }
      assert.equal(method, 'POST');
      f.posts++;
      assert.equal(f.receipts.at(-1).phase, 'route-create-attempted-outcome-unknown');
      const body = JSON.parse(init.body);
      const added = { id: routeId(100 + f.posts), ...body };
      f.live.push(clone(added));
      return options.postResponse ? options.postResponse(added, f) : clone(added);
    },
  };
  return f;
}

test('pure baseline validator preserves complete records and rejects no unrelated broad routes', () => {
  const routes = baseline().concat(
    { id: routeId(3), pattern: 'mmdbkk.com/internal/admin/console-extra*', script: 'other-worker' },
    { id: routeId(4), pattern: 'other.example/internal/admin/console*', script: null },
    { id: routeId(5), pattern: 'mmdbkk.com/*' },
  );
  const validated = validateConsoleRouteBaseline(routes);
  assert.deepEqual(validated, routes);
  validated[1].metadata.preserved = false;
  assert.equal(routes[1].metadata.preserved, true, 'snapshot must not retain input references');
});

for (const pattern of [
  ...CONSOLE_ROUTE_PATTERNS,
  'mmdbkk.com/internal/admin/console',
  'https://mmdbkk.com/internal/admin/console',
  'http://www.mmdbkk.com/internal/admin/console/',
  'www.mmdbkk.com/internal/admin/console/*',
  '*://www.mmdbkk.com/internal/admin/console*',
  '*.mmdbkk.com/internal/admin/console/',
  '*mmdbkk.com/internal/admin/console*',
  'https://MMDBKK.COM/internal/admin/console',
  'mmdbkk.com/internal/admin/%63onsole/',
]) test(`baseline rejects Console shadow ${pattern}, including no-script exclusions`, () => {
  for (const script of ['admin-worker', 'other-worker', null, undefined]) {
    const route = { id: routeId(3), pattern, ...(script === undefined ? {} : { script }) };
    assert.throws(() => validateConsoleRouteBaseline(baseline().concat(route)), { code: 'EXISTING_CONSOLE_ROUTE' });
  }
});

for (const [name, routes] of [
  ['missing array', null],
  ['missing route ID', [{ pattern: 'mmdbkk.com/*', script: null }]],
  ['duplicate ID', baseline().concat({ ...baseline()[1], id: routeId(1) })],
  ['duplicate pattern', baseline().concat({ ...baseline()[0], id: routeId(3), script: 'other-worker' })],
  ['non-JSON metadata', baseline().concat({ id: routeId(3), pattern: 'other.example/*', metadata: undefined })],
]) test(`baseline rejects ${name}`, () => {
  assert.throws(() => validateConsoleRouteBaseline(routes));
});

test('creates only two routes after approvals, journals IDs before reads, and verifies exact full inventory', async () => {
  const f = fixture();
  const result = await activateConsoleRoutes(f.io);
  assert.equal(result.phase, 'complete');
  assert.equal(result.worker_root, ROOT);
  assert.equal(result.zone, ZONE);
  assert.equal(result.write_attempts, 2);
  assert.equal(result.verified_route_count, 2);
  assert.equal(result.baseline_routes.count, 2);
  assert.equal(result.last_verified_inventory.count, 4);
  assert.match(result.baseline_routes.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.expected_deployment, expectedDeployment());
  assert.deepEqual(result.created_routes, CONSOLE_ROUTE_PATTERNS.map((pattern, i) => ({
    id: routeId(101 + i), pattern, script: 'admin-worker',
  })));
  assert.deepEqual(f.calls.filter(call => call.method === 'POST').map(call => JSON.parse(call.body)),
    CONSOLE_ROUTE_PATTERNS.map(pattern => ({ pattern, script: 'admin-worker' })));
  assert.deepEqual(f.live.slice(0, 2), baseline());
  assert.deepEqual(f.io.baselineRoutes, baseline());
  assert.equal(f.approvals, 2);
  assert.equal(f.deploymentReads, 4);
  assert.equal(f.routeReads, 4);
  assert.deepEqual(f.trace, [
    'receipt:preflight',
    'approve', 'GET', 'deployment', 'receipt:route-create-attempted-outcome-unknown', 'POST',
    'receipt:route-created-not-yet-verified', 'GET', 'deployment', 'receipt:route-created-and-verified',
    'approve', 'GET', 'deployment', 'receipt:route-create-attempted-outcome-unknown', 'POST',
    'receipt:route-created-not-yet-verified', 'GET', 'deployment', 'receipt:route-created-and-verified',
    'receipt:complete',
  ]);
  const partial = f.receipts.find(receipt => receipt.phase === 'route-created-not-yet-verified');
  assert.equal(partial.created_routes[0].id, routeId(101));
  assert.equal(partial.verified_route_count, 0);
});

test('first GET adopts server defaults omitted by POST, then preserves the complete route records', async () => {
  const f = fixture({ postResponse(added, f) {
    f.live.at(-1).request_limit_fail_open = false;
    assert.equal(Object.hasOwn(added, 'request_limit_fail_open'), false);
    return added;
  } });
  // Existing route policy is preserved, not silently rewritten by this helper.
  f.live[0].request_limit_fail_open = true;
  f.io.baselineRoutes[0].request_limit_fail_open = true;
  const result = await activateConsoleRoutes(f.io);
  assert.equal(result.phase, 'complete');
  assert.equal(f.posts, 2);
  assert.equal(result.verified_route_count, 2);
  assert.deepEqual(f.live.slice(2).map(route => route.request_limit_fail_open), [false, false]);
  assert.deepEqual(f.live.slice(0, 2), f.io.baselineRoutes);
});

for (const includedInPost of [false, true]) test(`new Console route cannot fail open (field in POST response: ${includedInPost})`, async () => {
  const f = fixture({ postResponse(added, f) {
    f.live.at(-1).request_limit_fail_open = true;
    if (includedInPost) added.request_limit_fail_open = true;
    return added;
  } });
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'UNSAFE_CONSOLE_ROUTE_FAIL_OPEN' });
  assert.equal(f.posts, 1);
  assert.equal(f.receipts.at(-1).created_routes[0].id, routeId(101));
  assert.equal(f.receipts.at(-1).verified_route_count, 0);
  assert.equal(f.receipts.at(-1).stopped_after, 'route-created-not-yet-verified');
});

test('server default adopted on first GET cannot drift before the second POST', async () => {
  const f = fixture({
    postResponse(added, f) { f.live.at(-1).request_limit_fail_open = false; return added; },
    beforeRoutes(f) { if (f.routeReads === 3) f.live.at(-1).request_limit_fail_open = true; },
  });
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'CONSOLE_ROUTE_INVENTORY_DRIFT' });
  assert.equal(f.posts, 1);
  assert.equal(f.receipts.at(-1).failure_stage, 'route_2_before_create_routes');
});

test('first GET cannot change a server field that was already present in the POST response', async () => {
  const f = fixture({ postResponse(added, f) {
    added.request_limit_fail_open = true;
    f.live.at(-1).request_limit_fail_open = false;
    return added;
  } });
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'CREATED_CONSOLE_ROUTE_READBACK_MISMATCH' });
  assert.equal(f.posts, 1);
  assert.equal(f.receipts.at(-1).created_routes[0].id, routeId(101));
  assert.equal(f.receipts.at(-1).verified_route_count, 0);
});

for (const missing of ['approve', 'callRoutes', 'readDeployment', 'now', 'save']) {
  test(`missing required ${missing} hook stops without I/O`, async () => {
    const f = fixture(); delete f.io[missing];
    await assert.rejects(activateConsoleRoutes(f.io), { code: 'INVALID_ACTIVATION_CALLBACKS' });
    assert.equal(f.calls.length, 0);
  });
}

for (const [name, mutate] of [
  ['different deployment ID', value => { value.id = uuid(9); }],
  ['different version ID', value => { value.versions[0].version_id = uuid(9); }],
  ['split allocation', value => { value.versions.push({ version_id: uuid(9), percentage: 0 }); }],
  ['less than 100 percent', value => { value.versions[0].percentage = 99; }],
  ['unknown strategy', value => { value.strategy = 'unknown'; }],
]) test(`${name} blocks first creation`, async () => {
  const f = fixture(); mutate(f.currentDeployment);
  await assert.rejects(activateConsoleRoutes(f.io));
  assert.equal(f.posts, 0);
  assert.equal(f.receipts.at(-1).failure_stage, 'route_1_before_create_deployment');
});

test('expected deployment must itself prove exact 100 percent before any live read', async () => {
  const f = fixture(); f.io.expectedDeployment.versions[0].percentage = 50;
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'INVALID_EXACT_DEPLOYMENT' });
  assert.equal(f.calls.length, 0);
});

test('deployment drift between first verification and second POST blocks second creation', async () => {
  const f = fixture({ beforeDeployment(f) { if (f.deploymentReads === 3) f.currentDeployment.id = uuid(9); } });
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'CONSOLE_DEPLOYMENT_DRIFT' });
  assert.equal(f.posts, 1);
  assert.equal(f.receipts.at(-1).verified_route_count, 1);
});

for (const [name, mutate] of [
  ['unrelated old owner', routes => { routes[0].script = 'other-worker'; }],
  ['unrelated old pattern', routes => { routes[0].pattern += 'changed'; }],
  ['unrelated old ID', routes => { routes[0].id = routeId(9); }],
  ['old no-script exclusion', routes => { routes[1].script = 'admin-worker'; }],
  ['old nested metadata', routes => { routes[1].metadata.preserved = false; }],
  ['removed old route', routes => { routes.shift(); }],
  ['unexpected new route', routes => { routes.push({ id: routeId(9), pattern: 'unrelated.example/*', script: null }); }],
  ['target pre-created by another actor', routes => { routes.push({ id: routeId(9), pattern: CONSOLE_ROUTE_PATTERNS[0], script: 'admin-worker' }); }],
]) test(`${name} drift prevents any POST`, async () => {
  const f = fixture(); mutate(f.live);
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'CONSOLE_ROUTE_INVENTORY_DRIFT' });
  assert.equal(f.posts, 0);
});

test('activation repeats baseline conflict validation before any live read', async () => {
  const f = fixture(); f.io.baselineRoutes.push({ id: routeId(9), pattern: CONSOLE_ROUTE_PATTERNS[0], script: 'admin-worker' });
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'EXISTING_CONSOLE_ROUTE' });
  assert.equal(f.calls.length, 0);
});

test('unrelated mutation after first verified route prevents second POST', async () => {
  const f = fixture({ beforeRoutes(f) { if (f.routeReads === 3) f.live[1].script = 'other-worker'; } });
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'CONSOLE_ROUTE_INVENTORY_DRIFT' });
  assert.equal(f.posts, 1);
  assert.equal(f.receipts.at(-1).failure_stage, 'route_2_before_create_routes');
});

for (const [name, mutate] of [
  ['changed created ID', routes => { routes.at(-1).id = routeId(200); }],
  ['changed created script', routes => { routes.at(-1).script = 'other-worker'; }],
  ['changed created pattern', routes => { routes.at(-1).pattern += '/'; }],
  ['duplicate target pattern', routes => { routes.push({ ...routes.at(-1), id: routeId(200) }); }],
]) test(`${name} after first creation stops with concrete partial receipt`, async () => {
  const f = fixture({ beforeRoutes(f) { if (f.routeReads === 2) mutate(f.live); } });
  await assert.rejects(activateConsoleRoutes(f.io));
  assert.equal(f.posts, 1);
  assert.equal(f.receipts.at(-1).created_routes[0].id, routeId(101));
  assert.equal(f.receipts.at(-1).stopped_after, 'route-created-not-yet-verified');
});

test('caller mutation cannot rewrite the captured baseline proof', async () => {
  const f = fixture({ approve(f) {
    f.live[0].script = 'other-worker';
    f.io.baselineRoutes[0].script = 'other-worker';
    f.io.expectedDeployment.id = uuid(9);
  } });
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'CONSOLE_ROUTE_INVENTORY_DRIFT' });
  assert.equal(f.posts, 0);
});

for (const attempt of [1, 2]) test(`unknown POST ${attempt} outcome stops with no retry, further read, or rollback`, async () => {
  const privateText = 'synthetic-private-upstream-token';
  const f = fixture({ postResponse(added, f) {
    if (f.posts === attempt) throw new Error(privateText);
    return added;
  } });
  await assert.rejects(activateConsoleRoutes(f.io), error => error.code === 'CONSOLE_ROUTE_STAGE_FAILED'
    && !error.message.includes(privateText));
  assert.equal(f.posts, attempt);
  assert.equal(f.routeReads, attempt === 1 ? 1 : 3);
  assert.equal(f.live.length, 2 + attempt, 'simulated write may have succeeded');
  const stopped = f.receipts.at(-1);
  assert.equal(stopped.phase, 'stopped');
  assert.equal(stopped.stopped_after, 'route-create-attempted-outcome-unknown');
  assert.equal(stopped.write_attempts, attempt);
  assert.equal(stopped.created_routes.length, attempt - 1);
  assert.equal(stopped.pending_route.pattern, CONSOLE_ROUTE_PATTERNS[attempt - 1]);
  assert.equal(JSON.stringify(f.receipts).includes(privateText), false);
  assert.ok(f.calls.every(call => ['GET', 'POST'].includes(call.method)));
});

for (const [name, change] of [
  ['missing ID', added => { delete added.id; }],
  ['reused old ID', added => { added.id = routeId(1); }],
  ['wrong pattern', added => { added.pattern = CONSOLE_ROUTE_PATTERNS[1]; }],
  ['wrong script', added => { added.script = 'other-worker'; }],
]) test(`POST response with ${name} is ambiguous and never permits a second write`, async () => {
  const f = fixture({ postResponse(added) { change(added); return added; } });
  await assert.rejects(activateConsoleRoutes(f.io));
  assert.equal(f.posts, 1);
  assert.equal(f.routeReads, 1);
  assert.equal(f.receipts.at(-1).stopped_after, 'route-create-attempted-outcome-unknown');
});

test('second response cannot reuse the first created route ID', async () => {
  const f = fixture({ postResponse(added, f) { if (f.posts === 2) added.id = routeId(101); return added; } });
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'INVALID_CREATED_CONSOLE_ROUTE' });
  assert.equal(f.posts, 2);
  assert.equal(f.receipts.at(-1).created_routes.length, 1);
});

test('final inventory mismatch records both returned IDs but cannot claim completion or roll back', async () => {
  const f = fixture({ beforeRoutes(f) { if (f.routeReads === 4) f.live.pop(); } });
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'CONSOLE_ROUTE_INVENTORY_DRIFT' });
  assert.equal(f.posts, 2);
  assert.equal(f.receipts.at(-1).created_routes.length, 2);
  assert.equal(f.receipts.at(-1).verified_route_count, 1);
  assert.equal(f.receipts.some(receipt => receipt.phase === 'complete'), false);
});

for (const attempt of [1, 2]) test(`approval failure before route ${attempt} blocks that POST`, async () => {
  const f = fixture({ approve(f) { if (f.approvals === attempt) throw new Error('synthetic approval denied'); } });
  await assert.rejects(activateConsoleRoutes(f.io));
  assert.equal(f.posts, attempt - 1);
  assert.equal(f.receipts.at(-1).failure_stage, `route_${attempt}_approval`);
});

test('asynchronous intent receipt failure prevents the POST and is sanitized', async () => {
  const f = fixture({ async save(receipt) {
    await Promise.resolve();
    if (receipt.phase === 'route-create-attempted-outcome-unknown') throw new Error('synthetic-secret-in-save');
  } });
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'CONSOLE_ROUTE_RECEIPT_FAILED' });
  assert.equal(f.posts, 0);
  assert.equal(JSON.stringify(f.receipts).includes('synthetic-secret-in-save'), false);
});

test('response receipt failure preserves the returned route ID and prevents a second write', async () => {
  const f = fixture({ save(receipt) {
    if (receipt.phase === 'route-created-not-yet-verified') throw new Error('synthetic disk failure');
  } });
  await assert.rejects(activateConsoleRoutes(f.io), { code: 'CONSOLE_ROUTE_RECEIPT_FAILED' });
  assert.equal(f.posts, 1);
  assert.equal(f.routeReads, 1);
  assert.equal(f.receipts.at(-1).created_routes[0].id, routeId(101));
});

test('transport allows only exact route GET and canonical two-field POST bodies', async () => {
  const calls = [];
  const call = createConsoleRoutesTransport('synthetic-route-token', async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ success: true,
      result: init.method === 'GET' ? baseline() : { id: routeId(101), ...JSON.parse(init.body) } }) };
  });
  assert.deepEqual(await call(CONSOLE_ROUTES_PATH), baseline());
  for (const pattern of CONSOLE_ROUTE_PATTERNS) {
    await call(CONSOLE_ROUTES_PATH, { method: 'POST', body: JSON.stringify({ script: 'admin-worker', pattern }) });
  }
  assert.equal(calls.length, 3);
  for (const { url, init } of calls) {
    assert.equal(url, `https://api.cloudflare.com/client/v4/zones/${ZONE}/workers/routes`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-route-token');
    assert.ok(init.signal instanceof AbortSignal);
  }
  assert.equal(Object.hasOwn(calls[0].init, 'body'), false);
  assert.equal(calls[1].init.body, JSON.stringify({ pattern: CONSOLE_ROUTE_PATTERNS[0], script: 'admin-worker' }));
});

for (const [method, path, extra = {}] of [
  ['PUT', CONSOLE_ROUTES_PATH], ['PATCH', CONSOLE_ROUTES_PATH], ['DELETE', CONSOLE_ROUTES_PATH],
  ['HEAD', CONSOLE_ROUTES_PATH], ['post', CONSOLE_ROUTES_PATH],
  ['POST', CONSOLE_ROUTES_PATH + '/' + routeId(1)],
  ['GET', CONSOLE_ROUTES_PATH + '?page=1'], ['GET', CONSOLE_ROUTES_PATH + '/'],
  ['GET', CONSOLE_ROUTES_PATH.replace(ZONE, routeId(9))],
  ['GET', 'https://outside.example' + CONSOLE_ROUTES_PATH],
  ['GET', ROOT + '/deployments'],
  ['GET', CONSOLE_ROUTES_PATH, { body: '{}' }],
  ['GET', CONSOLE_ROUTES_PATH, { headers: { Authorization: 'override' } }],
]) test(`transport rejects outside scope: ${method} ${path} ${Object.keys(extra).join(',')}`, async () => {
  let calls = 0;
  const call = createConsoleRoutesTransport('synthetic-route-token', async () => { calls++; });
  await assert.rejects(call(path, { method, ...extra }), { code: 'OUTSIDE_CONSOLE_ROUTE_SCOPE' });
  assert.equal(calls, 0);
});

for (const [name, body] of [
  ['other Worker', { pattern: CONSOLE_ROUTE_PATTERNS[0], script: 'other-worker' }],
  ['no-script exclusion', { pattern: CONSOLE_ROUTE_PATTERNS[0], script: null }],
  ['broader pattern', { pattern: 'mmdbkk.com/internal/admin/*', script: 'admin-worker' }],
  ['scheme-qualified pattern', { pattern: 'https://' + CONSOLE_ROUTE_PATTERNS[0], script: 'admin-worker' }],
  ['route ID update', { id: routeId(1), pattern: CONSOLE_ROUTE_PATTERNS[0], script: 'admin-worker' }],
  ['extra field', { pattern: CONSOLE_ROUTE_PATTERNS[0], script: 'admin-worker', enabled: true }],
  ['missing script', { pattern: CONSOLE_ROUTE_PATTERNS[0] }],
  ['array body', []],
]) test(`transport rejects ${name} before fetch`, async () => {
  let calls = 0;
  const call = createConsoleRoutesTransport('synthetic-route-token', async () => { calls++; });
  await assert.rejects(call(CONSOLE_ROUTES_PATH, { method: 'POST', body: JSON.stringify(body) }),
    { code: 'INVALID_CONSOLE_ROUTE_BODY' });
  assert.equal(calls, 0);
});

test('transport rejects non-string and malformed JSON bodies without coercion', async () => {
  let calls = 0;
  const call = createConsoleRoutesTransport('synthetic-route-token', async () => { calls++; });
  for (const body of [undefined, null, {}, new URLSearchParams(), '{', 'x'.repeat(257)]) {
    await assert.rejects(call(CONSOLE_ROUTES_PATH, { method: 'POST', body }), { code: 'INVALID_CONSOLE_ROUTE_BODY' });
  }
  assert.equal(calls, 0);
});

test('transport rejects missing, malformed or injected credentials without printing them', () => {
  for (const token of [undefined, '', 42, {}, ' spaced ', 'synthetic\r\nX-Secret: injection', 'token\tvalue']) {
    assert.throws(() => createConsoleRoutesTransport(token), { code: 'INVALID_ROUTE_CREDENTIAL' });
  }
});

for (const mode of ['network', 'json', 'http', 'api']) test(`transport ${mode} failure never retries or exposes upstream content`, async () => {
  let calls = 0;
  const secret = 'synthetic-private-upstream';
  const call = createConsoleRoutesTransport('synthetic-route-token', async () => {
    calls++;
    if (mode === 'network') throw new Error(secret);
    return { ok: mode !== 'http', json: async () => {
      if (mode === 'json') throw new Error(secret);
      return { success: mode !== 'api', errors: [{ message: secret }], result: [] };
    } };
  });
  await assert.rejects(call(CONSOLE_ROUTES_PATH), error => !error.message.includes(secret) && !error.cause);
  assert.equal(calls, 1);
});

test('transport rejects truncated route listings and accepts a complete reported inventory', async () => {
  for (const result_info of [{ count: 2, total_count: 3 }, { total_pages: 2 }, { page: 2 }]) {
    const call = createConsoleRoutesTransport('synthetic-route-token', async () => ({ ok: true,
      json: async () => ({ success: true, result: baseline(), result_info }) }));
    await assert.rejects(call(CONSOLE_ROUTES_PATH), { code: 'INCOMPLETE_ROUTE_INVENTORY' });
  }
  const call = createConsoleRoutesTransport('synthetic-route-token', async () => ({ ok: true,
    json: async () => ({ success: true, result: baseline(), result_info: { count: 2, total_count: 2, total_pages: 1, page: 1 } }) }));
  assert.deepEqual(await call(CONSOLE_ROUTES_PATH), baseline());
});
