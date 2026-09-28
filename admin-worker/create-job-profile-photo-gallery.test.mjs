import test from "node:test";
import assert from "node:assert/strict";
import { modelProfilePhotoUrls } from "./src/index.js";

test("model Profile Photo gallery is deduped and capped at 8", () => {
  const profile = Array.from({ length: 9 }, (_, i) => ({
    id: `attModel${i + 1}`,
    url: `https://cdn.example/model-${i + 1}.jpg`,
    filename: `model-${i + 1}.jpg`,
  }));
  const urls = modelProfilePhotoUrls({
    profile_photo: profile,
    "Public Image URL": "https://cdn.example/model-1.jpg",
  });
  assert.equal(urls.length, 8);
  assert.equal(urls[0], "https://cdn.example/model-1.jpg");
  assert.equal(urls.at(-1), "https://cdn.example/model-8.jpg");
});

test("model public image is used when profile_photo is empty", () => {
  assert.deepEqual(
    modelProfilePhotoUrls({ "Public Image URL": "https://cdn.example/fallback.jpg" }),
    ["https://cdn.example/fallback.jpg"],
  );
});
