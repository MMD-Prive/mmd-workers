import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeKenjiBookingDraftV1,
  missingKenjiBookingFields,
  parseKenjiBookingFragment,
} from "../src/kenji-line-booking-accumulator.mjs";

const NOW = new Date("2026-09-19T18:00:00+07:00");
const USER_ID = "U0123456789abcdef0123456789abcdef";

function event(id, message) {
  return {
    type: "message",
    mode: "active",
    timestamp: NOW.getTime(),
    source: { type: "user", userId: USER_ID },
    message: { id, type: "text", text: message },
  };
}

function merge(prior, id, message, currentIntent = "unknown") {
  const fragment = parseKenjiBookingFragment(event(id, message), currentIntent, {
    now: NOW,
    priorActive: Boolean(prior?.draft_id),
  });
  return mergeKenjiBookingDraftV1({
    prior,
    fragment,
    conversationHash: "abcdef0123456789abcdef0123456789",
    sourceEventId: id,
    now: NOW,
  });
}

test("Conversation Matrix accumulates model, price, date/time and location across separate LINE messages", () => {
  let state = merge({}, "m1", "จอง EMs16", "mmd_companion");
  assert.equal(state.accepted, true);
  assert.equal(state.draft.model_name, "EMs16");
  assert.deepEqual(state.draft.missing_fields, ["date", "time", "location", "amount_thb"]);
  assert.equal(state.draft.ready, false);

  state = merge(state.draft, "m2", "ราคา 15,000 บาท", "pricing_review");
  assert.equal(state.draft.amount_thb, 15000);
  assert.equal(state.draft.location, undefined);
  assert.equal(state.draft.ready, false);

  state = merge(state.draft, "m3", "วันที่ 20 ก.ย. เวลา 20:00", "unknown");
  assert.equal(state.draft.date, "2026-09-20");
  assert.equal(state.draft.time, "20:00");
  assert.equal(state.draft.location, undefined);
  assert.equal(state.draft.ready, false);

  state = merge(state.draft, "m4", "สุขุมวิท", "unknown");
  assert.equal(state.draft.location, "สุขุมวิท");
  assert.equal(state.draft.ready, true);
  assert.deepEqual(state.draft.missing_fields, []);
  assert.equal(state.draft.action_id.startsWith("matrix:kbd1_"), true);
  assert.deepEqual(state.draft.source_event_ids, ["m1", "m2", "m3", "m4"]);
});

test("real Shane SVIP wording accumulates EMs16 Gohan, 2 Oct 2026, Ever Green 19.00 and PN 25,000 discounted from 30,000", () => {
  let state = merge({}, "s1", "EMs16 Gohan", "unknown");
  assert.equal(state.accepted, true);
  assert.equal(state.draft.model_name, "EMs16");
  assert.equal(state.draft.model_working_name_hint, "Gohan");
  assert.equal(state.draft.ready, false);

  state = merge(state.draft, "s2", "2 ตค 2026", "unknown");
  assert.equal(state.draft.date, "2026-10-02");
  assert.equal(state.draft.ready, false);

  state = merge(state.draft, "s3", "Ever Green 19.00", "unknown");
  assert.equal(state.draft.location, "Ever Green");
  assert.equal(state.draft.time, "19:00");
  assert.equal(state.draft.ready, false);

  state = merge(state.draft, "s4", "PN 25,000 (discount from 30,000)", "pricing_review");
  assert.equal(state.draft.amount_thb, 25000);
  assert.equal(state.draft.original_amount_thb, 30000);
  assert.equal(state.draft.pricing_adjustment, "discount");
  assert.equal(state.draft.ready, true);
  assert.deepEqual(state.draft.missing_fields, []);
});

test("rate is a required action field even though it may arrive before or after schedule fields", () => {
  const draft = {
    model_name: "EMs16",
    date: "2026-09-20",
    time: "20:00",
    location: "สุขุมวิท",
  };
  assert.deepEqual(missingKenjiBookingFields(draft), ["amount_thb"]);
});

test("deposit-triggered draft also requires duration or end time before action", () => {
  const draft = {
    trigger: "deposit",
    model_name: "EMs16",
    date: "2026-09-20",
    time: "20:00",
    location: "สุขุมวิท",
    amount_thb: 15000,
  };
  assert.deepEqual(missingKenjiBookingFields(draft), ["duration_or_end_time"]);
});

test("an actioned Matrix draft is locked against duplicate action unless an explicit new booking materially changes it", () => {
  const prior = {
    schema: "mmd.kenji_booking_accumulator.v1",
    draft_id: "kbd1_existing",
    action_id: "matrix:kbd1_existing",
    status: "actioned",
    action_state: "executed",
    model_name: "EMs16",
    date: "2026-09-20",
    time: "20:00",
    location: "สุขุมวิท",
    amount_thb: 15000,
    updated_at: NOW.toISOString(),
  };

  const same = merge(prior, "m5", "โอเค", "unknown");
  assert.equal(same.locked, true);
  assert.equal(same.draft.draft_id, "kbd1_existing");

  const next = merge(prior, "m6", "จอง EMs16 วันที่ 21 ก.ย. 20:00 ที่ทองหล่อ ราคา 15,000", "mmd_companion");
  assert.equal(next.locked, false);
  assert.notEqual(next.draft.draft_id, "kbd1_existing");
  assert.equal(next.draft.date, "2026-09-21");
});
