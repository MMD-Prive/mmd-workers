// Recruitment stays separate from assigned jobs and replacement requests.
export const PARTNER_ANNOUNCEMENTS_JS = String.raw`
  var ann = { rows:[], cursor:null, ready:false, busy:false, detail:null, preferences:null, preferenceRevision:null, ticket:0 };
  var annLabels = {draft:'ร่าง',open:'เปิดรับ',paused:'พักรับ',closed:'ปิดรับ',filled:'เลือกครบแล้ว',expired:'หมดเขตรับ',submitted:'ส่งให้ MMD แล้ว',more_information:'ขอข้อมูลเพิ่ม',selected:'ได้รับเลือกให้ประสานงานต่อ',rejected:'ไม่ได้รับเลือก',withdrawn:'ถอนการเสนอแล้ว'};
  function annLabel(value){return annLabels[value]||value;}
  function annPost(path,body){return api('/v1/partner/announcements/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
  function annBudget(row){return (row.budget_basis==='model_net'?'งบถึงตัวนายแบบ':'งบรวมงาน')+' · '+money(row.budget_min)+(row.budget_max!==row.budget_min?' – '+money(row.budget_max):'');}
  function annMatches(row,filters){return (!filters.category||row.category.toLowerCase().includes(filters.category.toLowerCase()))&&(!filters.area||row.area.toLowerCase().includes(filters.area.toLowerCase()))&&(filters.budget_min==null||row.budget_max>=filters.budget_min);}
  function annCard(row){return '<article class="ann-card"><div class="ann-kicker"><span>'+esc(row.category)+'</span><span>'+esc(annLabel(row.status))+'</span></div><h4>'+esc(row.title)+'</h4><p>'+esc(dateTime(row.start_at))+' · '+esc(row.area)+'</p><strong>'+esc(annBudget(row))+'</strong><p>ต้องการ '+row.required_count+' คน · ปิดรับ '+esc(dateTime(row.deadline))+'</p>'+(row.proposals.length?'<p class="ann-note">เสนอแล้ว '+row.proposals.length+' คน · '+esc(row.proposals.map(function(p){return annLabel(p.status);}).join(' / '))+'</p>':'')+'<button type="button" class="ghost" data-ann-detail="'+esc(row.id)+'">อ่านรายละเอียด ↗</button></article>';}
  function prepareAnnouncementBoard(){
    if($('[data-ann-home]',root))return;
    var board=document.createElement('section');board.className='pcr-section ann-home';board.dataset.annHome='';
    board.innerHTML='<div class="pcr-section-head"><div><p class="mmdp-eyebrow">OPPORTUNITIES</p><h3>MMD Announcement</h3></div><button type="button" class="ghost" data-ann-all disabled>ดูทั้งหมด</button></div><p class="ann-intro">งานที่เปิดหานายแบบ · อ่านบรีฟแล้วเสนอคนในสังกัดได้</p><p data-ann-notice role="status"></p><div class="ann-grid" data-ann-cards><p>กำลังโหลดประกาศ</p></div><button type="button" class="ghost" data-ann-mine disabled>งานที่เสนอคนไว้</button>';
    $('.pcr-mission-roster',root).before(board);
    var dialog=document.createElement('dialog');dialog.className='pcr-dialog ann-dialog';dialog.dataset.annDialog='';dialog.setAttribute('aria-labelledby','ann-title');
    dialog.innerHTML='<div class="pcr-dialog-head"><h2 id="ann-title">MMD Announcement</h2><button type="button" class="ghost" data-ann-close aria-label="ปิดกระดานประกาศ">ปิด</button></div><p data-ann-feedback role="status"></p><div data-ann-body></div>';
    root.append(dialog);$('[data-ann-close]',dialog).onclick=function(){dialog.close();ann.ticket++;};
    dialog.addEventListener('cancel',function(){ann.ticket++;});
    board.addEventListener('click',function(event){var b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-ann-all'))annOpenList(false);if(b.hasAttribute('data-ann-mine'))annOpenList(true);if(b.hasAttribute('data-ann-retry'))loadAnnouncements().catch(function(){});if(b.dataset.annDetail)annOpenDetail(b.dataset.annDetail);});
    loadAnnouncements().catch(function(){});
    api('/v1/partner/announcements/preferences').then(function(d){ann.preferences=d.preferences;ann.preferenceRevision=d.revision;annRenderHome();}).catch(function(){ann.preferences=null;});
  }
  function annRenderHome(){
    if(state.authBlocked)return;
    var active=ann.rows.filter(function(r){return r.status==='open';}).sort(function(a,b){return Date.parse(a.start_at)-Date.parse(b.start_at);});
    $('[data-ann-cards]',root).innerHTML=active.slice(0,3).map(annCard).join('')||'<p class="pcr-empty">'+(ann.cursor?'ยังไม่มีงานเปิดรับในรายการที่โหลด · เปิดดูทั้งหมดเพื่อโหลดต่อ':'ยังไม่มีประกาศเปิดรับสำหรับบัญชีนี้')+'</p>';
    var prefs=ann.preferences,matches=prefs&&prefs.enabled?active.filter(function(r){return annMatches(r,prefs)&&(!prefs.seen_at||Date.parse(r.brief_updated_at || r.updated_at)>Date.parse(prefs.seen_at));}):[];
    $('[data-ann-notice]',root).textContent=matches.length?'มีประกาศใหม่หรืออัปเดตตรงที่ติดตาม '+matches.length+' รายการ'+(ann.cursor?' ในรายการที่โหลด':''):'';
  }
  async function loadAnnouncements(more){
    if(ann.busy)return;ann.busy=true;
    try{var d=await api('/v1/partner/announcements'+(more&&ann.cursor?'?cursor='+encodeURIComponent(ann.cursor):''));if(state.authBlocked)return;
      ann.rows=more?ann.rows.concat(d.announcements.filter(function(r){return !ann.rows.some(function(old){return old.id===r.id;});})):d.announcements;ann.cursor=d.next_cursor;ann.ready=true;$$('[data-ann-all],[data-ann-mine]',root).forEach(function(b){b.disabled=false;});annRenderHome();
    }catch(e){$('[data-ann-cards]',root).innerHTML='<p role="alert">อัปเดตประกาศไม่ได้ · '+esc(e.message)+'</p><button type="button" data-ann-retry>ลองอีกครั้ง</button>';throw e;}finally{ann.busy=false;}
  }
  function annShow(){var d=$('[data-ann-dialog]',root);if(!d.open)d.showModal();$('[data-ann-feedback]',d).textContent='';return $('[data-ann-body]',d);}
  function annFeedback(message){$('[data-ann-feedback]',root).textContent=message;}
  function annOpenList(mine){
    ann.ticket++;var box=annShow();ann.detail=null;
    box.innerHTML='<div class="ann-list-tools"><button type="button" class="ghost" data-ann-tab="all">ประกาศทั้งหมด</button><button type="button" class="ghost" data-ann-tab="mine">งานที่เสนอคนไว้</button></div><h3>'+(mine?'งานที่เสนอคนไว้':'หางานให้ MY CO MODELS')+'</h3><form data-ann-filter class="ann-filters"><label>ประเภทงาน<input name="category" placeholder="ทุกประเภท"></label><label>พื้นที่<input name="area" placeholder="ทุกพื้นที่"></label><label>วันงาน (เวลาไทย)<input name="date" type="date"></label><label>งบตั้งแต่ (THB)<input name="budget_min" type="number" min="0" step="0.01"></label><button type="submit">กรองงาน</button></form><details class="ann-preferences"><summary>ติดตามงานที่สนใจในแอป</summary><form data-ann-preferences><p>ใช้ประเภทงาน พื้นที่ และงบจากตัวกรองข้างบน แจ้งบนหน้า Our Mission เมื่อเปิดแอป ไม่ส่ง LINE หรือ Telegram</p><label><span><input type="checkbox" name="enabled"> เปิดการติดตาม</span></label><button type="submit">บันทึกการติดตาม</button><button type="button" class="ghost" data-ann-read>อ่านการอัปเดตแล้ว</button></form></details><p data-ann-count></p><div class="ann-grid" data-ann-list></div><div class="ann-list-tools"><button type="button" data-ann-more>โหลดเพิ่มเติม</button><button type="button" class="ghost" data-ann-refresh>โหลดประกาศล่าสุด</button></div>';
    var form=$('[data-ann-filter]',box),pref=$('[data-ann-preferences]',box);
    if(ann.preferences){['category','area','budget_min'].forEach(function(k){form.elements[k].value=ann.preferences[k]==null?'':ann.preferences[k];});pref.elements.enabled.checked=ann.preferences.enabled;}
    function values(){return {category:form.elements.category.value.trim(),area:form.elements.area.value.trim(),budget_min:form.elements.budget_min.value===''?null:Number(form.elements.budget_min.value)};}
    function render(){var v=values(),day=form.elements.date.value;var rows=ann.rows.filter(function(r){return (!mine||r.proposals.length)&&annMatches(r,v)&&(!day||dayKey(new Date(r.start_at))===day);}).sort(function(a,b){return Date.parse(b.created_at)-Date.parse(a.created_at);});$('[data-ann-list]',box).innerHTML=rows.map(annCard).join('')||'<p>ไม่มีรายการตรงกับตัวกรองนี้</p>';$('[data-ann-count]',box).textContent=rows.length+' รายการ'+(ann.cursor?' · ยังมีรายการให้โหลดต่อ':'');$('[data-ann-more]',box).hidden=!ann.cursor;}
    form.onsubmit=function(e){e.preventDefault();render();};
    pref.onsubmit=async function(e){e.preventDefault();if(!ann.preferences){annFeedback('ยังโหลดการติดตามไม่ได้ กรุณาโหลดประกาศล่าสุด');return;}var b=$('button[type="submit"]',pref);b.disabled=true;try{var d=await annPost('preferences',Object.assign(values(),{revision:ann.preferenceRevision,enabled:pref.elements.enabled.checked}));ann.preferences=d.preferences;ann.preferenceRevision=d.revision;annFeedback('บันทึกการติดตามในแอปแล้ว');annRenderHome();}catch(error){annFeedback(error.message);}finally{b.disabled=false;}};
    box.onclick=async function(e){var b=e.target.closest('button');if(!b)return;
      if(b.dataset.annDetail)return annOpenDetail(b.dataset.annDetail);
      if(b.dataset.annTab)return annOpenList(b.dataset.annTab==='mine');
      if(b.hasAttribute('data-ann-more')||b.hasAttribute('data-ann-refresh')){b.disabled=true;try{await loadAnnouncements(b.hasAttribute('data-ann-more'));var p=await api('/v1/partner/announcements/preferences');ann.preferences=p.preferences;ann.preferenceRevision=p.revision;render();annFeedback('โหลดข้อมูลล่าสุดแล้ว');}catch(error){annFeedback(error.message);}finally{b.disabled=false;}}
      if(b.hasAttribute('data-ann-read')&&ann.preferences){b.disabled=true;try{var d=await annPost('preferences',Object.assign({},ann.preferences,{revision:ann.preferenceRevision,mark_read:true}));ann.preferences=d.preferences;ann.preferenceRevision=d.revision;annRenderHome();annFeedback('บันทึกว่าอ่านการอัปเดตแล้ว');}catch(error){annFeedback(error.message);}finally{b.disabled=false;}}
    };render();
  }
  async function annOpenDetail(id){
    var box=annShow(),ticket=++ann.ticket;box.onclick=null;box.innerHTML='<p>กำลังโหลดรายละเอียด</p>';
    try{var d=await api('/v1/partner/announcements/detail?id='+encodeURIComponent(id));if(ticket!==ann.ticket)return;ann.detail=d.announcement;annRenderDetail(box,d.announcement);}catch(e){if(ticket!==ann.ticket)return;box.innerHTML='<p role="alert">'+esc(e.message)+'</p><button type="button" data-ann-detail-retry>ลองอีกครั้ง</button>';$('[data-ann-detail-retry]',box).onclick=function(){annOpenDetail(id);};}
  }
  function annRenderDetail(box,row){
    var models=(state.data.models||[]).filter(function(m){return m.roster_active!==false;});
    box.innerHTML='<button type="button" class="ghost" data-ann-back>← กระดานประกาศ</button><div class="ann-kicker"><span>'+esc(row.category)+'</span><span>'+esc(annLabel(row.status))+'</span></div><h3>'+esc(row.title)+'</h3><p class="ann-copy">'+esc(row.brief)+'</p><dl class="ann-facts"><dt>วันเวลา · ไทย</dt><dd>'+esc(dateTime(row.start_at))+' ถึง '+esc(dateTime(row.end_at))+'</dd><dt>พื้นที่</dt><dd>'+esc(row.area)+'</dd><dt>คุณสมบัติ</dt><dd>'+esc(row.requirements)+'</dd><dt>จำนวน / ปิดรับ</dt><dd>'+row.required_count+' คน · '+esc(dateTime(row.deadline))+'</dd><dt>งบ</dt><dd>'+esc(annBudget(row))+'</dd><dt>ค่าเดินทาง</dt><dd>'+esc(row.travel_terms)+'</dd><dt>ค่าตอบแทน Partner</dt><dd>'+esc(row.partner_fee_terms)+'</dd></dl>'+(row.private_details?'<section class="ann-private"><h4>รายละเอียดสำหรับผู้ได้รับเลือก</h4><p class="ann-copy">'+esc(row.private_details)+'</p></section>':'<p class="ann-note">รายละเอียดลูกค้าและจุดนัดเฉพาะเปิดให้ Partner ที่ได้รับเลือกตามสิทธิ์</p>')+
      (row.proposals.length?'<section><h4>คนที่บัญชีนี้เสนอ</h4>'+row.proposals.map(function(p){return '<article class="ann-proposal"><strong>'+esc(p.model_name)+'</strong><p>'+esc(annLabel(p.status))+' · '+esc(money(p.rate))+' · '+esc(p.availability==='confirmed'?'สอบถามแล้ว คิวว่าง':'กำลังตรวจคิว')+'</p>'+(p.decision_note?'<p class="ann-copy">MMD: '+esc(p.decision_note)+'</p>':'')+'<small>อัปเดต '+esc(dateTime(p.updated_at))+'</small></article>';}).join('')+'</section>':'')+
      (row.status==='open'?'<form data-ann-propose><h4>เสนอคนในสังกัด</h4><p>การเสนอคนและการได้รับเลือกยังไม่ใช่การยืนยันงาน กรุณาตรวจข้อตกลงของงานก่อนตอบรับ</p><label>นายแบบ<select name="model_id" required><option value="">เลือกนายแบบ</option>'+models.map(function(m){var old=row.proposals.find(function(p){return p.model_id===m.model_record_id;});return '<option value="'+esc(m.model_record_id)+'" '+(old&&old.status!=='more_information'?'disabled':'')+'>'+esc(m.display_name)+(old?' · '+esc(annLabel(old.status)):'')+'</option>';}).join('')+'</select></label><label>รูปปัจจุบันที่แชร์กับ MMD<select name="asset_id" required><option value="">เลือกนายแบบก่อน</option></select></label><div class="ann-list-tools"><button type="button" class="ghost" data-ann-upload>อัปโหลดรูปใหม่</button><button type="button" class="ghost" data-ann-assets>โหลดรูปอีกครั้ง</button></div><img class="ann-photo" data-ann-photo alt="รูปที่เลือกเสนอให้ MMD" hidden><div class="ann-filters"><label>เรทที่เสนอถึงตัวนายแบบ (THB)<input name="rate" type="number" min="0" max="10000000" step="0.01" required></label><label>สถานะคิว<select name="availability" required><option value="checking">กำลังตรวจคิว</option><option value="confirmed">สอบถามแล้ว คิวว่าง</option></select></label></div><label>รายละเอียดเพิ่มเติม<textarea name="note" maxlength="2000" rows="3"></textarea></label><label class="ann-check"><input name="photo_current" type="checkbox" required> ยืนยันว่าเป็นรูปปัจจุบันของนายแบบคนนี้</label><label class="ann-check"><input name="share_with_mmd" type="checkbox" required> แชร์รูปและข้อมูลที่เสนอรายการนี้กับ MMD</label><button type="submit">เสนอคนนี้ให้ MMD</button><button type="button" class="ghost" data-ann-latest>ตรวจประกาศล่าสุด</button><p data-ann-send-status role="status"></p></form>':'<p>ประกาศนี้ไม่เปิดรับข้อเสนอเพิ่ม</p>');
    $('[data-ann-back]',box).onclick=function(){annOpenList(false);};
    var form=$('[data-ann-propose]',box);if(!form)return;
    var assetTicket=0;
    async function assets(){var selected=form.elements.model_id.value,version=++assetTicket;form.elements.asset_id.innerHTML='<option value="">กำลังโหลดรูป</option>';$('[data-ann-photo]',form).hidden=true;if(!selected)return;try{var d=await api('/v1/partner/models/assets?model_record_id='+encodeURIComponent(selected));if(version!==assetTicket)return;var rows=d.assets.filter(function(a){return a.model_record_id===selected&&a.preview_available&&!['rejected','removed','deleted','revoked'].includes(a.review_status)&&['photo','comp_card','portfolio'].includes(a.category);});form.elements.asset_id.innerHTML='<option value="">'+(rows.length?'เลือกรูป':'ยังไม่มีรูปที่แชร์กับ MMD')+'</option>'+rows.map(function(a){return '<option value="'+esc(a.asset_id)+'">'+esc(a.file_name)+' · '+esc(dateTime(a.uploaded_at))+'</option>';}).join('');}catch(e){if(version!==assetTicket)return;form.elements.asset_id.innerHTML='<option value="">โหลดรูปไม่ได้ · กดโหลดรูปอีกครั้ง</option>';annFeedback(e.message);}}
    form.elements.model_id.onchange=function(){var old=row.proposals.find(function(p){return p.model_id===form.elements.model_id.value;});form.elements.rate.value=old?old.rate:'';form.elements.availability.value=old?old.availability:'checking';form.elements.note.value=old?old.note:'';form.elements.photo_current.checked=false;form.elements.share_with_mmd.checked=false;assets();};
    form.elements.asset_id.onchange=function(event){var selected=event.currentTarget.value;var img=$('[data-ann-photo]',form);img.hidden=!selected;img.referrerPolicy='no-referrer';img.src=selected?'/v1/partner/models/asset?asset_id='+encodeURIComponent(selected)+'&t='+encodeURIComponent(token):'';form.elements.photo_current.checked=false;};
    $('[data-ann-assets]',form).onclick=assets;
    $('[data-ann-upload]',form).onclick=function(){if(!form.elements.model_id.value){annFeedback('เลือกนายแบบก่อนอัปโหลดรูป');return;}openModelEditor(form.elements.model_id.value);setLvEditorMode('media');};
    $('[data-ann-latest]',form).onclick=async function(event){var b=event.currentTarget;b.disabled=true;try{var d=await api('/v1/partner/announcements/detail?id='+encodeURIComponent(row.id));if(d.announcement.revision===row.revision){annFeedback('รายละเอียดตรงกับข้อมูลล่าสุด');}else{var note=$('[data-ann-send-status]',form);note.textContent='ประกาศเปลี่ยนแล้ว ข้อมูลที่กรอกยังอยู่ด้านล่าง กรุณาอ่านรายละเอียดล่าสุดก่อนส่ง';var fresh=document.createElement('div');fresh.className='ann-private';fresh.innerHTML='<h4>รายละเอียดล่าสุด · '+esc(annLabel(d.announcement.status))+'</h4><p>'+esc(d.announcement.title)+'</p><p class="ann-copy">'+esc(d.announcement.brief)+'</p><p>'+esc(dateTime(d.announcement.start_at))+' – '+esc(dateTime(d.announcement.end_at))+' · '+esc(d.announcement.area)+'</p><p>'+esc(d.announcement.requirements)+'</p><p>'+esc(annBudget(d.announcement))+'</p><p>ค่าเดินทาง: '+esc(d.announcement.travel_terms)+'</p><p>Partner: '+esc(d.announcement.partner_fee_terms)+'</p><p>ต้องการ '+d.announcement.required_count+' คน · ปิดรับ '+esc(dateTime(d.announcement.deadline))+'</p><button type="button">อ่านข้อมูลล่าสุดแล้ว</button>';var previous=$('[data-ann-updated]',form);if(previous)previous.remove();fresh.dataset.annUpdated='';note.before(fresh);$('button',fresh).onclick=function(){row=d.announcement;ann.detail=row;note.textContent='ใช้ประกาศล่าสุดในการส่งครั้งถัดไป';fresh.remove();};}}catch(e){annFeedback(e.message);}finally{b.disabled=false;}};
    form.onsubmit=async function(e){e.preventDefault();var b=$('button[type="submit"]',form),feedback=$('[data-ann-send-status]',form);if(b.disabled)return;b.disabled=true;feedback.textContent='กำลังส่งข้อมูล';var values=Object.fromEntries(new FormData(form));values.id=row.id;values.revision=row.revision;values.rate=Number(values.rate);values.photo_current=form.elements.photo_current.checked;values.share_with_mmd=form.elements.share_with_mmd.checked;try{var d=await annPost('propose',values);ann.detail=d.announcement;ann.rows=ann.rows.map(function(r){return r.id===row.id?d.announcement:r;});annRenderHome();annRenderDetail(box,d.announcement);annFeedback('ระบบบันทึกข้อเสนอแล้ว · ติดตามผลในงานที่เสนอคนไว้');}catch(error){feedback.textContent=error.message;}finally{b.disabled=false;}};
  }
`;

export const PARTNER_ANNOUNCEMENTS_CSS = String.raw`
[data-partner-control-room] .ann-home{margin:30px 0}
[data-partner-control-room] .ann-intro{margin:4px 0 18px;color:#685a4c}
[data-partner-control-room] .ann-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:14px 0}
[data-partner-control-room] .ann-card{padding:20px;background:#f6f0e6;border:1px solid #dacdbb;border-radius:16px;min-width:0;display:flex;flex-direction:column;align-items:flex-start}
[data-partner-control-room] .ann-card h4{font-size:21px;line-height:1.45;margin:12px 0 4px;font-weight:500}
[data-partner-control-room] .ann-card p{font-size:15px;line-height:1.65;margin:8px 0}
[data-partner-control-room] .ann-card strong{font-size:16px;font-weight:500}
[data-partner-control-room] .ann-card button{margin-top:auto}
[data-partner-control-room] .ann-kicker{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:13px;color:#685a4c;justify-content:space-between;width:100%}
[data-partner-control-room] .ann-dialog{width:min(960px,calc(100% - 32px));max-width:960px;background:#fffaf2;color:#30241c;padding:24px}
[data-partner-control-room] .ann-dialog h3{font-size:26px;font-weight:500;margin:14px 0}
[data-partner-control-room] .ann-dialog h4{font-size:20px;font-weight:500}
[data-partner-control-room] .ann-dialog :is(p,dd,dt,label){font-size:16px;line-height:1.65;overflow-wrap:anywhere}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room] .ann-dialog{width:min(960px,calc(100% - 24px))}
[data-partner-control-room] .ann-dialog [data-ann-body]{padding:20px}
[data-partner-control-room] .ann-dialog .pcr-dialog-head{gap:12px;padding:16px 20px}
[data-partner-control-room] .ann-dialog .pcr-dialog-head h2{min-width:0;font-size:22px;line-height:1.4}
[data-partner-control-room] .ann-dialog [data-ann-close]{flex-shrink:0;min-width:60px;white-space:nowrap}
[data-partner-control-room] .ann-dialog [data-ann-feedback]:not(:empty){margin:12px 20px}
[data-partner-control-room] .ann-copy{white-space:pre-wrap}
[data-partner-control-room] .ann-note{color:#685a4c}
[data-partner-control-room] .ann-facts{display:grid;grid-template-columns:160px minmax(0,1fr);gap:10px 20px;margin:24px 0}
[data-partner-control-room] .ann-facts dt{color:#685a4c}
[data-partner-control-room] .ann-facts dd{margin:0;white-space:pre-wrap}
[data-partner-control-room] .ann-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end}
[data-partner-control-room] .ann-dialog label{display:grid;gap:6px;margin:12px 0}
[data-partner-control-room] .ann-dialog :is(input,select,textarea){width:100%;min-width:0;max-width:100%;font:inherit;padding:12px;border:1px solid #b7a48d;border-radius:10px;background:#fffdf8;color:#30241c;min-height:44px}
[data-partner-control-room] .ann-dialog input[type=checkbox]{width:22px;min-height:22px;height:22px;margin:3px 0}
[data-partner-control-room] .ann-dialog .ann-check{display:flex;gap:12px;align-items:flex-start}
[data-partner-control-room] .ann-list-tools{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}
[data-partner-control-room] .ann-private,[data-partner-control-room] .ann-proposal{padding:16px;background:#f1eadf;border-radius:12px;margin:16px 0}
[data-partner-control-room] .ann-preferences summary{min-height:44px;padding:12px 0;cursor:pointer}
[data-partner-control-room] .ann-photo{width:150px;height:180px;object-fit:contain;margin:16px 0}
[data-partner-control-room] [data-ann-feedback]:not(:empty){padding:12px;background:#efe4d4;border-radius:10px}
[data-partner-control-room] .ann-dialog :focus-visible{outline:3px solid #8e512e;outline-offset:3px}
@media(max-width:1100px){[data-partner-control-room] .ann-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){[data-partner-control-room] .ann-dialog [data-ann-body]{padding:16px}[data-partner-control-room] .ann-dialog .pcr-dialog-head{padding:12px 16px}[data-partner-control-room] .ann-grid,[data-partner-control-room] .ann-filters{grid-template-columns:minmax(0,1fr)}[data-partner-control-room] .ann-dialog{padding:16px;width:calc(100% - 16px)}[data-partner-control-room] .ann-facts{grid-template-columns:minmax(0,1fr);gap:4px}[data-partner-control-room] .ann-facts dd{margin-bottom:12px}[data-partner-control-room] .ann-card{padding:16px}}
`;
