(()=>{'use strict';
if(location.pathname.replace(/\/+$/,'')!=='/internal/admin/jobs/create-job')return;
const boot=()=>{
  const root=document.getElementById('mmd-cj-split-v1');
  if(!root||root.dataset.modelSearchFix==='v6')return;
  root.dataset.modelSearchFix='v6';
  const panel=root.querySelector('[data-cj-panel="model"]');
  const search=root.querySelector('[data-cj="modelSearch"]');
  const query=root.querySelector('[data-cj="modelQuery"]');
  const folder=root.querySelector('[data-cj="folder"]');
  const gender=root.querySelector('[data-cj="gender"]');
  const privateWork=root.querySelector('[data-cj="privateWork"]');
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

  const scopeText=()=>[
    folder?.selectedOptions?.[0]?.textContent,
    gender?.selectedOptions?.[0]?.textContent,
    privateWork&&!privateWork.closest('[hidden]')?privateWork.selectedOptions?.[0]?.textContent:'',
  ].filter(Boolean).join(' · ');

  const errorInfo=data=>{
    const raw=data?.error;
    let code='';
    let message='';
    if(typeof raw==='string')message=raw;
    else if(raw&&typeof raw==='object'){
      code=String(raw.code||raw.error_code||'');
      message=String(raw.message||raw.detail||raw.error||'');
    }
    if(!message&&typeof data?.message==='string')message=data.message;
    if(!code&&typeof data?.error_code==='string')code=data.error_code;
    return {code,message:message||'ไม่ทราบสาเหตุ'};
  };

  const friendly=info=>{
    const map={
      private_folder_not_allowed:'สิทธิ์ของลูกค้าไม่ครอบคลุมกลุ่มนายแบบที่เลือก',
      private_folder_invalid:'กลุ่มนายแบบที่เลือกไม่ถูกต้อง',
      private_orientation_required:'กรุณาเลือกประเภทนายแบบ Straight หรือ Gay',
      AUTHORITATIVE_MEMBER_NOT_FOUND:'ไม่พบข้อมูลสมาชิก canonical ของลูกค้า',
      private_eligibility_blocked:'สถานะสมาชิกของลูกค้ายังไม่เปิดสิทธิ์งาน Private',
      private_model_not_found:'ไม่พบนายแบบในข้อมูล canonical',
    };
    return map[info.code]||info.message;
  };

  // The split-page fetch helper expects `error` to be a string. The API correctly
  // returns structured errors ({code,message}), so normalize only the browser copy
  // while retaining the original detail for diagnostics.
  const normalizeResponse=(res,data)=>{
    if(!(data?.error&&typeof data.error==='object'))return res;
    const info=errorInfo(data);
    const headers=new Headers(res.headers);
    headers.set('content-type','application/json; charset=utf-8');
    headers.delete('content-length');
    return new Response(JSON.stringify({
      ...data,
      error:info.message,
      error_code:info.code,
      error_detail:data.error,
    }),{status:res.status,statusText:res.statusText,headers});
  };

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    let url;
    try{url=new URL(input instanceof Request?input.url:String(input),location.href)}catch{return nativeFetch(input,init)}
    if(url.pathname!=='/v1/admin/models/search')return nativeFetch(input,init);

    const services=(url.searchParams.get('service_options')||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    for(const key of ['mk','burn','kiss','live'])if(services.includes(key))url.searchParams.set(key,'1');

    const q=(url.searchParams.get('q')||'').trim();
    const scope=scopeText();
    show(`${q?`กำลังค้นหา “${q}”`:'กำลังค้นหานายแบบ'}${scope?` · ${scope}`:''}…`,'loading');
    search.disabled=true;
    const next=input instanceof Request?new Request(url.toString(),input):url.toString();

    try{
      const res=await nativeFetch(next,init);
      let data={};
      try{data=await res.clone().json()}catch{}
      const items=Array.isArray(data.items)?data.items:Array.isArray(data.models)?data.models:Array.isArray(data.records)?data.records:[];
      if(!res.ok||data.ok===false){
        const info=errorInfo(data);
        const code=info.code?` · ${info.code}`:'';
        show(`ค้นหานายแบบไม่สำเร็จ · ${friendly(info)}${code}`,'bad');
      }else if(items.length){
        show(`พบ ${items.length} นายแบบ${q?` สำหรับ “${q}”`:''}${scope?` · ${scope}`:''} · เลือกการ์ดด้านล่างได้เลย`,'ok');
      }else{
        show(`ไม่พบ${q?` “${q}”`:'นายแบบ'}${scope?` ใน ${scope}`:' ในกลุ่ม/ประเภทที่เลือก'} · ถ้านายแบบอยู่คนละกลุ่ม ให้เปลี่ยนกลุ่มนายแบบแล้วค้นใหม่`,'warn');
      }
      return normalizeResponse(res,data);
    }catch(err){
      show(`ค้นหานายแบบไม่สำเร็จ · ${err?.message||String(err)}`,'bad');
      throw err;
    }finally{
      search.disabled=false;
    }
  };

  search.addEventListener('click',()=>{
    const q=(query?.value||'').trim();
    const scope=scopeText();
    show(`${q?`กำลังค้นหา “${q}”`:'กำลังค้นหานายแบบ'}${scope?` · ${scope}`:''}…`,'loading');
  },true);

  if(!document.getElementById('mmd-create-job-model-search-v6-css')){
    const s=document.createElement('style');
    s.id='mmd-create-job-model-search-v6-css';
    s.textContent='#mmd-cj-split-v1 .mmd-cj__modelStatus{margin:10px 0 2px;padding:10px 12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;font-size:12px;line-height:1.5;color:var(--meta)}#mmd-cj-split-v1 .mmd-cj__modelStatus[data-tone="ok"]{border-color:rgba(119,190,132,.45)}#mmd-cj-split-v1 .mmd-cj__modelStatus[data-tone="bad"]{border-color:rgba(230,108,108,.55)}#mmd-cj-split-v1 .mmd-cj__modelStatus[data-tone="warn"]{border-color:rgba(239,214,149,.45)}';
    document.head.appendChild(s);
  }
};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();