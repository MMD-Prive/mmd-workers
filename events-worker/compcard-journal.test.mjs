import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPCARD_JOURNAL_ROOT, deliverCompcardOnce, freezeCompcardPlan,
  readCompcardJson, readCompcardHistory, reserveCompcardExposure, settleCompcardExposure, writeCompcardJson,
} from "./src/compcard-journal.js";
import { chooseDailyCard } from "./src/compcard-policy.js";

const NOW = Date.parse("2026-10-18T09:30:00Z");
const KEY = "deliveries/2026-10-18/model/premium.json";
const CONTEXT = {
  date: "2026-10-18", slot: "model", destination: "premium", model_id: "recFixtureModel",
  card_id: "fixture-card", plan_digest: "fixture-plan", approved_sha256: "a".repeat(64), expected_chat_id: "-1001111111111",
};

// R2 conditional writes are evaluated atomically against the current ETag.
// A get returns an immutable snapshot, not a reference that changes under a caller.
class MemoryR2 {
  objects = new Map();
  sequence = 0;
  writes = [];
  onPut = null;
  omitReadEtag = false;
  omitWriteEtag = false;
  async get(key) {
    const value = this.objects.get(key);
    return value ? { etag: this.omitReadEtag ? undefined : value.etag, text: async () => value.text } : null;
  }
  async put(key, text, options = {}) {
    const record = JSON.parse(text);
    this.writes.push({ key, record, options });
    if (this.onPut) {
      const action = await this.onPut({ key, record, options });
      if (action === "conflict") return null;
      if (action === "throw") throw new Error("fixture_r2_write_failed");
    }
    const previous = this.objects.get(key);
    if (options.onlyIf?.etagDoesNotMatch === "*" && previous) return null;
    if (options.onlyIf?.etagMatches && previous?.etag !== options.onlyIf.etagMatches) return null;
    const etag = `etag-${++this.sequence}`;
    this.objects.set(key, { text, etag });
    return this.omitWriteEtag ? {} : { etag };
  }
  async seed(key, fields = {}) {
    const record = { schema: "hype_compcard_delivery_v1", ...CONTEXT, status: "pending", attempts: 0, created_at: NOW, lease_until: 0, ...fields };
    await this.put(COMPCARD_JOURNAL_ROOT + key, JSON.stringify(record));
    return record;
  }
  record(key = KEY) { return JSON.parse(this.objects.get(COMPCARD_JOURNAL_ROOT + key)?.text || "null"); }
}

function accepted(context = CONTEXT, overrides = {}) {
  return { ok: true, delivery_state: "sent", message_id: 711, chat_id: context.expected_chat_id, destination: context.destination, approved_sha256: context.approved_sha256, file_unique_id: "fixture-photo", ...overrides };
}
function once(bucket, overrides = {}) {
  return deliverCompcardOnce({ bucket, key: KEY, context: CONTEXT, now: NOW, prepare: async () => ({ bytes: new Uint8Array([1]) }), deliver: async () => accepted(), ...overrides });
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("concurrent daily plan creation freezes exactly one winner", async () => {
  const bucket = new MemoryR2();
  const plans = await Promise.all(Array.from({ length: 20 }, (_, index) => freezeCompcardPlan(bucket, CONTEXT.date, "model", { card_id: `card-${index}` })));
  assert.equal(new Set(plans.map(plan => plan.card_id)).size, 1);
  assert.equal(bucket.objects.size, 1);
  assert.ok(bucket.writes.every(write => write.options.onlyIf.etagDoesNotMatch === "*"));
});

test("parallel invocations acquire only one preparing lease and send only once", async () => {
  const bucket = new MemoryR2();
  const entered = deferred();
  const resume = deferred();
  let prepares = 0;
  let sends = 0;
  const callbacks = {
    prepare: async () => { prepares++; entered.resolve(); await resume.promise; return { approved: true }; },
    deliver: async prepared => { assert.equal(prepared.approved, true); sends++; return accepted(); },
  };
  const leader = once(bucket, callbacks);
  await entered.promise;
  const followers = await Promise.all(Array.from({ length: 20 }, () => once(bucket, callbacks)));
  assert.ok(followers.every(result => result.duplicate));
  assert.equal(sends, 0);
  resume.resolve();
  const winner = await leader;
  assert.equal(winner.status, "sent");
  assert.equal(prepares, 1);
  assert.equal(sends, 1);
  assert.equal(bucket.record().attempts, 1);
  const replay = await once(bucket, { ...callbacks, now: NOW + 86_400_000 });
  assert.equal(replay.status, "sent");
  assert.equal(replay.duplicate, true);
  assert.equal(sends, 1);
  assert.ok(bucket.writes.every(write => write.options.onlyIf));
});

test("expired preparation is recoverable but its stale worker cannot acquire a sending marker", async () => {
  const bucket = new MemoryR2();
  const entered = deferred();
  const resume = deferred();
  let sends = 0;
  const first = once(bucket, {
    prepare: async () => { entered.resolve(); await resume.promise; return "stale"; },
    deliver: async () => { sends++; return accepted(); },
  });
  await entered.promise;
  const recovery = await once(bucket, { now: NOW + 11 * 60000, deliver: async () => { sends++; return accepted(); } });
  assert.equal(recovery.status, "sent");
  resume.resolve();
  const stale = await first;
  assert.equal(stale.error, "compcard_send_claim_lost");
  assert.equal(sends, 1);
  assert.equal(bucket.record().status, "sent");
});

test("an expired sending marker is held as uncertain and never re-sent", async () => {
  const bucket = new MemoryR2();
  await bucket.seed(KEY, { status: "sending", attempts: 1, lease_until: NOW + 10 * 60000 });
  let sends = 0;
  const deliver = async () => { sends++; return accepted(); };
  assert.equal((await once(bucket, { now: NOW + 5 * 60000, deliver })).duplicate, true);
  assert.equal((await once(bucket, { now: NOW + 11 * 60000, deliver })).status, "delivery_uncertain");
  assert.equal((await once(bucket, { now: NOW + 86_400_000, deliver })).status, "delivery_uncertain");
  assert.equal(sends, 0);
  assert.equal(bucket.record().error, "compcard_send_receipt_missing");
});

for (const failure of ["conflict", "throw"]) {
  test(`accepted send followed by receipt write ${failure} remains protected from repeats`, async () => {
    const bucket = new MemoryR2();
    let sends = 0;
    bucket.onPut = ({ record }) => record.status === "sent" ? failure : undefined;
    const first = once(bucket, { deliver: async () => { sends++; return accepted(); } });
    if (failure === "throw") await assert.rejects(first, /fixture_r2_write_failed/);
    else assert.equal((await first).state_write_conflict, true);
    assert.equal(sends, 1);
    assert.equal(bucket.record().status, "sending");
    bucket.onPut = null;
    const replay = await once(bucket, { now: NOW + 11 * 60000, deliver: async () => { sends++; return accepted(); } });
    assert.equal(replay.status, "delivery_uncertain");
    assert.equal(sends, 1);
  });
}

test("an unverified transport receipt can never become a sent record", async () => {
  const invalid = [
    { ok: false }, { message_id: 0 }, { message_id: 1.5 }, { chat_id: "-1009999999999" },
    { destination: "standard" }, { approved_sha256: "b".repeat(64) }, { delivery_state: "unexpected" },
  ];
  for (const overrides of invalid) {
    const bucket = new MemoryR2();
    let sends = 0;
    const deliver = async () => { sends++; return accepted(CONTEXT, overrides); };
    assert.equal((await once(bucket, { deliver })).status, "delivery_uncertain");
    assert.equal((await once(bucket, { now: NOW + 86_400_000, deliver })).duplicate, true);
    assert.equal(sends, 1);
  }
});

test("transport exceptions are uncertain, while explicit not_sent outcomes retry at most three times", async () => {
  const uncertainBucket = new MemoryR2();
  assert.equal((await once(uncertainBucket, { deliver: async () => { throw new Error("secret transport URL"); } })).status, "delivery_uncertain");
  assert.equal(uncertainBucket.record().error, "compcard_transport_unknown");
  const bucket = new MemoryR2();
  let sends = 0;
  const deliver = async () => { sends++; return { delivery_state: "not_sent", error: "telegram_rejected_compcard" }; };
  assert.equal((await once(bucket, { deliver })).status, "not_sent");
  assert.equal((await once(bucket, { deliver, now: NOW + 14 * 60000 })).duplicate, true);
  await once(bucket, { deliver, now: NOW + 15 * 60000 });
  await once(bucket, { deliver, now: NOW + 30 * 60000 });
  assert.equal((await once(bucket, { deliver, now: NOW + 45 * 60000 })).exhausted, true);
  assert.equal(sends, 3);
});

test("prepare failure never sends and permanent rejection cannot be retried", async () => {
  const bucket = new MemoryR2();
  let sends = 0;
  const callbacks = {
    prepare: async () => { throw Object.assign(new Error("compcard_source_changed"), { retryable: false }); },
    deliver: async () => { sends++; return accepted(); },
  };
  assert.equal((await once(bucket, callbacks)).status, "blocked");
  assert.equal((await once(bucket, { ...callbacks, now: NOW + 86_400_000 })).duplicate, true);
  assert.equal(sends, 0);
  assert.equal(bucket.record().error, "compcard_source_changed");
});

test("changed frozen-plan context cannot overwrite or reuse a recipient delivery key", async () => {
  const bucket = new MemoryR2();
  await once(bucket);
  const before = bucket.record();
  for (const changes of [{ plan_digest: "different" }, { card_id: "other-card" }, { destination: "standard" }, { expected_chat_id: "-1002222222222" }, { approved_sha256: "b".repeat(64) }]) {
    const response = await once(bucket, { context: { ...CONTEXT, ...changes }, deliver: async () => { throw new Error("must_not_send"); } });
    assert.equal(response.error, "compcard_delivery_context_changed");
  }
  assert.deepEqual(bucket.record(), before);
});

test("partial failure in one destination does not consume another destination's independent claim", async () => {
  const bucket = new MemoryR2();
  const premium = await once(bucket, { deliver: async () => { throw new Error("unknown"); } });
  const standardContext = { ...CONTEXT, destination: "standard", expected_chat_id: "-1002222222222" };
  let standardSends = 0;
  const standard = await once(bucket, {
    key: KEY.replace("premium", "standard"), context: standardContext,
    deliver: async () => { standardSends++; return accepted(standardContext); },
  });
  assert.equal(premium.status, "delivery_uncertain");
  assert.equal(standard.status, "sent");
  assert.equal(standardSends, 1);
});

test("corrupted journal status, schema, or counters fail closed before prepare and send", async () => {
  for (const invalid of [{ status: "delivered" }, { schema: "other_v1" }, { attempts: -1 }, { attempts: 4 }, { attempts: "0" }, { lease_until: "0" }, { next_attempt_at: "soon" }]) {
    const bucket = new MemoryR2();
    await bucket.seed(KEY, invalid);
    let operations = 0;
    const result = await once(bucket, { prepare: async () => { operations++; }, deliver: async () => { operations++; } });
    assert.equal(result.status, "blocked");
    assert.equal(result.error, "compcard_delivery_record_invalid");
    assert.equal(operations, 0);
  }
});

test("missing R2 ETags never degrade conditional claims into unconditional writes", async () => {
  const bucket = new MemoryR2();
  await bucket.seed(KEY);
  bucket.omitReadEtag = true;
  await assert.rejects(once(bucket), /compcard_journal_etag_missing/);
  assert.equal(bucket.writes.length, 1);
  const creation = new MemoryR2();
  creation.omitWriteEtag = true;
  let sends = 0;
  await assert.rejects(once(creation, { deliver: async () => { sends++; return accepted(); } }), /compcard_journal_etag_missing/);
  assert.equal(sends, 0);
  assert.equal(creation.record().status, "pending");
  await assert.rejects(writeCompcardJson(new MemoryR2(), KEY, {}, ""), /compcard_journal_etag_missing/);
});

test("only machine error codes enter the journal, never arbitrary URL or token text", async () => {
  const bucket = new MemoryR2();
  const result = await once(bucket, { prepare: async () => { throw new Error("https://api.telegram.org/botSENSITIVE_SECRET/getChat failed"); } });
  assert.equal(result.error, "compcard_failed");
  assert.doesNotMatch(JSON.stringify(bucket.record()), /SENSITIVE_SECRET|api.telegram.org/);
});

test("concurrent exposure reservations never move a model's date backwards", async () => {
  const bucket = new MemoryR2();
  const card = { model_id: CONTEXT.model_id, category: "standard" };
  await Promise.all([
    reserveCompcardExposure(bucket, card, "2026-10-18", NOW),
    reserveCompcardExposure(bucket, card, "2026-10-19", NOW + 86_400_000),
    reserveCompcardExposure(bucket, card, "2026-10-18", NOW),
  ]);
  const history = await readCompcardJson(bucket, `history/${card.model_id}.json`);
  assert.equal(history.record.date, "2026-10-19");
  assert.equal(history.record.status, "sending");
});

test("confirmed not_sent outcomes restore prior exposure and today's retry reserves exposure again", async () => {
  const bucket = new MemoryR2();
  const card = { model_id: CONTEXT.model_id, category: "standard", display_name: "Fixture" };
  await reserveCompcardExposure(bucket, card, "2026-10-16", NOW - 2 * 86_400_000);
  await settleCompcardExposure(bucket, card, "2026-10-16", NOW - 2 * 86_400_000, [
    { destination: "premium", status: "sent" }, { destination: "standard", status: "sent" },
  ]);
  await reserveCompcardExposure(bucket, card, CONTEXT.date, NOW);
  await settleCompcardExposure(bucket, card, CONTEXT.date, NOW, [
    { destination: "premium", status: "not_sent" }, { destination: "standard", status: "blocked" },
  ]);
  let history = await readCompcardJson(bucket, `history/${card.model_id}.json`);
  assert.equal(history.record.status, "not_sent");
  assert.equal(history.record.previous_exposure.date, "2026-10-16");
  const readback = await readCompcardHistory(bucket, [card]);
  assert.equal(readback.length, 2);
  assert.equal(chooseDailyCard([card], readback, "2026-10-22"), null);
  assert.equal(chooseDailyCard([card], readback, "2026-10-23"), card);
  await reserveCompcardExposure(bucket, card, CONTEXT.date, NOW + 15 * 60000);
  history = await readCompcardJson(bucket, `history/${card.model_id}.json`);
  assert.equal(history.record.status, "sending");
  assert.equal(history.record.previous_exposure.date, "2026-10-16");
  assert.equal(history.record.previous_exposure.previous_exposure, undefined);
  await settleCompcardExposure(bucket, card, CONTEXT.date, NOW, [
    { destination: "premium", status: "not_sent" }, { destination: "standard", status: "not_sent" },
  ]);
  history = await readCompcardJson(bucket, `history/${card.model_id}.json`);
  assert.equal(history.record.status, "sending", "an old failed attempt cannot clear a newer retry reservation");
});

test("all-not-sent without earlier exposure does not impose a cooldown", async () => {
  const bucket = new MemoryR2();
  const card = { model_id: CONTEXT.model_id, category: "premium", display_name: "Fixture" };
  await reserveCompcardExposure(bucket, card, CONTEXT.date, NOW);
  await settleCompcardExposure(bucket, card, CONTEXT.date, NOW, [{ destination: "premium", status: "not_sent" }]);
  const history = await readCompcardHistory(bucket, [card]);
  assert.equal(chooseDailyCard([card], history, CONTEXT.date), card);
});

for (const [name, outcomes, expected] of [
  ["partial destination list", [{ destination: "premium", status: "not_sent" }], "delivery_uncertain"],
  ["duplicate destination list", [{ destination: "premium", status: "not_sent" }, { destination: "premium", status: "not_sent" }], "delivery_uncertain"],
  ["receipt conflict", [{ destination: "premium", status: "not_sent", state_write_conflict: true }, { destination: "standard", status: "blocked" }], "delivery_uncertain"],
  ["unknown send", [{ destination: "premium", status: "delivery_uncertain" }, { destination: "standard", status: "not_sent" }], "delivery_uncertain"],
  ["ongoing preparation", [{ destination: "premium", status: "preparing" }, { destination: "standard", status: "not_sent" }], "sending"],
  ["one confirmed recipient", [{ destination: "premium", status: "sent" }, { destination: "standard", status: "delivery_uncertain" }], "sent"],
]) {
  test(`exposure settlement retains ${name} (${expected})`, async () => {
    const bucket = new MemoryR2();
    const card = { model_id: CONTEXT.model_id, category: "standard" };
    await reserveCompcardExposure(bucket, card, CONTEXT.date, NOW);
    await settleCompcardExposure(bucket, card, CONTEXT.date, NOW, outcomes);
    assert.equal((await readCompcardJson(bucket, `history/${card.model_id}.json`)).record.status, expected);
    assert.equal(chooseDailyCard([card], await readCompcardHistory(bucket, [card]), CONTEXT.date), null);
  });
}

test("concurrent late settlements cannot erase an accepted or uncertain exposure", async () => {
  const bucket = new MemoryR2();
  const card = { model_id: CONTEXT.model_id, category: "premium" };
  await reserveCompcardExposure(bucket, card, CONTEXT.date, NOW);
  await Promise.all([
    settleCompcardExposure(bucket, card, CONTEXT.date, NOW, [{ destination: "premium", status: "sent" }]),
    settleCompcardExposure(bucket, card, CONTEXT.date, NOW, [{ destination: "premium", status: "not_sent" }]),
  ]);
  assert.equal((await readCompcardJson(bucket, `history/${card.model_id}.json`)).record.status, "sent");
  await settleCompcardExposure(bucket, card, CONTEXT.date, NOW, [{ destination: "premium", status: "not_sent" }]);
  assert.equal((await readCompcardJson(bucket, `history/${card.model_id}.json`)).record.status, "sent");
});
