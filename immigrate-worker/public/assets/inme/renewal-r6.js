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
    const aliases = {
      nick: "clientName",
      emailNow: "email",
      telegram: "username",
      targetPackage: "targetTier",
    };
    const el = byId(id) || byId(aliases[id]);
    return el && "value" in el ? clean(el.value) : "";
  }

  function numValue(id) {
    const raw = value(id).replace(/,/g, "");
    if (!raw) return null;
    const number = Number(raw);
    return Number.isFinite(number) ? number : null;
  }

  function email() {
    return value("emailNow") || value("emailOld") || value("email");
  }

  function currentTierHint() {
    return clean(
      value("currentTier") ||
      value("liveTier") ||
      value("matchedTier") ||
      value("sumTier") ||
      ""
    );
  }

  function desiredGoal(action) {
    return clean(action).toUpperCase().includes("UPGRADE") || clean(action).toUpperCase().includes("PRIVATE_ACCESS")
      ? "upgrade"
      : "renewal";
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
    const buttons = Object.entries(RENEWAL_PACKAGES)
      .map(([code, label], index) => (
        `<button type="button" class="r6-package${index === 0 ? " active" : ""}" data-package="${code}">${label}</button>`
      ))
      .join("");
    if (container) container.innerHTML = buttons;

    const legacySelect = byId("targetTier");
    if (legacySelect) {
      legacySelect.innerHTML = Object.entries(RENEWAL_PACKAGES)
        .map(([code, label], index) => `<option value="${code}"${index === 0 ? " selected" : ""}>${label}</option>`)
        .join("");
      legacySelect.dataset.publicPackagesOnly = "true";
      legacySelect.addEventListener("change", () => {
        document.querySelectorAll(".r6-package.active").forEach((el) => el.classList.remove("active"));
        const match = document.querySelector(`.r6-package[data-package="${legacySelect.value}"]`);
        if (match) match.classList.add("active");
        const selected = activePackage();
        setText("sumPackage", selected.label);
      });
    }
  }

  function renderPaymentOptions() {
    const container = byId("renewalPaymentOptions") || document.querySelector("[data-renewal-payments]");
    const buttons = Object.entries(PAYMENT_METHODS)
      .map(([code, item], index) => (
        `<button type="button" class="r6-pay${index === 0 ? " active" : ""}" data-pay="${code}">${item.label}</button>`
      ))
      .join("");
    if (container) container.innerHTML = buttons;

    const legacyPaymentBox = document.querySelector(".mmd-renewal-payment-box");
    if (legacyPaymentBox && !container) {
      legacyPaymentBox.innerHTML = [
        "<div>",
        '<p class="mmd-renewal-mini-title">Payment Method</p>',
        "<h3>Bank Transfer / QR PromptPay / Credit Card</h3>",
        "<p>หลังชำระเงิน กรุณาอัปโหลดรูปหลักฐานด้านล่าง ระบบจะส่งให้ Per ตรวจสอบอัตโนมัติครับ</p>",
        "</div>",
        `<div class="mmd-renewal-payment-detail" data-renewal-payments>${buttons}</div>`,
      ].join("");
    }
  }

  function syncStaticNotes() {
    setText("expiryPolicyNote", EXPIRY_POLICY_NOTE_TH);
    setText("sumExpiryRule", "Dynamic review");
  }

  function buildHistoryNote(proof, action, paymentMethod) {
    const extras = [
      value("context"),
      value("note"),
      value("message"),
      value("detail"),
      value("details"),
      value("remark"),
      value("remarks"),
      value("manualNote"),
      value("serviceHistoryNote"),
    ].filter(Boolean);
    return [
      `proof:${proof.proof_attached ? proof.proof_filename : "none"}`,
      `action:${desiredGoal(action).toUpperCase()}`,
      `payment:${paymentMethod}`,
      "source:pay_renewal_sigil_r6",
      ...extras,
    ].join("; ");
  }

  async function submitRenewal(button) {
    if (submitBusy) return;

    if (!value("nick") || !email()) {
      alert("ขอชื่อเล่นและ email อย่างน้อย 1 ช่องก่อนนะครับ");
      return;
    }

    if (byId("consent") && !byId("consent")?.checked) {
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
      const note = buildHistoryNote(proof, action, paymentMethod);
      const payload = {
        flow: desiredGoal(action),
        source_page: "pay_renewal_sigil_r6",
        display_name: value("nick"),
        nickname: value("nick"),
        name: value("nick"),
        email: email(),
        email_primary: value("emailNow"),
        email_secondary: value("emailOld"),
        phone: value("phone"),
        contact: value("phone"),
        telegram_username: value("telegram") || value("contactHandle"),
        telegram: value("telegram") || value("contactHandle"),
        action,
        desired_goal: desiredGoal(action),
        current_tier_hint: currentTierHint(),
        target_tier: desiredGoal(action) === "upgrade" ? "premium" : (currentTierHint() || targetPackage.code),
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
        total: activeAmount(),
        ...proof,
        private_access_review: action === "PRIVATE_ACCESS",
        service_history_note: note,
        note,
        manual_note: note,
        notify_telegram: true,
        create_and_promote_now: true,
      };

      if (!payload.display_name || !payload.email || !payload.service_history_note) {
        alert("กรอกชื่อเล่น, email และข้อมูลสำหรับส่งต่อ renewal ให้ครบก่อนนะครับ");
        button.disabled = false;
        button.textContent = originalText;
        submitBusy = false;
        return;
      }

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

    const button = target.closest("#submitBtn, #submitRenewalBtn");
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
