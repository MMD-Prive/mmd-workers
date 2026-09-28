const ALLOWED_SHOPS = new Set(["himai-shop", "mmd-shop"]);
const ALLOWED_ACTIONS = new Set([
  "shop_owner",
  "product_interest",
  "line_order",
  "order",
  "order_created",
  "payment",
  "payment_received",
  "payment_confirmed",
]);

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

  const telegram = await sendShopAlertToTelegram(env, shop, action, text);

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

function eventLane(action) {
  if (["line_order", "order", "order_created"].includes(action)) return "orders";
  if (["payment", "payment_received", "payment_confirmed"].includes(action)) return "payments";
  return "alerts";
}

function buildTelegramText(input) {
  const shopLabel = input.shop === "mmd-shop" ? "🛍️ MMD SHOP" : "💊 HIMAI SHOP";
  const actionLabel = ["line_order", "order", "order_created"].includes(input.action)
    ? "ลูกค้าสร้างคำสั่งซื้อ"
    : ["payment", "payment_received", "payment_confirmed"].includes(input.action)
      ? "มีเหตุการณ์ชำระเงิน"
      : input.action === "product_interest"
        ? "ลูกค้าสนใจสินค้า"
        : "ลูกค้ากดคุยกับ Shop Owner";

  const lines = [
    `${shopLabel} · ${eventLane(input.action).toUpperCase()}`,
    actionLabel,
    "",
    `สินค้า: ${input.productName || "General Shop Inquiry"}`,
    `SKU: ${input.sku || "-"}`,
    `ราคา: ${input.price == null ? "สอบถามราคา" : `฿${input.price.toLocaleString("th-TH")}`}`,
    `หน้า: ${input.route}`,
    `เวลา: ${input.occurredAt}`,
    `Event: ${input.eventId}`,
  ];

  return lines.join("\n");
}

export async function sendMmdShopOperationalAlert(env, text) {
  return sendShopAlertToTelegram(env, "mmd-shop", "shop_owner", String(text || "").slice(0, 4000));
}

function threadId(env, shop, lane) {
  const key = shop === "mmd-shop"
    ? {
        orders: "TG_THREAD_MMD_SHOP_ORDERS",
        payments: "TG_THREAD_MMD_SHOP_PAYMENTS",
        alerts: "TG_THREAD_MMD_SHOP_ALERTS",
      }[lane]
    : {
        orders: "TG_THREAD_HIMAI_ORDERS",
        payments: "TG_THREAD_HIMAI_PAYMENTS",
        alerts: "TG_THREAD_HIMAI_ALERTS",
      }[lane];

  const fallback = shop === "mmd-shop"
    ? { orders: 160, payments: 161, alerts: 162 }[lane]
    : { orders: 157, payments: 158, alerts: 159 }[lane];

  const configured = Number(env?.[key]);
  return Number.isInteger(configured) && configured > 0 ? configured : fallback;
}

async function sendShopAlertToTelegram(env, shop, action, text) {
  const service = env.TELEGRAM_WORKER;
  const token = clean(env.AUTH_SERVICE_HIMAI_TO_TELEGRAM);
  if (!service || typeof service.fetch !== "function") return { ok: false, skipped: true, reason: "telegram_router_binding_missing" };
  if (!token) return { ok: false, skipped: true, reason: "telegram_router_auth_missing" };

  const lane = eventLane(action);
  const flow = shop === "mmd-shop"
    ? { orders: "mmd_shop_orders", payments: "mmd_shop_payments", alerts: "mmd_shop_alerts" }[lane]
    : { orders: "himai_orders", payments: "himai_payments", alerts: "himai_alerts" }[lane];

  const response = await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      flow,
      text,
      disable_web_page_preview: true,
    }),
  }));

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true || data?.telegram?.ok !== true) {
    return { ok: false, status: response.status, flow, error: data || null };
  }

  return { ok: true, flow, result: data?.telegram?.result || null };
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
