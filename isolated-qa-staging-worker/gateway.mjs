import { page, client } from "./ui.mjs";

export const origin = "https://mmd-isolated-qa-staging.malemodel-bkk.workers.dev";
const cookieName = "__Host-mmd-qa";
const fixtureUser = "U00000000000000000000000000000001";
const fixtureEvidence = "MMD QA PAYMENT EVIDENCE — SYNTHETIC ONLY\n";
const sessionAge = 900;
const lineId = /^U[a-f0-9]{32}$/i;
const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; script-src 'self' https://static.line-scdn.net; connect-src 'self' https://api.line.me https://liff.line.me https://access.line.me; style-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

function json(status, body, extra = {}) {
  return Response.json(body, { status, headers: { ...headers, ...extra } });
}

function sessionCookie(id, age) {
  return `${cookieName}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}

async function verifyLine(token, channel) {
  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    body: new URLSearchParams({ id_token: token, client_id: channel }),
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.aud === channel && lineId.test(data.sub) && data.exp > Date.now() / 1000 ? data.sub : null;
}

async function memberFixture(env) {
  const response = await env.QA_AUTH.fetch("https://qa-auth.invalid/__internal/member-status/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-mmd-member-resolver-secret": env.QA_AUTH_RESOLVER_SECRET },
    body: JSON.stringify({ line_user_id: fixtureUser, purpose: "liff_identity_resolution" }),
    redirect: "manual",
  });
  if (!response.ok || (await response.json())?.data?.member_exists !== true) {
    return json(503, { error: "qa_fixture_unavailable" });
  }
  return json(200, { member: "MMD-STAGING-CURRENT-01", fixture: true });
}

async function readSmallBody(request, limit) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function paymentFixture(request, store) {
  if (request.headers.get("Content-Type") !== "text/plain") {
    return json(400, { error: "qa_fixture_file_required" });
  }
  if (await readSmallBody(request, 128) !== fixtureEvidence) return json(400, { error: "qa_fixture_file_required" });
  const key = "payment/astra-evidence-v1";
  const created = await store.put(key, fixtureEvidence, { onlyIf: { etagDoesNotMatch: "*" } });
  return json(created ? 201 : 200, { id: "astra-evidence-v1", status: "qa_received", duplicate: !created });
}

export function createGateway(verify = verifyLine) {
  return {
    async fetch(request, env) {
      try {
        const { origin: host, pathname } = new URL(request.url);
        if (host !== origin) return json(421, { error: "qa_host_required" });
        const { QA_STORAGE: store, QA_LINE_SUBJECT: subject, QA_LINE_CHANNEL_ID: channel, QA_LIFF_ID: liffId } = env;
        if (env.QA_ENABLED !== "true" || !store || !env.QA_AUTH || !lineId.test(subject ?? "")
          || !/^\d+$/.test(channel ?? "") || !/^[\d]+-[\w-]+$/.test(liffId ?? "")
          || !liffId.startsWith(channel + "-") || (env.QA_AUTH_RESOLVER_SECRET ?? "").length < 32) {
          return json(503, { error: "qa_disabled" });
        }
        const { method } = request;
        if (method === "POST" && request.headers.get("Origin") !== origin) return json(403, { error: "qa_origin_required" });
        if (method === "GET" && pathname === "/member/liff") {
          return new Response(page(liffId), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
        }
        if (method === "GET" && pathname === "/qa.js") {
          return new Response(client, { headers: { ...headers, "Content-Type": "text/javascript; charset=utf-8" } });
        }
        if (method === "POST" && pathname === "/qa/session") {
          const body = await readSmallBody(request, 8192);
          let token;
          try { token = JSON.parse(body)?.idToken; } catch { /* malformed body */ }
          if (typeof token !== "string" || !token || await verify(token, channel) !== subject) {
            return json(403, { error: "qa_identity_required" });
          }
          const id = crypto.randomUUID();
          await store.put("session/" + id, String(Date.now() + sessionAge * 1000));
          return json(200, { fixture: true }, { "Set-Cookie": sessionCookie(id, sessionAge) });
        }
        const id = (request.headers.get("Cookie") ?? "").match(/(?:^|;\s*)__Host-mmd-qa=([a-f0-9-]{36})(?:;|$)/)?.[1];
        const session = id ? await store.get("session/" + id) : null;
        if (!session || !(Number(await session.text()) > Date.now())) return json(401, { error: "qa_session_required" });
        if (method === "POST" && pathname === "/qa/logout") {
          await store.delete("session/" + id);
          return json(200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
        }
        if (method === "GET" && pathname === "/qa/private-booking") {
          try {
            const result = await env.QA_AUTH.fetch("https://qa-auth.invalid/__internal/qa/private-booking", {
              headers: { "x-mmd-member-resolver-secret": env.QA_AUTH_RESOLVER_SECRET },
              redirect: "manual",
            });
            if (!result.ok) return json(503, {});
            const { current, returning } = await result.json();
            if (![current, returning].every(value => value === "allow" || value === "deny")) return json(503, {});
            return json(200, { current, returning });
          } catch {
            return json(503, {});
          }
        }
        if (method === "GET" && pathname === "/qa/member") return await memberFixture(env);
        if (method === "GET" && pathname === "/qa/fixture/evidence") {
          return new Response(fixtureEvidence, { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": 'attachment; filename="qa-evidence.txt"' } });
        }
        if (method === "POST" && pathname === "/qa/payment") return await paymentFixture(request, store);
        if (method === "GET" && pathname === "/qa/payment") {
          const found = await store.head("payment/astra-evidence-v1");
          return json(found ? 200 : 404, { status: found ? "qa_received" : "qa_missing" });
        }
        if (method === "POST" && pathname === "/qa/kenji") {
          if (await readSmallBody(request, 128) !== "KENJI-QA-001") return json(400, { error: "qa_prompt_required" });
          return json(200, { reply: "KENJI-QA-001 · fixture reply", fixture: true });
        }
        return json(404, { error: "qa_route_not_found" });
      } catch {
        return json(503, { error: "qa_unavailable" });
      }
    },
  };
}

export default createGateway();
