(function(){
  "use strict";
  var root=document.getElementById("mmd-public-membership");
  if(!root||root.dataset.compactV9Init==="1")return;
  root.dataset.compactV9Init="1";
  var ui=root.querySelector("[data-public-membership-ui]");
  if(!ui)return;

  var API="/member/api/liff/public-membership";
  var MINIAPP="https://miniapp.line.me/2010862595-yT4DCEMc/";
  var names={mmd_member:"MMD Member",elite:"Elite",red_card:"Red Card"};
  var status=ui.querySelector("[data-public-status]");
  var buttons=[].slice.call(ui.querySelectorAll("[data-buy]"));
  var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function show(message,tone){
    if(!status)return;
    status.hidden=!message;
    status.textContent=message||"";
    if(tone)status.setAttribute("data-tone",tone);else status.removeAttribute("data-tone");
  }
  function money(value){
    var n=Number(value);
    return Number.isFinite(n)?n.toLocaleString("th-TH"):"";
  }
  function setBusy(value){
    buttons.forEach(function(button){
      button.disabled=value;
      button.setAttribute("aria-busy",value?"true":"false");
    });
  }
  function returnPath(code){
    var params=new URLSearchParams(location.search);
    params.delete("t");
    params.set("package",code);
    var qs=params.toString();
    return location.pathname+(qs?"?"+qs:"");
  }
  function authUrl(code){
    var url=new URL(MINIAPP);
    url.searchParams.set("intent","status");
    url.searchParams.set("return_to",returnPath(code));
    return url.toString();
  }
  function safePay(value){
    try{
      var url=new URL(value,location.origin);
      var keys=[].slice.call(url.searchParams.keys());
      if(url.protocol!=="https:")return null;
      if(url.hostname!=="mmdbkk.com")return null;
      if(url.pathname!=="/pay/checkout")return null;
      if(keys.length!==1||keys[0]!=="t"||!url.searchParams.get("t"))return null;
      return url;
    }catch(error){return null;}
  }
  async function fetchJson(url,options,timeoutMs){
    var controller="AbortController" in window?new AbortController():null;
    var timer=controller?setTimeout(function(){controller.abort()},timeoutMs):null;
    var opts=Object.assign({},options||{});
    if(controller)opts.signal=controller.signal;
    try{
      var response=await fetch(url,opts);
      var payload=await response.json().catch(function(){return null});
      return {response:response,payload:payload};
    }finally{if(timer)clearTimeout(timer);}
  }
  async function loadCatalog(){
    var result=await fetchJson(API+"/catalog",{credentials:"include",headers:{accept:"application/json"}},10000);
    if(!result.response.ok||!result.payload||result.payload.ok!==true||!Array.isArray(result.payload.packages))throw new Error("catalog_unavailable");
    result.payload.packages.forEach(function(item){
      var cards=[].slice.call(ui.querySelectorAll('[data-package="'+item.package_code+'"]'));
      cards.forEach(function(card){
        var price=card.querySelector("[data-price]");
        var term=card.querySelector("[data-term]");
        var small=card.querySelector(".m9-buy small");
        var years=Number(item.duration_days)>=700?2:1;
        if(price)price.textContent=money(item.amount_thb);
        if(term)term.textContent=years+" YEAR"+(years>1?"S":"");
        if(small)small.textContent=money(item.amount_thb)+" THB · "+years+" YEAR"+(years>1?"S":"");
      });
    });
  }
  async function buy(code,button){
    if(!code||button.disabled)return;
    var name=names[code]||"Membership";
    setBusy(true);
    show("เลือก "+name+" แล้วครับ — ผมกำลังเช็ก LINE และเตรียมรายการจริงให้","soft");
    try{
      var result=await fetchJson(API+"/purchase",{
        method:"POST",
        credentials:"include",
        headers:{accept:"application/json","content-type":"application/json"},
        body:JSON.stringify({package_code:code})
      },15000);
      var response=result.response;
      var payload=result.payload;
      if(response.status===401&&payload&&payload.error&&payload.error.code==="LINE_SESSION_REQUIRED"){
        show("ขอยืนยัน LINE ครั้งเดียวครับ แล้วผมจะพากลับมาต่อที่ "+name,"soft");
        location.assign(authUrl(code));
        return;
      }
      if(!response.ok||!payload||payload.ok!==true)throw new Error(payload&&payload.error&&payload.error.code||"payment_unavailable");
      var pay=safePay(payload.redirect_to||payload.customer_payment_url);
      if(!pay)throw new Error("payment_link_invalid");
      show("เรียบร้อยครับ กำลังพาไปหน้าชำระของ "+name+"…","soft");
      location.assign(pay.toString());
    }catch(error){
      if(error&&error.name==="AbortError"){
        show("ใช้เวลานานกว่าปกติครับ ลองอีกครั้งได้เลย หรือทักผมทาง LINE แล้วผมช่วยต่อให้","error");
      }else{
        show("ตอนนี้ผมยังพาไปหน้าชำระไม่ได้ครับ ลองอีกครั้ง หรือทักผมทาง LINE ได้เลย","error");
      }
      setBusy(false);
    }
  }

  buttons.forEach(function(button){
    button.addEventListener("click",function(){buy(button.getAttribute("data-buy"),button);});
  });

  loadCatalog().then(function(){
    var code=new URL(location.href).searchParams.get("package");
    var selected=code&&ui.querySelector('[data-package="'+code+'"]');
    if(selected){
      show("กลับมาที่ "+(names[code]||"Membership")+" แล้วครับ เลือกต่อได้เลย","soft");
      selected.scrollIntoView({behavior:reduce?"auto":"smooth",block:"nearest",inline:"center"});
    }
  }).catch(function(){
    show("ตอนนี้ผมยังเช็กแพ็กเกจจาก MMD ไม่ได้ครับ เลยพักปุ่มชำระไว้ก่อน ลองใหม่อีกครั้งหรือทัก LINE ได้เลย","error");
    setBusy(true);
  });

  var red=[
    ["https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaedb2b7ded0efcbe020cf5_HIRO%20on%20REDC.webp","HIRO on MMD Privé Red Card"],
    ["https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaedb2b2571b68a1a4184e1_HIMA%20on%20REDC.webp","HIMA on MMD Privé Red Card"],
    ["https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaedb2bbf0413984312e4e3_HIEI%20on%20REDC.webp","HIEI on MMD Privé Red Card"],
    ["https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaedb2b188600ff4a912cf1_HITO%20on%20REDC.webp","HITO on MMD Privé Red Card"]
  ];
  var redImg=ui.querySelector("[data-random-red]");
  if(redImg){
    var pick=red[Math.floor(Math.random()*red.length)];
    redImg.removeAttribute("srcset");
    redImg.src=pick[0];
    redImg.alt=pick[1];
  }

  var details=[].slice.call(ui.querySelectorAll(".m9-acc"));
  details.forEach(function(item){
    item.addEventListener("toggle",function(){
      if(!item.open)return;
      details.forEach(function(other){if(other!==item&&other.open)other.open=false;});
    });
  });

  var reveals=[].slice.call(ui.querySelectorAll(".m9-reveal"));
  if(reduce||!("IntersectionObserver" in window)){
    reveals.forEach(function(el){el.classList.add("is-in");});
  }else{
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){entry.target.classList.add("is-in");observer.unobserve(entry.target);}
      });
    },{rootMargin:"0px 0px -8% 0px",threshold:.08});
    reveals.forEach(function(el){observer.observe(el);});
  }
})();
