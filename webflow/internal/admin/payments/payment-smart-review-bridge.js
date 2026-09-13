(() => {
  "use strict";
  if (window.__mmdPaymentSmartReviewV1) return;
  window.__mmdPaymentSmartReviewV1 = true;

  const originalFetch = window.fetch;
  const stageLabels = Object.freeze({
    deposit: "ค่าจอง / มัดจำ",
    final: "ค่าจบงาน / ยอดคงเหลือ",
    full: "จ่ายเต็ม",
    tips: "Tip / ทิป",
    membership: "ค่าสมาชิก / ต่ออายุสมาชิก",
  });
  const unresolved = /^(?:—|ยัง|กำลัง|รอ|ไม่ทราบ|undefined)/i;
  const text = (value) => String(value == null ? "" : value).trim();

  function normalizeQueueItem(item) {
    if (!item || typeof item !== "object") return item;
    const stage = text(item.payment_stage).toLowerCase();
    if (stageLabels[stage] && (stage !== "membership" || /undefined|^\s*$/.test(text(item.inferred_label)))) {
      item.inferred_label = stageLabels[stage];
    } else if (stageLabels[stage] && ["deposit", "final", "full", "tips"].includes(stage)) {
      item.inferred_label = stageLabels[stage];
    }
    if (!text(item.customer_name) && text(item.payer_name)) item.customer_name = item.payer_name;
    return item;
  }

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (!url.includes("/v1/admin/payments/review-queue")) return response;
      const data = await response.clone().json();
      if (!data || !Array.isArray(data.items)) return response;
      data.items = data.items.map(normalizeQueueItem);
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (_) {
      return response;
    }
  };

  function visible(selector) {
    return text(document.querySelector(selector)?.textContent);
  }

  function systemReason() {
    const parts = [];
    const stage = visible("[data-detail-stage]");
    const customer = visible("[data-detail-member]") || visible("[data-detail-title]");
    const amount = visible("[data-detail-amount]");
    const ref = visible("[data-detail-ref]");
    const job = visible("[data-detail-session]");
    if (stage && !unresolved.test(stage)) parts.push(stage);
    if (customer && !unresolved.test(customer)) parts.push(`ลูกค้า ${customer}`);
    if (amount && !unresolved.test(amount)) parts.push(amount);
    if (ref && !unresolved.test(ref)) parts.push(`Ref ${ref}`);
    if (job && !unresolved.test(job)) parts.push(`งาน ${job}`);
    return parts.length ? `ระบบตรวจแล้ว · ${parts.join(" · ")}` : "ระบบตรวจหลักฐานแล้ว แต่ข้อมูลยังไม่ครบ จึงต้องตรวจต่อ";
  }

  function decorateDrawer() {
    const drawer = document.querySelector("[data-drawer]");
    if (!drawer?.classList.contains("is-open")) return;
    const reason = drawer.querySelector("[data-reason]");
    const label = reason?.closest(".mc3-reason")?.querySelector("label");
    const note = drawer.querySelector("[data-review-note]");
    if (label) label.textContent = "สรุปจากระบบ / หมายเหตุเพิ่มเติม";
    if (reason) {
      reason.placeholder = "ระบบเติมสรุปให้อัตโนมัติ — แก้หรือเพิ่มเฉพาะกรณีจำเป็น";
      if (!reason.value.trim()) reason.value = systemReason();
    }
    if (note) note.textContent = "ระบบอ่านภาพ จับคู่ลูกค้า และจัดประเภทเงินให้อัตโนมัติ เปอร์ตรวจความถูกต้องแล้วกดยืนยันได้เมื่อ Approve เปิดใช้งาน; ไม่ต้องพิมพ์เหตุผลใหม่ทุกครั้ง";

    const flags = drawer.querySelector("[data-flags]");
    if (flags && !flags.querySelector("[data-image-gate-chip]")) {
      const chip = document.createElement("span");
      chip.className = "mc3-flag is-good";
      chip.dataset.imageGateChip = "v1";
      chip.textContent = "IMAGE GATE · PAYMENT EVIDENCE";
      flags.prepend(chip);
    }
    const approve = drawer.querySelector('[data-decision="approve"]');
    const issue = drawer.querySelector('[data-decision="issue"]');
    if (approve) approve.textContent = "ยืนยันรับเงิน";
    if (issue) issue.textContent = "บันทึกว่าต้องตรวจต่อ";
  }

  function install() {
    const drawer = document.querySelector("[data-drawer]");
    if (drawer) new MutationObserver(decorateDrawer).observe(drawer, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-open]")) setTimeout(decorateDrawer, 0);
    }, true);
    const refresh = document.querySelector("[data-refresh]");
    if (refresh && !window.__mmdPaymentSmartReviewRefreshed) {
      window.__mmdPaymentSmartReviewRefreshed = true;
      setTimeout(() => refresh.click(), 250);
    }
    const root = document.getElementById("money-control-v3");
    if (root) root.dataset.build = "money-control-v5-smart-review-20260913";
    const brand = root?.querySelector(".mc3-brand small");
    if (brand) brand.textContent = "MONEY CONTROL · V5 SMART REVIEW";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
