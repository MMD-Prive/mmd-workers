import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, apiModule, MODEL, PARTNER, OTHER} from './helpers/partner-fixture.mjs';
const ASSET='recIIIIIIIIIIIIII', ROOT='/v1/partner/announcements', ADMIN='/v1/partner/admin/announcements';
const A=apiModule.PARTNER_ASSETS;
function brief(extra={}){return {id:crypto.randomUUID(),revision:null,title:'งานถ่ายภาพตัวอย่าง',brief:'ข้อมูลจำลอง',category:'ถ่ายภาพ',area:'กรุงเทพฯ',requirements:'นายแบบ',start_at:new Date(Date.now()+86400000*4).toISOString(),end_at:new Date(Date.now()+86400000*4+7200000).toISOString(),deadline:new Date(Date.now()+86400000).toISOString(),required_count:1,budget_min:5000,budget_max:8000,budget_basis:'model_net',travel_terms:'ตามข้อตกลง',partner_fee_terms:'แยกจากค่าตัว',private_details:'PRIVATE ADDRESS CLIENT',status:'open',audience:'all_active',partner_ids:[],...extra};}
async function setup(){const f=await fixture();f.db.Assets.push({id:ASSET,fields:{[A.partner]:[PARTNER],[A.model]:[MODEL],[A.fileType]:'image/jpeg',[A.fileName]:'current.jpg',[A.fileCategory]:'photo',[A.reviewStatus]:'pending_review',[A.r2Key]:'partner-shared/fixture/current.jpg'}});f.objects.set('partner-shared/fixture/current.jpg',{etag:'image',textValue:'fixture-image'});return f;}
async function call(f,path,body,owner=false,status=200){const r=await f.call(path,{body,owner});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d.announcement||d;}
const propose=(r,extra={})=>({id:r.id,revision:r.revision,model_id:MODEL,asset_id:ASSET,rate:6000,availability:'confirmed',note:'ยืนยันคิวแล้ว',share_with_mmd:true,photo_current:true,...extra});

test('complete recruitment preserves private details until selection; no job, finance or message side effects',async()=>{
 const f=await setup();try{
  let row=await call(f,ADMIN+'/save',brief(),true);
  let list=await call(f,ROOT);assert.equal(list.announcements.length,1);assert.equal(list.announcements[0].private_details,undefined);assert.equal(list.announcements[0].partner_ids,undefined);
  row=await call(f,ROOT+'/propose',propose(row));assert.equal(row.proposals[0].status,'submitted');assert.equal(row.proposals[0].input,undefined);assert.equal(row.private_details,undefined);
  const retry=await call(f,ROOT+'/propose',propose(row));assert.equal(retry.revision,row.revision);assert.equal(retry.proposals.length,1);
  row=await call(f,ADMIN+'/decision',{id:row.id,revision:row.revision,proposal_id:row.proposals[0].id,status:'selected',decision_note:'พร้อมประสานต่อ'},true);
  assert.equal(row.status,'filled');row=await call(f,ROOT+'/detail?id='+row.id);assert.equal(row.private_details,'PRIVATE ADDRESS CLIENT');assert.equal(row.proposals[0].status,'selected');
  assert.equal(f.writes.length,0);assert.equal(f.messages.length,0);assert.equal(f.db.Sessions.length,1);assert.equal(f.db.Commissions.length,0);
 }finally{f.restore();}
});
test('Partner cannot publish or decide; unauthorized media and wrong roster or image fail closed',async()=>{
 const f=await setup();try{
  await call(f,ADMIN+'/save',brief(),false,401);
  const row=await call(f,ADMIN+'/save',brief(),true);
  await call(f,ROOT+'/save',brief(),false,404);
  await call(f,ROOT+'/propose',propose(row,{model_id:OTHER}),false,403);
  f.db.Assets[0].fields[A.partner]=[OTHER];await call(f,ROOT+'/propose',propose(row),false,403);
  f.db.Assets[0].fields[A.partner]=[PARTNER];f.db.Assets[0].fields[A.reviewStatus]='rejected';await call(f,ROOT+'/propose',propose(row),false,403);
  await call(f,ROOT+'/media?asset_id='+ASSET,undefined,false,403);
 }finally{f.restore();}
});
test('audience and draft filtering do not leak private data or other Partner proposals',async()=>{
 const f=await setup();try{
  const excluded=await call(f,ADMIN+'/save',brief({audience:'selected_partners',partner_ids:[OTHER]}),true);
  await call(f,ADMIN+'/save',brief({status:'draft'}),true);
  await call(f,ROOT+'/detail?id='+excluded.id,undefined,false,404);assert.equal((await call(f,ROOT)).announcements.length,0);
  const row=await call(f,ADMIN+'/save',brief(),true);await call(f,ROOT+'/propose',propose(row));
  const key='partner-announcements/v1/'+row.id+'.json',stored=f.objects.get(key),doc=JSON.parse(stored.textValue);doc.proposals[0].partner_id=OTHER;stored.textValue=JSON.stringify(doc);
  const own=await call(f,ROOT+'/detail?id='+row.id);assert.deepEqual(own.proposals,[]);assert.equal(own.private_details,undefined);
 }finally{f.restore();}
});
test('stale edits, duplicate candidates and close/submit race cannot overwrite canonical state',async()=>{
 const f=await setup();try{
  const input=brief();let row=await call(f,ADMIN+'/save',input,true);
  const [a,b]=await Promise.all([f.call(ROOT+'/propose',{body:propose(row)}),f.call(ADMIN+'/save',{owner:true,body:{...input,revision:row.revision,status:'closed'}})]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]);row=await call(f,ADMIN+'/detail?id='+row.id,undefined,true);
  if(row.status==='open'){
    await call(f,ROOT+'/propose',propose(row,{rate:7000}),false,409);
    await call(f,ADMIN+'/save',{...input,revision:row.revision,status:'draft'},true,409);
  }else await call(f,ROOT+'/propose',propose(row),false,409);
  await call(f,ADMIN+'/save',{...input,revision:'stale'},true,409);
 }finally{f.restore();}
});
test('more information resubmits without duplicating; expired and paused cannot accept new proposals',async()=>{
 const f=await setup();try{
  let row=await call(f,ADMIN+'/save',brief(),true);row=await call(f,ROOT+'/propose',propose(row));
  row=await call(f,ADMIN+'/decision',{id:row.id,revision:row.revision,proposal_id:row.proposals[0].id,status:'more_information',decision_note:'ขอรูปปัจจุบัน'},true);
  row=await call(f,ROOT+'/propose',propose(row,{note:'แนบข้อมูลปัจจุบัน'}));assert.equal(row.proposals.length,1);assert.equal(row.proposals[0].status,'submitted');
  const paused=await call(f,ADMIN+'/save',brief({status:'paused'}),true);await call(f,ROOT+'/propose',propose(paused),false,409);
  const exp=await call(f,ADMIN+'/save',brief(),true),stored=f.objects.get('partner-announcements/v1/'+exp.id+'.json'),doc=JSON.parse(stored.textValue);doc.deadline=new Date(Date.now()-1).toISOString();stored.textValue=JSON.stringify(doc);
  assert.equal((await call(f,ROOT+'/detail?id='+exp.id)).status,'expired');await call(f,ROOT+'/propose',propose(exp),false,409);
 }finally{f.restore();}
});
test('selection rechecks ownership and never exceeds headcount',async()=>{
 const f=await setup();try{
  let row=await call(f,ADMIN+'/save',brief(),true);row=await call(f,ROOT+'/propose',propose(row));
  f.db.Referrals[0].fields[apiModule.MODEL_REFERRALS.ownershipStatus]='transferred';
  await call(f,ADMIN+'/decision',{id:row.id,revision:row.revision,proposal_id:row.proposals[0].id,status:'selected',decision_note:''},true,403);
  assert.equal((await call(f,ROOT+'/detail?id='+row.id)).private_details,undefined);
 }finally{f.restore();}
});
test('money, times, consent and nulls are validated; unavailable R2 is not an empty board',async()=>{
 const f=await setup();try{
  for(const extra of [{budget_min:null},{budget_max:-1},{start_at:'2026-01-01T12:00'},{required_count:0},{deadline:new Date(Date.now()-1000).toISOString()}])await call(f,ADMIN+'/save',brief(extra),true,400);
  const row=await call(f,ADMIN+'/save',brief(),true);await call(f,ROOT+'/propose',propose(row,{rate:null}),false,400);await call(f,ROOT+'/propose',propose(row,{photo_current:false}),false,400);
  f.env.PARTNER_ASSETS.list=async()=>{throw Error('sensitive storage failure');};const d=await call(f,ROOT,undefined,false,503);assert.equal(JSON.stringify(d).includes('sensitive storage failure'),false);
 }finally{f.restore();}
});
test('preferences are scoped, versioned and never trigger outbound notifications',async()=>{
 const f=await setup();try{
  let p=await call(f,ROOT+'/preferences');assert.equal(p.preferences.enabled,false);
  p=await call(f,ROOT+'/preferences',{revision:null,enabled:true,category:'ถ่ายภาพ',area:'กรุงเทพฯ',budget_min:5000});assert.equal(p.preferences.enabled,true);
  await call(f,ROOT+'/preferences',{revision:null,enabled:false,category:'',area:'',budget_min:null},false,409);
  const d=await call(f,ROOT+'/preferences',{revision:p.revision,...p.preferences,mark_read:true});assert.ok(d.preferences.seen_at);assert.equal((await call(f,ROOT)).announcements.length,0);assert.equal(f.messages.length,0);
 }finally{f.restore();}
});
