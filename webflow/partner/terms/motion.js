/* V7 progressive visual enhancement. Does not read or submit Partner credentials. */
(function () {
  'use strict';
  const root = document.getElementById('sigil-partner-terms-v6');
  if (!root || root.dataset.visualInit === '7') return;
  root.dataset.visualInit = '7';
  const q = selector => root.querySelector(selector);
  const qa = selector => Array.from(root.querySelectorAll(selector));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const chapterMap = [
    { id: 'top', label: 'เริ่มต้น' },
    { id: 'partner-types', label: '3 รูปแบบพาร์ทเนอร์', children: [
      { id: 'bridge', label: 'Bridge · แนะนำ Model' },
      { id: 'co-partner', label: 'Co-Partner · ดูแล Model' },
      { id: 'profit-share', label: 'Profit Share · ร่วมโปรเจกต์' }
    ] },
    { id: 'bridge', label: 'Bridge' },
    { id: 'co-partner', label: 'Co-Partner' },
    { id: 'profit-share', label: 'Profit Share' },
    { id: 'partner-privacy', label: 'สิทธิ์ข้อมูลส่วนตัว' },
    { id: 'dashboard', label: 'Partner Dashboard' },
    { id: 'agreement', label: 'ข้อตกลงและการยืนยัน', children: [
      { id: 'terms-completion', label: 'งานเสร็จและชำระครบ' },
      { id: 'terms-referral', label: 'ใครแนะนำใคร' },
      { id: 'terms-project', label: 'ข้อตกลงเฉพาะงาน' },
      { id: 'terms-privacy', label: 'ข้อมูลส่วนตัวเป็นสิทธิ์ของ Partner' },
      { id: 'terms-earnings', label: 'สรุปรายได้' },
      { id: 'partner-acceptance', label: 'ยืนยันข้อตกลง Partner' }
    ] }
  ];
  const chapters = chapterMap.map(item => ({ ...item, node: q('#' + item.id) })).filter(item => item.node);
  const sheet = q('[data-chapter-sheet]');
  const menu = q('[data-chapter-menu]');
  const dock = q('[data-chapter-dock]');
  const list = q('[data-chapter-list]');
  const title = q('[data-chapter-title]');
  const back = q('[data-chapter-back]');
  const previous = q('[data-chapter-prev]');
  const next = q('[data-chapter-next]');
  let current = 0;
  let frame = 0;
  let closeTimer = 0;
  let parentScroll = 0;
  let activeBranch = null;
  let lastFocus = null;
  let previousOverflow = '';
  let scrollContainer = null;

  function gotoChapter(id) {
    const target = q('#' + id);
    if (!target) return;
    const url = new URL(window.location.href);
    url.hash = id;
    if (window.location.hash !== url.hash) window.history.pushState(null, '', url);
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: motion.matches ? 'auto' : 'smooth', block: 'start' });
  }

  function updateReading() {
    frame = 0;
    const offset = (q('.pt6-nav')?.getBoundingClientRect().height || 72) + (q('.pt6-branch')?.getBoundingClientRect().height || 62) + 40;
    let index = 0;
    chapters.forEach((item, i) => { if (item.node.getBoundingClientRect().top <= offset) index = i; });
    current = index;
    const label = q('[data-chapter-current]');
    const count = q('[data-chapter-count]');
    if (label) label.textContent = chapters[index].label;
    if (count) count.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(chapters.length).padStart(2, '0');
    if (previous) previous.disabled = index === 0;
    if (next) next.disabled = index === chapters.length - 1;
    qa('[data-branch-link]').forEach(link => {
      const active = link.getAttribute('href') === '#' + chapters[index].id;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    const bounds = root.getBoundingClientRect();
    const distance = Math.max(1, bounds.height - window.innerHeight);
    const progress = Math.min(1, Math.max(0, -bounds.top / distance));
    root.style.setProperty('--read-progress', String(progress));
  }
  function requestReading() { if (!frame) frame = window.requestAnimationFrame(updateReading); }

  function renderList(items, returning) {
    list.replaceChildren();
    const layer = document.createElement('div');
    layer.className = 'pt6-sheet-layer' + (returning ? ' is-returning' : '');
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'pt6-sheet-row';
      const link = document.createElement('a');
      link.href = '#' + item.id;
      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      number.setAttribute('aria-hidden', 'true');
      link.append(number, document.createTextNode(item.label));
      if (item.id === chapters[current].id) link.setAttribute('aria-current', 'location');
      row.append(link);
      if (item.children) {
        const branch = document.createElement('button');
        branch.type = 'button';
        branch.textContent = '›';
        branch.setAttribute('aria-label', 'หัวข้อย่อย: ' + item.label);
        branch.addEventListener('click', function () {
          parentScroll = list.scrollTop;
          activeBranch = item;
          title.textContent = item.label;
          back.hidden = false;
          renderList(item.children, false);
          list.scrollTop = 0;
          back.focus();
        });
        row.append(branch);
      }
      layer.append(row);
    });
    list.append(layer);
  }

  function finishClose(returnFocus) {
    window.clearTimeout(closeTimer);
    sheet.classList.remove('is-closing');
    if (sheet.open) sheet.close();
    if (scrollContainer) scrollContainer.style.overflow = previousOverflow;
    scrollContainer = null;
    menu.setAttribute('aria-expanded', 'false');
    if (returnFocus && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  }
  function closeSheet(returnFocus = true, immediate = false) {
    if (!sheet.open) return;
    if (motion.matches || immediate) { finishClose(returnFocus); return; }
    sheet.classList.add('is-closing');
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => finishClose(returnFocus), 280);
  }

  if (sheet && menu && list && typeof sheet.showModal === 'function') {
    dock.hidden = false;
    menu.addEventListener('click', function () {
      if (sheet.open) return;
      activeBranch = null;
      title.textContent = 'เลือกหัวข้อที่อยากอ่าน';
      back.hidden = true;
      lastFocus = menu;
      renderList(chapterMap, false);
      sheet.showModal();
      // Lock only while the native modal is open; restore the prior value on close.
      scrollContainer = document.scrollingElement;
      if (scrollContainer) { previousOverflow = scrollContainer.style.overflow; scrollContainer.style.overflow = 'hidden'; }
      menu.setAttribute('aria-expanded', 'true');
      q('[data-chapter-close]').focus();
    });
    q('[data-chapter-close]').addEventListener('click', () => closeSheet());
    sheet.addEventListener('cancel', event => { event.preventDefault(); closeSheet(); });
    sheet.addEventListener('close', function () {
      if (scrollContainer) { scrollContainer.style.overflow = previousOverflow; scrollContainer = null; }
      menu.setAttribute('aria-expanded', 'false');
    });
    sheet.addEventListener('click', event => {
      if (event.target !== sheet) return;
      const b = sheet.getBoundingClientRect();
      if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) closeSheet();
    });
    back.addEventListener('click', function () {
      const label = activeBranch?.label;
      activeBranch = null;
      title.textContent = 'เลือกหัวข้อที่อยากอ่าน';
      back.hidden = true;
      renderList(chapterMap, true);
      list.scrollTop = parentScroll;
      const trigger = Array.from(list.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'หัวข้อย่อย: ' + label);
      (trigger || q('[data-chapter-close]')).focus();
    });
    let startY = null;
    const handle = q('[data-sheet-swipe]');
    handle.addEventListener('touchstart', e => { startY = e.touches[0]?.clientY ?? null; }, { passive: true });
    handle.addEventListener('touchend', e => {
      if (startY !== null && (e.changedTouches[0]?.clientY || 0) - startY > 65) closeSheet();
      startY = null;
    }, { passive: true });
    previous.addEventListener('click', () => gotoChapter(chapters[Math.max(0, current - 1)].id));
    next.addEventListener('click', () => gotoChapter(chapters[Math.min(chapters.length - 1, current + 1)].id));
  }

  root.addEventListener('click', function (event) {
    const link = event.target.closest('a[href^="#"]');
    if (!link || !root.contains(link) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const id = link.getAttribute('href').slice(1);
    if (!id || !q('#' + id)) return;
    event.preventDefault();
    // Keep Webflow's document-level smooth-scroll handler from overriding the sticky-header offset.
    event.stopPropagation();
    if (sheet?.open) closeSheet(false, true);
    gotoChapter(id);
  });
  window.addEventListener('popstate', () => { if (sheet?.open) closeSheet(false, true); requestReading(); });
  window.addEventListener('scroll', requestReading, { passive: true });
  window.addEventListener('resize', requestReading, { passive: true });
  updateReading();

  // Text is visible by default. Hide it for reveals only after observer setup succeeds.
  const reveals = qa('.pt6-reveal');
  if (!motion.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.04, rootMargin: '0px 0px 30px 0px' });
    reveals.forEach(node => {
      if (node.getBoundingClientRect().top < window.innerHeight) node.classList.add('is-visible');
      else observer.observe(node);
    });
    root.classList.add('is-reveal-ready');
    motion.addEventListener('change', event => {
      if (event.matches) { observer.disconnect(); root.classList.remove('is-reveal-ready'); }
    });
  }
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    qa('[data-spotlight]').forEach(card => {
      let pointerFrame = 0;
      let x = 0;
      let y = 0;
      card.addEventListener('pointermove', event => {
        if (motion.matches) return;
        const box = card.getBoundingClientRect();
        x = event.clientX - box.left; y = event.clientY - box.top;
        if (!pointerFrame) pointerFrame = window.requestAnimationFrame(() => {
          card.style.setProperty('--light-x', x + 'px'); card.style.setProperty('--light-y', y + 'px'); pointerFrame = 0;
        });
      }, { passive: true });
    });
  }
})();
