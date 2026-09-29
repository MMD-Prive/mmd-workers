const origins = ["https://mmdbkk.com", "https://www.mmdbkk.com"];
const credential = String(process.env.ADMIN_SMOKE_CREDENTIAL || "").trim();
if (!credential) throw new Error("missing admin credential");

const target = "/internal/admin/refunds?inbox_id=refund_manual_man_20260929_pay_mulcs8o4&action=upload";

for (const origin of origins) {
  const expiredPost = await fetch(origin + target, {
    method:"POST",
    redirect:"manual",
    headers:{ origin },
  });
  const expiredLocation = expiredPost.headers.get("location") || "";
  console.log(JSON.stringify({
    step:"expired_post_gate",
    origin,
    status:expiredPost.status,
    location:expiredLocation,
  }));
  if (expiredPost.status !== 303) throw new Error("expired POST did not redirect to login for " + origin);
  const loginUrl = new URL(expiredLocation);
  if (loginUrl.pathname !== "/internal/admin/login") throw new Error("expired POST did not hit admin login for " + origin);
  if (loginUrl.searchParams.get("next") !== target) throw new Error("expired POST lost refund case for " + origin);

  const login = await fetch(origin + "/internal/admin/login/session", {
    method:"POST",
    redirect:"manual",
    headers:{ origin, "content-type":"application/x-www-form-urlencoded" },
    body:new URLSearchParams({ credential, next:target }),
  });
  const location = login.headers.get("location") || "";
  const postLogin = login.headers.get("x-mmd-admin-post-login");
  const adminNext = login.headers.get("x-mmd-admin-next");
  console.log(JSON.stringify({
    step:"owner_relogin",
    origin,
    status:login.status,
    location,
    postLogin,
    adminNext,
  }));
  if (login.status !== 303) throw new Error("owner relogin did not redirect for " + origin);
  if (location !== origin + target) throw new Error("owner relogin lost refund case for " + origin);
  if (postLogin !== "resume-refund-ops") throw new Error("resume marker missing for " + origin);
  if (adminNext !== target) throw new Error("admin next mismatch for " + origin);

  const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
  if (!cookie) throw new Error("missing owner session cookie for " + origin);
  const page = await fetch(location, { headers:{ cookie }, redirect:"manual" });
  const body = await page.text();
  const expectedAction = '/internal/admin/refunds?inbox_id=refund_manual_man_20260929_pay_mulcs8o4&amp;action=upload';
  console.log(JSON.stringify({
    step:"resumed_case",
    origin,
    status:page.status,
    routeOwner:page.headers.get("x-mmd-route-owner"),
    boundary:page.headers.get("x-mmd-refund-error-boundary"),
    hasUpload:body.includes("อัปโหลดสลิปคืน"),
    hasCaseAction:body.includes(expectedAction),
    hasMan:body.includes("แมน"),
    has3150:body.includes("3150") || body.includes("3,150"),
  }));
  if (page.status !== 200) throw new Error("resumed Refund Ops not 200 for " + origin);
  if (page.headers.get("x-mmd-refund-error-boundary")) throw new Error("resumed Refund Ops hit boundary for " + origin);
  if (!body.includes("อัปโหลดสลิปคืน")) throw new Error("upload control missing for " + origin);
  if (!body.includes(expectedAction)) throw new Error("targeted form action missing for " + origin);
  if (!body.includes("แมน")) throw new Error("customer case missing for " + origin);
  if (!(body.includes("3150") || body.includes("3,150"))) throw new Error("refund amount missing for " + origin);
}
