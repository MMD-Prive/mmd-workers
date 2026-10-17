/* SĪGIL Pay v21: two safe channels for customer payment proof.
 * Canonical LINE OFC evidence intake already belongs to member-dashboard-chat-worker.
 * No signed token, payment reference, or customer data are sent via this link.
 * This is only a navigation and explanatory UI; payment truth stays in payments-worker.
 */
(() => {
  "use strict";
  const LINE_OFC_URL = "https://lin.ee/xRqsALs";
  const ROOT = "sigil-pay-v21";
  const ID = "sigil-pay-line-ofc-slip-choice";

  function install() {
    const root = document.getElementById(ROOT);
    const proof = root?.querySelector("#sp21-proof");
    const form = proof?.querySelector("[data-sp21-proof-form]");
    if (!form) return false;
    if (form.querySelector("[data-sp21-line-slip-choice]")) return true;

    const heading = proof.querySelector(".sp21__section-head h2");
    if (heading) heading.textContent = "ชำระแล้ว ส่งสลิปได้ 2 ช่องทาง";
    const description = proof.querySelector(".sp21__section-head + .sp21__body");
    if (description) description.textContent =
      "อัปโหลดสลิปในหน้านี้ หรือส่งรูปสลิปเข้า LINE Official Account ของ MMD ก็ได้ครับ เลือกส่งเพียงช่องทางเดียว แล้วรอ MMD ตรวจยอดก่อนยืนยัน";

    const box = document.createElement("div");
    box.className = "sp21__line-slip-choice";
    box.setAttribute("data-sp21-line-slip-choice", "1");

    const divider = document.createElement("div");
    divider.className = "sp21__line-slip-separator";
    divider.textContent = "หรือ";
    box.appendChild(divider);

    const title = document.createElement("strong");
    title.textContent = "ส่งสลิปผ่าน LINE Official Account";
    box.appendChild(title);

    const note = document.createElement("p");
    note.textContent = "ส่งรูปสลิปในแชต LINE ของ MMD พร้อมแจ้งชื่อที่ใช้จองหรือวันเวลาใช้งาน เพื่อช่วยจับคู่กับงานเดิมได้ง่ายขึ้นครับ";
    box.appendChild(note);

    const link = document.createElement("a");
    link.className = "sp21__btn sp21__btn--ghost sp21__btn--wide sp21__line-slip-link";
    link.href = LINE_OFC_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "ส่งสลิปทาง LINE OFC ↗";
    link.setAttribute("data-sp21-line-slip-link", "1");
    box.appendChild(link);

    const caution = document.createElement("small");
    caution.textContent = "ระบบจะพยายามผูกหลักฐานกับรายการเดิม หากข้อมูลยังไม่ชัด MMD จะตรวจให้เองครับ · ส่งครั้งเดียว ไม่ต้องอัปโหลดซ้ำสองทาง · สถานะยังรอตรวจสอบจนกว่าจะยืนยันยอด";
    box.appendChild(caution);

    form.appendChild(box);

    if (!document.getElementById(ID)) {
      const style = document.createElement("style");
      style.id = ID;
      style.textContent = `
#sigil-pay-v21 .sp21__line-slip-choice{
  margin-top:14px;padding:14px;border:1px solid var(--sp21-line-strong);
  border-radius:13px;background:rgba(148,21,35,.035);
  color:var(--sp21-text);font-family:"LINE Seed Sans TH","Noto Sans Thai",sans-serif
}
#sigil-pay-v21 .sp21__line-slip-choice .sp21__line-slip-separator{
  display:flex;align-items:center;gap:12px;margin:0 0 12px;
  color:var(--sp21-muted);font-size:10px;font-weight:700;text-align:center
}
#sigil-pay-v21 .sp21__line-slip-separator::before,
#sigil-pay-v21 .sp21__line-slip-separator::after{
  content:"";flex:1;border-top:1px solid var(--sp21-line)
}
#sigil-pay-v21 .sp21__line-slip-choice strong{
  display:block;color:var(--sp21-text)!important;font-size:12px;line-height:1.6
}
#sigil-pay-v21 .sp21__line-slip-choice p{
  margin:5px 0 0;color:var(--sp21-body)!important;font-size:10px;line-height:1.7
}
#sigil-pay-v21 .sp21__line-slip-choice .sp21__line-slip-link{
  min-height:46px;border-color:var(--sp21-line-strong);
  background:#fff;color:var(--sp21-gold)!important;
  -webkit-text-fill-color:var(--sp21-gold)!important;font-size:11px;font-weight:800
}
#sigil-pay-v21 .sp21__line-slip-choice small{
  display:block;margin-top:9px;color:var(--sp21-muted)!important;
  font-size:9px;line-height:1.7
}`;
      document.head.appendChild(style);
    }
    return true;
  }

  function start() {
    if (install()) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 12000);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
