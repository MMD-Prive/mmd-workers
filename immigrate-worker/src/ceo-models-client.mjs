export function modelsClient(){
  var r=document.getElementById("model-supply-v3"); if(!r)return;
  var q=function(s){return r.querySelector(s)};
  function txt(v){return String(v==null?"":v).trim()}
  function esc(v){return txt(v).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]})}
  function arr(v){if(Array.isArray(v))return v;return txt(v)?txt(v).split(/[,|/]+/).map(function(x){return x.trim()}).filter(Boolean):[]}
  function fmt(v){if(v==null||v==="")return "—";if(Array.isArray(v))return v.join(", ");if(typeof v==="boolean")return v?"Yes":"No";if(typeof v==="object")try{return JSON.stringify(v)}catch(_){return String(v)}return String(v)}
  function time(v){var d=new Date(v);return isNaN(d)?txt(v):d.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"})}
  function initials(v){var s=txt(v);return esc((s.slice(0,2)||"M").toUpperCase())}
  function availabilityChip(a){
    if(!a)return '<span class="msv3-chip is-warn">NO AVAILABILITY</span>';
    var s=txt(a.availability_status||"busy").toLowerCase(),now=!!a.available_now;
    return '<span class="msv3-chip '+(now&&s==="available"?"is-good":"is-warn")+'">'+esc(now&&s==="available"?"AVAILABLE NOW":s.toUpperCase())+'</span>'
  }
  function mediaSrc(m){
    if(!m||m.public_safe===false)return "";
    var lane=txt(m.media_type||m.asset_role||m.visibility||"").toLowerCase();
    if(/private|sigil|evidence/.test(lane))return "";
    var explicit=txt(m.preview_url||m.public_preview_url||m.public_url||m.asset_url||m.url||m.cdn_url||"");
    if(explicit){
      try{
        var u=new URL(explicit,location.origin);
        if(explicit.charAt(0)==="/"||u.origin===location.origin||u.hostname==="models.mmdbkk.com"||u.hostname.endsWith(".website-files.com")||m.preview_url)return u.href;
      }catch(_){}
    }
    var key=txt(m.public_key||m.object_key||m.storage_key||m.r2_key||"").replace(/^\/+/, "");
    if(/^models\/[^/]+\/(profile|gallery|compcard)\//i.test(key))return "https://models.mmdbkk.com/"+key;
    return "";
  }
  function mediaHtml(items){
    if(!Array.isArray(items)||!items.length)return '<div class="msv3-empty">ยังไม่มี media ล่าสุดในคิวนี้</div>';
    return '<div class="msv3-media">'+items.slice(0,3).map(function(m){
      var type=txt(m.file_type||m.mime_type||m.media_type).toLowerCase(),src=mediaSrc(m),isVideo=type.indexOf("video/")===0||/video|clip/.test(type);
      var visual=src?(isVideo?'<video muted playsinline preload="metadata" src="'+esc(src)+'"></video>':'<img loading="lazy" src="'+esc(src)+'" alt="">'):'<span>'+(isVideo?"VIDEO":"ยังไม่มีรูป")+'</span>';
      var thumb=src?'<button type="button" class="msv3-media-thumb" data-media-open="'+esc(src)+'" data-media-kind="'+(isVideo?"video":"image")+'" aria-label="เปิดดูสื่อ">'+visual+'</button>':'<div class="msv3-media-thumb">'+visual+'</div>';
      return '<div class="msv3-media-item">'+thumb+'<div class="msv3-media-copy"><strong>'+esc(m.file_name||m.media_type||"Media")+'</strong><p>'+esc(m.media_type||"")+' · '+esc(m.review_status||"")+(m.uploaded_at?' · '+esc(time(m.uploaded_at)):'')+'</p></div></div>'
    }).join("")+'</div>'
  }
  function changesHtml(changes){
    if(!Array.isArray(changes)||!changes.length)return '<div class="msv3-empty">ไม่มี changed fields</div>';
    return changes.slice(0,12).map(function(c){
      return '<div class="msv3-change"><b>'+esc(c.field||"field")+'</b><p><small>เดิม</small>'+esc(fmt(c.before))+'<small>ใหม่</small>'+esc(fmt(c.after))+'</p></div>'
    }).join("")
  }
  function reviewCard(item){
    var miss=Array.isArray(item.missing)?item.missing:[];
    return '<article class="msv3-review" data-request-card="'+esc(item.request_id)+'">'+
      '<div class="msv3-review-top"><div class="msv3-review-name"><div class="msv3-avatar">'+initials(item.model_name)+'</div><div><h3>'+esc(item.model_name||"Model")+'</h3><p>'+esc(item.request_id||"")+(item.requested_at?' · '+esc(time(item.requested_at)):'')+'</p></div></div>'+
      '<div class="msv3-review-status"><span class="msv3-chip">'+esc((item.request_status||"pending_review").toUpperCase())+'</span>'+availabilityChip(item.availability)+(miss.length?'<span class="msv3-chip is-bad">'+miss.length+' MISSING</span>':'<span class="msv3-chip is-good">DATA COMPLETE</span>')+'</div></div>'+
      '<div class="msv3-review-grid">'+
        '<div class="msv3-box"><h4>ข้อมูลที่เปลี่ยน</h4>'+changesHtml(item.changed_fields)+'</div>'+
        '<div class="msv3-box"><h4>สถานะพร้อมรับงาน</h4><div class="msv3-availability"><div class="msv3-av"><span>AVAILABLE NOW</span><strong>'+esc(item.availability&&item.availability.available_now?"YES":"NO")+'</strong></div><div class="msv3-av"><span>STATUS</span><strong>'+esc(item.availability&&item.availability.availability_status||"—")+'</strong></div></div>'+(miss.length?'<div class="msv3-missing">ยังขาด: '+miss.map(esc).join(", ")+'</div>':'')+'</div>'+
        '<div class="msv3-box"><h4>รูป / คลิปล่าสุด</h4>'+mediaHtml(item.latest_media)+'</div>'+
      '</div>'+
      '<div class="msv3-decision"><textarea data-note placeholder="โน้ตสำหรับ Hold / Reject หรือบันทึกประกอบการตรวจ"></textarea><div class="msv3-decisions"><button type="button" class="msv3-btn is-good" data-decision="approve">Approve</button><button type="button" class="msv3-btn is-hold" data-decision="hold">Hold</button><button type="button" class="msv3-btn is-bad" data-decision="reject">Reject</button></div></div>'+
    '</article>'
  }
  async function api(url,opt){
    opt=Object.assign({signal:AbortSignal.timeout(20000)},opt||{});
    var res=await fetch(url,Object.assign({credentials:"include",headers:{Accept:"application/json"},cache:"no-store"},opt||{}));
    if(res.status===401||res.status===403){location.href="/internal/admin/login?next="+encodeURIComponent(location.pathname);throw new Error("session_required")}
    var ct=txt(res.headers.get("content-type")).toLowerCase();
    if(ct.indexOf("application/json")<0)throw new Error("non_json_backend_response");
    var data=await res.json();
    if(!res.ok||data.ok===false)throw new Error(data.error||("http_"+res.status));
    return data
  }
  async function loadReview(){
    q("[data-review-state]").textContent="กำลังโหลดคิว…";
    ["count","available","media","missing"].forEach(function(k){q("[data-review-"+k+"]").textContent="—"});
    q("[data-review-list]").textContent="กำลังโหลดคิว…";
    try{
      var d=await api("/v1/admin/models/review-queue?limit=50");
      if(!Array.isArray(d.items))throw Error("invalid_review_response");
      var items=d.items;
      q("[data-review-count]").textContent=items.length;
      q("[data-review-available]").textContent=items.filter(function(x){return x.availability&&x.availability.available_now&&txt(x.availability.availability_status).toLowerCase()==="available"}).length;
      q("[data-review-media]").textContent=items.filter(function(x){return Array.isArray(x.latest_media)&&x.latest_media.length}).length;
      q("[data-review-missing]").textContent=items.filter(function(x){return Array.isArray(x.missing)&&x.missing.length}).length;
      q("[data-review-list]").innerHTML=items.length?items.map(reviewCard).join(""):'<div class="msv3-empty">ไม่มี Model update ที่ค้างให้ตรวจ</div>';
      q("[data-review-state]").textContent="โหลดคิวแล้ว · "+items.length;
      return true;
    }catch(e){
      q("[data-review-state]").textContent="โหลดคิวไม่สำเร็จ · กด Refresh เพื่อลองใหม่";
      q("[data-review-list]").innerHTML='<div class="msv3-empty">คิว Review ยังเชื่อม backend ไม่สำเร็จ · '+esc(e.message)+'</div>';
      return false;
    }
  }
  async function decide(card,decision){
    var requestId=card.getAttribute("data-request-card"),note=txt(card.querySelector("[data-note]").value);
    if(decision!=="approve"&&!note){card.querySelector("[data-note]").focus();return}
    var buttons=Array.prototype.slice.call(card.querySelectorAll("[data-decision]"));buttons.forEach(function(b){b.disabled=true});
    try{
      await api("/v1/admin/models/review-queue/"+encodeURIComponent(requestId)+"/decision",{
        method:"POST",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify({decision:decision,note:note})
      });
      await loadReview()
    }catch(e){
      buttons.forEach(function(b){b.disabled=false});
      card.querySelector("[data-note]").value=(note?note+" · ":"")+"ERROR: "+e.message
    }
  }
  function openMedia(src,kind){
    var box=q("[data-lightbox]"),img=q("[data-lightbox-img]"),vid=q("[data-lightbox-video]");
    if(!box||!src)return;
    box.hidden=false;box.setAttribute("aria-hidden","false");
    if(kind==="video"){img.hidden=true;img.removeAttribute("src");vid.hidden=false;vid.src=src}
    else{vid.pause();vid.hidden=true;vid.removeAttribute("src");img.hidden=false;img.src=src}
  }
  function closeMedia(){
    var box=q("[data-lightbox]"),img=q("[data-lightbox-img]"),vid=q("[data-lightbox-video]");
    if(!box)return;
    box.hidden=true;box.setAttribute("aria-hidden","true");
    if(img)img.removeAttribute("src");
    if(vid){vid.pause();vid.removeAttribute("src")}
  }
  function bindDecisions(){
    r.addEventListener("click",function(ev){
      var opener=ev.target.closest("[data-media-open]");
      if(opener){openMedia(opener.getAttribute("data-media-open"),opener.getAttribute("data-media-kind"));return}
      if(ev.target.closest("[data-lightbox-close]")||ev.target===q("[data-lightbox]")){closeMedia();return}
      var b=ev.target.closest("[data-decision]");if(!b)return;
      var card=b.closest("[data-request-card]");if(card)decide(card,b.getAttribute("data-decision"))
    });
    document.addEventListener("keydown",function(ev){if(ev.key==="Escape")closeMedia()})
  }

  function hay(x){return [x.compcard_family,x.compcard_theme,x.category,x.model_category,x.category_path,x.work_types,x.work_type,x.capabilities,x.abilities].flatMap(arr).join(" ").toLowerCase()}
  function fams(x){var h=hay(x),out=[],explicit=txt(x.compcard_family||x.family||"");if(["A","B","C","D","E","GWs","EMs"].includes(explicit))out.push(explicit);if(/\bgws[-_ ]?\d|\bgws\b/.test(h))out.push("GWs");if(/\bems[-_ ]?\d|\bems\b/.test(h))out.push("EMs");if(/travel/.test(h))out.push("C");if(/extreme/.test(h))out.push("D");if(/foreigner/.test(h))out.push("E");if(/\bstraight\b/.test(h))out.push("A");if(/\bgay\b/.test(h))out.push("B");return Array.from(new Set(out))}
  function ready(x){var n=0;n+=!!(x.model_record_id||x.id);n+=!!x.r2_prefix&&x.is_migrated_to_r2===true;n+=!!x.primary_image_key;n+=!!(x.profile_ready||x.public_profile_ready);n+=!!(x.gallery_ready||x.public_gallery_ready);n+=!!(x.compcard_ready||x.public_compcard_ready);return n>=5}
  function renderInventory(items){
    items=items.map(function(x){return Object.assign({},x.fields||{},x)});
    var c={A:0,B:0,C:0,D:0,E:0,GWs:0,EMs:0},multi=[];
    items.forEach(function(x){var f=fams(x);f.forEach(function(k){c[k]++});if(f.length>1)multi.push({x:x,f:f})});
    Object.keys(c).forEach(function(k){var e=q('[data-family="'+k+'"]');if(e)e.textContent=c[k]});
    q("[data-total]").textContent=items.length;q("[data-multi]").textContent=multi.length;q("[data-ready]").textContent=items.some(function(x){return ["profile_ready","public_profile_ready","gallery_ready","public_gallery_ready","compcard_ready","public_compcard_ready"].some(function(k){return k in x})})?items.filter(ready).length:"—";
    var box=q("[data-overlap]");
    box.innerHTML=!multi.length?'<article><strong>ยังไม่พบ explicit multi-lane</strong><p>ไม่ infer เพิ่มจาก tier หรือ asset folder</p></article>':multi.slice(0,8).map(function(o){var n=o.x.working_name||o.x.model_name||o.x.name||o.x.model_code||"Model";return '<article><strong>'+esc(n)+'</strong><p>'+esc(o.f.join(" · "))+'</p></article>'}).join("")
  }
  async function loadSupply(){
    q("[data-supply-state]").textContent="กำลังโหลดรายการ…";
    r.querySelectorAll("[data-family],[data-total],[data-multi],[data-ready]").forEach(function(e){e.textContent="—"});
    q("[data-overlap]").textContent="กำลังโหลดข้อมูล…";
    try{
      var d=await api("/v1/admin/models/list?limit=100"),items=d.items||d.models||d.records;
      if(!Array.isArray(items))throw Error("invalid_inventory_response");
      renderInventory(items);q("[data-supply-state]").textContent="โหลดแล้ว "+items.length+" รายการ · สรุปเฉพาะชุดที่โหลด (สูงสุด 100)";
      try{
        var ad=await api("/v1/admin/audience/brief"),gaps=ad.supply_gaps||ad.model_gaps||[];
        if(Array.isArray(gaps)&&gaps.length)q("[data-gaps]").innerHTML=gaps.slice(0,6).map(function(g){return '<article><strong>'+esc(g.title||g.family||g.category||"Supply gap")+'</strong><p>'+esc(g.detail||g.reason||g.recommendation||"")+'</p></article>'}).join("")
      }catch(_){}
      return true;
    }catch(e){q("[data-supply-state]").textContent="โหลดรายการไม่สำเร็จ · กด Refresh เพื่อลองใหม่";q("[data-overlap]").textContent="ยังสรุปไม่ได้";return false}
  }
  async function lookup(v){
    var box=q("[data-result]");box.innerHTML='<article><strong>กำลังค้น…</strong></article>';
    try{
      var d=await api("/v1/admin/models/resolve-source?q="+encodeURIComponent(v)),x=d.model||d.item||d.result||d; x=Object.assign({},x.fields||{},x);var f=fams(x);
      box.innerHTML='<article><strong>'+esc(x.working_name||x.model_name||x.name||v)+'</strong><p>'+esc(f.length?f.join(" · "):"family not explicitly established")+'</p><div class="msv3-chips"><span class="msv3-chip '+(ready(x)?"is-good":"is-warn")+'">'+(ready(x)?"ASSET READY":"ASSET REVIEW")+'</span><span class="msv3-chip">NO AUTO PUBLISH</span></div></article>'
    }catch(e){box.innerHTML='<article><strong>ไม่พบ verified result</strong><p>'+esc(e.message)+'</p></article>'}
  }
  var loading=false;
  async function loadAll(){
    if(loading)return;loading=true;q("[data-refresh]").disabled=true;r.setAttribute("aria-busy","true");
    q("[data-state]").setAttribute("role","status");q("[data-state]").textContent="กำลังโหลด 0/2 ส่วน";
    var completed=0;
    var results=await Promise.allSettled([loadReview(),loadSupply()].map(function(task){return task.finally(function(){completed++;q("[data-state]").textContent="โหลดเสร็จ "+completed+"/2 ส่วน"})}));
    q("[data-state]").textContent=results.every(function(x){return x.status==="fulfilled"&&x.value===true})?"โหลดครบ 100%":"โหลดได้บางส่วน · ดูสถานะด้านล่าง";
    r.setAttribute("aria-busy","false");q("[data-refresh]").disabled=false;loading=false;
  }
  q("[data-form]").onsubmit=function(e){e.preventDefault();var v=txt(q("[data-query]").value);if(v)lookup(v)};
  q("[data-refresh]").onclick=loadAll;
  bindDecisions();loadAll()
}