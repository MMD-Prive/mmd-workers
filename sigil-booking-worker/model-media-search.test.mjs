import test from "node:test";
import assert from "node:assert/strict";
import worker, { fetchPublicModelMedia, isPublicMedia } from "./src/model-image-policy-worker.js";

const modelId = "recModel000000001";
const mediaId = `media_${"a".repeat(32)}`;

test("SIGIL hydrates MMD MODEL primary image, public gallery and intro clips only", async () => {
  const records = [
    item("main", { asset_role: "profile_main", media_type: "profile_photo" }),
    item("gallery", { asset_role: "gallery_candidate", media_type: "public_gallery" }),
    item("clip", { asset_role: "intro_video_candidate", media_type: "intro_video", file_type: "video/mp4" }),
    item("private", { asset_role: "private_gallery", media_type: "private_gallery" }),
    item("unsafe", { asset_role: "gallery_candidate", media_type: "public_gallery", public_safe: false }),
  ];
  const originalFetch = globalThis.fetch;
  const formulas = [];
  globalThis.fetch = async (input) => {
    formulas.push(new URL(input).searchParams.get("filterByFormula"));
    return Response.json({ records });
  };
  try {
    const grouped = await fetchPublicModelMedia({ AIRTABLE_API_KEY: "key", AIRTABLE_BASE_ID: "base" }, [{ model_id: modelId, working_name: "EMs21 J Dye" }]);
    assert.deepEqual(formulas, ['OR(FIND("EMs21 J Dye",ARRAYJOIN({Model})))']);
    const assets = grouped.get(modelId);
    assert.equal(assets.primary.asset_role, "profile_main");
    assert.deepEqual(assets.photos.map((photo) => photo.media_id), ["gallery"]);
    assert.deepEqual(assets.clips.map((clip) => clip.media_id), ["clip"]);
    assert.equal(assets.clips[0].url, `https://sigil.mmdbkk.com/sigil/api/models/media/clip`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public media gate rejects private, pending and unsafe registry records", () => {
  const base = {
    media_type: "public_gallery",
    asset_role: "gallery_candidate",
    media_visibility: "public_candidate",
    review_status: "active",
    public_safe: true,
    private_original_key: "models/model/public_gallery/image.webp",
  };
  assert.equal(isPublicMedia(base), true);
  assert.equal(isPublicMedia({ ...base, media_type: "private_gallery" }), false);
  assert.equal(isPublicMedia({ ...base, review_status: "pending_review" }), false);
  assert.equal(isPublicMedia({ ...base, public_safe: false }), false);
  assert.equal(isPublicMedia({ ...base, media_visibility: "private_candidate" }), false);
});

test("public media route streams only eligible assets and honors video byte ranges", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async () => Response.json({ records: [{ fields: {
    media_id: mediaId,
    media_type: "intro_video",
    asset_role: "intro_video_candidate",
    media_visibility: "public_candidate",
    review_status: "active",
    public_safe: true,
    private_original_key: "models/model/intro_video/clip.mp4",
    file_type: "video/mp4",
    file_size_bytes: 100,
  } }] });
  try {
    const request = new Request(`https://sigil.mmdbkk.com/sigil/api/models/media/${mediaId}`, { headers: { range: "bytes=0-9", origin: "https://mmdbkk.com" } });
    const response = await worker.fetch(request, {
      AIRTABLE_API_KEY: "key",
      AIRTABLE_BASE_ID: "base",
      ALLOWED_ORIGINS: "https://mmdbkk.com",
      MMD_MODEL_ASSETS: { get: async (key, options) => {
        calls.push({ key, options });
        return { body: new Uint8Array(10), size: 100, httpMetadata: { contentType: "video/mp4" } };
      } },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), "bytes 0-9/100");
    assert.equal(response.headers.get("access-control-allow-origin"), "https://mmdbkk.com");
    assert.equal(calls[0].key, "models/model/intro_video/clip.mp4");
    assert.deepEqual(calls[0].options, { range: { offset: 0, length: 10 } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function item(id, overrides) {
  return { fields: {
    Model: [modelId],
    media_id: id,
    media_type: "public_gallery",
    asset_role: "gallery_candidate",
    media_visibility: "public_candidate",
    review_status: "active",
    public_safe: true,
    private_original_key: `models/${modelId}/asset/${id}.webp`,
    file_type: id === "clip" ? "video/mp4" : "image/webp",
    ...overrides,
  } };
}
