import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { wireMmsApproveUi, MMS_APPROVE_UI_MARKER } from './src/mms-admin-approve-ui.js';
import { wireMmsJobsUi, MMS_JOBS_UI_MARKER } from './src/mms-admin-jobs-ui.js';
import {
  appendMmsJobReceipt,
  buildMmsCanonicalJobPayload,
  linkedPrebookingFromNotes,
  linkedSessionFromNotes,
} from './src/mms-job-bridge.js';
import { renderMmsAdminPage } from './src/mms-admin-page.js';

const runtimeSource = readFileSync(new URL('./src/mms-admin-runtime.js', import.meta.url), 'utf8');
const loginWrapperSource = readFileSync(new URL('./src/admin-login-hero-worker.js', import.meta.url), 'utf8');

test('MMS admin exposes the real approve action for therapist applications', () => {
  const source = renderMmsAdminPage();
  assert.match(source, /data-app-approve=/);
  assert.match(source, /อนุมัติเป็น Therapist/);
  assert.match(source, /approve_to_therapist:approve/);
});

test('approve wiring verifies safe therapist state and opens Therapist review', () => {
  const wired = wireMmsApproveUi(renderMmsAdminPage());
  assert.ok(wired.includes(MMS_APPROVE_UI_MARKER));
  assert.match(wired, /therapist\.status!=='Review'/);
  assert.match(wired, /therapist\.availability_status!=='Paused'/);
  assert.match(wired, /therapist\.matching_enabled!==false/);
  assert.match(wired, /showTab\('therapists',true\)/);
  assert.match(wired, /Review · Paused · Matching OFF/);
  assert.match(wired, /data-approve-highlight/);
  assert.match(wired, /mmsApproveDiagnostics\.record\(therapist\)/);
});

test('admin includes one-tap production diagnostics and recent approval receipt', () => {
  const wired = wireMmsApproveUi(renderMmsAdminPage());
  assert.match(wired, /id="mmsDiagDock"/);
  assert.match(wired, /ตรวจระบบ MMS/);
  assert.match(wired, /\/v1\/admin\/mms\/system-check/);
  assert.match(wired, /mms_admin_recent_approvals_v1/);
  assert.match(wired, /เพิ่งอนุมัติจากเครื่องนี้/);
  assert.match(wired, /Applications/);
  assert.match(wired, /Therapists/);
  assert.match(wired, /Airtable/);
  assert.match(wired, /R2/);
  assert.match(wired, /Matching/);
});

test('system check proves backend read paths without mutating bookings or therapist state', () => {
  assert.ok(runtimeSource.includes('`${API_PREFIX}/system-check`'));
  assert.ok(runtimeSource.includes('`${INTERNAL_BASE}/health`'));
  assert.match(runtimeSource, /internal\/mms\/admin\/snapshot/);
  assert.match(runtimeSource, /mms\/api\/therapists\/match/);
  assert.match(runtimeSource, /recipient_gender: "ผู้ชาย"/);
  assert.match(runtimeSource, /zone: "sukhumvit"/);
  assert.match(runtimeSource, /skills: \["aroma_therapy_oil"\]/);
  assert.match(runtimeSource, /airtable: Boolean\(health\?\.bindings\?\.airtable && snapshotReady\)/);
  assert.match(runtimeSource, /r2: Boolean\(health\?\.bindings\?\.private_uploads\)/);
});

test('MMS browser page participates in the credential-bound admin session gate', () => {
  const gateStart = loginWrapperSource.indexOf('function isCredentialBoundAdminPath(path)');
  const gateEnd = loginWrapperSource.indexOf('async function hasValidServiceAuth', gateStart);
  assert.ok(gateStart >= 0 && gateEnd > gateStart);
  const gateSource = loginWrapperSource.slice(gateStart, gateEnd);
  assert.match(gateSource, /path === "\/internal\/admin\/mms"/);

  const redirectStart = loginWrapperSource.indexOf('const session = await readCredentialBoundAdminSession');
  const redirectEnd = loginWrapperSource.indexOf('const bypass = clean', redirectStart);
  assert.ok(redirectStart >= 0 && redirectEnd > redirectStart);
  const redirectSource = loginWrapperSource.slice(redirectStart, redirectEnd);
  assert.match(redirectSource, /path === "\/internal\/admin\/mms"/);
});

test('approve wiring is idempotent and preserves ordinary application save behavior', () => {
  const once = wireMmsApproveUi(renderMmsAdminPage());
  const twice = wireMmsApproveUi(once);
  assert.equal(twice, once);
  assert.match(once, /setRuntime\('บันทึกใบสมัครแล้ว','ok'\)/);
});

test('MMS jobs wiring adds a canonical work lane and explicit create-job action', () => {
  const once = wireMmsJobsUi(renderMmsAdminPage());
  const twice = wireMmsJobsUi(once);
  assert.equal(twice, once);
  assert.ok(once.includes(MMS_JOBS_UI_MARKER));
  assert.match(once, /งาน MMS/);
  assert.match(once, /สร้างงาน MMD/);
  assert.match(once, /\/v1\/admin\/mms/);
  assert.match(once, /\/jobs/);
  assert.match(once, /\/prebookings\/.*\/job/);
  assert.match(once, /amount_thb:amount/);
  assert.match(once, /payment_type:payment/);
  assert.match(once, /Confirmed แล้ว/);
});

test('MMS ops home surfaces real applicant, coordination, and canonical work lanes', () => {
  const wired = wireMmsJobsUi(renderMmsAdminPage());
  assert.match(wired, /MMS TODAY/);
  assert.match(wired, /คนสมัครใหม่/);
  assert.match(wired, /ต้องประสานต่อ/);
  assert.match(wired, /งาน MMS ล่าสุด/);
  assert.match(wired, /Promise\.allSettled\(\[api\('\/snapshot'\),api\('\/jobs'\)\]\)/);
  assert.match(wired, /grid-auto-flow:column/);
  assert.match(wired, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test('MMS canonical job classifier recognizes the public service taxonomy', () => {
  for (const lane of [
    'aroma_therapy_oil',
    'thai_massage',
    'sport_massage',
    'office_syndrome',
    'health_fitness_advisor',
    'thai_herbal_compress',
    'partner_present',
    'partner_present_massage_session',
    'women_massage',
  ]) {
    assert.match(runtimeSource, new RegExp('"' + lane + '"'));
  }
  assert.match(runtimeSource, /MMS_JOB_LANES\.has\(lane\)/);
});

test('MMS confirmed prebooking maps to canonical job contract without inventing payment truth', () => {
  const payload = buildMmsCanonicalJobPayload({
    prebooking_id: 'mmspre_0123456789abcdef01234567',
    member_ref: 'member_demo',
    matched_therapist_ids: ['ther_01'],
    selected_skills: ['aroma_therapy_oil'],
    service_date: '2026-09-03',
    service_time: '18:30',
    duration_minutes: 90,
    zone: 'sukhumvit',
    status: 'Confirmed',
  }, [{ therapist_id: 'ther_01', display_name: 'Therapist Demo' }], {
    amount_thb: 2500,
    payment_type: 'deposit',
  });

  assert.equal(payload.client_name, 'member_demo');
  assert.equal(payload.model_name, 'Therapist Demo');
  assert.equal(payload.job_type, 'MMS');
  assert.equal(payload.job_date, '2026-09-03');
  assert.equal(payload.start_time, '18:30');
  assert.equal(payload.end_time, '20:00');
  assert.equal(payload.location_name, 'sukhumvit');
  assert.equal(payload.amount_thb, 2500);
  assert.equal(payload.payment_type, 'deposit');
  assert.match(payload.note, /MMS_PREBOOKING:mmspre_0123456789abcdef01234567/);
  assert.doesNotMatch(payload.note, /paid|verified/i);
});

test('MMS job bridge fails closed before canonical creation when required truth is missing', () => {
  const base = {
    prebooking_id: 'mmspre_0123456789abcdef01234567',
    member_ref: 'member_demo',
    matched_therapist_ids: ['ther_01'],
    service_date: '2026-09-03',
    service_time: '18:30',
    duration_minutes: 90,
    zone: 'sukhumvit',
    status: 'Confirmed',
  };
  const therapists = [{ therapist_id: 'ther_01', display_name: 'Therapist Demo' }];

  assert.throws(() => buildMmsCanonicalJobPayload(base, therapists, { payment_type: 'full' }), /mms_amount_required/);
  assert.throws(() => buildMmsCanonicalJobPayload({ ...base, status: 'Matching' }, therapists, { amount_thb: 2500, payment_type: 'full' }), /mms_prebooking_not_confirmed/);
  assert.throws(() => buildMmsCanonicalJobPayload({ ...base, matched_therapist_ids: [] }, therapists, { amount_thb: 2500, payment_type: 'full' }), /mms_matched_therapist_required/);
});

test('MMS job receipts preserve a server-side link back to the prebooking', () => {
  const receipt = appendMmsJobReceipt('operator note', {
    prebookingId: 'mmspre_0123456789abcdef01234567',
    sessionId: 'sess_123',
    paymentRef: 'pay_123',
  });
  assert.equal(linkedPrebookingFromNotes(receipt), 'mmspre_0123456789abcdef01234567');
  assert.equal(linkedSessionFromNotes(receipt), 'sess_123');
});

test('MMS runtime exposes canonical jobs read and explicit prebooking-to-job bridge', () => {
  assert.match(runtimeSource, /wireMmsJobsUi/);
  assert.match(runtimeSource, /`\$\{API_PREFIX\}\/jobs`/);
  assert.match(runtimeSource, /prebookings\\\/\(mmspre_/);
  assert.match(runtimeSource, /\/job\$/);
  assert.match(runtimeSource, /coreWorker\.fetch/);
  assert.match(runtimeSource, /\/v1\/admin\/job\/create/);
  assert.match(runtimeSource, /AIRTABLE_TABLE_SESSIONS/);
  assert.match(runtimeSource, /linkedSessionFromNotes/);
});
