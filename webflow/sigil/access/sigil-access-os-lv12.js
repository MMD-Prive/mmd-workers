/*
  MMD SIGIL Access - LV12 Integrated Event Layer
  Load after sigil-access-os.js.
  Supports sigil-lv12-immersion HTML and keeps TH+EN copy aligned with SIGIL access rules.
*/

(function () {
  "use strict";

  const root = document.querySelector("[data-sigil-os]");
  if (!root) return;

  function getLang() {
    return localStorage.getItem("mmd_sigil_lang") || "th";
  }

  const copy = {
    th: {
      inside: "ภายใน SIGIL / INSIDE SIGIL",
      routePrepared: "เตรียมเส้นทางแล้ว / ROUTE PREPARED",
      accessLayerMap: "แผนที่ชั้นสิทธิ์ / ACCESS LAYER MAP",
      kenjiRecommendation: "ข้อเสนอจาก Kenji / KENJI RECOMMENDATION",
      layers: {
        identity: ["ตรวจตัวตน", "ปลดล็อก / UNLOCKED"],
        member: ["ชั้นสมาชิก", "ปลดล็อก / UNLOCKED"],
        private: ["Private Access", "ใช้งานได้ / ACTIVE"],
        review: ["Access Claim", "รอตรวจสอบ / REVIEW"],
        inner: ["Private Model Layer", "เห็นบางส่วน / PARTIAL"]
      },
      signals: {
        read: ["CURRENT READ", "ตรวจเสร็จสิ้น / COMPLETED"],
        visibility: ["VISIBILITY", "ควบคุมการมองเห็น / CONTROLLED"],
        session: ["PRIVATE MODEL", "แสดงตามสิทธิ์ / ACCESS-BASED"],
        payment: ["PAYMENT TRUST", "ยืนยันแล้ว / VERIFIED"],
        route: ["NEXT ROUTE", "เตรียมไว้แล้ว / PREPARED"]
      },
      protocolLabel: "PROTOCOL ที่แนะนำ / RECOMMENDED PROTOCOL",
      protocol: "ตรวจสิทธิ์ก่อนเปิด private model layer ถัดไป",
      chain: ["ตัวตน", "สมาชิก", "Private", "Review"],
      eventDefault: "STATE: CONTROLLED VISIBILITY",
      events: {
        analysis: "EVENT: วิเคราะห์สิทธิ์เสร็จสิ้น / ACCESS ANALYSIS COMPLETE",
        session: "EVENT: เตรียม Private Session แล้ว / PRIVATE SESSION PREPARED",
        payment: "EVENT: ส่งคิวตรวจ Payment แล้ว / PAYMENT READINESS QUEUED",
        route: "EVENT: ลงทะเบียน Controlled Route แล้ว / ROUTE REGISTERED"
      }
    },
    en: {
      inside: "INSIDE SIGIL",
      routePrepared: "ROUTE PREPARED",
      accessLayerMap: "ACCESS LAYER MAP",
      kenjiRecommendation: "KENJI RECOMMENDATION",
      layers: {
        identity: ["Identity", "Unlocked"],
        member: ["Member", "Unlocked"],
        private: ["Private Access", "Active"],
        review: ["Access Claim", "Review"],
        inner: ["Private Model Layer", "Partial"]
      },
      signals: {
        read: ["CURRENT READ", "COMPLETED"],
        visibility: ["VISIBILITY", "CONTROLLED"],
        session: ["PRIVATE MODEL", "ACCESS-BASED"],
        payment: ["PAYMENT TRUST", "VERIFIED"],
        route: ["NEXT ROUTE", "PREPARED"]
      },
      protocolLabel: "RECOMMENDED PROTOCOL",
      protocol: "Verify access before opening the next private model layer.",
      chain: ["IDENTITY", "MEMBER", "PRIVATE", "REVIEW"],
      eventDefault: "STATE: CONTROLLED VISIBILITY",
      events: {
        analysis: "EVENT: ACCESS ANALYSIS COMPLETE",
        session: "EVENT: PRIVATE SESSION PREPARED",
        payment: "EVENT: PAYMENT READINESS QUEUED",
        route: "EVENT: CONTROLLED ROUTE REGISTERED"
      }
    }
  };

  function setChip(text) {
    const chip = root.querySelector("[data-lv12='event-chip']");
    if (!chip) return;
    const span = chip.querySelector("span");
    if (span) span.textContent = text;
  }

  function hydrateLv12() {
    const lang = getLang();
    const dict = copy[lang] || copy.en;

    const mapTitle = root.querySelector("[data-lv12='map-title']");
    const recTitle = root.querySelector("[data-lv12='rec-title']");
    const inside = root.querySelector("[data-lv12='inside']");
    const route = root.querySelector("[data-lv12='route-prepared']");
    const protocolLabel = root.querySelector("[data-lv12='protocol-label']");
    const protocol = root.querySelector("[data-lv12='protocol']");

    if (mapTitle) mapTitle.textContent = dict.accessLayerMap;
    if (recTitle) recTitle.textContent = dict.kenjiRecommendation;
    if (inside) inside.textContent = dict.inside;
    if (route) route.textContent = dict.routePrepared;
    if (protocolLabel) protocolLabel.textContent = dict.protocolLabel;
    if (protocol) protocol.textContent = dict.protocol;

    Object.keys(dict.layers).forEach((key) => {
      const layer = root.querySelector(`[data-layer="${key}"]`);
      if (!layer) return;
      const h4 = layer.querySelector("h4");
      const p = layer.querySelector("p");
      if (h4) h4.textContent = dict.layers[key][0];
      if (p) p.textContent = dict.layers[key][1];
    });

    Object.keys(dict.signals).forEach((key) => {
      const row = root.querySelector(`[data-signal="${key}"]`);
      if (!row) return;
      const label = row.querySelector("span");
      const value = row.querySelector("strong");
      if (label) label.textContent = dict.signals[key][0];
      if (value) value.textContent = dict.signals[key][1];
    });

    const chainItems = root.querySelectorAll("[data-lv12-chain]");
    chainItems.forEach((node, index) => {
      if (dict.chain[index]) node.textContent = dict.chain[index];
    });

    const event = root.dataset.lv12Event;
    if (event && dict.events[event]) {
      setChip(dict.events[event]);
    } else {
      setChip(dict.eventDefault);
    }
  }

  function setEvent(type) {
    const lang = getLang();
    const dict = copy[lang] || copy.en;
    root.dataset.lv12Event = type;
    setChip(dict.events[type] || dict.eventDefault);
  }

  document.querySelectorAll("[data-event]").forEach((button) => {
    button.addEventListener("click", function () {
      setEvent(button.getAttribute("data-event"));
      window.setTimeout(hydrateLv12, 40);
    });
  });

  const langButton = root.querySelector("[data-sigil-lang]");
  if (langButton) {
    langButton.addEventListener("click", function () {
      window.setTimeout(hydrateLv12, 70);
    });
  }

  hydrateLv12();
})();
