import {personalMain} from "../../shared/personal-main-catalog.mjs";
import {renderKenjiNextLvPage} from "./kenji-next-lv-page.js";
const PAGE_PATHS = new Set(["/member/kenji", "/member/kenji/"]);
const CHAT_PATHS = new Set(["/api/member/kenji/chat", "/api/member/kenji/chat/"]);
const LEGACY_PATHS = new Set(["/member/kenji-ai-20", "/member/kenji-ai-20/"]);
const AI_CHAT_URL = "https://ai-worker.local/v1/ai/kenji/member-chat";
const MEMBER_TRUTH_URL = "https://member-pages-worker.internal/__internal/kenji/member-session-truth";
const MAX_MESSAGE = 800;

function text(value, max = 800) {
  return value == null ? "" : String(value).trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizePath(request) {
  try { return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/"); }
  catch { return ""; }
}

export function isKenjiMemberPage(request) {
  return request instanceof Request && request.method === "GET" && PAGE_PATHS.has(normalizePath(request));
}

export function isKenjiMemberChat(request) {
  return request instanceof Request && request.method === "POST" && CHAT_PATHS.has(normalizePath(request));
}

export function isKenjiMemberSurfacePath(request) {
  const path = normalizePath(request);
  return path.startsWith("/member/kenji") || path.startsWith("/api/member/kenji/");
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-mmd-kenji": "member-chat-v1",
    },
  });
}

function sameOriginAllowed(request) {
  const origin = text(request.headers.get("origin"), 300);
  if (!origin) return true;
  return origin === "https://mmdbkk.com" || origin === "https://www.mmdbkk.com";
}

async function readMemberTruth(request, env) {
  if (!env.MEMBER_PAGES_WORKER?.fetch) return { ok: false, status: 503, reason: "member_truth_binding_missing" };
  const headers = new Headers({
    "content-type": "application/json",
    "x-mmd-internal-call": "true",
    "x-mmd-service-binding": "member-dashboard-chat-worker",
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  let response;
  try {
    response = await env.MEMBER_PAGES_WORKER.fetch(new Request(MEMBER_TRUTH_URL, {
      method: "POST",
      headers,
      body: "{}",
    }));
  } catch {
    return { ok: false, status: 503, reason: "member_truth_unavailable" };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    return { ok: false, status: response.status === 401 ? 401 : 503, reason: payload?.error || "member_truth_unavailable" };
  }
  return { ok: true, payload };
}

function evidenceSources(truth) {
  const found = { state: "FOUND" };
  const unavailable = { state: "SOURCE_UNAVAILABLE" };
  return {
    rename_identity: truth?.display_name ? found : unavailable,
    line_oa_1to1: unavailable,
    line_crew: unavailable,
    chat_exports_attachments: unavailable,
    hashtags_tenure: unavailable,
    recognition_history: unavailable,
    membership_cycles: found,
    payment_evidence: unavailable,
    resolver_snapshot: found,
  };
}

function contextBundle(truth, message) {
  const displayName = text(truth?.display_name, 100);
  return {
    evaluated_at: new Date().toISOString(),
    identity: {
      state: displayName ? "known" : "review_required",
      preferred_name: displayName,
      confidence: displayName ? "high" : "low",
      source: "verified_member_session",
    },
    customer_context: {
      rename: displayName,
      latest_cycle: {
        package_code: text(truth?.membership?.level, 80),
        expire_at: text(truth?.membership?.expire_at, 80),
      },
      entitlement_snapshot: truth?.resolver_snapshot || {},
      evidence_sources: evidenceSources(truth),
    },
    current_message: message,
  };
}

async function askAiWorker(truth, message, env) {
  if (!env.AI_WORKER?.fetch) return { ok: false, status: 503, reason: "ai_worker_binding_missing" };
  let response;
  try {
    response = await env.AI_WORKER.fetch(new Request(AI_CHAT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
        "x-service-name": "member-dashboard-chat-worker",
      },
      body: JSON.stringify({
        actor: { role: "system" },
        message,
        member_truth: truth,
        context_bundle: contextBundle(truth, message),
      }),
    }));
  } catch {
    return { ok: false, status: 503, reason: "ai_worker_unavailable" };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || payload?.data?.schema_version !== "mmd.kenji_member_chat.v1") {
    return { ok: false, status: 503, reason: "ai_worker_contract_unavailable" };
  }
  return { ok: true, data: payload.data };
}

export async function handleKenjiMemberChat(request, env = {}) {
  if (!sameOriginAllowed(request)) return json({ ok: false, error: "origin_not_allowed" }, 403);
  const body = await request.json().catch(() => null);
  const message = text(body?.message, MAX_MESSAGE);
  if (!message) return json({ ok: false, error: "message_required" }, 400);

  const truth = await readMemberTruth(request, env);
  if (!truth.ok) {
    return json({
      ok: false,
      error: truth.reason,
      verify_url: truth.status === 401 ? "/member/liff?intent=status" : null,
    }, truth.status);
  }

  const result = await askAiWorker(truth.payload, message, env);
  if (!result.ok) return json({ ok: false, error: result.reason }, result.status);

  const selected = truth.payload.personal_main?.source === "member-pages-worker" ? personalMain(truth.payload.personal_main.id) : null;
  return json({
    ok: true,
    personal_main: selected ? {id:selected.id,name:selected.name} : null,
    reply: (selected ? selected.greeting + "\n" : "") + text(result.data.reply, 1200),
    action: result.data.action || null,
    intent: text(result.data.intent, 80),
    review_required: result.data?.safety?.review_required === true,
    member: {
      display_name: text(truth.payload.display_name, 100) || null,
      membership_label: text(truth.payload?.membership?.label, 80) || null,
    },
    authority: "ai-worker",
  });
}

export function renderKenjiMemberPage() {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  return renderKenjiNextLvPage(nonce);
}

export async function handleKenjiMemberSurface(request, env = {}) {
  const path = normalizePath(request);
  if (request.method === "GET" && LEGACY_PATHS.has(path)) {
    const url = new URL(request.url);
    url.pathname = "/member/kenji";
    return Response.redirect(url.toString(), 308);
  }
  if (isKenjiMemberPage(request)) return renderKenjiMemberPage();
  if (isKenjiMemberChat(request)) return handleKenjiMemberChat(request, env);
  return json({ ok: false, error: "not_found" }, 404);
}
