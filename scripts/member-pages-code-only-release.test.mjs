import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ACCOUNT, ROOT, VERSION_ROOT, ZONE, CODE_ONLY_BASE_SHA, CODE_ONLY_SOURCE_SHA, CODE_ONLY_INCLUDED_PULL_REQUESTS, CODE_ONLY_EXCLUDED_CHANGE, CODE_ONLY_PATHS, activeVersion, createTransport, inspectCodeOnlyCheckouts, releaseMemberPagesCodeOnly,
  buildMemberPagesBundle, uploadMetadata, validateBundleFiles, validateCodeOnlySourcePaths, validateCodeOnlySourceHistory, validateBundleSourceMap, versionAnnotations, versionConfiguration,
} from './member-pages-code-only-release.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sha = CODE_ONLY_SOURCE_SHA;
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
    sha, releaseSha, expectedVersion:id(1), expectedDeployment:id(10),
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
  assert.equal(result.source_sha, CODE_ONLY_SOURCE_SHA);
  assert.equal(result.release_sha, releaseSha);
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
  const map = {version:3,sourceRoot:'..',sources:['member-pages-worker/src/runtime-index.js','shared/private-media.mjs'],mappings:'AAAA'};
  assert.deepEqual(validateBundleSourceMap(map,directory,repository),
    ['member-pages-worker/src/runtime-index.js','shared/private-media.mjs']);
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
    sources:['member-pages-worker/src/runtime-index.js','shared/private-media.mjs'],mappings:'AAAA'};
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
  ]);
  const ancestors = [CODE_ONLY_BASE_SHA, ...CODE_ONLY_INCLUDED_PULL_REQUESTS.map(pr=>pr.merge_sha)];
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
      ? options.sourceSha || CODE_ONLY_SOURCE_SHA : options.releaseSha || releaseSha;
    if (args[0] === 'status') return directory === options.dirtyDirectory ? '!! injected.js' : '';
    if (args[0] === 'merge-base') {
      if (options.missingHistory) throw new Error('not_ancestor');
      return '';
    }
    if (args[0] === 'diff' && args[1] === '--name-only') return [...CODE_ONLY_PATHS, ...(options.extraPaths || [])].join('\n');
    if (args[0] === 'diff') return options.changedConfig ? 'config changed' : '';
    throw new Error('unexpected_git_read');
  };
  return {calls,releaseDirectory,sourceDirectory,git};
}

test('new release tooling can bundle only the separate exact PR 2523 source', () => {
  const f = checkoutFixture();
  const evidence = inspectCodeOnlyCheckouts(releaseSha, f.sourceDirectory, f);
  assert.equal(evidence.source_sha, CODE_ONLY_SOURCE_SHA);
  assert.equal(evidence.release_sha, releaseSha);
  assert.deepEqual(evidence.source_scope.included_paths,CODE_ONLY_PATHS);
  assert.deepEqual(evidence.source_scope.excluded_changes,[]);
  assert.ok(f.calls.filter(x=>x.args[0]==='diff').every(x=>x.directory===f.sourceDirectory));
  assert.ok(f.calls.some(x=>x.directory===f.releaseDirectory && x.args.join(' ')
    ===`merge-base --is-ancestor ${CODE_ONLY_SOURCE_SHA} ${releaseSha}`));
  for (const directory of [f.releaseDirectory,f.sourceDirectory]) {
    assert.ok(f.calls.some(x=>x.directory===directory && x.args.join(' ')
      ==='status --porcelain --untracked-files=all --ignored'));
  }
});

test('wrong source, changed config, extra Worker paths and dirty checkouts fail closed', () => {
  for (const options of [
    {sourceSha:releaseSha}, {releaseSha:'b'.repeat(40)}, {wrongRoot:true},
    {dirtyDirectory:'/release-tools'}, {dirtyDirectory:'/release-source'},
    {missingHistory:true}, {changedConfig:true},
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
  assert.equal((source.match(/inputs\.approved_sha == github\.sha/g)||[]).length,2);
  assert.match(source,/needs: \[production-approval\][\s\S]*environment: member-pages-code-only-owner/);
  const preflight = source.slice(source.indexOf('  production-approval:'), source.indexOf('  release:'));
  assert.match(preflight, /permissions:\s+contents: read\s+actions: read/);
  assert.match(preflight, /run: node scripts\/member-pages-owner-approval.mjs/);
  assert.doesNotMatch(preflight, /uses: \.\/\.github\/workflows\/admin-production-approval.yml/);
  assert.doesNotMatch(preflight, /secrets\./);

  assert.match(source,/EXPECTED_VERSION: \$\{\{ inputs\.expected_version \}\}/);
  assert.match(source,/EXPECTED_DEPLOYMENT: \$\{\{ inputs\.expected_deployment \}\}/);
  assert.equal((source.match(/secrets\./g)||[]).length,1);
  assert.match(source,/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.doesNotMatch(source,/AIRTABLE|R2_API|ensure-private|ensure-payment|wrangler route|wrangler secret|synthetic_write|production public Wish/i);
  assert.match(source,/node scripts\/member-pages-code-only-release\.mjs --execute-approved/);
  assert.match(source, /node --test [^\n]*member-pages-worker\/test\/points-display-source-guard.test.mjs/);
  assert.match(source, /node --test [^\n]*member-pages-worker\/test\/kenji-line-member-truth.test.mjs/);
  assert.match(source, /ref: 151d21eabd988396eef36b944c931b23e51cea69\s+fetch-depth: 0\s+path: release-source/);
  assert.match(source, /ref: \$\{\{ github.sha \}\}\s+fetch-depth: 0\s+path: release-tools/);
  assert.match(source, /SOURCE_DIRECTORY: \$\{\{ github.workspace \}\}\/release-source/);
  assert.match(source, /working-directory: release-tools/);
  assert.match(source, /node --test \.\.\/release-source\/member-pages-worker/);
  const releaseSource = readFileSync(new URL('./member-pages-code-only-release.mjs',import.meta.url),'utf8');
  assert.match(releaseSource, /cwd:sourceDirectory, stdio: 'ignore'/);
});
