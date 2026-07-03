const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const WORKER_NAME = "member-dashboard-chat-worker";
const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);

const PUBLIC_MENU_TEXT = [
  "MMD Member Help",
  "Open the member area from the official MMD link.",
  "Payment proof is supporting evidence only until MMD completes official verification.",
  "Dashboard and private actions stay locked until trusted worker state allows them.",
].join("\n");

const LINE_ACK_TEXT = [
  "รับข้อความแล้วครับ Kenji ส่งเข้าระบบ MMD แล้ว",
  "ถ้าเป็นเรื่องจองงาน สลิป VIP Black Card หรือข้อมูลส่วนตัว จะให้ Per / owner ตรวจสอบก่อนตอบยืนยันครับ",
].join("\n");

const PRIVATE_MARKERS = [
  /airtable/gi,
  /record[_\s-]?id/gi,
  /secret/gi,
  /token/gi,
  /authorization/gi,
  /bearer/gi,
  /payment[_\s-]?internal/gi,
  /risk[_\s-]?flag/gi,
  /vip|svip|black\s*card/gi,
  /session[_\s-]?internal/gi,
  /telegram|gmail|r2|kv/gi,
];

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": WORKER_NAME,
    },
  });
}

function asString(value) {
  return String(value || "").trim();
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(asString(value).toLowerCase());
}

function hasTrustedEvent(input = {}, request = null) {
  const header = asString(request?.headers?.get("X-MMD-Trusted-Event")).toLowerCase();
  return input.trusted_event === true || header === "true" || header === "1";
}

function getBearerToken(request = null) {
  const auth = asString(request?.headers?.get("Authorization"));
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return asString(match?.[1]);
}

function hasInternalAuth(request = null, env = {}) {
  const bearer = getBearerToken(request);
  const confirmKey = asString(request?.headers?.get("X-Confirm-Key"));
  const expectedInternalToken = asString(env.INTERNAL_TOKEN);
  const expectedConfirmKey = asString(env.CONFIRM_KEY);

  return Boolean(
    (expectedInternalToken && bearer && bearer === expectedInternalToken) ||
      (expectedConfirmKey && confirmKey && confirmKey === expectedConfirmKey),
  );
}

function sanitizeLineText(value) {
  let text = asString(value);
  for (const marker of PRIVATE_MARKERS) text = text.replace(marker, "[redacted]");
  text = text.replace(/rec[a-zA-Z0-9]{10,}/g, "[redacted]");
  text = text.replace(/pat[a-zA-Z0-9._-]{10,}/g, "[redacted]");
  return text.slice(0, 1600);
}

export function getLineUserId(input = {}) {
  const candidates = [
    input.line_user_id,
    input.lineUserId,
    input.user_id,
    input.userId,
    input.event?.source?.userId,
    input.source?.userId,
  ];

  for (const candidate of candidates) {
    const value = asString(candidate);
    if (/^U[a-f0-9]{32}$/i.test(value)) return value;
  }

  return "";
}

export async function deliverLineText(env = {}, lineUserId, text, options = {}) {
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  const to = asString(lineUserId);
  const safeText = sanitizeLineText(text);

  if (!options.trusted_event) return { ok: false, error: "trusted_event_required" };
  if (!token) return { ok: false, error: "line_token_missing" };
  if (!to) return { ok: false, error: "line_user_id_missing" };
  if (!safeText) return { ok: false, error: "line_text_missing" };

  const response = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text: safeText }],
    }),
  });

  if (!response.ok) {
    return { ok: false, error: "line_push_failed", status: response.status };
  }

  return { ok: true, status: response.status };
}

export async function deliverLinePublicMenu(env = {}, lineUserId, options = {}) {
  return deliverLineText(env, lineUserId, PUBLIC_MENU_TEXT, options);
}

export async function pushLinePublicMenu(input = {}, env = {}, request = null) {
  const trusted = hasTrustedEvent(input, request);
  if (!trusted) return { ok: false, error: "trusted_event_required" };

  const lineUserId = getLineUserId(input);
  if (!lineUserId) return { ok: false, error: "line_user_id_missing" };

  return deliverLinePublicMenu(env, lineUserId, { trusted_event: true });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return null;
  }
}

async function handleLineWebhook(request, env) {
  const body = await readJson(request);
  if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_json" }, 400);

  const events = Array.isArray(body.events) ? body.events : [];
  const replyEnabled = isEnabled(env.LINE_PUBLIC_ACK_ENABLED) || isEnabled(env.LINE_AUTO_REPLY_ENABLED);
  const results = [];

  for (const event of events) {
    const lineUserId = getLineUserId({ event });
    if (!replyEnabled) {
      results.push({ ok: true, skipped: "reply_disabled", line_user: Boolean(lineUserId) });
      continue;
    }

    if (event?.type === "message" && event.message?.type === "text" && lineUserId) {
      results.push(await deliverLineText(env, lineUserId, LINE_ACK_TEXT, { trusted_event: true }));
    } else {
      results.push({ ok: true, skipped: "unsupported_event", line_user: Boolean(lineUserId) });
    }
  }

  return json({ ok: true, worker: WORKER_NAME, route: "line_webhook", events: events.length, reply_enabled: replyEnabled, results });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, worker: WORKER_NAME });
    }

    if (request.method === "GET" && LINE_WEBHOOK_PATHS.has(url.pathname)) {
      return json({ ok: true, worker: WORKER_NAME, route: "line_webhook" });
    }

    if (request.method === "POST" && LINE_WEBHOOK_PATHS.has(url.pathname)) {
      return handleLineWebhook(request, env);
    }

    if (request.method === "POST" && url.pathname === "/v1/internal/line/public-menu-fallback") {
      if (!hasInternalAuth(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);

      const body = await readJson(request);
      if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_json" }, 400);

      const result = await pushLinePublicMenu(body, env, request);
      return json(result, result.ok ? 200 : 400);
    }

    return json({ ok: false, error: "not_found" }, 404);
  },
};
