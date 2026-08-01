/* MMD PRIVÉ — MEMBER APPLICATION OS ADD-ON
 * Load after member-apply.js.
 * Adds health checks, offline queue, idempotency, duplicate guard,
 * exponential retry, analytics hooks, and resilient submit handling.
 */
(() => {
  "use strict";

  const root = document.getElementById("mmd-member-application");
  const form = document.getElementById("mmdMemberApplicationForm");
  if (!root || !form || root.dataset.osReady === "true") return;
  root.dataset.osReady = "true";

  const API_BASE = (root.dataset.apiBase || location.origin).replace(/\/$/, "");
  const SUBMIT_PATH = root.dataset.submitPath || "/v1/member/applications";
  const HEALTH_PATH = root.dataset.healthPath || "/ping";
  const DASHBOARD_URL = root.dataset.dashboardUrl || "/member/dashboard";
  const MEMBERSHIP_URL = root.dataset.membershipUrl || "/sigil/member/membership";
  const HELP_URL = root.dataset.helpUrl || "https://t.me/mmdapply";

  const QUEUE_KEY = "mmd_member_application_queue_v1";
  const LAST_SUBMISSION_KEY = "mmd_member_application_last_submission_v1";
  const DRAFT_KEY = "mmd_member_application_draft_v1";
  const MAX_ATTEMPTS = 5;
  const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

  const stateEl = root.querySelector("#mmdApplicationState");
  const submitBtn = root.querySelector("#mmdApplicationSubmit");
  const backBtn = root.querySelector("#mmdApplicationBack");
  const successModal = root.querySelector("#mmdApplicationSuccess");
  const referenceEl = root.querySelector("#mmdApplicationReference");

  let health = "checking";
  let submitting = false;

  const healthBadge = document.createElement("div");
  healthBadge.className = "mmd-member-application__health";
  healthBadge.innerHTML = '<span aria-hidden="true"></span><b>Checking Worker</b>';
  root.querySelector(".mmd-member-application__header-status")?.appendChild(healthBadge);

  function emit(name, detail = {}) {
    const payload = {
      event: name,
      route: "/member/apply",
      at: new Date().toISOString(),
      ...detail
    };
    window.dispatchEvent(new CustomEvent(`mmd:${name}`, { detail: payload }));
    if (Array.isArray(window.dataLayer)) window.dataLayer.push(payload);
  }

  function setState(message = "", type = "") {
    if (!stateEl) return;
    stateEl.textContent = message;
    stateEl.className = "mmd-member-application__state";
    if (type) stateEl.classList.add(`is-${type}`);
  }

  function setHealth(next, label) {
    health = next;
    healthBadge.dataset.health = next;
    const text = healthBadge.querySelector("b");
    if (text) text.textContent = label;
  }

  async function checkHealth() {
    if (!navigator.onLine) {
      setHealth("offline", "Offline mode");
      return false;
    }

    setHealth("checking", "Checking Worker");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    try {
      const response = await fetch(`${API_BASE}${HEALTH_PATH}`, {
        method: "GET",
        headers: { Accept: "application/json, text/plain" },
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Health ${response.status}`);
      setHealth("online", "Worker online");
      return true;
    } catch (error) {
      setHealth("degraded", "Worker unavailable");
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function selectedValues(name) {
    return [...form.querySelectorAll(`[name="${name}"]:checked`)].map(node => node.value);
  }

  function buildPayload() {
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
    payload.page_url = location.href;
    payload.submitted_at = new Date().toISOString();
    payload.client_version = "member-apply-os/1.0.0";
    payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bangkok";
    payload.locale = document.documentElement.lang || navigator.language || "th";
    return payload;
  }

  async function sha256(text) {
    if (!crypto?.subtle) return btoa(unescape(encodeURIComponent(text))).slice(0, 40);
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  async function fingerprint(payload) {
    return sha256([
      normalize(payload.full_name),
      normalize(payload.phone),
      normalize(payload.email),
      normalize(payload.line_contact),
      normalize(payload.telegram_username),
      normalize(payload.code),
      normalize(payload.promo)
    ].join("|"));
  }

  function makeIdempotencyKey(fingerprintValue) {
    const stamp = new Date().toISOString().slice(0, 10);
    return `member-apply:${stamp}:${fingerprintValue.slice(0, 32)}`;
  }

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function isRecentDuplicate(fingerprintValue) {
    const last = readJson(LAST_SUBMISSION_KEY, null);
    return Boolean(
      last &&
      last.fingerprint === fingerprintValue &&
      Date.now() - Number(last.saved_at || 0) < DUPLICATE_WINDOW_MS
    );
  }

  function rememberSubmission(fingerprintValue, reference) {
    writeJson(LAST_SUBMISSION_KEY, {
      fingerprint: fingerprintValue,
      reference,
      saved_at: Date.now()
    });
  }

  function queueRequest(request) {
    const queue = readJson(QUEUE_KEY, []);
    const exists = queue.some(item => item.idempotency_key === request.idempotency_key);
    if (!exists) queue.push(request);
    writeJson(QUEUE_KEY, queue.slice(-10));
    emit("member_application_queued", { idempotency_key: request.idempotency_key });
  }

  function removeQueuedRequest(idempotencyKey) {
    const queue = readJson(QUEUE_KEY, []);
    writeJson(QUEUE_KEY, queue.filter(item => item.idempotency_key !== idempotencyKey));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function postRequest(request, attempt = 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${API_BASE}${SUBMIT_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Idempotency-Key": request.idempotency_key,
          "X-MMD-Client": "member-apply-os/1.0.0"
        },
        credentials: "include",
        body: JSON.stringify(request.payload),
        signal: controller.signal
      });

      let result = {};
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) result = await response.json();

      if (response.status === 409) {
        return {
          ok: true,
          duplicate: true,
          result: result || {}
        };
      }

      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
        const error = new Error(result?.message || result?.error || `Worker returned ${response.status}`);
        error.retryable = retryable;
        throw error;
      }

      return { ok: true, result };
    } catch (error) {
      const retryable = error.name === "AbortError" || error.retryable || !navigator.onLine;
      if (retryable && attempt < MAX_ATTEMPTS && navigator.onLine) {
        const delay = Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
        emit("member_application_retry", { attempt, delay });
        await sleep(delay);
        return postRequest(request, attempt + 1);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function makeFallbackReference() {
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(2, 12);
    return `MMD-MA-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  function showSuccess(reference) {
    applicationReference = reference;
    if (referenceEl) referenceEl.textContent = reference;
    if (successModal) successModal.hidden = false;
    document.body.style.overflow = "hidden";
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
    setState("ส่งข้อมูลเรียบร้อย", "success");
    emit("member_application_success", { reference });
  }

  async function resilientSubmit() {
    if (submitting) return;
    submitting = true;
    submitBtn.disabled = true;
    if (backBtn) backBtn.disabled = true;

    try {
      const payload = buildPayload();
      if (!payload.consent_accuracy || !payload.consent_privacy) {
        throw new Error("กรุณายืนยันข้อมูลและนโยบายความเป็นส่วนตัวก่อนส่ง");
      }

      const fingerprintValue = await fingerprint(payload);
      if (isRecentDuplicate(fingerprintValue)) {
        const last = readJson(LAST_SUBMISSION_KEY, {});
        setState(`ใบสมัครนี้เพิ่งถูกส่งแล้ว Reference: ${last.reference || "กำลังตรวจสอบ"}`, "error");
        emit("member_application_duplicate_blocked");
        return;
      }

      const request = {
        payload,
        idempotency_key: makeIdempotencyKey(fingerprintValue),
        fingerprint: fingerprintValue,
        queued_at: new Date().toISOString()
      };

      emit("member_application_submit_started", { idempotency_key: request.idempotency_key });

      if (!navigator.onLine) {
        queueRequest(request);
        setState("อุปกรณ์ออฟไลน์ ระบบเก็บใบสมัครไว้และจะส่งให้อัตโนมัติเมื่อออนไลน์", "success");
        return;
      }

      setState("กำลังส่งข้อมูลอย่างปลอดภัย...");
      const response = await postRequest(request);
      const result = response.result || {};
      const reference =
        result.application_reference ||
        result.reference ||
        result.application_id ||
        result.id ||
        makeFallbackReference();

      rememberSubmission(fingerprintValue, reference);
      removeQueuedRequest(request.idempotency_key);
      showSuccess(reference);
    } catch (error) {
      const payload = buildPayload();
      const fingerprintValue = await fingerprint(payload);
      const request = {
        payload,
        idempotency_key: makeIdempotencyKey(fingerprintValue),
        fingerprint: fingerprintValue,
        queued_at: new Date().toISOString()
      };

      if (!navigator.onLine || error.name === "AbortError" || error.retryable) {
        queueRequest(request);
        setState("Worker ยังไม่พร้อม ระบบเก็บใบสมัครไว้และจะลองส่งให้อัตโนมัติ", "success");
      } else {
        setState(error.message || "ส่งข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง", "error");
      }
      emit("member_application_submit_failed", { message: error.message || "unknown" });
    } finally {
      submitting = false;
      submitBtn.disabled = false;
      if (backBtn) backBtn.disabled = false;
    }
  }

  async function flushQueue() {
    if (!navigator.onLine) return;
    const queue = readJson(QUEUE_KEY, []);
    if (!queue.length) return;

    setState(`กำลังส่งใบสมัครที่รออยู่ ${queue.length} รายการ...`);
    for (const request of queue) {
      try {
        const response = await postRequest(request);
        const result = response.result || {};
        const reference =
          result.application_reference ||
          result.reference ||
          result.application_id ||
          result.id ||
          makeFallbackReference();
        rememberSubmission(request.fingerprint, reference);
        removeQueuedRequest(request.idempotency_key);
        showSuccess(reference);
        break;
      } catch (error) {
        emit("member_application_queue_flush_failed", { message: error.message || "unknown" });
        break;
      }
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    resilientSubmit();
  }, true);

  window.addEventListener("online", () => {
    setHealth("checking", "Back online");
    checkHealth().then(flushQueue);
  });

  window.addEventListener("offline", () => {
    setHealth("offline", "Offline mode");
    setState("อินเทอร์เน็ตขาดการเชื่อมต่อ ร่างข้อมูลยังถูกเก็บอยู่ในอุปกรณ์", "error");
  });

  root.querySelector("#mmdApplicationGoMembership")?.addEventListener("click", event => {
    event.stopImmediatePropagation();
    location.href = preserveParams(MEMBERSHIP_URL, applicationReference);
  }, true);

  root.querySelector("#mmdApplicationGoDashboard")?.addEventListener("click", event => {
    event.stopImmediatePropagation();
    location.href = preserveParams(DASHBOARD_URL, applicationReference);
  }, true);

  function preserveParams(url, reference = "") {
    const target = new URL(url, location.origin);
    const source = new URLSearchParams(location.search);
    ["t", "code", "promo"].forEach(name => {
      const value = source.get(name);
      if (value) target.searchParams.set(name, value);
    });
    if (reference) target.searchParams.set("application_ref", reference);
    return target.toString();
  }

  emit("member_application_os_ready", {
    online: navigator.onLine,
    queued: readJson(QUEUE_KEY, []).length,
    help_url: HELP_URL
  });

  checkHealth().then(() => {
    if (navigator.onLine) flushQueue();
  });
})();
