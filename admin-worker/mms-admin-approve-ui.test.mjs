import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { wireMmsApproveUi, MMS_APPROVE_UI_MARKER } from './src/mms-admin-approve-ui.js';
import { renderMmsAdminPage } from './src/mms-admin-page.js';

const runtimeSource = readFileSync(new URL('./src/mms-admin-runtime.js', import.meta.url), 'utf8');

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
  assert.match(runtimeSource, /API_PREFIX}\/system-check/);
  assert.match(runtimeSource, /INTERNAL_BASE}\/health/);
  assert.match(runtimeSource, /internal\/mms\/admin\/snapshot/);
  assert.match(runtimeSource, /mms\/api\/therapists\/match/);
  assert.match(runtimeSource, /body: "\{\}"/);
  assert.match(runtimeSource, /airtable: Boolean\(health\?\.bindings\?\.airtable && snapshotReady\)/);
  assert.match(runtimeSource, /r2: Boolean\(health\?\.bindings\?\.private_uploads\)/);
});

test('approve wiring is idempotent and preserves ordinary application save behavior', () => {
  const once = wireMmsApproveUi(renderMmsAdminPage());
  const twice = wireMmsApproveUi(once);
  assert.equal(twice, once);
  assert.match(once, /setRuntime\('บันทึกใบสมัครแล้ว','ok'\)/);
});
