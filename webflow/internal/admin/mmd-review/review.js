(function () {
  'use strict';
  var root = document.getElementById('mmd-review');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = 'true';
  var q = function (id) { return root.querySelector('#mr-' + id); };
  var dialog = q('dialog'), selected = null, objectUrl = '', sha = '', busy = false, loading = false, cursor = null, generation = 0, queueRequest = 0;
  var controllers = new Set();
  var entries = new Map(), groups = new Map(), queue = [], activePreviews = 0, gridEpoch = 0, selectionEpoch = 0, groupJobs = 0;
  var observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (records) {
    records.forEach(function (record) { if (record.isIntersecting) { observer.unobserve(record.target); schedulePreview(record.target._entry); } });
  }, { rootMargin: '200px' }) : null;
  function batchControls(reset) {
    if (reset) q('batch-confirm').checked = false;
    var chosen = Array.from(entries.values()).filter(function (e) { return e.check.checked; });
    var publicCount = chosen.filter(function (e) { return e.item.audience === 'public'; }).length;
    q('batch').hidden = !chosen.length;
    message('selection', 'เลือก ' + chosen.length + ' รูป · Public ' + publicCount + ' / Private ' + (chosen.length - publicCount));
    q('batch-approve').disabled = busy || groupJobs > 0 || !chosen.length || !q('batch-confirm').checked || chosen.some(function (e) { return !e.sha; });
    q('clear').disabled = busy; q('batch-confirm').disabled = busy;
    entries.forEach(function (e) { e.check.disabled = busy || groupJobs > 0 || !e.sha || e.item.status !== 'pending_review'; e.open.disabled = busy || groupJobs > 0; });
    groups.forEach(function (g) { g.select.disabled = busy || groupJobs > 0; });
    q('refresh').disabled = busy || loading; q('filter').disabled = busy || loading; q('more').disabled = busy || loading;
  }
  function clearGrid() {
    gridEpoch++; selectionEpoch++; queue.forEach(function (e) { if (e.resolvePreview) e.resolvePreview(); }); queue = []; if (observer) observer.disconnect();
    entries.forEach(function (e) { if (e.cancelDecode) e.cancelDecode(); if (e.url) URL.revokeObjectURL(e.url); });
    entries.clear(); groups.clear(); q('list').replaceChildren(); batchControls(true);
  }
  function schedulePreview(e) {
    if (e.previewPromise) return e.previewPromise;
    if (observer) observer.unobserve(e.preview);
    e.previewPromise = new Promise(function (resolve) { e.resolvePreview = resolve; });
    queue.push(e); pump(); return e.previewPromise;
  }
  async function selectGroup(groupKey) {
    if (busy || groupJobs) return;
    var group = groups.get(groupKey), epoch = gridEpoch, pickEpoch = ++selectionEpoch;
    var targets = Array.from(entries.values()).filter(function (e) { return e.groupKey === groupKey && e.item.reviewable && e.item.status === 'pending_review' && /_pic$/.test(e.item.kind); });
    groupJobs++; batchControls(true); var completed = 0;
    group.status.textContent = 'กำลังโหลด 0 / ' + targets.length + ' รูป…';
    try {
      await Promise.all(targets.map(function (e) { return schedulePreview(e).then(function () {
        completed++; if (epoch === gridEpoch && pickEpoch === selectionEpoch) group.status.textContent = 'กำลังโหลด ' + completed + ' / ' + targets.length + ' รูป…';
      }); }));
      if (epoch !== gridEpoch || pickEpoch !== selectionEpoch || document.hidden) return;
      var loaded = targets.filter(function (e) { return !!e.sha; });
      loaded.forEach(function (e) { e.check.checked = true; });
      group.status.textContent = 'เลือก ' + loaded.length + ' / ' + targets.length + ' รูป' + (loaded.length < targets.length ? ' · เปิดไม่ได้ ' + (targets.length - loaded.length) + ' รูป กรุณาโหลดคิวใหม่เพื่อตรวจ' : ' · ดูรูปให้ครบก่อนยืนยัน');
    } finally { groupJobs--; batchControls(true); }
  }
  function pump() {
    while (activePreviews < 3 && queue.length) {
      var e = queue.shift(); activePreviews++;
      (function (entry) { preview(entry).finally(function () { entry.resolvePreview(); activePreviews--; pump(); }); }(e));
    }
  }
  async function preview(e) {
    var epoch = gridEpoch;
    try {
      var result = await api('/file', { model_id: e.item.model_id, media_asset_id: e.item.id });
      if (epoch !== gridEpoch || document.hidden) return;
      if (!result.blob.type.startsWith('image/')) throw new Error('not_image');
      var img = element('img'); img.alt = e.item.name + ' · ' + e.item.audience.toUpperCase();
      await new Promise(function (resolve) {
        var settled = false;
        function finish(ok) {
          if (settled) return; settled = true; clearTimeout(timer); e.cancelDecode = null;
          if (epoch === gridEpoch) { e.sha = ok ? result.sha : ''; if (!ok) e.preview.textContent = 'โหลดรูปไม่สำเร็จ · ลองโหลดคิวใหม่'; e.hint.textContent = ok ? 'เลือกรูปนี้เมื่อดูครบแล้ว' : 'เปิดรูปไม่ได้ · ลองโหลดคิวใหม่'; batchControls(false); }
          resolve();
        }
        var timer = setTimeout(function () { finish(false); }, 30000);
        e.cancelDecode = function () { finish(false); };
        img.addEventListener('load', function () { finish(true); }, { once: true });
        img.addEventListener('error', function () { finish(false); }, { once: true });
        e.url = URL.createObjectURL(result.blob); img.src = e.url; e.preview.replaceChildren(img);
      });
    } catch (error) { if (epoch === gridEpoch) { e.sha = ''; e.preview.textContent = 'โหลดรูปไม่สำเร็จ · ลองโหลดคิวใหม่'; e.hint.textContent = errorText(error); batchControls(true); } }
  }
  async function approveBatch() {
    if (busy || groupJobs || !q('batch-confirm').checked) return;
    var chosen = Array.from(entries.values()).filter(function (e) { return e.check.checked; });
    if (!chosen.length || chosen.some(function (e) { return !e.sha || e.item.status !== 'pending_review'; })) return;
    busy = true; batchControls(false); var done = 0, failed = 0, epoch = gridEpoch;
    for (var e of chosen) {
      if (epoch !== gridEpoch || document.hidden) break;
      message('batch-status', 'กำลังบันทึก ' + (done + failed + 1) + ' / ' + chosen.length);
      try {
        await api('/decision', { model_id: e.item.model_id, media_asset_id: e.item.id, expected_status: 'pending_review', media_sha256: e.sha, decision: 'approve', teaser_safe: e.item.audience === 'private' && e.item.teaser_safe === true, note: '' });
        e.item.status = 'approved'; e.check.checked = false; e.sha = ''; e.hint.textContent = 'อนุมัติแล้ว · คงสิทธิ์ ' + e.item.audience.toUpperCase(); done++;
      } catch (error) {
        e.sha = ''; e.hint.textContent = errorText(error); failed++;
        if (error.status === 401 || error.status === 403 || error.name === 'AbortError') break;
      }
    }
    busy = false; batchControls(true);
    message('batch-status', 'สำเร็จ ' + done + ' รูป · ไม่สำเร็จ ' + failed + ' รูป · ยังไม่ส่ง ' + (chosen.length - done - failed) + ' รูป');
    message('status', 'อนุมัติแล้ว ' + done + ' รูป' + (failed ? ' · รายการที่ยังยืนยันไม่ได้ยังเลือกไว้ กรุณาโหลดคิวใหม่ก่อนลองอีกครั้ง' : ' · คงสิทธิ์ Public / Private เดิม'));
  }
  var labels = { pending_review: 'รอตรวจ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ / เพิกถอนแล้ว' };
  function element(tag, cls, text) { var el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; }
  function message(id, text) { q(id).textContent = text; }
  function errorText(error) {
    if (error.status === 401) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบแอดมินอีกครั้ง';
    if (error.status === 403) return 'บัญชีนี้ไม่มีสิทธิ์ดำเนินการ';
    if (error.status === 409) return 'รายการเปลี่ยนแปลงแล้ว กรุณาโหลดคิวและตรวจใหม่';
    return 'ยังยืนยันผลไม่ได้ กรุณาโหลดใหม่เพื่อตรวจสถานะล่าสุด';
  }
  async function api(path, body) {
    var controller = new AbortController(); controllers.add(controller);
    var timer = setTimeout(function () { controller.abort(); }, 30000);
    try {
      var response = await fetch('/v1/admin/private-media' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : { Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      if (!response.ok) { var err = new Error('request_failed'); err.status = response.status; throw err; }
      if (path === '/file') {
        var digest = response.headers.get('x-mmd-media-sha256') || '';
        if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('unverified_media');
        var blob = await response.blob();
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm'].includes(blob.type) || !blob.size || blob.size > 25 * 1024 * 1024) throw new Error('invalid_media');
        return { blob: blob, sha: digest };
      }
      var data = await response.json();
      if (data.ok !== true) throw new Error('invalid_response');
      return data;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  function controls() {
    var allowed = !!selected && !!sha && !busy && q('confirm').checked;
    q('approve').disabled = !allowed;
    q('reject').disabled = !allowed || !q('note').value.trim();
    q('revoke').disabled = !allowed || !q('note').value.trim();
    q('close').disabled = busy; q('note').disabled = busy; q('confirm').disabled = busy; q('teaser').disabled = busy || !selected || selected.status !== 'pending_review';
  }
  function clearMedia() {
    generation++; sha = ''; selected = null;
    var video = q('media').querySelector('video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    q('media').replaceChildren();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = ''; q('note').value = ''; q('confirm').checked = false; q('teaser').checked = false; controls();
  }
  function closeReview() { if (busy) return; clearMedia(); if (dialog.open) dialog.close(); }
  async function openReview(item) {
    clearMedia(); selected = item; var version = generation;
    message('title', item.name); message('detail', (item.model_name || item.model_id) + ' · ' + labels[item.status]);
    message('review-status', 'กำลังตรวจไฟล์และโหลดสื่อ…');
    q('approve').hidden = item.status !== 'pending_review'; q('reject').hidden = item.status !== 'pending_review'; q('revoke').hidden = item.status !== 'approved';
    q('teaser-row').hidden = item.status !== 'pending_review' || item.audience !== 'private'; q('teaser-help').hidden = item.status !== 'pending_review' || item.audience !== 'private'; q('teaser').checked = item.status === 'pending_review' && item.audience === 'private' && item.teaser_safe === true;
    dialog.showModal(); controls();
    try {
      var result = await api('/file', { model_id: item.model_id, media_asset_id: item.id });
      if (version !== generation || !dialog.open) return;
      var media = element(result.blob.type.startsWith('video/') ? 'video' : 'img');
      if (media.tagName === 'VIDEO') { media.controls = true; media.playsInline = true; media.disablePictureInPicture = true; media.setAttribute('controlsList', 'nodownload noremoteplayback'); }
      else media.alt = item.audience === 'public' ? 'สื่อ Public สำหรับตรวจโดยแอดมิน' : 'สื่อ Private สำหรับตรวจโดยแอดมิน';
      media.addEventListener(media.tagName === 'VIDEO' ? 'loadeddata' : 'load', function () { if (version !== generation) return; sha = result.sha; message('review-status', 'ตรวจสื่อให้ครบก่อนเลือกผลการตรวจ'); controls(); }, { once: true });
      media.addEventListener('error', function () { sha = ''; message('review-status', 'เปิดสื่อไม่ได้ กรุณาปิดแล้วลองตรวจใหม่'); controls(); });
      objectUrl = URL.createObjectURL(result.blob); media.src = objectUrl; q('media').replaceChildren(media);
    } catch (error) { if (version === generation) { message('review-status', errorText(error)); controls(); } }
  }
  function card(item) {
    var key = item.model_id + ':' + item.id;
    if (entries.has(key)) return;
    var groupKey = item.model_id + ':' + item.audience, group = groups.get(groupKey);
    if (!group) {
      var section = element('section', 'mr-group'), heading = element('div', 'mr-group-heading');
      heading.append(element('h2', '', (item.model_name || item.model_id) + ' · ' + (item.audience === 'public' ? 'PUBLIC · สาธารณะ' : 'PRIVATE · จำกัดสิทธิ์')));
      var select = element('button', '', 'โหลดและเลือกทั้งกลุ่ม'); select.type = 'button'; select.hidden = item.status !== 'pending_review';
      select.addEventListener('click', function () { selectGroup(groupKey); });
      var groupStatus = element('p', 'mr-muted'); groupStatus.setAttribute('role', 'status');
      heading.append(select); section.append(groupStatus); var grid = element('div', 'mr-grid'); section.prepend(heading); section.append(grid); q('list').append(section);
      group = { grid: grid, select: select, status: groupStatus }; groups.set(groupKey, group);
    }
    var article = element('article', 'mr-card'), info = element('div', 'mr-card-info');
    var previewBox = element('div', 'mr-thumbnail', 'กำลังโหลดรูป…');
    var isImage = /_pic$/.test(item.kind), check = element('input'); check.type = 'checkbox'; check.disabled = true;
    var pick = element('label', 'mr-pick'); pick.append(check, document.createTextNode('เลือก')); pick.hidden = item.status !== 'pending_review' || !isImage || !item.reviewable;
    check.setAttribute('aria-label', 'เลือก ' + item.name); check.addEventListener('change', function () { batchControls(true); });
    info.append(element('p', 'mr-kind', item.audience === 'public' ? 'PUBLIC' : 'PRIVATE'), element('h3', '', item.name));
    var hint = element('p', 'mr-muted', labels[item.status]); info.append(hint);
    var button = element('button', '', item.status === 'approved' ? 'ตรวจ / เพิกถอน' : 'ดูเต็ม / ตรวจ'); button.type = 'button';
    button.hidden = !item.reviewable || item.status === 'rejected'; button.addEventListener('click', function () { if (!busy) openReview(item); });
    article.append(previewBox, pick, info, button); group.grid.append(article);
    var entry = { item: item, groupKey: groupKey, check: check, open: button, preview: previewBox, hint: hint, sha: '', url: '' }; entries.set(key, entry);
    if (!item.reviewable || item.status === 'rejected') previewBox.textContent = 'ไม่เปิดสื่อ · สิทธิ์หรือสถานะไม่พร้อม';
    else if (!isImage) previewBox.textContent = 'วิดีโอ · เปิดตรวจเต็มก่อนอนุมัติ';
    else if (observer) { previewBox._entry = entry; observer.observe(previewBox); }
    else { schedulePreview(entry); }
  }
  async function load(more) {
    if (loading || busy) return;
    var request = ++queueRequest;
    loading = true; q('refresh').disabled = true; q('filter').disabled = true; q('more').disabled = true;
    if (!more) { cursor = null; clearGrid(); }
    message('status', 'กำลังโหลดคิว…');
    try {
      var params = new URLSearchParams({ status: q('filter').value }); if (more && cursor) params.set('cursor', cursor);
      var data = await api('?' + params.toString());
      if (request !== queueRequest) return;
      if (!Array.isArray(data.items)) throw new Error('invalid_queue');
      data.items.forEach(card); cursor = data.next_cursor || null;
      var count = entries.size;
      message('status', count ? 'แสดง ' + count + ' รายการ' + (cursor ? ' · มีรายการเพิ่มเติม' : '') : 'ไม่มีรายการในสถานะนี้');
      if (!count) q('list').append(element('div', 'mr-empty', 'เมื่อมีสื่อในสถานะนี้ รายการจะแสดงที่นี่'));
    } catch (error) {
      if (request !== queueRequest) return;
      message('status', errorText(error));
      if (error.status === 401) { var link = element('a', '', 'เข้าสู่ระบบแอดมิน'); link.href = '/internal/admin/login?next=%2Finternal%2Fadmin%2Fmmd-review'; q('list').replaceChildren(link); }
    } finally { if (request === queueRequest) { loading = false; q('refresh').disabled = false; q('filter').disabled = false; q('more').disabled = false; q('more').hidden = !cursor; } }
  }
  async function decide(decision) {
    if (busy || !selected || !sha || !q('confirm').checked) return;
    if (decision !== 'approve' && !q('note').value.trim()) return;
    var item = selected, teaserSafe = decision === 'approve' && item.audience === 'private' && q('teaser').checked; busy = true; controls(); batchControls(false); message('review-status', 'กำลังบันทึกผลการตรวจ…');
    try {
      await api('/decision', { model_id: item.model_id, media_asset_id: item.id, expected_status: item.status, media_sha256: sha, decision: decision, teaser_safe: teaserSafe, note: q('note').value.trim() });
      busy = false; closeReview(); await load(false);
      message('status', decision === 'approve' ? (teaserSafe ? 'อนุมัติเป็น Private Teaser แล้ว · ลูกค้ายังต้องผ่านสิทธิ์ก่อนดู' : (item.audience === 'public' ? 'อนุมัติสื่อ Public แล้ว' : 'อนุมัติเป็นสื่อส่วนตัวแล้ว · ยังไม่ได้เปิดสิทธิ์ให้ลูกค้า')) : decision === 'revoke' ? 'เพิกถอนการอนุมัติแล้ว' : 'ปฏิเสธสื่อแล้ว');
    } catch (error) { busy = false; batchControls(true); sha = ''; message('review-status', errorText(error)); controls(); }
  }
  q('batch-confirm').addEventListener('change', function () { batchControls(false); });
  q('batch-approve').addEventListener('click', approveBatch);
  q('clear').addEventListener('click', function () { if (!busy) { selectionEpoch++; groups.forEach(function (g) { g.status.textContent = ''; }); entries.forEach(function (e) { e.check.checked = false; }); batchControls(true); } });
  q('refresh').addEventListener('click', function () { load(false); }); q('filter').addEventListener('change', function () { load(false); }); q('more').addEventListener('click', function () { load(true); });
  q('close').addEventListener('click', closeReview); dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeReview(); });
  q('confirm').addEventListener('change', controls); q('teaser').addEventListener('change', controls); q('note').addEventListener('input', controls); q('form').addEventListener('submit', function (event) { event.preventDefault(); });
  ['approve', 'reject', 'revoke'].forEach(function (decision) { q(decision).addEventListener('click', function () { decide(decision); }); });
  function conceal() { queueRequest++; loading = false; controllers.forEach(function (controller) { controller.abort(); }); clearMedia(); clearGrid(); if (dialog.open) dialog.close(); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) conceal(); else if (!busy) load(false); });
  window.addEventListener('pagehide', conceal);
  load(false);
}());
