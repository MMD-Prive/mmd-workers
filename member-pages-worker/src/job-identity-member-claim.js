const CUSTOMER_LIFF_ID = "2010862595-yT4DCEMc";
const CLAIM_PARAM = "job_claim";

function clean(value, max = 20000) {
  return String(value ?? "").trim().slice(0, max);
}

function hasJobClaim(request) {
  try {
    return Boolean(clean(new URL(request.url).searchParams.get(CLAIM_PARAM)));
  } catch {
    return false;
  }
}

function escapeForScript(value) {
  return JSON.stringify(String(value)).replace(/</g, "\\u003c");
}

export async function decorateMemberLiffJobClaim(response, request) {
  if (!hasJobClaim(request)) return response;
  if (!(response instanceof Response) || !response.ok) return response;
  const contentType = clean(response.headers.get("content-type"), 160).toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const nonce = html.match(/<script nonce="([^"]+)"/)?.[1] || "";
  if (!nonce || !html.includes("</body>")) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }

  const script = `<script nonce="${nonce}">
(async()=>{
  'use strict';
  const claim=new URL(location.href).searchParams.get(${escapeForScript(CLAIM_PARAM)});
  if(!claim)return;
  const msg=document.getElementById('message');
  const actions=document.getElementById('actions');
  const set=(t)=>{if(msg)msg.textContent=t};
  const button=(label,href)=>{if(!actions)return;actions.innerHTML='';const a=document.createElement('a');a.href=href;a.textContent=label;a.style.cssText='display:block;padding:14px 16px;border:1px solid rgba(216,189,137,.28);border-radius:16px;background:#f0d892;color:#181207;text-align:center;text-decoration:none;font-weight:800';actions.appendChild(a)};
  try{
    set('กำลังยืนยัน LINE เพื่อเชื่อมงานนี้กับ MMD ครับ');
    if(!window.liff)throw new Error('LINE LIFF ยังไม่พร้อม');
    await window.liff.init({liffId:${escapeForScript(CUSTOMER_LIFF_ID)}});
    if(!window.liff.isLoggedIn()){window.liff.login({redirectUri:location.href});return;}
    const idToken=window.liff.getIDToken();
    if(!idToken)throw new Error('ไม่สามารถยืนยัน LINE ได้');
    const res=await fetch('/v1/admin/job/create',{method:'POST',credentials:'include',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({operational_create_mode:'identity_claim',claim_token:claim,id_token:idToken})});
    const raw=await res.text();let data={};try{data=JSON.parse(raw)}catch{}
    if(res.status===202||data.state==='identity_review_required'){
      set(data.message||'ยืนยัน LINE สำเร็จแล้ว กำลังรอ MMD ตรวจเชื่อมข้อมูลครับ');return;
    }
    if(!res.ok||data.ok===false)throw new Error(data.message||data.error||'เชื่อมงานไม่สำเร็จ');
    set(data.message||'ยืนยัน LINE และเชื่อมงานสำเร็จแล้วครับ');
    if(data.next_url)button('เปิดรายละเอียดงาน',data.next_url);
  }catch(error){
    set(error&&error.message?error.message:'เชื่อมงานไม่สำเร็จ กรุณาลองใหม่อีกครั้งครับ');
  }
})();
</script>`;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store, private");
  return new Response(html.replace("</body>", `${script}</body>`), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
