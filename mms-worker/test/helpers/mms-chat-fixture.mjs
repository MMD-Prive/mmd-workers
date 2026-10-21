import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { MmsChatStore } from '../../src/mms-chat-store.mjs';

export const CUSTOMER = { role: 'customer', id: 'mmsmem_' + 'a'.repeat(32) };
export const OTHER_CUSTOMER = { role: 'customer', id: 'mmsmem_' + 'b'.repeat(32) };
export const THERAPIST = { role: 'therapist', id: 'mmst_' + 'c'.repeat(24) };
export const OTHER_THERAPIST = { role: 'therapist', id: 'mmst_' + 'd'.repeat(24) };
export const THREAD = 'mmschat_' + 'e'.repeat(32);
export const ORIGIN = 'https://www.mmdbkk.com';
export const ROOM = { thread_id: THREAD, customer_id: CUSTOMER.id, therapist_id: THERAPIST.id, therapist_label: 'Test Therapist' };

export function database() {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: { exec(query, ...args) {
      if (query.trim().startsWith('CREATE TABLE')) { db.exec(query); return { toArray: () => [] }; }
      const statement = db.prepare(query);
      const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
      return { toArray: () => rows.map(row => ({ ...row })) };
    } },
    transactionSync(fn) { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
  return { db, storage, store: new MmsChatStore(storage) };
}

export function fixture() {
  const instances = new Map();
  const zones = [{ id: 'recZone000000001', fields: { 'Zone Code': 'BKK-SILOM', 'Province Code': 'BKK', 'Province TH': 'กรุงเทพฯ', 'Zone Name TH': 'สีลม', Active: true } }];
  const record = { id: 'recTherapist0001', fields: {
    'Therapist ID': THERAPIST.id, 'Display Name': 'Test Therapist', Status: 'Active', 'Therapist Auth Status': 'Active',
    'MY MMS Access': 'Approved', 'LINE Subject Hash': 'private-subject-hash', 'Matching Enabled': true,
    'Availability Status': 'Available', 'Base Service Zone': [zones[0].id], 'Coverage Service Zones': [zones[0].id],
  } };
  const manifest = { profile_visibility: 'public', intro: 'สอบถามรายละเอียดคอร์สได้ครับ', courses: [{ name: 'Aroma', duration_minutes: 60, price_thb: 1500 }] };
  const env = {
    MMS_DIRECT_CHAT: { getByName(name) { if (!instances.has(name)) instances.set(name, database()); return instances.get(name).store; } },
    MMS_PRIVATE_UPLOADS: { async get() { return { text: async () => JSON.stringify(manifest) }; } },
    AIRTABLE_API_TOKEN: 'fixture-token-not-real', AIRTABLE_BASE_ID: 'appAAAAAAAAAAAAAA',
    AIRTABLE_THERAPISTS_TABLE_ID: 'tblBBBBBBBBBBBBBB', AIRTABLE_SERVICE_ZONES_TABLE_ID: 'tblCCCCCCCCCCCCCC',
    MMS_THERAPIST_AUTH_ENABLED: 'true', MMS_THERAPIST_SESSION_SECRET: 'fixture-session-secret-for-chat-tests-only-123456789',
    ALLOWED_ORIGINS: ORIGIN,
  };
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (url.pathname.endsWith(env.AIRTABLE_SERVICE_ZONES_TABLE_ID)) return Response.json({ records: zones });
    if (url.pathname.endsWith(env.AIRTABLE_THERAPISTS_TABLE_ID)) return Response.json({ records: [record] });
    throw new Error('Unexpected network call in fixture');
  };
  return { env, instances, manifest, record, calls, restore() { globalThis.fetch = original; for (const item of instances.values()) item.db.close(); } };
}

export function cookie(env, therapistId = THERAPIST.id) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ v: 1, role: 'mms_therapist', therapist_id: therapistId, iat: now, exp: now + 600 })).toString('base64url');
  const signature = createHmac('sha256', env.MMS_THERAPIST_SESSION_SECRET).update(`mms-therapist-session-v1.${payload}`).digest('hex');
  return `__Secure-mms_therapist_session=v1.${payload}.${signature}`;
}
