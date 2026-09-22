/*
  MMD SIGIL Access - Kenji Human Voice Override
  Load after sigil-access-os.js and sigil-access-os-lv12.js.
  Purpose: keep Kenji as an intelligence layer, but make his note feel human, calm, and concierge-like.
*/

(function () {
  "use strict";

  const root = document.querySelector("[data-sigil-os]");
  if (!root) return;

  const copy = {
    th: {
      default: "ผมตรวจให้แล้วครับ<br>ตอนนี้สิทธิ์พร้อมใช้งาน และผมเตรียมทางที่เหมาะไว้ให้แล้ว",
      analysis: "ผมอ่านสถานะให้ครบแล้วครับ<br>สิทธิ์ Premium ใช้งานได้ ส่วน Black Card จะถูกส่งเข้า private review อย่างเงียบ ๆ",
      session: "ผมเตรียมชั้น private session ให้แล้วครับ<br>ถ้าพร้อม เราไปต่อแบบเป็นลำดับได้เลย",
      payment: "สถานะการชำระเงินดูเรียบร้อยครับ<br>ก่อนล็อก session ระบบจะตรวจซ้ำให้อีกครั้งเพื่อความปลอดภัย",
      route: "ผมเปิดเส้นทางถัดไปให้เห็นบางส่วนแล้วครับ<br>ส่วนที่ยังล็อกอยู่จะเปิดเมื่อผ่านการตรวจสอบเท่านั้น"
    },
    en: {
      default: "I’ve checked this for you.<br>Your access is ready, and I’ve prepared the cleanest next route.",
      analysis: "I’ve read the current access state.<br>Premium access is active. Black Card will move through private review quietly.",
      session: "I’ve prepared the private session layer.<br>When you’re ready, we can continue in the right order.",
      payment: "Payment activity looks clear.<br>The system will verify it once more before locking any session.",
      route: "I’ve made the next route partially visible.<br>The locked parts will only open after validation."
    }
  };

  function getLang() {
    return localStorage.getItem("mmd_sigil_lang") || "th";
  }

  function setKenji(type) {
    const note = root.querySelector("[data-kenji-note]");
    if (!note) return;

    const lang = getLang();
    const dict = copy[lang] || copy.en;
    const html = dict[type] || dict.default;

    note.animate(
      [
        { opacity: 0.35, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 260, easing: "ease-out" }
    );

    note.innerHTML = html;
  }

  function bind() {
    root.querySelectorAll("[data-event]").forEach((button) => {
      button.addEventListener("click", function () {
        const type = button.getAttribute("data-event") || "default";
        window.setTimeout(function () {
          setKenji(type);
        }, 20);
      });
    });

    const langButton = root.querySelector("[data-sigil-lang]");
    if (langButton) {
      langButton.addEventListener("click", function () {
        const currentEvent = root.dataset.lv12Event || "default";
        window.setTimeout(function () {
          setKenji(currentEvent);
        }, 90);
      });
    }
  }

  window.setTimeout(function () {
    setKenji("default");
    bind();
  }, 80);
})();
