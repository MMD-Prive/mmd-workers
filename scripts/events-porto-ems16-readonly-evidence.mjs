// Observation only. Importing this module performs no I/O. This module cannot
// approve a release, reconcile state, prove producer quiescence, or send content.
import assert from 'node:assert/strict';
import {
  createR2ReadOnlyClient, parseStrictJson, sha256, STATE_PREFIXES, STATE_BUCKET,
} from './events-porto-ems16-release-state.mjs';

export const EVIDENCE_ACCOUNT_ID = 'b176eda1172b741fd2e58904cc9d77c5';
export const EVIDENCE_LIMITS = Object.freeze({ pageSize: 1000, maxPages: 10_000,
  maxObjects: 100_000, maxObjectBytes: 100_000, maxListBytes: 2_000_000 });
const ROOT = 'hype-compcards/v1/';
const API = 'https://api.cloudflare.com';
const PATH = `/client/v4/accounts/${EVIDENCE_ACCOUNT_ID}/r2/buckets/${STATE_BUCKET}/objects`;
const ROOMS = ['premium', 'standard', 'preview'];
const CATEGORIES = ['exclusive', 'premium', 'standard', 'travel', 'extreme'];
const DELIVERY_STATES = ['pending', 'preparing', 'sending', 'not_sent', 'sent', 'delivery_uncertain', 'blocked'];
const HISTORY_STATES = ['sending', 'sent', 'delivery_uncertain', 'not_sent'];
const MONTHLY_STATES = ['available', 'reserved', 'consumed', 'released'];
const STATUS_NAMES = [...new Set([...DELIVERY_STATES, ...MONTHLY_STATES])];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const onlyKeys = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const sameKeys = (value, keys) => onlyKeys(value, keys) && Object.keys(value).length === keys.length;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const modelId = value => typeof value === 'string' && /^rec[A-Za-z0-9]{14}$/.test(value);
const timestamp = value => Number.isSafeInteger(value) && value >= 0;
const chatId = value => typeof value === 'string' && /^-[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const shortText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
function error(code = 'READONLY_EVIDENCE_FAILED') {
  // Never include the upstream exception, its cause, object bytes, key or URL.
  return Object.assign(new Error('Read-only evidence collection failed; no release clearance produced.'), { code });
}
function safeTree(value, depth = 0) {
  assert.ok(depth < 30);
  if (value === null || typeof value !== 'object') return;
  assert.ok(Array.isArray(value) || object(value));
  for (const key of Object.keys(value)) {
    assert.ok(!['__proto__', 'prototype', 'constructor'].includes(key));
    safeTree(value[key], depth + 1);
  }
}
function keyIdentity(key) {
  assert.equal(typeof key, 'string');
  let m = /^hype-compcards\/v1\/(plans|deliveries)\/(\d{4}-\d{2}-\d{2})\/(model|standard|promotion)(?:\/(premium|standard|preview))?\.json$/.exec(key);
  if (m) {
    assert.ok(validDate(m[2]) && (m[1] === 'deliveries') === Boolean(m[4]));
    return { kind: m[1], date: m[2], slot: m[3], destination: m[4] };
  }
  m = /^hype-compcards\/v1\/history\/(rec[A-Za-z0-9]{14})\.json$/.exec(key);
  if (m) return { kind: 'history', model_id: m[1] };
  m = /^hype-compcards\/v1\/monthly-promotions\/double-moment\/(\d{4}-\d{2})\.json$/.exec(key);
  assert.ok(m && validDate(m[1] + '-01'));
  return { kind: 'monthly-promotions', month: m[1] };
}
function normalizedEtag(value) {
  assert.ok(typeof value === 'string' && value.length > 0 && value.length <= 256
    && !/[\s\x00-\x1f\x7f]/.test(value) && !value.startsWith('W/'));
  const normalized = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  assert.ok(normalized && !normalized.includes('"'));
  return normalized;
}
function validCursor(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\x00-\x1f\x7f]/.test(value);
}

/** Additional transport boundary: exact account/bucket, list prefixes and
 * structurally known object keys only. No other URL, method, body, redirects,
 * custom authorization destination, or live Worker endpoint can pass through.
 * Byte evidence is of the R2 object payload, not compressed HTTP wire bytes.
 */
export function createReadOnlyEvidenceTransport({ accountId, request = globalThis.fetch } = {}) {
  if (accountId !== EVIDENCE_ACCOUNT_ID || typeof request !== 'function') throw error('READONLY_TRANSPORT_REJECTED');
  const completed = new Map();
  return Object.freeze({
    async request(input, init) {
      try {
        assert.equal(typeof input, 'string');
        const url = new URL(input);
        assert.ok(input === url.href && url.origin === API && !url.username && !url.password && !url.port && !url.hash);
        assert.ok(sameKeys(init, ['method', 'headers', 'redirect', 'signal'])
          && init.method === 'GET' && init.redirect === 'error' && init.signal instanceof AbortSignal);
        assert.ok(sameKeys(init.headers, ['Authorization']) && /^Bearer [^\r\n]+$/.test(init.headers.Authorization));
        let key = null;
        if (url.pathname === PATH) {
          const params = [...url.searchParams.keys()];
          assert.ok(params.length === 2 || params.length === 3);
          assert.equal(new Set(params).size, params.length);
          assert.ok(params.every(name => ['prefix', 'per_page', 'cursor'].includes(name)));
          assert.ok(STATE_PREFIXES.includes(url.searchParams.get('prefix')) && url.searchParams.get('per_page') === '1000');
          if (url.searchParams.has('cursor')) assert.ok(validCursor(url.searchParams.get('cursor')));
          const expected = new URLSearchParams({ prefix: url.searchParams.get('prefix'), per_page: '1000' });
          if (url.searchParams.has('cursor')) expected.set('cursor', url.searchParams.get('cursor'));
          assert.equal(url.search, '?' + expected.toString());
        } else {
          assert.ok(url.pathname.startsWith(PATH + '/') && !url.search);
          key = url.pathname.slice(PATH.length + 1); keyIdentity(key);
          assert.equal(input, API + PATH + '/' + key);
          assert.ok(!completed.has(key));
        }
        const response = await request(input, init);
        assert.ok(response && response.status === 200 && response.redirected !== true
          && (!response.url || response.url === input));
        assert.ok(response.body && typeof response.body.getReader === 'function');
        const max = key === null ? EVIDENCE_LIMITS.maxListBytes : EVIDENCE_LIMITS.maxObjectBytes;
        // The imported client enforces header/stream lengths, fatal UTF-8 and
        // object ETags. Capture the very same streamed bytes, without a second
        // request or relying on JSON reserialization for a raw-object digest.
        const chunks = []; let size = 0; let used = false;
        const body = { getReader() {
          if (used) throw error('READONLY_TRANSPORT_REJECTED'); used = true;
          let reader;
          try { reader = response.body.getReader(); } catch { throw error('READONLY_TRANSPORT_REJECTED'); }
          return {
            async read() {
              try {
                const part = await reader.read();
                if (!part.done) {
                  assert.ok(part.value instanceof Uint8Array);
                  size += part.value.byteLength;
                  if (size > max) { await reader.cancel(); throw error(); }
                  chunks.push(Buffer.from(part.value));
                } else {
                  const raw = Buffer.concat(chunks);
                  // TextDecoder would silently strip a BOM. Reject it rather
                  // than claiming a digest of decoded text is the raw digest.
                  assert.ok(!(raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf));
                  if (key !== null) completed.set(key, Object.freeze({ raw_sha256: sha256(raw), size }));
                }
                return part;
              } catch { throw error('READONLY_TRANSPORT_REJECTED'); }
            },
            async cancel() { try { return await reader.cancel(); } catch { throw error('READONLY_TRANSPORT_REJECTED'); } },
            releaseLock() { try { return reader.releaseLock(); } catch { throw error('READONLY_TRANSPORT_REJECTED'); } },
          };
        } };
        return { status: response.status, redirected: response.redirected, url: response.url,
          headers: response.headers, body };
      } catch { throw error('READONLY_TRANSPORT_REJECTED'); }
    },
    takeObjectEvidence(key) {
      if (!completed.has(key)) throw error('READONLY_TRANSPORT_REJECTED');
      const evidence = completed.get(key); completed.delete(key); return evidence;
    },
  });
}

async function inventory(client) {
  const items = [], keys = new Set();
  for (const prefix of STATE_PREFIXES) {
    const cursors = new Set(); let cursor = '', complete = false;
    for (let page = 0; page < EVIDENCE_LIMITS.maxPages; page += 1) {
      const result = await client.list(prefix, cursor); safeTree(result);
      assert.ok(onlyKeys(result, ['success', 'errors', 'messages', 'result', 'result_info']) && result.success === true
        && (!Object.hasOwn(result, 'errors') || Array.isArray(result.errors) && result.errors.length === 0)
        && (!Object.hasOwn(result, 'messages') || Array.isArray(result.messages) && result.messages.length === 0)
        && Array.isArray(result.result) && result.result.length <= EVIDENCE_LIMITS.pageSize);
      // Only a below-limit terminal page may omit the provider metadata.
      const info = !Object.hasOwn(result, 'result_info') && result.result.length < EVIDENCE_LIMITS.pageSize
        ? { is_truncated: false } : result.result_info;
      assert.ok(onlyKeys(info, ['is_truncated', 'cursor', 'count', 'per_page']) && typeof info.is_truncated === 'boolean');
      if (Object.hasOwn(info, 'count')) assert.equal(info.count, result.result.length);
      if (Object.hasOwn(info, 'per_page')) assert.equal(info.per_page, EVIDENCE_LIMITS.pageSize);
      for (const row of result.result) {
        // last_modified is observed REST metadata; uploaded is another known
        // R2 inventory timestamp field. Neither is emitted or used as a bound.
        // OpenAPI also permits these nonidentity metadata fields. They were not
        // retained by earlier observations, so do not infer that they are absent.
        // safeTree rejects prototype hazards; these fields are otherwise ignored.
        assert.ok(onlyKeys(row, ['key', 'size', 'etag', 'uploaded', 'last_modified',
          'custom_metadata', 'http_metadata', 'ssec', 'storage_class']) && typeof row.key === 'string'
          && row.key.startsWith(prefix) && !keys.has(row.key));
        keyIdentity(row.key);
        for (const field of ['uploaded', 'last_modified']) if (Object.hasOwn(row, field)) assert.ok(typeof row[field] === 'string'
          && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(row[field]) && Number.isFinite(Date.parse(row[field])));
        assert.ok(Number.isSafeInteger(row.size) && row.size > 0 && row.size <= EVIDENCE_LIMITS.maxObjectBytes);
        keys.add(row.key); items.push({ key: row.key, size: row.size, etag: normalizedEtag(row.etag) });
        assert.ok(items.length <= EVIDENCE_LIMITS.maxObjects);
      }
      const next = info.cursor;
      if (info.is_truncated === false) {
        assert.ok(next === undefined || next === null || next === ''); complete = true; break;
      }
      assert.ok(result.result.length > 0 && validCursor(next) && next !== cursor && !cursors.has(next));
      cursors.add(next); cursor = next;
    }
    assert.ok(complete);
  }
  return items.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

function receiptShape(receipt) {
  if (receipt === null || receipt === undefined) return;
  assert.ok(onlyKeys(receipt, ['message_id', 'chat_id', 'approved_sha256', 'file_unique_id'])
    && Number.isSafeInteger(receipt.message_id) && receipt.message_id > 0 && chatId(receipt.chat_id)
    && hash(receipt.approved_sha256));
  if (receipt.file_unique_id !== undefined && receipt.file_unique_id !== null) assert.ok(shortText(receipt.file_unique_id, 512));
}
function historyShape(record, model, previous = false) {
  assert.ok(onlyKeys(record, ['model_id', 'category', 'date', 'status', 'updated_at', 'previous_exposure'])
    && record.model_id === model && CATEGORIES.includes(record.category) && validDate(record.date)
    && HISTORY_STATES.includes(record.status) && timestamp(record.updated_at));
  if (previous) assert.ok(!Object.hasOwn(record, 'previous_exposure'));
  if (record.previous_exposure !== undefined && record.previous_exposure !== null) historyShape(record.previous_exposure, model, true);
}
function recordMetadata(key, record) {
  assert.ok(object(record)); safeTree(record);
  const identity = keyIdentity(key);
  if (identity.kind === 'plans') {
    assert.ok(onlyKeys(record, ['schema', 'date', 'slot', 'manifest_revision', 'created_at', 'card_id', 'model_id',
      'category', 'file_id', 'sha256', 'destinations', 'chat_ids', 'captions', 'asset_key', 'cadence_policy',
      'monthly_policy', 'room_selection_policy', 'digest']) && record.schema === 'hype_compcard_plan_v1');
    assert.ok(record.date === identity.date && record.slot === identity.slot && timestamp(record.created_at)
      && shortText(record.manifest_revision, 512) && shortText(record.card_id, 256)
      && hash(record.sha256) && hash(record.digest));
    assert.ok(record.slot === 'promotion' ? record.model_id === null && record.category === 'promotion'
      : modelId(record.model_id) && CATEGORIES.includes(record.category));
    assert.ok(typeof record.file_id === 'string' && /^[A-Za-z0-9_-]{10,180}$/.test(record.file_id)
      || record.slot === 'promotion' && record.file_id === null);
    assert.ok(Array.isArray(record.destinations) && record.destinations.length > 0
      && new Set(record.destinations).size === record.destinations.length && record.destinations.every(room => ROOMS.includes(room))
      && sameKeys(record.chat_ids, record.destinations) && sameKeys(record.captions, record.destinations));
    for (const room of record.destinations) assert.ok(chatId(record.chat_ids[room]) && shortText(record.captions[room], 4096));
    if (Object.hasOwn(record, 'asset_key')) assert.ok(typeof record.asset_key === 'string'
      && /^hype-compcards\/v1\/intake\/assets\/[A-Za-z0-9_/-]+\.[A-Za-z0-9]+$/.test(record.asset_key));
    if (Object.hasOwn(record, 'room_selection_policy')) assert.equal(record.room_selection_policy, 1);
    if (Object.hasOwn(record, 'cadence_policy')) {
      const p = record.cadence_policy;
      assert.ok(record.slot === 'promotion' && sameKeys(p, ['start_date', 'promotion_weekdays']) && validDate(p.start_date)
        && Array.isArray(p.promotion_weekdays) && p.promotion_weekdays.length > 0 && p.promotion_weekdays.length <= 7
        && new Set(p.promotion_weekdays).size === p.promotion_weekdays.length
        && p.promotion_weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6));
    }
    if (Object.hasOwn(record, 'monthly_policy')) {
      const p = record.monthly_policy;
      assert.ok(record.slot === 'promotion' && sameKeys(p, ['version', 'month', 'round_index'])
        && p.version === 1 && p.month === record.date.slice(0, 7) && timestamp(p.round_index));
    }
    const { digest, ...payload } = record; assert.equal(sha256(JSON.stringify(payload)), digest);
  } else if (identity.kind === 'deliveries') {
    assert.ok(onlyKeys(record, ['schema', 'date', 'slot', 'destination', 'model_id', 'card_id', 'plan_digest',
      'approved_sha256', 'expected_chat_id', 'status', 'attempts', 'created_at', 'lease_until', 'updated_at',
      'error', 'next_attempt_at', 'receipt', 'reconciliation']) && record.schema === 'hype_compcard_delivery_v1');
    assert.ok(record.date === identity.date && record.slot === identity.slot && record.destination === identity.destination
      && (record.slot === 'promotion' ? record.model_id === null : modelId(record.model_id))
      && shortText(record.card_id, 256) && hash(record.plan_digest) && hash(record.approved_sha256)
      && chatId(record.expected_chat_id) && DELIVERY_STATES.includes(record.status)
      && Number.isInteger(record.attempts) && record.attempts >= 0 && record.attempts <= 3
      && timestamp(record.created_at) && timestamp(record.lease_until));
    if (Object.hasOwn(record, 'updated_at')) assert.ok(timestamp(record.updated_at));
    if (record.next_attempt_at !== undefined && record.next_attempt_at !== null) assert.ok(timestamp(record.next_attempt_at));
    if (record.error !== undefined && record.error !== null) assert.ok(typeof record.error === 'string' && record.error.length <= 4096);
    receiptShape(record.receipt);
    if (Object.hasOwn(record, 'reconciliation')) {
      const r = record.reconciliation;
      assert.ok(sameKeys(r, ['date', 'prior_status', 'reason']) && validDate(r.date)
        && r.prior_status === 'not_sent' && r.reason === 'compcard_window_closed');
    }
  } else if (identity.kind === 'history') {
    historyShape(record, identity.model_id);
  } else {
    assert.ok(onlyKeys(record, ['schema', 'month', 'status', 'date', 'source', 'round_index', 'destination',
      'receipt', 'updated_at', 'prior_outcome']) && record.schema === 'hype_compcard_monthly_promotion_v1'
      && record.month === identity.month && validDate(record.date) && record.date.startsWith(record.month + '-')
      && MONTHLY_STATES.includes(record.status) && timestamp(record.round_index) && ROOMS.includes(record.destination));
    if (Object.hasOwn(record, 'source')) assert.equal(record.source, 'legacy_receipt');
    if (Object.hasOwn(record, 'updated_at')) assert.ok(timestamp(record.updated_at));
    if (Object.hasOwn(record, 'prior_outcome')) assert.ok(DELIVERY_STATES.includes(record.prior_outcome));
    receiptShape(record.receipt);
  }
  // Only these four values may leave record parsing. They have strict formats
  // or closed enums. Captions, chat IDs, receipts, errors and account data never do.
  return { date: record.date, slot: record.slot ?? null, status: record.status ?? null, model_id: record.model_id ?? null };
}

async function readPass(client, transport) {
  const items = await inventory(client), rows = [];
  for (const item of items) {
    const fetched = await client.object(item.key), raw = transport.takeObjectEvidence(item.key);
    assert.equal(fetched.etag, item.etag);
    assert.equal(raw.size, item.size);
    assert.equal(Buffer.byteLength(fetched.text, 'utf8'), raw.size);
    assert.equal(sha256(fetched.text), raw.raw_sha256);
    const metadata = recordMetadata(item.key, parseStrictJson(fetched.text));
    rows.push(Object.freeze({ key: item.key, raw_sha256: raw.raw_sha256, size: raw.size,
      etag_sha256: sha256(item.etag), ...metadata }));
  }
  return rows;
}

/** Two complete inventory + object GET passes. Stable observations are not an
 * atomic snapshot and cannot establish producer quiescence. No retries, state
 * reconciliation, external mutation, release policy or approval exceptions.
 */
export async function collectReadOnlyEvidence({ accountId, token, request = globalThis.fetch } = {}) {
  try {
    const transport = createReadOnlyEvidenceTransport({ accountId, request });
    const client = createR2ReadOnlyClient({ token, request: transport.request,
      policy: Object.freeze({ account_id: EVIDENCE_ACCOUNT_ID, bucket: STATE_BUCKET }) });
    const first = await readPass(client, transport), second = await readPass(client, transport);
    assert.deepEqual(first, second);
    const statusCounts = Object.fromEntries(STATUS_NAMES.map(status => [status, 0]));
    const prefixCounts = Object.fromEntries(STATE_PREFIXES.map(prefix => [prefix, 0]));
    for (const row of first) {
      prefixCounts[STATE_PREFIXES.find(prefix => row.key.startsWith(prefix))] += 1;
      if (row.status !== null) statusCounts[row.status] += 1;
    }
    const riskCounts = Object.freeze({ pending: statusCounts.pending, preparing: statusCounts.preparing,
      sending: statusCounts.sending, not_sent: statusCounts.not_sent, delivery_uncertain: statusCounts.delivery_uncertain,
      monthly_promotion_objects: prefixCounts[ROOT + 'monthly-promotions/'] });
    const promotions = first.filter(row => row.slot === 'promotion').map(row => Object.freeze({
      key: row.key, raw_sha256: row.raw_sha256,
    }));
    return Object.freeze({ schema: 'porto_ems16_readonly_evidence_v1',
      purpose: 'observation_only_not_release_clearance',
      observation_method: 'two_complete_inventory_and_object_get_passes',
      limitations: Object.freeze(['not_an_atomic_snapshot', 'producer_quiescence_not_established',
        'release_policy_not_validated', 'cross_record_reconciliation_not_performed',
        'promotion_hashes_are_observations_not_approved_exceptions']),
      prefixes: Object.freeze([...STATE_PREFIXES]), object_count: first.length,
      prefix_counts: Object.freeze(prefixCounts), status_counts: Object.freeze(statusCounts), risk_counts: riskCounts,
      historical_promotion_observations: Object.freeze(promotions), objects: Object.freeze(first),
      fingerprint: sha256(JSON.stringify(first)) });
  } catch { throw error(); }
}
