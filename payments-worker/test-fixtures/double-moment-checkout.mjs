import {SOURCE_FIELDS} from '../double-moment-source-fields.js';
import {BALANCE_FIELDS as B} from '../verified-session-balance.js';
import {DOUBLE_MOMENT_POLICY,LEGACY_V2_POLICY} from '../double-moment-policy.js';
export const CLIENT='rec12345678901234',UID='U1234567890abcdef1234567890abcdef',SID='sess_dm_checkout',JOB='job_checkout';
export const CLAIMS=[1,2,3,4].map(n=>'dm2_'+String(n).padStart(24,'0'));
export const T={clients:'tblVv58TCbwh5j1fS',claims:'tblTH1LGJikBI0rly',payments:'tblWGGJJOx5eBvBZJ',proofs:'tblfJfM4Sqag9zrLi',credits:'tblKvhl2zZm9yYBmT',jobs:'tbl0jxIjN8QYwGABX',sessions:'tblC98mKWbzmPuNzX'};
const paymentMap={'Payment Reference':B.ref,session_id:B.paymentSession,Amount:B.amount,'Payment Status':B.status,'Verification Status':B.verification,payment_stage:B.stage,'Payment Intent Status':B.intent,Client:'fldcrLuJijj7xr0y8'};
export function checkoutFixture(){
 const rows={clients:[{id:CLIENT,fields:{line_user_id:UID}}],claims:[],payments:[],credits:[],jobs:[{id:'recJobFixture0001',fields:{job_id:JOB,session_id:SID,'Client (ลูกค้า)':[CLIENT],Budget:25000,'Job Status':'confirmed'}}],sessions:[{id:'recSession0000001',fields:{job_id:JOB,session_id:SID,Client:[CLIENT],amount_thb:25000,'Total Amount':25000,'Session Status':'confirmed',model_work_lane:'public'}}]};
 const maps={...SOURCE_FIELDS,[T.payments]:paymentMap,[T.sessions]:{...SOURCE_FIELDS[T.sessions],paid_received_sum:B.paidSum,customer_due:B.customerDue,model_work_lane:'fldzYGziqLqTQaoaK'}};
 rows.proofs=[];
 for(let i=0;i<4;i++){
  const meta={policy:i===3?{policy_version:'v1',validity_days:180}:i===2?LEGACY_V2_POLICY:DOUBLE_MOMENT_POLICY,round_id:'round_'+(i+1),invitation_id:'invitation_'+(i+1)},ref='synthetic_purchase_'+i;
  rows.claims.push({id:'recClaimFixture0'+i,fields:{claim_id:CLAIMS[i],campaign_id:'promo_double_moment_sep2026',matched_client_id:CLIENT,matched_member_id:'member_synthetic',payment_reference:ref,claim_status:'pending_payment',payload_json:JSON.stringify(meta)}});
  rows.payments.push({id:'recPurchase00000'+i,fields:{payment_ref:ref,'Payment Reference':ref,amount_thb:20000,Amount:20000,'Payment Status':'Paid','Verification Status':'verified',Client:[CLIENT],member_id:'member_synthetic',campaign_claim_id:CLAIMS[i],campaign_code:'promo_double_moment_sep2026',package_code:'double_moment_20000',promo_payload_json:JSON.stringify(meta)}});
 }
 rows.payments.push({id:'recDeposit000001',fields:{'Payment Reference':'synthetic_deposit',session_id:SID,Amount:5000,payment_stage:'deposit','Payment Status':'Paid','Verification Status':'verified',Client:[CLIENT]}});
 const writes=[];let failCreditRead=false,failFinal=false,hideFinal=false,failPatch=false;
 const value=(row,key,map)=>row.fields[key]??row.fields[Object.entries(map).find(([,id])=>id===key)?.[0]];
 const toNames=(fields,map)=>Object.fromEntries(Object.entries(fields).map(([key,v])=>[Object.entries(map).find(([,id])=>id===key)?.[0]||key,v]));
 const response=row=>structuredClone(row);
 return {rows,writes,maps,failCredits(v=true){failCreditRead=v;},loseFinal(v=true){failFinal=v;},hideFinal(v=true){hideFinal=v;},loseCreditPatch(v=true){failPatch=v;},async fetch(request){
  const u=new URL(request.url),tid=u.pathname.split('/')[3],name=Object.keys(T).find(k=>T[k]===tid),map=maps[tid]||{};
  if(!name)return Response.json({error:'unknown_fixture_table'},{status:503});
  if(request.method==='GET'){
   if(name==='credits'&&failCreditRead)return Response.json({error:'synthetic_unavailable'},{status:503});
   const formula=u.searchParams.get('filterByFormula')||'',terms=[...formula.matchAll(/\{([^}]+)\}='([^']*)'/g)];
   if(!terms.length)throw Error('Fixture requires explicit query');
   let found=rows[name].filter(row=>formula.startsWith('OR(')?terms.some(([,k,v])=>value(row,k,map)===v):terms.every(([,k,v])=>value(row,k,map)===v));
   if(name==='payments'&&hideFinal)found=found.filter(r=>r.fields.payment_stage!=='final');
   if(u.searchParams.get('returnFieldsByFieldId')==='true'){
    const selected=u.searchParams.getAll('fields[]');found=found.map(row=>({id:row.id,fields:Object.fromEntries(Object.entries(row.fields).map(([k,v])=>[map[k]||k,v]).filter(([k])=>!selected.length||selected.includes(k)))}));
   }
   return Response.json({records:found.map(response)});
  }
  const body=await request.json();writes.push({table:name,method:request.method,body:structuredClone(body)});
  if(body.typecast!==false)throw Error('Fixture rejects typecast');
  if(request.method==='POST'){
   const record={id:'rec'+String(1000+writes.length).padStart(14,'0'),fields:toNames(body.records[0].fields,map)};rows[name].push(record);
   if(name==='payments'&&record.fields.payment_stage==='final'&&failFinal){failFinal=false;throw Error('synthetic_final_response_lost');}
   return Response.json({records:[response(record)]});
  }
  if(request.method==='PATCH'){
   const r=rows[name].find(x=>x.id===u.pathname.split('/')[4]);if(!r)throw Error('unknown_fixture_row');Object.assign(r.fields,toNames(body.fields,map));
   if(name==='credits'&&failPatch){failPatch=false;throw Error('synthetic_credit_response_lost');}return Response.json(response(r));
  }
  return Response.json({error:'unknown_fixture_method'},{status:503});
 }};
}
