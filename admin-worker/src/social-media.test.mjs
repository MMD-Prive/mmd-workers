import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleSocialMedia,isSocialMediaRequest} from './social-media.js';
import {createCredentialBoundAdminSession} from './credential-bound-admin-session.js';
globalThis.crypto ||= webcrypto;
const env = {ADMIN_LOGIN_CREDENTIAL:'test-credential',ADMIN_SESSION_SECRET:'test-secret'};
const base = 'https://mmdbkk.com/internal/admin/social-media';
async function request(role='admin',method='GET',url=base) { const token=await createCredentialBoundAdminSession(new Request(base),{id:'per',role},env); return new Request(url,{method,headers:{cookie:'mmd_admin_gate_v1='+token}}); }
test('exact route including trailing slash only',()=>{assert.ok(isSocialMediaRequest(new Request(base+'/')));assert.equal(isSocialMediaRequest(new Request(base+'-other')),false);});
test('anonymous redirects to admin login',async()=>{const r=await handleSocialMedia(new Request(base),env);assert.equal(r.status,303);assert.ok(r.headers.get('location').includes('/internal/admin/login'));});
test('partner cannot read owner composer',async()=>{assert.equal((await handleSocialMedia(await request('mms_partner'),env)).status,403);});
test('admin page is private and nonce protected',async()=>{const r=await handleSocialMedia(await request(),env);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);const html=await r.text();assert.match(html,/Telegram Preview/);assert.match(html,/indexedDB/);assert.ok(!html.includes('test-secret'));const js=html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)[1];assert.doesNotThrow(()=>new Function(js));});
test('HEAD has no body and mutation is rejected',async()=>{assert.equal(await (await handleSocialMedia(await request('owner','HEAD'),env)).text(),'');assert.equal((await handleSocialMedia(await request('admin','POST'),env)).status,405);});
test('unapproved origins denied',async()=>{assert.equal((await handleSocialMedia(await request('admin','GET','https://evil.example/internal/admin/social-media'),env)).status,403);});
