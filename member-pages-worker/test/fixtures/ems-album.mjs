import assert from 'node:assert/strict';
import {handleEmsAlbums,EMS_ALBUM_API} from '../../src/member-ems-albums.js';
const UID='U'+'1'.repeat(32),SHA='a'.repeat(64),now=Date.now();
export function harness(){
 const calls=[],state={
  session:{lineUserId:UID,memberExists:true,memberId:'recMemberA'},
  snapshot:{source_status:'verified',fail_closed:true,member_blocked:false,access:{new_model_reveals_allowed:true},capability_state:{active:['vip']}},
  clients:[{id:'recClientA',fields:{line_user_id:UID,Status:'Active'}}],
  decisions:[{id:'recDecisionA',fields:{line_user_id:UID,Client:['recClientA'],Model:['recModelA'],category:'ems',model_key:'EMs04',decision_status:'approved',allow_profile:true,allow_photo:true,approved_by:'per',approved_at:new Date(now-1000).toISOString(),expires_at:new Date(now+3600000).toISOString(),source_ref:'fixture-owner-review'}}],
  models:[{id:'recModelA',fields:{working_name:'Approved Model',unique_key:'EMs04',recognition_class:'EMs',visibility:'private',status:'active',internal_note:'never-project'}}],
  media:[{id:'recMediaA',fields:{media_id:'media_album-a',Model:['recModelA'],media_type:'private_gallery',review_status:'approved',private_safe:true,file_type:'image/webp',file_size_bytes:4,r2_bucket:'mmd-private-model-media',private_original_key:'private-model-media/recModelA/media_album-a.webp'}}],
  object:{size:4,httpMetadata:{contentType:'image/webp'},customMetadata:{media_id:'media_album-a',model_record_id:'recModelA',sha256:SHA}},
 };
 const tables={'tblVv58TCbwh5j1fS':'clients','tblrwsAdzFhtmknlF':'decisions','tblI4B0bI446vp9GX':'models','tblrpQXhHnbTU9RhW':'media'};
 const env={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'appFixture',AIRTABLE_HTTP:{async fetch(request){
  assert.equal(request.method,'GET');const u=new URL(request.url),table=u.pathname.split('/').at(-1);calls.push(table);
  assert.ok(tables[table],table);if(table!=='tblrwsAdzFhtmknlF')assert.ok(u.searchParams.getAll('fields[]').length>0);
  if(state.failTable===tables[table])return Response.json({error:'fixture'},{status:503});
  return Response.json({records:state[tables[table]],...(state.incomplete?{offset:'more'}:{})});
 }},PRIVATE_MODEL_MEDIA:{async head(key){calls.push('head');assert.equal(key,'private-model-media/recModelA/media_album-a.webp');return state.object;},async get(key){calls.push('get');return {...state.object,body:new Uint8Array([1,2,3,4])};}}};
 const deps={readSession:async()=>state.session,readEntitlement:async()=>state.snapshot};
 return {state,calls,run:(suffix='',init={})=>handleEmsAlbums(new Request('https://mmdbkk.com'+EMS_ALBUM_API+suffix,init),env,deps)};
}
