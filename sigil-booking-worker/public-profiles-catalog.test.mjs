import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicCatalog, handlePublicProfilesCatalogRequest } from "./public-profiles-catalog.js";

test("catalog publishes only images inside Public Model", () => {
  const items = buildPublicCatalog([
    { key: "Public Model/HITO/profile/card.webp" },
    { key: "Public Model/HITO/gallery/02.jpg" },
    { key: "Private/HITO/secret.webp" },
    { key: "Public Model/private/secret.webp" },
    { key: "Public Model/HITO/notes.pdf" },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].display_name, "HITO");
  assert.equal(items[0].image_url, "https://models.mmdbkk.com/Public%20Model/HITO/profile/card.webp");
  assert.equal("r2_key" in items[0], false);
  assert.equal(JSON.stringify(items).includes("secret"), false);
});

test("catalog groups simple model folders and prefers a cover image", () => {
  const items = buildPublicCatalog([
    { key: "Public Model/model-a/03.webp" },
    { key: "Public Model/model-a/cover.webp" },
    { key: "Public Model/model-b/main.png" },
  ]);
  assert.deepEqual(items.map((item) => item.display_name), ["model a", "model b"]);
  assert.match(items[0].image_url, /cover\.webp$/);
});

test("handler lists R2 without exposing object keys or bucket metadata", async () => {
  const env = {
    ALLOWED_ORIGINS: "https://mmdbkk.com",
    MMD_MODEL_ASSETS: { async list() { return { objects: [{ key: "Public Model/HIMA/card.webp" }], truncated: false }; } },
  };
  const response = await handlePublicProfilesCatalogRequest(new Request("https://sigil.mmdbkk.com/sigil/api/models/public-catalog", { headers: { Origin: "https://mmdbkk.com" } }), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://mmdbkk.com");
  assert.equal(payload.items[0].display_name, "HIMA");
  assert.equal(JSON.stringify(payload).includes("r2_key"), false);
  assert.equal(JSON.stringify(payload).includes("bucket"), false);
});
