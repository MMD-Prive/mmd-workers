/* KENJI_PLAIN_LANGUAGE_V1_START */
(function () {
  "use strict";

  if (!location.pathname.startsWith("/internal/admin/kenji")) return;

  function boot() {
    var root = document.getElementById("mmdKenjiAdminV1");
    if (!root || root.dataset.kenjiPlainLanguageV1 === "1") return;
    root.dataset.kenjiPlainLanguageV1 = "1";

    var exact = {
      "KENJI · SINGLE OWNER": "KENJI · สำหรับเปอร์",
      "Production": "พร้อมใช้งาน",
      "History / Advanced": "รายละเอียดระบบ",
      "Kenji AI 2.0": "ลองถาม Kenji",
      "Knowledge": "ความรู้",
      "SIGIL Board": "งานที่ต้องดู",
      "MODEL SOURCE": "เลือก MODEL",
      "Models + Keyword Profiles": "Model ที่มีอยู่",
      "MODEL KEYWORD PROFILE": "KENJI รู้จักคนนี้",
      "New Model Draft": "กำลังเพิ่ม Model ใหม่",
      "Admin media preview": "รูปอ้างอิง",
      "Working Name": "ชื่อที่ใช้",
      "Teach Kenji": "สอน Kenji",
      "Policy / ข้อห้าม": "กติกา / ข้อห้าม",
      "QA history": "ประวัติการตรวจ",
      "Version / Audit": "ประวัติการแก้ไข",
      "Access": "ใครใช้ได้"
    };

    function simplify() {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var nodes = [];
      var node;
      while ((node = walker.nextNode())) nodes.push(node);

      nodes.forEach(function (textNode) {
        var source = textNode.nodeValue;
        var text = source.trim();
        if (!text) return;

        if (exact[text]) {
          textNode.nodeValue = source.replace(text, exact[text]);
          return;
        }

        if (/เชื่อม WORKER แล้ว/i.test(text)) {
          textNode.nodeValue = source.replace(
            text,
            text
              .replace(/เชื่อม WORKER แล้ว/i, "ระบบพร้อม")
              .replace(/KNOWLEDGE/gi, "ความรู้")
              .replace(/MODELS/gi, "Model")
          );
          return;
        }

        if (/Worker ตรวจ safe copy \/ source \/ privacy \/ version/i.test(text)) {
          textNode.nodeValue = source.replace(
            text,
            text.replace(
              /Worker ตรวจ safe copy \/ source \/ privacy \/ version/i,
              "ระบบตรวจความปลอดภัยและข้อมูลที่ไม่ควรเปิดเผยให้อัตโนมัติ"
            )
          );
          return;
        }

        if (/Draft · v\d+/i.test(text)) {
          textNode.nodeValue = source.replace(text, text.replace(/Draft · v\d+/i, "ยังไม่ใช้งานจริง"));
          return;
        }

        if (/primary image.*Worker.*preview/i.test(text)) {
          textNode.nodeValue = source.replace(text, "ยังไม่มีรูปหลักที่พร้อมแสดง");
        }
      });

      root.querySelectorAll("button,a").forEach(function (element) {
        var text = element.textContent.trim();
        if (/^MMD MODEL Link/i.test(text)) {
          element.textContent = text.replace(/^MMD MODEL Link/i, "เชื่อม Model");
        }
      });

      var advanced = root.querySelector(".kso-advanced-note");
      if (advanced) {
        advanced.textContent = "รายละเอียดระบบเก็บไว้ดูประวัติ การตรวจ และการตั้งค่าที่ไม่ต้องใช้ในงานประจำ";
      }
    }

    simplify();
    var timer;
    new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(simplify, 40);
    }).observe(root, { subtree: true, childList: true, characterData: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
/* KENJI_PLAIN_LANGUAGE_V1_END */
