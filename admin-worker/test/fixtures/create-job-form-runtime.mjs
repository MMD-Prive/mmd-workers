// In-memory Airtable, KV and notification fixtures. No external request can escape.
import assert from 'node:assert/strict';
import worker from '../../src/admin-login-hero-worker.js';
import payments from '../../../payments-worker/index.review-wrapper.js';
import { createCredentialBoundAdminSession } from '../../src/credential-bound-admin-session.js';

const CLIENT = 'recCLIENT00000001';
const MODEL = 'recMODEL000000001';
const SESSIONS = 'tblC98mKWbzmPuNzX';
const PAYMENTS = 'tblWGGJJOx5eBvBZJ';
const JOBS = 'tbl0jxIjN8QYwGABX';
export function setup({ failPayment = false, failNotification = false, privateJob = false } = {}) {
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
    if (req.method === 'GET' && id === CLIENT) return Response.json({ id, fields: { 'Client Name': 'Client', line_user_id: privateJob ? 'U11111111111111111111111111111111' : 'U-client' } });
    if (req.method === 'GET' && id === MODEL) return Response.json({ id, fields: { working_name: 'Mira', registry_record_type: 'Existing Model Record', intake_gate_status: 'Complete', ...(privateJob ? {model_lookup_key:'private/standard/Mira',booking_visibility:'private',access_folder:'standard',customer_lane:'gay',status:'active',availability_status:'available',available_now:true,private_service_level:'pn'} : {}) } });
    if (req.method === 'GET' && table === 'fast_trust_staging' && privateJob) return Response.json({records:[{id:'recSTAGING0000001',fields:{'LINE User ID':'U11111111111111111111111111111111','Current LINE Rename':'Synthetic - SVIP -','Canonical Client':[CLIENT]}}]});
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
    AIRTABLE_FAST_TRUST_LINE_OFC_STAGING_TABLE:'fast_trust_staging', AUTH_SERVICE_ADMIN_TO_PAYMENTS: 'fixture-service', PAYMENT_CONFIRMATION_SIGNING_SECRET: 'fixture-signing',
    AIRTABLE_HTTP: { fetch },
    PAY_SESSIONS_KV: { async put(k,v) { kv.set(k,v); }, async get(k) { return kv.get(k) || null; } },
  };
  const env = { ...paymentsEnv, ADMIN_LOGIN_CREDENTIAL: 'fixture-admin', ADMIN_SESSION_SECRET: 'fixture-session', CONFIRM_KEY: 'fixture-core',
    TELEGRAM_INTERNAL_SEND_URL: 'https://notify.example.test/send', INTERNAL_TOKEN: 'fixture-notify',
    PAYMENTS_WORKER: { async fetch(req) { issuances.push(await req.clone().json()); return payments.fetch(req, paymentsEnv, {}); } },
  };
  return { env, fetch, calls, records, issuances, kv };
}
export async function run(body, options = {}) {
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

