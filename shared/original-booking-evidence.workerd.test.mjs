// Synthetic local runtime test. No production bindings or external requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from '../member-pages-worker/test-runtime/node_modules/miniflare/dist/src/index.js';
test('workerd reader resolves synthetic evidence and rejects redirects at both reads',async()=>{
 const source=readFileSync(new URL('./original-booking-evidence.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
 const tests=readFileSync(new URL('./original-booking-evidence.test.mjs',import.meta.url),'utf8');
 const rowLine=tests.match(/^function row\(\).*$/m)[0];
 const fixture=new Function('CLIENT','ROW',rowLine+';return row();')('recAAAAAAAAAAAAAA','recCCCCCCCCCCCCCC');
 let external=0;
 const script=source+`\nexport default {async fetch(request){
 const url=new URL(request.url),status=Number(url.searchParams.get('status')||200),stage=Number(url.searchParams.get('stage')||1);
 const row=${JSON.stringify(fixture)};let calls=0;
 const value=await readOriginalBookingEvidence({AIRTABLE_BASE_ID:'app'+'a'.repeat(14),AIRTABLE_API_KEY:'local-fixture'},'recAAAAAAAAAAAAAA',async req=>{
  calls++;if(req.redirect!=='manual'||req.method!=='GET'||new URL(req.url).hostname!=='api.airtable.com')throw Error('unsafe request');
  if(status!==200&&calls===stage)return new Response(null,{status,headers:{location:'https://untrusted.invalid/never-follow'}});
  return calls===1?Response.json({id:'recAAAAAAAAAAAAAA',fields:{fld4baNAJwnMsnhMg:[row.id]}}):Response.json({records:[row]});
 });return Response.json({value,calls});}};`;
 const mf=new Miniflare({workers:[{config:{name:'fixture',type:'worker',compatibilityDate:'2026-06-20',compatibilityFlags:[],manifest:{mainModule:'fixture.mjs',modulesRoot:'/tmp',modules:{'fixture.mjs':{type:'esm',contents:script}}}},dev:{outboundService:{type:'fetcher',handler:()=>{external++;throw Error('network forbidden');}}}}]});
 try{
  const success=await (await mf.dispatchFetch('https://fixture.invalid')).json();
  assert.equal(success.value.state,'resolved');assert.equal(success.value.items.length,1);assert.equal(success.calls,2);
  assert.equal(success.value.items[0].completionProven,false);
  for(const status of [301,302,303,307,308,401,403,404,500,503])for(const stage of [1,2]){
   const result=await (await mf.dispatchFetch('https://fixture.invalid?status='+status+'&stage='+stage)).json();
   assert.deepEqual(result.value,{state:'unavailable',items:[]});assert.equal(result.calls,stage);
  }
  assert.equal(external,0);
 }finally{await mf.dispose();}
});
