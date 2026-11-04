import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerProgress} from '../src/liff-customer-progress.js';

test('allowlisted lifecycle diagnostics contain only bounded numeric metadata', async () => {
  const events = [];
  const progress = createCustomerProgress({
    render() {},
    diagnostic: event => events.push(event),
    request: async () => Response.json({ ok:true }),
  });
  await progress.fetch('/api/v1/member/updates/list?limit=10&member=private');
  assert.deepEqual(events.map(({event}) => event), [
    'loader.updates.requested', 'loader.updates.headers', 'loader.updates.body_complete', 'loader.updates.settled',
  ]);
  for (const item of events) {
    assert.deepEqual(Object.keys(item).sort(), ['durationMs', 'event', 'pending']);
    assert.equal(typeof item.durationMs, 'number');
    assert.equal(typeof item.pending, 'number');
    assert.doesNotMatch(JSON.stringify(item), /private|limit|api\/|\?/);
  }
});

test('history diagnostics cover body completion and diagnostic exceptions do not affect response', async () => {
  const events = [];
  const progress = createCustomerProgress({
    render() {},
    diagnostic: event => { events.push(event); throw new Error('diagnostic failure'); },
    request: async () => Response.json({ ok:false, error:'history_evidence_missing', data:null }, { status:404 }),
  });
  const response = await progress.fetch('/api/member/app/history/preview?private=1');
  assert.equal(response.status, 404);
  assert.deepEqual(events.map(({event}) => event), [
    'loader.history.requested', 'loader.history.headers', 'loader.history.body_complete', 'loader.history.settled',
  ]);
});

test('timeout emits a fixed timeout event without exposing the request URL', async () => {
  const events = [];
  const progress = createCustomerProgress({
    render() {}, timeoutMs:5,
    diagnostic: event => events.push(event),
    request: (_url, {signal}) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once:true });
    }),
  });
  await assert.rejects(progress.fetch('/api/v1/member/updates/list?private=1'));
  assert.deepEqual(events.map(({event}) => event), ['loader.updates.requested', 'loader.updates.timeout', 'loader.updates.settled']);
  assert.ok(events.every(({durationMs, pending}) => typeof durationMs === 'number' && typeof pending === 'number'));
});

test('POST start and canonical history use their exact diagnostic allowlists', async () => {
  const events = [];
  const progress = createCustomerProgress({
    render() {}, diagnostic: event => events.push(event),
    request: async () => Response.json({ ok:true }),
  });
  await progress.fetch('/member/api/liff/start?code=private', { method:'POST' });
  await progress.fetch('/api/member/app/history?cursor=private');
  assert.deepEqual(events.filter(({event}) => event.endsWith('.requested')).map(({event}) => event), [
    'loader.start.requested', 'loader.history.requested',
  ]);
});

test('outer abort and reset lifecycle are reported with bounded event names', async () => {
  const events = [];
  const signal = new AbortController();
  let release;
  const progress = createCustomerProgress({
    render() {}, diagnostic: event => events.push(event),
    request: () => new Promise(resolve => { release = resolve; }),
  });
  const pending = progress.fetch('/api/member/app/history', { signal:signal.signal });
  signal.abort();
  progress.reset({ memberOnly:true });
  release(Response.json({ ok:true }));
  await assert.rejects(pending);
  assert.deepEqual(events.map(({event}) => event), [
    'loader.history.requested', 'loader.history.signal_abort', 'loader.history.reset', 'loader.history.headers', 'loader.history.body_complete', 'loader.history.stale', 'loader.history.settled',
  ]);
  assert.ok(events.every(({durationMs, pending:count}) => Number.isFinite(durationMs) && durationMs >= 0 && durationMs <= 300000 && Number.isInteger(count) && count >= 0 && count <= 1000));
});
