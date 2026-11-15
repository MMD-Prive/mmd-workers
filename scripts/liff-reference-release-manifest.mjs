// Offline build artifact generation; no service calls or release operations.
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {assemble,digest} from './liff-reference-local-candidate.mjs';
import {buildPolicyModules} from './care-back-november-policy-release.mjs';
export function buildReferenceManifest(directory) {
 const {baseline,code,branding}=assemble(directory);
 const dir=mkdtempSync(join(tmpdir(),'reference-manifest-'));
 const before=join(dir,'before.mjs'),after=join(dir,'after.mjs');
 writeFileSync(before,baseline);writeFileSync(after,code);
 let diff;
 try { diff=execFileSync('git',['diff','--no-index','--no-ext-diff','--text','--unified=100',before,after],{encoding:'utf8',maxBuffer:20*1024*1024}); }
 catch(error){assert.equal(error.status,1);diff=error.stdout;}
 const patches=[];
 for(const hunk of diff.split(/^@@ .* @@.*\n/m).slice(1)) {
  const a=[],b=[];
  for(const line of hunk.split('\n')) {
   if(line.startsWith(' ')||line.startsWith('-'))a.push(line.slice(1));
   if(line.startsWith(' ')||line.startsWith('+'))b.push(line.slice(1));
  }
  const old=a.join('\n')+'\n',next=b.join('\n')+'\n';
  patches.push({id:`reference-${patches.length+1}`,before:old,after:next,before_sha256:digest(old),after_sha256:digest(next)});
 }
 const manifest={schema:'my_mmd_home_artifact_delta_v1',worker:'member-pages-worker',
  source_sha:'b7dec7a7213bdce8c7f2a369f2a2304d6dd9466f',
  baseline_version:'0e415d37-1823-4914-940a-4b3853b262a6',baseline_deployment:'455961e8-a71e-4efe-ab29-c252987f431e',
  main_module:'model-console-live-entrypoint.js',modules:[
   {name:'app-branding-module.mjs',type:'esm',before_sha256:digest(branding),after_sha256:digest(branding),patches:[]},
   {name:'model-console-live-entrypoint.js',type:'esm',before_sha256:digest(baseline),after_sha256:digest(code),patches}
  ]};
 const artifact={id:manifest.baseline_version,main_module:manifest.main_module,modules:[
  {name:manifest.main_module,content_base64:Buffer.from(baseline).toString('base64')},
  {name:'app-branding-module.mjs',content_base64:branding.toString('base64')}]};
 const built=buildPolicyModules(artifact,manifest);
 assert.equal(digest(built.find(m=>m.name===manifest.main_module).bytes),digest(code));
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 assert.equal(process.argv.length,4,'baseline directory and output path required');
 writeFileSync(process.argv[3],JSON.stringify(buildReferenceManifest(process.argv[2]),null,2)+'\n');
}
