(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.ai20ViewV1 === "1") return;
  root.dataset.ai20ViewV1 = "1";

  var MEMBER_PREVIEW = "/member/kenji-ai-20?mode=admin-preview";

  var style = document.createElement("style");
  style.textContent = [
    ".kai20-panel{padding:0 22px 28px}",
    ".kai20-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin:18px 0 14px}",
    ".kai20-head h2{margin:3px 0 6px;color:#fff0dc;font-size:28px;line-height:1.15}",
    ".kai20-head p{margin:0;max-width:760px;color:#ad9f90;font-size:12px;line-height:1.6}",
    ".kai20-kicker{display:block;color:#d9b568;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}",
    ".kai20-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
    ".kai20-button{min-height:38px;padding:8px 12px;border-radius:11px;border:1px solid rgba(229,189,112,.22);background:rgba(255,255,255,.025);color:#e7d9c6;font:inherit;font-size:11px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}",
    ".kai20-button.is-primary{background:linear-gradient(135deg,#f0ce82,#c99b40);color:#160f08;border-color:transparent;font-weight:850}",
    ".kai20-note{margin:0 0 12px;padding:11px 12px;border:1px solid rgba(117,166,120,.2);border-radius:12px;background:rgba(117,166,120,.06);color:#bccab7;font-size:11px;line-height:1.55}",
    ".kai20-note b{color:#d7e5d2}",
    ".kai20-frame-wrap{overflow:hidden;border:1px solid rgba(229,189,112,.18);border-radius:18px;background:#080605;box-shadow:0 20px 52px rgba(0,0,0,.24)}",
    ".kai20-frame-bar{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(229,189,112,.12);background:rgba(17,13,10,.96)}",
    ".kai20-frame-bar span{color:#d9cbb9;font-size:11px}.kai20-frame-bar small{color:#83776b;font-size:9px}",
    ".kai20-frame{display:block;width:100%;height:min(76vh,860px);min-height:620px;border:0;background:#fff}",
    ".kso-nav [data-kso-ai20].is-on{border-color:#d9b568;background:rgba(229,189,112,.13);color:#f3d99e}",
    "@media(max-width:820px){.kai20-panel{padding:0 12px 22px}.kai20-head{flex-direction:column}.kai20-actions{width:100%}.kai20-button{flex:1 1 auto}.kai20-frame{height:76vh;min-height:560px}.kai20-head h2{font-size:24px}}"
  ].join("");
  document.head.appendChild(style);

  repurposePreviewNav();
  mountAi20Panel();
  bindAi20();
  syncFromUrl(true);

  function repurposePreviewNav() {
    var nav = root.querySelector(".kso-nav");
    if (!nav) return;
    var button = nav.querySelector('[data-kso-scroll="preview"]');
    if (!button) button = nav.querySelector("[data-kso-ai20]");
    if (!button) return;
    button.removeAttribute("data-kso-scroll");
    button.setAttribute("data-kso-ai20", "");
    button.textContent = "Kenji AI 2.0";
  }

  function mountAi20Panel() {
    var main = root.querySelector("main");
    if (!main || root.querySelector("[data-kso-ai20-panel]")) return;
    var panel = document.createElement("section");
    panel.className = "kai20-panel";
    panel.hidden = true;
    panel.setAttribute("data-kso-ai20-panel", "");
    panel.innerHTML =
      '<div class="kai20-head"><div><span class="kai20-kicker">KENJI · AI 2.0</span><h2>ดู Kenji แบบที่ลูกค้าเจอจริง</h2><p>Preview member-facing Kenji AI 2.0 อยู่ใน Kenji Admin เดียวกัน เพื่อให้สอน Knowledge แล้วกลับมาดูผลใน customer surface ได้โดยไม่ต้องออกไปอีกห้อง</p></div>'
      + '<div class="kai20-actions"><button type="button" class="kai20-button is-primary" data-kai20-reload>Reload Preview</button><a class="kai20-button" href="'+MEMBER_PREVIEW+'" target="_blank" rel="noopener">Open Full Preview</a></div></div>'
      + '<div class="kai20-note"><b>Preview only</b> · หน้านี้ไม่ย้าย Money Truth, Membership/Access, Model eligibility หรือ publish authority เข้า browser. Kenji AI 2.0 ยังอ่าน published Knowledge จาก runtime เดิม และยังเป็นผู้ช่วยที่ guide / explain / classify / route เท่านั้น</div>'
      + '<div class="kai20-frame-wrap"><div class="kai20-frame-bar"><span>Member-facing runtime</span><small>/member/kenji-ai-20 · mode=admin-preview</small></div><iframe class="kai20-frame" data-kai20-frame title="Kenji AI 2.0 admin preview" src="'+MEMBER_PREVIEW+'" loading="eager" referrerpolicy="same-origin" allow="clipboard-write"></iframe></div>';
    main.appendChild(panel);
  }

  function bindAi20() {
    root.addEventListener("click", function (event) {
      var ai20 = event.target.closest("[data-kso-ai20]");
      if (ai20) {
        event.preventDefault();
        showAi20(false);
        return;
      }
      var reload = event.target.closest("[data-kai20-reload]");
      if (reload) {
        event.preventDefault();
        reloadPreview();
      }
    });

    root.addEventListener("click", function (event) {
      if (!isAi20Open()) return;
      if (event.target.closest("[data-kso-ai20]")) return;
      var other = event.target.closest(".kso-nav [data-kso-home],.kso-nav [data-kso-board],.kso-nav [data-tab],.kso-nav [data-kso-advanced]");
      if (!other) return;
      hideAi20();
      setTimeout(function () {
        if (currentView() === "ai20") updateView("", false);
      }, 0);
    }, true);

    window.addEventListener("popstate", function () { syncFromUrl(true); });
  }

  function syncFromUrl(replace) {
    if (currentView() === "ai20") showAi20(Boolean(replace));
    else if (isAi20Open()) hideAi20();
  }

  function showAi20(replace) {
    var panel = root.querySelector("[data-kso-ai20-panel]");
    if (!panel) return;
    root.querySelectorAll("main > section[data-panel]").forEach(function (node) { node.hidden = true; });
    var boardPanel = root.querySelector("[data-kso-board-panel]");
    if (boardPanel) boardPanel.hidden = true;
    var boardButton = root.querySelector("[data-kso-board]");
    if (boardButton) boardButton.classList.remove("is-on", "is-primary");
    panel.hidden = false;
    root.querySelectorAll(".kso-nav button").forEach(function (node) { node.classList.toggle("is-primary", node.hasAttribute("data-kso-ai20")); });
    var button = root.querySelector("[data-kso-ai20]");
    if (button) button.classList.add("is-on");
    setHeader("KENJI · AI 2.0", "Kenji AI 2.0");
    updateView("ai20", replace);
  }

  function hideAi20() {
    var panel = root.querySelector("[data-kso-ai20-panel]");
    if (panel) panel.hidden = true;
    var button = root.querySelector("[data-kso-ai20]");
    if (button) button.classList.remove("is-on", "is-primary");
  }

  function reloadPreview() {
    var frame = root.querySelector("[data-kai20-frame]");
    if (!frame) return;
    var url = new URL(MEMBER_PREVIEW, location.origin);
    url.searchParams.set("refresh", String(Date.now()));
    frame.src = url.pathname + url.search;
  }

  function isAi20Open() {
    var panel = root.querySelector("[data-kso-ai20-panel]");
    return Boolean(panel && !panel.hidden);
  }

  function currentView() {
    return new URL(location.href).searchParams.get("view") || "";
  }

  function updateView(view, replace) {
    var url = new URL(location.href);
    if (view) url.searchParams.set("view", view); else url.searchParams.delete("view");
    var method = replace ? "replaceState" : "pushState";
    var next = url.pathname + url.search + url.hash;
    var current = location.pathname + location.search + location.hash;
    if (next === current) return;
    if (history && history[method]) history[method]({}, "", next);
  }

  function setHeader(eyebrowText, titleText) {
    var header = root.querySelector(".ka__header");
    if (!header) return;
    var eyebrow = header.querySelector("div > span");
    var title = header.querySelector("h1");
    if (eyebrow) eyebrow.textContent = eyebrowText;
    if (title) title.textContent = titleText;
  }
})();
