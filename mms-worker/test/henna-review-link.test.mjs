import assert from "node:assert/strict";
import test from "node:test";
import { applicationPayload, applicationTelegramMessage } from "../src/core.mjs";

const input = {
  idempotency_key: "henna-review-link-test",
  applicant_name: "Private Applicant Name",
  nickname: "Private Nickname",
  phone: "0812345678",
  line_id: "private.line",
  gender_identity: "male",
  customer_gender_scope: "both",
  skills: ["aroma_therapy_oil"],
  experience_years: 0,
  experience_months: 0,
  strengths: "private strengths",
  worked_at_spa_before: false,
  worked_independently_before: false,
  current_profession: "Private profession",
  qualification_note: "private qualification",
  work_base_area: "Private area",
  mobility_scope: "local",
  coverage_area_note: "",
  general_consent: true,
  sensitive_consent: false,
  language: "th",
};

test("HENNA application alert links directly to the exact MMS applicant on canonical www host", () => {
  const applicationId = "mmsapp_1234567890abcdef12345678";
  const payload = applicationPayload(input);
  const message = applicationTelegramMessage(payload, { application_id: applicationId });

  assert.match(
    message,
    new RegExp(`https://www\\.mmdbkk\\.com/internal/admin/mms\\?tab=applications&application_id=${applicationId}`),
  );
  assert.match(message, /Status: New \/ Needs Review/);
  assert.doesNotMatch(message, /Airtable/i);
  assert.equal(message.includes(payload.applicant_name), false);
  assert.equal(message.includes(payload.phone), false);
  assert.equal(message.includes(payload.line_id), false);
  assert.equal(message.includes(payload.work_base_area), false);
});
