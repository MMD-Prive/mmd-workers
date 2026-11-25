import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {partnerModelsPage} from '../src/partner-models-page.js';

async function identity(reply, hash = '#p=account-token') {
 const calls=[];
 const dom=new JSDOM(partnerModelsPage,{url:'https://mmdbkk.com/partner/models'+hash,runScripts:'dangerously',beforeParse(w){
  w.fetch=async (url)=>{calls.push(url);return Response.json(reply,{status:reply.ok?200:401});};
 }});
 await new Promise(resolve=>setTimeout(resolve,20));
 return {dom,calls,d:dom.window.document,w:dom.window};
}
test('identity shows only the verified account and removes fragment credentials',async()=>{
 const x=await identity({ok:true,partner_name:'TarT <test>',partner_id:'recTEST'});
 try{assert.equal(x.d.getElementById('partnerAccountName').textContent,'TarT <test>');assert.equal(x.d.getElementById('partnerAccountName').children.length,0);assert.match(x.d.getElementById('partnerAccountStatus').textContent,/ยืนยันบัญชีแล้ว/);assert.equal(x.w.location.hash,'');assert.equal(x.calls.length,1);assert.match(x.calls[0],/^\/v1\/partner\/verify\?t=/);assert.equal(x.d.getElementById('workspace').hidden,true);}finally{x.dom.window.close();}
});
test('invalid account is cleared without inventing a user or authorizing model access',async()=>{
 const x=await identity({ok:false,partner_name:'Untrusted'});
 try{assert.equal(x.d.getElementById('partnerAccountName').textContent,'ยังไม่ได้ยืนยันบัญชี');assert.equal(x.w.sessionStorage.getItem('mmd-partner-models-account'),null);assert.equal(x.d.getElementById('workspace').hidden,true);}finally{x.dom.window.close();}
});
test('a job title or caller supplied name is not treated as account identity',async()=>{
 const x=await identity({ok:true},'#name=Pero');
 try{assert.equal(x.calls.length,0);assert.equal(x.d.getElementById('partnerAccountName').textContent,'ยังไม่ได้ยืนยันบัญชี');}finally{x.dom.window.close();}
});
