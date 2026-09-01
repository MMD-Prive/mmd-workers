(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "1";

  var API = "/v1/admin/kenji/knowledge";
  var state = { cards: [], selected: null, tab: "overview", busy: false };
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
    return '<div class="ka__title"><span>MODELS</span><h2>Model Keyword Studio</h2><p>ย้ายเข้ามาใน shell เดียว โดยยังไม่สร้างฐาน Knowledge ซ้ำ</p></div>'
      + '<div class="ka__split"><aside class="ka__card"><label>ค้นหา Model<input placeholder="ชื่อ, alias หรือ keyword"></label><button>Public</button><button>Premium</button><button>Curated</button></aside>'
      + '<div class="ka__card ka__form"><h3>Model editor</h3><label>Model Key<input placeholder="model_key"></label><label>Display Name<input placeholder="ชื่อที่ใช้ภายใน"></label><label>Aliases<textarea placeholder="ชื่อเรียกอื่นและ search keywords"></textarea></label><label>Visibility<select><option>Public</option><option>Standard</option><option>Premium</option><option>Curated Approval</option></select></label><label>Customer-safe Reply<textarea placeholder="ข้อความที่ Kenji พูดกับลูกค้าได้"></textarea></label><div class="ka__notice">ข้อมูล private และ pricing exception ต้องไม่ออกจาก Worker policy layer</div><div class="ka__actions"><a class="ka__button" href="/kenji-model-keyword-copy">เปิดหน้า Backup</a><button disabled>Save Draft · รอ Model adapter</button></div></div></div>';
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
      var record = event.target.closest("[data-id]");
      if (record) return select(record.dataset.id);
      var action = event.target.closest("[data-action]");
      if (action) run(action.dataset.action);
    });
    var search = root.querySelector("#kaSearch");
    if (search) search.addEventListener("input", renderList);
  }

  function boot() {
    Promise.all([request("/v1/admin/auth/me"), request(API + "/meta"), request(API + "/list")]).then(function (data) {
      state.cards = data[2].cards || data[2].items || [];
      document.getElementById("kaSync").textContent = "เชื่อม Worker แล้ว · " + state.cards.length + " records";
      document.getElementById("kaActivity").textContent = "Knowledge API พร้อมใช้งาน · Storage: " + ((data[1].storage && data[1].storage.persisted) ? "Airtable" : "fallback read-only");
      renderMetrics(); renderList();
    }).catch(handleError);
  }

  function showTab(name) {
    state.tab = name;
    root.querySelectorAll("[data-panel]").forEach(function (node) { node.hidden = node.dataset.panel !== name; });
    root.querySelectorAll(".ka__nav [data-tab]").forEach(function (node) { node.classList.toggle("is-active", node.dataset.tab === name); });
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
  function stage(c){return c.workflow_stage||(c.workflow&&c.workflow.stage)||({active:"published",approved:"qa_passed",pending_review:"review"}[c.status]||c.status||"draft");}
  function version(c){return Number(c.workflow_version||(c.workflow&&c.workflow.version)||c.version||1);}
  function request(url,options){return fetch(url,Object.assign({credentials:"same-origin",cache:"no-store"},options||{})).then(function(r){if(r.status===401){location.href="/internal/admin/login?next="+encodeURIComponent(location.pathname+location.search);throw new Error("unauthorized");}return r.json().catch(function(){return{};}).then(function(d){if(!r.ok||d.ok===false)throw new Error(d.error||("request_"+r.status));return d;});});}
  function handleError(error){toast("ยังทำรายการไม่ได้ · "+(error.message||"network_error"),true);}
  function toast(text,bad){var n=document.getElementById("kaToast");n.textContent=text;n.classList.toggle("is-bad",!!bad);n.classList.add("is-show");setTimeout(function(){n.classList.remove("is-show");},3600);}
  function esc(v){return String(v==null?"":v).replace(/[&<>\"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];});}
})();
