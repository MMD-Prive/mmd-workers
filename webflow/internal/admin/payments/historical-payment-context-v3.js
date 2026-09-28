(()=>{'use strict';if(window.__mmdHistoricalPaymentContextV3)return;window.__mmdHistoricalPaymentContextV3=true;if((location.pathname.replace(/\/+$/,'')||'/')!='/internal/admin/payments/historical-backfill')return;const root=document.getElementById('mmd-history-backfill');if(!root)return;
const css=`#mmd-history-backfill input,#mmd-history-backfill select,#mmd-history-backfill textarea{width:100%!important;border:1px solid rgba(255,255,255,.14)!important;border-radius:12px!important;background:#0d0f12!important;color:#f5f5f2!important;-webkit-text-fill-color:#f5f5f2!important;caret-color:#f0d779!important;outline:none!important;box-shadow:none!important}#mmd-history-backfill input,#mmd-history-backfill select{min-height:46px!important;padding:0 13px!important}#mmd-history-backfill textarea{min-height:100px!important;padding:12px 13px!important}#mmd-history-backfill select option{background:#101216!important;color:#f5f5f2!important}#mmd-history-backfill input::placeholder,#mmd-history-backfill textarea::placeholder{color:#85898f!important;-webkit-text-fill-color:#85898f!important;opacity:1!important}#mmd-history-backfill input:focus,#mmd-history-backfill select:focus,#mmd-history-backfill textarea:focus{border-color:rgba(240,215,121,.48)!important;box-shadow:0 0 0 3px rgba(212,175,55,.08)!important}#mmd-history-backfill .mhb__button,#mmd-history-backfill button{color:#e9e5dc!important;-webkit-text-fill-color:#e9e5dc!important}#mmd-history-backfill #mhb-upload{background:linear-gradient(90deg,#d4af37,#f0d779)!important;color:#11120f!important;-webkit-text-fill-color:#11120f!important;border-color:#f0d779!important;font-weight:900!important}#mmd-history-backfill #mhb-upload:disabled{background:#1b1d20!important;color:#8f9398!important;-webkit-text-fill-color:#8f9398!important;border-color:rgba(255,255,255,.12)!important;opacity:1!important}#mmd-history-backfill .mhb-owner-guide{margin:0 0 16px;padding:16px;border:1px solid rgba(212,175,55,.25);border-radius:16px;background:rgba(212,175,55,.055)}#mmd-history-backfill .mhb-owner-guide strong{display:block;color:#f0d779;font-size:15px}#mmd-history-backfill .mhb-owner-guide p{margin:6px 0 0;color:#c8cbd0;font-size:12px;line-height:1.65}#mmd-history-backfill .mhb-owner-extra{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}#mmd-history-backfill .mhb-owner-extra label{display:grid;gap:7px;color:#a7a9ad;font-size:12px;font-weight:750}#mmd-history-backfill .mhb-owner-extra small{grid-column:1/-1;color:#757980;font-size:10px;line-height:1.55}@media(max-width:700px){#mmd-history-backfill .mhb-owner-extra{grid-template-columns:1fr}#mmd-history-backfill .mhb-owner-extra small{grid-column:1}}`;
if(!document.getElementById('mhb-context-v3-css')){const s=document.createElement('style');s.id='mhb-context-v3-css';s.textContent=css;document.head.appendChild(s)}
function text(el,v){if(el)el.textContent=v}function field(n){return root.querySelector('#mhb-review-form [name="'+n+'"]')}function labelFor(el){return el?.closest('label')||null}
function patchIntake(){const f=root.querySelector('#mhb-intake-form');if(!f)return;const title=root.querySelector('#upload .mhb__section-head h2');text(title,'นำเข้าสลิปก่อน — ยังไม่ต้อง Match ตอนนี้');const p=root.querySelector('#upload .mhb__section-head>p:last-child');text(p,'ขั้นนี้มีหน้าที่เก็บหลักฐานให้ไม่หาย ระบบจะอ่านยอด/Ref และลอง Match เองก่อน ถ้ายังไม่รู้ว่าเป็นสลิปอะไร เปอร์ค่อยระบุในขั้น Review ได้');const b=root.querySelector('#mhb-upload');if(b)b.textContent='นำเข้าสลิปเข้า Pending Review';const hint=f.querySelector('.mhb__hint');if(hint)hint.innerHTML='<strong style="color:#f0d779">ยังไม่ใช่การยืนยันเงิน</strong><br>Upload แค่เก็บหลักฐาน + dedupe + extract เท่านั้น ไม่ mark paid / ไม่เพิ่ม Points / ไม่ต่อ Membership / ไม่ confirm Session';const stage=f.querySelector('[name="payment_stage"]');if(stage&&stage.options.length){stage.options[0].textContent='ยังไม่รู้ — ให้ระบบตรวจ / ค่อยเลือกตอน Review';for(const o of stage.options){if(o.value==='deposit')o.textContent='จอง / มัดจำ';if(o.value==='final')o.textContent='จบงาน / ยอดคงเหลือ';if(o.value==='full')o.textContent='จ่ายเต็ม';if(o.value==='tips')o.textContent='Tip / ทิป';if(o.value==='membership')o.textContent='ค่าสมาชิก / ต่ออายุสมาชิก'}}}
function patchReview(){const form=root.querySelector('#mhb-review-form');if(!form)return;if(!form.querySelector('.mhb-owner-guide')){form.insertAdjacentHTML('afterbegin','<div class="mhb-owner-guide"><strong>เปอร์ต้องทำอะไรในขั้นนี้</strong><p>ดูสลิป แล้วบอกระบบว่าเงินก้อนนี้เป็น “งานบริการ” หรือ “สมาชิก” เท่านั้น จากนั้นใส่ Session ID หรือ Member email + Package ที่มีอยู่จริง ระบบจะตรวจ canonical record ก่อนส่งให้ payments-worker ยืนยัน Money Truth</p></div>');const rr=form.querySelector('.mhb__review-reason');if(rr)rr.insertAdjacentHTML('beforebegin','<div class="mhb-owner-extra"><label>ลูกค้าคือใคร <input type="text" data-mhb-customer placeholder="ชื่อที่เปอร์เรียก / ช่วยจำ"></label><label data-mhb-model-wrap>Model คือใคร <input type="text" data-mhb-model placeholder="ชื่อ Model / ช่วยจำ"></label><small>ชื่อด้านบนเป็น context สำหรับ audit เท่านั้น ตัวที่ใช้ Match จริงคือ Session ID สำหรับงาน หรือ Member email + Package สำหรับสมาชิก</small></div>')}
const stage=field('payment_stage');if(stage){const map={deposit:'จอง / มัดจำ',final:'จบงาน / ยอดคงเหลือ',full:'จ่ายเต็ม',tips:'Tip / ทิป',membership:'ค่าสมาชิก / ต่ออายุสมาชิก'};for(const o of stage.options){if(!o.value)o.textContent='เลือกว่าสลิปนี้คืออะไร…';else if(map[o.value])o.textContent=map[o.value]}}
const labels={session_id:'งาน / Session ID',member_email:'Member email',package_code:'Package สมาชิก',review_reason:'สรุปที่ระบบเตรียม + หมายเหตุ'};for(const [n,t] of Object.entries(labels)){const l=labelFor(field(n));if(l&&l.firstChild)l.firstChild.textContent=t+' '}
function mode(){const s=stage?.value||'',membership=s==='membership';const session=labelFor(field('session_id')),email=labelFor(field('member_email')),pkg=labelFor(field('package_code')),model=form.querySelector('[data-mhb-model-wrap]');if(session)session.style.display=membership?'none':'grid';if(email)email.style.display=membership?'grid':'none';if(pkg)pkg.style.display=membership?'grid':'none';if(model)model.style.display=membership?'none':'grid';const st=root.querySelector('#mhb-review-status');if(st&&s)st.textContent=membership?'กรอก Member email + Package แล้วระบบจะตรวจสมาชิกจริงก่อนยืนยัน':'กรอก Session ID ของงาน แล้วระบบจะตรวจงานจริงก่อนยืนยัน'}stage?.addEventListener('change',mode);mode()}
root.addEventListener('click',e=>{const b=e.target.closest('[data-decision="approve"]');if(!b)return;const form=root.querySelector('#mhb-review-form');if(!form||form.hidden)return;const customer=String(form.querySelector('[data-mhb-customer]')?.value||'').trim(),model=String(form.querySelector('[data-mhb-model]')?.value||'').trim(),rr=field('review_reason');if(rr&&(customer||model)){const suffix=['Owner context',customer&&'ลูกค้า '+customer,model&&'Model '+model].filter(Boolean).join(' · ');if(!rr.value.includes('Owner context'))rr.value=(rr.value.trim()?rr.value.trim()+' · ':'')+suffix}},true);
function init(){patchIntake();patchReview()}init();let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(init,80)}).observe(root,{subtree:true,childList:true});})();

(() => {
  'use strict';
  if (window.__mmdCancellationCreditRecoveryUiV1) return;
  window.__mmdCancellationCreditRecoveryUiV1 = true;
  if ((location.pathname.replace(/\/+$/, '') || '/') !== '/internal/admin/payments/historical-backfill') return;

  const root = document.getElementById('mmd-history-backfill');
  if (!root) return;
  const API = '/v1/admin/cancellation-credit-recovery';
  let selectedClient = null;
  let latest = null;
  let busy = false;

  function el(tag, attrs, value) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([name, attributeValue]) => {
      if (name === 'className') node.className = attributeValue;
      else if (name === 'dataset') Object.entries(attributeValue).forEach(([key, dataValue]) => { node.dataset[key] = dataValue; });
      else if (attributeValue !== undefined && attributeValue !== null) node.setAttribute(name, attributeValue);
    });
    if (value !== undefined && value !== null) node.textContent = value;
    return node;
  }

  function text(value) { return String(value == null ? '' : value).trim(); }
  function money(value) { return value == null || value === '' ? '—' : `${Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`; }
  function proofInput(name) { return root.querySelector(`#mhb-review-form [name="${name}"]`); }
  function errorCode(error) { return text(error?.payload?.error?.code || error?.payload?.error || error?.message || error).toUpperCase(); }
  function errorMessage(error) {
    const code = errorCode(error);
    const labels = {
      IDENTITY_CORRECTION_CONFIRMATION_REQUIRED: 'สลิปเดิมผูกลูกค้าคนอื่นอยู่ ต้องยืนยันการแก้ identity และระบุเหตุผลก่อน',
      RECOVERY_PAYMENT_CLIENT_CONFLICT: 'Payment เดิมผูกลูกค้า canonical คนอื่นแล้ว จึงแก้จากหน้านี้ไม่ได้',
      RECOVERY_PAYMENT_ALREADY_EXISTS: 'สลิปนี้มี Payment อยู่แล้ว เพื่อกันแปลงเงินผิดรายการ ระบบล็อกให้ตรวจสอบก่อน',
      RECOVERY_SESSION_COLLISION: 'พบ Session recovery เดิมที่ข้อมูลไม่ตรงกัน กรุณาหยุดและตรวจสอบ',
      RECOVERY_PAYMENT_NOT_OFFICIALLY_VERIFIED: 'ยังไม่มี Payment ที่ payment authority ยืนยันแล้ว',
      RECOVERY_SESSION_NOT_PREPARED: 'ต้องเตรียมงานยกเลิกก่อน',
      HISTORICAL_PROOF_ALREADY_PROCESSED: 'สลิปนี้ผ่าน Historical Review ไปแล้ว จึงห้ามนำมาสร้าง recovery ใหม่',
      FORBIDDEN_ORIGIN: 'เปิดหน้านี้จาก origin ที่ถูกต้อง แล้วลองใหม่',
    };
    return labels[code] || code || 'ทำรายการไม่สำเร็จ';
  }

  async function request(path, options) {
    const response = await fetch(path, {
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json', ...(options?.body ? { 'content-type': 'application/json' } : {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) {
      const error = new Error(text(payload?.error?.code || payload?.error || response.status));
      error.payload = payload;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function style() {
    if (document.getElementById('mmd-cancellation-credit-recovery-style-v1')) return;
    const css = `#mmd-history-backfill .mcr-card{margin:14px 0;padding:17px;border:1px solid rgba(240,215,121,.34);border-radius:16px;background:linear-gradient(135deg,rgba(212,175,55,.11),rgba(10,12,15,.42));color:#eee9df}#mmd-history-backfill .mcr-head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}#mmd-history-backfill .mcr-head h3{margin:0;color:#f0d779;font-size:16px}#mmd-history-backfill .mcr-head p{margin:5px 0 0;color:#c2c5c9;font-size:12px;line-height:1.55}#mmd-history-backfill .mcr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:13px}#mmd-history-backfill .mcr-grid label{display:grid;gap:5px;color:#bcc0c5;font-size:11px;font-weight:700}#mmd-history-backfill .mcr-grid .mcr-wide{grid-column:1/-1}#mmd-history-backfill .mcr-client{margin-top:13px;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(0,0,0,.15)}#mmd-history-backfill .mcr-client-row{display:flex;gap:8px}#mmd-history-backfill .mcr-client-results{display:grid;gap:7px;margin-top:9px}#mmd-history-backfill button.mcr-choice{padding:8px 10px;text-align:left;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:#15181c;color:#e9e5dc;cursor:pointer}#mmd-history-backfill button.mcr-choice:hover{border-color:rgba(240,215,121,.65)}#mmd-history-backfill .mcr-selected{margin-top:9px;color:#f0d779;font-size:12px}#mmd-history-backfill .mcr-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}#mmd-history-backfill .mcr-actions button{padding:10px 12px;border:1px solid rgba(240,215,121,.45);border-radius:10px;background:#1b1e21;color:#f4efe6;font-weight:800;cursor:pointer}#mmd-history-backfill .mcr-actions button[data-mcr-action="issue_credit"]{background:#d4af37;color:#15120a;border-color:#f0d779}#mmd-history-backfill .mcr-actions button:disabled{cursor:not-allowed;opacity:.46}#mmd-history-backfill .mcr-status{min-height:20px;margin:12px 0 0;color:#c5c8cb;font-size:12px;line-height:1.6}#mmd-history-backfill .mcr-guard{margin-top:11px;padding:10px;border-left:3px solid #d4af37;background:rgba(212,175,55,.08);color:#d8d2c5;font-size:11px;line-height:1.6}#mmd-history-backfill .mcr-correction{margin-top:10px;padding:10px;border:1px solid rgba(238,157,74,.5);border-radius:10px;background:rgba(238,157,74,.08)}#mmd-history-backfill .mcr-correction[hidden]{display:none}@media(max-width:700px){#mmd-history-backfill .mcr-grid{grid-template-columns:1fr}#mmd-history-backfill .mcr-grid .mcr-wide{grid-column:auto}#mmd-history-backfill .mcr-client-row{flex-direction:column}}`;
    const node = el('style', { id: 'mmd-cancellation-credit-recovery-style-v1' });
    node.textContent = css;
    document.head.appendChild(node);
  }

  function statusLine(data) {
    const proof = data?.proof || {};
    const session = data?.recovery_session || {};
    const payment = data?.payment || {};
    const credit = data?.credit || {};
    const parts = [];
    if (proof.proof_id) parts.push(`สลิป ${proof.proof_id}`);
    if (proof.deposit_evidence_thb != null) parts.push(`หลักฐานมัดจำ ${money(proof.deposit_evidence_thb)}`);
    if (session.session_id) parts.push(`งานยกเลิก ${session.session_id}`);
    if (payment.officially_verified) parts.push(`เงินยืนยันแล้ว ${money(payment.received_thb)}`);
    if (credit.credit_id) parts.push(`เครดิต ${credit.credit_id} เหลือ ${money(credit.available_thb)}`);
    return parts.join(' · ') || 'เลือกสลิปใน Historical Review ก่อน';
  }

  function card() {
    const section = el('section', { className: 'mcr-card', dataset: { mcrCard: 'v1' } });
    const head = el('div', { className: 'mcr-head' });
    const title = el('div');
    title.append(el('h3', {}, 'งานยกเลิก → เครดิตลูกค้า'), el('p', {}, 'ใช้เฉพาะกรณีลูกค้าวางมัดจำแล้วงานถูกยกเลิก ระบบจะไม่ออกเครดิตจนกว่าจะยืนยันสลิปผ่าน payment authority'));
    const badge = el('small', { dataset: { mcrBadge: 'true' } }, 'ต้องเลือกสลิปก่อน');
    head.append(title, badge);
    section.append(head);

    const client = el('div', { className: 'mcr-client' });
    client.append(el('strong', {}, '1. เลือกลูกค้า canonical'));
    const clientRow = el('div', { className: 'mcr-client-row' });
    const query = el('input', { type: 'search', placeholder: 'ค้นหาชื่อลูกค้า / อีเมล / LINE', dataset: { mcrClientQuery: 'true' } });
    const lookup = el('button', { type: 'button', dataset: { mcrLookup: 'true' } }, 'ค้นหา');
    clientRow.append(query, lookup);
    const selected = el('div', { className: 'mcr-selected', dataset: { mcrSelected: 'true' } }, 'ยังไม่ได้เลือกลูกค้า canonical');
    const results = el('div', { className: 'mcr-client-results', dataset: { mcrResults: 'true' } });
    client.append(clientRow, selected, results);
    section.append(client);

    const grid = el('div', { className: 'mcr-grid' });
    const addInput = (label, attrs, wide) => {
      const wrap = el('label', { className: wide ? 'mcr-wide' : '' }, label);
      wrap.append(el('input', { ...attrs }));
      grid.append(wrap);
    };
    addInput('Model', { type: 'text', value: 'Book EI', dataset: { mcrModel: 'true' } });
    addInput('ประเภทงาน', { type: 'text', value: 'PN', dataset: { mcrJobType: 'true' } });
    addInput('วันงาน (ค.ศ.)', { type: 'date', dataset: { mcrDate: 'true' } });
    addInput('เริ่ม', { type: 'time', value: '01:00', dataset: { mcrStart: 'true' } });
    addInput('จบ', { type: 'time', value: '02:30', dataset: { mcrEnd: 'true' } });
    addInput('ยอดลูกค้าจอง', { type: 'number', min: '0', step: '0.01', value: '15000', dataset: { mcrServiceAmount: 'true' } });
    addInput('จ่าย Model', { type: 'number', min: '0', step: '0.01', value: '10000', dataset: { mcrPayout: 'true' } });
    addInput('สถานที่', { type: 'text', placeholder: 'ชื่อสถานที่', dataset: { mcrLocation: 'true' } }, true);
    addInput('Google Maps', { type: 'url', placeholder: 'https://maps.app.goo.gl/…', dataset: { mcrMap: 'true' } }, true);
    addInput('เหตุผลยกเลิก', { type: 'text', value: 'Book ไม่ตรงปก', dataset: { mcrReason: 'true' } }, true);
    addInput('แหล่งอ้างอิง', { type: 'text', value: 'LINE OFC historical cancellation', dataset: { mcrSource: 'true' } }, true);
    section.append(grid);

    const correction = el('div', { className: 'mcr-correction', hidden: 'hidden', dataset: { mcrCorrection: 'true' } });
    const correctionLabel = el('label');
    const correctionCheck = el('input', { type: 'checkbox', dataset: { mcrCorrectionConfirm: 'true' } });
    correctionLabel.append(correctionCheck, document.createTextNode(' ยืนยันว่าได้ตรวจแล้วว่าต้องแก้ลูกค้าที่ผูกกับสลิปเดิม'));
    correction.append(correctionLabel, el('input', { type: 'text', placeholder: 'เหตุผลการแก้ identity (บังคับ)', dataset: { mcrCorrectionReason: 'true' } }));
    section.append(correction);

    const actions = el('div', { className: 'mcr-actions' });
    [['prepare', '2. เตรียมบันทึกงานยกเลิก'], ['verify_payment', '3. ยืนยันสลิปมัดจำ'], ['issue_credit', '4. ออกเครดิตลูกค้า']].forEach(([action, label]) => {
      actions.append(el('button', { type: 'button', dataset: { mcrAction: action } }, label));
    });
    section.append(actions);
    section.append(el('p', { className: 'mcr-status', dataset: { mcrStatus: 'true' } }, 'เลือกสลิปใน Historical Review แล้วกรอกข้อมูลให้ครบ'));
    section.append(el('div', { className: 'mcr-guard' }, 'กติกา: ช่องยอดงานใช้บันทึกบริบทเท่านั้น เครดิตต้องเท่ากับ “ยอดรับที่ payment authority ยืนยัน” เสมอ และ Session ต้องอยู่สถานะ Cancelled ก่อนออกเครดิต'));
    return section;
  }

  function q(name) { return root.querySelector(`[data-mcr-${name}]`); }
  function setStatus(value) { const node = q('status'); if (node) node.textContent = value; }
  function selectedProof() {
    return {
      proof_id: text(proofInput('proof_id')?.value),
      proof_record_id: text(proofInput('proof_record_id')?.value),
    };
  }
  function selectedProofReady() { const value = selectedProof(); return Boolean(value.proof_id || value.proof_record_id); }
  function setBusy(next) {
    busy = next;
    root.querySelectorAll('[data-mcr-action], [data-mcr-lookup]').forEach((button) => { button.disabled = next; });
  }
  function renderSummary(data) {
    latest = data;
    const badge = q('badge');
    if (badge) badge.textContent = data?.next_action === 'complete' ? 'เครดิตออกแล้ว' : data?.next_action === 'issue_credit' ? 'พร้อมออกเครดิต' : data?.next_action === 'verify_payment' ? 'พร้อมยืนยันสลิป' : 'พร้อมเตรียมงาน';
    setStatus(statusLine(data));
  }

  async function loadStatus() {
    if (!selectedProofReady() || busy) return;
    try {
      const proof = selectedProof();
      const payload = await request(`${API}?${new URLSearchParams(proof).toString()}`);
      renderSummary(payload);
    } catch (error) {
      const code = errorCode(error);
      if (code !== 'HISTORICAL_PROOF_NOT_FOUND') setStatus(errorMessage(error));
    }
  }

  function clientLabel(item) {
    return text(item.canonical_name || item.client_name || item.remembered_name || item.member_email || item.client_id);
  }
  async function lookupClient() {
    const query = text(q('client-query')?.value);
    const results = q('results');
    if (!query) { setStatus('พิมพ์ชื่อ อีเมล หรือ LINE ของลูกค้าก่อนค้นหา'); return; }
    results.replaceChildren(el('small', {}, 'กำลังค้นหา canonical Client…'));
    try {
      const payload = await request('/v1/admin/clients/lineage-lookup', {
        method: 'POST',
        body: JSON.stringify({ query, canonical_only: true }),
      });
      const records = (Array.isArray(payload.records) ? payload.records : Array.isArray(payload.items) ? payload.items : [])
        .filter((item) => text(item?.client_id));
      results.replaceChildren();
      if (!records.length) {
        results.append(el('small', {}, 'ไม่พบ canonical Client — อย่าใช้ชื่อพิมพ์เอง กรุณาแก้ identity ก่อน'));
        return;
      }
      records.slice(0, 8).forEach((item) => {
        const button = el('button', { type: 'button', className: 'mcr-choice' }, `${clientLabel(item)} · ${item.client_id}`);
        button.addEventListener('click', () => {
          selectedClient = { id: text(item.client_id), name: clientLabel(item) };
          q('selected').textContent = `เลือกแล้ว: ${selectedClient.name} (${selectedClient.id})`;
          results.replaceChildren();
          setStatus('เลือก canonical Client แล้ว — เตรียมบันทึกงานยกเลิกได้');
        });
        results.append(button);
      });
    } catch (error) {
      results.replaceChildren(el('small', {}, errorMessage(error)));
    }
  }

  function preparePayload() {
    const proof = selectedProof();
    return {
      action: 'prepare', ...proof,
      client_id: selectedClient?.id || '',
      model_name: text(q('model')?.value),
      job_type: text(q('job-type')?.value) || 'PN',
      job_date: text(q('date')?.value),
      start_time: text(q('start')?.value),
      end_time: text(q('end')?.value),
      location_name: text(q('location')?.value),
      google_map_url: text(q('map')?.value),
      service_amount_thb: text(q('service-amount')?.value),
      model_payout_thb: text(q('payout')?.value),
      cancellation_reason: text(q('reason')?.value),
      source_label: text(q('source')?.value),
      identity_correction_confirmed: q('correction-confirm')?.checked === true,
      identity_correction_reason: text(q('correction-reason')?.value),
    };
  }

  async function action(actionName) {
    if (busy) return;
    if (!selectedProofReady()) { setStatus('เลือกสลิปใน Historical Review ก่อน'); return; }
    if (actionName === 'prepare' && !selectedClient?.id) { setStatus('เลือก canonical Client ก่อน'); return; }
    if (actionName === 'verify_payment' && !window.confirm('ยืนยันสลิปนี้เป็นมัดจำของงานยกเลิกหรือไม่? ระบบจะส่งเข้า payment authority แต่ยังไม่ออกเครดิต')) return;
    if (actionName === 'issue_credit' && !window.confirm('ยืนยันออกเครดิตให้ลูกค้าจากยอดที่ payment authority ยืนยันแล้วหรือไม่? การทำซ้ำจะใช้ idempotency เดิม')) return;
    setBusy(true);
    setStatus(actionName === 'prepare' ? 'กำลังเตรียมบันทึกงานยกเลิก…' : actionName === 'verify_payment' ? 'กำลังยืนยันสลิปผ่าน payment authority…' : 'กำลังออกเครดิตจากยอดรับที่ยืนยันแล้ว…');
    try {
      const payload = actionName === 'prepare'
        ? preparePayload()
        : { action: actionName, ...selectedProof() };
      const result = await request(API, { method: 'POST', body: JSON.stringify(payload) });
      q('correction').hidden = true;
      renderSummary(result);
      if (actionName === 'prepare') setStatus(`${statusLine(result)} · ยังไม่ได้สร้าง Payment หรือเครดิต`);
      if (actionName === 'verify_payment') setStatus(`${statusLine(result)} · ยืนยันสลิปแล้ว แต่ยังไม่ได้ออกเครดิต`);
    } catch (error) {
      if (errorCode(error) === 'IDENTITY_CORRECTION_CONFIRMATION_REQUIRED') q('correction').hidden = false;
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function attach() {
    style();
    const form = root.querySelector('#mhb-review-form');
    if (!form || form.querySelector('[data-mcr-card]')) return;
    const recovery = card();
    form.insertBefore(recovery, form.firstChild);
    recovery.querySelector('[data-mcr-lookup]').addEventListener('click', lookupClient);
    recovery.querySelector('[data-mcr-client-query]').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); lookupClient(); }
    });
    recovery.querySelectorAll('[data-mcr-action]').forEach((button) => button.addEventListener('click', () => action(button.dataset.mcrAction)));
    const date = q('date');
    if (date && !date.value) date.value = new Date().toISOString().slice(0, 10);
    loadStatus();
  }

  attach();
  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => { attach(); loadStatus(); }, 100);
  }).observe(root, { childList: true, subtree: true });
  let observedProof = '';
  setInterval(() => {
    const proof = selectedProof();
    const next = `${proof.proof_id}:${proof.proof_record_id}`;
    if (next === observedProof) return;
    observedProof = next;
    latest = null;
    if (next !== ':') loadStatus();
  }, 700);
})();
