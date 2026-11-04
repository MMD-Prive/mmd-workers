// Read-only capture. Does not upload, deploy, change configuration or retry.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCodeOnlyAdapter} from './booking-code-only-adapter.mjs';
import {targets,assertSnapshot,configurationHash,contract} from './booking-code-only-release.mjs';
assert.deepEqual(process.argv.slice(2),['--fetch']);
for(const name of ['SOURCE_ROOT','RELEASE_ROOT','ARTIFACT_ROOT','JOURNAL_PATH'])assert.ok(process.env[name]);
const io=createCodeOnlyAdapter({env:process.env,sourceRoot:process.env.SOURCE_ROOT,releaseRoot:process.env.RELEASE_ROOT,journalPath:process.env.JOURNAL_PATH});
await io.verifySource(contract.source_sha,contract.source_tree);
const captured=[];
for(const [key,t]of Object.entries(targets)){const s=await io.snapshot(t.name);assertSnapshot(s,t);assert.equal(configurationHash(s),t.configuration_sha256,'reviewed configuration drift');captured.push({key,bytes:s.modules[0].bytes,configuration_sha256:configurationHash(s),version:s.version.id,deployment:s.deployment.id});}
mkdirSync(process.env.ARTIFACT_ROOT,{recursive:true});
for(const c of captured){writeFileSync(resolve(process.env.ARTIFACT_ROOT,c.key==='sigil'?'sigil-baseline.mjs':'member-baseline.js'),c.bytes,{mode:0o600,flag:'wx'});const {bytes,...receipt}=c;writeFileSync(resolve(process.env.ARTIFACT_ROOT,c.key+'-baseline-receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600,flag:'wx'});}
