import test from "node:test";
import assert from "node:assert/strict";

import {
  MODEL_LOCATION_CAPABILITY_PATH,
  MODEL_LOCATION_CURRENT_PATH,
  MODEL_LOCATION_INTERNAL_READ_PATH,
  isModelLocationRequest,
  modelLocationContract,
  modelLocationCustomerReadEnabled,
  modelLocationFeatureEnabled,
  modelLocationRetentionSeconds,
  normalizeModelLocationPoint,
} from "./src/model-location-runtime.js";

test("Model location is a separate active-job-only channel", () => {
  assert.equal(MODEL_LOCATION_CAPABILITY_PATH, "/v1/model/location/capability");
  assert.equal(MODEL_LOCATION_CURRENT_PATH, "/v1/model/location/current");
  assert.equal(MODEL_LOCATION_INTERNAL_READ_PATH, "/__internal/model/location/current");
  assert.equal(modelLocationContract.permission_source, "/v1/model/settings/gps-visibility");
  assert.equal(modelLocationContract.default_ingest_enabled, false);
  assert.equal(modelLocationContract.active_job_only, true);
  assert.equal(modelLocationContract.audience, "private_customer");
  assert.equal(modelLocationContract.stores_history, false);
  assert.equal(modelLocationContract.model_read_exposes_coordinates, false);
  assert.equal(modelLocationContract.customer_read_requires_internal_service_auth, true);
});

test("location routing remains exact", () => {
  assert.equal(isModelLocationRequest("/v1/model/location/capability"), true);
  assert.equal(isModelLocationRequest("/v1/model/location/current"), true);
  assert.equal(isModelLocationRequest("/__internal/model/location/current"), true);
  assert.equal(isModelLocationRequest("/v1/model/location/history"), false);
  assert.equal(isModelLocationRequest("/v1/model/settings/gps-visibility"), false);
});

test("location ingest and customer read are disabled by default", () => {
  assert.equal(modelLocationFeatureEnabled({}), false);
  assert.equal(modelLocationCustomerReadEnabled({}), false);
  assert.equal(modelLocationFeatureEnabled({ MODEL_LOCATION_INGEST_ENABLED: "true" }), true);
  assert.equal(modelLocationCustomerReadEnabled({ MODEL_LOCATION_CUSTOMER_READ_ENABLED: "1" }), true);
});

test("location retention is short and bounded", () => {
  assert.equal(modelLocationRetentionSeconds({}), 180);
  assert.equal(modelLocationRetentionSeconds({ MODEL_LOCATION_RETENTION_SECONDS: "10" }), 60);
  assert.equal(modelLocationRetentionSeconds({ MODEL_LOCATION_RETENTION_SECONDS: "9999" }), 600);
});

test("location point accepts only latest-point fields", () => {
  const now = Date.parse("2026-09-05T00:00:00.000Z");
  const result = normalizeModelLocationPoint({
    lat: 13.756331,
    lng: 100.501762,
    accuracy_m: 12.34,
    captured_at: "2026-09-04T23:59:50.000Z",
  }, now);
  assert.equal(result.ok, true);
  assert.deepEqual(result.point, {
    lat: 13.756331,
    lng: 100.501762,
    accuracy_m: 12.3,
    captured_at: "2026-09-04T23:59:50.000Z",
  });
});

test("location point rejects invalid, stale, and extra data", () => {
  const now = Date.parse("2026-09-05T00:00:00.000Z");
  assert.equal(normalizeModelLocationPoint({ lat: 91, lng: 100 }, now).error, "latitude_invalid");
  assert.equal(normalizeModelLocationPoint({ lat: 13, lng: 181 }, now).error, "longitude_invalid");
  assert.equal(normalizeModelLocationPoint({ lat: 13, lng: 100, accuracy_m: 6000 }, now).error, "accuracy_invalid");
  assert.equal(normalizeModelLocationPoint({ lat: 13, lng: 100, speed: 4 }, now).error, "unsupported_fields");
  assert.equal(normalizeModelLocationPoint({ lat: 13, lng: 100, captured_at: "2026-09-04T23:50:00.000Z" }, now).error, "captured_at_out_of_range");
});
