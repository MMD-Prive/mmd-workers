import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { maybeHandleCanonicalZoneBooking } from "../src/canonical-zone-booking-runtime.mjs";

const ENV = Object.freeze({
  MMS_INTERNAL_HOST: "mms.internal",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_API_TOKEN: "test-token",
  AIRTABLE_SERVICE_ZONES_TABLE_ID: "tbl6VODlZSC0vJgJD",
  AIRTABLE_THERAPISTS_TABLE_ID: "tblTC9ZHQa4hAUwLu",
  AIRTABLE_PREBOOKINGS_TABLE_ID: "tblnSw3MY79MwWONe",
  AIRTABLE_JOBS_TABLE_ID: "tbl0p7UdOH9BjzmFX",
  AIRTABLE_OFFERS_TABLE_ID: "tblrSS5OegYNnGiEU",
});

const ZONE_A = "recCanonicalZoneA";
const ZONE_B = "recCanonicalZoneB";

function serviceZones() {
  return [
    {
      id: ZONE_A,
      fields: {
        Active: true,
        "Zone Code": "BKK-SUKHUMVIT",
        "Province TH": "กรุงเทพมหานคร",
        "Province EN": "Bangkok",
        "Province Code": "BKK",
        "Metro Group": "Bangkok",
        "Zone Name TH": "สุขุมวิท · อโศก · พร้อมพงษ์ · ทองหล่อ · เอกมัย",
        "Zone Name EN": "Sukhumvit · Asoke · Phrom Phong · Thonglor · Ekkamai",
        "Customer Safe Label TH": "สุขุมวิท / อโศก / ทองหล่อ",
        "Legacy Zone Label": "Sukhumvit",
        "Launch Phase": "Bangkok Core",
        "Sort Order": 10,
      },
    },
    {
      id: ZONE_B,
      fields: {
        Active: true,
        "Zone Code": "BKK-ONNUT-BANGNA",
        "Province TH": "กรุงเทพมหานคร",
        "Province EN": "Bangkok",
        "Province Code": "BKK",
        "Metro Group": "Bangkok",
        "Zone Name TH": "อ่อนนุช · พระโขนง · บางนา · ประเวศ",
        "Customer Safe Label TH": "อ่อนนุช / บางนา",
        "Legacy Zone Label": "On Nut / Bang Na",
        "Launch Phase": "Bangkok Extended",
        "Sort Order": 70,
      },
    },
  ];
}

function therapists() {
  return [
    {
      id: "recTherapistExact",
      fields: {
        "Therapist ID": "mmsther_exact",
        "Display Name": "Exact",
        "Customer Gender Scope": "ได้ทั้งคู่",
        "Verified Skills": ["Aroma Therapy Oil Massage"],
        "Base Service Zone": [ZONE_A],
        "Coverage Service Zones": [],
        "Base Zone": "Sukhumvit",
        "Coverage Zones": [],
        "Availability Status": "Available",
        "Matching Enabled": true,
        "Manual Review Only": false,
        "MY MMS Access": "Approved",
        Status: "Active",
      },
    },
    {
      id: "recTherapistWrongZone",
      fields: {
        "Therapist ID": "mmsther_wrong_zone",
        "Display Name": "Wrong zone",
        "Customer Gender Scope": "ได้ทั้งคู่",
        "Verified Skills": ["Aroma Therapy Oil Massage"],
        "Base Service Zone": [ZONE_B],
        "Coverage Service Zones": [],
        // This deliberately shares a broad legacy area shape. Canonical linked
        // zones, not legacy text, must decide the result.
        "Base Zone": "Sukhumvit",
        "Coverage Zones": [],
        "Availability Status": "Available",
        "Matching Enabled": true,
        "Manual Review Only": false,
        "MY MMS Access": "Approved",
        Status: "Active",
      },
    },
  ];
}

function installAirtableFetch() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes(ENV.AIRTABLE_SERVICE_ZONES_TABLE_ID)) {
      return Response.json({ records: serviceZones() });
    }
    if (url.pathname.includes(ENV.AIRTABLE_THERAPISTS_TABLE_ID)) {
      return Response.json({ records: therapists() });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return () => { globalThis.fetch = original; };
}

test("canonical Zone Code uses exact linked Service Zone rather than broad legacy zone", async () => {
  const restore = installAirtableFetch();
  try {
    const request = new Request("https://mms.internal/mms/api/therapists/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient_gender: "male",
        zone: "BKK-SUKHUMVIT",
        skills: ["aroma_therapy_oil"],
      }),
    });
    const response = await maybeHandleCanonicalZoneBooking(request, ENV);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.service_zone.code, "BKK-SUKHUMVIT");
    assert.deepEqual(payload.data.matches.map((item) => item.therapist_id), ["mmsther_exact"]);
    assert.equal(payload.data.matches[0].service_zone_code, "BKK-SUKHUMVIT");
    assert.equal(Object.hasOwn(payload.data.matches[0], "base_zone"), false);
    assert.equal(Object.hasOwn(payload.data.matches[0], "coverage_zones"), false);
  } finally {
    restore();
  }
});

test("legacy zone request deliberately falls through to the existing legacy runtime", async () => {
  const request = new Request("https://mms.internal/mms/api/therapists/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_gender: "male", zone: "sukhumvit", skills: ["thai_massage"] }),
  });
  assert.equal(await maybeHandleCanonicalZoneBooking(request, ENV), null);
});

test("canonical prebooking and job projections persist linked Service Zone, never only browser text", async () => {
  const source = await readFile(new URL("../src/canonical-zone-booking-runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /fields\["Service Zone"\] = \[canonicalZone\.record_id\]/);
  assert.match(source, /"Service Zone": \[canonicalZone\.record_id\]/);
  assert.match(source, /therapistCoversCanonicalZone/);
  assert.match(source, /Base Service Zone/);
  assert.match(source, /Coverage Service Zones/);
  assert.match(source, /MMS_DISPATCH_COORDINATOR/);
  assert.match(source, /NO_AVAILABLE_APPROVED_THERAPIST/);
  assert.match(source, /"MY MMS Access"/);
});

test("runtime intercepts canonical Zone Code before legacy prebooking auto-dispatch", async () => {
  const source = await readFile(new URL("../src/runtime-index-with-dispatch.js", import.meta.url), "utf8");
  const canonicalIndex = source.indexOf("maybeHandleCanonicalZoneBooking(request, env)");
  const legacyIndex = source.indexOf("runtime.fetch(request, env, ctx)");
  assert.ok(canonicalIndex >= 0 && legacyIndex > canonicalIndex);
  assert.match(source, /canonicalZoneErrorResponse/);
});
