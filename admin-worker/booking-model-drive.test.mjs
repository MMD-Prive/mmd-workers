import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingDriveFolder,listBookingDriveMedia,readBookingDriveMedia,readBookingDriveCover} from './src/booking-model-drive.js';
const folder='folder_model_123',child='folder_child_123',photo='photo_model_123',clip='video_model_123';
const model={id:'recDriveModel',fields:{drive_folder_id:folder,folder_scope_key:'private:drive:'+folder,status:'Hidden'}};
function fixture(t,{conflict=false,outside=false,loop=false,account='malemodel.bkk@gmail.com'}={}) {
 const calls=[],original=globalThis.fetch;
 const env={AIRTABLE_BASE_ID:'base',AIRTABLE_API_KEY:'test-only',GOOGLE_DRIVE_CLIENT_ID:'test-only',GOOGLE_DRIVE_CLIENT_SECRET:'test-only',GOOGLE_DRIVE_REFRESH_TOKEN:'test-only',MODEL_DRIVE_DIRECTORY:{fetch:async req=>{calls.push(['directory',req.method]);return Response.json({ok:true,item:{drive_folder_id:folder,folder_scope_key:'private:drive:'+folder,lane:'private'}});}},GOOGLE_DRIVE_HTTP:{fetch:async(input,init={})=>{
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
 globalThis.fetch=async(input,init)=>{const url=new URL(input);calls.push(['airtable',init?.method||'GET']);assert.equal(url.hostname,'api.airtable.com');return Response.json(url.pathname.endsWith(model.id)?model:{records:conflict?[model,{id:'recOther',fields:model.fields}]:[model]});};t.after(()=>globalThis.fetch=original);return {env,calls};
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
test('duplicate canonical folders stop before reading Drive bytes',async t=>{const {env,calls}=fixture(t,{conflict:true});await assert.rejects(listBookingDriveMedia(env,model.id),e=>e.status===409);assert.ok(!calls.some(([p])=>p.includes('drive/v3')));});
test('files outside the current linked Model folder cannot stream',async t=>{const {env}=fixture(t,{outside:true});await assert.rejects(readBookingDriveMedia(new Request('https://mmdbkk.com'),env,model.id,photo),e=>e.status===404);});
test('Private source streams through no-store owner route; HEAD has no body',async t=>{const {env}=fixture(t);const r=await readBookingDriveMedia(new Request('https://mmdbkk.com'),env,model.id,photo);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('cross-origin-resource-policy'),'same-origin');assert.equal((await r.arrayBuffer()).byteLength,4);const h=await readBookingDriveCover(new Request('https://mmdbkk.com',{method:'HEAD'}),env,model.id);assert.equal(h.status,200);assert.equal(h.body,null);});
test('cursor loops and wrong owner account fail clearly',async t=>{const {env}=fixture(t,{loop:true});await assert.rejects(listBookingDriveMedia(env,model.id),/drive_inventory_incomplete/);});
test('wrong connected Drive account is never accepted',async t=>{const {env}=fixture(t,{account:'unrelated@example.test'});await assert.rejects(listBookingDriveMedia(env,model.id),/drive_account_mismatch/);});
