import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build,hash,manifest,runUpload,transport,validateManifest} from './kenji-3293-upload.mjs';
const name='member-dashboard-chat-worker', root='/accounts/b176eda1172b741fd2e58904cc9d77c5/workers';
const version='c44c54a7-9359-48b6-aa06-f8f8652a1b31', next='66666666-6666-4666-8666-666666666666';
const module='worker.js', p0=manifest.workers[name];
const fixtureMap=Buffer.from('fixture sourcemap');
function mock({drift=false,staged=false,badReadback=false,expired=false,badMap=false}={}) {
 const baseline=Buffer.from('export default 1'), candidate=Buffer.from('export default 2');
 const etag='a'.repeat(64), script={handlers:['fetch']}, runtime={compatibility_date:'2026-06-20'};
 const bindings=[{name:'LINE_KENJI_MODEL_ENABLED',type:'plain_text',text:'false'}];
 const settings={observability:{enabled:true}}, dep='fixture-deployment', posts=[], phases=[];
 const p={...p0,version,dep,etag,module,sha:hash(baseline),candidate:hash(candidate),sidecar:{name:module+'.map',sha:hash(fixtureMap)},
  cfg:hash(JSON.stringify({bindings,script,runtime})),settings:hash(JSON.stringify(settings)),patches:[{before:'default 1',after:'default 2'}]};
 let approved=0,message='';
 const approve=async()=>{approved++;};
 const call=async (path,method='GET',form)=>{
  if(method==='POST'){
   assert.equal(approved,2);assert(path.endsWith('/versions?bindings_inherit=strict'));
   const m=JSON.parse(form.get('metadata'));message=m.annotations['workers/message'];
   assert.equal(m.main_module,module);
   assert.deepEqual(m.bindings,[{name:'LINE_KENJI_MODEL_ENABLED',type:'inherit'}]);
   assert.equal(await form.get(module).text(),candidate.toString());
   assert.equal(await form.get(module+'.map').text(),fixtureMap.toString());
   posts.push(path);return {id:next};
  }
  if(path.endsWith('/deployments'))return {deployments:[{id:dep,versions:[{version_id:drift?next:version,percentage:100}]}]};
  if(path.endsWith('/script-settings'))return settings;
  if(path.endsWith('/versions'))return {items:[{id:staged?next:version}]};
  const id=path.includes(next)?next:version;
  if(path.endsWith('?include=modules,sourcemaps'))return {id,main_module:module,modules:[{name:module,content_base64:(id===next&&!badReadback?candidate:baseline).toString('base64')},{name:module+'.map',content_base64:(badMap?Buffer.from('wrong'):fixtureMap).toString('base64')}]};
  return {id,resources:{script:{...script,etag},script_runtime:runtime,bindings},annotations:{'workers/message':message}};
 };
 return {args:{name,p,call,approve,save:r=>phases.push(r.phase),syntax:b=>assert.deepEqual(b,candidate),now:()=>Date.parse(expired?'2026-11-30T17:00:00.000Z':'2026-11-30T16:59:59.999Z')},posts,phases};
}
test('manifest pins only Kenji and exact artifact delta',()=>{
 validateManifest(manifest);
 assert.equal(manifest.workers[name].candidate,'6477428678a8352590931c233d025a17db274313846527b5c9fe1308e920f84b');
 assert.equal(manifest.workers[name].version,version);
 assert.equal(manifest.workers[name].patches.length,3);
});
test('Owner gate stays manual and PR path has no deploy credentials',()=>{
 const y=readFileSync(new URL('../.github/workflows/kenji-3293-upload-only.yml',import.meta.url),'utf8');
 assert.match(y,/environment: mmd-production-mutation/);
 assert.match(y,/needs: \[contracts, production-approval\]/);
 assert.match(y,/github.run_attempt == 1/);
 assert.match(y,/github.event_name == 'workflow_dispatch'.*inputs.approved_sha == github.sha/);
 assert.doesNotMatch(y.split('  production-approval:')[0],/CLOUDFLARE_API_TOKEN|\bpush:/);
});
test('transport never permits promotion, config writes or the other Worker',async()=>{
 let network=0;
 const t=transport(name,p0,'fixture',async()=>{network++;return Response.json({success:true,result:{}});});
 for(const [path,method] of [[root+'/scripts/'+name+'/deployments','POST'],[root+'/scripts/'+name+'/script-settings','PATCH'],[root+'/scripts/member-pages-worker/versions?bindings_inherit=strict','POST']])
  await assert.rejects(t(path,method,new FormData()),/outside upload-only scope/);
 assert.equal(network,0);
});
test('selected version is uploaded once and verified without switching traffic',async()=>{
 const {args,posts,phases}=mock();
 const r=await runUpload(args);assert.equal(r.candidate_version,next);assert.equal(r.baseline_traffic,100);assert.equal(posts.length,1);
 assert.deepEqual(phases,['preflight','upload-attempted-outcome-unknown','uploaded-not-promoted','upload-readback-complete']);
});
test('changed traffic or staged version blocks the upload before first write',async()=>{
 for(const flags of [{drift:true},{staged:true}]){
  const {args,posts,phases}=mock(flags);await assert.rejects(runUpload(args));assert.equal(posts.length,0);assert.deepEqual(phases,['preflight']);
 }
});
test('readback mismatch preserves upload receipt and does not retry',async()=>{
 const {args,posts,phases}=mock({badReadback:true});
 await assert.rejects(runUpload(args));assert.equal(posts.length,1);assert.equal(phases.at(-1),'uploaded-not-promoted');
});
test('wrong baseline or non-unique patches fail closed',()=>{
 const {args}=mock();
 assert.throws(()=>build(Buffer.from('wrong'),args.p));
 const b=Buffer.from('default 1; default 1');
 assert.throws(()=>build(b,{...args.p,sha:hash(b)}),/unique byte anchor/);
});
test('expiry or altered version source map refuses to upload',async()=>{
 for(const flags of [{expired:true},{badMap:true}]){
  const {args,posts}=mock(flags);await assert.rejects(runUpload(args));assert.equal(posts.length,0);
 }
});
