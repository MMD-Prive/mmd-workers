(() => {
  "use strict";

  const MAX_PROOF_BYTES = 5 * 1024 * 1024;
  const API_INTAKE = "/member/api/renewal/intake";
  const PROMPTPAY_ID = "0829528889";
  const CREDIT_CARD_PAYMENT_URL = "https://www.paypal.com/ncp/payment/M697T7AW2QZZJ";
  const EXPIRY_POLICY_NOTE_TH =
    "วันหมดอายุสมาชิกอาจขยายเพิ่มเติมได้ตามยอดใช้งานที่เข้าเกณฑ์ points และสถานะแพ็กเกจ โดย Per จะตรวจสอบและยืนยันวันหมดอายุสุดท้ายอีกครั้ง";
  const PAYMENT_METHODS = {
    bank_transfer: {
      label: "Bank Transfer",
      referenceUrl: "bank_transfer:ktb:1420335898",
      title: "Bank Transfer",
      lines: [
        "KTB Bank / Krungthai",
        "Account name: ธัชชะ ป. / Tatcha P.",
        "Account number: 1420335898",
      ],
    },
    promptpay_qr: {
      label: "QR PromptPay",
      referenceUrl: `https://promptpay.io/${PROMPTPAY_ID}`,
      title: "QR PromptPay",
      lines: ["Scan QR PromptPay from your banking app."],
    },
    credit_card: {
      label: "Credit Card",
      referenceUrl: CREDIT_CARD_PAYMENT_URL,
      title: "Credit Card",
      lines: [
        "Open the secure card payment link.",
        "Credit card payment includes approximately 4%+ service charge.",
      ],
    },
  };
  const RENEWAL_PACKAGES = {
    premium: "Premium Package",
    standard: "Standard Package",
    vip: "VIP",
    black_card: "Black Card",
  };
  const byId = (id) => document.getElementById(id);
  const clean = (value) => String(value || "").trim();

  let submitBusy = false;

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function value(id) {
    const el = byId(id);
    return el && "value" in el ? clean(el.value) : "";
  }

  function numValue(id) {
    const raw = value(id).replace(/,/g, "");
    if (!raw) return null;
    const number = Number(raw);
    return Number.isFinite(number) ? number : null;
  }

  function email() {
    return value("emailNow") || value("emailOld");
  }

  function proofFile() {
    const el = byId("oldProof");
    return el && el.files && el.files.length ? el.files[0] : null;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("proof_read_failed"));
      reader.readAsDataURL(file);
    });
  }

  async function proofPayload() {
    const file = proofFile();
    if (!file) {
      return {
        proof_attached: false,
        proof_filename: "",
        proof_mime_type: "",
        proof_size: 0,
        proof_image_base64: "",
        proof_source: "oldProof",
      };
    }

    if (file.size > MAX_PROOF_BYTES) {
      throw new Error("proof_too_large");
    }

    return {
      proof_attached: true,
      proof_filename: file.name || "proof",
      proof_mime_type: file.type || "application/octet-stream",
      proof_size: file.size || 0,
      proof_image_base64: await readFileAsDataUrl(file),
      proof_source: "oldProof",
    };
  }

  function activeAction() {
    const active = document.querySelector(".r6-choice.active[data-action]");
    return active?.dataset?.action || "RENEWAL";
  }

  function activePayment() {
    const active = document.querySelector(".r6-pay.active[data-pay]");
    return normalizePaymentMethod(active?.dataset?.pay || active?.textContent || "bank_transfer");
  }

  function normalizePaymentMethod(value) {
    const raw = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
    if (raw.includes("credit") || raw.includes("card") || raw.includes("paypal")) return "credit_card";
    if (raw.includes("promptpay") || raw.includes("qr")) return "promptpay_qr";
    return "bank_transfer";
  }

  function paymentDetails(method, amount) {
    const config = PAYMENT_METHODS[method] || PAYMENT_METHODS.bank_transfer;
    if (method !== "promptpay_qr") return config;
    const amountPart = Number.isFinite(amount) && amount > 0 ? `/${amount}` : "";
    return {
      ...config,
      referenceUrl: `https://promptpay.io/${PROMPTPAY_ID}${amountPart}`,
    };
  }

  function normalizePackage(value) {
    const raw = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
    if (raw.includes("black") || raw.includes("svip")) return "black_card";
    if (raw.includes("vip")) return "vip";
    if (raw.includes("standard") || raw.includes("lite")) return "standard";
    if (raw.includes("premium")) return "premium";
    return "premium";
  }

  function activePackage() {
    const active = document.querySelector(".r6-package.active[data-package], .r6-choice.active[data-package]");
    const code = normalizePackage(active?.dataset?.package || active?.dataset?.action || active?.textContent || value("targetPackage"));
    return {
      code,
      label: RENEWAL_PACKAGES[code] || RENEWAL_PACKAGES.premium,
    };
  }

  function activeAmount() {
    const active = document.querySelector(".r6-package.active[data-amount], .r6-choice.active[data-amount], .r6-pay.active[data-amount]");
    const amount = Number(clean(active?.dataset?.amount || value("amount") || value("total")).replace(/,/g, ""));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  function inferExpiryExtensionReason(pointsBalance, pointsRequired, targetPackage, proofAttached) {
    if (pointsBalance !== null && pointsRequired !== null && pointsRequired > 0 && pointsBalance >= pointsRequired) {
      return "points_threshold_reached";
    }
    if (targetPackage === "vip" || targetPackage === "black_card") return "upgrade_review";
    if (proofAttached) return "paid_renewal";
    return "manual_review";
  }

  function ensurePaymentModal() {
    let modal = byId("r6PaymentModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "r6PaymentModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.hidden = true;
    modal.innerHTML = [
      '<div class="r6-payment-modal-backdrop" data-close-payment-modal></div>',
      '<div class="r6-payment-modal-card">',
      '<button type="button" class="r6-payment-modal-close" data-close-payment-modal>Close</button>',
      '<h3 id="r6PaymentModalTitle"></h3>',
      '<div id="r6PaymentModalBody"></div>',
      "</div>",
    ].join("");
    document.body.appendChild(modal);
    return modal;
  }

  function openPaymentModal(method) {
    const amount = activeAmount();
    const details = paymentDetails(method, amount);
    const modal = ensurePaymentModal();
    const title = byId("r6PaymentModalTitle");
    const body = byId("r6PaymentModalBody");
    if (title) title.textContent = details.title;
    if (body) {
      const qr = method === "promptpay_qr"
        ? `<img alt="PromptPay QR" style="max-width:240px;width:100%;" src="${details.referenceUrl}" />`
        : "";
      const link = method === "credit_card"
        ? `<p><a href="${details.referenceUrl}" target="_blank" rel="noopener noreferrer">Open credit card payment</a></p>`
        : "";
      body.innerHTML = [
        ...details.lines.map((line) => `<p>${line}</p>`),
        qr,
        link,
      ].join("");
    }
    modal.hidden = false;
  }

  function selectPaymentCard(card) {
    const method = normalizePaymentMethod(card?.dataset?.pay || card?.textContent || "");
    document.querySelectorAll(".r6-pay.active").forEach((el) => el.classList.remove("active"));
    card.classList.add("active");
    card.dataset.pay = method;
    setText("sumPayment", PAYMENT_METHODS[method]?.label || "Bank Transfer");
    openPaymentModal(method);
  }

  function syncProofStatus() {
    const file = proofFile();
    setText("proofStatus", file ? `เลือกไฟล์แล้ว: ${file.name || "มีไฟล์แนบ"}` : "เลือกไฟล์สลิป / หลักฐานสมาชิกเก่า");
    setText("sumProof", file ? file.name || "มีไฟล์แนบ" : "ไม่มี");
  }

  function renderPackageOptions() {
    const container = byId("renewalPackageOptions") || document.querySelector("[data-renewal-packages]");
    if (!container) return;
    container.innerHTML = Object.entries(RENEWAL_PACKAGES)
      .map(([code, label], index) => (
        `<button type="button" class="r6-package${index === 0 ? " active" : ""}" data-package="${code}">${label}</button>`
      ))
      .join("");
  }

  function renderPaymentOptions() {
    const container = byId("renewalPaymentOptions") || document.querySelector("[data-renewal-payments]");
    if (!container) return;
    container.innerHTML = Object.entries(PAYMENT_METHODS)
      .map(([code, item], index) => (
        `<button type="button" class="r6-pay${index === 0 ? " active" : ""}" data-pay="${code}">${item.label}</button>`
      ))
      .join("");
  }

  function syncStaticNotes() {
    setText("expiryPolicyNote", EXPIRY_POLICY_NOTE_TH);
    setText("sumExpiryRule", "Dynamic review");
  }

  function buildHistoryNote(proof, action, paymentMethod) {
    return [
      `proof:${proof.proof_attached ? "attached" : "none"}`,
      `proof_filename:${proof.proof_attached ? proof.proof_filename : "none"}`,
      `proof_attached:${proof.proof_attached}`,
      `proof_mime_type:${proof.proof_attached ? proof.proof_mime_type : "none"}`,
      `proof_size:${proof.proof_attached ? proof.proof_size : 0}`,
      `proof_source:${proof.proof_source}`,
      `action:${action}`,
      `payment_method:${paymentMethod}`,
      "membership_expiry_rule:dynamic_points_extension",
      "renewal_days_fixed:false",
      "points_can_extend_expiry:true",
    ].join("; ");
  }

  async function submitRenewal(button) {
    if (submitBusy) return;

    if (!value("nick") || !email()) {
      alert("ขอชื่อเล่นและ email อย่างน้อย 1 ช่องก่อนนะครับ");
      return;
    }

    if (!byId("consent")?.checked) {
      alert("กรุณาติ๊กยินยอมก่อนส่งเข้า SĪGIL review ครับ");
      return;
    }

    submitBusy = true;
    const originalText = button.textContent || "ส่งเข้า SĪGIL review";
    button.disabled = true;
    button.textContent = "กำลังส่งเข้า SĪGIL review...";

    try {
      const proof = await proofPayload();
      const action = activeAction();
      const paymentMethod = activePayment();
      const payment = paymentDetails(paymentMethod, activeAmount());
      const targetPackage = activePackage();
      const pointsBalance = numValue("pointsBalance");
      const pointsRequired = numValue("pointsRequired");
      const pointsShortfall = numValue("pointsShortfall");
      const expiryExtensionReason = inferExpiryExtensionReason(pointsBalance, pointsRequired, targetPackage.code, proof.proof_attached);
      const membershipExpiryRule = targetPackage.code === "black_card"
        ? "long_term_dynamic_points_extension"
        : "dynamic_points_extension";
      const payload = {
        flow: "sigil_renewal_review",
        source_page: "pay_renewal_sigil_r6",
        display_name: value("nick"),
        nickname: value("nick"),
        email: email(),
        email_primary: value("emailNow"),
        email_secondary: value("emailOld"),
        phone: value("phone"),
        telegram_username: value("telegram"),
        action,
        target_package: targetPackage.code,
        target_package_label: targetPackage.label,
        membership_expiry_rule: membershipExpiryRule,
        renewal_days_fixed: false,
        points_can_extend_expiry: true,
        points_balance: pointsBalance,
        points_required: pointsRequired,
        points_shortfall: pointsShortfall,
        expiry_extension_reason: expiryExtensionReason,
        black_card_default_validity_months: targetPackage.code === "black_card" ? 36 : null,
        black_card_review_cycle_months: targetPackage.code === "black_card" ? 12 : null,
        black_card_expiry_rule: targetPackage.code === "black_card" ? "long_term_dynamic_points_extension" : null,
        black_card_lifetime: targetPackage.code === "black_card" ? false : null,
        payment_method: paymentMethod,
        payment_method_label: payment.label,
        payment_reference_url: payment.referenceUrl,
        ...proof,
        private_access_review: action === "PRIVATE_ACCESS",
        service_history_note: buildHistoryNote(proof, action, paymentMethod),
        notify_telegram: true,
      };

      const response = await fetch(API_INTAKE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.ok === false) throw new Error("request_failed");

      setText("heroStatus", "ส่งเข้า SĪGIL review แล้ว");
      setText("sumStatus", "ส่งเข้า SĪGIL review แล้ว");
      button.textContent = "ส่งเข้า SĪGIL review แล้ว";
      alert("รับเรื่องแล้วครับ เดี๋ยวผมตรวจสิทธิ์และ points ให้ต่อเอง");
    } catch (error) {
      if (error && error.message === "proof_too_large") {
        setText("heroStatus", "ไฟล์หลักฐานใหญ่เกินไปครับ กรุณาอัปโหลดรูปไม่เกิน 5MB");
        setText("sumStatus", "ไฟล์หลักฐานใหญ่เกินไปครับ กรุณาอัปโหลดรูปไม่เกิน 5MB");
        alert("ไฟล์หลักฐานใหญ่เกินไปครับ กรุณาอัปโหลดรูปไม่เกิน 5MB");
        button.disabled = false;
        button.textContent = originalText;
        submitBusy = false;
        return;
      }

      setText("heroStatus", "ส่งอัตโนมัติไม่สำเร็จ");
      setText("sumStatus", "ส่งอัตโนมัติไม่สำเร็จ กรุณาทัก Per โดยตรง");
      button.disabled = false;
      button.textContent = originalText;
      submitBusy = false;
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const closePaymentModal = target.closest("[data-close-payment-modal]");
    if (closePaymentModal) {
      const modal = byId("r6PaymentModal");
      if (modal) modal.hidden = true;
      return;
    }

    const payCard = target.closest(".r6-pay[data-pay], .r6-pay");
    if (payCard) {
      event.preventDefault();
      selectPaymentCard(payCard);
      return;
    }

    const packageCard = target.closest(".r6-package[data-package]");
    if (packageCard) {
      event.preventDefault();
      document.querySelectorAll(".r6-package.active").forEach((el) => el.classList.remove("active"));
      packageCard.classList.add("active");
      const selected = activePackage();
      setText("sumPackage", selected.label);
      return;
    }

    const button = target.closest("#submitBtn");
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    submitRenewal(button);
  }, true);

  byId("oldProof")?.addEventListener("change", syncProofStatus);
  renderPackageOptions();
  renderPaymentOptions();
  syncStaticNotes();
  syncProofStatus();
})();
