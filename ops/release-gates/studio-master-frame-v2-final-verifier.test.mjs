import assert from "node:assert/strict";
import test from "node:test";

import { readPngDimensions, validateStudioJob, verifyStudioMasterFrameV2 } from "./studio-master-frame-v2-final-verifier.mjs";

function png(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("reads PNG IHDR dimensions", () => {
  assert.deepEqual(readPngDimensions(png(1322, 1200)), { width: 1322, height: 1200 });
  assert.throws(() => readPngDimensions(new Uint8Array([1, 2, 3])), /preview_not_png/);
});

test("validates a private Studio draft summary", () => {
  assert.equal(validateStudioJob({
    model_record_id: "rec12345678901234",
    job_id: "card_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    width: 1322,
    height: 1200,
    published: false,
    state: "awaiting_owner_review",
    model_name: "Gaz",
  }, {
    modelRecordId: "rec12345678901234",
    cardJobId: "card_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    expectedName: "Gaz|Gazz",
  }), true);

  assert.throws(() => validateStudioJob({
    model_record_id: "rec12345678901234",
    job_id: "card_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    width: 1322,
    height: 1200,
    published: true,
    state: "awaiting_owner_review",
    model_name: "Gaz",
  }, {
    modelRecordId: "rec12345678901234",
    cardJobId: "card_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }), /studio_card_must_remain_private_draft/);
});

test("verifies Studio final gates from live-like responses", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === "https://www.mmdbkk.com/studio") {
      return new Response('<div id="mmdStudioUploadR5"><section id="mmd-auto-card-inbox" data-list="/studio/api/model-cards/list"></section></div>', { status: 200, headers: { "content-type": "text/html" } });
    }
    if (String(url) === "https://www.mmdbkk.com/studio/api/model-cards/list") {
      assert.equal(init.headers["x-internal-token"], "owner-token");
      return jsonResponse({
        ok: true,
        enabled: true,
        jobs: [{
          model_record_id: "rec12345678901234",
          job_id: "card_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          width: 1322,
          height: 1200,
          published: false,
          state: "awaiting_owner_review",
          model_name: "Gaz",
        }],
      });
    }
    if (String(url) === "https://www.mmdbkk.com/studio/api/model-cards/preview") {
      return new Response(png(1322, 1200), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-disposition": 'inline; filename="card_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1322x1200.png"',
        },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const evidence = await verifyStudioMasterFrameV2({
    studioPageUrl: "https://www.mmdbkk.com/studio",
    apiBaseUrl: "https://www.mmdbkk.com",
    modelRecordId: "rec12345678901234",
    cardJobId: "card_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    internalToken: "owner-token",
    expectedName: "Gaz|Gazz",
    ownerReviewRef: "Boss Per reviewed Gaz card preview 2026-09-29",
  }, fetchImpl);

  assert.equal(evidence.gates.webflow_studio_v2_published.status, "pass");
  assert.equal(evidence.gates.finished_png_returned.status, "pass");
  assert.equal(evidence.preview_dimensions.width, 1322);
  assert.equal(calls.length, 3);
});

test("rejects missing real Gaz inputs", async () => {
  await assert.rejects(() => verifyStudioMasterFrameV2({}, async () => new Response("")), /GAZ_MODEL_RECORD_ID_required/);
});

test("rejects sensitive fields in Studio job summaries", () => {
  assert.throws(() => validateStudioJob({
    model_record_id: "rec12345678901234",
    job_id: "card_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    width: 1322,
    height: 1200,
    published: false,
    state: "awaiting_owner_review",
    model_name: "Gaz",
    r2_key: "private/path.png",
  }, {
    modelRecordId: "rec12345678901234",
    cardJobId: "card_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }), /studio_job_contains_sensitive_payload/);
});
