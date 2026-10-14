const ROOT = "public-job-board/v2";
const KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;
const HASH_RE = /^[a-f0-9]{64}$/;

function response(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store, private" } });
}
function fail(code, status = 400) { throw Object.assign(new Error(code), { status }); }
async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, "0")).join("");
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
async function reservationKey(owner, key) {
  if (!HASH_RE.test(owner || "")) fail("owner_scope_required", 401);
  if (!KEY_RE.test(key || "")) fail("idempotency_key_required");
  return `${ROOT}/publish/${owner}/${await hash(key)}.json`;
}

// One immutable atomic reservation captures the winning payload and generated
// job. All writers can safely finish it using conditional create, even after
// a crash. No leases, deletion, expiry or speculative second job are needed.
export async function handleBroadcastOwnerBridge(request, env, api) {
  const url = new URL(request.url);
  const action = url.pathname.slice("/__internal/job-board/".length);
  const owner = request.headers.get("x-mmd-owner-scope");
  if (!HASH_RE.test(owner || "")) fail("owner_scope_required", 401);
  if (request.method === "POST" && action === "publish") {
    const input = await request.json();
    const key = await reservationKey(owner, request.headers.get("idempotency-key"));
    const fingerprint = await hash(JSON.stringify(canonical(input)));
    // Client job ids must never overwrite existing records or change scope.
    delete input.id;
    const operation = await hash(key);
    const candidate = { schema: "mmd_broadcast_publish_v1", fingerprint, job: { ...api.createJobRecord(input), broadcast_operation: operation } };
    try { await api.putJson(env, key, candidate, { onlyIfMissing: true }); }
    catch (e) { if (e.message !== "record_already_exists") throw e; }
    const reservation = await api.getJson(env, key);
    if (reservation?.schema !== candidate.schema || !reservation.job?.id) fail("publish_reservation_invalid", 503);
    if (reservation.fingerprint !== fingerprint) return response({ ok: false, error: "idempotency_payload_mismatch", outcome: "rejected" }, 409);
    const job = reservation.job;
    const alias = await api.reserveShortCode(env, job.id);
    job.short_code = alias.code;
    try { await api.putJson(env, api.jobKey(job.id), job, { onlyIfMissing: true }); }
    catch (e) { if (e.message !== "record_already_exists") throw e; }
    const stored = await api.getJson(env, api.jobKey(job.id));
    if (!stored || stored.broadcast_operation !== operation || stored.short_code !== alias.code) fail("publish_job_integrity_failed", 503);
    return response({ ok: true, state: "published", job: api.ownerJobView(api.applyOwnerConfirmedJobCorrections(stored)) });
  }
  if (request.method !== "GET") return response({ ok: false, error: "method_not_allowed" }, 405);
  if (action === "status") {
    const key = await reservationKey(owner, url.searchParams.get("idempotency_key"));
    const reservation = await api.getJson(env, key);
    if (!reservation) return response({ ok: true, state: "not_found", retry_safe: true });
    if (reservation.schema !== "mmd_broadcast_publish_v1" || !reservation.job?.id) fail("publish_reservation_invalid", 503);
    const job = await api.getJson(env, api.jobKey(reservation.job.id));
    if (!job) return response({ ok: true, state: "pending", retry_safe: true, job_id: reservation.job.id });
    if (job.schema !== "mmd_public_job_board_v2.job" || job.broadcast_operation !== await hash(key)) fail("publish_job_integrity_failed", 503);
    const alias = await api.getJson(env, api.shortJobKey(job.short_code));
    if (alias?.job_id !== job.id) fail("publish_short_link_integrity_failed", 503);
    return response({ ok: true, state: "published", retry_safe: false, job: api.ownerJobView(api.applyOwnerConfirmedJobCorrections(job)), job_id: job.id, broadcast_url: api.ownerJobView(job).broadcast_url });
  }
  if (action === "jobs") {
    const limit = Number(url.searchParams.get("limit") || 20);
    const cursor = url.searchParams.get("cursor") || undefined;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (cursor && cursor.length > 2048)) fail("pagination_invalid");
    const page = await env.PUBLIC_ACCESS_EVIDENCE.list({ prefix: `${ROOT}/jobs/`, limit, ...(cursor ? { cursor } : {}) });
    const jobs = await Promise.all(page.objects.map(async object => {
      const row = await api.getJson(env, object.key);
      if (row?.schema !== "mmd_public_job_board_v2.job") fail("stored_record_invalid", 503);
      return api.ownerJobView(api.applyOwnerConfirmedJobCorrections(row));
    }));
    return response({ ok: true, jobs, next_cursor: page.truncated ? page.cursor : null });
  }
  if (action.startsWith("jobs/")) {
    const id = decodeURIComponent(action.slice(5));
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/.test(id)) fail("job_id_invalid");
    const job = await api.getJson(env, api.jobKey(id));
    if (!job) return response({ ok: false, error: "job_not_found" }, 404);
    if (job.schema !== "mmd_public_job_board_v2.job") fail("stored_record_invalid", 503);
    return response({ ok: true, job: api.ownerJobView(api.applyOwnerConfirmedJobCorrections(job)) });
  }
  return response({ ok: false, error: "not_found" }, 404);
}
