import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeRealtimeLocationPoint,
  normalizeRoomLocationPolicy,
} from "./src/index.js";

test("Realtime room location policy is disabled unless explicitly enabled", () => {
  const now = Date.parse("2026-09-05T00:00:00.000Z");
  const disabled = normalizeRoomLocationPolicy({ enabled: false, job_id: "job_1" }, now);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.job_id, "job_1");
  assert.equal(disabled.expires_at_ms, now);
});

test("Realtime room location policy TTL is bounded", () => {
  const now = Date.parse("2026-09-05T00:00:00.000Z");
  const defaulted = normalizeRoomLocationPolicy({ enabled: true, job_id: "job_1" }, now);
  assert.equal(defaulted.expires_at_ms, now + 3600 * 1000);

  const minimum = normalizeRoomLocationPolicy({ enabled: true, job_id: "job_1", ttl_seconds: 1 }, now);
  assert.equal(minimum.expires_at_ms, now + 60 * 1000);

  const maximum = normalizeRoomLocationPolicy({ enabled: true, job_id: "job_1", ttl_seconds: 999999 }, now);
  assert.equal(maximum.expires_at_ms, now + 8 * 60 * 60 * 1000);
});

test("Realtime location point validates ranges and age", () => {
  const now = Date.parse("2026-09-05T00:00:00.000Z");
  const ok = normalizeRealtimeLocationPoint({
    lat: 13.756331,
    lng: 100.501762,
    accuracy_m: 12.34,
    captured_at: "2026-09-04T23:59:30.000Z",
  }, now);
  assert.deepEqual(ok, {
    ok: true,
    lat: 13.756331,
    lng: 100.501762,
    accuracy_m: 12.3,
    captured_at: "2026-09-04T23:59:30.000Z",
  });

  assert.equal(normalizeRealtimeLocationPoint({ lat: 91, lng: 100 }, now).error, "latitude_invalid");
  assert.equal(normalizeRealtimeLocationPoint({ lat: 13, lng: 181 }, now).error, "longitude_invalid");
  assert.equal(normalizeRealtimeLocationPoint({ lat: 13, lng: 100, accuracy_m: -1 }, now).error, "accuracy_invalid");
  assert.equal(normalizeRealtimeLocationPoint({ lat: 13, lng: 100, captured_at: "2026-09-04T23:50:00.000Z" }, now).error, "captured_at_invalid");
});
