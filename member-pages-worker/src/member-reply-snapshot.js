import { handleKenjiLineMemberTruth } from "./kenji-line-member-truth.js";

const AUTHORITY = "my_mmd_entitlement_resolver_v1";
const POINTS_AUTHORITY = "canonical_paid_points_source_guard_v1";
const HOST = "member-pages-worker.internal";
const READ_PATH = "/__internal/kenji/member-reply-snapshot";
const REFRESH_PATH = "/__internal/kenji/member-reply-snapshot/refresh";
const LINE_ID = /^U[0-9a-f]{32}$/i;
const MEMBER_ID = /^[A-Za-z0-9_:-]{3,100}$/;
const STALE_MS = 30 * 60 * 60 * 1000;
const MAX_DAILY_LINES = 1000;
const DAILY_REASON = "daily_0402_bkk";
const LEGACY_DAILY_REASON = "daily_0600_bkk";
const DAILY_REASONS = new Set([DAILY_REASON, LEGACY_DAILY_REASON]);
const MEMBERS = "tblgWc5VRon5o8Mhk";
const ENTITLEMENTS = "tblNImdF9PKAxhXGi";
const RETRY_DELAY_MS = 5 * 60 * 1000;
const DAILY_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;

const clean = value => value == null ? "" : String(value).trim();
const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

function authorized(request, path, caller) {
  if (!(request instanceof Request) || request.method !== "POST") return false;
  const url = new URL(request.url);
  return url.hostname === HOST && url.pathname === path &&
    request.headers.get("x-mmd-internal-call") === "true" &&
    request.headers.get("x-mmd-service-binding") === caller;
}

export function isMemberReplySnapshotPath(request) {
  if (!(request instanceof Request)) return false;
  const path = new URL(request.url).pathname;
  return path === READ_PATH || path === REFRESH_PATH;
}

export async function lineKey(lineUserId) {
  if (!LINE_ID.test(clean(lineUserId))) return "";
  const bytes = new TextEncoder().encode(clean(lineUserId));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
}

function formula(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function airtablePage(env, table, filter = "", offset = "") {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw Error("airtable_unavailable");
  const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table}`);
  url.searchParams.set("pageSize", "100");
  if (filter) url.searchParams.set("filterByFormula", filter);
  if (offset) url.searchParams.set("offset", offset);
  const request = new Request(url, {
    headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
    signal: AbortSignal.timeout(8000),
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  if (!response.ok) throw Error("airtable_unavailable");
  const body = await response.json();
  if (!Array.isArray(body?.records)) throw Error("airtable_unavailable");
  return body;
}

async function recordsFor(env, table, filter, max = 3) {
  const page = await airtablePage(env, table, filter);
  if (page.offset || page.records.length > max) throw Error("identity_ambiguous");
  return page.records;
}

async function lineForMember(env, memberId) {
  if (!MEMBER_ID.test(memberId)) return "";
  const [entitlements, members] = await Promise.all([
    recordsFor(env, ENTITLEMENTS, `{member_id}=${formula(memberId)}`),
    recordsFor(env, MEMBERS, `{member_id}=${formula(memberId)}`),
  ]);
  const ids = [...entitlements.map(row => row.fields?.line_user_id), ...members.map(row => row.fields?.line_id)]
    .map(clean).filter(id => LINE_ID.test(id));
  const unique = [...new Set(ids)];
  return unique.length === 1 ? unique[0] : "";
}

async function canonicalTruth(env, lineUserId, intent) {
  const response = await handleKenjiLineMemberTruth(new Request(`https://${HOST}/__internal/kenji/member-truth`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" },
    body: JSON.stringify({ line_user_id: lineUserId, intent }),
  }), env);
  return response.ok ? response.json().catch(() => null) : null;
}

const resolved = value => value?.ok === true && value.authority === AUTHORITY && value.identity_status === "resolved";
const membershipKey = value => JSON.stringify([value?.membership?.level, value?.membership?.lifecycle, value?.membership?.expire_at]);

export function projectMemberReplySnapshot(membershipTruth, pointsTruth, now = new Date().toISOString()) {
  const membershipReady = resolved(membershipTruth);
  const pointsReady = resolved(pointsTruth);
  const conflict = membershipReady && pointsReady && membershipKey(membershipTruth) !== membershipKey(pointsTruth);
  const source = membershipReady ? membershipTruth : pointsReady ? pointsTruth : null;
  const membership = source?.membership || {};
  const verifiedPoints = !conflict && pointsReady && pointsTruth.points?.authority === POINTS_AUTHORITY &&
    pointsTruth.points.status === "verified" && Number.isSafeInteger(pointsTruth.points.active_points) && pointsTruth.points.active_points >= 0;
  return {
    membership_status: source ? "verified" : "unavailable",
    membership_level: source ? clean(membership.level).slice(0, 40) : "none",
    membership_label: source ? clean(membership.label).slice(0, 40) : "",
    membership_lifecycle: source ? clean(membership.lifecycle).slice(0, 40) : "unknown",
    membership_expire_at: source ? clean(membership.expire_at).slice(0, 40) : "",
    membership_verified_at: source ? now : null,
    points_status: verifiedPoints ? "verified" : "unavailable",
    points_balance: verifiedPoints ? pointsTruth.points.active_points : null,
    points_verified_at: verifiedPoints ? now : null,
    points_valid_until: verifiedPoints ? clean(pointsTruth.points.valid_until) || null : null,
    source_authority: AUTHORITY,
    refreshed_at: now,
  };
}

// Keep queue diagnostics categorical and identifier-free. These values are
// operator evidence only; they never authorize a balance or entitlement write.
export function classifySnapshotRefreshFailure(membershipTruth, pointsTruth) {
  const membershipReady = resolved(membershipTruth);
  const pointsReady = resolved(pointsTruth);
  if (!membershipReady && !pointsReady) return "canonical_membership_and_points_unavailable";
  if (!membershipReady) return "canonical_membership_unavailable";
  if (!pointsReady) return "canonical_points_unavailable";
  if (membershipKey(membershipTruth) !== membershipKey(pointsTruth)) return "canonical_membership_conflict";
  if (pointsTruth?.points?.authority !== POINTS_AUTHORITY || pointsTruth?.points?.status !== "verified") {
    return "canonical_points_unverified";
  }
  if (!Number.isSafeInteger(pointsTruth?.points?.active_points) || pointsTruth.points.active_points < 0) {
    return "canonical_points_invalid";
  }
  return null;
}

export function snapshotRetryAt(attempts, now = new Date(), reason = "event") {
  const base = now instanceof Date ? now.getTime() : Date.parse(now);
  // The daily reason changes scope, not retry semantics. A cron invocation
  // still gets bounded short retries; after three failed attempts it waits for
  // the next daily rebuild window. The timestamp itself is not an executor.
  const delay = Number(attempts || 0) < 3 ? RETRY_DELAY_MS : DAILY_RETRY_DELAY_MS;
  return new Date(base + delay).toISOString();
}

export function snapshotDrainAllowlist(env = {}) {
  return clean(env.MEMBER_REPLY_SNAPSHOT_DRAIN_ALLOWLIST)
    .split(",").map(value => value.trim()).filter(Boolean);
}

async function queueRefresh(env, lineUserId, reason = "event") {
  const key = await lineKey(lineUserId);
  if (!key || !env.MEMBER_REPLY_DB) return false;
  const now = new Date().toISOString();
  await env.MEMBER_REPLY_DB.prepare(`INSERT INTO member_reply_refresh_queue
    (line_key,line_user_id,generation,reason,requested_at,next_attempt_at)
    VALUES (?,?,1,?,?,?) ON CONFLICT(line_key) DO UPDATE SET
    generation=generation+1,
    reason=CASE WHEN excluded.reason='${DAILY_REASON}' AND member_reply_refresh_queue.reason NOT IN ('${DAILY_REASON}','${LEGACY_DAILY_REASON}')
      THEN member_reply_refresh_queue.reason ELSE excluded.reason END,
    requested_at=excluded.requested_at,
    next_attempt_at=excluded.next_attempt_at,attempts=0,
    last_error_code=NULL,last_error_at=NULL`)
    .bind(key, lineUserId, clean(reason).slice(0,40), now, now).run();
  return env.MEMBER_REPLY_DB.prepare(`SELECT line_key,line_user_id,generation,attempts
    FROM member_reply_refresh_queue WHERE line_key=?`).bind(key).first();
}

async function refreshOne(env, item) {
  const now = new Date().toISOString();
  const [membership, points] = await Promise.all([
    canonicalTruth(env, item.line_user_id, "membership_status").catch(() => null),
    canonicalTruth(env, item.line_user_id, "points_status").catch(() => null),
  ]);
  const snapshot = projectMemberReplySnapshot(membership, points, now);
  const failureClass = classifySnapshotRefreshFailure(membership, points);
  if (snapshot.points_status !== "verified") {
    console.warn({ event: "member_reply_points_unavailable",
      member_truth: resolved(membership) ? "resolved" : "unavailable",
      points_truth: resolved(points) ? "resolved" : "unavailable",
      ledger_status: points?.points?.status === "verified" ? "verified" : "unavailable",
      membership_match: resolved(membership) && resolved(points)
        ? membershipKey(membership) === membershipKey(points) : null });
  }
  await env.MEMBER_REPLY_DB.prepare(`INSERT INTO member_reply_snapshots
    (line_key,membership_status,membership_level,membership_label,membership_lifecycle,membership_expire_at,
      membership_verified_at,points_status,points_balance,points_verified_at,points_valid_until,source_authority,refreshed_at,refresh_generation)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(line_key) DO UPDATE SET
      membership_status=excluded.membership_status,membership_level=excluded.membership_level,
      membership_label=excluded.membership_label,membership_lifecycle=excluded.membership_lifecycle,
      membership_expire_at=excluded.membership_expire_at,membership_verified_at=excluded.membership_verified_at,
      points_status=excluded.points_status,points_balance=excluded.points_balance,
      points_verified_at=excluded.points_verified_at,points_valid_until=excluded.points_valid_until,
      source_authority=excluded.source_authority,
      refreshed_at=excluded.refreshed_at,refresh_generation=excluded.refresh_generation
    WHERE excluded.refresh_generation>=member_reply_snapshots.refresh_generation`)
    .bind(item.line_key, snapshot.membership_status, snapshot.membership_level, snapshot.membership_label,
      snapshot.membership_lifecycle, snapshot.membership_expire_at, snapshot.membership_verified_at,
      snapshot.points_status, snapshot.points_balance, snapshot.points_verified_at, snapshot.points_valid_until,
      snapshot.source_authority, snapshot.refreshed_at, item.generation).run();
  if (snapshot.membership_status === "verified" && snapshot.points_status === "verified") {
    await env.MEMBER_REPLY_DB.prepare("DELETE FROM member_reply_refresh_queue WHERE line_key=? AND generation=?")
      .bind(item.line_key, item.generation).run();
  } else {
    const attempts = Number(item.attempts || 0) + 1;
    const next = snapshotRetryAt(attempts, new Date(), item.reason);
    await env.MEMBER_REPLY_DB.prepare(`UPDATE member_reply_refresh_queue SET attempts=?,next_attempt_at=?,
      last_error_code=?,last_error_at=? WHERE line_key=? AND generation=?`)
      .bind(attempts, next, failureClass || "snapshot_unavailable", now, item.line_key, item.generation).run();
  }
}

export async function drainMemberReplyRefreshes(env, limit = 24) {
  if (!env.MEMBER_REPLY_DB) return { ok: false, reason: "db_unavailable" };
  const allowlist = snapshotDrainAllowlist(env);
  const { results = [] } = await env.MEMBER_REPLY_DB.prepare(`SELECT line_key,line_user_id,generation,attempts
    FROM member_reply_refresh_queue WHERE next_attempt_at<=? ORDER BY requested_at LIMIT ?`)
    .bind(new Date().toISOString(), Math.min(50, Math.max(1, limit))).all();
  const boundedResults = allowlist.length
    ? results.filter(item => allowlist.includes(item.line_key))
    : results;
  let failed = 0;
  for (let index = 0; index < boundedResults.length; index += 2) {
    const settled = await Promise.allSettled(boundedResults.slice(index, index + 2).map(item => refreshOne(env, item)));
    for (let offset = 0; offset < settled.length; offset += 1) {
      const result = settled[offset];
      if (result.status === "fulfilled") continue;
      failed += 1;
      const item = boundedResults[index + offset];
      const attempts = Number(item.attempts || 0) + 1;
      await env.MEMBER_REPLY_DB.prepare(`UPDATE member_reply_refresh_queue SET attempts=?,next_attempt_at=?,
        last_error_code=?,last_error_at=? WHERE line_key=? AND generation=?`)
        .bind(attempts, snapshotRetryAt(attempts, new Date(), item.reason), "refresh_write_failed", new Date().toISOString(), item.line_key, item.generation)
        .run().catch(() => null);
    }
  }
  return { ok: failed === 0, processed: boundedResults.length - failed, skipped: results.length - boundedResults.length, failed };
}

async function allLinkedLines(env) {
  const lines = new Set();
  for (const [table, field] of [[ENTITLEMENTS, "line_user_id"], [MEMBERS, "line_id"]]) {
    let offset = "";
    do {
      const page = await airtablePage(env, table, "", offset);
      for (const row of page.records) {
        const id = clean(row.fields?.[field]);
        if (LINE_ID.test(id)) lines.add(id);
      }
      if (lines.size > MAX_DAILY_LINES) throw Error("daily_scope_too_large");
      offset = clean(page.offset);
    } while (offset);
  }
  return [...lines];
}

export function memberReplyMorningWindowReady(now = new Date()) {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60_000);
  return bangkok.getUTCHours() > 4 ||
    (bangkok.getUTCHours() === 4 && bangkok.getUTCMinutes() >= 2);
}

export async function scheduleMemberReplySnapshots(env, now = new Date()) {
  if (!env.MEMBER_REPLY_DB) return { ok: false, reason: "db_unavailable" };
  const bangkok = new Date(now.getTime() + 7 * 60 * 60_000);
  const date = bangkok.toISOString().slice(0, 10);
  if (memberReplyMorningWindowReady(now)) {
    const done = await env.MEMBER_REPLY_DB.prepare("SELECT bangkok_date FROM member_reply_daily_rebuilds WHERE bangkok_date=?").bind(date).first();
    if (!done) {
      const lines = await allLinkedLines(env);
      for (const id of lines) await queueRefresh(env, id, DAILY_REASON);
      await env.MEMBER_REPLY_DB.prepare("INSERT OR IGNORE INTO member_reply_daily_rebuilds (bangkok_date,queued_at,line_count) VALUES (?,?,?)")
        .bind(date, now.toISOString(), lines.length).run();
    }
  }
  return drainMemberReplyRefreshes(env);
}

export function snapshotProjection(row, pending, now = Date.now()) {
  const age = row ? now - Date.parse(row.refreshed_at) : NaN;
  const recent = row && Number.isFinite(age) && age >= 0 && age <= STALE_MS;
  const current = recent && (!pending || row.refresh_generation >= pending.generation ||
    DAILY_REASONS.has(pending.reason));
  if (!current || row.source_authority !== AUTHORITY) return null;
  const expiryDate = /^\d{4}-\d{2}-\d{2}/.test(row.membership_expire_at || "")
    ? Date.parse(`${row.membership_expire_at.slice(0, 10)}T00:00:00+07:00`) : NaN;
  const activeExpired = ["active", "expiring_soon"].includes(row.membership_lifecycle) &&
    Number.isFinite(expiryDate) && now >= expiryDate;
  const membershipVerified = row.membership_status === "verified" && !activeExpired;
  const pointsExpired = row.points_valid_until && Number.isFinite(Date.parse(row.points_valid_until)) &&
    now >= Date.parse(row.points_valid_until);
  const pointsVerified = !pointsExpired && row.points_status === "verified" &&
    Number.isSafeInteger(row.points_balance) && row.points_balance >= 0;
  if (!membershipVerified) return null;
  return {
    ok: true, authority: AUTHORITY, identity_status: "resolved",
    membership: { level: row.membership_level, label: row.membership_label,
      lifecycle: row.membership_lifecycle, expire_at: row.membership_expire_at },
    points: { status: pointsVerified ? "verified" : "unavailable",
      active_points: pointsVerified ? row.points_balance : null },
    snapshot_at: row.refreshed_at,
  };
}

export async function handleMemberReplySnapshot(request, env = {}, ctx = null) {
  const path = new URL(request.url).pathname;
  const read = path === READ_PATH;
  const callers = read ? ["member-dashboard-chat-worker"] : ["payments-worker", "admin-worker"];
  if (!callers.some(caller => authorized(request, path, caller))) return json({ ok: false, error: "not_found" }, 404);
  if (!env.MEMBER_REPLY_DB) return json({ ok: false, error: "snapshot_unavailable" }, 503);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_request" }, 400);
  let lineUserId = clean(body.line_user_id);
  if (!read && !lineUserId && MEMBER_ID.test(clean(body.member_id))) {
    lineUserId = await lineForMember(env, clean(body.member_id)).catch(() => "");
  }
  const key = await lineKey(lineUserId);
  if (!key) return json({ ok: false, error: "identity_unresolved" }, 404);
  if (!read) {
    const item = await queueRefresh(env, lineUserId, body.reason);
    if (!item) return json({ ok: false, error: "snapshot_unavailable" }, 503);
    const work = refreshOne(env, item).catch(() => null);
    if (ctx?.waitUntil) ctx.waitUntil(work); else await work;
    return json({ ok: true, queued: true }, 202);
  }
  const [row, pending] = await Promise.all([
    env.MEMBER_REPLY_DB.prepare("SELECT * FROM member_reply_snapshots WHERE line_key=?").bind(key).first(),
    env.MEMBER_REPLY_DB.prepare("SELECT generation,reason FROM member_reply_refresh_queue WHERE line_key=?").bind(key).first(),
  ]);
  const projection = snapshotProjection(row, pending);
  if (!projection && !pending && ctx?.waitUntil) {
    ctx.waitUntil(queueRefresh(env, lineUserId, "line_read_miss")
      .then(item => item && refreshOne(env, item)).catch(() => null));
  }
  return projection ? json(projection) : json({ ok: false, status: "unavailable", authority: AUTHORITY }, 503);
}
