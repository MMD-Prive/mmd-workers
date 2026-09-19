(() => {
  'use strict';
  const root = document.getElementById('mmd-slip-inbox');
  if (!root || root.__psi5) return;
  root.__psi5 = true;

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

  const base = root.dataset.workerBase || '/v1/admin/payments';
  const stageLabels = {
    deposit: 'ค่าจอง / มัดจำ',
    final: 'ค่าจบงาน / ยอดคงเหลือ',
    full: 'จ่ายเต็ม',
    tips: 'Tip / ทิป',
    membership: 'ค่าสมาชิก / ต่ออายุสมาชิก',
    shop: 'MMD Shop / ค่าสินค้า',
  };
  let items = [];
  let filter = 'all';
  let query = '';
  let selected = null;

  const live = document.getElementById('psi-live');
  const list = document.getElementById('psi-list');
  const detail = document.getElementById('psi-detail');
  const search = document.getElementById('psi-search');

  function esc(value) {
    const node = document.createElement('div');
    node.textContent = value == null ? '—' : String(value);
    return node.innerHTML;
  }
  function id(item) { return item.proof_id || item.id || ''; }
  function text(value) { return String(value == null ? '' : value).trim(); }
  function money(value) { return value == null ? 'ยังอ่านยอดไม่ได้' : `${Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`; }
  function kind(item) { return item.can_approve ? 'review' : item.context_issues?.length ? 'risk' : 'review'; }
  function label(item) { return item.can_approve ? 'พร้อมยืนยัน' : item.context_issues?.length ? 'ต้องเติมข้อมูล' : 'รอตรวจ'; }
  function setLive(value, className) { live.textContent = value; live.className = `psi-live${className ? ` ${className}` : ''}`; }
  function purpose(item) { return stageLabels[text(item.payment_stage).toLowerCase()] || item.inferred_label || 'ยังจัดประเภทไม่ได้'; }
  function searchable(item) {
    return [item.customer_name, item.payer_name, item.evidence_amount_thb, item.payment_ref, item.channel, item.created_at, item.inferred_label, item.payment_stage]
      .join(' ').toLowerCase();
  }
  function autoReason(item) {
    const parts = ['ระบบตรวจหลักฐาน'];
    if (item.customer_name || item.payer_name) parts.push(`ลูกค้า ${item.customer_name || item.payer_name}`);
    parts.push(purpose(item));
    if (item.evidence_amount_thb != null) parts.push(`ยอด ${money(item.evidence_amount_thb)}`);
    if (item.payment_ref) parts.push(`Ref ${item.payment_ref}`);
    if (item.session_id) parts.push(`งาน ${item.session_id}`);
    return parts.join(' · ');
  }
  function matchText(item) {
    const flags = item.match_flags || {};
    const matches = [];
    if (flags.linked_payment_present) matches.push('Payment');
    if (flags.linked_session_present) matches.push('Session');
    if (flags.linked_renewal_present) matches.push('Renewal');
    if (flags.linked_member_present) matches.push('Member');
    return matches.length ? matches.join(' · ') : 'ยังไม่ผูก canonical context';
  }

  function installNav() {
    const host = root.querySelector('.psi-head-actions');
    if (host && !host.querySelector('[data-payment-surface]')) {
      [['Money Control', '/internal/admin/payments'], ['Historical Recovery', '/internal/admin/payments/historical-backfill']]
        .forEach(([labelText, href]) => {
          const anchor = document.createElement('a');
          anchor.href = href;
          anchor.textContent = `${labelText} ↗`;
          anchor.dataset.paymentSurface = 'v5';
          if (labelText === 'Historical Recovery') anchor.dataset.histLink = 'v5';
          host.appendChild(anchor);
        });
    }
    fetch('/v1/admin/payments/historical-backfill?limit=100', {
      credentials: 'include',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
      .then((response) => response.json())
      .then((payload) => {
        const anchor = root.querySelector('[data-hist-link]');
        const count = Array.isArray(payload.items)
          ? payload.items.filter((item) => item.review_state === 'pending').length
          : 0;
        if (anchor) anchor.textContent = `Historical Recovery · ${count} ↗`;
      })
      .catch(() => {});
  }

  function render() {
    const visible = items.filter((item) =>
      (filter === 'all' || kind(item) === filter) && (!query || searchable(item).includes(query)));
    document.getElementById('psi-all').textContent = items.length;
    document.getElementById('psi-review').textContent = items.filter((item) => item.can_approve).length;
    document.getElementById('psi-risk').textContent = items.filter((item) => !item.can_approve).length;
    list.innerHTML = visible.length
      ? visible.map((item) => {
          const key = id(item);
          const name = item.customer_name || item.payer_name || 'ยังไม่ทราบลูกค้า';
          return `<button type="button" class="psi-item ${String(selected) === String(key) ? 'is-selected' : ''}" data-id="${esc(key)}"><div class="psi-item-top"><strong>${esc(name)}</strong><span class="psi-chip is-${kind(item)}">${esc(label(item))}</span></div><span>${esc(money(item.evidence_amount_thb))} · ${esc(purpose(item))}</span><small>${esc(item.payment_ref || item.created_at || '—')}</small></button>`;
        }).join('')
      : '<p class="psi-empty">ไม่พบรายการที่ตรงกับคำค้นนี้</p>';
    list.querySelectorAll('.psi-item').forEach((button) => {
      button.onclick = () => {
        selected = button.dataset.id;
        render();
        renderDetail();
      };
    });
    if (selected) renderDetail();
  }

  function clientHref(item) {
    const clientId = item.client_id || item.canonical_client_id || '';
    return clientId
      ? `/internal/admin/member-intelligence?client_id=${encodeURIComponent(clientId)}`
      : '/internal/admin/member-intelligence';
  }

  function renderDetail() {
    const item = items.find((candidate) => String(id(candidate)) === String(selected));
    if (!item) return;
    const issues = item.context_issues || [];
    const reason = autoReason(item);
    const review = item.reviewable
      ? `<div class="psi-reviewbox"><label for="psi-reason">สรุปจากระบบ / หมายเหตุเพิ่มเติม</label><textarea id="psi-reason" placeholder="ระบบสรุปให้แล้ว — แก้หรือเพิ่มเฉพาะกรณีจำเป็น">${esc(reason)}</textarea><div class="psi-actions"><button type="button" data-action="approve" ${item.can_approve ? '' : 'disabled'}>ยืนยันรับเงิน · Official Verify</button><button type="button" data-action="issue">บันทึกว่าต้องตรวจต่อ</button><button type="button" data-action="reject">Reject หลักฐาน</button></div><div class="psi-save" id="psi-save">${item.can_approve ? 'ข้อมูล canonical ครบ · พร้อม Official Verify' : `ยังยืนยันไม่ได้ · ${esc(issues.join(' · ') || 'context ไม่ครบ')}`}</div></div>`
      : '';
    detail.innerHTML = `<p class="psi-kicker">CEO · PAYMENT DECISION</p><h2>${esc(item.customer_name || item.payer_name || 'ยังไม่ทราบลูกค้า')}</h2><div class="psi-info"><div><span>ประเภทเงิน</span><strong>${esc(purpose(item))}</strong></div><div><span>ยอดในหลักฐาน</span><strong>${esc(money(item.evidence_amount_thb))}</strong></div><div><span>Canonical match</span><strong>${esc(matchText(item))}</strong></div><div><span>Payment reference</span><strong>${esc(item.payment_ref || 'ยังไม่พบ')}</strong></div><div><span>Session / Job</span><strong>${esc(item.session_id || 'ยังไม่ผูก')}</strong></div><div><span>Image / extraction</span><strong>${esc((item.extraction_method || 'not_run') + (item.extraction_error ? ` · ${item.extraction_error}` : ''))}</strong></div></div><div class="psi-next"><strong>${item.can_approve ? 'สิ่งที่เปอร์ต้องทำ' : 'ระบบยังต้องเติมข้อมูล'}</strong><p>${item.can_approve ? 'ตรวจสรุปด้านบน แล้วกด “ยืนยันรับเงิน” ได้เลย ไม่ต้องพิมพ์เหตุผลใหม่' : esc(issues.join(' · ') || 'ระบบยังไม่มี canonical context ที่ครบพอ')}</p></div><a class="psi-client-link" href="${clientHref(item)}">เปิด Member Intelligence ↗</a> <a class="psi-client-link" href="/internal/admin/payments">เปิด Money Control ↗</a>${review}`;
    if (!item.reviewable) return;
    const textarea = document.getElementById('psi-reason');
    const save = document.getElementById('psi-save');
    const buttons = detail.querySelectorAll('[data-action]');
    buttons.forEach((button) => {
      button.onclick = () => {
        const why = textarea.value.trim() || reason;
        if (button.dataset.action === 'approve' && !item.can_approve) return;
        reviewDecision(item, button.dataset.action, why, buttons, save);
      };
    });
  }

  async function reviewDecision(item, decision, reason, buttons, save) {
    const key = `psi5_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    buttons.forEach((button) => { button.disabled = true; });
    save.className = 'psi-save';
    save.textContent = decision === 'approve' ? 'กำลังส่ง Official Verify…' : 'กำลังบันทึกคำตัดสิน…';
    try {
      const response = await fetch(`${base}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ decision, proof_id: id(item), admin_reason: reason, idempotency_key: key }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) throw new Error(payload.error || response.status);
      save.className = 'psi-save is-ok';
      if (decision === 'approve') {
        const write = payload.membership_write_through;
        save.textContent = write?.status === 'materialized'
          ? `ยืนยันเงินแล้ว · ${write.action === 'renewal' ? 'ต่ออายุ' : 'เปิดสมาชิก'} ${String(write.package_code || '').toUpperCase()}${write.expire_at ? ` · ถึง ${write.expire_at}` : ''}`
          : 'Official Verify สำเร็จ · Money Truth อัปเดตแล้ว';
      } else {
        save.textContent = decision === 'issue'
          ? 'บันทึกว่าต้องตรวจต่อแล้ว'
          : 'Reject แล้ว · Money Truth ไม่เปลี่ยน';
      }
      setLive('LIVE QUEUE', 'is-live');
      await load();
    } catch (error) {
      save.className = 'psi-save is-bad';
      save.textContent = `บันทึกไม่สำเร็จ · ${String(error.message || error)}`;
      setLive('SAVE ERROR', 'is-offline');
      buttons.forEach((button) => {
        if (button.dataset.action !== 'approve' || item.can_approve) button.disabled = false;
      });
    }
  }

  async function load() {
    setLive('CONNECTING', '');
    try {
      const response = await fetch(`${base}/review-queue?limit=50`, {
        credentials: 'include',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) {
        const error = new Error(payload.error || response.status);
        error.status = response.status;
        throw error;
      }
      items = Array.isArray(payload.items) ? payload.items : [];
      setLive('LIVE · UNIFIED PAYMENT QUEUE', 'is-live');
      if (!selected && items[0]) selected = id(items[0]);
      render();
    } catch (error) {
      items = [];
      selected = null;
      setLive(error.status === 401 || error.status === 403 ? 'SESSION REQUIRED' : 'WORKER WAITING', 'is-offline');
      list.innerHTML = `<p class="psi-empty">${error.status === 401 || error.status === 403 ? 'เข้าสู่ระบบ Internal Admin เพื่อดูคิวจริง' : 'ยังเชื่อมต่อ payment review backend ไม่ได้'}</p>`;
      detail.innerHTML = '<p class="psi-kicker">PAYMENT REVIEW</p><h2>ยังไม่มีข้อมูลที่ยืนยันได้</h2><p class="psi-sub">หน้านี้ไม่สร้าง payment หรือสถานะจำลองเมื่อ backend ยังไม่พร้อม</p>';
    }
  }

  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.onclick = () => {
      filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((node) => node.classList.toggle('is-active', node === button));
      render();
    };
  });
  search?.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    render();
  });
  document.getElementById('psi-refresh').onclick = load;
  installNav();
  load();
})();
