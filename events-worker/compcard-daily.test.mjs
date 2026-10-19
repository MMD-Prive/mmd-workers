import test from "node:test";
import assert from "node:assert/strict";
import {
  compcardClock, compcardSchedule, compcardSha256, preflightCompcardDaily,
  readApprovedCompcardAsset, readCompcardDestinations, readCompcardModels, runCompcardDaily, sendApprovedCompcard,
} from "./src/compcard-daily.js";
import { COMPCARD_JOURNAL_ROOT } from "./src/compcard-journal.js";
import { APPROVED_COMPCARD_MANIFEST } from "./src/compcard-approved-manifest.js";

const at = (date, time) => Date.parse(`${date}T${time}:00+07:00`);
const ROOM_IDS = { premium: "-1001668261779", standard: "-1002073919780", preview: "-1002393788585" };
const BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const HASH = await compcardSha256(BYTES);
const CARD = { id: "approved-file-0001", file_id: "approved-file-0001", model_id: "recExample0001", canonical_name: "Example", display_name: "Example", category: "exclusive",
  content_type: "image/png", bytes: BYTES.length, sha256: HASH, height_cm: 180, weight_kg: 72, caption_stats_allowed: true };
function recordFor(card) {
  return { id: card.model_id, fields: { working_name: card.canonical_name, status: "Active", sales_layer: ["travel", "extreme"].includes(card.category) ? "public" : "private",
    private_tier: card.category === "exclusive" ? "Exclusive Models" : card.category, "MMD Public Category": card.category === "travel" ? "Travel" : "Extreme" } };
}
function memoryBucket() {
  const records = new Map();
  let version = 0;
  return {
    records,
    async get(key) {
      const object = records.get(key);
      return object ? { etag: object.etag, text: async () => object.value } : null;
    },
    async put(key, value, options = {}) {
      const old = records.get(key);
      if (options.onlyIf?.etagDoesNotMatch === "*" && old) return null;
      if (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== old?.etag) return null;
      const object = { etag: `version-${++version}`, value: String(value) };
      records.set(key, object);
      return { etag: object.etag };
    },
    read(key) { const value = records.get(`${COMPCARD_JOURNAL_ROOT}${key}`); return value ? JSON.parse(value.value) : null; },
  };
}
function fixture({ cards = [CARD], promotions = [], send } = {}) {
  const bucket = memoryBucket();
  const sends = [];
  const models = cards.map(recordFor);
  const manifest = { schema: "hype_compcards_v1", revision: "approved-v1", source_folder_id: "approved-folder-001", destinations: ROOM_IDS, cards, promotions };
  const env = { HYPE_COMPCARD_ENABLED: "true", HYPE_PROMOTION_ENABLED: "true", EVENTS_WORKER_BUILD_SHA: "test-source" };
  const deps = {
    bucket, manifest,
    destinations: async () => Object.entries(ROOM_IDS).map(([destination, chat_id]) => ({ destination, chat_id, title: `MMD ${destination}`, chat_type: "channel", ok: true, identity_verified: true, can_send_photo: true })),
    models: async () => models,
    model: async (id) => models.find((row) => row.id === id),
    asset: async (card) => ({ bytes: BYTES, content_type: card.content_type, sha256: card.sha256 }),
    send: async (card, destination, caption, asset, expectedChatId) => {
      sends.push({ card, destination, caption, asset, expectedChatId });
      return send ? send(card, destination, caption, asset, expectedChatId, sends.length) : {
        ok: true, delivery_state: "sent", destination, chat_id: expectedChatId, message_id: sends.length, approved_sha256: card.sha256,
      };
    },
  };
  return { bucket, sends, models, manifest, env, deps };
}
const run = (f, date = "2026-10-18", time = "16:30", options = {}) => runCompcardDaily(f.env, { now: at(date, time), deps: f.deps, ...options });

test("default network readers preserve the native fetch receiver and never auto-follow credentials", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async function (input, init) {
    assert.equal(this, globalThis, "native fetch receiver must remain the runtime global");
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push(url.hostname);
    assert.equal(input instanceof Request ? input.redirect : init.redirect, "manual");
    if (url.hostname === "api.airtable.com") return Response.json({ records: [recordFor(CARD)] });
    if (url.hostname === "drive.google.com") return new Response(BYTES, { headers: { "content-type": CARD.content_type } });
    return Response.json({ destinations: [{ destination: "premium", chat_id: ROOM_IDS.premium, ok: true }] });
  };
  try {
    const rows = await readCompcardModels({ AIRTABLE_BASE_ID: "appExample", AIRTABLE_TABLE_MODELS: "tblExample", AIRTABLE_API_KEY: "test-only" });
    assert.equal(rows[0].id, CARD.model_id);
    assert.equal((await readApprovedCompcardAsset(CARD)).sha256, HASH);
    const rooms = await readCompcardDestinations({ AUTH_SERVICE_EVENTS_TO_TELEGRAM: "test-only" });
    assert.equal(rooms[0].chat_id, ROOM_IDS.premium);
    assert.deepEqual(calls, ["api.airtable.com", "drive.google.com", "telegram-worker.malemodel-bkk.workers.dev"]);
  } finally { globalThis.fetch = original; }
});

test("credential-bearing reads reject redirects even when the body looks valid", async () => {
  let airtableCalls = 0;
  await assert.rejects(readCompcardModels({ AIRTABLE_BASE_ID: "appExample", AIRTABLE_TABLE_MODELS: "tblExample", AIRTABLE_API_KEY: "test-only" }, async (_url, init) => {
    airtableCalls += 1;
    assert.equal(init.redirect, "manual");
    return Response.json({ records: [recordFor(CARD)] }, { status: 302, headers: { location: "https://unapproved.example/collect" } });
  }), /compcard_models_read_failed/);
  let serviceCalls = 0;
  const binding = { async fetch(request) {
    serviceCalls += 1;
    assert.equal(this, binding, "service fetch must retain its binding receiver");
    assert.equal(request.redirect, "manual");
    return Response.json({ destinations: [{ destination: "premium", chat_id: ROOM_IDS.premium, ok: true }] }, { status: 302, headers: { location: "https://unapproved.example/collect" } });
  } };
  await assert.rejects(readCompcardDestinations({ AUTH_SERVICE_EVENTS_TO_TELEGRAM: "test-only", TELEGRAM_ROUTER: binding }), /compcard_destinations_unavailable/);
  assert.equal(airtableCalls, 1);
  assert.equal(serviceCalls, 1);
});

test("runtime readiness classifies failures without persisting raw exception details", async () => {
  const f = fixture();
  f.deps.destinations = async () => { throw new TypeError("Illegal invocation: sensitive-detail"); };
  f.deps.models = async () => { throw new Error("Request redirect mode not implemented: sensitive-detail"); };
  await run(f, "2026-10-18", "16:15");
  const snapshot = f.bucket.read("readiness/latest.json");
  assert.ok(snapshot.result.errors.includes("compcard_runtime_receiver_invalid"));
  assert.ok(snapshot.result.errors.includes("compcard_runtime_redirect_unsupported"));
  assert.doesNotMatch(JSON.stringify(snapshot), /sensitive-detail/);
  assert.equal(f.sends.length, 0);
});

test("a service redirect after a send remains uncertain and is not followed", async () => {
  let calls = 0;
  const result = await sendApprovedCompcard({ AUTH_SERVICE_EVENTS_TO_TELEGRAM: "test-only" }, CARD, "premium", "Approved caption", { bytes: BYTES }, async request => {
    calls += 1;
    assert.equal(request.method, "POST");
    assert.equal(request.redirect, "manual");
    return Response.json({ delivery_state: "sent", destination: "premium", chat_id: ROOM_IDS.premium, approved_sha256: CARD.sha256, message_id: 123 }, { status: 302, headers: { location: "https://unapproved.example/collect" } });
  }, ROOM_IDS.premium);
  assert.equal(result.delivery_state, "delivery_uncertain");
  assert.equal(result.message_id, undefined);
  assert.equal(calls, 1);
});

test("Bangkok calendar boundary and explicit default publishing times", () => {
  assert.deepEqual(compcardClock(Date.parse("2026-10-17T17:00:00Z")), { date: "2026-10-18", minutes: 0, time: "00:00" });
  assert.equal(compcardSchedule({}).model, "16:30");
  assert.equal(compcardSchedule({}).promotion, "20:00");
  assert.throws(() => compcardSchedule({ HYPE_COMPCARD_SEND_AT_ICT: "25:00" }), /schedule_invalid/);
});

test("disabled feature does not read data, write state or send", async () => {
  const f = fixture();
  f.env.HYPE_COMPCARD_ENABLED = "false";
  f.deps.models = async () => { throw new Error("must not run"); };
  assert.equal((await run(f)).status, "disabled");
  assert.equal(f.bucket.records.size, 0);
  assert.equal(f.sends.length, 0);
});

test("before 16:30 only readiness is recorded; it does not reserve a daily plan", async () => {
  const f = fixture();
  assert.equal((await run(f, "2026-10-18", "16:29")).status, "not_due");
  assert.equal(f.sends.length, 0);
  assert.equal(f.bucket.read("readiness/latest.json").result.ready, true);
  assert.equal(f.bucket.read("plans/2026-10-18/model.json"), null);
});

for (const [category, expected] of [["exclusive", ["premium", "preview"]], ["premium", ["premium"]], ["standard", ["premium", "standard"]], ["travel", ["preview"]], ["extreme", ["preview"]]]) {
  test(`${category} sends only the user-approved room combination`, async () => {
    const f = fixture({ cards: [{ ...CARD, category }] });
    const result = await run(f);
    assert.equal(result.results[0].status, "sent");
    assert.deepEqual(f.sends.map((row) => row.destination), expected);
    for (const row of f.sends) assert.equal(row.expectedChatId, ROOM_IDS[row.destination]);
    if (category === "exclusive") {
      assert.match(f.sends[0].caption, /180 \/ 72/);
      assert.doesNotMatch(f.sends[1].caption, /180|72/);
    }
  });
}

test("duplicate and concurrent cron ticks send one card once per destination", async () => {
  const f = fixture();
  await Promise.all([run(f), run(f)]);
  await run(f, "2026-10-18", "16:45");
  assert.deepEqual(f.sends.map((row) => row.destination).sort(), ["premium", "preview"]);
  assert.equal(f.bucket.read("deliveries/2026-10-18/model/premium.json").status, "sent");
});

test("a repeated tick rebuilds a readable summary from durable receipts without sending again", async () => {
  const f = fixture();
  const first = await run(f);
  assert.equal(f.sends.length, 2);
  const protectedKeys = [
    "plans/2026-10-18/model.json", `history/${CARD.model_id}.json`,
    "deliveries/2026-10-18/model/premium.json", "deliveries/2026-10-18/model/preview.json",
  ];
  const durable = new Map(protectedKeys.map(key => [key, f.bucket.records.get(`${COMPCARD_JOURNAL_ROOT}${key}`)]));
  // Model an existing unwrapped report written before the snapshot envelope.
  await f.bucket.put(`${COMPCARD_JOURNAL_ROOT}summaries/2026-10-18/model.json`, JSON.stringify(first.results[0]));
  const repeated = await run(f, "2026-10-18", "16:45");
  const snapshot = f.bucket.read("summaries/2026-10-18/model.json");
  assert.deepEqual(snapshot, { schema: "hype_compcard_snapshot_v1", success: true, result: repeated.results[0] });
  assert.equal(snapshot.result.status, "sent");
  assert.equal(snapshot.result.sent, 2);
  assert.equal(f.sends.length, 2);
  for (const outcome of snapshot.result.outcomes) {
    const record = f.bucket.read(`deliveries/2026-10-18/model/${outcome.destination}.json`);
    assert.equal(outcome.duplicate, true);
    assert.deepEqual(outcome.receipt, record.receipt);
    assert.equal(outcome.receipt.chat_id, ROOM_IDS[outcome.destination]);
    assert.equal(outcome.receipt.message_id, first.results[0].outcomes.find(row => row.destination === outcome.destination).receipt.message_id);
    assert.equal(outcome.receipt.approved_sha256, CARD.sha256);
  }
  for (const [key, original] of durable) assert.deepEqual(f.bucket.records.get(`${COMPCARD_JOURNAL_ROOT}${key}`), original);
});

test("known failure retries the unfinished room; refreshed readiness reuses the frozen plan", async () => {
  let previewTries = 0;
  const f = fixture({ send: (card, destination, caption, asset, chat, n) => {
    if (destination === "preview" && ++previewTries === 1) return { delivery_state: "not_sent", error: "compcard_mock_rejected" };
    return { ok: true, delivery_state: "sent", destination, chat_id: chat, message_id: n, approved_sha256: card.sha256 };
  } });
  await run(f);
  await run(f, "2026-10-18", "17:00");
  assert.deepEqual(f.sends.map((row) => row.destination), ["premium", "preview", "preview"]);
  assert.equal(f.bucket.read("summaries/2026-10-18/model.json").result.status, "sent");
});

test("uncertain delivery never automatically retries that room while its sibling completes", async () => {
  const f = fixture({ send: (card, destination, caption, asset, chat, n) => destination === "premium"
    ? { delivery_state: "delivery_uncertain", error: "compcard_timeout" }
    : { ok: true, delivery_state: "sent", destination, chat_id: chat, message_id: n, approved_sha256: card.sha256 } });
  await run(f);
  await run(f, "2026-10-18", "17:00");
  assert.deepEqual(f.sends.map((row) => row.destination), ["premium", "preview"]);
  assert.equal(f.bucket.read("summaries/2026-10-18/model.json").result.status, "delivery_uncertain");
});

test("fresh category or visibility changes stop a planned card before Telegram", async () => {
  for (const changed of [{ private_tier: "Standard" }, { catalog_visibility: "hidden" }, { registry_record_type: "Test/Fixture" }]) {
    const f = fixture();
    f.deps.model = async () => ({ ...f.models[0], fields: { ...f.models[0].fields, ...changed } });
    await run(f);
    assert.equal(f.sends.length, 0);
    assert.equal(f.bucket.read("deliveries/2026-10-18/model/premium.json").status, "blocked");
  }
});

test("live measurement conflict is omitted from caption without changing a model record", async () => {
  const f = fixture();
  f.models[0].fields.weight_kg = 75;
  await run(f);
  assert.doesNotMatch(f.sends[0].caption, /180 \/ 72/);
  assert.equal(f.models[0].fields.weight_kg, 75);
});

test("a changed destination binding cannot replace the approved room", async () => {
  const f = fixture();
  const original = f.deps.destinations;
  f.deps.destinations = async () => (await original()).map((row) => row.destination === "premium" ? { ...row, chat_id: "-1009999999999" } : row);
  assert.equal((await run(f)).status, "not_ready");
  assert.equal(f.sends.length, 0);
});

test("an unrelated Preview outage does not stop a Premium-only card", async () => {
  const f = fixture({ cards: [{ ...CARD, category: "premium" }] });
  const original = f.deps.destinations;
  f.deps.destinations = async () => (await original()).map((row) => row.destination === "preview" ? { ...row, ok: false, can_send_photo: false } : row);
  assert.equal((await run(f)).results[0].status, "sent");
  assert.deepEqual(f.sends.map((row) => row.destination), ["premium"]);
  assert.equal(f.bucket.read("readiness/latest.json").result.all_destinations_ready, false);
});

test("a changed frozen plan is held before retrying any destination", async () => {
  const f = fixture({ send: () => ({ delivery_state: "not_sent", error: "compcard_mock_rejected" }) });
  await run(f);
  const key = `${COMPCARD_JOURNAL_ROOT}plans/2026-10-18/model.json`;
  const original = f.bucket.records.get(key);
  const altered = JSON.parse(original.value);
  altered.captions.premium = "Unapproved replacement";
  f.bucket.records.set(key, { ...original, value: JSON.stringify(altered) });
  const result = await run(f, "2026-10-18", "16:45");
  assert.equal(result.results[0].error, "compcard_plan_integrity_failed");
  assert.equal(f.sends.length, 2);
});

test("a model made inactive during the source read is held before sending", async () => {
  const f = fixture();
  let reads = 0;
  f.deps.asset = async () => {
    if (++reads > 1) f.models[0].fields.status = "Inactive";
    return { bytes: BYTES, sha256: CARD.sha256 };
  };
  await run(f);
  assert.equal(f.sends.length, 0);
  assert.equal(f.bucket.read("deliveries/2026-10-18/model/premium.json").status, "blocked");
});

test("end-of-window and after-midnight invocations never catch up an old plan", async () => {
  const f = fixture();
  await run(f, "2026-10-18", "18:00");
  await run(f, "2026-10-19", "00:01");
  assert.equal(f.sends.length, 0);
});

test("a source read that crosses the publishing window does not send late", async () => {
  const f = fixture();
  let wall = at("2026-10-18", "17:59");
  let assetReads = 0;
  f.deps.asset = async () => { if (++assetReads > 1) wall = at("2026-10-18", "18:01"); return { bytes: BYTES, sha256: CARD.sha256 }; };
  await run(f, "2026-10-18", "17:59", { wallClock: () => wall });
  assert.equal(f.sends.length, 0);
});

test("no approved Promotion asset records an explicit hold and sends nothing", async () => {
  const f = fixture();
  const result = await run(f, "2026-10-18", "20:00");
  assert.equal(result.results[0].status, "no_approved_promotion");
  assert.equal(result.results[0].destination, "premium");
  assert.equal(f.sends.length, 0);
});

test("approved active promotions rotate rooms and expire without inventing a replacement", async () => {
  const promo = { ...CARD, id: "promotion-art-001", model_id: undefined, category: "promotion", approved: true,
    status: "active", availability_mode: "bounded",
    captions: { premium: "Approved Premium promotion", standard: "Approved Standard promotion", preview: "Approved public teaser" },
    valid_from: "2026-10-18T00:00:00+07:00", valid_to: "2026-10-21T00:00:00+07:00" };
  const f = fixture({ promotions: [promo] });
  await run(f, "2026-10-18", "20:00");
  await run(f, "2026-10-19", "20:00");
  await run(f, "2026-10-20", "20:00");
  await run(f, "2026-10-21", "20:00");
  assert.deepEqual(f.sends.map((row) => row.destination), ["premium", "standard", "preview"]);
});

test("approved text promotion can run while model data is unavailable and never reads an image", async () => {
  const promotion = APPROVED_COMPCARD_MANIFEST.promotions[0];
  const f = fixture({ cards: [], promotions: [promotion] });
  f.deps.models = async () => { throw new Error("compcard_models_read_failed"); };
  f.deps.asset = async () => { throw new Error("must not read a text promotion as an image"); };
  const result = await run(f, "2026-10-18", "20:00");
  await run(f, "2026-10-18", "20:15");
  assert.equal(result.results[0].status, "sent");
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].card.kind, "text");
  assert.equal(f.sends[0].caption, promotion.captions.premium);
  assert.equal(f.sends[0].asset.sha256, await compcardSha256(new TextEncoder().encode(promotion.captions.premium)));
  assert.equal(f.bucket.read("readiness/latest.json").result.model_ready, false);
  assert.equal(f.bucket.read("readiness/latest.json").result.promotion_ready, true);
});

test("CARE BACK text stops after 31 October while model cards continue", async () => {
  const f = fixture({ promotions: APPROVED_COMPCARD_MANIFEST.promotions });
  await run(f, "2026-10-31", "20:00");
  const continued = await run(f, "2026-11-01", "20:00");
  assert.equal(continued.results[0].status, "sent");
  assert.equal(continued.results[0].card_id, "double-moment-continues-2026-telegram");
  assert.equal(f.sends.length, 2);
  await run(f, "2026-11-02", "16:30");
  assert.equal(f.sends.length, 4);
});

test("a known-down promotion room preserves its attempts until readiness recovers", async () => {
  const f = fixture({ promotions: APPROVED_COMPCARD_MANIFEST.promotions });
  const original = f.deps.destinations;
  let recovered = false;
  f.deps.destinations = async () => (await original()).map((row) => row.destination === "premium" && !recovered ? { ...row, ok: false, can_send_photo: false } : row);
  for (const time of ["20:00", "20:15", "20:30"]) assert.equal((await run(f, "2026-10-18", time)).results[0].status, "not_ready");
  assert.equal(f.sends.length, 0);
  assert.equal(f.bucket.read("deliveries/2026-10-18/promotion/premium.json"), null);
  recovered = true;
  assert.equal((await run(f, "2026-10-18", "21:00")).results[0].status, "sent");
  assert.equal(f.sends.length, 1);
});

test("a promotion that expires during preparation cannot send even inside its daily slot", async () => {
  const promo = { ...CARD, id: "promotion-art-001", approved: true, status: "active", availability_mode: "bounded",
    captions: { premium: "Approved promotion" }, valid_from: "2026-10-18T00:00:00+07:00", valid_to: "2026-10-18T20:01:00+07:00" };
  const f = fixture({ cards: [], promotions: [promo] });
  let wall = at("2026-10-18", "20:00");
  let reads = 0;
  f.deps.asset = async () => { if (++reads > 1) wall = at("2026-10-18", "20:02"); return { bytes: BYTES, sha256: CARD.sha256 }; };
  await run(f, "2026-10-18", "20:00", { wallClock: () => wall });
  assert.equal(f.sends.length, 0);
  assert.equal(f.bucket.read("deliveries/2026-10-18/promotion/premium.json").status, "blocked");
});

test("explicit continuous promotion remains available after the CARE BACK cutoff and rotates rooms", async () => {
  const double = APPROVED_COMPCARD_MANIFEST.promotions.find((item) => item.id === "double-moment-continues-2026-telegram");
  const f = fixture({ cards: [], promotions: [double] });
  for (const date of ["2026-11-01", "2027-01-01", "2036-01-01"]) await run(f, date, "20:00");
  assert.deepEqual(f.sends.map((row) => row.destination), ["preview", "premium", "preview"]);
  for (const row of f.sends) {
    assert.equal(row.card.financial_campaign_id, "promo_double_moment_sep2026");
    assert.equal(row.asset.sha256, double.sha256);
    assert.equal(row.asset.sha256, await compcardSha256(new TextEncoder().encode(row.caption)));
  }
});

test("two active campaigns alternate deterministically and Double continues after CARE BACK", async () => {
  const f = fixture({ cards: [], promotions: APPROVED_COMPCARD_MANIFEST.promotions });
  const selected = [];
  for (const date of ["2026-10-18", "2026-10-19", "2026-10-20", "2026-11-01", "2026-11-02"]) {
    const result = await run(f, date, "20:00");
    selected.push(result.results[0].card_id);
  }
  assert.deepEqual(selected, [
    "care-back-continues-2026-telegram",
    "double-moment-continues-2026-telegram",
    "care-back-continues-2026-telegram",
    "double-moment-continues-2026-telegram",
    "double-moment-continues-2026-telegram",
  ]);
  assert.deepEqual(f.sends.map((row) => row.destination), ["premium", "standard", "preview", "preview", "premium"]);
});

test("missing, malformed, paused, revoked and before-start promotion windows fail closed", async () => {
  const base = { ...CARD, id: "promotion-art-001", model_id: undefined, category: "promotion", approved: true,
    status: "active", availability_mode: "bounded", captions: { premium: "Approved" }, valid_from: "2026-10-18T00:00:00+07:00",
    valid_to: "2026-10-21T00:00:00+07:00" };
  const invalid = [
    { ...base, valid_to: undefined }, { ...base, valid_to: "not-a-date" },
    { ...base, status: "paused" }, { ...base, status: "revoked" }, { ...base, paused: true }, { ...base, revoked: true },
    { ...base, availability_mode: "continuous", valid_to: undefined },
  ];
  for (const promotion of invalid) {
    const f = fixture({ cards: [], promotions: [promotion] });
    const result = await run(f, "2026-10-18", "20:00");
    assert.ok(result.status === "not_ready" || result.results?.[0]?.status === "no_approved_promotion");
    assert.equal(f.sends.length, 0);
  }
  const future = fixture({ cards: [], promotions: [{ ...base, valid_from: "2026-10-19T00:00:00+07:00" }] });
  const beforeStart = await run(future, "2026-10-18", "20:00");
  assert.ok(beforeStart.status === "not_ready" || beforeStart.results?.[0]?.status === "no_approved_promotion");
});

test("manifest revision changes preserve an unchanged frozen promotion plan and receipts", async () => {
  const promo = { ...CARD, id: "promotion-art-001", model_id: undefined, category: "promotion", approved: true,
    status: "active", availability_mode: "bounded", captions: { premium: "Approved promotion" },
    valid_from: "2026-10-18T00:00:00+07:00", valid_to: "2026-10-21T00:00:00+07:00" };
  const f = fixture({ cards: [], promotions: [promo], send: (card, destination, _caption, _asset, chat, attempt) => attempt === 1
    ? { delivery_state: "not_sent", error: "compcard_mock_rejected" }
    : { ok: true, delivery_state: "sent", destination, chat_id: chat, message_id: attempt, approved_sha256: card.sha256 } });
  await run(f, "2026-10-18", "20:00");
  const key = `${COMPCARD_JOURNAL_ROOT}plans/2026-10-18/promotion.json`;
  const original = f.bucket.records.get(key);
  const digest = JSON.parse(original.value).digest;
  f.manifest.revision = "approved-v2-with-another-campaign";
  f.manifest.promotions.push({ ...APPROVED_COMPCARD_MANIFEST.promotions.find((item) => item.id === "double-moment-continues-2026-telegram") });
  await run(f, "2026-10-18", "20:15");
  assert.equal(f.sends.length, 2);
  assert.equal(f.sends[1].card.id, promo.id);
  assert.equal(JSON.parse(f.bucket.records.get(key).value).digest, digest);
  assert.equal(f.bucket.read("deliveries/2026-10-18/promotion/premium.json").status, "sent");
});

test("revoking an approved frozen promotion blocks the unfinished delivery", async () => {
  const promo = { ...CARD, id: "promotion-art-001", model_id: undefined, category: "promotion", approved: true,
    status: "active", availability_mode: "bounded", captions: { premium: "Approved promotion" },
    valid_from: "2026-10-18T00:00:00+07:00", valid_to: "2026-10-21T00:00:00+07:00" };
  const f = fixture({ cards: [], promotions: [promo], send: () => ({ delivery_state: "not_sent", error: "compcard_mock_rejected" }) });
  await run(f, "2026-10-18", "20:00");
  f.manifest.promotions[0] = { ...promo, status: "revoked" };
  const blocked = await run(f, "2026-10-18", "20:15");
  assert.equal(blocked.results[0].outcomes[0].status, "blocked");
  assert.equal(f.sends.length, 1);
});

test("preflight reports safe machine codes without leaking arbitrary fetch errors", async () => {
  const f = fixture();
  f.deps.destinations = async () => { throw new Error("https://api.example/botSUPER_SECRET_TOKEN/getMe"); };
  const result = await preflightCompcardDaily(f.env, { now: at("2026-10-18", "01:00"), deps: f.deps });
  assert.equal(result.ready, false);
  assert.doesNotMatch(JSON.stringify(result), /SUPER_SECRET|api\.example/);
  const stored = f.bucket.read("readiness/latest.json");
  assert.equal(stored.success, true);
  assert.equal(stored.errors, undefined);
  assert.deepEqual(stored.result, result);
  f.deps.destinations = async () => { throw new Error("must not refresh the cached report"); };
  const cached = await preflightCompcardDaily(f.env, { now: at("2026-10-18", "01:15"), deps: f.deps });
  assert.deepEqual(cached, result);
});

test("source bytes must match the approved original; HTML, changed image and unsafe redirects are held", async () => {
  const original = () => new Response(BYTES, { headers: { "content-type": "image/png" } });
  assert.equal((await readApprovedCompcardAsset(CARD, async () => original())).sha256, HASH);
  await assert.rejects(readApprovedCompcardAsset(CARD, async () => new Response("signin", { headers: { "content-type": "text/html" } })), /not_original_image/);
  const changed = new Uint8Array(BYTES); changed[0] = 1;
  await assert.rejects(readApprovedCompcardAsset(CARD, async () => new Response(changed, { headers: { "content-type": "image/png" } })), /source_changed/);
  await assert.rejects(readApprovedCompcardAsset(CARD, async () => new Response(null, { status: 302, headers: { location: "https://attacker.invalid/private" } })), /redirect_invalid/);
});

test("model list reads include all publication blockers and never write Airtable", async () => {
  const calls = [];
  const rows = await readCompcardModels({ AIRTABLE_BASE_ID: "appVerified", AIRTABLE_TABLE_MODELS: "tblVerified", AIRTABLE_API_KEY: "test-token" }, async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json({ records: [recordFor(CARD)] });
  });
  assert.equal(rows.length, 1);
  assert.equal(calls[0].options.method, undefined);
  assert.ok(calls[0].url.searchParams.getAll("fields[]").includes("registry_record_type"));
  assert.ok(calls[0].url.searchParams.getAll("fields[]").includes("approved_client_visibility"));
  assert.ok(!calls[0].url.searchParams.getAll("fields[]").includes("line_user_id"));
});

test("sender pins alias, hash and expected chat and treats mismatched receipt as uncertain", async () => {
  let body;
  const send = async (request) => {
    body = await request.formData();
    return Response.json({ ok: true, delivery_state: "sent", destination: "premium", chat_id: "-1009999999999", approved_sha256: HASH, message_id: 1 });
  };
  const outcome = await sendApprovedCompcard({ AUTH_SERVICE_EVENTS_TO_TELEGRAM: "test-only" }, CARD, "premium", "Approved caption", { bytes: BYTES }, send, ROOM_IDS.premium);
  assert.equal(body.get("expected_chat_id"), ROOM_IDS.premium);
  assert.equal(body.get("approved_sha256"), HASH);
  assert.equal(body.get("destination"), "premium");
  assert.equal(outcome.delivery_state, "delivery_uncertain");
});

test("text sender uses the dedicated endpoint with exact approved copy and pinned receipt", async () => {
  const promotion = APPROVED_COMPCARD_MANIFEST.promotions[0];
  let requestBody;
  const outcome = await sendApprovedCompcard({ AUTH_SERVICE_EVENTS_TO_TELEGRAM: "test-only" }, promotion, "premium", promotion.captions.premium, { kind: "text" }, async (request) => {
    assert.equal(new URL(request.url).pathname, "/telegram/internal/compcard/text");
    assert.equal(request.headers.get("content-type"), "application/json");
    requestBody = await request.json();
    return Response.json({ ok: true, delivery_state: "sent", destination: "premium", chat_id: ROOM_IDS.premium, approved_sha256: promotion.sha256, message_id: 1 });
  }, ROOM_IDS.premium);
  assert.deepEqual(requestBody, { destination: "premium", expected_chat_id: ROOM_IDS.premium, text: promotion.captions.premium, approved_sha256: promotion.sha256 });
  assert.equal(outcome.delivery_state, "sent");
});



test("legacy frozen model captions stay frozen and unsent copies fail closed after the wording update", async () => {
  const f = fixture({ send: () => ({ delivery_state: "not_sent", error: "compcard_mock_rejected" }) });
  await run(f);
  const key = `${COMPCARD_JOURNAL_ROOT}plans/2026-10-18/model.json`;
  const object = f.bucket.records.get(key);
  const { digest, ...legacy } = JSON.parse(object.value);
  for (const destination of legacy.destinations) {
    legacy.captions[destination] = legacy.captions[destination].replace('สอบถามคิวและรายละเอียดได้ที่ MMD', 'สอบถามคิวและรายละเอียดกับทีม MMD');
  }
  legacy.digest = await compcardSha256(new TextEncoder().encode(JSON.stringify(legacy)));
  const frozen = JSON.stringify(legacy);
  f.bucket.records.set(key, { ...object, value: frozen });
  const before = f.sends.length;
  const result = await run(f, "2026-10-18", "16:45");
  assert.equal(f.sends.length, before);
  assert.ok(result.results[0].outcomes.every(row => row.status === 'blocked'));
  assert.equal(f.bucket.records.get(key).value, frozen);
});
