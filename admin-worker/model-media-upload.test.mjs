import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeModelMediaType,
  normalizeModelMediaUploadSpec,
  hasMismatchedDeclaredContentLength,
  isApprovedPublicModelMedia,
  modelMediaCapacity,
  parseMediaRoute,
  recordOwnedByCanonicalModel,
} from "./src/model-liff-worker-legacy.js";

const MB = 1024 * 1024;

test("MMD MODEL upload accepts public photos up to 25MB", () => {
  assert.equal(normalizeModelMediaType("public_gallery"), "public_gallery");
  const accepted = normalizeModelMediaUploadSpec("public_gallery", "image/webp", 25 * MB);
  assert.deepEqual(accepted, {
    ok: true,
    kind: "image",
    mediaType: "public_gallery",
    mime: "image/webp",
    size: 25 * MB,
    maxBytes: 25 * MB,
    ext: "webp",
    assetRole: "gallery_candidate",
  });
  assert.deepEqual(
    normalizeModelMediaUploadSpec("public_gallery", "image/webp", 25 * MB + 1),
    { ok: false, error: "file_size_invalid", max_bytes: 25 * MB },
  );
});

test("MMD MODEL upload accepts MP4 MOV and WEBM clips up to 25MB", () => {
  assert.equal(normalizeModelMediaType("intro_video"), "intro_video");
  for (const [mime, ext] of [
    ["video/mp4", "mp4"],
    ["video/quicktime", "mov"],
    ["video/webm", "webm"],
  ]) {
    const accepted = normalizeModelMediaUploadSpec("intro_video", mime, 25 * MB);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.kind, "video");
    assert.equal(accepted.mediaType, "intro_video");
    assert.equal(accepted.maxBytes, 25 * MB);
    assert.equal(accepted.ext, ext);
    assert.equal(accepted.assetRole, "intro_video_candidate");
  }
  assert.deepEqual(
    normalizeModelMediaUploadSpec("intro_video", "video/mp4", 25 * MB + 1),
    { ok: false, error: "file_size_invalid", max_bytes: 25 * MB },
  );
});

test("pending public candidates cannot become profile main before Studio approval", () => {
  assert.equal(isApprovedPublicModelMedia({ review_status: "pending_review", public_safe: false }), false);
  assert.equal(isApprovedPublicModelMedia({ review_status: "approved", public_safe: false }), false);
  assert.equal(isApprovedPublicModelMedia({ review_status: "approved", public_safe: true }), true);
  assert.equal(isApprovedPublicModelMedia({ review_status: "active", public_safe: true }), true);
});

test("photo and clip media types stay explicit", () => {
  assert.deepEqual(
    normalizeModelMediaUploadSpec("public_gallery", "video/mp4", 5 * MB),
    { ok: false, error: "file_type_not_allowed" },
  );
  assert.deepEqual(
    normalizeModelMediaUploadSpec("intro_video", "image/jpeg", 5 * MB),
    { ok: false, error: "file_type_not_allowed" },
  );
});


test("canonical Model ownership uses raw linked Airtable record IDs, never display text", () => {
  const modelId = "recBKaHfxUKs8fkMV";
  assert.equal(
    recordOwnedByCanonicalModel({ fields: { Model: [modelId] } }, modelId),
    true,
  );
  assert.equal(
    recordOwnedByCanonicalModel({ fields: { Model: [{ id: modelId }] } }, modelId),
    true,
  );
  assert.equal(
    recordOwnedByCanonicalModel({ fields: { Model: ["Mek"] } }, modelId),
    false,
  );
  assert.equal(
    recordOwnedByCanonicalModel({ fields: { Model: [modelId, "recOther12345678"] } }, modelId),
    false,
  );
  assert.equal(
    recordOwnedByCanonicalModel({ fields: { Model: ["recOther12345678"] } }, modelId),
    false,
  );
});

test("media delete supports the REST-compatible bare media URL plus legacy /delete alias", () => {
  assert.deepEqual(
    parseMediaRoute("/v1/model/media/media_abc12345678"),
    { mediaId: "media_abc12345678", action: "delete" },
  );
  assert.deepEqual(
    parseMediaRoute("/v1/model/media/media_abc12345678/delete"),
    { mediaId: "media_abc12345678", action: "delete" },
  );
  assert.deepEqual(
    parseMediaRoute("/v1/model/media/media_abc12345678/file"),
    { mediaId: "media_abc12345678", action: "file" },
  );
});

test("streamed Model uploads accept an omitted Content-Length but reject invalid declarations", () => {
  const expected = 68;
  assert.equal(hasMismatchedDeclaredContentLength(null, expected), false);
  assert.equal(hasMismatchedDeclaredContentLength("", expected), false);
  assert.equal(hasMismatchedDeclaredContentLength(String(expected), expected), false);
  assert.equal(hasMismatchedDeclaredContentLength(String(expected - 1), expected), true);
  assert.equal(hasMismatchedDeclaredContentLength("not-a-length", expected), true);
  assert.equal(hasMismatchedDeclaredContentLength("9007199254740992", expected), true);
});

test("public quota is 8 photos / 1 clip and never counts the private lane", async () => {
  const originalFetch = globalThis.fetch;
  const modelId = "recBKaHfxUKs8fkMV";
  const publicPhoto = (index) => ({ id: `recPublic${index}`, fields: { media_id: `media_public_${index}`, Model: [modelId], media_type: "public_gallery", media_visibility: "public_candidate", review_status: "pending_review" } });
  const privatePhoto = (index) => ({ id: `recPrivate${index}`, fields: { Model: [modelId], media_type: "private_gallery", media_visibility: "private_candidate", review_status: "pending_review", file_type: "image/png" } });
  try {
    globalThis.fetch = async () => Response.json({ records: [
      ...Array.from({ length: 7 }, (_, index) => publicPhoto(index)),
      ...Array.from({ length: 2 }, (_, index) => privatePhoto(index)),
      { id: "recClip", fields: { media_id: "media_public_clip", Model: [modelId], media_type: "intro_video", media_visibility: "public_candidate", review_status: "pending_review" } },
    ] });
    assert.deepEqual(await modelMediaCapacity({ AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "appTest" }, modelId, "image"), { ok: true, photos: 7, clips: 1, refs: Array.from({ length: 7 }, (_, index) => `media_public_${index}`) });
    assert.deepEqual(await modelMediaCapacity({ AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "appTest" }, modelId, "video"), { ok: false, error: "clip_limit_reached", status: 409, max_files: 1, refs: ["media_public_clip"] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
