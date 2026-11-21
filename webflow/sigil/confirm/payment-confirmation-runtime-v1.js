/* Payment Confirmation presentation runtime. Receipt evidence remains pending review. */
(() => {
  "use strict";
  const CSS = "html body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"]{padding:24px;background:#241e18!important}\nhtml body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"]::before{content:\"\"!important;display:block!important;position:fixed!important;inset:0!important;opacity:1!important;filter:none!important;background:#241e18 url(\"DESKTOP_IMAGE\") center top/100% auto no-repeat!important;z-index:0!important}\nhtml body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"]::after{display:none!important}\nhtml body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"] .atelier-hero{display:none!important}\nhtml body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"] .mpc-shell{display:block!important;position:relative!important;max-width:1152px!important;width:100%!important;padding:0!important;margin:auto!important}\nhtml body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"] .mpc-brand{position:relative!important;inset:auto!important;display:inline-flex!important;min-height:56px!important;padding:0!important}\nhtml body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"] .mpc-brand img{width:94px!important;height:47px!important;margin:0!important}\n.mpc-language{float:right;position:relative;z-index:2;min-height:44px;font:inherit;border:1px solid #9c8059;border-radius:8px;color:#fff5e7;background:#231e19;padding:8px}\nhtml body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"] .mpc-card{width:min(510px,100%)!important;margin:85px 0 0!important;padding:30px!important;background:rgba(22,18,15,.95)!important;border:1px solid #9c8059!important;border-radius:18px!important}\nhtml body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"] .mpc-card h1{font-size:32px!important}\nhtml body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"] .mpc-actions{grid-template-columns:1fr!important}\n.mpc-progress{display:flex;list-style:none;gap:8px;padding:0;margin:24px 0}.mpc-progress li{flex:1;border-top:2px solid #635b51;padding-top:8px;font-size:12px;color:#c1b7ab}.mpc-progress .is-done,.mpc-progress .is-current{border-color:#e8c788;color:#fbe0b2}\n@media(max-width:600px){html body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"]{padding:16px}html body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"]::before{background-image:url(\"MOBILE_IMAGE\")!important}html body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"] .mpc-card{margin-top:300px!important;padding:22px!important}html body #mmd-payment-confirmation.atelier[data-atelier-world=\"private\"] .mpc-card h1{font-size:28px!important}.mpc-language{max-width:116px}}\n";
  const root = document.querySelector("[data-mpc]");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "1";
  const params = new URLSearchParams(location.search);
  const first = (...keys) => keys.map(key => (params.get(key) || "").trim()).find(Boolean) || "";
  const amount = first("amount", "amt", "balance");
  const method = first("method", "payment_method").toLowerCase();
  const reference = first("payment_ref", "ref", "booking_ref", "session_id", "s");
  const safeReference = reference.length > 22 ? reference.slice(0,10) + "…" + reference.slice(-6) : reference;
  const copy = {
    th: {lang:"th",title:"ได้รับหลักฐานแล้วครับ",lead:"MMD กำลังตรวจยอดให้ครับ ไม่ต้องส่งหลักฐานซ้ำ",payment:"การชำระเงิน",status:"สถานะการชำระเงิน",review:"กำลังตรวจยอด",note:"เมื่อเรียบร้อยแล้ว สถานะจะอัปเดตใน SĪGIL",steps:["รับหลักฐาน","ตรวจยอด","อัปเดตสถานะ"],amount:"ยอดตามข้อมูลที่ส่งมา",method:"วิธีชำระ",details:"รายละเอียด",reference:"เลขอ้างอิง",home:"กลับไป MY MMD",payments:"ดูสถานะการชำระเงิน",chat:"คุยกับ MMD",bank:"โอนผ่านธนาคาร",card:"บัตร"},
    en: {lang:"en",title:"Proof received",lead:"MMD is checking your payment. You do not need to send your proof again.",payment:"Payment",status:"Payment status",review:"Under review",note:"Your status in SĪGIL will update once the review is complete.",steps:["Proof received","Under review","Status update"],amount:"Submitted amount",method:"Payment method",details:"Details",reference:"Reference",home:"Back to MY MMD",payments:"View payment status",chat:"Contact MMD",bank:"Bank transfer",card:"Card"},
    zh: {lang:"zh-Hans",title:"已收到付款凭证",lead:"MMD 正在核对您的付款，无需重复提交凭证。",payment:"付款",status:"付款状态",review:"核对中",note:"核对完成后，SĪGIL 中的状态将会更新。",steps:["已收到凭证","核对中","更新状态"],amount:"提交的金额",method:"付款方式",details:"详情",reference:"参考编号",home:"返回 MY MMD",payments:"查看付款状态",chat:"联系 MMD",bank:"银行转账",card:"银行卡"}
  };
  const setText = (selector, value) => {const el = root.querySelector(selector); if (el) el.textContent = value;};
  const selector = document.createElement("select");
  selector.className = "mpc-language";
  selector.setAttribute("aria-label", "Language / ภาษา / 语言");
  for (const [value,label] of [["th","ไทย"],["en","English"],["zh","简体中文"]]) {
    const option = document.createElement("option"); option.value = value; option.textContent = label; selector.append(option);
  }
  const requested = first("lang").toLowerCase();
  selector.value = requested.startsWith("zh") ? "zh" : requested === "en" ? "en" : "th";
  const brand = root.querySelector(".mpc-brand");
  brand?.after(selector);
  let progress = root.querySelector(".mpc-progress");
  if (!progress) {progress = document.createElement("ol");progress.className = "mpc-progress";root.querySelector(".mpc-lead")?.after(progress);}
  const isPrivate = root.dataset.atelierWorld === "private";
  if (isPrivate) {
    const base = new URL(".", document.currentScript.src);
    const style = document.createElement("style");
    style.id = "mpc-kenji-runtime-design";
    style.textContent = CSS.replaceAll("DESKTOP_IMAGE", new URL("assets/payment-kenji-desktop.png", base).href).replaceAll("MOBILE_IMAGE", new URL("assets/payment-kenji-mobile.png", base).href);
    document.head.append(style);
    const hero = root.querySelector(".atelier-hero");
    if (hero) hero.hidden = true;
  }
  let details = null;
  let priceError = false;
  const prices = document.createElement("section");
  prices.className = "mpc-price-breakdown";
  prices.hidden = true;
  root.querySelector(".mpc-summary")?.before(prices);
  const priceLabels = {
    th: {full:"ราคาก่อนลด",discount:"ส่วนลด",promotion:"โปรโมชั่น",coupon:"คูปอง",special_price:"ราคาพิเศษ",percent:"%",amount:"จำนวนเงิน",net:"ยอดสุทธิ",deposit:"มัดจำที่ต้องชำระ",due:"ยอดที่ต้องชำระครั้งนี้",reason:"เหตุผล",rounding:"การปัดส่วนลด",basis:"ฐานคำนวณส่วนลด",error:"ยังเปิดรายละเอียดราคาไม่ได้ กรุณาเปิดลิงก์อีกครั้ง"},
    en: {full:"Original price",discount:"Discount",promotion:"Promotion",coupon:"Coupon",special_price:"Special price",percent:"%",amount:"amount",net:"Net total",deposit:"Deposit due",due:"Amount due now",reason:"Reason",rounding:"Discount rounding",basis:"Discount basis",error:"Price details could not be loaded. Please reopen your link."},
    zh: {full:"原价",discount:"优惠",promotion:"促销优惠",coupon:"优惠券",special_price:"特价",percent:"%",amount:"金额",net:"优惠后总额",deposit:"应付订金",due:"本次应付金额",reason:"原因",rounding:"优惠取整",basis:"优惠计算基数",error:"暂时无法加载费用明细，请重新打开链接。"}
  };
  function renderPrices(lang) {
    prices.replaceChildren();
    prices.hidden = !details && !priceError;
    const labels = priceLabels[lang];
    if (priceError) {prices.textContent = labels.error;return;}
    if (!details) return;
    const pricing = details.pricing || {};
    const money = value => new Intl.NumberFormat(lang === "zh" ? "zh-CN" : lang, {style:"currency",currency:"THB"}).format(value);
    const row = (label, value, textValue = false) => {
      if (value == null || (!textValue && !Number.isFinite(Number(value)))) return;
      const line = document.createElement("div");line.className = "mpc-summary-item";
      const name = document.createElement("span");name.textContent = label;
      const amount = document.createElement("strong");amount.textContent = textValue ? value : money(Number(value));
      line.append(name,amount);prices.append(line);
    };
    row(labels.full, pricing.full_price_thb);
    if (pricing.discount_thb > 0) {
      const kind = labels[pricing.discount_kind] || labels.discount;
      const percent = pricing.discount_mode === "percent";
      if (percent && Number.isFinite(pricing.discount_basis_thb) && pricing.discount_basis_thb !== pricing.full_price_thb) row(labels.basis, pricing.discount_basis_thb);
      row(kind + " (" + (percent ? labels.percent : labels.amount) + ")",
        (percent ? pricing.discount_percent + "% · " : "") + "−" + money(pricing.discount_thb), true);
      if (pricing.discount_reason) row(labels.reason, pricing.discount_reason, true);
    }
    if (pricing.discount_mode === "percent" && pricing.discount_rounding === "floor_to_500_baht") {
      const note = lang === "en" ? "Percentage discount rounded down to THB 500" : lang === "zh" ? "百分比优惠金额向下取整至 500 泰铢" : "ส่วนลดเปอร์เซ็นต์ปัดยอดลงทีละ ฿500";
      row(labels.rounding, note, true);
    }
    row(labels.net, pricing.net_price_thb);
    if(pricing.deposit_policy === 'public_model_v1') row(lang==='th'?'กติกามัดจำ':lang==='zh'?'订金规则':'Deposit policy',lang==='th'?'ขั้นต่ำ 20% ของยอดบริการเต็มก่อนลด ไม่รวมค่าเดินทาง':lang==='zh'?'优惠前服务原价的至少 20%，不含交通费':'Minimum 20% of the original service price before discount, excluding travel',true);
    if (details.payment?.stage === "deposit") row(labels.deposit, pricing.deposit_due_thb);
    if (details.payment?.stage !== "deposit") row(labels.due, details.payment?.amount_due_thb);
  }
  const states = {
    th: {
      loading: ["กำลังเปิดสถานะการชำระเงิน", "รอสักครู่ครับ", "กำลังตรวจสถานะ", ""],
      unpaid: ["รายการชำระเงินของคุณ", "ยังไม่ได้รับหลักฐานการชำระเงินสำหรับรายการนี้ครับ", "รอหลักฐานการชำระเงิน", "เปิดหน้าชำระเงินจากลิงก์เดิมเพื่อดำเนินการต่อ"],
      received: ["ได้รับหลักฐานแล้วครับ", "MMD กำลังตรวจยอดให้ครับ ไม่ต้องส่งหลักฐานซ้ำ", "กำลังตรวจยอด", "เมื่อเรียบร้อยแล้ว สถานะจะอัปเดตใน SĪGIL"],
      verified: ["ยืนยันยอดแล้วครับ", "MMD ตรวจสอบการชำระเงินเรียบร้อยแล้ว ขอบคุณครับ", "ยืนยันยอดแล้ว", "ดูสถานะงานต่อได้ใน MY MMD"],
      error: ["ยังเปิดสถานะไม่ได้ครับ", "กรุณาเปิดลิงก์รายการชำระเงินอีกครั้ง", "ยังยืนยันสถานะไม่ได้", ""]
    },
    en: {
      loading: ["Loading payment status", "Please wait a moment.", "Checking status", ""],
      unpaid: ["Your payment", "No payment proof has been received for this item yet.", "Awaiting payment proof", "Use your original payment link to continue."],
      received: ["Proof received", "MMD is checking your payment. You do not need to send your proof again.", "Under review", "Your status in SĪGIL will update after review."],
      verified: ["Payment confirmed", "MMD has verified your payment. Thank you.", "Payment confirmed", "View your job status in MY MMD."],
      error: ["Status unavailable", "Please reopen your payment link.", "Status could not be confirmed", ""]
    },
    zh: {
      loading: ["正在加载付款状态", "请稍候。", "正在查询状态", ""],
      unpaid: ["您的付款", "此项目尚未收到付款凭证。", "等待付款凭证", "请使用原付款链接继续操作。"],
      received: ["已收到付款凭证", "MMD 正在核对您的付款，无需重复提交凭证。", "核对中", "核对完成后，SĪGIL 中的状态将会更新。"],
      verified: ["付款已确认", "MMD 已完成付款核对，谢谢您。", "付款已确认", "请在 MY MMD 查看工作状态。"],
      error: ["暂时无法加载状态", "请重新打开付款链接。", "暂时无法确认状态", ""]
    }
  };
  function render() {
    const text = copy[selector.value];
    renderPrices(selector.value);
    document.documentElement.lang = text.lang;
    root.lang = text.lang;
    document.title = text.payment + (root.dataset.paymentWorld === "public" ? " · MMD Privé" : " · SĪGIL");
    progress.setAttribute("aria-label", text.status);
    const phase = priceError ? "error" : !details ? "loading"
      : details.payment?.verified === true ? "verified"
      : details.payment?.proof_received === true ? "received" : "unpaid";
    const stateText = states[selector.value][phase];
    setText(".mpc-card h1", stateText[0]);
    setText(".mpc-lead", stateText[1]);
    setText(".mpc-kicker", text.status);
    setText(".mpc-brand small", text.payment);
    const publicPayment = root.dataset.paymentWorld === "public";
    setText(".mpc-status strong", stateText[2]);
    setText(".mpc-status p", publicPayment ? stateText[3].replace("SĪGIL", "MY MMD") : stateText[3]);
    setText("[data-mpc-amount-wrap] span", text.amount);
    setText("[data-mpc-method-wrap] span", text.method);
    setText("[data-mpc-details] summary", text.details);
    setText("[data-mpc-ref]", text.reference + ": " + safeReference);
    root.querySelectorAll(".mpc-actions a").forEach(link => {
      const path = new URL(link.href, location.href).pathname;
      link.textContent = path === "/my-mmd/payments" ? text.payments : path === "/member/my-mmd" ? text.home : text.chat;
    });
    progress.replaceChildren(...text.steps.map((label,index) => {
      const item = document.createElement("li");item.textContent = label;
      const step = phase === "verified" ? 2 : phase === "received" ? 1 : 0;
      item.className = index < step ? "is-done" : index === step ? "is-current" : "";
      if (index === step) item.setAttribute("aria-current","step");
      return item;
    }));
    if (amount) {
      const clean = amount.replace(/[^\d.]/g, "");const number = Number(clean);
      setText("[data-mpc-amount]", clean && Number.isFinite(number) ? new Intl.NumberFormat(text.lang, {style:"currency",currency:"THB",maximumFractionDigits:2}).format(number) : amount);
      root.querySelector("[data-mpc-amount-wrap]")?.removeAttribute("hidden");
    }
    if (method) {
      const labels = {promptpay:"PromptPay",bank:text.bank,bank_transfer:text.bank,transfer:text.bank,card:text.card,paypal:"PayPal / " + text.card,paypal_card:"PayPal / " + text.card};
      setText("[data-mpc-method]", labels[method] || method);
      root.querySelector("[data-mpc-method-wrap]")?.removeAttribute("hidden");
    }
    if (reference) root.querySelector("[data-mpc-details]")?.removeAttribute("hidden");
    if (details) root.querySelector("[data-mpc-amount-wrap]")?.setAttribute("hidden", "");
  }
  selector.addEventListener("change",render);
  render();
  const signedToken = params.get("t");
  if (!signedToken) {priceError = true;render();}
  if (signedToken) {
    fetch("https://sigil.mmdbkk.com/v1/confirm/details", {
      method: "POST", credentials: "omit", headers: {"content-type":"application/json"},
      body: JSON.stringify({t:signedToken,expected_role:"customer"})
    }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.ok || data.role !== "customer") throw new Error("price_details_unavailable");
      if (data.model_work_lane === "public_model" || data.pricing?.deposit_policy === "public_model_v1") {
        root.dataset.paymentWorld = "public";
        root.dataset.atelierWorld = "public";
        root.querySelector(".atelier-hero")?.setAttribute("hidden", "");
        if (brand) {
          const name = document.createElement("strong");
          name.textContent = "MMD Privé";
          brand.setAttribute("aria-label", "MMD Privé");
          brand.replaceChildren(name, document.createElement("small"));
        }
        const style = document.createElement("style");
        style.textContent = `
          #mmd-payment-confirmation[data-payment-world="public"]{background:#fbfaf8!important;color:#211b1e}
          #mmd-payment-confirmation[data-payment-world="public"]::before,
          #mmd-payment-confirmation[data-payment-world="public"]::after,
          #mmd-payment-confirmation[data-payment-world="public"] .atelier-hero{display:none!important}
          #mmd-payment-confirmation[data-payment-world="public"] .mpc-shell{display:block;padding:24px 0 44px}
          #mmd-payment-confirmation[data-payment-world="public"] .mpc-brand{position:relative;inset:auto;display:inline-flex;min-height:44px}
          #mmd-payment-confirmation[data-payment-world="public"] .mpc-card{margin:24px 0 0;background:#fff;box-shadow:none}
          #mmd-payment-confirmation[data-payment-world="public"] :is(.mpc-summary-item span,.mpc-status p,.mpc-brand small){color:#57454d!important;-webkit-text-fill-color:#57454d!important}
          #mmd-payment-confirmation[data-payment-world="public"] .mpc-actions a[href*="lin.ee"]{color:#79101c!important;-webkit-text-fill-color:#79101c!important;border-color:#a46b76}
          #mmd-payment-confirmation[data-payment-world="public"] .mpc-language{background:#fff;color:#211b1e;border-color:#e1d4d8}
          #mmd-payment-confirmation[data-payment-world="public"] .mpc-progress li{color:#695860;border-color:#e1d4d8}
          #mmd-payment-confirmation[data-payment-world="public"] .mpc-progress :is(.is-current,.is-done){color:#941523;border-color:#941523}
        `;
        document.head.append(style);
      }
      details = data;render();
    }).catch(() => {priceError = true;render();});
  }
})();
