(function () {
  "use strict";

  if (window.mmdBoardV70GateHandlerInstalled) return;
  window.mmdBoardV70GateHandlerInstalled = true;

  var GATE_KEY = "mmd_board_v70_gate";
  var ROLE_KEY = "mmd_board_v70_role";
  var UNLOCKED = "unlocked";
  var ROLE = "boss_per";
  var MOCK_PASSPHRASE = "sigil";

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

  var PASSPHRASE_SELECTOR = [
    "[data-v70-gate-passphrase]",
    "[data-v7-gate-passphrase]",
    "[name='mmd_board_v70_passphrase']",
    "#mmdBoardV70Passphrase",
    "[data-gate-passphrase]"
  ].join(",");

  var STATUS_SELECTOR = [
    "[data-v70-gate-status]",
    "[data-v7-gate-status]",
    "#mmdBoardV70GateStatus",
    "[data-gate-status]"
  ].join(",");

  function clean(value) {
    return String(value || "").trim();
  }

  function findRoot(node) {
    if (node && node.closest) {
      var closest = node.closest(ROOT_SELECTOR);
      if (closest) return closest;
    }
    return document.querySelector(ROOT_SELECTOR);
  }

  function readPassphrase(root, explicitPassphrase) {
    var explicit = clean(explicitPassphrase);
    if (explicit) return explicit;

    var input = root && root.querySelector ? root.querySelector(PASSPHRASE_SELECTOR) : null;
    if (!input) input = document.querySelector(PASSPHRASE_SELECTOR);
    if (input) return clean(input.value || input.textContent);

    return clean(window.prompt ? window.prompt("Gate passphrase") : "");
  }

  function setStatus(root, message, tone) {
    var target = root && root.querySelector ? root.querySelector(STATUS_SELECTOR) : null;
    if (!target) target = document.querySelector(STATUS_SELECTOR);
    if (!target) return;

    target.textContent = message;
    target.setAttribute("data-gate-tone", tone || "neutral");
  }

  function applyUnlockedState(root) {
    localStorage.setItem(GATE_KEY, UNLOCKED);
    localStorage.setItem(ROLE_KEY, ROLE);

    if (root) {
      root.setAttribute("data-gate", UNLOCKED);
      root.setAttribute("data-role", ROLE);
      root.classList.add("is-gate-unlocked");
    }

    setStatus(root, "Gate unlocked for boss_per.", "ok");
    document.dispatchEvent(new CustomEvent("mmd:board-v70-gate-unlocked", {
      detail: {
        gate: UNLOCKED,
        role: ROLE
      }
    }));

    return {
      ok: true,
      gate: UNLOCKED,
      role: ROLE
    };
  }

  function unlockGate(options) {
    var detail = typeof options === "string" ? { passphrase: options } : options || {};
    var root = detail.root || findRoot(detail.target);
    var passphrase = readPassphrase(root, detail.passphrase);

    if (passphrase !== MOCK_PASSPHRASE) {
      setStatus(root, "Gate locked. Check passphrase.", "error");
      return {
        ok: false,
        error: "invalid_passphrase"
      };
    }

    return applyUnlockedState(root);
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
      passphrase: gate.getAttribute("data-passphrase")
    });
  });

  window.mmdBoardV70UnlockGate = unlockGate;
})();
