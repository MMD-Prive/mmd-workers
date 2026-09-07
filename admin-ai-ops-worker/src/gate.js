import aiOpsWorker from "./ceo-bridge.js";

const CONTEXT_PATH = "/v1/admin/ai-ops/context";
const CLIENT_PATH = "/v1/admin/ai-ops/client.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (request.method === "GET" && path === CLIENT_PATH) {
      return withSessionReauthClient(await aiOpsWorker.fetch(request, env, ctx));
    }

    if (request.method === "GET" && path === CONTEXT_PATH) {
      const auth = await verifyAdminStrict(request);
      if (!auth.ok) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
          status: 401,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
    }
    return aiOpsWorker.fetch(request, env, ctx);
  },
};

async function withSessionReauthClient(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/javascript")) return response;
  const source = await response.text();
  const needle = "if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));render(d)";
  if (!source.includes(needle)) return new Response(source, { status: response.status, statusText: response.statusText, headers: response.headers });

  const replacement = "if(r.status===401){const back=(p==='/internal/ceo'||p.startsWith('/internal/ceo/'))?'/internal/admin/control-room':location.pathname+location.search+location.hash,login='/internal/admin/login?next='+encodeURIComponent(back);body.innerHTML='<div class=\"mmd-aiops-item mmd-aiops-warn\"><strong>Back Office session หมดอายุหรือยังไม่ได้ยืนยัน</strong><span class=\"mmd-aiops-sub\">เข้าสู่ระบบอีกครั้ง แล้ว PER · AI OPS จะอ่านบริบทต่อได้ครับ</span></div><a class=\"mmd-aiops-a\" data-mmd-aiops-reauth=\"v1\" href=\"'+esc(login)+'\">เข้าสู่ Back Office ↗</a>';return}if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));render(d)";
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "public, max-age=30");
  headers.set("x-mmd-ai-ops-session-ux", "reauth-v1");
  return new Response(source.replace(needle, replacement), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function verifyAdminStrict(request) {
  try {
    const url = new URL(request.url);
    url.pathname = "/v1/admin/auth/me";
    url.search = "";
    const headers = new Headers({ accept: "application/json" });
    for (const key of ["cookie", "origin", "user-agent"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      redirect: "manual",
    });
    if (!response.ok) return { ok: false };
    const body = await response.json().catch(() => null);
    return {
      ok: Boolean(body && body.ok === true && body.authenticated === true),
      actor: body || null,
    };
  } catch {
    return { ok: false };
  }
}

function normalizePath(value = "") {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
