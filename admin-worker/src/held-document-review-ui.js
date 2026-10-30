// Mirrored shared-catalog keys: admin.held_review.*. Shared-repository merge
// remains a separate release dependency; this module contains no business rules.
export const HELD_REVIEW_COPY = Object.freeze({
  title: 'ภาพรอตรวจ',
  navigation_label: 'หมวดตรวจภาพ',
  read_only: 'อ่านอย่างเดียว',
  proofs: 'หลักฐานชำระเงิน',
  lead: 'ภาพที่ระบบยังจัดประเภทไม่ได้ แยกจากหลักฐานชำระเงิน หน้านี้ดูข้อมูลได้อย่างเดียวครับ',
  notice: 'ยังไม่ยืนยันเงินเข้า · ไม่เพิ่มสิทธิ์ · หน้านี้ไม่มีคำสั่งลบภาพ',
  retained_pending_policy: 'ภาพต้นฉบับเก็บไว้รอนโยบายระยะเก็บ',
  legacy_retention_policy: 'ภาพจากคิวพักเดิม ใช้นโยบายระยะเก็บเดิม',
  loading: 'กำลังอ่านรายการภาพรอตรวจ…',
  empty: 'ยังไม่พบภาพในหน้านี้ครับ หากมีหน้าถัดไป ให้กด “ดูรายการถัดไป”',
  error: 'อ่านรายการไม่ได้ครับ ลองโหลดใหม่ หากยังไม่ได้ให้กลับมาใหม่ภายหลัง',
  refresh: 'โหลดใหม่',
  more: 'ดูรายการถัดไป',
  open: 'เปิดภาพ',
  close: 'ปิดภาพ',
  unknown_customer: 'ยังจับคู่ลูกค้าไม่ได้',
  ambiguous_customer: 'พบข้อมูลลูกค้าซ้ำ ต้องตรวจการเชื่อมก่อน',
  identity_unavailable: 'ระบบอ่านชื่อลูกค้าไม่พร้อม',
  verified_name: 'ชื่อจาก LINE ที่เชื่อม Client และประวัติ Per ตรงกัน',
  unknown_date: 'ไม่พบเวลารับภาพ',
  reference: 'เลขอ้างอิงภาพ',
  image_loading: 'กำลังเปิดภาพ…',
  image_error: 'เปิดภาพไม่ได้ครับ ภาพอาจไม่พร้อมหรือสิทธิ์อ้างอิงหมดอายุ ลองโหลดรายการใหม่',
  image_unavailable: 'ข้อมูลภาพไม่พร้อมสำหรับเปิดดู',
  received: 'รับภาพ',
  unclassified: 'ยังระบุไม่ได้ว่าเป็นหลักฐานโอนเงิน',
  not_extracted: 'ยังไม่ได้อ่านข้อมูลจากภาพ ต้องตรวจภาพจริง',
  extraction_unavailable: 'อ่านข้อมูลจากภาพไม่ได้ ต้องตรวจภาพจริง',
  metadata_unavailable: 'อ่านข้อมูลประกอบภาพไม่ได้ ยังไม่สรุปผล',
  manual_review: 'หยุดลองอัตโนมัติแล้ว เก็บภาพไว้รอตรวจ',
  non_payment: 'ระบบจัดเป็นภาพที่ไม่ใช่หลักฐานชำระเงิน',
  promoted: 'ส่งต่อเข้าคิวหลักฐานแล้ว ยังไม่ใช่การยืนยันเงินเข้า',
});

export function heldDocumentNavigation(active = false) {
  return `<nav class="held-nav" aria-label="${HELD_REVIEW_COPY.navigation_label}"><a href="/internal/admin/payments"${!active ? ' aria-current="page"' : ''}>${HELD_REVIEW_COPY.proofs}</a><a href="/internal/admin/payments?view=held-images"${active ? ' aria-current="page"' : ''}>${HELD_REVIEW_COPY.title}</a></nav>`;
}

export function renderHeldDocumentPage(template) {
  const copy = HELD_REVIEW_COPY;
  const main = `<main>${heldDocumentNavigation(true)}<header class="brand"><strong>MMD PRIVÉ · MONEY CONTROL</strong><span>${copy.read_only}</span></header>
  <h1>${copy.title}</h1><p class="lead">${copy.lead}</p><aside class="notice">${copy.notice}</aside>
  <section class="queue" aria-label="${copy.title}"><div class="q-head"><h2>${copy.title}</h2><button id="held-refresh" type="button">${copy.refresh}</button></div>
    <p id="held-status" class="held-status" role="status" aria-live="polite">${copy.loading}</p><div id="held-list"></div><div class="held-footer"><button id="held-more" type="button" hidden>${copy.more}</button></div></section>
  <section id="held-viewer" class="detail" aria-labelledby="held-viewer-title" hidden><div class="detail-head"><h2 id="held-viewer-title">${copy.title}</h2><button id="held-close" type="button">${copy.close}</button></div><p id="held-image-status" role="status" aria-live="polite"></p><div id="held-image" class="evidence"></div><p>${copy.notice}</p></section></main>`;
  const style = `<style>.held-nav{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 14px}.held-nav a{padding:10px 14px;border:1px solid #d4a27c;border-radius:10px;text-decoration:none;min-height:44px}.held-nav [aria-current]{background:#ffdfc5;color:#572b13;font-weight:700}.held-row{padding:16px;border-top:1px solid #e5d6cb;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px}.held-row h3{margin:0;font-size:19px;overflow-wrap:anywhere}.held-row p{margin:4px 0;overflow-wrap:anywhere}.held-row small{color:#59616c}.held-row button{align-self:center}.held-status,.held-footer{padding:12px 16px}button{min-height:44px;padding:9px 14px;border:1px solid #d4a27c;border-radius:9px;background:#ffdfc5;color:#572b13;cursor:pointer}button:disabled{opacity:.6;cursor:wait}#held-viewer .evidence{min-height:100px}#held-viewer img{max-width:100%;max-height:65vh;object-fit:contain}#held-list{min-width:0}#held-status:empty{display:none}@media(max-width:600px){.held-row{grid-template-columns:1fr}.held-row button{width:100%}.held-nav a{flex:1;text-align:center}.q-head h2{margin:0;font-size:19px}}</style>`;
  // Strip the payment-action script, not just its controls. The held view never
  // fetches Payment Proofs or includes payment decisions/upload/reprocess code.
  return template.replace(/<title>[^<]*<\/title>/, `<title>${copy.title} · Money Control</title>`)
    .replace('</head>', `${style}</head>`).replace(/<main>[\s\S]*?<\/main>/, main)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace('</body>', `<script>${HELD_DOCUMENT_CLIENT};heldDocumentClient(${JSON.stringify(copy)});</script></body>`);
}

// A function serialized after Worker bundling can contain injected helpers such
// as __name, which do not exist in the browser. Keep this standalone browser
// program as source text, following the existing Booking Models page contract.
export const HELD_DOCUMENT_CLIENT = String.raw`function heldDocumentClient(copy) {
  const byId = id => document.getElementById(id);
  const list = byId('held-list');
  const more = byId('held-more');
  const refresh = byId('held-refresh');
  const status = byId('held-status');
  const viewer = byId('held-viewer');
  let cursor = null;
  let busy = false;
  let generation = 0;
  const shown = new Set();
  function text(tag, value) { const el = document.createElement(tag); el.textContent = value; return el; }
  function close() { generation += 1; byId('held-image').replaceChildren(); viewer.hidden = true; }
  byId('held-close').addEventListener('click', close);
  function show(item, name) {
    close();
    const current = generation;
    viewer.hidden = false;
    byId('held-viewer-title').textContent = name;
    byId('held-image-status').textContent = copy.image_loading;
    const image = document.createElement('img');
    image.alt = copy.title + ' · ' + name;
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('load', () => { if (current === generation) byId('held-image-status').textContent = copy.notice; });
    image.addEventListener('error', () => { if (current === generation) { byId('held-image-status').textContent = copy.image_error; image.remove(); } });
    image.src = item.image_url;
    byId('held-image').replaceChildren(image);
    viewer.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
  function row(item) {
    const el = document.createElement('article');
    el.className = 'held-row';
    const info = document.createElement('div');
    const name = item.customer || copy.unknown_customer;
    info.append(text('h3', name));
    info.append(text('p', copy[item.reason] || copy.metadata_unavailable));
    const identity = item.identity_state === 'exact_line_client_per_rename_v1' ? copy.verified_name : item.identity_state === 'ambiguous' ? copy.ambiguous_customer : item.identity_state === 'lookup_unavailable' ? copy.identity_unavailable : copy.unknown_customer;
    info.append(text('p', identity));
    if (copy[item.retention_state]) info.append(text('p', copy[item.retention_state]));
    const date = item.received_at && Number.isFinite(Date.parse(item.received_at)) ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(item.received_at)) : copy.unknown_date;
    info.append(text('p', copy.received + ': ' + date));
    info.append(text('small', copy.reference + ': ' + item.reference));
    el.append(info);
    if (typeof item.image_url === 'string' && /^\/v1\/admin\/payments\/held-images\/image\?id=[A-Za-z0-9_%.-]+$/.test(item.image_url)) {
      const button = text('button', copy.open); button.type = 'button'; button.addEventListener('click', () => show(item, name)); el.append(button);
    } else el.append(text('p', copy.image_unavailable));
    return el;
  }
  async function load(reset) {
    if (busy) return;
    busy = true; more.disabled = true; refresh.disabled = true;
    status.textContent = copy.loading;
    if (reset) { cursor = null; list.replaceChildren(); shown.clear(); close(); }
    try {
      const response = await fetch('/v1/admin/payments/held-images' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (data.ok !== true || data.read_only !== true || !Array.isArray(data.items)) throw new Error('invalid_data');
      for (const item of data.items) {
        if (!item || typeof item.reference !== 'string' || shown.has(item.reference)) continue;
        shown.add(item.reference); list.append(row(item));
      }
      cursor = typeof data.next_cursor === 'string' ? data.next_cursor : null;
      more.hidden = !cursor; status.textContent = shown.size ? '' : copy.empty;
    } catch { status.textContent = copy.error; }
    finally { busy = false; more.disabled = false; refresh.disabled = false; }
  }
  refresh.addEventListener('click', () => void load(true));
  more.addEventListener('click', () => void load(false));
  void load(true);
}`;
