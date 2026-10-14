import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { readFileSync } from 'node:fs';
import { renderMmsAdminPage } from './src/mms-admin-page.js';
import { wireMmsApproveUi } from './src/mms-admin-approve-ui.js';
import { wireMmsAdminMobileBundle } from './src/mms-admin-mobile-bundle.js';
import { wireMmsJobsUi } from './src/mms-admin-jobs-ui.js';
import { wireMmsWorkspaceUi } from './src/mms-admin-workspace-ui.js';
test('production admin assembly exposes live work data and syntax-valid readiness/invite/test controls',()=>{
 const page=wireMmsWorkspaceUi(wireMmsJobsUi(wireMmsAdminMobileBundle(wireMmsApproveUi(renderMmsAdminPage()))));
 assert.match(page,/งานจาก MMS Jobs \/ Offers/);assert.match(page,/issue_access_invite:true/);assert.match(page,/prepared_job_id/);assert.match(page,/!t.can_test/);assert.match(page,/u.hash='invite='/);assert.equal(wireMmsWorkspaceUi(page),page);
 for(const m of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new Script(m[1]));
});
test('new work APIs are routed only after admin authentication and through MMS service binding',()=>{
 const source=readFileSync(new URL('./src/mms-admin-runtime.js',import.meta.url),'utf8');
 assert.ok(source.indexOf('if (!adminAuthenticated)')<source.indexOf('`${API_PREFIX}/test-jobs`'));
 assert.match(source,/proxyJson\(request, env, "\/internal\/mms\/admin\/workspace"\)/);
 assert.match(source,/proxyJson\(request, env, "\/internal\/mms\/admin\/test-jobs"\)/);
});

test('approved MMS logo serves exact original bytes behind existing admin authentication',async()=>{
 const {createHash}=await import('node:crypto');
 const {MMS_LOGO_PATH,MMS_LOGO_SHA256}=await import('./src/mms-internal-logo-asset.mjs');
 const {handleMmsAdminRequest,isMmsAdminRequest}=await import('./src/mms-admin-runtime.js');
 const url='https://www.mmdbkk.com'+MMS_LOGO_PATH,env={ADMIN_BEARER:'synthetic-logo-test'};
 assert.equal(isMmsAdminRequest(MMS_LOGO_PATH),true);
 assert.equal((await handleMmsAdminRequest(new Request(url),env)).status,401);
 const response=await handleMmsAdminRequest(new Request(url,{headers:{authorization:'Bearer synthetic-logo-test'}}),env);
 assert.equal(response.headers.get('content-type'),'image/png');
 const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,613401);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'4ed6770759e92887e9c6c8eec7941ccb28fa58dd332fe44fea1e06511a9fb5b6');
 assert.equal(response.headers.get('etag'),'"'+MMS_LOGO_SHA256+'"');
 const head=await handleMmsAdminRequest(new Request(url,{method:'HEAD',headers:{authorization:'Bearer synthetic-logo-test'}}),env);
 assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal((await handleMmsAdminRequest(new Request(url,{method:'POST',headers:{authorization:'Bearer synthetic-logo-test'}}),env)).status,405);
});

test('Internal MMS uses approved branding while shared Partner page retains SIGIL and current theme',async()=>{
 const {withMmsInternalBranding}=await import('./src/mms-internal-branding.mjs');
 const {renderRelaxSpaPage}=await import('./src/relax-spa-page.js');
 for(const html of [renderMmsAdminPage(),withMmsInternalBranding(renderRelaxSpaPage())]){
  assert.match(html,/data-mms-theme="white-green-v1"/);
  assert.match(html,/class="mms-ai-brand"/);assert.match(html,/alt="Male Massage AI"/);
  assert.match(html,/width="1983" height="793"/);assert.match(html,/height:auto/);assert.match(html,/object-fit:contain/);
  assert.doesNotMatch(html,/<span class="brand">SĪGIL/);
 }
 const partner=renderRelaxSpaPage({partner:true});assert.match(partner,/SĪGIL \| SYSTEM/);assert.doesNotMatch(partner,/mms-ai-brand|male-massage-ai\./);
});
