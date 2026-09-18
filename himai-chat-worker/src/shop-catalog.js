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
  const fields = [
    "Product Name",
    "SKU",
    "Brand Availability",
    "Category",
    "Status",
    "Curation Label",
    "Supplier",
    "Product Note",
    shop.priceField
  ];

  const params = new URLSearchParams();
  params.set("pageSize", "100");
  for (const field of fields) params.append("fields[]", field);

  const [result, stockByProduct, supplierNames] = await Promise.all([
    airtableRequest(env, `${tableId}?${params.toString()}`),
    shopKey === "shop" ? loadHimaiStockByProduct(env) : Promise.resolve(new Map()),
    loadSupplierNames(env)
  ]);

  const products = (result.records || [])
    .map((record) => {
      const recordFields = record.fields || {};
      const brandAvailability = normalizeSelectList(recordFields["Brand Availability"]);
      const shouldShow = brandAvailability.length === 0 || brandAvailability.some((value) => {
        const normalized = value.toLowerCase();
        return shopKey === "shop"
          ? normalized.includes("himai") || normalized === "shop" || normalized.includes("both")
          : normalized.includes("mmd") || normalized === "mmd-shop" || normalized.includes("both");
      });

      if (!shouldShow) return null;

      const stock = stockByProduct.get(record.id) || { available: null, low: false };
      const sellingPrice = numberOrNull(recordFields[shop.priceField]);
      const supplierIds = Array.isArray(recordFields["Supplier"]) ? recordFields["Supplier"] : [];
      const supplier = supplierIds.map((id) => supplierNames.get(id) || id);

      return {
        id: record.id,
        product_name: recordFields["Product Name"] || "",
        sku: recordFields["SKU"] || "",
        category: selectName(recordFields["Category"]) || "Selected",
        status: selectName(recordFields["Status"]) || "",
        curation_label: selectName(recordFields["Curation Label"]) || "",
        supplier,
        selling_price_thb: sellingPrice,
        price_status: sellingPrice === null || sellingPrice <= 0 ? "ask_shop" : "priced",
        description: recordFields["Product Note"] || "",
        curator_note: recordFields["Product Note"] || "",
        available: stock.available,
        low_stock: stock.low,
        image_url: ""
      };
    })
    .filter(Boolean);

  return json({
    ok: true,
    shop: shopKey,
    shop_name: shop.publicName,
    pricing_source: shop.priceField,
    source_table: tableId,
    products
  });
}

async function loadHimaiStockByProduct(env) {
  const tableId = env.HIMAI_INVENTORY_BATCHES_TABLE_ID || "tblbTrOVfIc9s2E0k";
  const fields = ["Product", "Quantity Remaining", "Low Stock Flag", "Batch Status"];
  const params = new URLSearchParams();
  params.set("pageSize", "100");
  for (const field of fields) params.append("fields[]", field);

  const result = await airtableRequest(env, `${tableId}?${params.toString()}`);
  const stockByProduct = new Map();

  for (const record of result.records || []) {
    const fields = record.fields || {};
    const productIds = Array.isArray(fields["Product"]) ? fields["Product"] : [];
    const remaining = numberOrNull(fields["Quantity Remaining"]);
    const batchStatus = (selectName(fields["Batch Status"]) || "").toLowerCase();
    const lowFlag = (selectName(fields["Low Stock Flag"]) || "").toLowerCase();

    if (batchStatus.includes("archiv") || batchStatus.includes("closed")) continue;

    for (const productId of productIds) {
      const current = stockByProduct.get(productId) || { available: 0, low: false };
      current.available += remaining || 0;
      current.low = current.low || lowFlag.includes("low") || lowFlag.includes("yes") || lowFlag.includes("true");
      stockByProduct.set(productId, current);
    }
  }

  return stockByProduct;
}

async function loadSupplierNames(env) {
  const tableId = env.SHARED_SUPPLIERS_TABLE_ID || "tbl81bnFyASeXCj9x";
  const params = new URLSearchParams();
  params.set("pageSize", "100");
  params.append("fields[]", "Supplier Name");

  const result = await airtableRequest(env, `${tableId}?${params.toString()}`);
  const names = new Map();
  for (const record of result.records || []) {
    names.set(record.id, record.fields?.["Supplier Name"] || record.id);
  }
  return names;
}

function selectName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.name === "string") return value.name;
  return String(value);
}

function normalizeSelectList(value) {
  if (!value) return [];
  if (!Array.isArray(value)) return [selectName(value)].filter(Boolean);
  return value.map(selectName).filter(Boolean);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function airtableRequest(env, path) {
  const token = env.AIRTABLE_TOKEN || env.AIRTABLE_API_KEY;
  if (!token) throw new Error("Airtable token is not configured");

  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
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
