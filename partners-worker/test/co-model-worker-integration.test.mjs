import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {fixture,apiModule,PARTNER} from './helpers/partner-fixture.mjs';
import {createCredentialBoundAdminSession} from '../../admin-worker/src/credential-bound-admin-session.js';

async function loadWorker(path) {
  const entry = fileURLToPath(new URL(path, import.meta.url));
  const {outputFiles} = await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',external:['node:*']});
  return (await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))).default;
}
const admin = await loadWorker('../../admin-worker/src/admin-login-hero-worker.js');
const origin = 'https://www.mmdbkk.com';
const ownerUrl = origin + '/internal/admin/console/co-model-requests';
const ctx = {waitUntil(){throw Error('unexpected background work');}};

for (const mode of ['Bridge','รวมโม','หารกำไร']) {
  test(mode + ' through both Worker fetch routes', async t => {
    const fixtureData = await fixture();
    t.after(fixtureData.restore);
    const {env,token} = fixtureData;
    const objects = new Map();
    env.CO_MODEL_INTAKE = {idFromName:id=>id,get(id) {
      if (!objects.has(id)) {
        let queue = Promise.resolve();
        const rows = new Map();
        const storage = {transaction(fn) {
          const run = queue.then(()=>fn({get:key=>rows.get(key),put:(key,value)=>rows.set(key,value)}));
          queue = run.catch(()=>{});
          return run;
        }};
        objects.set(id,new apiModule.CoModelIntakeObject({storage},env));
      }
      return objects.get(id);
    }};
    const adminEnv = {
      ADMIN_LOGIN_CREDENTIAL:'fixture-owner',ADMIN_SESSION_SECRET:'fixture-owner-session',
      CO_MODEL_OWNER:new apiModule.CoModelOwnerService({},env),
    };
    const signed = await createCredentialBoundAdminSession(new Request(ownerUrl),{role:'owner'},adminEnv);
    const cookie = 'mmd_admin_gate_v1=' + signed;
    const open = await admin.fetch(new Request(ownerUrl,{headers:{cookie}}),adminEnv,ctx);
    assert.equal(open.status,200);
    const form = await open.text();
    assert.match(form,/Partner QA/);
    const draft = form.match(/name="draft" value="([^"]+)"/)[1];
    const issue = () => admin.fetch(new Request(ownerUrl,{method:'POST',headers:{cookie,origin},
      body:new URLSearchParams({draft,partner:PARTNER,mode,description:'fixture-only'})}),adminEnv,ctx);
    const issued = await issue();
    assert.equal(issued.status,201);
    const html = await issued.text();
    assert.equal(await (await issue()).text(),html);
    const link = html.match(/รหัสลิงก์ <code>([^<]+)<\/code>/)[1];
    const path = '/partner/dashboard/co-model-request?' + new URLSearchParams({request:draft,link,t:token});
    const fetchPartner = (method, choice) => apiModule.default.fetch(new Request(origin+path,{
      method,headers:{origin},body:choice?new URLSearchParams({choice}):undefined,
    }),env,ctx);
    const recipient = await fetchPartner('GET');
    assert.equal(recipient.status,200);
    assert.match(await recipient.text(),/fixture-only/);
    const posts = await Promise.all([fetchPartner('POST','interested'),fetchPartner('POST','declined')]);
    assert.deepEqual(posts.map(response=>response.status),[303,303]);
    assert.match(await (await fetchPartner('GET')).text(),/บันทึกคำตอบแล้ว/);
    assert.equal(fixtureData.writes.length,0);
    assert.equal(fixtureData.messages.length,0);
  });
}
