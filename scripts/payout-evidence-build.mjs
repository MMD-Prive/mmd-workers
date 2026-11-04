// Offline reconstruction from the pinned release source; never calls Wrangler/API.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync,mkdtempSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve(process.env.PAYOUT_TOOLS_DIR || '../runtime-tools','package.json'));
const {build,version:esbuildVersion}=require('esbuild');
const {decode,encode}=require('@jridgewell/sourcemap-codec');
import assert from 'node:assert/strict';
assert.equal(esbuildVersion,'0.28.1','pinned compiler required');
const repo=process.cwd(),baseSha='0c8c06a7d1330a6fd1933d49d160a20a8e918439',root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'payout-admin-parity-'))),temp=path.join(root,'home/runner/work/mmd-workers/mmd-workers'),projectRoot=path.join(root,'tmp/mmd-current-session-code-only-build');mkdirSync(projectRoot,{recursive:true});
const baseRepo=path.resolve(process.env.PAYOUT_BASELINE_SOURCE_DIR || repo);
const output=path.resolve(process.env.PAYOUT_BUNDLE_DIR || 'payout-evidence-candidate');mkdirSync(output,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
const save=(name,body)=>{const file=path.join(temp,name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,body);};
const gitFile=name=>execFileSync('git',['show',baseSha+':'+name],{cwd:baseRepo,encoding:'utf8',stdio:['ignore','pipe','pipe']});
for(const f of ['package.json','admin-worker/package.json','shared/package.json','webflow/package.json','partners-worker/package.json']){try{save(f,gitFile(f));}catch{}}
const baselineInput=path.resolve(process.env.PAYOUT_BASELINE_DIR||'payout-evidence-baseline');
const snapshot=JSON.parse(readFileSync(path.join(baselineInput,'snapshot.json'),'utf8'));
const live=readFileSync(path.join(baselineInput,'admin-worker/worker.js'),'utf8');
assert.equal(sha(live),'78788eb6898dca9856341b2db276c3f51c957044c5ee0152402d876fe008ec9a');
const liveMap=JSON.parse(readFileSync(path.join(baselineInput,'admin-worker/admin-login-hero-worker.js.map'),'utf8'));
assert.equal(sha(readFileSync(path.join(baselineInput,'admin-worker/admin-login-hero-worker.js.map'))),'b880e59336a6d637a85bee6dc8225ed235489c0e654811ce2de948e894314b9c');
assert.equal(liveMap.sources.length,289);
for(let i=0;i<liveMap.sources.length;i++){const name=liveMap.sources[i];assert.ok(!path.isAbsolute(name)&&!name.split('/').includes('..'));assert.equal(typeof liveMap.sourcesContent[i],'string');save(name,liveMap.sourcesContent[i]);}

async function compile(){
 const result=await build({absWorkingDir:projectRoot,entryPoints:[path.join(temp,'admin-worker/src/admin-login-hero-worker.js')],outfile:path.join(output,'admin-login-hero-worker.js'),bundle:true,write:false,format:'esm',target:'es2024',supported:{'import-source':true},keepNames:true,sourcemap:true,metafile:true,external:['cloudflare:*','__STATIC_CONTENT_MANIFEST'],conditions:['workerd','worker','browser'],platform:'browser',define:{'navigator.userAgent':'"Cloudflare-Workers"','process.env.NODE_ENV':'"production"','global.process.env.NODE_ENV':'"production"','globalThis.process.env.NODE_ENV':'"production"'},loader:{'.js':'jsx','.mjs':'jsx','.cjs':'jsx'},logLevel:'silent',plugins:[{name:'exact-source-closure',setup(b){b.onResolve({filter:/^\./},args=>{const resolved=path.resolve(args.resolveDir,args.path);assert.ok(resolved.startsWith(temp+path.sep),'scope escape');if(!existsSync(resolved))save(path.relative(temp,resolved),gitFile(path.relative(temp,resolved)));return {path:resolved};});}}]});
 let code=result.outputFiles.find(x=>x.path.endsWith('.js')).text;
 const map=JSON.parse(result.outputFiles.find(x=>x.path.endsWith('.map')).text);
 const strict='/partners-worker/src/relax-spa-menu-stage.mjs\"() {\n';
 assert.equal(code.split(strict).length,2,'exact existing CJS strict marker');
 const line=code.slice(0,code.indexOf(strict)+strict.length).split('\n').length-1;
 code=code.replace(strict,strict+'    \"use strict\";\n');const mappings=decode(map.mappings);mappings.splice(line,0,[]);map.mappings=encode(mappings);
 for(const ext of ['css','js']){const url=`https://models.mmdbkk.com/webflow/internal/admin/kenji/kenji-admin-v1.${ext}`;assert.equal(code.split(url).length,2);code=code.replace(url,url+'?v='+baseSha);}
 return {code,map,meta:result.metafile,warnings:result.warnings.length};
}
const {parse}=require('acorn');
const exported=code=>parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='ExportNamedDeclaration').flatMap(n=>n.specifiers.map(x=>x.exported.name)).sort();
function find(code,name){const nodes=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.equal(nodes.length,1,name);return nodes[0];}
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'unique overlay anchor');return s.replace(a,b);};
const baseline=await compile();
const prefixAt=live.indexOf(baseline.code.slice(0,150));assert.ok(prefixAt>0);const prefix=live.slice(0,prefixAt);
assert.equal(sha(prefix),'6806eda287a9b1f451d6fbfb32ca2fd4a8a7dd3dcc8c4164aa2931740836e034');
function overlay(code,map){const edits=[];
 for(const name of ['buildKenjiLv5LiveFanInProjection','resolveKenjiLv5LiveContext']){
  const node=find(code,name),old=code.slice(node.start,node.end);let next=old;
  if(name==='buildKenjiLv5LiveFanInProjection'){
   next=once(next,'  client360 = {},','  client360 = {},\n  bookingConfirmations = {},');
   next=once(next,'    client_360_live: client360.data || null,','    client_360_live: client360.data || null,\n    original_booking_confirmations: __mmdBookingEvidence3041.bookingEvidenceAdvisory(resolved ? bookingConfirmations : {}),');
  }else{
   next=once(next,'const [client360, entitlement, calendarResult, credit, hype]','const [client360, bookingConfirmations, entitlement, calendarResult, credit, hype]');
   next=once(next,'    readClient360(env, client.canonical_client_id),','    readClient360(env, client.canonical_client_id),\n    __mmdBookingEvidence3041.readOriginalBookingEvidence(env, client.canonical_client_id),');
   next=once(next,'    client360,','    client360,\n    bookingConfirmations,');
  }edits.push({start:node.start,end:node.end,old,next});
 }
 let modified=code;const rows=decode(map.mappings);
 for(const e of edits.slice().sort((a,b)=>b.start-a.start)){
  modified=modified.slice(0,e.start)+e.next+modified.slice(e.end);
  const at=code.slice(0,e.start).split('\n').length-1,a=e.old.split('\n'),oldRows=rows.slice(at,at+a.length),newRows=[];let i=0;
  for(const line of e.next.split('\n')){const k=a.indexOf(line,i);if(k>=0){newRows.push(oldRows[k]||[]);i=k+1;}else newRows.push([]);}rows.splice(at,a.length,...newRows);
 }
 rows.unshift(...Array.from({length:prefix.split('\n').length-1},()=>[]));
 const key=n=>path.relative(temp,path.resolve(output,n));
 return {code:prefix+modified,map:{...map,file:'worker.js',sourceRoot:'',sources:map.sources.map(key),mappings:encode(rows),x_preserved_booking_overlay:{source_pr:3041,prefix_sha256:sha(prefix),new_overlay_lines_unmapped:true}}};
}
assert.equal(overlay(baseline.code,baseline.map).code,live,'reconstruct full current live bytes before changing source');
const approved={
 'admin-worker/src/model-payout-adjustments.js':'229f64e4bf43a79c17d83a80f629b0629312899835a14109971aca0f9cd5c0f8',
 'admin-worker/src/job-orchestrator-owner-ops-runtime.js':'67e980579709d1a7034dd73ccfd8813c5ddb6e1ece7417ca790237a3d2e54513',
 'admin-worker/src/model-payout-operation.js':'1bac2f64ab30e4e5da17a5873dc58b6112cd5c473ff9a0c1aea8cb99567bba9f',
};
for(const [name,digest] of Object.entries(approved)){const data=readFileSync(path.join(repo,name));assert.equal(sha(data),digest);save(name,data);}
const candidate=await compile(),admin=overlay(candidate.code,candidate.map);
assert.equal(sha(admin.code),'013dc65042c60358590a094b7ad70ae685ebeb9cdd97351f09a5c599f7aab445');
assert.equal(sha(JSON.stringify(admin.map)),'9b8c70c7871b7b159966c1f9c2828a7d7a8397a04ff1f3635b6a99f06df5f6fa');
assert.deepEqual(admin.map.sources.slice().sort(),liveMap.sources.slice().sort());
const changed=admin.map.sources.filter((s,i)=>admin.map.sourcesContent[i]!==liveMap.sourcesContent[liveMap.sources.indexOf(s)]);
assert.deepEqual(changed.slice().sort(),Object.keys(approved).filter(s=>!s.endsWith('model-payout-operation.js')).sort());
assert.deepEqual(exported(admin.code),exported(live));assert.equal(exported(admin.code).length,27);
const adminDir=path.join(output,'admin-worker');mkdirSync(adminDir,{recursive:true});writeFileSync(path.join(adminDir,'worker.js'),admin.code);writeFileSync(path.join(adminDir,'admin-login-hero-worker.js.map'),JSON.stringify(admin.map));

const mapped=[];
const adminRows=decode(admin.map.mappings),adminAst=parse(admin.code,{ecmaVersion:'latest',sourceType:'module',locations:true});
for(const [name,source] of Object.entries({handleModelPayoutAdjustments:'admin-worker/src/model-payout-adjustments.js',adjustmentEvidenceGuard:'admin-worker/src/model-payout-adjustments.js',withPayoutOperation:'admin-worker/src/model-payout-operation.js',applyOwnerJobAction:'admin-worker/src/job-orchestrator-owner-ops-runtime.js',applyClaimedOwnerJobAction:'admin-worker/src/job-orchestrator-owner-ops-runtime.js'})){
 const n=adminAst.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(n);
 assert.ok(adminRows.slice(n.loc.start.line-1,n.loc.end.line).flat().some(x=>x.length>=4&&admin.map.sources[x[1]]===source),name+' map');mapped.push({name,source});
}

// Preserve the complete payments binary; no original sourcemap is available.
const paymentBase=readFileSync(path.join(baselineInput,'payments-worker/worker.js'),'utf8');
assert.equal(sha(paymentBase),'eec3f26d0bff7e0bb2b06ebfc03420aef14579a238bad21b5e6bd33287eadb83');
const pn=find(paymentBase,'createSessionIfMissing'),ph=find(paymentBase,'handleConfirmLink');
const oldWriter=paymentBase.slice(pn.start,pn.end);assert.equal(oldWriter.split('pay_model_thb: payload.pay_model_thb,').length,3);
let writer=oldWriter.replace('      pay_model_thb: payload.pay_model_thb,\n','');
writer=once(writer,'return { ok: true, mode: "update", record_id: existing.id };','return { ok: true, mode: "update", record_id: existing.id, pay_model_thb: existing.fields?.pay_model_thb ?? null, payout_preserved: true };');
writer=once(writer,'return { ok: true, mode: "create", record_id: created?.id || null };','return { ok: true, mode: "create", record_id: created?.id || null, pay_model_thb: payload.pay_model_thb ?? null };');
const oldHandler=paymentBase.slice(ph.start,ph.end),handler=once(oldHandler,'pay_model_thb != null ? `Pay Model: <b>${Number(pay_model_thb)} THB</b>` : ""','session_write.pay_model_thb != null ? `Pay Model: <b>${Number(session_write.pay_model_thb)} THB</b>` : ""');
const edits=[{start:pn.start,end:pn.end,old:oldWriter,next:writer},{start:ph.start,end:ph.end,old:oldHandler,next:handler}];
let payments=paymentBase;for(const e of edits.slice().sort((a,b)=>b.start-a.start))payments=payments.slice(0,e.start)+e.next+payments.slice(e.end);
let reverse=payments;for(const e of edits)reverse=once(reverse,e.next,e.old);assert.equal(reverse,paymentBase);
assert.equal(sha(payments),'a9f666cdbc8f51c99e7762b2a1394116009493e5aed1cfd46b0377e70dfd70fb');
assert.deepEqual(exported(payments),exported(paymentBase));assert.equal(exported(payments).length,5);
const normal=n=>Array.isArray(n)?n.map(normal):n&&typeof n==='object'?Object.fromEntries(Object.entries(n).filter(([k])=>!['start','end','raw'].includes(k)).map(([k,v])=>[k,normal(v)])):n;
assert.deepEqual(normal(find(payments,'createSessionIfMissing')),normal(find(readFileSync('payments-worker/index.js','utf8'),'createSessionIfMissing')));
const paymentDir=path.join(output,'payments-worker');mkdirSync(paymentDir,{recursive:true});writeFileSync(path.join(paymentDir,'worker.js'),payments);
for(const row of snapshot.workers){const code=row.worker==='admin-worker'?admin.code:payments;for(const h of row.named_handlers)assert.ok(exported(code).includes(h.name),'registered named/RPC export preserved');}
const manifest={status:'CI_REVIEW_ARTIFACT_RELEASE_HOLD',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseline:snapshot,
 admin:{sha256:sha(admin.code),map_sha256:sha(JSON.stringify(admin.map)),baseline_exact_reproduced:true,changed_sources:changed,overlay_prefix_sha256:sha(prefix),exports:exported(admin.code),journal_unchanged:true,verified_function_mappings:mapped,map_provenance:'exact live source closure reproduced; reviewed source delta compiled; existing overlay insertions explicitly unmapped'},
 payments:{sha256:sha(payments),baseline_sha256:sha(paymentBase),exports:exported(payments),outside_delta_byte_equal:true,reverse_exact_live:true,writer_ast_equals_reviewed_source:true,map_available:false,map_provenance:'UNAVAILABLE from pinned live content; no original mappings invented',legacy_path:'normal POST /v1/confirm/link intercepted by canonical handler; legacy-only delta'},
 production_config_delta:[],production_writes:0,release_hold_reasons:['payments original sourcemap/source reconstruction provenance unavailable','payments patch affects legacy writer, not demonstrated canonical route fix','merge/deploy not authorized']};
writeFileSync(path.join(paymentDir,'map-status.json'),JSON.stringify(manifest.payments,null,2));writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(path.join(output,'SHA256SUMS'),['admin-worker/worker.js','admin-worker/admin-login-hero-worker.js.map','payments-worker/worker.js','payments-worker/map-status.json','manifest.json'].map(n=>sha(readFileSync(path.join(output,n)))+'  '+n).join('\n')+'\n');
console.log(JSON.stringify({status:manifest.status,admin:manifest.admin.sha256,admin_map:manifest.admin.map_sha256,payments:manifest.payments.sha256,release_hold_reasons:manifest.release_hold_reasons}));
