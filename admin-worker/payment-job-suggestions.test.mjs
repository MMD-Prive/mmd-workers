import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { PAYMENT_JOB_SUGGESTIONS_SCRIPT } from './src/payment-job-suggestions.mjs';
const suggestPaymentJobs = vm.runInNewContext('(' + PAYMENT_JOB_SUGGESTIONS_SCRIPT + ')');
const job = (id, amount, overrides = {}) => ({session_id:id,client_record_id:'client',customer_name:'ลูกค้า',model_name:'น้อง',job_date:'2026-10-25',payments:[{payment_ref:'p-'+id,payment_stage:'final',expected_amount_thb:amount,state:'waiting_proof',has_evidence:false}],...overrides});
test('exact balance precedes near amount and dates break equal-amount ties',()=>{
 const rows=[job('near',12400),job('old',12500,{job_date:'2026-01-01'}),job('today',12500),job('far',20000)];
 assert.deepEqual(Array.from(suggestPaymentJobs(rows,12500,'2026-10-25T13:07:00Z'),x=>x.session_id),['today','old','near']);
 assert.equal(suggestPaymentJobs(rows,12500)[2].difference_thb,100);
});
test('requires known absence of evidence and excludes settled, cancelled, ambiguous and unsupported jobs',()=>{
 const eligible=job('ok',12500);
 const rows=[eligible,job('cancelled',12500,{cancelled:true}),job('client-unknown',12500,{client_record_id:null})];
 for(const [field,value] of [['has_evidence',true],['has_evidence',undefined],['state','paid'],['state','proof_pending'],['state','needs_review'],['payment_stage','membership']]){
  const j=job(field+String(value),12500);j.payments[0][field]=value;rows.push(j);
 }
 assert.deepEqual(Array.from(suggestPaymentJobs(rows,12500),x=>x.session_id),['ok']);
});
test('compares payment-stage amount, preserves multiple stages, and bounds near matching',()=>{
 const j=job('stages',12500);j.service_amount_thb=20000;j.payments.push({...j.payments[0],payment_ref:'deposit',payment_stage:'deposit',expected_amount_thb:12000});
 const result=suggestPaymentJobs([j],12500);assert.equal(result.length,2);assert.equal(result[0].payment_stage,'final');assert.equal(result[1].difference_thb,500);
 assert.equal(suggestPaymentJobs([job('too-far',97000)],100000).length,0);
 assert.equal(suggestPaymentJobs([job('cents',12500.01)],12500)[0].exact,false);
 assert.equal(suggestPaymentJobs([j],NaN).length,0);
});
