import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { readFileSync } from 'node:fs';
import { renderMmsAdminPage } from './src/mms-admin-page.js';
import { wireMmsApproveUi } from './src/mms-admin-approve-ui.js';
import { wireMmsAdminMobileBundle } from './src/mms-admin-mobile-bundle.js';
import { wireMmsJobsUi } from './src/mms-admin-jobs-ui.js';
import { wireMmsWorkspaceUi } from './src/mms-admin-workspace-ui.js';
test('production admin assembly exposes live work data and syntax-valid readiness/invite controls without test-job creation',()=>{
 const page=wireMmsWorkspaceUi(wireMmsJobsUi(wireMmsAdminMobileBundle(wireMmsApproveUi(renderMmsAdminPage()))));
 assert.match(page,/งานจาก MMS Jobs \/ Offers/);assert.match(page,/issue_access_invite:true/);assert.doesNotMatch(page,/prepared_job_id|sendTest|งานทดสอบ|สร้างงานทดสอบ/);assert.match(page,/return !j.is_test/);assert.match(page,/u.hash='invite='/);assert.equal(wireMmsWorkspaceUi(page),page);
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
 for(const html of [withMmsInternalBranding(renderRelaxSpaPage())]){
  assert.match(html,/data-mms-theme="white-green-v1"/);
  assert.match(html,/class="mms-ai-brand"/);assert.match(html,/alt="Male Massage AI"/);
  assert.match(html,/width="1983" height="793"/);assert.match(html,/height:auto/);assert.match(html,/object-fit:contain/);
  assert.doesNotMatch(html,/<span class="brand">SĪGIL/);
 }
 const dashboard=renderMmsAdminPage();
 assert.match(dashboard,/class="mms-ai-brand mms-dashboard-brand"/);
 assert.match(dashboard,/alt="MMS Male Massage" width="500" height="500"/);
 assert.match(dashboard,/692e16d627f53343708d9aec__Logo%20MMS%202025\.webp/);
 assert.match(dashboard,/6a9a47224e8a2b5b9bfeabfd_MMS%20Login\.webp/);
 assert.match(dashboard,/6aa42b070147068d37da9cdb_MMS%20Home%2004\.webp/);
 assert.match(dashboard,/data-mms-dashboard-rebuilt/);
 assert.doesNotMatch(dashboard,/data-mms-dashboard-lv5/);
 const partner=renderRelaxSpaPage({partner:true});assert.match(partner,/SĪGIL \| SYSTEM/);assert.doesNotMatch(partner,/mms-ai-brand|male-massage-ai\./);
});


test('diagnostics launcher lives in the header instead of overlapping the AI Ops corner',()=>{
 const page=wireMmsAdminMobileBundle(wireMmsApproveUi(renderMmsAdminPage()));
 const mast=page.match(/<header class="mast">([\s\S]*?)<\/header>/)?.[1]||'';
 assert.match(mast,/<div class="mms-header-tools">/);
 assert.match(mast,/id="runtime"/);
 assert.match(mast,/id="mmsDiagDock"/);
 assert.equal((page.match(/id="mmsDiagDock"/g)||[]).length,1);
 assert.match(page,/\.mms-diag-dock\{[^}]*position:static/);
 assert.doesNotMatch(page,/\.mms-diag-dock\{[^}]*position:fixed/);
 assert.match(page,/@media\(max-width:767px\)\{#mmsDiagDock\{display:none\}\}/);
 // The existing mobile health control still opens the same diagnostics handler.
 assert.match(page,/if\(healthButton\)healthButton\.addEventListener\('click',function\(\)\{var dock=document\.getElementById\('mmsDiagDock'\);if\(dock\)dock\.click\(\)\}/);
 assert.match(page,/if\(dock\)dock\.onclick=function\(\)\{sheet\.classList\.add\('open'\)/);
 assert.match(page,/background:#0b3827;color:#fff;-webkit-text-fill-color:#fff/);
});
