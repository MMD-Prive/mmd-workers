import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicCatalog, handlePublicProfilesCatalogRequest } from "./src/public-profiles-catalog.js";

test("catalog publishes only images inside Public Model", () => {
  const items = buildPublicCatalog([
    { key: "MMD Public Models/HITO/profile/card.webp" },
    { key: "MMD Public Models/HITO/gallery/02.jpg" },
    { key: "Private/HITO/secret.webp" },
    { key: "MMD Public Models/private/secret.webp" },
    { key: "MMD Public Models/HITO/notes.pdf" },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].display_name, "HITO");
  assert.equal(items[0].image_url, "https://models.mmdbkk.com/MMD%20Public%20Models/HITO/profile/card.webp");
  assert.equal("r2_key" in items[0], false);
  assert.equal(JSON.stringify(items).includes("secret"), false);
});

test("catalog groups simple model folders and prefers a cover image", () => {
  const items = buildPublicCatalog([
    { key: "MMD Public Models/MMD Travel Models/Straight/model-a/03.webp" },
    { key: "MMD Public Models/MMD Travel Models/Straight/model-a/cover.webp" },
    { key: "MMD Public Models/MMD Travel Models/Straight/model-b/main.png" },
  ]);
  assert.deepEqual(items.map((item) => item.display_name), ["model a", "model b"]);
  assert.match(items[0].image_url, /cover\.webp$/);
});

test("handler lists R2 without exposing object keys or bucket metadata", async () => {
  const env = {
    ALLOWED_ORIGINS: "https://mmdbkk.com",
    MMD_MODEL_ASSETS: { async list() { return { objects: [{ key: "MMD Public Models/HIMA/card.webp" }], truncated: false }; } },
  };
  const response = await handlePublicProfilesCatalogRequest(new Request("https://sigil.mmdbkk.com/sigil/api/models/search/public-catalog", { headers: { Origin: "https://mmdbkk.com" } }), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://mmdbkk.com");
  assert.equal(payload.items[0].display_name, "HIMA");
  assert.equal(JSON.stringify(payload).includes("r2_key"), false);
  assert.equal(JSON.stringify(payload).includes("bucket"), false);
});


test("catalog exposes a bounded customer-gender scope and defaults legacy folders to all genders", () => {
  const audienceBySlug = new Map([["male-one", ["male"]], ["female-one", ["female"]]]);
  const items = buildPublicCatalog([
    { key: "MMD Public Models/MMD Travel Models/Straight/male-one/card.webp" },
    { key: "MMD Public Models/MMD Travel Models/Straight/female-one/card.webp" },
    { key: "MMD Public Models/MMD Travel Models/Straight/legacy/card.webp" },
  ], { audienceBySlug });
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  assert.deepEqual(bySlug.get("male-one").accepted_customer_genders, ["male"]);
  assert.equal(bySlug.get("male-one").customer_scope, "male_only");
  assert.deepEqual(bySlug.get("female-one").accepted_customer_genders, ["female"]);
  assert.equal(bySlug.get("female-one").customer_scope, "female_only");
  assert.deepEqual(bySlug.get("legacy").accepted_customer_genders, ["male", "female"]);
  assert.equal(bySlug.get("legacy").customer_scope, "all_genders");
});

test("catalog fails closed for an approved but unsupported explicit customer scope", () => {
  const audienceBySlug = new Map([["unsupported", []]]);
  const items = buildPublicCatalog([
    { key: "MMD Public Models/MMD Travel Models/Straight/unsupported/card.webp" },
    { key: "MMD Public Models/MMD Travel Models/Straight/legacy/card.webp" },
  ], { audienceBySlug });
  assert.deepEqual(items.map((item) => item.slug), ["legacy"]);
  assert.deepEqual(items[0].accepted_customer_genders, ["male", "female"]);
});

test("handler requires both accepted review and approved intake before overriding legacy scope", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    records: [
      { fields: {
        fldY8Jf7H70Tn1S93: "rejected-model",
        fldEkwim5KmCjA4rg: ["ผู้ชาย"],
        fldInXMklAz53CiCq: "rejected",
        fldHk2h9Rf6g5UlZw: "approved",
      } },
      { fields: {
        fldY8Jf7H70Tn1S93: "approved-model",
        fldEkwim5KmCjA4rg: ["ผู้หญิง"],
        fldInXMklAz53CiCq: "accepted",
        fldHk2h9Rf6g5UlZw: "approved",
      } },
    ],
  }), { headers: { "content-type": "application/json" } });
  try {
    const env = {
      AIRTABLE_API_KEY: "test",
      AIRTABLE_BASE_ID: "app-test",
      MMD_MODEL_ASSETS: { async list() { return { objects: [
        { key: "MMD Public Models/MMD Travel Models/Straight/rejected-model/card.webp" },
        { key: "MMD Public Models/MMD Travel Models/Straight/approved-model/card.webp" },
      ], truncated: false }; } },
    };
    const response = await handlePublicProfilesCatalogRequest(new Request("https://sigil.mmdbkk.com/sigil/api/models/search/public-catalog"), env);
    const payload = await response.json();
    const bySlug = new Map(payload.items.map((item) => [item.slug, item]));
    assert.equal(bySlug.get("rejected-model").customer_scope, "all_genders");
    assert.equal(bySlug.get("approved-model").customer_scope, "female_only");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
