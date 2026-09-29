import { buildModelJobBoardBroadcastLink } from "../../shared/model-job-board-links.mjs";

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
  return actor && (actor.role === "owner" || actor.role === "admin");
}

function normalizeGender(value) {
  const gender = clean(value, 32).toLowerCase();
  return CUSTOMER_GENDERS.has(gender) ? gender : "unspecified";
}

function normalizePublishInput(body = {}) {
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

export async function handleAdminJobBoardPublish(request, env, actor) {
  if (!actorAllowed(actor)) return json({ ok: false, error: "owner_admin_session_required" }, 401);
  if (typeof env.PUBLIC_JOB_BOARD_WORKER?.fetch !== "function") {
    return json({ ok: false, error: "public_job_board_binding_required" }, 503);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  let input;
  try {
    input = normalizePublishInput(body);
  } catch (error) {
    return json({ ok: false, error: clean(error?.message, 120) || "job_board_publish_invalid" }, error?.status || 400);
  }

  const upstream = await env.PUBLIC_JOB_BOARD_WORKER.fetch(
    new Request("https://public-job-board.internal/__internal/job-board/publish", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(input),
    }),
  );
  const data = await upstream.json().catch(() => null);
  if (!upstream.ok || data?.ok !== true || !data?.job?.id || !data?.job?.broadcast_url) {
    return json({
      ok: false,
      error: clean(data?.error, 120) || "job_board_publish_failed",
    }, upstream.status >= 400 ? upstream.status : 502);
  }

  const broadcastUrl = buildModelJobBoardBroadcastLink({
    source: "line_model_group",
    job_id: data.job.id,
  });

  return json({
    ok: true,
    job: {
      ...data.job,
      broadcast_url: broadcastUrl,
    },
    job_id: data.job.id,
    broadcast_url: broadcastUrl,
    board_destination: `https://sigil.mmdbkk.com/public/api/jobs/${encodeURIComponent(data.job.id)}`,
    authority: {
      listing: "public-access-worker",
      model_identity: "admin-worker",
      booking: "owner_review",
      payment: "payments-worker",
    },
  });
}
