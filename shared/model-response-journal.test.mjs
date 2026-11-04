import test from 'node:test';
import assert from 'node:assert/strict';
import {recordModelResponse as run} from './model-response-journal.mjs';
function fixture(){
 const data=new Map();let seq=0,calls=0;
 const bucket={async get(k){let v=data.get(k);return v?{json:async()=>JSON.parse(v.body)}:null;},async put(k,body,{onlyIf}){let old=data.get(k);if(onlyIf.etagDoesNotMatch&&old)return null;if(onlyIf.etagMatches&&old?.etag!==onlyIf.etagMatches)return null;let etag=String(++seq);data.set(k,{body,etag});return{etag};}};
 const input={action:'accept_job',operation_id:'operation_00000001',session_id:'session_fixture',offer_revision:'revision_1'};
 const auth={ok:true,allowed:true,model_id:'model_fixture',session_id:input.session_id,offer_revision:'revision_1',binding:'binding_fixture'};
 const args={bucket,input,authorize:async()=>auth,apply:async()=>{calls++;return{ok:true,token:'must_not_escape'};},now:Date.parse('2026-11-04T00:00:00Z')};
 return {args,auth,data,calls:()=>calls};
}
test('concurrent duplicate acceptance applies once and replays the same sanitized receipt',async()=>{
 const f=fixture();let results=await Promise.all([run(f.args),run({...f.args,input:{...f.args.input,operation_id:'operation_other_tab'}})]);assert.equal(f.calls(),1);
 const done=results.find(x=>x.ok);assert.ok(done);assert.deepEqual(await run(f.args),done);assert.doesNotMatch(JSON.stringify(done),/must_not_escape|token/);
});
test('proposal is durable before apply and does not write a decline_reason field',async()=>{
 const f=fixture();f.args.input={...f.args.input,action:'decline_job',reason:'Unavailable',availability_options:['2026-11-05T12:00']};
 f.args.apply=async input=>{assert.equal(f.data.size,1);assert.deepEqual(JSON.parse([...f.data.values()][0].body).proposal.options,['2026-11-05T12:00']);assert.equal(input.decline_reason,undefined);return{ok:true};};
 const first=await run(f.args);assert.equal(first.ok,true);assert.deepEqual(await run({...f.args,now:Date.parse('2026-11-06T00:00:00Z')}),first);
});
test('unknown write outcome blocks automatic retries',async()=>{
 const f=fixture();let count=0;f.args.apply=async()=>{count++;throw Error('timeout');};assert.equal((await run(f.args)).receipt.outcome,'unknown');assert.equal((await run(f.args)).receipt.outcome,'unknown');assert.equal(count,1);
});
test('changed payload, revision, binding and lost ownership fail closed',async()=>{
 const f=fixture();await run(f.args);f.auth.binding='new_binding';assert.equal((await run(f.args)).receipt.code,'response_operation_conflict');f.auth.offer_revision='revision_2';assert.equal((await run(f.args)).receipt.code,'offer_revision_changed');f.auth.ok=false;assert.equal((await run(f.args)).receipt.code,'response_not_authorized');assert.equal(f.calls(),1);
});
test('invalid proposal and unavailable storage do not call the writer',async()=>{
 const f=fixture();f.args.input={...f.args.input,action:'decline_job',availability_options:[]};assert.equal((await run(f.args)).receipt.code,'decline_options_invalid');f.args.bucket.put=async()=>{throw Error('unavailable');};f.args.input={...f.args.input,availability_options:['2026-11-05T12:00']};assert.equal((await run(f.args)).receipt.outcome,'unknown');assert.equal(f.calls(),0);
});
test('receipt persistence failure does not repeat an already applied write',async()=>{
 const f=fixture();const put=f.args.bucket.put;let n=0;f.args.bucket.put=async(...args)=>{if(++n===2)throw Error('storage down');return put(...args);};assert.equal((await run(f.args)).receipt.outcome,'unknown');assert.equal((await run(f.args)).receipt.outcome,'unknown');assert.equal(f.calls(),1);
});
