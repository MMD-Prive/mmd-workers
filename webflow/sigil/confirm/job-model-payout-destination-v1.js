/* MMD SIGIL Model Confirmation — Payout destination v1
 * Route: /sigil/confirm/job-model  (pasted manually into Webflow after merge)
 *
 * UI-only layer. Appears only AFTER the model has acknowledged the job.
 * Authority stays on sigil.mmdbkk.com:
 *   POST /v1/confirm/payout-destination/context  -> status (masked) + can_submit
 *   POST /v1/confirm/payout-destination          -> store as `pending` for staff review
 * The backend flag MODEL_PAYOUT_DESTINATION_ENABLED decides whether this shows at all
 * (disabled -> this script renders nothing).
 *
 * Privacy: values are written with textContent/value only (no HTML injection), are
 * not kept in any browser storage, are not logged, and are cleared after submit.
 * The full number is never shown back; only the masked tail returned by the API.
 */
(() => {
  const API = "https://sigil.mmdbkk.com";
  const ROOT_ID = "mmd-model-confirm-v15";
  const CARD_ATTR = "data-m-payout-dest";

  const T = {
    th: {
      title: "บัญชีรับเงินของคุณ",
      lead: "กรอกครั้งเดียวเพื่อรับเงินค่างาน ทีมงานจะตรวจชื่อบัญชีให้ตรงกับชื่อของคุณก่อนใช้งาน",
      type: "ช่องทางรับเงิน",
      promptpay_phone: "พร้อมเพย์ (เบอร์โทร)",
      promptpay_national_id: "พร้อมเพย์ (เลขบัตรประชาชน)",
      bank_account: "บัญชีธนาคาร",
      bank: "ชื่อธนาคาร",
      name: "ชื่อบัญชี",
      ref: "เลขบัญชี / เลขพร้อมเพย์",
      submit: "ส่งให้ทีมงานตรวจสอบ",
      sending: "กำลังส่ง…",
      pending: "ส่งแล้ว รอทีมงานตรวจสอบ",
      verified: "ตรวจสอบแล้ว พร้อมใช้งาน",
      rejected: "ข้อมูลไม่ผ่านการตรวจ กรุณาส่งใหม่",
      saved: "ส่งเรียบร้อย รอทีมงานตรวจสอบ",
      current: "ข้อมูลที่ส่งไว้",
      change: "เปลี่ยนบัญชี (ต้องตรวจสอบใหม่)",
      errors: {
        invalid_destination_type: "กรุณาเลือกช่องทางรับเงิน",
        invalid_account_name: "กรุณากรอกชื่อบัญชีให้ถูกต้อง",
        invalid_promptpay_phone: "เบอร์พร้อมเพย์ไม่ถูกต้อง",
        invalid_promptpay_national_id: "เลขบัตรประชาชนไม่ถูกต้อง",
        invalid_bank_account: "เลขบัญชีไม่ถูกต้อง",
        invalid_bank_name: "กรุณากรอกชื่อธนาคาร",
        too_many_attempts: "ส่งหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง",
        model_ack_required: "กรุณายืนยันรับงานก่อน",
        fallback: "ส่งไม่สำเร็จ กรุณาลองใหม่หรือแจ้งทีมงาน",
      },
    },
    en: {
      title: "Where to send your payout",
      lead: "Enter this once to receive your pay. The team checks the account name matches yours before it is used.",
      type: "Payout method",
      promptpay_phone: "PromptPay (phone number)",
      promptpay_national_id: "PromptPay (national ID)",
      bank_account: "Bank account",
      bank: "Bank name",
      name: "Account name",
      ref: "Account / PromptPay number",
      submit: "Send for review",
      sending: "Sending…",
      pending: "Sent — waiting for team review",
      verified: "Verified and ready",
      rejected: "Not accepted — please send again",
      saved: "Sent — waiting for team review",
      current: "Details on file",
      change: "Change account (needs re-check)",
      errors: {
        invalid_destination_type: "Please choose a payout method.",
        invalid_account_name: "Please enter the account name.",
        invalid_promptpay_phone: "That PromptPay phone number looks wrong.",
        invalid_promptpay_national_id: "That national ID looks wrong.",
        invalid_bank_account: "That account number looks wrong.",
        invalid_bank_name: "Please enter the bank name.",
        too_many_attempts: "Too many attempts. Please try again later.",
        model_ack_required: "Please confirm the job first.",
        fallback: "Could not send. Please try again or contact the team.",
      },
    },
  };

  const start = () => {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const token = new URL(window.location.href).searchParams.get("t") || "";
    if (!token) return;

    const lang = String(document.documentElement.lang || "th").toLowerCase().startsWith("en") ? "en" : "th";
    const L = T[lang];
    let busy = false;
    let lastKey = "";
    let checkTimer = null;

    const call = async (path, payload) => {
      const response = await fetch(API + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, expected_role: "model", ...payload }),
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok && data.ok !== false, data };
    };

    const el = (tag, text, attrs = {}) => {
      const node = document.createElement(tag);
      if (text != null) node.textContent = text;
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      return node;
    };

    const field = (labelText, control) => {
      const wrap = el("label", null, { style: "display:block;margin:10px 0 0" });
      wrap.appendChild(el("span", labelText, { style: "display:block;font-size:13px;opacity:.8;margin-bottom:4px" }));
      control.style.cssText = "width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(128,128,128,.45);background:transparent;color:inherit;font:inherit";
      wrap.appendChild(control);
      return wrap;
    };

    const statusText = (destination) => {
      if (!destination || destination.status === "none") return "";
      return L[destination.status] || "";
    };

    const render = (state) => {
      let card = root.querySelector(`[${CARD_ATTR}]`);
      if (!card) {
        card = el("section", null, {
          [CARD_ATTR]: "1",
          style: "margin:16px 0 0;padding:16px;border-radius:14px;border:1px solid rgba(128,128,128,.35)",
        });
        const anchor = root.querySelector("[data-m-success]");
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor.nextSibling);
        else root.appendChild(card);
      }
      card.replaceChildren();
      card.appendChild(el("h3", L.title, { style: "margin:0 0 6px;font-size:16px" }));
      card.appendChild(el("p", L.lead, { style: "margin:0;font-size:13px;opacity:.8" }));

      const destination = state.destination;
      const known = destination && destination.status && destination.status !== "none";
      if (known) {
        const typeLabel = L[destination.type] || "";
        const bank = destination.bank_name ? ` · ${destination.bank_name}` : "";
        card.appendChild(el("p", `${L.current}: ${typeLabel}${bank} ${destination.masked_ref || ""}`.trim(), { style: "margin:10px 0 0;font-size:13px" }));
        card.appendChild(el("p", statusText(destination), { style: "margin:4px 0 0;font-size:13px;font-weight:600", "data-m-dest-status": destination.status }));
      }
      if (known && !state.editing) {
        const change = el("button", L.change, { type: "button", style: "margin-top:10px;padding:8px 12px;border-radius:10px;border:1px solid rgba(128,128,128,.5);background:transparent;color:inherit;font:inherit;cursor:pointer" });
        change.addEventListener("click", () => render({ destination, editing: true }));
        card.appendChild(change);
        return;
      }

      const form = el("form", null, { novalidate: "novalidate", autocomplete: "off" });
      const type = el("select", null, { name: "type", autocomplete: "off" });
      for (const value of ["promptpay_phone", "promptpay_national_id", "bank_account"]) {
        const option = el("option", L[value], { value });
        type.appendChild(option);
      }
      const bank = el("input", null, { name: "bank", type: "text", maxlength: "60", autocomplete: "off" });
      const name = el("input", null, { name: "name", type: "text", maxlength: "100", autocomplete: "off" });
      const ref = el("input", null, { name: "ref", type: "text", inputmode: "numeric", maxlength: "20", autocomplete: "off" });
      const bankField = field(L.bank, bank);
      const syncType = () => { bankField.hidden = type.value !== "bank_account"; };
      type.addEventListener("change", syncType);
      syncType();
      form.append(field(L.type, type), bankField, field(L.name, name), field(L.ref, ref));

      const feedback = el("p", "", { role: "status", "aria-live": "polite", style: "margin:10px 0 0;font-size:13px;min-height:1.2em" });
      const submit = el("button", L.submit, { type: "submit", style: "margin-top:12px;padding:11px 16px;border-radius:12px;border:0;font:inherit;font-weight:600;cursor:pointer" });
      form.append(feedback, submit);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy) return;
        busy = true;
        submit.disabled = true;
        submit.textContent = L.sending;
        feedback.textContent = "";
        try {
          const result = await call("/v1/confirm/payout-destination", {
            destination: { type: type.value, bank_name: bank.value, account_name: name.value, account_ref: ref.value },
          });
          if (result.ok) {
            name.value = "";
            ref.value = "";
            bank.value = "";
            render({ destination: result.data.destination, editing: false, justSaved: true });
            return;
          }
          const code = String(result.data.error || "");
          feedback.textContent = L.errors[code] || L.errors.fallback;
        } catch {
          feedback.textContent = L.errors.fallback;
        } finally {
          busy = false;
          submit.disabled = false;
          submit.textContent = L.submit;
        }
      });
      card.appendChild(form);
      if (state.justSaved) {
        const ok = el("p", L.saved, { role: "status", style: "margin:10px 0 0;font-size:13px;font-weight:600" });
        card.insertBefore(ok, form);
      }
    };

    const check = async () => {
      if (busy) return;
      try {
        const result = await call("/v1/confirm/payout-destination/context", {});
        if (!result.ok || !result.data.enabled || !result.data.can_submit) {
          const stale = root.querySelector(`[${CARD_ATTR}]`);
          if (stale) stale.remove();
          return;
        }
        const key = JSON.stringify(result.data.destination || {});
        if (key === lastKey && root.querySelector(`[${CARD_ATTR}]`)) return;
        lastKey = key;
        render({ destination: result.data.destination, editing: false });
      } catch {
        /* silent: the confirm page itself must never break because of this layer */
      }
    };

    const schedule = () => {
      clearTimeout(checkTimer);
      checkTimer = setTimeout(check, 400);
    };

    check();
    // Re-check when the page flips into the acknowledged state (success block appears).
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.target && mutation.target.closest && mutation.target.closest(`[${CARD_ATTR}]`)) return;
      }
      schedule();
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "data-state"] });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
