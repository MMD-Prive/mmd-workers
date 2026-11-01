import test from "node:test";
import assert from "node:assert/strict";
import { computeGoogleEtaMinutes, numericEtaLabel } from "../src/my-mms-travel-runtime.mjs";

test("Google Routes returns a bounded numeric ETA and never returns route coordinates", async () => {
  let sent;
  const minutes = await computeGoogleEtaMinutes({
    latitude: 13.7,
    longitude: 100.5,
    destination: "Customer destination",
    apiKey: "test-key",
    fetchImpl: async (_url, init) => {
      sent = { headers: init.headers, body: JSON.parse(init.body) };
      return Response.json({ routes: [{ duration: "125s" }] });
    },
  });
  assert.equal(minutes, 3);
  assert.equal(sent.headers["X-Goog-FieldMask"], "routes.duration");
  assert.equal(sent.body.origin.location.latLng.latitude, 13.7);
  assert.equal(sent.body.destination.address, "Customer destination");
  assert.equal(sent.body.routingPreference, "TRAFFIC_AWARE");
});

test("Google Routes fails closed on invalid coordinates, missing key, empty result, timeout, and provider failure", async () => {
  await assert.rejects(computeGoogleEtaMinutes({ latitude: 999, longitude: 1, destination: "x", apiKey: "k" }), { code: "TRAVEL_LOCATION_INVALID" });
  await assert.rejects(computeGoogleEtaMinutes({ latitude: 1, longitude: 1, destination: "x" }), { code: "GOOGLE_ROUTES_NOT_CONFIGURED" });
  await assert.rejects(computeGoogleEtaMinutes({ latitude: 1, longitude: 1, destination: "x", apiKey: "k", fetchImpl: async () => Response.json({ routes: [] }) }), { code: "GOOGLE_ETA_UNAVAILABLE" });
  await assert.rejects(computeGoogleEtaMinutes({ latitude: 1, longitude: 1, destination: "x", apiKey: "k", fetchImpl: async () => new Response(null, { status: 403 }) }), { code: "GOOGLE_ROUTES_UNAVAILABLE" });
  await assert.rejects(computeGoogleEtaMinutes({ latitude: 1, longitude: 1, destination: "x", apiKey: "k", fetchImpl: async () => { const error = new Error("timeout"); error.name = "AbortError"; throw error; } }), { code: "GOOGLE_ROUTES_TIMEOUT" });
});

test("customer-facing ETA is a short numeric time label only", () => {
  assert.equal(numericEtaLabel(1), "1 นาที");
  assert.equal(numericEtaLabel(60), "1 ชม.");
  assert.equal(numericEtaLabel(75), "1 ชม. 15 นาที");
  assert.equal(numericEtaLabel(0), null);
  assert.equal(numericEtaLabel(1441), null);
});
