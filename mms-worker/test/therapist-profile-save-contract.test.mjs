import test from "node:test";
import assert from "node:assert/strict";
import { therapistProfileContract } from "../src/therapist-profile-runtime.mjs";
import {fixture, ORIGIN, IDS, PHOTO, courses, key, cookie} from "./helpers/therapist-profile-fixture.mjs";
import { MAX_COVERAGE_ZONES, loadMmsServiceZoneIndex } from "../src/service-zones-runtime.mjs";

test("45 canonical zones round-trip and share the bounded application contract", async (t) => {
  const f = fixture(t);
  assert.equal(MAX_COVERAGE_ZONES, 45);
  assert.equal(therapistProfileContract.limits.coverage_service_zones, MAX_COVERAGE_ZONES);
  const before = await f.call();
  assert.equal(before.data.service_zones.coverage_service_zone_codes.length, 45);
  const saved = await f.call("PUT", { display_name: "Edited Fixture", courses, ...f.selection });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.service_zones, f.selection);
  const readback = await f.call();
  assert.deepEqual(readback.data.service_zones, f.selection);
  assert.deepEqual(readback.data.courses, courses);
  assert.equal(readback.data.photos.length, 1);
  assert.equal(f.records[0].fields["Matching Enabled"], false);
  assert.equal(f.records[0].fields["Manual Review Only"], true);
});

for (const [name, change, code] of [
  ["over 45", (f) => ({ ...f.selection, coverage_service_zone_codes: f.zones.map((zone) => zone.fields["Zone Code"]) }), "SERVICE_ZONES_TOO_MANY"],
  ["unknown", () => ({ base_service_zone_code: "BKK-UNKNOWN", coverage_service_zone_codes: ["BKK-UNKNOWN"] }), "SERVICE_ZONE_NOT_ACTIVE"],
  ["inactive", (f) => { f.zones[0].fields.Active = false; return f.selection; }, "SERVICE_ZONE_REVIEW_REQUIRED"],
  ["base outside coverage", (f) => ({ ...f.selection, coverage_service_zone_codes: ["BKK-ZONE1"] }), "SERVICE_ZONES_INVALID"],
  ["blank coverage entry", (f) => ({ ...f.selection, coverage_service_zone_codes: [f.selection.base_service_zone_code, ""] }), "SERVICE_ZONES_INVALID"],
]) test(`zone selection rejects ${name} before writes`, async (t) => {
  const f = fixture(t);
  const result = await f.call("PUT", change(f));
  assert.equal(result.status, code === "SERVICE_ZONE_REVIEW_REQUIRED" ? 409 : 400);
  assert.equal(result.error.code, code);
  assert.deepEqual(f.writes, []);
});

test("name/course-only edits preserve all links, courses and photos when an old zone becomes inactive", async (t) => {
  const f = fixture(t);
  f.zones[1].fields.Active = false;
  const links = structuredClone(f.records[0].fields["Coverage Service Zones"]);
  const oldManifest = JSON.parse(f.objects.get(key(IDS[0])));
  const before = await f.call();
  assert.equal(before.data.service_zone_conflicts.unresolved_coverage_count, 1);
  assert.equal(before.data.service_zones.coverage_service_zone_codes.length, 44);
  const saved = await f.call("PUT", { display_name: "Changed name only" });
  assert.equal(saved.status, 200);
  assert.deepEqual(f.records[0].fields["Coverage Service Zones"], links);
  const next = JSON.parse(f.objects.get(key(IDS[0])));
  assert.deepEqual(next.photos, oldManifest.photos);
  assert.deepEqual(next.courses, oldManifest.courses);
  assert.deepEqual(next.public_photo_ids, oldManifest.public_photo_ids);
});

test("inactive base is exposed as a conflict and catalog failure does not empty stored zones", async (t) => {
  const f = fixture(t);
  f.zones[0].fields.Active = false;
  const profile = await f.call();
  assert.equal(profile.data.service_zone_conflicts.unresolved_base_count, 1);
  f.failure.catalog = true;
  const result = await f.call("PUT", { intro: "Course/profile edit while catalog unavailable" });
  assert.equal(result.status, 200);
  assert.equal(result.data.service_zones, null);
  assert.equal(result.data.service_zone_conflicts, null);
  assert.equal(f.records[0].fields["Coverage Service Zones"].length, 45);
});

for (const [name, body, code] of [
  ["negative price", { courses: [{ ...courses[0], price_thb: -1 }] }, "COURSE_1_PRICE_INVALID"],
  ["null price", { courses: [{ ...courses[0], price_thb: null }] }, "COURSE_1_PRICE_INVALID"],
  ["fraction price", { courses: [{ ...courses[0], price_thb: 4500.5 }] }, "COURSE_1_PRICE_INVALID"],
  ["invalid duration", { courses: [{ ...courses[0], duration_minutes: 91 }] }, "COURSE_1_DURATION_INVALID"],
  ["empty name", { courses: [{ ...courses[0], name: "" }] }, "COURSE_1_NAME_REQUIRED"],
  ["missing courses", { courses: null }, "COURSES_INVALID"],
  ["course privilege injection", { courses: [{ ...courses[0], verified: true }] }, "COURSES_INVALID"],
]) test(`courses reject ${name} without storage changes`, async (t) => {
  const f = fixture(t);
  const result = await f.call("PUT", body);
  assert.equal(result.status, 400);
  assert.equal(result.error.code, code);
  assert.deepEqual(f.writes, []);
});

test("empty and populated courses are distinct successful values", async (t) => {
  const f = fixture(t);
  assert.equal((await f.call("PUT", { courses: [] })).status, 200);
  assert.deepEqual((await f.call()).data.courses, []);
  assert.equal((await f.call("PUT", { courses })).status, 200);
  assert.deepEqual((await f.call()).data.courses, courses);
  assert.deepEqual(f.records[0].fields["Verified Skills"], ["Aroma Therapy Oil Massage"]);
});

for (const [name, failure, expected] of [
  ["Airtable rejection", { patch: "before" }, { airtable: "rejected", profile: "not_attempted" }],
  ["Airtable response lost", { patch: "after" }, { airtable: "unknown", profile: "not_attempted" }],
  ["malformed Airtable acknowledgement", { patch: "malformed" }, { airtable: "unknown", profile: "not_attempted" }],
  ["R2 rejection", { put: "before" }, { airtable: "saved", profile: "unknown" }],
  ["R2 response lost", { put: "after" }, { airtable: "saved", profile: "unknown" }],
]) test(`${name} reports the exact incomplete state without unsafe retry`, async (t) => {
  const f = fixture(t);
  Object.assign(f.failure, failure);
  const body = { display_name: "Retry fixture", intro: "Retry changed intro", courses, ...f.selection };
  const otherBefore = f.objects.get(key(IDS[1]));
  const failed = await f.call("PUT", body);
  assert.equal(failed.status, 503);
  assert.equal(failed.ok, false);
  if (failure.patch && failure.patch !== "before") {
    assert.equal(failed.error.code,"PROFILE_OPERATION_UNCERTAIN");
    delete f.failure.patch;
    assert.equal((await f.call("PUT",body)).error.code,"PROFILE_OPERATION_UNCERTAIN");
    assert.equal((await f.call()).status,503);
    assert.equal(f.objects.get(key(IDS[1])),otherBefore);
    return;
  }
  assert.equal(failed.error.code, "PROFILE_SAVE_INCOMPLETE");
  assert.equal(failed.retryable, true);
  assert.deepEqual(failed.save_state, expected);
  for (const field of Object.keys(f.failure)) delete f.failure[field];
  assert.equal((await f.call("PUT", body, failure.patch === "before" ? {headers:{"X-Profile-Operation-Id":crypto.randomUUID()}} : {})).status, 200);
  const saved = await f.call();
  assert.deepEqual(saved.data.courses, courses);
  assert.deepEqual(saved.data.service_zones, f.selection);
  assert.equal(saved.data.photos.length, 1);
  assert.equal(f.objects.get(key(IDS[1])), otherBefore);
});

test("manifest-only failure correctly marks Airtable not needed", async (t) => {
  const f = fixture(t);
  f.failure.put = "before";
  const response = await f.call("PUT", { courses: [] });
  assert.deepEqual(response.save_state, { airtable: "not_needed", profile: "unknown" });
});

for (const kind of ["read failure", "invalid JSON", "malformed courses", "oversized courses", "foreign photo"]) test(`${kind} never becomes an empty successful manifest`, async (t) => {
  const f = fixture(t);
  const manifest = JSON.parse(f.objects.get(key(IDS[0])));
  if (kind === "read failure") f.failure.get = true;
  else if (kind === "invalid JSON") f.objects.set(key(IDS[0]), "{broken");
  else {
    if (kind === "malformed courses") manifest.courses = {};
    if (kind === "oversized courses") manifest.courses = Array.from({ length: 9 }, () => courses[0]);
    if (kind === "foreign photo") manifest.photos[0].key = `therapist-dashboard/v1/${IDS[1]}/photos/${PHOTO}`;
    f.objects.set(key(IDS[0]), JSON.stringify(manifest));
  }
  const before = f.objects.get(key(IDS[0]));
  assert.equal((await f.call()).status, 503);
  assert.equal((await f.call("PUT", { display_name: "Do not overwrite" })).status, 503);
  assert.deepEqual(f.writes, []);
  assert.equal(f.objects.get(key(IDS[0])), before);
});

for (const field of ["therapist_id", "record_id", "line_subject", "availability_status", "matching_enabled", "manual_review_only", "verified_skills", "photos", "public_photo_ids", "Matching Enabled"]) test(`profile cannot assign protected field ${field}`, async (t) => {
  const f = fixture(t);
  const result = await f.call("PUT", { [field]: field === "therapist_id" ? IDS[1] : true });
  assert.equal(result.status, 400);
  assert.equal(result.error.code, "PROFILE_FIELD_NOT_ALLOWED");
  assert.deepEqual(f.writes, []);
});

test("signed fixture accounts edit only their session owner; missing or mismatched identity is denied", async (t) => {
  const f = fixture(t);
  const other = f.objects.get(key(IDS[1]));
  assert.equal((await f.call("PUT", { intro: "Owner A change" })).status, 200);
  assert.equal(f.objects.get(key(IDS[1])), other);
  assert.equal((await f.call("GET", undefined, { actor: 1 })).data.therapist_id, IDS[1]);
  assert.equal((await f.call("PUT", { intro: "No session" }, { unauthenticated: true })).status, 401);
  assert.equal((await f.call("PUT", { intro: "Wrong binding" }, { actor: 1, bindingActor: 0 })).status, 401);
  assert.equal((await f.call("PUT", { intro: "Wrong origin" }, { origin: "https://untrusted.example" })).status, 403);
  assert.equal((await f.call("PUT", { intro: "Other route" }, { suffix: `/${IDS[1]}` })).status, 404);
  f.records[1].fields["Therapist Auth Status"] = "Suspended";
  assert.equal((await f.call("GET", undefined, { actor: 1 })).status, 403);
  assert.equal(f.objects.get(key(IDS[1])), other);
  assert.equal(f.records[0].fields["Availability Status"], "Unavailable");
  assert.equal(f.records[0].fields["Matching Enabled"], false);
});

test("duplicate canonical catalog codes fail closed", async (t) => {
  const f = fixture(t);
  f.zones[1].fields["Zone Code"] = f.zones[0].fields["Zone Code"];
  await assert.rejects(() => loadMmsServiceZoneIndex(f.env), { code: "SERVICE_ZONE_CATALOG_CONFLICT" });
  assert.deepEqual(f.writes, []);
});

test("a mismatched Airtable account cannot pass even with a matching binding fixture", async (t) => {
  const f = fixture(t);
  f.failure.wrongRecord = true;
  const response = await f.call("PUT", { intro: "Must never reach the other account" });
  assert.equal(response.status, 401);
  assert.equal(response.error.code, "THERAPIST_SESSION_INVALID");
  assert.deepEqual(f.writes, []);
});

const UPLOAD_ID = "11111111-2222-4333-8444-555555555555";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGOUjLJhYGBgYgADAAg7ALMQk86oAAAAAElFTkSuQmCC", "base64");
const OTHER_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAAAAABX3VL4AAAADklEQVR4nGMMYGBiYAAAAaIAVBelrcoAAAAASUVORK5CYII=", "base64");
const upload = (f, bytes = PNG, uploadId = UPLOAD_ID, actor = 0) => f.call("POST", bytes, { actor, suffix: "/photos", rawBody: true, headers: { "Content-Type": "image/png", "X-File-Name": "synthetic.png", "X-Upload-Id": uploadId } });

for (const [name, failure] of [
  ["photo-object rejection", { objectPut: "before" }],
  ["photo-object lost acknowledgement", { objectPut: "after" }],
  ["photo-manifest rejection", { put: "before" }],
  ["photo-manifest lost acknowledgement", { put: "after" }],
]) test(`${name} retries the same upload without duplicate visible photos`, async (t) => {
  const f = fixture(t);
  Object.assign(f.failure, failure);
  const peerBefore = f.objects.get(key(IDS[1]));
  const failed = await upload(f);
  assert.equal(failed.status, 503);
  assert.equal(failed.error.code, "PHOTO_SAVE_INCOMPLETE");
  assert.equal(failed.retryable, true);
  assert.deepEqual(failed.save_state, failure.objectPut
    ? { photo: "unknown", profile: "not_attempted" }
    : { photo: "saved", profile: "unknown" });
  for (const field of Object.keys(f.failure)) delete f.failure[field];
  const retry = await upload(f);
  assert.ok([200, 201].includes(retry.status));
  assert.equal((await upload(f)).data.id, retry.data.id);
  const manifest = JSON.parse(f.objects.get(key(IDS[0])));
  assert.equal(manifest.photos.length, 2);
  assert.equal(new Set(manifest.photos.map((photo) => photo.id)).size, 2);
  assert.deepEqual(manifest.courses, courses);
  assert.deepEqual(manifest.public_photo_ids, [PHOTO]);
  assert.equal(f.writes.filter((write) => write.storage === "photo").length, 1);
  assert.equal(f.objects.get(key(IDS[1])), peerBefore);
});

for (const orphan of [false, true]) test(`upload identity rejects different bytes with ${orphan ? "an orphan object" : "a committed manifest"}`, async (t) => {
  const f = fixture(t);
  if (orphan) f.failure.put = "before";
  assert.equal((await upload(f)).status, orphan ? 503 : 201);
  delete f.failure.put;
  const before = f.writes.length;
  const response = await upload(f, OTHER_PNG);
  assert.equal(response.status, 409);
  assert.equal(response.error.code, orphan ? "PROFILE_OPERATION_PENDING" : "PHOTO_UPLOAD_ID_REUSED");
  assert.equal(f.writes.length, before);
});

test("upload identity is bounded, per owner, and replay still succeeds at photo limit", async (t) => {
  const f = fixture(t);
  assert.equal((await upload(f, PNG, "arbitrary input")).status, 400);
  assert.deepEqual(f.writes, []);
  const own = await upload(f);
  const peer = await upload(f, PNG, UPLOAD_ID, 1);
  assert.notEqual(own.data.id, peer.data.id);
  const manifest = JSON.parse(f.objects.get(key(IDS[0])));
  for (let i = 0; manifest.photos.length < 12; i += 1) {
    const id = `ph_${String(i).padStart(24, "0")}`;
    manifest.photos.push({ id, key: `therapist-dashboard/v1/${IDS[0]}/photos/${id}`, content_type: "image/png" });
  }
  f.objects.set(key(IDS[0]), JSON.stringify(manifest));
  assert.ok([200,201].includes((await upload(f)).status));
  assert.equal(JSON.parse(f.objects.get(key(IDS[0]))).photos.length, 12);
});

for (const [name, failure] of [
  ["delete manifest rejection", { put: "before" }],
  ["delete manifest lost acknowledgement", { put: "after" }],
  ["photo-delete rejection", { delete: "before" }],
  ["photo-delete lost acknowledgement", { delete: "after" }],
]) test(`${name} preserves referenced bytes and retries safely`, async (t) => {
  const f = fixture(t);
  Object.assign(f.failure, failure);
  const photoKey = `therapist-dashboard/v1/${IDS[0]}/photos/${PHOTO}`;
  const peerKey = `therapist-dashboard/v1/${IDS[1]}/photos/${PHOTO}`;
  const peerBefore = f.objects.get(peerKey);
  const failed = await f.call("DELETE", undefined, { suffix: `/photos/${PHOTO}` });
  assert.equal(failed.status, 503);
  assert.equal(failed.error.code, "PHOTO_SAVE_INCOMPLETE");
  if (failure.put) {
    assert.ok(f.objects.has(photoKey), "bytes survive uncertain manifest acknowledgement");
    assert.equal(f.writes.filter((write) => write.storage === "delete").length, 0);
  }
  const current = JSON.parse(f.objects.get(key(IDS[0])));
  if (current.photos.some((photo) => photo.id === PHOTO)) assert.ok(f.objects.has(photoKey));
  for (const field of Object.keys(f.failure)) delete f.failure[field];
  assert.equal((await f.call("DELETE", undefined, { suffix: `/photos/${PHOTO}` })).status, 204);
  assert.equal((await f.call("DELETE", undefined, { suffix: `/photos/${PHOTO}` })).status, 204);
  const next = JSON.parse(f.objects.get(key(IDS[0])));
  assert.deepEqual(next.photos, []);
  assert.deepEqual(next.public_photo_ids, []);
  assert.deepEqual(next.courses, courses);
  assert.equal(f.objects.has(photoKey), false);
  assert.equal(f.objects.get(peerKey), peerBefore);
});

for (const failure of ["before", "after"]) test(`public photo selection retries after manifest failure ${failure} acknowledgement`, async (t) => {
  const f = fixture(t);
  f.failure.put = failure;
  const failed = await f.call("PUT", { photo_ids: [] }, { suffix: "/photos/public" });
  assert.equal(failed.status, 503);
  assert.equal(failed.error.code, "PHOTO_SAVE_INCOMPLETE");
  delete f.failure.put;
  assert.equal((await f.call("PUT", { photo_ids: [] }, { suffix: "/photos/public" })).status, 200);
  const next = JSON.parse(f.objects.get(key(IDS[0])));
  assert.deepEqual(next.public_photo_ids, []);
  assert.equal(next.photos.length, 1);
  assert.deepEqual(next.courses, courses);
  assert.ok(f.objects.has(`therapist-dashboard/v1/${IDS[0]}/photos/${PHOTO}`));
});

test('current-main duplicate zone normalization preserves canonical unique links',async t=>{
 const f=fixture(t);const result=await f.call('PUT',{base_service_zone_code:'BKK-ZONE0',coverage_service_zone_codes:['BKK-ZONE0','BKK-ZONE0']});assert.equal(result.status,200);assert.deepEqual(result.data.service_zones.coverage_service_zone_codes,['BKK-ZONE0']);assert.equal(f.records[0].fields['Coverage Service Zones'].length,1);
});
