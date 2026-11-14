// LV Max: task-first presentation over the existing authenticated Partner contract.
export const PARTNER_LVMAX_JS = String.raw`
  var lvOrder = [], lvRevision = null, lvOrderReady = false, lvOrderBusy = false, lvSortMode = false, lvHomeQuery = "";
  function jobCard(job) {
    var when = job.start_at || job.date;
    var date = when ? new Date(when) : null;
    var valid = date && !isNaN(date.getTime());
    var dateLabel = valid ? date.toLocaleDateString('th-TH',{day:'numeric',month:'short',timeZone:'Asia/Bangkok'}) : 'รอยืนยันวัน';
    var timeLabel = valid && !/^\d{4}-\d{2}-\d{2}$/.test(when) ? date.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}) : 'รอยืนยันเวลา';
    var conflicts = conflictFor(job);
    return '<details class="lv-job"><summary><span class="lv-job-date"><b>'+esc(dateLabel)+'</b><span>'+esc(timeLabel)+'</span></span><span class="lv-job-info"><strong>'+esc(job.model_name || 'รอยืนยันนายแบบ')+'</strong><span>'+esc(job.work_type || job.work_lane || 'รายละเอียดงาน')+'</span><span>'+esc(job.location || 'รอยืนยันจุดนัด')+'</span></span><span class="lv-job-state">'+esc(label(job.status))+'<span aria-hidden="true">↗</span></span></summary><div class="lv-job-detail">'+(conflicts.length?'<p class="pcr-collision">คิวชน '+conflicts.length+' รายการ · ตรวจตารางก่อนยืนยัน</p>':'')+detailedJobCard(job)+'</div></details>';
  }
  function renderMissionJobs(jobs) {
    var now=Date.now(),day=dayKey(new Date()),finished=/^(declined|cancelled|canceled|completed|closed|expired|void)$/i;
    var upcoming=[],current=[],history=[],unknown=[];
    jobs.forEach(function(j){var when=j.start_at||j.date||'',start=Date.parse(when),end=Date.parse(j.end_at||'');
      if(finished.test(j.lifecycle_status)||finished.test(j.status)){history.push(j);return;}
      if(!Number.isFinite(start)){unknown.push(j);return;}
      if(/^\d{4}-\d{2}-\d{2}$/.test(when)?when>=day:start>=now){upcoming.push(j);return;}
      if((Number.isFinite(end)&&end>now)||/^(traveling|arrived|in_progress|working)$/.test(j.status)){current.push(j);return;}
      history.push(j);
    });
    function ordered(rows){return rows.slice().sort(function(a,b){return Date.parse(a.start_at||a.date)-Date.parse(b.start_at||b.date);}).map(jobCard).join('');}
    $('[data-jobs]',root).innerHTML=(current.length?'<div class="lv-subhead">งานที่อยู่ในช่วงนัด</div>'+ordered(current):'')+
      (upcoming.length?ordered(upcoming.slice(0,2))+(upcoming.length>2?'<details class="lv-history"><summary>งานถัดไปอีก '+(upcoming.length-2)+' งาน</summary>'+ordered(upcoming.slice(2))+'</details>':''):'<div class="pcr-empty">ยังไม่มีงานถัดไปที่ยืนยันวันนัดแล้ว</div>')+
      (unknown.length?'<details class="lv-history"><summary>ข้อมูลวันนัดยังไม่ครบ · '+unknown.length+' งาน</summary>'+unknown.map(jobCard).join('')+'</details>':'')+
      (history.length?'<details class="lv-history"><summary>งานที่ผ่านมาและงานอื่น · '+history.length+' งาน</summary>'+ordered(history)+'</details>':'');
  }
  function lvModels(data){
    var source=data.models||[],byId=new Map(source.map(function(m){return[m.model_record_id,m];}));
    return lvOrder.filter(function(id){return byId.has(id);}).map(function(id){return byId.get(id);}).concat(source.filter(function(m){return lvOrder.indexOf(m.model_record_id)<0;}));
  }
  function lvModelCard(m){
    var approved=m.sales_control&&m.sales_control.approved_policy,proposal=m.sales_control&&m.sales_control.proposal;
    var active=m.roster_active!==false,visible=approved&&approved.sales_visibility==='on';
    var readiness=[];if(!(m.profile_summary||m.skills_summary||m.sales_copy))readiness.push('ข้อมูลแนะนำ');if(!approved)readiness.push('เรทที่อนุมัติ');
    var activeModels=lvModels(state.data).filter(function(x){return x.roster_active!==false;}),rank=activeModels.findIndex(function(x){return x.model_record_id===m.model_record_id;});
    var cover=state.modelCoverUrls&&state.modelCoverUrls[m.model_record_id]||m.image_url;
    var image=cover?'<img src="'+esc(cover)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span>'+esc(String(m.display_name||'M').slice(0,1))+'</span>';
    return '<article class="pcr-model lv-model" data-model="'+esc(m.model_record_id)+'">'+
      '<div class="pcr-model-image">'+image+'</div><div class="pcr-model-copy"><div class="pcr-model-title"><div><span class="lv-rank">'+(active?'NO. '+String(rank+1).padStart(2,'0'):'ประวัติ')+'</span><h3>'+esc(m.display_name)+'</h3></div><button type="button" class="lv-visibility '+(visible?'is-on':'')+'" data-edit-model="visibility" aria-label="ขอเปลี่ยนการมองเห็น '+esc(m.display_name)+'"><span aria-hidden="true" class="lv-toggle"></span><span>'+(!approved?'รอตรวจ':visible?'ON ตามตาราง':'OFF')+'</span></button></div>'+
      '<p class="lv-model-summary">'+esc(m.sales_copy||m.profile_summary||m.skills_summary||'ยังไม่มีข้อมูลแนะนำ')+'</p>'+
      '<div class="lv-model-facts"><span>'+esc(m.height_cm==null?'—':m.height_cm)+' cm · '+esc(m.weight_kg==null?'—':m.weight_kg)+' kg</span><span>'+esc(({available:'พร้อมรับงาน',busy:'ติดคิว',away:'อยู่นอกพื้นที่',off:'พักรับงาน'})[m.availability_status]||m.availability_status||'ยังไม่ระบุความพร้อม')+'</span></div>'+
      '<div class="lv-rates"><span>เรทถึงตัว <b>'+esc(approved?money(approved.partner_source_rate_thb):'ยังไม่ยืนยัน')+'</b></span><span>เรทขาย <b>'+esc(approved?money(approved.customer_sell_rate_thb):'ยังไม่ยืนยัน')+'</b></span></div>'+
      (proposal&&/^(review|pending_review)$/i.test(proposal.status)?'<p class="lv-pending">มีข้อเสนอเรท / การมองเห็นรอตรวจ</p>':'')+
      (readiness.length?'<p class="lv-readiness">ยังไม่ครบ: '+esc(readiness.join(' · '))+'</p>':'')+
      '<div class="pcr-quick-actions"><button type="button" data-edit-model>แก้โปรไฟล์ / เรท</button><button type="button" class="ghost" data-edit-model="photo">อัปโหลดรูปใหม่</button></div>'+
      (lvSortMode&&active?'<div class="lv-order-controls"><button type="button" data-order-move="top" '+(rank===0||lvOrderBusy||!lvOrderReady?'disabled':'')+'>วางบนสุด</button><button type="button" data-order-move="up" aria-label="เลื่อน '+esc(m.display_name)+' ขึ้น" '+(rank===0||lvOrderBusy||!lvOrderReady?'disabled':'')+'>↑</button><button type="button" data-order-move="down" aria-label="เลื่อน '+esc(m.display_name)+' ลง" '+(rank===activeModels.length-1||lvOrderBusy||!lvOrderReady?'disabled':'')+'>↓</button></div>':'')+'</div></article>';
  }
  function renderLvModels(data){
    var markup=lvModels(data).map(modelCard).join('');
    var pending=(data.model_changes||[]).filter(function(x){return x.action==='add_model'&&x.status==='review';});
    markup+=pending.map(function(x){return '<article class="lv-pending-model"><b>'+esc(x.payload&&x.payload.display_name||'นายแบบใหม่')+'</b><span>รอตรวจข้อมูลเข้าร่วมสังกัด</span></article>';}).join('');
    $$('[data-models],[data-home-models]',root).forEach(function(target){target.innerHTML=markup||'<div class="pcr-empty">ยังไม่มีนายแบบในสังกัด</div>';});
    $$('[data-model-count]',root).forEach(function(e){e.textContent=(data.models||[]).filter(function(m){return m.roster_active!==false;}).length;});
    $$('[data-home-models] [data-model]',root).forEach(function(card){var m=modelById(card.dataset.model);card.hidden=m.roster_active===false||!String(m.display_name).toLowerCase().includes(lvHomeQuery);});
  }
  function loadRosterOrder(){
    lvOrderReady=false;
    return api('/v1/partner/roster-order').then(function(p){lvOrder=p.model_ids||[];lvRevision=p.revision;lvOrderReady=true;if(state.data){renderModels(state.data);bindDynamic();filterRoster();}}).catch(function(){if(!state.authBlocked)setFlash('โหลดลำดับนายแบบไม่สำเร็จ · กดลองโหลดลำดับอีกครั้ง','error');});
  }
  function moveLvModel(button){
    if(!lvOrderReady||lvOrderBusy||state.stale)return;
    var id=button.closest('[data-model]').dataset.model,ids=lvModels(state.data).filter(function(m){return m.roster_active!==false;}).map(function(m){return m.model_record_id;}),from=ids.indexOf(id),to=button.dataset.orderMove==='top'?0:from+(button.dataset.orderMove==='up'?-1:1);
    if(from<0||to<0||to>=ids.length)return;ids.splice(from,1);ids.splice(to,0,id);
    lvOrderBusy=true;$$('[data-order-move]',root).forEach(function(b){b.disabled=true;});
    api('/v1/partner/roster-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:lvRevision,model_ids:ids})}).then(function(p){lvOrder=p.model_ids;lvRevision=p.revision;setFlash('บันทึกลำดับนายแบบใน MY PARTNER แล้ว','success');}).catch(function(e){lvOrderReady=false;setFlash(e.message+' · กดลองโหลดลำดับอีกครั้ง','error');}).finally(function(){lvOrderBusy=false;if(state.authBlocked)return;renderModels(state.data);bindDynamic();filterRoster();var focus=$('[data-home-models] [data-model="'+id+'"] [data-order-move="'+button.dataset.orderMove+'"]',root);if(focus&&!focus.disabled)focus.focus();});
  }
  function bindLvActions(){
    $$('[data-order-move]',root).forEach(function(b){b.onclick=function(){moveLvModel(b);};});
  }
  function renderLvAttention(data){
    var changed=(data.jobs||[]).filter(function(j){return j.notification_status==='pending_change';}).length;
    var response=(data.jobs||[]).filter(function(j){return j.confirmation_allowed===true&&!/^(confirmed|declined)$/.test(j.status);}).length;
    var el=$('[data-lv-attention]',root);if(!el)return;el.hidden=!(changed||response);
    el.textContent=[changed?'รายละเอียดเปลี่ยน '+changed+' งาน':'',response?'รอคำตอบ '+response+' งาน':''].filter(Boolean).join(' · ');
  }
  function setLvEditorMode(mode){
    var dialog=$('[data-model-dialog]',root),form=$('[data-model-form]',dialog),grid=$('.pcr-form-grid',form);
    if(!$('[data-editor-tabs]',dialog)){
      var tabs=document.createElement('div');tabs.className='lv-editor-tabs';tabs.dataset.editorTabs='';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','ส่วนแก้ไขนายแบบ');
      tabs.innerHTML=[['profile','โปรไฟล์'],['sales','เรท / การมองเห็น'],['media','รูปภาพ'],['more','เพิ่มเติม']].map(function(t){return '<button type="button" data-editor-tab="'+t[0]+'">'+t[1]+'</button>';}).join('');$('.pcr-dialog-head',dialog).after(tabs);
      $$('[data-editor-tab]',tabs).forEach(function(b){b.onclick=function(){setLvEditorMode(b.dataset.editorTab);};});
      Array.from(grid.children).forEach(function(el){var group='profile';if(el.matches('.pcr-consent'))group='all';else if(el.matches('.pcr-private-field')||el.querySelector('[name=working_system],[data-model-history]'))group='more';else if(el.querySelector('[name=partner_source_rate_thb],[name=schedule_type]'))group='sales';else if(el.querySelector('[name=model_file],[data-model-assets]'))group='media';el.dataset.editorGroup=group;});
      var note=document.createElement('p');note.className='lv-editor-note';note.dataset.editorGroup='sales';note.textContent='การเปลี่ยนเรทและการมองเห็นเป็นคำขอให้ตรวจ สถานะเดิมยังมีผลจนระบบยืนยัน';grid.prepend(note);
    }
    $$('[data-editor-group]',form).forEach(function(el){el.hidden=el.dataset.editorGroup!=='all'&&el.dataset.editorGroup!==mode;});
    $$('[data-editor-tab]',dialog).forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.editorTab===mode));});
    $('[data-save-profile]',form).hidden=mode!=='profile';$('[data-remove-model]',form).hidden=mode!=='more';
    var feedback=$('[data-dialog-feedback]',dialog);if(feedback){feedback.textContent='';feedback.hidden=true;}
    $('.pcr-dialog-head h2',dialog).textContent=state.model?state.model.display_name:'แก้ไขนายแบบ';
  }
  function prepareLvHome(){
    if($('[data-lv-tools]',root))return;
    var home=$('[data-view-panel="home"]',root),top=$('.pcr-top',home),roster=$('.pcr-mission-roster',home),jobs=$('[data-jobs]',home).parentElement;
    root.dataset.lv='max';
    $('[data-hero-title]',root).textContent='Our Mission';
    $('.pcr-hero-copy span',root).textContent='งานที่กำลังจะเกิดขึ้น แล้วดูแลนายแบบต่อได้เลย';
    $('.pcr-hero-copy p',root).textContent='MY PARTNER · WORKSPACE';
    top.innerHTML='<span data-partner-name hidden></span><div><p class="mmdp-eyebrow">UPCOMING / BANGKOK</p><h2>งานที่กำลังจะเกิดขึ้น</h2></div><button type="button" class="ghost" data-lv-refresh>อัปเดตข้อมูล</button>';
    var attention=document.createElement('p');attention.className='lv-attention';attention.dataset.lvAttention='';attention.hidden=true;top.after(attention);
    var heading=$('.pcr-section-head',jobs);heading.hidden=true;
    var filter=$('.pcr-toolbar',jobs),detail=document.createElement('details');detail.className='lv-filter';detail.innerHTML='<summary>ค้นหาและกรองงาน</summary>';filter.before(detail);detail.append(filter);
    var privateDetails=document.createElement('details');privateDetails.className='lv-private';privateDetails.innerHTML='<summary>คิวส่วนตัวและงานนอก</summary>';
    var after=$('[data-jobs]',jobs).nextSibling;var move=[];while(after){move.push(after);after=after.nextSibling;}move.forEach(function(n){privateDetails.append(n);});jobs.append(privateDetails);
    $('.pcr-section-head',roster).innerHTML='<div><p class="mmdp-eyebrow">YOUR ROSTER</p><h3>MY CO MODELS <span class="lv-count" data-model-count></span></h3></div><button type="button" data-lv-sort aria-pressed="false">จัดลำดับ Top</button>';
    var tools=document.createElement('div');tools.dataset.lvTools='';tools.className='lv-roster-tools';tools.innerHTML='<label><span class="lv-sr">ค้นหานายแบบในสังกัด</span><input type="search" data-lv-search placeholder="ค้นหานายแบบในสังกัด"></label><button type="button" data-lv-order-reload>โหลดลำดับอีกครั้ง</button><p>จัดลำดับเฉพาะพื้นที่ MY PARTNER ของบัญชีนี้</p>';$('[data-home-models]',roster).before(tools);
    $('[data-lv-sort]',root).onclick=function(event){var control=event.currentTarget;lvSortMode=!lvSortMode;control.setAttribute('aria-pressed',String(lvSortMode));control.textContent=lvSortMode?'เสร็จแล้ว':'จัดลำดับ Top';renderModels(state.data);bindDynamic();filterRoster();};
    $('[data-lv-search]',root).oninput=function(event){lvHomeQuery=event.currentTarget.value.trim().toLowerCase();$$('[data-home-models] [data-model]',root).forEach(function(card){var m=modelById(card.dataset.model);card.hidden=m.roster_active===false||!String(m.display_name).toLowerCase().includes(lvHomeQuery);});};
    $('[data-lv-order-reload]',root).onclick=function(){loadRosterOrder();};
    $('[data-lv-refresh]',root).onclick=function(event){var b=event.currentTarget;b.disabled=true;load().finally(function(){b.disabled=false;});};
    var nav=$('.pcr-side',root),more=document.createElement('details');more.className='lv-more';more.innerHTML='<summary>เพิ่มเติม</summary>';
    $$('[data-view]',nav).forEach(function(b){if(!['home','models','earnings'].includes(b.dataset.view))more.append(b);});nav.append(more);
    $('[data-view="home"]',nav).textContent='Our Mission';$('[data-view="models"]',nav).textContent='MY CO MODELS';$('[data-view="earnings"]',nav).textContent='รายได้';
    var privacy=$('.pcr-privacy',root),privacyDetails=document.createElement('details');privacyDetails.className='lv-privacy-details';privacyDetails.innerHTML='<summary>ความเป็นส่วนตัวและการแชร์ข้อมูล</summary>';privacy.before(privacyDetails);privacyDetails.append(privacy);home.append(privacyDetails);
  }
`;

export const PARTNER_LVMAX_CSS = String.raw`
body[data-mmd-partner-page="partner-dashboard"]{--mmdp-ivory:#30241c;--mmdp-copy:#47392d;--mmdp-muted:#685a4c;--mmdp-gold:#705335;--mmdp-gold-2:#705335;--mmdp-ink:#fffdf8;--mmdp-line:#ded1bf;--pcr-line:#ded1bf;--pcr-copy:#30241c;--pcr-bg:#f7f2ea;--pcr-panel:#fffdf8;background:#f7f2ea;color:#30241c}
body[data-mmd-partner-page="partner-dashboard"] .mmd-partner-system{max-width:1280px;padding:16px 18px 40px}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-nav{margin-bottom:22px;border-color:#ded1bf;padding-bottom:16px}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-brand b{color:#30241c;font-size:20px;letter-spacing:.12em}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-brand span{color:#685a4c}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-nav a{color:#47392d}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] {font-size:16px;line-height:1.6}
body[data-mmd-partner-page="partner-dashboard"] .pcr-shell{gap:28px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side{gap:6px;align-items:start;overflow:visible;border:0;z-index:20;position:relative}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side button{font:500 14px/1.4 Anuphan,system-ui,sans-serif;background:transparent;color:#685a4c;border:0;box-shadow:none;white-space:normal}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side button[aria-current="page"]{background:#30241c;color:#fff9ef;box-shadow:none}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side small{color:#685a4c;font-size:10px;letter-spacing:.16em}
body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero{min-height:0;border:0;border-radius:0;box-shadow:none;background:transparent;margin:0 0 26px;overflow:visible}
body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero:before,body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero:after,body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero img,body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-rail,body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-foot{display:none}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy{padding:0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy p{font-size:10px;letter-spacing:.14em;color:#705335;margin-bottom:10px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy h1{font-size:clamp(34px,5vw,48px);font-weight:500;line-height:1.15;color:#30241c!important;-webkit-text-fill-color:#30241c!important;letter-spacing:-.04em}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy span{color:#685a4c;font-size:15px;display:block;margin-top:12px}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] :is(h2,h3){color:#30241c!important;-webkit-text-fill-color:#30241c!important;letter-spacing:-.02em}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] :is(.pcr-top,.pcr-section-head){flex-direction:row;align-items:center;gap:12px;margin-bottom:16px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-top h2{font-size:18px}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-eyebrow{font-size:10px;color:#705335;letter-spacing:.14em;margin:0 0 6px}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] :is(.pcr-section,.pcr-metrics article,.pcr-job,.pcr-model,.pcr-vault-card){background:#fffdf8;border-color:#ded1bf;border-radius:12px;box-shadow:none}
body[data-mmd-partner-page="partner-dashboard"] [data-view-panel="home"]>.pcr-section{padding:0;border:0;background:transparent}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .pcr-mission-roster{margin-top:32px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-mission-roster h3{font-size:22px;font-weight:500;letter-spacing:-.04em}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] :is(button,.mmdp-btn){min-height:44px;font-family:inherit;font-size:14px;padding:9px 13px;border-radius:7px;background:#493521;color:#fffdf8;border:1px solid #493521;cursor:pointer}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] :is(button.ghost,[data-lv-sort],[data-lv-order-reload],[data-order-move]){background:transparent;color:#493521;border-color:#bda78e}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] button:disabled{cursor:not-allowed;opacity:.5}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] :is(input,textarea,select){background:#fffdf8;border:1px solid #ab947c;color:#30241c;min-height:44px;font:inherit;border-radius:7px;padding:10px;max-width:100%;box-sizing:border-box}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] input::placeholder{color:#766554}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] :is(button,input,select,textarea,a,summary):focus-visible{outline:3px solid #845629;outline-offset:3px}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] :is(.pcr-top p,.pcr-model-copy p,.pcr-toolbar label,.pcr-form label>span,.pcr-telegram span){color:#685a4c}
body[data-mmd-partner-page="partner-dashboard"] .pcr-jobs{gap:10px}
body[data-mmd-partner-page="partner-dashboard"] .lv-job{border:1px solid #ded1bf;background:#fffdf8;border-radius:12px;overflow:hidden}
body[data-mmd-partner-page="partner-dashboard"] .lv-job>summary{display:grid;grid-template-columns:70px minmax(0,1fr) auto;gap:18px;align-items:center;padding:18px;cursor:pointer;list-style:none;min-height:44px}
body[data-mmd-partner-page="partner-dashboard"] summary::-webkit-details-marker{display:none}
body[data-mmd-partner-page="partner-dashboard"] .lv-job:first-of-type{border-color:#ab947c;background:#f1e6d6}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-date{border-right:1px solid #ded1bf;padding-right:14px;display:grid;gap:4px;color:#705335;font-variant-numeric:tabular-nums}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-date b{font-size:16px;font-weight:600}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-date>span{font-size:14px}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-info{display:grid;min-width:0;gap:3px}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-info strong{font-size:18px;font-weight:600;color:#30241c}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-info>span{font-size:14px;color:#685a4c;overflow-wrap:anywhere}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-state{display:flex;align-items:center;gap:12px;font-size:12px;color:#705335}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-state>span{font-size:23px}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-detail{border-top:1px solid #ded1bf;padding:10px}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-detail .pcr-job{border:0;background:transparent;padding:10px}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-detail .pcr-job-main{display:none}
body[data-mmd-partner-page="partner-dashboard"] .lv-job-detail .pcr-job dl{margin-top:0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-job dl div{background:#f7f2ea}
body[data-mmd-partner-page="partner-dashboard"] .pcr-job dd{color:#30241c}
body[data-mmd-partner-page="partner-dashboard"] .pcr-job-locked{background:#f1eee6;border-color:#ded1bf;color:#493521}
body[data-mmd-partner-page="partner-dashboard"] .pcr-job-locked :is(b,span){color:#493521}
body[data-mmd-partner-page="partner-dashboard"] :is(.lv-filter,.lv-history,.lv-private,.lv-privacy-details,.pcr-mission-extra){font-size:14px;color:#685a4c;margin:8px 0}
body[data-mmd-partner-page="partner-dashboard"] :is(.lv-filter,.lv-history,.lv-private,.lv-privacy-details,.pcr-mission-extra)>summary{min-height:44px;display:flex;align-items:center;gap:12px;cursor:pointer;padding:8px 0}
body[data-mmd-partner-page="partner-dashboard"] :is(.lv-filter,.lv-history,.lv-private,.lv-privacy-details,.pcr-mission-extra)>summary:after{content:'+';margin-left:auto;font-size:20px}
body[data-mmd-partner-page="partner-dashboard"] details[open]>summary:after{content:'−'}
body[data-mmd-partner-page="partner-dashboard"] .lv-subhead{font-size:13px;color:#705335;padding:8px 0}
body[data-mmd-partner-page="partner-dashboard"] .lv-attention{border-left:3px solid #845629;background:#ecdfcd;padding:12px 16px;border-radius:0 8px 8px 0;color:#493521;font-size:14px}
body[data-mmd-partner-page="partner-dashboard"] .lv-roster-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
body[data-mmd-partner-page="partner-dashboard"] .lv-roster-tools label{flex:1 1 180px;min-width:0}
body[data-mmd-partner-page="partner-dashboard"] .lv-roster-tools input{width:100%}
body[data-mmd-partner-page="partner-dashboard"] .lv-roster-tools p{width:100%;margin:0;font-size:12px;color:#685a4c}
body[data-mmd-partner-page="partner-dashboard"] .lv-roster-tools [data-lv-order-reload]{font-size:12px}
body[data-mmd-partner-page="partner-dashboard"] .lv-count{font-size:13px;border:1px solid #ded1bf;border-radius:20px;padding:3px 8px;vertical-align:middle;letter-spacing:0}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .lv-model{grid-template-columns:76px minmax(0,1fr);padding:18px;gap:18px;border-radius:0;border-width:0 0 1px;background:transparent}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .pcr-models{gap:0;border-top:1px solid #ded1bf;grid-template-columns:minmax(0,1fr)}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .pcr-model-image{height:100px;min-height:0;border-radius:9px;aspect-ratio:3/4;background:#ecdfcd;color:#705335;font-size:30px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-model-image img{object-position:50% 15%}
body[data-mmd-partner-page="partner-dashboard"] .lv-rank{font-size:10px;letter-spacing:.14em;color:#705335}
body[data-mmd-partner-page="partner-dashboard"] .lv-model h3{font-size:21px;margin:1px 0}
body[data-mmd-partner-page="partner-dashboard"] .lv-model-summary{font-size:14px;line-height:1.6;margin:6px 0;overflow-wrap:anywhere}
body[data-mmd-partner-page="partner-dashboard"] .lv-model-facts{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;color:#685a4c;margin:6px 0}
body[data-mmd-partner-page="partner-dashboard"] .lv-rates{display:flex;flex-wrap:wrap;gap:8px 24px;font-size:13px;margin:10px 0;color:#685a4c}
body[data-mmd-partner-page="partner-dashboard"] .lv-rates b{display:block;color:#30241c;font-weight:500}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .lv-visibility{background:transparent;border:0;color:#685a4c;padding:0 0 0 6px;display:flex;align-items:center;gap:7px;font-size:11px;min-width:44px;flex-shrink:0}
body[data-mmd-partner-page="partner-dashboard"] .lv-toggle{display:block;width:30px;height:18px;border-radius:12px;background:#b4a38e;padding:3px;box-sizing:border-box}
body[data-mmd-partner-page="partner-dashboard"] .lv-toggle:before{content:'';display:block;width:12px;height:12px;background:#fffdf8;border-radius:50%}
body[data-mmd-partner-page="partner-dashboard"] .is-on .lv-toggle{background:#556a52}
body[data-mmd-partner-page="partner-dashboard"] .is-on .lv-toggle:before{transform:translateX(12px)}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .lv-readiness,body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .lv-pending{font-size:12px;color:#705335;margin:8px 0}
body[data-mmd-partner-page="partner-dashboard"] .lv-order-controls{display:flex;gap:8px;margin-top:12px}
body[data-mmd-partner-page="partner-dashboard"] .lv-order-controls button{min-width:44px}
body[data-mmd-partner-page="partner-dashboard"] .lv-pending-model{display:flex;justify-content:space-between;gap:12px;padding:20px 0;border-bottom:1px solid #ded1bf;color:#685a4c}
body[data-mmd-partner-page="partner-dashboard"] .lv-more{position:relative;flex:1}
body[data-mmd-partner-page="partner-dashboard"] .lv-more>summary{padding:10px 12px;min-height:44px;box-sizing:border-box;cursor:pointer;font-size:14px;list-style:none}
body[data-mmd-partner-page="partner-dashboard"] .lv-more[open]{background:#fffdf8;box-shadow:0 12px 30px #30241c10;border-radius:9px}
body[data-mmd-partner-page="partner-dashboard"] .lv-more button{display:block;width:100%;text-align:left}
body[data-mmd-partner-page="partner-dashboard"] .pcr-flash{top:8px;background:#fffdf8;color:#30241c;border-color:#bda78e;box-shadow:0 6px 20px #30241c12}
body[data-mmd-partner-page="partner-dashboard"] .pcr-flash[data-tone=error]{background:#fff3ee;color:#733c29;border-color:#ac7052}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] :is(.pcr-dialog,.pcr-dialog-head){background:#fffdf8;color:#30241c;border-color:#ded1bf}
body[data-mmd-partner-page="partner-dashboard"] .pcr-dialog::backdrop{background:#30241c80;backdrop-filter:blur(4px)}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .pcr-dialog{max-height:90dvh;width:min(760px,calc(100% - 24px));height:auto;padding:0;border-radius:14px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-dialog .pcr-form{padding:20px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-dialog fieldset{border-color:#ded1bf}
body[data-mmd-partner-page="partner-dashboard"] :is(.pcr-telegram,.pcr-privacy){background:#f1e6d6;border-color:#ded1bf;color:#493521}
body[data-mmd-partner-page="partner-dashboard"] .pcr-privacy :is(b,p),body[data-mmd-partner-page="partner-dashboard"] .pcr-telegram :is(b,small){color:#493521}
body[data-mmd-partner-page="partner-dashboard"] .pcr-empty{padding:24px 14px;text-align:left;color:#685a4c;font-size:14px}
body[data-mmd-partner-page="partner-dashboard"] .lv-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
body[data-mmd-partner-page="partner-dashboard"] .lv-editor-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:14px 20px 0}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .lv-editor-tabs button{background:transparent;color:#493521;border-color:#ded1bf}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .lv-editor-tabs button[aria-pressed=true]{background:#493521;color:#fffdf8;border-color:#493521}
body[data-mmd-partner-page="partner-dashboard"] .lv-dialog-feedback{margin:12px 20px;padding:12px;background:#f1e6d6;color:#493521;border-radius:8px}
body[data-mmd-partner-page="partner-dashboard"] .lv-editor-note{grid-column:1/-1;color:#685a4c;font-size:14px}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-nav{position:static;background:transparent;backdrop-filter:none;box-shadow:none;min-height:0}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-nav>div{display:none}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .pcr-side button{background:transparent;color:#685a4c;border:0;box-shadow:none}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .pcr-side button[aria-current=page]{background:#30241c;color:#fff9ef}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] [data-view-panel="home"]>.pcr-section{background:transparent;border:0;padding:0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-quick-actions button{flex:0 1 auto}
body[data-mmd-partner-page="partner-dashboard"] .pcr-dashboard-links{color:#685a4c}
@media(min-width:860px){body[data-mmd-partner-page="partner-dashboard"] .mmd-partner-system{padding:28px 36px 48px}body[data-mmd-partner-page="partner-dashboard"] .pcr-side{position:sticky;top:24px;max-width:184px}body[data-mmd-partner-page="partner-dashboard"] .pcr-shell{grid-template-columns:184px minmax(0,1fr);gap:48px}body[data-mmd-partner-page="partner-dashboard"] .pcr-main{max-width:860px}body[data-mmd-partner-page="partner-dashboard"] .lv-more{width:100%;border-top:1px solid #ded1bf;margin-top:18px;padding-top:12px}body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero{padding-top:8px}}
@media(max-width:600px){body[data-mmd-partner-page="partner-dashboard"] .pcr-side{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,3.8em),1fr));padding:0;margin:0 0 24px;gap:4px}body[data-mmd-partner-page="partner-dashboard"] .pcr-side button{font-size:11px;padding:8px 5px;min-width:0}body[data-mmd-partner-page="partner-dashboard"] .lv-more>summary{font-size:12px;padding:10px 6px;text-align:center}body[data-mmd-partner-page="partner-dashboard"] .lv-more[open]{position:absolute;right:0;top:0;width:170px;z-index:35;padding:0 8px 8px}body[data-mmd-partner-page="partner-dashboard"] .pcr-top{flex-wrap:wrap}body[data-mmd-partner-page="partner-dashboard"] .pcr-top h2{font-size:17px}body[data-mmd-partner-page="partner-dashboard"] .lv-job>summary{grid-template-columns:60px minmax(0,1fr);gap:12px;padding:14px}body[data-mmd-partner-page="partner-dashboard"] .lv-job-state{grid-column:2;justify-content:space-between;margin-top:0}body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .lv-model{padding:18px 0;grid-template-columns:56px minmax(0,1fr);gap:12px}body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .pcr-model-image{height:76px}body[data-mmd-partner-page="partner-dashboard"] .lv-model h3{font-size:19px}body[data-mmd-partner-page="partner-dashboard"] .lv-model .pcr-model-title{flex-wrap:wrap;gap:4px}body[data-mmd-partner-page="partner-dashboard"] .lv-visibility{min-height:44px}body[data-mmd-partner-page="partner-dashboard"] .pcr-quick-actions{gap:6px}body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .pcr-quick-actions button{font-size:12px;padding:8px 10px}body[data-mmd-partner-page="partner-dashboard"] .pcr-mission-roster h3{font-size:20px}body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] [data-lv-sort]{font-size:12px;padding:8px 10px}}
body[data-mmd-partner-page="partner-dashboard"] .mmd-partner-canon-footer{background:#f7f2ea;color:#685a4c;min-height:60px;padding:20px max(18px,env(safe-area-inset-left)) max(20px,env(safe-area-inset-bottom));border-top:1px solid #ded1bf}
@media(max-width:600px){body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .pcr-side button{font-size:11px;line-height:1.3;padding:8px 3px;min-height:44px}body[data-mmd-partner-page="partner-dashboard"] .pcr-side{margin-bottom:12px}body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero{margin-bottom:18px}body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy p{display:none}body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy h1{font-size:32px}body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy span{font-size:13px;margin-top:8px}body[data-mmd-partner-page="partner-dashboard"] .pcr-top .mmdp-eyebrow{display:none}body[data-mmd-partner-page="partner-dashboard"] .lv-job>summary{grid-template-columns:68px minmax(0,1fr)}body[data-mmd-partner-page="partner-dashboard"] .lv-job-date{padding-right:8px}body[data-mmd-partner-page="partner-dashboard"] .lv-job-date b{font-size:14px}body[data-mmd-partner-page="partner-dashboard"] .mmdp-nav{margin-bottom:14px;padding-bottom:12px}body[data-mmd-partner-page="partner-dashboard"] .pcr-top h2{font-size:16px}body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] [data-lv-refresh]{font-size:12px;padding:8px}body[data-mmd-partner-page="partner-dashboard"] .lv-attention{font-size:13px;margin:10px 0}body[data-mmd-partner-page="partner-dashboard"] .lv-job-info strong{font-size:16px}}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] :is(button,summary,h1,h2,h3,span,p){overflow-wrap:anywhere}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .lv-job-state,body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .lv-visibility{min-width:0;flex-wrap:wrap}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .lv-model .pcr-model-title{flex-wrap:wrap}
@media(prefers-reduced-motion:no-preference){body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] button{transition:background .15s ease,color .15s ease}body[data-mmd-partner-page="partner-dashboard"] .lv-job[open] .lv-job-detail{animation:lv-reveal .16s ease-out}@keyframes lv-reveal{from{opacity:.5;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}}
@media(prefers-reduced-motion:reduce){body[data-mmd-partner-page="partner-dashboard"] *,body[data-mmd-partner-page="partner-dashboard"] *:before{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
