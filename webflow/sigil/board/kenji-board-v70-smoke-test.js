(function () {
  "use strict";

  var GATE_KEY = "mmd_board_v70_gate";
  var ROLE_KEY = "mmd_board_v70_role";
  var UNLOCKED = "unlocked";
  var ROLE = "boss_per";

  function hasElement(selector) {
    return Boolean(document.querySelector(selector));
  }

  function readLocalStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function runSmokeTest() {
    var helperLoaded = typeof window.mmdBoardV70UnlockGate === "function";
    var gate = readLocalStorage(GATE_KEY);

    if (helperLoaded && gate !== UNLOCKED) {
      window.mmdBoardV70UnlockGate("sigil");
      gate = readLocalStorage(GATE_KEY);
    }

    var result = {
      ok: false,
      root: hasElement("[data-mmd-board-v70]"),
      passphraseInput: hasElement("[data-v70-gate-passphrase]"),
      unlockButton: hasElement("[data-v70-action=\"unlock-gate\"]"),
      status: hasElement("[data-v70-gate-status]"),
      helperLoaded: helperLoaded,
      gate: gate,
      role: readLocalStorage(ROLE_KEY)
    };

    result.ok = Boolean(
      result.root &&
      result.passphraseInput &&
      result.unlockButton &&
      result.status &&
      result.helperLoaded &&
      result.gate === UNLOCKED &&
      result.role === ROLE
    );

    return result;
  }

  window.mmdBoardV70SmokeTest = runSmokeTest;
})();
