export const MMD_INTELLIGENCE_ROUTES_V1 = Object.freeze({
  dashboard: "/v1/admin/dashboard",
  customerQueue: "/v1/admin/customer-data/queue",
  paymentQueue: "/v1/admin/payments/review-queue",
  paymentReview: "/v1/admin/payments/review",
  modelsList: "/v1/admin/models/list",
  modelResolve: "/v1/admin/models/resolve-source",
  audienceBrief: "/v1/admin/audience/brief",
  clientRecent: "/v1/admin/clients/recent",
  clientLineage: "/v1/admin/clients/lineage-lookup",
  clientIntelligence: "/v1/admin/clients/intelligence",
  kenjiMemory: "/v1/admin/kenji/control/memory",
});

export const MMD_COMPCARD_FAMILIES_V1 = Object.freeze({
  A: "Straight",
  B: "Gay",
  C: "Travel Models",
  D: "Extreme Models",
  E: "Foreigner Models",
  GWs: "Model / Super Models",
  EMs: "Actor / Artist on Mass Media",
});

const FAMILY_CODES = new Set(Object.keys(MMD_COMPCARD_FAMILIES_V1));

export function normalizeModelFamilies(model = {}) {
  const values = [
    model.compcard_family,
    model.family,
    model.compcard_theme,
    model.category,
    model.model_category,
    model.category_path,
    model.work_types,
    model.work_type,
    model.capabilities,
    model.abilities,
    model.model_code,
    model.working_name,
  ];

  const explicit = clean(model.compcard_family || model.family);
  const out = new Set();
  if (FAMILY_CODES.has(explicit)) out.add(explicit);

  const haystack = values.flatMap(toList).join(" ").toLowerCase();

  if (/\bgws[-_ ]?\d|\bgws\b/.test(haystack)) out.add("GWs");
  if (/\bems[-_ ]?\d|\bems\b/.test(haystack)) out.add("EMs");
  if (/travel/.test(haystack)) out.add("C");
  if (/extreme/.test(haystack)) out.add("D");
  if (/foreigner/.test(haystack)) out.add("E");
  if (/\bstraight\b/.test(haystack)) out.add("A");
  if (/\bgay\b/.test(haystack)) out.add("B");

  return [...out];
}

export function modelAssetReadinessScore(model = {}) {
  const checks = [
    Boolean(model.model_record_id || model.id),
    Boolean(model.r2_prefix || model.is_migrated_to_r2),
    Boolean(model.primary_image_key),
    Boolean(model.profile_ready || model.public_profile_ready),
    Boolean(model.gallery_ready || model.public_gallery_ready),
    Boolean(model.compcard_ready || model.public_compcard_ready),
  ];

  const passed = checks.filter(Boolean).length;
  return { passed, total: checks.length, ready: passed >= 5 };
}

export function paymentEvidenceHasContextIssue(item = {}) {
  const flags = item.match_flags || {};
  return !flags.payment_ref_present || !flags.amount_present || !flags.linked_payment_present;
}

export function reconcileExpectedObserved({ expected = [], observed = [], status = "" } = {}) {
  const state = clean(status).toLowerCase();
  if (/blocked|suspended|revoked|expired/.test(state)) {
    return { outcome: "remove_or_review", add: [], remove: unique(observed), fail_closed: true };
  }

  const want = unique(expected);
  const have = unique(observed);
  const add = want.filter((value) => !have.includes(value));
  const remove = have.filter((value) => !want.includes(value));

  if (!want.length && !have.length) return { outcome: "review", add, remove, fail_closed: false };
  if (add.length && remove.length) return { outcome: "review", add, remove, fail_closed: false };
  if (add.length) return { outcome: "add", add, remove, fail_closed: false };
  if (remove.length) return { outcome: "remove", add, remove, fail_closed: false };
  return { outcome: "matched", add, remove, fail_closed: false };
}

export function safeRetentionRecommendation(context = {}) {
  if (!context || context.verified !== true) return { action: "review", reason: "verified_context_required" };

  if (context.pending_request === true) return { action: "continue_request", reason: "pending_request" };
  if (context.membership_status === "expired" && context.renewal_available === true) {
    return { action: "renew", reason: "verified_expired_membership" };
  }
  if (context.public_member === true && context.public_service_available === true) {
    return { action: "public_service", reason: "verified_public_member" };
  }
  if (context.approved_coupon_available === true) return { action: "coupon", reason: "verified_coupon" };
  if (context.booking_available === true) return { action: "booking", reason: "verified_booking_context" };

  return { action: "none", reason: "no_verified_next_action" };
}

function toList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text = clean(value);
  if (!text) return [];
  return text.split(/[,|/]+/).map(clean).filter(Boolean);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];
}
