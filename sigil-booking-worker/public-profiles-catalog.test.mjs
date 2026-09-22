import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicCatalog, handlePublicProfilesCatalogRequest } from "./src/public-profiles-catalog.js";

const CONSENT_VERSION = "mmd-public-promo-consent-v1-20260922";

function eligible(genders=["male","female"], roles=["everyday_companion"], overrides={}) {
  return {
    genders,
    roles,
    promo_roles: [...roles],
    booking_mode: "curated",
    public_profile_approved: true,
    credential_status: "not_required",
    nonmember_image_consent: true,
    promo_consent_status: "granted",
    promo_consent_at: "2026-09-22T09:00:00.000Z",
    promo_consent_version: CONSENT_VERSION,
    promo_consent_source: "/apply/public-model",
    promo_consent_revoked_at: "",
    ...overrides,
  };
}

test("catalog publishes only approved and consented public images inside Public Model", () => {
  const eligibilityBySlug = new Map([["hito", eligible()]]);
  const items = buildPublicCatalog([
    { key: "MMD Public Models/HITO/profile/card.webp" },
    { key: "MMD Public Models/HITO/gallery/02.jpg" },
    { key: "Private/HITO/secret.webp" },
    { key: "MMD Public Models/private/secret.webp" },
    { key: "MMD Public Models/HITO/notes.pdf" },
  ], { eligibilityBySlug });
  assert.equal(items.length, 1);
  assert.equal(items[0].display_name, "HITO");
  assert.equal(items[0].image_url, "https://models.mmdbkk.com/MMD%20Public%20Models/HITO/profile/card.webp");
  assert.deepEqual(items[0].approved_roles, ["everyday_companion"]);
  assert.equal(items[0].audience_visibility, "non_member_consented");
  assert.equal("r2_key" in items[0], false);
  assert.equal(JSON.stringify(items).includes("secret"), false);
  assert.equal(JSON.stringify(items).includes(CONSENT_VERSION), false);
});

test("catalog groups model folders and requires explicit eligibility per model", () => {
  const eligibilityBySlug = new Map([
    ["model-a", eligible(["male"], ["driver_companion"])],
    ["model-b", eligible(["female"], ["social_appearance"])],
  ]);
  const items = buildPublicCatalog([
    { key: "MMD Public Models/MMD Travel Models/Straight/model-a/03.webp" },
    { key: "MMD Public Models/MMD Travel Models/Straight/model-a/cover.webp" },
    { key: "MMD Public Models/MMD Travel Models/Straight/model-b/main.png" },
    { key: "MMD Public Models/MMD Travel Models/Straight/legacy/main.png" },
  ], { eligibilityBySlug });
  assert.deepEqual(items.map((item) => item.display_name), ["model a", "model b"]);
  assert.match(items[0].image_url, /cover\.webp$/);
  assert.equal(items.some((item) => item.slug === "legacy"), false);
});

test("catalog fails closed when there is no approved role matrix", () => {
  const items = buildPublicCatalog([
    { key: "MMD Public Models/HIMA/card.webp" },
  ]);
  assert.deepEqual(items, []);
});

test("catalog fails closed for empty customer scope or empty approved roles", () => {
  const eligibilityBySlug = new Map([
    ["no-gender", eligible([], ["everyday_companion"])],
    ["no-role", eligible(["male"], [], { promo_roles: [] })],
  ]);
  const items = buildPublicCatalog([
    { key: "MMD Public Models/no-gender/card.webp" },
    { key: "MMD Public Models/no-role/card.webp" },
  ], { eligibilityBySlug });
  assert.deepEqual(items, []);
});

test("non-member image exposure fails closed without current explicit consent", () => {
  const eligibilityBySlug = new Map([
    ["no-consent", eligible(["male"], ["everyday_companion"], { nonmember_image_consent: false })],
    ["not-granted", eligible(["male"], ["everyday_companion"], { promo_consent_status: "not_granted" })],
    ["revoked", eligible(["male"], ["everyday_companion"], { promo_consent_status: "revoked", promo_consent_revoked_at: "2026-09-22T10:00:00.000Z" })],
    ["old-version", eligible(["male"], ["everyday_companion"], { promo_consent_version: "legacy-v0" })],
    ["no-time", eligible(["male"], ["everyday_companion"], { promo_consent_at: "" })],
    ["unknown-source", eligible(["male"], ["everyday_companion"], { promo_consent_source: "browser_guess" })],
  ]);
  const items = buildPublicCatalog([
    { key: "MMD Public Models/no-consent/card.webp" },
    { key: "MMD Public Models/not-granted/card.webp" },
    { key: "MMD Public Models/revoked/card.webp" },
    { key: "MMD Public Models/old-version/card.webp" },
    { key: "MMD Public Models/no-time/card.webp" },
    { key: "MMD Public Models/unknown-source/card.webp" },
  ], { eligibilityBySlug });
  assert.deepEqual(items, []);
});

test("catalog exposes only the intersection of applicant-consented and MMD-approved roles", () => {
  const eligibilityBySlug = new Map([
    ["scoped-model", eligible(["male"], ["driver_companion", "nightlife_companion"], { promo_roles: ["driver_companion"] })],
    ["no-intersection", eligible(["female"], ["culinary_companion"], { promo_roles: ["creative_companion"] })],
  ]);
  const items = buildPublicCatalog([
    { key: "MMD Public Models/scoped-model/card.webp" },
    { key: "MMD Public Models/no-intersection/card.webp" },
  ], { eligibilityBySlug });
  assert.deepEqual(items.map((item) => item.slug), ["scoped-model"]);
  assert.deepEqual(items[0].approved_roles, ["driver_companion"]);
});

test("medical professional role requires verified credential after consent scope intersection", () => {
  const eligibilityBySlug = new Map([
    ["pending-medical", eligible(["male"], ["medical_professional"], { credential_status: "pending" })],
    ["verified-medical", eligible(["female"], ["medical_professional"], { credential_status: "verified" })],
  ]);
  const items = buildPublicCatalog([
    { key: "MMD Public Models/pending-medical/card.webp" },
    { key: "MMD Public Models/verified-medical/card.webp" },
  ], { eligibilityBySlug });
  assert.deepEqual(items.map((item) => item.slug), ["verified-medical"]);
});

test("handler exposes only accepted, approved, publication-approved and explicitly consented applications", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    records: [
      { fields: {
        fldY8Jf7H70Tn1S93: "hidden-model",
        fldEkwim5KmCjA4rg: ["ผู้ชาย"],
        fldInXMklAz53CiCq: "accepted",
        fldHk2h9Rf6g5UlZw: "approved",
        fldz20JiFUK9ubk1c: ["driver_companion"],
        fldjo1NpDcB0JXk91: "curated",
        fldcnCF3KrdAd4cfa: false,
        fldFM8T50S1zObdVP: "not_required",
        fldUMJEUVK3GNmomA: true,
        fldQgqdiVPTMRfawj: ["driver_companion"],
        fldsD2K6T1UGyggvp: "granted",
        fld8M8tXWQsDpsouB: "2026-09-22T09:00:00.000Z",
        fldbI0gUNjwtIUXd2: CONSENT_VERSION,
        fldB5TqIGAOvF01uj: "/apply/public-model",
      } },
      { fields: {
        fldY8Jf7H70Tn1S93: "old-no-consent",
        fldEkwim5KmCjA4rg: ["ผู้หญิง"],
        fldInXMklAz53CiCq: "accepted",
        fldHk2h9Rf6g5UlZw: "approved",
        fldz20JiFUK9ubk1c: ["social_appearance"],
        fldjo1NpDcB0JXk91: "curated",
        fldcnCF3KrdAd4cfa: true,
        fldFM8T50S1zObdVP: "not_required",
      } },
      { fields: {
        fldY8Jf7H70Tn1S93: "approved-model",
        fldEkwim5KmCjA4rg: ["ผู้หญิง"],
        fldInXMklAz53CiCq: "accepted",
        fldHk2h9Rf6g5UlZw: "approved",
        fldz20JiFUK9ubk1c: ["social_appearance", "nightlife_companion"],
        fldjo1NpDcB0JXk91: "brief_only",
        fldcnCF3KrdAd4cfa: true,
        fldFM8T50S1zObdVP: "not_required",
        fldUMJEUVK3GNmomA: true,
        fldQgqdiVPTMRfawj: ["social_appearance"],
        fldsD2K6T1UGyggvp: "granted",
        fld8M8tXWQsDpsouB: "2026-09-22T09:00:00.000Z",
        fldbI0gUNjwtIUXd2: CONSENT_VERSION,
        fldB5TqIGAOvF01uj: "/apply/public-model",
      } },
      { fields: {
        fldY8Jf7H70Tn1S93: "payload-consent-model",
        fldEkwim5KmCjA4rg: ["ผู้ชาย"],
        fldInXMklAz53CiCq: "accepted",
        fldHk2h9Rf6g5UlZw: "approved",
        fldRs4JdlxOdtlqp9: "2026-09-22T09:10:00.000Z",
        fldJ9ldETtMF2Qbqf: JSON.stringify({
          mmd_nonmember_profile_image_consent: true,
          mmd_nonmember_promo_roles: ["culinary_companion"],
          mmd_public_promo_consent_version: CONSENT_VERSION,
        }),
        fldz20JiFUK9ubk1c: ["culinary_companion"],
        fldjo1NpDcB0JXk91: "curated",
        fldcnCF3KrdAd4cfa: true,
        fldFM8T50S1zObdVP: "not_required",
      } },
    ],
  }), { headers: { "content-type": "application/json" } });
  try {
    const env = {
      AIRTABLE_API_KEY: "test",
      AIRTABLE_BASE_ID: "app-test",
      ALLOWED_ORIGINS: "https://mmdbkk.com",
      MMD_MODEL_ASSETS: { async list() { return { objects: [
        { key: "MMD Public Models/hidden-model/card.webp" },
        { key: "MMD Public Models/old-no-consent/card.webp" },
        { key: "MMD Public Models/approved-model/card.webp" },
        { key: "MMD Public Models/payload-consent-model/card.webp" },
      ], truncated: false }; } },
    };
    const response = await handlePublicProfilesCatalogRequest(new Request(
      "https://sigil.mmdbkk.com/sigil/api/models/search/public-catalog",
      { headers: { Origin: "https://mmdbkk.com" } },
    ), env);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://mmdbkk.com");
    assert.deepEqual(payload.items.map((item) => item.slug), ["approved-model", "payload-consent-model"]);
    assert.deepEqual(payload.items[0].approved_roles, ["social_appearance"]);
    assert.equal(payload.items[0].booking_mode, "brief_only");
    assert.equal(payload.items[0].customer_scope, "female_only");
    assert.deepEqual(payload.items[1].approved_roles, ["culinary_companion"]);
    assert.equal(payload.items[1].customer_scope, "male_only");
    assert.equal(JSON.stringify(payload).includes("old-no-consent"), false);
    assert.equal(JSON.stringify(payload).includes("r2_key"), false);
    assert.equal(JSON.stringify(payload).includes("bucket"), false);
    assert.equal(JSON.stringify(payload).includes("promo_consent_at"), false);
    assert.equal(JSON.stringify(payload).includes(CONSENT_VERSION), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
