/* MMD Model Confirm Flow — website-only V3.
 * Replaces the existing Webflow MMDModelConfirmFlowV2 binding, never alongside it.
 * Keeps the V2 payout guard. Only navigation/re-entry and observer idempotence change.
 * A one-shot history marker preserves Back/retry without a redirect loop.
 * No API calls, tokens in storage, payment verification or session writes.
 */
(() => {
  'use strict';
  const PATH = '/sigil/confirm/job-model';
  if (location.pathname.replace(/\/+$/, '') !== PATH) return;
  const R = document.getElementById('mmd-model-confirm-v15');
  if (!R || window.__mmdModelConfirmFlowWebV3) return;
  window.__mmdModelConfirmFlowWebV3 = true;
  const MARK = '__mmdWebConfirmVisitedV3';
  let busy = false, attempted = false, ready = false, timer = null;

  function destination() {
    const u = new URL('/sigil/model/dashboard', location.origin);
    const p = new URLSearchParams(location.search);
    u.searchParams.set('handoff', 'job-confirmed');
    const lang = p.get('lang');
    const env = p.get('liff_env');
    if (['th', 'en', 'zh'].includes(lang)) u.searchParams.set('lang', lang);
    if (env && /^[A-Za-z0-9_-]{1,32}$/.test(env)) u.searchParams.set('liff_env', env);
    return u.pathname + u.search;
  }

  function jumpOnce() {
    const ok = R.querySelector('[data-m-success]');
    if (attempted || !ok || ok.hidden) return;
    attempted = true;
    try {
      const previous = history.state;
      if (previous && previous[MARK] === true) return;
      // Do not discard another application's non-object history state.
      if (previous != null && (typeof previous !== 'object' || Array.isArray(previous))) return;
      history.replaceState({ ...(previous || {}), [MARK]: true }, '');
      if (!history.state || history.state[MARK] !== true) return;
    } catch (_) {
      return; // History is unavailable: retain the manual website link.
    }
    timer = setTimeout(() => {
      timer = null;
      const current = R.querySelector('[data-m-success]');
      if (location.pathname.replace(/\/+$/, '') !== PATH || !current || current.hidden) return;
      try { location.assign(destination()); } catch (_) {
        // Keep the signed source entry and manual link usable; do not auto-retry.
      }
    }, 120);
  }

  function sync() {
    if (busy) return;
    busy = true;
    try {
      const lang = (document.documentElement.lang || 'th').toLowerCase();
      const card = R.querySelector('[data-m-payout-card]');
      const label = R.querySelector('.mm15__payout>span');
      const value = R.querySelector('[data-m-payout]');
      const check = R.querySelector('[data-m-check]');
      const confirm = R.querySelector('[data-m-confirm]');
      const title = lang.startsWith('zh') ? '到手报酬' : lang.startsWith('en') ? 'Rate to you' : 'เรทถึงตัว';
      if (label && label.textContent !== title) label.textContent = title;
      if (check && !check.disabled) ready = true;
      const amount = Number(String(value?.textContent || '').replace(/[^0-9.]/g, ''));
      if (card && card.hidden) card.hidden = false;
      if (value && !String(value.textContent || '').trim()) value.textContent = '—';
      let warning = R.querySelector('[data-m-payout-warning]');
      if (ready && !(amount > 0)) {
        if (check && !check.disabled) check.disabled = true;
        if (confirm && !confirm.disabled) confirm.disabled = true;
        if (!warning && card) {
          warning = document.createElement('p');
          warning.dataset.mPayoutWarning = '1';
          warning.setAttribute('data-m-payout-warning', '1');
          warning.style.cssText = 'margin:10px 0 0;color:#ffcf8a;font-size:12px;line-height:1.5';
          card.append(warning);
        }
        const message = lang.startsWith('zh')
          ? '尚未确认到手报酬，请向 MMD 索取更正后的链接。'
          : lang.startsWith('en')
            ? 'Your payout is missing. Please request a corrected link from MMD.'
            : 'ยังไม่มียอดเงินถึงตัว กรุณาขอลิงก์ที่แก้ไขแล้วจาก MMD';
        if (warning && warning.textContent !== message) warning.textContent = message;
      } else if (amount > 0 && warning) warning.remove();
    } finally { busy = false; }
    jumpOnce();
  }

  const observer = new MutationObserver(sync);
  const observe = () => observer.observe(R, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['hidden', 'disabled']
  });
  sync();
  observe();
  window.addEventListener('pagehide', () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    observer.disconnect();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { sync(); observe(); }
  });
})();
