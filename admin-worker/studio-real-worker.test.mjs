import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import studioWorker, { handleStudioRequest } from "./src/studio-real-worker.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const BASE_ENV = {
  ADMIN_BEARER: "admin-t",
  INTERNAL_API_TOKEN: "internal-api-k",
  CONFIRM_KEY: "confirm-k",
  AIRTABLE_BASE_ID: "base1",
  AIRTABLE_API_KEY: "airkey",
  AIRTABLE_TABLE_CONSOLE_INBOX_ID: "tblConsole",
  ALLOWED_ORIGINS: "https://mmdbkk.com",
  STUDIO_ASSET_SIGNING_SECRET: "studio-asset-secret-test",
};
const VALID_ASSET_ID = `studio_${"a".repeat(64)}`;

async function req(path, body = {}, init = {}) {
  const origin = init.urlOrigin || "https://mmdbkk.com";
  const headers = { "content-type": "application/json", origin, ...(init.headers || {}) };
  if (init.authed !== false) headers.cookie = await sessionCookie(init.session || {});
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function multipartReq(path, fileSpecs = [], init = {}) {
  const origin = init.urlOrigin || "https://mmdbkk.com";
  const headers = { origin, "Idempotency-Key": init.idempotencyKey || "studio-upload-test-001", ...(init.headers || {}) };
  if (init.authed !== false) headers.cookie = await sessionCookie(init.session || {});
  const form = new FormData();
  for (const spec of fileSpecs) {
    form.append(spec.field || "file", new Blob([spec.bytes], { type: spec.type }), spec.name || "studio-upload.bin");
  }
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers,
    body: form,
  });
}

async function json(res) {
  return await res.json();
}

function installAirtableMock({ onCreate } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (!init.method || init.method === "GET") return Response.json({ records: [] });
    if (onCreate) return onCreate(url, init, calls);
    return Response.json({ id: "recStudio123", fields: JSON.parse(init.body || "{}").fields || {} });
  };
  return calls;
}

function installR2Mock({ putResult = undefined, headResult = undefined, malformedHead = false } = {}) {
  const calls = [];
  const objects = new Map();
  return {
    calls,
    binding: {
      async put(key, value, options) {
        calls.push({ op: "put", key, value, options });
        if (putResult !== undefined) return putResult;
        if (options?.onlyIf?.get?.("If-None-Match") === "*" && objects.has(key)) return null;
        const object = {
          key,
          size: value?.byteLength || value?.size || 0,
          httpMetadata: options?.httpMetadata || {},
          customMetadata: options?.customMetadata || {},
          checksums: options?.sha256 ? { sha256: options.sha256 } : {},
        };
        objects.set(key, object);
        return object;
      },
      async head(key) {
        calls.push({ op: "head", key });
        if (malformedHead) return { key, customMetadata: { source: "broken" } };
        if (headResult !== undefined) return headResult;
        return objects.get(key) || null;
      },
    },
  };
}

test("upload requires signed admin session", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], { authed: false }), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 401);
});

test("upload rejects unapproved origin", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    headers: { origin: "https://evil.example" },
  }), { ...BASE_ENV, MMD_MODEL_ASSETS: r2.binding });
  assert.equal(res.status, 403);
  assert.equal((await json(res)).error, "origin_not_allowed");
});

test("upload rejects missing Origin before multipart parsing", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    headers: { origin: "" },
  }), { ...BASE_ENV, MMD_MODEL_ASSETS: r2.binding });
  assert.equal(res.status, 403);
  assert.equal((await json(res)).error, "origin_not_allowed");
});

test("upload rejects malformed Origin", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    headers: { origin: "https://mmdbkk.com/path" },
  }), { ...BASE_ENV, MMD_MODEL_ASSETS: r2.binding });
  assert.equal(res.status, 403);
  assert.equal((await json(res)).error, "origin_not_allowed");
});

test("upload rejects empty allowed-origin config", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()]), {
    ...BASE_ENV,
    ALLOWED_ORIGINS: "",
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 403);
  assert.equal((await json(res)).error, "origin_not_allowed");
});

test("upload rejects Webflow staging origin for cookie-authenticated Studio", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    urlOrigin: "https://mmdprive.webflow.io",
  }), {
    ...BASE_ENV,
    ALLOWED_ORIGINS: "https://mmdprive.webflow.io",
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 401);
});

test("upload accepts same-origin www with host-specific session", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    urlOrigin: "https://www.mmdbkk.com",
    session: { host: "https://www.mmdbkk.com" },
  }), {
    ...BASE_ENV,
    ALLOWED_ORIGINS: "https://www.mmdbkk.com",
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 200);
});

test("upload rejects cross-host apex Origin on www request", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    urlOrigin: "https://www.mmdbkk.com",
    headers: { origin: "https://mmdbkk.com" },
    session: { host: "https://www.mmdbkk.com" },
  }), {
    ...BASE_ENV,
    ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com",
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 403);
});

test("unapproved OPTIONS preflight does not return permissive CORS origin", async () => {
  const res = await studioWorker.fetch(new Request("https://mmdbkk.com/studio/api/upload", {
    method: "OPTIONS",
    headers: {
      origin: "https://evil.example",
      "Access-Control-Request-Method": "POST",
    },
  }), BASE_ENV, {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("upload requires Idempotency-Key header", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    idempotencyKey: "",
    headers: { "Idempotency-Key": "" },
  }), { ...BASE_ENV, MMD_MODEL_ASSETS: r2.binding });
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "idempotency_key_required");
});

test("upload rejects non-multipart requests", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await req("/studio/api/upload", { file: "nope" }, {
    headers: { "Idempotency-Key": "studio-upload-test-json" },
  }), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "multipart_required");
});

test("upload rejects multiple files", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile("a.png"), pngFile("b.png")]), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "one_file_only");
});

test("upload rejects empty files", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [{ bytes: new Uint8Array([]), type: "image/png", name: "empty.png" }]), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "empty_file");
});

test("upload rejects oversized files", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()]), {
    ...BASE_ENV,
    STUDIO_UPLOAD_MAX_BYTES: "4",
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "file_too_large");
});

test("upload rejects oversized declared Content-Length before multipart parsing", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    headers: { "content-length": "999" },
  }), {
    ...BASE_ENV,
    STUDIO_UPLOAD_MAX_BYTES: "4",
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "file_too_large");
});

test("upload rejects unsupported MIME types", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [{ ...pngFile("studio.txt"), type: "text/plain" }]), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "unsupported_file_type");
});

test("upload rejects MIME and magic byte mismatch", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [{ bytes: jpegBytes(), type: "image/png", name: "wrong.png" }]), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "image_magic_mismatch");
});

test("upload accepts JPEG and returns opaque asset_id only", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [jpegFile()]), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.match(data.asset_id, /^studio_[a-f0-9]{64}$/);
  assert.equal(data.content_type, "image/jpeg");
  assert.equal(data.storage_key, undefined);
  assert.equal(data.key, undefined);
  assert.equal(data.bucket, undefined);
  assert.equal(data.public_url, undefined);
  assert.equal(data.sha256, undefined);
  assert.equal(r2.calls.filter((call) => call.op === "put").length, 1);
  const put = r2.calls.find((call) => call.op === "put");
  assert.match(put.key, /^studio-staging\/assets\/studio_[a-f0-9]{64}$/);
  assert.equal(put.options.onlyIf.get("If-None-Match"), "*");
  assert.equal(put.options.httpMetadata.contentType, "image/jpeg");
  assert.ok(put.options.sha256);
  assert.equal(put.options.checksums, undefined);
  assert.equal(arrayBufferToHex(put.options.sha256), await sha256Hex(jpegBytes()));
  assert.equal(put.options.customMetadata.asset_id, data.asset_id);
  assert.equal(put.options.customMetadata.sha256, await sha256Hex(jpegBytes()));
  assert.equal(put.options.customMetadata.size, String(jpegBytes().byteLength));
  assert.equal(put.options.customMetadata.content_type, "image/jpeg");
  assert.equal(put.options.customMetadata.source, "mmd_studio_upload");
});

test("upload accepts PNG", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()]), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 200);
  assert.equal((await json(res)).content_type, "image/png");
});

test("upload accepts WebP with valid RIFF WEBP chunk marker", async () => {
  const r2 = installR2Mock();
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [webpFile()]), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 200);
  assert.equal((await json(res)).content_type, "image/webp");
});

test("identical upload replay returns the same asset_id without duplicate write", async () => {
  const r2 = installR2Mock();
  const first = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    idempotencyKey: "studio-upload-replay-001",
  }), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  const replay = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    idempotencyKey: "studio-upload-replay-001",
  }), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  const firstData = await json(first);
  const replayData = await json(replay);
  assert.equal(replayData.asset_id, firstData.asset_id);
  assert.equal(replayData.replayed, true);
  assert.equal(r2.calls.filter((call) => call.op === "put").length, 2);
});

test("conflicting upload replay returns idempotency_conflict without overwrite", async () => {
  const r2 = installR2Mock();
  const first = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    idempotencyKey: "studio-upload-conflict-001",
  }), { ...BASE_ENV, MMD_MODEL_ASSETS: r2.binding });
  const conflict = await handleStudioRequest(await multipartReq("/studio/api/upload", [jpegFile()], {
    idempotencyKey: "studio-upload-conflict-001",
  }), { ...BASE_ENV, MMD_MODEL_ASSETS: r2.binding });
  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal((await json(conflict)).error, "idempotency_conflict");
  assert.equal(r2.calls.filter((call) => call.op === "put").length, 2);
});

test("concurrent conditional failure with same payload resolves to replay success", async () => {
  const sha = await sha256Hex(pngBytes());
  const assetId = await expectedAssetId("studio-upload-race-same");
  const r2 = installR2Mock({
    putResult: null,
    headResult: {
      key: `studio-staging/assets/${assetId}`,
      customMetadata: {
        asset_id: assetId,
        sha256: sha,
        size: String(pngBytes().byteLength),
        content_type: "image/png",
        source: "mmd_studio_upload",
      },
    },
  });
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    idempotencyKey: "studio-upload-race-same",
  }), { ...BASE_ENV, MMD_MODEL_ASSETS: r2.binding });
  assert.equal(res.status, 200);
  assert.equal((await json(res)).replayed, true);
});

test("concurrent conditional failure with different payload returns conflict", async () => {
  const assetId = await expectedAssetId("studio-upload-race-diff");
  const r2 = installR2Mock({
    putResult: null,
    headResult: {
      key: `studio-staging/assets/${assetId}`,
      customMetadata: {
        asset_id: assetId,
        sha256: await sha256Hex(jpegBytes()),
        size: String(jpegBytes().byteLength),
        content_type: "image/jpeg",
        source: "mmd_studio_upload",
      },
    },
  });
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()], {
    idempotencyKey: "studio-upload-race-diff",
  }), { ...BASE_ENV, MMD_MODEL_ASSETS: r2.binding });
  assert.equal(res.status, 409);
  assert.equal((await json(res)).error, "idempotency_conflict");
});

test("conditional failure with missing metadata fails closed", async () => {
  const r2 = installR2Mock({ putResult: null, malformedHead: true });
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()]), {
    ...BASE_ENV,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 500);
  assert.equal((await json(res)).error, "upload_replay_verification_failed");
});

test("upload fails closed when R2 binding is missing", async () => {
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()]), BASE_ENV);
  assert.equal(res.status, 500);
  assert.equal((await json(res)).error, "missing_r2_binding");
});

test("upload fails closed when dedicated asset signing secret is missing", async () => {
  const r2 = installR2Mock();
  const { STUDIO_ASSET_SIGNING_SECRET: _secret, ...env } = BASE_ENV;
  const res = await handleStudioRequest(await multipartReq("/studio/api/upload", [pngFile()]), {
    ...env,
    MMD_MODEL_ASSETS: r2.binding,
  });
  assert.equal(res.status, 500);
  assert.equal((await json(res)).error, "missing_asset_signing_secret");
});

test("intake validate success", async () => {
  const res = await handleStudioRequest(await req("/studio/api/intake/validate", {
    model_name: "Test Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }), BASE_ENV);
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.equal(data.safe_preview_only, true);
  assert.equal(data.normalized.model_name, "Test Model");
});

test("existing worker internal token header cannot authenticate Studio API", async () => {
  const res = await handleStudioRequest(await req("/studio/api/intake/validate", {
    model_name: "Internal Header Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }, { authed: false, headers: { "X-Internal-Token": "internal-api-k" } }), BASE_ENV);
  assert.equal(res.status, 401);
});

test("existing confirm key cannot authenticate studio smoke", async () => {
  const res = await handleStudioRequest(await req("/studio/api/intake/validate", {
    model_name: "Confirm Key Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }, { authed: false, headers: { "X-Confirm-Key": "confirm-k" } }), BASE_ENV);
  assert.equal(res.status, 401);
});

test("intake commit requires signed admin session", async () => {
  const res = await handleStudioRequest(await req("/studio/api/intake/commit", {
    model_name: "Test Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }, { authed: false }), BASE_ENV);
  assert.equal(res.status, 401);
});

test("intake commit requires explicit idempotency key", async () => {
  installAirtableMock();
  const res = await handleStudioRequest(await req("/studio/api/intake/commit", {
    model_name: "No Idempotency Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }), BASE_ENV);
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "idempotency_key_required");
});

test("intake commit writes exactly once with idempotency key", async () => {
  const calls = installAirtableMock();
  const res = await handleStudioRequest(await req("/studio/api/intake/commit", {
    idempotency_key: "intake_commit_test_001",
    model_name: "Commit Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }), BASE_ENV);
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.equal(data.idempotency_key, "intake_commit_test_001");
  assert.equal(calls.filter((call) => call.init.method === "POST").length, 1);
});

test("duplicate idempotency key is rejected before write", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (!init.method || init.method === "GET") return Response.json({ records: [{ id: "recExisting" }] });
    return Response.json({ id: "recShouldNotWrite" });
  };
  const res = await handleStudioRequest(await req("/studio/api/intake/commit", {
    idempotency_key: "intake_commit_test_001",
    model_name: "Duplicate Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }), BASE_ENV);
  assert.equal(res.status, 409);
  assert.equal((await json(res)).error, "duplicate_intake_commit");
  assert.equal(calls.filter((call) => call.init.method === "POST").length, 0);
});

test("GWs without run_number fails", async () => {
  const res = await handleStudioRequest(await req("/studio/api/intake/validate", {
    model_name: "G Model",
    field: "GWs",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }), BASE_ENV);
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "run_number_required");
});

test("EMs invalid run_number fails", async () => {
  const res = await handleStudioRequest(await req("/studio/api/intake/validate", {
    model_name: "E Model",
    field: "EMs",
    run_number: "EM12",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }), BASE_ENV);
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "invalid_run_number");
});

test("review commit does not publish", async () => {
  installAirtableMock();
  const res = await handleStudioRequest(await req("/studio/api/review/commit", {
    studio_review_id: "review_test_001",
    idempotency_key: "review_commit_test_001",
    model_name: "Review Model",
    field: "ST",
    layer: "Private / SIGIL",
    decision: "Approved Direction",
    final_note: "approved direction only",
  }), BASE_ENV);
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.equal(data.published, false);
  assert.equal(data.status, "committed");
  assert.ok(data.studio_review_id);
});

test("review validate is safe-preview only", async () => {
  const res = await handleStudioRequest(await req("/studio/api/review/validate", {
    model_name: "Review Validate Model",
    field: "ST",
    layer: "Private / SIGIL",
    decision: "Needs Review",
    final_note: "review draft only",
  }), BASE_ENV);
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.equal(data.safe_preview_only, true);
});

test("publish-plan returns blockers without approved review", async () => {
  const res = await handleStudioRequest(await req("/studio/api/model-preview/publish-plan", {
    model_name: "Preview Model",
    field: "ST",
    layer: "Private / SIGIL",
    template: "MMD Compcard",
    checklist: { safe: true },
  }), BASE_ENV);
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.equal(data.status, "plan_only");
  assert.equal(data.can_commit, false);
  assert.match(data.blockers.join(","), /review_required/);
});

test("publish commit requires second ledger confirmation", async () => {
  const res = await handleStudioRequest(await req("/studio/api/model-preview/commit", {
    model_name: "Preview Model",
    field: "ST",
    layer: "Private / SIGIL",
    studio_review_id: "recReview1",
    checklist: { safe: true },
  }), BASE_ENV);
  assert.equal(res.status, 403);
  assert.equal((await json(res)).error, "ledger_confirmation_required");
});

test("publish commit fail-closes when R2 verification fails", async () => {
  const calls = installAirtableMock();
  const env = { ...BASE_ENV, MMD_MODEL_ASSETS: { async head() { return null; } } };
  const res = await handleStudioRequest(await req("/studio/api/model-preview/commit", {
    model_name: "Preview Model",
    field: "ST",
    layer: "Private / SIGIL",
    studio_review_id: "recReview1",
    idempotency_key: "publish_commit_test_001",
    asset_ids: [VALID_ASSET_ID],
    checklist: { safe: true },
    ledger_commit_confirmed: true,
    ledger_confirmation_phrase: "COMMIT_LEDGER_ONLY",
  }), env);
  assert.equal(res.status, 409);
  assert.equal((await json(res)).error, "r2_verification_failed");
  assert.equal(calls.filter((call) => call.init.method === "POST").length, 0);
});

test("publish commit rejects raw R2 keys from browser", async () => {
  const res = await handleStudioRequest(await req("/studio/api/model-preview/commit", {
    model_name: "Preview Model",
    field: "ST",
    layer: "Private / SIGIL",
    studio_review_id: "recReview1",
    idempotency_key: "publish_commit_test_raw_r2",
    r2_required_keys: ["models/a.webp"],
    checklist: { safe: true },
    ledger_commit_confirmed: true,
    ledger_confirmation_phrase: "COMMIT_LEDGER_ONLY",
  }), BASE_ENV);
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "raw_storage_field_not_allowed");
});

test("publish commit resolves asset_ids server-side before R2 head and remains ledger-only", async () => {
  const calls = installAirtableMock();
  const r2 = installR2Mock({
    headResult: {
      key: `studio-staging/assets/${VALID_ASSET_ID}`,
      customMetadata: {
        asset_id: VALID_ASSET_ID,
        sha256: "b".repeat(64),
        size: "12",
        content_type: "image/webp",
        source: "mmd_studio_upload",
      },
    },
  });
  const res = await handleStudioRequest(await req("/studio/api/model-preview/commit", {
    model_name: "Preview Model",
    field: "ST",
    layer: "Private / SIGIL",
    studio_review_id: "recReview1",
    idempotency_key: "publish_commit_test_002",
    asset_ids: [VALID_ASSET_ID],
    checklist: { safe: true },
    ledger_commit_confirmed: true,
    ledger_confirmation_phrase: "COMMIT_LEDGER_ONLY",
  }), { ...BASE_ENV, MMD_MODEL_ASSETS: r2.binding });
  assert.equal(res.status, 200);
  const data = await json(res);
  assert.equal(data.ok, true);
  assert.equal(data.published, false);
  assert.equal(r2.calls.filter((call) => call.op === "head").length, 1);
  assert.equal(r2.calls.find((call) => call.op === "head").key, `studio-staging/assets/${VALID_ASSET_ID}`);
  assert.equal(calls.filter((call) => call.init.method === "POST").length, 1);
});

test("publish commit fail-closes when asset metadata is invalid", async () => {
  const calls = installAirtableMock();
  const r2 = installR2Mock({ malformedHead: true });
  const res = await handleStudioRequest(await req("/studio/api/model-preview/commit", {
    model_name: "Preview Model",
    field: "ST",
    layer: "Private / SIGIL",
    studio_review_id: "recReview1",
    idempotency_key: "publish_commit_bad_meta",
    asset_ids: [VALID_ASSET_ID],
    checklist: { safe: true },
    ledger_commit_confirmed: true,
    ledger_confirmation_phrase: "COMMIT_LEDGER_ONLY",
  }), { ...BASE_ENV, MMD_MODEL_ASSETS: r2.binding });
  assert.equal(res.status, 409);
  assert.equal((await json(res)).error, "r2_verification_failed");
  assert.equal(calls.filter((call) => call.init.method === "POST").length, 0);
});

for (const field of ["r2_key", "key", "storage_key", "bucket_name", "public_url", "r2_required_keys"]) {
  test(`intake rejects raw storage field alias: ${field}`, async () => {
    const res = await handleStudioRequest(await req("/studio/api/intake/validate", {
      model_name: "Raw Key Model",
      field: "ST",
      layer: "Private / SIGIL",
      template_hint: "MMD Compcard",
      files: [{ name: "a.webp", [field]: "studio-staging/assets/x" }],
    }), BASE_ENV);
    assert.equal(res.status, 400);
    const data = await json(res);
    assert.equal(data.error, "raw_storage_field_not_allowed");
    assert.equal(data.field, field);
  });
}

test("review rejects nested raw storage key aliases", async () => {
  const res = await handleStudioRequest(await req("/studio/api/review/validate", {
    model_name: "Nested Raw Key Model",
    field: "ST",
    layer: "Private / SIGIL",
    decision: "Needs Review",
    seed: { media: { storage_key: "studio-staging/assets/x" } },
  }), BASE_ENV);
  assert.equal(res.status, 400);
  assert.equal((await json(res)).field, "storage_key");
});

test("token query is not accepted as Studio admin auth", async () => {
  const res = await handleStudioRequest(await req("/studio/api/intake/validate?token=admin-t", {
    model_name: "Token Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }, { authed: false }), BASE_ENV);
  assert.equal(res.status, 401);
});

test("frontend line_user_id trust is rejected", async () => {
  const res = await handleStudioRequest(await req("/studio/api/intake/validate", {
    model_name: "Line Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
    line_user_id: "U123",
  }), BASE_ENV);
  assert.equal(res.status, 400);
  assert.equal((await json(res)).error, "line_user_id_not_allowed");
});

test("unapproved origin is rejected before Studio auth", async () => {
  const res = await handleStudioRequest(await req("/studio/api/intake/validate", {
    model_name: "Origin Model",
    field: "ST",
    layer: "Private / SIGIL",
    template_hint: "MMD Compcard",
  }, { headers: { origin: "https://evil.example" } }), BASE_ENV);
  assert.equal(res.status, 403);
  assert.equal((await json(res)).error, "origin_not_allowed");
});

async function sessionCookie(overrides = {}) {
  const now = Date.now();
  const payload = base64UrlEncode(JSON.stringify({
    version: 1,
    scope: "internal_admin",
    host: "https://mmdbkk.com",
    iat: now,
    exp: now + 8 * 60 * 60 * 1000,
    nonce: "studio-test-nonce",
    auth_method: "bearer",
    ...overrides,
  }));
  const signature = await signPayload(payload);
  return `mmd_admin_gate_v1=${encodeURIComponent(`${payload}.${signature}`)}`;
}

async function signPayload(payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(BASE_ENV.ADMIN_BEARER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function jpegBytes() {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]);
}

function pngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
}

function webpBytes() {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
}

function jpegFile(name = "studio.jpg") {
  return { bytes: jpegBytes(), type: "image/jpeg", name };
}

function pngFile(name = "studio.png") {
  return { bytes: pngBytes(), type: "image/png", name };
}

function webpFile(name = "studio.webp") {
  return { bytes: webpBytes(), type: "image/webp", name };
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return arrayBufferToHex(digest);
}

async function expectedAssetId(idempotencyKey) {
  return `studio_${await hmacHex(BASE_ENV.STUDIO_ASSET_SIGNING_SECRET, `studio-upload:${idempotencyKey}`)}`;
}

async function hmacHex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return arrayBufferToHex(signature);
}

function arrayBufferToHex(value) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
