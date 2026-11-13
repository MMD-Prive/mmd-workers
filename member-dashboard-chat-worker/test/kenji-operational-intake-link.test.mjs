import assert from "node:assert/strict";
import test from "node:test";
import { runOperationalTelemetry } from "../src/kenji-line-redelivery-recovery.mjs";

const env = { AIRTABLE_API_KEY: "mock-key", AIRTABLE_BASE_ID: "mock-base", LINE_KENJI_MODEL_ENABLED: "false" };
const matching = { id: "mock-record", fields: { source: "line", line_id: "evt-mock", inbox_id: "line_verified-mock" } };

for (const [lane, delivery] of [["photoReveal", "delivered"], ["LV5", 200]]) {
  for (const [scenario, rows] of [
    ["confirmed", [matching]],
    ["missing", []],
    ["wrong event", [{ ...matching, fields: { ...matching.fields, line_id: "other" } }]],
    ["duplicate", [matching, matching]],
    ["redirect", null],
  ]) {
    test(`${lane}: ${scenario} intake receipt`, async () => {
      const original = globalThis.fetch;
      let posted;
      let lookup = 0;
      globalThis.fetch = async (input, options = {}) => {
        const url = new URL(input);
        assert.equal(url.hostname, "api.airtable.com");
        if (url.searchParams.has("fields[]")) {
          lookup++;
          assert.equal(options.method ?? "GET", "GET");
          assert.equal(options.redirect, "manual");
          assert.deepEqual(url.searchParams.getAll("fields[]"), ["source", "line_id", "inbox_id"]);
          assert.equal(url.searchParams.get("filterByFormula"), 'AND({source}="line",{line_id}="evt-mock")');
          return rows ? Response.json({ records: rows }) : new Response(null, { status: 302 });
        }
        assert.match(url.pathname, /tbljCYfYqfm8gBTPq$/);
        if (options.method !== "POST") return Response.json({ records: [] });
        posted = JSON.parse(options.body).fields;
        return Response.json({ id: "mock-telemetry" });
      };
      try {
        const result = await runOperationalTelemetry(env, {
          handled: true,
          event: { type: "message", message: { id: "evt-mock", text: "mock inbound only" }, source: { userId: "mock user only" } },
          decision: { intent: "test", reply_source: lane },
          delivered: true, attempted: true, delivery_status: delivery,
        });
        assert.equal(result.id, "mock-telemetry");
        assert.equal(lookup, 1);
        assert.equal(posted.linked_console_inbox_id, scenario === "confirmed" ? matching.fields.inbox_id : undefined);
        assert.equal(JSON.parse(posted.payload_json).line_delivery_succeeded, true);
        assert.doesNotMatch(JSON.stringify(posted), /mock inbound only|mock user only/);
      } finally {
        globalThis.fetch = original;
      }
    });
  }
}
