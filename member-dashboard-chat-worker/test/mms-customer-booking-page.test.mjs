import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isMmsCustomerBookingPage,handleMmsCustomerBookingPage} from '../src/mms-customer-booking-page.mjs';
import {handleMyMmsCustomerAsset} from '../src/my-mms-customer-app-front-gate.js';
const request=(suffix='',init)=>new Request('https://www.mmdbkk.com/male-massage/member/mms-booking'+suffix,init);
test('only exact booking path, slash and LINE query are intercepted',()=>{
 for(const suffix of ['', '/', '?liff.state=x'])assert.ok(isMmsCustomerBookingPage(request(suffix)));
 for(const suffix of ['/other','-extra'])assert.equal(isMmsCustomerBookingPage(request(suffix)),false);
});
test('static presentation never receives account cookie, auth or query',async()=>{
 let sent;const response=await handleMmsCustomerBookingPage(request('?account=private',{headers:{cookie:'test=value',authorization:'fixture'}}),{MMS_CUSTOMER_UI:{fetch:async r=>{sent=r;return new Response('<html>booking</html>',{headers:{'content-type':'text/html','set-cookie':'unexpected=value'}});}}});
 assert.equal(sent.url,'https://mms-customer-ui.internal/booking/index.html');assert.equal(sent.headers.get('cookie'),null);assert.equal(sent.headers.get('authorization'),null);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.status,200);
});
test('failure or non-HTML never becomes a successful booking page',async()=>{
 for(const binding of [undefined,{fetch:async()=>{throw Error('fixture')}},{fetch:async()=>new Response('bad',{status:503})},{fetch:async()=>Response.json({ok:true})}])assert.equal((await handleMmsCustomerBookingPage(request(),{MMS_CUSTOMER_UI:binding})).status,503);
});
test('HEAD has no body and writes never reach presentation',async()=>{
 let count=0;const env={MMS_CUSTOMER_UI:{fetch:async()=>{count++;return new Response(null,{headers:{'content-type':'text/html'}});}}};
 assert.equal(await(await handleMmsCustomerBookingPage(request('',{method:'HEAD'}),env)).text(),'');
 assert.equal((await handleMmsCustomerBookingPage(request('',{method:'POST'}),env)).status,405);assert.equal(count,1);
});
test('booking runtime uses existing asset route without forwarding account',async()=>{
 let url;const r=await handleMyMmsCustomerAsset(new Request('https://www.mmdbkk.com/male-massage-assets/booking/core-1.js'),{MMS_CUSTOMER_UI:{fetch:async req=>{url=req.url;return new Response('/* actual runtime */',{headers:{'content-type':'application/javascript'}});}}});assert.equal(new URL(url).pathname,'/booking/core-1.js');assert.equal(r.status,200);
});
