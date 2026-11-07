import test from 'node:test';
import assert from 'node:assert/strict';
import {createStartDiagnostics} from '../src/liff-start-diagnostics.js';
import foundation from '../src/liff-identity-foundation.js';

function fixture(put) {
  const writes = [], pending = [];
  const kv = {put: put || (async (key, value, options) => writes.push({key, row:JSON.parse(value), options}))};
  const ctx = {waitUntil(promise) { assert.equal(this, ctx); pending.push(promise); }};
  return {writes, pending, kv, ctx, drain:() => Promise.all(pending)};
}

test('persists a stage while its operation is still pending, without delaying it', async () => {
  const f = fixture(); let clock = 1000, finish;
  const d = createStartDiagnostics({...f, now:() => clock, emit:() => {}});
  const operation = d.step('resolve_member', () => new Promise(resolve => {finish = resolve;}));
  await f.drain();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].row.outcome, 'begin');
  clock += 12000; finish('private-result'); await operation;
  d.complete(200); await f.drain();
  assert.equal(f.writes[1].row.duration_ms, 12000);
  assert.equal(f.writes[2].row.status, 200);
  assert.equal(new Set(f.writes.map(x => x.key)).size, 3);
  for (const {key,row,options} of f.writes) {
    assert.match(key, /^liff_start_timing:1000:[a-f0-9-]{36}:\d+$/);
    assert.equal(options.expirationTtl, 172800);
    assert.deepEqual(Object.keys(row).sort(), ['event','ref','stage','outcome','duration_ms','observed_at',...(row.status ? ['status'] : [])].sort());
  }
  assert(!JSON.stringify(f.writes).includes('private-result'));
});

test('slow or failed diagnostic storage never blocks results or changes thrown errors', async () => {
  for (const put of [() => new Promise(() => {}), () => {throw Error('private-sync');}, async () => {throw Error('private-async');}]) {
    const f = fixture(put), error = Error('private-auth-error');
    const d = createStartDiagnostics({...f, emit:() => {throw Error('console-failed');}});
    assert.equal(await d.step('safe_view', async () => 7), 7);
    await assert.rejects(d.step('verify_token', async () => {throw error;}), e => e === error);
    d.failed();
    // Rejections are handled; never wait on the intentionally hanging sink.
    if (put.constructor.name === 'AsyncFunction') await f.drain();
  }
});

test('no context or missing KV starts no I/O; per-request records are capped and isolated', async () => {
  let calls = 0;
  createStartDiagnostics({kv:{put:() => {calls++;}},emit:() => {}}).complete(200);
  createStartDiagnostics({ctx:{waitUntil:() => {calls++;}},emit:() => {}}).complete(200);
  assert.equal(calls, 0);
  const f = fixture(), a = createStartDiagnostics({...f,emit:row => {row.token='secret';}}), b = createStartDiagnostics({...f,emit:() => {}});
  for (let i=0;i<100;i++) a.disconnected();
  b.complete(201); await f.drain();
  assert.equal(f.writes.length,25);
  assert.equal(new Set(f.writes.map(x => x.row.ref)).size,2);
  assert(!JSON.stringify(f.writes).includes('secret'));
  await assert.rejects(a.step('arbitrary-private-stage',async () => {}));
});

test('start dispatcher forwards context without changing failure response or logging request data', async () => {
  const f = fixture(), old = console.info; console.info = () => {};
  try {
    const response = await foundation.fetch(new Request('https://mmdbkk.com/member/api/liff/start?secret=private', {
      method:'POST',headers:{origin:'https://mmdbkk.com',cookie:'secret=private','content-type':'application/json'},
      body:JSON.stringify({id_token:'private-token'}),
    }), {LIFF_IDENTITY_KV:f.kv}, f.ctx);
    assert.equal(response.status,503);
    await f.drain();
    assert.equal(f.writes.length,1);
    assert.equal(f.writes[0].row.stage,'request');
    assert.equal(f.writes[0].row.status,503);
    assert(!JSON.stringify(f.writes).includes('private'));
  } finally {console.info = old;}
});
