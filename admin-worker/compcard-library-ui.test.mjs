import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const { renderCompcardLibrary } = await import(process.env.COMPCARD_UI_MODULE || './src/compcard-library-page.js');

async function ready(check){for(let n=0;n<100;n++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('UI condition timed out');}
async function fixture({modelsFirst=false}={}){
  const dom=new JSDOM(renderCompcardLibrary('fixture'),{url:'https://mmdbkk.com/internal/admin/compcards',runScripts:'outside-only'}),w=dom.window,d=w.document;
  const items=[],calls=[],id='a'.repeat(32);
  const make=()=>({id,name:'Model <One>',original_name:'IMG-001.jpg',aliases:['Original Name'],source:{provider:'google_drive',ref:'drive:sourcefile',file_id:'drive_file_000001',path:'Standard / VIP'},status:'unmatched',height_cm:null,weight_kg:null,revision:1,etag:'v1',content_type:'image/jpeg',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),preview_url:'/v1/admin/compcards/'+id+'/file',file_url:'/v1/admin/compcards/'+id+'/file',model_id:'',model_name:''});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const directoryModel={model_id:'rec12345678901234',name:'Canonical One',code:'M01',height_cm:180,weight_kg:75,body_type:'athletic',skin_tone:'tan',offers_private:true,offers_public:false,drive_linked:true,cover_asset_id:'recPHOTO00000001',cover_status:'available',media:[{kind:'photo',asset_record_id:'recPHOTO00000001',preview_available:true,status:'pending_review'}],reasons:[]};
  w.fetch=async(input,init={})=>{
    const url=new URL(input,w.location.href),p=url.pathname;calls.push({url,init});
    let body;
    if(p==='/v1/admin/booking-models')body={items:[directoryModel],next_cursor:null,media_status:'available',source:'canonical_booking_models'};
    else if(p==='/v1/admin/booking-models/rec12345678901234/drive')body={items:[{kind:'photo',file_id:'photo_drive_1234567',status:'source_only'}],partial:false};
    else if(p.endsWith('/upload')){if(!items.length)items.push(make());body={item:items[0],duplicate:false};}
    else if(p.endsWith('/models'))body={items:[{id:'rec12345678901234',name:'Canonical One',code:'M01',status:'active',height_cm:180,weight_kg:75}]};
    else if(p.endsWith('/drive'))body={roots:[{id:'folder_000001',name:'Standard'}],files:url.searchParams.has('folder_id')?[{id:'file_00000001',name:'Card.jpg',content_type:'image/jpeg',updated_at:new Date().toISOString()}]:[],next_cursor:null};
    else if(p.endsWith('/import'))body={item:items[0],duplicate:true};
    else if(p.endsWith('/job-board'))body={files:[],next_cursor:null};
    else if(p.endsWith('/history'))body={items:[make()],next_cursor:null};
    else if(p==='/v1/admin/compcards'){const q=url.searchParams.get('q')||'',status=url.searchParams.get('status');body={items:items.filter(i=>(!q||i.name.includes(q))&&(!status||status==='all'||i.status===status)),next_cursor:null};}
    else if(init.method==='PATCH'){const b=JSON.parse(init.body);Object.assign(items[0],b,{etag:'v2',revision:2,model_name:b.model_id?'Canonical One':items[0].model_name});body={item:items[0]};}
    else if(p.endsWith(id))body={item:items[0]};
    else return Response.json({ok:false,error:'not_found'},{status:404});
    return Response.json({ok:true,...body});
  };
  w.eval(d.querySelector('script').textContent);
  await ready(()=>d.getElementById('mdStatus').textContent.includes('แสดง 1'));
  if(!modelsFirst){d.querySelector('[data-tab=library]').click();await ready(()=>d.getElementById('status').textContent.includes('แสดง 0'));}
  const $=id=>d.getElementById(id);
  const click=selector=>{const e=d.querySelector(selector);assert.ok(e,selector);e.click();};
  const submit=form=>$(form).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  async function upload(){Object.defineProperty($('upload'),'files',{configurable:true,value:[new w.File(['fixture'],'Compcard.jpg',{type:'image/jpeg'})]});$('upload').dispatchEvent(new w.Event('change'));await ready(()=>d.querySelector('[data-open]'));}
  return {dom,w,d,$,items,calls,click,submit,upload};
}
test('upload, escape model text, choose canonical model, save and view metadata history',async()=>{
  const f=await fixture();try{
    await f.upload();assert.equal(f.d.querySelector('.info strong').textContent,'Model <One>');assert.equal(f.d.querySelector('.info one'),null);
    f.click('[data-open]');await ready(()=>f.$('findModel'));f.click('#findModel');await ready(()=>f.d.querySelector('.model-option'));
    f.d.querySelector('.model-option input').checked=true;f.d.querySelector('.model-option input').dispatchEvent(new f.w.Event('change',{bubbles:true}));
    f.d.querySelector('[name=height_cm]').value='180';f.d.querySelector('[name=weight_kg]').value='75';f.submit('editForm');
    await ready(()=>f.$('editStatus')?.textContent==='บันทึกแล้ว');assert.equal(f.items[0].model_id,'rec12345678901234');
    const write=f.calls.find(c=>c.init.method==='PATCH');assert.equal(JSON.parse(write.init.body).etag,'v1');assert.equal(f.items[0].status,'linked');
    f.click('#historyButton');await ready(()=>f.d.querySelector('#history .history'));f.click('#versionsButton');await ready(()=>f.d.querySelector('[data-version]'));
    f.click('#closeEditor');assert.equal(f.$('editor').open,false);
  }finally{f.dom.window.close();}
});
test('Drive folder navigation imports the selected source and clears selection after success',async()=>{
  const f=await fixture();try{
    f.click('[data-tab=drive]');await ready(()=>f.d.querySelector('[data-folder]'));assert.equal(f.$('search').hidden,true);
    f.click('[data-folder]');await ready(()=>f.d.querySelector('[data-pick]'));f.click('#selectAll');assert.equal(f.d.querySelector('[data-pick]').checked,true);
    f.click('#importSelected');await ready(()=>f.$('status').textContent.includes('นำเข้าสำเร็จ'));
    const write=f.calls.find(c=>c.url.pathname.endsWith('/import'));assert.deepEqual(JSON.parse(write.init.body),{provider:'google_drive',file_id:'file_00000001'});
    assert.equal(f.d.querySelector('[data-pick]').checked,false);
    f.click('[data-back]');await ready(()=>f.d.querySelector('[data-folder]'));
  }finally{f.dom.window.close();}
});
test('status search, unlink and retaining unmatched cards do not invent a model ID',async()=>{
  const f=await fixture();try{
    await f.upload();f.$('filter').value='retired';f.submit('search');await ready(()=>f.d.querySelector('.empty'));assert.equal(f.d.querySelector('[data-open]'),null);
    f.$('filter').value='all';f.submit('search');await ready(()=>f.d.querySelector('[data-open]'));
    f.click('[data-open]');await ready(()=>f.$('unlink'));f.click('#unlink');f.submit('editForm');await ready(()=>f.$('editStatus')?.textContent==='บันทึกแล้ว');
    assert.equal(f.items[0].model_id,'');assert.equal(f.items[0].status,'unmatched');
    assert.ok(f.calls.every(c=>c.init.credentials==='same-origin'));
  }finally{f.dom.window.close();}
});

test('the owner Compcard workspace starts with canonical Models even when the imported library has zero cards',async()=>{
  const f=await fixture({modelsFirst:true});
  try{
    assert.equal(f.d.querySelector('[data-tab=models]').getAttribute('aria-pressed'),'true');
    assert.equal(f.$('search').hidden,true);
    assert.equal(f.$('grid').hidden,true);
    assert.equal(f.$('mdPanel').hidden,false);
    assert.equal(f.d.querySelectorAll('#mdGrid .md-model-card').length,1);
    assert.match(f.$('mdGrid').textContent,/Canonical One/);
    assert.match(f.$('mdGrid').textContent,/180 ซม./);
    assert.ok(f.calls.some(c=>c.url.pathname==='/v1/admin/booking-models'));
    assert.equal(f.calls.some(c=>c.url.pathname==='/v1/admin/compcards'&&c.init.method==='POST'),false);
    f.click('#mdGrid .md-model-card button');
    await ready(()=>f.$('mdGallery').querySelectorAll('figure').length===2);
    const files=[...f.$('mdGallery').querySelectorAll('figure img')].map(x=>new URL(x.src).pathname);
    assert.deepEqual(files,[
      '/v1/admin/booking-models/rec12345678901234/media/recPHOTO00000001',
      '/v1/admin/booking-models/rec12345678901234/drive/photo_drive_1234567'
    ]);
    f.click('#mdToLibrary');
    await ready(()=>f.$('status').textContent.includes('แสดง 0'));
    assert.equal(f.$('search').hidden,false);
    assert.equal(f.$('q').value,'Canonical One');
  }finally{f.dom.window.close();}
});

test('model-first search applies Booking filters for name, height, weight, body and skin',async()=>{
  const f=await fixture({modelsFirst:true});
  try{
    f.$('mdQuery').value='Ice T';f.$('mdAudience').value='private';
    f.$('mdHeightMin').value='175';f.$('mdHeightMax').value='195';
    f.$('mdWeightMin').value='70';f.$('mdWeightMax').value='85';
    f.$('mdBody').value='athletic';f.$('mdSkin').value='tan';
    f.submit('mdSearch');
    await ready(()=>f.calls.some(c=>c.url.pathname==='/v1/admin/booking-models'&&c.url.searchParams.get('q')==='Ice T'));
    const request=f.calls.filter(c=>c.url.pathname==='/v1/admin/booking-models').at(-1).url;
    for(const [name,val] of [['q','Ice T'],['audience','private'],['height_min','175'],['height_max','195'],['weight_min','70'],['weight_max','85'],['body','athletic'],['skin','tan']])assert.equal(request.searchParams.get(name),val);
    f.click('#mdReset');
    await ready(()=>f.calls.filter(c=>c.url.pathname==='/v1/admin/booking-models').length>=3);
    const clear=f.calls.filter(c=>c.url.pathname==='/v1/admin/booking-models').at(-1).url;
    assert.equal(clear.searchParams.get('q'),'');
    assert.equal(clear.searchParams.get('height_min'),null);
    assert.equal(clear.searchParams.get('body'),null);
  }finally{f.dom.window.close();}
});

test('model-first search does not execute untrusted model name as markup',async()=>{
  const f=await fixture({modelsFirst:true});
  try{
    assert.equal(f.d.querySelectorAll('#mdGrid [onerror]').length,0);
    assert.equal(f.$('mdGallery').childElementCount,0);
    assert.ok(f.calls.every(c=>c.init.credentials==='same-origin'));
    assert.match(f.d.documentElement.outerHTML,/รูปทุกสถานะเป็นภาพตรวจภายใน/);
  }finally{f.dom.window.close();}
});
