import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  handleMmsTherapistProfileRequest,
  therapistProfileErrorResponse,
} from "../src/therapist-profile-runtime.mjs";

const ORIGIN = "https://www.mmdbkk.com";
const THERAPIST_ID = "mmst_testtherapist0001";
const SECRET = "session-secret-for-tests-1234567890-abcdef";
const zones = [
  { id: "recZonePathumwan123", fields: { "Zone Code": "BKK-PATHUMWAN", "Province Code": "BKK", "Province TH": "กรุงเทพฯ", "Zone Name TH": "ปทุมวัน", Active: true } },
  { id: "recZoneSilom1234567", fields: { "Zone Code": "BKK-SILOM", "Province Code": "BKK", "Province TH": "กรุงเทพฯ", "Zone Name TH": "สีลม", Active: true } },
];
const therapist = {
  id: "recTherapistTest12345",
  fields: {
    "Therapist ID": THERAPIST_ID,
    "Display Name": "Test Therapist",
    "Availability Status": "Unavailable",
    "Base Service Zone": [zones[0].id],
    "Coverage Service Zones": [zones[0].id],
    Status: "Active",
    "Therapist Auth Status": "Active",
    "LINE Subject Hash": "server-side-hash-only",
  },
};
const env = {
  MMS_THERAPIST_AUTH_ENABLED: "true",
  MMS_THERAPIST_SESSION_SECRET: SECRET,
  AIRTABLE_API_TOKEN: "test-airtable-token",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_THERAPISTS_TABLE_ID: "tblTC9ZHQa4hAUwLu",
  AIRTABLE_SERVICE_ZONES_TABLE_ID: "tblAAAAAAAAAAAAAA",
  ALLOWED_ORIGINS: ORIGIN,
  MMS_PRIVATE_UPLOADS: { async get() { return null; }, async put() {} },
};

function sessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const encoded = Buffer.from(JSON.stringify({ v: 1, role: "mms_therapist", therapist_id: THERAPIST_ID, iat: now, exp: now + 600 })).toString("base64url");
  const signature = createHmac("sha256", SECRET).update("mms-therapist-session-v1." + encoded).digest("hex");
  return "__Secure-mms_therapist_session=v1." + encoded + "." + signature;
}

function installFetchMock() {
  const originalFetch = globalThis.fetch;
  const patches = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/" + env.AIRTABLE_SERVICE_ZONES_TABLE_ID)) return Response.json({ records: zones });
    if (String(init.method || "GET").toUpperCase() === "PATCH") {
      const body = JSON.parse(String(init.body || "{}"));
      patches.push(body.fields);
      return Response.json({ ...therapist, fields: { ...therapist.fields, ...body.fields } });
    }
    if (url.pathname.endsWith("/" + env.AIRTABLE_THERAPISTS_TABLE_ID)) return Response.json({ records: [therapist] });
    throw new Error("unexpected Airtable request " + url.pathname);
  };
  return { patches, restore() { globalThis.fetch = originalFetch; } };
}

async function call(method, body) {
  const request = new Request(ORIGIN + "/male-massage/therapists/api/auth/profile", {
    method,
    headers: {
      Origin: ORIGIN,
      Cookie: sessionCookie(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try { return await handleMmsTherapistProfileRequest(request, env); }
  catch (error) { return therapistProfileErrorResponse(error, request, env); }
}

test("profile returns canonical service-zone codes without exposing Airtable links", async () => {
  const mock = installFetchMock();
  try {
    const response = await call("GET");
    assert.equal(response.status, 200);
    const data = (await response.json()).data;
    assert.deepEqual(data.service_zones, {
      base_service_zone_code: "BKK-PATHUMWAN",
      coverage_service_zone_codes: ["BKK-PATHUMWAN"],
    });
    assert.doesNotMatch(JSON.stringify(data), /recZone|server-side-hash-only|test-airtable-token/);
  } finally { mock.restore(); }
});

test("profile saves only active canonical service-zone links", async () => {
  const mock = installFetchMock();
  try {
    const response = await call("PUT", {
      display_name: "Test Therapist",
      base_service_zone_code: "BKK-SILOM",
      coverage_service_zone_codes: ["BKK-PATHUMWAN", "BKK-SILOM"],
    });
    assert.equal(response.status, 200);
    assert.deepEqual(mock.patches[0], {
      "Base Service Zone": [zones[1].id],
      "Coverage Service Zones": [zones[0].id, zones[1].id],
    });
    assert.deepEqual((await response.json()).data.service_zones, {
      base_service_zone_code: "BKK-SILOM",
      coverage_service_zone_codes: ["BKK-PATHUMWAN", "BKK-SILOM"],
    });
  } finally { mock.restore(); }
});

test("profile rejects unknown service zones without writing links", async () => {
  const mock = installFetchMock();
  try {
    const response = await call("PUT", {
      display_name: "Test Therapist",
      base_service_zone_code: "BKK-UNKNOWN",
      coverage_service_zone_codes: ["BKK-UNKNOWN"],
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "SERVICE_ZONE_NOT_ACTIVE");
    assert.equal(mock.patches.length, 0);
  } finally { mock.restore(); }
});
