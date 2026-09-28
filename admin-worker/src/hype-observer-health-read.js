const DEFAULT_TABLE = "MMD — HYPE Observer Health";

function clean(value, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function nn(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null; }

export async function readHypeObserverHealth(env = {}) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 200);
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 2000);
  const table = clean(env.AIRTABLE_TABLE_HYPE_OBSERVER_HEALTH_ID || DEFAULT_TABLE, 200);
  if (!baseId || !token || !table) return { available:false, reason:"health_source_unavailable" };
  const url = new URL("https://api.airtable.com/v0/" + baseId + "/" + encodeURIComponent(table));
  url.searchParams.set("maxRecords","1");
  url.searchParams.set("sort[0][field]","checked_at");
  url.searchParams.set("sort[0][direction]","desc");
  try {
    const response = await fetch(url.toString(), { headers:{ authorization:"Bearer " + token } });
    const payload = await response.json().catch(() => ({}));
    const record = Array.isArray(payload.records) ? payload.records[0] : null;
    if (!response.ok || !record?.fields) return { available:false, reason:"health_source_unavailable" };
    return projectHypeObserverHealth(record.fields);
  } catch {
    return { available:false, reason:"health_source_unavailable" };
  }
}

export function projectHypeObserverHealth(fields = {}) {
  const codes = Array.isArray(fields.alert_codes) ? fields.alert_codes.map((x) => clean(x,80)).filter(Boolean).slice(0,10) : [];
  return {
    available:true,
    status:clean(fields.overall_status,40) || "unknown",
    checked_at:clean(fields.checked_at,80) || null,
    last_accepted_slip_at:clean(fields.last_accepted_slip_at,80) || null,
    accepted_last_24h:nn(fields.accepted_last_24h),
    silence_hours:nn(fields.silence_hours),
    held_open:nn(fields.held_open),
    held_new_1h:nn(fields.held_new_1h),
    extractor_failures_1h:nn(fields.extractor_failures_1h),
    extractor_consecutive_failures:nn(fields.extractor_consecutive_failures),
    outbox_retryable:nn(fields.outbox_retryable),
    outbox_failed_terminal:nn(fields.outbox_failed_terminal),
    membership_v4_last_seen_at:clean(fields.membership_v4_last_seen_at,80) || null,
    membership_v4_heartbeat_at:clean(fields.membership_v4_heartbeat_at,80) || null,
    membership_v4_seen_after_deploy:fields.membership_v4_seen_after_deploy === true,
    alert_codes:codes,
    alert_required:fields.hype_alert_required === true,
    recovery_state:clean(fields.recovery_state,40) || "none",
    summary:clean(fields.owner_summary,1000),
    operational_only:true,
    business_truth_inferred:false,
  };
}
