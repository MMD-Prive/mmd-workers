const MODES = ['Bridge', 'รวมโม', 'หารกำไร'];
const PATH = '/internal/admin/console/co-model-requests';
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function page(content, status = 200) {
  return new Response(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MY CO MODEL</title><main><h1>MY CO MODEL · ออกลิงก์คำขอ</h1>${content}</main></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" },
  });
}

export async function handleCoModelOwner(request, env, actor) {
  if (actor?.role !== 'owner') return page('เฉพาะ Owner', 403);
  const service = env.CO_MODEL_OWNER;
  if (!service) return page('ยังเชื่อม MY PARTNER ไม่ได้', 503);
  try {
    if (request.method === 'GET') {
      const partners = await service.recipients();
      const options = partners.map(({id, name}) => `<option value="${escape(id)}">${escape(name)} · ${escape(id)}</option>`).join('');
      return page(`<form method="post" action="${PATH}"><label>บัญชี MY PARTNER <select name="partner" required><option value="">เลือกบัญชี</option>${options}</select></label>
      <label>โหมด <select name="mode" required><option value="">เลือกโหมด</option>${MODES.map(mode => `<option>${mode}</option>`).join('')}</select></label>
      <label>รายละเอียดที่ผู้รับจะเห็น <textarea name="description" maxlength="2000" required></textarea></label>
      <input type="hidden" name="draft" value="${crypto.randomUUID()}"><button type="submit">ออกลิงก์ 48 ชั่วโมง</button></form>`);
    }
    if (request.method !== 'POST') return page('ไม่รองรับคำขอนี้', 405);
    if (request.headers.get('origin') !== new URL(request.url).origin) return page('เปิดจาก Dashboard อีกครั้ง', 403);
    const form = await request.formData().catch(() => null);
    const text = key => String(form?.get(key) ?? '').trim();
    const id = text('draft'), partnerId = text('partner'), mode = text('mode'), description = text('description');
    if (!/^[a-f0-9-]{36}$/.test(id) || !/^rec[a-zA-Z0-9]{14,24}$/.test(partnerId) ||
        !MODES.includes(mode) || !description || description.length > 2000) return page('กรุณาตรวจข้อมูลคำขอ', 422);
    const result = await service.issue(id, { partnerId, mode, description });
    if (result.status !== 201) return page('ออกลิงก์ไม่ได้ กรุณาตรวจบัญชีหรือคำขอเดิม', result.status);
    const href = new URL('/partner/dashboard/co-model-request', request.url);
    href.search = new URLSearchParams({request:id, link:result.linkId}).toString();
    const expiry = new Intl.DateTimeFormat('th-TH', {dateStyle:'medium', timeStyle:'short',timeZone:'Asia/Bangkok'}).format(result.expiresAt);
    return page(`<p>หมดอายุ ${escape(expiry)} (เวลาไทย)</p><label>ลิงก์ให้ผู้รับ <input readonly value="${escape(href.href)}"></label><p>หากยังไม่ได้เข้าสู่ MY PARTNER ให้เปิด Dashboard เดิมและกรอกรหัสคำขอด้านล่าง</p><p>รหัสคำขอ <code>${escape(id)}</code></p><p>รหัสลิงก์ <code>${escape(result.linkId)}</code></p>`, 201);
  } catch {
    return page('ระบบคำขอยังไม่พร้อม กรุณาลองใหม่', 503);
  }
}
