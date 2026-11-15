import assert from 'node:assert/strict';
import test from 'node:test';
import { runTelegramOperation, telegramRoutePatterns as patterns } from './telegram-workflow-operations.mjs';

const env = {
  CLOUDFLARE_ROUTES_API_TOKEN: 'fixture-routes', CLOUDFLARE_ZONE_ID: 'a'.repeat(32),
  CLOUDFLARE_API_TOKEN: 'fixture-deploy', INTERNAL_API_TOKEN: 'fixture-internal', TELEGRAM_BOT_TOKEN: 'fixture-bot',
  APPROVED_MISSING_PATTERNS: '[]',
};
const allRoutes = () => patterns.map(pattern => ({ pattern, script: 'telegram-worker' }));
const webhook = { ok: true, canonical_url: 'https://mmdbkk.com/telegram/webhook', observed_url: 'https://mmdbkk.com/telegram/webhook', secret_token_enforced: true };
const webhookStatus = { ...webhook, canonical: true, webhook_secret_configured: true };
const room = { ok: true, mode: 'hype_premium_room_manager_v1', titles: { ok: true, results: [
  { surface: 'premium_group', desired_title: 'MMD PRIVÉ : PREMIUM', state: 'already_current' },
  { surface: 'standard_group', desired_title: 'MMD PRIVÉ : STANDARD', state: 'updated' },
] }, description: { state: 'already_current' }, welcome: { state: 'already_ready' } };

function fixture(responses) {
  const calls = [];
  const request = async (url, init) => {
    calls.push({ url, ...init, body: init.body && JSON.parse(init.body) });
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.ok(responses.length, 'unexpected extra request');
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next instanceof Response ? next : Response.json(next);
  };
  return { calls, request };
}

test('no default or unknown operation makes a request', async () => {
  const f = fixture([]);
  for (const operation of [undefined, 'none', 'deploy', 'sync-all', 'secret']) {
    await assert.rejects(runTelegramOperation(operation, env, f.request), /operation_not_allowed/);
  }
  assert.equal(f.calls.length, 0);
});

for (const [operation, key] of [
  ['sync-routes', 'CLOUDFLARE_ROUTES_API_TOKEN'], ['webhook', 'CLOUDFLARE_API_TOKEN'],
  ['menu', 'TELEGRAM_BOT_TOKEN'], ['premium-room', 'INTERNAL_API_TOKEN'], ['topic-smoke', 'INTERNAL_API_TOKEN'],
]) test(`${operation}: missing credential fails before I/O`, async () => {
  const f = fixture([]);
  await assert.rejects(runTelegramOperation(operation, { ...env, [key]: '' }, f.request), /missing_/);
  assert.equal(f.calls.length, 0);
});

test('route sync is GET-only when the ten existing patterns already match', async () => {
  assert.equal(patterns.length, 10);
  assert.ok(patterns.every(pattern => !pattern.includes('*')));
  const f = fixture([{ success: true, result: allRoutes() }]);
  assert.deepEqual(await runTelegramOperation('sync-routes', env, f.request), { created: 0, verified: 10 });
  assert.deepEqual(f.calls.map(call => call.method), ['GET']);
});

test('route sync creates only the approved missing pattern and reads back', async () => {
  const f = fixture([
    { success: true, result: allRoutes().slice(1) },
    { success: true, result: allRoutes()[0] },
    { success: true, result: allRoutes() },
  ]);
  assert.deepEqual(await runTelegramOperation('sync-routes', { ...env, APPROVED_MISSING_PATTERNS: JSON.stringify([patterns[0]]) }, f.request), { created: 1, verified: 10 });
  assert.deepEqual(f.calls.map(call => call.method), ['GET', 'POST', 'GET']);
  assert.deepEqual(f.calls[1].body, { pattern: patterns[0], script: 'telegram-worker' });
  assert.ok(f.calls.every(call => call.url === `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/workers/routes`));
  assert.ok(f.calls.every(call => call.headers.Authorization === 'Bearer fixture-routes'));
});

test('conflicts, incomplete readback and unapproved drift never write', async () => {
  for (const result of [
    { success: true, result: [...allRoutes().slice(1), { pattern: patterns[0], script: 'other-worker' }] },
    { success: true, result: [...allRoutes().slice(1), { pattern: patterns[0], script: null }] },
    { success: true, result: allRoutes().slice(1) },
    { success: true, result: allRoutes(), result_info: { total_pages: 2 } },
    { success: true, result: allRoutes(), result_info: { total_count: 11 } },
    { success: true, result: null },
  ]) {
    const f = fixture([result]);
    await assert.rejects(runTelegramOperation('sync-routes', env, f.request));
    assert.deepEqual(f.calls.map(call => call.method), ['GET']);
  }
});

test('invalid route approvals fail before I/O', async () => {
  for (const approved of ['', '{}', '["mmdbkk.com/*"]', JSON.stringify([patterns[0], patterns[0]])]) {
    const f = fixture([]);
    await assert.rejects(runTelegramOperation('sync-routes', { ...env, APPROVED_MISSING_PATTERNS: approved }, f.request), /invalid_route_approval/);
    assert.equal(f.calls.length, 0);
  }
});

test('partial route failure stops without retry, takeover, deletion or rollback', async () => {
  const f = fixture([
    { success: true, result: allRoutes().slice(2) },
    { success: true, result: allRoutes()[0] },
    new Error('private upstream response'),
  ]);
  await assert.rejects(runTelegramOperation('sync-routes', { ...env, APPROVED_MISSING_PATTERNS: JSON.stringify(patterns.slice(0, 2)) }, f.request), /transport_failed_readback_required/);
  assert.deepEqual(f.calls.map(call => call.method), ['GET', 'POST', 'POST']);
});

test('route writes must be verified; a success envelope alone is insufficient', async () => {
  const f = fixture([{ success: true, result: allRoutes().slice(1) }, { success: true, result: {} }]);
  await assert.rejects(runTelegramOperation('sync-routes', { ...env, APPROVED_MISSING_PATTERNS: JSON.stringify([patterns[0]]) }, f.request), /route_write_readback_required/);
  assert.equal(f.calls.length, 2);
});

const cases = [
  ['webhook', [webhook, webhookStatus], ['POST', 'GET'], ['/telegram/internal/webhook/ensure-canonical', '/telegram/webhook/status']],
  ['menu', [{ ok: true, result: true }, { ok: true, result: { type: 'web_app', web_app: { url: 'https://mmdbkk.com/member/login?source=telegram&entry=hype' } } }], ['POST', 'GET'], ['/botfixture-bot/setChatMenuButton', '/botfixture-bot/getChatMenuButton']],
  ['premium-room', [room], ['POST'], ['/telegram/internal/premium-room/sync']],
  ['topic-smoke', [{ ok: true, tested: 7, failed: 0 }], ['POST'], ['/telegram/internal/topics/smoke']],
];
const bodies = {
  webhook: { confirm: 'ENSURE_CANONICAL_TELEGRAM_WEBHOOK_V1' },
  menu: { menu_button: { type: 'web_app', text: 'MY MMD', web_app: { url: 'https://mmdbkk.com/member/login?source=telegram&entry=hype' } } },
  'premium-room': { confirm: 'SYNC_HYPE_PREMIUM_ROOM_V1' },
  'topic-smoke': { confirm: 'SEND_REDACTED_TOPIC_SMOKE', disable_notification: true },
};
for (const [operation, responses, methods, paths] of cases) {
  test(`${operation}: only the selected legacy operation runs`, async () => {
    const f = fixture([...responses]);
    const result = await runTelegramOperation(operation, env, f.request);
    assert.deepEqual(f.calls.map(call => call.method), methods);
    assert.deepEqual(f.calls.map(call => new URL(call.url).pathname), paths);
    assert.deepEqual(f.calls[0].body, bodies[operation]);
    const expectedAuth = operation === 'menu' ? undefined : `Bearer ${operation === 'webhook' ? 'fixture-deploy' : 'fixture-internal'}`;
    assert.equal(f.calls[0].headers.Authorization, expectedAuth);
    if (f.calls.length > 1) assert.equal(f.calls[1].headers.Authorization, undefined, 'no credential forwarded to public readback');
    assert.doesNotMatch(JSON.stringify(result), /fixture|chat_id|message_id|token|cookie/);
  });
  test(`${operation}: unknown write outcome is sanitized and never retried`, async () => {
    const f = fixture([new Error('https://private.example/?token=DO_NOT_LOG')]);
    await assert.rejects(runTelegramOperation(operation, env, f.request), error => {
      assert.equal(error.message, 'operation_transport_failed_readback_required');
      return true;
    });
    assert.equal(f.calls.length, 1);
  });
}

test('business failure and upstream text cannot leak through the error', async () => {
  for (const response of [
    Response.json({ ok: false, description: 'DO_NOT_LOG' }, { status: 403 }),
    new Response('DO_NOT_LOG', { status: 502 }),
    Response.json({ ok: true, failed: 1, tested: 7 }),
    Response.json({ ok: true, failed: 0, tested: 'unknown' }),
    Response.json({ ok: true, failed: 0 }),
  ]) {
    const f = fixture([response]);
    await assert.rejects(runTelegramOperation('topic-smoke', env, f.request), error => {
      assert.doesNotMatch(error.message, /DO_NOT_LOG|unknown/);
      return true;
    });
    assert.equal(f.calls.length, 1);
  }
});

test('a webhook or menu readback mismatch stops without a second write', async () => {
  for (const [operation, responses] of [
    ['webhook', [webhook, { ...webhookStatus, canonical: false }]],
    ['menu', [{ ok: true, result: true }, { ok: true, result: { type: 'commands' } }]],
  ]) {
    const f = fixture(responses);
    await assert.rejects(runTelegramOperation(operation, env, f.request), /verification_failed/);
    assert.deepEqual(f.calls.map(call => call.method), ['POST', 'GET']);
  }
});

test('room sync retains the title, description and welcome acceptance guards', async () => {
  for (const override of [
    { mode: 'wrong' }, { titles: { ok: false } },
    { titles: { ok: true, results: [{ surface: 'premium_group', desired_title: 'wrong', state: 'updated' }] } },
    { description: { state: 'failed' } }, { welcome: { state: 'unknown' } },
  ]) {
    const f = fixture([{ ...room, ...override }]);
    await assert.rejects(runTelegramOperation('premium-room', env, f.request), /room_verification_failed/);
    assert.equal(f.calls.length, 1);
  }
});
