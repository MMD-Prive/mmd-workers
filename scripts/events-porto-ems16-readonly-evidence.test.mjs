// Synthetic contracts. No real credentials, production reads, or remote writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { inspect } from 'node:util';
import { collectReadOnlyEvidence, createReadOnlyEvidenceTransport, EVIDENCE_ACCOUNT_ID, EVIDENCE_LIMITS } from './events-porto-ems16-readonly-evidence.mjs';
import { STATE_PREFIXES, STATE_BUCKET, sha256 } from './events-porto-ems16-release-state.mjs';

const ROOT = 'hype-compcards/v1/';
const MODEL = 'recnl4Fksh6pXEwA1';
const DATE = '2099-01-01';
const PLAN = ROOT + `plans/${DATE}/model.json`;
const DELIVERY = ROOT + `deliveries/${DATE}/model/premium.json`;
const HISTORY = ROOT + `history/${MODEL}.json`;
const MONTHLY = ROOT + 'monthly-promotions/double-moment/2099-01.json';
const SENTINEL = 'PRIVATE_CAPTION_ลับ_🚫_TOKEN_SECRET';
const CHAT = '-100111222333444';
const TOKEN = 'SYNTHETIC_READ_TOKEN_MUST_NOT_LEAK';
const PATH = `/client/v4/accounts/${EVIDENCE_ACCOUNT_ID}/r2/buckets/${STATE_BUCKET}/objects`;
const URL_ROOT = 'https://api.cloudflare.com' + PATH;
function resign(record) { delete record.digest; record.digest = sha256(JSON.stringify(record)); return record; }
function fixture({ status = 'sent', date = DATE, slot = 'model', monthly = false } = {}) {
  const promotion = slot === 'promotion';
  const plan = resign({ schema: 'hype_compcard_plan_v1', date, slot, manifest_revision: 'synthetic-fixture',
    created_at: 1234, card_id: 'synthetic-card', model_id: promotion ? null : MODEL,
    category: promotion ? 'promotion' : 'premium', file_id: promotion ? null : 'synthetic-file-id',
    sha256: 'd'.repeat(64), destinations: ['premium'], chat_ids: { premium: CHAT }, captions: { premium: SENTINEL } });
  const records = {
    [ROOT + `plans/${date}/${slot}.json`]: plan,
    [ROOT + `deliveries/${date}/${slot}/premium.json`]: {
      schema: 'hype_compcard_delivery_v1', date, slot, destination: 'premium', model_id: plan.model_id,
      card_id: plan.card_id, plan_digest: plan.digest, approved_sha256: plan.sha256, expected_chat_id: CHAT,
      status, attempts: 1, created_at: 1234, lease_until: 0, updated_at: 1235, next_attempt_at: null,
      error: SENTINEL, receipt: status === 'sent' ? { message_id: 771122, chat_id: CHAT,
        approved_sha256: plan.sha256, file_unique_id: SENTINEL } : null,
    },
  };
  if (!promotion) records[HISTORY] = { model_id: MODEL, category: 'premium', date, status: 'sent', updated_at: 1235, previous_exposure: null };
  if (monthly) records[MONTHLY] = { schema: 'hype_compcard_monthly_promotion_v1', month: '2099-01',
    date: DATE, status: 'reserved', round_index: 0, destination: 'premium', updated_at: 1235 };
  return records;
}
function provider(records = {}, options = {}) {
  const calls = [], objectReads = new Map(); let listNumber = 0;
  const bodyFor = key => typeof records[key] === 'string' || records[key] instanceof Uint8Array
    ? records[key] : JSON.stringify(records[key]);
  const request = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer ' + TOKEN); assert.ok(init.signal);
    assert.equal(new URL(url).origin, 'https://api.cloudflare.com');
    const parsed = new URL(url), prefix = parsed.searchParams.get('prefix');
    if (prefix !== null) {
      listNumber += 1;
      const pageSize = options.pageSize || 1000, offset = Number(parsed.searchParams.get('cursor') || 0);
      const keys = Object.keys(records).filter(key => key.startsWith(prefix)).sort();
      const result = keys.slice(offset, offset + pageSize).map(key => ({ key, size: Buffer.byteLength(bodyFor(key)), etag: sha256(bodyFor(key)) }));
      const more = offset + pageSize < keys.length;
      let body = { success: true, errors: [], messages: [], result,
        result_info: { count: result.length, per_page: 1000, is_truncated: more, cursor: more ? String(offset + pageSize) : '' } };
      if (options.list) body = options.list(body, { listNumber, prefix, offset });
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
    }
    const key = parsed.pathname.slice(PATH.length + 1); assert.ok(Object.hasOwn(records, key));
    objectReads.set(key, (objectReads.get(key) || 0) + 1);
    const raw = bodyFor(key), n = objectReads.get(key);
    let response = new Response(raw, { status: 200, headers: { etag: '"' + sha256(raw) + '"' } });
    if (options.object) response = options.object(response, { key, raw, n });
    return response;
  };
  return { request, calls, records, objectReads };
}
async function read(records = {}, options = {}) {
  const api = provider(records, options);
  const result = await collectReadOnlyEvidence({ accountId: EVIDENCE_ACCOUNT_ID, token: TOKEN, request: api.request });
  return { result, ...api };
}
async function rejected(promise) {
  await assert.rejects(promise, error => {
    assert.equal(error.code, 'READONLY_EVIDENCE_FAILED');
    const printed = inspect(error, { depth: null });
    for (const secret of [SENTINEL, CHAT, TOKEN]) assert.ok(!printed.includes(secret));
    assert.equal(error.cause, undefined);
    assert.equal(error.actual, undefined); assert.equal(error.expected, undefined);
    return true;
  });
}

test('import performs no I/O and limits are immutable', () => {
  execFileSync(process.execPath, ['--input-type=module', '-e', `globalThis.fetch=()=>{throw Error('network on import')}; await import(${JSON.stringify(new URL('./events-porto-ems16-readonly-evidence.mjs', import.meta.url).href)});`]);
  assert.deepEqual(EVIDENCE_LIMITS, { pageSize: 1000, maxPages: 10_000, maxObjects: 100_000, maxObjectBytes: 100_000, maxListBytes: 2_000_000 });
  assert.ok(Object.isFrozen(EVIDENCE_LIMITS));
});
test('empty inventory reads all four prefixes twice but never clears a release or producer', async () => {
  const { result, calls } = await read();
  assert.equal(result.object_count, 0); assert.equal(calls.length, 8);
  assert.deepEqual(result.prefixes, STATE_PREFIXES);
  assert.equal(result.purpose, 'observation_only_not_release_clearance');
  assert.ok(result.limitations.includes('producer_quiescence_not_established'));
  assert.ok(result.limitations.includes('not_an_atomic_snapshot'));
  assert.ok(!Object.hasOwn(result, 'approved') && !Object.hasOwn(result, 'release_ready'));
});
test('pipeline reads every object twice via GET and hashes exact raw UTF-8 bytes', async () => {
  const records = fixture({ monthly: true }); records[PLAN] = JSON.stringify(records[PLAN], null, 2) + '\n';
  const { result, calls, objectReads } = await read(records, { pageSize: 1 });
  assert.equal(result.object_count, 4);
  assert.equal(calls.length, 8 + 2 * result.object_count);
  for (const count of objectReads.values()) assert.equal(count, 2);
  for (const call of calls) assert.equal(call.init.method, 'GET');
  const row = result.objects.find(row => row.key === PLAN);
  assert.equal(row.raw_sha256, sha256(records[PLAN]));
  assert.notEqual(row.raw_sha256, sha256(JSON.stringify(JSON.parse(records[PLAN]))));
  assert.equal(row.size, Buffer.byteLength(records[PLAN]));
  assert.equal(row.etag_sha256, sha256(sha256(records[PLAN])));
  assert.equal(result.risk_counts.monthly_promotion_objects, 1);
  assert.equal(result.status_counts.reserved, 1);
});
test('sanitized artifact emits only permitted object fields, no caption, chat, receipt, error or token', async () => {
  const { result } = await read(fixture()); const output = JSON.stringify(result);
  for (const text of [SENTINEL, CHAT, TOKEN, 'captions', 'chat_id', 'receipt', 'message_id', 'file_unique_id', 'synthetic-card', EVIDENCE_ACCOUNT_ID]) assert.ok(!output.includes(text));
  for (const row of result.objects) assert.deepEqual(Object.keys(row).sort(), ['key', 'raw_sha256', 'size', 'etag_sha256', 'date', 'slot', 'status', 'model_id'].sort());
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.objects) && result.objects.every(Object.isFrozen));
});
test('promotion key/hash pairs are exact observed bytes, explicitly not approval exceptions', async () => {
  const records = fixture({ slot: 'promotion' });
  const { result } = await read(records);
  assert.equal(result.historical_promotion_observations.length, 2);
  for (const row of result.historical_promotion_observations) assert.equal(row.raw_sha256, sha256(JSON.stringify(records[row.key])));
  assert.ok(result.limitations.includes('promotion_hashes_are_observations_not_approved_exceptions'));
  assert.ok(!Object.hasOwn(result, 'historical_promotion_objects'));
});
for (const status of ['pending', 'preparing', 'sending', 'not_sent', 'delivery_uncertain', 'blocked']) {
  test(`known delivery status ${status} is observed without reconciliation or false clearance`, async () => {
    const records = fixture({ status }), before = JSON.stringify(records);
    const { result } = await read(records);
    assert.equal(result.status_counts[status], 1);
    assert.equal(result.objects.find(row => row.key === DELIVERY).status, status);
    assert.equal(JSON.stringify(records), before);
    assert.equal(result.purpose, 'observation_only_not_release_clearance');
  });
}
test('full pagination observes prior dates and strict metadata across both passes', async () => {
  const records = { ...fixture({ date: '2098-12-31' }), ...fixture(), ...fixture({ date: '2098-12-30', slot: 'promotion' }) };
  const { result, calls, objectReads } = await read(records, { pageSize: 1 });
  assert.equal(result.object_count, Object.keys(records).length);
  assert.ok(calls.some(call => call.url.includes('cursor=')));
  assert.ok(result.objects.some(row => row.date === '2098-12-30'));
  assert.ok([...objectReads.values()].every(count => count === 2));
});
test('short terminal pages may omit metadata, including empty prefixes', async () => {
  const { result } = await read(fixture(), { list: body => { delete body.result_info; return body; } });
  assert.equal(result.object_count, 3);
});
test('valid uploaded metadata is accepted but not emitted', async () => {
  const { result } = await read(fixture(), { list: body => { body.result.forEach(row => { row.uploaded = '2099-01-01T00:00:00.123Z'; }); return body; } });
  assert.ok(!JSON.stringify(result).includes('uploaded'));
});
test('observed R2 REST last_modified metadata shape is accepted but not emitted', async () => {
  const { result } = await read(fixture(), { list: body => {
    body.result.forEach(row => { row.last_modified = '2026-11-03T13:00:30.946Z'; }); return body;
  } });
  assert.equal(result.object_count, 3); assert.ok(!JSON.stringify(result).includes('last_modified'));
});
test('known nonidentity REST metadata is ignored without leaking private values', async () => {
  const { result } = await read(fixture(), { list: body => {
    body.result.forEach(row => { Object.assign(row, {
      last_modified: '2026-11-12T09:30:26.724Z', custom_metadata: { private: SENTINEL },
      http_metadata: { contentType: SENTINEL }, ssec: { private: SENTINEL }, storage_class: 'Standard',
    }); }); return body;
  } });
  const output = JSON.stringify(result); assert.equal(result.object_count, 3);
  for (const value of [SENTINEL, 'custom_metadata', 'http_metadata', 'ssec', 'storage_class']) assert.ok(!output.includes(value));
});

for (const [name, mutate] of [
  ['unknown envelope field', body => { body.surprise = true; }],
  ['provider failure with private errors', body => { body.success = false; body.errors = [{ message: SENTINEL }]; }],
  ['nonempty provider message', body => { body.messages = [SENTINEL]; }],
  ['null metadata', body => { body.result_info = null; }],
  ['empty metadata', body => { body.result_info = {}; }],
  ['unknown metadata field', body => { body.result_info.next = SENTINEL; }],
  ['bad count', body => { body.result_info.count = 999; }],
  ['bad per page', body => { body.result_info.per_page = 20; }],
  ['terminal cursor', body => { body.result_info.cursor = 'unconsumed'; }],
  ['missing truncated cursor', body => { body.result_info.is_truncated = true; delete body.result_info.cursor; }],
  ['nonboolean truncation', body => { body.result_info.is_truncated = 'false'; }],
  ['duplicate keys', body => { if (body.result.length) body.result.push(body.result[0]); body.result_info.count = body.result.length; }],
  ['unknown inventory row field', body => { if (body.result.length) body.result[0].secret = SENTINEL; }],
  ['unknown key shape', body => { if (body.result.length) body.result[0].key = ROOT + 'plans/' + SENTINEL + '.json'; }],
  ['wrong prefix key', body => { if (body.result.length) body.result[0].key = DELIVERY; }],
  ['invalid size', body => { if (body.result.length) body.result[0].size = 0; }],
  ['oversized object', body => { if (body.result.length) body.result[0].size = 100_001; }],
  ['weak ETag', body => { if (body.result.length) body.result[0].etag = 'W/"weak"'; }],
  ['missing ETag', body => { if (body.result.length) delete body.result[0].etag; }],
]) test(`inventory rejects ${name} without leaking raw details`, async () => {
  await rejected(read(fixture(), { list: body => { mutate(body); return body; } }));
});
test('full page without result_info is never inferred complete', async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({ key: ROOT + `history/rec${String(i).padStart(14, '0')}.json`, size: 20, etag: 'etag' }));
  await rejected(read({}, { list: () => ({ success: true, result: rows }) }));
});
test('oversized list response and more than 1000 rows fail closed', async () => {
  await rejected(read({}, { list: () => ' '.repeat(2_000_001) }));
  await rejected(read({}, { list: () => ({ success: true, result: Array(1001).fill({}), result_info: { is_truncated: false } }) }));
});
test('empty truncated page fails before continuation', async () => {
  await rejected(read({}, { list: body => { body.result_info.is_truncated = true; body.result_info.cursor = '1'; return body; } }));
});
for (const cursor of ['same', '\u0000secret', 'x'.repeat(4097)]) {
  test(`pagination rejects ${cursor === 'same' ? 'repeated' : cursor.length > 4096 ? 'oversized' : 'control-character'} cursor`, async () => {
    await rejected(read({ ...fixture(), ...fixture({ date: '2098-12-31' }) }, {
      pageSize: 1, list: (body, context) => {
        if (context.prefix === STATE_PREFIXES[0]) {
          // Keep a nonempty, unique row on both pages so repeated-cursor
          // rejection is not accidentally exercised as an empty-page failure.
          body.result = [{ key: ROOT + `plans/${context.listNumber === 1 ? DATE : '2098-12-31'}/model.json`, size: 2, etag: 'etag' }];
          body.result_info.count = 1; body.result_info.is_truncated = true; body.result_info.cursor = cursor;
        }
        return body;
      },
    }));
  });
}
test('duplicate JSON member in provider envelope fails closed', async () => {
  await rejected(read({}, { list: () => '{"success":true,"success":true,"result":[]}' }));
});
test('prototype-named provider metadata fails closed', async () => {
  await rejected(read({}, { list: () => '{"success":true,"result":[],"__proto__":{"private":"' + SENTINEL + '"}}' }));
});
for (const [name, mutate] of [
  ['unknown plan schema', r => { r[PLAN].schema = SENTINEL; }],
  ['unknown plan field', r => { r[PLAN].unknown = SENTINEL; }],
  ['wrong plan date', r => { r[PLAN].date = '2099-02-30'; resign(r[PLAN]); }],
  ['unsafe plan slot', r => { r[PLAN].slot = SENTINEL; resign(r[PLAN]); }],
  ['unsafe model ID', r => { r[PLAN].model_id = SENTINEL; resign(r[PLAN]); }],
  ['bad plan digest', r => { r[PLAN].digest = '0'.repeat(64); }],
  ['unknown delivery schema', r => { r[DELIVERY].schema = SENTINEL; }],
  ['unsafe delivery status', r => { r[DELIVERY].status = SENTINEL; }],
  ['wrong delivery model', r => { r[DELIVERY].model_id = {}; }],
  ['unknown history field', r => { r[HISTORY].private = SENTINEL; }],
  ['unsafe history date', r => { r[HISTORY].date = SENTINEL; }],
  ['unknown monthly schema', r => { r[MONTHLY].schema = SENTINEL; }],
  ['unsafe monthly status', r => { r[MONTHLY].status = SENTINEL; }],
  ['top level array', r => { r[PLAN] = []; }],
  ['malformed JSON', r => { r[PLAN] = '{"private":"' + SENTINEL; }],
  ['duplicate JSON key', r => { r[PLAN] = '{"schema":"hype_compcard_plan_v1","schema":"' + SENTINEL + '"}'; }],
  ['nested proto field', r => { r[DELIVERY] = JSON.stringify(r[DELIVERY]).replace('"receipt":{', '"receipt":{"__proto__":{"secret":"' + SENTINEL + '"},'); }],
  ['constructor field', r => { r[HISTORY] = JSON.stringify(r[HISTORY]).replace('"category":', '"constructor":"' + SENTINEL + '","category":'); }],
]) test(`state rejects ${name} without emitting provider data`, async () => {
  const records = fixture({ monthly: true }); mutate(records); await rejected(read(records));
});
test('invalid UTF-8 and BOM payloads fail rather than hash altered text', async () => {
  for (const raw of [Buffer.from([0xff, 0xfe, 0x7b]), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(fixture()[PLAN]))])]) {
    const records = fixture(); records[PLAN] = raw; await rejected(read(records));
  }
});
test('object oversized streamed body, mismatched content-length, weak/missing ETag, or redirect fail closed', async () => {
  for (const option of [
    { body: ' '.repeat(100_001), headers: { etag: 'etag' } },
    { body: '{}', headers: { etag: 'etag', 'content-length': '3' } },
    { body: '{}', headers: { etag: 'W/"etag"' } },
    { body: '{}', headers: {} },
    { body: SENTINEL, status: 302, headers: { location: 'https://example.test/' + SENTINEL } },
    { body: SENTINEL, status: 403, headers: {} },
  ]) await rejected(read(fixture(), { object: () => new Response(option.body, { status: option.status ?? 200, headers: option.headers }) }));
});
test('inventory and GET must agree on ETag and exact size', async () => {
  await rejected(read(fixture(), { object: (response, { raw }) => new Response(raw, { headers: { etag: 'different' } }) }));
  await rejected(read(fixture(), { list: body => { body.result.forEach(row => { row.size += 1; }); return body; } }));
});
test('raw byte changes with same size and mocked same ETag are detected on the second full read', async () => {
  await rejected(read(fixture(), { object: (response, { raw, key, n }) => key === PLAN && n === 2
    ? (() => { const changed = JSON.parse(raw); changed.captions.premium = changed.captions.premium.replace('TOKEN_SECRET', 'TOKEN_SECREX');
      const text = JSON.stringify(resign(changed)); assert.equal(Buffer.byteLength(text), Buffer.byteLength(raw));
      return new Response(text, { headers: { etag: '"' + sha256(raw) + '"' } }); })() : response }));
});
test('inventory drift between complete passes fails closed', async () => {
  await rejected(read(fixture(), { list: (body, { listNumber }) => {
    if (listNumber > 4 && body.result.length) body.result[0].etag = 'changed'; return body;
  } }));
  await rejected(read(fixture(), { list: (body, { listNumber }) => {
    if (listNumber > 4) { body.result = []; body.result_info.count = 0; } return body;
  } }));
});
test('request errors and raw non-200 provider bodies never escape the API', async () => {
  for (const request of [async () => { throw new Error(SENTINEL + CHAT + TOKEN); },
    async () => new Response(JSON.stringify({ private: SENTINEL + CHAT + TOKEN }), { status: 500 })]) {
    await rejected(collectReadOnlyEvidence({ accountId: EVIDENCE_ACCOUNT_ID, token: TOKEN, request }));
  }
});
test('wrong account and missing credential fail before any request', async () => {
  let calls = 0; const request = async () => { calls += 1; };
  await rejected(collectReadOnlyEvidence({ accountId: 'a'.repeat(32), token: TOKEN, request }));
  await rejected(collectReadOnlyEvidence({ accountId: EVIDENCE_ACCOUNT_ID, token: '', request }));
  assert.equal(calls, 0);
});

function init() { return { method: 'GET', headers: { Authorization: 'Bearer ' + TOKEN }, redirect: 'error', signal: AbortSignal.timeout(10_000) }; }
const listURL = URL_ROOT + '?' + new URLSearchParams({ prefix: STATE_PREFIXES[0], per_page: '1000' });
for (const [name, url, edit] of [
  ['POST', listURL, i => { i.method = 'POST'; }],
  ['PUT', listURL, i => { i.method = 'PUT'; }],
  ['PATCH', listURL, i => { i.method = 'PATCH'; }],
  ['DELETE', listURL, i => { i.method = 'DELETE'; }],
  ['HEAD', listURL, i => { i.method = 'HEAD'; }],
  ['request body', listURL, i => { i.body = SENTINEL; }],
  ['extra request option', listURL, i => { i.credentials = 'include'; }],
  ['unbounded redirect', listURL, i => { i.redirect = 'follow'; }],
  ['extra header', listURL, i => { i.headers['X-Private'] = SENTINEL; }],
  ['other account', listURL.replace(EVIDENCE_ACCOUNT_ID, 'a'.repeat(32))],
  ['other bucket', listURL.replace(STATE_BUCKET, 'other')],
  ['other Cloudflare resource', 'https://api.cloudflare.com/client/v4/workers/scripts'],
  ['live Worker handler', 'https://events-worker.example.workers.dev/compcard/send'],
  ['GitHub API', 'https://api.github.com/repos/example/repo/actions/workflows/run/dispatches'],
  ['foreign origin', listURL.replace('api.cloudflare.com', 'example.test')],
  ['URL credentials', listURL.replace('https://', 'https://private@')],
  ['fragment', listURL + '#private'],
  ['duplicate query', listURL + '&per_page=1000'],
  ['extra query', listURL + '&secret=' + SENTINEL],
  ['wrong prefix', URL_ROOT + '?prefix=elsewhere%2F&per_page=1000'],
  ['object query', URL_ROOT + '/' + PLAN + '?download=true'],
  ['encoded object key', URL_ROOT + '/' + PLAN.replace('plans', '%70lans')],
  ['unknown object path', URL_ROOT + '/' + ROOT + 'other/private.json'],
]) test(`transport rejects ${name} before calling network`, async () => {
  let calls = 0;
  const transport = createReadOnlyEvidenceTransport({ accountId: EVIDENCE_ACCOUNT_ID, request: async () => { calls += 1; } });
  const options = init(); if (edit) edit(options);
  await assert.rejects(transport.request(url, options), error => error.code === 'READONLY_TRANSPORT_REJECTED' && !inspect(error).includes(SENTINEL));
  assert.equal(calls, 0);
});
test('transport rejects changed response origin without following it', async () => {
  const response = new Response('{}'); Object.defineProperty(response, 'url', { value: 'https://example.test/' + SENTINEL });
  const transport = createReadOnlyEvidenceTransport({ accountId: EVIDENCE_ACCOUNT_ID, request: async () => response });
  await assert.rejects(transport.request(listURL, init()), error => error.code === 'READONLY_TRANSPORT_REJECTED');
});
test('10000-page bound rejects incomplete inventory without fetching any objects', async () => {
  let calls = 0;
  const request = async (url, options) => {
    calls += 1; assert.equal(options.method, 'GET'); assert.ok(new URL(url).searchParams.has('prefix'));
    return Response.json({ success: true, result: [{ key: ROOT + `history/rec${String(calls).padStart(14, '0')}.json`, size: 2, etag: 'etag' }],
      result_info: { is_truncated: true, cursor: String(calls) } });
  };
  // Feed the history prefix first only after the first two known prefixes end.
  let pages = 0;
  const scoped = async (url, options) => {
    if (new URL(url).searchParams.get('prefix') !== ROOT + 'history/') return Response.json({ success: true, result: [] });
    pages += 1; return request(url, options);
  };
  await rejected(collectReadOnlyEvidence({ accountId: EVIDENCE_ACCOUNT_ID, token: TOKEN, request: scoped }));
  assert.equal(pages, 10_000);
});
test('100000-object bound rejects overflow before object requests', async () => {
  let pages = 0;
  const request = async (url, options) => {
    assert.equal(options.method, 'GET'); const prefix = new URL(url).searchParams.get('prefix'); assert.ok(prefix);
    if (prefix !== ROOT + 'history/') return Response.json({ success: true, result: [] });
    const start = pages++ * 1000;
    return Response.json({ success: true, result: Array.from({ length: 1000 }, (_, i) => ({
      key: ROOT + `history/rec${String(start + i).padStart(14, '0')}.json`, size: 2, etag: 'etag',
    })), result_info: { is_truncated: true, cursor: String(pages) } });
  };
  await rejected(collectReadOnlyEvidence({ accountId: EVIDENCE_ACCOUNT_ID, token: TOKEN, request }));
  assert.equal(pages, 101);
});
