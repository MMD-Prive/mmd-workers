const origin="https://mmdbkk.com";
const credential=String(process.env.ADMIN_SMOKE_CREDENTIAL||"").trim();
if(!credential) throw new Error("missing owner credential");
const inboxId="refund_manual_man_20260929_pay_mulcs8o4";
const target="/internal/admin/refunds?inbox_id="+encodeURIComponent(inboxId)+"&action=upload";

const login=await fetch(origin+"/internal/admin/login/session",{
  method:"POST",redirect:"manual",
  headers:{origin,"content-type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({credential,next:target}),
});
if(login.status!==303) throw new Error("owner login failed:"+login.status);
const cookie=(login.headers.get("set-cookie")||"").split(";",1)[0];
if(!cookie) throw new Error("missing owner session");

const response=await fetch(origin+"/v1/admin/refunds/recover",{
  method:"POST",
  headers:{origin,cookie,"content-type":"application/json"},
  body:JSON.stringify({inbox_id:inboxId}),
});
const body=await response.json().catch(()=>({}));
const q=body.line_notification?.quota||{};
console.log(JSON.stringify({
  http:response.status,
  ok:body.ok===true,
  delivery_retried:body.delivery_retried===true,
  line_sent:body.line_notification?.sent===true,
  line_reason:body.line_notification?.reason||null,
  line_mode:body.line_notification?.mode||null,
  line_status:body.line_notification?.status||null,
  line_transport_status:body.line_notification?.transport_status||null,
  quota_ok:q.ok===true,
  quota_type:q.quota_type||null,
  quota_value:Number.isFinite(Number(q.quota_value))?Number(q.quota_value):null,
  total_usage:Number.isFinite(Number(q.total_usage))?Number(q.total_usage):null,
  monthly_exhausted:q.monthly_exhausted===true,
  telegram_reason:body.owner_telegram?.reason||null,
  telegram_message_id:body.owner_telegram?.message_id||null,
  error:body.error||null,
}));
if(!response.ok||body.ok!==true) throw new Error("diagnostic recovery failed");
if(body.owner_telegram?.reason!=="already_sent") throw new Error("telegram duplicate guard missing");
