// Service-bound LINE profile lookup for admin-worker.
// The OA token lives on this worker only; admin-worker asks for the profile
// picture instead of holding a second copy of the token.
function asString(value) {
  return String(value ?? "").trim();
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function handleServiceBoundLineProfile(request, env = {}, fetchImpl = fetch) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await request.json().catch(() => ({}));
  const lineUserId = asString(body?.line_user_id);
  if (!/^U[0-9a-f]{32}$/i.test(lineUserId)) return json({ ok: false, error: "line_user_id_invalid" }, 400);
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!token) return json({ ok: false, error: "line_token_not_configured" }, 503);

  let response;
  try {
    response = await fetchImpl(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch (_) {
    return json({ ok: false, error: "line_profile_request_failed" }, 502);
  }
  if (!response.ok) return json({ ok: false, error: `line_profile_http_${response.status}`, line_status: response.status }, 200);
  const profile = await response.json().catch(() => ({}));
  const pictureUrl = asString(profile?.pictureUrl);
  if (!/^https:\/\//i.test(pictureUrl)) return json({ ok: false, error: "line_profile_picture_missing" }, 200);
  return json({ ok: true, picture_url: pictureUrl, display_name: asString(profile?.displayName) });
}
