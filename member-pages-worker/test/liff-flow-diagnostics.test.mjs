import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlowDiagnosticSender} from '../src/liff-flow-diagnostics.js';
import {createStartDiagnostics} from '../src/liff-start-diagnostics.js';
import {handleLiffClientDiagnostic} from '../src/liff-client-runtime-diagnostic.js';
import {handleLiffMemberShell} from '../src/liff-member-shell.js';
import {runInNewContext} from 'node:vm';

test('render integration reports DOM hidden transitions after render, not from settlement alone',async()=>{
 const response=handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff'),{LINE_LIFF_ID:'2000000000-fixture'});
 const html=await response.text();
 const start=html.indexOf('render: (panel, state) => {',html.indexOf('const loaderVisibility'));
 const end=html.indexOf('}, request: window.fetch.bind(window) });',start);
 assert(start>0&&end>start);
 const node={hidden:false},events=[];
 const render=runInNewContext('(panel,state)=>{'+html.slice(start+'render: (panel, state) => {'.length,end)+'}',{
  renderLoadingProgress:(_panel,state)=>{node.hidden=state.pending===0&&!state.error;},entryLoading:{update(){}},
  document:{getElementById:()=>node},loaderVisibility:new Map(),flowDiagnostic:x=>events.push(x),Math,
 });
 render('history-panel',{pending:1,error:false});render('history-panel',{pending:0,error:false});render('history-panel',{pending:0,error:false});
 assert.deepEqual(events.map(x=>x.event),['loader.history.visible','loader.history.hidden']);
 assert.equal(events[1].pending,0);
});

test('server timing logs only fixed vocabulary, bounded numbers and random ref; preserves errors',async()=>{
 const rows=[];let now=0;
 const d=createStartDiagnostics({emit:x=>rows.push(x),now:()=>now});
 assert.equal(await d.step('verify_token',async()=>{now=123;return 'not-logged-secret';}), 'not-logged-secret');
 const error=new Error('private-secret');await assert.rejects(d.step('resolve_member',async()=>{throw error;}),x=>x===error);
 d.disconnected();d.complete(200);
 assert.equal(rows[1].duration_ms,123);assert(!JSON.stringify(rows).includes('secret'));
 for(const row of rows)assert.deepEqual(Object.keys(row).sort(),(row.status?['event','ref','stage','outcome','duration_ms','status']:['event','ref','stage','outcome','duration_ms']).sort());
 await assert.rejects(d.step('customer-private-field',async()=>{}));
 const ignored=createStartDiagnostics({emit:()=>{throw error;}});assert.equal(await ignored.step('safe_view',async()=>7),7);
});
test('browser sender caps events, projects payload and bypasses all business endpoints',()=>{
 const calls=[];const send=createFlowDiagnosticSender((path,init)=>{calls.push({path,init});return Promise.resolve();});
 send({event:'loader.history.settled',durationMs:3,pending:0,token:'must-not-leak'});
 for(const bad of [{event:'private-id',durationMs:0,pending:0},{event:'loader.history.hidden',durationMs:Infinity,pending:0},{event:'loader.history.hidden',durationMs:0,pending:1001}])send(bad);
 for(let i=0;i<100;i++)send({event:'loader.history.hidden',durationMs:0,pending:0});
 assert.equal(calls.length,80);assert(calls.every(x=>x.path==='/member/api/liff/client-diag'));
 assert.deepEqual(JSON.parse(calls[0].init.body),{stage:'loader.history.settled',duration_ms:3,pending:0});
 assert.doesNotThrow(()=>createFlowDiagnosticSender(()=>{throw Error('offline');})({event:'loader.history.hidden',durationMs:0,pending:0}));
});
test('existing receiver keeps legacy stages; structured diagnostics strictly bounded and untrusted',async()=>{
 const writes=[];const old=console.info;console.info=()=>{};
 const env={LIFF_IDENTITY_KV:{put:async(k,v)=>writes.push(JSON.parse(v))}};
 const req=(body,json=true)=>new Request('https://mmdbkk.com/member/api/liff/client-diag',{method:'POST',headers:{cookie:'mmd_liff_boundary=LIFFGET-ABCDEF123456',...(json?{'content-type':'application/json'}:{})},body});
 try{
  await handleLiffClientDiagnostic(req('liff_init_ok',false),env);assert.equal(writes.length,2);
  await handleLiffClientDiagnostic(req(JSON.stringify({stage:'loader.history.hidden',duration_ms:5,pending:0})),env);
  assert.equal(writes.length,4);assert.equal(writes[2].authority,'untrusted_client_diagnostic');
  await handleLiffClientDiagnostic(req(JSON.stringify({stage:'loader.start.signal_abort',duration_ms:10000,pending:1})),env);
  assert.equal(writes.length,6);
  await handleLiffClientDiagnostic(req(JSON.stringify({stage:['loader.history.hidden'],duration_ms:0,pending:0})),env);
  for(const body of ['x'.repeat(513),JSON.stringify({stage:'loader.history.hidden',duration_ms:1,pending:0,token:'secret'}),JSON.stringify({stage:'loader.history.hidden',duration_ms:-1,pending:0}),JSON.stringify({stage:'raw-id',duration_ms:1,pending:0})])await handleLiffClientDiagnostic(req(body),env);
  assert.equal(writes.length,6);assert(!JSON.stringify(writes).includes('secret'));
 }finally{console.info=old;}
});
