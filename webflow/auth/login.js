(function () {
  "use strict";

  var DEFAULT_AUTH_BASE = "https://mmdbkk.com";
  var DEFAULT_NEXT = "/member/dashboard";

  function authBaseUrl(options) {
    var value = (options && options.baseUrl) || window.MMD_AUTH_WORKER_BASE_URL || DEFAULT_AUTH_BASE;
    return String(value || DEFAULT_AUTH_BASE).replace(/\/+$/, "");
  }

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function safeNext(value) {
    var fallback = DEFAULT_NEXT;
    var raw = String(value || "").trim();
    if (!raw) return fallback;
    try {
      var url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return fallback;
      return (url.pathname || fallback) + (url.search || "") + (url.hash || "");
    } catch (_) {
      return raw.charAt(0) === "/" && raw.charAt(1) !== "/" ? raw : fallback;
    }
  }

  function nextFromLocation() {
    try {
      return safeNext(new URLSearchParams(window.location.search || "").get("next"));
    } catch (_) {
      return DEFAULT_NEXT;
    }
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function setStatus(root, message, state) {
    var node = $("[data-mmd-login-status]", root);
    if (!node) return;
    node.textContent = message || "";
    node.setAttribute("data-state", state || "");
  }

  function setCodeStep(root, enabled) {
    var codePanel = $("[data-mmd-login-code-panel]", root);
    var codeInput = $("[data-mmd-login-code]", root);
    var verifyButton = $("[data-mmd-login-verify]", root);
    if (codePanel) codePanel.hidden = !enabled;
    if (codeInput) codeInput.disabled = !enabled;
    if (verifyButton) verifyButton.disabled = !enabled;
  }

  async function postJson(path, payload, options) {
    var response = await fetch(authBaseUrl(options) + path, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload || {})
    });
    var data = await response.json().catch(function () {
      return null;
    });
    if (!response.ok || !data || data.ok === false) {
      var err = new Error((data && data.error && data.error.message) || "Request failed.");
      err.code = data && data.error && data.error.code;
      throw err;
    }
    return data;
  }

  async function requestCode(root, options) {
    var emailInput = $("[data-mmd-login-email]", root);
    var email = normalizeEmail(emailInput && emailInput.value);
    if (!email || email.indexOf("@") < 1) {
      setStatus(root, "Enter a valid email address.", "error");
      return null;
    }

    setStatus(root, "Requesting your login code...", "loading");
    try {
      var data = await postJson("/v1/auth/request-code", { email: email }, options);
      setCodeStep(root, true);
      setStatus(root, data.message || "Code ready. Check your delivery channel and enter it here.", "success");
      return data;
    } catch (error) {
      setStatus(root, error.message || "Unable to request code.", "error");
      return null;
    }
  }

  async function verifyCode(root, options) {
    var emailInput = $("[data-mmd-login-email]", root);
    var codeInput = $("[data-mmd-login-code]", root);
    var email = normalizeEmail(emailInput && emailInput.value);
    var code = String((codeInput && codeInput.value) || "").trim();
    if (!email || email.indexOf("@") < 1) {
      setStatus(root, "Enter a valid email address.", "error");
      return null;
    }
    if (!/^\d{6}$/.test(code)) {
      setStatus(root, "Enter the 6-digit code.", "error");
      return null;
    }

    setStatus(root, "Verifying session...", "loading");
    try {
      var data = await postJson("/v1/auth/verify-code", { email: email, code: code }, options);
      setStatus(root, "Login confirmed. Redirecting...", "success");
      window.location.href = nextFromLocation();
      return data;
    } catch (error) {
      setStatus(root, error.message || "Code is invalid or expired.", "error");
      return null;
    }
  }

  function boot(root, options) {
    var container = root || document.querySelector("[data-mmd-login]");
    if (!container) return null;
    window.MMD_AUTH_WORKER_BASE_URL = window.MMD_AUTH_WORKER_BASE_URL || DEFAULT_AUTH_BASE;
    setCodeStep(container, false);

    var requestButton = $("[data-mmd-login-request]", container);
    var verifyButton = $("[data-mmd-login-verify]", container);
    if (requestButton) {
      requestButton.addEventListener("click", function (event) {
        event.preventDefault();
        requestCode(container, options || {});
      });
    }
    if (verifyButton) {
      verifyButton.addEventListener("click", function (event) {
        event.preventDefault();
        verifyCode(container, options || {});
      });
    }
    return container;
  }

  window.MMDLogin = {
    version: "mmd-login-auth-worker-v1",
    boot: boot,
    requestCode: requestCode,
    verifyCode: verifyCode,
    safeNext: safeNext,
    nextFromLocation: nextFromLocation,
    authBaseUrl: authBaseUrl
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot();
    }, { once: true });
  } else {
    boot();
  }
})();
