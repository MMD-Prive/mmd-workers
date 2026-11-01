import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED_COMPCARD_MANIFEST } from './src/compcard-approved-manifest.js';
import { destinationsForCategory, evaluateCard, buildCompcardCaption, chooseDailyCard } from './src/compcard-policy.js';

function card(category = 'premium', name = 'Example', id = 'recExampleModel01') {
  return { id: `file-${id}`, file_id: `file-${id}`, model_id: id, canonical_name: name, display_name: name, category, height_cm: 180, weight_kg: 72, caption_stats_allowed: true };
}

function record(c, extra = {}) {
  return { id: c.model_id, fields: { working_name: c.canonical_name, status: 'Active', sales_layer: 'private', private_tier: 'Premium', visibility: 'private', ...extra } };
}

test('category destinations implement the owner routing contract without shared mutable arrays', () => {
  assert.deepEqual(destinationsForCategory('exclusive'), ['premium', 'preview']);
  assert.deepEqual(destinationsForCategory('premium'), ['premium']);
  assert.deepEqual(destinationsForCategory('standard'), ['premium', 'standard']);
  assert.deepEqual(destinationsForCategory('travel'), ['preview']);
  assert.deepEqual(destinationsForCategory('extreme'), ['preview']);
  for (const unknown of ['promotion', 'unknown', 'constructor', '__proto__', undefined]) assert.deepEqual(destinationsForCategory(unknown), []);
  destinationsForCategory('exclusive').push('standard');
  assert.deepEqual(destinationsForCategory('exclusive'), ['premium', 'preview']);
});

test('a card requires the exact current canonical record and working name', () => {
  const c = card();
  assert.equal(evaluateCard(c, record(c)).ok, true);
  assert.equal(evaluateCard(c, { ...record(c), id: 'recOtherModel002' }).reason, 'model_identity_mismatch');
  assert.equal(evaluateCard(c, record(c, { working_name: 'EXAMPLE' })).reason, 'model_name_changed');
  assert.equal(evaluateCard(c, record(c, { working_name: 'Example 2' })).reason, 'model_name_changed');
});

test('active status is required; private visibility is permitted, explicit hidden controls are not', () => {
  const c = card();
  assert.equal(evaluateCard(c, record(c, { status: { name: 'active' }, visibility: { name: 'private' } })).ok, true);
  for (const status of ['', 'pending', 'inactive', 'Suspended']) assert.equal(evaluateCard(c, record(c, { status })).ok, false);
  for (const field of ['catalog_visibility', 'client_visibility_status', 'approved_client_visibility', 'visibility']) {
    assert.equal(evaluateCard(c, record(c, { [field]: { name: 'Hidden' } })).reason, 'model_hidden');
    assert.equal(evaluateCard(c, record(c, { [field]: 'blocked' })).reason, 'model_hidden');
  }
});

test('quarantined, test and ambiguous model records cannot enter the publication queue', () => {
  const c = card();
  for (const registry_record_type of ['Test/Fixture', 'Ghost/Synthetic', 'Blank/Invalid', 'Duplicate/Ambiguous', 'Intake Candidate']) {
    assert.equal(evaluateCard(c, record(c, { registry_record_type })).reason, 'model_quarantined');
  }
  assert.equal(evaluateCard(c, record(c, { registry_record_type: 'Existing Model Record' })).ok, true);
});

test('private tier is authoritative; recognition never upgrades or replaces the commercial tier', () => {
  const c = card('standard');
  const current = record(c, { private_tier: 'Standard Models', model_class: 'Premium', recognition_class: 'GWs' });
  assert.equal(evaluateCard(c, current).ok, true);
  assert.equal(evaluateCard({ ...c, category: 'premium' }, current).ok, false);
  assert.equal(evaluateCard({ ...c, category: 'exclusive' }, current).ok, false);
  assert.equal(evaluateCard(card(), record(card(), { private_tier: 'Unreviewed', model_class: 'Premium' })).ok, false);
  assert.equal(evaluateCard(card(), record(card(), { private_tier: '', model_class: 'Premium' })).ok, true);
  const exclusive = card('exclusive');
  assert.equal(evaluateCard(exclusive, record(exclusive, { private_tier: '', model_class: '', recognition_class: 'EMs' })).ok, false);
  assert.equal(evaluateCard(exclusive, record(exclusive, { private_tier: { name: 'Exclusive Models' }, model_class: 'Standard' })).ok, true);
});

test('public Travel and Extreme routing uses the public category, independently from physical model class', () => {
  const travel = card('travel');
  const current = record(travel, { sales_layer: 'public', 'MMD Public Category': 'Travel', model_class: 'Standard', private_tier: 'Premium' });
  assert.equal(evaluateCard(travel, current).ok, true);
  assert.equal(evaluateCard({ ...travel, category: 'standard' }, current).ok, false);
  assert.equal(evaluateCard({ ...travel, category: 'extreme' }, current).ok, false);
  assert.equal(evaluateCard({ ...travel, category: 'extreme' }, { ...current, fields: { ...current.fields, 'MMD Public Category': 'Extreme' } }).ok, true);
  assert.equal(evaluateCard(travel, { ...current, fields: { ...current.fields, 'MMD Public Category': '' } }).ok, false);
});

test('Exclusive teaser uses only the approved display RUN/name and keeps detailed stats in Premium', () => {
  const exclusive = { ...card('exclusive', 'Internal Canonical Name'), display_name: 'EMs-01', quality_notes: ['private internal quality note'] };
  const premium = buildCompcardCaption(exclusive, 'premium');
  const teaser = buildCompcardCaption(exclusive, 'preview');
  assert.match(premium, /180 \/ 72/);
  assert.match(teaser, /EMs-01/);
  assert.doesNotMatch(teaser, /180|72|Internal Canonical Name|quality note/);
  assert.match(teaser, /Premium/);
  assert.throws(() => buildCompcardCaption(exclusive, 'standard'), TypeError);
});

test('caption facts omit conflicting card statistics and never create prices, availability or legacy claims', () => {
  const c = { ...card('standard'), caption_stats_allowed: false, minimum_rate: 9999, available_now: true, private_notes: 'actor VIP Black Card' };
  const caption = buildCompcardCaption(c, 'standard');
  assert.doesNotMatch(caption, /180|72|9999|actor|VIP Black Card|ว่างวันนี้|พร้อมรับงาน/);
  assert.doesNotMatch(caption, /LINE|https?:/);
  assert.throws(() => buildCompcardCaption(c, 'preview'), TypeError);
});

test('the approved manifest contains unique matched models, pinned image bytes and no live-source secrets', () => {
  const manifest = APPROVED_COMPCARD_MANIFEST;
  assert.equal(manifest.schema, 'hype_compcards_v1');
  assert.equal(manifest.source_folder_id, '1r1yfSjwhuKqzPh7278wn-OmRwqtDdQ-Z');
  assert.equal(manifest.cards.length, 19);
  assert.equal(new Set(manifest.cards.map(c => c.model_id)).size, 19);
  assert.equal(new Set(manifest.cards.map(c => c.file_id)).size, 19);
  assert.equal(manifest.promotions.length, 2);
  const careBack = manifest.promotions.find(c => c.id === 'care-back-continues-2026-telegram');
  assert.equal(careBack.kind, 'text');
  assert.equal(careBack.availability_mode, 'bounded');
  assert.equal(careBack.valid_to, '2026-11-01T00:00:00+07:00');
  const doubleMoment = manifest.promotions.find(c => c.id === 'double-moment-continues-2026-telegram');
  assert.ok(doubleMoment);
  assert.equal(doubleMoment.availability_mode, 'continuous');
  assert.equal(doubleMoment.status, 'active');
  assert.equal(doubleMoment.valid_to, null);
  assert.equal(doubleMoment.financial_campaign_id, 'promo_double_moment_sep2026');
  assert.equal(doubleMoment.package_code, 'double_moment_20000');
  assert.equal(doubleMoment.policy_version, 'v1');
  assert.deepEqual(doubleMoment.terms, {
    paid_amount_thb: 20000,
    total_credit_thb: 27000,
    paid_credit_thb: 20000,
    moment_bonus_count: 2,
    moment_bonus_each_thb: 3500,
    minimum_service_per_confirmed_booking_thb: 20000,
    credit_valid_days_after_verified_payment: 180,
    limit_per_verified_member_per_campaign: 1,
    verification_and_ledger: 'existing_official_verify_flow',
  });
  assert.equal(new Set(Object.values(doubleMoment.captions)).size, 1);
  assert.match(doubleMoment.captions.preview, /27,000 บาท/);
  assert.match(doubleMoment.captions.preview, /180 วัน/);
  for (const c of manifest.cards) {
    assert.equal(c.id, c.file_id);
    assert.match(c.model_id, /^rec[A-Za-z0-9]{14}$/);
    assert.match(c.sha256, /^[a-f0-9]{64}$/);
    assert.ok(['image/png', 'image/jpeg'].includes(c.content_type));
    assert.ok(c.bytes > 0 && c.bytes < 10_000_000);
    assert.ok(c.width > 0 && c.height > 0);
    assert.ok(c.quality_notes.every(note => typeof note === 'string'));
    for (const destination of destinationsForCategory(c.category)) {
      const caption = buildCompcardCaption(c, destination);
      assert.ok(caption.length <= 1024);
      assert.doesNotMatch(caption, /rec[A-Za-z0-9]{14}|sha256|source_folder|\/tmp\//);
    }
  }
  assert.equal(manifest.cards.find(c => c.canonical_name === 'Tae S').caption_stats_allowed, false);
  assert.equal(manifest.cards.find(c => c.canonical_name === 'Tinn F').caption_stats_allowed, false);
  const privateAlias = manifest.cards.find(c => c.display_name === 'EMs-01');
  assert.ok(privateAlias);
  assert.doesNotMatch(buildCompcardCaption(privateAlias, 'preview'), new RegExp(privateAlias.canonical_name));
});

test('never promoted since activation outranks old known history; otherwise the oldest exposure wins', () => {
  const fresh = card('standard', 'Fresh', 'recFreshModel001');
  const old = card('premium', 'Old', 'recOlderModel001');
  const older = card('travel', 'Older', 'recOldestModel01');
  const history = [{ model_id: old.model_id, date: '2026-10-03', status: 'sent' }, { model_id: older.model_id, date: '2026-10-01', status: 'sent' }];
  assert.equal(chooseDailyCard([old, older, fresh], history, '2026-10-18'), fresh);
  assert.equal(chooseDailyCard([old, older], history, '2026-10-18'), older);
});

test('seven-day cooldown includes in-flight and uncertain exposures and crosses calendar boundaries correctly', () => {
  const c = card();
  for (const status of ['sent', 'sending', 'uncertain', 'delivery_uncertain']) {
    assert.equal(chooseDailyCard([c], [{ model_id: c.model_id, date: '2026-10-12', status }], '2026-10-18'), null);
    assert.equal(chooseDailyCard([c], [{ model_id: c.model_id, date: '2026-10-11', status }], '2026-10-18'), c);
  }
  assert.equal(chooseDailyCard([c], [{ model_id: c.model_id, date: '2026-09-30', status: 'sent' }], '2026-10-07'), c);
  assert.equal(chooseDailyCard([c], [{ model_id: c.model_id, date: '2026-10-19', status: 'sent' }], '2026-10-18'), null);
});

test('known not_sent attempts do not consume exposure, and multiple destination receipts retain the newest exposure', () => {
  const c = card();
  assert.equal(chooseDailyCard([c], [{ model_id: c.model_id, date: '2026-10-18', status: 'not_sent' }], '2026-10-18'), c);
  assert.equal(chooseDailyCard([c], [
    { model_id: c.model_id, date: '2026-10-01', status: 'sent' },
    { model_id: c.model_id, date: '2026-10-17', status: 'delivery_uncertain' },
    { model_id: c.model_id, date: '2026-10-18', status: 'not_sent' },
  ], '2026-10-18'), null);
});

test('empty-history ties rotate categories by calendar day and remain stable across input order', () => {
  const cards = ['exclusive', 'premium', 'standard', 'travel', 'extreme'].map((category, i) => card(category, `Name ${i}`, `recCategory0000${i}`));
  const selected = new Set();
  for (let day = 18; day <= 22; day += 1) {
    const date = `2026-10-${day}`;
    const chosen = chooseDailyCard(cards, [], date);
    assert.equal(chooseDailyCard([...cards].reverse(), [], date), chosen);
    selected.add(chosen.category);
  }
  assert.equal(selected.size, 5);
  const first = card('premium', 'Alpha', 'recAlphaModel001');
  const last = card('premium', 'Zulu', 'recZuluModel0001');
  assert.equal(chooseDailyCard([last, first], [], '2026-10-18'), first);
});

test('publishing dates are exact real UTC calendar dates; malformed historical dates are not normalized', () => {
  const c = card();
  for (const invalid of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-10-00', '2026-10-1', '2026-10-18T00:00:00Z', '', null]) {
    assert.throws(() => chooseDailyCard([c], [], invalid), TypeError);
  }
  assert.equal(chooseDailyCard([c], [], '2028-02-29'), c);
  assert.equal(chooseDailyCard([c], [{ model_id: c.model_id, date: '2026-09-31', status: 'sent' }], '2026-10-01'), c);
  assert.equal(chooseDailyCard([], [], '2026-10-18'), null);
});

test('an absent Extreme inventory does not double-weight Exclusive in the first four category slots', () => {
  const categories = ['exclusive', 'premium', 'standard', 'travel'];
  const cards = categories.flatMap((category, i) => [
    card(category, `Alpha ${category}`, `recCategoryA000${i}`),
    card(category, `Beta ${category}`, `recCategoryB000${i}`),
  ]);
  const history = [];
  const selected = [];
  for (let offset = 0; offset < 4; offset += 1) {
    const date = `2026-10-${18 + offset}`;
    const chosen = chooseDailyCard(cards, history, date);
    selected.push(chosen.category);
    history.push({ model_id: chosen.model_id, date, status: 'sent' });
  }
  assert.deepEqual(selected, categories);
});



test('all daily model variants and approved promotion captions exclude the prohibited wording', () => {
  for (const category of ['exclusive', 'premium', 'standard', 'travel', 'extreme']) {
    for (const destination of destinationsForCategory(category)) {
      const caption = buildCompcardCaption(card(category), destination);
      assert.doesNotMatch(caption, /ทีม/);
      if (destination === 'preview') {
        assert.equal(caption.split('\n').at(-1), 'สอบถามคิวและดูรูปเพิ่มเติมทาง LINE: https://lin.ee/piqwBz3');
      } else {
        assert.doesNotMatch(caption, /LINE|https?:|lin\.ee|สอบถามคิว/);
      }
    }
  }
  for (const c of APPROVED_COMPCARD_MANIFEST.cards) {
    for (const destination of destinationsForCategory(c.category)) {
      assert.doesNotMatch(buildCompcardCaption(c, destination), /ทีม/);
    }
  }
  for (const promotion of APPROVED_COMPCARD_MANIFEST.promotions) {
    for (const caption of Object.values(promotion.captions)) assert.doesNotMatch(caption, /ทีม/);
  }
});
