import test from 'node:test';
import assert from 'node:assert/strict';
import { jobReadinessFollowthrough } from './src/job-readiness-followthrough.js';

function session(overrides={}) { return {id:'recSession',fields:{fldpnqoIsUMfN7y3c:'2026-10-04',fldBeG0FkWwa8kgnp:'16:00',fldiDSz0wW9Ct9I3P:'17:30',fldIiRpaxoafjTkFt:'Previous Hotel',fldJSS5GNN7quJwa8:'2026-09-22T01:00:00Z',fldFgkHXivIAThfDz:'2026-09-22T02:00:00Z',fld57fhdWqIcOy4Jp:'confirmed',...overrides}}; }
function change(overrides={}) { return {id:'recRequest',fields:{fldWMwebmHhyVQLzW:'request-1',fldbL2Ya44l6xEYe1:['recSession'],fldMD3Fhu0ibDmjk0:'sess-1',fldxg0WIVCmxtdRCF:'location_change',fldcBkBS70bWBgI8A:'pending_review',fld9W8UEOXpsfJT5P:'{"location_name":"Previous Hotel"}',fld8DqBrOmY6lQzGA:'{"location_name":"New Hotel","private_payout":22000,"token":"secret"}',fldjwQWRjxXqrFiAU:'Please confirm the new place',fldU2e6BO3fVdGyFF:'2026-09-22T03:00:00Z',...overrides}}; }
const project=(records=[],s=session(),list=async()=>records)=>jobReadinessFollowthrough({}, {session:s,sessionId:'sess-1',list});

test('a new location request blocks the pre-job checklist even after both acknowledgements',async()=>{
 const d=await project([change()]);assert.equal(d.checklist_complete,false);assert.equal(d.next_action,'review_changes');assert.equal(d.change_requests.open_count,1);assert.equal(d.details.location_name,'Previous Hotel');assert.equal(d.change_requests.items[0].requested_value.location_name,'New Hotel');assert.doesNotMatch(JSON.stringify(d),/22000|secret|private_payout/);assert.equal(d.can_start_work,false);
});

test('approved requests remain open until applied; rejected and withdrawn stay in history',async()=>{
 for(const status of ['pending_review','approved','applied','rejected','withdrawn']){const d=await project([change({fldcBkBS70bWBgI8A:status})]);assert.equal(d.change_requests.open_count,['pending_review','approved'].includes(status)?1:0);assert.equal(d.checklist_complete,!['pending_review','approved'].includes(status));assert.equal(d.change_requests.items.length,1);assert.equal(d.can_start_work,false);}
});

test('unavailable, incomplete, duplicate, malformed and cross-job requests cannot claim no pending work',async()=>{
 const variants=[[change({fldbL2Ya44l6xEYe1:['other']})],[change({fldMD3Fhu0ibDmjk0:'other'})],[change(),change()],[change({fldcBkBS70bWBgI8A:'future_status'})],[change({fld8DqBrOmY6lQzGA:'{broken'})]];
 for(const rows of variants){const d=await project(rows);assert.equal(d.change_requests.source_status,'incomplete');assert.equal(d.change_requests.open_count,null);assert.equal(d.checklist_complete,false);assert.equal(d.next_action,'reload_changes');if(rows[0].fields.fldbL2Ya44l6xEYe1[0]==='other'||rows[0].fields.fldMD3Fhu0ibDmjk0==='other')assert.equal(d.change_requests.items.length,0);}
 const failed=await project([],session(),async()=>{throw Error('limit exceeded')});assert.equal(failed.change_requests.source_status,'unavailable');assert.equal(failed.change_requests.open_count,null);assert.equal(failed.checklist_complete,false);
});

test('missing details and prior-location placeholder never become customer confirmation',async()=>{
 const d=await project([],session({fldpnqoIsUMfN7y3c:'2026-02-30',fldBeG0FkWwa8kgnp:'25:90',fldiDSz0wW9Ct9I3P:'',fldIiRpaxoafjTkFt:'TBD',fldJSS5GNN7quJwa8:''}));assert.deepEqual(d.missing_fields,['job_date','start_time','end_time','location_name']);assert.equal(d.checklist_complete,false);assert.equal(d.next_action,'complete_details');const assumed=await project([],session({fldJSS5GNN7quJwa8:''}));assert.equal(assumed.checks[0].status,'complete');assert.equal(assumed.checklist_complete,false);assert.equal(assumed.next_action,'customer_confirmation');
});

test('lifecycle comes from the model contract, not the clock or money status',async()=>{
 for(const [raw,expected] of [['traveling','en_route'],['nearby','nearby'],['work_started','work_started'],['offer_declined','offer_declined'],['invented',null],['',null]]){const d=await project([],session({fld57fhdWqIcOy4Jp:raw,fldpnqoIsUMfN7y3c:'2020-01-01'}));assert.equal(d.lifecycle.state,expected);assert.equal(d.can_start_work,false);if(raw==='offer_declined'){assert.equal(d.checklist_complete,false);assert.equal(d.next_action,'model_assignment')}}
});

test('request lookup is exact, bounded and requires complete pagination',async()=>{
 await project([],session(),async(table,params)=>{assert.equal(table,'tblhQGfJc4GgiteZr');assert.equal(params.filterByFormula,"{session_id}='sess-1'");assert.equal(params.requireComplete,true);assert.equal(params.maxRecords,100);assert.equal(params.returnFieldsByFieldId,true);return[]});
});
