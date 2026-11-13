// Synthetic contracts only. These dates, IDs and duration values are NOT a
// selected release window or evidence of the provider's real producer horizon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  STATE_ROOT, STATE_BUCKET, STATE_PREFIXES, BASELINE_SOURCE_SHA256, sha256,
  bangkokDate, validateReleasePolicy, assertReleaseClock, parseStrictJson,
  createR2ReadOnlyClient, readReleaseState, assertSameReleaseState,
} from './events-porto-ems16-release-state.mjs';

const NOW = Date.parse('2099-01-01T15:00:00Z');
const CREATED = Date.parse('2099-01-01T09:30:00Z');
const MODEL = 'recnl4Fksh6pXEwA1';
const EMS = 'recbdC0waCS3qp452';
const clone = x => structuredClone(x);
function policy() { return {
  schema: 'porto_ems16_release_policy_v1', account_id: 'a'.repeat(32), bucket: STATE_BUCKET,
  source_sha256: BASELINE_SOURCE_SHA256, round_date: '2099-01-01',
  window: { start: '2099-01-01T14:45:00Z', end: '2099-01-01T16:45:00Z' },
  chat_ids: { premium: '-100111', standard: '-100222', preview: '-100333' },
  promotion_enabled: false, promotion_disabled_at: '2099-01-01T00:00:00Z', historical_promotion_objects: [],
  in_flight: {
    source_sha256: BASELINE_SOURCE_SHA256,
    entrypoint_review_sha256: 'b'.repeat(64), runtime_bound_review_sha256: 'c'.repeat(64),
    coverage: 'all_potentially_running_versions_entrypoints_retries_background_and_downstream_producers',
    entrypoint_inventory: [
      { kind: 'scheduled', entrypoint: 'scheduled', send_capable: true, state_write_capable: true },
      { kind: 'http', entrypoint: 'fetch', send_capable: false, state_write_capable: false },
      { kind: 'internal', entrypoint: 'service_binding', send_capable: false, state_write_capable: false },
      { kind: 'background', entrypoint: 'scheduled.waitUntil', send_capable: true, state_write_capable: true },
      { kind: 'other', entrypoint: 'no_other_exports_or_triggers', send_capable: false, state_write_capable: false },
    ],
    producer_entrypoints: ['scheduled', 'scheduled.waitUntil'],
    last_possible_producer_start: '2099-01-01T14:00:00Z', max_producer_activity_ms: 1234,
    clock_skew_ms: 12, no_new_producer_start_before: '2099-01-01T16:45:00Z',
  },
}; }
const PLAN_KEY = STATE_ROOT + 'plans/2099-01-01/model.json';
const DELIVERY_KEY = STATE_ROOT + 'deliveries/2099-01-01/model/premium.json';
const HISTORY_KEY = STATE_ROOT + `history/${MODEL}.json`;
function resign(p) { delete p.digest; p.digest = sha256(JSON.stringify(p)); return p; }
function fixture({ model = MODEL, category = 'premium', status = 'sent', date = '2099-01-01', slot = 'model' } = {}) {
  const created = date === '2099-01-01' ? CREATED : Date.parse(`${date}T09:30:00Z`);
  const destinations = { exclusive: ['premium', 'preview'], premium: ['premium'], standard: ['premium', 'standard'], travel: ['preview'], extreme: ['preview'], promotion: ['preview'] }[category];
  const p = resign({ schema: 'hype_compcard_plan_v1', date, slot, manifest_revision: 'synthetic-fixture-only', created_at: created,
    card_id: 'fixture-card', model_id: model, category, file_id: 'fixture-file-id', sha256: 'd'.repeat(64), destinations,
    chat_ids: Object.fromEntries(destinations.map(room => [room, policy().chat_ids[room]])),
    captions: Object.fromEntries(destinations.map(room => [room, 'PRIVATE CAPTION MUST NEVER LEAVE SNAPSHOT'])),
  });
  const records = { [STATE_ROOT + `plans/${date}/${slot}.json`]: p };
  for (const destination of destinations) records[STATE_ROOT + `deliveries/${date}/${slot}/${destination}.json`] = {
    schema: 'hype_compcard_delivery_v1', date, slot, destination, model_id: model, card_id: p.card_id, plan_digest: p.digest,
    approved_sha256: p.sha256, expected_chat_id: p.chat_ids[destination], status, attempts: 1, created_at: created,
    updated_at: created + 1, lease_until: 0, next_attempt_at: null,
    receipt: status === 'sent' ? { message_id: 123, chat_id: p.chat_ids[destination], approved_sha256: p.sha256, file_unique_id: 'PRIVATE_FILE_ID' } : null,
  };
  if (model && ['sent', 'delivery_uncertain'].includes(status)) records[STATE_ROOT + `history/${model}.json`] = {
    model_id: model, category, date, status, updated_at: created + 1, previous_exposure: null,
  };
  return records;
}
function provider(records = {}, options = {}) {
  const calls = []; let listNumber = 0;
  const bodyFor = key => typeof records[key] === 'string' ? records[key] : JSON.stringify(records[key]);
  const request = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    const parsed = new URL(url), prefix = parsed.searchParams.get('prefix');
    assert.equal(parsed.origin, 'https://api.cloudflare.com');
    assert.ok(parsed.pathname.startsWith(`/client/v4/accounts/${'a'.repeat(32)}/r2/buckets/${STATE_BUCKET}/objects`));
    if (prefix !== null) {
      listNumber += 1;
      const pageSize = options.pageSize || 1000;
      const offset = Number(parsed.searchParams.get('cursor') || 0);
      const keys = Object.keys(records).filter(key => key.startsWith(prefix)).sort();
      const result = keys.slice(offset, offset + pageSize).map(key => ({ key, size: Buffer.byteLength(bodyFor(key)), etag: sha256(bodyFor(key)) }));
      const more = offset + pageSize < keys.length;
      let response = { success: true, errors: [], result, result_info: { count: result.length, is_truncated: more, cursor: more ? String(offset + pageSize) : '' } };
      if (options.list) response = options.list(response, { listNumber, prefix, offset });
      return new Response(typeof response === 'string' ? response : JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const key = parsed.pathname.split('/objects/')[1]; assert.ok(Object.hasOwn(records, key), 'unexpected object request');
    const raw = bodyFor(key);
    let reply = new Response(raw, { status: 200, headers: { etag: '"' + sha256(raw) + '"' } });
    if (options.object) reply = options.object(reply, { key, raw });
    return reply;
  };
  return { request, calls, records };
}
async function read(records = {}, p = policy(), options = {}) {
  const api = provider(records, options);
  const snapshot = await readReleaseState({ token: 'synthetic-token', request: api.request, policy: p, now: NOW });
  return { snapshot, ...api };
}

test('import has no network side effects', () => {
  execFileSync(process.execPath, ['--input-type=module', '-e', `globalThis.fetch=()=>{throw Error('network on import')}; await import(${JSON.stringify(new URL('./events-porto-ems16-release-state.mjs', import.meta.url).href)});`]);
});
test('empty inventory requires separately reviewed source and runtime evidence', async () => {
  const { snapshot, calls } = await read();
  assert.equal(snapshot.object_count, 0); assert.equal(calls.length, STATE_PREFIXES.length * 2);
  assert.match(snapshot.invocation_safety, /separately_reviewed_policy_not_R2_emptiness/);
  assert.deepEqual(snapshot.prefixes, STATE_PREFIXES);
});
test('null policy blocks before any read or credential check', async () => {
  let calls = 0;
  await assert.rejects(readReleaseState({ policy: null, now: NOW, request: () => { calls += 1; } }), /release disabled/);
  assert.equal(calls, 0);
});
test('terminal sent and uncertain records remain untouched, snapshot excludes raw private fields', async () => {
  for (const status of ['sent', 'delivery_uncertain', 'blocked']) {
    const records = fixture({ status }), before = JSON.stringify(records);
    const { snapshot, calls } = await read(records);
    assert.equal(JSON.stringify(records), before);
    assert.ok(calls.every(call => call.init.method === 'GET'));
    assert.ok(!JSON.stringify(snapshot).includes('PRIVATE_') && !JSON.stringify(snapshot).includes('captions'));
    assert.ok(!JSON.stringify(snapshot).includes('chat_id') && !JSON.stringify(snapshot).includes('message_id'));
  }
});
test('full paginated prefixes include all prior records, not merely current keys', async () => {
  const records = { ...fixture({ date: '2098-12-30' }), ...fixture(), ...fixture({ model: EMS, category: 'travel', date: '2098-12-31' }) };
  const { snapshot, calls } = await read(records, policy(), { pageSize: 1 });
  assert.equal(snapshot.object_count, Object.keys(records).length);
  assert.ok(calls.some(call => call.url.includes('cursor=')));
  assert.ok(snapshot.objects.some(row => row.date === '2098-12-30'));
});
test('model and standard slots follow exact live category destinations', async () => {
  await read(fixture({ category: 'standard', slot: 'standard' }));
  for (const category of ['exclusive', 'premium', 'standard', 'travel', 'extreme']) await read(fixture({ category }));
});
test('exhausted known-not-sent state may remain preserved with no future retry', async () => {
  const records = fixture({ status: 'not_sent' }); records[DELIVERY_KEY].attempts = 3;
  await read(records);
});
test('state-only producers must appear in the bounded producer inventory', async () => {
  const p = policy();
  p.in_flight.entrypoint_inventory.push({ kind: 'background', entrypoint: 'journal.retry_writer', send_capable: false, state_write_capable: true });
  await assert.rejects(read({}, p), /producer entry-point inventory is inconsistent/);
  p.in_flight.producer_entrypoints.push('journal.retry_writer');
  await read({}, p);
});
test('queued downstream producer must be covered despite upstream terminal receipt', async () => {
  const p = policy();
  p.in_flight.entrypoint_inventory.push({ kind: 'internal', entrypoint: 'downstream.queue_consumer', send_capable: true, state_write_capable: false });
  await assert.rejects(read(fixture(), p), /producer entry-point inventory is inconsistent/);
  p.in_flight.producer_entrypoints.push('downstream.queue_consumer');
  await read(fixture(), p);
  p.in_flight.last_possible_producer_start = '2099-01-01T14:44:59Z';
  await assert.rejects(read(fixture(), p), /producer horizon not drained/);
});
test('sent and uncertain observations need no accepted-send visibility deadline', async () => {
  const p = policy();
  assert.ok(Object.keys(p.in_flight).every(key => !/visibility|effect/.test(key)));
  for (const status of ['sent', 'delivery_uncertain']) {
    const records = fixture({ status }), before = JSON.stringify(records);
    const { snapshot, calls } = await read(records, p);
    assert.ok(snapshot.objects.some(row => row.key === DELIVERY_KEY && row.status === status));
    assert.equal(JSON.stringify(records), before);
    assert.ok(calls.every(call => new URL(call.url).origin === 'https://api.cloudflare.com' && call.init.method === 'GET'));
  }
});

for (const [name, mutate, pattern] of [
  ['missing in-flight evidence', p => { delete p.in_flight; }, /bounded in-flight/],
  ['missing source entry-point review', p => { p.in_flight.entrypoint_review_sha256 = null; }, /artifacts required/],
  ['missing bounded runtime review', p => { p.in_flight.runtime_bound_review_sha256 = null; }, /artifacts required/],
  ['wrong old runtime source', p => { p.in_flight.source_sha256 = '0'.repeat(64); }, /./],
  ['uncovered HTTP invocation paths', p => { p.in_flight.entrypoint_inventory = p.in_flight.entrypoint_inventory.filter(x => x.kind !== 'http'); }, /scheduled\/HTTP/],
  ['inconsistent producer entry points', p => { p.in_flight.producer_entrypoints = ['scheduled']; }, /inconsistent/],
  ['missing state-write capability review', p => { delete p.in_flight.entrypoint_inventory[0].state_write_capable; }, /review disposition/],
  ['nonboolean state-write capability', p => { p.in_flight.entrypoint_inventory[0].state_write_capable = 'false'; }, /review disposition/],
  ['duplicate entry-point dispositions', p => { p.in_flight.entrypoint_inventory.push({ ...p.in_flight.entrypoint_inventory[0], state_write_capable: false }); }, /duplicate\/ambiguous/],
  ['obsolete effects-bound field', p => { p.in_flight.max_invocation_and_effect_ms = p.in_flight.max_producer_activity_ms; delete p.in_flight.max_producer_activity_ms; }, /obsolete producer evidence schema/],
  ['obsolete coverage semantics', p => { p.in_flight.coverage = 'all_potentially_running_versions_entrypoints_background_work_and_downstream_effects'; }, /./],
  ['only lease instead of duration', p => { p.in_flight.max_producer_activity_ms = undefined; }, /no inferred lease/],
  ['unproven old-version producer horizon', p => { p.in_flight.last_possible_producer_start = '2099-01-01T14:44:59Z'; }, /horizon not drained/],
  ['future entry-point not covered', p => { p.in_flight.no_new_producer_start_before = '2099-01-01T15:01:00Z'; }, /whole release window/],
  ['partial version/producer coverage', p => { p.in_flight.coverage = 'active-version-only'; }, /./],
  ['enabled promotion', p => { p.promotion_enabled = true; }, /promotion must remain disabled/],
  ['ambiguous room identities', p => { p.chat_ids.standard = p.chat_ids.premium; }, /room identities/],
  ['window crossing Bangkok date', p => { p.window.end = '2099-01-01T17:01:00Z'; }, /crosses publishing date/],
]) test(name + ' fails before network', async () => {
  const p = policy(); mutate(p); let calls = 0;
  await assert.rejects(readReleaseState({ policy: p, now: NOW, request: () => { calls += 1; } }), pattern);
  assert.equal(calls, 0);
});
test('release clock is start-inclusive, end-exclusive with Bangkok date', () => {
  const p = policy(); validateReleasePolicy(p, Date.parse(p.window.start));
  assert.throws(() => assertReleaseClock(p, Date.parse(p.window.start) - 1), /outside/);
  assert.throws(() => assertReleaseClock(p, Date.parse(p.window.end)), /outside/);
  assert.equal(bangkokDate(Date.parse('2098-12-31T17:00:00Z')), '2099-01-01');
  assert.throws(() => bangkokDate(NaN));
});
test('window expiring during observation fails closed', async () => {
  const api = provider(fixture()); let n = 0;
  await assert.rejects(readReleaseState({ token: 'synthetic', request: api.request, policy: policy(), now: () => ++n < 3 ? NOW : Date.parse(policy().window.end) }), /outside/);
});
test('mutating policy while awaiting inventory fails closed', async () => {
  const p = policy(), api = provider({}, { list: (response, info) => { if (info.listNumber === 1) p.round_date = '2099-01-02'; return response; } });
  await assert.rejects(readReleaseState({ token: 'synthetic', request: api.request, policy: p, now: NOW }), /policy changed/);
});

for (const [name, mutate] of [
  ['null result_info', result => { result.result_info = null; }],
  ['missing explicit truncation flag', result => { delete result.result_info.is_truncated; }],
  ['provider success false', result => { result.success = false; }],
  ['provider error even with success', result => { result.errors = [{ code: 1 }]; }],
  ['cursor without truncated flag', result => { result.result_info.cursor = 'next'; }],
  ['truncation without cursor', result => { result.result_info.is_truncated = true; }],
  ['count mismatch', result => { result.result_info.count = 99; }],
  ['duplicate listed key', result => { if (result.result.length) { result.result.push(result.result[0]); result.result_info.count += 1; } }],
  ['missing listed etag', result => { if (result.result.length) delete result.result[0].etag; }],
  ['missing listed size', result => { if (result.result.length) delete result.result[0].size; }],
  ['outside-prefix key', result => { if (result.result.length) result.result[0].key = STATE_ROOT + 'secrets/private'; }],
]) test(name + ' inventory fails closed', async () => {
  await assert.rejects(read(fixture(), policy(), { list: result => { mutate(result); return result; } }));
});
test('verified below-limit R2 terminal pages may omit result_info entirely', async () => {
  for (const records of [{}, fixture()]) await read(records, policy(), { list: result => { delete result.result_info; return result; } });
});
test('omitted terminal metadata at requested page limit cannot imply completeness', async () => {
  await assert.rejects(read(fixture(), policy(), { list: result => {
    if (result.result.length) { result.result = Array.from({ length: 1000 }, () => result.result[0]); delete result.result_info; }
    return result;
  } }), /ambiguous R2 inventory/);
});
test('unrecognized provider pagination fields and altered page limit fail closed', async () => {
  for (const mutate of [r => { r.cursor = 'hidden-pagination'; }, r => { r.result_info.per_page = 100; }, r => { r.result_info.truncated = true; }]) {
    await assert.rejects(read(fixture(), policy(), { list: r => { mutate(r); return r; } }));
  }
});
test('repeating pagination cursor is rejected', async () => {
  await assert.rejects(read(fixture({ category: 'exclusive' }), policy(), { pageSize: 1, list: result => {
    if (result.result.length) { result.result_info.is_truncated = true; result.result_info.cursor = '1'; } return result;
  } }), /duplicate|repeated/);
});
test('object removed/etag changed between listing and fetch is rejected', async () => {
  for (const response of [() => new Response('', { status: 404 }), (_r, { raw }) => new Response(raw, { headers: { etag: 'different' } })]) {
    await assert.rejects(read(fixture(), policy(), { object: response }), /failed|version changed/);
  }
});
test('second inventory detects changed object or new/removed key', async () => {
  await assert.rejects(read(fixture(), policy(), { list: (result, info) => {
    if (info.listNumber > STATE_PREFIXES.length && result.result.length) result.result[0].etag = 'changed'; return result;
  } }), /inventory changed/);
});
test('redirects, foreign response origin, truncated bodies and missing etag are rejected', async () => {
  const changes = [
    () => new Response('redirect', { status: 302, headers: { location: 'https://bad.invalid/' } }),
    (response) => { Object.defineProperty(response, 'redirected', { value: true }); return response; },
    (response) => { Object.defineProperty(response, 'url', { value: 'https://bad.invalid/' }); return response; },
    (_response, { raw }) => new Response(raw, { headers: { etag: sha256(raw), 'content-length': String(Buffer.byteLength(raw) + 1) } }),
    (_response, { raw }) => new Response(raw),
    (_response, { raw }) => new Response(raw, { headers: { etag: 'W/"weak"' } }),
  ];
  for (const object of changes) await assert.rejects(read(fixture(), policy(), { object }));
});
test('native-fetch decoded gzip/br bodies need not equal compressed Content-Length', async () => {
  const records = fixture(), expected = (await read(records)).snapshot;
  for (const encoding of ['gzip', 'br']) {
    const api = provider(records);
    const request = async (url, init) => {
      const response = await api.request(url, init);
      // Synthetic native-fetch behavior: body already decoded, headers still
      // describe the compressed representation. Apply to list AND object GETs.
      return new Response(await response.text(), { status: response.status, headers: {
        ...Object.fromEntries(response.headers), 'content-encoding': encoding, 'content-length': '7',
      } });
    };
    const actual = await readReleaseState({ token: 'synthetic', request, policy: policy(), now: NOW });
    assertSameReleaseState(expected, actual);
  }
});
test('absent or identity encoding still requires exact Content-Length', async () => {
  for (const encoding of [null, 'identity', 'Identity']) {
    await assert.rejects(read(fixture(), policy(), { object: (_response, { raw }) => new Response(raw, { headers: {
      etag: sha256(raw), 'content-length': String(Buffer.byteLength(raw) + 1),
      ...(encoding === null ? {} : { 'content-encoding': encoding }),
    } }) }), /content length mismatch/);
    await read(fixture(), policy(), { object: (_response, { raw }) => new Response(raw, { headers: {
      etag: sha256(raw), 'content-length': String(Buffer.byteLength(raw)),
      ...(encoding === null ? {} : { 'content-encoding': encoding }),
    } }) });
  }
});
test('compressed metadata cannot bypass decoded object size or ETag comparison', async () => {
  for (const encoding of ['gzip', 'br']) {
    await assert.rejects(read(fixture(), policy(), { object: (_response, { raw }) => new Response(raw + ' ', { headers: {
      etag: sha256(raw), 'content-encoding': encoding, 'content-length': '7',
    } }) }), /object size changed/);
    await assert.rejects(read(fixture(), policy(), { object: (_response, { raw }) => new Response(raw, { headers: {
      etag: 'changed', 'content-encoding': encoding, 'content-length': '7',
    } }) }), /object version changed/);
  }
});
test('decoded stream remains capped independently of compressed length', async () => {
  for (const encoding of ['gzip', 'br']) {
    await assert.rejects(read(fixture(), policy(), { object: () => new Response('x'.repeat(100_001), { headers: {
      etag: 'synthetic', 'content-encoding': encoding, 'content-length': '7',
    } }) }), /oversized\/truncated/);
  }
});
test('encoded and identity responses reject malformed or oversized declared lengths', async () => {
  for (const encoding of ['identity', 'gzip', 'br']) for (const length of ['', '-1', '1.5', '7, 7', '9007199254740992', '100001']) {
    await assert.rejects(read(fixture(), policy(), { object: (_response, { raw }) => new Response(raw, { headers: {
      etag: sha256(raw), 'content-encoding': encoding, 'content-length': length,
    } }) }), /oversized\/truncated/);
  }
});
test('malformed content encoding cannot suppress identity length checks', async () => {
  for (const encoding of ['', 'gzip,', ',br', 'gzip;broken', 'gzip br']) {
    await assert.rejects(read(fixture(), policy(), { object: (_response, { raw }) => new Response(raw, { headers: {
      etag: sha256(raw), 'content-encoding': encoding, 'content-length': '7',
    } }) }), /invalid response content encoding/);
  }
});
test('read-only client only exposes scoped R2 GET endpoints', async () => {
  const api = provider(); const client = createR2ReadOnlyClient({ token: 'synthetic', request: api.request, policy: policy() });
  assert.deepEqual(Object.keys(client).sort(), ['list', 'object']);
  for (const key of ['https://bad.invalid/x', STATE_ROOT + 'plans/../../secrets', STATE_ROOT + 'plans/%2e%2e/foo', STATE_ROOT + 'intake/approved.json']) await assert.rejects(client.object(key));
  await assert.rejects(client.list(STATE_ROOT)); assert.equal(api.calls.length, 0);
});
test('duplicate JSON keys and malformed/deep JSON are rejected', async () => {
  assert.throws(() => parseStrictJson('{"a":1,"a":2}'), /duplicate JSON/);
  assert.throws(() => parseStrictJson('{"a":{"x":1,"x":2}}'), /duplicate JSON/);
  assert.throws(() => parseStrictJson('['.repeat(31) + '0' + ']'.repeat(31)), /nesting/);
  assert.throws(() => parseStrictJson('{'));
  assert.deepEqual(parseStrictJson('{"a":[null,true,1,"escaped\\\"key"]}'), { a: [null, true, 1, 'escaped"key'] });
  const records = fixture(); records[PLAN_KEY] = JSON.stringify(records[PLAN_KEY]).replace('"schema":', '"schema":"shadow","schema":');
  await assert.rejects(read(records), /duplicate JSON/);
});

for (const [name, mutate, pattern] of [
  ['orphan delivery', r => { delete r[PLAN_KEY]; }, /orphan/],
  ['missing destination delivery', r => { delete r[DELIVERY_KEY]; }, /missing\/unresolved/],
  ['plan digest mismatch', r => { r[PLAN_KEY].caption = 'changed'; }, /digest/],
  ['wrong plan key date', r => { r[PLAN_KEY].date = '2098-12-31'; resign(r[PLAN_KEY]); }, /date\/slot/],
  ['wrong plan slot', r => { r[PLAN_KEY].slot = 'standard'; resign(r[PLAN_KEY]); }, /date\/slot/],
  ['plan room identity mismatch', r => { r[PLAN_KEY].chat_ids.premium = '-123'; resign(r[PLAN_KEY]); }, /room identity/],
  ['plan has extra chat key', r => { r[PLAN_KEY].chat_ids.standard = '-123'; resign(r[PLAN_KEY]); }, /room\/caption keys/],
  ['wrong category destination', r => { r[PLAN_KEY].destinations = ['preview']; resign(r[PLAN_KEY]); }, /category destinations/],
  ['fractional attempts', r => { r[DELIVERY_KEY].attempts = 1.5; }, /attempts/],
  ['excess attempts', r => { r[DELIVERY_KEY].attempts = 4; }, /attempts/],
  ['delivery digest context changed', r => { r[DELIVERY_KEY].plan_digest = 'f'.repeat(64); }, /context/],
  ['delivery model context changed', r => { r[DELIVERY_KEY].model_id = EMS; }, /context/],
  ['delivery chat context changed', r => { r[DELIVERY_KEY].expected_chat_id = '-12'; }, /context/],
  ['sent receipt chat changed', r => { r[DELIVERY_KEY].receipt.chat_id = '-12'; }, /receipt context/],
  ['sent receipt hash changed', r => { r[DELIVERY_KEY].receipt.approved_sha256 = 'f'.repeat(64); }, /receipt context/],
  ['sent without receipt', r => { r[DELIVERY_KEY].receipt = null; }, /receipt context/],
  ['active lease', r => { r[DELIVERY_KEY].lease_until = NOW + 1; }, /active delivery lease/],
  ['future retry', r => { r[DELIVERY_KEY].next_attempt_at = NOW + 1; }, /future delivery retry/],
  ['expired preparing', r => { r[DELIVERY_KEY].status = 'preparing'; r[DELIVERY_KEY].lease_until = CREATED; }, /preparing\/sending/],
  ['expired sending', r => { r[DELIVERY_KEY].status = 'sending'; r[DELIVERY_KEY].lease_until = CREATED; }, /preparing\/sending/],
  ['pending delivery', r => { r[DELIVERY_KEY].status = 'pending'; }, /unresolved delivery/],
  ['retryable not-sent', r => { r[DELIVERY_KEY].status = 'not_sent'; r[DELIVERY_KEY].receipt = null; }, /unresolved delivery/],
  ['missing exposure history', r => { delete r[HISTORY_KEY]; }, /lacks preserved exposure/],
  ['in-flight exposure history', r => { r[HISTORY_KEY].status = 'sending'; }, /history exposure reservation/],
  ['unresolved previous exposure', r => { r[HISTORY_KEY].previous_exposure = { ...r[HISTORY_KEY], status: 'sending' }; }, /history exposure reservation/],
  ['history model mismatch', r => { r[HISTORY_KEY].model_id = EMS; }, /history identity/],
  ['history date without plan', r => { r[HISTORY_KEY].date = '2098-12-31'; }, /orphan history/],
  ['unexpected slot key', r => { r[STATE_ROOT + 'plans/2099-01-01/surprise.json'] = r[PLAN_KEY]; }, /unexpected plan/],
  ['unreviewed monthly reservation', r => { r[STATE_ROOT + 'monthly-promotions/double-moment/2099-01.json'] = { status: 'reserved' }; }, /unreviewed monthly/],
]) test(name + ' stops without writes', async () => {
  const records = fixture(); mutate(records); await assert.rejects(read(records), pattern);
});
test('prior unresolved round is not hidden by empty current-date keys', async () => {
  const records = fixture({ date: '2098-12-30', status: 'sending' });
  await assert.rejects(read(records), /preparing\/sending/);
});
test('terminal historical promotion needs exact reviewed hashes, current promotion always blocks', async () => {
  const records = fixture({ model: null, category: 'promotion', slot: 'promotion', date: '2098-12-31' });
  await assert.rejects(read(records), /exact reviewed exception/);
  const p = policy(); p.historical_promotion_objects = Object.entries(records).map(([key, record]) => ({ key, sha256: sha256(JSON.stringify(record)) }));
  await read(records, p);
  const missing = clone(records); delete missing[Object.keys(missing)[1]]; await assert.rejects(read(missing, p));
  await assert.rejects(read(fixture({ model: null, category: 'promotion', slot: 'promotion' })), /disabled\/current release window/);
});
test('reviewed historical promotion must already be terminal', async () => {
  const records = fixture({ model: null, category: 'promotion', slot: 'promotion', date: '2098-12-31', status: 'pending' });
  const p = policy(); p.historical_promotion_objects = Object.entries(records).map(([key, record]) => ({ key, sha256: sha256(JSON.stringify(record)) }));
  await assert.rejects(read(records, p), /unresolved/);
});
test('snapshot comparison rejects every later inventory/policy change', async () => {
  const { snapshot } = await read(fixture()); assertSameReleaseState(snapshot, clone(snapshot));
  assert.throws(() => { snapshot.objects[0].sha256 = '0'.repeat(64); }, TypeError);
  assert.throws(() => { snapshot.prefixes.push('ignored/'); }, TypeError);
  for (const field of ['fingerprint', 'policy_sha256', 'round_date']) {
    const changed = clone(snapshot); changed[field] = 'changed'; assert.throws(() => assertSameReleaseState(snapshot, changed), /state\/policy changed/);
  }
});
