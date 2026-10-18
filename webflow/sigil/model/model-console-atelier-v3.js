/* Presentation only. Bundled in the same lexical scope as the existing runtime. */
function consoleAtelierLane(session) {
  if (!session?.session_id) return 'neutral';
  const work = String(session.model_work_lane || '').trim().toLowerCase();
  const money = String(session.payout_terms?.money_lane || '').trim().toLowerCase();
  if (money && money !== work) return 'neutral';
  return work === 'public_model' ? 'public' : work === 'private_model' ? 'private' : 'neutral';
}
function renderConsoleAtelier(root, session) {
  if (!root || typeof consoleAtelierAssets === 'undefined') return;
  const icon = (name) => '<svg class="ca-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + consoleAtelierAssets.icons[name] + '</svg>';
  const accent = (host, name, show) => {
    if (!host) return;
    let node = host.querySelector('[data-ca-accent="' + name + '"]');
    if (!node && show) {
      node = document.createElement('span');
      node.className = 'ca-accent';
      node.dataset.caAccent = name;
      node.setAttribute('aria-hidden', 'true');
      node.innerHTML = consoleAtelierAssets[name];
      host.prepend(node);
    }
    if (node) node.hidden = !show;
  };
  const state = String(session?.normalized_state || session?.state || '').toLowerCase();
  const lane = consoleAtelierLane(session);
  root.dataset.consoleAtelier = 'v3';
  root.dataset.consoleLane = lane;
  const head = root.querySelector('.smcv3-head');
  if (head && !head.querySelector('[data-ca-back]')) {
    const back = document.createElement('a');
    back.dataset.caBack = '';
    back.className = 'ca-back';
    back.href = '/sigil/model/dashboard';
    back.innerHTML = icon('back') + '<span>MY MODEL</span>';
    head.prepend(back);
  }
  const brand = root.querySelector('.smcv3-brand-title');
  if (brand) brand.textContent = lane === 'private' ? 'SĪGIL · CONSOLE' : 'MODEL CONSOLE';
  const logo = root.querySelector('.smcv3-brand img');
  if (logo) logo.hidden = lane !== 'private';
  const loading = root.querySelector('[data-view="loading"]');
  if (loading && !loading.querySelector('.ca-loading')) {
    const bar = document.createElement('div');
    bar.className = 'ca-loading';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'กำลังโหลด / Loading');
    loading.append(bar);
  }
  accent(root.querySelector('.smcv3-summary'), 'session', Boolean(session?.session_id));
  // Null is emitted only for an explicit successful session:null response.
  accent(root.querySelector('[data-view="empty"]'), 'empty', session === null);
  accent(root.querySelector('[data-view="work"] > .smcv3-state'), 'travel', Boolean(session?.session_id) && ['en_route', 'nearby', 'arrived'].includes(state));
  const after = Boolean(session?.session_id) && ['separated', 'under_review', 'payout_pending', 'closed'].includes(state);
  accent(root.querySelector('[data-view="work"] > .smcv3-state'), 'after', after);
  function organize() {
    const work = root.querySelector('[data-view="work"]');
    const details = work?.querySelector('[data-session-id]')?.closest('details.smcv3-card');
    // Move existing financial nodes, never recreate them or remove their listeners.
    const content = details?.querySelector('.smcv3-detail');
    if (content) {
      root.querySelectorAll('.smcv3-payout-only,[data-model-payout-row]').forEach(node => {
        if (!content.contains(node)) content.append(node);
      });
      // Existing extension code inserts after payout. Keep decisions/warnings
      // visible even after that payout node has moved into the disclosure.
      root.querySelectorAll('[data-model-extension-request],[data-model-payment-alert]').forEach(node => {
        if (details.contains(node)) work.querySelector('.smcv3-summary')?.insertAdjacentElement('afterend', node);
      });
    }
    const types = { start_travel: 'travel', mark_arrived: 'arrived', mark_met_customer: 'job', start_work: 'start', mark_work_finished: 'finish', confirm_separated: 'finish' };
    root.querySelectorAll('[data-action],[data-support],summary').forEach(node => {
      if (node.querySelector('.ca-icon')) return;
      const name = node.hasAttribute('data-support') ? 'support' : node.tagName === 'SUMMARY' ? 'details' : types[node.dataset.action];
      if (name) node.insertAdjacentHTML('afterbegin', icon(name));
    });
  }
  organize();
  if (!root._consoleAtelierObserver) {
    // Handles the existing payout module's asynchronous DOM insertion only.
    root._consoleAtelierObserver = new MutationObserver(organize);
    root._consoleAtelierObserver.observe(root, { childList: true, subtree: true });
  }
}
