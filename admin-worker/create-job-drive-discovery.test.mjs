import test from 'node:test';
import assert from 'node:assert/strict';
import {createCredentialBoundAdminSession} from './src/credential-bound-admin-session.js';
import {handleCreateJobDriveDiscovery,resolveChosenJobPartner,listWorkingPartners} from './src/create-job-drive-discovery.js';
const origin='https://www.mmdbkk.com';
const env={ADMIN_LOGIN_CREDENTIAL:'test',ADMIN_SESSION_SECRET:'test-secret',AIRTABLE_API_KEY:'test',AIRTABLE_BASE_ID:'appTest'};
const folder={drive_folder_id:'folderBrew1234567',folder_name:'Brew TN',folder_path:'MMD Private Models/Standard Package/Straight/Brew TN',folder_scope_key:'private:drive:folderBrew1234567',lane:'private',drive_folder_url:'https://drive.google.com/drive/folders/folderBrew1234567'};
async function request(path,method='GET',body,role='admin') {
  const token=await createCredentialBoundAdminSession(new Request(origin),{id:'per',role},env);
  return new Request(origin+path,{method,headers:{Cookie:`mmd_admin_gate_v1=${token}`,Origin:origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
}
function mock(fn) {const old=globalThis.fetch;globalThis.fetch=fn;return ()=>{globalThis.fetch=old;};}
test('Drive discovery never reads/writes Airtable and ignores all option filters',async()=>{
  const restore=mock(()=>{throw Error('Airtable must not be accessed');});let calls=0;
  try {
    const live={...env,MODEL_DRIVE_DIRECTORY:{fetch:async req=>{calls++;const u=new URL(req.url);assert.equal(u.pathname,'/__internal/model-drive/search');assert.equal(u.searchParams.get('q'),'brew');assert.equal(u.searchParams.get('lane'),'all');return Response.json({ok:true,items:[folder]});}}};
    const res=await handleCreateJobDriveDiscovery(await request('/v1/admin/models/search?discovery=drive&q=brew&mk=1&burn=1&service_options=group'),live);
    assert.equal(res.status,200);const out=await res.json();assert.equal(out.items[0].model_name,'Brew TN');assert.equal(out.items[0].model_id,'');assert.equal(out.airtable_deferred,true);assert.equal(calls,1);
  } finally {restore();}
});
test('Drive outage does not fall back to Airtable',async()=>{
  const restore=mock(()=>{throw Error('no fallback');});try {const live={...env,MODEL_DRIVE_DIRECTORY:{fetch:async()=>Response.json({ok:false},{status:503})}};assert.equal((await handleCreateJobDriveDiscovery(await request('/v1/admin/models/search?discovery=drive&q=brew'),live)).status,503);}finally{restore();}
});
test('canonical Airtable matching begins only on explicit selection',async()=>{
  let reads=0;
  const restore=mock(async()=>{reads++;return Response.json({records:[{id:'recBrew00000000001',fields:{working_name:'Brew TN',drive_folder_id:folder.drive_folder_id,status:'Active'}}]});});
  try {const live={...env,MODEL_DRIVE_DIRECTORY:{fetch:async req=>{assert.equal(new URL(req.url).pathname,'/__internal/model-drive/resolve');return Response.json({ok:true,item:folder});}}};const res=await handleCreateJobDriveDiscovery(await request('/v1/admin/models/drive-select','POST',{drive_folder_id:folder.drive_folder_id}),live);assert.equal(res.status,200);assert.equal((await res.json()).item.model_id,'recBrew00000000001');assert.ok(reads>0);}finally{restore();}
});
test('search and selection require credential-bound owner/admin sessions',async()=>{
  assert.equal((await handleCreateJobDriveDiscovery(new Request(origin+'/v1/admin/models/search?discovery=drive&q=brew'),env)).status,401);
  assert.equal((await handleCreateJobDriveDiscovery(await request('/v1/admin/models/search?discovery=drive&q=brew','GET',undefined,'mms_partner'),env)).status,403);
});
const partner={id:'recKendo000000001',fields:{fldXb55aiAjNPOUWc:'partner_kendo',fldpJWfASq7PfkMgC:'Kendo',fldajmg66pf2ifGPu:'Active',fldwRzdtIoPbHKr7n:'Recognized'}};
test('dropdown includes only active recognized Partner records and works without a query',async()=>{
  const restore=mock(async()=>Response.json({records:[partner,{...partner,id:'recOther000000001',fields:{...partner.fields,fldajmg66pf2ifGPu:'Archived'}}]}));try {const result=await listWorkingPartners(env);assert.equal(result.length,1);assert.equal(result[0].partner_name,'Kendo');assert.equal(result[0].partner_record_id,partner.id);assert.equal(result[0].partner_type,null);}finally{restore();}
});
test('chosen Partner name comes from canonical record; free text is rejected',async()=>{
  const restore=mock(async()=>Response.json(partner));try {const chosen=await resolveChosenJobPartner(env,{model_source_choice:'partner',partner_attribution:{partner_record_id:partner.id,partner_name:'spoof'}});assert.equal(chosen.partner_name,'Kendo');await assert.rejects(()=>resolveChosenJobPartner(env,{model_source_choice:'partner',partner_attribution:{partner_name:'Kendo'}}),/partner_record_required/);assert.deepEqual(await resolveChosenJobPartner(env,{model_source_choice:'direct'}),{source_kind:'direct'});}finally{restore();}
});
