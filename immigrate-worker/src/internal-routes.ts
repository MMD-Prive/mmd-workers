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
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD · Customer Data Console</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 8% 0,rgba(223,189,114,.16),transparent 30%),linear-gradient(180deg,#070604,#11100d);color:#fff8ee;font-family:"LINE Seed Sans TH","Noto Sans Thai","Noto Sans",system-ui,sans-serif}.cd{max-width:1180px;margin:0 auto;padding:22px}.hero,.panel{border:1px solid rgba(255,226,163,.18);border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02));box-shadow:0 24px 70px rgba(0,0,0,.28)}.hero{padding:28px;min-height:260px;display:grid;align-content:end}.k{color:#f1d083;font-size:12px;font-weight:950;letter-spacing:.16em;text-transform:uppercase}.hero h1{margin:12px 0 10px;font-size:clamp(42px,8vw,86px);line-height:.9;letter-spacing:-.06em}.hero p{max-width:780px;margin:0;color:rgba(255,248,238,.72);line-height:1.75;font-weight:750}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.btn{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 16px;border-radius:999px;border:1px solid rgba(255,226,163,.2);color:#fff8ee;text-decoration:none;font-weight:950}.btn.gold{background:linear-gradient(135deg,#fff4bd,#edc66f 54%,#ad7a25);color:#130c05;border:0}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px}.panel{padding:18px}.panel h2{margin:8px 0 8px;color:#ffdf91;font-size:24px}.panel p,.panel li{color:rgba(255,248,238,.68);line-height:1.65}.panel ul{padding-left:18px;margin:8px 0 0}.badge{display:inline-flex;align-items:center;min-height:28px;padding:0 10px;border:1px solid rgba(255,226,163,.18);border-radius:999px;color:#f1d083;font-size:11px;font-weight:950;text-transform:uppercase}.warn{border-color:rgba(255,170,150,.25);color:#ffc1bd;background:rgba(255,170,150,.06)}.wide{grid-column:1/-1}.flow{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:12px}.step{padding:12px;border:1px solid rgba(255,226,163,.14);border-radius:16px;background:rgba(0,0,0,.18);font-size:13px;font-weight:950;color:#fff8ee}.muted{color:rgba(255,248,238,.56)!important;font-size:13px}code{color:#f1d083;word-break:break-all}@media(max-width:850px){.grid,.flow{grid-template-columns:1fr}.cd{padding:12px}.hero{padding:22px}.panel{padding:16px}}
</style></head><body><main class="cd"><section class="hero"><span class="k">CANONICAL INTERNAL OPERATIONS CONSOLE · V1 PLACEHOLDER</span><h1>Customer Data</h1><p>ศูนย์กลางนำเข้าข้อมูลลูกค้า, จับคู่ตัวตน, เก็บบริบทส่วนตัว, review ประวัติ และเตรียม Telegram reconciliation — หน้านี้ไม่ใช่ membership editor, payment verifier, points creator หรือ message sender</p><div class="actions"><a class="btn gold" href="/internal/admin/control-room">กลับ Control Room</a><a class="btn" href="/internal/admin/jobs/create-session">Create Session</a><a class="btn" href="/internal/admin/kenji">Kenji Control</a></div></section><section class="grid"><article class="panel"><span class="badge">01 Overview</span><h2>Backfill readiness</h2><p>Console Inbox / LINE OFC import จะเป็น source ของ evidence เข้าหน้านี้ แต่ batch action ยังต้องทำผ่าน worker contract ที่มี idempotency key</p><ul><li>Run Console Inbox Backfill</li><li>Pause / Resume / Retry failed</li><li>matched / review_required / no_match / failed</li></ul></article><article class="panel" id="identity"><span class="badge">02 Identity Review</span><h2>Link before action</h2><p>ค้นด้วยชื่อ, LINE ID, email, phone, alias, Telegram username แล้วตัดสินใจ link/create candidate/ignore โดยไม่สร้างสิทธิ์หรือ group access</p></article><article class="panel" id="private-context"><span class="badge">03 Private Context</span><h2>Kenji-safe context</h2><p>raw LINE notes, application sensitive, behaviour/care context และ preferred communication ต้องอ่านผ่าน server-scoped context พร้อม audit purpose</p></article><article class="panel" id="history-review"><span class="badge">04 Service History</span><h2>3 approvals, not one</h2><ul><li>Service history</li><li>Payment evidence</li><li>Points</li></ul><p>ทุกอย่างต้อง staged → review_required → approved/rejected → materialized</p></article><article class="panel" id="telegram"><span class="badge">05 Telegram Prep</span><h2>Observed only</h2><p>แสดง Telegram username/user ID และ observed group หลัง identity link + Resolver เท่านั้น ส่วน Add/Remove/Review อยู่กับ membership-access/router กลาง</p></article><article class="panel"><span class="badge warn">Legacy</span><h2>LINE Notes Import</h2><p><code>/internal/ceo/line-notes-import</code> เป็น legacy / not production-ready ใช้ Customer Data เป็น canonical route แทน</p></article><article class="panel wide"><span class="badge">Boundary lock</span><h2>Truth boundaries</h2><div class="flow"><div class="step">LINE Console Inbox</div><div class="step">Batch Backfill</div><div class="step">Client Match</div><div class="step">Private Context</div><div class="step">Review</div><div class="step">Resolver / Telegram Prep</div></div><p class="muted">Airtable = evidence/review/audit · Canonical Client = reviewed identity · Entitlement Resolver = current access truth · Telegram/Drive = downstream observed only · Kenji = server-scoped read with audit</p></article></section></main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-mmd-customer-data-ui": "placeholder-v1",
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
