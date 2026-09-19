(()=>{'use strict';
if(location.pathname.replace(/\/+$/,'')!=='/internal/admin/jobs/create-job')return;
const boot=()=>{
  const root=document.getElementById('mmd-cj-split-v1');
  if(!root||root.dataset.modelSearchFix==='v7')return;
  root.dataset.modelSearchFix='v7';

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
    privateWork&&!privateWork.closest('[hidden]')?privateWork.selectedOptions?.[0]?.textContent:''
  ].filter(Boolean).join(' · ');

  const errorInfo=data=>{
    const raw=data?.error;
    let code='',message='';
    if(typeof raw==='string')message=raw;
    else if(raw&&typeof raw==='object'){
      code=String(raw.code||raw.error_code||'');
      message=String(raw.message||raw.detail||raw.error||'');
    }
    if(!message&&typeof data?.message==='string')message=data.message;
    if(!code&&typeof data?.error_code==='string')code=data.error_code;
    return{code,message:message||'ไม่ทราบสาเหตุ'};
  };

  const friendly=info=>{
    const map={
      private_folder_not_allowed:'สิทธิ์ของลูกค้าไม่ครอบคลุมกลุ่มนายแบบที่เลือก',
      private_folder_invalid:'กลุ่มนายแบบที่เลือกไม่ถูกต้อง',
      private_orientation_required:'กรุณาเลือกประเภทนายแบบ Straight หรือ Gay',
      AUTHORITATIVE_MEMBER_NOT_FOUND:'ไม่พบข้อมูลสมาชิก canonical ของลูกค้า',
      private_eligibility_blocked:'สถานะสมาชิกของลูกค้ายังไม่เปิดสิทธิ์งาน Private',
      private_model_not_found:'ไม่พบนายแบบในข้อมูล canonical'
    };
    return map[info.code]||info.message;
  };

  const normalized=v=>String(v??'').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9ก-๙]+/g,'');
  const text=(f,...keys)=>{
    for(const key of keys){
      const value=f?.[key];
      if(Array.isArray(value)&&value.length)return String(value[0]??'').trim();
      if(value!==undefined&&value!==null&&String(value).trim())return String(value).trim();
    }
    return'';
  };
  const bool=(f,...keys)=>{
    const v=text(f,...keys).toLowerCase();
    return['1','true','yes','y','active','approved','allowed'].includes(v);
  };
  const accessFolder=value=>{
    const v=normalized(value);
    if(v.includes('exclusive')||v.includes('blackcard'))return'exclusive';
    if(v.includes('vip'))return'vip';
    if(v.includes('premium'))return'premium';
    if(v.includes('standard')||v.includes('lite'))return'standard';
    return'';
  };
  const lane=value=>{
    const v=normalized(value);
    if(v==='gay'||v.includes('gay'))return'gay';
    if(v==='straight'||v.includes('straight'))return'straight';
    if(v==='both'||v==='bi'||v.includes('both'))return'both';
    return'';
  };
  const work=value=>{
    const v=normalized(value);
    if(v.includes('vip'))return'vip';
    if(v.includes('pn'))return'pn';
    return'';
  };
  const activeRecord=f=>{
    const v=normalized(text(f,'status','Status','canonical_profile_status','Canonical Profile Status'));
    return v==='active'||v==='approved'||v==='live';
  };
  const privateRecord=f=>{
    const layer=normalized(text(f,'sales_layer','Sales Layer','booking_visibility','Booking Visibility'));
    return layer.includes('private')||Boolean(accessFolder(text(f,'access_folder','model_access_folder','model_folder','model_tier','model_class','private_tier','Private Tier')));
  };
  const capability=(f,key)=>{
    const aliases={
      mk:['mk_ability','MK Ability','mk','MK'],
      burn:['burn_ability','Burn Ability','burn','Burn'],
      kiss:['kiss_ability','Kiss Ability','kiss','Kiss'],
      live:['live_ability','Live Ability','live','Live']
    }[key]||[];
    return bool(f,...aliases);
  };

  const ownerCandidate=(record,requestUrl)=>{
    const f=record?.fields&&typeof record.fields==='object'?record.fields:record||{};
    if(!activeRecord(f)||!privateRecord(f))return null;

    const requestedLane=lane(requestUrl.searchParams.get('customer_lane')||requestUrl.searchParams.get('selected_orientation'));
    const candidateLane=lane(text(f,'orientation_label','Orientation Label','orientation','model_orientation','model_gender','Model Gender'));
    if(requestedLane&&candidateLane&&candidateLane!==requestedLane&&candidateLane!=='both')return null;

    const requestedWork=work(requestUrl.searchParams.get('private_work')||requestUrl.searchParams.get('job_type'));
    const candidateWork=work(text(f,'private_work_format','Private Work Format','private_service_level','Private Service Level','pn_ability','PN Ability'));
    if(requestedWork&&candidateWork&&candidateWork!==requestedWork)return null;

    const services=(requestUrl.searchParams.get('service_options')||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    for(const key of ['mk','burn','kiss','live'])if(services.includes(key)&&!capability(f,key))return null;

    const modelName=text(f,'working_name','Working Name','model_name','Model Name','display_name','Display Name','nickname','Nickname','name','Name');
    if(!modelName)return null;
    const modelId=String(record?.id||text(f,'model_record_id','Model Record ID','model_id','Model ID')).trim();
    const lookup=text(f,'model_lookup_key','unique_key','Unique Key','model_code','Model Code');
    const tier=accessFolder(text(f,'access_folder','model_access_folder','model_folder','model_tier','Model Tier','model_class','Model Class','private_tier','Private Tier'));
    const telegram=text(f,'telegram_username','Telegram Username');
    const legacyFolder=text(f,'folder_name','Folder Name','drive_folder','google_drive_folder','source_folder','Source Folder');
    const q=normalized(requestUrl.searchParams.get('q')||'');
    const exact=[modelName,text(f,'nickname','Nickname'),lookup,modelId].some(v=>q&&normalized(v)===q);

    return{
      model_id:modelId,
      model_name:modelName,
      lookup_key:lookup,
      model_lookup_key:lookup,
      telegram_username:telegram,
      telegram_status:telegram?'linked':'missing',
      status:'active',
      tier:tier,
      access_folder:tier,
      folders:tier?[tier]:[],
      orientation:candidateLane,
      lane:candidateLane,
      source:'owner_canonical_inventory',
      legacy_folder:legacyFolder,
      private_work:candidateWork,
      entitlement_recheck_required:true,
      owner_discovery_exact:exact
    };
  };

  const normalizeErrorResponse=(res,data)=>{
    if(!(data?.error&&typeof data.error==='object'))return res;
    const info=errorInfo(data),headers=new Headers(res.headers);
    headers.set('content-type','application/json; charset=utf-8');
    headers.delete('content-length');
    return new Response(JSON.stringify({...data,error:info.message,error_code:info.code,error_detail:data.error}),{status:res.status,statusText:res.statusText,headers});
  };

  const synthetic=(payload)=>new Response(JSON.stringify(payload),{
    status:200,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });

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
      const info=errorInfo(data);

      if((!res.ok||data.ok===false)&&info.code==='AUTHORITATIVE_MEMBER_NOT_FOUND'&&q.length>=2&&url.searchParams.get('booking_visibility')==='private'){
        const inventoryUrl=new URL('/v1/admin/models/list',location.origin);
        inventoryUrl.searchParams.set('q',q);
        inventoryUrl.searchParams.set('limit','50');
        const inventoryRes=await nativeFetch(inventoryUrl.toString(),{credentials:'include',cache:'no-store'});
        const inventory=await inventoryRes.json().catch(()=>({}));
        if(inventoryRes.ok&&inventory.ok!==false){
          const raw=Array.isArray(inventory.items)?inventory.items:[];
          const items=raw.map(record=>ownerCandidate(record,url)).filter(Boolean);
          const exact=items.filter(item=>item.owner_discovery_exact);
          const candidatePool=exact.length?exact:items;
          let correctedFolder='';

          if(candidatePool.length===1&&candidatePool[0].access_folder&&folder&&folder.value!==candidatePool[0].access_folder){
            correctedFolder=candidatePool[0].access_folder;
            folder.value=correctedFolder;
            folder.dispatchEvent(new Event('change',{bubbles:true}));
          }

          if(candidatePool.length){
            const one=candidatePool.length===1?candidatePool[0]:null;
            const tierText=one?.access_folder?`${one.access_folder.charAt(0).toUpperCase()}${one.access_folder.slice(1)} Models`:'';
            const corrected=correctedFolder?` · แก้กลุ่มนายแบบเป็น ${tierText} ให้อัตโนมัติ`:'';
            show(`พบ ${candidatePool.length} นายแบบจาก canonical Models${one?` · ${one.model_name}${tierText?` · ${tierText}`:''}`:''}${corrected} · Owner Discovery · ระบบจะตรวจ Membership/Entitlement ซ้ำตอนสร้างงาน`,'ok');
          }else{
            show(`ไม่พบ “${q}” ใน canonical Models ที่ Active และตรงกับประเภทงานนี้ · Owner Discovery`,'warn');
          }

          return synthetic({
            ok:true,
            layer:'owner_discovery',
            items:candidatePool,
            owner_discovery:true,
            entitlement_recheck_required:true,
            discovery_reason:'AUTHORITATIVE_MEMBER_NOT_FOUND',
            corrected_access_folder:correctedFolder||null
          });
        }
      }

      const items=Array.isArray(data.items)?data.items:Array.isArray(data.models)?data.models:Array.isArray(data.records)?data.records:[];
      if(!res.ok||data.ok===false){
        const msg=friendly(info),code=info.code?` · ${info.code}`:'';
        show(`ค้นหานายแบบไม่สำเร็จ · ${msg}${code}`,'bad');
      }else if(items.length){
        show(`พบ ${items.length} นายแบบ${q?` สำหรับ “${q}”`:''}${scope?` · ${scope}`:''} · เลือกการ์ดด้านล่างได้เลย`,'ok');
      }else{
        show(`ไม่พบ${q?` “${q}”`:'นายแบบ'}${scope?` ใน ${scope}`:' ในกลุ่ม/ประเภทที่เลือก'} · ถ้านายแบบอยู่คนละกลุ่ม ให้เปลี่ยนกลุ่มนายแบบแล้วค้นใหม่`,'warn');
      }
      return normalizeErrorResponse(res,data);
    }catch(err){
      show(`ค้นหานายแบบไม่สำเร็จ · ${err?.message||String(err)}`,'bad');
      throw err;
    }finally{
      search.disabled=false;
    }
  };

  search.addEventListener('click',()=>{
    const q=(query?.value||'').trim(),scope=scopeText();
    show(`${q?`กำลังค้นหา “${q}”`:'กำลังค้นหานายแบบ'}${scope?` · ${scope}`:''}…`,'loading');
  },true);

  if(!document.getElementById('mmd-create-job-model-search-v7-css')){
    const s=document.createElement('style');
    s.id='mmd-create-job-model-search-v7-css';
    s.textContent='#mmd-cj-split-v1 .mmd-cj__modelStatus{margin:10px 0 2px;padding:10px 12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;font-size:12px;line-height:1.5;color:var(--meta)}#mmd-cj-split-v1 .mmd-cj__modelStatus[data-tone="ok"]{border-color:rgba(119,190,132,.45)}#mmd-cj-split-v1 .mmd-cj__modelStatus[data-tone="bad"]{border-color:rgba(230,108,108,.55)}#mmd-cj-split-v1 .mmd-cj__modelStatus[data-tone="warn"]{border-color:rgba(239,214,149,.45)}';
    document.head.appendChild(s);
  }
};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();