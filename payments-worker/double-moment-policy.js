export const LEGACY_V2_POLICY = Object.freeze({package_code:'double_moment_20000',policy_version:'v2',amount_thb:20000,paid_credit_thb:20000,bonus_1_thb:3500,bonus_2_thb:3500,total_credit_thb:27000,minimum_service_thb:20000,validity_days:120,refundable:false,official_verification_required:true,entitlement_granted:false});
const {validity_days: omitted, ...base} = LEGACY_V2_POLICY;
export const DOUBLE_MOMENT_POLICY = Object.freeze({...base,policy_version:'v3',validity_months:3,maximum_validity_months:5,moments:2,paid_credit_per_moment_thb:10000,expiry_timezone:'Asia/Bangkok'});
const fail = code => { throw Object.assign(new Error(code), {status:409}); };

// Calendar months in Bangkok, clamped to the last day of the target month.
// Never approximate a month as 30 days or extend from a prior extended expiry.
export function addPolicyMonths(iso, months) {
  if (typeof iso !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(iso) || !Number.isFinite(Date.parse(iso)) || ![3,4,5].includes(months)) fail('invalid_policy_date');
  if(new Date(iso).toISOString()!==(iso.includes('.')?iso:iso.slice(0,-1)+'.000Z'))fail('invalid_policy_date');
  const offset = 7 * 3600000, local = new Date(Date.parse(iso) + offset);
  const day = local.getUTCDate();
  local.setUTCDate(1); local.setUTCMonth(local.getUTCMonth() + months);
  const last = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth()+1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day,last));
  return new Date(local.getTime() - offset).toISOString();
}

export function recordedPolicy(meta) {
  const policy = meta?.policy;
  const expected = policy?.policy_version === 'v3' ? DOUBLE_MOMENT_POLICY : policy?.policy_version === 'v2' ? LEGACY_V2_POLICY : null;
  if (!expected || !Object.entries(expected).every(([k,v]) => policy[k] === v) || Object.keys(policy).some(k => !(k in expected))) fail('purchase_policy_conflict');
  return expected;
}
