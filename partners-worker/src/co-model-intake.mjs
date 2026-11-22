const MODES = new Set(['Bridge', 'รวมโม', 'หารกำไร']);
const RESPONSES = new Set(['interested', 'needs_info', 'declined']);
const TTL = 48 * 60 * 60 * 1000;

// store.update(id, callback) must serialize and persist updates for one request.
// authenticatePartner must return the canonical ID from the existing Partner verifier.
export function createIntake({ store, authenticatePartner, now = Date.now, randomId = () => crypto.randomUUID() }) {
  async function manage(owner, id, operation, draft) {
    if (owner?.role !== 'owner') return { status: 403 };
    return store.update(id, current => {
      if (operation === 'revoke' && current) {
        return [{ ...current, linkId: null }, { status: 204 }];
      }
      if (operation === 'issue_once' && current) {
        const same = draft && ['partnerId', 'mode', 'description'].every(key => current[key] === draft[key]);
        if (!same || !current.linkId || now() >= current.expiresAt) return [current, { status: 409 }];
        return [current, { status: 201, linkId: current.linkId, expiresAt: current.expiresAt }];
      }
      if (!['issue', 'issue_once'].includes(operation) || current?.answer) return [current, { status: 409 }];
      const source = current ?? draft;
      if (!MODES.has(source?.mode) || !source.partnerId || typeof source.description !== 'string') {
        return [current, { status: 422 }];
      }
      const record = {
        mode: source.mode, partnerId: source.partnerId, description: source.description,
        linkId: randomId(), expiresAt: now() + TTL, answer: null,
      };
      return [record, { status: 201, linkId: record.linkId, expiresAt: record.expiresAt }];
    });
  }

  async function receive(request, id, linkId) {
    const partner = await authenticatePartner(request);
    if (!partner?.id) return { status: 401 };
    const method = request.method;
    if (method !== 'GET' && method !== 'POST') return { status: 405 };
    let choice;
    if (method === 'POST') {
      if (request.headers.get('origin') !== new URL(request.url).origin) return { status: 403 };
      const body = await request.formData().catch(() => null);
      choice = body?.get('choice');
    }
    return store.update(id, current => {
      if (!current || current.partnerId !== partner.id || !current.linkId || current.linkId !== linkId) {
        return [current, { status: 404 }];
      }
      if (now() >= current.expiresAt) return [current, { status: 410 }];
      if (method === 'GET') return [current, {
        status: 200, mode: current.mode, description: current.description,
        expiresAt: current.expiresAt, answer: current.answer,
      }];
      if (current.answer) return [current, { status: 200, answer: current.answer }];
      if (!RESPONSES.has(choice)) return [current, { status: 422 }];
      const answer = { choice, submittedAt: now() };
      return [{ ...current, answer }, { status: 200, answer }];
    });
  }
  return { manage, receive };
}

export function renderIntake(result, request) {
  const escape = value => String(value).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const action = request ? new URL(request.url) : null;
  const available = result.status === 200;
  const expiry = available ? new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(result.expiresAt) : '';
  const content = available
    ? `<h1>MY CO MODEL · ${escape(result.mode)}</h1><p>${escape(result.description)}</p><p>หมดอายุ ${escape(expiry)} (เวลาไทย)</p>${
      result.answer ? '<p>บันทึกคำตอบแล้ว</p>' : `<form method="post" action="${escape(action ? action.pathname + action.search : '')}"><fieldset ${action ? '' : 'disabled'}><legend>ตอบคำขอ</legend>
      <button name="choice" value="interested">สนใจ</button><button name="choice" value="needs_info">ขอข้อมูลเพิ่ม</button>
      <button name="choice" value="declined">ไม่สะดวก</button></fieldset></form>`}`
    : '<h1>เปิดคำขอนี้ไม่ได้</h1>';
  return new Response(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MY CO MODEL</title><main>${content}</main></html>`, {
    status: result.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
