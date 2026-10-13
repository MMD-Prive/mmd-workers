import test from 'node:test';
import assert from 'node:assert/strict';
import { canRecoverLegacyDriveModel } from './src/legacy-drive-model-recovery.js';
import { listUnifiedModelLineCandidates, materializeDriveAndBindVerifiedModelLineClaim } from './src/unified-model-drive-link.js';
const id='recCIVB053B0aKNd4', folderId='1CLXXlV7v5RfmllByu3_0TQMM6astMiMy';
const claimId='model_line_0123456789abcdef01234567';
const folder={drive_folder_id:folderId,folder_name:'Bank EI',folder_path:'Private Models / Standard - PN Models / Bank EI',lane:'private',folder_scope_key:'private:drive:'+folderId};
const model=()=>({id,fields:{working_name:'Bank EI',drive_folder_id:folderId,sales_layer:'private',internal_notes:'retained note'}});
test('legacy recovery preserves every deliberate status/review/binding restriction',()=>{
 assert.equal(canRecoverLegacyDriveModel(model(),folder),true);
 for(const fields of [{status:'inactive'},{status:'pending'},{status:'Active'},{private_review_status:'Rejected'},{private_review_status:'Screening'},{intake_gate_status:'blocked'},{registry_record_type:'quarantined'},{quarantine_reason:'pending check'},{folder_approval_status:'Needs Review'},{line_user_id:'U'+ '1'.repeat(32)}])
  assert.equal(canRecoverLegacyDriveModel({...model(),fields:{...model().fields,...fields}},folder),false,JSON.stringify(fields));
 assert.equal(canRecoverLegacyDriveModel(model(),{...folder,drive_folder_id:'differentFolder123'}),false);
});
async function fixture(run,options={}){
 const old=globalThis.fetch;let current=model(),patches=[],creates=0,binds=0;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input instanceof Request?input.url:String(input)),method=init.method||'GET';
  if(method==='POST'){creates++;throw Error('no new canonical record');}
  if(method==='PATCH'){
   const b=JSON.parse(init.body);patches.push({table:url.pathname.split('/').at(-1),...b.records[0]});
   if(url.pathname.endsWith('/Models'))Object.assign(current.fields,b.records[0].fields);
   return Response.json({records:[{id:b.records[0].id,fields:b.records[0].fields}]});
  }
  if(url.pathname.endsWith('/Models/'+id))return Response.json(current);
  if(url.pathname.endsWith('/Claims'))return Response.json({records:[{id:'recClaim000000001',fields:{claim_id:claimId,claim_status:options.claimStatus||'verified_unlinked',line_user_id:'U'+'1'.repeat(32)}}]});
  if(url.pathname.endsWith('/Models')){
   const formula=url.searchParams.get('filterByFormula')||'';
   if(/LINE User ID|line_user_id/.test(formula))return Response.json({records:options.collision?[{id:'recOther000000001'}]:[]});
   return Response.json({records:[current]});
  }
  throw Error('unexpected '+url.pathname);
 };
 const env={AIRTABLE_BASE_ID:'appTest',AIRTABLE_API_KEY:'test',AIRTABLE_TABLE_MODELS:'Models',AIRTABLE_TABLE_MODEL_LINE_IDENTITY_CLAIMS:'Claims',
  MODEL_DRIVE_DIRECTORY:{fetch:async(request)=>options.directoryDown?Response.json({ok:false},{status:503}):Response.json(request.method==='GET'?{ok:true,items:[folder]}:{ok:true,item:options.wrongFolder?{...folder,drive_folder_id:'differentFolder123'}:folder})},
  MODEL_ACTIVATION_COORDINATOR:{idFromName:()=>id,get:()=>({fetch:async()=>{binds++;return Response.json({ok:true});}})}};
 try{return await run(env,()=>({current,patches,creates,binds}));}finally{globalThis.fetch=old;}
}
function request(extra={}){return new Request('https://www.mmdbkk.com/v1/admin/model/activation/issue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'materialize_drive_verified_claim',claim_id:claimId,drive_folder_id:folderId,confirm:true,...extra})});}
test('search enriches one existing Airtable row with approved recovery; creates nothing',()=>fixture(async(env,state)=>{
 const r=await listUnifiedModelLineCandidates(env,new URL('https://admin.test/?q=Bank&lane=all'));
 assert.equal(r.items.length,1);assert.equal(r.items[0].model_record_id,id);assert.equal(r.items[0].can_recover_from_drive,true);
 assert.equal(state().patches.length,0);assert.equal(state().creates,0);
}));
test('explicit owner action recovers blank status, keeps the same id and binds verified claim',()=>fixture(async(env,state)=>{
 const r=await materializeDriveAndBindVerifiedModelLineClaim(request(),env,{id:'owner'});assert.equal(r.status,200);
 assert.equal(state().current.fields.status,'active');assert.equal(state().binds,1);assert.equal(state().creates,0);
 assert.match(state().current.fields.internal_notes,/retained note/);assert.match(state().current.fields.internal_notes,/MMD DRIVE STATUS RECOVERY/);
 assert.equal(state().patches[0].id,id);assert.equal((await r.json()).materialized,false);
}));
for(const [name,options] of [['conflicting claim',{claimStatus:'conflict'}],['unverified claim',{claimStatus:'unverified'}],['identity collision',{collision:true}],['Drive outage',{directoryDown:true}],['folder mismatch',{wrongFolder:true}]])
 test(name+' blocks recovery before activation or binding',()=>fixture(async(env,state)=>{
  const r=await materializeDriveAndBindVerifiedModelLineClaim(request(),env,{id:'owner'});assert.ok(r.status>=400);
  assert.equal(state().patches.length,0);assert.equal(state().binds,0);assert.equal(state().creates,0);
 },options));
test('owner confirmation remains required',()=>fixture(async(env,state)=>{
 const r=await materializeDriveAndBindVerifiedModelLineClaim(request({confirm:false}),env,{id:'owner'});assert.equal(r.status,400);assert.equal(state().patches.length,0);
}));
