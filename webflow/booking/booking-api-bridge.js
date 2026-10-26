/* Public Booking bridge. Private discovery stays on the entitled SIGIL surface. */
(() => {
  'use strict';
  const root = document.querySelector('#mmd-booking-v4');
  if (!root || root.dataset.bookingApiBridge) return;
  const form = root.querySelector('[data-form]');
  const send = root.querySelector('[data-copy]');
  if (!form || !send) return;
  root.dataset.bookingApiBridge = '20261026-v1';
  const API = 'https://sigil.mmdbkk.com';
  const value = name => String(form.elements[name]?.value || '').trim();
  const status = root.querySelector('[data-status]');
  const filterKeys = ['min_height_cm','max_height_cm','min_weight_kg','max_weight_kg','body_type','skin_tone'];
  let selected = null, sending = false, sent = false, requestRef = '', searchVersion = 0;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const box = el('section', '', 'bk-api-models');
  box.innerHTML = `<h3>เลือก Model ที่สนใจ</h3><p>ค้นหาและดูรูปก่อนส่งคำขอ หรือข้ามให้ MMD ช่วยเลือกได้</p>
    <div class="bk-api-search"><label>ชื่อ Model<input name="public_model_query" type="search" placeholder="พิมพ์ชื่อ หรือดูทั้งหมด" autocomplete="off"></label><button type="button" data-public-search>ค้นหา</button></div>
    <details><summary>ตัวกรองเพิ่มเติม</summary><div class="bk-api-filters">
    <label>ส่วนสูงตั้งแต่ (ซม.)<input name="min_height_cm" type="number" min="100" max="230" inputmode="numeric"></label>
    <label>ส่วนสูงไม่เกิน (ซม.)<input name="max_height_cm" type="number" min="100" max="230" inputmode="numeric"></label>
    <label>น้ำหนักตั้งแต่ (กก.)<input name="min_weight_kg" type="number" min="30" max="200" inputmode="numeric"></label>
    <label>น้ำหนักไม่เกิน (กก.)<input name="max_weight_kg" type="number" min="30" max="200" inputmode="numeric"></label>
    <label>รูปร่าง<select name="body_type"><option value="">ทั้งหมด</option><option value="lean">ลีน</option><option value="athletic">สมส่วนแบบนักกีฬา</option><option value="muscular">กล้ามชัด</option><option value="slim">ผอมเพรียว</option><option value="soft">หุ่นนุ่ม</option></select></label>
    <label>สีผิว<select name="skin_tone"><option value="">ทั้งหมด</option><option value="fair">ขาว</option><option value="light">ขาวเหลือง</option><option value="medium">กลาง</option><option value="tan">แทน</option><option value="deep">เข้ม</option></select></label>
    </div></details><progress max="100" value="0" hidden aria-label="ความคืบหน้าการค้นหา"></progress><p data-search-status role="status"></p><div class="bk-api-results"></div><div data-model-selected hidden></div>
    <a class="bk-api-private" href="https://sigil.mmdbkk.com/sigil/booking?scope=private&mode=booking">จองด้วยแพ็กเกจสมาชิก →</a>`;
  const panel = form.querySelector('[data-panel="1"]');
  panel.insertBefore(box, panel.querySelector('.bk-actions'));
  const searchButton = box.querySelector('[data-public-search]');
  const results = box.querySelector('.bk-api-results');
  const searchStatus = box.querySelector('[data-search-status]');
  const selection = box.querySelector('[data-model-selected]');
  const progress = box.querySelector('progress');
  const sendProgress = el('progress'); sendProgress.max = 100; sendProgress.hidden = true; sendProgress.setAttribute('aria-label','ความคืบหน้าการส่งคำขอ'); status.before(sendProgress);
  const line = el('a','ติดต่อ MMD ทาง LINE','bk-api-private'); line.href = 'https://lin.ee/xRqsALs'; line.target = '_blank'; line.rel = 'noopener noreferrer'; status.after(line);

  function projectedMedia(item) {
    if (item.media_source !== 'mmd_model_media_assets') return {cover:null, gallery:[]};
    const valid = m => m && m.media_source === 'mmd_model_media_assets' && /^media_[a-z0-9_-]{8,100}$/i.test(m.media_id || '') && ['photo','clip'].includes(m.kind);
    const approved = (Array.isArray(item.approved_media) ? item.approved_media : []).filter(valid);
    const published = (Array.isArray(item.gallery_media) ? item.gallery_media : []).filter(valid);
    const cover = approved.find(m => m.media_id === item.primary_media_id && m.kind === 'photo') || null;
    const seen = new Set();
    const gallery = [...approved,...published].filter(m => {if(seen.has(m.media_id)) return false; seen.add(m.media_id); return true;});
    return {cover, gallery};
  }
  function mediaNode(media) {
    const n = el(media.kind === 'clip' ? 'video' : 'img');
    n.src = API + '/sigil/api/models/media/' + encodeURIComponent(media.media_id);
    if (media.kind === 'clip') { n.controls = true; n.preload = 'none'; n.playsInline = true; }
    else { n.alt = 'รูป Model สำหรับลูกค้า'; n.loading = 'lazy'; }
    n.addEventListener('error', () => n.replaceWith(el('span','ยังเปิดรูปนี้ไม่ได้','bk-api-no-cover')), {once:true});
    return n;
  }
  async function api(path, options) {
    const response = await fetch(API + path, {...options, credentials:"include", signal:AbortSignal.timeout(25000)});
    const data = await response.json();
    if (!response.ok || data.ok !== true || data.blocked) throw new Error('request_failed');
    return data;
  }
  function selectModel(item) {
    selected = item;
    if (form.elements.model) form.elements.model.value = item ? (item.display_name || item.name || item.working_name || '') : '';
    selection.replaceChildren(); selection.hidden = !item;
    results.querySelectorAll('[data-model-id]').forEach(b => b.setAttribute('aria-pressed',String(!!item && b.dataset.modelId === item.model_id)));
    if (!item) return;
    selection.append(el('strong','เลือก: ' + (item.display_name || item.name || item.working_name || 'Model')));
    const clear = el('button','ยกเลิกการเลือก'); clear.type = 'button'; clear.onclick = () => selectModel(null); selection.append(clear);
    const gallery = el('div','','bk-api-gallery'); projectedMedia(item).gallery.forEach(m => gallery.append(mediaNode(m))); selection.append(gallery);
  }
  async function search() {
    const controls = [...box.querySelectorAll('input,select')];
    if (controls.some(n => !n.reportValidity())) return;
    for (const [min,max] of [['min_height_cm','max_height_cm'],['min_weight_kg','max_weight_kg']]) {
      if(value(min) && value(max) && Number(value(min)) > Number(value(max))) { searchStatus.textContent = 'ค่าตั้งแต่ต้องไม่มากกว่าค่าไม่เกิน'; return; }
    }
    const version = ++searchVersion;
    searchButton.disabled = true; progress.hidden = false; progress.value = 10; searchStatus.textContent = 'กำลังค้นหา 10%'; results.replaceChildren();
    const tick = setInterval(() => {progress.value = Math.min(90,progress.value + 10); searchStatus.textContent = 'กำลังค้นหา ' + progress.value + '%';}, 600);
    try {
      const query = new URLSearchParams({scope:'public',search_mode:'booking'});
      if(value('public_model_query')) query.set('q',value('public_model_query'));
      filterKeys.forEach(k => {if(value(k)) query.set(k,value(k));});
      const data = await api('/sigil/api/models/search?' + query);
      if(version !== searchVersion) return;
      if(data.discovery_scope !== 'public' || data.visibility_enforced !== true) throw new Error('visibility_unverified');
      const items = (Array.isArray(data.items) ? data.items : []).filter(item => item.scope === 'public');
      for (const item of items) {
        const b = el('button','','bk-api-model'); b.type = 'button'; b.dataset.modelId = item.model_id || ''; b.setAttribute('aria-pressed',String(!!selected && selected.model_id === item.model_id));
        const media = projectedMedia(item); b.append(media.cover ? mediaNode(media.cover) : el('span','ยังไม่มีรูปปก','bk-api-no-cover'));
        b.append(el('strong', item.display_name || item.name || item.working_name || 'Model'));
        b.onclick = () => selectModel(item); results.append(b);
      }
      progress.value = 100; searchStatus.textContent = items.length ? '100% · พบ ' + items.length + ' คน · แตะเพื่อเลือกและดูรูปเพิ่มเติม' : '100% · ยังไม่พบคนที่ตรง ลองลดตัวกรองหรือให้ MMD ช่วยเลือก';
    } catch (_) { searchStatus.textContent = 'ค้นหายังไม่สำเร็จ ลองใหม่ได้ หรือส่งความต้องการให้ MMD ช่วยเลือก'; }
    finally {clearInterval(tick); searchButton.disabled = false;}
  }
  searchButton.addEventListener('click',search);
  box.querySelector('input[type="search"]').addEventListener('keydown',e => {if(e.key === 'Enter'){e.preventDefault();search();}});
  form.elements.model?.addEventListener('input',() => {if(selected && value('model') !== (selected.display_name || selected.name || selected.working_name || '')) selectModel(null);});
  function payload() {
    const summary = [...root.querySelectorAll('[data-summary] .bk-row')].map(n => n.textContent.trim()).join('\n');
    const service = root.querySelector('[data-service].picked')?.dataset.service || '';
    const filters = Object.fromEntries(filterKeys.filter(k=>value(k)).map(k=>[k,value(k)]));
    return {
      source:'public_booking',source_path:'/booking',search_mode:'booking',request_status:'draft',
      booking_ref:requestRef,lane:'public',model_scope:'public',private_allowed:false,access_scope:'public_only',
      client_nickname:value('name'),client_contact:value('contact'),preferred_date:value('date'),preferred_time:value('time'),
      service_context:service,city:value('place'),google_address:value('place'),
      selected_model_id:selected?.model_id || '',selected_model_name:selected ? (selected.display_name || selected.name || selected.working_name || '') : '',
      preferred_model_name:value('model'),model_search_query:value('model'),
      client_notes:[value('note'),summary].filter(Boolean).join('\n\n'),preference_text:[service,value('model'),value('place')].filter(Boolean).join(' · '),
      ...filters
    };
  }
  async function submitRequest() {
    if(sending || sent) return;
    if(!form.reportValidity()) return;
    if(!['name','contact','date','time','place'].every(k=>value(k))) {status.textContent='กรอกชื่อ ช่องทางติดต่อ วัน เวลา และสถานที่ก่อนส่ง';return;}
    if(!requestRef) requestRef = 'book_' + crypto.randomUUID();
    sending = true; send.disabled = true; sendProgress.hidden = false; sendProgress.value = 15; send.textContent = 'กำลังส่ง 15%';
    const tick = setInterval(()=>{sendProgress.value=Math.min(90,sendProgress.value+10); send.textContent='กำลังส่ง '+sendProgress.value+'%';},600);
    try {
      const data = await api('/sigil/api/booking/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())});
      if(!data.booking_ref) throw new Error('missing_reference');
      sent = true; requestRef = data.booking_ref; sendProgress.value = 100;
      status.textContent = 'ส่งคำขอแล้ว · เลขอ้างอิง ' + requestRef + ' · MMD จะตรวจรายละเอียดและติดต่อกลับก่อนยืนยันงาน';
      form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);
    } catch (_) {status.textContent='ยังยืนยันการรับคำขอไม่ได้ กรุณาลองส่งอีกครั้ง ระบบจะใช้เลขอ้างอิงเดิม หรือเลือกติดต่อ MMD ทาง LINE';}
    finally {clearInterval(tick);sending=false;send.disabled=sent;send.textContent=sent?'ส่งคำขอแล้ว 100%':'ส่งคำขอให้ MMD';}
  }
  // Capture the existing CTA before the legacy copy/LINE listener runs.
  root.addEventListener('click',e=>{if(e.target.closest('[data-copy]')){e.preventDefault();e.stopImmediatePropagation();submitRequest();}},true);
  const label = () => {if(!sending && !sent && send.textContent !== 'ส่งคำขอให้ MMD') send.textContent='ส่งคำขอให้ MMD';};
  label(); new MutationObserver(label).observe(send,{childList:true,characterData:true,subtree:true});
  form.addEventListener('submit',()=>setTimeout(()=>{if(!sent && !sending)status.textContent='ตรวจรายละเอียด แล้วกดส่งคำขอให้ MMD ได้เลย';},0));
})();
