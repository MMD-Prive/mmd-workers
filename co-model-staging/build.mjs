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
 const result=await build({absWorkingDir:root,entryPoints:['co-model-staging/entry.mjs'],bundle:true,write:false,format:'esm',platform:'node',define:{STAGING_ROLE:JSON.stringify(role)},inject:['co-model-staging/context.mjs'],plugins:[{name:'isolated-origin-overlay',setup(b){b.onLoad({filter:/\.(?:js|mjs|ts)$/},async args=>{
  if(args.path.includes('/node_modules/')||args.path.includes('/co-model-staging/'))return;
  let contents=await readFile(args.path,'utf8');
  // Build-only exact hostname replacement. All runtime outbound fetches are fixture-only.
  contents=contents.replaceAll('https://www.mmdbkk.com','https://'+host).replaceAll('https://mmdbkk.com','https://'+host).replaceAll('"mmdbkk.com", "www.mmdbkk.com"','"'+host+'"');
  if(args.path.endsWith('/admin-login-hero-worker-core.js'))contents+='\nexport {handleCredentialBoundAdminLogin,handleCredentialBoundAdminLogout};';
  return {contents,loader:args.path.endsWith('.ts')?'ts':'js'};
 });}}]});
 const bytes=result.outputFiles[0].contents;await writeFile(root+'co-model-staging/.build/'+role+'.mjs',bytes);manifest.bundles[role]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
}
await writeFile(root+'co-model-staging/.build/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
