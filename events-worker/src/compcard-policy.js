const DAY_MS = 86_400_000;
const COOLDOWN_DAYS = 7;
const ROTATION_EPOCH = Date.parse('2026-10-18T00:00:00.000Z') / DAY_MS;
const CATEGORIES = Object.freeze(['exclusive', 'premium', 'standard', 'travel', 'extreme']);
const DESTINATIONS = Object.freeze({
  exclusive: Object.freeze(['premium', 'preview']),
  premium: Object.freeze(['premium']),
  standard: Object.freeze(['premium', 'standard']),
  travel: Object.freeze(['preview']),
  extreme: Object.freeze(['preview']),
});

function valueText(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && typeof value.name === 'string') return value.name.trim();
  return '';
}

function word(value) {
  return valueText(value).toLowerCase().replace(/[\s_-]+/g, ' ');
}

function privateCategory(value) {
  const tier = word(value);
  if (['standard', 'standard model', 'standard models'].includes(tier)) return 'standard';
  if (['premium', 'premium model', 'premium models'].includes(tier)) return 'premium';
  if (['exclusive', 'exclusive model', 'exclusive models'].includes(tier)) return 'exclusive';
  return null;
}

function currentCategory(fields) {
  const layer = word(fields.sales_layer);
  if (layer === 'public') {
    const category = word(fields['MMD Public Category']);
    return ['travel', 'extreme'].includes(category) ? category : null;
  }
  if (!['private', 'both'].includes(layer)) return null;
  // A populated private tier is authoritative, including unknown values. Recognition
  // is a separate axis and cannot silently turn a Standard/Premium model into Exclusive.
  if (valueText(fields.private_tier)) return privateCategory(fields.private_tier);
  const modelClass = word(fields.model_class);
  return ['standard', 'premium'].includes(modelClass) ? modelClass : null;
}

export function destinationsForCategory(category) {
  if (!Object.prototype.hasOwnProperty.call(DESTINATIONS, category)) return [];
  return [...DESTINATIONS[category]];
}

export function evaluateCard(card, record) {
  if (!card || !CATEGORIES.includes(card.category) || !card.model_id || !card.canonical_name) {
    return { ok: false, reason: 'manifest_invalid' };
  }
  if (!record || record.id !== card.model_id || !record.fields) {
    return { ok: false, reason: 'model_identity_mismatch' };
  }
  const fields = record.fields;
  if (typeof fields.working_name !== 'string' || fields.working_name !== card.canonical_name) {
    return { ok: false, reason: 'model_name_changed' };
  }
  if (word(fields.status) !== 'active') return { ok: false, reason: 'model_inactive' };
  const blocked = new Set(['hidden', 'blocked', 'inactive', 'disabled', 'suspended', 'archived', 'deleted', 'do not publish']);
  for (const field of ['catalog_visibility', 'client_visibility_status', 'approved_client_visibility', 'visibility']) {
    if (blocked.has(word(fields[field]))) return { ok: false, reason: 'model_hidden' };
  }
  if (['test/fixture', 'ghost/synthetic', 'blank/invalid', 'duplicate/ambiguous', 'intake candidate'].includes(word(fields.registry_record_type))) {
    return { ok: false, reason: 'model_quarantined' };
  }
  if (currentCategory(fields) !== card.category) return { ok: false, reason: 'model_category_changed' };
  return { ok: true, reason: 'eligible' };
}

function safeDisplayName(card) {
  return valueText(card?.display_name).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').slice(0, 120);
}

function cardStats(card) {
  if (card.caption_stats_allowed === false) return '';
  if (!Number.isFinite(card.height_cm) || !Number.isFinite(card.weight_kg)) return '';
  if (card.height_cm <= 0 || card.weight_kg <= 0) return '';
  return `${card.height_cm} / ${card.weight_kg}`;
}

export function buildCompcardCaption(card, destination) {
  if (!destinationsForCategory(card?.category).includes(destination)) {
    throw new TypeError('Compcard destination is not allowed for this category');
  }
  const name = safeDisplayName(card);
  if (!name) throw new TypeError('Compcard display name is required');
  const cta = 'สอบถามคิวและดูรูปเพิ่มเติมทาง LINE: https://lin.ee/piqwBz3';
  if (card.category === 'exclusive' && destination === 'preview') {
    return [
      `EXCLUSIVE PREVIEW · ${name}`,
      'แค่พรีวิวก็ชวนให้รู้จักมากขึ้น ✨',
      'ติดตามรายละเอียดเพิ่มเติมในห้อง Premium',
      cta,
    ].join('\n');
  }
  const labels = {
    exclusive: 'EXCLUSIVE MODEL',
    premium: 'PREMIUM MODEL',
    standard: 'STANDARD MODEL',
    travel: 'MMD TRAVEL',
    extreme: 'MMD EXTREME',
  };
  const lines = [`${labels[card.category]} · ${name}`];
  const stats = cardStats(card);
  if (stats) lines.push(stats);
  if (card.category === 'exclusive') lines.push('คอมพ์การ์ด Exclusive สำหรับสมาชิก Premium');
  else if (card.category === 'premium') lines.push('คอมพ์การ์ดที่คัดมาให้สมาชิก Premium ได้รู้จัก');
  else if (card.category === 'standard') lines.push('อีกหนึ่งโปรไฟล์จากคอลเลกชัน Standard');
  else lines.push('อีกหนึ่งโปรไฟล์ที่ชวนให้รู้จักมากขึ้น');
  lines.push(cta);
  return lines.join('\n');
}

function dateOrdinal(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const milliseconds = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds)) return null;
  if (new Date(milliseconds).toISOString().slice(0, 10) !== date) return null;
  return milliseconds / DAY_MS;
}

function stableCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function chooseDailyCard(cards, history, date) {
  const today = dateOrdinal(date);
  if (today === null) throw new TypeError('A valid YYYY-MM-DD publishing date is required');
  const lastExposure = new Map();
  for (const row of Array.isArray(history) ? history : []) {
    if (!row || typeof row.model_id !== 'string' || word(row.status) === 'not sent') continue;
    const previous = dateOrdinal(row.date);
    if (previous === null) continue;
    // Unknown delivery outcomes, in-flight sends and receipts all consume exposure.
    // An explicit not_sent receipt is the only history state that proves no exposure.
    lastExposure.set(row.model_id, Math.max(lastExposure.get(row.model_id) ?? -Infinity, previous));
  }
  const eligible = (Array.isArray(cards) ? cards : []).filter(card => {
    if (!card || !card.model_id || !CATEGORIES.includes(card.category)) return false;
    const previous = lastExposure.get(card.model_id);
    return previous === undefined || today - previous >= COOLDOWN_DAYS;
  });
  const availableCategories = CATEGORIES.filter(category => eligible.some(card => card.category === category));
  if (!availableCategories.length) return null;
  const categoryCount = availableCategories.length;
  const rotationDay = today - ROTATION_EPOCH;
  const rotationStart = ((rotationDay % categoryCount) + categoryCount) % categoryCount;
  eligible.sort((a, b) => {
    const previousA = lastExposure.get(a.model_id);
    const previousB = lastExposure.get(b.model_id);
    if (previousA === undefined && previousB !== undefined) return -1;
    if (previousB === undefined && previousA !== undefined) return 1;
    if (previousA !== previousB) return previousA - previousB;
    const categoryA = (availableCategories.indexOf(a.category) - rotationStart + categoryCount) % categoryCount;
    const categoryB = (availableCategories.indexOf(b.category) - rotationStart + categoryCount) % categoryCount;
    return categoryA - categoryB
      || stableCompare(safeDisplayName(a), safeDisplayName(b))
      || stableCompare(String(a.model_id), String(b.model_id))
      || stableCompare(String(a.id ?? a.file_id), String(b.id ?? b.file_id));
  });
  return eligible[0] || null;
}

