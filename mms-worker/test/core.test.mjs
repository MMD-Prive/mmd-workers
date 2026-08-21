import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationAirtableFields,
  applicationPayload,
  catalog,
  matchTherapists,
  prebookingPayload,
  sensitiveAirtableFields,
  uploadRequest,
} from "../src/core.mjs";

const applicationInput = {
  idempotency_key: "mms-form-001",
  applicant_name: "Therapist Test",
  nickname: "Test",
  phone: "0812345678",
  line_id: "therapist.test",
  gender_identity: "male",
  customer_gender_scope: "both",
  skills: ["aroma_therapy_oil", "thai_massage"],
  experience_years: 2,
  experience_months: 6,
  strengths: "Calm and professional",
  worked_at_spa_before: true,
  spa_name: "Example Spa",
  worked_independently_before: false,
  independent_social: "",
  base_zone: "sukhumvit",
  coverage_zones: ["sukhumvit", "sathorn_silom"],
  general_consent: true,
  sexual_orientation: "gay",
  sensitive_consent: true,
  consent_notice_version: "mms-sensitive-v1",
  language: "th",
};

test("catalog exposes exactly eight stable skills", () => {
  const data = catalog();
  assert.equal(data.skills.length, 8);
  assert.equal(data.max_selected_skills, 6);
  assert.deepEqual(data.skills.map((item) => item.code), [
    "aroma_therapy_oil",
    "thai_massage",
    "sport_massage",
    "office_syndrome",
    "health_fitness_advisor",
    "thai_herbal_compress",
    "partner_present",
    "women_massage",
  ]);
});

test("application keeps orientation only in the sensitive record", () => {
  const payload = applicationPayload(applicationInput);
  const applicationFields = applicationAirtableFields(payload, {
    application_id: "mmsapp_1234567890abcdef12345678",
    submitted_at: "2026-08-22T08:00:00.000Z",
  });
  const sensitiveFields = sensitiveAirtableFields(payload, {
    application_id: "mmsapp_1234567890abcdef12345678",
    submitted_at: "2026-08-22T08:00:00.000Z",
  });

  assert.equal(applicationFields["Customer Gender Scope"], "ได้ทั้งคู่");
  assert.equal(Object.hasOwn(applicationFields, "Sexual Orientation"), false);
  assert.equal(applicationFields["Payload JSON"].includes("sexual_orientation"), false);
  assert.equal(sensitiveFields["Sexual Orientation"], "ชายรักชาย — Gay");
  assert.equal(sensitiveFields["Customer Visible"], false);
  assert.equal(sensitiveFields["Booking API Allowed"], false);
});

test("application rejects orientation without separate consent", () => {
  assert.throws(
    () => applicationPayload({ ...applicationInput, sensitive_consent: false }),
    /sensitive_consent is required/,
  );
});

test("prebooking accepts one to six skills and requires recipient gender", () => {
  const payload = prebookingPayload({
    idempotency_key: "prebook-001",
    member_ref: "member_001",
    recipient_gender: "female",
    zone: "sukhumvit",
    service_date: "2026-08-30",
    service_time: "19:30",
    duration_minutes: 90,
    skills: ["aroma_therapy_oil", "women_massage"],
    requested_therapist_ids: ["mms_001"],
  });
  assert.equal(payload.recipient_gender, "ผู้หญิง");
  assert.deepEqual(payload.skills, ["aroma_therapy_oil", "women_massage"]);
  assert.throws(() => prebookingPayload({
    ...payload,
    idempotency_key: "prebook-002",
    skills: catalog().skills.slice(0, 7).map((item) => item.code),
  }), /1-6/);
});

test("matching uses recipient gender, zone and every selected skill", () => {
  const records = [
    {
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
    },
    {
      id: "rec002",
      fields: {
        "Therapist ID": "mms_002",
        "Display Name": "Therapist Two",
        "Customer Gender Scope": "ผู้ชาย",
        "Verified Skills": ["Aroma Therapy Oil Massage", "Women Massage"],
        "Base Zone": "Sukhumvit",
        "Coverage Zones": [],
        "Availability Status": "Available",
        "Matching Enabled": true,
        "Manual Review Only": false,
        Status: "Active",
      },
    },
  ];
  const result = matchTherapists(records, {
    recipient_gender: "ผู้หญิง",
    zone: "sukhumvit",
    skills: ["aroma_therapy_oil", "women_massage"],
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].therapist_id, "mms_001");
  assert.equal(Object.hasOwn(result.matches[0], "gender_identity"), false);
  assert.equal(Object.hasOwn(result.matches[0], "customer_gender_scope"), false);
  assert.equal(JSON.stringify(result).includes("Sexual Orientation"), false);
});

test("non-binary or undisclosed recipient gender routes to manual coordination", () => {
  const result = matchTherapists([], {
    recipient_gender: "ไม่ประสงค์ระบุ",
    zone: "sukhumvit",
    skills: ["thai_massage"],
  });
  assert.equal(result.requires_manual_coordination, true);
  assert.deepEqual(result.matches, []);
});

test("upload grant accepts private image and certificate types only", () => {
  const image = uploadRequest({
    application_ref: "mmsapp_1234567890abcdef12345678",
    application_token: "A".repeat(43),
    kind: "profile_photo",
    filename: "profile.webp",
    content_type: "image/webp",
    size: 200000,
  });
  assert.equal(image.kind, "profile_photo");
  assert.throws(() => uploadRequest({
    ...image,
    application_token: "A".repeat(43),
    kind: "profile_photo",
    filename: "profile.pdf",
    content_type: "application/pdf",
  }), /profile_photo must be an image/);
});
