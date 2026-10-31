import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {LV15,patchLv15Text,decodeLv15Module,buildLv15Artifact,validateLv15Syntax,releaseLv15} from './member-pages-lv15-artifact.mjs';
import {ROOT,VERSION_ROOT,ZONE} from './member-pages-code-only-release.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const original='const MY_MMD_SIGIL_PRIVATE_CSS="unchanged";\nexport default {fetch(){return new Response(`\n${MY_MMD_SIGIL_PRIVATE_CSS}\n</style>\n<body data-mmd-graphics="v6" data-brand-audience="unresolved">keep all member logic unchanged ✓`);}};\n';
const candidate=Buffer.from(patchLv15Text(original)),candidateHash=hash(candidate);
const uid='11111111-2222-4333-8444-555555555555',did='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const artifact=(id,bytes,annotations={})=>({id,main_module:'worker.js',modules:[{name:'worker.js',content_type:'application/javascript+module',content_base64:Buffer.from(bytes).toString('base64')}],annotations});
function fixture(opts={}){
 const requests=[],writes=[],receipts=[];let approvals=0,uploaded=false,promoted=false,metadata;
 const base={id:LV15.baseVersion,resources:{script:{etag:'base',handlers:['fetch','scheduled'],named_handlers:[{name:'RememberedLoginDevice',handlers:['class']}]},script_runtime:{compatibility_date:'2026-06-20',migration_tag:'v3-remembered-login-device',usage_model:'standard'},bindings:[{name:'SECRET',type:'secret_text'},{name:'LIFF_RENEWAL_CARD_ENABLED',type:'plain_text',text:'true'},{name:'LIFF_PROMOTION_PURCHASE_ENABLED',type:'plain_text',text:'false'},{name:'DO',type:'durable_object_namespace',namespace_id:'fixture'}]}};
 const dep={id:LV15.baseDeployment,strategy:'percentage',versions:[{version_id:LV15.baseVersion,percentage:100}]};
 const next={id:did,strategy:'percentage',versions:[{version_id:uid,percentage:100}]};
 const io={sha:'a'.repeat(40),expectedVersion:LV15.baseVersion,expectedDeployment:LV15.baseDeployment,
  save:x=>receipts.push(structuredClone(x)),
  approve:async()=>{approvals++;if(opts.deny===approvals)throw Error('owner gate');},
  build:async()=>({bytes:candidate,sha256:candidateHash}),
  syntax:async bytes=>{if(opts.syntaxError)throw Error('syntax');validateLv15Syntax(bytes);},
  call:async(path,init={})=>{
   requests.push({path,method:init.method||'GET'});
   if(init.method==='POST'){
    writes.push(path);
    if(path===ROOT+'/versions?bindings_inherit=strict'){
     if(opts.uploadUnknown)throw Error('outcome unknown');
     metadata=JSON.parse(init.body.get('metadata'));assert.equal(init.body.get('worker.js').size,candidate.length);uploaded=true;return {id:uid};
    }
    if(path===ROOT+'/deployments'){
     if(opts.promoteUnknown)throw Error('outcome unknown');
     assert.deepEqual(JSON.parse(init.body),{strategy:'percentage',versions:[{version_id:uid,percentage:100}]});promoted=true;return {id:did};
    }
    throw Error('unexpected write');
   }
   if(path===ROOT+'/deployments')return {deployments:[promoted?next:dep]};
   if(path===ROOT+'/deployments/'+did){if(opts.readbackFail)throw Error('readback');return next;}
   if(path===ROOT+'/versions')return {items:uploaded?[{id:uid},{id:opts.predecessorDrift?'bad':LV15.baseVersion}]:[{id:opts.latestDrift?'bad':LV15.baseVersion}]};
   if(path===ROOT+'/versions/'+LV15.baseVersion)return structuredClone(base);
   if(path===ROOT+'/versions/'+uid){const v=structuredClone(base);v.id=uid;v.resources.script.etag='new';if(opts.bindingDrift)v.resources.bindings[1].text='false';return v;}
   if(path===VERSION_ROOT+'/'+LV15.baseVersion+'?include=modules')return artifact(LV15.baseVersion,original);
   if(path===VERSION_ROOT+'/'+uid+'?include=modules')return artifact(uid,opts.uploadedBytesDrift?'changed':candidate,opts.annotationDrift?{}:metadata.annotations);
   if(path===ROOT+'/script-settings')return {logpush:false};
   if(path===ROOT+'/schedules')return {schedules:[{cron:'2 21 * * *'},{cron:'*/5 * * * *'}]};
   if(path===ROOT+'/subdomain')return {enabled:true,previews_enabled:false};
   if(path==='/zones/'+ZONE+'/workers/routes')return [{pattern:'mmdbkk.com/member/*',script:'member-dashboard-chat-worker'}];
   throw Error('unexpected read '+path);
  }};
 return {io,requests,writes,receipts,get metadata(){return metadata;},get approvals(){return approvals;}};
}

test('LV15 adds one constant and two unique HTML edits, leaving runtime text intact',()=>{
 const s=candidate.toString();assert.match(s,/const MY_MMD_LIFF_LV15_CSS = /);
 assert.match(s,/data-brand-audience="unresolved" data-mmd-liff-level="15"/);
 assert.ok(s.endsWith('keep all member logic unchanged ✓`);}};\n'));
 assert.equal(s.match(/export default/g).length,1);validateLv15Syntax(candidate);
});
test('source and active baseline pins are fixed to the reviewed release',()=>{
 assert.equal(LV15.cssSha256,'09f9f8685838f9e2efbb2b0ea2933f2d9ce3f954d3d23ca52a001db066b2ac3a');
 assert.equal(LV15.baselineSha256,'7a689cb8372fe6f5ce1d08b0b450af8f589ede5fb5c9ac94eb8f31ef5599adf1');
 assert.throws(()=>buildLv15Artifact(artifact(LV15.baseVersion,original)),/hash drift/);
});
for(const [label,text] of [['missing',original.replace('${MY_MMD_SIGIL_PRIVATE_CSS}','x')],['duplicate',original+original],['already patched',candidate.toString()]])
 test('reject '+label+' anchors',()=>assert.throws(()=>patchLv15Text(text)));
test('reject unknown module, module hash and invalid base64',()=>{
 const a=artifact(uid,candidate);decodeLv15Module(a,uid,candidateHash);
 assert.throws(()=>decodeLv15Module({...a,main_module:'other.js'},uid,candidateHash));
 assert.throws(()=>decodeLv15Module({...a,modules:[...a.modules,...a.modules]},uid,candidateHash));
 assert.throws(()=>decodeLv15Module(a,uid,'0'.repeat(64)));
 a.modules[0].content_base64+='!';assert.throws(()=>decodeLv15Module(a,uid,candidateHash));
});
test('happy path checks approval three times and inherits every binding without config writes',async()=>{
 const f=fixture();const result=await releaseLv15(f.io);assert.equal(result.phase,'complete');assert.equal(f.approvals,3);
 assert.deepEqual(f.writes,[ROOT+'/versions?bindings_inherit=strict',ROOT+'/deployments']);
 assert.deepEqual(f.metadata.bindings.map(x=>x.type),Array(4).fill('inherit'));
 assert.equal(f.metadata.annotations['workers/commit_sha'],undefined);
 assert.equal(f.metadata.main_module,'worker.js');assert.equal(f.metadata.migrations,undefined);
 assert.equal(result.candidateSha256,candidateHash);
});
for(const [n,posts] of [[1,0],[2,0],[3,1]])test('owner denial '+n+' stops with '+posts+' writes',async()=>{
 const f=fixture({deny:n});await assert.rejects(releaseLv15(f.io));assert.equal(f.writes.length,posts);assert.equal(f.receipts.at(-1).phase,'stopped');
});
for(const [name,posts] of [['latestDrift',0],['syntaxError',0],['bindingDrift',1],['uploadedBytesDrift',1],['annotationDrift',1],['predecessorDrift',1]])
 test(name+' fails closed without promotion',async()=>{const f=fixture({[name]:true});await assert.rejects(releaseLv15(f.io));assert.equal(f.writes.length,posts);});
for(const [name,phase,posts] of [['uploadUnknown','upload-attempted-outcome-unknown',1],['promoteUnknown','promotion-attempted-outcome-unknown',2],['readbackFail','promotion-attempted-outcome-unknown',2]])
 test(name+' is journaled without retry or rollback',async()=>{const f=fixture({[name]:true});await assert.rejects(releaseLv15(f.io));assert.equal(f.writes.length,posts);assert.equal(f.receipts.at(-1).stoppedAfter,phase);});
test('incorrect expected active version is rejected before any Cloudflare request',async()=>{
 const f=fixture();f.io.expectedVersion=uid;await assert.rejects(releaseLv15(f.io));assert.equal(f.requests.length,0);
});
test('the real CLI retains mandatory owner approval and protected environment policy',()=>{
 const source=readFileSync(new URL('./member-pages-lv15-artifact.mjs',import.meta.url),'utf8');
 assert.match(source,/await verifyOwnerApproval\(process.env\)/);assert.match(source,/inspectLv15Checkout\(sha\)/);
 assert.match(source,/assert.equal\(process.env.PRODUCTION_APPROVED,'true'\)/);
 const gate=readFileSync(new URL('./member-pages-owner-approval.mjs',import.meta.url),'utf8');
 assert.match(gate,/assert.equal\(p.can_admins_bypass, false\)/);
 assert.match(gate,/exactly one owner approval receipt required/);
});
