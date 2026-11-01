(function(){
  "use strict";

  var root=document.getElementById("mta3");
  if(!root||root.dataset.bound==="true")return;

  var form=root.querySelector("#mta3-form");
  if(!form)return;
  var applySection=root.querySelector("#mta3-apply");
  var applicationTriggers=[].slice.call(root.querySelectorAll("[data-open-application]"));

  var panels=[].slice.call(root.querySelectorAll("[data-step]"));
  var stepButtons=[].slice.call(root.querySelectorAll("[data-step-link]"));
  var pageSections=[].slice.call(root.querySelectorAll("[data-page-section]"));
  var branchSheet=root.querySelector(".mta-sheet");
  var branchPanel=root.querySelector(".mta-sheet__panel");
  var branchTrigger=root.querySelector("[data-branch-open]");
  var currentLabel=root.querySelector("[data-current-label]");
  var branchProgress=root.querySelector("[data-branch-progress]");
  var menuMain=root.querySelector("[data-menu-main]");
  var menuApplication=root.querySelector("[data-menu-application]");
  var currentStep=1;
  var currentSection=0;
  var submitting=false;
  var uploadGrants=new Map();
  var submissionPercent=0;
  var lastFocus=null;
  var previousBodyOverflow="";
  var sheetTouchStartX=0;
  var sheetTouchStartY=0;
  var storageKey="mms_therapist_application_v3";
  var draft=loadDraft();
  var zoneState={status:"loading",provinces:[],zones:[],byCode:new Map()};
  var coverageSelected=new Set(Array.isArray(draft.fields&&draft.fields.coverage_service_zone_codes)?draft.fields.coverage_service_zone_codes:[]);
  var sectionMap=[
    {id:"mta3-overview",label:"เริ่มต้น"},
    {id:"mta3-story",label:"งานแบบ MMS"},
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
  var spaWrap=root.querySelector("[data-spa-name]");
  var socialWrap=root.querySelector("[data-social]");

  buildCatalog();
  restoreDraft();
  bind();
  initZones();
  root.dataset.bound="true";
  var initialStep=stepFromHash();
  if(initialStep||location.hash==="#mta3-apply")openApplication();
  showStep(initialStep||1,true);
  updateSectionFromViewport();
  initAccordions();
  initMotion();
  if(!applySection.hidden&&location.hash)requestAnimationFrame(function(){goToSection("mta3-apply",false)});

  function zoneLabel(zone){return zone?String(zone.safe_label_th||zone.label_th||zone.code||""):""}
  function coverageCodes(){return Array.from(coverageSelected).filter(function(code){return zoneState.byCode.has(code)&&code!==value("base_service_zone_code")})}
  function setZoneOptions(select,items,placeholder){
    select.replaceChildren();
    var empty=document.createElement("option");empty.value="";empty.textContent=placeholder;select.append(empty);
    items.forEach(function(item){var option=document.createElement("option");option.value=item.code;option.textContent=item.label;select.append(option)});
  }
  function zonesForProvince(code){return zoneState.zones.filter(function(zone){return zone.province_code===code}).sort(function(a,b){return Number(a.sort_order||9999)-Number(b.sort_order||9999)})}
  function renderBaseZones(restoreCode){
    var select=field("base_service_zone_code");
    setZoneOptions(select,zonesForProvince(value("base_service_province")).map(function(zone){return{code:zone.code,label:zoneLabel(zone)}}),"เลือก Zone หลัก");
    select.disabled=!value("base_service_province");
    if(restoreCode&&zoneState.byCode.has(restoreCode)&&zoneState.byCode.get(restoreCode).province_code===value("base_service_province"))select.value=restoreCode;
  }
  function renderCoverageZones(){
    var box=root.querySelector("[data-zone-options]");box.replaceChildren();
    var zones=zonesForProvince(value("coverage_service_province")).filter(function(zone){return zone.code!==value("base_service_zone_code")});
    if(!zones.length){var note=document.createElement("p");note.textContent=value("coverage_service_province")?"ไม่มี Zone เพิ่มในจังหวัดนี้":"เลือกจังหวัดเพื่อดู Zone เพิ่ม";box.append(note)}
    zones.forEach(function(zone){
      var label=document.createElement("label");label.className="mta-zone-option";
      var checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.name="coverage_service_zone_ui";checkbox.value=zone.code;checkbox.checked=coverageSelected.has(zone.code);
      var span=document.createElement("span");span.textContent=zoneLabel(zone)+(zone.admin_areas_th?" · "+zone.admin_areas_th:"");
      label.append(checkbox,span);box.append(label);
    });
    var selected=coverageCodes();
    root.querySelector("[data-zone-selected]").textContent=selected.length?"Zone เพิ่ม "+selected.length+" แห่ง: "+selected.map(function(code){return zoneLabel(zoneState.byCode.get(code))}).join(" · "):"ยังไม่ได้เลือก Zone เพิ่ม";
  }
  async function initZones(){
    var status=root.querySelector("[data-zone-status]");
    var controller=new AbortController();var timer=setTimeout(function(){controller.abort()},15000);
    try{
      var response=await fetch(root.dataset.serviceZoneEndpoint,{method:"GET",headers:{accept:"application/json"},credentials:"omit",signal:controller.signal});
      var payload=await response.json();
      if(!response.ok||!payload||payload.ok!==true||!payload.data||!Array.isArray(payload.data.provinces)||!Array.isArray(payload.data.zones))throw new Error("catalog unavailable");
      zoneState.provinces=payload.data.provinces.filter(function(province){return /^(BKK|NBI|PTE|SPK|SKN|NPT)$/.test(province.code||"")});
      zoneState.zones=payload.data.zones.filter(function(zone){return /^(BKK|NBI|PTE|SPK|SKN|NPT)-[A-Z0-9-]{2,70}$/.test(zone.code||"")&&zoneState.provinces.some(function(province){return province.code===zone.province_code})});
      if(!zoneState.provinces.length||!zoneState.zones.length)throw new Error("catalog empty");
      zoneState.byCode=new Map(zoneState.zones.map(function(zone){return[zone.code,zone]}));
      coverageSelected=new Set(Array.from(coverageSelected).filter(function(code){return zoneState.byCode.has(code)}));
      var provinces=zoneState.provinces.map(function(province){return{code:province.code,label:province.label_th||province.code}});
      var baseProvince=field("base_service_province");var coverageProvince=field("coverage_service_province");
      setZoneOptions(baseProvince,provinces,"เลือกจังหวัดหลัก");setZoneOptions(coverageProvince,provinces,"เลือกจังหวัดเพื่อดู Zone");
      baseProvince.disabled=false;coverageProvince.disabled=false;
      var savedProvince=draft.fields&&draft.fields.base_service_province;
      baseProvince.value=zoneState.provinces.some(function(province){return province.code===savedProvince})?savedProvince:(zoneState.provinces.some(function(province){return province.code==="BKK"})?"BKK":zoneState.provinces[0].code);
      renderBaseZones(draft.fields&&draft.fields.base_service_zone_code);
      renderCoverageZones();zoneState.status="ready";
      status.dataset.state="ready";status.textContent="เลือก Zone หลักที่เดินทางไปรับงานได้จริง เขตที่พักด้านบนเป็นข้อมูลประกอบครับ";
    }catch(error){zoneState.status="error";status.dataset.state="error";status.textContent="โหลด Service Zone ไม่สำเร็จ กรุณารีเฟรชก่อนส่งใบสมัครครับ"}
    finally{clearTimeout(timer)}
    field("base_service_province").addEventListener("change",function(){renderBaseZones("");coverageSelected.delete(value("base_service_zone_code"));renderCoverageZones();saveDraft()});
    field("base_service_zone_code").addEventListener("change",function(){coverageSelected.delete(value("base_service_zone_code"));renderCoverageZones();saveDraft()});
    field("coverage_service_province").addEventListener("change",renderCoverageZones);
    root.querySelector("[data-zone-options]").addEventListener("change",function(event){var input=event.target;if(!input||input.name!=="coverage_service_zone_ui")return;if(input.checked)coverageSelected.add(input.value);else coverageSelected.delete(input.value);renderCoverageZones();saveDraft()});
  }

  function initAccordions(){
    var accordions=[].slice.call(root.querySelectorAll(".mta-accordion"));
    accordions.forEach(function(accordion){
      accordion.addEventListener("toggle",function(){
        if(!accordion.open)return;
        accordions.forEach(function(other){if(other!==accordion&&other.open)other.open=false});
      });
    });
  }

  function initMotion(){
    var reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduced||!("IntersectionObserver" in window))return;
    var items=[].slice.call(root.querySelectorAll(
      ".mta-section__head,.mta-visual,.mta-story-card,.mta-client-mix article,.mta-services article,.mta-mobility,.mta-form-head,.mta-prep-card,.mta-form-stage"
    ));
    if(!items.length)return;
    items.forEach(function(item,index){
      item.classList.add("mta-reveal");
      item.style.setProperty("--mta-motion-delay",Math.min(index%4,3)*55+"ms");
    });
    root.classList.add("mta-motion-ready");
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(!entry.isIntersecting)return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },{rootMargin:"0px 0px -8% 0px",threshold:.08});
    requestAnimationFrame(function(){items.forEach(function(item){observer.observe(item)})});
  }

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
    applicationTriggers.forEach(function(trigger){
      trigger.addEventListener("click",function(event){
        event.preventDefault();
        goToSection("mta3-apply",true);
        root.querySelector("#mta7-form-title").focus({preventScroll:true});
      });
    });
    form.addEventListener("input",function(event){
      if(event.target.name==="skills")updateSkillCount();
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
    root.querySelectorAll("[data-menu-branch]").forEach(function(button){
      button.addEventListener("click",function(){showBranchLayer(button.dataset.menuBranch)});
    });
    root.querySelectorAll("[data-branch-back]").forEach(function(button){
      button.addEventListener("click",function(){showBranchLayer("main")});
    });
    branchTrigger.addEventListener("click",openBranch);
    root.querySelector("[data-branch-current]").addEventListener("click",openBranch);
    root.querySelector("[data-branch-next]").addEventListener("click",goToNextSection);
    branchSheet.addEventListener("keydown",trapBranchFocus);
    branchPanel.addEventListener("touchstart",startSheetSwipe,{passive:true});
    branchPanel.addEventListener("touchend",endSheetSwipe,{passive:true});
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
    root.dataset.appStep=String(number);
    syncAppProgress();
    if(number===5)renderReview();
    if(sectionMap[currentSection].id==="mta3-apply")updateApplicationProgress();
    clearError();
    if(!skipScroll){
      var heading=root.querySelector('[data-step="'+number+'"] h3');
      if(heading)heading.scrollIntoView({behavior:motion(),block:"start"});
    }
  }

  function validateUntil(last){
    for(var i=1;i<=last;i++){
      if(!validateStep(i))return false;
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
    if(number===1){
      if(!value("phone")&&!value("line_id")){message="กรุณาระบุเบอร์โทรหรือ LINE ID อย่างน้อยหนึ่งช่องครับ";valid=false}
      else if(value("preferred_contact")==="phone"&&!value("phone")){message="ถ้าต้องการให้โทรกลับ กรุณาระบุเบอร์โทรครับ";valid=false}
      else if(value("preferred_contact")==="line"&&!value("line_id")){message="ถ้าต้องการให้ติดต่อทาง LINE กรุณาระบุ LINE ID ครับ";valid=false}
    }
    if(number===3){
      var count=selected("skills").length;
      if(count<1||count>8){message="กรุณาเลือก Skill 1–8 รายการครับ";valid=false}
      if(!selected("availability_summary").length){message="กรุณาเลือกช่วงเวลาที่สะดวกรับงานครับ";valid=false}
      if(!selected("transport_modes").length){message="กรุณาเลือกวิธีเดินทางครับ";valid=false}
    }
    if(number===2&&!selected("languages").length){message="กรุณาเลือกภาษาที่สื่อสารได้ครับ";valid=false}
    if(number===4){
      var baseCode=value("base_service_zone_code");
      if(zoneState.status!=="ready"){message="ยังโหลด Service Zone ไม่สำเร็จ กรุณาลองรีเฟรชหน้าอีกครั้งครับ";valid=false}
      else if(!zoneState.byCode.has(baseCode)){message="กรุณาเลือก Service Zone หลักที่รับงานได้จริงครับ";valid=false}
      else if(coverageCodes().length>45){message="เลือก Zone เพิ่มได้ไม่เกิน 45 พื้นที่ครับ";valid=false}
      var background=value("experience_background");
      if(background==="no_experience"&&(Number(value("experience_years"))>0||Number(value("experience_months"))>0||boolRadio("worked_at_spa_before")||boolRadio("worked_independently_before"))){message="เลือกว่ายังไม่มีประสบการณ์ แต่ระบุว่าเคยทำงานแล้ว กรุณาตรวจอีกครั้งครับ";valid=false}
      if(background==="spa_closed_venue"&&!boolRadio("worked_at_spa_before")){message="ถ้าเคยทำงานร้านหรือสปา กรุณาเลือก ‘เคย’ ด้านล่างครับ";valid=false}
      if(background==="independent_client_work"&&!boolRadio("worked_independently_before")){message="ถ้าเคยรับลูกค้าด้วยตัวเอง กรุณาเลือก ‘เคย’ ด้านล่างครับ";valid=false}
      if(boolRadio("worked_at_spa_before")&&!value("spa_name")){message="กรุณาระบุชื่อร้านหรือสปาครับ";valid=false}
      if(boolRadio("worked_independently_before")&&!value("independent_social")){message="กรุณาระบุ Social Media หรือช่องทางอ้างอิงครับ";valid=false}
    }
    if(!valid){
      if(currentStep!==number)showStep(number);
      var invalid=panel.querySelector(":invalid");
      if(invalid&&typeof invalid.reportValidity==="function")invalid.reportValidity();
      setError(message);
    }
    return valid;
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
      ["พื้นที่พัก",[value("residence_area"),value("residence_province")].filter(Boolean).join(" · ")],
      ["Zone รับงานหลัก",zoneLabel(zoneState.byCode.get(value("base_service_zone_code")))],
      ["รูปแบบงาน",labelOf("work_preference",checked("work_preference"))],
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

    saveDraft();
    queueFiles(files);
    submitting=true;
    var button=form.querySelector('button[type="submit"]');
    setBusy(button,true,"กำลังส่ง…");
    submissionPercent=0;
    setSubmissionProgress(0,"กำลังส่งใบสมัคร");
    try{
      var payload=draft.submitted_payload||applicationPayload();
      draft.submitted_payload=payload;
      persistDraft();
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
      if(!result.storage||result.storage.airtable!=="synced"){
        throw new Error("บันทึกคำขอไว้แล้ว แต่ MMS ยังรับใบสมัครในระบบไม่ครบ กรุณากดส่งอีกครั้งด้วยข้อมูลเดิมครับ เลขอ้างอิง "+applicationRef);
      }

      setSubmissionProgress(40,"รับข้อมูลแล้ว กำลังตรวจไฟล์แนบ");
      var uploadResult=await uploadFiles(files,{application_ref:applicationRef,application_token:applicationToken});
      if(uploadResult.failed){
        throw new Error("รับใบสมัครแล้ว แต่ยังมีไฟล์อัปโหลดไม่สำเร็จ "+uploadResult.failed+" ไฟล์ กรุณาเลือกไฟล์ที่ค้างและกดส่งอีกครั้ง โดยใช้ Reference "+applicationRef);
      }

      try{localStorage.removeItem(storageKey)}catch(error){}
      setSubmissionProgress(100,"รับใบสมัครและไฟล์แนบครบแล้ว");
      form.hidden=true;
      root.querySelector(".mta-steps").hidden=true;
      var success=root.querySelector(".mta-success");
      success.hidden=false;
      root.querySelector("[data-reference]").textContent="Reference: "+applicationRef;
      root.querySelector("[data-upload-status]").textContent=uploadResult.message;
      success.focus();
      success.scrollIntoView({behavior:motion(),block:"center"});
    }catch(error){
      setSubmissionProgress(submissionPercent,"ยังส่งไม่ครบ กดส่งอีกครั้งเพื่อทำต่อ");
      setError(error&&error.message||"ส่งใบสมัครไม่สำเร็จ กรุณาลองใหม่อีกครั้งครับ");
    }finally{
      submitting=false;
      setBusy(button,false,"ส่งใบสมัคร");
    }
  }

  function applicationPayload(){
    return {
      idempotency_key:draft.request_id||newRequestId(),
      applicant_name:value("applicant_name"),
      nickname:value("nickname"),
      phone:value("phone"),
      line_id:value("line_id"),
      age:Number(value("age")),
      height_cm:Number(value("height_cm")),
      weight_kg:Number(value("weight_kg")),
      preferred_contact:value("preferred_contact"),
      current_profession:value("current_profession"),
      qualification_note:value("qualification_note"),
      gender_identity:checked("gender_identity"),
      customer_gender_scope:checked("customer_gender_scope"),
      work_preference:checked("work_preference"),
      languages:selected("languages"),
      skills:selected("skills"),
      residence_province:value("residence_province"),
      residence_area:value("residence_area"),
      base_service_zone_code:value("base_service_zone_code"),
      coverage_service_zone_codes:coverageCodes(),
      work_base_area:zoneLabel(zoneState.byCode.get(value("base_service_zone_code"))),
      mobility_scope:checked("mobility_scope"),
      lead_time_preference:value("lead_time_preference"),
      availability_summary:selected("availability_summary"),
      transport_modes:selected("transport_modes"),
      coverage_area_note:value("coverage_area_note"),
      experience_years:Number(value("experience_years")||0),
      experience_months:Number(value("experience_months")||0),
      experience_background:value("experience_background"),
      has_massage_experience:value("experience_background")!=="no_experience",
      professional_massage_experience:boolRadio("worked_at_spa_before")||boolRadio("worked_independently_before"),
      workshop_interest:value("workshop_interest"),
      strengths:value("strengths"),
      worked_at_spa_before:boolRadio("worked_at_spa_before"),
      spa_name:value("spa_name"),
      worked_independently_before:boolRadio("worked_independently_before"),
      independent_social:value("independent_social"),
      general_consent:field("general_consent").checked,
      language:"th"
    };
  }

  function collectFiles(){
    var result=[];
    var photo=field("profile_photo").files[0];
    if(photo)result.push({kind:"profile_photo",file:photo});
    [].slice.call(field("certificates").files||[]).forEach(function(file){result.push({kind:"certificate",file:file})});
    return result;
  }

  function queueFiles(files){
    var seen={};
    draft.pending_uploads=(Array.isArray(draft.pending_uploads)?draft.pending_uploads:[]).filter(function(entry){
      var normalizedKey=fileKey({kind:entry.kind,file:{name:entry.name,size:entry.size,type:entry.type}});
      if(seen[normalizedKey])return false;
      seen[normalizedKey]=true;
      entry.key=normalizedKey;
      return true;
    });
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
        var grant=uploadGrants.get(key);
        if(!grant)grant=await readJson(root.dataset.uploadEndpoint,{
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
        uploadGrants.set(key,grant);
        var upload=await uploadBinary(grant.upload.url,grant.upload.content_type,item.file);
        if(upload.application_id!==application.application_ref||upload.kind!==item.kind||upload.storage.airtable!=="synced")throw new Error("upload_not_linked");
        draft.uploaded=draft.uploaded||{};
        draft.uploaded[key]=true;
        draft.pending_uploads=(draft.pending_uploads||[]).filter(function(entry){return entry.key!==key});
        uploaded++;
        setSubmissionProgress(40+Math.floor(55*(i+1)/files.length),"รับไฟล์แล้ว "+(i+1)+" / "+files.length);
        persistDraft();
      }catch(error){if(error&&error.status===409)uploadGrants.delete(key)}
    }
    var failed=(draft.pending_uploads||[]).length;
    return {uploaded:uploaded,failed:failed,message:failed?"ยังมีไฟล์ที่ต้องส่งอีกครั้ง "+failed+" ไฟล์":"รับไฟล์แนบครบแล้ว"};
  }

  function fileKey(item){
    return [item.kind,item.file.name,item.file.size,item.file.type].join(":");
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
      var payload=await response.json().catch(function(){return null});
      if(!response.ok||!payload||payload.ok!==true||!payload.storage||payload.storage.r2!=="stored"){var failure=new Error("upload failed");failure.status=response.status;throw failure;}
      return payload;
    }finally{clearTimeout(timeout)}
  }

  async function readJson(url,init){
    var controller=new AbortController();
    var timeout=setTimeout(function(){controller.abort()},45000);
    var options=Object.assign({},init||{},{signal:controller.signal});
    try{
      var response=await fetch(url,options);
      var payload=await response.json().catch(function(){return null});
      if(!response.ok||!payload||payload.ok!==true){
        if(payload&&payload.error&&payload.error.code==="IDEMPOTENCY_CONFLICT"){
          throw new Error("ข้อมูลเปลี่ยนหลังจากส่งคำขอครั้งแรก กรุณาติดต่อ MMS พร้อมเลขอ้างอิง "+(draft.application_ref||"ที่เคยได้รับ")+" เพื่อแก้ไขครับ");
        }
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
    showBranchLayer("main",true);
    branchSheet.hidden=false;
    branchTrigger.setAttribute("aria-expanded","true");
    branchPanel.focus();
  }

  function closeBranch(){
    if(branchSheet.hidden)return;
    branchSheet.hidden=true;
    document.body.style.overflow=previousBodyOverflow;
    branchTrigger.setAttribute("aria-expanded","false");
    showBranchLayer("main",true);
    if(lastFocus&&typeof lastFocus.focus==="function")lastFocus.focus();
  }

  function showBranchLayer(name,skipFocus){
    var showApplication=name==="application";
    menuMain.hidden=showApplication;
    menuApplication.hidden=!showApplication;
    if(skipFocus)return;
    var first=(showApplication?menuApplication:menuMain).querySelector("button");
    if(first)first.focus();
  }

  function startSheetSwipe(event){
    var touch=event.changedTouches&&event.changedTouches[0];
    if(!touch)return;
    sheetTouchStartX=touch.clientX;
    sheetTouchStartY=touch.clientY;
  }

  function endSheetSwipe(event){
    var touch=event.changedTouches&&event.changedTouches[0];
    if(!touch)return;
    var deltaX=touch.clientX-sheetTouchStartX;
    var deltaY=touch.clientY-sheetTouchStartY;
    if(deltaY>72&&Math.abs(deltaY)>Math.abs(deltaX)*1.2)closeBranch();
  }

  function trapBranchFocus(event){
    if(event.key==="Escape"){event.preventDefault();closeBranch();return}
    if(event.key!=="Tab")return;
    var focusable=[].slice.call(branchSheet.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter(function(item){return !item.hidden&&!item.closest("[hidden]")});
    if(!focusable.length)return;
    var first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }

  function goToSection(id,updateHistory){
    var target=document.getElementById(id);
    if(!target)return;
    if(id==="mta3-apply")openApplication();
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
    sectionMap.forEach(function(item,index){var section=document.getElementById(item.id);if(section&&!section.hidden&&section.getBoundingClientRect().top<=marker)active=index});
    setCurrentSection(active);
  }

  function openApplication(){
    if(!applySection.hidden)return;
    applySection.hidden=false;
    root.dataset.applicationOpen="true";
    applicationTriggers.forEach(function(trigger){trigger.setAttribute("aria-expanded","true")});
  }

  function setCurrentSection(index){
    currentSection=Math.max(0,Math.min(sectionMap.length-1,index));
    root.dataset.appActive=String(sectionMap[currentSection].id==="mta3-apply");
    if(sectionMap[currentSection].id==="mta3-apply"){
      updateApplicationProgress();
    }else{
      currentLabel.textContent=sectionMap[currentSection].label;
      branchProgress.textContent=pad(currentSection+1)+" / "+pad(sectionMap.length);
    }
  }

  function syncAppProgress(){
    var stage=root.querySelector(".mta-form-stage");
    var indicator=root.querySelector(".mta-app-progress");
    if(!indicator&&stage){indicator=document.createElement("div");indicator.className="mta-app-progress";indicator.setAttribute("role","status");indicator.setAttribute("aria-live","polite");stage.insertBefore(indicator,stage.firstChild);}
    var panel=panels.find(function(item){return Number(item.dataset.step)===currentStep});
    var heading=panel&&panel.querySelector("h3");
    if(indicator){indicator.replaceChildren();var label=document.createElement("span");label.textContent=heading?heading.textContent:"ใบสมัคร";var count=document.createElement("span");count.textContent="ขั้น "+currentStep+" / "+panels.length;indicator.append(label,count);}
  }

  function updateApplicationProgress(){
    var panel=panels.find(function(item){return Number(item.dataset.step)===currentStep});
    var heading=panel&&panel.querySelector("h3");
    currentLabel.textContent=heading?heading.textContent:"ใบสมัคร";
    branchProgress.textContent=pad(currentStep)+" / "+pad(panels.length);
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
  function field(name){return form.elements.namedItem(name)}
  function value(name){var control=field(name);return String(control&&control.value||"").trim()}
  function skillLabel(code){var item=skills.find(function(skill){return skill[0]===code});return item?item[1]:code}
  function labelOf(name,code){var labels={customer_gender_scope:{male:"ผู้ชาย",female:"ผู้หญิง",both:"ได้ทั้งคู่"},work_preference:{mms_mobile_online:"MMS รับงานนอกสถานที่",relax_spa_only:"Relax Spa",both:"ทั้งสองแบบ"},mobility_scope:{local:"พื้นที่ฐานเป็นหลัก",nearby:"จังหวัดใกล้เคียง",nationwide:"ทั่วประเทศตามตกลง"}};return labels[name]&&labels[name][code]||code}
  function setError(text){var box=root.querySelector('[data-step="'+currentStep+'"] .mta-error');if(!box)return;box.textContent=String(text||"");if(text)box.scrollIntoView({behavior:motion(),block:"center"})}
  function clearError(){root.querySelectorAll(".mta-error").forEach(function(box){box.textContent=""})}
  function setSubmissionProgress(percent,message){
    submissionPercent=Math.max(0,Math.min(100,percent));
    var box=root.querySelector("[data-submit-progress]");
    if(!box)return;
    box.hidden=false;
    box.querySelector("progress").value=submissionPercent;
    box.querySelector("[data-submit-percent]").textContent=submissionPercent+"%";
    box.querySelector("[data-submit-message]").textContent=message;
  }
  function setBusy(button,state,text){button.disabled=state;button.setAttribute("aria-busy",String(state));button.textContent=text}
  function motion(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}
  function pad(number){return String(number).padStart(2,"0")}
  function newRequestId(){return"mmsapp_"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"_"+Math.random().toString(16).slice(2))}
  function throttle(fn,delay){var timer=0;return function(){if(timer)return;timer=setTimeout(function(){timer=0;fn()},delay)}}

  function saveDraft(){
    try{
      var data={
        submitted_payload:draft.submitted_payload||null,
        request_id:draft.request_id||newRequestId(),
        application_ref:draft.application_ref||"",
        application_token:draft.application_token||"",
        pending_uploads:Array.isArray(draft.pending_uploads)?draft.pending_uploads:[],
        uploaded:draft.uploaded&&typeof draft.uploaded==="object"?draft.uploaded:{},
        fields:{}
      };
      ["applicant_name","nickname","phone","line_id","age","height_cm","weight_kg","preferred_contact","current_profession","qualification_note","residence_province","residence_area","base_service_province","base_service_zone_code","lead_time_preference","coverage_area_note","experience_background","experience_years","experience_months","workshop_interest","strengths","spa_name","independent_social"].forEach(function(name){data.fields[name]=value(name)});
      ["gender_identity","customer_gender_scope","work_preference","mobility_scope","worked_at_spa_before","worked_independently_before"].forEach(function(name){data.fields[name]=checked(name)});
      ["skills","languages","availability_summary","transport_modes"].forEach(function(name){data.fields[name]=selected(name)});
      data.fields.coverage_service_zone_codes=coverageCodes();
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
        else{var control=field(name);if(control&&typeof control.value!=="undefined")control.value=val}
      }
    });
    toggleConditional();
    updateSkillCount();
  }

  function cssEscape(value){
    if(window.CSS&&typeof window.CSS.escape==="function")return window.CSS.escape(String(value));
    return String(value).replace(/["\\]/g,"\\$&");
  }
})();

(function(){
  "use strict";
  var root=document.getElementById("mta3");
  if(!root)return;
  var head=root.querySelector(".mta7-head");
  var queued=false;
  function update(){if(queued)return;queued=true;requestAnimationFrame(function(){head.classList.toggle("is-scrolled",scrollY>12);queued=false})}
  addEventListener("scroll",update,{passive:true});update();
  if(matchMedia("(prefers-reduced-motion: reduce)").matches||!("IntersectionObserver" in window))return;
  var cards=[].slice.call(root.querySelectorAll(".mta7-card"));
  cards.forEach(function(card){card.classList.add("mta-reveal")});
  var io=new IntersectionObserver(function(entries,observer){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target)}})},{threshold:.06});
  root.classList.add("mta-motion-ready");
  cards.forEach(function(card){io.observe(card)});
})();
