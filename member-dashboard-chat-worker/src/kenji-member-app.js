import {personalMain} from "../../shared/personal-main-catalog.mjs";
import {
  KENJI_PUBLIC_ALLOWED_CAPABILITIES,
  classifyKenjiPublicCapability,
  isGeneralKenjiIntent,
} from "./kenji-public-capability-policy.js";
import {renderKenjiNextLvPage} from "./kenji-next-lv-page.js";
import {
  PUBLIC_PROMOTION_EVIDENCE_URL,
  selectPublishedPromotionEvidence,
} from "./kenji-public-promotion-evidence.js";
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
      "x-mmd-kenji-policy": "public-general-promotions-v1",
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

// This is a Public Q&A lane. A verified session is needed for admission,
// not permission to forward entitlements, payments, Points or resolver snapshots.
function contextBundle(truth, message, capability) {
  const displayName = text(truth?.display_name, 100);
  return {
    evaluated_at: new Date().toISOString(),
    identity: {
      state: displayName ? "known" : "review_required",
      preferred_name: displayName,
      confidence: displayName ? "high" : "low",
      source: "verified_member_session",
    },
    customer_context: { rename: displayName },
    capability_policy: {
      schema_version: "mmd.kenji_public_capabilities.v1",
      requested: capability,
      allowed: [...KENJI_PUBLIC_ALLOWED_CAPABILITIES],
      server_enforced: true,
    },
    current_message: message,
  };
}

async function askAiWorker(truth, message, capability, env) {
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
        "x-mmd-kenji-capability": capability,
      },
      body: JSON.stringify({
        actor: { role: "system" },
        message,
        member_truth: { display_name: text(truth?.display_name, 100) },
        allowed_capabilities: [...KENJI_PUBLIC_ALLOWED_CAPABILITIES],
        requested_capability: capability,
        context_bundle: contextBundle(truth, message, capability),
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

function capabilityError(classification) {
  return json({
    ok: false,
    error: "capability_not_allowed",
    capability: classification.capability,
    reason: classification.reason,
    allowed_capabilities: [...KENJI_PUBLIC_ALLOWED_CAPABILITIES],
  }, 403);
}

// Feature remains disabled until a separate release authorizes and binds the
// independently attested, read-only registry. Neither a coupon wallet nor a
// legacy Knowledge Card can satisfy this source contract on its own.
async function handlePublishedPromotion(truth, env) {
  if (env.KENJI_PUBLIC_PROMOTIONS_ENABLED !== "true" || !env.KENJI_PROMOTION_EVIDENCE_WORKER?.fetch) {
    return promotionContractUnavailable();
  }
  let response;
  try {
    response = await env.KENJI_PROMOTION_EVIDENCE_WORKER.fetch(new Request(PUBLIC_PROMOTION_EVIDENCE_URL, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "cache-control": "no-store",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
      },
    }));
  } catch {
    return promotionContractUnavailable();
  }
  if (!response.ok) return promotionContractUnavailable();
  const evidence = await response.json().catch(() => null);
  const verified = await selectPublishedPromotionEvidence(evidence);
  if (!verified.ok) return promotionContractUnavailable();

  const expired = verified.state === "announcement_expired";
  return json({
    ok: true,
    reply: expired
      ? "โปรโมชั่นรอบประกาศนี้สิ้นสุดแล้วครับ สิทธิ์ที่เกี่ยวข้องกับบัญชีต้องตรวจจากระบบ MY MMD โดยตรง ไม่สามารถยืนยันจากแชตได้ครับ"
      : verified.reply,
    action: expired
      ? { label: "เปิดคูปองใน MY MMD", url: "/my-mmd/coupons" }
      : { label: "อ่านประกาศโปรโมชั่น", url: verified.public_url },
    intent: "published_promotions",
    capability: "published_promotions",
    campaign_id: verified.campaign_id,
    announcement_state: verified.state,
    allowed_capabilities: [...KENJI_PUBLIC_ALLOWED_CAPABILITIES],
    review_required: false,
    member: {
      display_name: text(truth?.display_name, 100) || null,
      membership_label: text(truth?.membership?.label, 80) || null,
    },
    authority: "mmd_promotion_evidence_registry",
  });
}

function promotionContractUnavailable() {
  return json({
    ok: false,
    error: "published_promotion_contract_unavailable",
    capability: "published_promotions",
    allowed_capabilities: [...KENJI_PUBLIC_ALLOWED_CAPABILITIES],
    source_route: "/my-mmd/coupons",
    retryable: false,
  }, 423);
}

export async function handleKenjiMemberChat(request, env = {}) {
  if (!sameOriginAllowed(request)) return json({ ok: false, error: "origin_not_allowed" }, 403);
  const body = await request.json().catch(() => null);
  const message = text(body?.message, MAX_MESSAGE);
  if (!message) return json({ ok: false, error: "message_required" }, 400);

  // Preserve the canonical session boundary. Capability details are returned
  // only after the member session has been resolved successfully.
  const truth = await readMemberTruth(request, env);
  if (!truth.ok) {
    return json({
      ok: false,
      error: truth.reason,
      verify_url: truth.status === 401 ? "/member/liff?intent=status" : null,
    }, truth.status);
  }

  const classification = classifyKenjiPublicCapability(message);
  if (!classification.allowed) return capabilityError(classification);
  if (classification.capability === "published_promotions") return handlePublishedPromotion(truth.payload, env);

  const result = await askAiWorker(truth.payload, message, classification.capability, env);
  if (!result.ok) return json({ ok: false, error: result.reason }, result.status);
  if (!isGeneralKenjiIntent(result.data.intent)) {
    return json({
      ok: false,
      error: "ai_worker_capability_mismatch",
      expected_intent: "general",
      received_intent: text(result.data.intent, 80) || null,
      allowed_capabilities: [...KENJI_PUBLIC_ALLOWED_CAPABILITIES],
    }, 503);
  }

  const selected = truth.payload.personal_main?.source === "member-pages-worker" ? personalMain(truth.payload.personal_main.id) : null;
  return json({
    ok: true,
    personal_main: selected ? {id:selected.id,name:selected.name} : null,
    reply: (selected ? selected.greeting + "\n" : "") + text(result.data.reply, 1200),
    // General Q&A cannot surface a Worker-selected action into a restricted
    // lane. Published promotions remain an explicit Coupons handoff above.
    action: null,
    intent: "general",
    capability: "general_qna",
    allowed_capabilities: [...KENJI_PUBLIC_ALLOWED_CAPABILITIES],
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
