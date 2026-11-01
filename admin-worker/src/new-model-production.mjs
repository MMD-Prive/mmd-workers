// Private intake staging. This module never grants publication or model identity.
export const PREFIX = 'new-model-production/v1/';
export const MAX_BYTES = 25 * 1024 * 1024;
const fail = code => { throw Object.assign(new Error(code), {code}); };
export async function hash(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function storage(env) {
  const b=env.PRIVATE_MODEL_MEDIA;
  if(!b?.get || !b?.put || !b?.head || !b?.delete) fail('private_staging_unavailable');
  return b;
}
export async function registry(env, suffix='', init={}) {
  if(!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) fail('review_registry_unavailable');
  const table=env.AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS || 'MMD — Model Review Requests';
  const response=await (env.AIRTABLE_HTTP?.fetch?.bind(env.AIRTABLE_HTTP)||fetch)(
    'https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+encodeURIComponent(table)+suffix,
    {...init, headers:{authorization:'Bearer '+env.AIRTABLE_API_KEY,'content-type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(!response.ok) fail('review_registry_unavailable');
  return response.json();
}
export async function readBytes(response, expected, mime) {
  if(!response.ok || !Number.isSafeInteger(expected) || expected<1 || expected>MAX_BYTES || !response.body) fail('source_media_invalid');
  const reader=response.body.getReader(),parts=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>expected){await reader.cancel();fail('source_size_changed');}parts.push(value);}}
  finally {reader.releaseLock();}
  if(size!==expected)fail('source_size_changed');
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
  const valid=mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255
    :mime==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)
    :mime==='image/webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'
    :mime==='video/mp4'?size>=16&&ascii(4,8)==='ftyp':false;
  if(!valid)fail('source_mime_mismatch');return bytes;
}
const fieldsOf = record => {try{return JSON.parse(record.fields.payload_json);}catch{return null;}};
async function findRequest(env,id,api) {
  const page=await api(env,'?'+new URLSearchParams({filterByFormula:`{request_id}='${id}'`,maxRecords:'2'}));
  if(!Array.isArray(page.records)||page.records.length>1)fail('review_registry_conflict');
  return page.records[0]||null;
}
async function findSameContent(env,candidate,sha,bytes,api,bucket) {
  const needle=JSON.stringify({file_id:candidate.file_id}).slice(1,-1).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const page=await api(env,'?'+new URLSearchParams({filterByFormula:`AND(LEFT({request_id},4)='nmp_',FIND('${needle}',{payload_json}))`,pageSize:'100'}));
  if(!Array.isArray(page.records)||page.offset)fail('review_registry_conflict');
  const records=page.records.slice().sort((a,b)=>String(a.createdTime||a.fields.requested_at||'').localeCompare(String(b.createdTime||b.fields.requested_at||'')));
  for(const record of records){
    const p=fieldsOf(record),c=p?.source;
    if(p?.schema!=='mmd.new_model_production.v1'||c?.root_id!==candidate.root_id||c?.file_id!==candidate.file_id||c?.visibility!==candidate.visibility||c?.mimeType!==candidate.mimeType||p.sha256!==sha||p.bytes!==bytes)continue;
    if(await hash(JSON.stringify([c.root_id,c.file_id,c.version,c.visibility]))!==p.intake_id||record.fields.request_id!=='nmp_'+p.intake_id||p.private_staging_key!==PREFIX+'originals/'+p.intake_id+'/'+sha)fail('review_registry_conflict');
    const head=await bucket.head(p.private_staging_key);
    if(!head||head.size!==bytes||head.customMetadata?.sha256!==sha||head.customMetadata?.intake_id!==p.intake_id)fail('staging_object_missing');
    return {record,payload:p};
  }
  return null;
}
export async function stageMedia(env,candidate,actor,readSource,deps={}) {
  const b=storage(env),api=deps.registry||registry;
  const id=await hash(JSON.stringify([candidate.root_id,candidate.file_id,candidate.version,candidate.visibility]));
  const receiptKey=PREFIX+'receipts/'+id+'.json',legacyLockKey=PREFIX+'locks/'+id,lockKey=PREFIX+'locks/source-'+await hash(JSON.stringify([candidate.root_id,candidate.file_id,candidate.visibility]));
  const old=await b.get(receiptKey);
  if(old){const receipt=await old.json();if(receipt.id!==id)fail('staging_receipt_invalid');const head=await b.head(receipt.key);if(!head||head.customMetadata?.sha256!==receipt.sha256||head.customMetadata?.intake_id!==(receipt.canonical_intake_id||id))fail('staging_object_missing');return {id,state:'already_staged'};}
  const now=deps.now || Date.now,leaseMs=180000,nonce=crypto.randomUUID();
  const legacy=await b.get(legacyLockKey),legacyData=legacy?await legacy.json():null;
  if(legacy&&!legacyData?.released&&(legacyData?.expires_at ?? Date.parse(legacyData?.at||'')+leaseMs)>now())return {id,state:'busy_or_recovery_required',retry_after_ms:30000};
  const prior=await b.get(lockKey),priorData=prior?await prior.json():null;
  const priorUntil=priorData?.expires_at ?? Date.parse(priorData?.at || '')+leaseMs;
  if(prior&&!priorData?.released&&(!Number.isFinite(priorUntil)||priorUntil>now()))return {id,state:'busy_or_recovery_required',retry_after_ms:30000};
  const claim=()=>({nonce,actor:actor.id,at:new Date(now()).toISOString(),expires_at:now()+leaseMs,released:false});
  const lock=await b.put(lockKey,JSON.stringify(claim()),{onlyIf:prior?{etagMatches:prior.etag}:{etagDoesNotMatch:'*'}});
  if(!lock)return {id,state:'busy_or_recovery_required',retry_after_ms:30000};
  const renew=async()=>{
    const current=await b.get(lockKey),value=current?await current.json():null;
    if(value?.nonce!==nonce||value.released||value.expires_at<=now())fail('staging_claim_lost');
    if(!await b.put(lockKey,JSON.stringify(claim()),{onlyIf:{etagMatches:current.etag}}))fail('staging_claim_lost');
  };
  const reuse=async same=>{
    await renew();const p=same.payload;
    const receipt={id,canonical_intake_id:p.intake_id,review_record_id:same.record.id,sha256:p.sha256,key:p.private_staging_key};
    if(!await b.put(receiptKey,JSON.stringify(receipt),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}}))fail('staging_claim_lost');
    return {id,state:'already_staged',review_record_id:same.record.id,canonical_intake_id:p.intake_id};
  };
  try {
    const preparedKey=PREFIX+'prepared/'+id+'.json',fingerprint=await hash(JSON.stringify(candidate));
    const preparedObj=await b.get(preparedKey);let prepared=preparedObj?await preparedObj.json():null;
    if(prepared){
      const head=await b.head(prepared.key);
      if(prepared.id!==id||prepared.source_fingerprint!==fingerprint||!/^[a-f0-9]{64}$/.test(prepared.sha256)||prepared.key!==PREFIX+'originals/'+id+'/'+prepared.sha256||!head||head.size!==prepared.bytes||head.customMetadata?.sha256!==prepared.sha256||head.customMetadata?.intake_id!==id)fail('prepared_object_invalid');
    }else{
      const bytes=await readSource(candidate),sha=await hash(bytes),key=PREFIX+'originals/'+id+'/'+sha;
      const same=await findSameContent(env,candidate,sha,bytes.length,api,b);if(same)return await reuse(same);
      await b.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},sha256:sha,httpMetadata:{contentType:candidate.mimeType,cacheControl:'private, no-store'},customMetadata:{sha256:sha,intake_id:id,visibility:candidate.visibility}});
      const head=await b.head(key);
      if(!head||head.size!==bytes.length||head.customMetadata?.sha256!==sha||head.customMetadata?.intake_id!==id)fail('staging_object_unverified');
      prepared={id,key,sha256:sha,bytes:bytes.length,source_fingerprint:fingerprint};
      await renew();
      if(!await b.put(preparedKey,JSON.stringify(prepared),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}}))fail('staging_claim_lost');
      if(deps.deferRegistry)return {id,state:'prepared_private'};
    }
    const {key,sha256:sha}=prepared;
    const same=await findSameContent(env,candidate,sha,prepared.bytes,api,b);if(same)return await reuse(same);
    const requestId='nmp_'+id;
    let record=await findRequest(env,requestId,api);
    const payload={schema:'mmd.new_model_production.v1',intake_id:id,source:candidate,private_staging_key:key,sha256:sha,bytes:prepared.bytes,requires_per_approval:true,canonical_model_matching_required:true,public_safe:false,private_safe:false};
    if(!record){
      await renew();
      await api(env,'',{method:'POST',body:JSON.stringify({fields:{request_id:requestId,request_type:'media',request_status:'pending_review',requested_by:'owner:'+String(actor.id).slice(0,120),requested_at:new Date().toISOString(),payload_json:JSON.stringify(payload)},typecast:false})});
      record=await findRequest(env,requestId,api);
    }
    const saved=record&&fieldsOf(record);
    if(!record?.id||saved?.intake_id!==id||saved?.sha256!==sha||saved?.private_staging_key!==key)fail('review_readback_failed');
    // Existing review decisions are never reset on retries.
    await renew();
    await b.put(receiptKey,JSON.stringify({id,review_record_id:record.id,sha256:sha,key}),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
    return {id,state:'pending_review',review_record_id:record.id};
  } finally {
    // Conditional release cannot erase a newer claim after an interrupted request.
    const current=await b.get(lockKey).catch(()=>null),value=current?await current.json().catch(()=>null):null;
    if(value?.nonce===nonce)await b.put(lockKey,JSON.stringify({...value,released:true,expires_at:now()}),{onlyIf:{etagMatches:current.etag}}).catch(()=>null);
  }
}
// Queue edits are proposals only. The authoritative Model link is never written.
const recordId = value => /^rec[A-Za-z0-9]{14}$/.test(value || '');
function pending(record, roots) {
  const p=fieldsOf(record),f=record?.fields;
  if(!p||p.schema!=='mmd.new_model_production.v1'||!roots.includes(p.source?.root_id)||f.request_status!=='pending_review'||f.request_id!=='nmp_'+p.intake_id||p.public_safe!==false||p.private_safe!==false||p.requires_per_approval!==true||p.canonical_model_matching_required!==true||f.Model?.length||f.linked_media_assets?.length)fail('review_not_pending');
  return p;
}
async function queueItem(record,p) {
  return {id:record.id,intake_id:p.intake_id,category:p.source.category,source_visibility:p.source.visibility,visibility:p.review_draft?.visibility||p.source.visibility,mime:p.source.mimeType,bytes:p.bytes,status:'pending_review',canonical_model_matching_required:true,model:p.review_draft?.model||null,registered_draft:Boolean(p.review_draft?.registration),revision:await hash(record.fields.payload_json)};
}
export async function reviewQueue(env,deps={}) {
  const roots=deps.allowedRootIds||[],params=new URLSearchParams({filterByFormula:"AND(LEFT({request_id},4)='nmp_',{request_status}='pending_review'"+(roots.length?",OR("+roots.map(root=>"FIND('"+root+"',{payload_json})").join(',')+")":'')+")",pageSize:'100'});
  if(deps.cursor){if(typeof deps.cursor!=='string'||deps.cursor.length>500)fail('queue_cursor_invalid');params.set('offset',deps.cursor);}
  const page=await (deps.registry||registry)(env,'?'+params);
  if(!Array.isArray(page.records))fail('review_registry_unavailable');
  const items=[];
  for(const r of page.records){const p=fieldsOf(r);if(!p||p.schema!=='mmd.new_model_production.v1'||(roots.length&&!roots.includes(p.source?.root_id)))continue;items.push(await queueItem(r,p));}
  return {items,cursor:page.offset||null,incomplete:Boolean(page.offset),publication:false};
}
async function modelRegistry(env,suffix) {
  const table=env.AIRTABLE_TABLE_MODELS||'Models';
  const target=new URL('https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+encodeURIComponent(table)+suffix);
  // Airtable's single-record endpoint does not accept the list-only fields[] parameter.
  if(suffix.startsWith('?'))for(const field of ['working_name','nickname','unique_key'])target.searchParams.append('fields[]',field);
  const response=await (env.AIRTABLE_HTTP?.fetch?.bind(env.AIRTABLE_HTTP)||fetch)(target.toString(),{headers:{authorization:'Bearer '+env.AIRTABLE_API_KEY},redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(!response.ok)fail('canonical_model_unavailable');return response.json();
}
function modelItem(r){const f=r.fields||{};return {id:r.id,name:String(f.working_name||f.display_name||f.model_name||f.nickname||f.name||f.Name||''),key:String(f.model_lookup_key||f.unique_key||f.model_code||'')};}
export async function reviewModels(env,input,deps={}) {
  const q=String(input.query||'').trim();if(q.length<2||q.length>80)fail('model_query_invalid');
  const escaped=q.toLowerCase().replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const params=new URLSearchParams({pageSize:'30',filterByFormula:"OR("+['working_name','nickname','unique_key'].map(f=>"FIND('"+escaped+"',LOWER({"+f+"}&''))").join(',')+")"});
  const page=await (deps.models||modelRegistry)(env,'?'+params);
  return {items:(page.records||[]).map(modelItem).filter(x=>x.name),incomplete:Boolean(page.offset),publication:false};
}
export async function reviewMedia(env,input,deps={}) {
  if(!recordId(input.record_id))fail('review_id_invalid');
  const r=await (deps.registry||registry)(env,'/'+input.record_id),p=pending(r,deps.allowedRootIds||[]);
  if(!/^[a-f0-9]{64}$/.test(p.intake_id)||!/^[a-f0-9]{64}$/.test(p.sha256)||p.private_staging_key!==PREFIX+'originals/'+p.intake_id+'/'+p.sha256||!['image/jpeg','image/png','image/webp','video/mp4'].includes(p.source.mimeType)||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>MAX_BYTES)fail('private_media_invalid');
  const object=await storage(env).get(p.private_staging_key);
  if(!object||object.size!==p.bytes||object.customMetadata?.sha256!==p.sha256||object.customMetadata?.intake_id!==p.intake_id||object.customMetadata?.visibility!==p.source.visibility||object.httpMetadata?.contentType!==p.source.mimeType)fail('private_media_invalid');
  return new Response(object.body,{headers:{'content-type':p.source.mimeType,'content-length':String(p.bytes),'cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow','content-security-policy':"default-src 'none'; sandbox"}});
}
export async function saveReviewDraft(env,input,actor,deps={}) {
  if(!recordId(input.record_id)||!['review','hidden'].includes(input.visibility)||!(/^[a-f0-9]{64}$/.test(input.revision||''))||(input.model_id!==null&&!recordId(input.model_id)))fail('review_input_invalid');
  const b=storage(env),key=PREFIX+'review-locks/'+input.record_id,nonce=crypto.randomUUID();
  // A lease is never stolen: uncertain writes fail closed until the next retry.
  const old=await b.get(key);let condition={etagDoesNotMatch:'*'};
  if(old){const lease=await old.json();if(lease.until>Date.now())fail('review_busy');condition={etagMatches:old.etag};}
  const lease=await b.put(key,JSON.stringify({nonce,until:Date.now()+60000}),{onlyIf:condition});if(!lease)fail('review_busy');
  try{
    const reg=deps.registry||registry,r=await reg(env,'/'+input.record_id),p=pending(r,deps.allowedRootIds||[]);
    if(p.review_draft?.registration)fail('review_conflict_registered_read_only');
    if(await hash(r.fields.payload_json)!==input.revision)fail('review_conflict');
    let model=null;if(input.model_id){const canonical=await (deps.models||modelRegistry)(env,'/'+input.model_id);model=modelItem(canonical);if(canonical.id!==input.model_id||!model.name)fail('canonical_model_unavailable');}
    const prior=p.review_draft;
    if(prior?.visibility===input.visibility&&(prior.model?.id||null)===(model?.id||null))return {item:await queueItem(r,p),publication:false};
    p.review_draft={visibility:input.visibility,model,updated_by:actor.id||'owner',updated_at:new Date().toISOString()};
    const fence=await b.get(key);if(!fence)fail('review_busy');const currentLease=await fence.json();if(currentLease.nonce!==nonce||currentLease.until<Date.now()+15000)fail('review_busy');
    const saved=await reg(env,'/'+input.record_id,{method:'PATCH',body:JSON.stringify({fields:{payload_json:JSON.stringify(p)}})});
    const verified=pending(saved,deps.allowedRootIds||[]);if(JSON.stringify(verified)!==JSON.stringify(p))fail('review_save_unverified');
    return {item:await queueItem(saved,verified),publication:false};
  }finally{const lock=await b.get(key);if(lock&&(await lock.json()).nonce===nonce)await b.put(key,JSON.stringify({nonce,until:0}),{onlyIf:{etagMatches:lock.etag}}).catch(()=>null);}
}

// Owner-only, read-only grouped inspection. Never returns private storage keys.
const DRAFT_TYPE='new_model_creation_proposal',CASE_TYPE='model_matching_exception';
const driveId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{10,100}$/.test(value);
const sameIds=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&new Set(a).size===a.length&&a.every(id=>b.includes(id));
const caseReasons=new Set(['name_only_or_different_folder_scope','registry_folder_id_conflict','folder_has_no_model_identity']);
const modelReadFields=['working_name','unique_key','status','requires_per_approval','catalog_visibility','canonical_profile_status','registry_record_type','intake_gate_status','visibility_review_status','client_visibility_status','drive_folder_id','source_folder','available_now','can_work_public','can_work_private','approved_for_private_sales','Public Search Enabled','Preview Image Approved'];
const assetReadFields=['media_id','Model','media_type','media_visibility','asset_role','review_status','public_safe','private_safe','flash_safe','teaser_safe','file_type','file_size_bytes','r2_bucket','private_original_key','MMD — Model Review Requests'];
function draftGroup(r,roots){
  const p=fieldsOf(r),f=r?.fields,isModel=f?.request_type===DRAFT_TYPE;
  if(!recordId(r?.id)||!p||!roots.includes(p.source?.root_id)||f.request_status!=='pending_review'||p.proposal_status!=='pending_review'||p.schema!==(isModel?'mmd.new_model_creation_proposal.v1':'mmd.model_matching_exception.v1')||(!isModel&&f.request_type!==CASE_TYPE)||p.public_safe!==false||p.private_safe!==false||p.requires_per_approval!==true||p.canonical_model_matching_required!==true||p.create_canonical_model!==false||p.auto_create_allowed!==false||p.publish_allowed!==false||!driveId(p.source.folder_id)||typeof p.source.folder_path!=='string'||p.source.folder_path.length>2048||!/^[a-f0-9]{64}$/.test(p.proposal_id))fail('draft_review_state_changed');
  const ids=p.media?.review_record_ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>!recordId(id))||new Set(ids).size!==ids.length||p.media.count!==ids.length||!Array.isArray(p.media.intake_ids)||p.media.intake_ids.length!==ids.length||p.media.intake_ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))||new Set(p.media.intake_ids).size!==ids.length)fail('draft_review_state_changed');
  if(isModel){const d=p.draft_registration;if(!d||d.status!=='pending_review'||!recordId(d.model_record_id)||d.model_operational_status!=='inactive'||d.profile_review_status!=='Needs review'||d.identity_verified!==false||d.model_activation_approved!==false||d.media_approved!==false||d.public_safe!==false||d.private_safe!==false||d.requires_per_approval!==true||d.linked_media_count!==ids.length||!sameIds(f.Model,[d.model_record_id])||!sameIds(f.linked_media_assets,d.media_asset_record_ids)||d.media_asset_record_ids.length!==ids.length||d.media_asset_record_ids.some(id=>!recordId(id))||typeof p.proposed_model?.working_name!=='string'||p.proposed_model.identity_verified!==false)fail('draft_review_state_changed');}
  else if(!caseReasons.has(p.reason)||f.Model?.length||f.linked_media_assets?.length)fail('draft_review_state_changed');
  return {record:r,p,isModel};
}
function groupItem(g){const {record:r,p,isModel}=g;return {id:r.id,kind:isModel?'model':'exception',model_id:isModel?p.draft_registration.model_record_id:null,name:isModel?p.proposed_model.working_name:p.case_name,category:p.source.category,folder_id:p.source.folder_id,source_path:p.source.folder_path,media_count:p.media.count,status:'pending_review',reason:isModel?null:p.reason,summary:isModel?'ชื่อร่างจากโฟลเดอร์ · ยังไม่ยืนยันตัวตน':p.summary_th,publication:false};}
export async function draftReviewQueue(env,input={},deps={}){
  if(input.cursor&&(typeof input.cursor!=='string'||input.cursor.length>500))fail('queue_cursor_invalid');
  const params=new URLSearchParams({pageSize:'100',filterByFormula:"AND({request_status}='pending_review',OR({request_type}='new_model_creation_proposal',{request_type}='model_matching_exception'))"});if(input.cursor)params.set('offset',input.cursor);
  const page=await (deps.registry||registry)(env,'?'+params);if(!Array.isArray(page.records))fail('review_registry_unavailable');
  const items=[],groups=[],members=new Set(),models=new Set(),scopes=new Set();for(const r of page.records){const p=fieldsOf(r);if(!deps.allowedRootIds?.includes(p?.source?.root_id))continue;const g=draftGroup(r,deps.allowedRootIds),scope=p.source.root_id+'|'+p.source.folder_id;if(p.media.review_record_ids.some(id=>members.has(id))||(g.isModel&&(models.has(p.draft_registration.model_record_id)||scopes.has(scope))))fail('draft_review_state_changed');for(const id of p.media.review_record_ids)members.add(id);if(g.isModel){models.add(p.draft_registration.model_record_id);scopes.add(scope);}groups.push(g);items.push(groupItem(g));}
  // Read latest persisted outcomes, not media approvals. Bound concurrent R2 reads.
  let next=0;await Promise.all(Array.from({length:Math.min(6,groups.length)},async()=>{for(;;){const i=next++;if(i>=groups.length)return;const g=groups[i];if(!g.isModel)continue;const {log}=await readModelInspection(env,g,deps),last=log.entries.at(-1);Object.assign(items[i],{inspection_result:last?.result||'unreviewed',inspection_count:log.entries.length,inspection_updated_at:last?.at||null});}}));
  return {items,cursor:page.offset||null,publication:false,read_only:true};
}
async function readDraftTable(env,kind,ids,deps){
  if(!ids.length||ids.length>100||ids.some(id=>!recordId(id))||new Set(ids).size!==ids.length)fail('draft_members_invalid');
  const params=new URLSearchParams({pageSize:'100',filterByFormula:'OR('+ids.map(id=>"RECORD_ID()='"+id+"'").join(',')+')'});
  const fields=kind==='models'?modelReadFields:kind==='assets'?assetReadFields:[];for(const f of fields)params.append('fields[]',f);
  const table=kind==='models'?(env.AIRTABLE_TABLE_MODELS||'Models'):kind==='assets'?(env.AIRTABLE_TABLE_MODEL_MEDIA||'MMD — Model Media Assets'):null;
  const page=deps.readTable?await deps.readTable(kind,ids):table?await registry({...env,AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS:table},'?'+params):await (deps.registry||registry)(env,'?'+params);
  if(!Array.isArray(page.records)||page.offset||page.records.length!==ids.length||!sameIds(page.records.map(r=>r.id),ids))fail('draft_review_state_changed');return new Map(page.records.map(r=>[r.id,r]));
}
async function loadDraftReview(env,input,deps={}){
  if(!recordId(input.record_id))fail('review_id_invalid');
  const g=draftGroup(await (deps.registry||registry)(env,'/'+input.record_id),deps.allowedRootIds||[]),{p,isModel}=g;
  const reviews=await readDraftTable(env,'reviews',p.media.review_record_ids,deps);
  let model=null,assets=null;
  if(isModel){
    const id=p.draft_registration.model_record_id,loaded=await readDraftTable(env,'models',[id],deps),f=loaded.get(id).fields;
    if(f.working_name!==p.proposed_model.working_name||f.unique_key!=='nmp_draft_'+p.proposal_id||f.drive_folder_id!==p.source.folder_id||f.status!=='inactive'||f.requires_per_approval!==true||f.catalog_visibility!=='Hidden'||f.canonical_profile_status!=='Needs review'||f.registry_record_type!=='Intake Candidate'||f.intake_gate_status!=='Source Review'||f.visibility_review_status!=='pending_review'||f.client_visibility_status!=='hidden'||['available_now','can_work_public','can_work_private','approved_for_private_sales','Public Search Enabled','Preview Image Approved'].some(k=>f[k]===true))fail('draft_review_state_changed');
    model={id,name:f.working_name,key:f.unique_key,operational_status:'inactive',profile_review:'Needs review',catalog_visibility:'Hidden',identity_verified:false};
    assets=await readDraftTable(env,'assets',p.draft_registration.media_asset_record_ids,deps);
  }
  const media=[];
  for(let i=0;i<p.media.review_record_ids.length;i++){
    const id=p.media.review_record_ids[i],r=reviews.get(id),v=pending(r,deps.allowedRootIds||[]),source=v.source;
    if(v.intake_id!==p.media.intake_ids[i]||source.root_id!==p.source.root_id||source.category!==p.source.category||!Array.isArray(source.ancestry)||source.ancestry[0]!==source.root_id||!source.ancestry.includes(p.source.folder_id)||v.private_staging_key!==PREFIX+'originals/'+v.intake_id+'/'+v.sha256||!recordId(id)||!driveId(source.file_id)||!['image/jpeg','image/png','image/webp','video/mp4'].includes(source.mimeType)||!Number.isSafeInteger(v.bytes)||v.bytes<1||v.bytes>MAX_BYTES||v.review_draft?.follow_up?.review_request_record_id!==g.record.id||v.review_draft.follow_up.proposal_id!==p.proposal_id)fail('draft_review_state_changed');
    if(isModel){const reg=v.review_draft.registration,a=assets.get(reg?.media_asset_record_id),f=a?.fields;if(!reg||reg.status!=='draft_linked_pending_review'||reg.model_record_id!==model.id||reg.source_proposal_record_id!==g.record.id||reg.model_activation_approved!==false||reg.media_approved!==false||reg.identity_verified!==false||reg.public_safe!==false||reg.private_safe!==false||reg.requires_per_approval!==true||v.review_draft.model?.id!==model.id||v.review_draft.model_status!=='pending_review'||!f||f.media_id!=='nmp_pending_asset_'+v.intake_id||!sameIds(f.Model,[model.id])||!sameIds(f['MMD — Model Review Requests'],[g.record.id])||f.review_status!=='pending_review'||f.media_type!=='intake_pending_original'||f.asset_role!=='pending_model_review'||f.media_visibility!=='hidden'||['public_safe','private_safe','flash_safe','teaser_safe'].some(k=>f[k]===true)||f.r2_bucket!=='mmd-private-model-media'||f.private_original_key!==v.private_staging_key||f.file_type!==source.mimeType||f.file_size_bytes!==v.bytes)fail('draft_review_state_changed');}
    else if(v.review_draft.model!==null||v.review_draft.registration)fail('draft_review_state_changed');
    const evidence=!isModel?p.evidence?.files?.find(x=>x.review_record_id===id):null;
    if(!isModel&&(!evidence||evidence.file_id!==source.file_id||evidence.source_parent_verified!==true||!Array.isArray(evidence.parent_ids)||!evidence.parent_ids.includes(source.ancestry.at(-1))))fail('draft_review_state_changed');
    media.push({id,intake_id:v.intake_id,mime:source.mimeType,bytes:v.bytes,visibility:v.review_draft.visibility||source.visibility,source_visibility:source.visibility,file_id:source.file_id,file_name:evidence?.file_name||null,source_path:v.review_draft.matching?.source_path||p.source.folder_path,status:'pending_review'});
  }
  if(isModel&&!sameIds(media.map(m=>reviews.get(m.id)).map(r=>fieldsOf(r).review_draft.registration.media_asset_record_id),p.draft_registration.media_asset_record_ids))fail('draft_review_state_changed');
  const candidates=!isModel?(Array.isArray(p.evidence?.registry_candidates)?p.evidence.registry_candidates:[]).slice(0,20).map(c=>({id:recordId(c.id)?c.id:null,name:String(c.name||''),key:String(c.key||''),source_path:String(c.path||''),folder_id:driveId(c.folder_id)?c.folder_id:null,status:String(c.status||'')})):[];
  const audit=isModel?await readModelInspection(env,g,deps):null;
  return {group:g,audit,detail:{item:groupItem(g),model,media,inspection:audit?await inspectionView(g,audit.log):null,evidence:{source_folder_id:p.source.folder_id,source_path:p.source.folder_path,observed_paths:Array.isArray(p.source.observed_media_paths)?p.source.observed_media_paths.filter(x=>typeof x==='string'&&x.length<=2048).slice(0,100):[p.source.folder_path],recorded_at:p.created_at,identity_verified:false,summary:isModel?'ชื่อจากป้ายโฟลเดอร์ ยังต้องตรวจตัวตนและอนุมัติโปรไฟล์':p.summary_th,reason:isModel?null:p.reason,canonical_folder_lookup:!isModel?p.evidence?.canonical_folder_lookup||null:null,registry_candidates:candidates},read_only:true,publication:false}};
}
export async function draftReviewDetail(env,input,deps={}){return (await loadDraftReview(env,input,deps)).detail;}

// Inspection evidence is an independent private ledger, never an approval field.
const inspectionResults=new Set(['checked_pending_approval','needs_more_evidence','needs_correction']);
const operationId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const INSPECTION_LIMIT=100,INSPECTION_BYTES=256000;
async function readModelInspection(env,g,deps){
  const bucket=deps.inspectionBucket||storage(env),key=PREFIX+'model-inspections/'+g.record.id+'.json',object=await bucket.get(key);
  const log=object?await (async()=>{if(object.size>INSPECTION_BYTES)fail('inspection_history_invalid');try{return await object.json();}catch{fail('inspection_history_invalid');}})():{schema:'mmd.draft_model_inspection.v1',group_id:g.record.id,proposal_id:g.p.proposal_id,model_id:g.p.draft_registration.model_record_id,entries:[]};
  if(log?.schema!=='mmd.draft_model_inspection.v1'||log.group_id!==g.record.id||log.proposal_id!==g.p.proposal_id||log.model_id!==g.p.draft_registration.model_record_id||!Array.isArray(log.entries)||log.entries.length>INSPECTION_LIMIT||Object.keys(log).some(k=>!['schema','group_id','proposal_id','model_id','entries'].includes(k)))fail('inspection_history_invalid');
  const seen=new Set();for(const e of log.entries){if(!e||!operationId(e.operation_id)||seen.has(e.operation_id)||!inspectionResults.has(e.result)||typeof e.reason!=='string'||!e.reason.trim()||e.reason.length>1000||typeof e.actor!=='string'||!e.actor||e.actor.length>120||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))||!/^[a-f0-9]{64}$/.test(e.submission_revision||'')||!/^[a-f0-9]{64}$/.test(e.source_revision||'')||Object.keys(e).some(k=>!['operation_id','result','reason','actor','at','submission_revision','source_revision'].includes(k)))fail('inspection_history_invalid');seen.add(e.operation_id);}
  return {bucket,key,etag:object?.etag,log};
}
async function inspectionView(g,log){
  const history=log.entries.map(({operation_id,result,reason,actor,at})=>({operation_id,result,reason,actor,at}));
  return {revision:await hash(JSON.stringify([g.record.fields.payload_json,log])),current:history.at(-1)||null,history,can_save:true,history_limit:INSPECTION_LIMIT};
}
export async function saveDraftInspection(env,input,actor,deps={}){
  if(!recordId(input.record_id)||!operationId(input.operation_id)||!/^[a-f0-9]{64}$/.test(input.revision||'')||!inspectionResults.has(input.result)||typeof input.reason!=='string'||!input.reason.trim()||input.reason.trim().length>1000)fail('inspection_input_invalid');
  const {group:g,audit}=await loadDraftReview(env,input,deps);if(!g.isModel)fail('inspection_model_invalid');
  const reason=input.reason.trim(),reviewer=String(actor.id||'owner').slice(0,120),prior=audit.log.entries.find(e=>e.operation_id===input.operation_id);
  if(prior){if(prior.result!==input.result||prior.reason!==reason||prior.actor!==reviewer||prior.submission_revision!==input.revision)fail('inspection_conflict');return {inspection:await inspectionView(g,audit.log),already_saved:true,pending_review:true,publication:false};}
  const view=await inspectionView(g,audit.log);if(view.revision!==input.revision)fail('inspection_conflict');if(audit.log.entries.length>=INSPECTION_LIMIT)fail('inspection_history_full');
  const entry={operation_id:input.operation_id,result:input.result,reason,actor:reviewer,at:new Date().toISOString(),submission_revision:input.revision,source_revision:await hash(g.record.fields.payload_json)},log={...audit.log,entries:[...audit.log.entries,entry]},body=JSON.stringify(log);
  if(new TextEncoder().encode(body).length>INSPECTION_BYTES)fail('inspection_history_full');
  // R2 conditional writes serialize concurrent saves without touching Airtable.
  const written=await audit.bucket.put(audit.key,body,{onlyIf:audit.etag?{etagMatches:audit.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
  if(!written)fail('inspection_conflict');
  const verified=await readModelInspection(env,g,deps);
  if(JSON.stringify(verified.log.entries.slice(0,log.entries.length))!==JSON.stringify(log.entries))fail('inspection_save_unverified');
  return {inspection:await inspectionView(g,verified.log),already_saved:false,pending_review:true,publication:false};
}
