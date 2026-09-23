import test from "node:test";
import assert from "node:assert/strict";
import { readMmsOwnerActionCoverage } from "./src/mms-admin-runtime.js";

test("MMS Owner Actions separates routine BAU from Pending Coordination exceptions", async () => {
  const env = {
    MMS_WORKER: {
      fetch: async () => Response.json({
        ok: true,
        complete: true,
        applications: [
          { application_id: "mmsapp_a", status: "Submitted" },
          { application_id: "mmsapp_b", status: "Under Review" },
          { application_id: "mmsapp_b", status: "Under Review" },
          { application_id: "mmsapp_done", status: "Approved" },
        ],
        therapists: [],
        prebookings: [
          { prebooking_id: "mmspre_draft", status: "Draft" },
          { prebooking_id: "mmspre_match", status: "Matching" },
          { prebooking_id: "mmspre_ready", status: "Options Ready" },
          { prebooking_id: "mmspre_exception", status: "Pending Coordination" },
          { prebooking_id: "mmspre_exception", status: "Pending Coordination" },
          { prebooking_id: "mmspre_done", status: "Confirmed" },
        ],
      }),
    },
  };

  const coverage = await readMmsOwnerActionCoverage(env);

  assert.equal(coverage.available, true);
  assert.equal(coverage.complete, true);
  assert.equal(coverage.authority, "mms-worker");
  assert.equal(coverage.operating_model, "bau_exception_only_v1");
  assert.equal(coverage.application_review_count, 2);
  assert.equal(coverage.prebooking_coordination_count, 4);
  assert.equal(coverage.routine_application_count, 2);
  assert.equal(coverage.routine_prebooking_count, 3);
  assert.equal(coverage.exception_prebooking_count, 1);
  assert.equal(coverage.exception_count, 1);
});

test("MMS Owner Actions fails closed when snapshot is unavailable", async () => {
  const coverage = await readMmsOwnerActionCoverage({
    MMS_WORKER: {
      fetch: async () => new Response("unavailable", { status: 503 }),
    },
  });

  assert.deepEqual(coverage, { available: false, reason: "mms_snapshot_unavailable" });
});
