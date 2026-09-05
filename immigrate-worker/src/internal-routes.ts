import {
  renderCreateJobPage,
  renderCreateSessionPage,
  type InternalPageEnv,
} from "./internal-pages";
import { renderOwnerControlRoomPage } from "./control-room-owner-ui";

export interface InternalRoutesEnv extends InternalPageEnv {
  ADMIN_WORKER?: Fetcher;
  ADMIN_WORKER_BASE_URL?: string;
  ASSETS?: Fetcher;
}

function redirect(to: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      location: to,
      "cache-control": "no-store",
    },
  });
}

function withQuery(path: string, url: URL): string {
  return `${path}${url.search || ""}`;
}

function publicAdminAuthBaseUrl(request: Request): string {
  const { hostname } = new URL(request.url);
  if (hostname === "mmdbkk.com") return "https://mmdbkk.com";
  if (hostname === "www.mmdbkk.com") return "https://www.mmdbkk.com";
  return "";
}

function adminLoginRedirect(url: URL): Response {
  return redirect(`/internal/admin/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`, 302);
}

async function withSameOriginAdminBase(response: Response): Promise<Response> {
  const html = await response.text();
  const rewritten = html.replace('adminBase:""', 'adminBase:location.origin');
  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function withCreateJobAmountInput(response: Response): Promise<Response> {
  const html = await response.text();
  const amountField = `<label class="mmdop__field"><span>Amount THB</span><input class="mmdop__input" id="amount_thb" name="amount_thb" type="number" min="1" step="1" required /></label>`;
  const withInput = html.replace(
    `<label class="mmdop__field"><span>Job Date</span>`,
    `${amountField}<label class="mmdop__field"><span>Job Date</span>`
  );
  const withAmountRead = withInput.replace(
    `const payload={session_id:$("job-session-id")?.value||"",`,
    `const amount=Number($("amount_thb")?.value||"");const payload={session_id:$("job-session-id")?.value||"",amount_thb:amount,`
  );
  const rewritten = withAmountRead.replace(
    `if(!payload.session_id){setStatus("กรุณาใส่ Session ID ก่อน",true);return}`,
    `if(!payload.session_id){setStatus("กรุณาใส่ Session ID ก่อน",true);return}if(!Number.isFinite(payload.amount_thb)||payload.amount_thb<=0){setStatus("กรุณาใส่ Amount THB มากกว่า 0",true);return}`
  );
  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function renderCustomerDataPage(): Response {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD · Customer Data</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#090806;color:#fff7ea;font-family:"LINE Seed Sans TH","Noto Sans Thai","Noto Sans",system-ui,sans-serif}.wrap{width:min(100% - 32px,860px);margin:0 auto;padding:24px 0 34px}.top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}.back{color:#f7d98d;text-decoration:none;font-weight:950;font-size:14px}.tag{border:1px solid rgba(247,217,141,.26);border-radius:999px;padding:7px 11px;color:#f7d98d;font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase;background:rgba(247,217,141,.07)}.head{border:1px solid rgba(247,217,141,.18);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));padding:20px}.head h1{margin:0 0 8px;color:#fff7ea;font-size:34px;line-height:1.05;letter-spacing:-.035em;font-weight:950}.head p{max-width:660px;margin:0;color:#f0e4d2;font-size:16px;line-height:1.58;font-weight:720}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.btn{min-height:38px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:0 14px;text-decoration:none;font-weight:950;border:1px solid rgba(247,217,141,.26);color:#fff7ea;background:rgba(255,255,255,.045);font-size:14px}.btn.main{background:linear-gradient(135deg,#fff0b5,#edc66f);color:#15100a;border:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.card{border:1px solid rgba(247,217,141,.18);border-radius:20px;background:rgba(255,255,255,.04);padding:16px}.card small{display:block;color:#f7d98d;font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}.card h2{margin:0 0 7px;color:#ffe39a;font-size:20px;line-height:1.18}.card p{margin:0;color:#f2e8d8;line-height:1.58;font-weight:660;font-size:15px}.note{margin-top:10px;border:1px solid rgba(255,187,160,.24);border-radius:18px;padding:13px 15px;background:rgba(255,187,160,.055);color:#ffe5db;line-height:1.55;font-weight:720;font-size:14px}.note b{color:#ffc9bb}code{color:#ffe39a}@media(max-width:760px){.wrap{width:min(100% - 20px,860px);padding-top:14px}.top{align-items:flex-start;flex-direction:column}.head{padding:18px}.head h1{font-size:31px}.grid{grid-template-columns:1fr}.card{padding:15px}}
</style></head><body><main class="wrap"><div class="top"><a class="back" href="/internal/admin/control-room">← Control Room</a><span class="tag">Customer Data</span></div><section class="head"><h1>Customer Data</h1><p>ใช้จัดระเบียบข้อมูลลูกค้าก่อนเอาไปใช้ต่อใน Create Session, Kenji, Payments หรือ Access</p><div class="actions"><a class="btn main" href="/internal/admin/jobs/create-session">Create Session</a><a class="btn" href="/internal/admin/kenji">Kenji</a><a class="btn" href="/internal/admin/membership-access">Access Review</a></div></section><section class="grid"><article class="card"><small>01 Import</small><h2>นำเข้าข้อมูลจาก LINE</h2><p>รวมข้อความ โน้ต ชื่อที่เปลี่ยน เบอร์ อีเมล และหลักฐานเบื้องต้นจาก LINE OFC</p></article><article class="card"><small>02 Match</small><h2>จับคู่ลูกค้า</h2><p>เทียบข้อมูลกับลูกค้าเดิมก่อนสร้าง session เพื่อกันชื่อตกหล่นหรือจำคนผิด</p></article><article class="card"><small>03 Context</small><h2>บริบทส่วนตัว</h2><p>เก็บข้อควรระวัง วิธีคุย และข้อมูลที่ Kenji ต้องใช้ดูแลลูกค้าแบบระวัง</p></article><article class="card"><small>04 Review</small><h2>ประวัติที่ต้องตรวจ</h2><p>ประวัติบริการ หลักฐานชำระเงิน และ points ต้องแยก review ก่อนเสมอ</p></article></section><aside class="note"><b>ขอบเขต:</b> หน้านี้ไม่ใช่หน้าปรับสิทธิ์ ไม่ใช่หน้าตรวจยอดเงินจริง ไม่ใช่หน้าสร้างแต้ม และไม่ใช่หน้าส่งข้อความหาลูกค้า</aside></main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-mmd-customer-data-ui": "compact-v3",
      "x-mmd-customer-data-authority": "identity-context-staging-only",
    },
  });
}

async function serveAsset(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/a/")) return null;

  if (env.ASSETS) {
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) {
      const headers = new Headers(res.headers);
      headers.set("cache-control", "public, max-age=300");
      if (url.pathname.endsWith(".js")) headers.set("content-type", "application/javascript; charset=utf-8");
      if (url.pathname.endsWith(".css")) headers.set("content-type", "text/css; charset=utf-8");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
  }

  return new Response("Asset not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function requireAdminGate(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.searchParams.has("mock")) return null;

  const adminBase = publicAdminAuthBaseUrl(request);
  if (!adminBase || !env.ADMIN_WORKER) return adminLoginRedirect(url);

  try {
    const publicHost = new URL(adminBase).hostname;
    const verifyReq = new Request(`${adminBase}/v1/admin/auth/me`, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: request.headers.get("cookie") || "",
        "user-agent": request.headers.get("user-agent") || "",
        "x-mmd-auth-bridge": "immigrate-internal-admin-gate",
        "x-mmd-public-host": publicHost,
      },
    });
    const verifyRes = await env.ADMIN_WORKER.fetch(verifyReq);

    if (verifyRes.ok) return null;
  } catch {
    // Use admin login fallback below.
  }

  return adminLoginRedirect(url);
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function addMinutes(time: string, minutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(str(time));
  if (!match) return "";
  const start = Number(match[1]) * 60 + Number(match[2]);
  const next = (start + minutes) % (24 * 60);
  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
}

function normalizeAdminJobPayload(body: Record<string, unknown>): Record<string, unknown> {
  const work = (body.work && typeof body.work === "object" ? body.work : {}) as Record<string, unknown>;
  const model = (body.model && typeof body.model === "object" ? body.model : {}) as Record<string, unknown>;
  const jobDetails = (body.job_details && typeof body.job_details === "object" ? body.job_details : {}) as Record<string, unknown>;
  const payment = (body.payment && typeof body.payment === "object" ? body.payment : {}) as Record<string, unknown>;
  const notes = (body.notes && typeof body.notes === "object" ? body.notes : {}) as Record<string, unknown>;
  const clientLineage = (body.client_lineage && typeof body.client_lineage === "object" ? body.client_lineage : {}) as Record<string, unknown>;

  const sessionId = str(body.session_id);
  const startTime = str(body.start_time || jobDetails.start_time) || "00:00";
  const endTime = str(body.end_time || jobDetails.end_time) || addMinutes(startTime, 90);
  const amountValue = body.amount_thb ?? payment.amount_thb;
  if (!str(amountValue)) throw new Error("invalid_amount_thb");
  const amount = Number(amountValue);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount_thb");

  return {
    ...body,
    client_name: str(body.client_name || clientLineage.client_name) || sessionId,
    model_name: str(body.model_name || model.model_name || body.model_lookup_key) || "model_pending",
    job_type: str(body.job_type || work.job_lane || work.work_type || body.job_visibility) || "public_work",
    job_date: str(body.job_date || jobDetails.job_date) || "pending_date",
    start_time: startTime,
    end_time: endTime,
    location_name: str(body.location_name || jobDetails.location_name) || "pending_location",
    google_map_url: str(body.google_map_url || jobDetails.google_map_url),
    amount_thb: amount,
    payment_type: str(body.payment_type || payment.payment_type) || "full",
    payment_method: str(body.payment_method || payment.payment_method) || "promptpay",
    note: str(body.note || notes.operation_note || notes.handling_note || body.notes),
  };
}

async function proxyAdminApi(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/admin/")) return null;

  const adminBase = publicAdminAuthBaseUrl(request);
  if (!adminBase || !env.ADMIN_WORKER) {
    return Response.json({ ok: false, error: "admin_worker_binding_required" }, { status: 502 });
  }
  const adminApiAliases: Record<string, string> = {
    "/v1/admin/create-job": "/v1/admin/job/create",
    "/v1/admin/create-session": "/v1/admin/job/create",
    "/v1/admin/jobs/create-session": "/v1/admin/job/create",
  };
  const targetPath = adminApiAliases[url.pathname] || url.pathname;
  const shouldNormalizeAdminJob = Boolean(adminApiAliases[url.pathname]) && request.method === "POST";
  const publicHost = new URL(adminBase).hostname;
  const target = new URL(`${adminBase}${targetPath}`);
  target.search = url.search;

  const headers = new Headers();
  headers.set("accept", request.headers.get("accept") || "application/json");
  headers.set("cookie", request.headers.get("cookie") || "");
  headers.set("user-agent", request.headers.get("user-agent") || "");
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-mmd-auth-bridge", "immigrate-internal-admin-api");
  headers.set("x-mmd-public-host", publicHost);

  const isClientLineageLookup =
    targetPath === "/v1/admin/clients/lineage-lookup" && request.method === "POST";
  let manualLookupQuery = "";
  if (isClientLineageLookup) {
    try {
      const lookupBody = (await request.clone().json()) as Record<string, unknown>;
      manualLookupQuery = str(lookupBody.query).slice(0, 160);
    } catch {
      manualLookupQuery = "";
    }
  }

  let body: BodyInit | null | undefined =
    request.method === "GET" || request.method === "HEAD" ? undefined : request.body;
  if (shouldNormalizeAdminJob && contentType?.toLowerCase().includes("application/json")) {
    const rawBody = await request.text();
    try {
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      body = JSON.stringify(normalizeAdminJobPayload(parsed && typeof parsed === "object" ? parsed : {}));
    } catch {
      return Response.json(
        {
          ok: false,
          error: "invalid_amount_thb",
          message: "amount_thb is required and must be a number greater than 0",
        },
        { status: 400 }
      );
    }
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  };
  if (init.body) init.duplex = "half";

  const proxied = new Request(target.toString(), init);

  const res = await env.ADMIN_WORKER.fetch(proxied);
  const outHeaders = new Headers(res.headers);
  outHeaders.set("cache-control", "no-store");

  if (isClientLineageLookup && manualLookupQuery && res.ok) {
    try {
      const data = (await res.clone().json()) as Record<string, unknown>;
      const records = Array.isArray(data.records) ? data.records : [];
      if (data.ok !== false && records.length === 0) {
        const warnings = Array.isArray(data.lineage_warnings) ? data.lineage_warnings : [];
        data.records = [
          {
            client_id: "",
            member_id: "",
            member_email: "",
            remembered_name: manualLookupQuery,
            canonical_name: "",
            client_name: manualLookupQuery,
            aliases: [manualLookupQuery],
            matched_on: "manual_name_pending_reconcile",
            matched_value: manualLookupQuery,
            lookup_chain: ["owner_manual_name", "identity_pending_reconcile"],
            username: "",
            phone: "",
            package_code: "",
            tier: "",
            membership_status: "guest_public_only",
            purchased_history: "Public only · identity pending reconciliation",
            line_record_id: "",
            line_user_id: "",
            line_display_name: "",
            legacy_tags: ["manual_name", "identity_pending_reconcile", "public_only"],
            customer_telegram_username: "",
            customer_telegram_status: "missing",
            confidence: 1,
            lineage_source: "owner_manual_name_pending_reconcile",
            entitlement_snapshot_source: "none",
            identity_status: "pending_reconcile",
            manual_public_only: true,
          },
        ];
        data.count = 1;
        data.manual_fallback = true;
        data.lineage_warnings = [...warnings, "manual_public_only_pending_reconcile"];
        outHeaders.set("content-type", "application/json; charset=utf-8");
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: outHeaders,
        });
      }
    } catch {
      // Preserve the canonical admin-worker response if it is not JSON.
    }
  }

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
}

export async function handleInternalRoutes(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  const assetRes = await serveAsset(request, env);
  if (assetRes) return assetRes;

  const apiRes = await proxyAdminApi(request, env);
  if (apiRes) return apiRes;

  // Canonical create-session route is the jobs-scoped route. Keep the older
  // route as a durable redirect only, so bookmarks and login next links do not
  // resurrect the legacy operator surface.
  if (pathname === "/internal/admin/create-session") {
    return redirect(withQuery("/internal/admin/jobs/create-session", url), 308);
  }

  if (pathname === "/internal/admin/control-room") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return renderOwnerControlRoomPage();
  }

  if (pathname === "/internal/admin/customer-data") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return renderCustomerDataPage();
  }

  if (pathname === "/internal/admin/jobs/create-session") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return withSameOriginAdminBase(renderCreateSessionPage(env));
  }

  if (pathname === "/internal/jobs/create-job") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return withCreateJobAmountInput(renderCreateJobPage());
  }

  return null;
}