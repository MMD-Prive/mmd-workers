import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCredentialBoundAdminSession} from './src/credential-bound-admin-session.js';
import {handleModelJobPreview, MODEL_PREVIEW_FIELDS as F, isModelJobPreviewRequest, projectModelJobPreview, renderModelJobPreview} from './src/model-job-preview.js';
const sid='sess_test_preview_123';
const url=`https://mmdbkk.com/internal/admin/jobs/model-preview?session_id=${sid}`;
const env={ADMIN_LOGIN_CREDENTIAL:'test-credential',ADMIN_SESSION_SECRET:'test-secret',AIRTABLE_API_KEY:'test-airtable',AIRTABLE_BASE_ID:'test-base'};
async function request(role='admin',method='GET',target=url) {
  const cookie=await createCredentialBoundAdminSession(new Request(url),{id:'test',role},env);
  return new Request(target,{method,headers:{Cookie:`mmd_admin_gate_v1=${cookie}`}});
}
const fields={ [F.session_id]:sid,[F.model_name]:'Book EI',[F.job_type]:'PN + MK',[F.model_payout_thb]:1234,'fldhwC79ndbnEXSZz':999999,note:'private margin',model_confirmation_url:'secret-token'};
const records=rows=>async()=>Response.json({records:rows});
test('unsigned cookie and spoofed actor headers cannot read Airtable',async()=>{
  for(const headers of [{},{'x-mmd-admin-actor':'per','x-mmd-admin-role':'owner'},{Cookie:'mmd_admin_gate_v1=forged'}]) {
    const res=await handleModelJobPreview(new Request(url,{headers}),env,()=>{throw Error('must not fetch');});assert.equal(res.status,401);
  }
});
test('partner sessions are forbidden before Airtable fetch',async()=>assert.equal((await handleModelJobPreview(await request('mms_partner'),env,()=>{throw Error('must not fetch');})).status,403));
test('POST cannot acknowledge or write',async()=>assert.equal((await handleModelJobPreview(await request('owner','POST'),env,()=>{throw Error('must not fetch');})).status,405));
test('invalid session IDs never reach Airtable',async()=>assert.equal((await handleModelJobPreview(await request('admin','GET',url+"'"),env,()=>{throw Error('must not fetch');})).status,400));
test('owner sees model projection from a single bounded GET with private cache headers',async()=>{
  let calls=0;
  const res=await handleModelJobPreview(await request('owner'),env,async(target,options)=>{
    calls++;assert.equal(options.method,'GET');assert.equal(target.searchParams.get('maxRecords'),'2');assert.equal(target.searchParams.get('filterByFormula'),`{session_id}='${sid}'`);
    assert.deepEqual(target.searchParams.getAll('fields[]').sort(),[...Object.values(F),'fldEcDkF7CH9VixWM','fldwl9Gs5tYlXG5ls'].sort());return Response.json({records:[{fields}]});
  });
  assert.equal(calls,1);assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);
  const body=await res.text();assert.match(body,/PN \+ MK/);assert.match(body,/1,234/);assert.doesNotMatch(body,/999999|private margin|secret-token|<form|<script|confirmJob/);
});
test('missing and duplicate records fail closed',async()=>{
  assert.equal((await handleModelJobPreview(await request(),env,records([]))).status,404);
  assert.equal((await handleModelJobPreview(await request(),env,records([{fields},{fields}]))).status,409);
  assert.equal((await handleModelJobPreview(await request(),env,records([{fields:{...fields,[F.session_id]:'sess_other_123'}}]))).status,409);
});
test('Airtable errors never return credentials or upstream bodies',async()=>{
  const res=await handleModelJobPreview(await request(),env,async()=>new Response('secret provider error',{status:500}));assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/secret|test-airtable/);
});
test('HEAD returns no job body',async()=>{const res=await handleModelJobPreview(await request('admin','HEAD'),env,records([{fields}]));assert.equal(res.status,200);assert.equal(await res.text(),'');});
test('HTML escapes model content and rejects unsafe map URLs',()=>{
  const job=projectModelJobPreview({...fields,[F.model_name]:'<img src=x onerror=alert(1)>',[F.google_map_url]:'javascript:alert(1)'});const html=renderModelJobPreview(job);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|javascript:/);assert.equal(projectModelJobPreview({}).model_payout_thb,null);
});
test('only marked VIP detail is included; raw notes stay private',()=>{
  const job=projectModelJobPreview({...fields,fldEcDkF7CH9VixWM:'private costs [SIGIL VIP Detail v1] {"vip_detail":"VIP model brief","margin":999999}'});
  const html=renderModelJobPreview(job);assert.match(html,/VIP model brief/);assert.doesNotMatch(html,/private costs|999999|"margin"/);
});
test('exact routing and login return are registered in active worker and deployment',()=>{
  assert.ok(isModelJobPreviewRequest('/internal/admin/jobs/model-preview'));assert.ok(!isModelJobPreviewRequest('/internal/admin/jobs/model-preview-extra'));
  const worker=readFileSync(new URL('./src/admin-login-hero-worker.js',import.meta.url),'utf8');assert.match(worker,/isModelJobPreviewRequest\(normalizedPath\)[\s\S]*?applyCredentialBoundAdminGate[\s\S]*?handleModelJobPreview\(gate.request/);
  assert.match(readFileSync(new URL('./src/admin-login-hero-worker-core.js',import.meta.url),'utf8'),/"\/internal\/admin\/jobs\/model-preview",/);
  assert.match(readFileSync(new URL('../.github/workflows/deploy-admin-worker.yml',import.meta.url),'utf8'),/"\/internal\/admin\/jobs\/model-preview\*"/);
});
