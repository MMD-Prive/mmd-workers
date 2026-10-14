export const ADMIN_JOB_BOARD_PUBLISH_PATH = "/v1/admin/job-board/publish";
const CUSTOMER_GENDERS = new Set(["male", "female", "couple", "mixed", "unspecified"]);

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function actorAllowed(actor) {
  return actor?.id && (actor.role === "owner" || actor.role === "admin");
}

function normalizeGender(value) {
  const gender = clean(value, 32).toLowerCase();
  return CUSTOMER_GENDERS.has(gender) ? gender : "unspecified";
}

export function normalizePublishInput(body = {}) {
  const boardText = clean(body.board_text || body.listing_description || body.brief, 1000);
  if (!boardText) throw Object.assign(new Error("job_board_text_required"), { status: 400 });
  if (String(body.board_text || body.listing_description || body.brief || "").trim().length > 1000) {
    throw Object.assign(new Error("job_board_text_too_long"), { status: 400 });
  }

  const world = clean(body.world || body.job_visibility, 20).toLowerCase() === "private" ? "private" : "public";
  const confidentiality = typeof body.confidentiality === "boolean"
    ? body.confidentiality
    : /🔐|ความลับ|confidential/i.test(boardText);
  const compensation = clean(body.compensation || body.budget_text || "", 120);
  const customerGender = normalizeGender(body.customer_gender);

  return {
    id: clean(body.job_id || body.id, 128) || undefined,
    status: "published",
    brief: boardText,
    listing_description: boardText,
    title: clean(body.title, 160) || undefined,
    category: clean(body.category, 80) || undefined,
    duration: clean(body.duration, 80) || undefined,
    date: clean(body.date || body.job_date, 80) || undefined,
    time: clean(body.time || body.start_time, 80) || undefined,
    area: clean(body.area || body.province || body.location_name, 120) || undefined,
    compensation: compensation || undefined,
    customer_count: Number.isInteger(Number(body.customer_count)) && Number(body.customer_count) > 0
      ? Number(body.customer_count)
      : 1,
    customer_gender: customerGender,
    world,
    confidentiality,
    budget_disclosure_approved: world === "private" && body.budget_disclosure_approved === true,
    safe_customer_description: clean(body.safe_customer_description, 500) || undefined,
    required_appearance_profile: clean(body.required_appearance_profile, 600) || undefined,
    owner_note: clean(body.owner_note, 1200) || undefined,
    media_requirements: {
      count: Number.isInteger(Number(body.media_count)) && Number(body.media_count) > 0
        ? Math.min(12, Number(body.media_count))
        : 1,
    },
  };
}

export function isAdminJobBoardPublishRequest(path, method) {
  return path === ADMIN_JOB_BOARD_PUBLISH_PATH && method === "POST";
}

export const ADMIN_BROADCAST_READ_PREFIX = "/v1/admin/jobs/broadcast";
export function isAdminBroadcastReadRequest(path, method) {
  return method === "GET" && (path === ADMIN_BROADCAST_READ_PREFIX || path.startsWith(`${ADMIN_BROADCAST_READ_PREFIX}/`));
}
async function ownerScope(actor) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`broadcast-owner:${actor.id}`));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function bridge(request, env, actor, path, body) {
  if (!actorAllowed(actor)) return json({ ok: false, error: "owner_admin_session_required", outcome: "rejected" }, 401);
  if (typeof env.PUBLIC_JOB_BOARD_WORKER?.fetch !== "function") return json({ ok: false, error: "public_job_board_binding_required", outcome: "uncertain" }, 503);
  try {
    const headers = { accept: "application/json", "x-mmd-owner-scope": await ownerScope(actor) };
    if (body) {
      headers["content-type"] = "application/json";
      headers["idempotency-key"] = request.headers.get("idempotency-key");
    }
    const upstream = await env.PUBLIC_JOB_BOARD_WORKER.fetch(new Request(`https://public-job-board.internal/__internal/job-board/${path}`, {
      method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    const data = await upstream.json();
    if (!data || typeof data !== "object") throw new Error("invalid_response");
    if (!upstream.ok || data.ok !== true) return json(data, upstream.status >= 400 ? upstream.status : 502);
    if (!body) return json(data);
    if (!data.job?.id || !data.job?.broadcast_url) throw new Error("invalid_response");
    const broadcastUrl = data.job.broadcast_url;
    if (!/^https:\/\/(?:www\.)?mmdbkk\.com\/j\/[A-F0-9]{12}$/i.test(broadcastUrl)) throw new Error("invalid_response");
    return json({ ...data, job_id: data.job.id, broadcast_url: broadcastUrl,
      board_destination: `https://sigil.mmdbkk.com/public/api/jobs/${encodeURIComponent(data.job.id)}`,
      authority: { listing: "public-access-worker", model_identity: "admin-worker", booking: "owner_review", payment: "payments-worker" },
    });
  } catch {
    return json({ ok: false, error: "job_board_read_or_publish_unavailable", outcome: "uncertain" }, 503);
  }
}
export async function handleAdminBroadcastRead(request, env, actor) {
  const url = new URL(request.url);
  const suffix = url.pathname.slice(ADMIN_BROADCAST_READ_PREFIX.length);
  if (suffix === "" || suffix === "/") return bridge(request, env, actor, `jobs${url.search}`);
  if (suffix === "/status") return bridge(request, env, actor, `status${url.search}`);
  if (/^\/[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/.test(suffix)) return bridge(request, env, actor, `jobs${suffix}`);
  return json({ ok: false, error: "not_found" }, 404);
}
export async function handleAdminJobBoardPublish(request, env, actor) {
  if (!actorAllowed(actor)) return json({ ok: false, error: "owner_admin_session_required", outcome: "rejected" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false, error: "origin_not_allowed", outcome: "rejected" }, 403);
  const key = request.headers.get("idempotency-key");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key || "")) return json({ ok: false, error: "idempotency_key_required", outcome: "rejected" }, 400);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_json", outcome: "rejected" }, 400);
  let input;
  try { input = normalizePublishInput(body); }
  catch (error) { return json({ ok: false, error: clean(error?.message, 120) || "job_board_publish_invalid", outcome: "rejected" }, error?.status || 400); }
  return bridge(request, env, actor, "publish", input);
}
