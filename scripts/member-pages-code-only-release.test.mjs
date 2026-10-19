import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACCOUNT, ROOT, VERSION_ROOT, ZONE, activeVersion, createTransport, releaseMemberPagesCodeOnly,
  uploadMetadata, validateBundleFiles, validateCodeOnlySourcePaths, versionAnnotations, versionConfiguration,
} from './member-pages-code-only-release.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sha = 'a'.repeat(40);
const deployment = (version = id(1), deploymentId = id(10)) => ({
  id:deploymentId, strategy:'percentage', versions:[{version_id:version,percentage:100}],
});
const version = (versionId = id(1), annotations = {}) => ({
  id:versionId,
  annotations,
  resources:{
    script:{etag:'private-etag',last_deployed_from:'wrangler',handlers:['fetch'],placement_mode:'off'},
    script_runtime:{compatibility_date:'2026-06-20',compatibility_flags:[],usage_model:'standard',migration_tag:'v3'},
    bindings:[
      {name:'AIRTABLE_API_KEY',type:'secret_text'},
      {name:'AIRTABLE_BASE_ID',type:'plain_text',text:'private-config-value'},
      {name:'PRIVATE_MEDIA',type:'r2_bucket',bucket_name:'mmd-private-model-media'},
    ],
  },
});

function fixture(options = {}) {
  const baseline = version();
  let current = deployment(), uploaded = false, promoted = false, writes = 0, approvals = 0, uploadedMetadata = null;
  const calls = [], receipts = [];
  const call = async (path, init = {}) => {
    const method = init.method || 'GET'; calls.push({path,method});
    if (method === 'POST') writes++;
    if (options.callError?.(path,method,writes)) throw new Error('fixture_failure');
    if (path === ROOT + '/deployments' && method === 'GET') return {deployments:[structuredClone(current)]};
    if (path === ROOT + '/deployments' && method === 'POST') {
      promoted = true; current = deployment(id(2),id(11)); return structuredClone(current);
    }
    if (path === ROOT + '/deployments/' + id(11)) return deployment(id(2),id(11));
    if (path === ROOT + '/versions' && method === 'GET') return {items:uploaded ? [{id:id(2)},{id:id(1)}] : [{id:id(1)}]};
    if (path === ROOT + '/versions/' + id(1)) return structuredClone(baseline);
    if (path === ROOT + '/versions/' + id(2)) {
      const uploadedVersion = version(id(2),uploadedMetadata?.annotations || {});
      const inherited = new Map(baseline.resources.bindings.map(binding => [binding.name, binding]));
      uploadedVersion.resources.bindings = (uploadedMetadata?.bindings || []).map(binding => {
        if (binding.type !== 'inherit') return binding;
        return structuredClone(inherited.get(binding.name) || { name:binding.name, type:'missing_inherit' });
      });
      const runtime = {};
      for (const key of ['compatibility_date','compatibility_flags','usage_model','limits','migration_tag']) {
        if (Object.hasOwn(uploadedMetadata || {}, key)) runtime[key] = structuredClone(uploadedMetadata[key]);
      }
      uploadedVersion.resources.script_runtime = runtime;
      const changed = options.uploadedVersionChange?.(uploadedVersion) || uploadedVersion;
      return structuredClone(changed);
    }
    if (path === VERSION_ROOT + '/' + id(2)) {
      const annotations = structuredClone(uploadedMetadata?.annotations || {});
      const readback = { id:id(2), annotations };
      return structuredClone(options.annotationReadbackChange?.(readback) || readback);
    }
    if (path === ROOT + '/versions?bindings_inherit=strict' && method === 'POST') {
      uploadedMetadata = JSON.parse(init.body.get('metadata'));
      uploaded=true; return {id:id(2)};
    }
    if (path === ROOT + '/script-settings') return {observability:{enabled:true},logpush:false};
    if (path === ROOT + '/schedules') return {schedules:[]};
    if (path === ROOT + '/subdomain') return {enabled:true,previews_enabled:false};
    if (path === `/zones/${ZONE}/workers/routes`) return [{pattern:'mmdbkk.com/member/liff*',script:'member-dashboard-chat-worker'}];
    throw new Error(`unexpected ${method} ${path}`);
  };
  const io = {
    sha, expectedVersion:id(1), expectedDeployment:id(10),
    approve:async()=>{ approvals++; if(options.rejectApproval===approvals) throw new Error('approval_denied'); },
    call,
    sourceCheck:async()=>({method:'fixture_clean_main',source_sha:sha,config_unchanged:true}),
    bundle:async()=>{if(options.bundleError)throw new Error('bundle_failed');return new Uint8Array([1,2,3]);},
    save:record=>receipts.push(structuredClone(record)),
  };
  return {io,calls,receipts,call,writes:()=>writes,baseline,active:()=>current};
}

test('strict code-only upload inherits and preserves the exact baseline configuration', async () => {
  const f=fixture();
  const result=await releaseMemberPagesCodeOnly(f.io);
  assert.equal(result.phase,'complete');
  assert.equal(result.uploaded_version,id(2));
  assert.equal(activeVersion(f.active()),id(2));
  assert.deepEqual(f.calls.filter(x=>x.method==='POST').map(x=>x.path),[
    ROOT+'/versions?bindings_inherit=strict',ROOT+'/deployments',
  ]);
  const metadata=uploadMetadata(f.baseline,sha);
  assert.deepEqual(metadata.bindings,[
    {name:'AIRTABLE_API_KEY',type:'inherit'},
    {name:'AIRTABLE_BASE_ID',type:'inherit'},
    {name:'PRIVATE_MEDIA',type:'inherit'},
  ]);
  assert.equal(metadata.migration_tag, 'v3');
  assert.equal(JSON.stringify(metadata).includes('private-config-value'),false);
  const uploadedReadback = await f.call(ROOT + '/versions/' + id(2));
  assert.equal(uploadedReadback.resources.script_runtime.migration_tag, metadata.migration_tag);
  assert.deepEqual(uploadedReadback.resources.script_runtime, f.baseline.resources.script_runtime);
  assert.deepEqual(versionAnnotations(uploadedReadback), metadata.annotations);
  assert.equal(f.receipts.at(-1).phase,'complete');
});

test('readback annotations and inherited bindings are derived from submitted upload metadata', async () => {
  const f=fixture();
  await releaseMemberPagesCodeOnly(f.io);
  const metadata = uploadMetadata(f.baseline, sha);
  const uploaded = await f.call(VERSION_ROOT + '/' + id(2));
  assert.deepEqual(versionAnnotations(uploaded), metadata.annotations);

  for (const changed of [
    fixture({annotationReadbackChange:x => { x.annotations['workers/commit_sha'] = 'b'.repeat(40); return x; }}),
    fixture({uploadedVersionChange:x => { x.resources.bindings = []; return x; }}),
    fixture({uploadedVersionChange:x => { x.resources.bindings[0].name = 'OTHER_BINDING'; return x; }}),
  ]) {
    await assert.rejects(releaseMemberPagesCodeOnly(changed.io));
    assert.equal(changed.writes(),1, 'metadata/readback drift must stop before promotion');
  }
});

test('unknown resource and script configuration fields stop before any Cloudflare write', async () => {
  for (const mutate of [
    x => { x.resources.new_configuration = true; return x; },
    x => { x.resources.script.new_configuration = true; return x; },
    x => { x.resources.script_runtime.exports = {}; return x; },
  ]) {
    const f=fixture();
    const baseline = structuredClone(f.baseline);
    f.io.call = async (path, init = {}) => {
      if (path === ROOT + '/versions/' + id(1)) return mutate(baseline);
      return f.call(path, init);
    };
    await assert.rejects(releaseMemberPagesCodeOnly(f.io));
    assert.equal(f.writes(),0);
  }
});

test('wrong baseline and bundle failure stop before any Cloudflare write', async () => {
  const wrong=fixture(); wrong.io.expectedVersion=id(99);
  await assert.rejects(releaseMemberPagesCodeOnly(wrong.io));
  assert.equal(wrong.writes(),0);
  const build=fixture({bundleError:true});
  await assert.rejects(releaseMemberPagesCodeOnly(build.io));
  assert.equal(build.writes(),0);
});

test('approval denial at each boundary prevents the next mutation', async () => {
  for (const [stage,expectedWrites] of [[1,0],[2,0],[3,1]]) {
    const f=fixture({rejectApproval:stage});
    await assert.rejects(releaseMemberPagesCodeOnly(f.io));
    assert.equal(f.writes(),expectedWrites);
    assert.equal(f.receipts.at(-1).phase,'stopped');
  }
});

test('uploaded configuration or source mismatch blocks promotion without rollback', async () => {
  for(const mutate of [
    x=>{x.resources.bindings[0].name='OTHER_SECRET';return x;},
    x=>{x.resources.script_runtime.migration_tag='changed';return x;},
    x=>{x.annotations['workers/commit_sha']='b'.repeat(40);return x;},
  ]) {
    const f=fixture({uploadedVersionChange:baseline=>mutate(baseline)});
    await assert.rejects(releaseMemberPagesCodeOnly(f.io));
    assert.equal(f.writes(),1);
    assert.equal(f.receipts.at(-1).phase,'stopped');
  }
});

test('uncertain upload/promotion failures never retry or automatically roll back', async () => {
  const upload=fixture({callError:(path,method)=>path===ROOT+'/versions?bindings_inherit=strict'&&method==='POST'});
  await assert.rejects(releaseMemberPagesCodeOnly(upload.io));
  assert.equal(upload.writes(),1);
  const promote=fixture({callError:(path,method)=>path===ROOT+'/deployments'&&method==='POST'});
  await assert.rejects(releaseMemberPagesCodeOnly(promote.io));
  assert.equal(promote.writes(),2);
  assert.equal(promote.receipts.at(-1).phase,'stopped');
});

test('transport is limited to readback and the two strict code-only writes', async () => {
  const calls=[];
  const call=createTransport('credential-never-printed',async(url,init)=>{
    calls.push({url,method:init.method,redirect:init.redirect});
    return {ok:true,json:async()=>({success:true,result:{ok:true}})};
  });
  await call(ROOT+'/versions');
  await call(VERSION_ROOT+'/'+id(1));
  await call(ROOT+'/versions?bindings_inherit=strict',{method:'POST',body:new FormData()});
  assert.equal(calls.length,3);
  assert.ok(calls.every(x=>x.redirect==='error'));
  for(const [path,method] of [
    [`/zones/${ZONE}/workers/routes`,'POST'],[ROOT+'/secrets','POST'],[ROOT+'/deployments','DELETE'],
    [ROOT.replace('member-pages-worker','payments-worker')+'/versions','GET'],
  ]) await assert.rejects(call(path,{method}));
  await assert.rejects(call(`/accounts/${ACCOUNT}/workers/workers/other-worker/versions/${id(1)}`));
  assert.equal(calls.length,3);
});

test('secret values are omitted from version comparison and bundle shape is single-module only', () => {
  const clean=versionConfiguration(version());
  assert.equal(clean.bindings.some(binding=>binding.name==='AIRTABLE_API_KEY'&&Object.hasOwn(binding,'text')),false);
  assert.throws(()=>activeVersion({...deployment(),versions:[{version_id:id(1),percentage:50}]}));
  validateBundleFiles(['runtime-index.js','runtime-index.js.map','README.md']);
  assert.throws(()=>validateBundleFiles(['runtime-index.js','second-module.js']));
});

test('code-only source boundary rejects configuration or unrelated worker paths', () => {
  const paths=[
    '.github/workflows/deploy-member-pages-worker-code-only.yml',
    'member-pages-worker/src/liff-member-shell.js',
    'member-pages-worker/test/liff-member-compact-v4.test.mjs',
    'member-pages-worker/test/liff-member-shell.test.mjs',
  'member-pages-worker/test/liff-quick-membership.test.mjs',
  'member-pages-worker/test/member-history-preview.test.mjs',
    'scripts/member-pages-code-only-release.mjs',
    'scripts/member-pages-code-only-release.test.mjs',
  ];
  assert.doesNotThrow(()=>validateCodeOnlySourcePaths(paths));
  assert.throws(()=>validateCodeOnlySourcePaths([...paths,'member-pages-worker/wrangler.toml']));
});

test('release workflow is manual, exact-SHA and protected with no data-service credential path', () => {
  const source=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
  assert.match(source,/^  workflow_dispatch:/m);
  assert.doesNotMatch(source,/^  (push|pull_request|schedule|workflow_run):/m);
  assert.equal((source.match(/inputs\.approved_sha == github\.sha/g)||[]).length,2);
  assert.match(source,/needs: \[production-approval\][\s\S]*environment: mmd-production-mutation/);
  assert.match(source,/EXPECTED_VERSION: \$\{\{ inputs\.expected_version \}\}/);
  assert.match(source,/EXPECTED_DEPLOYMENT: \$\{\{ inputs\.expected_deployment \}\}/);
  assert.equal((source.match(/secrets\./g)||[]).length,1);
  assert.match(source,/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(source,/AIRTABLE|R2_API|ensure-private|ensure-payment|wrangler route|wrangler secret|synthetic_write|production public Wish/i);
  assert.match(source,/node scripts\/member-pages-code-only-release\.mjs --execute-approved/);
});
