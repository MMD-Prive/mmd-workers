import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeModelMediaType,
  normalizeModelMediaUploadSpec,
  isApprovedPublicModelMedia,
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
