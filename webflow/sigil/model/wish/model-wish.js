(() => {
  'use strict';
  const R = document.querySelector('#mmd-model-wish-v1[data-model-wish]');
  if (!R || R.dataset.ready === '1') return;
  const $ = selector => R.querySelector(selector);
  const form = $('[data-wish-form]');
  const birthday = $('[data-birthday-wish]');
  const mmd = $('[data-mmd-message]');
  const privatePer = $('[data-private-per]');
  const telegram = $('[data-telegram-consent]');
  const past = $('[data-past-clients-consent]');
  const mediaInput = $('[data-media-input]');
  const mediaGrid = $('[data-media-grid]');
  const mediaCount = $('[data-media-count]');
  const mediaNote = $('[data-media-note]');
  const error = $('[data-error]');
  const submit = $('[data-submit]');
  const submitLabel = $('[data-submit-label]');
  const chip = $('[data-session-chip]');
  const authNote = $('[data-auth-note]');
  const success = $('[data-success]');
  const scope = $('[data-success-scope]');
  const questions = [...R.querySelectorAll('[data-question]')];
  if (![form, birthday, mmd, privatePer, telegram, past, mediaInput, mediaGrid,
    mediaCount, mediaNote, error, submit, submitLabel, chip, authNote, success, scope].every(Boolean)) return;
  R.dataset.ready = '1';

  const PROFILE = R.dataset.profileEndpoint || '/v1/model/profile';
  const SUBMIT = R.dataset.submitEndpoint || '/v1/model/session/current?mode=year6_direct_wish';
  const MEDIA_UPLOAD = R.dataset.mediaUploadEndpoint || '/v1/model/media/upload';
  const LIFF_ID = R.dataset.liffId || '2010864854-N34SgCqq';
  const DRAFT = 'mmd_model_wish_draft_v4';
  const MAX_FILES = 5, IMAGE_MAX = 10 * 1024 * 1024, VIDEO_MAX = 50 * 1024 * 1024;
  const IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
  const VIDEOS = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
  let authed = false, busy = false, liffLoading = null;
  let selectedFiles = [], uploadedMediaIds = [], previewUrls = [];

  function setError(text) { error.textContent = text || ''; }
  function setChip(mode, text) { chip.className = 'mmw-session' + (mode ? ' ' + mode : ''); chip.textContent = text; }
  function lock(value, label) {
    busy = !!value;
    form.setAttribute('aria-busy', String(busy));
    [submit, birthday, mmd, privatePer, telegram, past, mediaInput].forEach(el => { el.disabled = busy; });
    submitLabel.textContent = label || (busy ? 'กำลังส่งให้เปอร์…' : 'ส่งให้เปอร์');
  }
  function updateCounts() {
    let written = 0;
    [['birthday', birthday, 700], ['mmd', mmd, 1000], ['private', privatePer, 1000]].forEach(([key, el, max]) => {
      const counter = $('[data-count="' + key + '"]');
      if (counter) counter.textContent = el.value.length + ' / ' + max;
      const filled = !!el.value.trim(), section = el.closest('[data-question]');
      if (filled) written++;
      if (section) {
        section.classList.toggle('is-filled', filled);
        const state = section.querySelector('[data-question-state]');
        if (state) { state.textContent = filled ? '✓' : ''; state.setAttribute('aria-label', filled ? 'เขียนแล้ว' : 'ยังไม่ได้เขียน'); }
      }
    });
    const total = $('[data-written-count]');
    if (total) total.textContent = written + ' / 3 ข้อความ';
  }
  function saveDraft() {
    try { sessionStorage.setItem(DRAFT, JSON.stringify({ birthday: birthday.value, mmd: mmd.value,
      private_note: privatePer.value, telegram: telegram.checked, past: past.checked })); } catch {}
  }
  function restoreDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT) || 'null');
      if (!draft) return;
      birthday.value = String(draft.birthday || '').slice(0, 700);
      mmd.value = String(draft.mmd || '').slice(0, 1000);
      privatePer.value = String(draft.private_note || '').slice(0, 1000);
      telegram.checked = !!draft.telegram; past.checked = !!draft.past;
    } catch {}
  }
  function clearDraft() { try { sessionStorage.removeItem(DRAFT); } catch {} }
  function profileName(p) {
    return p?.model?.per_name || p?.model?.display_name || p?.profile?.per_name || p?.profile?.display_name || p?.per_name || p?.display_name || '';
  }
  async function checkProfile() {
    setChip('', 'กำลังเช็ก LINE');
    try {
      const response = await fetch(PROFILE, { credentials: 'include', headers: { accept: 'application/json' }, cache: 'no-store' });
      if (response.ok) {
        const profile = await response.json();
        if (!profile || typeof profile !== 'object') throw new Error('invalid_profile');
        const name = profileName(profile);
        authed = true; setChip('is-ready', name ? 'LINE พร้อม · ' + name : 'LINE พร้อม');
        authNote.classList.add('is-ready');
        authNote.querySelector('p').textContent = 'ยืนยัน LINE แล้ว · พร้อมส่งจากบัญชี MMD MODEL ของคุณ';
        return true;
      }
    } catch {}
    authed = false; setChip('is-needed', 'ยืนยัน LINE ตอนส่ง');
    authNote.classList.remove('is-ready');
    authNote.querySelector('p').textContent = 'ยืนยัน LINE ตอนส่ง เพื่อให้ข้อความผูกกับบัญชี MMD MODEL ของคุณ';
    return false;
  }
  function loadLiff() {
    if (window.liff) return Promise.resolve(window.liff);
    if (liffLoading) return liffLoading;
    liffLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
      script.onload = () => window.liff ? resolve(window.liff) : reject(new Error('liff_unavailable'));
      script.onerror = () => { script.remove(); reject(new Error('liff_load_failed')); };
      document.head.appendChild(script);
    }).catch(err => { liffLoading = null; throw err; });
    return liffLoading;
  }
  async function verifyLine() {
    saveDraft(); setError('กำลังยืนยัน LINE ครับ ข้อความที่เขียนไว้ยังอยู่');
    try {
      const liff = await loadLiff();
      await liff.init({ liffId: LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return false; }
      const response = await fetch('/v1/model/liff/exchange', { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ id_token: liff.getIDToken(), environment: 'published' }) });
      if (!response.ok) throw new Error('exchange');
      const ok = await checkProfile();
      setError(ok ? '' : 'ยังยืนยันบัญชี MMD MODEL ไม่สำเร็จครับ ข้อความที่เขียนไว้ยังอยู่');
      return ok;
    } catch {
      setError('ยืนยัน LINE ไม่สำเร็จครับ ลองเปิดหน้านี้จาก MMD MODEL อีกครั้ง ข้อความที่เขียนไว้ยังอยู่');
      return false;
    }
  }
  function clearPreviews() { previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; }
  function fileKind(file) { const type = String(file?.type || '').toLowerCase(); return VIDEOS.has(type) ? 'video' : IMAGES.has(type) ? 'image' : ''; }
  function renderMedia() {
    clearPreviews();
    mediaCount.textContent = selectedFiles.length + ' / 5';
    [...mediaGrid.querySelectorAll('[data-media-slot]')].forEach((slot, i) => {
      slot.classList.toggle('is-uploaded', uploadedMediaIds.length === selectedFiles.length && uploadedMediaIds.length > i);
      slot.innerHTML = '<span>0' + (i + 1) + '</span><em>MEDIA</em>';
      const file = selectedFiles[i];
      if (!file) return;
      const kind = fileKind(file), url = URL.createObjectURL(file);
      previewUrls.push(url);
      const media = document.createElement(kind === 'video' ? 'video' : 'img');
      media.src = url;
      if (kind === 'video') { media.muted = true; media.playsInline = true; media.preload = 'metadata'; }
      else media.alt = 'รูปอัปเดตโปรไฟล์ ' + (i + 1);
      slot.appendChild(media);
      const badge = document.createElement('span');
      badge.className = 'mmw-media-badge'; badge.textContent = kind === 'video' ? 'CLIP' : 'PHOTO'; slot.appendChild(badge);
    });
    if (!selectedFiles.length) mediaNote.textContent = 'ไฟล์จะเข้า Gallery / Intro Video ของคุณ และไม่ถูกแนบไปกับ Telegram หรือข้อความถึงลูกค้าโดยอัตโนมัติ';
    else if (uploadedMediaIds.length === selectedFiles.length) mediaNote.textContent = 'อัปโหลด ' + uploadedMediaIds.length + ' ไฟล์เข้า MMD MODEL เรียบร้อยแล้ว';
    else mediaNote.textContent = 'เลือกแล้ว ' + selectedFiles.length + ' ไฟล์ · จะอัปโหลดเมื่อกด “ส่งให้เปอร์”';
  }
  function validateFiles(files) {
    if (files.length > MAX_FILES) return 'เลือกได้สูงสุด 5 ไฟล์รวมกันครับ';
    for (const file of files) {
      const kind = fileKind(file);
      if (!kind) return 'รองรับ JPG, PNG, WEBP, HEIC, HEIF, MP4, MOV และ WEBM ครับ';
      if (kind === 'image' && file.size > IMAGE_MAX) return 'รูปแต่ละไฟล์รองรับสูงสุด 10 MB ครับ';
      if (kind === 'video' && file.size > VIDEO_MAX) return 'คลิปแต่ละไฟล์รองรับสูงสุด 50 MB ครับ';
      if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) return 'มีไฟล์ที่อ่านขนาดไม่ได้ครับ ลองเลือกใหม่อีกครั้ง';
    }
    return '';
  }
  async function cleanup(ids) {
    await Promise.allSettled(ids.map(id => fetch('/v1/model/media/' + encodeURIComponent(id), {
      method: 'DELETE', credentials: 'include', headers: { accept: 'application/json' }
    })));
  }
  async function uploadMedia() {
    if (!selectedFiles.length) return [];
    if (uploadedMediaIds.length === selectedFiles.length) return uploadedMediaIds;
    const ids = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i], kind = fileKind(file), data = new FormData();
        lock(true, 'กำลังอัปโหลด ' + (i + 1) + '/' + selectedFiles.length + '…');
        data.append('file', file, file.name); data.append('media_type', kind === 'video' ? 'intro_video' : 'public_gallery');
        const response = await fetch(MEDIA_UPLOAD, { method: 'POST', credentials: 'include', body: data, headers: { accept: 'application/json' } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) { const err = new Error(result?.error || 'media_upload_failed'); err.status = response.status; err.code = result?.error || ''; throw err; }
        const id = result?.media?.media_id || result?.media_id || '';
        if (!id) throw new Error('media_id_missing');
        ids.push(id);
      }
      uploadedMediaIds = ids; renderMedia(); return ids;
    } catch (err) { if (ids.length) await cleanup(ids); uploadedMediaIds = []; renderMedia(); throw err; }
  }
  function selectedScope() {
    const selected = [];
    if (telegram.checked) selected.push('Telegram MMD');
    if (past.checked) selected.push('Past Clients · MY MMD');
    if (!selected.length) selected.push('ส่งให้ MMD ตรวจอ่านเท่านั้น');
    if (privatePer.value.trim()) selected.push('ข้อความส่วนตัวถึงพี่เปอร์');
    if (uploadedMediaIds.length) selected.push('อัปเดตโปรไฟล์ ' + uploadedMediaIds.length + ' ไฟล์');
    return selected;
  }
  function showSuccess() {
    form.closest('.mmw-form-wrap').hidden = true;
    scope.textContent = 'ที่คุณเลือก: ' + selectedScope().join(' · ');
    success.hidden = false; success.focus({ preventScroll: true });
    success.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  async function send() {
    if (busy) return;
    const wish = birthday.value.trim(), mmdText = mmd.value.trim(), privateText = privatePer.value.trim();
    setError('');
    if (!(wish || mmdText || privateText)) {
      setError('เลือกเขียนอย่างน้อย 1 ข้อความก่อนส่งครับ');
      const first = birthday.closest('[data-question]');
      if (first) first.open = true;
      birthday.focus(); return;
    }
    saveDraft(); lock(true, 'กำลังเตรียมส่ง…');
    let phase = 'auth';
    try {
      if (!authed && !(await verifyLine())) return;
      phase = 'upload';
      if (selectedFiles.length) await uploadMedia();
      phase = 'submit'; lock(true, 'กำลังส่งให้เปอร์…');
      const shareable = [wish ? 'อวยพร 6 ปี MMD: ' + wish : '', mmdText ? 'ข้อความถึง MMD: ' + mmdText : ''].filter(Boolean).join('\n\n');
      const response = await fetch(SUBMIT, { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ message: shareable, birthday_wish: wish, mmd_message: mmdText,
          private_note_per: privateText, private_note_scope: 'per_only', telegram_consent: !!telegram.checked,
          past_clients_consent: !!past.checked, consent_version: 'model_wish_v5', source: '/sigil/model/wish' }) });
      const result = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        authed = false; setChip('is-needed', 'ยืนยัน LINE ตอนส่ง');
        if (await verifyLine()) setError('ยืนยัน LINE แล้วครับ กดส่งอีกครั้งได้เลย');
        return;
      }
      if (!response.ok || !result || typeof result !== 'object') {
        setError(result?.error === 'model_wish_storage_not_configured'
          ? 'ระบบรับคำอวยพรกำลังเปิดใช้งานครับ ลองส่งอีกครั้งในภายหลัง'
          : 'ยังยืนยันการรับข้อความไม่ได้ครับ ข้อความของคุณยังอยู่ ลองส่งอีกครั้งได้เลย');
        return;
      }
      clearDraft(); showSuccess();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        authed = false; setChip('is-needed', 'ยืนยัน LINE ตอนส่ง');
        if (await verifyLine()) setError('ยืนยัน LINE แล้วครับ กดส่งอีกครั้งได้เลย');
      } else if (err.status === 413) setError('ไฟล์ใหญ่เกินขนาดที่รองรับครับ · รูป 10 MB / คลิป 50 MB');
      else if (err.status === 415) setError('รองรับ JPG, PNG, WEBP, HEIC, HEIF, MP4, MOV และ WEBM ครับ');
      else setError(phase === 'upload' ? 'อัปโหลดไฟล์ไม่สำเร็จครับ ไฟล์ที่เลือกไว้ยังอยู่ ลองส่งอีกครั้งได้เลย' : 'ส่งข้อความไม่สำเร็จครับ ข้อความที่เขียนไว้ยังอยู่ ลองส่งอีกครั้งได้เลย');
    } finally { lock(false); }
  }

  R.querySelectorAll('[data-next-question]').forEach(button => button.addEventListener('click', () => {
    const target = questions[Number(button.dataset.nextQuestion)];
    if (!target) return;
    questions.forEach(section => { section.open = section === target; });
    target.querySelector('textarea')?.focus();
  }));
  mediaInput.addEventListener('click', async event => {
    if (authed) return;
    event.preventDefault();
    if (busy) return;
    lock(true, 'กำลังยืนยัน LINE…');
    try { if (await verifyLine()) setError('ยืนยัน LINE แล้วครับ กด “เลือกรูปหรือคลิป” อีกครั้งได้เลย'); }
    finally { lock(false); }
  });
  mediaInput.addEventListener('change', () => {
    setError('');
    const files = [...(mediaInput.files || [])], message = validateFiles(files);
    if (message) { selectedFiles = []; uploadedMediaIds = []; mediaInput.value = ''; setError(message); }
    else { selectedFiles = files; uploadedMediaIds = []; }
    renderMedia();
  });
  [birthday, mmd, privatePer].forEach(el => el.addEventListener('input', () => { updateCounts(); saveDraft(); }));
  telegram.addEventListener('change', saveDraft); past.addEventListener('change', saveDraft);
  form.addEventListener('submit', event => { event.preventDefault(); if (!busy) send(); });
  restoreDraft(); updateCounts(); renderMedia(); checkProfile();
})();
