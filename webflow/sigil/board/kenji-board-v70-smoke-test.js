(function () {
  "use strict";

  var UNLOCKED = "unlocked";
  var ROLE = "member";

  function hasElement(selector) {
    return Boolean(document.querySelector(selector));
  }

  async function runSmokeTest() {
    var helperLoaded = typeof window.mmdBoardV70UnlockGate === "function";
    var authHelperLoaded = Boolean(window.MMDGate && typeof window.MMDGate.requireMmdAuth === "function");
    var root = document.querySelector("[data-mmd-board-v70]");

    if (helperLoaded && authHelperLoaded && root && root.getAttribute("data-gate") !== UNLOCKED) {
      await window.mmdBoardV70UnlockGate({ redirect: false });
    }

    var result = {
      ok: false,
      root: hasElement("[data-mmd-board-v70]"),
      authCheck: hasElement("[data-v70-auth-check]"),
      unlockButton: hasElement("[data-v70-action=\"unlock-gate\"]"),
      status: hasElement("[data-v70-gate-status]"),
      helperLoaded: helperLoaded,
      authHelperLoaded: authHelperLoaded,
      gate: root ? root.getAttribute("data-gate") : "",
      role: root ? root.getAttribute("data-role") : ""
    };

    result.ok = Boolean(
      result.root &&
      result.authCheck &&
      result.unlockButton &&
      result.status &&
      result.helperLoaded &&
      result.authHelperLoaded &&
      result.gate === UNLOCKED &&
      result.role === ROLE
    );

    return result;
  }

  window.mmdBoardV70SmokeTest = runSmokeTest;
})();
