import test from "node:test";
import assert from "node:assert/strict";
import worker, { fetchPublicModelMedia, hydrateModelAssetPolicy, isPublicMedia } from "./src/model-image-policy-worker.js";

const modelId = "recModel000000001";
const secondModelId = "recModel000000002";
const mediaId = `media_${"a".repeat(32)}`;
const primaryMediaId = `media_${"b".repeat(32)}`;
const galleryMediaId = `media_${"c".repeat(32)}`;
const clipMediaId = `media_${"d".repeat(32)}`;
const secondPrimaryMediaId = `media_${"e".repeat(32)}`;

test("SIGIL hydrates MMD MODEL primary image, public gallery and intro clips only", async () => {
  const records = [
    item(primaryMediaId, { asset_role: "profile_main", media_type: "profile_photo" }),
    item(galleryMediaId, { asset_role: "gallery_candidate", media_type: "public_gallery" }),
    item(clipMediaId, { asset_role: "intro_video_candidate", media_type: "intro_video", file_type: "video/mp4" }),
    item(`media_${"f".repeat(32)}`, { asset_role: "private_gallery", media_type: "private_gallery" }),
    item(`media_${"1".repeat(32)}`, { asset_role: "gallery_candidate", media_type: "public_gallery", public_safe: false }),
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
    assert.deepEqual(assets.photos.map((photo) => photo.media_id), [galleryMediaId]);
    assert.deepEqual(assets.clips.map((clip) => clip.media_id), [clipMediaId]);
    assert.equal(assets.clips[0].url, `https://sigil.mmdbkk.com/sigil/api/models/media/${clipMediaId}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("search projection uses approved media linked to each Model ID and clears legacy image fallbacks", async () => {
  const records = [
    item(primaryMediaId, { asset_role: "profile_main", media_type: "profile_photo" }),
    item(galleryMediaId, { asset_role: "gallery_candidate", media_type: "public_gallery" }),
    item(clipMediaId, { asset_role: "intro_video_candidate", media_type: "intro_video", file_type: "video/mp4" }),
    item(secondPrimaryMediaId, { asset_role: "profile_main", media_type: "profile_photo", Model: [secondModelId] }),
    item(`media_${"2".repeat(32)}`, { review_status: "pending_review", Model: [secondModelId] }),
    item(`media_${"3".repeat(32)}`, { media_type: "private_gallery", Model: [secondModelId] }),
    item(`media_${"4".repeat(32)}`, { public_safe: false, Model: [secondModelId] }),
    item(`media_${"5".repeat(32)}`, { media_visibility: "private_candidate", Model: [secondModelId] }),
    item(`media_${"6".repeat(32)}`, { Model: ["recModel000000003"] }),
  ];
  const models = [
    { model_id: modelId, working_name: "Model One", public_image_url: "https://legacy.invalid/one.webp", cover_url: "https://legacy.invalid/one.webp", primary_image_key: "legacy-one", r2_key: "legacy-one" },
    { model_id: secondModelId, working_name: "Model Two", public_image_url: "https://legacy.invalid/two.webp", cover_url: "https://legacy.invalid/two.webp", primary_image_url: "https://legacy.invalid/two.webp", primary_media_id: "legacy-two", primary_image_key: "legacy-two", r2_key: "legacy-two", additional_images: [{ url: "https://legacy.invalid/other.webp" }], clips: [{ url: "https://legacy.invalid/other.mp4" }] },
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.searchParams.has("filterByFormula")) return Response.json({ records });
    return Response.json({ fields: { public_image_url: "https://legacy.invalid/from-record.webp", primary_image_key: "legacy-record" } });
  };
  try {
    const grouped = await fetchPublicModelMedia({ AIRTABLE_API_KEY: "key", AIRTABLE_BASE_ID: "base" }, models);
    assert.equal(grouped.get(modelId).primary.media_id, primaryMediaId);
    assert.equal(grouped.get(secondModelId).primary.media_id, secondPrimaryMediaId);
    assert.deepEqual(grouped.get(secondModelId).photos, []);
    assert.deepEqual(grouped.get(secondModelId).clips, []);

    const projected = await hydrateModelAssetPolicy({ AIRTABLE_API_KEY: "key", AIRTABLE_BASE_ID: "base" }, { ok: true, model: models[0], items: models });
    const [first, second] = projected.items;
    assert.equal(first.public_image_url, `https://sigil.mmdbkk.com/sigil/api/models/media/${primaryMediaId}`);
    assert.equal(first.cover_url, first.public_image_url);
    assert.equal(first.primary_media_id, primaryMediaId);
    assert.deepEqual(first.additional_images.map((photo) => photo.media_id), [galleryMediaId]);
    assert.deepEqual(first.clips.map((clip) => clip.media_id), [clipMediaId]);
    assert.equal(projected.model.public_image_url, first.public_image_url);
    assert.equal(second.primary_media_id, secondPrimaryMediaId);
    assert.equal(second.public_image_url, `https://sigil.mmdbkk.com/sigil/api/models/media/${secondPrimaryMediaId}`);
    assert.equal(second.source, "mmd_model_media_assets");
    assert.equal(second.asset_source, "mmd_model_media_assets");
    for (const key of ["primary_image_key", "r2_key", "r2_prefix"]) assert.equal(second[key], "", `${key} must not expose a storage key`);
    assert.deepEqual(second.additional_images, []);
    assert.deepEqual(second.clips, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("search projection is media-empty when registry credentials are unavailable", async () => {
  const legacy = { model_id: secondModelId, source: "legacy", asset_source: "legacy", r2_prefix: "models/legacy", public_image_url: "https://legacy.invalid/model.webp", cover_url: "https://legacy.invalid/model.webp", additional_images: [{ url: "https://legacy.invalid/gallery.webp" }] };
  const projected = await hydrateModelAssetPolicy({}, { ok: true, model: legacy, items: [legacy] });
  assert.equal(projected.model.public_image_url, "");
  assert.equal(projected.items[0].cover_url, "");
  assert.equal(projected.items[0].source, "");
  assert.equal(projected.items[0].asset_source, "");
  assert.equal(projected.items[0].r2_prefix, "");
  assert.deepEqual(projected.items[0].additional_images, []);
});

test("search projection does not restore legacy images when the media registry fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.searchParams.has("filterByFormula")) return new Response(null, { status: 503 });
    return Response.json({ fields: { public_image_url: "https://legacy.invalid/from-record.webp" } });
  };
  try {
    const model = { model_id: modelId, working_name: "Model One", public_image_url: "https://legacy.invalid/from-search.webp", cover_url: "https://legacy.invalid/from-search.webp" };
    const projected = await hydrateModelAssetPolicy({ AIRTABLE_API_KEY: "key", AIRTABLE_BASE_ID: "base" }, { ok: true, items: [model] });
    assert.equal(projected.items[0].public_image_url, "");
    assert.equal(projected.items[0].cover_url, "");
    assert.equal(projected.items[0].source, "");
    assert.equal(projected.items[0].asset_source, "");
    assert.equal(projected.items[0].r2_prefix, "");
    assert.deepEqual(projected.items[0].additional_images, []);
    assert.deepEqual(projected.items[0].clips, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public media gate rejects private, pending and unsafe registry records", () => {
  const base = {
    Model: [modelId],
    media_type: "public_gallery",
    asset_role: "gallery_candidate",
    media_visibility: "public_candidate",
    review_status: "active",
    public_safe: true,
    private_original_key: "models/model/public_gallery/image.webp",
  };
  assert.equal(isPublicMedia(base), true);
  assert.equal(isPublicMedia({ ...base, Model: [] }), false);
  assert.equal(isPublicMedia({ ...base, media_type: "private_gallery" }), false);
  assert.equal(isPublicMedia({ ...base, review_status: "pending_review" }), false);
  assert.equal(isPublicMedia({ ...base, public_safe: false }), false);
  assert.equal(isPublicMedia({ ...base, media_visibility: "private_candidate" }), false);
});

test("public media route streams only eligible assets and honors video byte ranges", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async () => Response.json({ records: [{ fields: {
    Model: [modelId],
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

test("public media route rejects an approved asset that is not linked to a Model", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ records: [{ fields: {
    Model: [],
    media_id: mediaId,
    media_type: "public_gallery",
    asset_role: "gallery_candidate",
    media_visibility: "public_candidate",
    review_status: "approved",
    public_safe: true,
    private_original_key: "models/unlinked/asset.webp",
    file_type: "image/webp",
  } }] });
  try {
    const response = await worker.fetch(new Request(`https://sigil.mmdbkk.com/sigil/api/models/media/${mediaId}`), {
      AIRTABLE_API_KEY: "key",
      AIRTABLE_BASE_ID: "base",
      MMD_MODEL_ASSETS: { get: async () => { throw new Error("must not read unlinked storage"); } },
    });
    assert.equal(response.status, 404);
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
