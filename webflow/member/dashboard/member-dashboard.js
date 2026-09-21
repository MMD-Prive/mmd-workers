/*
  MMD ME member dashboard Phase 1
  Page: /member/dashboard
  Authority: /api/member/dashboard -> member-dashboard-chat-worker -> member-pages-worker
*/

(function () {
  "use strict";

  const root = document.querySelector("[data-mmd-member-dashboard]") || document;
  const endpoint = root.dataset?.memberDashboardEndpoint || "/api/member/dashboard";
  const allowedParams = ["t", "code", "promo", "source", "invite"];
  const params = new URLSearchParams(window.location.search);

  const copy = {
    th: {
      loading: "กำลังตรวจสอบข้อมูล",
      unavailable: "ยังโหลดข้อมูลไม่ได้ครับ",
      invalid: "ลิงก์นี้ยังตรวจสอบข้อมูลสมาชิกไม่ได้ครับ",
      unknown: "กำลังตรวจสอบข้อมูล",
      noHistory: "ยังไม่มีประวัติที่ยืนยันแล้วใน 365 วันล่าสุด",
      partial: "ข้อมูลบางส่วนกำลังตรวจสอบอยู่ครับ",
      tierPrefix: "Tier",
      statusPrefix: "สถานะ",
      pointsSuffix: "แต้ม",
      historySuffix: "รายการยืนยันแล้ว",
    },
    en: {
      loading: "Checking member data",
      unavailable: "Member data is temporarily unavailable.",
      invalid: "This link cannot verify member data yet.",
      unknown: "Checking member data",
      noHistory: "No verified history in the last 365 days.",
      partial: "Some fields are still being checked.",
      tierPrefix: "Tier",
      statusPrefix: "Status",
      pointsSuffix: "points",
      historySuffix: "verified events",
    },
  };

  function lang() {
    const raw = (document.documentElement.lang || localStorage.getItem("mmd_lang") || "th").toLowerCase();
    return raw.startsWith("en") ? "en" : "th";
  }

  function t(key) {
    const dict = copy[lang()] || copy.th;
    return dict[key] || copy.th[key] || key;
  }

  function hook(name) {
    return root.querySelector(`[data-member-summary="${name}"]`);
  }

  function stateNode() {
    return root.querySelector("[data-member-dashboard-state]");
  }

  function setText(node, value, state = "ready") {
    if (!node) return;
    node.textContent = value;
    node.setAttribute("data-member-data-state", state);
  }

  function setState(message, state = "checking") {
    const node = stateNode();
    if (!node) return;
    node.textContent = message;
    node.setAttribute("data-member-dashboard-state-value", state);
  }

  function renderNeutral(message = t("unknown"), state = "checking") {
    setText(hook("tier"), message, "checking");
    setText(hook("points"), message, "checking");
    setText(hook("history"), message, "checking");
    setState(message, state);
  }

  function safeUrl() {
    const url = new URL(endpoint, window.location.origin);
    allowedParams.forEach((key) => {
      const value = params.get(key);
      if (value) url.searchParams.set(key, value);
    });
    return url;
  }

  function formatPoints(points) {
    if (!points || points.status !== "verified" || points.value == null) return t("unknown");
    return `${new Intl.NumberFormat(lang() === "th" ? "th-TH" : "en-US").format(points.value)} ${t("pointsSuffix")}`;
  }

  function formatTier(member) {
    const tier = member?.tier;
    const status = member?.membership_status;
    if (!tier || tier.status !== "verified" || !tier.value) return t("unknown");
    const statusText = status?.status === "verified" && status.value ? ` · ${t("statusPrefix")}: ${status.value}` : "";
    return `${t("tierPrefix")}: ${tier.value}${statusText}`;
  }

  function formatHistory(history) {
    if (!history || history.status === "checking" || history.status === "partial") return t("unknown");
    const count = Array.isArray(history.events) ? history.events.length : 0;
    if (!count) return t("noHistory");
    return `${count} ${t("historySuffix")}`;
  }

  function renderDashboard(payload) {
    const data = payload && payload.data;
    if (!payload?.ok || !data) {
      renderNeutral(t("invalid"), "invalid");
      return;
    }

    setText(hook("tier"), formatTier(data.member), data.member?.tier?.status || "checking");
    setText(hook("points"), formatPoints(data.points), data.points?.status || "checking");
    setText(hook("history"), formatHistory(data.history), data.history?.status || "checking");

    if (data.data_status === "partial") setState(t("partial"), "partial");
    else if (data.data_status === "checking") setState(t("unknown"), "checking");
    else setState("", "ready");
  }

  async function boot() {
    renderNeutral(t("loading"), "loading");

    try {
      const response = await fetch(safeUrl().toString(), {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        renderNeutral(payload?.message || t("invalid"), "checking");
        return;
      }
      renderDashboard(payload);
    } catch (_) {
      renderNeutral(t("unavailable"), "error");
    }
  }

  boot();
})();
