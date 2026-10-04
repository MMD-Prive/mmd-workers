(()=>{'use strict';
if(location.pathname.replace(/\/+$/,'')!=='/internal/admin/jobs/create-job')return;
const boot=()=>{
  const root=document.getElementById('mmd-cj-split-v1');
  if(!root||root.dataset.modelSearchCaseFix==='v8')return;
  root.dataset.modelSearchCaseFix='v8';

  const folder=root.querySelector('[data-cj="folder"]');
  const status=root.querySelector('[data-cj-model-status]');
  const show=(text,tone='')=>{
    if(!status)return;
    status.textContent=text;
    status.dataset.tone=tone;
    status.hidden=!text;
  };

  const normalized=v=>String(v??'').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9ก-๙]+/g,'');
  const scalar=v=>{
    if(Array.isArray(v))return scalar(v[0]);
    if(v&&typeof v==='object')return String(v.name??v.value??v.label??'').trim();
    return v==null?'':String(v).trim();
  };
  const text=(f,...keys)=>{
    for(const key of keys){
      const value=scalar(f?.[key]);
      if(value)return value;
    }
    return'';
  };
  const truthy=(f,...keys)=>['1','true','yes','y','active','approved','allowed'].includes(normalized(text(f,...keys)));
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
    if(v.includes('straight'))return'straight';
    if(v.includes('gay'))return'gay';
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
    return layer.includes('private')||Boolean(accessFolder(text(f,'access_folder','model_access_folder','model_folder','model_tier','Model Tier','model_class','Model Class','private_tier','Private Tier')));
  };
  const capability=(f,key)=>{
    const aliases={
      mk:['mk_ability','MK Ability','mk','MK'],
      burn:['burn_ability','Burn Ability','burn','Burn'],
      kiss:['kiss_ability','Kiss Ability','kiss','Kiss'],
      live:['live_ability','Live Ability','live','Live']
    }[key]||[];
    return truthy(f,...aliases);
  };
  const rawItems=data=>Array.isArray(data?.items)?data.items:Array.isArray(data?.models)?data.models:Array.isArray(data?.records)?data.records:[];
  const searchValues=(record,f)=>[
    record?.id,
    text(f,'working_name','Working Name'),
    text(f,'nickname','Nickname'),
    text(f,'model_name','Model Name'),
    text(f,'display_name','Display Name'),
    text(f,'name','Name'),
    text(f,'model_record_id','Model Record ID','model_id','Model ID'),
    text(f,'model_lookup_key','Model Lookup Key','unique_key','Unique Key'),
    text(f,'model_code','Model Code'),
    text(f,'run_number','Run Number','run_no','Run No','model_run_number','Model Run Number')
  ].filter(Boolean);

  const toCandidate=(record,requestUrl,qNorm)=>{
    const f=record?.fields&&typeof record.fields==='object'?record.fields:record||{};
    if(!activeRecord(f)||!privateRecord(f))return null;
    if(!searchValues(record,f).some(v=>normalized(v)===qNorm))return null;

    const requestedLane=lane(requestUrl.searchParams.get('customer_lane')||requestUrl.searchParams.get('selected_orientation'));
    const candidateLane=lane(text(f,'orientation_label','Orientation Label','orientation','model_orientation','model_gender','Model Gender'));
    if(requestedLane&&candidateLane&&candidateLane!==requestedLane&&candidateLane!=='both')return null;

    const requestedWork=work(requestUrl.searchParams.get('private_work')||requestUrl.searchParams.get('job_type'));
    const candidateWork=work(text(f,'private_work_format','Private Work Format','private_service_level','Private Service Level','pn_ability','PN Ability'));
    if(requestedWork&&candidateWork&&candidateWork!==requestedWork)return null;

    const services=(requestUrl.searchParams.get('service_options')||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    for(const key of ['mk','burn','kiss','live'])if(services.includes(key)&&!capability(f,key))return null;

    const modelName=text(f,'working_name','Working Name','model_name','Model Name','display_name','Display Name','nickname','Nickname','name','Name');
    const nickname=text(f,'nickname','Nickname');
    const modelId=String(record?.id||text(f,'model_record_id','Model Record ID','model_id','Model ID')).trim();
    const lookup=text(f,'model_lookup_key','Model Lookup Key','unique_key','Unique Key','model_code','Model Code');
    const tier=accessFolder(text(f,'access_folder','model_access_folder','model_folder','model_tier','Model Tier','model_class','Model Class','private_tier','Private Tier'));
    const telegram=text(f,'telegram_username','Telegram Username');
    return{
      model_id:modelId,
      model_name:modelName,
      nickname,
      lookup_key:lookup,
      model_lookup_key:lookup,
      telegram_username:telegram,
      telegram_status:telegram?'linked':'missing',
      status:'active',
      tier,
      access_folder:tier,
      folders:tier?[tier]:[],
      orientation:candidateLane,
      lane:candidateLane,
      private_work:candidateWork,
      source:'owner_canonical_inventory_case_alias_v8',
      entitlement_recheck_required:true,
      owner_discovery_exact:true
    };
  };

  const smartCase=q=>q.split(/(\s+)/).map((part,index)=>{
    if(/^\s+$/.test(part))return part;
    if(!/^[A-Za-z]+$/.test(part))return part;
    if(part.length<=3&&index>0)return part.toUpperCase();
    return part.charAt(0).toUpperCase()+part.slice(1).toLowerCase();
  }).join('');

  const previousFetch=window.fetch.bind(window);
  const loadInventory=async(searchQ)=>{
    const u=new URL('/v1/admin/models/list',location.origin);
    if(searchQ)u.searchParams.set('q',searchQ);
    u.searchParams.set('limit',searchQ?'50':'200');
    const r=await previousFetch(u.toString(),{credentials:'include',cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    return r.ok&&d?.ok!==false?rawItems(d):[];
  };

  window.fetch=async(input,init)=>{
    let url;
    try{url=new URL(input instanceof Request?input.url:String(input),location.href)}catch{return previousFetch(input,init)}
    if(url.pathname!=='/v1/admin/models/search')return previousFetch(input,init);

    const res=await previousFetch(input,init);
    let data={};
    try{data=await res.clone().json()}catch{return res}
    if(!(data?.owner_discovery===true&&data?.entitlement_recheck_required===true&&rawItems(data).length===0))return res;

    const q=(url.searchParams.get('q')||'').trim();
    const qNorm=normalized(q);
    if(qNorm.length<2)return res;

    const seen=new Map();
    const variants=[q,smartCase(q)].filter(Boolean);
    for(const variant of [...new Set(variants)]){
      for(const record of await loadInventory(variant))if(record?.id&&!seen.has(record.id))seen.set(record.id,record);
    }

    let candidates=[...seen.values()].map(record=>toCandidate(record,url,qNorm)).filter(Boolean);
    if(!candidates.length){
      for(const record of await loadInventory(''))if(record?.id&&!seen.has(record.id))seen.set(record.id,record);
      candidates=[...seen.values()].map(record=>toCandidate(record,url,qNorm)).filter(Boolean);
    }
    if(!candidates.length)return res;

    let correctedFolder='';
    if(candidates.length===1&&candidates[0].access_folder&&folder&&folder.value!==candidates[0].access_folder){
      correctedFolder=candidates[0].access_folder;
      folder.value=correctedFolder;
      folder.dispatchEvent(new Event('change',{bubbles:true}));
    }

    const one=candidates.length===1?candidates[0]:null;
    const tierText=one?.access_folder?`${one.access_folder.charAt(0).toUpperCase()}${one.access_folder.slice(1)} Models`:'';
    const aliasText=one?.nickname&&normalized(one.nickname)===qNorm&&normalized(one.nickname)!==normalized(one.model_name)?` · alias ${one.nickname}`:'';
    const corrected=correctedFolder?` · แก้กลุ่มนายแบบเป็น ${tierText} ให้อัตโนมัติ`:'';
    show(`พบ ${candidates.length} นายแบบจาก canonical Models${one?` · ${one.model_name}${aliasText}${tierText?` · ${tierText}`:''}`:''}${corrected} · Owner Discovery v8 · ตรวจ Membership/Entitlement ซ้ำตอนสร้างงาน`,'ok');

    return new Response(JSON.stringify({
      ...data,
      ok:true,
      layer:'owner_discovery',
      items:candidates,
      owner_discovery:true,
      entitlement_recheck_required:true,
      discovery_reason:'AUTHORITATIVE_MEMBER_NOT_FOUND',
      case_alias_recovery:true,
      corrected_access_folder:correctedFolder||null
    }),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  };
};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();