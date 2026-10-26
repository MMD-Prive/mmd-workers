"use strict";

// Private review metadata only. Never resolves entitlement, expiry, payments or points.
const SCHEMA = "membership_dates_review_v1";
const FLAGS = new Set([
  "ambiguous_or_missing_rename", "unparsed_rename_date", "future_rename_date",
  "legacy_rename_date_mismatch", "original_notes_not_reviewed_in_this_pass",
  "imported_rename_outdated", "future_membership_period_not_event", "period_end_requires_review",
  "rename_date_conflicts_with_free_period", "latest_renewal_unresolved",
  "first_signup_from_profile_note_timestamp_only", "black_or_lifetime_marker_unresolved",
  "conflicting_first_signup_dates", "rename_profile_date_one_day_difference",
  "display_timezone_unverified", "older_history_than_profile_note", "original_signup_date_not_found",
]);
const STATUSES = new Set(["original_notes_required", "date_conflict_review_required", "dates_extracted_review_required"]);
const EVENT_KINDS = new Set(["signup_candidate", "renewal_candidate", "profile_note_date", "signup_conflicting_candidate"]);

function dateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
function linkedIds(value) {
  return Array.isArray(value) ? value.map(x => typeof x === "string" ? x : x?.id).filter(Boolean) : [];
}
function summarizeMembershipDates(rows = [], clientId, now = new Date()) {
  const empty = state => ({ authority: SCHEMA, state, verified: false, access_verified: false,
    first_signup_date_candidate: null, latest_membership_date_candidate: null, renewal_date_candidates: [] });
  const matches = rows.filter(row => linkedIds(row?.fields?.client).includes(clientId));
  if (!matches.length) return empty("not_prepared");
  if (matches.length !== 1) return empty("ambiguous_review");
  const row = matches[0], f = row.fields || {};
  if (linkedIds(f.client).length !== 1 || f.key !== "memstart:" + clientId) return empty("invalid_evidence");
  const decision = typeof f.review_decision === "object" ? f.review_decision?.name : f.review_decision;
  if (decision === "rejected") return empty("rejected");
  let p;
  try {
    if (typeof f.membership_dates_json !== "string" || f.membership_dates_json.length > 64000) return empty("invalid_evidence");
    p = JSON.parse(f.membership_dates_json);
  } catch { return empty("invalid_evidence"); }
  const time = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(time)) return empty("invalid_evidence");
  const today = new Date(time + 7 * 3600000).toISOString().slice(0, 10);
  if (!p || p.schema_version !== SCHEMA || p.client_record_id !== clientId || p.authority !== "review_only"
      || p.grants_entitlement !== false || p.grants_points !== false || !STATUSES.has(p.review_status)
      || !Number.isFinite(Date.parse(p.reviewed_at)) || Date.parse(p.reviewed_at) > time
      || !Array.isArray(p.events) || p.events.length > 100 || !Array.isArray(p.flags)
      || p.flags.length > FLAGS.size || p.flags.some(flag => !FLAGS.has(flag))) return empty("invalid_evidence");
  const pastDate = value => { const date = dateOnly(value); return date && date <= today ? date : null; };
  const events = p.events.filter(e => e && EVENT_KINDS.has(e.kind) && pastDate(e.date));
  const first = p.first_signup_date_candidate == null ? null : pastDate(p.first_signup_date_candidate);
  const latest = p.latest_membership_date_candidate == null ? null : pastDate(p.latest_membership_date_candidate);
  if ((p.first_signup_date_candidate != null && !first) || (p.latest_membership_date_candidate != null && !latest)
      || (f.first_signup_date_candidate || null) !== first || (f.latest_membership_date_candidate || null) !== latest
      || (first && latest && first > latest)) return empty("invalid_evidence");
  const noteReviewed = p.original_notes && typeof p.original_notes === "object"
    && /^https:\/\/chat\.line\.biz\/U[a-f0-9]{32}\/chat\/U[a-f0-9]{32}$/i.test(p.original_notes.source_url || "")
    && Number.isInteger(p.original_notes.note_count) && p.original_notes.note_count > 0;
  const renameSupportsLatest = p.per_rename_snapshot?.date_candidate === latest
    && Array.isArray(p.per_rename_snapshot?.source_staging_record_ids)
    && p.per_rename_snapshot.source_staging_record_ids.length === 1;
  if ((first && (!noteReviewed || !events.some(e => e.date === first && ["signup_candidate", "profile_note_date"].includes(e.kind))))
      || (latest && !renameSupportsLatest && !(noteReviewed && events.some(e => e.date === latest)))
      || (p.review_status === "original_notes_required" && (first || noteReviewed))) return empty("invalid_evidence");
  return { ...empty(p.review_status), source_review_record_id: row.id, reviewed_at: p.reviewed_at,
    first_signup_date_candidate: first, latest_membership_date_candidate: latest,
    renewal_date_candidates: noteReviewed ? [...new Set(events.filter(e => e.kind === "renewal_candidate").map(e => e.date))].sort() : [],
    original_notes_reviewed: Boolean(noteReviewed), original_note_count: noteReviewed ? p.original_notes.note_count : 0,
    has_date_conflicts: p.review_status === "date_conflict_review_required",
    flags: [...new Set(p.flags)] };
}
module.exports = { summarizeMembershipDates };
