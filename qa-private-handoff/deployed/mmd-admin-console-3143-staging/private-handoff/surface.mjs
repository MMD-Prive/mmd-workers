import {cases} from './worker.mjs';

const bookingPath = '/booking-test/private-handoff';
const customerJobsPath = bookingPath + '/jobs';
const adminPath = '/internal/admin/jobs/create-job/private-booking-qa';
const modelJobsPath = '/sigil/model/console/private-jobs';
const routes = new Map([
  [bookingPath, 'customer'],
  [customerJobsPath, 'customer'],
  [adminPath, 'owner'],
  [modelJobsPath, 'model'],
]);
const api = '/qa/private-booking/';
const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};
const escape = value => String(value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const link = (href, label) => '<a href="' + escape(href) + '">' + escape(label) + '</a>';
const hidden = (name, value) => '<input type="hidden" name="' + name + '" value="' + escape(value) + '">';
const button = text => '<button type="submit">' + text + '</button>';
const styles = 'body{background:#121418;color:#f3eddd;font:16px/1.55 system-ui;margin:0}main{max-width:38rem;margin:auto;padding:1.25rem}a{color:#ffd983}button,input{font:inherit}button{padding:.5rem 1rem;margin-top:.5rem}nav,fieldset,article{margin-block:1rem}input{max-width:100%}p,dd{overflow-wrap:anywhere}label{display:block;margin-block:.5rem}legend{padding-inline:.4rem}dd{margin-left:0}dt{font-weight:bold}article{border-top:1px solid #807766;padding-top:.75rem}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #ffd983;outline-offset:3px}';

function page(title, content, status = 200) {
  return new Response('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    escape(title) + '</title><style>' + styles + '</style><main><h1>' + escape(title) + '</h1>' + content + '</main></html>',
  {status, headers});
}

function bookingMenu() {
  return '<nav aria-label="SĪGIL QA">' + link(bookingPath, 'Private Booking') + ' · ' + link(customerJobsPath, 'งานของฉัน') + '</nav>';
}

function customerLogin(path, group) {
  const target = path === bookingPath && Object.hasOwn(cases, group)
    ? path + '?' + new URLSearchParams({group}) : path;
  return link('/member/liff?' + new URLSearchParams({next:target}), 'ยืนยันบัญชี LINE QA');
}

function scenarioDetail({source, templateDate, through}) {
  if (source === 'historical_template') return 'แม่แบบคำขอเดิม ' + escape(templateDate) + ' · คำขอ QA ใหม่';
  return 'คำขอใหม่ผ่าน ' + escape(through);
}

function bookingForm(scenario, requestId = crypto.randomUUID(), action = 'ส่งคำขอ Private Booking') {
  const fixture = cases[scenario];
  return '<p>' + scenarioDetail(fixture) + '</p><form method="post">' +
    hidden('request_id', requestId) + '<fieldset><legend>เลือกโมเดลใน ' + escape(fixture.group) + '</legend>' +
    '<label><input type="radio" name="scenario" value="' + escape(scenario) + '" required' +
    (action !== 'ส่งคำขอ Private Booking' ? ' checked' : '') + '> ' + escape(fixture.model) + '</label></fieldset>' +
    button(action) + '</form>';
}

function bookingSelect(searchParams) {
  const scenario = searchParams.get('group');
  const choices = '<nav aria-label="เลือกกลุ่ม">' + Object.entries(cases).map(([key, fixture]) =>
    link(bookingPath + '?' + new URLSearchParams({group:key}), fixture.group)).join(' · ') + '</nav>';
  return page('SĪGIL · Private Booking QA', bookingMenu() + '<h2>เลือกกลุ่ม</h2>' + choices +
    (Object.hasOwn(cases, scenario) ? bookingForm(scenario) : ''));
}

function ownerMenu(clientId) {
  return '<form method="get"><label>รหัสลูกค้า QA <input name="client_id" value="' + escape(clientId ?? '') +
    '" required maxlength="100" pattern="[A-Za-z0-9_\\-]+"></label>' + button('ดูคำขอของลูกค้า') + '</form>';
}

function ownerReview(row) {
  return '<article><h2>' + escape(row.group) + ' · ' + escape(row.model) + '</h2><p>' + scenarioDetail(row) +
    '</p><dl><dt>รหัสลูกค้า</dt><dd>' + escape(row.client_id) + '</dd><dt>รหัสคำขอ</dt><dd>' +
    escape(row.booking_ref) + '</dd></dl><form method="post">' + hidden('client_id', row.client_id) +
    hidden('booking_ref', row.booking_ref) + button('ตรวจแล้ว สร้างงาน Private') + '</form></article>';
}

function jobList(rows) {
  return rows.length ? rows.map(row => '<article><h2>' + escape(row.group) + ' · ' + escape(row.model) +
    '</h2><dl><dt>รหัสงาน</dt><dd>' + escape(row.session_id) + '</dd><dt>รหัสคำขอ</dt><dd>' +
    escape(row.booking_ref) + '</dd><dt>สถานะ</dt><dd>' + escape(row.status === 'offered' ? 'เสนองาน · รอโมเดลตอบรับ' : row.status) +
    '</dd></dl></article>').join('') : '<p>ยังไม่มีงาน Private สำหรับบัญชีนี้</p>';
}

function errorPage(status, content = '') {
  const messages = {
    400:'ข้อมูลคำขอไม่ครบ',
    401:'กรุณายืนยันบัญชี QA',
    403:'บัญชีนี้ไม่มีสิทธิ์เข้าถึง',
    404:'ไม่พบคำขอของลูกค้าที่เลือก',
    405:'วิธีส่งคำขอไม่รองรับ',
    409:'ข้อมูลคำขอขัดแย้งกับรายการเดิม',
  };
  return page(messages[status] ?? 'ระบบ QA ยังไม่พร้อม', content, status);
}

async function call(dispatch, request, actor, endpoint, {query, body} = {}) {
  const url = new URL(api + endpoint, request.url);
  if (query) url.search = new URLSearchParams(query).toString();
  const options = body ? {
    method:'POST',
    headers:{'Content-Type':'application/json', Origin:request.headers.get('Origin')},
    body:JSON.stringify(body),
  } : {};
  const response = await dispatch(new Request(url, options), actor);
  const data = await response.json();
  return {status:response.status, ok:response.ok, data};
}

export function privateSurfaces({authorize, dispatch}) {
  return async function handle(request) {
    const {origin, pathname, searchParams} = new URL(request.url);
    const role = routes.get(pathname);
    if (!role) return null;
    const isPost = request.method === 'POST';
    if (request.method !== 'GET' && !(isPost && [adminPath, bookingPath].includes(pathname))) return errorPage(405);
    if (isPost && request.headers.get('Origin') !== origin) return errorPage(403);
    try {
      const actor = await authorize(request, role);
      if (!actor?.id) return errorPage(401,
        role === 'customer' ? customerLogin(pathname, searchParams.get('group')) :
        role === 'model' ? link('/sigil/model/console', 'กลับไปยืนยันบัญชี MY MODEL') : '');
      if (actor.role !== role || (role === 'customer' && actor.privateAllowed !== true)) return errorPage(403);

      if (pathname === bookingPath) {
        if (!isPost) return bookingSelect(searchParams);
        const form = await request.formData().catch(() => null);
        const scenario = form?.get('scenario');
        const requestId = form?.get('request_id');
        if (typeof scenario !== 'string' || !Object.hasOwn(cases, scenario) || typeof requestId !== 'string' ||
            !/^[A-Za-z0-9_-]{1,100}$/.test(requestId)) return errorPage(400, bookingMenu());
        const retry = bookingMenu() + bookingForm(scenario, requestId, 'ส่งคำขอเดิมซ้ำ');
        const result = await call(dispatch, request, actor, 'requests', {
          body:{scenario, request_id:requestId},
        }).catch(() => null);
        if (!result?.ok) return errorPage(result?.status ?? 503, retry);
        return page('รับคำขอแล้ว', '<p>รอเจ้าของระบบตรวจคำขอ</p><dl><dt>รหัสคำขอ</dt><dd>' +
          escape(result.data.booking_ref) + '</dd></dl>' + retry, result.status);
      }

      if (pathname === adminPath) {
        if (isPost) {
          const form = await request.formData().catch(() => null);
          const clientId = form?.get('client_id');
          const bookingRef = form?.get('booking_ref');
          const result = await call(dispatch, request, actor, 'create-job', {body:{client_id:clientId,booking_ref:bookingRef}});
          if (!result.ok) return errorPage(result.status, ownerMenu(clientId));
          return page(result.data.created ? 'สร้างงาน Private แล้ว' : 'พบงาน Private เดิม', '<dl><dt>รหัสงาน</dt><dd>' +
            escape(result.data.session_id) + '</dd><dt>รหัสคำขอ</dt><dd>' + escape(result.data.booking_ref) + '</dd></dl>' +
            link(adminPath + '?' + new URLSearchParams({client_id:clientId}), 'กลับไปดูคำขอของลูกค้า'), result.status);
        }
        const clientId = searchParams.get('client_id');
        const menu = ownerMenu(clientId);
        if (clientId === null) return page('Create Job · Private Booking QA', menu);
        const result = await call(dispatch, request, actor, 'requests', {query:{client_id:clientId}});
        if (!result.ok) return errorPage(result.status, menu);
        return page('Create Job · Private Booking QA', menu + (result.data.requests.length
          ? result.data.requests.map(ownerReview).join('') : '<p>ไม่พบคำขอ Private ของลูกค้าที่เลือก</p>'));
      }

      const isModel = pathname === modelJobsPath;
      const bookingRef = searchParams.get('booking_ref');
      const result = await call(dispatch, request, actor, isModel ? 'model-jobs' : 'my-jobs',
        bookingRef === null ? {} : {query:{booking_ref:bookingRef}});
      if (!result.ok) return errorPage(result.status);
      return page(isModel ? 'MY MODEL · งานของฉัน' : 'SĪGIL · งานของฉัน',
        (isModel ? '<nav>' + link('/sigil/model/console', 'กลับ MY MODEL') + '</nav>' : bookingMenu()) + jobList(result.data.jobs));
    } catch {
      return errorPage(503);
    }
  };
}
