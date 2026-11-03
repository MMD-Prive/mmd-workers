// Library only: no CLI, credentials, network calls or writes on import.
import assert from 'node:assert/strict';
import {parsePatchManifest,PATCH_SCHEMA,sha256,releasePolicyPatch} from './care-back-november-policy-release.mjs';
import {verifyOwnerApproval} from './member-pages-owner-approval.mjs';
export const HOME_SCHEMA='my_mmd_home_artifact_delta_v1';
export function parseHomeManifest(raw,expectedHash,worker){
 assert.equal(worker,'member-pages-worker');
 assert.equal(sha256(raw),expectedHash,'manifest hash drift');
 const value=JSON.parse(raw);
 assert.equal(value.schema,HOME_SCHEMA);
 assert.match(value.source_sha||'',/^[a-f0-9]{40}$/);
 const {source_sha,...patch}=value;
 // Reuse the exact structural/byte validators, not CARE BACK execution mode.
 const internal=Buffer.from(JSON.stringify({...patch,schema:PATCH_SCHEMA}));
 parsePatchManifest(internal,sha256(internal),worker);
 return value;
}
export async function releaseHomeDelta(io,env,request=fetch){
 assert.ok(['inspect','execute-approved'].includes(io.mode),'unsupported Home mode');
 assert.equal(io.worker,'member-pages-worker');
 assert.equal(env.APPROVED_SHA,io.releaseSha,'tooling SHA mismatch');
 const manifest=parseHomeManifest(io.manifestBytes,io.expectedManifestHash,io.worker);
 assert.equal(env.APPROVED_SOURCE_SHA,manifest.source_sha,'source SHA mismatch');
 if(io.mode!=='inspect'){
  assert.equal(env.PRODUCTION_APPROVED,'true');
  assert.equal(env.PRODUCTION_ENVIRONMENT_NAME,'member-pages-code-only-owner');
 }
 return releasePolicyPatch({...io,
  sourceCheck:async()=>{
   const proof=await io.sourceCheck();
   assert.equal(proof?.source_sha,manifest.source_sha,'source proof mismatch');
   assert.equal(proof?.manifest_sha256,io.expectedManifestHash,'manifest proof mismatch');
  },
  approve:()=>verifyOwnerApproval(env,request),
 },{parseManifest:parseHomeManifest,releaseLabel:'MY MMD Home exact artifact delta'});
}
