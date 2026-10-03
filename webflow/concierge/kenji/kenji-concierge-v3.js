<script>
(function(){
  "use strict";
  function clean(value){return typeof value==="string"?value.trim():""}
  function normalize(payload,now){
    if(!payload||payload.ok!==true)return{mode:"error"};
    var profile=payload.data&&typeof payload.data==="object"?payload.data:{};
    var access=profile.actual_access;
    var accessState=clean(typeof access==="object"&&access?access.value||access.status:access).toLowerCase();
    var status=clean(profile.membership_status).toLowerCase();
    var expiry=clean(profile.membership_expires_at);
    var expires=Date.parse(expiry);
    var mode="unknown";
    if(["blocked","denied","suspended","revoked","none","inactive"].includes(accessState)||["blocked","suspended","revoked","forbidden"].includes(status))mode="blocked";
    else if(profile.pending_identity===true||profile.resolution_guard&&profile.resolution_guard.state==="checking"||["pending","pending_review","review","checking","unknown"].includes(accessState)||["pending","pending_review","under_review","checking","review","waiting"].includes(status))mode="pending";
    else if(["expired","inactive","former_member","cancelled"].includes(status)||Number.isFinite(expires)&&expires<=now)mode="expired";
    else if(["active","verified","current","approved"].includes(status))mode="active";
    var points=profile.customer_360&&profile.customer_360.points||{};
    var balance=profile.points;
    // LIFF emits a flat amount. Accept only the payment-backed response guard,
    // never old resolver totals, estimates, null/empty coercion or dashboard fields.
    var guarded=profile.points_policy==="lot_365d_from_entry"&&points.expiry_policy==="lot_365d_from_entry"&&points.status==="verified"&&points.active_points===balance&&profile.points_recovery_pending!==true;
    if(!guarded||typeof balance!=="number"||!Number.isSafeInteger(balance)||balance<0)balance=null;
    var unresolved=profile.pending_identity===true||profile.resolution_guard&&profile.resolution_guard.state==="checking";
    return{mode:mode,tier:unresolved?"":clean(profile.tier),expiry:!unresolved&&Number.isFinite(expires)?expiry:"",points:unresolved?null:balance,displayName:unresolved?"":clean(profile.display_name).slice(0,100)};
  }
  function displayReply(data,points,name){
    if(data.intent!=="points_status")return data.reply;
    // The chat BFF can carry an unguarded legacy balance. Render only the
    // freshly read, payment-backed LIFF value; never parse or reuse its reply.
    if(typeof points!=="number"||!Number.isSafeInteger(points)||points<0)return "ตอนนี้ยังยืนยันยอด Points ไม่ได้ครับ ตรวจข้อมูลใน MY MMD ก่อน ผมจะไม่เติมยอดที่ยังไม่ยืนยัน";
    return (clean(name)?clean(name)+" · ":"")+"Points ที่ระบบยืนยันตอนนี้ "+new Intl.NumberFormat("th-TH").format(points)+" แต้มครับ";
  }
  function safeAction(action){
    if(!action||typeof action.url!=="string"||typeof action.label!=="string")return null;
    // Current BFF actions are relative first-party routes. Reject scripts, external and scheme-relative URLs.
    if(!action.url.startsWith("/")||action.url.startsWith("//")||/[\\\x00-\x20]/.test(action.url))return null;
    return {url:action.url,label:action.label.slice(0,120)};
  }
  if(typeof module!=="undefined"&&module.exports){module.exports={normalize:normalize,safeAction:safeAction,displayReply:displayReply};return}
  var root=document.getElementById("kenji-concierge-v3");
  if(!root||root.dataset.initialized==="true")return;
  root.dataset.initialized="true";
  var $=function(selector){return root.querySelector(selector)};
  var card=$("[data-kj3-status-card]"),input=$("#kj3-input"),feedback=$("[data-kj3-chat-status]");
  var requestId=0,controller=null,lastChecked=0,chatController=null,chatId=0,memberPoints=null,memberName="",busy=false,canChat=false,paused=false;
  var messages=$("[data-kj3-messages]"),send=$("[data-kj3-send]");
  function safePath(value,fallback){try{var url=new URL(value,location.origin);return url.origin===location.origin&&url.pathname.startsWith("/")?url.pathname+url.search+url.hash:fallback}catch(e){return fallback}}
  var endpoint=safePath(root.dataset.profileEndpoint,"/member/api/liff/profile");
  function withToken(path){
    var token=new URLSearchParams(location.search).get("t");
    if(!token)return path;
    var url=new URL(path,location.origin);
    if(!url.searchParams.has("t"))url.searchParams.set("t",token);
    return url.pathname+url.search+url.hash;
  }
  // Preserve existing public handoffs; do not copy tokens to new destinations.
  root.querySelectorAll('a[href="/member/my-mmd"],a[href="/booking"]').forEach(function(link){link.href=withToken(link.getAttribute("href"))});
  var portrait=$(".kj3-portrait"),portraitImage=portrait.querySelector("img");
  function showPortrait(){portrait.hidden=!(portraitImage.complete&&portraitImage.naturalWidth>0)}
  portraitImage.addEventListener("load",showPortrait);
  portraitImage.addEventListener("error",function(){portrait.hidden=true});
  showPortrait();
  var verify=withToken(safePath(root.dataset.verifyUrl,"/member/my-mmd"));
  var chatEndpoint=safePath(root.dataset.chatEndpoint,"/api/member/kenji/chat");
  $("[data-kj3-login]").href=verify;
  var labels={loading:["กำลังตรวจสอบสมาชิก","อ่านข้อมูลที่ยืนยันแล้วจาก MY MMD"],active:["ข้อมูลสมาชิกยืนยันแล้ว","ระดับสมาชิกไม่ใช่การยืนยันสิทธิ์โปรโมชั่นหรือ Private Access"],guest:["ยืนยันบัญชีเพื่อดูสถานะ","เปิด MY MMD แล้วกลับมาตรวจอีกครั้ง"],expired:["สมาชิกหมดอายุ / ไม่ใช้งาน","ตรวจขั้นตอนต่ออายุใน MY MMD"],pending:["สถานะอยู่ระหว่างตรวจสอบ","ยังไม่ยืนยันการเปิดสิทธิ์ส่วนตัว"],blocked:["สิทธิ์อยู่ระหว่างระงับ","ตรวจสถานะใน MY MMD หรือติดต่อ Private Care"],unknown:["ยังยืนยันสถานะสมาชิกไม่ได้","ข้อมูลไม่ครบ กรุณาตรวจใน MY MMD"],error:["ตรวจสถานะไม่สำเร็จ","ลองตรวจอีกครั้ง ข้อมูลเก่าจะไม่ถูกแสดงแทน" ]};
  function state(profile){
    memberPoints=profile.points==null?null:profile.points;memberName=profile.displayName||"";
    var mode=profile.mode,copy=labels[mode]||labels.unknown;
    root.dataset.memberMode=mode;card.setAttribute("aria-busy",mode==="loading"?"true":"false");
    $("[data-kj3-status-title]").textContent=copy[0];$("[data-kj3-status-copy]").textContent=copy[1];
    $("[data-kj3-tier]").textContent=profile.tier||"—";
    $("[data-kj3-expiry]").textContent=profile.expiry?new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"2-digit",timeZone:"Asia/Bangkok"}).format(new Date(profile.expiry)):"—";
    $("[data-kj3-points]").textContent=profile.points==null?"ยังไม่ยืนยัน":new Intl.NumberFormat("th-TH").format(profile.points);
    if(["guest","blocked","error"].includes(mode)){++chatId;if(chatController)chatController.abort();busy=false;clearConversation();input.value="";$("[data-kj3-count]").textContent="0 / 800";$("[data-kj3-clear-chat]").disabled=false;messages.setAttribute("aria-busy","false")}
    canChat=["active","expired","pending","unknown"].includes(mode);
    send.disabled=busy||!canChat||paused;
    $("[data-kj3-login]").hidden=canChat;
    if(!busy)feedback.textContent=paused?"MMD กำลังดูแลบทสนทนา กรุณาคุยต่อในช่องทางเดิม":canChat?"Kenji ใช้ข้อมูลสมาชิกที่ระบบยืนยัน":mode==="loading"?"กำลังตรวจสอบบัญชี":"ยืนยันบัญชีใน MY MMD หรือตรวจสถานะอีกครั้งก่อนส่ง";
    $("[data-kj3-retry]").disabled=mode==="loading";
  }
  async function load(){
    var id=++requestId;
    if(controller)controller.abort();
    controller=new AbortController();var activeController=controller;
    state({mode:"loading"});
    var timeout=setTimeout(function(){activeController.abort()},8000);
    try{
      var response=await fetch(endpoint,{method:"GET",credentials:"include",cache:"no-store",headers:{Accept:"application/json"},signal:activeController.signal});
      var profile=response.status===401||response.status===403?{mode:"guest"}:response.ok?normalize(await response.json(),Date.now()):{mode:"error"};
      if(id===requestId){state(profile);lastChecked=Date.now()}
    }catch(e){if(id===requestId)state({mode:"error"})}finally{clearTimeout(timeout)}
  }
  function clearConversation(){messages.replaceChildren();var empty=document.createElement("p");empty.className="kj3-empty";empty.dataset.kj3Empty="";empty.textContent="ยังไม่มีบทสนทนา เลือกหัวข้อหรือพิมพ์เรื่องที่อยากให้ผมช่วยครับ";messages.appendChild(empty)}
  function addMessage(text,role,label,action){
    var empty=$("[data-kj3-empty]");if(empty)empty.remove();
    var box=document.createElement("div");box.className="kj3-message";box.dataset.role=role;
    var name=document.createElement("small");name.textContent=label;box.appendChild(name);
    var content=document.createElement("span");content.textContent=text;box.appendChild(content);
    var next=safeAction(action);if(next){var link=document.createElement("a");link.href=next.url;link.textContent=next.label+" ↗";box.appendChild(link)}
    messages.appendChild(box);messages.scrollTop=messages.scrollHeight;
    return name;
  }
  async function ask(){
    var message=input.value.trim();
    if(busy||paused||!canChat)return;
    if(!message){feedback.textContent="พิมพ์เรื่องที่ต้องการ หรือเลือกหัวข้อด้านบนครับ";input.focus();return}
    busy=true;send.disabled=true;$("[data-kj3-clear-chat]").disabled=true;
    var id=++chatId;chatController=new AbortController();var activeChat=chatController;
    var label=addMessage(message,"user","กำลังส่ง · ยังไม่ยืนยันการรับ");
    messages.setAttribute("aria-busy","true");feedback.textContent="Kenji กำลังตรวจข้อมูล…";
    var timeout=setTimeout(function(){activeChat.abort()},25000);
    try{
      var response=await fetch(chatEndpoint,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({message:message}),signal:activeChat.signal});
      var data=await response.json().catch(function(){return null});
      if(id!==chatId)return;
      if(response.status===401){clearConversation();input.value="";$("[data-kj3-count]").textContent="0 / 800";state({mode:"guest"});feedback.textContent="บัญชีหมดเวลา กรุณายืนยัน MY MMD อีกครั้ง ข้อความนี้ยังไม่ยืนยันการรับ";return}
      if(response.status===423||data&&["owner_takeover","human_takeover","conversation_paused"].includes(data.error)){
        paused=true;label.textContent="ยังไม่ยืนยันการรับ";feedback.textContent="MMD กำลังดูแลบทสนทนา กรุณาคุยต่อในช่องทางเดิม ไม่ต้องส่งซ้ำ";return;
      }
      if(!response.ok||!data||data.ok!==true||typeof data.reply!=="string"||!data.reply.trim()){
        label.textContent="ยังไม่ยืนยันการรับ";feedback.textContent=response.status===409?"รายการซ้ำหรือสถานะเปลี่ยน ยังไม่ยืนยันการรับ กรุณาตรวจบทสนทนาเดิมก่อนส่งซ้ำ":"ยังรับคำตอบไม่ได้ ข้อความยังอยู่ในช่องพิมพ์ กรุณาตรวจสถานะก่อนลองใหม่";return;
      }
      if(data.intent==="points_status"){
        await load();
        if(id!==chatId||root.dataset.memberMode==="loading")return;
      }
      label.textContent="Kenji ตอบกลับแล้ว";
      var reply=displayReply(data,memberPoints,memberName);
      addMessage(reply,"kenji",data.review_required===true?"KENJI · ต้องตรวจสอบเพิ่มเติม":"KENJI",data.action);
      if(input.value.trim()===message){input.value="";$("[data-kj3-count]").textContent="0 / 800"}
      feedback.textContent="คำตอบจาก Kenji · การอนุมัติและสิทธิ์ใช้สถานะจริงของ MMD";
    }catch(error){if(id===chatId){label.textContent="ยังไม่ยืนยันการรับ";feedback.textContent="การเชื่อมต่อขัดข้อง ยังไม่ยืนยันการรับข้อความ ตรวจบทสนทนาเดิมก่อนส่งซ้ำ"}}
    finally{clearTimeout(timeout);if(id===chatId){busy=false;send.disabled=!canChat||paused;$("[data-kj3-clear-chat]").disabled=false;messages.setAttribute("aria-busy","false")}}
  }
  var prompts={points:"เช็ก Points ที่ระบบยืนยันให้หน่อยครับ",promotions:"เช็กโปรโมชั่นทั่วไปที่ระบบยืนยันแล้ว และเงื่อนไขที่ต้องตรวจให้หน่อยครับ",renewal:"เช็กวันหมดอายุและขั้นตอนต่ออายุสมาชิกให้หน่อยครับ"};
  root.querySelectorAll("[data-kj3-prompt]").forEach(function(button){button.addEventListener("click",function(){input.value=prompts[button.dataset.kj3Prompt];$("[data-kj3-count]").textContent=input.value.length+" / 800";feedback.textContent="เตรียมข้อความแล้ว กดส่งเมื่อพร้อม";input.focus()})});
  $("[data-kj3-form]").addEventListener("submit",function(event){event.preventDefault();ask()});
  input.addEventListener("input",function(){$("[data-kj3-count]").textContent=input.value.length+" / 800"});
  $("[data-kj3-clear-chat]").addEventListener("click",function(){if(busy)return;clearConversation();input.value="";$("[data-kj3-count]").textContent="0 / 800";feedback.textContent="ล้างเฉพาะบทสนทนาในหน้านี้ ประวัติในระบบไม่ได้ถูกลบ";input.focus()});
  $("[data-kj3-retry]").addEventListener("click",load);
  function clearPrivateState(){++requestId;if(controller)controller.abort();++chatId;if(chatController)chatController.abort();busy=false;messages.setAttribute("aria-busy","false");$("[data-kj3-clear-chat]").disabled=false;clearConversation();state({mode:"loading"})}
  // Never restore a stale member snapshot from browser history or a background tab.
  window.addEventListener("pagehide",function(){clearPrivateState();input.value="";$("[data-kj3-count]").textContent="0 / 800";feedback.textContent=""});
  window.addEventListener("pageshow",function(event){if(event.persisted)load()});
  document.addEventListener("visibilitychange",function(){if(document.hidden){clearPrivateState();input.value="";$("[data-kj3-count]").textContent="0 / 800"}else load()});
  window.addEventListener("focus",function(){if(!document.hidden&&Date.now()-lastChecked>60000)load()});
  load();
})();
</script>
