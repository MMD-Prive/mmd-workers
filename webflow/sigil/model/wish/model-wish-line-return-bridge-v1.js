/*
 * MMD MODEL Wish LINE Return Bridge V1
 *
 * The published Model Mini App endpoint is the canonical MMD MODEL dashboard,
 * not /sigil/model/wish. This page-scoped bridge prevents Wish from calling
 * liff.login() with location.href (which LINE rejects when the page is outside
 * the configured endpoint). Instead it enters LINE through the permanent Mini
 * App URL with an allowlisted return_to=wish intent.
 *
 * Draft handling:
 * - the existing Wish runtime remains authoritative for the draft shape;
 * - its sessionStorage draft is copied to a short-lived localStorage bridge
 *   only at handoff time, then restored once and removed on return;
 * - no token, LINE identity, Model identity, or authorization value is stored.
 */
(() => {
  "use strict";

  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/sigil/model/wish") return;

  const LIFF_IDS = Object.freeze({
    developing: "2010864852-MuzunIKU",
    review: "2010864853-7SqCQVxy",
    published: "2010864854-N34SgCqq",
  });
  const SESSION_DRAFT = "mmd_model_wish_draft_v5";
  const RETURN_DRAFT = "mmd_model_wish_line_return_v1";
  const MAX_AGE_MS = 30 * 60 * 1000;

  function environment() {
    const value = new URL(location.href).searchParams.get("liff_env");
    return value === "developing" || value === "review" ? value : "published";
  }

  function language() {
    const raw = String(
      new URL(location.href).searchParams.get("lang") ||
      document.documentElement.lang ||
      "th"
    ).toLowerCase();
    if (raw === "en" || raw.startsWith("en-")) return "en";
    if (
      raw === "zh" ||
      raw.startsWith("zh-") ||
      raw === "cn" ||
      raw.startsWith("cn-")
    ) return "zh";
    return "th";
  }

  function miniAppTarget() {
    const env = environment();
    const url = new URL(`https://miniapp.line.me/${LIFF_IDS[env]}/`);
    url.searchParams.set("flow", "verify");
    url.searchParams.set("return_to", "wish");
    url.searchParams.set("source", "model_wish");
    url.searchParams.set("lang", language());
    if (env !== "published") url.searchParams.set("liff_env", env);
    return url.toString();
  }

  function restoreReturnDraft() {
    try {
      const raw = localStorage.getItem(RETURN_DRAFT);
      if (!raw) return;
      localStorage.removeItem(RETURN_DRAFT);
      const saved = JSON.parse(raw);
      const savedAt = Number(saved?.saved_at);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > MAX_AGE_MS) return;
      if (typeof saved?.draft === "string" && !sessionStorage.getItem(SESSION_DRAFT)) {
        sessionStorage.setItem(SESSION_DRAFT, saved.draft);
      }
    } catch (_) {
      try { localStorage.removeItem(RETURN_DRAFT); } catch (_) {}
    }
  }

  function preserveReturnDraft() {
    try {
      const draft = sessionStorage.getItem(SESSION_DRAFT);
      if (!draft) return;
      localStorage.setItem(RETURN_DRAFT, JSON.stringify({
        saved_at: Date.now(),
        draft,
      }));
    } catch (_) {}
  }

  function handoff() {
    preserveReturnDraft();
    location.assign(miniAppTarget());
  }

  function installLiffHandoff() {
    const existing = window.liff;
    if (existing?.__mmdWishReturnBridge === true) return;

    if (existing) {
      try {
        existing.login = handoff;
        existing.__mmdWishReturnBridge = true;
        window.__mmdWishReturnBridge = { target: miniAppTarget, handoff };
        return;
      } catch (_) {}
    }

    // The current Wish runtime first checks window.liff. This minimal adapter
    // keeps that runtime intact while replacing only its invalid login step.
    window.liff = {
      __mmdWishReturnBridge: true,
      init: async () => {},
      isLoggedIn: () => false,
      login: handoff,
      getIDToken: () => null,
    };
    window.__mmdWishReturnBridge = { target: miniAppTarget, handoff };
  }

  restoreReturnDraft();
  installLiffHandoff();
})();
