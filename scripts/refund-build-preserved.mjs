// Local-only artifact assembly. Inputs are ETag-pinned GET snapshots; no network.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,mkdtempSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(path.resolve(process.env.REFUND_TOOLS_DIR||'../runtime-tools','package.json'));
const {build,transform,version:esbuildVersion}=require('esbuild');
assert.equal(esbuildVersion,'0.27.3');
const {decode,encode}=require('@jridgewell/sourcemap-codec');
const repo=process.cwd(),input=path.resolve(process.argv[2]||'refund-live-baselines'),output=path.resolve(process.argv[3]||'refund-bundles');
const sha=x=>createHash('sha256').update(x).digest('hex');
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const snapshot=json(path.join(input,'snapshot.json'));
const pinned={'admin-worker':'e7bef51e-c819-468b-b34d-b192fac00f50','member-dashboard-chat-worker':'e1598f73-ccad-4dc1-a441-c70004b68614'};
const receipts=[];
mkdirSync(output,{recursive:true});
function save(file,data){mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,data);}
function verify(worker){
 const record=snapshot.workers.find(w=>w.worker===worker);
 assert.equal(record?.version_id,pinned[worker]);assert.equal(record.etag_matched,true);assert.equal(record.stable,true);
 for(const m of record.modules)assert.equal(sha(readFileSync(path.join(input,worker,m.name))),m.sha256,'snapshot module hash');
 const js=record.modules.filter(m=>m.name.endsWith('.js'));assert.equal(js.length,1,'one exact main module');
 const map=record.modules.find(m=>m.name===js[0].name+'.map');assert.ok(map,'matching source map');
 return {record,name:js[0].name,code:readFileSync(path.join(input,worker,js[0].name),'utf8'),map:json(path.join(input,worker,map.name))};
}
async function exportsOf(code){
 const r=await build({stdin:{contents:code,loader:'js'},bundle:false,write:false,format:'esm',metafile:true,logLevel:'silent'});
 return Object.values(r.metafile.outputs)[0].exports.slice().sort();
}
async function checkExports(before,after,record){
 const a=await exportsOf(before),b=await exportsOf(after);assert.deepEqual(b,a,'all original exports retained, not just DO classes');
 for(const h of record.named_handlers)assert.ok(b.includes(h.name),'live RPC/interface retained: '+h.name);
 return b;
}
function remapGenerated(before,after,map){
 // Only deterministic generated helper/strict insertions differ here. Equal
 // application lines retain original mappings; new generated lines are unmapped.
 const a=before.split('\n'),b=after.split('\n'),lines=decode(map.mappings),out=[];
 let i=0,j=0;
 while(i<a.length||j<b.length){
  if(a[i]===b[j]){out.push(lines[i]||[]);i++;j++;continue;}
  let found=false;
  for(let skip=1;skip<12&&!found;skip++){
   if(a[i]===b[j+skip]){for(let n=0;n<skip;n++)out.push([]);j+=skip;found=true;}
   else if(a[i+skip]===b[j]){i+=skip;found=true;}
  }
  if(!found){out.push([]);i++;j++;}
 }
 return {...map,mappings:encode(out)};
}
function emit(worker,baseline,code,map,details){
 for(const m of baseline.record.modules){
  const data=m.name===baseline.name?code:m.name===baseline.name+'.map'?JSON.stringify(map):readFileSync(path.join(input,worker,m.name));
  save(path.join(output,worker,m.name),data);
 }
 receipts.push({worker,version_id:baseline.record.version_id,baseline_sha256:sha(baseline.code),candidate_sha256:sha(code),main_module:baseline.name,...details});
}

// Reconstruct admin's exact live source closure, including the source-only overlay.
// Git is used only to fill tree-shaken supplemental imports from the pinned source.
{
 const worker='admin-worker',baseline=verify(worker),baseSha='c1f126ba09f551f25c0661961c016a29b42eac96';
 assert.ok(baseline.record.source_sha_refs.includes(baseSha));
 const temp=realpathSync(mkdtempSync(path.join(os.tmpdir(),'refund-admin-baseline-')));
 const canonical=n=>{const marker='/release-baseline/';assert.ok(n.includes(marker),'known live source root');const p=n.slice(n.indexOf(marker)+marker.length);assert.ok(!p.startsWith('/')&&!p.split('/').includes('..'));return p;};
 const sources=new Map(baseline.map.sources.map((n,i)=>[canonical(n),baseline.map.sourcesContent[i]]));
 for(const [name,content] of sources){assert.equal(typeof content,'string');save(path.join(temp,name),content);}
 const gitFile=name=>execFileSync('git',['show',baseSha+':'+name],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 for(const name of ['package.json',...[...new Set([...sources.keys()].map(n=>n.split('/')[0]))].map(n=>n+'/package.json')]){
  try{save(path.join(temp,name),gitFile(name));}catch{/* package manifest can be absent; source imports cannot */}
 }
 const oldHelper='var __esm = (fn, res2) => function __init() {\n  return fn && (res2 = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res2;\n};';
 const liveHelper='var __esm = (fn, res2, err3) => function __init() {\n  if (err3) throw err3[0];\n  try {\n    return fn && (res2 = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res2;\n  } catch (e) {\n    throw err3 = [e], e;\n  }\n};';
 const strict='"../partners-worker/src/relax-spa-menu-stage.mjs"() {\n';
 async function compile(){
  const result=await build({absWorkingDir:path.join(temp,worker),entryPoints:['src/admin-login-hero-worker.js'],bundle:true,write:false,format:'esm',target:'esnext',keepNames:true,sourcemap:true,metafile:true,external:['cloudflare:*'],outfile:path.join(output,worker,baseline.name),logLevel:'silent',plugins:[{name:'pinned-missing-imports',setup(b){b.onResolve({filter:/^\./},args=>{
   const resolved=path.resolve(args.resolveDir,args.path);if(existsSync(resolved))return;
   assert.ok(resolved.startsWith(temp+path.sep),'supplemental import stays in baseline: '+JSON.stringify({path:args.path,importer:args.importer,dir:args.resolveDir,kind:args.kind}));
   const relative=path.relative(temp,resolved);save(resolved,gitFile(relative));return {path:resolved};
  });}}]});
  const raw=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
  assert.equal(raw.split(oldHelper).length,2);assert.equal(raw.split(strict).length,2);
  const code=raw.replace(oldHelper,liveHelper).replace(strict,strict+'    "use strict";\n');
  const map=remapGenerated(raw,code,JSON.parse(result.outputFiles.find(f=>f.path.endsWith('.map')).text));
  return {code,map,warnings:result.warnings.length};
 }
 const reproduced=await compile();assert.equal(sha(reproduced.code),sha(baseline.code),'exact live admin binary must reproduce before patch');
 for(const name of ['admin-worker/src/refund-ops.js','admin-worker/src/refund-receipt-journal.js'])save(path.join(temp,name),readFileSync(path.join(repo,name)));
 const candidate=await compile();
 const key=n=>path.relative(temp,path.resolve(path.dirname(path.join(output,worker,baseline.name)),n));
 const a=new Map(reproduced.map.sources.map((n,i)=>[key(n),reproduced.map.sourcesContent[i]]));
 const z=new Map(candidate.map.sources.map((n,i)=>[key(n),candidate.map.sourcesContent[i]]));
 const changed=[...a.keys()].filter(n=>z.has(n)&&a.get(n)!==z.get(n));const added=[...z.keys()].filter(n=>!a.has(n));
 assert.deepEqual(changed,['admin-worker/src/refund-ops.js']);assert.deepEqual(added,['admin-worker/src/refund-receipt-journal.js']);assert.ok([...a.keys()].every(n=>z.has(n)));
 const originalNames=new Map(baseline.map.sources.map(n=>[canonical(n),n]));
 candidate.map.sources=candidate.map.sources.map(n=>originalNames.get(key(n))||'../release-baseline/'+key(n));
 const exports=await checkExports(baseline.code,candidate.code,baseline.record);
 emit(worker,baseline,candidate.code,candidate.map,{exact_baseline_reproduced:true,changed_sources:changed,added_sources:added,exports,warnings:candidate.warnings});
}

// Keep LINE's deployed byte packaging/overlay intact. Compile only the reviewed
// six-line guard into its existing Refund function; remap the inserted source lines.
{
 const worker='member-dashboard-chat-worker',baseline=verify(worker);
 const index=baseline.map.sources.indexOf('src/index.js');assert.ok(index>=0);
 const original=baseline.map.sourcesContent[index],reviewed=readFileSync(path.join(repo,worker,'src/index.js'),'utf8');
 const start=reviewed.indexOf('  // A server error/timeout'),end=reviewed.indexOf('  if (!response.ok && imageEligible)',start);
 assert.ok(start>=0&&end>start);const guard=reviewed.slice(start,end);
 assert.equal(reviewed.slice(0,start)+reviewed.slice(end),original,'no other index source changes');
 assert.equal(guard.split('\n').length-1,6,'exact reviewed guard');
 const functionStart=baseline.code.indexOf('async function handleServiceBoundRefundReceipt(');
 const functionEnd=baseline.code.indexOf('\nasync function ',functionStart+1);assert.ok(functionStart>=0&&functionEnd>functionStart);
 const body=baseline.code.slice(functionStart,functionEnd),anchor='  if (!response.ok && imageEligible) {';
 assert.equal(body.split(anchor).length,2);
 const aliases=[...new Set([...body.matchAll(/return (\w+)\(\{/g)].map(m=>m[1]))];assert.equal(aliases.length,1);assert.match(aliases[0],/^json\d*$/);
 const compiled=(await transform(guard,{loader:'js',target:'esnext',legalComments:'none'})).code.replace(/\bjson\(/g,aliases[0]+'(').trimEnd().split('\n').map(l=>'  '+l).join('\n')+'\n';
 const at=functionStart+body.indexOf(anchor);assert.equal(baseline.code[at-1],'\n');
 const code=baseline.code.slice(0,at)+compiled+baseline.code.slice(at);
 assert.equal(code.slice(0,at)+code.slice(at+compiled.length),baseline.code,'no byte delta outside reviewed guard');
 const generatedLine=baseline.code.slice(0,at).split('\n').length-1,sourceLine=original.slice(0,start).split('\n').length-1;
 const lines=decode(baseline.map.mappings);
 for(const line of lines)for(const segment of line)if(segment.length>=4&&segment[1]===index&&segment[2]>=sourceLine)segment[2]+=6;
 lines.splice(generatedLine,0,...Array.from({length:compiled.split('\n').length-1},()=>[]));
 const map={...baseline.map,sourcesContent:baseline.map.sourcesContent.slice(),mappings:encode(lines)};map.sourcesContent[index]=reviewed;
 const exports=await checkExports(baseline.code,code,baseline.record);
 emit(worker,baseline,code,map,{compiled_outside_guard_byte_equal:true,changed_sources:[worker+'/src/index.js'],added_sources:[],exports,source_guard_lines:6,generated_guard_lines:compiled.split('\n').length-1});
}
save(path.join(output,'preserved-manifest.json'),JSON.stringify({source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseline_snapshot:snapshot.at,workers:receipts,config_binding_route_secret_migration_delta:[],release_approved:false},null,2)+'\n');
for(const r of receipts)console.log(JSON.stringify({worker:r.worker,version:r.version_id,sha256:r.candidate_sha256,exports:r.exports.length,changed:r.changed_sources,added:r.added_sources}));
