import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SOURCE} from './constants.mjs';
const dir=new URL('./',import.meta.url),m=JSON.parse(await readFile(new URL('.build/manifest.json',dir)));
assert.equal(m.source,SOURCE);
const hash=createHash('sha256');
for(const name of (await readdir(dir)).filter(n=>/\.(?:mjs|toml)$/.test(n)).sort())hash.update(name+'\0').update(await readFile(new URL(name,dir)));
assert.equal(m.adapter_sha256,hash.digest('hex'));
for(const role of ['admin','partner']){
 const config=await readFile(new URL('wrangler.'+role+'.toml',dir),'utf8');
 assert.match(config,new RegExp('name = "mmd-co-model-'+role+'-staging"'));
 assert.match(config,/workers_dev = false/);assert.match(config,/preview_urls = false/);assert.match(config,/routes = \[\]/);
 assert.doesNotMatch(config,/\[\[(?:r2_buckets|kv_namespaces|d1_databases)\]\]|account_id|zone_id|AIRTABLE|cron|TOKEN_SECRET\s*=/);
 const targets=[...config.matchAll(/^service = "([^"]+)"/gm)].map(x=>x[1]);
 assert.deepEqual(targets,['mmd-co-model-'+(role==='admin'?'partner':'admin')+'-staging']);
 const bindings=[...config.matchAll(/^binding = "([^"]+)"/gm)].map(x=>x[1]);
 assert.deepEqual(bindings,[role==='admin'?'PARTNERS_WORKER':'ADMIN_CO_MODEL']);
 const bytes=await readFile(new URL('.build/'+role+'.mjs',dir));
 assert.equal(m.bundles[role].sha256,createHash('sha256').update(bytes).digest('hex'));
}
console.log(JSON.stringify({local_preflight:'PASS',source:SOURCE,adapter_sha256:m.adapter_sha256,fixture:'immutable_in_bundle',cloudflare_access:'NOT_CHECKED',versions:'NOT_DEPLOYED',hosted_e2e:'PENDING',release_ready:false},null,2));
