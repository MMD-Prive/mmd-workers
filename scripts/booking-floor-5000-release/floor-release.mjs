// SIGIL-only code-only release state machine. No CLI, token lookup, network transport or auto invocation.
// Reuses the reviewed pure snapshot/metadata helpers of the identity release; owns its own contract and write allowlist.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hash,normalizedVersion,normalizedSettings,configurationHash,metadataFor,assertSnapshot} from '../booking-identity-release/booking-code-only-release.mjs';
export {hash,configurationHash,metadataFor,assertSnapshot,normalizedVersion};
export const contract=JSON.parse(readFileSync(new URL('./floor-release-contract.json',import.meta.url),'utf8'));
export const scope=contract.scope;
const hex64=/^[a-f0-9]{64}$/;
const uuidRe=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const eq=(a,b,label)=>assert.deepEqual(a,b,label);
export const sealedRefHash=ref=>hash(Buffer.from(String(ref)));
// Every field the owner must seal after a read-only capture. Null fields fail closed.
export function requireSealedContract(c=contract){
 const t=c.target;
 for(const v of [t.sha256,t.configuration_sha256,c.candidate_sha256,c.proof_sha256,c.approval_ref_sha256])assert.match(v||'',hex64,'unsealed release contract');
 for(const v of [t.version,t.deployment])assert.match(v||'',uuidRe,'unsealed release contract');
}
export function allowedWrite(path,method,c=contract){
 const base=`/accounts/${c.account}/workers/scripts/${c.target.name}`;
 return method==='POST'&&[base+'/versions?bindings_inherit=strict',base+'/deployments'].includes(path);
}
function preserved(a,b){
 eq(normalizedVersion(a.version),normalizedVersion(b.version),'bindings/runtime/DO identity drift');
 eq(normalizedSettings(a.settings),normalizedSettings(b.settings),'settings drift');
 eq(a.boundary,b.boundary,'routes/schedules/subdomain drift');
 eq(a.scriptSettings,b.scriptSettings,'script-level settings drift');
}
export async function runFloorRelease(io,plan,c=contract){
 // All transport and approval evidence is supplied by a reviewed caller. No default fetch,
 // environment fallback, fake receipts, retry or rollback.
 for(const k of ['approve','snapshot','uploaded','write','save','verifySource'])assert.equal(typeof io[k],'function',`required io.${k}`);
 const t=c.target;
 const journal={scope:c.scope,phase:'preflight',attempts:[],completed:[]};
 const save=()=>io.save(structuredClone(journal));
 const gate=()=>io.approve({scope:c.scope,sha:plan.release_sha,ref:plan.approval_ref});
 const write=async(operation,body)=>{
  const path=`/accounts/${c.account}/workers/scripts/${t.name}/${operation==='upload'?'versions?bindings_inherit=strict':'deployments'}`;
  assert.ok(allowedWrite(path,'POST',c));
  journal.phase=`sigil-${operation}-outcome-unknown`;journal.attempts.push({worker:'sigil',operation,state:'attempted'});await save();
  const result=await io.write(path,{method:'POST',body});
  assert.match(result?.id||'',uuidRe);
  journal.attempts.at(-1).state='returned';journal.attempts.at(-1).id=result.id;await save();return result;
 };
 try{
  assert.match(plan.release_sha||'',/^[a-f0-9]{40}$/);
  requireSealedContract(c);
  assert.ok(plan.approval_ref?.trim());assert.equal(sealedRefHash(plan.approval_ref),c.approval_ref_sha256,'wrong owner authorization reference');
  await io.verifySource(plan.release_sha);await gate();
  assert.equal(plan.sha256,c.candidate_sha256,'unreviewed candidate');assert.equal(hash(plan.bytes),plan.sha256,'candidate hash drift');
  assert.equal(plan.exports_unchanged,true);eq(plan.migrations,[]);eq(plan.settings_changes,[]);
  const base=await io.snapshot(t.name);assertSnapshot(base,t);assert.equal(configurationHash(base),t.configuration_sha256,'reviewed configuration drift');
  await save();
  await gate();const fresh=await io.snapshot(t.name);assertSnapshot(fresh,t);preserved(base,fresh);
  const metadata=metadataFor(fresh,t);
  const upload=await write('upload',{metadata,modules:[{name:t.module,content_type:'application/javascript+module',bytes:plan.bytes}]});
  const readback=await io.uploaded(t.name,upload.id);
  assert.equal(readback.version.id,upload.id);assert.equal(readback.modules?.length,1);assert.equal(readback.modules[0].name,t.module);
  assert.equal(readback.modules[0].content_type,'application/javascript+module','uploaded MIME mismatch');
  assert.equal(hash(readback.modules[0].bytes),plan.sha256,'uploaded bytes mismatch');
  eq(normalizedVersion(readback.version),normalizedVersion(base.version),'uploaded resources mismatch');
  await gate();const staged=await io.snapshot(t.name);assertSnapshot(staged,t,{latest:upload.id});preserved(base,staged);
  const deployed=await write('promote',{strategy:'percentage',versions:[{version_id:upload.id,percentage:100}]});
  const after=await io.snapshot(t.name);assertSnapshot(after,t,{latest:upload.id,version:upload.id,deployment:deployed.id,sha256:plan.sha256});preserved(base,after);
  journal.completed.push({worker:'sigil',version:upload.id,deployment:deployed.id});journal.phase='sigil-verified';await save();
  journal.phase='complete';await save();return journal;
 }catch{
  journal.failure_phase=journal.phase;journal.phase='stopped-no-retry-no-rollback';
  try{await save();}catch{}
  throw Object.assign(new Error('Floor release stopped; inspect durable journal and read-only provider state.'),{journal});
 }
}
