import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";

// Owner-only trigger for member-pages-worker's resolver diagnostic RPC.
// POST /internal/admin with a credential-bound admin session, same-origin,
// no query and no body. Every rejection is an indistinguishable empty 404 so
// the trigger is not discoverable; GET/HEAD keep the existing admin behavior.
export const MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH = "/internal/admin";
const DIAGNOSTIC_PAGE_PATH = "/internal/admin/work/member-resolver-check";

const HEALTHY_ZERO_MATCH = "healthy_zero_match";
const GENERIC_FAILURE = "generic_failure";

export function isMemberResolverDiagnosticTriggerRequest(request) {
  const method = String(request.method || "").toUpperCase();
  const path = new URL(request.url).pathname;
  return method === "POST" && path === MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH
    || method === "GET" && path === DIAGNOSTIC_PAGE_PATH;
}

export async function handleMemberResolverDiagnosticTrigger(request, env = {}) {
  const url = new URL(request.url);
  if (url.search) return notFound();
  const page = request.method === "GET" && url.pathname === DIAGNOSTIC_PAGE_PATH;
  if (!page && String(request.headers.get("origin") || "").trim() !== url.origin) return notFound();

  let actor = null;
  try {
    actor = await readCredentialBoundAdminActor(request, env);
  } catch {
    actor = null;
  }
  if (!actor) return notFound();
  if (page) return diagnosticPage();

  let body = "";
  try {
    body = await request.text();
  } catch {
    return notFound();
  }
  if (body !== "") return notFound();

  const service = env.MEMBER_PAGES_RESOLVER_DIAGNOSTIC;
  if (typeof service?.runMemberResolverDiagnostic !== "function") return text(GENERIC_FAILURE, 503);

  let result;
  try {
    result = await service.runMemberResolverDiagnostic();
  } catch {
    result = GENERIC_FAILURE;
  }
  return result === HEALTHY_ZERO_MATCH ? text(HEALTHY_ZERO_MATCH, 200) : text(GENERIC_FAILURE, 503);
}

function diagnosticPage() {
  return new Response(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ตรวจการเชื่อมต่อข้อมูลสมาชิก</title><style>body{margin:0;background:#f5f3ee;color:#292823;font:18px/1.7 system-ui,sans-serif}main{max-width:620px;margin:8vh auto;padding:28px}h1{font-size:28px;line-height:1.4}button{font:inherit;background:#302f28;color:white;border:0;border-radius:12px;padding:16px 22px;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #886b25;outline-offset:5px}a{color:#554619}p{margin:24px 0}</style></head><body><main><a href="/internal/admin/control-room">กลับหน้าแอดมิน</a><h1>ตรวจการเชื่อมต่อข้อมูลสมาชิก</h1><p>ตรวจเฉพาะการเชื่อมต่อด้วยข้อมูลทดสอบที่ไม่ใช่ลูกค้า โดยไม่แก้ไขข้อมูลหรือสิทธิ์ลูกค้าครับ</p><form method="post" action="/internal/admin" enctype="text/plain"><button type="submit">ตรวจการเชื่อมต่อข้อมูลสมาชิก</button></form><p>ผล healthy_zero_match หมายถึงการเชื่อมต่อผ่าน ส่วน generic_failure หมายถึงยังตรวจไม่ผ่าน ทั้งสองผลยังไม่ใช่การยืนยันสิทธิ์ของลูกค้าครับ</p></main></body></html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, private",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function notFound() {
  return new Response(null, { status: 404, headers: { "cache-control": "no-store, private" } });
}

function text(value, status) {
  return new Response(value, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}
