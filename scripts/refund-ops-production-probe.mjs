const origins = ["https://mmdbkk.com", "https://www.mmdbkk.com"];
const credential = String(process.env.ADMIN_SMOKE_CREDENTIAL || "").trim();
if (!credential) throw new Error("missing admin credential");
const target = "/internal/admin/refunds?inbox_id=refund_manual_man_20260929_pay_mulcs8o4&action=upload";

for (const origin of origins) {
  const login = await fetch(origin + "/internal/admin/login/session", {
    method: "POST",
    redirect: "manual",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ credential, next: target }),
  });
  const location = login.headers.get("location");
  const postLogin = login.headers.get("x-mmd-admin-post-login");
  const adminNext = login.headers.get("x-mmd-admin-next");
  console.log(JSON.stringify({ origin, loginStatus: login.status, location, postLogin, adminNext }));
  if (login.status !== 303) throw new Error("login did not redirect for " + origin);
  const expectedAbsolute = origin + target;
  if (location !== expectedAbsolute) throw new Error("refund next was not preserved for " + origin + ": " + location);
  if (postLogin !== "resume-refund-ops") throw new Error("refund resume marker missing for " + origin);
  if (adminNext !== target) throw new Error("refund admin next mismatch for " + origin);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
  if (!cookie) throw new Error("missing session cookie for " + origin);
  const response = await fetch(location, { headers: { cookie }, redirect: "manual" });
  const body = await response.text();
  console.log(JSON.stringify({
    origin,
    targetStatus: response.status,
    routeOwner: response.headers.get("x-mmd-route-owner"),
    refundBoundary: response.headers.get("x-mmd-refund-error-boundary"),
    hasUpload: body.includes("อัปโหลดสลิปคืน"),
    hasMan: body.includes("แมน"),
    has3150: body.includes("3150") || body.includes("3,150"),
  }));
  if (response.status !== 200) throw new Error("Refund Ops target not 200 for " + origin);
  if (response.headers.get("x-mmd-refund-error-boundary")) throw new Error("Refund Ops hit error boundary for " + origin);
  if (!body.includes("อัปโหลดสลิปคืน")) throw new Error("upload control missing for " + origin);
}
