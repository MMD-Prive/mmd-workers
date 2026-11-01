/** DOM-safe adapter of Pack V2 progress.js. Completion is driven by request and validation milestones. */
export function mmsGraphicRuntime() {
  const root = document.getElementById('graphic-progress');
  if (!root) return;
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
  const labels = el('div', null, 'mms-progress-label');
  const label = el('span'), percent = el('span', '0%'); labels.append(label, percent);
  const track = el('div', null, 'mms-track'), fill = el('div', null, 'mms-fill');
  for (const [name, value] of Object.entries({ role: 'progressbar', 'aria-label': 'ความคืบหน้าของคำขอ', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' })) track.setAttribute(name, value);
  track.append(fill);
  const status = el('p'); status.setAttribute('role', 'status');
  const retry = el('button', 'ตรวจข้อมูลอีกครั้ง'); retry.type = 'button'; retry.hidden = true;
  retry.onclick = () => document.getElementById('retry')?.click();
  root.className = 'mms-progress'; root.replaceChildren(labels, track, status, retry);
  let generation = 0;
  const draw = value => { percent.textContent = value + '%'; fill.style.width = value + '%'; track.setAttribute('aria-valuenow', String(value)); };
  window.MmsGraphics = {
    begin(text = 'กำลังรับข้อมูลจากระบบครับ') { const id = ++generation; root.hidden = false; root.dataset.state = 'loading'; label.textContent = text; status.textContent = 'ส่งคำขอแล้ว · ระหว่างรอเปอร์เซ็นต์จะคงเดิมครับ'; retry.hidden = true; draw(0); return id; },
    received(id) { if (id !== generation) return; draw(50); status.textContent = 'ได้รับคำตอบแล้ว · กำลังตรวจข้อมูลครับ'; },
    ready(id) { if (id !== generation) return; draw(100); root.hidden = true; },
    fail(id, text = 'ยังโหลดข้อมูลไม่ได้ครับ ลองตรวจข้อมูลอีกครั้ง') { if (id !== generation) return; root.dataset.state = 'error'; label.textContent = 'ยังตรวจสอบไม่สำเร็จ'; status.textContent = text; retry.hidden = false; },
    failCurrent(text) { this.fail(generation, text); },
    cancel() { generation += 1; root.hidden = true; },
  };
}
