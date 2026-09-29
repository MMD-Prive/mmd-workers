/* MMD Historical Recovery — Owner Context v1
 * Makes owner-facing recovery cards human-readable and deep-links a specific proof.
 * Canonical money truth remains payments-worker; this layer is display/navigation only.
 */
(() => {
  'use strict';
  if (window.__mmdHistoricalOwnerContextV1) return;
  window.__mmdHistoricalOwnerContextV1 = true;
  if ((location.pathname.replace(/\/+$/, '') || '/') !== '/internal/admin/payments/historical-backfill') return;

  const root = document.getElementById('mmd-history-backfill');
  if (!root) return;
  const API = '/v1/admin/payments/historical-backfill';
  const targetProof = new URL(location.href).searchParams.get('proof_id') || '';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const clean = (value) => String(value ?? '').trim();

  let itemsByProof = new Map();
  let selectedProof = '';
  let autoOpened = false;

  function ownerTitle(item = {}) {
    const source = clean(item.source_ref);
    if (!source) return 'สลิปย้อนหลัง';
    return source
      .replace(/^LINE\s+(?:OFC|OA)\s*·\s*/i, '')
      .replace(/\s*·\s*งาน\s+/i, ' · ')
      .trim() || 'สลิปย้อนหลัง';
  }

  function contextText(item = {}) {
    return clean(item.context_text) || clean(item.source_ref) || 'ยังไม่มีบริบทของงานในหลักฐานนี้';
  }

  function money(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n.toLocaleString('th-TH') + ' บาท' : '';
  }

  function decorateQueue() {
    root.querySelectorAll('[data-review-id]').forEach((button) => {
      const proofId = clean(button.dataset.reviewId);
      const item = itemsByProof.get(proofId);
      if (!item) return;
      const card = button.closest('.mhb__queue-item');
      if (!card) return;
      const main = card.querySelector('.mhb__queue-main');
      const title = main?.querySelector('strong');
      const meta = main?.querySelector('small');
      const state = card.querySelector('.mhb__queue-state');
      if (title) title.textContent = ownerTitle(item);
      if (meta) {
        const parts = [
          contextText(item),
          money(item.amount_thb),
          item.payment_ref_masked ? 'Ref ' + item.payment_ref_masked : '',
        ].filter(Boolean);
        meta.textContent = parts.join(' · ');
      }
      button.textContent = 'เปิดเคสนี้';
      if (state && !state.querySelector('[data-owner-proof-id]')) {
        const proof = document.createElement('small');
        proof.dataset.ownerProofId = 'v1';
        proof.textContent = 'Evidence · ' + proofId;
        proof.style.opacity = '.55';
        proof.style.display = 'block';
        proof.style.marginTop = '6px';
        state.appendChild(proof);
      }
    });

    if (targetProof && !autoOpened) {
      const button = root.querySelector('[data-review-id="' + CSS.escape(targetProof) + '"]');
      if (button) {
        autoOpened = true;
        button.click();
        setTimeout(() => {
          root.querySelector('#mhb-review-form')?.scrollIntoView({
            behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth',
            block: 'start',
          });
        }, 120);
      }
    }
  }

  function decorateSelected() {
    const proofInput = root.querySelector('#mhb-review-form [name="proof_id"]');
    const proofId = clean(proofInput?.value);
    if (!proofId || proofId === selectedProof) return;
    const item = itemsByProof.get(proofId);
    if (!item) return;
    selectedProof = proofId;

    const form = root.querySelector('#mhb-review-form');
    if (!form) return;
    let box = form.querySelector('[data-owner-context-v1]');
    if (!box) {
      box = document.createElement('section');
      box.dataset.ownerContextV1 = '1';
      box.style.cssText = 'margin:0 0 14px;padding:16px;border:1px solid rgba(240,215,121,.30);border-radius:16px;background:rgba(212,175,55,.07)';
      form.insertBefore(box, form.firstChild);
    }
    box.innerHTML =
      '<div style="font:800 10px/1.2 system-ui;letter-spacing:.12em;color:#d7b77c">เคสที่กำลังดู</div>' +
      '<strong style="display:block;margin-top:6px;color:#f4efe6;font-size:18px">' + escapeHtml(ownerTitle(item)) + '</strong>' +
      '<p style="margin:7px 0 0;color:#c9c1b5;font-size:13px;line-height:1.65">' + escapeHtml(contextText(item)) + '</p>' +
      '<small style="display:block;margin-top:8px;color:#817a70">Evidence: ' + escapeHtml(proofId) +
      (item.payment_ref_masked ? ' · Ref ' + escapeHtml(item.payment_ref_masked) : '') + '</small>';

    const proofLabel = root.querySelector('#mhb-review-proof');
    if (proofLabel) proofLabel.textContent = ownerTitle(item);
    const source = root.querySelector('#mhb-review-source');
    if (source) source.textContent = contextText(item);
  }

  async function loadContext() {
    try {
      const response = await fetch(API + '?limit=100', {
        credentials: 'include',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) return;
      itemsByProof = new Map(payload.items.map((item) => [clean(item.proof_id), item]).filter(([id]) => id));
      decorateQueue();
      decorateSelected();
    } catch (_) {}
  }

  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      decorateQueue();
      decorateSelected();
    }, 60);
  }).observe(root, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-review-id]');
    if (!button || !root.contains(button)) return;
    setTimeout(decorateSelected, 60);
  }, true);

  loadContext();
  setTimeout(loadContext, 700);
})();