(()=>{'use strict';
if(location.pathname.replace(/\/+$/,'')!=='/internal/admin/jobs/create-job')return;
const boot=()=>{
  const root=document.getElementById('mmd-cj-split-v1');
  if(!root||root.dataset.modelSearchFix==='v5')return;
  root.dataset.modelSearchFix='v5';
  const panel=root.querySelector('[data-cj-panel="model"]');
  const search=root.querySelector('[data-cj="modelSearch"]');
  const query=root.querySelector('[data-cj="modelQuery"]');
  if(!panel||!search)return;
  let status=panel.querySelector('[data-cj-model-status]');
  if(!status){
    status=document.createElement('div');
    status.dataset.cjModelStatus='1';
    status.className='mmd-cj__modelStatus';
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    panel.querySelector('.mmd-cj__search')?.insertAdjacentElement('afterend',status);
  }
  const show=(text,tone='')=>{
    status.textContent=text;
    status.dataset.tone=tone;
    status.hidden=!text;
  };
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    let url;
    try{url=new URL(input instanceof Request?input.url:String(input),location.href)}catch{return nativeFetch(input,init)}
    if(url.pathname!=='/v1/admin/models/search')return nativeFetch(input,init);
    const services=(url.searchParams.get('service_options')||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    for(const key of ['mk','burn','kiss','live'])if(services.includes(key))url.searchParams.set(key,'1');
    const q=(url.searchParams.get('q')||'').trim();
    show(q?`กำลังค้นหา “${q}”…`:'กำลังค้นหานายแบบ…','loading');
    search.disabled=true;
    const next=input instanceof Request?new Request(url.toString(),input):url.toString();
    try{
      const res=await nativeFetch(next,init);
      let data={};
      try{data=await res.clone().json()}catch{}
      const items=Array.isArray(data.items)?data.items:Array.isArray(data.models)?data.models:Array.isArray(data.records)?data.records:[];
      if(!res.ok||data.ok===false){
        show(`ค้นหานายแบบไม่สำเร็จ · ${data.error||data.message||`HTTP ${res.status}`}`,'bad');
      }else if(items.length){
        show(`พบ ${items.length} นายแบบ${q?` สำหรับ “${q}”`:''} · เลือกการ์ดด้านล่างได้เลย`,'ok');
      }else{
        show(`ไม่พบ${q?` “${q}”`:'นายแบบ'} ในกลุ่ม/ประเภทที่เลือก · ตรวจชื่อหรือ scope แล้วค้นหาใหม่`,'warn');
      }
      return res;
    }catch(err){
      show(`ค้นหานายแบบไม่สำเร็จ · ${err?.message||err}`,'bad');
      throw err;
    }finally{
      search.disabled=false;
    }
  };
  search.addEventListener('click',()=>show((query?.value||'').trim()?`กำลังค้นหา “${(query.value||'').trim()}”…`:'กำลังค้นหานายแบบ…','loading'),true);
  if(!document.getElementById('mmd-create-job-model-search-v5-css')){
    const s=document.createElement('style');
    s.id='mmd-create-job-model-search-v5-css';
    s.textContent='#mmd-cj-split-v1 .mmd-cj__modelStatus{margin:10px 0 2px;padding:10px 12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;font-size:12px;line-height:1.5;color:var(--meta)}#mmd-cj-split-v1 .mmd-cj__modelStatus[data-tone="ok"]{border-color:rgba(119,190,132,.45)}#mmd-cj-split-v1 .mmd-cj__modelStatus[data-tone="bad"]{border-color:rgba(230,108,108,.55)}#mmd-cj-split-v1 .mmd-cj__modelStatus[data-tone="warn"]{border-color:rgba(239,214,149,.45)}';
    document.head.appendChild(s);
  }
};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();