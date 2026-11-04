// Copy only the existing Console projection; never derive or recalculate money.
const strings=['session_id','state','model_session_state','normalized_state','page','route','job_type','job_date','start_time','end_time','location_name','google_map_url'];
const nullableStrings=['package_code','model_work_lane'];
const termStrings=['policy_version','money_lane','compensation_mode','package_code','extension_rate_mode'];
const termBooleans=['public_package_matrix_applies','public_ot_matrix_applies','extension_requires_model_approval','extension_requires_mmd_confirmation'];
const termNumbers=['base_payout_thb','overtime_payout_thb_per_hour','late_night_payout_thb','extra_km_payout_thb','extra_guest_payout_thb','overtime_before_midnight_payout_thb_per_hour','overtime_after_midnight_payout_thb_per_hour','overtime_after_0300_payout_thb_per_hour','after_midnight_prebook_premium_payout_thb_per_hour'];
export function projectConsoleSession(source,expectedId){
 if(!source||typeof source!=='object'||Array.isArray(source)||typeof source.session_id!=='string'||source.session_id!==expectedId)return null;
 const out={};
 for(const key of strings){if(source[key]!==undefined){if(typeof source[key]!=='string')return null;out[key]=source[key];}}
 for(const key of nullableStrings){if(source[key]!==undefined){if(source[key]!==null&&typeof source[key]!=='string')return null;out[key]=source[key];}}
 if(source.pay_model_thb!==undefined){if(source.pay_model_thb!==null&&!Number.isFinite(source.pay_model_thb))return null;out.pay_model_thb=source.pay_model_thb;}
 if(source.allowed_actions!==undefined){if(!Array.isArray(source.allowed_actions)||!source.allowed_actions.every(x=>typeof x==='string'))return null;out.allowed_actions=[...source.allowed_actions];}
 if(source.payout_terms!==undefined){
  if(source.payout_terms===null)out.payout_terms=null;
  else{
   const t=source.payout_terms;if(typeof t!=='object'||Array.isArray(t))return null;const terms={};
   for(const [keys,type] of [[termStrings,'string'],[termBooleans,'boolean'],[termNumbers,'number']])for(const key of keys)if(t[key]!==undefined){if(t[key]!==null&&(typeof t[key]!==type||(type==='number'&&!Number.isFinite(t[key]))))return null;terms[key]=t[key];}
   if(t.reimbursable_expenses!==undefined){if(!Array.isArray(t.reimbursable_expenses)||!t.reimbursable_expenses.every(x=>typeof x==='string'))return null;terms.reimbursable_expenses=[...t.reimbursable_expenses];}
   out.payout_terms=terms;
  }
 }
 return out;
}
export function snapshotAuthority(value){
 if(!value||typeof value!=='object')return null;
 const result={ok:value.ok===true,allowed:value.allowed===true};
 for(const key of ['model_id','session_id','offer_revision','binding']){if(typeof value[key]!=='string'||!value[key])return null;result[key]=value[key];}
 return Object.freeze(result);
}
