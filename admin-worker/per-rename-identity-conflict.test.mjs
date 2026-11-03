import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCreateSessionClientLineageRequest} from './src/create-session-client-lineage-runtime.js';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32);
const env={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',INTERNAL_TOKEN:'fixture',AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID:'index',AIRTABLE_TABLE_CLIENTS_ID:'clients'};
async function lookup(t,{query='Remembered',expected='',clientLine=B,rows,missing=false,malformed=false}={}) {
 const calls=[];
 t.mock.method(globalThis,'fetch',async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url),method=init.method||'GET';
  assert.equal(url.hostname,'api.airtable.com');assert.equal(method,'GET');calls.push(url.pathname);
  if(url.pathname.endsWith('/index'))return malformed?new Response('{broken',{headers:{'Content-Type':'application/json'}}):Response.json({records:rows||[{id:'recIndexA',fields:{identity_key:'line_ofc_per_rename:'+A.toLowerCase(),source_type:'line_ofc_staging',source_record_id:'recSourceA',preferred_name:'Remembered',line_user_id:A,linked_client:['recClientA'],resolution_status:'linked',session_lookup_status:'canonical_ready'}}]});
  if(url.pathname.includes('/clients/'))return missing?Response.json({error:'NOT_FOUND'},{status:404}):Response.json({id:url.pathname.split('/').at(-1),fields:{'Client Name':'Canonical',line_user_id:clientLine}});
  return Response.json({records:[]});
 });
 const load=async()=>{const r=await handleCreateSessionClientLineageRequest(new Request('https://fixture.invalid/v1/admin/clients/lineage-lookup',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({query,canonical_only:true,...(expected?{line_user_id:expected}:{})})}),env);return {status:r.status,header:r.headers.get('X-MMD-Per-Rename-Search'),body:await r.json()};};
 const first=await load();assert.deepEqual(await load(),first);return {...first,calls};
}
test('Per Rename validates index UID against canonical Client even when caller omits UID',async t=>{
 const r=await lookup(t);assert.equal(r.header,'ambiguous');assert.deepEqual(r.body.records,[]);assert.equal(r.body.manual_fallback,false);
});
test('matching canonical UID resolves without a caller UID and without membership claims',async t=>{
 const r=await lookup(t,{clientLine:A});assert.equal(r.header,'resolved');assert.equal(r.body.records[0].line_user_id,A);assert.equal(r.body.records[0].tier,'');
});
test('supplied expected UID cannot override conflicting canonical UID',async t=>{
 const r=await lookup(t,{expected:A});assert.equal(r.header,'ambiguous');assert.deepEqual(r.body.records,[]);assert.equal(r.body.manual_fallback,false);
});
test('linked canonical record missing is unavailable, not no-match with legacy fallback',async t=>{
 const r=await lookup(t,{missing:true});assert.equal(r.status,503);assert.equal(r.body.error,'per_rename_lookup_unavailable');
});
test('malformed authority response is unavailable, not an empty successful index',async t=>{
 const r=await lookup(t,{malformed:true});assert.equal(r.status,503);assert.equal(r.body.error,'per_rename_lookup_unavailable');
});
