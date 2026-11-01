import test from 'node:test';
import assert from 'node:assert/strict';
import { ingressMetadata,ingressTransport,ROOT } from './kenji-owner-ingress-overlay.mjs';
test('ingress upload retains assets and inherits all bindings without exposing secrets',()=>{
 const v={resources:{script:{},script_runtime:{compatibility_date:'2026-03-25',usage_model:'standard',assets:{serve_directly:true}},bindings:[{name:'ASSETS',type:'assets'},{name:'SECRET',type:'secret_text'}]}};
 const m=ingressMetadata(v,'a'.repeat(40));assert.equal(m.keep_assets,true);assert.deepEqual(m.bindings,[{name:'ASSETS',type:'inherit'},{name:'SECRET',type:'inherit'}]);assert.equal(v.resources.script_runtime.assets.serve_directly,true);
 assert.throws(()=>ingressMetadata({resources:{...v.resources,script_runtime:{compatibility_date:'2026-03-25'}}},'a'.repeat(40)));
});
test('ingress transport rejects routes, secrets, settings writes and other Workers before network',async()=>{
 const call=ingressTransport('fixture',()=>{throw Error('network must not run');});
 for(const [method,path]of[['PUT',ROOT],['PATCH',ROOT+'/settings'],['POST',ROOT+'/secrets'],['GET',ROOT.replace('immigrate-worker','admin-worker')+'/deployments']])await assert.rejects(call(path,{method}),/outside ingress/);
});
