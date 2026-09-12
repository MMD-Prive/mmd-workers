<script>
(function(){
  "use strict";
  var root=document.getElementById("kenji-concierge");
  if(!root||root.dataset.initialized==="true")return;
  root.dataset.initialized="true";root.classList.add("js");

  var cfg={
    endpoint:root.dataset.profileEndpoint||"",
    chat:root.dataset.chatUrl||"/member/kenji-ai-20",
    verify:root.dataset.verifyUrl||"/member/my-mmd",
    booking:root.dataset.bookingUrl||"/booking",
    recovery:root.dataset.recoveryUrl||"/recovery"
  };
  var card=root.querySelector("[data-kc-status-card]");
  var title=root.querySelector("[data-kc-status-title]");
  var copy=root.querySelector("[data-kc-status-copy]");
  var retry=root.querySelector("[data-kc-retry]");
  var primary=root.querySelectorAll("[data-kc-primary],[data-kc-footer]");
  var privateLinks=root.querySelectorAll("[data-kc-private]");
  var controller=null;

  function links(selector,url){root.querySelectorAll(selector).forEach(function(a){a.href=url})}
  function disable(nodes,value){nodes.forEach(function(a){if(value){a.setAttribute("aria-disabled","true");a.tabIndex=-1}else{a.removeAttribute("aria-disabled");a.removeAttribute("tabindex")}})}
  links("[data-kc-booking]",cfg.booking);links("[data-kc-membership]",cfg.verify);links("[data-kc-recovery]",cfg.recovery);

  function state(name,heading,message,canRetry){
    card.dataset.state=name;title.textContent=heading;copy.textContent=message;retry.hidden=!canRetry;
    var active=name==="active",locked=name==="loading"||name==="pending"||name==="blocked";
    primary.forEach(function(a){a.href=active?cfg.chat:cfg.verify});
    privateLinks.forEach(function(a){a.href=active?cfg.chat:cfg.verify});
    disable(primary,locked);disable(privateLinks,locked);
    var hero=root.querySelector("[data-kc-primary]");
    if(hero)hero.textContent=active?"ให้ Kenji พาไปต่อ":name==="pending"?"กำลังยืนยันสถานะ":"ให้ผมตรวจสอบสิทธิ์";
  }

  function text(v){return typeof v==="string"?v.trim():""}
  function profile(payload){
    var p=payload&&typeof payload==="object"?(payload.profile||payload.data||payload):{};
    var s=text(p.membership_status||p.status||p.member_status).toLowerCase();
    var tier=text(p.membership_tier||p.tier||p.level);
    var until=text(p.active_through||p.activeThrough||p.expires_at||p.expiry_date);
    if(["blocked","suspended","revoked","forbidden"].includes(s))return{state:"blocked"};
    if(["pending","pending_review","review","waiting"].includes(s))return{state:"pending"};
    if(["active","verified","current","approved"].includes(s))return{state:"active",tier:tier,until:until};
    if(["expired","inactive","former_member","cancelled"].includes(s))return{state:"expired"};
    return{state:"guest"};
  }

  function date(v){
    if(!v)return"";var d=new Date(v);if(Number.isNaN(d.getTime()))return"";
    try{return new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"numeric"}).format(d)}catch(e){return""}
  }

  function render(p){
    if(p.state==="active"){var d=date(p.until);state("active","ACCESS VERIFIED"+(p.tier?" · "+p.tier:""),d?"สิทธิ์พร้อมใช้งานถึง "+d+" · ให้ผมพาไปต่อได้เลย":"สถานะพร้อม · ให้ผมพาไปยัง next action ได้เลย");return}
    if(p.state==="pending"){state("pending","REVIEW IN PROGRESS","ผมจะเปิดสิทธิ์เมื่อข้อมูลผ่านการยืนยันแล้วเท่านั้น");return}
    if(p.state==="blocked"){state("blocked","PRIVATE ACCESS ON HOLD","ผมจะไม่เปิดข้อมูลส่วนตัวจนกว่าสถานะจะพร้อม");return}
    if(p.state==="expired"){state("expired","RENEWAL REQUIRED","ต่ออายุใน MY MMD แล้วกลับมาให้ผมตรวจอีกครั้ง");return}
    state("guest","CONNECT MY MMD","ยืนยันตัวตนครั้งเดียว แล้วผมจะอ่านสิทธิ์ที่ถูกต้องให้คุณ");
  }

  function load(){
    if(!cfg.endpoint){state("error","ยังตรวจสอบสถานะไม่ได้","ยังไม่ได้กำหนด Profile Endpoint");return}
    if(controller)controller.abort();controller=new AbortController();
    state("loading","READING MEMBER STATUS","ผมกำลังเชื่อมสถานะจริงจาก MY MMD");
    var timer=setTimeout(function(){controller.abort()},8000);
    fetch(cfg.endpoint,{method:"GET",credentials:"include",headers:{Accept:"application/json"},signal:controller.signal})
      .then(function(r){if(r.status===401||r.status===403)return{unauthenticated:true};if(!r.ok)throw new Error("HTTP_"+r.status);return r.text().then(function(t){if(!t)return{};try{return JSON.parse(t)}catch(e){throw new Error("INVALID_JSON")}})})
      .then(function(data){render(data.unauthenticated?{state:"guest"}:profile(data))})
      .catch(function(e){state("error",e.name==="AbortError"?"CONNECTION TIMEOUT":"STATUS UNAVAILABLE","ข้อมูลยังไม่พร้อม ผมจะไม่เดาสิทธิ์ให้คุณ",true)})
      .finally(function(){clearTimeout(timer)});
  }

  retry.addEventListener("click",load);
  root.addEventListener("click",function(e){var a=e.target.closest("a[aria-disabled='true']");if(a&&root.contains(a))e.preventDefault()});
  var details=root.querySelectorAll(".kc-disclosure");details.forEach(function(d){d.addEventListener("toggle",function(){if(d.open)details.forEach(function(x){if(x!==d)x.open=false})})});
  var items=root.querySelectorAll(".kc-reveal");
  if("IntersectionObserver"in window&&!matchMedia("(prefers-reduced-motion: reduce)").matches){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("is-visible");io.unobserve(e.target)}})},{threshold:.14,rootMargin:"0px 0px -8% 0px"});items.forEach(function(x){io.observe(x)})}else{items.forEach(function(x){x.classList.add("is-visible")})}
  load();
})();
</script>
