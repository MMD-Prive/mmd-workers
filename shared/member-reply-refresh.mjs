const URL = "https://member-pages-worker.internal/__internal/kenji/member-reply-snapshot/refresh";
const LINE_ID = /^U[0-9a-f]{32}$/i;
const MEMBER_ID = /^[A-Za-z0-9_:-]{3,100}$/;

export async function requestMemberReplyRefresh(env, binding, caller, identity = {}, reason = "event") {
  const service = env?.[binding];
  if (!service?.fetch) return false;
  const lineUserId = String(identity.line_user_id || "").trim();
  const memberId = String(identity.member_id || "").trim();
  if (!LINE_ID.test(lineUserId) && !MEMBER_ID.test(memberId)) return false;
  try {
    const response = await service.fetch(new Request(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": caller,
      },
      body: JSON.stringify({
        ...(LINE_ID.test(lineUserId) ? { line_user_id: lineUserId } : { member_id: memberId }),
        reason,
      }),
      signal: AbortSignal.timeout(2500),
    }));
    return response.status === 202;
  } catch {
    return false;
  }
}
