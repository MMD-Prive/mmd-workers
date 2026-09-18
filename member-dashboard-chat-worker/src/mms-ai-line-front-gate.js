import currentWorker from "./my-mmd-bounded-status-front-gate.js";
export { KenjiModelIdempotency } from "./my-mmd-bounded-status-front-gate.js";

import {
  MMS_AI_KNOWLEDGE_VERSION,
  MMS_AI_SYSTEM_PROMPT_V4,
  MMS_DYNAMIC_INTENTS,
  classifyMmsIntent,
  guardMmsAiOutput,
  staticMmsReply,
} from "./mms-ai-knowledge-v4.js";

const WORKER_NAME = "member-dashboard-chat-worker";
const MMS_LINE_WEBHOOK_PATHS = new Set(["/webhooks/line/mms", "/webhooks/line/mms/"]);
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6";
const MODEL_TIMEOUT_MS = 4_000;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": WORKER_NAME,
      "x-mmd-route-owner": WORKER_NAME,
      "x-mms-ai-knowledge": MMS_AI_KNOWLEDGE_VERSION,
    },
  });
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function timingSafeEqual(leftValue, rightValue) {
  const left = clean(leftValue);
  const right = clean(rightValue);
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export async function createMmsLineSignature(rawBody, channelSecret) {
  const secret = clean(channelSecret);
  if (!secret) return "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(rawBody || "")));
  return bytesToBase64(signature);
}

export async function verifyMmsLineSignature(rawBody, signature, channelSecret) {
  const expected = await createMmsLineSignature(rawBody, channelSecret);
  return timingSafeEqual(expected, signature);
}

function eventText(event = {}) {
  if (event?.type === "message" && event?.message?.type === "text") return clean(event.message.text);
  if (event?.type === "postback") return clean(event?.postback?.displayText || event?.postback?.data);
  return "";
}

function resolveRole(intent = "", message = "") {
  const raw = clean(message).toLowerCase();
  if (["application_start", "application_status", "missing_documents"].includes(intent)) return "applicant";
  if (["therapist_state", "training"].includes(intent) || /(?:ผมเป็น therapist|ฉันเป็น therapist|mms therapist|รับงาน|work mode|my skill)/i.test(raw)) return "therapist";
  if (/(?:partner operations|mms partner|หลังบ้าน mms)/i.test(raw)) return "partner";
  return "customer";
}

async function fetchMmsCatalog(env = {}) {
  if (!env.MMS_WORKER?.fetch) return { ok: false, reason: "mms_worker_binding_missing", data: null };
  try {
    const response = await env.MMS_WORKER.fetch(new Request("https://mms.internal/mms/api/catalog", {
      method: "GET",
      headers: { accept: "application/json" },
    }));
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) return { ok: false, reason: `mms_catalog_http_${response.status}`, data: null };
    return { ok: true, reason: "", data: payload.data || null };
  } catch (_) {
    return { ok: false, reason: "mms_catalog_request_failed", data: null };
  }
}

function extractModelOutputText(payload = {}) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
}

async function generateMmsModelReply({ env = {}, message = "", role = "customer", intent = "general", catalog = null } = {}) {
  if (!enabled(env.MMS_LINE_AI_MODEL_ENABLED)) {
    return { text: "", attempted: false, success: false, reason: "model_disabled" };
  }
  if (MMS_DYNAMIC_INTENTS.has(intent)) {
    return { text: "", attempted: false, success: false, reason: "live_truth_required" };
  }

  const apiKey = clean(env.OPENAI_API_KEY);
  if (!apiKey) return { text: "", attempted: false, success: false, reason: "openai_key_missing" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("mms_ai_timeout"), MODEL_TIMEOUT_MS);
  const publicCatalog = catalog && Array.isArray(catalog.skills)
    ? {
        skills: catalog.skills.slice(0, 12).map((item) => ({ code: clean(item?.code), label: clean(item?.label), th: clean(item?.th) })),
        zones: Array.isArray(catalog.zones) ? catalog.zones.slice(0, 30) : [],
        max_selected_skills: Number(catalog.max_selected_skills) || null,
      }
    : null;

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: clean(env.MMS_OPENAI_MODEL || env.OPENAI_MODEL) || DEFAULT_MODEL,
        instructions: MMS_AI_SYSTEM_PROMPT_V4,
        input: [
          `Role: ${role}`,
          `Intent: ${intent}`,
          `Knowledge version: ${MMS_AI_KNOWLEDGE_VERSION}`,
          `Approved public MMS catalog: ${publicCatalog ? JSON.stringify(publicCatalog) : "not available"}`,
          `Live user-specific truth supplied: false`,
          `User message: ${clean(message).slice(0, 1000)}`,
        ].join("\n"),
        max_output_tokens: 320,
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "mms_line_reply",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                reply_text: { type: "string" },
                response_kind: { type: "string", enum: ["conversation", "public_explanation", "clarification", "silent"] },
                requires_live_truth: { type: "boolean" },
                needs_human_review: { type: "boolean" },
              },
              required: ["reply_text", "response_kind", "requires_live_truth", "needs_human_review"],
            },
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) return { text: "", attempted: true, success: false, reason: `openai_http_${response.status}` };
    const payload = await response.json().catch(() => null);
    const raw = extractModelOutputText(payload || {});
    if (!raw) return { text: "", attempted: true, success: false, reason: "model_output_empty" };

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return { text: "", attempted: true, success: false, reason: "model_output_invalid_json" };
    }
    if (parsed?.requires_live_truth === true) return { text: "", attempted: true, success: false, reason: "model_requested_live_truth" };
    const guarded = guardMmsAiOutput(parsed?.reply_text || "", { live_truth_supplied: false });
    if (!guarded.ok) return { text: "", attempted: true, success: false, reason: guarded.reason };
    return {
      text: parsed?.response_kind === "silent" ? "" : guarded.text,
      attempted: true,
      success: true,
      reason: "",
      needs_human_review: parsed?.needs_human_review === true,
    };
  } catch (_) {
    return { text: "", attempted: true, success: false, reason: "model_request_failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function sendMmsLineReply(env = {}, replyToken = "", replyText = "") {
  const token = clean(env.MMS_LINE_CHANNEL_ACCESS_TOKEN);
  const reply = clean(replyToken);
  const safe = clean(replyText).slice(0, 1800);
  if (!token) return { ok: false, error: "mms_line_token_missing" };
  if (!reply || !safe) return { ok: false, error: !reply ? "reply_token_missing" : "reply_text_missing" };
  try {
    const response = await fetch(LINE_REPLY_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ replyToken: reply, messages: [{ type: "text", text: safe }] }),
    });
    return response.ok ? { ok: true, status: response.status } : { ok: false, status: response.status, error: "mms_line_reply_failed" };
  } catch (_) {
    return { ok: false, error: "mms_line_reply_request_failed" };
  }
}

export async function handleMmsLineWebhook(request, env = {}, ctx = null) {
  const rawBody = await request.text();
  const secret = clean(env.MMS_LINE_CHANNEL_SECRET);
  if (!secret) return json({ ok: false, error: "mms_line_secret_missing" }, 503);

  const signature = clean(request.headers.get("x-line-signature"));
  if (!(await verifyMmsLineSignature(rawBody, signature, secret))) {
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const aiEnabled = enabled(env.MMS_LINE_AI_ENABLED);
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  const results = [];

  for (const event of events) {
    const message = eventText(event);
    const eventMode = clean(event?.mode).toLowerCase() || "unknown";
    const replyToken = clean(event?.replyToken);
    const intent = classifyMmsIntent(message);
    const role = resolveRole(intent, message);
    const canReply = Boolean(aiEnabled && eventMode !== "standby" && replyToken && message);

    let catalog = { ok: false, data: null, reason: "not_requested" };
    if (canReply && ["service_discovery", "service_guidance", "general"].includes(intent)) {
      catalog = await fetchMmsCatalog(env);
    }

    let replyText = canReply ? staticMmsReply({ message, intent, role }) : "";
    let source = replyText ? "knowledge_v4" : "silent";
    let model = { attempted: false, success: false, reason: "not_needed" };

    if (canReply && !replyText) {
      model = await generateMmsModelReply({ env, message, role, intent, catalog: catalog.data });
      replyText = model.text || "";
      if (replyText) source = "mms_model_v4";
    }

    const replyResult = replyText ? await sendMmsLineReply(env, replyToken, replyText) : null;

    console.log(JSON.stringify({
      mms_line_ai: "reply_diagnostics",
      knowledge_version: MMS_AI_KNOWLEDGE_VERSION,
      event_type: clean(event?.type) || "unknown",
      event_mode: eventMode,
      redelivered: event?.deliveryContext?.isRedelivery === true,
      role,
      intent,
      ai_enabled: aiEnabled,
      model_enabled: enabled(env.MMS_LINE_AI_MODEL_ENABLED),
      reply_candidate: Boolean(replyText),
      reply_source: source,
      reply_sent: replyResult?.ok === true,
      reply_status: Number.isInteger(replyResult?.status) ? replyResult.status : null,
      reply_error: clean(replyResult?.error) || null,
      model_attempted: model.attempted === true,
      model_success: model.success === true,
      model_reason: clean(model.reason) || null,
      catalog_grounded: catalog.ok === true,
      catalog_reason: catalog.ok ? null : clean(catalog.reason) || null,
      mutation_allowed: false,
    }));

    results.push({
      ok: true,
      role,
      intent,
      replied: replyResult?.ok === true,
      reply_source: source,
      model_attempted: model.attempted === true,
      model_success: model.success === true,
    });
  }

  const background = Promise.resolve();
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(background);
  return json({ ok: true, accepted: true, events: results.length, knowledge_version: MMS_AI_KNOWLEDGE_VERSION });
}

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase().replace(/\/{2,}/g, "/");
    if (!MMS_LINE_WEBHOOK_PATHS.has(path)) return currentWorker.fetch(request, env, ctx);

    if (request.method === "GET" || request.method === "HEAD") {
      const payload = {
        ok: true,
        worker: WORKER_NAME,
        route: "mms_line_webhook",
        knowledge_version: MMS_AI_KNOWLEDGE_VERSION,
        ai_enabled: enabled(env.MMS_LINE_AI_ENABLED),
        model_enabled: enabled(env.MMS_LINE_AI_MODEL_ENABLED),
        mms_worker_bound: Boolean(env.MMS_WORKER?.fetch),
        line_credentials_present: Boolean(clean(env.MMS_LINE_CHANNEL_SECRET) && clean(env.MMS_LINE_CHANNEL_ACCESS_TOKEN)),
        mutation_allowed: false,
      };
      return request.method === "HEAD" ? new Response(null, { status: 200, headers: json(payload).headers }) : json(payload);
    }

    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    return handleMmsLineWebhook(request, env, ctx);
  },
};

export const MMS_AI_LINE_INTERNALS = Object.freeze({
  MMS_LINE_WEBHOOK_PATHS,
  fetchMmsCatalog,
  generateMmsModelReply,
  resolveRole,
  sendMmsLineReply,
});
