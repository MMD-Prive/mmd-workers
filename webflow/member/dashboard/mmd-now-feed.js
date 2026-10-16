(function (global) {
  "use strict";

  const ENDPOINT = "/api/v1/member/updates/list?limit=10";

  function safeSameOriginUrl(value, origin, allowWebflowCdn) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const base = new URL(origin);
      const url = new URL(value.trim(), base);
      if (url.origin === base.origin && (url.protocol === "https:" || url.protocol === "http:")) return url.pathname + url.search + url.hash;
      if (allowWebflowCdn === true && url.protocol === "https:" && ["cdn.prod.website-files.com", "uploads-ssl.webflow.com"].includes(url.hostname)) return url.href;
      return "";
    } catch (_) { return ""; }
  }

  function init(root, options) {
    options = options || {};
    const doc = options.document || root.ownerDocument || global.document;
    const fetcher = options.fetch || global.fetch;
    const origin = options.origin || (global.location && global.location.origin) || "https://mmdbkk.com";
    if (!root || !doc || typeof fetcher !== "function") return { load: function () {} };

    function status(message, kind) {
      root.replaceChildren();
      const box = doc.createElement("div");
      box.className = "mmd-now-state" + (kind ? " is-" + kind : "");
      box.setAttribute("role", kind === "error" ? "alert" : "status");
      box.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
      box.textContent = message;
      root.append(box);
      return box;
    }

    function render(items) {
      root.replaceChildren();
      const valid = (Array.isArray(items) ? items : []).filter(item => String(item && (item.title || item.headline) || "").trim());
      if (!valid.length) { status("ตอนนี้ยังไม่มีอัปเดตใหม่", "empty"); return; }
      valid.slice(0, 10).forEach(item => {
        const card = doc.createElement("article");
        card.className = "mmd-now-card";
        const title = doc.createElement("h3");
        title.textContent = String(item.title || item.headline).trim();
        card.append(title);
        const excerptText = String(item.excerpt || item.summary || "").trim();
        if (excerptText) { const excerpt = doc.createElement("p"); excerpt.textContent = excerptText; card.append(excerpt); }
        const imageUrl = safeSameOriginUrl(item.image_url || item.imageUrl || item.image, origin, true);
        if (imageUrl) {
          const image = doc.createElement("img");
          image.src = imageUrl; image.alt = String(item.image_alt || item.imageAlt || "").slice(0, 160);
          image.loading = "lazy"; image.decoding = "async";
          image.addEventListener("error", () => image.remove(), { once: true });
          card.append(image);
        }
        const cta = item.cta && typeof item.cta === "object" ? item.cta : {};
        const ctaLabel = String(cta.label || "").trim();
        const ctaUrl = safeSameOriginUrl(cta.url, origin);
        if (ctaLabel && ctaUrl) {
          const link = doc.createElement("a");
          link.className = "mmd-now-action"; link.href = ctaUrl; link.textContent = ctaLabel;
          link.style.minHeight = "48px"; link.style.display = "inline-flex"; link.style.alignItems = "center";
          link.style.padding = "0 18px";
          link.setAttribute("aria-label", ctaLabel); card.append(link);
        }
        root.append(card);
      });
    }

    let sequence = 0;
    async function load() {
      const requestId = ++sequence;
      status("กำลังตรวจสอบอัปเดตล่าสุด", "loading");
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = global.setTimeout ? global.setTimeout(() => controller && controller.abort(), 10000) : null;
      try {
        const response = await fetcher(ENDPOINT, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" }, ...(controller ? { signal: controller.signal } : {}) });
        const body = await response.json().catch(() => null);
        if (!response.ok || !body || typeof body !== "object" || (!Array.isArray(body.items) && !Array.isArray(body.news))) throw new Error("feed_unavailable");
        if (requestId === sequence) render(Array.isArray(body.items) ? body.items : body.news);
      } catch (_) {
        if (requestId !== sequence) return;
        const box = status("อัปเดตยังโหลดไม่สำเร็จ กรุณาลองอีกครั้ง", "error");
        const retry = doc.createElement("button");
        retry.type = "button"; retry.className = "mmd-now-action"; retry.textContent = "ลองอีกครั้ง";
        retry.style.minHeight = "48px"; retry.style.padding = "0 18px";
        retry.addEventListener("click", load); box.append(retry);
      } finally { if (timer !== null && global.clearTimeout) global.clearTimeout(timer); }
    }
    void load();
    return { load };
  }

  const api = { init, safeSameOriginUrl, ENDPOINT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.MMDNowFeed = api;
  if (global.document) {
    const start = () => global.document.querySelectorAll("[data-mmd-now-feed]").forEach(root => init(root));
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
