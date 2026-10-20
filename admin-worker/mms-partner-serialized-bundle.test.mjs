import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';

const require=createRequire(import.meta.url);
function compiler(){
  try{return require('esbuild');}catch{}
  try{return createRequire(require.resolve('wrangler/package.json'))('esbuild');}catch{}
  try{return createRequire(realpathSync(execFileSync('which',['wrangler'],{encoding:'utf8'}).trim()))('esbuild');}catch{}
  // Local Codex may use global Wrangler; CI normally resolves the first paths.
  const globalRoot=execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
  return createRequire(join(globalRoot,'wrangler','package.json'))('esbuild');
}
const { build }=compiler();
const built=await build({entryPoints:[fileURLToPath(new URL('./src/mms-partner-line-ui.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',keepNames:true,minifySyntax:true,logLevel:'silent'});
const output=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const settle=async()=>{for(let n=0;n<15;n++)await new Promise(resolve=>setImmediate(resolve));};
function node(){return {style:{},dataset:{},value:'kalima',disabled:false,checked:false,hidden:false,textContent:'',children:[],bySelector:new Map(),append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},before(){},setAttribute(){},addEventListener(){},querySelector(key){if(!this.bySelector.has(key))this.bySelector.set(key,node());return this.bySelector.get(key);},querySelectorAll(){return [];}};}
function dom(){const ids=new Map();return {ids,document:{head:node(),createElement:()=>node(),getElementById:key=>{if(!ids.has(key))ids.set(key,node());return ids.get(key);}}};}

test('actual keepNames build runs serialized Verify without a Worker-global __name helper',async()=>{
  assert.match(output.APP_JS,/__name\(updateShopBrand/);
  const {document}=dom(),root=document.getElementById('mms-partner-verify'),requests=[];
  const scope=['profile'];
  vm.runInNewContext(output.APP_JS,{document,URL,URLSearchParams,Date,location:{origin:'https://www.mmdbkk.com',pathname:'/male-massage/partner/verify',search:'?shop=kalima'},sessionStorage:{getItem:()=>null,removeItem(){}},window:{addEventListener(){},liff:{init:async()=>{},isLoggedIn:()=>true,getContext:()=>({scope}),getIDToken:()=>{throw Error('must not read token in profile-only configuration');}}},fetch:async(path,options)=>{requests.push({path,body:JSON.parse(options.body)});return {ok:true};}});
  await settle();assert.match(root.querySelector('#mms-line-status').textContent,/ยังไม่ได้เปิดสิทธิ์ยืนยันตัวตน/);
  assert.ok(requests.some(r=>r.body.code==='LINE_OPENID_SCOPE_MISSING'));assert.ok(requests.every(r=>r.path.endsWith('/event')));
});

test('actual keepNames build runs Owner queue, shop switch and diagnostics with no review or claim writes',async()=>{
  const script=output.OWNER_HTML.match(/<script>([\s\S]*?)<\/script>/)[1];assert.match(script,/__name\(load/);
  const {document}=dom(),requests=[];
  const select=document.getElementById('shop');select.value='kalima';
  vm.runInNewContext(script,{document,Date,fetch:async(path,options={})=>{
    requests.push({path,method:options.method||'GET'});assert.equal(options.method||'GET','GET');
    const shop=new URL(path,'https://www.mmdbkk.com').searchParams.get('shop');
    return {ok:true,json:async()=>path.includes('/diagnostics?')?{ok:true,shop_key:shop,events:[{at:'2026-10-20T00:00:00Z',shop,stage:'client_ready',code:'OK'}]}:{ok:true,shop_key:shop,shop_name:shop==='kalima'?'Kalima Massage':'Relax Spa by 9',identity_verified:true,claims:[]}};
  }});
  await settle();assert.match(document.getElementById('owner-status').textContent,/Kalima Massage/);
  await document.getElementById('diagnostic-refresh').onclick();assert.match(document.getElementById('diagnostic-status').textContent,/Kalima Massage/);
  select.value='relax';select.onchange();await settle();await document.getElementById('diagnostic-refresh').onclick();
  assert.match(document.getElementById('owner-status').textContent,/Relax Spa by 9/);assert.match(document.getElementById('diagnostic-status').textContent,/Relax Spa by 9/);
  assert.ok(requests.every(r=>!r.path.includes('/review')&&!r.path.endsWith('/request')));
});
