const LIFF_START_PATHS = new Set(["/member/api/liff/start", "/member/api/liff/start/"]);
const MEMBER_STATUS_PATH = "/__internal/member-status/resolve";
const MEMBER_PROFILE_PATH = "/__internal/member-profile/read";
const MEMBER_STATUS_PURPOSE = "liff_identity_resolution";
const MEMBER_RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";

export function withStatusFirstMemberResolver(request, env = {}) {
  if (!isLiffStartRequest(request)) return env;
  const upstream = env.MEMBER_STATUS_RESOLVER;
  const resolverSecret = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");
  if (!upstream?.fetch || resolverSecret.length < 32) return env;

  const memberStatusResolver = {
    async fetch(input, init) {
      const profileRequest = input instanceof Request ? input : new Request(input, init);
      let path = "";
      try {
        path = new URL(profileRequest.url).pathname;
      } catch {
        return upstream.fetch(profileRequest);
      }
      if (path !== MEMBER_PROFILE_PATH) return upstream.fetch(profileRequest);

      const profileBody = await profileRequest.clone().json().catch(() => null);
      const lineUserId = String(profileBody?.line_user_id || "").trim();
      if (!/^U[a-f0-9]{32}$/i.test(lineUserId)) return upstream.fetch(profileRequest);

      const statusResponse = await upstream.fetch(new Request(`https://mmd-auth-worker.internal${MEMBER_STATUS_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [MEMBER_RESOLVER_SECRET_HEADER]: resolverSecret,
        },
        body: JSON.stringify({ line_user_id: lineUserId, purpose: MEMBER_STATUS_PURPOSE }),
        signal: profileRequest.signal,
      }));
      const statusPayload = await statusResponse.clone().json().catch(() => null);
      const statusData = statusPayload?.data && typeof statusPayload.data === "object" ? statusPayload.data : null;

      if (!statusResponse.ok || statusPayload?.ok !== true || typeof statusData?.member_exists !== "boolean") {
        return statusResponse;
      }
      if (statusData.member_exists === false) {
        return jsonResponse({ ok: true, data: { member_exists: false } }, 200);
      }
      return upstream.fetch(profileRequest);
    },
  };

  return { ...env, MEMBER_STATUS_RESOLVER: memberStatusResolver };
}

function isLiffStartRequest(request) {
  if (!(request instanceof Request) || request.method !== "POST") return false;
  try {
    return LIFF_START_PATHS.has(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
