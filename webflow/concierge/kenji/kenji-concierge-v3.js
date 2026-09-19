<script>
(function(){
  "use strict";

  var root=document.getElementById("kenji-concierge-v3");
  if(!root||root.dataset.initialized==="true")return;
  root.dataset.initialized="true";
  root.classList.add("js");

  var config={
    endpoint:root.dataset.profileEndpoint||"",
    chat:root.dataset.chatUrl||"/member/kenji-ai-20",
    verify:root.dataset.verifyUrl||"/member/my-mmd",
    booking:root.dataset.bookingUrl||"/booking",
    recovery:root.dataset.recoveryUrl||"/recovery"
  };

  var ui={
    card:root.querySelector("[data-kj3-status-card]"),
    title:root.querySelector("[data-kj3-status-title]"),
    copy:root.querySelector("[data-kj3-status-copy]"),
    retry:root.querySelector("[data-kj3-retry]"),
    primary:root.querySelectorAll("[data-kj3-primary],[data-kj3-footer]"),
    privateLinks:root.querySelectorAll("[data-kj3-private]"),
    branchbar:root.querySelector("[data-kj3-branchbar]"),
    current:root.querySelector("[data-kj3-current]"),
    progress:root.querySelector("[data-kj3-progress]"),
    previous:root.querySelector("[data-kj3-prev]"),
    next:root.querySelector("[data-kj3-next]"),
    sheet:root.querySelector("[data-kj3-sheet]"),
    sheetPanel:root.querySelector("[data-kj3-sheet-panel]"),
    branchBack:root.querySelector("[data-kj3-branch-back]"),
    sheetStatus:root.querySelector("[data-kj3-sheet-status]")
  };

  var controller=null;
  var statusMode="loading";
  var activeChapter=0;
  var lastFocused=null;
  var touchStartY=0;
  var chapters=[
    {id:"kj3-overview",label:"ภาพรวม"},
    {id:"kj3-actions",label:"เริ่มเรื่อง"},
    {id:"kj3-intelligence",label:"วิธีคิด"},
    {id:"kj3-standard",label:"มาตรฐาน"},
    {id:"kj3-faq",label:"ก่อนเริ่ม"},
    {id:"kj3-care",label:"Private Care"}
  ];

  function setLinks(selector,url){
    root.querySelectorAll(selector).forEach(function(link){link.href=url});
  }

  function setDisabled(nodes,disabled){
    nodes.forEach(function(link){
      if(disabled){link.setAttribute("aria-disabled","true");link.tabIndex=-1}
      else{link.removeAttribute("aria-disabled");link.removeAttribute("tabindex")}
    });
  }

  setLinks("[data-kj3-membership]",config.verify);
  setLinks("[data-kj3-booking]",config.booking);
  setLinks("[data-kj3-recovery]",config.recovery);

  function setState(mode,heading,message,retryable){
    statusMode=mode;
    root.dataset.memberMode=mode;
    ui.card.dataset.state=mode;
    ui.card.setAttribute("aria-busy",mode==="loading"?"true":"false");
    ui.title.textContent=heading;
    ui.copy.textContent=message;
    ui.retry.hidden=!retryable;

    var active=mode==="active";
    var waiting=mode==="loading"||mode==="pending"||mode==="blocked";
    var destination=active?config.chat:config.verify;

    ui.primary.forEach(function(link){link.href=destination});
    ui.privateLinks.forEach(function(link){link.href=destination});
    setDisabled(ui.primary,waiting);
    setDisabled(ui.privateLinks,waiting);

    var hero=root.querySelector("[data-kj3-primary] span");
    if(hero)hero.textContent=active?"พร้อมครับ ให้ผมพาไปต่อ":mode==="pending"?"กำลังยืนยันสถานะ":"ให้ผมตรวจสอบสิทธิ์";

    ui.sheetStatus.textContent=active?"ACCESS VERIFIED · พร้อมเริ่มกับ Kenji":mode==="pending"?"MMD กำลังตรวจสอบสถานะ":"เชื่อม MY MMD เพื่อเปิดเส้นทางที่ตรงกับสิทธิ์";
  }

  function clean(value){return typeof value==="string"?value.trim():""}

  function normalize(payload){
    var profile=payload&&typeof payload==="object"?(payload.profile||payload.data||payload):{};
    var membership=profile.membership&&typeof profile.membership==="object"?profile.membership:{};
    var accessObject=membership.access&&typeof membership.access==="object"?membership.access:{};
    var access=clean(accessObject.value||accessObject.status||membership.access).toLowerCase();
    var status=clean(membership.status||profile.membership_status||profile.status||profile.member_status).toLowerCase();
    var tier=clean(membership.level||profile.membership_tier||profile.tier||profile.level);
    var expiry=clean(membership.activeThrough||membership.active_through||membership.expiresAt||profile.active_through||profile.activeThrough||profile.expires_at||profile.expiry_date);
    if(["blocked","denied","suspended","revoked","none","inactive"].includes(access))return{mode:"blocked"};
    if(["pending","pending_review","review","checking","unknown"].includes(access))return{mode:"pending"};
    if(["blocked","suspended","revoked","forbidden"].includes(status))return{mode:"blocked"};
    if(["pending","pending_review","review","waiting"].includes(status))return{mode:"pending"};
    if(["active","verified","current","approved"].includes(status))return{mode:"active",tier:tier,expiry:expiry};
    if(["expired","inactive","former_member","cancelled"].includes(status))return{mode:"expired"};
    return{mode:"guest"};
  }

  function thaiDate(value){
    if(!value)return"";
    var date=new Date(value);
    if(Number.isNaN(date.getTime()))return"";
    try{return new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"numeric"}).format(date)}catch(error){return""}
  }

  function render(profile){
    if(profile.mode==="active"){
      var expiry=thaiDate(profile.expiry);
      setState("active","ACCESS VERIFIED"+(profile.tier?" · "+profile.tier:""),expiry?"พร้อมใช้งานถึง "+expiry+" · บอกผมได้เลยว่าต้องการอะไร":"สิทธิ์พร้อม · บอกผมได้เลยว่าต้องการอะไร",false);
      return;
    }
    if(profile.mode==="pending"){
      setState("pending","REVIEW IN PROGRESS","ผมจะเปิดเส้นทางส่วนตัวเมื่อข้อมูลผ่านการยืนยันแล้ว",false);
      return;
    }
    if(profile.mode==="blocked"){
      setState("blocked","PRIVATE ACCESS ON HOLD","ผมจะไม่เปิดข้อมูลหรือเส้นทางส่วนตัวจนกว่าสถานะจะพร้อม",false);
      return;
    }
    if(profile.mode==="expired"){
      setState("expired","RENEWAL REQUIRED","ต่ออายุใน MY MMD แล้วกลับมาให้ผมตรวจอีกครั้ง",false);
      return;
    }
    setState("guest","CONNECT MY MMD","ยืนยันตัวตนครั้งเดียว แล้วผมจะอ่านสิทธิ์ที่ถูกต้องให้คุณ",false);
  }

  function loadProfile(){
    if(!config.endpoint){
      setState("error","STATUS UNAVAILABLE","ยังไม่ได้กำหนด Profile Endpoint",false);
      return;
    }

    if(controller)controller.abort();
    controller=new AbortController();
    setState("loading","READING MEMBER SIGNAL","กำลังเชื่อมสถานะจริงจาก MY MMD",false);
    var timeout=setTimeout(function(){controller.abort()},8000);

    fetch(config.endpoint,{method:"GET",credentials:"include",headers:{Accept:"application/json"},signal:controller.signal})
      .then(function(response){
        if(response.status===401||response.status===403)return{unauthenticated:true};
        if(!response.ok)throw new Error("HTTP_"+response.status);
        return response.text().then(function(body){
          if(!body)return{};
          try{return JSON.parse(body)}catch(error){throw new Error("INVALID_JSON")}
        });
      })
      .then(function(data){render(data.unauthenticated?{mode:"guest"}:normalize(data))})
      .catch(function(error){
        setState("error",error.name==="AbortError"?"CONNECTION TIMEOUT":"STATUS UNAVAILABLE","ข้อมูลยังไม่พร้อม ผมจะไม่เดาสิทธิ์ให้คุณ",true);
      })
      .finally(function(){clearTimeout(timeout)});
  }

  ui.retry.addEventListener("click",loadProfile);

  root.addEventListener("click",function(event){
    var disabledLink=event.target.closest("a[aria-disabled='true']");
    if(disabledLink&&root.contains(disabledLink))event.preventDefault();
  });

  root.querySelectorAll(".kj3-disclosure").forEach(function(item,unused,items){
    item.addEventListener("toggle",function(){
      if(item.open)items.forEach(function(other){if(other!==item)other.open=false});
    });
  });

  var reveals=root.querySelectorAll(".kj3-reveal");
  if("IntersectionObserver" in window&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches){
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target)}
      });
    },{threshold:.12,rootMargin:"0px 0px -7% 0px"});
    reveals.forEach(function(item){observer.observe(item)});
  }else{
    reveals.forEach(function(item){item.classList.add("is-visible")});
  }

  function updateBranchbar(){
    var visible=window.scrollY>Math.min(window.innerHeight*.58,520);
    root.classList.toggle("is-branchbar-visible",visible);
  }

  function setChapter(index){
    activeChapter=Math.max(0,Math.min(index,chapters.length-1));
    ui.current.textContent=chapters[activeChapter].label;
    ui.progress.textContent=String(activeChapter+1).padStart(2,"0")+" / "+String(chapters.length).padStart(2,"0");
    ui.previous.disabled=activeChapter===0;
    ui.next.disabled=activeChapter===chapters.length-1;
  }

  function goToChapter(index,pushHash){
    setChapter(index);
    var target=document.getElementById(chapters[activeChapter].id);
    if(!target)return;
    if(pushHash&&history.pushState)history.pushState(null,"","#"+chapters[activeChapter].id);
    target.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
    closeSheet(false);
  }

  function showSheetView(name){
    root.querySelectorAll("[data-kj3-sheet-view]").forEach(function(view){
      var selected=view.dataset.kj3SheetView===name;
      view.classList.toggle("is-active",selected);
      view.setAttribute("aria-hidden",selected?"false":"true");
    });
    ui.branchBack.hidden=name==="main";
  }

  function sheetFocusables(){
    return Array.from(ui.sheetPanel.querySelectorAll("button:not([hidden]):not([disabled]),a[href]:not([aria-disabled='true'])"));
  }

  function openSheet(){
    lastFocused=document.activeElement;
    showSheetView("main");
    ui.sheet.classList.add("is-open");
    ui.sheet.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
    var first=sheetFocusables()[0];
    if(first)setTimeout(function(){first.focus()},30);
  }

  function closeSheet(returnFocus){
    ui.sheet.classList.remove("is-open");
    ui.sheet.setAttribute("aria-hidden","true");
    document.body.style.removeProperty("overflow");
    if(returnFocus!==false&&lastFocused&&typeof lastFocused.focus==="function")lastFocused.focus();
  }

  root.querySelector("[data-kj3-menu-open]").addEventListener("click",openSheet);
  root.querySelectorAll("[data-kj3-menu-close]").forEach(function(button){button.addEventListener("click",function(){closeSheet(true)})});
  ui.branchBack.addEventListener("click",function(){showSheetView("main")});
  root.querySelectorAll("[data-kj3-branch]").forEach(function(button){button.addEventListener("click",function(){showSheetView(button.dataset.kj3Branch)})});
  root.querySelectorAll("[data-kj3-goto]").forEach(function(button){
    button.addEventListener("click",function(){
      var index=chapters.findIndex(function(chapter){return chapter.id===button.dataset.kj3Goto});
      if(index>=0)goToChapter(index,true);
    });
  });
  ui.previous.addEventListener("click",function(){goToChapter(activeChapter-1,true)});
  ui.next.addEventListener("click",function(){goToChapter(activeChapter+1,true)});

  ui.sheet.addEventListener("keydown",function(event){
    if(event.key==="Escape"){closeSheet(true);return}
    if(event.key!=="Tab")return;
    var focusables=sheetFocusables();
    if(!focusables.length)return;
    var first=focusables[0],last=focusables[focusables.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  });
  ui.sheetPanel.addEventListener("touchstart",function(event){touchStartY=event.changedTouches[0].clientY},{passive:true});
  ui.sheetPanel.addEventListener("touchend",function(event){if(event.changedTouches[0].clientY-touchStartY>90)closeSheet(true)},{passive:true});

  if("IntersectionObserver" in window){
    var chapterObserver=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          var index=chapters.findIndex(function(chapter){return chapter.id===entry.target.id});
          if(index>=0)setChapter(index);
        }
      });
    },{rootMargin:"-22% 0px -62% 0px",threshold:0});
    chapters.forEach(function(chapter){var section=document.getElementById(chapter.id);if(section)chapterObserver.observe(section)});
  }

  var hashIndex=chapters.findIndex(function(chapter){return "#"+chapter.id===window.location.hash});
  setChapter(hashIndex>=0?hashIndex:0);
  window.addEventListener("scroll",updateBranchbar,{passive:true});
  updateBranchbar();
  loadProfile();
})();
</script>
