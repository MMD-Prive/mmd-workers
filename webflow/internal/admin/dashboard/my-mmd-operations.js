// Owner-only read view. No business writes or automatic approvals.
(function () {
  'use strict';
  const parent = document.getElementById('my-mmd-management');
  if (!parent || document.getElementById('my-mmd-live-operations')) return;
  const host = document.createElement('section'); host.id = 'my-mmd-live-operations';
  const title = document.createElement('h3'); title.textContent = 'คิวดูแลสมาชิก';
  const state = document.createElement('p'); state.setAttribute('role', 'status');
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'โหลดคิวใหม่'; retry.style.cssText = 'min-height:48px;padding:10px 18px;font:inherit;background:#ffd29c;color:#202329;border:0;border-radius:8px';
  const list = document.createElement('div');
  host.append(title, state, retry, list); parent.append(host);
  function link(value) {
    try { const u = new URL(value, location.origin); return u.protocol === 'https:' && !u.username && !u.password && ['mmdbkk.com', 'www.mmdbkk.com', 'mmdprive.design.webflow.com'].includes(u.hostname) ? u.href : null; } catch { return null; }
  }
  let sequence = 0, active;
  async function load() {
    const current = ++sequence; active?.abort(); const controller = new AbortController(); active = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    state.textContent = 'กำลังอ่านคิว'; list.replaceChildren(); retry.disabled = true;
    try {
      const response = await fetch('/v1/admin/dashboard?view=my-mmd-operations', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { accept: 'application/json' } });
      if (response.status === 401 || response.status === 403) { if (current === sequence) state.textContent = 'คิวนี้เปิดได้เฉพาะบัญชี Owner ที่เข้าสู่ระบบแล้ว'; return; }
      const data = await response.json(); if (current !== sequence) return;
      if (!response.ok || data.ok !== true || !Array.isArray(data.groups)) throw Error();
      state.textContent = 'อัปเดต ' + new Date(data.checked_at).toLocaleString('th-TH') + (data.state === 'partial' ? ' · บางคิวยังตรวจไม่ได้' : '');
      for (const group of data.groups) {
        const box = document.createElement('details'); const summary = document.createElement('summary');
        const resolved = group.state === 'resolved' && Array.isArray(group.items) && group.count === group.items.length;
        summary.textContent = group.title + ' · ' + (resolved ? group.count + ' รายการที่แสดง' : 'ยังตรวจไม่ได้'); box.append(summary);
        const note = document.createElement('p');
        note.textContent = group.id === 'identity' ? 'ตรวจโครงสร้างข้อมูล ยังไม่รับรองสิทธิ์หรือยอดเงิน' : group.id === 'coupons' ? 'แสดงเฉพาะกลุ่มเคสค้างจาก HYPE watch ไม่ใช่คูปองทั้งหมด' : group.id === 'payments' ? 'แสดงรายการจากคิว Payments ที่โหลดได้ ไม่ใช่จำนวนทั้งหมดของระบบ' : group.id === 'renewals' ? 'ยังไม่เชื่อมข้อมูลรับเงินกับการอัปเดตสิทธิ์ จึงยังสรุปจำนวนไม่ได้' : 'เลือก CMS → MMD NOW เพื่อแก้ไขฉบับร่าง'; box.append(note);
        const target = link(group.href); if (target) { const a = document.createElement('a'); a.href = target; a.textContent = 'เปิดหน้าจัดการ →'; box.append(a); }
        if (resolved) {
          let offset = 0;
          const rows = document.createElement('div'), more = document.createElement('button');
          more.type = 'button'; more.textContent = 'ดูเพิ่ม'; more.style.cssText = retry.style.cssText;
          function append() {
            for (const item of group.items.slice(offset, offset + 10)) {
              const row = document.createElement('p'), target = link(item.href);
              const content = target ? document.createElement('a') : document.createElement('span');
              if (target) content.href = target;
              content.textContent = item.title + (item.affected_count != null ? ' · ' + item.affected_count + ' เคส' : ''); row.append(content); rows.append(row);
            }
            offset += 10; more.hidden = offset >= group.items.length;
          }
          more.onclick = append; append(); box.append(rows, more);
          if (!group.count) { const empty = document.createElement('p'); empty.textContent = 'ไม่มีรายการในขอบเขตที่ตรวจได้'; box.append(empty); }
        }
        list.append(box);
      }
    } catch { if (current === sequence) state.textContent = 'ยังโหลดคิวไม่ได้ กดโหลดใหม่ได้'; }
    finally { clearTimeout(timeout); if (current === sequence) retry.disabled = false; }
  }
  retry.onclick = load; load();
})();
