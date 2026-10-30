import {RENEWAL} from './member-pages-renewal-artifact.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyOwnerApproval, environmentName } from './member-pages-owner-approval.mjs';
import {
  ACCOUNT, ROOT, VERSION_ROOT, ZONE, CODE_ONLY_BASE_SHA, CODE_ONLY_SOURCE_SHA, CODE_ONLY_GRAPHICS_SOURCE_SHA, CODE_ONLY_STARTUP_BASE_SHA, CODE_ONLY_STARTUP_PATHS, CODE_ONLY_STARTUP_BRIDGE_BLOBS, CODE_ONLY_PREVIOUS_SOURCE_SHA, CODE_ONLY_GRAPHICS_BASE_SHA, CODE_ONLY_GRAPHICS_PATHS, CODE_ONLY_RUNTIME_BOUNDARIES, CODE_ONLY_INCLUDED_PULL_REQUESTS, CODE_ONLY_EXCLUDED_CHANGE, CODE_ONLY_PATHS, CODE_ONLY_MY_MMD_SOURCE_SHA, CODE_ONLY_MY_MMD_INCLUDED_PULL_REQUESTS, CODE_ONLY_POST_STARTUP_PATHS, CODE_ONLY_SOURCE_CONFIG_BLOB, validateMyMmdSourceHistory, validatePostStartupSourcePaths, activeVersion, createTransport, inspectCodeOnlyCheckouts, releaseMemberPagesCodeOnly,
  buildMemberPagesBundle, uploadMetadata, validateBundleFiles, validateCodeOnlySourcePaths, validateStartupBridge, validateGraphicsSourcePaths, validateCodeOnlySourceHistory, validateBundleSourceMap, versionAnnotations, versionConfiguration,
  COMPANION_DELTA_BASE_SHA, COMPANION_DELTA_SOURCE_SHA, COMPANION_DELTA_BLOBS, validateCompanionDelta,
} from './member-pages-code-only-release.mjs';

test('Companion #2843 candidate permits only its six exact reviewed blobs', () => {
  // History verification belongs to the release checkout guard (fetch-depth: 0).
  // Unit CI uses a shallow checkout and exercises the scope/blob rejection contract.
  const paths=Object.keys(COMPANION_DELTA_BLOBS);
  const readBlob=(sha,path)=>{assert.equal(sha,COMPANION_DELTA_SOURCE_SHA);return COMPANION_DELTA_BLOBS[path];};
  assert.deepEqual(validateCompanionDelta(paths,readBlob),Object.keys(COMPANION_DELTA_BLOBS).sort());
  assert.throws(() => validateCompanionDelta([...paths,'member-pages-worker/wrangler.toml'],readBlob));
  assert.throws(() => validateCompanionDelta([...paths,'package.json'],readBlob));
  assert.throws(() => validateCompanionDelta(paths.filter(path => path !== paths[0]),readBlob));
  assert.throws(() => validateCompanionDelta(paths,() => '0'.repeat(40)));
});

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sha = CODE_ONLY_SOURCE_SHA;
const myMmdSha = CODE_ONLY_MY_MMD_SOURCE_SHA;
const releaseSha = 'a'.repeat(40);
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
    if (path === VERSION_ROOT + '/' + id(1)) return {
      id:id(1), annotations:options.baselineAnnotations ?? {'workers/commit_sha':CODE_ONLY_SOURCE_SHA},
    };
    if (path === ROOT + '/versions/' + id(2)) {
      const uploadedVersion = version(id(2),uploadedMetadata?.annotations || {});
      const inherited = new Map(baseline.resources.bindings.map(binding => [binding.name, binding]));
      uploadedVersion.resources.bindings = (uploadedMetadata?.bindings || []).map(binding => {
        if (binding.type !== 'inherit') return binding;
        return structuredClone(inherited.get(binding.name) || { name:binding.name, type:'missing_inherit' });
      });
      const runtime = {};
      for (const key of ['compatibility_date','compatibility_flags','usage_model','limits']) {
        if (Object.hasOwn(uploadedMetadata || {}, key)) runtime[key] = structuredClone(uploadedMetadata[key]);
      }
      // With no migration request, the upload retains the baseline DO migration state.
      if (Object.hasOwn(baseline.resources.script_runtime, 'migration_tag')) runtime.migration_tag = baseline.resources.script_runtime.migration_tag;
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
      assert.equal(Object.hasOwn(uploadedMetadata, 'migration_tag'), false, 'readback-only migration tag must never be uploaded');
      assert.equal(Object.hasOwn(uploadedMetadata, 'migrations'), false, 'code-only release must not request migrations');
      uploaded=true; return {id:id(2)};
    }
    if (path === ROOT + '/script-settings') return {observability:{enabled:true},logpush:false};
    if (path === ROOT + '/schedules') return {schedules:[]};
    if (path === ROOT + '/subdomain') return {enabled:true,previews_enabled:false};
    if (path === `/zones/${ZONE}/workers/routes`) return [{pattern:'mmdbkk.com/member/liff*',script:'member-dashboard-chat-worker'}];
    throw new Error(`unexpected ${method} ${path}`);
  };
  const io = {
    sha:myMmdSha, releaseSha, expectedVersion:id(1), expectedDeployment:id(10),
    approve:async()=>{ approvals++; if(options.rejectApproval===approvals) throw new Error('approval_denied'); },
    call,
    sourceCheck:async(_diagnostic,baselineSourceSha)=>{
      assert.equal(baselineSourceSha,CODE_ONLY_SOURCE_SHA);
      return {method:'fixture_clean_main',source_sha:myMmdSha,config_unchanged:false};
    },
    bundle:async()=>{if(options.bundleError)throw new Error('bundle_failed');return new Uint8Array([1,2,3]);},
    save:record=>receipts.push(structuredClone(record)),
  };
  return {io,calls,receipts,call,writes:()=>writes,baseline,active:()=>current};
}

test('strict code-only upload inherits and preserves the exact baseline configuration', async () => {
  const f=fixture();
  const result=await releaseMemberPagesCodeOnly(f.io);
  assert.equal(result.phase,'complete');
  assert.equal(result.source_sha, CODE_ONLY_MY_MMD_SOURCE_SHA);
  assert.equal(result.release_sha, releaseSha);
  assert.equal(result.uploaded_version,id(2));
  assert.equal(activeVersion(f.active()),id(2));
  assert.deepEqual(f.calls.filter(x=>x.method==='POST').map(x=>x.path),[
    ROOT+'/versions?bindings_inherit=strict',ROOT+'/deployments',
  ]);
  const metadata=uploadMetadata(f.baseline,myMmdSha);
  assert.deepEqual(metadata.bindings,[
    {name:'AIRTABLE_API_KEY',type:'inherit'},
    {name:'AIRTABLE_BASE_ID',type:'inherit'},
    {name:'PRIVATE_MEDIA',type:'inherit'},
  ]);
  assert.equal(Object.hasOwn(metadata, 'migration_tag'), false);
  assert.equal(Object.hasOwn(metadata, 'migrations'), false);
  assert.equal(JSON.stringify(metadata).includes('private-config-value'),false);
  const uploadedReadback = await f.call(ROOT + '/versions/' + id(2));
  assert.equal(uploadedReadback.resources.script_runtime.migration_tag, f.baseline.resources.script_runtime.migration_tag);
  assert.deepEqual(uploadedReadback.resources.script_runtime, f.baseline.resources.script_runtime);
  assert.deepEqual(versionAnnotations(uploadedReadback), metadata.annotations);
  assert.equal(f.receipts.at(-1).phase,'complete');
});

test('readback annotations and inherited bindings are derived from submitted upload metadata', async () => {
  const f=fixture();
  await releaseMemberPagesCodeOnly(f.io);
  const metadata = uploadMetadata(f.baseline, myMmdSha);
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

test('missing or invalid active source provenance stops before upload', async () => {
  for (const baselineAnnotations of [{}, {'workers/commit_sha':'invalid'}]) {
    const f=fixture({baselineAnnotations});
    await assert.rejects(releaseMemberPagesCodeOnly(f.io));
    assert.equal(f.writes(),0);
    assert.equal(f.receipts.at(-1).diagnostic.stage,'CF_BASELINE_SOURCE_CHECK');
  }
});

test('approval denial at each boundary prevents the next mutation', async () => {
  for (const [stage,expectedWrites] of [[1,0],[2,0],[3,1]]) {
    const f=fixture({rejectApproval:stage});
    await assert.rejects(releaseMemberPagesCodeOnly(f.io));
    assert.equal(f.writes(),expectedWrites);
    assert.equal(f.receipts.at(-1).phase,'stopped');
  }
});

test('real owner checker gates mock release writes, including revoked approval and reruns', async () => {
  const owner={login:'mmdprive',id:216427112};
  for (const [scenario,expectedWrites] of [['approved',2],['absent',0],['rerun',0],['revoked_before_upload',0],['revoked_before_promote',1]]) {
    const f=fixture(); let checks=0;
    const env={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'MMD-Prive/mmd-workers',GITHUB_REPOSITORY_ID:'1121397236',GITHUB_ACTOR:owner.login,GITHUB_ACTOR_ID:String(owner.id),GITHUB_TRIGGERING_ACTOR:owner.login,GITHUB_SHA:releaseSha,APPROVED_SHA:releaseSha,APPROVAL_REF:'fixture',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:scenario==='rerun'?'2':'1',GH_TOKEN:'fixture'};
    const request=async(url,options)=>{
      assert.equal(options.method,'GET');
      let body;
      if(url.endsWith('/approvals')) {
        const denied=scenario==='absent'||(scenario==='revoked_before_upload'&&checks>=2)||(scenario==='revoked_before_promote'&&checks>=3);
        body=denied?[]:[{state:'approved',user:owner,environments:[{id:456,name:environmentName}]}];
      } else if(url.includes('/actions/runs/')) body={id:123,repository:{id:1121397236},event:'workflow_dispatch',head_branch:'main',head_sha:releaseSha,path:'.github/workflows/deploy-member-pages-worker-code-only.yml@main',actor:owner,triggering_actor:owner,run_attempt:Number(env.GITHUB_RUN_ATTEMPT)};
      else if(url.includes('/git/ref/')) body={object:{sha:releaseSha}};
      else if(url.includes('/deployment-branch-policies')) body={total_count:1,branch_policies:[{name:'main',type:'branch'}]};
      else body={id:456,name:environmentName,can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:owner}]}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}};
      return {status:200,json:async()=>body};
    };
    f.io.approve=async diagnostic=>{checks++;await verifyOwnerApproval(env,request,{diagnostic});};
    if(scenario==='approved') await releaseMemberPagesCodeOnly(f.io);
    else await assert.rejects(releaseMemberPagesCodeOnly(f.io));
    assert.equal(f.writes(),expectedWrites,scenario);
    if (scenario === 'absent' || scenario === 'revoked_before_upload') assert.equal(f.receipts.at(-1).diagnostic.reason, 'APPROVAL_RECEIPT_INVALID');
    if (scenario === 'rerun') assert.equal(f.receipts.at(-1).diagnostic.reason, 'OWNER_INPUT_INVALID');
    assert.ok(f.calls.every(call=>call.method==='GET'||[ROOT+'/versions?bindings_inherit=strict',ROOT+'/deployments'].includes(call.path)));
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
    'member-pages-worker/src/my-mmd-lifetime-points.js',
    'member-pages-worker/src/points-display-source-guard.js',
    'member-pages-worker/test/kenji-line-member-truth.test.mjs',
    'member-pages-worker/test/liff-member-compact-v4.test.mjs',
    'member-pages-worker/test/liff-member-shell.test.mjs',
    'member-pages-worker/test/liff-quick-membership.test.mjs',
    'member-pages-worker/test/member-history-preview.test.mjs',
    'member-pages-worker/test/points-display-source-guard.test.mjs',
    'scripts/member-pages-code-only-release.mjs',
    'scripts/member-pages-code-only-release.test.mjs',
  ];
  assert.doesNotThrow(()=>validateCodeOnlySourcePaths(paths));
  assert.throws(()=>validateCodeOnlySourcePaths([...paths,'member-pages-worker/wrangler.toml']));
  // Every #2523 path is required; neither missing source nor extra files pass.
  for (const path of ['member-pages-worker/src/my-mmd-lifetime-points.js',
    'member-pages-worker/src/points-display-source-guard.js',
    'member-pages-worker/test/kenji-line-member-truth.test.mjs',
    'member-pages-worker/test/points-display-source-guard.test.mjs']) {
    assert.throws(()=>validateCodeOnlySourcePaths(paths.filter(item=>item!==path)));
  }
  assert.throws(()=>validateCodeOnlySourcePaths([...paths,paths[0]]));
  assert.throws(()=>validateCodeOnlySourcePaths([...paths,'member-pages-worker/src/member-app-api.js']));
});

test('only the six exact reviewed PR2524 blobs can be excluded from source scope', () => {
  assert.equal(CODE_ONLY_EXCLUDED_CHANGE.number, 2524);
  assert.equal(CODE_ONLY_EXCLUDED_CHANGE.merge_sha, '7e8e08fc95a3258251523d29299c82fe838dc22d');
  assert.equal(CODE_ONLY_EXCLUDED_CHANGE.paths.length, 6);
  const paths = [...CODE_ONLY_PATHS, ...CODE_ONLY_EXCLUDED_CHANGE.paths];
  const reads = [];
  const evidence = {sha,readBlob:(ref,path)=>{reads.push([ref,path]);return 'b'.repeat(40);}};
  const result = validateCodeOnlySourcePaths(paths,evidence);
  assert.deepEqual(result.included_paths, CODE_ONLY_PATHS);
  assert.equal(result.excluded_changes[0].number,2524);
  assert.equal(reads.length,12);
  assert.deepEqual(reads[0],[CODE_ONLY_EXCLUDED_CHANGE.merge_sha,CODE_ONLY_EXCLUDED_CHANGE.paths[0]]);
  assert.deepEqual(reads[1],[sha,CODE_ONLY_EXCLUDED_CHANGE.paths[0]]);
  assert.throws(()=>validateCodeOnlySourcePaths(paths));
  assert.throws(()=>validateCodeOnlySourcePaths(paths,{sha,readBlob:()=>undefined}));
  assert.throws(()=>validateCodeOnlySourcePaths(paths,{sha,readBlob:ref=>(ref===sha?'a':'b').repeat(40)}));
  assert.throws(()=>validateCodeOnlySourcePaths(paths.slice(0,-1),evidence));
  for(const changed of ['shared/private-media.mjs','auth-worker/src/index.js',
    'member-pages-worker/wrangler.toml','package-lock.json',
    'member-dashboard-chat-worker/src/another-file.js']) {
    assert.throws(()=>validateCodeOnlySourcePaths([...paths,changed],evidence));
  }
});

test('bundle evidence rejects excluded Worker inputs, aliases, missing maps and unknown dependencies', async () => {
  const directory = '/fixture/repo/bundle';
  const repository = '/fixture/repo';
  const map = {version:3,sourceRoot:'..',sources:['member-pages-worker/src/runtime-index.js','member-pages-worker/src/liff-customer-graphics.js','member-pages-worker/src/liff-customer-progress.js','shared/private-media.mjs'],mappings:'AAAA'};
  assert.deepEqual(validateBundleSourceMap(map,directory,repository),
    ['member-pages-worker/src/liff-customer-graphics.js','member-pages-worker/src/liff-customer-progress.js','member-pages-worker/src/runtime-index.js','shared/private-media.mjs']);
  for(const source of [...CODE_ONLY_EXCLUDED_CHANGE.paths,
    'shared/../member-dashboard-chat-worker/src/index.js','../outside.js']) {
    const contaminated = {...map,sources:[...map.sources,source]};
    assert.throws(()=>validateBundleSourceMap(contaminated,directory,repository));
  }
  for(const incomplete of [{},{...map,sources:[]},{...map,mappings:''},
    {...map,sources:['shared/private-media.mjs']}]) {
    assert.throws(()=>validateBundleSourceMap(incomplete,directory,repository));
  }
  const f = fixture();
  f.io.bundle = async () => {
    validateBundleSourceMap({...map,sources:[...map.sources,CODE_ONLY_EXCLUDED_CHANGE.paths[0]]},directory,repository);
    return new Uint8Array([1]);
  };
  await assert.rejects(releaseMemberPagesCodeOnly(f.io));
  assert.equal(f.writes(),0,'contaminated bundle must stop before upload');
});

test('pinned-source bundling enforces the input graph before any upload', async () => {
  const workspace = mkdtempSync(join(tmpdir(),'member-pages-pinned-bundle-test-'));
  const sourceDirectory = join(workspace,'release-source');
  mkdirSync(sourceDirectory);
  const good = {version:3,sourceRoot:sourceDirectory,
    sources:['member-pages-worker/src/runtime-index.js','member-pages-worker/src/liff-customer-graphics.js','member-pages-worker/src/liff-customer-progress.js','shared/private-media.mjs'],mappings:'AAAA'};
  try {
    const cases = [
      {map:good, allowed:true},
      {map:{...good,sources:[...good.sources,...CODE_ONLY_EXCLUDED_CHANGE.paths]}},
      {map:{...good,sourceRoot:join(workspace,'release-tools')}},
      {map:{...good,sources:['shared/private-media.mjs']}},
      {map:{...good,sources:[...good.sources,'../outside.js']}},
      {map:{...good,mappings:''}},
      {map:null},
    ];
    for (const [index,entry] of cases.entries()) {
      const out = join(workspace,'bundle-'+index);
      mkdirSync(out);
      const run = (command,args,options) => {
        assert.equal(command,'wrangler');
        assert.deepEqual(args.slice(0,3),['versions','upload','--dry-run']);
        assert.equal(options.cwd,sourceDirectory);
        assert.equal(options.env.CLOUDFLARE_API_TOKEN,'');
        assert.equal(options.env.CLOUDFLARE_API_KEY,'');
        writeFileSync(join(out,'runtime-index.js'),'export default {};');
        if (entry.map) writeFileSync(join(out,'runtime-index.js.map'),JSON.stringify(entry.map));
      };
      const f = fixture();
      f.io.bundle = async () => buildMemberPagesBundle(out,sourceDirectory,run);
      if (entry.allowed) {
        assert.equal((await releaseMemberPagesCodeOnly(f.io)).phase,'complete');
        assert.equal(f.writes(),2);
      } else {
        await assert.rejects(releaseMemberPagesCodeOnly(f.io));
        assert.equal(f.writes(),0,'invalid input graph must stop before version upload');
      }
    }
  } finally {
    rmSync(workspace,{recursive:true,force:true});
  }
});

test('release history requires the original base and both exact merged PRs', () => {
  assert.equal(CODE_ONLY_BASE_SHA, '05db9f10d32650a7b922475ea7e070f72ece4070');
  assert.deepEqual(CODE_ONLY_INCLUDED_PULL_REQUESTS, [
    {number:2522, merge_sha:'5e89a7386aa1e41d80ce3e945201b96b352ae799'},
    {number:2523, merge_sha:'151d21eabd988396eef36b944c931b23e51cea69'},
    {number:2537, merge_sha:'a53571bc9d572755dff65599767d09a240d74b93'},
    {number:2544, merge_sha:'fe5f9d98876b600421c5614efc049ffc890b8adb'},
  ]);
  const ancestors = [CODE_ONLY_BASE_SHA, CODE_ONLY_GRAPHICS_BASE_SHA, CODE_ONLY_STARTUP_BASE_SHA, ...CODE_ONLY_INCLUDED_PULL_REQUESTS.map(pr=>pr.merge_sha)];
  const calls = [];
  validateCodeOnlySourceHistory(sha, (ancestor,target)=>{ calls.push([ancestor,target]); return true; });
  assert.deepEqual(calls, ancestors.map(ancestor=>[ancestor,sha]));
  for (const missing of ancestors) {
    assert.throws(()=>validateCodeOnlySourceHistory(sha, ancestor=>ancestor!==missing));
  }
  assert.throws(()=>validateCodeOnlySourceHistory('invalid', ()=>true));
  assert.throws(()=>validateCodeOnlySourceHistory(releaseSha, ()=>true));
});

function checkoutFixture(options = {}) {
  const calls = [];
  const releaseDirectory = '/release-tools', sourceDirectory = '/release-source';
  const git = (directory, ...args) => {
    calls.push({directory,args});
    if (args.join(' ') === 'rev-parse --show-toplevel') return options.wrongRoot ? '/other-root' : directory;
    if (args.join(' ') === 'rev-parse HEAD') return directory === sourceDirectory
      ? options.sourceSha || options.targetSourceSha || CODE_ONLY_SOURCE_SHA : options.releaseSha || releaseSha;
    if (args[0] === 'rev-parse' && args[1].includes(':')) {
      const [reference,path] = args[1].split(':');
      if (path === 'member-pages-worker/wrangler.toml') return options.configBlobDrift
        ? 'f'.repeat(40) : CODE_ONLY_SOURCE_CONFIG_BLOB;
      return options.startupBlobDrift ? 'f'.repeat(40) : CODE_ONLY_STARTUP_BRIDGE_BLOBS[path][reference === CODE_ONLY_GRAPHICS_SOURCE_SHA ? 0 : 1];
    }
    if (args[0] === 'status') return directory === options.dirtyDirectory ? '!! injected.js' : '';
    if (args[0] === 'merge-base') {
      if (options.missingHistory || (options.missingBaselineHistory && args[2] === 'b'.repeat(40))) {
        throw new Error('not_ancestor');
      }
      return '';
    }
    if (args[0] === 'diff' && args[1] === '--name-only') {
      if (args[2] === CODE_ONLY_MY_MMD_SOURCE_SHA) return options.changedMainRuntime
        ? 'member-pages-worker/src/liff-member-shell.js' : '';
      if (args[2] === CODE_ONLY_SOURCE_SHA && args[3] === CODE_ONLY_MY_MMD_SOURCE_SHA) {
        if (args.at(-1) === 'member-pages-worker/wrangler.toml') return 'member-pages-worker/wrangler.toml';
        return [...CODE_ONLY_POST_STARTUP_PATHS, ...(options.postStartupExtraPaths || [])].join('\n');
      }
      const paths = args[2] === CODE_ONLY_GRAPHICS_BASE_SHA ? CODE_ONLY_GRAPHICS_PATHS : args[2] === CODE_ONLY_GRAPHICS_SOURCE_SHA ? Object.keys(CODE_ONLY_STARTUP_BRIDGE_BLOBS) : args[2] === CODE_ONLY_STARTUP_BASE_SHA ? CODE_ONLY_STARTUP_PATHS : CODE_ONLY_PATHS;
      return [...paths, ...(options.extraPaths || []), ...(args[2] === CODE_ONLY_STARTUP_BASE_SHA ? options.startupExtraPaths || [] : [])].join('\n');
    }
    if (args[0] === 'diff' && args[1] === CODE_ONLY_PREVIOUS_SOURCE_SHA) return options.changedBridge ? 'runtime drift' : '';
    if (args[0] === 'diff') return options.changedConfig ? 'config changed' : '';
    throw new Error('unexpected_git_read');
  };
  return {calls,releaseDirectory,sourceDirectory,git};
}

test('new release tooling can bundle only the separate exact Graphics V4 source', () => {
  const f = checkoutFixture();
  const evidence = inspectCodeOnlyCheckouts(releaseSha, f.sourceDirectory, f);
  assert.equal(evidence.source_sha, CODE_ONLY_SOURCE_SHA);
  assert.equal(evidence.release_sha, releaseSha);
  assert.deepEqual(evidence.source_scope.included_paths,[...new Set([...CODE_ONLY_PATHS,...CODE_ONLY_GRAPHICS_PATHS])].sort());
  assert.deepEqual(evidence.source_scope.excluded_changes,[]);
  assert.ok(f.calls.filter(x=>x.args[0]==='diff').every(x=>x.directory===f.sourceDirectory));
  assert.ok(f.calls.some(x=>x.directory===f.releaseDirectory && x.args.join(' ')
    ===`merge-base --is-ancestor ${CODE_ONLY_SOURCE_SHA} ${releaseSha}`));
  for (const directory of [f.releaseDirectory,f.sourceDirectory]) {
    assert.ok(f.calls.some(x=>x.directory===directory && x.args.join(' ')
      ==='status --porcelain --untracked-files=all --ignored'));
  }
});

test('MY MMD release accepts only the exact merged source, reviewed paths and main parity', () => {
  assert.equal(CODE_ONLY_MY_MMD_INCLUDED_PULL_REQUESTS.at(-1).number, 2652);
  assert.equal(CODE_ONLY_MY_MMD_INCLUDED_PULL_REQUESTS.at(-1).merge_sha, myMmdSha);
  assert.equal(CODE_ONLY_SOURCE_CONFIG_BLOB, 'e26a9d3436140f381f5d6f55311c43c81e7deb40');
  const ancestors = [];
  validateMyMmdSourceHistory(myMmdSha, (ancestor,target) => {
    ancestors.push(ancestor);
    assert.equal(target,myMmdSha);
    return true;
  });
  assert.ok(ancestors.includes(sha));
  assert.ok(ancestors.includes(myMmdSha));
  assert.throws(()=>validateMyMmdSourceHistory(sha,()=>true));
  assert.deepEqual(validatePostStartupSourcePaths(CODE_ONLY_POST_STARTUP_PATHS),CODE_ONLY_POST_STARTUP_PATHS);
  for (const changed of ['member-pages-worker/src/unreviewed.js','member-pages-worker/wrangler.toml']) {
    assert.throws(()=>validatePostStartupSourcePaths([...CODE_ONLY_POST_STARTUP_PATHS,changed]));
  }
  const f = checkoutFixture({targetSourceSha:myMmdSha});
  const result = inspectCodeOnlyCheckouts(releaseSha,f.sourceDirectory,
    {...f,targetSourceSha:myMmdSha,baselineSourceSha:sha});
  assert.equal(result.source_sha,myMmdSha);
  assert.equal(result.config_unchanged,false);
  assert.deepEqual(result.source_scope.post_startup_delta.paths,CODE_ONLY_POST_STARTUP_PATHS);
  for (const options of [
    {sourceSha:sha}, {postStartupExtraPaths:['member-pages-worker/src/unreviewed.js']},
    {configBlobDrift:true}, {changedMainRuntime:true}, {missingHistory:true},
  ]) {
    const failure = checkoutFixture({...options,targetSourceSha:myMmdSha});
    assert.throws(()=>inspectCodeOnlyCheckouts(releaseSha,failure.sourceDirectory,
      {...failure,targetSourceSha:myMmdSha}));
  }
  const foreign = checkoutFixture({targetSourceSha:myMmdSha,missingBaselineHistory:true});
  assert.throws(()=>inspectCodeOnlyCheckouts(releaseSha,foreign.sourceDirectory,
    {...foreign,targetSourceSha:myMmdSha,baselineSourceSha:'b'.repeat(40)}));
});

test('wrong source, changed config, extra Worker paths and dirty checkouts fail closed', () => {
  for (const options of [
    {sourceSha:releaseSha}, {releaseSha:'b'.repeat(40)}, {wrongRoot:true},
    {dirtyDirectory:'/release-tools'}, {dirtyDirectory:'/release-source'},
    {missingHistory:true}, {changedConfig:true}, {changedBridge:true},
    {extraPaths:['member-dashboard-chat-worker/src/index.js']},
    {extraPaths:['member-pages-worker/src/unreviewed.js']},
  ]) {
    const f = checkoutFixture(options);
    assert.throws(()=>inspectCodeOnlyCheckouts(releaseSha, f.sourceDirectory, f));
  }
  const f = checkoutFixture();
  assert.throws(()=>inspectCodeOnlyCheckouts(releaseSha, undefined, f));
  assert.throws(()=>inspectCodeOnlyCheckouts(releaseSha, f.releaseDirectory, f));
});

test('unapproved source and failed checkout guard make zero Cloudflare writes', async () => {
  const wrong = fixture(); wrong.io.sha = releaseSha;
  await assert.rejects(releaseMemberPagesCodeOnly(wrong.io));
  assert.deepEqual(wrong.calls, []);
  const dirty = fixture();
  const f = checkoutFixture({dirtyDirectory:'/release-source'});
  dirty.io.approve = async () => inspectCodeOnlyCheckouts(releaseSha, f.sourceDirectory, f);
  await assert.rejects(releaseMemberPagesCodeOnly(dirty.io));
  assert.deepEqual(dirty.calls, []);
});

test('a missing reviewed PR stops the release before any Cloudflare request', async () => {
  const f = fixture();
  f.io.approve = async () => validateCodeOnlySourceHistory(sha,
    ancestor=>ancestor!==CODE_ONLY_INCLUDED_PULL_REQUESTS[1].merge_sha);
  await assert.rejects(releaseMemberPagesCodeOnly(f.io));
  assert.deepEqual(f.calls, []);
  assert.equal(f.writes(), 0);
  assert.equal(f.receipts.at(-1).phase, 'stopped');
});

test('release workflow is manual, exact-SHA and protected with no data-service credential path', () => {
  const source=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
  assert.match(source,/^  workflow_dispatch:/m);
  assert.doesNotMatch(source,/^  (push|pull_request|schedule|workflow_run):/m);
  assert.equal((source.match(/inputs\.approved_sha == github\.sha/g)||[]).length,3);
  assert.match(source,/needs: \[production-approval\][\s\S]*environment: member-pages-code-only-owner/);
  const preflight = source.slice(source.indexOf('  production-approval:'), source.indexOf('  release:'));
  assert.match(preflight, /permissions:\s+contents: read\s+actions: read/);
  assert.match(preflight, /run: node scripts\/member-pages-owner-approval.mjs/);
  assert.doesNotMatch(preflight, /uses: \.\/\.github\/workflows\/admin-production-approval.yml/);
  assert.doesNotMatch(preflight, /secrets\./);

  assert.match(source,/EXPECTED_VERSION: \$\{\{ inputs\.expected_version \}\}/);
  assert.match(source,/EXPECTED_DEPLOYMENT: \$\{\{ inputs\.expected_deployment \}\}/);
  assert.equal((source.match(/secrets\./g)||[]).length,2);
  assert.match(source,/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(source,/AIRTABLE|R2_API|ensure-private|ensure-payment|wrangler route|wrangler secret|synthetic_write|production public Wish/i);
  assert.match(source,/node scripts\/member-pages-code-only-release\.mjs --execute-approved/);
  assert.match(source, /node --test [^\n]*member-pages-worker\/test\/points-display-source-guard.test.mjs/);
  assert.match(source, /node --test [^\n]*member-pages-worker\/test\/kenji-line-member-truth.test.mjs/);
  assert.match(source, /ref: fe5f9d98876b600421c5614efc049ffc890b8adb\s+fetch-depth: 0\s+path: release-source/);
  assert.match(source, /if: inputs.execution_mode == 'release'\s+uses: actions\/checkout@v5\s+with:\s+ref: 871d99cd9eb1c8d53e1d473160119030dca01d4c/);
  assert.match(source, /if: inputs.execution_mode == 'promote-existing'\s+uses: actions\/checkout@v5\s+with:\s+ref: fe5f9d98876b600421c5614efc049ffc890b8adb/);
  assert.match(source, /ref: \$\{\{ github.sha \}\}\s+fetch-depth: 0\s+path: release-tools/);
  assert.match(source, /SOURCE_DIRECTORY: \$\{\{ github.workspace \}\}\/release-source/);
  assert.match(source, /working-directory: release-tools/);
  assert.match(source, /node --test \.\.\/release-source\/member-pages-worker/);
  const releaseSource = readFileSync(new URL('./member-pages-code-only-release.mjs',import.meta.url),'utf8');
  assert.match(releaseSource, /cwd:sourceDirectory, stdio: 'ignore'/);
});

test('Graphics V4 pin extends the original source with exactly the four merged UI files', () => {
  assert.equal(CODE_ONLY_PREVIOUS_SOURCE_SHA,'151d21eabd988396eef36b944c931b23e51cea69');
  assert.equal(CODE_ONLY_GRAPHICS_BASE_SHA,'a815e173fff1471901dae55646c984ed0b5f23f3');
  assert.equal(CODE_ONLY_GRAPHICS_SOURCE_SHA,'a53571bc9d572755dff65599767d09a240d74b93');
  assert.equal(CODE_ONLY_SOURCE_SHA,'fe5f9d98876b600421c5614efc049ffc890b8adb');
  assert.deepEqual(validateGraphicsSourcePaths(CODE_ONLY_GRAPHICS_PATHS),CODE_ONLY_GRAPHICS_PATHS);
  for (const missing of CODE_ONLY_GRAPHICS_PATHS) {
    assert.throws(()=>validateGraphicsSourcePaths(CODE_ONLY_GRAPHICS_PATHS.filter(path=>path!==missing)));
  }
  for (const extra of ['shared/private-media.mjs','auth-worker/src/index.js','package.json','package-lock.json',
    'member-pages-worker/wrangler.toml','member-pages-worker/src/unreviewed.js','member-dashboard-chat-worker/src/index.js']) {
    assert.throws(()=>validateGraphicsSourcePaths([...CODE_ONLY_GRAPHICS_PATHS,extra]));
  }
  assert.throws(()=>validateGraphicsSourcePaths([...CODE_ONLY_GRAPHICS_PATHS,CODE_ONLY_GRAPHICS_PATHS[0]]));
  assert.throws(()=>validateCodeOnlySourceHistory(CODE_ONLY_PREVIOUS_SOURCE_SHA,()=>true));
});

test('the non-bundle main interval must leave all runtime trees and dependency controls identical', () => {
  const f=checkoutFixture();
  const evidence=inspectCodeOnlyCheckouts(releaseSha,f.sourceDirectory,f);
  assert.deepEqual(evidence.source_scope.graphics_delta,{base_sha:CODE_ONLY_GRAPHICS_BASE_SHA,source_sha:CODE_ONLY_GRAPHICS_SOURCE_SHA,paths:CODE_ONLY_GRAPHICS_PATHS});
  assert.deepEqual(evidence.source_scope.unchanged_runtime_bridge,{from:CODE_ONLY_PREVIOUS_SOURCE_SHA,to:CODE_ONLY_GRAPHICS_BASE_SHA});
  assert.ok(f.calls.some(({args})=>args.join(' ')===['diff',CODE_ONLY_PREVIOUS_SOURCE_SHA,CODE_ONLY_GRAPHICS_BASE_SHA,'--',...CODE_ONLY_RUNTIME_BOUNDARIES].join(' ')));
  assert.ok(f.calls.some(({args})=>args.join(' ')===['diff','--name-only',CODE_ONLY_BASE_SHA,CODE_ONLY_PREVIOUS_SOURCE_SHA].join(' ')));
  assert.ok(f.calls.some(({args})=>args.join(' ')===['diff','--name-only',CODE_ONLY_GRAPHICS_BASE_SHA,CODE_ONLY_GRAPHICS_SOURCE_SHA].join(' ')));
  for(const required of ['member-pages-worker','shared','auth-worker','package.json','package-lock.json','.npmrc']) {
    assert.ok(CODE_ONLY_RUNTIME_BOUNDARIES.includes(required));
  }
});

test('runtime bridge drift stops before any Cloudflare request or write',async()=>{
  const f=fixture();const checkout=checkoutFixture({changedBridge:true});
  f.io.approve=async()=>inspectCodeOnlyCheckouts(releaseSha,checkout.sourceDirectory,checkout);
  await assert.rejects(releaseMemberPagesCodeOnly(f.io),/runtime dependency\/config drift/);
  assert.deepEqual(f.calls,[]);assert.equal(f.writes(),0);
});

test('an old bundle without either V4 module cannot pass source-map evidence',()=>{
  const sources=['member-pages-worker/src/runtime-index.js',
    'member-pages-worker/src/liff-customer-graphics.js','member-pages-worker/src/liff-customer-progress.js'];
  for(const missing of sources.slice(1)) {
    assert.throws(()=>validateBundleSourceMap({version:3,sourceRoot:'/repo',mappings:'AAAA',sources:sources.filter(path=>path!==missing)},'/repo/out','/repo'));
  }
});


test('startup release accepts only exact #2529 test-script blobs, never dependency/config edits', () => {
  const paths=Object.keys(CODE_ONLY_STARTUP_BRIDGE_BLOBS);
  const read=(ref,path)=>CODE_ONLY_STARTUP_BRIDGE_BLOBS[path][ref===CODE_ONLY_GRAPHICS_SOURCE_SHA?0:1];
  validateStartupBridge(paths,read);
  for(const extra of ['package-lock.json','.npmrc','member-pages-worker/wrangler.toml','shared/private-media.mjs','auth-worker/src/index.js']) {
    assert.throws(()=>validateStartupBridge([...paths,extra],read));
  }
  for(const path of paths) {
    assert.throws(()=>validateStartupBridge(paths.filter(p=>p!==path),read));
    for(const reference of [CODE_ONLY_GRAPHICS_SOURCE_SHA,CODE_ONLY_STARTUP_BASE_SHA]) {
      assert.throws(()=>validateStartupBridge(paths,(ref,p)=>p===path&&ref===reference?'f'.repeat(40):read(ref,p)),/blob drift/);
    }
  }
  assert.throws(()=>validateCodeOnlySourceHistory(CODE_ONLY_GRAPHICS_SOURCE_SHA,()=>true));
});

test('startup bridge and extra delta failures stop before any Cloudflare reads or writes',async()=>{
  for(const options of [{startupBlobDrift:true},{startupExtraPaths:['package.json']},{startupExtraPaths:['member-pages-worker/src/index.js']}]) {
    const f=fixture(),checkout=checkoutFixture(options);
    f.io.approve=async()=>inspectCodeOnlyCheckouts(releaseSha,checkout.sourceDirectory,checkout);
    await assert.rejects(releaseMemberPagesCodeOnly(f.io));
    assert.deepEqual(f.calls,[]);assert.equal(f.writes(),0);
  }
});

test('startup source evidence preserves V4 and names the exact two-file startup delta',()=>{
  const f=checkoutFixture();const evidence=inspectCodeOnlyCheckouts(releaseSha,f.sourceDirectory,f);
  assert.deepEqual(evidence.source_scope.startup_delta,{base_sha:CODE_ONLY_STARTUP_BASE_SHA,paths:CODE_ONLY_STARTUP_PATHS});
  assert.deepEqual(evidence.source_scope.exact_test_only_bridge,{from:CODE_ONLY_GRAPHICS_SOURCE_SHA,to:CODE_ONLY_STARTUP_BASE_SHA,paths:Object.keys(CODE_ONLY_STARTUP_BRIDGE_BLOBS)});
  assert.ok(f.calls.some(({args})=>args.join(' ')===['diff','--name-only',CODE_ONLY_STARTUP_BASE_SHA,CODE_ONLY_SOURCE_SHA].join(' ')));
});


test('safe preflight receipt identifies owner and source boundaries and never stores raw errors',async()=>{
 const secret='SECRET_TOKEN=private-value; cookie=private-cookie; customer=private-client';
 for(const [stage,reason] of [['OWNER_MAIN_CHECK','MAIN_DRIFT'],['OWNER_APPROVAL_HTTP','EVIDENCE_HTTP_STATUS'],
  ['SOURCE_CHECKOUT','CHECKOUT_INVALID'],['SOURCE_HISTORY','SOURCE_HISTORY_INVALID'],['SOURCE_STARTUP_BRIDGE','STARTUP_BRIDGE_INVALID']]){
  const f=fixture();f.io.approve=async mark=>{mark(stage);throw Error(secret);};
  await assert.rejects(releaseMemberPagesCodeOnly(f.io));const receipt=f.receipts.at(-1);
  assert.equal(receipt.phase,'stopped');assert.equal(receipt.stopped_after,'preflight');
  assert.deepEqual(receipt.diagnostic,{stage,reason});assert.deepEqual(f.calls,[]);assert.equal(f.writes(),0);
  assert.doesNotMatch(JSON.stringify(receipt),/SECRET_TOKEN|private-value|cookie|private-client|stack|message/);
 }
});

test('preflight diagnostics identify baseline, source check and bundle failures before writes',async()=>{
 for(const [stage,reason,change] of [
  ['CF_DEPLOYMENT_READ','DEPLOYMENT_READ_FAILED',f=>{f.io.call=async()=>{throw Error('private response');};}],
  ['CF_BASELINE_CHECK','BASELINE_MISMATCH',f=>{f.io.expectedVersion=id(99);}],
  ['SOURCE_STARTUP_SCOPE','STARTUP_SCOPE_INVALID',f=>{f.io.sourceCheck=async mark=>{mark('SOURCE_STARTUP_SCOPE');throw Error('private path');};}],
  ['BUNDLE_BUILD','BUNDLE_BUILD_FAILED',f=>{f.io.bundle=async()=>{throw Error('private bundler output');};}],
  ['BUNDLE_CHECK','BUNDLE_INVALID',f=>{f.io.bundle=async()=>new Uint8Array();}],
 ]){
  const f=fixture();change(f);await assert.rejects(releaseMemberPagesCodeOnly(f.io));
  assert.deepEqual(f.receipts.at(-1).diagnostic,{stage,reason});assert.equal(f.writes(),0);
  assert.doesNotMatch(JSON.stringify(f.receipts),/private response|private path|private bundler output/);
 }
});

test('actual checkout guards publish safe source stages and retain their rejection',()=>{
 for(const [options,stage] of [[{dirtyDirectory:'/release-source'},'SOURCE_CHECKOUT'],[{missingHistory:true},'SOURCE_HISTORY'],
  [{changedBridge:true},'SOURCE_RUNTIME_BRIDGE'],[{startupBlobDrift:true},'SOURCE_STARTUP_BRIDGE'],[{startupExtraPaths:['package.json']},'SOURCE_STARTUP_SCOPE']]){
  const f=checkoutFixture(options),stages=[];
  assert.throws(()=>inspectCodeOnlyCheckouts(releaseSha,f.sourceDirectory,{...f,diagnostic:s=>stages.push(s)}));
  assert.equal(stages.at(-1),stage);
 }
});

for (const [name,options,stage,reason] of [
  ['uploaded version read',{callError:(p,m)=>p===ROOT+'/versions/'+id(2)&&m==='GET'},'UPLOADED_VERSION_READ','UPLOADED_VERSION_READ_FAILED'],
  ['uploaded configuration',{uploadedVersionChange:v=>({...v,cache_options:{changed:true}})},'UPLOADED_CONFIG_CHECK','UPLOADED_CONFIG_DRIFT'],
  ['annotation read',{callError:p=>p===VERSION_ROOT+'/'+id(2)},'UPLOADED_ANNOTATION_READ','ANNOTATION_READ_FAILED'],
  ['annotation identity',{annotationReadbackChange:v=>({...v,id:id(99)})},'UPLOADED_ANNOTATION_ID_CHECK','ANNOTATION_ID_MISMATCH'],
  ['annotation source',{annotationReadbackChange:v=>({...v,annotations:{'workers/commit_sha':'b'.repeat(40)}})},'UPLOADED_ANNOTATION_CHECK','ANNOTATION_MISMATCH'],
  ['promotion owner approval',{rejectApproval:3},'OWNER_PROMOTION_APPROVAL','PROMOTION_APPROVAL_FAILED'],
]) test(`post-upload diagnostics: ${name} stops without promotion or private exception`,async()=>{
  const f=fixture(options);
  await assert.rejects(releaseMemberPagesCodeOnly(f.io));
  const receipt=f.receipts.at(-1);
  assert.equal(receipt.stopped_after,'uploaded-not-promoted');
  assert.deepEqual(receipt.diagnostic,{stage,reason});
  assert.equal(f.writes(),1);
  assert.equal(activeVersion(f.active()),id(1));
  assert.doesNotMatch(JSON.stringify(receipt),/fixture_failure|private-config-value|private-etag/);
});

test('post-upload real owner diagnostics retain MAIN_DRIFT and never promote',async()=>{
  const f=fixture();let approvals=0;
  f.io.approve=async mark=>{if(++approvals===3){mark('OWNER_MAIN_CHECK');throw Error('private-token-cookie');}};
  await assert.rejects(releaseMemberPagesCodeOnly(f.io));
  assert.deepEqual(f.receipts.at(-1).diagnostic,{stage:'OWNER_MAIN_CHECK',reason:'MAIN_DRIFT'});
  assert.equal(f.writes(),1);
  assert.doesNotMatch(JSON.stringify(f.receipts),/private-token-cookie/);
});

test('promotion request failure records unknown outcome without automatic retry',async()=>{
  const f=fixture({callError:(p,m)=>p===ROOT+'/deployments'&&m==='POST'});
  await assert.rejects(releaseMemberPagesCodeOnly(f.io));
  assert.equal(f.receipts.at(-1).stopped_after,'promotion-attempted-outcome-unknown');
  assert.deepEqual(f.receipts.at(-1).diagnostic,{stage:'PROMOTION_REQUEST',reason:'PROMOTION_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(x=>x.path===ROOT+'/deployments'&&x.method==='POST').length,1);
});

for(const [kind,stage,reason] of [
  ['latest','UPLOADED_LATEST_CHECK','UPLOADED_NOT_LATEST'],
  ['predecessor','UPLOADED_PREDECESSOR_CHECK','PREDECESSOR_DRIFT'],
  ['baseline','PROMOTION_BASELINE_CHECK','PROMOTION_BASELINE_DRIFT'],
]) test(`post-upload ${kind} drift retains the existing stop boundary`,async()=>{
 const f=fixture();let uploaded=false;
 f.io.call=async(path,init={})=>{
  const result=await f.call(path,init);
  if(path===ROOT+'/versions?bindings_inherit=strict')uploaded=true;
  if(uploaded&&path===ROOT+'/versions'&&kind==='latest')return {items:[{id:id(99)},{id:id(1)}]};
  if(uploaded&&path===ROOT+'/versions'&&kind==='predecessor')return {items:[{id:id(2)},{id:id(99)}]};
  if(uploaded&&path===ROOT+'/deployments'&&(!init.method||init.method==='GET')&&kind==='baseline')return {deployments:[deployment(id(1),id(99))]};
  return result;
 };
 await assert.rejects(releaseMemberPagesCodeOnly(f.io));
 assert.deepEqual(f.receipts.at(-1).diagnostic,{stage,reason});
 assert.equal(f.writes(),1);
});

for(const [kind,stage,reason] of [
 ['receipt-read','PROMOTION_RECEIPT_READ','PROMOTION_RECEIPT_READ_FAILED'],
 ['receipt-id','PROMOTION_RECEIPT_CHECK','PROMOTION_RECEIPT_INVALID'],
 ['post-baseline','POST_PROMOTION_BASELINE_CHECK','POST_PROMOTION_DRIFT'],
 ['post-config-read','POST_PROMOTION_CONFIG_READ','POST_PROMOTION_CONFIG_READ_FAILED'],
 ['post-config','POST_PROMOTION_CONFIG_CHECK','POST_PROMOTION_CONFIG_DRIFT'],
]) test(`post-promotion diagnostics: ${kind} records stop without a second mutation`,async()=>{
 const f=fixture();let promoted=false;
 f.io.call=async(path,init={})=>{
  if(promoted&&path===ROOT+'/deployments/'+id(11)&&kind==='receipt-read')throw Error('private-exception-token');
  if(promoted&&path===ROOT+'/versions/'+id(2)&&kind==='post-config-read')throw Error('private-exception-token');
  const result=await f.call(path,init);
  if(path===ROOT+'/deployments'&&init.method==='POST')promoted=true;
  if(promoted&&path===ROOT+'/deployments/'+id(11)&&kind==='receipt-id')return {...result,id:id(99)};
  if(promoted&&path===ROOT+'/deployments'&&(!init.method||init.method==='GET')&&kind==='post-baseline')return {deployments:[deployment(id(2),id(99))]};
  if(promoted&&path===ROOT+'/versions/'+id(2)&&kind==='post-config')return {...result,cache_options:{changed:true}};
  return result;
 };
 await assert.rejects(releaseMemberPagesCodeOnly(f.io));
 assert.deepEqual(f.receipts.at(-1).diagnostic,{stage,reason});
 assert.equal(f.receipts.at(-1).phase,'stopped');
 assert.equal(f.receipts.at(-1).stopped_after,'promotion-attempted-outcome-unknown');
 assert.equal(f.writes(),2);
 assert.doesNotMatch(JSON.stringify(f.receipts),/private-exception-token|private-config-value/);
});

test('Companion artifact mode rejects baseline drift before any Cloudflare request',async()=>{
 const f=fixture();f.io.mode='companion-artifact';f.io.sha=COMPANION_DELTA_SOURCE_SHA;
 await assert.rejects(releaseMemberPagesCodeOnly(f.io));
 assert.equal(f.calls.length,0);assert.equal(f.writes(),0);
});
test('Companion artifact mode rejects missing artifact bytes before upload',async()=>{
 const f=fixture();const original=f.io.call;
 const v='641cea01-6986-45d4-be33-2346bd6c28fb';
 const d='e6eb7c7a-fe50-45fd-b7a2-8f1fdefcc16c';
 f.io.mode='companion-artifact';f.io.sha=COMPANION_DELTA_SOURCE_SHA;
 f.io.expectedVersion=v;f.io.expectedDeployment=d;
 f.io.call=async(path,init)=>{
  if(path===ROOT+'/deployments')return {deployments:[deployment(v,d)]};
  if(path===ROOT+'/versions/'+v)return version(v);
  if(path===VERSION_ROOT+'/'+v)return {id:v,annotations:{}};
  if(path===VERSION_ROOT+'/'+v+'?include=modules')return {id:v,main_module:'worker.js',modules:[]};
  return original(path,init);
 };
 await assert.rejects(releaseMemberPagesCodeOnly(f.io));assert.equal(f.writes(),0);
 assert.equal(f.receipts.at(-1).diagnostic.stage,'CF_BASELINE_SOURCE_CHECK');
});

test('artifact workflow selects explicit mode under existing owner gate without bundler install',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
 assert.match(workflow,/options:[\s\S]*- companion-artifact/);
 assert.match(workflow,/RELEASE_MODE: \$\{\{ inputs.execution_mode \}\}/);
 assert.match(workflow,/Install pinned Wrangler bundler\s+if: inputs.execution_mode != 'companion-artifact'/);
 assert.match(workflow,/if: inputs.execution_mode == 'release' \|\| inputs.execution_mode == 'companion-artifact' \|\| inputs.execution_mode == 'renewal-artifact'\s+env:/);
});

test('Renewal mode rejects stale approval baseline before Cloudflare requests',async()=>{
 const f=fixture();f.io.mode='renewal-artifact';f.io.sha=RENEWAL.sourceSha;
 await assert.rejects(releaseMemberPagesCodeOnly(f.io));assert.equal(f.calls.length,0);assert.equal(f.writes(),0);
});
const renewalDir=process.env.RENEWAL_ARTIFACT_DIRECTORY;
for(const kind of ['success','uploaded-code-drift','uploaded-config-drift','owner-denies-promotion','pre-upload-baseline-drift'])test(`Renewal real-artifact release transport: ${kind}`,{skip:!renewalDir},async()=>{
 const f=fixture(kind==='uploaded-config-drift'?{uploadedVersionChange:v=>{v.resources.bindings.push({name:'unexpected',type:'plain_text',text:'invalid'});return v;}}:kind==='owner-denies-promotion'?{rejectApproval:3}:{});
 f.io.mode='renewal-artifact';f.io.sha=RENEWAL.sourceSha;
 f.io.expectedVersion=RENEWAL.baselineVersion;f.io.expectedDeployment=RENEWAL.baselineDeployment;
 const artifact={id:RENEWAL.baselineVersion,main_module:RENEWAL.mainModule,modules:[
  {name:'runtime-index.js',content_base64:readFileSync(renewalDir+'/baseline-runtime-index.mjs').toString('base64')},
  {name:RENEWAL.mainModule,content_base64:readFileSync(renewalDir+'/tmib-release-entry.mjs').toString('base64')},
 ]};let uploadModules,reads=0;
 f.io.call=async(path,init={})=>{
  if(path===VERSION_ROOT+'/'+RENEWAL.baselineVersion+'?include=modules')return structuredClone(artifact);
  if(path===VERSION_ROOT+'/'+id(2)+'?include=modules')return {id:id(2),main_module:RENEWAL.mainModule,modules:uploadModules.map(m=>({...m,content_base64:kind==='uploaded-code-drift'&&m.name==='runtime-index.js'?Buffer.from('tampered').toString('base64'):m.content_base64}))};
  if(path===ROOT+'/versions?bindings_inherit=strict'&&init.method==='POST'){
   assert.deepEqual([...init.body.keys()].sort(),['metadata','runtime-index.js',RENEWAL.mainModule].sort());
   const metadata=JSON.parse(init.body.get('metadata'));assert.equal(metadata.main_module,RENEWAL.mainModule);
   assert.ok(metadata.bindings.every(b=>b.type==='inherit'));
   assert.equal(metadata.annotations['workers/commit_sha'],undefined);
   uploadModules=await Promise.all(['runtime-index.js',RENEWAL.mainModule].map(async name=>({name,content_base64:Buffer.from(await init.body.get(name).arrayBuffer()).toString('base64')})));
   assert.equal(uploadModules.find(m=>m.name===RENEWAL.mainModule).content_base64,artifact.modules[1].content_base64);
  }
  const mapped=path.replace(RENEWAL.baselineVersion,id(1)).replace(RENEWAL.baselineDeployment,id(10));
  let result=await f.call(mapped,init);
  if(path===ROOT+'/deployments'&&(!init.method||init.method==='GET')&&++reads>=2&&kind==='pre-upload-baseline-drift')result={deployments:[deployment(id(99),id(99))]};
  return JSON.parse(JSON.stringify(result).replaceAll(id(1),RENEWAL.baselineVersion).replaceAll(id(10),RENEWAL.baselineDeployment));
 };
 if(kind==='success'){
  const result=await releaseMemberPagesCodeOnly(f.io);assert.equal(result.phase,'complete');
  assert.equal(result.bundle_sha256,RENEWAL.candidateSha256);assert.equal(result.preserved_wrapper_sha256,RENEWAL.wrapperSha256);
  assert.equal(f.writes(),2);
 }else{
  await assert.rejects(releaseMemberPagesCodeOnly(f.io));
  assert.equal(f.writes(),kind==='pre-upload-baseline-drift'?0:1);
  assert.equal(f.receipts.at(-1).phase,'stopped');
 }
 assert.ok(f.calls.filter(c=>c.method==='POST').every(c=>[ROOT+'/versions?bindings_inherit=strict',ROOT+'/deployments'].includes(c.path)));
});
