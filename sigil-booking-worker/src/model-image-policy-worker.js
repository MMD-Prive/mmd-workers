import bookingWorker from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const MODEL_SEARCH_PATH = "/sigil/api/models/search";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = normalizePath(url.pathname);
    const response = await bookingWorker.fetch(request, env, ctx);

    if (!shouldHydrateModelAssets(method, path, response)) return response;

    const original = await response.clone().json().catch(() => null);
    if (!original || original.ok !== true) return response;

    const hydrated = await hydrateModelAssetPolicy(env, original).catch(() => original);
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(JSON.stringify(hydrated), { status: response.status, headers });
  },
};

function shouldHydrateModelAssets(method, path, response) {
  if ((method !== "GET" && method !== "POST") || path !== MODEL_SEARCH_PATH) return false;
  if (!response || !response.ok) return false;
  const contentType = response.headers.get("content-type") || "";
  return !contentType || contentType.includes("json");
}

async function hydrateModelAssetPolicy(env, payload) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return payload;

  const models = collectModels(payload);
  if (!models.length) return payload;

  const table = env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || "Models";
  const cache = new Map();
  const hydratedModels = [];

  for (const model of models) {
    const modelId = clean(model?.model_id || model?.model_record_id);
    if (!modelId) {
      hydratedModels.push(model);
      continue;
    }
    if (!cache.has(modelId)) cache.set(modelId, fetchModelRecord(env, table, modelId));
    const record = await cache.get(modelId).catch(() => null);
    hydratedModels.push(record ? applyImagePolicy(model, record.fields || {}, env) : model);
  }

  let cursor = 0;
  const next = { ...payload };
  if (payload.model) next.model = hydratedModels[cursor++] || payload.model;
  if (Array.isArray(payload.items)) next.items = payload.items.map(() => hydratedModels[cursor++] || null).filter(Boolean);
  if (next.model && Array.isArray(next.items)) {
    const first = next.items[0];
    if (first && clean(first.model_id) === clean(next.model.model_id)) next.model = first;
  }
  next.asset_policy = "standard_premium_real_photo__gws_ems_ai_image";
  return next;
}

function collectModels(payload) {
  const out = [];
  if (payload.model && typeof payload.model === "object") out.push(payload.model);
  if (Array.isArray(payload.items)) out.push(...payload.items.filter((item) => item && typeof item === "object"));
  return out;
}

async function fetchModelRecord(env, table, recordId) {
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  if (!response.ok) return null;
  return response.json();
}

function applyImagePolicy(model, fields, env) {
  const policy = detectImagePolicy(fields, model);
  const real = resolveRealPhotoAsset(fields, env);
  const ai = resolveAiImageAsset(fields, env);
  const fallback = resolveFallbackAsset(model, fields, env);

  if (policy === "real_photo") {
    return finalizeAsset(model, real.url || fallback.url, real.key || fallback.key, real.source || fallback.source, policy, "Standard/Premium real photo");
  }

  if (policy === "ai_generated") {
    return finalizeAsset(model, ai.url || fallback.url, ai.key || fallback.key, ai.source || fallback.source, policy, "GWs/EMs AI image");
  }

  return finalizeAsset(model, fallback.url, fallback.key, fallback.source, policy, "Default public preview");
}

function detectImagePolicy(fields, model) {
  const text = token([
    fields.field,
    fields.model_field,
    fields.category,
    fields.category_path,
    fields.folder_name,
    fields.r2_prefix,
    fields.primary_image_key,
    fields.unique_key,
    fields.model_key,
    fields.model_record_id,
    fields["model_record_id"],
    fields["Model Record ID"],
    fields["Model ID"],
    fields.internal_code,
    fields.run_number,
    fields.runNumber,
    fields.private_tier,
    fields.tier,
    fields.package_code,
    fields.package,
    fields.sales_layer,
    fields.private_work_format,
    model.field,
    model.run_number,
    model.unique_key,
    model.model_key,
    model.model_record_id,
    model.model_id,
    model.r2_prefix,
    model.primary_image_key,
  ].map(clean).filter(Boolean).join(" "));

  if (/(^|_)gws\d*(_|$)/.test(text) || /(^|_)ems\d*(_|$)/.test(text) || text.includes("_gws_") || text.includes("_ems_")) {
    return "ai_generated";
  }

  if (isStandardOrPremiumPrivateTier(text)) return "real_photo";
  return "public_preview";
}

function isStandardOrPremiumPrivateTier(text) {
  if (text.includes("standard") || text.includes("premium")) return true;
  if (/(^|_)mdl_pri_str(_|$)/.test(text) || /(^|_)pri_str(_|$)/.test(text)) return true;
  if (/(^|_)mdl_pri_std(_|$)/.test(text) || /(^|_)pri_std(_|$)/.test(text)) return true;
  if (/(^|_)mdl_pri_prm(_|$)/.test(text) || /(^|_)pri_prm(_|$)/.test(text)) return true;
  if (/(^|_)mdl_pri_prem(_|$)/.test(text) || /(^|_)pri_prem(_|$)/.test(text)) return true;
  if (text.includes("private_models_standard_package") || text.includes("mmd_private_models_standard_package")) return true;
  if (text.includes("private_models_premium_package") || text.includes("mmd_private_models_premium_package")) return true;
  return false;
}

function resolveRealPhotoAsset(fields, env) {
  const url = firstValue(fields, [
    "Real Photo URL",
    "real_photo_url",
    "Real Image URL",
    "real_image_url",
    "Private Real Photo URL",
    "private_real_photo_url",
    "Private Image URL",
    "private_image_url",
    "Standard Real Photo URL",
    "standard_real_photo_url",
    "Premium Real Photo URL",
    "premium_real_photo_url",
    "Actual Photo URL",
    "actual_photo_url",
    "Photo URL",
    "photo_url",
  ]);
  const key = firstValue(fields, [
    "real_photo_key",
    "Real Photo Key",
    "real_image_key",
    "Real Image Key",
    "private_real_photo_key",
    "Private Real Photo Key",
    "private_image_key",
    "Private Image Key",
    "standard_real_photo_key",
    "premium_real_photo_key",
  ]);
  return {
    url: url || publicUrlFromKey(env, key),
    key,
    source: url ? "airtable_attachment" : key ? "r2_prefix" : "",
  };
}

function resolveAiImageAsset(fields, env) {
  const url = firstValue(fields, [
    "AI Image URL",
    "ai_image_url",
    "AI Preview URL",
    "ai_preview_url",
    "Generated Image URL",
    "generated_image_url",
    "Compcard Image URL",
    "compcard_image_url",
    "Card Image URL",
    "card_image_url",
    "Hero Image URL",
    "hero_image_url",
    "Public Image URL",
    "public_image_url",
  ]);
  const key = firstValue(fields, [
    "ai_image_key",
    "AI Image Key",
    "ai_preview_key",
    "generated_image_key",
    "compcard_image_key",
    "card_image_key",
    "hero_image_key",
    "primary_image_key",
    "Primary Image Key",
    "r2_key",
    "r2_prefix",
  ]);
  return {
    url: url || publicUrlFromKey(env, key),
    key,
    source: url ? "airtable_attachment" : key ? "r2_prefix" : "",
  };
}

function resolveFallbackAsset(model, fields, env) {
  const url = clean(model.public_image_url || model.cover_url) || firstValue(fields, ["Public Image URL", "public_image_url", "card_image_url", "hero_image_url"]);
  const key = clean(model.primary_image_key || model.r2_key || model.r2_prefix) || firstValue(fields, ["primary_image_key", "r2_key", "r2_prefix"]);
  return {
    url: url || publicUrlFromKey(env, key),
    key,
    source: clean(model.source || model.asset_source) || (url ? "airtable_attachment" : key ? "r2_prefix" : "manual_review"),
  };
}

function finalizeAsset(model, url, key, source, policy, note) {
  const safeSource = source === "real_photo" || source === "ai_generated" ? "airtable_attachment" : clean(source || "manual_review");
  return {
    ...model,
    source: safeSource,
    asset_source: safeSource,
    public_image_url: clean(url),
    cover_url: clean(url),
    r2_key: clean(key),
    primary_image_key: clean(key),
    model_asset_policy: policy,
    image_policy_note: note,
  };
}

function firstValue(fields, keys) {
  for (const key of keys) {
    const value = clean(fields?.[key]);
    if (value) return value;
  }
  return "";
}

function publicUrlFromKey(env, key) {
  const base = clean(env.MODEL_PUBLIC_ASSET_BASE_URL).replace(/\/+$/, "");
  const k = clean(key).replace(/^\/+/, "");
  return base && k ? `${base}/${encodeURI(k)}` : "";
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function clean(value) {
  return String(value ?? "").trim();
}

function token(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
