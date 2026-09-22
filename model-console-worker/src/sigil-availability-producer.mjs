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

export function matchConsoleAvailabilityReminderPath(path = "") {
  const match = String(path || "").match(/^\/v1\/console\/models\/([^/]+)\/availability-reminder$/);
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

export function modelAvailabilityAdoptionIdentity(record = {}) {
  const fields = record?.fields || record || {};
  const modelKey = text(fields.unique_key || fields.model_lookup_key || fields.model_code);
  const validModelKey = /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,119}$/.test(modelKey) ? modelKey : "";
  const displayName = text(fields.working_name || fields.nickname || fields.name || validModelKey || record?.id).slice(0, 80);
  if (!displayName && !validModelKey) return null;

  const status = token(fields.status);
  const excluded = ["inactive", "blocked", "suspended", "paused", "archived", "retired"].includes(status);
  const lineUserId = text(fields.line_user_id);
  const telegramUserId = text(fields.telegram_user_id);
  const telegramStatus = token(fields.telegram_verification_status);

  return {
    id: text(record?.id || validModelKey),
    model_key: validModelKey,
    display_name: displayName,
    canonical_status: status || "unreviewed",
    excluded,
    line_connected: /^U[0-9a-f]{32}$/i.test(lineUserId),
    telegram_connected: telegramStatus === "verified" && /^\d{5,20}$/.test(telegramUserId),
  };
}

export function availabilityAdoptionRow(model = {}, result = {}) {
  if (!model?.model_key) {
    return {
      model_id: text(model?.id),
      model_key: "",
      display_name: text(model?.display_name).slice(0, 80),
      canonical_status: text(model?.canonical_status || "unreviewed"),
      snapshot_state: "identity_missing",
      fresh: false,
      safe_availability_state: "",
      confidence: "",
      age_seconds: null,
      ttl_remaining_seconds: null,
      line_connected: model?.line_connected === true,
      telegram_connected: model?.telegram_connected === true,
      reminder_eligible: false,
      reminder_channel: "",
      recovery_action: "link_canonical_model_key",
    };
  }

  if (model?.excluded === true) {
    return {
      model_id: text(model.id),
      model_key: text(model.model_key),
      display_name: text(model.display_name).slice(0, 80),
      canonical_status: text(model.canonical_status || "inactive"),
      snapshot_state: "excluded",
      fresh: false,
      safe_availability_state: "",
      confidence: "",
      age_seconds: null,
      ttl_remaining_seconds: null,
      line_connected: model?.line_connected === true,
      telegram_connected: model?.telegram_connected === true,
      reminder_eligible: false,
      reminder_channel: "",
      recovery_action: "none",
    };
  }

  const row = availabilityCoverageRow(model, result);
  const needsConfirmation = row.fresh !== true;
  const lineConnected = model?.line_connected === true;
  return {
    ...row,
    canonical_status: text(model?.canonical_status || "unreviewed"),
    line_connected: lineConnected,
    telegram_connected: model?.telegram_connected === true,
    reminder_eligible: needsConfirmation && lineConnected,
    reminder_channel: needsConfirmation && lineConnected ? "line" : "",
    recovery_action: row.fresh
      ? "none"
      : lineConnected
        ? "remind_model"
        : "connect_line_identity",
  };
}

export function availabilityAdoptionCounts(items = []) {
  const counts = {
    total: 0,
    fresh: 0,
    needs_confirmation: 0,
    remindable: 0,
    no_channel: 0,
    identity_missing: 0,
    excluded: 0,
  };
  for (const item of Array.isArray(items) ? items : []) {
    counts.total += 1;
    if (item?.snapshot_state === "excluded") {
      counts.excluded += 1;
      continue;
    }
    if (item?.snapshot_state === "identity_missing") {
      counts.identity_missing += 1;
      counts.needs_confirmation += 1;
      continue;
    }
    if (item?.fresh === true) {
      counts.fresh += 1;
      continue;
    }
    counts.needs_confirmation += 1;
    if (item?.reminder_eligible === true) counts.remindable += 1;
    else counts.no_channel += 1;
  }
  return counts;
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
