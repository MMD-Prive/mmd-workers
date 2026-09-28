import { handleSupplierPortal } from "./supplier-portal.js";

const DEFAULT_LIFF_ID = "2011701290-xBE3CirT";
const DEFAULT_LIFF_ENDPOINT = "https://mmdbkk.com/shop/supplier/liff";
const DEFAULT_PREFLIGHT_TABLE = "tblN60x93vqn5BYhB";
const PREFLIGHT_PAGE_PATHS = new Set([
  "/shop/supplier/liff/owner-preflight",
  "/shop/supplier/liff/owner-preflight/",
]);
const LIFF_ROOT_PATHS = new Set([
  "/shop/supplier/liff",
  "/shop/supplier/liff/",
]);
const PREFLIGHT_API_PATH = "/shop/supplier/liff/preflight-api";
const PREFLIGHT_CONFIG_PATH = "/shop/supplier/liff/preflight-config";

const PREFLIGHT_FIELDS = Object.freeze({
  id: "flduHW3z3gIjpoanx",
  supplier: "fldynuOuREgHjFore",
  status: "fld2yjpfQxl4DgmrI",
  inviteToken: "fld6ncHBcH8C7nyZZ",
  inviteExpiresAt: "fldb1GhlTt6Rp6Nfm",
  ownerLineUserId: "fldYyTRZNOjmnY7SI",
  ownerLineName: "fldUcju86EZw8RBpq",
  liffId: "fldk12KwLt131f6Wl",
  endpointExpected: "fldv4FXeC9ryoiI7j",
  endpointObserved: "fldZDiLBlq2q91MrT",
  boundAt: "fldAmyuvDIZHrT2VZ",
  completedAt: "fldtKujE6YqXEwuUX",
  summaryReceipt: "fldIfc67Y4PVw4lSh",
  errorCode: "fldh5v5ec7L6PHIjn",
  auditNote: "fld9n1kSYv4pHXTXV",
});

const SUPPLIER_FIELDS = Object.freeze({
  name: "fldePq8Fmqq50CkPj",
  status: "fld0BL7nG45ueEMKQ",
  lineUserId: "fld1dqO4nWB3Pf6uT",
  lineStatus: "fldZyHoik9SAUcbY6",
});

export async function handleSupplierOwnerPreflightRequest(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (method === "GET" && shouldRenderPreflightPage(url)) {
    return handlePreflightPageEntry(request, env);
  }

  if (method === "POST" && path === PREFLIGHT_API_PATH) {
    return runOwnerPreflight(request, env);
  }

  if ((method === "GET" || method === "POST") && path === PREFLIGHT_CONFIG_PATH) {
    return checkOrRepairLiffConfig(request, env);
  }

  if (method === "OPTIONS" && [PREFLIGHT_API_PATH, PREFLIGHT_CONFIG_PATH].includes(path)) {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "https://mmdbkk.com",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        "cache-control": "no-store",
      },
    });
  }

  return null;
}

function shouldRenderPreflightPage(url) {
  if (PREFLIGHT_PAGE_PATHS.has(url.pathname)) return true;
  if (!LIFF_ROOT_PATHS.has(url.pathname)) return false;
  const state = parseLiffState(url.searchParams.get("liff.state"));
  return Boolean(state.params.get("preflight") || state.pathname.includes("owner-preflight"));
}

function handlePreflightPageEntry(request, env) {
  const url = new URL(request.url);
  const liffId = cleanText(env.HIMAI_SUPPLIER_LIFF_ID || DEFAULT_LIFF_ID, 200);
  const state = parseLiffState(url.searchParams.get("liff.state"));
  const preflightToken = cleanText(
    url.searchParams.get("preflight") || state.params.get("preflight"),
    512,
  );
  const enteredThroughLiff = url.searchParams.get("_liff") === "1"
    || url.searchParams.has("liff.state");

  if (!enteredThroughLiff) {
    const target = new URL(`https://liff.line.me/${encodeURIComponent(liffId)}/owner-preflight`);
    if (preflightToken) target.searchParams.set("preflight", preflightToken);
    target.searchParams.set("_liff", "1");
    return redirect(target.toString());
  }

  return renderPreflightPage({ liffId });
}

async function runOwnerPreflight(request, env) {
  const body = await request.json().catch(() => null);
  const accessToken = cleanText(body?.access_token || body?.accessToken, 4096);
  const preflightToken = cleanText(body?.preflight_token || body?.preflightToken, 512);
  if (!accessToken) return json({ ok: false, error: "line_access_token_required" }, 401);
  if (!preflightToken) return json({ ok: false, error: "owner_preflight_token_required" }, 400);

  let lineProfile;
  try {
    lineProfile = await loadLineProfile(accessToken);
  } catch (_) {
    return json({ ok: false, error: "line_profile_failed" }, 401);
  }

  const run = await findPreflightRun(env, preflightToken);
  if (!run) return json({ ok: false, error: "owner_preflight_invalid_or_expired" }, 403);

  const supplierIds = linkedFieldIds(run.fields?.[PREFLIGHT_FIELDS.supplier]);
  if (supplierIds.length !== 1) {
    await recordPreflightFailure(env, run.id, "owner_preflight_supplier_scope_invalid");
    return json({ ok: false, error: "owner_preflight_supplier_scope_invalid" }, 409);
  }

  const supplier = await loadSupplierRecord(env, supplierIds[0]);
  if (!supplier || selectName(supplier.fields?.[SUPPLIER_FIELDS.status]).toLowerCase() !== "active") {
    await recordPreflightFailure(env, run.id, "owner_preflight_supplier_inactive");
    return json({ ok: false, error: "owner_preflight_supplier_inactive" }, 403);
  }

  const canonicalLineBefore = cleanText(supplier.fields?.[SUPPLIER_FIELDS.lineUserId], 255);
  const canonicalStatusBefore = selectName(supplier.fields?.[SUPPLIER_FIELDS.lineStatus]);
  const supplierName = cleanText(supplier.fields?.[SUPPLIER_FIELDS.name], 255) || "Supplier";

  let payload;
  try {
    payload = await buildScopedSupplierPayload(env, {
      supplierId: supplier.id,
      supplierName,
      runId: run.id,
    });
  } catch (error) {
    await recordPreflightFailure(env, run.id, "owner_preflight_snapshot_failed");
    throw error;
  }

  const now = new Date().toISOString();
  const expectedEndpoint = cleanEndpoint(env.HIMAI_SUPPLIER_LIFF_ENDPOINT || DEFAULT_LIFF_ENDPOINT);
  const receipt = {
    schema: "himai_supplier_owner_preflight_receipt_v1",
    preflight_id: cleanText(run.fields?.[PREFLIGHT_FIELDS.id], 160) || run.id,
    supplier_id: supplier.id,
    supplier_name: supplierName,
    owner_line_user_id_hash: await shortHash(lineProfile.userId),
    endpoint: expectedEndpoint,
    reservation_ttl_minutes: Number(payload?.reservation_policy?.ttl_minutes || 45),
    summary: {
      products: Number(payload?.summary?.products || 0),
      stock_units: Number(payload?.summary?.stock_units || 0),
      reserved_units: Number(payload?.summary?.reserved_units || 0),
      sold_units: Number(payload?.summary?.sold_units || 0),
      orders: Number(payload?.summary?.orders || 0),
      open_balance_thb: Number(payload?.summary?.open_balance_thb || 0),
    },
    product_ids: Array.isArray(payload?.products) ? payload.products.map((item) => item.id).filter(Boolean) : [],
    canonical_supplier_line_binding_untouched: true,
    canonical_line_user_id_before_hash: canonicalLineBefore ? await shortHash(canonicalLineBefore) : "",
    canonical_line_status_before: canonicalStatusBefore || "",
    completed_at: now,
  };

  await patchPreflightRecord(env, run.id, {
    [PREFLIGHT_FIELDS.status]: "dashboard_passed",
    [PREFLIGHT_FIELDS.inviteToken]: "",
    [PREFLIGHT_FIELDS.inviteExpiresAt]: null,
    [PREFLIGHT_FIELDS.ownerLineUserId]: lineProfile.userId,
    [PREFLIGHT_FIELDS.ownerLineName]: lineProfile.displayName || "",
    [PREFLIGHT_FIELDS.liffId]: cleanText(env.HIMAI_SUPPLIER_LIFF_ID || DEFAULT_LIFF_ID, 200),
    [PREFLIGHT_FIELDS.endpointExpected]: expectedEndpoint,
    [PREFLIGHT_FIELDS.endpointObserved]: expectedEndpoint,
    [PREFLIGHT_FIELDS.boundAt]: now,
    [PREFLIGHT_FIELDS.completedAt]: now,
    [PREFLIGHT_FIELDS.summaryReceipt]: JSON.stringify(receipt, null, 2),
    [PREFLIGHT_FIELDS.errorCode]: "",
    [PREFLIGHT_FIELDS.auditNote]: "Owner-only preflight passed. Supplier canonical LINE binding was not changed.",
  });

  return json({
    ...payload,
    preflight: {
      ok: true,
      owner_only: true,
      receipt_id: run.id,
      canonical_supplier_line_binding_untouched: true,
    },
  });
}

async function checkOrRepairLiffConfig(request, env) {
  const url = new URL(request.url);
  const body = request.method.toUpperCase() === "POST"
    ? await request.json().catch(() => null)
    : null;
  const preflightToken = cleanText(
    body?.preflight_token || body?.preflightToken || url.searchParams.get("preflight"),
    512,
  );
  const repair = body?.repair === true || url.searchParams.get("repair") === "1";
  if (!preflightToken) return json({ ok: false, error: "owner_preflight_token_required" }, 400);

  const run = await findPreflightRun(env, preflightToken);
  if (!run) return json({ ok: false, error: "owner_preflight_invalid_or_expired" }, 403);

  const liffId = cleanText(env.HIMAI_SUPPLIER_LIFF_ID || DEFAULT_LIFF_ID, 200);
  const expected = cleanEndpoint(env.HIMAI_SUPPLIER_LIFF_ENDPOINT || DEFAULT_LIFF_ENDPOINT);
  const channelToken = cleanText(
    env.LINE_LIFF_CHANNEL_ACCESS_TOKEN || env.LINE_CHANNEL_ACCESS_TOKEN,
    4096,
  );
  if (!channelToken) {
    await patchPreflightRecord(env, run.id, {
      [PREFLIGHT_FIELDS.status]: "endpoint_check_failed",
      [PREFLIGHT_FIELDS.liffId]: liffId,
      [PREFLIGHT_FIELDS.endpointExpected]: expected,
      [PREFLIGHT_FIELDS.errorCode]: "line_liff_channel_access_token_missing",
      [PREFLIGHT_FIELDS.auditNote]: "LIFF endpoint check could not run because no LINE Login channel access token is configured.",
    });
    return json({ ok: false, error: "line_liff_channel_access_token_missing", liff_id: liffId, expected }, 503);
  }

  let appsResponse = await lineLiffRequest(channelToken, "GET", "/liff/v1/apps");
  if (!appsResponse.ok) {
    const code = `line_liff_api_${appsResponse.status}`;
    await patchPreflightRecord(env, run.id, {
      [PREFLIGHT_FIELDS.status]: "endpoint_check_failed",
      [PREFLIGHT_FIELDS.liffId]: liffId,
      [PREFLIGHT_FIELDS.endpointExpected]: expected,
      [PREFLIGHT_FIELDS.errorCode]: code,
      [PREFLIGHT_FIELDS.auditNote]: "Existing LINE token cannot read LIFF app settings. A LINE Login channel access token is required.",
    });
    return json({ ok: false, error: code, liff_id: liffId, expected }, 502);
  }

  let app = findLiffApp(appsResponse.data, liffId);
  if (!app) {
    await patchPreflightRecord(env, run.id, {
      [PREFLIGHT_FIELDS.status]: "endpoint_check_failed",
      [PREFLIGHT_FIELDS.liffId]: liffId,
      [PREFLIGHT_FIELDS.endpointExpected]: expected,
      [PREFLIGHT_FIELDS.errorCode]: "line_liff_app_not_found",
      [PREFLIGHT_FIELDS.auditNote]: "The configured token can access LIFF API, but this LIFF app belongs to another LINE Login channel.",
    });
    return json({ ok: false, error: "line_liff_app_not_found", liff_id: liffId, expected }, 404);
  }

  let observed = cleanEndpoint(app?.view?.url || "");
  let repaired = false;

  if (repair && observed !== expected) {
    const updateResponse = await lineLiffRequest(channelToken, "PUT", `/liff/v1/apps/${encodeURIComponent(liffId)}`, {
      view: { url: expected },
    });
    if (!updateResponse.ok) {
      const code = `line_liff_update_${updateResponse.status}`;
      await patchPreflightRecord(env, run.id, {
        [PREFLIGHT_FIELDS.status]: "endpoint_check_failed",
        [PREFLIGHT_FIELDS.liffId]: liffId,
        [PREFLIGHT_FIELDS.endpointExpected]: expected,
        ...(observed ? { [PREFLIGHT_FIELDS.endpointObserved]: observed } : {}),
        [PREFLIGHT_FIELDS.errorCode]: code,
        [PREFLIGHT_FIELDS.auditNote]: "LIFF endpoint was detected but could not be updated automatically.",
      });
      return json({ ok: false, error: code, liff_id: liffId, expected, observed }, 502);
    }

    repaired = true;
    appsResponse = await lineLiffRequest(channelToken, "GET", "/liff/v1/apps");
    app = appsResponse.ok ? findLiffApp(appsResponse.data, liffId) : null;
    observed = cleanEndpoint(app?.view?.url || expected);
  }

  const matches = observed === expected;
  await patchPreflightRecord(env, run.id, {
    [PREFLIGHT_FIELDS.status]: matches ? "endpoint_check_passed" : "endpoint_check_failed",
    [PREFLIGHT_FIELDS.liffId]: liffId,
    [PREFLIGHT_FIELDS.endpointExpected]: expected,
    ...(observed ? { [PREFLIGHT_FIELDS.endpointObserved]: observed } : {}),
    [PREFLIGHT_FIELDS.errorCode]: matches ? "" : "line_liff_endpoint_mismatch",
    [PREFLIGHT_FIELDS.auditNote]: matches
      ? (repaired ? "LIFF endpoint was repaired and verified." : "LIFF endpoint matches production.")
      : "LIFF endpoint still points to a non-production host.",
  });

  return json({
    ok: matches,
    liff_id: liffId,
    expected,
    observed,
    repaired,
    token_source: env.LINE_LIFF_CHANNEL_ACCESS_TOKEN ? "line_login" : "existing_line_token",
  }, matches ? 200 : 409);
}

async function buildScopedSupplierPayload(env, { supplierId, supplierName, runId }) {
  const portalToken = `owner-preflight-${runId}`;
  const scopedEnv = {
    ...env,
    HIMAI_DISTRIBUTOR_PORTAL_TOKENS: JSON.stringify({
      [portalToken]: {
        active: true,
        supplier_name: supplierName,
        supplier_ids: [supplierId],
        role: "Owner Preflight",
        token_label: "owner-preflight",
      },
    }),
    HIMAI_SUPPLIER_PORTAL_TOKENS: "",
  };
  const response = await handleSupplierPortal(
    new Request(`https://internal.local/shop/api/supplier/portal?token=${encodeURIComponent(portalToken)}`),
    scopedEnv,
  );
  if (!response || !response.ok) throw new Error("owner_preflight_supplier_snapshot_failed");
  const payload = await response.json();
  if (!payload || payload.ok !== true) throw new Error("owner_preflight_supplier_snapshot_invalid");
  return payload;
}

async function findPreflightRun(env, token) {
  const records = await airtableListByFieldIds(
    env,
    env.HIMAI_SUPPLIER_PREFLIGHT_TABLE_ID || DEFAULT_PREFLIGHT_TABLE,
    Object.values(PREFLIGHT_FIELDS),
  );
  const now = Date.now();
  const matches = records.filter((record) => {
    const fields = record.fields || {};
    if (cleanText(fields[PREFLIGHT_FIELDS.inviteToken], 512) !== token) return false;
    const status = selectName(fields[PREFLIGHT_FIELDS.status]).toLowerCase();
    if (!["created", "endpoint_check_passed", "endpoint_check_failed"].includes(status)) return false;
    const expiresAt = Date.parse(cleanText(fields[PREFLIGHT_FIELDS.inviteExpiresAt], 120));
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
  return matches.length === 1 ? matches[0] : null;
}

async function loadSupplierRecord(env, supplierId) {
  const records = await airtableListByFieldIds(
    env,
    env.SHARED_SUPPLIERS_TABLE_ID || "tbl81bnFyASeXCj9x",
    Object.values(SUPPLIER_FIELDS),
  );
  return records.find((record) => record.id === supplierId) || null;
}

async function recordPreflightFailure(env, recordId, code) {
  await patchPreflightRecord(env, recordId, {
    [PREFLIGHT_FIELDS.status]: "endpoint_check_failed",
    [PREFLIGHT_FIELDS.errorCode]: cleanText(code, 160),
    [PREFLIGHT_FIELDS.auditNote]: "Owner-only preflight failed closed. Supplier canonical binding was not changed.",
  }).catch(() => null);
}

async function loadLineProfile(accessToken) {
  const response = await fetch("https://api.line.me/v2/profile", {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  const userId = cleanText(data?.userId, 255);
  if (!response.ok || !userId) throw new Error("line_profile_failed");
  return { userId, displayName: cleanText(data?.displayName, 255) };
}

async function lineLiffRequest(channelToken, method, path, body = null) {
  const response = await fetch(`https://api.line.me${path}`, {
    method,
    headers: {
      authorization: `Bearer ${channelToken}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function findLiffApp(data, liffId) {
  return (Array.isArray(data?.apps) ? data.apps : []).find((item) => cleanText(item?.liffId, 200) === liffId) || null;
}

async function airtableListByFieldIds(env, tableId, fieldIds) {
  const token = env.AIRTABLE_TOKEN || env.AIRTABLE_API_KEY;
  if (!token) throw new Error("Airtable token is not configured");
  const records = [];
  let offset = "";
  let pages = 0;
  do {
    const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const fieldId of fieldIds) url.searchParams.append("fields[]", fieldId);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Airtable error: ${response.status}`);
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = cleanText(data.offset, 300);
    pages += 1;
  } while (offset && pages < 20);
  return records;
}

async function patchPreflightRecord(env, recordId, fields) {
  const token = env.AIRTABLE_TOKEN || env.AIRTABLE_API_KEY;
  if (!token) throw new Error("Airtable token is not configured");
  const tableId = env.HIMAI_SUPPLIER_PREFLIGHT_TABLE_ID || DEFAULT_PREFLIGHT_TABLE;
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableId}/${recordId}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!response.ok) throw new Error(`Airtable error: ${response.status}`);
  return response.json();
}

function parseLiffState(rawValue) {
  let value = String(rawValue || "").trim();
  if (!value) return { pathname: "", params: new URLSearchParams() };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch (_) {
      break;
    }
  }
  try {
    const parsed = new URL(value, "https://liff.local/");
    return { pathname: parsed.pathname, params: parsed.searchParams };
  } catch (_) {
    return { pathname: "", params: new URLSearchParams(value.replace(/^\?/, "")) };
  }
}

function linkedFieldIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : item?.id || "").filter(Boolean);
}

function selectName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.name === "string") return value.name;
  return String(value);
}

function cleanText(value, max = 5000) {
  return String(value == null ? "" : value)
    .trim()
    .slice(0, max)
    .replace(/[\u0000-\u001F\u007F]/g, " ");
}

function cleanEndpoint(value) {
  const text = cleanText(value, 500);
  if (!text) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (_) {
    return "";
  }
}

async function shortHash(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function renderPreflightPage({ liffId }) {
  const html = PREFLIGHT_HTML
    .replaceAll("__LIFF_ID__", cleanText(liffId, 200))
    .replaceAll("__PREFLIGHT_API__", PREFLIGHT_API_PATH);
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "content-security-policy": [
        "default-src 'none'",
        "script-src 'unsafe-inline' https://static.line-scdn.net",
        "style-src 'unsafe-inline'",
        "connect-src 'self' https://api.line.me https://liff.line.me https://access.line.me",
        "frame-src https://access.line.me https://liff.line.me",
        "img-src 'self' data: https:",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    },
  });
}

const PREFLIGHT_HTML = String.raw`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f7f2e8">
<title>Himai Supplier Owner Preflight</title>
<style>
:root{--bg:#f7f2e8;--surface:#fffdf8;--ink:#2d261f;--muted:#766b61;--line:#ded4c4;--espresso:#493a30;--ok:#4f725b;--bad:#8a5b50;--shadow:0 14px 36px rgba(58,46,37,.08)}
*{box-sizing:border-box}html{background:var(--bg);-webkit-text-size-adjust:100%}body{margin:0;min-height:100vh;background:linear-gradient(180deg,#fcfaf5,var(--bg));color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans Thai",system-ui,sans-serif;-webkit-font-smoothing:antialiased}.shell{width:min(520px,100%);margin:0 auto;padding:max(18px,env(safe-area-inset-top)) 16px 40px}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0 18px}.brand{font:700 15px/1 Georgia,serif;letter-spacing:.12em;text-transform:uppercase}.pill{padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:rgba(255,253,248,.8);color:var(--muted);font-size:12px}.hero{padding:8px 0 18px}.kicker{margin:0 0 7px;color:#998878;font-size:11px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}.hero h1{margin:0;font:500 34px/1.1 Georgia,serif;letter-spacing:-.035em}.hero p{margin:10px 0 0;color:var(--muted)}.card{border:1px solid var(--line);border-radius:18px;background:rgba(255,253,248,.94);box-shadow:var(--shadow)}.state{padding:22px}.state h2{margin:0;font-size:21px}.state p{margin:8px 0 0;color:var(--muted)}.pulse{display:grid;gap:9px;margin-top:18px}.pulse i{display:block;height:11px;border-radius:999px;background:#eee6da}.pulse i:first-child{width:75%}.pulse i:last-child{width:48%}.hidden{display:none!important}.stack{display:grid;gap:14px}.notice{padding:13px 14px;color:var(--muted);font-size:13px;box-shadow:none}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px}.metric{padding:14px;min-height:102px}.metric span{color:var(--muted);font-size:12px}.metric b{display:block;margin-top:4px;font:600 27px/1.15 Georgia,serif;font-variant-numeric:tabular-nums}.section h2{margin:0 0 9px;font-size:16px}.products{display:grid;gap:9px}.product{padding:14px}.product h3{margin:0;font-size:16px}.sub{margin-top:3px;color:var(--muted);font-size:12px}.nums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:11px;padding:10px;border-radius:13px;background:#f5efe5}.nums span{display:block;color:var(--muted);font-size:10px}.nums b{display:block;margin-top:2px;font-size:16px}.pass{color:var(--ok)}.fail{color:var(--bad)}.footer{padding-top:20px;text-align:center;color:#9a8b7d;font-size:10px;letter-spacing:.12em;text-transform:uppercase}
</style>
</head>
<body>
<div class="shell">
  <header class="top"><div class="brand">Himai Shop</div><div id="status" class="pill">OWNER ONLY</div></header>
  <section class="hero"><p class="kicker">Private production preflight</p><h1>ทดสอบก่อนส่งให้นิน</h1><p>รอบนี้ผูกกับ LINE ของเจ้าของชั่วคราว และจะไม่เขียนทับสิทธิ์จริงของนิน</p></section>
  <section id="loading" class="card state"><h2>กำลังตรวจระบบจริง</h2><p>ตรวจ LINE, supplier scope, stock, reservation และ dashboard จาก production</p><div class="pulse"><i></i><i></i></div></section>
  <section id="failed" class="card state hidden"><h2>Preflight ยังไม่ผ่าน</h2><p id="failed-copy">ระบบหยุดไว้ก่อน โดยยังไม่แตะสิทธิ์ของนิน</p></section>
  <main id="app" class="stack hidden">
    <div class="card notice"><strong class="pass">ผ่าน Owner-only preflight</strong><br>Canonical LINE binding ของ Supplier ยังไม่ถูกเปลี่ยน</div>
    <section class="metrics"><article class="card metric"><span>พร้อมขาย</span><b id="available">—</b></article><article class="card metric"><span>กำลังจอง</span><b id="reserved">—</b></article><article class="card metric"><span>ขายแล้ว</span><b id="sold">—</b></article><article class="card metric"><span>ยอดค้างจ่าย</span><b id="payout">—</b></article></section>
    <section class="section"><h2 id="supplier">Supplier scope</h2><div id="products" class="products"></div></section>
    <div id="reservation" class="card notice">ระบบกันสินค้าให้ลูกค้า 45 นาที</div>
  </main>
  <div class="footer">Himai Supplier · Owner Preflight</div>
</div>
<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<script>
(function(){
  "use strict";
  var LIFF_ID="__LIFF_ID__",API="__PREFLIGHT_API__",RAW_SEARCH=location.search;
  var $=function(id){return document.getElementById(id)};
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function num(v){var n=Number(v);return Number.isFinite(n)?n:0}
  function count(v){return num(v).toLocaleString("th-TH",{maximumFractionDigits:0})}
  function money(v){return "฿"+num(v).toLocaleString("th-TH",{maximumFractionDigits:0})}
  function stateParams(){var q=new URLSearchParams(RAW_SEARCH),raw=q.get("liff.state")||"";for(var i=0;i<3;i++){try{var d=decodeURIComponent(raw);if(d===raw)break;raw=d}catch(_){break}}try{return new URL(raw,location.origin).searchParams}catch(_){return new URLSearchParams(raw.replace(/^\?/,""))}}
  function param(name){return new URLSearchParams(RAW_SEARCH).get(name)||stateParams().get(name)||""}
  function fail(message){$("loading").classList.add("hidden");$("app").classList.add("hidden");$("failed").classList.remove("hidden");$("failed-copy").textContent=message||"ระบบหยุดไว้ก่อน โดยยังไม่แตะสิทธิ์ของนิน";$("status").textContent="STOPPED";$("status").classList.add("fail")}
  function render(data){var s=data.summary||{},supplier=data.supplier||{},ttl=data.reservation_policy&&data.reservation_policy.ttl_minutes||45;$("available").textContent=count(s.stock_units);$("reserved").textContent=count(s.reserved_units);$("sold").textContent=count(s.sold_units);$("payout").textContent=money(s.open_balance_thb);$("supplier").textContent=(supplier.name||"Supplier")+" · "+count(s.products)+" รายการ";$("reservation").textContent="ระบบกันสินค้าให้ลูกค้า "+count(ttl)+" นาที";var rows=Array.isArray(data.products)?data.products:[];$("products").innerHTML=rows.map(function(p){return "<article class='card product'><h3>"+esc(p.product_name||"สินค้า")+"</h3><div class='sub'>"+esc(p.sku||"")+"</div><div class='nums'><div><span>พร้อมขาย</span><b>"+count(p.available)+"</b></div><div><span>กำลังจอง</span><b>"+count(p.reserved_total)+"</b></div><div><span>ขายแล้ว</span><b>"+count(p.sold_total)+"</b></div></div></article>"}).join("")||"<div class='card notice'>ยังไม่มีสินค้าใน scope นี้</div>";$("loading").classList.add("hidden");$("failed").classList.add("hidden");$("app").classList.remove("hidden");$("status").textContent="PASSED";$("status").classList.add("pass")}
  async function boot(){try{if(!window.liff||!LIFF_ID)throw new Error("liff_not_ready");await window.liff.init({liffId:LIFF_ID});if(!window.liff.isLoggedIn()){window.liff.login();return}var access=window.liff.getAccessToken(),preflight=param("preflight");if(!access)throw new Error("line_access_token_required");if(!preflight){fail("ไม่พบ Owner preflight token");return}var response=await fetch(API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({access_token:access,preflight_token:preflight})});var data=await response.json().catch(function(){return {}});if(!response.ok||data.ok!==true){fail(response.status===403?"Owner preflight link หมดอายุหรือถูกใช้แล้ว":"Owner preflight ยังไม่ผ่าน ระบบยังไม่แตะสิทธิ์ของนิน");return}render(data)}catch(error){console.error("Himai owner preflight",error);fail("Owner preflight ยังไม่ผ่าน ระบบยังไม่แตะสิทธิ์ของนิน")}}
  boot();
})();
</script>
</body>
</html>`;

export const OWNER_PREFLIGHT_INTERNALS = Object.freeze({
  parseLiffState,
  findLiffApp,
  cleanEndpoint,
});
