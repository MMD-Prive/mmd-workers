import assert from "node:assert/strict";
import test from "node:test";

import { handleKenjiModelAdminRequest } from "./src/kenji-model-admin-adapter.js";

const ENV = {
  AIRTABLE_API_KEY: "test-airtable-key",
  AIRTABLE_BASE_ID: "appTestBase",
  AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS_ID: "tblReviewRequestsCanonical",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("draft preserves the production Premium Active customer scope", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if ((init.method || "GET") === "GET") return json({ records: [] });
    return json({ records: [{ id: "recReview123456789" }] }, 201);
  };

  const result = await handleKenjiModelAdminRequest(
    new Request("https://mmdbkk.com/v1/admin/kenji/models/draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "premium-active-scope-20260906",
      },
      body: JSON.stringify({
        model_id: "recBKaHfxUKs8fkMV",
        keyword_profile_id: "recrZU4BakDXvFyOU",
        expected_profile_version: 2,
        model_key: "mdl_private_premium_vip_straight_top_mek",
        working_name: "Mek",
        model_tier: "Private",
        allowed_customer_scope: ["Premium Active"],
        photo_visibility_policy: "Active eligible only",
        deposit_preview_gate: "Per approval",
        profile_status: "Active",
      }),
    }),
    ENV,
    { actor: { id: "boss-per", role: "owner" }, fetchImpl }
  );

  assert.equal(result.status, 201);
  assert.equal(calls.length, 2);
  const saved = JSON.parse(JSON.parse(calls[1].init.body).records[0].fields.payload_json);
  assert.deepEqual(saved.allowed_customer_scope, ["Premium Active"]);
});
