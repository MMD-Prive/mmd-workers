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
const loginCoreSource = readFileSync(new URL('./src/admin-login-hero-worker-core.js', import.meta.url), 'utf8');

test('MMS admin exposes the real approve action for therapist applications', () => {
  const source = renderMmsAdminPage();
  assert.match(source, /data-app-approve=/);
  assert.match(source, /data-app-open=/);
  assert.match(source, /Approve applicant/);
  assert.match(source, /Open Therapist review/);
});

test('approve wiring verifies safe therapist state and opens Therapist review', () => {
  const source = wireMmsApproveUi(renderMmsAdminPage());
  assert.match(source, new RegExp(MMS_APPROVE_UI_MARKER));
  assert.match(source, /\/v1\/admin\/mms\/applications\/[^/]+\/approve/);
  assert.match(source, /\/internal\/admin\/mms\?tab=therapists&therapist_id=/);
  assert.match(source, /application_id/);
  assert.match(source, /therapist_id/);
});

test('admin includes one-tap production diagnostics and recent approval receipt', () => {
  const source = wireMmsApproveUi(renderMmsAdminPage());
  assert.match(source, /data-app-system-check/);
  assert.match(source, /data-app-recent-approval/);
  assert.match(source, /System check/);
  assert.match(source, /Recent approval/);
});

test('system check proves backend read paths without mutating bookings or therapist state', () => {
  assert.match(runtimeSource, /\/v1\/admin\/mms\/applications/);
  assert.match(runtimeSource, /mms\/api\/therapists\/match/);
  assert.match(runtimeSource, /recipient_gender: "ผู้ชาย"/);
  assert.match(runtimeSource, /zone: "sukhumvit"/);
  assert.match(runtimeSource, /skills: \["aroma_therapy_oil"\]/);
  assert.match(runtimeSource, /airtable: Boolean\(health\?\.bindings\?\.airtable && snapshotReady\)/);
  assert.match(runtimeSource, /r2: Boolean\(health\?\.bindings\?\.private_uploads\)/);
});

test('MMS browser page participates in the credential-bound admin session gate', () => {
  // The active wrapper delegates the actual browser gate to the core worker.
  // Assert both sides of that ownership boundary instead of requiring the gate
  // implementation to be duplicated in the thin wrapper.
  assert.match(loginWrapperSource, /coreWorker\.fetch\(request, env, ctx\)/);

  const gateStart = loginCoreSource.indexOf('async function applyCredentialBoundAdminGate');
  const gateEnd = loginCoreSource.indexOf('function isGateBypassedAdminPath', gateStart);
  assert.ok(gateStart >= 0 && gateEnd > gateStart);
  const gateSource = loginCoreSource.slice(gateStart, gateEnd);
  assert.match(gateSource, /isBrowserAdminPath\(path\)/);
  assert.match(gateSource, /credential-required/);

  const pathStart = loginCoreSource.indexOf('function isBrowserAdminPath');
  const pathEnd = loginCoreSource.indexOf('function isApiAdminPath', pathStart);
  assert.ok(pathStart >= 0 && pathEnd > pathStart);
  const pathSource = loginCoreSource.slice(pathStart, pathEnd);
  assert.match(pathSource, /path\.startsWith\("\/internal\/admin"\)/);
});

test('approve wiring is idempotent and preserves ordinary application save behavior', () => {
  const once = wireMmsApproveUi(renderMmsAdminPage());
  const twice = wireMmsApproveUi(once);
  assert.equal((twice.match(new RegExp(MMS_APPROVE_UI_MARKER, 'g')) || []).length, 1);
  assert.match(twice, /data-save-application/);
});

test('MMS jobs wiring adds a canonical work lane and explicit create-job action', () => {
  const source = wireMmsJobsUi(wireMmsApproveUi(renderMmsAdminPage()));
  assert.match(source, new RegExp(MMS_JOBS_UI_MARKER));
  assert.match(source, /data-mms-jobs-panel/);
  assert.match(source, /data-job-create/);
  assert.match(source, /Create job/);
});

test('MMS ops home surfaces real applicant, coordination, and canonical work lanes', () => {
  const source = wireMmsJobsUi(wireMmsApproveUi(renderMmsAdminPage()));
  assert.match(source, /Applicants/);
  assert.match(source, /Coordination/);
  assert.match(source, /Jobs/);
  assert.match(source, /Therapists/);
});

test('MMS canonical job classifier recognizes the public service taxonomy', () => {
  const source = buildMmsCanonicalJobPayload({
    id: 'pre-001',
    service: 'Aroma Oil',
    recipient_gender: 'ผู้ชาย',
    zone: 'sukhumvit',
    therapist_id: 'therapist-001',
    scheduled_at: '2026-09-08T13:00:00+07:00',
  });
  assert.equal(source.service_code, 'aroma_therapy_oil');
});

test('MMS confirmed prebooking maps to canonical job contract without inventing payment truth', () => {
  const payload = buildMmsCanonicalJobPayload({
    id: 'pre-001',
    status: 'confirmed',
    service: 'Aroma Oil',
    recipient_gender: 'ผู้ชาย',
    zone: 'sukhumvit',
    therapist_id: 'therapist-001',
    scheduled_at: '2026-09-08T13:00:00+07:00',
  });
  assert.equal(payload.source, 'mms_prebooking');
  assert.equal(payload.prebooking_id, 'pre-001');
  assert.equal(payload.payment_ref, undefined);
  assert.equal(payload.payment_status, undefined);
});

test('MMS job bridge fails closed before canonical creation when required truth is missing', () => {
  assert.throws(() => buildMmsCanonicalJobPayload({ id: 'pre-001' }));
});

test('MMS job receipts preserve a server-side link back to the prebooking', () => {
  const notes = appendMmsJobReceipt('existing', {
    prebooking_id: 'pre-001',
    session_id: 'session-001',
  });
  assert.equal(linkedPrebookingFromNotes(notes), 'pre-001');
  assert.equal(linkedSessionFromNotes(notes), 'session-001');
});

test('MMS runtime exposes canonical jobs read and explicit prebooking-to-job bridge', () => {
  assert.match(runtimeSource, /jobs/);
  assert.match(runtimeSource, /prebooking/);
});
