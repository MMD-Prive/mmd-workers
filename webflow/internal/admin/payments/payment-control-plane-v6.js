(() => {
  'use strict';
  if (window.__mmdPaymentControlPlaneV6) return;
  window.__mmdPaymentControlPlaneV6 = true;

  function init() {
    const root = document.getElementById('money-control-v3');
    if (!root) return;
    root.dataset.build = 'money-control-v6-unified-20260913';

    const host = root.firstElementChild || root;
    if (!root.querySelector('[data-payment-surfaces]')) {
      const bar = document.createElement('div');
      bar.dataset.paymentSurfaces = 'v6';
      bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0;padding:10px 12px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.025);font:700 12px/1.3 system-ui;color:#cfc6b4';
      bar.innerHTML = '<span style="opacity:.65;margin-right:4px">PAYMENT CONTROL PLANE</span><a href="/internal/ceo/payment-slip-inbox" style="color:#f0d38a;text-decoration:none">CEO Inbox</a><span style="opacity:.35">·</span><a href="/internal/admin/payments/historical-backfill" data-hist-link style="color:#f0d38a;text-decoration:none">Historical Recovery · …</a>';
      host.prepend(bar);
    }

    fetch('/v1/admin/payments/historical-backfill?limit=100', {
      credentials: 'include',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
      .then((response) => response.json())
      .then((payload) => {
        const link = root.querySelector('[data-hist-link]');
        if (!link) return;
        const pending = Array.isArray(payload.items)
          ? payload.items.filter((item) => item.review_state === 'pending').length
          : 0;
        link.textContent = `Historical Recovery · ${pending} pending`;
      })
      .catch(() => {
        const link = root.querySelector('[data-hist-link]');
        if (link) link.textContent = 'Historical Recovery · ตรวจสถานะ';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
