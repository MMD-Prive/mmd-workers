export function renderRelaxSpaPage({ partner = false } = {}) {
  const config = { partner, api: partner ? '/v1/partner/relax-spa/' : '/v1/admin/mms/relax-spa/' };
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>Relax Spa by 9 · SĪGIL System</title>
<style>
:root{--paper:#f3f3ec;--ink:#14231b;--muted:#68776e;--line:#dce3da;--lime:#b5d85e}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"LINE Seed Sans TH","Noto Sans Thai",system-ui,sans-serif}a{color:inherit}button,input,select,textarea{font:inherit}button,a.btn{cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}button,input,select{min-height:46px}input,select,textarea{width:100%;padding:11px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink)}textarea{min-height:80px}input[type=checkbox]{width:20px;min-height:20px;height:20px;accent-color:#315e43}label{display:grid;gap:7px;font-size:13px}label.check{display:flex;align-items:center;line-height:1.6}button,.btn{padding:10px 18px;border:1px solid var(--line);border-radius:99px;background:#fff;color:var(--ink);text-decoration:none}.primary{background:var(--ink);color:white;border-color:var(--ink)}:focus-visible{outline:3px solid #8ea748;outline-offset:3px}main{max-width:1200px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:12px}.brand{letter-spacing:.13em}.hero{padding:32px;border-radius:28px;background:var(--ink);color:white;margin:24px 0}.kicker{color:var(--lime);font-size:11px;letter-spacing:.15em}h1{font-size:clamp(30px,5vw,52px);letter-spacing:-.035em;margin:14px 0}h2{font-size:25px;margin:0 0 12px}h3{margin:0 0 12px}p{line-height:1.75}.hero p{color:#dce7dd;max-width:750px;margin-bottom:0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stat,.card{padding:22px;background:white;border:1px solid var(--line);border-radius:20px}.stat small{color:var(--muted)}.stat b{display:block;margin-top:8px;font-size:28px}.nav{display:flex;gap:8px;overflow:auto;margin:22px 0}.nav a{white-space:nowrap;padding:13px 18px;border:1px solid var(--line);border-radius:99px;text-decoration:none;background:white}.nav a[aria-current=page]{background:var(--ink);color:#fff}.grid{display:grid;grid-template-columns:minmax(280px,.85fr) minmax(0,1.5fr);gap:18px;align-items:start}.list{display:grid;gap:12px}.fields{display:grid;gap:14px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.muted{color:var(--muted);font-size:13px}.pill{display:inline-block;padding:6px 10px;border-radius:99px;background:#e5f0e8;font-size:12px}.alert{padding:15px 18px;border-radius:14px;background:#e5f0e8;margin:16px 0;line-height:1.6}.alert.error{background:#f6e9e6;color:#8d3e38}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:10px 0;font-size:14px}.row b{font-variant-numeric:tabular-nums}.flow{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;margin-top:22px}.flow span{padding:8px 12px;border:1px solid #405947;border-radius:99px}details{margin-top:18px;border-top:1px solid var(--line);padding-top:16px}summary{cursor:pointer;min-height:44px}.code{font-size:11px;overflow-wrap:anywhere;color:var(--muted)}.cost{display:grid;gap:8px;padding:12px;background:var(--paper);border-radius:14px}.space{margin-top:18px}.empty{padding:26px;border:1px dashed #c4cec2;border-radius:18px;color:var(--muted);line-height:1.7}table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:10px 4px;border-bottom:1px solid var(--line)}[hidden]{display:none!important}@media(max-width:760px){main{padding:16px}.hero{padding:24px}.stats{grid-template-columns:1fr 1fr}.stat{padding:16px}.grid{grid-template-columns:1fr}.pair{grid-template-columns:1fr}.top{align-items:flex-start}.card{padding:18px}.nav{margin:18px -16px;padding:0 16px 6px}h2{font-size:22px}}
</style></head><body><main><div class="top"><span class="brand">SĪGIL | SYSTEM</span><a id="back" href="${partner ? '/partner/dashboard' : '/internal/admin/mms'}">← ${partner ? 'กลับ MY Partner' : 'กลับงาน Male Massage'}</a></div>
<header class="hero"><span class="kicker">MALE MASSAGE · PARTNER TO SPA</span><h1>Relax Spa by 9</h1><p>ติดตามคนที่แนะนำให้ร้าน งานที่เกิดขึ้น เงินที่รับจริง และส่วนแบ่งตามข้อตกลงของแต่ละงาน</p><div class="flow"><span>01 แนะนำ Therapist</span><span>02 ร้านตอบรับ</span><span>03 รับบริการและเงิน</span><span>04 ตรวจส่วนแบ่งและจ่าย</span></div></header>
<div class="stats" id="stats"><article class="stat"><small>รายการแนะนำ</small><b>—</b></article><article class="stat"><small>ร้านตอบรับ</small><b>—</b></article><article class="stat"><small>งานที่เชื่อมแล้ว</small><b>—</b></article><article class="stat"><small>รอตรวจส่วนแบ่ง</small><b>—</b></article></div>
<nav class="nav" aria-label="ขั้นตอน Relax Spa"><a href="?view=referrals" data-view="referrals">แนะนำคน</a><a href="?view=agreements" data-view="agreements" data-owner>ข้อตกลง</a><a href="?view=services" data-view="services">งานและเงิน</a><a href="?view=shares" data-view="shares">ส่วนแบ่ง</a></nav>
<div id="notice" class="alert" role="status" aria-live="polite">กำลังอ่านรายการ…</div><div class="actions"><button id="refresh" type="button">รีเฟรชรายการ</button></div><section id="content" class="space" aria-label="รายการ Relax Spa"></section>
<footer class="muted space">ยอดแบ่งอ้างข้อตกลงที่อนุมัติของงานนั้น การบันทึกหลักฐานรับเงินหรือจ่ายเงินผ่านหน้านี้เป็นการตรวจโดย Owner และมีประวัติผู้บันทึก</footer></main><script>(${spaBrowser.toString()})(${JSON.stringify(config)});</script></body></html>`;
}

function spaBrowser(config) {
  const API = config.api;
  const token = config.partner ? new URL(location.href).searchParams.get('t') || '' : '';
  const endpoint = command => API + command + (token ? '?t=' + encodeURIComponent(token) : '');
  const labels = { therapist: 'Therapist', spa: 'Relax Spa by 9', partner: 'Partner ผู้แนะนำ', mms: 'Male Massage' };
  const errors = {
    SPA_SESSION_REQUIRED: 'กรุณาเข้าสู่ระบบ Owner หรือ MMS Partner อีกครั้ง', OWNER_REQUIRED: 'รายการนี้ต้องให้ Owner ตรวจและบันทึก',
    SPA_LEDGER_NOT_CONFIGURED: 'ยังไม่เปิดระบบบันทึก Relax Spa · ติดต่อ Owner เพื่อเปิดใช้งาน',
    THERAPIST_NOT_ACTIVE: 'Therapist ต้องเป็น Active ก่อนแนะนำให้ร้าน', REFERRAL_ALREADY_EXISTS: 'มีรายการแนะนำคนนี้จาก Partner เดียวกันแล้ว',
    PARTNER_ACCOUNT_INVALID: 'ระบุบัญชี Partner เป็น mms-partner:ชื่อบัญชี หรือ partner:รหัส record', SHARES_MUST_TOTAL_100: 'รวมส่วนแบ่งทุกฝ่ายให้เท่ากับ 100%',
    CANONICAL_JOB_MISMATCH: 'งาน MMS ไม่ตรงกับ Therapist หรือเป็นงานทดสอบ/ยกเลิก', CANONICAL_RECORD_UNRESOLVED: 'ยังยืนยันรายการ MMS ที่อ้างอิงไม่ได้',
    JOB_ALREADY_LINKED: 'งานนี้เชื่อมไว้แล้ว กรุณาเปิดรายการเดิม', COMPLETED_JOB_REQUIRED: 'งาน MMS ต้องจบบริการแล้วจึงอนุมัติหรือจ่ายส่วนแบ่งได้',
    FULL_PAYMENT_REQUIRED: 'ยอดรับเงินที่ตรวจแล้วต้องครบตามค่าบริการก่อนแบ่งเงิน', PAYMENT_EVIDENCE_ALREADY_USED: 'หลักฐานรับเงินนี้ถูกใช้แล้ว',
    PAYOUT_EVIDENCE_ALREADY_USED: 'หลักฐานจ่ายนี้ถูกใช้แล้ว', PAYOUT_ALREADY_RECORDED: 'บันทึกการจ่ายฝ่ายนี้ไปแล้ว',
    OVERPAYMENT_REQUIRES_REVIEW: 'ยอดรับเกินค่าบริการ กรุณาตรวจการรับเงินก่อนบันทึก', SETTLEMENT_LOCKED: 'อนุมัติส่วนแบ่งแล้ว ต้องตรวจการแก้ไขหรือคืนเงินแยกจากรายการเดิม',
    NEGATIVE_PROFIT_REQUIRES_REVIEW: 'ต้นทุนสูงกว่ารายรับ กรุณาตรวจข้อตกลง', COSTS_EXCEED_SERVICE_AMOUNT: 'ต้นทุนต้องไม่เกินค่าบริการ',
    DATE_INVALID: 'ตรวจวันเวลารับหรือจ่ายเงินอีกครั้ง ไม่รับวันที่ในอนาคต',
  };
  let data = null, work = null, busy = false;
  const keys = new Map();
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const thb = v => v == null ? 'รอตรวจ' : (v / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' บาท';
  const field = (name, label, type = 'text', extra = '') => '<label>' + label + '<input name="' + name + '" type="' + type + '" required ' + extra + '></label>';
  const check = (name, label) => '<label class="check"><input type="checkbox" name="' + name + '" required>' + label + '</label>';
  const form = (command, fields, label, id = '') => '<form data-command="' + command + '" data-id="' + esc(id) + '" class="fields">' + fields + '<button class="primary" type="submit">' + label + '</button></form>';
  const select = (name, label, rows) => '<label>' + label + '<select name="' + name + '" required><option value="">เลือก…</option>' + rows.map(r => '<option value="' + esc(r.id) + '">' + esc(r.label) + '</option>').join('') + '</select></label>';
  const card = html => '<article class="card">' + html + '</article>';
  const blank = copy => '<div class="empty">' + copy + '</div>';
  const isOwner = () => data?.actor.role === 'owner';
  const val = (f, key) => f.get(key);
  function amount(value) { const s = String(value).trim(); if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(s)) throw Error('กรอกยอดเงินเป็นบาท ไม่เกิน 2 ตำแหน่งทศนิยม'); const [a, b = ''] = s.split('.'); return Number(a) * 100 + Number(b.padEnd(2, '0')); }
  function datetime(value) { return new Date(String(value) + ':00+07:00').toISOString(); }
  function notice(copy, bad = false) { $('#notice').textContent = copy; $('#notice').className = 'alert' + (bad ? ' error' : ''); }
  async function api(command, body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(endpoint(command), { method: body ? 'POST' : 'GET', credentials: 'same-origin', referrerPolicy: 'no-referrer', headers: body ? { 'content-type': 'application/json' } : { accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      const p = await res.json(); if (!res.ok || p.ok !== true) throw Error(errors[p.error?.code] || 'ยังบันทึกไม่ได้ · ' + (p.error?.code || res.status)); return p.data;
    } catch (e) { if (e.name === 'AbortError') throw Error('การเชื่อมต่อใช้เวลานาน กดรายการเดิมอีกครั้งเพื่อตรวจผลได้'); throw e; } finally { clearTimeout(timer); }
  }
  function getView() { const v = new URL(location.href).searchParams.get('view'); return ['agreements', 'services', 'shares'].includes(v) && (v !== 'agreements' || isOwner()) ? v : 'referrals'; }
  function row(name, value) { return '<div class="row"><span>' + esc(name) + '</span><b>' + esc(value) + '</b></div>'; }
  function referralForm() {
    const people = (work?.therapists || []).filter(t => t.status === 'Active').map(t => ({ id: t.therapist_id, label: t.display_name || t.therapist_id }));
    return card('<h2>แนะนำ Therapist ให้ร้าน</h2><p class="muted">บันทึกผู้แนะนำก่อนส่งให้ร้านพิจารณา การแนะนำยังไม่ใช่การรับเข้าร้านหรือคิวยืนยัน</p>' + form('referrals',
      (isOwner() ? field('partner_id', 'บัญชี Partner ผู้แนะนำ', 'text', 'placeholder="mms-partner:ชื่อบัญชี หรือ partner:rec…"') : '<p class="muted">ผู้แนะนำ: ' + esc(data.actor.id) + '</p>') +
      select('therapist_id', 'Therapist ที่เป็น Active', people) + '<label>รายละเอียดที่ต้องการส่งให้ร้าน<textarea name="note" maxlength="1000"></textarea></label>', 'บันทึกรายการแนะนำ'));
  }
  function renderReferrals() {
    const names = { referred: 'รอร้านตอบรับ', accepted: 'ร้านตอบรับแล้ว', declined: 'ร้านยังไม่รับ' };
    $('#content').innerHTML = '<div class="grid">' + referralForm() + '<div class="list">' + (data.referrals.map(r => card('<span class="pill">' + names[r.status] + '</span><h3 class="space">' + esc(r.therapist_name) + '</h3><p class="muted">ผู้แนะนำ ' + esc(r.partner_id) + '</p><p>' + esc(r.note) + '</p><p class="code">' + esc(r.id) + '</p>' +
      (isOwner() && r.status === 'referred' ? '<details><summary>บันทึกคำตอบจากร้าน</summary>' + form('referral-decision', select('decision', 'คำตอบ', [{ id: 'accepted', label: 'ร้านตอบรับ' }, { id: 'declined', label: 'ร้านยังไม่รับ' }]) + field('evidence_ref', 'หลักฐานอ้างอิงคำตอบจากร้าน'), 'บันทึกคำตอบ', r.id) + '</details>' : '') +
      (r.status === 'accepted' ? '<a class="btn" href="?view=services">ไปดูงานและเงิน →</a>' : ''))).join('') || blank('ยังไม่มีรายการแนะนำ')) + '</div></div>';
  }
  function renderAgreements() {
    const rates = Object.entries(labels).map(([role, name]) => field(role, 'ส่วน ' + name + ' (%)', 'number', 'min="0" max="100" step="0.01"')).join('');
    $('#content').innerHTML = '<div class="grid">' + card('<h2>เพิ่มข้อตกลง</h2><p class="muted">ตั้งแยกต่อข้อตกลง รวมส่วนแบ่ง 100% ถ้าแบ่งกำไรสุทธิ ให้ระบุต้นทุนที่ตกลงกันในแต่ละงาน โดยไม่หักค่าตอบแทนซ้ำกับส่วน Therapist</p>' + form('agreements',
      field('title', 'ชื่อ / รุ่นข้อตกลง') + select('basis', 'ฐานคำนวณ', [{ id: 'received_revenue', label: 'รายรับค่าบริการที่รับจริง' }, { id: 'net_profit', label: 'รายรับจริงหักต้นทุนที่ตกลงกัน' }]) + '<div class="pair">' + rates + '</div>' + field('terms_ref', 'เอกสาร / หลักฐานข้อตกลง') + check('approval_confirmed', 'Owner ตรวจข้อตกลงและอัตราของทุกฝ่ายแล้ว'), 'อนุมัติข้อตกลง')) + '<div class="list">' + (data.agreements.map(a => card('<h3>' + esc(a.title) + '</h3><p class="muted">' + (a.basis === 'net_profit' ? 'แบ่งกำไรหลังหักต้นทุนที่ตกลงกัน' : 'แบ่งรายรับที่รับจริง') + '</p>' + Object.entries(labels).map(([role, name]) => row(name, (a.shares_bps[role] / 100) + '%')).join('') + '<p class="code">' + esc(a.terms_ref) + '</p><p class="muted">อนุมัติโดย ' + esc(a.approved_by) + ' · ' + new Date(a.approved_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) + '</p>')).join('') || blank('ยังไม่มีข้อตกลงที่อนุมัติ')) + '</div></div>';
  }
  function serviceForm() {
    const referrals = data.referrals.filter(r => r.status === 'accepted').map(r => ({ id: r.id, label: r.therapist_name + ' · ' + r.partner_id }));
    const jobs = (work?.jobs || []).filter(j => !j.is_test && j.therapist_id).map(j => ({ id: j.job_id, label: (j.service || j.job_id) + ' · ' + j.therapist_id + ' · ' + j.status }));
    return card('<h2>เชื่อมงานที่ร้าน</h2><p class="muted">เลือกงาน MMS ที่มี Therapist ตรงกับรายการแนะนำและข้อตกลงของงานนี้ หลักฐานต้องระบุว่าเป็นงานที่ Relax Spa by 9</p>' + form('services',
      select('referral_id', 'รายการที่ร้านตอบรับแล้ว', referrals) + select('job_id', 'งาน MMS จริง', jobs) + select('agreement_id', 'ข้อตกลงที่อนุมัติ', data.agreements.map(a => ({ id: a.id, label: a.title }))) + field('expected_amount', 'ค่าบริการที่ตกลง (บาท)', 'number', 'min="0.01" step="0.01"') + field('service_evidence', 'หลักฐานงานที่ร้าน / ใบงาน') + '<div><h3>ต้นทุนตามข้อตกลง</h3><p class="muted">เพิ่มเฉพาะต้นทุนที่ใช้หักฐานกำไร ไม่หักซ้ำกับส่วนแบ่ง</p><div data-costs class="list"></div><button type="button" data-add-cost>+ เพิ่มต้นทุน</button></div>', 'เชื่อมงานและเก็บข้อตกลงของงาน'));
  }
  function paymentDetails(s) {
    const total = s.receipts.reduce((sum, r) => sum + r.amount, 0);
    const job = (work?.jobs || []).find(j => j.job_id === s.job_id);
    return row('สถานะงาน MMS', job?.status || 'ยังอ่านสถานะงานไม่ได้') + row('ค่าบริการที่ตกลง', thb(s.expected_amount)) + row('รับเงินและตรวจแล้ว', thb(total)) + row('ยังรอรับ', thb(s.expected_amount - total)) +
      '<details><summary>หลักฐานรับเงิน (' + s.receipts.length + ')</summary>' + (s.receipts.map(r => '<p class="muted">' + esc(thb(r.amount)) + ' · ' + esc(r.received_by) + '<br>' + esc(r.evidence_ref) + ' · ตรวจโดย ' + esc(r.verified_by) + '</p>').join('') || '<p class="muted">ยังไม่มีรายการรับเงิน</p>') + '</details>' +
      (!s.settlement && total < s.expected_amount ? '<details><summary>บันทึกเงินที่รับจริง</summary>' + form('receipts', field('amount', 'จำนวนรับจริง (บาท)', 'number', 'min="0.01" step="0.01"') + field('received_by', 'ผู้รับเงิน / บัญชีปลายทางที่ตรวจแล้ว') + field('received_at', 'วันเวลารับเงิน · เวลาไทย', 'datetime-local') + field('evidence_ref', 'เลขอ้างอิงธุรกรรม / หลักฐานรับเงิน') + check('verification_confirmed', 'Owner ตรวจยอด ผู้รับเงิน และหลักฐานแล้ว'), 'บันทึกผลตรวจรับเงิน', s.id) + '</details>' : '');
  }
  function partnerService(s) { return card('<h3>' + esc(s.therapist_name) + '</h3><p class="muted">' + esc(s.agreement_title) + '</p>' + row('การรับเงิน', s.payment_status === 'recorded' ? 'มีรายการรับเงิน · รอปิดยอด' : 'รอรับเงิน') + row('การแบ่งเงิน', s.settlement_status === 'approved' ? 'อนุมัติแล้ว' : 'รอ Owner ตรวจ') + row('ส่วนแบ่งของคุณ', thb(s.partner_share)) + row('การจ่ายให้คุณ', s.partner_payout ? 'บันทึกจ่ายแล้ว · ' + thb(s.partner_payout.amount) : 'ยังไม่มีผลตรวจการจ่าย') + (s.partner_payout ? '<p class="code">' + esc(s.partner_payout.evidence_ref) + '</p>' : '') + '<p class="code">งาน ' + esc(s.job_id) + '</p>'); }
  function renderServices() {
    if (!isOwner()) { $('#content').innerHTML = '<div class="list">' + (data.services.map(partnerService).join('') || blank('ยังไม่มีงานที่เชื่อมกับรายการแนะนำของคุณ')) + '</div>'; return; }
    $('#content').innerHTML = '<div class="grid">' + serviceForm() + '<div class="list">' + (data.services.map(s => card('<h3>' + esc(s.therapist_name) + '</h3><p class="muted">' + esc(s.agreement.title) + ' · ' + esc(s.partner_id) + '</p><p class="code">' + esc(s.job_id) + '</p>' + paymentDetails(s) + '<div class="actions"><a class="btn" href="?view=shares">ดูส่วนแบ่ง →</a></div>')).join('') || blank('ยังไม่มีงานที่ร้านซึ่งเชื่อมแล้ว')) + '</div></div>';
  }
  function renderShares() {
    if (!isOwner()) { renderServices(); return; }
    $('#content').innerHTML = '<h2>ส่วนแบ่งตามข้อตกลงของแต่ละงาน</h2><p class="muted">อนุมัติได้เมื่องาน MMS เป็น Completed และรับเงินครบแล้ว การบันทึกจ่ายต้องมีหลักฐานของผู้รับจริง</p><div class="list">' + (data.services.map(s => {
      const received = s.receipts.reduce((v, r) => v + r.amount, 0), costs = s.costs.reduce((v, c) => v + c.amount, 0);
      let html = '<h3>' + esc(s.therapist_name) + ' · ' + esc(s.agreement.title) + '</h3><p class="code">' + esc(s.job_id) + '</p>' + row('ฐานคำนวณ', s.agreement.basis === 'net_profit' ? 'รายรับจริงหักต้นทุน' : 'รายรับจริง') + row('รายรับที่ตรวจแล้ว', thb(received)) + row('ต้นทุนที่ตกลง', thb(costs)) + row('ยอดที่นำมาแบ่ง', thb(s.agreement.basis === 'net_profit' ? received - costs : received));
      if (!s.settlement) {
        html += Object.entries(labels).map(([role, name]) => row(name, s.agreement.shares_bps[role] / 100 + '% · รออนุมัติยอด')).join('');
        html += '<details><summary>ตรวจข้อตกลงและต้นทุน</summary><p class="code">' + esc(s.agreement.terms_ref) + '</p>' + s.costs.map(c => '<p class="muted">' + esc(c.label) + ' · ' + esc(thb(c.amount)) + '<br>' + esc(c.evidence_ref) + '</p>').join('') + '</details>';
        html += received === s.expected_amount ? '<details><summary>อนุมัติส่วนแบ่ง</summary>' + form('settlements', check('approval_confirmed', 'Owner ตรวจงานจบบริการ การรับเงิน ต้นทุน และข้อตกลงแล้ว'), 'ตรวจสถานะงานและอนุมัติส่วนแบ่ง', s.id) + '</details>' : '<p class="muted">รับเงินให้ครบก่อนตรวจส่วนแบ่ง</p>';
      } else {
        html += '<p class="pill">อนุมัติโดย ' + esc(s.settlement.approved_by) + '</p>';
        for (const [role, name] of Object.entries(labels)) {
          const share = s.settlement.shares[role], payout = s.payouts.find(p => p.role === role);
          html += row(name, thb(share) + (payout ? ' · บันทึกจ่ายแล้ว' : share === 0 ? ' · ไม่มีส่วนแบ่ง' : ' · รอจ่าย'));
          if (payout) html += '<p class="code">ผู้รับ ' + esc(payout.recipient) + ' · ' + esc(payout.evidence_ref) + '</p>';
          else if (share > 0) html += '<details><summary>บันทึกจ่าย ' + name + '</summary>' + form('payouts', '<input type="hidden" name="role" value="' + role + '"><input type="hidden" name="amount" value="' + (share / 100).toFixed(2) + '">' + field('recipient', 'ชื่อผู้รับเงินจริง') + field('paid_at', 'วันเวลาจ่าย · เวลาไทย', 'datetime-local') + field('evidence_ref', 'เลขอ้างอิง / หลักฐานจ่ายส่วนแบ่ง') + check('verification_confirmed', 'Owner ตรวจการจ่าย ' + thb(share) + ' ให้ผู้รับนี้แล้ว'), 'บันทึกผลตรวจการจ่าย', s.id) + '</details>';
        }
      }
      return card(html);
    }).join('') || blank('ยังไม่มีงานที่ต้องตรวจส่วนแบ่ง')) + '</div>';
  }
  function render() {
    const v = getView(); document.querySelectorAll('[data-owner]').forEach(n => n.hidden = !isOwner());
    document.querySelectorAll('[data-view]').forEach(n => n.setAttribute('aria-current', n.dataset.view === v ? 'page' : 'false'));
    const counts = [data.referrals.length, data.referrals.filter(r => r.status === 'accepted').length, data.services.length, data.services.filter(s => isOwner() ? !s.settlement : s.settlement_status !== 'approved').length];
    $('#stats').querySelectorAll('b').forEach((n, i) => n.textContent = counts[i]);
    ({ referrals: renderReferrals, agreements: renderAgreements, services: renderServices, shares: renderShares })[v]();
    if (token) document.querySelectorAll('a[href^="?view="]').forEach(a => { const target = new URL(a.href); target.searchParams.set('t', token); a.href = target.href; });
    if (data.events.length) {
      const history = document.createElement('details'); history.className = 'card space';
      history.innerHTML = '<summary>ประวัติรายการล่าสุด</summary>' + data.events.slice(-50).reverse().map(e => '<p class="muted">' + esc(new Date(e.at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })) + ' · ' + esc(({ referrals: 'แนะนำ Therapist', 'referral-decision': 'บันทึกคำตอบร้าน', agreements: 'อนุมัติข้อตกลง', services: 'เชื่อมงาน', receipts: 'ตรวจรับเงิน', settlements: 'อนุมัติส่วนแบ่ง', payouts: 'ตรวจจ่ายเงิน' })[e.action] || e.action) + (isOwner() ? ' · ' + esc(e.actor_id) : '') + '</p>').join('');
      $('#content').append(history);
    }
    document.querySelectorAll('form[data-command]').forEach(f => f.addEventListener('submit', submit));
    document.querySelectorAll('[data-add-cost]').forEach(button => button.onclick = () => {
      const node = document.createElement('div'); node.className = 'cost'; node.innerHTML = field('cost_label', 'ชื่อต้นทุน') + field('cost_amount', 'ต้นทุน (บาท)', 'number', 'min="0" step="0.01"') + field('cost_evidence', 'หลักฐาน / เงื่อนไขต้นทุน') + '<button type="button">เอารายการนี้ออก</button>';
      node.querySelector('button').onclick = () => node.remove(); button.closest('form').querySelector('[data-costs]').append(node);
    });
    if (!work && (v === 'referrals' || v === 'services')) notice('อ่านบัญชีแล้ว แต่ยังอ่านรายการ Therapist / งานไม่สำเร็จ กดรีเฟรชเพื่อลองใหม่', true);
  }
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const f = event.currentTarget; if (!f.reportValidity()) return;
    const command = f.dataset.command, fd = new FormData(f), body = {};
    try {
      if (command === 'referrals') Object.assign(body, { therapist_id: val(fd, 'therapist_id'), note: val(fd, 'note') || '', ...(isOwner() ? { partner_id: val(fd, 'partner_id') } : {}) });
      if (command === 'referral-decision') Object.assign(body, { referral_id: f.dataset.id, decision: val(fd, 'decision'), evidence_ref: val(fd, 'evidence_ref') });
      if (command === 'agreements') Object.assign(body, { title: val(fd, 'title'), basis: val(fd, 'basis'), terms_ref: val(fd, 'terms_ref'), approval_confirmed: fd.has('approval_confirmed'), shares_bps: Object.fromEntries(Object.keys(labels).map(role => [role, amount(val(fd, role))])) });
      if (command === 'services') Object.assign(body, { referral_id: val(fd, 'referral_id'), job_id: val(fd, 'job_id'), agreement_id: val(fd, 'agreement_id'), service_evidence: val(fd, 'service_evidence'), expected_amount: amount(val(fd, 'expected_amount')), costs: fd.getAll('cost_label').map((label, i) => ({ label, amount: amount(fd.getAll('cost_amount')[i]), evidence_ref: fd.getAll('cost_evidence')[i] })) });
      if (command === 'receipts') Object.assign(body, { service_id: f.dataset.id, amount: amount(val(fd, 'amount')), received_by: val(fd, 'received_by'), received_at: datetime(val(fd, 'received_at')), evidence_ref: val(fd, 'evidence_ref'), verification_confirmed: fd.has('verification_confirmed') });
      if (command === 'settlements') Object.assign(body, { service_id: f.dataset.id, approval_confirmed: fd.has('approval_confirmed') });
      if (command === 'payouts') Object.assign(body, { service_id: f.dataset.id, role: val(fd, 'role'), amount: amount(val(fd, 'amount')), recipient: val(fd, 'recipient'), paid_at: datetime(val(fd, 'paid_at')), evidence_ref: val(fd, 'evidence_ref'), verification_confirmed: fd.has('verification_confirmed') });
      const fingerprint = JSON.stringify({ command, body }); if (!keys.has(fingerprint)) keys.set(fingerprint, crypto.randomUUID()); body.request_key = keys.get(fingerprint);
      busy = true; f.querySelectorAll('button').forEach(b => b.disabled = true); notice('กำลังตรวจและบันทึก…');
      await api(command, body); keys.delete(fingerprint); if (await load()) notice('บันทึกแล้ว · อัปเดตจากระบบเรียบร้อย'); else notice('บันทึกแล้ว แต่ยังโหลดรายการใหม่ไม่ได้ กดรีเฟรชเพื่อตรวจต่อ', true);
    } catch (e) { notice(e.message, true); f.querySelectorAll('button').forEach(b => b.disabled = false); } finally { busy = false; }
  }
  async function load() {
    $('#refresh').disabled = true;
    try {
      data = await api('snapshot'); work = null;
      try {
        if (isOwner()) { const res = await fetch('/v1/admin/mms/workspace', { credentials: 'same-origin', signal: AbortSignal.timeout(15000) }); const p = await res.json(); if (res.ok && p.ok) work = p; }
        else work = await api('catalog');
      } catch (_) { /* render current ledger with unavailable selection */ }
      notice('อ่านรายการจากระบบแล้ว'); render(); return true;
    } catch (e) { data = null; $('#content').replaceChildren(); $('#stats').querySelectorAll('b').forEach(n => n.textContent = '—'); notice(e.message, true); return false; } finally { $('#refresh').disabled = false; }
  }
  if (token) { const back = new URL($('#back').href); back.searchParams.set('t', token); $('#back').href = back.href; }
  document.querySelectorAll('[data-view]').forEach(a => {
    if (token) { const target = new URL(a.href); target.searchParams.set('t', token); a.href = target.href; }
    a.onclick = e => { if (!data || busy) { e.preventDefault(); return; } e.preventDefault(); history.pushState(null, '', a.href); render(); };
  });
  window.addEventListener('popstate', () => { if (data) render(); });
  $('#refresh').onclick = () => { if (!busy) load(); }; load();
}
