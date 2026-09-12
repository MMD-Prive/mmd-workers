const PATH="/__internal/kenji/member-truth";
const text=(v)=>String(v??"").trim();
export async function resolveKenjiLiveMemberContext(env={},lineUserId="",intent=""){
  const id=text(lineUserId);
  if(!env.MEMBER_PAGES_WORKER?.fetch || !/^U[0-9a-f]{32}$/i.test(id)) return null;
  const requestedIntent=text(intent).toLowerCase();
  // The member-truth endpoint accepts explicit intent only for status/points.
  // Every other LINE interaction resolves through the canonical profile path.
  const resolverIntent=["membership_status","points_status"].includes(requestedIntent)?requestedIntent:"";
  const request=new Request("https://member-pages-worker.internal"+PATH,{method:"POST",headers:{"content-type":"application/json","x-mmd-internal-call":"true","x-mmd-service-binding":"member-dashboard-chat-worker"},body:JSON.stringify({line_user_id:id,intent:resolverIntent})});
  const response=await env.MEMBER_PAGES_WORKER.fetch(request);
  if(!response.ok) return null;
  const body=await response.json().catch(()=>null);
  if(!body?.ok || body.authority!=="my_mmd_entitlement_resolver_v1") return null;
  const membership=body.membership||{};
  const canonicalLevel=text(membership.level).toLowerCase();
  const level=canonicalLevel==="public_member"?"public":canonicalLevel==="private_standard"||canonicalLevel==="private_premium"||["vip","svip","black_card","red_card"].includes(canonicalLevel)?"private":"guest";
  const lifecycle=text(membership.lifecycle).toLowerCase()||"unresolved";
  return {
    identity_state:body.identity_status==="resolved"?"matched":"unresolved",
    membership_state:membership.member_blocked===true?"blocked":lifecycle,
    renewal_state:lifecycle,
    payment_state:"unknown",
    membership_level:level,
    level,
    canonical_membership_level:canonicalLevel||"none",
    private_visibility_envelope:text(membership.private_visibility_envelope).toLowerCase()||"none",
    expire_at:text(membership.expire_at),
    display_name:body.display_name||"",
    canonical_client_id:body.canonical_client_id||"",
    live_truth:true
  };
}
