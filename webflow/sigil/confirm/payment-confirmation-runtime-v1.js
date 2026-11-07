/*!
 * Payment Confirmation — runtime v1
 * Source of truth for the Webflow inline <script> blocks (unnamed runtime), now a pinned hosted script (footer).
 * Code is unchanged.
 */
(() => {
  "use strict";
  const root = document.querySelector("[data-mpc]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "1";

  const p = new URLSearchParams(location.search || "");
  const first = (...keys) => {
    for (const k of keys) {
      const v = String(p.get(k) || "").trim();
      if (v) return v;
    }
    return "";
  };

  const money = first("amount","amt","balance");
  const methodRaw = first("method","payment_method").toLowerCase();
  const ref = first("payment_ref","ref","booking_ref","session_id","s");

  if (money) {
    const clean = money.replace(/[^\d.]/g,"");
    const num = Number(clean);
    root.querySelector("[data-mpc-amount]").textContent =
      Number.isFinite(num) && clean ? num.toLocaleString("th-TH",{maximumFractionDigits:2}) + " บาท" : money;
    root.querySelector("[data-mpc-amount-wrap]").hidden = false;
  }

  if (methodRaw) {
    const labels = {
      promptpay:"PromptPay",
      bank:"Bank Transfer",
      bank_transfer:"Bank Transfer",
      transfer:"Bank Transfer",
      card:"Card",
      paypal:"PayPal / Card",
      paypal_card:"PayPal / Card"
    };
    root.querySelector("[data-mpc-method]").textContent = labels[methodRaw] || methodRaw;
    root.querySelector("[data-mpc-method-wrap]").hidden = false;
  }

  if (ref) {
    const safe = ref.length > 22 ? ref.slice(0,10) + "…" + ref.slice(-6) : ref;
    root.querySelector("[data-mpc-ref]").textContent = "Reference: " + safe;
    root.querySelector("[data-mpc-details]").hidden = false;
  }
})();
