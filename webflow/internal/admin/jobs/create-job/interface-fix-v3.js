(()=>{'use strict';
if(location.pathname.replace(/\/+$/,'')!=='/internal/admin/jobs/create-job')return;
const root=document.getElementById('mmd-cj-split-v1');
if(!root||root.dataset.interfaceFix==='v3')return;
root.dataset.interfaceFix='v3';
const by=k=>root.querySelector(`[data-cj="${k}"]`);
function removeLegacyCards(){
  const scope=root.parentElement||root;
  scope.querySelectorAll('div,section,aside').forEach(el=>{
    if(el===root)return;
    const t=(el.textContent||'').replace(/\s+/g,' ').trim();
    if(t.length<220&&t.includes('อัปเดตล่าสุด')&&(t.includes('SMOKE PASS')||t.includes('CAL SCHEDULING')||t.includes('SHADOW')))el.remove();
  });
}
function translate(){
  const n=by('notice');
  if(n){
    let t=(n.textContent||'').trim();
    const map=[
      ['หน้า Split Page พร้อมใช้งานแล้ว','ระบบพร้อม'],
      ['กำลังโหลด Recent clients…','กำลังโหลดลูกค้าล่าสุด…'],
      ['พร้อมเริ่ม Create Job ใหม่','พร้อมสร้างงานใหม่'],
      ['เลือก Public Draft แล้ว — Private ต้องทำ Client Intake ก่อน','ข้อมูลลูกค้านี้ยังไม่เชื่อมครบ · ไป Customer 360 ก่อน'],
      ['เลือกลูกค้าแล้ว ต่อด้วย Job Scope','เลือกลูกค้าแล้ว · ต่อด้วยประเภทงาน'],
      ['เลือก World แล้ว ต่อด้วย Folder และ Lane','เลือกประเภทงานแล้ว · ต่อด้วยกลุ่มและประเภทนายแบบ'],
      ['กำลังค้น Model ตาม scope…','กำลังค้นหานายแบบ…'],
      ['Model search ไม่สำเร็จ:','ค้นหานายแบบไม่สำเร็จ:'],
      ['Client lookup ไม่สำเร็จ:','ค้นหาลูกค้าไม่สำเร็จ:'],
      ['กำลังสร้าง Job…','กำลังสร้างงาน…'],
      ['สร้าง Job แล้ว — Copy Model confirmation ไปส่งให้โมเดล','สร้างงานแล้ว · ส่ง Customer Payment Link ก่อน · Member + Model URLs จะออกหลัง Official Verify ทาง Telegram'],
      ['สร้าง Job ไม่สำเร็จ:','สร้างงานไม่สำเร็จ:']
    ];
    map.forEach(([a,b])=>{t=t.split(a).join(b)});
    if(n.textContent!==t)n.textContent=t;
  }
  const a=by('auth');
  if(a){
    const t=(a.textContent||'').trim();
    if(/ready$/i.test(t))a.textContent='ระบบพร้อม';
    else if(/login required/i.test(t))a.textContent='เข้าสู่ระบบ';
    else if(/checking/i.test(t))a.textContent='กำลังตรวจสิทธิ์';
  }
}
function progressive(){
  const client=by('clientSelected'),model=by('modelSelected'),folder=by('folder'),gender=by('gender'),date=by('date'),start=by('start'),locationField=by('location'),price=by('price');
  const hasClient=!!(client&&!client.hidden);
  const world=!!root.querySelector('[data-cj-world].is-selected');
  const scopeReady=hasClient&&world&&!!(folder&&folder.value)&&!!(gender&&gender.value);
  const hasModel=!!(model&&!model.hidden);
  const detailsStarted=hasModel&&!!((date&&date.value)||(start&&start.value)||(locationField&&locationField.value)||(price&&Number(price.value)>0));
  const panels={scope:!hasClient,model:!scopeReady,details:!hasModel,review:!detailsStarted};
  Object.entries(panels).forEach(([name,collapsed])=>{
    const p=root.querySelector(`[data-cj-panel="${name}"]`);
    if(p)p.classList.toggle('is-collapsed',collapsed);
  });
}
let queued=false;
function run(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;removeLegacyCards();translate();progressive()});
}
new MutationObserver(run).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
root.addEventListener('input',run,true);
root.addEventListener('change',run,true);
removeLegacyCards();translate();progressive();
})();
