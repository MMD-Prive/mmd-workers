(function(){
  "use strict";

  var root=document.getElementById("mta3");
  if(!root||root.dataset.serviceZoneBridge==="1")return;
  var form=root.querySelector("#mta3-form");
  var panel=form&&form.querySelector('[data-step="4"]');
  var legacyBase=form&&form.elements.work_base_area;
  if(!form||!panel||!legacyBase)return;
  root.dataset.serviceZoneBridge="1";
  root.dataset.serviceZoneStatus="loading";

  var applicationEndpoint=String(root.dataset.applicationEndpoint||"");
  var zoneEndpoint=String(root.dataset.serviceZoneEndpoint||"");
  if(!zoneEndpoint&&applicationEndpoint){
    try{zoneEndpoint=new URL(applicationEndpoint,location.href).origin+"/mms/api/service-zones";}catch(e){}
  }
  if(!zoneEndpoint)zoneEndpoint="https://mms-worker.malemodel-bkk.workers.dev/mms/api/service-zones";

  var submissionKey="mms-web-zone-"+Date.now()+"-"+Math.random().toString(36).slice(2,12);
  var zones=[];
  var provinces=[];
  var byCode=new Map();

  var shell=document.createElement("div");
  shell.className="mta-zone-picker mta-span-2";
  shell.setAttribute("data-mms-service-zone-picker","");
  shell.innerHTML='\
    <div class="mta-grid mta-zone-base">\
      <label class="mta-field"><span>จังหวัดหลักที่สะดวกรับงาน *</span><select name="base_service_province" required disabled><option value="">กำลังโหลดพื้นที่…</option></select><small>เริ่มจากกรุงเทพฯ และปริมณฑล</small></label>\
      <label class="mta-field"><span>Zone หลัก *</span><select name="base_service_zone_code" required disabled><option value="">เลือกจังหวัดก่อน</option></select><small>เลือกพื้นที่ฐานที่เดินทางไปรับงานได้จริง</small></label>\
    </div>\
    <div class="mta-zone-coverage">\
      <div class="mta-zone-coverage__head"><div><strong>พื้นที่ที่รับงานเพิ่มเติม</strong><small>เลือกได้หลาย Zone และหลายจังหวัด</small></div><span data-zone-count>0 Zone</span></div>\
      <label class="mta-field"><span>ดู Zone ของจังหวัด</span><select name="coverage_service_province" disabled><option value="">เลือกจังหวัด</option></select></label>\
      <div class="mta-zone-options" data-zone-options><p>เลือกจังหวัดเพื่อดู Zone เพิ่มเติม</p></div>\
      <div class="mta-zone-selected" data-zone-selected hidden></div>\
    </div>\
    <p class="mta-zone-note">Matching ใช้ Zone ที่เลือกตรงนี้เป็นหลัก ส่วน “พื้นที่อื่นที่สะดวกเดินทาง” ด้านล่างใช้เป็นข้อมูลประกอบเท่านั้นครับ</p>\
    <p class="mta-zone-status" data-zone-status role="status">กำลังโหลดจังหวัดและ Zone…</p>';

  legacyBase.type="hidden";
  legacyBase.required=true;
  legacyBase.removeAttribute("maxlength");
  var legacyLabel=legacyBase.closest("label");
  if(legacyLabel)legacyLabel.replaceWith(shell);
  else legacyBase.insertAdjacentElement("beforebegin",shell);
  shell.appendChild(legacyBase);

  var baseProvince=shell.querySelector('[name="base_service_province"]');
  var baseZone=shell.querySelector('[name="base_service_zone_code"]');
  var coverageProvince=shell.querySelector('[name="coverage_service_province"]');
  var optionsEl=shell.querySelector("[data-zone-options]");
  var selectedEl=shell.querySelector("[data-zone-selected]");
  var countEl=shell.querySelector("[data-zone-count]");
  var statusEl=shell.querySelector("[data-zone-status]");

  var style=document.createElement("style");
  style.textContent='\
    #mta3 .mta-zone-picker{display:grid;gap:1rem;padding:1rem;border:1px solid rgba(16,32,24,.14);border-radius:1.2rem;background:#fffdf8}\
    #mta3 .mta-zone-base{gap:.8rem}\
    #mta3 .mta-zone-picker select{width:100%;min-height:50px;border:1px solid rgba(16,32,24,.2);border-radius:.85rem;padding:.72rem .85rem;background:#fff;color:#102018}\
    #mta3 .mta-zone-picker select:disabled{opacity:.62;background:#ebe9df}\
    #mta3 .mta-zone-coverage{display:grid;gap:.75rem;padding-top:.2rem}\
    #mta3 .mta-zone-coverage__head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}\
    #mta3 .mta-zone-coverage__head strong,#mta3 .mta-zone-coverage__head small{display:block}\
    #mta3 .mta-zone-coverage__head small{margin-top:.18rem;color:#5d6c64}\
    #mta3 .mta-zone-coverage__head>span{flex:0 0 auto;border-radius:999px;padding:.35rem .65rem;background:#dde7dc;color:#123b2f;font-size:.78rem;font-weight:800}\
    #mta3 .mta-zone-options{display:grid;grid-template-columns:1fr;gap:.5rem}\
    #mta3 .mta-zone-options>p{margin:0;color:#5d6c64;font-size:.86rem}\
    #mta3 .mta-zone-option{display:flex;align-items:flex-start;gap:.65rem;padding:.78rem;border:1px solid rgba(16,32,24,.13);border-radius:.9rem;background:#f4f0e7;cursor:pointer}\
    #mta3 .mta-zone-option input{width:1.15rem;height:1.15rem;margin:.12rem 0 0;accent-color:#123b2f}\
    #mta3 .mta-zone-option span,#mta3 .mta-zone-option small{display:block}\
    #mta3 .mta-zone-option span{font-weight:800}\
    #mta3 .mta-zone-option small{margin-top:.12rem;color:#5d6c64;font-size:.78rem}\
    #mta3 .mta-zone-selected{display:flex;flex-wrap:wrap;gap:.4rem}\
    #mta3 .mta-zone-selected span{border:1px solid rgba(18,59,47,.18);border-radius:999px;padding:.35rem .58rem;background:#dde7dc;color:#123b2f;font-size:.76rem;font-weight:700}\
    #mta3 .mta-zone-note,#mta3 .mta-zone-status{margin:0;color:#5d6c64;font-size:.82rem}\
    #mta3 .mta-zone-status[data-state="error"]{color:#9b2d20;font-weight:700}\
    @media(min-width:720px){#mta3 .mta-zone-options{grid-template-columns:repeat(2,minmax(0,1fr))}}';
  document.head.appendChild(style);

  function safe(value){return String(value==null?"":value);}
  function escapeHtml(value){return safe(value).replace(/[&<>"']/g,function(ch){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch];});}
  function zoneLabel(zone){return zone.safe_label_th||zone.label_th||zone.code;}
  function zonesForProvince(code){return zones.filter(function(zone){return zone.province_code===code;}).sort(function(a,b){return Number(a.sort_order||9999)-Number(b.sort_order||9999);});}
  function selectedCoverage(){return [].slice.call(shell.querySelectorAll('[name="coverage_service_zone_codes_ui"]:checked')).map(function(input){return input.value;}).filter(function(code){return code&&code!==baseZone.value;});}

  function provinceOptions(placeholder){
    return '<option value="">'+escapeHtml(placeholder)+'</option>'+provinces.map(function(province){return '<option value="'+escapeHtml(province.code)+'">'+escapeHtml(province.label_th)+' · '+escapeHtml(province.label_en||province.code)+'</option>';}).join("");
  }

  function renderBaseZones(){
    var list=zonesForProvince(baseProvince.value);
    baseZone.innerHTML='<option value="">เลือก Zone หลัก</option>'+list.map(function(zone){return '<option value="'+escapeHtml(zone.code)+'">'+escapeHtml(zoneLabel(zone))+'</option>';}).join("");
    baseZone.disabled=!baseProvince.value;
    legacyBase.value="";
  }

  function renderCoverageOptions(){
    var province=coverageProvince.value;
    if(!province){optionsEl.innerHTML="<p>เลือกจังหวัดเพื่อดู Zone เพิ่มเติม</p>";return;}
    var chosen=new Set(selectedCoverage());
    var baseCode=baseZone.value;
    var list=zonesForProvince(province).filter(function(zone){return zone.code!==baseCode;});
    if(!list.length){optionsEl.innerHTML="<p>ไม่มี Zone เพิ่มเติมในจังหวัดนี้</p>";return;}
    optionsEl.innerHTML=list.map(function(zone){
      var checked=chosen.has(zone.code)?" checked":"";
      return '<label class="mta-zone-option"><input type="checkbox" name="coverage_service_zone_codes_ui" value="'+escapeHtml(zone.code)+'"'+checked+'><span><span>'+escapeHtml(zoneLabel(zone))+'</span><small>'+escapeHtml(zone.admin_areas_th||zone.label_th||"")+'</small></span></label>';
    }).join("");
  }

  function renderSelected(){
    var codes=selectedCoverage();
    countEl.textContent=codes.length+" Zone";
    if(!codes.length){selectedEl.hidden=true;selectedEl.innerHTML="";return;}
    selectedEl.hidden=false;
    selectedEl.innerHTML=codes.map(function(code){var zone=byCode.get(code);return '<span>'+escapeHtml(zone?(zone.province_label_th+" · "+zoneLabel(zone)):code)+'</span>';}).join("");
  }

  baseProvince.addEventListener("change",function(){renderBaseZones();renderCoverageOptions();renderSelected();});
  baseZone.addEventListener("change",function(){
    var zone=byCode.get(baseZone.value);
    legacyBase.value=zone?zoneLabel(zone):"";
    var same=shell.querySelector('[name="coverage_service_zone_codes_ui"][value="'+CSS.escape(baseZone.value)+'"]');
    if(same)same.checked=false;
    renderCoverageOptions();renderSelected();
  });
  coverageProvince.addEventListener("change",renderCoverageOptions);
  optionsEl.addEventListener("change",renderSelected);

  function loadCatalog(){
    return fetch(zoneEndpoint,{method:"GET",headers:{"Accept":"application/json"},credentials:"omit"})
      .then(function(response){return response.json().then(function(data){if(!response.ok||!data||!data.ok)throw new Error(data&&data.error&&data.error.code||"SERVICE_ZONE_CATALOG_UNAVAILABLE");return data.data;});})
      .then(function(data){
        provinces=Array.isArray(data.provinces)?data.provinces:[];
        zones=Array.isArray(data.zones)?data.zones:[];
        byCode=new Map(zones.map(function(zone){return [zone.code,zone];}));
        if(!provinces.length||!zones.length)throw new Error("SERVICE_ZONE_CATALOG_EMPTY");
        baseProvince.innerHTML=provinceOptions("เลือกจังหวัดหลัก");
        coverageProvince.innerHTML=provinceOptions("เลือกจังหวัดเพื่อดู Zone");
        baseProvince.disabled=false;
        coverageProvince.disabled=false;
        baseProvince.value=provinces.some(function(p){return p.code==="BKK";})?"BKK":provinces[0].code;
        renderBaseZones();
        statusEl.textContent="เลือกจังหวัดหลักและ Zone ที่รับงานได้จริง จากนั้นเพิ่มพื้นที่อื่นได้หลาย Zone";
        statusEl.dataset.state="ready";
        root.dataset.serviceZoneStatus="ready";
      })
      .catch(function(error){
        root.dataset.serviceZoneStatus="error";
        statusEl.dataset.state="error";
        statusEl.textContent="โหลดรายการพื้นที่ไม่สำเร็จ กรุณาลองรีเฟรชหน้าอีกครั้งก่อนส่งใบสมัคร";
        console.error("MMS service-zone catalog failed",error);
      });
  }

  var nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    var target="";
    try{target=typeof input==="string"?input:input&&input.url||"";}catch(e){}
    var method=String(init&&init.method||input&&input.method||"GET").toUpperCase();
    if(target&&applicationEndpoint&&target===applicationEndpoint&&method==="POST"&&init&&typeof init.body==="string"){
      try{
        var body=JSON.parse(init.body);
        body.idempotency_key=submissionKey;
        body.base_service_zone_code=baseZone.value||"";
        body.coverage_service_zone_codes=selectedCoverage();
        body.work_base_area=legacyBase.value||"";
        init=Object.assign({},init,{body:JSON.stringify(body)});
      }catch(e){console.error("MMS application zone payload bridge failed",e);}
    }
    return nativeFetch(input,init);
  };

  loadCatalog();
})();
