/* MMD PRIVÉ — KENJI MEMBER APPLICATION GATE */
(() => {
  "use strict";

  const root = document.getElementById("mmd-member-application");
  if (!root) return;

  const form = root.querySelector("#mmdMemberApplicationForm");
  const panels = [...root.querySelectorAll("[data-panel]")];
  const stepButtons = [...root.querySelectorAll("[data-step-jump]")];
  const backBtn = root.querySelector("#mmdApplicationBack");
  const nextBtn = root.querySelector("#mmdApplicationNext");
  const submitBtn = root.querySelector("#mmdApplicationSubmit");
  const progressBar = root.querySelector("#mmdApplicationProgressBar");
  const progressLabel = root.querySelector("#mmdApplicationProgressLabel");
  const draftState = root.querySelector("#mmdApplicationDraftState");
  const stateEl = root.querySelector("#mmdApplicationState");
  const reviewEl = root.querySelector("#mmdApplicationReview");
  const successModal = root.querySelector("#mmdApplicationSuccess");
  const referenceEl = root.querySelector("#mmdApplicationReference");
  const queryBadges = root.querySelector("#mmdApplicationQueryBadges");

  const API_BASE = (root.dataset.apiBase || window.location.origin).replace(/\/$/, "");
  const SUBMIT_PATH = root.dataset.submitPath || "/v1/member/applications";
  const DASHBOARD_URL = root.dataset.dashboardUrl || "/member/dashboard";
  const MEMBERSHIP_URL = root.dataset.membershipUrl || "/member/membership";
  const HELP_URL = root.dataset.helpUrl || "https://t.me/mmdapply";

  const DRAFT_KEY = "mmd_member_application_draft_v1";
  const params = new URLSearchParams(window.location.search);

  let currentStep = 0;
  let saveTimer = null;
  let applicationReference = "";

  const queryMap = {
    t: "#mmdApplicationToken",
    code: "#mmdApplicationCode",
    promo: "#mmdApplicationPromo"
  };

  Object.entries(queryMap).forEach(([name, selector]) => {
    const value = params.get(name) || "";
    const input = root.querySelector(selector);
    if (input) input.value = value;
    if (value) {
      const badge = document.createElement("span");
      badge.textContent = `${name.toUpperCase()}: ${value}`;
      queryBadges.appendChild(badge);
    }
  });

  root.querySelector("#mmdApplicationMembershipLink").href = appendParams(MEMBERSHIP_URL);
  root.querySelector("#mmdApplicationDashboardLink").href = appendParams(DASHBOARD_URL);
  root.querySelector("#mmdApplicationHelpLink").href = HELP_URL;

  function appendParams(url) {
    const target = new URL(url, window.location.origin);
    ["t", "code", "promo"].forEach(name => {
      const value = params.get(name);
      if (value) target.searchParams.set(name, value);
    });
    return target.toString();
  }

  function setState(message = "", type = "") {
    stateEl.textContent = message;
    stateEl.className = "mmd-member-application__state";
    if (type) stateEl.classList.add(`is-${type}`);
  }

  function showStep(index, scroll = true) {
    currentStep = Math.max(0, Math.min(index, panels.length - 1));

    panels.forEach((panel, i) => panel.classList.toggle("is-active", i === currentStep));
    stepButtons.forEach((button, i) => button.classList.toggle("is-active", i === currentStep));

    const progress = ((currentStep + 1) / panels.length) * 100;
    progressBar.style.width = `${progress}%`;
    progressLabel.textContent = `ขั้นตอน ${currentStep + 1} จาก ${panels.length}`;

    backBtn.hidden = currentStep === 0;
    nextBtn.hidden = currentStep === panels.length - 1;
    submitBtn.hidden = currentStep !== panels.length - 1;

    if (currentStep === panels.length - 1) buildReview();
    setState("");

    if (scroll) {
      root.querySelector(".mmd-member-application__wizard-shell")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }

  function getFieldLabel(field) {
    return field.closest("label")?.querySelector(":scope > span")?.textContent?.replace("*", "").trim()
      || field.name
      || "ข้อมูล";
  }

  function setFieldError(field, message = "") {
    field.classList.toggle("is-invalid", Boolean(message));
    const error = field.closest("label")?.querySelector(".mmd-member-application__error");
    if (error) error.textContent = message;
  }

  function validateField(field) {
    setFieldError(field, "");

    if (field.disabled || field.type === "hidden") return true;
    if (!field.required) return true;

    if (!String(field.value || "").trim()) {
      setFieldError(field, `กรุณากรอก${getFieldLabel(field)}`);
      return false;
    }

    if (field.type === "email" && field.value) {
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value);
      if (!valid) {
        setFieldError(field, "กรุณาตรวจสอบรูปแบบอีเมล");
        return false;
      }
    }

    return true;
  }

  function validateGroup(name) {
    const fields = [...form.querySelectorAll(`[name="${name}"]`)];
    const valid = fields.some(field => field.checked);
    const error = form.querySelector(`[data-group-error="${name}"]`);
    if (error) error.textContent = valid ? "" : "กรุณาเลือกอย่างน้อย 1 รายการ";
    return valid;
  }

  function validateStep(index) {
    let valid = true;
    const panel = panels[index];

    [...panel.querySelectorAll("input, textarea")].forEach(field => {
      if (["radio", "checkbox"].includes(field.type)) return;
      if (!validateField(field)) valid = false;
    });

    if (index === 1) {
      if (!validateGroup("primary_channel")) valid = false;
      const channel = form.elements.primary_channel?.value;
      const channelInputMap = {
        line: form.elements.line_contact,
        telegram: form.elements.telegram_username,
        email: form.elements.email
      };
      const activeField = channelInputMap[channel];
      if (activeField) {
        activeField.required = true;
        if (!validateField(activeField)) valid = false;
      }
    }

    if (index === 2 && !validateGroup("application_intent")) valid = false;
    if (index === 3) {
      if (!validateGroup("languages")) valid = false;
      if (!validateGroup("interests")) valid = false;
    }

    if (index === 4) {
      const consentAccuracy = form.elements.consent_accuracy?.checked;
      const consentPrivacy = form.elements.consent_privacy?.checked;
      if (!consentAccuracy || !consentPrivacy) {
        valid = false;
        setState("กรุณายืนยันข้อมูลและนโยบายความเป็นส่วนตัวก่อนส่ง", "error");
      }
    }

    if (!valid && index !== 4) {
      setState("ยังมีข้อมูลที่ต้องตรวจสอบในขั้นตอนนี้", "error");
    }

    return valid;
  }

  function selectedValues(name) {
    return [...form.querySelectorAll(`[name="${name}"]:checked`)].map(field => field.value);
  }

  function serializeForm() {
    const data = new FormData(form);
    const payload = {};

    for (const [key, value] of data.entries()) {
      if (["languages", "interests"].includes(key)) continue;
      payload[key] = typeof value === "string" ? value.trim() : value;
    }

    payload.languages = selectedValues("languages");
    payload.interests = selectedValues("interests");
    payload.consent_accuracy = Boolean(form.elements.consent_accuracy?.checked);
    payload.consent_privacy = Boolean(form.elements.consent_privacy?.checked);
    payload.page_url = window.location.href;
    payload.submitted_at = new Date().toISOString();

    return payload;
  }

  function saveDraft() {
    try {
      const draft = {
        version: 1,
        updated_at: new Date().toISOString(),
        step: currentStep,
        values: serializeForm()
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      draftState.textContent = "Draft saved";
    } catch (error) {
      console.warn("[MMD Member Application] Draft save failed", error);
      draftState.textContent = "Draft unavailable";
    }
  }

  function scheduleDraftSave() {
    draftState.textContent = "Saving...";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 450);
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;

      const draft = JSON.parse(raw);
      if (!draft?.values) return;

      Object.entries(draft.values).forEach(([name, value]) => {
        if (["t", "code", "promo", "source", "route", "submitted_at", "page_url"].includes(name)) return;

        const fields = [...form.querySelectorAll(`[name="${name}"]`)];
        if (!fields.length) return;

        if (Array.isArray(value)) {
          fields.forEach(field => {
            if (field.type === "checkbox") field.checked = value.includes(field.value);
          });
          return;
        }

        const field = fields[0];
        if (field.type === "radio") {
          fields.forEach(item => item.checked = item.value === value);
        } else if (field.type === "checkbox") {
          field.checked = Boolean(value);
        } else {
          field.value = value ?? "";
        }
      });

      currentStep = Number.isInteger(draft.step) ? Math.min(draft.step, panels.length - 1) : 0;
      draftState.textContent = "Draft restored";
      updateChannelFields();
      updateCounters();
    } catch (error) {
      console.warn("[MMD Member Application] Draft restore failed", error);
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
      draftState.textContent = "Draft cleared";
    } catch (_) {}
  }

  function updateChannelFields() {
    const selected = form.elements.primary_channel?.value || "";
    root.querySelectorAll("[data-channel-field]").forEach(wrapper => {
      const active = wrapper.dataset.channelField === selected;
      wrapper.hidden = !active;
      const input = wrapper.querySelector("input");
      if (input) input.required = active;
    });
  }

  function updateCounters() {
    root.querySelectorAll("textarea[maxlength]").forEach(textarea => {
      const counter = root.querySelector(`[data-count-for="${textarea.name}"]`);
      if (counter) counter.textContent = String(textarea.value.length);
    });
  }

  function safeText(value) {
    const text = Array.isArray(value) ? value.join(", ") : String(value || "").trim();
    return text || "ไม่ได้ระบุ";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function buildReview() {
    const payload = serializeForm();
    const rows = [
      ["ชื่อที่ใช้เรียก", payload.preferred_name],
      ["ชื่อจริง", payload.full_name],
      ["วันเกิด", payload.birth_date],
      ["สัญชาติ", payload.nationality],
      ["ช่องทางหลัก", payload.primary_channel],
      ["LINE", payload.line_contact],
      ["Telegram", payload.telegram_username],
      ["Email", payload.email],
      ["โทรศัพท์", payload.phone],
      ["จุดประสงค์", payload.application_intent],
      ["ภาษา", payload.languages],
      ["ความสนใจ", payload.interests],
      ["โค้ด", payload.code],
      ["โปรโมชั่น", payload.promo]
    ];

    reviewEl.innerHTML = rows.map(([label, value]) => `
      <div class="mmd-member-application__review-row">
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(safeText(value))}</b>
      </div>
    `).join("");
  }

  function makeReference() {
    const now = new Date();
    const stamp = [
      now.getFullYear().toString().slice(-2),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0")
    ].join("");
    return `MMD-MA-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  async function submitApplication() {
    if (!validateStep(currentStep)) return;

    submitBtn.disabled = true;
    backBtn.disabled = true;
    setState("กำลังส่งข้อมูลไปยัง MMD Worker...");

    try {
      const response = await fetch(`${API_BASE}${SUBMIT_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        credentials: "include",
        body: JSON.stringify(serializeForm())
      });

      let result = {};
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        result = await response.json();
      }

      if (!response.ok) {
        throw new Error(result?.message || result?.error || `Worker returned ${response.status}`);
      }

      applicationReference =
        result.application_reference ||
        result.reference ||
        result.application_id ||
        result.id ||
        makeReference();

      referenceEl.textContent = applicationReference;
      clearDraft();
      successModal.hidden = false;
      document.body.style.overflow = "hidden";
      setState("ส่งข้อมูลเรียบร้อย", "success");
    } catch (error) {
      console.error("[MMD Member Application]", error);
      setState(
        error?.message ||
        "ยังส่งข้อมูลไม่ได้ กรุณาตรวจสอบ Worker endpoint แล้วลองอีกครั้ง",
        "error"
      );
    } finally {
      submitBtn.disabled = false;
      backBtn.disabled = false;
    }
  }

  nextBtn.addEventListener("click", () => {
    if (validateStep(currentStep)) {
      showStep(currentStep + 1);
      scheduleDraftSave();
    }
  });

  backBtn.addEventListener("click", () => {
    showStep(currentStep - 1);
    scheduleDraftSave();
  });

  stepButtons.forEach(button => {
    button.addEventListener("click", () => {
      const target = Number(button.dataset.stepJump);
      if (target <= currentStep) showStep(target);
    });
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    submitApplication();
  });

  form.addEventListener("input", event => {
    const field = event.target;
    if (field.matches("input, textarea") && !["checkbox", "radio"].includes(field.type)) {
      validateField(field);
    }
    updateCounters();
    scheduleDraftSave();
  });

  form.addEventListener("change", event => {
    if (event.target.name === "primary_channel") {
      updateChannelFields();
      validateGroup("primary_channel");
    }
    if (event.target.name === "application_intent") validateGroup("application_intent");
    if (event.target.name === "languages") validateGroup("languages");
    if (event.target.name === "interests") validateGroup("interests");
    scheduleDraftSave();
  });

  root.querySelector("#mmdApplicationGoMembership").addEventListener("click", () => {
    window.location.href = appendParams(MEMBERSHIP_URL);
  });

  root.querySelector("#mmdApplicationGoDashboard").addEventListener("click", () => {
    window.location.href = appendParams(DASHBOARD_URL);
  });

  restoreDraft();
  showStep(currentStep, false);
})();
