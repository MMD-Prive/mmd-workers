import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMmsAdminPage } from './src/mms-admin-page.js';
import { wireMmsJobsUi } from './src/mms-admin-jobs-ui.js';

test('MMS admin boot keeps snapshot data independent from optional catalog', () => {
  const source = wireMmsJobsUi(renderMmsAdminPage());

  assert.doesNotMatch(source, /Promise\.all\(\[call\('\/catalog'\),call\('\/snapshot'\)\]\)/);
  assert.match(source, /Promise\.allSettled\(\[call\('\/snapshot'\),call\('\/catalog'\)\]\)/);
  assert.match(source, /snapshotResult\.status==='fulfilled'/);
  assert.match(source, /state=snapshotResult\.value\|\|state;renderAll\(\)/);
  assert.match(source, /ข้อมูลหลักพร้อม · Catalog ยังไม่พร้อม/);
});

test('MMS admin still exposes the independent ops-home snapshot read', () => {
  const source = wireMmsJobsUi(renderMmsAdminPage());

  assert.match(source, /Promise\.allSettled\(\[api\('\/snapshot'\),api\('\/jobs'\)\]\)/);
  assert.match(source, /renderApps\(lastSnapshot\.applications\)/);
  assert.match(source, /renderPre\(lastSnapshot\.prebookings\)/);
});
