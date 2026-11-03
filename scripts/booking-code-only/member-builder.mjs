import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {parse}=require(require.resolve('acorn',{paths:process.env.BUILD_TOOLS_DIR?[process.env.BUILD_TOOLS_DIR]:undefined}));
export const BASE_HASH='1f0946a8af1891def0e4030568b5b0070790b5eb2471f413c496bb190871e310';
export const sha=b=>createHash('sha256').update(b).digest('hex');
const scriptDir=dirname(fileURLToPath(import.meta.url));
const cli=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(v.startsWith('--'))a.push([v.slice(2),all[i+1]]);return a;},[]));
const root=resolve(cli['source-root']||process.env.MEMBER_SOURCE_ROOT||'.');
const out=resolve(cli['output-dir']||scriptDir);
const baselinePath=resolve(cli.baseline||out+'/member-baseline.js');
const esbuild=cli.esbuild||process.env.ESBUILD_BIN||'esbuild';
const namespace='__publicBookingIdentityPatch';
const sourcePins={'booking-customer-identity.js':'83f5e88f3826f0871cfe55b1fda954f23146d94f91cc638db837eb9a10c6bd01','booking-discovery-viewer.js':'31711628010c055b6369ed7d4da95a9cd091378c12ad958ab6700e9776965f23','member-app-api-runtime.js':'515c87c9ddcea47254192e88df13b5bfdcea03147f7ee2a3264d8c10cf6f9564'};
function verifySources(){for(const [p,h]of Object.entries(sourcePins))assert.equal(sha(fs.readFileSync(root+'/member-pages-worker/src/'+p)),h,'reviewed source drift '+p);}
const mappings={handleDiscoveryViewer:{cookieValue:'cookieValue3'},attachDiscoverySession:{},loadMemberAppSessionState:{cookieValue:'cookieValue2',SESSION_COOKIE:'SESSION_COOKIE3',hmacHex:'hmacHex2'},readMemberAppSession:{asObject:'asObject2'}};
const paths={handleDiscoveryViewer:'booking-discovery-viewer.js',attachDiscoverySession:'booking-discovery-viewer.js',loadMemberAppSessionState:'member-app-api-runtime.js',readMemberAppSession:'member-app-api-runtime.js'};
const ast=s=>parse(s,{ecmaVersion:'latest',sourceType:'module'});
function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const [key,value]of Object.entries(node)){if(key==='start'||key==='end')continue;if(Array.isArray(value))value.forEach(n=>walk(n,visit));else if(value&&typeof value==='object')walk(value,visit);}}
export function getFunction(s,name){const found=ast(s).body.map(n=>n.type==='ExportNamedDeclaration'?n.declaration:n).filter(n=>n?.type==='FunctionDeclaration'&&n.id.name===name);assert.equal(found.length,1,'unique top-level '+name);return found[0];}
function reviewedFunction(name){const s=fs.readFileSync(root+'/member-pages-worker/src/'+paths[name],'utf8');const n=getFunction(s,name);let part=s.slice(n.start,n.end);const spans=[];walk(ast(part),node=>{if(node.type==='Identifier'&&Object.hasOwn(mappings[name],node.name))spans.push({start:node.start,end:node.end,text:mappings[name][node.name]});});for(const p of spans.sort((a,b)=>b.start-a.start))part=part.slice(0,p.start)+p.text+part.slice(p.end);if(name==='handleDiscoveryViewer'){assert.equal(part.split('resolveBookingPerRename(env,').length,2);part=part.replace('resolveBookingPerRename(env,',namespace+'.resolveBookingPerRename(env,');}return part;}
export function replacements(){verifySources();return Object.fromEntries(Object.keys(paths).map(name=>[name,reviewedFunction(name)]));}
function applyReviewedArtifactDelta(baseline,edits,expected){assert.equal(sha(baseline),expected);const spans=edits.map(e=>{assert.equal(sha(e.before),e.beforeHash);assert.equal(sha(e.after),e.afterHash);const start=baseline.indexOf(e.before);assert.ok(start>=0&&baseline.indexOf(e.before,start+1)<0,'ambiguous span');return {start,end:start+e.before.length,after:e.after};}).sort((a,b)=>a.start-b.start);let end=0;const parts=[];for(const span of spans){assert.ok(span.start>=end,'overlapping span');parts.push(baseline.subarray(end,span.start),span.after);end=span.end;}parts.push(baseline.subarray(end));return Buffer.concat(parts);}
function verifyPreservation(baseline,candidate,edits){let inverse=candidate.toString();for(const e of [...edits].reverse()){assert.equal(inverse.split(e.after).length,2,'inverse anchor drift');inverse=inverse.replace(e.after,()=>e.before);}assert.ok(Buffer.from(inverse).equals(baseline),'unrelated bytes changed');}
export function build(baseline){
 assert.equal(sha(baseline),BASE_HASH,'live module baseline drift');verifySources();const source=baseline.toString('utf8');assert.ok(Buffer.from(source).equals(baseline));assert.ok(!source.includes(namespace));const tree=ast(source), names=Object.keys(paths);
 walk(tree,node=>{if(node.type==='AssignmentExpression'&&node.left.type==='Identifier')assert.ok(!names.includes(node.left.name),'target function rebound');if(node.type==='VariableDeclarator'&&node.id.type==='Identifier')assert.ok(!names.includes(node.id.name),'target function redeclared');});
 const expected=JSON.parse(fs.readFileSync(scriptDir+'/member-baseline-functions.json'));
 const edits=names.map(name=>{const n=getFunction(source,name);const before=source.slice(n.start,n.end);assert.equal(before,expected.find(e=>e.name===name).text.trimEnd(),'reviewed baseline function drift '+name);return {label:name,before,after:reviewedFunction(name)};});
 assert.equal(execFileSync(esbuild,['--version'],{encoding:'utf8'}).trim(),'0.27.3');
 fs.mkdirSync(out,{recursive:true});
 execFileSync(esbuild,['--sourcefile=booking-customer-identity.js','--bundle','--format=iife','--platform=neutral','--target=es2022','--global-name='+namespace,'--outfile='+out+'/member-identity-bundle.js','--log-level=error'],{cwd:out,input:fs.readFileSync(root+'/member-pages-worker/src/booking-customer-identity.js')});
 const bundle=fs.readFileSync(out+'/member-identity-bundle.js','utf8');assert.equal(ast(bundle).body.length,1);assert.ok(!bundle.includes('import('));const marker='\nexport {\n';assert.equal(source.split(marker).length,2);edits.push({label:'isolated identity helper',before:marker,after:'\n'+bundle+marker});
 const candidate=applyReviewedArtifactDelta(baseline,edits.map(e=>({...e,before:Buffer.from(e.before),after:Buffer.from(e.after),beforeHash:sha(e.before),afterHash:sha(e.after)})),BASE_HASH);
 verifyPreservation(baseline,candidate,edits);const next=ast(candidate.toString());
 const exports=t=>t.body.filter(n=>n.type.startsWith('Export')).map(n=>n.type==='ExportNamedDeclaration'?n.specifiers.map(x=>[x.local.name,x.exported.name]):n.type);
 assert.deepEqual(exports(next),exports(tree));
 const manifest={baseline_sha256:BASE_HASH,candidate_sha256:sha(candidate),source_sha:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),source_tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),method:'four-ast-function-spans-and-isolated-identity-bundle',preservation:'inverse-exact-byte-reconstruction',exports_unchanged:true,migrations:[],settings_changes:[],edits:edits.map(e=>({label:e.label,before_sha256:sha(e.before),after_sha256:sha(e.after),before_bytes:Buffer.byteLength(e.before),after_bytes:Buffer.byteLength(e.after)})),source_hashes:Object.fromEntries([...new Set([...Object.values(paths),'booking-customer-identity.js'])].map(p=>[p,sha(fs.readFileSync(root+'/member-pages-worker/src/'+p))]))};
 return {candidate,manifest,edits};
}
if(process.argv[1]===new URL(import.meta.url).pathname){const {candidate,manifest}=build(fs.readFileSync(baselinePath));fs.writeFileSync(out+'/member-candidate.js',candidate);fs.writeFileSync(out+'/member-candidate-manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));}
