import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('./model-console-v3-i18n.js', import.meta.url), 'utf8');
const loadCode = source.slice(source.indexOf('async function load()'), source.indexOf('async function act('));

async function run(status, payload, search = '') {
  const views = [], errors = [], requests = [];
  const context = {
    busy: false, posting: false, read: 0, controller: null, P: new URLSearchParams(search), ses: { session_id: 'old-job' }, err: '',
    R: { dataset: { currentEndpoint: '/v1/model/session/current' } },
    AbortController, setTimeout, clearTimeout,
    lock(value) { context.busy = value; },
    view(value) { views.push(value); }, chip() {}, d: () => ({}),
    modeCopy() { errors.push(context.err); },
    render() { views.push(context.ses === null ? 'empty' : 'work'); },
    j: response => response.json(),
    async fetch(url, options) {
      requests.push({ url, options });
      return { status, ok: status >= 200 && status < 300, json: async () => payload };
    },
  };
  await vm.runInNewContext(loadCode + ';load()', context);
  assert.equal(context.busy, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, undefined);
  assert.equal(requests[0].options.credentials, 'include');
  return { context, views, errors, requests, reload: () => vm.runInNewContext(loadCode + ';load()', context) };
}

test('only the exact no-job 404 clears stale job and renders empty', async () => {
  const result = await run(404, { ok: false, error: 'session_not_found' });
  assert.equal(result.context.ses, null);
  assert.deepEqual(result.views, ['loading', 'empty']);
  assert.deepEqual(result.errors, []);
});

for (const status of [401, 403]) {
  test(`${status} remains an authentication error even with no-job payload`, async () => {
    const result = await run(status, { error: 'session_not_found' });
    assert.deepEqual(result.views, ['loading', 'error']);
    assert.deepEqual(result.errors, ['auth']);
  });
}

for (const [status, payload] of [
  [503, { error: 'session_not_found' }],
  [503, { error: 'session_lookup_unavailable' }],
  [404, { error: 'route_not_found' }],
  [404, {}],
  [200, { ok: false, error: 'session_not_found' }],
]) {
  test(`${status}/${payload.error || 'missing error'} remains a load error`, async () => {
    const result = await run(status, payload);
    assert.deepEqual(result.views, ['loading', 'error']);
    assert.deepEqual(result.errors, ['load']);
  });
}

test('successful null session remains empty and a real job remains visible', async () => {
  assert.deepEqual((await run(200, { ok: true, session: null })).views, ['loading', 'empty']);
  assert.deepEqual((await run(200, { ok: true, session: { session_id: 'fixture-job' } })).views, ['loading', 'work']);
});

const actCode=source.slice(source.indexOf('async function act('),source.indexOf('function support('));
const lifecycleCode=source.slice(source.lastIndexOf("addEventListener('pagehide'"),source.lastIndexOf('load()})();'));
function lifecycle(context){const listeners={};context.addEventListener=(name,fn)=>{listeners[name]=fn;};vm.runInNewContext(loadCode+lifecycleCode,context);return listeners;}
async function tick(){for(let n=0;n<4;n++)await new Promise(setImmediate);}

test('Console A remains A after refresh and reopening the same Dashboard link',async()=>{
  const payload={ok:true,session:{session_id:'sess_A'}};
  const f=await run(200,payload,'?session_id=sess_A');await f.reload();
  assert.equal(f.context.ses.session_id,'sess_A');assert.equal(f.context.P.get('session_id'),'sess_A');
  const reopened=await run(200,payload,'?session_id=sess_A');
  assert.equal(reopened.context.ses.session_id,'sess_A');
  assert.ok(f.requests.every(x=>x.options.method===undefined));
  assert.ok(f.requests.every(x=>x.url==='/v1/model/session/current'),'context does not select or authorize an API record');
});
for(const [status,payload] of [[200,{ok:true,session:{session_id:'sess_B'}}],[200,{ok:true,session:null}],[404,{ok:false,error:'session_not_found'}]]){
 test('pinned A blocks '+status+'/'+(payload.session?.session_id||'missing')+' without showing another job or sending an action',async()=>{
  const f=await run(200,{ok:true,session:{session_id:'sess_A'}},'?session_id=sess_A');
  f.context.fetch=async()=>({status,ok:status===200,json:async()=>payload});await f.reload();
  assert.equal(f.context.ses,null);assert.equal(f.context.err,'context');assert.equal(f.views.at(-1),'error');
  assert.equal(f.context.P.get('session_id'),'sess_A');
  f.context.fetch=async()=>{throw Error('no action allowed after context mismatch');};
  assert.equal(await vm.runInNewContext(actCode+';act("start_travel")',f.context),false);
  const reopened=await run(status,payload,'?session_id=sess_A');assert.equal(reopened.context.ses,null);assert.equal(reopened.context.err,'context');
 });
}
for(const status of [401,403,503])test('pinned context preserves '+status+' auth/service failure',async()=>{
 const f=await run(status,{ok:false,error:'session_not_found'},'?session_id=sess_A');
 assert.equal(f.context.err,status===503?'load':'auth');assert.equal(f.context.ses,null);
});
test('BFCache reopen re-reads A and ignores a late A response after backend moved to B',async()=>{
 const f=await run(200,{ok:true,session:{session_id:'sess_A'}},'?session_id=sess_A');
 const events=lifecycle(f.context);let resolve;
 f.context.fetch=()=>new Promise(done=>{resolve=done;});const pending=f.reload();
 const controller=f.context.controller;events.pagehide();assert.equal(controller.signal.aborted,true);assert.equal(f.context.ses,null);
 f.context.fetch=async()=>({status:200,ok:true,json:async()=>({ok:true,session:{session_id:'sess_B'}})});
 events.pageshow({persisted:true});await tick();assert.equal(f.context.err,'context');
 resolve({status:200,ok:true,json:async()=>({ok:true,session:{session_id:'sess_A'}})});await pending;
 assert.equal(f.context.ses,null);assert.equal(f.context.err,'context');assert.equal(f.context.busy,0);
 f.context.fetch=async()=>({status:200,ok:true,json:async()=>({ok:true,session:{session_id:'sess_A'}})});
 events.pagehide();events.pageshow({persisted:true});await tick();assert.equal(f.context.ses.session_id,'sess_A');
});

test('session context recovery copy is available in TH, EN and ZH',()=>{
 const copy=vm.runInNewContext('('+source.match(/const C=(.*?),\$=s=>/)[1]+')');
 for(const lang of ['th','en','zh'])assert.match(copy[lang].contextCopy,/MY MODEL/);
});

test('reopening a cached Console never releases an action still waiting for its response',async()=>{
 const payload={ok:true,session:{session_id:'sess_A',state:'confirmed',allowed_actions:['start_travel']}};
 const f=await run(200,payload,'?session_id=sess_A'),events=lifecycle(f.context);let finish,posts=0;
 Object.assign(f.context,{next:{confirmed:['start_travel']},state:s=>s.state,v:(s,keys)=>s[keys[0]],note(){}});
 f.context.fetch=async(_url,options={})=>{
  if(options.method==='POST'){posts++;return new Promise(done=>{finish=done;});}
  return {status:200,ok:true,json:async()=>payload};
 };
 const first=vm.runInNewContext(actCode+';act("start_travel")',f.context);
 events.pagehide();events.pageshow({persisted:true});await tick();
 assert.equal(f.context.ses.session_id,'sess_A');
 assert.equal(await vm.runInNewContext(actCode+';act("start_travel")',f.context),false);
 assert.equal(posts,1);
 finish({status:503,ok:false,json:async()=>({ok:false})});await first;
 assert.equal(posts,1,'no automatic retry or real notification');assert.equal(f.context.posting,0);
});
