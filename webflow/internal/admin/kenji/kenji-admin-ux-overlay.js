(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.uxFriendly === "1") return;
  root.dataset.uxFriendly = "1";

  var style = document.createElement("style");
  style.textContent =
    ".kux-help{margin:10px 0 0;padding:10px 12px;border:1px solid rgba(229,189,112,.28);border-radius:12px;background:rgba(229,189,112,.06);color:#d8c9b7;font-size:12px;line-height:1.55}" +
    ".kux-help b{color:#fff0dc}.kux-next{margin:12px 0;padding:14px;border:1px solid rgba(229,189,112,.28);border-radius:14px;background:rgba(229,189,112,.06)}" +
    ".kux-next strong{display:block;margin-bottom:5px;color:#e5bd70}.kux-steps{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.kux-steps span{padding:6px 9px;border:1px solid rgba(229,189,112,.2);border-radius:999px;color:#bcae9b;font-size:11px}.kux-steps .is-on{color:#e5bd70;border-color:#e5bd70;background:rgba(229,189,112,.08)}";
  document.head.appendChild(style);

  function primaryHeader() {
    var button = root.querySelector(".ka__headActions .is-primary");
    if (!button) return;
    if (button.textContent !== "Review Queue") button.textContent = "Review Queue";
    if (button.dataset.tab !== "models") button.dataset.tab = "models";
    button.title = "ดู Model และรายการที่กำลังรอ Review";
  }

  function knowledgeHelp() {
    var panel = root.querySelector('[data-panel="knowledge"]');
    if (!panel) return;
    var title = panel.querySelector(".ka__title");
    if (title && !title.querySelector(".kux-help")) {
      var note = document.createElement("div");
      note.className = "kux-help";
      note.innerHTML = "<b>ค้นหา Knowledge เท่านั้น</b><br>ถ้ากำลังหา GWs / EMs / ชื่อ Model ให้ไปแท็บ Models";
      title.appendChild(note);
    }
    var search = panel.querySelector("#kaSearch");
    if (search && search.placeholder !== "ค้นหา Knowledge (ชื่อ / Knowledge ID)") {
      search.placeholder = "ค้นหา Knowledge (ชื่อ / Knowledge ID)";
    }
    var list = panel.querySelector("#kaList");
    if (!list) return;
    var empty = list.querySelector(".ka__empty");
    if (empty && empty.textContent.trim() === "ไม่พบข้อมูล") {
      empty.innerHTML = 'ไม่พบ Knowledge ที่ตรงกัน<br><button type="button" data-tab="models" style="margin-top:10px">ไปค้นหา Model</button>';
    }
  }

  function modelsHelp() {
    var panel = root.querySelector('[data-panel="models"]');
    if (!panel) return;
    var title = panel.querySelector(".ka__title");
    if (title) {
      var copy = "ค้นหา Model → เลือกข้อมูล → ตรวจ Preview → ส่งเข้า Review. การส่ง Review ยังไม่เปลี่ยน Production";
      var p = title.querySelector("p");
      if (p && p.textContent !== copy) p.textContent = copy;
      if (!title.querySelector(".kux-help")) {
        var note = document.createElement("div");
        note.className = "kux-help";
        note.innerHTML = "<b>ถ้าส่งแล้วเห็น Pending Review = สำเร็จ</b><br>จากนั้นรอขั้น Review / QA / Publish; ยังไม่ต้องกด Publish จากหน้า Knowledge";
        title.appendChild(note);
      }
    }

    var editor = panel.querySelector("#kaModelEditor");
    if (!editor) return;
    var recordHead = editor.querySelector(".ka__recordHead");
    if (recordHead && !editor.querySelector(".kux-next")) {
      var next = document.createElement("div");
      next.className = "kux-next";
      next.innerHTML = '<strong>ขั้นตอนของ Model</strong><div>Draft → Review → QA → Publish</div><div class="kux-steps"><span class="is-on">1 Draft</span><span>2 Review</span><span>3 QA</span><span>4 Publish</span></div>';
      recordHead.insertAdjacentElement("afterend", next);
    }

    var save = editor.querySelector('[data-model-action="save-draft"]');
    var preview = editor.querySelector("#kaModelPreview");
    var pending = preview && /Pending Review/i.test(preview.textContent || "");

    if (pending) {
      var nextBox = editor.querySelector(".kux-next");
      var pendingMarkup = '<strong>ส่งเข้า Review สำเร็จ ✓</strong><div>ตอนนี้รอ Review · Production ยังไม่ถูกเปลี่ยน</div><div class="kux-steps"><span class="is-on">1 Draft</span><span class="is-on">2 Review</span><span>3 QA</span><span>4 Publish</span></div>';
      if (nextBox && nextBox.innerHTML !== pendingMarkup) nextBox.innerHTML = pendingMarkup;
      if (save) {
        if (save.textContent !== "ส่งเข้า Review แล้ว ✓") save.textContent = "ส่งเข้า Review แล้ว ✓";
        if (!save.disabled) save.disabled = true;
        save.title = "Draft นี้อยู่ใน Review Queue แล้ว";
      }
    } else if (save && !save.disabled) {
      if (save.textContent !== "ส่งเข้า Review") save.textContent = "ส่งเข้า Review";
      save.title = "บันทึก Draft ไปยัง Review Queue; ยังไม่แก้ Production";
    }
  }

  function apply() {
    primaryHeader();
    knowledgeHelp();
    modelsHelp();
  }

  apply();
  new MutationObserver(apply).observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled"]
  });
})();
