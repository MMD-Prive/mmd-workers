(() => {
  "use strict";

  const MAX_PROOF_BYTES = 5 * 1024 * 1024;
  const API_INTAKE = "/member/api/renewal/intake";
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
    return active?.dataset?.pay || "Bank Transfer";
  }

  function syncProofStatus() {
    const file = proofFile();
    setText("proofStatus", file ? `เลือกไฟล์แล้ว: ${file.name || "มีไฟล์แนบ"}` : "เลือกไฟล์สลิป / หลักฐานสมาชิกเก่า");
    setText("sumProof", file ? file.name || "มีไฟล์แนบ" : "ไม่มี");
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
      "points_rule:1200_points_vip_100_thb_1_point",
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
        payment_method: paymentMethod,
        ...proof,
        points_rule: "1200_points_vip_100_thb_1_point",
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

    const button = target.closest("#submitBtn");
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    submitRenewal(button);
  }, true);

  byId("oldProof")?.addEventListener("change", syncProofStatus);
  syncProofStatus();
})();
