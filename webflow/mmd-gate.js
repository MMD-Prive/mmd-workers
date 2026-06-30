(function () {
  "use strict";

  if (window.MMDGate && window.MMDGate.version) return;

  var VERSION = "auth-worker-v1";

  function authBaseUrl(options) {
    var value = (options && options.baseUrl) || window.MMD_AUTH_WORKER_BASE_URL || "";
    return String(value || "").replace(/\/+$/, "");
  }

  function currentNextPath() {
    return (window.location.pathname || "/") + (window.location.search || "");
  }

  async function getMmdAuthMe(options) {
    var baseUrl = authBaseUrl(options || {});
    var response;
    var data = null;

    try {
      response = await fetch(baseUrl + "/v1/auth/me", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json"
        }
      });
      data = await response.json().catch(function () {
        return null;
      });
    } catch (error) {
      return {
        ok: false,
        authenticated: false,
        error: {
          code: "AUTH_CHECK_FAILED"
        }
      };
    }

    if (!response.ok || !data || data.ok === false || data.authenticated === false) {
      return {
        ok: false,
        authenticated: false,
        error: data && data.error ? data.error : { code: "SESSION_REQUIRED" }
      };
    }

    return data;
  }

  async function requireMmdAuth(options) {
    var settings = options || {};
    var data = await getMmdAuthMe(settings);

    if (!data || !data.authenticated) {
      if (settings.redirect !== false) {
        window.location.href = "/login?next=" + encodeURIComponent(currentNextPath());
      }
      return null;
    }

    return data;
  }

  window.MMDGate = {
    version: VERSION,
    getMmdAuthMe: getMmdAuthMe,
    requireMmdAuth: requireMmdAuth
  };

  window.getMmdAuthMe = getMmdAuthMe;
  window.requireMmdAuth = requireMmdAuth;
})();
