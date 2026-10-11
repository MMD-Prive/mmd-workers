// Owner-only, read-only dry-run endpoints for PREMIUM_GROUP_ELIGIBILITY_CLEANUP (#2141, phase 1).
//   GET /internal/admin/premium-group-cleanup/status
//   GET /internal/admin/premium-group-cleanup/preview
// Sends nothing, removes nothing, writes nothing. Telegram presence is NOT checked in this phase.
import { readCredentialBoundAdminActor } from "../credential-bound-admin-session.js";
import { clean } from "../hype-job-daily/util.js";
import { buildAudit, isDryRun, isEnabled } from "./audit.js";
import { makeTelegramLookup, readEntitlements } from "./sources.js";

export const PREMIUM_GROUP_CLEANUP_OWNER_BASE = "/internal/admin/premium-group-cleanup";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const ITEM_CAP = 100;

export function isPremiumGroupCleanupOwnerRequest(path) {
  const p = String(path || "").replace(/\/+$/g, "");
  return p === `${PREMIUM_GROUP_CLEANUP_OWNER_BASE}/status` || p === `${PREMIUM_GROUP_CLEANUP_OWNER_BASE}/preview`;
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export function buildStatus(env = {}) {
  return {
    ok: true,
    phase: "1_dry_run_audit",
    flag_enabled: isEnabled(env),
    dry_run: isDryRun(env),
    sends_nothing: true,
    removes_nothing: true,
    telegram_presence: "not_checked",
    read_only: true,
  };
}

export async function buildPreview(env = {}, now = Date.now(), deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const read = deps.readEntitlements || ((e) => readEntitlements(e, fetchImpl));
  const lookup = deps.lookupTelegram || makeTelegramLookup(env, fetchImpl);
  const { records, truncated } = await read(env);
  const audit = await buildAudit(records, { now, lookupTelegram: lookup });
  return {
    ok: true,
    flag_enabled: isEnabled(env),
    dry_run: true,
    sends_nothing: true,
    removes_nothing: true,
    telegram_presence: "not_checked",
    source_truncated: Boolean(truncated),
    counts: audit.counts,
    by_reason: audit.by_reason,
    items: audit.items.filter((i) => i.decision !== "ignored").slice(0, ITEM_CAP),
    items_truncated: audit.items.filter((i) => i.decision !== "ignored").length > ITEM_CAP,
  };
}

export async function handlePremiumGroupCleanupOwnerRequest(request, env = {}, deps = {}) {
  const path = new URL(request.url).pathname.replace(/\/+$/g, "");
  if (!isPremiumGroupCleanupOwnerRequest(path)) return json({ ok: false, error: "not_found" }, 404);
  if (String(request.method || "GET").toUpperCase() !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "GET" });

  const actor = await (deps.readActor || readCredentialBoundAdminActor)(request, env).catch(() => null);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  if (clean(actor.role, 40).toLowerCase() !== "owner") return json({ ok: false, error: "owner_only" }, 403);

  const action = path.slice(PREMIUM_GROUP_CLEANUP_OWNER_BASE.length + 1);
  const now = Number.isFinite(Number(deps.now)) ? Number(deps.now) : Date.now();
  try {
    if (action === "status") return json(buildStatus(env));
    return json(await buildPreview(env, now, deps));
  } catch (error) {
    return json({ ok: false, error: "premium_group_cleanup_failed", detail: clean(error?.message, 80) }, 500);
  }
}
