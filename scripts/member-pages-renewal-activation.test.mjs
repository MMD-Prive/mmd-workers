import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,writeFileSync,rmSync,mkdirSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {activateRenewalFlag,activationConfiguration,inspectActivationCheckout} from './member-pages-renewal-activation.mjs';
import {ROOT,VERSION_ROOT,ZONE,versionConfiguration} from './member-pages-code-only-release.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture(options={}) {
 const bytes=Buffer.from('export default {fetch(){return new Response("fixture")}};');
 const contract={version:id(1),deployment:id(10),mainModule:'runtime-index.js',moduleHashes:{'runtime-index.js':createHash('sha256').update(bytes).digest('hex')}};
 const base={id:id(1),resources:{script:{handlers:['fetch'],placement_mode:'off'},script_runtime:{compatibility_date:'2026-06-20',compatibility_flags:[]},bindings:[{name:'LIFF_RENEWAL_CARD_ENABLED',type:'plain_text',text:'false'},{name:'LIFF_PROMOTION_PURCHASE_ENABLED',type:'plain_text',text:'false'},{name:'HISTORY_ALLOWLIST',type:'plain_text',text:'fixture-history'},{name:'SERVICE_SECRET',type:'secret_text',text:'fixtureSecretNeverPrint'}]}};
 let current={id:id(10),strategy:'percentage',versions:[{version_id:id(1),percentage:100}]},uploaded=false,approvals=0,writes=0,depReads=0;const calls=[],receipts=[];
 const io={sha:'a'.repeat(40),expectedVersion:id(1),expectedDeployment:id(10),save:x=>receipts.push(structuredClone(x)),
  async approve(){if(++approvals===options.denyApproval)throw Error('denied');},
  async call(path,init={}){
   const method=init.method||'GET';calls.push({path,method});
   if(method==='POST')writes++;
   if(path===ROOT+'/deployments'&&method==='GET'){
    depReads++;if(options.baselineDrift&&depReads>1)return {deployments:[{...current,id:id(99)}]};
    return {deployments:[structuredClone(current)]};
   }
   if(path===ROOT+'/versions/'+id(1))return structuredClone(base);
   if(path===ROOT+'/versions')return {items:uploaded?[{id:id(2)},{id:id(1)}]:[{id:id(1)}]};
   if(path===ROOT+'/script-settings')return {observability:{enabled:true}};
   if(path===ROOT+'/schedules')return {schedules:[{cron:'*/5 * * * *'}]};
   if(path===ROOT+'/subdomain')return {enabled:true};
   if(path===`/zones/${ZONE}/workers/routes`)return [{pattern:'mmdbkk.com/member/*',script:'member-dashboard-chat-worker'}];
   if(path===VERSION_ROOT+'/'+id(1)+'?include=modules')return {id:id(1),main_module:contract.mainModule,modules:[{name:contract.mainModule,content_base64:(options.codeDrift?Buffer.from('changed'):bytes).toString('base64')}]};
   if(path===ROOT+'/versions?bindings_inherit=strict'&&method==='POST'){
    const metadata=JSON.parse(init.body.get('metadata'));
    assert.equal(metadata.main_module,contract.mainModule);
    assert.deepEqual(metadata.bindings.filter(b=>b.type!=='inherit'),[{name:'LIFF_RENEWAL_CARD_ENABLED',type:'plain_text',text:'true'}]);
    assert.ok(!JSON.stringify(metadata).includes('fixtureSecretNeverPrint'));
    assert.equal(metadata.migrations,undefined);assert.equal(metadata.migration_tag,undefined);
    assert.equal([...init.body.keys()].length,2);
    assert.deepEqual(Buffer.from(await init.body.get(contract.mainModule).arrayBuffer()),bytes);
    uploaded=true;return {id:id(2)};
   }
   if(path===ROOT+'/versions/'+id(2)){
    const next=structuredClone(base);next.id=id(2);next.resources.bindings.find(b=>b.name==='LIFF_RENEWAL_CARD_ENABLED').text='true';
    if(options.promoDrift)next.resources.bindings.find(b=>b.name==='LIFF_PROMOTION_PURCHASE_ENABLED').text='true';
    if(options.historyDrift)next.resources.bindings.find(b=>b.name==='HISTORY_ALLOWLIST').text='changed';
    return next;
   }
   if(path===VERSION_ROOT+'/'+id(2)+'?include=modules')return {id:id(2),main_module:contract.mainModule,modules:[{name:contract.mainModule,content_base64:(options.uploadDrift?Buffer.from('changed'):bytes).toString('base64')}]};
   if(path===ROOT+'/deployments'&&method==='POST'){
    assert.deepEqual(JSON.parse(init.body),{strategy:'percentage',versions:[{version_id:id(2),percentage:100}]});
    current={id:id(11),strategy:'percentage',versions:[{version_id:id(2),percentage:100}]};return structuredClone(current);
   }
   if(path===ROOT+'/deployments/'+id(11))return structuredClone(current);
   throw Error('unexpected request '+method+' '+path);
  }};
 return {io,contract,base,calls,receipts,writes:()=>writes};
}
test('activation changes only Renewal flag and preserves Promotion, history, secrets and code',async()=>{
 const f=fixture();const result=await activateRenewalFlag(f.io,f.contract);
 assert.equal(result.phase,'complete');assert.equal(result.code_unchanged,true);assert.equal(f.writes(),2);
 assert.ok(f.calls.filter(c=>c.method==='POST').every(c=>[ROOT+'/versions?bindings_inherit=strict',ROOT+'/deployments'].includes(c.path)));
 assert.equal(JSON.stringify(f.receipts).includes('fixtureSecretNeverPrint'),false);
});
for(const [name,options,writes] of [['denied owner',{denyApproval:1},0],['baseline drift',{baselineDrift:true},0],['code drift',{codeDrift:true},0],['uploaded code drift',{uploadDrift:true},1],['Promotion drift',{promoDrift:true},1],['History drift',{historyDrift:true},1],['promotion denied',{denyApproval:3},1]])test(`activation stops on ${name} without another mutation`,async()=>{
 const f=fixture(options);await assert.rejects(activateRenewalFlag(f.io,f.contract));assert.equal(f.writes(),writes);assert.equal(f.receipts.at(-1).phase,'stopped');
});
test('stale expected baseline fails before any API call',async()=>{
 const f=fixture();f.io.expectedVersion=id(99);await assert.rejects(activateRenewalFlag(f.io,f.contract));assert.equal(f.calls.length,0);
});
test('missing, changed or non-text flags cannot activate',()=>{
 const f=fixture();const config=versionConfiguration(f.base);const expected=activationConfiguration(config);
 assert.equal(config.bindings.find(b=>b.name==='LIFF_RENEWAL_CARD_ENABLED').text,'false');
 assert.equal(expected.bindings.find(b=>b.name==='LIFF_RENEWAL_CARD_ENABLED').text,'true');
 for(const change of [x=>{x.bindings=x.bindings.filter(b=>b.name!=='LIFF_RENEWAL_CARD_ENABLED');},x=>x.bindings.find(b=>b.name==='LIFF_RENEWAL_CARD_ENABLED').text='true',x=>x.bindings.find(b=>b.name==='LIFF_PROMOTION_PURCHASE_ENABLED').text='true',x=>x.bindings.find(b=>b.name==='LIFF_RENEWAL_CARD_ENABLED').type='secret_text']){
  const next=structuredClone(config);change(next);assert.throws(()=>activationConfiguration(next));
 }
});
test('activation workflow keeps owner approval, exact SHA and default mode protection',()=>{
 const text=readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml',import.meta.url),'utf8');
 assert.match(text,/default: approval_boundary_only/);assert.match(text,/environment: member-pages-code-only-owner/);
 assert.match(text,/inputs\.approved_sha == github\.sha/);assert.match(text,/if: inputs.execution_mode == 'renewal-activation'\n\s+env:/);
 assert.match(text,/node scripts\/member-pages-renewal-activation.mjs --execute-approved/);
 assert.deepEqual([...text.matchAll(/secrets\.([A-Z_]+)/g)].map(m=>m[1]),Array(4).fill('CLOUDFLARE_API_TOKEN'));
 const step=text.slice(text.indexOf('      - name: Activate only'),text.indexOf('      - name: Promote only'));
 assert.doesNotMatch(step,/AIRTABLE|MEMBER_STATUS|PAYMENTS_WORKER|LINE_CHANNEL/);
});

test('actual activation checkout rejects dirty files, wrong root and wrong SHA',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'renewal-checkout-guard-')));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 try{
  git('init','-q');writeFileSync(join(root,'fixture.txt'),'fixture');git('add','fixture.txt');
  git('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
  const sha=git('rev-parse','HEAD');inspectActivationCheckout(sha,root);
  assert.throws(()=>inspectActivationCheckout('0'.repeat(40),root));
  mkdirSync(join(root,'nested'));assert.throws(()=>inspectActivationCheckout(sha,join(root,'nested')));
  writeFileSync(join(root,'untracked.txt'),'fixture');assert.throws(()=>inspectActivationCheckout(sha,root),/dirty activation checkout/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
