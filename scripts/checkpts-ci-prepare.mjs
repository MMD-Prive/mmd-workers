// Offline materialization of one immutable historical GitHub artifact for tests.
// No network, credentials, upload or production-status inference.
import assert from 'node:assert/strict';
import {lstatSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PIN,hash} from './checkpts-preserved-release.mjs';
export const ARTIFACT_ID=13266408212;
export const RUN_ID=41710503902;
const expectedNames=[PIN.module,PIN.module+'.map','receipt.json'];
const fingerprint={
 safe_bindings:'cc3748d6eb27b0b8c16162cb9409ca8b032a01703477b597e1085a3e391636bd',
 settings_without_bindings:'b166a13c58bdd115b0ec2565de10f2aae23749baa2e9844277099d75f8e7623b',
};
export function prepareCiBaseline(input,output) {
 const folder=path.join(input,PIN.worker),files={};
 for(const name of expectedNames){
  const p=path.join(folder,name),stat=lstatSync(p);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=20*1024*1024,'missing/unsafe/oversized artifact input: '+name);
  files[name]=readFileSync(p);
 }
 assert.equal(hash(files[PIN.module]),PIN.js,'artifact JS hash mismatch');
 assert.equal(hash(files[PIN.module+'.map']),PIN.map,'artifact map hash mismatch');
 const r=JSON.parse(files['receipt.json']);
 assert.equal(r.worker,PIN.worker);assert.equal(r.version_id,PIN.version);assert.equal(r.deployment_id,PIN.deployment);
 assert.equal(r.phase,'verified');assert.equal(r.code_readback_exact,true);assert.equal(r.map_readback_semantic_equal,true);
 assert.equal(r.js_sha256,PIN.js);assert.equal(r.map_readback_sha256,PIN.map);
 for(const key of ['configuration_preserved','routes_preserved','schedules_preserved','all_interfaces_preserved'])assert.equal(r[key],true,key);
 // Historical snapshot only. Tests replace its configuration with synthetic state.
 const baseline={active_version:PIN.version,deployment:{id:PIN.deployment},config_fingerprints:fingerprint,
  schedules:{schedules:[{cron:'0 * * * *',created_on:'2026-09-14T08:17:46.295288Z',modified_on:'2026-09-14T08:17:46.295288Z'}]},
  routes_sha256:'64bc04ee82e9061cc79a0e8de8f5d15c3885bb1c72a3c46e9bb28eb32a7e832a'};
 const target=path.join(output,'baseline');mkdirSync(target,{recursive:true});
 for(const name of [PIN.module,PIN.module+'.map'])writeFileSync(path.join(target,name),files[name]);
 writeFileSync(path.join(target,'baseline.json'),JSON.stringify(baseline,null,2)+'\n');
 const provenance={source:'historical GitHub Actions readback artifact',artifact_id:ARTIFACT_ID,run_id:RUN_ID,
  baseline_version:PIN.version,baseline_deployment:PIN.deployment,js_sha256:PIN.js,map_sha256:PIN.map,
  live_production_read:false,production_writes:0};
 writeFileSync(path.join(output,'ci-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
 return provenance;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{assert.equal(process.argv.length,4,'usage: checkpts-ci-prepare.mjs ARTIFACT_DIR REVIEW_DIR');console.log(JSON.stringify(prepareCiBaseline(process.argv[2],process.argv[3])));}
 catch(error){console.error('CI baseline rejected: '+error.message);process.exitCode=1;}
}
