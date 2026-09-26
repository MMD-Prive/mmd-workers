import test from "node:test";
import assert from "node:assert/strict";
import { handleModelMediaE2ESmoke } from "./src/model-media-e2e-smoke.js";

const ORIGIN = "https://mmdbkk.com";
const MODEL_ID = "recBKaHfxUKs8fkMV";
const SECRET = "model-media-e2e-smoke-secret-1234567890";

function request(body = { model_record_id: MODEL_ID }, origin = ORIGIN) {
  return new Request(`${ORIGIN}/v1/admin/model-media/e2e-smoke`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function fakeModelWorker() {
  let media = null;
  let object = null;
  let plannedFileName = "";
  const calls = [];

  return {
    calls,
    state: () => ({ media, object }),
    async fetch(req) {
      const url = new URL(req.url);
      const cookie = req.headers.get("cookie") || "";
      assert.match(cookie, /^mmd_model_session_v1=/);
      calls.push(`${req.method} ${url.pathname}`);

      if (req.method === "GET" && url.pathname === "/v1/model/profile") {
        return Response.json({
          ok: true,
          model: { id: MODEL_ID, display_name: "Mek", status: "active" },
        });
      }

      if (req.method === "POST" && url.pathname === "/v1/model/media/upload-url") {
        const input = await req.json();
        assert.equal(input.media_type, "public_gallery");
        assert.equal(input.content_type, "image/png");
        plannedFileName = input.file_name;
        return Response.json({ ok: true, upload_url: `${ORIGIN}/v1/model/media/upload-url?authorization=test`, upload_method: "PUT", review_required: true });
      }

      if (req.method === "PUT" && url.pathname === "/v1/model/media/upload-url") {
        assert.equal(req.headers.get("content-type"), "image/png");
        object = new Uint8Array(await req.arrayBuffer());
        media = {
          media_id: "media_smokee2e12345678",
          media_type: "public_gallery",
          asset_role: "gallery_candidate",
          review_status: "pending_review",
          file_name: plannedFileName,
          file_type: "image/png",
          file_size_bytes: object.byteLength,
          uploaded_at: new Date().toISOString(),
          preview_url: "/v1/model/media/media_smokee2e12345678/file",
          can_delete: true,
          can_request_main: false,
          self_managed: true,
          requires_per_approval: false,
          policy: "model_self_managed_public",
          main_action: "await_review",
        };
        return Response.json({ ok: true, media, review_required: true }, { status: 201 });
      }

      if (req.method === "GET" && url.pathname === "/v1/model/media") {
        return Response.json({ ok: true, media: media ? [media] : [] });
      }

      if (req.method === "GET" && url.pathname === "/v1/model/media/media_smokee2e12345678/file") {
        if (!media || !object) return Response.json({ ok: false, error: "media_not_found" }, { status: 404 });
        return new Response(object, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "cache-control": "private, no-store",
          },
        });
      }

      if (req.method === "DELETE" && url.pathname === "/v1/model/media/media_smokee2e12345678") {
        media = null;
        object = null;
        return Response.json({ ok: true, media_id: "media_smokee2e12345678", policy: "model_self_managed_public" });
      }

      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    },
  };
}

test("owner-gated smoke exercises model session, upload, registry, R2 read-back and cleanup", async () => {
  const modelWorker = fakeModelWorker();
  const response = await handleModelMediaE2ESmoke(
    request(),
    { MODEL_SESSION_SIGNING_SECRET: SECRET },
    { id: "per", role: "owner" },
    modelWorker,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.model.model_record_id, MODEL_ID);
  assert.equal(body.model.display_name, "Mek");
  assert.deepEqual(body.checks, {
    model_session_authenticated: true,
    real_model_profile_read: true,
    short_lived_upload_authorized: true,
    r2_write: true,
    media_record_created: true,
    pending_review_observed: true,
    media_record_read_back: true,
    r2_file_opened: true,
    byte_match: true,
    cleanup_deleted_record_and_object: true,
    post_cleanup_404: true,
    stale_smoke_media_removed: 0,
  });
  assert.deepEqual(modelWorker.calls, [
    "GET /v1/model/profile",
    "GET /v1/model/media",
    "POST /v1/model/media/upload-url",
    "PUT /v1/model/media/upload-url",
    "GET /v1/model/media",
    "GET /v1/model/media/media_smokee2e12345678/file",
    "DELETE /v1/model/media/media_smokee2e12345678",
    "GET /v1/model/media/media_smokee2e12345678/file",
  ]);
  assert.deepEqual(modelWorker.state(), { media: null, object: null });
});

test("smoke refuses missing admin actor and cross-origin calls", async () => {
  const worker = fakeModelWorker();
  const noActor = await handleModelMediaE2ESmoke(
    request(),
    { MODEL_SESSION_SIGNING_SECRET: SECRET },
    null,
    worker,
  );
  assert.equal(noActor.status, 401);

  const crossOrigin = await handleModelMediaE2ESmoke(
    request({ model_record_id: MODEL_ID }, "https://evil.example"),
    { MODEL_SESSION_SIGNING_SECRET: SECRET },
    { id: "per", role: "owner" },
    worker,
  );
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(worker.calls, []);
});

test("smoke rejects invalid Model record IDs before session minting", async () => {
  const worker = fakeModelWorker();
  const response = await handleModelMediaE2ESmoke(
    request({ model_record_id: "not-a-record" }),
    { MODEL_SESSION_SIGNING_SECRET: SECRET },
    { id: "per", role: "admin" },
    worker,
  );
  assert.equal(response.status, 400);
  assert.deepEqual(worker.calls, []);
});
