const assert = require("node:assert/strict");
const test = require("node:test");

const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.endsWith("dry-run-import.js")) return { AirtableClient: class {} };
  if (request.endsWith("history-materializer.js")) return { HISTORY_REVIEWS_TABLE: "reviews", defaultHistoryReviewId: () => "id", materializeHistoricalRecord: async () => ({}) };
  if (request.endsWith("historical-note-parser.js")) return {
    normalizeClock(value) { const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/); if (!match) return ""; const h = Number(match[1]); const m = Number(match[2]); return h < 24 && m < 60 ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}` : ""; },
    durationMinutes(a,b) { if (!a || !b) return 0; const [ah,am]=a.split(":").map(Number); const [bh,bm]=b.split(":").map(Number); return (bh*60+bm)-(ah*60+am); },
  };
  if (request.endsWith("model-identity-resolver.js")) return { resolveModelLabelsFromAirtable: async () => ({ status: "missing", model_ids: [] }) };
  return originalLoad(request, parent, isMain);
};
const { approvedSessionDetail } = require("./history-materializer-v2.js");
Module._load = originalLoad;

test("approved session detail maps reviewer-approved fields only", () => {
  const detail = approvedSessionDetail({
    approved_model_text: "EMs22 Whisp",
    approved_start_time: "16:30",
    approved_end_time: "18:00",
    approved_location_text: "The Line Vibe",
    approved_service_type: "PN MK TR",
    approved_service_amount_thb: 27500,
    candidate_model_text: "DO NOT USE CANDIDATE",
  });
  assert.deepEqual(detail, {
    model_name: "EMs22 Whisp",
    "Assigned Model": "EMs22 Whisp",
    start_time: "16:30",
    end_time: "18:00",
    location_name: "The Line Vibe",
    job_type: "PN MK TR",
    session_type_raw: "PN MK TR",
    "Total Amount": 27500,
    amount_thb: 27500,
    duration_hours: 1.5,
  });
});

test("invalid approved times do not create duration", () => {
  const detail = approvedSessionDetail({ approved_start_time: "99:99", approved_end_time: "18:00", approved_location_text: "Bangkok" });
  assert.deepEqual(detail, { end_time: "18:00", location_name: "Bangkok" });
});

test("multiple approved model names remain on one session", () => {
  const detail = approvedSessionDetail({ approved_model_text: "EMs01 A + EMs02 B" });
  assert.equal(detail.model_name, "EMs01 A + EMs02 B");
  assert.equal(detail["Assigned Model"], "EMs01 A + EMs02 B");
  assert.equal(Object.hasOwn(detail, "Canonical Model"), false);
});
