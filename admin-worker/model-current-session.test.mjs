import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { readCanonicalCurrentSession, selectCanonicalCurrentSession } from './src/model-current-session.js';
const NOW = Date.parse('2026-10-16T07:00:00Z');
const BOOK = 'recBookModel', BANK = 'recBankModel';
const row = (id, model, day, state = 'confirmed', extra = {}) => ({ id, fields: { session_id: id, 'Canonical Model': [model], job_date: day, start_time: day+'T18:00:00+07:00', model_session_state: state, ...extra } });
const select = (rows, model = BOOK) => selectCanonicalCurrentSession(rows, model, {}, NOW);
test('BOOK EI readback-shaped fixture: legacy Confirmed never invents model lifecycle or lane', () => {
 const rows=[row('old',BOOK,'2026-09-17'),row('oct18',BOOK,'2026-10-18','',{'Session Status':'Confirmed'}),row('oct25',BOOK,'2026-10-25','',{'Session Status':'Confirmed'})];
 const before=JSON.stringify(rows);assert.equal(select(rows).error,'current_session_review_required');assert.equal(JSON.stringify(rows),before);
});
test('Bank EI ignores past stale job and selects canonical confirmed Oct17 regardless of row order', () => {
 const rows=[row('oct13',BANK,'2026-10-13',''),row('oct17',BANK,'2026-10-17','confirmed',{model_work_lane:'private_model'})];
 for(const order of [rows,[...rows].reverse()])assert.equal(select(order,BANK).record.id,'oct17');
});
test('nearest upcoming confirmed job wins; not latest-created or first Airtable row', () => {
 const rows=[row('oct25',BOOK,'2026-10-25'),row('oct18',BOOK,'2026-10-18')];
 assert.equal(select(rows).record.id,'oct18');assert.equal(select(rows.reverse()).record.id,'oct18');
});
test('canonical relation defeats matching nickname/legacy assignment; other model is never substituted', () => {
 const other=row('other',BANK,'2026-10-17','confirmed',{'Assigned Model':BOOK,model_name:'Book EI'});
 assert.equal(select([other]).status,404);assert.equal(select([row('mine',BOOK,'2026-10-18'),other]).record.id,'mine');
});
test('one running job wins over future planned jobs, multiple running jobs require review', () => {
 const active=row('active',BOOK,'2026-10-15','en_route');assert.equal(select([row('next',BOOK,'2026-10-17'),active]).record.id,'active');
 assert.equal(select([active,row('also',BOOK,'2026-10-16','work_started')]).status,409);
});
test('missing dates, invalid timezone, conflicting dates, ambiguous links and equal times fail closed', () => {
 for(const extra of [{job_date:'',start_time:''},{start_time:'2026-10-18T18:00:00'},{job_date:'2026-10-19'},{'Canonical Model':[BOOK,BANK]},{'Canonical Model':[BOOK,'Book EI']}])assert.equal(select([row('bad',BOOK,'2026-10-18','confirmed',extra)]).status,409);
 assert.equal(select([row('a',BOOK,'2026-10-18'),row('b',BOOK,'2026-10-18')]).status,409);
});
test('Bangkok midnight and same-day scheduled jobs are handled without UTC-day drift', () => {
 const r=row('sameDay',BOOK,'2026-10-17','confirmed',{start_time:'2026-10-16T17:30:00Z'});
 assert.equal(selectCanonicalCurrentSession([r],BOOK,{},Date.parse('2026-10-16T17:10:00Z')).record.id,'sameDay');
});
test('terminal states and past-only jobs do not become current', () => {
 for(const state of ['closed','separated','offer_declined','offer_expired','under_review','payout_pending','work_finished'])assert.equal(select([row('done',BOOK,'2026-10-18',state)]).status,404);
 assert.equal(select([row('past',BOOK,'2026-09-17')]).status,404);
});
test('missing lane stays missing; selector does not touch money or fields', () => {
 const r=row('mine',BOOK,'2026-10-18','confirmed',{pay_model_thb:1234,payment_status:'partial'}),before=JSON.stringify(r);
 const result=select([r]);assert.equal(result.record,r);assert.equal(result.record.fields.model_work_lane,undefined);assert.equal(JSON.stringify(r),before);
});
const ENV={AIRTABLE_API_KEY:'fixture-only',AIRTABLE_BASE_ID:'appFixture',AT_SESSIONS__MODEL_RECORD_ID:'Assigned Model'};
test('lookup always queries Canonical Model even with deployed legacy mapping and reads all pages', async () => {
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});const p=new URL(url).searchParams;assert.match(p.get('filterByFormula'),/Canonical Model/);assert.doesNotMatch(p.get('filterByFormula'),/Assigned Model/);
  return Response.json(p.has('offset')?{records:[row('near',BOOK,'2026-10-18')]}:{records:[row('far',BOOK,'2026-10-25')],offset:'page2'});};
 const result=await readCanonicalCurrentSession(ENV,BOOK,{now:NOW,fetcher});assert.equal(result.record.id,'near');assert.equal(calls.length,2);assert.ok(calls.every(c=>!c.options.method||c.options.method==='GET'));
});
test('lookup failure, malformed payload and repeated offsets do not select from a partial cohort', async () => {
 for(const fetcher of [async()=>new Response('',{status:503}),async()=>Response.json({}),async()=>Response.json({records:[row('mine',BOOK,'2026-10-18')],offset:'again'})])assert.equal((await readCanonicalCurrentSession(ENV,BOOK,{now:NOW,fetcher})).status,503);
});

for(const file of ['model-liff-worker-pre-manual-review.js','model-liff-worker-legacy.js']) {
 test(file+' exchange lookup uses the same selector and cannot invent confirmed state', async () => {
  const source=fs.readFileSync(new URL('./src/'+file,import.meta.url),'utf8');
  const start=source.indexOf('async function findActiveSessionForModel('),end=source.indexOf('\nasync function ',start+10);
  const code=source.slice(start,end);
  assert.match(source,/import \{ readCanonicalCurrentSession \} from "\.\/model-current-session\.js"/);
  for(const result of [{ok:false,status:409,error:'current_session_review_required'},{ok:true,record:row('bank',BANK,'2026-10-17')}]) {
   const context={clean:v=>String(v||''),readCanonicalCurrentSession:async(env,id)=>{assert.equal(id,BANK);return result;}};
   const resolve=vm.runInNewContext(code+';findActiveSessionForModel;',context);
   const answer=await resolve({}, {id:BANK});
   if(!result.ok)assert.equal(answer,result);
   else {assert.equal(answer.sessionId,'bank');assert.equal(answer.state,'confirmed');assert.equal(answer.record,result.record);}
  }
 });
}
