const SOURCE_URL = "https://mmdprive.webflow.io/my-mmd-orders";
const CANONICAL_PATHS = new Set(["/my-mmd/orders", "/my-mmd/orders/"]);

export function isMyMmdOrdersPage(request) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return CANONICAL_PATHS.has(url.pathname.toLowerCase().replace(/\/{2,}/g, "/"))
    && ["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase());
}

export async function proxyMyMmdOrdersPage(request) {
  const method = String(request.method || "GET").toUpperCase();
  const upstream = new URL(SOURCE_URL);
  upstream.search = new URL(request.url).search;

  let response;
  try {
    response = await fetch(new Request(upstream, {
      method,
      headers: presentationHeaders(request),
      redirect: "follow",
    }));
  } catch {
    return recovery(method);
  }
  if (!response.ok) return recovery(method);

  const headers = new Headers(response.headers);
  for (const name of ["content-length", "set-cookie", "content-encoding", "etag", "last-modified", "report-to", "nel"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set("x-mmd-route-owner", "member-dashboard-chat-worker");
  headers.set("x-mmd-ui-source", "webflow:my-mmd-orders");
  headers.set("x-mmd-behavior-owner", "member-pages-worker");
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

function recovery(method) {
  const html = '<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MY MMD Orders</title><body style="font-family:system-ui;padding:32px;background:#f7f3ec;color:#181511"><h1>รายการสั่งซื้อยังเปิดไม่สำเร็จ</h1><p>กรุณากลับ MY MMD แล้วลองอีกครั้ง</p><a href="/my-mmd/">กลับ MY MMD</a></body></html>';
  return new Response(method === "HEAD" ? null : html, {
    status: 502,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}
