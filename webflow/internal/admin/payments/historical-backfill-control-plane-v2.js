(() => {
  'use strict';
  if (window.__mmdHistoricalPaymentV2) return;
  window.__mmdHistoricalPaymentV2 = true;

  const root = document.getElementById('mmd-history-backfill');
  if (!root) return;

  if (!document.getElementById('mmd-payment-headline-contrast-v1')) {
    const style = document.createElement('style');
    style.id = 'mmd-payment-headline-contrast-v1';
    style.textContent = `
      #money-control-v3 h1, #mmd-slip-inbox h1, #mmd-history-backfill h1 {
        background: none !important;
        color: #f4efe6 !important;
        -webkit-text-fill-color: #f4efe6 !important;
        opacity: 1 !important;
        filter: none !important;
        text-shadow: 0 1px 0 rgba(255,255,255,.05), 0 14px 38px rgba(0,0,0,.38) !important;
      }
      #money-control-v3 h2, #mmd-slip-inbox h2, #mmd-history-backfill h2 {
        background: none !important;
        color: #ece5da !important;
        -webkit-text-fill-color: #ece5da !important;
        opacity: 1 !important;
        filter: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  const API = '/v1/admin/payments/historical-backfill';
  const STAGE_LABELS = {
    deposit: 'ค่าจอง / มัดจำ',
    final: 'ค่าจบงาน / ยอดคงเหลือ',
    full: 'จ่ายเต็ม',
    tips: 'Tip / ทิป',
    membership: 'ค่าสมาชิก / ต่ออายุสมาชิก',
  };
  const $ = (selector) => root.querySelector(selector);
  const text = (value) => String(value == null ? '' : value).trim();
  const esc = (value) => {
    const node = document.createElement('div');
    node.textContent = value == null ? '—' : String(value);
    return node.innerHTML;
  };
  const money = (value) => value == null || value === ''
    ? 'ยังอ่านยอดไม่ได้'
    : `${Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`;

  let items = [];
  let selected = null;

  function errorMessage(error) {
    const code = text(error?.code || error?.message || error);
    const labels = {
      payment_ref_required: 'ยังไม่มีเลขอ้างอิงการโอน',
      amount_thb_required: 'ยังไม่มียอดเงิน',
      invalid_payment_stage: 'ยังระบุประเภทเงินไม่ได้',
      session_id_required_for_service_payment: 'รายการงานต้องมี Session / Job ก่อน',
      member_email_required_for_membership_payment: 'ค่าสมาชิกต้องจับคู่ Member ก่อน',
      override_reason_required_for_extraction_conflict: 'ข้อมูลที่แก้ต่างจากผลอ่านสลิป ต้องใส่เหตุผล override',
      historical_proof_not_pending_review: 'รายการนี้ไม่ได้อยู่ในคิว Review แล้ว',
      historical_proof_rejected: 'รายการนี้ถูก Reject แล้ว',
      payments_worker_handoff_failed: 'ส่งเข้า payments-worker ไม่สำเร็จ',
    };
    const message = labels[code] || code || 'ไม่สามารถดำเนินการได้';
    return error?.traceId ? `${message} · Trace ${error.traceId}` : message;
  }

  function responseError(payload, status) {
    const error = new Error(payload?.error || status);
    error.code = text(payload?.error || status);
    error.traceId = text(payload?.trace_id);
    error.status = status;
    return error;
  }

  function installLinks() {
    const nav = $('.mhb__nav');
    if (nav && !nav.querySelector('[data-pay-surface]')) {
      [['Money Control', '/internal/admin/payments'], ['CEO Inbox', '/internal/ceo/payment-slip-inbox']]
        .forEach(([label, href]) => {
          const anchor = document.createElement('a');
          anchor.href = href;
          anchor.textContent = label;
          anchor.dataset.paySurface = 'v2';
          nav.appendChild(anchor);
        });
    }
    const card = $('.mhb__route-card');
    if (card) {
      const code = card.querySelector('code');
      if (code) code.textContent = '/internal/admin/payments/historical-backfill';
      const small = card.querySelector('small');
      if (small) small.innerHTML = 'Recovery lane ของ Payment Control Plane<br>Official money truth ยังคงเป็น payments-worker';
    }
  }

  function autoReason(item) {
    const parts = ['ตรวจหลักฐานย้อนหลังจาก LINE'];
    if (item.amount_thb != null) parts.push(`ยอด ${money(item.amount_thb)}`);
    if (item.payment_ref_masked) parts.push(`Ref ${item.payment_ref_masked}`);
    const match = item.match || {};
    ['payment', 'session', 'member', 'client'].forEach((key) => {
      if (match[key]) parts.push(`${key.toUpperCase()} ${match[key]}`);
    });
    if (match.ambiguous) parts.push('MATCH AMBIGUOUS');
    return parts.join(' · ');
  }

  function state(item) {
    if (item.review_state === 'processed' || item.status === 'reviewed') return ['ดำเนินการแล้ว', 'is-safe'];
    if (item.review_state === 'rejected' || item.status === 'rejected') return ['Reject แล้ว', 'is-warn'];
    if (item.match?.ambiguous) return ['ต้องแก้ Match', 'is-warn'];
    return [item.review_required ? 'ต้องตรวจต่อ' : 'พร้อมตรวจ', 'is-review'];
  }

  function render() {
    const queue = $('#mhb-queue');
    if (!queue) return;
    const pending = items.filter((item) => item.review_state === 'pending').length;
    const count = $('#mhb-queue-count');
    if (count) count.textContent = `${pending} รอตรวจ · ${items.length} ทั้งหมด`;

    queue.innerHTML = items.length
      ? items.map((item) => {
          const [label, className] = state(item);
          const match = item.match || {};
          const chips = [
            match.payment && 'Payment',
            match.session && 'Session',
            match.member && 'Member',
            match.client && 'Client',
          ].filter(Boolean).join(' · ') || 'ยังไม่ Match';
          const action = item.review_state === 'pending'
            ? `<button type="button" class="mhb__button" data-review-id="${esc(item.proof_id)}" style="margin-top:10px">เปิด Review</button>`
            : '<a class="mhb__button" href="/internal/admin/payments" style="display:inline-flex;margin-top:10px">เปิด Money Control</a>';
          return `<article class="mhb__queue-item"><div class="mhb__queue-main"><span class="mhb__badge ${className}">${esc(label)}</span><strong>${esc(item.source_ref || item.proof_id)}</strong><small>${esc(money(item.amount_thb))} · Ref ${esc(item.payment_ref_masked || 'ยังอ่านไม่ได้')} · ${esc(chips)}</small></div><div class="mhb__queue-state"><strong>${esc(item.proof_id)}</strong><small>${esc(item.extraction_method || 'not_run')} · confidence ${Math.round(Number(item.extraction_confidence || 0) * 100)}%</small>${action}</div></article>`;
        }).join('')
      : '<div class="mhb__empty">ยังไม่มี Historical Payment Proof</div>';

    queue.querySelectorAll('[data-review-id]').forEach((button) => {
      button.onclick = () => select(button.dataset.reviewId);
    });
  }

  function field(name) {
    return $(`#mhb-review-form [name="${name}"]`);
  }

  function select(proofId) {
    const item = items.find((candidate) => String(candidate.proof_id) === String(proofId));
    if (!item) return;
    selected = item;
    const form = $('#mhb-review-form');
    const empty = $('#mhb-review-empty');
    if (empty) empty.hidden = true;
    if (form) form.hidden = false;

    field('proof_id').value = item.proof_id || '';
    field('proof_record_id').value = item.id || '';
    if (item.amount_thb != null) field('amount_thb').value = item.amount_thb;
    field('payment_ref').value = '';
    field('payment_ref').placeholder = item.payment_ref_masked
      ? `ระบบมี Ref ${item.payment_ref_masked} — เว้นว่างเพื่อใช้ค่าที่ระบบอ่าน`
      : 'กรอกเมื่อระบบอ่านไม่ได้';
    ['payment_stage', 'session_id', 'member_email', 'package_code', 'paid_at', 'override_reason']
      .forEach((name) => { if (field(name)) field(name).value = ''; });

    const reason = field('review_reason');
    if (reason) {
      reason.value = autoReason(item);
      reason.required = false;
      reason.placeholder = 'ระบบสรุปให้แล้ว — เพิ่มเฉพาะสิ่งที่ต้องการบันทึก';
    }
    if ($('#mhb-review-proof')) $('#mhb-review-proof').textContent = item.proof_id;
    if ($('#mhb-review-source')) {
      $('#mhb-review-source').textContent = `${item.source_ref || ''} · ${money(item.amount_thb)} · ${item.payment_ref_masked || 'Ref ยังไม่อ่านได้'}`;
    }
    const status = $('#mhb-review-status');
    if (status) {
      status.textContent = item.match?.ambiguous
        ? 'Match ยังคลุมเครือ · เติม Session / Member / Stage เฉพาะเมื่อจำเป็น'
        : 'ระบบจะใช้ข้อมูลที่สกัดและ Match ไว้ก่อน ไม่ต้องกรอกซ้ำ';
    }
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function load() {
    const badge = $('#mhb-api-badge');
    const footer = $('#mhb-footer-state');
    if (badge) badge.textContent = 'CONNECTING';
    try {
      const response = await fetch(`${API}?limit=100`, {
        credentials: 'include',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) {
        throw responseError(payload, response.status);
      }
      items = Array.isArray(payload.items) ? payload.items : [];
      if (badge) badge.textContent = 'LIVE · PAYMENT CONTROL PLANE';
      if (footer) footer.textContent = `Historical Recovery → payments-worker · ${items.filter((item) => item.review_state === 'pending').length} pending`;
      render();
    } catch (error) {
      items = [];
      render();
      if (badge) badge.textContent = error.status === 401 || error.status === 403 ? 'SESSION REQUIRED' : 'WORKER WAITING';
      if (footer) footer.textContent = errorMessage(error);
    }
  }

  async function upload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = $('#mhb-file');
    const status = $('#mhb-upload-status');
    const button = $('#mhb-upload');
    if (!file?.files?.[0]) {
      status.textContent = 'เลือกไฟล์ก่อน';
      return;
    }
    const data = new FormData(form);
    button.disabled = true;
    status.textContent = 'กำลังตรวจภาพ / dedupe / extract / match…';
    try {
      const response = await fetch(`${API}/intake`, { method: 'POST', credentials: 'include', body: data });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) throw responseError(payload, response.status);
      status.textContent = payload.duplicate
        ? 'พบหลักฐานเดิม · ไม่สร้างซ้ำ'
        : `รับหลักฐานแล้ว · ${payload.review_required ? 'ต้อง Review ต่อ' : 'พร้อม Review'}`;
      await load();
      const proofId = payload.proof_id || payload.proof?.proof_id;
      if (proofId) select(proofId);
    } catch (error) {
      status.textContent = `นำเข้าไม่สำเร็จ · ${errorMessage(error)}`;
    } finally {
      button.disabled = false;
    }
  }

  function reviewBody(decision) {
    const payload = {
      decision,
      proof_id: field('proof_id').value,
      proof_record_id: field('proof_record_id').value,
      review_reason: text(field('review_reason').value) || autoReason(selected || {}),
    };
    ['payment_ref', 'payment_stage', 'session_id', 'member_email', 'package_code', 'paid_at', 'override_reason']
      .forEach((name) => {
        const value = text(field(name)?.value);
        if (value) payload[name] = value;
      });
    const amount = text(field('amount_thb')?.value);
    if (amount) payload.amount_thb = Number(amount);
    return payload;
  }

  async function decide(decision) {
    if (!selected) return;
    const status = $('#mhb-review-status');
    const buttons = root.querySelectorAll('[data-decision]');
    buttons.forEach((button) => { button.disabled = true; });
    status.textContent = decision === 'approve'
      ? 'กำลังส่ง Official Verify ไป payments-worker…'
      : 'กำลังบันทึก Reject…';
    try {
      const response = await fetch(`${API}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(reviewBody(decision)),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) throw responseError(payload, response.status);
      status.textContent = decision === 'approve'
        ? `สำเร็จ · payments-worker ยืนยัน ${STAGE_LABELS[payload.payment_stage] || payload.payment_stage || 'รายการ'}${payload.payment_ref ? ` · Ref ${payload.payment_ref}` : ''}${payload.duplicate ? ' · ตรวจซ้ำแล้ว' : ''}`
        : 'บันทึก Reject แล้ว · Money Truth ไม่เปลี่ยน';
      await load();
      if (decision === 'approve') setTimeout(() => { location.href = '/internal/admin/payments'; }, 900);
    } catch (error) {
      status.textContent = `ยังยืนยันไม่ได้ · ${errorMessage(error)}`;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function init() {
    root.dataset.controlPlane = 'payment-v6';
    installLinks();
    const file = $('#mhb-file');
    const fileButton = $('#mhb-file-button');
    if (fileButton) {
      fileButton.style.cursor = 'pointer';
      fileButton.onclick = (event) => {
        event.preventDefault();
        file?.click();
      };
    }
    if (file) {
      file.onchange = () => {
        const selectedFile = file.files?.[0];
        if (!selectedFile) return;
        $('#mhb-file-title').textContent = selectedFile.name;
        $('#mhb-file-meta').textContent = `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB · ${selectedFile.type || 'image'}`;
        const sourceRef = $('#mhb-source-ref');
        if (sourceRef && !sourceRef.value) sourceRef.value = selectedFile.name;
      };
    }
    $('#mhb-intake-form')?.addEventListener('submit', upload);
    if ($('#mhb-refresh')) $('#mhb-refresh').onclick = load;
    if ($('#mhb-review-clear')) {
      $('#mhb-review-clear').onclick = () => {
        $('#mhb-review-form').hidden = true;
        $('#mhb-review-empty').hidden = false;
        selected = null;
      };
    }
    root.querySelectorAll('[data-decision]').forEach((button) => {
      button.onclick = () => decide(button.dataset.decision);
    });
    if ($('#mhb-upload')) $('#mhb-upload').textContent = 'นำเข้า Historical Recovery';
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
