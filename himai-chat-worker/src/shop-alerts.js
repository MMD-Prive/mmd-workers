const ALLOWED_SHOPS = new Set(["himai-shop", "mmd-shop"]);
const ALLOWED_ACTIONS = new Set(["shop_owner", "line_order", "product_interest"]);

export async function handleShopAlert(request, env) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);

  if (request.method === "OPTIONS" && isAlertPath(path)) {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== "POST" || !isAlertPath(path)) return null;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const inferredShop = path.startsWith("/mmd-shop/") ? "mmd-shop" : "himai-shop";
  const shop = clean(body.shop_source || inferredShop).toLowerCase();
  if (!ALLOWED_SHOPS.has(shop)) return json({ ok: false, error: "invalid_shop_source" }, 400);

  const action = clean(body.action || "shop_owner").toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) return json({ ok: false, error: "invalid_action" }, 400);

  const eventId = clean(body.event_id) || crypto.randomUUID();
  const productName = clean(body.product_name);
  const sku = clean(body.sku);
  const price = numberOrNull(body.price_thb ?? body.selling_price_thb);
  const route = clean(body.route || body.source_path || (shop === "mmd-shop" ? "/mmd-shop" : "/shop"));
  const occurredAt = clean(body.occurred_at) || new Date().toISOString();

  const text = buildTelegramText({
    shop,
    action,
    eventId,
    productName,
    sku,
    price,
    route,
    occurredAt
  });

  const telegram = await sendShopAlertToTelegram(env, shop, text);

  return json({
    ok: telegram.ok === true,
    event_id: eventId,
    shop_source: shop,
    action,
    telegram
  }, telegram.ok === true ? 200 : 502);
}

function isAlertPath(path) {
  return path === "/shop/api/alerts/interest" || path === "/mmd-shop/api/alerts/interest";
}

function buildTelegramText(input) {
  const shopLabel = input.shop === "mmd-shop" ? "🛍️ MMD SHOP" : "💊 HIMAI SHOP";
  const actionLabel = input.action === "line_order"
    ? "ลูกค้ากดสั่งผ่าน LINE"
    : input.action === "product_interest"
      ? "ลูกค้าสนใจสินค้า"
      : "ลูกค้ากดคุยกับ Shop Owner";

  const lines = [
    `${shopLabel} · NEW WEB INTEREST`,
    actionLabel,
    "",
    `สินค้า: ${input.productName || "General Shop Inquiry"}`,
    `SKU: ${input.sku || "-"}`,
    `ราคา: ${input.price == null ? "สอบถามราคา" : `฿${input.price.toLocaleString("th-TH")}`}`,
    `หน้า: ${input.route}`,
    `เวลา: ${input.occurredAt}`,
    `Event: ${input.eventId}`,
    "",
    "Action: ตรวจสอบ stock และรอลูกค้าทักเข้าช่องทางร้าน"
  ];

  return lines.join("\n");
}

async function sendShopAlertToTelegram(env, shop, text) {
  const botToken = clean(env.TELEGRAM_BOT_TOKEN);
  if (!botToken) return { ok: false, skipped: true, reason: "missing_telegram_bot_token" };

  const chatId = shop === "mmd-shop"
    ? clean(env.TELEGRAM_MMD_SHOP_ALERTS_CHAT_ID)
    : clean(env.TELEGRAM_HIMAI_SHOP_ALERTS_CHAT_ID);

  if (!chatId) return { ok: false, skipped: true, reason: "missing_shop_alert_chat_id" };

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    return { ok: false, status: response.status, error: data || null };
  }

  return { ok: true, result: data?.result || null };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizePath(path = "") {
  const value = String(path || "/").replace(/\/{2,}/g, "/");
  return value.length > 1 ? value.replace(/\/$/, "") : value;
}

function clean(value) {
  return String(value ?? "").trim();
}

function corsHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders()
  });
}
