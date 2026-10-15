import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./dashboard-job-world-20261015.js',import.meta.url),'utf8');
const context={module:{exports:{}},URL};vm.runInNewContext(source,context);
const {resolveJobWorld,profileImageUrl}=context.module.exports;
const job=(lane)=>({ok:true,session:{session_id:'sess-1',model_work_lane:lane}});
test('default/no-job/errors stay MMD white',()=>{for(const p of [null,{}, {ok:false}, {ok:true,session:{}}, {ok:true,session:{session_id:'sess-1'}}])assert.equal(resolveJobWorld(p),'public');});
test('Create Job / Booking private work becomes SIGIL, public work stays MMD',()=>{assert.equal(resolveJobWorld(job('private_model')),'private');assert.equal(resolveJobWorld(job('public_model')),'public');});
test('verified payout lane supports the canonical work projection',()=>{assert.equal(resolveJobWorld({ok:true,session:{session_id:'sess-1',payout_terms:{money_lane:'private_model'}}}),'private');});
test('mismatched selected jobs and conflicting lanes stay white',()=>{assert.equal(resolveJobWorld(job('private_model'),'sess-2'),'public');assert.equal(resolveJobWorld({...job('private_model'),session:{...job('private_model').session,payout_terms:{money_lane:'public_model'}}}),'public');});
test('browser world/account type hints cannot select private',()=>{assert.equal(resolveJobWorld({ok:true,world:'private',welcome_context:{model_lane:'private'},session:{session_id:'sess-1',job_visibility:'private'}}),'public');});
test('profile placeholders reject empty or executable image sources',()=>{for(const v of ['',null,undefined,'javascript:alert(1)','data:image/svg+xml,x'])assert.equal(profileImageUrl(v,'https://mmdbkk.com'),'');assert.equal(profileImageUrl('/v1/model/media/a/file','https://mmdbkk.com'),'https://mmdbkk.com/v1/model/media/a/file');});
test('world runtime removes manual switching and reads authenticated job truth',()=>{assert.doesNotMatch(source,/data-lane-view|welcome_context|localStorage|sessionStorage/);assert.match(source,/credentials:'include'/);assert.match(source,/session\/current/);assert.match(source,/avatarFallback/);});
test('private uploader retains limits, consent, distinct route and no private thumbnails',()=>{const media=fs.readFileSync(new URL('./dashboard-home-media-20261015.js',import.meta.url),'utf8');assert.match(media,/MAX_PHOTOS=8,MAX_CLIPS=1/);assert.match(media,/total.photos>2/);assert.match(media,/private-upload-plan/);assert.match(media,/mmd-private-media-v1-20260927/);assert.match(media,/if\(target!==privateList\)/);assert.match(media,/controllers.forEach\(c=>c.abort\(\)\)/);assert.match(media,/current=data.media/);});
function mediaFixture(records=[]){
 const nodes=new Map(),events={},calls=[];
 function element(){const children=new Map();return {value:'',files:[],checked:false,disabled:false,hidden:false,dataset:{},setAttribute(){},append(){},querySelector(s){if(!children.has(s))children.set(s,element());return children.get(s);},addEventListener(k,f){this[k]=f;}};}
 const home=element(),root=element();root.querySelector=s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s)};
 const document={getElementById:id=>id==='mmd-model-home-v3'?home:null,createElement:()=>element(),querySelector:()=>({append(){}})};
 const fetch=async(url,init={})=>{calls.push({url:String(url),init});const body=String(url).includes('private-upload-plan')?{ok:true,asset_id:'asset1',expires_at:new Date(Date.now()+60000).toISOString(),upload_endpoint:'/v1/model/media/private-upload?asset_id=asset1'}:String(url).includes('private-upload?')?{ok:true}:{ok:true,media:records};return new Response(JSON.stringify(body));};
 const window={dispatchEvent(){},addEventListener(k,f){events[k]=f;}};
 let first=true;document.createElement=()=>{if(first){first=false;return root;}return element();};
 vm.runInNewContext(fs.readFileSync(new URL('./dashboard-home-media-20261015.js',import.meta.url),'utf8'),{document,window,fetch,AbortController,Date,URL,crypto:globalThis.crypto,CustomEvent:class{},XMLHttpRequest:class{},console});
 return {nodes,calls,events};
}
test('private photo and clip use consent and private plan/raw upload routes',async()=>{
 const x=mediaFixture();await new Promise(setImmediate);
 const consent=x.nodes.get('#mmu-private-consent'),input=x.nodes.get('#mmu-private-files'),button=x.nodes.get('#mmu-private-upload');
 input.files=[{name:'private.jpg',type:'image/jpeg',size:3,lastModified:1},{name:'private.mp4',type:'video/mp4',size:3,lastModified:1}];
 input.change();assert.equal(button.disabled,true);consent.checked=true;consent.change();assert.equal(button.disabled,false);await button.click();
 const plans=x.calls.filter(x=>x.url.includes('private-upload-plan'));assert.equal(plans.length,2);
 for(const call of plans){const b=JSON.parse(call.init.body);assert.equal(b.purpose,'sigil_private_profile');assert.equal(b.consent_version,'mmd-private-media-v1-20260927');assert.equal(call.init.credentials,'include');}
 assert.equal(x.calls.filter(x=>x.url.includes('private-upload?')).length,2);
 assert.equal(x.calls.some(x=>x.url.includes('/media/upload-url')),false);
});
test('private queue counts retained server media before accepting more files',async()=>{
 const x=mediaFixture([{self_managed:false,media_type:'private_gallery',file_type:'image/jpeg',review_status:'pending_review'},{self_managed:false,media_type:'private_gallery',file_type:'image/jpeg',review_status:'approved'}]);await new Promise(setImmediate);
 const input=x.nodes.get('#mmu-private-files');input.files=[{name:'third.jpg',type:'image/jpeg',size:3,lastModified:1}];input.change();
 assert.equal(x.nodes.get('#mmu-private-upload').disabled,true);assert.match(x.nodes.get('#mmu-private-state').textContent,/สูงสุด 2 รูป/);
});
