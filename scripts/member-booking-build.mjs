// Offline preparation only. Never invokes Wrangler, a package manager, or Cloudflare.
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,relative,join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const contract=JSON.parse(readFileSync(new URL('./member-booking-release-contract.json',import.meta.url),'utf8'));
export const digest=x=>createHash('sha256').update(x).digest('hex');
export function verifyBookingSources(directory=root){for(const [p,expected]of Object.entries(contract.source_hashes)){assert.equal(digest(readFileSync(join(directory,p))),expected,'source drift: '+p);}return true;}
export function normalizeSigilMap(map,buildDirectory,directory=root){
 assert.equal(map.version,3);assert.equal(map.sources.length,map.sourcesContent.length);assert.ok(!map.sourceRoot);const seen=new Set();
 const sources=map.sources.map((p,i)=>{const absolute=resolve(buildDirectory,p),path=relative(directory,absolute).split('\\').join('/');assert.ok(!path.startsWith('../')&&!isAbsolute(path),'source outside repository');assert.ok(!seen.has(path),'duplicate source');seen.add(path);assert.equal(digest(map.sourcesContent[i]),contract.source_hashes[path],'mapped source drift: '+path);return relative(join(directory,'sigil-booking-worker'),absolute).split('\\').join('/');});
 assert.deepEqual([...seen].sort(),contract.sigil.source_paths.slice().sort(),'source graph drift');return Buffer.from(JSON.stringify({...map,sources})+'\n');
}
export function buildSigilBooking({directory=root,esbuild,run=execFileSync}={}){
 verifyBookingSources(directory);assert.ok(esbuild,'existing esbuild executable required');assert.equal(run(esbuild,['--version'],{encoding:'utf8'}).trim(),'0.27.3','build tool drift');
 const buildDirectory=mkdtempSync(join(tmpdir(),'booking-release-build-')),output=join(buildDirectory,'runtime-index.js');
 run(esbuild,['src/runtime-index.js','--bundle','--format=esm','--target=es2022','--keep-names','--sourcemap','--outfile='+output,'--log-level=error'],{cwd:join(directory,'sigil-booking-worker'),stdio:'pipe',env:{...process.env,CLOUDFLARE_API_TOKEN:'',CLOUDFLARE_API_KEY:'',WRANGLER_SEND_METRICS:'false'}});
 const modules=[{name:'runtime-index.js',bytes:readFileSync(output)},{name:'runtime-index.js.map',bytes:normalizeSigilMap(JSON.parse(readFileSync(output+'.map','utf8')),buildDirectory,directory)}];
 for(const m of modules)assert.equal(digest(m.bytes),contract.sigil.local_debug_artifacts[m.name],'compiled audit artifact drift: '+m.name);
 assert.equal(contract.sigil.source_map_policy,'local-evidence-only-not-uploaded');
 const trailer=Buffer.from('//# sourceMappingURL=runtime-index.js.map\n');
 assert.ok(modules[0].bytes.subarray(-trailer.length).equals(trailer),'unexpected map trailer');
 const runtime={name:'runtime-index.js',bytes:modules[0].bytes.subarray(0,-trailer.length)};
 assert.equal(digest(runtime.bytes),contract.sigil.candidate_modules[runtime.name],'runtime candidate drift');
 return [runtime];
}
