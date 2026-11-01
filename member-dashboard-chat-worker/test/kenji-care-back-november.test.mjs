import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { careBackOctoberReply } from '../src/kenji-care-back-october.mjs';
import { careBackPosterMessages } from '../src/kenji-care-back-poster.mjs';

const NOVEMBER_START = Date.parse('2026-11-01T00:00:00+07:00');
const NOVEMBER_END = Date.parse('2026-12-01T00:00:00+07:00');
const OCTOBER = NOVEMBER_START - 1;
const SIGNUP = 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=signup&view=signup&world=private';
const STATUS = 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview';
const APPROVED_NOVEMBER = 'CARE BACK ต่อโปรถึง 30 พ.ย. 2569 ครับ 🖤\nสมาชิกปัจจุบันต่ออายุล่วงหน้า รับเพิ่ม 6 เดือน\nหมดอายุไม่เกิน 6 เดือน สมัครแล้วรับเพิ่ม 6 เดือน\nหมดอายุเกิน 6 เดือน รับเพิ่ม 6 เดือนเช่นกัน\nตรวจรายการจากบัญชีเดิมก่อนชำระครับ';
const NEUTRAL = 'กดตรวจข้อเสนอและสิทธิ์ล่าสุดจากบัญชีเดิมได้เลยครับ';
const oldPoster = {
  url: 'https://approved-assets.example/care-back-20261031.png',
  preview_url: 'https://approved-assets.example/care-back-20261031-preview.jpg',
};
const render = (answer, separator = '\n') => answer.text + separator + answer.label + ' → ' + answer.route;
const reply = now => careBackOctoberReply('care_back_overview', '', now);

test('November announcement begins at Bangkok midnight and preserves the historical October reply', () => {
  assert.match(reply(OCTOBER).text, /วันนี้วันสุดท้าย/);
  assert.match(reply(OCTOBER).text, /1,199.*2,999.*66 คะแนน/);
  assert.deepEqual(reply(NOVEMBER_START), {
    text: APPROVED_NOVEMBER, route: SIGNUP, label: 'สมัคร / เช็กสิทธิ์',
  });
  assert.equal(reply(NOVEMBER_END - 1).text, APPROVED_NOVEMBER);
});

test('December public navigation never implies that underlying eligibility has ended', () => {
  for (const now of [NOVEMBER_END, Date.parse('2026-12-31T23:59:59.999+07:00')]) {
    assert.deepEqual(reply(now), { text: NEUTRAL, route: STATUS, label: 'ตรวจข้อเสนอล่าสุด' });
    assert.doesNotMatch(reply(now).text, /สิ้นสุด|หมดสิทธิ์|31 ธ.ค.|สิ้นปี|30 พ.ย./);
  }
});

test('all supported generic intents use the approved three-cohort six-month announcement', () => {
  for (const intent of [
    'promotion_overview', 'care_back_overview', 'care_back_dates', 'care_back_new_member',
    'care_back_new_standard', 'care_back_new_premium', 'care_back_current_member',
    'care_back_expired_member', 'care_back_membership_price',
  ]) {
    const answer = careBackOctoberReply(intent, '', NOVEMBER_START);
    assert.equal(answer.text, APPROVED_NOVEMBER);
    assert.match(answer.text, /สมาชิกปัจจุบันต่ออายุล่วงหน้า รับเพิ่ม 6 เดือน/);
    assert.match(answer.text, /หมดอายุไม่เกิน 6 เดือน สมัครแล้วรับเพิ่ม 6 เดือน/);
    assert.match(answer.text, /หมดอายุเกิน 6 เดือน รับเพิ่ม 6 เดือน/);
    assert.doesNotMatch(answer.text, /วันนี้วันสุดท้าย|31 ต.ค.|3 พ.ย.|31 ธ.ค.|สิ้นปี|90 วัน|180 วัน|1,000|2,500|ฟรี 1 ปี|สมาชิกใหม่.*6 เดือน/);
  }
});

test('November does not authorize personal, payment, special-tier or historical entitlement answers', () => {
  for (const intent of ['care_back_personal_status', 'care_back_payment_points', 'care_back_black_card', 'care_back_historical_points', 'privacy_request']) {
    assert.equal(careBackOctoberReply(intent, 'CARE BACK', NOVEMBER_START), null);
  }
  for (const text of [
    'CARE BACK ของผมได้ไหม', 'CARE BACK โอนแล้ว', 'CARE BACK สลิป', 'CARE BACK คืนเงิน',
    'CARE BACK จ่ายแล้ว', 'CARE BACK ได้สิทธิ์แล้ว', 'CARE BACK SVIP', 'CARE BACK VIP',
    'CARE BACK Black Card', 'CARE BACK ย้อนหลัง',
  ]) assert.equal(careBackOctoberReply('care_back_overview', text, NOVEMBER_START), null);
  assert.equal(reply(NaN), null);
  assert.equal(reply(Date.parse('2026-10-30T23:59:59.999+07:00')), null);
});

test('both real render formats produce exactly text plus the existing URI CTA throughout November', () => {
  for (const now of [NOVEMBER_START, NOVEMBER_END - 1]) {
    const answer = reply(now);
    for (const separator of ['\n', '\n\n']) {
      // The old poster may still be supplied by the unchanged carrier, but it is never used.
      for (const poster of [oldPoster, null]) {
        const result = careBackPosterMessages(render(answer, separator), [], answer, poster, now);
        assert.deepEqual(result, { text: APPROVED_NOVEMBER, extra_messages: [{
          type: 'text', text: answer.label + ' → ' + SIGNUP,
          quickReply: { items: [{ type: 'action', action: { type: 'uri', label: answer.label, uri: SIGNUP } }] },
        }] });
        assert.equal(result.extra_messages.some(message => message.type === 'image'), false);
      }
    }
  }
});

test('stale October art and the November announcement cannot leak past their own wave', () => {
  const october = reply(OCTOBER);
  const november = reply(NOVEMBER_START);
  assert.equal(careBackPosterMessages(render(october), [], october, oldPoster, NOVEMBER_START), null);
  assert.equal(careBackPosterMessages(render(november), [], november, oldPoster, NOVEMBER_END), null);
  const december = reply(NOVEMBER_END);
  const result = careBackPosterMessages(render(december), [], december, oldPoster, NOVEMBER_END);
  assert.equal(result.extra_messages.length, 1);
  assert.equal(result.extra_messages[0].quickReply.items[0].action.uri, STATUS);
  assert.equal(result.extra_messages.some(message => message.type === 'image'), false);
});

test('November exact-copy and URI guards reject stale or modified campaigns and preserve existing extra messages', () => {
  const answer = reply(NOVEMBER_START);
  for (const invalid of [
    { ...answer, text: answer.text.replace('30 พ.ย.', '31 ธ.ค.') },
    { ...answer, text: answer.text.replaceAll('6 เดือน', '1 ปี') },
    { ...answer, route: 'https://other.example/' },
    { ...answer, label: 'จ่ายเลย' },
  ]) assert.equal(careBackPosterMessages(render(invalid), [], invalid, oldPoster, NOVEMBER_START), null);
  for (const text of ['checkpts', 'GWs37', 'CARE BACK', answer.text, render(answer) + '\nข้อความอื่น']) {
    assert.equal(careBackPosterMessages(text, [], answer, oldPoster, NOVEMBER_START), null);
  }
  const extra = [{ type: 'text', text: 'existing extra' }];
  const before = structuredClone(extra);
  assert.equal(careBackPosterMessages(render(answer), extra, answer, oldPoster, NOVEMBER_START), null);
  assert.deepEqual(extra, before);
});

test('recovered production sender serializes November as two LINE messages and no image, with network mocked', async () => {
  const source = readFileSync(new URL('./fixtures/kenji-care-back-send-reply-live-20261031.txt', import.meta.url), 'utf8');
  const requests = [];
  const sendReply = new Function('fetch', 'text28', 'LINE_REPLY_URL3', 'EMS_ALBUMS_URL', 'GWS_ALBUMS_URL',
    source + '\nreturn sendReply;')(
      async (url, init) => { requests.push({ url, ...init, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; },
      value => String(value ?? '').trim(), 'https://api.line.me/v2/bot/message/reply',
      'https://example.test/ems', 'https://example.test/gws');
  const answer = reply(NOVEMBER_START);
  const decorated = careBackPosterMessages(render(answer), [], answer, oldPoster, NOVEMBER_START);
  assert.deepEqual(await sendReply({ LINE_CHANNEL_ACCESS_TOKEN: 'synthetic-test-token' },
    'synthetic-reply-token', decorated.text, null, decorated.extra_messages), { ok: true, status: 200 });
  assert.equal(requests.length, 1);
  const body = requests[0].body;
  assert.equal(body.replyToken, 'synthetic-reply-token');
  assert.equal(body.messages.length, 2);
  assert.deepEqual(body.messages.map(message => message.type), ['text', 'text']);
  assert.equal(body.messages[0].text, APPROVED_NOVEMBER);
  assert.deepEqual(body.messages[1].quickReply.items[0].action, { type: 'uri', label: answer.label, uri: SIGNUP });
  assert.doesNotMatch(JSON.stringify(body), /originalContentUrl|previewImageUrl|20261031|31 ธ.ค.|สิ้นปี/);
});

