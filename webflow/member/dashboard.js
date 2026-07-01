(function () {
  "use strict";

  var DEFAULT_AUTH_BASE = "https://mmdbkk.com";
  var LOGIN_PATH = "/login";

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function text(value) {
    return value === undefined || value === null || value === "" ? "-" : String(value);
  }

  function setText(root, key, value) {
    var node = $("[data-mmd-member-field='" + key + "']", root);
    if (node) node.textContent = text(value);
  }

  function renderList(root, key, rows) {
    var node = $("[data-mmd-member-list='" + key + "']", root);
    if (!node) return;
    var items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      node.innerHTML = "<li>None</li>";
      return;
    }
    node.innerHTML = items.map(function (item) {
      if (typeof item === "string") return "<li>" + escapeHtml(item) + "</li>";
      return "<li><strong>" + escapeHtml(item.resource_key || item.access_key || item.package_code || "grant") + "</strong><span>" + escapeHtml(item.min_tier || item.tier || "") + "</span><small>" + escapeHtml(item.expires_at || "") + "</small></li>";
    }).join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function currentPath() {
    return (window.location.pathname || "/member/dashboard") + (window.location.search || "");
  }

  async function logout(options) {
    var baseUrl = String((options && options.baseUrl) || window.MMD_AUTH_WORKER_BASE_URL || DEFAULT_AUTH_BASE).replace(/\/+$/, "");
    await fetch(baseUrl + "/v1/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    }).catch(function () {});
    window.location.href = LOGIN_PATH;
  }

  function render(root, auth) {
    var profile = (auth && auth.profile) || {};
    var session = (auth && auth.session) || {};
    setText(root, "name", profile.name);
    setText(root, "email", profile.email);
    setText(root, "phone", profile.phone);
    setText(root, "tier", profile.tier);
    setText(root, "status", profile.status);
    setText(root, "expire_at", profile.expire_at);
    setText(root, "package_code", profile.package_code);
    setText(root, "session_expires_at", session.expires_at);
    renderList(root, "entitlements", profile.entitlements);
    renderList(root, "grants", profile.grants);
    root.setAttribute("data-authenticated", "true");
  }

  async function boot(root, options) {
    var container = root || document.querySelector("[data-mmd-member-dashboard-auth]");
    if (!container) return null;
    window.MMD_AUTH_WORKER_BASE_URL = window.MMD_AUTH_WORKER_BASE_URL || DEFAULT_AUTH_BASE;
    if (!window.MMDGate || typeof window.MMDGate.requireMmdAuth !== "function") {
      window.location.href = LOGIN_PATH + "?next=" + encodeURIComponent(currentPath());
      return null;
    }

    var auth = await window.MMDGate.requireMmdAuth(options || {});
    if (!auth) return null;
    render(container, auth);
    var logoutButton = $("[data-mmd-member-logout]", container);
    if (logoutButton) {
      logoutButton.addEventListener("click", function (event) {
        event.preventDefault();
        logout(options || {});
      });
    }
    return auth;
  }

  window.MMDMemberDashboard = {
    version: "mmd-member-dashboard-auth-worker-v1",
    boot: boot,
    render: render,
    logout: logout
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot();
    }, { once: true });
  } else {
    boot();
  }
})();
