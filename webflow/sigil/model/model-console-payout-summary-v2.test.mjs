import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./model-console-payout-summary-v2.html", import.meta.url), "utf8");

test("payout summary accepts canonical model payout and terms", () => {
  assert.match(source, /expected_payout_thb\?\?session\.pay_model_thb/);
  assert.match(source, /session&&session\.payout_terms/);
  assert.match(source, /smcv3-payout-only__label">ยอดเงินถึงตัวคุณ<\/span>/);
  assert.match(source, /ยอดนี้คือค่าตัวที่คุณได้รับตามงานนี้ ไม่ใช่ราคาที่ลูกค้าจ่าย/);
  assert.match(source, /เวลาจบที่ MMD ยืนยัน/);
});

test("payout summary distinguishes Public and Private money systems", () => {
  assert.match(source, /PUBLIC MONEY · PACKAGE \/ SESSION/);
  assert.match(source, /PRIVATE MONEY · CASE LOCKED/);
  assert.match(source, /ไม่ใช้ราคา Package, OT หรือ After Midnight Matrix ของ Public โดยอัตโนมัติ/);
  assert.match(source, /MMD ออกเรท Private ของเคสใหม่และยืนยันก่อน/);
});

test("payout summary explains official extension boundary", () => {
  assert.match(source, /MY MMD → คุณกด Approve ใน MY MODEL → MMD ยืนยัน/);
  assert.match(source, /OT หลัง 00:00/);
  assert.match(source, /OT หลัง 03:00/);
});

test("payout summary does not expose customer pricing or MMD margin", () => {
  assert.doesNotMatch(source, /customer_sell_rate_thb|customer_amount_due_thb|margin_thb|commission_thb/);
});

// Execute the existing embed with a local fetch mock; never contact a backend.
async function extensionFixture(sessionId = 'sess_displayed', failure = false) {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<section id="sigil-model-console-v3"><div class="smcv3-summary"></div></section>', {
    url: 'https://fixture.invalid/sigil/model/console?t=fixture_signed_reference', runScripts: 'outside-only',
  });
  const win = dom.window;
  if (win.document.readyState === 'loading') await new Promise(resolve => win.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const session = { session_id: sessionId, expected_payout_thb: 10000 };
  const posts = [];
  let reads = 0;
  win.fetch = async (_url, options = {}) => {
    if (options.method === 'POST') {
      posts.push(JSON.parse(options.body));
      return { ok: !failure, json: async () => failure ? { ok: false, error: 'session_context_changed' } : { ok: true } };
    }
    reads++;
    return { ok: true, json: async () => ({ ok: true, session, extension_request: {
      request_id: 'extension_displayed', status: 'requested', requested_minutes: 30, model_payout_thb: 1000,
      original_end_at: '2099-01-01T12:00:00Z', requested_end_at: '2099-01-01T12:30:00Z',
    } }) };
  };
  const script = source.match(/<script id="smcv3-payout-only-js">([\s\S]*?)<\/script>/)[1];
  win.eval(script);
  await new Promise(resolve => setImmediate(resolve));
  return { dom, session, posts, reads: () => reads };
}

for (const [selector, action] of [['data-ext-approve', 'approve_extension'], ['data-ext-decline', 'decline_extension']]) {
  test(`${action} sends the rendered session snapshot and preserves the extension reference`, async () => {
    const fixture = await extensionFixture();
    try {
      const button = fixture.dom.window.document.querySelector(`[${selector}]`);
      assert.ok(button);
      // A later mutation must not retarget a decision from the already rendered card.
      fixture.session.session_id = 'sess_different';
      button.click();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(fixture.posts, [{
        t: 'fixture_signed_reference', action, session_id: 'sess_displayed', extension_request_id: 'extension_displayed',
      }]);
      assert.equal(fixture.reads(), 2, 'success refreshes the current backend state');
    } finally { fixture.dom.window.close(); }
  });
}

test('extension decisions stay unavailable without a valid displayed session', async () => {
  for (const sessionId of [undefined, null, '', '  ', 5]) {
    const fixture = await extensionFixture(sessionId === undefined ? null : sessionId);
    try {
      assert.equal(fixture.dom.window.document.querySelector('[data-model-extension-request]'), null);
      assert.equal(fixture.posts.length, 0);
    } finally { fixture.dom.window.close(); }
  }
});

test('a rejected extension decision keeps the card and does not retry the action', async () => {
  const fixture = await extensionFixture('sess_displayed', true);
  try {
    const doc = fixture.dom.window.document;
    doc.querySelector('[data-ext-approve]').click();
    await new Promise(resolve => setImmediate(resolve));
    const card = doc.querySelector('[data-model-extension-request]');
    assert.ok(card);
    assert.match(card.querySelector('p:last-of-type').textContent, /ยังบันทึกคำตอบไม่ได้/);
    assert.ok([...card.querySelectorAll('button')].every(button => !button.disabled));
    assert.equal(fixture.posts.length, 1);
    assert.equal(fixture.reads(), 1);
  } finally { fixture.dom.window.close(); }
});
