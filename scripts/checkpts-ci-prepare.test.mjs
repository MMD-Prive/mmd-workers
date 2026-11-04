import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareCiBaseline} from './checkpts-ci-prepare.mjs';
import {PIN,hash} from './checkpts-preserved-release.mjs';
const input=process.env.CHECKPTS_CI_INPUT_DIR;assert.ok(input,'CHECKPTS_CI_INPUT_DIR required');
function fixture(){const root=mkdtempSync(path.join(os.tmpdir(),'checkpts-ci-input-'));cpSync(input,path.join(root,'input'),{recursive:true});return {input:path.join(root,'input'),output:path.join(root,'review')};}
const receipt=f=>path.join(f.input,PIN.worker,'receipt.json');
test('verified historical artifact yields exact baseline bytes and explicit offline provenance',()=>{
 const f=fixture(),r=prepareCiBaseline(f.input,f.output);assert.equal(r.production_writes,0);assert.equal(r.live_production_read,false);
 assert.equal(hash(readFileSync(path.join(f.output,'baseline',PIN.module))),PIN.js);
 assert.equal(hash(readFileSync(path.join(f.output,'baseline',PIN.module+'.map'))),PIN.map);
});
for(const name of [PIN.module,PIN.module+'.map'])test('rejects tampered '+name+' without creating review output',()=>{
 const f=fixture(),p=path.join(f.input,PIN.worker,name);writeFileSync(p,Buffer.concat([readFileSync(p),Buffer.from(' ')]));
 assert.throws(()=>prepareCiBaseline(f.input,f.output),/hash mismatch/);assert.equal(existsSync(f.output),false);
});
test('missing artifact fails without synthetic fallback',()=>{
 const f=fixture();unlinkSync(path.join(f.input,PIN.worker,PIN.module));assert.throws(()=>prepareCiBaseline(f.input,f.output));assert.equal(existsSync(f.output),false);
});
test('wrong baseline identity is rejected even with correct bundle bytes',()=>{
 const f=fixture(),r=JSON.parse(readFileSync(receipt(f)));r.version_id='different-version';writeFileSync(receipt(f),JSON.stringify(r));
 assert.throws(()=>prepareCiBaseline(f.input,f.output));assert.equal(existsSync(f.output),false);
});
test('unverified receipt is rejected even with correct version and hashes',()=>{
 const f=fixture(),r=JSON.parse(readFileSync(receipt(f)));r.phase='promoted';writeFileSync(receipt(f),JSON.stringify(r));
 assert.throws(()=>prepareCiBaseline(f.input,f.output));assert.equal(existsSync(f.output),false);
});
