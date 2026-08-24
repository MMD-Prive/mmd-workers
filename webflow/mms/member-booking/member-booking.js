(function(){
  "use strict";
  var root=document.getElementById("mmb1");
  if(!root||root.dataset.ready==="true")return;
  root.dataset.ready="true";
  var storageKey="mmd_mms_prebooking_v1";
  var catalog={skills:[],zones:[],max_selected_skills:6};
  var matches=[];
  var memberReady=false;
  var submitting=false;
  var els={
    form:document.getElementById("mmb-form"),gate:document.getElementById("mmb-gate"),booking:document.getElementById("mmb-booking"),pill:document.getElementById("mmb-member-pill"),
    zone:document.getElementById("mmb-zone"),date:document.getElementById("mmb-date"),time:document.getElementById("mmb-time"),duration:document.getElementById("mmb-duration"),location:document.getElementById("mmb-location-note"),
    skills:document.getElementById("mmb-skill-grid"),skillCount:document.getElementById("mmb-skill-count"),match:document.getElementById("mmb-match"),results:document.getElementById("mmb-results"),preferred:document.getElementById("mmb-preferred-name"),
    summary:document.getElementById("mmb-summary"),note:document.getElementById("mmb-note"),consent:document.getElementById("mmb-consent"),error:document.getElementById("mmb-error"),submit:document.getElementById("mmb-submit"),success:document.getElementById("mmb-success"),reference:document.getElementById("mmb-reference")
  };
  var draft=loadDraft();
  setMinimumDate();
  bind();
  boot();

  async function boot(){
    try{
      var values=await Promise.all([readJson(root.dataset.catalogEndpoint,{method:"GET",credentials:"same-origin"}),readMember()]);
      catalog=values[0].data||catalog;
      renderCatalog();
      restoreDraft();
      updateSummary();
    }catch(error){
      setError(error.message||"โหลดข้อมูล MMS ไม่สำเร็จ กรุณาลองใหม่อีกครั้งครับ");
      if(els.match)els.match.disabled=true;
      if(els.submit)els.submit.disabled=true;
    }
  }

  async function readMember(){
    var response=await fetch(root.dataset.profileEndpoint,{method:"GET",credentials:"same-origin",headers:{accept:"application/json"}});
    var payload=await response.json().catch(function(){return null});
    if(response.status===401||response.status===403){showGate();throw new Error("กรุณายืนยัน Member Access ผ่าน LINE ก่อนครับ")}
    if(!response.ok||!payload||payload.ok!==true){throw new Error("ตรวจสอบ Member Access ไม่สำเร็จ กรุณาลองใหม่อีกครั้งครับ")}
    memberReady=true;
    els.gate.hidden=true;
    els.pill.textContent="Member verified · "+String(payload.data&&payload.data.display_name||"MMD Member");
    return payload.data||{};
  }

  function showGate(){memberReady=false;els.gate.hidden=false;els.pill.textContent="Member verification required";if(els.match)els.match.disabled=true;if(els.submit)els.submit.disabled=true}

  function renderCatalog(){
    if(!Array.isArray(catalog.skills)||catalog.skills.length!==8)throw new Error("รายการ Skills ของ MMS ยังไม่พร้อมครับ");
    els.zone.replaceChildren(option("","เลือกโซนของสถานที่"));
    (catalog.zones||[]).forEach(function(item){els.zone.append(option(item.code,item.label))});
    els.skills.replaceChildren();
    catalog.skills.forEach(function(item,index){
      var label=document.createElement("label");label.className="mmb-skill-card";
      var input=document.createElement("input");input.type="checkbox";input.name="skills";input.value=item.code;
      var copy=document.createElement("span");var strong=document.createElement("strong");strong.textContent=String(index+1).padStart(2,"0")+" · "+item.label;var small=document.createElement("small");small.textContent=item.th;
      copy.append(strong,small);label.append(input,copy);els.skills.append(label);
    });
  }

  function bind(){
    els.form.addEventListener("change",function(event){
      if(event.target&&event.target.name==="skills")enforceSkillLimit(event.target);
      updateSkillCount();updateSummary();saveDraft();
    });
    els.form.addEventListener("input",function(){updateSummary();saveDraft()});
    els.match.addEventListener("click",matchTherapists);
    els.form.addEventListener("submit",submitPrebooking);
  }

  function enforceSkillLimit(changed){
    var selected=selectedSkills();var max=Number(catalog.max_selected_skills||6);
    if(selected.length>max){changed.checked=false;setError("เลือกได้สูงสุด "+max+" Skills ครับ");return}
    setError("");
  }
  function selectedSkills(){return Array.prototype.slice.call(root.querySelectorAll('input[name="skills"]:checked')).map(function(input){return input.value})}
  function selectedGender(){var input=root.querySelector('input[name="recipient_gender"]:checked');return input?input.value:""}
  function selectedTherapists(){return Array.prototype.slice.call(root.querySelectorAll('input[name="therapist_ids"]:checked')).map(function(input){return input.value}).slice(0,5)}
  function updateSkillCount(){els.skillCount.textContent=String(selectedSkills().length)}

  function validateCore(){
    setError("");
    if(!memberReady){showGate();setError("กรุณายืนยัน Member Access ผ่าน LINE ก่อนครับ");return false}
    if(!selectedGender()){setError("กรุณาเลือกเพศของผู้รับบริการครับ");return false}
    if(!els.zone.value||!els.date.value||!els.time.value){setError("กรุณาระบุโซน วันที่ และเวลาให้ครบครับ");return false}
    var skills=selectedSkills();if(skills.length<1||skills.length>Number(catalog.max_selected_skills||6)){setError("กรุณาเลือก Skills 1–6 รายการครับ");return false}
    return true;
  }

  async function matchTherapists(){
    if(!validateCore())return;
    setBusy(els.match,true,"กำลังเช็ก…");els.results.replaceChildren(statusBox("MMS กำลังตรวจ Skills และโซนที่ตรงกันครับ"));
    try{
      var result=await readJson(root.dataset.matchEndpoint,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({recipient_gender:selectedGender(),zone:els.zone.value,skills:selectedSkills()})});
      matches=Array.isArray(result.data&&result.data.matches)?result.data.matches:[];
      renderMatches(Boolean(result.data&&result.data.requires_manual_coordination));
      updateSummary();
    }catch(error){if(error.status===401||error.status===403)showGate();els.results.replaceChildren(statusBox(error.message||"เช็กรายชื่อไม่สำเร็จ กรุณาลองใหม่ครับ"))}
    finally{setBusy(els.match,false,"เช็ก Therapist ที่เหมาะ →")}
  }

  function renderMatches(manual){
    els.results.replaceChildren();
    if(manual){els.results.append(statusBox("เงื่อนไขนี้ต้องให้ MMS ช่วยประสานเป็นรายกรณีครับ สามารถส่ง Pre-booking ต่อได้"));return}
    if(!matches.length){els.results.append(statusBox("ยังไม่พบ Therapist ที่ตรงครบทุกเงื่อนไขในข้อมูลปัจจุบัน แต่ยังส่ง Pre-booking ให้ MMS ช่วยประสานได้ครับ"));return}
    matches.forEach(function(item){
      var card=document.createElement("article");card.className="mmb-result";
      var image=document.createElement("img");image.src=item.public_photo_url||"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a88a228c7e7fcd7f766431b_MMS%20-%2001%20Therapists.webp";image.alt="Male Therapist "+String(item.display_name||"");image.loading="lazy";
      var body=document.createElement("div");body.className="mmb-result-body";var title=document.createElement("h4");title.textContent=item.display_name||"MMS Therapist";var copy=document.createElement("p");copy.textContent="Skills ตรง "+String(item.match_score||0)+" รายการ · "+String(item.availability_status||"MMS จะตรวจคิวอีกครั้ง");
      var choose=document.createElement("label");var check=document.createElement("input");check.type="checkbox";check.name="therapist_ids";check.value=item.therapist_id;var text=document.createElement("span");text.textContent="สนใจคนนี้";choose.append(check,text);body.append(title,copy,choose);card.append(image,body);els.results.append(card);
    });
  }

  function updateSummary(){
    els.summary.replaceChildren();
    var genderLabel=({male:"ผู้ชาย",female:"ผู้หญิง",manual:"ให้ MMS ช่วยประสาน"})[selectedGender()]||"ยังไม่ได้เลือก";
    var zoneLabel=els.zone&&els.zone.selectedIndex>=0?els.zone.options[els.zone.selectedIndex].text:"ยังไม่ได้เลือก";
    var skillLabels=selectedSkills().map(skillLabel).join(" · ")||"ยังไม่ได้เลือก";
    var names=selectedTherapists().map(function(id){var item=matches.find(function(match){return match.therapist_id===id});return item&&item.display_name||id}).join(", ")||els.preferred.value||"ให้ MMS ช่วยดู";
    [["ผู้รับบริการ",genderLabel],["วันและเวลา",(els.date.value||"—")+" · "+(els.time.value||"—")+" · "+els.duration.value+" นาที"],["โซน",zoneLabel],["Skills",skillLabels],["Therapist ที่สนใจ",names]].forEach(function(item){var article=document.createElement("article");var label=document.createElement("span");label.textContent=item[0];var value=document.createElement("strong");value.textContent=item[1];article.append(label,value);els.summary.append(article)});
  }

  async function submitPrebooking(event){
    event.preventDefault();if(submitting||!validateCore())return;
    if(!els.consent.checked){setError("กรุณายืนยันว่าเข้าใจสถานะ Pre-booking ก่อนส่งครับ");return}
    submitting=true;setBusy(els.submit,true,"กำลังส่ง…");
    var note=[els.location.value?"สถานที่: "+els.location.value:"",els.preferred.value?"ชื่อที่สนใจเพิ่มเติม: "+els.preferred.value:"",els.note.value].filter(Boolean).join("\n");
    var body={idempotency_key:draft.request_id||newRequestId(),recipient_gender:selectedGender(),zone:els.zone.value,service_date:els.date.value,service_time:els.time.value,duration_minutes:Number(els.duration.value),skills:selectedSkills(),requested_therapist_ids:selectedTherapists(),note:note,language:"th"};
    try{
      var result=await readJson(root.dataset.prebookEndpoint,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify(body)});
      localStorage.removeItem(storageKey);els.form.hidden=true;els.success.hidden=false;els.reference.textContent="Reference: "+String(result.prebooking&&result.prebooking.prebooking_id||"MMS received");els.success.focus();els.success.scrollIntoView({behavior:motion(),block:"center"});
    }catch(error){if(error.status===401||error.status===403)showGate();setError(error.message||"ส่ง Pre-booking ไม่สำเร็จ กรุณาลองใหม่อีกครั้งครับ")}
    finally{submitting=false;setBusy(els.submit,false,"ส่ง Pre-booking ให้ MMS")}
  }

  async function readJson(url,init){
    var controller=new AbortController();var timeout=setTimeout(function(){controller.abort()},12000);var options=Object.assign({},init||{},{signal:controller.signal});
    try{var response=await fetch(url,options);var payload=await response.json().catch(function(){return null});if(!response.ok||!payload||payload.ok!==true){var error=new Error(payload&&payload.error&&payload.error.message||"MMS service is temporarily unavailable");error.status=response.status;throw error}return payload}
    finally{clearTimeout(timeout)}
  }
  function option(value,label){var item=document.createElement("option");item.value=value;item.textContent=label;return item}
  function statusBox(text){var item=document.createElement("div");item.className="mmb-empty";item.textContent=text;return item}
  function skillLabel(code){var item=(catalog.skills||[]).find(function(skill){return skill.code===code});return item?item.th:code}
  function setError(text){els.error.textContent=String(text||"")}
  function setBusy(button,state,label){button.disabled=state;button.textContent=label}
  function motion(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}
  function newRequestId(){return "mms_pre_"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"_"+Math.random().toString(16).slice(2))}
  function setMinimumDate(){var now=new Date();var local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);els.date.min=local}

  function saveDraft(){
    try{draft={request_id:draft.request_id||newRequestId(),recipient_gender:selectedGender(),zone:els.zone.value,date:els.date.value,time:els.time.value,duration:els.duration.value,location:els.location.value,skills:selectedSkills(),preferred:els.preferred.value,note:els.note.value,saved_at:new Date().toISOString()};localStorage.setItem(storageKey,JSON.stringify(draft))}catch(error){}
  }
  function loadDraft(){try{var value=JSON.parse(localStorage.getItem(storageKey)||"null");return value&&typeof value==="object"?value:{request_id:newRequestId()}}catch(error){return{request_id:newRequestId()}}}
  function restoreDraft(){
    if(draft.recipient_gender){var gender=root.querySelector('input[name="recipient_gender"][value="'+draft.recipient_gender+'"]');if(gender)gender.checked=true}
    [[els.zone,draft.zone],[els.date,draft.date],[els.time,draft.time],[els.duration,draft.duration],[els.location,draft.location],[els.preferred,draft.preferred],[els.note,draft.note]].forEach(function(pair){if(pair[0]&&pair[1]!=null)pair[0].value=pair[1]});
    (draft.skills||[]).slice(0,6).forEach(function(code){var input=root.querySelector('input[name="skills"][value="'+code+'"]');if(input)input.checked=true});updateSkillCount();
  }
})();
