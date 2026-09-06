import test from 'node:test';
import assert from 'node:assert/strict';

import { wireMmsApproveUi } from './src/mms-admin-approve-ui.js';
import { renderMmsAdminPage } from './src/mms-admin-page.js';

test('MMS admin names the canonical therapist application inbox explicitly', () => {
  const wired = wireMmsApproveUi(renderMmsAdminPage());
  assert.match(wired, /ใบสมัคร MMS/);
  assert.match(wired, /ใบสมัคร MMS Therapist/);
  assert.match(wired, /Canonical ของใบสมัคร MMS/);
  assert.match(wired, /\/internal\/admin\/mms\?tab=applications&amp;application_id=mmsapp_/);
});

test('MMS application inbox supports direct application deep links', () => {
  const wired = wireMmsApproveUi(renderMmsAdminPage());
  assert.match(wired, /application_id/);
  assert.match(wired, /\^mmsapp_\[a-f0-9\]\{24\}\$/);
  assert.match(wired, /openTab\('applications'\)/);
  assert.match(wired, /data-app-card/);
  assert.match(wired, /data-application-deep-link/);
  assert.match(wired, /detail\.open=true/);
});

test('MMS application approval still lands in safe therapist review state', () => {
  const wired = wireMmsApproveUi(renderMmsAdminPage());
  assert.match(wired, /status!=='Review'/);
  assert.match(wired, /availability_status!=='Paused'/);
  assert.match(wired, /matching_enabled!==false/);
  assert.match(wired, /showTab\('therapists',true\)/);
});
