import test from 'node:test';
import assert from 'node:assert/strict';
import {createCredentialBoundAdminSession} from './src/credential-bound-admin-session.js';
import {MODEL_PREVIEW_FIELDS as F,handleModelJobPreview,renderModelConfirmationFlowPreview} from './src/model-job-preview.js';
const sid='sess_book_flow_preview',url=`https://www.mmdbkk.com/internal/admin/jobs/model-preview?session_id=${sid}&flow=1`;
const env={ADMIN_LOGIN_CREDENTIAL:'test',ADMIN_SESSION_SECRET:'test-secret',AIRTABLE_API_KEY:'test',AIRTABLE_BASE_ID:'test'};
const fields={[F.session_id]:sid,[F.model_name]:'Book EI',[F.job_type]:'PN + MK',[F.job_date]:'2026-10-18',[F.start_time]:'2026-10-18T11:00:00Z',[F.end_time]:'2026-10-18T12:30:00Z',[F.model_payout_thb]:10000};
async function request(stage='',method='GET') {const token=await createCredentialBoundAdminSession(new Request(url),{id:'per',role:'owner'},env);return new Request(url+'&stage='+stage,{method,headers:{Cookie:'mmd_admin_gate_v1='+token}});}
test('all flow screens read one Session with GET; transitions never call ack or write',async()=>{
  for(const stage of ['details','confirmed','dashboard']) {
    let reads=0;const res=await handleModelJobPreview(await request(stage),env,async(target,options)=>{reads++;assert.equal(options.method,'GET');assert.match(String(target),/^https:\/\/api.airtable.com\/v0\//);return Response.json({records:[{fields}]});});
    assert.equal(res.status,200);assert.equal(reads,1);const html=await res.text();assert.match(html,/ADMIN FLOW PREVIEW/);assert.match(html,/ยังไม่มีการยืนยัน/);assert.doesNotMatch(html,/\/v1\/confirm\/ack|<script|secret|customer_confirmation_url/);
    assert.match(res.headers.get('cache-control'),/no-store/);
  }
});
test('details require checking the review box and use a same-page GET form',async()=>{
  const res=await handleModelJobPreview(await request(),env,async()=>Response.json({records:[{fields}]}));const html=await res.text();assert.match(html,/<form method="get"/);assert.match(html,/type="checkbox"[^>]*required/);assert.match(html,/18:00 – 19:30/);assert.match(html,/10,000 บาท/);
});
test('anonymous users cannot read real job data through flow mode',async()=>{let reads=0;const res=await handleModelJobPreview(new Request(url),env,()=>{reads++;throw Error();});assert.equal(res.status,401);assert.equal(reads,0);});
test('POST remains rejected even at the simulated success stage',async()=>assert.equal((await handleModelJobPreview(await request('confirmed','POST'),env,()=>{throw Error('must not fetch');})).status,405));
test('unknown stage returns details and escapes model input',()=>{const html=renderModelConfirmationFlowPreview({session_id:sid,model_name:'<script>alert(1)</script>',model_payout_thb:null},'bad');assert.match(html,/&lt;script/);assert.match(html,/Confirm ·/);assert.doesNotMatch(html,/<script>/);});
