const SOURCE_URL = "https://mmdprive.webflow.io/mmd-shop/product";
const ROUTE_PREFIX = "/mmd-shop/product/";

export function isMmdShopProductPageRequest(request) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  const path = url.pathname.replace(/\/{2,}/g, "/");
  const method = String(request.method || "GET").toUpperCase();
  return ["GET", "HEAD"].includes(method)
    && path.startsWith(ROUTE_PREFIX)
    && path.slice(ROUTE_PREFIX.length).replace(/\/+$/g, "").length > 0;
}

export async function handleMmdShopProductPage(request) {
  const method = String(request.method || "GET").toUpperCase();
  const source = new URL(request.url);
  const upstream = new URL(SOURCE_URL);
  upstream.search = source.search;

  let response;
  try {
    response = await fetch(new Request(upstream, {
      method,
      headers: presentationHeaders(request),
      redirect: "follow",
    }));
  } catch {
    return unavailable();
  }

  if (!response.ok) return unavailable();
  const headers = new Headers(response.headers);
  for (const name of [
    "content-length",
    "set-cookie",
    "content-encoding",
    "etag",
    "last-modified",
    "report-to",
    "nel"
  ]) headers.delete(name);

  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-robots-tag", "noindex, follow");
  headers.set("x-mmd-route-owner", "himai-chat-worker");
  headers.set("x-mmd-ui-source", "webflow:mmd-shop-product");

  if (method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(response.body, { status: 200, headers });
}

function presentationHeaders(request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function unavailable() {
  return new Response(
    "<!doctype html><html lang=\"th\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>MMD Shop Product</title><body style=\"font-family:system-ui;padding:32px;background:#f4efe7;color:#17130f\"><h1>เปิดรายละเอียดสินค้าไม่ได้</h1><p>กรุณากลับไปที่ MMD Shop แล้วลองอีกครั้ง</p><a href=\"/mmd-shop\">กลับ MMD Shop</a></body></html>",
    {
      status: 502,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow"
      },
    }
  );
}
