import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./index.js',import.meta.url),'utf8');
const start=source.indexOf('async function createSessionIfMissing('),end=source.indexOf('\n/* -------------------------------------------------- */\n/* telegram */',start);
assert.ok(start>=0&&end>start);
// Execute the actual legacy writer, with every authority/storage call replaced.
function fixture(existing){
 const writes=[];const context=vm.createContext({nowIso:()=> "2026-11-04T00:00:00Z",findSessionBySessionId:async()=>existing,getSessionsTable:()=> 'fixture-sessions',compact:o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)),airtablePatch:async(_e,_t,id,fields)=>{writes.push({id,fields});Object.assign(existing.fields,fields);},airtableCreate:async(_e,_t,fields)=>{writes.push({fields});return {id:'recSyntheticCreated'};}});
 vm.runInContext(source.slice(start,end)+';globalThis.writer=createSessionIfMissing;',context);
 return {writes,write:payload=>context.writer({},payload)};
}
for(const state of ['payout_pending','closed'])test('confirm-link writer preserves existing '+state+' payout snapshot',async()=>{
 const record={id:'recSyntheticSession',fields:{session_id:'fixture-session',pay_model_thb:10000,model_session_state:state}};
 const f=fixture(record);const result=await f.write({session_id:'fixture-session',pay_model_thb:9000});
 assert.equal(result.pay_model_thb,10000);assert.equal(result.payout_preserved,true);assert.equal(record.fields.pay_model_thb,10000);assert.equal(f.writes.length,1);assert.equal(Object.hasOwn(f.writes[0].fields,'pay_model_thb'),false);
});
test('confirm-link initializes payout on a newly created Session',async()=>{
 const f=fixture(null);await f.write({session_id:'fixture-new-session',pay_model_thb:9000});assert.equal(f.writes[0].fields.pay_model_thb,9000);
});
