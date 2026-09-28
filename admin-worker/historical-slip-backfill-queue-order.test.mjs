import test from "node:test";
import assert from "node:assert/strict";

import { handleHistoricalSlipBackfillRequest } from "./src/historical-slip-backfill-runtime.js";

const SCHEMA = "mmd_historical_slip_backfill_v1";

function record(id, proofId, createdAt) {
  return {
    id,
    createdTime: createdAt,
    fields: {
      proof_id: proofId,
      status: "pending",
      channel: "line_ofc",
      note: JSON.stringify({
        schema: SCHEMA,
        source_type: "line_archive",
        source_ref: proofId,
        review_state: "pending",
        created_at: createdAt,
      }),
    },
  };
}

test("historical owner queue asks Airtable for newest records before maxRecords is applied", async () => {
  const seen = [];
  const env = {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "Payment Proofs",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        seen.push(url);
        assert.equal(request.method, "GET");
        assert.equal(decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1)), "Payment Proofs");
        assert.equal(url.searchParams.get("maxRecords"), "2");
        assert.equal(url.searchParams.get("sort[0][field]"), "created_at");
        assert.equal(url.searchParams.get("sort[0][direction]"), "desc");
        assert.match(url.searchParams.get("filterByFormula") || "", /mmd_historical_slip_backfill_v1/);
        return Response.json({
          records: [
            record("recNewest000000001", "hist_newest", "2026-09-19T15:00:00.000Z"),
            record("recOlder0000000002", "hist_older", "2026-09-18T15:00:00.000Z"),
          ],
        });
      },
    },
  };

  const response = await handleHistoricalSlipBackfillRequest(
    new Request("https://mmdbkk.com/v1/admin/payments/historical-backfill?limit=2"),
    env,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.authority, "payments-worker");
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].proof_id, "hist_newest");
  assert.equal(payload.items[1].proof_id, "hist_older");
  assert.equal(seen.length, 1);
});
