import copy from "./compcard-library.copy.json" with { type: "json" };
export function renderCompcardLibrary(nonce) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>คลัง Compcard · MMD</title><style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#faf9f7;color:#252323;font:15px/1.6 system-ui,-apple-system,"Noto Sans Thai",sans-serif}button,input,select{font:inherit}button,a,input,select{touch-action:manipulation}button,.button{border:1px solid #ddd5ce;border-radius:12px;background:white;color:#352a23;padding:10px 14px;cursor:pointer;min-height:44px}button:disabled{opacity:.5;cursor:wait}.primary{background:#ffddc2;border-color:#e4b38d;color:#402b1f}a{color:#70432b;text-decoration:none}header,main{max-width:1240px;margin:auto;padding:16px}header{display:flex;align-items:center;gap:14px;border-bottom:1px solid #e5dfd9}h1{font-size:22px;margin:0}h2{font-size:18px;margin:10px 0}p{margin:8px 0}small,.muted{color:#766d66}.spacer{flex:1}.tools,.row,nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tools{margin:14px 0}.tools input{flex:1;min-width:140px}input,select{border:1px solid #d9d1ca;background:white;border-radius:10px;padding:10px;color:#252323;min-height:44px;max-width:100%}nav button[aria-pressed=true]{background:#ffe7d3;border-color:#d2a27b}.notice{padding:12px 14px;border-radius:12px;background:#f1ece6;margin:12px 0}#status{min-height:26px;overflow-wrap:anywhere}#status[data-error=true]{color:#9c3327}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{min-width:0;border:1px solid #e4ddd6;background:white;border-radius:16px;overflow:hidden;display:flex;flex-direction:column}.media{width:100%;aspect-ratio:3/4;object-fit:contain;background:#eeebe7}.placeholder{display:grid;place-items:center;aspect-ratio:3/4;font-size:20px;color:#877d72;background:#eeebe7}.info{padding:12px;overflow-wrap:anywhere;flex:1}.info strong{display:block}.info button{width:100%;margin-top:10px}.badge{display:inline-block;font-size:12px;border:1px solid #e1d7cd;border-radius:30px;padding:2px 9px;margin:5px 0}.source{font-size:12px;color:#766d66}.empty{grid-column:1/-1;padding:30px 18px;text-align:center;border:1px dashed #c9bdb2;border-radius:16px}.folder{display:flex;flex-direction:column;justify-content:center;min-height:130px;background:#fff5eb;padding:16px;align-items:flex-start;text-align:left}.folder span{font-size:28px}.check{display:flex;gap:8px;align-items:center;padding-top:8px}.check input{min-height:22px;width:22px;height:22px}dialog{width:calc(100% - 24px);max-width:840px;border:1px solid #d4c9bf;border-radius:18px;padding:18px;max-height:92dvh;overflow:auto}dialog::backdrop{background:#19120e90}.detail{display:grid;gap:20px}.detail img{width:100%;max-height:64vh;object-fit:contain;background:#eee;border-radius:12px}label.field{display:block;margin:10px 0}label.field input,label.field select{width:100%}.model-option{display:block;margin:6px 0;border:1px solid #ddd2c8;border-radius:10px;padding:10px}.model-option input{min-height:20px}.history{padding:10px;border-bottom:1px solid #e3d9d0}.actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}.actions button{flex:1}#more{display:block;margin:20px auto}#upload{display:none}.hidden,[hidden]{display:none!important}.sourcepath{overflow-wrap:anywhere;font-size:12px}#crumbs{margin:12px 0}.source-toolbar{margin:12px 0}@media(min-width:760px){.grid{grid-template-columns:repeat(4,minmax(0,1fr))}.detail{grid-template-columns:1fr 1fr}header,main{padding:20px}h1{font-size:26px}}@media(prefers-reduced-motion:no-preference){button{transition:background .15s}button:hover{background:#fff0e3}}

.md-panel{margin:16px 0 26px}.md-intro{display:flex;align-items:start;justify-content:space-between;gap:12px;margin-bottom:12px}.md-intro strong{font-size:20px;line-height:1.4}.md-intro p{color:#685d55;font-size:13px;margin:2px 0}.md-helper{white-space:nowrap;font-size:13px;min-height:44px;display:inline-flex;align-items:center}.md-search{border:1px solid #e0d6cc;border-radius:16px;background:#fffaf5;padding:16px}.md-primary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end}.md-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 12px;margin-top:12px;align-items:end}.md-field{display:flex;flex-direction:column;min-width:0;gap:5px}.md-field span,.md-range legend{font-size:12px;font-weight:650;color:#524238}.md-field input,.md-field select{width:100%;min-width:0}.md-range{display:flex;align-items:center;gap:6px;border:0;padding:0;margin:0;min-width:0}.md-range legend{padding:0 0 6px}.md-range input{width:calc(50% - 10px);min-width:0}.md-range span{flex:none;color:#69594e}.md-reset{height:44px}.md-status{font-size:14px;font-weight:600;margin:15px 0 12px;min-height:22px;color:#56493f}.md-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.md-model-card{background:#fff;border:1px solid #ded6cf;border-radius:15px;display:grid;grid-template-columns:90px minmax(0,1fr);gap:13px;padding:12px;min-width:0;align-items:start}.md-portrait{width:90px;aspect-ratio:3/4;background:#f0ece7;display:grid;place-items:center;color:#776b62;font-size:12px;overflow:hidden;border-radius:10px;text-align:center}.md-portrait img{display:block;width:100%;height:100%;object-fit:contain}.md-model-info{min-width:0;overflow-wrap:anywhere}.md-model-info strong{display:block;font-size:18px;line-height:1.35}.md-code,.md-metrics{color:#66594f;font-size:12px;margin:3px 0}.md-tag{display:inline-block;border:1px solid #e5d8cc;border-radius:18px;padding:2px 9px;background:#fff4e9;color:#6d4c38;font-size:11px;margin:6px 5px 8px 0}.md-model-info button{width:100%}.md-empty{grid-column:1/-1;border:1px dashed #c9bdb2;border-radius:14px;padding:26px;text-align:center;color:#675b52}.md-more{display:block;margin:16px auto 0}.md-scope{font-size:12px;line-height:1.55;color:#756960;margin:14px 0}.md-detail{max-width:900px}.md-overline{color:#785d47;font-size:11px;letter-spacing:.12em}.md-detail #mdDetailName{font-size:24px;line-height:1.35}.md-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0}.md-gallery figure{margin:0;overflow:hidden;min-width:0;border:1px solid #e2d8cf;border-radius:12px;background:#f5f2ee}.md-gallery img,.md-gallery video{width:100%;max-height:390px;min-height:130px;object-fit:contain;display:block;background:#ece7e0}.md-gallery figcaption{font-size:12px;color:#6c5d51;padding:8px 9px}.md-detail .actions button{flex:1}.md-error{color:#97362b!important}
@media(max-width:850px){.md-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-width:630px){.md-intro{flex-direction:column}.md-search{padding:12px}.md-primary{grid-template-columns:1fr}.md-primary button{width:100%}.md-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.md-range{grid-column:auto}.md-grid{gap:9px}.md-model-card{grid-template-columns:76px minmax(0,1fr);gap:10px}.md-portrait{width:76px}.md-model-info strong{font-size:16px}.md-detail{padding:12px}.md-gallery{gap:7px}.md-gallery img{min-height:100px}}
@media(max-width:390px){.md-filters{grid-template-columns:1fr 1fr}.md-field:first-child{grid-column:1/-1}.md-reset{grid-column:1/-1}.md-gallery{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body><header><a href="/internal/admin/dashboard">← หลังบ้าน</a><div class="spacer"></div><small>MMD · ภายใน</small></header><main><div class="row"><div><h1>คลัง Compcard</h1><small>ค้นการ์ด · จับคู่โมเดล · เก็บต้นทางและเวอร์ชันเดิม</small></div><div class="spacer"></div><button id="uploadButton" class="primary">อัปโหลดการ์ด</button><input id="upload" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple></div><nav class="tools" aria-label="แหล่งข้อมูล"><button data-tab="models" aria-pressed="true">ค้นหาโมเดล</button><button data-tab="library" aria-pressed="false">คลังของเรา</button><button data-tab="drive" aria-pressed="false">นำเข้าจาก Drive</button><button data-tab="job-board" aria-pressed="false">ไฟล์จาก Job Board</button></nav><form id="search" class="tools"><input id="q" aria-label="ค้นชื่อโมเดลหรือชื่อไฟล์" placeholder="ชื่อโมเดล / ชื่ออื่น / ชื่อไฟล์"><select id="filter" aria-label="สถานะ"><option value="all">ทุกสถานะ</option><option value="unmatched">รอจับคู่</option><option value="linked">จับคู่แล้ว</option><option value="retired">หยุดรับงาน</option><option value="archived">เก็บเข้าประวัติ</option></select><button type="submit">ค้นหา</button></form><section id="mdPanel" class="md-panel" aria-label="ค้นหาโมเดลจากทะเบียน Models">
  <div class="md-intro"><div><strong>ค้นหาโมเดล</strong><p>เลือกจากทะเบียน Models แล้วดูรูปที่เชื่อมอยู่กับโปรไฟล์ได้เลย ไม่ต้องนำเข้าการ์ดก่อน</p></div><a class="md-helper" href="/internal/admin/booking-models">เปิดหน้าจัดการ Model ↗</a></div>
  <form id="mdSearch" class="md-search" role="search">
    <div class="md-primary"><label class="md-field md-wide"><span>ชื่อโมเดล / ชื่อเล่น / รหัส</span><input id="mdQuery" type="search" maxlength="80" autocomplete="off" placeholder="พิมพ์ชื่อหรือรหัสของโมเดล"></label><button class="primary" type="submit">ค้นหาโมเดล</button></div>
    <div class="md-filters">
      <label class="md-field"><span>ประเภทงาน</span><select id="mdAudience"><option value="all">ทุกประเภท</option><option value="private">Private</option><option value="public">Public</option></select></label>
      <label class="md-field"><span>รูปร่าง</span><select id="mdBody"><option value="">ทุกรูปร่าง</option><option value="lean">ลีน</option><option value="athletic">สมส่วนแบบนักกีฬา</option><option value="muscular">มีกล้าม</option><option value="slim">ผอมเพรียว</option><option value="soft">รูปร่างนุ่ม</option></select></label>
      <label class="md-field"><span>สีผิว</span><select id="mdSkin"><option value="">ทุกสีผิว</option><option value="fair">ขาวมาก</option><option value="light">ขาว</option><option value="medium">ผิวกลาง</option><option value="tan">ผิวแทน</option><option value="deep">ผิวเข้ม</option></select></label>
      <fieldset class="md-range"><legend>ส่วนสูง (ซม.)</legend><input id="mdHeightMin" type="number" inputmode="numeric" placeholder="ต่ำสุด" min="100" max="230" step="1" aria-label="ส่วนสูงต่ำสุด"><span>–</span><input id="mdHeightMax" type="number" inputmode="numeric" placeholder="สูงสุด" min="100" max="230" step="1" aria-label="ส่วนสูงสูงสุด"></fieldset>
      <fieldset class="md-range"><legend>น้ำหนัก (กก.)</legend><input id="mdWeightMin" type="number" inputmode="numeric" placeholder="ต่ำสุด" min="30" max="250" step="1" aria-label="น้ำหนักต่ำสุด"><span>–</span><input id="mdWeightMax" type="number" inputmode="numeric" placeholder="สูงสุด" min="30" max="250" step="1" aria-label="น้ำหนักสูงสุด"></fieldset>
      <button id="mdReset" type="button" class="md-reset">ล้างตัวกรอง</button>
    </div>
  </form>
  <p id="mdStatus" class="md-status" role="status" aria-live="polite"></p>
  <div id="mdGrid" class="md-grid" aria-label="ผลค้นหาโมเดล"></div>
  <button id="mdMore" type="button" class="md-more" hidden>โหลดรายชื่อเพิ่ม</button>
  <p class="md-scope">สำหรับเปอร์และแอดมิน · รูปทุกสถานะเป็นภาพตรวจภายใน ไม่ใช่สิทธิ์เผยแพร่ให้ลูกค้าหรือ Partner</p>
</section><div id="sourceNote" class="notice" hidden></div><div id="crumbs" class="row"></div><div id="importTools" class="row source-toolbar" hidden><button id="importSelected" class="primary">นำเข้าที่เลือก</button><small>เก็บสำเนาต้นฉบับไว้ในคลังส่วนตัว</small></div><p id="status" role="status" aria-live="polite"></p><section id="grid" class="grid" aria-label="รายการ Compcard"></section><button id="more" hidden>โหลดเพิ่ม</button></main><dialog id="mdDetail" class="md-detail" aria-labelledby="mdDetailName">
  <div class="row"><div><small class="md-overline">MODEL · INTERNAL PROFILE</small><h2 id="mdDetailName"></h2></div><div class="spacer"></div><button id="mdClose" type="button">ปิด</button></div>
  <p id="mdDetailMetrics" class="muted"></p>
  <p id="mdDetailStatus" class="notice" role="status"></p>
  <div id="mdGallery" class="md-gallery" aria-label="รูปโมเดลจาก R2 และ Drive"></div>
  <div class="actions"><button id="mdToLibrary" class="primary" type="button">ค้น Compcard ที่เก็บไว้</button><button id="mdToDrive" type="button">เปิดโฟลเดอร์ Drive</button></div>
  <p class="md-scope">ภาพนี้ใช้ตรวจในหลังบ้านเท่านั้น การแชร์ให้ Pero ต้องเลือกผ่านหน้าคัดเฉพาะงานอีกครั้ง</p>
</dialog><dialog id="editor" aria-labelledby="editorTitle"><div class="row"><h2 id="editorTitle">รายละเอียด Compcard</h2><div class="spacer"></div><button id="closeEditor" aria-label="ปิดรายละเอียด">ปิด</button></div><div id="detail"></div></dialog><script nonce="${nonce}">(()=>{const __name=(target,value)=>{Object.defineProperty(target,"name",{value,configurable:true});return target;};(${compcardClient.toString()})(${JSON.stringify(copy).replace(/</g,"\\u003c")});})();</script></body></html>`;
}

function compcardClient(copy) {
  const API='/v1/admin/compcards', $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels=copy.status;
  const errors=copy.errors;
  let tab='models',cursor=null,folder='',rows=[],stack=[],busy=false,pendingSearch=false,selected=new Set(),active=null,modelId='',models=[],viewSequence=0;
  const say=(s,bad=false)=>{$('status').textContent=s;$('status').dataset.error=String(bad);};
  async function api(path,options={}){const r=await fetch(API+path,{credentials:'same-origin',cache:'no-store',...options});let d;try{d=await r.json();}catch{throw Error('อ่านคำตอบไม่ได้ กรุณาลองใหม่');}if(!r.ok||!d.ok)throw Error(errors[d.error]||'ยังทำรายการไม่ได้ กรุณาลองใหม่');return d;}
  const send=(path,body,method='POST')=>api(path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});

  const mdCopy=copy.model_directory, mdNode=(tag,value,cls)=>{const node=document.createElement(tag);if(value!==undefined&&value!==null)node.textContent=String(value);if(cls)node.className=cls;return node;};
  let mdRows=[],mdCursor=null,mdSeq=0,mdController=null,mdGalleryController=null,mdGallerySeq=0,mdActive=null;
  const mdValidId=id=>/^rec[A-Za-z0-9]{14}$/.test(id||'');
  const mdValidAsset=id=>/^(?:(?:rec|att)[A-Za-z0-9]+|legacy)$/.test(id||'');
  const mdBase=id=>'/v1/admin/booking-models/'+encodeURIComponent(id);
  const mdStatus=(message,error=false)=>{$('mdStatus').textContent=message;$('mdStatus').classList.toggle('md-error',error);};
  function mdImage(url,alt){
    const img=mdNode('img');img.alt=alt||mdCopy.untitled;img.loading='lazy';img.referrerPolicy='no-referrer';img.decoding='async';img.src=url;
    img.addEventListener('error',()=>img.replaceWith(mdNode('span',mdCopy.imageUnavailable,'md-no-image')),{once:true});
    return img;
  }
  function mdDraw(){
    const grid=$('mdGrid');grid.replaceChildren();
    if(!mdRows.length){
      const msg=mdCursor?mdCopy.morePages:mdCopy.noModels;
      grid.append(mdNode('p',msg,'md-empty'));
    }
    for(const model of mdRows){
      if(!mdValidId(model.model_id))continue;
      const article=mdNode('article',null,'md-model-card'),cover=mdNode('div',null,'md-portrait'),info=mdNode('div',null,'md-model-info');
      const asset=model.cover_asset_id;
      if(mdValidAsset(asset))cover.append(mdImage(mdBase(model.model_id)+'/media/'+encodeURIComponent(asset),model.name));
      else if(model.drive_linked)cover.append(mdImage(mdBase(model.model_id)+'/drive-cover',model.name));
      else cover.append(mdNode('span',mdCopy.noImage));
      info.append(mdNode('strong',model.name||mdCopy.untitled));
      if(model.code&&!String(model.code).startsWith('drive:'))info.append(mdNode('p',model.code,'md-code'));
      info.append(mdNode('p',[model.height_cm?model.height_cm+' ซม.':'— ซม.',model.weight_kg?model.weight_kg+' กก.':'— กก.',mdCopy.bodies[model.body_type]||'',mdCopy.skins[model.skin_tone]||''].filter(Boolean).join(' · '),'md-metrics'));
      info.append(mdNode('span',model.offers_private?'Private':model.offers_public?'Public':mdCopy.needsReview,'md-tag'));
      if(model.drive_linked)info.append(mdNode('span',mdCopy.driveLinked,'md-tag'));
      const button=mdNode('button',mdCopy.openPhotos,'primary');button.type='button';button.addEventListener('click',()=>mdOpenDetail(model));
      info.append(button);article.append(cover,info);grid.append(article);
    }
    $('mdMore').hidden=!mdCursor||tab!=='models';
    mdStatus(mdCopy.showing.replace('{count}',String(mdRows.length))+(mdCursor?' · '+mdCopy.moreAvailable:''));
  }
  async function mdLoad(more=false) {
    if(tab!=='models')return;
    const seq=++mdSeq;
    if(mdController)mdController.abort();
    mdController=new AbortController();
    if(!more){mdRows=[];mdCursor=null;$('mdGrid').replaceChildren();}
    $('mdMore').disabled=true;
    mdStatus(mdCopy.loading);
    const params=new URLSearchParams({q:$('mdQuery').value.trim(),audience:$('mdAudience').value,attention:'all'});
    for(const [id,key] of [['mdHeightMin','height_min'],['mdHeightMax','height_max'],['mdWeightMin','weight_min'],['mdWeightMax','weight_max'],['mdBody','body'],['mdSkin','skin']]){
      const value=$(id).value.trim();if(value)params.set(key,value);
    }
    if(more&&mdCursor)params.set('cursor',mdCursor);
    try{
      if(!$('mdSearch').reportValidity())throw Error(mdCopy.invalidFilters);
      const response=await fetch('/v1/admin/booking-models?'+params,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'},signal:mdController.signal});
      const data=await response.json().catch(()=>null);
      if(seq!==mdSeq||tab!=='models')return;
      if(!response.ok||data?.ok!==true||!Array.isArray(data.items))throw Error(response.status===401?mdCopy.login:response.status===403?mdCopy.forbidden:data?.error==='invalid_search'?mdCopy.invalidFilters:mdCopy.failed);
      const old=new Set(more?mdRows.map(x=>x.model_id):[]);
      const incoming=data.items.filter(model=>mdValidId(model.model_id)&&!old.has(model.model_id));
      if(more)mdRows.push(...incoming);else mdRows=incoming;
      mdCursor=typeof data.next_cursor==='string'?data.next_cursor:null;
      mdDraw();
      if(data.media_status==='unavailable')mdStatus(mdCopy.partialMedia,true);
    }catch(error){
      if(seq===mdSeq&&tab==='models'&&error.name!=='AbortError')mdStatus(error.message||mdCopy.failed,true);
    }finally{
      if(seq===mdSeq){mdController=null;$('mdMore').disabled=false;}
    }
  }
  function mdAddPhoto(model,asset,source){
    const id=source==='drive'?asset.file_id:asset.asset_record_id;
    if(source==='drive'? !/^[A-Za-z0-9_-]{10,180}$/.test(id||'') : !mdValidAsset(id))return;
    if(!['photo','clip'].includes(asset.kind))return;
    const url=mdBase(model.model_id)+'/'+(source==='drive'?'drive/':'media/')+encodeURIComponent(id);
    const figure=mdNode('figure'),kind=asset.kind,media=kind==='clip'?mdNode('video'):mdImage(url,model.name);
    if(kind==='clip'){media.controls=true;media.preload='none';media.playsInline=true;media.src=url;}
    figure.append(media,mdNode('figcaption',(source==='drive'?mdCopy.driveSource:mdCopy.r2Source)+' · '+(asset.status||mdCopy.unknownStatus)));
    $('mdGallery').append(figure);
  }
  async function mdOpenDetail(model){
    if(!mdValidId(model?.model_id))return;
    if(mdGalleryController)mdGalleryController.abort();
    mdGalleryController=null;
    const seq=++mdGallerySeq;mdActive=model;
    $('mdDetailName').textContent=model.name||mdCopy.untitled;
    $('mdDetailMetrics').textContent=[model.code&&!String(model.code).startsWith('drive:')?model.code:'',model.height_cm?model.height_cm+' ซม.':'',model.weight_kg?model.weight_kg+' กก.':'',mdCopy.bodies[model.body_type]||'',mdCopy.skins[model.skin_tone]||''].filter(Boolean).join(' · ');
    $('mdGallery').replaceChildren();$('mdDetailStatus').textContent=mdCopy.loadingPhotos;
    for(const item of (model.media||[]).slice(0,100))if(item.preview_available&&mdValidAsset(item.asset_record_id))mdAddPhoto(model,item,'media');
    if(!$('mdGallery').childElementCount)$('mdGallery').append(mdNode('p',model.drive_linked?mdCopy.drivePending:mdCopy.noImage,'md-empty'));
    if(!$('mdDetail').open)$('mdDetail').showModal();
    if(!model.drive_linked){$('mdDetailStatus').textContent=mdCopy.r2Source;return;}
    mdGalleryController=new AbortController();
    try{
      const response=await fetch(mdBase(model.model_id)+'/drive',{credentials:'same-origin',cache:'no-store',signal:mdGalleryController.signal});
      const data=await response.json().catch(()=>null);
      if(seq!==mdGallerySeq||!$('mdDetail').open)return;
      if(!response.ok||data?.ok!==true||!Array.isArray(data.items))throw Error(response.status===409?mdCopy.driveConflict:mdCopy.driveFailed);
      const already=new Set((model.media||[]).map(x=>x.source_file_id).filter(Boolean));
      for(const item of data.items.slice(0,100)){
        if(already.has(item.file_id))continue;
        mdAddPhoto(model,item,'drive');
      }
      $('mdDetailStatus').textContent=data.partial?mdCopy.drivePartial:data.items.length?mdCopy.galleryReady:mdCopy.noDrive;
    }catch(error){
      if(seq===mdGallerySeq&&error.name!=='AbortError')$('mdDetailStatus').textContent=error.message||mdCopy.driveFailed;
    }finally{if(seq===mdGallerySeq)mdGalleryController=null;}
  }
  $('mdSearch').addEventListener('submit',event=>{event.preventDefault();mdLoad();});
  $('mdMore').addEventListener('click',()=>{if(mdCursor)mdLoad(true);});
  $('mdReset').addEventListener('click',()=>{$('mdSearch').reset();mdLoad();});
  $('mdClose').addEventListener('click',()=>{$('mdDetail').close();});
  $('mdDetail').addEventListener('close',()=>{++mdGallerySeq;if(mdGalleryController)mdGalleryController.abort();mdGalleryController=null;mdActive=null;$('mdGallery').replaceChildren();});
  $('mdToLibrary').addEventListener('click',()=>{if(!mdActive)return;const name=mdActive.name;$('mdDetail').close();$('q').value=name||'';setTab('library');});
  $('mdToDrive').addEventListener('click',()=>{$('mdDetail').close();setTab('drive');});

  function cardMedia(url,mime){return url&&String(mime).startsWith('image/')?'<img class="media" loading="lazy" src="'+esc(url)+'" alt="Compcard">':'<div class="placeholder">'+(mime==='application/pdf'?'PDF':'Compcard')+'</div>';}
  function draw(){
    $('grid').innerHTML=rows.length?rows.map((r,i)=>{
      if(r.folder)return '<button class="card folder" data-folder="'+esc(r.id)+'"><span aria-hidden="true">▱</span>'+esc(r.name)+'</button>';
      const lib=tab==='library',url=lib?r.preview_url:tab==='drive'?API+'/drive/file?file_id='+encodeURIComponent(r.id):r.preview_url;
      const h=r.height_cm??r.model_snapshot?.height_cm,w=r.weight_kg??r.model_snapshot?.weight_kg;
      const stats=h||w?esc(h||'—')+' cm · '+esc(w||'—')+' kg':'ยังไม่มีส่วนสูง–น้ำหนัก';
      return '<article class="card">'+cardMedia(url,r.content_type)+'<div class="info"><strong>'+esc(r.model_name||r.name)+'</strong><small>'+stats+'</small><div class="source">'+esc([copy.worlds[r.world]||'',...(r.work_types||[]).map(t=>copy.work_types[t]||t)].filter(Boolean).join(' · '))+'</div>'+(lib?'<div><span class="badge">'+esc(labels[r.status]||r.status)+'</span></div><div class="source">'+esc(r.original_name)+'</div><button data-open="'+i+'">ดู / แก้ข้อมูล</button>':'<div class="source">'+esc(tab==='job-board'?r.job_id+' · ภาพ '+r.slot:r.updated_at?new Date(r.updated_at).toLocaleDateString('th-TH'):'')+'</div><label class="check"><input type="checkbox" data-pick="'+i+'" '+(selected.has(i)?'checked':'')+'> เลือกนำเข้า</label>')+'</div></article>';
    }).join(''):'<div class="empty">'+(tab==='library'?'ยังไม่มีการ์ดที่ตรงกับคำค้น<br>เพิ่มการ์ดจาก Drive, Job Board หรืออัปโหลดได้เลย':'ยังไม่มีรายการในหน้านี้')+'</div>';
    $('more').hidden=tab==='models'||!cursor;
    $('crumbs').innerHTML=tab==='drive'?'<button data-root>โฟลเดอร์หลัก</button>'+(stack.length?'<button data-back>ย้อนกลับ</button>':'')+(folder?'<small class="sourcepath">'+esc(folder)+'</small>':''):'';
  }
  async function load(append=false){
    if(tab==='models')return mdLoad(append);
    if(busy){if(!append)pendingSearch=true;return;}busy=true;const sequence=++viewSequence;say('กำลังโหลด…');$('more').disabled=true;
    if(!append){rows=[];selected.clear();draw();}
    try{
      const p=new URLSearchParams();if(append&&cursor)p.set('cursor',cursor);
      if(tab==='library'){p.set('q',$('q').value);p.set('status',$('filter').value);p.set('world',$('worldFilter').value);p.set('work_type',$('workTypeFilter').value);}
      if(tab==='drive'&&folder)p.set('folder_id',folder);
      const d=await api((tab==='library'?'':tab==='drive'?'/drive':'/job-board')+'?'+p);
      if(sequence!==viewSequence)return;
      const next=tab==='library'?d.items:tab==='drive'&&!folder?d.roots.map(r=>({...r,folder:true})):d.files;
      if(append)rows.push(...next);else{rows=next;selected.clear();}
      cursor=d.next_cursor||null;draw();
      if(d.path)$('crumbs').insertAdjacentHTML('beforeend','<small class="sourcepath">'+esc(d.path)+'</small>');
      say('แสดง '+rows.length+' รายการ'+(cursor?' · ยังมีรายการให้โหลดต่อ':''));
    }catch(e){say(e.message,true);}finally{busy=false;$('more').disabled=false;if(pendingSearch){pendingSearch=false;load();}}
  }
  function setTab(value){if(busy)return;tab=value;cursor=null;rows=[];selected.clear();folder='';stack=[];
    document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));
    $('search').hidden=tab!=='library';$('mdPanel').hidden=tab!=='models';$('grid').hidden=tab==='models';$('importTools').hidden=tab==='library'||tab==='models';$('sourceNote').hidden=tab==='library'||tab==='models';
    $('selectAll').hidden=tab!=='drive';
    if(tab!=='models'&&mdController){++mdSeq;mdController.abort();mdController=null;}
    $('sourceNote').textContent=tab==='drive'?'เปิดโฟลเดอร์แล้วเลือก compcard ที่ต้องการนำเข้า ไฟล์ต้นทางและชื่อเดิมจะถูกเก็บไว้':tab==='job-board'?'ไฟล์แนบใบสมัครที่ส่งแล้ว · เลือกเฉพาะภาพที่เป็น compcard รายชื่อโมเดลจะจับคู่หลังตรวจสอบ':'';draw();load();
  }
  $('search').addEventListener('submit',e=>{e.preventDefault();load();});$('more').onclick=()=>load(true);
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  $('crumbs').onclick=e=>{if(busy)return;if(e.target.closest('[data-root]')){folder='';stack=[];load();}else if(e.target.closest('[data-back]')){folder=stack.pop()||'';load();}};
  $('grid').onclick=e=>{const f=e.target.closest('[data-folder]');if(f&&!busy){stack.push(folder);folder=f.dataset.folder;load();}const open=e.target.closest('[data-open]');if(open)edit(rows[Number(open.dataset.open)].id);};
  $('grid').onchange=e=>{if(e.target.matches('[data-pick]')){const i=Number(e.target.dataset.pick);if(e.target.checked)selected.add(i);else selected.delete(i);}};
  $('importSelected').insertAdjacentHTML('beforebegin','<button type="button" id="selectAll" hidden>เลือก / ยกเลิกการ์ดที่แสดงทั้งหมด</button>');
  $('selectAll').onclick=()=>{if(busy)return;const ids=rows.map((r,i)=>r.folder?null:i).filter(i=>i!==null);if(ids.every(i=>selected.has(i)))selected.clear();else ids.forEach(i=>selected.add(i));draw();};
  $('importSelected').onclick=async()=>{
    if(busy)return;if(!selected.size)return say('เลือก compcard ก่อนค่ะ',true);busy=true;$('importSelected').disabled=true;let done=0,dupes=0;
    try{for(const i of [...selected]){const r=rows[i];say('กำลังนำเข้า '+(done+1)+' / '+selected.size);const d=await send('/import',tab==='drive'?{provider:'google_drive',file_id:r.id}:{provider:'job_board',job_id:r.job_id,application_ref:r.application_ref,slot:r.slot});done++;if(d.duplicate)dupes++;}say('นำเข้าสำเร็จ '+done+' รายการ'+(dupes?' · มีอยู่แล้ว '+dupes+' รายการ':''));selected.clear();draw();}
    catch(e){say('นำเข้าแล้ว '+done+' รายการ · '+e.message,true);}finally{busy=false;$('importSelected').disabled=false;}
  };
  $('uploadButton').onclick=()=>{if(!busy)$('upload').click();};
  $('upload').onchange=async()=>{if(busy)return;busy=true;let done=0;
    try{for(const f of $('upload').files){if(f.size>15*1024*1024)throw Error(errors.file_too_large);say('กำลังอัปโหลด '+f.name);await api('/upload',{method:'POST',headers:{'content-type':f.type||({'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp','pdf':'application/pdf'}[f.name.split('.').pop().toLowerCase()]||'application/octet-stream'),'x-compcard-filename':encodeURIComponent(f.name)},body:f});done++;}say('อัปโหลดแล้ว '+done+' รายการ');}
    catch(e){say('อัปโหลดแล้ว '+done+' รายการ · '+e.message,true);}finally{busy=false;$('upload').value='';if(done&&tab==='library')load();}
  };
  $('closeEditor').onclick=()=>{$('editor').close();active=null;};
  $('editor').addEventListener('close',()=>{active=null;});
  async function edit(id){try{const d=await api('/'+id);active=d.item;modelId=active.model_id||'';models=[];renderDetail();if(!$('editor').open)$('editor').showModal();}catch(e){say(e.message,true);}}
  function renderDetail(){const r=active;$('detail').innerHTML='<div class="detail"><div>'+cardMedia(r.preview_url,r.content_type)+'<p><a href="'+esc(r.file_url)+'" target="_blank" rel="noopener">เปิดไฟล์ต้นฉบับ ↗</a></p><small class="sourcepath">'+esc(r.source.path||r.source.provider)+'<br>'+esc(r.original_name)+'</small><p class="muted">รุ่นข้อมูล '+r.revision+' · '+esc(new Date(r.updated_at).toLocaleString('th-TH'))+'</p><button id="historyButton">ประวัติการแก้ข้อมูล</button><div id="history"></div></div><form id="editForm"><label class="field">ชื่อบนการ์ด<input name="name" maxlength="200" value="'+esc(r.name)+'" required></label><label class="field">ชื่ออื่น (คั่นด้วยจุลภาค)<input name="aliases" value="'+esc(r.aliases.join(', '))+'"></label><div class="row"><label class="field">ส่วนสูงบนการ์ด (cm)<input name="height_cm" type="number" min="100" max="230" step="any" value="'+esc(r.height_cm??'')+'"></label><label class="field">น้ำหนักบนการ์ด (kg)<input name="weight_kg" type="number" min="30" max="250" step="any" value="'+esc(r.weight_kg??'')+'"></label></div><small>ตัวเลขจาก: '+esc(r.metrics_source||'ยังไม่ได้กรอก')+'</small><label class="field">สถานะ<select name="status">'+Object.entries(labels).map(([k,v])=>'<option value="'+k+'" '+(k===r.status?'selected':'')+'>'+v+'</option>').join('')+'</select></label><p>โมเดลที่เชื่อม: <strong id="linkedName">'+esc(r.model_name||'ยังไม่จับคู่')+'</strong></p><div class="row"><input id="modelQuery" aria-label="ค้นโมเดลใน Airtable" placeholder="ค้นชื่อใน Airtable" value="'+esc(r.name)+'"><button type="button" id="findModel">ค้นโมเดล</button></div><div id="modelResults"></div><button type="button" id="unlink">ยกเลิกการจับคู่</button><p id="editStatus" role="status"></p><div class="actions"><button type="submit" class="primary" id="save">บันทึก</button></div></form></div>';
    $('editForm').insertAdjacentHTML('afterbegin','<label class="field">ฝั่งของ Compcard<select name="world">'+Object.entries(copy.worlds).map(([k,v])=>'<option value="'+k+'" '+((r.world||'unknown')===k?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label><fieldset><legend>หมวดงาน (เลือกได้มากกว่าหนึ่ง)</legend>'+Object.entries(copy.work_types).map(([k,v])=>'<label class="check"><input type="checkbox" name="work_types" value="'+k+'" '+((r.work_types||[]).includes(k)?'checked':'')+'> '+esc(v)+'</label>').join('')+'</fieldset>');
    if(r.source.provider==='google_drive'&&r.source.file_id)$('historyButton').insertAdjacentHTML('beforebegin','<p><a target="_blank" rel="noopener" href="https://drive.google.com/file/d/'+encodeURIComponent(r.source.file_id)+'/view">เปิดต้นทางใน Drive ↗</a></p>');
    if(r.model_snapshot)$('linkedName').insertAdjacentHTML('afterend','<small class="muted"> · โปรไฟล์ '+esc(r.model_snapshot.status||'ไม่ระบุสถานะ')+' ณ '+esc(new Date(r.model_snapshot.snapshot_at).toLocaleDateString('th-TH'))+'</small>');
    $('historyButton').insertAdjacentHTML('afterend',' <button id="versionsButton" type="button">การ์ดจากต้นทางเดียวกัน</button><div id="versions"></div>');
    let versionCursor=null;
    async function versions(append=false){const current=active.id;try{const d=await api('?source_ref='+encodeURIComponent(active.source.ref)+(append&&versionCursor?'&cursor='+encodeURIComponent(versionCursor):''));if(active?.id!==current)return;const html=d.items.map(x=>'<button type="button" data-version="'+x.id+'">'+esc(x.name)+' · '+esc(new Date(x.created_at).toLocaleString('th-TH'))+'</button>').join('');if(append)$('versions').insertAdjacentHTML('beforeend',html);else $('versions').innerHTML=html;versionCursor=d.next_cursor;$('versionsButton').textContent=versionCursor?'ดูการ์ดจากต้นทางนี้เพิ่ม':'การ์ดจากต้นทางเดียวกัน';}catch(e){if($('versions'))$('versions').textContent=e.message;}}
    $('versionsButton').onclick=()=>versions(Boolean(versionCursor));$('versions').onclick=e=>{const b=e.target.closest('[data-version]');if(b)edit(b.dataset.version);};
    $('findModel').onclick=async()=>{const current=active.id;try{const d=await api('/models?q='+encodeURIComponent($('modelQuery').value));if(active?.id!==current)return;models=d.items;$('modelResults').innerHTML=models.length?models.map((m,i)=>'<label class="model-option"><input type="radio" name="modelPick" value="'+i+'"> '+esc(m.name)+' · '+esc(m.code)+'<br><small>'+esc([m.status,m.height_cm?m.height_cm+' cm':'',m.weight_kg?m.weight_kg+' kg':'',m.work_format].filter(Boolean).join(' · '))+'</small></label>').join(''):'<small>ไม่พบชื่อ · เก็บการ์ดไว้รอจับคู่ได้</small>';}catch(e){if($('editStatus'))$('editStatus').textContent=e.message;}};
    $('modelResults').onchange=e=>{const m=models[Number(e.target.value)];if(!m)return;modelId=m.id;$('linkedName').textContent=m.name;$('editForm').elements.status.value='linked';};
    $('unlink').onclick=()=>{modelId='';$('linkedName').textContent='ยังไม่จับคู่';$('editForm').elements.status.value='unmatched';$('modelResults').innerHTML='';};
    $('editForm').onsubmit=async e=>{e.preventDefault();const item=active,form=e.target,input=Object.fromEntries(new FormData(form));input.work_types=[...form.querySelectorAll('[name=work_types]:checked')].map(x=>x.value);input.etag=item.etag;input.aliases=input.aliases.split(',').map(v=>v.trim()).filter(Boolean);if(modelId!==item.model_id)input.model_id=modelId;$('save').disabled=true;
      try{const d=await send('/'+item.id,input,'PATCH');if(active?.id!==item.id)return;active=d.item;rows=rows.map(x=>x.id===active.id?active:x);draw();$('editStatus').textContent='บันทึกแล้ว';active=d.item;renderDetail();$('editStatus').textContent='บันทึกแล้ว';}catch(e){$('editStatus').textContent=e.message;}finally{if($('save'))$('save').disabled=false;}
    };
    $('historyButton').onclick=async()=>{const current=active.id;try{const d=await api('/'+current+'/history');if(active?.id!==current)return;$('history').innerHTML=d.items.length?d.items.sort((a,b)=>b.revision-a.revision).map(h=>'<div class="history"><strong>รุ่น '+h.revision+'</strong> · '+esc(h.name)+'<br><small>'+esc(h.model_name||'ยังไม่จับคู่')+' · '+esc(new Date(h.updated_at).toLocaleString('th-TH'))+'</small></div>').join(''):'<small>ยังไม่มีการแก้ข้อมูล</small>';if(d.next_cursor)$('history').insertAdjacentHTML('beforeend','<small>แสดงประวัติ 50 รุ่นแรก</small>');}catch(e){$('history').textContent=e.message;}};
  }
  $('filter').insertAdjacentHTML('afterend','<select id="worldFilter" aria-label="ฝั่งของ Compcard"><option value="all">Public / Private ทั้งหมด</option>'+Object.entries(copy.worlds).map(([k,v])=>'<option value="'+k+'">'+esc(v)+'</option>').join('')+'</select><select id="workTypeFilter" aria-label="หมวดงาน"><option value="all">ทุกหมวดงาน</option>'+Object.entries(copy.work_types).map(([k,v])=>'<option value="'+k+'">'+esc(v)+'</option>').join('')+'</select>');
  setTab('models');
}
