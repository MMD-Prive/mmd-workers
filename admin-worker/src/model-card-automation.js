import { CARD_VERSION, CARD_SIZE, projectCardDesign, cardPortraitPrompt, cardHtml } from "./model-card-design.js";

const PREFIX = "studio-card-drafts/";
const INDEX = `${PREFIX}index/`;
const RECORD = /^rec[A-Za-z0-9]{14,24}$/;
const SAFE_STATES = new Set(["queued", "preparing", "waiting_profile", "waiting_configuration", "generating", "rendering", "awaiting_owner_review", "source_changed", "needs_review", "paused"]);
const clean = (x) => String(x ?? "").trim();
const enabled = (env) => env.MODEL_CARD_AUTO_ENABLED === "true";
const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const fail = (code, state = "needs_review", missing = []) => Object.assign(new Error(code), { code, state, missing });

export function safeCardJob(job, owner = false) {
  if (!job) return null;
  return {
    job_id: job.job_id,
    state: SAFE_STATES.has(job.state) ? job.state : "needs_review",
    created_at: job.created_at,
    updated_at: job.updated_at,
    width: CARD_SIZE.width, height: CARD_SIZE.height,
    review_required: true, published: false,
    ...(owner ? { model_record_id: job.model_record_id, model_name: job.design?.title || "Model", missing: job.missing || [], error: job.error || "", can_resume: ["waiting_profile", "waiting_configuration", "paused"].includes(job.state) || (job.state === "needs_review" && job.stage === "render" && job.render_attempts < 3) } : {}),
  };
}

function stub(env, modelId) {
  if (!RECORD.test(modelId)) throw fail("invalid_model_id");
  if (!env.MODEL_CARD_COORDINATOR?.idFromName) throw fail("card_coordinator_unavailable", "waiting_configuration");
  return env.MODEL_CARD_COORDINATOR.get(env.MODEL_CARD_COORDINATOR.idFromName(`model-card:${modelId}`));
}

// Call only after the existing authenticated set-main write succeeds. An image
// generation failure never rolls back or misreports a successful profile save.
export async function enqueuePrimaryCard(env, modelId, mediaRecordId) {
  if (!enabled(env)) return { enabled: false, job: null };
  try {
    const response = await stub(env, modelId).fetch(new Request("https://card.internal/enqueue", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model_record_id: modelId, media_record_id: mediaRecordId }),
    }));
    const data = await response.json();
    return response.ok ? { enabled: true, ...data } : { enabled: true, error: "card_queue_unavailable" };
  } catch { return { enabled: true, error: "card_queue_unavailable" }; }
}

export async function readModelCardStatus(env, modelId) {
  if (!env.MODEL_CARD_COORDINATOR) return { enabled: enabled(env), job: null };
  const response = await stub(env, modelId).fetch(new Request("https://card.internal/status"));
  if (!response.ok) throw fail("card_status_unavailable");
  const data = await response.json();
  return { enabled: enabled(env), job: data.job };
}

// Invoked ONLY behind the existing Studio authentication + origin gates.
export async function handleStudioCards(env, path, body) {
  if (path === "/studio/api/model-cards/list") {
    if (!env.MMD_MODEL_ASSETS?.list) return json({ ok: false, error: "card_storage_unavailable" }, 503);
    const cursor = clean(body.cursor);
    if (cursor.length > 2048) return json({ ok: false, error: "invalid_cursor" }, 400);
    const page = await env.MMD_MODEL_ASSETS.list({ prefix: INDEX, limit: 50, ...(cursor ? { cursor } : {}) });
    const jobs = await Promise.all(page.objects.map(async (entry) => {
      const object = await env.MMD_MODEL_ASSETS.get(entry.key);
      return object ? await object.json() : null;
    }));
    return json({ ok: true, jobs: jobs.filter(Boolean).sort((a, b) => b.created_at.localeCompare(a.created_at)), cursor: page.truncated ? page.cursor : null });
  }
  if (!["/studio/api/model-cards/preview", "/studio/api/model-cards/resume"].includes(path)) return json({ ok: false, error: "not_found" }, 404);
  if (!RECORD.test(clean(body.model_record_id))) return json({ ok: false, error: "invalid_model_id" }, 400);
  if (!/^card_[a-f0-9]{32}$/.test(clean(body.job_id))) return json({ ok: false, error: "invalid_job_id" }, 400);
  return stub(env, body.model_record_id).fetch(new Request(`https://card.internal/${path.endsWith("preview") ? "preview" : "resume"}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: body.job_id }),
  }));
}

export class ModelCardCoordinator {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.running = false; }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/budget" && request.method === "POST") return this.reserveBudget(await request.json());
    if (path === "/status" && request.method === "GET") return json({ ok: true, job: safeCardJob(await this.ctx.storage.get("job")) });
    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    const input = await request.json().catch(() => null);
    if (!input) return json({ ok: false, error: "invalid_json" }, 400);
    if (path === "/enqueue") {
      if (!enabled(this.env)) return json({ ok: false, error: "card_automation_disabled" }, 503);
      if (!RECORD.test(input.model_record_id) || !RECORD.test(input.media_record_id)) return json({ ok: false, error: "invalid_record_id" }, 400);
      let duplicate = false;
      const job = await this.ctx.storage.transaction(async (tx) => {
        const existing = await tx.get("job");
        if (existing) {
          duplicate = true;
          // A held source may be converted/re-uploaded or its metadata filled
          // before the first paid attempt. Keep the same job reservation.
          if (!this.running && existing.stage === "prepare" &&
            ["waiting_profile", "waiting_configuration", "source_changed", "paused"].includes(existing.state)) {
            existing.media_record_id = input.media_record_id;
            existing.state = "queued"; existing.error = ""; existing.missing = [];
            existing.updated_at = new Date().toISOString();
            await tx.put("job", existing);
            await this.ctx.storage.setAlarm(Date.now() + 1000);
          }
          return existing;
        }
        const now = new Date().toISOString();
        const created = {
          job_id: `card_${crypto.randomUUID().replaceAll("-", "")}`,
          model_record_id: input.model_record_id, media_record_id: input.media_record_id,
          state: "queued", stage: "prepare", created_at: now, updated_at: now,
          generated: false, render_attempts: 0,
        };
        // First primary photo only. Future profile changes do not silently incur
        // another image charge; a new owner-requested revision is a separate flow.
        await tx.put("job", created);
        // SQLite-backed DO storage includes direct storage operations inside
        // this transaction; txn's legacy surface has no documented setAlarm.
        await this.ctx.storage.setAlarm(Date.now() + 1000);
        return created;
      });
      return json({ ok: true, job: safeCardJob(job), duplicate }, duplicate ? 200 : 202);
    }
    const job = await this.ctx.storage.get("job");
    if (!job || input.job_id !== job.job_id) return json({ ok: false, error: "card_not_found" }, 404);
    if (path === "/resume") {
      if (!enabled(this.env)) return json({ ok: false, error: "card_automation_disabled" }, 503);
      if (this.running || !safeCardJob(job, true).can_resume) return json({ ok: false, error: "card_resume_not_allowed" }, 409);
      job.state = job.stage === "render" ? "rendering" : "queued";
      job.error = ""; job.missing = [];
      await this.save(job);
      await this.ctx.storage.setAlarm(Date.now() + 1000);
      return json({ ok: true, job: safeCardJob(job, true) }, 202);
    }
    if (path === "/preview") {
      if (job.state !== "awaiting_owner_review") return json({ ok: false, error: "card_not_ready" }, 409);
      // Revalidate on every read, including after source deletion/reclassification.
      try { await this.checkCurrent(job); }
      catch { return json({ ok: false, error: "card_source_changed" }, 409); }
      const object = await this.env.MMD_MODEL_ASSETS.get(this.key(job, "card.png"));
      if (!object) return json({ ok: false, error: "card_not_found" }, 404);
      return new Response(object.body, { headers: {
        "content-type": "image/png", "cache-control": "private, no-store", "x-content-type-options": "nosniff",
        "content-disposition": `inline; filename="${job.job_id}-1322x1200.png"`,
      } });
    }
    return json({ ok: false, error: "not_found" }, 404);
  }

  async reserveBudget(input) {
    if (!/^card_[a-f0-9]{32}$/.test(clean(input.job_id))) return json({ ok: false }, 400);
    const day = new Date().toISOString().slice(0, 10);
    const limit = Math.max(1, Math.min(100, Number(this.env.MODEL_CARD_DAILY_LIMIT) || 20));
    const ok = await this.ctx.storage.transaction(async (tx) => {
      let budget = await tx.get("budget");
      if (budget?.day !== day) budget = { day, jobs: [] };
      if (budget.jobs.includes(input.job_id)) return true;
      if (budget.jobs.length >= limit) return false;
      budget.jobs.push(input.job_id); await tx.put("budget", budget); return true;
    });
    return json({ ok }, ok ? 200 : 429);
  }

  key(job, file) { return `${PREFIX}${job.model_record_id}/${job.job_id}/${file}`; }
  async save(job) {
    job.updated_at = new Date().toISOString();
    await this.ctx.storage.put("job", job);
    // R2 index is a private review projection. No Media Assets registration,
    // approval/visibility writes, public URL or Telegram notification is created.
    try {
      await this.env.MMD_MODEL_ASSETS.put(`${INDEX}${job.model_record_id}.json`, JSON.stringify(safeCardJob(job, true)), {
        httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
      });
      if (job.index_retries) { delete job.index_retries; await this.ctx.storage.put("job", job); }
    } catch {
      job.index_retries = (job.index_retries || 0) + 1;
      await this.ctx.storage.put("job", job);
      if (job.index_retries <= 6) await this.ctx.storage.setAlarm(Date.now() + Math.min(3600000, 60000 * 2 ** (job.index_retries - 1)));
    }
  }

  async inputs(job) {
    const [model, media] = await Promise.all([
      readRecord(this.env, this.env.AIRTABLE_TABLE_MODELS || "Models", job.model_record_id),
      readRecord(this.env, this.env.AIRTABLE_TABLE_MODEL_MEDIA || "tblrpQXhHnbTU9RhW", job.media_record_id),
    ]);
    const f = media.fields || {};
    const links = Array.isArray(f.Model) ? f.Model.map((x) => typeof x === "string" ? x : x?.id) : [];
    if (links.length !== 1 || links[0] !== job.model_record_id) throw fail("media_owner_mismatch", "source_changed");
    if (!["profile_photo", "public_gallery"].includes(f.media_type) || f.asset_role !== "profile_main" ||
      f.public_safe !== true || !["active", "approved", "published"].includes(clean(f.review_status).toLowerCase()) ||
      /private|flash|sensitive/i.test(clean(f.media_visibility))) throw fail("primary_media_no_longer_approved", "source_changed");
    const key = clean(f.private_original_key);
    if (!key.startsWith(`models/${job.model_record_id}/`) || key.includes("..")) throw fail("source_key_invalid", "source_changed");
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.file_type)) throw fail("convert_source_to_jpg_png_webp", "waiting_profile");
    const source = await this.env.MMD_MODEL_ASSETS.head(key);
    if (!source || source.size < 1) throw fail("source_missing", "source_changed");
    // Keep the source, multipart edit request and returned image within the
    // Worker isolate memory budget. The existing 25 MiB upload limit is intact.
    if (source.size > 12 * 1024 * 1024) throw fail("compress_card_source_under_12mb", "waiting_profile");
    if (source.customMetadata?.model_record_id && source.customMetadata.model_record_id !== job.model_record_id) throw fail("source_owner_mismatch", "source_changed");
    const projection = projectCardDesign(model, this.env);
    if (!projection.ok) throw fail("card_profile_incomplete", "waiting_profile", projection.missing);
    return { design: projection.design, source_key: key, source_etag: source.etag, source_mime: f.file_type };
  }

  async checkCurrent(job) {
    const current = await this.inputs(job);
    if (JSON.stringify(current) !== JSON.stringify(job.snapshot)) throw fail("source_or_profile_changed", "source_changed");
    return current;
  }

  async logo(design) {
    const key = design.world === "public" ? this.env.MODEL_CARD_MMD_LOGO_KEY : this.env.MODEL_CARD_SIGIL_LOGO_KEY;
    if (!key || !key.startsWith("studio-card-brand/")) throw fail("approved_logo_not_configured", "waiting_configuration");
    const object = await this.env.MMD_MODEL_ASSETS.get(key);
    const mime = object?.httpMetadata?.contentType;
    if (!object || !["image/png", "image/webp"].includes(mime) || object.size > 1024 * 1024) throw fail("approved_logo_unavailable", "waiting_configuration");
    return `data:${mime};base64,${base64(new Uint8Array(await object.arrayBuffer()))}`;
  }

  async alarm() {
    if (this.running) return;
    this.running = true;
    let job;
    try {
      job = await this.ctx.storage.get("job");
      if (!job) return;
      if (!["queued", "preparing", "generating", "rendering"].includes(job.state)) { await this.save(job); return; }
      if (!enabled(this.env)) throw fail("card_automation_disabled", "paused");
      if (!this.env.MMD_MODEL_ASSETS || !this.env.MODEL_CARD_BROWSER?.quickAction || !this.env.OPENAI_IMAGE_API_KEY) throw fail("card_generation_not_configured", "waiting_configuration");
      if (job.stage === "generate") {
        // A lost HTTP response may still have been billed. Recover a saved
        // portrait, otherwise require review; NEVER repeat that paid request.
        const stored = await this.env.MMD_MODEL_ASSETS.head(this.key(job, "portrait.png"));
        if (!stored) throw fail("generation_result_unknown");
        job.stage = "render"; job.generated = true; job.state = "rendering";
      }
      if (job.stage === "prepare") {
        job.state = "preparing"; await this.save(job);
        job.snapshot = await this.inputs(job); job.design = job.snapshot.design;
        await this.logo(job.design); // Fail before the paid call if branding is unavailable.
        const source = await this.env.MMD_MODEL_ASSETS.get(job.snapshot.source_key);
        if (!source || source.etag !== job.snapshot.source_etag) throw fail("source_changed", "source_changed");
        const bytes = new Uint8Array(await source.arrayBuffer());
        job.source_sha256 = await digest(bytes);
        job.fingerprint = await digest(new TextEncoder().encode(JSON.stringify([CARD_VERSION, job.model_record_id, job.source_sha256, job.design])));
        const budget = this.env.MODEL_CARD_COORDINATOR.get(this.env.MODEL_CARD_COORDINATOR.idFromName("model-card:daily-budget"));
        const allowed = await budget.fetch(new Request("https://card.internal/budget", { method: "POST", body: JSON.stringify({ job_id: job.job_id }) }));
        if (!allowed.ok) throw fail("daily_generation_limit", "waiting_configuration");
        job.stage = "generate"; job.state = "generating";
        await this.save(job);
        await this.ctx.storage.setAlarm(Date.now() + 15 * 60 * 1000);
        const portrait = await generatePortrait(this.env, bytes, job.snapshot.source_mime, job.design);
        await this.env.MMD_MODEL_ASSETS.put(this.key(job, "portrait.png"), portrait, {
          httpMetadata: { contentType: "image/png", cacheControl: "private, no-store" },
          customMetadata: { model_record_id: job.model_record_id, fingerprint: job.fingerprint, policy: "draft_only" },
        });
        job.generated = true; job.stage = "render"; job.state = "rendering";
        await this.save(job);
      }
      if (job.stage === "render") {
        await this.checkCurrent(job);
        const portrait = await this.env.MMD_MODEL_ASSETS.get(this.key(job, "portrait.png"));
        if (!portrait) throw fail("generated_portrait_missing");
        const logo = await this.logo(job.design);
        const html = cardHtml(job.design, `data:image/png;base64,${base64(new Uint8Array(await portrait.arrayBuffer()))}`, logo);
        job.render_attempts++; await this.save(job);
        const output = await this.env.MODEL_CARD_BROWSER.quickAction("screenshot", {
          html, viewport: { ...CARD_SIZE, deviceScaleFactor: 1 },
          screenshotOptions: { type: "png", fullPage: false, clip: { x: 0, y: 0, ...CARD_SIZE } },
          gotoOptions: { waitUntil: "load", timeout: 30000 },
        });
        if (!output.ok) throw fail("card_render_failed");
        const png = new Uint8Array(await output.arrayBuffer());
        const size = pngSize(png);
        if (size?.width !== CARD_SIZE.width || size?.height !== CARD_SIZE.height) throw fail("card_dimensions_invalid");
        await this.checkCurrent(job);
        await this.env.MMD_MODEL_ASSETS.put(this.key(job, "card.png"), png, {
          httpMetadata: { contentType: "image/png", cacheControl: "private, no-store" },
          customMetadata: { policy: "awaiting_owner_review", fingerprint: job.fingerprint },
        });
        job.state = "awaiting_owner_review"; job.stage = "complete"; job.error = ""; job.missing = [];
        await this.ctx.storage.deleteAlarm(); await this.save(job);
      }
    } catch (error) {
      if (job) {
        job.state = error.state || "needs_review";
        job.error = error.code || "card_processing_failed";
        job.missing = error.missing || [];
        // No raw provider responses, images, credentials or personal data in logs.
        await this.ctx.storage.deleteAlarm(); await this.save(job);
      }
    } finally { this.running = false; }
  }
}

async function readRecord(env, table, id) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw fail("airtable_not_configured", "waiting_configuration");
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw fail(response.status === 404 ? "source_record_missing" : "source_lookup_unavailable", response.status === 404 ? "source_changed" : "waiting_configuration");
  return response.json();
}

export async function generatePortrait(env, bytes, mime, design) {
  const form = new FormData();
  form.set("model", "gpt-image-2.5-sunburst");
  form.set("image[]", new Blob([bytes], { type: mime }), `reference.${mime === "image/jpeg" ? "jpg" : mime.split("/")[1]}`);
  form.set("prompt", cardPortraitPrompt(design));
  // Native image API edges are multiples of 16; renderer produces exact final size.
  form.set("size", "1328x1200"); form.set("quality", "medium"); form.set("n", "1"); form.set("output_format", "png");
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { authorization: `Bearer ${env.OPENAI_IMAGE_API_KEY}` }, body: form,
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
  } catch { throw fail("generation_result_unknown"); }
  if (!response.ok) throw fail(response.status === 429 ? "image_provider_rate_limit" : "image_provider_rejected");
  const data = await response.json().catch(() => null);
  const encoded = data?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || encoded.length > 16 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(encoded)) throw fail("image_provider_invalid_output");
  const png = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  if (!pngSize(png)) throw fail("image_provider_invalid_output");
  return png;
}

export function pngSize(bytes) {
  if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
function base64(bytes) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (x) => x.toString(16).padStart(2, "0")).join("");
}
