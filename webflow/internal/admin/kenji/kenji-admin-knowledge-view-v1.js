(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.knowledgeViewV1 === "2") return;
  root.dataset.knowledgeViewV1 = "2";

  var decorateTimer = null;
  mountKnowledgeStyle();
  bindKnowledgeRoute();
  observeKnowledgeUi();
  syncKnowledgeFromUrl(true);

  function mountKnowledgeStyle() {
    if (document.getElementById("kkvSimpleStyle")) return;
    var style = document.createElement("style");
    style.id = "kkvSimpleStyle";
    style.textContent = [
      '[data-panel="knowledge"] .ka__title{margin-bottom:18px}',
      '[data-panel="knowledge"] .ka__title h2{max-width:760px}',
      '[data-panel="knowledge"] .ka__recordHead p{color:#9c8f80}',
      '[data-panel="knowledge"] .ka__answer b{color:#d9b568}',
      '.kkv-owner-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0 2px;padding:11px 12px;border:1px solid rgba(229,189,112,.14);border-radius:12px;background:rgba(229,189,112,.04)}',
      '.kkv-owner-actions button{min-height:38px;padding:8px 12px;border:1px solid rgba(229,189,112,.24);border-radius:11px;background:linear-gradient(135deg,#f0ce82,#c99b40);color:#160f08;font:inherit;font-size:11px;font-weight:850;cursor:pointer}',
      '.kkv-owner-actions span{color:#a99a89;font-size:10px;line-height:1.5}',
      '.kkv-system{margin-top:12px;border:1px solid rgba(229,189,112,.12);border-radius:12px;background:rgba(255,255,255,.015);overflow:hidden}',
      '.kkv-system>summary{padding:10px 12px;color:#a89886;font-size:10px;cursor:pointer;list-style:none}',
      '.kkv-system>summary::-webkit-details-marker{display:none}',
      '.kkv-system>summary:after{content:"+";float:right;color:#d9b568}',
      '.kkv-system[open]>summary:after{content:"−"}',
      '.kkv-system .ka__audit{margin:0;border:0;border-top:1px solid rgba(229,189,112,.1);border-radius:0;background:transparent}',
      '@media(max-width:620px){[data-panel="knowledge"] .ka__split{grid-template-columns:1fr!important}.kkv-owner-actions{align-items:stretch;flex-direction:column}.kkv-owner-actions button{width:100%}}'
    ].join("");
    document.head.appendChild(style);
  }

  function bindKnowledgeRoute() {
    root.addEventListener("click", function (event) {
      var knowledge = event.target.closest('.kso-nav [data-tab="knowledge"]');
      if (knowledge) {
        setTimeout(function () {
          setHeader("KENJI · ความรู้", "ความรู้ของ Kenji");
          updateView("knowledge", false);
          decorateKnowledge();
        }, 0);
        return;
      }

      var teach = event.target.closest("[data-kk-teach]");
      if (teach) {
        event.preventDefault();
        var home = root.querySelector(".kso-nav [data-kso-home]");
        if (home) home.click();
        updateView("", false);
        return;
      }

      var leave = event.target.closest('.kso-nav [data-kso-home],.kso-nav [data-kso-scroll],.kso-nav [data-tab]:not([data-tab="knowledge"]),.kso-nav [data-kso-advanced],.kso-nav [data-kso-board],[data-model-line-link-entry]');
      if (leave && currentView() === "knowledge") {
        setTimeout(function () {
          setHeader("KENJI · SINGLE OWNER", "สอน Kenji");
          updateView("", false);
        }, 0);
      }
    });

    window.addEventListener("popstate", function () {
      syncKnowledgeFromUrl(true);
    });
  }

  function syncKnowledgeFromUrl(replace) {
    if (currentView() !== "knowledge") return;
    var nativeButton = root.querySelector('.ka__nav [data-tab="knowledge"]');
    var friendlyButton = root.querySelector('.kso-nav [data-tab="knowledge"]');
    var button = nativeButton || friendlyButton;
    if (button) button.click();
    setHeader("KENJI · ความรู้", "ความรู้ของ Kenji");
    updateView("knowledge", Boolean(replace));
    scheduleDecorate();
  }

  function observeKnowledgeUi() {
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function () {
      if (currentView() === "knowledge") scheduleDecorate();
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  function scheduleDecorate() {
    clearTimeout(decorateTimer);
    decorateTimer = setTimeout(decorateKnowledge, 25);
  }

  function decorateKnowledge() {
    if (currentView() !== "knowledge") return;
    relabelShell();
    setHeader("KENJI · ความรู้", "ความรู้ของ Kenji");

    var panel = root.querySelector('[data-panel="knowledge"]');
    if (!panel) return;

    var title = panel.querySelector(".ka__title");
    if (title) {
      var eyebrow = title.querySelector("span");
      var heading = title.querySelector("h2");
      var copy = title.querySelector("p");
      setNodeText(eyebrow, "ความรู้");
      setNodeText(heading, "เรื่องที่ Kenji รู้แล้ว");
      setNodeText(copy, "ค้นหาเรื่องที่เคยสอน แล้วดูคำตอบที่ Kenji ใช้อยู่ · ถ้าจะสอนเพิ่มให้เริ่มจากหน้า สอน Kenji");
    }

    var search = panel.querySelector("#kaSearch");
    if (search) search.placeholder = "ค้นหาจากชื่อหรือคำตอบ";
    var label = search && search.closest("label");
    if (label && label.firstChild && label.firstChild.nodeType === 3) label.firstChild.nodeValue = "ค้นหาความรู้ ";

    panel.querySelectorAll("#kaList button[data-id]").forEach(function (button) {
      var meta = button.querySelector("span");
      if (!meta) return;
      var raw = meta.dataset.kkRaw || meta.textContent || "";
      if (!meta.dataset.kkRaw) meta.dataset.kkRaw = raw;
      var next = friendlyStatus(raw);
      if (meta.textContent !== next) meta.textContent = next;
    });

    var editor = panel.querySelector("#kaEditor");
    if (!editor) return;
    var empty = editor.querySelector(".ka__empty");
    if (empty && !editor.querySelector(".ka__recordHead")) {
      setNodeText(empty, "เลือกเรื่องทางซ้ายเพื่อดูคำตอบที่ Kenji ใช้อยู่");
      return;
    }

    var record = editor.querySelector(".ka__recordHead");
    if (record) {
      var metaLine = record.querySelector("p");
      var selected = panel.querySelector("#kaList button.is-active span");
      var status = selected ? selected.textContent : "";
      setNodeText(metaLine, status ? "สถานะ · " + status : "ข้อมูลความรู้ที่เลือก");
    }

    var answer = editor.querySelector(".ka__answer");
    if (answer) {
      setNodeText(answer.querySelector("b"), "คำตอบที่ Kenji ใช้");
      if (!editor.querySelector(".kkv-owner-actions")) {
        answer.insertAdjacentHTML("afterend", '<div class="kkv-owner-actions"><button type="button" data-kk-teach>สอน / แก้ความรู้</button><span>การแก้ไขเริ่มจากหน้า “สอน Kenji” แล้วระบบตรวจ Review / QA / Version ให้อัตโนมัติหลังสรุปก่อนใช้จริง</span></div>');
      }
    }

    var audit = editor.querySelector(".ka__audit");
    if (audit && !audit.closest(".kkv-system")) {
      var details = document.createElement("details");
      details.className = "kkv-system";
      details.innerHTML = "<summary>รายละเอียดระบบ</summary>";
      audit.parentNode.insertBefore(details, audit);
      details.appendChild(audit);
      setNodeText(audit.querySelector("h4"), "ประวัติระบบ");
    }
  }

  function relabelShell() {
    setButtonText('.kso-nav [data-kso-home]', "สอน Kenji");
    setButtonText('.kso-nav [data-kso-scroll="preview"]', "ลองถาม Kenji");
    setButtonText('.kso-nav [data-tab="models"]', "Model");
    setButtonText('.kso-nav [data-tab="knowledge"]', "ความรู้");
    setButtonText('.kso-nav [data-kso-board]', "งานที่ต้องดู");
    setButtonText('.kso-nav [data-kso-advanced]', "รายละเอียดระบบ");

    var link = root.querySelector("[data-model-line-link-entry]");
    if (link) {
      var count = link.querySelector("[data-model-line-link-nav-count]");
      var countText = count ? count.textContent : "";
      var desired = "เชื่อม Model" + (countText ? " · " + countText : "");
      if (link.textContent.trim() !== desired) link.innerHTML = 'เชื่อม Model' + (count ? ' · <b data-model-line-link-nav-count>' + esc(countText) + '</b>' : '');
    }

    var env = root.querySelector("#kaEnv");
    setNodeText(env, "พร้อมใช้งาน");
    var sync = root.querySelector("#kaSync");
    if (sync) {
      var text = sync.textContent || "";
      var knowledge = text.match(/Knowledge\s+(\d+)/i);
      var models = text.match(/Models?\s+(\d+)/i);
      var next = "ระบบพร้อม" + (knowledge ? " · ความรู้ " + knowledge[1] : "") + (models ? " · Model " + models[1] : "");
      if (sync.textContent !== next) sync.textContent = next;
    }
  }

  function friendlyStatus(raw) {
    var value = String(raw || "").toLowerCase();
    if (value.indexOf("published") >= 0 || value.indexOf("live") >= 0) return "ใช้อยู่";
    if (value.indexOf("qa_passed") >= 0 || value.indexOf("approved") >= 0) return "พร้อมใช้";
    if (value.indexOf("qa_failed") >= 0 || value.indexOf("failed") >= 0) return "ต้องแก้";
    if (value.indexOf("review") >= 0 || value.indexOf("pending") >= 0) return "กำลังตรวจ";
    if (value.indexOf("draft") >= 0) return "ยังไม่ใช้งาน";
    if (value.indexOf("ใช้อยู่") >= 0 || value.indexOf("พร้อมใช้") >= 0 || value.indexOf("ต้องแก้") >= 0 || value.indexOf("กำลังตรวจ") >= 0 || value.indexOf("ยังไม่ใช้งาน") >= 0) return String(raw || "");
    return "ดูรายละเอียด";
  }

  function currentView() {
    return new URL(location.href).searchParams.get("view") || "";
  }

  function updateView(view, replace) {
    var url = new URL(location.href);
    if (view) url.searchParams.set("view", view);
    else url.searchParams.delete("view");
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
    setNodeText(eyebrow, eyebrowText);
    setNodeText(title, titleText);
  }

  function setButtonText(selector, textValue) {
    var node = root.querySelector(selector);
    if (node && node.textContent !== textValue) node.textContent = textValue;
  }

  function setNodeText(node, textValue) {
    if (node && node.textContent !== textValue) node.textContent = textValue;
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>\"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
    });
  }
})();
