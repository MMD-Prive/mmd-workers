// Production transport. Only reachable through the explicit reviewed CLI flags at the bottom.
// Reads: allowlisted GETs only. Writes: POST versions (strict inherit) and POST deployments for the SIGIL worker only.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,openSync,writeFileSync,fsyncSync,closeSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {contract,scope,hash,allowedWrite,runFloorRelease,requireSealedContract,configurationHash,assertSnapshot} from './floor-release.mjs';
import {verifyFloorOwnerApproval} from './floor-release-owner-approval.mjs';
const uuid=v=>assert.match(v||'',/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
export function allowedRead(p,c=contract){
 const root=`/accounts/${c.account}/workers/scripts/${c.target.name}`;
 return p===`/accounts/${c.account}/workers/domains`||p===`/zones/${c.zone}/workers/routes`
  ||['/deployments','/versions','/settings','/script-settings','/schedules','/subdomain'].some(s=>p===root+s)
  ||new RegExp('^'+root+'/versions/[a-f0-9-]{36}$').test(p)
  ||new RegExp('^/accounts/'+c.account+'/workers/workers/'+c.target.name+'/versions/[a-f0-9-]{36}\\?include=modules$').test(p);
}
export function appendJournal(journalPath,j){assert.ok(journalPath,'journal path required');mkdirSync(dirname(journalPath),{recursive:true});const fd=openSync(journalPath,'a',0o600);try{writeFileSync(fd,JSON.stringify(j)+'\n');fsyncSync(fd);}finally{closeSync(fd);}}
export function createFloorAdapter({env,releaseRoot,journalPath,request=fetch,c=contract,ownerOptions={}}){
 assert.ok(env?.CLOUDFLARE_API_TOKEN&&env?.GH_TOKEN);let capability=false;
 const t=c.target,account=c.account,zone=c.zone,root=`/accounts/${account}/workers/scripts/${t.name}`;
 const call=async(path,{method='GET',body}={})=>{
  assert.ok(method==='GET'?allowedRead(path,c):allowedWrite(path,method,c),'request outside allowlist');
  let response;try{response=await request('https://api.cloudflare.com/client/v4'+path,{method,body,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})}});}catch{throw Error('Cloudflare transport outcome unknown; stop without retry');}
  const payload=await response.json().catch(()=>null);assert.ok(response.ok&&payload?.success===true,'Cloudflare failed or ambiguous; stop without retry');return payload.result;
 };
 const uploaded=async(name,id)=>{
  assert.equal(name,t.name);uuid(id);
  const version=await call(root+'/versions/'+id);assert.equal(version.id,id);
  const artifact=await call(`/accounts/${account}/workers/workers/${name}/versions/${id}?include=modules`);assert.equal(artifact.id,id);assert.ok(Array.isArray(artifact.modules));assert.equal(artifact.main_module,t.module);
  if(version.resources.script.main_module!==undefined)assert.equal(version.resources.script.main_module,artifact.main_module,'conflicting main module');
  version.resources.script.main_module=artifact.main_module;
  const modules=artifact.modules.map(m=>{assert.deepEqual(Object.keys(m).sort(),['content_base64','content_type','name']);assert.equal(m.content_type,'application/javascript+module','module MIME drift');assert.match(m.content_base64||'',/^[A-Za-z0-9+/]+={0,2}$/);const bytes=Buffer.from(m.content_base64,'base64');assert.equal(bytes.toString('base64'),m.content_base64);return{name:m.name,content_type:m.content_type,bytes};});
  return{version,modules};
 };
 const snapshot=async name=>{
  assert.equal(name,t.name);
  const deployments=await call(root+'/deployments');const deployment=deployments.deployments?.[0];assert.equal(deployment?.versions?.length,1);assert.equal(deployment.strategy,'percentage');
  const id=deployment.versions[0].version_id;const data=await uploaded(name,id);
  const versions=await call(root+'/versions');const settings=await call(root+'/settings');const scriptSettings=await call(root+'/script-settings');const schedules=await call(root+'/schedules');const subdomain=await call(root+'/subdomain');
  const allRoutes=await call(`/zones/${zone}/workers/routes`);assert.ok(Array.isArray(allRoutes));const routes=allRoutes.filter(r=>r.script===name);const ids=new Set();for(const r of routes){assert.ok(r.id&&typeof r.pattern==='string'&&!ids.has(r.id));ids.add(r.id);}routes.sort((a,b)=>a.id.localeCompare(b.id));
  const allDomains=await call(`/accounts/${account}/workers/domains`);assert.ok(Array.isArray(allDomains));const domains=allDomains.filter(x=>x.service===name).sort((a,b)=>a.id.localeCompare(b.id));
  const confirmDeployment=(await call(root+'/deployments')).deployments?.[0];const confirmLatest=(await call(root+'/versions')).items?.[0]?.id;
  assert.deepEqual(confirmDeployment,deployment,'deployment changed during snapshot');assert.equal(confirmLatest,versions.items?.[0]?.id,'latest changed during snapshot');
  return{...data,deployment,latest_version:versions.items?.[0]?.id,settings,scriptSettings,boundary:{routes,schedules:schedules.schedules,subdomain,domains}};
 };
 return{
  snapshot,uploaded,
  async verifySource(sha){const git=(...args)=>execFileSync('git',args,{cwd:releaseRoot,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();assert.equal(git('rev-parse','HEAD'),sha,'checkout HEAD drift');assert.equal(sha,env.APPROVED_SHA);assert.equal(git('status','--porcelain=v1','--untracked-files=all'),'','dirty checkout');},
  async approve({sha,ref}){capability=false;assert.equal(sha,env.APPROVED_SHA);assert.equal(ref,env.APPROVAL_REF);await verifyFloorOwnerApproval(env,request,{...ownerOptions,c});capability=true;},
  save(j){appendJournal(journalPath,j);},
  async write(path,{method,body}){
   assert.equal(capability,true,'fresh owner gate required');capability=false;assert.ok(allowedWrite(path,method,c));
   if(path.endsWith('/versions?bindings_inherit=strict')){assert.ok(!body.metadata.migrations&&!body.metadata.exports);assert.ok(body.metadata.bindings.every(b=>b.type==='inherit'));const form=new FormData();form.set('metadata',JSON.stringify(body.metadata));for(const m of body.modules)form.set(m.name,new Blob([m.bytes],{type:'application/javascript+module'}),m.name);return call(path,{method,body:form});}
   return call(path,{method,body:JSON.stringify(body)});
  }
 };
}
// Read-only: print the live values the owner seals into floor-release-contract.json. Never writes.
export async function captureLive({env=process.env,releaseRoot,request=fetch,c=contract}){
 const io=createFloorAdapter({env,releaseRoot,journalPath:null,request,c});
 await verifyFloorOwnerApproval(env,request,{requireRef:false,c});
 const s=await io.snapshot(c.target.name);
 assert.equal(s.modules.length,1);assert.equal(s.modules[0].name,c.target.module);assert.equal(s.modules[0].content_type,'application/javascript+module');
 assert.equal(hash(s.modules[0].bytes),c.target.sha256,'live module is not the pinned baseline; do not seal');
 assert.equal(s.deployment.versions[0].percentage,100);assert.equal(s.latest_version,s.version.id,'latest version is not the deployed version');
 return{worker:c.target.name,module_sha256:hash(s.modules[0].bytes),version:s.version.id,deployment:s.deployment.id,configuration_sha256:configurationHash(s)};
}
// Read-only: fetch the exact deployed bytes, verifying the sealed target before writing them (create-only file).
export async function fetchBaseline({env=process.env,releaseRoot,artifactRoot,request=fetch,c=contract}){
 requireSealedContract(c);
 const io=createFloorAdapter({env,releaseRoot,journalPath:null,request,c});
 const s=await io.snapshot(c.target.name);assertSnapshot(s,c.target);assert.equal(configurationHash(s),c.target.configuration_sha256,'reviewed configuration drift');
 mkdirSync(artifactRoot,{recursive:true});writeFileSync(resolve(artifactRoot,'sigil-baseline.js'),s.modules[0].bytes,{mode:0o600,flag:'wx'});
 return{baseline_sha256:hash(s.modules[0].bytes)};
}
export async function runApprovedFloorRelease({env=process.env,releaseRoot,artifactRoot,journalPath,request=fetch,c=contract}){
 appendJournal(journalPath,{scope:c.scope,phase:'input-validation-started',attempts:[]});
 try{
  assert.equal(env.RELEASE_MODE,c.scope);assert.equal(env.PRODUCTION_APPROVED,'true');assert.ok(releaseRoot&&artifactRoot&&journalPath);
  requireSealedContract(c);
  const proofBytes=readFileSync(resolve(artifactRoot,'sigil-floor-proof.json'));assert.equal(hash(proofBytes),c.proof_sha256,'reviewed proof drift');
  const proof=JSON.parse(proofBytes.toString('utf8'));
  assert.equal(proof.baseline_sha256,c.target.sha256);assert.equal(proof.candidate_sha256,c.candidate_sha256);assert.equal(proof.exports_unchanged,true);assert.deepEqual(proof.migrations,[]);assert.deepEqual(proof.settings_changes,[]);
  // Hashes and exports are checked again by the core; proof fields are evidence, not approval.
  const plan={release_sha:env.APPROVED_SHA,approval_ref:env.APPROVAL_REF,bytes:readFileSync(resolve(artifactRoot,'sigil-candidate.mjs')),sha256:proof.candidate_sha256,exports_unchanged:proof.exports_unchanged,migrations:proof.migrations,settings_changes:proof.settings_changes};
  const io=createFloorAdapter({env,releaseRoot,journalPath,request,c});return await runFloorRelease(io,plan,c);
 }catch(error){if(!error.journal){try{appendJournal(journalPath,{scope:c.scope,phase:'preflight-stopped-no-writes',attempts:[]});}catch{}}throw new Error('Floor release stopped; inspect durable journal. No automatic retry permitted.');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const mode=process.argv[2];assert.equal(process.argv.length,3,'exactly one mode flag');
 assert.ok(['--capture','--fetch-baseline','--execute'].includes(mode),'unsupported mode');
 if(mode==='--capture')console.log(JSON.stringify(await captureLive({releaseRoot:process.env.RELEASE_ROOT}),null,2));
 else if(mode==='--fetch-baseline')console.log(JSON.stringify(await fetchBaseline({releaseRoot:process.env.RELEASE_ROOT,artifactRoot:process.env.ARTIFACT_ROOT})));
 else await runApprovedFloorRelease({releaseRoot:process.env.RELEASE_ROOT,artifactRoot:process.env.ARTIFACT_ROOT,journalPath:process.env.JOURNAL_PATH});
}
