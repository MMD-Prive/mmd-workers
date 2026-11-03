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
const output=path.resolve(process.env.PAYOUT_BUNDLE_DIR || 'payout-preserved-bundles');mkdirSync(output,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
const save=(name,body)=>{const file=path.join(temp,name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,body);};
const gitFile=name=>execFileSync('git',['show',baseSha+':'+name],{cwd:baseRepo,encoding:'utf8',stdio:['ignore','pipe','pipe']});
for(const f of ['package.json','admin-worker/package.json','shared/package.json','webflow/package.json','partners-worker/package.json']){try{save(f,gitFile(f));}catch{}}
save('admin-worker/src/admin-login-hero-worker.js',gitFile('admin-worker/src/admin-login-hero-worker.js'));
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
const baselineInput=path.resolve(process.env.PAYOUT_BASELINE_DIR || 'payout-admin-baseline');
const snapshot=JSON.parse(readFileSync(path.join(baselineInput,'snapshot.json'),'utf8'));
assert.equal(snapshot.version_id,'801082ba-69db-4713-93cc-ffd7290987f3');
assert.equal(snapshot.etag,'d05fa1ee10f98080e79fb95a627aeffc73ed3f0a87e3e3527b4407a19b6ef1c0');
assert.equal(snapshot.etag_matched,true);assert.equal(snapshot.stable,true);
const downloaded=readFileSync(path.join(baselineInput,'admin-worker','worker.js'));
assert.equal(sha(downloaded),'32e7363a82297db746dc620ae0c2bf6b19164a5f78a5aa72320c25bdcec68926');
const baseline=await compile();writeFileSync(path.join(output,'baseline-reconstructed.js'),baseline.code);writeFileSync(path.join(output,'baseline-reconstructed.js.map'),JSON.stringify(baseline.map));
const baselineHash=sha(baseline.code);console.log(JSON.stringify({phase:'baseline',esbuildVersion,hash:baselineHash,bytes:Buffer.byteLength(baseline.code),warnings:baseline.warnings,sources:baseline.map.sources.length}));
assert.equal(baselineHash,'32e7363a82297db746dc620ae0c2bf6b19164a5f78a5aa72320c25bdcec68926','must reproduce pinned release artifact before any candidate assembly');
assert.ok(downloaded.equals(Buffer.from(baseline.code)),'exact downloaded live bytes reproduced');
const approvedSourceHashes={'admin-worker/src/model-payout-adjustments.js':'f9a06199712dc0844353bc45d5b4ff3f927ac415de82957c1c38b82246a36fb0','admin-worker/src/model-payout-operation.js':'1bac2f64ab30e4e5da17a5873dc58b6112cd5c473ff9a0c1aea8cb99567bba9f'};
for(const [name,digest] of Object.entries(approvedSourceHashes)){const data=readFileSync(path.join(repo,name));assert.equal(sha(data),digest,'reviewed payout source changed');save(name,data);}
const candidate=await compile();writeFileSync(path.join(output,'admin-login-hero-worker.js'),candidate.code);writeFileSync(path.join(output,'admin-login-hero-worker.js.map'),JSON.stringify(candidate.map));
const sourceKey=n=>path.relative(temp,path.resolve(output,n));const sourceMap=r=>new Map(r.map.sources.map((n,i)=>[sourceKey(n),r.map.sourcesContent[i]]));const a=sourceMap(baseline),b=sourceMap(candidate);
const changed=[...a.keys()].filter(n=>b.has(n)&&a.get(n)!==b.get(n)),added=[...b.keys()].filter(n=>!a.has(n)),removed=[...a.keys()].filter(n=>!b.has(n));
assert.deepEqual(changed,['admin-worker/src/model-payout-adjustments.js']);assert.deepEqual(added,['admin-worker/src/model-payout-operation.js']);assert.deepEqual(removed,[]);
const normalizedMap={...candidate.map,file:'worker.js',sourceRoot:'',sources:candidate.map.sources.map(sourceKey)};
writeFileSync(path.join(output,'worker.js'),candidate.code);writeFileSync(path.join(output,'admin-login-hero-worker.js.map'),JSON.stringify(normalizedMap));
assert.equal(sha(candidate.code),'821da67aab1f74f88a899bafced426cd22d0c376e50c041b3ca4fc93e0ac2b69','reviewed candidate JS hash');
assert.equal(sha(JSON.stringify(normalizedMap)),'a7a9d01e5ed3fe6a4767f22bc7919d6e015afd56265b26092481b2b1fe01b1c4','reviewed candidate map hash');
const exportsOf=r=>Object.values(r.meta.outputs).find(x=>x.entryPoint)?.exports.slice().sort();assert.deepEqual(exportsOf(candidate),exportsOf(baseline));
for(const h of snapshot.named_handlers)assert.ok(exportsOf(candidate).includes(h.name),'live named/RPC handler retained');
const receipt={base_source:baseSha,reviewed_source:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),baseline_exact_reproduced:true,baseline_sha256:baselineHash,candidate_sha256:sha(candidate.code),candidate_map_sha256:sha(JSON.stringify(normalizedMap)),main_module:'worker.js',sourcemap_module:'admin-login-hero-worker.js.map',map_provenance:'reconstructed from exact-byte-reproduced pinned release source; not an original served map',changed,added,removed,exports:exportsOf(candidate),warnings:{baseline:baseline.warnings,candidate:candidate.warnings},source_counts:{baseline:a.size,candidate:b.size},production_config_delta:[],approved_source_hashes:approvedSourceHashes,toolchain:{esbuild:esbuildVersion,sourcemap_codec:'1.6.0'},baseline_version:snapshot.version_id,baseline_etag:snapshot.etag,live_named_handlers:snapshot.named_handlers,release_approved:false};writeFileSync(path.join(output,'manifest.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
