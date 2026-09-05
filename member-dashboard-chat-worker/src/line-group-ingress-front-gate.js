import currentWorker from "./front-gate-index.js";
export { KenjiModelIdempotency } from "./front-gate-index.js";

const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/"]);

function asString(value) {
  return String(value || "").trim();
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function timingSafeStringEqual(a, b) {
  const left = asString(a);
  const right = asString(b);
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function createLineSignature(rawBody, channelSecret) {
  const secret = asString(channelSecret);
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

async function verifyLineSignature(rawBody, signature, channelSecret) {
  const expected = await createLineSignature(rawBody, channelSecret);
  return timingSafeStringEqual(expected, signature);
}

function sourceType(event = {}) {
  const type = asString(event?.source?.type).toLowerCase();
  return ["user", "group", "room"].includes(type) ? type : "unknown";
}

function messageType(event = {}) {
  if (event?.type !== "message") return "none";
  return asString(event?.message?.type).toLowerCase() || "unknown";
}

async function observeSignedGroupEvents(request, env = {}) {
  const rawBody = await request.text();
  const signature = asString(request.headers.get("x-line-signature"));
  const valid = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);
  if (!valid) {
    console.log(JSON.stringify({ line_group_ingress: "signature_rejected" }));
    return;
  }

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    console.log(JSON.stringify({ line_group_ingress: "invalid_json" }));
    return;
  }

  const events = Array.isArray(body.events) ? body.events : [];
  for (const event of events) {
    if (sourceType(event) !== "group") continue;

    // Diagnostics only. The canonical core LINE handler already owns Console
    // Inbox persistence for every accepted event. Writing here as well created
    // a race (lookup-then-create in two independent paths) and produced duplicate
    // rows for the same stable LINE message id. Keep this gate read-only so the
    // core handler is the single persistence owner.
    console.log(JSON.stringify({
      line_group_ingress: "observed",
      event_type: asString(event?.type).toLowerCase() || "unknown",
      message_type: messageType(event),
      group_source_present: Boolean(asString(event?.source?.groupId)),
      user_source_present: Boolean(asString(event?.source?.userId)),
      stable_event_present: Boolean(asString(event?.message?.id || event?.webhookEventId)),
      redelivered: event?.deliveryContext?.isRedelivery === true,
      persistence_owner: "core_line_handler",
    }));
  }
}

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    const isLineWebhook = request.method === "POST" && LINE_WEBHOOK_PATHS.has(url.pathname);
    const observerRequest = isLineWebhook ? request.clone() : null;

    const response = await currentWorker.fetch(request, env, ctx);

    if (observerRequest && response.ok) {
      const work = observeSignedGroupEvents(observerRequest, env).catch(() => {
        console.log(JSON.stringify({ line_group_ingress: "observer_failed" }));
      });
      if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
      else await work;
    }

    return response;
  },
};
