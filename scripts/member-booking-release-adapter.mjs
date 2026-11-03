// Production-capable adapter, never invoked on import. No CLI entrypoint or auto dispatch.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {contract,verifyBookingSources,buildSigilBooking} from './member-booking-build.mjs';
import {prepareBookingRelease,executeBookingRelease} from './member-booking-release.mjs';
import {verifyBookingOwnerApproval} from './member-booking-owner-approval.mjs';
const root=name=>`/accounts/${contract.account}/workers/scripts/${name}`;
export function normalizeBookingRoutes(routes){
 assert.ok(Array.isArray(routes),'incomplete route inventory');const ids=new Set();
 for(const row of routes){
  assert.ok(row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.id==='string'&&row.id.length>0&&row.id.length<=32&&typeof row.pattern==='string'&&row.pattern.length>0&&(row.script==null||typeof row.script==='string'),'incomplete/truncated route inventory');
  assert.ok(!ids.has(row.id),'duplicate route ID');ids.add(row.id);
 }
 return routes.slice().sort((a,b)=>a.id.localeCompare(b.id));
}
export function bookingRequestAllowed(path,method='GET'){
 const names=[contract.member.name,contract.sigil.name];
 if(method==='GET')return path===`/zones/${contract.zone}/workers/routes`||names.some(name=>[root(name)+'/deployments',root(name)+'/versions',root(name)+'/settings',root(name)+'/schedules',root(name)+'/subdomain'].includes(path)||new RegExp('^'+root(name)+'/versions/[a-f0-9-]{36}$').test(path)||new RegExp(`^/accounts/${contract.account}/workers/workers/${name}/versions/[a-f0-9-]{36}\\?include=modules$`).test(path));
 return method==='POST'&&[root(contract.sigil.name)+'/versions?bindings_inherit=strict',root(contract.sigil.name)+'/deployments'].includes(path)||method==='PUT'&&path===root(contract.member.name);
}
export function assertCleanBookingCheckout(directory,sha,run=execFileSync){
 assert.match(sha||'',/^[a-f0-9]{40}$/);const git=(...args)=>run('git',args,{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();assert.equal(resolve(git('rev-parse','--show-toplevel')),resolve(directory));assert.equal(git('rev-parse','HEAD'),sha,'checkout SHA drift');assert.equal(git('status','--porcelain=v1','--untracked-files=all'),'','dirty release checkout');return true;
}
export function createBookingReleaseAdapter({env=process.env,directory,esbuild,request=fetch,save}={}){
 assert.ok(directory&&esbuild&&typeof save==='function');assert.ok(env.CLOUDFLARE_API_TOKEN);assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);let capability='';
 const call=async(path,{method='GET',body}={})=>{assert.ok(bookingRequestAllowed(path,method),'operation outside Booking allowlist');let response;try{response=await request('https://api.cloudflare.com/client/v4'+path,{method,body,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,...(body instanceof FormData?{}:{'content-type':'application/json'})}});}catch{throw Error('Cloudflare transport outcome unknown; stop without retry');}const payload=await response.json().catch(()=>null);assert.ok(response.ok&&payload?.success===true,'Cloudflare call failed; stop without retry');return payload.result;};
 const consume=stage=>{assert.equal(capability,stage,'fresh owner approval required for this write');capability='';};
 const form=(metadata,modules)=>{const f=new FormData();f.set('metadata',JSON.stringify(metadata));for(const m of modules)f.set(m.name,new Blob([m.bytes],{type:m.name.endsWith('.map')?'application/source-map':'application/javascript+module'}),m.name);return f;};
 const version=(name,id)=>call(root(name)+'/versions/'+id);
 return {
  sha:env.GITHUB_SHA,save,invalidate:()=>{capability='';},
  inspectCheckout:sha=>assertCleanBookingCheckout(directory,sha),verifySources:()=>verifyBookingSources(directory),buildSigil:()=>buildSigilBooking({directory,esbuild}),
  async approve(stage){capability='';assert.ok(['sigil-upload','sigil-promote','member-atomic-deploy'].includes(stage));assert.equal(env.PRODUCTION_APPROVED,'true');const receipt=await verifyBookingOwnerApproval(env,request);capability=stage;return receipt;},
  version,
  async snapshot(name){assert.ok([contract.member.name,contract.sigil.name].includes(name));const [deployments,versions,settings,schedules,subdomain,routes]=await Promise.all([call(root(name)+'/deployments'),call(root(name)+'/versions'),call(root(name)+'/settings'),call(root(name)+'/schedules'),call(root(name)+'/subdomain'),call(`/zones/${contract.zone}/workers/routes`)]);const deployment=deployments.deployments[0];assert.equal(deployment.versions.length,1);return {deployment,latestVersion:versions.items[0].id,version:await version(name,deployment.versions[0].version_id),settings,boundary:{schedules,subdomain,routes:normalizeBookingRoutes(routes)}};},
  async modules(name,id){assert.ok([contract.member.name,contract.sigil.name].includes(name));assert.match(id,/^[a-f0-9-]{36}$/);const r=await call(`/accounts/${contract.account}/workers/workers/${name}/versions/${id}?include=modules`);assert.equal(r.id,id);assert.ok(Array.isArray(r.modules));assert.equal(r.main_module,name===contract.member.name?'worker.js':'runtime-index.js');return r.modules.map(m=>{assert.match(m.content_base64||'',/^[A-Za-z0-9+/]+={0,2}$/);const bytes=Buffer.from(m.content_base64,'base64');assert.equal(bytes.toString('base64'),m.content_base64);return {name:m.name,bytes};});},
  async uploadSigil(metadata,modules){consume('sigil-upload');assert.ok(!metadata.migrations&&!metadata.exports,'SIGIL lifecycle mutation forbidden');return call(root(contract.sigil.name)+'/versions?bindings_inherit=strict',{method:'POST',body:form(metadata,modules)});},
  async promoteSigil(id){consume('sigil-promote');assert.match(id,/^[a-f0-9-]{36}$/);return call(root(contract.sigil.name)+'/deployments',{method:'POST',body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}]})});},
  async deployMemberAtomic(metadata,modules){consume('member-atomic-deploy');assert.deepEqual(metadata.migrations,{old_tag:contract.member.old_migration_tag,new_tag:contract.member.new_migration_tag,new_sqlite_classes:[contract.member.class_name]});assert.ok(!metadata.exports,'do not mix lifecycle formats');return call(root(contract.member.name),{method:'PUT',body:form(metadata,modules)});},
 };
}

// Explicit integration entrypoint for a future reviewed owner-only workflow.
// This is not called by import, tests, merge, or an existing legacy deploy job.
export async function runApprovedBookingRelease(options){
 const env=options?.env||process.env;
 assert.equal(env.RELEASE_MODE,'booking-artifact-with-migration');
 assert.equal(env.PRODUCTION_APPROVED,'true');
 const io=createBookingReleaseAdapter({...options,env});
 await io.inspectCheckout(io.sha);await io.verifySources();
 await verifyBookingOwnerApproval(env,options?.request||fetch);
 const prepared=await prepareBookingRelease(io);
 return executeBookingRelease(io,prepared);
}
