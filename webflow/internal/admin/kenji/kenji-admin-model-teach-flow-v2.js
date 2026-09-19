/* KENJI_MODEL_TEACH_FLOW_V2_START */
(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.kenjiModelTeachFlowV2 === "1") return;
  root.dataset.kenjiModelTeachFlowV2 = "1";

  var style = document.createElement("style");
  style.textContent = [
    '[data-panel="models"] .kmt-flow{margin:0 0 14px;padding:14px;border:1px solid rgba(229,189,112,.24);border-radius:16px;background:linear-gradient(145deg,rgba(229,189,112,.07),rgba(255,255,255,.015));color:#d8c9b7;font-size:12px;line-height:1.6}',
    '[data-panel="models"] .kmt-flow strong{display:block;color:#fff0dc;font-size:14px;margin-bottom:8px}',
    '[data-panel="models"] .kmt-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}',
    '[data-panel="models"] .kmt-step{padding:9px 10px;border:1px solid rgba(229,189,112,.16);border-radius:12px;background:rgba(0,0,0,.16);color:#9f9283;font-size:10px;line-height:1.4}',
    '[data-panel="models"] .kmt-step b{display:block;margin-bottom:3px;color:#e5bd70;font-size:10px}',
    '[data-panel="models"] .kmt-help{display:block;margin:4px 0 7px;color:#8f8377;font-size:10px;font-weight:500;line-height:1.45}',
    '[data-panel="models"] .kmt-advanced-toggle{margin:11px 0 3px;padding:7px 0;border:0;background:transparent;color:#c4a768;font:inherit;font-size:11px;cursor:pointer}',
    '[data-panel="models"] .kmt-simple .kmt-advanced-item{display:none!important}',
    '[data-panel="models"] .kmt-simple #kaModelSafeInfo,[data-panel="models"] .kmt-simple #kaModelPositiveSensitive,[data-panel="models"] .kmt-simple #kaModelSafeRemark{min-height:118px}',
    '[data-panel="models"] .kmt-teach-note{margin:8px 0 0;color:#9c8f80;font-size:10px;line-height:1.5}',
    '@media(max-width:820px){[data-panel="models"] .kmt-steps{grid-template-columns:1fr 1fr}[data-panel="models"] .kmt-flow{padding:12px;border-radius:14px}}',
    '@media(max-width:480px){[data-panel="models"] .kmt-steps{grid-template-columns:1fr}}'
  ].join("");
  document.head.appendChild(style);

  var scheduled = false;
  var busy = false;

  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      patch();
    });
  }

  function setDirectLabel(inputId, text, help) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var label = input.closest("label");
    if (!label) return;
    var nodes = Array.prototype.slice.call(label.childNodes || []);
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].nodeType === 3 && String(nodes[i].textContent || "").trim()) {
        if (String(nodes[i].textContent || "").trim() !== text) nodes[i].textContent = text;
        break;
      }
    }
    if (help && !label.querySelector('.kmt-help[data-for="' + inputId + '"]')) {
      var note = document.createElement("small");
      note.className = "kmt-help";
      note.dataset.for = inputId;
      note.textContent = help;
      input.insertAdjacentElement("beforebegin", note);
    }
  }

  function markAdvanced(id) {
    var input = document.getElementById(id);
    var label = input && input.closest("label");
    if (label) label.classList.add("kmt-advanced-item");
  }

  function patchTitle(panel) {
    var title = panel.querySelector(".ka__title");
    if (!title) return;
    var eyebrow = title.querySelector("span");
    var heading = title.querySelector("h2");
    var copy = title.querySelector("p");
    if (eyebrow) eyebrow.textContent = "TEACH MODEL";
    if (heading) heading.textContent = "สอน Kenji ให้รู้จัก Model";
    if (copy) copy.textContent = "1 เลือก Model → 2 เล่าให้ Kenji รู้จัก → 3 ลองคำตอบ → 4 สรุปแล้วใช้จริง";
  }

  function patchSourcePanel(panel) {
    var split = panel.querySelector(".ka__split");
    if (!split) return;
    var source = split.firstElementChild;
    if (!source) return;
    var heading = source.querySelector("h3,h2");
    if (heading && /Models|Keyword Profiles|Model/i.test(heading.textContent || "")) heading.textContent = "เลือก Model ที่จะสอน Kenji";
    var search = source.querySelector('input[type="search"],input[placeholder*="model" i],input[placeholder*="ชื่อ" i]');
    if (search) search.placeholder = "ค้นหาชื่อ / Model Key / alias";
    var newButton = source.querySelector('[data-model-new],button[data-action="new-model"],button');
    if (newButton && /^\s*\+?\s*New\s*$/i.test(newButton.textContent || "")) newButton.style.display = "none";
  }

  function patchEditor(panel) {
    var editor = panel.querySelector("#kaModelEditor");
    if (!editor) return;
    editor.classList.add("kmt-simple");

    var head = editor.querySelector(".ka__recordHead");
    var working = document.getElementById("kaModelName");
    var name = working && String(working.value || "").trim();
    if (head) {
      var heading = head.querySelector("h2,h3");
      var sub = head.querySelector("p");
      if (heading) heading.textContent = name ? "กำลังสอน Kenji: " + name : "เลือก Model ทางซ้ายก่อน";
      if (sub) sub.textContent = "แก้เฉพาะสิ่งที่ Kenji ควรรู้และควรพูด · ระบบ/สิทธิ์อยู่ในข้อมูลขั้นสูง";
      if (!editor.querySelector(".kmt-flow")) {
        var flow = document.createElement("div");
        flow.className = "kmt-flow";
        flow.innerHTML = '<strong>สอนแบบภาษาคน</strong><div class="kmt-steps"><div class="kmt-step"><b>1 · เลือก</b>เลือก canonical Model จากรายการ</div><div class="kmt-step"><b>2 · สอน</b>เล่าคาแรกเตอร์ จุดเด่น และบริบท</div><div class="kmt-step"><b>3 · ลอง</b>ดูว่า Kenji จะแนะนำเขายังไง</div><div class="kmt-step"><b>4 · ใช้จริง</b>เช็กสรุป แล้วให้ Worker ตรวจ safety</div></div>';
        head.insertAdjacentElement("afterend", flow);
      }
    }

    setDirectLabel("kaModelName", "ชื่อที่ Kenji ใช้เรียก", "ชื่อที่ต้องการให้ Kenji ใช้เวลาพูดถึง Model คนนี้");
    setDirectLabel("kaModelAliases", "ชื่อเรียก / คำค้นที่ Kenji ควรรู้", "เช่น ชื่อเล่น ชื่อในโพสต์ หรือ alias ที่ลูกค้าอาจพิมพ์");
    setDirectLabel("kaModelSafeInfo", "เล่าให้ Kenji รู้จักคนนี้", "จุดเด่น คาแรกเตอร์ vibe ภาษา ความถนัด และเหมาะกับคำขอแบบไหน");
    setDirectLabel("kaModelPositiveSensitive", "สิ่งที่ Kenji ควรรู้ แต่ไม่ควรพูดตรง ๆ", "ใช้ช่วยเข้าใจบริบทภายใน ไม่ใช่ข้อความสำหรับลูกค้า");
    setDirectLabel("kaModelSafeRemark", "ถ้าลูกค้าถามถึงคนนี้ ให้ Kenji เสริมว่า", "ประโยคช่วยตอบที่ปลอดภัยและเป็นธรรมชาติ โดยไม่รับปากแทน Per");

    ["kaModelKey", "kaModelFolder", "kaModelTier", "kaModelVisibility", "kaModelPhotoPolicy", "kaModelDepositGate", "kaModelSourceRef"].forEach(markAdvanced);
    Array.prototype.forEach.call(editor.querySelectorAll(".ka__scopeBlock,.ka__notice"), function (node) {
      node.classList.add("kmt-advanced-item");
    });

    if (!editor.querySelector("[data-kmt-advanced]")) {
      var actions = editor.querySelector(".ka__actions");
      if (actions) {
        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "kmt-advanced-toggle";
        toggle.dataset.kmtAdvanced = "1";
        toggle.textContent = "ข้อมูลขั้นสูง / Access ▾";
        actions.insertAdjacentElement("beforebegin", toggle);
        var note = document.createElement("div");
        note.className = "kmt-teach-note";
        note.textContent = "Model Key, access, visibility, photo/deposit policy และ source ยังอยู่ครบ แต่ซ่อนไว้เพื่อให้การสอน Kenji ไม่รก";
        toggle.insertAdjacentElement("afterend", note);
      }
    }

    var previewButton = editor.querySelector('[data-model-action="preview"]');
    if (previewButton && previewButton.textContent !== "3 · ลองให้ Kenji แนะนำ") previewButton.textContent = "3 · ลองให้ Kenji แนะนำ";
    var saveButton = editor.querySelector('[data-model-action="save-draft"]');
    if (saveButton && !saveButton.disabled && saveButton.textContent !== "4 · สรุปก่อนใช้จริง") saveButton.textContent = "4 · สรุปก่อนใช้จริง";
  }

  function patch() {
    if (busy) return;
    busy = true;
    try {
      var panel = root.querySelector('[data-panel="models"]');
      if (!panel) return;
      patchTitle(panel);
      patchSourcePanel(panel);
      patchEditor(panel);
    } finally {
      busy = false;
    }
  }

  root.addEventListener("click", function (event) {
    var toggle = event.target.closest("[data-kmt-advanced]");
    if (!toggle) return;
    var editor = root.querySelector('[data-panel="models"] #kaModelEditor');
    if (!editor) return;
    var simple = editor.classList.toggle("kmt-simple");
    toggle.textContent = simple ? "ข้อมูลขั้นสูง / Access ▾" : "ซ่อนข้อมูลขั้นสูง ▴";
  });
  root.addEventListener("input", function (event) {
    if (event.target && event.target.id === "kaModelName") schedulePatch();
  });

  new MutationObserver(schedulePatch).observe(root, { childList: true, subtree: true });
  patch();
})();
/* KENJI_MODEL_TEACH_FLOW_V2_END */
