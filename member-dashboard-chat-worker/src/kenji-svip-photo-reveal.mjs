import { normalizeSvipPhotoRevealMode } from "../../shared/svip-photo-reveal-rollout.mjs";
import { requestKenjiRuntimeStatus } from "./index.js";

const HYPE_SVIP_PHOTO_REVEAL_PATH = "/v1/internal/hype/svip-photo-reveal";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

function text(value, max = 1600) {
  return String(value ?? "").trim().slice(0, max);
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function photoRevealMode(env = {}) {
  return normalizeSvipPhotoRevealMode(env.KENJI_SVIP_PHOTO_REVEAL_MODE);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function pilotAllows(env = {}, userId = "") {
  const hashes = text(env.KENJI_SVIP_PHOTO_REVEAL_PILOT_HASHES, 4000)
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!hashes.length || hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) return false;
  return hashes.includes(await sha256Hex(userId));
}

function lineUserId(event = {}) {
  const value = event?.source?.type === "user" ? text(event?.source?.userId, 80) : "";
  return /^U[0-9a-f]{32}$/i.test(value) ? value : "";
}

function cleanModelQuery(value = "") {
  return text(value, 120)
    .replace(/^(?:ของ|น้อง|คุณ)\s+/i, "")
    .replace(/\s*(?:ทั้งหมด|เต็มชุด|all|full\s*set)?\s*(?:หน่อย|ที|ครับ|ค่ะ|คะ|นะ|น้า)*(?:ครับ|ค่ะ|คะ|นะ|น้า)?\s*$/i, "")
    .trim();
}

export function parseKenjiSvipPhotoRevealText(value = "") {
  const raw = text(value, 500).normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const thaiPhotoFirst = raw.match(/^(?:ขอ|ขอดู|ดู|ส่ง|ส่งมา|เปิด|อยากดู)?\s*(?:รูป|ภาพ)(?:ทั้งหมด|เต็มชุด)?\s*(?:ของ)?\s+(.+)$/i);
  if (thaiPhotoFirst) {
    const query = cleanModelQuery(thaiPhotoFirst[1]);
    return query ? { query, mode: "exact_photo_request" } : null;
  }

  const thaiModelFirst = raw.match(/^(.{2,80}?)\s+(?:ขอ|ขอดู|ดู|ส่ง)?\s*(?:รูป|ภาพ)(?:ทั้งหมด|เต็มชุด)?(?:\s*(?:หน่อย|ที|ครับ|ค่ะ|คะ|นะ|น้า))?$/i);
  if (thaiModelFirst) {
    const query = cleanModelQuery(thaiModelFirst[1]);
    return query ? { query, mode: "exact_photo_request" } : null;
  }

  const english = raw.match(/^(?:show|send|let\s+me\s+see|get)\s+(?:me\s+)?(?:all\s+|the\s+full\s+set\s+of\s+)?(?:photos?|pics?|pictures?)\s+(?:of\s+)?(.+)$/i);
  if (english) {
    const query = cleanModelQuery(english[1]);
    return query ? { query, mode: "exact_photo_request" } : null;
  }

  return null;
}

async function callHypePhotoResolver(env = {}, event = {}, query = "", context = {}) {
  const userId = lineUserId(event);
  const internalToken = text(env.INTERNAL_TOKEN, 2000);
  if (!env.ADMIN_WORKER?.fetch || !internalToken || !userId || !query) return { status: "unavailable" };
  try {
    const response = await env.ADMIN_WORKER.fetch(new Request(`https://admin-worker.local${HYPE_SVIP_PHOTO_REVEAL_PATH}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${internalToken}`,
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
      },
      body: JSON.stringify({
        line_user_id: userId,
        query,
        event_ref: text(event?.message?.id || event?.webhookEventId || event?.replyToken, 160),
        dry_run: context.dry_run === true,
      }),
    }));
    if (!response.ok) return { status: "unavailable" };
    const payload = await response.json().catch(() => null);
    return payload && typeof payload === "object" ? payload : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

function packApprovedAlbumMessages(modelName = "", photos = []) {
  const header = `ได้ครับ รูปของ ${modelName || "นายแบบที่ขอ"} ชุดนี้ผ่านการอนุมัติสำหรับดูแล้วครับ ผมส่งให้ครบทั้งชุดที่อนุมัติสำหรับบัญชีนี้นะครับ ลิงก์แต่ละรูปเปิดดูได้ 1 ครั้งและจะหมดอายุอัตโนมัติครับ`;
  const lines = photos.map((url, index) => `รูป ${index + 1}/${photos.length}\n${url}`);
  const messages = [];
  let current = header;

  for (const line of lines) {
    const candidate = current ? `${current}\n\n${line}` : line;
    if (candidate.length <= 4500) {
      current = candidate;
      continue;
    }
    if (current) messages.push({ type: "text", text: current });
    current = line;
  }
  if (current) messages.push({ type: "text", text: current });

  // LINE reply supports up to five messages. 4500-char packing leaves ample room
  // for ordinary MMD albums while preventing silent truncation.
  return messages.length <= 5 ? messages : [];
}

function perVoiceMessages(result = {}) {
  if (result.status === "ready") {
    const modelName = text(result?.model?.working_name || result?.model?.model_code, 120) || "นายแบบที่ขอ";
    const photos = (Array.isArray(result.photos) ? result.photos : [])
      .map((item) => text(item?.viewer_url, 1200))
      .filter((url) => /^https:\/\/www\.mmdbkk\.com\/api\/member\/app\/private-preview\/view\?g=svip_photo_[A-Za-z0-9-]+#t=/.test(url));
    return photos.length ? packApprovedAlbumMessages(modelName, photos) : [];
  }

  if (result.status === "review_required") {
    return [{
      type: "text",
      text: "เคสนี้ผมขอตรวจให้ก่อนนะครับ เพราะมีเงื่อนไขที่ต้องให้ผมตัดสินใจเองก่อนเปิดรูป เดี๋ยวผมรับเรื่องนี้ต่อจากตรงนี้ครับ",
    }];
  }

  if (result.status === "not_authorized") {
    return [{
      type: "text",
      text: "รูปชุดนี้ยังเปิดให้จากบัญชีนี้ไม่ได้ครับ ผมยังไม่ส่งรูปหรือข้อมูลที่เกินสิทธิ์ออกไปนะครับ",
    }];
  }

  return [];
}

async function sendLineReply(env = {}, replyToken = "", messages = []) {
  const channelToken = text(env.LINE_CHANNEL_ACCESS_TOKEN, 2400);
  if (!channelToken || !replyToken || !messages.length) return { ok: false, error: "reply_not_configured" };
  if (messages.length > 5) return { ok: false, error: "line_reply_message_limit_exceeded" };
  try {
    const response = await fetch(LINE_REPLY_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${channelToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ replyToken, messages }),
    });
    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, status: response.status, error: "line_reply_failed" };
  } catch {
    return { ok: false, status: 0, error: "line_reply_request_failed" };
  }
}

function decisionFor(event = {}, parsed = {}, result = {}, delivery = {}) {
  const dryRun = result.status === "dry_run_ready";
  const review = result.status === "review_required";
  const ready = result.status === "ready";
  const reason = text(result.reason_code, 160) || result.status || "unknown";
  return {
    text: ready ? "approved_photo_reveal_sent" : reason,
    intent: "model_photo_reveal",
    inferred_intent: "model_photo_reveal",
    reply_source: "hype_svip_exact_customer_photo_reveal",
    handoff_required: review || dryRun,
    handoff_reason: review || dryRun ? `model_photo_reveal:${reason}` : "",
    truth_authority: "HYPE_SVIP_PHOTO_REVEAL_V1",
    truth_status: ready ? "verified_photo_gate" : result.status,
    live_truth_used: true,
    live_truth_verified: ready || result.status === "not_authorized",
    operational: {
      phase: "P3_svip_exact_customer_photo_reveal",
      primary_action: dryRun ? "dry_run_owner_receipt" : review ? "handoff_per" : ready ? "send_approved_photo_set" : "deny_photo_reveal",
      model_access_status: result.status,
      requested_model_ref: parsed.query,
      photo_count: Number(result.photo_count || 0),
      line_delivery_status: delivery.ok === true ? "delivered" : "not_delivered",
      photo_only_authority: true,
      sales_authority: false,
      availability_authority: false,
      booking_authority: false,
      payment_authority: false,
    },
  };
}

export async function tryHandleKenjiSvipPhotoRevealRequest(request, env = {}, ctx = null) {
  if (String(request?.method || "GET").toUpperCase() !== "POST") return null;
  const body = await request.clone().json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events : [];
  if (events.length !== 1) return null;
  const event = events[0];
  if (event?.deliveryContext?.isRedelivery === true) return null;
  if (event?.source?.type !== "user" || event?.type !== "message" || event?.message?.type !== "text") return null;

  const parsed = parseKenjiSvipPhotoRevealText(event.message.text);
  const userId = lineUserId(event);
  if (!parsed || !userId) return null;
  if (!enabled(env.LINE_KENJI_AI_ENABLED)) return null;

  const rolloutMode = photoRevealMode(env);
  if (rolloutMode === "off") return null;
  if (["dry_run", "pilot"].includes(rolloutMode) && !await pilotAllows(env, userId)) return null;

  const runtime = await requestKenjiRuntimeStatus(env).catch(() => ({ ok: false }));
  const controls = runtime?.controls || {};
  if (runtime?.ok !== true || controls.all_kenji_mutations === true || controls.line_oa_auto_reply === true) return null;
  if (!enabled(env.LINE_AUTO_REPLY_ENABLED)) return null;

  const result = await callHypePhotoResolver(env, event, parsed.query, { dry_run: rolloutMode === "dry_run" });
  if (rolloutMode === "dry_run") {
    const decision = decisionFor(event, parsed, result, { ok: false });
    return {
      handled: true,
      response: Response.json({
        ok: true,
        route: "line_webhook",
        replied: false,
        suppressed: true,
        kenji_mode: "svip_exact_customer_photo_reveal_dry_run",
        status: result.status,
      }),
      event,
      decision,
      delivered: false,
      attempted: false,
      delivery_status: "dry_run_owner_only",
    };
  }

  const messages = perVoiceMessages(result);
  if (!messages.length) {
    return {
      handled: true,
      response: Response.json({ ok: true, route: "line_webhook", replied: false, suppressed: true, reason: "svip_photo_reveal_unavailable" }),
      event,
      decision: decisionFor(event, parsed, result, { ok: false }),
      delivered: false,
      attempted: false,
      delivery_status: "suppressed",
    };
  }

  const delivery = await sendLineReply(env, text(event.replyToken, 500), messages);
  const decision = decisionFor(event, parsed, result, delivery);
  return {
    handled: true,
    response: Response.json({
      ok: true,
      route: "line_webhook",
      replied: delivery.ok === true,
      kenji_mode: "svip_exact_customer_photo_reveal",
      status: result.status,
    }),
    event,
    decision,
    delivered: delivery.ok === true,
    attempted: true,
    delivery_status: delivery.ok === true ? "delivered" : text(delivery.error, 120) || "failed",
  };
}

export const KENJI_SVIP_PHOTO_REVEAL_INTERNALS = Object.freeze({
  cleanModelQuery,
  photoRevealMode,
  pilotAllows,
  perVoiceMessages,
  packApprovedAlbumMessages,
  sendLineReply,
  decisionFor,
});
