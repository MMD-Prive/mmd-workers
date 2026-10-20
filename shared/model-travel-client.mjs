import { travelClock } from './model-travel-eta.mjs';

// Self-contained DOM client; embedded into the existing owners, with no login,
// global fetch interception, duplicate LIFF bootstrap or additional image SDK.
export function mountTravelPanel(host, options) {
  const previous = host._mmdTravel;
  if (!options.sessionId) { previous?.destroy(); return; }
  if (previous?.sessionId === options.sessionId) { previous.update(options); return previous; }
  previous?.destroy();
  const role = options.role, sessionId = options.sessionId;
  const base = role === 'model' ? '/v1/model/session/travel' : '/api/member/app/session/travel';
  const pendingKey = 'mmd-travel-pending:' + sessionId;
  let data, anchor, lang = options.locale || 'th', stopped = false, busy = false, failures = 0, sequence = 0;
  let pollTimer, tickTimer, readAbort, files = [], pending = null;
  const controllers = new Set();
  const copy = () => ({
    th: { _trtitle: 'การเดินทาง', _trdetails: 'แจ้งลูกค้า', _treta: 'ปรับเวลาถึง (1–240 นาที)', _tretaSave: 'บันทึกเวลาถึง', _trtext: 'ข้อความเพิ่มเติม (ไม่เกิน 500 ตัวอักษร)', _trphoto: 'เพิ่มภาพ', _trsend: 'ส่งให้ลูกค้า', _trretry: 'ลองใหม่', _trsync: 'อัปเดตไม่สำเร็จ ข้อมูลอาจเปลี่ยน กรุณาลองใหม่', _trsaved: 'บันทึกแล้ว', _trdelivered: 'LINE รับการแจ้งเตือนแล้ว', _trdeliveryPending: 'ยังยืนยันการแจ้ง LINE ไม่ได้', _trfailure: 'ยังยืนยันผลไม่ได้ เก็บรายการเดิมไว้ กรุณาลองใหม่', _trunsupported: 'เปิดภาพนี้ไม่ได้ กรุณาเลือก JPEG, PNG หรือ WebP', _trremove: 'เอาภาพออก', _trclose: 'ปิด', _trresume: 'บันทึกรายการค้าง', _trcancel: 'ยกเลิกรายการค้าง', _trpending: 'มีรายการค้าง กรุณาลองบันทึก หรือยกเลิกก่อนสร้างรายการใหม่', _trremark: 'ใช้แจ้งการเดินทางหรือสอบถามลูกค้าเมื่อจำเป็นเกี่ยวกับงานนี้เท่านั้น กรุณาไม่ระบุข้อมูลติดต่อส่วนตัว เช่น เบอร์โทร LINE ID หรือบัญชีโซเชียล รวมถึงข้อมูลติดต่อที่ปรากฏในภาพ', _trremaining: (m,p) => `ส่งข้อความได้อีก ${m} ครั้ง · ส่งภาพได้อีก ${p} รูป`, _trat: 'เวลาที่โมเดลแจ้ง · ประมาณ ', _trupdated: 'อัปเดตล่าสุด ', _trquota: 'จำนวนเกินสิทธิ์ที่เหลือ กรุณาตรวจอีกครั้ง' },
    en: { _trtitle: 'Travel', _trdetails: 'Update the customer', _treta: 'Arrival estimate (1–240 minutes)', _tretaSave: 'Save arrival estimate', _trtext: 'Additional message (up to 500 characters)', _trphoto: 'Add photos', _trsend: 'Send to customer', _trretry: 'Try again', _trsync: 'Refresh failed. Information may have changed. Try again.', _trsaved: 'Saved', _trdelivered: 'LINE accepted the notification', _trdeliveryPending: 'LINE delivery is not confirmed', _trfailure: 'Result not confirmed. Your draft is retained. Retry this submission.', _trunsupported: 'Cannot open this image. Choose JPEG, PNG or WebP.', _trremove: 'Remove photo', _trclose: 'Close', _trresume: 'Save pending submission', _trcancel: 'Cancel pending submission', _trpending: 'A submission is pending. Retry or cancel it before creating another.', _trremark: 'Use only for travel updates or necessary questions about this job. Do not include personal contact details, such as phone numbers, LINE IDs or social accounts, including contact details visible in photos.', _trremaining: (m,p) => `${m} messages and ${p} photos remaining`, _trat: 'Estimate provided by the model · around ', _trupdated: 'Last updated ', _trquota: 'This exceeds the remaining allowance. Check again.' },
    zh: { _trtitle: '行程', _trdetails: '通知客户', _treta: '预计到达（1–240 分钟）', _tretaSave: '保存预计时间', _trtext: '补充消息（最多 500 个字符）', _trphoto: '添加照片', _trsend: '发送给客户', _trretry: '重试', _trsync: '更新失败，信息可能已变化，请重试', _trsaved: '已保存', _trdelivered: 'LINE 已接受通知', _trdeliveryPending: '尚未确认 LINE 通知结果', _trfailure: '尚未确认结果，草稿已保留，请重试原提交', _trunsupported: '无法打开图片，请选择 JPEG、PNG 或 WebP', _trremove: '移除照片', _trclose: '关闭', _trresume: '保存待处理提交', _trcancel: '取消待处理提交', _trpending: '存在待处理提交，请先重试或取消', _trremark: '仅用于本次工作的行程通知或必要询问。请勿提供电话号码、LINE ID 或社交账号等个人联系方式，包括图片中可见的联系方式。', _trremaining: (m,p) => `还可发送 ${m} 条消息和 ${p} 张照片`, _trat: '模特提供的预计时间 · 约 ', _trupdated: '最后更新 ', _trquota: '超过剩余数量，请检查后重试' },
  }[lang] || null);
  const c = () => copy() || (lang = 'th', copy());
  const make = (tag, value, parent) => { const node = document.createElement(tag); if (value) node.textContent = value; parent?.append(node); return node; };
  const root = make('section', '', host); root.className = 'mt9'; root.dataset.mmdTravel = role;
  const heading = make('h3', c()._trtitle, root), countdown = make('strong', '', root), when = make('p', '', root), updated = make('p', '', root);
  const feedback = make('p', '', root); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  const retry = make('button', c()._trretry, root); retry.type = 'button'; retry.hidden = true; retry.onclick = () => load();
  const actions = make('details', '', root), summary = make('summary', c()._trdetails, actions);
  actions.hidden = role !== 'model';
  const etaForm = make('form', '', actions), etaLabel = make('label', c()._treta, etaForm), etaInput = make('input', '', etaLabel);
  etaInput.type = 'number'; etaInput.min = '1'; etaInput.max = '240'; etaInput.step = '1'; etaInput.required = true; etaInput.inputMode = 'numeric';
  const etaSave = make('button', c()._tretaSave, etaForm); etaSave.type = 'submit';
  const remaining = make('p', '', actions), remark = make('p', c()._trremark, actions); remark.className = 'mt9-remark';
  const form = make('form', '', actions), textLabel = make('label', c()._trtext, form), text = make('textarea', '', textLabel);
  text.maxLength = 500; text.rows = 3;
  const fileLabel = make('label', c()._trphoto, form), input = make('input', '', fileLabel);
  input.type = 'file'; input.multiple = true; input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
  const previews = make('div', '', form), send = make('button', c()._trsend, form); send.type = 'submit';
  const recover = make('div', '', actions), resume = make('button', c()._trresume, recover), cancel = make('button', c()._trcancel, recover);
  resume.type = cancel.type = 'button'; recover.hidden = true;
  const timeline = make('div', '', root);
  const dialog = make('dialog', '', root), large = make('img', '', dialog), close = make('button', c()._trclose, dialog);
  close.type = 'button'; close.onclick = () => dialog.close(); large.alt = c()._trphoto;
  try { pending = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); } catch {}
  function persist() { try { pending ? sessionStorage.setItem(pendingKey, JSON.stringify(pending)) : sessionStorage.removeItem(pendingKey); } catch {} }
  function clearFiles() { files.forEach(f => URL.revokeObjectURL(f.preview)); files = []; input.value = ''; previews.replaceChildren(); }
  function lock(value) {
    busy = value;
    for (const node of root.querySelectorAll('button,input,textarea')) node.disabled = value;
    if (!value) {
      const allowed = role === 'model' && !options.summaryOnly && data?.can_send === true;
      actions.hidden = !allowed;
      send.disabled = !allowed || (!data.messages_remaining && !data.photos_remaining) || Boolean(pending?.id);
      text.disabled = !allowed || Boolean(pending?.id);
      input.disabled = !allowed || !data.photos_remaining || Boolean(pending?.id);
      etaSave.disabled = !allowed;
      recover.hidden = !pending?.id;
    }
  }
  function localNow() { return anchor ? anchor.server + Math.max(0, performance.now() - anchor.received) : Date.now(); }
  function tick() {
    clearTimeout(tickTimer);
    if (stopped || document.hidden) return;
    const state = data?.state || options.state;
    countdown.textContent = travelClock(data?.eta, state, lang, localNow()) ||
      (role === 'model' ? ({
        th: 'ขั้นตอนนี้ไม่แสดงเวลาถึง',
        en: 'No ETA for this stage',
        zh: '此阶段无预计到达时间',
      }[lang] || '') : '');
    countdown.hidden = !countdown.textContent;
    const arrival = Date.parse(data?.eta?.arrival_at), ms = arrival - localNow();
    const active = ['en_route', 'nearby'].includes(state);
    const fmt = value => new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : lang === 'en' ? 'en-US' : 'th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(value));
    when.textContent = active && Number.isFinite(arrival) ? c()._trat + fmt(arrival) : '';
    updated.textContent = active && Number.isFinite(Date.parse(data?.eta?.updated_at)) ? c()._trupdated + fmt(data.eta.updated_at) : '';
    when.hidden = !when.textContent; updated.hidden = !updated.textContent;
    if (active && ms > 0) tickTimer = setTimeout(tick, Math.max(100, ms % 60000 || 60000));
  }
  async function api(url, init = {}) {
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      const value = await response.json();
      if (!response.ok || value.ok === false) throw Object.assign(new Error(value.error || 'travel_unavailable'), { status: response.status });
      return value;
    } finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  const post = body => api(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, session_id: sessionId }) });
  function photoUrl(id) { return base + '/photo?session_id=' + encodeURIComponent(sessionId) + '&media_id=' + encodeURIComponent(id); }
  function paint() {
    timeline.hidden = Boolean(options.summaryOnly);
    heading.textContent = c()._trtitle; summary.textContent = c()._trdetails; remark.textContent = c()._trremark;
    remaining.textContent = c()._trremaining(data.messages_remaining || 0, data.photos_remaining || 0);
    timeline.replaceChildren();
    for (const entry of data.submissions || []) {
      if (entry.state !== 'saved') continue;
      const item = make('article', '', timeline);
      if (entry.text) make('p', entry.text, item);
      for (const photo of entry.photos) {
        const button = make('button', '', item), image = make('img', '', button);
        button.type = 'button'; button.setAttribute('aria-label', c()._trphoto);
        image.src = photoUrl(photo.id); image.alt = c()._trphoto; image.loading = 'lazy';
        button.onclick = () => { large.src = image.src; dialog.showModal(); };
      }
      if (role === 'model') make('small', c()._trsaved + ' · ' + (entry.delivery?.delivered ? c()._trdelivered : c()._trdeliveryPending), item);
      if (role === 'model' && !entry.delivery?.delivered && data.can_send) {
        const again = make('button', c()._trretry + ' LINE', item); again.type = 'button';
        again.onclick = async () => { if (busy) return; lock(true); try { await post({ action:'commit', id:entry.id }); } catch { feedback.textContent = c()._trfailure; } finally { lock(false); await load(); } };
      }
    }
    if (pending?.id) {
      const receipt = data.submissions?.find(e => e.id === pending.id);
      if (receipt?.state === 'saved') { pending = null; persist(); text.value = ''; clearFiles(); }
      else if (!receipt || receipt.state !== 'reserved') { pending = null; persist(); }
      else feedback.textContent = c()._trpending;
    }
    tick(); lock(false);
  }
  async function load() {
    if (stopped || document.hidden || busy) return;
    clearTimeout(pollTimer); readAbort?.abort();
    const requestSequence = ++sequence, controller = new AbortController(); readAbort = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(base + '?session_id=' + encodeURIComponent(sessionId), { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' }, signal: controller.signal });
      const value = await response.json();
      if (!response.ok || value.ok !== true || value.session_id !== sessionId || !Array.isArray(value.submissions) || !Number.isFinite(Date.parse(value.server_now))) throw new Error('travel_read_failed');
      if (requestSequence !== sequence || stopped) return;
      if (data && value.binding === data.binding && value.revision < data.revision) return;
      if (data && value.binding !== data.binding) { clearFiles(); text.value = ''; pending = null; persist(); }
      if (pending?.binding && pending.binding !== value.binding) { clearFiles(); text.value = ''; pending = null; persist(); }
      data = value; anchor = { server: Date.parse(value.server_now), received: performance.now() }; failures = 0;
      if (pending && !pending.id) {
        const receipt = data.submissions.find(e => e.request_key === pending.key);
        if (receipt) { pending.id = receipt.id; persist(); if (receipt.state === 'reserved' && !text.value) text.value = receipt.text; }
      }
      feedback.textContent = ''; retry.hidden = true; paint();
    } catch {
      if (requestSequence !== sequence || stopped) return;
      failures++; feedback.textContent = c()._trsync; retry.hidden = false;
      if (!data) lock(false);
    } finally {
      clearTimeout(timeout);
      if (!stopped && !document.hidden && requestSequence === sequence) pollTimer = setTimeout(load, Math.min(120000, 30000 * 2 ** Math.min(failures, 2)));
    }
  }
  input.onchange = async () => {
    const chosen = [...input.files];
    if (chosen.length + files.length > (data?.photos_remaining || 0)) { feedback.textContent = c()._trquota; input.value = ''; return; }
    lock(true);
    const prepared = [];
    try {
      for (const file of chosen) {
        if (file.size > 25 * 1024 * 1024) throw new Error('too_large');
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
        if (!blob || blob.size > data.image_max_bytes) throw new Error('too_large');
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('');
        if (stopped) return;
        prepared.push({ blob, preview: URL.createObjectURL(blob), spec: { type: 'image/jpeg', size: blob.size, sha256 } });
      }
      files.push(...prepared);
      previews.replaceChildren();
      for (const file of files) {
        const item = make('div', '', previews), image = make('img', '', item), remove = make('button', c()._trremove, item);
        image.src = file.preview; image.alt = c()._trphoto; remove.type = 'button';
        remove.onclick = () => { URL.revokeObjectURL(file.preview); files = files.filter(f => f !== file); item.remove(); };
      }
    } catch { prepared.forEach(f => URL.revokeObjectURL(f.preview)); feedback.textContent = c()._trunsupported; }
    finally { input.value = ''; lock(false); }
  };
  async function save(event) {
    event?.preventDefault(); if (busy || !data?.can_send) return;
    lock(true); readAbort?.abort(); sequence++;
    try {
      if (!pending) { pending = { key: crypto.randomUUID(), id: null, binding: data.binding }; persist(); }
      if (!pending.id) {
        const result = await post({ action: 'prepare', key: pending.key, text: text.value, photos: files.map(f => f.spec) });
        pending.id = result.id; persist();
      }
      for (const [index, file] of files.entries()) await api(base + '?session_id=' + encodeURIComponent(sessionId) + '&id=' + pending.id + '&index=' + index, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: file.blob });
      const result = await post({ action: 'commit', id: pending.id });
      if (stopped) return;
      feedback.textContent = c()._trsaved + ' · ' + (result.delivery?.delivered ? c()._trdelivered : c()._trdeliveryPending);
      pending = null; persist(); text.value = ''; clearFiles();
    } catch { if (!stopped) feedback.textContent = c()._trfailure; }
    finally { if (!stopped) { lock(false); await load(); } }
  }
  form.onsubmit = save; resume.onclick = save;
  cancel.onclick = async () => {
    if (busy || !pending?.id) return;
    lock(true);
    try { await post({ action: 'cancel', id: pending.id }); pending = null; persist(); clearFiles(); }
    catch { feedback.textContent = c()._trfailure; }
    finally { lock(false); await load(); }
  };
  etaForm.onsubmit = async event => {
    event.preventDefault(); if (busy || !data?.can_send || !etaForm.reportValidity()) return;
    lock(true);
    try { await api('/v1/model/session/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'send_eta', session_id: sessionId, eta_minutes: Number(etaInput.value) }) }); }
    catch { feedback.textContent = c()._trfailure; }
    finally { lock(false); await load(); }
  };
  function visibility() { clearTimeout(pollTimer); clearTimeout(tickTimer); if (document.hidden) { readAbort?.abort(); sequence++; } else { tick(); load(); } }
  function online() { load(); }
  document.addEventListener('visibilitychange', visibility); window.addEventListener('online', online);
  const instance = { sessionId, update(next) {
    const changed = options.state !== next.state;
    const languageChanged = lang !== (next.locale || lang);
    options = next; lang = next.locale || lang;
    if (languageChanged) {
      for (const [node, value] of [[etaLabel,c()._treta],[textLabel,c()._trtext],[fileLabel,c()._trphoto]]) node.firstChild.nodeValue = value;
      for (const [node, value] of [[etaSave,c()._tretaSave],[send,c()._trsend],[retry,c()._trretry],[resume,c()._trresume],[cancel,c()._trcancel],[close,c()._trclose]]) node.textContent = value;
      if (data) paint();
    }
    if (changed && data) { data.state = next.state; data.can_send = role === 'model' && ['en_route','nearby'].includes(next.state); lock(false); load(); }
    tick();
  }, destroy() {
    stopped = true; sequence++; clearTimeout(pollTimer); clearTimeout(tickTimer); readAbort?.abort(); controllers.forEach(controller => controller.abort());
    document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', online); clearFiles(); root.remove(); if (host._mmdTravel === instance) delete host._mmdTravel;
  } };
  host._mmdTravel = instance; lock(false); tick(); load(); return instance;
}

export function mountTravelSummary(host, options) {
  if (!options.sessionId) { host._mmdTravel?.destroy(); return; }
  if (host._mmdTravel?.sessionId === options.sessionId) { host._mmdTravel.update(options); return host._mmdTravel; }
  host._mmdTravel?.destroy();
  const root = document.createElement('section'), title = document.createElement('strong'), detail = document.createElement('p'), feedback = document.createElement('p');
  root.className = 'mt9'; root.dataset.mmdTravel = 'summary'; root.append(title, detail, feedback); host.append(root); feedback.setAttribute('role','status');
  let data, anchor, poll, tickTimer, abort, stopped=false, revision=0, failures=0;
  const current = () => ['en_route','nearby','arrived'].includes(options.state);
  function tick() {
    clearTimeout(tickTimer); root.hidden=!current(); if (stopped || document.hidden || !current()) return;
    const now=anchor ? anchor.at+Math.max(0,performance.now()-anchor.received) : Date.now();
    title.textContent=travelClock(data?.eta,options.state,options.locale,now);
    const at=data?.eta?.arrival_at;
    detail.textContent=at && options.state!=='arrived' ? new Intl.DateTimeFormat(options.locale==='zh'?'zh-CN':options.locale==='en'?'en-US':'th-TH',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}).format(new Date(at))+' · '+({th:'เวลาที่โมเดลแจ้ง',en:'Estimate provided by the model',zh:'模特提供的预计时间'}[options.locale]||'เวลาที่โมเดลแจ้ง') : '';
    const remaining=Date.parse(at)-now;
    if(remaining>0 && options.state!=='arrived')tickTimer=setTimeout(tick,Math.max(100,remaining%60000||60000));
  }
  async function load() {
    clearTimeout(poll); if(stopped||document.hidden||!current())return;
    abort?.abort();const version=++revision;abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),12000);
    try{
      const response=await fetch('/v1/model/session/travel?session_id='+encodeURIComponent(options.sessionId),{credentials:'same-origin',cache:'no-store',signal:abort.signal});
      const value=await response.json();if(!response.ok||value.ok!==true||value.session_id!==options.sessionId||!Number.isFinite(Date.parse(value.server_now)))throw 0;
      if(stopped||version!==revision)return;
      data=value;anchor={at:Date.parse(value.server_now),received:performance.now()};options.state=value.state;failures=0;feedback.textContent='';tick();
    }catch{if(!stopped&&version===revision){failures++;feedback.textContent=({th:'อัปเดตไม่สำเร็จ ข้อมูลอาจเปลี่ยน',en:'Refresh failed. Information may have changed.',zh:'更新失败，信息可能已变化'}[options.locale]||'อัปเดตไม่สำเร็จ ข้อมูลอาจเปลี่ยน');}}
    finally{clearTimeout(timeout);if(!stopped&&!document.hidden&&current()&&version===revision)poll=setTimeout(load,Math.min(120000,30000*2**Math.min(2,failures)));}
  }
  function visible(){clearTimeout(poll);clearTimeout(tickTimer);if(document.hidden){abort?.abort();revision++;}else{tick();load();}}
  document.addEventListener('visibilitychange',visible);window.addEventListener('online',visible);
  const instance={sessionId:options.sessionId,update(next){const changed=options.state!==next.state;options=next;tick();if(changed)load();},destroy(){stopped=true;revision++;abort?.abort();clearTimeout(poll);clearTimeout(tickTimer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',visible);root.remove();if(host._mmdTravel===instance)delete host._mmdTravel;}};
  host._mmdTravel=instance;tick();load();return instance;
}

export function travelClientBundle(summary = false) { return `const travelClock=${travelClock.toString()};const mountTravelPanel=${(summary ? mountTravelSummary : mountTravelPanel).toString()};`; }

export const travelClientCss = `.mt9{padding:14px 0;max-width:100%;color:inherit;font:inherit;overflow-wrap:anywhere}.mt9[hidden],.mt9 [hidden]{display:none!important}.mt9 h3{font-size:14px;margin:0 0 8px}.mt9>strong{display:block;font-size:clamp(17px,5vw,22px);line-height:1.5}.mt9 p{font-size:13px;line-height:1.65;margin:8px 0;white-space:pre-wrap}.mt9 details{border-top:1px solid currentColor;margin-top:12px;padding-top:8px}.mt9 summary{cursor:pointer;min-height:44px;display:flex;align-items:center}.mt9 label{display:block;font-size:13px;line-height:1.7;margin:10px 0}.mt9 input,.mt9 textarea,.mt9 button{box-sizing:border-box;max-width:100%;min-height:44px;font:inherit;border:1px solid currentColor;border-radius:10px;padding:10px;background:transparent;color:inherit}.mt9 input,.mt9 textarea{display:block;width:100%;margin-top:6px}.mt9 button{cursor:pointer;min-width:44px;margin:4px 4px 4px 0}.mt9 :disabled{opacity:.6;cursor:default}.mt9 :focus-visible{outline:3px solid currentColor;outline-offset:3px}.mt9 img{display:block;max-width:100%;max-height:100px;object-fit:contain}.mt9 article{border-top:1px solid currentColor;padding:8px 0}.mt9 article button{display:inline-block}.mt9 small{display:block;font-size:12px}.mt9 .mt9-remark{font-size:12px;line-height:1.7}.mt9 dialog{color:#f3f0e8;background:#171b1d;max-width:90vw;border:1px solid #c9b38b;padding:16px;border-radius:14px}.mt9 dialog img{max-height:70vh}.mt9 dialog::backdrop{background:#000b}`;
