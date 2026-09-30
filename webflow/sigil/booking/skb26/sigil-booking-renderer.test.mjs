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

test('digital surface keeps min-content safe and uses a non-swipe Model grid', () => {
  assert.match(head, /\.skb26-shell,\.skb26-form,\.skb26-form>\*,\.skb26-card,\.skb26-model-results\{min-width:0;max-width:100%\}/);
  assert.match(head, /\.skb26-model-results\{[\s\S]*width:100%;[\s\S]*display:grid;[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(head, /\.skb26-model-results\{[^}]*overflow-x:auto/);
  assert.match(head, /min-height:100dvh/);
  assert.match(head, /env\(safe-area-inset-bottom\)/);
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

test('customer offer cards label rates by duration and never imply the 90-minute rate applies to 120 minutes', () => {
  assert.match(footer, /function durationOfferLabels\(item\)/);
  assert.match(footer, /item\.offer&&item\.offer\.duration_offers/);
  assert.match(footer, /m\+' นาที · '/);
  assert.match(footer, /ให้ MMD ตรวจราคา/);
  assert.match(footer, /qs\.set\('duration_minutes',v\('duration_minutes'\)\)/);
  assert.match(footer, /รูปเพิ่มเติมที่อนุมัติ/);
  assert.doesNotMatch(footer, /drive_folder_id/);
  assert.doesNotMatch(footer, /drive\.google\.com/);
});


test('SIGIL booking presents as a compact digital private concierge surface', () => {
  assert.match(footer, /<span class="skb26-brand">SĪGIL<\/span>/);
  assert.match(footer, /PRIVATE CONCIERGE/);
  assert.match(footer, /data-skb26-mode="search"/);
  assert.match(footer, /data-skb26-mode="booking"/);
  assert.doesNotMatch(footer, /data-skb26-identity open/);
  assert.match(footer, /if\(params\.get\('scope'\)==='private'\)identity\.open=true/);
  assert.match(head, /background:[\s\S]*radial-gradient/);
  assert.match(head, /backdrop-filter:blur/);
});

test('selected Model details open in a guarded bottom sheet with approved projected media only', () => {
  assert.match(footer, /skb26-model-sheet/);
  assert.match(footer, /role="dialog" aria-modal="true"/);
  assert.match(footer, /function openModelSheet\(\)/);
  assert.match(footer, /function closeModelSheet\(\)/);
  assert.match(footer, /openModelBtn\.addEventListener\('click',openModelSheet\)/);
  assert.match(footer, /btn\.classList\.add\('is-selected'\);openModelSheet\(\)/);
  assert.match(footer, /if\(e\.key==='Escape'/);
  assert.match(head, /\.skb26-model-sheet\{/);
  assert.match(head, /\.skb26-media-gallery\{[\s\S]*display:grid/);
  assert.doesNotMatch(head, /\.skb26-media-gallery[^}]*overflow-x:auto/);
});

test('renderer is idempotent when Webflow reruns the embed', () => {
  assert.match(footer, /if\(root\.dataset\.skb26Mounted==='1'\)return/);
  assert.match(footer, /root\.dataset\.skb26Mounted='1'/);
});
