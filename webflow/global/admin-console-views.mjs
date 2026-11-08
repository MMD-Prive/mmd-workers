export const ADMIN_CONSOLE_PATH = "/internal/admin/console";

// Presentation routes only. APIs, login, sign-out and separate role workspaces
// must never be mounted as Console views.
export const ADMIN_CONSOLE_VIEWS = Object.freeze({
  "create-job": ["/internal/admin/jobs/create-job", "สร้างงาน"],
  "jobs": ["/internal/admin/jobs/all", "งานทั้งหมด"],
  "edit-job": ["/internal/admin/jobs/edit", "แก้ไขงาน"],
  "model-preview": ["/internal/admin/jobs/model-preview", "ตัวอย่างงานนายแบบ"],
  "create-session": ["/internal/admin/jobs/create-session", "สร้าง Session"],
  "job-board": ["/internal/admin/jobs/job-board", "Job Board"],
  "payments": ["/internal/admin/payments", "ตรวจสลิปและการชำระ"],
  "historical-payments": ["/internal/admin/payments/historical-backfill", "หลักฐานย้อนหลัง"],
  "refunds": ["/internal/admin/refunds", "รายการคืนเงิน"],
  "customers": ["/internal/admin/customer-data", "ข้อมูลลูกค้า"],
  "membership": ["/internal/admin/member-intelligence", "ข้อมูลสมาชิก"],
  "recovery": ["/internal/admin/recovery", "ติดตามงานค้าง"],
  "model-link": ["/internal/admin/model-link", "เชื่อมบัญชีนายแบบ"],
  "control-room": ["/internal/admin/control-room", "Control Room"],
});

// Serialize these URL rules into the browser alongside the same route table.
export function consoleViewRouting(consolePath, views, origin) {
  const byPath = new Map(Object.entries(views).map(([view, [path]]) => [path, view]));
  const pathOf = url => url.pathname.replace(/\/+$/, "") || "/";
  const hasCredentials = url => [...url.searchParams.keys()].some(key =>
    /^(token|access_token|code|credential|access_code|secret|key|session|password)$/i.test(key));
  const asUrl = value => new URL(value, origin);
  const relative = url => url.pathname + url.search + url.hash;

  function toConsole(value) {
    const url = asUrl(value);
    if (url.origin !== origin || hasCredentials(url)) return "";
    const path = pathOf(url);
    if (path === consolePath) return relative(url);
    if (path === "/internal/admin" || path === "/internal/admin/dashboard") return consolePath;
    const view = byPath.get(path);
    if (!view) return "";
    const params = new URLSearchParams({ view });
    for (const [name, value] of url.searchParams) {
      // Reserve the shell's view selector while round-tripping legacy queries.
      params.append(/^(?:tool_)*view$/.test(name) ? "tool_" + name : name, value);
    }
    return consolePath + "?" + params + url.hash;
  }

  function resolve(value) {
    const url = asUrl(value);
    if (url.origin !== origin || pathOf(url) !== consolePath) return null;
    const selectors = url.searchParams.getAll("view");
    if (!selectors.length) return { view: "", title: "Console", tool: "" };
    const [view] = selectors;
    if (selectors.length !== 1 || !Object.hasOwn(views, view) || hasCredentials(url)) return null;
    const [path, title] = views[view];
    const params = new URLSearchParams();
    for (const [name, value] of url.searchParams) {
      if (name !== "view") params.append(/^(?:tool_)+view$/.test(name) ? name.slice(5) : name, value);
    }
    return { view, title, tool: path + (params.size ? "?" + params : "") + url.hash };
  }

  return { toConsole, resolve, toolPaths: [...byPath.keys(), consolePath, "/internal/admin", "/internal/admin/dashboard"] };
}

// Only relax the presentation document's ancestor policy when the browser
// loads this exact tool from the same-origin Console. The owning route has
// already handled its original request, including its own authentication.
export function allowAdminConsoleFrame(request, response) {
  if (request.method !== "GET" || response.status !== 200
    || request.headers.get("sec-fetch-dest") !== "iframe"
    || request.headers.get("sec-fetch-mode") !== "navigate"
    || request.headers.get("sec-fetch-site") !== "same-origin"
    || !(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) return response;

  const url = new URL(request.url);
  if (!["https://mmdbkk.com", "https://www.mmdbkk.com"].includes(url.origin)) return response;
  const referrer = request.headers.get("referer");
  if (!referrer || !URL.canParse(referrer)) return response;
  const route = consoleViewRouting(ADMIN_CONSOLE_PATH, ADMIN_CONSOLE_VIEWS, url.origin).resolve(referrer);
  if (!route?.tool) return response;
  const tool = new URL(route.tool, url.origin);
  if (tool.pathname !== url.pathname || tool.search !== url.search) return response;

  const headers = new Headers(response.headers);
  // Preserve all other directives, including those in multiple CSP policies.
  const policy = headers.get("content-security-policy");
  headers.set("content-security-policy", policy ? policy.split(",").map(part =>
    /(?:^|;)\s*frame-ancestors\b/i.test(part)
      ? part.replace(/(^|;)\s*frame-ancestors\b[^;]*/gi, "$1 frame-ancestors 'self'")
      : part + "; frame-ancestors 'self'").join(",") : "frame-ancestors 'self'");
  headers.set("x-frame-options", "SAMEORIGIN");
  headers.set("cache-control", "no-store, private");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
