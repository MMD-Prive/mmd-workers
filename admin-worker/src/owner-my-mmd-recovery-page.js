// Owner diagnostic presentation only. All reads use the existing authenticated API.
export function renderOwnerMyMmdRecoveryPage(initialQuery = '') {
  const query = String(initialQuery).slice(0, 120).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive">
<title>MY MMD Recovery Diagnostic · Owner</title>
<style>
:root{color-scheme:light;--bg:#fff;--text:#272b30;--muted:#545c66;--line:#c7ccd2;--soft:#f3f4f6;--accent:#fed7aa;--accent-text:#9a4a0b;--ok:#286442;--warn:#895209;--bad:#a12535}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 "LINE Seed Sans TH","Noto Sans Thai",Tahoma,system-ui,sans-serif}button,input{font:inherit}a{color:inherit;text-underline-offset:4px}button,a,input,summary{-webkit-tap-highlight-color:transparent}button,a,summary{touch-action:manipulation}button{cursor:pointer}button:disabled{cursor:wait}button,a,input,summary{transition:background-color .16s,border-color .16s} :focus-visible{outline:3px solid var(--accent-text);outline-offset:4px}[hidden]{display:none!important}
.rc-shell{max-width:1120px;margin:auto;padding:24px 24px 60px}.rc-top{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:28px}.rc-brand{font-size:14px;font-weight:700;letter-spacing:.1em}.rc-badge{border:1px solid var(--line);border-radius:99px;padding:4px 12px;font-size:13px;white-space:nowrap}.rc-eyebrow{color:var(--accent-text);font-size:13px;letter-spacing:.12em;font-weight:700;margin:0 0 6px}h1{font-size:clamp(28px,4vw,38px);line-height:1.3;letter-spacing:-.025em;margin:0 0 10px}h2{font-size:21px;line-height:1.45;margin:0}h3{font-size:17px;margin:0}p{margin:8px 0}.rc-muted{color:var(--muted)}.rc-intro{max-width:680px;margin-bottom:24px}.rc-searchbox{border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:24px}.rc-searchbox label{display:block;font-weight:700;margin-bottom:8px}.rc-search{display:flex;gap:10px}.rc-search input{width:100%;min-width:0;border:1px solid #868e98;background:white;color:var(--text);border-radius:10px;padding:12px 14px}.rc-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:10px 18px;border:1px solid var(--line);border-radius:10px;background:white;color:var(--text);font-weight:700;text-decoration:none;white-space:normal}.rc-primary{background:var(--accent);border-color:#c47a38;flex-shrink:0}.rc-button:hover{background:var(--soft)}.rc-primary:hover{background:#fdba74}.rc-help{font-size:14px;color:var(--muted);margin:9px 0 0}.rc-tools{display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;margin-top:16px}.rc-link{background:none;border:0;padding:8px 0;min-height:44px;color:var(--accent-text);text-decoration:underline;text-underline-offset:4px;font-weight:700}.rc-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin:0 0 14px}.rc-toolbar p{font-size:14px;margin:0}.rc-result{outline:none;min-width:0}.rc-state{border:1px solid var(--line);border-left:4px solid var(--accent-text);border-radius:12px;padding:20px;margin-bottom:16px;background:var(--bg)}.rc-state[data-tone="ok"]{border-left-color:var(--ok)}.rc-state[data-tone="bad"]{border-left-color:var(--bad)}.rc-state p{max-width:740px}.rc-state .rc-actions{margin-top:14px}.rc-status{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:var(--muted);margin-bottom:7px}.rc-dot{width:7px;height:7px;background:currentColor;border-radius:50%;flex-shrink:0}.rc-ok{color:var(--ok)}.rc-warn{color:var(--warn)}.rc-bad{color:var(--bad)}.rc-person{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin:22px 0 16px}.rc-person h2{overflow-wrap:anywhere}.rc-id{font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;color:var(--muted)}.rc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:18px}.rc-metric{padding:20px;min-width:0}.rc-metric+.rc-metric{border-left:1px solid var(--line)}.rc-label{display:block;font-size:14px;color:var(--muted);margin-bottom:6px}.rc-value{display:block;font-size:27px;line-height:1.4;font-weight:700;overflow-wrap:anywhere}.rc-metric p{font-size:14px;color:var(--muted)}.rc-panel{border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:14px}.rc-panel summary{cursor:pointer;font-weight:700;min-height:44px;padding:8px 0}.rc-panel:has(summary){padding-top:8px;padding-bottom:8px}.rc-panel[open]{padding-bottom:20px}.rc-panel[open] summary{margin-bottom:8px}.rc-dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 24px;margin:16px 0 0}.rc-dl>div{min-width:0}.rc-dl dt{font-size:14px;color:var(--muted)}.rc-dl dd{margin:3px 0 0;overflow-wrap:anywhere}.rc-actions{display:flex;flex-wrap:wrap;gap:10px}.rc-choices{display:grid;gap:10px;margin-top:16px}.rc-choice{text-align:left;display:block;width:100%}.rc-choice span{display:block}.rc-inbox{list-style:none;padding:0;margin:0;border:1px solid var(--line);border-radius:14px;overflow:hidden}.rc-inbox li+li{border-top:1px solid var(--line)}.rc-inbox a{display:grid;grid-template-columns:1fr auto;gap:8px 20px;padding:20px;text-decoration:none;overflow-wrap:anywhere}.rc-inbox a:hover{background:var(--soft)}.rc-inbox p{margin:5px 0 0;font-size:14px;color:var(--muted)}.rc-inbox strong{font-size:17px}.rc-inbox .rc-ref{font-size:13px;color:var(--muted)}.rc-footer{margin-top:26px;border-top:1px solid var(--line);padding-top:16px;font-size:13px;color:var(--muted)}.rc-loading{display:flex;align-items:center;gap:12px}.rc-spinner{width:20px;height:20px;border:2px solid var(--line);border-top-color:var(--accent-text);border-radius:50%;animation:rc-spin .8s linear infinite;flex-shrink:0}.rc-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.rc-errorcode{font-size:13px;color:var(--muted);overflow-wrap:anywhere}.rc-errorcode summary{cursor:pointer;min-height:44px;padding-top:12px}.rc-skip{position:absolute;left:16px;top:-100px;background:white;padding:10px;z-index:10}.rc-skip:focus{top:8px}
@keyframes rc-spin{to{transform:rotate(360deg)}}@media(max-width:680px){.rc-shell{padding:18px 16px 40px}.rc-top{margin-bottom:22px}.rc-searchbox{padding:16px}.rc-search{flex-direction:column}.rc-grid{grid-template-columns:1fr}.rc-metric{padding:16px}.rc-metric+.rc-metric{border-left:0;border-top:1px solid var(--line)}.rc-value{font-size:25px}.rc-dl{grid-template-columns:1fr}.rc-person{flex-direction:column;gap:10px}.rc-state,.rc-panel{padding:16px}.rc-inbox a{grid-template-columns:1fr;padding:16px}.rc-inbox .rc-status{margin:0}.rc-actions .rc-button{width:100%}.rc-top{align-items:flex-start}.rc-brand{font-size:12px}.rc-tools{gap:4px 16px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
</style></head><body>
<a class="rc-skip" href="#recovery-main">ข้ามไปเนื้อหา</a>
<main class="rc-shell" id="recovery-main">
<div class="rc-top"><a class="rc-brand" href="/internal/admin/dashboard">SĪGIL / INTERNAL</a><span class="rc-badge">เฉพาะ Owner</span></div>
<header class="rc-intro"><p class="rc-eyebrow">MY MMD · RECOVERY</p><h1>ตรวจสมาชิกและประวัติ</h1><p class="rc-muted">ดูสถานะสมาชิก Points และคำขอกู้คืนข้อมูลจากระบบ เพื่อรู้ว่ารายการไหนพร้อมใช้ และรายการไหนต้องตรวจต่อ</p></header>
<section class="rc-searchbox" aria-label="ค้นหาสมาชิก"><form data-form>
<label for="recovery-query">ค้นหาสมาชิกหรือคำขอ</label><div class="rc-search"><input id="recovery-query" name="q" value="${query}" placeholder="ชื่อลูกค้า / Client ID / IMR-…" aria-describedby="recovery-help" autocomplete="off" maxlength="120" required><button class="rc-button rc-primary" type="submit">ตรวจสถานะ</button></div>
<p class="rc-help" id="recovery-help">ใช้ข้อมูลที่มีอยู่ได้เลย ไม่ต้องให้ลูกค้าเปิด LINE เพื่อช่วยตรวจ</p></form>
<nav class="rc-tools" aria-label="ทางลัดการตรวจสมาชิก"><button class="rc-link" type="button" data-inbox>คำขอ Recovery ล่าสุด</button><a href="/internal/admin/member-intelligence">ค้นหาข้อมูลสมาชิก</a></nav></section>
<div class="rc-toolbar"><h2 data-heading>คำขอ Recovery ล่าสุด</h2><p class="rc-muted" data-readtime></p></div>
<p class="rc-sr" data-announcement role="status" aria-live="polite" aria-atomic="true"></p>
<section class="rc-result" data-result tabindex="-1" aria-label="ผลการตรวจ" aria-busy="true"><div class="rc-state"><p>กำลังเตรียมข้อมูล…</p></div></section>
<noscript><p>เปิด JavaScript เพื่อค้นหาและอ่านผลการตรวจสมาชิก</p></noscript>
<footer class="rc-footer">หน้านี้ใช้ตรวจสอบข้อมูล · ไม่เปลี่ยนสิทธิ์หรือยอด Points · ใช้สิทธิ์ Owner และไม่แสดง LINE User ID เต็ม</footer>
</main><script>(${recoveryClient.toString()})();</script></body></html>`;
}

function recoveryClient() {
  'use strict';
  var form = document.querySelector('[data-form]');
  var input = form.elements.q;
  var result = document.querySelector('[data-result]');
  var heading = document.querySelector('[data-heading]');
  var announcement = document.querySelector('[data-announcement]');
  var readtime = document.querySelector('[data-readtime]');
  var sequence = 0, controller, lastScope;
  var api = '/v1/admin/my-mmd/recovery-diagnostic';
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rec(v) { return /^rec[A-Za-z0-9]{6,32}$/.test(v || ''); }
  function requestId(v) { return /^IMR-[A-Z0-9]{6,40}$/i.test(v || ''); }
  function value(v) { return v == null || v === '' ? '—' : esc(v); }
  function list(v) { return Array.isArray(v) ? v.join(', ') : ''; }
  function date(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return esc(v);
    var time = String(v).includes('T');
    return new Intl.DateTimeFormat('th-TH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(d);
  }
  var labels = { reconciled: 'ตรวจประวัติครบแล้ว', review_required: 'มีรายการรอตรวจ', checking: 'กำลังตรวจสอบ', in_progress: 'กำลังรวบรวมประวัติ', blocked: 'ต้องตรวจแก้ก่อนใช้งาน', unavailable: 'ยังอ่านข้อมูลไม่ได้', pending: 'รอการยืนยัน', verified: 'ยืนยันแล้ว', recorded: 'บันทึกแล้ว', active: 'ใช้งานอยู่', expired: 'หมดอายุ', resolved: 'ตรวจสอบแล้ว' };
  function label(v) { return labels[v] || v || 'ยังไม่มีข้อมูลยืนยัน'; }
  function tone(v) { return v === 'reconciled' ? 'ok' : v === 'blocked' ? 'bad' : 'warn'; }
  function badge(text, state) { return '<span class="rc-status rc-' + state + '"><span class="rc-dot" aria-hidden="true"></span>' + esc(text) + '</span>'; }
  function row(k, v) { return '<div><dt>' + esc(k) + '</dt><dd>' + value(v) + '</dd></div>'; }
  function customerLink(c) { return rec(c && c.canonical_client_id) ? '<a class="rc-button" href="/internal/admin/customer-data?client_id=' + encodeURIComponent(c.canonical_client_id) + '">เปิด Customer 360</a>' : ''; }
  function customer(c) {
    if (!c || (!c.display_name && !c.canonical_client_id)) return '';
    return '<div class="rc-person"><div><span class="rc-label">สมาชิกที่กำลังตรวจ</span><h2>' + esc(c.display_name || 'สมาชิก MMD') + '</h2><div class="rc-id">' + esc(c.canonical_client_id || '') + '</div></div>' + customerLink(c) + '</div>';
  }
  function state(title, description, kind, actions) { return '<div class="rc-state" data-tone="' + kind + '">' + badge(kind === 'ok' ? 'ตรวจสอบแล้ว' : kind === 'bad' ? 'ต้องดำเนินการต่อ' : 'สถานะการตรวจ', kind) + '<h2>' + esc(title) + '</h2><p class="rc-muted">' + esc(description) + '</p>' + (actions ? '<div class="rc-actions">' + actions + '</div>' : '') + '</div>'; }
  function diagnostic(code) { return '<details class="rc-errorcode"><summary>รายละเอียดสำหรับตรวจระบบ</summary><code>' + esc(code || 'unavailable') + '</code></details>'; }
  function errorView(b) {
    var code = b.error || 'unavailable';
    var errors = {
      canonical_client_line_identity_missing: ['ยังไม่พบ LINE ที่ผูกกับระเบียนนี้', 'ระบบพบระเบียนลูกค้า แต่ยังอ่านสมาชิก Points และประวัติผ่าน LINE ที่ยืนยันไม่ได้ เปิด Customer 360 เพื่อตรวจการเชื่อมตัวตนก่อน', 'warn'],
      canonical_client_unresolved: ['ยังระบุสมาชิกไม่ได้', 'ลองใช้ชื่ออื่นหรือ Client ID จาก Customer 360 เพื่อระบุระเบียนให้ชัดเจน', 'warn'],
      owner_required: ['ต้องใช้บัญชี Owner', 'บัญชีปัจจุบันไม่มีสิทธิ์อ่านผลตรวจหน้านี้', 'bad'],
      network_unavailable: ['เชื่อมต่อไม่สำเร็จ', 'ตรวจการเชื่อมต่อแล้วลองอ่านข้อมูลอีกครั้ง ผลครั้งนี้ยังยืนยันไม่ได้', 'bad'],
      request_timeout: ['ใช้เวลาอ่านข้อมูลนานเกินไป', 'ลองอ่านข้อมูลอีกครั้ง ระบบยังไม่ได้ยืนยันผลการตรวจ', 'warn'],
      invalid_response: ['ยังอ่านคำตอบจากระบบไม่ได้', 'ลองอีกครั้ง หากยังพบปัญหาให้ใช้รหัสด้านล่างเพื่อตรวจระบบ', 'bad'],
      member_pages_binding_missing: ['บริการตรวจสมาชิกยังไม่พร้อม', 'ระบบยังเชื่อมต่อบริการสมาชิกไม่ได้ กรุณาตรวจการเชื่อมต่อบริการก่อน', 'bad'],
      query_required: ['ระบุข้อมูลเพื่อค้นหา', 'ใส่ชื่อลูกค้า Client ID หรือเลขคำขอ IMR แล้วตรวจอีกครั้ง', 'warn']
    };
    var choices = Array.isArray(b.choices) ? b.choices.filter(function(c) { return rec(c.client_id); }) : [];
    var info = choices.length ? ['พบหลายระเบียน กรุณาเลือกสมาชิก', 'ตรวจชื่อและ Client ID ให้ตรงก่อนเปิดผลการตรวจ', 'warn'] : (errors[code] || ['ยังยืนยันข้อมูลไม่ได้', 'ระบบยังอ่านข้อมูลไม่สำเร็จ ลองตรวจอีกครั้ง หรือเปิดรายละเอียดเพื่อหาสาเหตุ', 'warn']);
    var actions = customerLink(b.customer) + (code === 'owner_required' ? '<a class="rc-button" href="/internal/admin/login">เข้าสู่ระบบ Owner</a>' : '<button class="rc-button" type="button" data-retry>ลองอีกครั้ง</button>');
    result.innerHTML = customer(b.customer) + state(info[0], info[1], info[2], actions) + (choices.length ? '<div class="rc-choices">' + choices.map(function(c) { return '<button class="rc-button rc-choice" data-client="' + esc(c.client_id) + '"><span>' + esc(c.display_name || 'สมาชิก MMD') + '</span><span class="rc-id">' + esc(c.client_id) + '</span></button>'; }).join('') + '</div>' : '') + diagnostic(code);
    return info[0];
  }
  function identityView(i) {
    if (i.found !== true) return state('ยังไม่มีคำขอยืนยันตัวตนที่อ่านได้', 'ข้อมูลส่วนนี้ไม่ใช่หลักฐานว่าสมาชิกไม่มีสิทธิ์หรือไม่มีประวัติ', 'warn', '');
    var s = i.submitted || {}, m = i.matching || {}, l = i.verified_line_identity || {};
    return '<article class="rc-panel"><span class="rc-label">Identity request</span><h2>คำขอยืนยันตัวตน</h2><p>' + badge(label(i.status || i.state), i.unresolved === false && i.status === 'resolved' ? 'ok' : 'warn') + '</p><dl class="rc-dl">' + row('เลขคำขอ', i.request_id) + row('ชื่อที่แจ้ง · claimed name', i.claimed_name) + row('อีเมล', s.email) + row('โทรศัพท์', s.phone) + row('LINE ที่ตรวจสอบ', l.verified === true ? 'ยืนยันแล้ว' : 'ยังไม่มีหลักฐานยืนยัน') + row('รหัสท้าย LINE', l.tail) + '</dl><details class="rc-errorcode"><summary>หลักฐานการจับคู่ตัวตน</summary><dl class="rc-dl">' + row('แหล่งที่มาของชื่อ', i.claimed_name_source) + row('วิธีจับคู่', m.match_type) + row('ความเชื่อมั่นจากระบบ', m.confidence) + row('สถานะการจับคู่', m.state) + row('แหล่งหลักฐาน', list(m.evidence_sources)) + row('Member ที่อาจตรงกัน', list(m.candidate_member_ids)) + row('Client ที่อาจตรงกัน', list(m.candidate_client_ids)) + row('ยังมีประเด็นไม่ยุติ', i.unresolved == null ? null : i.unresolved ? 'มี' : 'ไม่มี') + '</dl></details></article>';
  }
  function render(b, scope) {
    if (!b || b.ok !== true) return errorView(b || {});
    if (scope.inbox) {
      var inbox = b.recovery_inbox;
      if (!inbox || !Array.isArray(inbox.items) || inbox.state === 'unavailable') return errorView({ error: 'recovery_inbox_unavailable' });
      var items = inbox.items.filter(function(i) { return i && requestId(i.request_id); });
      if (inbox.items.length && !items.length) return errorView({ error: 'invalid_response' });
      if (!items.length) { result.innerHTML = state('ยังไม่มีคำขอ Recovery ที่อ่านได้', 'ค้นหาสมาชิกด้านบนเพื่อตรวจสถานะรายคนได้', 'warn', ''); return 'ยังไม่มีคำขอ Recovery ที่อ่านได้'; }
      result.innerHTML = '<ul class="rc-inbox">' + items.map(function(i) { var s = i.submitted || {}; return '<li><a href="?request_id=' + encodeURIComponent(i.request_id) + '"><div><span class="rc-ref">' + esc(i.request_id) + '</span><br><strong>' + esc(i.claimed_name || 'คำขอยืนยันตัวตน') + '</strong><p>' + esc([s.email, s.phone].filter(Boolean).join(' · ') || 'ยังไม่มีข้อมูลติดต่อ') + '</p><p>วิธีจับคู่: ' + esc(i.match_type || 'ยังไม่ระบุ') + '</p></div><div>' + badge(label(i.status), i.status === 'resolved' && i.unresolved === false ? 'ok' : 'warn') + '<p>เปิดรายละเอียด →</p></div></a></li>'; }).join('') + '</ul>';
      return 'อ่านคำขอ Recovery แล้ว ' + items.length + ' รายการ';
    }
    var c = b.customer || {}, m = b.membership || {}, r = b.recovery || {}, p = b.points || {}, a = b.acceptance || {}, i = b.identity_recovery_request || {};
    if (scope.request_id) { result.innerHTML = identityView(i); return 'อ่านรายละเอียดคำขอยืนยันตัวตนแล้ว'; }
    var recoveryText = r.state === 'reconciled' ? 'ประวัติที่ระบบอ่านได้ผ่านการตรวจครบแล้ว ดูสถานะสมาชิกและ Points ด้านล่าง' : r.state === 'review_required' ? 'การรวบรวมประวัติสิ้นสุดแล้ว แต่มีรายการที่ต้องตรวจหลักฐานเพิ่มเติม ดูรายละเอียดการกู้คืนด้านล่าง' : r.state === 'blocked' ? 'ระบบหยุดการตรวจไว้ ต้องตรวจสาเหตุและหลักฐานก่อนดำเนินการต่อ' : 'ผลยังไม่พร้อมยืนยัน สามารถอ่านสถานะอีกครั้งได้ โดยไม่ต้องให้ลูกค้าเปิด LINE';
    var verifiedPoints = (r.state === 'reconciled' || r.state === 'review_required') && p.status === 'verified' && typeof p.value === 'number' && Number.isFinite(p.value);
    var pointsValue = verifiedPoints ? new Intl.NumberFormat('th-TH').format(p.value) : 'รอยืนยัน';
    result.innerHTML = customer(c) + state(label(r.state), recoveryText, tone(r.state), '<button class="rc-button" type="button" data-retry>อ่านสถานะอีกครั้ง</button>') + '<div class="rc-grid">'
      + '<article class="rc-metric"><span class="rc-label">ระดับสมาชิก</span><strong class="rc-value">' + esc(m.status === 'unavailable' ? 'ยังยืนยันไม่ได้' : (m.label || m.level || 'ยังยืนยันไม่ได้')) + '</strong><p>' + esc(label(m.lifecycle)) + '</p></article>'
      + '<article class="rc-metric"><span class="rc-label">ใช้งานได้ถึง</span><strong class="rc-value">' + date(m.active_through) + '</strong><p>วันที่ตามข้อมูลสมาชิก</p></article>'
      + '<article class="rc-metric"><span class="rc-label">Points</span><strong class="rc-value">' + pointsValue + '</strong><p>' + (verifiedPoints ? 'ยอดที่ระบบยืนยันแล้ว' : 'ยังไม่แสดงเป็นยอดยืนยัน') + '</p></article></div>'
      + '<details class="rc-panel"' + (r.state === 'review_required' || r.state === 'blocked' ? ' open' : '') + '><summary>รายละเอียดการกู้คืนประวัติ</summary><dl class="rc-dl">' + row('สถานะจากระบบ', r.state) + row('เหตุผล', r.reason) + row('รายการรอตรวจ', r.pending_review_count) + row('หมายเหตุต้นทาง', r.source_note_count) + row('รายการที่พบ', r.candidate_count) + row('ประวัติที่สร้างแล้ว', r.materialized_count) + row('กระบวนการสิ้นสุด', r.terminal == null ? null : r.terminal ? 'ใช่' : 'ยังไม่สิ้นสุด') + '<div><dt>อัปเดตล่าสุด</dt><dd>' + date(r.updated_at) + '</dd></div></dl></details>'
      + '<details class="rc-panel"><summary>หลักฐานสมาชิกและ Points</summary><dl class="rc-dl">' + row('แหล่งข้อมูลลูกค้า', c.source) + row('แหล่งข้อมูลสมาชิก', m.source) + row('สถานะ Points', p.status) + row('แหล่งข้อมูล Points', p.source) + row('Acceptance evidence', a.evidence_id) + row('สถานะหลักฐาน', a.status) + '<div><dt>บันทึกหลักฐานเมื่อ</dt><dd>' + date(a.recorded_at) + '</dd></div></dl></details>' + (i.found ? identityView(i) : '<p class="rc-muted">ยังไม่มีคำขอยืนยันตัวตนที่อ่านได้สำหรับระเบียนนี้</p>');
    return label(r.state);
  }
  async function load(scope, focus) {
    var id = ++sequence;
    if (controller) controller.abort();
    controller = new AbortController();
    var current = controller, timedOut = false;
    lastScope = scope;
    heading.textContent = scope.inbox ? 'คำขอ Recovery ล่าสุด' : scope.request_id ? 'รายละเอียดคำขอ' : 'ผลการตรวจสมาชิก';
    readtime.textContent = '';
    result.setAttribute('aria-busy', 'true');
    result.innerHTML = '<div class="rc-state rc-loading"><span class="rc-spinner" aria-hidden="true"></span><p>กำลังอ่านข้อมูลจากระบบ…</p></div>';
    announcement.textContent = 'กำลังอ่านข้อมูลจากระบบ';
    var u = new URL(api, location.origin);
    Object.keys(scope).forEach(function(k) { u.searchParams.set(k, scope[k]); });
    var timer = setTimeout(function() { timedOut = true; current.abort(); }, 20000);
    try {
      var response = await fetch(u, { credentials: 'include', headers: { accept: 'application/json' }, cache: 'no-store', signal: current.signal });
      if (id !== sequence) return;
      if (response.status === 401 || (response.redirected && new URL(response.url).pathname.startsWith('/internal/admin/login'))) {
        location.href = '/internal/admin/login?next=' + encodeURIComponent(location.pathname + location.search); return;
      }
      var b = await response.json().catch(function() { return { ok: false, error: 'invalid_response' }; });
      if (id !== sequence) return;
      if (!response.ok) b = { ...(b || {}), ok: false, ...(response.status === 403 ? { error: 'owner_required' } : {}) };
      announcement.textContent = render(b, scope);
      if (b && b.ok === true) readtime.textContent = 'อ่านข้อมูลเมื่อ ' + new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date()) + ' น. (กรุงเทพฯ)';
    } catch (e) {
      if (id !== sequence) return;
      announcement.textContent = errorView({ error: timedOut ? 'request_timeout' : 'network_unavailable' });
    } finally {
      clearTimeout(timer);
      if (id === sequence) { result.setAttribute('aria-busy', 'false'); if (focus) result.focus({ preventScroll: true }); }
    }
  }
  function navigate(scope) {
    var url = new URL(location.href); url.search = '';
    Object.keys(scope).forEach(function(k) { url.searchParams.set(k, scope[k]); });
    history.replaceState(null, '', url.pathname + url.search);
    load(scope, true);
  }
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) { input.setCustomValidity('ใส่ชื่อลูกค้า Client ID หรือเลขคำขอ'); input.reportValidity(); return; }
    navigate(rec(q) ? { client_id: q } : requestId(q) ? { request_id: q.toUpperCase() } : { q: q });
  });
  input.addEventListener('input', function() { input.setCustomValidity(''); });
  document.querySelector('[data-inbox]').addEventListener('click', function() { input.value = ''; navigate({ inbox: '1' }); });
  result.addEventListener('click', function(e) {
    var retry = e.target.closest('[data-retry]'); if (retry) { load(lastScope, true); return; }
    var choice = e.target.closest('[data-client]'); if (choice && rec(choice.dataset.client)) { input.value = choice.dataset.client; navigate({ client_id: choice.dataset.client }); }
  });
  var params = new URL(location.href).searchParams;
  var client = params.get('client_id'), ref = params.get('request_id'), q = params.get('q');
  input.value = client || ref || q || '';
  load(client ? { client_id: client } : ref ? { request_id: ref } : q ? { q: q } : { inbox: '1' }, false);
}
