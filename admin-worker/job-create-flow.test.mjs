import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './src/admin-login-hero-worker.js';
import payments from '../payments-worker/index.review-wrapper.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
import { parseSigilMembershipPaymentComponents } from '../payments-worker/sigil-membership-payment-components.js';

const CLIENT = 'recCLIENT00000001';
const MODEL = 'recMODEL000000001';
const SESSIONS = 'tblC98mKWbzmPuNzX';
const PAYMENTS = 'tblWGGJJOx5eBvBZJ';
const JOBS = 'tbl0jxIjN8QYwGABX';
function form() {
  return { canonical_only: true, create_context: 'internal_create_job',
    client: { client_id: CLIENT, name: 'Client', line: { user_id: 'U-client' } },
    work_type: 'public', job_visibility: 'public', model_folder: 'travel',
    model: { model_id: MODEL, model_name: 'Mira', lookup_key: 'public/travel/Mira' },
    schedule: { date: '2026-09-20', start: '22:00', end: '02:00', duration: '04:00' },
    location: { text: 'Bangkok', map_url: 'https://maps.google.com/?q=Bangkok' },
    payment: { amount_thb: 10000, pay_model_thb: 7000, payment_type: 'full' },
    notes: { handling: 'Operator note', internal: 'Second line' },
  };
}
function setup({ failPayment = false, failNotification = false } = {}) {
  const records = new Map();
  const calls = [], issuances = [], kv = new Map();
  let serial = 0;
  async function fetch(input, init) {
    const req = input instanceof Request && !init ? input : new Request(input, init);
    const url = new URL(req.url);
    if (url.hostname === 'notify.example.test') {
      calls.push({ table: 'notification', method: req.method });
      return Response.json({ ok: !failNotification }, { status: failNotification ? 502 : 200 });
    }
    assert.equal(url.hostname, 'api.airtable.com', 'All external calls must be intercepted');
    const [, , , table, id] = url.pathname.split('/');
    const body = req.method === 'GET' ? null : await req.json();
    calls.push({ table, id, method: req.method, body });
    if (req.method === 'GET' && id === CLIENT) return Response.json({ id, fields: { 'Client Name': 'Client', line_user_id: 'U-client' } });
    if (req.method === 'GET' && id === MODEL) return Response.json({ id, fields: { working_name: 'Mira', registry_record_type: 'Existing Model Record', intake_gate_status: 'Complete' } });
    const rows = records.get(table) || [];
    if (req.method === 'GET') return Response.json({ records: rows });
    if (failPayment && table === PAYMENTS) return Response.json({ error: { message: 'fixture_payment_write_failure' } }, { status: 503 });
    if (req.method === 'PATCH') {
      const row = rows.find(r => r.id === id);
      assert.ok(row, 'Cannot patch a record that was never created');
      Object.assign(row.fields, body.fields);
      return Response.json(row);
    }
    assert.equal(req.method, 'POST');
    const row = { id: 'rec' + String(++serial).padStart(14, '0'), fields: { ...(body.records?.[0]?.fields || body.fields) } };
    // Airtable returns named fields to the admin linkage readers.
    if (table === SESSIONS) row.fields.session_id = row.fields.fldLTq2kZbyRv22IA;
    rows.push(row); records.set(table, rows);
    return Response.json(body.records ? { records: [row] } : row);
  }
  const paymentsEnv = {
    AIRTABLE_BASE_ID: 'test-base', AIRTABLE_API_KEY: 'fixture-key',
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: 'fixture-service', PAYMENT_CONFIRMATION_SIGNING_SECRET: 'fixture-signing',
    AIRTABLE_HTTP: { fetch },
    PAY_SESSIONS_KV: { async put(k,v) { kv.set(k,v); }, async get(k) { return kv.get(k) || null; } },
  };
  const env = { ...paymentsEnv, ADMIN_LOGIN_CREDENTIAL: 'fixture-admin', ADMIN_SESSION_SECRET: 'fixture-session', CONFIRM_KEY: 'fixture-core',
    TELEGRAM_INTERNAL_SEND_URL: 'https://notify.example.test/send', INTERNAL_TOKEN: 'fixture-notify',
    PAYMENTS_WORKER: { async fetch(req) { issuances.push(await req.clone().json()); return payments.fetch(req, paymentsEnv, {}); } },
  };
  return { env, fetch, calls, records, issuances, kv };
}
async function run(body, options = {}) {
  const h = setup(options);
  const original = globalThis.fetch;
  globalThis.fetch = h.fetch;
  try {
    const token = await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'), { id: 'fixture-owner', role: 'owner' }, h.env);
    const response = await worker.fetch(new Request('https://mmdbkk.com/v1/admin/job/create', {
      method: 'POST', headers: { Cookie: 'mmd_admin_gate_v1=' + token, Origin: 'https://mmdbkk.com', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }), h.env, {});
    return { ...h, status: response.status, data: await response.json() };
  } finally { globalThis.fetch = original; }
}

test('active Create Job form reaches canonical Session, Payment and Job with correct links and payout', async () => {
  const h = await run(form());
  assert.equal(h.status, 200, JSON.stringify(h.data));
  assert.equal(h.data.linkage.status, 'linked');
  assert.equal(h.issuances.length, 1);
  assert.equal(h.records.get(SESSIONS).length, 1);
  assert.equal(h.records.get(PAYMENTS).length, 1);
  assert.equal(h.records.get(JOBS).length, 1);
  const s = h.records.get(SESSIONS)[0].fields;
  assert.deepEqual(s.Client, [CLIENT]); assert.deepEqual(s['Canonical Model'], [MODEL]);
  assert.equal(s.fldlTO5aNfqUmlNWm, 7000);
  assert.equal(s.fldBeG0FkWwa8kgnp, '2026-09-20T22:00:00+07:00');
  assert.equal(s.fldiDSz0wW9Ct9I3P, '2026-09-21T02:00:00+07:00');
  assert.equal(s.fldEcDkF7CH9VixWM, 'Operator note\nSecond line');
  assert.equal(h.kv.size, 2);
  assert.match(h.data.customer_confirmation_url, /\?t=/);
});

for (const visibility of ['private', 'public']) test(`pending ${visibility} creates an operational Job without Payment, tokens, notification or reconfirm`, async () => {
  const body = form();
  delete body.client.client_id; delete body.canonical_only; delete body.create_context;
  body.job_visibility = visibility;
  body.operational_create_mode = 'pending_client_link';
  const h = await run(body);
  assert.equal(h.status, 200, JSON.stringify(h.data));
  assert.equal(h.data.operational_status, 'pending_client_link');
  assert.equal(h.records.get(SESSIONS).length, 1);
  assert.equal(h.records.get(JOBS).length, 1);
  assert.equal(h.records.has(PAYMENTS), false);
  assert.equal(h.kv.size, 0);
  assert.equal(h.calls.some(c => c.table === 'notification'), false);
  assert.equal(h.data.payment_ref, null);
  assert.equal(h.issuances[0].client_name, undefined, 'An older issuer must fail validation before writing');
  assert.equal(h.issuances[0].held_job.client_name, 'Client');
  assert.equal(h.data.customer_confirmation_url, null);
  const s = h.records.get(SESSIONS)[0].fields;
  assert.equal(s.fldi9ZdoiUXzSv1rI, undefined);
  assert.equal(s.reconfirm_status, undefined);
  assert.match(s.fldEcDkF7CH9VixWM, /MMD_JOB_HOLD_V1/);
  assert.match(h.records.get(JOBS)[0].fields['Internal Notes'], /PENDING CLIENT LINK/);
});

test('strict create without canonical Client fails before any write or issuer call', async () => {
  const body = form(); delete body.client.client_id;
  const h = await run(body);
  assert.equal(h.status, 400);
  assert.equal(h.data.error, 'canonical_client_required');
  assert.equal(h.calls.length, 0); assert.equal(h.issuances.length, 0);
});

test('combined renewal persists service-only Session/Job and total Payment with a parseable note', async () => {
  const body = form();
  body.membership_action = { type: 'renew', renewal_amount_thb: 3000, include_in_payment: true, tier_hint: 'standard' };
  const h = await run(body);
  assert.equal(h.status, 200, JSON.stringify(h.data));
  assert.equal(h.records.get(SESSIONS)[0].fields.fldhwC79ndbnEXSZz, 10000);
  assert.equal(h.records.get(JOBS)[0].fields.Budget, 10000);
  const p = h.records.get(PAYMENTS)[0].fields;
  assert.equal(p.fldvCSwrUW8OMAooS, 13000);
  assert.equal(parseSigilMembershipPaymentComponents(p.fldjsZIKoJPawlb2u, 13000).service_amount_thb, 10000);
  assert.match(p.fldjsZIKoJPawlb2u, /\nOperator note\nSecond line/);
  assert.equal(h.data.membership_action.entitlement_mutation_allowed, false);
  assert.deepEqual([...h.records.keys()].sort(), [SESSIONS, PAYMENTS, JOBS].sort());
});

test('notification failure preserves successful create and recovery references', async () => {
  const h = await run(form(), { failNotification: true });
  assert.equal(h.status, 200, JSON.stringify(h.data));
  assert.equal(h.data.notification_status, 'failed');
  assert.equal(h.data.linkage.status, 'linked');
  assert.equal(h.issuances.length, 1);
  assert.ok(h.data.session_id); assert.ok(h.data.payment_ref);
});

test('partial issuer write returns uncertain outcome and identifiers without automatic retry', async () => {
  const h = await run(form(), { failPayment: true });
  assert.equal(h.status, 503, JSON.stringify(h.data));
  assert.equal(h.data.creation_outcome, 'unknown');
  assert.ok(h.data.session_id); assert.ok(h.data.payment_ref);
  assert.equal(h.issuances.length, 1);
  assert.equal(h.records.get(SESSIONS).length, 1);
  assert.equal(h.kv.size, 0);
});
