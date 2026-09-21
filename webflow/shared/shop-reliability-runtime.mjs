/** Shared, dependency-free browser core served by the commerce worker on both shop API roots. */
export function installShopReliability(global) {
  "use strict";
  if (global.MMDShopReliability) return;
  var messages = {"th":{"unavailable":"ยังตรวจรายการสินค้าไม่ได้ ตะกร้าของคุณยังอยู่ กรุณาลองโหลดอีกครั้ง","updated":"ราคา หรือจำนวนสินค้าเปลี่ยนแล้ว กรุณาตรวจยอดในตะกร้าอีกครั้งก่อนสั่ง","processing":"กำลังตรวจคำขอเดิม กรุณาอย่าชำระเงินซ้ำ","storage":"เบราว์เซอร์บันทึกคำขอไม่ได้ จึงยังไม่เปิดออเดอร์ใหม่ กรุณาเปิดใช้งานพื้นที่จัดเก็บหรือติดต่อร้าน","review":"รายการนี้ต้องให้ร้านตรวจต่อ กรุณาส่งเลขอ้างอิงให้ร้าน อย่าเปิดออเดอร์หรือชำระเงินซ้ำ","uncertain":"ยังยืนยันผลคำขอไม่ได้ กดปุ่มเดิมอีกครั้งเพื่อตรวจออเดอร์เดิม โดยไม่สร้างรายการใหม่","resume":"กลับไปออเดอร์เดิม","retry":"โหลดสินค้าอีกครั้ง","empty":"ขณะนี้ยังไม่มีสินค้าพร้อมแสดง","checkout":"สั่งซื้อและชำระเงิน"},"en":{"unavailable":"Products could not be checked. Your cart is unchanged. Please reload the catalog.","updated":"Prices or quantities have changed. Review your cart before ordering again.","processing":"Checking the same request. Do not pay twice.","storage":"This browser cannot save the request, so no new order can be opened. Enable browser storage or contact the shop.","review":"The shop must review this request. Send the reference to the shop. Do not create another order or pay again.","uncertain":"The result is not confirmed. Press the same button to recover the original order without creating another.","resume":"Continue original order","retry":"Reload products","empty":"No products are currently available to display.","checkout":"Order & pay"},"zh":{"unavailable":"暂时无法核对商品，购物车保持不变。请重新加载。","updated":"价格或数量已变更，请核对购物车后再下单。","processing":"正在检查原请求，请勿重复付款。","storage":"浏览器无法保存请求，因此不会开启新订单。请允许存储或联系商店。","review":"此请求需要商店核对，请发送参考编号。请勿重新下单或重复付款。","uncertain":"请求结果尚未确认。再次点击同一按钮恢复原订单，不会创建新订单。","resume":"继续原订单","retry":"重新加载商品","empty":"目前没有可展示的商品。","checkout":"下单并支付"}};
  function message(lang, key) { var dictionary = messages[lang] || messages.th; return dictionary[key] || dictionary.uncertain; }
  var shops = {
    shop: { path: "/shop", price: "Himai Selling Price THB" },
    "mmd-shop": { path: "/mmd-shop", price: "MMD Shop Selling Price THB" }
  };
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
  var error = function (code, data) { var e = new Error(code); e.code = code; e.data = data || {}; return e; };
  var getStorage = function (name) { try { return global[name]; } catch (_) { return null; } };
  var isPurchasable = function (p) {
    return !!p && p.checkout_eligible === true && String(p.status || "").toLowerCase() === "active"
      && Number.isFinite(Number(p.selling_price_thb)) && Number(p.selling_price_thb) > 0
      && ((p.stock_status === "tracked" && Number(p.available) > 0) || p.stock_status === "on_demand")
      && p.online_checkout_status !== "restricted"
      && !/^PPP25-/i.test(String(p.sku || ""))
      && !/\b(?:pod|nicotine|vape|e[-\s]?cig(?:arette)?s?)\b/i.test([p.product_name, p.description].join(" "));
  };
  function create(options) {
    if (!shops[options.shop]) throw error("unknown_shop");
    var config = shops[options.shop], storage = getStorage("localStorage"), session = getStorage("sessionStorage");
    var cartKey = options.cartKey, attemptKey = cartKey + ":checkout-attempt:v1";
    var memory = [], storageFailed = false, ready = false, rows = [], loading = null, busy = false;
    var request = options.fetchImpl || global.fetch.bind(global);
    var pending = null, corrupt = false;
    try { var raw = session && session.getItem(attemptKey); if (raw) { pending = JSON.parse(raw); if (!pending || !pending.id || !pending.body) corrupt = true; } }
    catch (_) { corrupt = true; }
    function read() {
      try {
        var text = !storageFailed && storage ? storage.getItem(cartKey) : undefined;
        if (text === null) memory = [];
        if (text !== null && text !== undefined) { var data = JSON.parse(text); if (Array.isArray(data)) memory = data; }
      } catch (_) {}
      return clone(memory).filter(function (x) { return x && typeof x === "object" && typeof x.product_id === "string"; });
    }
    function write(value) {
      memory = clone(value);
      var saved = false;
      try { storage.setItem(cartKey, JSON.stringify(memory)); saved = storage.getItem(cartKey) === JSON.stringify(memory); } catch (_) {}
      storageFailed = !saved;
      if (typeof options.onCart === "function") options.onCart();
      return saved;
    }
    function storageReady() {
      if (!storage || !session) return false;
      try {
        var probe = cartKey + ":probe";
        storage.setItem(probe, "1"); session.setItem(probe, "1");
        var ok = storage.getItem(probe) === "1" && session.getItem(probe) === "1";
        storage.removeItem(probe); session.removeItem(probe);
        if (ok && storageFailed) { storage.setItem(cartKey, JSON.stringify(memory)); storageFailed = false; }
        return ok;
      } catch (_) { return false; }
    }
    function savePending(value) {
      if (!session) throw error("checkout_storage_required");
      try {
        session.setItem(attemptKey, JSON.stringify(value));
        if (session.getItem(attemptKey) !== JSON.stringify(value)) throw 0;
        pending = value;
      } catch (_) { throw error("checkout_storage_required"); }
    }
    function clearPending() {
      try { session.removeItem(attemptKey); if (session.getItem(attemptKey)) throw 0; pending = null; }
      catch (_) { throw error("checkout_storage_required"); }
    }
    function setCatalog(data) {
      ready = false;
      if (!data || data.ok !== true || data.shop !== options.shop || data.pricing_source !== config.price || !Array.isArray(data.products))
        throw error("catalog_invalid");
      var ids = new Set();
      if (data.products.some(function (p) { if (!p || typeof p.id !== "string" || ids.has(p.id)) return true; ids.add(p.id); return false; }))
        throw error("catalog_invalid");
      rows = data.products; ready = true;
      if (typeof options.onCatalog === "function") options.onCatalog(rows);
      return rows;
    }
    async function jsonFetch(url, init, timeout) {
      var controller = new global.AbortController();
      var timer = global.setTimeout(function () { controller.abort(); }, timeout);
      try {
        var response = await request(url, Object.assign({}, init, { signal: controller.signal }));
        if (!/application\/json/i.test(response.headers.get("content-type") || "")) throw error("response_uncertain");
        var data = await response.json();
        if (!data || typeof data.ok !== "boolean") throw error("response_uncertain");
        return { response: response, data: data };
      } catch (e) { throw e.code ? e : error("response_uncertain"); }
      finally { global.clearTimeout(timer); }
    }
    function refresh() {
      if (loading) return loading;
      ready = false;
      loading = (async function () {
        var result = await jsonFetch(config.path + "/api/products", { method: "GET", cache: "no-store", credentials: "same-origin" }, 12000);
        if (!result.response.ok) throw error("catalog_unavailable");
        return setCatalog(result.data);
      })().finally(function () { loading = null; });
      return loading;
    }
    function reconcile() {
      // Loading or failed catalog requests must never erase a saved cart.
      if (!ready) return false;
      var current = read(), next = [], byId = new Map();
      rows.forEach(function (p) { byId.set(p.id, p); });
      var combined = new Map();
      current.forEach(function (x) {
        var p = byId.get(x.product_id); if (!isPurchasable(p)) return;
        var q = Math.max(1, Math.floor(Number(x.qty) || 1));
        var old = combined.get(p.id);
        combined.set(p.id, { source: old ? old.source : x, product: p, qty: Math.min(20, (old ? old.qty : 0) + q) });
      });
      combined.forEach(function (value) {
        var p = value.product, q = value.qty;
        if (String(p.stock_status).toLowerCase() === "tracked") {
          var available = Math.max(0, Math.floor(Number(p.available) || 0));
          if (!available) return; q = Math.min(q, available);
        }
        next.push(Object.assign({}, value.source, { product_id: p.id, name: p.product_name, sku: p.sku,
          unit_price_thb: Number(p.selling_price_thb), qty: q }));
      });
      var changed = JSON.stringify(current) !== JSON.stringify(next);
      if (changed) write(next);
      return changed;
    }
    function makeKey() {
      if (!global.crypto || !global.crypto.getRandomValues) throw error("checkout_secure_context_required");
      var bytes = new Uint8Array(32); global.crypto.getRandomValues(bytes);
      return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    }
    function paymentUrl(value) {
      var url;
      try { url = new URL(value, global.location.origin); } catch (_) { throw error("response_uncertain"); }
      if (url.protocol !== "https:" || !["mmdbkk.com", "www.mmdbkk.com"].includes(url.hostname)
        || url.port || url.username || url.password || url.pathname !== "/pay/checkout" || !url.searchParams.get("t"))
        throw error("response_uncertain");
      return url.href;
    }
    async function send(body) {
      return jsonFetch(config.path + "/api/checkout", { method: "POST", credentials: "include",
        headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, 25000);
    }
    async function finish(result) {
      var data = result.data;
      if (!result.response.ok || data.ok !== true) {
        if (data.safe_new_attempt === true) clearPending();
        throw error(data.error || "response_uncertain", data);
      }
      if (data.shop !== options.shop || typeof data.order_id !== "string" || !data.order_id.startsWith(options.shop === "shop" ? "HIMAI-" : "MMD-"))
        throw error("response_uncertain");
      var destination = paymentUrl(data.payment_url);
      // Only remove submitted quantities. Items added during a slow request remain in the cart.
      if (!pending.cart_finalized) {
        var quantities = new Map();
        pending.body.items.forEach(function (x) { quantities.set(x.product_id, (quantities.get(x.product_id) || 0) + x.quantity); });
        var next = read().map(function (x) {
          var remove = Math.min(Math.max(0, Number(x.qty) || 0), quantities.get(x.product_id) || 0);
          quantities.set(x.product_id, Math.max(0, (quantities.get(x.product_id) || 0) - remove));
          return Object.assign({}, x, { qty: Math.max(0, Number(x.qty) || 0) - remove });
        }).filter(function (x) { return x.qty > 0; });
        // Persist completion first so a repeated recovery cannot subtract the same units twice.
        savePending(Object.assign({}, pending, { cart_finalized: true, cart_before: read(), final_cart: next }));
      }
      var currentCart = read();
      var unchanged = JSON.stringify(currentCart) === JSON.stringify(pending.cart_before);
      if (!write(unchanged ? pending.final_cart : currentCart)) throw error("checkout_storage_required", { order_id: data.order_id });
      clearPending();
      return Object.assign({}, data, { payment_url: destination });
    }
    async function checkout(payload) {
      if (busy) throw error("checkout_in_progress");
      busy = true;
      try {
        if (corrupt) throw error("checkout_recovery_required");
        if (pending) {
          var recovery = await send({ checkout_request_id: pending.id, recover: true });
          if (recovery.response.status === 404 && recovery.data.error === "checkout_attempt_not_received") recovery = await send(pending.body);
          return await finish(recovery);
        }
        if (!storageReady()) throw error("checkout_storage_required");
        if (!payload) throw error("checkout_recovery_required");
        await refresh();
        if (reconcile()) throw error("cart_updated");
        var cart = read();
        if (!cart.length) throw error("cart_empty");
        var total = cart.reduce(function (sum, x) { return sum + x.qty * x.unit_price_thb; }, 0);
        var body = { customer: payload.customer, shipping: payload.shipping, source_path: config.path,
          items: cart.map(function (x) { return { product_id: x.product_id, quantity: x.qty }; }),
          quote: { currency: "THB", total_thb: Math.round(total * 100) / 100,
            items: cart.map(function (x) { return { product_id: x.product_id, unit_price_thb: x.unit_price_thb }; }) },
          checkout_request_id: makeKey() };
        savePending({ id: body.checkout_request_id, body: body, created_at: new Date().toISOString(), cart_finalized: false });
        return await finish(await send(body));
      } finally { busy = false; }
    }
    return { read: read, write: write, refresh: refresh, reconcile: reconcile, checkout: checkout,
      hasPending: function () { return !!pending || corrupt; }, isReady: function () { return ready; },
      isBusy: function () { return busy; }, setCatalog: setCatalog };
  }
  global.MMDShopReliability = Object.freeze({ version: 1, create: create, isPurchasable: isPurchasable, message: message });
}
export const SHOP_RELIABILITY_SOURCE = "(" + installShopReliability.toString() + ")(globalThis);\n";
