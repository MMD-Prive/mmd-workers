// Offline artifact assembly only. Never uploads or changes release pins/config.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createStartDiagnostics} from '../member-pages-worker/src/liff-start-diagnostics.js';
export const digest = value => createHash('sha256').update(value).digest('hex');
export function assemble(directory) {
 const manifest=JSON.parse(fs.readFileSync(new URL('./liff-profile-503-delta-manifest.json',import.meta.url)));
 const main=manifest.modules.find(x=>x.name==='model-console-live-entrypoint.js');
 const branding=fs.readFileSync(directory+'/app-branding-module.mjs');
 assert.equal(digest(branding),'76c2130c17a40f459b3697262f4a2cc86de0c3ecf2cee631e22a17128533ad60');
 let code=fs.readFileSync(directory+'/entry.mjs','utf8');
 assert.equal(digest(code),main.before_sha256);
 for(const p of main.patches){assert.equal(code.split(p.before).length,2);code=code.replace(p.before,()=>p.after);}
 assert.equal(digest(code),'39572dcb63c525f087f23e4eeff83555ac5f37d32c42519afa350310d9270815');
 const baseline=code, changes=[];
 const replace=(before,after,count)=>{
  assert.equal(code.split(before).length-1,count,'anchor count: '+before.slice(0,70));
  changes.push({before,after,count});code=code.split(before).join(after);
 };
 replace('  let memberApiChain = Promise.resolve();','  const referenceFetch = (${createReferenceFetch.toString()})(window.fetch.bind(window));\n  let memberApiChain = Promise.resolve();',2);
 replace('await fetch(url, { ...init, signal: controller.signal })','await referenceFetch(url, { ...init, signal: controller.signal })',2);
 replace('try { await readProfile({ silent: true }); }','try { await readProfile({ silent: true, diagnosticRetry: true }); }',2);
 replace('async function readProfile({ hydrate = true, silent = false } = {})','async function readProfile({ hydrate = true, silent = false, diagnosticRetry = false } = {})',2);
 replace('memberApiFetch(CONFIG.profileEndpoint, { method: "GET", credentials: "same-origin", headers:', 'memberApiFetch(CONFIG.profileEndpoint, { method: "GET", credentials: "same-origin", diagnosticRetry, headers:',2);
 const start=code.indexOf('function createStartDiagnostics('),end=code.indexOf('\n__name(createStartDiagnostics,',start);
 assert(start>0&&end>start);
 replace(code.slice(start,end),createStartDiagnostics.toString(),1);
 replace('async function handleStart2(request, env = {}) {\n  const diagnostic = createStartDiagnostics();','async function handleStart2(request, env = {}, ctx) {\n  const diagnostic = createStartDiagnostics({kv:env.LIFF_IDENTITY_KV,ctx,requestRef:env[SERVER_REFERENCE]});',1);
 replace('await handleStart2(request, env);','await handleStart2(request, env, ctx);',1);
 const before='return decorateAppBranding(request, await applyConsolePresentation(request, await runtime_index_default2.fetch(request, env, ctx)), BRANDING_ASSETS);';
 replace(before,'return withReferenceWorker(request, env, ctx, async scopedEnv => decorateAppBranding(request, await applyConsolePresentation(request, await runtime_index_default2.fetch(request, scopedEnv, ctx)), BRANDING_ASSETS));',1);
 const helper=fs.readFileSync(new URL('../member-pages-worker/src/liff-request-reference.js',import.meta.url),'utf8').replace(/^export /gm,'');
 code+='\n'+helper;
 let reverse=code.slice(0,-('\n'+helper).length);
 for(const p of changes.toReversed())reverse=reverse.split(p.after).join(p.before);
 assert.equal(reverse,baseline,'All untouched bytes including Owner Overlay must be preserved');
 return {code,branding,receipt:{local_only:true,baseline_sha256:digest(baseline),candidate_sha256:digest(code),branding_sha256:digest(branding),patch_groups:changes.length,reverse_exact:true,config_changed:false}};
}
