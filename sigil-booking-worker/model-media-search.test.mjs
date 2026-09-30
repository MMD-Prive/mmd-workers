import test from "node:test";
import assert from "node:assert/strict";
import worker, { fetchPublicModelMedia, hydrateModelAssetPolicy, isPublicMedia } from "./src/model-image-policy-worker.js";
import { buildCustomerDurationOffer, sanitizeModelForBooking } from "./src/index.js";
import { requestedScope } from "./src/runtime-index.js";

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
        search_mode: "search",
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
    assert.equal((await accepted.json()).ok, true);
    const fields = persisted.at(-1);
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
