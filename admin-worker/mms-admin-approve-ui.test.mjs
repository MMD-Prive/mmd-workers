import test from 'node:test';
import assert from 'node:assert/strict';

import { wireMmsApproveUi, MMS_APPROVE_UI_MARKER } from './src/mms-admin-approve-ui.js';
import { renderMmsAdminPage } from './src/mms-admin-page.js';

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
});

test('approve wiring is idempotent and preserves ordinary application save behavior', () => {
  const once = wireMmsApproveUi(renderMmsAdminPage());
  const twice = wireMmsApproveUi(once);
  assert.equal(twice, once);
  assert.match(once, /setRuntime\('บันทึกใบสมัครแล้ว','ok'\)/);
});
