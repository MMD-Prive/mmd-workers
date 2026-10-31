import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchCheckoutHtml,decorateCheckoutResponse,createCheckoutPresentation} from './renewal-checkout-response.mjs';
const original=readFileSync(new URL('./fixtures/checkout-footer-before.html',import.meta.url),'utf8');
const candidate=readFileSync(new URL('../../webflow/pay/checkout/footer.html',import.meta.url),'utf8');
test('response patch produces exactly the reviewed footer; missing or duplicate anchors stop',()=>{
 assert.equal(patchCheckoutHtml(original),candidate);assert.equal(patchCheckoutHtml(candidate),null);assert.equal(patchCheckoutHtml(original+original),null);assert.equal(patchCheckoutHtml('other page'),null);
});
test('HTML response decoration preserves cookies and refuses CSP, errors and non-HTML',async()=>{
 const upstream=new Response(original,{headers:{'content-type':'text/html','set-cookie':'fixture=1; Secure','etag':'old'}});
 const result=await decorateCheckoutResponse(upstream);assert.equal(await result.text(),candidate);assert.equal(result.headers.get('set-cookie'),'fixture=1; Secure');assert.equal(result.headers.get('etag'),null);assert.equal(result.headers.get('cache-control'),'no-store');
 for(const response of [new Response(original,{headers:{'content-type':'text/html','content-security-policy':"script-src 'self'"}}),new Response('error',{status:500}),new Response('{}',{headers:{'content-type':'application/json'}})])assert.equal(await decorateCheckoutResponse(response),response);
});
test('only exact checkout GET is decorated; existing Renewal and all API/POST paths remain delegated',async()=>{
 const calls=[];const preserved=new Response('existing LV12',{headers:{'x-mmd-renewal-version':'LV12'}});
 const worker=createCheckoutPresentation({async fetch(r){calls.push(['existing',new URL(r.url).pathname]);return preserved;}},async r=>{calls.push(['origin',r.method]);return new Response(original,{headers:{'content-type':'text/html'}});});
 for(const host of ['mmdbkk.com','www.mmdbkk.com']){const response=await worker.fetch(new Request('https://'+host+'/pay/checkout?t=fixture'));assert.equal(response.headers.get('x-mmd-renewal-checkout-ui'),'pending-finish-v1');}
 for(const [path,method] of [['/member/renewal','GET'],['/pay/checkout-more','GET'],['/pay/checkout','POST'],['/v1/pay/slip/evidence','POST']])assert.equal(await worker.fetch(new Request('https://mmdbkk.com'+path,{method})),preserved);
 assert.equal(calls.filter(c=>c[0]==='origin').length,2);
});
