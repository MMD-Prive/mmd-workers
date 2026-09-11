(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.modelLineLinkEntryV1 === "1") return;
  root.dataset.modelLineLinkEntryV1 = "1";

  var TARGET = "/internal/admin/kenji?view=model-link";
  var QUEUE_API = "/v1/admin/models/activation-candidates?mode=line-link-claims";

  var style = document.createElement("style");
  style.textContent = [
    ".kso-nav button[data-model-line-link-entry]{border-color:rgba(229,189,112,.46);color:#f0cf84;background:rgba(229,189,112,.08)}",
    ".kml-entry{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 14px;padding:14px 16px;border:1px solid rgba(229,189,112,.28);border-radius:15px;background:linear-gradient(135deg,rgba(229,189,112,.09),rgba(255,255,255,.015));color:#fff0dc;text-decoration:none}",
    ".kml-entry:hover{border-color:rgba(229,189,112,.55);background:linear-gradient(135deg,rgba(229,189,112,.14),rgba(255,255,255,.025))}",
    ".kml-entry span,.kml-entry strong,.kml-entry small{display:block}.kml-entry span{color:#d9b568;font-size:9px;font-weight:900;letter-spacing:.13em}.kml-entry strong{margin-top:4px;font-size:15px}.kml-entry small{margin-top:3px;color:#a99b8d;font-size:10px;line-height:1.45}",
    ".kml-count{flex:0 0 auto;min-width:44px;height:44px;padding:0 10px;border-radius:999px;border:1px solid rgba(229,189,112,.32);display:grid;place-items:center;color:#f2d58f;font-size:17px;font-weight:850}",
    "@media(max-width:820px){.kml-entry{margin-left:0;margin-right:0;padding:12px}.kml-entry strong{font-size:14px}}"
  ].join("");
  document.head.appendChild(style);

  mountWhenReady(0);

  function mountWhenReady(attempt) {
    var nav = root.querySelector(".kso-nav");
    var overview = root.querySelector('[data-panel="overview"]');
    if ((!nav || !overview) && attempt < 20) {
      return setTimeout(function () { mountWhenReady(attempt + 1); }, 50);
    }
    if (!nav || !overview) return;

    if (!nav.querySelector("[data-model-line-link-entry]")) {
      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-model-line-link-entry", "");
      button.innerHTML = 'MMD MODEL Link · <b data-model-line-link-nav-count>—</b>';
      button.addEventListener("click", function () { window.location.assign(TARGET); });
      var advanced = nav.querySelector("[data-kso-advanced]");
      nav.insertBefore(button, advanced || null);
    }

    if (!overview.querySelector(".kml-entry")) {
      var entry = document.createElement("a");
      entry.className = "kml-entry";
      entry.href = TARGET;
      entry.setAttribute("data-model-line-link-home-entry", "");
      entry.innerHTML = '<div><span>MMD MODEL · OWNER REVIEW</span><strong>LINE Link Queue</strong><small>ดู Model ที่ยืนยัน LINE แล้วแต่ยังรอผูก canonical Model record + Drive folder</small></div><b class="kml-count" data-model-line-link-home-count>—</b>';
      var first = overview.querySelector(".kso-home") || overview.firstElementChild;
      if (first) overview.insertBefore(entry, first);
      else overview.appendChild(entry);
    }

    refreshCount();
  }

  async function refreshCount() {
    try {
      var response = await fetch(QUEUE_API, {
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" }
      });
      if (!response.ok) return;
      var data = await response.json();
      if (data.ok !== true || !Number.isFinite(Number(data.count))) return;
      var count = String(Number(data.count));
      root.querySelectorAll("[data-model-line-link-nav-count],[data-model-line-link-home-count]").forEach(function (node) {
        node.textContent = count;
      });
    } catch (_error) {
      // Navigation remains usable even when the count read is unavailable.
    }
  }
})();
