// src/index.js
// =========================================================
// admin-worker — Admin API / Core Orchestrator
//
// LOCK: core-production + controlled immigration bridge
//
// SYSTEM LAYERS
// ---------------------------------------------------------
// CORE SYSTEM
//   - admin ping / stats
//   - members list / update
//   - models list / upsert
//   - telegram internal DM
//   - job creation -> payments-worker confirm link mint
//
// IMMIGRATION / MIGRATION LAYER
//   - console inbox writer
//   - payment proofs writer
//   - default-name table routes may be bridge-compatible
//
// IMPORTANT
//   - admin-worker is allowed to write Airtable
//   - chat-worker must NOT write Airtable directly
//   - immigration layer must not be confused with canonical core contracts
// ==========================================================

import { demoLinksCreate, demoLinksGet } from "./routes/demo-links.js";
import {
  getAllowedModelSessionActions,
  normalizeModelSessionAction,
  normalizeSessionState,
  resolveModelSessionPage,
  resolveModelSessionTransition,
} from "./modelSessionContractV1.js";

const LOCK = "admin-worker-v2026-03-11-full";
const AIRTABLE_API = "https://api.airtable.com/v0";
const MODEL_SAFE_SEARCH_FIELDS = ["name", "nickname", "telegram_username", "telegram_id", "unique_key"];
const MODEL_SEARCH_FIELDS = [
  "name",
  "Name",
  "nickname",
  "Nickname",
  "model_name",
  "Model Name",
  "working_name",
  "Working Name",
  "display_name",
  "Display Name",
  "model_code",
  "model_lookup_key",
  "unique_key",
  "line_id",
  "LINE ID",
  "line_user_id",
  "LINE User ID",
  "telegram_username",
  "telegram_id",
  "aliases",
  "alias",
  "legacy_tags",
  "notes",
  "Notes",
  "notes_raw",
  "admin_note",
  "payload_json",
];
const DEFAULT_MODEL_SOURCE_OWNER = "lonelysomething";
const DEFAULT_MODEL_R2_CATEGORY_PATHS = [
  "MMD Public Models/MMD Travel Compcard",
  "MMD Public Models/MMD Travel Models",
  "MMD Public Models/MMD Travel Models/Straight",
  "MMD Public Models/MMD Travel Models/Gay",
  "MMD Public Models/MMD Travel Models/Both",
  "MMD Public Models/MMD Extreme Models",
  "MMD Public Models/MMD Extreme Models/Straight",
  "MMD Public Models/MMD Extreme Models/Gay",
  "MMD Public Models/MMD Extreme Models/Both",
  "Public Models/Extreme Models",
  "MMD Private Models/Standard Package",
  "MMD Private Models/Premium Package",
  "MMD Exclusive/MMD Exclusive Models",
  "Public Models/Extreme Models/Straight",
];
export const MODEL_SCHEMA_PATCH_V1_ROUTES = Object.freeze({
  visibilityUpdate: "/v1/model/visibility/update",
  rateRequest: "/v1/model/rate/request",
  mediaUploadInit: "/v1/model/media/upload-init",
  mediaUploadComplete: "/v1/model/media/upload-complete",
  mediaReviewRequest: "/v1/model/media/review-request",
  privateGalleryRequest: "/v1/model/private-gallery/request",
  privateFlashRequest: "/v1/model/private-flash/request",
  privateFlashAuthorize: "/v1/model/private-flash/authorize",
});
const MODEL_SCHEMA_PATCH_V1_ROUTE_SET = new Set(Object.values(MODEL_SCHEMA_PATCH_V1_ROUTES));
const MODEL_SESSION_CURRENT_PATH = "/v1/model/session/current";
const MODEL_SESSION_ACTION_PATH = "/v1/model/session/action";
const MODEL_SESSION_LINK_PATH = "/v1/admin/model/session/link";
const ADMIN_RICH_MENU_BASE_PATH = "/v1/admin/line/rich-menu";
const SIGIL_BOARD_PUBLISH_PATH = "/v1/admin/sigil/board/publish";
const KENJI_KNOWLEDGE_CANONICAL_PATH = "/sigil/internal/admin/kenji-knowledge";
const KENJI_KNOWLEDGE_COMPATIBILITY_ALIAS_PATH = "/internal/admin/kenji-knowledge";
const KENJI_KNOWLEDGE_AUTH_ME_PATH = "/v1/admin/auth/me";
const KENJI_KNOWLEDGE_META_PATH = "/v1/admin/kenji/knowledge/meta";
const KENJI_KNOWLEDGE_LIST_PATH = "/v1/admin/kenji/knowledge/list";
const KENJI_KNOWLEDGE_DRAFT_PATH = "/v1/admin/kenji/knowledge/draft";
const KENJI_KNOWLEDGE_PUBLISHED_PATH = "/v1/internal/kenji/knowledge/published";
const ADMIN_GATE_SESSION_COOKIE = "mmd_admin_gate_v1";
const ADMIN_GATE_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_GATE_ALLOWED_BASE_URLS = new Set([
  "https://mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);
const SIGIL_BOARD_CARDS_KV_KEY = "sigil:board:v1:cards";
const SIGIL_BOARD_META_KV_KEY = "sigil:board:v1:meta";
const MEMBER_DASHBOARD_RICH_MENU_BASE_URL = "https://member-dashboard-chat-worker.local/__internal/line/rich-menu";
const MODEL_SESSION_MODEL_BLOCKED_ACTIONS = new Set([
  "confirm_final_payment",
  "mark_final_payment_confirmed",
  "set_final_payment_confirmed",
  "mark_final_payment_pending",
]);
const MODEL_SESSION_MODEL_ALLOWED_ACTIONS = new Set([
  "accept_job",
  "decline_job",
  "start_travel",
  "mark_arrived",
  "mark_met_customer",
  "mark_work_finished",
  "confirm_separated",
  "start_work",
  "go_en_route",
]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = normalizePathname(url.pathname);
    const method = req.method.toUpperCase();
    const cors = corsHeaders(req, env);

    if (isKenjiKnowledgeCapturedPath(path) && !isKenjiKnowledgeShellPath(path)) {
      return passThroughKenjiSuffixToOrigin(req);
    }

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if ((method === "GET" || method === "HEAD") && isKenjiKnowledgeShellPath(path)) {
      return kenjiKnowledgeAdminShell(
        req,
        path === KENJI_KNOWLEDGE_CANONICAL_PATH ? "canonical" : "compatibility-alias"
      );
    }

    if (isKenjiKnowledgeReadinessRoute(path, method)) {
      return withCors(await handleKenjiKnowledgeReadinessRoute(req, env, path, method), cors);
    }

    // ------------------------------------------------------
    // Public ping
    // ------------------------------------------------------
    if (method === "GET" && (path === "/ping" || path === "/health")) {
      return withCors(
        json({
          ok: true,
          worker: "admin-worker",
          lock: LOCK,
          ts: Date.now(),
        }),
        cors
      );
    }

    // ------------------------------------------------------
    // DEMO LINKS (internal tool + public confirm fetch)
    // ------------------------------------------------------
    if (method === "POST" && path === "/v1/demo-links/create") {
      return withCors(await demoLinksCreate(req, env), cors);
    }

    if (method === "GET" && path === "/v1/demo-links/get") {
      return withCors(await demoLinksGet(req, env), cors);
    }

    if (
      (method === "GET" || method === "HEAD") &&
      path === MODEL_SCHEMA_PATCH_V1_ROUTES.privateFlashAuthorize
    ) {
      return withCors(modelSchemaPatchJson({ ok: false, error: "unauthorized" }, 401), cors);
    }

    if (method === "POST" && MODEL_SCHEMA_PATCH_V1_ROUTE_SET.has(path)) {
      return withCors(await handleModelSchemaPatchV1Route(req, env, path), cors);
    }

    if (method === "GET" && path === MODEL_SESSION_CURRENT_PATH) {
      return withCors(await handleModelSessionCurrent(req, env), cors);
    }

    if (method === "POST" && path === MODEL_SESSION_ACTION_PATH) {
      return withCors(await handleModelSessionAction(req, env), cors);
    }

    // ------------------------------------------------------
    // Admin routes
    // ------------------------------------------------------
    if (path.startsWith("/v1/admin/")) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(json({ ok: false, error: "origin_not_allowed" }, 403), cors);
      }

      // ====================================================
      // IMMIGRATION / WRITER ENDPOINTS
      // STRICT: X-Confirm-Key only
      // ====================================================
      if (method === "POST" && path === SIGIL_BOARD_PUBLISH_PATH) {
        if (!isAuthed(req, env)) {
          return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
        }
        return withCors(json(await publishSigilBoardQueue(env)), cors);
      }

      if (method === "POST" && path === "/v1/admin/console/inbox") {
        if (!isConfirmKeyAuthed(req, env)) {
          return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
        }

        const body = await safeJson(req);

        if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
          return withCors(json({ ok: false, error: "missing_airtable_env" }, 500), cors);
        }

        const fields = {
          inbox_id: str(body.inbox_id || crypto.randomUUID()),
          source: str(body.source || "admin_console"),
          intent: str(body.intent || "note_only"),

          member_name: str(body.member_name || ""),
          member_email: str(body.member_email || ""),
          member_phone: str(body.member_phone || ""),
          memberstack_id: str(body.memberstack_id || ""),
          telegram_id: str(body.telegram_id || ""),
          telegram_username: str(body.telegram_username || ""),
          line_user_id: str(body.line_user_id || ""),
          line_id: str(body.line_id || ""),
          legacy_tags: str(body.legacy_tags || ""),

          admin_note: str(body.admin_note || ""),
          payload_json: JSON.stringify(body.payload_json || body || {}),
          status: str(body.status || "new"),
          error_message: str(body.error_message || ""),
        };

        if (body.linked_member) fields.linked_member = [str(body.linked_member)];
        if (body.linked_session) fields.linked_session = [str(body.linked_session)];
        if (body.linked_payment) fields.linked_payment = [str(body.linked_payment)];

        try {
          const rec = await airtableCreate({
            baseId: env.AIRTABLE_BASE_ID,
            tableId: env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e",
            apiKey: env.AIRTABLE_API_KEY,
            fields,
          });

          return withCors(
            json({
              ok: true,
              layer: "immigration",
              record_id: rec?.id || null,
            }),
            cors
          );
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e) }, 500), cors);
        }
      }

      if (method === "POST" && path === "/v1/admin/sigil/handoff") {
        if (!isConfirmKeyAuthed(req, env)) {
          return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
        }

        const body = await safeJson(req);

        if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
          return withCors(json({ ok: false, error: "missing_airtable_env" }, 500), cors);
        }

        const handoffId = str(body.handoff_id || body.inbox_id || crypto.randomUUID());
        const memberName = str(body.member_name || body.name || body.display_name || "");
        const telegramId = str(body.telegram_id || body.user_id || "");
        const telegramUsername = str(body.telegram_username || body.username || "");
        const intent = str(body.intent || "sigil_private_handoff");
        const priority = str(body.priority || body.status || "new");
        const journeyStage = str(body.journey_stage || "alignment");
        const preferencesSummary = summarizeList(body.preferences || body.preferences_summary || body.selected_preferences);
        const requestedService = str(body.requested_service || body.service || body.service_type || "");
        const budgetText = str(body.budget || body.budget_text || "");
        const scheduleText = str(body.schedule || body.when || body.requested_time || "");
        const source = str(body.source || "sigil_chatbot");

        const adminNote = buildSigilAdminNote({
          memberName,
          telegramUsername,
          telegramId,
          requestedService,
          budgetText,
          scheduleText,
          preferencesSummary,
          journeyStage,
          note: str(body.admin_note || body.note || body.operator_note || ""),
        });

        const fields = {
          inbox_id: handoffId,
          source,
          intent,
          member_name: memberName,
          member_email: str(body.member_email || body.email || ""),
          member_phone: str(body.member_phone || body.phone || ""),
          memberstack_id: str(body.memberstack_id || ""),
          telegram_id: telegramId,
          telegram_username: telegramUsername,
          line_user_id: str(body.line_user_id || ""),
          line_id: str(body.line_id || ""),
          legacy_tags: str(body.legacy_tags || ""),
          admin_note: adminNote,
          payload_json: JSON.stringify(body.payload_json || body || {}),
          status: priority,
          error_message: "",
        };

        if (body.linked_member) fields.linked_member = [str(body.linked_member)];
        if (body.linked_session) fields.linked_session = [str(body.linked_session)];
        if (body.linked_payment) fields.linked_payment = [str(body.linked_payment)];

        try {
          const rec = await airtableCreate({
            baseId: env.AIRTABLE_BASE_ID,
            tableId: env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e",
            apiKey: env.AIRTABLE_API_KEY,
            fields,
          });

          const notify = await notifySigilHandoff(env, {
            handoff_id: handoffId,
            airtable_record_id: rec?.id || "",
            member_name: memberName,
            telegram_username: telegramUsername,
            telegram_id: telegramId,
            requested_service: requestedService,
            budget_text: budgetText,
            schedule_text: scheduleText,
            preferences_summary: preferencesSummary,
            journey_stage: journeyStage,
            admin_note: adminNote,
          });

          return withCors(
            json({
              ok: true,
              layer: "immigration",
              handoff_id: handoffId,
              record_id: rec?.id || null,
              notified: Boolean(notify?.ok),
              notify_error: notify?.ok ? null : notify?.error || null,
            }),
            cors
          );
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e) }, 500), cors);
        }
      }

      if (method === "POST" && path === "/v1/admin/payment/proof") {
        if (!isConfirmKeyAuthed(req, env)) {
          return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
        }

        const body = await safeJson(req);

        if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
          return withCors(json({ ok: false, error: "missing_airtable_env" }, 500), cors);
        }

        const fields = {
          proof_id: str(body.proof_id || crypto.randomUUID()),
          payer_name: str(body.payer_name || ""),
          amount_thb: num(body.amount_thb || 0),
          paid_at: body.paid_at || null,
          channel: str(body.channel || "bank_transfer"),
          payment_ref: str(body.payment_ref || ""),
          slip_url: str(body.slip_url || ""),
          note: str(body.note || ""),
          status: str(body.status || "pending"),
        };

        if (body.verified_at) fields.verified_at = body.verified_at;
        if (body.verified_by) fields.verified_by = str(body.verified_by);
        if (body.member) fields.member = [str(body.member)];
        if (body.session) fields.session = [str(body.session)];
        if (body.payment) fields.payment = [str(body.payment)];

        try {
          const rec = await airtableCreate({
            baseId: env.AIRTABLE_BASE_ID,
            tableId: env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi",
            apiKey: env.AIRTABLE_API_KEY,
            fields,
          });

          return withCors(
            json({
              ok: true,
              layer: "immigration",
              record_id: rec?.id || null,
            }),
            cors
          );
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e) }, 500), cors);
        }
      }

      // ====================================================
      // CORE ADMIN AUTH
      // Bearer OR Confirm-Key
      // ====================================================
      if (!isAuthed(req, env)) {
        return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
      }

      if (isAdminRichMenuRoute(path, method)) {
        return withCors(await handleAdminRichMenuRoute(req, env, path, method), cors);
      }

      if (method === "POST" && path === MODEL_SESSION_LINK_PATH) {
        return withCors(await handleModelSessionLinkIssuer(req, env), cors);
      }

      // ----------------------------------------------------
      // Core ping
      // ----------------------------------------------------
      if (method === "GET" && path === "/v1/admin/ping") {
        return withCors(
          json({
            ok: true,
            admin: true,
            worker: "admin-worker",
            lock: LOCK,
            ts: Date.now(),
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Stats
      // ----------------------------------------------------
      if (method === "GET" && path === "/v1/admin/stats") {
        const labels = buildLastNDays(7);

        return withCors(
          json({
            ok: true,
            layer: "core",
            summary: {
              total_members: 0,
              total_models: 0,
              revenue_30d_thb: 0,
            },
            trends: {
              labels,
              members_new: labels.map(() => 0),
              revenue_thb: labels.map(() => 0),
              payments_count: labels.map(() => 0),
              points_issued: labels.map(() => 0),
            },
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Members list
      // ----------------------------------------------------
      if (method === "GET" && path === "/v1/admin/members/list") {
        const q = str(url.searchParams.get("q") || "");
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const tableName = env.AIRTABLE_TABLE_MEMBERS || "members";

        const items = await airtableList(env, tableName, {
          q,
          limit,
          matchFields: ["name", "nickname", "memberstack_id", "telegram_username", "telegram_id", "mmd_client_name"],
        });

        return withCors(
          json({
            ok: true,
            layer: inferLayerFromTable(tableName),
            items,
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Members update
      // ----------------------------------------------------
      if (method === "POST" && path === "/v1/admin/members/update") {
        const body = await safeJson(req);
        const tableName = env.AIRTABLE_TABLE_MEMBERS || "members";

        const rawPatch = body?.patch && typeof body.patch === "object" ? body.patch : {};
        const patch = pickAllowedFields(rawPatch, getAllowedMemberPatchFields(env));

        const out = await airtableUpdateByIdOrField(
          env,
          tableName,
          { ...body, patch },
          {
            idField: "id",
            lookupField: "memberstack_id",
            patchField: "patch",
          }
        );

        return withCors(
          json({
            ok: true,
            layer: inferLayerFromTable(tableName),
            updated: out,
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Telegram DM
      // ----------------------------------------------------
      if (method === "POST" && path === "/v1/admin/telegram/dm") {
        const body = await safeJson(req);
        const r = await telegramInternalSend(env, body);

        return withCors(
          json(
            {
              ok: r.ok,
              layer: "core",
              telegram: r,
            },
            r.ok ? 200 : 502
          ),
          cors
        );
      }

      // ----------------------------------------------------
      // Pricing review flow
      // ----------------------------------------------------
      if (method === "POST" && path === "/v1/admin/pricing/reviews/create") {
        const body = await safeJson(req);
        try {
          const out = await createPricingReview(env, body);
          return withCors(json(out, out.ok ? 200 : 500), cors);
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e || "pricing_review_create_failed") }, 500), cors);
        }
      }

      if (method === "POST" && path === "/v1/admin/pricing/reviews/approve") {
        const body = await safeJson(req);
        try {
          const out = await approvePricingReview(env, body);
          return withCors(json(out, out.ok ? 200 : 400), cors);
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e || "pricing_review_approve_failed") }, 500), cors);
        }
      }

      if (method === "POST" && path === "/v1/admin/pricing/review-timeout-check") {
        const body = await safeJson(req);
        try {
          const out = await runPricingReviewTimeoutCheck(env, body);
          return withCors(json(out), cors);
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e || "pricing_review_timeout_failed") }, 500), cors);
        }
      }

      // ----------------------------------------------------
      // Models list
      // ----------------------------------------------------
      if (method === "GET" && path === "/v1/admin/models/list") {
        const q = str(url.searchParams.get("q") || "");
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const tableName = env.AIRTABLE_TABLE_MODELS || "models";

        const items = await airtableList(env, tableName, {
          q,
          limit,
          matchFields: getModelSearchFields(env),
          fallbackMatchFields: MODEL_SAFE_SEARCH_FIELDS,
        });

        return withCors(
          json({
            ok: true,
            layer: inferLayerFromTable(tableName),
            items,
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Models search (create-session booking search)
      // Entitlement-enforced + sanitized; /v1/admin/models/list
      // stays the raw admin inventory endpoint.
      // ----------------------------------------------------
      if (method === "GET" && path === "/v1/admin/models/search") {
        try {
          return withCors(json(await searchCreateSessionModels(env, url)), cors);
        } catch (e) {
          if (e instanceof CreateSessionAccessError) {
            return withCors(json({ ok: false, error: { code: e.code, message: e.message } }, e.status), cors);
          }
          return withCors(json({ ok: false, error: String(e?.message || e || "models_search_failed") }, 500), cors);
        }
      }

      // ----------------------------------------------------
      // Models source resolver
      // ----------------------------------------------------
      if (method === "GET" && path === "/v1/admin/models/resolve-source") {
        const q = str(url.searchParams.get("q") || "");
        const sourceOwner = str(url.searchParams.get("source_owner") || env.MODEL_SOURCE_OWNER_DEFAULT || DEFAULT_MODEL_SOURCE_OWNER);
        const categoryPath = str(url.searchParams.get("category_path") || "");

        try {
          return withCors(
            json(await resolveModelSource(env, { q, sourceOwner, categoryPath })),
            cors
          );
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e) }, 400), cors);
        }
      }

      // ----------------------------------------------------
      // Models source staging
      // ----------------------------------------------------
      if (method === "POST" && path === "/v1/admin/models/stage-from-source") {
        const body = await safeJson(req);

        try {
          const payload = await stageModelFromSource(env, body || {});
          return withCors(json(payload, payload.ok ? 200 : 400), cors);
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e) }, 400), cors);
        }
      }

      // ----------------------------------------------------
      // Models upsert
      // ----------------------------------------------------
      if (method === "POST" && path === "/v1/admin/models/upsert") {
        const body = await safeJson(req);
        const tableName = env.AIRTABLE_TABLE_MODELS || "models";

        const rawFields = body?.fields && typeof body.fields === "object" ? body.fields : {};
        const fields = pickAllowedFields(rawFields, getAllowedModelFields(env));

        const out = await airtableUpsertModel(env, tableName, {
          ...body,
          fields,
        });

        return withCors(
          json({
            ok: true,
            layer: inferLayerFromTable(tableName),
            model: out,
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Admin job create
      // ----------------------------------------------------
      if (method === "POST" && path === "/v1/admin/job/create") {
        const body = await safeJson(req);

        try {
          const out = await createAdminJob(env, body);
          return withCors(
            json({
              ok: true,
              layer: "core",
              ...out,
            }),
            cors
          );
        } catch (e) {
          if (e instanceof CreateSessionAccessError) {
            return withCors(json({ ok: false, error: { code: e.code, message: e.message } }, e.status), cors);
          }
          const error = String(e?.message || e || "job_create_failed");
          return withCors(json({ ok: false, error }, error.startsWith("private_") ? 403 : 500), cors);
        }
      }

      return withCors(json({ ok: false, error: "not_found" }, 404), cors);
    }

    return withCors(json({ ok: false, error: "not_found" }, 404), cors);
  },
};

/* =========================
   CORS
========================= */
function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedOrigin(req, env) {
  const allow = getAllowedOrigins(env);
  const origin = req.headers.get("Origin") || "";

  if (!origin) return true;
  if (allow.length === 0) return true;
  return allow.includes(origin);
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = getAllowedOrigins(env);
  const h = new Headers();

  if (!origin) {
    // server-to-server
  } else if (allow.length === 0 || allow.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }

  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Content-Type", "application/json");
  return h;
}

function withCors(res, cors) {
  const headers = new Headers(res.headers);
  cors.forEach((v, k) => headers.set(k, v));
  return new Response(res.body, {
    status: res.status,
    headers,
  });
}

/* =========================
   Auth
========================= */
function isAuthed(req, env) {
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (env.ADMIN_BEARER && bearer && bearer === env.ADMIN_BEARER) return true;
  if (env.INTERNAL_TOKEN && bearer && bearer === env.INTERNAL_TOKEN) return true;

  const ck = str(req.headers.get("X-Confirm-Key") || "");
  if (env.CONFIRM_KEY && ck && ck === env.CONFIRM_KEY) return true;

  if (isAdminGateSessionAuthed(req, env)) return true;

  return false;
}

function isConfirmKeyAuthed(req, env) {
  const ck = str(req.headers.get("X-Confirm-Key") || "");
  return Boolean(env.CONFIRM_KEY && ck && ck === env.CONFIRM_KEY);
}

function isAdminGateSessionAuthed(req, env) {
  const session = readAdminGateSession(req);
  if (!session || session.ok !== true) return false;
  if (!session.baseUrl || !ADMIN_GATE_ALLOWED_BASE_URLS.has(session.baseUrl)) return false;
  if (!Number.isFinite(session.at)) return false;
  if (Date.now() - session.at > ADMIN_GATE_TTL_MS) return false;

  const bearer = str(session.bearer || "");
  if (env.ADMIN_BEARER && bearer && bearer === env.ADMIN_BEARER) return true;
  if (env.INTERNAL_TOKEN && bearer && bearer === env.INTERNAL_TOKEN) return true;

  const confirmKey = str(session.confirmKey || "");
  if (env.CONFIRM_KEY && confirmKey && confirmKey === env.CONFIRM_KEY) return true;

  return false;
}

function readAdminGateSession(req) {
  const raw = parseCookieMap(req).get(ADMIN_GATE_SESSION_COOKIE);
  if (!raw) return null;

  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(atob(decoded));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function parseCookieMap(req) {
  const map = new Map();
  const raw = req.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.split("=");
    const key = str(name || "");
    if (!key) continue;
    map.set(key, rest.join("=").trim());
  }
  return map;
}

/* =========================
   JSON / utils
========================= */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function kenjiKnowledgeAdminShell(req, routeKind) {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#080604"><title>MMD Kenji Knowledge</title><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Crect width=%2764%27 height=%2764%27 rx=%2716%27 fill=%27%23080604%27/%3E%3Ctext x=%2732%27 y=%2738%27 text-anchor=%27middle%27 font-family=%27Arial,sans-serif%27 font-size=%2715%27 font-weight=%27700%27 fill=%27%23edc674%27%3EMMD%3C/text%3E%3C/svg%3E"><link rel="shortcut icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Crect width=%2764%27 height=%2764%27 rx=%2716%27 fill=%27%23080604%27/%3E%3Ctext x=%2732%27 y=%2738%27 text-anchor=%27middle%27 font-family=%27Arial,sans-serif%27 font-size=%2715%27 font-weight=%27700%27 fill=%27%23edc674%27%3EMMD%3C/text%3E%3C/svg%3E"><style>html,body{margin:0!important;padding:0!important;min-height:100%;background:#080604;color:#fff0dc;overflow-x:hidden}body{background:linear-gradient(180deg,#080604 0%,#050403 100%)}#mmdKenjiKnowledgeV9{min-height:100svh}</style><link rel="stylesheet" href="https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-board-bridge.css"></head><body><div id="mmdKenjiKnowledgeV9"></div><script defer src="https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-1-webflow-loader-board196.js"></script></body></html>`;
  return new Response(req.method.toUpperCase() === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-mmd-route-owner": "admin-worker",
      "x-mmd-page": "kenji-knowledge-admin",
      "x-mmd-origin": "admin-worker:kenji-knowledge-shell",
      "x-mmd-worker": "admin-worker",
      "x-mmd-route-canonical": KENJI_KNOWLEDGE_CANONICAL_PATH,
      "x-mmd-route-kind": routeKind,
    },
  });
}

function isKenjiKnowledgeShellPath(path) {
  return path === KENJI_KNOWLEDGE_CANONICAL_PATH || path === KENJI_KNOWLEDGE_COMPATIBILITY_ALIAS_PATH;
}

function isKenjiKnowledgeCapturedPath(path) {
  return (
    path.startsWith(KENJI_KNOWLEDGE_CANONICAL_PATH) ||
    path.startsWith(KENJI_KNOWLEDGE_COMPATIBILITY_ALIAS_PATH)
  );
}

function passThroughKenjiSuffixToOrigin(req) {
  // Worker Route origin semantics bypass same-zone Worker routes unless
  // global_fetch_strictly_public is explicitly enabled (it is not in this Worker).
  return fetch(req);
}

function isKenjiKnowledgeReadinessRoute(path, method) {
  if ((method === "GET" || method === "HEAD") && path === KENJI_KNOWLEDGE_AUTH_ME_PATH) return true;
  if ((method === "GET" || method === "HEAD") && path === KENJI_KNOWLEDGE_META_PATH) return true;
  if ((method === "GET" || method === "HEAD") && path === KENJI_KNOWLEDGE_LIST_PATH) return true;
  if ((method === "POST" || method === "HEAD") && path === KENJI_KNOWLEDGE_DRAFT_PATH) return true;
  if ((method === "GET" || method === "HEAD") && path === KENJI_KNOWLEDGE_PUBLISHED_PATH) return true;
  return false;
}

async function handleKenjiKnowledgeReadinessRoute(req, env, path, method) {
  if (!isAllowedOrigin(req, env)) {
    return jsonForMethod(req, { ok: false, error: "origin_not_allowed" }, 403);
  }

  if (!isAuthed(req, env)) {
    return jsonForMethod(req, { ok: false, authenticated: false, error: "unauthorized" }, 401);
  }

  if (path === KENJI_KNOWLEDGE_AUTH_ME_PATH) {
    return jsonForMethod(req, {
      ok: true,
      authenticated: true,
      worker: "admin-worker",
      scope: "internal_admin",
      source: "admin-worker",
    });
  }

  if (path === KENJI_KNOWLEDGE_PUBLISHED_PATH) {
    return jsonForMethod(req, {
      ok: true,
      source: "admin-worker",
      mode: "published_runtime_readiness",
      data_status: "readiness_only",
      storage: {
        persisted: false,
        reason: "not_configured",
      },
      cards: [],
    });
  }

  if (path === KENJI_KNOWLEDGE_META_PATH) {
    return jsonForMethod(req, {
      ok: true,
      source: "admin-worker",
      mode: "kenji_knowledge_readiness",
      storage: {
        persisted: false,
        reason: "not_configured",
      },
    });
  }

  if (path === KENJI_KNOWLEDGE_LIST_PATH) {
    return jsonForMethod(req, {
      ok: true,
      source: "admin-worker",
      mode: "kenji_knowledge_list",
      cards: [],
    });
  }

  if (path === KENJI_KNOWLEDGE_DRAFT_PATH) {
    if (method === "HEAD") {
      return jsonForMethod(req, {
        ok: true,
        source: "admin-worker",
        mode: "kenji_knowledge_draft",
      });
    }

    const parsed = await parseJsonObject(req);
    if (!parsed.ok) {
      return jsonForMethod(req, { ok: false, error: "invalid_json" }, 400);
    }

    return jsonForMethod(req, {
      ok: true,
      source: "admin-worker",
      mode: "kenji_knowledge_draft",
      draft_received: true,
      storage: {
        persisted: false,
        reason: "not_configured",
      },
    });
  }

  return jsonForMethod(req, { ok: false, error: "not_found" }, 404);
}

function jsonForMethod(req, data, status = 200) {
  if (req.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
  return json(data, status);
}

async function safeJson(req) {
  try {
    return await req.json();
  } catch (_) {
    return {};
  }
}

async function parseJsonObject(req) {
  try {
    const data = await req.json();
    return { ok: Boolean(data && typeof data === "object" && !Array.isArray(data)), data };
  } catch (_) {
    return { ok: false, data: null };
  }
}

function normalizePathname(pathname = "") {
  const normalized = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (normalized.length > 1) return normalized.replace(/\/$/, "");
  return normalized || "/";
}

function isAdminRichMenuRoute(path, method) {
  return (
    (method === "POST" && path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/draft`) ||
    (method === "POST" && path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/validate`) ||
    (method === "POST" && path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/validate-minimal`) ||
    (method === "POST" && path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/validate-no-postback`) ||
    (method === "POST" && path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/validate-message-only`) ||
    (method === "POST" && path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/validate-uri-only`) ||
    (method === "POST" && path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/publish`) ||
    (method === "POST" && path === `${ADMIN_RICH_MENU_BASE_PATH}/private-member/draft`) ||
    (method === "POST" && path === `${ADMIN_RICH_MENU_BASE_PATH}/private-member/validate`) ||
    (method === "GET" && path === `${ADMIN_RICH_MENU_BASE_PATH}/default`) ||
    (method === "GET" && path === `${ADMIN_RICH_MENU_BASE_PATH}/list`)
  );
}

function adminRichMenuServicePath(path) {
  if (path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/draft`) return "/public-world/draft";
  if (path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/validate`) return "/public-world/validate";
  if (path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/validate-minimal`) return "/public-world/validate-minimal";
  if (path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/validate-no-postback`) return "/public-world/validate-no-postback";
  if (path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/validate-message-only`) return "/public-world/validate-message-only";
  if (path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/validate-uri-only`) return "/public-world/validate-uri-only";
  if (path === `${ADMIN_RICH_MENU_BASE_PATH}/public-world/publish`) return "/public-world/publish";
  if (path === `${ADMIN_RICH_MENU_BASE_PATH}/private-member/draft`) return "/private-member/draft";
  if (path === `${ADMIN_RICH_MENU_BASE_PATH}/private-member/validate`) return "/private-member/validate";
  if (path === `${ADMIN_RICH_MENU_BASE_PATH}/default`) return "/default";
  if (path === `${ADMIN_RICH_MENU_BASE_PATH}/list`) return "/list";
  return "";
}

function sanitizeRichMenuAdminPayload(value) {
  const forbidden = /^(authorization|cookie|set-cookie|token|secret|admin_bearer|internal_token|confirm_key|line_channel_access_token)$/i;
  if (Array.isArray(value)) return value.map((item) => sanitizeRichMenuAdminPayload(item));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (forbidden.test(key)) continue;
      out[key] = sanitizeRichMenuAdminPayload(item);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
  return value;
}

async function handleAdminRichMenuRoute(req, env, path, method) {
  const binding = env.MEMBER_DASHBOARD_CHAT_WORKER;
  if (!binding || typeof binding.fetch !== "function") {
    return json({ ok: false, error: "service_binding_unavailable" }, 502);
  }

  const servicePath = adminRichMenuServicePath(path);
  if (!servicePath) return json({ ok: false, error: "not_found" }, 404);

  const init = {
    method,
    headers: {
      "content-type": "application/json",
      "x-mmd-service-binding": "admin-worker",
      "x-mmd-internal-call": "true",
    },
  };

  if (method !== "GET") {
    init.body = JSON.stringify(await safeJson(req));
  }

  const url = new URL(req.url);
  const serviceUrl = new URL(`${MEMBER_DASHBOARD_RICH_MENU_BASE_URL}${servicePath}`);
  if (url.searchParams.get("debug") === "1") serviceUrl.searchParams.set("debug", "1");
  const upstream = await binding.fetch(new Request(serviceUrl, init));
  const payload = await upstream.json().catch(() => ({ ok: false, error: "member_dashboard_response_invalid" }));
  return json(sanitizeRichMenuAdminPayload(payload), upstream.status);
}

function str(value) {
  return String(value || "").trim();
}

function truthy(value) {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = str(value).toLowerCase();
  return ["true", "yes", "y", "1"].includes(normalized);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function buildLastNDays(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function absoluteUrl(value, base) {
  const raw = str(value);
  if (!raw) return base;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function escHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function strReq(value, field) {
  const v = str(value);
  if (!v) throw new Error(`missing_${field}`);
  return v;
}

function numReq(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid_${field}`);
  return n;
}

function inferLayerFromTable(tableName) {
  const t = str(tableName).toLowerCase();
  if (t.includes("migration") || t.includes("immigration") || t.includes("bridge")) {
    return "immigration";
  }
  return "core_or_bridge";
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickAllowedFields(obj, allowed) {
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      out[key] = obj[key];
    }
  }
  return out;
}

function getAllowedMemberPatchFields(env) {
  return parseCsv(
    env.ALLOWED_MEMBER_PATCH_FIELDS ||
      [
        "name",
        "nickname",
        "mmd_client_name",
        "telegram_username",
        "telegram_id",
        "line_id",
        "line_user_id",
        "memberstack_id",
        "email",
        "phone",
        "legacy_tags",
        "notes",
        "status",
      ].join(",")
  );
}

function getAllowedModelFields(env) {
  return parseCsv(
    env.ALLOWED_MODEL_FIELDS ||
      [
        "name",
        "Name",
        "nickname",
        "Nickname",
        "model_name",
        "Model Name",
        "working_name",
        "Working Name",
        "display_name",
        "Display Name",
        "model_code",
        "model_lookup_key",
        "telegram_username",
        "telegram_id",
        "unique_key",
        "status",
        "notes",
        "Notes",
        "notes_raw",
        "admin_note",
        "payload_json",
        "line_id",
        "LINE ID",
        "line_user_id",
        "LINE User ID",
        "aliases",
        "alias",
        "legacy_tags",
      ].join(",")
  );
}

function getModelSearchFields(env) {
  const configured = parseCsv(env.MODEL_SEARCH_FIELDS || "");
  return configured.length ? configured : MODEL_SEARCH_FIELDS;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => {
      if (entry == null) return false;
      if (typeof entry === "string") return entry.trim().length > 0;
      return true;
    })
  );
}

/* =========================
   Model Schema Patch V1
========================= */
const MODEL_SCHEMA_PATCH_V1_MEDIA_TYPES = new Set([
  "profile_photo",
  "public_gallery",
  "intro_video",
  "private_gallery",
  "flash_preview",
]);
const MODEL_SCHEMA_PATCH_V1_VISIBILITY = new Set([
  "hidden",
  "internal",
  "standard",
  "featured",
  "vip",
  "black_card",
]);
const MODEL_SCHEMA_PATCH_V1_SELF_AUTH_LOCKED_VISIBILITY = new Set(["vip", "black_card"]);

export function modelSchemaPatchV1Tables(env = {}) {
  return {
    models: {
      table: str(env.AIRTABLE_TABLE_MODELS || "models"),
      fields: {
        clientVisibilityStatus: str(env.AT_MODELS__CLIENT_VISIBILITY_STATUS || "client_visibility_status"),
        approvedClientVisibility: str(env.AT_MODELS__APPROVED_CLIENT_VISIBILITY || "approved_client_visibility"),
        visibilityReviewStatus: str(env.AT_MODELS__VISIBILITY_REVIEW_STATUS || "visibility_review_status"),
        visibilityAuthorizedBy: str(env.AT_MODELS__VISIBILITY_AUTHORIZED_BY || "visibility_authorized_by"),
        visibilityAuthorizedAt: str(env.AT_MODELS__VISIBILITY_AUTHORIZED_AT || "visibility_authorized_at"),
        visibilityAuthorizationNote: str(env.AT_MODELS__VISIBILITY_AUTHORIZATION_NOTE || "visibility_authorization_note"),
        rateReviewStatus: str(env.AT_MODELS__RATE_REVIEW_STATUS || "rate_review_status"),
        privateGalleryStatus: str(env.AT_MODELS__PRIVATE_GALLERY_STATUS || "private_gallery_status"),
        privateFlashStatus: str(env.AT_MODELS__PRIVATE_FLASH_STATUS || "private_flash_status"),
      },
    },
    payments: {
      table: str(env.AIRTABLE_TABLE_PAYMENTS || "payments"),
      fields: {
        paymentRef: str(env.AT_PAYMENTS__PAYMENT_REF || "payment_ref"),
        depositStatus: str(env.AT_PAYMENTS__DEPOSIT_STATUS || "deposit_status"),
        verificationStatus: str(env.AT_PAYMENTS__VERIFICATION_STATUS || "verification_status"),
        officialVerifiedAt: str(env.AT_PAYMENTS__OFFICIAL_VERIFIED_AT || "official_verified_at"),
        officialVerificationRef: str(env.AT_PAYMENTS__OFFICIAL_VERIFICATION_REF || "official_verification_ref"),
        officialVerifiedBy: str(env.AT_PAYMENTS__OFFICIAL_VERIFIED_BY || "official_verified_by"),
        officialMatchReason: str(env.AT_PAYMENTS__OFFICIAL_MATCH_REASON || "official_match_reason"),
      },
    },
    mediaAssets: {
      table: str(env.AIRTABLE_TABLE_MODEL_MEDIA_ASSETS || "MMD — Model Media Assets"),
      fields: {
        mediaId: str(env.AT_MEDIA_ASSETS__MEDIA_ID || "media_id"),
        model: str(env.AT_MEDIA_ASSETS__MODEL || "Model"),
        mediaType: str(env.AT_MEDIA_ASSETS__MEDIA_TYPE || "media_type"),
        mediaVisibility: str(env.AT_MEDIA_ASSETS__MEDIA_VISIBILITY || "media_visibility"),
        assetRole: str(env.AT_MEDIA_ASSETS__ASSET_ROLE || "asset_role"),
        slotNumber: str(env.AT_MEDIA_ASSETS__SLOT_NUMBER || "slot_number"),
        reviewStatus: str(env.AT_MEDIA_ASSETS__REVIEW_STATUS || "review_status"),
        publicSafe: str(env.AT_MEDIA_ASSETS__PUBLIC_SAFE || "public_safe"),
        privateSafe: str(env.AT_MEDIA_ASSETS__PRIVATE_SAFE || "private_safe"),
        flashSafe: str(env.AT_MEDIA_ASSETS__FLASH_SAFE || "flash_safe"),
        fileName: str(env.AT_MEDIA_ASSETS__FILE_NAME || "file_name"),
        fileType: str(env.AT_MEDIA_ASSETS__FILE_TYPE || "file_type"),
        fileSizeBytes: str(env.AT_MEDIA_ASSETS__FILE_SIZE_BYTES || "file_size_bytes"),
        r2Bucket: str(env.AT_MEDIA_ASSETS__R2_BUCKET || "r2_bucket"),
        privateOriginalKey: str(env.AT_MEDIA_ASSETS__PRIVATE_ORIGINAL_KEY || "private_original_key"),
        uploadedAt: str(env.AT_MEDIA_ASSETS__UPLOADED_AT || "uploaded_at"),
      },
    },
    reviewRequests: {
      table: str(env.AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS || "MMD — Model Review Requests"),
      fields: {
        requestId: str(env.AT_REVIEW_REQUESTS__REQUEST_ID || "request_id"),
        model: str(env.AT_REVIEW_REQUESTS__MODEL || "Model"),
        requestType: str(env.AT_REVIEW_REQUESTS__REQUEST_TYPE || "request_type"),
        requestStatus: str(env.AT_REVIEW_REQUESTS__REQUEST_STATUS || "request_status"),
        requestedBy: str(env.AT_REVIEW_REQUESTS__REQUESTED_BY || "requested_by"),
        requestedAt: str(env.AT_REVIEW_REQUESTS__REQUESTED_AT || "requested_at"),
        requestedVisibility: str(env.AT_REVIEW_REQUESTS__REQUESTED_VISIBILITY || "requested_visibility"),
        requestedMinimumRateThb: str(env.AT_REVIEW_REQUESTS__REQUESTED_MINIMUM_RATE_THB || "requested_minimum_rate_thb"),
        requestedStandardRateThb: str(env.AT_REVIEW_REQUESTS__REQUESTED_STANDARD_RATE_THB || "requested_standard_rate_thb"),
        requestedFlashSalesUse: str(env.AT_REVIEW_REQUESTS__REQUESTED_FLASH_SALES_USE || "requested_flash_sales_use"),
        linkedMediaAssets: str(env.AT_REVIEW_REQUESTS__LINKED_MEDIA_ASSETS || "linked_media_assets"),
        decisionNote: str(env.AT_REVIEW_REQUESTS__DECISION_NOTE || "decision_note"),
        payloadJson: str(env.AT_REVIEW_REQUESTS__PAYLOAD_JSON || "payload_json"),
      },
    },
    flashGrants: {
      table: str(env.AIRTABLE_TABLE_PRIVATE_FLASH_PREVIEW_GRANTS || "MMD — Private Flash Preview Grants"),
      fields: {
        grantId: str(env.AT_FLASH_GRANTS__GRANT_ID || "grant_id"),
        client: str(env.AT_FLASH_GRANTS__CLIENT || "Client"),
        model: str(env.AT_FLASH_GRANTS__MODEL || "Model"),
        session: str(env.AT_FLASH_GRANTS__SESSION || "Session"),
        payment: str(env.AT_FLASH_GRANTS__PAYMENT || "Payment"),
        mediaAsset: str(env.AT_FLASH_GRANTS__MEDIA_ASSET || "Media Asset"),
        grantStatus: str(env.AT_FLASH_GRANTS__GRANT_STATUS || "grant_status"),
        requiredGate: str(env.AT_FLASH_GRANTS__REQUIRED_GATE || "required_gate"),
        depositVerified: str(env.AT_FLASH_GRANTS__DEPOSIT_VERIFIED || "deposit_verified"),
        officialVerificationRef: str(env.AT_FLASH_GRANTS__OFFICIAL_VERIFICATION_REF || "official_verification_ref"),
        durationSec: str(env.AT_FLASH_GRANTS__DURATION_SEC || "duration_sec"),
        viewLimit: str(env.AT_FLASH_GRANTS__VIEW_LIMIT || "view_limit"),
        viewCount: str(env.AT_FLASH_GRANTS__VIEW_COUNT || "view_count"),
        previewTokenHash: str(env.AT_FLASH_GRANTS__PREVIEW_TOKEN_HASH || "preview_token_hash"),
        signedUrlStatus: str(env.AT_FLASH_GRANTS__SIGNED_URL_STATUS || "signed_url_status"),
        expiresAt: str(env.AT_FLASH_GRANTS__EXPIRES_AT || "expires_at"),
        watermarkCode: str(env.AT_FLASH_GRANTS__WATERMARK_CODE || "watermark_code"),
        authorizedBy: str(env.AT_FLASH_GRANTS__AUTHORIZED_BY || "authorized_by"),
        authorizedAt: str(env.AT_FLASH_GRANTS__AUTHORIZED_AT || "authorized_at"),
        grantNote: str(env.AT_FLASH_GRANTS__GRANT_NOTE || "grant_note"),
        payloadJson: str(env.AT_FLASH_GRANTS__PAYLOAD_JSON || "payload_json"),
      },
    },
  };
}

export function classifyModelSchemaPatchV1AirtableError(result) {
  const status = Number(result?.status || result?.detail?.status || 0);
  const data = result?.data || result?.detail?.data || {};
  const message = str(data?.error?.message || data?.error || result?.error);
  const type = str(data?.error?.type || data?.type);
  if (status === 404) return { code: "missing_table", status: 503, message: "Airtable table is missing or not enabled." };
  if (status === 422 || /unknown field|field.*not found|invalid.*field/i.test(`${type} ${message}`)) {
    return { code: "schema_not_ready", status: 503, message: "Airtable schema is not ready for this route." };
  }
  if (result?.error === "missing_airtable_env") {
    return { code: "missing_airtable_env", status: 500, message: "Airtable env is missing." };
  }
  return { code: "airtable_request_failed", status: 500, message: "Airtable request failed." };
}

export function validateModelSchemaPatchV1Payload(route, body = {}) {
  const errors = [];
  const input = readObject(body);
  const modelId = str(input.model_id || input.model_record_id);

  if (route !== MODEL_SCHEMA_PATCH_V1_ROUTES.privateFlashAuthorize && !modelId) errors.push("model_id");
  if (route === MODEL_SCHEMA_PATCH_V1_ROUTES.visibilityUpdate) {
    const requested = normalizeSchemaPatchWord(input.requested_visibility || input.visibility);
    if (!MODEL_SCHEMA_PATCH_V1_VISIBILITY.has(requested)) errors.push("requested_visibility");
  }
  if (route === MODEL_SCHEMA_PATCH_V1_ROUTES.rateRequest && !isPlainObject(input.rate_patch || input.rates)) {
    errors.push("rate_patch");
  }
  if (
    route === MODEL_SCHEMA_PATCH_V1_ROUTES.mediaUploadInit ||
    route === MODEL_SCHEMA_PATCH_V1_ROUTES.mediaUploadComplete
  ) {
    const mediaType = normalizeSchemaPatchWord(input.media_type);
    if (!MODEL_SCHEMA_PATCH_V1_MEDIA_TYPES.has(mediaType)) errors.push("media_type");
  }
  if (route === MODEL_SCHEMA_PATCH_V1_ROUTES.mediaReviewRequest) {
    const mediaType = normalizeSchemaPatchWord(input.media_type);
    const assetIds = Array.isArray(input.asset_ids) ? input.asset_ids.map(str).filter(Boolean) : [];
    if (mediaType && !MODEL_SCHEMA_PATCH_V1_MEDIA_TYPES.has(mediaType)) errors.push("media_type");
    if (!mediaType && !assetIds.length) errors.push("media_type_or_asset_ids");
  }
  if (route === MODEL_SCHEMA_PATCH_V1_ROUTES.privateFlashAuthorize) {
    if (!modelId) errors.push("model_id");
    if (!str(input.client_id || input.client_record_id)) errors.push("client_id");
    const manualUnlock = input.manual_unlock === true;
    if (!manualUnlock && !str(input.payment_ref || input.payment_record_id)) errors.push("payment_ref");
  }

  return { ok: errors.length === 0, errors };
}

async function handleModelSchemaPatchV1Route(req, env, path) {
  if (!isAllowedOrigin(req, env)) return modelSchemaPatchJson({ ok: false, error: "origin_not_allowed" }, 403);

  const body = await safeJson(req);
  const adminAuthed = isAuthed(req, env);
  const isAuthorizeRoute = path === MODEL_SCHEMA_PATCH_V1_ROUTES.privateFlashAuthorize;
  if (isAuthorizeRoute && !adminAuthed) return modelSchemaPatchJson({ ok: false, error: "unauthorized" }, 401);
  if (!adminAuthed) return modelSchemaPatchJson({ ok: false, error: "signed_t_required" }, 401);

  const validation = validateModelSchemaPatchV1Payload(path, body || {});
  if (!validation.ok) {
    return modelSchemaPatchJson({
      ok: false,
      error: {
        code: "validation_failed",
        message: `Missing or invalid required fields: ${validation.errors.join(", ")}`,
      },
    }, 400);
  }

  const context = {
    actor: str(req.headers.get("X-Admin-Actor") || body?.actor || body?.authorized_by || "admin-worker"),
    actorRole: "admin",
  };

  try {
    if (path === MODEL_SCHEMA_PATCH_V1_ROUTES.visibilityUpdate) {
      return modelSchemaPatchJson(await handleModelVisibilityUpdate(env, body || {}, context));
    }
    if (path === MODEL_SCHEMA_PATCH_V1_ROUTES.rateRequest) {
      return modelSchemaPatchJson(await handleModelRateRequest(env, body || {}, context));
    }
    if (path === MODEL_SCHEMA_PATCH_V1_ROUTES.mediaUploadInit) {
      return modelSchemaPatchJson(await handleModelMediaUploadInit(env, body || {}, context));
    }
    if (path === MODEL_SCHEMA_PATCH_V1_ROUTES.mediaUploadComplete) {
      return modelSchemaPatchJson(await handleModelMediaUploadComplete(env, body || {}, context));
    }
    if (path === MODEL_SCHEMA_PATCH_V1_ROUTES.mediaReviewRequest) {
      return modelSchemaPatchJson(await handleModelMediaReviewRequest(env, body || {}, context));
    }
    if (path === MODEL_SCHEMA_PATCH_V1_ROUTES.privateGalleryRequest) {
      return modelSchemaPatchJson(await handleModelPrivateGalleryRequest(env, body || {}, context));
    }
    if (path === MODEL_SCHEMA_PATCH_V1_ROUTES.privateFlashRequest) {
      return modelSchemaPatchJson(await handleModelPrivateFlashRequest(env, body || {}, context));
    }
    if (path === MODEL_SCHEMA_PATCH_V1_ROUTES.privateFlashAuthorize) {
      return modelSchemaPatchJson(await handleModelPrivateFlashAuthorize(env, body || {}, context));
    }
  } catch (error) {
    if (error?.schemaPatchError) {
      return modelSchemaPatchJson({ ok: false, error: error.code, message: error.message }, error.status || 500);
    }
    return modelSchemaPatchJson({ ok: false, error: "model_schema_patch_failed", message: String(error?.message || error) }, 500);
  }

  return modelSchemaPatchJson({ ok: false, error: "not_found" }, 404);
}

function modelSchemaPatchJson(payload, status = 200) {
  const response = json(payload, status);
  response.headers.set("cache-control", "no-store");
  return response;
}

/* =========================
   Model Session Runtime V1a
========================= */
function modelSessionJson(payload, status = 200) {
  const response = json(payload, status);
  response.headers.set("cache-control", "no-store");
  return response;
}

function modelSessionTables(env = {}) {
  return {
    sessions: {
      table: str(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX"),
      fields: {
        sessionId: str(env.AT_SESSIONS__SESSION_ID || "session_id"),
        paymentRef: str(env.AT_SESSIONS__PAYMENT_REF || "payment_ref"),
        state: str(env.AT_SESSIONS__STATE || "session_state"),
        status: str(env.AT_SESSIONS__STATUS || "status"),
        modelRecordId: str(env.AT_SESSIONS__MODEL_RECORD_ID || "Assigned Model"),
        modelName: str(env.AT_SESSIONS__MODEL_NAME || "model_name"),
      },
    },
  };
}

function readModelSessionT(req, body = null) {
  const url = new URL(req.url);
  return str(url.searchParams.get("t") || body?.t || "");
}

function base64UrlDecodeUtf8(input) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function base64UrlEncodeUtf8(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, enc.encode(String(message || ""))));
}

function isModelSessionPayload(payload) {
  if (!payload || payload.role !== "model") return false;
  if (payload.kind === "model_confirm") return true;
  if (payload.kind === "customer_invite" && payload.lane === "model_console") return true;
  if (payload.kind === "model_session" || payload.kind === "model_console") return true;
  return false;
}

async function verifyModelSessionT(t, env) {
  const secret = str(env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!secret || !t) return null;
  const parts = String(t).split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;
  const expected = await hmacSha256Hex(encoded, secret);
  if (signature !== expected) return null;

  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecodeUtf8(encoded));
  } catch (_) {
    return null;
  }

  const exp = Number(payload?.exp || 0);
  if (exp && exp <= Math.floor(Date.now() / 1000)) return null;
  if (!isModelSessionPayload(payload)) return null;
  return payload;
}

function modelSessionAssignmentKeys(payload) {
  return [
    str(payload?.session_id),
    str(payload?.immigration_id),
    str(payload?.assignment_key),
    str(payload?.payment_ref),
  ].filter(Boolean);
}

function modelSessionFieldValues(fields, names) {
  const values = [];
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value)) {
      for (const item of value) values.push(str(item));
    } else {
      values.push(str(value));
    }
  }
  return [...new Set(values.filter(Boolean))];
}

function exactFormula(field, value) {
  return `{${field}}="${escapeFormulaValue(value)}"`;
}

function modelSessionLookupFormulas(env, payload) {
  const tables = modelSessionTables(env);
  const fields = tables.sessions.fields;
  const formulas = [];
  const sessionKeys = [str(payload?.session_id), str(payload?.immigration_id), str(payload?.assignment_key)].filter(Boolean);
  const paymentRef = str(payload?.payment_ref);
  for (const key of sessionKeys) formulas.push(exactFormula(fields.sessionId, key));
  if (paymentRef) formulas.push(exactFormula(fields.paymentRef, paymentRef));
  return [...new Set(formulas)];
}

async function modelSessionFindOne(env, tableName, filterByFormula) {
  const params = new URLSearchParams();
  params.set("pageSize", "1");
  params.set("filterByFormula", filterByFormula);
  const result = await airtableFetch(env, `/${encodeURIComponent(tableName)}?${params.toString()}`);
  if (!result.ok) return { ok: false, detail: result };
  const record = result.data?.records?.[0];
  return { ok: true, record: record ? { id: record.id, fields: record.fields || {} } : null };
}

function modelSessionOwnsRecord(env, payload, record) {
  const fields = record?.fields || {};
  const tables = modelSessionTables(env);
  const names = tables.sessions.fields;
  const assignmentKeys = new Set(modelSessionAssignmentKeys(payload));
  const sessionValues = modelSessionFieldValues(fields, [names.sessionId, names.paymentRef]);
  if (sessionValues.length && !sessionValues.some((value) => assignmentKeys.has(value))) return false;

  const payloadModelId = str(payload?.model_record_id || payload?.model_id);
  const recordModelIds = modelSessionFieldValues(fields, [names.modelRecordId, "Model Record ID", "model_id", "Model"]);
  if (payloadModelId && recordModelIds.length && !recordModelIds.includes(payloadModelId)) return false;

  const payloadModelName = str(payload?.model_name).toLowerCase();
  const recordModelNames = modelSessionFieldValues(fields, [names.modelName, "Model Name", "working_name"]).map((value) => value.toLowerCase());
  if (payloadModelName && recordModelNames.length && !recordModelNames.includes(payloadModelName)) return false;

  return true;
}

async function resolveModelSessionContext(req, env, body = null) {
  const t = readModelSessionT(req, body);
  const payload = await verifyModelSessionT(t, env);
  if (!payload) return { ok: false, status: 401, error: "unauthorized" };

  const tables = modelSessionTables(env);
  const formulas = modelSessionLookupFormulas(env, payload);
  if (!formulas.length) return { ok: false, status: 403, error: "forbidden" };

  for (const formula of formulas) {
    const found = await modelSessionFindOne(env, tables.sessions.table, formula);
    if (!found.ok) return { ok: false, status: 503, error: "schema_not_ready" };
    if (!found.record) continue;
    if (!modelSessionOwnsRecord(env, payload, found.record)) {
      return { ok: false, status: 403, error: "forbidden" };
    }
    return { ok: true, payload, session: found.record, tables };
  }

  return { ok: false, status: 403, error: "forbidden" };
}

function resolveModelSessionStateField(tables, fields) {
  const preferred = [tables.sessions.fields.state, tables.sessions.fields.status, "state", "status"];
  for (const field of [...new Set(preferred)]) {
    if (Object.prototype.hasOwnProperty.call(fields || {}, field)) return field;
  }
  return "";
}

function modelSessionStateFromRecord(tables, record) {
  const fields = record?.fields || {};
  const preferred = [tables.sessions.fields.state, tables.sessions.fields.status, "state", "status"];
  const present = [];
  for (const field of [...new Set(preferred)]) {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) continue;
    present.push(field);
    const value = str(fields[field]);
    if (value) return { field, state: value };
  }
  const field = present[0] || "";
  return { field, state: field ? str(fields[field]) : "" };
}

function modelSessionModelRecordIdFromFields(fields, fieldName) {
  const value = fields?.[fieldName];
  if (Array.isArray(value)) return str(value[0] || "");
  return str(value || "");
}

function modelSessionPageSlug(page) {
  return str(page?.path).replace(/^\/model\/session\//, "").replace(/-/g, "_");
}

function modelSessionResponseSession(tables, record) {
  const fields = record?.fields || {};
  const stateInfo = modelSessionStateFromRecord(tables, record);
  const normalized = normalizeSessionState(stateInfo.state);
  const page = resolveModelSessionPage(normalized);
  return {
    session_id: str(fields[tables.sessions.fields.sessionId] || ""),
    state: stateInfo.state,
    normalized_state: normalized,
    page: modelSessionPageSlug(page),
    route: page?.path || "",
    allowed_actions: getAllowedModelSessionActions(normalized),
  };
}

async function signModelSessionPayload(payload, env) {
  const secret = str(env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!secret) return "";
  const encoded = base64UrlEncodeUtf8(JSON.stringify(payload));
  return `${encoded}.${await hmacSha256Hex(encoded, secret)}`;
}

function modelSessionLinkIssuerFormulas(tables, body) {
  const fields = tables.sessions.fields;
  const formulas = [];
  const sessionId = str(body?.session_id);
  const paymentRef = str(body?.payment_ref);
  if (sessionId) formulas.push(exactFormula(fields.sessionId, sessionId));
  if (paymentRef) formulas.push(exactFormula(fields.paymentRef, paymentRef));
  return [...new Set(formulas)];
}

function modelSessionLinkCurrentUrl(req, env, t) {
  const currentUrl = str(env.MODEL_SESSION_CURRENT_URL);
  const url = currentUrl
    ? new URL(currentUrl)
    : new URL(MODEL_SESSION_CURRENT_PATH, str(env.MODEL_SESSION_PUBLIC_BASE_URL) || new URL(req.url).origin);
  url.searchParams.set("t", t);
  return url.toString();
}

async function handleModelSessionLinkIssuer(req, env) {
  const body = await safeJson(req);
  const tables = modelSessionTables(env);
  const formulas = modelSessionLinkIssuerFormulas(tables, body);
  if (!formulas.length) return modelSessionJson({ ok: false, error: "missing_session_identifier" }, 400);

  let session = null;
  for (const formula of formulas) {
    const found = await modelSessionFindOne(env, tables.sessions.table, formula);
    if (!found.ok) return modelSessionJson({ ok: false, error: "schema_not_ready" }, 503);
    if (found.record) {
      session = found.record;
      break;
    }
  }
  if (!session) return modelSessionJson({ ok: false, error: "session_not_found" }, 404);

  const responseSession = modelSessionResponseSession(tables, session);
  if (!responseSession.normalized_state) {
    return modelSessionJson({ ok: false, error: "schema_not_ready" }, 503);
  }

  const fields = session.fields || {};
  const modelRecordId = modelSessionModelRecordIdFromFields(fields, tables.sessions.fields.modelRecordId);
  const modelName = str(fields[tables.sessions.fields.modelName] || "");
  if (!modelRecordId && !modelName) {
    return modelSessionJson({ ok: false, error: "model_identity_not_ready" }, 409);
  }

  const expiresInSeconds = clampInt(body?.expires_in_seconds, 300, 86400, 3600);
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = compactObject({
    kind: "model_session",
    role: "model",
    session_id: responseSession.session_id || str(body?.session_id),
    payment_ref: str(fields[tables.sessions.fields.paymentRef] || body?.payment_ref),
    model_record_id: modelRecordId,
    model_name: modelName,
    exp,
  });

  const t = await signModelSessionPayload(payload, env);
  if (!t) return modelSessionJson({ ok: false, error: "signing_not_ready" }, 503);

  return modelSessionJson({
    ok: true,
    expires_at: new Date(exp * 1000).toISOString(),
    session: responseSession,
    model_session_url: modelSessionLinkCurrentUrl(req, env, t),
  });
}

async function handleModelSessionCurrent(req, env) {
  const context = await resolveModelSessionContext(req, env);
  if (!context.ok) return modelSessionJson({ ok: false, error: context.error }, context.status);

  const stateInfo = modelSessionStateFromRecord(context.tables, context.session);
  if (!stateInfo.field || !normalizeSessionState(stateInfo.state)) {
    return modelSessionJson({ ok: false, error: "schema_not_ready" }, 503);
  }

  return modelSessionJson({
    ok: true,
    session: modelSessionResponseSession(context.tables, context.session),
  });
}

async function verifyStartWorkPaymentTruth(env, session) {
  const truthUrl = str(env.MODEL_SESSION_PAYMENT_TRUTH_URL || env.PAYMENTS_WORKER_FINAL_PAYMENT_STATUS_URL);
  // Runtime V1a must fail closed until payments-worker exposes a stable final-payment truth endpoint.
  if (!truthUrl) return { ok: false, error: "payment_gate_not_ready" };

  const res = await fetch(truthUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.CONFIRM_KEY ? { "X-Confirm-Key": env.CONFIRM_KEY } : {}),
    },
    body: JSON.stringify({
      session_id: session.session_id,
      action: "start_work_preflight",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) return { ok: false, error: "payment_not_confirmed" };
  const confirmed =
    data.final_payment_confirmed === true ||
    data.official_final_payment_confirmed === true ||
    normalizeSessionState(data.final_payment_status) === "final_payment_confirmed";
  return confirmed ? { ok: true } : { ok: false, error: "payment_not_confirmed" };
}

async function handleModelSessionAction(req, env) {
  const body = await safeJson(req);
  const authContext = await resolveModelSessionContext(req, env, body);
  if (!authContext.ok) return modelSessionJson({ ok: false, error: authContext.error }, authContext.status);

  const action = normalizeModelSessionAction(body?.action);
  if (!MODEL_SESSION_MODEL_ALLOWED_ACTIONS.has(str(body?.action)) && !MODEL_SESSION_MODEL_ALLOWED_ACTIONS.has(action)) {
    return modelSessionJson({ ok: false, error: "invalid_transition" }, 409);
  }
  if (MODEL_SESSION_MODEL_BLOCKED_ACTIONS.has(action) || action.includes("final_payment_confirmed")) {
    return modelSessionJson({ ok: false, error: "invalid_transition" }, 409);
  }

  const reread = await resolveModelSessionContext(req, env, body);
  if (!reread.ok) return modelSessionJson({ ok: false, error: reread.error }, reread.status);

  const stateInfo = modelSessionStateFromRecord(reread.tables, reread.session);
  if (!stateInfo.field || !normalizeSessionState(stateInfo.state)) {
    return modelSessionJson({ ok: false, error: "schema_not_ready" }, 503);
  }

  const transition = resolveModelSessionTransition(action, stateInfo.state);
  if (!transition.ok) return modelSessionJson({ ok: false, error: "invalid_transition" }, 409);

  if (transition.to === "final_payment_confirmed") {
    return modelSessionJson({ ok: false, error: "invalid_transition" }, 409);
  }

  const currentSession = modelSessionResponseSession(reread.tables, reread.session);
  if (action === "start_work") {
    const payment = await verifyStartWorkPaymentTruth(env, currentSession);
    if (!payment.ok) return modelSessionJson({ ok: false, error: payment.error }, 403);
  }

  const patch = { [stateInfo.field]: transition.to };
  if (action === "decline_job" && str(body?.reason)) {
    const reasonField = str(env.AT_SESSIONS__DECLINE_REASON || "decline_reason");
    patch[reasonField] = str(body.reason).slice(0, 500);
  }

  const updated = await airtablePatchById(env, reread.tables.sessions.table, reread.session.id, patch);
  if (!updated.ok) return modelSessionJson({ ok: false, error: "schema_not_ready" }, 503);

  return modelSessionJson({
    ok: true,
    session: modelSessionResponseSession(reread.tables, { id: updated.id, fields: updated.fields }),
  });
}

function schemaPatchError(code, status, message) {
  const error = new Error(message || code);
  error.schemaPatchError = true;
  error.code = code;
  error.status = status;
  return error;
}

function throwSchemaPatchAirtableError(result) {
  const classified = classifyModelSchemaPatchV1AirtableError(result);
  throw schemaPatchError(classified.code, classified.status, classified.message);
}

async function modelSchemaPatchCreate(env, tableDef, fields) {
  const result = await airtableFetch(env, `/${encodeURIComponent(tableDef.table)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields: compactObject(fields) }], typecast: true }),
  });
  if (!result.ok) throwSchemaPatchAirtableError(result);
  const record = result.data?.records?.[0] || {};
  return { id: record.id || "", fields: record.fields || {} };
}

async function modelSchemaPatchPatch(env, tableDef, recordId, fields) {
  const result = await airtableFetch(env, `/${encodeURIComponent(tableDef.table)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: compactObject(fields), typecast: true }),
  });
  if (!result.ok) throwSchemaPatchAirtableError(result);
  return { id: result.data?.id || recordId, fields: result.data?.fields || {} };
}

async function modelSchemaPatchFindOneByField(env, tableDef, fieldName, value) {
  if (!str(value)) return null;
  const params = new URLSearchParams();
  params.set("pageSize", "1");
  params.set("filterByFormula", `{${fieldName}}="${escapeFormulaValue(value)}"`);
  const result = await airtableFetch(env, `/${encodeURIComponent(tableDef.table)}?${params.toString()}`);
  if (!result.ok) throwSchemaPatchAirtableError(result);
  const rec = result.data?.records?.[0];
  return rec ? { id: rec.id, fields: rec.fields || {} } : null;
}

async function modelSchemaPatchGetById(env, tableDef, recordId) {
  const id = str(recordId);
  if (!id) return null;
  const result = await airtableFetch(env, `/${encodeURIComponent(tableDef.table)}/${encodeURIComponent(id)}`);
  if (!result.ok) throwSchemaPatchAirtableError(result);
  return { id: result.data?.id || id, fields: result.data?.fields || {}, createdTime: result.data?.createdTime || "" };
}

function modelSchemaLinkedRecord(recordId) {
  const id = str(recordId);
  return id ? [id] : undefined;
}

function resolveSchemaPatchModelId(body) {
  return str(body?.model_id || body?.model_record_id);
}

async function createModelReviewRequest(env, input) {
  const tables = modelSchemaPatchV1Tables(env);
  const requestId = `${input.requestType}_req_${crypto.randomUUID()}`;
  const fields = tables.reviewRequests.fields;
  const rec = await modelSchemaPatchCreate(env, tables.reviewRequests, {
    [fields.requestId]: requestId,
    [fields.model]: modelSchemaLinkedRecord(input.modelId),
    [fields.requestType]: input.requestType,
    [fields.requestStatus]: input.status || "pending_review",
    [fields.requestedBy]: input.requestedBy || input.actor || "model",
    [fields.requestedAt]: input.requestedAt || new Date().toISOString(),
    [fields.requestedVisibility]: str(input.requestedVisibility),
    [fields.requestedMinimumRateThb]: input.requestedMinimumRateThb,
    [fields.requestedStandardRateThb]: input.requestedStandardRateThb,
    [fields.requestedFlashSalesUse]: input.requestedFlashSalesUse,
    [fields.linkedMediaAssets]: modelSchemaLinkedRecord(input.linkedMediaAssetId),
    [fields.decisionNote]: str(input.note),
    [fields.payloadJson]: JSON.stringify(input.payload || {}),
  });
  return { request_id: requestId, record_id: rec.id, table: tables.reviewRequests.table };
}

async function handleModelVisibilityUpdate(env, body, context) {
  const tables = modelSchemaPatchV1Tables(env);
  const modelId = resolveSchemaPatchModelId(body);
  const requestedVisibility = normalizeSchemaPatchWord(body.requested_visibility || body.visibility);
  const now = new Date().toISOString();
  const needsReview = MODEL_SCHEMA_PATCH_V1_SELF_AUTH_LOCKED_VISIBILITY.has(requestedVisibility);

  if (needsReview) {
    await modelSchemaPatchPatch(env, tables.models, modelId, {
      [tables.models.fields.visibilityReviewStatus]: "pending_review",
    });
    const review = await createModelReviewRequest(env, {
      modelId,
      requestType: "visibility",
      requestedBy: context.actor,
      requestedVisibility,
      payload: {
        requested_visibility: requestedVisibility,
        source: "model_console_v16",
        self_authorization_blocked: true,
      },
      note: str(body.note),
    });
    return { ok: true, status: "pending_review", model_id: modelId, requested_visibility: requestedVisibility, review };
  }

  const patched = await modelSchemaPatchPatch(env, tables.models, modelId, {
    [tables.models.fields.clientVisibilityStatus]: "approved",
    [tables.models.fields.approvedClientVisibility]: requestedVisibility,
    [tables.models.fields.visibilityReviewStatus]: "approved",
    [tables.models.fields.visibilityAuthorizedBy]: context.actor,
    [tables.models.fields.visibilityAuthorizedAt]: now,
    [tables.models.fields.visibilityAuthorizationNote]: str(body.note),
  });
  return { ok: true, status: "approved", model_id: modelId, visibility: requestedVisibility, record_id: patched.id };
}

async function handleModelRateRequest(env, body, context) {
  const tables = modelSchemaPatchV1Tables(env);
  const modelId = resolveSchemaPatchModelId(body);
  const patch = readObject(body.rate_patch || body.rates);
  await modelSchemaPatchPatch(env, tables.models, modelId, {
    [tables.models.fields.rateReviewStatus]: "pending_review",
  });
  const review = await createModelReviewRequest(env, {
    modelId,
    requestType: "rate",
    requestedBy: context.actor,
    requestedMinimumRateThb: patch.minimum_rate_thb ?? patch.model_minimum_rate_thb,
    requestedStandardRateThb: patch.standard_rate_thb ?? patch.model_standard_rate_thb,
    payload: { rate_patch: patch, source: "model_console_v16" },
    note: str(body.note),
  });
  return { ok: true, status: "pending_review", model_id: modelId, review };
}

function buildModelMediaStorageKey(body, modelId, assetId) {
  const mediaType = normalizeSchemaPatchWord(body.media_type);
  const ext = safeModelMediaExtension(body.file_name, body.content_type);
  return `models/${safeSchemaPatchPathSegment(modelId)}/${mediaType}/${assetId}${ext}`;
}

function safeModelMediaExtension(fileName, contentType) {
  const rawName = str(fileName).toLowerCase();
  const byName = rawName.match(/\.(jpg|jpeg|png|webp|mp4|mov)$/)?.[0] || "";
  if (byName === ".jpeg") return ".jpg";
  if (byName) return byName;
  const type = str(contentType).toLowerCase();
  if (type.includes("jpeg")) return ".jpg";
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("quicktime")) return ".mov";
  if (type.includes("mp4")) return ".mp4";
  return "";
}

async function handleModelMediaUploadInit(env, body) {
  const tables = modelSchemaPatchV1Tables(env);
  const modelId = resolveSchemaPatchModelId(body);
  const assetId = `media_${crypto.randomUUID()}`;
  const mediaType = normalizeSchemaPatchWord(body.media_type);
  const storageKey = buildModelMediaStorageKey(body, modelId, assetId);
  const fields = tables.mediaAssets.fields;
  const rec = await modelSchemaPatchCreate(env, tables.mediaAssets, {
    [fields.mediaId]: assetId,
    [fields.model]: modelSchemaLinkedRecord(modelId),
    [fields.mediaType]: mediaType,
    [fields.mediaVisibility]: isPublicCandidateMedia(mediaType) ? "public_candidate" : "private_candidate",
    [fields.assetRole]: mediaType,
    [fields.slotNumber]: body.slot_number,
    [fields.reviewStatus]: "pending_upload",
    [fields.publicSafe]: false,
    [fields.privateSafe]: false,
    [fields.flashSafe]: false,
    [fields.fileName]: safeSchemaPatchFilename(body.file_name || assetId),
    [fields.fileType]: str(body.content_type || ""),
    [fields.fileSizeBytes]: body.file_size_bytes,
    [fields.r2Bucket]: str(env.MODEL_ASSETS_BUCKET_NAME || "MMD_MODEL_ASSETS"),
    [fields.privateOriginalKey]: storageKey,
    [fields.uploadedAt]: new Date().toISOString(),
  });
  return {
    ok: true,
    asset_id: assetId,
    record_id: rec.id,
    media_type: mediaType,
    storage_key: storageKey,
    upload: {
      mode: "worker_controlled",
      complete_endpoint: MODEL_SCHEMA_PATCH_V1_ROUTES.mediaUploadComplete,
      body_parameter: "file",
    },
  };
}

async function handleModelMediaUploadComplete(env, body) {
  const tables = modelSchemaPatchV1Tables(env);
  const modelId = resolveSchemaPatchModelId(body);
  const assetId = str(body.asset_id) || `media_${crypto.randomUUID()}`;
  const mediaType = normalizeSchemaPatchWord(body.media_type);
  const fields = tables.mediaAssets.fields;
  const existing = await modelSchemaPatchFindOneByField(env, tables.mediaAssets, fields.mediaId, assetId);
  const storageKey = str(body.storage_key) || buildModelMediaStorageKey(body, modelId, assetId);
  const patch = {
    [fields.mediaId]: assetId,
    [fields.model]: modelSchemaLinkedRecord(modelId),
    [fields.mediaType]: mediaType,
    [fields.mediaVisibility]: isPublicCandidateMedia(mediaType) ? "public_candidate" : "private_candidate",
    [fields.assetRole]: mediaType,
    [fields.slotNumber]: body.slot_number,
    [fields.privateOriginalKey]: storageKey,
    [fields.fileName]: safeSchemaPatchFilename(body.file_name || assetId),
    [fields.fileType]: str(body.content_type || ""),
    [fields.fileSizeBytes]: body.file_size_bytes,
    [fields.r2Bucket]: str(env.MODEL_ASSETS_BUCKET_NAME || "MMD_MODEL_ASSETS"),
    [fields.reviewStatus]: "pending_review",
    [fields.flashSafe]: Boolean(body.flash_safe === true),
    [fields.uploadedAt]: new Date().toISOString(),
  };
  const rec = existing
    ? await modelSchemaPatchPatch(env, tables.mediaAssets, existing.id, patch)
    : await modelSchemaPatchCreate(env, tables.mediaAssets, patch);
  return { ok: true, status: "pending_review", asset_id: assetId, record_id: rec.id, media_type: mediaType };
}

async function handleModelMediaReviewRequest(env, body, context) {
  const modelId = resolveSchemaPatchModelId(body);
  const mediaType = normalizeSchemaPatchWord(body.media_type);
  const assetIds = Array.isArray(body.asset_ids) ? body.asset_ids.map(str).filter(Boolean) : [];
  const review = await createModelReviewRequest(env, {
    modelId,
    requestType: "media",
    requestedBy: context.actor,
    linkedMediaAssetId: assetIds[0],
    payload: {
      media_type: mediaType,
      asset_ids: assetIds,
      requires_approved_media_before_customer_display: true,
      source: "model_console_v16",
    },
    note: str(body.note),
  });
  return { ok: true, status: "pending_review", model_id: modelId, media_type: mediaType || null, review };
}

async function handleModelPrivateGalleryRequest(env, body, context) {
  const tables = modelSchemaPatchV1Tables(env);
  const modelId = resolveSchemaPatchModelId(body);
  await modelSchemaPatchPatch(env, tables.models, modelId, {
    [tables.models.fields.privateGalleryStatus]: "pending_review",
  });
  const review = await createModelReviewRequest(env, {
    modelId,
    requestType: "private_gallery",
    requestedBy: context.actor,
    payload: { requested_status: "live", source: "model_console_v16" },
    note: str(body.note),
  });
  return { ok: true, status: "pending_review", model_id: modelId, review };
}

async function handleModelPrivateFlashRequest(env, body, context) {
  const tables = modelSchemaPatchV1Tables(env);
  const modelId = resolveSchemaPatchModelId(body);
  await modelSchemaPatchPatch(env, tables.models, modelId, {
    [tables.models.fields.privateFlashStatus]: "pending_review",
  });
  const review = await createModelReviewRequest(env, {
    modelId,
    requestType: "private_flash",
    requestedBy: context.actor,
    requestedFlashSalesUse: true,
    payload: {
      requested_status: "live",
      sales_authorized_not_tier_owned: true,
      source: "model_console_v16",
    },
    note: str(body.note),
  });
  return { ok: true, status: "pending_review", model_id: modelId, review };
}

async function handleModelPrivateFlashAuthorize(env, body, context) {
  const tables = modelSchemaPatchV1Tables(env);
  const modelId = resolveSchemaPatchModelId(body);
  const clientId = str(body.client_id || body.client_record_id);
  const basis = await assertFlashAuthorizationBasis(env, body, tables);
  const rawT = base64UrlEncodeString(`${crypto.randomUUID()}:${Date.now()}`);
  const tokenHash = await sha256Hex(rawT);
  const grantId = `flash_grant_${crypto.randomUUID()}`;
  const expiresAt = str(body.expires_at) || addMinutesIso(clampInt(body.expires_in_minutes, 1, 240, 30));
  const fields = tables.flashGrants.fields;
  const viewLimit = clampInt(body.view_limit, 1, 20, 3);
  const durationSec = clampInt(body.duration_sec || body.expires_in_minutes * 60, 30, 14400, 1800);
  const rec = await modelSchemaPatchCreate(env, tables.flashGrants, {
    [fields.grantId]: grantId,
    [fields.client]: modelSchemaLinkedRecord(clientId),
    [fields.model]: modelSchemaLinkedRecord(modelId),
    [fields.session]: modelSchemaLinkedRecord(body.session_id || body.session_record_id),
    [fields.payment]: modelSchemaLinkedRecord(body.payment_record_id),
    [fields.mediaAsset]: modelSchemaLinkedRecord(body.media_asset_id || body.media_record_id),
    [fields.grantStatus]: "active",
    [fields.requiredGate]: basis,
    [fields.depositVerified]: basis === "verified_deposit",
    [fields.officialVerificationRef]: str(body.official_verification_ref || body.payment_ref || body.payment_record_id),
    [fields.durationSec]: durationSec,
    [fields.viewLimit]: viewLimit,
    [fields.viewCount]: 0,
    [fields.previewTokenHash]: tokenHash,
    [fields.signedUrlStatus]: "not_issued",
    [fields.expiresAt]: expiresAt,
    [fields.watermarkCode]: str(body.watermark_code || grantId.slice(-8)),
    [fields.authorizedBy]: context.actor,
    [fields.authorizedAt]: new Date().toISOString(),
    [fields.grantNote]: str(body.note),
    [fields.payloadJson]: JSON.stringify({
      authorization_basis: basis,
      payment_ref: str(body.payment_ref),
      token_storage: "sha256_hash_only",
    }),
  });
  return {
    ok: true,
    status: "active",
    grant_id: grantId,
    record_id: rec.id,
    model_id: modelId,
    client_id: clientId,
    expires_at: expiresAt,
    view_limit: viewLimit,
    authorization_basis: basis,
    t: rawT,
    token_storage: "sha256_hash_only",
  };
}

async function assertFlashAuthorizationBasis(env, body, tables) {
  if (body.manual_unlock === true) return "manual_admin_unlock";
  const paymentRecordId = str(body.payment_record_id);
  const paymentRef = str(body.payment_ref);
  let payment = null;
  if (paymentRecordId) {
    payment = await modelSchemaPatchGetById(env, tables.payments, paymentRecordId);
  } else if (paymentRef) {
    payment = await modelSchemaPatchFindOneByField(env, tables.payments, tables.payments.fields.paymentRef, paymentRef);
  }
  if (!payment || !isVerifiedDepositRecord(payment, tables)) {
    throw schemaPatchError("verified_deposit_required", 423, "Flash preview requires verified deposit or manual admin unlock.");
  }
  return "verified_deposit";
}

export function isVerifiedDepositRecord(record, tables) {
  const fields = record?.fields || {};
  const verificationStatus = normalizeSchemaPatchWord(fields[tables.payments.fields.verificationStatus]);
  const officialVerifiedAt = str(fields[tables.payments.fields.officialVerifiedAt]);
  const officialVerificationRef = str(fields[tables.payments.fields.officialVerificationRef]);
  const officialVerifiedBy = str(fields[tables.payments.fields.officialVerifiedBy]);
  const officialMatchReason = str(fields[tables.payments.fields.officialMatchReason]);
  if (officialVerifiedAt) return true;
  return verificationStatus === "official_verified" &&
    Boolean(officialVerificationRef && (officialVerifiedBy || officialMatchReason));
}

function isPublicCandidateMedia(mediaType) {
  return mediaType === "public_gallery" || mediaType === "profile_photo" || mediaType === "intro_video";
}

function addMinutesIso(minutes) {
  const date = new Date();
  date.setUTCMinutes(date.getUTCMinutes() + Math.max(1, Number(minutes) || 30));
  return date.toISOString();
}

function base64UrlEncodeString(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeSchemaPatchWord(value) {
  return str(value).toLowerCase().replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
}

function readObject(value) {
  return isPlainObject(value) ? value : {};
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function escapeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function safeSchemaPatchPathSegment(value) {
  return str(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "model";
}

function safeSchemaPatchFilename(value) {
  return str(value).replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 160) || "asset";
}

function normalizeLooseToken(value) {
  return str(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, "");
}

function slugToken(value, fallback = "model") {
  const slug = str(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function normalizeModelPathPart(value) {
  return str(value)
    .replace(/>/g, "/")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

function normalizeR2Prefix(value) {
  const raw = normalizeModelPathPart(value);
  if (!raw) return "";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function normalizeCategoryPath(value) {
  return normalizeModelPathPart(value).replace(/\s*\/\s*/g, "/");
}

function slugPathPart(value) {
  return str(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitConfiguredPaths(value) {
  return str(value)
    .split(",")
    .map((item) => normalizeCategoryPath(item))
    .filter(Boolean);
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = str(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function joinR2Path(...parts) {
  return normalizeR2Prefix(
    parts
      .map((part) => normalizeModelPathPart(part))
      .filter(Boolean)
      .join("/")
  );
}

function getModelSourceOwner(env, sourceOwner = "") {
  return str(sourceOwner || env.MODEL_SOURCE_OWNER_DEFAULT || DEFAULT_MODEL_SOURCE_OWNER) || DEFAULT_MODEL_SOURCE_OWNER;
}

function getModelR2RootPrefix(env) {
  return normalizeCategoryPath(env.MODEL_R2_ROOT_PREFIX || env.MODEL_R2_SOURCE_ROOT || "");
}

function getModelR2CategoryPaths(env, categoryPath = "") {
  const explicit = normalizeCategoryPath(categoryPath);
  if (explicit) return expandR2CategoryPathVariants(explicit);
  return uniqueStrings([
    ...splitConfiguredPaths(env.MODEL_R2_CATEGORY_PATHS),
    ...DEFAULT_MODEL_R2_CATEGORY_PATHS,
  ].flatMap((path) => expandR2CategoryPathVariants(path)));
}

function sourceLookupEnabled(env) {
  return str(env.MODEL_R2_LOOKUP_ENABLED || "true").toLowerCase() !== "false";
}

function useSourceOwnerAsR2Prefix(env) {
  return str(env.MODEL_R2_USE_SOURCE_OWNER_AS_PREFIX || "false").toLowerCase() === "true";
}

function isOrientationPathPart(value) {
  return ["straight", "gay", "both"].includes(normalizeLooseToken(value));
}

function addMmdCategoryPrefix(value) {
  const parts = normalizeCategoryPath(value).split("/").filter(Boolean);
  return parts
    .map((part) => {
      const token = normalizeLooseToken(part);
      if (token === "publicmodels") return "MMD Public Models";
      if (token === "extrememodels") return "MMD Extreme Models";
      if (token === "travelmodels") return "MMD Travel Models";
      if (token === "travelcompcard") return "MMD Travel Compcard";
      if (token === "privatemodels") return "MMD Private Models";
      if (token === "exclusive" || token === "mmdexclusive") return "MMD Exclusive";
      return part;
    })
    .join("/");
}

function removeMmdCategoryPrefix(value) {
  return normalizeCategoryPath(value)
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/^MMD\s+/i, ""))
    .join("/");
}

function expandR2CategoryPathVariants(value) {
  const normalized = normalizeCategoryPath(value);
  if (!normalized) return [];
  const parts = normalized.split("/").filter(Boolean);
  const withoutOrientation = parts.length > 1 && isOrientationPathPart(parts[parts.length - 1])
    ? parts.slice(0, -1).join("/")
    : "";
  const candidates = [normalized, withoutOrientation].filter(Boolean);
  return uniqueStrings(
    candidates.flatMap((candidate) => [
      candidate,
      addMmdCategoryPrefix(candidate),
      removeMmdCategoryPrefix(candidate),
    ]),
  );
}

function displayCategoryPath(value) {
  return normalizeCategoryPath(value).split("/").filter(Boolean).join(" > ");
}

function redactedPrefix(prefix) {
  const clean = normalizeR2Prefix(prefix);
  const parts = clean.split("/").filter(Boolean);
  if (parts.length <= 2) return clean;
  return `${parts.slice(0, 3).join("/")}/.../`;
}

async function listR2ObjectCount(env, folderPrefix, limit = 1000) {
  const bucket = env.MMD_MODEL_ASSETS;
  const prefix = normalizeR2Prefix(folderPrefix);
  if (!bucket || !prefix || typeof bucket.list !== "function") return { object_count: null, exists: false };
  const listing = await bucket.list({ prefix, limit });
  const objects = Array.isArray(listing?.objects) ? listing.objects : [];
  return { object_count: objects.length, exists: objects.length > 0 };
}

function buildR2ExactPrefixCandidates({ q, sourceOwner, categoryPath, env }) {
  const query = str(q);
  const querySlug = slugPathPart(query);
  const rootPrefix = getModelR2RootPrefix(env);
  const owner = getModelSourceOwner(env, sourceOwner);
  const includeOwnerPrefix = useSourceOwnerAsR2Prefix(env);
  const categories = getModelR2CategoryPaths(env, categoryPath);
  const names = uniqueStrings([query, querySlug, slugToken(query), normalizeLooseToken(query)]).filter(Boolean);
  const prefixes = [];

  for (const category of categories) {
    const categorySlug = category.split("/").map(slugPathPart).filter(Boolean).join("/");
    for (const name of names) {
      prefixes.push(joinR2Path(rootPrefix, category, name));
      prefixes.push(joinR2Path(rootPrefix, categorySlug, name));
      prefixes.push(joinR2Path(category, name));
      prefixes.push(joinR2Path(categorySlug, name));
      if (includeOwnerPrefix) {
        prefixes.push(joinR2Path(rootPrefix, owner, category, name));
        prefixes.push(joinR2Path(rootPrefix, owner, categorySlug, name));
        prefixes.push(joinR2Path(owner, category, name));
        prefixes.push(joinR2Path(owner, categorySlug, name));
      }
    }
  }

  for (const name of names) {
    prefixes.push(joinR2Path(rootPrefix, name));
    if (includeOwnerPrefix) {
      prefixes.push(joinR2Path(rootPrefix, owner, name));
      prefixes.push(joinR2Path(owner, name));
    }
  }

  return uniqueStrings(prefixes);
}

function inferCategoryFromPrefix(prefix, sourceOwner = "") {
  const owner = normalizeLooseToken(sourceOwner || DEFAULT_MODEL_SOURCE_OWNER);
  const parts = normalizeModelPathPart(prefix).split("/").filter(Boolean);
  const filtered = parts.filter((part) => normalizeLooseToken(part) !== owner);
  if (filtered.length <= 1) return "";
  return filtered.slice(0, -1).join("/");
}

function segmentAfterBase(key, basePrefix) {
  const cleanBase = normalizeR2Prefix(basePrefix);
  const cleanKey = str(key);
  if (!cleanBase || !cleanKey.startsWith(cleanBase)) return "";
  return cleanKey.slice(cleanBase.length).split("/").filter(Boolean)[0] || "";
}

async function searchR2ByConfiguredCategories(env, { q, sourceOwner, categoryPath }) {
  const bucket = env.MMD_MODEL_ASSETS;
  if (!bucket || typeof bucket.list !== "function") return null;
  const queryToken = normalizeLooseToken(q);
  if (!queryToken) return null;

  const rootPrefix = getModelR2RootPrefix(env);
  const owner = getModelSourceOwner(env, sourceOwner);
  const includeOwnerPrefix = useSourceOwnerAsR2Prefix(env);
  const categories = getModelR2CategoryPaths(env, categoryPath);
  const bases = [];
  for (const category of categories) {
    const categorySlug = category.split("/").map(slugPathPart).filter(Boolean).join("/");
    bases.push(joinR2Path(rootPrefix, category));
    bases.push(joinR2Path(rootPrefix, categorySlug));
    bases.push(joinR2Path(category));
    bases.push(joinR2Path(categorySlug));
    if (includeOwnerPrefix) {
      bases.push(joinR2Path(rootPrefix, owner, category));
      bases.push(joinR2Path(rootPrefix, owner, categorySlug));
      bases.push(joinR2Path(owner, category));
      bases.push(joinR2Path(owner, categorySlug));
    }
  }

  for (const basePrefix of uniqueStrings(bases)) {
    const listing = await bucket.list({ prefix: basePrefix, limit: 1000 });
    const objects = Array.isArray(listing?.objects) ? listing.objects : [];
    const folderCounts = new Map();
    for (const object of objects) {
      const segment = segmentAfterBase(object?.key, basePrefix);
      if (!segment) continue;
      folderCounts.set(segment, (folderCounts.get(segment) || 0) + 1);
    }

    for (const [folderName, objectCount] of folderCounts.entries()) {
      const folderToken = normalizeLooseToken(folderName);
      if (folderToken === queryToken || folderToken.includes(queryToken) || queryToken.includes(folderToken)) {
        const matchedPrefix = joinR2Path(basePrefix, folderName);
        return {
          matched_name: folderName,
          matched_prefix: matchedPrefix,
          category_path: inferCategoryFromPrefix(matchedPrefix, owner),
          object_count: objectCount,
        };
      }
    }
  }

  return null;
}

function inferModelFieldsFromSource({ modelName, sourceOwner, categoryPath, matchedPrefix }) {
  const cleanName = str(modelName);
  const category = normalizeCategoryPath(categoryPath || inferCategoryFromPrefix(matchedPrefix, sourceOwner));
  const categoryToken = normalizeLooseToken(category);
  const fields = {
    working_name: cleanName,
    nickname: cleanName,
    unique_key: slugToken(cleanName, "model"),
    storage_source_primary: "R2",
    r2_prefix: normalizeR2Prefix(matchedPrefix),
    source_folder: sourceOwner || category,
    source_owner: sourceOwner,
    requires_per_approval: true,
    private_review_status: "Needs Review",
    notes: `source: R2/${sourceOwner || DEFAULT_MODEL_SOURCE_OWNER} | category path: ${category || "unclassified"} | imported as pre-canonical draft`,
  };
  if (categoryToken.includes("public")) fields.sales_layer = "Public Models";
  if (categoryToken.includes("private")) fields.sales_layer = "Private Models";
  if (categoryToken.includes("exclusive")) fields.private_tier = "Black Card Review";
  if (categoryToken.includes("extreme")) fields.private_tier = "Extreme Models";
  if (categoryToken.includes("premium")) fields.private_tier = "Premium Review";
  if (categoryToken.includes("standard")) fields.private_tier = "Standard Review";
  if (categoryToken.includes("travel")) fields.service_layer = "Travel";
  if (categoryToken.includes("straight")) fields.orientation_label = "Straight";
  if (categoryToken.includes("gay")) fields.orientation_label = "Gay";
  if (categoryToken.includes("both")) fields.orientation_label = "Both";
  return compactObject(fields);
}

async function searchR2ModelSource(env, { q, sourceOwner, categoryPath }) {
  if (!sourceLookupEnabled(env)) return null;
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.list !== "function") return null;

  const owner = getModelSourceOwner(env, sourceOwner);
  const exactCandidates = buildR2ExactPrefixCandidates({ q, sourceOwner: owner, categoryPath, env });
  for (const prefix of exactCandidates) {
    const count = await listR2ObjectCount(env, prefix, 200);
    if (count.exists) {
      return {
        matched_name: str(q),
        matched_prefix: normalizeR2Prefix(prefix),
        category_path: normalizeCategoryPath(categoryPath || inferCategoryFromPrefix(prefix, owner)),
        object_count: count.object_count,
      };
    }
  }
  return searchR2ByConfiguredCategories(env, { q, sourceOwner: owner, categoryPath });
}

async function resolveModelSource(env, { q, sourceOwner = "", categoryPath = "" } = {}) {
  const query = str(q);
  if (!query) throw new Error("missing_q");
  const owner = getModelSourceOwner(env, sourceOwner);
  const airtableItems = await airtableList(env, env.AIRTABLE_TABLE_MODELS || "models", {
    q: query,
    limit: 12,
    matchFields: getModelSearchFields(env),
    fallbackMatchFields: MODEL_SAFE_SEARCH_FIELDS,
  });

  if (airtableItems.length) {
    const fields = airtableItems[0]?.fields || {};
    return {
      ok: true,
      found: true,
      source: "airtable",
      query,
      source_owner: owner,
      matched_name: str(fields.working_name || fields["Working Name"] || fields.model_name || fields["Model Name"] || fields.name || fields.nickname || query),
      matched_prefix: "",
      matched_prefix_redacted: "",
      category_path: "",
      object_count: null,
      airtable_items_count: airtableItems.length,
      suggested_model_fields: {},
    };
  }

  const r2Match = await searchR2ModelSource(env, { q: query, sourceOwner: owner, categoryPath });
  if (r2Match?.matched_prefix) {
    return {
      ok: true,
      found: true,
      source: "r2",
      query,
      source_owner: owner,
      matched_name: r2Match.matched_name || query,
      matched_prefix: r2Match.matched_prefix,
      matched_prefix_redacted: redactedPrefix(r2Match.matched_prefix),
      category_path: displayCategoryPath(r2Match.category_path || categoryPath),
      object_count: r2Match.object_count,
      airtable_items_count: 0,
      suggested_model_fields: inferModelFieldsFromSource({
        modelName: r2Match.matched_name || query,
        sourceOwner: owner,
        categoryPath: r2Match.category_path || categoryPath,
        matchedPrefix: r2Match.matched_prefix,
      }),
    };
  }

  return {
    ok: true,
    found: false,
    source: "none",
    query,
    source_owner: owner,
    matched_name: "",
    matched_prefix: "",
    matched_prefix_redacted: "",
    category_path: displayCategoryPath(categoryPath),
    object_count: 0,
    airtable_items_count: 0,
    suggested_model_fields: {},
  };
}

async function stageModelFromSource(env, body = {}) {
  const modelName = str(body.model_name || body.name || body.q);
  const sourceOwner = getModelSourceOwner(env, body.source_owner);
  const categoryPath = normalizeCategoryPath(body.category_path);
  const r2Prefix = normalizeR2Prefix(body.r2_prefix);
  if (!modelName) throw new Error("missing_model_name");

  const resolved = r2Prefix
    ? {
        ok: true,
        found: (await listR2ObjectCount(env, r2Prefix, 200)).exists,
        source: "r2",
        query: modelName,
        source_owner: sourceOwner,
        matched_name: modelName,
        matched_prefix: r2Prefix,
        category_path: categoryPath || inferCategoryFromPrefix(r2Prefix, sourceOwner),
      }
    : await resolveModelSource(env, { q: modelName, sourceOwner, categoryPath });

  if (resolved.source === "airtable") return { ok: true, staged: false, reason: "already_exists_in_airtable", resolved };
  if (resolved.source !== "r2" || !resolved.found) return { ok: false, staged: false, reason: "r2_source_not_found", resolved };

  const fields = inferModelFieldsFromSource({
    modelName,
    sourceOwner,
    categoryPath: resolved.category_path || categoryPath,
    matchedPrefix: resolved.matched_prefix,
  });
  const out = await airtableUpsertModel(env, env.AIRTABLE_TABLE_MODELS || "models", {
    unique_key: fields.unique_key,
    fields,
  });
  return {
    ok: Boolean(out?.ok),
    staged: Boolean(out?.ok),
    model: out,
    resolved: { ...resolved, matched_prefix_redacted: redactedPrefix(resolved.matched_prefix) },
  };
}

function summarizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => str(item)).filter(Boolean).join(", ");
  }
  if (value && typeof value === "object") {
    return Object.values(value).map((item) => str(item)).filter(Boolean).join(", ");
  }
  return str(value);
}

function buildSigilAdminNote({
  memberName,
  telegramUsername,
  telegramId,
  requestedService,
  budgetText,
  scheduleText,
  preferencesSummary,
  journeyStage,
  note,
}) {
  const lines = ["SIGIL private handoff"];
  if (memberName) lines.push(`Name: ${memberName}`);
  if (telegramUsername) lines.push(`Telegram: @${telegramUsername}`);
  else if (telegramId) lines.push(`Telegram ID: ${telegramId}`);
  if (requestedService) lines.push(`Service: ${requestedService}`);
  if (budgetText) lines.push(`Budget: ${budgetText}`);
  if (scheduleText) lines.push(`When: ${scheduleText}`);
  if (preferencesSummary) lines.push(`Preferences: ${preferencesSummary}`);
  if (journeyStage) lines.push(`Stage: ${journeyStage}`);
  if (note) lines.push(`Note: ${note}`);
  return lines.join(" | ");
}

/* =========================
   SIGIL Board Publisher
========================= */
async function publishSigilBoardQueue(env) {
  if (!env.SIGIL_BOARD_KV || typeof env.SIGIL_BOARD_KV.put !== "function") {
    return { ok: false, error: "missing_sigil_board_kv" };
  }

  const records = await collectSigilBoardSourceRecords(env);
  const cards = records.map((record, index) => sanitizeSigilBoardCard(record, index)).filter(Boolean);
  const jsonCards = JSON.stringify(cards);
  const publishedAt = new Date().toISOString();

  await env.SIGIL_BOARD_KV.put(SIGIL_BOARD_CARDS_KV_KEY, jsonCards);
  await env.SIGIL_BOARD_KV.put(SIGIL_BOARD_META_KV_KEY, JSON.stringify({
    ok: true,
    source: "admin-worker",
    mode: "internal_publish",
    published: cards.length,
    published_at: publishedAt,
  }));

  return {
    ok: true,
    published: cards.length,
    key: SIGIL_BOARD_CARDS_KV_KEY,
    source: "admin-worker",
    mode: "internal_publish",
  };
}

async function collectSigilBoardSourceRecords(env) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return [];

  const sources = [
    { source: "console_inbox", table: env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e" },
    { source: "payment_proofs", table: env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi" },
    { source: "sessions", table: env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX" },
    { source: "payments", table: env.AIRTABLE_TABLE_PAYMENTS || "payments" },
    { source: "member_packages", table: env.AIRTABLE_TABLE_MEMBER_PACKAGES || env.AIRTABLE_TABLE_MEMBERS || "members" },
  ];

  const out = [];
  for (const source of sources) {
    const records = await airtableList(env, source.table, { limit: 25 });
    for (const record of records) out.push({ ...record, source: source.source });
  }
  return out;
}

function sanitizeSigilBoardCard(record, index) {
  if (!record || typeof record !== "object") return null;
  const fields = record.fields && typeof record.fields === "object" ? record.fields : record;
  const source = str(record.source || fields.source || "");
  const lane = sigilBoardLane(fields, source);
  const status = sigilBoardStatus(fields, lane);
  const priority = sigilBoardPriority(fields, lane, status);
  const risk = sigilBoardRisk(fields, lane);
  const owner = sigilBoardOwner(fields, lane, risk);
  const needsPerDecision = sigilBoardNeedsPerDecision(fields, lane, risk, owner);

  return {
    id: sigilBoardCardId(record, fields, source, index),
    title: sigilBoardTitle(lane, sigilBoardFirstField(fields, ["title", "Title", "subject", "Subject", "inbox_id", "payment_ref", "session_id"])),
    lane,
    status,
    priority,
    risk,
    next_action: sigilBoardNextAction(lane),
    owner,
    needs_per_decision: needsPerDecision,
    summary: sigilBoardSummary(lane),
  };
}

function sigilBoardLane(fields, source) {
  const text = sigilBoardSourceText(fields, source);
  if (source === "payment_proofs" || source === "payments" || /payment|slip|proof|transfer/.test(text)) return "Payment";
  if (/black\s*card/.test(text)) return "Private Review";
  if (/vip|svip|private exception|private review|refund/.test(text)) return "Private Review";
  if (/complaint|privacy|mismatch|sensitive escalation|route\/auth|auth error|route error/.test(text)) return "Risk";
  if (/booking|session|location|schedule/.test(text)) return "Booking";
  if (/partner/.test(text)) return "Partner";
  if (/model/.test(text)) return "Model";
  if (/member|identity|package|renewal/.test(text)) return "Member";
  if (/missing|incomplete|need info|reference/.test(text)) return "Need Info";
  return source === "console_inbox" ? "Need Info" : "Risk";
}

function sigilBoardStatus(fields, lane) {
  const status = str(sigilBoardFirstField(fields, ["status", "Status", "state", "State", "verification_status", "Verification Status"]));
  if (/need[_\s-]?info/i.test(status)) return "Need Info";
  if (/pending|review|uploaded|new/i.test(status)) return lane === "Payment" ? "Pending Review" : "Ready for Per";
  if (lane === "Payment" || lane === "Need Info") return "Need Info";
  if (lane === "Private Review" || lane === "Black Card" || lane === "Risk") return "Ready for Per";
  return "Read Only";
}

function sigilBoardPriority(fields, lane, status) {
  const text = `${sigilBoardSourceText(fields)} ${lane} ${status}`;
  if (/critical|mismatch|privacy|complaint|auth error|route error|sensitive escalation/.test(text) || lane === "Risk") return "Critical";
  if (/payment|refund|vip|svip|black card|manual review|private review/.test(text) || lane === "Payment" || lane === "Black Card") return "High";
  if (/missing|incomplete|need info|booking|partner|model|member/.test(text)) return "Medium";
  return "Low";
}

function sigilBoardRisk(fields, lane) {
  const text = sigilBoardSourceText(fields);
  if (lane === "Payment") return "Slip evidence only";
  if (lane === "Black Card") return "Ewvon private review only";
  if (/svip|vip|private review/.test(text) || lane === "Private Review") return "Per manual decision only";
  if (lane === "Risk") return "Safety review required";
  return "Read-only advisory";
}

function sigilBoardOwner(fields, lane, risk) {
  const owner = sigilBoardSafeText(sigilBoardFirstField(fields, ["owner", "Owner", "assignee", "Assignee"]), "", 24);
  if (["MMD", "Per", "Kenji", "Ewvon", "Yuki", "Admin"].includes(owner)) return owner;
  if (lane === "Black Card" || /ewvon/i.test(risk)) return "Ewvon";
  if (lane === "Private Review" || lane === "Risk" || /per/i.test(risk)) return "Per";
  if (lane === "Need Info") return "Kenji";
  return "MMD";
}

function sigilBoardNeedsPerDecision(fields, lane, risk, owner) {
  const explicit = sigilBoardFirstField(fields, ["needs_per_decision", "Needs Per Decision"]);
  if (explicit !== "") return truthy(explicit);
  const text = sigilBoardSourceText(fields);
  return owner === "Per" || owner === "Ewvon" || /mismatch|unknown payer|vip|svip|black card|refund|manual review|complaint|private exception/.test(text) || /per|ewvon/i.test(risk);
}

function sigilBoardTitle(lane, rawTitle = "") {
  const title = str(rawTitle);
  if (/^line_\[masked\]$/i.test(title) || /^line_\[masked\]\b/i.test(title)) return "line_[masked]";
  if (/^img[_-]/i.test(title)) return "Evidence review";
  if (/renewal/i.test(title)) return "Renewal review";
  if (sigilBoardHasBadText(title) || title.length > 90 || /[{}`]|\\n|\\r|payload|form|dump/i.test(title)) return "Board review item";
  if (lane === "Payment") return "Payment proof review";
  if (lane === "Black Card") return "Private review item";
  if (lane === "Private Review") return "Private review queue";
  if (lane === "Booking") return "Booking context request";
  if (lane === "Need Info") return "Missing info review";
  return title || "Operational board item";
}

function sigilBoardNextAction(lane) {
  if (lane === "Payment") return "ตรวจยอดจากระบบทางการก่อนตอบ";
  if (lane === "Black Card") return "ส่งเป็น private review ให้ Ewvon";
  if (lane === "Private Review" || lane === "Risk") return "สรุป advisory ให้ Per";
  if (lane === "Need Info" || lane === "Booking") return "ขอข้อมูลเพิ่มก่อนเดินเรื่อง";
  return "อ่านข้อมูลและจัดลำดับต่อ";
}

function sigilBoardSummary(lane) {
  if (lane === "Payment") return "รายการชำระเงินต้องตรวจสอบจากระบบทางการก่อนตอบ";
  if (lane === "Need Info") return "ต้องขอข้อมูลเพิ่มเติมก่อนเดินเรื่อง";
  if (lane === "Private Review") return "ต้องสรุปเข้าคิวพิจารณาแบบส่วนตัว";
  if (lane === "Black Card") return "ต้องตรวจสอบในชั้น private review เท่านั้น";
  return "รายการนี้เป็น read-only advisory สำหรับตรวจสอบต่อ";
}

function sigilBoardCardId(record, fields, source, index) {
  const fingerprint = [
    source,
    record.id || "",
    sigilBoardFirstField(fields, ["inbox_id", "payment_ref", "session_id", "title", "Title", "subject", "Subject"]),
    sigilBoardFirstField(fields, ["status", "Status", "state", "State"]),
    index,
  ].map((value) => str(value)).join("|");
  return `sigil_card_${shortHash(fingerprint)}`;
}

function sigilBoardSourceText(fields, source = "") {
  return [
    source,
    sigilBoardFirstField(fields, ["status", "Status", "state", "State", "intent", "Intent", "legacy_tags", "priority"]),
    sigilBoardFirstField(fields, ["admin_note", "note", "Note", "summary", "Summary", "payload_json", "error_message"]),
  ].map((value) => str(value)).join(" ").toLowerCase();
}

function sigilBoardFirstField(fields, names) {
  for (const name of names) {
    const value = fields?.[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function sigilBoardSafeText(value, fallback = "", maxLength = 180) {
  let out = Array.isArray(value) ? value.join(", ") : str(value);
  out = out.replace(/\s+/g, " ").trim() || fallback;
  out = out
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[masked]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[masked]")
    .replace(/\bU[a-f0-9]{20,}\b/gi, "[masked]")
    .replace(/\b\d{7,}:[A-Za-z0-9_-]{20,}\b/g, "[masked]")
    .replace(/https?:\/\/\S+/gi, "[masked]")
    .replace(/\b(token|secret|passphrase|api[_ -]?key|bank|slip[_ -]?url|payment[_ -]?ref[_ -]?raw|amount[_ -]?raw)\b/gi, "[redacted]");
  return out.slice(0, maxLength);
}

function sigilBoardHasBadText(value) {
  return /rec[A-Za-z0-9]{10,}|Canonical Client|LINE Official immigration identity|line_user_i|line_user_id|nickname:|emails:|email|phone|telegram:|@[A-Za-z0-9_]|proof_attached|requested_path|payment_method|bank|raw_payload|admin_note|token|secret|passphrase|api_key|SVIP|Black Card|VIP/.test(str(value));
}

function shortHash(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(36).slice(0, 10);
}

/* =========================
   Airtable
========================= */
async function airtableFetch(env, path, init) {
  const key = env.AIRTABLE_API_KEY;
  const base = env.AIRTABLE_BASE_ID;

  if (!key || !base) {
    return { ok: false, error: "missing_airtable_env" };
  }

  const url = `${AIRTABLE_API}/${base}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init?.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, data };
}

async function airtableList(env, tableName, { q = "", limit = 50, matchFields = [], fallbackMatchFields = [] } = {}) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return [];

  const params = new URLSearchParams();
  params.set("pageSize", String(limit));

  if (q && matchFields.length) {
    const safe = q.replace(/"/g, '\\"');
    const ors = matchFields.map((f) => `FIND("${safe}", {${f}})`).join(",");
    params.set("filterByFormula", `OR(${ors})`);
  }

  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}?${params.toString()}`);
  if (!r.ok && q && fallbackMatchFields.length) {
    return airtableListFieldByField(env, tableName, {
      q,
      limit,
      matchFields: Array.from(new Set([...matchFields, ...fallbackMatchFields])),
    });
  }
  if (!r.ok) return [];

  const records = r.data?.records || [];
  return records.map((rec) => ({
    id: rec.id,
    fields: rec.fields || {},
    createdTime: rec.createdTime,
  }));
}

async function airtableListFieldByField(env, tableName, { q = "", limit = 50, matchFields = [] } = {}) {
  const byId = new Map();

  for (const field of matchFields) {
    const records = await airtableList(env, tableName, {
      q,
      limit,
      matchFields: [field],
    });

    for (const record of records) {
      if (record?.id && !byId.has(record.id)) byId.set(record.id, record);
      if (byId.size >= limit) return Array.from(byId.values());
    }
  }

  return Array.from(byId.values());
}

async function airtableFindOne(env, tableName, filterByFormula) {
  const params = new URLSearchParams();
  params.set("pageSize", "1");
  params.set("filterByFormula", filterByFormula);

  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}?${params.toString()}`);
  if (!r.ok) return null;

  const rec = r.data?.records?.[0];
  if (!rec) return null;
  return { id: rec.id, fields: rec.fields || {} };
}

async function airtablePatchById(env, tableName, id, patch) {
  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: patch || {} }),
  });

  if (!r.ok) return { ok: false, error: "airtable_patch_failed", detail: r };
  return { ok: true, id: r.data?.id, fields: r.data?.fields || {} };
}

async function airtableUpdateByIdOrField(env, tableName, body, { idField, lookupField, patchField }) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return { ok: false, error: "missing_airtable_env" };
  }

  const patch = body?.[patchField] && typeof body[patchField] === "object" ? body[patchField] : {};
  let id = body?.[idField] || null;

  if (!id && body?.[lookupField]) {
    const safe = String(body[lookupField]).replace(/"/g, '\\"');
    const found = await airtableFindOne(env, tableName, `{${lookupField}}="${safe}"`);
    id = found?.id || null;
  }

  if (!id) return { ok: false, error: "missing_record_id" };
  return await airtablePatchById(env, tableName, id, patch);
}

async function airtableUpsertModel(env, tableName, body) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return { ok: false, error: "missing_airtable_env" };
  }

  const fields = body?.fields && typeof body.fields === "object" ? body.fields : {};
  const id = body?.id || null;

  if (id) {
    return await airtablePatchById(env, tableName, id, fields);
  }

  if (body?.unique_key) {
    const safe = String(body.unique_key).replace(/"/g, '\\"');
    const found = await airtableFindOne(env, tableName, `{unique_key}="${safe}"`);

    if (found?.id) {
      return await airtablePatchById(env, tableName, found.id, fields);
    }

    const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records: [{ fields: { ...fields, unique_key: body.unique_key } }],
      }),
    });

    if (!r.ok) return { ok: false, error: "airtable_create_failed", detail: r };
    const rec = r.data?.records?.[0];
    return { ok: true, id: rec?.id, fields: rec?.fields || {} };
  }

  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      records: [{ fields }],
    }),
  });

  if (!r.ok) return { ok: false, error: "airtable_create_failed", detail: r };
  const rec = r.data?.records?.[0];
  return { ok: true, id: rec?.id, fields: rec?.fields || {} };
}

async function airtableCreate({ baseId, tableId, apiKey, fields }) {
  const r = await fetch(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      records: [{ fields }],
      typecast: true,
    }),
  });

  const t = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(t));
  return t.records?.[0];
}

/* =========================
   Telegram internal
========================= */
async function telegramInternalSend(env, payload) {
  const url = env.TELEGRAM_INTERNAL_SEND_URL;
  const token = env.INTERNAL_TOKEN;

  if (!url || !token) {
    return { ok: false, error: "missing_telegram_internal_env" };
  }

  const body = {
    chat_id: payload.chat_id,
    message_thread_id: payload.message_thread_id,
    text: payload.text,
    parse_mode: payload.parse_mode || "HTML",
    disable_web_page_preview: payload.disable_web_page_preview ?? true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": token,
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, data };
}

async function notifySigilHandoff(env, data) {
  if (!env.TELEGRAM_INTERNAL_SEND_URL || !env.INTERNAL_TOKEN) {
    return { ok: false, error: "missing_telegram_internal_env" };
  }

  const threadId = env.TG_THREAD_CONFIRM || 61;
  const lines = [
    "🖤 <b>SIGIL HANDOFF</b>",
    `Handoff: <code>${escHtml(data.handoff_id || "-")}</code>`,
    `Inbox Record: <code>${escHtml(data.airtable_record_id || "-")}</code>`,
  ];

  if (data.member_name) lines.push(`Name: <b>${escHtml(data.member_name)}</b>`);
  if (data.telegram_username) lines.push(`Telegram: <b>@${escHtml(data.telegram_username)}</b>`);
  else if (data.telegram_id) lines.push(`Telegram ID: <code>${escHtml(data.telegram_id)}</code>`);
  if (data.requested_service) lines.push(`Service: <b>${escHtml(data.requested_service)}</b>`);
  if (data.budget_text) lines.push(`Budget: <b>${escHtml(data.budget_text)}</b>`);
  if (data.schedule_text) lines.push(`When: <b>${escHtml(data.schedule_text)}</b>`);
  if (data.preferences_summary) lines.push(`Preferences: <b>${escHtml(data.preferences_summary)}</b>`);
  if (data.journey_stage) lines.push(`Stage: <b>${escHtml(data.journey_stage)}</b>`);
  if (data.admin_note) {
    lines.push("");
    lines.push(`<i>${escHtml(data.admin_note)}</i>`);
  }

  return await telegramInternalSend(env, {
    chat_id: env.TELEGRAM_CHAT_ID || "-1003546439681",
    message_thread_id: threadId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

/* =========================
   Pricing review
========================= */
function pricingReviewTable(env) {
  return env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e";
}

function pricingTimeoutMinutes(env) {
  return clampInt(env.PRICING_TIMEOUT_MINUTES || 10, 1, 1440, 10);
}

function safeShort(value, max = 240) {
  const text = str(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `฿${Math.round(n).toLocaleString("en-US")}`;
}

function firstField(fields, names) {
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) return value.join(", ");
    if (value !== undefined && value !== null && str(value)) return value;
  }
  return "";
}

async function createPricingReview(env, body) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return { ok: false, error: "missing_airtable_env" };
  }

  const now = new Date().toISOString();
  const reviewId = str(body.pricing_review_id || `price_${crypto.randomUUID()}`);
  const lineUserId = str(body.line_user_id);
  const displayName = str(body.line_display_name || body.client_name);
  const messageText = str(body.message_text);
  const imageMessageId = str(body.image_message_id);
  const parsedRequest = body.parsed_request && typeof body.parsed_request === "object" ? body.parsed_request : {};
  const memberContext = await buildMemberContextForLineUser(env, lineUserId, displayName);
  const adContext = await resolveAdContextForLineUser(env, lineUserId, {
    message_text: messageText,
    ad_context_hint: body.ad_context_hint,
    recent_messages_context: body.recent_messages_context,
  });
  const context = await buildPricingContext(env, { lineUserId, displayName, memberContext, adContext });
  const brief = buildPricingBrief({
    reviewId,
    displayName,
    lineUserId,
    messageText,
    imageMessageId,
    parsedRequest,
    context,
    memberContext,
    adContext,
    timeoutMinutes: pricingTimeoutMinutes(env),
  });

  const rec = await airtableCreate({
    baseId: env.AIRTABLE_BASE_ID,
    tableId: pricingReviewTable(env),
    apiKey: env.AIRTABLE_API_KEY,
    fields: {
      inbox_id: reviewId,
      created_by: "admin-worker-pricing-review",
      source: str(body.source || "line_oa"),
      intent: "note_only",
      member_name: displayName,
      line_user_id: lineUserId,
      line_id: str(body.raw_event_ref || imageMessageId),
      legacy_tags: "line_webhook, intent:pricing_review, waiting_human",
      admin_note: brief.safeSummary,
      payload_json: JSON.stringify({
        pricing_review_id: reviewId,
        source: str(body.source || "line_oa"),
        status: "waiting_human",
        created_at: now,
        line_user_id: lineUserId,
        line_display_name: displayName,
        message_text: safeShort(messageText, 500),
        image_message_id: imageMessageId,
        image_present: Boolean(imageMessageId),
        parsed_request: parsedRequest,
        member_context: memberContext,
        ad_context: adContext,
        ad_context_unknown: Boolean(adContext.ad_context_unknown),
        needs_per_ad_match: Boolean(adContext.needs_per_ad_match),
        review_reason: str(body.review_reason || "inbound_pricing_from_ad_or_unknown_creative"),
        recommended_reply_strategy: str(body.recommended_reply_strategy || memberContext.recommended_reply_strategy || choosePricingReplyStrategy(adContext)),
        raw_event_ref: str(body.raw_event_ref),
        customer_context: context,
        timeout_minutes: pricingTimeoutMinutes(env),
        final_price_thb: null,
        provisional_range: null,
      }),
      status: "new",
    },
  });

  const telegram = await sendPricingReviewTelegram(env, brief.telegramText);
  return {
    ok: true,
    pricing_review_id: reviewId,
    record_id: rec?.id || "",
    status: "waiting_human",
    telegram_sent: Boolean(telegram.ok),
    telegram,
  };
}

async function buildPricingContext(env, input) {
  const lineUserId = str(input.lineUserId);
  const displayName = str(input.displayName);
  const query = lineUserId || displayName;
  const [clients, sessions, payments, jobs, payoutEvidence] = await Promise.all([
    query ? airtableList(env, env.AIRTABLE_TABLE_CLIENTS || "Clients", { q: query, limit: 5, matchFields: ["line_user_id", "line_display_name", "name", "nickname", "Client Name"] }) : [],
    query ? airtableList(env, env.AIRTABLE_TABLE_SESSIONS || "Sessions", { q: query, limit: 10, matchFields: ["line_user_id", "client_name", "Client", "memberstack_id", "model_name"] }) : [],
    query ? airtableList(env, env.AIRTABLE_TABLE_PAYMENTS || "Payments", { q: query, limit: 10, matchFields: ["line_user_id", "payer_name", "memberstack_id", "payment_ref"] }) : [],
    query ? airtableList(env, env.AIRTABLE_TABLE_JOBS || "Jobs", { q: query, limit: 10, matchFields: ["line_user_id", "client_name", "Client", "model_name"] }) : [],
    query ? airtableList(env, env.AIRTABLE_TABLE_PAYOUT_EVIDENCE || "Payout Evidence", { q: query, limit: 10, matchFields: ["client_name", "model_name", "line_user_id"] }) : [],
  ]);
  const amounts = collectSafeAmounts([...sessions, ...payments, ...jobs, ...payoutEvidence]);
  const riskFlag = [...clients, ...sessions, ...jobs].some((rec) => /risk|burn|complaint|issue|ระวัง/i.test(JSON.stringify(rec.fields || {})));
  return {
    client_records_found: clients.length,
    sessions_found: sessions.length,
    payments_found: payments.length,
    jobs_found: jobs.length,
    payout_evidence_found: payoutEvidence.length,
    member_context_summary: input.memberContext || null,
    ad_context_summary: input.adContext || null,
    completed_count_90d: sessions.length + jobs.length,
    customer_frequency: sessions.length + jobs.length >= 3 ? "repeat" : sessions.length + jobs.length ? "returning_or_prior" : "unknown",
    risk_issue: riskFlag ? "yes" : "unknown",
    last_paid_amounts: amounts.slice(0, 5),
    last_price_range: amounts.length ? { min: Math.min(...amounts), max: Math.max(...amounts) } : null,
    model_context: {
      detected_model: "",
      model_lane_type: "unknown",
      abilities: {
        mk_ability: "unknown",
        burn_ability: "unknown",
        drink_allowed: "unknown",
        kiss_allowed: "unknown",
        pn_ability: "unknown",
      },
    },
  };
}

async function buildMemberContextForLineUser(env, lineUserId, lineDisplayName) {
  const query = str(lineUserId || lineDisplayName);
  const [clients, members, inbox, sessions, jobs, payments, payoutEvidence] = await Promise.all([
    query ? airtableList(env, env.AIRTABLE_TABLE_CLIENTS || "Clients", { q: query, limit: 5, matchFields: ["line_user_id", "line_display_name", "name", "nickname", "Client Name"] }) : [],
    query ? airtableList(env, env.AIRTABLE_TABLE_MEMBERS || "Members", { q: query, limit: 5, matchFields: ["line_user_id", "line_id", "username", "mmd_client_name", "name", "nickname", "tags"] }) : [],
    query ? airtableList(env, pricingReviewTable(env), { q: query, limit: 10, matchFields: ["line_user_id", "member_name", "admin_note", "payload_json"] }) : [],
    query ? airtableList(env, env.AIRTABLE_TABLE_SESSIONS || "Sessions", { q: query, limit: 20, matchFields: ["line_user_id", "client_name", "Client", "memberstack_id", "model_name"] }) : [],
    query ? airtableList(env, env.AIRTABLE_TABLE_JOBS || "Jobs", { q: query, limit: 20, matchFields: ["line_user_id", "client_name", "Client", "model_name"] }) : [],
    query ? airtableList(env, env.AIRTABLE_TABLE_PAYMENTS || "Payments", { q: query, limit: 20, matchFields: ["line_user_id", "payer_name", "memberstack_id", "payment_ref"] }) : [],
    query ? airtableList(env, env.AIRTABLE_TABLE_PAYOUT_EVIDENCE || "Payout Evidence", { q: query, limit: 10, matchFields: ["client_name", "model_name", "line_user_id"] }) : [],
  ]);
  const tags = collectSafeTags([...clients, ...members, ...inbox]);
  const priorPrices = collectSafeAmounts([...sessions, ...jobs, ...payments, ...payoutEvidence]);
  const completedCount = sessions.length + jobs.length;
  const risk = [...clients, ...members, ...inbox, ...sessions, ...jobs].some((rec) => /risk|burn|complaint|issue|ระวัง/i.test(JSON.stringify(rec.fields || {})));
  const lastCatalogueRef = findFirstSafePayloadValue(inbox, ["catalogue_ref", "catalog_ref", "catalogue"]);
  const lastModelCardRef = findFirstSafePayloadValue(inbox, ["model_card_ref", "card_ref", "creative_code"]);
  return {
    member_found: members.length > 0,
    client_found: clients.length > 0,
    client_id: clients[0]?.id || "",
    member_id: members[0]?.id || "",
    display_name: str(lineDisplayName || firstField(clients[0]?.fields || {}, ["line_display_name", "name", "nickname", "Client Name"])),
    tags,
    membership_hint: tags.find((tag) => /mem|member|vip|svip|client/i.test(tag)) || "",
    line_notes_safe_summary: inbox.length ? `prior_inbox_records=${inbox.length}` : "none",
    last_catalogue_ref: lastCatalogueRef,
    last_model_card_ref: lastModelCardRef,
    prior_price_quotes: priorPrices.slice(0, 5),
    avg_spend: priorPrices.length ? Math.round(priorPrices.reduce((sum, value) => sum + value, 0) / priorPrices.length) : 0,
    completed_count_30d: completedCount,
    completed_count_90d: completedCount,
    last_purchase_date: findLatestSafeDate([...sessions, ...jobs, ...payments]),
    preferred_model_lane: findFirstSafePayloadValue(inbox, ["preferred_model_lane", "model_work_lane", "model_work_type"]) || "unknown",
    risk_flags: risk ? ["risk_or_issue_hint"] : [],
    recommended_reply_strategy: lastCatalogueRef ? "catalogue_ack" : lastModelCardRef ? "ad_context_ack" : "generic_pricing_ack",
  };
}

async function resolveAdContextForLineUser(env, lineUserId, recentMessagesContext = {}) {
  const fromCurrent = parseAdContextSignals(
    [
      recentMessagesContext.message_text,
      JSON.stringify(recentMessagesContext.ad_context_hint || {}),
      JSON.stringify(recentMessagesContext.recent_messages_context || {}),
    ].join(" "),
  );
  let inboxSignals = { ad_context_found: false, ad_context_unknown: true, model_candidates: [] };
  if (!fromCurrent.ad_context_found && lineUserId) {
    const inbox = await airtableList(env, pricingReviewTable(env), {
      q: lineUserId,
      limit: 10,
      matchFields: ["line_user_id", "admin_note", "payload_json"],
    });
    inboxSignals = parseAdContextSignals(inbox.map((rec) => JSON.stringify(rec.fields || {})).join(" "));
  }
  const selected = fromCurrent.ad_context_found ? fromCurrent : inboxSignals;
  return {
    line_user_id: str(lineUserId),
    ad_context_found: Boolean(selected.ad_context_found),
    ad_context_unknown: !selected.ad_context_found,
    creative_code: selected.creative_code || "",
    catalogue_ref: selected.catalogue_ref || "",
    card_set_id: selected.card_set_id || "",
    model_candidates: selected.model_candidates || [],
    confidence: selected.confidence || 0,
    source: selected.source || "unknown",
    needs_per_ad_match: !selected.ad_context_found,
  };
}

function parseAdContextSignals(text) {
  const source = str(text);
  const creative = source.match(/\b((?:GWs|EMs)[A-Za-z0-9_-]*)\b/i)?.[1] || "";
  const catalogue = source.match(/(?:catalogue|catalog|แคตตาล็อก|แคตาล็อก|แคต|catalogue_ref|catalog_ref)["':\s#-]+([A-Za-z0-9_-]{2,60})/i)?.[1] || "";
  const cardSet = source.match(/(?:card[_\s-]?set|ชุดการ์ด|card_set_id)["':\s#-]+([A-Za-z0-9_-]{2,60})/i)?.[1] || "";
  const utmContent = source.match(/utm_content=([^&\s"']+)/i)?.[1] || "";
  const creativeType = /^GWs/i.test(creative) ? "GWs" : /^EMs/i.test(creative) ? "EMs" : "unknown";
  const modelCandidates = Array.from(new Set([creative, utmContent].filter(Boolean)));
  return {
    ad_context_found: Boolean(creative || catalogue || cardSet || utmContent),
    ad_context_unknown: !creative && !catalogue && !cardSet && !utmContent,
    creative_code: creative || utmContent,
    creative_code_type: creativeType,
    catalogue_ref: catalogue,
    card_set_id: cardSet,
    model_candidates: modelCandidates,
    confidence: creative || catalogue ? 0.78 : cardSet || utmContent ? 0.55 : 0,
    source: creative || catalogue || cardSet || utmContent ? "line_payload_or_console_inbox" : "unknown",
  };
}

function choosePricingReplyStrategy(adContext = {}) {
  if (adContext.catalogue_ref) return "catalogue_ack";
  if (adContext.ad_context_found) return "ad_context_ack";
  return "generic_pricing_ack";
}

function collectSafeTags(records) {
  const tags = new Set();
  for (const rec of records) {
    const text = [rec.fields?.tags, rec.fields?.legacy_tags, rec.fields?.payload_json].filter(Boolean).join(" ");
    for (const match of text.matchAll(/[#-]?[A-Za-z0-9_]+/g)) {
      const tag = str(match[0]);
      if (/client|purchased|mem|vip|svip|potential|lite/i.test(tag)) tags.add(tag);
    }
  }
  return Array.from(tags).slice(0, 20);
}

function collectSafeAmounts(records) {
  const amounts = [];
  for (const rec of records) {
    const fields = rec.fields || {};
    const amount = Number(firstField(fields, ["amount_thb", "Amount THB", "amount", "Amount", "sale_price_thb", "Sale Price THB", "Budget", "budget"]) || 0);
    if (Number.isFinite(amount) && amount > 0) amounts.push(amount);
  }
  return amounts;
}

function findFirstSafePayloadValue(records, keys) {
  for (const rec of records) {
    const payload = parsePayloadJson(rec.fields?.payload_json);
    for (const key of keys) {
      if (str(payload[key])) return str(payload[key]);
      if (str(payload.ad_context?.[key])) return str(payload.ad_context[key]);
    }
  }
  return "";
}

function findLatestSafeDate(records) {
  const dates = [];
  for (const rec of records) {
    const fields = rec.fields || {};
    const value = firstField(fields, ["date", "Date", "job_date", "payment_date", "created_at", "Created At"]);
    const date = value ? new Date(value) : null;
    if (date && Number.isFinite(date.getTime())) dates.push(date.toISOString().slice(0, 10));
  }
  return dates.sort().pop() || "";
}

function buildPricingBrief({ reviewId, displayName, lineUserId, messageText, imageMessageId, parsedRequest, context, memberContext, adContext, timeoutMinutes }) {
  const lineRef = lineUserId ? `${lineUserId.slice(0, 4)}…${lineUserId.slice(-4)}` : "unknown";
  const amounts = Array.isArray(context.last_paid_amounts) && context.last_paid_amounts.length
    ? context.last_paid_amounts.map(money).filter(Boolean).join(" / ")
    : "unknown";
  const range = context.last_price_range ? `${money(context.last_price_range.min)}–${money(context.last_price_range.max)}` : "unknown";
  const request = [
    parsedRequest?.date ? `date ${parsedRequest.date}` : "",
    parsedRequest?.time ? `time ${parsedRequest.time}` : "",
    parsedRequest?.location ? `location ${parsedRequest.location}` : "",
    parsedRequest?.duration ? `duration ${parsedRequest.duration}` : "",
  ].filter(Boolean).join(" | ") || "not provided";
  const safeSummary = [
    "[Pricing Review]",
    `Customer: ${displayName || "unknown"}`,
    `Message: ${safeShort(messageText || (imageMessageId ? "[image only]" : ""), 160)}`,
    `Request: ${request}`,
    "Status: waiting_human",
  ].join("\n");
  const telegramText = [
    "💳 <b>Pricing Review: Ad/Member Context</b>",
    `Review: <code>${escHtml(reviewId)}</code>`,
    "",
    "<b>Customer</b>",
    `Customer: <b>${escHtml(displayName || "unknown")}</b>`,
    `LINE ref: <code>${escHtml(lineRef)}</code>`,
    `Tags/member hint: ${escHtml((memberContext?.tags || []).join(", ") || memberContext?.membership_hint || "unknown")}`,
    "",
    "<b>Message</b>",
    `Message: ${escHtml(safeShort(messageText || "-", 220))}`,
    "",
    "<b>Image/card</b>",
    `Image: <b>${imageMessageId ? "yes" : "no"}</b>`,
    `Image message id: <code>${escHtml(imageMessageId || "-")}</code>`,
    "",
    "<b>Ad context</b>",
    `- creative_code: ${escHtml(adContext?.creative_code || "unknown")}`,
    `- catalogue_ref: ${escHtml(adContext?.catalogue_ref || "unknown")}`,
    `- card_set: ${escHtml(adContext?.card_set_id || "unknown")}`,
    `- model_candidates: ${escHtml((adContext?.model_candidates || []).join(", ") || "unknown")}`,
    `- ad_context_unknown: ${adContext?.ad_context_unknown ? "true" : "false"}`,
    `- needs_per_ad_match: ${adContext?.needs_per_ad_match ? "true" : "false"}`,
    "",
    "<b>Customer history</b>",
    `- completed jobs 30d/90d: ${Number(memberContext?.completed_count_30d || 0)} / ${Number(memberContext?.completed_count_90d || context.completed_count_90d || 0)}`,
    `- avg spend: ${escHtml(money(memberContext?.avg_spend) || "unknown")}`,
    `- last spend: ${escHtml(amounts)}`,
    `- last purchase: ${escHtml(memberContext?.last_purchase_date || "unknown")}`,
    `- frequency 90d: ${escHtml(context.customer_frequency || "unknown")}`,
    `- risk/issue: ${escHtml(context.risk_issue || "unknown")}`,
    "",
    "<b>Price history</b>",
    `- previous sale prices: ${escHtml(range)}`,
    "- model payout known: unknown",
    "- margin known: unknown",
    "",
    "<b>Model/context</b>",
    "- detected model: unknown",
    "- model lane/type: unknown",
    "- abilities: MK/Burn/drink/kiss = unknown/needs_review",
    "",
    "<b>Request</b>",
    `- ${escHtml(request)}`,
    "",
    "<b>Action needed</b>",
    "Per/Ewvon please identify ad/model context and approve/edit quote.",
    "Do not auto-confirm availability.",
    `Timeout fallback in ${timeoutMinutes} minutes: provisional range only, not final.`,
  ].join("\n");
  return { safeSummary, telegramText };
}

async function sendPricingReviewTelegram(env, text) {
  const targets = [
    { chat_id: env.PRICING_REVIEW_TELEGRAM_PER_ID, label: "per" },
    { chat_id: env.PRICING_REVIEW_TELEGRAM_EWVON_ID, label: "ewvon" },
  ].filter((target) => str(target.chat_id));
  if (!targets.length) {
    targets.push({
      chat_id: env.TELEGRAM_CHAT_ID || "-1003546439681",
      message_thread_id: env.TG_THREAD_PRICING_REVIEW || env.TG_THREAD_CONFIRM || 61,
      label: "default_thread",
    });
  }
  const results = [];
  for (const target of targets) {
    results.push({
      label: target.label,
      ...(await telegramInternalSend(env, {
        chat_id: target.chat_id,
        message_thread_id: target.message_thread_id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      })),
    });
  }
  return { ok: results.some((result) => result.ok), results };
}

function calculateProvisionalPricing(input = {}) {
  const previous = Array.isArray(input.previous_prices_thb) ? input.previous_prices_thb.filter((v) => Number(v) > 0).map(Number) : [];
  const hasRisk = Boolean(input.risk_flag);
  const uncertainAbility = Boolean(input.unknown_ability || input.sensitive_behavior_unclear);
  const modelIdentityUncertain = Boolean(input.model_identity_uncertain);
  let min = 3000;
  let max = 9000;
  let confidence = "low";
  if (previous.length) {
    const low = Math.min(...previous);
    const high = Math.max(...previous);
    min = Math.max(1000, Math.round(low * 0.85));
    max = Math.round(high * 1.25);
    confidence = previous.length >= 3 ? "medium" : "low";
  }
  if (/vip|private|premium/i.test(str(input.model_lane_type))) {
    min = Math.round(min * 1.2);
    max = Math.round(max * 1.35);
  }
  if (/urgent|today|tonight|คืนนี้|วันนี้/i.test(str(input.urgency))) {
    min = Math.round(min * 1.1);
    max = Math.round(max * 1.2);
  }
  if (Number(input.duration_hours) > 3) max = Math.round(max * 1.25);
  const manualOnly = hasRisk || uncertainAbility || modelIdentityUncertain;
  return {
    min_price_thb: min,
    max_price_thb: Math.max(max, min + 1000),
    confidence,
    manual_review_required: manualOnly,
    can_auto_send_to_customer: !manualOnly,
    final_price_confirmed: false,
    guardrails: {
      risk_blocks_auto_send: hasRisk,
      unknown_ability_blocks_claims: uncertainAbility,
      model_identity_uncertain_blocks_final: modelIdentityUncertain,
    },
  };
}

async function approvePricingReview(env, body) {
  const reviewId = strReq(body.pricing_review_id, "pricing_review_id");
  const approvedBy = strReq(body.approved_by, "approved_by");
  const finalPrice = numReq(body.final_price_thb, "final_price_thb");
  const customerMessage = str(body.customer_message || `เรทที่ Per/Ewvon ตรวจสอบให้คือ ${money(finalPrice)} ครับ ราคานี้ยังไม่ใช่การยืนยันคิวหรือความพร้อมของนายแบบจนกว่าจะล็อกงานในระบบครับ`);
  const found = await findPricingReview(env, reviewId);
  if (!found?.id) return { ok: false, error: "pricing_review_not_found" };
  const payload = parsePayloadJson(found.fields?.payload_json);
  payload.status = "human_approved";
  payload.approved_by = approvedBy;
  payload.final_price_thb = finalPrice;
  payload.customer_message = customerMessage;
  payload.approved_at = new Date().toISOString();
  const patched = await airtablePatchById(env, pricingReviewTable(env), found.id, {
    status: "human_approved",
    admin_note: `[Pricing Review Approved]\nApproved by: ${approvedBy}\nFinal price: ${money(finalPrice)}\nNo booking/availability confirmation sent automatically.`,
    payload_json: JSON.stringify(payload),
  });
  const linePush = await maybePushLinePricingMessage(env, payload.line_user_id, customerMessage);
  return {
    ok: Boolean(patched.ok),
    pricing_review_id: reviewId,
    status: "human_approved",
    line_push_sent: Boolean(linePush.ok),
    line_push,
  };
}

async function runPricingReviewTimeoutCheck(env, body = {}) {
  const timeoutMinutes = clampInt(body.timeout_minutes || env.PRICING_TIMEOUT_MINUTES || 10, 1, 1440, 10);
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
  const records = await findWaitingPricingReviews(env, cutoff, clampInt(body.limit || 20, 1, 100, 20));
  const processed = [];
  for (const rec of records) {
    const payload = parsePayloadJson(rec.fields?.payload_json);
    const context = payload.customer_context || {};
    const provisional = calculateProvisionalPricing({
      previous_prices_thb: context.last_paid_amounts || [],
      risk_flag: context.risk_issue === "yes" || (payload.member_context?.risk_flags || []).length > 0,
      unknown_ability: true,
      model_identity_uncertain: Boolean(payload.ad_context_unknown || payload.needs_per_ad_match),
      duration_hours: Number(payload.parsed_request?.duration || 0),
    });
    payload.status = "timeout_provisional_ready";
    payload.timeout_checked_at = new Date().toISOString();
    payload.provisional_range = provisional;
    await airtablePatchById(env, pricingReviewTable(env), rec.id, {
      status: "timeout_provisional_ready",
      admin_note: `[Pricing Review Timeout]\n10 minutes passed. Provisional range ready only, not final.\nRange: ${money(provisional.min_price_thb)}–${money(provisional.max_price_thb)}\nConfidence: ${provisional.confidence}`,
      payload_json: JSON.stringify(payload),
    });
    const telegram = await sendPricingReviewTelegram(
      env,
      [
        "⏱️ <b>Pricing Review Timeout</b>",
        `Review: <code>${escHtml(payload.pricing_review_id || rec.fields?.inbox_id || rec.id)}</code>`,
        "10 minutes passed. Provisional range is ready.",
        `Range: <b>${escHtml(money(provisional.min_price_thb))}–${escHtml(money(provisional.max_price_thb))}</b>`,
        `Confidence: <b>${escHtml(provisional.confidence)}</b>`,
        "This is not final. Per/Ewvon please approve/edit before final customer price.",
      ].join("\n"),
    );
    let linePush = { ok: false, skipped: true, reason: "PRICING_TIMEOUT_SEND_TO_CUSTOMER_false" };
    if (String(env.PRICING_TIMEOUT_SEND_TO_CUSTOMER || "false").toLowerCase() === "true" && provisional.can_auto_send_to_customer) {
      linePush = await maybePushLinePricingMessage(env, payload.line_user_id, buildProvisionalCustomerCopy(provisional));
    }
    processed.push({
      pricing_review_id: payload.pricing_review_id || rec.fields?.inbox_id || rec.id,
      status: "timeout_provisional_ready",
      provisional,
      telegram_sent: Boolean(telegram.ok),
      line_push_sent: Boolean(linePush.ok),
    });
  }
  return { ok: true, timeout_minutes: timeoutMinutes, processed_count: processed.length, processed };
}

function buildProvisionalCustomerCopy(provisional) {
  return `ผมประเมินเบื้องต้นให้ก่อนจากประเภทนายแบบและรายละเอียดที่แจ้งมานะครับ เรทอาจอยู่ในช่วงประมาณ ${money(provisional.min_price_thb)}–${money(provisional.max_price_thb)} บาท ขึ้นอยู่กับวัน เวลา โซน ระยะเวลา และเงื่อนไขของนายแบบคนนั้น

ราคานี้ยังเป็นช่วงประเมินเบื้องต้นครับ Per/Ewvon จะตรวจสอบและยืนยันราคาสุดท้ายอีกครั้งก่อนชำระเงินครับ`;
}

async function findPricingReview(env, reviewId) {
  const safe = String(reviewId).replace(/"/g, '\\"');
  return await airtableFindOne(env, pricingReviewTable(env), `OR({inbox_id}="${safe}",RECORD_ID()="${safe}")`);
}

async function findWaitingPricingReviews(env, cutoffIso, limit) {
  const params = new URLSearchParams();
  params.set("pageSize", String(limit));
  params.set("filterByFormula", `AND({intent}="pricing_review",{status}="waiting_human",IS_BEFORE({created_at},"${cutoffIso}"))`);
  let result = await airtableFetch(env, `/${encodeURIComponent(pricingReviewTable(env))}?${params.toString()}`);
  if (!result.ok) {
    params.set("filterByFormula", `AND({intent}="pricing_review",{status}="waiting_human")`);
    result = await airtableFetch(env, `/${encodeURIComponent(pricingReviewTable(env))}?${params.toString()}`);
  }
  const rows = result.ok ? result.data?.records || [] : [];
  return rows
    .map((rec) => ({ id: rec.id, fields: rec.fields || {}, createdTime: rec.createdTime }))
    .filter((rec) => new Date(rec.createdTime || 0).toISOString() <= cutoffIso);
}

function parsePayloadJson(value) {
  try {
    const parsed = JSON.parse(str(value) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

async function maybePushLinePricingMessage(env, lineUserId, text) {
  if (!lineUserId || !text) return { ok: false, skipped: true, reason: "missing_line_user_id_or_text" };
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    return { ok: false, skipped: true, todo: "Configure LINE_CHANNEL_ACCESS_TOKEN on admin-worker or send through chat-worker push endpoint." };
  }
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });
  return { ok: response.ok, status: response.status };
}

export {
  buildProvisionalCustomerCopy,
  calculateProvisionalPricing,
  choosePricingReplyStrategy,
  parseAdContextSignals,
};

/* =========================
   Create Session Private Access
   Authoritative membership + model gate. Frontend membership fields
   (private_access.*, client_lineage.tier / membership_status,
   allowed_private_folders) are advisory UX data only and never grant access.
========================= */
const PRIVATE_ACCESS_FOLDERS = {
  standard: ["standard"],
  premium: ["standard", "premium"],
  vip: ["standard", "premium", "vip"],
  black_card: ["standard", "premium", "vip", "exclusive"],
};
const PRIVATE_ACCESS_TIER_RANK = { standard: 1, premium: 2, vip: 3, black_card: 4 };
const CANONICAL_PRIVATE_FOLDERS = new Set(["standard", "premium", "vip", "exclusive"]);
const PUBLIC_MODEL_FOLDERS = new Set(["travel", "extreme"]);
const MODEL_BLOCKED_STATUS_TOKENS = new Set(["inactive", "blocked", "suspended", "archived", "disabled", "banned", "off", "retired"]);
const MODEL_UNAVAILABLE_TOKENS = new Set(["unavailable", "not_available", "paused", "busy", "on_hold", "hold"]);

class CreateSessionAccessError extends Error {
  constructor(code, message, status = 403) {
    super(message);
    this.name = "CreateSessionAccessError";
    this.code = code;
    this.status = status;
  }
}

function accessToken(value) {
  return String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function membershipTierFromText(value) {
  const token = accessToken(value);
  if (!token) return "";
  // legacy SVIP normalizes to Black Card access; check before the "vip" substring
  if (token.includes("black") || token.includes("svip")) return "black_card";
  if (token.includes("vip")) return "vip";
  if (token.includes("premium")) return "premium";
  if (token.includes("standard") || token.includes("lite")) return "standard";
  return "";
}

function normalizeCustomerLane(value) {
  const token = accessToken(value);
  if (token === "gay") return "gay";
  if (token === "straight") return "straight";
  if (token === "both" || token === "bi" || token === "all") return "both";
  return "";
}

function formulaText(value) {
  return `"${String(value == null ? "" : value).replace(/"/g, '\\"')}"`;
}

async function airtableListByFormula(env, tableName, filterByFormula, limit = 50) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return [];
  const params = new URLSearchParams();
  params.set("pageSize", String(Math.max(1, Math.min(100, limit))));
  if (filterByFormula) params.set("filterByFormula", filterByFormula);
  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}?${params.toString()}`);
  if (!r.ok) return [];
  return (r.data?.records || []).map((rec) => ({ id: rec.id, fields: rec.fields || {}, createdTime: rec.createdTime }));
}

async function resolveAuthoritativeMemberAccess(env, ids = {}) {
  const membersTable = env.AIRTABLE_TABLE_MEMBERS || "members";
  const lookups = [
    ["client_id", ids.client_id, false],
    ["member_id", ids.member_id, false],
    ["Member ID", ids.member_id, false],
    ["memberstack_id", ids.memberstack_id, false],
    ["line_record_id", ids.line_record_id, false],
    ["line_record", ids.line_record_id, false],
    ["line_user_id", ids.line_user_id, false],
    ["line_id", ids.line_user_id, false],
    ["email", ids.member_email, true],
    ["Contact Email", ids.member_email, true],
    ["telegram_username", ids.telegram_username, true],
  ];

  let member = null;
  for (const [field, value, lower] of lookups) {
    const raw = str(value);
    if (!raw) continue;
    const left = lower ? `LOWER({${field}})` : `{${field}}`;
    member = await airtableFindOne(env, membersTable, `${left}=${formulaText(lower ? raw.toLowerCase() : raw)}`);
    if (member) break;
  }
  if (!member) return { resolved: false, allowed_folders: [] };

  const memberFields = member.fields || {};
  const memberEmail = str(memberFields["Contact Email"] || memberFields.member_email || memberFields.email || ids.member_email).toLowerCase();

  // member_packages ledger is the membership source of truth (mirrors auth-worker derivePackageAccess)
  let best = null;
  if (memberEmail) {
    const ledgerTable = env.AIRTABLE_TABLE_MEMBER_PACKAGES || "member_packages";
    const now = Date.now();
    const records = await airtableListByFormula(env, ledgerTable, `LOWER({member_email})=${formulaText(memberEmail)}`, 20);
    for (const record of records) {
      const f = record.fields || {};
      if (accessToken(f.status) !== "active") continue;
      const endAt = Date.parse(str(f.end_date || f.end_at || f.expire_at || f.expires_at));
      if (!endAt || endAt < now) continue;
      const tier = membershipTierFromText(f.package_code || f.tier);
      if (!tier) continue;
      const rank = PRIVATE_ACCESS_TIER_RANK[tier] || 0;
      if (!best || rank > best.rank || (rank === best.rank && endAt > best.endAt)) {
        best = { tier, rank, endAt, package_code: str(f.package_code || f.tier), expire_at: str(f.end_date || f.end_at || f.expire_at || f.expires_at) };
      }
    }
  }

  if (!best) {
    return {
      resolved: true,
      member_record_id: member.id,
      member_id: str(memberFields.member_id || memberFields["Member ID"]),
      member_email: memberEmail,
      membership_status: memberEmail ? "no_active_membership" : "no_ledger_identity",
      tier: "",
      allowed_folders: [],
    };
  }

  return {
    resolved: true,
    member_record_id: member.id,
    member_id: str(memberFields.member_id || memberFields["Member ID"]),
    member_email: memberEmail,
    membership_status: "active",
    tier: best.tier,
    package_code: best.package_code,
    expire_at: best.expire_at,
    allowed_folders: PRIVATE_ACCESS_FOLDERS[best.tier].slice(),
  };
}

function modelAccessProfile(fields = {}) {
  const rawTags = []
    .concat(Array.isArray(fields.legacy_tags) ? fields.legacy_tags : String(fields.legacy_tags || "").split(/[,\n]/))
    .concat(Array.isArray(fields.tags) ? fields.tags : String(fields.tags || "").split(/[,\n]/));
  const tags = new Set(rawTags.map(accessToken).filter(Boolean));

  const visibilityToken = accessToken(fields.booking_visibility);
  const salesLayer = accessToken(fields.sales_layer);
  let bookingVisibility = "";
  if (visibilityToken === "private" || salesLayer.includes("private")) bookingVisibility = "private";
  else if (visibilityToken === "public" || salesLayer.includes("public")) bookingVisibility = "public";

  let accessFolder = accessToken(fields.access_folder || fields.model_access_folder || fields.model_folder);
  if (!CANONICAL_PRIVATE_FOLDERS.has(accessFolder)) {
    accessFolder = "";
    const tierSource = accessToken([fields.model_tier, fields.approved_client_visibility, fields.private_tier].filter(Boolean).join(" "));
    if (tierSource.includes("exclusive") || tierSource.includes("black")) accessFolder = "exclusive";
    else if (tierSource.includes("vip")) accessFolder = "vip";
    else if (tierSource.includes("premium")) accessFolder = "premium";
    else if (tierSource.includes("standard")) accessFolder = "standard";
  }

  const serviceSource = accessToken([fields.service_layer, fields.job_types, fields.private_tier].filter(Boolean).join(" "));
  const publicFolders = [];
  if (serviceSource.includes("travel") || tags.has("travel")) publicFolders.push("travel");
  if (serviceSource.includes("extreme") || tags.has("extreme")) publicFolders.push("extreme");

  const lane = normalizeCustomerLane(fields.customer_lane || fields.orientation_label || fields.orientation);
  const statusActive = !MODEL_BLOCKED_STATUS_TOKENS.has(accessToken(fields.status));
  const availabilityToken = accessToken(fields.availability_status);
  const availableNow =
    fields.available_now === true ||
    ["yes", "true", "1", "available"].includes(accessToken(fields.available_now)) ||
    ["available", "active", "bookable"].includes(availabilityToken);
  const explicitlyUnavailable =
    fields.available_now === false ||
    accessToken(fields.available_now) === "no" ||
    MODEL_UNAVAILABLE_TOKENS.has(availabilityToken);

  // burn / mk / live / pn are operational compatibility flags, never membership access folders
  const ops = {
    burn: accessToken(fields.burn_ability) === "yes" || tags.has("burn"),
    mk: accessToken(fields.mk_ability) === "yes" || tags.has("mk"),
    live: accessToken(fields.live_ability) === "yes" || tags.has("live"),
    pn_compatible: accessToken(fields.pn_ability) === "yes" || tags.has("pn"),
  };

  return { bookingVisibility, accessFolder, publicFolders, lane, statusActive, availableNow, explicitlyUnavailable, ops };
}

function sanitizeCreateSessionModel(record, profile) {
  const fields = record.fields || {};
  const folders = profile.bookingVisibility === "private"
    ? (profile.accessFolder ? [profile.accessFolder] : [])
    : profile.publicFolders.slice();
  return {
    model_id: record.id,
    model_name: str(fields.working_name || fields.display_name || fields.model_name || fields.nickname || fields.name || fields.Name),
    model_lookup_key: str(fields.model_lookup_key || fields.unique_key || fields.model_code),
    telegram_username: str(fields.telegram_username),
    telegram_status: str(fields.telegram_status) || (str(fields.telegram_username) ? "linked" : "missing"),
    folders,
    orientation: profile.lane,
    status: !profile.statusActive ? "inactive" : profile.availableNow ? "available" : "active",
    available: profile.availableNow && !profile.explicitlyUnavailable,
    operational: { ...profile.ops },
  };
}

async function resolveCreateSessionModel(env, { model_id = "", model_key = "" } = {}) {
  const modelsTable = env.AIRTABLE_TABLE_MODELS || "models";
  const id = str(model_id);
  if (/^rec[A-Za-z0-9]{14,}$/.test(id)) {
    const r = await airtableFetch(env, `/${encodeURIComponent(modelsTable)}/${id}`);
    if (r.ok && r.data?.id) return { id: r.data.id, fields: r.data.fields || {} };
  }
  const key = str(model_key || id);
  if (!key) return null;
  for (const field of ["model_lookup_key", "unique_key", "model_code"]) {
    const found = await airtableFindOne(env, modelsTable, `{${field}}=${formulaText(key)}`);
    if (found) return found;
  }
  return null;
}

async function enforcePrivateCreateAccess(env, body = {}) {
  const work = body?.work || {};
  const model = body?.model || {};
  const privateAccess = body?.private_access || {};
  const telegramGate = body?.telegram_gate || {};
  const lineage = body?.client_lineage || {};
  const lineIdentity = body?.line_identity || {};

  const selectedFolder = accessToken(privateAccess.selected_private_folder || work.model_folder || body.model_folder);
  const selectedOrientation = normalizeCustomerLane(privateAccess.selected_orientation || model.selected_orientation || body.selected_orientation);
  const customerTelegram = str(telegramGate.customer_telegram_status || body.customer_telegram_status);
  const modelTelegram = str(telegramGate.model_telegram_status || body.model_telegram_status);
  const telegramOk = ["linked", "verified"].includes(customerTelegram) && ["linked", "verified"].includes(modelTelegram);

  // Membership comes from the backend ledger; frontend tier/status fields never grant access.
  const memberAccess = await resolveAuthoritativeMemberAccess(env, {
    member_id: str(body.member_id || lineage.member_id),
    client_id: str(body.client_id || lineage.client_id),
    memberstack_id: str(body.memberstack_id || lineage.memberstack_id),
    line_record_id: str(lineIdentity.line_record_id || body.line_record_id),
    line_user_id: str(lineIdentity.line_user_id || body.line_user_id),
    member_email: str(lineage.member_email || body.member_email || lineage.email),
    telegram_username: str(telegramGate.customer_telegram_username || lineage.customer_telegram_username),
  });
  if (!memberAccess.resolved) {
    throw new CreateSessionAccessError("AUTHORITATIVE_MEMBER_NOT_FOUND", "The client membership record could not be resolved.", 404);
  }
  const allowedFolders = memberAccess.allowed_folders;
  if (!allowedFolders.length) throw new CreateSessionAccessError("private_eligibility_blocked", "Client membership is not active for private work.");
  if (!CANONICAL_PRIVATE_FOLDERS.has(selectedFolder)) throw new CreateSessionAccessError("private_folder_invalid", "Selected private folder is not a canonical membership access folder.");
  if (!allowedFolders.includes(selectedFolder)) throw new CreateSessionAccessError("private_folder_not_allowed", "Selected private folder is above the client's membership access.");
  if (selectedOrientation !== "straight" && selectedOrientation !== "gay") throw new CreateSessionAccessError("private_orientation_required", "Private work requires a straight or gay customer lane.");
  if (!telegramOk) throw new CreateSessionAccessError("private_telegram_gate_required", "Customer and model Telegram must be linked or verified for private work.");

  // Never trust browser-submitted model metadata; re-resolve the model record.
  const modelRecord = await resolveCreateSessionModel(env, {
    model_id: str(model.model_id || body.model_id),
    model_key: str(model.model_lookup_key || body.model_lookup_key || body.model_key),
  });
  if (!modelRecord) throw new CreateSessionAccessError("private_model_not_found", "The selected model could not be resolved.", 404);
  const profile = modelAccessProfile(modelRecord.fields || {});
  if (profile.bookingVisibility !== "private") throw new CreateSessionAccessError("private_model_not_private", "The selected model is not a private-work model.");
  if (!CANONICAL_PRIVATE_FOLDERS.has(profile.accessFolder)) throw new CreateSessionAccessError("private_model_folder_invalid", "The selected model has no canonical private access folder.");
  if (profile.accessFolder !== selectedFolder) throw new CreateSessionAccessError("private_model_folder_denied", "The selected model is outside the selected access folder.");
  if (!allowedFolders.includes(profile.accessFolder)) throw new CreateSessionAccessError("private_model_folder_denied", "The selected model is above the client's membership access.");
  if (profile.lane !== selectedOrientation && profile.lane !== "both") throw new CreateSessionAccessError("private_model_lane_mismatch", "The selected model does not serve the selected customer lane.");
  if (!profile.statusActive) throw new CreateSessionAccessError("private_model_inactive", "The selected model is not active.");
  if (profile.explicitlyUnavailable) throw new CreateSessionAccessError("private_model_unavailable", "The selected model is not currently bookable.");

  return { memberAccess, modelRecord, profile, selectedFolder, selectedOrientation };
}

async function searchCreateSessionModels(env, url) {
  const q = str(url.searchParams.get("q") || url.searchParams.get("search") || "");
  const limit = clampInt(url.searchParams.get("limit"), 1, 100, 50);
  const workType = accessToken(url.searchParams.get("work_type"));
  const visibilityParam = accessToken(url.searchParams.get("booking_visibility"));
  const bookingVisibility = visibilityParam === "private" || (!visibilityParam && workType === "private") ? "private" : "public";
  const lane = normalizeCustomerLane(url.searchParams.get("customer_lane") || url.searchParams.get("orientation"));
  const selectedFolder = accessToken(url.searchParams.get("selected_access_folder") || url.searchParams.get("folder"));
  const flag = (name) => ["1", "true", "yes"].includes(accessToken(url.searchParams.get(name)));
  const availableOnly = flag("available_only");
  const wantBurn = flag("burn");
  const wantMk = flag("mk");
  const wantLive = flag("live");

  let allowedFolders = null;
  let memberSummary = null;
  if (bookingVisibility === "private") {
    const ids = {
      member_id: str(url.searchParams.get("member_id")),
      client_id: str(url.searchParams.get("client_id")),
      memberstack_id: str(url.searchParams.get("memberstack_id")),
      line_record_id: str(url.searchParams.get("line_record_id")),
      line_user_id: str(url.searchParams.get("line_user_id")),
      member_email: str(url.searchParams.get("member_email")),
      telegram_username: str(url.searchParams.get("customer_telegram_username")),
    };
    if (!Object.values(ids).some(Boolean)) {
      throw new CreateSessionAccessError("AUTHORITATIVE_MEMBER_NOT_FOUND", "The client membership record could not be resolved.", 404);
    }
    const memberAccess = await resolveAuthoritativeMemberAccess(env, ids);
    if (!memberAccess.resolved) {
      throw new CreateSessionAccessError("AUTHORITATIVE_MEMBER_NOT_FOUND", "The client membership record could not be resolved.", 404);
    }
    allowedFolders = memberAccess.allowed_folders;
    memberSummary = {
      eligibility_checked: true,
      eligibility_result: allowedFolders.length ? "allowed" : "blocked",
      private_access_level: memberAccess.tier || "blocked",
      allowed_private_folders: allowedFolders.slice(),
    };
    if (!allowedFolders.length) {
      // blocked or unknown-entitlement members receive no protected model names
      return { ok: true, layer: "core", booking_visibility: bookingVisibility, folder: selectedFolder, customer_lane: lane, items: [], private_access: memberSummary };
    }
    if (!CANONICAL_PRIVATE_FOLDERS.has(selectedFolder)) throw new CreateSessionAccessError("private_folder_invalid", "Selected private folder is not a canonical membership access folder.");
    if (!allowedFolders.includes(selectedFolder)) throw new CreateSessionAccessError("private_folder_not_allowed", "Selected private folder is above the client's membership access.");
    if (lane !== "straight" && lane !== "gay") throw new CreateSessionAccessError("private_orientation_required", "Private model search requires a straight or gay customer lane.");
  } else if (selectedFolder && !PUBLIC_MODEL_FOLDERS.has(selectedFolder)) {
    throw new CreateSessionAccessError("public_folder_invalid", "Public work uses the travel or extreme folder.", 400);
  }

  const modelsTable = env.AIRTABLE_TABLE_MODELS || "models";
  const records = await airtableList(env, modelsTable, {
    q,
    limit: 100,
    matchFields: getModelSearchFields(env),
    fallbackMatchFields: MODEL_SAFE_SEARCH_FIELDS,
  });

  const items = [];
  for (const record of records) {
    const profile = modelAccessProfile(record.fields || {});
    if (!profile.statusActive) continue;
    if (availableOnly && (!profile.availableNow || profile.explicitlyUnavailable)) continue;
    if (wantBurn && !profile.ops.burn) continue;
    if (wantMk && !profile.ops.mk) continue;
    if (wantLive && !profile.ops.live) continue;
    if (bookingVisibility === "private") {
      if (profile.bookingVisibility !== "private") continue;
      if (!CANONICAL_PRIVATE_FOLDERS.has(profile.accessFolder)) continue;
      if (profile.accessFolder !== selectedFolder) continue;
      if (!allowedFolders.includes(profile.accessFolder)) continue;
      if (profile.lane !== lane && profile.lane !== "both") continue;
    } else {
      if (profile.bookingVisibility === "private") continue;
      if (selectedFolder && !profile.publicFolders.includes(selectedFolder)) continue;
      if (lane && profile.lane && profile.lane !== lane && profile.lane !== "both") continue;
    }
    items.push(sanitizeCreateSessionModel(record, profile));
    if (items.length >= limit) break;
  }

  const out = { ok: true, layer: "core", booking_visibility: bookingVisibility, folder: selectedFolder, customer_lane: lane, items };
  if (memberSummary) out.private_access = memberSummary;
  return out;
}

export {
  CreateSessionAccessError,
  PRIVATE_ACCESS_FOLDERS,
  membershipTierFromText,
  normalizeCustomerLane,
  modelAccessProfile,
  sanitizeCreateSessionModel,
  resolveAuthoritativeMemberAccess,
  resolveCreateSessionModel,
  enforcePrivateCreateAccess,
  searchCreateSessionModels,
};

/* =========================
   Job create
========================= */
async function createAdminJob(env, body) {
  const work = body?.work || {};
  const model = body?.model || {};
  const jobDetails = body?.job_details || {};
  const payment = body?.payment || {};
  const notes = body?.notes || {};
  const privateAccess = body?.private_access || {};
  const telegramGate = body?.telegram_gate || {};
  const jobVisibility = str(work.job_visibility || body.job_visibility || body.booking_visibility || "");

  if (jobVisibility === "private") {
    // Authoritative gate: resolves the member from the backend ledger and the
    // model from Airtable. Browser-supplied membership/model fields never grant access.
    await enforcePrivateCreateAccess(env, body);
  }

  const client_name = strReq(body.client_name || body.client_lineage?.client_name, "client_name");
  const model_name = strReq(body.model_name || model.model_name, "model_name");
  const job_type = strReq(body.job_type || work.job_lane || work.work_type, "job_type");
  const job_date = strReq(body.job_date || jobDetails.job_date, "job_date");
  const start_time = strReq(body.start_time || jobDetails.start_time, "start_time");
  const end_time = strReq(body.end_time || jobDetails.end_time, "end_time");
  const location_name = strReq(body.location_name || jobDetails.location_name, "location_name");

  const google_map_url = str(body.google_map_url || jobDetails.google_map_url || "");
  const note = str(body.note || notes.operation_note || notes.handling_note || body.notes || "");
  const payment_type = str(body.payment_type || payment.payment_type || "full");
  const payment_method = str(body.payment_method || payment.payment_method || "promptpay");
  const amount_thb = numReq(body.amount_thb || payment.amount_thb, "amount_thb");

  const webBase = str(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
  const confirm_page = absoluteUrl(body.confirm_page || "/confirm/job-confirmation", webBase);
  const model_confirm_page = absoluteUrl(body.model_confirm_page || "/confirm/job-model", webBase);

  const payload = {
    client_name,
    model_name,
    job_type,
    job_date,
    start_time,
    end_time,
    location_name,
    google_map_url,
    amount_thb,
    payment_type,
    payment_method,
    note,
    confirm_page,
    model_confirm_page,
  };

  const minted = await callPaymentsCreateLink(env, payload);

  const session_id = minted.session_id || minted.sessionId || "";
  const payment_ref = minted.payment_ref || minted.paymentRef || "";

  const customer_confirmation_url =
    minted.customer_confirmation_url ||
    minted.confirmation_url ||
    (minted.customer_t ? `${confirm_page}?t=${encodeURIComponent(minted.customer_t)}` : "") ||
    (minted.t ? `${confirm_page}?t=${encodeURIComponent(minted.t)}` : "");

  const model_confirmation_url =
    minted.model_confirmation_url ||
    (minted.model_t ? `${model_confirm_page}?t=${encodeURIComponent(minted.model_t)}` : "") ||
    (minted.t ? `${model_confirm_page}?t=${encodeURIComponent(minted.t)}` : "");

  if (!customer_confirmation_url) throw new Error("missing_customer_confirmation_url");
  if (!model_confirmation_url) throw new Error("missing_model_confirmation_url");

  await notifyJobCreated(env, {
    session_id,
    payment_ref,
    client_name,
    model_name,
    job_type,
    job_date,
    start_time,
    end_time,
    location_name,
    amount_thb,
    customer_confirmation_url,
    model_confirmation_url,
  });

  return {
    session_id,
    payment_ref,
    customer_confirmation_url,
    model_confirmation_url,
    raw: minted,
  };
}

async function callPaymentsCreateLink(env, payload) {
  const base = str(env.PAYMENTS_WORKER_BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("missing_PAYMENTS_WORKER_BASE_URL");

  const res = await fetch(`${base}/v1/confirm/link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(env.CONFIRM_KEY ? { "X-Confirm-Key": env.CONFIRM_KEY } : {}),
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `payments_worker_http_${res.status}`);
  }

  return data || {};
}

async function notifyJobCreated(env, data) {
  if (!env.TELEGRAM_INTERNAL_SEND_URL || !env.INTERNAL_TOKEN) return;

  const lines = [
    "🔗 <b>JOB LINKS CREATED</b>",
    `Client: <b>${escHtml(data.client_name)}</b>`,
    `Model: <b>${escHtml(data.model_name)}</b>`,
    `Type: <b>${escHtml(data.job_type)}</b>`,
    `Date: <b>${escHtml(data.job_date)}</b>`,
    `Time: <b>${escHtml(data.start_time)} - ${escHtml(data.end_time)}</b>`,
    `Location: <b>${escHtml(data.location_name)}</b>`,
    `Amount: <b>${Number(data.amount_thb).toLocaleString("en-US")} THB</b>`,
    `Session: <code>${escHtml(data.session_id || "-")}</code>`,
    `Payment Ref: <code>${escHtml(data.payment_ref || "-")}</code>`,
    "",
    `Customer URL: ${escHtml(data.customer_confirmation_url)}`,
    `Model URL: ${escHtml(data.model_confirmation_url)}`,
  ];

  await telegramInternalSend(env, {
    chat_id: env.TELEGRAM_CHAT_ID || "-1003546439681",
    message_thread_id: env.TG_THREAD_CONFIRM || 61,
    text: lines.join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}
