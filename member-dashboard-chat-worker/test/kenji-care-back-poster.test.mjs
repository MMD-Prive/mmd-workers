import assert from 'node:assert/strict';
import test from 'node:test';
import { careBackPosterMessages } from '../src/kenji-care-back-poster.mjs';

const NOW = Date.parse('2026-10-31T21:00:00+07:00');
const URL = 'https://approved-assets.example/care-back-20261031.png';
const PREVIEW = 'https://approved-assets.example/care-back-20261031-preview.jpg';
const POSTER = { url: URL, preview_url: PREVIEW };
const REPLY = { text: 'CARE BACK วันนี้วันสุดท้ายครับ 🖤\nข้อความที่อนุมัติแล้ว',
  route: 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=signup&view=signup&world=private',
  label: 'สมัคร / เช็กสิทธิ์' };
const CTA = `${REPLY.label} → ${REPLY.route}`;

test('both actual reply render formats become text, image, CTA without changing approved words or route', () => {
  for (const separator of ['\n', '\n\n']) {
    const result = careBackPosterMessages(REPLY.text + separator + CTA, [], REPLY, POSTER, NOW);
    assert.deepEqual(result, { text: REPLY.text, extra_messages: [
      { type: 'image', originalContentUrl: URL, previewImageUrl: PREVIEW }, { type: 'text', text: CTA, quickReply: { items: [{ type: 'action', action: { type: 'uri', label: REPLY.label, uri: REPLY.route } }] } },
    ] });
  }
});

test('announcement media stops at Nov 1 Bangkok while this helper never changes eligibility', () => {
  const text = `${REPLY.text}\n${CTA}`;
  for (const now of [Date.parse('2026-10-30T23:59:59.999+07:00'),
    Date.parse('2026-11-01T00:00:00+07:00'), Date.parse('2026-12-31T12:00:00+07:00'), NaN]) {
    assert.equal(careBackPosterMessages(text, [], REPLY, POSTER, now), null);
  }
  assert.ok(careBackPosterMessages(text, [], REPLY, POSTER, Date.parse('2026-10-31T23:59:59.999+07:00')));
});

test('after the wave only exact neutral status navigation gets one CTA button and no image', () => {
  const neutral = {
    text: 'กดตรวจข้อเสนอและสิทธิ์ล่าสุดจากบัญชีเดิมได้เลยครับ',
    route: 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview',
    label: 'ตรวจข้อเสนอล่าสุด',
  };
  for (const now of [Date.parse('2026-11-01T00:00:00+07:00'), Date.parse('2026-12-31T12:00:00+07:00')]) {
    for (const separator of ['\n', '\n\n']) {
      const cta = `${neutral.label} → ${neutral.route}`;
      const result = careBackPosterMessages(neutral.text + separator + cta, [], neutral, null, now);
      assert.deepEqual(result, { text: neutral.text, extra_messages: [{
        type: 'text', text: cta, quickReply: { items: [{ type: 'action', action: {
          type: 'uri', label: neutral.label, uri: neutral.route,
        } }] },
      }] });
      assert.equal(result.extra_messages.some(message => message.type === 'image'), false);
    }
    for (const invalid of [REPLY, { ...neutral, text: REPLY.text },
      { ...neutral, route: REPLY.route }, { ...neutral, label: REPLY.label }]) {
      assert.equal(careBackPosterMessages(`${invalid.text}\n${invalid.label} → ${invalid.route}`, [], invalid, POSTER, now), null);
    }
  }
});

test('unrelated text, partial matches, Checkpts, Model replies and changed CTA stay untouched', () => {
  for (const text of ['checkpts', 'GWs37', 'CARE BACK', REPLY.text, `${REPLY.text}\nสมัครเลย → https://other.example/`,
    `ชื่อผู้รับ ${REPLY.text}\n${CTA}`, `${REPLY.text}\n${CTA}\nข้อความอื่น`, { text: REPLY.text }]) {
    assert.equal(careBackPosterMessages(text, [], REPLY, POSTER, NOW), null);
  }
});

test('existing extra messages are never replaced, duplicated or reordered', () => {
  const extra = [{ type: 'image', originalContentUrl: URL, previewImageUrl: PREVIEW }];
  const before = structuredClone(extra);
  assert.equal(careBackPosterMessages(`${REPLY.text}\n${CTA}`, extra, REPLY, POSTER, NOW), null);
  assert.deepEqual(extra, before);
  for (const extraMessages of [null, {}, '']) assert.equal(careBackPosterMessages(`${REPLY.text}\n${CTA}`, extraMessages, REPLY, POSTER, NOW), null);
});

test('poster requires an immutable HTTPS asset URL and a complete approved reply', () => {
  for (const posterUrl of ['', 'http://approved-assets.example/a.png', 'https://user:pass@example.com/a.png',
    'https://example.com/a.png?token=secret', 'https://example.com/a.png#fragment', 'not a URL']) {
    assert.equal(careBackPosterMessages(`${REPLY.text}\n${CTA}`, [], REPLY, { ...POSTER, preview_url: posterUrl }, NOW), null);
  }
  for (const reply of [null, {}, { ...REPLY, text: '' }, { ...REPLY, route: '' }]) {
    assert.equal(careBackPosterMessages(`${REPLY.text}\n${CTA}`, [], reply, POSTER, NOW), null);
  }
});
