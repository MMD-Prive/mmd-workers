import {build} from 'esbuild';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SOURCE,ADMIN_HOST,PARTNER_HOST} from './constants.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
execFileSync('git',['merge-base','--is-ancestor',SOURCE,'HEAD'],{cwd:root});
if(execFileSync('git',['diff','--name-only',SOURCE,'--','admin-worker','partners-worker','shared','webflow'],{cwd:root,encoding:'utf8'}).trim())throw Error('source_modified');
await mkdir(root+'co-model-staging/.build',{recursive:true});
const adapterHash=createHash('sha256');
for(const name of (await readdir(root+'co-model-staging')).filter(n=>/\.(?:mjs|toml)$/.test(n)).sort())adapterHash.update(name+'\0').update(await readFile(root+'co-model-staging/'+name));
const manifest={source:SOURCE,adapter_sha256:adapterHash.digest('hex'),bundles:{}};
for(const role of ['admin','partner']){
 const host=role==='admin'?ADMIN_HOST:PARTNER_HOST;
 const launcher=role==='admin'?'/qa/owner':'/qa/partners';
 const result=await build({absWorkingDir:root,entryPoints:['co-model-staging/entry.mjs'],bundle:true,write:false,format:'esm',platform:'node',define:{STAGING_ROLE:JSON.stringify(role)},inject:['co-model-staging/context.mjs'],plugins:[{name:'isolated-origin-overlay',setup(b){b.onLoad({filter:/\.(?:js|mjs|ts)$/},async args=>{
  if(args.path.includes('/node_modules/')||args.path.includes('/co-model-staging/'))return;
  let contents=await readFile(args.path,'utf8');
  // Exact overlays apply only to this isolated build; fail if the pinned source drifts.
  const replaceOnce=(before,after)=>{
   if(contents.split(before).length!==2)throw Error('staging_overlay_source_mismatch:'+args.path);
   contents=contents.replace(before,after);
  };
  if(args.path.endsWith('/partners-worker/src/partner-control-room.ts')){
   replaceOnce('credentials:"omit"','credentials:"same-origin"');
  }
  if(args.path.endsWith('/admin-worker/src/admin-login-page.js')){
   replaceOnce('const production = [ADMIN_CANONICAL_ORIGIN, "https://www.mmdbkk.com"].includes(url.origin);','const production = false;');
   replaceOnce('const STAGING_ORIGIN = "https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev";',`const STAGING_ORIGIN = "https://${host}";`);
  }
  if(args.path.endsWith('/admin-login-hero-worker-core.js')){
   // A fixed, role-specific local destination cannot become an open redirect.
   const start=contents.indexOf('function sanitizeNextPath(value) {');
   const end=contents.indexOf('\nfunction ensureAllowedOrigin(request)',start);
   if(start<0||end<0)throw Error('staging_login_redirect_source_mismatch');
   contents=contents.slice(0,start)+`function sanitizeNextPath(value) { return ${JSON.stringify(launcher)}; }\n`+contents.slice(end);
  }
  // Build-only exact hostname replacement. All runtime outbound fetches are fixture-only.
  contents=contents.replaceAll('https://www.mmdbkk.com','https://'+host).replaceAll('https://mmdbkk.com','https://'+host).replaceAll('"mmdbkk.com", "www.mmdbkk.com"','"'+host+'"');
  if(args.path.endsWith('/admin-login-hero-worker-core.js'))contents+='\nexport {handleCredentialBoundAdminLogin,handleCredentialBoundAdminLogout};';
  return {contents,loader:args.path.endsWith('.ts')?'ts':'js'};
 });}}]});
 const bytes=result.outputFiles[0].contents;await writeFile(root+'co-model-staging/.build/'+role+'.mjs',bytes);manifest.bundles[role]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
}
await writeFile(root+'co-model-staging/.build/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
