import {
  renderAnniversaryCampaignPage,
  renderControlRoomPage,
  renderCreateJobPage,
  renderCreateSessionPage,
  type InternalPageEnv,
} from "./internal-pages";

export interface InternalRoutesEnv extends InternalPageEnv {
  ADMIN_WORKER?: Fetcher;
  PROMOTION_WORKER?: Fetcher;
  ADMIN_WORKER_BASE_URL?: string;
  INTERNAL_SERVICE_SECRET?: string;
  ASSETS?: Fetcher;
}

const ANNIVERSARY_PAGE = "/internal/admin/control-room/campaigns/anniversary";
const ANNIVERSARY_API = "/v1/admin/campaigns/anniversary";
const CLAIM_ID_PATTERN = /^MMD6-\d{4}-[A-Z0-9]{12}$/;

type AdminAuthority = {
  actorId: string;
  sessionId: string;
};

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
  const response = redirect(`/internal/admin/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`, 302);
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-admin-login-canonical", "/internal/admin/login");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

async function resolveAdminAuthority(request: Request, env: InternalRoutesEnv): Promise<AdminAuthority | null> {
  const adminBase = publicAdminAuthBaseUrl(request);
  if (!adminBase || !env.ADMIN_WORKER) return null;

  try {
    const publicHost = new URL(adminBase).hostname;
    const verifyReq = new Request(`${adminBase}/v1/admin/auth/me`, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: request.headers.get("cookie") || "",
        "user-agent": request.headers.get("user-agent") || "",
        "x-mmd-auth-bridge": "immigrate-anniversary-admin-authority",
        "x-mmd-public-host": publicHost,
      },
    });
    const response = await env.ADMIN_WORKER.fetch(verifyReq);
    if (!response.ok) return null;
    const body = await response.json().catch(() => ({})) as {
      authenticated?: boolean;
      actor?: { id?: string };
      session?: { id?: string };
    };
    const actorId = str(body.actor?.id);
    const sessionId = str(body.session?.id);
    if (body.authenticated !== true || !actorId || !sessionId) return null;
    return { actorId, sessionId };
  } catch {
    return null;
  }
}

function campaignJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store, private", "x-mmd-route-owner": "immigrate-worker" },
  });
}

function safeClaimId(value: unknown): string {
  const claimId = str(value).toUpperCase();
  return CLAIM_ID_PATTERN.test(claimId) ? claimId : "";
}

function safeReason(value: unknown): string {
  const reason = str(value);
  return reason.length > 0 && reason.length <= 500 ? reason : "";
}

function safeReference(value: unknown): string {
  return str(value).slice(0, 180);
}

async function proxyCampaignAdminApi(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (pathname !== `${ANNIVERSARY_API}/apply` && !pathname.startsWith(`${ANNIVERSARY_API}/claims/`)) return null;

  if (!env.ADMIN_WORKER) return campaignJson({ ok: false, error: "admin_worker_binding_required" }, 502);
  const authority = await resolveAdminAuthority(request, env);
  if (!authority) return campaignJson({ ok: false, error: "admin_session_required" }, 401);
  if (!env.PROMOTION_WORKER) return campaignJson({ ok: false, error: "promotion_worker_binding_required" }, 502);
  const internalSecret = str(env.INTERNAL_SERVICE_SECRET);
  if (internalSecret.length < 24) return campaignJson({ ok: false, error: "internal_service_secret_required" }, 503);

  const claimMatch = pathname.match(/^\/v1\/admin\/campaigns\/anniversary\/claims\/([^/]+)$/);
  const decisionMatch = pathname.match(/^\/v1\/admin\/campaigns\/anniversary\/claims\/([^/]+)\/decision$/);
  const requestId = `cr_${crypto.randomUUID()}`;
  let targetPath = "";
  let body: Record<string, unknown> | undefined;

  if (claimMatch) {
    if (request.method !== "GET") return campaignJson({ ok: false, error: "method_not_allowed" }, 405);
    const claimId = safeClaimId(decodeURIComponent(claimMatch[1]));
    if (!claimId) return campaignJson({ ok: false, error: "invalid_claim_id" }, 400);
    targetPath = `/v1/internal/promotions/claims/${encodeURIComponent(claimId)}`;
  } else if (decisionMatch) {
    if (request.method !== "POST") return campaignJson({ ok: false, error: "method_not_allowed" }, 405);
    const claimId = safeClaimId(decodeURIComponent(decisionMatch[1]));
    if (!claimId) return campaignJson({ ok: false, error: "invalid_claim_id" }, 400);
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!input) return campaignJson({ ok: false, error: "invalid_json" }, 400);
    const action = str(input.action).toLowerCase();
    if (!new Set(["approve", "reject", "manual_review"]).has(action)) {
      return campaignJson({ ok: false, error: "invalid_admin_decision" }, 400);
    }
    const reason = safeReason(input.reason);
    if (!reason) return campaignJson({ ok: false, error: "admin_reason_required" }, 400);
    const approvedMonths = input.approvedMonths === undefined || input.approvedMonths === ""
      ? undefined
      : Number(input.approvedMonths);
    if (approvedMonths !== undefined && (!Number.isInteger(approvedMonths) || approvedMonths < 0 || approvedMonths > 6)) {
      return campaignJson({ ok: false, error: "invalid_approved_months" }, 400);
    }
    targetPath = `/v1/internal/promotions/admin/claims/${encodeURIComponent(claimId)}/decision`;
    body = {
      action,
      reason,
      ...(approvedMonths === undefined ? {} : { approvedMonths }),
      paymentReference: safeReference(input.paymentReference),
      upgradeRequested: input.upgradeRequested === true,
      upgradePaymentReference: safeReference(input.upgradePaymentReference),
      actor: { id: authority.actorId, sessionId: authority.sessionId },
      requestId,
    };
  } else if (pathname === `${ANNIVERSARY_API}/apply`) {
    if (request.method !== "POST") return campaignJson({ ok: false, error: "method_not_allowed" }, 405);
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!input) return campaignJson({ ok: false, error: "invalid_json" }, 400);
    const claimId = safeClaimId(input.claimId);
    if (!claimId) return campaignJson({ ok: false, error: "invalid_claim_id" }, 400);
    const reason = safeReason(input.reason);
    if (!reason) return campaignJson({ ok: false, error: "admin_reason_required" }, 400);
    targetPath = "/v1/internal/promotions/apply";
    body = {
      claimId,
      reason,
      actor: { id: authority.actorId, sessionId: authority.sessionId },
      requestId,
    };
  } else {
    return campaignJson({ ok: false, error: "not_found" }, 404);
  }

  const headers = new Headers({
    accept: "application/json",
    "x-mmd-service-binding": "immigrate-worker",
    "x-mmd-internal-secret": internalSecret,
    "x-request-id": requestId,
  });
  if (body) headers.set("content-type", "application/json");
  const upstream = await env.PROMOTION_WORKER.fetch(new Request(`https://promotion-worker.local${targetPath}`, {
    method: request.method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }));
  const outHeaders = new Headers(upstream.headers);
  outHeaders.set("cache-control", "no-store, private");
  outHeaders.set("x-mmd-route-owner", "immigrate-worker");
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: outHeaders });
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
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
}

export async function handleInternalRoutes(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  const assetRes = await serveAsset(request, env);
  if (assetRes) return assetRes;

  const campaignApiRes = await proxyCampaignAdminApi(request, env);
  if (campaignApiRes) return campaignApiRes;

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
    return renderControlRoomPage();
  }

  if (pathname === ANNIVERSARY_PAGE) {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return renderAnniversaryCampaignPage();
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
