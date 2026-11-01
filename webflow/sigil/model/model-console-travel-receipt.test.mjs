import assert from 'node:assert/strict';
import test from 'node:test';
import { installModelTravelReceiptNotice } from './model-console-travel-receipt.mjs';

const actionUrl = 'https://www.mmdbkk.com/v1/model/session/action';

function fixture({ lang = 'th', payload = { ok: true, notification: { delivered: true } }, status = 200 } = {}) {
  const scheduled = [];
  const classes = [];
  const toast = { textContent: 'บันทึกสถานะแล้วครับ', classes, classList: { add(value) { classes.push(value); } } };
  const doc = { querySelector(selector) { assert.equal(selector, '[data-toast]'); return toast; } };
  const win = {
    location: { href: `https://www.mmdbkk.com/sigil/model/console?lang=${lang}`, origin: 'https://www.mmdbkk.com' },
    localStorage: { getItem() { return lang; } },
    setTimeout(callback, delay) { scheduled.push({ callback, delay }); return scheduled.length; },
    fetch: async () => Response.json(payload, { status }),
  };
  return { doc, scheduled, toast, win };
}

async function postAction(win, action = 'start_travel') {
  return win.fetch(actionUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, session_id: 'sess_LOCAL_FIXTURE_ONLY' }),
  });
}

test('start_travel reports LINE acceptance only when backend receipt says delivered', async () => {
  const { doc, scheduled, toast, win } = fixture();
  assert.equal(installModelTravelReceiptNotice(win, doc), true);
  const response = await postAction(win);
  assert.equal(response.status, 200);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 0);
  scheduled[0].callback();
  assert.match(toast.textContent, /เริ่มเดินทางแล้ว/);
  assert.match(toast.textContent, /LINE รับคำขอแจ้งลูกค้าแล้ว/);
  assert.doesNotMatch(toast.textContent, /ลูกค้าได้รับแล้ว/);
  assert.deepEqual(toast.classes, ['is-show']);
});

test('missing or pending notification receipt remains explicitly unconfirmed', async () => {
  for (const notification of [undefined, { delivered: false, status: 'pending' }, { status: 'unavailable' }]) {
    const payload = { ok: true, ...(notification ? { notification } : {}) };
    const { doc, scheduled, toast, win } = fixture({ payload });
    installModelTravelReceiptNotice(win, doc);
    await postAction(win);
    scheduled[0].callback();
    assert.match(toast.textContent, /ยังยืนยันการแจ้ง LINE ไม่ได้/);
  }
});

test('status copy follows the selected Console language', async () => {
  const cases = [
    ['en', 'LINE accepted the customer notice'],
    ['zh', 'LINE 已接受客户通知'],
  ];
  for (const [lang, expected] of cases) {
    const { doc, scheduled, toast, win } = fixture({ lang });
    installModelTravelReceiptNotice(win, doc);
    await postAction(win);
    scheduled[0].callback();
    assert.ok(toast.textContent.includes(expected));
  }
});

test('non-travel requests and unsuccessful actions never show a travel receipt', async () => {
  const { doc, scheduled, toast, win } = fixture({ payload: { ok: false, error: 'invalid_transition' }, status: 409 });
  installModelTravelReceiptNotice(win, doc);
  await postAction(win, 'mark_arrived');
  await postAction(win, 'start_travel');
  assert.equal(scheduled.length, 0);
  assert.equal(toast.textContent, 'บันทึกสถานะแล้วครับ');
});

test('receipt hook installs once and leaves the response body readable by Console runtime', async () => {
  const { doc, scheduled, win } = fixture();
  assert.equal(installModelTravelReceiptNotice(win, doc), true);
  const wrapped = win.fetch;
  assert.equal(installModelTravelReceiptNotice(win, doc), false);
  assert.equal(win.fetch, wrapped);
  const response = await postAction(win);
  assert.deepEqual(await response.json(), { ok: true, notification: { delivered: true } });
  assert.equal(scheduled.length, 1);
});
