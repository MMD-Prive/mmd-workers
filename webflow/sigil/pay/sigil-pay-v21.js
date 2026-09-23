(function(){
  "use strict";

  var root=document.getElementById("sigil-pay-v21");
  if(!root||root.dataset.ready==="1")return;
  root.dataset.ready="1";

  var $=function(s){return root.querySelector(s);};
  var $$=function(s){return Array.from(root.querySelectorAll(s));};
  var clean=function(v){return String(v==null?"":v).trim();};
  var num=function(v){if(v===null||v===undefined||v==="")return null;var n=Number(v);return Number.isFinite(n)?n:null;};
  var money=function(v){
    var n=num(v);
    return n==null?"—":"฿"+n.toLocaleString("th-TH",{minimumFractionDigits:0,maximumFractionDigits:2});
  };
  var safeHttps=function(v){
    try{var u=new URL(clean(v));return u.protocol==="https:"?u.toString():"";}catch(e){return"";}
  };

  var API=clean(root.dataset.apiBase||"https://sigil.mmdbkk.com").replace(/\/+$/,"");
  var DETAILS=API+clean(root.dataset.detailsPath||"/v1/confirm/details");
  var INSTRUCTIONS=API+clean(root.dataset.instructionsPath||"/v1/confirm/payment-instructions");
  var PROOF=API+clean(root.dataset.proofPath||"/v1/pay/slip/evidence");
  var params=new URLSearchParams(location.search);
  var token=tokenFromUrl();
  var payment=null;
  var instructions=null;
  var proofFile=null;
  var objectUrl="";

  function tokenFromUrl(){
    var direct=clean(params.get("t"));
    if(direct)return direct;
    var state=clean(params.get("liff.state")||params.get("liff_state"));
    if(!state)return"";
    try{
      var decoded=decodeURIComponent(state).replace(/^\?/,"");
      return clean(new URLSearchParams(decoded).get("t"));
    }catch(e){return"";}
  }

  function text(sel,value){
    var el=$(sel);
    if(el)el.textContent=value==null?"":String(value);
  }

  function setHidden(sel,hidden){
    var el=$(sel);
    if(el)el.hidden=!!hidden;
  }

  function stageLabel(v){
    var s=clean(v).toLowerCase();
    if(s==="deposit")return"มัดจำ";
    if(s==="balance"||s==="final")return"ยอดคงเหลือ";
    if(s==="full")return"ชำระเต็มจำนวน";
    if(s==="membership")return"ค่าสมาชิก";
    return"ยอดที่ต้องชำระ";
  }

  function statusMeta(data){
    var p=data&&data.payment||{};
    if(p.verified===true){
      return{label:"ยืนยันยอดแล้ว",copy:"MMD ยืนยันยอดนี้เรียบร้อยแล้วครับ",lock:true};
    }
    if(p.proof_received===true){
      return{label:"กำลังตรวจสอบ",copy:"MMD ได้รับสลิปแล้วครับ ตอนนี้กำลังตรวจยอด ไม่ต้องส่งซ้ำ",lock:true};
    }
    return{label:"รอการชำระเงิน",copy:"ชำระแล้วส่งสลิปครั้งเดียว จากนั้น MMD จะตรวจยอดต่อให้ครับ",lock:false};
  }

  function formatDate(v){
    var raw=clean(v);
    if(!raw)return"MMD กำลังยืนยัน";
    var iso=/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw+"T12:00:00+07:00":raw;
    var d=new Date(iso);
    if(Number.isNaN(d.getTime()))return raw;
    try{
      return new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Bangkok"}).format(d);
    }catch(e){return raw;}
  }

  function formatTime(v){
    var raw=clean(v);
    if(!raw)return"";
    var d=new Date(raw);
    if(!Number.isNaN(d.getTime())){
      try{
        return new Intl.DateTimeFormat("th-TH",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Bangkok"}).format(d).replace(" น.","");
      }catch(e){}
    }
    var m=raw.match(/(?:T|\s)(\d{2}:\d{2})/);
    if(m)return m[1];
    var m2=raw.match(/^(\d{1,2}:\d{2})/);
    return m2?m2[1]:raw;
  }

  function serviceLabel(v){
    var raw=clean(v);
    if(!raw)return"Private Session";
    return raw.split(/[:|]/).map(function(part){
      var p=clean(part).replace(/[_-]+/g," ");
      var low=p.toLowerCase();
      if(low==="pn")return"PN";
      if(low==="vip")return"VIP";
      if(low==="svip")return"SVIP";
      if(low==="mms")return"MMS";
      return p.charAt(0).toUpperCase()+p.slice(1);
    }).filter(Boolean).join(" · ");
  }

  async function fetchJson(url,options){
    var controller=new AbortController();
    var timer=setTimeout(function(){controller.abort();},15000);
    try{
      var res=await fetch(url,Object.assign({
        cache:"no-store",
        credentials:"omit",
        signal:controller.signal
      },options||{}));
      var data=await res.json().catch(function(){return{};});
      if(!res.ok)throw new Error(clean(data.error||data.message)||("HTTP "+res.status));
      return data;
    }finally{
      clearTimeout(timer);
    }
  }

  function showError(title,message){
    text("[data-sp21-error-title]",title);
    text("[data-sp21-error-message]",message);
    setHidden("[data-sp21-loading]",true);
    setHidden("[data-sp21-content]",true);
    setHidden("[data-sp21-error]",false);
    root.removeAttribute("aria-busy");
  }

  function syncProofLock(meta){
    var form=$("[data-sp21-proof-form]");
    var state=$("[data-sp21-proof-state]");
    if(!form||!state)return;
    if(meta.lock){
      form.hidden=true;
      state.hidden=false;
      state.textContent=meta.copy;
    }else{
      form.hidden=false;
      state.hidden=true;
      state.textContent="";
    }
  }

  function renderDetails(data){
    payment=data;
    var p=data.payment||{};
    var pricing=data.pricing||{};
    var meta=statusMeta(data);
    var due=num(p.amount_due_thb);
    var net=num(pricing.net_price_thb);
    if(net==null)net=num(data.amount_thb);
    var full=num(pricing.full_price_thb);
    var discount=num(pricing.discount_thb);
    var balance=num(pricing.balance_thb);
    var stage=clean(p.stage||data.payment_type);

    text("[data-sp21-status]",meta.label);
    text("[data-sp21-amount]",due==null?"—":due.toLocaleString("th-TH",{maximumFractionDigits:2}));
    text("[data-sp21-stage]",stageLabel(stage));
    text("[data-sp21-payment-ref]",data.payment_ref||"—");
    text("[data-sp21-session-id]",data.session_id||"—");
    text("[data-sp21-client]",data.client_name||"MMD กำลังยืนยัน");
    text("[data-sp21-model]",data.model_name||"MMD กำลังยืนยัน");
    text("[data-sp21-model-initial]",clean(data.model_name||"M").charAt(0).toUpperCase()||"M");
    text("[data-sp21-service]",serviceLabel(data.job_type));
    text("[data-sp21-date]",formatDate(data.job_date));

    var start=formatTime(data.start_time);
    var end=formatTime(data.end_time);
    text("[data-sp21-time]",[start,end].filter(Boolean).join(" – ")||"MMD กำลังยืนยัน");
    text("[data-sp21-location]",data.location_name||"MMD กำลังยืนยัน");
    text("[data-sp21-net]",money(net));
    text("[data-sp21-due]",money(due));

    var map=$("[data-sp21-map]");
    var mapUrl=safeHttps(data.google_map_url);
    if(map){
      map.hidden=!mapUrl;
      if(mapUrl)map.href=mapUrl;
    }

    var fullRow=$("[data-sp21-full-row]");
    var discountRow=$("[data-sp21-discount-row]");
    var hasDiscount=full!=null&&net!=null&&full>net;
    if(fullRow){
      fullRow.hidden=!hasDiscount;
      if(hasDiscount)text("[data-sp21-full]",money(full));
    }
    if(discountRow){
      discountRow.hidden=!hasDiscount;
      if(hasDiscount){
        var pct=num(pricing.discount_percent);
        var diff=discount!=null?discount:(full-net);
        text("[data-sp21-discount]","- "+money(diff)+(pct!=null&&pct>0?" · "+pct+"%":""));
      }
    }

    var balanceRow=$("[data-sp21-balance-row]");
    var showBalance=balance!=null&&balance>=0&&stage.toLowerCase()==="deposit";
    if(balanceRow){
      balanceRow.hidden=!showBalance;
      if(showBalance)text("[data-sp21-balance]",money(balance));
    }

    syncProofLock(meta);
    setHidden("[data-sp21-loading]",true);
    setHidden("[data-sp21-error]",true);
    setHidden("[data-sp21-content]",false);
    root.removeAttribute("aria-busy");
  }

  function methodButton(name){
    return root.querySelector('[data-sp21-method="'+name+'"]');
  }

  function setMethodVisible(name,visible){
    var btn=methodButton(name);
    if(btn)btn.hidden=!visible;
  }

  function setMethod(name){
    $$("[data-sp21-method]").forEach(function(btn){
      var on=btn.dataset.sp21Method===name;
      btn.classList.toggle("is-active",on);
      btn.setAttribute("aria-selected",on?"true":"false");
    });
    $$("[data-sp21-panel]").forEach(function(panel){
      panel.hidden=panel.dataset.sp21Panel!==name;
    });
  }

  function methodUnavailable(message){
    var state=$("[data-sp21-method-state]");
    if(state){
      state.hidden=false;
      state.innerHTML="";
      var span=document.createElement("span");
      span.textContent=message||"ช่องทางชำระเงินยังไม่พร้อม กรุณาติดต่อ MMD";
      state.appendChild(span);
    }
    setHidden("[data-sp21-tabs]",true);
    $$("[data-sp21-panel]").forEach(function(panel){panel.hidden=true;});
  }

  function renderInstructions(data){
    instructions=data.instructions||{};
    var pp=instructions.promptpay||{};
    var bank=instructions.bank_transfer||{};
    var card=instructions.paypal_card||{};

    var ppOn=pp.enabled===true&&clean(pp.display_ref)!=="";
    var bankOn=bank.enabled===true&&clean(bank.account_number)!=="";
    var cardUrl=card.enabled===true?safeHttps(card.url):"";
    var cardOn=!!cardUrl;

    setMethodVisible("promptpay",ppOn);
    setMethodVisible("bank_transfer",bankOn);
    setMethodVisible("paypal_card",cardOn);

    var qr=$("[data-sp21-qr]");
    var qrFallback=$("[data-sp21-qr-fallback]");
    var qrUrl=ppOn?safeHttps(pp.qr_url):"";
    if(qr){
      qr.hidden=!qrUrl;
      if(qrUrl)qr.src=qrUrl;
    }
    if(qrFallback)qrFallback.hidden=!!qrUrl||!ppOn;

    text("[data-sp21-promptpay-ref]",pp.display_ref||"—");
    text("[data-sp21-promptpay-ref-inline]",pp.display_ref||"—");
    text("[data-sp21-bank-name]",bank.bank_name_th||bank.bank_name_en||bank.provider||"โอนธนาคาร");
    text("[data-sp21-account-name]",bank.account_name_th||bank.account_name_en||"MMD Privé");
    text("[data-sp21-card-rate]","+"+(num(card.fee_percent)!=null?num(card.fee_percent):4)+"%");
    text("[data-sp21-card-base]",money(card.service_amount_thb!=null?card.service_amount_thb:data.amount_due_thb));
    text("[data-sp21-card-fee]",card.fee_thb!=null?("+ "+money(card.fee_thb)):"—");
    text("[data-sp21-card-total]",money(card.amount_due_thb));

    var paypal=$("[data-sp21-paypal]");
    if(paypal&&cardUrl)paypal.href=cardUrl;

    var methods=[];
    if(ppOn)methods.push("promptpay");
    if(bankOn)methods.push("bank_transfer");
    if(cardOn)methods.push("paypal_card");

    if(!methods.length){
      methodUnavailable("ช่องทางชำระเงินยังไม่พร้อม กรุณาติดต่อ MMD");
      return;
    }

    var state=$("[data-sp21-method-state]");
    if(state)state.hidden=true;
    setHidden("[data-sp21-tabs]",false);
    setMethod(methods[0]);
  }

  async function loadInstructions(){
    try{
      var data=await fetchJson(INSTRUCTIONS,{
        method:"POST",
        headers:{"Accept":"application/json","Content-Type":"application/json"},
        body:JSON.stringify({t:token})
      });

      if(
        data.ok!==true||
        data.authority!=="payments-worker"||
        data.schema!=="mmd_payment_instructions_v1"
      )throw new Error("payment_instructions_invalid");

      if(data.available!==true){
        var reason=clean(data.reason);
        var msg=
          reason==="proof_received_waiting_verification"?"MMD ได้รับสลิปแล้วครับ ตอนนี้กำลังตรวจยอด":
          reason==="payment_verified"?"ยอดนี้ได้รับการยืนยันแล้วครับ":
          reason==="payment_not_accepting"?"รายการนี้ยังไม่เปิดรับการชำระเงิน":
          reason==="no_amount_due"?"รายการนี้ไม่มียอดค้างชำระ":
          "ช่องทางชำระเงินยังไม่พร้อม กรุณาติดต่อ MMD";
        methodUnavailable(msg);
        return;
      }

      renderInstructions(data);
    }catch(e){
      methodUnavailable("โหลดช่องทางชำระเงินไม่สำเร็จครับ กรุณาทัก MMD เพื่อเช็กก่อนชำระ");
    }
  }

  async function load(){
    root.setAttribute("aria-busy","true");
    setHidden("[data-sp21-loading]",false);
    setHidden("[data-sp21-error]",true);
    setHidden("[data-sp21-content]",true);

    if(!token){
      showError(
        "เปิดจากลิงก์ชำระของรายการนี้ครับ",
        "หน้านี้ต้องใช้ Customer Payment Link ที่ MMD ส่งให้ หากไม่มีลิงก์ ทัก MMD ได้เลยครับ"
      );
      return;
    }

    try{
      var data=await fetchJson(DETAILS,{
        method:"POST",
        headers:{"Accept":"application/json","Content-Type":"application/json"},
        body:JSON.stringify({t:token,expected_role:"customer"})
      });

      if(
        data.ok!==true||
        data.authority!=="payments-worker"||
        data.schema!=="confirmation_details_v1"||
        data.role!=="customer"
      )throw new Error("confirmation_details_invalid");

      renderDetails(data);
      loadInstructions();
    }catch(e){
      var code=clean(e&&e.message);
      var msg=
        code==="confirmation_token_expired"?"ลิงก์นี้หมดอายุแล้วครับ ทัก MMD เพื่อรับลิงก์ล่าสุดได้เลย":
        code==="session_not_found"?"ยังไม่พบรายการที่ผูกกับลิงก์นี้ครับ กรุณาทัก MMD":
        code==="origin_not_allowed"?"หน้าชำระนี้ยังไม่ได้รับสิทธิ์เชื่อมต่อ กรุณาทัก MMD":
        "MMD ยังเปิดรายละเอียดของรายการนี้ไม่ได้ครับ กรุณาลองลิงก์ล่าสุดหรือติดต่อ MMD";
      showError("เปิดรายการนี้ไม่ได้ครับ",msg);
    }
  }

  $$("[data-sp21-method]").forEach(function(btn){
    btn.addEventListener("click",function(){setMethod(btn.dataset.sp21Method);});
  });

  var reveal=$("[data-sp21-bank-reveal]");
  var copy=$("[data-sp21-bank-copy]");
  var bankRevealed=false;

  if(reveal)reveal.addEventListener("click",function(){
    var account=clean(instructions&&instructions.bank_transfer&&instructions.bank_transfer.account_number);
    if(!account)return;
    bankRevealed=!bankRevealed;
    text("[data-sp21-account-number]",bankRevealed?account:"••••••••••");
    reveal.textContent=bankRevealed?"ซ่อนเลขบัญชี":"ดูเลขบัญชี";
    if(copy)copy.disabled=!bankRevealed;
  });

  if(copy)copy.addEventListener("click",async function(){
    var account=clean(instructions&&instructions.bank_transfer&&instructions.bank_transfer.account_number);
    if(!account)return;
    try{
      await navigator.clipboard.writeText(account);
      copy.textContent="คัดลอกแล้ว";
      setTimeout(function(){copy.textContent="คัดลอกเลขบัญชี";},1300);
    }catch(e){}
  });

  var fileInput=$("[data-sp21-file]");
  var consent=$("[data-sp21-consent]");
  var submit=$("[data-sp21-submit]");

  function syncSubmit(){
    if(submit)submit.disabled=!(proofFile&&consent&&consent.checked);
  }

  function clearPreview(){
    if(objectUrl){
      URL.revokeObjectURL(objectUrl);
      objectUrl="";
    }
    var prev=$("[data-sp21-preview]");
    if(prev){
      prev.innerHTML="";
      prev.textContent="FILE";
    }
  }

  if(fileInput)fileInput.addEventListener("change",function(){
    var f=fileInput.files&&fileInput.files[0];
    if(!f)return;

    var allowed=["image/jpeg","image/png","image/webp","application/pdf"];
    if(!allowed.includes(f.type)||f.size>10*1024*1024){
      fileInput.value="";
      proofFile=null;
      alert("ใช้ไฟล์ JPG, PNG, WEBP หรือ PDF ขนาดไม่เกิน 10 MB ครับ");
      syncSubmit();
      return;
    }

    proofFile=f;
    text("[data-sp21-file-name]",f.name);
    text("[data-sp21-file-size]",(f.size/1024/1024).toFixed(2)+" MB");
    setHidden("[data-sp21-file-card]",false);
    clearPreview();

    var prev=$("[data-sp21-preview]");
    if(prev&&f.type.indexOf("image/")===0){
      objectUrl=URL.createObjectURL(f);
      var img=document.createElement("img");
      img.src=objectUrl;
      img.alt="ตัวอย่างสลิป";
      prev.textContent="";
      prev.appendChild(img);
    }
    syncSubmit();
  });

  var remove=$("[data-sp21-file-remove]");
  if(remove)remove.addEventListener("click",function(){
    proofFile=null;
    if(fileInput)fileInput.value="";
    setHidden("[data-sp21-file-card]",true);
    clearPreview();
    syncSubmit();
  });

  if(consent)consent.addEventListener("change",syncSubmit);

  if(submit)submit.addEventListener("click",async function(){
    if(!payment||!proofFile||!consent||!consent.checked)return;

    submit.disabled=true;
    text("[data-sp21-submit-label]","กำลังส่งสลิปครับ");
    text("[data-sp21-submit-status]","กำลังผูกหลักฐานกับรายการนี้");

    var fd=new FormData();
    fd.append("payment_ref",clean(payment.payment_ref));
    fd.append("session_id",clean(payment.session_id));
    fd.append("payment_type",clean(payment.payment&&payment.payment.stage||payment.payment_type||"full"));
    fd.append("payment_stage",clean(payment.payment&&payment.payment.stage||payment.payment_type||"full"));
    fd.append("proof_type","payment_slip");
    fd.append("source_page","sigil_pay_v21");
    fd.append("t",token);
    fd.append("file",proofFile);
    fd.append("note",clean(($("[data-sp21-note]")||{}).value));

    try{
      var res=await fetch(PROOF,{method:"POST",body:fd,cache:"no-store",credentials:"omit"});
      var data=await res.json().catch(function(){return{};});
      if(!res.ok||data.ok===false)throw new Error(clean(data.error||data.message)||"proof_submit_failed");

      var form=$("[data-sp21-proof-form]");
      var state=$("[data-sp21-proof-state]");
      if(form)form.hidden=true;
      if(state){
        state.hidden=false;
        state.textContent="ได้รับสลิปแล้วครับ · เดี๋ยว MMD ดูแลต่อให้";
      }
      text("[data-sp21-status]","กำลังตรวจสอบ");
      methodUnavailable("MMD ได้รับสลิปแล้วครับ ตอนนี้กำลังตรวจยอด");
      text("[data-sp21-submit-status]","");
    }catch(e){
      text("[data-sp21-submit-status]","ส่งสลิปไม่สำเร็จครับ กรุณาลองอีกครั้งหรือติดต่อ MMD");
      submit.disabled=false;
      text("[data-sp21-submit-label]","ส่งสลิปให้ MMD");
    }
  });

  var retry=$("[data-sp21-retry]");
  if(retry)retry.addEventListener("click",load);

  window.addEventListener("beforeunload",clearPreview);
  load();
})();