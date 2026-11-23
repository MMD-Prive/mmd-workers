import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {SOURCE,ADMIN,PARTNER,OWNER_PATH} from './constants.mjs';
const read=name=>readFile(new URL(name,import.meta.url),'utf8');
const manifest=JSON.parse(await read('.build/manifest.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.source,SOURCE);
for(const [file,digest] of Object.entries(manifest.adapter))assert.equal(hash(await read(file)),digest);
const load=async role=>{
  const source=await read('.build/'+role+'.mjs');
  assert.equal(hash(source),manifest.bundles[role].sha256);
  const config=await read('wrangler.'+role+'.toml');
  assert.match(config,/workers_dev = false/);
  assert.match(config,/preview_urls = false/);
  assert.match(config,/routes = \[\]/);
  assert.doesNotMatch(config,/airtable|kv_namespaces|d1_databases|r2_buckets|triggers|cron/i);
  const runtime='data:text/javascript,'+encodeURIComponent('class Base { constructor(ctx,env){this.ctx=ctx;this.env=env;} } export {Base as DurableObject,Base as WorkerEntrypoint};');
  return import('data:text/javascript;base64,'+Buffer.from(source.replaceAll('cloudflare:workers',runtime)).toString('base64'));
};
const owner=await load('owner'), partner=await load('partner');
assert.match(await read('wrangler.owner.toml'),/service = "mmd-co-model-3243-partner-staging"\nentrypoint = "CoModelOwnerService"/);
assert.match(await read('wrangler.partner.toml'),/new_sqlite_classes = \["CoModelIntakeObject"\]/);
const objects=new Map();
const now=Date.now();
const secret=randomUUID();
function token(id) {
  const payload='sigil_'+Buffer.from(JSON.stringify({pid:id,iat:now,exp:now+3600000})).toString('base64url');
  return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
}
const idA='recAAAAAAAAAAAAAA', idB='recBBBBBBBBBBBBBB';
const tokenA=token(idA), tokenB=token(idB);
const pEnv={TOKEN_SECRET:secret,QA_PARTNER_A_TOKEN:tokenA,QA_PARTNER_B_TOKEN:tokenB,
  CO_MODEL_INTAKE:{idFromName:id=>id,get(id){
    if (!objects.has(id)) {
      const records=new Map();
      let queue=Promise.resolve();
      const storage={transaction(fn){
        const next=queue.then(()=>fn({get:key=>records.get(key),put:(key,value)=>records.set(key,value)}));
        queue=next.catch(()=>{});
        return next;
      }};
      objects.set(id,new partner.CoModelIntakeObject({storage},pEnv));
    }
    return objects.get(id);
  }}};
const oEnv={ADMIN_LOGIN_CREDENTIAL:randomUUID(),ADMIN_SESSION_SECRET:randomUUID(),
  CO_MODEL_OWNER:new partner.CoModelOwnerService({},pEnv)};
globalThis.fetch=()=>{throw Error('unexpected_external_fetch');};
const loginPage=await owner.default.fetch(new Request(ADMIN+'/qa/login'),oEnv);
assert.equal(loginPage.headers.get('referrer-policy'),'same-origin');
for(const origin of [undefined,'null','https://other.invalid']){
  const denied=await owner.default.fetch(new Request(ADMIN+'/qa/login',{
    method:'POST',headers:origin?{origin}:{},
    body:new URLSearchParams({credential:oEnv.ADMIN_LOGIN_CREDENTIAL}),
  }),oEnv);
  assert.equal(denied.status,403);
  assert.equal(denied.headers.has('set-cookie'),false);
}
const login=await owner.default.fetch(new Request(ADMIN+'/qa/login',{method:'POST',headers:{origin:ADMIN},
  body:new URLSearchParams({credential:oEnv.ADMIN_LOGIN_CREDENTIAL})}),oEnv);
assert.equal(login.status,303);
const cookie=login.headers.get('set-cookie').split(';')[0];
assert.equal((await owner.default.fetch(new Request(ADMIN+OWNER_PATH),oEnv)).status,303);
assert.equal((await owner.default.fetch(new Request(ADMIN+'/internal/admin/console',{headers:{cookie}}),oEnv)).status,200);
const results=[];
for(const mode of ['Bridge','รวมโม','หารกำไร']){
  const form=await owner.default.fetch(new Request(ADMIN+OWNER_PATH,{headers:{cookie}}),oEnv);
  assert.equal(form.status,200);
  assert.equal(form.headers.get('referrer-policy'),'same-origin');
  const draft=(await form.text()).match(/name="draft" value="([^"]+)"/)[1];
  const submit=()=>owner.default.fetch(new Request(ADMIN+OWNER_PATH,{method:'POST',headers:{cookie,origin:ADMIN},
    body:new URLSearchParams({draft,partner:idA,mode,description:'fixture-only'})}),oEnv);
  const issued=await submit();
  assert.equal(issued.status,201);
  const html=await issued.text();
  assert.equal(await (await submit()).text(),html);
  const link=new URL(html.match(/readonly value="([^"]+)"/)[1].replaceAll('&amp;','&'));
  assert.equal(link.origin,PARTNER);
  assert.equal(link.searchParams.has('t'),false);
  const open=(token,choice)=>{
    const url=new URL(link);url.searchParams.set('t',token);
    return partner.default.fetch(new Request(url,{method:choice?'POST':'GET',headers:{origin:PARTNER},
      body:choice?new URLSearchParams({choice}):undefined}),pEnv,{});
  };
  assert.equal((await open(tokenB)).status,404);
  assert.equal((await open(tokenB,'declined')).status,404);
  const recipientForm=await open(tokenA);
  assert.equal(recipientForm.status,200);
  assert.equal(recipientForm.headers.get('referrer-policy'),'same-origin');
  assert.deepEqual((await Promise.all([open(tokenA,'interested'),open(tokenA,'declined')])).map(r=>r.status),[303,303]);
  assert.match(await (await open(tokenA)).text(),/บันทึกคำตอบแล้ว/);
  results.push({mode,issue:201,wrongAccount:404,answer:303,replay:303});
}
assert.equal(objects.size,3);
console.log(JSON.stringify({status:'PASS',source:SOURCE,results,externalNetwork:'blocked',productionBindings:0,hostedE2E:'pending'},null,2));
