const AIRTABLE_API = "https://api.airtable.com/v0";
const PUBLIC_PATH = "/mms/api/service-zones";
const APP_PATH = "/male-massage/therapists/api/app/service-zones";
const CATALOG_VERSION = "2026-09-09.v1";

const PROVINCE_ORDER = Object.freeze([
  "BKK",
  "NBI",
  "PTE",
  "SPK",
  "SKN",
  "NPT",
]);

export function isMmsServiceZoneRequest(pathname = "") {
  const path = normalizePath(pathname);
  return path === PUBLIC_PATH || path === APP_PATH;
}

export async function maybeHandleMmsServiceZones(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (!isMmsServiceZoneRequest(path)) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(request, env) });
  }
  if (request.method !== "GET") {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, request, env);
  }

  try {
    const records = await listActiveServiceZones(env);
    const zones = records
      .map(zoneProjection)
      .filter((zone) => zone.code && zone.province_code && zone.label_th)
      .sort((a, b) => a.sort_order - b.sort_order || a.label_th.localeCompare(b.label_th, "th"));

    if (!zones.length) throw serviceZoneError(503, "SERVICE_ZONE_CATALOG_EMPTY");

    const provinces = buildProvinceProjection(zones);
    return json({
      ok: true,
      data: {
        version: CATALOG_VERSION,
        country_code: "TH",
        metro_label_th: "กรุงเทพฯ และปริมณฑล",
        provinces,
        zones: zones.map(publicZoneProjection),
      },
    }, 200, request, env);
  } catch (error) {
    const status = Number(error?.status) || 503;
    const code = clean(error?.code || error?.message, 120) || "SERVICE_ZONE_CATALOG_UNAVAILABLE";
    return json({ ok: false, error: { code } }, status, request, env);
  }
}

export async function loadMmsServiceZoneIndex(env = {}) {
  const records = await listActiveServiceZones(env);
  const byRecordId = new Map();
  const byCode = new Map();
  for (const record of records) {
    const projected = zoneProjection(record);
    if (!projected.code) continue;
    byRecordId.set(String(record.id || ""), projected);
    byCode.set(projected.code, { ...projected, record_id: String(record.id || "") });
  }
  return { byRecordId, byCode };
}

export function linkedServiceZoneCodes(value, index) {
  const ids = Array.isArray(value) ? value.map((item) => String(item || "")).filter(Boolean) : [];
  return [...new Set(ids.map((id) => index?.byRecordId?.get(id)?.code).filter(Boolean))];
}

async function listActiveServiceZones(env) {
  requireConfig(env);
  const records = [];
  let offset = "";
  for (let page = 0; page < 5; page += 1) {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_SERVICE_ZONES_TABLE_ID)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("filterByFormula", "{Active}=TRUE()");
    if (offset) url.searchParams.set("offset", offset);

    let response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}` } });
    } catch {
      throw serviceZoneError(503, "AIRTABLE_SERVICE_ZONES_UNAVAILABLE");
    }
    if (!response.ok) throw serviceZoneError(503, `AIRTABLE_SERVICE_ZONES_${response.status}`);
    const payload = await response.json().catch(() => null);
    if (!payload || !Array.isArray(payload.records)) throw serviceZoneError(503, "AIRTABLE_SERVICE_ZONES_INVALID_RESPONSE");
    records.push(...payload.records);
    offset = clean(payload.offset, 240);
    if (!offset) break;
  }
  return records;
}

function zoneProjection(record) {
  const fields = record?.fields || {};
  return {
    code: clean(fields["Zone Code"], 80),
    province_code: clean(selectName(fields["Province Code"]), 20),
    province_label_th: clean(selectName(fields["Province TH"]), 120),
    province_label_en: clean(fields["Province EN"], 120),
    metro_group: clean(selectName(fields["Metro Group"]), 40),
    label_th: clean(fields["Zone Name TH"], 240) || clean(fields["Zone Label"], 240),
    label_en: clean(fields["Zone Name EN"], 240) || null,
    safe_label_th: clean(fields["Customer Safe Label TH"], 180) || null,
    admin_areas_th: clean(fields["Admin Areas TH"], 1000) || null,
    launch_phase: clean(selectName(fields["Launch Phase"]), 40) || null,
    legacy_zone_label: clean(fields["Legacy Zone Label"], 120) || null,
    sort_order: Number.isFinite(Number(fields["Sort Order"])) ? Number(fields["Sort Order"]) : 9999,
  };
}

function publicZoneProjection(zone) {
  return {
    code: zone.code,
    province_code: zone.province_code,
    province_label_th: zone.province_label_th,
    province_label_en: zone.province_label_en,
    metro_group: zone.metro_group,
    label_th: zone.label_th,
    label_en: zone.label_en,
    safe_label_th: zone.safe_label_th,
    admin_areas_th: zone.admin_areas_th,
    launch_phase: zone.launch_phase,
    sort_order: zone.sort_order,
  };
}

function buildProvinceProjection(zones) {
  const map = new Map();
  for (const zone of zones) {
    if (!map.has(zone.province_code)) {
      map.set(zone.province_code, {
        code: zone.province_code,
        label_th: zone.province_label_th,
        label_en: zone.province_label_en,
        metro_group: zone.metro_group,
        zone_count: 0,
      });
    }
    map.get(zone.province_code).zone_count += 1;
  }
  return [...map.values()].sort((a, b) => {
    const ai = PROVINCE_ORDER.indexOf(a.code);
    const bi = PROVINCE_ORDER.indexOf(b.code);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.label_th.localeCompare(b.label_th, "th");
  });
}

function requireConfig(env) {
  if (!clean(env.AIRTABLE_BASE_ID, 80) || !String(env.AIRTABLE_API_TOKEN || "").trim()) {
    throw serviceZoneError(503, "SERVICE_ZONE_CATALOG_NOT_CONFIGURED");
  }
  const tableId = clean(env.AIRTABLE_SERVICE_ZONES_TABLE_ID, 80);
  if (!/^tbl[A-Za-z0-9]{14}$/.test(tableId)) throw serviceZoneError(503, "AIRTABLE_SERVICE_ZONES_TABLE_INVALID");
}

function responseHeaders(request, env) {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  const origin = clean(request?.headers?.get?.("Origin"), 300);
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (origin && allowed.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
    headers.set("Vary", "Origin");
  }
  return headers;
}

function json(payload, status, request, env) {
  const headers = responseHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function selectName(value) {
  return value && typeof value === "object" && typeof value.name === "string" ? value.name : value;
}

function clean(value, max = 500) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

class ServiceZoneError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function serviceZoneError(status, code) {
  return new ServiceZoneError(status, code);
}

export const mmsServiceZoneContract = Object.freeze({
  version: CATALOG_VERSION,
  paths: Object.freeze([PUBLIC_PATH, APP_PATH]),
  province_order: PROVINCE_ORDER,
  canonical_table: "MMS Service Zones",
  selection: Object.freeze({ customer: "one active service zone", therapist_base: "one active service zone", therapist_coverage: "one or more active service zones" }),
});
