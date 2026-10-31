import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createLineSignature } from '../src/index.js';
import { handleKenjiSeedLineRequestWithRedeliveryRecovery } from '../src/kenji-line-redelivery-recovery.mjs';

const NOW = Date.parse('2026-10-31T15:50:00+07:00');
const USER_ID = 'U1234567890abcdef1234567890abcdef';
const CLIENT_ID = 'rec00000000000001';
const MATRIX_ID = 'rec00000000000002';
const MATRIX_TABLE = 'tblS6iRgPjYLBqZJh';
const HASH = createHash('sha256').update(`line_ofc:${USER_ID}`).digest('hex');
const SIGNUP = 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=signup&view=signup&world=private';
const COMMON = 'CARE BACK วันนี้วันสุดท้ายครับ 🖤\n'
  + 'สมาชิกใหม่: Standard 1,199 บาท/1 ปี · Premium 2,999 บาท/2 ปี พร้อม Welcome Points 66 คะแนน\n'
  + 'สมาชิกเดิมมีโปรต่ออายุ กดสมัคร/ตรวจสิทธิ์จากบัญชีเดิมก่อนชำระได้เลยครับ\n'
  + `สมัคร / เช็กสิทธิ์ → ${SIGNUP}`;

function bookingDraft(now) {
  return {
    schema: 'mmd.kenji_booking_accumulator.v1',
    draft_id: 'kbd1_prior_hiro',
    action_id: 'matrix:kbd1_prior_hiro',
    model_name: 'Hiro',
    model_working_name_hint: 'Hiro',
    status: 'collecting',
    ready: false,
    revision: 1,
    action_state: 'not_started',
    missing_fields: ['date', 'time', 'location', 'amount_thb'],
    started_at: new Date(now - 60000).toISOString(),
    updated_at: new Date(now - 60000).toISOString(),
    source_event_ids: ['prior-hiro-message'],
  };
}

// Exercise the production recovery/LV5/Seed wrapper, not the bare index Worker.
// Every external request is intercepted. No LINE, Airtable, or booking write is real.
async function harness(t, run, { now = NOW, controls = {}, matrix = {} } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now });
  const beforeFetch = globalThis.fetch;
  const draft = bookingDraft(now);
  const initialDraft = structuredClone(draft);
  let stored = {
    matrix_id: `kcm1_line_${HASH.slice(0, 20)}`,
    Client: [CLIENT_ID],
    schema_version: 'mmd.kenji_conversation_matrix.v1',
    conversation_id_hash: HASH,
    channel: 'line_ofc',
    conversation_scope: `line:${HASH.slice(0, 20)}`,
    topic: 'booking',
    subtopic: 'model_booking',
    last_customer_intent: 'model_lookup',
    conversation_stage: 'awaiting_customer',
    awaiting_from: 'customer',
    pending_action: 'collect booking date',
    handoff_required: false,
    state_updated_at: new Date(now - 60000).toISOString(),
    state_expires_at: new Date(now + 86400000).toISOString(),
    matrix_status: 'active',
    version: 1,
    payload_json: JSON.stringify({ booking_draft_v1: draft }),
    ...matrix,
  };
  const calls = { line: [], writes: [], services: [], intake: 0 };
  const env = {
    LINE_CHANNEL_SECRET: 'fixture-secret',
    LINE_CHANNEL_ACCESS_TOKEN: 'fixture-line-token',
    LINE_AUTO_REPLY_ENABLED: 'true',
    LINE_KENJI_AI_ENABLED: 'true',
    LINE_KENJI_MODEL_ENABLED: 'false',
    LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED: 'true',
    LINE_KENJI_BOOKING_INTENT_ENABLED: 'true',
    LINE_KENJI_KNOWLEDGE_ENABLED: 'false',
    KENJI_LINE_MODEL_ONLY_ENABLED: 'true',
    KENJI_LINE_CONTINUITY_ENABLED: 'true',
    AIRTABLE_API_KEY: 'fixture-airtable-token',
    AIRTABLE_BASE_ID: 'fixture-base',
    INTERNAL_TOKEN: 'fixture-internal-token',
    ADMIN_WORKER: {
      fetch: async (input) => {
        const url = input instanceof Request ? input.url : String(input);
        calls.services.push(url);
        assert.match(url, /\/kenji\/control\/runtime\/status$/, 'no booking/payment action service may run');
        return Response.json({ ok: true, controls: {
          all_kenji_mutations: false, line_oa_auto_reply: false, model_keyword_auto_reply: false, ...controls,
        } });
      },
    },
  };
  const legacyWorker = { fetch: async (request) => {
    calls.intake += 1;
    const { events = [] } = await request.json();
    return Response.json({ ok: true, saved: events.map(() => ({ ok: true })) });
  } };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = String(init.method || 'GET').toUpperCase();
    if (url.hostname === 'api.line.me') {
      assert.equal(url.pathname, '/v2/bot/message/reply');
      calls.line.push(JSON.parse(init.body));
      return Response.json({});
    }
    assert.equal(url.hostname, 'api.airtable.com', 'unexpected external request');
    if (method !== 'GET') {
      const body = JSON.parse(init.body);
      calls.writes.push({ table: url.pathname.split('/').at(-1), body });
      if (url.pathname.endsWith(`/${MATRIX_TABLE}`)) {
        const fields = body.records?.[0]?.fields || body.fields || {};
        stored = { ...stored, ...fields };
        return Response.json({ records: [{ id: MATRIX_ID, fields: stored }] });
      }
      return Response.json({ id: 'rec00000000000003', records: [] });
    }
    return Response.json({ records: url.pathname.endsWith(`/${MATRIX_TABLE}`)
      ? [{ id: MATRIX_ID, fields: stored }] : [] });
  };
  let sequence = 0;
  const send = async (message, eventChanges = {}, validSignature = true) => {
    sequence += 1;
    const item = {
      type: 'message', mode: 'active', timestamp: now,
      replyToken: `fixture-reply-${sequence}`, source: { type: 'user', userId: USER_ID },
      message: { id: `fixture-careback-${sequence}`, type: 'text', text: message },
      ...eventChanges,
    };
    const body = JSON.stringify({ events: [item] });
    const signature = validSignature ? await createLineSignature(body, env.LINE_CHANNEL_SECRET) : 'invalid';
    return handleKenjiSeedLineRequestWithRedeliveryRecovery(new Request('https://mmdbkk.com/webhooks/line', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': signature }, body,
    }), env, null, legacyWorker);
  };
  try {
    return await run({ send, calls, initialDraft, readDraft: () => JSON.parse(stored.payload_json).booking_draft_v1 });
  } finally {
    globalThis.fetch = beforeFetch;
  }
}

test('all three CARE BACK groups supersede the active Hiro intake without changing its draft', async (t) => harness(t, async ({ send, calls, initialDraft, readDraft }) => {
  for (const message of ['CARE BACK สมาชิกใหม่', 'CARE BACK สมาชิกปัจจุบัน', 'CARE BACK สมาชิกหมดอายุไม่เกิน 90 วัน']) {
    assert.equal((await send(message)).status, 200);
  }
  const answers = calls.line.map(call => call.messages[0].text.replace(/\n{2,}/g, '\n'));
  assert.deepEqual(answers, [COMMON, COMMON, COMMON]);
  assert.equal(calls.intake, 3, 'each campaign turn reaches existing durable intake');
  assert.deepEqual(readDraft(), initialDraft, 'a campaign question must not become a booking location/date');
}));

test('after the Bangkok cutoff CARE BACK still supersedes Hiro and returns the ended-campaign CTA', async (t) => harness(t, async ({ send, calls, initialDraft, readDraft }) => {
  assert.equal((await send('CARE BACK สมาชิกใหม่')).status, 200);
  assert.equal(calls.line.length, 1);
  assert.match(calls.line[0].messages[0].text, /สิ้นสุดวันที่ 31 ต\.ค\. 2569/);
  assert.match(calls.line[0].messages[0].text, /intent=status&view=overview/);
  assert.doesNotMatch(calls.line[0].messages[0].text, /Hiro|วันนี้วันสุดท้าย|1,199|66 คะแนน/);
  assert.deepEqual(readDraft(), initialDraft);
}, { now: Date.parse('2026-11-01T00:00:00+07:00') }));

test('a named-model message still uses the existing guided booking intake', async (t) => harness(t, async ({ send, calls }) => {
  assert.equal((await send('นายแบบ Hiro')).status, 200);
  assert.equal(calls.line.length, 1);
  assert.equal(calls.line[0].messages[0].text, 'รับ Hiro ไว้แล้วครับ ต้องการวันไหนครับ');
}));

for (const scope of ['all_kenji_mutations', 'line_oa_auto_reply']) {
  test(`CARE BACK delegation respects ${scope}`, async (t) => harness(t, async ({ send, calls, initialDraft, readDraft }) => {
    assert.equal((await send('CARE BACK สมาชิกใหม่')).status, 200);
    assert.equal(calls.line.length, 0);
    assert.deepEqual(readDraft(), initialDraft);
  }, { controls: { [scope]: true } }));
}

test('an invalid signature cannot touch the pending Hiro draft or send a reply', async (t) => harness(t, async ({ send, calls, initialDraft, readDraft }) => {
  assert.equal((await send('CARE BACK สมาชิกใหม่', {}, false)).status, 401);
  assert.equal(calls.line.length, 0);
  assert.equal(calls.writes.length, 0);
  assert.deepEqual(readDraft(), initialDraft);
}));
