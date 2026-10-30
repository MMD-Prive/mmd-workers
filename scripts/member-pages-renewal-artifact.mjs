import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {resolve} from 'node:path';
import {applyReviewedArtifactDelta,verifyModuleInventory} from './member-pages-artifact-delta.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const raw=readFileSync(new URL('./member-pages-renewal-delta.json',import.meta.url));
assert.equal(hash(raw),'8ad1a41733f00025dda2b264524cc35276241bb5478a45aa75d2277eeeb92192','Renewal manifest drift');
export const RENEWAL=Object.freeze(JSON.parse(raw));
export function decodeRenewalBaseline(version) {
 return verifyModuleInventory(version,RENEWAL.baselineVersion,RENEWAL.mainModule,{
  'runtime-index.js':RENEWAL.baselineSha256,[RENEWAL.mainModule]:RENEWAL.wrapperSha256,
 });
}
// Execute only the customer render function with stubbed read APIs. No business writes.
export async function verifyRenewalBehavior(bytes) {
 const text=Buffer.from(bytes).toString('utf8');
 const start=text.indexOf('  function render(data) {');
 const end=text.indexOf('  async function boot(',start);
 assert.ok(start>=0 && end>start,'Renewal render missing');
 const buttons=[],notices=[],hydrations=[];
 const context={CONFIG:{intent:'renew'},locale:'th',busy:false,
  actions:{replaceChildren(){buttons.length=0;},append(x){buttons.push(x);}},
  document:{createElement:()=>({addEventListener(_e,f){this.handler=f;}})},
  show:x=>notices.push(x),setBusy:x=>{context.busy=x;},
  async readProfile(){return null;},async hydrateMemberHome(){hydrations.push(true);}};
 runInNewContext(text.slice(start,end)+'render({screen:{key:"renew_member_lookup",actions:[{id:"start_payment",label:"Pay"}]}});',context,{timeout:1000});
 assert.equal(buttons.length,1);assert.equal(buttons[0].textContent,'ตรวจสมาชิกอีกครั้ง');
 await buttons[0].handler();assert.equal(hydrations.length,0);assert.equal(buttons.length,1);
 assert.match(notices.at(-1),/ก่อนชำระเงินหรือส่งสลิป/);
 context.readProfile=async()=>{throw Error('fixture');};await buttons[0].handler();
 assert.equal(hydrations.length,0);assert.equal(context.busy,false);
 context.readProfile=async()=>({member_binding:'invalid'});await buttons[0].handler();
 assert.equal(hydrations.length,0);
 context.readProfile=async()=>({member_binding:'a'.repeat(64)});await buttons[0].handler();
 assert.equal(hydrations.length,1);assert.equal(buttons.length,0);
}
export async function buildReviewedRenewalModules(modules) {
 const result=modules.map(m=>({name:m.name,bytes:m.name==='runtime-index.js'
  ? applyReviewedArtifactDelta(m.bytes,RENEWAL.edits.map(e=>({...e,before:Buffer.from(e.before,'base64'),after:Buffer.from(e.after,'base64')})),RENEWAL.baselineSha256):m.bytes}));
 assert.equal(hash(result.find(m=>m.name==='runtime-index.js').bytes),RENEWAL.candidateSha256,'Renewal candidate drift');
 assert.equal(hash(result.find(m=>m.name===RENEWAL.mainModule).bytes),RENEWAL.wrapperSha256,'wrapper drift');
 await verifyRenewalBehavior(result.find(m=>m.name==='runtime-index.js').bytes);
 return result;
}
export function verifyUploadedRenewalModules(version,id) {
 return verifyModuleInventory(version,id,RENEWAL.mainModule,{
  'runtime-index.js':RENEWAL.candidateSha256,[RENEWAL.mainModule]:RENEWAL.wrapperSha256,
 });
}
export function inspectRenewalReleaseCheckout(sha,directory=process.cwd()) {
 const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 assert.match(sha||'',/^[a-f0-9]{40}$/);
 assert.equal(resolve(git('rev-parse','--show-toplevel')),resolve(directory),'checkout root mismatch');
 assert.equal(git('rev-parse','HEAD'),sha);
 assert.equal(git('status','--porcelain','--untracked-files=all','--ignored'),'','dirty release checkout');
 git('merge-base','--is-ancestor',RENEWAL.sourceSha,sha);
 for(const path of ['member-pages-worker/src/liff-identity-foundation.js','member-pages-worker/src/liff-member-shell.js','member-pages-worker/test/liff-member-shell.test.mjs']) {
  assert.equal(git('rev-parse',sha+':'+path),git('rev-parse',RENEWAL.sourceSha+':'+path),'reviewed Renewal source drift');
 }
 return {method:'verified-active-artifact-renewal-delta',delta_source_sha:RENEWAL.sourceSha,baseline_sha256:RENEWAL.baselineSha256,candidate_sha256:RENEWAL.candidateSha256};
}
