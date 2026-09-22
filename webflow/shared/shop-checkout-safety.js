/* Shared by Himai and MMD. Load in the page head before the existing commerce script. */
(function (host) {
  'use strict';
  if (host.MMDShopCheckoutSafety && host.MMDShopCheckoutSafety.version === 1) return;
  var TTL = 45 * 60 * 1000;
  function issue(code, extra) { return Object.assign(new Error(code), extra || {}); }
  function cartStore(key) {
    var memory = [], degraded = false;
    return {
      read: function () {
        if (!degraded) {
          try { var parsed = JSON.parse(host.localStorage.getItem(key) || '[]'); memory = Array.isArray(parsed) ? parsed : []; }
          catch (_) { degraded = true; }
        }
        return memory.slice();
      },
      write: function (rows) {
        memory = rows.slice();
        try { host.localStorage.setItem(key, JSON.stringify(memory)); }
        catch (_) { degraded = true; }
      }
    };
  }
  function blocked(p) {
    return !p || p.checkout_eligible !== true || !(Number(p.selling_price_thb) > 0)
      || /^PPP25-/i.test(p.sku || '') || /\b(?:nicotine|vape|e[-\s]?cig(?:arette)?s?)\b/i.test([p.product_name, p.description].join(' '));
  }
  function reconcile(rows, products, loaded, money) {
    if (!loaded) return { items: rows, changed: false };
    var byId = new Map(products.map(function (p) { return [p.id, p]; })), merged = new Map();
    rows.forEach(function (x) {
      if (!x || typeof x !== 'object') return;
      var p = byId.get(x.product_id); if (blocked(p)) return;
      var quantity = Math.max(1, Math.min(20, Math.floor(Number(x.qty) || 1)));
      var previous = merged.get(p.id);
      if (previous) quantity += previous.qty;
      quantity = Math.min(20, quantity);
      if (p.stock_status === 'tracked') quantity = Math.min(quantity, Math.max(0, Math.floor(Number(p.available) || 0)));
      if (!quantity) return;
      var next = { product_id: p.id, name: p.product_name, sku: p.sku, unit_price_thb: Number(p.selling_price_thb), qty: quantity };
      if (x.key !== undefined) next.key = p.id;
      if (x.price !== undefined) next.price = money ? money(p.selling_price_thb) : String(p.selling_price_thb);
      merged.set(p.id, next);
    });
    var items = Array.from(merged.values());
    return { items: items, changed: JSON.stringify(rows) !== JSON.stringify(items) };
  }
  async function jsonRequest(url, options, timeout) {
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, timeout || 15000);
    try {
      var response = await host.fetch(url, Object.assign({}, options, { signal: controller.signal }));
      var data = await response.json().catch(function () { return null; });
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw issue('invalid_server_response');
      if (!response.ok || data.ok !== true) throw issue(data.error || 'request_failed', { data: data, status: response.status });
      return data;
    } finally { clearTimeout(timer); }
  }
  function paymentDestination(raw) {
    var u; try { u = new URL(raw); } catch (_) { try { u = new URL(raw, host.location.origin); } catch (_) { throw issue('invalid_payment_destination'); } }
    var allowedHost = ['mmdbkk.com', 'www.mmdbkk.com'].indexOf(u.hostname) >= 0;
    if (u.protocol !== 'https:' || !allowedHost || u.port || u.username || u.password || u.pathname !== '/pay/checkout' || !u.searchParams.get('t')) throw issue('invalid_payment_destination');
    return u.href;
  }
  function checkoutClient(shop, endpoint) {
    var pendingKey = 'shop_checkout_attempt_v1:' + shop, busy = false;
    function read() {
      try {
        var item = JSON.parse(host.sessionStorage.getItem(pendingKey) || 'null');
        if (!item || typeof item !== 'object') return null;
        if (Date.now() - Number(item.created_at || 0) > TTL) {
          item = { key: item.key, signature: item.signature, state: item.state === 'complete' || item.state === 'completed_expired' ? 'completed_expired' : 'expired', order_id: item.order_id || null, created_at: item.created_at };
          write(item);
        }
        return item;
      } catch (_) { return { state: 'storage_unavailable' }; }
    }
    function write(item) {
      try {
        var serialized = JSON.stringify(item);
        host.sessionStorage.setItem(pendingKey, serialized);
        if (host.sessionStorage.getItem(pendingKey) !== serialized) throw issue('checkout_storage_required');
      } catch (_) { throw issue('checkout_storage_required'); }
    }
    function clear() { try { host.sessionStorage.removeItem(pendingKey); } catch (_) {} }
    async function signature(payload) {
      if (!host.crypto || !host.crypto.subtle || !host.crypto.getRandomValues) throw issue('checkout_crypto_required');
      var bytes = await host.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
      return Array.from(new Uint8Array(bytes), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    function newKey() {
      var bytes = host.crypto.getRandomValues(new Uint8Array(16));
      return 'sc1_' + Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    async function send(item) {
      try {
        var data = await jsonRequest(endpoint, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'idempotency-key': item.key }, body: JSON.stringify(Object.assign({}, item.payload, { checkout_key: item.key })) }, 30000);
        data.payment_url = paymentDestination(data.payment_url);
        if (data.shop && data.shop !== shop) throw issue('checkout_brand_mismatch');
        if (!data.order_id) throw issue('checkout_order_missing');
        var receipt = { ok: true, shop: shop, order_id: data.order_id, payment_url: data.payment_url, payment_ref: data.payment_ref || null };
        // The successful server receipt is enough to continue; it never establishes paid status.
        try { write({ key: item.key, signature: item.signature, state: 'complete', created_at: item.created_at, order_id: data.order_id, receipt: receipt }); } catch (_) {}
        return receipt;
      } catch (error) {
        if (error.data && error.data.new_attempt_allowed === true) clear();
        else {
          try { write(Object.assign({}, item, { state: 'uncertain', order_id: error.data && error.data.order_id || item.order_id || null })); } catch (_) {}
        }
        throw error;
      }
    }
    return {
      pending: read,
      unresolved: function () { var p = read(); return !!p && p.state !== 'complete' && p.state !== 'completed_expired' && p.state !== 'storage_unavailable'; },
      resetCompleted: function () { var p = read(); if (p && (p.state === 'complete' || p.state === 'completed_expired')) clear(); },
      submit: async function (payload) {
        if (busy) throw issue('checkout_in_progress'); busy = true;
        try {
          var hash = await signature(payload), previous = read();
          if (previous && previous.state === 'storage_unavailable') throw issue('checkout_storage_required');
          if (previous && previous.state === 'expired') throw issue('checkout_resume_expired', { data: previous });
          if (previous && previous.signature === hash) {
            if (previous.state === 'complete') return previous.receipt;
            if (previous.state === 'completed_expired') throw issue('checkout_resume_expired', { data: previous });
            return await send(previous);
          }
          if (previous && previous.state !== 'complete' && previous.state !== 'completed_expired') throw issue('checkout_previous_attempt_pending', { data: previous });
          var item = { key: newKey(), signature: hash, state: 'sending', created_at: Date.now(), payload: payload };
          write(item); // Persist the exact draft before the first POST; never blindly mint a retry key.
          return await send(item);
        } finally { busy = false; }
      },
      resume: async function () {
        if (busy) throw issue('checkout_in_progress'); busy = true;
        try {
          var item = read();
          if (item && item.state === 'storage_unavailable') throw issue('checkout_storage_required');
          if (!item || item.state === 'expired' || item.state === 'completed_expired') throw issue('checkout_resume_expired', { data: item || {} });
          if (item.state === 'complete') return item.receipt;
          return await send(item);
        } finally { busy = false; }
      }
    };
  }
  var EXTRA = {
    en: { resume: 'Check previous order', unknown: 'The result is not confirmed. Check the same order again; do not start another payment.', loading: 'Loading current stock...', storage: 'Enable session storage before ordering, so an interrupted order can be recovered safely.', expired: 'This attempt needs review. Contact the shop with the order reference; do not pay twice.', retry: 'Try again', empty: 'No products are currently available.' },
    th: { resume: '\u0e15\u0e23\u0e27\u0e08\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e40\u0e14\u0e34\u0e21', unknown: '\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e17\u0e23\u0e32\u0e1a\u0e1c\u0e25 \u0e01\u0e14\u0e15\u0e23\u0e27\u0e08\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e40\u0e14\u0e34\u0e21\u0e44\u0e14\u0e49 \u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e08\u0e48\u0e32\u0e22\u0e0b\u0e49\u0e33', loading: '\u0e01\u0e33\u0e25\u0e31\u0e07\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e15\u0e4a\u0e2d\u0e01', storage: '\u0e01\u0e23\u0e38\u0e13\u0e32\u0e40\u0e1b\u0e34\u0e14\u0e01\u0e32\u0e23\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e02\u0e2d\u0e07\u0e40\u0e1a\u0e23\u0e32\u0e27\u0e4c\u0e40\u0e0b\u0e2d\u0e23\u0e4c\u0e01\u0e48\u0e2d\u0e19\u0e2a\u0e31\u0e48\u0e07\u0e0b\u0e37\u0e49\u0e2d', expired: '\u0e01\u0e23\u0e38\u0e13\u0e32\u0e15\u0e34\u0e14\u0e15\u0e48\u0e2d\u0e23\u0e49\u0e32\u0e19\u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e40\u0e25\u0e02 Order \u0e40\u0e14\u0e34\u0e21 \u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e08\u0e48\u0e32\u0e22\u0e0b\u0e49\u0e33', retry: '\u0e25\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48', empty: '\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e43\u0e19\u0e02\u0e13\u0e30\u0e19\u0e35\u0e49' },
    zh: { resume: '\u67e5\u770b\u539f\u8ba2\u5355', unknown: '\u7ed3\u679c\u5c1a\u672a\u786e\u8ba4\uff0c\u8bf7\u518d\u6b21\u67e5\u770b\u539f\u8ba2\u5355\uff0c\u4e0d\u8981\u91cd\u590d\u4ed8\u6b3e\u3002', loading: '\u6b63\u5728\u786e\u8ba4\u5e93\u5b58', storage: '\u8bf7\u5141\u8bb8\u6d4f\u89c8\u5668\u4f1a\u8bdd\u5b58\u50a8\uff0c\u4ee5\u4fbf\u5b89\u5168\u6062\u590d\u8ba2\u5355\u3002', expired: '\u8bf7\u63d0\u4f9b\u539f\u8ba2\u5355\u53f7\u8054\u7cfb\u5546\u5e97\uff0c\u4e0d\u8981\u91cd\u590d\u4ed8\u6b3e\u3002', retry: '\u91cd\u8bd5', empty: '\u76ee\u524d\u6ca1\u6709\u53ef\u7528\u5546\u54c1\u3002' }
  };
  function extra(key, lang) { return (EXTRA[lang] || EXTRA.th)[key] || key; }
  function bindFlow(config) {
    var running = false, client = checkoutClient(config.shop, config.endpoint);
    var find = function (key) { return config.root.querySelector('#' + config.ids[key]); };
    var val = function (key) { var el = find(key); return el ? String(el.value || '').trim() : ''; };
    var message = function (key) { return config.message(key); };
    var more = function (key) { return extra(key, config.lang()); };
    var flow = {
      pending: function () { return client.unresolved(); },
      beginNewCart: function () { client.resetCompleted(); },
      locked: function () { return running || client.unresolved(); },
      run: async function () {
        if (running) return;
        var button = find('button'), status = find('status'); if (!button || !status) return;
        running = true; button.disabled = true; config.root.setAttribute('aria-busy', 'true');
        try {
          status.textContent = message('opening');
          var data;
          if (client.unresolved()) data = await client.resume();
          else {
            var refreshedCart = await config.refresh();
            if (refreshedCart || config.reconcile()) { status.textContent = message('cartUpdated'); return; }
            var cart = config.cart();
            if (!cart.length) { status.textContent = message('needCart'); return; }
            var name = val('name'), phone = val('phone'), email = val('email'), method = val('method');
            if (name.length < 2 || phone.replace(/\D/g, '').length < 8 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { status.textContent = message('contactReq'); return; }
            if (['delivery', 'pickup'].indexOf(method) < 0) { status.textContent = message('addressReq'); return; }
            var shipping = { delivery_method: method, recipient_name: name, phone: phone, delivery_note: val('note') };
            if (method === 'delivery') {
              Object.assign(shipping, { address_line1: val('address1'), address_line2: val('address2'), subdistrict: val('subdistrict'), district: val('district'), province: val('province'), postal_code: val('postal').replace(/\D/g, '').slice(0, 5) });
              if (shipping.address_line1.length < 5 || !shipping.district || !shipping.province || shipping.postal_code.length !== 5) { status.textContent = message('addressReq'); return; }
            }
            data = await client.submit({ customer: { name: name, phone: phone, email: email }, shipping: shipping, source_path: config.shop === 'shop' ? '/shop' : '/mmd-shop', items: cart.map(function (x) { return { product_id: x.product_id, quantity: Number(x.qty), expected_unit_price_thb: Number(x.unit_price_thb) }; }) });
          }
          config.clearCart();
          var destination = paymentDestination(data.payment_url);
          if (config.navigate) config.navigate(destination); else host.location.assign(destination);
        } catch (error) {
          var code = error.message;
          var base = code === 'checkout_storage_required' || code === 'checkout_crypto_required' ? more('storage')
            : code === 'checkout_resume_expired' || code === 'checkout_recovery_required' || code === 'checkout_key_conflict' ? more('expired')
            : code === 'cart_price_changed' || code === 'insufficient_stock' ? message('cartUpdated')
            : client.unresolved() ? more('unknown') : message('failed');
          var order = error.data && error.data.order_id;
          status.textContent = base + (order ? ' [Order: ' + String(order).slice(0, 100) + ']' : '');
        } finally {
          running = false; button.disabled = false; config.root.removeAttribute('aria-busy');
          button.textContent = client.unresolved() ? more('resume') : message('checkout');
        }
      }
    };
    return flow;
  }
  host.MMDShopCheckoutSafety = Object.freeze({ version: 1, cartStore: cartStore, reconcile: reconcile, jsonRequest: jsonRequest, paymentDestination: paymentDestination, checkoutClient: checkoutClient, bindFlow: bindFlow, extra: extra });
})(typeof window !== 'undefined' ? window : globalThis);
