import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCalendarConnection } from './admin-calendar-visibility.js';

test('calendar diagnostics use current Cal API and private cal-sync service binding', async () => {
  const calls = [];
  const directFetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ kind:'direct', url:url.toString(), version:init.headers?.['cal-api-version'] || new Headers(init.headers).get('cal-api-version') });
    if (url.hostname === 'api.cal.com') {
      assert.equal(init.headers['cal-api-version'], '2026-02-25');
      return Response.json({ status:'success', data:{ id:7057823 } });
    }
    throw new Error('public cal-sync fallback must not be used when the binding exists');
  };
  const env = {
    CAL_API_KEY:'test-cal-key',
    CAL_SYNC_WORKER:{
      async fetch(request) {
        const url = new URL(request.url);
        calls.push({ kind:'binding', url:url.toString() });
        assert.equal(url.hostname, 'cal-sync.internal');
        assert.equal(url.pathname, '/health');
        return Response.json({
          ok:true,
          service:'cal-sync-worker',
          mode:'shadow',
          webhook_secret_configured:true,
          api_key_configured:true,
          mapping_ledger_configured:true,
        });
      },
    },
  };
  const result = await inspectCalendarConnection(env, directFetch);
  assert.equal(result.outbound.api_verified, true);
  assert.equal(result.outbound.api_version, '2026-02-25');
  assert.equal(result.inbound.reachable, true);
  assert.equal(result.inbound.transport, 'service_binding');
  assert.equal(result.inbound.webhook_secret_configured, true);
  assert.equal(result.inbound.api_key_configured, true);
  assert.equal(result.inbound.mapping_ledger_configured, true);
  assert.equal(result.mutations_attempted, false);
  assert.equal(calls.filter(x => x.kind === 'direct').length, 1);
  assert.equal(calls.filter(x => x.kind === 'binding').length, 1);
});

test('calendar diagnostics fail closed if the private bridge is unavailable', async () => {
  const directFetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'api.cal.com') return Response.json({ status:'success', data:{ id:7057823 } });
    return new Response('{}', { status:503 });
  };
  const result = await inspectCalendarConnection({ CAL_API_KEY:'test-cal-key' }, directFetch);
  assert.equal(result.outbound.api_verified, true);
  assert.equal(result.inbound.reachable, false);
  assert.equal(result.inbound.transport, 'public_fallback');
  assert.equal(result.inbound.webhook_secret_configured, false);
  assert.equal(result.inbound.mapping_ledger_configured, false);
});
