import test from "node:test";
import assert from "node:assert/strict";

import worker from "../index.js";

function request(host = "ai-worker.local", caller = "member-dashboard-chat-worker") {
  return new Request(`https://${host}/v1/ai/kenji/customer-reasoning`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": caller,
    },
    body: JSON.stringify({
      actor: { role: "system" },
      customer_context: {
        evidence_sources: {
          line_oa_1to1: { state: "SOURCE_UNAVAILABLE", reason: "historical_search_unavailable" },
          line_crew: { state: "SOURCE_UNAVAILABLE", reason: "historical_search_unavailable" },
        },
      },
    }),
  });
}

test("member-dashboard-chat-worker service binding can call read-only Kenji reasoning without shared bearer", async () => {
  const response = await worker.fetch(request(), {});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.read_only, true);
  assert.equal(payload.data.evidence_discovery.unavailable_is_not_not_found, true);
});

test("service-binding headers are rejected on a non-internal hostname", async () => {
  const response = await worker.fetch(request("ai-worker.example.com"), {});
  assert.equal(response.status, 401);
});

test("unapproved service caller is rejected", async () => {
  const response = await worker.fetch(request("ai-worker.local", "unknown-worker"), {});
  assert.equal(response.status, 401);
});
