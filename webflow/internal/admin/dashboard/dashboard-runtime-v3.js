(() => {
  'use strict';

  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/internal/admin/dashboard') return;

  const root = document.getElementById('adm27');
  if (!root || root.dataset.dashboardRuntimeV3 === '1') return;
  root.dataset.dashboardRuntimeV3 = '1';

  const $ = (selector) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

  function setApiState(label, kind = '') {
    const node = $('[data-api-state]');
    if (!node) return;
    node.className = `adm27-state${kind ? ` ${kind}` : ''}`;
    node.innerHTML = `<i></i>${esc(label)}`;
  }

  function setText(selector, value) {
    const node = $(selector);
    if (node) node.textContent = value == null || value === '' ? '—' : String(value);
  }

  function renderList(selector, items, emptyText, renderer) {
    const host = $(selector);
    if (!host) return;
    const list = Array.isArray(items) ? items : [];
    host.innerHTML = list.length ? list.map(renderer).join('') : `<div class="adm27-empty">${esc(emptyText)}</div>`;
  }

  function href(value, fallback) {
    const text = String(value || '');
    return text.startsWith('/internal/') ? text : fallback;
  }

  function hydrateDashboard(data) {
    setApiState('ระบบพร้อม', 'is-live');

    const counts = data.counts || {};
    ['urgent', 'payments', 'jobs', 'members'].forEach((key) => setText(`[data-count="${key}"]`, counts[key]));

    const focus = data.focus || {};
    setText('[data-focus-title]', focus.title || 'พร้อมทำงาน');
    setText('[data-focus-copy]', focus.text || 'เชื่อมข้อมูลจาก admin-worker แล้ว');
    const focusState = $('[data-focus-state]');
    if (focusState) {
      focusState.textContent = 'พร้อม';
      focusState.className = 'adm27-chip is-live';
    }

    setText('[data-session-title]', 'Admin Session พร้อม');
    setText('[data-session-copy]', 'ยืนยันสิทธิ์แล้ว · ใช้ same-origin session');
    const login = $('[data-login-link]');
    if (login) login.hidden = true;

    renderList('[data-todo-list]', data.todos, 'ตอนนี้ยังไม่มีรายการเร่งด่วน', (item) => `
      <a class="adm27-row" href="${esc(href(item.href, '/internal/admin/control-room'))}">
        <span><strong>${esc(item.title || 'รายการที่ต้องทำ')}</strong><p>${esc(item.text || '')}</p></span>
        <em>${esc(item.tag || 'เปิด')}</em>
      </a>`);

    renderList('[data-job-list]', data.jobs, 'วันนี้ยังไม่มีงานที่ต้องติดตาม', (item) => `
      <a class="adm27-row" href="${esc(href(item.href, '/internal/admin/jobs/all'))}">
        <span><strong>${esc(item.title || item.id || 'งาน')}</strong><p>${esc(item.text || item.status || '')}${item.when ? ` · ${esc(item.when)}` : ''}</p></span>
        <time>${esc(item.status || 'ดูงาน')}</time>
      </a>`);

    renderList('[data-money-list]', data.money, 'ไม่มีรายการเงินที่รอตรวจ', (item) => `
      <a class="adm27-row" href="${esc(href(item.href, '/internal/admin/payments'))}">
        <span><strong>${esc(item.title || 'Payment')}</strong><p>${esc(item.text || '')}</p></span>
        <em>${item.amount ? `${esc(item.amount)} บาท` : 'ตรวจรายการ'}</em>
      </a>`);

    renderList('[data-member-list]', data.members, 'ยังไม่มีสมาชิกที่ต้องตรวจวันนี้', (item) => `
      <a class="adm27-row" href="${esc(href(item.href, '/internal/admin/member-intelligence'))}">
        <span><strong>${esc(item.title || 'สมาชิก')}</strong><p>${esc(item.text || '')}</p></span>
        <em>${esc(item.tag || 'ตรวจ')}</em>
      </a>`);

    renderList('[data-boss-list]', data.boss, 'ยังไม่มีเคสที่ต้องส่งให้ Boss Per', (item) => `
      <a class="adm27-row" href="${esc(href(item.href, '/internal/ceo/dashboard'))}">
        <span><strong>${esc(item.title || 'Boss Per Review')}</strong><p>${esc(item.text || '')}</p></span>
        <em>เปิด</em>
      </a>`);

    Object.entries(data.status || {}).forEach(([key, value]) => {
      const node = $(`[data-status="${key}"]`);
      if (!node) return;
      node.textContent = value;
      node.className = /พร้อม|ข้อมูลจริง|ok|live/i.test(String(value)) ? 'is-live' : '';
    });
    const statusChip = $('[data-status-chip]');
    if (statusChip) {
      statusChip.textContent = 'ข้อมูลจริง';
      statusChip.className = 'adm27-chip is-live';
    }
    const todoState = $('[data-todo-state]');
    if (todoState) {
      todoState.textContent = Array.isArray(data.todos) && data.todos.length ? `${data.todos.length} รายการ` : 'เคลียร์';
      todoState.className = 'adm27-chip is-live';
    }
  }

  function canonicalizePrimaryActions() {
    const focusActions = root.querySelector('.adm27-focusbody .adm27-actions');
    if (focusActions) {
      const create = focusActions.querySelector('a[href="/internal/admin/jobs/create-session"]');
      if (create) {
        create.href = '/internal/admin/jobs/create-job';
        create.textContent = 'สร้างงาน ↗';
      }
    }

    const sideLinks = [...root.querySelectorAll('.adm27-sidefoot a')];
    const legacy = sideLinks.find((a) => a.getAttribute('href') === '/internal/admin/jobs/create-session');
    if (legacy) {
      legacy.href = '/internal/admin/calendar';
      legacy.textContent = 'Calendar';
    }

    const legacyCard = root.querySelector('.adm27-opgrid a[href="/internal/admin/jobs/create-session"]');
    if (legacyCard) legacyCard.remove();
  }

  function decorateLatestUpdate() {
    const block = document.getElementById('mmd-admin-latest');
    if (!block || block.dataset.dashboardV3 === '1') return;
    block.dataset.dashboardV3 = '1';
    const small = block.querySelector('summary small');
    const badge = block.querySelector('summary em');
    const body = block.querySelector('.mau-b');
    if (small) small.textContent = '14 ก.ย. 2026 · CALENDAR + ADMIN OS';
    if (badge) badge.textContent = 'LIVE READ · SHADOW WRITE';
    if (body) body.innerHTML = '<strong>Calendar เชื่อม MMD OS แล้ว</strong><p>หน้า Calendar แบบ protected อ่าน Session / Job / Model / Deposit / Cal mapping จาก backend จริง และมี live Cal diagnostics แล้ว</p><p>Model Confirm → Internal Hold → รอมัดจำ → Verified Deposit → Confirmed Session ยังยึด MMD เป็น source of truth; Cal ใช้ scheduling/availability และ mapping เท่านั้น</p><p>การเขียน Cal ยังอยู่ภายใต้ Shadow / fail-closed gate จน production E2E live-write ผ่านครบ</p>';
  }

  function decorateOwnerActions() {
    const box = document.querySelector('[data-mmd-owner-actions-summary]');
    if (!box || box.dataset.dashboardV3 === '1') return;
    box.dataset.dashboardV3 = '1';
    const label = box.querySelector('div');
    const title = box.querySelector('h2');
    if (label) label.textContent = 'งานที่ต้องตัดสินใจ';
    if (title) title.textContent = 'วันนี้ควรเคลียร์อะไร';
    box.querySelectorAll('a').forEach((a) => {
      const b = a.querySelector('b');
      const count = b ? b.textContent : '0';
      if (a.href.includes('completion-review')) a.innerHTML = `ตรวจงานจบ<br><b style="font-size:26px">${esc(count)}</b>`;
      if (a.href.includes('ops=payout')) a.innerHTML = `พร้อมจ่ายโมเดล<br><b style="font-size:26px">${esc(count)}</b>`;
      if (a.href.includes('ops=confirm')) a.innerHTML = `รอการยืนยัน<br><b style="font-size:26px">${esc(count)}</b>`;
    });
    const note = box.querySelector('p');
    if (note) note.textContent = note.textContent.replace('Telegram alerts:', 'Telegram:').replace('configured', 'พร้อม').replace('degraded', 'ต้องตรวจ');
  }

  async function hydrateCalendar() {
    try {
      const response = await fetch('/v1/admin/calendar', { credentials: 'include', cache: 'no-store', headers: { accept: 'application/json' } });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) return;
      const summary = $('.adm27-summary');
      if (!summary) return;
      summary.classList.add('adm27-summary-v3');
      let card = summary.querySelector('[data-calendar-summary]');
      if (!card) {
        card = document.createElement('article');
        card.dataset.calendarSummary = 'v3';
        summary.appendChild(card);
      }
      const metrics = data.metrics || {};
      card.innerHTML = `<span>ปฏิทินวันนี้</span><strong>${esc(metrics.sessions ?? 0)}</strong><small>Hold ${esc(metrics.holds ?? 0)} · Conflict ${esc(metrics.conflicts ?? 0)} · Cal ${esc(metrics.cal_linked ?? 0)}</small>`;
      card.onclick = () => { location.href = '/internal/admin/calendar'; };
      card.style.cursor = 'pointer';
    } catch (_) {}
  }

  async function load() {
    setApiState('กำลังเชื่อมระบบ');
    try {
      const response = await fetch('/v1/admin/dashboard', { credentials: 'include', cache: 'no-store', headers: { accept: 'application/json' } });
      const data = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        location.replace('/internal/admin/login?next=' + encodeURIComponent(location.pathname + location.search));
        return;
      }
      if (!response.ok || data?.ok !== true) throw new Error(`dashboard_${response.status}`);
      hydrateDashboard(data);
      hydrateCalendar();
    } catch (error) {
      setApiState('ระบบยังไม่พร้อม', 'is-bad');
      console.warn('MMD dashboard runtime v3', error);
    }
  }

  canonicalizePrimaryActions();
  decorateLatestUpdate();
  const observer = new MutationObserver(() => {
    decorateLatestUpdate();
    decorateOwnerActions();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 12000);

  const refresh = $('[data-refresh]');
  if (refresh) refresh.onclick = load;
  load();
})();
