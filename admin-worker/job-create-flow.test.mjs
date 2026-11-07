import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './src/admin-login-hero-worker.js';
import payments from '../payments-worker/index.review-wrapper.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
import { handleConfirmationDetails, parseMarkedJson } from '../payments-worker/confirmation-details.js';
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
function setup({ failPayment = false, failNotification = false, privateFixture = false } = {}) {
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
    if (req.method === 'GET' && id === MODEL) return Response.json({ id, fields: {
      working_name: 'Mira', registry_record_type: 'Existing Model Record', intake_gate_status: 'Complete',
      ...(privateFixture ? { booking_visibility: 'private', access_folder: 'standard', customer_lane: 'straight', private_service_level: 'PN' } : {}),
    } });
    if (privateFixture && req.method === 'GET' && table === 'members') {
      return Response.json({ records: [{ id: 'recFixtureMember', fields: { email: 'member@example.test' } }] });
    }
    if (privateFixture && req.method === 'GET' && table === 'member_packages') {
      return Response.json({ records: [{ fields: { status: 'active', package_code: 'standard', end_date: '2099-01-01' } }] });
    }
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
    ALLOWED_ORIGINS: 'https://mmdbkk.com',
    AIRTABLE_HTTP: { fetch },
    PAY_SESSIONS_KV: { async put(k,v) { kv.set(k,v); }, async get(k) { return kv.get(k) || null; } },
  };
  const env = { ...paymentsEnv, ADMIN_LOGIN_CREDENTIAL: 'fixture-admin', ADMIN_SESSION_SECRET: 'fixture-session', CONFIRM_KEY: 'fixture-core',
    TELEGRAM_INTERNAL_SEND_URL: 'https://notify.example.test/send', INTERNAL_TOKEN: 'fixture-notify',
    PAYMENTS_WORKER: { async fetch(req) { issuances.push(await req.clone().json()); return payments.fetch(req, paymentsEnv, {}); } },
  };
  return { env, fetch, calls, records, issuances, kv };
}
function run(body, options) {
  return submit(setup(options), body);
}

async function submit(h, body) {
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

async function readFixtureConfirmation(h, session) {
  const token = new URL(session.fldi9ZdoiUXzSv1rI).searchParams.get('t');
  const response = await handleConfirmationDetails(new Request('https://sigil.mmdbkk.com/v1/confirm/details', {
    method: 'POST',
    headers: { Origin: 'https://mmdbkk.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: token, expected_role: 'customer' }),
  }), h.env);
  assert.equal(response.status, 200);
  return response.json();
}

test('active Create Job returns only payment URL while storing confirmation links server-side', async () => {
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
  assert.match(s.fldEcDkF7CH9VixWM, /^Operator note\nSecond line$/);
  assert.equal(h.issuances[0].payment_type, 'full');
  assert.equal(h.records.get(PAYMENTS)[0].fields.fldvCSwrUW8OMAooS, 10000);
  assert.equal(h.data.payment_type, 'full');
  assert.equal(h.data.amount_due_thb, 10000);
  assert.equal(h.data.balance_amount_thb, 0);
  assert.equal(Object.hasOwn(h.data, 'deposit_amount_thb'), false);
  assert.equal(h.kv.size, 2);
  assert.match(h.data.customer_payment_url, /^https:\/\/mmdbkk\.com\/sigil\/pay\?t=/);
  assert.equal(h.data.payment_dispatch_state, 'awaiting_payment_approval');
  assert.equal(h.data.confirmation_release_state, 'held_until_payment_approved');
  assert.equal(Object.hasOwn(h.data, 'customer_confirmation_url'), false);
  assert.equal(Object.hasOwn(h.data, 'model_confirmation_url'), false);
  assert.equal(Object.hasOwn(h.data, 'raw'), false);
  assert.match(s.fldi9ZdoiUXzSv1rI, /\/confirm\/job-confirmation\?t=/);
  assert.match(s.fld0mFma9J9yfEaKb, /\/confirm\/job-model\?t=/);
});

test('Public Job V2 persists an operational brief and uses format as canonical job type', async () => {
  const body = form();
  body.public_job = {
    schema_version: 'mmd_public_job_v2',
    format: 'event',
    duties: 'Host guests and provide event presence',
    customer_count: 8,
    care_count: 3,
    special_care_names: 'คุณ A, คุณ B',
    model_count: 3,
    model_assignment_note: 'Lead Model handles A/B; remaining staff cover the group',
    presentation_note: 'Black smart casual',
    remark: 'Public event brief',
  };
  body.job_details = { world: 'public', public_job: body.public_job };
  const h = await run(body);
  assert.equal(h.status, 200, JSON.stringify(h.data));
  assert.equal(h.issuances.length, 1);
  assert.equal(h.issuances[0].job_type, 'event');
  assert.equal(h.data.public_job.format, 'event');
  assert.equal(h.data.public_job.model_count, 3);
  const note = String(h.records.get(SESSIONS)[0].fields.fldEcDkF7CH9VixWM || '');
  const marker = note.match(/\[MMD PUBLIC JOB v2\]\s+(\{[^\n]+\})/);
  assert.ok(marker, note);
  const brief = JSON.parse(marker[1]);
  assert.equal(brief.customer_count, 8);
  assert.equal(brief.care_count, 3);
  assert.equal(brief.model_count, 3);
  assert.equal(brief.duties, 'Host guests and provide event presence');
});

test('Public Job rejects PN/VIP semantics before any payment issuer call', async () => {
  for (const jobType of ['pn', 'vip']) {
    const body = form();
    body.job_type = jobType;
    body.job_visibility = 'public';
    const h = await run(body);
    assert.equal(h.status, 400, JSON.stringify(h.data));
    assert.equal(h.issuances.length, 0);
    assert.equal(h.records.size, 0);
  }
});

test('Public Job V2 rejects care count above customer count', async () => {
  const body = form();
  body.public_job = {
    schema_version: 'mmd_public_job_v2',
    format: 'dining',
    duties: 'Guest care',
    customer_count: 2,
    care_count: 3,
    model_count: 1,
  };
  body.job_details = { world: 'public', public_job: body.public_job };
  const h = await run(body);
  assert.equal(h.status, 400, JSON.stringify(h.data));
  assert.equal(h.issuances.length, 0);
  assert.equal(h.records.size, 0);
});

test('Create Job preserves negotiated discount into SIGIL Pricing v1', async () => {
  const body = form();
  body.payment = {
    ...body.payment,
    amount_thb: 25000,
    original_amount_thb: 30000,
    pricing_adjustment: 'discount',
    payment_type: 'deposit',
  };
  const h = await run(body);
  assert.equal(h.status, 200, JSON.stringify(h.data));
  assert.equal(h.issuances.length, 1);
  assert.equal(h.issuances[0].amount_thb, 25000);
  assert.equal(h.issuances[0].original_amount_thb, 30000);
  assert.equal(h.issuances[0].pricing_adjustment, 'discount');

  const s = h.records.get(SESSIONS)[0].fields;
  const marker = String(s.fldEcDkF7CH9VixWM || '').match(/\[SIGIL Pricing v1\]\s+(\{[^\n]+\})/);
  assert.ok(marker, s.fldEcDkF7CH9VixWM);
  const pricing = JSON.parse(marker[1]);
  assert.equal(pricing.full_price_thb, 30000);
  assert.equal(pricing.discount_mode, 'amount');
  assert.equal(pricing.discount_thb, 5000);
  assert.equal(pricing.net_price_thb, 25000);
  assert.equal(pricing.deposit_basis_thb, 25000);
  assert.equal(pricing.deposit_due_thb, 7500);
  assert.equal(pricing.balance_thb, 17500);
});

for (const visibility of ['private', 'public']) {
  test(`discounted ${visibility} job keeps travel in the total and preserves confirmation pricing with a long note`, async () => {
    const body = form();
    const privateFixture = visibility === 'private';
    Object.assign(body, {
      job_visibility: visibility,
      travel_fee_thb: 1000,
      original_amount_thb: 21000,
      pricing_adjustment: 'discount',
      discount_kind: 'coupon',
      notes: { handling: 'Long operator note '.repeat(220) },
      job_details: { brief: 'Fixture arrival instructions' },
      payment: { amount_thb: 19000, service_amount_thb: 18000, pay_model_thb: 8000, payment_type: 'deposit' },
    });
    if (privateFixture) {
      body.job_type = 'pn';
      body.work = { job_visibility: 'private', job_type: 'pn', service_options: [] };
      body.private_access = { selected_private_folder: 'standard', selected_orientation: 'straight', settlement_mode: 'direct' };
      body.service_pricing = { version: 1, currency: 'THB', settlement_mode: 'direct', addons: [],
        client_base_amount_thb: 20000, client_gross_amount_thb: 20000, client_total_amount_thb: 18000,
        model_base_payout_thb: 8000, model_gross_payout_thb: 8000, model_total_payout_thb: 8000,
        discount: { mode: 'customer_request', type: 'amount', value: 2000, amount_thb: 2000,
          mmd_share_thb: 2000, model_share_thb: 0, kind: 'coupon' } };
    } else {
      body.public_job = { schema_version: 'mmd_public_job_v2', format: 'event',
        duties: 'Host the event', customer_count: 1, care_count: 0 };
    }

    const h = await run(body, { privateFixture });
    assert.equal(h.status, 200, JSON.stringify(h.data));
    assert.equal(h.data.balance_amount_thb, 13500);
    assert.equal(h.issuances[0].service_amount_thb, 18000);
    assert.equal(h.issuances[0].amount_thb, 19000);
    assert.equal(h.records.get(JOBS)[0].fields.Budget, 19000);
    const session = h.records.get(SESSIONS)[0].fields;
    assert.equal(session.fldhwC79ndbnEXSZz, 19000);
    assert.equal(session.fldlTO5aNfqUmlNWm, 8000);
    assert.equal(h.records.get(PAYMENTS)[0].fields.fldvCSwrUW8OMAooS, 5500);
    assert.ok(session.fldEcDkF7CH9VixWM.length <= 4000);
    assert.equal(parseMarkedJson(session.fldEcDkF7CH9VixWM, 'MMD Model Remark v1').text, 'Fixture arrival instructions');
    const snapshot = privateFixture ? 'MMD SERVICE PRICING v1' : 'MMD PUBLIC JOB v2';
    assert.ok(parseMarkedJson(session.fldEcDkF7CH9VixWM, snapshot));

    const details = await readFixtureConfirmation(h, session);
    assert.equal(details.pricing.full_price_thb, 21000);
    assert.equal(details.pricing.discount_kind, 'coupon');
    assert.equal(details.pricing.net_price_thb, 19000);
    assert.equal(details.pricing.deposit_basis_thb, 18000);
    assert.equal(details.pricing.deposit_due_thb, 5500);
    assert.equal(details.pricing.balance_thb, 13500);
    assert.equal(details.billing.total_thb, 19000);
    assert.equal(details.billing.travel_treatment, 'included');
    assert.equal(details.payment.amount_due_thb, 5500);
    if (privateFixture) assert.deepEqual(details.billing.service_items, [{ label: 'PN', amount_thb: 20000 }]);
  });
}

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

test('held job release keeps the quoted deposit and both travel amounts', async () => {
  const body = form();
  delete body.client.client_id;
  delete body.canonical_only;
  delete body.create_context;
  Object.assign(body, {
    operational_create_mode: 'pending_client_link',
    travel_fee_thb: 1000,
    model_travel_fee_thb: 600,
    original_amount_thb: 21000,
    pricing_adjustment: 'discount',
    discount_kind: 'coupon',
    notes: { handling: 'Long operator note '.repeat(220) },
    payment: { amount_thb: 19000, service_amount_thb: 18000, pay_model_thb: 8000, payment_type: 'deposit' },
  });
  const h = await run(body);
  assert.equal(h.status, 200, JSON.stringify(h.data));
  assert.equal(h.records.has(PAYMENTS), false);
  const session = h.records.get(SESSIONS)[0].fields;
  assert.equal(parseMarkedJson(session.fldEcDkF7CH9VixWM, 'SIGIL Pricing v1').deposit_due_thb, 5500);

  const reconcile = { operational_create_mode: 'reconcile_held', session_id: h.data.session_id,
    client_record_id: CLIENT, model_record_id: MODEL };
  const released = await submit(h, reconcile);
  assert.equal(released.status, 200, JSON.stringify(released.data));
  assert.equal(released.data.pricing_breakdown.deposit_due_thb, 5500);
  assert.equal(released.data.pricing_breakdown.balance_thb, 13500);
  assert.equal(released.data.pricing_breakdown.discount_kind, 'coupon');
  assert.equal(session.fld703jI4zQ0CYMHh, 1000);
  assert.equal(session.fldqYkGm9Vd3P366W, 600);
  assert.equal(h.records.get(PAYMENTS)[0].fields.fldvCSwrUW8OMAooS, 5500);
  const details = await readFixtureConfirmation(h, session);
  assert.equal(details.pricing.deposit_basis_thb, 18000);
  assert.equal(details.pricing.deposit_due_thb, 5500);
  assert.equal(details.payment.amount_due_thb, 5500);
  assert.equal(details.billing.total_thb, 19000);
  assert.equal(details.billing.discount_kind, 'coupon');

  const replay = await submit(h, reconcile);
  assert.equal(replay.data.idempotent_replay, true);
  assert.equal(h.records.get(PAYMENTS).length, 1);
  assert.equal(h.issuances.length, 2);
});

test('JSON-shaped operator text is truncated without dropping Confirmation pricing', async () => {
  const body = form();
  body.notes.handling = '[Operator export] ' + JSON.stringify({ text: 'a'.repeat(3800) });
  body.payment.payment_type = 'deposit';
  const h = await run(body);
  assert.equal(h.status, 200, JSON.stringify(h.data));
  const session = h.records.get(SESSIONS)[0].fields;
  assert.ok(session.fldEcDkF7CH9VixWM.length <= 4000);
  assert.match(session.fldEcDkF7CH9VixWM, /\[Operator export\]/);
  const details = await readFixtureConfirmation(h, session);
  assert.equal(details.pricing.full_price_thb, 10000);
  assert.equal(details.pricing.deposit_due_thb, 3000);
  assert.equal(details.payment.amount_due_thb, 3000);
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

test('a renewal equal to the travel fee stays out of the Job Budget and service balance', async () => {
  const body = form();
  body.travel_fee_thb = 3000;
  body.payment.payment_type = 'deposit';
  body.membership_action = { type: 'renew', renewal_amount_thb: 3000, include_in_payment: true, tier_hint: 'standard' };
  const h = await run(body);
  assert.equal(h.status, 200, JSON.stringify(h.data));
  assert.equal(h.data.balance_amount_thb, 7000);
  assert.equal(h.records.get(SESSIONS)[0].fields.fldhwC79ndbnEXSZz, 10000);
  assert.equal(h.records.get(JOBS)[0].fields.Budget, 10000);
  assert.equal(h.records.get(PAYMENTS)[0].fields.fldvCSwrUW8OMAooS, 13000);
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
