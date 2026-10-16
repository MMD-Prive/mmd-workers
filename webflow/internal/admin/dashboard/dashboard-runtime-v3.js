(() => {
  'use strict';

  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/internal/admin/dashboard') return;

  const root = document.getElementById('adm27');
  if (!root || root.dataset.dashboardRuntimeV4 === '1') return;
  root.dataset.dashboardRuntimeV4 = '1';
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
    const partial = /บางส่วน|ยังไม่มี/.test(String(data.status?.data || ''));
    setApiState(partial ? 'ข้อมูลบางส่วน · ตรวจสถานะระบบ' : 'ข้อมูลล่าสุดจากระบบ', partial ? 'is-bad' : 'is-live');

    const counts = data.counts || {};
    ['jobs', 'members'].forEach((key) => setText(`[data-count="${key}"]`, counts[key]));
    setText('[data-count="payments"]', data.status?.payments === 'พร้อม' ? counts.payments_review_pending ?? counts.payment_review : null);
    const visibleActions = [...(data.todos || []), ...(data.boss || [])];
    setText('[data-count="urgent"]', new Set(visibleActions.map((item) => item.href + '|' + item.title)).size);
    setText('[data-updated-at]', data.generated_at ? 'อ่านล่าสุด ' + new Date(data.generated_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) + ' · ตัวเลขจากคิวที่อ่านได้' : 'ยังไม่มีเวลาของข้อมูล');

    const todos = Array.isArray(data.todos) ? data.todos : [];
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    const focus = data.focus || {};
    const next = $('[data-focus-next]');
    if (next) {
      next.href = href(focus.href || todos[0]?.href, '/internal/admin/jobs/all');
      next.textContent = todos.length ? 'เปิดเรื่องที่ต้องจัดการ →' : 'ดูงานทั้งหมด →';
    }
    setText('[data-focus-title]', todos.length
      ? (focus.title || 'ต้องให้เปอร์จัดการ ' + todos.length + ' รายการ')
      : jobs.length ? 'คิวเร่งด่วนเคลียร์แล้ว · ตามงานวันนี้' : 'วันนี้ยังไม่มีคิวเร่งด่วน');
    setText('[data-focus-copy]', todos.length
      ? (focus.text || 'เปิดรายการที่ต้องตัดสินใจด้านล่าง')
      : jobs.length ? 'เปิดงานที่ต้องติดตามด้านล่าง' : 'เริ่มสร้างงานหรือเปิดเครื่องมือที่ใช้บ่อยได้เลย');

    const workgrid = $('.adm27-main > .adm27-workgrid');
    const todoCard = $('[data-todo-list]')?.closest('.adm27-card');
    const jobCard = $('[data-job-list]')?.closest('.adm27-card');
    if (workgrid && todoCard && jobCard) {
      workgrid.insertBefore(todos.length || !jobs.length ? todoCard : jobCard,
        todos.length || !jobs.length ? jobCard : todoCard);
    }
    const focusState = $('[data-focus-state]');
    if (focusState) {
      focusState.textContent = 'พร้อม';
      focusState.className = 'adm27-chip is-live';
    }

    setText('[data-session-title]', 'Admin Session พร้อม');
    setText('[data-session-copy]', 'ยืนยันสิทธิ์แล้ว · ใช้ same-origin session');
    const login = $('[data-login-link]');
    if (login) login.hidden = true;

    renderList('[data-todo-list]', data.todos, 'คิวเร่งด่วนเคลียร์แล้ว', (item) => `
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
      todoState.className = partial ? 'adm27-chip is-wait' : 'adm27-chip is-live';
    }
  }

  function organizeDailyHome() {
    const main = $('.adm27-main');
    const brief = $('.adm27-brief');
    const summary = $('.adm27-summary');
    if (main && brief && summary) brief.after(summary);
    const destinations = { urgent: '#daily-queue', payments: '/internal/admin/payments', jobs: '/internal/admin/jobs/all', members: '/internal/admin/member-intelligence' };
    const labels = { urgent: 'เรื่องที่แสดงในคิว', payments: 'พร้อมตรวจเงิน', jobs: 'งานวันนี้', members: 'สมาชิกควรตรวจ' };
    const queue = $('[data-todo-list]')?.closest('.adm27-card');
    if (queue) queue.id = 'daily-queue';
    if (summary) summary.querySelectorAll('[data-count]').forEach((count) => {
      const key = count.dataset.count;
      const card = count.closest('article');
      if (!card || !destinations[key] || card.querySelector('a')) return;
      const link = document.createElement('a');
      link.href = destinations[key];
      link.style.cssText = 'display:flex;flex-direction:column;gap:4px;color:inherit;text-decoration:none';
      while (card.firstChild) link.appendChild(card.firstChild);
      card.appendChild(link);
      const label = link.querySelector('span');
      if (label) label.textContent = labels[key];
      const note = link.querySelector('small');
      if (note) note.textContent = 'เปิดรายละเอียด →';
    });
    const actions = $('.adm27-focusbody .adm27-actions');
    if (actions && !actions.querySelector('[data-focus-next]')) {
      const next = document.createElement('a');
      next.dataset.focusNext = '1';
      next.className = 'adm27-btn is-primary';
      next.href = '/internal/admin/jobs/all';
      next.textContent = 'ดูงานทั้งหมด →';
      actions.prepend(next);
    }
    if (brief && !$('[data-updated-at]')) {
      const updated = document.createElement('p');
      updated.dataset.updatedAt = '1';
      updated.className = 'adm27-footnote';
      updated.textContent = 'กำลังอ่านเวลาของข้อมูล';
      brief.appendChild(updated);
    }
    const business = $('.adm27-business');
    if (business && !business.closest('details')) {
      const details = document.createElement('details');
      details.className = 'adm27-disclosure';
      const label = document.createElement('summary');
      label.textContent = 'ภาพธุรกิจ · Audience · รายรับ';
      business.before(details);
      details.append(label, business);
    }
    for (const [id, label] of [['owner-all-work-20260925', 'เครื่องมือทั้งหมด'], ['owner-historical-finance-20260924', 'ยอดย้อนหลังที่มีหลักฐาน']]) {
      const section = document.getElementById(id);
      if (!section || section.closest('details')) continue;
      const drawer = document.createElement('details');
      drawer.className = 'adm27-disclosure';
      drawer.style.cssText = 'margin:16px auto;max-width:1200px;padding:16px;border:1px solid currentColor;border-radius:14px';
      const title = document.createElement('summary');
      title.textContent = label;
      title.style.cssText = 'cursor:pointer;font-weight:600';
      section.before(drawer);
      drawer.append(title, section);
    }
    if (main && !$('[data-daily-flow]')) {
      const flow = document.createElement('nav');
      flow.dataset.dailyFlow = '1';
      flow.className = 'adm27-daily';
      flow.setAttribute('aria-label', 'ขั้นตอนทำงาน');
      flow.innerHTML = '<a href="/internal/admin/customer-data">1 · หาลูกค้า / ตรวจตัวตน</a><a href="/internal/admin/jobs/create-job">2 · สร้างงาน / ยืนยัน</a><a href="/internal/admin/payments">3 · ตรวจเงิน</a><a href="/internal/admin/jobs/all">4 · ติดตาม / ปิดงาน</a>';
      const owner = $('.adm27-owner');
      if (owner) owner.before(flow); else main.appendChild(flow);
    }
    // An in-page link must open its disclosure, including clicks after page load.
    function revealHash() {
      const id = location.hash.slice(1);
      const target = id && document.getElementById(id);
      if (!target) return;
      if (target.tagName === 'DETAILS') target.open = true;
      let parent = target.parentElement;
      while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
      target.scrollIntoView({ block: 'start' });
    }
    window.addEventListener('hashchange', revealHash);
    root.addEventListener('click', (event) => {
      const a = event.target.closest('a[href^="#"]');
      if (a && a.getAttribute('href') === location.hash) revealHash();
    });
    revealHash();
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
      const link = document.createElement('a');
      link.href = '/internal/admin/calendar';
      link.style.cssText = 'color:inherit;text-decoration:none';
      while (card.firstChild) link.appendChild(card.firstChild);
      card.appendChild(link);
      card.style.cursor = 'pointer';
    } catch (_) {}
  }

  let loadSequence = 0;
  let currentRequest;
  async function load() {
    const sequence = ++loadSequence;
    currentRequest?.abort();
    const controller = new AbortController();
    currentRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setApiState('กำลังเชื่อมระบบ');
    try {
      const response = await fetch('/v1/admin/dashboard', { signal: controller.signal, credentials: 'include', cache: 'no-store', headers: { accept: 'application/json' } });
      const data = await response.json().catch(() => null);
      if (sequence !== loadSequence) return;
      if (response.status === 401 || response.status === 403) {
        location.replace('/internal/admin/login?next=' + encodeURIComponent(location.pathname + location.search));
        return;
      }
      if (!response.ok || data?.ok !== true) throw new Error(`dashboard_${response.status}`);
      hydrateDashboard(data);
      hydrateCalendar();
    } catch (error) {
      if (sequence !== loadSequence) return;
      setApiState('ระบบยังไม่พร้อม', 'is-bad');
      setText('[data-focus-title]', 'ยังโหลดคิวไม่ได้');
      setText('[data-focus-copy]', 'กดโหลดใหม่เพื่อตรวจรายการจากระบบอีกครั้ง');
      const todoState = $('[data-todo-state]');
      if (todoState) { todoState.textContent = 'ตรวจข้อมูล'; todoState.className = 'adm27-chip is-wait'; }
      console.warn('MMD dashboard runtime v3', error);
      ['urgent', 'payments', 'jobs', 'members'].forEach((key) => setText(`[data-count="${key}"]`, '—'));
      ['todo', 'job', 'money', 'member', 'boss'].forEach((key) => renderList(`[data-${key}-list]`, [], 'ยังอ่านคิวไม่ได้ · กดโหลดใหม่', () => ''));
    } finally {
      clearTimeout(timeout);
    }
  }

  canonicalizePrimaryActions();
  organizeDailyHome();
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
