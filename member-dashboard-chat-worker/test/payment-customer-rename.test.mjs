import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPaymentCustomerRename } from '../src/payment-proof-intelligence.mjs';
const uid='U1234567890abcdef1234567890abcdef', client='recClient';
const row=()=>({id:'recStaging',fields:{'LINE User ID':uid,'Import ID':'line_ofc_per_rename_v1_'+uid.toLowerCase(),'Source Hash':'a'.repeat(64),'Canonical Client':[client],'Current LINE Rename':'โต 27 กพ 68'}});
test('exact LINE plus single canonical Client and import provenance gives display-only rename',()=>{
  assert.deepEqual(projectPaymentCustomerRename([row()],uid,client),{per_rename:'โต 27 กพ 68',rename_source:'exact_line_client_per_rename_v1',rename_record_id:'recStaging'});
});
test('conflict, duplicate, wrong LINE, unbound Client and missing provenance fail closed',()=>{
  for(const fields of [{'LINE User ID':'U'+'f'.repeat(32)},{'Canonical Client':[]},{'Canonical Client':[client,'other']},{'Import ID':'contact_snapshot'},{'Source Hash':''}]) {
    const r=row(); Object.assign(r.fields,fields); assert.equal(projectPaymentCustomerRename([r],uid,client),null);
  }
  assert.equal(projectPaymentCustomerRename([row(),row()],uid,client),null);
  assert.equal(projectPaymentCustomerRename([],uid,client),null);
});
