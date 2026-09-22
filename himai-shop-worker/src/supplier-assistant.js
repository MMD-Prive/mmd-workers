const PORTAL_PATH = "/shop/api/distributor/portal";
const DASHBOARD_PATH = "/shop/distributor";
const ASSISTANT_PATHS = new Set([
  "/shop/api/supplier/assistant",
  "/shop/api/distributor/assistant",
]);
const PREFERENCE_PATHS = new Set([
  "/shop/api/supplier/notification-preference",
  "/shop/api/distributor/notification-preference",
]);
const REFILL_DRAFT_PATHS = new Set([
  "/shop/api/supplier/refill-draft",
  "/shop/api/distributor/refill-draft",
]);
const WORKFLOW_PATHS = new Set([
  "/shop/api/supplier/workflow",
  "/shop/api/distributor/workflow",
]);
const DELIVERY_PATHS = new Set([
  "/shop/api/supplier/delivery-update",
  "/shop/api/distributor/delivery-update",
]);
const CHANNELS = new Set(["line", "telegram", "none"]);
const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_DASHBOARD_URL = "https://himai-shop-worker.mmdbkk.com/shop/supplier";
const MAX_MESSAGE_LENGTH = 1600;

export async function handleSupplierAssistant(request, env) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  if ((ASSISTANT_PATHS.has(path) || PREFERENCE_PATHS.has(path) || REFILL_DRAFT_PATHS.has(path) || WORKFLOW_PATHS.has(path) || DELIVERY_PATHS.has(path)) && method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (method === "GET" && (path === PORTAL_PATH || path === "/shop/api/supplier/portal" || path === "/shop/api/supplier/dashboard")) {
    return proxyPortal(request, env);
  }

  if (method === "GET" && PREFERENCE_PATHS.has(path)) {
    return getNotificationPreference(request, env);
  }

  if (method === "POST" && PREFERENCE_PATHS.has(path)) {
    return setNotificationPreference(request, env);
  }

  if (method === "POST" && ASSISTANT_PATHS.has(path)) {
    return answerSupplier(request, env);
  }

  if (method === "POST" && REFILL_DRAFT_PATHS.has(path)) {
    return createRefillDraft(request, env);
  }

  if (method === "GET" && WORKFLOW_PATHS.has(path)) {
    return getSupplierWorkflow(request, env);
  }

  if (method === "POST" && DELIVERY_PATHS.has(path)) {
    return createDeliveryUpdate(request, env);
  }

  return null;
}

export async function runSupplierAlertSweep(env) {
  const entries = parseSupplierTokenConfig(env.HIMAI_DISTRIBUTOR_PORTAL_TOKENS);
  const results = [];

  for (const [token, config] of entries) {
    if (!config || config.active === false) continue;

    try {
      const portal = await loadPortalForToken(env, token);
      const products = safeProducts(portal);
      const lowProducts = products.filter((product) => product.low_stock === true);
      const key = await supplierKey(token);
      const preference = await readPreference(env, key);
      const channel = normalizeChannel(
        preference?.value?.channel
        || preference?.channel
        || config.notification_channel
        || config.channel
      );

      if (!channel || channel === "none") {
        results.push({ supplier: safeSupplierName(portal, config), skipped: true, reason: "notification_channel_not_selected" });
        continue;
      }

      const target = notificationTarget(config, channel);
      if (!target) {
        results.push({ supplier: safeSupplierName(portal, config), skipped: true, reason: "notification_target_missing", channel });
        continue;
      }

      const fingerprint = JSON.stringify(lowProducts.map((product) => ({
        id: product.id,
        available: product.available,
        refill_signal: product.refill_signal,
      })));
      const previous = await readFingerprint(env, key);

      if (fingerprint === previous) {
        results.push({ supplier: safeSupplierName(portal, config), skipped: true, reason: "unchanged", channel });
        continue;
      }

      if (!previous && fingerprint === "[]") {
        await writeFingerprint(env, key, fingerprint);
        results.push({ supplier: safeSupplierName(portal, config), skipped: true, reason: "healthy_initial_state", channel });
        continue;
      }

      const recovered = lowProducts.length === 0 && previous && previous !== "[]";
      const message = buildAlertMessage(portal, lowProducts, recovered, env);
      const sent = await sendSupplierNotification(env, channel, target, message);

      if (sent.ok === true) await writeFingerprint(env, key, fingerprint);
      results.push({
        supplier: safeSupplierName(portal, config),
        channel,
        low_stock: lowProducts.length,
        recovered,
        sent: sent.ok === true,
        detail: safeDeliveryDetail(sent),
      });
    } catch (error) {
      results.push({ token_configured: true, ok: false, error: String(error?.message || error).slice(0, 240) });
    }
  }

  return { ok: results.every((item) => item.sent === true || item.skipped === true), checked: results.length, results };
}

async function proxyPortal(request, env) {
  const token = readToken(request);
  if (!token) return withCors(request, env, json({ ok: false, error: "missing_supplier_token" }, 401));

  try {
    const response = await loadPortalResponse(env, token);
    return withCors(request, env, response);
  } catch (error) {
    return withCors(request, env, json({ ok: false, error: "supplier_portal_unavailable", detail: String(error?.message || error).slice(0, 160) }, 502));
  }
}

async function answerSupplier(request, env) {
  const token = readToken(request);
  if (!token) return withCors(request, env, json({ ok: false, error: "missing_supplier_token" }, 401));

  const body = await request.json().catch(() => null);
  const message = clean(body?.message || body?.text, MAX_MESSAGE_LENGTH);
  if (!message) return withCors(request, env, json({ ok: false, error: "message_required" }, 400));

  let portal;
  try {
    portal = await loadPortalForToken(env, token);
  } catch (error) {
    return withCors(request, env, json({ ok: false, error: "supplier_truth_unavailable", detail: String(error?.message || error).slice(0, 160) }, 502));
  }

  const safe = buildSafeSnapshot(portal);
  const deterministic = deterministicReply(message, safe);
  let reply = deterministic;
  let provider = "supplier_rules";

  if (!reply) {
    const modelReply = await aiReply(env, message, safe);
    reply = modelReply.text;
    provider = modelReply.provider;
  }

  if (!reply) reply = fallbackReply(message, safe);

  return withCors(request, env, json({
    ok: true,
    reply,
    provider,
    supplier: safe.supplier,
    dashboard_url: dashboardUrl(env),
    capabilities: [
      "stock",
      "sold",
      "reserved",
      "refill_signal",
      "notification_preference",
      "refill_draft",
    ],
  }));
}

async function getNotificationPreference(request, env) {
  const token = readToken(request);
  if (!token) return withCors(request, env, json({ ok: false, error: "missing_supplier_token" }, 401));

  const portal = await loadPortalForToken(env, token).catch(() => null);
  const config = resolveTokenConfig(env, token);
  const key = await supplierKey(token);
  const saved = await readPreference(env, key);
  const available = {
    line: Boolean(notificationTarget(config, "line")),
    telegram: Boolean(notificationTarget(config, "telegram")),
  };
  const channel = normalizeChannel(
    saved?.value?.channel
    || saved?.channel
    || config?.notification_channel
    || config?.channel
  ) || "none";

  return withCors(request, env, json({
    ok: true,
    supplier: safeSupplierName(portal, config),
    channel,
    available_channels: available,
    configured: Boolean(available.line || available.telegram),
    dashboard_url: dashboardUrl(env),
  }));
}

async function setNotificationPreference(request, env) {
  const token = readToken(request);
  if (!token) return withCors(request, env, json({ ok: false, error: "missing_supplier_token" }, 401));

  const body = await request.json().catch(() => null);
  const channel = normalizeChannel(body?.channel);
  if (!CHANNELS.has(channel)) {
    return withCors(request, env, json({ ok: false, error: "channel_must_be_line_telegram_or_none" }, 400));
  }

  const config = resolveTokenConfig(env, token);
  if (channel !== "none" && !notificationTarget(config, channel)) {
    return withCors(request, env, json({
      ok: false,
      error: "notification_target_missing",
      channel,
      next: channel === "line"
        ? "add line_user_id to the supplier access configuration"
        : "add telegram_chat_id to the supplier access configuration",
    }, 409));
  }

  const key = await supplierKey(token);
  const stored = await writePreference(env, key, { channel, updated_at: new Date().toISOString() });
  if (!stored) {
    return withCors(request, env, json({ ok: false, error: "preference_storage_not_configured" }, 503));
  }

  return withCors(request, env, json({
    ok: true,
    channel,
    supplier: config?.supplier_name || config?.name || "Distributor",
    message: channel === "none" ? "ปิดการแจ้งเตือนแล้ว" : "บันทึกช่องทางแจ้งเตือนแล้ว",
  }));
}

async function createRefillDraft(request, env) {
  const token = readToken(request);
  if (!token) return withCors(request, env, json({ ok: false, error: "missing_supplier_token" }, 401));

  const body = await request.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length || items.length > 20) {
    return withCors(request, env, json({ ok: false, error: "items_required" }, 400));
  }

  const portal = await loadPortalForToken(env, token).catch(() => null);
  if (!portal?.ok) return withCors(request, env, json({ ok: false, error: "supplier_truth_unavailable" }, 502));

  const products = safeProducts(portal);
  const normalized = [];
  for (const item of items) {
    const product = findProduct(products, item);
    const quantity = Number(item?.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      return withCors(request, env, json({ ok: false, error: "invalid_refill_item" }, 400));
    }
    normalized.push({
      product_id: product.id,
      product_name: product.product_name,
      sku: product.sku,
      quantity,
    });
  }

  const key = await supplierKey(token);
  const draft = {
    id: "refill-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    status: "draft",
    supplier: safeSupplierName(portal, resolveTokenConfig(env, token)),
    items: normalized,
    created_at: new Date().toISOString(),
    approval_required: true,
  };
  const stored = await writeDraft(env, key, draft);
  if (!stored) return withCors(request, env, json({ ok: false, error: "draft_storage_not_configured" }, 503));

  const ownerNotification = await notifyOwnerSupplierWorkflow(env, {
    title: "HIMAI SUPPLIER · REFILL REQUEST",
    supplier: draft.supplier,
    lines: draft.items.map((item) => "• " + item.product_name + " × " + item.quantity),
    reference: draft.id,
  });

  return withCors(request, env, json({
    ok: true,
    draft,
    owner_notification: ownerNotification,
    message: "ส่งคำขอเติมสินค้าแล้ว รอ MMD ตรวจและยืนยัน",
  }, 201));
}

async function getSupplierWorkflow(request, env) {
  const token = readToken(request);
  if (!token) return withCors(request, env, json({ ok: false, error: "missing_supplier_token" }, 401));

  const portal = await loadPortalForToken(env, token).catch(() => null);
  if (!portal?.ok) return withCors(request, env, json({ ok: false, error: "supplier_truth_unavailable" }, 502));

  const key = await supplierKey(token);
  const [draftResult, deliveryResult] = await Promise.all([
    readDrafts(env, key),
    readDeliveries(env, key),
  ]);

  const drafts = Array.isArray(draftResult?.drafts) ? draftResult.drafts : [];
  const deliveries = Array.isArray(deliveryResult?.deliveries) ? deliveryResult.deliveries : [];

  return withCors(request, env, json({
    ok: true,
    supplier: safeSupplierName(portal, resolveTokenConfig(env, token)),
    refill_requests: drafts.slice(0, 20),
    delivery_updates: deliveries.slice(0, 50),
    rules: {
      supplier_can_mark_received: false,
      received_requires_mmd_confirmation: true,
      stock_increases_only_after_mmd_receives: true,
    },
  }));
}

async function createDeliveryUpdate(request, env) {
  const token = readToken(request);
  if (!token) return withCors(request, env, json({ ok: false, error: "missing_supplier_token" }, 401));

  const body = await request.json().catch(() => null);
  const refillId = clean(body?.refill_id, 160);
  const status = clean(body?.status, 40).toLowerCase();
  if (!refillId) return withCors(request, env, json({ ok: false, error: "refill_id_required" }, 400));
  if (["received", "delivered", "stocked"].includes(status)) {
    return withCors(request, env, json({ ok: false, error: "owner_confirmation_required" }, 409));
  }
  if (!["preparing", "shipped"].includes(status)) {
    return withCors(request, env, json({ ok: false, error: "status_must_be_preparing_or_shipped" }, 400));
  }

  const portal = await loadPortalForToken(env, token).catch(() => null);
  if (!portal?.ok) return withCors(request, env, json({ ok: false, error: "supplier_truth_unavailable" }, 502));

  const key = await supplierKey(token);
  const draftResult = await readDrafts(env, key);
  const drafts = Array.isArray(draftResult?.drafts) ? draftResult.drafts : [];
  const refill = drafts.find((item) => clean(item?.id, 160) === refillId);
  if (!refill) return withCors(request, env, json({ ok: false, error: "refill_request_not_found" }, 404));

  const update = {
    id: "delivery-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    refill_id: refillId,
    status,
    supplier: safeSupplierName(portal, resolveTokenConfig(env, token)),
    tracking_reference: clean(body?.tracking_reference || body?.tracking, 160),
    note: clean(body?.note, 500),
    created_at: new Date().toISOString(),
    received_by_mmd: false,
  };
  const stored = await writeDelivery(env, key, update);
  if (!stored) return withCors(request, env, json({ ok: false, error: "delivery_storage_not_configured" }, 503));

  const ownerNotification = await notifyOwnerSupplierWorkflow(env, {
    title: status === "shipped" ? "HIMAI SUPPLIER · SHIPPED" : "HIMAI SUPPLIER · PREPARING",
    supplier: update.supplier,
    lines: [
      "Refill: " + refillId,
      update.tracking_reference ? "Tracking: " + update.tracking_reference : "",
      update.note ? "Note: " + update.note : "",
    ].filter(Boolean),
    reference: update.id,
  });

  return withCors(request, env, json({
    ok: true,
    delivery: update,
    owner_notification: ownerNotification,
    message: status === "shipped"
      ? "แจ้งส่งของให้ MMD แล้ว รอ MMD ยืนยันรับก่อน Stock จะเพิ่ม"
      : "บันทึกว่ากำลังเตรียมสินค้าแล้ว",
  }, 201));
}

async function notifyOwnerSupplierWorkflow(env, payload) {
  const chatId = clean(env.TELEGRAM_CHAT_ID || "-1003546439681", 80);
  const threadId = Number(env.TG_THREAD_HIMAI_ALERTS || 159);
  if (!env.TELEGRAM_WORKER?.fetch || !clean(env.AUTH_SERVICE_HIMAI_TO_TELEGRAM) || !chatId) {
    return { ok: false, skipped: true, reason: "owner_notification_not_configured" };
  }

  const text = [
    "<b>" + escapeHtml(payload.title || "HIMAI SUPPLIER") + "</b>",
    "<b>Supplier:</b> " + escapeHtml(payload.supplier || "Supplier"),
    "",
    ...(Array.isArray(payload.lines) ? payload.lines.map((line) => escapeHtml(line)) : []),
    payload.reference ? "" : null,
    payload.reference ? "<b>Ref:</b> " + escapeHtml(payload.reference) : null,
  ].filter((line) => line !== null && line !== undefined).join("\n");

  try {
    const response = await env.TELEGRAM_WORKER.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
      method: "POST",
      headers: {
        authorization: "Bearer " + clean(env.AUTH_SERVICE_HIMAI_TO_TELEGRAM),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: threadId || undefined,
        text: text.slice(0, 4000),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    }));
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok && data?.ok === true && data?.telegram?.ok === true,
      status: response.status,
      error: data?.error || data?.telegram?.error || null,
    };
  } catch (error) {
    return { ok: false, error: clean(error?.message || error, 180) };
  }
}

async function loadPortalForToken(env, token) {
  const response = await loadPortalResponse(env, token);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || "invalid_supplier_token");
  }
  return data;
}

async function loadPortalResponse(env, token) {
  const upstream = new URL(PORTAL_PATH, catalogUpstream(env));
  const req = new Request(upstream.toString(), {
    method: "GET",
    headers: {
      authorization: "Bearer " + token,
      accept: "application/json",
    },
  });

  const response = env.HIMAI_CHAT_WORKER?.fetch
    ? await env.HIMAI_CHAT_WORKER.fetch(req)
    : await fetch(req);

  if (!response || !response.ok) {
    const data = await response?.json().catch(() => null);
    throw new Error(data?.error || "supplier_portal_request_failed");
  }
  return response;
}

function buildSafeSnapshot(portal) {
  return {
    supplier: safeSupplierName(portal, null),
    products: safeProducts(portal),
    updated_at: clean(portal?.updated_at, 80),
  };
}

function safeProducts(portal) {
  return (Array.isArray(portal?.products) ? portal.products : []).map((product) => ({
    id: clean(product?.id, 80),
    product_name: clean(product?.product_name, 160),
    sku: clean(product?.sku, 80),
    selling_price_thb: numberOrNull(product?.selling_price_thb),
    available: numberOrNull(product?.available),
    sold_total: numberOrNull(product?.sold_total) || 0,
    reserved_total: numberOrNull(product?.reserved_total) || 0,
    low_stock: product?.low_stock === true,
    refill_signal: clean(product?.refill_signal, 80),
  }));
}

function deterministicReply(message, snapshot) {
  const value = clean(message, MAX_MESSAGE_LENGTH);
  const lower = value.toLowerCase();
  const products = snapshot.products;
  const low = products.filter((product) => product.low_stock === true || product.refill_signal === "refill_now" || product.refill_signal === "check_next_refill");

  if (/^(help|menu|ช่วย|คำสั่ง|ทำอะไรได้บ้าง|เมนู)/i.test(value)) {
    return [
      "ผมช่วยดูข้อมูลของสินค้าที่อยู่ในสิทธิ์ของคุณได้ครับ",
      "• stock / คงเหลือ",
      "• sold / ขายแล้ว",
      "• reserved / จอง",
      "• refill / สินค้าที่ควรเติม",
      "• ตั้งแจ้งเตือน LINE หรือ Telegram",
      "• สร้างคำขอเติมสินค้าแบบร่างเพื่อรอ Boss Per อนุมัติ",
      "Dashboard: " + DEFAULT_DASHBOARD_URL,
    ].join("\n");
  }

  if (/(dashboard|แดชบอร์ด|หน้าเว็บ|portal)/i.test(lower)) {
    return "เปิด Supplier Dashboard ได้ที่ " + DEFAULT_DASHBOARD_URL;
  }

  if (/(แจ้งเตือน|notification|alert|line|telegram|เทเลแกรม)/i.test(lower)) {
    return "ตั้งช่องทางแจ้งเตือนจาก Distributor Dashboard ได้ครับ เลือก LINE หรือ Telegram ได้ตามช่องทางที่เชื่อมไว้";
  }

  if (/(เติม|refill|low stock|ใกล้หมด|หมดแล้ว|ควรสั่ง)/i.test(lower)) {
    if (!low.length) return "ตอนนี้ยังไม่พบสินค้าที่เข้าเกณฑ์แจ้งเตือนเติมจากข้อมูลล่าสุดครับ";
    return "รายการที่ควรตรวจสอบการเติม:\n" + low.map(formatProductLine).join("\n");
  }

  if (/(ขายแล้ว|sold|ยอดขาย|ขายไป)/i.test(lower)) {
    if (!products.length) return "ยังไม่มีรายการสินค้าที่อยู่ในสิทธิ์ของคุณครับ";
    return "ยอดขายตามสินค้าที่คุณดูแล:\n" + products.map((product) => "• " + product.product_name + ": " + product.sold_total + " ชิ้น").join("\n");
  }

  if (/(จอง|กันไว้|reserved|reserve|pending)/i.test(lower)) {
    if (!products.length) return "ยังไม่มีรายการสินค้าที่อยู่ในสิทธิ์ของคุณครับ";
    return "ยอดที่ถูกจอง/กันไว้ตามข้อมูลล่าสุด:\n" + products.map((product) => "• " + product.product_name + ": " + product.reserved_total + " ชิ้น").join("\n");
  }

  if (/(stock|สต๊อก|สต็อก|คงเหลือ|เหลือเท่าไหร่|เหลือกี่)/i.test(lower)) {
    if (!products.length) return "ยังไม่มีรายการสินค้าที่อยู่ในสิทธิ์ของคุณครับ";
    return "คงเหลือตามข้อมูลล่าสุด:\n" + products.map(formatProductLine).join("\n");
  }

  if (/(ออเดอร์|order|สถานะงาน|สถานะคำสั่งซื้อ)/i.test(lower)) {
    return "เรื่องคำสั่งซื้อให้ดูจาก Dashboard หรือประสาน MMD โดยตรงครับ ผมจะไม่แสดงข้อมูลลูกค้าหรือข้อมูลของ supplier รายอื่น";
  }

  if (/(ราคา|price)/i.test(lower)) {
    const priced = products.filter((product) => product.selling_price_thb !== null);
    if (!priced.length) return "ยังไม่มีราคาขายที่เปิดให้ดูจากข้อมูลล่าสุดครับ";
    return "ราคาขายที่เปิดให้ดู:\n" + priced.map((product) => "• " + product.product_name + ": ฿" + product.selling_price_thb.toLocaleString("th-TH")).join("\n");
  }

  return "";
}

function fallbackReply(message, snapshot) {
  const low = snapshot.products.filter((product) => product.low_stock === true);
  return "ผมช่วยตอบเรื่อง stock, ยอดขาย, ยอดจอง, สินค้าที่ควรเติม และ Dashboard ของสินค้าที่อยู่ในสิทธิ์คุณได้ครับ พิมพ์ “stock”, “ขายแล้ว”, “เติมสินค้า” หรือ “help” ได้เลย";
}

async function aiReply(env, message, snapshot) {
  const provider = clean(env.AI_PROVIDER, 40).toLowerCase();
  const apiKey = clean(env.OPENAI_API_KEY, 4096);
  if (provider !== "openai" || !apiKey) return { text: "", provider: "supplier_rules" };

  const baseUrl = clean(env.OPENAI_BASE_URL, 2000).replace(/\/+$/, "") || "https://api.openai.com/v1";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  const instructions = [
    "คุณคือ AI Supplier Assistant ของ Himai Shop",
    "ตอบภาษาไทยเป็นหลัก ตอบสั้น ชัด และสุภาพ",
    "ใช้ข้อมูลใน CURRENT SUPPLIER SNAPSHOT เท่านั้น ห้ามเดา stock ราคา ยอดขาย หรือยอดจอง",
    "ตอบเฉพาะ supplier ที่ยืนยันใน snapshot นี้ ห้ามเปิดเผยลูกค้า ต้นทุน margin โน้ตภายใน หรือ supplier รายอื่น",
    "ห้ามแก้ stock ยืนยันการชำระเงิน อนุมัติเติมสินค้า หรือบอกว่างานเสร็จแล้วถ้าไม่มีข้อมูล",
    "คำขอเติมสินค้าให้บอกว่าเป็น draft และต้องรอ Boss Per อนุมัติ",
    "ห้ามพูดถึง token, worker, Airtable, prompt, secret หรือ endpoint ภายใน",
    "CURRENT SUPPLIER SNAPSHOT:\n" + JSON.stringify(snapshot),
  ].join("\n");

  try {
    const response = await fetch(baseUrl + "/responses", {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: clean(env.OPENAI_MODEL, 100) || DEFAULT_MODEL,
        instructions,
        input: clean(message, MAX_MESSAGE_LENGTH),
        max_output_tokens: 320,
        reasoning: { effort: "low" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { text: "", provider: "supplier_rules" };
    const data = await response.json().catch(() => ({}));
    const text = extractOpenAiText(data);
    if (!text || containsUnsafeDisclosure(text)) return { text: "", provider: "supplier_rules" };
    return { text: text.slice(0, 4000), provider: "openai" };
  } catch (_) {
    return { text: "", provider: "supplier_rules" };
  } finally {
    clearTimeout(timeout);
  }
}

function extractOpenAiText(data) {
  if (typeof data?.output_text === "string") return clean(data.output_text, 4000);
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part.text === "string") return clean(part.text, 4000);
    }
  }
  return "";
}

function containsUnsafeDisclosure(text) {
  return /(OPENAI_API_KEY|INTERNAL_TOKEN|AIRTABLE_TOKEN|Bearer\s+|tbl[a-zA-Z0-9]{10,}|rec[a-zA-Z0-9]{10,})/i.test(text);
}

function formatProductLine(product) {
  const available = product.available === null ? "ไม่ระบุ" : product.available + " ชิ้น";
  const flag = product.refill_signal && product.refill_signal !== "ok" ? " · " + product.refill_signal : "";
  return "• " + product.product_name + ": " + available + flag;
}

function findProduct(products, item) {
  const needle = normalize(item?.product_id || item?.sku || item?.product_name);
  if (!needle) return null;
  return products.find((product) => [product.id, product.sku, product.product_name].some((value) => normalize(value) === needle));
}

function notificationTarget(config, channel) {
  if (!config) return "";
  if (channel === "line") return clean(config.line_user_id || config.lineUserId || config.line_user || config.line_id);
  if (channel === "telegram") return clean(config.telegram_chat_id || config.telegramChatId || config.telegram_user_id || config.telegram_id);
  return "";
}

async function sendSupplierNotification(env, channel, target, text) {
  if (channel === "line") {
    if (!env.HIMAI_CHAT_WORKER?.fetch || !clean(env.INTERNAL_TOKEN)) {
      return { ok: false, skipped: true, reason: "line_service_binding_or_auth_missing" };
    }
    const response = await env.HIMAI_CHAT_WORKER.fetch(new Request("https://himai-chat-worker.internal/internal/line/push", {
      method: "POST",
      headers: {
        authorization: "Bearer " + clean(env.INTERNAL_TOKEN),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        lineUserId: target,
        messages: [{ type: "text", text: text.slice(0, 4800) }],
      }),
    }));
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok && data?.ok === true, status: response.status, error: data?.error || null };
  }

  if (channel === "telegram") {
    if (!env.TELEGRAM_WORKER?.fetch || !clean(env.AUTH_SERVICE_HIMAI_TO_TELEGRAM)) {
      return { ok: false, skipped: true, reason: "telegram_service_binding_or_auth_missing" };
    }
    const response = await env.TELEGRAM_WORKER.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
      method: "POST",
      headers: {
        authorization: "Bearer " + clean(env.AUTH_SERVICE_HIMAI_TO_TELEGRAM),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: target,
        text: text.slice(0, 4000),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    }));
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok && data?.ok === true && data?.telegram?.ok === true, status: response.status, error: data?.error || data?.telegram?.error || null };
  }

  return { ok: false, skipped: true, reason: "unsupported_channel" };
}

function buildAlertMessage(portal, lowProducts, recovered, env) {
  const name = escapeHtml(safeSupplierName(portal, null));
  const title = recovered ? "✅ HIMAI STOCK กลับสู่ระดับปกติ" : "🚨 HIMAI STOCK ALERT";
  const lines = [
    "<b>" + title + "</b>",
    "<b>Supplier:</b> " + name,
    "",
  ];

  if (recovered) {
    lines.push("รายการที่เคยแจ้งเตือนกลับสู่ระดับปกติแล้ว");
  } else {
    lines.push(...lowProducts.slice(0, 12).map((product) =>
      "• " + escapeHtml(product.product_name) + ": " + escapeHtml(product.available === null ? "ไม่ระบุ" : String(product.available) + " ชิ้น")
      + " · " + escapeHtml(product.refill_signal || "check")
    ));
  }

  lines.push("", "<b>Dashboard:</b> " + escapeHtml(dashboardUrl(env)));
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function supplierKey(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readPreference(env, key) {
  return stateRpc(env, "read-preference", { key });
}

async function writePreference(env, key, value) {
  return stateRpc(env, "write-preference", { key, value });
}

async function readFingerprint(env, key) {
  const result = await stateRpc(env, "read-fingerprint", { key });
  return result?.fingerprint || "";
}

async function writeFingerprint(env, key, fingerprint) {
  return stateRpc(env, "write-fingerprint", { key, fingerprint });
}

async function writeDraft(env, key, draft) {
  return stateRpc(env, "write-draft", { key, draft });
}

async function readDrafts(env, key) {
  return stateRpc(env, "read-drafts", { key });
}

async function writeDelivery(env, key, delivery) {
  return stateRpc(env, "write-delivery", { key, delivery });
}

async function readDeliveries(env, key) {
  return stateRpc(env, "read-deliveries", { key });
}

async function stateRpc(env, action, payload) {
  const namespace = env.SUPPLIER_ALERT_STATE;
  if (!namespace?.idFromName || !namespace?.get) return null;
  const id = namespace.idFromName(String(payload?.key || "global"));
  const stub = namespace.get(id);
  const response = await stub.fetch("https://supplier-alert-state.internal/" + action, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export class SupplierAlertState {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const action = new URL(request.url).pathname.replace(/^\/+/, "");
    const body = await request.json().catch(() => ({}));
    const key = clean(body?.key, 200);
    if (!key) return json({ ok: false, error: "state_key_required" }, 400);

    if (action === "read-preference") {
      return json({ ok: true, value: await this.state.storage.get("preference:" + key) || null });
    }
    if (action === "write-preference") {
      await this.state.storage.put("preference:" + key, body.value || null);
      return json({ ok: true, stored: true });
    }
    if (action === "read-fingerprint") {
      return json({ ok: true, fingerprint: await this.state.storage.get("fingerprint:" + key) || "" });
    }
    if (action === "write-fingerprint") {
      await this.state.storage.put("fingerprint:" + key, clean(body.fingerprint, 2000));
      return json({ ok: true, stored: true });
    }
    if (action === "write-draft") {
      const drafts = await this.state.storage.get("drafts:" + key) || [];
      const next = [body.draft, ...(Array.isArray(drafts) ? drafts : [])].slice(0, 20);
      await this.state.storage.put("drafts:" + key, next);
      return json({ ok: true, stored: true });
    }
    if (action === "read-drafts") {
      return json({ ok: true, drafts: await this.state.storage.get("drafts:" + key) || [] });
    }
    if (action === "write-delivery") {
      const deliveries = await this.state.storage.get("deliveries:" + key) || [];
      const next = [body.delivery, ...(Array.isArray(deliveries) ? deliveries : [])].slice(0, 50);
      await this.state.storage.put("deliveries:" + key, next);
      return json({ ok: true, stored: true });
    }
    if (action === "read-deliveries") {
      return json({ ok: true, deliveries: await this.state.storage.get("deliveries:" + key) || [] });
    }

    return json({ ok: false, error: "state_action_not_found" }, 404);
  }
}

function resolveTokenConfig(env, token) {
  return parseSupplierTokenConfig(env.HIMAI_DISTRIBUTOR_PORTAL_TOKENS).get(token) || null;
}

function parseSupplierTokenConfig(raw) {
  const map = new Map();
  if (!raw) return map;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { return map; }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item.token === "string") map.set(item.token, item);
    }
    return map;
  }

  if (parsed && typeof parsed === "object") {
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === "object") map.set(key, value);
    }
  }
  return map;
}

function safeSupplierName(portal, config) {
  return clean(portal?.distributor?.name || portal?.supplier?.name || config?.supplier_name || config?.name || "Distributor", 160);
}

function notificationTargetFromPortal(_portal, _channel) {
  return "";
}

function normalizeChannel(value) {
  const channel = clean(value, 30).toLowerCase();
  return CHANNELS.has(channel) ? channel : "";
}

function dashboardUrl(env) {
  return clean(env.SUPPLIER_DASHBOARD_URL, 1000) || DEFAULT_DASHBOARD_URL;
}

function catalogUpstream(env) {
  return String(env.MMD_SHOP_CATALOG_UPSTREAM || env.HIMAI_CHAT_UPSTREAM || "https://himai-chat-worker.malemodel-bkk.workers.dev").replace(/\/+$/, "");
}

function readToken(request) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  const url = new URL(request.url);
  return clean(url.searchParams.get("token") || url.searchParams.get("supplier_token"), 5000);
}

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function normalize(value) {
  return clean(value, 300).normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const headers = new Headers({
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "cache-control": "no-store",
  });
  if (origin && (allowed.length === 0 || allowed.includes(origin))) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return headers;
}

function withCors(request, env, response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(request, env)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function safeDeliveryDetail(result) {
  return result?.error || result?.reason || result?.status || (result?.ok ? "sent" : "failed");
}

export const SUPPLIER_ASSISTANT_INTERNALS = Object.freeze({
  deterministicReply,
  safeProducts,
  parseSupplierTokenConfig,
  normalizeChannel,
  findProduct,
});
