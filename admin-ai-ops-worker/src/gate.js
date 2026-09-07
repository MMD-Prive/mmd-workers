import aiOpsWorker from "./ceo-bridge.js";
import { COMMAND_CENTER_PATH } from "./command-center.js";
import {
  FOLLOW_UP_ACTION_PATH,
  FOLLOW_UP_INTERNAL,
  FOLLOW_UP_STATE_PATH,
  FOLLOW_UP_SYNC_PATH,
  deriveFollowUpCandidates,
  internalFollowUpRequest,
} from "./follow-up-autopilot.js";

export { FollowUpAutopilot } from "./follow-up-autopilot.js";

const CONTEXT_PATH = "/v1/admin/ai-ops/context";
const CLIENT_PATH = "/v1/admin/ai-ops/client.js";
const AI_OPS_PREFIX = "/v1/admin/ai-ops/";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method !== "OPTIONS" && path.startsWith(AI_OPS_PREFIX) && path !== CLIENT_PATH) {
      const auth = await verifyAdminStrict(request);
      if (!auth.ok) return unauthorized();
    }

    if (path === FOLLOW_UP_STATE_PATH) {
      if (method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
      return readFollowUpState(env);
    }

    if (path === FOLLOW_UP_SYNC_PATH) {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      const dashboard = await readAdminJson(request, "/v1/admin/dashboard");
      if (!dashboard.ok || !dashboard.data) {
        return json({
          ok: false,
          error: "verified_dashboard_unavailable",
          source: "/v1/admin/dashboard",
          status: dashboard.status,
        }, 424);
      }
      const checkedAt = new Date().toISOString();
      const derived = deriveFollowUpCandidates(dashboard.data, checkedAt);
      const response = await internalFollowUpRequest(env, FOLLOW_UP_INTERNAL.sync, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidates: derived.candidates, checked_at: checkedAt }),
      });
      if (!response) return bindingUnavailable();
      return enrichFollowUpResponse(response, derived);
    }

    if (path === FOLLOW_UP_ACTION_PATH) {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      const body = await request.json().catch(() => null);
      if (!body) return json({ ok: false, error: "invalid_json" }, 400);
      const response = await internalFollowUpRequest(env, FOLLOW_UP_INTERNAL.action, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: String(body.id || "").slice(0, 240),
          action: String(body.action || "").slice(0, 40),
          snooze_minutes: Number(body.snooze_minutes || 60),
        }),
      });
      return response || bindingUnavailable();
    }

    const base = await aiOpsWorker.fetch(request, env, ctx);

    if (method === "GET" && path === CLIENT_PATH && base.ok) {
      const source = await base.text();
      const headers = new Headers(base.headers);
      headers.delete("content-length");
      headers.set("x-mmd-follow-up-autopilot", "p1");
      return new Response(
        source
          .replace("WATCHING · FOUNDATION", "WATCHING · AUTOPILOT")
          .replace("AI ช่วยอ่าน/สรุป/เช็ก · เปอร์ยืนยันจุดสำคัญ · authority จริงยังอยู่ backend", "AI ช่วยอ่าน/สรุป/เช็ก/ตามให้ · เปอร์ยืนยันจุดสำคัญ · authority จริงยังอยู่ backend"),
        { status: base.status, statusText: base.statusText, headers },
      );
    }

    if (method === "GET" && (path === COMMAND_CENTER_PATH || path === CONTEXT_PATH) && base.ok) {
      const followUp = await readFollowUpStatePayload(env);
      return decorateCommandCenter(base, followUp);
    }

    return base;
  },
};

async function readFollowUpState(env) {
  const response = await internalFollowUpRequest(env, FOLLOW_UP_INTERNAL.state, { method: "GET" });
  return response || bindingUnavailable();
}

async function readFollowUpStatePayload(env) {
  const response = await internalFollowUpRequest(env, FOLLOW_UP_INTERNAL.state, { method: "GET" });
  if (!response) return { ok: false, error: "autopilot_binding_unavailable" };
  const data = await response.json().catch(() => null);
  return response.ok && data ? data : { ok: false, error: "autopilot_state_unavailable", status: response.status };
}

async function enrichFollowUpResponse(response, derived) {
  const data = await response.json().catch(() => null);
  if (!data) return response;
  data.derivation = {
    verified_source: "/v1/admin/dashboard",
    candidate_count: derived.candidates.length,
    skipped_count: derived.skipped.length,
    skipped: derived.skipped.slice(0, 20),
    coverage: derived.coverage,
  };
  return json(data, response.status);
}

async function decorateCommandCenter(response, followUp) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return response;
  const payload = await response.json().catch(() => null);
  if (!payload || payload.ok === false) return response;

  payload.follow_up_autopilot = followUp;
  if (payload.command_center) {
    const cc = payload.command_center;
    cc.phases = (Array.isArray(cc.phases) ? cc.phases : []).map((phase) => (
      phase?.key === "follow_up_autopilot"
        ? { ...phase, status: followUp?.ok ? "live_p1" : "waiting_p1" }
        : phase
    ));

    if (followUp?.ok) {
      const watches = Array.isArray(followUp.watches) ? followUp.watches : [];
      const due = watches.filter((watch) => watch.state === "due");
      cc.watching = {
        status: "live_p1",
        autopilot_active: true,
        notification_channel: followUp.notification_channel,
        note: "Durable watch state · revalidated from verified dashboard when Command Center opens · reminder only, no customer message or protected mutation",
        counts: followUp.counts,
        items: watches.slice(0, 12),
      };
      cc.counts = {
        ...(cc.counts || {}),
        watching_active: Number(followUp.counts?.active || 0),
        watching_due: Number(followUp.counts?.due || 0),
      };
      cc.needs_per = dedupeById([
        ...due.map((watch) => ({
          id: `follow-up:${watch.id}`,
          kind: "follow_up_due",
          title: watch.title || "Follow-up due",
          summary: `${watch.summary || "ถึงเวลาตรวจอีกครั้ง"} · checked ${watch.last_checked_at || "-"}`,
          href: watch.href || "/internal/admin/control-room",
          urgency: "high",
          source: "follow_up_autopilot",
          authority: "reminder_state_only",
          per_confirmation_required: false,
        })),
        ...(Array.isArray(cc.needs_per) ? cc.needs_per : []),
      ]).slice(0, 12);
      cc.prepared = dedupeById([
        ...due.map((watch, index) => ({
          id: `prepared:follow-up:${watch.id}`,
          kind: watch.kind,
          priority: index + 1,
          title: watch.title || "Follow-up due",
          summary: watch.summary || "เปิด source แล้วตรวจสถานะล่าสุด",
          href: watch.href || "/internal/admin/control-room",
          authority: "canonical_backend",
          execution_mode: "handoff_only",
          per_confirmation_required: false,
          source: "follow_up_autopilot",
        })),
        ...(Array.isArray(cc.prepared) ? cc.prepared : []),
      ]).slice(0, 12);
    } else {
      cc.watching = {
        ...(cc.watching || {}),
        status: "waiting_p1",
        autopilot_active: false,
        note: "Durable Follow-up Autopilot state unavailable — no reminder state will be invented",
      };
    }
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-follow-up-autopilot", followUp?.ok ? "p1-live" : "p1-waiting");
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}

async function verifyAdminStrict(request) {
  try {
    const url = new URL(request.url);
    url.pathname = "/v1/admin/auth/me";
    url.search = "";
    const headers = new Headers({ accept: "application/json" });
    for (const key of ["cookie", "origin", "user-agent"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      redirect: "manual",
    });
    if (!response.ok) return { ok: false };
    const body = await response.json().catch(() => null);
    return {
      ok: Boolean(body && body.ok === true && body.authenticated === true),
      actor: body || null,
    };
  } catch {
    return { ok: false };
  }
}

async function readAdminJson(request, route) {
  const base = new URL(request.url);
  const target = new URL(route, `${base.protocol}//${base.host}`);
  const headers = new Headers({ accept: "application/json" });
  for (const key of ["cookie", "origin", "user-agent"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const response = await fetch(target.toString(), { method: "GET", headers, redirect: "manual" });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: response.ok && data !== null, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function bindingUnavailable() {
  return json({
    ok: false,
    error: "autopilot_binding_unavailable",
    message: "Follow-up Autopilot durable state is not available; no reminder state was changed.",
  }, 503);
}

function unauthorized() {
  return json({ ok: false, error: "unauthorized" }, 401);
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePath(value = "") {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
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
