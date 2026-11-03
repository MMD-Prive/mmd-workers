import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bootstrapEntry} from '../../scripts/prepare-profile-bootstrap.mjs';
// Pin the local rehearsal runtime; this is not production-runtime equivalence.
const require=createRequire(import.meta.url);
const {Miniflare}=require('miniflare');
const {build}=require('esbuild');

test('SQLite journal, receipts and tombstones survive bootstrap → active → corrective with read-only inspection',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'mms-profile-switch-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const modulePath=fileURLToPath(new URL('../src/therapist-profile-coordinator.mjs',import.meta.url));
 const dormant=bootstrapEntry.match(/export class MmsTherapistProfileCoordinator extends DurableObject \{[\s\S]*?\n\}/)?.[0];assert.ok(dormant);
 for(const generation of ['bootstrap','active','corrective']){
  const original=generation==='bootstrap'?"import {DurableObject} from 'cloudflare:workers';\n"+dormant.replace('export class MmsTherapistProfileCoordinator','class Actual'):`import {MmsTherapistProfileCoordinator as Actual} from ${JSON.stringify(modulePath)};`;
  // Seed/snapshot routes are synthetic fixture code only, never product routes.
  const source=original+`\nexport class MmsTherapistProfileCoordinator extends Actual {constructor(ctx,env){super(ctx,env);this.fixtureStorage=ctx.storage;}async fetch(r){const p=new URL(r.url).pathname;if(p==='/seed'){await this.fixtureStorage.put(await r.json());return new Response('ok');}if(p==='/snapshot')return Response.json([...await this.fixtureStorage.list()]);if(p==='/inspect')return Response.json(await this.inspect('mmst_fixture'));return super.fetch(r);}}\nexport default {fetch(r,env){return env.MMS_THERAPIST_PROFILES.getByName('mmst_fixture').fetch(r);}};`;
  await writeFile(join(dir,generation+'.mjs'),source);
  await build({entryPoints:[join(dir,generation+'.mjs')],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],outfile:join(dir,generation+'-bundle.mjs'),logLevel:'silent'});
 }
 const phases=['prepared','airtable_inflight','airtable_unknown','airtable_saved','manifest_saved','completed'];
 for(const [i,phase] of phases.entries()){
  const state={owner:'mmst_fixture',revision:3,pending:phase==='completed'?null:{id:'11111111-2222-4333-8444-555555555555',revision:3,fingerprint:'a'.repeat(64),phase,plan:{owner:'mmst_fixture',recordId:'recSynthetic0001'}},'deleted:ph_fixture':true,'op:prior':{revision:3,result:{status:200,body:'private synthetic receipt'}}};
  let baseline;
  for(const generation of ['bootstrap','active','corrective']){
   let outbound=0;
   const mf=new Miniflare({workers:[{name:'profile-switch-fixture',modules:true,modulesRoot:dir,scriptPath:join(dir,generation+'-bundle.mjs'),compatibilityDate:'2026-06-11',compatibilityFlags:['nodejs_compat'],durableObjects:{MMS_THERAPIST_PROFILES:{className:'MmsTherapistProfileCoordinator',useSQLite:true}},bindings:{MMS_PROFILE_WRITES_PAUSED:'true'},outboundService:()=>{outbound++;throw Error('external request forbidden');}}],durableObjectsPersist:join(dir,'state-'+i)});
   try{
    if(generation==='bootstrap'){await mf.dispatchFetch('https://fixture/seed',{method:'POST',body:JSON.stringify(state)});baseline=await(await mf.dispatchFetch('https://fixture/snapshot')).json();}
    assert.deepEqual(await(await mf.dispatchFetch('https://fixture/snapshot')).json(),baseline,phase+' '+generation);
    if(generation!=='bootstrap'){const summary=await(await mf.dispatchFetch('https://fixture/inspect')).json();assert.equal(summary.status,phase==='completed'?'NO_LOCAL_PENDING':'PENDING');assert.equal(summary.drain,'UNKNOWN');assert.equal(JSON.stringify(summary).includes('private synthetic receipt'),false);assert.deepEqual(await(await mf.dispatchFetch('https://fixture/snapshot')).json(),baseline);}
    assert.equal(outbound,0);
   }finally{await mf.dispose();}
  }
 }
});
