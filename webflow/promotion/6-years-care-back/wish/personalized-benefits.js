(() => {
  "use strict";

  const LIFF_URL = "https://liff.line.me/2010862595-yT4DCEMc?intent=promo&campaign=care_back&view=care_back";
  const host = document.querySelector("[data-mmd-care-back-personalized]") || createHost();
  if (!host) return;

  host.classList.add("mmd-care-personal");
  host.replaceChildren(sectionHeading(), benefitsPanel(), walletPanel());
  void loadPersonalState();

  async function loadPersonalState() {
    // LIFF sessions rotate after every authenticated read, so these calls must
    // remain sequential. Parallel reads can race the single-use cookie.
    const state = await readJson("/member/api/liff/care-back/state").catch(() => null);
    const walletPayload = await readJson("/member/api/liff/care-back/wallet").catch(() => null);
    const wallet = walletPayload?.wallet || null;
    if (state?.claim) renderBenefits(state.claim.personalized_benefits);
    renderWallet(wallet || state?.claim?.coupon_wallet);
    if (!state?.claim && !wallet) renderSignIn();
  }

  async function readJson(path) {
    const response = await fetch(path, { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) throw new Error("unavailable");
    return payload;
  }

  function createHost() {
    const main = document.querySelector("main");
    if (!main) return null;
    const element = document.createElement("section");
    element.setAttribute("data-mmd-care-back-personalized", "");
    main.append(element);
    return element;
  }

  function sectionHeading() {
    const wrap = document.createElement("div"); wrap.className = "mmd-care-personal__heading";
    const eyebrow = document.createElement("span"); eyebrow.textContent = "6 YEARS · YOUR CARE BACK";
    const title = document.createElement("h2"); title.textContent = "สิทธิ์ที่เตรียมไว้สำหรับคุณ";
    const body = document.createElement("p"); body.textContent = "ข้อมูลส่วนนี้แสดงจากสถานะสมาชิกที่ MMD ยืนยันแล้วเท่านั้นครับ";
    wrap.append(eyebrow, title, body); return wrap;
  }

  function benefitsPanel() {
    const panel = document.createElement("div"); panel.id = "mmd-care-personal-benefits"; panel.className = "mmd-care-personal__grid";
    panel.append(empty("กำลังตรวจสอบ Benefits ของคุณครับ")); return panel;
  }

  function walletPanel() {
    const panel = document.createElement("div"); panel.id = "mmd-care-personal-wallet"; panel.className = "mmd-care-personal__wallet";
    panel.append(empty("กำลังตรวจสอบคูปองของคุณครับ")); return panel;
  }

  function renderBenefits(items) {
    const panel = document.getElementById("mmd-care-personal-benefits"); panel.replaceChildren();
    const safeItems = Array.isArray(items) ? items.slice(0, 4) : [];
    for (const item of safeItems) {
      const type = String(item?.type || ""); const value = Number(item?.value);
      if (!Number.isInteger(value) || value <= 0) continue;
      const card = document.createElement("article");
      const label = document.createElement("span"); label.textContent = ({ membership_extension:"ขยายเวลาสมาชิก", points_bonus:"คะแนนพิเศษ", personal_coupon:"คูปองส่วนตัว" })[type] || "CARE BACK";
      const amount = document.createElement("strong"); amount.textContent = type === "membership_extension" ? `${value} วัน` : type === "points_bonus" ? `+${value} Points` : `${value}%`;
      const status = document.createElement("small"); status.textContent = stateLabel(item?.state);
      card.append(label, amount, status); panel.append(card);
    }
    if (!panel.childElementCount) panel.append(empty("Benefits กำลังรอการตรวจสอบจาก MMD ครับ"));
  }

  function renderWallet(wallet) {
    const panel = document.getElementById("mmd-care-personal-wallet"); panel.replaceChildren();
    const code = String(wallet?.code || ""); const status = String(wallet?.status || "verification_required");
    const label = document.createElement("span"); label.textContent = "คูปองของฉัน · Member LIFF";
    const value = document.createElement("strong"); value.textContent = /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : stateLabel(status);
    const note = document.createElement("small"); note.textContent = /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? `${stateLabel(status)}${wallet?.expires_at ? ` · ถึง ${String(wallet.expires_at).slice(0, 10)}` : ""}` : "คูปองจะออกหลังส่งคำอวยพรและผ่าน payment/review gate ของคุณแล้วครับ";
    panel.append(label, value, note);
  }

  function renderSignIn() {
    const panel = document.getElementById("mmd-care-personal-wallet"); panel.replaceChildren();
    panel.append(empty("เปิดผ่าน LINE เพื่อดู Benefits และคูปองเฉพาะของคุณครับ"));
    const link = document.createElement("a"); link.href = LIFF_URL; link.textContent = "เปิด CARE BACK ใน LINE"; link.rel = "noopener";
    panel.append(link);
  }

  function empty(text) { const p = document.createElement("p"); p.textContent = text; return p; }
  function stateLabel(value) { return ({ready:"พร้อมใช้",wish_required:"รอคำอวยพร",renewal_required:"รอต่ออายุ",payment_required:"รอยืนยันการชำระเงิน",verification_required:"รอตรวจสอบ",pending_application:"กำลังดำเนินการ",applied:"ได้รับแล้ว",used:"ใช้แล้ว",expired:"หมดอายุ",revoked:"ไม่พร้อมใช้งาน",invalid:"ไม่พร้อมใช้งาน"})[String(value || "")] || "กำลังตรวจสอบ"; }
})();
