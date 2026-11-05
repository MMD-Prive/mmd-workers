import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {REPORT_FIELDS,reportFieldMap,readSessionReport,reportVerifiedFields} from './session-report-projection.js';
const mapping=JSON.parse(fs.readFileSync(new URL('../release/my-model-console/session-report-mapping.json',import.meta.url)));
const map=Object.fromEntries(mapping.fields.map((f,i)=>[f.key,'fld'+String(i).padStart(14,'0')]));
const now=Date.parse('2026-11-02T00:00:00Z'),sid='sess_formula_fixture';
const summary={session_id:sid,total_amount_thb:25000,verified_paid_thb:5000,verified_deposit_thb:5000,paid_credit_thb:10000,bonus_credit_thb:3500,credit_applied_thb:13500,remaining_amount_thb:6500,overpaid_amount_thb:0};
// Explicit predicate simulation, not an Airtable parser or formula engine.
function simulatedFormula(row){
 const n=mapping.fields.filter(f=>f.type==='currency').map(f=>row[map[f.key]]);
 if(row[map.status]!=='verified'||row[map.session]!==sid||n.some(v=>typeof v!=='number'||!Number.isFinite(v))||n[0]<=0||n.slice(1).some(v=>v<0)||Date.parse(row[map.expires])<=now||!Number.isFinite(Date.parse(row[map.expires])))return null;
 const [total,cash,paid,bonus,due,over]=n,round=n=>Math.round(n*100)/100;
 return due===round(Math.max(0,total-cash-paid-bonus))&&over===round(Math.max(0,cash+paid+bonus-total))?due:null;
}
test('nine-field mapping matches the writer; production slots are empty and disabled',()=>{
 assert.equal(mapping.fields.length,9);for(const f of mapping.fields){assert.equal(f.name,REPORT_FIELDS[f.key]);assert.equal(f.field_id,null);}
 assert.equal(mapping.bindings_template.SESSION_REPORT_PROJECTION_ENABLED,'false');
 assert.throws(()=>reportFieldMap({SESSION_REPORT_PROJECTION_ENABLED:'true',SESSION_REPORT_FIELD_IDS:JSON.stringify(mapping.bindings_template.SESSION_REPORT_FIELD_IDS)}),/mapping_invalid/);
 assert.deepEqual(reportFieldMap({SESSION_REPORT_PROJECTION_ENABLED:'true',SESSION_REPORT_FIELD_IDS:JSON.stringify(map)}),map);
 const refs=[...mapping.formula.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]);assert.ok(refs.every(f=>f==='session_id'||mapping.fields.some(x=>x.name===f)));
});
for(const [name,patch,expected]of [
 ['normal',{},6500],['unavailable',{status:'unavailable'},null],['HOLD marked unavailable',{status:'unavailable'},null],['other Session',{session:'sess_other'},null],['missing cash',{verified_paid_thb:null},null],['missing credit',{paid_credit_thb:null},null],['missing bonus',{bonus_credit_thb:null},null],['stale due',{remaining_amount_thb:20000},null],['expired',{expires:new Date(now-1).toISOString()},null],['invalid expiry',{expires:'bad'},null],['negative cash',{verified_paid_thb:-1},null],['fully covered',{verified_paid_thb:11500,remaining_amount_thb:0},0],['overpaid',{verified_paid_thb:12000,remaining_amount_thb:0,overpaid_amount_thb:500},0],
])test('offline formula conditions: '+name,()=>{
 const row=reportVerifiedFields(map,summary,now);for(const [key,value]of Object.entries(patch))row[map[key]]=value;
 assert.equal(simulatedFormula(row),expected);
 assert.equal(readSessionReport(row,map,sid,now).balance?.remaining_amount_thb??null,expected);
});
