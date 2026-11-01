// Public announcement media only. This never calculates or changes eligibility.
export function careBackPosterMessages(text, extraMessages, approvedReply, poster, now = Date.now()) {
  const start = Date.parse('2026-10-31T00:00:00+07:00');
  const end = Date.parse('2026-11-01T00:00:00+07:00');
  if (!Number.isFinite(now) || now < start || now >= end || typeof text !== 'string') return null;
  if (extraMessages !== undefined && (!Array.isArray(extraMessages) || extraMessages.length !== 0)) return null;
  if (!approvedReply || typeof approvedReply.text !== 'string' || !approvedReply.text ||
      typeof approvedReply.label !== 'string' || !approvedReply.label ||
      typeof approvedReply.route !== 'string' || !approvedReply.route ||
      approvedReply.label.length > 20 || approvedReply.route.length > 1000) return null;
  const cta = `${approvedReply.label} → ${approvedReply.route}`;
  // These are the two existing common/Sales V2 renderings. No keyword matching.
  if (text !== `${approvedReply.text}\n${cta}` && text !== `${approvedReply.text}\n\n${cta}`) return null;
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
      { type: 'text', text: cta, quickReply: { items: [{
        type: 'action', action: { type: 'uri', label: approvedReply.label, uri: approvedReply.route },
      }] } },
    ],
  };
}
