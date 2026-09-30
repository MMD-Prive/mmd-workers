import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const head = readFileSync(new URL('./sigil-booking-head.html', import.meta.url), 'utf8');
const footer = readFileSync(new URL('./sigil-booking-footer.html', import.meta.url), 'utf8');
const mediaStart = footer.indexOf('function projectedMedia(item){');
const mediaEnd = footer.indexOf('function mediaPlaceholder(){', mediaStart);
assert.ok(mediaStart >= 0 && mediaEnd > mediaStart, 'test must exercise the live renderer helper');
const projectedMedia = vm.runInNewContext(
  `${footer.slice(mediaStart, mediaEnd)};projectedMedia`,
  { API: 'https://sigil.mmdbkk.com', URL, Set },
);

const mediaId = (character) => `media_${character.repeat(8)}-${character.repeat(4)}-${character.repeat(4)}-${character.repeat(4)}-${character.repeat(12)}`;
const mediaUrl = (id) => `https://sigil.mmdbkk.com/sigil/api/models/media/${encodeURIComponent(id)}`;

test('renderer accepts only per-item API projection and rejects foreign media URLs', () => {
  const primaryId = mediaId('a');
  const photoId = mediaId('b');
  const clipId = mediaId('c');
  const item = {
    model_id: 'recOwnModel',
    media_source: 'mmd_model_media_assets',
    cover_url: 'https://example.test/legacy.jpg',
    primary_media_id: primaryId,
    primary_image_url: mediaUrl(primaryId),
    additional_images: [
      { media_id: photoId, media_type: 'public_gallery', url: mediaUrl(photoId) },
      { media_id: mediaId('d'), media_type: 'private_original', url: mediaUrl(mediaId('d')) },
      { media_id: mediaId('e'), media_type: 'public_gallery', url: 'https://example.test/other-model.jpg' },
      { media_id: mediaId('f'), media_type: 'public_gallery', url: `${mediaUrl(mediaId('f'))}?id=${mediaId('f')}` },
    ],
    clips: [{ media_id: clipId, media_type: 'intro_video', url: mediaUrl(clipId) }],
  };
  const result = projectedMedia(item);
  assert.equal(result.primary.url, mediaUrl(primaryId));
  assert.deepEqual(Array.from(result.photos, ({ media_id }) => media_id), [photoId]);
  assert.deepEqual(Array.from(result.clips, ({ media_id }) => media_id), [clipId]);
  const compactId = `media_${'f'.repeat(32)}`;
  assert.equal(projectedMedia({ ...item, primary_media_id: compactId, primary_image_url: mediaUrl(compactId) }).primary.media_id, compactId);
  assert.equal(projectedMedia({ ...item, primary_media_id: `media_${'z'.repeat(32)}` }).primary, null);
  assert.equal(projectedMedia({ ...item, media_source: 'legacy' }).primary, null);
  assert.equal(projectedMedia({ model_id: 'recOtherModel', media_source: 'mmd_model_media_assets' }).photos.length, 0);
});

test('renderer keeps a safe no-media state and API failure state', () => {
  assert.equal(projectedMedia({ media_source: 'mmd_model_media_assets', cover_url: 'https://example.test/legacy.jpg' }).primary, null);
  assert.match(footer, /b\.appendChild\(cover\?mediaImage\(cover\):mediaPlaceholder\(\)\)/);
  assert.match(footer, /selectedMedia\.appendChild\(mediaPlaceholder\(\)\)/);
  assert.match(footer, /selectedImg\.onerror=function\(\)\{selectedImg\.removeAttribute\('src'\);selectedImg\.style\.display='none';selectedBox\.classList\.remove\('has-media'\)\}/);
  assert.match(footer, /video\.addEventListener\('error',function\(\)\{video\.replaceWith\(mediaPlaceholder\(\)\)/);
  assert.match(footer, /catch\(e\)\{results\.innerHTML='<div class="skb26-empty"><strong>ค้นหายังไม่สำเร็จ/);
  assert.doesNotMatch(footer, /var img=item\.cover_url\|\|item\.public_image_url/);
});

test('stylesheet includes the min-content guard verified by the 390px browser smoke', () => {
  assert.match(head, /\.skb26-shell,\.skb26-form,\.skb26-form>\*,\.skb26-card,\.skb26-model-results\{min-width:0;max-width:100%\}/);
  assert.match(head, /\.skb26-model-results\{width:100%\}/);
  assert.match(head, /\.skb26-model-results\{display:flex;gap:8px;overflow-x:auto;/);
});


test('customer Search UI requires backend visibility and carries budget, both-lane, Spec and Telegram reference', () => {
  assert.match(footer, /data-skb26-mode="search"/);
  assert.match(footer, /data-skb26-mode="booking"/);
  assert.match(footer, /data-filter="customer_lane" data-value="both">ได้ทั้งคู่/);
  assert.match(footer, /name="spec"/);
  assert.match(footer, /name="telegram_link"/);
  assert.match(footer, /name="fallback_allowed"/);
  assert.match(footer, /name="review_requested"/);
  assert.match(footer, /name="duration_minutes"/);
  assert.match(footer, /mode==='search'&&!budgetProvided\(\)/);
  assert.match(footer, /visibility_enforced===true/);
  assert.doesNotMatch(footer, /function allowedForTier/);
  assert.doesNotMatch(footer, /data-value="estimate"/);
  assert.doesNotMatch(footer, /resolved_image_url:/);
  assert.match(footer, /telegram_post_url:v\('telegram_link'\)/);
  assert.match(footer, /source:mode==='search'\?'sigil_search':'sigil_booking'/);
});

test('customer offer cards show backend-resolved price and approved extra media without Drive URLs', () => {
  assert.match(footer, /item\.offer&&item\.offer\.price_visible/);
  assert.match(footer, /รูปเพิ่มเติมที่อนุมัติ/);
  assert.doesNotMatch(footer, /drive_folder_id/);
  assert.doesNotMatch(footer, /drive\.google\.com/);
  assert.match(footer, /ราคาให้ MMD ตรวจ/);
});
