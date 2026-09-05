import test from "node:test";
import assert from "node:assert/strict";

import {
  ACK_RECONFIRM_ACTION,
  buildReconfirmSchedule,
  deriveReconfirmStatus,
  isModelReconfirmRequest,
  runModelReconfirmSweep,
  shouldOfferReconfirmAction,
} from "./src/model-reconfirm-runtime.js";

test("D-1 schedule is fixed to Bangkok 16:00 / 18:00 / 19:00", () => {
  assert.deepEqual(buildReconfirmSchedule("2026-09-06"), {
    status: "scheduled",
    required_at: "2026-09-05T16:00:00+07:00",
    reminder_at: "2026-09-05T18:00:00+07:00",
    overdue_at: "2026-09-05T19:00:00+07:00",
    acknowledged_at: null,
    notified_at: null,
    reminder_notified_at: null,
    ops_alerted_at: null,
    followup_status: "none",
    risk_level: "normal",
    backup_required: false,
  });
});

test("calendar subtraction works across month/year boundaries", () => {
  assert.equal(buildReconfirmSchedule("2027-01-01").required_at, "2026-12-31T16:00:00+07:00");
  assert.equal(buildReconfirmSchedule("2028-03-01").required_at, "2028-02-29T16:00:00+07:00");
  assert.equal(buildReconfirmSchedule("not-a-date"), null);
});

test("reconfirm status advances without changing job lifecycle", () => {
  const schedule = buildReconfirmSchedule("2026-09-06");
  assert.equal(deriveReconfirmStatus(schedule, Date.parse("2026-09-05T15:59:59+07:00")), "scheduled");
  assert.equal(deriveReconfirmStatus(schedule, Date.parse("2026-09-05T16:00:00+07:00")), "pending");
  assert.equal(deriveReconfirmStatus(schedule, Date.parse("2026-09-05T19:00:00+07:00")), "overdue");
  assert.equal(deriveReconfirmStatus({ ...schedule, acknowledged_at: "2026-09-05T17:10:00+07:00" }, Date.parse("2026-09-05T20:00:00+07:00")), "acknowledged");
});

test("acknowledge_reconfirm is offered only while canonical lifecycle is confirmed", () => {
  assert.equal(ACK_RECONFIRM_ACTION, "acknowledge_reconfirm");
  assert.equal(shouldOfferReconfirmAction("confirmed", "pending"), true);
  assert.equal(shouldOfferReconfirmAction("accepted", "overdue"), true);
  assert.equal(shouldOfferReconfirmAction("confirmed", "acknowledged"), false);
  assert.equal(shouldOfferReconfirmAction("en_route", "pending"), false);
  assert.equal(shouldOfferReconfirmAction("work_started", "overdue"), false);
});

test("route matcher covers create/current/action only", () => {
  assert.equal(isModelReconfirmRequest("/v1/admin/job/create", "POST"), true);
  assert.equal(isModelReconfirmRequest("/v1/model/session/current", "GET"), true);
  assert.equal(isModelReconfirmRequest("/v1/model/session/action", "POST"), true);
  assert.equal(isModelReconfirmRequest("/v1/model/profile", "GET"), false);
});

test("scheduled sweep is disabled by default and performs no storage/network work", async () => {
  const result = await runModelReconfirmSweep({}, { now: Date.now() });
  assert.deepEqual(result, {
    ok: true,
    enabled: false,
    processed: 0,
    notified: 0,
    reminded: 0,
    escalated: 0,
  });
});
