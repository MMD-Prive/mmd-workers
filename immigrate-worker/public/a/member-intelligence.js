(()=>{
  "use strict";

  const normalizedPath=(location.pathname.replace(/\/+$/g,"")||"/");
  if(normalizedPath!=="/internal/admin/member-intelligence")return;

  const byId=(id)=>document.getElementById(id);
  const clean=(value)=>String(value==null?"":value).trim();
  const lower=(value)=>clean(value).toLowerCase();
  const display=(value)=>clean(value)||"—";
  const loginNext=`/internal/admin/login?next=${encodeURIComponent(location.pathname+location.search)}`;
  const state={records:[],selected:null,memory:null};

  function setText(id,value){
    const element=byId(id);
    if(element)element.textContent=display(value);
  }

  function setTone(elementOrId,value="warn"){
    const element=typeof elementOrId==="string"?byId(elementOrId):elementOrId;
    if(element)element.setAttribute("data-tone",value);
  }

  function setLayerTone(elementOrId,value="warn"){
    const element=typeof elementOrId==="string"?byId(elementOrId):elementOrId;
    const layer=element?.closest?.(".mi-layer");
    if(layer)layer.setAttribute("data-tone",value);
  }

  function setStatus(message,value="warn"){
    const status=byId("miStatus");
    if(!status)return;
    status.textContent=message;
    status.setAttribute("data-tone",value);
  }

  function failureMessage(error){
    const code=lower(error?.message);
    if(code.includes("backend_html"))return "BACKEND WAITING · route ตอบกลับเป็น HTML แทนข้อมูล";
    if(code.includes("lineage_storage_not_ready")||code.includes("airtable_config_missing"))return "BACKEND WAITING · Canonical Client storage ยังไม่พร้อม";
    if(code.includes("lineage_lookup_failed")||code.includes("endpoint_unavailable"))return "BACKEND WAITING · Canonical backend ยังอ่านข้อมูลไม่ได้";
    return "BACKEND WAITING · โหลดข้อมูลไม่สำเร็จ";
  }

  async function api(url,options={}){
    const headers=new Headers(options.headers||{});
    headers.set("Accept","application/json");
    if(options.body&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
    const response=await fetch(url,{...options,headers,credentials:"same-origin",cache:"no-store"});
    if(response.status===401||response.status===403){
      location.replace(loginNext);
      throw new Error("unauthorized");
    }
    const contentType=lower(response.headers.get("content-type"));
    if(!contentType.includes("application/json"))throw new Error("backend_html");
    const payload=await response.json().catch(()=>({ok:false,error:"invalid_json"}));
    if(!response.ok||payload?.ok===false)throw new Error(clean(payload?.error)||`http_${response.status}`);
    return payload;
  }

  function recordName(record){
    return clean(record?.remembered_name)||clean(record?.canonical_name)||clean(record?.client_name)||"Unnamed Client";
  }

  function recordSummary(record){
    if(record?.manual_public_only)return "IDENTITY REVIEW · ยังไม่ใช่ Canonical Client";
    const pieces=["Canonical Client"];
    if(clean(record?.tier))pieces.push(clean(record.tier));
    else if(clean(record?.package_code))pieces.push(clean(record.package_code));
    if(clean(record?.membership_status))pieces.push(clean(record.membership_status));
    return pieces.join(" · ");
  }

  function renderRecords(records){
    const results=byId("miResults");
    if(!results)return;
    results.replaceChildren();
    if(!records.length){
      const empty=document.createElement("div");
      empty.className="mi-empty";
      empty.textContent="ไม่พบ Canonical Client จากข้อมูลที่ยืนยันได้";
      results.appendChild(empty);
      return;
    }

    records.forEach((record,index)=>{
      const button=document.createElement("button");
      button.type="button";
      button.className="mi-result";
      button.dataset.index=String(index);
      if(state.selected&&clean(state.selected.client_id)&&clean(state.selected.client_id)===clean(record.client_id))button.classList.add("is-active");

      const title=document.createElement("strong");
      title.textContent=recordName(record);
      const meta=document.createElement("span");
      meta.textContent=recordSummary(record);
      button.append(title,meta);
      button.addEventListener("click",()=>selectRecord(record));
      results.appendChild(button);
    });
  }

  function setDetailVisible(visible){
    const detail=byId("miDetail");
    const empty=byId("miDetailEmpty");
    if(detail){
      detail.hidden=!visible;
      if(visible)detail.removeAttribute("hidden");
      else detail.setAttribute("hidden","");
    }
    if(empty){
      empty.hidden=visible;
      if(visible)empty.setAttribute("hidden","");
      else empty.removeAttribute("hidden");
    }
  }

  function setHandoffLinks(record){
    const accessLink=byId("miAccessLink");
    const jobLink=byId("miSessionLink");
    const clientId=clean(record?.client_id);

    if(clientId){
      if(accessLink){
        accessLink.href=`/internal/admin/membership-access?client_id=${encodeURIComponent(clientId)}`;
        accessLink.textContent="เปิด Membership Access";
      }
      if(jobLink){
        jobLink.href=`/internal/admin/jobs/create-job?client_id=${encodeURIComponent(clientId)}`;
        jobLink.textContent="ไป Create Job";
      }
      return;
    }

    if(accessLink){
      accessLink.href="/internal/admin/customer-data";
      accessLink.textContent="ไป Customer 360";
    }
    if(jobLink){
      jobLink.href="/internal/admin/customer-data";
      jobLink.textContent="Resolve Identity First";
    }
  }

  function reviewRecommendation(memory){
    if(!memory)return {label:"REVIEW",tone:"warn"};
    const member=lower(memory.membership_status);
    const access=lower(memory.access_status);
    const renewal=lower(memory.renewal_status);
    const verification=lower(memory.verification_status);
    const combined=`${member} ${access}`;

    if(/blocked|suspended|revoked/.test(combined))return {label:"OWNER REVIEW",tone:"bad"};
    if(/expired/.test(member)||/due|expired|renew/.test(renewal))return {label:"RENEWAL REVIEW",tone:"warn"};
    if(!verification||/pending|unverified|unknown/.test(verification))return {label:"VERIFY CONTEXT",tone:"warn"};
    if(!access)return {label:"REVIEW",tone:"warn"};
    return {label:"CONTEXT READY",tone:"ok"};
  }

  function accessTone(value){
    const normalized=lower(value);
    if(/active|granted|allowed|eligible/.test(normalized))return "ok";
    if(/blocked|suspended|revoked|expired|denied/.test(normalized))return "bad";
    return "warn";
  }

  function renderEvidence(record,memory){
    const evidence=byId("miEvidence");
    if(!evidence)return;
    evidence.replaceChildren();

    const confidence=Number(record?.confidence);
    const rows=[
      ["Canonical Client",clean(record?.client_id)?"Linked":"Not resolved"],
      ["Matched on",display(record?.matched_on||record?.lineage_source)],
      ["Confidence",Number.isFinite(confidence)?`${Math.round(confidence)}%`:"—"],
      ["Relationship level",display(memory?.relationship_tier||memory?.membership_tier||record?.tier||record?.package_code)],
      ["Membership evidence",display(memory?.membership_status||record?.membership_status)],
      ["Package",display(memory?.package_code||record?.package_code)],
      ["Access evidence",display(memory?.access_status||"WAITING")],
      ["Renewal",display(memory?.renewal_due||memory?.renewal_status)],
      ["Points confirmed",display(memory?.points_confirmed)],
      ["Source",display(memory?.source||record?.entitlement_snapshot_source||record?.lineage_source)]
    ];

    rows.forEach(([label,value])=>{
      const item=document.createElement("div");
      const key=document.createElement("small");
      const val=document.createElement("b");
      key.textContent=label;
      val.textContent=value;
      item.append(key,val);
      evidence.appendChild(item);
    });
  }

  function paintLineage(record){
    setText("miName",recordName(record));
    setText("miIdentity",record?.manual_public_only?"Identity Review":(clean(record?.client_id)?"Canonical Client":"Identity Review"));
    setText("miIdentityMeta",[
      clean(record?.canonical_name),
      clean(record?.matched_on),
      Number.isFinite(Number(record?.confidence))?`${Math.round(Number(record.confidence))}%`:""
    ].filter(Boolean).join(" · "));
    setText("miSource",record?.lineage_source||record?.entitlement_snapshot_source||"canonical_client_lineage");
    setText("miLevel",record?.tier||record?.package_code||"—");
    setText("miLevelMeta",record?.membership_status?`Relationship evidence · ${record.membership_status} · ไม่ใช่ authorization`:"Relationship evidence · ไม่ใช่ authorization");
    setText("miAccess","WAITING");
    setText("miAccessMeta","My MMD Resolver เป็น authority; กำลังอ่าน bounded entitlement evidence");
    setText("miReview",record?.manual_public_only?"IDENTITY REVIEW":"WAITING");

    setLayerTone("miIdentity",record?.manual_public_only?"warn":"ok");
    setLayerTone("miLevel","warn");
    setTone("miAccessCard","warn");
    setTone("miReviewCard","warn");
    renderEvidence(record,null);
    setHandoffLinks(record);
  }

  function paintMemory(record,memory){
    state.memory=memory||null;
    if(!memory){
      setText("miAccess","WAITING");
      setText("miReview","REVIEW");
      setText("miAccessMeta","Backend entitlement evidence ยังไม่พร้อม · ไม่อนุมานจาก tier หรือ tag");
      setTone("miAccessCard","warn");
      setTone("miReviewCard","warn");
      renderEvidence(record,null);
      return;
    }

    const level=memory.relationship_tier||memory.membership_tier||record?.tier||record?.package_code||"—";
    setText("miLevel",level);
    setText("miLevelMeta",`${memory.membership_status?`Membership evidence · ${memory.membership_status} · `:""}Relationship evidence · ไม่ใช่ authorization`);

    const access=clean(memory.access_status)||"WAITING";
    setText("miAccess",access);
    setText("miAccessMeta",`Backend entitlement evidence · My MMD Resolver ยังเป็น authority${memory.renewal_due?` · renewal ${String(memory.renewal_due).slice(0,10)}`:""}`);

    const review=reviewRecommendation(memory);
    setText("miReview",review.label);
    setTone("miReviewCard",review.tone);
    setTone("miAccessCard",accessTone(access));
    setLayerTone("miLevel",clean(level)==="—"?"warn":"ok");
    setText("miSource",memory.source||record?.entitlement_snapshot_source||"Clients");
    renderEvidence(record,memory);
  }

  async function selectRecord(record,prefetched){
    state.selected=record;
    renderRecords(state.records);
    setDetailVisible(true);
    paintLineage(record);

    if(record?.manual_public_only||!clean(record?.client_id)){
      setStatus("IDENTITY REVIEW · ต้อง resolve เป็น Canonical Client ก่อนดู membership/access","warn");
      return;
    }

    setStatus("กำลังอ่าน bounded member context…","warn");
    try{
      const payload=prefetched||await api(`/v1/admin/kenji/control/memory?client_id=${encodeURIComponent(record.client_id)}`);
      const memory=payload?.data_status==="live"?payload.memory:null;
      paintMemory(record,memory);
      setStatus(memory?"พร้อม · Verified backend projection loaded":"REVIEW · ไม่พบ bounded member context",memory?"ok":"warn");
    }catch(error){
      if(lower(error?.message)==="unauthorized")return;
      paintMemory(record,null);
      setStatus(failureMessage(error),"bad");
    }
  }

  async function loadRecords(query=""){
    setStatus(query?"กำลังค้นหา Canonical Client…":"กำลังโหลด Canonical Client ล่าสุด…","warn");
    try{
      const payload=query
        ?await api("/v1/admin/clients/lineage-lookup",{method:"POST",body:JSON.stringify({query})})
        :await api("/v1/admin/clients/recent");
      state.records=Array.isArray(payload?.records)?payload.records:[];
      state.selected=null;
      state.memory=null;
      renderRecords(state.records);
      setDetailVisible(false);

      if(payload?.manual_fallback)setStatus("IDENTITY REVIEW · พบ candidate แต่ยังไม่ใช่ Canonical Client","warn");
      else setStatus(`พร้อม · ${state.records.length} Canonical Client${state.records.length===1?"":"s"}`,"ok");

      const wanted=clean(new URLSearchParams(location.search).get("client_id"));
      if(wanted){
        const found=state.records.find((record)=>clean(record.client_id)===wanted);
        if(found)await selectRecord(found);
      }
    }catch(error){
      if(lower(error?.message)==="unauthorized")return;
      state.records=[];
      renderRecords([]);
      setDetailVisible(false);
      setStatus(failureMessage(error),"bad");
    }
  }

  async function openDirectClient(clientId){
    if(!clientId)return;
    const existing=state.records.find((record)=>clean(record.client_id)===clientId);
    if(existing){
      await selectRecord(existing);
      return;
    }

    try{
      setStatus("กำลังเปิด Canonical Client…","warn");
      const payload=await api(`/v1/admin/kenji/control/memory?client_id=${encodeURIComponent(clientId)}`);
      const memory=payload?.data_status==="live"?payload.memory:null;
      const record={
        client_id:clientId,
        client_name:memory?.display_name||"Canonical Client",
        canonical_name:memory?.display_name||"",
        matched_on:"direct_client_id",
        confidence:100,
        lineage_source:"canonical_client_direct",
        tier:memory?.membership_tier||"",
        package_code:memory?.package_code||"",
        membership_status:memory?.membership_status||"",
        entitlement_snapshot_source:memory?.source||""
      };
      state.records=[record,...state.records];
      await selectRecord(record,payload);
    }catch(error){
      if(lower(error?.message)!=="unauthorized")setStatus(failureMessage(error),"bad");
    }
  }

  function addNavigation(label,href,id){
    const links=document.querySelector("#mmdMemberIntelligence .mi-links");
    if(!links||document.getElementById(id))return;
    const anchor=document.createElement("a");
    anchor.id=id;
    anchor.href=href;
    anchor.textContent=label;
    links.prepend(anchor);
  }

  function boot(){
    if(!byId("mmdMemberIntelligence"))return;

    addNavigation("Customer 360","/internal/admin/customer-data","miNavCustomer360");
    addNavigation("Control Room","/internal/admin/control-room","miNavControlRoom");

    const form=byId("miSearchForm");
    const input=byId("miSearch");
    if(form)form.addEventListener("submit",(event)=>{
      event.preventDefault();
      event.stopPropagation();
      loadRecords(clean(input?.value));
    },true);
    if(input)input.addEventListener("keydown",(event)=>{
      if(event.key==="Escape"){
        input.value="";
        loadRecords("");
      }
    });

    const params=new URLSearchParams(location.search);
    const query=clean(params.get("q"));
    const clientId=clean(params.get("client_id"));
    if(query&&input)input.value=query;

    loadRecords(query).then(()=>{
      if(clientId&&!state.records.some((record)=>clean(record.client_id)===clientId))openDirectClient(clientId);
    });
  }

  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",boot,{once:true}):boot();
})();
