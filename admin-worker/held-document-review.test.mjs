import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
import { handleHeldDocumentRequest, isHeldDocumentRequest, HELD_DOCUMENT_API } from './src/held-document-review.js';
import { handleMoneyControlWorkerHome } from './src/money-control-worker-home.js';

const origin = 'https://mmdbkk.com';
const uid = `U${'a'.repeat(32)}`;
const review = 'line-ofc/held-evidence-review/';
const active = 'line-ofc/held-evidence/';
const proof = 'line_1234567890abcdef';
const fixture = (id = proof) => ({ schema: 'line_held_payment_evidence_v1', proof_id: id, created_at_ms: 1793366400000, evidence_only: true, extension: 'png', hold_reason: 'automated_extraction_disabled_document_review', private: { line_user_id: uid, context_text: 'private-context-never-in-response' }, original_key: `${review}${id}/original.png` });
function setup(records = { [`${review}${proof}/state.json`]: fixture() }) {
  const calls = [];
  const objects = new Map(Object.entries(records));
  objects.set(`${review}${proof}/original.png`, { image: true, type: 'image/png', size: 3 });
  const env = { ADMIN_LOGIN_CREDENTIAL: 'fixture-login', ADMIN_SESSION_SECRET: 'fixture-secret', LINE_SLIP_EVIDENCE: {
    async list(options) {
      calls.push(['list', options]);
      const keys = [...objects.keys()].filter(key => key.startsWith(options.prefix) && key.endsWith('/state.json'));
      return { delimitedPrefixes: keys.slice(0, options.limit).map(key => key.slice(0, -'state.json'.length)), truncated: false };
    },
    async get(key) {
      calls.push(['get', key]); const value = objects.get(key); if (!value) return null;
      if (value.image) return { size: value.size, body: new Uint8Array([1, 2, 3]), httpMetadata: { contentType: value.type } };
      const body = typeof value === 'string' ? value : JSON.stringify(value);
      return { size: new TextEncoder().encode(body).length, text: async () => body };
    },
    async head(key) { calls.push(['head', key]); return objects.has(key) ? {} : null; },
    async put() { throw new Error('MUTATION forbidden'); }, async delete() { throw new Error('MUTATION forbidden'); },
  } };
  return { env, calls, objects };
}
async function cookie(env, role = 'owner', id = 'per') {
  return `mmd_admin_gate_v1=${await createCredentialBoundAdminSession(new Request(origin), { id, role }, env)}`;
}
async function run(env, path = HELD_DOCUMENT_API, options = {}) {
  const c = options.cookie === null ? '' : options.cookie || await cookie(env);
  const request = new Request(origin + path, { method: options.method || 'GET', headers: { ...(c ? { Cookie: c } : {}), ...options.headers } });
  return handleHeldDocumentRequest(request, env, handleMoneyControlWorkerHome);
}

test('exact held routes only; unrelated and lookalike routes not intercepted', () => {
  for (const path of [HELD_DOCUMENT_API, `${HELD_DOCUMENT_API}/image`, '/internal/admin/payments?view=held-images']) assert.equal(isHeldDocumentRequest(new Request(origin + path)), true);
  for (const path of ['/internal/admin/payments', `${HELD_DOCUMENT_API}/../secret`, `${HELD_DOCUMENT_API}-other`]) assert.equal(isHeldDocumentRequest(new Request(origin + path)), false);
});
test('unauthenticated API 401 and page uses existing login; no R2 reads', async () => {
  const { env, calls } = setup();
  assert.equal((await run(env, HELD_DOCUMENT_API, { cookie: null })).status, 401);
  const page = await run(env, '/internal/admin/payments?view=held-images', { cookie: null });
  assert.equal(page.status, 303); assert.match(page.headers.get('location'), /internal\/admin\/login\?next=/);
  assert.equal(calls.length, 0);
});
test('service bearer, confirmation key, cross-origin and partner cannot read', async () => {
  const { env, calls } = setup();
  for (const headers of [{ Authorization: 'Bearer service' }, { 'X-Confirm-Key': 'anything' }, { Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'x-mmd-admin-role': 'owner' }]) {
    const response = await run(env, HELD_DOCUMENT_API, { headers, ...(headers['x-mmd-admin-role'] ? { cookie: null } : {}) });
    assert.equal(response.status, headers['x-mmd-admin-role'] ? 401 : 403);
  }
  assert.equal((await run(env, HELD_DOCUMENT_API, { cookie: await cookie(env, 'mms_partner') })).status, 403);
  assert.equal(calls.length, 0);
});
test('every mutation method denied without reading or writing objects', async () => {
  const { env, calls } = setup();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await run(env, HELD_DOCUMENT_API, { method })).status, 405);
  assert.equal(calls.length, 0);
});
test('queue is private, bounded and contains neither keys nor private identity/context', async () => {
  const { env, calls } = setup();
  const response = await run(env); const body = await response.text(); const data = JSON.parse(body);
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(data.items.length, 1); assert.equal(data.read_only, true); assert.equal(data.items[0].reason, 'not_extracted');
  assert.equal(data.items[0].customer, null); assert.equal(data.items[0].evidence_status, 'held_document_not_verified_payment');
  assert.doesNotMatch(body, /line-ofc\/|private-context|Uaaaaaaaa|original_key|fixture-secret/);
  assert.equal(calls.find(c => c[0] === 'list')[1].limit, 8);
  assert.ok(data.next_cursor); assert.doesNotMatch(data.next_cursor, /phase|cursor|line-ofc/);
});
test('opaque image opens only through authenticated route, streamed private/no-store', async () => {
  const { env } = setup(); const data = await (await run(env)).json();
  const response = await run(env, data.items[0].image_url);
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('content-security-policy'), /sandbox/); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.equal((await run(env, data.items[0].image_url, { cookie: null })).status, 401);
  assert.equal((await run(env, data.items[0].image_url, { cookie: await cookie(env, 'admin', 'other') })).status, 400);
  assert.equal((await run(env, data.items[0].image_url, { method: 'HEAD' })).body, null);
});
test('raw paths, traversal, malformed, tampered and wrong-purpose references fail closed', async () => {
  const { env } = setup(); const data = await (await run(env)).json();
  for (const ref of ['../../secret', 'line-ofc/held-evidence/x/original.png', data.next_cursor, `${data.items[0].image_url.split('id=')[1]}x`]) {
    assert.equal((await run(env, `${HELD_DOCUMENT_API}/image?id=${encodeURIComponent(ref)}`)).status, 400);
  }
  assert.equal((await run(env, `${HELD_DOCUMENT_API}?cursor=../secret`)).status, 400);
});
test('credential rotation invalidates old references even with a fresh valid session', async () => {
  const { env } = setup(); const data = await (await run(env)).json();
  assert.equal((await run({ ...env, ADMIN_SESSION_SECRET: 'rotated-fixture' }, data.items[0].image_url)).status, 400);
});
test('expired references fail closed', async () => {
  const { env } = setup(); const data = await (await run(env)).json(); const realNow = Date.now;
  try { Date.now = () => realNow() + 16 * 60 * 1000; assert.equal((await run(env, data.items[0].image_url)).status, 400); }
  finally { Date.now = realNow; }
});
test('malformed/oversize/wrong-schema manifests remain visible but no image route', async () => {
  for (const value of ['{bad', 'x'.repeat(66000), { ...fixture(), schema: 'unknown' }, { ...fixture(), proof_id: 'different' }, { ...fixture(), evidence_only: false }]) {
    const { env } = setup({ [`${review}${proof}/state.json`]: value }); const data = await (await run(env)).json();
    assert.equal(data.items[0].reason, 'metadata_unavailable'); assert.equal(data.items[0].image_url, null);
  }
});
test('untrusted manifest original_key never used; unsupported image types never exposed', async () => {
  for (const change of [{ original_key: '../../private' }, { extension: 'svg' }, { extension: 'html' }]) {
    const { env, calls } = setup({ [`${review}${proof}/state.json`]: { ...fixture(), ...change } }); const data = await (await run(env)).json();
    assert.equal(data.items[0].image_url, null); assert.equal(calls.some(call => call[1] === '../../private'), false);
  }
});
test('stored MIME mismatch, oversize and missing image rejected without serving body', async () => {
  for (const image of [{ image: true, type: 'text/html', size: 3 }, { image: true, type: 'image/png', size: 11 * 1024 * 1024 }, null]) {
    const { env, objects } = setup(); const data = await (await run(env)).json();
    objects.set(`${review}${proof}/original.png`, image);
    assert.equal((await run(env, data.items[0].image_url)).status, image ? 415 : 404);
  }
});
test('active legacy documents remain reviewable and retained/active duplicates appear once', async () => {
  const legacy = 'line_legacy_fixture';
  const { env, objects } = setup({ [`${review}${proof}/state.json`]: fixture(), [`${active}${proof}/state.json`]: fixture(), [`${active}${legacy}/state.json`]: { ...fixture(legacy), original_key: undefined } });
  objects.set(`${active}${legacy}/original.png`, { image: true, type: 'image/png', size: 3 });
  const first = await (await run(env)).json(); const second = await (await run(env, `${HELD_DOCUMENT_API}?cursor=${first.next_cursor}`)).json();
  assert.deepEqual(second.items.map(item => item.reference), [legacy]); assert.equal(second.next_cursor, null);
  assert.equal((await run(env, second.items[0].image_url)).status, 200);
});
test('backend errors return sanitized service error, never bucket keys or upstream text', async () => {
  const { env } = setup(); env.LINE_SLIP_EVIDENCE.list = async () => { throw new Error('secret bucket private key'); };
  const response = await run(env); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret bucket/);
});
test('R2 truncated-page cursor is sealed and resumes only the fixed allowlisted prefix', async () => {
  const { env, calls } = setup(); let count = 0;
  env.LINE_SLIP_EVIDENCE.list = async options => {
    calls.push(['page', options]); count += 1;
    return count === 1 ? { delimitedPrefixes: [], truncated: true, cursor: 'private-r2-pagination-cursor' } : { delimitedPrefixes: [], truncated: false };
  };
  const first = await (await run(env)).json(); assert.ok(first.next_cursor); assert.doesNotMatch(JSON.stringify(first), /private-r2/);
  await run(env, `${HELD_DOCUMENT_API}?cursor=${first.next_cursor}`);
  assert.deepEqual(calls.filter(c => c[0] === 'page').map(c => c[1]), [{ prefix: review, delimiter: '/', limit: 8 }, { prefix: review, delimiter: '/', limit: 8, cursor: 'private-r2-pagination-cursor' }]);
});
test('retained and legacy retention states stay distinct, and invalid date remains unknown', async () => {
  const { env } = setup({ [`${review}${proof}/state.json`]: { ...fixture(), created_at_ms: 1e30 } });
  const data = await (await run(env)).json(); assert.equal(data.items[0].received_at, null); assert.equal(data.items[0].retention_state, 'retained_pending_policy');
});
test('terminal classification is not bank verification and unknown errors never echo source text', async () => {
  const { env } = setup({ [`${review}${proof}/state.json`]: { ...fixture(), terminal_outcome: 'promoted_to_payment_proof', hold_reason: 'secret diagnostic' } });
  const data = await (await run(env)).json(); assert.equal(data.items[0].reason, 'promoted'); assert.equal(data.items[0].evidence_status, 'held_document_not_verified_payment'); assert.doesNotMatch(JSON.stringify(data), /secret diagnostic/);
});
test('unique canonical Client and provenance-bound rename only; ambiguity/failure never falls back by name', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const state of ['match', 'duplicate', 'foreign', 'no_source', 'upstream']) {
      const { env } = setup(); env.AIRTABLE_BASE_ID = 'appfixture'; env.AIRTABLE_API_KEY = 'fixture';
      globalThis.fetch = async (input, options) => {
        assert.equal(options.method, 'GET');
        const url = new URL(input); const formula = url.searchParams.get('filterByFormula'); assert.match(formula, /Uaaaa/);
        if (state === 'upstream') return new Response('private upstream detail', { status: 503 });
        if (url.pathname.endsWith('/Clients')) return Response.json({ records: state === 'duplicate' ? [{ id: 'rec1', fields: { line_user_id: uid } }, { id: 'rec2', fields: { line_user_id: uid } }] : [{ id: 'rec1', fields: { line_user_id: uid, Name: 'do not trust fallback name' } }] });
        return Response.json({ records: [{ id: 'recstaging', fields: { 'LINE User ID': uid, 'Import ID': `line_ofc_per_rename_v1_${uid.toLowerCase()}`, 'Source Hash': state === 'no_source' ? '' : 'b'.repeat(64), 'Canonical Client': [state === 'foreign' ? 'recOTHER' : 'rec1'], 'Current LINE Rename': 'ลูกค้าทดสอบ 9 เมย 68' } }] });
      };
      const data = await (await run(env)).json();
      assert.equal(data.items[0].customer, state === 'match' ? 'ลูกค้าทดสอบ 9 เมย 68' : null);
      assert.doesNotMatch(JSON.stringify(data), /do not trust|private upstream|recstaging|rec1|Uaaaa/);
    }
  } finally { globalThis.fetch = originalFetch; }
});
test('existing Money Control navigation and read-only held view have no payment decision script', async () => {
  const { env } = setup(); const normal = await handleMoneyControlWorkerHome(new Request(`${origin}/internal/admin/payments`)).text();
  assert.match(normal, /href="\/internal\/admin\/payments\?view=held-images"/); assert.match(normal, /id="extract-slip"/);
  const response = await run(env, '/internal/admin/payments?view=held-images'); const html = await response.text();
  assert.match(html, /ภาพรอตรวจ/); assert.match(html, /id="held-viewer"/); assert.match(html, /หน้านี้ไม่มีคำสั่งลบภาพ/);
  assert.doesNotMatch(html, /id="extract-slip"|id="reject-proof"|id="confirm-decision"|PAYMENT_JOB|\/decision|\/extract|type="file"/);
});
test('admin entry intercepts held route before background contact backfill', async () => {
  const source = await readFile(new URL('./src/admin-login-hero-worker.js', import.meta.url), 'utf8');
  const start = source.indexOf('async fetch(request, env, ctx)');
  assert.ok(source.indexOf('if (isHeldDocumentRequest(request))', start) < source.indexOf('scheduleLineOfcContactBackfill(runtimeEnv, ctx)', start));
});
