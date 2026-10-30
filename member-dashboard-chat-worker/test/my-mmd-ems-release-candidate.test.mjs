import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
// Same fetch implementation as guide-notification-entry; RPC exports require workerd.
import worker from "../src/my-mms-customer-front-gate-entry.js";
import frontGate from "../src/my-mmd-lovable-app-front-gate.js";
import { handleLiffMemberShell } from "../../member-pages-worker/src/liff-member-shell.js";

test('EMs front gate selects only registered login index/detail return targets',async()=>{
 const runtime={MEMBER_PAGES_WORKER:{fetch:async()=>new Response('<html><head></head><body><script nonce="test">const target = "/member/my-mmd";</script></body></html>',{headers:{'content-type':'text/html'}})}};
 for(const [query,expected] of [
  ['intent=status&view=ems_albums','/my-mmd/ems'],
  ['intent=status&view=ems_albums&album=ems23-b2854abc264c','/my-mmd/ems/ems23-b2854abc264c'],
  ['liff.state='+encodeURIComponent('?intent=status&view=ems_albums&album=ems23-b2854abc264c'),'/my-mmd/ems/ems23-b2854abc264c'],
  ['intent=status&view=ems_albums&album=https://evil.example','/my-mmd/ems']]){
  const r=await frontGate.fetch(new Request('https://www.mmdbkk.com/member/liff?'+query),runtime);
  assert.equal(r.headers.get('x-mmd-liff-return-target'),expected);
  assert.ok((await r.text()).includes('const target='+JSON.stringify(expected)));
 }
});

test('current Digital Home shell resumes EMs only after authenticated API response',async()=>{
 const request=new Request('https://www.mmdbkk.com/member/liff?intent=status&view=ems_albums');
 const r=await worker.fetch(request,{MEMBER_PAGES_WORKER:{fetch:req=>handleLiffMemberShell(req,{})}});
 const html=await r.text();
 const script=html.match(/<script nonce="([^"]+)" id="mmd-ems-login-return">([\s\S]*?)<\/script>/);
 assert.ok(script);assert.ok(r.headers.get('content-security-policy').includes("'nonce-"+script[1]+"'"));
 for(const [response,expected] of [[Response.json({ok:false,error:'LOGIN_REQUIRED'},{status:401}),false],[Response.json({ok:false},{status:503}),false],[Response.json({ok:true,albums:[]}),true],[Response.json({ok:false,error:'VIP_REQUIRED'},{status:403}),true]]){
  let destination=null,timer=null;
  const context={fetch:async()=>response,location:{replace:url=>destination=url},clearTimeout(){},setTimeout:fn=>{timer=fn},addEventListener(){},document:{addEventListener(){},getElementById:()=>null}};
  vm.runInNewContext(script[2],context);await new Promise(setImmediate);
  assert.equal(destination,expected?'/my-mmd/ems':null);assert.equal(Boolean(timer),!expected);
 }
});


test("live album API preserves upstream denial and configured owner without granting access", async () => {
  for (const host of ["mmdbkk.com", "www.mmdbkk.com"]) {
    for (const path of ["/api/member/app/ems-albums", "/api/member/app/ems-albums/ems1-123456789abc"]) {
      for (const status of [401, 403, 503]) {
        let seen;
        const request = new Request("https://" + host + path);
        const response = await worker.fetch(request, { MEMBER_PAGES_WORKER: { fetch: async req => {
          seen = req;
          return Response.json({ ok: false }, { status, headers: { "cache-control": "private, no-store" } });
        } } });
        assert.equal(response.status, status);
        assert.equal(seen.url, request.url);
        assert.match(response.headers.get("cache-control"), /no-store/);
      }
    }
  }
  const missing = await worker.fetch(new Request("https://www.mmdbkk.com/api/member/app/ems-albums"), {});
  assert.equal(missing.status, 503);
});

test("public fetch implementation serves live index/detail with compact thumbnails", async () => {
  for (const suffix of ["", "/", "/ems1-123456789abc"]) {
    const response = await worker.fetch(new Request("https://www.mmdbkk.com/my-mmd/ems" + suffix), {});
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const html = await response.text();
    assert.match(html, /grid-template-columns:repeat\(3/);
    assert.match(html, /repeat\(5/);
    assert.match(html, /object-fit:cover/);
  }
});
