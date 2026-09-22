(()=>{
  "use strict";

  const normalizedPath=(location.pathname.replace(/\/+$/g,"")||"/");
  if(normalizedPath!=="/internal/admin/member-intelligence")return;

  const byId=(id)=>document.getElementById(id);
  const clean=(value)=>String(value==null?"":value).trim();
  const lower=(value)=>clean(value).toLowerCase();
  const display=(value)=>clean(value)||"—";
  const loginNext=`/internal/admin/login?next=${encodeURIComponent(location.pathname+location.search)}`;
  const intelligencePath="/v1/admin/clients/intelligence";
  const auditPath="/v1/admin/clients/intelligence/audit";
  const draftSchema="mmd.kenji_continuity_operator_draft.v1";
  const feedbackSchema="mmd.kenji_continuity_operator_feedback.v1";
  const feedbackReasonLabels={
    needs_edit:[
      ["tone_adjustment","โทนยังไม่เหมาะ"],
      ["missing_context","บริบทสำคัญยังไม่พอ"],
      ["too_generic","คำตอบทั่วไปเกินไป"]
    ],
    rejected:[
      ["wrong_context","ต่อเรื่องผิด"],
      ["unsafe_or_inaccurate","เสี่ยงอ้างข้อมูลไม่ถูกต้อง"],
      ["stale_context","บริบทเก่าหรือหมดอายุ"],
      ["not_relevant","ไม่เกี่ยวกับคำถามล่าสุด"]
    ]
  };
  const state={
    records:[],
    selected:null,
    memory:null,
    intelligence:null,
    selectionSeq:0,
    draftText:"",
    draftAvailable:false,
    runtimeCopyAllowed:false,
    viewAudited:false,
    feedbackOutcome:"",
    feedbackReason:"",
    feedbackRecorded:false,
    feedbackReceipt:"",
    feedbackSubmitting:false,
    copying:false
  };

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

  function ensureDraftUi(){
    const detail=byId("miDetail");
    if(!detail)return null;
    let card=byId("miDraftCard");
    if(card)return card;

    if(!byId("miDraftStyle")){
      const style=document.createElement("style");
      style.id="miDraftStyle";
      style.textContent=`
#mmdMemberIntelligence .mi-draft-card{grid-column:1/-1;margin-top:18px;padding:20px;border:1px solid rgba(31,54,42,.17);border-radius:22px;background:linear-gradient(145deg,#f8faf6,#edf3eb);box-shadow:0 16px 42px rgba(20,35,27,.08)}
#mmdMemberIntelligence .mi-draft-card[data-tone="ok"]{border-color:rgba(55,113,73,.34)}
#mmdMemberIntelligence .mi-draft-card[data-tone="bad"]{border-color:rgba(151,63,54,.42);background:linear-gradient(145deg,#fff9f7,#f7eae6)}
#mmdMemberIntelligence .mi-draft-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
#mmdMemberIntelligence .mi-draft-kicker{display:block;color:#5f7466;font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
#mmdMemberIntelligence .mi-draft-head h3{margin:5px 0 0;font-size:20px;line-height:1.25}
#mmdMemberIntelligence .mi-draft-state{flex:0 0 auto;padding:6px 9px;border-radius:999px;background:#e3ebe1;color:#365843;font-size:9px;font-weight:900;letter-spacing:.06em}
#mmdMemberIntelligence .mi-draft-state[data-tone="bad"]{background:#f2ded9;color:#8f3d34}
#mmdMemberIntelligence .mi-draft-copy{width:100%;min-height:110px;margin:14px 0 0;padding:14px;border:1px solid rgba(31,54,42,.14);border-radius:15px;background:#fff;color:#17281e;font:500 14px/1.75 system-ui,sans-serif;resize:vertical}
#mmdMemberIntelligence .mi-draft-copy:disabled{color:#728078;background:#f5f6f3}
#mmdMemberIntelligence .mi-draft-reason{margin:10px 0 0;color:#5d6e64;font-size:11px;line-height:1.6}
#mmdMemberIntelligence .mi-draft-meta{display:grid;gap:7px;margin-top:13px}
#mmdMemberIntelligence .mi-draft-meta div{display:grid;grid-template-columns:92px minmax(0,1fr);gap:10px;padding:9px 10px;border-radius:12px;background:rgba(255,255,255,.68);font-size:10px;line-height:1.5}
#mmdMemberIntelligence .mi-draft-meta small{color:#718078;font-weight:800}
#mmdMemberIntelligence .mi-draft-meta b{min-width:0;overflow-wrap:anywhere;color:#263b2f}
#mmdMemberIntelligence .mi-draft-review{display:flex;align-items:flex-start;gap:9px;margin-top:14px;padding:12px;border:1px solid rgba(31,54,42,.14);border-radius:14px;background:#fff;color:#35493d;font-size:11px;line-height:1.55}
#mmdMemberIntelligence .mi-draft-review input{flex:0 0 auto;width:18px;height:18px;margin:1px 0 0;accent-color:#405947}
#mmdMemberIntelligence .mi-draft-feedback{margin-top:12px;padding:13px;border:1px solid rgba(31,54,42,.12);border-radius:15px;background:rgba(255,255,255,.72)}
#mmdMemberIntelligence .mi-draft-feedback-title{display:block;margin-bottom:9px;color:#5f7466;font-size:9px;font-weight:900;letter-spacing:.12em}
#mmdMemberIntelligence .mi-draft-feedback-options{display:flex;gap:7px;flex-wrap:wrap}
#mmdMemberIntelligence .mi-draft-feedback-choice{min-height:38px;padding:8px 12px;border:1px solid rgba(31,54,42,.18);border-radius:999px;background:#fff;color:#35493d;font-size:10px;font-weight:850}
#mmdMemberIntelligence .mi-draft-feedback-choice[data-selected="true"]{border-color:#385b45;background:#385b45;color:#fff}
#mmdMemberIntelligence .mi-draft-feedback-choice:disabled{cursor:not-allowed;opacity:.42}
#mmdMemberIntelligence .mi-draft-feedback-reason{display:grid;gap:5px;margin-top:10px;color:#5f7466;font-size:10px;font-weight:800}
#mmdMemberIntelligence .mi-draft-feedback-reason select{width:100%;min-height:42px;padding:8px 10px;border:1px solid rgba(31,54,42,.16);border-radius:11px;background:#fff;color:#263b2f;font:600 11px/1.4 system-ui,sans-serif}
#mmdMemberIntelligence .mi-draft-feedback-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:10px}
#mmdMemberIntelligence .mi-draft-feedback-status{margin:0;color:#6d7d73;font-size:10px;line-height:1.5}
#mmdMemberIntelligence .mi-draft-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}
#mmdMemberIntelligence .mi-draft-button{min-height:44px;border:0;border-radius:999px;background:#233b2d;color:#fff;padding:10px 17px;font-size:11px;font-weight:900;letter-spacing:.04em}
#mmdMemberIntelligence .mi-draft-button.is-secondary{min-height:38px;background:#586c5e;padding:8px 13px;font-size:10px}
#mmdMemberIntelligence .mi-draft-button:disabled{cursor:not-allowed;opacity:.42}
#mmdMemberIntelligence .mi-draft-audit{margin:0;color:#6d7d73;font-size:10px;line-height:1.5}
@media(max-width:620px){#mmdMemberIntelligence .mi-draft-card{padding:16px}#mmdMemberIntelligence .mi-draft-meta div{grid-template-columns:1fr;gap:3px}}
`;
      document.head.appendChild(style);
    }

    card=document.createElement("section");
    card.id="miDraftCard";
    card.className="mi-draft-card";
    card.setAttribute("data-tone","warn");
    card.setAttribute("aria-labelledby","miDraftTitle");
    card.innerHTML=`<div class="mi-draft-head"><div><small class="mi-draft-kicker">CUSTOMER CONTINUITY · OPERATOR ONLY</small><h3 id="miDraftTitle">Kenji Reply Draft</h3></div><span class="mi-draft-state" id="miDraftState" data-tone="bad">LOCKED</span></div><textarea class="mi-draft-copy" id="miDraftText" readonly disabled aria-label="Kenji operator reply draft"></textarea><p class="mi-draft-reason" id="miDraftReason">กำลังอ่าน Conversation Matrix และ safety gates…</p><div class="mi-draft-meta"><div><small>MATRIX</small><b id="miDraftMatrix">WAITING</b></div><div><small>KILL SWITCH</small><b id="miDraftKill">UNKNOWN · COPY LOCKED</b></div><div><small>AUTHORITY</small><b>Context only · live truth wins · no customer send</b></div></div><label class="mi-draft-review"><input id="miDraftReview" type="checkbox" disabled><span>ผมตรวจ draft และจะ re-check payment / booking / access / availability จากระบบเจ้าของข้อมูลก่อนนำไปใช้</span></label><div class="mi-draft-feedback" id="miDraftFeedback"><small class="mi-draft-feedback-title">OPERATOR QUALITY · NO CUSTOMER TEXT STORED</small><div class="mi-draft-feedback-options"><button class="mi-draft-feedback-choice" type="button" data-feedback-outcome="accepted" disabled>ใช้ได้</button><button class="mi-draft-feedback-choice" type="button" data-feedback-outcome="needs_edit" disabled>ต้องแก้</button><button class="mi-draft-feedback-choice" type="button" data-feedback-outcome="rejected" disabled>ไม่ควรใช้</button></div><label class="mi-draft-feedback-reason" id="miDraftFeedbackReasonWrap" hidden><span>เหตุผล</span><select id="miDraftFeedbackReason" disabled aria-label="เหตุผลการประเมิน draft"></select></label><div class="mi-draft-feedback-actions"><button class="mi-draft-button is-secondary" id="miDraftFeedbackSave" type="button" disabled aria-disabled="true">บันทึกผลประเมิน</button><p class="mi-draft-feedback-status" id="miDraftFeedbackStatus" role="status" aria-live="polite">ติ๊ก review ก่อนประเมิน</p></div></div><div class="mi-draft-actions"><button class="mi-draft-button" id="miDraftCopy" type="button" disabled aria-disabled="true">COPY LOCKED</button><p class="mi-draft-audit" id="miDraftAudit" role="status" aria-live="polite">View audit ยังไม่บันทึก</p></div>`;
    detail.appendChild(card);

    byId("miDraftReview")?.addEventListener("change",()=>{
      syncFeedbackControls();
      syncCopyButton();
    });
    card.querySelectorAll("[data-feedback-outcome]").forEach((button)=>{
      button.addEventListener("click",()=>selectFeedbackOutcome(button.dataset.feedbackOutcome));
    });
    byId("miDraftFeedbackReason")?.addEventListener("change",(event)=>{
      state.feedbackReason=clean(event.target?.value);
      syncFeedbackControls();
    });
    byId("miDraftFeedbackSave")?.addEventListener("click",submitDraftFeedback);
    byId("miDraftCopy")?.addEventListener("click",copyDraft);
    return card;
  }

  function safeDraftContract(payload){
    const draft=payload?.ai?.suggested_reply||{};
    const guards=draft.guardrails||{};
    const continuity=payload?.ai?.continuity_status||{};
    return payload?.identity?.status==="canonical"
      &&payload?.identity?.verified===true
      &&draft.schema===draftSchema
      &&draft.mode==="operator_draft"
      &&draft.available===true
      &&clean(draft.text).length>0
      &&draft.send_allowed===false
      &&draft.requires_owner_review===true
      &&guards.customer_auto_send===false
      &&guards.business_truth_claims===false
      &&guards.memory_is_context_only===true
      &&continuity.source_status==="live"
      &&continuity.freshness==="fresh"
      &&continuity.context_only===true
      &&continuity.live_truth_wins===true;
  }

  function draftReason(reason){
    const labels={
      phase4_mode_off:"Operator Draft ยังปิดอยู่ใน rollout mode",
      verified_canonical_identity_required:"ต้องยืนยัน Canonical Client ก่อน",
      high_confidence_identity_required:"Identity confidence ยังไม่สูงพอ",
      customer_safe_name_required:"ยังไม่มีชื่อที่ปลอดภัยสำหรับ customer copy",
      reviewed_returning_relationship_required:"Relationship evidence ยังไม่ผ่าน review",
      verified_open_thread_required:"ยังไม่มี verified open thread ให้ต่อบทสนทนา",
      active_matrix_required:"Conversation Matrix ยังไม่ active",
      continuity_authority_boundary_required:"Matrix authority boundary ยังไม่ครบ",
      matrix_version_required:"Matrix version ยังไม่พร้อม",
      open_conversation_stage_required:"Conversation stage ไม่ใช่เคสที่เปิดอยู่",
      continuity_review_required:"Conversation Matrix ต้อง review ก่อน",
      continuity_stale:"Conversation Matrix stale · ต้อง refresh",
      matrix_freshness_unavailable:"ตรวจ freshness ของ Matrix ไม่ได้",
      matrix_stale_or_expired:"Conversation Matrix หมดอายุหรือเก่าเกินกำหนด",
      line_channel_required:"Draft นี้ใช้ได้เฉพาะ LINE / LIFF context",
      canonical_client_not_resolved:"ยัง resolve Canonical Client ไม่ได้"
    };
    return labels[clean(reason)]||"Safety gates ยังไม่ครบ · ไม่แสดง customer draft";
  }

  function formatMoment(value){
    const parsed=new Date(clean(value));
    if(!clean(value)||Number.isNaN(parsed.getTime()))return "—";
    try{return parsed.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"})}catch(_){return parsed.toISOString()}
  }

  function resetDraftUi(reason="กำลังอ่าน Conversation Matrix และ safety gates…"){
    ensureDraftUi();
    state.intelligence=null;
    state.draftText="";
    state.draftAvailable=false;
    state.runtimeCopyAllowed=false;
    state.viewAudited=false;
    state.feedbackOutcome="";
    state.feedbackReason="";
    state.feedbackRecorded=false;
    state.feedbackReceipt="";
    state.feedbackSubmitting=false;
    state.copying=false;
    const review=byId("miDraftReview");
    if(review){review.checked=false;review.disabled=true}
    const text=byId("miDraftText");
    if(text){text.value="";text.disabled=true}
    setText("miDraftState","LOCKED");
    setTone("miDraftState","bad");
    setText("miDraftReason",reason);
    setText("miDraftMatrix","WAITING");
    setText("miDraftKill","UNKNOWN · COPY LOCKED");
    setText("miDraftAudit","View audit ยังไม่บันทึก");
    setText("miDraftFeedbackStatus","ติ๊ก review ก่อนประเมิน");
    setTone("miDraftCard","warn");
    syncFeedbackControls();
    syncCopyButton();
  }

  function syncCopyButton(){
    const button=byId("miDraftCopy");
    const review=byId("miDraftReview");
    if(!button)return;
    const enabled=state.draftAvailable
      &&state.runtimeCopyAllowed
      &&state.viewAudited
      &&review?.checked===true
      &&state.feedbackRecorded
      &&clean(state.feedbackReceipt).length>0
      &&state.feedbackOutcome!=="rejected"
      &&state.copying===false;
    button.disabled=!enabled;
    button.setAttribute("aria-disabled",enabled?"false":"true");
    if(state.copying)button.textContent="AUDITING…";
    else if(enabled)button.textContent="COPY REVIEWED DRAFT";
    else button.textContent="COPY LOCKED";
  }

  async function recordDraftAudit(action,clientId,ownerReviewConfirmed=false,extra={}){
    const payload={action,client_id:clientId,...extra};
    if(ownerReviewConfirmed)payload.owner_review_confirmed=true;
    return api(auditPath,{
      method:"POST",
      body:JSON.stringify(payload)
    });
  }

  function selectFeedbackOutcome(outcome){
    const next=clean(outcome);
    if(!["accepted","needs_edit","rejected"].includes(next)||state.feedbackRecorded||state.feedbackSubmitting)return;
    state.feedbackOutcome=next;
    state.feedbackReason=next==="accepted"?"ready_as_is":"";
    syncFeedbackControls();
    syncCopyButton();
  }

  function syncFeedbackControls(){
    const review=byId("miDraftReview");
    const ready=state.draftAvailable
      &&state.viewAudited
      &&review?.checked===true
      &&state.feedbackRecorded===false
      &&state.feedbackSubmitting===false;
    document.querySelectorAll("#miDraftFeedback [data-feedback-outcome]").forEach((button)=>{
      const selected=clean(button.dataset.feedbackOutcome)===state.feedbackOutcome;
      button.disabled=!ready;
      button.setAttribute("aria-pressed",selected?"true":"false");
      button.setAttribute("data-selected",selected?"true":"false");
    });

    const reasonWrap=byId("miDraftFeedbackReasonWrap");
    const select=byId("miDraftFeedbackReason");
    const choices=feedbackReasonLabels[state.feedbackOutcome]||[];
    if(reasonWrap)reasonWrap.hidden=!choices.length;
    if(select){
      const previous=state.feedbackReason;
      select.replaceChildren();
      const placeholder=document.createElement("option");
      placeholder.value="";
      placeholder.textContent="เลือกเหตุผล";
      select.appendChild(placeholder);
      choices.forEach(([value,label])=>{
        const option=document.createElement("option");
        option.value=value;
        option.textContent=label;
        select.appendChild(option);
      });
      select.value=choices.some(([value])=>value===previous)?previous:"";
      if(choices.length)state.feedbackReason=select.value;
      else if(state.feedbackOutcome!=="accepted")state.feedbackReason="";
      select.disabled=!ready||!choices.length;
    }

    const save=byId("miDraftFeedbackSave");
    const feedbackComplete=state.feedbackOutcome==="accepted"
      ?state.feedbackReason==="ready_as_is"
      :choices.some(([value])=>value===state.feedbackReason);
    const saveEnabled=ready&&feedbackComplete;
    if(save){
      save.disabled=!saveEnabled;
      save.setAttribute("aria-disabled",saveEnabled?"false":"true");
      save.textContent=state.feedbackSubmitting?"กำลังบันทึก…":state.feedbackRecorded?"บันทึกแล้ว":"บันทึกผลประเมิน";
    }
  }

  async function submitDraftFeedback(){
    const review=byId("miDraftReview");
    const clientId=clean(state.selected?.client_id);
    const choices=feedbackReasonLabels[state.feedbackOutcome]||[];
    const feedbackComplete=state.feedbackOutcome==="accepted"
      ?state.feedbackReason==="ready_as_is"
      :choices.some(([value])=>value===state.feedbackReason);
    if(!clientId||!state.draftAvailable||!state.viewAudited||review?.checked!==true||!feedbackComplete||state.feedbackRecorded||state.feedbackSubmitting)return;

    state.feedbackSubmitting=true;
    syncFeedbackControls();
    syncCopyButton();
    try{
      const result=await recordDraftAudit("feedback",clientId,true,{
        feedback_schema:feedbackSchema,
        outcome:state.feedbackOutcome,
        reason_code:state.feedbackReason
      });
      const copyEligible=state.feedbackOutcome!=="rejected";
      if(result?.feedback_schema!==feedbackSchema
        ||result?.operator_feedback_recorded!==true
        ||result?.copy_eligible!==copyEligible
        ||(copyEligible&&!clean(result?.feedback_receipt))
        ||(!copyEligible&&clean(result?.feedback_receipt)))throw new Error("feedback_receipt_invalid");
      state.feedbackRecorded=true;
      state.feedbackReceipt=copyEligible?clean(result.feedback_receipt):"";
      const copyState=state.feedbackOutcome==="rejected"
        ?"Draft ถูกปฏิเสธ · Copy ยังล็อก"
        :state.runtimeCopyAllowed
          ?"บันทึกแล้ว · Copy พร้อมหลัง quality decision"
          :"บันทึกแล้ว · Copy ยังล็อกโดย runtime control";
      setText("miDraftFeedbackStatus",`${copyState} · ไม่เก็บข้อความลูกค้า`);
    }catch(error){
      if(lower(error?.message)!=="unauthorized")setText("miDraftFeedbackStatus","บันทึกผลไม่สำเร็จ · Copy ยังล็อกแบบ fail-closed");
      state.feedbackRecorded=false;
      state.feedbackReceipt="";
      setTone("miDraftCard","bad");
    }finally{
      state.feedbackSubmitting=false;
      syncFeedbackControls();
      syncCopyButton();
    }
  }

  async function renderDraft(payload,clientId,selectionSeq){
    ensureDraftUi();
    state.intelligence=payload;
    const draft=payload?.ai?.suggested_reply||{};
    const matrix=payload?.ai?.continuity_status||{};
    const runtime=payload?.ai?.runtime_controls||{};
    const safe=safeDraftContract(payload);
    state.draftAvailable=safe;
    state.draftText=safe?clean(draft.text):"";
    state.runtimeCopyAllowed=runtime.status==="live"&&runtime.operator_copy_allowed===true;
    state.viewAudited=false;
    state.feedbackOutcome="";
    state.feedbackReason="";
    state.feedbackRecorded=false;
    state.feedbackReceipt="";
    state.feedbackSubmitting=false;

    const matrixBits=[
      clean(matrix.freshness).toUpperCase()||"UNKNOWN",
      `source ${clean(matrix.source_status)||"unknown"}`,
      Number(matrix.matrix_version)>0?`v${Number(matrix.matrix_version)}`:"",
      matrix.updated_at?`updated ${formatMoment(matrix.updated_at)}`:"",
      matrix.expires_at?`expires ${formatMoment(matrix.expires_at)}`:""
    ].filter(Boolean);
    setText("miDraftMatrix",matrixBits.join(" · "));

    const runtimeLabel=runtime.status!=="live"
      ?"UNKNOWN · COPY LOCKED"
      :state.runtimeCopyAllowed
        ?"CLEAR · LINE + GLOBAL"
        :`ACTIVE · ${runtime.all_mutations_kill_switch==="active"?"GLOBAL":"LINE"} · COPY LOCKED`;
    setText("miDraftKill",runtimeLabel);

    const text=byId("miDraftText");
    const review=byId("miDraftReview");
    if(text){text.value=state.draftText;text.disabled=!safe}
    if(review){review.checked=false;review.disabled=!safe}

    if(!safe){
      setText("miDraftState","UNAVAILABLE");
      setTone("miDraftState","bad");
      setText("miDraftReason",draftReason(draft.reason));
      setText("miDraftAudit","ไม่มี draft ที่ผ่าน safety contract · ไม่บันทึก copy audit");
      setText("miDraftFeedbackStatus","ไม่มี draft ที่ผ่าน safety contract · ไม่บันทึก feedback");
      setTone("miDraftCard","bad");
      syncFeedbackControls();
      syncCopyButton();
      return;
    }

    setText("miDraftState",state.runtimeCopyAllowed?"REVIEW ONLY":"COPY LOCKED");
    setTone("miDraftState",state.runtimeCopyAllowed?"ok":"bad");
    setText("miDraftReason","Draft จาก allowlisted continuity context เท่านั้น · Per ต้องตรวจ live truth ก่อนนำไปใช้ · ระบบนี้ส่งให้ลูกค้าไม่ได้");
    setText("miDraftAudit","กำลังบันทึก safe view audit…");
    setText("miDraftFeedbackStatus","รอ view audit และ owner review");
    setTone("miDraftCard",state.runtimeCopyAllowed?"ok":"warn");
    syncFeedbackControls();
    syncCopyButton();

    try{
      await recordDraftAudit("view",clientId,false);
      if(selectionSeq!==state.selectionSeq||clean(state.selected?.client_id)!==clientId)return;
      state.viewAudited=true;
      setText("miDraftAudit",state.runtimeCopyAllowed?"View audited · ติ๊ก review แล้วบันทึกผลประเมินเพื่อเปิด Copy":"View audited · ประเมินได้ แต่ Copy ถูกล็อกโดย runtime control");
      setText("miDraftFeedbackStatus","ติ๊ก review แล้วเลือกผลประเมิน");
    }catch(error){
      if(selectionSeq!==state.selectionSeq||lower(error?.message)==="unauthorized")return;
      state.viewAudited=false;
      setText("miDraftAudit","AUDIT UNAVAILABLE · Copy ถูกล็อกแบบ fail-closed");
      setText("miDraftFeedbackStatus","View audit ไม่สำเร็จ · Feedback และ Copy ถูกล็อก");
      setTone("miDraftCard","bad");
    }
    syncFeedbackControls();
    syncCopyButton();
  }

  async function copyDraft(){
    const review=byId("miDraftReview");
    const clientId=clean(state.selected?.client_id);
    if(!clientId||!state.draftAvailable||!state.runtimeCopyAllowed||!state.viewAudited||review?.checked!==true||!state.feedbackRecorded||!clean(state.feedbackReceipt)||state.feedbackOutcome==="rejected"||state.copying)return;
    state.copying=true;
    syncCopyButton();
    try{
      await recordDraftAudit("copy",clientId,true,{feedback_receipt:state.feedbackReceipt});
      if(!navigator.clipboard?.writeText)throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(state.draftText);
      setText("miDraftAudit","Copied · owner review + copy authorization audited");
      const button=byId("miDraftCopy");
      if(button)button.textContent="COPIED";
    }catch(error){
      const code=lower(error?.message);
      if(code==="operator_feedback_receipt_required"){
        state.feedbackOutcome="";
        state.feedbackReason="";
        state.feedbackRecorded=false;
        state.feedbackReceipt="";
        setText("miDraftFeedbackStatus","Feedback receipt หมดอายุหรือไม่ตรงกับ draft · กรุณาประเมินใหม่");
      }
      if(code!=="unauthorized")setText("miDraftAudit","Copy ไม่สำเร็จ · audit/clipboard gate ยังล็อกอยู่");
      setTone("miDraftCard","bad");
    }finally{
      state.copying=false;
      syncFeedbackControls();
      syncCopyButton();
    }
  }

  function memoryFromIntelligence(payload,record){
    const identity=payload?.identity||{};
    const relationship=payload?.relationship||{};
    const current=payload?.current_state||{};
    const membership=current.membership||{};
    const access=current.access||{};
    return {
      display_name:identity.display_name||recordName(record),
      verification_status:identity.verified===true?"verified":"review_required",
      relationship_tier:access.relationship_tier||relationship.relationship_state||membership.tier||"",
      membership_tier:membership.tier||"",
      membership_status:membership.status||"unknown",
      package_code:membership.package_code||"",
      renewal_due:membership.renewal_due||"",
      renewal_status:membership.renewal_status||"",
      access_status:access.status||"unknown",
      source:membership.source||access.source||"Client Intelligence facade"
    };
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
    resetDraftUi();
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
    const selectionSeq=++state.selectionSeq;
    state.selected=record;
    state.intelligence=null;
    renderRecords(state.records);
    setDetailVisible(true);
    paintLineage(record);

    if(record?.manual_public_only||!clean(record?.client_id)){
      setStatus("IDENTITY REVIEW · ต้อง resolve เป็น Canonical Client ก่อนดู membership/access","warn");
      return;
    }

    const clientId=clean(record.client_id);
    setStatus("กำลังอ่าน bounded member context + Conversation Matrix…","warn");
    try{
      const payload=prefetched||await api(`${intelligencePath}?client_id=${encodeURIComponent(clientId)}`);
      if(selectionSeq!==state.selectionSeq)return;
      if(clean(payload?.client_id)!==clientId)throw new Error("client_intelligence_mismatch");
      const memory=payload?.data_status==="empty"?null:memoryFromIntelligence(payload,record);
      paintMemory(record,memory);
      await renderDraft(payload,clientId,selectionSeq);
      if(selectionSeq!==state.selectionSeq)return;
      const ready=memory&&payload?.data_status==="live";
      setStatus(
        ready?"พร้อม · Client Intelligence + Matrix loaded":memory?"REVIEW · Projection degraded":"REVIEW · ไม่พบ bounded member context",
        ready?"ok":"warn"
      );
    }catch(error){
      if(selectionSeq!==state.selectionSeq||lower(error?.message)==="unauthorized")return;
      paintMemory(record,null);
      resetDraftUi("Client Intelligence อ่านไม่ได้ · Copy ถูกล็อกแบบ fail-closed");
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
      state.selectionSeq+=1;
      state.selected=null;
      state.memory=null;
      state.intelligence=null;
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
      const payload=await api(`${intelligencePath}?client_id=${encodeURIComponent(clientId)}`);
      if(clean(payload?.client_id)!==clientId)throw new Error("client_intelligence_mismatch");
      const identity=payload?.identity||{};
      const memory=payload?.data_status==="empty"?null:memoryFromIntelligence(payload,{});
      const record={
        client_id:clientId,
        client_name:identity.display_name||memory?.display_name||"Canonical Client",
        canonical_name:identity.display_name||memory?.display_name||"",
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

    ensureDraftUi();
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
