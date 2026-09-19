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
    return unavailable(request);
  }

  if (!response.ok) return unavailable(request);
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

function unavailable(request) {
  const lang = requestLanguage(request);
  const copy = {
    th: { title: "เปิดรายการสั่งซื้อไม่ได้", body: "กรุณากลับไปที่ MMD Shop แล้วเปิดรายการอีกครั้ง", back: "กลับ MMD Shop" },
    en: { title: "Order unavailable", body: "Please return to MMD Shop and open the Order again.", back: "Back to MMD Shop" },
    zh: { title: "无法打开订单", body: "请返回 MMD Shop 后重新打开这张 Order。", back: "返回 MMD Shop" }
  }[lang];
  const htmlLang = lang === "zh" ? "zh-CN" : lang;
  const shopUrl = `/mmd-shop?lang=${encodeURIComponent(lang)}`;
  return new Response(
    `<!doctype html><html lang="${htmlLang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD Shop Order</title><body style="font-family:system-ui;padding:32px;background:#f4f5f2;color:#111416"><h1>${copy.title}</h1><p>${copy.body}</p><a href="${shopUrl}">${copy.back}</a></body></html>`,
    {
      status: 502,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
    }
  );
}

function requestLanguage(request) {
  let value = "";
  try { value = new URL(request.url).searchParams.get("lang") || ""; } catch {}
  if (!value) value = request.headers.get("accept-language") || "";
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "zh" || normalized.startsWith("zh-") || normalized.startsWith("zh,")) return "zh";
  if (normalized === "en" || normalized.startsWith("en-") || normalized.startsWith("en,")) return "en";
  return "th";
}
