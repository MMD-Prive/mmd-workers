// Public promotion evidence is a separate, read-only authority from coupons,
// payment honor, membership entitlements, and old Kenji knowledge cards.
// This contract does not fetch Airtable, read member records or publish a campaign.
export const PUBLIC_PROMOTION_EVIDENCE_SCHEMA = "mmd.public_promotion_evidence.v1";
export const PUBLIC_PROMOTION_EVIDENCE_URL = "https://promotion-evidence.internal/__internal/kenji/public-promotions";

const MAX_EVIDENCE_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 60 * 1000;
const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_SHA = /^[a-f0-9]{40}$/i;
const CAMPAIGN_ID = /^[a-z0-9][a-z0-9_-]{2,99}$/;
const ABSOLUTE_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const CARE_BACK_PUBLIC_PATH = "/promotion/6-years-care-back";
const CARE_BACK_POLICY_BLOB_SHA = "36c09b80beeadd3afab3f9355422e7034b8eb56e";
const NOVEMBER_START_MS = Date.parse("2026-11-01T00:00:00+07:00");
const NOVEMBER_END_MS = Date.parse("2026-12-01T00:00:00+07:00");

function fail(reason) {
  return { ok: false, reason };
}

function instant(value) {
  if (typeof value !== "string" || !ABSOLUTE_INSTANT.test(value)) return NaN;
  return Date.parse(value);
}

function safePublicUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["mmdbkk.com", "www.mmdbkk.com"].includes(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash) return null;
    if (!/^\/promotion\/[a-z0-9-]+$/.test(url.pathname) || /preview|draft|internal/i.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function sha256Hex(copy) {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(copy);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The evidence producer must independently verify owner approval, deployed
// public copy, Webflow publication revision and canonical source revisions.
// A self-labelled published Knowledge Card or active Promo Code is NOT evidence.
// A single, audience-safe campaign is required until multi-campaign selection
// has its own approved design. Unknown fields are never echoed to the caller.
export async function selectPublishedPromotionEvidence(snapshot, {
  now = Date.now(),
  digestCopy = sha256Hex,
} = {}) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
    || snapshot.schema_version !== PUBLIC_PROMOTION_EVIDENCE_SCHEMA
    || snapshot.authority !== "mmd_promotion_evidence_registry"
    || snapshot.read_only !== true) return fail("contract_unavailable");

  const observedAt = instant(snapshot.observed_at);
  if (!Number.isFinite(observedAt) || !Number.isFinite(now)
    || observedAt > now + MAX_FUTURE_SKEW_MS || now - observedAt > MAX_EVIDENCE_AGE_MS) {
    return fail("evidence_not_fresh");
  }

  if (!Array.isArray(snapshot.campaigns) || snapshot.campaigns.length !== 1) {
    return fail("unambiguous_campaign_required");
  }
  const campaign = snapshot.campaigns[0];
  if (!campaign || typeof campaign !== "object" || Array.isArray(campaign)) return fail("invalid_campaign");

  const { campaign_id: id, audience, approval, publication, display_window: window, source_revision: revisions } = campaign;
  if (!CAMPAIGN_ID.test(id || "") || audience !== "public"
    || approval?.state !== "approved" || approval.approved_by !== "Boss Per"
    || !String(approval.approval_ref || "").trim()
    || publication?.state !== "published" || !String(publication.publish_ref || "").trim()
    || !String(publication.revision || "").trim()) return fail("publication_or_approval_missing");

  const publicUrl = safePublicUrl(publication.public_url);
  const approvedAt = instant(approval.approved_at);
  const publishedAt = instant(publication.published_at);
  const startsAt = instant(window?.starts_at);
  const endsBefore = instant(window?.ends_before);
  if (!publicUrl || ![approvedAt, publishedAt, startsAt, endsBefore].every(Number.isFinite)
    || approvedAt > publishedAt || publishedAt > observedAt + MAX_FUTURE_SKEW_MS
    || startsAt >= endsBefore) return fail("invalid_publication_window");

  const copy = approval.copy_th;
  if (typeof copy !== "string" || !copy.trim() || copy.length > 1200
    || !SHA256.test(approval.copy_sha256 || "")
    || !SHA256.test(publication.copy_sha256 || "")
    || !GIT_SHA.test(revisions?.policy_git_blob_sha || "")
    || !String(revisions?.approval_revision || "").trim()
    || !String(revisions?.publication_revision || "").trim()
    || revisions.approval_revision !== approval.approval_ref
    || revisions.publication_revision !== publication.revision
    || approval.copy_sha256 !== publication.copy_sha256
    || approval.copy_sha256 !== revisions.approved_copy_sha256
    || publication.copy_sha256 !== revisions.published_copy_sha256) {
    return fail("copy_revision_mismatch");
  }

  // The CARE BACK November announcement must not inherit the December honor
  // deadline or the old October display window. The policy blob SHA is a
  // reviewed source lock; update it only when canonical policy changes are reviewed.
  if (new URL(publicUrl).pathname === CARE_BACK_PUBLIC_PATH
    && (revisions.policy_git_blob_sha !== CARE_BACK_POLICY_BLOB_SHA
      || startsAt < NOVEMBER_START_MS || endsBefore > NOVEMBER_END_MS)) {
    return fail("canonical_policy_mismatch");
  }

  const actualHash = await digestCopy(copy).catch(() => null);
  if (!actualHash || actualHash.toLowerCase() !== approval.copy_sha256.toLowerCase()) {
    return fail("approved_copy_integrity_failed");
  }

  if (now < startsAt) return fail("campaign_not_started");
  return {
    ok: true,
    campaign_id: id,
    state: now < endsBefore ? "published" : "announcement_expired",
    reply: now < endsBefore ? copy.trim() : null,
    public_url: publicUrl,
  };
}
