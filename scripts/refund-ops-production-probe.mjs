const origins = ["https://mmdbkk.com", "https://www.mmdbkk.com"];
const credential = String(process.env.ADMIN_SMOKE_CREDENTIAL || "").trim();
if (!credential) throw new Error("missing admin credential");

for (const origin of origins) {
  const login = await fetch(origin + "/internal/admin/login/session", {
    method: "POST",
    redirect: "manual",
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ credential, next: "/internal/admin/refunds" }),
  });
  console.log("origin", origin, "login", login.status);
  if (login.status !== 303) continue;
  const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
  if (!cookie) throw new Error("missing session cookie for " + origin);

  for (const path of [
    "/internal/admin/refunds?inbox_id=refund_manual_man_20260929_pay_mulcs8o4&action=upload",
    "/internal/admin/refunds",
    "/v1/admin/refunds/list?inbox_id=refund_manual_man_20260929_pay_mulcs8o4",
    "/v1/admin/refunds/detail?inbox_id=refund_manual_man_20260929_pay_mulcs8o4",
  ]) {
    const response = await fetch(origin + path, {
      headers: { cookie },
      redirect: "manual",
    });
    const body = await response.text();
    console.log(JSON.stringify({
      origin,
      path,
      status: response.status,
      location: response.headers.get("location"),
      contentType: response.headers.get("content-type"),
      ray: response.headers.get("cf-ray"),
      routeOwner: response.headers.get("x-mmd-route-owner"),
      refundBoundary: response.headers.get("x-mmd-refund-error-boundary"),
      bodyPrefix: body.slice(0, 260).replace(/\s+/g, " "),
    }));
  }
}
