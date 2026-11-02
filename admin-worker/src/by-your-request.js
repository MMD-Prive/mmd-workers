/**
 * By Your Request domain contract.
 *
 * This module is deliberately transport/UI agnostic. It is shared by the
 * authenticated MY MMD intake and the historical LINE importer so both lanes
 * write the same shape without granting either lane model-approval powers.
 */

export const BY_YOUR_REQUEST_SCHEMA = "mmd.by_your_request.v1";
export const BY_YOUR_REQUEST_TABLE = "By Your Request";
export const BY_YOUR_REQUEST_MONTHLY_LIMIT = 4;
export const BY_YOUR_REQUEST_TIME_ZONE = "Asia/Bangkok";

export const REQUEST_SOURCES = Object.freeze({
  my_mmd: "my_mmd",
  line: "line",
  historical_line: "historical_line",
});

export const REVIEW_STATUSES = Object.freeze([
  "new",
  "identity_unknown",
  "known_not_rostered",
  "known_rostered",
  "contact_review",
  "contacted",
  "closed",
]);

export const MEDIA_STATUSES = Object.freeze([
  "received",
  "missing_original",
  "not_provided",
]);

export function monthKeyInBangkok(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_timestamp");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BY_YOUR_REQUEST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function canonicalCustomerIdentity({ clientId, lineUserId, customerKey, customerIdentity } = {}) {
  const value = clean(clientId || lineUserId || customerKey || customerIdentity, 160);
  if (!value) throw new Error("canonical_customer_identity_required");
  return value;
}

/**
 * Count distinct requested people, not media files. The caller must provide
 * an explicit stable person key; this function never guesses from a face,
 * display name, handle, or screenshot.
 */
export function countMonthlyPeople(records, customerIdentity, monthKey) {
  const people = new Set();
  for (const record of records || []) {
    if (record.archival_import === true) continue;
    if (record.customer_identity !== customerIdentity || record.month_key !== monthKey) continue;
    const personKey = clean(record.requested_person_key, 240);
    if (personKey) people.add(personKey);
  }
  return people.size;
}

export function enforceMonthlyQuota({ existingRecords = [], customerIdentity, requestedPersonKey, at = new Date(), archivalImport = false } = {}) {
  if (archivalImport) return { allowed: true, archival_import: true, used: null, remaining: null, month_key: monthKeyInBangkok(at) };
  const identity = canonicalCustomerIdentity({ clientId: customerIdentity });
  const personKey = clean(requestedPersonKey, 240);
  if (!personKey) throw new Error("requested_person_key_required");
  const monthKey = monthKeyInBangkok(at);
  const used = countMonthlyPeople(existingRecords, identity, monthKey);
  const alreadyRequested = existingRecords.some((record) => !record.archival_import
    && record.customer_identity === identity
    && record.month_key === monthKey
    && record.requested_person_key === personKey);
  const allowed = alreadyRequested || used < BY_YOUR_REQUEST_MONTHLY_LIMIT;
  return { allowed, already_requested: alreadyRequested, used, remaining: Math.max(0, BY_YOUR_REQUEST_MONTHLY_LIMIT - used - (alreadyRequested ? 0 : 1)), month_key: monthKey };
}

export async function stableRequestId({ source, sourceId, customerIdentity, requestedPersonKey } = {}) {
  const normalized = [clean(source, 40), clean(sourceId, 240), clean(customerIdentity, 160), clean(requestedPersonKey, 240)].join("\u001f");
  if (!clean(sourceId, 240)) throw new Error("stable_source_id_required");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return `byr_${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function buildByYourRequestFields(input = {}) {
  const source = clean(input.source, 40);
  if (!Object.values(REQUEST_SOURCES).includes(source)) throw new Error("invalid_request_source");
  const customerIdentity = canonicalCustomerIdentity(input);
  const submittedAt = new Date(input.submittedAt || input.sentAt || Date.now());
  if (Number.isNaN(submittedAt.getTime())) throw new Error("invalid_timestamp");
  const archivalImport = input.archivalImport === true;
  const mediaStatus = clean(input.mediaStatus || (input.media?.length ? "received" : "not_provided"), 40);
  if (!MEDIA_STATUSES.includes(mediaStatus)) throw new Error("invalid_media_status");
  const reviewStatus = clean(input.reviewStatus || "new", 40);
  if (!REVIEW_STATUSES.includes(reviewStatus)) throw new Error("invalid_review_status");
  return {
    Schema: BY_YOUR_REQUEST_SCHEMA,
    "Request ID": clean(input.requestId, 240),
    "Source": source,
    "Source ID": clean(input.sourceId, 240),
    "Customer Identity": customerIdentity,
    "Customer Name": clean(input.customerName, 160),
    "Requested Person Key": clean(input.requestedPersonKey, 240),
    "Requested Person Label": clean(input.requestedPersonLabel, 240),
    "Original Inquiry": clean(input.inquiryText, 4000),
    "Sent At": submittedAt.toISOString(),
    "Month Key": monthKeyInBangkok(submittedAt),
    "Submitted Social Links": Array.isArray(input.socialLinks) ? input.socialLinks.filter((url) => typeof url === "string").map((url) => url.trim()).filter(Boolean).slice(0, 20).join("\n") : "",
    "Social Handles Verified": input.socialHandlesVerified === true ? "yes" : "no",
    "Media Status": mediaStatus,
    "Media References": JSON.stringify(Array.isArray(input.media) ? input.media : []),
    "Review Status": reviewStatus,
    "Archival Import": archivalImport ? "yes" : "no",
    "Privacy Level": "private",
    "Unknown Identity Explicit": input.identityUnknown === true ? "yes" : "no",
    "No Automatic Identification": "yes",
  };
}

function clean(value, max) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

