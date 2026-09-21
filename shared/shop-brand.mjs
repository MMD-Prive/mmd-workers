/** Canonical commerce configuration. Never resolve authority from browser labels. */
export const SHOP_INVENTORY_TABLE_ID = "tblwFgl4et1TOgtNn";
export const SHOP_STOCK_MOVEMENTS_TABLE_ID = "tblASifwHdArNKQP2";
export const SHOP_BRANDS = Object.freeze({
  "mmd-shop": Object.freeze({
    key: "mmd-shop", publicName: "MMD Shop", sourcePath: "/mmd-shop",
    path: "/mmd-shop/api/checkout", orderPrefix: "MMD", brandToken: "mmd",
    priceField: "fldD6Q5yido7pTlU0", priceFieldName: "MMD Shop Selling Price THB",
    telegramFlow: "mmd_shop_orders", telegramTitle: "MMD SHOP",
    paymentFlow: "mmd_shop_payments", paymentThread: 161, alertsThread: 162,
    paymentThreadEnv: "TG_THREAD_MMD_SHOP_PAYMENTS", alertsThreadEnv: "TG_THREAD_MMD_SHOP_ALERTS",
    paymentProfile: "mmd_shop_himai_v1",
  }),
  shop: Object.freeze({
    key: "shop", publicName: "Himai Shop", sourcePath: "/shop",
    path: "/shop/api/checkout", orderPrefix: "HIMAI", brandToken: "himai",
    priceField: "fldo4N9GRq6rHPiCh", priceFieldName: "Himai Selling Price THB",
    telegramFlow: "himai_orders", telegramTitle: "HIMAI SHOP",
    paymentFlow: "himai_payments", paymentThread: 158, alertsThread: 159,
    paymentThreadEnv: "TG_THREAD_HIMAI_PAYMENTS", alertsThreadEnv: "TG_THREAD_HIMAI_ALERTS",
    paymentProfile: "mmd_shop_himai_v1",
  }),
});

export function shopForCheckoutPath(path) {
  return Object.values(SHOP_BRANDS).find((shop) => shop.path === path) || null;
}

function key(value) {
  const text = String(value?.name ?? value ?? "").trim().toLowerCase();
  if (["shop", "himai", "himai shop"].includes(text)) return "shop";
  if (["mmd-shop", "mmd_shop", "mmd shop"].includes(text)) return "mmd-shop";
  return null;
}

/** Pass a record loaded by the server, not request JSON or an unsigned query. */
export function shopFromOrder(order) {
  const fields = order?.fields || {};
  const explicit = fields.fld97aHqq3IbPam84 ?? fields["Shop Brand"];
  const notes = String(fields.fldWG0u77XQ5W0wpT ?? fields.Notes ?? fields.notes ?? "");
  const orderId = String(fields.flde515MCoEq08YzU ?? fields["Order ID"] ?? "");
  const markers = [...notes.matchAll(/(?:^|[;\n])\s*shop_brand=([^;\n]+)/g)].map((m) => m[1].trim());
  const signals = [];
  for (const value of [explicit, ...markers].filter((v) => v !== undefined && v !== null && v !== "")) {
    const normalized = key(value);
    if (!normalized) throw Object.assign(new Error("shop_brand_unknown"), { status: 409 });
    signals.push(normalized);
  }
  if (/^HIMAI-/i.test(orderId)) signals.push("shop");
  if (/^MMD-/i.test(orderId)) signals.push("mmd-shop");
  if (new Set(signals).size > 1) throw Object.assign(new Error("shop_brand_conflict"), { status: 409 });
  // Historical unlabelled orders were MMD. Existing payment references stay unchanged.
  return SHOP_BRANDS[signals[0] || "mmd-shop"];
}

export function shopFromPaymentRecord(payment) {
  const f = payment?.fields || {};
  return shopFromOrder({ fields: {
    "Order ID": f.session_id ?? f["Session ID"] ?? f.fld2wdhBvc8xrV6y5 ?? "",
    Notes: f.Notes ?? f.notes ?? f.fldjsZIKoJPawlb2u ?? "",
  } });
}
