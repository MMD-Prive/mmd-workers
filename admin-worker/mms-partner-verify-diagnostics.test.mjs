import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticStore, recordDiagnostic, readDiagnostics, DIAGNOSTIC_LIMIT } from './src/mms-partner-verify-diagnostics.mjs';
import { handleVerification, ROOT } from './src/mms-partner-line-verification.mjs';

const post=(path,body)=>new Request('https://www.mmdbkk.com'+ROOT+path,{method:'POST',headers:{origin:'https://www.mmdbkk.com','content-type':'application/json'},body:JSON.stringify(body)});
function fixture(){const objects=new Map();return {objects,env:{MMS_PARTNER_AUTH:{idFromName:n=>n,get:n=>{if(!objects.has(n))objects.set(n,new Map());const m=objects.get(n);return {fetch:r=>diagnosticStore(r,{get:async k=>m.get(k),put:async(k,v)=>m.set(k,v)})};}}}};}
const read=async(env,shop)=> (await readDiagnostics(env,shop)).json();
test('fixed vocabulary, sanitized storage readback, bounded history and exact shop isolation',async()=>{
 const {env,objects}=fixture();
 assert.equal(await recordDiagnostic(env,'kalima','client_ready'),true);
 assert.equal(await recordDiagnostic(env,'relax','request_failed','LINE_TOKEN_INVALID'),true);
 assert.equal(await recordDiagnostic(env,'unknown','client_ready'),false);
 assert.equal(await recordDiagnostic(env,'kalima','token-secret'),false);
 await recordDiagnostic(env,'kalima','request_failed','raw-private-error');
 assert.equal((await read(env,'kalima')).events.at(-1).code,'UNEXPECTED');
 const m=objects.get('mms-verify-diagnostics:v1:kalima'),events=m.get('verify-diagnostics:kalima');
 events.push({at:new Date().toISOString(),shop:'kalima',stage:'client_ready',code:'OK',id_token:'secret',line_id:'private'});
 events.push({at:new Date(Date.now()-86400001).toISOString(),shop:'kalima',stage:'client_ready',code:'OK'});
 events.push({at:new Date().toISOString(),shop:'relax',stage:'client_ready',code:'OK'});
 const body=await read(env,'kalima');assert.equal(body.events.length,3);
 for(const e of body.events)assert.deepEqual(Object.keys(e),['at','shop','stage','code']);
 assert.doesNotMatch(JSON.stringify(body),/secret|private|raw-private-error/);
 for(let n=0;n<DIAGNOSTIC_LIMIT+10;n++)await recordDiagnostic(env,'kalima','request_received');
 assert.equal((await read(env,'kalima')).events.length,DIAGNOSTIC_LIMIT);
 assert.equal((await read(env,'relax')).events.length,1);
});
test('browser event is write-only, cannot include identity or impersonate server stages and is rate limited',async()=>{
 const {env}=fixture(),opts={readOwner:async()=>null};
 for(const extra of [{id_token:'secret'},{line_id:'private'},{stage:'line_verified'},{code:'private-message'}]){
   const r=await handleVerification(post('/event',{shop_key:'kalima',stage:'client_ready',code:'OK',...extra}),env,opts);assert.equal(r.status,400);
 }
 for(let n=0;n<30;n++)assert.equal((await handleVerification(post('/event',{shop_key:'kalima',stage:'client_ready',code:'OK'}),env,opts)).status,200);
 assert.equal((await handleVerification(post('/event',{shop_key:'kalima',stage:'client_ready',code:'OK'}),env,opts)).status,503);
 assert.equal((await read(env,'kalima')).events.length,30);
 assert.equal((await read(env,'relax')).events.length,0);
});
test('diagnostic read and self-test require existing Owner role; self-test does not call Airtable',async()=>{
 const {env}=fixture();for(const actor of [null,{role:'mms_partner',id:'fixture'},{role:'owner',id:'fixture'}]){
   const opts={readOwner:async()=>actor},expected=!actor?401:actor.role==='owner'?200:403;
   assert.equal((await handleVerification(new Request('https://www.mmdbkk.com'+ROOT+'/diagnostics?shop=relax'),env,opts)).status,expected);
   assert.equal((await handleVerification(post('/diagnostics/check',{shop_key:'relax'}),env,opts)).status,expected);
 }
 assert.deepEqual((await read(env,'relax')).events.map(e=>e.stage),['diagnostic_self_test']);
 assert.equal((await read(env,'kalima')).events.length,0);
});
test('invalid LINE is recorded without retaining the supplied token, diagnostic outage leaves validation intact',async()=>{
 const {env}=fixture(),opts={readOwner:async()=>null};
 assert.equal((await handleVerification(post('/request',{shop_key:'kalima',id_token:'short-private-token',consent:true}),env,opts)).status,401);
 const events=(await read(env,'kalima')).events;assert.deepEqual(events.map(e=>[e.stage,e.code]),[['request_received','OK'],['request_failed','LINE_TOKEN_REQUIRED']]);
 assert.doesNotMatch(JSON.stringify(events),/short-private-token|id_token/);
 assert.equal((await handleVerification(post('/request',{shop_key:'kalima',id_token:'short',consent:true}),{},opts)).status,401);
});
