
(function(){
  "use strict";

  var root=document.getElementById("mmd-public-membership");
  if(!root||root.dataset.membershipV7Init==="1")return;
  root.dataset.membershipV7Init="1";

  var ui=root.querySelector("[data-public-membership-ui]");
  if(!ui)return;

  var status=ui.querySelector("[data-public-status]");
  var buttons=[].slice.call(ui.querySelectorAll("[data-buy]"));
  var API="/member/api/liff/public-membership";
  var MINIAPP="https://miniapp.line.me/2010862595-yT4DCEMc/";
  var packageNames={mmd_member:"MMD Member",elite:"Elite",red_card:"Red Card"};
  var reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function show(message,tone){
    if(!status)return;
    status.hidden=!message;
    status.textContent=message||"";
    if(tone)status.setAttribute("data-tone",tone);
    else status.removeAttribute("data-tone");
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
    }catch(error){
      return null;
    }
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
    }finally{
      if(timer)clearTimeout(timer);
    }
  }

  async function loadCatalog(){
    var result=await fetchJson(API+"/catalog",{
      credentials:"include",
      headers:{accept:"application/json"}
    },10000);

    if(!result.response.ok||!result.payload||result.payload.ok!==true||!Array.isArray(result.payload.packages)){
      throw new Error("catalog_unavailable");
    }

    result.payload.packages.forEach(function(item){
      var cards=[].slice.call(ui.querySelectorAll('[data-package="'+item.package_code+'"]'));
      cards.forEach(function(card){
        var price=card.querySelector("[data-price]");
        var term=card.querySelector("[data-term]");
        var small=card.querySelector(".mmd7-buy small");
        var years=Number(item.duration_days)>=700?2:1;
        if(price)price.textContent=money(item.amount_thb);
        if(term)term.textContent=years+" YEAR"+(years>1?"S":"");
        if(small)small.textContent=money(item.amount_thb)+" THB · "+years+" YEAR"+(years>1?"S":"");
      });
    });
  }

  async function buy(code,button){
    if(!code||button.disabled)return;

    var name=packageNames[code]||"Membership";
    setBusy(true);
    show("เลือก "+name+" แล้วครับ — เดี๋ยวผมเช็ก LINE และเตรียมหน้าชำระของรายการนี้ให้","soft");

    try{
      var result=await fetchJson(API+"/purchase",{
        method:"POST",
        credentials:"include",
        headers:{
          accept:"application/json",
          "content-type":"application/json"
        },
        body:JSON.stringify({package_code:code})
      },15000);

      var response=result.response;
      var payload=result.payload;

      if(response.status===401&&payload&&payload.error&&payload.error.code==="LINE_SESSION_REQUIRED"){
        show("ผมขอให้ยืนยัน LINE ก่อนครั้งเดียวครับ แล้วจะพากลับมาที่ "+name+" ต่อให้","soft");
        location.assign(authUrl(code));
        return;
      }

      if(!response.ok||!payload||payload.ok!==true){
        throw new Error(payload&&payload.error&&payload.error.code||"payment_unavailable");
      }

      var pay=safePay(payload.redirect_to||payload.customer_payment_url);
      if(!pay)throw new Error("payment_link_invalid");

      show("เรียบร้อยครับ กำลังพาไปหน้าชำระของ "+name+"…","soft");
      location.assign(pay.toString());
    }catch(error){
      if(error&&error.name==="AbortError"){
        show("ใช้เวลานานกว่าปกติครับ ลองกดอีกครั้งได้เลย หรือทัก MMD ทาง LINE แล้วผมช่วยต่อให้","error");
      }else{
        show("ตอนนี้ผมยังพาไปหน้าชำระไม่ได้ครับ ลองใหม่อีกครั้ง หรือทัก MMD ทาง LINE ได้เลย","error");
      }
      setBusy(false);
    }
  }

  buttons.forEach(function(button){
    button.addEventListener("click",function(){
      buy(button.getAttribute("data-buy"),button);
    });
  });

  loadCatalog().then(function(){
    var code=new URL(location.href).searchParams.get("package");
    var selected=code&&ui.querySelector('[data-package="'+code+'"]');
    if(selected){
      show("กลับมาที่ "+(packageNames[code]||"Membership")+" แล้วครับ เลือกต่อได้เลย","soft");
      selected.scrollIntoView({behavior:reduceMotion?"auto":"smooth",block:"center"});
    }
  }).catch(function(){
    show("ตอนนี้ผมยังเช็กแพ็กเกจจาก MMD ไม่ได้ครับ เลยขอพักปุ่มชำระไว้ก่อน ลองใหม่อีกครั้งหรือทัก LINE ได้เลย","error");
    setBusy(true);
  });

  var chapters=[
    {id:"start",label:"เริ่ม"},
    {id:"membership",label:"เลือก Membership"},
    {id:"red-card",label:"Red Card"},
    {id:"tmib",label:"TMIB"},
    {id:"process",label:"ก่อนชำระ"},
    {id:"continue",label:"ไปต่อ"}
  ];

  var openBtn=ui.querySelector("[data-branch-open]");
  var sheet=ui.querySelector("#mmd7-branch-sheet");
  var current=ui.querySelector("[data-branch-current]");
  var progress=ui.querySelector("[data-branch-progress]");
  var lastFocus=null;
  var active=0;

  function setActive(index){
    active=Math.max(0,Math.min(chapters.length-1,index));
    if(current)current.textContent=chapters[active].label;
    if(progress)progress.textContent=String(active+1).padStart(2,"0")+" / "+String(chapters.length).padStart(2,"0");
  }

  function openSheet(){
    if(!sheet)return;
    lastFocus=document.activeElement;
    sheet.hidden=false;
    var close=sheet.querySelector("[data-branch-close]");
    if(close)close.focus();
  }

  function closeSheet(){
    if(!sheet)return;
    sheet.hidden=true;
    if(lastFocus&&lastFocus.focus)lastFocus.focus();
  }

  function goTo(index){
    var target=chapters[index];
    var node=target&&document.getElementById(target.id);
    if(!node)return;
    location.hash=target.id;
    node.scrollIntoView({behavior:reduceMotion?"auto":"smooth",block:"start"});
  }

  if(openBtn){
    openBtn.addEventListener("click",function(event){
      var rect=openBtn.getBoundingClientRect();
      var x=event.clientX-rect.left;
      if(event.clientX&&x>rect.width*.78){
        goTo((active+1)%chapters.length);
      }else{
        openSheet();
      }
    });
  }

  if(sheet){
    sheet.addEventListener("click",function(event){
      if(event.target.closest("[data-branch-close]")){
        closeSheet();
        return;
      }
      if(event.target.closest("[data-branch-link]"))closeSheet();
    });
  }

  document.addEventListener("keydown",function(event){
    if(event.key==="Escape"&&sheet&&!sheet.hidden)closeSheet();
  });

  if("IntersectionObserver" in window){
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(!entry.isIntersecting)return;
        var index=chapters.findIndex(function(chapter){return chapter.id===entry.target.id});
        if(index>-1)setActive(index);
      });
    },{rootMargin:"-28% 0px -58% 0px",threshold:0});

    chapters.forEach(function(chapter){
      var element=document.getElementById(chapter.id);
      if(element)observer.observe(element);
    });
  }

  var hash=location.hash&&location.hash.slice(1);
  var initialIndex=chapters.findIndex(function(chapter){return chapter.id===hash});
  setActive(initialIndex>-1?initialIndex:0);
})();
