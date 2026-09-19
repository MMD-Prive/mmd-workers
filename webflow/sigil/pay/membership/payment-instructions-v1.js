(function(){
  "use strict";

  var AUTHORITY = "payments-worker";
  var SCHEMA = "mmd_payment_instructions_v1";
  var ENDPOINT = "https://sigil.mmdbkk.com/v1/confirm/payment-instructions";

  function qs(selector, root){ return (root || document).querySelector(selector); }
  function text(selector, value, root){ var el = qs(selector, root); if (el) el.textContent = value; }
  function money(value){
    var n = Number(value);
    return Number.isFinite(n) && n > 0
      ? new Intl.NumberFormat("th-TH", { style:"currency", currency:"THB", maximumFractionDigits:n % 1 === 0 ? 0 : 2 }).format(n)
      : "—";
  }
  function safeHttps(value){
    try { var url = new URL(String(value || "")); return url.protocol === "https:" ? url.toString() : ""; }
    catch (_) { return ""; }
  }
  function getToken(){
    var params = new URLSearchParams(location.search || "");
    var token = params.get("t");
    if (token) return token;
    try {
      var state = params.get("liff.state");
      if (!state) return "";
      return new URLSearchParams(decodeURIComponent(state).replace(/^\?/, "")).get("t") || "";
    } catch (_) { return ""; }
  }
  function failClosed(root, message){
    if (!root) return;
    root.dataset.paymentInstructionsState = "locked";
    root.dataset.paymentAuthority = "payments-worker";
    text("[data-payment-instructions-status]", message || "ข้อมูลชำระยังไม่พร้อม", root);
    text("[data-payment-instructions-amount]", "—", root);
    text("[data-payment-instructions-bank]", "ยังไม่แสดงข้อมูลบัญชี", root);
    text("[data-payment-instructions-account]", "—", root);
    var qr = qs("[data-payment-instructions-qr]", root);
    if (qr) { qr.removeAttribute("src"); qr.hidden = true; }
    var copy = qs("[data-payment-instructions-copy]", root);
    if (copy) copy.disabled = true;
    var submit = qs("[data-payment-proof-submit]", root);
    if (submit) submit.disabled = true;
  }
  function render(root, payload){
    if (!payload || payload.ok !== true || payload.authority !== AUTHORITY || payload.schema !== SCHEMA) {
      throw new Error("payment_instructions_contract_invalid");
    }
    root.dataset.paymentAuthority = AUTHORITY;
    root.dataset.paymentInstructionsSchema = SCHEMA;
    if (payload.payment_ref) root.dataset.paymentRef = String(payload.payment_ref);
    if (payload.session_id) root.dataset.paymentSessionId = String(payload.session_id);

    if (payload.available !== true) {
      failClosed(root, payload.reason === "proof_received_waiting_verification"
        ? "รับหลักฐานแล้ว กำลังตรวจสอบ"
        : payload.reason === "payment_verified"
          ? "ยืนยันการชำระแล้ว"
          : "ยังไม่มีข้อมูลชำระสำหรับรายการนี้");
      return;
    }

    var amount = Number(payload.amount_due_thb);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("canonical_amount_missing");
    var instructions = payload.instructions || {};
    var promptpay = instructions.promptpay || {};
    var bank = instructions.bank_transfer || {};
    var card = instructions.paypal_card || {};
    var hasDestination = false;

    root.dataset.paymentInstructionsState = "ready";
    root.dataset.canonicalAmountThb = String(amount);
    text("[data-payment-instructions-status]", "ยอดและข้อมูลชำระยืนยันจาก MMD แล้ว", root);
    text("[data-payment-instructions-amount]", money(amount), root);

    var qr = qs("[data-payment-instructions-qr]", root);
    if (qr) {
      var qrUrl = promptpay.enabled === true ? safeHttps(promptpay.qr_url) : "";
      if (qrUrl) { qr.src = qrUrl; qr.hidden = false; hasDestination = true; }
      else { qr.removeAttribute("src"); qr.hidden = true; }
    }

    if (bank.enabled === true && bank.account_number) {
      hasDestination = true;
      text("[data-payment-instructions-bank]", bank.bank_name_th || bank.bank_name_en || bank.provider || "Bank Transfer", root);
      text("[data-payment-instructions-account]", bank.account_number, root);
      text("[data-payment-instructions-account-name]", bank.account_name_th || bank.account_name_en || "MMD Privé", root);
      var copy = qs("[data-payment-instructions-copy]", root);
      if (copy) {
        copy.disabled = false;
        copy.onclick = function(){
          if (navigator.clipboard) navigator.clipboard.writeText(String(bank.account_number));
        };
      }
    } else if (promptpay.enabled === true && promptpay.display_ref) {
      hasDestination = true;
      text("[data-payment-instructions-bank]", "PromptPay", root);
      text("[data-payment-instructions-account]", promptpay.display_ref, root);
    }

    var cardLink = qs("[data-payment-instructions-card]", root);
    var cardUrl = card.enabled === true ? safeHttps(card.url) : "";
    if (cardLink) {
      if (cardUrl) { cardLink.href = cardUrl; cardLink.hidden = false; hasDestination = true; }
      else { cardLink.removeAttribute("href"); cardLink.hidden = true; }
    }

    if (!hasDestination) throw new Error("payment_destination_missing");
    var submit = qs("[data-payment-proof-submit]", root);
    if (submit) submit.disabled = false;
  }
  function load(root){
    var token = getToken();
    if (!token) {
      failClosed(root, "ต้องเปิดจาก signed payment link ของ MMD");
      return Promise.resolve(null);
    }
    failClosed(root, "กำลังตรวจข้อมูลชำระ");
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Accept":"application/json", "Content-Type":"application/json" },
      body: JSON.stringify({ t: token }),
      cache: "no-store"
    }).then(function(response){
      return response.json().catch(function(){ return {}; }).then(function(payload){
        if (!response.ok) throw new Error(payload.error || "payment_instructions_failed");
        return payload;
      });
    }).then(function(payload){ render(root, payload); return payload; })
      .catch(function(){ failClosed(root, "ข้อมูลชำระยังไม่พร้อม กรุณาหยุดก่อนโอนและติดต่อ MMD"); return null; });
  }

  function init(){
    var root = qs("[data-mmd-membership-payment]") || qs(".mmd6") || document.body;
    if (!root) return;
    root.dataset.paymentAuthority = AUTHORITY;
    load(root);
    window.MMDMembershipPaymentInstructionsV1 = { reload:function(){ return load(root); } };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
