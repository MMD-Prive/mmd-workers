const SHOP_CONFIG = Object.freeze({
  shop: {
    publicName: "Himai Shop",
    priceField: "Himai Selling Price THB"
  },
  "mmd-shop": {
    publicName: "MMD Shop",
    priceField: "MMD Shop Selling Price THB"
  }
});

export async function handleShopCatalog(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === "OPTIONS" && (url.pathname === "/shop/api/products" || url.pathname === "/mmd-shop/api/products")) {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (method === "GET" && url.pathname === "/shop/api/products") {
    return listProducts(env, "shop");
  }

  if (method === "GET" && url.pathname === "/mmd-shop/api/products") {
    return listProducts(env, "mmd-shop");
  }

  return null;
}

async function listProducts(env, shopKey) {
  const shop = SHOP_CONFIG[shopKey];
  if (!shop) return json({ ok: false, error: "Unknown shop" }, 400);

  const tableId = env.SHARED_SHOP_PRODUCTS_TABLE_ID || "tblzsmNLfP6J0kQ90";
  const fields = ["Product Name", "SKU", "Supplier", shop.priceField];
  const params = new URLSearchParams();
  params.set("pageSize", "100");
  for (const field of fields) params.append("fields[]", field);

  const result = await airtableRequest(env, `${tableId}?${params.toString()}`);
  const products = (result.records || [])
    .map((record) => ({
      id: record.id,
      product_name: record.fields?.["Product Name"] || "",
      sku: record.fields?.["SKU"] || "",
      supplier: record.fields?.["Supplier"] || null,
      selling_price_thb: numberOrNull(record.fields?.[shop.priceField])
    }))
    .filter((product) => product.selling_price_thb !== null);

  return json({
    ok: true,
    shop: shopKey,
    shop_name: shop.publicName,
    pricing_source: shop.priceField,
    products
  });
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function airtableRequest(env, path) {
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${path}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` }
  });
  if (!response.ok) {
    throw new Error(`Airtable error: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders()
    }
  });
}
