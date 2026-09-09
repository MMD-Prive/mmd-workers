import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { maybeHandleMmsServiceZones } from "../src/service-zones-runtime.mjs";

const BASE_ENV = Object.freeze({
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_API_TOKEN: "test-token",
  AIRTABLE_SERVICE_ZONES_TABLE_ID: "tbl6VODlZSC0vJgJD",
  ALLOWED_ORIGINS: "https://www.mmdbkk.com,https://mmdbkk.com",
});

function zoneRecord(id, fields) {
  return { id, fields: { Active: true, ...fields } };
}

test("service-zone catalog groups Province then operational Zone in canonical order", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get("filterByFormula"), "{Active}=TRUE()");
    return Response.json({
      records: [
        zoneRecord("recNBI00000000001", {
          "Zone Label": "นนทบุรี · ปากเกร็ด",
          "Zone Code": "NBI-PAKKRET",
          "Province TH": "นนทบุรี",
          "Province EN": "Nonthaburi",
          "Province Code": "NBI",
          "Metro Group": "Greater Bangkok",
          "Zone Name TH": "ปากเกร็ด",
          "Zone Name EN": "Pak Kret",
          "Admin Areas TH": "อำเภอปากเกร็ด",
          "Customer Safe Label TH": "ปากเกร็ด",
          "Launch Phase": "Metro",
          "Sort Order": 220,
        }),
        zoneRecord("recBKK00000000001", {
          "Zone Label": "กรุงเทพมหานคร · สุขุมวิท / อโศก / ทองหล่อ",
          "Zone Code": "BKK-SUKHUMVIT",
          "Province TH": "กรุงเทพมหานคร",
          "Province EN": "Bangkok",
          "Province Code": "BKK",
          "Metro Group": "Bangkok",
          "Zone Name TH": "สุขุมวิท · อโศก · ทองหล่อ",
          "Zone Name EN": "Sukhumvit · Asoke · Thonglor",
          "Admin Areas TH": "เขตวัฒนา, เขตคลองเตย",
          "Customer Safe Label TH": "สุขุมวิท / อโศก / ทองหล่อ",
          "Launch Phase": "Bangkok Core",
          "Sort Order": 10,
        }),
      ],
    });
  };

  try {
    const response = await maybeHandleMmsServiceZones(new Request("https://mms-worker.test/mms/api/service-zones"), BASE_ENV);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.version, "2026-09-09.v1");
    assert.deepEqual(payload.data.provinces.map((item) => item.code), ["BKK", "NBI"]);
    assert.deepEqual(payload.data.zones.map((item) => item.code), ["BKK-SUKHUMVIT", "NBI-PAKKRET"]);
    assert.equal(payload.data.zones[0].safe_label_th, "สุขุมวิท / อโศก / ทองหล่อ");
    assert.equal(payload.data.zones[1].admin_areas_th, "อำเภอปากเกร็ด");
    assert.equal(Object.hasOwn(payload.data.zones[0], "record_id"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("service-zone catalog fails closed when canonical Airtable binding is missing", async () => {
  const response = await maybeHandleMmsServiceZones(
    new Request("https://mms-worker.test/mms/api/service-zones"),
    { ...BASE_ENV, AIRTABLE_SERVICE_ZONES_TABLE_ID: "" },
  );
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "AIRTABLE_SERVICE_ZONES_TABLE_INVALID");
});

test("production entrypoint binds the canonical service-zone table and exposes health readiness", async () => {
  const wrangler = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  const entry = await readFile(new URL("../src/runtime-index-with-dispatch.js", import.meta.url), "utf8");
  assert.equal(wrangler.vars.AIRTABLE_SERVICE_ZONES_TABLE_ID, "tbl6VODlZSC0vJgJD");
  assert.match(entry, /maybeHandleMmsServiceZones\(request, env\)/);
  assert.match(entry, /service_zones: Boolean\(env\.AIRTABLE_SERVICE_ZONES_TABLE_ID\)/);
});
