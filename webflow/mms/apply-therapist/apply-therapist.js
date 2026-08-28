(function(){
  "use strict";

  var root=document.getElementById("mta3");
  if(!root||root.dataset.bound==="true")return;

  var form=root.querySelector("#mta3-form");
  if(!form)return;

  var panels=[].slice.call(root.querySelectorAll("[data-step]"));
  var stepButtons=[].slice.call(root.querySelectorAll("[data-step-link]"));
  var pageSections=[].slice.call(root.querySelectorAll("[data-page-section]"));
  var branchSheet=root.querySelector(".mta-sheet");
  var branchPanel=root.querySelector(".mta-sheet__panel");
  var branchTrigger=root.querySelector("[data-branch-open]");
  var currentLabel=root.querySelector("[data-current-label]");
  var branchProgress=root.querySelector("[data-branch-progress]");
  var currentStep=1;
  var currentSection=0;
  var submitting=false;
  var lastFocus=null;
  var previousBodyOverflow="";
  var storageKey="mms_therapist_application_v3";
  var draft=loadDraft();
  var sectionMap=[
    {id:"mta3-overview",label:"เริ่มต้น"},
    {id:"mta3-model",label:"Model Therapist"},
    {id:"mta3-clients",label:"ลูกค้า"},
    {id:"mta3-services",label:"8 Skills"},
    {id:"mta3-apply",label:"ใบสมัคร"}
  ];
  var skills=[
    ["aroma_therapy_oil","Aroma Therapy Oil Massage","นวดผ่อนคลาย"],
    ["thai_massage","Thai Massage","นวดคลายเส้น"],
    ["sport_massage","Sport Massage","นวดแก้อาการ"],
    ["office_syndrome","Office Syndrome","นวดแก้อาการนั่งเป็นเวลานาน"],
    ["health_fitness_advisor","Health and Fitness Advisor","ให้คำปรึกษาโภชนาการและการออกกำลังกาย"],
    ["thai_herbal_compress","Thai herbal compress massage","นวดประคบสมุนไพร"],
    ["partner_present","Partner-Present Massage Session","นวดโดยมีคู่หรือผู้ติดตามอยู่ด้วย"],
    ["women_massage","Women Massage","บริการนวดสำหรับลูกค้าผู้หญิง"]
  ];
  var skillBox=root.querySelector("[data-skills]");
  var sensitiveWrap=root.querySelector("[data-sensitive-consent]");
  var spaWrap=root.querySelector("[data-spa-name]");
  var socialWrap=root.querySelector("[data-social]");

  buildCatalog();
  restoreDraft();
  bind();
  root.dataset.bound="true";
  showStep(stepFromHash()||1,true);
  updateSectionFromViewport();

  function buildCatalog(){
    if(!skillBox||skillBox.children.length)return;
    skills.forEach(function(item,index){
      var label=document.createElement("label");
      var input=document.createElement("input");
      var shell=document.createElement("span");
      var strong=document.createElement("strong");
      var small=document.createElement("small");
      input.type="checkbox";
      input.name="skills";
      input.value=item[0];
      strong.textContent=(index+1)+". "+item[1];
      small.textContent=item[2];
      shell.append(strong,small);
      label.append(input,shell);
      skillBox.append(label);
    });
  }

  function bind(){
    form.addEventListener("input",function(event){
      if(event.target.name==="skills")updateSkillCount();
      if(event.target.name==="sexual_orientation")toggleSensitive();
      if(event.target.name==="worked_at_spa_before"||event.target.name==="worked_independently_before")toggleConditional();
      saveDraft();
    });
    form.addEventListener("change",saveDraft);
    form.addEventListener("submit",submit);

    root.querySelectorAll("[data-next]").forEach(function(button){
      button.addEventListener("click",function(){if(validateStep(currentStep))showStep(Math.min(5,currentStep+1))});
    });
    root.querySelectorAll("[data-back]").forEach(function(button){
      button.addEventListener("click",function(){showStep(Math.max(1,currentStep-1))});
    });
    stepButtons.forEach(function(button){
      button.addEventListener("click",function(){
        var target=Number(button.dataset.stepLink);
        if(target<=currentStep||validateUntil(target-1))showStep(target);
      });
    });

    root.querySelectorAll("[data-section-target]").forEach(function(button){
      button.addEventListener("click",function(){goToSection(button.dataset.sectionTarget,true)});
    });
    root.querySelectorAll("[data-application-step]").forEach(function(button){
      button.addEventListener("click",function(){
        var target=Number(button.dataset.applicationStep);
        if(target<=currentStep||validateUntil(target-1)){
          closeBranch();
          showStep(target,true);
          goToSection("mta3-apply",true);
        }
      });
    });
    root.querySelectorAll("[data-branch-close]").forEach(function(button){button.addEventListener("click",closeBranch)});
    branchTrigger.addEventListener("click",openBranch);
    root.querySelector("[data-branch-current]").addEventListener("click",openBranch);
    root.querySelector("[data-branch-next]").addEventListener("click",goToNextSection);
    branchSheet.addEventListener("keydown",trapBranchFocus);
    window.addEventListener("hashchange",syncFromHash);
    window.addEventListener("scroll",throttle(updateSectionFromViewport,100),{passive:true});
    window.addEventListener("resize",throttle(updateSectionFromViewport,120),{passive:true});
  }

  function showStep(number,skipScroll){
    currentStep=number;
    panels.forEach(function(panel){
      var active=Number(panel.dataset.step)===number;
      panel.classList.toggle("is-current",active);
      panel.hidden=!active;
    });
    stepButtons.forEach(function(button){
      if(Number(button.dataset.stepLink)===number)button.setAttribute("aria-current","step");
      else button.removeAttribute("aria-current");
    });
    root.querySelectorAll("[data-application-step]").forEach(function(button){
      button.setAttribute("aria-current",String(Number(button.dataset.applicationStep)===number));
    });
    if(number===5)renderReview();
    clearError();
    if(!skipScroll){
      var heading=root.querySelector('[data-step="'+number+'"] h3');
      if(heading)heading.scrollIntoView({behavior:motion(),block:"start"});
    }
  }

  function validateUntil(last){
    for(var i=1;i<=last;i++){
      if(!validateStep(i)){showStep(i);return false}
    }
    return true;
  }

  function validateStep(number){
    clearError();
    var panel=root.querySelector('[data-step="'+number+'"]');
    var valid=true;
    var message="กรุณาตรวจข้อมูลที่จำเป็นให้ครบครับ";
    panel.querySelectorAll("input[required],select[required],textarea[required]").forEach(function(field){
      if(!field.checkValidity()){valid=false}
    });
    if(number===1&&!value("phone")&&!value("line_id")){message="กรุณาระบุเบอร์โทรหรือ LINE ID อย่างน้อยหนึ่งช่องครับ";valid=false}
    if(number===2){
      var orientation=checked("sexual_orientation");
      if(orientation&&!form.elements.sensitive_consent.checked){message="กรุณาให้ความยินยอมสำหรับข้อมูลอ่อนไหว หรือเลือกไม่เก็บข้อมูลนี้ครับ";valid=false}
    }
    if(number===3){
      var count=selected("skills").length;
      if(count<1||count>8){message="กรุณาเลือก Skill 1–8 รายการครับ";valid=false}
    }
    if(number===4){
      if(boolRadio("worked_at_spa_before")&&!value("spa_name")){message="กรุณาระบุชื่อร้านหรือสปาครับ";valid=false}
      if(boolRadio("worked_independently_before")&&!value("independent_social")){message="กรุณาระบุ Social Media หรือช่องทางอ้างอิงครับ";valid=false}
    }
    if(!valid){
      var invalid=panel.querySelector(":invalid");
      if(invalid&&typeof invalid.reportValidity==="function")invalid.reportValidity();
      setError(message);
    }
    return valid;
  }

  function toggleSensitive(){
    var enabled=Boolean(checked("sexual_orientation"));
    sensitiveWrap.hidden=!enabled;
    if(!enabled)form.elements.sensitive_consent.checked=false;
  }

  function toggleConditional(){
    spaWrap.hidden=!boolRadio("worked_at_spa_before");
    socialWrap.hidden=!boolRadio("worked_independently_before");
  }

  function updateSkillCount(){
    root.querySelector("[data-skill-count]").textContent=selected("skills").length+" / 8";
  }

  function renderReview(){
    var box=root.querySelector("[data-review]");
    box.replaceChildren();
    var items=[
      ["ผู้สมัคร",value("applicant_name")+(value("nickname")?" ("+value("nickname")+")":"")],
      ["อาชีพปัจจุบัน",value("current_profession")],
      ["ติดต่อ",value("phone")||value("line_id")],
      ["รับลูกค้า",labelOf("customer_gender_scope",checked("customer_gender_scope"))],
      ["Skills",selected("skills").map(skillLabel).join(" · ")],
      ["พื้นที่ฐาน",value("work_base_area")],
      ["การเดินทาง",labelOf("mobility_scope",checked("mobility_scope"))]
    ];
    items.forEach(function(item){
      var article=document.createElement("article");
      var span=document.createElement("span");
      var strong=document.createElement("strong");
      span.textContent=item[0];
      strong.textContent=item[1]||"—";
      article.append(span,strong);
      box.append(article);
    });
  }

  async function submit(event){
    event.preventDefault();
    if(submitting||!validateUntil(5))return;
    var files=collectFiles();
    var invalid=files.find(function(item){return !allowedFile(item)});
    if(invalid){setError(invalid.file.name+" เป็นชนิดไฟล์ที่ไม่รองรับครับ");return}
    var tooLarge=files.find(function(item){return item.file.size>10*1024*1024});
    if(tooLarge){setError(tooLarge.file.name+" มีขนาดเกิน 10 MB ครับ");return}

    queueFiles(files);
    submitting=true;
    var button=form.querySelector('button[type="submit"]');
    setBusy(button,true,"กำลังส่ง…");
    try{
      var payload=applicationPayload();
      var result=await readJson(root.dataset.applicationEndpoint,{
        method:"POST",
        headers:{"content-type":"application/json",accept:"application/json"},
        body:JSON.stringify(payload)
      });
      var applicationRef=result.application_ref||result.application_id||draft.application_ref;
      var applicationToken=result.application_token||draft.application_token;
      if(!applicationRef)throw new Error("รับใบสมัครแล้วแต่ไม่พบ Reference กรุณาติดต่อ MMS ครับ");
      draft.application_ref=applicationRef;
      if(applicationToken)draft.application_token=applicationToken;
      persistDraft();

      var uploadResult=await uploadFiles(files,{application_ref:applicationRef,application_token:applicationToken});
      if(uploadResult.failed){
        throw new Error("รับใบสมัครแล้ว แต่ยังมีไฟล์อัปโหลดไม่สำเร็จ "+uploadResult.failed+" ไฟล์ กรุณาเลือกไฟล์ที่ค้างและกดส่งอีกครั้ง โดยใช้ Reference "+applicationRef);
      }

      localStorage.removeItem(storageKey);
      form.hidden=true;
      root.querySelector(".mta-steps").hidden=true;
      var success=root.querySelector(".mta-success");
      success.hidden=false;
      root.querySelector("[data-reference]").textContent="Reference: "+applicationRef;
      root.querySelector("[data-upload-status]").textContent=uploadResult.message;
      success.focus();
      success.scrollIntoView({behavior:motion(),block:"center"});
    }catch(error){
      setError(error&&error.message||"ส่งใบสมัครไม่สำเร็จ กรุณาลองใหม่อีกครั้งครับ");
    }finally{
      submitting=false;
      setBusy(button,false,"ส่งใบสมัคร");
    }
  }

  function applicationPayload(){
    var orientation=checked("sexual_orientation");
    return {
      idempotency_key:draft.request_id||newRequestId(),
      applicant_name:value("applicant_name"),
      nickname:value("nickname"),
      phone:value("phone"),
      line_id:value("line_id"),
      current_profession:value("current_profession"),
      qualification_note:value("qualification_note"),
      gender_identity:checked("gender_identity"),
      customer_gender_scope:checked("customer_gender_scope"),
      skills:selected("skills"),
      work_base_area:value("work_base_area"),
      mobility_scope:checked("mobility_scope"),
      coverage_area_note:value("coverage_area_note"),
      experience_years:Number(value("experience_years")||0),
      experience_months:Number(value("experience_months")||0),
      strengths:value("strengths"),
      worked_at_spa_before:boolRadio("worked_at_spa_before"),
      spa_name:value("spa_name"),
      worked_independently_before:boolRadio("worked_independently_before"),
      independent_social:value("independent_social"),
      general_consent:form.elements.general_consent.checked,
      sexual_orientation:orientation,
      sensitive_consent:Boolean(orientation&&form.elements.sensitive_consent.checked),
      consent_notice_version:"mms-applicant-th-v3-2026-08-27",
      language:"th"
    };
  }

  function collectFiles(){
    var result=[];
    var photo=form.elements.profile_photo.files[0];
    if(photo)result.push({kind:"profile_photo",file:photo});
    [].slice.call(form.elements.certificates.files||[]).forEach(function(file){result.push({kind:"certificate",file:file})});
    return result;
  }

  function queueFiles(files){
    draft.pending_uploads=Array.isArray(draft.pending_uploads)?draft.pending_uploads:[];
    draft.uploaded=draft.uploaded&&typeof draft.uploaded==="object"?draft.uploaded:{};
    files.forEach(function(item){
      var key=fileKey(item);
      if(!draft.uploaded[key]&&!draft.pending_uploads.some(function(entry){return entry.key===key})){
        draft.pending_uploads.push({key:key,kind:item.kind,name:item.file.name,size:item.file.size,type:item.file.type});
      }
    });
    persistDraft();
  }

  async function uploadFiles(files,application){
    var pending=Array.isArray(draft.pending_uploads)?draft.pending_uploads:[];
    if(!pending.length&&!files.length)return{uploaded:0,failed:0,message:"ไม่มีไฟล์แนบ"};
    if(!application.application_token)return{uploaded:0,failed:pending.length||files.length,message:"ไม่พบ Upload Token สำหรับ Retry"};

    var uploaded=0;
    for(var i=0;i<files.length;i++){
      var item=files[i];
      var key=fileKey(item);
      if(draft.uploaded&&draft.uploaded[key])continue;
      try{
        var grant=await readJson(root.dataset.uploadEndpoint,{
          method:"POST",
          headers:{"content-type":"application/json",accept:"application/json"},
          body:JSON.stringify({
            application_ref:application.application_ref,
            application_token:application.application_token,
            kind:item.kind,
            filename:item.file.name,
            content_type:item.file.type,
            size:item.file.size
          })
        });
        await uploadBinary(grant.upload.url,grant.upload.content_type,item.file);
        draft.uploaded=draft.uploaded||{};
        draft.uploaded[key]=true;
        draft.pending_uploads=(draft.pending_uploads||[]).filter(function(entry){return entry.key!==key});
        uploaded++;
        persistDraft();
      }catch(error){}
    }
    var failed=(draft.pending_uploads||[]).length;
    return {uploaded:uploaded,failed:failed,message:failed?"ยังมีไฟล์ที่ต้อง Retry "+failed+" ไฟล์":"อัปโหลดไฟล์สำเร็จ "+uploaded+" ไฟล์"};
  }

  function fileKey(item){
    return [item.kind,item.file.name,item.file.size,item.file.type,item.file.lastModified||0].join(":");
  }

  function allowedFile(item){
    var types=item.kind==="profile_photo"?["image/jpeg","image/png","image/webp"]:["image/jpeg","image/png","image/webp","application/pdf"];
    return types.indexOf(item.file.type)>=0;
  }

  async function uploadBinary(url,contentType,file){
    var controller=new AbortController();
    var timeout=setTimeout(function(){controller.abort()},30000);
    try{
      var response=await fetch(url,{method:"PUT",headers:{"content-type":contentType},body:file,signal:controller.signal});
      if(!response.ok)throw new Error("upload failed");
    }finally{clearTimeout(timeout)}
  }

  async function readJson(url,init){
    var controller=new AbortController();
    var timeout=setTimeout(function(){controller.abort()},15000);
    var options=Object.assign({},init||{},{signal:controller.signal});
    try{
      var response=await fetch(url,options);
      var payload=await response.json().catch(function(){return null});
      if(!response.ok||!payload||payload.ok!==true){
        var message=payload&&payload.error&&payload.error.message||"MMS ยังรับข้อมูลไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้งครับ";
        if(payload&&payload.error&&Array.isArray(payload.error.details))message=payload.error.details.join(" · ");
        throw new Error(message);
      }
      return payload;
    }finally{clearTimeout(timeout)}
  }

  function openBranch(){
    if(!branchSheet.hidden)return;
    lastFocus=document.activeElement;
    previousBodyOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    branchSheet.hidden=false;
    branchTrigger.setAttribute("aria-expanded","true");
    branchPanel.focus();
  }

  function closeBranch(){
    if(branchSheet.hidden)return;
    branchSheet.hidden=true;
    document.body.style.overflow=previousBodyOverflow;
    branchTrigger.setAttribute("aria-expanded","false");
    if(lastFocus&&typeof lastFocus.focus==="function")lastFocus.focus();
  }

  function trapBranchFocus(event){
    if(event.key==="Escape"){event.preventDefault();closeBranch();return}
    if(event.key!=="Tab")return;
    var focusable=[].slice.call(branchSheet.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter(function(item){return !item.hidden});
    if(!focusable.length)return;
    var first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }

  function goToSection(id,updateHistory){
    var target=document.getElementById(id);
    if(!target)return;
    closeBranch();
    if(updateHistory&&history.pushState)history.pushState(null,"","#"+id);
    target.scrollIntoView({behavior:motion(),block:"start"});
    setCurrentSection(sectionMap.findIndex(function(item){return item.id===id}));
  }

  function goToNextSection(){
    var next=Math.min(sectionMap.length-1,currentSection+1);
    if(next===currentSection&&sectionMap[currentSection].id==="mta3-apply"){
      if(currentStep<5&&validateStep(currentStep))showStep(currentStep+1);
      return;
    }
    goToSection(sectionMap[next].id,true);
  }

  function updateSectionFromViewport(){
    var marker=Math.max(96,window.innerHeight*.3);
    var active=0;
    pageSections.forEach(function(section,index){if(section.getBoundingClientRect().top<=marker)active=index});
    setCurrentSection(active);
  }

  function setCurrentSection(index){
    currentSection=Math.max(0,Math.min(sectionMap.length-1,index));
    currentLabel.textContent=sectionMap[currentSection].label;
    branchProgress.textContent=pad(currentSection+1)+" / "+pad(sectionMap.length);
  }

  function syncFromHash(){
    var step=stepFromHash();
    if(step){showStep(step,true);goToSection("mta3-apply",false);return}
    var id=location.hash.replace(/^#/,"");
    if(sectionMap.some(function(item){return item.id===id}))goToSection(id,false);
  }

  function stepFromHash(){
    var match=location.hash.match(/^#mta3-apply-step-([1-5])$/);
    return match?Number(match[1]):0;
  }

  function selected(name){return[].slice.call(form.querySelectorAll('input[name="'+name+'"]:checked')).map(function(input){return input.value}).filter(Boolean)}
  function checked(name){var input=form.querySelector('input[name="'+name+'"]:checked');return input?input.value:""}
  function boolRadio(name){return checked(name)==="yes"}
  function value(name){return String(form.elements[name]&&form.elements[name].value||"").trim()}
  function skillLabel(code){var item=skills.find(function(skill){return skill[0]===code});return item?item[1]:code}
  function labelOf(name,code){var labels={customer_gender_scope:{male:"ผู้ชาย",female:"ผู้หญิง",both:"ได้ทั้งคู่"},mobility_scope:{local:"พื้นที่ฐานเป็นหลัก",nearby:"จังหวัดใกล้เคียง",nationwide:"ทั่วประเทศตามตกลง"}};return labels[name]&&labels[name][code]||code}
  function setError(text){var box=root.querySelector('[data-step="'+currentStep+'"] .mta-error');if(!box)return;box.textContent=String(text||"");if(text)box.scrollIntoView({behavior:motion(),block:"center"})}
  function clearError(){root.querySelectorAll(".mta-error").forEach(function(box){box.textContent=""})}
  function setBusy(button,state,text){button.disabled=state;button.setAttribute("aria-busy",String(state));button.textContent=text}
  function motion(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}
  function pad(number){return String(number).padStart(2,"0")}
  function newRequestId(){return"mmsapp_"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"_"+Math.random().toString(16).slice(2))}
  function throttle(fn,delay){var timer=0;return function(){if(timer)return;timer=setTimeout(function(){timer=0;fn()},delay)}}

  function saveDraft(){
    try{
      var data={
        request_id:draft.request_id||newRequestId(),
        application_ref:draft.application_ref||"",
        application_token:draft.application_token||"",
        pending_uploads:Array.isArray(draft.pending_uploads)?draft.pending_uploads:[],
        uploaded:draft.uploaded&&typeof draft.uploaded==="object"?draft.uploaded:{},
        fields:{}
      };
      ["applicant_name","nickname","phone","line_id","current_profession","qualification_note","work_base_area","coverage_area_note","experience_years","experience_months","strengths","spa_name","independent_social"].forEach(function(name){data.fields[name]=value(name)});
      ["gender_identity","customer_gender_scope","sexual_orientation","mobility_scope","worked_at_spa_before","worked_independently_before"].forEach(function(name){data.fields[name]=checked(name)});
      data.fields.skills=selected("skills");
      draft=data;
      persistDraft();
    }catch(error){}
  }

  function persistDraft(){
    try{localStorage.setItem(storageKey,JSON.stringify(draft))}catch(error){}
  }

  function loadDraft(){
    try{
      var data=JSON.parse(localStorage.getItem(storageKey)||"null");
      return data&&data.fields?data:{request_id:newRequestId(),fields:{},pending_uploads:[],uploaded:{}};
    }catch(error){return{request_id:newRequestId(),fields:{},pending_uploads:[],uploaded:{}}}
  }

  function restoreDraft(){
    var fields=draft.fields||{};
    Object.keys(fields).forEach(function(name){
      var val=fields[name];
      if(Array.isArray(val)){
        val.forEach(function(item){var input=form.querySelector('input[name="'+name+'"][value="'+item+'"]');if(input)input.checked=true});
      }else{
        var radio=form.querySelector('input[name="'+name+'"][value="'+cssEscape(val)+'"]');
        if(radio)radio.checked=true;
        else if(form.elements[name]&&typeof form.elements[name].value!=="undefined")form.elements[name].value=val;
      }
    });
    toggleSensitive();
    toggleConditional();
    updateSkillCount();
  }

  function cssEscape(value){
    if(window.CSS&&typeof window.CSS.escape==="function")return window.CSS.escape(String(value));
    return String(value).replace(/["\\]/g,"\\$&");
  }
})();
