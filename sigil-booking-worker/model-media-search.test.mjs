import test from "node:test";
import assert from "node:assert/strict";
import worker, { fetchPublicModelMedia, hydrateModelAssetPolicy, isPublicMedia } from "./src/model-image-policy-worker.js";
import bookingWorker, { buildCustomerDurationOffer, sanitizeModelForBooking } from "./src/index.js";
import runtimeWorker, { requestedScope } from "./src/runtime-index.js";

const modelId = "recModel000000001";
const secondModelId = "recModel000000002";
const mediaId = "media_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const primaryMediaId = "media_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const galleryMediaId = "media_cccccccc-cccc-cccc-cccc-cccccccccccc";
const clipMediaId = "media_dddddddd-dddd-dddd-dddd-dddddddddddd";
const secondPrimaryMediaId = "media_eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";


test("booking discovery requires canonical private folder entitlement and keeps protected models fail-closed", async () => {
  const record = {
    id: "recPrivateBooking01",
    fields: {
      working_name: "Atom IX",
      can_work_private: true,
      can_work_public: false,
      private_tier: "premium",
      private_real_name: "must-not-project",
      r2_prefix: "private/secret/path",
    },
  };

  assert.equal(sanitizeModelForBooking(record, { scope: "public", privateAllowed: false, env: {} }), null);
  assert.equal(sanitizeModelForBooking(record, { scope: "private", privateAllowed: false, allowedFolders: [], env: {} }), null);
  assert.equal(sanitizeModelForBooking(record, { scope: "booking", privateAllowed: false, allowedFolders: [], env: {} }), null);

  const booking = sanitizeModelForBooking(record, { scope: "booking", privateAllowed: true, allowedFolders: ["premium"], env: {} });
  assert.equal(booking.model_id, record.id);
  assert.equal(booking.working_name, "Atom IX");
  assert.equal(booking.scope, "private");
  assert.deepEqual(booking.duration_options, [90]);
  assert.equal(booking.booking_discovery, true);
  assert.equal(Object.hasOwn(booking, "private_real_name"), false);
  assert.equal(Object.hasOwn(booking, "drive_folder_id"), false);
  assert.equal(Object.hasOwn(booking, "r2_prefix"), false);

  assert.equal(sanitizeModelForBooking(record, { scope: "private", privateAllowed: true, allowedFolders: ["standard"], env: {} }), null);
  const privateAllowed = sanitizeModelForBooking(record, { scope: "private", privateAllowed: true, allowedFolders: ["premium"], env: {} });
  assert.equal(privateAllowed.model_id, record.id);

  const protectedRecord = {
    id: "recProtectedBooking1",
    fields: {
      working_name: "EMs11 Example",
      unique_key: "EMs11",
      can_work_private: true,
      private_tier: "exclusive",
    },
  };
  assert.equal(sanitizeModelForBooking(protectedRecord, { scope: "private", privateAllowed: true, allowedFolders: ["exclusive"], env: {} }), null);

  const getUrl = new URL("https://sigil.mmdbkk.com/sigil/api/models/search?q=Atom%20IX&scope=booking");
  assert.equal(await requestedScope(new Request(getUrl), getUrl), "booking");

  const postUrl = new URL("https://sigil.mmdbkk.com/sigil/api/models/search");
  assert.equal(await requestedScope(new Request(postUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: "booking" }),
  }), postUrl), "booking");
});

test("customer rate is explicitly tied to 90 minutes while Standard 120-minute price remains Per-review", () => {
  const offer = buildCustomerDurationOffer({
    duration_options: [90, 120],
    sales_control: {
      configured: true,
      price_visible: true,
      customer_rate_thb: 15000,
      requires_per_approval: false,
    },
  }, { requested_duration_minutes: 120, work_lane: "pn" });

  assert.equal(offer.price_visible, true);
  assert.equal(offer.customer_rate_thb, 15000);
  assert.equal(offer.base_rate_duration_minutes, 90);
  assert.deepEqual(offer.duration_offers, [
    {
      duration_minutes: 90,
      price_visible: true,
      customer_rate_thb: 15000,
      requires_per_approval: false,
      rate_review_required: false,
    },
    {
      duration_minutes: 120,
      price_visible: false,
      customer_rate_thb: null,
      requires_per_approval: true,
      rate_review_required: true,
    },
  ]);
  assert.equal(offer.requested_duration_offer.duration_minutes, 120);
  assert.equal(offer.requested_duration_offer.price_visible, false);
  assert.equal(offer.requested_duration_offer.customer_rate_thb, null);
  assert.equal(offer.rate_review_required, true);
});

test("Premium 90-minute offer may expose its canonical resolved customer rate", () => {
  const offer = buildCustomerDurationOffer({
    duration_options: [90],
    sales_control: {
      configured: true,
      price_visible: true,
      customer_rate_thb: 18000,
      requires_per_approval: false,
    },
  }, { requested_duration_minutes: 90, work_lane: "vip" });

  assert.equal(offer.base_rate_duration_minutes, 90);
  assert.equal(offer.requested_duration_offer.price_visible, true);
  assert.equal(offer.requested_duration_offer.customer_rate_thb, 18000);
  assert.equal(offer.rate_review_required, false);
});

test("registry lookup joins canonical Model links across pages without relying on names", async () => {
  const original = globalThis.fetch;
  const reads = [];
  globalThis.fetch = async (input, init = {}) => {
    assert.ok(!init.method || init.method === "GET");
    const url = new URL(input);
    reads.push(url);
    assert.doesNotMatch(url.searchParams.get("filterByFormula"), /FIND|ARRAYJOIN|Same Name/);
    return Response.json(url.searchParams.has("offset") ? { records: [
      item(secondPrimaryMediaId, { Model: [secondModelId], asset_role: "profile_main" }),
    ] } : { records: [
      item(primaryMediaId, { asset_role: "profile_main", media_type: "profile_photo" }),
      item(galleryMediaId),
      item(clipMediaId, { media_type: "intro_video", file_type: "video/mp4" }),
      item(`media_${"f".repeat(32)}`, { media_type: "private_gallery" }),
      item(`media_${"1".repeat(32)}`, { public_safe: false }),
    ], offset: "next-page" });
  };
  try {
    const grouped = await fetchPublicModelMedia(mediaEnv(), [{ model_id: modelId }, { model_id: secondModelId, working_name: "Same Name" }]);
    assert.equal(reads.length, 2);
    assert.equal(grouped.get(modelId).primary.media_id, primaryMediaId);
    assert.deepEqual(grouped.get(modelId).photos.map(m => m.media_id), [galleryMediaId]);
    assert.deepEqual(grouped.get(modelId).clips.map(m => m.media_id), [clipMediaId]);
    assert.equal(grouped.get(secondModelId).primary.media_id, secondPrimaryMediaId);
  } finally { globalThis.fetch = original; }
});

test("search returns only approved_media descriptors and removes every legacy storage field", async () => {
  await withMediaInventory({ assets: [
    item(primaryMediaId, { asset_role: "profile_main" }), item(galleryMediaId),
    item(clipMediaId, { media_type: "intro_video", file_type: "video/mp4" }),
    item(`media_${"2".repeat(32)}`, { review_status: "pending_review" }),
    item(`media_${"3".repeat(32)}`, { media_type: "private_gallery" }),
  ] }, async () => {
    const legacy = { model_id: modelId, scope: "public", working_name: "Public One", height_cm: 180,
      public_image_url: "https://drive.google.com/secret", cover_url: "https://storage.invalid/secret",
      r2_prefix: "private/secret", private_original_key: "private/secret", drive_folder_id: "secret",
      primary_image_url: "https://storage.invalid/secret", additional_images: [{ url: "https://storage.invalid/secret" }],
      approved_media: [{ media_id: "forged" }], arbitrary_url: "https://storage.invalid/secret" };
    const projected = await hydrateModelAssetPolicy(mediaEnv(), { ok: true, model: legacy, items: [legacy] });
    assert.deepEqual(projected.model, projected.items[0]);
    assert.deepEqual(projected.model.approved_media, [
      { media_id: primaryMediaId, media_source: "mmd_model_media_assets", kind: "photo" },
      { media_id: clipMediaId, media_source: "mmd_model_media_assets", kind: "clip" },
    ]);
    assert.deepEqual(projected.model.gallery_media, [{ media_id: galleryMediaId, media_source: "mmd_model_media_assets", kind: "photo" }]);
    assert.equal(projected.model.height_cm, 180);
    assert.equal(projected.model.primary_media_id, primaryMediaId);
    assert.doesNotMatch(JSON.stringify(projected), /https?:|drive_folder|private_original|r2_|public_image_url|cover_url|primary_image_url|additional_images/);
  });
});

test("missing credentials, registry failure, non-public and hidden Models never restore media fallbacks", async () => {
  const legacy = { model_id: modelId, scope: "public", public_image_url: "https://legacy.invalid/secret" };
  const noCredentials = await hydrateModelAssetPolicy({}, { ok: true, model: legacy, items: [legacy] });
  assert.deepEqual(noCredentials.model.approved_media, []);
  assert.doesNotMatch(JSON.stringify(noCredentials), /legacy.invalid|public_image_url/);
  for (const options of [
    { registryDown: true }, { modelFields: { can_work_public: false, can_work_private: true } },
    { modelFields: { status: "hidden" } }, { modelFields: { working_name: "EMs11 Protected" } }, { modelDown: true },
  ]) {
    await withMediaInventory(options, async () => {
      const result = await hydrateModelAssetPolicy(mediaEnv(), { ok: true, items: [legacy] });
      assert.deepEqual(result.items[0].approved_media, []);
      assert.doesNotMatch(JSON.stringify(result), /legacy.invalid|public_image_url/);
    });
  }
  await withMediaInventory({}, async () => {
    const result = await hydrateModelAssetPolicy(mediaEnv(), { ok: true, items: [{ ...legacy, scope: "private" }] });
    assert.deepEqual(result.items[0].approved_media, []);
  });
});

test("public media policy rejects unsafe, unapproved, ambiguous or mismatched registry assets", () => {
  const base = item(mediaId).fields;
  assert.equal(isPublicMedia(base), true);
  assert.equal(isPublicMedia({ ...base, review_status: "active" }), true, "Model gallery is available after upload");
  assert.equal(isPublicMedia({ ...base, review_status: "active", asset_role: "profile_main" }), false, "gallery cannot promote itself to cover");
  for (const override of [
    { Model: [] }, { Model: [modelId, secondModelId] }, { media_id: "unsafe/../id" },
    { media_type: "private_gallery" }, { review_status: "pending_review" }, { review_status: "revoked" },
    { public_safe: false }, { private_safe: true }, { flash_safe: true },
    { media_visibility: "private_candidate" }, { asset_role: "private_gallery" },
    { r2_bucket: "mmd-private-model-media" }, { private_original_key: "models/another/secret.webp" },
    { private_original_key: `models/${modelId}/../secret.webp` }, { file_type: "text/html" },
  ]) assert.equal(isPublicMedia({ ...base, ...override }), false, JSON.stringify(override));
});

test("public media GET streams approved R2 bytes, supports ranges and prevents authorization caching", async () => {
  await withMediaInventory({ assets: [item(mediaId, { media_type: "intro_video", file_type: "video/mp4" })] }, async (state) => {
    for (const [range, status, contentRange, length] of [[null, 200, null, "100"], ["bytes=0-9", 206, "bytes 0-9/100", "10"], ["bytes=-10", 206, "bytes 90-99/100", "10"], ["bytes=95-200", 206, "bytes 95-99/100", "5"]]) {
      const response = await worker.fetch(mediaRequest({ origin: "https://mmdbkk.com", ...(range ? { range } : {}) }), mediaEnv(state));
      assert.equal(response.status, status);
      assert.equal(response.headers.get("content-range"), contentRange);
      assert.equal(response.headers.get("content-length"), length);
      assert.equal(response.headers.get("access-control-allow-origin"), "https://mmdbkk.com");
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("cloudflare-cdn-cache-control"), "no-store");
      assert.equal(response.headers.get("location"), null);
      await response.arrayBuffer();
    }
    assert.equal(state.storageReads.length, 4);
    assert.equal(state.modelReads, 4);
    assert.equal(state.registryReads, 4);
    assert.deepEqual(state.storageReads[1].options, { range: { offset: 0, length: 10 } });
  });
});

test("media gate rechecks revocation and current public Model state on every request", async () => {
  await withMediaInventory({}, async (state) => {
    assert.equal((await worker.fetch(mediaRequest(), mediaEnv(state))).status, 200);
    state.assets[0].fields.review_status = "revoked";
    assert.equal((await worker.fetch(mediaRequest(), mediaEnv(state))).status, 404);
    state.assets[0].fields.review_status = "approved";
    state.modelFields.can_work_public = false;
    state.modelFields.can_work_private = true;
    assert.equal((await worker.fetch(mediaRequest(), mediaEnv(state))).status, 404);
    state.modelFields.can_work_public = true;
    state.modelFields.status = "hidden";
    assert.equal((await worker.fetch(mediaRequest(), mediaEnv(state))).status, 404);
    assert.equal(state.storageReads.length, 1);
  });
});

test("direct media requests fail closed for missing, duplicated, unlinked or unverified assets", async () => {
  for (const options of [
    { assets: [] }, { assets: [item(mediaId), item(mediaId)] }, { assets: [item(mediaId, { Model: [] })] },
    { registryDown: true }, { modelDown: true }, { objectOverride: { size: 99 } },
    { objectOverride: { customMetadata: { media_id: "other" } } },
    { objectOverride: { httpMetadata: { contentType: "text/html" } } },
  ]) await withMediaInventory(options, async (state) => {
    const response = await worker.fetch(mediaRequest({ origin: "https://sigil-booking.lovable.app" }), mediaEnv(state));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://sigil-booking.lovable.app");
    assert.doesNotMatch(await response.text(), /models\/|private_original|api.airtable/);
  });
});

test("MMD, Lovable and Webflow origins support GET, HEAD, preflight and readable denials", async () => {
  await withMediaInventory({}, async (state) => {
    for (const origin of mediaEnv().ALLOWED_ORIGINS.split(",")) {
      for (const method of ["GET", "HEAD", "OPTIONS"]) {
        const response = await worker.fetch(mediaRequest({ origin }, method), mediaEnv(state));
        assert.equal(response.status, method === "OPTIONS" ? 204 : 200);
        assert.equal(response.headers.get("access-control-allow-origin"), origin);
        assert.equal(response.headers.get("vary"), "Origin");
        if (method !== "GET") assert.equal((await response.arrayBuffer()).byteLength, 0);
      }
    }
    const readCount = state.registryReads;
    const blocked = await worker.fetch(mediaRequest({ origin: "https://untrusted.example" }), mediaEnv(state));
    assert.equal(blocked.status, 403);
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);
    assert.equal(state.registryReads, readCount);
    const method = await worker.fetch(mediaRequest({ origin: "https://mmdbkk.com" }, "POST"), mediaEnv(state));
    assert.equal(method.status, 405);
    for (const range of ["bytes=100-", "bytes=-0", "bytes=20-10", "bytes=-", "bytes=1-2,5-6"]) {
      assert.equal((await worker.fetch(mediaRequest({ range }), mediaEnv(state))).status, 416);
    }
    for (const suffix of ["../secret", "%broken", "not-a-media-id"]) {
      const response = await worker.fetch(new Request(`https://sigil.mmdbkk.com/sigil/api/models/media/${suffix}`), mediaEnv(state));
      assert.equal(response.status, 404);
    }
  });
});

test("runtime entrypoint GET and POST Public search expose the same approved_media contract without private Models", async () => {
  await withMediaInventory({ inventory: [
    { id: modelId, fields: { working_name: "Public One", can_work_public: true, status: "active" } },
    { id: secondModelId, fields: { working_name: "Private One", can_work_private: true, private_tier: "premium" } },
  ] }, async (state) => {
    for (const method of ["GET", "POST"]) {
      const response = await runtimeWorker.fetch(new Request(`https://sigil.mmdbkk.com/sigil/api/models/search${method === "GET" ? "?scope=public&search_mode=booking" : ""}`, {
        method, headers: { origin: "https://sigil-booking.lovable.app", "content-type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({ scope: "public", search_mode: "booking" }) } : {}),
      }), mediaEnv(state));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), "https://sigil-booking.lovable.app");
      const payload = await response.json();
      assert.deepEqual(payload.items.map(model => model.model_id), [modelId]);
      assert.deepEqual(payload.items[0].approved_media, []);
      assert.deepEqual(payload.items[0].gallery_media, [{ media_id: mediaId, media_source: "mmd_model_media_assets", kind: "photo" }]);
      assert.equal(payload.items[0].primary_media_id, "");
      assert.doesNotMatch(JSON.stringify(payload), /public_image_url|cover_url|https?:|private_original_key|r2_key|drive_folder/);
    }
  });
});

function item(id, overrides = {}) {
  const fields = {
    Model: [modelId], media_id: id, media_type: "public_gallery", asset_role: "gallery_candidate",
    media_visibility: "public_candidate", review_status: "approved", public_safe: true,
    r2_bucket: "mmd-models", file_type: "image/webp", file_size_bytes: 100, ...overrides,
  };
  fields.private_original_key = overrides.private_original_key || `models/${fields.Model[0]}/asset/${id}.webp`;
  return { id: `recAsset${id.replace(/[^a-z0-9]/gi, "")}`, fields };
}
function mediaRequest(headers = {}, method = "GET") {
  return new Request(`https://sigil.mmdbkk.com/sigil/api/models/media/${mediaId}`, { method, headers });
}
function mediaEnv(state = {}) {
  const read = async (key, options) => {
    state.storageReads.push({ key, options });
    const asset = state.assets.find(asset => asset.fields.private_original_key === key)?.fields;
    if (!asset) return null;
    return { body: new Uint8Array(options?.range?.length || 100), size: 100,
      httpMetadata: { contentType: asset.file_type },
      customMetadata: { media_id: asset.media_id, model_record_id: asset.Model[0], sha256: "a".repeat(64) },
      ...state.objectOverride };
  };
  return { AIRTABLE_API_KEY: "synthetic", AIRTABLE_BASE_ID: "base",
    ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com,https://sigil-booking.lovable.app,https://mmdprive.webflow.io",
    MMD_MODEL_ASSETS: { get: read, head: read } };
}
async function withMediaInventory(options, run) {
  const state = { assets: [item(mediaId)], modelFields: { can_work_public: true, status: "active" },
    storageReads: [], modelReads: 0, registryReads: 0, ...options };
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    assert.ok(!init.method || init.method === "GET", "media reads must never mutate records");
    const url = new URL(input);
    if (url.pathname.endsWith("/tblrpQXhHnbTU9RhW")) {
      state.registryReads++;
      return state.registryDown ? new Response(null, { status: 503 }) : Response.json({ records: state.assets });
    }
    if (/\/Models\/rec/.test(url.pathname)) {
      state.modelReads++;
      const id = url.pathname.split("/").pop();
      return state.modelDown ? new Response(null, { status: 503 }) : Response.json({ id, fields: state.modelFields });
    }
    if (url.pathname.endsWith("/Models")) return Response.json({ records: state.inventory || [] });
    return Response.json({ records: [] });
  };
  try { await run(state); } finally { globalThis.fetch = original; }
}

test("booking intake stores approved MMD media registry provenance and fails closed on unknown sources", async () => {
  const originalFetch = globalThis.fetch;
  const persisted = [];
  globalThis.fetch = async (url, init = {}) => {
    assert.match(String(url), /^https:\/\/api\.airtable\.com\/v0\/test-base\//);
    if (init.method === "POST") {
      const fields = JSON.parse(init.body).fields;
      persisted.push(fields);
      return Response.json({ id: "recTestBooking", fields });
    }
    return Response.json({ records: [] });
  };
  try {
    for (const [source, expected] of [["mmd_model_media_assets", "mmd_model_media_assets"], ["unexpected_source", "manual_review"]]) {
      const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/booking/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ booking_ref: `test_${source}`, selected_model_id: modelId, model_asset_source: source, suppress_telegram_notify: true }),
      }), { AIRTABLE_API_KEY: "test-key", AIRTABLE_BASE_ID: "test-base" });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).ok, true);
      assert.equal(persisted.at(-1).model_asset_source, expected);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("SIGIL Search intake requires budget, strips customer-supplied storage URLs, and persists Per-review draft context", async () => {
  const originalFetch = globalThis.fetch;
  const persisted = [];
  globalThis.fetch = async (url, init = {}) => {
    assert.match(String(url), /^https:\/\/api\.airtable\.com\/v0\/test-base\//);
    if (init.method === "POST") {
      const fields = JSON.parse(init.body).fields;
      persisted.push(fields);
      return Response.json({ id: "recSearchDraft", fields });
    }
    return Response.json({ records: [] });
  };
  try {
    const missingBudget = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/booking/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        search_mode: "search",
        lane: "private",
        model_scope: "private",
        customer_lane: "both",
        work_lane: "pn",
        spec: "สูง คุยอังกฤษได้",
        suppress_telegram_notify: true,
      }),
    }), { AIRTABLE_API_KEY: "test-key", AIRTABLE_BASE_ID: "test-base" });
    assert.equal(missingBudget.status, 422);
    assert.equal((await missingBudget.json()).error, "budget_required");
    assert.equal(persisted.length, 0);

    const accepted = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/booking/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        booking_ref: "search_001",
        request_status: "confirmed", // forged customer input must be ignored
        search_mode: "search",
        lane: "private",
        model_scope: "private",
        customer_lane: "both",
        work_lane: "pn",
        budget_thb: 15000,
        spec: "สูง คุยอังกฤษได้",
        preferred_model_name: "Jasper",
        telegram_post_url: "https://t.me/c/1668261779/1234",
        fallback_allowed: true,
        duration_minutes: 90,
        service_context: "dinner",
        review_requested: true,
        resolved_image_url: "https://drive.google.com/private.jpg",
        drive_folder_id_snapshot: "drive-secret-folder",
        r2_key_snapshot: "private/key.webp",
        resolver_payload_json: { filters: { review_requested: true } },
        suppress_telegram_notify: true,
      }),
    }), { AIRTABLE_API_KEY: "test-key", AIRTABLE_BASE_ID: "test-base" });
    assert.equal(accepted.status, 200);
    const acceptedPayload = await accepted.json();
    assert.equal(acceptedPayload.ok, true);
    assert.equal(acceptedPayload.request_status, "request_pending_admin_review");
    const fields = persisted.at(-1);
    assert.equal(fields["Request Status"], "draft");
    assert.equal(fields.Source, "sigil_search");
    assert.equal(Object.hasOwn(fields, "resolved_image_url"), false);
    assert.equal(Object.hasOwn(fields, "drive_folder_id_snapshot"), false);
    assert.equal(Object.hasOwn(fields, "r2_key_snapshot"), false);
    const resolver = JSON.parse(fields.resolver_payload_json);
    assert.equal(resolver.job_creation_state, "waiting_for_per");
    assert.equal(resolver.customer_search.budget.max_thb, 15000);
    assert.equal(resolver.customer_search.customer_lane, "both");
    assert.equal(resolver.customer_search.work_lane, "pn");
    assert.equal(resolver.customer_search.telegram_reference, "https://t.me/c/1668261779/1234");
    assert.equal(resolver.customer_search.duration_minutes, 90);
    assert.equal(resolver.customer_search.service_context, "dinner");
    assert.equal(resolver.customer_search.review_requested, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Public Model search and intake reject a budget below 5,000 THB", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return Response.json({ records: [] });
  };
  try {
    const searchResponse = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/models/search?scope=public&search_mode=search&budget_thb=4999"), {
      AIRTABLE_API_KEY: "test-key",
      AIRTABLE_BASE_ID: "test-base",
    });
    assert.equal(searchResponse.status, 200);
    const searchBody = await searchResponse.json();
    assert.equal(searchBody.validation_error, true);
    assert.deepEqual(searchBody.errors, ["public_budget_below_minimum"]);
    assert.equal(fetchCount, 0);

    const intakeResponse = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/booking/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        booking_ref: "public_budget_4999",
        search_mode: "search",
        lane: "public",
        model_scope: "public",
        customer_lane: "both",
        budget_thb: 4999,
        suppress_telegram_notify: true,
      }),
    }), {
      AIRTABLE_API_KEY: "test-key",
      AIRTABLE_BASE_ID: "test-base",
    });
    assert.equal(intakeResponse.status, 422);
    assert.equal((await intakeResponse.json()).error, "public_budget_below_minimum");
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Public Model intake restores MMD Public Job V2 and rejects PN/VIP semantics", async () => {
  const originalFetch = globalThis.fetch;
  const persisted = [];
  globalThis.fetch = async (url, init = {}) => {
    assert.match(String(url), /^https:\/\/api\.airtable\.com\/v0\/test-base\//);
    if (init.method === "POST") {
      const fields = JSON.parse(init.body).fields;
      persisted.push(fields);
      return Response.json({ id: "recPublicDraft", fields });
    }
    return Response.json({ records: [] });
  };
  try {
    const forbidden = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/booking/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        booking_ref: "public_forbidden_pn",
        lane: "public",
        model_scope: "public",
        work_lane: "pn",
        job_class: "pn",
        suppress_telegram_notify: true,
      }),
    }), { AIRTABLE_API_KEY: "test-key", AIRTABLE_BASE_ID: "test-base" });
    assert.equal(forbidden.status, 422);
    assert.equal((await forbidden.json()).error, "public_job_private_type_forbidden");
    assert.equal(persisted.length, 0);

    const invalidCare = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/booking/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        booking_ref: "public_invalid_care",
        lane: "public",
        model_scope: "public",
        public_job: {
          schema_version: "mmd_public_job_v2",
          format: "dining",
          duties: "ไปทานข้าวและช่วยดูแลแขก",
          customer_count: 2,
          care_count: 3,
          model_count: 1,
        },
        suppress_telegram_notify: true,
      }),
    }), { AIRTABLE_API_KEY: "test-key", AIRTABLE_BASE_ID: "test-base" });
    assert.equal(invalidCare.status, 422);
    assert.equal((await invalidCare.json()).error, "public_job_care_count_invalid");
    assert.equal(persisted.length, 0);

    const accepted = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/booking/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        booking_ref: "public_job_v2_001",
        lane: "public",
        model_scope: "public",
        job_class: "dining",
        customer_lane: "both",
        public_job: {
          schema_version: "mmd_public_job_v2",
          format: "dining",
          duties: "ไปทานข้าวด้วยกันและช่วยคุยกับแขก",
          customer_count: 8,
          care_count: 3,
          special_care_names: "คุณ A, คุณ B",
          model_count: 3,
          model_assignment_note: "1 คนดูแลแขกหลัก ที่เหลือดูแลกลุ่ม",
          presentation_note: "Smart casual",
          remark: "Public dinner",
        },
        suppress_telegram_notify: true,
      }),
    }), { AIRTABLE_API_KEY: "test-key", AIRTABLE_BASE_ID: "test-base" });
    assert.equal(accepted.status, 200);
    const acceptedBody = await accepted.json();
    assert.equal(acceptedBody.ok, true);
    assert.equal(acceptedBody.public_job.format, "dining");
    assert.equal(acceptedBody.public_job.customer_count, 8);
    assert.equal(acceptedBody.public_job.care_count, 3);
    assert.equal(acceptedBody.public_job.model_count, 3);

    const fields = persisted.at(-1);
    assert.equal(fields.lane, "public");
    assert.equal(fields.model_scope, "public");
    assert.equal(fields.job_class, "travel");
    assert.doesNotMatch(fields["Preference Text"], /\b(?:PN|VIP)\b/i);
    const resolver = JSON.parse(fields.resolver_payload_json);
    assert.equal(resolver.public_job.schema_version, "mmd_public_job_v2");
    assert.equal(resolver.public_job.format, "dining");
    assert.equal(resolver.public_job.customer_count, 8);
    assert.equal(resolver.public_job.care_count, 3);
    assert.equal(resolver.public_job.model_count, 3);
    assert.equal(resolver.customer_search.work_lane, "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("SIGIL private denial is readable to approved browser origins without leaking cross-origin CORS", async () => {
  const env = {
    ALLOWED_ORIGINS: "https://mmdprive.webflow.io,https://sigil-booking.lovable.app",
  };
  for (const origin of ["https://mmdprive.webflow.io", "https://sigil-booking.lovable.app"]) {
    const denied = await runtimeWorker.fetch(new Request(
      "https://sigil.mmdbkk.com/sigil/api/models/search?scope=private&booking_ref=not-a-stored-record",
      { headers: { Origin: origin } },
    ), env);
    assert.equal(denied.status, 200);
    assert.equal((await denied.json()).blocked, true);
    assert.equal(denied.headers.get("access-control-allow-origin"), origin);
    assert.equal(denied.headers.get("cache-control"), "no-store");
    assert.equal(denied.headers.get("vary"), "Origin");
  }
  const blocked = await runtimeWorker.fetch(new Request(
    "https://sigil.mmdbkk.com/sigil/api/models/search?scope=private",
    { headers: { Origin: "https://untrusted.example" } },
  ), env);
  assert.equal((await blocked.json()).blocked, true);
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);
});


const filterModel = (id, fields) => ({ id, fields: { working_name: id, status: "active", ...fields } });
const filterSnapshot = {
  schema_version: "my_mmd_entitlement_resolver_v1", fail_closed: true, member_blocked: false,
  access: { private_visibility_envelope: "premium", new_model_reveals_allowed: true },
};
async function withFilterInventory(models, run, { stored = false, secondPage = [] } = {}) {
  const original = globalThis.fetch;
  const reads = [];
  globalThis.fetch = async (input, init = {}) => {
    assert.ok(!init.method || init.method === "GET", "search must never mutate a record");
    const url = new URL(input);
    reads.push(url);
    const table = decodeURIComponent(url.pathname.split("/").pop());
    if (table === "Models") return Response.json(url.searchParams.get("offset") === "page-two"
      ? { records: secondPage } : { records: models, ...(secondPage.length ? { offset: "page-two" } : {}) });
    if (table === "SIGIL Booking Requests" && stored) return Response.json({ records: [{
      id: "recStoredFilterRequest", fields: { member_status: "active", access_scope: "public_private",
        resolver_payload_json: JSON.stringify({ entitlement_snapshot: filterSnapshot }) },
    }] });
    return Response.json({ records: [] });
  };
  try { await run(reads); } finally { globalThis.fetch = original; }
}
const filterEnv = { AIRTABLE_API_KEY: "synthetic-key", AIRTABLE_BASE_ID: "synthetic-base" };

test("Booking filters work without a name and include eligible records after the first Airtable page", async () => {
  const hiddenPage = Array.from({ length: 100 }, (_, i) => filterModel(`recHidden${i}`, { status: "hidden", can_work_public: true }));
  const publicPage = [
    filterModel("recPublicStraight", { can_work_public: true, orientation_label: "Straight" }),
    filterModel("recPublicBoth", { can_work_public: true, orientation_label: "Both" }),
    filterModel("recPublicGay", { can_work_public: true, orientation_label: "Gay" }),
    filterModel("recPublicUnknown", { can_work_public: true }),
    filterModel("recPrivateOnly", { can_work_private: true, private_tier: "premium", orientation_label: "Straight" }),
  ];
  await withFilterInventory(hiddenPage, async (reads) => {
    const response = await bookingWorker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/models/search?scope=public&search_mode=booking&customer_lane=straight"), filterEnv);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.items.map(m => m.model_id), ["recPublicStraight", "recPublicBoth"]);
    assert.ok(reads.some(url => url.searchParams.get("offset") === "page-two"));
    assert.equal(body.items.some(m => m.scope === "private"), false);
  }, { secondPage: publicPage });
});

test("customer body and skin filters use only canonical model profile values", async () => {
  const inventory = [
    filterModel("recProfileMatch", { can_work_public: true, height_cm: 178, weight_kg: 72, body_type: "athletic", skin_tone: "medium", private_admin_note: "never project" }),
    filterModel("recProfileOther", { can_work_public: true, height_cm: 178, weight_kg: 72, body_type: "slim", skin_tone: "medium" }),
    filterModel("recProfileMissing", { can_work_public: true, body_type: "athletic" }),
  ];
  await withFilterInventory(inventory, async () => {
    const response = await bookingWorker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/models/search?scope=public&search_mode=booking&min_height_cm=170&max_height_cm=185&min_weight_kg=60&body_type=athletic&skin_tone=medium"), filterEnv);
    const body = await response.json();
    assert.deepEqual(body.items.map(model => model.model_id), ["recProfileMatch"]);
    assert.deepEqual({ height_cm: body.items[0].height_cm, weight_kg: body.items[0].weight_kg, body_type: body.items[0].body_type, skin_tone: body.items[0].skin_tone },
      { height_cm: 178, weight_kg: 72, body_type: "athletic", skin_tone: "medium" });
    assert.equal(Object.hasOwn(body.items[0], "private_admin_note"), false);
  });
});

test("Create Job scope filters combine allowed group, Straight/Gay and canonical PN/VIP capabilities", async () => {
  const fields = { can_work_private: true, private_tier: "premium", orientation_label: "Straight" };
  const inventory = [
    filterModel("recVipPremium", { ...fields, private_service_level: "vip" }),
    filterModel("recPnPremium", { ...fields, private_service_level: "pn" }),
    filterModel("recUnknownPremium", fields),
    filterModel("recVipGay", { ...fields, private_service_level: "vip", orientation_label: "Gay" }),
    filterModel("recVipStandard", { ...fields, private_service_level: "vip", private_tier: "standard" }),
    filterModel("recVipExclusive", { ...fields, private_service_level: "vip", private_tier: "exclusive" }),
  ];
  await withFilterInventory(inventory, async () => {
    for (const [work, expected] of [["vip", ["recVipPremium"]], ["pn", ["recVipPremium", "recPnPremium"]]]) {
      const response = await bookingWorker.fetch(new Request(`https://sigil.mmdbkk.com/sigil/api/models/search?scope=private&search_mode=booking&booking_ref=synthetic&selected_access_folder=premium&customer_lane=straight&work_lane=${work}`), filterEnv);
      const body = await response.json();
      assert.deepEqual(body.items.map(m => m.model_id), expected);
      assert.deepEqual(body.items[0].private_work_capabilities, ["vip", "pn"]);
      assert.equal(body.visibility_enforced, true);
    }
    const forbidden = await bookingWorker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/models/search?scope=private&search_mode=booking&booking_ref=synthetic&selected_access_folder=exclusive"), filterEnv);
    assert.equal((await forbidden.json()).blocked, true);
  }, { stored: true });
});

test("filter-only Private Booking remains closed without canonical membership", async () => {
  await withFilterInventory([], async (reads) => {
    const response = await bookingWorker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/models/search?scope=private&search_mode=booking&selected_access_folder=premium&customer_lane=straight&work_lane=pn"), filterEnv);
    const body = await response.json();
    assert.equal(body.blocked, true);
    assert.deepEqual(body.items, []);
    assert.equal(reads.some(url => url.pathname.endsWith("/Models")), false);
  });
});

test("customer Booking rejects Live/Group and stores MK/Burn only as draft preferences", async () => {
  const original = globalThis.fetch;
  const persisted = [];
  globalThis.fetch = async (input, init = {}) => {
    if (init.method === "POST") {
      const fields = JSON.parse(init.body).fields;
      persisted.push(fields);
      return Response.json({ id: "recSyntheticOptions", fields });
    }
    return Response.json({ records: [] });
  };
  const request = (options, scope = "private") => new Request("https://sigil.mmdbkk.com/sigil/api/booking/intake", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ booking_ref: "synthetic-option-draft", lane: scope, search_mode: "booking",
      service_options: options, suppress_telegram_notify: true }),
  });
  try {
    for (const options of [["live"], ["group"], ["mk", "live"], "mk"]) {
      const response = await bookingWorker.fetch(request(options), filterEnv);
      assert.equal(response.status, 422);
      assert.equal((await response.json()).error, "customer_booking_service_option_invalid");
    }
    assert.equal(persisted.length, 0);
    const publicResponse = await bookingWorker.fetch(request(["mk"], "public"), filterEnv);
    assert.equal(publicResponse.status, 422);
    const accepted = await bookingWorker.fetch(request(["mk", "burn", "mk"]), filterEnv);
    assert.equal(accepted.status, 200);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]["Request Status"], "draft");
    const resolver = JSON.parse(persisted[0].resolver_payload_json);
    assert.deepEqual(resolver.customer_search.service_options, ["mk", "burn"]);
    assert.deepEqual(resolver.filters.service_options, ["mk", "burn"]);
    assert.equal(resolver.job_creation_state, "waiting_for_per");
  } finally { globalThis.fetch = original; }
});

