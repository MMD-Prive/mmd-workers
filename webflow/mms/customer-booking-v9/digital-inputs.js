/* Progressive presentation only: preserve original selects, IDs and runtime events. */
(function () {
  'use strict';
  var root = document.getElementById('mmb2');
  if (!root || root.dataset.digitalInputs) return;
  root.dataset.digitalInputs = '1';
  ['mmb2-province', 'mmb2-zone', 'mmb2-duration'].forEach(function (id) {
    var source = document.getElementById(id);
    if (!source) return;
    var label = source.closest('label'), title = label.querySelector('span').textContent;
    var isDuration = id === 'mmb2-duration';
    var shell = document.createElement(isDuration ? 'div' : 'details');
    shell.className = 'mms-booking-digital'; shell.dataset.digitalFor = id;
    var summary;
    if (!isDuration) { summary = document.createElement('summary'); shell.append(summary); }
    var fieldset = document.createElement('fieldset'), legend = document.createElement('legend');
    legend.textContent = title; fieldset.append(legend); shell.append(fieldset);
    var search;
    if (id === 'mmb2-zone') { search = document.createElement('input'); search.type = 'search'; search.setAttribute('aria-label', 'ค้นหาเขต / โซน'); search.placeholder = 'พิมพ์ชื่อเขตหรือโซน'; search.autocomplete = 'off'; search.dataset.digitalControl = 'search'; fieldset.append(search); }
    var list = document.createElement('div'); list.className = 'mms-booking-options'; fieldset.append(list);
    var status = document.createElement('p'); status.className = 'mms-booking-selection'; status.setAttribute('role', 'status'); fieldset.append(status);
    var close;
    if (!isDuration) { close = document.createElement('button'); close.type = 'button'; close.textContent = 'เสร็จแล้ว'; close.className = 'mb-button mb-button-quiet'; close.onclick = function () { shell.open = false; summary.focus(); }; fieldset.append(close); }
    var fingerprint = '';
    function render() {
      var options = Array.from(source.options).filter(function (o) { return o.value && !o.hidden && !o.disabled; });
      var current = source.options[source.selectedIndex], query = search ? search.value.trim().toLocaleLowerCase() : '';
      var next = JSON.stringify([source.disabled, source.value, query, options.map(function (o) { return [o.value, o.textContent]; })]);
      if (next === fingerprint) return; fingerprint = next;
      fieldset.disabled = source.disabled;
      if (summary) summary.textContent = title + ' · ' + (source.disabled ? 'กำลังตรวจตัวเลือก' : current && current.value ? current.textContent : 'แตะเพื่อเลือก') + ' ＋';
      var active = document.activeElement, restoreFocus = active && active.dataset.digitalControl === 'option' && active.name === id + '-presentation' ? active.value : null;
      list.replaceChildren();
      var shown = 0;
      options.forEach(function (option) {
        if (query && !option.textContent.toLocaleLowerCase().includes(query)) return;
        shown++;
        var item = document.createElement('label'), radio = document.createElement('input'), text = document.createElement('span');
        item.className = 'mms-booking-option'; radio.type = 'radio'; radio.name = id + '-presentation'; radio.value = option.value; radio.checked = source.value === option.value; radio.dataset.digitalControl = 'option';
        text.textContent = option.textContent;
        radio.addEventListener('change', function () { if (source.disabled) return; source.value = option.value; source.dispatchEvent(new Event('change', { bubbles: true })); });
        item.append(radio, text); list.append(item);
      });
      if (restoreFocus !== null) { var replacement = Array.from(list.querySelectorAll('input')).find(function (input) { return input.value === restoreFocus; }); if (replacement) replacement.focus(); }
      status.textContent = source.disabled ? 'รอตรวจตัวเลือกจากระบบ' : !shown && query ? 'ไม่พบตัวเลือกที่ตรงกับคำค้น ลองค้นหาใหม่' : current && current.value ? 'เลือกแล้ว · ' + current.textContent : 'เลือกจากรายการที่ระบบแสดง';
    }
    label.insertAdjacentElement('afterend', shell);
    label.classList.add('mms-digital-source'); label.setAttribute('aria-hidden', 'true'); source.tabIndex = -1;
    source.addEventListener('focus', function () { if (!isDuration) shell.open = true; var target = search || list.querySelector('input:checked') || list.querySelector('input'); if (target) target.focus(); });
    source.addEventListener('change', render);
    root.addEventListener('change', function (event) { if (event.target !== source && !event.target.dataset.digitalControl) render(); });
    if (search) search.addEventListener('input', render);
    new MutationObserver(render).observe(source, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'selected'] });
    render();
  });
  var date = document.getElementById('mmb2-date'), time = document.getElementById('mmb2-time');
  if (date && time) {
    var dateLabel = date.closest('label'), timeLabel = time.closest('label'), pair = document.createElement('div');
    pair.className = 'mms-booking-datetime'; dateLabel.before(pair); pair.append(dateLabel, timeLabel);
    var hint = document.createElement('p'); hint.className = 'mb-help'; hint.textContent = 'เลือกวันเวลาที่ต้องการ · MMS จะตรวจยืนยันนัดอีกครั้ง'; pair.append(hint);
  }
})();
