import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeModelMediaType,
  normalizeModelMediaUploadSpec,
} from "./src/model-liff-worker-legacy.js";

const MB = 1024 * 1024;

test("MMD MODEL self-managed upload accepts public photos up to 10MB", () => {
  assert.equal(normalizeModelMediaType("public_gallery"), "public_gallery");
  const accepted = normalizeModelMediaUploadSpec("public_gallery", "image/webp", 10 * MB);
  assert.deepEqual(accepted, {
    ok: true,
    kind: "image",
    mediaType: "public_gallery",
    mime: "image/webp",
    size: 10 * MB,
    maxBytes: 10 * MB,
    ext: "webp",
    assetRole: "gallery_candidate",
  });
  assert.deepEqual(
    normalizeModelMediaUploadSpec("public_gallery", "image/webp", 10 * MB + 1),
    { ok: false, error: "file_size_invalid", max_bytes: 10 * MB },
  );
});

test("MMD MODEL self-managed upload accepts MP4 MOV and WEBM clips up to 50MB", () => {
  assert.equal(normalizeModelMediaType("intro_video"), "intro_video");
  for (const [mime, ext] of [
    ["video/mp4", "mp4"],
    ["video/quicktime", "mov"],
    ["video/webm", "webm"],
  ]) {
    const accepted = normalizeModelMediaUploadSpec("intro_video", mime, 50 * MB);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.kind, "video");
    assert.equal(accepted.mediaType, "intro_video");
    assert.equal(accepted.maxBytes, 50 * MB);
    assert.equal(accepted.ext, ext);
    assert.equal(accepted.assetRole, "intro_video_candidate");
  }
  assert.deepEqual(
    normalizeModelMediaUploadSpec("intro_video", "video/mp4", 50 * MB + 1),
    { ok: false, error: "file_size_invalid", max_bytes: 50 * MB },
  );
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
