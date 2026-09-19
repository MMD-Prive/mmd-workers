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

const MMD_PRODUCT_PREFIX = "/mmd-shop/api/product/";

export async function handleShopCatalog(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const productLookup = url.pathname.startsWith(MMD_PRODUCT_PREFIX);

  if (method === "OPTIONS" && (
    url.pathname === "/shop/api/products" ||
    url.pathname === "/mmd-shop/api/products" ||
    productLookup
  )) {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (method === "GET" && url.pathname === "/shop/api/products") {
    return listProducts(env, "shop");
  }

  if (method === "GET" && url.pathname === "/mmd-shop/api/products") {
    return listProducts(env, "mmd-shop");
  }

  if (method === "GET" && productLookup) {
    const slug = decodeLookup(url.pathname.slice(MMD_PRODUCT_PREFIX.length));
    return getMmdProduct(env, slug);
  }

  return null;
}

async function listProducts(env, shopKey) {
  const shop = SHOP_CONFIG[shopKey];
  if (!shop) return json({ ok: false, error: "Unknown shop" }, 400);

  const products = await loadProducts(env, shopKey);

  return json({
    ok: true,
    shop: shopKey,
    shop_name: shop.publicName,
    pricing_source: shop.priceField,
    source_table: env.SHARED_SHOP_PRODUCTS_TABLE_ID || "tblzsmNLfP6J0kQ90",
    products
  });
}

async function getMmdProduct(env, slug) {
  if (!slug) return json({ ok: false, error: "product_slug_required" }, 400);

  const products = await loadProducts(env, "mmd-shop");
  const needle = normalizeLookup(slug);
  const product = products.find((item) => {
    const keys = [
      item.id,
      item.sku,
      item.canonical_slug,
      item.product_name
    ].map(normalizeLookup);
    return keys.includes(needle);
  });

  if (!product || String(product.status || "").toLowerCase() !== "active") {
    return json({ ok: false, error: "product_not_found" }, 404);
  }

  const variants = product.variant_group
    ? products
        .filter((item) =>
          item
          && item.variant_group === product.variant_group
          && String(item.status || "").toLowerCase() === "active"
        )
        .sort(compareProductVariants)
    : [product];

  return json({
    ok: true,
    schema: "mmd_shop_product_v1",
    shop: "mmd-shop",
    product,
    variants
  });
}

async function loadProducts(env, shopKey) {
  const shop = SHOP_CONFIG[shopKey];
  if (!shop) return [];

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
    shopKey === "shop" ? loadHimaiStockByProduct(env) : loadMmdStockByProduct(env),
    loadSupplierNames(env)
  ]);

  return (result.records || [])
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

      const stockTracked = stockByProduct.has(record.id);
      const stock = stockByProduct.get(record.id) || { available: null, low: false };
      const sellingPrice = numberOrNull(recordFields[shop.priceField]);
      const supplierIds = Array.isArray(recordFields["Supplier"]) ? recordFields["Supplier"] : [];
      const supplier = supplierIds.map((id) => supplierNames.get(id) || id);
      const sku = recordFields["SKU"] || "";
      const productName = recordFields["Product Name"] || "";
      const status = selectName(recordFields["Status"]) || "";
      const note = recordFields["Product Note"] || "";
      const restricted = shopKey === "mmd-shop" && isRestrictedOnlineCheckout(sku, productName);
      const onDemand = shopKey === "mmd-shop" && isOnDemandProduct(note);
      const trackedOut = stockTracked && Number(stock.available) <= 0;
      const checkoutEligible = shopKey === "mmd-shop"
        ? status.toLowerCase() === "active"
          && sellingPrice > 0
          && !restricted
          && (
            (onDemand && supplierIds.length > 0)
            || (stockTracked && Number(stock.available) > 0)
          )
        : false;
      const canonicalSlug = slugify(sku || productName || record.id);
      const variant = mmdProductVariantMeta(sku, productName);

      return {
        id: record.id,
        product_name: productName,
        sku,
        canonical_slug: canonicalSlug,
        product_url: shopKey === "mmd-shop" ? `/mmd-shop/product/${encodeURIComponent(canonicalSlug)}` : null,
        variant_group: shopKey === "mmd-shop" ? variant.group : null,
        variant_type: shopKey === "mmd-shop" ? variant.type : null,
        variant_value: shopKey === "mmd-shop" ? variant.value : null,
        category: selectName(recordFields["Category"]) || "Selected",
        status,
        curation_label: selectName(recordFields["Curation Label"]) || "",
        supplier,
        selling_price_thb: sellingPrice,
        price_status: sellingPrice === null || sellingPrice <= 0 ? "ask_shop" : "priced",
        description: note,
        curator_note: note,
        available: onDemand ? null : stock.available,
        low_stock: onDemand ? false : stock.low,
        stock_status: onDemand ? "on_demand" : stockTracked ? "tracked" : "untracked",
        checkout_eligible: checkoutEligible,
        online_checkout_status: restricted
          ? "restricted"
          : onDemand
            ? checkoutEligible ? "on_demand" : "unavailable"
            : !stockTracked
              ? "stock_untracked"
              : trackedOut
                ? "out_of_stock"
              : sellingPrice === null || sellingPrice <= 0
                ? "ask_shop"
                : checkoutEligible
                  ? "available"
                  : "unavailable",
        image_url: productImageUrl(sku)
      };
    })
    .filter(Boolean);
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

async function loadMmdStockByProduct(env) {
  const tableId = env.MMD_SHOP_INVENTORY_BATCHES_TABLE_ID || "tblwFgl4et1TOgtNn";
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

    if (batchStatus !== "active") continue;

    for (const productId of productIds) {
      const current = stockByProduct.get(productId) || { available: 0, low: false };
      current.available += remaining || 0;
      current.low = current.low || lowFlag.includes("low");
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

function productImageUrl(sku) {
  const code = String(sku || "").toUpperCase();
  if (code.startsWith("WGG-")) {
    return "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a8c2bc2521dbd91c40072a0_GG%20Water%2003.webp";
  }
  if (code.startsWith("PPP25-")) {
    return "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a8c2de261bf62d20a6d4a9e_Pod%20Plus%20MMD.webp";
  }
  if (code.startsWith("GLEN-POP")) {
    return "https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a8a7881b18c863ef26b9b64_Shop%20Pop%20Plus.webp";
  }
  return "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a8c1e2f03656a00250f4531_MMD%20Shop%20Luxury%20Gift%20Box.webp";
}

function mmdProductVariantMeta(sku, productName) {
  const code = String(sku || "").toUpperCase();
  const name = String(productName || "").trim();

  if (code.startsWith("WGG-")) {
    const size = code.match(/^WGG-(10|25|50)$/)?.[1] || name.match(/\b(10|25|50)\s*ml\b/i)?.[1] || "";
    return {
      group: "WGG",
      type: "size",
      value: size ? `${size}ml` : code
    };
  }

  if (code.startsWith("PPP25-")) {
    const suffix = code.slice("PPP25-".length);
    const flavourBySku = {
      KYO: "KyoHo Grape",
      MIX: "Mix-Fruit",
      PNA: "PineApple",
      COK: "Coke",
      GRP: "Grape",
      APL: "Apple",
      MGO: "Mango",
      WTM: "Water-Melon"
    };
    const nameValue = name
      .replace(/^Pod Premium Plus(?:\s*2\.5mg)?\s*[—-]?\s*/i, "")
      .trim();
    return {
      group: "PPP25",
      type: "flavour",
      value: flavourBySku[suffix] || nameValue || suffix
    };
  }

  return { group: null, type: null, value: null };
}

function compareProductVariants(a, b) {
  if (a?.variant_group === "WGG" && b?.variant_group === "WGG") {
    const number = (item) => Number(String(item?.variant_value || "").replace(/[^0-9.]/g, "")) || 999;
    return number(a) - number(b);
  }
  return String(a?.variant_value || a?.sku || "").localeCompare(
    String(b?.variant_value || b?.sku || ""),
    "en",
    { sensitivity: "base" }
  );
}

function isOnDemandProduct(note) {
  return /\bon[-\s]*demand\b/i.test(String(note || ""));
}

function isRestrictedOnlineCheckout(sku, productName) {
  const code = String(sku || "").toUpperCase();
  const label = String(productName || "").toLowerCase();
  return /^PPP25-/.test(code) || /\bpod\b/.test(label);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product";
}

function normalizeLookup(value) {
  return slugify(String(value || "").replace(/^rec/i, "rec"));
}

function decodeLookup(value) {
  try {
    return decodeURIComponent(String(value || "")).trim();
  } catch {
    return String(value || "").trim();
  }
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
