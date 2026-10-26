import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'admin-route-recovery-'));
await build({entryPoints:[new URL('../src/customer-360-live-ingress-wrapper.ts',import.meta.url).pathname],outfile:join(dir,'worker.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const {default:worker}=await import(pathToFileURL(join(dir,'worker.mjs')));
test.after(()=>rm(dir,{recursive:true,force:true}));
test('customer queue reaches canonical admin session validation before reading Airtable',async()=>{
 const original=globalThis.fetch;let gates=0,reads=0;
 globalThis.fetch=async input=>{assert.match(String(input),/^https:\/\/api.airtable.com\//);reads++;return Response.json({records:[]})};
 try{const res=await worker.fetch(new Request('https://www.mmdbkk.com/v1/admin/customer-data/queue',{headers:{cookie:'mmd_admin_gate_v1=test'}}),{AIRTABLE_API_KEY:'test-only',ADMIN_WORKER:{fetch:async r=>{assert.equal(new URL(r.url).pathname,'/v1/admin/auth/me');assert.equal(r.headers.get('cookie'),'mmd_admin_gate_v1=test');gates++;return Response.json({ok:true})}}});assert.equal(res.status,200);assert.equal((await res.json()).ok,true);assert.equal(gates,1);assert.equal(reads,1)}finally{globalThis.fetch=original}
});
test('invalid session and mock query cannot open customer queue',async()=>{
 const res=await worker.fetch(new Request('https://www.mmdbkk.com/v1/admin/customer-data/queue?mock=1'),{ADMIN_WORKER:{fetch:async()=>new Response(null,{status:401})}});assert.equal(res.status,302);assert.match(res.headers.get('location'),/internal\/admin\/login/);
});
test('customer mutation rejects a cross-origin browser before reading or writing',async()=>{const res=await worker.fetch(new Request('https://www.mmdbkk.com/v1/admin/customer-data/backfill/start',{method:'POST',headers:{origin:'https://evil.example'}}),{});assert.equal(res.status,403);assert.equal((await res.json()).error,'forbidden_origin')});

test('authenticated customer page renders the customer directory without mock bypass',async()=>{const res=await worker.fetch(new Request('https://www.mmdbkk.com/internal/admin/customer-data',{headers:{cookie:'mmd_admin_gate_v1=test'}}),{ADMIN_WORKER:{fetch:async()=>Response.json({ok:true})}});assert.equal(res.status,200);const html=await res.text();assert.match(html,/Customer 360/);assert.match(html,/id="results"|class="c360"/);assert.doesNotMatch(html,/ownerLoginForm/)});
