const assert = require("node:assert/strict");
const test = require("node:test");

const { approvedSessionDetail } = require("./history-materializer-v2.js");

test("approved session detail maps reviewer-approved fields only", () => {
  const detail = approvedSessionDetail({
    approved_model_text: "EMs22 Whisp",
    approved_start_time: "16:30",
    approved_end_time: "18:00",
    approved_location_text: "The Line Vibe",
    approved_service_type: "Companion",
    candidate_model_text: "DO NOT USE CANDIDATE",
  });

  assert.deepEqual(detail, {
    model_name: "EMs22 Whisp",
    start_time: "16:30",
    end_time: "18:00",
    location_name: "The Line Vibe",
    job_type: "Companion",
    duration_hours: 1.5,
  });
});

test("invalid approved times do not create duration", () => {
  const detail = approvedSessionDetail({
    approved_start_time: "99:99",
    approved_end_time: "18:00",
    approved_location_text: "Bangkok",
  });
  assert.deepEqual(detail, { end_time: "18:00", location_name: "Bangkok" });
});

test("multiple approved model names remain text on one session", () => {
  const detail = approvedSessionDetail({ approved_model_text: "EMs01 A + EMs02 B" });
  assert.equal(detail.model_name, "EMs01 A + EMs02 B");
  assert.equal(Object.hasOwn(detail, "Canonical Model"), false);
});
