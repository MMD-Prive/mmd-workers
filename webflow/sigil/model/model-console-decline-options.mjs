import { normalizeModelDecline } from '../../../shared/model-decline-options.mjs';

// Local form only. Existing action handling owns permissions and transport.
export function openModelDecline(root, submit, lang = 'th') {
  const host = root.querySelector('[data-primary-actions]');
  if (!host || host.querySelector('[data-decline-options]')) return;
  const copy = lang === 'en'
    ? ['Unavailable', 'Propose 1–3 future times (Asia/Bangkok). Per reviews these; no booking is confirmed.', 'Add time', 'Reason (optional)', 'Send proposal', 'Cancel', 'Choose 1–3 different future times.', 'Not saved. Check the current job before trying again.']
    : lang === 'zh'
    ? ['不方便', '提供 1–3 个未来时间（曼谷时间）。由 Per 审核，不会自动确认预约。', '添加时间', '原因（选填）', '提交建议', '取消', '请选择 1–3 个不同的未来时间。', '尚未保存，请先检查当前工作。']
    : ['ไม่สะดวก', 'เสนอวันเวลาใหม่ 1–3 ตัวเลือก (เวลาไทย) ให้เปอร์พิจารณา ไม่ยืนยันนัดหรือส่งให้ลูกค้าอัตโนมัติ', 'เพิ่มวันเวลา', 'เหตุผล (ไม่บังคับ)', 'ส่งข้อเสนอ', 'ยกเลิก', 'เลือกวันเวลาอนาคตที่ไม่ซ้ำกัน 1–3 ตัวเลือกครับ', 'ยังไม่บันทึก ตรวจสถานะงานก่อนลองอีกครั้งครับ'];
  const form = document.createElement('form'); form.dataset.declineOptions = ''; form.className = 'smcv3-card'; form.style.cssText = 'flex-basis:100%;width:100%';
  const title = document.createElement('h2'); title.textContent = copy[0];
  const help = document.createElement('p'); help.textContent = copy[1];
  const slots = document.createElement('div');
  const add = document.createElement('button'); add.type = 'button'; add.textContent = copy[2];
  function addSlot() {
    if (slots.children.length >= 3) return;
    const label = document.createElement('label'); label.textContent = (lang === 'en' ? 'Option ' : lang === 'zh' ? '时间 ' : 'ตัวเลือก ') + (slots.children.length + 1);
    const input = document.createElement('input'); input.type = 'datetime-local'; input.required = slots.children.length === 0;
    input.min = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
    input.style.cssText = 'display:block;width:100%;min-height:44px;color:#17120b;-webkit-text-fill-color:#17120b;background:#f3f0e8';
    label.append(input); slots.append(label); add.disabled = slots.children.length >= 3;
  }
  const reasonLabel = document.createElement('label'); reasonLabel.textContent = copy[3];
  const reason = document.createElement('textarea'); reason.maxLength = 200; reasonLabel.append(reason);
  const send = document.createElement('button'); send.type = 'submit'; send.textContent = copy[4];
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = copy[5];
  const message = document.createElement('p'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  let pending = false;
  add.addEventListener('click', addSlot);
  cancel.addEventListener('click', () => { if (!pending) { form.remove(); host.querySelector('[data-action="decline_job"]')?.focus(); } });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (pending) return;
    const input = { reason: reason.value, availability_options: [...slots.querySelectorAll('input')].map(input => input.value).filter(Boolean) };
    if (!normalizeModelDecline(input).ok) { message.textContent = copy[6]; return; }
    pending = true; send.disabled = true; cancel.disabled = true; add.disabled = true;
    try { if (await submit(input) === true) form.remove(); else message.textContent = copy[7]; }
    catch { message.textContent = copy[7]; }
    finally { pending = false; send.disabled = false; cancel.disabled = false; add.disabled = slots.children.length >= 3; }
  });
  form.append(title, help, slots, add, reasonLabel, send, cancel, message);
  addSlot(); host.append(form); slots.querySelector('input').focus();
}
