import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import worker from "../src/index.js";
import {
  COMPCARD_PHOTO_PATH,
  COMPCARD_DESTINATIONS_PATH,
  COMPCARD_MAX_PHOTO_BYTES,
} from "../src/compcard-photo.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDDooooA//Z", "base64");
const caption = "MMD PRIVÉ · Book\n180 / 72\nดูรายละเอียดเพิ่มเติม <b>ใน MY MMD</b>";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const ENV = {
  TELEGRAM_BOT_TOKEN: "fixture-bot-token-never-expose",
  AUTH_SERVICE_STUDIO_TO_TELEGRAM: "fixture-studio-secret",
  AUTH_SERVICE_EVENTS_TO_TELEGRAM: "fixture-events-secret",
  INTERNAL_API_TOKEN: "fixture-generic-owner-token",
  AUTH_SERVICE_PAYMENTS_TO_TELEGRAM: "fixture-payment-secret",
  TELEGRAM_PREMIUM_GROUP_ID: "-1001111111111",
  TELEGRAM_STANDARD_GROUP_ID: "-1002222222222",
  TELEGRAM_PREVIEW_CHANNEL_ID: "-1003333333333",
  TELEGRAM_PREVIEW_GROUP_ID: "-1004444444444",
};
const CHAT_IDS = { premium: ENV.TELEGRAM_PREMIUM_GROUP_ID, standard: ENV.TELEGRAM_STANDARD_GROUP_ID, preview: ENV.TELEGRAM_PREVIEW_CHANNEL_ID };

function photoForm(options = {}) {
  const bytes = options.bytes || PNG;
  const form = new FormData();
  form.set("destination", options.destination ?? "premium");
  form.set("expected_chat_id", options.expectedChatId ?? CHAT_IDS[options.destination ?? "premium"] ?? "");
  form.set("caption", options.caption ?? caption);
  form.set("approved_sha256", options.hash ?? sha256(bytes));
  form.set("photo", new Blob([bytes], { type: options.mime || "image/png" }), options.filename || "approved-card.png");
  options.modify?.(form);
  return form;
}

function photoRequest(options = {}) {
  return new Request(`https://telegram-worker.internal${COMPCARD_PHOTO_PATH}`, {
    method: "POST",
    headers: { authorization: `Bearer ${options.token ?? ENV.AUTH_SERVICE_STUDIO_TO_TELEGRAM}`, ...options.headers },
    body: photoForm(options),
  });
}

function destinationsRequest(options = {}) {
  return new Request(`https://telegram-worker.internal${COMPCARD_DESTINATIONS_PATH}${options.query || ""}`, {
    headers: options.headers || { authorization: `Bearer ${options.token ?? ENV.AUTH_SERVICE_STUDIO_TO_TELEGRAM}` },
  });
}

async function invoke(handler, req, env = ENV) {
  assert.equal(handler, req.method === "POST" ? "photo" : "destinations");
  return worker.fetch(req, env);
}

function telegramMock(t, overrides = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const method = String(url).split("/").at(-1);
    assert.ok(String(url).startsWith("https://api.telegram.org/bot"));
    assert.equal(init.redirect, "manual");
    const payload = init.body instanceof FormData ? init.body : JSON.parse(init.body);
    calls.push({ method, payload });
    const configuredId = payload instanceof FormData ? payload.get("chat_id") : payload.chat_id;
    const chat = { id: Number(configuredId), type: overrides.chat_type || (configuredId === CHAT_IDS.preview ? "channel" : "supergroup"), title: "MMD PRIVÉ", username: "MMDPriveTH", permissions: overrides.chat_permissions ?? { can_send_photos: true } };
    if (overrides[method]) return overrides[method]({ payload, chat });
    if (method === "getChat") return Response.json({ ok: true, result: chat });
    if (method === "getMe") return Response.json({ ok: true, result: { id: 777, is_bot: true } });
    if (method === "getChatMember") {
      assert.equal(payload.user_id, 777);
      return Response.json({ ok: true, result: { status: "administrator", can_post_messages: true, user: { id: 777, is_bot: true } } });
    }
    if (method === "sendPhoto") return Response.json({ ok: true, result: { message_id: 851, chat, date: 1792315800, photo: [{ file_unique_id: "fixture-small" }, { file_unique_id: "fixture-large" }] } });
    throw new Error(`unexpected API method ${method}`);
  });
  return calls;
}

test("compcard routes are discoverable and do not accept unintended HTTP methods", async t => {
  const calls = telegramMock(t);
  const health = await worker.fetch(new Request("https://telegram-worker.internal/health"), ENV);
  const body = await health.json();
  assert.deepEqual(body.routes.compcard_photo, [COMPCARD_PHOTO_PATH]);
  assert.deepEqual(body.routes.compcard_destinations, [COMPCARD_DESTINATIONS_PATH]);
  for (const [path, method] of [[COMPCARD_PHOTO_PATH, "GET"], [COMPCARD_DESTINATIONS_PATH, "POST"]]) {
    const response = await worker.fetch(new Request(`https://telegram-worker.internal${path}`, { method }), ENV);
    assert.equal(response.status, 404);
  }
  assert.equal(calls.length, 0);
});

for (const [destination, bytes, mime, token] of [
  ["premium", PNG, "image/png", ENV.AUTH_SERVICE_STUDIO_TO_TELEGRAM],
  ["standard", JPEG, "image/jpeg", ENV.AUTH_SERVICE_EVENTS_TO_TELEGRAM],
  ["preview", PNG, "image/png", ENV.AUTH_SERVICE_EVENTS_TO_TELEGRAM],
]) {
  test(`approved ${mime} sends once to the exact ${destination} destination with a verified receipt`, async t => {
    const calls = telegramMock(t);
    const response = await invoke("photo", photoRequest({ destination, bytes, mime, token, hash: sha256(bytes).toUpperCase(), filename: "../../private-owner-file.png" }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, delivery_state: "sent", destination, approved_sha256: sha256(bytes), message_id: 851, chat_id: CHAT_IDS[destination], chat_type: destination === "preview" ? "channel" : "supergroup", file_unique_id: "fixture-large", telegram_date: 1792315800 });
    assert.deepEqual(calls.map(call => call.method), ["getChat", "getMe", "getChatMember", "sendPhoto"]);
    const sent = calls[3].payload;
    assert.deepEqual([...sent.keys()], ["chat_id", "caption", "photo"]);
    assert.equal(sent.get("chat_id"), CHAT_IDS[destination]);
    assert.equal(sent.get("caption"), caption);
    assert.equal(sent.get("photo").name, mime === "image/png" ? "compcard.png" : "compcard.jpg");
    assert.equal(sha256(Buffer.from(await sent.get("photo").arrayBuffer())), sha256(bytes));
    assert.equal(JSON.stringify(body).includes(ENV.TELEGRAM_BOT_TOKEN), false);
  });
}

test("only Studio and Events service credentials can read or send compcards", async t => {
  const calls = telegramMock(t);
  const failures = [
    { token: "" }, { token: "wrong" }, { token: ENV.INTERNAL_API_TOKEN },
    { token: ENV.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM }, { token: "x".repeat(4097) },
    { headers: { "X-Internal-Token": "conflicting-token" } },
  ];
  for (const options of failures) {
    for (const [handler, req] of [["photo", photoRequest(options)], ["destinations", destinationsRequest(options)]]) {
      const response = await invoke(handler, req);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).delivery_state, "not_sent");
    }
  }
  const noServices = { ...ENV, AUTH_SERVICE_STUDIO_TO_TELEGRAM: "", AUTH_SERVICE_EVENTS_TO_TELEGRAM: "" };
  assert.equal((await invoke("destinations", destinationsRequest(), noServices)).status, 503);
  assert.equal(calls.length, 0);
  const response = await invoke("destinations", destinationsRequest({ query: "?destination=premium", headers: { "X-Internal-Token": ENV.AUTH_SERVICE_EVENTS_TO_TELEGRAM } }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map(call => call.method), ["getChat", "getMe", "getChatMember"]);
});

test("untrusted destinations, URLs, parse modes, duplicate fields, and absent approval never reach Telegram", async t => {
  const calls = telegramMock(t);
  const cases = [
    { destination: "-1009999999999" }, { destination: "PREMIUM" }, { destination: "__proto__" },
    { expectedChatId: "-1009999999999" }, { expectedChatId: CHAT_IDS.standard },
    { expectedChatId: "" }, { modify: form => form.delete("expected_chat_id") },
    { hash: "" }, { hash: "x".repeat(64) }, { hash: "0".repeat(64) },
    { modify: form => form.set("photo", "https://untrusted.test/photo.jpg") },
    { modify: form => form.set("chat_id", "-1009999999999") },
    { modify: form => form.set("parse_mode", "HTML") },
    { modify: form => form.set("caption_entities", "[]") },
    { modify: form => form.set("reply_markup", "{}") },
    { modify: form => form.append("destination", "preview") },
    { modify: form => form.append("photo", new Blob([PNG], { type: "image/png" }), "another.png") },
    { caption: "" }, { caption: "a".repeat(1025) }, { caption: "null\u0000byte" },
  ];
  for (const options of cases) {
    const response = await invoke("photo", photoRequest(options));
    assert.ok([400, 409].includes(response.status), `expected rejection for ${JSON.stringify(options)}`);
    assert.equal((await response.json()).delivery_state, "not_sent");
  }
  assert.equal(calls.length, 0);
});

test("photo MIME, bytes, dimensions, aspect ratio, and size are checked before any API request", async t => {
  const calls = telegramMock(t);
  const dimensions = (width, height) => { const bytes = Buffer.from(PNG); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20); return bytes; };
  const cases = [
    { bytes: Buffer.from("html pretending to be PNG") },
    { bytes: PNG, mime: "image/jpeg" }, { bytes: JPEG, mime: "image/png" },
    { bytes: PNG, mime: "image/svg+xml" }, { bytes: Buffer.alloc(0) },
    { bytes: PNG.subarray(0, 20) }, { bytes: JPEG.subarray(0, 10), mime: "image/jpeg" },
    { bytes: dimensions(0, 1) }, { bytes: dimensions(5001, 5000) }, { bytes: dimensions(21, 1) },
    { bytes: Buffer.alloc(COMPCARD_MAX_PHOTO_BYTES + 1) },
  ];
  for (const options of cases) {
    const response = await invoke("photo", photoRequest(options));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).delivery_state, "not_sent");
  }
  assert.equal(calls.length, 0);
});

test("chunked multipart cannot bypass the request byte limit", async t => {
  const calls = telegramMock(t);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(COMPCARD_MAX_PHOTO_BYTES + 65_537)); controller.close(); } });
  const req = new Request(`https://telegram-worker.internal${COMPCARD_PHOTO_PATH}`, {
    method: "POST", duplex: "half",
    headers: { authorization: `Bearer ${ENV.AUTH_SERVICE_EVENTS_TO_TELEGRAM}`, "content-type": "multipart/form-data; boundary=oversized" }, body: stream,
  });
  const response = await invoke("photo", req);
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test("missing and colliding canonical bindings fail without historical IDs or Preview-group fallbacks", async t => {
  const calls = telegramMock(t);
  for (const env of [
    { ...ENV, TELEGRAM_PREVIEW_CHANNEL_ID: "" },
    { ...ENV, TELEGRAM_PREVIEW_CHANNEL_ID: "@MMDPriveTH" },
    { ...ENV, TELEGRAM_PREVIEW_CHANNEL_ID: ENV.TELEGRAM_PREMIUM_GROUP_ID },
    { ...ENV, TELEGRAM_PREVIEW_CHANNEL_ID: "-1009007199254740993" },
  ]) {
    const response = await invoke("photo", photoRequest({ destination: "preview" }), env);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).delivery_state, "not_sent");
  }
  assert.equal(calls.length, 0);
});

for (const [name, change] of [
  ["different numeric ID", chat => ({ ...chat, id: -1009999999999 })],
  ["linked Preview discussion group", chat => ({ ...chat, type: "supergroup", linked_chat_id: Number(CHAT_IDS.preview) })],
  ["private chat", chat => ({ ...chat, type: "private" })],
]) {
  test(`Preview preflight rejects ${name} before sending`, async t => {
    const calls = telegramMock(t, { getChat: ({ chat }) => Response.json({ ok: true, result: change(chat) }) });
    const response = await invoke("photo", photoRequest({ destination: "preview" }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).delivery_state, "not_sent");
    assert.deepEqual(calls.map(call => call.method), ["getChat"]);
  });
}

test("destination readback is authenticated, read only, and returns only verified room identities", async t => {
  const calls = telegramMock(t, { getChat: ({ chat }) => Response.json({ ok: true, result: { ...chat, pinned_message: { text: "private unrelated history" }, invite_link: "https://secret-invite.example" } }) });
  const response = await invoke("destinations", destinationsRequest());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.read_only, true);
  assert.equal(body.delivery_state, "not_sent");
  assert.deepEqual(body.destinations.map(({ destination, chat_id }) => [destination, chat_id]), Object.entries(CHAT_IDS));
  assert.deepEqual(calls.map(call => call.method), Array(3).fill(["getChat", "getMe", "getChatMember"]).flat());
  assert.ok(body.destinations.every(item => item.identity_verified && item.can_send_photo && item.bot_status === "administrator"));
  assert.doesNotMatch(JSON.stringify(body), /private unrelated history|secret-invite|fixture-bot-token/);
  for (const query of ["?destination=unknown", "?destination=preview&destination=premium", "?chat_id=-1009999999999"]) {
    assert.equal((await invoke("destinations", destinationsRequest({ query }))).status, 400);
  }
  assert.equal(calls.length, 9);
});

test("preflight network failure is not_sent and redacts URL-containing errors", async t => {
  const calls = telegramMock(t, { getChat: () => { throw new Error(`https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/getChat`); } });
  const response = await invoke("photo", photoRequest());
  const body = await response.json();
  assert.equal(body.delivery_state, "not_sent");
  assert.doesNotMatch(JSON.stringify(body), /fixture-bot-token|api\.telegram\.org/);
  assert.deepEqual(calls.map(call => call.method), ["getChat"]);
});

for (const errorCode of [400, 403, 429]) {
  test(`explicit Telegram ${errorCode} rejection remains not_sent and never retries`, async t => {
    const calls = telegramMock(t, { sendPhoto: () => Response.json({ ok: false, error_code: errorCode, description: ENV.TELEGRAM_BOT_TOKEN, parameters: { retry_after: 30 } }, { status: errorCode }) });
    const response = await invoke("photo", photoRequest());
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.delivery_state, "not_sent");
    assert.equal(body.telegram_error_code, errorCode);
    assert.equal(body.retry_after_seconds, errorCode === 429 ? 30 : undefined);
    assert.doesNotMatch(JSON.stringify(body), /fixture-bot-token/);
    assert.deepEqual(calls.map(call => call.method), ["getChat", "getMe", "getChatMember", "sendPhoto"]);
  });
}

for (const [name, result] of [
  ["network exception", () => { throw new Error(`request timed out at https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendPhoto`); }],
  ["non-JSON response", () => new Response("gateway failure", { status: 502 })],
  ["HTTP 500", () => Response.json({ ok: false, error_code: 500 }, { status: 500 })],
  ["missing message ID", ({ chat }) => Response.json({ ok: true, result: { chat, photo: [{}] } })],
  ["different receipt chat", ({ chat }) => Response.json({ ok: true, result: { message_id: 1, chat: { ...chat, id: -1009999999999 }, photo: [{}] } })],
  ["non-photo receipt", ({ chat }) => Response.json({ ok: true, result: { message_id: 1, chat } })],
]) {
  test(`${name} after sendPhoto is delivery_uncertain, never retried or reported as success`, async t => {
    const calls = telegramMock(t, { sendPhoto: result });
    const response = await invoke("photo", photoRequest());
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.delivery_state, "delivery_uncertain");
    assert.doesNotMatch(JSON.stringify(body), /fixture-bot-token|api\.telegram\.org/);
    assert.deepEqual(calls.map(call => call.method), ["getChat", "getMe", "getChatMember", "sendPhoto"]);
  });
}

for (const [destination, type, status, permissions, allowed] of [
  ["premium", "channel", "administrator", { can_post_messages: true }, true],
  ["standard", "channel", "administrator", { can_post_messages: true }, true],
  ["preview", "channel", "administrator", { can_post_messages: false }, false],
  ["preview", "channel", "member", { can_post_messages: true }, false],
  ["preview", "channel", "creator", {}, true],
  ["premium", "supergroup", "member", {}, true],
  ["standard", "group", "restricted", { is_member: true, can_send_photos: true }, true],
  ["standard", "group", "restricted", { is_member: false, can_send_photos: true }, false],
  ["premium", "supergroup", "kicked", {}, false],
]) {
  test(`${destination} ${type} ${status} requires verified photo-posting permission (${allowed})`, async t => {
    const calls = telegramMock(t, {
      chat_type: type,
      getChatMember: () => Response.json({ ok: true, result: { status, user: { id: 777, is_bot: true }, ...permissions } }),
    });
    const response = await invoke("photo", photoRequest({ destination }));
    const body = await response.json();
    assert.equal(body.ok, allowed);
    assert.equal(body.delivery_state, allowed ? "sent" : "not_sent");
    assert.equal(calls.filter(call => call.method === "sendPhoto").length, allowed ? 1 : 0);
    if (!allowed) {
      assert.equal(body.identity_verified, true);
      assert.equal(body.can_send_photo, false);
      assert.equal(body.chat_id, CHAT_IDS[destination]);
    }
  });
}

test("group default restrictions and mismatched bot identities block delivery", async t => {
  for (const overrides of [
    { chat_permissions: { can_send_photos: false }, getChatMember: () => Response.json({ ok: true, result: { status: "member", user: { id: 777, is_bot: true } } }) },
    { getMe: () => Response.json({ ok: true, result: { id: 777, is_bot: false } }) },
    { getChatMember: () => Response.json({ ok: true, result: { status: "administrator", can_post_messages: true, user: { id: 999, is_bot: true } } }) },
  ]) {
    const calls = telegramMock(t, overrides);
    const response = await invoke("photo", photoRequest());
    const body = await response.json();
    assert.equal(body.delivery_state, "not_sent");
    assert.equal(body.identity_verified, true);
    assert.equal(calls.some(call => call.method === "sendPhoto"), false);
    t.mock.restoreAll();
  }
});

