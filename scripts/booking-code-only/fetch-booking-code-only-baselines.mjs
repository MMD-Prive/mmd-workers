// Read-only baseline preparation. No upload, deployment, retries or configuration writes.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCodeOnlyAdapter} from './booking-code-only-adapter.mjs';
import {targets,assertSnapshot} from './booking-code-only-release.mjs';
assert.deepEqual(process.argv.slice(2),['--fetch']);
for(const name of ['SOURCE_ROOT','RELEASE_ROOT','ARTIFACT_ROOT','JOURNAL_PATH'])assert.ok(process.env[name],name+' required');
const io=createCodeOnlyAdapter({env:process.env,sourceRoot:process.env.SOURCE_ROOT,releaseRoot:process.env.RELEASE_ROOT,journalPath:process.env.JOURNAL_PATH});
await io.verifySource(process.env.APPROVED_SOURCE_SHA,process.env.APPROVED_SOURCE_TREE);
const baselines=[];
for(const [kind,target] of Object.entries(targets)){const snapshot=await io.snapshot(target.name);assertSnapshot(snapshot,target);assert.equal(snapshot.modules.length,1);assert.equal(snapshot.modules[0].name,target.module);baselines.push([kind,snapshot.modules[0].bytes]);}
mkdirSync(process.env.ARTIFACT_ROOT,{recursive:true});
for(const [kind,bytes]of baselines)writeFileSync(resolve(process.env.ARTIFACT_ROOT,kind+'-baseline.js'),bytes,{mode:0o600,flag:'wx'});
console.log('Both exact baseline artifacts and unchanged live configuration verified; no writes to Cloudflare.');
