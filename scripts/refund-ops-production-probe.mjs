const origins = ["https://mmdbkk.com", "https://www.mmdbkk.com"];
const credential = String(process.env.ADMIN_SMOKE_CREDENTIAL || "").trim();
if (!credential) throw new Error("missing admin credential");
const target = "/internal/admin/refunds?inbox_id=refund_manual_man_20260929_pay_mulcs8o4&action=upload";

for (const origin of origins) {
  const login = await fetch(origin + "/internal/admin/login/session", {
    method: "POST",
    redirect: "manual",
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ credential, next: target }),
  });
  const location = login.headers.get("location");
  console.log(JSON.stringify({ origin, loginStatus: login.status, location }));
  const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
  if (login.status !== 303 || !cookie || location !== target) continue;
  const response = await fetch(origin + location, {
    headers: { cookie },
    redirect: "manual",
  });
  const body = await response.text();
  console.log(JSON.stringify({
    origin,
    targetStatus: response.status,
    routeOwner: response.headers.get("x-mmd-route-owner"),
    refundBoundary: response.headers.get("x-mmd-refund-error-boundary"),
    bodyPrefix: body.slice(0, 220).replace(/\s+/g, " "),
  }));
}
