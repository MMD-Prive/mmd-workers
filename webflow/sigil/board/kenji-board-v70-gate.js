(function () {
  "use strict";

  if (window.mmdBoardV70GateHandlerInstalled) return;
  window.mmdBoardV70GateHandlerInstalled = true;

  var UNLOCKED = "unlocked";
  var ROLE = "member";

  var ROOT_SELECTOR = [
    "[data-mmd-board-v70]",
    "[data-mmd-board-v7]",
    "#mmd-board-v70",
    "#mmd-board-v7",
    ".mmd-board-v70",
    ".mmd-board-v7"
  ].join(",");

  var GATE_SELECTOR = [
    "[data-v70-action='unlock-gate']",
    "[data-v7-action='unlock-gate']",
    "[data-mmd-board-v70-unlock]",
    "[data-mmd-board-v7-unlock]",
    "[data-mmd-board-v70-gate]",
    "[data-mmd-board-v7-gate]",
    "[data-gate-action='unlock']",
    "#mmdBoardV70Gate",
    "#mmdBoardV70UnlockGate",
    ".mmd-board-v70__gate"
  ].join(",");

  var AUTH_CHECK_SELECTOR = [
    "[data-v70-auth-check]",
    "[data-v7-auth-check]",
    "[data-mmd-auth-check]"
  ].join(",");

  var STATUS_SELECTOR = [
    "[data-v70-gate-status]",
    "[data-v7-gate-status]",
    "#mmdBoardV70GateStatus",
    "[data-gate-status]"
  ].join(",");

  function findRoot(node) {
    if (node && node.closest) {
      var closest = node.closest(ROOT_SELECTOR);
      if (closest) return closest;
    }
    return document.querySelector(ROOT_SELECTOR);
  }

  function setStatus(root, message, tone) {
    var target = root && root.querySelector ? root.querySelector(STATUS_SELECTOR) : null;
    if (!target) target = document.querySelector(STATUS_SELECTOR);
    if (!target) return;

    target.textContent = message;
    target.setAttribute("data-gate-tone", tone || "neutral");
  }

  function applyUnlockedState(root, auth) {
    if (root) {
      root.setAttribute("data-gate", UNLOCKED);
      root.setAttribute("data-role", ROLE);
      root.classList.add("is-gate-unlocked");
    }

    setStatus(root, "Gate unlocked.", "ok");
    document.dispatchEvent(new CustomEvent("mmd:board-v70-gate-unlocked", {
      detail: {
        gate: UNLOCKED,
        role: ROLE,
        auth: auth
      }
    }));

    return {
      ok: true,
      gate: UNLOCKED,
      role: ROLE,
      auth: auth
    };
  }

  async function unlockGate(options) {
    var detail = typeof options === "string" ? {} : options || {};
    var root = detail.root || findRoot(detail.target);
    var gate = window.MMDGate;

    if (!gate || typeof gate.requireMmdAuth !== "function") {
      setStatus(root, "Auth gate unavailable. Load mmd-gate.js before this helper.", "error");
      return {
        ok: false,
        error: "auth_gate_unavailable"
      };
    }

    setStatus(root, "Checking session.", "pending");
    var auth = await gate.requireMmdAuth({ redirect: detail.redirect !== false });
    if (!auth) {
      setStatus(root, "Session required.", "error");
      return {
        ok: false,
        error: "session_required"
      };
    }

    return applyUnlockedState(root, auth);
  }

  document.addEventListener("click", function (event) {
    var gate = event.target && event.target.closest ? event.target.closest(GATE_SELECTOR) : null;
    if (!gate) return;

    var root = findRoot(gate);
    if (root && !root.contains(gate)) return;

    event.preventDefault();
    unlockGate({
      target: gate,
      root: root,
      redirect: gate.getAttribute("data-no-redirect") !== "true"
    });
  });

  document.addEventListener("DOMContentLoaded", function () {
    var authCheck = document.querySelector(AUTH_CHECK_SELECTOR);
    if (!authCheck) return;

    unlockGate({
      target: authCheck,
      root: findRoot(authCheck)
    });
  });

  window.mmdBoardV70UnlockGate = unlockGate;
})();
