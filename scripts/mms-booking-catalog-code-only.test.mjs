import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {repairBookingCatalog} from './mms-booking-catalog-code-only.mjs';
const source = await readFile(new URL('../member-dashboard-chat-worker/src/my-mms-customer-app-front-gate.js', import.meta.url),'utf8');
const begin=source.indexOf('  if (path.startsWith(`${CUSTOMER_API_BASE}/booking/`))'), end=source.indexOf('  if (path === `${CUSTOMER_API_BASE}/chat`',begin);
const broken=source.slice(begin,end).replace(/\bjson\(/g,'json11(');
const prefix='/* preserved prefix */\n', suffix='  if (path === `${CUSTOMER_API_BASE}/chat`) {}\n/* preserved suffix */';
function execute(block, request, env){return new Function('request','env','readMemberProfile','json11','methodNotAllowed',`return (async()=>{const path=new URL(request.url).pathname,method=request.method,CUSTOMER_API_BASE='/api/mms/app';${block}})()`)(request,env,async()=>({status:200,data:{displayName:'Fixture',memberRef:'mmsmem_'+'a'.repeat(32)}}),(p,s=200)=>Response.json(p,{status:s}),()=>new Response(null,{status:405}));}
for(const action of ['catalog','service-zones'])test('assembled '+action+' reads real Response method and preserves surrounding code',async()=>{
 const request=new Request('https://fixture.test/api/mms/app/booking/'+action);
 const payload={ok:true,data:action==='catalog'?{skills:[{code:'fixture'}],zones:[]}:{provinces:[{code:'fixture'}],zones:[]}};
 const env={MMS_WORKER:{fetch:async r=>{assert.equal(r.url,'https://mms.internal/mms/api/'+action);assert.equal(r.headers.get('cookie'),null);return Response.json(payload);}}};
 assert.equal((await execute(broken,request,env)).status,503);
 const output=repairBookingCatalog(prefix+broken+suffix,source);
 assert.ok(output.startsWith(prefix));assert.ok(output.endsWith(suffix));assert.ok(output.includes('upstream.json()'));assert.ok(!output.includes('upstream.json11()'));
 assert.deepEqual(await(await execute(output.slice(prefix.length,-suffix.length),request,env)).json(),payload);
});
test('unknown baseline refuses repair',()=>assert.throws(()=>repairBookingCatalog(source,source),/defect absent/));
