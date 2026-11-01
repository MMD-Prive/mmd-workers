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
  return {id:record.id,intake_id:p.intake_id,category:p.source.category,source_visibility:p.source.visibility,visibility:p.review_draft?.visibility||p.source.visibility,mime:p.source.mimeType,bytes:p.bytes,status:'pending_review',canonical_model_matching_required:true,model:p.review_draft?.model||null,revision:await hash(record.fields.payload_json)};
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
  for(const field of ['working_name','nickname','unique_key'])target.searchParams.append('fields[]',field);
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
