(function myModelWorkspace(global) {
  'use strict';
  const REVIEW = /identity_review|pending_review|ambiguous|current_session_review_required/;
  function classify(error) {
    const code = String(error?.message || error?.error || '');
    if (REVIEW.test(code)) return 'review';
    if (/model_not_linked|model_not_found|verified_unlinked/.test(code)) return 'unlinked';
    if (error?.status === 401 || /model_session_(required|invalid|expired)|invalid_line|id_token/.test(code)) return 'login';
    if (error?.status === 403) return 'denied';
    return 'unavailable';
  }
  function world(payload, expected = '') {
    const session = payload?.session;
    if (payload?.ok !== true || !session?.session_id || (expected && expected !== session.session_id)) return 'public';
    const lanes = [session.model_work_lane, session.payout_terms?.money_lane].filter(Boolean);
    return lanes.length && lanes.every(lane => lane === 'private_model') ? 'private' : 'public';
  }
  function safeUrl(value, origin, host = '') {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, origin);
      return url.protocol === 'https:' && !url.username && !url.password && (!host || url.hostname === host) ? url.href : '';
    } catch { return ''; }
  }
  function miniAppLink(search = '', flow = 'verify') {
    const input = new URLSearchParams(search), url = new URL('https://miniapp.line.me/2010864854-N34SgCqq/');
    url.searchParams.set('flow', flow);
    // Carry only the existing server-gated Broadcast contract, never arbitrary next/return_to.
    const id = input.get('job_id') || '';
    if (input.get('intent') === 'job_board' && /^[A-Za-z0-9_-]{1,160}$/.test(id)) {
      url.searchParams.set('intent', 'job_board');
      url.searchParams.set('job_id', id);
      url.searchParams.set('next', 'https://sigil.mmdbkk.com/public/api/jobs/' + encodeURIComponent(id));
    }
    return url.href;
  }
  function profilePatch(form) {
    const result = {
      languages: Array.from(form.querySelectorAll('input[name=languages]:checked'), item => item.value),
      skills_summary: form.elements.skills_summary.value.trim(),
      experience_summary: form.elements.experience_summary.value.trim(),
      availability_status: form.elements.availability_status.value,
      available_now: form.elements.available_now.checked,
    };
    for (const key of ['height_cm', 'weight_kg']) {
      const value = form.elements[key].value.trim();
      // Empty optional numeric inputs must not become zero or silently clear existing data.
      if (value) result[key] = Number(value);
    }
    return result;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { classify, world, safeUrl, miniAppLink, profilePatch };
  if (!global.document) return;
  const document = global.document, root = document.getElementById('mmd-model-home-v4');
  if (!root || root.dataset.bundleReady) return;
  // CSS hiding is not retirement: saved footer/site loaders still bind to v3.
  // Remove its root before those later scripts can subscribe or read Model APIs.
  document.getElementById('mmd-model-home-v3')?.remove();
  root.dataset.bundleReady = '1';
  const q = selector => root.querySelector(selector);
  const text = (selector, value) => { const node = q(selector); if (node) node.textContent = value; };
  const form = q('[data-mss-profile-form]'), workspace = q('[data-mm-workspace]');
  let profile = null, busy = false, savingProfile = null, alive = true, jobSession = null, jobGeneration = 0, acknowledging = false;
  const controllers = new Set();
  async function request(path, options = {}) {
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await global.fetch(path, { credentials: 'include', cache: 'no-store', ...options, signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true) throw Object.assign(new Error(data?.error || 'request_failed'), { status: response.status });
      if (!alive) throw new Error('page_closed');
      return data;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  function status(title, copy) {
    text('#mmverify-title', title); text('[data-mm-copy]', copy);
  }
  function clearJob() {
    if(typeof renderModelJobBrief==='function')renderModelJobBrief(root,null);
    jobSession = null;
    q('[data-mm-reconfirm]').hidden = true;
    q('[data-mm-reconfirm-ack]').disabled = true;
    text('[data-mm-reconfirm-time]', ''); text('[data-mm-reconfirm-location]', ''); text('[data-mm-reconfirm-status]', '');
    root.dataset.modelBrandLane = 'public';
    const expected = new URLSearchParams(global.location.search).get('session_id');
    const previous = new URL(q('[data-mm-console]').href || '/sigil/model/console', global.location.origin).searchParams.get('session_id');
    q('[data-mm-console]').href = expected || previous ? consoleHref(expected || previous) : '/sigil/model/console';
    text('[data-mm-job]', 'ยังตรวจงานไม่สำเร็จ');
    text('[data-mm-job-copy]', 'ยังสรุปไม่ได้ว่าไม่มีงาน ลองตรวจอีกครั้งหรือให้ MMD ช่วย');
  }
  function consoleHref(sessionId) {
    const params = new URLSearchParams(global.location.search);
    const url = new URL('/sigil/model/console', global.location.origin);
    if (params.get('t')) url.searchParams.set('t', params.get('t'));
    // Navigation context only. The backend still decides ownership and actions.
    url.searchParams.set('session_id', sessionId);
    return url.href;
  }
  function locked(error) {
    jobGeneration += 1;
    profile = null; workspace.hidden = true; form.reset();
    q('[data-mm-gallery]').replaceChildren();
    global.dispatchEvent(new CustomEvent('mmd:model-workspace-locked'));
    clearJob(); text('[data-mm-name]', ''); q('[data-mm-avatar]').removeAttribute('src');
    q('[data-mm-avatar]').hidden = true; q('[data-mm-primary]').hidden = false;
    q('[data-mm-apply]').hidden = true;
    const kind = classify(error), copy = {
      review: ['รอ MMD ตรวจสอบ', 'ทีมจะตรวจและเชื่อมข้อมูลเดิมให้ ไม่ต้องสมัครซ้ำ'],
      unlinked: ['LINE นี้ยังไม่ได้เชื่อมข้อมูล Model', 'เคยทำงานแล้ว ให้ MMD ช่วยเชื่อมข้อมูลเดิม หรือสมัครเมื่อยังไม่เคยสมัคร'],
      login: ['ยืนยันบัญชี MY MODEL', 'กดยืนยันผ่าน LINE เพื่อเปิดบัญชีเดิมของคุณ'],
      denied: ['บัญชีนี้ยังไม่มีสิทธิ์เปิดส่วนนี้', 'ให้ MMD ตรวจสิทธิ์ก่อน โดยไม่ต้องสมัครซ้ำ'],
      unavailable: ['ระบบยังตรวจบัญชีไม่สำเร็จ', 'ยังสรุปไม่ได้ว่าไม่มีข้อมูล ลองตรวจอีกครั้งหรือให้ MMD ช่วย'],
    }[kind];
    status(...copy);
    q('[data-mm-primary]').hidden = !['login', 'unlinked'].includes(kind);
    q('[data-mm-apply]').hidden = kind !== 'unlinked';
    text('[data-mm-auth]', kind === 'login' ? 'รอยืนยัน LINE' : 'ยังเปิดพื้นที่ส่วนตัวไม่ได้');
  }
  function fill(model) {
    profile = model; workspace.hidden = false;
    q('[data-mss-save]').disabled = false;
    text('[data-mm-save-status]', '');
    q('[data-mm-primary]').hidden = true; q('[data-mm-apply]').hidden = true;
    status('บัญชี MY MODEL เชื่อมแล้ว', 'อัปเดตโปรไฟล์และสถานะรับงานได้ แม้ยังไม่มีงานปัจจุบัน');
    text('[data-mm-auth]', 'บัญชีเชื่อมแล้ว · สถานะความพร้อมตรวจแยกตามรายการ');
    text('[data-mm-name]', model.working_name || 'โปรไฟล์ของฉัน');
    text('[data-mm-availability]', model.available_now ? 'พร้อมรับงานตอนนี้' : ({available:'พร้อมรับงาน', busy:'ไม่สะดวกตอนนี้', vacation:'พัก / ไม่อยู่'}[model.availability_status] || 'ยังไม่ระบุ'));
    text('[data-mm-line]', model.readiness?.line_identity_verified === true ? 'ยืนยันแล้ว' : 'ยังต้องตรวจสอบ');
    text('[data-mm-telegram]', model.telegram_connected === true ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม');
    q('[data-mm-telegram-connect]').hidden = model.telegram_connected === true;
    const avatar = q('[data-mm-avatar]'), src = safeUrl(model.current_profile_image_url || '', global.location.origin);
    avatar.hidden = !src; if (src) avatar.src = src; else avatar.removeAttribute('src');
    for (const key of ['height_cm', 'weight_kg', 'skills_summary', 'experience_summary', 'availability_status']) form.elements[key].value = model[key] ?? '';
    form.elements.available_now.checked = model.available_now === true;
    form.querySelectorAll('input[name=languages]').forEach(input => { input.checked = (model.languages || []).includes(input.value); });
    text('[data-mss-rate]', model.minimum_rate_90m ? new Intl.NumberFormat('th-TH', {style:'currency',currency:'THB',maximumFractionDigits:0}).format(model.minimum_rate_90m) : '—');
    global.dispatchEvent(new CustomEvent('mmd:model-profile-ready', { detail: { ok: true } }));
  }
  const reconfirmAction = 'acknowledge_reconfirm';
  function reconfirmed(session) {
    return session?.reconfirm?.status === 'acknowledged' && Number.isFinite(Date.parse(session.reconfirm.acknowledged_at));
  }
  function canReconfirm(session) {
    return ['confirmed','accepted'].includes(session?.normalized_state || session?.state) && ['scheduled','pending','overdue'].includes(session.reconfirm?.status) &&
      Array.isArray(session.allowed_actions) && session.allowed_actions.includes(reconfirmAction);
  }
  function jobFingerprint(session) {
    return JSON.stringify([session?.session_id,session?.job_date,session?.start_time,session?.end_time,session?.location_name,
      session?.job_type,session?.reconfirm?.required_at,session?.reconfirm?.notified_at]);
  }
  function renderReconfirm(session) {
    const panel=q('[data-mm-reconfirm]'), button=q('[data-mm-reconfirm-ack]');
    const eligible=['confirmed','accepted'].includes(session?.normalized_state || session?.state) && session.reconfirm && (canReconfirm(session) || reconfirmed(session));
    panel.hidden=!eligible; button.disabled=acknowledging || !canReconfirm(session);
    if(!eligible)return;
    const start=String(session.start_time||''), date=new Date(start.includes('T')?start:session.job_date);
    const dateText=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',...(start.includes('T')?{timeStyle:'short'}:{})}).format(date):session.job_date||'';
    text('[data-mm-reconfirm-time]',[dateText,!start.includes('T')?start:''].filter(Boolean).join(' · ')||'ยังไม่ระบุ');
    text('[data-mm-reconfirm-location]', session.location_name || 'ยังไม่ระบุ');
    button.textContent=reconfirmed(session)?'รับทราบแล้ว':'รับทราบงานแล้ว';
    text('[data-mm-reconfirm-status]',reconfirmed(session)?'ระบบบันทึกการรับทราบแล้วครับ':acknowledging?'กำลังยืนยันกับระบบ…':session.reconfirm.status==='overdue'?'เลยเวลารับทราบแล้ว เปอร์จะช่วยตรวจสอบครับ':'ตรวจรายละเอียดงานให้ครบ แล้วกดรับทราบครับ');
  }
  function showJob(data) {
    const session=data.session,params=new URLSearchParams(global.location.search);
    jobSession=session;
    if(typeof renderModelJobBrief==='function')renderModelJobBrief(root,session);
    root.dataset.modelBrandLane=world(data,params.get('session_id')||'');
    text('[data-mm-job]', 'มีงานของคุณใน Console');
    text('[data-mm-job-copy]', 'ดูบรีฟ ยอดเงินถึงตัวคุณ และอัปเดตตามขั้นตอนจริงใน Console');
    const link=new URL('/sigil/model/console',global.location.origin);
    if(params.get('t'))link.searchParams.set('t',params.get('t'));
    q('[data-mm-console]').href=consoleHref(session.session_id);
    renderReconfirm(session);
    global.dispatchEvent(new CustomEvent('mmd:model-session-ready',{detail:data}));
  }
  async function currentJob() {
    const generation=++jobGeneration,identity=profile;
    clearJob();
    const params = new URLSearchParams(global.location.search), url = new URL('/v1/model/session/current', global.location.origin);
    if (params.get('t')) url.searchParams.set('t', params.get('t'));
    try {
      const data = await request(url.href), session = data.session;
      if(generation!==jobGeneration || profile!==identity)return;
      if (!session?.session_id || (params.get('session_id') && params.get('session_id') !== session.session_id)) throw new Error('current_session_review_required');
      showJob(data);
    } catch (error) {
      if(generation!==jobGeneration || profile!==identity)return;
      const noJob = error.status === 404 && ['session_not_found', 'active_session_not_found'].includes(error.message);
      if (noJob && !params.get('session_id')) {
        q('[data-mm-console]').href = '/sigil/model/console';
        text('[data-mm-job]', 'ยังไม่มีงานที่กำลังใช้งาน');
        text('[data-mm-job-copy]', 'บัญชีเชื่อมแล้ว จัดการโปรไฟล์หรือเปิด Jobs Today ต่อได้');
      } else if (noJob || classify(error) === 'review') {
        text('[data-mm-job]', 'MMD กำลังตรวจข้อมูลงาน');
        text('[data-mm-job-copy]', 'ยังไม่เลือกงานให้อัตโนมัติ ให้ MMD ตรวจข้อมูลที่กำกวมก่อน');
      } else if (classify(error) === 'login') locked(error);
    }
  }
  q('[data-mm-reconfirm-ack]').addEventListener('click',async()=>{
    if(acknowledging || busy || !profile || !alive || !canReconfirm(jobSession))return;
    const session=jobSession,identity=profile,generation=jobGeneration;
    const current=()=>alive && profile===identity && jobGeneration===generation && jobSession===session;
    acknowledging=true;renderReconfirm(session);
    try {
      const params=new URLSearchParams(global.location.search),url=new URL('/v1/model/session/current',global.location.origin);
      if(params.get('t'))url.searchParams.set('t',params.get('t'));
      const fresh=await request(url.href);
      if(!current())return;
      if(fresh.session?.session_id!==session.session_id)throw new Error('session_mismatch');
      if(reconfirmed(fresh.session)){showJob(fresh);return;}
      if(!canReconfirm(fresh.session) || jobFingerprint(fresh.session)!==jobFingerprint(session))throw new Error('reconfirm_snapshot_changed');
      const body={action:reconfirmAction,session_id:session.session_id};
      if(params.get('t'))body.t=params.get('t');
      const saved=await request('/v1/model/session/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!current())return;
      if(saved.session?.session_id!==session.session_id || !reconfirmed(saved.session))throw new Error('reconfirm_acknowledgement_unconfirmed');
      showJob(saved);
    } catch(error) {
      if(!current())return;
      if(['login','denied'].includes(classify(error)))locked(error);
      else {clearJob();text('[data-mm-job-copy]','ยังยืนยันการรับทราบไม่ได้ กดตรวจสถานะอีกครั้งก่อนลองใหม่ครับ');}
    } finally {acknowledging=false;if(alive&&profile===identity&&jobSession)renderReconfirm(jobSession);}
  });
  async function boot() {
    if (busy || !alive) return; busy = true; q('[data-mm-refresh]').disabled = true;
    try {
      status('กำลังตรวจบัญชี', 'กำลังอ่านข้อมูลจาก MMD');
      let data;
      try { data = await request('/v1/model/profile'); }
      catch (error) {
        if (classify(error) !== 'login') throw error;
        // Only the registered apex Dashboard initializes LIFF. No automatic login redirect.
        if (global.location.origin !== 'https://mmdbkk.com') {
          locked(error); q('[data-mm-primary]').href = 'https://mmdbkk.com/sigil/model/dashboard'; return;
        }
        const sdk = global.liff; if (!sdk) throw new Error('line_sdk_unavailable');
        let timer;
        try { await Promise.race([sdk.init({liffId:'2010864854-N34SgCqq'}), new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('line_init_timeout')), 12000);})]); }
        finally { clearTimeout(timer); }
        if (!sdk.isLoggedIn()) { locked(error); return; }
        const idToken = sdk.getIDToken(); if (!idToken) throw Object.assign(new Error('id_token_unavailable'), {status:401});
        const exchange = await request('/v1/model/liff/exchange', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idToken,environment:'published'})});
        if (REVIEW.test(exchange.state || '')) throw new Error(exchange.state);
        data = await request('/v1/model/profile');
      }
      if (REVIEW.test(data.state || '')) throw new Error(data.state);
      if (!data.model || typeof data.model !== 'object') throw new Error('profile_invalid');
      fill(data.model); await currentJob();
    } catch (error) { if (alive) locked(error); }
    finally { busy = false; q('[data-mm-refresh]').disabled = false; }
  }
  async function gallery() {
    if (!profile || !alive) return;
    const identity = profile;
    const host = q('[data-mm-gallery]');
    try {
      const data = await request('/v1/model/media');
      if (profile !== identity) return;
      host.replaceChildren();
      const publicMedia = (data.media || []).filter(media => ['profile_photo','public_gallery','intro_video'].includes(media.media_type) && media.self_managed === true);
      if (!publicMedia.length) { host.textContent = 'ยังไม่มีรูปหรือคลิป Public ในรายการนี้'; return; }
      for (const media of publicMedia) {
        const card = document.createElement('article'), label = document.createElement('p');
        label.textContent = (media.media_type === 'intro_video' ? 'คลิป Public' : 'รูป Public') + ' · ' + (media.review_status || 'รอตรวจ');
        card.append(label);
        const src = safeUrl(media.preview_url || '', global.location.origin);
        if (src) {
          const image = document.createElement(media.media_type === 'intro_video' ? 'video' : 'img'); image.src = src;
          if (image.tagName === 'VIDEO') { image.controls = true; image.preload = 'metadata'; } else { image.alt = 'รูป Public ของฉัน'; image.loading = 'lazy'; }
          card.append(image);
        }
        const actions = media.can_request_main === true && media.media_type !== 'intro_video' ? [['ขอใช้เป็นรูปหลัก', 'set-main', 'POST']] : [];
        if (media.can_delete === true) actions.push(['ลบรายการนี้', 'delete', 'DELETE']);
        for (const [label, action, method] of actions) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
          button.addEventListener('click', async () => {
            button.disabled = true;
            try { await request('/v1/model/media/' + encodeURIComponent(media.media_id) + '/' + action, {method}); text('[data-mm-save-status]', 'ส่งคำขอแล้ว'); await gallery(); }
            catch { text('[data-mm-save-status]', 'ยังทำรายการไม่ได้ ลองตรวจสถานะก่อนทำอีกครั้ง'); }
            finally { button.disabled = false; }
          }); card.append(button);
        }
        host.append(card);
      }
    } catch (error) {
      if (profile !== identity) return;
      if (['login','denied'].includes(classify(error))) locked(error);
      else host.textContent = 'ยังอ่านรายการรูปและคลิปไม่สำเร็จ กดตรวจสถานะเพื่อลองใหม่';
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!profile) {
      text('[data-mm-save-status]', 'ยังไม่เชื่อม · ตรวจสถานะบัญชี');
      q('[data-mm-refresh]').focus();
      return;
    }
    const identity = profile;
    if (savingProfile === identity) return;
    const current = () => alive && profile === identity;
    const button = q('[data-mss-save]'); button.disabled = true;
    savingProfile = identity;
    text('[data-mm-save-status]', 'กำลังบันทึก');
    try {
      const data = await request('/v1/model/profile', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(profilePatch(form))});
      if (!current()) return;
      if (!data.model) throw new Error('profile_invalid');
      fill(data.model);
      text('[data-mm-save-status]', data.review_required === true ? 'บันทึกแล้ว · รอตรวจ' : 'บันทึกสำเร็จ');
    } catch (error) {
      if (!current()) return;
      if (['login','denied'].includes(classify(error))) locked(error);
      text('[data-mm-save-status]', classify(error) === 'login' ? 'หมดเวลา · ตรวจ LINE' : error?.status === 400 ? 'ข้อมูลไม่ถูกต้อง · ตรวจใหม่' : 'บันทึกไม่ได้ · ตรวจสถานะ ลองใหม่');
    } finally {
      if (savingProfile === identity) savingProfile = null;
      if (current()) button.disabled = false;
    }
  });
  q('[data-mm-telegram-connect]').addEventListener('click', async event => {
    if (!profile) return; const button = event.currentTarget; button.disabled = true;
    try {
      const data = await request('/v1/model/telegram/bind', {method:'POST'}), url = safeUrl(data.connect_url || '', global.location.origin, 't.me');
      if (!url) throw new Error('telegram_connect_url_invalid'); global.location.assign(url);
    } catch { text('[data-mm-save-status]', 'ยังเปิด Telegram ไม่สำเร็จ ตรวจสถานะแล้วลองอีกครั้ง'); }
    finally { button.disabled = false; }
  });
  q('[data-mm-primary]').href = miniAppLink(global.location.search);
  q('[data-mm-apply]').href = miniAppLink(global.location.search, 'apply');
  q('[data-mm-refresh]').addEventListener('click', boot);
  global.addEventListener('mmd:model-profile-ready', gallery);
  global.addEventListener('mmd:model-media-updated', gallery);
  global.addEventListener('pagehide', () => {alive = false; controllers.forEach(controller => controller.abort());});
  global.addEventListener('pageshow', event => {if (event.persisted) {alive = true; boot();}});
  document.title = 'MY MODEL · พื้นที่ของคุณ';
  boot();
})(typeof window === 'undefined' ? globalThis : window);
