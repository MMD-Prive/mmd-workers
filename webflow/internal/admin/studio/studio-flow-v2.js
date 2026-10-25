/* Studio v2: one record-backed controller for the four canonical pages. */
(function () {
  'use strict';
  const BASE = '/internal/admin/studio';
  const PATHS = { home: BASE, upload: BASE + '/upload', review: BASE + '/review', preview: BASE + '/model-preview' };
  const RECORD = /^rec[A-Za-z0-9]{14,24}$/;
  const ASSET = /^studio_[a-f0-9]{64}$/;
  const STORAGE = 'mmdStudioFlowV2';
  const MAX_FILE = 12 * 1024 * 1024;
  const errors = {
    unauthorized: 'กรุณาเข้าสู่ระบบอีกครั้ง แล้วกลับมาทำงานต่อ',
    forbidden: 'บัญชีนี้ยังเปิดงาน Studio ไม่ได้',
    not_found: 'ยังเปิดงานนี้ไม่ได้ กรุณาลองใหม่หรือตรวจเลขอ้างอิงงาน',
    model_context_unavailable: 'ยังโหลดข้อมูลนายแบบไม่ได้ กรุณาลองอีกครั้ง',
    model_not_found: 'ไม่พบชื่อนี้ในระบบ กรุณาค้นหาใหม่',
    model_context_changed: 'ข้อมูลนายแบบเปลี่ยนแล้ว กรุณากลับไปตรวจข้อมูลอีกครั้ง',
    model_context_required: 'เลือกนายแบบจากระบบก่อนยืนยันผลตรวจ',
    model_record_required: 'เลือกนายแบบจากระบบก่อนยืนยันผลตรวจ',
    identity_mismatch: 'ข้อมูลการ์ดไม่ตรงกับข้อมูลนายแบบ กรุณาโหลดข้อมูลอีกครั้ง',
    ai_generated_media_required: 'การ์ดกลุ่มนี้ต้องใช้ภาพที่ผ่านขั้นตอนปกปิดตัวตน',
    image_policy_requires_generated_media: 'การ์ดกลุ่มนี้ต้องใช้ภาพที่ผ่านขั้นตอนปกปิดตัวตน',
    checklist_required: 'ตรวจรูป ข้อมูล และสิทธิ์การใช้งานให้ครบก่อนยืนยัน',
    idempotency_conflict: 'รายการนี้มีข้อมูลบันทึกไว้แล้ว กรุณาเปิดงานล่าสุดต่อ',
    file_too_large: 'แต่ละรูปต้องมีขนาดไม่เกิน 12 MB',
    unsupported_file_type: 'ใช้ไฟล์ JPG, PNG หรือ WebP',
    image_magic_mismatch: 'รูปนี้เปิดไม่ได้ กรุณาเปลี่ยนเป็น JPG, PNG หรือ WebP',
    frame_integrity_failed: 'ยังโหลดกรอบการ์ดไม่สำเร็จ กรุณาลองอีกครั้ง',
    studio_font_timeout: 'ยังโหลดตัวอักษรไม่สำเร็จ กรุณาเปิดงานนี้อีกครั้ง',
    render_not_ready: 'ข้อมูลหรือรูปยังไม่ครบ จึงยังสร้างการ์ดไม่ได้',
    request_failed: 'ยังยืนยันผลจากระบบไม่ได้ กรุณาลองอีกครั้ง',
  };
  const $ = id => document.getElementById(id);
  const uuid = () => crypto.randomUUID();
  const clean = value => String(value ?? '').trim();
  let root, stage, refs, state, busy = false, renderVersion = 0;
  const urls = new Set();
  let originalDisabled = null;

  function readRefs() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(STORAGE) || '{}');
      return {
        intake_id: RECORD.test(raw.intake_id) ? raw.intake_id : '',
        review_id: RECORD.test(raw.review_id) ? raw.review_id : '',
        pending_intake_key: /^studio-v2:intake:[a-f0-9-]{36}$/.test(raw.pending_intake_key) ? raw.pending_intake_key : '',
        pending_review_key: /^studio-v2:review:[a-f0-9-]{36}$/.test(raw.pending_review_key) ? raw.pending_review_key : '',
      };
    } catch { return {}; }
  }
  function saveRefs() { try { sessionStorage.setItem(STORAGE, JSON.stringify(refs)); } catch {} }
  function href(next, ids = refs) {
    const url = new URL(PATHS[next], location.origin);
    if (next === 'preview' && RECORD.test(ids.review_id || '')) url.searchParams.set('review_id', ids.review_id);
    if (['upload', 'review'].includes(next) && RECORD.test(ids.intake_id || '')) url.searchParams.set('intake_id', ids.intake_id);
    return url.pathname + url.search;
  }
  function navigate(next) { location.assign(href(next)); }
  function updateSteps() {
    root.querySelectorAll('[data-sf-step]').forEach(link => {
      const next = link.dataset.sfStep;
      const available = next === 'upload' || (next === 'review' && refs.intake_id && !state.dirty) || (next === 'preview' && refs.review_id && !state.dirty);
      if (available) { link.href = href(next); link.removeAttribute('aria-disabled'); link.removeAttribute('tabindex'); }
      else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); link.setAttribute('tabindex', '-1'); }
    });
    if ($('sfEdit')) $('sfEdit').href = href('upload');
    if ($('sfBackReview')) $('sfBackReview').href = href('review');
  }
  function message(text, kind = '', focus = false) {
    const status = $('sfStatus');
    status.textContent = text;
    status.dataset.state = kind;
    status.hidden = !text;
    if (focus) status.focus({ preventScroll: false });
  }
  function explain(error) {
    const code = String(error?.message || 'request_failed');
    if (errors[code]) return errors[code];
    if (/canonical|model_context|identity/.test(code)) return 'ข้อมูลนายแบบยังไม่พร้อม กรุณาตรวจข้อมูลในระบบก่อนยืนยัน';
    if (/ai_generated|image_policy/.test(code)) return errors.ai_generated_media_required;
    if (/checklist/.test(code)) return errors.checklist_required;
    if (/asset|media|photo|image/.test(code)) return 'ยังเปิดรูปที่บันทึกไว้ไม่ได้ กรุณาลองใหม่หรือตรวจรูปต้นฉบับ';
    if (/title/.test(code)) return 'ใส่ข้อความบนการ์ดไม่เกิน 2 บรรทัด รวม 120 ตัวอักษร';
    return errors.request_failed;
  }
  function login() {
    const link = $('sfLogin');
    link.hidden = false;
    link.href = '/internal/admin/login?next=' + encodeURIComponent(href(stage));
  }
  async function api(path, body, asBlob = false) {
    const multipart = body instanceof FormData;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), multipart ? 120000 : 30000);
    try {
      const headers = multipart ? {} : { 'content-type': 'application/json', accept: 'application/json' };
      if (multipart) headers['Idempotency-Key'] = body.get('upload_key');
      const response = await fetch('/studio/api/' + path, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers,
        body: multipart ? body : JSON.stringify(body || {}), signal: controller.signal,
      });
      if (response.ok && asBlob) {
        const blob = await response.blob();
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || !blob.size || blob.size > MAX_FILE) throw new Error('media_invalid');
        return blob;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) {
        const err = Object.assign(new Error(typeof data.error === 'string' ? data.error : 'request_failed'), { status: response.status });
        if (response.status === 401) { login(); err.message = 'unauthorized'; }
        throw err;
      }
      return data;
    } finally { clearTimeout(timer); }
  }
  function lock(value) {
    busy = value;
    root.setAttribute('aria-busy', String(value));
    if (value) {
      originalDisabled = new Map();
      root.querySelectorAll('button,input,select,textarea').forEach(control => { originalDisabled.set(control, control.disabled); control.disabled = true; });
    } else if (originalDisabled) {
      originalDisabled.forEach((disabled, control) => { control.disabled = disabled; });
      originalDisabled = null;
    }
  }
  function thawForm() {
    if (!state.frozenControls) return;
    state.frozenControls.forEach((disabled, control) => { control.disabled = disabled; });
    state.frozenControls = null;
  }
  function freezeForm(form, retryButton) {
    state.frozenControls = new Map([...form.elements].map(control => [control, control.disabled]));
    [...form.elements].forEach(control => { control.disabled = true; });
    // The retry button must remain operable even inside the Review fieldset.
    if ($('sfReviewControls')) $('sfReviewControls').disabled = false;
    retryButton.disabled = false; retryButton.textContent = 'ลองบันทึกอีกครั้ง';
  }
  function field(name) { return $('sfUploadForm')?.elements.namedItem(name); }
  function value(name) { return clean(field(name)?.value); }
  function setValue(name, val) { if (field(name)) field(name).value = val ?? ''; }
  function selections(name) { return [...root.querySelectorAll('input[name="' + name + '"]:checked')].map(input => input.value); }
  function selectValues(name, values) { root.querySelectorAll('input[name="' + name + '"]').forEach(input => { input.checked = Array.isArray(values) && values.includes(input.value); }); }
  function blobUrl(blob) { const url = URL.createObjectURL(blob); urls.add(url); return url; }
  function revokePhotos() { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); }
  function invalidate() {
    state.intakeKey = ''; state.pendingIntake = null; state.rendered = false; state.dirty = true;
    refs.review_id = ''; refs.pending_review_key = ''; saveRefs(); updateSteps();
  }
  function setProgress(done, total, text) {
    const progress = $('sfProgress');
    progress.hidden = false; progress.max = total; progress.value = done;
    $('sfProgressText').textContent = text + ' · ' + Math.round(done / total * 100) + '%';
  }
  function profile() {
    const files = state.photos.map(photo => ({ asset_id: photo.asset_id || '', name: photo.name, size: photo.size, type: photo.type }));
    return {
      flow_version: 2, model_record_id: state.modelId || '', model_name: value('model_name'),
      field: value('field'), layer: value('layer'), run_number: state.context?.context?.run_number || '',
      height_cm: value('height_cm') ? Number(value('height_cm')) : null, weight_kg: value('weight_kg') ? Number(value('weight_kg')) : null,
      compcard_family: ({ ST: 'A', GY: 'B', FR: 'E', EN: 'C', EX: 'D', GWs: 'GWs', EMs: 'EMs' })[value('field')],
      visual_variant_number: Number(value('visual_variant_number')),
      title: value('title'), template_hint: 'studio-clean-frame-' + value('visual_variant_number'),
      files, main_asset_id: files[state.mainIndex]?.asset_id || '',
      audiences: selections('audience'), consent: Boolean(field('consent')?.checked),
      category: value('category'), gender: value('gender'), client_types: value('client_types'),
      drive_folder: value('drive_folder'), promotion_albums: selections('promotion_album'), note: value('note'),
      direction: value('note'), compcard_request_id: state.requestId || '',
      source_owner: state.modelId ? 'model:' + state.modelId : 'studio_operator', category_path: 'Studio',
    };
  }
  function syncIdentityControls() {
    const linked = Boolean(state.modelId);
    ['model_name', 'height_cm', 'weight_kg'].forEach(name => { if (field(name)) field(name).readOnly = linked; });
    ['field', 'layer'].forEach(name => { if (field(name)) field(name).disabled = linked; });
    const exclusive = ['GWs', 'EMs'].includes(value('field'));
    $('sfExclusive').hidden = !exclusive;
    field('title').required = exclusive;
    const variant = field('visual_variant_number');
    [...variant.options].forEach(option => { option.hidden = exclusive ? Number(option.value) !== (value('field') === 'EMs' ? 6 : 7) : Number(option.value) > 5; });
    if (exclusive) variant.value = value('field') === 'EMs' ? '6' : '7';
    else if (Number(variant.value) > 5 || !variant.value) variant.value = '1';
    variant.disabled = exclusive;
    if (!busy && !state.pendingIntake) $('sfSave').disabled = !state.authenticated || (linked && state.context?.ready !== true);
  }
  async function loadContext(id) {
    const result = await api('model-context', { model_record_id: id });
    state.modelId = id; state.context = result;
    const context = result.context || {};
    setValue('model_name', context.display_name);
    setValue('height_cm', context.height_cm); setValue('weight_kg', context.weight_kg);
    setValue('field', context.field); setValue('layer', context.layer);
    if (context.world) selectValues('audience', [context.world]);
    $('sfModelStatus').textContent = result.ready
      ? (context.model_asset_policy === 'ai_generated' ? 'ข้อมูลพร้อม · การ์ดกลุ่มนี้ใช้ภาพที่ผ่านขั้นตอนปกปิดตัวตน' : 'เลือกนายแบบแล้ว · ใช้ชื่อและข้อมูลจากระบบ')
      : 'ข้อมูลนายแบบยังไม่ครบ กรุณาตรวจข้อมูลในหน้าจัดการนายแบบก่อนยืนยันการ์ด';
    syncIdentityControls();
  }
  async function photoBlob(photo) {
    if (!photo.blob) photo.blob = await api('assets/read', { asset_id: photo.asset_id }, true);
    return photo.blob;
  }
  async function renderCard(intake, photo) {
    const version = ++renderVersion;
    state.rendered = false;
    const canvas = $('sfCanvas');
    canvas.hidden = true;
    const help = $('sfPreviewHelp'); help.hidden = false;
    if (!photo) { help.textContent = 'เลือกรูปหลัก แล้วตัวอย่างการ์ดจะแสดงที่นี่'; return; }
    const context = intake.model_context || state.context;
    if (!context?.ready) { help.textContent = 'เลือกนายแบบที่มีข้อมูลครบจากระบบ เพื่อดูตัวอย่างการ์ด'; return; }
    if (context.context?.model_asset_policy === 'ai_generated') { help.textContent = 'รูปต้นฉบับของกลุ่มนี้ต้องผ่านขั้นตอนปกปิดตัวตนก่อน ใช้ส่วน “การ์ดจากรูปโปรไฟล์” ด้านล่างเพื่อตรวจงานที่ระบบเตรียมไว้'; return; }
    help.textContent = 'กำลังสร้างตัวอย่างการ์ด…';
    try {
      const blob = await photoBlob(photo);
      if (version !== renderVersion) return;
      // Render offscreen so an older asynchronous frame cannot overwrite a newer choice.
      const buffer = document.createElement('canvas');
      if (!window.MMDStudioFlowRenderer) throw new Error('render_not_ready');
      await window.MMDStudioFlowRenderer.render(buffer, { ...intake, photo: blob });
      if (version !== renderVersion) return;
      canvas.width = buffer.width; canvas.height = buffer.height;
      canvas.getContext('2d').drawImage(buffer, 0, 0);
      canvas.hidden = false; help.hidden = true; state.rendered = true;
    } catch (error) {
      if (version === renderVersion) { help.textContent = explain(error); help.hidden = false; canvas.hidden = true; }
    }
  }
  async function renderUpload() {
    if (!state.photos.length) return renderCard(profile(), null);
    await renderCard({ ...profile(), model_context: state.context }, state.photos[state.mainIndex]);
  }
  async function thumbnails() {
    const list = $('sfThumbs'); list.replaceChildren();
    const photos = state.photos;
    photos.forEach((photo, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'sf-photo';
      button.setAttribute('aria-pressed', String(index === state.mainIndex));
      button.setAttribute('aria-label', 'ใช้รูปที่ ' + (index + 1) + ' เป็นรูปหลัก');
      const label = document.createElement('span'); label.textContent = index === state.mainIndex ? 'รูปหลัก' : 'รูปที่ ' + (index + 1);
      button.append(label); list.append(button);
      button.addEventListener('click', async () => {
        if (busy || state.pendingIntake) return;
        state.mainIndex = index; invalidate();
        [...list.children].forEach((item, i) => { item.setAttribute('aria-pressed', String(i === index)); item.querySelector('span').textContent = i === index ? 'รูปหลัก' : 'รูปที่ ' + (i + 1); });
        await renderUpload();
      });
    });
    // Bounded sequential media reads; photos remain only in this page's memory.
    for (let index = 0; index < photos.length; index++) {
      try {
        const blob = await photoBlob(photos[index]);
        if (photos !== state.photos) return;
        const img = document.createElement('img'); img.alt = ''; img.src = blobUrl(blob); img.loading = 'lazy';
        list.children[index]?.prepend(img);
      } catch { /* The main preview shows the actionable media error. */ }
    }
  }
  function sourceMode(reset = true) {
    const mode = value('source_mode');
    $('sfExisting').hidden = mode !== 'existing'; $('sfMyCard').hidden = mode !== 'mycard';
    if (!reset) return;
    invalidate(); state.modelId = ''; state.context = null; state.requestId = '';
    revokePhotos(); state.photos = []; state.mainIndex = 0; $('sfFiles').value = ''; $('sfThumbs').replaceChildren(); field('consent').checked = false;
    ['model_name', 'height_cm', 'weight_kg', 'title'].forEach(name => setValue(name, ''));
    setValue('field', ''); setValue('layer', ''); selectValues('audience', []);
    $('sfModelStatus').textContent = mode === 'new' ? 'บันทึกเป็นงานร่างได้ แล้วเชื่อมชื่อนายแบบในระบบก่อนยืนยันการ์ด' : 'ค้นหาและเลือกชื่อนายแบบของงานนี้';
    syncIdentityControls(); renderUpload();
  }
  async function searchModels() {
    if (busy) return;
    const query = clean($('sfSearch').value);
    if (query.length < 2) { message('พิมพ์ชื่ออย่างน้อย 2 ตัวอักษร'); return; }
    lock(true); message('กำลังค้นหานายแบบ…');
    try {
      const result = await api('models/search', { q: query });
      const list = $('sfModelResults'); list.replaceChildren();
      result.items.forEach(item => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'sf-button sf-button-secondary';
        button.textContent = item.display_name + (item.ready ? '' : ' · ข้อมูลยังไม่ครบ');
        button.addEventListener('click', async () => {
          if (busy) return;
          lock(true);
          try {
            if (state.modelId && state.modelId !== item.model_record_id) { revokePhotos(); state.photos = []; state.mainIndex = 0; state.requestId = ''; $('sfFiles').value = ''; $('sfThumbs').replaceChildren(); field('consent').checked = false; }
            invalidate(); await loadContext(item.model_record_id); list.replaceChildren(); message('เลือก ' + item.display_name + ' แล้ว', 'success');
          }
          catch (error) { message(explain(error), 'error', true); }
          finally { lock(false); syncIdentityControls(); await renderUpload(); }
        });
        list.append(button);
      });
      message(result.items.length ? 'เลือกชื่อที่ตรงกับงานนี้' : 'ไม่พบชื่อ ลองค้นหาใหม่หรือเลือก “นายแบบใหม่”');
    } catch (error) { message(explain(error), 'error', true); }
    finally { lock(false); syncIdentityControls(); }
  }
  async function loadRequests() {
    if (busy) return;
    lock(true); message('กำลังเปิดคำขอจากนายแบบ…');
    try {
      const result = await api('compcard-requests/list');
      const list = $('sfRequests'); list.replaceChildren();
      const requests = (result.requests || []).filter(request => !['studio_approved', 'studio_preview_ready', 'studio_rejected'].includes(request.status));
      requests.forEach(request => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'sf-button sf-button-secondary'; button.textContent = request.model_name || 'คำขอทำการ์ด';
        button.addEventListener('click', () => importRequest(request.request_id)); list.append(button);
      });
      message(requests.length ? 'เลือกคำขอที่จะทำต่อ' : 'ไม่มีคำขอที่รอทำการ์ด');
    } catch (error) { message(explain(error), 'error', true); }
    finally { lock(false); syncIdentityControls(); }
  }
  async function importRequest(id) {
    if (busy) return;
    lock(true); message('กำลังนำรูปและข้อมูลเข้ามา…');
    try {
      const result = await api('compcard-requests/import', { compcard_request_id: id });
      const blob = await api('compcard-requests/media', { compcard_request_id: id }, true);
      const modelId = clean(result.draft?.source_owner).replace(/^model:/, '');
      if (!RECORD.test(modelId)) throw new Error('model_record_required');
      invalidate(); state.requestId = id;
      await loadContext(modelId);
      revokePhotos(); state.photos = [{ blob, name: 'my-card.' + (blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1]), type: blob.type, size: blob.size, uploadKey: 'studio-v2:photo:' + uuid() }];
      state.mainIndex = 0; field('consent').checked = false;
      message('นำรูปมาแล้ว ตรวจข้อมูลและยืนยันสิทธิ์การใช้งานก่อนบันทึก', 'success');
    } catch (error) { state.requestId = ''; message(explain(error), 'error', true); }
    finally { lock(false); syncIdentityControls(); thumbnails(); await renderUpload(); }
  }
  async function selectPhotos() {
    if (busy) return;
    const files = [...$('sfFiles').files];
    if (!files.length) return;
    if (files.length > 10) { message('เลือกได้ครั้งละ 1–10 รูป', 'error', true); return; }
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > MAX_FILE)) { message('ใช้รูป JPG, PNG หรือ WebP ขนาดไม่เกิน 12 MB ต่อรูป', 'error', true); return; }
    invalidate(); revokePhotos();
    if (state.requestId) { state.requestId = ''; setValue('source_mode', state.modelId ? 'existing' : 'new'); sourceMode(false); }
    state.photos = files.map(file => ({ blob: file, name: file.name, type: file.type, size: file.size, uploadKey: 'studio-v2:photo:' + uuid() }));
    state.mainIndex = 0; field('consent').checked = false;
    message('เลือกรูปแล้ว ' + files.length + ' รูป · กดรูปที่ต้องการใช้เป็นรูปหลัก');
    thumbnails(); await renderUpload();
  }
  async function saveIntake(event) {
    event.preventDefault(); if (busy) return;
    const form = $('sfUploadForm');
    thawForm();
    if (!state.pendingIntake) {
      if (!form.reportValidity()) return;
      if (!state.photos.length) { message('เลือกรูปอย่างน้อย 1 รูปก่อนบันทึก', 'error', true); return; }
      if (!selections('audience').length) { message('เลือกฝั่งที่ใช้เก็บงานอย่างน้อย 1 ฝั่ง', 'error', true); return; }
      if (value('source_mode') !== 'new' && !state.modelId) { message('เลือกชื่อนายแบบจากรายการก่อนบันทึก', 'error', true); return; }
    }
    lock(true); let attempted = false;
    try {
      if (!state.pendingIntake) {
        const total = state.photos.length + 2;
        for (let index = 0; index < state.photos.length; index++) {
          const photo = state.photos[index];
          setProgress(index, total, 'กำลังเก็บรูป ' + (index + 1) + '/' + state.photos.length);
          if (!photo.asset_id) {
            const data = new FormData(); data.append('file', photo.blob, photo.name); data.append('upload_key', photo.uploadKey);
            const uploaded = await api('upload', data);
            if (!ASSET.test(uploaded.asset_id || '')) throw new Error('asset_upload_unconfirmed');
            photo.asset_id = uploaded.asset_id;
          }
        }
        const payload = profile();
        state.intakeKey ||= 'studio-v2:intake:' + uuid(); payload.idempotency_key = state.intakeKey;
        setProgress(state.photos.length, total, 'กำลังตรวจข้อมูล');
        await api('intake/validate', payload);
        state.pendingIntake = payload;
        refs.pending_intake_key = payload.idempotency_key; refs.review_id = ''; saveRefs();
      }
      attempted = true;
      setProgress(state.photos.length + 1, state.photos.length + 2, 'กำลังบันทึกงาน');
      const saved = await api('intake/commit', state.pendingIntake);
      if (!RECORD.test(saved.studio_intake_id || '')) throw new Error('intake_commit_unconfirmed');
      refs.intake_id = saved.studio_intake_id; refs.review_id = ''; refs.pending_intake_key = ''; refs.pending_review_key = ''; state.dirty = false; saveRefs();
      state.pendingIntake = null;
      setProgress(1, 1, 'บันทึกแล้ว'); message('บันทึกแล้ว กำลังเปิดหน้าตรวจงาน…', 'success');
      navigate('review');
    } catch (error) {
      if (!attempted || (error.status >= 400 && error.status < 500)) { state.pendingIntake = null; refs.pending_intake_key = ''; saveRefs(); }
      message(explain(error) + (state.pendingIntake ? ' กด “ลองบันทึกอีกครั้ง” เพื่อเช็กผลเดิม' : ''), 'error', true);
    } finally {
      lock(false); syncIdentityControls();
      if (state.pendingIntake) freezeForm(form, $('sfSave'));
      else $('sfSave').textContent = 'บันทึกและตรวจงาน';
    }
  }
  async function loadIntake(id) {
    const result = await api('intake/read', { studio_intake_id: id });
    const intake = result.intake;
    if (intake.flow_version !== 2) throw new Error('render_not_ready');
    refs.intake_id = intake.studio_intake_id; saveRefs(); updateSteps();
    return intake;
  }
  async function hydrateUpload(intake) {
    state.modelId = intake.model_record_id || ''; state.context = intake.model_context; state.requestId = intake.compcard_request_id || '';
    setValue('source_mode', state.requestId ? 'mycard' : state.modelId ? 'existing' : 'new'); sourceMode(false);
    ['model_name', 'field', 'layer', 'height_cm', 'weight_kg', 'visual_variant_number', 'title', 'category', 'gender', 'drive_folder', 'note'].forEach(name => setValue(name, intake[name]));
    setValue('client_types', Array.isArray(intake.client_types) ? intake.client_types[0] : intake.client_types);
    selectValues('audience', intake.audiences); selectValues('promotion_album', intake.promotion_albums);
    field('consent').checked = intake.consent === true;
    state.photos = intake.files.map(file => ({ ...file }));
    state.mainIndex = Math.max(0, state.photos.findIndex(file => file.asset_id === intake.main_asset_id));
    $('sfModelStatus').textContent = state.context?.ready ? 'ข้อมูลจากงานที่บันทึกไว้' : 'งานร่างนี้ยังต้องเชื่อมข้อมูลนายแบบก่อนยืนยันการ์ด';
    syncIdentityControls(); thumbnails(); await renderUpload();
    message('เปิดงานที่บันทึกไว้แล้ว เมื่อแก้ไขจะบันทึกเป็นฉบับใหม่เพื่อตรวจอีกครั้ง');
  }
  function summary(intake, review) {
    const container = $('sfSummary'); container.replaceChildren();
    const exclusive = ['GWs', 'EMs'].includes(intake.field);
    const rows = [['ชื่อบนการ์ด', exclusive ? intake.run_number : intake.model_name], ['ส่วนสูง / น้ำหนัก', intake.height_cm + ' / ' + intake.weight_kg], ['รูปต้นฉบับ', intake.files.length + ' รูป'], ['ฝั่งการ์ด', intake.layer?.startsWith('Public') ? 'MMD Privé' : 'SĪGIL']];
    if (review?.final_note) rows.push(['หมายเหตุจากการตรวจ', review.final_note]);
    rows.forEach(([key, val]) => { const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = key; dd.textContent = val || 'ยังไม่ระบุ'; container.append(dt, dd); });
  }
  async function prepareReview(intake) {
    state.intake = intake; state.context = intake.model_context;
    summary(intake); await renderCard(intake, intake.files.find(file => file.asset_id === intake.main_asset_id));
    $('sfReviewControls').disabled = false;
    const eligible = intake.model_context?.ready && intake.model_context.context.model_asset_policy === 'real_photo' && state.rendered;
    const decision = $('sfReviewForm').elements.namedItem('decision');
    decision.querySelector('[value="Approved Direction"]').disabled = !eligible;
    decision.value = eligible ? 'Approved Direction' : 'Needs Review';
    $('sfReviewSave').textContent = eligible ? 'ยืนยันและดูตัวอย่าง' : 'บันทึกผลตรวจ';
    message(eligible ? 'ตรวจชื่อ รูป และข้อมูลให้ครบ แล้วเลือกผลตรวจ' : 'งานนี้ยังไม่พร้อมยืนยันการ์ด บันทึกให้รอตรวจหรือกลับไปแก้ไขได้', eligible ? '' : 'warning');
  }
  async function saveReview(event) {
    event.preventDefault(); if (busy || !state.intake) return;
    const form = $('sfReviewForm');
    thawForm();
    const decision = form.elements.namedItem('decision').value;
    const checklist = Object.fromEntries(['identity', 'photo', 'safe'].map(key => [key, form.elements.namedItem(key).checked]));
    if (!state.pendingReview && decision === 'Approved Direction' && (!state.rendered || Object.values(checklist).some(value => !value))) { message('ตรวจทั้ง 3 ข้อให้ครบก่อนยืนยัน', 'error', true); return; }
    if (!form.reportValidity()) return;
    lock(true);
    try {
      if (!state.pendingReview) {
        state.pendingReview = { flow_version: 2, studio_intake_id: refs.intake_id, decision, checklist, final_note: clean(form.elements.namedItem('final_note').value), idempotency_key: 'studio-v2:review:' + uuid() };
        await api('review/validate', state.pendingReview);
        refs.pending_review_key = state.pendingReview.idempotency_key; saveRefs();
      }
      const saved = await api('review/commit', state.pendingReview);
      if (!RECORD.test(saved.studio_review_id || '')) throw new Error('review_commit_unconfirmed');
      const approved = state.pendingReview.decision === 'Approved Direction';
      refs.review_id = approved ? saved.studio_review_id : ''; refs.pending_review_key = ''; saveRefs(); state.pendingReview = null;
      updateSteps();
      if (approved) { message('บันทึกผลตรวจแล้ว กำลังเปิดตัวอย่างสุดท้าย…', 'success'); navigate('preview'); }
      else message('บันทึกผลตรวจแล้ว งานยังรอตรวจหรือแก้ไข', 'success');
    } catch (error) {
      if (error.status >= 400 && error.status < 500) { state.pendingReview = null; refs.pending_review_key = ''; saveRefs(); }
      message(explain(error) + (state.pendingReview ? ' กดปุ่มเดิมเพื่อตรวจผลการบันทึกอีกครั้ง' : ''), 'error', true);
    } finally {
      lock(false);
      if (state.pendingReview) freezeForm(form, $('sfReviewSave'));
      else $('sfReviewSave').textContent = form.elements.namedItem('decision').value === 'Approved Direction' ? 'ยืนยันและดูตัวอย่าง' : 'บันทึกผลตรวจ';
    }
  }
  async function showFinal(id) {
    const result = await api('review/read', { studio_review_id: id });
    const review = result.review; const intake = review.intake_snapshot;
    if (review.flow_version !== 2 || review.decision !== 'Approved Direction' || result.preview_ready !== true || !intake) {
      $('sfFinalStatus').textContent = 'งานนี้ยังไม่พร้อมดาวน์โหลด';
      throw new Error('render_not_ready');
    }
    state.intake = intake; state.context = intake.model_context;
    refs.review_id = review.studio_review_id; refs.intake_id = review.studio_intake_id; saveRefs(); updateSteps();
    summary(intake, review); await renderCard(intake, intake.files.find(file => file.asset_id === intake.main_asset_id));
    $('sfDownload').disabled = !state.rendered;
    $('sfFinalStatus').textContent = state.rendered ? 'ผ่านการตรวจแล้ว · พร้อมดาวน์โหลดการ์ด' : 'กำลังรอรูปหรือกรอบการ์ด';
    message(state.rendered ? 'ตัวอย่างนี้ตรงกับงานที่บันทึกผลตรวจไว้' : 'ยังแสดงการ์ดไม่ครบ กรุณาลองเปิดงานอีกครั้ง', state.rendered ? 'success' : 'warning');
  }
  async function recoverPending() {
    if (refs.pending_review_key) {
      try {
        const result = await api('review/read', { idempotency_key: refs.pending_review_key });
        refs.intake_id = result.review.studio_intake_id;
        refs.review_id = result.review.decision === 'Approved Direction' ? result.review.studio_review_id : '';
        refs.pending_review_key = ''; saveRefs();
      } catch (error) { if (error.status === 404) { refs.pending_review_key = ''; saveRefs(); } else throw error; }
    }
    if (refs.pending_intake_key) {
      try {
        const result = await api('intake/read', { idempotency_key: refs.pending_intake_key });
        refs.intake_id = result.intake.studio_intake_id; refs.review_id = ''; refs.pending_intake_key = ''; saveRefs();
      } catch (error) { if (error.status === 404) { refs.pending_intake_key = ''; saveRefs(); } else throw error; }
    }
  }
  function bindUpload() {
    $('sfUploadForm').addEventListener('submit', saveIntake);
    field('source_mode').addEventListener('change', () => sourceMode());
    $('sfSearchButton').addEventListener('click', searchModels);
    $('sfSearch').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); searchModels(); } });
    $('sfRequestsRefresh').addEventListener('click', loadRequests);
    $('sfFiles').addEventListener('change', selectPhotos);
    $('sfUploadForm').addEventListener('change', event => {
      if (event.target.id === 'sfFiles' || event.target.name === 'source_mode' || state.pendingIntake) return;
      invalidate(); syncIdentityControls(); renderUpload();
    });
    sourceMode(false); syncIdentityControls();
  }
  async function boot() {
    root = document.querySelector('#studioFlow[data-studio-flow]');
    if (!root || root.dataset.mounted === 'true') return;
    root.dataset.mounted = 'true'; stage = root.dataset.stage;
    if (!PATHS[stage]) return;
    refs = readRefs(); state = { photos: [], mainIndex: 0, modelId: '', context: null, requestId: '', rendered: false };
    const query = new URLSearchParams(location.search);
    if (stage === 'upload' && query.get('new') === '1') { refs = {}; saveRefs(); history.replaceState(null, '', PATHS.upload); }
    const explicitIntake = RECORD.test(query.get('intake_id') || '');
    const explicitReview = RECORD.test(query.get('review_id') || '');
    if (explicitIntake) { refs.intake_id = query.get('intake_id'); refs.review_id = ''; }
    if (explicitReview) refs.review_id = query.get('review_id');
    if (explicitIntake || explicitReview) { refs.pending_intake_key = ''; refs.pending_review_key = ''; }
    saveRefs(); updateSteps();
    if (stage === 'upload') bindUpload();
    if (stage === 'review') {
      $('sfReviewForm').addEventListener('submit', saveReview);
      $('sfReviewForm').elements.namedItem('decision').addEventListener('change', event => {
        $('sfReviewSave').textContent = event.target.value === 'Approved Direction' ? 'ยืนยันและดูตัวอย่าง' : 'บันทึกผลตรวจ';
        $('sfReviewForm').elements.namedItem('final_note').required = ['Revise Source', 'Reject'].includes(event.target.value);
      });
    }
    if (stage === 'preview') $('sfDownload').addEventListener('click', async () => {
      if (busy || !state.rendered) return;
      lock(true);
      try {
        // Recheck current approval/identity immediately before export.
        const result = await api('review/read', { studio_review_id: refs.review_id });
        if (result.preview_ready !== true) { state.rendered = false; throw new Error('model_context_changed'); }
        const blob = await new Promise(resolve => $('sfCanvas').toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('render_not_ready');
        const url = blobUrl(blob), link = document.createElement('a');
        const name = ['GWs', 'EMs'].includes(state.intake.field) ? state.intake.run_number : state.intake.model_name;
        link.href = url; link.download = clean(name).replace(/[\\/:*?"<>|]/g, '_') + '-card.png'; document.body.append(link); link.click(); link.remove();
        setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 10000);
        message('ดาวน์โหลดการ์ดแล้ว', 'success');
      } catch (error) { message(explain(error), 'error', true); }
      finally { lock(false); $('sfDownload').disabled = !state.rendered; }
    });
    lock(true); message('กำลังเปิดงาน…');
    try {
      const auth = await fetch('/v1/admin/auth/me', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
      const session = await auth.json().catch(() => ({}));
      if (!auth.ok || session.ok !== true || !(session.authenticated === true || session.data?.authenticated === true)) { login(); throw new Error('unauthorized'); }
      state.authenticated = true;
      // A directly opened work link always wins over another tab's interrupted job.
      if (!explicitIntake && !explicitReview) await recoverPending();
      updateSteps();
      if (stage === 'home') {
        $('sfResume').hidden = !refs.intake_id && !refs.review_id;
        $('sfResume').addEventListener('click', () => navigate(refs.review_id ? 'preview' : 'review'));
        message('');
      } else if (stage === 'upload') {
        if (refs.intake_id) await hydrateUpload(await loadIntake(refs.intake_id));
        else message('เลือกนายแบบและรูปที่จะใช้ แล้วบันทึกเพื่อตรวจงาน');
      } else if (stage === 'review') {
        if (!refs.intake_id) { message('ยังไม่มีงานให้ตรวจ เริ่มจากเลือกรูปและบันทึกงานก่อน', 'warning'); }
        else await prepareReview(await loadIntake(refs.intake_id));
      } else if (stage === 'preview') {
        if (!refs.review_id) { $('sfFinalStatus').textContent = 'ยังไม่มีงานที่ผ่านการตรวจ'; message('ตรวจงานและยืนยันผลก่อนเปิดตัวอย่างสุดท้าย', 'warning'); }
        else await showFinal(refs.review_id);
      }
    } catch (error) { message(explain(error), 'error', true); }
    finally {
      // Async setup owns these terminal states, rather than the pre-load disabled snapshot.
      const reviewReady = stage === 'review' && Boolean(state.intake);
      const downloadReady = stage === 'preview' && state.rendered;
      lock(false);
      if (stage === 'upload') syncIdentityControls();
      if (stage === 'review') $('sfReviewControls').disabled = !reviewReady;
      if (stage === 'preview') $('sfDownload').disabled = !downloadReady;
    }
  }
  window.addEventListener('pagehide', () => { ++renderVersion; revokePhotos(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
