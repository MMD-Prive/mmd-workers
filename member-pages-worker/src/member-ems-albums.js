import { projectKenjiSafeModel, privateCampaignInternalGroup } from '../../admin-worker/src/kenji-model-access-rpc.js';
import { assertPrivateObject, privateBucket } from '../../shared/private-media.mjs';
import { customerDiscoveryAllowed } from '../../sigil-booking-worker/src/customer-discovery-policy.js';

export const EMS_ALBUM_API = '/api/member/app/albums/ems';
export const EMS_ALBUM_AUTHORITY = 'mmd_workers_ems_album_v1';
const HOSTS = new Set(['https://mmdbkk.com','https://www.mmdbkk.com']);
const ACTIVE = new Set(['public_member','private_standard','private_premium','vip','svip','black_card']);
const HEADERS = {'cache-control':'private, no-store, max-age=0',vary:'Cookie','referrer-policy':'no-referrer','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'};
const text = value => String(value ?? '').trim();
const links = value => Array.isArray(value) ? value.map(v=>text(v?.id || v)) : [];
const quote = value => `'${text(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`;
const code = value => /^EMs\d{2,3}$/.test(value || '');
const recordId = value => /^rec[A-Za-z0-9]+$/.test(value || '');
const future = value => Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
const validDate = value => Number.isFinite(Date.parse(value));
function json(body,status=200){return Response.json(body,{status,headers:HEADERS});}
function failure(reason,status){return json({ok:false,error:{code:reason}},status);}

export function isEmsAlbumRequest(request){
  const p=new URL(request.url).pathname.replace(/\/+$/,'');
  return p===EMS_ALBUM_API || p.startsWith(EMS_ALBUM_API+'/');
}

async function airtable(env,table,suffix=''){
  if(!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID)throw Error('source_unavailable');
  const request=new Request(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}${suffix}`,{
    headers:{authorization:`Bearer ${env.AIRTABLE_API_KEY}`},signal:AbortSignal.timeout(8000),
  });
  const response=await (env.AIRTABLE_HTTP?.fetch?.bind(env.AIRTABLE_HTTP)||fetch)(request);
  if(!response.ok)throw Error('source_unavailable');
  return response.json();
}
async function list(env,table,formula,max=500,fields=[]){
  const records=[];let offset='';
  do{
    const q=new URLSearchParams({pageSize:'100',filterByFormula:formula});
    for(const field of fields)q.append('fields[]',field);
    if(offset)q.set('offset',offset);
    const body=await airtable(env,table,'?'+q);
    if(!Array.isArray(body.records))throw Error('source_unavailable');
    records.push(...body.records);offset=text(body.offset);
    if(records.length>max || offset&&records.length>=max)throw Error('source_incomplete');
  }while(offset);
  return records;
}
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}

// Existing explicit Per decisions govern both profile and photo visibility.
// Merely owning VIP, a model alias or a browser-selected collection grants none.
function approvedDecision(row,lineUserId,clientId){
  const f=row.fields||{},model=links(f.Model),client=links(f.Client);
  // Preserve the existing Kenji decision-group rule, including legacy exact
  // Per approvals. An optional restriction must not disappear in projection.
  const declared=text(f.eligibility_group || f.internal_access_group);
  const groupAllowed=f.owner_override===true || text(f.eligibility_source).toLowerCase()==='per_override' ||
    !declared || declared===privateCampaignInternalGroup('ems');
  return text(f.line_user_id)===lineUserId && client.length===1 && client[0]===clientId &&
    model.length===1 && recordId(model[0]) && text(f.category).toLowerCase()==='ems' &&
    text(f.decision_status).toLowerCase()==='approved' && f.allow_profile===true && f.allow_photo===true &&
    groupAllowed && text(f.approved_by).toLowerCase()==='per' && validDate(f.approved_at) && future(f.expires_at) && Boolean(text(f.source_ref));
}
function mediaOwned(row,modelId){
  const f=row.fields||{},models=links(f.Model);
  return models.length===1 && models[0]===modelId && f.media_type==='private_gallery' &&
    f.review_status==='approved' && f.private_safe===true && ['image/jpeg','image/png','image/webp'].includes(f.file_type) &&
    /^media_[A-Za-z0-9-]+$/.test(f.media_id||'');
}

export async function handleEmsAlbums(request,env,{readSession,readEntitlement}){
  const url=new URL(request.url),pathname=url.pathname.replace(/\/+$/,'');
  if(!isEmsAlbumRequest(request))return failure('NOT_FOUND',404);
  if(!['GET','HEAD'].includes(request.method))return failure('METHOD_NOT_ALLOWED',405);
  if(!HOSTS.has(url.origin)||url.search||request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return failure('REQUEST_NOT_ALLOWED',403);
  const suffix=pathname.slice(EMS_ALBUM_API.length);
  const match=/^\/(EMs\d{2,3})(?:\/photos\/(media_[A-Za-z0-9-]+))?$/.exec(suffix);
  if(suffix&&!match)return failure('ALBUM_UNAVAILABLE',404);
  try{
    const session=await readSession(request,env);
    if(!session?.lineUserId || session.memberExists!==true || !session.memberId || session.readGraceOnly===true)return failure('MEMBER_SESSION_REQUIRED',401);
    if([session.memberProfile?.membership_status,session.memberProfile?.status].some(v=>/^(blocked|suspended|revoked|pending_review)$/i.test(text(v))))return failure('ALBUM_ACCESS_REQUIRED',403);
    const snapshot=await readEntitlement(env,{line_user_id:session.lineUserId});
    if(snapshot?.source_status!=='verified'||snapshot.fail_closed!==true)return failure('MEMBER_STATUS_UNAVAILABLE',503);
    if(snapshot.member_blocked===true||snapshot.access?.new_model_reveals_allowed!==true||!snapshot.capability_state?.active?.some(x=>ACTIVE.has(x)))return failure('ALBUM_ACCESS_REQUIRED',403);
    const clients=await list(env,env.AIRTABLE_TABLE_CLIENTS||'tblVv58TCbwh5j1fS',`{line_user_id}=${quote(session.lineUserId)}`,2,['line_user_id','Status']);
    if(clients.length!==1||!recordId(clients[0].id))return failure('CLIENT_IDENTITY_UNRESOLVED',403);
    const client=clients[0],cf=client.fields||{};
    if(text(cf.line_user_id)!==session.lineUserId)return failure('CLIENT_IDENTITY_UNRESOLVED',403);
    if(/^(blocked|suspended|revoked)$/i.test(text(cf.Status)))return failure('ALBUM_ACCESS_REQUIRED',403);
    // Read this bounded owner's decision set without a field allowlist: the
    // existing authority may add an optional restriction. Never project rows.
    const decisions=await list(env,env.AIRTABLE_TABLE_PRIVATE_MODEL_ACCESS_DECISIONS||'tblrwsAdzFhtmknlF',`{line_user_id}=${quote(session.lineUserId)}`,500);
    const approved=decisions.filter(row=>approvedDecision(row,session.lineUserId,client.id));
    // Ambiguous or conflicting active approvals never select a row arbitrarily.
    const unique=approved.filter(row=>approved.filter(other=>links(other.fields.Model)[0]===links(row.fields.Model)[0]).length===1);
    if(unique.length>100)throw Error('catalog_too_large');
    const accountScope=await digest('mmd-ems-album-scope-v1:'+session.memberId+':'+client.id);
    const viewerRef=await digest('mmd-discovery-member-v1:'+session.memberId);
    const models=[];
    for(const decision of unique){
      if(match && text(decision.fields.model_key).toLowerCase()!==match[1].toLowerCase())continue;
      const modelId=links(decision.fields.Model)[0];
      const records=await list(env,env.AIRTABLE_TABLE_MODELS||'tblI4B0bI446vp9GX',`RECORD_ID()=${quote(modelId)}`,2,['working_name','unique_key','recognition_class','exclusive_group','status','visibility','customer_discovery_policy_json']);
      if(records.length!==1)continue;
      const model=records[0],f=model.fields||{};
      if(model.id!==modelId||text(f.status).toLowerCase()!=='active'||text(f.visibility).toLowerCase()!=='private'||!customerDiscoveryAllowed(f,viewerRef))continue;
      const safe=projectKenjiSafeModel(model);
      const approvedCode=text(decision.fields.model_key);
      if(!safe||!code(safe.model_code)||safe.model_code.toLowerCase()!==approvedCode.toLowerCase())continue;
      models.push({id:modelId,...safe});
    }
    const visible=models.filter(row=>models.filter(other=>other.model_code===row.model_code).length===1).sort((a,b)=>a.model_code.localeCompare(b.model_code,undefined,{numeric:true}));
    const selected=match?visible.find(row=>row.model_code===match[1]):null;
    if(match&&!selected)return failure('ALBUM_UNAVAILABLE',404);
    const media=visible.length?await list(env,env.AIRTABLE_TABLE_MODEL_MEDIA_ASSETS||env.AIRTABLE_TABLE_MODEL_MEDIA||'tblrpQXhHnbTU9RhW',"AND({media_type}='private_gallery',{review_status}='approved')",2000,['media_id','Model','media_type','review_status','private_safe','file_type','file_size_bytes','r2_bucket','private_original_key','slot_number']):[];
    const photos=model=>media.filter(row=>mediaOwned(row,model.id)).filter(row=>media.filter(other=>other.fields?.media_id===row.fields.media_id).length===1).sort((a,b)=>(Number(a.fields.slot_number)||0)-(Number(b.fields.slot_number)||0));
    const photoUrl=(model,row)=>`${EMS_ALBUM_API}/${model.model_code}/photos/${row.fields.media_id}`;
    let response;
    if(match?.[2]){
      const photo=photos(selected).find(row=>row.fields.media_id===match[2]);
      if(!photo)return failure('ALBUM_UNAVAILABLE',404);
      const verified=await assertPrivateObject(env,photo,true,'private_pic');
      const object=await privateBucket(env).get(verified.key);
      if(!object?.body || object.customMetadata?.sha256!==verified.sha256 || object.size!==verified.size || object.httpMetadata?.contentType!==verified.contentType)return failure('ALBUM_UNAVAILABLE',404);
      return new Response(request.method==='HEAD'?null:object.body,{headers:{...HEADERS,'content-type':verified.contentType,'content-disposition':'inline'}});
    }
    if(selected){
      const images=[];
      for(const photo of photos(selected)){await assertPrivateObject(env,photo,true,'private_pic');images.push({url:photoUrl(selected,photo),alt:selected.working_name});}
      response=json({ok:true,authority:EMS_ALBUM_AUTHORITY,account_scope:accountScope,access:'allowed',model_code:selected.model_code,working_name:selected.working_name,images});
    }else{
      const items=[];
      for(const model of visible){const cover=photos(model)[0];if(!cover)continue;await assertPrivateObject(env,cover,true,'private_pic');items.push({model_code:model.model_code,working_name:model.working_name,access:'allowed',cover_url:photoUrl(model,cover)});}
      response=json({ok:true,authority:EMS_ALBUM_AUTHORITY,account_scope:accountScope,items});
    }
    return request.method==='HEAD'?new Response(null,{headers:response.headers}):response;
  }catch{return failure('EMS_ALBUMS_UNAVAILABLE',503);}
}
