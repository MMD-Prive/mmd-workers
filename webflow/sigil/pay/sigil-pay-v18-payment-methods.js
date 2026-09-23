(function(){
  "use strict";
  const root=document.querySelector("[data-spk]");
  if(!root||root.dataset.payV18Methods==="1")return;
  root.dataset.payV18Methods="1";

  const API="https://sigil.mmdbkk.com";
  const INSTRUCTIONS_URL=API+"/v1/confirm/payment-instructions";
  const $=(s)=>root.querySelector(s);
  const clean=(v)=>String(v==null?"":v).trim();
  const safeHttps=(v)=>{try{const u=new URL(clean(v));return u.protocol==="https:"?u.toString():""}catch{return""}};
  const money=(v)=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString("th-TH",{minimumFractionDigits:0,maximumFractionDigits:2}):"—"};
  const params=new URLSearchParams(location.search);
  const token=()=>{const t=params.get("t");if(t)return t;const st=params.get("liff.state");if(!st)return"";try{return new URLSearchParams(decodeURIComponent(st).replace(/^\?/,"")).get("t")||""}catch{return""}};

  const card=$("#spkPayment .spk__pad");
  if(!card)return;

  const legacyBank=card.querySelector(".spk__bank");
  const legacyQr=card.querySelector(".spk__qr");
  if(legacyBank)legacyBank.hidden=true;
  if(legacyQr)legacyQr.hidden=true;

  const chooser=document.createElement("div");
  chooser.className="spkpm";
  chooser.innerHTML=`
    <div class="spkpm__tabs" role="tablist" aria-label="เลือกวิธีชำระเงิน">
      <button type="button" class="spkpm__tab is-active" data-pay-method="promptpay" role="tab" aria-selected="true">QR PromptPay</button>
      <button type="button" class="spkpm__tab" data-pay-method="bank_transfer" role="tab" aria-selected="false">โอนธนาคาร</button>
      <button type="button" class="spkpm__tab" data-pay-method="paypal_card" role="tab" aria-selected="false">Credit Card +4%</button>
    </div>
    <div class="spkpm__panel" data-method-panel="promptpay">
      <div class="spkpm__head"><div><small>01 · PROMPTPAY</small><strong>สแกน QR จากแอปธนาคาร</strong></div><span>แนะนำ</span></div>
      <div class="spkpm__qr" data-method-qr-wrap><img data-method-qr alt="PromptPay QR"><p>ยอดใน QR ต้องตรงกับยอดที่ MMD ยืนยัน</p></div>
    </div>
    <div class="spkpm__panel" data-method-panel="bank_transfer" hidden>
      <div class="spkpm__head"><div><small>02 · BANK TRANSFER</small><strong>โอนเข้าบัญชีธนาคาร</strong></div></div>
      <details class="spkpm__bank" data-method-bank>
        <summary><span>ดูข้อมูลบัญชีสำหรับโอน</span><i>+</i></summary>
        <div class="spkpm__bankbody">
          <div><span>ธนาคาร</span><strong data-method-bank-name>—</strong></div>
          <div><span>ชื่อบัญชี</span><strong data-method-account-name>—</strong></div>
          <div><span>เลขบัญชี</span><strong data-method-account-number>••••••••••</strong></div>
          <button type="button" class="spk__soft" data-method-copy>คัดลอกเลขบัญชี</button>
        </div>
      </details>
    </div>
    <div class="spkpm__panel" data-method-panel="paypal_card" hidden>
      <div class="spkpm__head"><div><small>03 · CREDIT / DEBIT CARD</small><strong>ชำระผ่าน PayPal</strong></div><span>+4%</span></div>
      <div class="spkpm__fee">
        <div><span>ยอดบริการ</span><strong data-method-card-base>—</strong></div>
        <div><span>ค่าดำเนินการบัตร <b data-method-card-rate>4%</b></span><strong data-method-card-fee>—</strong></div>
        <div class="spkpm__fee-total"><span>ยอดชำระผ่านบัตร</span><strong data-method-card-total>—</strong></div>
      </div>
      <p class="spkpm__note">ค่าดำเนินการบัตรแยกจากค่าบริการ ไม่เพิ่ม Points, Lifetime Spend หรือ Model payout</p>
      <a class="spk__primary" data-method-paypal href="#" target="_blank" rel="noopener noreferrer"><span>ชำระด้วยบัตร / PayPal ↗</span><small>เปิดหน้า PayPal ที่ MMD กำหนด</small></a>
    </div>
    <p class="spkpm__status" data-method-status>กำลังโหลดช่องทางชำระเงินจาก MMD</p>
  `;

  const rule=card.querySelector(".spk__rule");
  card.insertBefore(chooser,rule||null);

  let instructions=null;
  let selected="promptpay";

  function setSelected(method){
    selected=method;
    chooser.querySelectorAll("[data-pay-method]").forEach(btn=>{
      const on=btn.dataset.payMethod===method;
      btn.classList.toggle("is-active",on);
      btn.setAttribute("aria-selected",on?"true":"false");
    });
    chooser.querySelectorAll("[data-method-panel]").forEach(panel=>{panel.hidden=panel.dataset.methodPanel!==method});
    const jump=$("[data-spk-upload-jump]");
    if(jump){
      if(method==="paypal_card"){
        jump.hidden=true;
      }else{
        jump.hidden=false;
      }
    }
  }

  chooser.querySelectorAll("[data-pay-method]").forEach(btn=>btn.addEventListener("click",()=>setSelected(btn.dataset.payMethod)));

  const bankDetails=chooser.querySelector("[data-method-bank]");
  if(bankDetails)bankDetails.addEventListener("toggle",()=>{
    const num=chooser.querySelector("[data-method-account-number]");
    if(!num)return;
    num.textContent=bankDetails.open&&instructions?.bank_transfer?.account_number?instructions.bank_transfer.account_number:"••••••••••";
  });

  const copy=chooser.querySelector("[data-method-copy]");
  if(copy)copy.addEventListener("click",async()=>{
    const value=clean(instructions?.bank_transfer?.account_number);
    if(!value)return;
    try{await navigator.clipboard.writeText(value);copy.textContent="คัดลอกแล้ว";setTimeout(()=>copy.textContent="คัดลอกเลขบัญชี",1400)}catch{}
  });

  function toggleMethod(method,enabled){
    const btn=chooser.querySelector('[data-pay-method="'+method+'"]');
    if(btn)btn.hidden=!enabled;
  }

  async function load(){
    const t=token();
    const status=chooser.querySelector("[data-method-status]");
    if(!t){if(status)status.textContent="ต้องเปิดจาก Customer Payment Link ของรายการนี้";return}
    try{
      const res=await fetch(INSTRUCTIONS_URL,{
        method:"POST",
        headers:{"Accept":"application/json","Content-Type":"application/json"},
        credentials:"omit",
        cache:"no-store",
        body:JSON.stringify({t})
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||data.ok!==true||data.authority!=="payments-worker"||data.schema!=="mmd_payment_instructions_v1")throw new Error(data.error||"payment_instructions_invalid");
      if(data.available!==true){
        chooser.hidden=true;
        return;
      }
      instructions=data.instructions||{};
      const pp=instructions.promptpay||{};
      const bank=instructions.bank_transfer||{};
      const card=instructions.paypal_card||{};

      const qrUrl=pp.enabled===true?safeHttps(pp.qr_url):"";
      const bankEnabled=bank.enabled===true&&clean(bank.account_number);
      const paypalUrl=card.enabled===true?safeHttps(card.url):"";

      toggleMethod("promptpay",!!qrUrl);
      toggleMethod("bank_transfer",!!bankEnabled);
      toggleMethod("paypal_card",!!paypalUrl);

      const qr=chooser.querySelector("[data-method-qr]");
      if(qr&&qrUrl)qr.src=qrUrl;

      const bankName=chooser.querySelector("[data-method-bank-name]");
      const accountName=chooser.querySelector("[data-method-account-name]");
      if(bankName)bankName.textContent=clean(bank.bank_name_th||bank.bank_name_en||bank.provider)||"Bank Transfer";
      if(accountName)accountName.textContent=clean(bank.account_name_th||bank.account_name_en)||"MMD Privé";

      const cardBase=chooser.querySelector("[data-method-card-base]");
      const cardRate=chooser.querySelector("[data-method-card-rate]");
      const cardFee=chooser.querySelector("[data-method-card-fee]");
      const cardTotal=chooser.querySelector("[data-method-card-total]");
      const paypal=chooser.querySelector("[data-method-paypal]");
      if(cardBase)cardBase.textContent="฿"+money(card.service_amount_thb??data.amount_due_thb);
      if(cardRate)cardRate.textContent=money(card.fee_percent??4)+"%";
      if(cardFee)cardFee.textContent="+ ฿"+money(card.fee_thb);
      if(cardTotal)cardTotal.textContent="฿"+money(card.amount_due_thb);
      if(paypal&&paypalUrl)paypal.href=paypalUrl;

      const first=qrUrl?"promptpay":bankEnabled?"bank_transfer":paypalUrl?"paypal_card":"";
      if(!first)throw new Error("payment_destination_missing");
      setSelected(first);
      if(status)status.textContent="เลือกวิธีชำระเงินได้จาก 3 ช่องทางที่ MMD เปิดให้รายการนี้";
    }catch(e){
      chooser.querySelectorAll("[data-pay-method]").forEach(btn=>btn.hidden=true);
      chooser.querySelectorAll("[data-method-panel]").forEach(panel=>panel.hidden=true);
      if(status)status.textContent="ไม่สามารถโหลดช่องทางชำระเงินได้ กรุณาติดต่อ MMD";
    }
  }

  load();
})();