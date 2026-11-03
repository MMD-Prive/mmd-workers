// Production transport, only callable through explicit reviewed CLI/entrypoint.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,openSync,writeFileSync,fsyncSync,closeSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {account,targets,scope,allowedWrite,runCodeOnlyRelease,contract,hash,requireSealedContract} from './booking-code-only-release.mjs';
import {verifyCodeOnlyOwnerApproval} from './booking-code-only-owner-approval.mjs';
const zone='2d62396174fa2ddadbbcd0e8cf0f3367';
const root=name=>`/accounts/${account}/workers/scripts/${name}`;
const modulePath=(name,id)=>`/accounts/${account}/workers/workers/${name}/versions/${id}?include=modules`;
const names=Object.values(targets).map(t=>t.name);
const uuid=v=>assert.match(v||'',/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
export function allowedRead(p){return p===`/accounts/${account}/workers/domains`||p===`/zones/${zone}/workers/routes`||names.some(n=>['/deployments','/versions','/settings','/script-settings','/schedules','/subdomain'].some(s=>p===root(n)+s)||new RegExp('^'+root(n)+'/versions/[a-f0-9-]{36}$').test(p)||new RegExp('^/accounts/'+account+'/workers/workers/'+n+'/versions/[a-f0-9-]{36}\\?include=modules$').test(p));}
export function appendJournal(journalPath,j){assert.ok(journalPath,'journal path required');mkdirSync(dirname(journalPath),{recursive:true});const fd=openSync(journalPath,'a',0o600);try{writeFileSync(fd,JSON.stringify(j)+'\n');fsyncSync(fd);}finally{closeSync(fd);}}
export function createCodeOnlyAdapter({env,sourceRoot,releaseRoot,journalPath,request=fetch}){
 assert.ok(env?.CLOUDFLARE_API_TOKEN&&env?.GH_TOKEN);let capability=false;
 const call=async(path,{method='GET',body}={})=>{
  assert.ok(method==='GET'?allowedRead(path):allowedWrite(path,method),'request outside allowlist');
  let response;try{response=await request('https://api.cloudflare.com/client/v4'+path,{method,body,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})}});}catch{throw Error('Cloudflare transport outcome unknown; stop without retry');}
  const payload=await response.json().catch(()=>null);assert.ok(response.ok&&payload?.success===true,'Cloudflare failed or ambiguous; stop without retry');return payload.result;
 };
 const uploaded=async(name,id)=>{assert.ok(names.includes(name));uuid(id);const version=await call(root(name)+'/versions/'+id);assert.equal(version.id,id);const artifact=await call(modulePath(name,id));assert.equal(artifact.id,id);assert.ok(Array.isArray(artifact.modules));const t=Object.values(targets).find(t=>t.name===name);assert.equal(artifact.main_module,t.module);if(version.resources.script.main_module!==undefined)assert.equal(version.resources.script.main_module,artifact.main_module,'conflicting main module');version.resources.script.main_module=artifact.main_module;const modules=artifact.modules.map(m=>{assert.deepEqual(Object.keys(m).sort(),['content_base64','content_type','name']);assert.equal(m.content_type,'application/javascript+module','module MIME drift');assert.match(m.content_base64||'',/^[A-Za-z0-9+/]+={0,2}$/);const bytes=Buffer.from(m.content_base64,'base64');assert.equal(bytes.toString('base64'),m.content_base64);return{name:m.name,content_type:m.content_type,bytes};});return{version,modules};};
 return{
  async verifySource(sha,tree){const git=(dir,...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();for(const [dir,head]of[[sourceRoot,sha],[releaseRoot,env.APPROVED_SHA]]){assert.equal(git(dir,'rev-parse','HEAD'),head,'checkout HEAD drift');assert.equal(git(dir,'status','--porcelain=v1','--untracked-files=all'),'','dirty checkout');}assert.equal(git(sourceRoot,'rev-parse','HEAD^{tree}'),tree);},
  async approve({sha,source_sha,ref}){capability=false;assert.equal(sha,env.APPROVED_SHA);assert.equal(source_sha,env.APPROVED_SOURCE_SHA);assert.equal(ref,env.APPROVAL_REF);await verifyCodeOnlyOwnerApproval(env,request);capability=true;},
  save(j){appendJournal(journalPath,j);},
  uploaded,
  async snapshot(name){assert.ok(names.includes(name));const deployments=await call(root(name)+'/deployments');const deployment=deployments.deployments?.[0];assert.equal(deployment?.versions?.length,1);assert.equal(deployment.strategy,'percentage');const id=deployment.versions[0].version_id;const data=await uploaded(name,id);const versions=await call(root(name)+'/versions');const settings=await call(root(name)+'/settings');const scriptSettings=await call(root(name)+'/script-settings');const schedules=await call(root(name)+'/schedules');const subdomain=await call(root(name)+'/subdomain');const allRoutes=await call(`/zones/${zone}/workers/routes`);assert.ok(Array.isArray(allRoutes));const routes=allRoutes.filter(r=>r.script===name);const ids=new Set();for(const r of routes){assert.ok(r.id&&typeof r.pattern==='string'&&!ids.has(r.id));ids.add(r.id);}routes.sort((a,b)=>a.id.localeCompare(b.id));const allDomains=await call(`/accounts/${account}/workers/domains`);assert.ok(Array.isArray(allDomains));const domains=allDomains.filter(x=>x.service===name).sort((a,b)=>a.id.localeCompare(b.id));const confirmDeployment=(await call(root(name)+'/deployments')).deployments?.[0];const confirmLatest=(await call(root(name)+'/versions')).items?.[0]?.id;assert.deepEqual(confirmDeployment,deployment,'deployment changed during snapshot');assert.equal(confirmLatest,versions.items?.[0]?.id,'latest changed during snapshot');return{...data,deployment,latest_version:versions.items?.[0]?.id,settings,scriptSettings,boundary:{routes,schedules:schedules.schedules,subdomain,domains}};},
  async write(path,{method,body}){assert.equal(capability,true,'fresh owner gate required');capability=false;assert.ok(allowedWrite(path,method));if(path.endsWith('/versions?bindings_inherit=strict')){assert.ok(!body.metadata.migrations&&!body.metadata.exports);assert.ok(body.metadata.bindings.every(b=>b.type==='inherit'));const form=new FormData();form.set('metadata',JSON.stringify(body.metadata));for(const m of body.modules)form.set(m.name,new Blob([m.bytes],{type:'application/javascript+module'}),m.name);return call(path,{method,body:form});}return call(path,{method,body:JSON.stringify(body)});}
 };
}
export async function runApprovedCodeOnlyRelease({env=process.env,sourceRoot,releaseRoot,artifactRoot,journalPath,request=fetch}){
 appendJournal(journalPath,{scope,phase:'input-validation-started',attempts:[]});
 try{
 assert.equal(env.RELEASE_MODE,scope);assert.equal(env.PRODUCTION_APPROVED,'true');assert.ok(sourceRoot&&releaseRoot&&artifactRoot&&journalPath);
 requireSealedContract();
 const read=p=>{const bytes=readFileSync(resolve(artifactRoot,p));const pin=Object.values(contract.proof_files).find(x=>x.path===p);assert.ok(pin,'unreviewed proof file');assert.equal(hash(bytes),pin.sha256,'reviewed proof drift');return JSON.parse(bytes.toString('utf8'));};
 const member=read('member-candidate-manifest.json');assert.equal(member.source_sha,env.APPROVED_SOURCE_SHA);assert.equal(member.source_tree,env.APPROVED_SOURCE_TREE);assert.equal(member.baseline_sha256,targets.member.sha256);
 const sigil=read('sigil-overlay-proof.json');assert.equal(sigil.unrelated_bytes_preserved,true);assert.equal(sigil.runtime_routes_preserved,true);assert.equal(sigil.reviewed_tree,env.APPROVED_SOURCE_TREE);assert.equal(sigil.source_sha,env.APPROVED_SOURCE_SHA);assert.equal(sigil.source_tree,env.APPROVED_SOURCE_TREE);assert.equal(sigil.baseline_sha256,targets.sigil.sha256);assert.equal(sigil.exports_unchanged,true);assert.deepEqual(sigil.migrations,[]);assert.deepEqual(sigil.settings_changes,[]);
 // Artifact hashes and unchanged exports are checked by core; manifest fields are evidence, not approval.
 const plan={release_sha:env.APPROVED_SHA,source_sha:env.APPROVED_SOURCE_SHA,source_tree:env.APPROVED_SOURCE_TREE,approval_ref:env.APPROVAL_REF,member:{bytes:readFileSync(resolve(artifactRoot,'member-candidate.js')),sha256:member.candidate_sha256,exports_unchanged:member.exports_unchanged,migrations:member.migrations,settings_changes:member.settings_changes},sigil:{bytes:readFileSync(resolve(artifactRoot,'sigil-candidate.mjs')),sha256:sigil.candidate_sha256,exports_unchanged:sigil.exports_unchanged,migrations:sigil.migrations,settings_changes:sigil.settings_changes}};
 const io=createCodeOnlyAdapter({env,sourceRoot,releaseRoot,journalPath,request});return await runCodeOnlyRelease(io,plan);
 }catch(error){if(!error.journal){try{appendJournal(journalPath,{scope,phase:'preflight-stopped-no-writes',attempts:[]});}catch{}}throw new Error('Code-only release stopped; inspect durable journal. No automatic retry permitted.');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert.deepEqual(process.argv.slice(2),['--execute'],'only explicit --execute supported');
 await runApprovedCodeOnlyRelease({sourceRoot:process.env.SOURCE_ROOT,releaseRoot:process.env.RELEASE_ROOT,artifactRoot:process.env.ARTIFACT_ROOT,journalPath:process.env.JOURNAL_PATH});
}
