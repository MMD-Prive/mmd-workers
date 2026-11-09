import test from 'node:test';
import assert from 'node:assert/strict';
import { threeMonthReviewWindow, reviewModelPublication, checkPublicationHistory, REVIEW_ROOT, REVIEW_SCHEMA } from './src/compcard-history-review.js';
import { COMPCARD_JOURNAL_ROOT } from './src/compcard-journal.js';
import { runCompcardDaily, compcardSha256 } from './src/compcard-daily.js';
const NOW = Date.parse('2026-11-09T16:30:00+07:00');
const ROOMS = {premium:'-1001668261779',standard:'-1002073919780',preview:'-1002393788585'};
const ID = 'recTestModel001';
function bucket() {
 const rows = new Map(); let n=0;
 return {rows,async get(key){const row=rows.get(key);return row?{etag:row.etag,text:async()=>row.value}:null;},
 async put(key,value,options={}){const old=rows.get(key);if(options.onlyIf?.etagDoesNotMatch==='*'&&old||options.onlyIf?.etagMatches&&options.onlyIf.etagMatches!==old?.etag)return null;const row={etag:String(++n),value};rows.set(key,row);return {etag:row.etag};}};
}
const put=(b,key,value)=>b.put(COMPCARD_JOURNAL_ROOT+key,JSON.stringify(value));
function proof(now=NOW,id=ID) {return {schema:REVIEW_SCHEMA,model_id:id,timezone:'Asia/Bangkok',revision:'test-only',reviewed_by:'test fixture',reviewed_at:now,
 rooms:Object.entries(ROOMS).map(([destination,chat_id])=>({destination,chat_id,status:'verified_complete',manual_posts_included:true,includes_all_authors:true,reconciliation_method:'direct_room_history_review',identity_reconciliation_complete:true,unresolved_count:0,from:threeMonthReviewWindow(now).from,through:now,evidence_refs:['test-only complete synthetic history'],observations:[]}))};}
async function seed(b,p=proof()){await put(b,REVIEW_ROOT+'models/'+p.model_id+'.json',p);}
test('three calendar months uses Bangkok date, clamps month end, and is not ninety days',()=>{
 const now=Date.parse('2026-05-31T23:45:00+07:00'); const w=threeMonthReviewWindow(now);
 assert.equal(new Date(w.from).toISOString(),'2026-02-28T16:45:00.000Z');
 assert.notEqual(now-w.from,90*86400000);
 assert.equal(threeMonthReviewWindow(Date.parse('2026-11-08T18:00:00Z')).date,'2026-11-09');
 assert.equal(new Date(threeMonthReviewWindow(Date.parse('2024-05-31T00:00:00+07:00')).from).toISOString(),'2024-02-28T17:00:00.000Z');
});
test('missing history holds all models, no fabricated completeness, deduplicated explicitly undelivered warning',async()=>{
 const b=bucket(); for(let i=0;i<2;i++){const r=await checkPublicationHistory(b,{model_id:ID},ROOMS,'model',NOW);assert.equal(r.allowed,false);assert.equal(r.warning_delivery,'undelivered');assert.equal(r.warning_error,'owner_route_not_configured');assert.ok(r.coverage.every(x=>x.status==='incomplete_or_unverifiable'));}
 assert.equal([...b.rows.keys()].filter(k=>k.includes('owner-outbox')).length,1);
});
test('fresh verified all-room evidence can clear review without changing seven-day policy',async()=>{
 const b=bucket();await seed(b);const r=await reviewModelPublication(b,ID,ROOMS,NOW);assert.equal(r.allowed,true);assert.equal(r.coverage.length,3);
});
for(const [label,change] of [
 ['manual history missing',p=>p.rooms[0].manual_posts_included=false],
 ['unresolved identity',p=>p.rooms[1].unresolved_count=1],
 ['even one millisecond of unverified history',p=>p.rooms[2].through=NOW-1],
 ['short window',p=>p.rooms[0].from++],
 ['wrong room',p=>p.rooms[0].chat_id='-123'],
 ['future watermark',p=>p.rooms[0].through=NOW+1],
 ['future review',p=>p.reviewed_at=NOW+1],
 ['wrong model',p=>p.model_id='recOther'],
 ['missing evidence',p=>p.rooms[0].evidence_refs=[]],
 ['duplicate room',p=>p.rooms[1]={...p.rooms[0]}],
])test(label+' holds',async()=>{const b=bucket(),p=proof();change(p);await put(b,REVIEW_ROOT+'models/'+ID+'.json',p);assert.equal((await reviewModelPublication(b,ID,ROOMS,NOW)).allowed,false);});
for(const destination of Object.keys(ROOMS))test('recent verified '+destination+' exposure holds cross-room',async()=>{
 const b=bucket(),p=proof();p.rooms.find(r=>r.destination===destination).observations.push({model_id:ID,identity_verified:true,identity_evidence_ref:'test canonical match',source_ref:'test verified message',message_id:1,posted_at:NOW-40*86400000,chat_id:ROOMS[destination]});await seed(b,p);
 const r=await reviewModelPublication(b,ID,ROOMS,NOW);assert.ok(r.reasons.includes('compcard_review_recent_exposure'));
});
test('malformed observed identity cannot be silently ignored as clear',async()=>{const b=bucket(),p=proof();p.rooms[0].observations=[{model_id:'recOther'}];await seed(b,p);assert.equal((await reviewModelPublication(b,ID,ROOMS,NOW)).allowed,false);});
test('journal is positive evidence, never coverage; prior not_sent fallback holds',async()=>{
 const b=bucket();await seed(b);await put(b,'history/'+ID+'.json',{model_id:ID,status:'not_sent',date:'2026-11-09',previous_exposure:{model_id:ID,status:'sent',date:'2026-11-01'}});
 assert.ok((await reviewModelPublication(b,ID,ROOMS,NOW)).reasons.includes('compcard_review_recent_exposure'));
});
test('Tinn remains prohibited with complete clear history',async()=>{const b=bucket();await seed(b,proof(NOW,'recW0Whpu9maVjYF6'));assert.ok((await reviewModelPublication(b,'recW0Whpu9maVjYF6',ROOMS,NOW)).reasons.includes('compcard_automatic_selection_excluded'));});
test('extra unknown configured room fails scope rather than claiming all rooms checked',async()=>{const b=bucket();await seed(b);assert.ok((await reviewModelPublication(b,ID,{...ROOMS,other:'-555'},NOW)).reasons.includes('compcard_review_room_scope_unverified'));});
test('whole multi-target plan held before first customer send',async()=>{const b=bucket();await seed(b);const r=await checkPublicationHistory(b,{model_id:ID},ROOMS,'model',NOW,['premium','preview']);assert.ok(r.reasons.includes('compcard_review_multi_room_scope_required'));});
async function runnerFixture({verified=false,category='premium'}={}){
 const b=bucket(),bytes=new Uint8Array([137,80,78,71]),sha256=await compcardSha256(bytes);
 const card={id:'approved-test-file01',file_id:'approved-test-file01',model_id:ID,canonical_name:'Test',display_name:'Test',category,sha256,bytes:bytes.length,content_type:'image/png'};
 const model={id:ID,fields:{working_name:'Test',status:'Active',sales_layer:'private',private_tier:category}};
 const manifest={revision:'test-only',source_folder_id:'test-folder',destinations:ROOMS,cards:[card],promotions:[]};
 if(verified)await seed(b);
 const sends=[]; const deps={bucket:b,manifest,models:async()=>[model],model:async()=>model,
 destinations:async()=>Object.entries(ROOMS).map(([destination,chat_id])=>({destination,chat_id,ok:true,identity_verified:true,can_send_photo:true})),
 asset:async()=>({bytes,sha256,content_type:'image/png'}),send:async(c,d,caption,data,chat)=>{sends.push(d);return {ok:true,delivery_state:'sent',destination:d,chat_id:chat,message_id:1,approved_sha256:sha256};}};
 return {b,card,deps,sends,env:{HYPE_COMPCARD_ENABLED:'true',HYPE_PROMOTION_ENABLED:'false'}};
}
test('runner missing coverage holds before plan/transport; promotion flag stays false',async()=>{const f=await runnerFixture();const r=await runCompcardDaily(f.env,{now:NOW,deps:f.deps});assert.equal(r.results[0].status,'publication_review_hold');assert.deepEqual(f.sends,[]);assert.equal(f.env.HYPE_PROMOTION_ENABLED,'false');assert.ok(![...f.b.rows.keys()].some(k=>k.includes('/plans/')));});
test('runner rechecks proof after slow asset read immediately before send',async()=>{
 const f=await runnerFixture({verified:true});let n=0;const original=f.deps.asset;f.deps.asset=async()=>{if(++n===2)await seed(f.b,{...proof(),rooms:[]});return original();};
 const r=await runCompcardDaily(f.env,{now:NOW,deps:f.deps});assert.deepEqual(f.sends,[]);assert.equal(r.results[0].outcomes[0].error,'compcard_publication_review_hold');
});
test('valid review sends once and existing terminal sent receipt survives expired/removed proof unchanged',async()=>{
 const f=await runnerFixture({verified:true});await runCompcardDaily(f.env,{now:NOW,deps:f.deps});assert.deepEqual(f.sends,['premium']);
 const key=COMPCARD_JOURNAL_ROOT+'deliveries/2026-11-09/model/premium.json';const prior=f.b.rows.get(key).value;
 await seed(f.b,{...proof(),rooms:[]});await runCompcardDaily(f.env,{now:NOW+1000,deps:f.deps});assert.equal(f.b.rows.get(key).value,prior);assert.equal(f.sends.length,1);
});
test('runner multi-room plan holds before either room gets a message',async()=>{const f=await runnerFixture({verified:true,category:'exclusive'});const r=await runCompcardDaily(f.env,{now:NOW,deps:f.deps});assert.equal(r.results[0].status,'publication_review_hold');assert.deepEqual(f.sends,[]);});

test('frozen retry cannot bypass a newly missing review',async()=>{
 const f=await runnerFixture({verified:true});let calls=0;f.deps.send=async()=>{calls++;return {delivery_state:'not_sent',error:'compcard_known_failure'};};
 await runCompcardDaily(f.env,{now:NOW,deps:f.deps});assert.equal(calls,1);
 const planKey=COMPCARD_JOURNAL_ROOT+'plans/2026-11-09/model.json';const plan=f.b.rows.get(planKey).value;
 await seed(f.b,{...proof(),rooms:[]});const r=await runCompcardDaily(f.env,{now:NOW+16*60000,deps:f.deps});
 assert.equal(calls,1);assert.equal(r.results[0].outcomes[0].error,'compcard_publication_review_hold');assert.equal(f.b.rows.get(planKey).value,plan);
});
test('pending legacy single-room plan requires current review and stays frozen',async()=>{
 const f=await runnerFixture({verified:true});f.deps.send=async()=>({delivery_state:'not_sent',error:'compcard_known_failure'});
 await runCompcardDaily(f.env,{now:NOW,deps:f.deps});
 const pk=COMPCARD_JOURNAL_ROOT+'plans/2026-11-09/model.json',dk=COMPCARD_JOURNAL_ROOT+'deliveries/2026-11-09/model/premium.json';
 const {digest,room_selection_policy,...plan}=JSON.parse(f.b.rows.get(pk).value);plan.digest=await compcardSha256(new TextEncoder().encode(JSON.stringify(plan)));
 await f.b.put(pk,JSON.stringify(plan));const delivery=JSON.parse(f.b.rows.get(dk).value);delivery.plan_digest=plan.digest;await f.b.put(dk,JSON.stringify(delivery));
 await seed(f.b,{...proof(),rooms:[]});let calls=0;f.deps.send=async()=>{calls++;throw new Error('must not send');};
 const r=await runCompcardDaily(f.env,{now:NOW+16*60000,deps:f.deps});assert.equal(calls,0);assert.equal(r.results[0].outcomes[0].error,'compcard_publication_review_hold');assert.equal(f.b.rows.get(pk).value,JSON.stringify(plan));
});
