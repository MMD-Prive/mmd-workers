// Public announcement media only. This never calculates or changes eligibility.
export function careBackPosterMessages(text, extraMessages, approvedReply, poster, now = Date.now()) {
  const start = Date.parse('2026-10-31T00:00:00+07:00');
  const end = Date.parse('2026-11-01T00:00:00+07:00');
  if (!Number.isFinite(now) || now < start || typeof text !== 'string') return null;
  if (extraMessages !== undefined && (!Array.isArray(extraMessages) || extraMessages.length !== 0)) return null;
  if (!approvedReply || typeof approvedReply.text !== 'string' || !approvedReply.text ||
      typeof approvedReply.label !== 'string' || !approvedReply.label ||
      typeof approvedReply.route !== 'string' || !approvedReply.route ||
      approvedReply.label.length > 20 || approvedReply.route.length > 1000) return null;
  const cta = `${approvedReply.label} → ${approvedReply.route}`;
  // These are the two existing common/Sales V2 renderings. No keyword matching.
  if (text !== `${approvedReply.text}\n${cta}` && text !== `${approvedReply.text}\n\n${cta}`) return null;
  const ctaMessage = { type: 'text', text: cta, quickReply: { items: [{
    type: 'action', action: { type: 'uri', label: approvedReply.label, uri: approvedReply.route },
  }] } };
  if (now >= end) {
    // The October artwork remains retired. The approved November wave is
    // text plus its existing URI button, with no substitute or stale image.
    if (now < Date.parse('2026-12-01T00:00:00+07:00') &&
        approvedReply.text === 'CARE BACK ต่อโปรถึง 30 พ.ย. 2569 ครับ 🖤\nสมาชิกปัจจุบันต่ออายุล่วงหน้า รับเพิ่ม 6 เดือน\nหมดอายุไม่เกิน 6 เดือน สมัครแล้วรับเพิ่ม 6 เดือน\nหมดอายุเกิน 6 เดือน รับเพิ่ม 6 เดือนเช่นกัน\nตรวจรายการจากบัญชีเดิมก่อนชำระครับ' &&
        approvedReply.route === 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=signup&view=signup&world=private' &&
        approvedReply.label === 'สมัคร / เช็กสิทธิ์') {
      return { text: approvedReply.text, extra_messages: [ctaMessage] };
    }
    // Neutral rights navigation remains available after an announcement wave;
    // no public deadline changes the customer's underlying eligibility.
    if (approvedReply.text !== 'กดตรวจข้อเสนอและสิทธิ์ล่าสุดจากบัญชีเดิมได้เลยครับ' ||
        approvedReply.route !== 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview' ||
        approvedReply.label !== 'ตรวจข้อเสนอล่าสุด') return null;
    return { text: approvedReply.text, extra_messages: [ctaMessage] };
  }
  let imageUrl, previewUrl;
  try {
    const images = [new URL(poster.url), new URL(poster.preview_url)];
    if (images.some(image => image.protocol !== 'https:' || image.username || image.password || image.hash || image.search)) return null;
    [imageUrl, previewUrl] = images.map(image => image.href);
  } catch { return null; }
  return {
    text: approvedReply.text,
    extra_messages: [
      { type: 'image', originalContentUrl: imageUrl, previewImageUrl: previewUrl },
      ctaMessage,
    ],
  };
}

