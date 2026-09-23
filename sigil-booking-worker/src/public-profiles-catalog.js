const DEFAULT_CATALOG_PREFIX = "MMD Public Models/";
const DEFAULT_PUBLIC_ASSET_BASE = "https://models.mmdbkk.com";
const IMAGE_EXTENSION = /\.(?:avif|jpe?g|png|webp)$/i;
const PREFERRED_IMAGE = /(?:^|[-_. ])(?:card|cover|hero|main|primary|profile|01)(?:[-_. ]|$)/i;
const BLOCKED_SEGMENTS = new Set(["private", "evidence", "slips", "line-notes", "line_notes", "sigil", "internal"]);
const PUBLIC_CATALOG_PATH = "/sigil/api/models/search/public-catalog";
const MODEL_APPLICATIONS_TABLE_ID = "tblwUa8ySWln8OfaJ";
const MODEL_MEDIA_TABLE_ID = "tblrpQXhHnbTU9RhW";
const MODELS_TABLE_ID = "tblI4B0bI446vp9GX";
const MODELS_FIELDS = Object.freeze({ workingName: "fldShiT60bmCxFxRu" });
const MODEL_MEDIA_FIELDS = Object.freeze({
  model: "fldknjo3y47i3lR33",
  mediaType: "fldJRlyE6RMaze62",
  reviewStatus: "fldQiEnIJj5LjGy52",
  teaserSafe: "fldAvK1Xv0lnoZIXv",
  fileType: "fldakN0VbkG9fuPnI",
});
const PUBLIC_PROMO_CONSENT_VERSION = "mmd-public-promo-consent-v1-20260922";
const PUBLIC_PROMO_CONSENT_SOURCES = new Set(["/apply/public-model", "mmd_model", "mmd_model_authenticated"]);
const APPLICATION_FIELDS = Object.freeze({
  workingName: "fldY8Jf7H70Tn1S93",
  nickname: "fldUIqNSM6Z9dK8Tj",
  customerScope: "fldEkwim5KmCjA4rg",
  applicationType: "fld3KMefCywUTNIoQ",
  reviewStatus: "fldInXMklAz53CiCq",
  intakeStatus: "fldHk2h9Rf6g5UlZw",
  submittedAt: "fldRs4JdlxOdtlqp9",
  payloadJson: "fldJ9ldETtMF2Qbqf",
  approvedRoles: "fldz20JiFUK9ubk1c",
  bookingMode: "fldjo1NpDcB0JXk91",
  publicProfileApproved: "fldcnCF3KrdAd4cfa",
  publicImageApproved: "fldFm1ouEn5TlyLUo",
  credentialStatus: "fldFM8T50S1zObdVP",
  nonMemberImageConsent: "fldUMJEUVK3GNmomA",
  nonMemberPromoRoles: "fldQgqdiVPTMRfawj",
  publicPromoConsentStatus: "fldsD2K6T1UGyggvp",
  publicPromoConsentAt: "fld8M8tXWQsDpsouB",
  publicPromoConsentVersion: "fldbI0gUNjwtIUXd2",
  publicPromoConsentRevokedAt: "fld1A7uvWaJIhwjOg",
  publicPromoConsentSource: "fldB5TqIGAOvF01uj",
});

export function isPublicProfilesCatalogRequest(path, method = "GET") {
  return normalizePath(path) === PUBLIC_CATALOG_PATH && ["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase());
}

export async function handlePublicProfilesCatalogRequest(request, env) {
  const method = request.method.toUpperCase();
  const cors = corsHeaders(request, env);
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.list !== "function") {
    return json({ ok: false, error: "public_model_catalog_unavailable", items: [] }, 503, cors, method);
  }

  try {
    const prefixes = catalogPrefixes(env.PUBLIC_MODEL_CATALOG_PREFIXES || env.PUBLIC_MODEL_CATALOG_PREFIX || DEFAULT_CATALOG_PREFIX);
    const objects = [];
    for (const prefix of prefixes) objects.push(...await listPrefix(env.MMD_MODEL_ASSETS, prefix));
    const [eligibilityBySlug, teaserBySlug] = await Promise.all([
      loadApprovedEligibility(env),
      loadApprovedTeaserAvailability(env),
    ]);
    const items = buildPublicCatalog(objects, {
      prefixes,
      publicAssetBase: env.MODEL_PUBLIC_ASSET_BASE_URL || DEFAULT_PUBLIC_ASSET_BASE,
      eligibilityBySlug,
      teaserBySlug,
    });
    return json({
      ok: true,
      source: "r2_public_model",
      folder: DEFAULT_CATALOG_PREFIX.replace(/\/$/, ""),
      count: items.length,
      items,
    }, 200, cors, method);
  } catch (error) {
    console.error(JSON.stringify({ worker: "sigil-booking-worker", route: PUBLIC_CATALOG_PATH, error: String(error?.message || error) }));
    return json({ ok: false, error: "public_model_catalog_unavailable", items: [] }, 503, cors, method);
  }
}

export function buildPublicCatalog(objects, { prefixes = [DEFAULT_CATALOG_PREFIX], publicAssetBase = DEFAULT_PUBLIC_ASSET_BASE, eligibilityBySlug = new Map(), teaserBySlug = new Set(), audienceBySlug = null } = {}) {
  // audienceBySlug is accepted only for backward-compatible unit callers. It never
  // grants public visibility: a model still needs explicit MMD approval and current
  // non-member image-promotion consent for at least one approved role.
  if (!(eligibilityBySlug instanceof Map) || eligibilityBySlug.size === 0) {
    eligibilityBySlug = new Map();
    if (audienceBySlug instanceof Map) {
      for (const [slug, genders] of audienceBySlug.entries()) {
        eligibilityBySlug.set(slug, {
          genders,
          roles: [],
          promo_roles: [],
          booking_mode: "curated",
          public_profile_approved: false,
          public_image_approved: false,
          credential_status: "not_required",
          nonmember_image_consent: false,
          promo_consent_status: "not_granted",
        });
      }
    }
  }
  const groups = new Map();
  const normalizedPrefixes = catalogPrefixes(prefixes);
  for (const object of Array.isArray(objects) ? objects : []) {
    const key = clean(object?.key).replace(/^\/+/, "");
    const prefix = normalizedPrefixes.find((candidate) => key.startsWith(candidate));
    if (!prefix || !IMAGE_EXTENSION.test(key) || !publicSafeKey(key)) continue;
    const relative = key.slice(prefix.length);
    const parts = relative.split("/").filter(Boolean);
    if (parts.length < 2) continue;
    const fileName = parts[parts.length - 1];
    const modelFolder = modelFolderFromParts(parts);
    if (!modelFolder || BLOCKED_SEGMENTS.has(modelFolder.toLowerCase())) continue;
    const slug = slugify(modelFolder);
    if (!slug) continue;
    const current = groups.get(slug) || { slug, display_name: displayName(modelFolder), photos: [] };
    const imageUrl = `${clean(publicAssetBase).replace(/\/+$/, "")}/${encodePath(key)}`;
    current.photos.push({ url: imageUrl, preferred: PREFERRED_IMAGE.test(fileName), key });
    groups.set(slug, current);
  }

  return [...groups.values()].map((group) => {
    group.photos.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.key.localeCompare(b.key));
    const eligibility = eligibilityBySlug instanceof Map ? eligibilityBySlug.get(group.slug) : null;
    // A public folder is storage only. A card may exist only when the complete
    // service matrix has a role, audience, explicit booking route, profile
    // approval and an approved public-safe image.
    if (!eligibility || !hasCompletePublicServiceMatrix(eligibility) || !validPublicPromoConsent(eligibility)) return null;
    // A per-application allowlist is optional for backwards compatibility, but
    // when present it is authoritative. This lets MMD promote an exact reviewed
    // set inside a legacy model folder without exposing every historical asset.
    const approvedAssetKeys = normalizePublicAssetKeys(eligibility.public_asset_keys);
    const approvedPhotos = approvedAssetKeys.length
      ? approvedAssetKeys.map((key) => group.photos.find((photo) => photo.key === key)).filter(Boolean)
      : group.photos;
    const photos = approvedPhotos.slice(0, 6).map((photo) => photo.url);
    if (!photos.length) return null;
    const acceptedCustomerGenders = normalizeCustomerGenders(eligibility.genders);
    const approvedRoles = normalizeRoleKeys(eligibility.roles);
    const promoRoles = normalizeRoleKeys(eligibility.promo_roles);
    let publicRoles = approvedRoles.filter((role) => promoRoles.includes(role));
    // Medical Professional is a regulated request-only lane.  Do not publish
    // its role hint unless the credential is verified and the operational
    // booking mode is explicitly brief_only.  A mixed-role profile may still
    // appear for its separately approved non-medical roles.
    if (publicRoles.includes("medical_professional") && (
      clean(eligibility.credential_status).toLowerCase() !== "verified" ||
      clean(eligibility.booking_mode).toLowerCase() !== "brief_only"
    )) {
      publicRoles = publicRoles.filter((role) => role !== "medical_professional");
    }
    if (!acceptedCustomerGenders.length || !publicRoles.length) return null;
    return {
      slug: group.slug,
      display_name: group.display_name,
      image_url: photos[0],
      photos,
      customer_scope: acceptedCustomerGenders.length === 1 ? `${acceptedCustomerGenders[0]}_only` : "all_genders",
      accepted_customer_genders: acceptedCustomerGenders,
      approved_roles: publicRoles,
      booking_mode: eligibility.booking_mode,
      visibility: "public",
      audience_visibility: "non_member_consented",
      source: "r2_public_model",
      // This is a deliberately narrow discovery hint. It never contains an
      // asset id, storage key, thumbnail, signed URL, count, or entitlement.
      ...(teaserBySlug instanceof Set && teaserBySlug.has(group.slug) ? { private_teaser_available: true } : {}),
    };
  }).filter(Boolean).sort((a, b) => a.display_name.localeCompare(b.display_name, "en"));
}

async function loadApprovedEligibility(env) {
  const index = new Map();
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) return index;
  try {
    let offset = "";
    let seen = 0;
    do {
      const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${MODEL_APPLICATIONS_TABLE_ID}`);
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("returnFieldsByFieldId", "true");
      url.searchParams.set("filterByFormula", "{application_type}='public_model'");
      url.searchParams.set("sort[0][field]", "submitted_at");
      url.searchParams.set("sort[0][direction]", "desc");
      Object.values(APPLICATION_FIELDS).forEach((field) => url.searchParams.append("fields[]", field));
      if (offset) url.searchParams.set("offset", offset);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
      if (!response.ok) throw new Error(`airtable_${response.status}`);
      const data = await response.json();
      const records = Array.isArray(data.records) ? data.records : [];
      seen += records.length;
      for (const record of records) {
        const fields = record?.fields || {};
        const reviewStatus = choiceName(fields[APPLICATION_FIELDS.reviewStatus]).toLowerCase();
        const intakeStatus = choiceName(fields[APPLICATION_FIELDS.intakeStatus]).toLowerCase();
        if (reviewStatus !== "accepted" || intakeStatus !== "approved") continue;
        const name = clean(fields[APPLICATION_FIELDS.workingName] || fields[APPLICATION_FIELDS.nickname]);
        const slug = slugify(name);
        if (!slug || index.has(slug)) continue;

        const payload = jsonObject(fields[APPLICATION_FIELDS.payloadJson]);
        const payloadConsent = payload.mmd_nonmember_profile_image_consent === true;
        const storedStatus = choiceName(fields[APPLICATION_FIELDS.publicPromoConsentStatus]).toLowerCase();
        const storedRoles = choiceNames(fields[APPLICATION_FIELDS.nonMemberPromoRoles]);
        const storedConsentAt = clean(fields[APPLICATION_FIELDS.publicPromoConsentAt]);
        const storedVersion = clean(fields[APPLICATION_FIELDS.publicPromoConsentVersion]);
        const storedSource = clean(fields[APPLICATION_FIELDS.publicPromoConsentSource]);
        const storedRevokedAt = clean(fields[APPLICATION_FIELDS.publicPromoConsentRevokedAt]);
        const status = storedStatus || (payloadConsent ? "granted" : "not_granted");
        const version = storedVersion || clean(payload.mmd_public_promo_consent_version);
        const consentAt = storedConsentAt || (payloadConsent ? clean(fields[APPLICATION_FIELDS.submittedAt]) : "");
        const source = storedSource || (payloadConsent ? "/apply/public-model" : "");
        const promoRoles = storedRoles.length
          ? storedRoles
          : normalizeRoleKeys(payload.mmd_nonmember_promo_roles);
        // Once reviewed/dedicated consent state exists, it is authoritative over
        // historical application payload. Unchecking or revoking cannot be widened
        // again by an older payload that once contained consent=true.
        const imageConsent = storedStatus
          ? storedStatus === "granted" && checkboxTrue(fields[APPLICATION_FIELDS.nonMemberImageConsent])
          : payloadConsent;

        index.set(slug, {
          genders: customerGendersFromScope(fields[APPLICATION_FIELDS.customerScope]),
          roles: choiceNames(fields[APPLICATION_FIELDS.approvedRoles]),
          promo_roles: promoRoles,
          booking_mode: choiceName(fields[APPLICATION_FIELDS.bookingMode]),
          public_profile_approved: checkboxTrue(fields[APPLICATION_FIELDS.publicProfileApproved]),
          public_image_approved: checkboxTrue(fields[APPLICATION_FIELDS.publicImageApproved]),
          credential_status: choiceName(fields[APPLICATION_FIELDS.credentialStatus]),
          nonmember_image_consent: imageConsent,
          promo_consent_status: status,
          promo_consent_at: consentAt,
          promo_consent_version: version,
          promo_consent_source: source,
          promo_consent_revoked_at: storedRevokedAt,
          public_asset_keys: normalizePublicAssetKeys(payload.public_asset_keys),
        });
      }
      offset = clean(data.offset);
    } while (offset && seen < 500);
  } catch (error) {
    console.warn(JSON.stringify({ worker: "sigil-booking-worker", route: PUBLIC_CATALOG_PATH, warning: "public_eligibility_unavailable", error: String(error?.message || error) }));
  }
  return index;
}


// Public catalogue discovery is fail-closed. A marker is exposed only when an
// MMD-approved, purpose-built teaser asset exists; a profile image can never
// become a Teaser merely because it is private-safe.
async function loadApprovedTeaserAvailability(env) {
  const slugs = new Set();
  const modelRecordIds = new Set();
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) return slugs;
  try {
    let offset = "";
    let seen = 0;
    do {
      const table = env.AIRTABLE_TABLE_MODEL_MEDIA_ASSETS || env.AIRTABLE_TABLE_MODEL_MEDIA || MODEL_MEDIA_TABLE_ID;
      const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("returnFieldsByFieldId", "true");
      Object.values(MODEL_MEDIA_FIELDS).forEach((field) => url.searchParams.append("fields[]", field));
      if (offset) url.searchParams.set("offset", offset);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
      if (!response.ok) throw new Error(`airtable_${response.status}`);
      const data = await response.json();
      const records = Array.isArray(data.records) ? data.records : [];
      seen += records.length;
      for (const record of records) {
        const fields = record?.fields || {};
        const mediaType = choiceName(fields[MODEL_MEDIA_FIELDS.mediaType]).toLowerCase();
        const fileType = clean(fields[MODEL_MEDIA_FIELDS.fileType]).toLowerCase();
        if (choiceName(fields[MODEL_MEDIA_FIELDS.reviewStatus]).toLowerCase() !== "approved") continue;
        if (checkboxTrue(fields[MODEL_MEDIA_FIELDS.teaserSafe]) !== true) continue;
        if (!["private_gallery", "flash_preview"].includes(mediaType)) continue;
        if (!["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(fileType)) continue;
        const linked = Array.isArray(fields[MODEL_MEDIA_FIELDS.model]) ? fields[MODEL_MEDIA_FIELDS.model][0] : fields[MODEL_MEDIA_FIELDS.model];
        const linkedName = typeof linked === "object" ? linked?.name : "";
        const linkedId = clean(typeof linked === "object" ? linked?.id : linked);
        const slug = slugify(linkedName);
        if (slug) slugs.add(slug);
        else if (/^rec[a-zA-Z0-9]+$/.test(linkedId)) modelRecordIds.add(linkedId);
      }
      offset = clean(data.offset);
    } while (offset && seen < 500);
    for (const name of await loadTeaserModelNames(env, modelRecordIds)) {
      const slug = slugify(name);
      if (slug) slugs.add(slug);
    }
  } catch (error) {
    console.warn(JSON.stringify({ worker: "sigil-booking-worker", route: PUBLIC_CATALOG_PATH, warning: "public_teaser_discovery_unavailable", error: String(error?.message || error) }));
  }
  return slugs;
}


async function loadTeaserModelNames(env, wantedIds) {
  if (!(wantedIds instanceof Set) || wantedIds.size === 0) return [];
  const names = [];
  try {
    let offset = "";
    let seen = 0;
    do {
      const table = env.AIRTABLE_TABLE_MODELS || MODELS_TABLE_ID;
      const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("returnFieldsByFieldId", "true");
      url.searchParams.append("fields[]", MODELS_FIELDS.workingName);
      if (offset) url.searchParams.set("offset", offset);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
      if (!response.ok) throw new Error(`airtable_${response.status}`);
      const data = await response.json();
      const records = Array.isArray(data.records) ? data.records : [];
      seen += records.length;
      for (const record of records) {
        if (!wantedIds.has(clean(record?.id))) continue;
        const name = clean(record?.fields?.[MODELS_FIELDS.workingName]);
        if (name) names.push(name);
      }
      offset = clean(data.offset);
    } while (offset && seen < 500 && names.length < wantedIds.size);
  } catch (error) {
    console.warn(JSON.stringify({ worker: "sigil-booking-worker", route: PUBLIC_CATALOG_PATH, warning: "public_teaser_model_mapping_unavailable", error: String(error?.message || error) }));
    return [];
  }
  return names;
}

function hasCompletePublicServiceMatrix(value = {}) {
  if (value.public_profile_approved !== true || value.public_image_approved !== true) return false;
  if (!normalizeCustomerGenders(value.genders).length) return false;
  if (!normalizeRoleKeys(value.roles).length || !normalizeRoleKeys(value.promo_roles).length) return false;
  return ["direct", "curated", "brief_only"].includes(clean(value.booking_mode).toLowerCase());
}

function validPublicPromoConsent(value = {}) {
  if (value.nonmember_image_consent !== true) return false;
  if (clean(value.promo_consent_status).toLowerCase() !== "granted") return false;
  if (clean(value.promo_consent_version) !== PUBLIC_PROMO_CONSENT_VERSION) return false;
  if (!validDateTime(value.promo_consent_at)) return false;
  if (clean(value.promo_consent_revoked_at)) return false;
  if (!PUBLIC_PROMO_CONSENT_SOURCES.has(clean(value.promo_consent_source).toLowerCase())) return false;
  return normalizeRoleKeys(value.promo_roles).length > 0;
}

function validDateTime(value) {
  const text = clean(value);
  return Boolean(text && Number.isFinite(Date.parse(text)));
}
function jsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(clean(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function choiceNames(value) {
  return (Array.isArray(value) ? value : [value]).map(choiceName).filter(Boolean);
}
function checkboxTrue(value) { return value === true || value === 1 || clean(value).toLowerCase() === "true"; }
function normalizeRoleKeys(value) {
  const allowed = new Set(["everyday_companion","driver_companion","culinary_companion","social_appearance","bangkok_companion","sport_activity","wellness_companion","business_companion","nightlife_companion","creative_companion","medical_professional"]);
  return [...new Set((Array.isArray(value) ? value : []).map((item) => clean(item).toLowerCase()).filter((item) => allowed.has(item)))];
}
function customerGendersFromScope(value) {
  const choices = (Array.isArray(value) ? value : [value]).map(choiceName).map((item) => item.toLowerCase());
  const genders = [];
  if (choices.some((item) => item === "ผู้ชาย" || item === "male" || item === "ชาย")) genders.push("male");
  if (choices.some((item) => item === "ผู้หญิง" || item === "female" || item === "หญิง")) genders.push("female");
  return genders;
}

function normalizeCustomerGenders(value) {
  const genders = (Array.isArray(value) ? value : []).map((item) => clean(item).toLowerCase()).filter((item) => item === "male" || item === "female");
  return [...new Set(genders)];
}

function choiceName(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return clean(value.name);
  return clean(value);
}

async function listPrefix(bucket, prefix) {
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    objects.push(...(Array.isArray(page?.objects) ? page.objects : []));
    cursor = page?.truncated ? clean(page.cursor) : "";
  } while (cursor && objects.length < 5000);
  return objects.slice(0, 5000);
}

function modelFolderFromParts(parts) {
  const directories = parts.slice(0, -1);
  if (!directories.length) return "";
  const last = directories[directories.length - 1];
  if (["profile", "gallery", "compcard", "photos", "images"].includes(last.toLowerCase())) {
    return directories[directories.length - 2] || "";
  }
  return last;
}

function publicSafeKey(key) {
  if (!key || key.includes("\\") || key.includes("//") || /(^|\/)\.\.(?:\/|$)/.test(key)) return false;
  return !key.split("/").some((segment) => BLOCKED_SEGMENTS.has(segment.toLowerCase()));
}

function normalizePublicAssetKeys(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]+/) : [];
  return [...new Set(values.map((item) => clean(item).replace(/^\/+/, "")).filter((item) =>
    item && IMAGE_EXTENSION.test(item) && publicSafeKey(item)
  ))];
}

function catalogPrefixes(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  const out = values.map((item) => clean(item).replace(/^\/+/, "")).filter(Boolean).map((item) => item.endsWith("/") ? item : `${item}/`);
  return [...new Set(out.length ? out : [DEFAULT_CATALOG_PREFIX])];
}

function displayName(value) {
  return clean(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
function slugify(value) {
  return clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ก-๙]+/g, "-").replace(/^-+|-+$/g, "");
}
function encodePath(value) { return value.split("/").map(encodeURIComponent).join("/"); }
function clean(value) { return String(value ?? "").trim(); }
function normalizePath(value) { const path = clean(value || "/").replace(/\/{2,}/g, "/"); return path.length > 1 ? path.replace(/\/+$/, "") : path; }

function corsHeaders(request, env) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store, max-age=0, must-revalidate",
    "access-control-allow-methods": "GET,HEAD,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "vary": "Origin",
  });
  const origin = request.headers.get("Origin") || "";
  const allowed = clean(env.ALLOWED_ORIGINS).split(",").map((item) => item.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(payload, status, headers, method) {
  return new Response(method === "HEAD" ? null : JSON.stringify(payload), { status, headers });
}
