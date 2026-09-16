import { loadMmsServiceZoneIndex } from "./service-zones-runtime.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const APPLICATION_PATH = "/mms/api/applications";
const ZONE_CODE_RE = /^(BKK|NBI|PTE|SPK|SKN|NPT)-[A-Z0-9-]{2,70}$/;
const MAX_COVERAGE_ZONES = 45;

/**
 * Canonical Province -> Service Zone bridge for the public MMS Therapist form.
 *
 * The legacy application runtime remains the owner of applicant validation,
 * idempotency, private upload grants, sensitive-data separation and Telegram.
 * This bridge adds only one bounded responsibility:
 *   - accept stable Zone Codes from the browser,
 *   - resolve them against active Airtable MMS Service Zones,
 *   - forward a legacy-compatible application request,
 *   - project the canonical linked records onto the Application row before the
 *     browser is allowed to continue to uploads.
 *
 * Airtable record IDs are never accepted from the browser.
 */
export async function maybeHandleCanonicalZoneApplication(request, env = {}, ctx, runtime) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (path !== APPLICATION_PATH || request.method !== "POST") return null;

  const body = await readJsonClone(request);
  const hasCanonicalSelection = Object.hasOwn(body, "base_service_zone_code")
    || Object.hasOwn(body, "coverage_service_zone_codes");
  if (!hasCanonicalSelection) return null;

  if (!runtime?.fetch) throw applicationZoneError(503, "APPLICATION_RUNTIME_UNAVAILABLE");

  const selection = await resolveSelection(body, env);
  const forwardedBody = { ...body };
  delete forwardedBody.base_service_zone_code;
  delete forwardedBody.coverage_service_zone_codes;

  // Work Base Area remains a human-readable compatibility field only. Canonical
  // matching authority is the linked Service Zone fields resolved below.
  forwardedBody.work_base_area = selection.base.safe_label_th
    || selection.base.label_th
    || forwardedBody.work_base_area
    || selection.base.code;

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  const forwarded = new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify(forwardedBody),
    redirect: request.redirect,
  });

  const response = await runtime.fetch(forwarded, env, ctx);
  if (!response.ok) return response;

  const payload = await response.clone().json().catch(() => null);
  const applicationId = clean(payload?.application_id || payload?.application_ref, 80);
  if (!/^mmsapp_[a-f0-9]{24}$/.test(applicationId)) {
    return errorFromResponse(response, 503, "APPLICATION_ZONE_PROJECTION_INVALID_RESPONSE");
  }

  // Do not let the UI proceed to private uploads until the canonical zone links
  // are on the Airtable application row. A retry with the same idempotency key
  // is safe: the legacy runtime returns its duplicate response, then this patch
  // is attempted again.
  if (payload?.storage?.airtable !== "synced") {
    return errorFromResponse(response, 503, "APPLICATION_ZONE_SYNC_PENDING", {
      application_ref: applicationId,
      retryable: true,
    });
  }

  try {
    await projectApplicationZones(env, applicationId, selection);
  } catch (error) {
    const code = clean(error?.code || error?.message, 120) || "APPLICATION_ZONE_SYNC_FAILED";
    return errorFromResponse(response, Number(error?.status) || 503, code, {
      application_ref: applicationId,
      retryable: true,
    });
  }

  const out = payload && typeof payload === "object" ? { ...payload } : { ok: true };
  out.service_zones = {
    status: "synced",
    base: publicZone(selection.base),
    coverage: selection.coverage.map(publicZone),
  };
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store, max-age=0");
  return new Response(JSON.stringify(out), { status: response.status, headers: responseHeaders });
}

export function canonicalZoneApplicationErrorResponse(error) {
  const status = Number(error?.status) || 503;
  const code = clean(error?.code || error?.message, 120) || "APPLICATION_SERVICE_ZONE_UNAVAILABLE";
  return new Response(JSON.stringify({ ok: false, error: { code } }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function resolveSelection(body, env) {
  const baseCode = canonicalCode(body?.base_service_zone_code);
  if (!baseCode) throw applicationZoneError(400, "BASE_SERVICE_ZONE_REQUIRED");

  const coverageCodes = normalizeCoverageCodes(body?.coverage_service_zone_codes)
    .filter((code) => code !== baseCode);

  let index;
  try {
    index = await loadMmsServiceZoneIndex(env);
  } catch (error) {
    throw applicationZoneError(Number(error?.status) || 503, clean(error?.code || error?.message, 120) || "SERVICE_ZONE_CATALOG_UNAVAILABLE");
  }

  const base = index.byCode.get(baseCode);
  if (!base?.record_id) throw applicationZoneError(400, "BASE_SERVICE_ZONE_INVALID");

  const coverage = [];
  for (const code of coverageCodes) {
    const zone = index.byCode.get(code);
    if (!zone?.record_id) throw applicationZoneError(400, "COVERAGE_SERVICE_ZONE_INVALID");
    coverage.push(zone);
  }

  return { base, coverage };
}

async function projectApplicationZones(env, applicationId, selection) {
  requireAirtable(env);
  const table = clean(env.AIRTABLE_APPLICATIONS_TABLE_ID, 80);
  if (!/^tbl[A-Za-z0-9]{14}$/.test(table)) throw applicationZoneError(503, "AIRTABLE_APPLICATIONS_TABLE_INVALID");

  const existing = await findApplication(env, table, applicationId);
  if (!existing) throw applicationZoneError(503, "APPLICATION_ZONE_ROW_NOT_READY");

  const currentPayload = parseObject(existing.fields?.["Payload JSON"]);
  const coverageCodes = selection.coverage.map((zone) => zone.code);
  const payloadJson = JSON.stringify({
    ...currentPayload,
    base_service_zone_code: selection.base.code,
    coverage_service_zone_codes: coverageCodes,
    service_zone_catalog: "MMS Service Zones",
  });

  await airtableFetch(env, `${table}/${encodeURIComponent(existing.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        "Base Service Zone": [selection.base.record_id],
        "Coverage Service Zones": selection.coverage.map((zone) => zone.record_id),
        "Work Base Area": selection.base.safe_label_th || selection.base.label_th || selection.base.code,
        "Payload JSON": payloadJson,
      },
      typecast: false,
    }),
  });
}

async function findApplication(env, table, applicationId) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{Application ID}=${formulaString(applicationId)}`);
  const payload = await airtableFetch(env, url.toString(), { method: "GET" }, true);
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (records.length > 1) throw applicationZoneError(503, "APPLICATION_ID_CONFLICT");
  return records[0] || null;
}

async function airtableFetch(env, pathOrUrl, init = {}, absolute = false) {
  requireAirtable(env);
  const url = absolute
    ? pathOrUrl
    : `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${pathOrUrl}`;
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch {
    throw applicationZoneError(503, "AIRTABLE_APPLICATION_ZONE_UNAVAILABLE");
  }
  if (!response.ok) throw applicationZoneError(503, `AIRTABLE_APPLICATION_ZONE_${response.status}`);
  const payload = await response.json().catch(() => null);
  if (!payload) throw applicationZoneError(503, "AIRTABLE_APPLICATION_ZONE_INVALID_RESPONSE");
  return payload;
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_BASE_ID, 80) || !String(env.AIRTABLE_API_TOKEN || "").trim()) {
    throw applicationZoneError(503, "APPLICATION_ZONE_AIRTABLE_NOT_CONFIGURED");
  }
}

function normalizeCoverageCodes(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw applicationZoneError(400, "COVERAGE_SERVICE_ZONES_INVALID");
  if (value.length > MAX_COVERAGE_ZONES) throw applicationZoneError(400, "COVERAGE_SERVICE_ZONES_TOO_MANY");
  const codes = value.map(canonicalCode);
  if (codes.some((code) => !code)) throw applicationZoneError(400, "COVERAGE_SERVICE_ZONE_INVALID");
  return [...new Set(codes)];
}

function canonicalCode(value) {
  const code = clean(value, 80).toUpperCase();
  return ZONE_CODE_RE.test(code) ? code : "";
}

function publicZone(zone) {
  return {
    code: zone.code,
    province_code: zone.province_code,
    province_label_th: zone.province_label_th,
    label_th: zone.label_th,
    safe_label_th: zone.safe_label_th || zone.label_th,
  };
}

function errorFromResponse(response, status, code, extra = {}) {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store, max-age=0");
  return new Response(JSON.stringify({
    ok: false,
    error: { code },
    ...extra,
  }), { status, headers });
}

async function readJsonClone(request) {
  const type = clean(request.headers.get("content-type"), 120).toLowerCase();
  if (!type.startsWith("application/json")) throw applicationZoneError(415, "JSON_REQUIRED");
  let value;
  try {
    value = await request.clone().json();
  } catch {
    throw applicationZoneError(400, "INVALID_JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw applicationZoneError(400, "INVALID_JSON");
  return value;
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function clean(value, max = 500) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

class ApplicationZoneError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function applicationZoneError(status, code) {
  return new ApplicationZoneError(status, code);
}

export const canonicalZoneApplicationContract = Object.freeze({
  path: APPLICATION_PATH,
  browser_fields: Object.freeze(["base_service_zone_code", "coverage_service_zone_codes"]),
  authority: "active MMS Service Zones by Zone Code",
  airtable_projection: Object.freeze(["Base Service Zone", "Coverage Service Zones"]),
  record_ids_from_browser: false,
});
