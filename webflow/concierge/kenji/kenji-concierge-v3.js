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
    dock:root.querySelector("[data-kj3-dock]"),
    dockLabel:root.querySelector("[data-kj3-dock-label]"),
    dockCopy:root.querySelector("[data-kj3-dock-copy]"),
    dockLink:root.querySelector("[data-kj3-dock-link]")
  };

  var controller=null;
  var statusMode="loading";

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

    ui.dockLabel.textContent=active?"KENJI · ACCESS VERIFIED":mode==="pending"?"KENJI · REVIEW IN PROGRESS":"KENJI · PRIVATE ACCESS";
    ui.dockCopy.textContent=active?"สิทธิ์พร้อม เริ่มได้เลย":mode==="pending"?"รอการยืนยันจาก MMD":"เชื่อม MY MMD เพื่อเริ่ม";
    ui.dockLink.href=destination;
    ui.dockLink.textContent=active?"คุยกับผม ↗":"ตรวจสิทธิ์ ↗";
    ui.dock.setAttribute("aria-hidden","false");
    ui.dockLink.tabIndex=0;
  }

  function clean(value){return typeof value==="string"?value.trim():""}

  function normalize(payload){
    var profile=payload&&typeof payload==="object"?(payload.profile||payload.data||payload):{};
    var status=clean(profile.membership_status||profile.status||profile.member_status).toLowerCase();
    var tier=clean(profile.membership_tier||profile.tier||profile.level);
    var expiry=clean(profile.active_through||profile.activeThrough||profile.expires_at||profile.expiry_date);
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

  function updateDock(){
    var visible=window.scrollY>Math.min(window.innerHeight*.72,620)&&statusMode!=="loading";
    root.classList.toggle("is-dock-visible",visible);
  }

  window.addEventListener("scroll",updateDock,{passive:true});
  updateDock();
  loadProfile();
})();
</script>
