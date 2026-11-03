import assert from "node:assert/strict";
import {createHash,createHmac} from "node:crypto";
import {handleMmsTherapistProfileRequest,therapistProfileErrorResponse} from "../../src/therapist-profile-runtime.mjs";
// Entirely synthetic accounts, canonical catalog and private storage; fetch is
// replaced before every call so these checks cannot reach production.
const ORIGIN = "https://www.mmdbkk.com";
const SECRET = "synthetic-profile-contract-secret-0123456789";
const IDS = ["mmst_fixture_owner_a", "mmst_fixture_owner_b"];
const PHOTO = "ph_aaaaaaaaaaaaaaaaaaaaaaaa";
const courses = ["Aroma Therapy Oil Massage", "Women Massage"].map((name) => ({ name, duration_minutes: 90, price_thb: 4500 }));
const key = (id) => `therapist-dashboard/v1/${id}/profile.json`;
const mac = (value) => createHmac("sha256", SECRET).update(value).digest("hex");
function cookie(actor = 0, bindingActor = actor) {
  const now = Math.floor(Date.now() / 1000);
  const encoded = Buffer.from(JSON.stringify({ v: 1, role: "mms_therapist", therapist_id: IDS[actor], line_binding: mac(`mms-therapist-line-binding-v1.synthetic-line-${bindingActor}`), iat: now, exp: now + 600 })).toString("base64url");
  return `__Secure-mms_therapist_session=v1.${encoded}.${mac(`mms-therapist-session-v1.${encoded}`)}`;
}
function fixture(t) {
  const zones = Array.from({ length: 46 }, (_, i) => ({ id: `recSyntheticZone${String(i).padStart(3, "0")}`, fields: { Active: true, "Zone Code": `BKK-ZONE${i}`, "Province Code": "BKK", "Province TH": "กรุงเทพฯ", "Zone Name TH": `เขตทดสอบ ${i}` } }));
  const records = IDS.map((id, i) => ({ id: `recSyntheticOwner${i}`, fields: { "Therapist ID": id, "Display Name": `Fixture ${i}`, "LINE Subject Hash": `synthetic-line-${i}`, Status: "Active", "Therapist Auth Status": "Active", "Availability Status": "Unavailable", "Matching Enabled": false, "Manual Review Only": true, "Verified Skills": ["Aroma Therapy Oil Massage"], "Base Service Zone": [zones[0].id], "Coverage Service Zones": zones.slice(0, 45).map((zone) => zone.id) } }));
  const objects = new Map(IDS.map((id) => [key(id), JSON.stringify({ version: 1, intro: "Existing introduction", profile_visibility: "hidden", courses, photos: [{ id: PHOTO, key: `therapist-dashboard/v1/${id}/photos/${PHOTO}`, content_type: "image/png", file_name: "fixture.png" }], public_photo_ids: [PHOTO], updated_at: null })]));
  const metadata = new Map();
  for (const id of IDS) objects.set(`therapist-dashboard/v1/${id}/photos/${PHOTO}`, new Uint8Array([1, 2, 3]));
  const writes = [];
  const failure = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.airtable.com");
    if (url.pathname.endsWith("/tblSyntheticZone1")) {
      if (failure.catalog) throw new Error("catalog unavailable");
      return Response.json({ records: zones });
    }
    if (init.method === "PATCH") {
      if (failure.patch === "before") return new Response(null, { status: 422 });
      const record = records.find((item) => url.pathname.endsWith(`/${item.id}`));
      assert.ok(record);
      const fields = JSON.parse(init.body).fields;
      writes.push({ storage: "airtable", id: record.id, fields });
      Object.assign(record.fields, fields);
      if (failure.patch === "after") throw new Error("response lost after commit");
      if (failure.patch === "malformed") return Response.json({ ok: true });
      return Response.json(record);
    }
    assert.ok(url.pathname.endsWith("/tblSyntheticUsers1"));
    if (failure.wrongRecord) return Response.json({ records: [{ ...records[1], fields: { ...records[1].fields, "LINE Subject Hash": records[0].fields["LINE Subject Hash"] } }] });
    const formula = url.searchParams.get("filterByFormula") || "";
    return Response.json({ records: records.filter((record) => formula.includes(record.fields["Therapist ID"])) });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const env = { MMS_THERAPIST_AUTH_ENABLED: "true", MMS_THERAPIST_SESSION_SECRET: SECRET, AIRTABLE_API_TOKEN: "synthetic-only", AIRTABLE_BASE_ID: "appSyntheticOnly1", AIRTABLE_THERAPISTS_TABLE_ID: "tblSyntheticUsers1", AIRTABLE_SERVICE_ZONES_TABLE_ID: "tblSyntheticZone1", ALLOWED_ORIGINS: ORIGIN, MMS_PRIVATE_UPLOADS: {
    async get(objectKey) { if (failure.get) throw new Error("read failed"); const value = objects.get(objectKey); return value === undefined ? null : { async text() { return value; }, etag: createHash("sha256").update(value).digest("hex"), ...metadata.get(objectKey) }; },
    async put(objectKey, value, options = {}) {
      const stageFailure = objectKey.endsWith("/profile.json") ? failure.put : failure.objectPut;
      if (stageFailure === "before") throw new Error("write failed");
      const existing = objects.get(objectKey);
      const etag = existing === undefined ? null : createHash("sha256").update(existing).digest("hex");
      if (options.onlyIf instanceof Headers && options.onlyIf.get("If-None-Match") === "*" && existing !== undefined) return null;
      if (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== etag) return null;
      writes.push({ storage: objectKey.endsWith("/profile.json") ? "profile" : "photo", key: objectKey });
      objects.set(objectKey, value);
      metadata.set(objectKey, options);
      if (stageFailure === "after") throw new Error("response lost after commit");
      return {etag:createHash("sha256").update(value).digest("hex")};
    },
    async delete(objectKey) {
      if (failure.delete === "before") throw new Error("delete failed");
      writes.push({ storage: "delete", key: objectKey }); objects.delete(objectKey); metadata.delete(objectKey);
      if (failure.delete === "after") throw new Error("delete acknowledgement lost");
    },
  } };
  async function call(method = "GET", body, options = {}) {
    const request = new Request(`${ORIGIN}/male-massage/therapists/api/auth/profile${options.suffix || ""}`, { method, headers: { Origin: options.origin || ORIGIN, ...(options.unauthenticated ? {} : { Cookie: cookie(options.actor || 0, options.bindingActor ?? options.actor ?? 0) }), "Content-Type": "application/json", ...options.headers }, ...(body === undefined ? {} : { body: options.rawBody ? body : JSON.stringify(body) }) });
    let response;
    try { response = await handleMmsTherapistProfileRequest(request, env); }
    catch (error) { response = therapistProfileErrorResponse(error, request, env); }
    return { status: response.status, ...(response.status === 204 ? {} : await response.json()) };
  }
  return { zones, records, objects, writes, failure, env, call, selection: { base_service_zone_code: zones[0].fields["Zone Code"], coverage_service_zone_codes: zones.slice(0, 45).map((zone) => zone.fields["Zone Code"]) } };
}


export {fixture, ORIGIN, IDS, PHOTO, courses, key, cookie};
