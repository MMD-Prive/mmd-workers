import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./current/footer.html', import.meta.url), 'utf8');
const scripts = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const runtime = scripts.find(script => script.includes('function home('));
const prefix = runtime.slice(runtime.indexOf('(function(){') + '(function(){'.length, runtime.indexOf('var V='));
const context = { document: { getElementById: () => ({}) }, localStorage: { getItem: () => 'th' }, location: { origin: 'https://mmdbkk.com' }, URL, URLSearchParams, Date, AbortController, setTimeout, clearTimeout };
vm.createContext(context); vm.runInContext('(function(){' + prefix + ';globalThis.renderers={home,coupons,booking,activity};})()', context);
test('all Webflow inline scripts remain syntactically valid', () => { for (const script of scripts) new vm.Script(script); });
test('Home stays usable when attention fails and cannot present partial source failure as all clear', () => {
  const member = { greetingName: 'A', membership: { status: 'active' }, points: { confirmedBalance: 20 } };
  const html = context.renderers.home(member, { failed: true });
  assert.match(html, /MMD NOW/); assert.match(html, /ยังโหลดรายการไม่ได้/); assert.match(html, /data-retry/);
  const partial = context.renderers.home(member, { state: 'partial', items: [] });
  assert.match(partial, /บางรายการยังตรวจไม่ได้/); assert.doesNotMatch(partial, /ตอนนี้ไม่มีรายการที่ต้องทำ/);
});
test('Home caps actions at three and links to Activity without claiming a full Attention list', () => {
  const html = context.renderers.home({}, { state: 'resolved', items: Array.from({ length: 5 }, (_, i) => ({ title: '<script>', label: 'ดู', url: '/member/liff?session_id=' + i })) });
  assert.equal((html.match(/session_id=/g) || []).length, 3); assert.match(html, /href="#\/activity"/); assert.doesNotMatch(html, /<script>/);
});
test('coupon history is collapsed, expired coupons have no button, and missing rates are not invented', () => {
  const html = context.renderers.coupons([{ title: 'expired', state: 'issued', expiresAt: '2020-01-01', actionUrl: '/use-expired' }, { title: 'ready', state: 'issued', expiresAt: '2099-01-01', actionUrl: '/member/liff?view=coupons' }, { title: 'used', state: 'used', actionUrl: '/use-used' }]);
  assert.match(html, /<details>/); assert.match(html, /ใช้แล้วและหมดอายุ/); assert.doesNotMatch(html, /use-expired|use-used|10%/); assert.match(html, /ส่วนลดจริงจะแสดงเมื่อ/);
});
test('booking confirmation button requires the server acknowledgement decision', () => {
  assert.doesNotMatch(context.renderers.booking({ sessionId: 's1', acknowledgement: { customerAckAllowed: false } }), /data-customer-ack=/);
  const html = context.renderers.booking({ sessionId: 's1', acknowledgement: { customerAckAllowed: true }, model: { displayAllowed: false, displayName: 'hidden' } });
  assert.match(html, /data-customer-ack="s1"/); assert.doesNotMatch(html, /hidden/);
});

test('bounded backend results still expose Activity with the existing destination contracts', () => {
  const html = context.renderers.home({}, { state: 'partial', items: [{ title: 'fixture', url: '/member/liff?session_id=selected' }] });
  assert.match(html, /href="#\/activity"/); assert.match(html, /ดูรายการในกิจกรรม/);
  assert.doesNotMatch(html, /ดูทั้งหมด|View all/);
  const activity = context.renderers.activity();
  for (const href of ['/member/requests', '/member/payments', '#/history', '/my-mmd/orders']) {
    assert.ok(activity.includes('href="' + href + '"'));
  }
});
