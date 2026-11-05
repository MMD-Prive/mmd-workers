// Local candidate only. No auth, network, release manifest mutation or transport.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {applyReviewedArtifactDelta} from './member-pages-artifact-delta.mjs';
export const BASELINE_HASH='25661f7891b22743054d73072029aa686c852c3e87b85bbe2493c936a4fdc5e9';
export const sha=x=>createHash('sha256').update(x).digest('hex');
const read=name=>fs.readFileSync(new URL('../member-pages-worker/src/'+name,import.meta.url),'utf8');
const compile=text=>{
 const {transformSync}=createRequire(import.meta.url)('../member-pages-worker/test-runtime/node_modules/esbuild/lib/main.js');
 return transformSync(text.replace(/^export /gm,''),{target:'es2022',format:'esm',keepNames:false}).code.trim();
};
export function buildStartPersistenceDelta(bytes) {
 assert.equal(sha(bytes),BASELINE_HASH,'active artifact drift');
 const text=bytes.toString(), patches=[];
 const add=(id,before,after)=>{assert(before&&after&&before!==after);assert.equal(text.split(before).length,2,'ambiguous '+id);patches.push({id,before,after,before_sha256:sha(before),after_sha256:sha(after)});};
 const helperStart=text.indexOf('function createStartDiagnostics('), helperEnd=text.indexOf('\nfunction createFlowDiagnosticSender(',helperStart);
 assert(text.startsWith('var __mmdDiagnostics3059 = (() => {\n'));assert(helperStart>=0&&helperEnd>helperStart);
 const diagnosticSource=read('liff-start-diagnostics.js');
 add('bounded-kv-timing-sink',text.slice(helperStart,helperEnd),compile(diagnosticSource));
 const identityStart=text.indexOf('var IdentityPatch = (() => {'), identityEnd=text.indexOf('var OwnerPatch = (() => {',identityStart);
 assert(identityStart>0&&identityEnd>identityStart);assert(text.includes('handleStart = IdentityPatch.handleStart;'));
 const a=text.indexOf('async function handleStart(request, env = {}) {',identityStart),b=text.indexOf('\nasync function handleStartTimed(',a);
 assert(a>identityStart&&b>a&&b<identityEnd);
 const foundation=read('liff-identity-foundation.js');
 const c=foundation.indexOf('export async function handleStart('),d=foundation.indexOf('\nasync function handleStartTimed(',c);assert(c>=0&&d>c);
 const wrapper=compile(foundation.slice(c,d)).replace('createStartDiagnostics(', '__mmdDiagnostics3059.createStartDiagnostics(');
 add('active-identity-context',text.slice(a,b),wrapper);
 // Both the exported base dispatcher and IdentityPatch.default must pass ctx.
 for (const [id,before] of [
  ['base-dispatch-context','response3 = await handleStart(request, env);'],
  ['identity-dispatch-context','response = await handleStart(request, env);'],
 ]) add(id,before,before.replace('request, env)','request, env, ctx)'));
 const candidate=applyReviewedArtifactDelta(bytes,patches.map(p=>({before:Buffer.from(p.before),after:Buffer.from(p.after),beforeHash:p.before_sha256,afterHash:p.after_sha256})),BASELINE_HASH);
 let reversed=candidate.toString();for(const p of [...patches].reverse()){assert.equal(reversed.split(p.after).length,2);reversed=reversed.replace(p.after,p.before);}assert.equal(reversed,text);
 const region=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert(start>=0&&end>start);return s.slice(start,end);};
 assert.equal(region(candidate.toString(),'var OwnerPatch = (() => {','var RecoveryDO = (() => {'),region(text,'var OwnerPatch = (() => {','var RecoveryDO = (() => {'));
 const tail='var __dmCreditsImpl = (() => {';assert(text.includes(tail));const candidateText=candidate.toString();assert.equal(candidateText.slice(candidateText.indexOf(tail)),text.slice(text.indexOf(tail)));
 return {candidate,patches,source_sha256:{diagnostics:sha(diagnosticSource),foundation:sha(foundation)},releaseReady:false};
}
