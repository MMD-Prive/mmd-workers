/*!
 * Model Confirmation — runtime v1
 * Source of truth for the Webflow inline <script> blocks (unnamed runtime + mmd-confirm-compact-logo-v1), now a pinned hosted script (footer).
 * Code is unchanged.
 */
(function(){
  "use strict";

  var CONFIG = {
    pagePath: "/confirm/job-model",
    defaultNextPath: "/model/dashboard",
    heroImage: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69cf4d10ec2e342040fc940b_hito-hero-responsive.webp",
    publicFetchPaths: ["/v1/demo-links/get"],
    ackPaths: ["/v1/rules/ack"],
    debug: true
  };

  var $ = function(id){ return document.getElementById(id); };

  var els = {
    pill: $("mmdJmcfPill"),
    topDashboard: $("mmdJmcfTopDashboard"),

    heroSession: $("mmdJmcfHeroSession"),
    heroType: $("mmdJmcfHeroType"),
    heroAmount: $("mmdJmcfHeroAmount"),

    status: $("mmdJmcfStatus"),
    model: $("mmdJmcfModel"),
    client: $("mmdJmcfClient"),
    date: $("mmdJmcfDate"),
    time: $("mmdJmcfTime"),
    location: $("mmdJmcfLocation"),
    meetingPoint: $("mmdJmcfMeetingPoint"),
    package: $("mmdJmcfPackage"),
    paymentType: $("mmdJmcfPaymentType"),
    token: $("mmdJmcfToken"),

    reloadBtn: $("mmdJmcfReloadBtn"),
    copyBtn: $("mmdJmcfCopyBtn"),
    mapBtn: $("mmdJmcfMapBtn"),

    check1: $("mmdJmcfCheck1"),
    check2: $("mmdJmcfCheck2"),
    confirmBtn: $("mmdJmcfConfirmBtn"),

    nextPath: $("mmdJmcfNextPath"),
    dashboardBtn: $("mmdJmcfDashboardBtn"),

    success: $("mmdJmcfSuccess"),
    debug: $("mmdJmcfDebug")
  };

  var state = {
    token: "",
    sessionId: "",
    nextPath: CONFIG.defaultNextPath,
    loading: false,
    confirmed: false,
    mapUrl: "",
    payload: null
  };

  function qs(name){
    return new URLSearchParams(window.location.search).get(name);
  }

  function safeString(value, fallback){
    var v = String(value == null ? "" : value).trim();
    return v || (fallback || "—");
  }

  function absolutePath(url){
    var v = String(url || "").trim();
    if(!v) return CONFIG.defaultNextPath;
    if(/^https?:\/\//i.test(v)) return v;
    return v.charAt(0) === "/" ? v : "/" + v;
  }

  function getTokenFromUrl(){
    var t = String(qs("t") || "").trim();
    var token = String(qs("token") || "").trim();
    return t || token || "";
  }

  function getApiBase(){
    var htmlBase = document.documentElement.getAttribute("data-mmd-api-base") || "";
    var bodyBase = document.body.getAttribute("data-mmd-api-base") || "";
    var winBase = window.MMD_API_BASE || "";
    var base = String(winBase || htmlBase || bodyBase || "").trim();
    return base ? base.replace(/\/+$/, "") : "";
  }

  function makeUrl(path){
    var base = getApiBase();
    if(!base) return path;
    return base + (path.charAt(0) === "/" ? path : "/" + path);
  }

  function getConfirmKey(){
    try{
      return String(
        window.MMD_CONFIRM_KEY ||
        localStorage.getItem("mmd_confirm_key") ||
        ""
      ).trim();
    }catch(_){
      return String(window.MMD_CONFIRM_KEY || "").trim();
    }
  }

  function buildHeaders(extra){
    var headers = Object.assign({ "Content-Type": "application/json" }, extra || {});
    var key = getConfirmKey();
    if(key && !headers["X-Confirm-Key"]){
      headers["X-Confirm-Key"] = key;
    }
    return headers;
  }

  function setStatus(message, type){
    els.status.textContent = message || "";
    els.status.classList.remove("is-error", "is-ok");
    if(type === "error") els.status.classList.add("is-error");
    if(type === "ok") els.status.classList.add("is-ok");
  }

  function setDebug(obj){
    if(!CONFIG.debug || !els.debug) return;
    try{
      els.debug.textContent = JSON.stringify(obj || {}, null, 2);
    }catch(err){
      els.debug.textContent = String(err && err.message || err);
    }
  }

  function setBusy(isBusy){
    state.loading = !!isBusy;
    els.reloadBtn.disabled = !!isBusy;
    els.copyBtn.disabled = !!isBusy;
    els.check1.disabled = !!isBusy || state.confirmed;
    els.check2.disabled = !!isBusy || state.confirmed;
    syncConfirmButton();
  }

  function canConfirm(){
    return !!state.token &&
      !!state.sessionId &&
      !state.confirmed &&
      els.check1.checked &&
      els.check2.checked;
  }

  function syncConfirmButton(){
    els.confirmBtn.disabled = !canConfirm() || state.loading;
  }

  function toMoney(value){
    var n = Number(value || 0);
    if(!Number.isFinite(n) || n <= 0) return "—";
    return n.toLocaleString("th-TH") + " THB";
  }

  function toDateText(value){
    var raw = String(value || "").trim();
    if(!raw) return "—";
    var d = new Date(raw.length <= 10 ? raw + "T00:00:00" : raw);
    if(Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function toTimeText(value){
    var raw = String(value || "").trim();
    if(!raw) return "";
    if(/^\d{2}:\d{2}$/.test(raw)) return raw;
    var d = new Date(raw);
    if(Number.isNaN(d.getTime())) return raw;
    return d.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function toTimeRange(start, end){
    var s = toTimeText(start);
    var e = toTimeText(end);
    if(s && e) return s + " - " + e;
    return s || e || "—";
  }

  function normalizePayload(raw){
    var root = raw && typeof raw === "object" ? raw : {};
    var data = root.data && typeof root.data === "object" ? root.data : root;
    var booking = data.booking && typeof data.booking === "object" ? data.booking : {};
    var merged = Object.assign({}, booking, data);

    return {
      sessionId: safeString(
        merged.session_id || merged.sessionId || merged.sid,
        ""
      ),
      modelName: safeString(
        merged.model_name || merged.model || merged.model_display || qs("model"),
        "—"
      ),
      clientName: safeString(
        merged.client_name || merged.client || merged.customer_name || qs("client"),
        "—"
      ),
      dateText: toDateText(
        merged.job_date || merged.date || qs("date")
      ),
      timeText: toTimeRange(
        merged.start_time || merged.startAt || qs("start_time") || qs("time"),
        merged.end_time || merged.endAt || qs("end_time")
      ),
      locationText: safeString(
        merged.location_name || merged.location || qs("location"),
        "—"
      ),
      meetingPointText: safeString(
        merged.meeting_point_text || merged.meeting_point || qs("meeting_point"),
        "—"
      ),
      packageText: safeString(
        merged.package_code || merged.package_name || merged.job_type || qs("type"),
        "—"
      ),
      paymentTypeText: safeString(
        merged.payment_type || merged.paymentType || "full",
        "—"
      ),
      jobTypeText: safeString(
        merged.job_type || merged.package_code || merged.package_name || qs("type"),
        "Job"
      ),
      amountText: toMoney(
        merged.amount_thb || merged.amount || merged.total_thb || qs("amount_thb")
      ),
      mapUrl: safeString(
        merged.google_map_url || merged.google_maps_url || merged.location_url || qs("google_map_url"),
        ""
      ),
      nextPath: absolutePath(
        qs("next") ||
        merged.next ||
        merged.model_dashboard_url ||
        CONFIG.defaultNextPath
      ),
      raw: merged
    };
  }

  function render(payload){
    state.payload = payload.raw || null;
    state.sessionId = payload.sessionId || "";
    state.mapUrl = payload.mapUrl || "";
    state.nextPath = payload.nextPath || CONFIG.defaultNextPath;

    els.heroSession.textContent = payload.sessionId || "—";
    els.heroType.textContent = payload.jobTypeText || "—";
    els.heroAmount.textContent = payload.amountText || "—";

    els.model.textContent = payload.modelName || "—";
    els.client.textContent = payload.clientName || "—";
    els.date.textContent = payload.dateText || "—";
    els.time.textContent = payload.timeText || "—";
    els.location.textContent = payload.locationText || "—";
    els.meetingPoint.textContent = payload.meetingPointText || "—";
    els.package.textContent = payload.packageText || "—";
    els.paymentType.textContent = payload.paymentTypeText || "—";
    els.token.textContent = state.token || "—";

    els.nextPath.textContent = state.nextPath;
    els.dashboardBtn.setAttribute("href", state.nextPath);
    els.topDashboard.setAttribute("href", state.nextPath);

    if(state.mapUrl){
      els.mapBtn.hidden = false;
      els.mapBtn.setAttribute("href", state.mapUrl);
    }else{
      els.mapBtn.hidden = true;
      els.mapBtn.removeAttribute("href");
    }

    setDebug({
      token: state.token,
      session_id: state.sessionId,
      next_path: state.nextPath,
      payload: payload.raw || null
    });
  }

  async function fetchJson(url, options){
    var res = await fetch(url, options || {});
    var text = await res.text().catch(function(){ return ""; });
    var data = null;

    try{
      data = text ? JSON.parse(text) : null;
    }catch(_){
      data = { raw: text };
    }

    if(!res.ok){
      throw new Error((data && (data.error || data.message || data.detail)) || ("HTTP " + res.status));
    }

    if(data && data.ok === false){
      throw new Error(data.error || data.message || "request_failed");
    }

    return data;
  }

  async function fetchConfirmData(){
    var token = state.token;
    if(!token) throw new Error("missing_token");

    var paths = CONFIG.publicFetchPaths.slice();
    var errors = [];

    for(var i = 0; i < paths.length; i++){
      var url = new URL(makeUrl(paths[i]), window.location.origin);
      url.searchParams.set("t", token);

      try{
        return await fetchJson(url.toString(), {
          method: "GET",
          headers: { "Accept": "application/json" }
        });
      }catch(err){
        errors.push(String(err && err.message || err));
      }
    }

    throw new Error(errors[0] || "public_fetch_failed");
  }

  async function submitAck(){
    var payload = {
      session_id: state.sessionId,
      role: "model",
      rules: "job_model_confirm_v1",
      accepted_at: new Date().toISOString(),
      idempotency_key: "job-model:" + (state.sessionId || state.token),
      t: state.token,
      page: {
        path: CONFIG.pagePath,
        href: window.location.href
      }
    };

    if(window.MMD && typeof window.MMD.workerPost === "function"){
      return window.MMD.workerPost(CONFIG.ackPaths[0], payload);
    }

    var lastError = null;

    for(var i = 0; i < CONFIG.ackPaths.length; i++){
      try{
        return await fetchJson(makeUrl(CONFIG.ackPaths[i]), {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify(payload)
        });
      }catch(err){
        lastError = err;
      }
    }

    throw lastError || new Error("ack_failed");
  }

  function renderFromQueryFallback(){
    return normalizePayload({
      session_id: qs("session_id"),
      client_name: qs("client"),
      model_name: qs("model"),
      job_date: qs("date"),
      start_time: qs("time"),
      location_name: qs("location"),
      meeting_point_text: qs("meeting_point"),
      job_type: qs("type"),
      amount_thb: qs("amount_thb"),
      google_map_url: qs("google_map_url"),
      payment_type: qs("payment_type")
    });
  }

  async function loadData(){
    if(!state.token){
      els.pill.textContent = "Missing token";
      setStatus("ไม่พบพารามิเตอร์ t หรือ token ในลิงก์นี้", "error");
      render(renderFromQueryFallback());
      return;
    }

    setBusy(true);
    els.success.hidden = true;
    els.pill.textContent = "กำลังตรวจสอบลิงก์";
    setStatus("กำลังโหลดรายละเอียดงาน...", "");

    try{
      var raw = await fetchConfirmData();
      var payload = normalizePayload(raw);
      render(payload);

      if(!payload.sessionId){
        throw new Error("session_id_not_found");
      }

      els.pill.textContent = "ลิงก์พร้อมใช้งาน";
      setStatus("โหลดรายละเอียดงานสำเร็จ กรุณาตรวจสอบก่อนกดยืนยัน", "ok");
    }catch(err){
      var fallback = renderFromQueryFallback();
      render(fallback);

      els.pill.textContent = "Fallback mode";
      setStatus(
        "ยังดึงข้อมูลจาก public confirm fetch ไม่ได้ ตอนนี้หน้าใช้ข้อมูลจาก query param เป็น fallback ชั่วคราว",
        "error"
      );

      setDebug({
        error: String(err && err.message || err),
        token: state.token,
        fallback_payload: fallback.raw || null
      });
    }finally{
      setBusy(false);
    }
  }

  async function onConfirm(){
    if(!canConfirm()) return;

    setBusy(true);
    setStatus("กำลังบันทึกการยืนยันของคุณ...", "");

    try{
      var ack = await submitAck();
      state.confirmed = true;
      els.success.hidden = false;
      els.pill.textContent = "ยืนยันแล้ว";
      setStatus("ยืนยันรับงานสำเร็จแล้ว", "ok");

      setDebug({
        token: state.token,
        session_id: state.sessionId,
        ack_response: ack || null,
        payload: state.payload || null
      });
    }catch(err){
      var keyExists = !!getConfirmKey();
      var msg = String(err && err.message || err);

      if(!keyExists && msg.toLowerCase().indexOf("confirm") !== -1){
        msg = "confirm_key_required — หน้านี้ยังไม่มี confirm key ฝั่งเว็บ";
      }

      setStatus("ยืนยันไม่สำเร็จ: " + msg, "error");
    }finally{
      setBusy(false);
      syncConfirmButton();
    }
  }

  async function copySessionId(){
    if(!state.sessionId){
      setStatus("ยังไม่มี Session ID ให้คัดลอก", "error");
      return;
    }

    try{
      await navigator.clipboard.writeText(state.sessionId);
      setStatus("คัดลอก Session ID แล้ว", "ok");
    }catch(_){
      setStatus("คัดลอกไม่สำเร็จ", "error");
    }
  }

  function bindEvents(){
    els.reloadBtn.addEventListener("click", loadData);
    els.copyBtn.addEventListener("click", copySessionId);
    els.confirmBtn.addEventListener("click", onConfirm);

    els.check1.addEventListener("change", syncConfirmButton);
    els.check2.addEventListener("change", syncConfirmButton);
  }

  function init(){
    state.token = getTokenFromUrl();
    state.nextPath = absolutePath(qs("next") || CONFIG.defaultNextPath);

    els.token.textContent = state.token || "—";
    els.nextPath.textContent = state.nextPath;
    els.dashboardBtn.setAttribute("href", state.nextPath);
    els.topDashboard.setAttribute("href", state.nextPath);

    bindEvents();
    syncConfirmButton();
    loadData();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init, { once:true });
  }else{
    init();
  }
})();
;
(function(){
  var src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa588f4208043f282642ad8_04-compact-symbol-256px.webp";
  function apply(){
    document.querySelectorAll(".mmd-jmcf__logo,.mmd-jmcf__brand img").forEach(function(img){
      if(img && img.tagName==="IMG") img.setAttribute("src",src);
    });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",apply,{once:true});
  else apply();
}());
