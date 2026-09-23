(function () {
  'use strict';
  var root = document.getElementById('mmd-review');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = 'true';
  var q = function (id) { return root.querySelector('#mr-' + id); };
  var dialog = q('dialog'), selected = null, objectUrl = '', sha = '', busy = false, loading = false, cursor = null, generation = 0;
  var controllers = new Set();
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
        if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(blob.type) || !blob.size || blob.size > 25 * 1024 * 1024) throw new Error('invalid_media');
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
    q('close').disabled = busy; q('note').disabled = busy; q('confirm').disabled = busy;
  }
  function clearMedia() {
    generation++; sha = ''; selected = null;
    var video = q('media').querySelector('video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    q('media').replaceChildren();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = ''; q('note').value = ''; q('confirm').checked = false; controls();
  }
  function closeReview() { if (busy) return; clearMedia(); if (dialog.open) dialog.close(); }
  async function openReview(item) {
    clearMedia(); selected = item; var version = generation;
    message('title', item.name); message('detail', (item.model_name || item.model_id) + ' · ' + labels[item.status]);
    message('review-status', 'กำลังตรวจไฟล์และโหลดสื่อ…');
    q('approve').hidden = item.status !== 'pending_review'; q('reject').hidden = item.status !== 'pending_review'; q('revoke').hidden = item.status !== 'approved';
    dialog.showModal(); controls();
    try {
      var result = await api('/file', { model_id: item.model_id, media_asset_id: item.id });
      if (version !== generation || !dialog.open) return;
      var media = element(result.blob.type === 'video/mp4' ? 'video' : 'img');
      if (media.tagName === 'VIDEO') { media.controls = true; media.playsInline = true; media.disablePictureInPicture = true; media.setAttribute('controlsList', 'nodownload noremoteplayback'); }
      else media.alt = 'สื่อส่วนตัวสำหรับตรวจโดยแอดมิน';
      media.addEventListener(media.tagName === 'VIDEO' ? 'loadeddata' : 'load', function () { if (version !== generation) return; sha = result.sha; message('review-status', 'ตรวจสื่อให้ครบก่อนเลือกผลการตรวจ'); controls(); }, { once: true });
      media.addEventListener('error', function () { sha = ''; message('review-status', 'เปิดสื่อไม่ได้ กรุณาปิดแล้วลองตรวจใหม่'); controls(); });
      objectUrl = URL.createObjectURL(result.blob); media.src = objectUrl; q('media').replaceChildren(media);
    } catch (error) { if (version === generation) { message('review-status', errorText(error)); controls(); } }
  }
  function card(item) {
    var article = element('article', 'mr-card'), info = element('div', 'mr-card-info');
    info.append(element('p', 'mr-kind', item.kind === 'private_clip' ? 'PRIVATE CLIP' : 'PRIVATE PIC'), element('h2', '', item.name));
    var date = new Date(item.uploaded_at), when = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
    info.append(element('p', 'mr-muted', (item.model_name || item.model_id || 'ไม่พบ Model') + (when ? ' · ' + when : '')), element('p', 'mr-muted', labels[item.status] + ' · ' + (Number(item.size) / 1024 / 1024).toFixed(1) + ' MB'));
    article.append(info);
    if (item.reviewable && item.status !== 'rejected') { var button = element('button', '', item.status === 'approved' ? 'ตรวจ / เพิกถอน' : 'เปิดตรวจ'); button.type = 'button'; button.addEventListener('click', function () { openReview(item); }); article.append(button); }
    else if (!item.reviewable) info.append(element('p', 'mr-muted', 'ล็อกไว้: ต้องอัปโหลดผ่าน Private Media ใหม่'));
    return article;
  }
  async function load(more) {
    if (loading) return;
    loading = true; q('refresh').disabled = true; q('filter').disabled = true; q('more').disabled = true;
    if (!more) { cursor = null; q('list').replaceChildren(); }
    message('status', 'กำลังโหลดคิว…');
    try {
      var params = new URLSearchParams({ status: q('filter').value }); if (more && cursor) params.set('cursor', cursor);
      var data = await api('?' + params.toString());
      if (!Array.isArray(data.items)) throw new Error('invalid_queue');
      data.items.forEach(function (item) { q('list').append(card(item)); }); cursor = data.next_cursor || null;
      var count = q('list').children.length;
      message('status', count ? 'แสดง ' + count + ' รายการ' + (cursor ? ' · มีรายการเพิ่มเติม' : '') : 'ไม่มีรายการในสถานะนี้');
      if (!count) q('list').append(element('div', 'mr-empty', 'เมื่อมีสื่อในสถานะนี้ รายการจะแสดงที่นี่'));
    } catch (error) {
      message('status', errorText(error));
      if (error.status === 401) { var link = element('a', '', 'เข้าสู่ระบบแอดมิน'); link.href = '/internal/admin/login?next=%2Finternal%2Fadmin%2Fmmd-review'; q('list').replaceChildren(link); }
    } finally { loading = false; q('refresh').disabled = false; q('filter').disabled = false; q('more').disabled = false; q('more').hidden = !cursor; }
  }
  async function decide(decision) {
    if (busy || !selected || !sha || !q('confirm').checked) return;
    if (decision !== 'approve' && !q('note').value.trim()) return;
    var item = selected; busy = true; controls(); message('review-status', 'กำลังบันทึกผลการตรวจ…');
    try {
      await api('/decision', { model_id: item.model_id, media_asset_id: item.id, expected_status: item.status, media_sha256: sha, decision: decision, note: q('note').value.trim() });
      busy = false; closeReview(); await load(false);
      message('status', decision === 'approve' ? 'อนุมัติสื่อส่วนตัวแล้ว · ยังไม่ได้เปิดสิทธิ์ให้ลูกค้า' : decision === 'revoke' ? 'เพิกถอนการอนุมัติแล้ว' : 'ปฏิเสธสื่อแล้ว');
    } catch (error) { busy = false; sha = ''; message('review-status', errorText(error)); controls(); }
  }
  q('refresh').addEventListener('click', function () { load(false); }); q('filter').addEventListener('change', function () { load(false); }); q('more').addEventListener('click', function () { load(true); });
  q('close').addEventListener('click', closeReview); dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeReview(); });
  q('confirm').addEventListener('change', controls); q('note').addEventListener('input', controls); q('form').addEventListener('submit', function (event) { event.preventDefault(); });
  ['approve', 'reject', 'revoke'].forEach(function (decision) { q(decision).addEventListener('click', function () { decide(decision); }); });
  function conceal() { controllers.forEach(function (controller) { controller.abort(); }); clearMedia(); if (dialog.open) dialog.close(); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) conceal(); });
  window.addEventListener('pagehide', conceal);
  load(false);
}());
