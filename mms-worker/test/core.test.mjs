import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applicationAirtableFields,
  applicationPayload,
  applicationTelegramMessage,
  catalog,
  matchTherapists,
  prebookingPayload,
  sensitiveAirtableFields,
  uploadRequest,
} from "../src/core.mjs";

const applicationInput = {
  idempotency_key: "mms-form-v4-001",
  applicant_name: "Therapist Test",
  nickname: "Test",
  phone: "0812345678",
  line_id: "therapist.test",
  age: 29,
  height_cm: 181,
  weight_kg: 78,
  home_province: "เชียงใหม่",
  residence_province: "กรุงเทพมหานคร",
  residence_area: "รัชดา",
  gender_identity: "male",
  customer_gender_scope: "both",
  skills: ["aroma_therapy_oil", "thai_massage"],
  experience_years: 2,
  experience_months: 6,
  strengths: "Calm and professional",
  has_massage_experience: true,
  professional_massage_experience: true,
  experience_background: "spa_closed_venue",
  worked_at_spa_before: true,
  spa_name: "Example Spa",
  worked_independently_before: false,
  independent_social: "",
  partner_present_experience: false,
  work_preference: "mms_mobile_online",
  languages: ["th", "en"],
  availability_summary: ["weekday_evening", "weekend_evening"],
  lead_time_preference: "four_hours",
  transport_modes: ["public_transit", "ride_hailing"],
  preferred_contact: "line",
  preferred_contact_time: "18:00-21:00",
  workshop_interest: "assess_first",
  motivation: "Interested in professional mobile massage work.",
  current_profession: "Personal Trainer",
  qualification_note: "Thai massage certificate",
  work_base_area: "กรุงเทพฯ รัชดา",
  mobility_scope: "nationwide",
  coverage_area_note: "กรุงเทพฯ และต่างจังหวัดตามตกลง",
  base_zone: "sukhumvit",
  coverage_zones: ["sukhumvit", "sathorn_silom"],
  general_consent: true,
  sexual_orientation: "gay",
  sensitive_consent: true,
  consent_notice_version: "mms-sensitive-v2",
  language: "th",
};

test("catalog exposes exactly eight stable skills", () => {
  const data = catalog();
  assert.equal(data.skills.length, 8);
  assert.equal(data.max_selected_skills, 8);
});

test("v4 application stores applicant basics and derives a non-sensitive route", () => {
  const payload = applicationPayload(applicationInput);
  assert.equal(payload.age, 29);
  assert.equal(payload.height_cm, 181);
  assert.equal(payload.weight_kg, 78);
  assert.equal(payload.residence_province, "กรุงเทพมหานคร");
  assert.equal(payload.experience_background, "Spa / closed venue");
  assert.equal(payload.recommended_route, "CALL_AND_MEET");
  assert.deepEqual(payload.languages, ["Thai", "English"]);
});

test("routing sends beginners to workshop and shop-only applicants to Relax Spa", () => {
  const beginner = applicationPayload({
    ...applicationInput,
    idempotency_key: "mms-form-v4-beginner",
    has_massage_experience: false,
    professional_massage_experience: false,
    experience_background: "no_experience",
    worked_at_spa_before: false,
    spa_name: "",
  });
  assert.equal(beginner.recommended_route, "WORKSHOP");

  const spaOnly = applicationPayload({
    ...applicationInput,
    idempotency_key: "mms-form-v4-spa-only",
    work_preference: "relax_spa_only",
  });
  assert.equal(spaOnly.recommended_route, "RELAX_SPA");
});

test("orientation stays only in the restricted sensitive record", () => {
  const payload = applicationPayload(applicationInput);
  const applicationFields = applicationAirtableFields(payload, {
    application_id: "mmsapp_1234567890abcdef12345678",
    submitted_at: "2026-09-07T12:00:00.000Z",
  });
  const sensitiveFields = sensitiveAirtableFields(payload, {
    application_id: "mmsapp_1234567890abcdef12345678",
    submitted_at: "2026-09-07T12:00:00.000Z",
  });

  assert.equal(applicationFields["Customer Gender Scope"], "ได้ทั้งคู่");
  assert.equal(applicationFields.Age, 29);
  assert.equal(applicationFields["Experience Background"], "Spa / closed venue");
  assert.equal(applicationFields["Recommended Applicant Route"], "CALL_AND_MEET");
  assert.equal(Object.hasOwn(applicationFields, "Sexual Orientation"), false);
  assert.equal(applicationFields["Payload JSON"].includes("sexual_orientation"), false);
  assert.equal(sensitiveFields["Sexual Orientation"], "ชายรักชาย — Gay");
  assert.equal(sensitiveFields["Customer Visible"], false);
  assert.equal(sensitiveFields["Booking API Allowed"], false);
  assert.match(sensitiveFields["Collection Purpose"], /never automated approval\/ranking/);
});

test("application requires current residence and coherent experience answers", () => {
  assert.throws(() => applicationPayload({ ...applicationInput, residence_province: "" }), /residence_province is required/);
  assert.throws(() => applicationPayload({ ...applicationInput, residence_area: "" }), /residence_area is required/);
  assert.throws(() => applicationPayload({
    ...applicationInput,
    has_massage_experience: false,
    experience_background: "informal_self_taught",
  }), /experience_background conflicts/);
  assert.throws(() => applicationPayload({
    ...applicationInput,
    has_massage_experience: false,
    professional_massage_experience: true,
    experience_background: "no_experience",
  }), /professional_massage_experience requires/);
});

test("nationwide intake does not require legacy Bangkok matching zones", () => {
  const payload = applicationPayload({ ...applicationInput, base_zone: undefined, coverage_zones: undefined });
  assert.equal(payload.base_zone, "");
  assert.deepEqual(payload.coverage_zones, []);
});

test("HENNA summary exposes operational intake context but never orientation/contact", () => {
  const payload = applicationPayload(applicationInput);
  const message = applicationTelegramMessage(payload, { application_id: "mmsapp_1234567890abcdef12345678" });
  assert.match(message, /mmsapp_1234567890abcdef12345678/);
  assert.match(message, /CALL_AND_MEET/);
  assert.match(message, /กรุงเทพมหานคร/);
  assert.equal(message.includes(payload.phone), false);
  assert.equal(message.includes(payload.line_id), false);
  assert.equal(message.includes(payload.sexual_orientation), false);
});

test("application rejects orientation without separate consent", () => {
  assert.throws(() => applicationPayload({ ...applicationInput, sensitive_consent: false }), /sensitive_consent is required/);
});

test("application requires contact, one to eight skills, and conditional references", () => {
  assert.throws(() => applicationPayload({ ...applicationInput, phone: "", line_id: "" }), /phone or line_id is required/);
  assert.throws(() => applicationPayload({ ...applicationInput, skills: [] }), /skills must contain 1-8/);
  assert.throws(() => applicationPayload({ ...applicationInput, spa_name: "" }), /spa_name is required/);
  assert.throws(() => applicationPayload({ ...applicationInput, worked_at_spa_before: false, worked_independently_before: true, independent_social: "" }), /independent_social is required/);
});

test("application rejects every unrecognized field", () => {
  assert.throws(() => applicationPayload({ ...applicationInput, private_note: "do not accept" }), /unsupported fields: private_note/);
});

test("prebooking remains limited to one to six requested service skills", () => {
  const payload = prebookingPayload({
    idempotency_key: "prebook-001",
    member_ref: "member_001",
    recipient_gender: "female",
    zone: "sukhumvit",
    service_date: "2026-09-10",
    service_time: "19:30",
    duration_minutes: 90,
    skills: ["aroma_therapy_oil", "women_massage"],
    requested_therapist_ids: ["mms_001"],
  });
  assert.equal(payload.recipient_gender, "ผู้หญิง");
  assert.throws(() => prebookingPayload({
    ...payload,
    idempotency_key: "prebook-002",
    skills: catalog().skills.slice(0, 7).map((item) => item.code),
  }), /1-6/);
});

test("matching uses customer scope, zone and selected skills without leaking sensitive data", () => {
  const records = [{
    id: "rec001",
    fields: {
      "Therapist ID": "mms_001",
      "Display Name": "Therapist One",
      "Gender Identity": "ชาย",
      "Customer Gender Scope": "ได้ทั้งคู่",
      "Verified Skills": ["Aroma Therapy Oil Massage", "Women Massage"],
      "Base Zone": "Sukhumvit",
      "Coverage Zones": ["Sathorn / Silom"],
      "Availability Status": "Available",
      "Matching Enabled": true,
      "Manual Review Only": false,
      "Public Photo URL": "https://example.com/mms-001.webp",
      Status: "Active",
      "Sexual Orientation": "must never leak",
    },
  }];
  const result = matchTherapists(records, {
    recipient_gender: "ผู้หญิง",
    zone: "sukhumvit",
    skills: ["aroma_therapy_oil", "women_massage"],
  });
  assert.equal(result.matches.length, 1);
  assert.equal(Object.hasOwn(result.matches[0], "gender_identity"), false);
  assert.equal(JSON.stringify(result).includes("Sexual Orientation"), false);
});

test("non-binary or undisclosed recipient gender routes to manual coordination", () => {
  const result = matchTherapists([], {
    recipient_gender: "ไม่ประสงค์ระบุ",
    zone: "sukhumvit",
    skills: ["thai_massage"],
  });
  assert.equal(result.requires_manual_coordination, true);
});

test("upload grant accepts profile, additional photos and certificates with image safety", () => {
  const base = {
    application_ref: "mmsapp_1234567890abcdef12345678",
    application_token: "A".repeat(43),
    filename: "profile.webp",
    content_type: "image/webp",
    size: 200000,
  };
  assert.equal(uploadRequest({ ...base, kind: "profile_photo" }).kind, "profile_photo");
  assert.equal(uploadRequest({ ...base, kind: "additional_photo" }).kind, "additional_photo");
  assert.equal(uploadRequest({ ...base, kind: "certificate", filename: "cert.pdf", content_type: "application/pdf" }).kind, "certificate");
  assert.throws(() => uploadRequest({ ...base, kind: "additional_photo", filename: "extra.pdf", content_type: "application/pdf" }), /additional_photo must be an image/);
});

test("public route source keeps canonical statuses, CORS origins, and private object keys internal", async () => {
  const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /application_ref: applicationId/);
  assert.match(source, /application_token: applicationToken/);
  assert.match(source, /IDEMPOTENCY_CONFLICT/);
  assert.match(source, /https:\/\/mmdbkk\.com,https:\/\/www\.mmdbkk\.com,https:\/\/mmdprive\.webflow\.io/);
  const publicUploadResponse = source.slice(source.indexOf("async function handleUpload("), source.indexOf("async function handleMatching("));
  assert.doesNotMatch(publicUploadResponse, /object_key:/);
});
