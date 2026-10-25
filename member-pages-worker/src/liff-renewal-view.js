// MY MMD Renewal: presentation only. Prices paid, dates and eligibility are
// supplied by the authenticated server offer, never query strings/localStorage.
export const RENEWAL_VIEW_VERSION = "my-mmd-renewal-atelier-v1";
export const RENEWAL_COPY = Object.freeze({
  eyebrow: "MEMBERSHIP RENEWAL", title: "ยังมีเรื่องดี ๆ", titleAccent: "ให้เราไปต่อด้วยกัน",
  intro: "เลือกแพ็กเกจที่เป็นคุณ แล้วชำระต่อใน LINE",
  heading: "ต่ออายุสมาชิก", home: "เข้า MY MMD ก่อน", current: "สมาชิกปัจจุบัน",
  spend: "ยอดใช้บริการที่ยืนยันได้ · 365 วัน", checking: "กำลังตรวจสิทธิ์ของคุณ",
  unknown: "กำลังตรวจประวัติเดิม ไม่ได้นับเป็นยอดศูนย์",
  contact: "ให้เปอร์ช่วยตรวจ", pending: "ให้เปอร์ตรวจราคาต่ออายุก่อน",
});

export function renewalViewHtml() {
  return `<div id="renewal-card" class="mmd-renewal" data-renewal-version="${RENEWAL_VIEW_VERSION}" aria-labelledby="renewal-title">
  <header class="rn-brand"><span class="rn-logo"><span id="rn-logo-fallback" class="rn-wordmark" aria-label="MMD Privé">MMD<small>PRIVÉ</small></span><img id="rn-logo-image" hidden src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa585ecbbff208b541228df_02-horizontal-lockup-256px.webp" alt="MMD Privé" width="84" height="32"></span><button type="button" data-view="home" class="rn-home">${RENEWAL_COPY.home} <span aria-hidden="true">↗</span></button></header>
  <div class="rn-heading"><p class="rn-kicker">${RENEWAL_COPY.eyebrow}</p><h2 id="renewal-title">${RENEWAL_COPY.title}<br><span>${RENEWAL_COPY.titleAccent}</span></h2><p class="rn-intro">${RENEWAL_COPY.intro}</p></div>
  <ol class="rn-steps" aria-label="ขั้นตอนต่ออายุสมาชิก"><li aria-current="step"><b>1</b> เลือกแพ็กเกจ</li><li><b>2</b> ชำระเงิน</li><li><b>3</b> ยืนยันสิทธิ์</li></ol>
  <div class="rn-member"><span class="rn-monogram" aria-hidden="true">M</span><div><span>${RENEWAL_COPY.current}</span><strong id="rn-current">กำลังตรวจสถานะ</strong></div><span id="rn-expiry" class="rn-expiry"></span></div>
  <fieldset class="rn-packages"><legend>${RENEWAL_COPY.heading}<small>เลือกระยะเวลา 1 ปี</small></legend>
    <label class="rn-plan" data-rn-plan="premium"><input type="radio" name="renewal-package" value="premium" aria-describedby="rn-premium-rule"><span class="rn-plan-top"><span><span class="rn-kicker">PRIVATE COLLECTION</span><strong>Premium</strong></span><span class="rn-radio" aria-hidden="true"></span></span><span class="rn-plan-bottom"><span id="rn-premium-rule" class="rn-rule">ยอดสะสมครบ 20,000 บาท<br><small>ภายใน 365 วัน</small></span><span class="rn-price">฿2,500<small>ราคาต่ออายุเมื่อถึงเกณฑ์</small></span></span><span class="rn-signup-price">ค่าสมัครปกติ 2,999 บาท / ปี</span></label>
    <label class="rn-plan" data-rn-plan="standard"><input type="radio" name="renewal-package" value="standard" aria-describedby="rn-standard-rule"><span class="rn-plan-top"><span><span class="rn-kicker">THE ESSENTIAL</span><strong>Standard</strong></span><span class="rn-radio" aria-hidden="true"></span></span><span class="rn-plan-bottom"><span id="rn-standard-rule" class="rn-rule">ยอดสะสมครบ 10,000 บาท<br><small>ภายใน 365 วัน</small></span><span class="rn-price">฿1,000<small>ราคาต่ออายุเมื่อถึงเกณฑ์</small></span></span><span class="rn-signup-price">ค่าสมัครปกติ 1,199 บาท / ปี</span></label>
  </fieldset>
  <div class="rn-spend"><div><span>${RENEWAL_COPY.spend}</span><strong id="rn-spend">—</strong></div><progress id="rn-spend-progress" max="100" value="0" aria-label="ยอดสะสมที่ยืนยันได้เทียบกับเกณฑ์" hidden></progress><p id="rn-spend-note">${RENEWAL_COPY.unknown}</p></div>
  <div id="rn-loading" class="rn-loading" role="status"><progress id="rn-load-progress" max="100" value="0" aria-label="ความคืบหน้าการตรวจสิทธิ์ต่ออายุ"></progress><span id="rn-load-label">0% · ${RENEWAL_COPY.checking}</span></div>
  <details id="rn-validity" class="rn-details rn-validity" hidden><summary>วันหมดอายุหลังต่อ <b id="rn-new-expiry"></b></summary><div id="renewal-rows" class="rn-dates" hidden></div></details><p id="renewal-promo" class="rn-promo" hidden></p>
  <p id="renewal-note" class="rn-note" role="status"></p>
  <div class="rn-help"><button id="rn-retry" type="button" hidden>ตรวจอีกครั้ง</button><a id="renewal-signup" href="https://lin.ee/xRqsALs" target="_blank" rel="noopener noreferrer">${RENEWAL_COPY.contact} ↗</a></div>
  <details class="rn-details"><summary>รายละเอียดการต่ออายุ</summary><p>ราคาต่ออายุพิเศษขึ้นอยู่กับยอดใช้บริการที่ MMD ยืนยันได้ใน 365 วัน หากประวัติยังไม่ครบ เปอร์จะตรวจให้ก่อน ไม่ถือว่ายอดเป็นศูนย์</p><p>ค่าสมัครปกติเป็นข้อมูลเปรียบเทียบ ไม่ใช่ราคาต่ออายุของผู้ที่ยังไม่ถึงเกณฑ์ สิทธิ์ CARE BACK จะแสดงแยกเมื่อยืนยันได้</p><p>การเลือกแพ็กเกจหรือแนบสลิปยังไม่เปลี่ยนสถานะสมาชิก สิทธิ์จะอัปเดตเมื่อ MMD ยืนยันการชำระเรียบร้อยแล้ว</p></details>
  <footer class="rn-checkout"><div class="rn-total"><span id="rn-selection">เลือกแพ็กเกจของคุณ</span><strong id="renewal-amount">—</strong></div><div id="renewal-price" hidden></div><button id="renewal-action" type="button" disabled>กำลังตรวจสิทธิ์ของคุณ</button><p id="renewal-message" role="status" aria-live="polite">ชำระใน LINE · สิทธิ์อัปเดตหลังยืนยันยอดจริง</p></footer>
</div>`;
}

export const RENEWAL_VIEW_CSS = `
body.app-entered.mmd-renewal-view{background:#0B0E10!important;color:#F3F0E8!important}
body.app-entered.mmd-renewal-view main{max-width:1120px!important;background:transparent!important}
body.app-entered.mmd-renewal-view #package{max-width:100%;padding:0!important;min-height:0!important;background:transparent!important}
body.app-entered.mmd-renewal-view #package>.card,body.app-entered.mmd-renewal-view .digital-dock{display:none!important}
body.app-entered.mmd-renewal-view #profile{padding-bottom:0!important}
.mmd-renewal{--rn-ink:#F3F0E8;--rn-muted:#BEBDB8;--rn-brass:#C9B38A;position:relative;width:min(100%,760px);margin:0 auto;padding:10px 20px 142px;color:var(--rn-ink);font:15px/1.6 "LINE Seed Sans TH","Noto Sans Thai",system-ui,sans-serif;isolation:isolate}
.mmd-renewal *{box-sizing:border-box}.mmd-renewal [hidden]{display:none!important}.mmd-renewal p{margin:0}.mmd-renewal button,.mmd-renewal a{touch-action:manipulation}.mmd-renewal button,.mmd-renewal input{font:inherit}.mmd-renewal button:focus-visible,.mmd-renewal a:focus-visible,.mmd-renewal summary:focus-visible{outline:2px solid #F3F0E8;outline-offset:4px}
.rn-brand{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.rn-brand img{object-fit:contain;object-position:left;width:84px;height:32px}.mmd-renewal .rn-home{width:auto;min-height:44px;padding:8px 0 8px 10px;background:none;border:0;color:var(--rn-muted);font-size:12px;text-align:right}.rn-logo{display:block;min-width:84px;height:32px}.rn-wordmark{display:block;color:#F3F0E8;font:600 19px/1 Georgia,serif;letter-spacing:.14em}.rn-wordmark small{display:block;margin-top:3px;font:8px/1 Georgia,serif;letter-spacing:.32em}.rn-validity summary b{margin-left:auto;font-size:12px;color:#E4D3B1}.rn-validity summary:after{margin-left:8px}.rn-kicker{display:block;color:var(--rn-brass);font-size:10px;letter-spacing:.17em;font-weight:600}.rn-heading h2{margin:8px 0;font-size:clamp(24px,6.2vw,32px);line-height:1.28;font-weight:650;color:var(--rn-ink)}.rn-heading h2 span{color:#DDC8A2}.mmd-renewal .rn-intro{color:var(--rn-muted);font-size:13px;margin-top:8px}.rn-steps{display:flex;justify-content:space-between;gap:8px;margin:12px 0;padding:0;list-style:none;color:var(--rn-muted);font-size:11px}.rn-steps li{display:flex;align-items:center;gap:7px}.rn-steps b{display:grid;place-items:center;width:20px;height:20px;border:1px solid #62645E;border-radius:50%;font-size:10px;font-weight:500}.rn-steps [aria-current] b{border-color:var(--rn-brass);background:var(--rn-brass);color:#171B1D}.rn-steps [aria-current]{color:#DDC8A2}
.rn-member{display:flex;align-items:center;gap:11px;padding:10px 12px;border:1px solid #373B3A;border-radius:12px;background:#171B1D}.rn-monogram{display:grid;place-items:center;flex:0 0 32px;height:32px;border:1px solid #736953;border-radius:50%;color:#D9C39D;font:20px Georgia,serif}.rn-member div{flex:1;min-width:0}.rn-member div>span{display:block;color:var(--rn-muted);font-size:11px}.rn-member strong{display:block;font-size:14px;font-weight:550}.rn-expiry{max-width:40%;color:var(--rn-muted);font-size:11px;text-align:right}
.rn-packages{display:grid;gap:10px;min-width:0;margin:13px 0 10px;padding:0;border:0}.rn-packages legend{width:100%;padding:0;margin:0 0 10px;color:var(--rn-ink);font-size:14px;font-weight:600}.rn-packages legend small{float:right;color:var(--rn-muted);font-size:11px;font-weight:400}.rn-plan{position:relative;display:block;min-width:0;padding:11px 13px;border:1px solid #484B47;border-radius:14px;background:linear-gradient(120deg,#1C2021,#141819);cursor:pointer;transition:border-color .2s,background .2s,transform .2s}.rn-plan:active{transform:scale(.993)}.rn-plan input{position:absolute;left:12px;top:12px;opacity:0;width:1px;height:1px;margin:0;padding:0}.rn-plan:has(input:checked){border-color:#D4BE95;background:linear-gradient(115deg,#302B20,#1A1E1E 80%);box-shadow:inset 0 0 0 .5px #D4BE95}.rn-plan:has(input:focus-visible){outline:2px solid #F3F0E8;outline-offset:3px}.rn-plan-top,.rn-plan-bottom{display:flex;align-items:center;justify-content:space-between;gap:12px}.rn-plan-top strong{display:block;color:var(--rn-ink);font:23px/1.25 Georgia,"Times New Roman",serif}.rn-radio{display:grid;place-items:center;flex:0 0 22px;height:22px;border:1px solid #8C826B;border-radius:50%}.rn-plan:has(input:checked) .rn-radio{background:#C9B38A;border-color:#C9B38A}.rn-plan:has(input:checked) .rn-radio:after{content:"";width:8px;height:4px;transform:rotate(-45deg);border-left:2px solid #25251E;border-bottom:2px solid #25251E}.rn-plan-bottom{align-items:flex-end;margin-top:5px}.rn-rule{font-size:12px;color:var(--rn-muted)}.rn-rule small{font-size:11px;color:var(--rn-muted)}.rn-price{text-align:right;white-space:nowrap;font-size:25px;font-weight:650;letter-spacing:-.04em;line-height:1.2}.rn-price small{display:block;margin-top:4px;font-size:10px;font-weight:400;letter-spacing:0;color:var(--rn-muted)}.rn-signup-price{display:block;margin-top:6px;padding-top:5px;border-top:1px solid #ffffff12;font-size:11px;color:var(--rn-muted)}
.rn-spend{padding:12px 14px;background:#171B1D;border:1px solid #373B3A;border-radius:12px}.rn-spend>div{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;color:var(--rn-muted)}.rn-spend strong{font-size:14px;color:var(--rn-ink);white-space:nowrap}.mmd-renewal .rn-spend p{margin-top:5px;font-size:11px;color:var(--rn-muted)}.mmd-renewal progress{display:block;width:100%;height:3px;margin:9px 0 0;border:0;border-radius:3px;overflow:hidden;background:#3A3E39;accent-color:#C9B38A}.mmd-renewal progress::-webkit-progress-bar{background:#3A3E39}.mmd-renewal progress::-webkit-progress-value{background:#C9B38A}.rn-loading{margin:13px 0;font-size:11px;color:var(--rn-muted)}.rn-loading span{display:block;margin-top:5px}.rn-dates{margin:12px 0;border-top:1px solid #373B3A}.rn-date-row{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid #373B3A;font-size:12px}.rn-date-row span{color:var(--rn-muted)}.rn-date-row b{color:var(--rn-ink);text-align:right;font-weight:550}.mmd-renewal .rn-promo{padding:9px 12px;margin:10px 0;background:#29291F;border:1px solid #625B44;border-radius:9px;color:#E4D3B1;font-size:12px}.mmd-renewal .rn-note{margin-top:12px;font-size:12px;color:#DDC8A2;line-height:1.7}.rn-help{display:flex;align-items:center;justify-content:space-between;gap:12px}.rn-help a,.mmd-renewal .rn-help button{display:inline-flex;align-items:center;min-height:44px;width:auto;padding:5px 0;border:0;background:none;color:var(--rn-ink);font-size:12px;text-decoration:underline;text-underline-offset:4px}.rn-help a{margin-left:auto}.rn-details{margin-top:6px;font-size:12px;color:var(--rn-muted)}.rn-details summary{min-height:44px;display:flex;align-items:center;gap:8px;color:var(--rn-ink);cursor:pointer}.rn-details summary:after{content:"+";margin-left:auto}.rn-details[open] summary:after{content:"−"}.rn-details p{padding:4px 0 8px}
.rn-checkout{position:fixed;z-index:50;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:760px;padding:12px max(20px,env(safe-area-inset-left)) calc(12px + env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-right));background:linear-gradient(180deg,#151A1AF5,#0B0E10);border-top:1px solid #4A473B;backdrop-filter:blur(16px)}.rn-total{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;font-size:12px;color:var(--rn-muted)}.rn-total strong{color:var(--rn-ink);font-size:19px}.mmd-renewal #renewal-action{display:block;width:100%;min-height:50px;margin:0;padding:12px 14px;border:0;border-radius:11px;background:linear-gradient(110deg,#E3D1AB,#C9B38A);color:#171B1D;font-weight:650;font-size:14px;text-align:center}.mmd-renewal #renewal-action:disabled{opacity:1;background:#343936;color:#C5C7BE;cursor:not-allowed}.mmd-renewal #renewal-message{font-size:10px;color:var(--rn-muted);text-align:center;margin-top:7px;min-height:16px}
@media(min-width:680px){.mmd-renewal{padding:24px 34px 170px}.rn-heading h2{font-size:36px}.rn-packages{grid-template-columns:1fr 1fr}.rn-packages legend{grid-column:1/-1}.rn-plan{padding:19px}.rn-plan-bottom{margin-top:25px;align-items:flex-start;flex-direction:column;gap:18px}.rn-price{text-align:left;font-size:32px}.rn-brand{margin-bottom:24px}.rn-checkout{border-radius:14px 14px 0 0;padding-left:34px;padding-right:34px}.rn-steps{max-width:380px}.rn-member{margin-top:20px}}
@media(max-width:350px){.mmd-renewal{padding-left:14px;padding-right:14px}.rn-home{font-size:11px!important}.rn-plan{padding:12px}.rn-price{font-size:23px}.rn-rule{font-size:11px}.rn-price small{font-size:9px}}
@media(prefers-reduced-motion:reduce){.mmd-renewal *{transition:none!important;animation:none!important}}
`;

// Self-contained because the shell embeds this function inside its existing
// CSP-nonced script. Use the shell's serialized memberApiFetch (rotating cookies).
export function createRenewalView({ document, fetcher, navigate, showView, checkoutUrl, getBusy, setBusy }) {
  const $ = id => document.getElementById(id);
  const logo = $("rn-logo-image");
  if (logo) {
    const loaded = () => { logo.hidden = false; $("rn-logo-fallback").hidden = true; };
    const failed = () => { logo.hidden = true; $("rn-logo-fallback").hidden = false; };
    logo.addEventListener("load", loaded, { once: true }); logo.addEventListener("error", failed, { once: true });
    if (logo.complete) { if (logo.naturalWidth > 0) loaded(); else failed(); }
  }
  const fields = [...document.querySelectorAll('input[name="renewal-package"]')];
  const policy = "renewal_spend_365_20261025";
  const rules = { standard: { label: "Standard", threshold: 10000, price: 1000 }, premium: { label: "Premium", threshold: 20000, price: 2500 } };
  let selected = "", accepted = null, generation = 0, purchasing = false, loading = false, handedOff = false;
  const money = n => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(n);
  const date = value => {
    if (!value || !Number.isFinite(Date.parse(value))) return "";
    return new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(value));
  };
  const progress = (percent, label) => {
    $("rn-loading").hidden = percent === 100;
    $("rn-load-progress").value = percent;
    $("rn-load-label").textContent = percent + "% · " + label;
  };
  function markSelection() {
    for (const field of fields) field.checked = field.value === selected;
    $("rn-selection").textContent = rules[selected] ? rules[selected].label + " · ต่ออายุ 1 ปี" : "เลือกแพ็กเกจของคุณ";
  }
  function clearQuote() {
    accepted = null;
    $("renewal-action").disabled = true;
    $("renewal-amount").textContent = "—";
    $("renewal-rows").replaceChildren(); $("renewal-rows").hidden = true;
    $("rn-validity").hidden = true;
    $("renewal-promo").hidden = true;
    $("rn-retry").hidden = true;
  }
  function review(reason) {
    clearQuote();
    const notes = {
      package_change_review: "เลือกแพ็กเกจนี้ไว้ได้ครับ ให้เปอร์ตรวจการเปลี่ยนระดับและวันเริ่มสิทธิ์ก่อนชำระ",
      below_threshold_price_review: "ยอดที่ยืนยันได้ยังไม่ถึงเกณฑ์ราคาพิเศษ ให้เปอร์ตรวจราคาต่ออายุให้ก่อนนะครับ",
      history_pending: "ประวัติเดิมยังตรวจไม่ครบ ให้เปอร์ตรวจสิทธิ์ให้ก่อน ไม่ได้นับยอดของคุณเป็นศูนย์",
      signup_instead: "ให้เปอร์ตรวจสมาชิกเดิมและตัวเลือกที่เหมาะกับคุณก่อนนะครับ ยังไม่มีรายการชำระใหม่",
      unavailable: "ตอนนี้ยังเปิดรายละเอียดการต่ออายุไม่ได้ ลองอีกครั้งหรือให้เปอร์ช่วยตรวจได้ครับ",
      auth: "กรุณาเปิดลิงก์ต่ออายุจาก LINE อีกครั้งเพื่อยืนยันบัญชีของคุณ",
      disabled: "ดูและเลือกแพ็กเกจไว้ก่อนได้ครับ การชำระจะเปิดเมื่อ MMD ยืนยันรายการของคุณแล้ว",
    };
    $("renewal-note").textContent = notes[reason] || "ให้เปอร์ตรวจแพ็กเกจและราคาต่ออายุของคุณก่อนชำระนะครับ";
    if (["disabled", "auth"].includes(reason) && $("rn-current").textContent === "กำลังตรวจสถานะ") $("rn-current").textContent = "MY MMD";
    $("renewal-action").textContent = reason === "auth" ? "ยืนยันบัญชีใน LINE ก่อน" : "ให้เปอร์ตรวจรายการก่อนชำระ";
    $("rn-retry").hidden = !["unavailable", "history_pending", "auth"].includes(reason);
  }
  function render(offer) {
    clearQuote(); progress(100, "ตรวจรายการแล้ว");
    const current = offer?.current_package_code || offer?.package_code || "";
    if (!selected && rules[current]) selected = current;
    markSelection();
    if (rules[current]) $("rn-current").textContent = rules[current].label;
    const expiry = date(offer?.current_expires_at);
    $("rn-expiry").textContent = expiry ? "ใช้ได้ถึง " + expiry : "";
    const spend = offer?.service_spend_365_thb;
    const verifiedSpend = offer?.history_status === "verified" && typeof spend === "number" && Number.isFinite(spend) && spend >= 0;
    $("rn-spend").textContent = verifiedSpend ? "฿" + money(spend) : "—";
    $("rn-spend-progress").hidden = !verifiedSpend || !rules[selected];
    if (verifiedSpend && rules[selected]) {
      const threshold = rules[selected].threshold;
      $("rn-spend-progress").value = Math.min(100, spend / threshold * 100);
      $("rn-spend-note").textContent = spend >= threshold ? "ยอดที่ยืนยันได้ถึงเกณฑ์ " + rules[selected].label : "ยอดที่ยืนยันได้ยังขาด ฿" + money(threshold - spend) + " จากเกณฑ์ " + rules[selected].label;
    } else $("rn-spend-note").textContent = "กำลังตรวจประวัติเดิม ไม่ได้นับเป็นยอดศูนย์";
    const valid = offer?.ok === true && offer.status === "ready" && offer.payment_available === true
      && rules[selected] && offer.package_code === selected && offer.amount_thb === rules[selected].price
      && offer.pricing_policy === policy && offer.discount_verified === true && verifiedSpend
      && spend >= rules[selected].threshold && offer.official_verification_required === true
      && offer.entitlement_granted === false && Number(offer.membership_years) === 1;
    if (!valid) { review(offer?.status === "signup_instead" ? "signup_instead" : offer?.reason || "history_pending"); return; }
    accepted = { ...offer };
    $("renewal-amount").textContent = "฿" + money(offer.amount_thb);
    const addRow = (label, value) => {
      if (!value) return;
      const row = document.createElement("div"); row.className = "rn-date-row";
      const key = document.createElement("span"); key.textContent = label;
      const val = document.createElement("b"); val.textContent = value;
      row.append(key, val); $("renewal-rows").append(row);
    };
    addRow("เริ่มต่ออายุ", date(offer.renewal_starts_at));
    addRow("ใช้ได้ถึงหลังต่ออายุ", date(offer.new_expires_at));
    $("renewal-rows").hidden = !$("renewal-rows").children.length;
    $("rn-validity").hidden = !date(offer.new_expires_at);
    $("rn-new-expiry").textContent = date(offer.new_expires_at);
    if (offer.promotion_label) { $("renewal-promo").textContent = String(offer.promotion_label); $("renewal-promo").hidden = false; }
    $("renewal-note").textContent = "ราคานี้ผ่านการตรวจสิทธิ์แล้ว ไปเลือกวิธีชำระใน LINE ได้เลย";
    $("renewal-action").disabled = false;
    $("renewal-action").textContent = "ยืนยันแพ็กเกจ · ชำระ " + money(offer.amount_thb) + " บาท →";
  }
  async function load(code = "") {
    if (purchasing || handedOff) return;
    if (code && !rules[code]) return;
    if (code) selected = code;
    const mine = ++generation; loading = true; clearQuote(); markSelection();
    $("renewal-card").hidden = false;
    $("renewal-action").textContent = "กำลังตรวจสิทธิ์ของคุณ";
    $("renewal-note").textContent = "";
    $("rn-spend-progress").hidden = true;
    $("renewal-message").textContent = "ชำระใน LINE · สิทธิ์อัปเดตหลังยืนยันยอดจริง";
    progress(0, "กำลังตรวจสิทธิ์ของคุณ");
    try {
      const query = selected ? "?package_code=" + encodeURIComponent(selected) : "";
      const response = await fetcher("/member/api/liff/renewal/offer" + query, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
      if (mine !== generation) return;
      progress(50, "ได้รับรายละเอียดแล้ว");
      const offer = await response.json().catch(() => null);
      if (mine !== generation) return;
      if (response.status === 401) { review("auth"); return; }
      if (response.status === 404) { review("disabled"); return; }
      if (!response.ok || offer?.ok !== true) { review("unavailable"); return; }
      render(offer);
    } catch { if (mine === generation) review("unavailable"); }
    finally { if (mine === generation) { loading = false; progress(100, "ตรวจรายการแล้ว"); } }
  }
  async function purchase(code = selected) {
    if (purchasing || handedOff || loading || getBusy() || !accepted || code !== selected || accepted.package_code !== selected) return;
    const quote = accepted; purchasing = true; setBusy(true);
    for (const field of fields) field.disabled = true;
    $("renewal-action").disabled = true;
    $("renewal-action").textContent = "กำลังเปิดหน้าชำระใน LINE";
    $("renewal-message").textContent = "กำลังเตรียมรายการของคุณ · ยังไม่มีการต่ออายุจนกว่าจะยืนยันยอด";
    try {
      const response = await fetcher("/member/api/liff/renewal/purchase", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ package_code: selected }),
      });
      const payload = await response.json().catch(() => null);
      const target = response.ok && payload?.ok === true && payload.official_verification_required === true
        && payload.entitlement_granted === false && payload.package?.package_code === quote.package_code
        && payload.package?.amount_thb === quote.amount_thb ? checkoutUrl(payload.customer_payment_url) : "";
      if (!target) {
        review(response.status === 401 ? "auth" : payload?.reason || "unavailable");
        $("renewal-message").textContent = "ยังไม่เปิดรายการชำระ กรุณาตรวจสิทธิ์อีกครั้ง";
        $("rn-retry").hidden = false;
        return;
      }
      // Navigate only to the exact signed checkout returned by payments-worker.
      handedOff = true;
      navigate(target);
    } catch { handedOff = false; review("unavailable"); $("rn-retry").hidden = false; }
    finally {
      purchasing = false; setBusy(false);
      for (const field of fields) field.disabled = handedOff;
      // Do not enable a second payment tap while navigation is pending.
    }
  }
  for (const field of fields) field.addEventListener("change", () => { if (field.checked) void load(field.value); });
  $("rn-retry").addEventListener("click", () => void load());
  $("renewal-action").addEventListener("click", () => void purchase());
  return { load, render, purchase, selection: () => selected };
}
