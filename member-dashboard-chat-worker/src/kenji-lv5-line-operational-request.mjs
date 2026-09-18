import {
  inferLineIntent,
  requestKenjiRuntimeStatus,
  verifyLineSignature,
} from "./index.js";
import {
  isKenjiLv5LineOperationalCandidate,
  resolveKenjiLv5LineOperationalDecision,
} from "./kenji-lv5-line-operational.mjs";
import {
  renderKenjiLv5ModelGateReply,
  resolveKenjiLv5LineModelGate,
} from "./kenji-lv5-line-model-gate.mjs";
import { resolveCanonicalKenjiLineClient } from "./kenji-line-canonical-client-resolution.mjs";
import {
  applyKenjiLv5BookingActionToDecision,
  executeKenjiLv5LineBookingAction,
} from "./kenji-lv5-line-action-execution.mjs";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

function text(value, max = 1600) {
  return String(value ?? "").trim().slice(0, max);
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function normalizedModelRef(value = "") {
  return text(value, 120).toLowerCase().normalize("NFKC").replace(/[\s._-]+/g, "");
}

function eventText(event = {}) {
  if (event?.type === "message" && event?.message?.type === "text") return text(event.message.text, 1000);
  if (event?.type === "postback") return text(event?.postback?.displayText || event?.postback?.data, 1000);
  return "";
}

function replyToken(event = {}) {
  return text(event?.replyToken, 500);
}

async function sendReply(env = {}, token = "", reply = "") {
  const channelToken = text(env.LINE_CHANNEL_ACCESS_TOKEN, 2400);
  const answer = text(reply, 1600);
  if (!channelToken || !token || !answer) return { ok: false, error: "reply_not_configured" };
  try {
    const response = await fetch(LINE_REPLY_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${channelToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ replyToken: token, messages: [{ type: "text", text: answer }] }),
    });
    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, status: response.status, error: "line_reply_failed" };
  } catch {
    return { ok: false, error: "line_reply_request_failed" };
  }
}

function gateDecision(currentIntent, gate) {
  const answer = renderKenjiLv5ModelGateReply(gate);
  if (!answer) return null;
  return {
    text: answer,
    intent: currentIntent,
    inferred_intent: currentIntent,
    reply_source: "lv5_model_access_gate",
    handoff_required: true,
    handoff_reason: `model_access:${text(gate.status, 80)}`,
    truth_authority: "KENJI_MODEL_ACCESS_V1",
    truth_status: gate.status === "unavailable" ? "unavailable" : "verified_gate",
    live_truth_used: true,
    live_truth_verified: gate.status !== "unavailable",
    operational: {
      phase: "P3_model_visibility_gate",
      model_access_status: text(gate.status, 80),
    },
  };
}

function aliasCalendarDecision(currentIntent, gate) {
  const requested = text(gate?.parsed?.model_name, 120);
  const canonical = text(gate?.model?.working_name, 120);
  return {
    text: `สิทธิ์ของนายแบบที่ขอยืนยันได้แล้วครับ แต่ชื่อที่ใช้เช็ก Calendar ต้องผูกกับชื่อ Canonical ก่อน ผมจึงยังไม่บอกว่าว่างหรือไม่ว่างจากรหัส/ชื่อย่อนี้ครับ รายละเอียดวัน เวลา และสถานที่ที่ส่งมายังคงใช้ต่อได้ ไม่ต้องเริ่มใหม่ครับ`,
    intent: currentIntent,
    inferred_intent: currentIntent,
    reply_source: "lv5_model_alias_calendar_guard",
    handoff_required: true,
    handoff_reason: "model_alias_calendar_mapping_required",
    truth_authority: "KENJI_MODEL_ACCESS_V1",
    truth_status: "verified_model_access_calendar_mapping_pending",
    live_truth_used: true,
    live_truth_verified: false,
    operational: {
      phase: "P3_model_alias_calendar_guard",
      model_access_status: "match",
      requested_model_ref: requested,
      canonical_model_ref: canonical,
    },
  };
}

function needsCanonicalCalendarMapping(gate = {}) {
  if (gate.required !== true || gate.status !== "match") return false;
  const requested = normalizedModelRef(gate?.parsed?.model_name);
  const canonical = normalizedModelRef(gate?.model?.working_name);
  return Boolean(requested && canonical && requested !== canonical);
}

function isPreparedBookingDecision(decision = {}, modelGate = {}) {
  return decision?.live_truth_verified === true
    && text(decision?.operational?.primary_action, 80) === "prepare_booking_intent"
    && modelGate?.required === true
    && modelGate?.status === "match"
    && text(modelGate?.parsed?.type, 40) === "booking";
}

async function applyP4Action(env, event, modelGate, decision) {
  if (!isPreparedBookingDecision(decision, modelGate)) return { decision, result: { attempted: false, executed: false, status: "not_eligible" } };
  const canonical = await resolveCanonicalKenjiLineClient({ env, event }).catch(() => null);
  if (canonical?.resolved !== true || !/^rec[A-Za-z0-9]+$/.test(text(canonical?.client_record_id, 80))) {
    const result = { attempted: true, executed: false, status: "canonical_client_recheck_failed" };
    return { decision: applyKenjiLv5BookingActionToDecision(decision, result), result };
  }
  const result = await executeKenjiLv5LineBookingAction({
    env,
    event,
    modelGate,
    decision,
    canonicalClientId: text(canonical.client_record_id, 80),
  });
  return { decision: applyKenjiLv5BookingActionToDecision(decision, result), result };
}

export async function tryHandleKenjiLv5LineOperationalRequest(request, env = {}, ctx = null) {
  if (!(request instanceof Request) || String(request.method || "GET").toUpperCase() !== "POST") return null;
  const rawBody = await request.clone().text().catch(() => "");
  const signature = text(request.headers.get("x-line-signature"), 500);
  if (!rawBody || !await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET).catch(() => false)) return null;

  let body;
  try { body = JSON.parse(rawBody); } catch { return null; }
  const events = Array.isArray(body?.events) ? body.events : [];
  if (events.length !== 1) return null;
  const event = events[0];
  if (event?.source?.type !== "user" || event?.deliveryContext?.isRedelivery === true || text(event?.mode, 20).toLowerCase() === "standby") return null;
  if (!replyToken(event)) return null;

  const raw = eventText(event);
  if (!raw) return null;
  const currentIntent = inferLineIntent(raw, event);
  if (!isKenjiLv5LineOperationalCandidate(event, currentIntent)) return null;

  if (!enabled(env.LINE_AUTO_REPLY_ENABLED) || !enabled(env.LINE_KENJI_AI_ENABLED)) return null;
  const runtime = await requestKenjiRuntimeStatus(env).catch(() => ({ ok: false }));
  const controls = runtime?.controls || {};
  if (runtime?.ok !== true || controls.all_kenji_mutations === true || controls.line_oa_auto_reply === true) return null;

  const modelGate = await resolveKenjiLv5LineModelGate({ env, event, currentIntent }).catch(() => ({ required: true, status: "unavailable" }));
  let decision;
  if (modelGate.required === true && modelGate.status !== "match") {
    decision = gateDecision(currentIntent, modelGate);
  } else if (needsCanonicalCalendarMapping(modelGate)) {
    decision = aliasCalendarDecision(currentIntent, modelGate);
  } else {
    decision = await resolveKenjiLv5LineOperationalDecision({ env, event, currentIntent }).catch(() => null);
  }
  if (!decision?.text) return null;

  decision = {
    ...decision,
    intent: currentIntent,
    inferred_intent: currentIntent,
    operational: {
      ...(decision.operational || {}),
      operational_intent: text(modelGate?.parsed?.type || decision?.operational?.operational_intent, 80),
      model_access_status: modelGate.required === true ? text(modelGate.status, 80) : "not_required",
    },
  };

  const p4 = await applyP4Action(env, event, modelGate, decision);
  decision = p4.decision;
  const delivery = await sendReply(env, replyToken(event), decision.text);
  const p4Attempted = p4?.result?.attempted === true;
  return {
    handled: true,
    response: new Response(JSON.stringify({
      ok: true,
      route: "line_webhook",
      operational: p4Attempted ? "lv5_p4" : "lv5_p3",
      action_executed: p4?.result?.executed === true,
      delivered: delivery.ok === true,
    }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-mmd-worker": "member-dashboard-chat-worker",
        "x-mmd-kenji-operational": p4Attempted ? "lv5-p4" : "lv5-p3",
      },
    }),
    event,
    decision,
    delivered: delivery.ok === true,
    attempted: true,
    delivery_status: Number.isInteger(delivery.status) ? delivery.status : null,
  };
}

export const KENJI_LV5_LINE_REQUEST_INTERNALS = Object.freeze({ needsCanonicalCalendarMapping, isPreparedBookingDecision });
