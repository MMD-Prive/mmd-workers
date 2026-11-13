// Read-only release evidence. Importing this file performs no I/O.
// Policy is a REVIEWED SOURCE INPUT, not authority supplied by JSON observations,
// environment variables, workflow inputs, R2, or this validator. The release entry
// must pin its bytes in reviewed source. No real reviewed producer bound exists yet.
// A producer can initiate an additional outbound send or write relevant R2 state
// under STATE_PREFIXES. The proof covers old versions, entrypoints, retries,
// background work and downstream/queued producers. It does not predict when an
// already accepted Telegram request becomes visible, or cancel accepted requests.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const STATE_ROOT = 'hype-compcards/v1/';
export const STATE_BUCKET = 'mmd-hype-compcard-state';
export const STATE_PREFIXES = Object.freeze(['plans/', 'deliveries/', 'history/', 'monthly-promotions/'].map(x => STATE_ROOT + x));
export const BASELINE_SOURCE_SHA256 = 'd517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee';
const ROOMS = ['premium', 'standard', 'preview'];
const CATEGORIES = { exclusive: ['premium', 'preview'], premium: ['premium'], standard: ['premium', 'standard'], travel: ['preview'], extreme: ['preview'] };
const TERMINAL = new Set(['sent', 'delivery_uncertain', 'blocked']);
const MAX_BYTES = 100_000;
const MAX_LIST_BYTES = 2_000_000;
const MAX_PAGES = 10_000;
const MAX_OBJECTS = 100_000;
const PAGE_SIZE = 1000;
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === 'string' && /^rec[A-Za-z0-9]{14}$/.test(value);
const timestamp = value => Number.isSafeInteger(value) && value >= 0;
const chat = value => typeof value === 'string' && /^-[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const sameKeys = (value, keys) => object(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const onlyKeys = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
function iso(value) {
  assert.ok(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), 'policy timestamp must be explicit UTC');
  const n = Date.parse(value);
  assert.ok(timestamp(n) && new Date(n).toISOString() === value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z'), 'invalid policy timestamp');
  return n;
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
export function bangkokDate(now) {
  assert.ok(timestamp(now), 'invalid release clock');
  return new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function validateReleasePolicy(policy, now = Date.now()) {
  assert.ok(object(policy), 'release disabled: reviewed policy and producer-horizon evidence are absent');
  assert.equal(policy.schema, 'porto_ems16_release_policy_v1');
  assert.match(policy.account_id || '', /^[a-f0-9]{32}$/);
  assert.equal(policy.bucket, STATE_BUCKET);
  assert.equal(policy.source_sha256, BASELINE_SOURCE_SHA256, 'source evidence must cover exact live baseline');
  assert.ok(validDate(policy.round_date));
  assert.ok(object(policy.window));
  const start = iso(policy.window.start), end = iso(policy.window.end);
  assert.ok(start < end && bangkokDate(start) === policy.round_date && bangkokDate(end - 1) === policy.round_date, 'window crosses publishing date');
  assert.ok(sameKeys(policy.chat_ids, ROOMS) && ROOMS.every(room => chat(policy.chat_ids[room]))
    && new Set(Object.values(policy.chat_ids)).size === ROOMS.length, 'reviewed room identities missing or ambiguous');
  assert.equal(policy.promotion_enabled, false, 'promotion must remain disabled');
  assert.ok(iso(policy.promotion_disabled_at) <= start, 'promotion disable boundary missing');
  assert.ok(Array.isArray(policy.historical_promotion_objects), 'historical promotion policy required');
  const historicalKeys = new Set();
  for (const row of policy.historical_promotion_objects) {
    assert.ok(sameKeys(row, ['key', 'sha256']) && hash(row.sha256));
    assert.ok(/^hype-compcards\/v1\/(?:plans\/\d{4}-\d{2}-\d{2}\/promotion\.json|deliveries\/\d{4}-\d{2}-\d{2}\/promotion\/(?:premium|standard|preview)\.json)$/.test(row.key), 'only exact historical promotion objects can be excepted');
    assert.ok(!historicalKeys.has(row.key), 'duplicate historical promotion exception');
    historicalKeys.add(row.key);
  }
  const evidence = policy.in_flight;
  assert.ok(object(evidence), 'reviewed bounded in-flight evidence required; R2 emptiness is not proof');
  assert.ok(sameKeys(evidence, ['source_sha256', 'entrypoint_review_sha256', 'runtime_bound_review_sha256', 'coverage',
    'entrypoint_inventory', 'producer_entrypoints', 'last_possible_producer_start', 'max_producer_activity_ms',
    'clock_skew_ms', 'no_new_producer_start_before']), 'ambiguous/obsolete producer evidence schema');
  assert.equal(evidence.source_sha256, policy.source_sha256);
  assert.ok(hash(evidence.entrypoint_review_sha256) && hash(evidence.runtime_bound_review_sha256), 'reviewed source/entry-point and runtime-bound artifacts required');
  assert.equal(evidence.coverage, 'all_potentially_running_versions_entrypoints_retries_background_and_downstream_producers');
  assert.ok(Array.isArray(evidence.entrypoint_inventory) && evidence.entrypoint_inventory.length > 0, 'reviewed entry-point inventory required');
  const kinds = ['scheduled', 'http', 'internal', 'background', 'other'];
  assert.ok(kinds.every(kind => evidence.entrypoint_inventory.some(row => row.kind === kind)), 'source review must cover scheduled/HTTP/internal/background/other paths');
  // state_write_capable concerns STATE_PREFIXES, not unrelated operational writes.
  // A queued downstream worker that can dispatch another send is a producer even
  // when the upstream Telegram request has already been accepted.
  for (const row of evidence.entrypoint_inventory) assert.ok(sameKeys(row, ['kind', 'entrypoint', 'send_capable', 'state_write_capable'])
    && kinds.includes(row.kind) && typeof row.entrypoint === 'string' && /^[A-Za-z0-9_:.\/-]{1,160}$/.test(row.entrypoint)
    && typeof row.send_capable === 'boolean' && typeof row.state_write_capable === 'boolean', 'invalid entry-point review disposition');
  assert.equal(new Set(evidence.entrypoint_inventory.map(row => row.entrypoint)).size, evidence.entrypoint_inventory.length, 'duplicate/ambiguous entry-point disposition');
  assert.ok(Array.isArray(evidence.producer_entrypoints) && evidence.producer_entrypoints.length > 0
    && evidence.producer_entrypoints.every(x => typeof x === 'string' && /^[A-Za-z0-9_:.\/-]{1,160}$/.test(x))
    && new Set(evidence.producer_entrypoints).size === evidence.producer_entrypoints.length, 'complete reviewed producer entry-point inventory required');
  assert.deepEqual([...evidence.producer_entrypoints].sort(), evidence.entrypoint_inventory.filter(row => row.send_capable || row.state_write_capable).map(row => row.entrypoint).sort(), 'producer entry-point inventory is inconsistent');
  // The reviewed duration is an elapsed end-to-end bound through the final send
  // dispatch / relevant state write, including descendant producers and retries.
  // It is not the lease, CPU time, or Telegram acceptance-to-visibility latency.
  const lastStart = iso(evidence.last_possible_producer_start);
  assert.ok(timestamp(evidence.max_producer_activity_ms) && evidence.max_producer_activity_ms > 0, 'no inferred lease-based runtime bound');
  assert.ok(timestamp(evidence.clock_skew_ms));
  const drained = lastStart + evidence.max_producer_activity_ms + evidence.clock_skew_ms;
  assert.ok(timestamp(drained) && drained < start, 'old-version producer horizon not drained before release');
  assert.ok(iso(evidence.no_new_producer_start_before) >= end, 'entry-point evidence does not cover whole release window');
  assertReleaseClock(policy, now);
  return policy;
}

export function assertReleaseClock(policy, now = Date.now()) {
  assert.ok(object(policy) && object(policy.window), 'release disabled: no reviewed window');
  assert.ok(timestamp(now) && now >= iso(policy.window.start) && now < iso(policy.window.end)
    && bangkokDate(now) === policy.round_date, 'outside reviewed release window');
}

// JSON.parse alone silently accepts duplicate object members. Reject ambiguity
// before trusting plan digests or provider pagination metadata.
export function parseStrictJson(text) {
  assert.equal(typeof text, 'string');
  let parsed;
  try { parsed = JSON.parse(text); } catch { assert.fail('invalid state/provider JSON'); }
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] || '') && i < text.length) i += 1; };
  const str = () => { const begin = i++; while (i < text.length) { const c = text[i++]; if (c === '\\') i += 1; else if (c === '"') return JSON.parse(text.slice(begin, i)); } assert.fail('invalid JSON string'); };
  const value = depth => {
    assert.ok(depth < 30, 'state/provider JSON nesting too deep'); ws();
    if (text[i] === '{') { i += 1; ws(); const keys = new Set(); if (text[i] === '}') { i += 1; return; }
      while (true) { ws(); assert.equal(text[i], '"'); const key = str(); assert.ok(!keys.has(key), 'duplicate JSON member'); keys.add(key); ws(); assert.equal(text[i++], ':'); value(depth + 1); ws(); if (text[i++] === '}') break; }
    } else if (text[i] === '[') { i += 1; ws(); if (text[i] === ']') { i += 1; return; } while (true) { value(depth + 1); ws(); if (text[i++] === ']') break; } }
    else if (text[i] === '"') str();
    else { const start = i; while (i < text.length && !/[\s,}\]]/.test(text[i])) i += 1; assert.ok(i > start); }
  };
  value(0); ws(); assert.equal(i, text.length); return parsed;
}

function normalizedEtag(value) {
  assert.ok(typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\x00-\x1f\x7f]/.test(value) && !value.startsWith('W/'), 'missing/invalid strong R2 etag');
  const v = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  assert.ok(v && !v.includes('"'), 'ambiguous R2 etag'); return v;
}

async function readBoundedText(response, maxBytes) {
  const claimed = response.headers?.get('content-length');
  const encoding = response.headers?.get('content-encoding');
  const coding = encoding === null || encoding === undefined ? null : encoding.trim().toLowerCase();
  if (coding !== null) assert.ok(/^[!#$%&'*+.^_`|~0-9a-z-]+(?:\s*,\s*[!#$%&'*+.^_`|~0-9a-z-]+)*$/.test(coding), 'invalid response content encoding');
  if (claimed !== null && claimed !== undefined) assert.ok(/^\d+$/.test(claimed)
    && Number.isSafeInteger(Number(claimed)) && Number(claimed) <= maxBytes, 'oversized/truncated response');
  assert.ok(response.body && typeof response.body.getReader === 'function', 'response stream unavailable');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
    if (size > maxBytes) { await reader.cancel(); assert.fail('oversized/truncated response'); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  // Native fetch can expose a decoded gzip/br body while retaining compressed
  // Content-Length. The advertised wire length and decoded stream are separately
  // capped, but equality is valid only without a transforming content encoding.
  // The caller still compares decoded object bytes with R2 inventory size/ETag.
  if (claimed !== null && claimed !== undefined && (coding === null || coding === 'identity')) {
    assert.equal(size, Number(claimed), 'response content length mismatch');
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); } catch { assert.fail('state/provider response is not UTF-8'); }
}

export function createR2ReadOnlyClient({ token, request = globalThis.fetch, policy }) {
  assert.ok(object(policy) && /^[a-f0-9]{32}$/.test(policy.account_id || '') && policy.bucket === STATE_BUCKET);
  assert.ok(typeof token === 'string' && token.length > 0 && !/[\r\n]/.test(token), 'read credential unavailable');
  assert.equal(typeof request, 'function');
  const root = `/accounts/${policy.account_id}/r2/buckets/${STATE_BUCKET}/objects`;
  const origin = 'https://api.cloudflare.com/client/v4';
  const get = async (url, maxBytes) => {
    const response = await request(url, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    assert.ok(response && response.status === 200 && response.redirected !== true, 'R2 GET failed or redirected');
    assert.ok(!response.url || response.url === url, 'R2 response origin/path changed');
    return { response, text: await readBoundedText(response, maxBytes) };
  };
  return Object.freeze({
    async list(prefix, cursor = '') {
      assert.ok(STATE_PREFIXES.includes(prefix), 'R2 prefix outside read-only inventory allowlist');
      assert.ok(typeof cursor === 'string' && cursor.length <= 4096 && !/[\x00-\x1f\x7f]/.test(cursor));
      const query = new URLSearchParams({ prefix, per_page: String(PAGE_SIZE) }); if (cursor) query.set('cursor', cursor);
      const { text } = await get(origin + root + '?' + query, MAX_LIST_BYTES);
      return parseStrictJson(text);
    },
    async object(key) {
      assert.ok(typeof key === 'string' && STATE_PREFIXES.some(prefix => key.startsWith(prefix)) && /^[-A-Za-z0-9_/.]+$/.test(key)
        && !key.split('/').some(part => part === '.' || part === '..' || part === ''), 'R2 object outside read-only inventory allowlist');
      const { response, text } = await get(origin + root + '/' + key, MAX_BYTES);
      return { text, etag: normalizedEtag(response.headers?.get('etag')) };
    },
  });
}

async function inventory(client) {
  const items = []; const keys = new Set();
  for (const prefix of STATE_PREFIXES) {
    const cursors = new Set(); let cursor = ''; let complete = false;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await client.list(prefix, cursor);
      assert.ok(onlyKeys(result, ['success', 'errors', 'messages', 'result', 'result_info']) && result.success === true
        && (!('errors' in result) || Array.isArray(result.errors) && result.errors.length === 0)
        && (!('messages' in result) || Array.isArray(result.messages) && result.messages.length === 0)
        && Array.isArray(result.result) && result.result.length <= PAGE_SIZE, 'missing, errored, or ambiguous R2 inventory');
      // Verified R2 REST behavior: complete below-limit pages can omit
      // result_info entirely, including empty prefixes. An omitted envelope at
      // the requested limit is NOT completion evidence. Null/{} is ambiguous.
      const info = !Object.hasOwn(result, 'result_info') && result.result.length < PAGE_SIZE
        ? { is_truncated: false } : result.result_info;
      assert.ok(onlyKeys(info, ['is_truncated', 'cursor', 'count', 'per_page'])
        && typeof info.is_truncated === 'boolean', 'missing, errored, or ambiguous R2 inventory');
      if ('count' in info) assert.equal(info.count, result.result.length, 'R2 inventory count mismatch');
      if ('per_page' in info) assert.equal(info.per_page, PAGE_SIZE, 'provider page limit differs from requested inventory contract');
      for (const row of result.result) {
        assert.ok(object(row) && typeof row.key === 'string' && row.key.startsWith(prefix) && !keys.has(row.key), 'duplicate/unexpected R2 inventory key');
        assert.ok(Number.isSafeInteger(row.size) && row.size > 0 && row.size <= MAX_BYTES, 'missing/invalid R2 object size');
        keys.add(row.key); items.push({ key: row.key, etag: normalizedEtag(row.etag), size: row.size });
        assert.ok(items.length <= MAX_OBJECTS, 'inventory object safety limit exceeded; not a complete snapshot');
      }
      const next = info.cursor;
      if (info.is_truncated === false) {
        assert.ok(next === undefined || next === null || next === '', 'terminal inventory page has continuation cursor'); complete = true; break;
      }
      assert.ok(result.result.length > 0 && typeof next === 'string' && next.length > 0 && next !== cursor && !cursors.has(next), 'missing/repeated R2 pagination cursor');
      cursors.add(next); cursor = next;
    }
    assert.ok(complete, 'R2 pagination incomplete');
  }
  return items.sort((a, b) => a.key.localeCompare(b.key));
}

function validatePlan(row, policy, now) {
  const p = row.record, match = /^hype-compcards\/v1\/plans\/(\d{4}-\d{2}-\d{2})\/(model|standard|promotion)\.json$/.exec(row.key);
  assert.ok(match && object(p) && p.schema === 'hype_compcard_plan_v1', 'unexpected plan key/schema');
  assert.ok(validDate(p.date) && p.date === match[1] && p.date <= policy.round_date && p.slot === match[2], 'plan date/slot identity invalid');
  const { digest: claimed, ...payload } = p;
  assert.ok(hash(claimed) && sha256(JSON.stringify(payload)) === claimed, 'frozen plan digest invalid');
  assert.ok(onlyKeys(p, ['schema', 'date', 'slot', 'manifest_revision', 'created_at', 'card_id', 'model_id', 'category', 'file_id', 'sha256', 'destinations', 'chat_ids', 'captions', 'asset_key', 'cadence_policy', 'digest']), 'unreviewed plan schema fields');
  assert.ok(timestamp(p.created_at) && p.created_at <= now && bangkokDate(p.created_at) === p.date, 'plan timestamp/date mismatch');
  assert.ok(typeof p.card_id === 'string' && p.card_id.length > 0 && p.card_id.length <= 256 && hash(p.sha256), 'plan asset identity invalid');
  assert.ok(typeof p.manifest_revision === 'string' && p.manifest_revision.length > 0, 'plan manifest revision missing');
  assert.ok(typeof p.file_id === 'string' && /^[A-Za-z0-9_-]{10,180}$/.test(p.file_id) || p.slot === 'promotion' && p.file_id === null, 'plan asset file identity invalid');
  if ('asset_key' in p) assert.ok(typeof p.asset_key === 'string' && p.asset_key.startsWith(STATE_ROOT + 'intake/assets/') && !p.asset_key.includes('..'), 'plan intake asset identity invalid');
  if ('cadence_policy' in p) assert.ok(p.slot === 'promotion' && sameKeys(p.cadence_policy, ['start_date', 'promotion_weekdays'])
    && validDate(p.cadence_policy.start_date) && Array.isArray(p.cadence_policy.promotion_weekdays) && p.cadence_policy.promotion_weekdays.length > 0
    && p.cadence_policy.promotion_weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
    && new Set(p.cadence_policy.promotion_weekdays).size === p.cadence_policy.promotion_weekdays.length, 'invalid frozen promotion cadence schema');
  assert.ok(Array.isArray(p.destinations) && p.destinations.length > 0 && new Set(p.destinations).size === p.destinations.length);
  if (p.slot === 'promotion') {
    assert.equal(p.model_id, null); assert.equal(p.category, 'promotion'); assert.ok(p.destinations.length === 1 && ROOMS.includes(p.destinations[0]));
    assert.ok(p.date < policy.round_date && p.created_at < iso(policy.promotion_disabled_at), 'promotion evidence in disabled/current release window');
    assert.ok(policy.historical_promotion_objects.some(x => x.key === row.key && x.sha256 === row.sha256), 'historical promotion plan lacks exact reviewed exception');
  } else {
    assert.ok(id(p.model_id) && Object.hasOwn(CATEGORIES, p.category), 'plan model/category identity invalid');
    if (p.slot === 'standard') assert.equal(p.category, 'standard');
    // Exact live baseline uses category destinations in BOTH model slots. Do not
    // substitute newer main's split-room routing into an exact-live release gate.
    assert.deepEqual(p.destinations, CATEGORIES[p.category], 'plan category destinations changed');
  }
  assert.ok(sameKeys(p.chat_ids, p.destinations) && sameKeys(p.captions, p.destinations), 'plan room/caption keys do not match destinations');
  for (const room of p.destinations) {
    assert.ok(chat(p.chat_ids[room]) && p.chat_ids[room] === policy.chat_ids[room], 'plan room identity differs from reviewed room');
    assert.ok(typeof p.captions[room] === 'string' && p.captions[room].length > 0 && p.captions[room].length <= 4096, 'plan caption schema invalid');
  }
  return p;
}

function validateDelivery(row, plans, policy, now) {
  const r = row.record, m = /^hype-compcards\/v1\/deliveries\/(\d{4}-\d{2}-\d{2})\/(model|standard|promotion)\/(premium|standard|preview)\.json$/.exec(row.key);
  assert.ok(m && object(r) && r.schema === 'hype_compcard_delivery_v1', 'unexpected delivery key/schema');
  assert.ok(onlyKeys(r, ['schema', 'date', 'slot', 'destination', 'model_id', 'card_id', 'plan_digest', 'approved_sha256', 'expected_chat_id', 'status', 'attempts', 'created_at', 'lease_until', 'updated_at', 'error', 'next_attempt_at', 'receipt']), 'unreviewed delivery schema fields');
  const p = plans.get(`${m[1]}/${m[2]}`);
  assert.ok(p && p.destinations.includes(m[3]), 'orphan delivery or unexpected destination');
  for (const [field, value] of Object.entries({ date: p.date, slot: p.slot, destination: m[3], model_id: p.model_id,
    card_id: p.card_id, plan_digest: p.digest, approved_sha256: p.sha256, expected_chat_id: p.chat_ids[m[3]] })) assert.equal(r[field], value, 'delivery context differs from frozen plan');
  assert.ok(Number.isInteger(r.attempts) && r.attempts >= 0 && r.attempts <= 3, 'delivery attempts invalid');
  assert.ok(timestamp(r.lease_until) && r.lease_until <= now, 'invalid/active delivery lease');
  assert.ok(r.next_attempt_at === undefined || r.next_attempt_at === null || timestamp(r.next_attempt_at) && r.next_attempt_at <= now, 'invalid/future delivery retry');
  assert.ok(timestamp(r.created_at) && r.created_at >= p.created_at && r.created_at <= now, 'delivery created_at invalid');
  assert.ok(r.updated_at === undefined || timestamp(r.updated_at) && r.updated_at >= r.created_at && r.updated_at <= now, 'delivery updated_at invalid');
  assert.ok(!['preparing', 'sending'].includes(r.status), 'preparing/sending must be reconciled even after lease expiry');
  assert.ok(TERMINAL.has(r.status) || r.status === 'not_sent' && r.attempts === 3, 'unresolved delivery prevents release');
  assert.ok(r.attempts >= 1 && r.lease_until === 0, 'terminal/exhausted delivery context invalid');
  if (r.status === 'sent') {
    assert.ok(onlyKeys(r.receipt, ['message_id', 'chat_id', 'approved_sha256', 'file_unique_id']) && Number.isSafeInteger(r.receipt.message_id) && r.receipt.message_id > 0
      && r.receipt.chat_id === r.expected_chat_id && r.receipt.approved_sha256 === r.approved_sha256, 'sent receipt context invalid');
  } else assert.ok(r.receipt === undefined || r.receipt === null, 'non-sent record contains ambiguous receipt');
  if (p.slot === 'promotion') assert.ok(TERMINAL.has(r.status) && policy.historical_promotion_objects.some(x => x.key === row.key && x.sha256 === row.sha256), 'historical promotion receipt lacks exact terminal exception');
  return r;
}

function validateHistory(row, plans, deliveries, policy, now) {
  const m = /^hype-compcards\/v1\/history\/(rec[A-Za-z0-9]{14})\.json$/.exec(row.key);
  assert.ok(m && object(row.record), 'unexpected history/exposure key');
  const validate = (h, previous = false) => {
    assert.ok(onlyKeys(h, ['model_id', 'category', 'date', 'status', 'updated_at', 'previous_exposure']), 'unreviewed history schema fields');
    assert.ok(object(h) && h.model_id === m[1] && Object.hasOwn(CATEGORIES, h.category) && validDate(h.date) && h.date <= policy.round_date, 'history identity/date/category invalid');
    assert.ok(timestamp(h.updated_at) && h.updated_at <= now && ['sent', 'delivery_uncertain', 'not_sent'].includes(h.status), 'unresolved/invalid history exposure reservation');
    assert.ok(!previous || !('previous_exposure' in h) && h.status !== 'not_sent', 'ambiguous previous history exposure');
    const matching = [...plans.values()].filter(p => p.model_id === h.model_id && p.date === h.date && p.category === h.category);
    assert.ok(matching.length > 0, 'orphan history exposure');
    const outcomes = matching.flatMap(p => p.destinations.map(destination => deliveries.get(`${p.date}/${p.slot}/${destination}`)));
    if (h.status === 'sent') assert.ok(outcomes.some(d => d?.status === 'sent'), 'history sent exposure has no sent receipt');
    if (h.status === 'delivery_uncertain') assert.ok(outcomes.some(d => ['sent', 'delivery_uncertain'].includes(d?.status)), 'history uncertain exposure lacks matching delivery');
    if (h.status === 'not_sent') assert.ok(outcomes.every(d => d && ['blocked', 'not_sent'].includes(d.status)), 'history not_sent conflicts with delivery');
  };
  validate(row.record);
  if (row.record.previous_exposure !== null && row.record.previous_exposure !== undefined) {
    validate(row.record.previous_exposure, true);
    assert.ok(row.record.previous_exposure.date <= row.record.date, 'history previous exposure is in the future');
  }
}

function validateRecords(rows, policy, now) {
  const plans = new Map(), deliveries = new Map(), history = new Map();
  for (const row of rows.filter(row => row.key.startsWith(STATE_ROOT + 'plans/'))) {
    const p = validatePlan(row, policy, now); plans.set(`${p.date}/${p.slot}`, p);
  }
  for (const row of rows.filter(row => row.key.startsWith(STATE_ROOT + 'deliveries/'))) {
    const d = validateDelivery(row, plans, policy, now); deliveries.set(`${d.date}/${d.slot}/${d.destination}`, d);
  }
  for (const p of plans.values()) {
    assert.ok(p.destinations.every(room => deliveries.has(`${p.date}/${p.slot}/${room}`)), 'plan has missing/unresolved destination receipts');
  }
  for (const row of rows.filter(row => row.key.startsWith(STATE_ROOT + 'history/'))) {
    validateHistory(row, plans, deliveries, policy, now); history.set(row.record.model_id, row.record);
  }
  for (const p of plans.values()) if (p.model_id && p.destinations.some(room => ['sent', 'delivery_uncertain'].includes(deliveries.get(`${p.date}/${p.slot}/${room}`).status))) {
    const h = history.get(p.model_id);
    assert.ok(h && h.date >= p.date, 'sent/uncertain model lacks preserved exposure history');
  }
  // Exact live source does not implement monthly reservations. If inventory
  // contains these, a new reviewed source/schema policy is needed, not deletion.
  assert.ok(rows.every(row => !row.key.startsWith(STATE_ROOT + 'monthly-promotions/')), 'unreviewed monthly promotion/reservation state');
  for (const exception of policy.historical_promotion_objects) assert.ok(rows.some(row => row.key === exception.key && row.sha256 === exception.sha256), 'reviewed historical promotion evidence disappeared/changed');
}

/** Full-prefix, two-pass, object-version-checked snapshot. No writes, sends or
 * reconciliation. This is NOT an atomic R2 transaction: stable observations are
 * meaningful only with independently reviewed producer quiescence. Terminal
 * sent/uncertain evidence is preserved; downstream visibility of an already
 * accepted request is neither cancellable here nor part of this horizon.
 * Caller must rerun and compare immediately before every mutation and afterward.
 */
export async function readReleaseState({ token, request = globalThis.fetch, policy, now = Date.now }) {
  const clock = typeof now === 'function' ? now : () => now;
  validateReleasePolicy(policy, clock());
  // Detach policy so a caller cannot change scope halfway through async reads.
  const pinned = structuredClone(policy), policyHash = sha256(JSON.stringify(pinned));
  const client = createR2ReadOnlyClient({ token, request, policy: pinned });
  const first = await inventory(client); const rows = [];
  for (const item of first) {
    assertReleaseClock(pinned, clock());
    const fetched = await client.object(item.key);
    assert.equal(fetched.etag, item.etag, 'R2 object version changed after inventory');
    assert.equal(Buffer.byteLength(fetched.text), item.size, 'R2 object size changed after inventory');
    const record = parseStrictJson(fetched.text); assert.ok(object(record), 'state object is not a JSON record');
    rows.push({ ...item, sha256: sha256(fetched.text), record });
  }
  assert.deepEqual(await inventory(client), first, 'R2 inventory changed during snapshot');
  const at = clock(); validateReleasePolicy(pinned, at); validateRecords(rows, pinned, at);
  assert.equal(sha256(JSON.stringify(policy)), policyHash, 'reviewed policy changed during observation');
  const sanitized = Object.freeze(rows.map(row => Object.freeze({ key: row.key, sha256: row.sha256, etag_sha256: sha256(row.etag), size: row.size,
    status: row.record.status ?? null, date: row.record.date ?? null, slot: row.record.slot ?? null,
    model_id: row.record.model_id ?? null })));
  return Object.freeze({ schema: 'porto_ems16_state_snapshot_v1', policy_sha256: policyHash, round_date: pinned.round_date,
    prefixes: Object.freeze([...STATE_PREFIXES]), object_count: sanitized.length, objects: sanitized,
    fingerprint: sha256(JSON.stringify(sanitized)), invocation_safety: 'depends_on_separately_reviewed_policy_not_R2_emptiness' });
}

export function assertSameReleaseState(before, after) {
  assert.ok(object(before) && object(after) && before.schema === 'porto_ems16_state_snapshot_v1' && after.schema === before.schema);
  assert.deepEqual(after, before, 'release state/policy changed; stop without mutation');
}
