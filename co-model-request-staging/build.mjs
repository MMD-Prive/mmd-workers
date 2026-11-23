import {build} from '../partners-worker/node_modules/esbuild/lib/main.js';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SOURCE,ADMIN,PARTNER} from './constants.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
git('merge-base','--is-ancestor',SOURCE,'HEAD');
const sourcePaths=['.',':(exclude)co-model-request-staging',':(exclude).github/workflows/co-model-3243-staging-ci.yml'];
if(git('diff','--name-only',SOURCE,'--',...sourcePaths) ||
   git('ls-files','--others','--exclude-standard','--',...sourcePaths)) throw Error('source_pin_mismatch');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const dir=new URL('./',import.meta.url);
await mkdir(new URL('.build/',dir),{recursive:true});
const overlay={
  name:'fixture-only-overlays',
  setup(bundle){
    bundle.onLoad({filter:/(co-model-intake\.mjs|co-model-owner\.js|credential-bound-admin-session\.js|partners-worker\/src\/index\.ts)$/},async ({path})=>{
      let contents=await readFile(path,'utf8');
      function replace(before,after){
        if(contents.split(before).length!==2)throw Error('source_overlay_mismatch: '+path);
        contents=contents.replace(before,after);
      }
      if(path.endsWith('/co-model-owner.js')) {
        replace("'Referrer-Policy': 'no-referrer'", "'Referrer-Policy': status === 200 ? 'same-origin' : 'no-referrer'");
        replace("new URL('/partner/dashboard/co-model-request', request.url)", "new URL('/partner/dashboard/co-model-request', "+JSON.stringify(PARTNER)+")");
      } else if(path.endsWith('/co-model-intake.mjs')) {
        replace("'Referrer-Policy': 'no-referrer'", "'Referrer-Policy': available && !result.answer ? 'same-origin' : 'no-referrer'");
      } else if(path.endsWith('/credential-bound-admin-session.js')) replace('  ...PROD_MMD_ORIGINS,','  ...PROD_MMD_ORIGINS,\n  '+JSON.stringify(ADMIN)+',');
      else {
        replace('const response = await fetch(url.toString(), { ...init, headers });','const response = await (env as RuntimeEnv & {fixtureFetch: typeof fetch}).fixtureFetch(url.toString(), { ...init, headers });');
        contents+='\nexport {verifyPartnerTokenFromRequest};\n';
      }
      return {contents,loader:path.endsWith('.ts')?'ts':'js'};
    });
  },
};
const manifest={source:SOURCE,hosts:{owner:ADMIN,partner:PARTNER},releaseReady:false,hostedE2E:'pending',bindings:{
  owner:{CO_MODEL_OWNER:{service:'mmd-co-model-3243-partner-staging',entrypoint:'CoModelOwnerService'}},
  partner:{CO_MODEL_INTAKE:{class:'CoModelIntakeObject',migration:'co-model-3243-fixture-v1'}},
},adapter:{},bundles:{}};
for(const name of ['constants.mjs','owner.mjs','partner.mjs','build.mjs','preflight.mjs','wrangler.owner.toml','wrangler.partner.toml']){
  const bytes=await readFile(new URL(name,dir));
  manifest.adapter[name]=sha(bytes);
}
for(const role of ['owner','partner']){
  const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(role+'.mjs',dir))],bundle:true,write:false,
    format:'esm',platform:'neutral',external:['cloudflare:workers','node:*'],plugins:[overlay],logLevel:'silent'});
  const {contents}=outputFiles[0];
  await writeFile(new URL('.build/'+role+'.mjs',dir),contents);
  manifest.bundles[role]={sha256:sha(contents),bytes:contents.length};
}
await writeFile(new URL('.build/manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');
