import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const {
  isMmsLineRequest,
  handleMmsLineRequest,
  MMS_LINE_RUNTIME_INTERNALS,
} = await import("../src/mms-line-runtime.mjs");

const {
  richMenuDraft,
  deterministicReply,
  postbackReply,
  protectedTruthReply,
  sharedCapabilityReply,
  verifyLineSignature,
  capabilityPackVersion,
  recoveryOutcomeTaxonomyVersion,
} = MMS_LINE_RUNTIME_INTERNALS;

test("MMS LINE route is isolated from MMD webhook", () => {
  assert.equal(isMmsLineRequest(new Request("https://mmdbkk.com/webhooks/line/mms")), true);
  assert.equal(isMmsLineRequest(new Request("https://mmdbkk.com/webhooks/line")), false);
});

test("MMS Rich Menu is 2500x1686 with six customer cells", () => {
  const menu = richMenuDraft();
  assert.deepEqual(menu.size, { width: 2500, height: 1686 });
  assert.equal(menu.selected, true);
  assert.equal(menu.areas.length, 6);
  assert.equal(menu.areas[0].action.uri, "https://miniapp.line.me/2011388357-ft2o17gf");
  assert.equal(menu.areas[1].action.uri, "https://mmdbkk.com/male-massage/therapists/mms");
  assert.equal(menu.areas[2].action.data, "mms:menu:services");
  assert.equal(menu.areas[3].action.uri, "https://mmdbkk.com/male-massage/how-to-use");
  assert.equal(menu.areas[4].action.data, "mms:menu:my_booking");
  assert.equal(menu.areas[5].action.data, "mms:menu:support");
});

test("prelaunch booking, availability, price and service intents invite MY MMS without taking bookings", () => {
  for (const input of ['อยากจองนวด', 'คืนนี้ใครว่าง', 'ราคาเท่าไหร่', 'MY MMS', 'สวัสดี', 'บริการอะไรบ้าง', 'ช่วยหา therapist ที่เหมาะหน่อย']) {
    const reply = deterministicReply(input);
    assert.match(reply, /MMS จะกลับมาธันวาคมนี้ครับ/);
    assert.match(reply, /miniapp.line.me\/2011388357-ft2o17gf/);
    assert.match(reply, /หนุ่มหล่อของเราได้ในไม่ช้าครับ/);
    assert.doesNotMatch(reply, /mms-booking|เลือกวัน|เช็กคิว|ส่งรายละเอียด|ก่อนยืนยัน|จองได้/);
  }
  for (const key of ['services', 'my_booking']) {
    assert.match(postbackReply(`mms:menu:${key}`), /ธันวาคมนี้/);
  }
  assert.match(postbackReply('mms:menu:support'), /อยากคุยเรื่องไหน/);
});

test("historical booking and payment queries keep their truth boundary without a new booking CTA", () => {
  assert.match(protectedTruthReply('จองสำเร็จหรือยัง'), /รายการนั้นก่อนยืนยันสถานะ/);
  assert.match(protectedTruthReply('is my booking confirmed?'), /current record before confirmation/);
  assert.match(protectedTruthReply('付款到账了吗'), /当前记录/);
  for (const text of ['จ่ายแล้ว', 'is my booking confirmed?', '付款到账了吗']) {
    assert.doesNotMatch(protectedTruthReply(text), /mms-booking|pre-booking|จองได้/);
  }
});

test("MMS LINE runtime knows capability pack 1-7 and preserves HENNA/HYPE ownership", () => {
  assert.equal(capabilityPackVersion, "mmd-concierge-capability-pack-v1-20260919");
  assert.equal(recoveryOutcomeTaxonomyVersion, "mmd-recovery-outcome-taxonomy-v1-20260919");
  assert.match(deterministicReply("GG Water ของผมถึงไหนแล้ว"), /MY MMD/);
  assert.match(deterministicReply("CARE BACK คูปองเปิดหรือยัง"), /Coupon Wallet/);
  assert.match(deterministicReply("ช่วยหา therapist ที่เหมาะหน่อย"), /ธันวาคมนี้/);
  assert.match(deterministicReply("งานมีปัญหา น้องยังไม่มา"), /ขอเช็กข้อมูลให้ครบก่อนคุยทางออก/);
  assert.match(deterministicReply("เรื่องที่ส่งให้เปอร์ถึงไหนแล้ว"), /สถานะของเรื่องจะยืนยันเมื่อมีข้อมูลอัปเดต/);
  assert.match(deterministicReply("ขอดู model ใน Hall"), /เลือกมุมมองที่คุณสนใจ/);
  assert.match(deterministicReply("แต้มคงเหลือเท่าไหร่"), /ยอดและสิทธิ์ที่ใช้ได้จะอยู่ในบัญชีของคุณ/);

  assert.match(sharedCapabilityReply("mms_therapist_options"), /ธันวาคมนี้/);
  assert.match(sharedCapabilityReply("shop_orders"), /HYPE/);
});

test('brand-only MY MMS opens the verified Mini App in Thai without a language guess', () => {
  for (const text of ['MY MMS', 'my mms', 'MYMMS', 'Mini App', 'เปิด MY MMS']) {
    const reply = deterministicReply(text);
    assert.match(reply, /เปิด MY MMS ใน LINE/);
    assert.match(reply, /https:\/\/miniapp\.line\.me\/2011388357-ft2o17gf/);
    assert.match(reply, /ธันวาคมนี้/);
  }
  assert.match(deterministicReply('Open MY MMS please'), /MMS returns this December/);
  assert.match(deterministicReply('打开 MY MMS'), /今年十二月回归/);
});

test('Per Voice stays warm and never invents staff, a team, a completed handoff or a confirmed job', () => {
  for (const input of ['ขอคุยกับเจ้าหน้าที่', 'ขอคุยกับเจ้าหน้าที่เรื่องคิว', 'อยากจองนวด', 'คืนนี้ใครว่าง', 'สวัสดี', 'MY MMS', 'บริการอะไรบ้าง', 'เรื่องที่ส่งให้เปอร์ถึงไหนแล้ว']) {
    const reply = deterministicReply(input);
    assert.match(reply, /ครับ/);
    assert.doesNotMatch(reply, /เจ้าหน้าที่|ทีม|แอดมิน|ส่งต่อแล้ว|แจ้งเปอร์แล้ว|ยืนยันแล้ว|จองสำเร็จ|ไม่เดา/);
  }
  assert.match(deterministicReply('ขอคุยกับเจ้าหน้าที่'), /^ได้เลยครับ/);
});

async function signedMmsRequest(event, secret = 'synthetic-mms-secret') {
  const raw = JSON.stringify({ events: [event] });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))).toString('base64');
  return new Request('https://www.mmdbkk.com/webhooks/line/mms', { method: 'POST', headers: { 'x-line-signature': signature }, body: raw });
}

test('signed customer messages produce one bounded LINE reply and no model call for known intents', async () => {
  const original = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.line.me/v2/bot/message/reply');
    const body = JSON.parse(options.body); assert.equal(body.messages.length, 1);
    sent.push(body.messages[0].text);
    return Response.json({ sentMessages: [{ id: 'synthetic-receipt' }] });
  };
  try {
    for (const text of ['MY MMS', 'อยากจองนวด', 'คืนนี้ใครว่าง', 'ขอคุยกับเจ้าหน้าที่']) {
      const request = await signedMmsRequest({ type: 'message', replyToken: 'synthetic-once', message: { type: 'text', text } });
      const result = await handleMmsLineRequest(request, { MMS_LINE_CHANNEL_SECRET: 'synthetic-mms-secret', MMS_LINE_CHANNEL_ACCESS_TOKEN: 'synthetic-access', MMS_LINE_AI_ENABLED: 'true', OPENAI_API_KEY: 'synthetic-model-key' });
      assert.equal(result.status, 200);
    }
    assert.equal(sent.length, 4);
    assert.match(sent[0], /เปิด MY MMS ใน LINE/);
    assert.match(sent[2], /ธันวาคมนี้/);
    assert.match(sent[3], /^ได้เลยครับ/);
    assert.ok(sent.every(reply => !/เจ้าหน้าที่|ทีม|แอดมิน/.test(reply)));
  } finally { globalThis.fetch = original; }
});

test('each MMS LINE channel uses its own signature secret and reply access token', async () => {
  const original = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.line.com/v2/bot/message/reply'.replace('api.line.com','api.line.me'));
    sent.push({ authorization: options.headers.authorization, body: JSON.parse(options.body) });
    return Response.json({});
  };
  const env = {
    MMS_LINE_CHANNEL_SECRET: 'legacy-secret',
    MMS_LINE_CHANNEL_ACCESS_TOKEN: 'legacy-access-token',
    MMS_LINE_4WOMEN_CHANNEL_SECRET: '4women-secret',
    MMS_LINE_4WOMEN_CHANNEL_ACCESS_TOKEN: '4women-access-token',
  };
  try {
    const legacy = await signedMmsRequest({ type: 'message', replyToken: 'legacy-reply', message: { type: 'text', text: 'MY MMS' } }, 'legacy-secret');
    const fourWomen = await signedMmsRequest({ type: 'message', replyToken: '4women-reply', message: { type: 'text', text: 'MY MMS' } }, '4women-secret');
    assert.equal((await handleMmsLineRequest(legacy, env)).status, 200);
    assert.equal((await handleMmsLineRequest(fourWomen, env)).status, 200);
    assert.equal(sent.length, 2);
    assert.equal(sent[0].authorization, 'Bearer legacy-access-token');
    assert.equal(sent[0].body.replyToken, 'legacy-reply');
    assert.equal(sent[1].authorization, 'Bearer 4women-access-token');
    assert.equal(sent[1].body.replyToken, '4women-reply');
  } finally { globalThis.fetch = original; }
});

test('invalid signatures and redelivered events never send a second message', async () => {
  const original = globalThis.fetch; let sends = 0;
  globalThis.fetch = async () => { sends++; return Response.json({}); };
  const env = { MMS_LINE_CHANNEL_SECRET: 'synthetic-mms-secret', MMS_LINE_CHANNEL_ACCESS_TOKEN: 'synthetic-access' };
  try {
    const invalid = await handleMmsLineRequest(new Request('https://www.mmdbkk.com/webhooks/line/mms', { method: 'POST', body: '{"events":[]}' }), env);
    assert.equal(invalid.status, 401);
    const replay = await signedMmsRequest({ type: 'message', replyToken: 'synthetic-once', deliveryContext: { isRedelivery: true }, message: { type: 'text', text: 'MY MMS' } });
    assert.equal((await handleMmsLineRequest(replay, env)).status, 200);
    assert.equal(sends, 0);
  } finally { globalThis.fetch = original; }
});

test('a model reply cannot introduce a staff or team persona into the actual LINE response', async () => {
  const original = globalThis.fetch;
  const sent = []; let modelCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (url === 'https://api.openai.com/v1/responses') { modelCalls++; return Response.json({ output_text: 'เจ้าหน้าที่ในทีมจะช่วยดูให้ครับ' }); }
    assert.equal(url, 'https://api.line.me/v2/bot/message/reply');
    sent.push(JSON.parse(options.body).messages[0].text);
    return Response.json({});
  };
  try {
    const request = await signedMmsRequest({ type: 'message', replyToken: 'synthetic-once', message: { type: 'text', text: 'อยากรู้เพิ่มเติมครับ' } });
    const response = await handleMmsLineRequest(request, { MMS_LINE_CHANNEL_SECRET: 'synthetic-mms-secret', MMS_LINE_CHANNEL_ACCESS_TOKEN: 'synthetic-access', MMS_LINE_AI_ENABLED: 'true', OPENAI_API_KEY: 'synthetic-model-key' });
    assert.equal(response.status, 200);
    assert.equal(modelCalls, 1);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /ธันวาคมนี้/);
    assert.doesNotMatch(sent[0], /เจ้าหน้าที่|ทีม|แอดมิน/);
  } finally { globalThis.fetch = original; }
});

test('model instructions and reply guard prevent a premature booking invitation', async () => {
  const original = globalThis.fetch; const sent = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url === 'https://api.openai.com/v1/responses') {
      assert.match(body.instructions, /Bookings and pre-booking are not open now/);
      assert.match(body.instructions, /MMS will return this December/);
      assert.doesNotMatch(body.instructions, /Send pre-booking request:/);
      return Response.json({ output_text: 'จองได้เลยครับ เลือกวันกับพื้นที่ได้ทันที' });
    }
    assert.equal(url, 'https://api.line.me/v2/bot/message/reply');
    sent.push(body.messages[0].text); return Response.json({});
  };
  try {
    const request = await signedMmsRequest({ type: 'message', replyToken: 'synthetic-once', message: { type: 'text', text: 'ขอรายละเอียดเพิ่มครับ' } });
    await handleMmsLineRequest(request, { MMS_LINE_CHANNEL_SECRET: 'synthetic-mms-secret', MMS_LINE_CHANNEL_ACCESS_TOKEN: 'synthetic-access', MMS_LINE_AI_ENABLED: 'true', OPENAI_API_KEY: 'synthetic-model-key' });
    assert.equal(sent.length, 1);
    assert.match(sent[0], /MMS จะกลับมาธันวาคมนี้ครับ/);
    assert.doesNotMatch(sent[0], /จองได้|เลือกวัน/);
  } finally { globalThis.fetch = original; }
});

test("LINE signature uses MMS secret", async () => {
  const body = JSON.stringify({ events: [] });
  const secret = "mms-test-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("base64");
  assert.equal(await verifyLineSignature(body, sig, secret), true);
  assert.equal(await verifyLineSignature(body, sig, "mmd-wrong-secret"), false);
});

test("MMS webhook health reports configuration without exposing secrets", async () => {
  const response = await handleMmsLineRequest(new Request("https://mmdbkk.com/webhooks/line/mms"), {
    MMS_LINE_CHANNEL_SECRET: "present",
    MMS_LINE_CHANNEL_ACCESS_TOKEN: "present",
    MMS_LINE_AI_ENABLED: "true",
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.configured, true);
  assert.equal(body.ai_enabled, true);
  assert.equal(body.rich_menu_mode, "24/7");
  assert.equal(body.rich_menu_publisher, "raw-or-url-v2");
  assert.equal(body.capability_pack, "mmd-concierge-capability-pack-v1-20260919");
  assert.equal(body.recovery_outcome_taxonomy, "mmd-recovery-outcome-taxonomy-v1-20260919");
  assert.equal(JSON.stringify(body).includes("present"), false);
});
