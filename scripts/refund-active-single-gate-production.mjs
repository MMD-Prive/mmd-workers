const origins = ["https://mmdbkk.com","https://www.mmdbkk.com"];
const credential = String(process.env.ADMIN_SMOKE_CREDENTIAL || "").trim();
if (!credential) throw new Error("missing admin credential");
const target="/internal/admin/refunds?inbox_id=refund_manual_man_20260929_pay_mulcs8o4&action=upload";

for (const origin of origins) {
  const login=await fetch(origin+"/internal/admin/login/session",{
    method:"POST",
    redirect:"manual",
    headers:{origin,"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({credential,next:target}),
  });
  if(login.status!==303) throw new Error("login failed "+origin);
  const valid=(login.headers.get("set-cookie")||"").split(";",1)[0];
  if(!valid) throw new Error("missing cookie "+origin);
  const Cookie="mmd_admin_gate_v1=legacy-host-only-stale-session; "+valid;
  const page=await fetch(origin+target,{headers:{Cookie},redirect:"manual"});
  const body=await page.text();
  console.log(JSON.stringify({
    origin,
    status:page.status,
    boundary:page.headers.get("x-mmd-refund-error-boundary"),
    routeOwner:page.headers.get("x-mmd-route-owner"),
    hasUpload:body.includes("อัปโหลดสลิปคืน"),
    hasMan:body.includes("แมน"),
    has3150:body.includes("3150")||body.includes("3,150"),
  }));
  if(page.status!==200) throw new Error("refund not 200 "+origin);
  if(page.headers.get("x-mmd-refund-error-boundary")) throw new Error("refund boundary hit "+origin);
  if(!body.includes("อัปโหลดสลิปคืน")) throw new Error("upload missing "+origin);
  if(!body.includes("แมน")) throw new Error("case missing "+origin);
}
