import test from 'node:test';
import assert from 'node:assert/strict';

import { wireMmsApproveUi } from './src/mms-admin-approve-ui.js';
import { renderMmsAdminPage } from './src/mms-admin-page.js';

test('Therapist cards expose independent MY THERAPIST access controls', () => {
  const wired = wireMmsApproveUi(renderMmsAdminPage());
  assert.match(wired, /MY THERAPIST ACCESS/);
  assert.match(wired, /อนุมัติ MY THERAPIST/);
  assert.match(wired, /REVOKE \/ LOCK/);
  assert.match(wired, /my_mms_access/);
  assert.match(wired, /my_mms_review_note/);
  assert.match(wired, /data-my-mms-access/);
});

test('MY THERAPIST approval uses existing authenticated MMS therapist admin bridge', () => {
  const wired = wireMmsApproveUi(renderMmsAdminPage());
  assert.match(wired, /\/v1\/admin\/mms/);
  assert.match(wired, /API\+'\/therapists\/'/);
  assert.match(wired, /credentials:'same-origin'/);
  assert.match(wired, /my_mms_approved_by:'internal\/admin\/mms'/);
});

test('MY THERAPIST access copy states entitlement is separate from operational status', () => {
  const wired = wireMmsApproveUi(renderMmsAdminPage());
  assert.match(wired, /แยกจาก Status, Availability และ Matching/);
  assert.match(wired, /อนุมัติเฉพาะคนที่พร้อมใช้ MY THERAPIST/);
});
