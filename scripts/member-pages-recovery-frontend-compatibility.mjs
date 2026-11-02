import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [loginPath, membershipPath] = process.argv.slice(2);
assert.ok(loginPath && membershipPath, 'login and membership embed paths are required');

function read(path) {
  const html = readFileSync(path, 'utf8');
  assert.match(html, /member\/api\/liff\/start/, `${path}: LIFF start handoff missing`);
  assert.match(html, /member\/api\/liff\/recovery/, `${path}: recovery endpoint missing`);
  assert.match(html, /recovery_binding/, `${path}: recovery binding missing`);
  assert.match(html, /sessionStorage\.setItem\(DRAFT_KEY/, `${path}: draft persistence missing`);
  assert.match(html, /sessionStorage\.removeItem\(DRAFT_KEY/, `${path}: draft cleanup missing`);
  assert.doesNotMatch(html, /[?&](?:phone|email)=/i, `${path}: contact data must not enter a URL`);
  assert.ok(html.indexOf('/member/api/liff/start') < html.indexOf('/member/api/liff/recovery'), `${path}: start must precede recovery`);
  return html;
}

const login = read(loginPath);
const membership = read(membershipPath);
assert.match(login, /บัญชี LINE เปลี่ยนไปจากตอนเริ่มคำขอ/);
assert.match(membership, /บัญชี LINE เปลี่ยนไปจากตอนเริ่มคำขอ/);
console.log(JSON.stringify({ ok: true, scope: 'member-recovery-frontend-compatible', pages: [loginPath, membershipPath] }));
