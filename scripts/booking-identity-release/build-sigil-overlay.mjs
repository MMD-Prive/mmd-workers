import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {parse,version}=require(require.resolve('acorn',{paths:[process.env.BUILD_TOOLS_DIR || '/tmp/booking-build-tools']}));
assert.equal(version,'8.15.0','reviewed parser version');
export const BASE_HASH='f8fdd9ec081d5cb30ab1293addf9209f19f3d868940b65a1b356687d0a0f5d29';
export const REVIEWED_SHA='7fd8dae0d97a42d0594650a8b663df99fe584467';
export const REVIEWED_TREE='0806c133499c3600d554bd175e5c4533163acd08';
export const sha=value=>createHash('sha256').update(value).digest('hex');
const sourcePins={
 'sigil-booking-worker/src/current-private-access.js':'a7d28f2a7c46cba983b9a980a31689d3a9164a366e90fe2d62ea12c2b27c0a40',
 'sigil-booking-worker/src/customer-discovery-policy.js':'dcb082bde558bb150db3e0d04e3a6375973c347a8ea2d03cc214a11bc0022dda',
 'sigil-booking-worker/src/entitlement-runtime-worker.js':'60bdeab7b2c74af43724ad6a355342ace4ea632ade02a4c48d9430875c6b8924',
};
const targets=[
 ['resolveDiscoveryViewer','global','c9cb939daae4cad2bf5bfbd96d6e9a1b51135cdf6a13ba041c3fb228eca79347'],
 ['currentPrivateAccess','global','c8ae7f2ded37845f8ae6612cadaffe620a247b1aecd31095c92085f8128c5591'],
 ['handleTrustedBookingConfirm','global','6d396075e2e88afaba353367c33c857150f41bd4afe0c9e2e90dd69b7092df84'],
 ['resolveDiscoveryViewer','overlay','4e1fb37db6f08f97f780e16d54b899b4b002676f1ba23c07a899be580351b850'],
 ['resolveBookingViewer','overlay','77a6e9c853c8c2c76d883798f00dd08350489938f9bd0dd1f7e5a69edef39dc4'],
 ['currentPrivateAccess','overlay','dc0dddc347d4cd924f84444b41f000782430e7ed7a3b2d0b780ccfba542e049a'],
 ['handleTrustedBookingConfirm','overlay','6b9f935fe592ae6bf397a2957d17d0b27621356cc138d9a2deadeae0a244ff64'],
];
export const ast=source=>parse(source,{ecmaVersion:'latest',sourceType:'module'});
export function walk(node,visit,ancestors=[]){
 if(!node||typeof node!=='object')return;
 visit(node,ancestors);
 for(const [key,value] of Object.entries(node)){
  if(key==='start'||key==='end')continue;
  if(Array.isArray(value))value.forEach(child=>walk(child,visit,[...ancestors,node]));
  else if(value&&typeof value==='object')walk(value,visit,[...ancestors,node]);
 }
}
export function functionSpans(source,name){
 const found=[];
 walk(ast(source),(node,ancestors)=>{
  if(node.type==='FunctionDeclaration'&&(!name||node.id?.name===name))found.push({...node,scope:ancestors.some(x=>x.type==='FunctionExpression'||x.type==='ArrowFunctionExpression'||x.type==='FunctionDeclaration')?'overlay':'global'});
 });
 return found;
}
function extract(source,name){const nodes=functionSpans(source,name);assert.equal(nodes.length,1,'unique reviewed source function '+name);return source.slice(nodes[0].start,nodes[0].end);}
function rename(source,map){
 const spans=new Map();
 walk(ast(source),node=>{if(node.type==='Identifier'&&Object.hasOwn(map,node.name))spans.set(node.start,{start:node.start,end:node.end,text:map[node.name]});});
 for(const span of [...spans.values()].sort((a,b)=>b.start-a.start))source=source.slice(0,span.start)+span.text+source.slice(span.end);
 ast(source);return source;
}
function exportsText(source){return ast(source).body.filter(n=>n.type.startsWith('Export')).map(n=>source.slice(n.start,n.end));}
function routerText(source){return ast(source).body.filter(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>['runtime_index_default','model_image_policy_worker_default'].includes(d.id?.name))).map(n=>source.slice(n.start,n.end));}
export function reverseEdits(candidate,edits){
 let source=Buffer.isBuffer(candidate)?candidate.toString('utf8'):candidate;
 for(const edit of [...edits].reverse()){
  assert.equal(source.slice(edit.candidate_start,edit.candidate_end),edit.after,'inverse span drift '+edit.label);
  source=source.slice(0,edit.candidate_start)+edit.before+source.slice(edit.candidate_end);
 }
 return Buffer.from(source);
}
export function buildSigilOverlay(baseline,{sourceRoot=process.cwd()}={}){
 assert.equal(sha(baseline),BASE_HASH,'live SIGIL baseline drift');
 assert.equal(baseline.length,240216,'live baseline byte count');
 const root=resolve(sourceRoot);
 assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),REVIEWED_SHA,'reviewed source commit drift');
 assert.equal(execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),REVIEWED_TREE,'reviewed source tree drift');
 const sources={};
 for(const [path,hash] of Object.entries(sourcePins)){const bytes=fs.readFileSync(resolve(root,path));assert.equal(sha(bytes),hash,'reviewed source drift '+path);sources[path]=bytes.toString('utf8');}
 const source=baseline.toString('utf8');assert.ok(Buffer.from(source).equals(baseline),'baseline is exact UTF-8');
 const names=new Set(targets.map(t=>t[0]));
 const functions=functionSpans(source).filter(n=>names.has(n.id.name));
 assert.equal(functions.length,targets.length,'all target copies enumerated');
 walk(ast(source),node=>{
  if(node.type==='AssignmentExpression'&&node.left.type==='Identifier')assert.ok(!names.has(node.left.name),'target function rebound');
  if(node.type==='VariableDeclarator'&&node.id.type==='Identifier')assert.ok(!names.has(node.id.name),'target function shadowed');
 });
 let displacement=0;
 const edits=targets.map(([name,scope,pin],index)=>{
  const node=functions[index];assert.equal(node.id.name,name);assert.equal(node.scope,scope);
  const before=source.slice(node.start,node.end);assert.equal(sha(before),pin,'pinned baseline function drift '+scope+':'+name);
  let after,reviewedPath;
  if(name==='handleTrustedBookingConfirm'&&scope==='global'){
   // The old global function has no signed-owner helpers. Route it into the
   // existing live isolated worker, whose confirmation body is patched below.
   // This does not change HTTP routing or introduce a new worker entrypoint.
   after='async function handleTrustedBookingConfirm(request, env) {\n  return __mmdBookingRelease20261103.entitlementWorker.fetch(request, env);\n}';
   reviewedPath='delegate-to-existing-isolated-entitlement-worker';
  } else {
   reviewedPath=name==='currentPrivateAccess'?'sigil-booking-worker/src/current-private-access.js':name==='handleTrustedBookingConfirm'?'sigil-booking-worker/src/entitlement-runtime-worker.js':'sigil-booking-worker/src/customer-discovery-policy.js';
   after=extract(sources[reviewedPath],name);
   if(name==='currentPrivateAccess'&&scope==='overlay')after=rename(after,{memberRecordId:'memberRecordId2',clean:'clean2',resolveMemberEntitlements:'bridge_resolveMemberEntitlements',allowedCustomerModelFolders:'bridge_allowedCustomerModelFolders'});
   if(name==='handleTrustedBookingConfirm')after=rename(after,{clean:'clean3'});
  }
  ast(after);
  const edit={label:scope+':'+name,name,scope,start:node.start,end:node.end,candidate_start:node.start+displacement,candidate_end:node.start+displacement+after.length,before,after,reviewed_path:reviewedPath};
  displacement+=after.length-before.length;return edit;
 });
 let next=source;
 for(const edit of [...edits].reverse())next=next.slice(0,edit.start)+edit.after+next.slice(edit.end);
 const candidate=Buffer.from(next);ast(next);
 assert.ok(reverseEdits(candidate,edits).equals(baseline),'inverse exact-byte restoration failed');
 assert.deepEqual(exportsText(next),exportsText(source),'worker exports changed');
 assert.deepEqual(routerText(next),routerText(source),'live runtime router changed');
 const nextFunctions=functionSpans(next).filter(n=>names.has(n.id.name));assert.equal(nextFunctions.length,targets.length);
 for(const node of nextFunctions){const text=next.slice(node.start,node.end);
  if(node.id.name==='currentPrivateAccess'){assert.match(text,/member\.length !== 1/);assert.doesNotMatch(text,/member\.includes\(/);}
  if(node.id.name==='resolveDiscoveryViewer'){assert.match(text,/\?context=identity/);assert.match(text,/identity_binding_verified !== true/);}
  if(node.id.name==='resolveBookingViewer')assert.match(text,/identity_binding_verified !== true/);
 }
 const proof={schema:'mmd_booking_identity_sigil_overlay_v1',baseline_sha256:BASE_HASH,baseline_bytes:baseline.length,candidate_sha256:sha(candidate),candidate_bytes:candidate.length,reviewed_sha:REVIEWED_SHA,reviewed_tree:REVIEWED_TREE,source_sha:REVIEWED_SHA,source_tree:REVIEWED_TREE,method:'seven-pinned-ast-function-spans-no-rebundle',parser:'acorn@'+version,unrelated_bytes_preserved:true,runtime_routes_preserved:true,exports_unchanged:true,preservation:'inverse-exact-byte-reconstruction',settings_changes:[],migrations:[],source_hashes:sourcePins,edits:edits.map(({before,after,...e})=>({...e,before_sha256:sha(before),after_sha256:sha(after),before_bytes:Buffer.byteLength(before),after_bytes:Buffer.byteLength(after)}))};
 return {candidate,proof,edits};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=Object.fromEntries(process.argv.slice(2).reduce((out,v,i,all)=>{if(v.startsWith('--'))out.push([v.slice(2),all[i+1]]);return out;},[]));
 assert.ok(args.baseline&&args['output-dir'],'--baseline and --output-dir required');
 const output=resolve(args['output-dir']);fs.mkdirSync(output,{recursive:true});
 const {candidate,proof,edits}=buildSigilOverlay(fs.readFileSync(args.baseline),{sourceRoot:args['source-root']||process.cwd()});
 fs.writeFileSync(resolve(output,'sigil-candidate.mjs'),candidate);
 fs.writeFileSync(resolve(output,'sigil-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');
 fs.writeFileSync(resolve(output,'sigil-overlay-edits.json'),JSON.stringify(edits,null,2)+'\n');
 console.log(JSON.stringify(proof,null,2));
}
