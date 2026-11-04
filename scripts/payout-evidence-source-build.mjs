import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const tools=createRequire(resolve(process.env.PAYOUT_TOOLS_DIR||'../payout-p0/build-tools','package.json'));
const {build}=tools('esbuild'),results=[];
for(const [worker,config,names] of [['admin-worker','admin-worker/wrangler.toml',['JobEditCoordinator','ModelDiscoveryCoordinator']],['payments-worker','payments-worker/wrangler.merged.toml',['KbankSandboxCoordinator','PointsPhase1Coordinator','SessionPaidProjectionCoordinator']]]){
 const main=/^main\s*=\s*"([^"]+)"/m.exec(readFileSync(config,'utf8'))?.[1];assert.ok(main);
 const entry=worker+'/'+main,outfile=resolve(process.env.RUNNER_TEMP||'/private/tmp',worker+'-payout-production-source.js');
 const result=await build({entryPoints:[entry],outfile,bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['cloudflare:workers','node:*'],metafile:true,logLevel:'silent'});
 const exports=Object.values(result.metafile.outputs).find(o=>o.entryPoint)?.exports||[];for(const name of names)assert.ok(exports.includes(name),'production named export '+name);assert.ok(exports.includes('default'));if(worker==='payments-worker')assert.deepEqual(exports.slice().sort(),[...names,'default'].sort());
 results.push({worker,config,main,known_live_overlay_only_exports:worker==='payments-worker'?['DoubleMomentCoordinator']:[],source_only_runtime_parity:worker==='payments-worker'?false:'preserved artifact required',sha256:createHash('sha256').update(readFileSync(outfile)).digest('hex'),bytes:readFileSync(outfile).length,exports,warnings:result.warnings.length,proof:'source production entrypoint build only; not a preserved release artifact'});
}
writeFileSync(process.env.PAYOUT_SOURCE_RECEIPT||'payout-evidence-source-build.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
