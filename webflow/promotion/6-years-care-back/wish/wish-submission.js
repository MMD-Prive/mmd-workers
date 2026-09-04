(() => {
  "use strict";

  const ENDPOINT = "/member/api/care-back/public-wish";
  const LINK_ENDPOINT = "/member/api/care-back/link-wish";
  const MEMBER_URL = "/member/my-mmd";
  const MAX_WISH = 600;
  const LINK_TOKEN_KEY = "mmd-care-back-wish-link-token";
  const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/;
  const COPY = Object.freeze({
    th: {
      label: "คำอวยพรถึง MMD",
      placeholder: "เขียนคำอวยพรถึง MMD ได้เลยครับ",
      submit: "ส่งคำอวยพร",
      pending: "กำลังส่งคำอวยพรของคุณครับ",
      empty: "เขียนคำอวยพรก่อนส่งนะครับ",
      tooLong: "คำอวยพรยาวเกินจำนวนที่กำหนดครับ",
      invalid: "มีอักขระที่ใช้ไม่ได้ครับ ลองปรับข้อความอีกครั้ง",
      unavailable: "ตอนนี้ยังส่งไม่ได้ครับ ลองใหม่อีกครั้งในอีกสักครู่",
      success: "MMD ได้รับคำอวยพรของคุณแล้วครับ",
      benefit: "คูปอง วันสมาชิก และ Points ที่ตรวจได้จริง ดูต่อใน My MMD ได้เลยครับ",
      counter: "ตัวอักษร",
      benefitCta: "เปิด My MMD",
    },
    en: {
      label: "Your wish to MMD",
      placeholder: "Write your birthday wish to MMD.",
      submit: "Send my wish",
      pending: "Sending your wish…",
      empty: "Please write your wish before sending.",
      tooLong: "Your wish is longer than the allowed limit.",
      invalid: "Some characters cannot be used. Please revise your wish.",
      unavailable: "Your wish cannot be sent right now. Please try again shortly.",
      success: "MMD has received your wish.",
      benefit: "Verified coupon, membership days and Points continue in My MMD.",
      counter: "characters",
      benefitCta: "Open My MMD",
    },
    zh: {
      label: "写给 MMD 的祝福",
      placeholder: "写下您给 MMD 的生日祝福。",
      submit: "发送祝福",
      pending: "正在发送您的祝福…",
      empty: "请先写下祝福再发送。",
      tooLong: "祝福内容超过允许的长度。",
      invalid: "内容含有无法使用的字符，请修改后重试。",
      unavailable: "暂时无法发送祝福，请稍后再试。",
      success: "MMD 已收到您的祝福。",
      benefit: "已核实的优惠券、会员天数和 Points 请在 My MMD 继续查看。",
      counter: "字符",
      benefitCta: "打开 My MMD",
    },
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  function boot() {
    const root = document.querySelector("#mmd-wish");
    const starts = root ? Array.from(root.querySelectorAll("[data-start]")) : Array.from(document.querySelectorAll("[data-start]"));
    const existing = root ? findExistingForm(root) : null;

    if (root) {
      root.dataset.wishEndpoint = ENDPOINT;
      root.setAttribute("data-wish-endpoint", ENDPOINT);
      root.dataset.dashboardUrl = MEMBER_URL;
      root.setAttribute("data-dashboard-url", MEMBER_URL);
      const dashboard = root.querySelector("[data-dashboard]");
      if (dashboard) dashboard.href = MEMBER_URL;
    }

    if (existing) bindExistingForm(root, starts, existing);
    else for (const start of starts) bindGeneratedForm(start);

    void tryLinkStoredWish();
  }

  function findExistingForm(root) {
    const textarea = root.querySelector("[data-message]");
    const consent = root.querySelector("[data-consent]");
    const submit = root.querySelector("[data-submit]");
    if (!textarea || !consent || !submit) return null;
    return {
      wrap: root.querySelector("#wish-flow") || textarea.closest("section") || textarea.parentElement,
      textarea,
      consent,
      submit,
      count: root.querySelector("[data-count]"),
      status: root.querySelector("[data-status]"),
      error: root.querySelector("[data-error]"),
      success: root.querySelector("[data-success]"),
      successCopy: root.querySelector("[data-success-copy]"),
      dashboard: root.querySelector("[data-dashboard]"),
      prompts: Array.from(root.querySelectorAll("[data-prompt]")),
      pending: false,
      sent: false,
      limit: effectiveLimit(textarea),
    };
  }

  function bindExistingForm(root, starts, form) {
    if (root.dataset.mmdWishExistingBound === "true") return;
    root.dataset.mmdWishExistingBound = "true";

    for (const start of starts) {
      start.dataset.mmdWishBound = "true";
      start.addEventListener("click", (event) => {
        event.preventDefault();
        if (form.sent) {
          if (form.success) form.success.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
          return;
        }
        if (form.wrap) form.wrap.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
        form.textarea.disabled = false;
        form.consent.disabled = false;
        form.textarea.focus({ preventScroll: true });
        syncExisting(form);
      });
    }

    form.textarea.addEventListener("input", () => {
      clearExistingError(form);
      syncExisting(form);
    });
    form.consent.addEventListener("change", () => {
      clearExistingError(form);
      syncExisting(form);
    });
    form.submit.addEventListener("click", (event) => void submitExistingWish(event, root, form));

    for (const prompt of form.prompts) {
      prompt.addEventListener("click", () => {
        if (form.sent) return;
        form.textarea.value = String(prompt.dataset.prompt || "").slice(0, form.limit);
        form.textarea.focus();
        clearExistingError(form);
        syncExisting(form);
      });
    }

    syncExisting(form);
  }

  async function submitExistingWish(event, root, form) {
    event.preventDefault();
    if (form.pending || form.sent) return;
    const copy = currentCopy(root);
    const validation = validateWish(form.textarea.value, form.limit);
    if (!validation.ok) {
      setExistingError(form, copy[validation.reason]);
      form.textarea.focus();
      return;
    }
    if (!form.consent.checked) {
      syncExisting(form);
      return;
    }

    form.pending = true;
    syncExisting(form);
    setExistingStatus(form, copy.pending, "pending");
    clearExistingError(form);

    try {
      const payload = await postWish(validation.value, root);
      if (!isCompletedPayload(payload)) {
        setExistingError(form, safeFailureMessage(payload, copy));
        setExistingStatus(form, copy.unavailable, "error");
        return;
      }

      if (validLinkToken(payload.wish_link_token)) {
        rememberLinkToken(payload.wish_link_token);
        void tryLinkStoredWish();
      }

      const message = safeServerMessage(payload) || `${copy.success} ${copy.benefit}`;
      setExistingStatus(form, message, "success");
      if (form.successCopy) form.successCopy.textContent = message;
      if (form.success) form.success.hidden = false;
      if (form.dashboard) {
        form.dashboard.href = MEMBER_URL;
        const label = form.dashboard.querySelector("span");
        if (label) label.textContent = copy.benefitCta;
      }

      form.sent = true;
      form.textarea.disabled = true;
      form.consent.disabled = true;
      form.submit.disabled = true;
      form.submit.setAttribute("aria-busy", "false");
      document.dispatchEvent(new CustomEvent("mmd:care-back:wish-completed", { detail: { state: "completed", benefitVerificationRequired: true, next: MEMBER_URL } }));
      if (form.success) form.success.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    } catch {
      setExistingError(form, copy.unavailable);
      setExistingStatus(form, copy.unavailable, "error");
    } finally {
      form.pending = false;
      syncExisting(form);
    }
  }

  function syncExisting(form) {
    if (form.count) form.count.textContent = `${form.textarea.value.length} / ${form.limit}`;
    const hasText = String(form.textarea.value || "").trim().length > 0;
    form.submit.disabled = !hasText || !form.consent.checked || form.pending || form.sent;
    form.submit.setAttribute("aria-busy", form.pending ? "true" : "false");
  }

  function clearExistingError(form) {
    if (form.error) form.error.textContent = "";
  }

  function setExistingError(form, message) {
    if (form.error) form.error.textContent = message || "";
  }

  function setExistingStatus(form, message, state) {
    if (!form.status) return;
    form.status.textContent = message || "";
    form.status.dataset.state = state;
  }

  function bindGeneratedForm(start) {
    if (start.dataset.mmdWishBound === "true") return;
    start.dataset.mmdWishBound = "true";
    const form = buildForm();
    const mount = start.closest("section") || start.parentElement || document.querySelector("main");
    if (!mount) return;
    mount.insertAdjacentElement("afterend", form.wrap);
    start.addEventListener("click", () => {
      form.wrap.hidden = false;
      form.wrap.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      form.textarea.focus({ preventScroll: true });
    });
    form.textarea.addEventListener("input", () => updateCount(form));
    form.element.addEventListener("submit", (event) => void submitGeneratedWish(event, form));
  }

  function buildForm() {
    const copy = currentCopy();
    const wrap = element("section", "mmd-wish-submit");
    wrap.hidden = true;
    wrap.setAttribute("aria-labelledby", "mmd-wish-submit-title");
    const elementForm = element("form", "mmd-wish-submit__form");
    elementForm.noValidate = true;
    const title = element("h2", "mmd-wish-submit__title", copy.label);
    title.id = "mmd-wish-submit-title";
    const textarea = element("textarea", "mmd-wish-submit__textarea");
    textarea.name = "wish_text";
    textarea.maxLength = MAX_WISH;
    textarea.rows = 6;
    textarea.required = true;
    textarea.placeholder = copy.placeholder;
    textarea.setAttribute("aria-describedby", "mmd-wish-submit-count mmd-wish-submit-status");
    const footer = element("div", "mmd-wish-submit__footer");
    const count = element("span", "mmd-wish-submit__count", `0 / ${MAX_WISH} ${copy.counter}`);
    count.id = "mmd-wish-submit-count";
    const submit = element("button", "mmd-wish-submit__button", copy.submit);
    submit.type = "submit";
    const status = element("p", "mmd-wish-submit__status");
    status.id = "mmd-wish-submit-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    footer.append(count, submit);
    elementForm.append(title, textarea, footer, status);
    wrap.append(elementForm);
    return { wrap, element: elementForm, textarea, count, submit, status, copy, pending: false };
  }

  async function submitGeneratedWish(event, form) {
    event.preventDefault();
    if (form.pending) return;
    const validation = validateWish(form.textarea.value, MAX_WISH);
    if (!validation.ok) {
      setStatus(form, form.copy[validation.reason], "error");
      form.textarea.focus();
      return;
    }
    form.pending = true;
    form.submit.disabled = true;
    setStatus(form, form.copy.pending, "pending");
    try {
      const payload = await postWish(validation.value);
      if (!isCompletedPayload(payload)) {
        setStatus(form, safeFailureMessage(payload, form.copy), "error");
        return;
      }
      if (validLinkToken(payload.wish_link_token)) {
        rememberLinkToken(payload.wish_link_token);
        void tryLinkStoredWish();
      }
      const message = safeServerMessage(payload) || `${form.copy.success} ${form.copy.benefit}`;
      setStatus(form, message, "success");
      form.textarea.disabled = true;
      form.submit.hidden = true;
      document.dispatchEvent(new CustomEvent("mmd:care-back:wish-completed", { detail: { state: "completed", benefitVerificationRequired: true, next: MEMBER_URL } }));
    } catch {
      setStatus(form, form.copy.unavailable, "error");
    } finally {
      form.pending = false;
      if (!form.textarea.disabled) form.submit.disabled = false;
    }
  }

  async function postWish(wishText, root) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(buildPayload(wishText, root)),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return payload || { ok: false, error: { code: "PUBLIC_WISH_REQUEST_FAILED" } };
    return payload;
  }

  async function tryLinkStoredWish() {
    const token = rememberedLinkToken();
    if (!token) return;
    try {
      const response = await fetch(LINK_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ wish_link_token: token }),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.ok === true && payload?.linked === true) forgetLinkToken();
    } catch {
      // Linking benefits is best-effort and must never block the public Wish.
    }
  }

  function validateWish(value, maxLength = MAX_WISH) {
    const wish = String(value || "").trim();
    const limit = boundedLimit(maxLength);
    if (!wish) return { ok: false, reason: "empty" };
    if (wish.length > limit) return { ok: false, reason: "tooLong" };
    if (/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(wish)) return { ok: false, reason: "invalid" };
    return { ok: true, value: wish };
  }

  function buildPayload(wishText, root) {
    return { wish_text: wishText, request_id: requestId(), language: currentLanguage(root) };
  }

  function requestId() {
    const uuid = globalThis.crypto?.randomUUID?.();
    const suffix = uuid || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const value = `wish-${suffix}`.replace(/[^A-Za-z0-9._~-]/g, "-").slice(0, 128);
    return REQUEST_ID_PATTERN.test(value) ? value : `wish-${Date.now().toString(36)}-${"x".repeat(16)}`;
  }

  function isCompletedPayload(payload) {
    return payload?.ok === true && payload?.state === "completed";
  }

  function safeServerMessage(payload) {
    const value = String(payload?.final_display?.message || "").trim();
    return value && value.length <= 300 && !/[<>\u0000-\u001F\u007F]/.test(value) ? value : "";
  }

  function safeFailureMessage(payload, copy) {
    const code = String(payload?.error?.code || "");
    if (/INVALID|CONTENT|TOO_LONG/.test(code)) return copy.invalid;
    return copy.unavailable;
  }

  function effectiveLimit(textarea) {
    const value = Number(textarea?.maxLength);
    return boundedLimit(value > 0 ? value : MAX_WISH);
  }

  function boundedLimit(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return MAX_WISH;
    return Math.min(MAX_WISH, Math.floor(numeric));
  }

  function validLinkToken(value) {
    return /^pw_[A-Za-z0-9_-]{40,100}$/.test(String(value || ""));
  }

  function rememberLinkToken(token) {
    try { localStorage.setItem(LINK_TOKEN_KEY, token); } catch {}
  }

  function rememberedLinkToken() {
    try {
      const token = localStorage.getItem(LINK_TOKEN_KEY) || "";
      return validLinkToken(token) ? token : "";
    } catch { return ""; }
  }

  function forgetLinkToken() {
    try { localStorage.removeItem(LINK_TOKEN_KEY); } catch {}
  }

  function updateCount(form) { form.count.textContent = `${form.textarea.value.length} / ${MAX_WISH} ${form.copy.counter}`; }
  function setStatus(form, message, state) { form.status.textContent = message; form.status.dataset.state = state; }
  function currentLanguage(root) {
    const language = String(root?.lang || document.documentElement?.lang || "th").toLowerCase();
    return language.startsWith("zh") ? "zh" : language.startsWith("en") ? "en" : "th";
  }
  function currentCopy(root) { return COPY[currentLanguage(root)] || COPY.th; }
  function element(tag, className, text) { const node = document.createElement(tag); node.className = className; if (text) node.textContent = text; return node; }
  function prefersReducedMotion() { return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true; }

  if (globalThis.__MMD_WISH_TEST_MODE__ === true) {
    globalThis.__MMD_WISH_TEST__ = Object.freeze({ validateWish, buildPayload, requestId, isCompletedPayload, safeServerMessage, safeFailureMessage, effectiveLimit, validLinkToken });
  }
})();