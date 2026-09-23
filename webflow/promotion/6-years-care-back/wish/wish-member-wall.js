(function () {
  'use strict';
  function boot() {
    var root = document.getElementById('mmd-wish');
    if (!root || root.dataset.memberWallReady === '1') return;
    root.dataset.memberWallReady = '1';
    var flow = root.querySelector('#wish-flow');
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
    if (flow && flow.parentNode) flow.insertAdjacentElement('afterend', wall);
    else root.append(wall);
    var modelWall = document.createElement('section');
    modelWall.className = 'wish-member-wall wish-model-wall';
    modelWall.setAttribute('aria-labelledby', 'wish-model-wall-title');
    var modelHeading = document.createElement('h2');
    modelHeading.id = 'wish-model-wall-title';
    var modelNote = document.createElement('p');
    var modelList = document.createElement('div');
    modelList.className = 'wish-member-wall-list';
    modelWall.append(modelHeading, modelNote, modelList);
    wall.insertAdjacentElement('afterend', modelWall);
    var success = root.querySelector('[data-success]');
    var coupon = document.createElement('a');
    coupon.className = 'wish-coupon-link';
    coupon.href = '/my-mmd/coupons';
    // Reuse the existing success CTA; do not duplicate the destination.
    if (success && !root.querySelector('[data-dashboard]')) success.append(coupon);
    var copy = {
      th: { title: 'คำอวยพรจากสมาชิก MMD', note: 'รวมสมาชิกเก่า สมาชิกหมดอายุ และสมาชิกปัจจุบัน · แสดงแบบไม่ระบุชื่อหลังยืนยัน LINE', loading: 'กำลังอ่านคำอวยพร…', empty: 'คำอวยพรจากสมาชิกที่ยืนยัน LINE แล้วจะแสดงตรงนี้ครับ', error: 'ตอนนี้ยังโหลดคำอวยพรไม่ได้ครับ', retry: 'ลองอีกครั้ง', back: 'กลับไปที่ MY MMD', coupon: 'เปิดคูปองของฉัน' },
      en: { title: 'Wishes from MMD members', note: 'Past, expired and current members · shown anonymously after LINE verification.', loading: 'Loading wishes…', empty: 'Wishes from LINE-verified members will appear here.', error: 'Wishes could not be loaded right now.', retry: 'Try again', back: 'Back to MY MMD', coupon: 'Open my coupons' },
      zh: { title: '来自 MMD 会员的祝福', note: '包括旧会员、已到期会员和当前会员；验证 LINE 后匿名显示。', loading: '正在加载祝福…', empty: '完成 LINE 验证的会员祝福将显示在这里。', error: '暂时无法加载祝福。', retry: '重试', back: '返回 MY MMD', coupon: '打开我的优惠券' }
    };
    var state = 'loading', loading = false, refreshPending = false;
    function translate() {
      var lang = String(root.lang || 'th').toLowerCase();
      var c = copy[lang.indexOf('en') === 0 ? 'en' : lang.indexOf('zh') === 0 ? 'zh' : 'th'];
      var sendLabel = root.querySelector('[data-wish-copy="consent"]');
      if (sendLabel) sendLabel.textContent = lang.indexOf('en') === 0
        ? 'Send this message and display it anonymously if MMD verifies that I am or was a member.'
        : lang.indexOf('zh') === 0
          ? '发送此留言；若 MMD 核实我现在或过去是会员，可匿名公开显示。'
          : 'ยืนยันส่งข้อความนี้ และยินยอมให้แสดงแบบไม่ระบุชื่อ หากระบบยืนยันว่าเคยเป็นสมาชิก MMD';
      heading.textContent = c.title;
      note.textContent = c.note;
      modelHeading.textContent = lang.indexOf('en') === 0 ? 'Wishes from MMD Models' : lang.indexOf('zh') === 0 ? '来自 MMD 模特的祝福' : 'คำอวยพรจาก Model ของ MMD';
      modelNote.textContent = lang.indexOf('en') === 0 ? 'Post-job wishes approved by MMD.' : lang.indexOf('zh') === 0 ? '仅显示经 MMD 审核通过的工作后祝福。' : 'แสดงเฉพาะคำอวยพรหลังจบงานที่ MMD อนุมัติแล้ว';
      var step = root.querySelector('[data-v23="r3a"]');
      var stepTitle = root.querySelector('[data-v23="r3b"]');
      var stepCopy = root.querySelector('[data-v23="r3c"]');
      if (step && stepTitle && stepCopy) {
        step.textContent = lang.indexOf('en') === 0 ? '03 · CLAIM' : lang.indexOf('zh') === 0 ? '03 · 领取' : '03 · เคลม';
        stepTitle.textContent = lang.indexOf('en') === 0 ? 'One LINE check' : lang.indexOf('zh') === 0 ? '验证一次 LINE' : 'ยืนยัน LINE ครั้งเดียว';
        stepCopy.textContent = lang.indexOf('en') === 0 ? 'Past, expired and current members are published and receive the coupon immediately.' : lang.indexOf('zh') === 0 ? '旧会员、已到期会员和当前会员都会显示祝福，并立即获得优惠券。' : 'สมาชิกเก่า หมดอายุ และปัจจุบัน ข้อความขึ้นและรับคูปองทันทีครับ';
      }
      retry.textContent = c.retry;
      status.textContent = c[state] || '';
      status.hidden = state === 'ready';
      coupon.textContent = c.coupon;
      root.dataset.dashboardUrl = '/my-mmd/coupons';
      var dash = root.querySelector('[data-dashboard]');
      if (dash) { dash.href = root.dataset.wishSaved === 'true' ? '/my-mmd/coupons' : '#wish-flow'; dash.textContent = c.coupon; dash.setAttribute('aria-label', c.coupon); }
    }
    async function refresh() {
      if (loading) { refreshPending = true; return; }
      loading = true;
      state = 'loading'; retry.hidden = true; translate();
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 12000);
      try {
        var response = await fetch('https://www.mmdbkk.com/member/api/care-back/public-wish', { method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal });
        var payload = await response.json();
        if (!response.ok || !payload || payload.ok !== true || !Array.isArray(payload.wishes)) throw new Error('unavailable');
        list.replaceChildren();
        payload.wishes.slice(0, 24).forEach(function (wish) {
          if (!wish || typeof wish.text !== 'string' || !wish.text.trim()) return;
          var quote = document.createElement('blockquote');
          quote.textContent = wish.text.slice(0, 600);
          list.append(quote);
        });
        modelList.replaceChildren();
        (Array.isArray(payload.model_wishes) ? payload.model_wishes : []).slice(0, 24).forEach(function (wish) {
          if (!wish || typeof wish.text !== 'string' || !wish.text.trim()) return;
          var quote = document.createElement('blockquote');
          quote.textContent = wish.text.slice(0, 280);
          modelList.append(quote);
        });
        modelWall.hidden = !modelList.children.length;
        state = list.children.length ? 'ready' : 'empty';
      } catch (_) { list.replaceChildren(); modelList.replaceChildren(); modelWall.hidden = true; state = 'error'; retry.hidden = false; }
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
