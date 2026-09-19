const MODEL_ASSET_READINESS_PATH = "/v1/admin/models/resolve-source";
const PUBLIC_ASSET_BASE = "https://models.mmdbkk.com";
const PUBLIC_ASSET_KINDS = new Set(["profile", "gallery", "compcard"]);
const PROTECTED_SEGMENTS = new Set(["private", "evidence", "slips", "line-notes", "line_notes", "sigil"]);
const MODEL_NAME_FIELDS = [
  "working_name", "Working Name", "model_name", "Model Name", "display_name", "Display Name",
  "name", "Name", "nickname", "Nickname",
];
const MODEL_LOOKUP_FIELDS = [
  ...MODEL_NAME_FIELDS,
  "model_code", "model_lookup_key", "unique_key", "aliases", "alias",
];
const ROUTES = Object.freeze({
  ceo: "/internal/ceo",
  asset_console: "/internal/ceo/models",
  studio: "/internal/admin/studio",
  studio_upload: "/internal/admin/studio/upload",
  studio_review: "/internal/admin/studio/review",
  model_preview: "/internal/admin/studio/model-preview",
  create_session: "/internal/admin/jobs/create-session",
});
const LEGACY_ROUTE_MAP = Object.freeze({
  "/ceo": ROUTES.ceo,
  "/ceo/models": ROUTES.asset_console,
  "/studio": ROUTES.studio,
  "/sigil/admin/studio": ROUTES.studio,
  "/sigil/admin/studio/upload": ROUTES.studio_upload,
  "/sigil/admin/studio/review": ROUTES.studio_review,
  "/sigil/admin/studio/model-preview": ROUTES.model_preview,
  "/sigil/admin/models": ROUTES.asset_console,
  "/sigil/admin/jobs/create-session": ROUTES.create_session,
  "/internal/ceo/dashboard": ROUTES.ceo,
});
const WORKFLOW_CTA_V3 = Object.freeze({
  studio: Object.freeze({
    asset_console: Object.freeze({ label: "Asset Console", route: ROUTES.asset_console }),
  }),
  upload: Object.freeze({
    asset_console: Object.freeze({ label: "Asset Console", route: ROUTES.asset_console }),
  }),
  review: Object.freeze({
    needs_review: Object.freeze({ label: "Back to Upload", route: ROUTES.studio_upload }),
    approved_for_preview: Object.freeze({ label: "Open Preview", route: ROUTES.model_preview }),
    hold: Object.freeze({ label: "Return to Asset Console", route: ROUTES.asset_console }),
  }),
  preview: Object.freeze({
    back_to_review: Object.freeze({ label: "Back to Review", route: ROUTES.studio_review }),
    asset_console: Object.freeze({ label: "Asset Console", route: ROUTES.asset_console }),
  }),
});

export { MODEL_ASSET_READINESS_PATH, ROUTES, WORKFLOW_CTA_V3 };

export function isModelAssetReadinessRequest(path, method = "GET") {
  return normalizePath(path) === MODEL_ASSET_READINESS_PATH && String(method || "GET").toUpperCase() === "GET";
}

export function normalizeModelAssetCtaRoute(value) {
  const raw = clean(value);
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw, "https://mmdbkk.com");
  } catch {
    return raw;
  }
  if (parsed.origin !== "https://mmdbkk.com" && parsed.origin !== "https://www.mmdbkk.com") return raw;
  const path = normalizePath(parsed.pathname);
  let canonical = LEGACY_ROUTE_MAP[path] || path;
  if (path.startsWith("/sigil/admin/studio/")) {
    canonical = `${ROUTES.studio}${path.slice("/sigil/admin/studio".length)}`;
  }
  return `${canonical}${parsed.search}${parsed.hash}`;
}

export function validatePublicModelAssetPath(value, { allowPrefix = false } = {}) {
  const raw = clean(value).replace(/^\/+/, "");
  if (!raw) return { ok: false, reason: "missing_path" };
  if (/^https?:\/\//i.test(raw) || raw.includes("\\") || raw.includes("//") || hasTraversal(raw)) {
    return { ok: false, reason: "invalid_path_syntax" };
  }
  const parts = raw.split("/").filter(Boolean);
  if (parts.some((part) => PROTECTED_SEGMENTS.has(part.toLowerCase()))) {
    return { ok: false, reason: "protected_path" };
  }
  if (parts[0] !== "models" || !parts[1]) return { ok: false, reason: "noncanonical_model_root" };
  if (allowPrefix && parts.length === 2) {
    return { ok: true, path: `${parts.join("/")}/`, kind: "model" };
  }
  if (parts.length < 4 || !PUBLIC_ASSET_KINDS.has(parts[2].toLowerCase())) {
    return { ok: false, reason: "unsupported_public_asset_kind" };
  }
  if (!/\.(?:jpe?g|png|webp|avif)$/i.test(parts[parts.length - 1])) {
    return { ok: false, reason: "unsupported_public_asset_file" };
  }
  return {
    ok: true,
    path: parts.join("/"),
    kind: parts[2].toLowerCase(),
    url: `${PUBLIC_ASSET_BASE}/${parts.join("/")}`,
  };
}

export function buildModelAssetReadiness(checks = {}) {
  const normalized = {
    canonical_record: Boolean(checks.canonical_record),
    r2_migration: Boolean(checks.r2_migration),
    primary_image: Boolean(checks.primary_image),
    public_profile: Boolean(checks.public_profile),
    gallery: Boolean(checks.gallery),
    compcard: Boolean(checks.compcard),
  };
  const score = Object.values(normalized).filter(Boolean).length;
  const verdict = score === 6 ? "Ready for Review" : score >= 4 ? "Needs Review" : "Incomplete";
  const next = !normalized.canonical_record
    ? { label: "Open Studio Upload", route: ROUTES.studio_upload, reason: "canonical_record_missing" }
    : !normalized.r2_migration
      ? { label: "Open Asset Console", route: ROUTES.asset_console, reason: "r2_migration_missing" }
      : score < 6
        ? { label: "Open Studio Review", route: ROUTES.studio_review, reason: "asset_review_required" }
        : { label: "Open Final Preview", route: ROUTES.model_preview, reason: "final_preview_required" };
  return {
    ...normalized,
    score,
    total: 6,
    verdict,
    next,
    checks: [
      ["canonical_record", normalized.canonical_record],
      ["r2_migration", normalized.r2_migration],
      ["primary_image", normalized.primary_image],
      ["public_profile", normalized.public_profile],
      ["gallery", normalized.gallery],
      ["compcard", normalized.compcard],
    ].map(([key, pass]) => ({ key, state: pass ? "PASS" : "REVIEW" })),
  };
}

export function projectModelAssetRecord(record, evidence = {}) {
  const fields = record?.fields && typeof record.fields === "object" ? record.fields : {};
  const modelRecordId = clean(record?.id || fields.model_record_id || fields.model_id);
  const workingName = firstText(fields, MODEL_NAME_FIELDS);
  const rawPrefix = normalizePrefix(firstText(fields, ["r2_prefix", "R2 Prefix", "storage_prefix", "asset_prefix"]));
  const prefixGuard = validatePublicModelAssetPath(rawPrefix, { allowPrefix: true });
  const r2Prefix = prefixGuard.ok ? prefixGuard.path : "";
  const declaredPrimary = firstText(fields, [
    "primary_image_key", "Primary Image Key", "profile_image_key", "public_profile_key", "primary_asset_key",
  ]);
  const primaryGuard = validatePublicModelAssetPath(declaredPrimary);
  const explicitMigration = firstBoolean(fields, ["is_migrated_to_r2", "r2_migrated", "r2_ready", "R2 Ready"]) ||
    /(^|\b)r2(\b|$)/i.test(firstText(fields, ["storage_source_primary", "storage_source", "asset_storage"]));
  const r2Verified = evidence.r2_exists === true || (evidence.r2_exists == null && explicitMigration);
  const primaryVerified = primaryGuard.ok && (evidence.primary_exists === true || (evidence.primary_exists == null && firstBoolean(fields, ["primary_image_ready", "profile_image_ready"])));
  const publicProfile = Boolean(
    firstBoolean(fields, ["public_profile_ready", "profile_ready", "Public Profile Ready"]) ||
    evidence.profile_exists === true ||
    (primaryVerified && primaryGuard.kind === "profile")
  );
  const gallery = Boolean(firstBoolean(fields, ["gallery_ready", "public_gallery_ready", "Public Gallery Ready"]) || evidence.gallery_exists === true);
  const compcardKey = firstText(fields, ["compcard_key", "public_compcard_key", "Compcard Key"]);
  const compcardGuard = validatePublicModelAssetPath(compcardKey);
  const compcard = Boolean(
    firstBoolean(fields, ["compcard_ready", "public_compcard_ready", "Compcard Ready"]) ||
    evidence.compcard_exists === true ||
    (compcardGuard.ok && evidence.compcard_key_exists === true)
  );
  const readiness = buildModelAssetReadiness({
    canonical_record: Boolean(modelRecordId && workingName),
    r2_migration: Boolean(r2Prefix && r2Verified),
    primary_image: Boolean(primaryVerified),
    public_profile: publicProfile,
    gallery,
    compcard,
  });
  return {
    model_record_id: modelRecordId,
    model_id: modelRecordId,
    working_name: workingName,
    r2_prefix: r2Prefix,
    primary_image_key: primaryVerified ? primaryGuard.path : "",
    primary_image_url: primaryVerified ? primaryGuard.url : "",
    model_ability_snapshot: Boolean(firstText(fields, ["model_ability_snapshot", "Model Ability Snapshot", "ability_snapshot"])),
    is_migrated_to_r2: Boolean(readiness.r2_migration),
    readiness: {
      public_profile: readiness.public_profile,
      gallery: readiness.gallery,
      compcard: readiness.compcard,
    },
    readiness_summary: readiness,
    diagnostics: {
      canonical_prefix: Boolean(r2Prefix),
      declared_primary_public_safe: Boolean(primaryGuard.ok),
      blocked_primary_reason: primaryGuard.ok || !declaredPrimary ? null : primaryGuard.reason,
    },
  };
}

export async function handleModelAssetReadinessRequest(request, env, ctx, coreWorker) {
  const url = new URL(request.url);
  const query = clean(url.searchParams.get("q"));
  if (!query) return json({ ok: false, error: "missing_q" }, 400);
  if (query.length > 120) return json({ ok: false, error: "q_too_long" }, 400);
  if (!coreWorker || typeof coreWorker.fetch !== "function") return json({ ok: false, error: "core_worker_unavailable" }, 503);

  const canonical = await findCanonicalRecord(request, env, ctx, coreWorker, query);
  if (canonical) {
    const fields = canonical.fields || {};
    const rawPrefix = normalizePrefix(firstText(fields, ["r2_prefix", "R2 Prefix", "storage_prefix", "asset_prefix"]));
    const prefixGuard = validatePublicModelAssetPath(rawPrefix, { allowPrefix: true });
    const canonicalPrefix = prefixGuard.ok ? prefixGuard.path : "";
    const declaredPrimary = firstText(fields, ["primary_image_key", "Primary Image Key", "profile_image_key", "public_profile_key", "primary_asset_key"]);
    const primaryGuard = validatePublicModelAssetPath(declaredPrimary);
    const evidence = await inspectR2Evidence(env, canonicalPrefix, primaryGuard.ok ? primaryGuard.path : "");
    const model = projectModelAssetRecord(canonical, evidence);
    return assetResponse({ query, source: "airtable", model, found: true });
  }

  const legacy = await callCoreResolver(request, env, ctx, coreWorker);
  if (legacy?.ok && legacy?.found && legacy?.source === "r2") {
    const rawPrefix = normalizePrefix(legacy.matched_prefix);
    const prefixGuard = validatePublicModelAssetPath(rawPrefix, { allowPrefix: true });
    const canonicalPrefix = prefixGuard.ok ? prefixGuard.path : "";
    const discovered = await discoverPublicAssets(env, canonicalPrefix);
    const model = projectModelAssetRecord({
      id: "",
      fields: {
        working_name: clean(legacy.matched_name || query),
        r2_prefix: canonicalPrefix,
        is_migrated_to_r2: Boolean(canonicalPrefix),
        primary_image_key: discovered.primary_key,
        public_profile_ready: discovered.profile_exists,
        gallery_ready: discovered.gallery_exists,
        compcard_ready: discovered.compcard_exists,
      },
    }, {
      r2_exists: discovered.r2_exists,
      primary_exists: Boolean(discovered.primary_key),
      profile_exists: discovered.profile_exists,
      gallery_exists: discovered.gallery_exists,
      compcard_exists: discovered.compcard_exists,
    });
    return assetResponse({ query, source: "r2", model, found: true, legacy: { object_count: legacy.object_count ?? null } });
  }

  const readiness = buildModelAssetReadiness({});
  return json({
    ok: true,
    found: false,
    source: "none",
    query,
    matched_name: "",
    model: null,
    readiness,
    cta_router_version: "v3",
    workflow_cta: WORKFLOW_CTA_V3,
    routes: ROUTES,
    next_action: readiness.next,
    published: false,
    can_publish: false,
    authority: "backend",
    demo: false,
  });
}

function assetResponse({ query, source, model, found, legacy = null }) {
  const readiness = model.readiness_summary;
  return json({
    ok: true,
    found,
    source,
    query,
    matched_name: model.working_name,
    matched_id: model.model_record_id,
    model_record_id: model.model_record_id,
    r2_prefix: model.r2_prefix,
    primary_image_key: model.primary_image_key,
    is_migrated_to_r2: model.is_migrated_to_r2,
    readiness,
    cta_router_version: "v3",
    workflow_cta: WORKFLOW_CTA_V3,
    routes: ROUTES,
    next_action: readiness.next,
    public_preview: model.primary_image_url ? { safe: true, url: model.primary_image_url } : { safe: false, url: "" },
    flow: ["Drive / Intake", "Studio", "R2 + Airtable", "Public Asset"],
    published: false,
    can_publish: false,
    authority: "backend",
    demo: false,
    ...(legacy ? { legacy } : {}),
  });
}

async function findCanonicalRecord(request, env, ctx, coreWorker, query) {
  if (/^rec[A-Za-z0-9]{10,}$/.test(query)) {
    const direct = await airtableRecordById(env, query);
    if (direct) return direct;
  }
  const listUrl = new URL(request.url);
  listUrl.pathname = "/v1/admin/models/list";
  listUrl.search = "";
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("limit", "12");
  const listRequest = new Request(listUrl, { method: "GET", headers: request.headers });
  const response = await coreWorker.fetch(listRequest, env, ctx);
  const payload = await readJson(response);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) return null;
  return chooseBestRecord(items, query);
}

function chooseBestRecord(items, query) {
  const needle = token(query);
  const scored = items.map((record, index) => {
    const fields = record?.fields || {};
    const values = [record?.id, ...MODEL_LOOKUP_FIELDS.map((field) => fields[field])]
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map(token)
      .filter(Boolean);
    const exact = values.includes(needle);
    const prefix = values.some((value) => value.startsWith(needle) || needle.startsWith(value));
    return { record, score: exact ? 3 : prefix ? 2 : 1, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.record || null;
}

async function callCoreResolver(request, env, ctx, coreWorker) {
  const response = await coreWorker.fetch(request, env, ctx);
  return readJson(response);
}

async function inspectR2Evidence(env, prefix, primaryKey) {
  const bucket = env?.MMD_MODEL_ASSETS;
  if (!bucket || typeof bucket.list !== "function") {
    return { r2_exists: null, primary_exists: null, profile_exists: null, gallery_exists: null, compcard_exists: null };
  }
  const [root, profile, gallery, compcard, primary] = await Promise.all([
    prefix ? hasObjects(bucket, prefix) : false,
    prefix ? hasObjects(bucket, `${prefix}profile/`) : false,
    prefix ? hasObjects(bucket, `${prefix}gallery/`) : false,
    prefix ? hasObjects(bucket, `${prefix}compcard/`) : false,
    primaryKey ? hasExactObject(bucket, primaryKey) : false,
  ]);
  return { r2_exists: root, profile_exists: profile, gallery_exists: gallery, compcard_exists: compcard, primary_exists: primary };
}

async function discoverPublicAssets(env, prefix) {
  const bucket = env?.MMD_MODEL_ASSETS;
  if (!prefix || !bucket || typeof bucket.list !== "function") {
    return { r2_exists: false, profile_exists: false, gallery_exists: false, compcard_exists: false, primary_key: "" };
  }
  const listing = await bucket.list({ prefix, limit: 200 });
  const objects = Array.isArray(listing?.objects) ? listing.objects : [];
  const safe = objects.map((object) => clean(object?.key)).filter((key) => validatePublicModelAssetPath(key).ok);
  const primaryKey = safe.find((key) => key.includes("/profile/")) || "";
  return {
    r2_exists: objects.length > 0,
    profile_exists: safe.some((key) => key.includes("/profile/")),
    gallery_exists: safe.some((key) => key.includes("/gallery/")),
    compcard_exists: safe.some((key) => key.includes("/compcard/")),
    primary_key: primaryKey,
  };
}

async function hasObjects(bucket, prefix) {
  try {
    const result = await bucket.list({ prefix, limit: 1 });
    return Array.isArray(result?.objects) && result.objects.length > 0;
  } catch (_) {
    return false;
  }
}

async function hasExactObject(bucket, key) {
  try {
    if (typeof bucket.head === "function") return Boolean(await bucket.head(key));
    const result = await bucket.list({ prefix: key, limit: 1 });
    return Array.isArray(result?.objects) && result.objects.some((object) => clean(object?.key) === key);
  } catch (_) {
    return false;
  }
}

async function airtableRecordById(env, recordId) {
  const apiKey = clean(env?.AIRTABLE_API_KEY);
  const baseId = clean(env?.AIRTABLE_BASE_ID);
  const table = clean(env?.AIRTABLE_TABLE_MODELS || "models");
  if (!apiKey || !baseId || !recordId) return null;
  try {
    const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.id ? { id: data.id, fields: data.fields || {}, createdTime: data.createdTime } : null;
  } catch (_) {
    return null;
  }
}

function firstText(fields, names) {
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value)) {
      const item = value.map(clean).find(Boolean);
      if (item) return item;
    } else if (clean(value)) return clean(value);
  }
  return "";
}

function firstBoolean(fields, names) {
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(fields || {}, name)) continue;
    const value = fields[name];
    if (value === true) return true;
    const normalized = token(value);
    if (["true", "yes", "1", "ready", "approved", "active", "complete", "completed"].includes(normalized)) return true;
  }
  return false;
}

function normalizePrefix(value) {
  const raw = clean(value).replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  return raw && !raw.endsWith("/") ? `${raw}/` : raw;
}

function hasTraversal(value) {
  let decoded = String(value || "");
  for (let i = 0; i < 2; i += 1) {
    if (/(^|\/)\.\.(?:\/|$)/.test(decoded)) return true;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch (_) {
      break;
    }
  }
  return /(^|\/)\.\.(?:\/|$)/.test(decoded);
}

function normalizePath(value) {
  const path = clean(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function token(value) {
  return clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ก-๙]+/g, "_").replace(/^_+|_+$/g, "");
}

function clean(value) {
  return String(value ?? "").trim();
}

async function readJson(response) {
  try { return await response.json(); } catch (_) { return {}; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
