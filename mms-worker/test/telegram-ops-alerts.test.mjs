import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMmsOpsAlert,
  formatMmsOpsAlert,
  mmsTelegramTopic,
  mmsTelegramTopicRegistry,
} from "../src/telegram-ops-alerts.mjs";

function post(path) {
  return new Request(`https://mms.internal${path}`, { method: "POST" });
}

test("MMS Telegram topics are explicit and never guessed", () => {
  assert.equal(mmsTelegramTopic({}, "booking"), 0);
  assert.equal(mmsTelegramTopic({ MMS_TG_THREAD_BOOKING: "1401" }, "booking"), 1401);
  assert.equal(mmsTelegramTopic({ MMS_TG_THREAD_DISPATCH: "1402" }, "dispatch"), 1402);
  assert.equal(mmsTelegramTopic({ MMS_TG_THREAD_ALERTS: "1403" }, "alerts"), 1403);
  assert.deepEqual(
    mmsTelegramTopicRegistry({ MMS_TG_THREAD_APPLICATIONS: "1400" }).map(({ key, thread_id }) => [key, thread_id]),
    [
      ["applications", 1400],
      ["booking", 0],
      ["dispatch", 0],
      ["alerts", 0],
    ],
  );
});

test("new prebooking routes to MMS booking without private customer metadata", () => {
  const event = classifyMmsOpsAlert(post("/mms/api/prebookings"), {
    ok: true,
    prebooking: { prebooking_id: "mmspre_1234567890abcdef12345678", status: "Options Ready" },
    dispatch: { state: "OFFERED", job_id: "mmsjob_1234567890abcdef12345678", offered_count: 3 },
    service_zone: { code: "BKK-CENTRAL", safe_label_th: "กรุงเทพฯ โซนกลาง" },
    line_user_id: "U-private",
    exact_address: "private address",
  }, 201);

  assert.equal(event.flow, "booking");
  assert.equal(event.event, "prebooking_received");
  assert.equal(event.offered_count, 3);
  const message = formatMmsOpsAlert(event);
  assert.match(message, /MMS • BOOKING/);
  assert.match(message, /mmspre_1234567890abcdef12345678/);
  assert.doesNotMatch(message, /U-private/);
  assert.doesNotMatch(message, /private address/);
});

test("dispatch lifecycle emits only meaningful operational state changes", () => {
  const accepted = classifyMmsOpsAlert(post("/male-massage/therapists/api/app/offers/mmsjob_1234567890abcdef12345678/accept"), {
    ok: true,
    data: { jobId: "mmsjob_1234567890abcdef12345678", state: "ACCEPTED" },
  }, 200);
  assert.equal(accepted.event, "therapist_accepted");

  const started = classifyMmsOpsAlert(post("/male-massage/therapists/api/app/jobs/mmsjob_1234567890abcdef12345678/start"), {
    ok: true,
    data: { state: "IN_PROGRESS" },
  }, 200);
  assert.equal(started.event, "service_started");

  const completed = classifyMmsOpsAlert(post("/male-massage/therapists/api/app/jobs/mmsjob_1234567890abcdef12345678/complete"), {
    ok: true,
    data: { state: "COMPLETED" },
  }, 200);
  assert.equal(completed.event, "service_completed");

  const declined = classifyMmsOpsAlert(post("/male-massage/therapists/api/app/offers/mmsjob_1234567890abcdef12345678/decline"), {
    ok: true,
    data: { state: "DECLINED" },
  }, 200);
  assert.equal(declined, null);
});

test("manual coordination and no-therapist states route to MMS alerts", () => {
  const event = classifyMmsOpsAlert(post("/mms/api/prebookings"), {
    ok: true,
    prebooking: { prebooking_id: "mmspre_1234567890abcdef12345678" },
    dispatch: { state: "PENDING_COORDINATION", code: "NO_AVAILABLE_APPROVED_THERAPIST" },
  }, 201);
  assert.equal(event.flow, "alerts");
  assert.equal(event.event, "booking_needs_coordination");
  assert.equal(event.code, "NO_AVAILABLE_APPROVED_THERAPIST");
});

test("duplicate prebookings do not create duplicate Telegram alerts", () => {
  const event = classifyMmsOpsAlert(post("/mms/api/prebookings"), {
    ok: true,
    duplicate: true,
    prebooking: { prebooking_id: "mmspre_1234567890abcdef12345678" },
  }, 200);
  assert.equal(event, null);
});
