import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicCatalog, handlePublicProfilesCatalogRequest } from "./src/public-profiles-catalog.js";

const VERSION = "mmd-public-promo-consent-v1-20260922";

test("reviewed dedicated consent state overrides an older payload consent", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ records: [{ fields: {
    fldY8Jf7H70Tn1S93: "revoked-by-checkbox",
    fldEkwim5KmCjA4rg: ["ผู้ชาย"],
    fldInXMklAz53CiCq: "accepted",
    fldHk2h9Rf6g5UlZw: "approved",
    fldRs4JdlxOdtlqp9: "2026-09-22T09:10:00.000Z",
    fldJ9ldETtMF2Qbqf: JSON.stringify({
      mmd_nonmember_profile_image_consent: true,
      mmd_nonmember_promo_roles: ["driver_companion"],
      mmd_public_promo_consent_version: VERSION,
    }),
    fldz20JiFUK9ubk1c: ["driver_companion"],
    fldjo1NpDcB0JXk91: "curated",
    fldcnCF3KrdAd4cfa: true,
    fldFM8T50S1zObdVP: "not_required",
    fldUMJEUVK3GNmomA: false,
    fldQgqdiVPTMRfawj: ["driver_companion"],
    fldsD2K6T1UGyggvp: "granted",
    fld8M8tXWQsDpsouB: "2026-09-22T10:00:00.000Z",
    fldbI0gUNjwtIUXd2: VERSION,
    fldB5TqIGAOvF01uj: "mmd_model_authenticated",
  } }] });
  try {
    const response = await handlePublicProfilesCatalogRequest(new Request(
      "https://sigil.mmdbkk.com/sigil/api/models/search/public-catalog",
      { headers: { Origin: "https://mmdbkk.com" } },
    ), {
      AIRTABLE_API_KEY: "test",
      AIRTABLE_BASE_ID: "app-test",
      ALLOWED_ORIGINS: "https://mmdbkk.com",
      MMD_MODEL_ASSETS: { async list() { return { objects: [
        { key: "MMD Public Models/revoked-by-checkbox/card.webp" },
      ], truncated: false }; } },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload.items, []);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});


test("public catalog exposes only a boolean teaser discovery marker", () => {
  const eligibility = new Map([["teaser-ready", {
    genders:["male"], roles:["driver_companion"], promo_roles:["driver_companion"], booking_mode:"curated",
    public_profile_approved:true, public_image_approved:true, credential_status:"not_required",
    nonmember_image_consent:true, promo_consent_status:"granted", promo_consent_at:"2026-09-22T10:00:00.000Z",
    promo_consent_version:VERSION, promo_consent_source:"mmd_model_authenticated", promo_consent_revoked_at:"",
  }]]);
  const items = buildPublicCatalog([{ key:"MMD Public Models/teaser-ready/card.webp" }], {
    eligibilityBySlug:eligibility,
    teaserBySlug:new Set(["teaser-ready"]),
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].private_teaser_available, true);
  assert.deepEqual(Object.keys(items[0]).filter((key) => /asset|storage|url|count|grant|media/i.test(key)), ["image_url"]);
});

test("public catalog does not claim teaser availability without backend metadata", () => {
  const eligibility = new Map([["no-teaser", {
    genders:["male"], roles:["driver_companion"], promo_roles:["driver_companion"], booking_mode:"curated",
    public_profile_approved:true, public_image_approved:true, credential_status:"not_required",
    nonmember_image_consent:true, promo_consent_status:"granted", promo_consent_at:"2026-09-22T10:00:00.000Z",
    promo_consent_version:VERSION, promo_consent_source:"mmd_model_authenticated", promo_consent_revoked_at:"",
  }]]);
  const items = buildPublicCatalog([{ key:"MMD Public Models/no-teaser/card.webp" }], { eligibilityBySlug:eligibility });
  assert.equal(items.length, 1);
  assert.equal(Object.hasOwn(items[0], "private_teaser_available"), false);
});
