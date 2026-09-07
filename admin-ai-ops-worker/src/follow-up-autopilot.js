export const FOLLOW_UP_STATE_PATH = "/v1/admin/ai-ops/follow-ups";
export const FOLLOW_UP_SYNC_PATH = "/v1/admin/ai-ops/follow-ups/sync";
export const FOLLOW_UP_ACTION_PATH = "/v1/admin/ai-ops/follow-ups/action";

const INTERNAL_STATE_PATH = "/__internal/follow-ups/state";
const INTERNAL_SYNC_PATH = "/__internal/follow-ups/sync";
const INTERNAL_ACTION_PATH = "/__internal/follow-ups/action";
const STATE_KEY = "mmd_follow_up_autopilot_v1";
const MAX_AUDIT = 300;
const MAX_WATCHES = 180;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const FOLLOW_UP_THRESHOLDS = Object.freeze({
  payment_waiting_ms: 2 * HOUR,
  job_confirmation_ms: 4 * HOUR,
  membership_renewal_window_ms: 14 * DAY,
});

export class FollowUpAutopilot {
  constructor(state, env) {
    this.state = state;
    this.env = env || {};
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (path === INTERNAL_STATE_PATH && method === "GET") {
      const state = await this.#load();
      return json(snapshot(state, this.env));
    }

    if (path === INTERNAL_SYNC_PATH && method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !Array.isArray(body.candidates)) return json({ ok: false, error: "candidates_required" }, 400);
      const now = validIso(body.checked_at) || new Date().toISOString();
      const state = await this.#load();
      applyCandidateSync(state, body.candidates, now);
      await this.#notifyDue(state, now);
      await this.#saveAndSchedule(state, now);
      return json(snapshot(state, this.env));
    }

    if (path === INTERNAL_ACTION_PATH && method === "POST") {
      const body = await request.json().catch(() => null);
      const id = stringValue(body?.id, 240);
      const action = stringValue(body?.action, 40).toLowerCase();
      if (!id || !["snooze", "close", "reopen"].includes(action)) {
        return json({ ok: false, error: "invalid_action" }, 400);
      }
      const now = new Date().toISOString();
      const state = await this.#load();
      const watch = state.watches[id];
      if (!watch) return json({ ok: false, error: "watch_not_found" }, 404);

      if (action === "snooze") {
        const requested = Number(body?.snooze_minutes || 60);
        const minutes = Math.min(7 * 24 * 60, Math.max(15, Number.isFinite(requested) ? requested : 60));
        watch.state = "snoozed";
        watch.snoozed_until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        watch.updated_at = now;
        appendAudit(state, { type: "snoozed", watch_id: id, at: now, detail: `${minutes}m` });
      } else if (action === "close") {
        watch.state = "closed";
        watch.closed_at = now;
        watch.snoozed_until = null;
        watch.updated_at = now;
        appendAudit(state, { type: "closed", watch_id: id, at: now });
      } else if (action === "reopen") {
        watch.closed_at = null;
        watch.snoozed_until = null;
        watch.state = isDue(watch, now) ? "due" : "watching";
        watch.updated_at = now;
        appendAudit(state, { type: "reopened", watch_id: id, at: now });
      }

      await this.#notifyDue(state, now);
      await this.#saveAndSchedule(state, now);
      return json(snapshot(state, this.env));
    }

    return json({ ok: false, error: "not_found" }, 404);
  }

  async alarm() {
    const now = new Date().toISOString();
    const state = await this.#load();
    for (const watch of Object.values(state.watches)) {
      if (watch.state === "snoozed" && watch.snoozed_until && Date.parse(watch.snoozed_until) <= Date.parse(now)) {
        watch.snoozed_until = null;
        watch.state = isDue(watch, now) ? "due" : "watching";
        watch.updated_at = now;
        appendAudit(state, { type: "snooze_expired", watch_id: watch.id, at: now });
      }
      if (watch.state === "watching" && isDue(watch, now)) {
        watch.state = "due";
        watch.updated_at = now;
        appendAudit(state, { type: "due", watch_id: watch.id, at: now });
      }
    }
    await this.#notifyDue(state, now);
    await this.#saveAndSchedule(state, now);
  }

  async #load() {
    const saved = await this.state.storage.get(STATE_KEY);
    return saved && typeof saved === "object" ? saved : freshState();
  }

  async #saveAndSchedule(state, now) {
    state.updated_at = now;
    trimState(state);
    await this.state.storage.put(STATE_KEY, state);
    const next = nextAlarmAt(state, now);
    if (next) await this.state.storage.setAlarm(next);
    else if (typeof this.state.storage.deleteAlarm === "function") await this.state.storage.deleteAlarm();
  }

  async #notifyDue(state, now) {
    const due = Object.values(state.watches)
      .filter((watch) => watch.state === "due" && watch.closed_at == null)
      .filter((watch) => watch.notification_for_due_at !== watch.due_at)
      .slice(0, 12);

    for (const watch of due) {
      const result = await notifyPer(watch, this.env);
      watch.last_notification_attempt_at = now;
      watch.notification_status = result.ok ? "delivered" : (result.skipped ? "command_center_only" : "retry_waiting");
      if (result.ok) {
        watch.last_notified_at = now;
        watch.notification_for_due_at = watch.due_at;
        watch.notification_retry_at = null;
        appendAudit(state, { type: "notified_per", watch_id: watch.id, at: now, detail: result.channel || "telegram" });
      } else if (result.skipped) {
        watch.notification_retry_at = null;
        appendAudit(state, { type: "notification_channel_unavailable", watch_id: watch.id, at: now, detail: result.reason || "command_center_only" });
      } else {
        watch.notification_retry_at = new Date(Date.parse(now) + HOUR).toISOString();
        appendAudit(state, { type: "notification_failed", watch_id: watch.id, at: now, detail: stringValue(result.error || result.status || "unknown", 160) });
      }
    }
  }
}

export function deriveFollowUpCandidates(dashboard, checkedAt = new Date().toISOString()) {
  const now = validIso(checkedAt) || new Date().toISOString();
  const candidates = [];
  const skipped = [];

  for (const item of asArray(dashboard?.money)) {
    const id = stableId(item, ["payment_ref", "ref", "id", "record_id", "evidence_id"]);
    const searchable = searchableText(item);
    if (!id) { skipped.push({ kind: "payment_waiting", reason: "stable_object_id_missing" }); continue; }
    if (!hasPendingSignal(searchable) && !explicitDue(item)) continue;
    const due = explicitDue(item) || thresholdDue(item, FOLLOW_UP_THRESHOLDS.payment_waiting_ms);
    if (!due) { skipped.push({ kind: "payment_waiting", object_id: id, reason: "verified_due_or_timestamp_missing" }); continue; }
    candidates.push(candidate({
      id: `payment_waiting:${id}`,
      objectId: id,
      kind: "payment_waiting",
      title: stringValue(item?.title || item?.tag || "Payment follow-up", 160),
      summary: stringValue(item?.text || item?.summary || item?.status || "ถึงเวลาตรวจสถานะหลักฐานการชำระอีกครั้ง", 420),
      href: safeHref(item?.href) || "/internal/admin/payments",
      dueAt: due.value,
      dueRule: due.rule,
      evidence: searchable,
      checkedAt: now,
    }));
  }

  for (const item of asArray(dashboard?.jobs)) {
    const id = stableId(item, ["job_id", "id", "session_id", "record_id"]);
    const searchable = searchableText(item);
    if (!id) { skipped.push({ kind: "job_confirmation", reason: "stable_object_id_missing" }); continue; }
    if (!hasJobWaitingSignal(searchable) && !explicitDue(item)) continue;
    const due = explicitDue(item) || thresholdDue(item, FOLLOW_UP_THRESHOLDS.job_confirmation_ms);
    if (!due) { skipped.push({ kind: "job_confirmation", object_id: id, reason: "verified_due_or_timestamp_missing" }); continue; }
    candidates.push(candidate({
      id: `job_confirmation:${id}`,
      objectId: id,
      kind: "job_confirmation",
      title: stringValue(item?.title || `Job ${id}`, 160),
      summary: stringValue(item?.text || item?.summary || item?.status || "ถึงเวลาตรวจสถานะการยืนยันงานอีกครั้ง", 420),
      href: safeHref(item?.href) || "/internal/admin/jobs/create-job",
      dueAt: due.value,
      dueRule: due.rule,
      evidence: searchable,
      checkedAt: now,
    }));
  }

  for (const item of asArray(dashboard?.members)) {
    const id = stableId(item, ["member_id", "client_id", "id", "record_id"]);
    const expiry = firstTime(item, ["expires_at", "expiry_at", "expiry_date", "expires_on", "end_at", "valid_until"]);
    if (!id) { skipped.push({ kind: "membership_renewal", reason: "stable_object_id_missing" }); continue; }
    if (!expiry) { skipped.push({ kind: "membership_renewal", object_id: id, reason: "verified_expiry_missing" }); continue; }
    const expiryMs = Date.parse(expiry);
    const dueAt = new Date(expiryMs - FOLLOW_UP_THRESHOLDS.membership_renewal_window_ms).toISOString();
    candidates.push(candidate({
      id: `membership_renewal:${id}`,
      objectId: id,
      kind: "membership_renewal",
      title: stringValue(item?.title || item?.name || "Membership renewal", 160),
      summary: stringValue(item?.text || item?.summary || `Renewal window ก่อนหมดอายุ ${expiry}`, 420),
      href: safeHref(item?.href) || "/internal/admin/member-intelligence",
      dueAt,
      dueRule: { mode: "renewal_window", window_ms: FOLLOW_UP_THRESHOLDS.membership_renewal_window_ms, source_field: "expiry" },
      evidence: `expiry=${expiry}`,
      checkedAt: now,
    }));
  }

  for (const item of asArray(dashboard?.todos)) {
    const due = explicitDue(item);
    const id = stableId(item, ["client_id", "member_id", "customer_id", "id", "record_id"]);
    const searchable = searchableText(item);
    if (!due || !id || !/(follow.?up|customer|client|ลูกค้า|ติดตาม)/i.test(searchable)) continue;
    candidates.push(candidate({
      id: `customer_follow_up:${id}`,
      objectId: id,
      kind: "customer_follow_up",
      title: stringValue(item?.title || item?.tag || "Customer follow-up", 160),
      summary: stringValue(item?.text || item?.summary || "ถึงเวลาติดตามลูกค้าตาม due time ที่บันทึกไว้", 420),
      href: safeHref(item?.href) || "/internal/admin/jobs/create-job",
      dueAt: due.value,
      dueRule: due.rule,
      evidence: searchable,
      checkedAt: now,
    }));
  }

  return {
    candidates: dedupeCandidates(candidates),
    skipped,
    coverage: {
      payment_waiting: "verified_dashboard_money",
      job_confirmation: "verified_dashboard_jobs",
      membership_renewal: "verified_dashboard_members_with_expiry",
      customer_follow_up: "explicit_due_only",
      model_readiness: "waiting_for_verified_one-missing-item_source",
    },
  };
}

export function internalFollowUpRequest(env, path, init = {}) {
  const binding = env?.FOLLOW_UP_AUTOPILOT;
  if (!binding || typeof binding.idFromName !== "function" || typeof binding.get !== "function") return null;
  const id = binding.idFromName("per-single-owner");
  const stub = binding.get(id);
  return stub.fetch(`https://follow-up-autopilot.internal${path}`, init);
}

export const FOLLOW_UP_INTERNAL = Object.freeze({
  state: INTERNAL_STATE_PATH,
  sync: INTERNAL_SYNC_PATH,
  action: INTERNAL_ACTION_PATH,
});

function applyCandidateSync(state, candidates, now) {
  const incoming = new Map();
  for (const raw of candidates.slice(0, MAX_WATCHES)) {
    const c = sanitizeCandidate(raw, now);
    if (c) incoming.set(c.id, c);
  }

  for (const watch of Object.values(state.watches)) {
    if (watch.source !== "/v1/admin/dashboard") continue;
    if (["closed", "resolved"].includes(watch.state)) continue;
    if (!incoming.has(watch.id)) {
      watch.state = "resolved";
      watch.resolved_at = now;
      watch.updated_at = now;
      appendAudit(state, { type: "resolved_by_revalidation", watch_id: watch.id, at: now });
    }
  }

  for (const c of incoming.values()) {
    const existing = state.watches[c.id];
    if (!existing) {
      state.watches[c.id] = {
        ...c,
        state: Date.parse(c.due_at) <= Date.parse(now) ? "due" : "watching",
        created_at: now,
        updated_at: now,
        last_notified_at: null,
        last_notification_attempt_at: null,
        notification_for_due_at: null,
        notification_status: "not_sent",
        notification_retry_at: null,
        snoozed_until: null,
        closed_at: null,
        resolved_at: null,
      };
      appendAudit(state, { type: "watch_created", watch_id: c.id, at: now, detail: c.kind });
      continue;
    }

    const priorDue = existing.due_at;
    Object.assign(existing, c, { updated_at: now, resolved_at: null });
    if (existing.state === "resolved") {
      existing.state = Date.parse(c.due_at) <= Date.parse(now) ? "due" : "watching";
      appendAudit(state, { type: "condition_returned", watch_id: c.id, at: now });
    } else if (existing.state === "snoozed" && existing.snoozed_until && Date.parse(existing.snoozed_until) > Date.parse(now)) {
      // Keep snooze until its due time.
    } else if (existing.state !== "closed") {
      existing.snoozed_until = null;
      existing.state = Date.parse(c.due_at) <= Date.parse(now) ? "due" : "watching";
    }
    if (priorDue !== c.due_at) {
      existing.notification_for_due_at = null;
      existing.notification_status = "not_sent";
      existing.notification_retry_at = null;
      appendAudit(state, { type: "due_rule_updated", watch_id: c.id, at: now, detail: c.due_at });
    }
  }

  state.last_sync_at = now;
  state.updated_at = now;
}

function sanitizeCandidate(raw, now) {
  const id = stringValue(raw?.id, 240);
  const objectId = stringValue(raw?.object_id, 180);
  const kind = stringValue(raw?.kind, 80);
  const dueAt = validIso(raw?.due_at);
  if (!id || !objectId || !kind || !dueAt) return null;
  return {
    id,
    object_id: objectId,
    kind,
    title: stringValue(raw?.title || kind, 180),
    summary: stringValue(raw?.summary || "", 500),
    href: safeHref(raw?.href) || "/internal/admin/control-room",
    source: "/v1/admin/dashboard",
    verified_condition: {
      matched: true,
      evidence: stringValue(raw?.verified_condition?.evidence || raw?.evidence || "verified dashboard candidate", 260),
    },
    due_rule: raw?.due_rule && typeof raw.due_rule === "object" ? raw.due_rule : { mode: "source_due" },
    due_at: dueAt,
    last_checked_at: validIso(raw?.last_checked_at) || now,
  };
}

function snapshot(state, env) {
  const watches = Object.values(state.watches).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const active = watches.filter((w) => ["watching", "due", "snoozed"].includes(w.state));
  return {
    ok: true,
    schema_version: "mmd_follow_up_autopilot_v1",
    owner_mode: "single_owner",
    human_operator: "Per",
    autopilot_active: true,
    mutation_scope: "reminder_state_only",
    customer_messaging_enabled: false,
    notification_channel: telegramConfigured(env) ? "telegram_and_command_center" : "command_center_only",
    counts: {
      active: active.length,
      due: active.filter((w) => w.state === "due").length,
      snoozed: active.filter((w) => w.state === "snoozed").length,
      resolved: watches.filter((w) => w.state === "resolved").length,
      closed: watches.filter((w) => w.state === "closed").length,
    },
    watches: active.slice(0, 80),
    recent_audit: state.audit.slice(-60).reverse(),
    last_sync_at: state.last_sync_at,
    updated_at: state.updated_at,
    coverage: {
      payment_waiting: "active",
      job_confirmation: "active",
      membership_renewal: "active_when_expiry_is_verified",
      customer_follow_up: "active_when_explicit_due_time_exists",
      model_readiness: "waiting_for_verified_source",
    },
  };
}

function freshState() {
  return {
    schema_version: "mmd_follow_up_autopilot_v1",
    watches: {},
    audit: [],
    last_sync_at: null,
    updated_at: new Date(0).toISOString(),
  };
}

function trimState(state) {
  const entries = Object.entries(state.watches);
  if (entries.length > MAX_WATCHES) {
    entries
      .sort((a, b) => Date.parse(b[1].updated_at || 0) - Date.parse(a[1].updated_at || 0))
      .slice(MAX_WATCHES)
      .forEach(([id]) => delete state.watches[id]);
  }
  state.audit = asArray(state.audit).slice(-MAX_AUDIT);
}

function appendAudit(state, event) {
  state.audit.push({
    ...event,
    actor: "Per/AI Ops",
    authority: "reminder_state_only",
  });
  if (state.audit.length > MAX_AUDIT) state.audit = state.audit.slice(-MAX_AUDIT);
}

function nextAlarmAt(state, now) {
  const nowMs = Date.parse(now);
  let next = null;
  for (const watch of Object.values(state.watches)) {
    if (watch.state === "watching") {
      const due = Date.parse(watch.due_at);
      if (Number.isFinite(due) && due > nowMs) next = next == null ? due : Math.min(next, due);
    }
    if (watch.state === "snoozed" && watch.snoozed_until) {
      const snooze = Date.parse(watch.snoozed_until);
      if (Number.isFinite(snooze) && snooze > nowMs) next = next == null ? snooze : Math.min(next, snooze);
    }
    if (watch.state === "due" && watch.notification_retry_at) {
      const retry = Date.parse(watch.notification_retry_at);
      if (Number.isFinite(retry) && retry > nowMs) next = next == null ? retry : Math.min(next, retry);
    }
  }
  return next;
}

async function notifyPer(watch, env) {
  if (!telegramConfigured(env)) return { ok: false, skipped: true, reason: "telegram_not_configured" };
  const token = String(env.PER_FOLLOWUP_TELEGRAM_BOT_TOKEN).trim();
  const chatId = String(env.PER_FOLLOWUP_TELEGRAM_CHAT_ID).trim();
  const thread = Number(String(env.PER_FOLLOWUP_TELEGRAM_THREAD_ID || "").trim());
  const body = {
    chat_id: chatId,
    text: [
      "⏰ MMD · PER FOLLOW-UP",
      watch.title,
      watch.summary,
      `Due: ${watch.due_at}`,
      `Source last checked: ${watch.last_checked_at}`,
      `Open: https://mmdbkk.com${watch.href}`,
      "",
      "Reminder only — ระบบยังไม่ได้เปลี่ยนสถานะงาน/เงิน/สิทธิ์ใด ๆ",
    ].filter(Boolean).join("\n"),
    disable_web_page_preview: true,
  };
  if (Number.isInteger(thread) && thread > 0) body.message_thread_id = thread;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) return { ok: false, status: response.status, error: data?.description || "telegram_error" };
    return { ok: true, channel: "telegram" };
  } catch (error) {
    return { ok: false, status: 0, error: String(error?.message || error) };
  }
}

function telegramConfigured(env) {
  return Boolean(String(env?.PER_FOLLOWUP_TELEGRAM_BOT_TOKEN || "").trim() && String(env?.PER_FOLLOWUP_TELEGRAM_CHAT_ID || "").trim());
}

function candidate({ id, objectId, kind, title, summary, href, dueAt, dueRule, evidence, checkedAt }) {
  return {
    id,
    object_id: objectId,
    kind,
    title,
    summary,
    href,
    source: "/v1/admin/dashboard",
    verified_condition: { matched: true, evidence: stringValue(evidence, 260) || "verified dashboard candidate" },
    due_rule: dueRule,
    due_at: dueAt,
    last_checked_at: checkedAt,
  };
}

function explicitDue(item) {
  const fields = ["due_at", "deadline_at", "follow_up_at", "review_due_at", "confirm_due_at", "next_action_at"];
  for (const field of fields) {
    const value = validIso(item?.[field]);
    if (value) return { value, rule: { mode: "source_due", source_field: field } };
  }
  return null;
}

function thresholdDue(item, thresholdMs) {
  const fields = ["waiting_since", "submitted_at", "created_at", "updated_at", "ts", "timestamp", "date"];
  for (const field of fields) {
    const value = validIso(item?.[field]);
    if (value) return {
      value: new Date(Date.parse(value) + thresholdMs).toISOString(),
      rule: { mode: "threshold_after_observed", source_field: field, threshold_ms: thresholdMs },
    };
  }
  return null;
}

function firstTime(item, fields) {
  for (const field of fields) {
    const value = validIso(item?.[field]);
    if (value) return value;
  }
  return null;
}

function stableId(item, fields) {
  for (const field of fields) {
    const value = stringValue(item?.[field], 180);
    if (value) return value;
  }
  return "";
}

function searchableText(item) {
  return [item?.status, item?.state, item?.title, item?.tag, item?.text, item?.summary, item?.reason]
    .map((value) => stringValue(value, 240))
    .filter(Boolean)
    .join(" · ");
}

function hasPendingSignal(text) {
  return /(pending|waiting|review|unmatched|hold|รอ|ตรวจ|ยังไม่|ค้าง)/i.test(text);
}

function hasJobWaitingSignal(text) {
  return /(pending|waiting|confirm|confirmation|hold|blocked|telegram|รอ|ยืนยัน|ค้าง|บล็อก)/i.test(text);
}

function isDue(watch, now) {
  return Number.isFinite(Date.parse(watch.due_at)) && Date.parse(watch.due_at) <= Date.parse(now);
}

function validIso(value) {
  if (value == null || value === "") return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function safeHref(value) {
  const href = stringValue(value, 500);
  if (!href) return "";
  if (/^\/\//.test(href)) return "";
  if (!href.startsWith("/internal/") && !href.startsWith("/sigil/") && !href.startsWith("/shop/")) return "";
  return href;
}

function stringValue(value, max = 500) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function dedupeCandidates(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function normalizePath(value = "") {
  const text = String(value || "/").replace(/\/{2,}/g, "/");
  return text.length > 1 ? text.replace(/\/+$/g, "") : text;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
