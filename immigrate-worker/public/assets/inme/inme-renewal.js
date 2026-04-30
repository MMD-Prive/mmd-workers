(() => {
  "use strict";

  const API = {
    status: "/member/api/renewal/status",
    intake: "/member/api/renewal/intake",
  };

  const byId = (id) => document.getElementById(id);
  const text = (value, fallback = "—") => {
    const output = String(value || "").trim();
    return output || fallback;
  };

  const state = {
    action: "RENEWAL",
    paymentMethod: "Bank Transfer",
    lastStatus: null,
  };

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function getValue(id) {
    const el = byId(id);
    return el && "value" in el ? String(el.value || "").trim() : "";
  }

  function getFileName(id) {
    const el = byId(id);
    if (!el || !el.files || !el.files.length) return "ไม่มี";
    return el.files[0].name || "มีไฟล์แนบ";
  }

  function getPrimaryEmail() {
    return getValue("emailNow") || getValue("emailOld");
  }

  function syncSummary() {
    setText("sumNick", text(getValue("nick")));
    setText("sumEmail", text(getPrimaryEmail()));
    const contact = [getValue("phone"), getValue("telegram")].filter(Boolean).join(" / ");
    setText("sumContact", text(contact));
    setText("sumProof", getFileName("oldProof"));
    setText("sumPay", state.paymentMethod);
  }

  function setBusy(button, isBusy, label) {
    if (!button) return;
    if (isBusy) {
      button.dataset.originalText = button.textContent || "";
      button.textContent = label;
      button.disabled = true;
      button.style.opacity = "0.7";
      return;
    }
    button.textContent = button.dataset.originalText || button.textContent || "";
    button.disabled = false;
    button.style.opacity = "";
  }

  function buildStatusPayload() {
    return {
      nickname: getValue("nick"),
      display_name: getValue("nick"),
      email_primary: getValue("emailNow"),
      email_secondary: getValue("emailOld"),
      phone: getValue("phone"),
      telegram_username: getValue("telegram"),
      search_priority: state.action === "UPGRADE" ? "upgrade" : "renewal",
      source_page: "sigil_inme_renewal",
      include_context: false,
    };
  }

  function buildIntakePayload() {
    const status = state.lastStatus && state.lastStatus.data ? state.lastStatus.data : {};
    return {
      flow: state.action.toLowerCase(),
      source_page: "sigil_inme_renewal",
      display_name: getValue("nick"),
      nickname: getValue("nick"),
      email: getPrimaryEmail(),
      email_primary: getValue("emailNow"),
      email_secondary: getValue("emailOld"),
      phone: getValue("phone"),
      telegram_username: getValue("telegram"),
      payment_method: state.paymentMethod,
      current_tier_hint: status.current_tier || "",
      target_tier: state.action === "UPGRADE" ? "premium" : status.current_tier || "premium",
      total: status.pricing_decision_thb || "",
      service_history_note: `proof:${getFileName("oldProof")}; action:${state.action}; payment:${state.paymentMethod}`,
      notify_telegram: true,
    };
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.ok === false) {
      const message = data && data.error && data.error.message ? data.error.message : "request_failed";
      throw new Error(message);
    }
    return data;
  }

  function renderStatusResult(data) {
    const result = data && data.data ? data.data : null;
    if (!result) {
      setText("sumStatus", "รับข้อมูลแล้ว แต่ยังต้องให้ Per ตรวจต่อครับ");
      return;
    }

    state.lastStatus = data;
    const foundText = result.found ? "พบข้อมูลสมาชิก" : "ยังไม่พบข้อมูลเดิม";
    const statusText = result.membership_status || "per_review";
    const price = Number(result.pricing_decision_thb || 0);
    const priceText = price > 0 ? `${price.toLocaleString("th-TH")} ฿` : "ต่อฟรี / รอตรวจยืนยัน";
    setText("sumStatus", `${foundText} · ${statusText} · ${priceText}`);
  }

  function setActiveButton(selector, activeButton) {
    document.querySelectorAll(selector).forEach((button) => button.classList.remove("active"));
    activeButton.classList.add("active");
  }

  function validateBaseForm() {
    const missing = [];
    if (!getValue("nick")) missing.push("ชื่อเล่น");
    if (!getPrimaryEmail()) missing.push("email อย่างน้อย 1 ช่อง");
    if (!getValue("phone")) missing.push("เบอร์โทร");
    if (!getValue("telegram")) missing.push("Telegram username");
    if (missing.length) {
      alert(`ขอข้อมูลเพิ่มก่อนครับ: ${missing.join(", ")}`);
      return false;
    }
    return true;
  }

  function openModal(type) {
    const modal = byId("mmdModal");
    const modalContent = byId("modalContent");
    if (!modal || !modalContent) return;
    if (type === "bank") {
      modalContent.innerHTML = [
        '<div class="mmd-kicker">PRIVATE BANK DETAILS</div>',
        '<h2>รายละเอียดการโอนสำหรับเคสนี้ครับ</h2>',
        '<div class="mmd-bank-line"><span>ธนาคาร</span><strong>ธนาคารกรุงไทย (KTB)</strong></div>',
        '<div class="mmd-bank-line"><span>ชื่อบัญชี</span><strong>ธัชชะ ป.</strong></div>',
        '<div class="mmd-bank-line"><span>เลขบัญชี</span><strong>1420335898</strong></div>',
        '<label>อัพโหลดสลิป</label>',
        '<input type="file" accept="image/*,.pdf">',
      ].join("");
    }
    if (type === "qr") {
      modalContent.innerHTML = [
        '<div class="mmd-kicker">QR CODE - PROMPTPAY</div>',
        '<h2>สแกนชำระผ่าน PromptPay</h2>',
        '<img class="mmd-qr" src="https://promptpay.io/0829528889.png" alt="PromptPay QR">',
        '<div class="mmd-bank-line"><span>ชื่อบัญชี</span><strong>ธัชชะ ป.</strong></div>',
        '<label>อัพโหลดสลิป</label>',
        '<input type="file" accept="image/*,.pdf">',
      ].join("");
    }
    modal.classList.add("show");
  }

  function closeModal() {
    const modal = byId("mmdModal");
    if (modal) modal.classList.remove("show");
  }

  function bindInputs() {
    ["nick", "emailNow", "emailOld", "phone", "telegram", "oldProof"].forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener("input", syncSummary);
      el.addEventListener("change", syncSummary);
    });
  }

  function bindActionButtons() {
    document.querySelectorAll(".mmd-choice[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveButton(".mmd-choice[data-action]", button);
        state.action = button.dataset.action || "RENEWAL";
        state.lastStatus = null;
        setText("sumStatus", state.action === "UPGRADE" ? "รับเคสเป็น Upgrade review ก่อนครับ" : "รอให้ผมตรวจสิทธิ์ก่อนครับ");
      });
    });
  }

  function bindPaymentButtons() {
    document.querySelectorAll(".mmd-pay[data-pay]").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveButton(".mmd-pay[data-pay]", button);
        state.paymentMethod = button.dataset.pay || "Bank Transfer";
        syncSummary();
      });
    });
  }

  function bindPrimaryButtons() {
    const checkBtn = byId("checkBtn");
    if (checkBtn) {
      checkBtn.addEventListener("click", async () => {
        syncSummary();
        if (!validateBaseForm()) return;
        setBusy(checkBtn, true, "กำลังเช็กสถานะ...");
        setText("sumStatus", "กำลังเช็กสถานะกับระบบ MMD ครับ");
        try {
          const data = await postJson(API.status, buildStatusPayload());
          renderStatusResult(data);
        } catch (error) {
          console.error("renewal status failed", error);
          setText("sumStatus", "เช็กอัตโนมัติไม่สำเร็จ รับเป็น Per review ก่อนครับ");
          alert("ระบบเช็กอัตโนมัติยังไม่ตอบกลับครับ ผมจะรับเคสนี้ไว้เป็น Per review ก่อน");
        } finally {
          setBusy(checkBtn, false);
        }
      });
    }

    const submitBtn = byId("submitBtn");
    if (submitBtn) {
      submitBtn.addEventListener("click", async () => {
        syncSummary();
        if (!validateBaseForm()) return;
        const consent = byId("consent");
        if (!consent || !consent.checked) {
          alert("กรุณาติ๊กยินยอมก่อนส่งตรวจสิทธิ์ครับ");
          return;
        }
        setBusy(submitBtn, true, "กำลังส่งเข้า Per review...");
        setText("sumStatus", "กำลังส่งข้อมูลเข้า Per review ครับ");
        try {
          await postJson(API.intake, buildIntakePayload());
          setText("sumStatus", "ส่งเข้า Per review แล้วครับ");
          alert("รับเรื่องแล้วครับ เดี๋ยวผมตรวจสิทธิ์ให้ต่อในระบบ MMD");
        } catch (error) {
          console.error("renewal intake failed", error);
          setText("sumStatus", "ส่งอัตโนมัติไม่สำเร็จ กรุณาทัก Per โดยตรงครับ");
          alert("ระบบส่งอัตโนมัติยังไม่สำเร็จครับ กรุณาทัก Per โดยตรงพร้อมข้อมูลที่กรอกไว้");
        } finally {
          setBusy(submitBtn, false);
        }
      });
    }
  }

  function bindModalButtons() {
    document.querySelectorAll("[data-modal]").forEach((button) => {
      button.addEventListener("click", () => openModal(button.dataset.modal));
    });
    const closeButton = byId("modalClose");
    if (closeButton) closeButton.addEventListener("click", closeModal);
    const modal = byId("mmdModal");
    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
      });
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  function init() {
    bindInputs();
    bindActionButtons();
    bindPaymentButtons();
    bindPrimaryButtons();
    bindModalButtons();
    syncSummary();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
