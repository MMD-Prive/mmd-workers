import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const workerBundle = resolve(here, "../.tmp/sigil-booking-api-worker.mjs");
mkdirSync(dirname(workerBundle), { recursive: true });

await build({
  entryPoints: [resolve(here, "../src/index.ts")],
  outfile: workerBundle,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
});

const worker = (await import(pathToFileURL(workerBundle).href + `?v=${Date.now()}`)).default;

const env = {
  AIRTABLE_API_KEY: "test-airtable",
  AIRTABLE_BASE_ID: "appTest",
  AIRTABLE_TABLE_MODELS: "Models",
  ENABLE_AIRTABLE_SYNC: "true",
  PUBLIC_ALLOWED_ORIGINS: "https://sigil.mmdbkk.com",
};

const ALLOWED_PUBLIC_MODEL_KEYS = new Set([
  "model_id",
  "display_name",
  "status",
  "cover_url",
  "gallery_count",
  "service_fit_tags",
  "asset_status",
  "public_safe",
]);

const FORBIDDEN_PUBLIC_TEXT = /recModelKenji|r2_prefix|primary_image_key|orientation_label|straight|sexuality|drive\.google|telegram|line_user|phone|gmail|admin_notes|internal|private_pricing|token|raw Airtable|redirect_url|stack/i;

function kenjiFields(overrides = {}) {
  return {
    model_id: "kenji",
    "Model Name": "Kenji",
    "Model Status": "active",
    visibility: "public",
    r2_prefix: "models/private/kenji/",
    primary_image_key: "models/private/kenji/card.webp",
    orientation_label: "straight",
    "Drive Folder": "https://drive.google.com/drive/folders/private",
    admin_notes: "do not leak",
    telegram_username: "@secret",
    phone: "0999999999",
    ...overrides,
  };
}

function modelRecord(fields) {
  return { id: "recModelKenji", fields };
}

function airtableTableName(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || "");
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function withModelFixture(fields, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    if (url.hostname !== "api.airtable.com") return originalFetch(request);
    assert.equal(request.method, "GET");
    assert.equal(airtableTableName(url), "Models");
    return jsonResponse({ records: [modelRecord(fields)] });
  };
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function call(path, init = {}, envOverride = {}) {
  return worker.fetch(new Request(`https://sigil.mmdbkk.com${path}`, { method: init.method || "GET", ...init }), {
    ...env,
    ...envOverride,
  });
}

async function jsonBody(response) {
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  return response.json();
}

function assertPublicModelShape(model) {
  assert.deepEqual(Object.keys(model).sort(), Array.from(ALLOWED_PUBLIC_MODEL_KEYS).sort());
  assert.equal(model.model_id, "kenji");
  assert.equal(model.display_name, "Kenji");
  assert.equal(model.status, "active");
  assert.equal(model.public_safe, true);
  assert.doesNotMatch(JSON.stringify(model), FORBIDDEN_PUBLIC_TEXT);
}

await (async () => {
  const response = await call("/sigil/booking?t=raw_token_should_not_render");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(html, /SĪGIL \/ BOOKING \/ REQUEST/);
  assert.match(html, /fetch\("\/v1\/public\/booking-request"/);
  assert.doesNotMatch(html, /fetch\("\/sigil\/booking"/);
  assert.doesNotMatch(html, /immigrate-worker\.malemodel-bkk\.workers\.dev\/v1\/public\/booking-request/);
  assert.doesNotMatch(html, /https:\/\/sigil\.mmdbkk\.com\/v1\/public\/booking-request/);
  assert.doesNotMatch(html, /https:\/\/mmdbkk\.com\/v1\/public\/booking-request/);
  assert.doesNotMatch(html, /raw_token_should_not_render/);
  assert.doesNotMatch(html, /orientation_label|r2_prefix|primary_image_key|airtable_record_id|redirect_url|raw token/i);
})();

await (async () => {
  const payload = {
    source: "sigil_booking_page",
    booking_lane: "standard",
    request_mode: "standard_search",
    job_type: "private_booking",
    package_tier: "private_booking",
    duration_hours: 2,
    booking_date: "2026-07-01",
    start_time: "18:00",
    end_time: "20:00",
    area: "Bangkok",
    client_name: "Test Client",
    contact: "line:test-client",
    selected_model_name: "Kenji",
    model_lookup_key: "kenji",
    budget: 12000,
    brief: "Request pending review for Kenji.",
    note: "Request pending review only.",
  };
  const response = await call("/v1/public/booking-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }, {
    ENABLE_AIRTABLE_SYNC: "false",
  });
  const body = await jsonBody(response);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.match(body.request_id, /^bkreq_/);
  assert.equal(body.booking_id, body.request_id);
  assert.equal(body.record_id, body.request_id);
  assert.doesNotMatch(JSON.stringify(body), /airtable_record_id|redirect_url|raw_token|upstream|stack/i);
})();

await (async () => {
  const response = await call("/sigil/booking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      brief: "Should not reach public handler.",
      booking_lane: "standard",
      request_mode: "standard_search",
      job_type: "private_booking",
      package_tier: "private_booking",
      duration_hours: 2,
      booking_date: "2026-07-01",
      start_time: "18:00",
      area: "Bangkok",
      client_name: "Test Client",
      contact: "line:test-client",
    }),
  }, {
    ENABLE_AIRTABLE_SYNC: "false",
  });
  assert.notEqual(response.status, 200);
  assert.match(response.headers.get("location") || "", /\/sigil\/admin\/login/);
})();

await withModelFixture(kenjiFields(), async () => {
  const response = await call("/api/sigil/models/search?q=kenji");
  const body = await jsonBody(response);
  assert.equal(response.status, 200);
  assert.equal(body.status, "models_found");
  assert.equal(body.models.length, 1);
  const model = body.models[0];
  assertPublicModelShape(model);
  assert.equal(model.cover_url, "");
  assert.equal(model.gallery_count, 0);
  assert.deepEqual(model.service_fit_tags, []);
  assert.equal(model.asset_status, "drive_pending_sync");
  assert.doesNotMatch(JSON.stringify(body), FORBIDDEN_PUBLIC_TEXT);
});

await withModelFixture(kenjiFields({
  "Public Image URL": "https://cdn.example.com/models/kenji/card.webp",
}), async () => {
  const response = await call("/api/sigil/models/search?q=kenji");
  const body = await jsonBody(response);
  const model = body.models[0];
  assertPublicModelShape(model);
  assert.equal(model.cover_url, "https://cdn.example.com/models/kenji/card.webp");
  assert.equal(model.asset_status, "ready");
});

await withModelFixture(kenjiFields({
  "Client Fit Tags": ["private-fit", "travel-fit", "internal-vip", "orientation:straight"],
}), async () => {
  const response = await call("/api/sigil/models/search?q=kenji");
  const body = await jsonBody(response);
  const model = body.models[0];
  assertPublicModelShape(model);
  assert.deepEqual(model.service_fit_tags, ["private-fit", "travel-fit"]);
});

await withModelFixture(kenjiFields({
  "Public Image URL": "https://cdn.example.com/models/kenji/card.webp",
  "Approved Gallery Count": 3,
  "Public Fit Tags": "private-fit, travel-fit, internal-vip",
}), async () => {
  const arrivalsResponse = await call("/api/sigil/models/new-arrivals");
  const arrivalsBody = await jsonBody(arrivalsResponse);
  assert.equal(arrivalsResponse.status, 200);
  assert.equal(arrivalsBody.status, "models_found");
  assertPublicModelShape(arrivalsBody.models[0]);
  assert.equal(arrivalsBody.models[0].cover_url, "https://cdn.example.com/models/kenji/card.webp");
  assert.equal(arrivalsBody.models[0].gallery_count, 3);
  assert.deepEqual(arrivalsBody.models[0].service_fit_tags, ["private-fit", "travel-fit"]);

  const detailResponse = await call("/api/sigil/models/detail?model_id=kenji");
  const detailBody = await jsonBody(detailResponse);
  assert.equal(detailResponse.status, 200);
  assert.equal(detailBody.status, "model_found");
  assertPublicModelShape(detailBody.model);
  assert.equal(detailBody.model.cover_url, "https://cdn.example.com/models/kenji/card.webp");
  assert.equal(detailBody.model.gallery_count, 3);
  assert.deepEqual(detailBody.model.service_fit_tags, ["private-fit", "travel-fit"]);
});
