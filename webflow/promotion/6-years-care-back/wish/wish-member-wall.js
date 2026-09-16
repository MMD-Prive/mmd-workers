(function () {
  'use strict';
  function boot() {
    var root = document.getElementById('mmd-wish');
    if (!root || root.dataset.memberWallReady === '1') return;
    root.dataset.memberWallReady = '1';
    var form = root.querySelector('[data-wish-form]');
    var submit = root.querySelector('[data-submit]');
    var consent = document.createElement('label');
    consent.className = 'wish-public-consent';
    var check = document.createElement('input');
    check.type = 'checkbox';
    check.setAttribute('data-public-consent', '');
    var label = document.createElement('span');
    consent.append(check, label);
    if (form && submit) submit.before(consent);
    var wall = document.createElement('section');
    wall.className = 'wish-member-wall';
    wall.setAttribute('aria-labelledby', 'wish-member-wall-title');
    var heading = document.createElement('h2');
    heading.id = 'wish-member-wall-title';
    var note = document.createElement('p');
    var status = document.createElement('p');
    status.setAttribute('role', 'status');
    var list = document.createElement('div');
    list.className = 'wish-member-wall-list';
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.hidden = true;
    wall.append(heading, note, status, list, retry);
    root.append(wall);
    var success = root.querySelector('[data-success]');
    var coupon = document.createElement('a');
    coupon.className = 'wish-coupon-link';
    coupon.href = '/my-mmd/coupons';
    if (success) success.append(coupon);
    var copy = {
      th: { consent: 'อนุญาตให้เผยแพร่คำอวยพรนี้ด้านล่างแบบไม่แสดงชื่อ หลัง MMD ยืนยันว่าเป็นสมาชิกแล้ว (เลือกได้)', title: 'คำอวยพรจากสมาชิก', note: 'ขอบคุณทุกข้อความจากสมาชิกที่อนุญาตให้แบ่งปันไว้ตรงนี้ครับ', loading: 'กำลังอ่านคำอวยพร…', empty: 'คำอวยพรที่สมาชิกอนุญาตให้เผยแพร่จะแสดงตรงนี้ครับ', error: 'ตอนนี้ยังโหลดคำอวยพรไม่ได้ครับ', retry: 'ลองอีกครั้ง', back: 'กลับไปที่ MY MMD', coupon: 'ดูคูปองของฉัน' },
      en: { consent: 'Allow this wish to appear below anonymously after MMD verifies my membership (optional)', title: 'Wishes from our members', note: 'Thank you to the members who chose to share their words here.', loading: 'Loading wishes…', empty: 'Wishes shared with permission by verified members will appear here.', error: 'Wishes could not be loaded right now.', retry: 'Try again', back: 'Back to MY MMD', coupon: 'View my coupons' },
      zh: { consent: 'MMD 核实会员身份后，允许在下方匿名公开这条祝福（可选）', title: '来自会员的祝福', note: '感谢每位愿意在这里分享祝福的会员。', loading: '正在加载祝福…', empty: '经会员授权公开的祝福将显示在这里。', error: '暂时无法加载祝福。', retry: '重试', back: '返回 MY MMD', coupon: '查看我的优惠券' }
    };
    var state = 'loading', loading = false, refreshPending = false;
    function translate() {
      var lang = String(root.lang || 'th').toLowerCase();
      var c = copy[lang.indexOf('en') === 0 ? 'en' : lang.indexOf('zh') === 0 ? 'zh' : 'th'];
      label.textContent = c.consent;
      var sendLabel = root.querySelector('[data-wish-copy="consent"]');
      if (sendLabel) sendLabel.textContent = lang.indexOf('en') === 0 ? 'I confirm that I want to send this message to MMD' : lang.indexOf('zh') === 0 ? '我确认要把这段留言发送给 MMD' : 'ยืนยันส่งข้อความนี้ให้ MMD';
      heading.textContent = c.title;
      note.textContent = c.note;
      retry.textContent = c.retry;
      status.textContent = c[state] || '';
      status.hidden = state === 'ready';
      coupon.textContent = c.coupon;
      root.dataset.dashboardUrl = '/my-mmd/';
      var dash = root.querySelector('[data-dashboard]');
      if (dash) { dash.href = '/my-mmd/'; dash.textContent = c.back; dash.setAttribute('aria-label', c.back); }
    }
    async function refresh() {
      if (loading) { refreshPending = true; return; }
      loading = true;
      state = 'loading'; retry.hidden = true; translate();
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 12000);
      try {
        var response = await fetch('/member/api/care-back/public-wish', { method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal });
        var payload = await response.json();
        if (!response.ok || !payload || payload.ok !== true || !Array.isArray(payload.wishes)) throw new Error('unavailable');
        list.replaceChildren();
        payload.wishes.slice(0, 24).forEach(function (wish) {
          if (!wish || typeof wish.text !== 'string' || !wish.text.trim()) return;
          var quote = document.createElement('blockquote');
          quote.textContent = wish.text.slice(0, 600);
          list.append(quote);
        });
        state = list.children.length ? 'ready' : 'empty';
      } catch (_) { list.replaceChildren(); state = 'error'; retry.hidden = false; }
      finally { clearTimeout(timer); loading = false; translate(); if (refreshPending) { refreshPending = false; void refresh(); } }
    }
    retry.addEventListener('click', refresh);
    document.addEventListener('mmd:care-back:wish-linked', refresh);
    // Read the approved server projection; never add the textarea or local draft.
    document.addEventListener('mmd:care-back:wish-completed', refresh);
    new MutationObserver(function () { setTimeout(translate, 30); }).observe(root, { attributes: true, attributeFilter: ['lang'] });
    translate();
    setTimeout(translate, 50);
    void refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
