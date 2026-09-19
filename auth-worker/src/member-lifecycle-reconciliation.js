import { resolveMemberEntitlements } from "./member-entitlement-resolver.js";

const ENTITLEMENT_TABLE = "MMD — Member Entitlements";
const DEFAULT_MAX_MEMBERS = 500;

export async function runLifecycleReconciliation(env = {}, options = {}) {
  if (String(env.LIFECYCLE_RECONCILIATION_ENABLED || "true").toLowerCase() === "false") {
    return report({ disabled: true });
  }
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    throw new Error("lifecycle_airtable_not_configured");
  }
  if (typeof options.reconcileMember !== "function") {
    throw new TypeError("reconcileMember callback is required");
  }

  const now = parseNow(options.now);
  const rows = await airtableListAll(env, env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || ENTITLEMENT_TABLE);
  const groups = groupEntitlementsByMember(rows);
  const maxMembers = positiveInteger(env.LIFECYCLE_RECONCILIATION_MAX_MEMBERS, DEFAULT_MAX_MEMBERS);
  if (groups.length > maxMembers) {
    throw new Error(`lifecycle_member_limit_exceeded_${groups.length}_${maxMembers}`);
  }

  const results = [];
  for (const group of groups) {
    const snapshot = resolveMemberEntitlements(group.records, { now });
    const identity = {
      member_email: group.member_email,
      line_user_id: group.line_user_id,
      telegram_user_id: group.telegram_user_id,
    };

    if (!identity.member_email && !identity.telegram_user_id) {
      results.push({
        ok: false,
        skipped: true,
        reason: "no_downstream_identity",
        identity: safeIdentity(identity),
        lifecycle: lifecycleSummary(snapshot),
      });
      continue;
    }

    try {
      const outcome = await options.reconcileMember(identity, snapshot);
      results.push({
        ok: outcome?.ok === true,
        skipped: false,
        identity: safeIdentity(identity),
        lifecycle: lifecycleSummary(snapshot),
        http_status: Number(outcome?.http_status || outcome?.status || 0) || undefined,
        error: outcome?.ok === true ? undefined : safeText(outcome?.error || outcome?.payload?.error || "reconcile_failed"),
      });
    } catch (error) {
      results.push({
        ok: false,
        skipped: false,
        identity: safeIdentity(identity),
        lifecycle: lifecycleSummary(snapshot),
        error: safeText(error?.message || "reconcile_exception"),
      });
    }
  }

  return report({ results, total_records: rows.length, total_members: groups.length, evaluated_at: new Date(now).toISOString() });
}

export function groupEntitlementsByMember(records = []) {
  const groups = [];
  const byEmail = new Map();
  const byLine = new Map();
  const byTelegram = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const fields = record?.fields || {};
    const email = normalizeEmail(fields.member_email);
    const lineUserId = canonicalLineId(fields.line_user_id);
    const telegramUserId = canonicalTelegramUserId(fields.telegram_user_id);

    const matches = uniqueObjects([
      email ? byEmail.get(email) : null,
      lineUserId ? byLine.get(lineUserId) : null,
      telegramUserId ? byTelegram.get(telegramUserId) : null,
    ].filter(Boolean));

    let group = matches[0];
    if (!group) {
      group = { member_email: "", line_user_id: "", telegram_user_id: "", records: [] };
      groups.push(group);
    }

    if (matches.length > 1) {
      for (const other of matches.slice(1)) mergeGroups(groups, group, other, byEmail, byLine, byTelegram);
    }

    if (email) group.member_email = chooseStable(group.member_email, email, "email");
    if (lineUserId) group.line_user_id = chooseStable(group.line_user_id, lineUserId, "line_user_id");
    if (telegramUserId) group.telegram_user_id = chooseStable(group.telegram_user_id, telegramUserId, "telegram_user_id");
    group.records.push(record);

    if (group.member_email) byEmail.set(group.member_email, group);
    if (group.line_user_id) byLine.set(group.line_user_id, group);
    if (group.telegram_user_id) byTelegram.set(group.telegram_user_id, group);
  }

  return groups.filter((group) => group.records.length > 0);
}

function mergeGroups(groups, target, source, byEmail, byLine, byTelegram) {
  if (!source || source === target) return;
  target.member_email = chooseStable(target.member_email, source.member_email, "email");
  target.line_user_id = chooseStable(target.line_user_id, source.line_user_id, "line_user_id");
  target.telegram_user_id = chooseStable(target.telegram_user_id, source.telegram_user_id, "telegram_user_id");
  target.records.push(...source.records);
  const index = groups.indexOf(source);
  if (index >= 0) groups.splice(index, 1);
  for (const [key, value] of byEmail) if (value === source) byEmail.set(key, target);
  for (const [key, value] of byLine) if (value === source) byLine.set(key, target);
  for (const [key, value] of byTelegram) if (value === source) byTelegram.set(key, target);
}

function chooseStable(existing, incoming, field) {
  if (!existing) return incoming || "";
  if (!incoming || incoming === existing) return existing;
  throw new Error(`lifecycle_identity_conflict_${field}`);
}

async function airtableListAll(env, tableName) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const init = { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } };
    const response = env.AIRTABLE_HTTP?.fetch
      ? await env.AIRTABLE_HTTP.fetch(new Request(url.toString(), init))
      : await fetch(url.toString(), init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.records)) throw new Error(`lifecycle_airtable_${response.status || "malformed"}`);
    records.push(...data.records);
    offset = String(data.offset || "").trim();
  } while (offset);
  return records;
}

function lifecycleSummary(snapshot = {}) {
  return {
    active: [...(snapshot?.capability_state?.active || [])],
    expiring_soon: [...(snapshot?.capability_state?.expiring_soon || [])],
    grace: [...(snapshot?.capability_state?.grace || [])],
    inactive: [...(snapshot?.capability_state?.inactive || [])],
    member_blocked: snapshot?.member_blocked === true,
  };
}

function report(input = {}) {
  const results = Array.isArray(input.results) ? input.results : [];
  return {
    schema_version: "my_mmd_lifecycle_reconciliation_v1",
    authority: "my_mmd_entitlement_resolver_v1",
    disabled: input.disabled === true,
    evaluated_at: input.evaluated_at || new Date().toISOString(),
    total_records: Number(input.total_records || 0),
    total_members: Number(input.total_members || 0),
    reconciled: results.filter((item) => !item.skipped && item.ok).length,
    failed: results.filter((item) => !item.skipped && !item.ok).length,
    skipped: results.filter((item) => item.skipped).length,
    results,
  };
}

function safeIdentity(identity = {}) {
  return {
    member_email: normalizeEmail(identity.member_email),
    line_user_id: canonicalLineId(identity.line_user_id),
    telegram_user_id: canonicalTelegramUserId(identity.telegram_user_id),
  };
}
function canonicalLineId(value) { const id = String(value || "").trim(); return /^U[0-9a-f]{32}$/i.test(id) ? id : ""; }
function canonicalTelegramUserId(value) { const id = String(value || "").trim(); return /^\d{5,20}$/.test(id) ? id : ""; }
function normalizeEmail(value) { const email = String(value || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; }
function parseNow(value) { if (value === undefined || value === null || value === "") return Date.now(); const parsed = typeof value === "number" ? value : Date.parse(String(value)); if (!Number.isFinite(parsed)) throw new TypeError("now must be a valid timestamp"); return parsed; }
function positiveInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function safeText(value) { return String(value || "").replace(/[^a-zA-Z0-9_:\-. ]+/g, "_").slice(0, 160); }
function uniqueObjects(values) { return [...new Set(values)]; }
