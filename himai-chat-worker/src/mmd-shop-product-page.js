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
    return unavailable(request);
  }

  if (!response.ok) return unavailable(request);
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

function unavailable(request) {
  const lang = requestLanguage(request);
  const copy = {
    th: { title: "เปิดรายละเอียดสินค้าไม่ได้", body: "กรุณากลับไปที่ MMD Shop แล้วลองอีกครั้ง", back: "กลับ MMD Shop" },
    en: { title: "Product details unavailable", body: "Please return to MMD Shop and try again.", back: "Back to MMD Shop" },
    zh: { title: "无法打开商品详情", body: "请返回 MMD Shop 后再试一次。", back: "返回 MMD Shop" }
  }[lang];
  const htmlLang = lang === "zh" ? "zh-CN" : lang;
  const shopUrl = `/mmd-shop?lang=${encodeURIComponent(lang)}`;
  return new Response(
    `<!doctype html><html lang="${htmlLang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD Shop Product</title><body style="font-family:system-ui;padding:32px;background:#f4f5f2;color:#111416"><h1>${copy.title}</h1><p>${copy.body}</p><a href="${shopUrl}">${copy.back}</a></body></html>`,
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

function requestLanguage(request) {
  let value = "";
  try { value = new URL(request.url).searchParams.get("lang") || ""; } catch {}
  if (!value) value = request.headers.get("accept-language") || "";
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "zh" || normalized.startsWith("zh-") || normalized.startsWith("zh,")) return "zh";
  if (normalized === "en" || normalized.startsWith("en-") || normalized.startsWith("en,")) return "en";
  return "th";
}
