import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleEmsAlbums, EMS_ALBUM_API } from '../src/member-ems-albums.js';
import { resolveEmsAlbumReturnTarget } from '../../shared/ems-album-navigation.mjs';
import { handleLiffMemberShell } from '../src/liff-member-shell.js';

const UID='U'+'1'.repeat(32),SHA='a'.repeat(64),now=Date.now();
function harness(){
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

test('approved list/detail and bytes use canonical permissions without exposing internal identifiers or URLs',async()=>{
 const h=harness();let response=await h.run();let body=await response.json();
 assert.equal(response.status,200);assert.equal(body.authority,'mmd_workers_ems_album_v1');assert.match(body.account_scope,/^[a-f0-9]{64}$/);
 assert.deepEqual(body.items,[{model_code:'EMs04',working_name:'Approved Model',access:'allowed',cover_url:EMS_ALBUM_API+'/EMs04/photos/media_album-a'}]);
 assert.doesNotMatch(JSON.stringify(body),/recModel|recClient|internal_note|private_original|drive|rate/);
 assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('vary'),'Cookie');
 const scope=body.account_scope;body=await (await h.run('/EMs04')).json();assert.equal(body.account_scope,scope);assert.equal(body.images.length,1);
 response=await h.run('/EMs04/photos/media_album-a');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3,4]);assert.equal(response.headers.get('content-type'),'image/webp');
 response=await h.run('/EMs04/photos/media_album-a',{method:'HEAD'});assert.equal((await response.arrayBuffer()).byteLength,0);
});

test('VIP alone or profile-only approval cannot reveal album names, covers or image bytes',async()=>{
 for(const mutate of [h=>h.state.decisions=[],h=>h.state.decisions[0].fields.allow_photo=false,h=>h.state.decisions[0].fields.allow_profile=false]){
  const h=harness();mutate(h);const body=await (await h.run()).json();assert.deepEqual(body.items,[]);assert.equal(h.calls.includes('head'),false);assert.equal((await h.run('/EMs04/photos/media_album-a')).status,404);
 }
});

test('blocked, grace-only, absent or unresolved sessions fail before media reads',async()=>{
 for(const [mutate,status] of [[h=>h.state.session=null,401],[h=>h.state.session.readGraceOnly=true,401],[h=>h.state.snapshot.member_blocked=true,403],[h=>h.state.snapshot.access.new_model_reveals_allowed=false,403],[h=>h.state.snapshot.source_status='unavailable',503],[h=>h.state.session.memberProfile={status:'blocked'},403]]){
  const h=harness();mutate(h);assert.equal((await h.run()).status,status);assert.equal(h.calls.includes('head'),false);
 }
});

test('cross-client approvals, expired approvals, duplicate approvals and GWs fail closed',async()=>{
 for(const mutate of [h=>h.state.decisions[0].fields.Client=['recOther'],h=>h.state.decisions[0].fields.line_user_id='U'+'2'.repeat(32),h=>h.state.decisions[0].fields.expires_at=new Date(now-1000).toISOString(),h=>h.state.decisions.push(structuredClone(h.state.decisions[0])),h=>h.state.decisions[0].fields.category='gws',h=>h.state.decisions[0].fields.Model=['recOther','recModelA']]){
  const h=harness();mutate(h);assert.deepEqual((await (await h.run()).json()).items,[]);assert.equal((await h.run('/EMs04')).status,404);
 }
});

test('each photo request rechecks approvals, object ownership and the stored version',async()=>{
 const h=harness();assert.equal((await h.run()).status,200);h.state.decisions[0].fields.allow_photo=false;assert.equal((await h.run('/EMs04/photos/media_album-a')).status,404);assert.equal(h.calls.includes('get'),false);
 for(const mutate of [h=>h.state.media[0].fields.private_safe=false,h=>h.state.media[0].fields.media_type='flash_preview',h=>h.state.media[0].fields.Model=['recOther'],h=>h.state.media.push(structuredClone(h.state.media[0]))]){
  const h=harness();mutate(h);assert.deepEqual((await (await h.run()).json()).items,[]);assert.equal((await h.run('/EMs04/photos/media_album-a')).status,404);
 }
 const bad=harness();bad.state.object.customMetadata.sha256='invalid';assert.equal((await bad.run('/EMs04/photos/media_album-a')).status,503);
});

test('ambiguous Clients and model discovery restrictions never reveal metadata',async()=>{
 const h=harness();h.state.clients.push({id:'recOther',fields:{line_user_id:UID}});assert.equal((await h.run()).status,403);
 const blocked=harness();blocked.state.models[0].fields.customer_discovery_policy_json='invalid';assert.deepEqual((await (await blocked.run()).json()).items,[]);
});

test('existing decision group restrictions and exact model keys cannot be bypassed',async()=>{
 for(const mutate of [h=>h.state.decisions[0].fields.eligibility_group='other',h=>h.state.decisions[0].fields.internal_access_group='other',h=>h.state.decisions[0].fields.model_key='EMs04 alias',h=>h.state.clients[0].fields.line_user_id='U'+'2'.repeat(32)]){
  const h=harness();mutate(h);const response=await h.run();assert.ok(response.status===403 || (await response.json()).items.length===0);assert.equal(h.calls.includes('head'),false);
 }
});

test('unexpected query parameters, cross-origin requests and writes are rejected',async()=>{
 for(const [suffix,init,status] of [['?client_id=recOther',{},403],['',{headers:{origin:'https://evil.example'}},403],['',{method:'POST'},405],['/GWs04',{},404],['/EMs04/photos/unknown',{},404]]){
  const h=harness();assert.equal((await h.run(suffix,init)).status,status);assert.equal(h.calls.length,0);
 }
});

test('source failure remains unavailable rather than becoming an empty catalog',async()=>{
 const h=harness();h.state.failTable='media';const response=await h.run();assert.equal(response.status,503);assert.equal((await response.json()).error.code,'EMS_ALBUMS_UNAVAILABLE');
});

test('login return hint allows exactly the album list, including LINE liff.state',async()=>{
 for(const [q,state,expected] of [['return_to=albums_ems','','/my-mmd/albums/ems'],['','return_to=albums_ems','/my-mmd/albums/ems'],['return_to=https://evil.example','',''],['return_to=//evil.example','',''],['return_to=albums_ems&return_to=coupon','',''],['return_to=albums_ems','return_to=coupon','']])assert.equal(resolveEmsAlbumReturnTarget(new URLSearchParams(q),new URLSearchParams(state)),expected);
 const response=handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff?liff.state='+encodeURIComponent('?intent=status&return_to=albums_ems')),{LINE_LIFF_ID:'fixture'});
 const html=await response.text();assert.ok(html.includes('"returnTo":"/my-mmd/albums/ems"'));assert.ok(html.indexOf('profileReady = true;')<html.indexOf('window.location.replace(CONFIG.returnTo)'));
 for(const extra of ['intent=renew','intent=continue_payment','intent=signup','intent=promo','intent=status&campaign=care_back']){
  const response=handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff?return_to=albums_ems&'+extra),{LINE_LIFF_ID:'fixture'});
  assert.ok((await response.text()).includes('"returnTo":""'),extra);
 }
});
