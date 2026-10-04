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
