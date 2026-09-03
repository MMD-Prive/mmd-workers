import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMmsAdminPage } from './src/mms-admin-page.js';
import { wireMmsJobsUi } from './src/mms-admin-jobs-ui.js';

test('MMS admin renders snapshot immediately without waiting for optional catalog', () => {
  const source = wireMmsJobsUi(renderMmsAdminPage());

  assert.doesNotMatch(source, /Promise\.all\(\[call\('\/catalog'\),call\('\/snapshot'\)\]\)/);
  assert.doesNotMatch(source, /Promise\.allSettled\(\[call\('\/snapshot'\),call\('\/catalog'\)\]\)/);
  assert.match(source, /var snapshotTask=call\('\/snapshot'\)/);
  assert.match(source, /window\.mmsAdminSnapshotPromise=snapshotTask/);
  assert.match(source, /var snapshot=await snapshotTask/);
  assert.match(source, /window\.mmsAdminApplySnapshot\(snapshot\)/);
  assert.match(source, /var catalogResult=await catalogTask/);
  assert.match(source, /ข้อมูลหลักพร้อม · Catalog ยังไม่พร้อม/);
});

test('MMS base refresh and ops home share the same snapshot state', () => {
  const source = wireMmsJobsUi(renderMmsAdminPage());

  assert.match(source, /if\(window\.mmsAdminApplySnapshot\)window\.mmsAdminApplySnapshot\(snapshot\)/);
  assert.match(source, /var snapshotTask=window\.mmsAdminSnapshotPromise\|\|api\('\/snapshot'\)/);
  assert.match(source, /Promise\.allSettled\(\[snapshotTask,api\('\/jobs'\)\]\)/);
  assert.match(source, /window\.mmsAdminApplySnapshot\(lastSnapshot\)/);
  assert.match(source, /renderApps\(lastSnapshot\.applications\)/);
  assert.match(source, /renderPre\(lastSnapshot\.prebookings\)/);
  assert.match(source, /mms-admin:snapshot/);
});
