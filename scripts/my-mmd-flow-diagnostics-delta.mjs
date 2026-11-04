// Local construction only. No credentials, network, upload or promotion.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {transformSync} from '../member-pages-worker/test-runtime/node_modules/esbuild/lib/main.js';
import {applyReviewedArtifactDelta} from './member-pages-artifact-delta.mjs';
export const BASELINE_HASH='7a5969426551b6d4eaf370b31280dd5a62a446b050529898c4b9b51855d7206f';
export const SOURCE_SHA='3e416e70434dbd8ac7d73917d551f7f101c8c5dd';
export const sha=x=>createHash('sha256').update(x).digest('hex');
const read=name=>{
 const file=new URL('../member-pages-worker/src/'+name,import.meta.url);
 const text=fs.readFileSync(file,'utf8');
 const pinned=execFileSync('git',['show',SOURCE_SHA+':member-pages-worker/src/'+name],{cwd:new URL('../',import.meta.url),encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.equal(text,pinned,'reviewed source blob drift: '+name);return text;
};
const compile=text=>transformSync(text.replace(/^export /gm,''),{target:'es2022',format:'esm',keepNames:false}).code.trim();
function sourcePart(file,start,end){const text=read(file),a=text.indexOf(start),b=text.indexOf(end,a+start.length);assert(a>=0&&b>a);return text.slice(a,b);}
function compiledPart(text,name,async=false){const start=(async?'async ':'')+'function '+name+'(';const a=text.indexOf(start),b=text.indexOf('\n__name('+name+', "'+name+'");',a);assert(a>=0&&b>a);const full=text.slice(a,b);assert.equal(text.split(full).length,2,'full function anchor must be unique');return full;}
export function buildDiagnosticsDelta(bytes){
 assert.equal(sha(bytes),BASELINE_HASH,'fresh baseline bytes drift');
 const baseline=bytes.toString(),patches=[];
 const add=(id,before,after)=>{assert.notEqual(before,after);patches.push({id,before,after,before_sha256:sha(before),after_sha256:sha(after)});};
 const helper='var __mmdDiagnostics3059 = (() => {\n'+compile(read('liff-start-diagnostics.js'))+'\n'+compile(read('liff-flow-diagnostics.js'))+'\nreturn {createStartDiagnostics,createFlowDiagnosticSender};\n})();\n';
 const first=baseline.slice(0,baseline.indexOf('\n'));assert(first.length>0);assert(!baseline.includes('__mmdDiagnostics3059'));
 add('diagnostic-helpers',first,helper+first);
 const loader=compile(sourcePart('liff-customer-progress.js','export function createCustomerProgress(','\nexport function renderCustomerProgress('));
 add('loader-lifecycle',compiledPart(baseline,'createCustomerProgress'),loader);
 let start=compile(sourcePart('liff-identity-foundation.js','export async function handleStart(','\nexport async function handleIntent('));
 // Preserve esbuild's existing lexical bindings; do not rebuild the surrounding Worker.
 start=start.replace(/\bcreateStartDiagnostics\(\)/g,'__mmdDiagnostics3059.createStartDiagnostics()').replace(/\bunavailable\(/g,'unavailable2(');
 // The active overlay explicitly assigns handleStart = IdentityPatch.handleStart.
 // Patch that implementation, NOT the shadowed base function with the same name.
 assert(baseline.includes('handleStart = IdentityPatch.handleStart;'));
 const identity=baseline.indexOf('var IdentityPatch = (() => {');
 const activeStart=baseline.indexOf('  async function handleStart(request, env = {}) {',identity);
 const activeEnd=baseline.indexOf('\n  async function handleIntent(',activeStart);
 assert(identity>=0&&activeStart>identity&&activeEnd>activeStart);
 add('active-identity-start-phase-timing',baseline.slice(activeStart,activeEnd),start);
 const receiver=compile(sourcePart('liff-client-runtime-diagnostic.js','export async function handleLiffClientDiagnostic(','\nexport async function decorateLiffShellWithClientDiagnostic('));
 add('bounded-client-receiver',compiledPart(baseline,'handleLiffClientDiagnostic',true),receiver);
 const shell=read('liff-member-shell.js');
 const old='  const customerLoading = (${createCustomerProgress.toString()})({ render: (panel, state) => { renderLoadingProgress(panel, state); entryLoading.update(state); }, request: window.fetch.bind(window) });';
 const a=shell.indexOf('  const flowDiagnostic = '),b=shell.indexOf('\n  const fetch = customerLoading.fetch;',a);assert(a>=0&&b>a);
 const integration=shell.slice(a,b).replace('${createFlowDiagnosticSender.toString()}','${__mmdDiagnostics3059.createFlowDiagnosticSender.toString()}');
 add('browser-lifecycle-wiring',old,integration);
 const edits=patches.map(p=>({before:Buffer.from(p.before),after:Buffer.from(p.after),beforeHash:p.before_sha256,afterHash:p.after_sha256}));
 const candidate=applyReviewedArtifactDelta(bytes,edits,BASELINE_HASH);
 let reverse=candidate.toString();for(const p of [...patches].reverse()){assert.equal(reverse.split(p.after).length,2);reverse=reverse.replace(p.after,p.before);}assert.equal(reverse,baseline);
 const marker='var __dmCreditsImpl = (() => {';assert(baseline.includes(marker));assert.equal(candidate.toString().slice(candidate.toString().indexOf(marker)),baseline.slice(baseline.indexOf(marker)));
 const owner='var OwnerPatch = (() => {',ownerEnd='var RecoveryDO = (() => {';
 assert.equal(candidate.toString().split(owner)[1].split(ownerEnd)[0],baseline.split(owner)[1].split(ownerEnd)[0],'Owner overlay drift');
 const manifest={schema:'my_mmd_home_artifact_delta_v1',source_sha:SOURCE_SHA,worker:'member-pages-worker',baseline_version:'13d39bce-751c-4eec-882a-a354aaacbf34',baseline_deployment:'1c168fe4-3910-4304-ad68-6599a6e8804a',main_module:'worker.js',modules:[{name:'worker.js',type:'esm',before_sha256:BASELINE_HASH,after_sha256:sha(candidate),patches}]};
 return {candidate,manifest};
}
