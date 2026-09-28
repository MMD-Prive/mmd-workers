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
  const authRetry = $('[data-auth-retry]');
  const success = $('[data-success]');
  const scope = $('[data-success-scope]');
  const telegramLink = $('[data-telegram-link]');
  const telegramTitle = $('[data-telegram-title]');
  const telegramCopy = $('[data-telegram-copy]');
  const telegramConnect = $('[data-telegram-connect]');
  const telegramRefresh = $('[data-telegram-refresh]');
  const questions = [...R.querySelectorAll('[data-question]')];

  if (![form, birthday, mmd, privatePer, telegram, past, mediaInput, mediaGrid,
    mediaCount, mediaNote, error, submit, submitLabel, chip, authNote, authRetry, success, scope,
    telegramLink, telegramTitle, telegramCopy, telegramConnect, telegramRefresh].every(Boolean)) return;

  R.dataset.ready = '1';

  const PROFILE = R.dataset.profileEndpoint || '/v1/model/profile';
  const SUBMIT = R.dataset.submitEndpoint || '/v1/model/session/current?mode=year6_direct_wish';
  const MEDIA_UPLOAD = R.dataset.mediaUploadEndpoint || '/v1/model/media/upload';
  const TELEGRAM_BIND = R.dataset.telegramBindEndpoint || '/v1/model/telegram/bind';
  const DASHBOARD = R.dataset.dashboardUrl || '/sigil/model/dashboard?notice=wish_pending_review';
  const LIFF_ID = R.dataset.liffId || '2010864854-N34SgCqq';
  const DRAFT = 'mmd_model_wish_draft_v5';
  const MAX_FILES = 5;
  const IMAGE_MAX = 10 * 1024 * 1024;
  const VIDEO_MAX = 50 * 1024 * 1024;
  const IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
  const VIDEOS = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

  let authed = false;
  let busy = false;
  let authBusy = false;
  let telegramBusy = false;
  let liffLoading = null;
  let selectedFiles = [];
  let uploadedMediaIds = [];
  let previewUrls = [];

  function setError(text) {
    error.textContent = text || '';
  }

  function setChip(mode, text) {
    chip.className = 'mmw-session' + (mode ? ' ' + mode : '');
    chip.textContent = text;
  }

  function setAuthState(mode, text, retry = false) {
    authNote.classList.remove('is-checking', 'is-ready', 'is-needed');
    if (mode) authNote.classList.add(mode);
    const copy = authNote.querySelector('p');
    if (copy) copy.textContent = text || '';
    authRetry.hidden = !retry;
  }

  function lock(value, label) {
    busy = !!value;
    form.setAttribute('aria-busy', String(busy));
    [submit, birthday, mmd, privatePer, telegram, past, mediaInput].forEach(el => {
      el.disabled = busy;
    });
    submitLabel.textContent = label || (busy ? 'กำลังส่ง…' : 'ส่งคำอวยพร');
  }

  function updateCounts() {
    let written = 0;
    [['birthday', birthday, 700], ['mmd', mmd, 1000], ['private', privatePer, 1000]].forEach(([key, el, max]) => {
      const counter = $('[data-count="' + key + '"]');
      if (counter) counter.textContent = el.value.length + ' / ' + max;
      const filled = !!el.value.trim();
      const section = el.closest('[data-question]');
      if (filled) written++;
      if (section) {
        section.classList.toggle('is-filled', filled);
        const state = section.querySelector('[data-question-state]');
        if (state) {
          state.textContent = filled ? '✓' : '';
          state.setAttribute('aria-label', filled ? 'เขียนแล้ว' : 'ยังไม่ได้เขียน');
        }
      }
    });
    const total = $('[data-written-count]');
    if (total) total.textContent = written + ' / 3 ข้อความ';
  }

  function saveDraft() {
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify({
        birthday: birthday.value,
        mmd: mmd.value,
        private_note: privatePer.value,
        telegram: telegram.checked,
        past: past.checked,
      }));
    } catch {}
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT) || 'null');
      if (!draft) return;
      birthday.value = String(draft.birthday || '').slice(0, 700);
      mmd.value = String(draft.mmd || '').slice(0, 1000);
      privatePer.value = String(draft.private_note || '').slice(0, 1000);
      telegram.checked = !!draft.telegram;
      past.checked = !!draft.past;
    } catch {}
  }

  function clearDraft() {
    try { sessionStorage.removeItem(DRAFT); } catch {}
  }

  function profileName(payload) {
    return payload?.model?.per_name || payload?.model?.display_name ||
      payload?.profile?.per_name || payload?.profile?.display_name ||
      payload?.per_name || payload?.display_name || '';
  }

  function profileModel(payload) {
    return payload?.model || payload?.profile || payload || {};
  }

  function safeTelegramConnectUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' && url.hostname === 't.me' ? url.toString() : '';
    } catch {
      return '';
    }
  }

  function renderTelegramStatus(payload) {
    const model = profileModel(payload);
    const connected = model?.telegram_connected === true ||
      String(model?.telegram_verification_status || '').toLowerCase() === 'verified';
    const username = String(model?.telegram_username || '').replace(/^@/, '').trim();

    telegramLink.classList.remove('is-checking', 'is-needed', 'is-connected', 'is-error');
    if (connected) {
      telegramLink.classList.add('is-connected');
      telegramTitle.textContent = username ? 'Telegram Connected · @' + username : 'Telegram Connected';
      telegramCopy.textContent = 'พร้อมรับลิงก์ยืนยันงานและข้อความสำคัญจาก MMD โดยตรง';
      telegramConnect.hidden = true;
      telegramRefresh.hidden = true;
      return;
    }

    telegramLink.classList.add('is-needed');
    telegramTitle.textContent = 'เชื่อม Telegram สำหรับแจ้งงาน';
    telegramCopy.textContent = 'ใช้รับลิงก์ยืนยันงานและข้อความสำคัญจาก MMD · LINE ยังเป็นบัญชีหลัก และการส่ง Wish ไม่ถูกบล็อก';
    telegramConnect.hidden = false;
    telegramRefresh.hidden = false;
  }

  function renderTelegramError(message) {
    telegramLink.classList.remove('is-checking', 'is-needed', 'is-connected');
    telegramLink.classList.add('is-error');
    telegramTitle.textContent = 'ยังตรวจ Telegram ไม่สำเร็จ';
    telegramCopy.textContent = message || 'ลองตรวจสถานะอีกครั้งได้ครับ';
    telegramConnect.hidden = true;
    telegramRefresh.hidden = false;
  }

  async function refreshTelegramStatus() {
    if (!authed || telegramBusy) return;
    telegramBusy = true;
    telegramRefresh.disabled = true;
    try {
      const response = await fetch(PROFILE, {
        credentials: 'include',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('profile_unavailable');
      const profile = await response.json().catch(() => null);
      if (!profile || typeof profile !== 'object') throw new Error('profile_invalid');
      renderTelegramStatus(profile);
    } catch {
      renderTelegramError('ยังตรวจสถานะ Telegram ไม่สำเร็จ · ลองอีกครั้งได้ครับ');
    } finally {
      telegramBusy = false;
      telegramRefresh.disabled = false;
    }
  }

  async function connectTelegram() {
    if (!authed || telegramBusy) return;
    telegramBusy = true;
    saveDraft();
    telegramConnect.disabled = true;
    telegramRefresh.disabled = true;
    const oldLabel = telegramConnect.textContent;
    telegramConnect.textContent = 'กำลังเปิด Telegram…';
    try {
      const response = await fetch(TELEGRAM_BIND, {
        method: 'POST',
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || result.ok !== true) throw new Error(result?.error || 'telegram_bind_failed');
      const connectUrl = safeTelegramConnectUrl(result.connect_url);
      if (!connectUrl) throw new Error('telegram_connect_url_invalid');
      location.assign(connectUrl);
    } catch {
      renderTelegramError('เปิด Telegram ยังไม่สำเร็จครับ · ลองเชื่อมอีกครั้งได้');
    } finally {
      telegramBusy = false;
      telegramConnect.disabled = false;
      telegramRefresh.disabled = false;
      telegramConnect.textContent = oldLabel || 'เชื่อม Telegram';
    }
  }

  async function checkProfile() {
    setChip('is-checking', 'กำลังยืนยันตัวตน');
    setAuthState('is-checking', 'กำลังยืนยันตัวตนผ่าน LINE เพื่อเปิดฟอร์มจากบัญชี MMD APP ของคุณ');
    try {
      const response = await fetch(PROFILE, {
        credentials: 'include',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) return false;
      const profile = await response.json();
      if (!profile || typeof profile !== 'object') return false;
      const name = profileName(profile);
      authed = true;
      renderTelegramStatus(profile);
      setChip('is-ready', name ? 'ยืนยันแล้ว · ' + name : 'ยืนยันแล้ว');
      setAuthState('is-ready', 'ยืนยันตัวตนแล้ว · พร้อมเขียนและส่งจากบัญชี MMD APP ของคุณ');
      return true;
    } catch {
      return false;
    }
  }

  function loadLiff() {
    if (window.liff) return Promise.resolve(window.liff);
    if (liffLoading) return liffLoading;
    liffLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
      script.onload = () => window.liff ? resolve(window.liff) : reject(new Error('liff_unavailable'));
      script.onerror = () => {
        script.remove();
        reject(new Error('liff_load_failed'));
      };
      document.head.appendChild(script);
    }).catch(err => {
      liffLoading = null;
      throw err;
    });
    return liffLoading;
  }

  async function verifyLine({ automatic = false } = {}) {
    if (authBusy) return false;
    authBusy = true;
    saveDraft();
    setChip('is-checking', 'กำลังยืนยันตัวตน');
    setAuthState('is-checking', 'กำลังยืนยันตัวตนผ่าน LINE เพื่อเปิดฟอร์มจากบัญชี MMD APP ของคุณ');
    if (!automatic) setError('');
    try {
      const liff = await loadLiff();
      await liff.init({ liffId: LIFF_ID });

      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: location.href });
        return false;
      }

      const idToken = typeof liff.getIDToken === 'function' ? liff.getIDToken() : '';
      if (!idToken) throw new Error('id_token_missing');

      const response = await fetch('/v1/model/liff/exchange', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ id_token: idToken, environment: 'published' }),
      });
      if (!response.ok) throw new Error('exchange_failed');

      const ok = await checkProfile();
      if (!ok) throw new Error('profile_unavailable');
      setError('');
      return true;
    } catch {
      authed = false;
      setChip('is-needed', 'ยืนยัน LINE');
      setAuthState('is-needed', 'ยังยืนยันตัวตนไม่สำเร็จครับ กด “ยืนยัน LINE” แล้วกลับมาเขียนต่อได้เลย', true);
      return false;
    } finally {
      authBusy = false;
    }
  }

  async function readWishStatus() {
    if (!authed) return null;
    try {
      const response = await fetch(SUBMIT, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return null;
      const result = await response.json().catch(() => null);
      return result && result.ok === true ? result : null;
    } catch {
      return null;
    }
  }

  function clearPreviews() {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = [];
  }

  function fileKind(file) {
    const type = String(file?.type || '').toLowerCase();
    return VIDEOS.has(type) ? 'video' : IMAGES.has(type) ? 'image' : '';
  }

  function renderMedia() {
    clearPreviews();
    mediaCount.textContent = selectedFiles.length + ' / 5';
    [...mediaGrid.querySelectorAll('[data-media-slot]')].forEach((slot, index) => {
      slot.classList.toggle('is-uploaded', uploadedMediaIds.length === selectedFiles.length && uploadedMediaIds.length > index);
      slot.innerHTML = '<span>0' + (index + 1) + '</span><em>MEDIA</em>';
      const file = selectedFiles[index];
      if (!file) return;
      const kind = fileKind(file);
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      const media = document.createElement(kind === 'video' ? 'video' : 'img');
      media.src = url;
      if (kind === 'video') {
        media.muted = true;
        media.playsInline = true;
        media.preload = 'metadata';
      } else {
        media.alt = 'รูปอัปเดตโปรไฟล์ ' + (index + 1);
      }
      slot.appendChild(media);
      const badge = document.createElement('span');
      badge.className = 'mmw-media-badge';
      badge.textContent = kind === 'video' ? 'CLIP' : 'PHOTO';
      slot.appendChild(badge);
    });

    if (!selectedFiles.length) {
      mediaNote.textContent = 'ไฟล์จะเข้า Gallery / Intro Video ของคุณ และไม่ถูกแนบไปกับ Telegram หรือข้อความถึงลูกค้าโดยอัตโนมัติ';
    } else if (uploadedMediaIds.length === selectedFiles.length) {
      mediaNote.textContent = 'อัปโหลด ' + uploadedMediaIds.length + ' ไฟล์เข้า MMD APP เรียบร้อยแล้ว';
    } else {
      mediaNote.textContent = 'เลือกแล้ว ' + selectedFiles.length + ' ไฟล์ · จะอัปโหลดเมื่อกด “ส่งคำอวยพร”';
    }
  }

  function validateFiles(files) {
    if (files.length > MAX_FILES) return 'เลือกได้สูงสุด 5 ไฟล์รวมกันครับ';
    for (const file of files) {
      const kind = fileKind(file);
      if (!kind) return 'รองรับ JPG, PNG, WEBP, HEIC, HEIF, MP4, MOV และ WEBM ครับ';
      if (kind === 'image' && file.size > IMAGE_MAX) return 'รูปแต่ละไฟล์รองรับสูงสุด 10 MB ครับ';
      if (kind === 'video' && file.size > VIDEO_MAX) return 'คลิปแต่ละไฟล์รองรับสูงสุด 50 MB ครับ';
      if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) {
        return 'มีไฟล์ที่อ่านขนาดไม่ได้ครับ ลองเลือกใหม่อีกครั้ง';
      }
    }
    return '';
  }

  async function cleanup(ids) {
    await Promise.allSettled(ids.map(id => fetch('/v1/model/media/' + encodeURIComponent(id), {
      method: 'DELETE',
      credentials: 'include',
      headers: { accept: 'application/json' },
    })));
  }

  async function uploadMedia() {
    if (!selectedFiles.length) return [];
    if (uploadedMediaIds.length === selectedFiles.length) return uploadedMediaIds;

    const ids = [];
    try {
      for (let index = 0; index < selectedFiles.length; index++) {
        const file = selectedFiles[index];
        const kind = fileKind(file);
        const data = new FormData();
        lock(true, 'กำลังอัปโหลด ' + (index + 1) + '/' + selectedFiles.length + '…');
        data.append('file', file, file.name);
        data.append('media_type', kind === 'video' ? 'intro_video' : 'public_gallery');

        const response = await fetch(MEDIA_UPLOAD, {
          method: 'POST',
          credentials: 'include',
          body: data,
          headers: { accept: 'application/json' },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const err = new Error(result?.error || 'media_upload_failed');
          err.status = response.status;
          throw err;
        }
        const id = result?.media?.media_id || result?.media_id || '';
        if (!id) throw new Error('media_id_missing');
        ids.push(id);
      }
      uploadedMediaIds = ids;
      renderMedia();
      return ids;
    } catch (err) {
      if (ids.length) await cleanup(ids);
      uploadedMediaIds = [];
      renderMedia();
      throw err;
    }
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

  function setSuccessState(state) {
    const pill = success.querySelector('.mmw-pending-pill');
    const title = success.querySelector('h2');
    const body = success.querySelector('h2 + p');

    success.classList.remove('is-approved', 'is-not-approved');
    if (state === 'completed') {
      success.classList.add('is-approved');
      if (pill) pill.innerHTML = '<span aria-hidden="true"></span>ยืนยันแล้ว';
      if (title) title.textContent = 'คำอวยพรได้รับการยืนยันแล้ว';
      if (body) body.textContent = 'MMD ตรวจคำอวยพรเรียบร้อยแล้วครับ';
      return;
    }
    if (state === 'revoked') {
      success.classList.add('is-not-approved');
      if (pill) pill.innerHTML = '<span aria-hidden="true"></span>ยังไม่เผยแพร่';
      if (title) title.textContent = 'MMD รับข้อความไว้แล้วครับ';
      if (body) body.textContent = 'คำอวยพรนี้ยังไม่ได้ถูกเผยแพร่ หากต้องการสอบถามสามารถติดต่อ MMD ได้ครับ';
      return;
    }

    if (pill) pill.innerHTML = '<span aria-hidden="true"></span>รอยืนยัน';
    if (title) title.textContent = 'ได้รับคำอวยพรแล้วครับ';
    if (body) body.textContent = 'MMD รับข้อความเรียบร้อยแล้ว · ตอนนี้อยู่ระหว่างพี่เปอร์ตรวจอนุมัติ';
  }

  function showSuccess(state = 'manual_review', { existing = false } = {}) {
    const wrap = form.closest('.mmw-form-wrap');
    if (wrap) wrap.hidden = true;
    setSuccessState(state);
    scope.textContent = existing
      ? 'สถานะคำอวยพรของคุณอยู่ในระบบ MMD แล้ว'
      : 'ที่คุณเลือก: ' + selectedScope().join(' · ');
    success.hidden = false;
    success.focus({ preventScroll: true });
    success.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function goDashboardSoon() {
    if (typeof location === 'undefined' || typeof location.assign !== 'function' || typeof setTimeout !== 'function') return;
    setTimeout(() => location.assign(DASHBOARD), 1200);
  }

  async function send() {
    if (busy) return;

    const wish = birthday.value.trim();
    const mmdText = mmd.value.trim();
    const privateText = privatePer.value.trim();
    setError('');

    if (!(wish || mmdText || privateText)) {
      setError('เลือกเขียนอย่างน้อย 1 ข้อความก่อนส่งครับ');
      const first = birthday.closest('[data-question]');
      if (first) first.open = true;
      birthday.focus();
      return;
    }

    saveDraft();
    lock(true, 'กำลังเตรียมส่ง…');
    let phase = 'auth';

    try {
      if (!authed && !(await verifyLine())) return;

      phase = 'upload';
      if (selectedFiles.length) await uploadMedia();

      phase = 'submit';
      lock(true, 'กำลังส่งคำอวยพร…');
      const shareable = [
        wish ? 'อวยพร 6 ปี MMD: ' + wish : '',
        mmdText ? 'ข้อความถึง MMD: ' + mmdText : '',
      ].filter(Boolean).join('\n\n');

      const response = await fetch(SUBMIT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          message: shareable,
          birthday_wish: wish,
          mmd_message: mmdText,
          private_note_per: privateText,
          private_note_scope: 'per_only',
          telegram_consent: !!telegram.checked,
          past_clients_consent: !!past.checked,
          consent_version: 'model_wish_v6',
          source: '/sigil/model/wish',
        }),
      });
      const result = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403) {
        authed = false;
        setChip('is-needed', 'ยืนยัน LINE');
        setAuthState('is-needed', 'Session หมดอายุครับ ยืนยัน LINE อีกครั้งแล้วระบบจะกลับมาที่ข้อความเดิม', true);
        await verifyLine();
        return;
      }

      if (!response.ok || !result || typeof result !== 'object' || result.ok !== true) {
        setError(result?.error === 'model_wish_storage_not_configured'
          ? 'ระบบรับคำอวยพรกำลังเปิดใช้งานครับ ลองส่งอีกครั้งในภายหลัง'
          : 'ยังยืนยันการรับข้อความไม่ได้ครับ ข้อความของคุณยังอยู่ ลองส่งอีกครั้งได้เลย');
        return;
      }

      clearDraft();
      const state = String(result.state || 'manual_review');
      showSuccess(state);
      if (state === 'manual_review') goDashboardSoon();
    } catch (err) {
      if (err.status === 413) {
        setError('ไฟล์ใหญ่เกินขนาดที่รองรับครับ · รูป 10 MB / คลิป 50 MB');
      } else if (err.status === 415) {
        setError('รองรับ JPG, PNG, WEBP, HEIC, HEIF, MP4, MOV และ WEBM ครับ');
      } else {
        setError(phase === 'upload'
          ? 'อัปโหลดไฟล์ไม่สำเร็จครับ ไฟล์ที่เลือกไว้ยังอยู่ ลองส่งอีกครั้งได้เลย'
          : 'ส่งข้อความไม่สำเร็จครับ ข้อความที่เขียนไว้ยังอยู่ ลองส่งอีกครั้งได้เลย');
      }
    } finally {
      lock(false);
    }
  }

  async function bootstrapAuth() {
    lock(true, 'กำลังยืนยันตัวตน…');
    try {
      let ok = await checkProfile();
      if (!ok) ok = await verifyLine({ automatic: true });
      if (!ok) return;

      const status = await readWishStatus();
      if (status?.submitted === true && ['manual_review', 'completed', 'revoked'].includes(String(status.state || ''))) {
        clearDraft();
        showSuccess(String(status.state), { existing: true });
      }
    } finally {
      lock(false);
    }
  }

  R.querySelectorAll('[data-next-question]').forEach(button => {
    button.addEventListener('click', () => {
      const target = questions[Number(button.dataset.nextQuestion)];
      if (!target) return;
      questions.forEach(section => { section.open = section === target; });
      target.querySelector('textarea')?.focus();
    });
  });

  authRetry.addEventListener('click', async () => {
    if (busy || authBusy) return;
    lock(true, 'กำลังยืนยันตัวตน…');
    try {
      const ok = await verifyLine();
      if (ok) {
        const status = await readWishStatus();
        if (status?.submitted === true && ['manual_review', 'completed', 'revoked'].includes(String(status.state || ''))) {
          clearDraft();
          showSuccess(String(status.state), { existing: true });
        }
      }
    } finally {
      lock(false);
    }
  });

  telegramConnect.addEventListener('click', connectTelegram);
  telegramRefresh.addEventListener('click', refreshTelegramStatus);
  window.addEventListener('focus', () => {
    if (authed) setTimeout(refreshTelegramStatus, 250);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && authed) setTimeout(refreshTelegramStatus, 250);
  });

  mediaInput.addEventListener('click', async event => {
    if (authed) return;
    event.preventDefault();
    if (busy || authBusy) return;
    lock(true, 'กำลังยืนยันตัวตน…');
    try {
      if (await verifyLine()) setError('');
    } finally {
      lock(false);
    }
  });

  mediaInput.addEventListener('change', () => {
    setError('');
    const files = [...(mediaInput.files || [])];
    const message = validateFiles(files);
    if (message) {
      selectedFiles = [];
      uploadedMediaIds = [];
      mediaInput.value = '';
      setError(message);
    } else {
      selectedFiles = files;
      uploadedMediaIds = [];
    }
    renderMedia();
  });

  [birthday, mmd, privatePer].forEach(el => {
    el.addEventListener('input', () => {
      updateCounts();
      saveDraft();
    });
  });
  telegram.addEventListener('change', saveDraft);
  past.addEventListener('change', saveDraft);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!busy) send();
  });

  restoreDraft();
  updateCounts();
  renderMedia();
  bootstrapAuth();
})();
