import { pathToFileURL } from "node:url";

export const HIMAI_ORIGINS = Object.freeze([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
]);

function requireValue(value, message) {
  if (!value) throw new Error(message);
}

function verifyDestination(response, requestedUrl) {
  const actual = new URL(response.url || requestedUrl);
  const expected = new URL(requestedUrl);
  requireValue(HIMAI_ORIGINS.includes(actual.origin), "unexpected_route_origin");
  requireValue(
    actual.pathname.replace(/\/$/, "") === expected.pathname.replace(/\/$/, ""),
    "unexpected_route_redirect",
  );
}

async function getRoute(url, fetchImpl, attempts, pause) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      });
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel();
        throw new Error(`route_http_${response.status}`);
      }
      verifyDestination(response, url);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await pause(1000 * (attempt + 1));
    }
  }
  throw lastError || new Error("route_unavailable");
}

async function readJson(response, expectedStatus, label) {
  requireValue(response.status === expectedStatus, `${label}_http_${response.status}`);
  requireValue(
    /application\/json/i.test(response.headers.get("content-type") || ""),
    `${label}_not_json`,
  );
  return response.json();
}

/** Read-only routing checks: never create an order, reserve stock, or send a payment. */
export async function verifyHimaiShopRoutes({
  fetchImpl = globalThis.fetch,
  origins = HIMAI_ORIGINS,
  attempts = 4,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  requireValue(Number.isInteger(attempts) && attempts >= 1 && attempts <= 6, "invalid_attempts");
  requireValue(Array.isArray(origins) && origins.length > 0, "origins_required");
  const checks = [];
  for (const origin of origins) {
    requireValue(HIMAI_ORIGINS.includes(origin), "unexpected_probe_origin");
    const catalogResponse = await getRoute(`${origin}/shop/api/products`, fetchImpl, attempts, pause);
    const catalog = await readJson(catalogResponse, 200, "himai_catalog");
    requireValue(catalog.ok === true && catalog.shop === "shop", "himai_catalog_brand_mismatch");
    requireValue(catalog.pricing_source === "Himai Selling Price THB", "himai_pricing_source_mismatch");
    requireValue(Array.isArray(catalog.products), "himai_catalog_products_missing");
    for (const product of catalog.products) {
      requireValue(product && typeof product === "object", "himai_catalog_product_invalid");
      const restricted = product.online_checkout_status === "restricted"
        || /^PPP25-/i.test(String(product.sku || ""))
        || /\b(?:pod|nicotine|vape|e[-\s]?cig(?:arette)?s?)\b/i.test(
          [product.product_name, product.description].join(" "),
        );
      requireValue(!restricted || product.checkout_eligible !== true, "restricted_checkout_must_stay_closed");
    }

    // A mounted POST-only endpoint must reject GET before any business mutation.
    const checkoutResponse = await getRoute(`${origin}/shop/api/checkout`, fetchImpl, attempts, pause);
    const checkout = await readJson(checkoutResponse, 405, "himai_checkout");
    requireValue(checkout.ok === false && checkout.error === "method_not_allowed", "himai_checkout_route_not_mounted");

    const rootResponse = await getRoute(`${origin}/shop/`, fetchImpl, attempts, pause);
    requireValue(rootResponse.status === 200, `himai_storefront_http_${rootResponse.status}`);
    requireValue(/text\/html/i.test(rootResponse.headers.get("content-type") || ""), "himai_storefront_not_html");
    const html = await rootResponse.text();
    requireValue(/id\s*=\s*["']himai-shop-v3["']/i.test(html), "himai_storefront_v3_not_published");
    requireValue(/data-catalog\s*=\s*["']\/shop\/api\/products["']/i.test(html), "himai_storefront_catalog_mismatch");
    requireValue(/data-checkout\s*=\s*["']\/shop\/api\/checkout["']/i.test(html), "himai_storefront_checkout_mismatch");
    checks.push({ origin, catalog: "passed", checkout_route: "passed", storefront: "passed", product_count: catalog.products.length });
  }
  return { schema: "himai_shop_route_smoke_v1", ok: true, read_only: true, mutations: 0, checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyHimaiShopRoutes()
    .then((receipt) => console.log(JSON.stringify(receipt, null, 2)))
    .catch((error) => {
      console.error(`Himai route smoke failed: ${error.message}`);
      process.exitCode = 1;
    });
}
