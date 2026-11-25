import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {patchGateway} from './candidate/gateway-patch.mjs';
import {qaCustomerLinks} from './candidate/private-handoff/customer-identity.mjs';

const primary='U'+'1'.repeat(32);
const second='U'+'2'.repeat(32);
const stranger='U'+'3'.repeat(32);
const origin='https://mmd-isolated-qa-staging.malemodel-bkk.workers.dev';
const ref='privateqa_d14f220b8e1533dd23843e34fb7068258b9ea6aa5c27019f844490ca4da0e53a';

async function runtime(t) {
  const dir=await mkdtemp(join(tmpdir(),'private-handoff-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await cp(new URL('./deployed/mmd-isolated-qa-staging/',import.meta.url),dir,{recursive:true});
  await cp(new URL('./candidate/private-handoff/',import.meta.url),join(dir,'private-handoff'),{recursive:true});
  // Page rendering is outside the identity and session contract under test.
  await writeFile(join(dir,'ui.mjs'),"export const page=()=>'<html></html>'; export const client='';");
  const source=await readFile(join(dir,'gateway.mjs'),'utf8');
  await writeFile(join(dir,'gateway.mjs'),patchGateway(source));
  const gateway=await import(pathToFileURL(join(dir,'gateway.mjs')));
  const adapter=await import(pathToFileURL(join(dir,'private-handoff/served-adapter.mjs')));
  const rows=new Map();
  const store={
    async get(key) {return rows.has(key)?{text:async()=>rows.get(key),json:async()=>JSON.parse(rows.get(key))}:null;},
    async put(key,value) {rows.set(key,value);return {};},
    async list({prefix}) {return {objects:[...rows.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false};},
  };
  const env={QA_ENABLED:'true',PRIVATE_HANDOFF_QA:'true',QA_LINE_SUBJECT:primary,
    QA_LINE_CHANNEL_ID:'123456',QA_LIFF_ID:'123456-test',QA_AUTH_RESOLVER_SECRET:'x'.repeat(32),
    PRIVATE_QA_VERIFIED_FIXTURE_CLIENT:'qa-owner',PRIVATE_QA_CLIENT_BY_SUBJECT:{[second]:'qa-other'},QA_STORAGE:store,
    QA_AUTH:{fetch:async()=>Response.json({data:{member_exists:true}})}};
  let lastChannel;
  const handler=gateway.createGateway(async(token,channel)=>{
    lastChannel=channel;
    return {subject:{owner:primary,other:second,stranger}[token]??null,reason:'token_invalid'};
  });
  const login=async token=>{
    const response=await handler.fetch(new Request(origin+'/qa/session',{method:'POST',headers:{Origin:origin},body:JSON.stringify({idToken:token,line_user_id:primary,clientId:'qa-owner'})}),env);
    const cookie=response.headers.get('Set-Cookie')?.split(';')[0];
    return {response,cookie};
  };
  const view=async(cookie,suffix='',allowed=true)=>{
    const request=new Request(origin+'/booking-test/private-handoff/jobs'+suffix,{headers:{Cookie:cookie}});
    return adapter.bookingPrivate(request,env,async req=>{
      const member=await handler.fetch(new Request(origin+'/qa/member',{headers:{Cookie:req.headers.get('Cookie')}}),env);
      return member.ok?{privateAllowed:allowed}:null;
    });
  };
  return {rows,env,login,view,lastChannel:()=>lastChannel};
}

test('two verified LINE sessions see only their own customer jobs through the served adapter',async t=>{
  const {rows,env,login,view,lastChannel}=await runtime(t);
  const job={ref,session_id:'job_'+ref,lane:'private',clientId:'qa-owner',modelId:'qa-model-uri',model:'Uri',group:'GWs19',status:'offered'};
  rows.set('private-qa/v1/job/'+ref,JSON.stringify(job));
  rows.set('private-qa/v1/confirmation/'+ref,JSON.stringify({session_id:job.session_id}));
  const owner=await login('owner');const other=await login('other');
  assert.equal(owner.response.status,200);assert.equal(other.response.status,200);
  assert.equal(lastChannel(),env.QA_LINE_CHANNEL_ID);
  assert.notEqual(owner.cookie,other.cookie);
  const before=JSON.stringify([...rows]);
  for(const suffix of ['', '?booking_ref='+ref]) {
    const owned=await view(owner.cookie,suffix);assert.equal(owned.status,200);
    const html=await owned.text();assert.equal(html.split('<h2>GWs19 · Uri</h2>').length-1,1);
    assert.ok(html.includes(job.session_id));assert.ok(html.includes('confirmed'));
    const unrelated=await view(other.cookie,suffix);assert.equal(unrelated.status,200);
    assert.ok(!(await unrelated.text()).includes(ref));
    assert.equal((await view(other.cookie,suffix,false)).status,403);
  }
  assert.equal(JSON.stringify([...rows]),before);
});

test('unlisted or invalid LINE identity cannot mint a session even with supplied owner fields',async t=>{
  const {rows,login}=await runtime(t);
  for(const token of ['stranger','invalid','']) assert.equal((await login(token)).response.status,403);
  assert.equal([...rows.keys()].filter(key=>key.startsWith('session/')).length,0);
});

test('revoked mapping, expiry and swapped linkage fail closed for an existing session',async t=>{
  const {rows,env,login,view}=await runtime(t);const {cookie}=await login('other');
  const id=cookie.split('=')[1];const key='private-qa/v1/customer-session/'+id;
  const original=rows.get(key);
  rows.set(key,JSON.stringify({...JSON.parse(original),id:'qa-owner'}));
  assert.equal((await view(cookie)).status,401);
  rows.set(key,original);delete env.PRIVATE_QA_CLIENT_BY_SUBJECT[second];
  assert.equal((await view(cookie)).status,401);
  env.PRIVATE_QA_CLIENT_BY_SUBJECT[second]='qa-other';rows.set('session/'+id,'1');
  assert.equal((await view(cookie)).status,401);
});

test('legacy primary fixture remains supported while duplicate customer mappings are rejected',async t=>{
  const {env,login}=await runtime(t);delete env.PRIVATE_QA_CLIENT_BY_SUBJECT;
  assert.deepEqual(qaCustomerLinks(env),[[primary,'qa-owner']]);
  assert.equal((await login('owner')).response.status,200);
  assert.equal((await login('other')).response.status,403);
  env.PRIVATE_QA_CLIENT_BY_SUBJECT={[second]:'qa-owner'};
  assert.deepEqual(qaCustomerLinks(env),[]);
  assert.equal((await login('other')).response.status,403);
});
