import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const doc = await readFile(new URL("./MMD_NON_MEMBER_PROFILE_IMAGE_CONSENT_V1.md", import.meta.url), "utf8");
const catalog = await readFile(new URL("../../sigil-booking-worker/src/public-profiles-catalog.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../../webflow/apply/public-model/non-member-image-consent-v1.html", import.meta.url), "utf8");

const VERSION = "mmd-public-promo-consent-v1-20260922";

 test("consent is separate from application, role and media approval", () => {
  assert.match(doc, /four separate authorities/);
  assert.match(doc, /is optional and must not affect application acceptance/);
  assert.match(doc, /intersection of applicant-consented Roles and MMD Approved Public Roles/);
  assert.match(doc, /does not approve a photo/);
});

test("legacy profiles fail closed and withdrawal remains available", () => {
  assert.match(doc, /Existing profiles are not backfilled into consent/);
  assert.match(doc, /No prior photo upload, prior public listing, application consent/);
  assert.match(doc, /https:\/\/t\.me\/mmdapply/);
  assert.match(catalog, /promo_consent_revoked_at/);
  assert.match(catalog, /validPublicPromoConsent/);
});

test("catalog locks the current consent version and role intersection", () => {
  assert.match(catalog, new RegExp(VERSION));
  assert.match(catalog, /approvedRoles\.filter\(\(role\) => promoRoles\.includes\(role\)\)/);
  assert.match(catalog, /audience_visibility: "non_member_consented"/);
  assert.match(catalog, /public_profile_approved !== true \|\| !validPublicPromoConsent/);
});

test("application UI makes consent optional, scoped and withdrawable", () => {
  assert.match(ui, /OPTIONAL · PUBLIC IMAGE CONSENT/);
  assert.match(ui, /ไม่กระทบผลสมัคร/);
  assert.match(ui, /data-check="public_photo_consent"/);
  assert.equal((ui.match(/data-check="promo_roles"/g) || []).length, 11);
  assert.match(ui, /ถอนความยินยอมภายหลัง/);
  assert.match(ui, /https:\/\/t\.me\/mmdapply/);
});

test("consent never changes Public versus Private money classification", () => {
  assert.match(doc, /Image consent never changes `model_work_lane`/);
  assert.match(doc, /public_model/);
  assert.match(doc, /private_model/);
  assert.match(doc, /needs_review/);
});
