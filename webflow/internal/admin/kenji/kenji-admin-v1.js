(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "1";

  var API = "/v1/admin/kenji/knowledge";
  var MODEL_API = "/v1/admin/kenji/models";
  var state = {
    cards: [],
    selected: null,
    models: [],
    selectedModel: null,
    modelsLoaded: false,
    modelsLoading: false,
    tab: "overview",
    busy: false,
    modelBusy: false,
  };
  root.innerHTML = shell();
  bind();
  boot();

  function shell() {
    return '<div class="ka">'
      + '<header class="ka__header"><div><span>KENJI ADMIN</span><h1>Knowledge Control Centre</h1></div><div class="ka__health"><b id="kaEnv">Production</b><span id="kaSync">กำลังเชื่อม…</span></div><div class="ka__headActions"><button data-tab="qa">Test Kenji</button><button class="is-primary" data-tab="knowledge">Publish Changes</button></div></header>'
      + '<nav class="ka__nav" aria-label="Kenji admin sections">' + ["overview|Overview","models|Models","knowledge|Knowledge","access|Access","routing|Routing","qa|QA & Preview","versions|Versions"].map(function(x){var p=x.split("|");return '<button data-tab="'+p[0]+'">'+p[1]+'</button>';}).join("") + '</nav>'
      + '<main>'
      + '<section data-panel="overview">' + overview() + '</section>'
      + '<section data-panel="models" hidden>' + models() + '</section>'
      + '<section data-panel="knowledge" hidden>' + knowledge() + '</section>'
      + '<section data-panel="access" hidden>' + placeholder("Access", "Audience inheritance และ curated approval จะถูกตัดสินซ้ำที่ Worker") + '</section>'
      + '<section data-panel="routing" hidden>' + placeholder("Routing", "ถ้าไม่มีคำตอบจริงหรือยังรอ Review — Kenji ไม่ตอบอัตโนมัติ") + '</section>'
      + '<section data-panel="qa" hidden>' + placeholder("QA & Preview", "เลือก Knowledge ในแท็บ Knowledge แล้วบันทึก QA snapshot จาก policy path เดียวกับ Production") + '</section>'
      + '<section data-panel="versions" hidden>' + placeholder("Versions", "Audit readback แสดงลำดับ Draft → Review → QA → Publish แบบ append-only") + '</section>'
      + '</main><div class="ka__toast" id="kaToast" role="status"></div></div>';
  }

  function overview() {
    return '<div class="ka__title"><span>OVERVIEW</span><h2>ดูสิ่งที่ต้องจัดการก่อน</h2><p>สั้น ชัด และยึดข้อมูลจาก Worker</p></div>'
      + '<div class="ka__metrics" id="kaMetrics"><article><span>Published</span><strong>—</strong></article><article><span>Draft</span><strong>—</strong></article><article><span>Waiting Review</span><strong>—</strong></article><article><span>Failed QA</span><strong>—</strong></article></div>'
      + '<div class="ka__quick"><button data-tab="models">เพิ่ม Model</button><button data-tab="knowledge">เพิ่ม Knowledge</button><button data-tab="qa">ทดสอบคำตอบ</button><button data-tab="knowledge">ตรวจ Draft</button><button data-tab="versions">ดู Version ล่าสุด</button></div>'
      + '<div class="ka__card"><h3>Activity & Sync</h3><p id="kaActivity">กำลังอ่าน Knowledge และสถานะ sync…</p></div>';
  }

  function models() {
    return '<div class="ka__title"><span>MODELS</span><h2>Model Keyword Studio</h2><p>ย้ายจาก /kenji-model-keyword-copy เข้ามาในศูนย์เดียว · อ่าน Models จริง และ Save Draft เข้า Review เท่านั้น</p></div>'
      + '<div class="ka__split">'
      + '<aside class="ka__card"><div class="ka__subhead"><div><span>MODEL SOURCE</span><h3>Models</h3></div><button data-model-new>+ New</button></div><label>ค้นหา Model<input id="kaModelSearch" placeholder="ชื่อ, model key หรือ alias" autocomplete="off"></label><div class="ka__filterRow"><button data-model-filter="all" class="is-active">All</button><button data-model-filter="public">Public</button><button data-model-filter="standard">Standard</button><button data-model-filter="premium">Premium</button><button data-model-filter="curated">Curated</button></div><div id="kaModelList" class="ka__list"><p>กำลังโหลด Models…</p></div></aside>'
      + '<article class="ka__card ka__form" id="kaModelEditor"><div class="ka__empty">เลือก Model ทางซ้าย หรือกด + New เพื่อเตรียม Draft</div></article>'
      + '</div>';
  }

  function knowledge() {
    return '<div class="ka__title"><span>KNOWLEDGE</span><h2>Review → QA → Publish</h2><p>ทุก action ตรวจ version และเขียน Audit Log</p></div>'
      + '<div class="ka__split"><aside class="ka__card"><label>ค้นหา<input id="kaSearch" placeholder="ชื่อหรือ Knowledge ID"></label><div id="kaList" class="ka__list"><p>กำลังโหลด…</p></div></aside>'
      + '<article class="ka__card" id="kaEditor"><div class="ka__empty">เลือก Knowledge เพื่อดูสถานะและดำเนิน workflow</div></article></div>';
  }

  function placeholder(title, copy) { return '<div class="ka__title"><span>KENJI ADMIN</span><h2>'+esc(title)+'</h2><p>'+esc(copy)+'</p></div><div class="ka__card"><div class="ka__empty">อยู่ใน build order ถัดไป โดย contract ฝั่ง Worker ถูกล็อกไว้ก่อนแล้ว</div></div>'; }

  function bind() {
    root.addEventListener("click", function (event) {
      var tab = event.target.closest("[data-tab]");
      if (tab) return showTab(tab.dataset.tab);
      var modelNew = event.target.closest("[data-model-new]");
      if (modelNew) return newModel();
      var modelRecord = event.target.closest("[data-model-id]");
      if (modelRecord) return selectModel(modelRecord.dataset.modelId);
      var modelFilter = event.target.closest("[data-model-filter]");
      if (modelFilter) return setModelFilter(modelFilter.dataset.modelFilter, modelFilter);
      var modelAction = event.target.closest("[data-model-action]");
      if (modelAction) return runModelAction(modelAction.dataset.modelAction);
      var record = event.target.closest("[data-id]");
      if (record) return select(record.dataset.id);
      var action = event.target.closest("[data-action]");
      if (action) run(action.dataset.action);
    });
    var search = root.querySelector("#kaSearch");
    if (search) search.addEventListener("input", renderList);
    var modelSearch = root.querySelector("#kaModelSearch");
    if (modelSearch) modelSearch.addEventListener("input", renderModelList);
  }

  function boot() {
    Promise.all([request("/v1/admin/auth/me"), request(API + "/meta"), request(API + "/list")]).then(function (data) {
      state.cards = data[2].cards || data[2].items || [];
      document.getElementById("kaSync").textContent = "เชื่อม Worker แล้ว · Knowledge " + state.cards.length;
      document.getElementById("kaActivity").textContent = "Knowledge API พร้อมใช้งาน · Storage: " + ((data[1].storage && data[1].storage.persisted) ? "Airtable" : "fallback read-only");
      renderMetrics(); renderList();
      loadModels();
    }).catch(handleError);
  }

  function showTab(name) {
    state.tab = name;
    root.querySelectorAll("[data-panel]").forEach(function (node) { node.hidden = node.dataset.panel !== name; });
    root.querySelectorAll(".ka__nav [data-tab]").forEach(function (node) { node.classList.toggle("is-active", node.dataset.tab === name); });
    if (name === "models" && !state.modelsLoaded && !state.modelsLoading) loadModels();
  }

  function renderMetrics() {
    var stages = { published:0, draft:0, review:0, failed:0 };
    state.cards.forEach(function(c){var s=stage(c); if(s==="published")stages.published++; else if(s==="review")stages.review++; else if(s==="draft")stages.draft++; if(s==="qa_failed")stages.failed++;});
    document.getElementById("kaMetrics").innerHTML = metric("Published",stages.published)+metric("Draft",stages.draft)+metric("Waiting Review",stages.review)+metric("Failed QA",stages.failed);
  }
  function metric(k,v){return '<article><span>'+k+'</span><strong>'+v+'</strong></article>';}

  function renderList() {
    var node=document.getElementById("kaList"); if(!node)return;
    var q=(document.getElementById("kaSearch").value||"").toLowerCase();
    var cards=state.cards.filter(function(c){return !q || ((c.title||"")+" "+(c.knowledge_id||c.id||"")).toLowerCase().includes(q);});
    node.innerHTML=cards.length?cards.map(function(c){var id=c.knowledge_id||c.id;return '<button data-id="'+esc(id)+'" class="'+(state.selected&&id===(state.selected.knowledge_id||state.selected.id)?'is-active':'')+'"><b>'+esc(c.title||id)+'</b><span>'+esc(stage(c))+' · v'+esc(version(c))+'</span></button>';}).join(""):'<div class="ka__empty">ไม่พบข้อมูล</div>';
  }

  function select(id) { state.selected=state.cards.find(function(c){return (c.knowledge_id||c.id)===id;}); renderList(); renderEditor(); loadAudit(); }
  function renderEditor(events) {
    var c=state.selected, node=document.getElementById("kaEditor"); if(!c||!node)return;
    var s=stage(c), v=version(c), publishable=s==="qa_passed";
    node.innerHTML='<div class="ka__recordHead"><span>'+esc(c.category||"Knowledge")+'</span><h3>'+esc(c.title||c.knowledge_id)+'</h3><p>'+esc(c.knowledge_id||c.id)+' · '+esc(c.language||"th")+' · v'+v+'</p></div>'
      +'<div class="ka__answer"><b>Approved Answer</b><p>'+esc(c.customer_answer||c.approved_answer||"ยังไม่มีคำตอบ")+'</p></div>'
      +'<div class="ka__workflow"><span class="is-on">Draft</span><span class="'+(s!=="draft"?'is-on':'')+'">Review</span><span class="'+(["qa_passed","published"].includes(s)?'is-on':'')+'">QA</span><span class="'+(s==="published"?'is-on':'')+'">Published</span></div>'
      +'<div class="ka__actions"><button data-action="review" '+(s!=="draft"?'disabled':'')+'>Submit Review</button><button data-action="qa" '+(s!=="review"?'disabled':'')+'>Run QA</button><button class="is-primary" data-action="publish" '+(!publishable?'disabled':'')+'>Publish</button><button data-action="audit">Read Audit</button></div>'
      +'<div class="ka__audit"><h4>Audit Log</h4><div id="kaAudit">'+audit(events||[])+'</div></div>';
  }

  function run(action) {
    if(!state.selected||state.busy)return;
    if(action==="audit")return loadAudit();
    state.busy=true; toast("กำลังบันทึก "+action+"…");
    var id=state.selected.knowledge_id||state.selected.id;
    var payload={expected_version:version(state.selected)};
    if(action==="qa") payload.qa={privacy_checked:true,policy_path_match:true,sample_question:"Admin regression preview",blocked_information:["internal_notes","private_assets"],checked_at:new Date().toISOString(),channel:"web",audience:"internal"};
    request(API+"/"+encodeURIComponent(id)+"/"+action,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify(payload)}).then(function(data){state.selected.workflow_stage=data.stage;state.selected.workflow_version=data.version;renderMetrics();renderList();renderEditor();toast(action+" สำเร็จ · v"+data.version);return loadAudit();}).catch(handleError).finally(function(){state.busy=false;});
  }

  function loadAudit(){if(!state.selected)return;var id=state.selected.knowledge_id||state.selected.id;return request(API+"/"+encodeURIComponent(id)+"/audit").then(function(data){var n=document.getElementById("kaAudit");if(n)n.innerHTML=audit(data.events||[]);});}
  function audit(events){return events.length?events.slice().reverse().map(function(e){return '<article><b>'+esc(e.action||e.type||"event")+'</b><span>'+esc(e.actor_id||e.actor||"")+' · '+esc(e.at||e.timestamp||"")+'</span></article>';}).join(""):'<div class="ka__empty">ยังไม่มี Audit event</div>';}

  function loadModels() {
    if(state.modelsLoading)return;
    state.modelsLoading=true;
    var list=document.getElementById("kaModelList");
    if(list)list.innerHTML='<p>กำลังโหลด Models…</p>';
    return request(MODEL_API+"?limit=120").then(function(data){
      state.models=data.items||[];
      state.modelsLoaded=true;
      renderModelList();
      var sync=document.getElementById("kaSync");
      if(sync)sync.textContent="เชื่อม Worker แล้ว · Knowledge "+state.cards.length+" · Models "+state.models.length;
    }).catch(function(error){
      if(list)list.innerHTML='<div class="ka__empty">Models ยังโหลดไม่ได้ · '+esc(error.message||"model_source_unavailable")+'<br><button data-model-action="reload">ลองใหม่</button></div>';
    }).finally(function(){state.modelsLoading=false;});
  }

  function setModelFilter(value, button) {
    root.querySelectorAll("[data-model-filter]").forEach(function(node){node.classList.toggle("is-active",node===button);});
    root.dataset.modelFilter=value||"all";
    renderModelList();
  }

  function modelTierForFilter(model) {
    var tier=(model.model_tier||"").toLowerCase();
    var folder=(model.access_folder||"").toLowerCase();
    var visibility=(model.booking_visibility||"").toLowerCase();
    if(visibility==="public"||tier==="public")return "public";
    if(folder==="standard"||tier==="standard")return "standard";
    if(folder==="premium"||tier==="premium")return "premium";
    return "curated";
  }

  function renderModelList() {
    var node=document.getElementById("kaModelList"); if(!node)return;
    var search=document.getElementById("kaModelSearch");
    var q=((search&&search.value)||"").trim().toLowerCase();
    var filter=root.dataset.modelFilter||"all";
    var models=state.models.filter(function(model){
      var hay=[model.model_key,model.working_name].concat(model.search_aliases||[]).join(" ").toLowerCase();
      return (!q||hay.includes(q))&&(filter==="all"||modelTierForFilter(model)===filter);
    });
    node.innerHTML=models.length?models.map(function(model){
      var id=model.model_id||model.model_key;
      var active=state.selectedModel&&id===(state.selectedModel.model_id||state.selectedModel.model_key);
      return '<button data-model-id="'+esc(id)+'" class="'+(active?'is-active':'')+'"><b>'+esc(model.working_name||model.model_key||"Untitled")+'</b><span>'+esc(model.model_key||"no-key")+' · '+esc(modelTierForFilter(model))+' · '+esc(model.status||"unknown")+'</span></button>';
    }).join(""):'<div class="ka__empty">'+(state.modelsLoaded?'ไม่พบ Model ที่ตรงกัน':'ยังไม่ได้โหลด Models')+'</div>';
  }

  function selectModel(id) {
    state.selectedModel=state.models.find(function(model){return (model.model_id||model.model_key)===id;})||null;
    renderModelList();
    renderModelEditor();
  }

  function newModel() {
    state.selectedModel={
      model_id:"",
      model_key:"",
      working_name:"",
      search_aliases:[],
      customer_safe_info:"",
      customer_safe_remark:"",
      model_tier:"public",
      status:"new",
      booking_visibility:"public",
      access_folder:"",
      requires_per_approval:true,
    };
    renderModelList();
    renderModelEditor();
    var key=document.getElementById("kaModelKey"); if(key)key.focus();
  }

  function visibilityFromModel(model) {
    var visibility=(model.booking_visibility||"").toLowerCase();
    var folder=(model.access_folder||"").toLowerCase();
    if(visibility==="public")return "public";
    if(folder==="standard")return "standard";
    if(folder==="premium")return "premium";
    if(["vip","exclusive"].includes(folder))return "curated";
    if(["public","standard","premium","curated","hidden","internal"].includes(visibility))return visibility;
    return modelTierForFilter(model)==="curated"?"curated":modelTierForFilter(model);
  }

  function scopesFromModel(model) {
    var folder=(model.access_folder||"").toLowerCase();
    if(folder==="premium")return ["standard","premium"];
    if(folder==="standard")return ["standard"];
    return [];
  }

  function option(value,label,current) { return '<option value="'+esc(value)+'" '+(value===current?'selected':'')+'>'+esc(label)+'</option>'; }
  function chip(name,value,label,checked) { return '<label><input type="checkbox" name="'+esc(name)+'" value="'+esc(value)+'" '+(checked?'checked':'')+'> '+esc(label)+'</label>'; }

  function renderModelEditor() {
    var model=state.selectedModel,node=document.getElementById("kaModelEditor"); if(!node)return;
    if(!model){node.innerHTML='<div class="ka__empty">เลือก Model ทางซ้าย หรือกด + New เพื่อเตรียม Draft</div>';return;}
    var tier=(model.model_tier||modelTierForFilter(model)||"public").toLowerCase();
    if(!["public","standard","premium","vip","exclusive","curated"].includes(tier))tier=modelTierForFilter(model);
    var visibility=visibilityFromModel(model);
    var scopes=scopesFromModel(model);
    node.innerHTML='<div class="ka__recordHead"><span>MODEL KEYWORD</span><h3>'+esc(model.working_name||"New Model Draft")+'</h3><p>'+(model.model_id?esc(model.model_id)+' · ':'')+'Current: '+esc(model.status||"new")+' · ทุกการแก้ไขจะเข้า Review ก่อน</p></div>'
      +'<div class="ka__modelGrid"><label>Model Key<input id="kaModelKey" value="'+attr(model.model_key)+'" placeholder="ems04-sin-m" autocomplete="off"></label><label>Working Name<input id="kaModelName" value="'+attr(model.working_name)+'" placeholder="ชื่อที่ใช้ภายใน"></label></div>'
      +'<label>Search Aliases<textarea id="kaModelAliases" placeholder="ชื่อเรียกอื่น, keyword, alias — 1 บรรทัดหรือคั่นด้วย comma">'+esc((model.search_aliases||[]).join("\n"))+'</textarea></label>'
      +'<label>Customer-safe Info<textarea id="kaModelSafeInfo" placeholder="ข้อมูลที่ Kenji พูดกับลูกค้าได้หลังผ่าน Review">'+esc(model.customer_safe_info||"")+'</textarea></label>'
      +'<label>Customer-safe Remark<textarea id="kaModelSafeRemark" placeholder="หมายเหตุที่ปลอดภัยต่อการตอบลูกค้า — ห้ามราคา/คิว/ข้อมูลติดต่อ">'+esc(model.customer_safe_remark||"")+'</textarea></label>'
      +'<div class="ka__modelGrid"><label>Model Tier<select id="kaModelTier">'+option("public","Public",tier)+option("standard","Standard",tier)+option("premium","Premium",tier)+option("vip","VIP",tier)+option("exclusive","Exclusive",tier)+option("curated","Curated",tier)+'</select></label><label>Proposed Visibility<select id="kaModelVisibility">'+option("public","Public",visibility)+option("standard","Standard",visibility)+option("premium","Premium",visibility)+option("curated","Curated Approval",visibility)+option("hidden","Hidden",visibility)+option("internal","Internal only",visibility)+'</select></label></div>'
      +'<div class="ka__scopeBlock"><b>Allowed customer scope</b><div class="ka__chips">'+chip("kaModelScope","standard","Standard",scopes.includes("standard"))+chip("kaModelScope","premium","Premium",scopes.includes("premium"))+'</div></div>'
      +'<div class="ka__scopeBlock"><b>Restricted / Review labels</b><div class="ka__chips">'+chip("kaModelRestricted","potential","#Potential",false)+chip("kaModelRestricted","review","#Review",false)+chip("kaModelRestricted","no_detail","#No-Detail",false)+'</div></div>'
      +'<div class="ka__notice"><b>Safety lock</b><br>หน้านี้ไม่รับราคา, availability/คิว, เบอร์ติดต่อ, LINE/Telegram, private asset หรือ R2 key. Visibility เป็นเพียงข้อเสนอสำหรับ Review และยังไม่เปลี่ยน Production Model.</div>'
      +'<div class="ka__notice"><b>Media / Compcard</b><br>ภาพและ Comcard ยังใช้ Model Console media review เดิม ไม่อัปโหลดตรงจาก browser ใน Model Keyword Studio.</div>'
      +'<div class="ka__modelPreview" id="kaModelPreview"><span>SAFE PREVIEW</span><p>กด Preview เพื่อดูข้อความที่กำลังเตรียมส่งเข้า Review</p></div>'
      +'<div class="ka__actions"><button data-model-action="preview">Preview Safe Reply</button><a class="ka__button" href="/kenji-model-keyword-copy" target="_blank" rel="noopener">Legacy Backup</a><button class="is-primary" data-model-action="save-draft">Save Draft → Review</button></div>';
  }

  function checkedValues(name) {
    return Array.prototype.slice.call(root.querySelectorAll('input[name="'+name+'"]:checked')).map(function(node){return node.value;});
  }

  function valueOf(id) { var node=document.getElementById(id); return node?node.value.trim():""; }
  function splitAliases(value) { return Array.from(new Set(String(value||"").split(/[\n,]/).map(function(item){return item.trim();}).filter(Boolean))); }

  function modelDraftPayload() {
    var model=state.selectedModel||{};
    return {
      model_id:model.model_id||null,
      model_key:valueOf("kaModelKey"),
      working_name:valueOf("kaModelName"),
      search_aliases:splitAliases(valueOf("kaModelAliases")),
      customer_safe_info:valueOf("kaModelSafeInfo"),
      customer_safe_remark:valueOf("kaModelSafeRemark"),
      model_tier:valueOf("kaModelTier"),
      status:model.status||"new",
      proposed_visibility:valueOf("kaModelVisibility"),
      allowed_customer_scope:checkedValues("kaModelScope"),
      restricted_scope:checkedValues("kaModelRestricted"),
    };
  }

  function runModelAction(action) {
    if(action==="reload")return loadModels();
    if(action==="preview")return previewModelDraft();
    if(action==="save-draft")return saveModelDraft();
  }

  function previewModelDraft() {
    var node=document.getElementById("kaModelPreview"); if(!node)return;
    var payload=modelDraftPayload();
    node.innerHTML='<span>SAFE PREVIEW</span><h4>'+esc(payload.working_name||payload.model_key||"Untitled")+'</h4><p>'+esc(payload.customer_safe_info||"ยังไม่มี Customer-safe Info")+'</p>'+(payload.customer_safe_remark?'<small>'+esc(payload.customer_safe_remark)+'</small>':'')+'<div class="ka__previewMeta">'+esc(payload.model_tier)+' · '+esc(payload.proposed_visibility)+' · aliases '+payload.search_aliases.length+'</div>';
  }

  function saveModelDraft() {
    if(state.modelBusy||!state.selectedModel)return;
    var payload=modelDraftPayload();
    state.modelBusy=true;
    setModelActionsDisabled(true);
    toast("กำลังส่ง Model Draft เข้า Review…");
    return request(MODEL_API+"/draft",{
      method:"POST",
      headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},
      body:JSON.stringify(payload),
    }).then(function(data){
      toast("Model Draft เข้า Review แล้ว · "+(data.request_id||"pending_review"));
      var node=document.getElementById("kaModelPreview");
      if(node)node.innerHTML='<span>REVIEW QUEUE</span><h4>Pending Review</h4><p>'+esc(data.request_id||"")+'</p><small>Production Model ยังไม่ถูกแก้ไข</small>';
    }).catch(handleError).finally(function(){state.modelBusy=false;setModelActionsDisabled(false);});
  }

  function setModelActionsDisabled(disabled) {
    root.querySelectorAll("[data-model-action]").forEach(function(node){node.disabled=!!disabled;});
  }

  function stage(c){return c.workflow_stage||(c.workflow&&c.workflow.stage)||({active:"published",approved:"qa_passed",pending_review:"review"}[c.status]||c.status||"draft");}
  function version(c){return Number(c.workflow_version||(c.workflow&&c.workflow.version)||c.version||1);}
  function request(url,options){return fetch(url,Object.assign({credentials:"same-origin",cache:"no-store"},options||{})).then(function(r){if(r.status===401){location.href="/internal/admin/login?next="+encodeURIComponent(location.pathname+location.search);throw new Error("unauthorized");}return r.json().catch(function(){return{};}).then(function(d){if(!r.ok||d.ok===false)throw new Error(typeof d.error==="string"?d.error:(d.error&&d.error.code)||("request_"+r.status));return d;});});}
  function handleError(error){toast("ยังทำรายการไม่ได้ · "+(error.message||"network_error"),true);}
  function toast(text,bad){var n=document.getElementById("kaToast");n.textContent=text;n.classList.toggle("is-bad",!!bad);n.classList.add("is-show");setTimeout(function(){n.classList.remove("is-show");},3600);}
  function attr(v){return esc(v).replace(/'/g,"&#39;");}
  function esc(v){return String(v==null?"":v).replace(/[&<>\"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];});}
})();
