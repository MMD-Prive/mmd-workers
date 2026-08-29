(() => {
  "use strict";

  const ENDPOINT = "/member/api/liff/care-back/wish";
  const LIFF_URL = "https://liff.line.me/2010862595-yT4DCEMc?intent=promo&campaign=care_back&view=care_back&return_to=%2Fpromotion%2F6-years-care-back%2Fwish";
  const MAX_WISH = 600;
  const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/;
  const COPY = Object.freeze({
    th: {
      label: "คำอวยพรถึง MMD",
      placeholder: "เขียนคำอวยพรถึง MMD ได้เลยครับ",
      submit: "ส่งคำอวยพร",
      pending: "กำลังส่งคำอวยพรของคุณครับ",
      empty: "เขียนคำอวยพรก่อนส่งนะครับ",
      tooLong: "คำอวยพรยาวเกิน 600 ตัวอักษรครับ",
      invalid: "มีอักขระที่ใช้ไม่ได้ครับ ลองปรับข้อความอีกครั้ง",
      unavailable: "ตอนนี้ยังส่งคำอวยพรไม่ได้ครับ ลองใหม่อีกครั้งในอีกสักครู่",
      review: "ผมรับข้อมูลไว้แล้วครับ และจะตรวจสอบสิทธิ์ที่เกี่ยวข้องให้ต่อไป",
      signIn: "เปิดผ่าน LINE ก่อนนะครับ แล้วกลับมาส่งคำอวยพรได้ทันที",
      counter: "ตัวอักษร",
    },
    en: {
      label: "Your wish to MMD",
      placeholder: "Write your birthday wish to MMD.",
      submit: "Send my wish",
      pending: "Sending your wish…",
      empty: "Please write your wish before sending.",
      tooLong: "Please keep your wish within 600 characters.",
      invalid: "Some characters cannot be used. Please revise your wish.",
      unavailable: "Your wish cannot be sent right now. Please try again shortly.",
      review: "Your wish is saved. I’ll check the benefits that apply to you next.",
      signIn: "Please open this page through LINE, then return to send your wish.",
      counter: "characters",
    },
    zh: {
      label: "写给 MMD 的祝福",
      placeholder: "写下您给 MMD 的生日祝福。",
      submit: "发送祝福",
      pending: "正在发送您的祝福…",
      empty: "请先写下祝福再发送。",
      tooLong: "祝福内容请勿超过 600 个字符。",
      invalid: "内容含有无法使用的字符，请修改后重试。",
      unavailable: "暂时无法发送祝福，请稍后再试。",
      review: "祝福已保存，我会继续为您核对适用权益。",
      signIn: "请先通过 LINE 打开此页面，再返回发送祝福。",
      counter: "字符",
    },
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  function boot() {
    const starts = [...document.querySelectorAll("[data-start]")];
    for (const start of starts) bindStart(start);
  }

  function bindStart(start) {
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
    form.element.addEventListener("submit", (event) => void submitWish(event, form));
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

  async function submitWish(event, form) {
    event.preventDefault();
    if (form.pending) return;
    const validation = validateWish(form.textarea.value);
    if (!validation.ok) {
      setStatus(form, form.copy[validation.reason], "error");
      form.textarea.focus();
      return;
    }
    form.pending = true;
    form.submit.disabled = true;
    setStatus(form, form.copy.pending, "pending");
    try {
      const response = await fetch(endpointFromPage(), {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(buildPayload(validation.value)),
      });
      const payload = await response.json().catch(() => null);
      if (isAuthFailure(response, payload)) {
        setStatus(form, form.copy.signIn, "error");
        window.location.assign(LIFF_URL);
        return;
      }
      if (!response.ok || payload?.ok !== true || payload?.state !== "completed") {
        setStatus(form, safeFailureMessage(payload, form.copy), "error");
        return;
      }
      const message = safeServerMessage(payload) || form.copy.review;
      setStatus(form, message, "success");
      form.textarea.disabled = true;
      form.submit.hidden = true;
      document.dispatchEvent(new CustomEvent("mmd:care-back:wish-completed", { detail: { state: "completed" } }));
    } catch {
      setStatus(form, form.copy.unavailable, "error");
    } finally {
      form.pending = false;
      if (!form.textarea.disabled) form.submit.disabled = false;
    }
  }

  function endpointFromPage() {
    const raw = document.querySelector("[data-wish-endpoint]")?.getAttribute("data-wish-endpoint") || ENDPOINT;
    try {
      const url = new URL(raw, window.location.origin);
      return url.origin === window.location.origin && url.pathname === ENDPOINT ? `${url.pathname}${url.search}` : ENDPOINT;
    } catch {
      return ENDPOINT;
    }
  }

  function validateWish(value) {
    const wish = String(value || "").trim();
    if (!wish) return { ok: false, reason: "empty" };
    if (wish.length > MAX_WISH) return { ok: false, reason: "tooLong" };
    if (/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(wish)) return { ok: false, reason: "invalid" };
    return { ok: true, value: wish };
  }

  function buildPayload(wishText) {
    return { wish_text: wishText, request_id: requestId() };
  }

  function requestId() {
    const uuid = globalThis.crypto?.randomUUID?.();
    const suffix = uuid || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const value = `wish-${suffix}`.replace(/[^A-Za-z0-9._~-]/g, "-").slice(0, 128);
    return REQUEST_ID_PATTERN.test(value) ? value : `wish-${Date.now().toString(36)}-${"x".repeat(16)}`;
  }

  function safeServerMessage(payload) {
    const value = String(payload?.final_display?.message || "").trim();
    return value && value.length <= 240 && !/[<>\u0000-\u001F\u007F]/.test(value) ? value : "";
  }

  function safeFailureMessage(payload, copy) {
    const code = String(payload?.error?.code || "");
    if (/INVALID|CONTENT|TOO_LONG/.test(code)) return copy.invalid;
    if (/REVIEW|MEMBER_REQUIRED|CLAIM_REQUIRED|NOT_ELIGIBLE/.test(code)) return copy.review;
    return copy.unavailable;
  }

  function isAuthFailure(response, payload) {
    const code = String(payload?.error?.code || "");
    return response.status === 401 || response.status === 403 || /AUTH|SESSION|LIFF_TOKEN/.test(code);
  }

  function updateCount(form) {
    form.count.textContent = `${form.textarea.value.length} / ${MAX_WISH} ${form.copy.counter}`;
  }

  function setStatus(form, message, state) {
    form.status.textContent = message;
    form.status.dataset.state = state;
  }

  function currentCopy() {
    const language = String(document.documentElement.lang || "th").toLowerCase();
    if (language.startsWith("zh")) return COPY.zh;
    if (language.startsWith("en")) return COPY.en;
    return COPY.th;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  if (globalThis.__MMD_WISH_TEST_MODE__ === true) {
    globalThis.__MMD_WISH_TEST__ = Object.freeze({
      validateWish,
      buildPayload,
      requestId,
      safeServerMessage,
      safeFailureMessage,
      submitWish,
    });
  }
})();
