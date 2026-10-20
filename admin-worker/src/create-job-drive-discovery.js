import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';
import { searchApprovedDriveModelCandidates, materializeApprovedDriveModel } from './unified-model-drive-link.js';

const SEARCH = '/v1/admin/models/search';
const SELECT = '/v1/admin/models/drive-select';
const PARTNERS = '/v1/admin/partners/lookup';
const clean = (value,max=240) => String(value ?? '').trim().slice(0,max);
const rec = value => /^rec[A-Za-z0-9]{14,24}$/.test(value || '');
function modelPhotos(fields={}) {
  const items = [...(Array.isArray(fields.profile_photo) ? fields.profile_photo : []), fields["Public Image URL"]];
  return [...new Set(items.map(item => clean(item?.url || item?.thumbnails?.large?.url || item,3000))
    .filter(url => /^https:\/\//i.test(url)))].slice(0,6);
}
const json = (body,status=200) => Response.json(body,{status,headers:{'cache-control':'private, no-store','referrer-policy':'no-referrer'}});
export function isCreateJobDriveDiscoveryRequest(request) {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/,'');
  return path === SELECT || path === PARTNERS || path === SEARCH && url.searchParams.get('discovery') === 'drive';
}
export async function handleCreateJobDriveDiscovery(request,env) {
  const actor = await readCredentialBoundAdminActor(request,env);
  if (!actor) return json({ok:false,error:'owner_admin_session_required'},401);
  if (!['admin','owner'].includes(actor.role)) return json({ok:false,error:'owner_admin_required'},403);
  const url = new URL(request.url),path = url.pathname.replace(/\/+$/,'');
  if (path === SELECT) {
    if (request.method !== 'POST') return json({ok:false,error:'method_not_allowed'},405);
    if (request.headers.get('origin') !== url.origin) return json({ok:false,error:'same_origin_required'},403);
    const body = await request.json().catch(()=>null);
    const result = await materializeApprovedDriveModel(env,body?.drive_folder_id,actor);
    if (!result.ok) return json({ok:false,error:result.error},result.status || 503);
    const f = result.record.fields || {};
    const photos = modelPhotos(f);
    return json({ok:true,item:{profile_photos:photos,profile_image_url:photos[0] || '',model_id:result.record.id,model_name:clean(f.working_name || f.nickname || result.folder.folder_name),model_lookup_key:clean(f.unique_key),drive_folder_id:result.folder.drive_folder_id,drive_folder_url:result.folder.drive_folder_url,source:'drive',source_kind:null,partner_name:null,partner_record_id:null,status:clean(f.status),materialized:true},materialized:result.materialized});
  }
  if (request.method !== 'GET') return json({ok:false,error:'method_not_allowed'},405);
  if (path === SEARCH) {
    // No Airtable lookup, attribution lookup, writes or capability filters here.
    const q = clean(url.searchParams.get('q') || url.searchParams.get('search'),120);
    if (!q) return json({ok:true,items:[],source:'drive',airtable_deferred:true});
    let result;
    try { result = await searchApprovedDriveModelCandidates(env,q,'all'); }
    catch { return json({ok:false,error:'drive_model_search_unavailable'},503); }
    if (!result.ok) return json({ok:false,error:'drive_model_search_unavailable'},503);
    return json({ok:true,source:'drive',airtable_deferred:true,items:result.items.map(item=>({model_id:'',model_name:item.working_name,model_lookup_key:item.model_lookup_key,drive_folder_id:item.drive_folder_id,drive_folder_url:item.drive_folder_url,folder_path:item.folder_path,folder_name:item.folder_name,source:'drive',source_kind:null,partner_name:null,partner_record_id:null,materialized:false,status:'Drive',orientation:item.lane}))});
  }
  if (path === PARTNERS) {
    try { return json({ok:true,available:true,items:await listWorkingPartners(env,clean(url.searchParams.get('q'),120))}); }
    catch { return json({ok:false,error:'partner_lookup_unavailable'},503); }
  }
  return json({ok:false,error:'not_found'},404);
}
const P = {id:'fldXb55aiAjNPOUWc',name:'fldpJWfASq7PfkMgC',status:'fldajmg66pf2ifGPu',approval:'fldwRzdtIoPbHKr7n'};
async function airtable(env,path,params) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw Error('not_configured');
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${path}`);
  url.searchParams.set('returnFieldsByFieldId','true');
  for (const [key,value] of params || []) url.searchParams.append(key,value);
  const response = await fetch(url,{headers:{Authorization:`Bearer ${env.AIRTABLE_API_KEY}`},signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw Error('partner_lookup_failed');
  return response.json();
}
const partnerTable = env => encodeURIComponent(env.AIRTABLE_TABLE_MODEL_PARTNERS || 'tbl1ksDlsTiiGEHWe');
function partnerOption(record) {
  const f=record.fields || {};
  if (!rec(record.id) || clean(f[P.status]).toLowerCase() !== 'active' || clean(f[P.approval]).toLowerCase() !== 'recognized' || !clean(f[P.id]) || !clean(f[P.name])) return null;
  return {partner_record_id:record.id,partner_id:clean(f[P.id]),partner_name:clean(f[P.name]),partner_type:null};
}
export async function listWorkingPartners(env,q='') {
  const items=[];let offset='';
  for (let page=0;page<10;page++) {
    const params=[['pageSize','100'],...Object.values(P).map(id=>['fields[]',id])];
    if (offset) params.push(['offset',offset]);
    const data=await airtable(env,partnerTable(env),params);
    for (const row of data.records || []) { const item=partnerOption(row);if(item && item.partner_name.toLowerCase().includes(q.toLowerCase())) items.push(item); }
    offset=data.offset || '';if(!offset) return items.sort((a,b)=>a.partner_name.localeCompare(b.partner_name));
  }
  throw Error('partner_directory_incomplete');
}
export async function resolveChosenJobPartner(env,body) {
  const choice=body.model_source_choice;
  if (choice !== 'direct' && choice !== 'partner') return null; // legacy creates unchanged
  if (choice === 'direct') {
    if (body.partner_attribution) throw Object.assign(Error('direct_job_has_partner'),{status:400});
    return {source_kind:'direct'};
  }
  const id=clean(body.partner_attribution?.partner_record_id);
  if (!rec(id)) throw Object.assign(Error('partner_record_required'),{status:400});
  const row=await airtable(env,`${partnerTable(env)}/${encodeURIComponent(id)}`);
  const option=partnerOption(row);
  if (!option) throw Object.assign(Error('partner_not_active_recognized'),{status:409});
  return {source_kind:'partner',...option};
}
