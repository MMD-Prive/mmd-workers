(function () {
  'use strict';
  if (location.pathname.replace(/\/+$/, '') !== '/internal/admin/dashboard') return;
  function addReview() {
    var root = document.querySelector('.adm27-opgrid');
    if (!root || root.querySelector('[data-mmd-private-review]')) return;
    var link = document.createElement('a');
    link.href = '/internal/admin/mmd-review';
    link.dataset.mmdPrivateReview = 'v1';
    [['span', 'PRIVATE MEDIA'], ['h3', 'MMD Review'], ['p', 'ตรวจรูปและคลิปส่วนตัว อนุมัติ ปฏิเสธ หรือเพิกถอนสื่อ'], ['b', 'เปิดคิวตรวจสื่อ ↗']].forEach(function (row) {
      var el = document.createElement(row[0]); el.textContent = row[1]; link.append(el);
    });
    root.append(link);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addReview, { once: true });
  else addReview();
}());
