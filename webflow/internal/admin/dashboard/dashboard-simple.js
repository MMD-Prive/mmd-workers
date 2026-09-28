// Presentation only: keep injected system notices inside the secondary drawer.
(() => {
  const root = document.querySelector('#adm27[data-dashboard-simple]');
  if (!root) return;
  const drawer = root.querySelector('.adm27-system-more');
  function organize() {
    const notice = document.getElementById('mmd-admin-latest');
    if (notice && drawer && notice.parentElement !== drawer) {
      notice.removeAttribute('open');
      drawer.appendChild(notice);
    }
  }
  organize();
  const observer = new MutationObserver(organize);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
})();
