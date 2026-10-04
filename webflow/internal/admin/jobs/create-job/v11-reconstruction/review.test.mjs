import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from './build.mjs';
const require=createRequire(process.env.V11_TEST_PACKAGE||import.meta.url);
const {JSDOM,VirtualConsole}=require('jsdom');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const client={client_id:'recSyntheticClient01',client_name:'Synthetic Client',membership_status:'active'};
const model={model_id:'recSyntheticModel01',model_name:'Synthetic Model',status:'active',tier:'exclusive',orientation:'straight'};
async function fixture(options={}){
 const calls=[],errors=[];const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(await build(),{url:'https://fixture.invalid/internal/admin/jobs/create-job',runScripts:'dangerously',virtualConsole:console,beforeParse(w){
  w.HTMLElement.prototype.scrollIntoView=()=>{};w.AbortController=AbortController;w.Response=Response;w.Request=Request;
  w.fetch=async(input,init={})=>{const u=new URL(String(input),w.location.href);calls.push({url:u,init});
   let data={ok:true},status=200;
   if(u.pathname==='/v1/admin/ping'&&options.unauthorized){status=401;data={ok:false,error:'Unauthorized'};}
   else if(u.pathname.includes('/clients/'))data={records:options.clients??[client]};
   else if(u.pathname==='/v1/admin/models/search'){data=options.search??{items:[model]};status=options.modelStatus??200;}
   else if(u.pathname==='/v1/admin/models/list')data={records:options.inventory??[]};
   else if(u.pathname!=='/v1/admin/ping')throw new Error('Unexpected endpoint '+u.pathname);
   return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  };
  if(options.draft)w.localStorage.setItem('mmd.create-job.draft.v1',JSON.stringify(options.draft));
 }});
 await sleep(80);const w=dom.window,d=w.document,root=d.getElementById('mmd-cj-split-v1');
 const by=k=>root.querySelector(`[data-cj="${k}"]`),click=k=>by(k).click();
 const set=(k,v)=>{by(k).value=v;by(k).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const chooseClient=async()=>{set('clientQuery','Synthetic');click('clientSearch');await sleep(120);root.querySelector('[data-cj-client-index="0"]')?.click();await sleep(30);};
 const scope=()=>{root.querySelector('[data-cj-world="private"]').click();set('folder','exclusive');set('gender','straight');set('privateWork','pn');click('lv8Next');};
 return {dom,w,d,root,by,click,set,calls,errors,chooseClient,scope,close:()=>w.close()};
}
test('pinned source blobs are exact V11 commit artifacts',async()=>{
 for(const [file,sha] of Object.entries({'lv10-runtime-v11.js':'10af5235ae079f06664e4d01f554bbe145b7e431','lv11-owner-composer-v1.css':'c447358e65c0f730b71fe9d7ee285a889bc9e7eb','lv11-owner-composer-v1.js':'14ac3793c837e7025bbb641b83d043aa5deb217f','model-search-case-alias-fix-v8.js':'0dc98a4074f39c675ef0ee193e706ecefee23f20'})){
  const b=await readFile(new URL('source/'+file,import.meta.url));assert.equal(createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex'),sha);
 }
});
test('canonical customer -> private model -> review retains identity and search scope',async()=>{
 const f=await fixture();try{
  assert.equal(f.by('auth').dataset.auth,'ready');await f.chooseClient();assert.equal(f.root.dataset.lv8Step,'2');
  const lookup=f.calls.find(c=>c.url.pathname.endsWith('lineage-lookup'));assert.deepEqual(JSON.parse(lookup.init.body),{query:'Synthetic',canonical_only:true,allow_manual_fallback:false});
  f.scope();assert.equal(f.root.dataset.lv8Step,'3');f.set('modelQuery','Synthetic Model');f.click('modelSearch');await sleep(120);
  const request=f.calls.find(c=>c.url.pathname.endsWith('/models/search'));assert.equal(request.url.searchParams.get('client_id'),client.client_id);assert.equal(request.url.searchParams.get('inventory_only'),'1');assert.equal(request.url.searchParams.get('selected_access_folder'),'exclusive');assert.equal(request.url.searchParams.get('private_work'),'pn');assert.equal(request.init.credentials,'include');
  f.root.querySelector('[data-cj-model-index="0"]').click();assert.equal(f.root.dataset.lv8Step,'4');
  for(const [k,v] of Object.entries({start:'18:00',location:'Synthetic venue',price:'6000',modelPayout:'3000'}))f.set(k,v);
  f.click('lv8Next');assert.equal(f.root.dataset.lv8Step,'5');assert.match(f.by('review').textContent,/Synthetic Client/);assert.match(f.by('review').textContent,/Synthetic Model/);assert.match(f.by('review').textContent,/6,000/);
  assert.equal(f.d.querySelector('a[href="/internal/admin/jobs/job-board"]').textContent,'Job Board · Public / Private');assert.equal(f.root.dataset.createEndpoint,'/__v11_review__/create-blocked');
  assert.equal(f.calls.some(c=>/create|publish|sync/.test(c.url.pathname)),false);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
test('missing admin session disables search and never invents authentication',async()=>{
 const f=await fixture({unauthorized:true});try{assert.equal(f.by('auth').dataset.auth,'required');assert.equal(f.by('clientSearch').disabled,true);assert.equal(f.by('modelSearch').disabled,true);assert.match(f.by('notice').textContent,/Admin session/);assert.equal(f.calls.length,1);assert.deepEqual(f.errors,[]);}finally{f.close();}
});
test('manual customer is blocked; a query does not manufacture canonical identity',async()=>{
 const f=await fixture({clients:[{client_name:'Synthetic unlinked',manual_public_only:true}]});try{await f.chooseClient();assert.equal(f.root.dataset.lv8Step,'1');assert.equal(f.by('clientSelected').hidden,true);assert.match(f.by('notice').textContent,/Canonical Client/);}finally{f.close();}
});
test('empty customer result remains empty',async()=>{
 const f=await fixture({clients:[]});try{await f.chooseClient();assert.equal(f.root.querySelectorAll('[data-cj-client-index]').length,0);assert.equal(f.root.dataset.lv8Step,'1');assert.match(f.by('clientResults').textContent,/ไม่พบลูกค้า/);}finally{f.close();}
});
test('guarded V11 alias inventory discovery preserves canonical model id',async()=>{
 const f=await fixture({search:{owner_discovery:true,entitlement_recheck_required:true,items:[]},inventory:[{id:model.model_id,fields:{working_name:'Synthetic Model',status:'active',access_folder:'exclusive',orientation:'straight',private_work_format:'pn'}}]});try{await f.chooseClient();f.scope();f.set('modelQuery','synthetic model');f.click('modelSearch');await sleep(160);assert.ok(f.calls.some(c=>c.url.pathname.endsWith('/models/list')));assert.match(f.by('modelResults').textContent,new RegExp(model.model_id));assert.match(f.by('modelResults').textContent,/owner_canonical_inventory_case_alias_v8/);assert.deepEqual(f.errors,[]);}finally{f.close();}
});
test('ordinary empty search and denied access do not invoke inventory fallback',async()=>{
 for(const options of [{search:{items:[]}},{modelStatus:403,search:{ok:false,error:{code:'private_folder_not_allowed',message:'denied'}}}]){
  const f=await fixture(options);try{await f.chooseClient();f.scope();f.set('modelQuery','Synthetic Model');f.click('modelSearch');await sleep(120);assert.equal(f.calls.some(c=>c.url.pathname.endsWith('/models/list')),false);assert.equal(f.root.querySelectorAll('[data-cj-model-index]').length,0);assert.deepEqual(f.errors,[]);}finally{f.close();}
 }
});
test('draft boot restores fields but requires fresh client/model selections',async()=>{
 const f=await fixture({draft:{version:1,world:'private',folder:'exclusive',gender:'straight',privateWork:'pn',opts:[],client_hint:client,model_hint:model,fields:{location:'Synthetic draft'}}});try{assert.equal(f.by('location').value,'Synthetic draft');assert.equal(f.root.dataset.lv8Step,'1');assert.equal(f.by('clientSelected').hidden,true);assert.equal(f.by('modelSelected').hidden,true);assert.equal(f.by('create').disabled,true);}finally{f.close();}
});
test('public brief gates model navigation and keeps Board as a separate handoff',async()=>{
 const f=await fixture();try{await f.chooseClient();f.root.querySelector('[data-cj-world="public"]').click();f.set('folder','travel');f.set('gender','straight');assert.equal(f.by('lv8Next').disabled,true);for(const [k,v] of Object.entries({publicFormat:'event',publicDuties:'Synthetic hosting',publicCustomerCount:'2',publicCareCount:'1',publicModelCount:'1'}))f.set(k,v);assert.equal(f.by('lv8Next').disabled,false);f.click('lv8Next');f.set('modelQuery','Synthetic Model');f.click('modelSearch');await sleep(120);const req=f.calls.find(c=>c.url.pathname.endsWith('/models/search'));assert.equal(req.url.searchParams.get('work_type'),'public');assert.equal(req.url.searchParams.has('client_id'),false);assert.equal(req.url.searchParams.has('inventory_only'),false);assert.deepEqual(f.errors,[]);}finally{f.close();}
});
test('guarded alias discovery rejects wrong name and incompatible lane',async()=>{
 const f=await fixture({search:{owner_discovery:true,entitlement_recheck_required:true,items:[]},inventory:[{id:'recSyntheticOther01',fields:{working_name:'Other Model',status:'active',access_folder:'exclusive',orientation:'straight'}},{id:'recSyntheticOther02',fields:{working_name:'Synthetic Model',status:'active',access_folder:'exclusive',orientation:'gay'}}]});try{await f.chooseClient();f.scope();f.set('modelQuery','Synthetic Model');f.click('modelSearch');await sleep(160);assert.equal(f.root.querySelectorAll('[data-cj-model-index]').length,0);assert.deepEqual(f.errors,[]);}finally{f.close();}
});
