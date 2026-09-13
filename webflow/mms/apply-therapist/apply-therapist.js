(function(){
  "use strict";

  var root=document.getElementById("mta3");
  if(!root||root.dataset.bound==="v4")return;
  var stage=root.querySelector(".mta-form-stage");
  if(!stage)return;
  root.dataset.bound="v4";
  root.dataset.version="6";

  var skills=[
    ["aroma_therapy_oil","Aroma Therapy Oil Massage"],
    ["thai_massage","Thai Massage"],
    ["sport_massage","Sport Massage"],
    ["office_syndrome","Office Syndrome"],
    ["health_fitness_advisor","Health & Fitness Advisor"],
    ["thai_herbal_compress","Thai Herbal Compress"],
    ["partner_present","Partner-Present Massage"],
    ["women_massage","Women Massage"]
  ];
  var skillHtml=skills.map(function(item){return '<label><input type="checkbox" name="skills" value="'+item[0]+'"><span>'+item[1]+'</span></label>';}).join("");

  stage.innerHTML='\
    <nav class="mta-steps" aria-label="ขั้นตอนใบสมัคร">\
      <button type="button" data-step-link="1" aria-current="step"><b>01</b><span>ติดต่อ</span></button>\
      <button type="button" data-step-link="2"><b>02</b><span>ข้อมูลส่วนตัว</span></button>\
      <button type="button" data-step-link="3"><b>03</b><span>ลูกค้า &amp; งาน</span></button>\
      <button type="button" data-step-link="4"><b>04</b><span>Skills &amp; พื้นที่</span></button>\
      <button type="button" data-step-link="5"><b>05</b><span>ประสบการณ์</span></button>\
      <button type="button" data-step-link="6"><b>06</b><span>รูป &amp; ยืนยัน</span></button>\
    </nav>\
    <form id="mta3-form" novalidate>\
      <section class="mta-panel" data-step="1">\
        <div class="mta-panel__head"><span>01</span><div><h3>ข้อมูลติดต่อ</h3><p>ใช้สำหรับติดต่อกลับและนัดคุยรายละเอียดเท่านั้นครับ</p></div></div>\
        <div class="mta-grid">\
          <label class="mta-field mta-span-2"><span>ชื่อ–นามสกุล *</span><input name="applicant_name" autocomplete="name" required maxlength="160"></label>\
          <label class="mta-field"><span>ชื่อเล่น</span><input name="nickname" maxlength="80"></label>\
          <label class="mta-field"><span>เบอร์โทร</span><input name="phone" type="tel" maxlength="40"></label>\
          <label class="mta-field mta-span-2"><span>LINE ID</span><input name="line_id" maxlength="100"><small>กรอกเบอร์โทรหรือ LINE ID อย่างน้อยหนึ่งช่อง</small></label>\
        </div>\
        <fieldset><legend>ช่องทางที่สะดวกให้ MMS ติดต่อ *</legend><div class="mta-options mta-options--3"><label><input type="radio" name="preferred_contact" value="line" required><span>LINE</span></label><label><input type="radio" name="preferred_contact" value="phone"><span>โทรศัพท์</span></label><label><input type="radio" name="preferred_contact" value="either"><span>ได้ทั้งคู่</span></label></div></fieldset>\
        <label class="mta-field"><span>ช่วงเวลาที่สะดวกให้ติดต่อ</span><input name="preferred_contact_time" maxlength="160" placeholder="เช่น 18:00–21:00"></label>\
        <p class="mta-error" role="alert"></p><div class="mta-actions"><span></span><button class="mta-button" type="button" data-next>ถัดไป</button></div>\
      </section>\
      <section class="mta-panel" data-step="2" hidden>\
        <div class="mta-panel__head"><span>02</span><div><h3>ข้อมูลส่วนตัว</h3><p>เก็บเท่าที่จำเป็นสำหรับการคัดเลือกและวางแผนพื้นที่รับงาน</p></div></div>\
        <div class="mta-grid">\
          <label class="mta-field"><span>อายุ *</span><input name="age" type="number" min="20" max="80" required></label>\
          <label class="mta-field"><span>ส่วนสูง (ซม.) *</span><input name="height_cm" type="number" min="120" max="230" required></label>\
          <label class="mta-field"><span>น้ำหนัก (กก.) *</span><input name="weight_kg" type="number" min="35" max="250" required></label>\
          <label class="mta-field"><span>ภูมิลำเนา / จังหวัดเดิม</span><input name="home_province" maxlength="120"></label>\
          <label class="mta-field"><span>ปัจจุบันอาศัยอยู่จังหวัด *</span><input name="residence_province" required maxlength="120"></label>\
          <label class="mta-field"><span>เขต / อำเภอ / บริเวณใกล้เคียง *</span><input name="residence_area" required maxlength="180" placeholder="ไม่ต้องระบุบ้านเลขที่"></label>\
          <label class="mta-field mta-span-2"><span>อาชีพปัจจุบัน *</span><input name="current_profession" required maxlength="200"></label>\
          <label class="mta-field mta-span-2"><span>วุฒิ ใบอนุญาต หรือหลักสูตรที่เกี่ยวข้อง</span><textarea name="qualification_note" rows="3" maxlength="1200"></textarea></label>\
        </div>\
        <fieldset><legend>เพศของผู้สมัคร *</legend><div class="mta-options"><label><input type="radio" name="gender_identity" value="male" required><span>ชาย</span></label><label><input type="radio" name="gender_identity" value="prefer_not_to_say"><span>ไม่ประสงค์ระบุ</span></label></div></fieldset>\
        <fieldset class="mta-sensitive"><legend>รสนิยมทางเพศ</legend><p>ข้อมูลนี้เป็นข้อมูลอ่อนไหว เก็บแยกสำหรับบริบทการทำงานภายในเท่านั้น ไม่แสดงต่อสาธารณะ และไม่ใช้ตัดสินอนุมัติใบสมัครอัตโนมัติ</p><div class="mta-options mta-options--4"><label><input type="radio" name="sexual_orientation" value="straight"><span>Straight / ชายแท้</span></label><label><input type="radio" name="sexual_orientation" value="bi"><span>Bi / ไบ</span></label><label><input type="radio" name="sexual_orientation" value="gay"><span>Gay / เกย์</span></label><label><input type="radio" name="sexual_orientation" value="prefer_not_to_say"><span>ไม่ประสงค์ระบุ</span></label></div><label class="mta-consent"><input type="checkbox" name="sensitive_consent"><span>ยินยอมให้ MMS จัดเก็บข้อมูลนี้แบบจำกัดสิทธิ์เพื่อบริบทการทำงานภายใน</span></label></fieldset>\
        <p class="mta-error" role="alert"></p><div class="mta-actions"><button class="mta-button mta-button--ghost" type="button" data-back>ย้อนกลับ</button><button class="mta-button" type="button" data-next>ถัดไป</button></div>\
      </section>\
      <section class="mta-panel" data-step="3" hidden>\
        <div class="mta-panel__head"><span>03</span><div><h3>ลูกค้าและรูปแบบงาน</h3><p>เลือกตามขอบเขตที่คุณสะดวกจริง ๆ</p></div></div>\
        <fieldset><legend>สนใจทำงานกับลูกค้ากลุ่มไหน *</legend><div class="mta-options mta-options--3"><label><input type="radio" name="customer_gender_scope" value="male_or_gender_diverse" required><span>ผู้ชายหรือเพศหลากหลาย</span></label><label><input type="radio" name="customer_gender_scope" value="female"><span>ผู้หญิง</span></label><label><input type="radio" name="customer_gender_scope" value="both"><span>ได้ทั้งคู่</span></label></div></fieldset>\
        <fieldset><legend>รูปแบบงานที่สนใจ *</legend><div class="mta-options mta-options--3"><label><input type="radio" name="work_preference" value="mms_mobile_online" required><span>MMS · เดินทางหาลูกค้า</span></label><label><input type="radio" name="work_preference" value="relax_spa_only"><span>Relax Spa เท่านั้น</span></label><label><input type="radio" name="work_preference" value="both"><span>สนใจทั้งสองแบบ</span></label></div></fieldset>\
        <fieldset><legend>เคยให้บริการแบบ Partner-Present / ลูกค้ามาพร้อมคู่หรือผู้ติดตามไหม?</legend><div class="mta-options"><label><input type="radio" name="partner_present_experience" value="yes"><span>เคย</span></label><label><input type="radio" name="partner_present_experience" value="no" checked><span>ไม่เคย</span></label></div></fieldset>\
        <fieldset><legend>ภาษาที่สื่อสารได้ *</legend><div class="mta-options mta-options--4"><label><input type="checkbox" name="languages" value="th"><span>ไทย</span></label><label><input type="checkbox" name="languages" value="en"><span>English</span></label><label><input type="checkbox" name="languages" value="zh"><span>中文</span></label><label><input type="checkbox" name="languages" value="other"><span>อื่น ๆ</span></label></div></fieldset>\
        <p class="mta-error" role="alert"></p><div class="mta-actions"><button class="mta-button mta-button--ghost" type="button" data-back>ย้อนกลับ</button><button class="mta-button" type="button" data-next>ถัดไป</button></div>\
      </section>\
      <section class="mta-panel" data-step="4" hidden>\
        <div class="mta-panel__head"><span>04</span><div><h3>Skills พื้นที่ และเวลา</h3><p>ข้อมูลช่วงเวลานี้เป็นความสะดวกโดยทั่วไป ไม่ใช่การล็อกคิว</p></div></div>\
        <fieldset><legend>Skills ที่ทำได้จริง *</legend><div class="mta-skill-grid">'+skillHtml+'</div></fieldset>\
        <div class="mta-grid"><label class="mta-field mta-span-2"><span>พื้นที่ฐานที่สะดวกรับงาน *</span><input name="work_base_area" required maxlength="240"></label><fieldset class="mta-span-2"><legend>ขอบเขตการเดินทาง *</legend><div class="mta-options mta-options--3"><label><input type="radio" name="mobility_scope" value="local" required><span>พื้นที่ฐานเป็นหลัก</span></label><label><input type="radio" name="mobility_scope" value="nearby"><span>จังหวัดใกล้เคียง</span></label><label><input type="radio" name="mobility_scope" value="nationwide"><span>ทั่วประเทศตามตกลง</span></label></div></fieldset><label class="mta-field mta-span-2"><span>พื้นที่อื่นที่สะดวกเดินทาง</span><textarea name="coverage_area_note" rows="3" maxlength="1200"></textarea></label></div>\
        <fieldset><legend>ช่วงเวลาที่มักสะดวก *</legend><div class="mta-options mta-options--4"><label><input type="checkbox" name="availability_summary" value="weekday_daytime"><span>วันธรรมดา · กลางวัน</span></label><label><input type="checkbox" name="availability_summary" value="weekday_evening"><span>วันธรรมดา · เย็น</span></label><label><input type="checkbox" name="availability_summary" value="weekend_daytime"><span>เสาร์–อาทิตย์ · กลางวัน</span></label><label><input type="checkbox" name="availability_summary" value="weekend_evening"><span>เสาร์–อาทิตย์ · เย็น</span></label><label><input type="checkbox" name="availability_summary" value="late_night"><span>ดึก / ตามตกลง</span></label></div></fieldset>\
        <fieldset><legend>ปกติต้องการแจ้งงานล่วงหน้า *</legend><div class="mta-options"><label><input type="radio" name="lead_time_preference" value="two_hours" required><span>2 ชม.</span></label><label><input type="radio" name="lead_time_preference" value="four_hours"><span>4 ชม.</span></label><label><input type="radio" name="lead_time_preference" value="same_day"><span>ภายในวัน</span></label><label><input type="radio" name="lead_time_preference" value="one_day"><span>1 วัน</span></label><label><input type="radio" name="lead_time_preference" value="two_plus_days"><span>2+ วัน</span></label></div></fieldset>\
        <fieldset><legend>การเดินทาง *</legend><div class="mta-options mta-options--4"><label><input type="checkbox" name="transport_modes" value="car"><span>รถยนต์</span></label><label><input type="checkbox" name="transport_modes" value="motorcycle"><span>มอเตอร์ไซค์</span></label><label><input type="checkbox" name="transport_modes" value="public_transit"><span>ขนส่งสาธารณะ</span></label><label><input type="checkbox" name="transport_modes" value="ride_hailing"><span>Taxi / Ride-hailing</span></label><label><input type="checkbox" name="transport_modes" value="other"><span>อื่น ๆ</span></label></div></fieldset>\
        <p class="mta-error" role="alert"></p><div class="mta-actions"><button class="mta-button mta-button--ghost" type="button" data-back>ย้อนกลับ</button><button class="mta-button" type="button" data-next>ถัดไป</button></div>\
      </section>\
      <section class="mta-panel" data-step="5" hidden>\
        <div class="mta-panel__head"><span>05</span><div><h3>ประสบการณ์</h3><p>ไม่เคยทำก็สมัครได้ครับ ข้อมูลนี้ช่วยให้ MMS เลือก Workshop หรือขั้นตอนนัดคุยที่เหมาะ</p></div></div>\
        <fieldset><legend>เคยมีประสบการณ์นวดไหม? *</legend><div class="mta-options"><label><input type="radio" name="has_massage_experience" value="yes" required><span>เคย</span></label><label><input type="radio" name="has_massage_experience" value="no"><span>ไม่เคย</span></label></div></fieldset>\
        <fieldset><legend>เคยนวดเป็นงานหรือเป็นอาชีพไหม? *</legend><div class="mta-options"><label><input type="radio" name="professional_massage_experience" value="yes" required><span>เคย</span></label><label><input type="radio" name="professional_massage_experience" value="no"><span>ไม่เคย</span></label></div></fieldset>\
        <fieldset><legend>ประสบการณ์ของคุณใกล้เคียงแบบไหนที่สุด? *</legend><div class="mta-options"><label><input type="radio" name="experience_background" value="no_experience" required><span>ไม่เคยมีประสบการณ์</span></label><label><input type="radio" name="experience_background" value="informal_self_taught"><span>เรียนรู้เอง / ครูพักลักจำ</span></label><label><input type="radio" name="experience_background" value="independent_client_work"><span>เคยรับลูกค้าด้วยตัวเอง</span></label><label><input type="radio" name="experience_background" value="spa_closed_venue"><span>เคยทำร้าน / สปา / สถานที่ปิด</span></label></div></fieldset>\
        <div class="mta-grid"><label class="mta-field"><span>ประสบการณ์ (ปี)</span><input name="experience_years" type="number" min="0" max="60" value="0"></label><label class="mta-field"><span>เพิ่มเติม (เดือน)</span><input name="experience_months" type="number" min="0" max="11" value="0"></label><label class="mta-field mta-span-2"><span>จุดแข็งและรายละเอียดประสบการณ์</span><textarea name="strengths" rows="4" maxlength="3000"></textarea></label></div>\
        <fieldset><legend>เคยทำงานร้านหรือสปาหรือไม่</legend><div class="mta-options"><label><input type="radio" name="worked_at_spa_before" value="yes"><span>เคย</span></label><label><input type="radio" name="worked_at_spa_before" value="no" checked><span>ไม่เคย</span></label></div><label class="mta-field" data-spa-name hidden><span>ชื่อร้านหรือสปา *</span><input name="spa_name" maxlength="160"></label></fieldset>\
        <fieldset><legend>เคยรับงานนวดด้วยตัวเองหรือไม่</legend><div class="mta-options"><label><input type="radio" name="worked_independently_before" value="yes"><span>เคย</span></label><label><input type="radio" name="worked_independently_before" value="no" checked><span>ไม่เคย</span></label></div><label class="mta-field" data-social hidden><span>Social Media หรือช่องทางอ้างอิง *</span><input name="independent_social" maxlength="240"></label></fieldset>\
        <fieldset><legend>ถ้า MMS แนะนำ Workshop / Assessment คุณสะดวกแบบไหน? *</legend><div class="mta-options mta-options--3"><label><input type="radio" name="workshop_interest" value="ready" required><span>พร้อมเข้า Workshop</span></label><label><input type="radio" name="workshop_interest" value="discuss_first"><span>ขอคุยก่อน</span></label><label><input type="radio" name="workshop_interest" value="assess_first"><span>มีประสบการณ์ ขอประเมินก่อน</span></label></div></fieldset>\
        <label class="mta-field"><span>ทำไมถึงสนใจทำงานกับ MMS?</span><textarea name="motivation" rows="4" maxlength="1200"></textarea></label>\
        <p class="mta-error" role="alert"></p><div class="mta-actions"><button class="mta-button mta-button--ghost" type="button" data-back>ย้อนกลับ</button><button class="mta-button" type="button" data-next>ถัดไป</button></div>\
      </section>\
      <section class="mta-panel" data-step="6" hidden>\
        <div class="mta-panel__head"><span>06</span><div><h3>รูป เอกสาร และการยืนยัน</h3><p>รูปและไฟล์ผู้สมัครเก็บใน Private R2 ไม่ใช้ public URL</p></div></div>\
        <div class="mta-grid">\
          <label class="mta-upload mta-span-2"><span>รูปโปรไฟล์หลัก *</span><input name="profile_photo" type="file" required accept="image/jpeg,image/png,image/webp"><small>รูปหน้าตรง ถ่ายไม่เกิน 3 เดือน · ไม่สวมหมวก · ไม่สวมแว่นที่บดบังใบหน้า · เห็นหน้าชัด · ไม่ใช้ภาพเซลฟี่ · ไม่ใช้ฟิลเตอร์/แต่งหน้าจนผิดจากตัวจริง · JPG/PNG/WebP ไม่เกิน 10 MB</small></label>\
          <label class="mta-consent mta-span-2"><input type="checkbox" name="photo_compliance" required><span>ยืนยันว่ารูปโปรไฟล์หลักเป็นรูปปัจจุบันตามเงื่อนไขด้านบน</span></label>\
          <label class="mta-upload mta-span-2"><span>รูปเพิ่มเติม <small>ไม่บังคับ · สูงสุด 5 รูป</small></span><input name="additional_photos" type="file" multiple accept="image/jpeg,image/png,image/webp"><small>แนบรูปครึ่งตัว เต็มตัว หรือชีวิตประจำวันได้ หากต้องการให้เรารู้จักบุคลิกของคุณมากขึ้น</small></label>\
          <label class="mta-upload mta-span-2"><span>Certificate <small>ไม่บังคับ</small></span><input name="certificates" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"><small>รูปหรือ PDF ไม่เกิน 10 MB ต่อไฟล์</small></label>\
        </div>\
        <label class="mta-consent"><input type="checkbox" name="general_consent" required><span>ยืนยันว่าข้อมูลเป็นความจริง รับทราบว่า MMS เป็นบริการนวดและดูแลเพื่อการผ่อนคลาย ไม่ใช่บริการทางเพศ และยินยอมให้ MMS ใช้ข้อมูลเพื่อพิจารณาและประสานงาน *</span></label>\
        <p class="mta-error" role="alert"></p><div class="mta-actions"><button class="mta-button mta-button--ghost" type="button" data-back>ย้อนกลับ</button><button class="mta-button" type="submit">ส่งใบสมัคร</button></div>\
      </section>\
    </form>';

  var form=stage.querySelector("#mta3-form");
  var panels=[].slice.call(form.querySelectorAll("[data-step]"));
  var nav=[].slice.call(stage.querySelectorAll("[data-step-link]"));
  var current=1;
  var storageKey="mms_therapist_application_v4";

  function value(name){var el=form.elements[name];if(!el)return "";if(el.length&&typeof el.value==="undefined"){var c=[].slice.call(el).find(function(x){return x.checked;});return c?c.value:"";}if(el.type==="radio"){var r=form.querySelector('[name="'+name+'"]:checked');return r?r.value:"";}return String(el.value||"").trim();}
  function bool(name){return value(name)==="yes"||form.elements[name]&&form.elements[name].type==="checkbox"&&form.elements[name].checked;}
  function selected(name){return [].slice.call(form.querySelectorAll('[name="'+name+'"]:checked')).map(function(x){return x.value;});}
  function error(step,msg){var panel=panels[step-1];var el=panel&&panel.querySelector(".mta-error");if(el)el.textContent=msg||"";}
  function show(step){current=Math.max(1,Math.min(6,step));panels.forEach(function(p,i){p.hidden=i!==current-1;});nav.forEach(function(b,i){b.setAttribute("aria-current",i===current-1?"step":"false");});var progress=root.querySelector("[data-branch-progress]");if(progress)progress.textContent=String(current).padStart(2,"0")+" / 06";var label=root.querySelector("[data-current-label]");if(label)label.textContent="ใบสมัคร · "+String(current).padStart(2,"0");stage.scrollIntoView({behavior:"smooth",block:"start"});}
  function updateConditional(){var spa=form.querySelector("[data-spa-name]");var social=form.querySelector("[data-social]");if(spa)spa.hidden=value("worked_at_spa_before")!=="yes";if(social)social.hidden=value("worked_independently_before")!=="yes";}
  function validate(step){error(step,"");var p=panels[step-1];var required=[].slice.call(p.querySelectorAll("[required]"));for(var i=0;i<required.length;i++){var el=required[i];if((el.type==="radio"&&!p.querySelector('[name="'+el.name+'"]:checked'))||(el.type==="checkbox"&&!el.checked)||(!["radio","checkbox","file"].includes(el.type)&&!String(el.value||"").trim())||(el.type==="file"&&!el.files.length)){error(step,"กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบครับ");return false;}}
    if(step===1&&!value("phone")&&!value("line_id")){error(step,"กรุณาระบุเบอร์โทรหรือ LINE ID อย่างน้อยหนึ่งช่องครับ");return false;}
    if(step===2){var o=value("sexual_orientation");if(o&&!form.elements.sensitive_consent.checked){error(step,"กรุณายืนยันการจัดเก็บข้อมูลรสนิยมทางเพศก่อนครับ");return false;}}
    if(step===3&&selected("languages").length===0){error(step,"กรุณาเลือกภาษาที่สื่อสารได้อย่างน้อย 1 ภาษา");return false;}
    if(step===4){if(selected("skills").length===0){error(step,"กรุณาเลือก Skill อย่างน้อย 1 รายการ");return false;}if(selected("availability_summary").length===0){error(step,"กรุณาเลือกช่วงเวลาที่สะดวกอย่างน้อย 1 ช่วง");return false;}if(selected("transport_modes").length===0){error(step,"กรุณาเลือกวิธีเดินทางอย่างน้อย 1 แบบ");return false;}}
    if(step===5){if(value("worked_at_spa_before")==="yes"&&!value("spa_name")){error(step,"กรุณาระบุชื่อร้านหรือสปา");return false;}if(value("worked_independently_before")==="yes"&&!value("independent_social")){error(step,"กรุณาระบุช่องทางอ้างอิงของงานที่เคยรับเอง");return false;}if(value("has_massage_experience")==="no"&&value("experience_background")!=="no_experience"){error(step,"ถ้าไม่เคยมีประสบการณ์ กรุณาเลือก “ไม่เคยมีประสบการณ์”");return false;}if(value("professional_massage_experience")==="yes"&&value("has_massage_experience")!=="yes"){error(step,"ข้อมูลประสบการณ์ยังไม่สอดคล้องกันครับ");return false;}}
    if(step===6){var profile=form.elements.profile_photo.files[0];if(!validFile(profile,false)){error(step,"รูปโปรไฟล์ต้องเป็น JPG, PNG หรือ WebP และไม่เกิน 10 MB");return false;}var extras=[].slice.call(form.elements.additional_photos.files||[]);if(extras.length>5){error(step,"รูปเพิ่มเติมแนบได้สูงสุด 5 รูปครับ");return false;}if(extras.some(function(f){return !validFile(f,false);})){error(step,"รูปเพิ่มเติมต้องเป็น JPG, PNG หรือ WebP และไม่เกิน 10 MB ต่อรูป");return false;}}
    return true;}
  function validFile(file,allowPdf){if(!file)return false;var ok=["image/jpeg","image/png","image/webp"];if(allowPdf)ok.push("application/pdf");return ok.indexOf(file.type)>=0&&file.size>0&&file.size<=10*1024*1024;}
  function payload(){return {
    idempotency_key:"mms-web-v4-"+Date.now()+"-"+Math.random().toString(36).slice(2,10),
    applicant_name:value("applicant_name"),nickname:value("nickname"),phone:value("phone"),line_id:value("line_id"),
    age:Number(value("age")),height_cm:Number(value("height_cm")),weight_kg:Number(value("weight_kg")),home_province:value("home_province"),residence_province:value("residence_province"),residence_area:value("residence_area"),
    gender_identity:value("gender_identity"),sexual_orientation:value("sexual_orientation"),sensitive_consent:form.elements.sensitive_consent.checked,consent_notice_version:"mms-sensitive-v2",
    customer_gender_scope:value("customer_gender_scope"),work_preference:value("work_preference"),partner_present_experience:bool("partner_present_experience"),languages:selected("languages"),
    skills:selected("skills"),work_base_area:value("work_base_area"),mobility_scope:value("mobility_scope"),coverage_area_note:value("coverage_area_note"),availability_summary:selected("availability_summary"),lead_time_preference:value("lead_time_preference"),transport_modes:selected("transport_modes"),
    has_massage_experience:bool("has_massage_experience"),professional_massage_experience:bool("professional_massage_experience"),experience_background:value("experience_background"),experience_years:Number(value("experience_years")||0),experience_months:Number(value("experience_months")||0),strengths:value("strengths"),worked_at_spa_before:bool("worked_at_spa_before"),spa_name:value("spa_name"),worked_independently_before:bool("worked_independently_before"),independent_social:value("independent_social"),workshop_interest:value("workshop_interest"),motivation:value("motivation"),
    preferred_contact:value("preferred_contact"),preferred_contact_time:value("preferred_contact_time"),current_profession:value("current_profession"),qualification_note:value("qualification_note"),general_consent:form.elements.general_consent.checked,language:"th"
  };}
  async function uploadFile(file,kind,appId,token){var endpoint=root.dataset.uploadEndpoint;var grant=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({application_ref:appId,application_token:token,kind:kind,filename:file.name,content_type:file.type,size:file.size})});var gj=await grant.json();if(!grant.ok||!gj.ok)throw new Error("upload_grant_failed");var put=await fetch(gj.upload.url,{method:"PUT",headers:{"Content-Type":file.type,"Content-Length":String(file.size)},body:file});if(!put.ok)throw new Error("upload_failed");}
  async function submit(ev){ev.preventDefault();for(var s=1;s<=6;s++){if(!validate(s)){show(s);return;}}var btn=form.querySelector('[type="submit"]');btn.disabled=true;btn.textContent="กำลังส่ง…";try{var res=await fetch(root.dataset.applicationEndpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload())});var data=await res.json();if(!res.ok||!data.ok)throw new Error(data&&data.error&&data.error.message||"submit_failed");var appId=data.application_id||data.application_ref;var token=data.application_token;await uploadFile(form.elements.profile_photo.files[0],"profile_photo",appId,token);var extras=[].slice.call(form.elements.additional_photos.files||[]);for(var i=0;i<extras.length;i++)await uploadFile(extras[i],"additional_photo",appId,token);var certs=[].slice.call(form.elements.certificates.files||[]);for(var j=0;j<certs.length;j++){if(validFile(certs[j],true))await uploadFile(certs[j],"certificate",appId,token);}var success=root.querySelector(".mta-success");if(success){var p=success.querySelector("p:not(.mta-kicker)");if(p)p.textContent="MMS ได้รับใบสมัครแล้วครับ ทีมจะตรวจข้อมูลและติดต่อกลับตามช่องทางที่ให้ไว้ การรับใบสมัครยังไม่ใช่การยืนยันเข้าทำงาน";var ref=success.querySelector("[data-reference]");if(ref)ref.textContent="Application ID: "+appId;success.hidden=false;success.focus();}stage.hidden=true;localStorage.removeItem(storageKey);}catch(e){error(6,"ส่งใบสมัครไม่สำเร็จ กรุณาลองอีกครั้ง หรือติดต่อ MMS ทาง LINE");btn.disabled=false;btn.textContent="ส่งใบสมัคร";}}

  form.addEventListener("change",updateConditional);
  form.addEventListener("click",function(e){var next=e.target.closest("[data-next]");var back=e.target.closest("[data-back]");if(next&&validate(current))show(current+1);if(back)show(current-1);});
  nav.forEach(function(b){b.addEventListener("click",function(){var n=Number(b.dataset.stepLink);if(n<=current||validate(current))show(n);});});
  form.addEventListener("submit",submit);
  updateConditional();
  show(1);

  var oldStepButtons=[].slice.call(root.querySelectorAll('[data-application-step]'));
  oldStepButtons.forEach(function(b){var n=Number(b.dataset.applicationStep);if(n>0){b.addEventListener("click",function(){show(Math.min(n,6));});}});
})();
