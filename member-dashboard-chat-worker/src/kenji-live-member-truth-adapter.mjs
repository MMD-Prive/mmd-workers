const PATH="/__internal/kenji/member-truth";
const text=(v)=>String(v??"").trim();
export async function resolveKenjiLiveMemberContext(env={},lineUserId="",intent=""){
  const id=text(lineUserId);
  if(!env.MEMBER_PAGES_WORKER?.fetch || !/^U[0-9a-f]{32}$/i.test(id)) return null;
  const request=new Request("https://member-pages-worker.internal"+PATH,{method:"POST",headers:{"content-type":"application/json","x-mmd-internal-call":"true","x-mmd-service-binding":"member-dashboard-chat-worker"},body:JSON.stringify({line_user_id:id,intent:text(intent)})});
  const response=await env.MEMBER_PAGES_WORKER.fetch(request);
  if(!response.ok) return null;
  const body=await response.json().catch(()=>null);
  if(!body?.ok || body.authority!=="my_mmd_entitlement_resolver_v1") return null;
  const membership=body.membership||{};
  const level=membership.level==="public_member"?"public":membership.level==="private_standard"||membership.level==="private_premium"||["vip","svip","black_card","red_card"].includes(membership.level)?"private":"guest";
  return {identity_state:body.identity_status==="resolved"?"matched":"unresolved",membership_state:membership.member_blocked===true?"blocked":membership.lifecycle||"unresolved",renewal_state:membership.lifecycle||"unknown",payment_state:"unknown",membership_level:level,level,display_name:body.display_name||"",canonical_client_id:body.canonical_client_id||"",live_truth:true};
}
