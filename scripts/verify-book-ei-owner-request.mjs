// One bounded owner approval, requested by Per on 2026-10-12. Uses the normal review API.
const BASE='appsV1ILPRfIjkaYg', SID='sess_mv52jkac_ca8e26da2d4e51bd', REF='pay_mv52jkac_32e9d3a64284ffed';
const PROOF='manual_sess_mv52jkac_ca8e26da2d4e51bd_20261012_1655_5400';
const ORIGIN='https://mmdbkk.com';
const KEY='owner-book-ei-20261012-5400-v1';
const clean=v=>String(v||'').trim();
async function read(table,record) {
 const r=await fetch(`https://api.airtable.com/v0/${BASE}/${table}/${record}?returnFieldsByFieldId=true`,{headers:{Authorization:`Bearer ${process.env.AIRTABLE_API_KEY}`}});
 if(!r.ok)throw Error(`airtable_read_${r.status}`);return (await r.json()).fields;
}
export function validateTarget(s,p,e) {
 if(s.fldLTq2kZbyRv22IA!==SID||s.fldojgjSQLaO0uQLX!==REF||s.fldhwC79ndbnEXSZz!==17100||s.fldvJowquu8RrsOMc!==11700)throw Error('session_preflight_mismatch');
 if(/cancel|void|refund/i.test(clean(s.fldmwuvOaiCFdzzRa)))throw Error('session_not_approvable');
 if(p.fldOO6SY49iDw8VBZ!==REF||p.fld2wdhBvc8xrV6y5!==SID||p.fldvCSwrUW8OMAooS!==5400||p.fldrr9g8ZZjqAbdKQ!=='deposit')throw Error('payment_preflight_mismatch');
 if(e.fldz3Tg9eOm19h0Jd!==PROOF||e.fldyeyV7aL0dkbLLE!==REF||e.fldNAxLhaA1QOBYUc!==5400||!e.fldiAWyWidvUOXi1q?.includes('rec0ZVr22PvgDzUcz')||!e.fldLTgArSK7U0695K?.includes('rectA6KgKz4Wuedc4'))throw Error('proof_preflight_mismatch');
 const paid=p.fldEJ1hmm7KwWuI6q==='Paid'&&/^(verified|official_verified)$/.test(clean(p.fldJ7a0Ube9F0bmRy));
 if(!paid&&(p.fldEJ1hmm7KwWuI6q!=='Pending'||p.fldJ7a0Ube9F0bmRy!=='pending_review'||e.fld45QUtZAl3FEmW4!=='pending'))throw Error('review_state_changed');
 return {alreadyVerified:paid};
}
export async function run() {
 if(!process.env.AIRTABLE_API_KEY||!process.env.ADMIN_SMOKE_CREDENTIAL)throw Error('owner_credentials_missing');
 if(Date.now()>Date.parse('2026-10-14T00:00:00+07:00'))throw Error('owner_request_execution_window_expired');
 const get=()=>Promise.all([read('tblC98mKWbzmPuNzX','rec0ZVr22PvgDzUcz'),read('tblWGGJJOx5eBvBZJ','rectA6KgKz4Wuedc4'),read('tblfJfM4Sqag9zrLi','recGGqrYbeFTrljax')]);
 const [s,p,e]=await get();const state=validateTarget(s,p,e);
 const login=await fetch(`${ORIGIN}/internal/admin/login/session`,{method:'POST',redirect:'manual',headers:{Origin:ORIGIN,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({credential:process.env.ADMIN_SMOKE_CREDENTIAL,next:'/internal/admin/control-room'})});
 if(login.status!==303)throw Error(`owner_login_${login.status}`);
 const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).filter(c=>c.startsWith('mmd_admin_gate_v1=')).join('; ');
 if(!cookie)throw Error('owner_cookie_missing');
 async function post(path,body,key) {
  // Never automatically repeat a financial or signing mutation after a network failure.
  const r=await fetch(ORIGIN+path,{method:'POST',redirect:'manual',headers:{Cookie:cookie,Origin:ORIGIN,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>null);
  if(!r.ok||d?.ok!==true)throw Error(`owner_action_failed_${r.status}_${typeof d?.error==='string'?d.error:'invalid_response'}`);
  return d;
 }
 if(!state.alreadyVerified) {
  const d=await post('/v1/admin/payments/review',{decision:'approve',proof_id:PROOF,admin_reason:'Per explicitly authorized Official Verify on 12 Oct 2026: external transfer 5,400 THB at 16:55, Book EI session, Care Back K7G4P2 5%, net 17,100 and balance 11,700. Owner approval, not automated bank verification.'},KEY);
  if(d.payment_ref!==REF)throw Error('approval_reference_mismatch');
 }
 const [afterS,afterP,afterE]=await get();
 if(!validateTarget(afterS,afterP,afterE).alreadyVerified||afterE.fld45QUtZAl3FEmW4!=='verified')throw Error('official_verify_readback_failed');
 console.log('Owner Official Verify accepted by Payments Worker; canonical readback verified for the exact 5,400 THB payment.');
 const links=await post(`/v1/admin/jobs/${SID}/confirm-links/reissue`,{session_id:SID});
 if(links.session_id!==SID||links.payment_ref!==REF||!links.customer_url||!links.model_url||links.payment_state_mutated!==false)throw Error('confirmation_readback_failed');
 console.log('Customer/Model confirmation pair reissued and read back. Signed URLs remain in Airtable.');
}
if(process.argv[1]?.endsWith('verify-book-ei-owner-request.mjs'))run().catch(e=>{console.error(clean(e.message));process.exitCode=1;});
