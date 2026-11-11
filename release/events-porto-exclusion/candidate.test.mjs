import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// All execution is offline, with a memory-only bucket and mocked sends.
globalThis.fetch = () => { throw new Error('Network forbidden in this offline test'); };
const baselineText = readFileSync(new URL('./live-baseline.mjs', import.meta.url), 'utf8');
const candidateText = readFileSync(new URL('./porto-only-candidate.mjs', import.meta.url), 'utf8');
const exports = '\nexport { executeSlot, APPROVED_COMPCARD_MANIFEST, COMPCARD_JOURNAL_ROOT, jsonDigest, captionForLiveCard, eligibleCards };\n';
const load = source => import('data:text/javascript;base64,' + Buffer.from(source + exports).toString('base64'));
const [base, candidate] = await Promise.all([load(baselineText), load(candidateText)]);
const PORTO = 'recnl4Fksh6pXEwA1';
const at = (date, slot) => Date.parse(`${date}T${slot === 'standard' ? '20:00' : '16:30'}:00+07:00`);
const digest = value => createHash('sha256').update(value).digest('hex');
const inventory = base.APPROVED_COMPCARD_MANIFEST.cards.filter(card => card.category === 'standard');
function fixture(cards = inventory) {
  const records = new Map();
  let version = 0;
  const bucket = {
    records,
    async get(key) { const row = records.get(key); return row ? { etag: row.etag, text: async () => row.value } : null; },
    async put(key, value, options = {}) {
      const old = records.get(key);
      if ((options.onlyIf?.etagDoesNotMatch === '*' && old) || (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== old?.etag)) return null;
      const row = { etag: `v${++version}`, value: String(value) };
      records.set(key, row); return { etag: row.etag };
    },
    read(key) { const row = records.get(base.COMPCARD_JOURNAL_ROOT + key); return row ? JSON.parse(row.value) : null; },
  };
  const models = cards.map(card => ({ id: card.model_id, fields: { working_name: card.canonical_name, status: 'Active', sales_layer: 'private', private_tier: card.category } }));
  const sends = [];
  const assetReads = [];
  const manifest = { ...base.APPROVED_COMPCARD_MANIFEST, cards };
  const env = { HYPE_COMPCARD_ENABLED: 'true', HYPE_STANDARD_ENABLED: 'true', HYPE_PROMOTION_ENABLED: 'false' };
  const deps = {
    models: async () => models,
    model: async id => models.find(model => model.id === id),
    asset: async card => { assetReads.push(card.model_id); return { bytes: new Uint8Array([1]), sha256: card.sha256, content_type: card.content_type }; },
    send: async (card, destination, caption, asset, chatId) => {
      sends.push({ model_id: card.model_id, destination });
      return { ok: true, delivery_state: 'sent', message_id: sends.length, chat_id: chatId, destination, approved_sha256: card.sha256 };
    },
  };
  return { bucket, records, models, manifest, env, deps, sends, assetReads };
}
const run = (api, f, date = '2026-11-11', slot = 'standard') => api.executeSlot(f.env, f.manifest, f.bucket, slot, at(date, slot), f.deps, () => at(date, slot));
async function history(f) {
  for (const card of inventory) await f.bucket.put(base.COMPCARD_JOURNAL_ROOT + `history/${card.model_id}.json`, JSON.stringify({ model_id: card.model_id, category: card.category, date: card.model_id === PORTO ? '2026-11-04' : card.canonical_name.includes('Simba') ? '2026-11-07' : '2026-11-08', status: 'sent' }));
}
async function freezePorto(f, date = '2026-11-11', slot = 'standard') {
  const card = inventory.find(card => card.model_id === PORTO);
  const destinations = ['premium', 'standard'];
  const plan = { schema: 'hype_compcard_plan_v1', date, slot, manifest_revision: f.manifest.revision, created_at: at(date, slot), card_id: card.id, model_id: card.model_id, category: card.category, file_id: card.file_id, sha256: card.sha256, destinations, chat_ids: Object.fromEntries(destinations.map(destination => [destination, f.manifest.destinations[destination]])), captions: Object.fromEntries(destinations.map(destination => [destination, base.captionForLiveCard(card, destination, f.models.find(model => model.id === card.model_id))])) };
  plan.digest = await base.jsonDigest(plan);
  await f.bucket.put(base.COMPCARD_JOURNAL_ROOT + `plans/${date}/${slot}.json`, JSON.stringify(plan));
  return plan;
}
async function seedDelivery(f, plan, destination, status, extra = {}) {
  const record = {
    schema: 'hype_compcard_delivery_v1', date: plan.date, slot: plan.slot, destination,
    model_id: plan.model_id, card_id: plan.card_id, plan_digest: plan.digest,
    approved_sha256: plan.sha256, expected_chat_id: plan.chat_ids[destination],
    status, attempts: status === 'pending' ? 0 : 1, lease_until: 0,
    created_at: at(plan.date, plan.slot) - 1000,
    receipt: status === 'sent' ? { message_id: 123, chat_id: plan.chat_ids[destination], approved_sha256: plan.sha256 } : null,
    ...extra,
  };
  const key = base.COMPCARD_JOURNAL_ROOT + `deliveries/${plan.date}/${plan.slot}/${destination}.json`;
  await f.bucket.put(key, JSON.stringify(record));
  return { key, value: f.records.get(key).value };
}

test('exact live baseline and only two reversible changes in the daily module', () => {
  assert.equal(digest(baselineText), 'd517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee');
  const manifest = JSON.parse(readFileSync(new URL('./porto-only-overlay.json', import.meta.url)));
  assert.equal(manifest.replacements.length, 2);
  assert.deepEqual(manifest.sections.map(row => row.name), ['compcard-daily']);
  let restored = candidateText;
  for (const row of [...manifest.replacements].reverse()) restored = restored.replace(row.after, row.before);
  assert.equal(restored, baselineText);
  assert.equal(digest(candidateText), manifest.candidate_sha256);
});

test('reported Nov 11 history chooses Porto in baseline but sends no one in the candidate', async () => {
  const before = fixture(); const after = fixture();
  await history(before); await history(after);
  const oldHistory = [...after.records].map(([key, value]) => [key, value.value]);
  assert.equal((await run(base, before)).model_id, PORTO);
  const result = await run(candidate, after);
  assert.equal(result.status, 'no_eligible_card');
  assert.deepEqual(after.sends, []);
  assert.deepEqual([...after.records].map(([key, value]) => [key, value.value]), oldHistory);
  assert.equal(after.bucket.read('plans/2026-11-11/standard.json'), null);
});

test('other eligible models remain publishable with original Premium and Standard routing', async () => {
  const f = fixture(); const result = await run(candidate, f);
  assert.notEqual(result.model_id, PORTO);
  assert.equal(result.status, 'sent');
  assert.deepEqual(f.sends.map(row => row.destination), ['premium', 'standard']);
  assert.equal(f.env.HYPE_PROMOTION_ENABLED, 'false');
});

test('Porto-only pending frozen plan cannot read assets or send, and plan/history remain unchanged', async () => {
  const f = fixture(); await history(f); await freezePorto(f);
  const oldPlan = f.records.get(base.COMPCARD_JOURNAL_ROOT + 'plans/2026-11-11/standard.json').value;
  const oldHistory = f.records.get(base.COMPCARD_JOURNAL_ROOT + `history/${PORTO}.json`).value;
  const result = await run(candidate, f);
  assert.equal(result.sent, 0);
  assert.ok(result.outcomes.every(row => row.status === 'blocked' && row.error === 'compcard_owner_excluded_porto'));
  assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
  assert.equal(f.records.get(base.COMPCARD_JOURNAL_ROOT + 'plans/2026-11-11/standard.json').value, oldPlan);
  assert.equal(f.records.get(base.COMPCARD_JOURNAL_ROOT + `history/${PORTO}.json`).value, oldHistory);
});

test('already sent Porto receipts remain truthful, unchanged, and are not re-sent', async () => {
  const f = fixture(); await freezePorto(f);
  assert.equal((await run(base, f)).status, 'sent');
  const oldReceipts = ['premium', 'standard'].map(destination => f.records.get(base.COMPCARD_JOURNAL_ROOT + `deliveries/2026-11-11/standard/${destination}.json`).value);
  const sends = f.sends.length;
  assert.equal((await run(candidate, f)).status, 'sent');
  assert.equal(f.sends.length, sends);
  assert.deepEqual(['premium', 'standard'].map(destination => f.records.get(base.COMPCARD_JOURNAL_ROOT + `deliveries/2026-11-11/standard/${destination}.json`).value), oldReceipts);
});

test('canonical Porto is excluded from fresh selection on both slots and future dates', async () => {
  const porto = inventory.filter(card => card.model_id === PORTO);
  for (const date of ['2026-11-11', '2026-11-12', '2026-12-11', '2027-01-15']) for (const slot of ['model', 'standard']) {
    const before = fixture(porto); const after = fixture(porto);
    assert.equal((await run(base, before, date, slot)).status, 'sent');
    assert.equal((await run(candidate, after, date, slot)).status, 'no_eligible_card');
    assert.deepEqual(after.sends, []); assert.deepEqual(after.assetReads, []);
    assert.equal(after.records.size, 0);
  }
});

test('canonical Porto is excluded from static and intake candidate sources in every category', () => {
  const original = inventory.find(card => card.model_id === PORTO);
  for (const category of ['exclusive', 'premium', 'standard', 'travel', 'extreme']) for (const source of [undefined, 'owner_drive_intake']) {
    const card = { ...original, category, ...(source ? { source } : {}) };
    const result = candidate.eligibleCards({ cards: [card] }, []);
    assert.deepEqual(result.eligible, []);
    assert.equal(result.excluded[0].reason, 'owner_automatic_selection_excluded');
  }
});

test('non-Porto inventories preserve exact outcomes and history', async () => {
  const others = inventory.filter(card => card.model_id !== PORTO);
  const before = fixture(others); const after = fixture(others);
  assert.deepEqual(await run(candidate, after), await run(base, before));
  assert.deepEqual([...after.records].map(([key, value]) => [key, value.value]), [...before.records].map(([key, value]) => [key, value.value]));
});

for (const date of ['2026-11-12', '2026-12-11', '2027-01-15']) for (const slot of ['model', 'standard']) {
  test(`frozen pending Porto is blocked in both destinations on ${date}/${slot}`, async () => {
    const f = fixture(); await freezePorto(f, date, slot);
    const key = base.COMPCARD_JOURNAL_ROOT + `plans/${date}/${slot}.json`;
    const originalPlan = f.records.get(key).value;
    const result = await run(candidate, f, date, slot);
    assert.equal(result.sent, 0);
    assert.deepEqual(result.outcomes.map(row => row.destination), ['premium', 'standard']);
    assert.ok(result.outcomes.every(row => row.status === 'blocked' && row.error === 'compcard_owner_excluded_porto'));
    assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
    assert.equal(f.records.get(key).value, originalPlan);
  });
}
test('future partial sent and uncertain receipts stay byte-identical on both slots while the other destination is blocked', async () => {
  for (const date of ['2026-11-12', '2027-01-15']) for (const slot of ['model', 'standard']) for (const preservedDestination of ['premium', 'standard']) for (const terminal of ['sent', 'delivery_uncertain']) {
    const f = fixture(); const plan = await freezePorto(f, date, slot);
    const saved = await seedDelivery(f, plan, preservedDestination, terminal);
    const pendingDestination = preservedDestination === 'premium' ? 'standard' : 'premium';
    await seedDelivery(f, plan, pendingDestination, 'pending');
    const result = await run(candidate, f, date, slot);
    assert.equal(result.outcomes.find(row => row.destination === preservedDestination).status, terminal);
    assert.equal(result.outcomes.find(row => row.destination === pendingDestination).status, 'blocked');
    assert.equal(f.records.get(saved.key).value, saved.value);
    assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
  }
});
test('future non-Porto selections and receipts remain exactly equivalent on both slots', async () => {
  const others = inventory.filter(card => card.model_id !== PORTO);
  for (const date of ['2026-11-12', '2027-01-15']) for (const slot of ['model', 'standard']) {
    const before = fixture(others); const after = fixture(others);
    assert.deepEqual(await run(candidate, after, date, slot), await run(base, before, date, slot));
    assert.deepEqual([...after.records].map(([key, value]) => [key, value.value]), [...before.records].map(([key, value]) => [key, value.value]));
  }
});
test('future in-flight and expired sending evidence follows baseline truth on both slots', async () => {
  const date = '2027-01-15';
  for (const slot of ['model', 'standard']) for (const destination of ['premium', 'standard']) for (const activeLease of [true, false]) {
    const before = fixture(); const after = fixture();
    const bp = await freezePorto(before, date, slot); const ap = await freezePorto(after, date, slot);
    const extra = { lease_until: activeLease ? at(date, slot) + 60000 : 0 };
    await seedDelivery(before, bp, destination, 'sending', extra);
    const preserved = await seedDelivery(after, ap, destination, 'sending', extra);
    const sibling = destination === 'premium' ? 'standard' : 'premium';
    await seedDelivery(before, bp, sibling, 'sent'); await seedDelivery(after, ap, sibling, 'sent');
    assert.deepEqual(await run(candidate, after, date, slot), await run(base, before, date, slot));
    assert.equal(after.records.get(preserved.key).value, before.records.get(preserved.key).value);
    if (activeLease) assert.equal(after.records.get(preserved.key).value, preserved.value);
    assert.deepEqual(after.sends, []); assert.deepEqual(after.assetReads, []);
  }
});

for (const destination of ['premium', 'standard']) {
  const sibling = destination === 'premium' ? 'standard' : 'premium';
  for (const terminal of ['sent', 'delivery_uncertain']) {
    test(`partial ${terminal} evidence in ${sibling} remains byte-identical while pending ${destination} is blocked`, async () => {
      const f = fixture(); await history(f); const plan = await freezePorto(f);
      const preserved = await seedDelivery(f, plan, sibling, terminal, terminal === 'delivery_uncertain' ? { error: 'compcard_transport_unknown', next_attempt_at: null } : {});
      await seedDelivery(f, plan, destination, 'pending');
      const oldHistory = f.records.get(base.COMPCARD_JOURNAL_ROOT + `history/${PORTO}.json`).value;
      const result = await run(candidate, f);
      const pending = result.outcomes.find(row => row.destination === destination);
      assert.equal(pending.status, 'blocked');
      assert.equal(pending.error, 'compcard_owner_excluded_porto');
      assert.equal(result.outcomes.find(row => row.destination === sibling).status, terminal);
      assert.equal(f.records.get(preserved.key).value, preserved.value);
      assert.equal(f.records.get(base.COMPCARD_JOURNAL_ROOT + `history/${PORTO}.json`).value, oldHistory);
      assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
    });
  }
  for (const state of ['pending', 'preparing', 'not_sent']) {
    test(`retryable ${state} delivery in ${destination} is blocked before any asset or send`, async () => {
      const f = fixture(); const plan = await freezePorto(f);
      const preserved = await seedDelivery(f, plan, sibling, 'sent');
      await seedDelivery(f, plan, destination, state);
      const result = await run(candidate, f);
      assert.equal(result.outcomes.find(row => row.destination === destination).status, 'blocked');
      assert.equal(f.records.get(preserved.key).value, preserved.value);
      assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
    });
  }
  test(`in-flight sending lease in ${destination} remains untouched, with no retry`, async () => {
    const f = fixture(); const plan = await freezePorto(f);
    const preserved = await seedDelivery(f, plan, destination, 'sending', { lease_until: at('2026-11-11', 'standard') + 60000 });
    await seedDelivery(f, plan, sibling, 'pending');
    await run(candidate, f);
    assert.equal(f.records.get(preserved.key).value, preserved.value);
    assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
  });
  test(`expired sending evidence in ${destination} follows the unchanged uncertainty path, without retry`, async () => {
    const before = fixture(); const after = fixture();
    const beforePlan = await freezePorto(before); const afterPlan = await freezePorto(after);
    await seedDelivery(before, beforePlan, destination, 'sending');
    const afterRecord = await seedDelivery(after, afterPlan, destination, 'sending');
    await seedDelivery(before, beforePlan, sibling, 'sent');
    await seedDelivery(after, afterPlan, sibling, 'sent');
    assert.deepEqual(await run(candidate, after), await run(base, before));
    assert.equal(after.records.get(afterRecord.key).value, before.records.get(afterRecord.key).value);
    assert.equal(after.bucket.read(`deliveries/2026-11-11/standard/${destination}.json`).status, 'delivery_uncertain');
    assert.deepEqual(after.sends, []); assert.deepEqual(after.assetReads, []);
  });
}
