import assert from "node:assert/strict";
import test from "node:test";
import {
  maybeHandleCanonicalZoneApplication,
  canonicalZoneApplicationContract,
} from "../src/canonical-zone-application-runtime.mjs";

const BASE = "appsV1ILPRfIjkaYg";
const APPLICATIONS = "tblogwnxtIG19I2WB";
const ZONES = "tbl6VODlZSC0vJgJD";
const APP_ID = "mmsapp_0123456789abcdef01234567";
const BKK = "recBkkZone00000001";
const NBI = "recNbiZone00000001";

function env() {
  return {
    AIRTABLE_BASE_ID: BASE,
    AIRTABLE_APPLICATIONS_TABLE_ID: APPLICATIONS,
    AIRTABLE_SERVICE_ZONES_TABLE_ID: ZONES,
    AIRTABLE_API_TOKEN: "test-token",
  };
}

function zoneRecord(id, code, provinceCode, provinceTh, labelTh) {
  return {
    id,
    fields: {
      "Zone Code": code,
      "Province Code": provinceCode,
      "Province TH": provinceTh,
      "Province EN": provinceCode === "BKK" ? "Bangkok" : "Nonthaburi",
      "Metro Group": provinceCode === "BKK" ? "Bangkok Core" : "Metro",
      "Zone Name TH": labelTh,
      "Customer Safe Label TH": labelTh,
      "Admin Areas TH": labelTh,
      "Launch Phase": provinceCode === "BKK" ? "Bangkok Core" : "Metro",
      "Active": true,
      "Sort Order": provinceCode === "BKK" ? 1 : 20,
    },
  };
}

function installFetchMock() {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    calls.push({ url: url.toString(), init });

    if (url.pathname.endsWith(`/${ZONES}`)) {
      return Response.json({
        records: [
          zoneRecord(BKK, "BKK-SUKHUMVIT", "BKK", "กรุงเทพมหานคร", "สุขุมวิท / อโศก / ทองหล่อ"),
          zoneRecord(NBI, "NBI-PAKKRET", "NBI", "นนทบุรี", "ปากเกร็ด"),
        ],
      });
    }

    if (url.pathname.endsWith(`/${APPLICATIONS}`) && (init.method || "GET") === "GET") {
      return Response.json({
        records: [{ id: "recApplication0001", fields: { "Application ID": APP_ID, "Payload JSON": "{}" } }],
      });
    }

    if (url.pathname.endsWith(`/${APPLICATIONS}/recApplication0001`) && init.method === "PATCH") {
      return Response.json({ id: "recApplication0001", fields: JSON.parse(init.body).fields });
    }

    throw new Error(`Unexpected fetch: ${url} ${init.method || "GET"}`);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("canonical application bridge resolves active Zone Codes and projects linked Airtable fields", async () => {
  const mock = installFetchMock();
  let forwardedBody = null;
  const runtime = {
    async fetch(request) {
      forwardedBody = await request.json();
      return Response.json({
        ok: true,
        application_id: APP_ID,
        application_ref: APP_ID,
        application_token: "test-application-token-1234567890",
        storage: { coordinator: "persisted", airtable: "synced", telegram: "skipped" },
      }, { status: 201, headers: { "Access-Control-Allow-Origin": "https://www.mmdbkk.com" } });
    },
  };

  try {
    const request = new Request("https://mms-worker.example/mms/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://www.mmdbkk.com" },
      body: JSON.stringify({
        idempotency_key: "mms-test-zone-application-001",
        applicant_name: "Test Therapist",
        work_base_area: "",
        base_service_zone_code: "BKK-SUKHUMVIT",
        coverage_service_zone_codes: ["NBI-PAKKRET", "BKK-SUKHUMVIT", "NBI-PAKKRET"],
      }),
    });

    const response = await maybeHandleCanonicalZoneApplication(request, env(), {}, runtime);
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.service_zones.status, "synced");
    assert.equal(payload.service_zones.base.code, "BKK-SUKHUMVIT");
    assert.deepEqual(payload.service_zones.coverage.map((item) => item.code), ["NBI-PAKKRET"]);
    assert.equal(JSON.stringify(payload).includes(BKK), false, "Airtable record IDs must not leak to browser");
    assert.equal(JSON.stringify(payload).includes(NBI), false, "Airtable record IDs must not leak to browser");

    assert.equal(forwardedBody.base_service_zone_code, undefined);
    assert.equal(forwardedBody.coverage_service_zone_codes, undefined);
    assert.equal(forwardedBody.work_base_area, "สุขุมวิท / อโศก / ทองหล่อ");

    const patchCall = mock.calls.find((call) => call.init.method === "PATCH");
    assert.ok(patchCall, "canonical Airtable projection must be written before success");
    const patch = JSON.parse(patchCall.init.body);
    assert.deepEqual(patch.fields["Base Service Zone"], [BKK]);
    assert.deepEqual(patch.fields["Coverage Service Zones"], [NBI]);
    const audit = JSON.parse(patch.fields["Payload JSON"]);
    assert.equal(audit.base_service_zone_code, "BKK-SUKHUMVIT");
    assert.deepEqual(audit.coverage_service_zone_codes, ["NBI-PAKKRET"]);
  } finally {
    mock.restore();
  }
});

test("invalid canonical Zone Code fails before legacy application runtime", async () => {
  const mock = installFetchMock();
  let called = false;
  const runtime = { async fetch() { called = true; return Response.json({ ok: true }); } };
  try {
    const request = new Request("https://mms-worker.example/mms/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_service_zone_code: "BKK-NOT-REAL", coverage_service_zone_codes: [] }),
    });
    await assert.rejects(
      () => maybeHandleCanonicalZoneApplication(request, env(), {}, runtime),
      (error) => error?.code === "BASE_SERVICE_ZONE_INVALID" && error?.status === 400,
    );
    assert.equal(called, false);
  } finally {
    mock.restore();
  }
});

test("legacy application requests remain untouched", async () => {
  const request = new Request("https://mms-worker.example/mms/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicant_name: "Legacy" }),
  });
  const result = await maybeHandleCanonicalZoneApplication(request, env(), {}, { fetch() {} });
  assert.equal(result, null);
});

test("contract forbids browser Airtable record IDs", () => {
  assert.deepEqual(canonicalZoneApplicationContract.browser_fields, [
    "base_service_zone_code",
    "coverage_service_zone_codes",
  ]);
  assert.equal(canonicalZoneApplicationContract.record_ids_from_browser, false);
  assert.deepEqual(canonicalZoneApplicationContract.airtable_projection, [
    "Base Service Zone",
    "Coverage Service Zones",
  ]);
});
