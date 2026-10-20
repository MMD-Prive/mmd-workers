// Self-contained so the same customer UI can run against inert preview fixtures.
export async function loadDoubleMomentCard(request = globalThis.fetch) {
  const card = document.getElementById("double-moment-card");
  if (!card) return;
  const rows = document.getElementById("double-moment-rows");
  const note = document.getElementById("double-moment-note");
  const button = document.getElementById("double-moment-action");
  card.hidden = false;
  rows.replaceChildren(); button.hidden = true; button.disabled = true;
  note.textContent = "กำลังตรวจสอบรายการและสิทธิ์ของบัญชี LINE นี้";
  const root = "/member/api/liff/promotions/double-moment";
  const money = value => new Intl.NumberFormat("th-TH").format(value) + " บาท";
  try {
    const response = await request(root + "/offer", { credentials: "same-origin", cache: "no-store" });
    const offer = await response.json();
    if (!response.ok || offer.ok !== true) throw new Error("unavailable");
    if (offer.status === "already_activated") { note.textContent = "บัญชีนี้รับ Double Moment แล้ว ตรวจสอบเครดิตที่ Wallet ได้ครับ"; return; }
    const keys = ["amount_thb", "paid_credit_thb", "bonus_1_thb", "bonus_2_thb", "total_credit_thb", "minimum_service_thb", "validity_days"];
    if (offer.status !== "ready" || offer.payment_available !== true || offer.package_code !== "double_moment_20000" || keys.some(key => !Number.isInteger(offer[key]) || offer[key] <= 0)) throw new Error("invalid_offer");
    for (const [label, value] of [["ชำระครั้งนี้", money(offer.amount_thb)], ["เครดิตที่ซื้อ", money(offer.paid_credit_thb)], ["โบนัสครั้งที่ 1", money(offer.bonus_1_thb)], ["โบนัสครั้งที่ 2", money(offer.bonus_2_thb)], ["รวมเครดิตบริการ", money(offer.total_credit_thb)], ["อายุเครดิต", offer.validity_days + " วัน หลังออกเครดิต"]]) {
      const row = document.createElement("div"); row.className = "renewal-row";
      const name = document.createElement("span"); name.textContent = label;
      const amount = document.createElement("b"); amount.textContent = value;
      row.append(name, amount); rows.append(row);
    }
    note.textContent = "เครดิตบริการ ไม่ใช่เงินสด · โบนัส 2 ครั้ง ครั้งละ " + money(offer.bonus_1_thb) + " · ยอดบริการขั้นต่ำ " + money(offer.minimum_service_thb) + " · คืนเงินไม่ได้ · เครดิตและโบนัสออกหลังยืนยันการชำระเท่านั้น · ไม่มีคูปองเพิ่มอัตโนมัติ";
    button.textContent = "ชำระ " + money(offer.amount_thb) + " →";
    button.hidden = false; button.disabled = false;
    let purchasing = false;
    button.onclick = async () => {
      if (purchasing) return;
      purchasing = true; button.disabled = true;
      try {
        const result = await request(root + "/purchase", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ package_code: offer.package_code }) });
        const payload = await result.json();
        if (payload.status === "already_activated") { button.hidden = true; note.textContent = "บัญชีนี้รับ Double Moment แล้ว ตรวจสอบ Wallet ได้ครับ"; return; }
        if (!result.ok || payload.ok !== true || payload.entitlement_granted !== false || payload.official_verification_required !== true) throw new Error("unavailable");
        const url = new URL(payload.customer_payment_url);
        if (url.protocol !== "https:" || url.hostname !== "mmdbkk.com" || url.port || url.username || url.password || url.pathname !== "/pay/checkout" || url.hash || [...url.searchParams.keys()].join() !== "t" || !url.searchParams.get("t")) throw new Error("invalid_url");
        window.location.assign(url.href);
      } catch { note.textContent = "ยังเปิดหน้าชำระเงินไม่ได้ กรุณาลองอีกครั้ง · ยังไม่ได้รับเครดิตหรือโบนัส"; }
      finally { purchasing = false; button.disabled = false; }
    };
  } catch {
    note.textContent = "ยังยืนยันรายการนี้ไม่ได้ กรุณาลองอีกครั้ง หรือติดต่อ MMD ใน LINE";
    button.textContent = "ตรวจสอบอีกครั้ง"; button.hidden = false; button.disabled = false;
    button.onclick = () => loadDoubleMomentCard(request);
  }
}
