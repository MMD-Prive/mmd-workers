// Private, reviewed Standard material only. Raw owner uploads never enter HYPE
// merely because they exist in Drive; the assistant records completed visual QA.
export const INTAKE_READY_FOLDER_ID = '1CPnNgAY2sKRyh5u0nfr9WpexFV6A_HT6';
export const INTAKE_REGISTRY_KEY = 'hype-compcards/v1/intake/approved.json';
const ASSET_PREFIX = 'hype-compcards/v1/intake/assets/';
const MAX_REGISTRY_BYTES = 1_048_576;
const MAX_ASSET_JSON_BYTES = 13_400_000;
const MAX_PHOTO_BYTES = 10_000_000;
const FILE_ID = /^[A-Za-z0-9_-]{10,180}$/;
const HASH = /^[a-f0-9]{64}$/;
const QA_FIELDS = ['identity_verified', 'canonical_facts_verified', 'finished_material', 'visual_qa_passed', 'public_safe'];
const error = code => Object.assign(new Error(code), { code, retryable: false });
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const safeText = (value, max = 120) => typeof value === 'string' && value === value.trim() && value.length > 0
  && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const enabled = value => String(value || '').trim().toLowerCase() === 'true';

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function intakeImageDimensions(bytes, mime) {
  if (!(bytes instanceof Uint8Array)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === 'image/png') {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 24 || signature.some((byte, i) => bytes[i] !== byte)
        || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR' || view.getUint32(8) !== 13) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime !== 'image/jpeg' || bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > bytes.length) return null;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (frames.has(marker)) return length >= 8 ? { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) } : null;
    offset += length;
  }
  return null;
}

function validDimensions(width, height) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    && width + height <= 10000 && Math.max(width, height) / Math.min(width, height) <= 20;
}

export function validateIntakeCard(card, { now = Date.now() } = {}) {
  if (!plain(card) || card.source !== 'owner_drive_intake' || card.source_folder_id !== INTAKE_READY_FOLDER_ID
      || !FILE_ID.test(card.file_id || '') || !HASH.test(card.sha256 || '')
      || card.id !== `intake_${card.file_id}_${card.sha256}` || card.asset_key !== `${ASSET_PREFIX}${card.sha256}.json`
      || !/^rec[A-Za-z0-9]{8,40}$/.test(card.model_id || '') || !safeText(card.canonical_name) || !safeText(card.display_name)
      || card.category !== 'standard' || card.approved !== true || card.status !== 'active' || typeof card.selectable !== 'boolean'
      || typeof card.caption_stats_allowed !== 'boolean' || !['image/png', 'image/jpeg'].includes(card.content_type)
      || !Number.isSafeInteger(card.bytes) || card.bytes < 1 || card.bytes > MAX_PHOTO_BYTES || !validDimensions(card.width, card.height)
      || !Number.isFinite(card.height_cm) || card.height_cm <= 0 || card.height_cm > 300
      || !Number.isFinite(card.weight_kg) || card.weight_kg <= 0 || card.weight_kg > 300) throw error('compcard_intake_card_invalid');
  const review = card.review;
  const reviewedAt = Date.parse(review?.reviewed_at);
  if (!plain(review) || !['assistant', 'owner'].includes(review.reviewed_by) || !FILE_ID.test(review.source_file_id || '')
      || !Number.isFinite(reviewedAt) || new Date(reviewedAt).toISOString() !== review.reviewed_at || reviewedAt > now + 300000
      || QA_FIELDS.some(field => review[field] !== true)) throw error('compcard_intake_review_invalid');
  return {
    id: card.id, source: card.source, source_folder_id: card.source_folder_id, file_id: card.file_id,
    model_id: card.model_id, canonical_name: card.canonical_name, display_name: card.display_name, category: 'standard',
    approved: true, status: 'active', selectable: card.selectable, asset_key: card.asset_key, sha256: card.sha256,
    content_type: card.content_type, bytes: card.bytes, width: card.width, height: card.height,
    height_cm: card.height_cm, weight_kg: card.weight_kg, caption_stats_allowed: card.caption_stats_allowed,
    review: { reviewed_by: review.reviewed_by, reviewed_at: review.reviewed_at, source_file_id: review.source_file_id,
      ...Object.fromEntries(QA_FIELDS.map(field => [field, true])) },
  };
}

async function readBoundedJson(bucket, key, maxBytes) {
  const object = await bucket.get(key);
  if (!object) return null;
  // R2 supplies size before materializing the private object body.
  if (!Number.isSafeInteger(object.size) || object.size < 1 || object.size > maxBytes) throw error('compcard_intake_object_size_invalid');
  const text = await object.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw error('compcard_intake_object_size_invalid');
  try { return JSON.parse(text); } catch { throw error('compcard_intake_json_invalid'); }
}

export async function readApprovedIntakeRegistry(env, bucket, { now = Date.now() } = {}) {
  if (!enabled(env.HYPE_INTAKE_ENABLED)) return { status: 'disabled', cards: [], revision: 'disabled', error: null };
  try {
    if (env.HYPE_INTAKE_READY_FOLDER_ID !== INTAKE_READY_FOLDER_ID || !bucket?.get) throw error('compcard_intake_config_invalid');
    const envelope = await readBoundedJson(bucket, INTAKE_REGISTRY_KEY, MAX_REGISTRY_BYTES);
    if (!envelope) return { status: 'empty', cards: [], revision: 'missing', error: null };
    const result = envelope.result;
    if (envelope.schema !== 'hype_compcard_intake_registry_v1' || envelope.success !== true || !plain(result)
        || result.ready_folder_id !== INTAKE_READY_FOLDER_ID || !safeText(result.revision)
        || !Array.isArray(result.cards) || result.cards.length > 500) throw error('compcard_intake_registry_invalid');
    const cards = result.cards.map(card => validateIntakeCard(card, { now }));
    const ids = new Set();
    const selectedModels = new Set();
    for (const card of cards) {
      if (ids.has(card.id) || card.selectable && selectedModels.has(card.model_id)) throw error('compcard_intake_registry_conflict');
      ids.add(card.id);
      if (card.selectable) selectedModels.add(card.model_id);
    }
    // Hash validated contents as well as the operator revision. A forgotten
    // revision bump cannot leave stale readiness after approval/revocation.
    const revision = await sha256(new TextEncoder().encode(JSON.stringify({ revision: result.revision, cards })));
    return { status: cards.length ? 'ready' : 'empty', cards, revision, error: null };
  } catch (cause) {
    return { status: 'invalid', cards: [], revision: 'invalid', error: /^compcard_intake_[a-z_]+$/.test(cause?.code || '') ? cause.code : 'compcard_intake_unavailable' };
  }
}

export async function mergeApprovedIntake(env, bucket, manifest, options = {}) {
  const intake = await readApprovedIntakeRegistry(env, bucket, options);
  if (intake.cards.some(card => manifest.cards.some(original => original.id === card.id))) {
    intake.status = 'invalid'; intake.cards = []; intake.revision = 'invalid'; intake.error = 'compcard_intake_registry_conflict';
  }
  const summary = { status: intake.status, revision: intake.revision, cards: intake.cards.length, error: intake.error };
  return { ...manifest, cards: [...manifest.cards, ...intake.cards],
    revision: intake.status === 'disabled' ? manifest.revision : `${manifest.revision}:intake:${intake.revision}`, intake: summary };
}

export async function assertIntakeCardCurrent(env, bucket, card, { now = Date.now() } = {}) {
  const registry = await readApprovedIntakeRegistry(env, bucket, { now });
  const current = registry.cards.find(entry => entry.id === card.id);
  const fields = ['source', 'source_folder_id', 'file_id', 'model_id', 'canonical_name', 'display_name', 'category', 'asset_key',
    'sha256', 'content_type', 'bytes', 'width', 'height', 'height_cm', 'weight_kg', 'caption_stats_allowed'];
  if (!current || fields.some(field => current[field] !== card[field])) throw error('compcard_intake_approval_changed');
  return current;
}

export async function readApprovedIntakeAsset(env, bucket, card, { now = Date.now() } = {}) {
  validateIntakeCard(card, { now });
  await assertIntakeCardCurrent(env, bucket, card, { now });
  const envelope = await readBoundedJson(bucket, card.asset_key, MAX_ASSET_JSON_BYTES);
  const asset = envelope?.result;
  if (envelope?.schema !== 'hype_compcard_intake_asset_v1' || envelope.success !== true || !plain(asset)
      || asset.encoding !== 'base64' || asset.content_type !== card.content_type || asset.sha256 !== card.sha256
      || typeof asset.data !== 'string' || asset.data.length !== Math.ceil(card.bytes / 3) * 4
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data)) throw error('compcard_intake_asset_invalid');
  let bytes;
  try {
    const binary = atob(asset.data);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  } catch { throw error('compcard_intake_asset_invalid'); }
  const dimensions = intakeImageDimensions(bytes, card.content_type);
  if (bytes.byteLength !== card.bytes || await sha256(bytes) !== card.sha256
      || !dimensions || dimensions.width !== card.width || dimensions.height !== card.height) throw error('compcard_intake_asset_changed');
  return { bytes, content_type: card.content_type, sha256: card.sha256 };
}
