const origin = "https://mmdbkk.com";
const credential = String(process.env.ADMIN_SMOKE_CREDENTIAL || "").trim();
if (!credential) throw new Error("missing owner credential");
const inboxId = "refund_manual_man_20260929_pay_mulcs8o4";

const login = await fetch(origin + "/internal/admin/login/session", {
  method:"POST",
  redirect:"manual",
  headers:{ origin, "content-type":"application/x-www-form-urlencoded" },
  body:new URLSearchParams({
    credential,
    next:"/internal/admin/refunds?inbox_id=" + encodeURIComponent(inboxId) + "&action=upload",
  }),
});
if (login.status !== 303) throw new Error("owner login failed: " + login.status);
const cookie = (login.headers.get("set-cookie") || "").split(";",1)[0];
if (!cookie) throw new Error("missing owner session cookie");

const response = await fetch(origin + "/v1/admin/refunds/recover", {
  method:"POST",
  headers:{
    origin,
    cookie,
    "content-type":"application/json",
  },
  body:JSON.stringify({ inbox_id:inboxId }),
});
const body = await response.json().catch(() => ({}));
const safe = {
  http:response.status,
  ok:body.ok === true,
  recovered:body.recovered === true,
  already_completed:body.already_completed === true,
  status:body.status || null,
  refund_amount:body.refund_amount || null,
  refund_currency:body.refund_currency || null,
  error:body.error || null,
  line_sent:body.line_notification?.sent === true,
  line_skipped:body.line_notification?.skipped === true,
  line_reason:body.line_notification?.reason || null,
  telegram_sent:body.owner_telegram?.sent === true,
  telegram_skipped:body.owner_telegram?.skipped === true,
  telegram_reason:body.owner_telegram?.reason || null,
  telegram_message_id:body.owner_telegram?.message_id || null,
};
console.log(JSON.stringify(safe));
if (response.status === 404 && body.error === "orphan_receipt_not_found") process.exit(2);
if (!response.ok || body.ok !== true) throw new Error("refund recovery failed: " + response.status + " " + (body.error || "unknown"));
