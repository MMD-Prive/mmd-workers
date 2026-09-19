(function () {
  "use strict";

  var root = document.getElementById("mmd-member-dashboard-v10");
  if (!root || root.dataset.ready === "true") return;
  root.dataset.ready = "true";

  var requestController = null;
  var qs = new URLSearchParams(window.location.search);
  var safeQueryKeys = ["t", "code", "promo"];
  var publicCareStates = new Set(["not_started", "under_review", "payment_required", "payment_verifying", "approved", "completed", "unavailable", "temporarily_unavailable"]);

  function one(id) { return root.querySelector("#" + id); }
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function text(id, value, fallback) { var node = one(id); if (node) node.textContent = clean(value) || fallback || "—"; }
  function setState(state) { root.dataset.state = state; }

  function carrySafeQuery(path) {
    var url;
    try { url = new URL(path || "/", window.location.origin); } catch (_) { return "#"; }
    if (url.origin !== window.location.origin && url.hostname !== "mmdbkk.com" && url.hostname !== "www.mmdbkk.com" && url.hostname !== "lin.ee") return "#";
    if (url.hostname === "lin.ee") return url.href;
    safeQueryKeys.forEach(function (key) { if (!url.searchParams.has(key) && qs.has(key)) url.searchParams.set(key, qs.get(key)); });
    Array.from(url.searchParams.keys()).forEach(function (key) { if (safeQueryKeys.indexOf(key) === -1) url.searchParams.delete(key); });
    return url.pathname + url.search;
  }

  function setLink(id, href, label) {
    var node = one(id);
    if (!node) return;
    if (label) node.textContent = label;
    var safe = carrySafeQuery(href);
    if (!href || safe === "#") {
      node.href = "#";
      node.classList.add("is-disabled");
      node.setAttribute("aria-disabled", "true");
      return;
    }
    node.href = safe;
    node.classList.remove("is-disabled");
    node.removeAttribute("aria-disabled");
  }

  root.querySelectorAll("[data-safe-link]").forEach(function (link) { link.href = carrySafeQuery(link.getAttribute("href")); });

  function formatPoints(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("th-TH") : "—";
  }

  function memberStatusLabel(status) {
    var map = { active: "พร้อมใช้งาน", current: "พร้อมใช้งาน", expired: "หมดอายุ", pending: "รอตรวจสอบ", under_review: "รอตรวจสอบ" };
    return map[clean(status).toLowerCase()] || "กำลังตรวจสอบ";
  }

  function unwrap(payload) {
    if (!payload || typeof payload !== "object") return {};
    return object(payload.data || payload.dashboard || payload.member_dashboard || payload);
  }

  function renderMember(data) {
    var member = object(data.member || data.profile || data.account);
    var membership = object(data.membership || data.access);
    var points = object(data.points || data.points_summary);
    var actions = object(data.actions || data.links);
    var status = clean(membership.status || member.status || data.membership_status || data.status).toLowerCase();
    var displayName = clean(member.display_name || member.name || data.display_name) || "สมาชิก MMD";
    var tier = clean(membership.tier || membership.package_name || member.tier || data.tier) || "Member";
    var activePoints = points.active_points != null ? points.active_points : (points.active != null ? points.active : data.points_active);

    text("mmd-md10-greeting", "สวัสดีครับ " + displayName);
    text("mmd-md10-tier", tier);
    text("mmd-md10-member-status", memberStatusLabel(status));
    text("mmd-md10-points", formatPoints(activePoints));
    text("mmd-md10-status", memberStatusLabel(status));

    if (status === "active" || status === "current") {
      text("mmd-md10-live", "Member Active");
      text("mmd-md10-status-copy", "สิทธิ์สมาชิกพร้อมใช้งานครับ ผมรวมทางไปต่อที่สำคัญไว้ให้แล้ว");
      text("mmd-md10-hero-copy", "สถานะสมาชิกของคุณพร้อมใช้งานครับ จากตรงนี้เลือก Personal Main ดู session หรือเริ่ม booking ต่อได้เลย");
      setLink("mmd-md10-primary", actions.primary_url || root.dataset.guideRoute, actions.primary_label || "เลือก Personal Main");
    } else if (status === "expired") {
      text("mmd-md10-live", "Renewal Needed");
      text("mmd-md10-status-copy", "สมาชิกหมดอายุแล้วครับ ผมพาไปดูแพ็กเกจและขั้นตอนที่ถูกต้องได้");
      setLink("mmd-md10-primary", actions.renewal_url || root.dataset.renewalRoute, "ดู Membership");
    } else {
      text("mmd-md10-live", "Under Review");
      text("mmd-md10-status-copy", "ข้อมูลบางส่วนยังอยู่ระหว่างตรวจสอบครับ ผมจะยังไม่เปิดทางที่ระบบไม่ยืนยัน");
      setLink("mmd-md10-primary", actions.primary_url || root.dataset.accessRoute, actions.primary_label || "กลับไปหน้า Access");
    }

    renderSession(object(data.next_session || data.session || data.active_session), actions);
    renderPayment(object(data.payment || data.latest_payment), actions);
  }

  function renderSession(session, actions) {
    var title = clean(session.title || session.label);
    var state = clean(session.customer_status || session.status);
    text("mmd-md10-session-state", state || "ยังไม่มี");
    text("mmd-md10-session-title", title || "ยังไม่มี Session ถัดไป");
    text("mmd-md10-session-copy", clean(session.customer_message) || "เมื่อมี session ที่ยืนยันแล้ว ผมจะแสดงวัน เวลา และทางไปต่อไว้ตรงนี้ครับ");
    setLink("mmd-md10-session-action", session.action_url || actions.session_url, session.action_label || (title ? "ดู Session" : "ยังไม่มี Session"));
  }

  function renderPayment(payment, actions) {
    var status = clean(payment.customer_status || payment.status);
    text("mmd-md10-payment-state", status || "ยังไม่มี");
    text("mmd-md10-payment-title", clean(payment.title) || "ยังไม่มีรายการที่ต้องทำ");
    text("mmd-md10-payment-copy", clean(payment.customer_message) || "สถานะจะอัปเดตหลัง MMD ตรวจยอดจริง ไม่ยืนยันจากสลิปเพียงอย่างเดียวครับ");
    setLink("mmd-md10-payment-action", payment.action_url || actions.payment_url, payment.action_label || (status ? "ดูสถานะ" : "ยังไม่มีรายการ"));
  }

  function renderCare(input) {
    var care = object(input);
    var card = one("mmd-md10-care");
    var state = clean(care.status).toLowerCase();
    if (!publicCareStates.has(state)) state = "temporarily_unavailable";
    card.dataset.careState = state;
    card.setAttribute("aria-busy", "false");

    var defaults = {
      not_started: ["ตรวจสอบสิทธิ์", "สิทธิ์ CARE BACK ของคุณ", "ตรวจสอบสิทธิ์ส่วนตัวสำหรับแคมเปญครบรอบ 6 ปีของ MMD Privé", "ตรวจสอบสิทธิ์"],
      under_review: ["กำลังตรวจสอบ", "กำลังตรวจสอบข้อมูล", "HYPE กำลังตรวจสอบสิทธิ์ของคุณอยู่ครับ หากข้อมูลครบแล้ว ระบบจะแจ้งผลที่นี่", ""],
      payment_required: ["ดำเนินการต่อ", "ยืนยันสิทธิ์แล้ว · รอดำเนินการต่อ", "สิทธิ์ของคุณได้รับการยืนยันแล้ว กรุณาดำเนินการตามขั้นตอนที่แสดงไว้เพื่อรับ CARE BACK", "ดำเนินการต่อ"],
      payment_verifying: ["กำลังตรวจยอด", "กำลังตรวจสอบการชำระ", "ระบบได้รับข้อมูลแล้วครับ HYPE จะแจ้งผลหลังจากตรวจสอบเรียบร้อย", ""],
      approved: ["ยืนยันสิทธิ์แล้ว", "สิทธิ์พร้อมดำเนินการ", "สิทธิ์ CARE BACK ของคุณพร้อมดำเนินการแล้วครับ", "รับสิทธิ์"],
      completed: ["เรียบร้อยแล้ว", "CARE BACK เรียบร้อยแล้ว", "สิทธิ์ของคุณได้รับการดำเนินการเรียบร้อยแล้วครับ ขอบคุณที่เคยอยู่กับ MMD Privé", ""],
      unavailable: ["ยังไม่พบสิทธิ์", "ยังไม่พบสิทธิ์ที่ดำเนินการได้", "สิทธิ์ CARE BACK เป็นสิทธิ์เฉพาะบุคคลและขึ้นอยู่กับการตรวจสอบข้อมูล หากต้องการให้ช่วยตรวจเพิ่มเติม สามารถติดต่อ HYPE ได้ครับ", "ติดต่อ HYPE"],
      temporarily_unavailable: ["ลองใหม่อีกครั้ง", "ยังแสดงสถานะไม่ได้ในขณะนี้", "ข้อมูลของคุณยังปลอดภัยครับ กรุณาลองใหม่อีกครั้ง หรือติดต่อ HYPE หากต้องการความช่วยเหลือ", "ลองอีกครั้ง"]
    };
    var copy = defaults[state];
    text("mmd-md10-care-badge", care.badge || copy[0]);
    text("mmd-md10-care-state-title", care.title || copy[1]);
    text("mmd-md10-care-message", care.message || copy[2]);

    var benefit = clean(care.benefit_summary);
    var until = clean(care.effective_until);
    var benefitBox = one("mmd-md10-care-benefit");
    benefitBox.hidden = !(benefit || until) || (state !== "approved" && state !== "completed");
    text("mmd-md10-care-benefit-text", benefit);
    text("mmd-md10-care-until", until);

    var action = object(care.action);
    var href = clean(action.href);
    var label = clean(action.label) || copy[3];
    if (state === "not_started" && !href) href = root.dataset.campaignEntry;
    if (state === "unavailable" && !href) href = root.dataset.hypeRoute;
    if (state === "temporarily_unavailable") {
      var retry = one("mmd-md10-care-action");
      retry.textContent = label;
      retry.href = "#";
      retry.classList.remove("is-disabled");
      retry.removeAttribute("aria-disabled");
      retry.dataset.retry = "true";
    } else {
      setLink("mmd-md10-care-action", href, label || "ไม่มีขั้นตอนเพิ่มเติม");
    }
  }

  function showError(kind) {
    setState("error");
    one("mmd-md10-error").hidden = false;
    if (kind === "unauthorized") {
      text("mmd-md10-error-title", "กรุณาเข้าสู่ระบบอีกครั้ง");
      text("mmd-md10-error-copy", "เพื่อปกป้องข้อมูลส่วนตัว ผมยังแสดง Dashboard ให้ไม่ได้ครับ");
    } else {
      text("mmd-md10-error-title", "ยังแสดงข้อมูลไม่ได้ในขณะนี้");
      text("mmd-md10-error-copy", "ข้อมูลของคุณยังปลอดภัยครับ กรุณาลองใหม่อีกครั้ง หรือติดต่อ HYPE หากต้องการความช่วยเหลือ");
    }
    renderCare({ status: "temporarily_unavailable" });
  }

  function memberAccessToken() {
    if (window.liff && typeof window.liff.getAccessToken === "function") return clean(window.liff.getAccessToken());
    return clean(window.__MMD_MEMBER_ACCESS_TOKEN__);
  }

  async function loadDashboard() {
    if (requestController) requestController.abort();
    requestController = new AbortController();
    setState("loading");
    one("mmd-md10-error").hidden = true;
    one("mmd-md10-refresh").disabled = true;

    try {
      var endpoint = new URL(root.dataset.dashboardApi, window.location.origin);
      safeQueryKeys.forEach(function (key) { if (qs.has(key)) endpoint.searchParams.set(key, qs.get(key)); });
      var accessToken = memberAccessToken();
      if (!accessToken) { showError("unauthorized"); return; }
      var response = await fetch(endpoint.toString(), { method: "POST", credentials: "include", cache: "no-store", headers: { Accept: "application/json", Authorization: "Bearer " + accessToken }, signal: requestController.signal });
      var payload = await response.json().catch(function () { return null; });
      if (response.status === 401 || response.status === 403) { showError("unauthorized"); return; }
      if (!response.ok || !payload || payload.ok === false) throw new Error("dashboard_read_failed");
      var data = unwrap(payload);
      renderMember(data);
      renderCare(data.campaign);
      setState("ready");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      showError("dependency");
    } finally {
      one("mmd-md10-refresh").disabled = false;
    }
  }

  one("mmd-md10-refresh").addEventListener("click", loadDashboard);
  one("mmd-md10-error-retry").addEventListener("click", loadDashboard);
  one("mmd-md10-care-action").addEventListener("click", function (event) {
    if (event.currentTarget.dataset.retry === "true") { event.preventDefault(); loadDashboard(); }
  });
  window.addEventListener("pagehide", function () { if (requestController) requestController.abort(); }, { once: true });

  loadDashboard();
})();
