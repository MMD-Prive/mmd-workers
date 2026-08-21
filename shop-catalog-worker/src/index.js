export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, app: "shop-catalog-worker", shops: ["shop", "mmd-shop"] });
      }

      if (request.method === "GET" && url.pathname === "/shop/api/products") {
        return listProducts(env, "shop");
      }

      if (request.method === "GET" && url.pathname === "/mmd-shop/api/products") {
        return listProducts(env, "mmd-shop");
      }

      return json({ ok: false, error: "Not found" }, 404);
    } catch (error) {
      return json({ ok: false, error: "Unhandled error", detail: error?.message || String(error) }, 500);
    }
  }
};

const SHOP_CONFIG = Object.freeze({
  "shop": {
    publicName: "Himai Shop",
    priceField: "Himai Selling Price THB",
    visibilityField: "Show in Himai Shop"
  },
  "mmd-shop": {
    publicName: "MMD Shop",
    priceField: "MMD Shop Selling Price THB",
    visibilityField: "Show in MMD Shop"
  }
});

async function listProducts(env, shopKey) {
  const shop = SHOP_CONFIG[shopKey];
  if (!shop) return json({ ok: false, error: "Unknown shop" }, 400);

  const tableId = env.SHARED_SHOP_PRODUCTS_TABLE_ID;
  if (!tableId) return json({ ok: false, error: "Missing product table binding" }, 500);

  const fields = [
    "Product Name",
    "Product Ref",
    "Supplier",
    shop.priceField,
    shop.visibilityField
  ];
  const params = new URLSearchParams();
  params.set("pageSize", "100");
  for (const field of fields) params.append("fields[]", field);

  const result = await airtableRequest(env, `${tableId}?${params.toString()}`);
  const products = (result.records || [])
    .filter((record) => isVisible(record.fields?.[shop.visibilityField]))
    .map((record) => ({
      id: record.id,
      product_name: record.fields?.["Product Name"] || "",
      product_ref: record.fields?.["Product Ref"] || "",
      supplier: record.fields?.["Supplier"] || null,
      selling_price_thb: numberOrNull(record.fields?.[shop.priceField])
    }))
    .filter((product) => product.selling_price_thb !== null);

  return json({ ok: true, shop: shopKey, shop_name: shop.publicName, products });
}

function isVisible(value) {
  return value === true || value === 1 || String(value || "").toLowerCase() === "yes";
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function airtableRequest(env, path) {
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${path}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` }
  });
  if (!response.ok) throw new Error(`Airtable error: ${response.status} ${await response.text()}`);
  return response.json();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
