import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmationRevision} from './confirmation-revision.mjs';
const session={id:'recSession',fields:{fld1NL4YdaEQHO2dC:['recChange'],fldIiRpaxoafjTkFt:'Hotel'}};
const request={id:'recChange',fields:{fldbL2Ya44l6xEYe1:['recSession'],fldMD3Fhu0ibDmjk0:'sess1',fldxg0WIVCmxtdRCF:'location_change',fldcBkBS70bWBgI8A:'applied',fldnnAWYmA0U1q8nX:'2026-09-22T00:00:00Z'}};
const env=(records=[request],extra={})=>({AIRTABLE_BASE_ID:'base',AIRTABLE_API_KEY:'test',AIRTABLE_HTTP:{fetch:async()=>Response.json({records,...extra})}});
test('unchanged legacy jobs need no new query; digest changes with displayed details, not ACK timestamps',async()=>{
 const s={id:'rec1',fields:{fldIiRpaxoafjTkFt:'Old'}};const a=await confirmationRevision({},s,'sess1');assert.equal(a.confirmation_revision_required,false);s.fields.fldJSS5GNN7quJwa8='now';assert.equal((await confirmationRevision({},s,'sess1')).confirmation_revision,a.confirmation_revision);s.fields.fldIiRpaxoafjTkFt='New';assert.notEqual((await confirmationRevision({},s,'sess1')).confirmation_revision,a.confirmation_revision);
});
test('applied changes require exact displayed revision; approved changes block ACK pending application',async()=>{
 const a=await confirmationRevision(env(),session,'sess1');assert.equal(a.confirmation_revision_required,true);assert.equal(a.confirmation_change_pending,false);const r=structuredClone(request);r.fields.fldcBkBS70bWBgI8A='approved';const b=await confirmationRevision(env([r]),session,'sess1');assert.equal(b.confirmation_change_pending,true);assert.notEqual(a.confirmation_revision,b.confirmation_revision);
});
test('cross-job, unknown status, duplicate and incomplete request reads never permit stale ACK',async()=>{
 for(const records of [[],[request,request],[{...request,fields:{...request.fields,fldMD3Fhu0ibDmjk0:'other'}}],[{...request,fields:{...request.fields,fldcBkBS70bWBgI8A:'unknown'}}]])await assert.rejects(()=>confirmationRevision(env(records),session,'sess1'),/confirmation_changes/);
 await assert.rejects(()=>confirmationRevision(env([request],{offset:'next'}),session,'sess1'),/confirmation_changes_unavailable/);
});
