const SOURCE_URL = "https://mmdprive.webflow.io/mmd-shop-order";

export function isMmdShopOrderPageRequest(request) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  const path = url.pathname.replace(/\/+$/g, "") || "/";
  return path === "/mmd-shop/order" && ["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase());
}

export async function handleMmdShopOrderPage(request) {
  const method = String(request.method || "GET").toUpperCase();
  const upstream = new URL(SOURCE_URL);
  const source = new URL(request.url);
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
  for (const name of ["content-length", "set-cookie", "content-encoding", "etag", "last-modified", "report-to", "nel"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set("x-mmd-route-owner", "himai-chat-worker");
  headers.set("x-mmd-ui-source", "webflow:mmd-shop-order");
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
  return new Response("<!doctype html><html lang=\"th\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>MMD Shop Order</title><body style=\"font-family:system-ui;padding:32px;background:#f4efe7;color:#17130f\"><h1>เปิดรายการสั่งซื้อไม่ได้</h1><p>กรุณากลับไปที่ MMD Shop แล้วเปิดรายการอีกครั้ง</p><a href=\"/mmd-shop\">กลับ MMD Shop</a></body></html>", {
    status: 502,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}
