import { Script } from 'node:vm';
import { internalBrandLoader } from './sigil-brand-v1.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { usesSilverWorkspace, decorateInternalSilverTheme, installInternalSilverTheme, silverWorkspaceLoader, SILVER_WORKSPACE_CSS } from './sigil-internal-theme-v1.mjs';
const html='<html lang="th"><head><title>Internal</title></head><body><main>Workspace</main></body></html>';
const response=()=>new Response(html,{headers:{'content-type':'text/html','cache-control':'no-store','content-security-policy':"default-src 'self'",'set-cookie':'existing=unchanged; Secure'}});
test('all internal spaces share white/orange; MMS is the only internal exception',()=>{
  for(const p of ['/internal/admin/dashboard','/internal/admin/payments','/internal/admin/kenji','/internal/ceo/models','/internal','/internal/jobs/create-job','/internal/admin/jobs/create-job','/internal/admin/jobs/create-job/','/internal/admin/jobs/create-session','/internal/admin/create-session','/internal/admin/jobs/job-board','/internal/admin/job-board','/internal/admin/jobs/broadcast','/internal/admin/broadcast-work','/internal/admin/broadcast','/internal/future/page'])assert.equal(usesSilverWorkspace(p),true);
  for(const p of ['/internal/admin/mms','/internal/admin/mms/relax-spa','/','/member/dashboard','/internality/admin','/partner/dashboard/relax-spa'])assert.equal(usesSilverWorkspace(p),false);
});
test('theme decoration preserves the backend cookie, CSP and no-store policy',async()=>{
  const r=await decorateInternalSilverTheme(new Request('https://www.mmdbkk.com/internal/admin/payments'),response());
  const text=await r.text();assert.match(text,/data-sigil-internal-theme="silver-orange-v1"/);assert.match(text,/sigil-internal-silver-v1/);
  assert.equal(r.headers.get('set-cookie'),'existing=unchanged; Secure');assert.equal(r.headers.get('content-security-policy'),"default-src 'self'");assert.equal(r.headers.get('cache-control'),'no-store');
});
test('job page receives the shared visual theme',async()=>{
  const r=await decorateInternalSilverTheme(new Request('https://www.mmdbkk.com/internal/admin/jobs/create-job?mode=broadcast'),response());
  const text=await r.text();assert.match(text,/data-sigil-internal-theme="silver-orange-v1"/);assert.match(text,/#fed7aa/);assert.match(text,/data-sigil-brand/);
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

test('embedded brand script parses with quoted Thai sidebar selector',()=>{assert.doesNotThrow(()=>new Script(internalBrandLoader()));});

test('a pinned loader upgrades an existing Worker style instead of leaving stale dark surfaces',()=>{
  const style={textContent:'old dark style'}, icon={};
  const doc={documentElement:{dataset:{}},getElementById:()=>style,querySelectorAll:()=>[],querySelector:()=>icon};
  installInternalSilverTheme(doc,{pathname:'/internal/admin/dashboard'});
  assert.equal(style.textContent,SILVER_WORKSPACE_CSS);
  installInternalSilverTheme(doc,{pathname:'/internal/admin/jobs/create-job'});
  assert.equal(style.textContent, SILVER_WORKSPACE_CSS);
});

test('Model Link decoration keeps scoped typography, font policy and review behavior intact', async () => {
  const { renderModelLineLinkPageWithAvatar } = await import('../../admin-worker/src/model-line-avatar-review.js');
  const original = renderModelLineLinkPageWithAvatar();
  const before = await original.clone().text();
  const r = await decorateInternalSilverTheme(new Request('https://www.mmdbkk.com/internal/admin/model-link'), original);
  const after = await r.text();
  assert.match(after, /body class="model-line-link-page"/);
  assert.match(after, /font-family:"LINE Seed Sans TH","Noto Sans Thai"/);
  for (const weight of [400, 700, 800]) assert.match(after, new RegExp('font-weight:' + weight + ';font-display:swap;src:url'));
  assert.match(r.headers.get('content-security-policy'), /font-src https:\/\/cdn\.prod\.website-files\.com;/);
  assert.equal(r.headers.get('cache-control'), 'no-store, private');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  const scripts = text => [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.deepEqual(scripts(after), scripts(before), 'theme must preserve the owner review script');
  assert.match(after, /\.model-line-link-page :is\(\.origin-section,\.pill,\.badge,\.folder-tree,\.candidate/);
});


test('MMS responses are returned by identity without reading or altering their HTML', async()=>{
  for(const path of ['/internal/admin/mms','/internal/admin/mms/relax-spa','/internal/admin/mms/new-shop/']) {
    const original=response();
    assert.equal(await decorateInternalSilverTheme(new Request('https://example.com'+path),original),original);
    assert.equal(original.bodyUsed,false);
  }
});
test('non-GET, JSON, CSS and failed internal responses remain untouched', async()=>{
  for(const [method,type,status] of [['POST','text/html',200],['HEAD','text/html',200],['GET','application/json',200],['GET','text/css',200],['GET','text/html',403],['GET','text/html',500]]) {
    const original=new Response('unchanged',{status,headers:{'content-type':type}});
    assert.equal(await decorateInternalSilverTheme(new Request('https://example.com/internal/admin/work',{method}),original),original);
    assert.equal(original.bodyUsed,false);
  }
});
test('generated browser loader executes independently, updates stale CSS and is idempotent',()=>{
  const nodes=new Map(), doc={documentElement:{dataset:{}},head:{appendChild(node){nodes.set(node.id,node)}},createElement(){return {}},getElementById(id){return nodes.get(id)},querySelectorAll(){return []},querySelector(){return {}}};
  const script=new Script(silverWorkspaceLoader());
  const context={document:doc,location:{pathname:'/internal/admin/jobs/create-job'}};
  script.runInNewContext(context);script.runInNewContext(context);
  assert.equal(nodes.size,1);assert.equal(nodes.get('sigil-internal-silver-v1').textContent,SILVER_WORKSPACE_CSS);
  nodes.get('sigil-internal-silver-v1').textContent='stale';script.runInNewContext(context);
  assert.equal(nodes.get('sigil-internal-silver-v1').textContent,SILVER_WORKSPACE_CSS);
});
test('browser loader makes no DOM changes for MMS and public pages',()=>{
  for(const path of ['/internal/admin/mms/relax-spa','/member/dashboard','/partner/dashboard/kalima-massage']) {
    new Script(silverWorkspaceLoader()).runInNewContext({location:{pathname:path},document:new Proxy({},{get(){throw Error('unexpected DOM mutation')}})});
  }
});
test('all declared internal navigation pages receive the theme except MMS',async()=>{
  const {INTERNAL_PAGES}=await import('./sigil-internal-workspace-v3.mjs');
  for(const {path} of INTERNAL_PAGES.filter(x=>x.path.startsWith('/internal/'))) {
    assert.equal(usesSilverWorkspace(path),!path.startsWith('/internal/admin/mms'),path);
  }
});

test('text on the shipped white/orange interaction palette meets 4.5:1 contrast',()=>{
  const lum=hex=>hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
  for(const [fg,bg] of [['272b30','ffffff'],['545c66','ffffff'],['272b30','fed7aa'],['272b30','fdba74'],['272b30','fb923c'],['545c66','edf0f3']]) assert.ok((lum(bg)+.05)/(lum(fg)+.05)>=4.5,fg+' on '+bg);
});
