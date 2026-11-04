import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHomeManifest} from './my-mmd-home-delta-adapter.mjs';
const baselinePath=process.env.MMD_DIAGNOSTICS_BASELINE;
test('delta builder remains local-only with fixed baseline/source and active IdentityPatch guards',()=>{
 const source=fs.readFileSync(new URL('./my-mmd-flow-diagnostics-delta.mjs',import.meta.url),'utf8');
 assert.match(source,/assert.equal\(sha\(bytes\),BASELINE_HASH/);
 assert.match(source,/reviewed source blob drift/);assert.match(source,/handleStart = IdentityPatch.handleStart/);
 assert.match(source,/Owner overlay drift/);assert.match(source,/assert.equal\(reverse,baseline\)/);
 assert.doesNotMatch(source,/\bfetch\(|CLOUDFLARE_API_TOKEN|wrangler|allowWrites/);
});
test('local exact active artifact diagnostics delta is reversible, scoped and syntax valid',{skip:!baselinePath?'requires explicit local MMD_DIAGNOSTICS_BASELINE; no production access in CI':false},async()=>{
 const {buildDiagnosticsDelta,sha,BASELINE_HASH}=await import('./my-mmd-flow-diagnostics-delta.mjs');
 const bytes=fs.readFileSync(baselinePath);
 assert.equal(sha(bytes),BASELINE_HASH);const {candidate,manifest}=buildDiagnosticsDelta(bytes);
 const raw=Buffer.from(JSON.stringify(manifest,null,2)+'\n');assert.equal(parseHomeManifest(raw,sha(raw),'member-pages-worker').source_sha,manifest.source_sha);
 const {execFileSync}=await import('node:child_process');execFileSync(process.execPath,['--input-type=module','--check'],{input:candidate,stdio:['pipe','pipe','pipe']});
 assert.throws(()=>buildDiagnosticsDelta(Buffer.concat([bytes,Buffer.from(' ')])),/drift/);
 assert(candidate.includes('digital-blackcard-entry'));assert(candidate.includes('loaderVisibility'));
 assert.equal(sha(candidate),'a882ddb90ceea1cb15c6ea5c49c9e65e874877f7b1dc99b5fc53ba59f1426e04');
 assert.equal(sha(raw),'0faf49fea3332befbaea01be05c8c0fc40b6c7590f918baeabbda8b78048a7cf');
 console.log(JSON.stringify({candidateBytes:candidate.length,candidateHash:sha(candidate),manifestHash:sha(raw),patches:manifest.modules[0].patches.length,reverseExact:true,ownerCreditsOverlayExact:true,releaseReady:false}));
});
