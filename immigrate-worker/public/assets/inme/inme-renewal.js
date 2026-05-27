(() => {
  "use strict";

  const API = {
    status: "/member/api/renewal/status",
    intake: "/member/api/renewal/intake",
    topup: "/member/api/points/topup",
    activate: "/member/api/renewal/activate-vip",
  };

  const VIP_POINTS_REQUIRED = 1200;
  const POINT_THB_RATE = 100;
  const TRUST_INME_URL = "/trust/inme";
  const GAP_DAYS_LIMIT = 365;
  const MAX_PROOF_BYTES = 5 * 1024 * 1024;
  const byId = (id) => document.getElementById(id);
  const clean = (value) => String(value || "").trim();
  const formatPoints = (value) => Number(value || 0).toLocaleString("th-TH");

  const COPY = {
    defaultStatus: "รอให้ผมอ่านข้อมูลให้ก่อนครับ",
    loading: "ขอผมเช็กข้อมูลของคุณสักครู่นะครับ",
    checking: "กำลังดู points และประวัติที่เกี่ยวข้องให้ครับ",
    apiFail: "ระบบเช็กอัตโนมัติยังไม่ตอบกลับครับ · ไม่เป็นไร เดี๋ยวผมรับไว้ดูต่อให้ก่อน",
    missingConsent: "กรุณาติ๊กยินยอมก่อนส่งตรวจสิทธิ์ครับ",
    checkFirst: "ขอผมเช็กข้อมูลก่อนส่งต่อครับ จะได้พาไปทางที่เหมาะที่สุด",
    submitBusy: "กำลังพาคุณไปขั้นตอนถัดไป...",
    review: "เคสนี้ผมขอดูให้เองก่อนครับ · ข้อมูลบางส่วนยังต้องตรวจเพิ่มนิดหนึ่ง",
  };

  const state = {
    action: "VIP_RENEWAL",
    paymentMethod: "Points / Per Review",
    lastStatus: null,
    pointsBalance: null,
    pointsShortfall: null,
    topupAmountTHB: null,
    route: "unknown",
    requiresNewSignup: false,
    reason: "",
  };

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function setStatus(value, kind = "waiting") {
    setText("sumStatus", value);
    setText("heroStatus", value);
    const statusEl = byId("sumStatus");
    if (statusEl) {
      statusEl.dataset.statusKind = kind;
      statusEl.classList.remove("is-success", "is-warning", "is-review", "is-waiting");
      statusEl.classList.add(`is-${kind}`);
    }
  }

  function value(id) {
    const el = byId(id);
    return el && "value" in el ? clean(el.value) : "";
  }

  function fileName(id) {
    const el = byId(id);
    if (!el || !el.files || !el.files.length) return "ไม่มี";
    return el.files[0].name || "มีไฟล์แนบ";
  }

  function proofFile() {
    const el = byId("oldProof");
    return el && el.files && el.files.length ? el.files[0] : null;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("proof_read_failed"));
      reader.readAsDataURL(file);
    });
  }

  async function proofPayload() {
    const file = proofFile();
    if (!file) {
      return {
        proof_attached: false,
        proof_filename: "",
        proof_mime_type: "",
        proof_size: 0,
        proof_image_base64: "",
        proof_source: "oldProof",
      };
    }

    if (file.size > MAX_PROOF_BYTES) {
      throw new Error("proof_too_large");
    }

    return {
      proof_attached: true,
      proof_filename: file.name || "proof",
      proof_mime_type: file.type || "application/octet-stream",
      proof_size: file.size || 0,
      proof_image_base64: await readFileAsDataUrl(file),
      proof_source: "oldProof",
    };
  }

  function email() {
    return value("emailNow") || value("emailOld");
  }

  function currentTierHint() {
    const result = state.lastStatus?.data || {};
    return clean(
      result.current_tier ||
      result.context?.membership?.current_tier ||
      result.context?.membership?.tier ||
      ""
    );
  }

  function desiredGoal() {
    return state.action === "PER_REVIEW" ? "upgrade" : "renewal";
  }

  function intakeFlow() {
    if (state.action === "PER_REVIEW") return "upgrade";
    return "renewal";
  }

  function canonicalNote(proof) {
    const extras = [
      value("context"),
      value("note"),
      value("message"),
      value("detail"),
      value("details"),
      value("remark"),
      value("remarks"),
      value("manualNote"),
      value("serviceHistoryNote"),
    ].filter(Boolean);
    const proofName = proof?.proof_attached ? proof.proof_filename : "none";
    const action = desiredGoal().toUpperCase();
    return [
      `proof:${proofName}`,
      `action:${action}`,
      `payment:${state.paymentMethod || "unknown"}`,
      "source:sigil_inme_renewal",
      ...extras,
    ].join("; ");
  }

  function syncSummary() {
    const nick = value("nick") || "—";
    const mail = email() || "—";
    const contact = [value("phone"), value("telegram")].filter(Boolean).join(" / ") || "—";
    setText("sumNick", nick);
    setText("sumEmail", mail);
    setText("sumContact", contact);
    setText("sumProof", fileName("oldProof"));
    setText("sumPay", state.paymentMethod);
    setText("heroIdentity", nick !== "—" ? nick : mail !== "—" ? mail : "รอข้อมูลจากคุณ");
    setText("heroPath", state.route === "unknown" ? "รอเช็กสถานะก่อน" : state.route === "per_review" ? "Per review" : state.paymentMethod);
    runBehaviorNudge();
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent || "";
      button.textContent = label;
      button.disabled = true;
      button.style.opacity = "0.7";
      return;
    }
    button.textContent = button.dataset.originalText || button.textContent || "";
    button.disabled = false;
    button.style.opacity = "";
  }

  function validate() {
    const missing = [];
    if (!value("nick")) missing.push("ชื่อเล่น");
    if (!email()) missing.push("email");
    if (!value("phone")) missing.push("เบอร์โทร");
    if (!value("telegram")) missing.push("Telegram");
    if (missing.length) {
      alert("ขอข้อมูลเพิ่มอีกนิดนะครับ: " + missing.join(", "));
      return false;
    }
    return true;
  }

  function identityPayload() {
    const displayName = value("nick");
    const primaryEmail = value("emailNow");
    const secondaryEmail = value("emailOld");
    const phone = value("phone");
    const telegramUsername = value("telegram");
    return {
      display_name: displayName,
      nickname: displayName,
      name: displayName || "",
      email: primaryEmail || secondaryEmail,
      email_primary: primaryEmail,
      email_secondary: secondaryEmail,
      phone,
      contact: phone,
      telegram_username: telegramUsername,
      telegram: telegramUsername,
    };
  }

  function statusPayload() {
    return {
      ...identityPayload(),
      search_priority: state.action === "PER_REVIEW" ? "per_review" : "vip_renewal",
      source_page: "sigil_inme_renewal",
      include_context: false,
    };
  }

  async function baseFlowPayload(extra = {}) {
    const proof = await proofPayload();
    const note = canonicalNote(proof);
    const tierHint = currentTierHint();
    const total = state.lastStatus?.data?.pricing_decision_thb;
    return {
      ...identityPayload(),
      ...proof,
      source_page: "sigil_inme_renewal",
      flow: intakeFlow(),
      current_tier_hint: tierHint,
      target_tier: desiredGoal() === "upgrade" ? "premium" : (tierHint || "vip"),
      points_required: VIP_POINTS_REQUIRED,
      points_balance: state.pointsBalance,
      points_shortfall: state.pointsShortfall,
      topup_amount_thb: state.topupAmountTHB,
      points_action: state.route,
      payment_method: state.paymentMethod,
      requires_new_signup: state.requiresNewSignup,
      reason: state.reason,
      fallback_url: state.requiresNewSignup ? TRUST_INME_URL : "",
      total: Number.isFinite(Number(total)) ? Number(total) : null,
      service_history_note: note,
      note,
      manual_note: note,
      desired_goal: desiredGoal(),
      notify_telegram: true,
      create_and_promote_now: true,
      ...extra,
    };
  }

  async function intakePayload() {
    return await baseFlowPayload({
      flow: intakeFlow(),
    });
  }

  async function buildIntakePayload() {
    const payload = await intakePayload();
    if (!payload.display_name || !payload.email || !(payload.service_history_note || payload.note)) {
      throw new Error("invalid_intake_payload");
    }
    return payload;
  }

  async function topupPayload() {
    return await baseFlowPayload({
      flow: "points_topup",
      amount_thb: state.topupAmountTHB,
      points_to_add: state.pointsShortfall,
      payment_type: "points_topup",
    });
  }

  async function activatePayload() {
    return await baseFlowPayload({
      flow: "vip_auto_activate",
      points_to_deduct: VIP_POINTS_REQUIRED,
      activation_type: "vip_renewal",
    });
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.ok === false) throw new Error("request_failed");
    return data;
  }

  function daysSince(dateLike) {
    const raw = clean(dateLike);
    if (!raw) return null;
    const time = new Date(raw).getTime();
    if (!Number.isFinite(time)) return null;
    return Math.floor((Date.now() - time) / 86400000);
  }

  function getLastServiceDate(result) {
    return result?.last_service_at || result?.last_session_at || result?.last_used_at || result?.context?.current_status?.latest_session_at || result?.context?.membership?.last_service_at || "";
  }

  function isFormerMemberGapOver365(result) {
    const found = Boolean(result?.found || result?.member_id || result?.memberstack_id || result?.current_tier || result?.membership_status);
    const gapDays = daysSince(getLastServiceDate(result));
    return found && gapDays !== null && gapDays > GAP_DAYS_LIMIT;
  }

  function decideRoute(result) {
    state.requiresNewSignup = false;
    state.reason = "";
    if (isFormerMemberGapOver365(result)) {
      state.route = "trust_inme_resignup_required";
      state.paymentMethod = "สมัครสมาชิกใหม่ก่อน";
      state.requiresNewSignup = true;
      state.reason = "former_member_gap_over_365_soft_review";
      state.pointsShortfall = null;
      state.topupAmountTHB = null;
      return "ผมเจอประวัติเดิมของคุณแล้วครับ · แต่ห่างจากการใช้งานไปนาน ผมขอพาไปสมัครสมาชิกใหม่ก่อน แล้วค่อยดูข้อมูลเดิมให้ต่อ";
    }
    const balance = Number(result?.points_balance ?? result?.context?.points?.balance ?? NaN);
    if (!Number.isFinite(balance)) {
      state.pointsBalance = null;
      state.pointsShortfall = null;
      state.topupAmountTHB = null;
      state.route = "per_review";
      state.paymentMethod = "Points / Per Review";
      return COPY.review;
    }
    state.pointsBalance = balance;
    state.pointsShortfall = Math.max(0, VIP_POINTS_REQUIRED - balance);
    state.topupAmountTHB = state.pointsShortfall > 0 ? state.pointsShortfall * POINT_THB_RATE : 0;
    if (state.action === "PER_REVIEW") {
      state.route = "per_review";
      state.paymentMethod = "Points / Per Review";
      return `เคสนี้ผมขอดูให้เองก่อนครับ · ตอนนี้มี ${formatPoints(balance)} points ผมจะอ่านประวัติประกอบให้อีกที`;
    }
    if (balance >= VIP_POINTS_REQUIRED) {
      state.route = "vip_auto";
      state.paymentMethod = "Points";
      return `พร้อมแล้วครับ · คุณมี ${formatPoints(balance)} points ผมสามารถเปิด / ต่อสิทธิ์ VIP ให้ได้เลย`;
    }
    state.route = "points_topup_required";
    state.paymentMethod = "Top up Points";
    return `เกือบพร้อมแล้วครับ · ตอนนี้มี ${formatPoints(balance)} points ขาดอีก ${formatPoints(state.pointsShortfall)} points เดี๋ยวผมพาเติมเฉพาะส่วนที่ขาด`;
  }

  function renderStatus(data) {
    state.lastStatus = data;
    const result = data && data.data ? data.data : null;
    const routeText = decideRoute(result || {});
    const kind = state.route === "vip_auto" ? "success" : state.route === "points_topup_required" ? "warning" : state.route === "per_review" ? "review" : "waiting";
    setStatus(routeText, kind);
    syncSummary();
    pushTimeline("ตรวจสถานะเบื้องต้นแล้ว");
  }

  async function runFinalFlow() {
    if (state.route === "trust_inme_resignup_required") {
      await postJson(API.intake, await buildIntakePayload()).catch(() => null);
      window.location.href = TRUST_INME_URL;
      return "ผมกำลังพาไปสมัครสมาชิกใหม่ก่อนนะครับ ข้อมูลเดิมที่ควรดูต่อผมจะไม่ตัดทิ้งครับ";
    }
    if (state.route === "vip_auto") {
      try {
        await postJson(API.activate, await activatePayload());
        return "เรียบร้อยครับ ผมส่งคำขอเปิด / ต่อสิทธิ์ VIP ด้วย points ให้แล้ว";
      } catch (error) {
        await postJson(API.intake, await buildIntakePayload());
        return "ระบบหัก points อัตโนมัติยังไม่สำเร็จครับ · ไม่เป็นไร ผมรับไว้ดูต่อให้ก่อน";
      }
    }
    if (state.route === "points_topup_required") {
      try {
        const response = await postJson(API.topup, await topupPayload());
        const payUrl = response?.data?.payment_url || response?.payment_url || response?.data?.url || response?.url;
        if (payUrl) window.location.href = payUrl;
        return payUrl ? "เดี๋ยวผมพาไปเติม points เฉพาะส่วนที่ขาดครับ" : "ผมสร้างคำขอเติม points ให้แล้วครับ";
      } catch (error) {
        await postJson(API.intake, await buildIntakePayload());
        return "ระบบเติม points อัตโนมัติยังไม่สำเร็จครับ · ผมรับไว้ดูต่อให้ก่อน";
      }
    }
    await postJson(API.intake, await buildIntakePayload());
    return "รับเรื่องแล้วครับ เดี๋ยวผมตรวจสิทธิ์ให้ต่อเอง";
  }

  function setActive(selector, active) {
    document.querySelectorAll(selector).forEach((button) => button.classList.remove("active"));
    active.classList.add("active");
  }

  function bindActions() {
    document.querySelectorAll(".mmd-choice[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        setActive(".mmd-choice[data-action]", button);
        state.action = button.dataset.action || "VIP_RENEWAL";
        state.route = state.action === "PER_REVIEW" ? "per_review" : "unknown";
        state.lastStatus = null;
        setStatus(state.action === "PER_REVIEW" ? "เคสนี้ผมจะดูให้เองก่อนครับ" : "คุณไม่ต้องรู้สถานะตัวเองก่อนครับ · กรอกเท่าที่จำได้ เดี๋ยวผมพาไปทางที่เหมาะที่สุดเอง", "waiting");
        pushTimeline(state.action === "PER_REVIEW" ? "เลือกให้ Per review" : "เลือกแนวทาง renewal");
      });
    });
  }

  function bindPayments() {
    document.querySelectorAll(".mmd-pay[data-pay]").forEach((button) => {
      button.addEventListener("click", () => {
        setActive(".mmd-pay[data-pay]", button);
        state.paymentMethod = button.dataset.pay || "Points / Per Review";
        syncSummary();
        pushTimeline(`เลือกช่องทาง ${state.paymentMethod}`);
      });
    });
  }

  function bindInputs() {
    ["nick", "emailNow", "emailOld", "phone", "telegram", "oldProof"].forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener("input", syncSummary);
      el.addEventListener("change", syncSummary);
      el.addEventListener("focus", () => runBehaviorNudge(id));
    });
  }

  function bindPrimary() {
    const check = byId("checkBtn");
    if (check) {
      check.addEventListener("click", async () => {
        syncSummary();
        if (!validate()) return;
        setBusy(check, true, "ขอผมเช็กสักครู่นะครับ...");
        setStatus(COPY.checking, "waiting");
        pushTimeline("เริ่มตรวจข้อมูลเบื้องต้น");
        try {
          renderStatus(await postJson(API.status, statusPayload()));
        } catch (error) {
          state.route = "per_review";
          state.paymentMethod = "Points / Per Review";
          setStatus(COPY.apiFail, "review");
          syncSummary();
          pushTimeline("ส่งเข้า Per review แทน");
        } finally {
          setBusy(check, false);
        }
      });
    }
    const submit = byId("submitBtn");
    if (submit) {
      submit.addEventListener("click", async () => {
        syncSummary();
        if (!validate()) return;
        const consent = byId("consent");
        if (!consent || !consent.checked) {
          alert(COPY.missingConsent);
          return;
        }
        if (state.route === "unknown") {
          alert(COPY.checkFirst);
          return;
        }
        try {
          await buildIntakePayload();
        } catch (error) {
          alert("กรอกชื่อเล่น, email และรายละเอียดสำหรับส่งต่อ renewal ให้ครบก่อนนะครับ");
          return;
        }
        setBusy(submit, true, COPY.submitBusy);
        pushTimeline("กำลังส่งเข้าชั้นตรวจ");
        try {
          const done = await runFinalFlow();
          setStatus(done, state.route === "vip_auto" ? "success" : "review");
          pushTimeline("ส่งสำเร็จ");
          alert(done);
        } catch (error) {
          if (error && error.message === "proof_too_large") {
            setStatus("ไฟล์หลักฐานใหญ่เกินไปครับ กรุณาอัปโหลดรูปไม่เกิน 5MB", "review");
            alert("ไฟล์หลักฐานใหญ่เกินไปครับ กรุณาอัปโหลดรูปไม่เกิน 5MB");
            return;
          }
          setStatus("ส่งอัตโนมัติไม่สำเร็จครับ · กรุณาทัก Per โดยตรงพร้อมข้อมูลที่กรอกไว้", "review");
          pushTimeline("ต้องตรวจด้วยมือ");
        } finally {
          setBusy(submit, false);
        }
      });
    }
  }

  function pushTimeline(text) {
    const box = byId("mmdLv12Timeline");
    if (!box) return;
    const row = document.createElement("div");
    row.className = "mmd-lv12-line";
    row.textContent = text;
    box.prepend(row);
    [...box.querySelectorAll(".mmd-lv12-line")].slice(4).forEach((el) => el.remove());
  }

  function runBehaviorNudge(focusedId = "") {
    const note = byId("mmdLv12Nudge");
    if (!note) return;
    let text = "กรอกเท่าที่จำได้ก่อนครับ เดี๋ยวผมช่วยอ่านทางต่อให้";
    if (focusedId === "emailNow" || focusedId === "emailOld") text = "ถ้าไม่แน่ใจ email เดิม กรอก email ที่ติดต่อได้ไว้ก่อนครับ";
    else if (focusedId === "oldProof") text = "ถ้ามีหลักฐานเก่า แนบไว้ได้เลยครับ จะช่วยให้ผมจับคู่ประวัติเร็วขึ้น";
    else if (value("nick") && email()) text = "ข้อมูลเริ่มพออ่านเคสได้แล้วครับ กดเช็กสถานะเบื้องต้นได้เลย";
    note.textContent = text;
    note.classList.add("is-show");
  }

  function initLv12() {
    const root = document.querySelector(".mmd-renewal-lv10");
    if (!root) return;
    const summary = document.querySelector(".mmd-hero-summary");
    if (summary && !byId("mmdLv12Timeline")) {
      const live = document.createElement("div");
      live.className = "mmd-lv12-panel";
      live.innerHTML = `<div class="mmd-lv12-title">PRIVATE CHECK LAYER</div><div id="mmdLv12Timeline" class="mmd-lv12-timeline"><div class="mmd-lv12-line">รอข้อมูลจากคุณ</div></div><div id="mmdLv12Nudge" class="mmd-lv12-nudge">กรอกเท่าที่จำได้ก่อนครับ เดี๋ยวผมช่วยอ่านทางต่อให้</div>`;
      summary.appendChild(live);
    }
    const sticky = document.createElement("div");
    sticky.className = "mmd-lv12-sticky";
    sticky.innerHTML = `<span>พร้อมให้ผมอ่านเคสหรือยังครับ</span><button type="button" class="mmd-btn" id="mmdLv12StickyBtn">เริ่มเช็กเลย</button>`;
    root.appendChild(sticky);
    byId("mmdLv12StickyBtn")?.addEventListener("click", () => byId("checkBtn")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    window.addEventListener("scroll", () => {
      sticky.classList.toggle("is-show", window.scrollY > 420);
    }, { passive: true });
    const reveal = document.querySelectorAll(".mmd-card,.mmd-hero-summary,.mmd-rule,.mmd-pay");
    reveal.forEach((el) => el.classList.add("mmd-reveal"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    }, { threshold: 0.12 });
    reveal.forEach((el) => io.observe(el));
  }

  function init() {
    bindInputs();
    bindActions();
    bindPayments();
    bindPrimary();
    initLv12();
    syncSummary();
    setStatus(COPY.defaultStatus, "waiting");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
