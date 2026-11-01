import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { checkCustomerDataPage } from './check-customer-data-page.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const wrapper = read('../immigrate-worker/src/customer-360-live-ingress-wrapper.ts');
// Read the actual inline HTML returned by the production entrypoint, rather than
// a second hand-maintained copy of the directory fixture. No browser/API calls.
const directorySource = wrapper.slice(wrapper.indexOf('export function renderCustomerDirectory('));
const htmlLiteral = directorySource.match(/return new Response\(("(?:\\.|[^"\\])*"), \{status: response.status, headers\}\);/);
assert.ok(htmlLiteral, 'production directory HTML literal must be found');
const directoryBody = JSON.parse(htmlLiteral[1]);
const legacyBody = read('../immigrate-worker/src/customer-360-ui-v1.ts');
const workerHeaders = [
  'HTTP/2 200',
  'Content-Type: text/html; charset=utf-8',
  'X-MMD-Customer-Data-UI: readable-v3',
  'X-MMD-Customer-Data-Authority: identity-context-staging-only',
  'X-MMD-Customer-UX: owner-readable-v7',
].join('\r\n');
const directory = { status: 200, headers: `${workerHeaders}\r\nX-MMD-Customer-Directory: canonical-search-v1\r\n\r\n`, body: directoryBody };

for (const mode of ['deployment', 'authenticated']) {
  test(`${mode}: current production directory passes without legacy queue copy`, () => {
    for (const obsolete of ['นำเข้าจาก Console Inbox', 'คิวที่ต้องดู', 'จับคู่แล้ว']) assert.ok(!directoryBody.includes(obsolete));
    assert.equal(checkCustomerDataPage({ ...directory, mode }), 'canonical-search-v1');
  });
  test(`${mode}: legacy Worker contract remains accepted`, () => {
    assert.equal(checkCustomerDataPage({ status: 200, headers: workerHeaders, body: legacyBody, mode }), 'readable-v3');
  });
}

test('deployment: Lovable delivery contract remains accepted', () => {
  assert.equal(checkCustomerDataPage({ status: 200,
    headers: 'Content-Type: text/html\nx-mmd-presentation-source: lovable\nx-mmd-presentation-version: internal-lovable-v1',
    body: 'ลูกค้าล่าสุดจากระบบหลังบ้าน เลือกรายชื่อก่อนเปิดข้อมูล อ่านข้อมูลอีกครั้ง',
  }), 'internal-lovable-v1');
});

test('rejects login/errors, wrong content type and missing authority', () => {
  for (const status of [302, 401, 403, 500]) assert.throws(() => checkCustomerDataPage({ ...directory, status }), /http_200_required/);
  assert.throws(() => checkCustomerDataPage({ ...directory, body: '<html>Login</html>' }), /directory_title_missing/);
  assert.throws(() => checkCustomerDataPage({ ...directory, headers: directory.headers.replace('text/html', 'application/json') }), /html_content_type_required/);
  assert.throws(() => checkCustomerDataPage({ ...directory, headers: directory.headers.replace('identity-context-staging-only', 'unknown') }), /authority_header_required/);
});

test('rejects a directory without the search runtime or scoped client link', () => {
  const cases = [
    ["form.addEventListener('submit'", 'directory_submit_handler_missing'],
    ["fetch('/v1/admin/clients/lineage-lookup'", 'directory_lookup_missing'],
    ['canonical_only:true', 'directory_canonical_filter_missing'],
    ['/internal/admin/customer-data?client_id=', 'directory_scoped_link_missing'],
  ];
  for (const [token, error] of cases) assert.throws(() => checkCustomerDataPage({ ...directory, body: directoryBody.replace(token, '') }), new RegExp(error));
});

test('unknown directory version cannot fall through to legacy acceptance', () => {
  assert.throws(() => checkCustomerDataPage({ ...directory, headers: directory.headers.replace('canonical-search-v1', 'canonical-search-v2'), body: legacyBody }), /unknown_customer_directory/);
});

test('redirect headers cannot supply missing final response guards', () => {
  assert.throws(() => checkCustomerDataPage({ ...directory, headers: `${directory.headers}HTTP/2 200\r\nContent-Type: text/html\r\n\r\n` }), /readable_ui_header_required/);
  assert.equal(checkCustomerDataPage({ ...directory, headers: `HTTP/2 302\r\nLocation: /login\r\n\r\n${directory.headers}` }), 'canonical-search-v1');
});

test('scope failures and malformed legacy pages still fail closed', () => {
  assert.throws(() => checkCustomerDataPage({ ...directory, body: directoryBody + 'customer_scope_contract_unavailable' }), /customer_scope_contract_unavailable/);
  assert.throws(() => checkCustomerDataPage({ status: 200, headers: workerHeaders, body: legacyBody.replaceAll('คิวที่ต้องดู', '') }), /legacy_queue_missing/);
  assert.throws(() => checkCustomerDataPage({ status: 200, headers: workerHeaders, body: legacyBody + 'Review Queue' }), /legacy_raw_queue_copy/);
});

test('CLI exits unsuccessfully on a bad contract and does not print response data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'customer-data-contract-'));
  try {
    const headers = join(dir, 'headers');
    const body = join(dir, 'body');
    writeFileSync(headers, directory.headers + 'Set-Cookie: DO_NOT_LOG_COOKIE\n');
    writeFileSync(body, directoryBody);
    const cli = new URL('./check-customer-data-page.mjs', import.meta.url);
    const run = () => spawnSync(process.execPath, [cli.pathname, '200', headers, body, 'deployment'], { encoding: 'utf8' });
    // Use a complete, single header block for the successful invocation.
    writeFileSync(headers, directory.headers.trim() + '\r\nSet-Cookie: DO_NOT_LOG_COOKIE\r\n\r\n');
    assert.equal(run().status, 0);
    writeFileSync(body, '<html>DO_NOT_LOG_CUSTOMER</html>');
    const failed = run();
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /directory_title_missing/);
    assert.doesNotMatch(failed.stdout + failed.stderr, /DO_NOT_LOG/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
