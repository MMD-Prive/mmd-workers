import runtime from "./runtime-index.js";
import { resolveMemberEntitlements } from "./member-entitlement-resolver.js";
import { planDownstreamAccess } from "./member-downstream-access-reconciler.js";
import { runLifecycleReconciliation } from "./member-lifecycle-reconciliation.js";

const AUTH_ME_PATH = "/v1/auth/me";
const MEMBER_PROFILE_PATH = "/__internal/member-profile/read";
const ACCESS_RECONCILE_PATH = "/__internal/member-access/reconcile";
const LEGACY_DRIVE_BOOTSTRAP_PATH = "/__internal/member-drive/bootstrap";
const ENTITLEMENT_TABLE = "MMD — Member Entitlements";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === LEGACY_DRIVE_BOOTSTRAP_PATH && String(env.DRIVE_LEGACY_BOOTSTRAP_ENABLED || "").toLowerCase() !== "true") {
      return json({ ok: false, error: "legacy_drive_source_disabled", authority: "my_mmd_entitlement_resolver_v1" }, 410);
    }
    if (request.method === "POST" && url.pathname === ACCESS_RECONCILE_PATH) return handleAccessReconcile(request, env);

    const shouldEnrich = request.method === "GET" && url.pathname === AUTH_ME_PATH
      || request.method === "POST" && url.pathname === MEMBER_PROFILE_PATH;
    if (!shouldEnrich) return runtime.fetch(request, env, ctx);

    const identityRequest = request.clone();
    const response = await runtime.fetch(request, env, ctx);
    if (!response.ok) return response;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) return response;
    const payload = await response.clone().json().catch(() => null);
    if (!payload || typeof payload !== "object") return response;

    const identity = await resolveIdentity(url.pathname, identityRequest, payload);
    const entitlementSnapshot = await readEntitlementSnapshot(env, identity);
    if (url.pathname === AUTH_ME_PATH && payload.profile && typeof payload.profile === "object") payload.profile.entitlement_snapshot = entitlementSnapshot;
    if (url.pathname === MEMBER_PROFILE_PATH && payload.data && typeof payload.data === "object") {
      payload.data.entitlement_snapshot = entitlementSnapshot;
      if (payload.data.profile && typeof payload.data.profile === "object") payload.data.profile.entitlement_snapshot = entitlementSnapshot;
    }
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(JSON.stringify(payload), { status: response.status, headers });
  },

  async scheduled(controller, env, ctx) {
    const job = runLifecycleReconciliation(env, {
      now: Number(controller?.scheduledTime || Date.now()),
      reconcileMember: (identity) => reconcileLifecycleMember(env, identity),
    }).then((summary) => {
      console.log({
        event: "my_mmd_lifecycle_reconciliation_complete",
        authority: summary.authority,
        evaluated_at: summary.evaluated_at,
        total_members: summary.total_members,
        reconciled: summary.reconciled,
        failed: summary.failed,
        skipped: summary.skipped,
      });
      if (summary.failed > 0) throw new Error(`lifecycle_reconciliation_failed_${summary.failed}`);
      return summary;
    }).catch((error) => {
      console.error({ event: "my_mmd_lifecycle_reconciliation_failed", failure_class: safeFailure(error) });
      throw error;
    });
    ctx.waitUntil(job);
  },
};

async function reconcileLifecycleMember(env, identity) {
  const secret = String(env.AUTH_RECONCILE_SECRET || "").trim();
  if (!secret) return { ok: false, error: "auth_reconcile_secret_missing" };
  const response = await handleAccessReconcile(new Request("https://mmd-auth-worker.internal/__internal/member-access/reconcile", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-access-reconcile-secret": secret,
    },
    body: JSON.stringify(identity),
  }), env);
  const payload = await response.clone().json().catch(() => null);
  return {
    ok: response.ok && payload?.ok === true,
    http_status: response.status,
    payload,
    error: payload?.error || "",
  };
}

async function handleAccessReconcile(request, env) {
  if (!internalAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const body = await request.json().catch(() => null);
  const identity = { email: normalizeEmail(body?.member_email), line_user_id: canonicalLineId(body?.line_user_id) };
  if (!identity.email && !identity.line_user_id) return json({ ok: false, error: "canonical_identity_required" }, 400);

  const snapshot = await readEntitlementSnapshot(env, identity);
  if (snapshot.source_status !== "verified") return json({ ok: false, error: "entitlement_snapshot_unavailable", entitlement_snapshot: snapshot }, 503);

  const telegramUserId = String(body?.telegram_user_id || "").trim();
  const current = { drive_layers: [], telegram_rooms: [] };
  const observations = {};

  if (identity.email) {
    observations.drive = await downstream(env.DRIVE_ACCESS_RECONCILER, "https://member-pages-worker.internal/__internal/member-drive/reconcile", env.AUTH_SERVICE_AUTH_TO_MEMBER_PAGES, { mode: "inspect", member_email: identity.email });
    if (observations.drive.ok) current.drive_layers = observations.drive.payload?.drive_layers || [];
    else return json({ ok: false, error: "drive_observation_failed", observations }, 503);
  }

  if (/^\d{5,20}$/.test(telegramUserId)) {
    observations.telegram = await downstream(env.TELEGRAM_ACCESS_RECONCILER, "https://telegram-worker.internal/telegram/internal/access/reconcile", env.AUTH_SERVICE_AUTH_TO_TELEGRAM, { mode: "inspect", telegram_user_id: telegramUserId });
    if (observations.telegram.ok) current.telegram_rooms = observations.telegram.payload?.telegram_rooms || [];
    else return json({ ok: false, error: "telegram_observation_failed", observations }, 503);
  }

  const plan = planDownstreamAccess(snapshot, current);
  const applied = {};
  if (identity.email) applied.drive = await downstream(env.DRIVE_ACCESS_RECONCILER, "https://member-pages-worker.internal/__internal/member-drive/reconcile", env.AUTH_SERVICE_AUTH_TO_MEMBER_PAGES, { member_email: identity.email, actions: plan.drive });
  if (/^\d{5,20}$/.test(telegramUserId)) applied.telegram = await downstream(env.TELEGRAM_ACCESS_RECONCILER, "https://telegram-worker.internal/telegram/internal/access/reconcile", env.AUTH_SERVICE_AUTH_TO_TELEGRAM, { telegram_user_id: telegramUserId, actions: plan.telegram });

  const appliedItems = Object.values(applied);
  if (!appliedItems.length) return json({ ok: false, error: "no_actionable_downstream_identity", entitlement_snapshot: snapshot, reconciliation_plan: plan, observations, applied }, 409);
  const ok = appliedItems.every((item) => item?.ok === true);
  return json({ ok, authority: "my_mmd_entitlement_resolver_v1", entitlement_snapshot: snapshot, reconciliation_plan: plan, observations, applied }, ok ? 200 : 409);
}

async function downstream(binding, url, secret, body) {
  if (!binding?.fetch || !String(secret || "").trim()) return { ok: false, error: "downstream_binding_unavailable" };
  try {
    const response = await binding.fetch(new Request(url, { method: "POST", headers: { "content-type": "application/json", "x-mmd-auth-reconcile-secret": String(secret) }, body: JSON.stringify(body) }));
    const payload = await response.json().catch(() => null);
    return { ok: response.ok && payload?.ok === true, http_status: response.status, payload };
  } catch { return { ok: false, error: "downstream_unavailable" }; }
}

async function resolveIdentity(path, request, payload) {
  if (path === AUTH_ME_PATH) return { email: normalizeEmail(payload?.profile?.email), line_user_id: "" };
  const body = await request.json().catch(() => null);
  return { email: "", line_user_id: canonicalLineId(body?.line_user_id) };
}

async function readEntitlementSnapshot(env, identity = {}) {
  const empty = () => ({ ...resolveMemberEntitlements([]), source_status: "unavailable" });
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return empty();
  const clauses = [];
  const email = normalizeEmail(identity.email);
  const lineUserId = canonicalLineId(identity.line_user_id);
  if (email) clauses.push(`LOWER({${env.AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD || "member_email"}})=${formulaString(email)}`);
  if (lineUserId) clauses.push(`{${env.AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD || "line_user_id"}}=${formulaString(lineUserId)}`);
  if (!clauses.length) return empty();
  try {
    const records = await airtableList(env, env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || ENTITLEMENT_TABLE, { filterByFormula: clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`, maxRecords: 100 });
    const adapted = records.map((record) => ({ ...record, fields: { ...(record?.fields || {}), member_status: record?.fields?.member_lifecycle_status || record?.fields?.member_status || "" } }));
    return { ...resolveMemberEntitlements(adapted), source_status: "verified" };
  } catch (error) {
    console.warn({ event: "my_mmd_entitlement_snapshot_unavailable", failure_class: safeFailure(error) });
    return empty();
  }
}

async function airtableList(env, tableName, params = {}) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const init = { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } };
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(new Request(url.toString(), init)) : await fetch(url.toString(), init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.records)) throw new Error(`airtable_${response.status || "malformed"}`);
  return data.records;
}

function internalAuthorized(request, env) {
  const expected = String(env.AUTH_RECONCILE_SECRET || "").trim();
  const actual = String(request.headers.get("x-mmd-access-reconcile-secret") || "").trim();
  return Boolean(expected && actual && timingSafeEqual(expected, actual));
}
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
function canonicalLineId(value) { const id = String(value || "").trim(); return /^U[0-9a-f]{32}$/i.test(id) ? id : ""; }
function normalizeEmail(value) { const email = String(value || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; }
function formulaString(value) { return `'${String(value || "").replace(/'/g, "\\'")}'`; }
function safeFailure(error) { return String(error?.message || "unknown").toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 80) || "unknown"; }
function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
