import { MMS_CHAT_ERRORS } from '../../shared/mms-chat-policy.mjs';

export function renderMmsDirectChatPage(role) {
  const therapist = role === 'therapist';
  const config = JSON.stringify({ role, api: therapist ? '/male-massage/therapists/api/app/chat' : '/api/mms/app/chat', errors: MMS_CHAT_ERRORS }).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>แชตตรง · ${therapist ? 'MY THERAPIST' : 'MY MMS'}</title><style>
  *{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#f4f5ef;color:#20392b;font:16px/1.65 system-ui,-apple-system,sans-serif}main{max-width:760px;margin:auto;padding:18px 16px calc(30px + env(safe-area-inset-bottom))}header,.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}h1{font-size:26px;margin:14px 0 4px}h2{font-size:20px;margin:0 0 12px}h3{font-size:17px;margin:0}p{margin:8px 0}a{color:#24563c}header a,summary{min-height:48px;display:inline-flex;align-items:center}summary{cursor:pointer;font-weight:650}button{border:0;border-radius:12px;min-height:48px;padding:10px 16px;font:inherit;background:#24563c;color:#fff;cursor:pointer}button.alt{background:#e9eee4;color:#24563c}button:disabled{opacity:.6;cursor:default}button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #ad8544;outline-offset:3px}textarea,select{width:100%;font:inherit;color:inherit;background:white;border:1px solid #a8b8a0;border-radius:10px;padding:12px;margin:6px 0 12px}textarea{resize:vertical;min-height:96px}.card{padding:18px;border:1px solid #dce2d6;border-radius:18px;background:white;margin:14px 0;overflow-wrap:anywhere}.muted{color:#52634f;font-size:14px}.error{color:#8f2f20}#notice{min-height:26px}#messages{max-height:55svh;min-height:140px;overflow-y:auto;overscroll-behavior:contain;padding:4px}article.message{max-width:90%;padding:12px 14px;border-radius:14px;background:#edf0e9;margin:10px 0;white-space:pre-wrap;overflow-wrap:anywhere}article.message.mine{margin-left:auto;background:#e1eddd}article.message small{display:block;color:#52634f;font-size:12px}.thread{display:block;width:100%;text-align:left;margin:8px 0}.thread[aria-pressed=true]{background:#24563c;color:white}.course{font-size:14px;margin:6px 0}ol{padding-left:24px}li{margin:12px 0}.actions{display:flex;gap:10px;flex-wrap:wrap}#blocked{padding:12px;background:#fff4e8;border-radius:12px}#send{flex:1}label{display:block}button,a{touch-action:manipulation}
  </style></head><body><main data-mms-chat="${role}"><header><a href="${therapist ? '/male-massage/therapists/app' : '/male-massage'}">← ${therapist ? 'MY THERAPIST' : 'MY MMS'}</a><a href="https://lin.ee/NkfXMu7">ติดต่อ Per</a></header><h1>${therapist ? 'แชตกับลูกค้า' : 'คุยกับ Therapist'}</h1><p class="muted">สอบถามและตกลงบริการได้ตรงนี้ครับ การคุยยังไม่ถือเป็นการจองหรือรับงาน</p>
  <p id="notice" role="status" aria-live="polite">กำลังตรวจสอบบัญชีครับ</p><div class="actions"><button id="retry" class="alt" type="button">ลองอีกครั้ง</button><a id="login" hidden href="${therapist ? '/male-massage/therapists/login' : '/male-massage/member'}">ยืนยันบัญชีผ่าน LINE</a></div>
  <section class="card" id="policy-card" hidden><details id="policy-details" open><summary>กติกาการสนทนาใน MY MMS</summary><p id="policy-intro"></p><ol id="rules"></ol></details><button id="agree" type="button">รับทราบและเริ่มคุย</button></section>
  <div id="app" hidden><section id="directory" class="card" ${therapist ? 'hidden' : ''}><h2>เลือก Therapist</h2><label>พื้นที่ให้บริการ<select id="zone"><option value="">ทุกพื้นที่ให้บริการ</option></select></label><p class="muted">สถานะ Online หมายถึงเปิดรับคำขอ ยังต้องรอ Therapist ยืนยันงานครับ</p><div id="therapists"></div><button id="more-therapists" type="button" class="alt" hidden>ดู Therapist เพิ่ม</button></section>
  <section class="card"><div class="row"><h2>บทสนทนาของคุณ</h2><button id="refresh" type="button" class="alt">รีเฟรช</button></div><div id="threads"></div><button id="more-threads" type="button" class="alt" hidden>ดูบทสนทนาเพิ่ม</button></section>
  <section id="conversation" class="card" hidden><h2 id="peer"></h2><button id="older" type="button" class="alt" hidden>โหลดข้อความก่อนหน้า</button><div id="messages" role="log" aria-label="ข้อความสนทนา" aria-live="polite"></div><p id="empty" class="muted" hidden>ยังไม่มีข้อความครับ เริ่มถามรายละเอียดบริการได้เลย</p><form id="compose"><label for="text">ข้อความถึงอีกฝ่าย</label><textarea id="text" maxlength="1000" required placeholder="สอบถามคอร์ส เวลา หรือรายละเอียดบริการ"></textarea><p class="muted">ส่งได้เฉพาะข้อความ ห้ามแลกข้อมูลติดต่อหรือชวนออกนอกระบบครับ</p><div id="blocked" hidden role="alert"><p id="blocked-copy"></p><div class="actions"><button id="edit" class="alt" type="button">แก้ไขข้อความ</button><button id="review" class="alt" type="button">ขอให้ตรวจสอบ</button></div></div><div class="actions"><button id="send" type="submit">ส่งข้อความ</button></div></form></section></div>
  </main><script>const __name=(target,value)=>target;(${chatClient.toString()})(${config});</script></body></html>`;
}

function chatClient(config) {
  const $ = id => document.getElementById(id);
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
  let policy, active = null, first = 0, last = 0, timer, polling = false, directoryEpoch = 0, threadNext = null, directoryNext = null, epoch = 0;
  const drafts = new Map(), pending = new Map(), loadedThreads = new Map();
  let threadsSignature = '', accountRef = null, highestThread = 0;
  const notice = (text, error = false) => { $('notice').textContent = text; $('notice').className = error ? 'error' : ''; };
  const opts = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  async function api(path, options = {}) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(config.api + path, { credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        const error = new Error(result.error?.code || 'MMS_CHAT_UNAVAILABLE'); error.code = result.error?.code; error.hold = result.error?.hold_id; error.status = response.status;
        if (response.status === 401 || response.status === 403) {
          $('app').hidden = true; $('policy-card').hidden = true; $('login').hidden = false; clearTimeout(timer);
          notice('กรุณายืนยันบัญชีและสิทธิ์ใช้งานอีกครั้งครับ', true);
        } else if (error.code === 'MMS_CHAT_POLICY_REQUIRED') {
          $('app').hidden = true; clearTimeout(timer);
        }
        throw error;
      }
      return result.data;
    } finally { clearTimeout(timeout); }
  }
  function errorText(error) { return config.errors[error.code] || (error.status === 401 ? 'กรุณายืนยันบัญชีผ่าน LINE ก่อนครับ' : error.status === 403 ? 'บัญชีนี้ยังไม่มีสิทธิ์เปิดแชตครับ ติดต่อ Per เพื่อตรวจสอบได้' : 'ยังทำรายการไม่สำเร็จครับ ลองอีกครั้งได้ ข้อความที่พิมพ์ยังอยู่'); }
  async function busy(button, fn) { if (button.disabled) return; button.disabled = true; try { await fn(); } catch (e) { notice(errorText(e), true); } finally { button.disabled = false; } }
  function action(label, callback, alt = false) { const button = node('button', label, alt ? 'alt' : ''); button.type = 'button'; button.onclick = () => busy(button, callback); return button; }
  async function start() {
    clearTimeout(timer);
    const generation = ++epoch; ++directoryEpoch; active = null; first = 0; last = 0; drafts.clear(); pending.clear(); loadedThreads.clear(); threadsSignature = ''; highestThread = 0; threadNext = null;
    $('app').hidden = true; $('conversation').hidden = true; $('messages').replaceChildren(); $('text').value = ''; $('threads').replaceChildren();
    const result = await api('/policy'); if (generation !== epoch) return; policy = result.policy; accountRef = result.account_ref;
    $('policy-intro').textContent = policy.introduction;
    $('rules').replaceChildren(...policy.rules.map(rule => node('li', rule)));
    $('policy-card').hidden = false; $('login').hidden = true;
    const accepted = result.consent?.version === policy.version;
    $('agree').hidden = accepted; $('policy-details').open = !accepted; $('app').hidden = !accepted;
    if (!accepted) { notice('อ่านกติกาแล้วกดรับทราบเพื่อเริ่มคุยครับ'); return; }
    await threads();
    if (generation !== epoch) return;
    if (config.role === 'customer') await therapists();
    notice('พร้อมคุยแล้วครับ'); schedule();
  }
  async function threads(append = false) {
    const turn = epoch;
    const updates = !append && loadedThreads.size > 0;
    const query = append && threadNext ? '?after=' + threadNext : updates ? '?since=' + highestThread : '';
    const result = await api('/threads' + query);
    if (turn !== epoch) return;
    if (result.account_ref !== accountRef) { await start(); return; }
    for (const thread of result.threads) { loadedThreads.set(thread.thread_id, thread); highestThread = Math.max(highestThread, thread.seq); }
    const values = [...loadedThreads.values()].sort((a, b) => b.seq - a.seq);
    const signature = JSON.stringify(values);
    if (signature !== threadsSignature) {
    $('threads').replaceChildren();
    for (const thread of values) {
      const button = action(thread.label, () => open(thread.thread_id), true); button.classList.add('thread'); button.dataset.thread = thread.thread_id; button.setAttribute('aria-pressed', String(active === thread.thread_id)); $('threads').append(button);
    }
    if (!values.length) $('threads').append(node('p', config.role === 'therapist' ? 'ยังไม่มีลูกค้าเริ่มบทสนทนาครับ' : 'เลือก Therapist เพื่อเริ่มคุยได้เลยครับ', 'muted'));
    threadsSignature = signature;
    }
    if (!updates) threadNext = result.next;
    $('more-threads').hidden = !threadNext;
  }
  async function therapists(append = false) {
    const turn = ++directoryEpoch; const zone = $('zone').value;
    const params = new URLSearchParams(); if (zone) params.set('zone', zone); if (append && directoryNext) params.set('offset', directoryNext);
    const result = await api('/therapists?' + params);
    if (turn !== directoryEpoch) return;
    if ($('zone').options.length === 1) for (const zone of result.zones) { const option = node('option', zone.label); option.value = zone.code; $('zone').append(option); }
    if (!append) $('therapists').replaceChildren();
    for (const therapist of result.therapists) {
      const card = node('article', null, 'card'); card.append(node('h3', therapist.display_name), node('p', therapist.available ? 'Online · เปิดรับคำขอ' : 'Offline · ยังไม่เปิดบทสนทนาใหม่', 'muted'));
      if (therapist.intro) card.append(node('p', therapist.intro));
      for (const course of therapist.courses) card.append(node('p', `${course.name} · ${course.duration_minutes} นาที · ${Number(course.price_thb).toLocaleString('th-TH')} บาท`, 'course'));
      card.append(node('p', 'ราคาคอร์สยังไม่รวมค่าเดินทาง กรุณาตกลงรายละเอียดก่อนจองครับ', 'muted'));
      const button = action('คุยกับ ' + therapist.display_name, async () => { const created = await api('/threads', opts({ therapist_id: therapist.therapist_id })); await threads(); await open(created.thread_id); }); button.disabled = !therapist.available; card.append(button); $('therapists').append(card);
    }
    if (!append && !result.therapists.length) $('therapists').append(node('p', result.next ? 'ยังไม่พบโปรไฟล์ในชุดนี้ กดดูเพิ่มเติมได้ครับ' : 'ยังไม่พบ Therapist ที่เปิดแสดงโปรไฟล์ในพื้นที่นี้ครับ', 'muted'));
    directoryNext = result.next; $('more-therapists').hidden = !directoryNext;
  }
  async function open(id) {
    if (active) drafts.set(active, $('text').value);
    active = id; const turn = ++epoch; first = 0; last = 0;
    $('conversation').hidden = false; $('peer').textContent = 'กำลังโหลดบทสนทนา'; $('messages').replaceChildren(); $('text').value = drafts.get(id) || ''; $('blocked').hidden = true; $('older').hidden = true;
    for (const button of document.querySelectorAll('[data-thread]')) button.setAttribute('aria-pressed', String(button.dataset.thread === id));
    const data = await api('/threads/' + id);
    if (turn !== epoch) return;
    $('peer').textContent = data.label; draw(data.messages); $('older').hidden = !data.more; $('empty').hidden = data.messages.length > 0;
    $('conversation').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function draw(messages, prepend = false) {
    const fragment = document.createDocumentFragment();
    for (const message of messages) {
      if (document.querySelector('[data-seq="' + message.seq + '"]')) continue;
      const bubble = node('article', null, message.role === config.role ? 'message mine' : 'message'); bubble.dataset.seq = message.seq;
      bubble.append(node('span', message.text), node('small', (message.role === config.role ? 'คุณ' : message.role === 'therapist' ? 'Therapist' : 'ลูกค้า') + ' · ' + new Date(message.created_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })));
      fragment.append(bubble); first = first ? Math.min(first, message.seq) : message.seq; last = Math.max(last, message.seq);
    }
    if (prepend) $('messages').prepend(fragment); else { const list = $('messages'); const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 100; list.append(fragment); if (nearBottom) list.scrollTop = list.scrollHeight; }
    $('empty').hidden = last > 0;
  }
  async function refreshMessages() {
    if (!active || polling) return; polling = true; const id = active, turn = epoch;
    try { const data = await api('/threads/' + id + '?after=' + last); if (turn === epoch) draw(data.messages); }
    finally { polling = false; }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(async () => { try { if (!document.hidden && !$('app').hidden) { await threads(); await refreshMessages(); } } catch (e) { notice(errorText(e), true); } finally { if (!$('app').hidden) schedule(); } }, 5000); }
  $('agree').onclick = () => busy($('agree'), async () => { await api('/consent', opts({ version: policy.version })); await start(); });
  $('retry').onclick = () => busy($('retry'), start);
  $('refresh').onclick = () => busy($('refresh'), async () => { await threads(); await refreshMessages(); notice('อัปเดตบทสนทนาแล้วครับ'); });
  $('zone').onchange = () => busy($('zone'), () => therapists());
  $('more-therapists').onclick = () => busy($('more-therapists'), () => therapists(true));
  $('more-threads').onclick = () => busy($('more-threads'), () => threads(true));
  $('older').onclick = () => busy($('older'), async () => { const turn = epoch; const data = await api('/threads/' + active + '?before=' + first); if (turn === epoch) { draw(data.messages, true); $('older').hidden = !data.more; } });
  $('text').oninput = () => { if (active) drafts.set(active, $('text').value); $('blocked').hidden = true; };
  $('edit').onclick = () => $('text').focus();
  $('compose').onsubmit = event => {
    event.preventDefault(); if (!active || !$('text').value.trim()) return;
    busy($('send'), async () => {
      const id = active, text = $('text').value, turn = epoch;
      let attempt = pending.get(id);
      if (!attempt || attempt.text !== text) { attempt = { text, key: crypto.randomUUID() }; pending.set(id, attempt); }
      try {
        await api('/threads/' + id + '/messages', opts({ text, request_key: attempt.key })); pending.delete(id);
        if (drafts.get(id) === text) drafts.delete(id);
        if (turn === epoch) { if ($('text').value === text) $('text').value = ''; $('blocked').hidden = true; await refreshMessages(); notice('ส่งข้อความแล้วครับ'); }
      } catch (error) {
        if (error.status && error.status < 500) pending.delete(id);
        if (turn === epoch && $('text').value === text && error.hold) {
          $('blocked').hidden = false; $('blocked-copy').textContent = errorText(error); const holdId = error.hold;
          $('review').disabled = false; $('review').onclick = () => busy($('review'), async () => {
            await api('/threads/' + id + '/reviews', opts({ hold_id: holdId }));
            notice('บันทึกคำขอให้ตรวจสอบแล้วครับ ข้อความนี้ยังไม่ได้ส่งให้อีกฝ่าย'); $('review').hidden = true;
          }); $('review').hidden = false;
        }
        throw error;
      }
    });
  };
  start().catch(error => notice(errorText(error), true));
}
