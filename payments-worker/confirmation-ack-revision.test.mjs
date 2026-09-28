import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfirmTokenRecord,signConfirmToken} from './index.js';
import {handleConfirmationAck} from './confirmation-ack.js';
import {confirmationRevision} from '../shared/confirmation-revision.mjs';

for(const role of ['customer','model'])test(`${role} ACK rejects stale details and pending application before any canonical write`,async t=>{
 const store=new Map(), writes=[];
 const session={id:'recSession',fields:{fldLTq2kZbyRv22IA:'sess1',fldojgjSQLaO0uQLX:'pay1',fld1NL4YdaEQHO2dC:['recChange'],fldIiRpaxoafjTkFt:'New Hotel',fldmwuvOaiCFdzzRa:'Confirmed',fld57fhdWqIcOy4Jp:'confirmed'}};
 const change={id:'recChange',fields:{fldbL2Ya44l6xEYe1:['recSession'],fldMD3Fhu0ibDmjk0:'sess1',fldxg0WIVCmxtdRCF:'location_change',fldcBkBS70bWBgI8A:'applied',fldnnAWYmA0U1q8nX:'2026-09-22T00:00:00Z'}};
 const env={PAYMENT_CONFIRMATION_SIGNING_SECRET:'test-only-ack-secret',PAY_SESSIONS_KV:{put:async(k,v)=>store.set(k,v),get:async k=>store.get(k)},ALLOWED_ORIGINS:'https://www.mmdbkk.com',AIRTABLE_BASE_ID:'base',AIRTABLE_API_KEY:'test',AIRTABLE_HTTP:{fetch:async()=>Response.json({records:[change]})}};
 const iat=Math.floor(Date.now()/1000),claims={kind:`${role}_confirm`,role,session_id:'sess1',payment_ref:'pay1',payment_type:'full',iat,exp:iat+3600};
 const token=await signConfirmToken(claims,env.PAYMENT_CONFIRMATION_SIGNING_SECRET);await createConfirmTokenRecord(env,token,claims);
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
   if(options.method==='PATCH'){const fields=JSON.parse(options.body).fields;writes.push(fields);Object.assign(session.fields,fields);return Response.json(session)}
   return Response.json({records:[session]});
 });
 const post=(revision,expectedRole=role)=>handleConfirmationAck(new Request('https://sigil.mmdbkk.com/v1/confirm/ack',{method:'POST',headers:{origin:'https://www.mmdbkk.com','content-type':'application/json'},body:JSON.stringify({t:token,expected_role:expectedRole,confirmation_revision:revision})}),env);
 for(const revision of [undefined,'0'.repeat(64)]){const r=await post(revision);assert.equal(r.status,409);assert.equal((await r.json()).error,'confirmation_details_changed_reload_required')}
 const revision=(await confirmationRevision(env,session,'sess1')).confirmation_revision;
 change.fields.fldcBkBS70bWBgI8A='approved';assert.equal((await post(revision)).status,409);assert.equal(writes.length,0);
 change.fields.fldcBkBS70bWBgI8A='applied';assert.equal((await post(revision,role==='model'?'customer':'model')).status,401);assert.equal(writes.length,0);
 assert.equal((await post(revision)).status,200);assert.equal(writes.length,1);
 assert.deepEqual(Object.keys(writes[0]),[role==='customer'?'fldJSS5GNN7quJwa8':'fldFgkHXivIAThfDz']);
 assert.equal((await post(revision)).status,200);assert.equal(writes.length,1);
});
