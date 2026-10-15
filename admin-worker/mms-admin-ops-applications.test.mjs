import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext, Script } from 'node:vm';
import { wireMmsJobsUi } from './src/mms-admin-jobs-ui.js';
import { renderMmsAdminPage } from './src/mms-admin-page.js';

function renderQueue(applications) {
  const page = wireMmsJobsUi(renderMmsAdminPage());
  const source = page.match(/<script data-mms-jobs-ui-v2>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source, 'assembled jobs script exists');
  assert.doesNotThrow(() => new Script(source));
  const renderApps = source.slice(source.indexOf('function renderApps('), source.indexOf('function renderPre('));
  const elements = Object.fromEntries(['#opsAppsCount', '#opsApps', '#opsAppsFoot'].map(id => [id, {
    textContent: '', innerHTML: '', querySelectorAll: () => [],
  }]));
  runInNewContext(`${renderApps}\nrenderApps(applications)`, {
    applications,
    arr: value => Array.isArray(value) ? value : [],
    text: value => String(value ?? '') || '–',
    esc: value => String(value ?? ''),
    fmt: value => String(value ?? ''),
    statusClass: () => '',
    document: { querySelector: id => elements[id] },
  });
  return elements;
}

test('Owner operations queue counts and shows only applications waiting for review', () => {
  const queue = renderQueue([
    { application_id: 'approved', nickname: 'Approved applicant', status: 'Approved' },
    { application_id: 'submitted', nickname: 'New applicant', status: 'Submitted' },
    { application_id: 'review', nickname: 'Review applicant', status: 'Under Review' },
  ]);
  assert.equal(queue['#opsAppsCount'].textContent, '2');
  assert.match(queue['#opsAppsFoot'].textContent, /ทั้งหมด 3/);
  assert.match(queue['#opsApps'].innerHTML, /New applicant/);
  assert.match(queue['#opsApps'].innerHTML, /Review applicant/);
  assert.doesNotMatch(queue['#opsApps'].innerHTML, /Approved applicant/);
});

test('Owner operations queue stays empty when all applications are completed', () => {
  const queue = renderQueue([{ application_id: 'approved', nickname: 'Approved applicant', status: 'Approved' }]);
  assert.equal(queue['#opsAppsCount'].textContent, '0');
  assert.match(queue['#opsAppsFoot'].textContent, /ไม่มีรายการค้าง · ทั้งหมด 1/);
  assert.match(queue['#opsApps'].innerHTML, /ไม่มีใบสมัครที่รอตรวจ/);
  assert.doesNotMatch(queue['#opsApps'].innerHTML, /Approved applicant/);
});
