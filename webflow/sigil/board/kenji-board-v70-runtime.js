(function () {
  "use strict";

  if (window.mmdBoardV70RuntimeHandlerInstalled) return;
  window.mmdBoardV70RuntimeHandlerInstalled = true;

  var UNLOCKED = "unlocked";
  var DEFAULT_BASE_URL = "https://sigil.mmdbkk.com";
  var DEFAULT_RUNTIME_PATH = "/sigil/board/runtime";

  var ROOT_SELECTOR = [
    "[data-mmd-board-v70]",
    "[data-mmd-board-v7]",
    "#mmd-board-v70",
    "#mmd-board-v7",
    ".mmd-board-v70",
    ".mmd-board-v7"
  ].join(",");

  var STATUS_SELECTOR = [
    "[data-v70-runtime-status]",
    "[data-v7-runtime-status]",
    "#mmdBoardV70RuntimeStatus"
  ].join(",");

  var META_SELECTOR = [
    "[data-v70-runtime-meta]",
    "[data-v7-runtime-meta]",
    "#mmdBoardV70RuntimeMeta"
  ].join(",");

  var RULES_SELECTOR = [
    "[data-v70-runtime-rules]",
    "[data-v7-runtime-rules]",
    "#mmdBoardV70RuntimeRules"
  ].join(",");

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function cleanBase(value) {
    return clean(value).replace(/\/+$/, "");
  }

  function cleanPath(value) {
    var path = clean(value) || DEFAULT_RUNTIME_PATH;
    return path.charAt(0) === "/" ? path : "/" + path;
  }

  function runtimeUrl() {
    var explicit = clean(window.MMD_SIGIL_BOARD_RUNTIME_URL || window.SIGIL_BOARD_RUNTIME_URL);
    if (explicit) return explicit;

    var base = cleanBase(
      window.MMD_SIGIL_BOARD_WORKER_BASE_URL ||
      window.SIGIL_BOARD_WORKER_BASE_URL ||
      DEFAULT_BASE_URL
    );

    return base + cleanPath(window.MMD_SIGIL_BOARD_RUNTIME_PATH || window.SIGIL_RUNTIME_PATH);
  }

  function findRoot(node) {
    if (node && node.closest) {
      var closest = node.closest(ROOT_SELECTOR);
      if (closest) return closest;
    }
    return document.querySelector(ROOT_SELECTOR);
  }

  function findInRoot(root, selector) {
    if (root && root.querySelector) {
      var scoped = root.querySelector(selector);
      if (scoped) return scoped;
    }
    return document.querySelector(selector);
  }

  function setStatus(root, message, tone) {
    var target = findInRoot(root, STATUS_SELECTOR);
    if (!target) return;
    target.textContent = message;
    target.setAttribute("data-runtime-tone", tone || "neutral");
  }

  function setMeta(root, message) {
    var target = findInRoot(root, META_SELECTOR);
    if (!target) return;
    target.textContent = message || "";
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function appendText(node, text) {
    node.appendChild(document.createTextNode(clean(text)));
  }

  function renderList(root, runtime) {
    var target = findInRoot(root, RULES_SELECTOR);
    if (!target) return;

    while (target.firstChild) target.removeChild(target.firstChild);

    var lockedTruths = asArray(runtime.locked_truth).slice(0, 6);
    var rules = asArray(runtime.rules).slice(0, 8);

    lockedTruths.forEach(function (truth) {
      var item = document.createElement("li");
      item.setAttribute("data-runtime-item", "locked-truth");
      appendText(item, truth);
      target.appendChild(item);
    });

    rules.forEach(function (rule) {
      var item = document.createElement("li");
      var title = clean(rule.name || rule.id || "SIGIL rule");
      var status = clean(rule.status || "active");
      var body = clean(rule.body || rule.intent || "");

      item.setAttribute("data-runtime-item", "rule");
      item.setAttribute("data-runtime-rule-status", status);
      appendText(item, title + " — " + status);
      if (body) appendText(item, ": " + body);
      target.appendChild(item);
    });
  }

  function renderRuntime(root, runtime) {
    if (root) {
      root.setAttribute("data-runtime", "loaded");
      root.setAttribute("data-runtime-source", clean(runtime.source || "unknown"));
      root.setAttribute("data-board-level", clean(runtime.board_level || "unknown"));
    }

    setStatus(root, "SIGIL runtime connected.", "ok");
    setMeta(root, [
      clean(runtime.board_level || "Board"),
      clean(runtime.mode || "safe_runtime"),
      "source " + clean(runtime.source || "unknown")
    ].filter(Boolean).join(" · "));
    renderList(root, runtime);
  }

  async function loadRuntime(options) {
    var detail = options || {};
    var root = detail.root || findRoot(detail.target);

    if (root && root.getAttribute("data-gate") !== UNLOCKED && detail.force !== true) {
      setStatus(root, "Unlock SIGIL access before loading runtime.", "locked");
      return {
        ok: false,
        error: "gate_locked"
      };
    }

    setStatus(root, "Loading SIGIL runtime.", "pending");

    try {
      var response = await fetch(runtimeUrl(), {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json"
        }
      });
      var data = await response.json().catch(function () {
        return null;
      });

      if (!response.ok || !data || data.ok === false) {
        setStatus(root, "Runtime unavailable. Safe mode remains active.", "error");
        return {
          ok: false,
          error: "runtime_unavailable",
          status: response.status,
          data: data
        };
      }

      renderRuntime(root, data);
      document.dispatchEvent(new CustomEvent("mmd:board-v70-runtime-loaded", {
        detail: {
          runtime: data,
          root: root
        }
      }));

      return {
        ok: true,
        runtime: data
      };
    } catch (error) {
      setStatus(root, "Runtime connection failed. Safe mode remains active.", "error");
      return {
        ok: false,
        error: "runtime_connection_failed"
      };
    }
  }

  document.addEventListener("mmd:board-v70-gate-unlocked", function (event) {
    loadRuntime({
      root: event && event.detail ? event.detail.root : null,
      force: true
    });
  });

  document.addEventListener("DOMContentLoaded", function () {
    var root = findRoot();
    if (root && root.getAttribute("data-gate") === UNLOCKED) {
      loadRuntime({ root: root, force: true });
    }
  });

  window.mmdBoardV70LoadRuntime = loadRuntime;
  window.mmdBoardV70RuntimeUrl = runtimeUrl;
})();
