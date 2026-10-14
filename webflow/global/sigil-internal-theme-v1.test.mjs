import test from 'node:test';
import assert from 'node:assert/strict';
import { usesSilverWorkspace, decorateInternalSilverTheme } from './sigil-internal-theme-v1.mjs';
const html='<html lang="th"><head><title>Internal</title></head><body><main>Workspace</main></body></html>';
const response=()=>new Response(html,{headers:{'content-type':'text/html','cache-control':'no-store','content-security-policy':"default-src 'self'",'set-cookie':'existing=unchanged; Secure'}});
test('internal spaces share silver while all job creation/broadcast aliases retain colors',()=>{
  for(const p of ['/internal/admin/dashboard','/internal/admin/payments','/internal/admin/mms','/internal/admin/kenji','/internal/ceo/models'])assert.equal(usesSilverWorkspace(p),true);
  for(const p of ['/','/member/dashboard','/internal/admin/jobs/create-job','/internal/admin/jobs/create-job/','/internal/admin/jobs/create-session','/internal/admin/jobs/job-board'])assert.equal(usesSilverWorkspace(p),false);
});
test('theme decoration preserves the backend cookie, CSP and no-store policy',async()=>{
  const r=await decorateInternalSilverTheme(new Request('https://www.mmdbkk.com/internal/admin/payments'),response());
  const text=await r.text();assert.match(text,/data-sigil-internal-theme="silver-orange-v1"/);assert.match(text,/sigil-internal-silver-v1/);
  assert.equal(r.headers.get('set-cookie'),'existing=unchanged; Secure');assert.equal(r.headers.get('content-security-policy'),"default-src 'self'");assert.equal(r.headers.get('cache-control'),'no-store');
});
test('job page gets branding without any workspace color overrides',async()=>{
  const r=await decorateInternalSilverTheme(new Request('https://www.mmdbkk.com/internal/admin/jobs/create-job?mode=broadcast'),response());
  const text=await r.text();assert.doesNotMatch(text,/data-sigil-internal-theme="silver-orange-v1"/);assert.doesNotMatch(text,/#e5e7eb/);assert.match(text,/data-sigil-brand/);
});
test('API responses, public pages, redirects and unauthorized responses are untouched',async()=>{
  for(const [path,r] of [['/v1/admin/dashboard',Response.json({ok:true})],['/member/dashboard',response()],['/internal/admin/dashboard',new Response('login',{status:401})],['/internal/admin/dashboard',Response.redirect('https://example.com')]]){
    assert.equal(await decorateInternalSilverTheme(new Request('https://www.mmdbkk.com'+path),r),r);
  }
});

test('nonce-protected pages reuse their existing nonce without weakening CSP',async()=>{
  const source = new Response(html.replace('</body>', '<script nonce="test-nonce">void 0</script></body>'), {headers:{'content-type':'text/html','content-security-policy':"script-src 'nonce-test-nonce'; style-src 'nonce-test-nonce'"}});
  const r=await decorateInternalSilverTheme(new Request('https://www.mmdbkk.com/internal/admin/private-media/review'),source);
  assert.match(await r.text(), /id="sigil-internal-silver-v1" nonce="test-nonce"/);
  assert.equal(r.headers.get('content-security-policy'), "script-src 'nonce-test-nonce'; style-src 'nonce-test-nonce'");
});
