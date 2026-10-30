import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingDriveFolder,bookingLegacyDrivePath,listBookingDriveMedia,readBookingDriveMedia,readBookingDriveCover} from './src/booking-model-drive.js';
import { listModelFolderMedia, readModelFolderMedia } from '../member-pages-worker/src/model-drive-admin-media.js';
import { handleModelDriveDirectoryRequest } from '../member-pages-worker/src/model-drive-directory.js';
const folder='folder_model_123',child='folder_child_123',photo='photo_model_123',clip='video_model_123';
const model={id:'recDriveModel',fields:{drive_folder_id:folder,folder_scope_key:'private:drive:'+folder,status:'Hidden'}};
function fixture(t,{conflict=false,outside=false,loop=false,account='malemodel.bkk@gmail.com',legacy=false,ambiguousLegacy=false}={}) {
 const calls=[],original=globalThis.fetch;
 const currentModel=legacy?{...model,fields:{source_folder:"MMD Private Models/Standard Package/Group/Fixture Model",source_file:"cover.jpg",working_name:"Fixture Model"}}:model;
 const env={AIRTABLE_BASE_ID:'base',AIRTABLE_API_KEY:'test-only',GOOGLE_DRIVE_CLIENT_ID:'test-only',GOOGLE_DRIVE_CLIENT_SECRET:'test-only',GOOGLE_DRIVE_REFRESH_TOKEN:'test-only',MODEL_DRIVE_DIRECTORY:{fetch:async req=>{calls.push(['directory',req.method]);if(req.method==='GET')return Response.json({ok:true,items:[{drive_folder_id:folder,folder_path:'MMD Catalogue/MMD Private Models/Standard Package/Group/Fixture Model'},...(ambiguousLegacy?[{drive_folder_id:'other_folder_123',folder_path:'MMD Catalogue/MMD Private Models/Standard Package/Group/Fixture Model'}]:[])]});const body=await req.json();assert.equal(body.drive_folder_id,folder);const path=new URL(req.url).pathname;if(path.endsWith('/admin-media-list'))return Response.json(await listModelFolderMedia('fixture-token',folder,'private',body.cover_only));if(path.endsWith('/admin-media-file'))return readModelFolderMedia(new Request('https://internal',{method:body.head?'HEAD':'GET',headers:body.range?{range:body.range}:{}}),'fixture-token',folder,body.file_id);return Response.json({ok:true,item:{drive_folder_id:folder,folder_scope_key:'private:drive:'+folder,lane:'private'}});}},GOOGLE_DRIVE_HTTP:{fetch:async(input,init={})=>{
  const url=new URL(input);calls.push([url.pathname,init.method||'GET']);
  if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'fixture-token'});
  if(url.pathname.endsWith('/about'))return Response.json({user:{emailAddress:account}});
  const id=url.pathname.split('/').at(-1);
  if(url.searchParams.get('alt')==='media')return new Response(new Uint8Array([255,216,255,0]),{headers:{'content-type':'image/jpeg','content-length':'4'}});
  if(id==='files') {
   const inChild=url.searchParams.get('q').includes(child);
   return Response.json({files:inChild?[{id:photo,mimeType:'image/jpeg',parents:[child],size:'4'},{id:clip,mimeType:'video/mp4',parents:[child],size:'4'}]:[{id:child,mimeType:'application/vnd.google-apps.folder',parents:[folder]}],...(loop?{nextPageToken:'same'}:{})});
  }
  const data=id===folder?{id,mimeType:'application/vnd.google-apps.folder',parents:['approved_root_123']}:id===child?{id,mimeType:'application/vnd.google-apps.folder',parents:[folder]}:{id,mimeType:'image/jpeg',parents:[outside?'outside_root_123':child],size:'4'};
  if(id==='outside_root_123')data.parents=[];
  return Response.json(data);
 }}};
 globalThis.fetch=async(input,init)=>{const url=new URL(input);calls.push(['airtable',init?.method||'GET']);if(url.hostname==='www.googleapis.com')return env.GOOGLE_DRIVE_HTTP.fetch(input,init);assert.equal(url.hostname,'api.airtable.com');return Response.json(url.pathname.endsWith(model.id)?currentModel:{records:conflict?[currentModel,{id:'recOther',fields:currentModel.fields}]:[currentModel]});};t.after(()=>globalThis.fetch=original);return {env,calls};
}
test('folder references must agree; legacy exact IDs work without guessing names',()=>{
 assert.equal(bookingDriveFolder({unique_key:'drive:'+folder}),folder);
 assert.equal(bookingDriveFolder({drive_folder_url:'https://drive.google.com/drive/folders/'+folder}),folder);
 assert.equal(bookingDriveFolder({drive_folder_id:folder,unique_key:'drive:other_model_123'}),'');
 assert.equal(bookingDriveFolder({working_name:'TarT'}),'');
});
test('hidden Private Model lists nested photos and clips without customer approval changes',async t=>{
 const {env,calls}=fixture(t);const d=await listBookingDriveMedia(env,model.id);assert.equal(d.partial,false);assert.equal(d.items.length,2);assert.equal(d.items[0].audience,'private');assert.equal(d.items[0].status,'source_only');assert.equal(d.items[1].kind,'clip');assert.ok(!JSON.stringify(d).includes('https:'));assert.ok(calls.every(([name,method])=>method==='GET'||name==='directory'||name==='/token'));
});
test('two canonical records explicitly sharing the same folder do not block admin inspection',async t=>{const {env}=fixture(t,{conflict:true});assert.equal((await listBookingDriveMedia(env,model.id)).items.length,2);});
test('files outside the current linked Model folder cannot stream',async t=>{const {env}=fixture(t,{outside:true});await assert.rejects(readBookingDriveMedia(new Request('https://mmdbkk.com'),env,model.id,photo),e=>e.status===404);});
test('Private source streams through no-store owner route; HEAD has no body',async t=>{const {env}=fixture(t);const r=await readBookingDriveMedia(new Request('https://mmdbkk.com'),env,model.id,photo);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('cross-origin-resource-policy'),'same-origin');assert.equal((await r.arrayBuffer()).byteLength,4);const h=await readBookingDriveCover(new Request('https://mmdbkk.com',{method:'HEAD'}),env,model.id);assert.equal(h.status,200);assert.equal(h.body,null);});
test('cursor loops and wrong owner account fail clearly',async t=>{const {env}=fixture(t,{loop:true});await assert.rejects(listBookingDriveMedia(env,model.id),/drive_inventory_incomplete/);});
test('admin uses existing directory credentials and new service routes reject unsigned callers',async t=>{const {env}=fixture(t);delete env.GOOGLE_DRIVE_CLIENT_ID;delete env.GOOGLE_DRIVE_CLIENT_SECRET;delete env.GOOGLE_DRIVE_REFRESH_TOKEN;assert.equal((await listBookingDriveMedia(env,model.id)).items.length,2);for(const route of ['admin-media-list','admin-media-file']){const r=await handleModelDriveDirectoryRequest(new Request('https://member-pages-worker.malemodel-bkk.workers.dev/__internal/model-drive/'+route,{method:'POST',body:JSON.stringify({drive_folder_id:folder})}),{AIRTABLE_API_KEY:'fixture'});assert.equal(r.status,403);}});

test('legacy full source path resolves read-only; generic categories and conflicting explicit links do not',async t=>{const {env}=fixture(t,{legacy:true});assert.equal((await listBookingDriveMedia(env,model.id)).items.length,2);assert.equal(bookingLegacyDrivePath({source_folder:'MMD Private Models/Standard Package/VIP',source_file:'one.jpg'}),'');assert.equal(bookingLegacyDrivePath({source_folder:'MMD Private Models/Standard Package/Person',source_file:'one.jpg',drive_folder_id:'invalid'}),'');});
test('ambiguous legacy paths stay for review instead of matching by name',async t=>{const {env}=fixture(t,{legacy:true,ambiguousLegacy:true});await assert.rejects(listBookingDriveMedia(env,model.id),e=>e.status===409);});

test('lookup results pointing to another explicit folder remain a conflict',async t=>{const {env}=fixture(t);const read=globalThis.fetch;globalThis.fetch=async(input,init)=>{const u=new URL(input);if(u.hostname==='api.airtable.com' && u.searchParams.has('filterByFormula'))return Response.json({records:[model,{id:'recOther',fields:{drive_folder_id:'another_folder_123'}}]});return read(input,init);};await assert.rejects(listBookingDriveMedia(env,model.id),e=>e.status===409);});
