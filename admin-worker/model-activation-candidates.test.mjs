import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { listModelActivationCandidates, modelAccessProfile } from "./src/index.js";

const env = {
  AIRTABLE_API_KEY: "test-only",
  AIRTABLE_BASE_ID: "appTest",
  AIRTABLE_TABLE_MODELS: "models",
};
const endpoint = "https://mmdbkk.com/v1/admin/models/activation-candidates";

function model(status, folder = "vip", id = "recModelTest000001") {
  return {
    id,
    fields: {
      status,
      working_name: "Test Model",
      model_lookup_key: "TEST-01",
      booking_visibility: "private",
      access_folder: folder,
      // Availability must never stand in for an approved canonical status.
      available_now: true,
      availability_status: "available",
      line_user_id: "must-not-be-returned",
      email: "private@example.test",
      private_asset: "private/hidden.jpg",
    },
  };
}

async function withRecords(t, records, run) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.hostname, "api.airtable.com");
    assert.equal(init.method || "GET", "GET");
    calls.push(url);
    return Response.json({ records });
  });
  return run(calls);
}

for (const status of [undefined, null, "", "   ", "pending_review", "pending", "revoked", "blocked", "suspended", "inactive", "archived", "unknown", "available", "not active", true, ["active"], { status: "active" }]) {
  test(`activation candidates reject non-active status ${JSON.stringify(status)}`, async (t) => {
    await withRecords(t, [model(status)], async () => {
      const result = await listModelActivationCandidates(env, new URL(endpoint + "?folder=vip"));
      assert.deepEqual(result.items, []);
    });
  });
}

test("explicit active status permits case/whitespace normalization, with safe fields only", async (t) => {
  const records = [model("active"), model(" Active ", "vip", "recModelTest000002")];
  await withRecords(t, records, async () => {
    const result = await listModelActivationCandidates(env, new URL(endpoint + "?folder=vip"));
    assert.deepEqual(result.items.map((item) => item.model_record_id), records.map((record) => record.id));
    for (const item of result.items) {
      assert.deepEqual(Object.keys(item).sort(), ["folders", "model_lookup_key", "model_record_id", "status", "working_name"]);
      assert.deepEqual(item.folders, ["vip"]);
    }
    assert.doesNotMatch(JSON.stringify(result), /must-not-be-returned|private@example|private\/hidden/);
  });
});

test("wrong folder and unnamed records remain excluded", async (t) => {
  const unnamed = model("active");
  delete unnamed.fields.working_name;
  await withRecords(t, [model("active", "premium"), unnamed], async () => {
    assert.deepEqual((await listModelActivationCandidates(env, new URL(endpoint + "?folder=vip"))).items, []);
  });
});

test("omitting a folder cannot bypass the affirmative status check", async (t) => {
  await withRecords(t, [model("pending_review"), model("active")], async () => {
    const result = await listModelActivationCandidates(env, new URL(endpoint));
    assert.equal(result.items.length, 1);
  });
});

test("invalid folder is rejected before any Airtable request", async (t) => {
  await withRecords(t, [], async (calls) => {
    await assert.rejects(listModelActivationCandidates(env, new URL(endpoint + "?folder=pn")), { code: "model_folder_invalid" });
    assert.equal(calls.length, 0);
  });
});

test("unauthenticated candidate requests never read Model data", async (t) => {
  await withRecords(t, [model("active")], async (calls) => {
    const response = await worker.fetch(new Request(endpoint + "?folder=vip"), env);
    assert.equal(response.status, 401);
    assert.equal(calls.length, 0);
  });
});

test("the change is scoped to activation selection, not legacy booking policy", () => {
  assert.equal(modelAccessProfile({}).statusActive, true);
});
