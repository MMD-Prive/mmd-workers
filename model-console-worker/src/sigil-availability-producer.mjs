function text(value) {
  return String(value == null ? "" : value).trim();
}

function token(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "_").replace(/^_+|_+$/g, "");
}

export function matchConsoleAvailabilitySnapshotPath(path = "") {
  const match = String(path || "").match(/^\/v1\/console\/models\/([^/]+)\/availability-snapshot$/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function resolveConsoleAvailabilityTarget(payload = {}, requestedId = "") {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const request = text(requestedId);
  const exact = [];
  for (const record of items) {
    const fields = record?.fields || {};
    const keys = [
      record?.id,
      fields.unique_key,
      fields.model_lookup_key,
      fields.model_code,
    ].map(text).filter(Boolean);
    if (!keys.some((value) => value.toLowerCase() === request.toLowerCase())) continue;
    const modelKey = text(fields.unique_key || fields.model_lookup_key || fields.model_code);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,119}$/.test(modelKey)) continue;
    const status = token(fields.status);
    if (["inactive", "blocked", "suspended", "paused", "archived"].includes(status)) {
      return { ok: false, status: 409, error: "model_not_available_for_snapshot" };
    }
    exact.push({ model_key: modelKey });
  }
  if (exact.length !== 1) {
    return {
      ok: false,
      status: exact.length > 1 ? 409 : 404,
      error: exact.length > 1 ? "model_identity_ambiguous" : "model_identity_not_found",
    };
  }
  return { ok: true, ...exact[0] };
}

export function boundedConsoleAvailabilityBody(body = {}, modelKey = "") {
  const location = body?.location_scope && typeof body.location_scope === "object"
    ? body.location_scope
    : {};
  const flags = body?.operational_flags && typeof body.operational_flags === "object"
    ? body.operational_flags
    : {};
  return {
    model_key: modelKey,
    availability_state: body.availability_state || body.safe_availability_state || body.state,
    ...(body.expires_at ? { expires_at: body.expires_at } : {}),
    ...(body.ttl_seconds != null ? { ttl_seconds: body.ttl_seconds } : {}),
    location_scope: {
      city: location.city || body.city || "",
      zones: Array.isArray(location.zones) ? location.zones : (Array.isArray(body.zones) ? body.zones : []),
    },
    operational_flags: {
      ...(Object.prototype.hasOwnProperty.call(flags, "burn") ? { burn: flags.burn } : {}),
      ...(Object.prototype.hasOwnProperty.call(flags, "mk") ? { mk: flags.mk } : {}),
      ...(Object.prototype.hasOwnProperty.call(flags, "live") ? { live: flags.live } : {}),
    },
  };
}


export function modelAvailabilityCoverageIdentity(record = {}) {
  const fields = record?.fields || record || {};
  const modelKey = text(fields.unique_key || fields.model_lookup_key || fields.model_code);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,119}$/.test(modelKey)) return null;
  return {
    id: text(record?.id || modelKey),
    model_key: modelKey,
    display_name: text(fields.working_name || fields.nickname || fields.name || modelKey).slice(0, 80),
  };
}

export function availabilityCoverageRow(model = {}, result = {}) {
  const data = result?.data || {};
  return {
    model_id: text(model.id),
    model_key: text(model.model_key),
    display_name: text(model.display_name).slice(0, 80),
    snapshot_state: result?.ok ? text(data.snapshot_state || "missing") : "unavailable",
    fresh: result?.ok && data.fresh === true,
    age_seconds: Number.isFinite(Number(data.age_seconds)) ? Number(data.age_seconds) : null,
    ttl_remaining_seconds: Number.isFinite(Number(data.ttl_remaining_seconds)) ? Number(data.ttl_remaining_seconds) : null,
    safe_availability_state: text(data.snapshot?.safe_availability_state),
    confidence: text(data.snapshot?.confidence),
    updated_at: data.snapshot?.updated_at || null,
    expires_at: data.snapshot?.expires_at || null,
  };
}

export function availabilityCoverageCounts(items = []) {
  return (Array.isArray(items) ? items : []).reduce((acc, item) => {
    const key = text(item?.snapshot_state || "unknown") || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
