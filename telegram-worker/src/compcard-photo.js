import { HttpError, json } from "../lib/http.js";

export const COMPCARD_PHOTO_PATH = "/telegram/internal/compcard/photo";
export const COMPCARD_TEXT_PATH = "/telegram/internal/compcard/text";
export const COMPCARD_DESTINATIONS_PATH = "/telegram/internal/compcard/destinations";
export const COMPCARD_MAX_PHOTO_BYTES = 10_000_000;
const MAX_FORM_BYTES = COMPCARD_MAX_PHOTO_BYTES + 65_536;
const MAX_TOKEN_LENGTH = 4096;
const DESTINATIONS = Object.freeze({
  premium: { binding: "TELEGRAM_PREMIUM_GROUP_ID", types: ["group", "supergroup", "channel"] },
  standard: { binding: "TELEGRAM_STANDARD_GROUP_ID", types: ["group", "supergroup", "channel"] },
  // Public compcards belong in the channel, never the linked discussion group.
  preview: { binding: "TELEGRAM_PREVIEW_CHANNEL_ID", types: ["channel"] },
});

function reject(status, error) {
  throw new HttpError(status, { ok: false, delivery_state: "not_sent", error });
}

function timingSafeEqual(left, right) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < MAX_TOKEN_LENGTH; index++) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function requireCompcardServiceToken(req, env) {
  const accepted = [env.AUTH_SERVICE_STUDIO_TO_TELEGRAM, env.AUTH_SERVICE_EVENTS_TO_TELEGRAM]
    .map(value => String(value || "").trim()).filter(value => value && value.length <= MAX_TOKEN_LENGTH);
  if (!accepted.length) reject(503, "compcard_service_not_configured");
  const direct = req.headers.get("X-Internal-Token") || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") || "")?.[1] || "";
  const provided = direct || bearer;
  if (!provided || provided.length > MAX_TOKEN_LENGTH || (direct && bearer && direct !== bearer)) reject(403, "internal_token_required");
  let match = 0;
  for (const expected of accepted) match |= Number(timingSafeEqual(provided, expected));
  if (!match) reject(403, "internal_token_required");
}

function numericChatId(value) {
  const id = String(value ?? "").trim();
  return /^-[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id)) ? id : "";
}

function configuredDestination(destination, env) {
  const spec = Object.hasOwn(DESTINATIONS, destination) ? DESTINATIONS[destination] : null;
  if (!spec) return { ok: false, error: "invalid_compcard_destination" };
  const chatId = numericChatId(env[spec.binding]);
  if (!chatId) return { ok: false, destination, error: "compcard_destination_not_configured" };
  if (Object.entries(DESTINATIONS).some(([key, other]) => key !== destination && numericChatId(env[other.binding]) === chatId)) {
    return { ok: false, destination, error: "compcard_destination_conflict" };
  }
  return { ok: true, destination, chat_id: chatId, types: spec.types };
}

async function readBoundedBody(body, maximum) {
  if (!body) reject(400, "missing_compcard_body");
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel().catch(() => {});
        reject(413, "compcard_body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks);
}

function imageDimensions(bytes, mime) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 33 || !signature.every((value, index) => bytes[index] === value)
        || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime !== "image/jpeg" || bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) return null;
      return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    }
    offset += length;
  }
  return null;
}

async function readApprovedPhoto(req, env) {
  const contentType = req.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) reject(415, "compcard_multipart_required");
  const declared = req.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_FORM_BYTES)) reject(413, "compcard_body_too_large");
  let form;
  try {
    const body = await readBoundedBody(req.body, MAX_FORM_BYTES);
    form = await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    reject(400, "invalid_compcard_form");
  }
  const allowed = new Set(["destination", "photo", "caption", "approved_sha256", "expected_chat_id"]);
  for (const key of form.keys()) {
    if (!allowed.has(key) || form.getAll(key).length !== 1) reject(400, "unexpected_compcard_field");
  }
  const destination = form.get("destination");
  if (typeof destination !== "string" || !Object.hasOwn(DESTINATIONS, destination)) reject(400, "invalid_compcard_destination");
  const target = configuredDestination(destination, env);
  if (!target.ok) reject(503, target.error);
  const expectedChatId = form.get("expected_chat_id");
  if (typeof expectedChatId !== "string" || numericChatId(expectedChatId) !== expectedChatId) reject(400, "expected_compcard_chat_id_required");
  if (expectedChatId !== target.chat_id) reject(409, "compcard_destination_changed");
  const rawCaption = form.get("caption");
  // Multipart encoders normalize line endings to CRLF; keep the approved caption
  // equivalent across transports and count the text Telegram will actually receive.
  const caption = typeof rawCaption === "string" ? rawCaption.replace(/\r\n?/g, "\n") : rawCaption;
  if (typeof caption !== "string" || !caption.trim() || caption.length > 1024 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(caption)) {
    reject(400, "invalid_compcard_caption");
  }
  const approvedSha256 = form.get("approved_sha256");
  if (typeof approvedSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(approvedSha256)) reject(400, "approved_compcard_sha256_required");
  const photo = form.get("photo");
  if (!photo || typeof photo.arrayBuffer !== "function" || !["image/png", "image/jpeg"].includes(photo.type)
      || photo.size < 1 || photo.size > COMPCARD_MAX_PHOTO_BYTES) reject(400, "invalid_compcard_photo");
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const dimensions = imageDimensions(bytes, photo.type);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1
      || dimensions.width + dimensions.height > 10000
      || Math.max(dimensions.width, dimensions.height) / Math.min(dimensions.width, dimensions.height) > 20) {
    reject(400, "invalid_compcard_image_dimensions");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (sha256 !== approvedSha256.toLowerCase()) reject(409, "approved_compcard_sha256_mismatch");
  return { destination, expectedChatId, caption, bytes, mime: photo.type, sha256 };
}

async function readApprovedText(req, env) {
  const contentType = req.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) reject(415, "compcard_json_required");
  const declared = req.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 65_536)) reject(413, "compcard_body_too_large");
  let body;
  try {
    const bounded = await readBoundedBody(req.body, 65_536);
    body = JSON.parse(await bounded.text());
  } catch (error) {
    if (error instanceof HttpError) throw error;
    reject(400, "invalid_compcard_json");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) reject(400, "invalid_compcard_json");
  const allowed = new Set(["destination", "expected_chat_id", "text", "approved_sha256"]);
  if (Object.keys(body).some(key => !allowed.has(key))) reject(400, "unexpected_compcard_field");
  const destination = body.destination;
  if (typeof destination !== "string" || !Object.hasOwn(DESTINATIONS, destination)) reject(400, "invalid_compcard_destination");
  const target = configuredDestination(destination, env);
  if (!target.ok) reject(503, target.error);
  const expectedChatId = body.expected_chat_id;
  if (typeof expectedChatId !== "string" || numericChatId(expectedChatId) !== expectedChatId) reject(400, "expected_compcard_chat_id_required");
  if (expectedChatId !== target.chat_id) reject(409, "compcard_destination_changed");
  const text = typeof body.text === "string" ? body.text.replace(/\r\n?/g, "\n") : body.text;
  if (typeof text !== "string" || !text.trim() || text.length > 4096 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    reject(400, "invalid_compcard_text");
  }
  const bytes = new TextEncoder().encode(text);
  // TextEncoder replaces unpaired surrogates. Reject such input rather than
  // approving different JSON text that happens to encode to the same bytes.
  if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) !== text) reject(400, "invalid_compcard_text");
  if (typeof body.approved_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(body.approved_sha256)) reject(400, "approved_compcard_sha256_required");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (sha256 !== body.approved_sha256.toLowerCase()) reject(409, "approved_compcard_sha256_mismatch");
  return { destination, expectedChatId, text, sha256 };
}

async function telegramRequest(env, method, body) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return { available: false, error: "telegram_bot_not_configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body),
      redirect: "error",
      signal: controller.signal,
    });
    const bounded = await readBoundedBody(response.body, 262_144);
    const data = JSON.parse(await bounded.text());
    return { available: true, http_ok: response.ok, status: response.status, data };
  } catch {
    // Never return fetch errors: they can contain the bot-token URL.
    return { available: true, error: "telegram_response_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyDestination(destination, env) {
  const target = configuredDestination(destination, env);
  if (!target.ok) return target;
  const response = await telegramRequest(env, "getChat", { chat_id: target.chat_id });
  const chat = response.data?.result;
  if (!response.http_ok || response.data?.ok !== true) {
    return { ok: false, destination, error: response.error || "compcard_destination_lookup_failed" };
  }
  if (numericChatId(chat?.id) !== target.chat_id || !target.types.includes(chat?.type)) {
    return { ok: false, destination, error: "compcard_destination_identity_mismatch" };
  }
  const identity = {
    ok: true,
    destination,
    chat_id: target.chat_id,
    chat_type: chat.type,
    title: typeof chat.title === "string" ? chat.title.slice(0, 256) : null,
    username: typeof chat.username === "string" ? chat.username.slice(0, 64) : null,
    identity_verified: true,
  };
  const bot = await telegramRequest(env, "getMe", {});
  const botId = bot.data?.result?.id;
  if (!bot.http_ok || bot.data?.ok !== true || bot.data?.result?.is_bot !== true || !Number.isSafeInteger(botId) || botId < 1) {
    return { ...identity, ok: false, can_send_photo: false, error: "compcard_bot_identity_unverified" };
  }
  const member = await telegramRequest(env, "getChatMember", { chat_id: target.chat_id, user_id: botId });
  const membership = member.data?.result;
  if (!member.http_ok || member.data?.ok !== true || membership?.user?.id !== botId || membership?.user?.is_bot !== true) {
    return { ...identity, ok: false, can_send_photo: false, error: "compcard_bot_membership_unverified" };
  }
  const role = membership.status;
  const canSendPhoto = chat.type === "channel"
    ? role === "creator" || (role === "administrator" && membership.can_post_messages === true)
    : ["creator", "administrator"].includes(role)
      || (role === "member" && chat.permissions?.can_send_photos === true)
      || (role === "restricted" && membership.is_member === true && membership.can_send_photos === true);
  return {
    ...identity,
    ok: canSendPhoto,
    can_send_photo: canSendPhoto,
    bot_status: ["creator", "administrator", "member", "restricted", "left", "kicked"].includes(role) ? role : null,
    ...(!canSendPhoto ? { error: "compcard_bot_send_permission_missing" } : {}),
  };
}

export async function handleCompcardDestinations(req, env) {
  requireCompcardServiceToken(req, env);
  const url = new URL(req.url);
  if ([...url.searchParams.keys()].some(key => key !== "destination") || url.searchParams.getAll("destination").length > 1) {
    reject(400, "invalid_compcard_destination_query");
  }
  const selected = url.searchParams.get("destination");
  if (selected !== null && !Object.hasOwn(DESTINATIONS, selected)) reject(400, "invalid_compcard_destination");
  const destinations = [];
  for (const destination of selected === null ? Object.keys(DESTINATIONS) : [selected]) {
    destinations.push(await verifyDestination(destination, env));
  }
  const ok = destinations.every(item => item.ok);
  return json({ ok, read_only: true, delivery_state: "not_sent", destinations }, ok ? 200 : 503);
}

export async function handleCompcardPhoto(req, env) {
  requireCompcardServiceToken(req, env);
  const input = await readApprovedPhoto(req, env);
  const target = await verifyDestination(input.destination, env);
  if (!target.ok) return json({ ...target, delivery_state: "not_sent" }, 503);
  if (target.chat_id !== input.expectedChatId) return json({ ok: false, delivery_state: "not_sent", error: "compcard_destination_changed" }, 409);
  const form = new FormData();
  form.set("chat_id", target.chat_id);
  form.set("caption", input.caption);
  form.set("photo", new Blob([input.bytes], { type: input.mime }), `compcard.${input.mime === "image/png" ? "png" : "jpg"}`);
  // Captions are plain text. Do not accept parse_mode, reply markup, or caller chat IDs.
  const response = await telegramRequest(env, "sendPhoto", form);
  const failure = { ok: false, destination: input.destination, approved_sha256: input.sha256 };
  if (!response.available) return json({ ...failure, delivery_state: "not_sent", error: response.error }, 503);
  const errorCode = response.data?.error_code;
  if (response.status < 500 && response.data?.ok === false && Number.isInteger(errorCode) && errorCode >= 400 && errorCode < 500) {
    const retryAfter = response.data?.parameters?.retry_after;
    return json({
      ...failure,
      delivery_state: "not_sent",
      error: "telegram_rejected_compcard",
      telegram_error_code: errorCode,
      ...(errorCode === 429 && Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 86400 ? { retry_after_seconds: retryAfter } : {}),
    }, 502);
  }
  const message = response.data?.result;
  const photos = Array.isArray(message?.photo) ? message.photo : [];
  if (!response.http_ok || response.data?.ok !== true || !Number.isSafeInteger(message?.message_id) || message.message_id < 1
      || numericChatId(message?.chat?.id) !== target.chat_id || message?.chat?.type !== target.chat_type || !photos.length) {
    // Telegram has no idempotency key for sendPhoto. The caller must journal uncertainty
    // and avoid retrying blindly when a request may already have produced a message.
    return json({ ...failure, delivery_state: "delivery_uncertain", error: "compcard_delivery_receipt_unverified" }, 502);
  }
  const uniqueId = photos.at(-1)?.file_unique_id;
  return json({
    ok: true,
    delivery_state: "sent",
    destination: input.destination,
    approved_sha256: input.sha256,
    message_id: message.message_id,
    chat_id: target.chat_id,
    chat_type: target.chat_type,
    file_unique_id: typeof uniqueId === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(uniqueId) ? uniqueId : null,
    telegram_date: Number.isSafeInteger(message.date) && message.date > 0 ? message.date : null,
  });
}

export async function handleCompcardText(req, env) {
  requireCompcardServiceToken(req, env);
  const input = await readApprovedText(req, env);
  const target = await verifyDestination(input.destination, env);
  if (!target.ok) return json({ ...target, delivery_state: "not_sent" }, 503);
  if (target.chat_id !== input.expectedChatId) return json({ ok: false, delivery_state: "not_sent", error: "compcard_destination_changed" }, 409);
  const response = await telegramRequest(env, "sendMessage", {
    chat_id: target.chat_id,
    text: input.text,
    link_preview_options: { is_disabled: true },
  });
  const failure = { ok: false, destination: input.destination, approved_sha256: input.sha256 };
  if (!response.available) return json({ ...failure, delivery_state: "not_sent", error: response.error }, 503);
  const errorCode = response.data?.error_code;
  if (response.status < 500 && response.data?.ok === false && Number.isInteger(errorCode) && errorCode >= 400 && errorCode < 500) {
    const retryAfter = response.data?.parameters?.retry_after;
    return json({
      ...failure,
      delivery_state: "not_sent",
      error: "telegram_rejected_compcard",
      telegram_error_code: errorCode,
      ...(errorCode === 429 && Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 86400 ? { retry_after_seconds: retryAfter } : {}),
    }, 502);
  }
  const message = response.data?.result;
  if (!response.http_ok || response.data?.ok !== true || !Number.isSafeInteger(message?.message_id) || message.message_id < 1
      || numericChatId(message?.chat?.id) !== target.chat_id || message?.chat?.type !== target.chat_type || message?.text !== input.text) {
    return json({ ...failure, delivery_state: "delivery_uncertain", error: "compcard_delivery_receipt_unverified" }, 502);
  }
  return json({
    ok: true,
    delivery_state: "sent",
    destination: input.destination,
    approved_sha256: input.sha256,
    message_id: message.message_id,
    chat_id: target.chat_id,
    chat_type: target.chat_type,
    telegram_date: Number.isSafeInteger(message.date) && message.date > 0 ? message.date : null,
  });
}
