import assert from "node:assert/strict";
import test from "node:test";
import { applicationPayload, applicationTelegramMessage } from "../src/core.mjs";

const input = {
  idempotency_key: "henna-review-link-v4-test",
  applicant_name: "Private Applicant Name",
  nickname: "Applicant",
  phone: "0812345678",
  line_id: "private.line",
  age: 28,
  height_cm: 180,
  weight_kg: 76,
  home_province: "ขอนแก่น",
  residence_province: "กรุงเทพมหานคร",
  residence_area: "ลาดพร้าว",
  gender_identity: "male",
  customer_gender_scope: "both",
  skills: ["aroma_therapy_oil"],
  experience_years: 0,
  experience_months: 0,
  strengths: "private strengths",
  has_massage_experience: false,
  professional_massage_experience: false,
  experience_background: "no_experience",
  worked_at_spa_before: false,
  worked_independently_before: false,
  partner_present_experience: false,
  work_preference: "mms_mobile_online",
  languages: ["th"],
  availability_summary: ["weekend_evening"],
  lead_time_preference: "one_day",
  transport_modes: ["public_transit"],
  preferred_contact: "line",
  preferred_contact_time: "evening",
  workshop_interest: "ready",
  motivation: "Interested in MMS",
  current_profession: "Private profession",
  qualification_note: "",
  work_base_area: "กรุงเทพมหานคร",
  mobility_scope: "local",
  coverage_area_note: "",
  general_consent: true,
  sexual_orientation: "gay",
  sensitive_consent: true,
  consent_notice_version: "mms-sensitive-v2",
  language: "th",
};

test("HENNA application alert links directly to the exact applicant and keeps sensitive orientation out", () => {
  const applicationId = "mmsapp_1234567890abcdef12345678";
  const payload = applicationPayload(input);
  const message = applicationTelegramMessage(payload, { application_id: applicationId });

  assert.match(message, new RegExp(`https://www\\.mmdbkk\\.com/internal/admin/mms\\?tab=applications&application_id=${applicationId}`));
  assert.match(message, /Status: New \/ Needs Review/);
  assert.match(message, /Recommended Route: WORKSHOP/);
  assert.match(message, /Applicant · 28 \/ 180 \/ 76/);
  assert.doesNotMatch(message, /Airtable/i);
  assert.equal(message.includes(payload.phone), false);
  assert.equal(message.includes(payload.line_id), false);
  assert.equal(message.includes(payload.sexual_orientation), false);
});
