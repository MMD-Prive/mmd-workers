// src/index.js
// =========================================================
// admin-worker — Admin API (LOCK v2026-LOCK-01)
//
// Endpoints:
//   GET  /ping
//   GET  /v1/admin/ping
//   POST /api/member/kenji/chat
//   GET  /v1/admin/ceo              -> public-safe CEO console health/summary
//   GET  /v1/admin/stats
//   GET  /v1/admin/members/list
//   POST /v1/admin/members/update
//   POST /v1/admin/telegram/dm
//   GET  /v1/admin/models/list
//   POST /v1/admin/models/upsert
//   POST /v1/admin/jobs/create-job
//
// + Airtable Writer (STRICT confirm-key only):
//   POST /v1/admin/console/inbox      -> writes MMD — Console Inbox (tblFHmfpB2TTrzO2e)
//   POST /v1/admin/payment/proof      -> writes MMD — Payment Proofs (tblfJfM4Sqag9zrLi)
//
// Auth (either) for /v1/admin/* in general:
//   - Authorization: Bearer <ADMIN_BEARER>
//   - X-Confirm-Key: <CONFIRM_KEY>
//
// Auth (STRICT) for writer endpoints above:
//   - X-Confirm-Key: <CONFIRM_KEY> only
//
// ENV (minimum):
//   ALLOWED_ORIGINS="https://mmdprive.com,https://mmdprive.webflow.io"
//
// Secrets:
//   ADMIN_BEARER   (wrangler secret)
//   CONFIRM_KEY    (wrangler secret)
//   MEMBERSTACK_API_KEY (secret)
//
// Airtable (optional but required for writer endpoints):
//   AIRTABLE_API_KEY (secret)
//   AIRTABLE_BASE_ID (var/secret)  // e.g. appsV1ILPRfIjkaYg
//
// Tables (optional overrides):
//   AIRTABLE_TABLE_MEMBERS="members" (default "members")
//   AIRTABLE_TABLE_MODELS="models"   (default "models")
//
// Table IDs (writer):
//   AIRTABLE_TABLE_CONSOLE_INBOX_ID="tblFHmfpB2TTrzO2e"   (default)
//   AIRTABLE_TABLE_PAYMENT_PROOFS_ID="tblfJfM4Sqag9zrLi"  (default)
//
// Telegram internal send (optional):
//   TELEGRAM_INTERNAL_SEND_URL="https://telegram-worker.malemodel-bkk.workers.dev/telegram/internal/send"
//   INTERNAL_TOKEN (secret)  // shared with telegram-worker
// =========================================================

import { json, safeJson } from "../lib/http.js";
import { dtCreateRecord, dtFindMember, membersTableId } from "../lib/memberstack_dt.js";
import {
  handleMemberDashboardRequest,
  handleMemberKenjiChatRequest,
  mintMemberDashboardToken,
} from "./memberDashboard.js";
import { MODEL_ALIAS_CANDIDATES, MODEL_MANIFEST } from "./lib/model-manifest.generated.js";
import { getDashboardCEO } from "./lib/airtable-stock.js";
import {
  enforceSingleActiveReferral,
  updateCommissionState,
} from "../../shared/src/lib/partner-commissions/index.js";
import { handleMembershipRequest } from "./membershipRequest.js";

const LOCK = "v2026-LOCK-01";
const AIRTABLE_API = "https://api.airtable.com/v0";
const ADMIN_SESSION_COOKIE = "mmd_admin_worker_session";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;
const MODEL_SESSION_DASHBOARD_PATH = "/v1/model/session/dashboard";
const MODEL_SESSION_STATUS_PATH = "/v1/model/session/status";
const MODEL_SESSION_GPS_PATH = "/v1/model/session/gps";
const MODEL_SESSION_UPDATE_PATH = "/v1/model/session/update";
const MODEL_SESSION_EMERGENCY_PATH = "/v1/model/session/emergency";
const MODEL_SESSION_STUB_PATHS = new Set([
  MODEL_SESSION_GPS_PATH,
  MODEL_SESSION_UPDATE_PATH,
  MODEL_SESSION_EMERGENCY_PATH,
]);
const MODEL_SESSION_ALLOWED_STATUSES = new Set([
  "en_route",
  "arrived",
  "met",
  "work_started",
  "work_finished",
  "separated",
]);
const MODEL_SESSION_STATUS_ALIASES = {
  on_the_way: "en_route",
  start_route: "en_route",
  started: "work_started",
  start_work: "work_started",
  work_start: "work_started",
  finished: "work_finished",
  finish_work: "work_finished",
};
const SIGIL_PAY_RENEWAL_PATH = "/pay/renewal";
const SIGIL_PAY_RENEWAL_LEGACY_PATH = "/sigil/pay/renewal";
const SIGIL_PAY_RENEWAL_PROOF_PATH = "/api/pay/renewal/proof";
const PAYMENT_REVIEW_CONSOLE_PATH = "/payment/review-console";
const PAYMENT_REVIEW_CONSOLE_LEGACY_PATH = "/pay/renewal/review";
const PAYMENT_RENEWAL_REVIEW_LIST_PATH = "/api/pay/renewal/review/list";
const PAYMENT_RENEWAL_REVIEW_DECISION_PATH = "/api/pay/renewal/review/decision";
const SIGIL_PAY_RENEWAL_BUILD = "SIGIL_PAY_RENEWAL_V1_20260607";
const SIGIL_RENEWAL_KENJI_IMAGE = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a22f53633aaf32d040022d4_Line-Kenji.webp";
const SIGIL_RENEWAL_LOGO_IMAGE = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0f2cbc7e26b6735aee4cb2_SIGIL%20LOGO%20Transp.webp";
const SIGIL_PROMPTPAY_URL = "https://promptpay.io/0829528889";
const SIGIL_BANK_NAME = "KTB Bank / Krungthai";
const SIGIL_BANK_ACCOUNT_NAME = "ธัชชะ ป. / Tatcha P.";
const SIGIL_BANK_ACCOUNT_NUMBER = "1420335898";
const SIGIL_PAYPAL_URL = "https://www.paypal.com/ncp/payment/M697T7AW2QZZJ";
const SIGIL_RENEWAL_TURNSTILE_SITE_KEY = "0x4AAAAAACIE9VleQdOBRfBG";

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    // ---- CORS / Preflight ----
    if (method === "OPTIONS") return corsPreflight(req, env);

    if ((method === "GET" || method === "HEAD") && path === SIGIL_PAY_RENEWAL_LEGACY_PATH) {
      const target = new URL(req.url);
      target.pathname = SIGIL_PAY_RENEWAL_PATH;
      return withCors(req, env, Response.redirect(target.toString(), 301));
    }

    if ((method === "GET" || method === "HEAD") && path === SIGIL_PAY_RENEWAL_PATH) {
      return withCors(req, env, renderSigilPayRenewalPage(req, env));
    }

    if (method === "POST" && path === SIGIL_PAY_RENEWAL_PROOF_PATH) {
      return withCors(req, env, await handlePublicRenewalProofSubmit(req, env));
    }

    if ((method === "GET" || method === "HEAD") && path === PAYMENT_REVIEW_CONSOLE_LEGACY_PATH) {
      const target = new URL(req.url);
      target.pathname = PAYMENT_REVIEW_CONSOLE_PATH;
      return withCors(req, env, Response.redirect(target.toString(), 302));
    }

    if ((method === "GET" || method === "HEAD") && path === PAYMENT_REVIEW_CONSOLE_PATH) {
      return withCors(req, env, renderPaymentReviewConsolePage(req, method));
    }

    if (method === "GET" && path === PAYMENT_RENEWAL_REVIEW_LIST_PATH) {
      return withCors(req, env, await handleRenewalReviewList(req, env));
    }

    if (method === "POST" && path === PAYMENT_RENEWAL_REVIEW_DECISION_PATH) {
      return withCors(req, env, await handleRenewalReviewDecision(req, env));
    }

    // ---- Public ping ----
    if (method === "GET" && path === "/ping") {
      return withCors(
        req,
        env,
        json({ ok: true, worker: "admin-worker", lock: LOCK, ts: Date.now() })
      );
    }

    if (
      ((method === "GET" &&
        (path === "/api/member/dashboard" ||
          path === "/api/member/dashboard/view" ||
          path === "/api/member/session/next" ||
          path === "/api/member/payments/summary")) ||
        (method === "HEAD" && path === "/api/member/dashboard/view"))
    ) {
      return withCors(req, env, await handleMemberDashboardRequest(req, env));
    }

    if (method === "GET" && path === MODEL_SESSION_DASHBOARD_PATH) {
      return withCors(req, env, await handleModelSessionDashboard(req, env));
    }

    if (method === "POST" && path === MODEL_SESSION_STATUS_PATH) {
      return withCors(req, env, await handleModelSessionStatus(req, env));
    }

    if (method === "POST" && MODEL_SESSION_STUB_PATHS.has(path)) {
      return withCors(req, env, await handleModelSessionStub(req, env, path));
    }

    if (method === "POST" && path === "/api/member/kenji/chat") {
      return withCors(req, env, await handleMemberKenjiChatRequest(req, env));
    }

    if (path === "/v1/membership/request") {
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }
      return withCors(req, env, await handleMembershipRequest(req, env));
    }

    if (path === "/v1/admin/ping" && method === "GET") {
      const cookieSession = await readValidAdminSessionCookie(req, env);
      const authed = isAuthed(req, env) || Boolean(cookieSession);
      const attemptedHeaderAuth = Boolean(
        str(req.headers.get("Authorization")) || str(req.headers.get("X-Confirm-Key"))
      );
      if (attemptedHeaderAuth && !authed) {
        return withCors(req, env, json({ ok: false, error: "invalid_admin_credentials" }, 401));
      }
      return withCors(
        req,
        env,
        json({
          ok: true,
          admin: true,
          worker: "admin-worker",
          lock: LOCK,
          authenticated: authed,
          ts: Date.now(),
        })
      );
    }

    if (path === "/v1/admin/auth/me" && method === "GET") {
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }

      const headerAuthed = isAuthed(req, env);
      const cookieSession = await readValidAdminSessionCookie(req, env);

      if (!headerAuthed && !cookieSession) {
        return withCors(
          req,
          env,
          json(
            {
              ok: false,
              error: {
                code: "UNAUTHORIZED",
                message: "Not logged in",
                status: 401,
              },
            },
            401
          )
        );
      }

      return withCors(
        req,
        env,
        json({
          ok: true,
          authenticated: true,
          session: {
            via: cookieSession ? "cookie" : "header",
            expires_at: cookieSession?.exp ? new Date(cookieSession.exp * 1000).toISOString() : null,
          },
        })
      );
    }

    if (path === "/v1/admin/auth/session" && method === "POST") {
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }

      const body = await safeJson(req);
      const headerAuthed = isAuthed(req, env);
      const bodyAuthed = isBodyAuthed(body, env);

      if (!headerAuthed && !bodyAuthed) {
        return withCors(
          req,
          env,
          json(
            {
              ok: false,
              error: {
                code: "UNAUTHORIZED",
                message: "Invalid admin credentials",
                status: 401,
              },
            },
            401
          )
        );
      }

      const cookieValue = await mintAdminSessionCookieValue(env);
      const response = json({
        ok: true,
        authenticated: true,
        cookie_name: ADMIN_SESSION_COOKIE,
        expires_in_seconds: ADMIN_SESSION_TTL_SECONDS,
      });
      response.headers.append(
        "Set-Cookie",
        buildAdminSessionCookie(cookieValue, ADMIN_SESSION_TTL_SECONDS)
      );
      return withCors(req, env, response);
    }

    if (path === "/v1/admin/auth/session" && method === "DELETE") {
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }
      const response = json({ ok: true, cleared: true });
      response.headers.append("Set-Cookie", clearAdminSessionCookie());
      return withCors(req, env, response);
    }

    // ---- Internal admin create-session page ----
    if (
      (method === "GET" || method === "HEAD") &&
      (path === "/internal/admin/jobs/create-session" ||
        path === "/internal/admin/create-session")
    ) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }
      if (!(await isAdminRouteAuthed(req, env))) {
        return withCors(req, env, redirectToInternalAdminLogin(req));
      }
      return withCors(req, env, renderCreateSessionRebuiltPage(method));
    }

    if (
      (method === "GET" || method === "HEAD") &&
      (path === "/internal/admin/notes-hub" || path === "/internal/admin/notes")
    ) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }
      return withCors(req, env, renderNotesHubPage(method));
    }

    if (
      method === "POST" &&
      (path === "/internal/admin/jobs/create-session" ||
        path === "/internal/admin/create-session")
    ) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }
      if (!(await isAdminRouteAuthed(req, env))) {
        return withCors(req, env, json({ ok: false, error: "unauthorized" }, 401));
      }

      const body = await safeJson(req);
      try {
        const out = await createAdminSession(env, body || {});
        return withCors(req, env, json({ ok: true, ...out }));
      } catch (error) {
        return withCors(
          req,
          env,
          json({ ok: false, error: String(error?.message || error) }, 400)
        );
      }
    }

    if (method === "POST" && path === "/internal/admin/jobs/create-job") {
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }
      if (!(await isAdminRouteAuthed(req, env))) {
        return withCors(req, env, json({ ok: false, error: "unauthorized" }, 401));
      }

      const body = await safeJson(req);
      try {
        const out = await createAdminJob(env, body || {}, req);
        return withCors(req, env, json({ ok: true, ...flattenCreateJobResponse(out) }));
      } catch (error) {
        return withCors(
          req,
          env,
          json({ ok: false, error: String(error?.message || error) }, 400)
        );
      }
    }

    // ---- Admin routes ----
    if (path.startsWith("/v1/admin/")) {
      // (1) Origin allowlist (recommended for browser calls)
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }

      // (1.5) Public-safe CEO console.
      // No frontend token. This route returns a sanitized console payload only.
      if (method === "GET" && path === "/v1/admin/ceo") {
        const eventId = crypto.randomUUID();
        logConsoleAudit("public_ceo_console_requested", req, {
          event_id: eventId,
        });

        try {
          const result = await getDashboardCEO(env);
          const safe = buildPublicSafeCeoConsole(result, eventId);
          logConsoleAudit("public_ceo_console_served", req, {
            event_id: eventId,
            status: safe.console.status,
            trend_points: safe.console.metrics.trend_points,
          });
          return withCors(req, env, json(safe));
        } catch (err) {
          logConsoleAudit("public_ceo_console_failed", req, {
            event_id: eventId,
            error_name: str(err?.name || "Error"),
          });
          return withCors(
            req,
            env,
            json({
              ok: true,
              public_safe: true,
              endpoint: "/v1/admin/ceo",
              console_log_event_id: eventId,
              console: {
                status: "degraded",
                data_ready: false,
                checked_at: new Date().toISOString(),
                metrics: {
                  trend_points: 0,
                  supplier_balance_count: 0,
                  low_stock_batches: 0,
                  depleted_batches: 0,
                  has_financial_data: false,
                },
              },
            })
          );
        }
      }

      // (2) Writer endpoints
      if (method === "POST" && (path === "/v1/admin/console/inbox" || path === "/internal/console/inbox" || path === "/v1/admin/payment/proof")) {
        const isInternalConsoleInbox = path === "/internal/console/inbox";
        const writerAuthed = isInternalConsoleInbox ? isAuthed(req, env) : isConfirmKeyAuthed(req, env);
        if (!writerAuthed) {
          return withCors(req, env, json({ ok: false, error: "unauthorized" }, 401));
        }

        const body = await safeJson(req);

        // POST /v1/admin/console/inbox
        if (path === "/v1/admin/console/inbox" || path === "/internal/console/inbox") {
          if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
            return withCors(req, env, json({ ok: false, error: "missing_airtable_env" }, 500));
          }

          const fields = {
            inbox_id: body.inbox_id || crypto.randomUUID(),
            source: body.source || "admin_console",
            intent: body.intent || "note_only",

            member_name: body.member_name || "",
            member_email: body.member_email || "",
            member_phone: body.member_phone || "",
            memberstack_id: body.memberstack_id || "",
            telegram_id: body.telegram_id || "",
            telegram_username: body.telegram_username || "",
            line_user_id: body.line_user_id || "",
            line_id: body.line_id || "",
            legacy_tags: body.legacy_tags || "",

            admin_note: body.admin_note || "",
            payload_json: body.payload_json
              ? JSON.stringify(body.payload_json)
              : JSON.stringify(body || {}),

            status: body.status || "new",
            error_message: "",
          };

          // link records if provided (record IDs)
          if (body.linked_member) fields.linked_member = [body.linked_member];
          if (body.linked_session) fields.linked_session = [body.linked_session];
          if (body.linked_payment) fields.linked_payment = [body.linked_payment];

          try {
            const rec = await airtableCreate({
              baseId: env.AIRTABLE_BASE_ID,
              tableId: env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e",
              apiKey: env.AIRTABLE_API_KEY,
              fields,
            });

            return withCors(req, env, json({ ok: true, record_id: rec.id }));
          } catch (e) {
            return withCors(req, env, json({ ok: false, error: String(e?.message || e) }, 500));
          }
        }

        // POST /v1/admin/payment/proof
        if (path === "/v1/admin/payment/proof") {
          if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
            return withCors(req, env, json({ ok: false, error: "missing_airtable_env" }, 500));
          }

          const fields = {
            proof_id: body.proof_id || crypto.randomUUID(),
            payer_name: body.payer_name || "",
            amount_thb: Number(body.amount_thb || 0),
            paid_at: body.paid_at || null,
            channel: body.channel || "bank_transfer",
            payment_ref: body.payment_ref || "",
            slip_url: body.slip_url || "",
            note: body.note || "",
            status: body.status || "pending",
          };

          if (body.verified_at) fields.verified_at = body.verified_at;
          if (body.verified_by) fields.verified_by = body.verified_by;

          if (body.member) fields.member = [body.member];
          if (body.session) fields.session = [body.session];
          if (body.payment) fields.payment = [body.payment];

          try {
            const rec = await airtableCreate({
              baseId: env.AIRTABLE_BASE_ID,
              tableId: env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi",
              apiKey: env.AIRTABLE_API_KEY,
              fields,
            });

            return withCors(req, env, json({ ok: true, record_id: rec.id }));
          } catch (e) {
            return withCors(req, env, json({ ok: false, error: String(e?.message || e) }, 500));
          }
        }
      }

      // (2.5) CEO Dashboard — INTERNAL_TOKEN auth (must be before general isAuthed)
      if (method === "GET" && path === "/v1/admin/dashboard/ceo") {
        const auth = req.headers.get("Authorization") || "";
        if (!env.INTERNAL_TOKEN || auth !== `Bearer ${env.INTERNAL_TOKEN}`) {
          return withCors(req, env, json({ ok: false, error: "unauthorized" }, 401));
        }
        try {
          const result = await getDashboardCEO(env);
          return withCors(req, env, json(result));
        } catch (err) {
          return withCors(
            req,
            env,
            json({
              ok: false,
              error: "dashboard_ceo_failed",
              message: err && err.message ? err.message : String(err),
            }, 500)
          );
        }
      }

      // (3) General admin auth (Bearer OR confirm-key)
      if (!(await isAdminRouteAuthed(req, env))) {
        return withCors(req, env, json({ ok: false, error: "unauthorized" }, 401));
      }

      // GET /v1/admin/stats
      if (method === "GET" && path === "/v1/admin/stats") {
        const labels = buildLastNDays(7);
        const trends = {
          labels,
          members_new: labels.map(() => 0),
          revenue_thb: labels.map(() => 0),
          payments_count: labels.map(() => 0),
          points_issued: labels.map(() => 0),
        };
        const summary = {
          total_members: 0,
          total_models: 0,
          revenue_30d_thb: 0,
        };
        return withCors(req, env, json({ ok: true, summary, trends }));
      }

      if (method === "POST" && path === "/v1/admin/member/dashboard-test-token") {
        const body = await safeJson(req);
        return withCors(req, env, json(await mintMemberDashboardToken(body || {}, env)));
      }

      // GET /v1/admin/members/list
      if (method === "GET" && path === "/v1/admin/members/list") {
        const q = (url.searchParams.get("q") || "").trim();
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const items = await airtableList(env, env.AIRTABLE_TABLE_MEMBERS || "members", {
          q,
          limit,
          matchFields: ["name", "nickname", "memberstack_id", "telegram_username", "telegram_id"],
        });

        return withCors(req, env, json({ ok: true, items }));
      }

      // GET /v1/admin/clients/list
      if (method === "GET" && path === "/v1/admin/clients/list") {
        const q = (url.searchParams.get("q") || "").trim();
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const items = await airtableList(env, env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS", {
          q,
          limit,
          matchFields: ["Client Name", "nickname", "memberstack_id", "line_display_name", "email", "Phone Number", "line_user_id"],
        });

        return withCors(req, env, json({ ok: true, items }));
      }

      // POST /v1/admin/clients/lineage-lookup
      if (method === "POST" && path === "/v1/admin/clients/lineage-lookup") {
        const body = await safeJson(req);
        const q = str(body?.query || body?.q || body?.search);
        const limit = clampInt(body?.limit, 1, 50, 12);
        const clients = await listAdminClientLineage(env, { q, limit });
        return withCors(req, env, json({ ok: true, clients, items: clients, data: clients }));
      }

      // GET /v1/admin/clients/recent
      if (method === "GET" && path === "/v1/admin/clients/recent") {
        const q = str(url.searchParams.get("q"));
        const limit = clampInt(url.searchParams.get("limit"), 1, 50, 12);
        const clients = await listAdminClientLineage(env, { q, limit });
        return withCors(req, env, json({ ok: true, clients, items: clients, data: clients }));
      }

      // POST /v1/admin/members/update
      if (method === "POST" && path === "/v1/admin/members/update") {
        const body = await safeJson(req);
        const out = await airtableUpdateByIdOrField(env, env.AIRTABLE_TABLE_MEMBERS || "members", body, {
          idField: "id",
          lookupField: "memberstack_id",
          patchField: "patch",
        });
        return withCors(req, env, json({ ok: true, updated: out }));
      }

      // POST /v1/admin/members/draft
      if (method === "POST" && path === "/v1/admin/members/draft") {
        const body = await safeJson(req);
        try {
          const record = await createDraftMember(env, body || {});
          return withCors(req, env, json({ ok: true, item: record }));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // POST /v1/admin/members/promote-immigration
      if (method === "POST" && path === "/v1/admin/members/promote-immigration") {
        const body = await safeJson(req);
        try {
          const out = await promoteImmigrationMember(env, body || {});
          return withCors(req, env, json({ ok: true, data: out }));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // POST /v1/admin/telegram/dm
      if (method === "POST" && path === "/v1/admin/telegram/dm") {
        const body = await safeJson(req);
        const r = await telegramInternalSend(env, body);
        return withCors(req, env, json({ ok: true, telegram: r }, r.ok ? 200 : 502));
      }

      // POST /v1/admin/referrals/activate
      if (method === "POST" && path === "/v1/admin/referrals/activate") {
        const body = await safeJson(req);
        try {
          const result = await enforceSingleActiveReferral(env, {
            referral_id: str(body.referral_id || body.record_id),
            model_id: str(body.model_id || body.model_record_id),
            transfer_existing: Boolean(body.transfer_existing),
            actor:
              str(body.actor || body.approved_by) ||
              str(req.headers.get("X-Admin-Actor") || "") ||
              "admin-worker",
            approved_at: body.approved_at,
          });
          return withCors(req, env, json(result));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 409)
          );
        }
      }

      // POST /v1/admin/commissions/state
      if (method === "POST" && path === "/v1/admin/commissions/state") {
        const body = await safeJson(req);
        try {
          const result = await updateCommissionState(env, {
            commission_key: str(body.commission_key),
            action: str(body.action),
            actor:
              str(body.actor || body.approved_by || body.paid_by) ||
              str(req.headers.get("X-Admin-Actor") || "") ||
              "admin-worker",
            approved_at: body.approved_at,
            paid_at: body.paid_at,
            payout_reference: body.payout_reference,
            held_reason: body.held_reason,
            void_reason: body.void_reason,
          });
          return withCors(req, env, json(result));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // GET /v1/admin/models/list
      if (method === "GET" && path === "/v1/admin/models/list") {
        const q = (url.searchParams.get("q") || "").trim();
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const items = await airtableList(env, env.AIRTABLE_TABLE_MODELS || "models", {
          q,
          limit,
          matchFields: ["name", "nickname", "telegram_username", "telegram_id", "unique_key"],
        });

        return withCors(req, env, json({ ok: true, items }));
      }

      // GET /v1/admin/models/search
      if (method === "GET" && path === "/v1/admin/models/search") {
        const q = (url.searchParams.get("q") || "").trim();
        const limit = clampInt(url.searchParams.get("limit"), 1, 50, 12);

        const items = await airtableList(env, env.AIRTABLE_TABLE_MODELS || "models", {
          q,
          limit,
          matchFields: ["name", "nickname", "telegram_username", "telegram_id", "unique_key"],
        });

        return withCors(req, env, json({ ok: true, items }));
      }

      // GET /v1/admin/models/search
      if (method === "GET" && path === "/v1/admin/models/search") {
        const q = (url.searchParams.get("q") || "").trim();
        const limit = clampInt(url.searchParams.get("limit"), 1, 50, 12);
        const items = await searchAdminModels(env, { q, limit });
        return withCors(req, env, json({ ok: true, items }));
      }

      // GET /v1/admin/models/resolve-source
      if (method === "GET" && path === "/v1/admin/models/resolve-source") {
        const q = str(url.searchParams.get("q"));
        const sourceOwner = str(url.searchParams.get("source_owner")) || str(env.MODEL_SOURCE_OWNER_DEFAULT || "lonelysomething");
        const categoryPath = str(url.searchParams.get("category_path"));
        try {
          const payload = await resolveModelSource(env, { q, sourceOwner, categoryPath });
          return withCors(req, env, json(payload));
        } catch (error) {
          return withCors(req, env, json({ ok: false, error: String(error?.message || error) }, 400));
        }
      }

      // POST /v1/admin/models/stage-from-source
      if (method === "POST" && path === "/v1/admin/models/stage-from-source") {
        const body = await safeJson(req);
        try {
          const payload = await stageModelFromSource(env, body || {});
          return withCors(req, env, json(payload, payload.ok ? 200 : 400));
        } catch (error) {
          return withCors(req, env, json({ ok: false, error: String(error?.message || error) }, 400));
        }
      }

      const modelFolderMatch = path.match(/^\/v1\/admin\/models\/([^/]+)\/folder$/);
      if (method === "GET" && modelFolderMatch) {
        try {
          const payload = await getAdminModelFolder(
            env,
            decodeURIComponent(modelFolderMatch[1]),
            str(url.searchParams.get("package_tier"))
          );
          return withCors(req, env, json(payload));
        } catch (error) {
          return withCors(req, env, json({ ok: false, error: String(error?.message || error) }, 400));
        }
      }

      const resolveFolderMatch = path.match(/^\/v1\/admin\/models\/([^/]+)\/resolve-folder$/);
      if (method === "POST" && resolveFolderMatch) {
        try {
          const body = await safeJson(req);
          const payload = await resolveAdminModelFolder(
            env,
            decodeURIComponent(resolveFolderMatch[1]),
            str(body?.package_tier || url.searchParams.get("package_tier"))
          );
          return withCors(req, env, json(payload));
        } catch (error) {
          return withCors(req, env, json({ ok: false, error: String(error?.message || error) }, 400));
        }
      }

      const patchFolderMatch = path.match(/^\/v1\/admin\/models\/([^/]+)\/folder$/);
      if (method === "PATCH" && patchFolderMatch) {
        const body = await safeJson(req);
        try {
          const payload = await patchAdminModelFolder(
            env,
            decodeURIComponent(patchFolderMatch[1]),
            body || {},
            req
          );
          return withCors(req, env, json(payload));
        } catch (error) {
          return withCors(req, env, json({ ok: false, error: String(error?.message || error) }, 400));
        }
      }

      // GET /v1/admin/notes/context
      if (method === "GET" && path === "/v1/admin/notes/context") {
        const clientId = str(url.searchParams.get("client_id"));
        const modelId = str(url.searchParams.get("model_id"));
        try {
          const context = await buildNotesHubContext(env, { clientId, modelId });
          return withCors(req, env, json({ ok: true, ...context }));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // POST /v1/admin/models/draft
      if (method === "POST" && path === "/v1/admin/models/draft") {
        const body = await safeJson(req);
        try {
          const record = await createDraftModel(env, body || {});
          return withCors(req, env, json({ ok: true, item: record }));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // GET|HEAD /v1/admin/jobs/create-session
      if (method === "GET" || method === "HEAD") {
        if (path === "/v1/admin/jobs/create-session") {
          return withCors(req, env, renderCreateSessionRebuiltPage(method));
        }
      }

      // POST /v1/admin/jobs/create-session
      if (
        method === "POST" &&
        (path === "/v1/admin/jobs/create-session" || path === "/v1/admin/create-session")
      ) {
        const body = await safeJson(req);
        try {
          const out = await createAdminSession(env, body || {});
          return withCors(req, env, json({ ok: true, ...out }));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // POST /v1/admin/jobs/create-job
      if (
        method === "POST" &&
        (path === "/v1/admin/jobs/create-job" ||
          path === "/v1/admin/create-job" ||
          path === "/v1/admin/job/create")
      ) {
        const body = await safeJson(req);
        try {
          const out = await createAdminJob(env, body || {}, req);
          return withCors(req, env, json({ ok: true, ...flattenCreateJobResponse(out) }));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // POST /v1/admin/job/draft
      if (method === "POST" && path === "/v1/admin/job/draft") {
        const body = await safeJson(req);
        const draftId = str(body?.draft_id || body?.id) || `draft_${crypto.randomUUID()}`;
        return withCors(
          req,
          env,
          json({ ok: true, draft_id: draftId, saved_at: nowIso(), mode: "stateless_ack" })
        );
      }

      // POST /v1/admin/line/push
      if (method === "POST" && path === "/v1/admin/line/push") {
        const body = await safeJson(req);
        const message = str(body?.message || body?.text || body?.copy_text);
        const lineUserId = str(body?.line_user_id || body?.to);
        if (!message) {
          return withCors(req, env, json({ ok: false, error: "missing_message" }, 400));
        }
        const result = await maybePushLineJob(
          env,
          {
            push_line: true,
            line_user_id: lineUserId,
            raw: body || {},
          },
          { copy_text: message }
        );
        return withCors(
          req,
          env,
          json(
            {
              ok: Boolean(result.ok),
              line_push_status: result.ok ? "sent" : result.mode || "copy_ready",
              line: result,
            },
            result.ok ? 200 : result.attempted ? 502 : 400
          )
        );
      }

      // POST /v1/admin/models/upsert
      if (method === "POST" && path === "/v1/admin/models/upsert") {
        const body = await safeJson(req);
        const out = await airtableUpsertModel(env, env.AIRTABLE_TABLE_MODELS || "models", body);
        return withCors(req, env, json({ ok: true, model: out }));
      }

      return withCors(req, env, json({ ok: false, error: "not_found" }, 404));
    }

    return withCors(req, env, json({ ok: false, error: "not_found" }, 404));
  },
};

/* =========================
   CORS
========================= */
function getAllowedOrigins(env) {
  const raw = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(raw);
}

function renderSigilPayRenewalPage(req, env) {
  const isHead = req.method.toUpperCase() === "HEAD";
  const turnstileSiteKey = str(env.TURNSTILE_SITE_KEY || SIGIL_RENEWAL_TURNSTILE_SITE_KEY);
  const turnstileEnabled = Boolean(turnstileSiteKey);
  const config = {
    endpoint: SIGIL_PAY_RENEWAL_PROOF_PATH,
    turnstileSiteKey,
    turnstileEnabled,
    maxFileBytes: 12 * 1024 * 1024,
  };
  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Renew Membership | SĪGIL</title>
  <meta name="description" content="ต่ออายุสมาชิก SĪGIL โดยส่งสลิปให้ทีมตรวจสอบยอดจริง">
  <style>
    .mmd-renewal-final-root {
      min-height: 100vh;
      background:
        radial-gradient(circle at 72% 6%, rgba(206, 168, 91, .20), transparent 28rem),
        linear-gradient(145deg, #090806 0%, #14110d 46%, #050505 100%);
      color: #f7efe0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .mmd-renewal-final-shell { width: min(1160px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 44px; }
    .mmd-renewal-final-hero { display: grid; gap: 26px; align-items: center; padding: 20px 0 18px; }
    .mmd-renewal-final-logo { width: 112px; height: auto; display: block; margin-bottom: 20px; }
    .mmd-renewal-final-kicker { margin: 0 0 10px; color: #d8b76d; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .mmd-renewal-final-title { margin: 0; font-size: clamp(42px, 8vw, 82px); line-height: .95; letter-spacing: 0; color: #fff8ea; }
    .mmd-renewal-final-lead { max-width: 720px; margin: 18px 0 0; color: #e9dcc5; font-size: 17px; line-height: 1.75; }
    .mmd-renewal-final-check { color: #f2dcae; font-size: 13px; line-height: 1.7; margin: 4px 0 0; }
    .mmd-renewal-final-hero-visual { position: relative; min-height: 360px; border: 1px solid rgba(226, 187, 104, .20); border-radius: 8px; overflow: hidden; background: linear-gradient(160deg, rgba(42, 31, 19, .74), rgba(8, 8, 8, .92)); }
    .mmd-renewal-final-kenji { width: 100%; height: 420px; object-fit: cover; object-position: center top; display: block; opacity: .96; }
    .mmd-renewal-final-note { position: absolute; left: 14px; right: 14px; bottom: 14px; padding: 14px 15px; border: 1px solid rgba(244, 215, 151, .22); border-radius: 8px; background: rgba(8, 7, 6, .78); backdrop-filter: blur(12px); color: #f7e9c9; font-size: 14px; line-height: 1.65; }
    .mmd-renewal-final-steps { display: grid; gap: 10px; margin: 16px 0 24px; }
    .mmd-renewal-final-step { padding: 13px 14px; border: 1px solid rgba(214, 179, 101, .18); border-radius: 8px; background: rgba(255, 255, 255, .045); color: #f1dfb6; font-weight: 700; }
    .mmd-renewal-final-layout { display: grid; gap: 18px; }
    .mmd-renewal-final-panel { border: 1px solid rgba(214, 179, 101, .18); border-radius: 8px; background: rgba(12, 11, 9, .78); box-shadow: 0 24px 70px rgba(0, 0, 0, .28); }
    .mmd-renewal-final-panel-inner { padding: 18px; }
    .mmd-renewal-final-heading { margin: 0 0 12px; font-size: 20px; line-height: 1.25; color: #fff4dc; letter-spacing: 0; }
    .mmd-renewal-final-muted { margin: 0; color: #c9bda8; font-size: 14px; line-height: 1.65; }
    .mmd-renewal-final-options { display: grid; gap: 10px; }
    .mmd-renewal-final-option { width: 100%; min-height: 88px; padding: 14px; border: 1px solid rgba(255, 255, 255, .10); border-radius: 8px; background: rgba(255, 255, 255, .035); color: #f4ead9; text-align: left; cursor: pointer; transition: border-color .2s ease, background .2s ease, transform .2s ease; }
    .mmd-renewal-final-option:hover, .mmd-renewal-final-option.is-active { border-color: rgba(222, 180, 93, .72); background: rgba(222, 180, 93, .10); transform: translateY(-1px); }
    .mmd-renewal-final-option strong { display: block; margin-bottom: 5px; color: #fff7e8; font-size: 15px; line-height: 1.25; }
    .mmd-renewal-final-option span { display: block; color: #cdbf9f; font-size: 13px; line-height: 1.55; }
    .mmd-renewal-final-detail-list { display: grid; gap: 8px; margin-top: 12px; }
    .mmd-renewal-final-detail-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, .08); color: #f2e7d1; font-size: 14px; line-height: 1.45; }
    .mmd-renewal-final-detail-row span:first-child { color: #b9ad98; }
    .mmd-renewal-final-actions { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 15px; }
    .mmd-renewal-final-link { display: inline-flex; min-height: 46px; align-items: center; justify-content: center; padding: 0 16px; border-radius: 8px; border: 1px solid rgba(226, 187, 104, .45); color: #18120a; background: linear-gradient(135deg, #f3d48b, #c8973d); font-size: 14px; font-weight: 800; text-decoration: none; }
    .mmd-renewal-final-link-secondary { color: #f3dfb3; background: rgba(255, 255, 255, .04); }
    .mmd-renewal-final-form { display: grid; gap: 13px; margin-top: 14px; }
    .mmd-renewal-final-field { display: grid; gap: 7px; }
    .mmd-renewal-final-label { color: #e8d8b9; font-size: 13px; font-weight: 700; }
    .mmd-renewal-final-input, .mmd-renewal-final-textarea { width: 100%; box-sizing: border-box; border: 1px solid rgba(255, 255, 255, .13); border-radius: 8px; background: rgba(255, 255, 255, .055); color: #fff8ec; font: inherit; font-size: 15px; line-height: 1.4; padding: 12px 13px; outline: none; }
    .mmd-renewal-final-input:focus, .mmd-renewal-final-textarea:focus { border-color: rgba(226, 187, 104, .78); box-shadow: 0 0 0 3px rgba(226, 187, 104, .10); }
    .mmd-renewal-final-textarea { min-height: 92px; resize: vertical; }
    .mmd-renewal-final-upload { position: relative; display: grid; place-items: center; min-height: 112px; padding: 14px; border: 1px dashed rgba(226, 187, 104, .45); border-radius: 8px; background: rgba(226, 187, 104, .055); color: #efdfbd; text-align: center; cursor: pointer; }
    .mmd-renewal-final-file { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .mmd-renewal-final-consent { display: flex; gap: 10px; align-items: flex-start; color: #e8dbc0; font-size: 14px; line-height: 1.65; }
    .mmd-renewal-final-consent input { margin-top: 5px; accent-color: #d7aa50; }
    .mmd-renewal-final-turnstile { min-height: 70px; }
    .mmd-renewal-final-turnstile.is-hidden { display: none; }
    .mmd-renewal-final-submit { min-height: 52px; border: 0; border-radius: 8px; background: linear-gradient(135deg, #f6d990, #bd842e); color: #140f08; cursor: pointer; font-size: 15px; font-weight: 900; }
    .mmd-renewal-final-submit:disabled { opacity: .64; cursor: wait; }
    .mmd-renewal-final-status { display: none; margin-top: 14px; padding: 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, .12); color: #f5e6c7; font-size: 14px; line-height: 1.65; }
    .mmd-renewal-final-status.is-visible { display: block; }
    .mmd-renewal-final-status.is-success { border-color: rgba(111, 210, 154, .34); background: rgba(111, 210, 154, .09); }
    .mmd-renewal-final-status.is-warning { border-color: rgba(226, 187, 104, .34); background: rgba(226, 187, 104, .09); }
    .mmd-renewal-final-status.is-error { border-color: rgba(232, 117, 117, .38); background: rgba(232, 117, 117, .10); }
    .mmd-renewal-final-status strong { display: block; margin-bottom: 4px; color: #fff4df; font-size: 15px; }
    @media (min-width: 720px) {
      .mmd-renewal-final-steps, .mmd-renewal-final-options, .mmd-renewal-final-actions { grid-template-columns: repeat(3, 1fr); }
      .mmd-renewal-final-actions { grid-template-columns: repeat(2, 1fr); }
      .mmd-renewal-final-form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 13px; }
    }
    @media (min-width: 980px) {
      .mmd-renewal-final-shell { padding-top: 42px; }
      .mmd-renewal-final-hero { grid-template-columns: minmax(0, 1.05fr) minmax(340px, .75fr); }
      .mmd-renewal-final-layout { grid-template-columns: minmax(0, .92fr) minmax(520px, 1.08fr); align-items: start; }
      .mmd-renewal-final-panel-inner { padding: 22px; }
    }
  </style>
  ${turnstileEnabled ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>' : ""}
</head>
<body>
  <main class="mmd-renewal-final-root" data-mmd-renewal-final data-build="${SIGIL_PAY_RENEWAL_BUILD}">
    <div class="mmd-renewal-final-shell">
      <section class="mmd-renewal-final-hero" aria-labelledby="mmd-renewal-final-title">
        <div>
          <img class="mmd-renewal-final-logo" src="${SIGIL_RENEWAL_LOGO_IMAGE}" alt="SĪGIL logo">
          <p class="mmd-renewal-final-kicker">SĪGIL Renewal</p>
          <h1 id="mmd-renewal-final-title" class="mmd-renewal-final-title">Renew Membership</h1>
          <p class="mmd-renewal-final-lead">ต่ออายุสมาชิกง่าย ๆ ใน 3 ขั้นตอน: เลือกประเภทสมาชิก เลือกวิธีชำระเงิน แล้วส่งสลิปให้ทีมตรวจสอบ</p>
          <p class="mmd-renewal-final-check">ส่งสลิป = แจ้งว่าชำระแล้ว ยังไม่ใช่การยืนยันสำเร็จทันที ต่ออายุสำเร็จหลังทีมตรวจยอดเข้าจริงแล้วเท่านั้น</p>
        </div>
        <div class="mmd-renewal-final-hero-visual">
          <img class="mmd-renewal-final-kenji" src="${SIGIL_RENEWAL_KENJI_IMAGE}" alt="Kenji, SĪGIL renewal assistant">
          <div class="mmd-renewal-final-note">ผมจะช่วยพาคุณส่งข้อมูลให้ครบครับ ข้อมูลที่สำคัญคือชื่อที่ใช้ในระบบ ช่องทางติดต่อ ยอดที่โอน วันเวลา และสลิปที่ชัดเจน</div>
        </div>
      </section>

      <div class="mmd-renewal-final-steps" aria-label="Renewal steps">
        <div class="mmd-renewal-final-step">1. เลือกประเภทสมาชิก</div>
        <div class="mmd-renewal-final-step">2. เลือกวิธีชำระเงิน</div>
        <div class="mmd-renewal-final-step">3. ส่งสลิปให้ทีมตรวจสอบ</div>
      </div>

      <div class="mmd-renewal-final-layout">
        <div class="mmd-renewal-final-panel">
          <div class="mmd-renewal-final-panel-inner">
            <h2 class="mmd-renewal-final-heading">เลือกประเภทสมาชิก</h2>
            <div class="mmd-renewal-final-options" data-mmd-renewal-packages>
              <button class="mmd-renewal-final-option is-active" type="button" data-renewal-value="standard"><strong>Standard</strong><span>ต่ออายุพื้นฐานสำหรับสมาชิกที่ต้องการใช้ระบบตามปกติ</span></button>
              <button class="mmd-renewal-final-option" type="button" data-renewal-value="vip"><strong>VIP</strong><span>สำหรับสมาชิกที่ต้องการลำดับดูแลและคำแนะนำที่มากขึ้น</span></button>
              <button class="mmd-renewal-final-option" type="button" data-renewal-value="black_card_private_access"><strong>Black Card / Private Access</strong><span>ชั้นเข้าถึงส่วนตัว ทีมจะตรวจสอบอย่างระมัดระวัง</span></button>
            </div>

            <h2 class="mmd-renewal-final-heading" style="margin-top:22px">เลือกวิธีชำระเงิน</h2>
            <div class="mmd-renewal-final-options" data-mmd-renewal-methods>
              <button class="mmd-renewal-final-option is-active" type="button" data-renewal-value="promptpay_bank_transfer"><strong>PromptPay / Bank Transfer</strong><span>โอนผ่านบัญชีหรือพร้อมเพย์ แล้วอัปโหลดสลิป</span></button>
              <button class="mmd-renewal-final-option" type="button" data-renewal-value="credit_card"><strong>Credit Card</strong><span>ชำระผ่าน PayPal / Card อาจมีค่าบริการเพิ่มเติม</span></button>
              <button class="mmd-renewal-final-option" type="button" data-renewal-value="admin_confirmed_amount"><strong>Admin Confirmed Amount</strong><span>ใช้เมื่อทีมแจ้งยอดเฉพาะให้คุณแล้ว</span></button>
            </div>

            <h2 class="mmd-renewal-final-heading" style="margin-top:22px">ข้อมูลชำระเงิน</h2>
            <p class="mmd-renewal-final-muted">ตรวจสอบชื่อบัญชีและยอดก่อนโอนทุกครั้ง หลังส่งสลิป ทีมตรวจสอบยอดจริงก่อนอัปเดตสถานะสมาชิก</p>
            <div class="mmd-renewal-final-detail-list">
              <div class="mmd-renewal-final-detail-row"><span>Bank</span><strong>${SIGIL_BANK_NAME}</strong></div>
              <div class="mmd-renewal-final-detail-row"><span>Account name</span><strong>${SIGIL_BANK_ACCOUNT_NAME}</strong></div>
              <div class="mmd-renewal-final-detail-row"><span>Account number</span><strong>${SIGIL_BANK_ACCOUNT_NUMBER}</strong></div>
              <div class="mmd-renewal-final-detail-row"><span>PromptPay</span><strong>082-952-8889</strong></div>
              <div class="mmd-renewal-final-detail-row"><span>Card note</span><strong>ชำระผ่านบัตรอาจมีค่าบริการเพิ่มเติมประมาณ 4%+</strong></div>
            </div>
            <div class="mmd-renewal-final-actions">
              <a class="mmd-renewal-final-link" href="${SIGIL_PROMPTPAY_URL}" target="_blank" rel="noopener">PromptPay</a>
              <a class="mmd-renewal-final-link mmd-renewal-final-link-secondary" href="${SIGIL_PAYPAL_URL}" target="_blank" rel="noopener">PayPal / Card</a>
            </div>
          </div>
        </div>

        <div class="mmd-renewal-final-panel">
          <div class="mmd-renewal-final-panel-inner">
            <h2 class="mmd-renewal-final-heading">ส่งสลิป / หลักฐาน</h2>
            <p class="mmd-renewal-final-muted">ทีมตรวจสอบยอดจริงจากข้อมูลที่คุณส่งเข้ามา กรุณากรอกให้ตรงกับสลิปมากที่สุด</p>
            <form class="mmd-renewal-final-form" data-mmd-renewal-form enctype="multipart/form-data" novalidate>
              <input type="hidden" name="payment_type" value="renewal">
              <input type="hidden" name="session_id" data-mmd-renewal-session-id>
              <input type="hidden" name="payment_ref" data-mmd-renewal-payment-ref>
              <input type="hidden" name="transaction_ref" data-mmd-renewal-transaction-ref>
              <input type="hidden" name="selected_package" value="standard" data-mmd-renewal-selected-package>
              <input type="hidden" name="payment_method" value="promptpay_bank_transfer" data-mmd-renewal-payment-method>
              <input type="hidden" name="cf_turnstile_response" data-mmd-renewal-turnstile-token>

              <div class="mmd-renewal-final-form-grid">
                <label class="mmd-renewal-final-field"><span class="mmd-renewal-final-label">ชื่อ / ชื่อเล่นที่ใช้ในระบบ</span><input class="mmd-renewal-final-input" name="display_name" autocomplete="name" required></label>
                <label class="mmd-renewal-final-field"><span class="mmd-renewal-final-label">ช่องทางติดต่อ</span><input class="mmd-renewal-final-input" name="contact_id" autocomplete="email" required></label>
                <label class="mmd-renewal-final-field"><span class="mmd-renewal-final-label">ยอดที่ชำระจริง</span><input class="mmd-renewal-final-input" name="amount_paid" inputmode="decimal" placeholder="เช่น 3000" required></label>
                <label class="mmd-renewal-final-field"><span class="mmd-renewal-final-label">วันและเวลาที่ชำระ</span><input class="mmd-renewal-final-input" name="paid_at" type="datetime-local" required></label>
              </div>

              <label class="mmd-renewal-final-field"><span class="mmd-renewal-final-label">หมายเหตุ package</span><input class="mmd-renewal-final-input" name="package_note" placeholder="ถ้ามีทีมแจ้งยอดเฉพาะ ใส่รายละเอียดตรงนี้"></label>
              <label class="mmd-renewal-final-field"><span class="mmd-renewal-final-label">หมายเหตุสำหรับทีมตรวจสอบ</span><textarea class="mmd-renewal-final-textarea" name="verification_note" placeholder="เช่น โอนจากชื่อบัญชีอื่น หรือแบ่งชำระ"></textarea></label>

              <label class="mmd-renewal-final-upload"><span data-mmd-renewal-upload-label>อัปโหลดสลิป / receipt ขนาดไม่เกิน 12MB</span><input class="mmd-renewal-final-file" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required data-mmd-renewal-file></label>

              <div class="mmd-renewal-final-turnstile${turnstileEnabled ? "" : " is-hidden"}" data-mmd-renewal-turnstile><div data-mmd-renewal-turnstile-widget></div></div>

              <label class="mmd-renewal-final-consent"><input type="checkbox" data-mmd-renewal-consent required><span>ฉันเข้าใจว่าการส่งสลิปยังไม่ใช่การยืนยันสำเร็จ และการต่ออายุจะเสร็จหลังจากทีมตรวจยอดจริงแล้วเท่านั้น</span></label>

              <button class="mmd-renewal-final-submit" type="submit" data-mmd-renewal-submit>ส่งสลิปให้ทีมตรวจสอบ</button>
              <div class="mmd-renewal-final-status" data-mmd-renewal-status role="status" aria-live="polite"></div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </main>
  <script>
  (function () {
    var root = document.querySelector("[data-mmd-renewal-final]");
    if (!root) return;
    var CONFIG = ${JSON.stringify(config)};
    var form = root.querySelector("[data-mmd-renewal-form]");
    var submit = root.querySelector("[data-mmd-renewal-submit]");
    var statusBox = root.querySelector("[data-mmd-renewal-status]");
    var fileInput = root.querySelector("[data-mmd-renewal-file]");
    var uploadLabel = root.querySelector("[data-mmd-renewal-upload-label]");
    var consent = root.querySelector("[data-mmd-renewal-consent]");
    var turnstileTokenInput = root.querySelector("[data-mmd-renewal-turnstile-token]");
    var turnstileWidgetId = null;
    var turnstileToken = "";

    function tokenPart() {
      var bytes = new Uint8Array(8);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
      else for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      return Array.prototype.map.call(bytes, function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    }
    function renewalRef(prefix) { return prefix + "_" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "_" + tokenPart(); }
    function setHidden(selector, value) { var node = root.querySelector(selector); if (node) node.value = value; }
    function escapeHtml(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
    function setStatus(kind, title, text) { statusBox.className = "mmd-renewal-final-status is-visible is-" + kind; statusBox.innerHTML = "<strong>" + escapeHtml(title) + "</strong>" + escapeHtml(text); }
    function clearStatus() { statusBox.className = "mmd-renewal-final-status"; statusBox.textContent = ""; }
    function activeOption(groupSelector, hiddenSelector) {
      var group = root.querySelector(groupSelector);
      var hidden = root.querySelector(hiddenSelector);
      if (!group || !hidden) return;
      group.addEventListener("click", function (event) {
        var option = event.target.closest("[data-renewal-value]");
        if (!option || !group.contains(option)) return;
        Array.prototype.forEach.call(group.querySelectorAll("[data-renewal-value]"), function (node) { node.classList.toggle("is-active", node === option); });
        hidden.value = option.getAttribute("data-renewal-value") || "";
      });
    }
    function readErrorCode(payload) {
      if (!payload) return "";
      if (typeof payload.error === "string") return payload.error;
      if (payload.error && payload.error.code) return payload.error.code;
      return payload.code || "";
    }
    function getErrorMessage(code) {
      var map = {
        validation_failed: "กรุณากรอกข้อมูลที่จำเป็นให้ครบครับ",
        required_fields_missing: "กรุณากรอกข้อมูลที่จำเป็นให้ครบครับ",
        missing_required_fields: "กรุณากรอกข้อมูลที่จำเป็นให้ครบครับ",
        file_missing: "กรุณาแนบสลิป / หลักฐานก่อนส่งครับ",
        proof_missing: "กรุณาแนบสลิป / หลักฐานก่อนส่งครับ",
        turnstile_required: "กรุณายืนยัน Turnstile ก่อนส่งครับ",
        turnstile_token_missing: "กรุณายืนยัน Turnstile ก่อนส่งครับ",
        turnstile_failed: "Turnstile ไม่ผ่าน กรุณาลองใหม่อีกครั้งครับ",
        turnstile_verification_failed: "Turnstile ไม่ผ่าน กรุณาลองใหม่อีกครั้งครับ",
        turnstile_unconfigured: "ระบบป้องกันบอทยังไม่พร้อม กรุณาติดต่อทีมครับ",
        duplicate_payment_ref: "รายการนี้เคยถูกส่งแล้วครับ",
        duplicate: "รายการนี้เคยถูกส่งแล้วครับ"
      };
      return map[code] || "ระบบส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้งครับ";
    }
    function validateForm() {
      var required = [["display_name", "กรุณากรอกชื่อ / ชื่อเล่นที่ใช้ในระบบครับ"], ["contact_id", "กรุณากรอกช่องทางติดต่อครับ"], ["amount_paid", "กรุณากรอกยอดที่ชำระจริงครับ"], ["paid_at", "กรุณาใส่วันและเวลาที่ชำระครับ"]];
      for (var i = 0; i < required.length; i += 1) {
        var field = form.elements[required[i][0]];
        if (!field || !String(field.value || "").trim()) { setStatus("error", "ข้อมูลยังไม่ครบ", required[i][1]); if (field && field.focus) field.focus(); return false; }
      }
      var file = fileInput && fileInput.files ? fileInput.files[0] : null;
      if (!file) { setStatus("error", "ยังไม่ได้แนบสลิป", "กรุณาแนบสลิป / หลักฐานก่อนส่งครับ"); return false; }
      if (file.size > CONFIG.maxFileBytes) { setStatus("error", "ไฟล์ใหญ่เกินไป", "กรุณาใช้ไฟล์ขนาดไม่เกิน 12MB ครับ"); return false; }
      if (CONFIG.turnstileEnabled && !turnstileToken) { setStatus("error", "ยังไม่ได้ยืนยัน Turnstile", "กรุณายืนยัน Turnstile ก่อนส่งครับ"); return false; }
      if (!consent || !consent.checked) { setStatus("error", "กรุณายืนยันความเข้าใจ", "ต้องยืนยันก่อนว่าการส่งสลิปยังไม่ใช่การยืนยันสำเร็จทันทีครับ"); return false; }
      return true;
    }
    function resetTurnstile() {
      turnstileToken = "";
      if (turnstileTokenInput) turnstileTokenInput.value = "";
      if (CONFIG.turnstileEnabled && window.turnstile && turnstileWidgetId !== null) { try { window.turnstile.reset(turnstileWidgetId); } catch (_) {} }
    }
    function renderTurnstile() {
      if (!CONFIG.turnstileEnabled || !window.turnstile) return;
      var container = root.querySelector("[data-mmd-renewal-turnstile-widget]");
      if (!container || turnstileWidgetId !== null) return;
      turnstileWidgetId = window.turnstile.render(container, {
        sitekey: CONFIG.turnstileSiteKey,
        callback: function (token) { turnstileToken = token; if (turnstileTokenInput) turnstileTokenInput.value = token; },
        "expired-callback": function () { resetTurnstile(); },
        "error-callback": function () { turnstileToken = ""; if (turnstileTokenInput) turnstileTokenInput.value = ""; }
      });
    }

    setHidden("[data-mmd-renewal-session-id]", renewalRef("renewal_session"));
    setHidden("[data-mmd-renewal-payment-ref]", renewalRef("renewal_pay"));
    setHidden("[data-mmd-renewal-transaction-ref]", renewalRef("renewal_txn"));
    activeOption("[data-mmd-renewal-packages]", "[data-mmd-renewal-selected-package]");
    activeOption("[data-mmd-renewal-methods]", "[data-mmd-renewal-payment-method]");
    if (fileInput) fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) { uploadLabel.textContent = "อัปโหลดสลิป / receipt ขนาดไม่เกิน 12MB"; return; }
      uploadLabel.textContent = file.name + " (" + Math.ceil(file.size / 1024) + " KB)";
      if (file.size > CONFIG.maxFileBytes) setStatus("error", "ไฟล์ใหญ่เกินไป", "กรุณาใช้ไฟล์ขนาดไม่เกิน 12MB ครับ");
      else clearStatus();
    });
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearStatus();
      if (!validateForm()) return;
      submit.disabled = true;
      submit.textContent = "กำลังส่งข้อมูล...";
      if (turnstileTokenInput) turnstileTokenInput.value = turnstileToken;
      try {
        var data = new FormData(form);
        data.set("cf_turnstile_response", turnstileToken);
        var response = await fetch(CONFIG.endpoint, { method: "POST", body: data, credentials: "same-origin" });
        var payload = await response.json().catch(function () { return {}; });
        if (payload && payload.duplicate) { setStatus("warning", "รายการนี้เคยถูกส่งแล้วครับ", "สถานะยังอยู่ระหว่างรอตรวจสอบยอดจริง ไม่จำเป็นต้องส่งซ้ำถ้าข้อมูลเดิมถูกต้อง"); resetTurnstile(); return; }
        if (!response.ok || !payload || payload.ok === false) throw new Error(getErrorMessage(readErrorCode(payload)));
        setStatus("success", "ทีมได้รับข้อมูลแล้ว รอตรวจสอบยอดจริงครับ", "ถ้าข้อมูลตรงกับยอดที่เข้าจริง ทีมจะอัปเดตสถานะสมาชิกและแจ้งกลับผ่านช่องทางที่คุณให้ไว้");
        form.reset();
        uploadLabel.textContent = "อัปโหลดสลิป / receipt ขนาดไม่เกิน 12MB";
        setHidden("[data-mmd-renewal-session-id]", renewalRef("renewal_session"));
        setHidden("[data-mmd-renewal-payment-ref]", renewalRef("renewal_pay"));
        setHidden("[data-mmd-renewal-transaction-ref]", renewalRef("renewal_txn"));
        setHidden("[data-mmd-renewal-selected-package]", "standard");
        setHidden("[data-mmd-renewal-payment-method]", "promptpay_bank_transfer");
        Array.prototype.forEach.call(root.querySelectorAll("[data-mmd-renewal-packages] [data-renewal-value]"), function (node, index) { node.classList.toggle("is-active", index === 0); });
        Array.prototype.forEach.call(root.querySelectorAll("[data-mmd-renewal-methods] [data-renewal-value]"), function (node, index) { node.classList.toggle("is-active", index === 0); });
        resetTurnstile();
      } catch (error) {
        setStatus("error", "ส่งข้อมูลไม่สำเร็จ", error && error.message ? error.message : "network/server error");
        resetTurnstile();
      } finally {
        submit.disabled = false;
        submit.textContent = "ส่งสลิปให้ทีมตรวจสอบ";
      }
    });
    if (CONFIG.turnstileEnabled) {
      var timer = setInterval(function () { if (window.turnstile) { clearInterval(timer); renderTurnstile(); } }, 200);
    }
  })();
  </script>
</body>
</html>`;

  return new Response(isHead ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderPaymentReviewConsolePage(req, method = "GET") {
  const isHead = method === "HEAD";
  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payment Review Console</title>
  <style>
    .mmd-review-page,
    .mmd-review-page * {
      box-sizing: border-box;
      letter-spacing: 0;
    }
    .mmd-review-page {
      min-height: 100vh;
      margin: 0;
      color: #f8efe1;
      background:
        radial-gradient(circle at 18% 8%, rgba(214, 170, 80, 0.22), transparent 28%),
        linear-gradient(135deg, #050505 0%, #15100b 54%, #060504 100%);
      font-family: Inter, "Noto Sans Thai", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .mmd-review-page a,
    .mmd-review-page button,
    .mmd-review-page input,
    .mmd-review-page select,
    .mmd-review-page textarea {
      font: inherit;
    }
    .mmd-review-shell {
      width: min(1180px, calc(100% - 28px));
      margin: 0 auto;
      padding: 28px 0 42px;
    }
    .mmd-review-hero {
      position: relative;
      overflow: hidden;
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
      gap: 24px;
      align-items: end;
      min-height: 420px;
      padding: clamp(26px, 5vw, 54px);
      border: 1px solid rgba(232, 190, 105, 0.28);
      border-radius: 18px;
      background:
        linear-gradient(90deg, rgba(4, 4, 4, 0.92), rgba(10, 8, 5, 0.78)),
        rgba(12, 10, 7, 0.82);
      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.44);
    }
    .mmd-review-hero::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(2, 2, 2, 0.92), rgba(2, 2, 2, 0.58) 50%, rgba(2, 2, 2, 0.88)),
        url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0f2cbc7e26b6735aee4cb2_SIGIL%20LOGO%20Transp.webp") right 8% center / min(34vw, 280px) auto no-repeat;
      opacity: 0.86;
      pointer-events: none;
    }
    .mmd-review-hero > * {
      position: relative;
      z-index: 1;
    }
    .mmd-review-kicker,
    .mmd-review-label {
      margin: 0;
      color: #d7ae62;
      font-size: 0.78rem;
      font-weight: 800;
      text-transform: uppercase;
    }
    .mmd-review-title {
      margin: 8px 0 0;
      max-width: 760px;
      color: #fff9ec;
      font-size: clamp(2.7rem, 8vw, 6rem);
      line-height: 0.92;
      font-weight: 900;
    }
    .mmd-review-thai-title {
      margin: 16px 0 0;
      color: #f2d392;
      font-size: clamp(1.25rem, 3vw, 2rem);
      line-height: 1.2;
      font-weight: 900;
    }
    .mmd-review-copy {
      max-width: 680px;
      margin: 14px 0 0;
      color: rgba(248, 239, 225, 0.82);
      font-size: 1rem;
      line-height: 1.8;
      white-space: pre-line;
    }
    .mmd-review-warning {
      margin-top: 18px;
      max-width: 720px;
      padding: 16px;
      border: 1px solid rgba(255, 194, 113, 0.28);
      border-radius: 10px;
      background: rgba(255, 181, 71, 0.08);
    }
    .mmd-review-warning h2 {
      margin: 0 0 8px;
      color: #ffd99b;
      font-size: 1rem;
    }
    .mmd-review-warning p {
      margin: 0;
      color: rgba(255, 242, 219, 0.9);
      line-height: 1.75;
      white-space: pre-line;
    }
    .mmd-review-status-grid,
    .mmd-review-kpi-grid {
      display: grid;
      gap: 12px;
    }
    .mmd-review-status-grid {
      align-content: end;
    }
    .mmd-review-status-item,
    .mmd-review-kpi-card,
    .mmd-review-queue,
    .mmd-review-policy-panel {
      border: 1px solid rgba(232, 190, 105, 0.18);
      border-radius: 10px;
      background: rgba(16, 13, 9, 0.76);
    }
    .mmd-review-status-item,
    .mmd-review-kpi-card {
      padding: 16px;
    }
    .mmd-review-value {
      margin: 5px 0 0;
      color: #fff7e7;
      font-size: 1rem;
      font-weight: 900;
    }
    .mmd-review-toolbar {
      display: grid;
      grid-template-columns: minmax(240px, 1fr) minmax(160px, 220px) minmax(160px, 220px) auto auto;
      gap: 10px;
      align-items: end;
      margin-top: 18px;
    }
    .mmd-review-field {
      display: grid;
      gap: 7px;
    }
    .mmd-review-field span {
      color: rgba(248, 239, 225, 0.72);
      font-size: 0.8rem;
      font-weight: 800;
    }
    .mmd-review-input,
    .mmd-review-select,
    .mmd-review-textarea {
      width: 100%;
      min-height: 44px;
      border: 1px solid rgba(232, 190, 105, 0.24);
      border-radius: 8px;
      padding: 10px 12px;
      color: #fff8ea;
      background: rgba(0, 0, 0, 0.34);
      outline: none;
    }
    .mmd-review-textarea {
      min-height: 94px;
      resize: vertical;
    }
    .mmd-review-button {
      min-height: 44px;
      border: 1px solid rgba(232, 190, 105, 0.34);
      border-radius: 8px;
      padding: 0 14px;
      color: #0d0a06;
      background: linear-gradient(180deg, #f3d58d, #b98733);
      font-weight: 900;
      cursor: pointer;
    }
    .mmd-review-button[disabled] {
      opacity: 0.62;
      cursor: wait;
    }
    .mmd-review-button-secondary {
      color: #f8efe1;
      background: rgba(255, 255, 255, 0.04);
    }
    .mmd-review-kpi-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-top: 14px;
    }
    .mmd-review-kpi-number {
      margin: 8px 0 0;
      color: #fff9ec;
      font-size: 1.8rem;
      font-weight: 900;
      line-height: 1;
    }
    .mmd-review-main-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
      gap: 14px;
      margin-top: 14px;
    }
    .mmd-review-queue,
    .mmd-review-policy-panel {
      padding: 18px;
    }
    .mmd-review-section-head {
      display: flex;
      gap: 12px;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .mmd-review-section-head h2,
    .mmd-review-policy-panel h2 {
      margin: 0;
      color: #fff6df;
      font-size: 1.05rem;
    }
    .mmd-review-empty {
      margin: 0;
      color: rgba(248, 239, 225, 0.7);
      line-height: 1.7;
    }
    .mmd-review-table-wrap {
      overflow-x: auto;
    }
    .mmd-review-table {
      width: 100%;
      min-width: 860px;
      border-collapse: collapse;
    }
    .mmd-review-table th,
    .mmd-review-table td {
      border-top: 1px solid rgba(232, 190, 105, 0.12);
      padding: 12px 10px;
      text-align: left;
      vertical-align: top;
    }
    .mmd-review-table th {
      color: #d7ae62;
      font-size: 0.78rem;
      text-transform: uppercase;
    }
    .mmd-review-table td {
      color: rgba(248, 239, 225, 0.86);
      font-size: 0.92rem;
    }
    .mmd-review-pill {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border: 1px solid rgba(232, 190, 105, 0.18);
      border-radius: 999px;
      padding: 0 9px;
      color: #f3d58d;
      background: rgba(232, 190, 105, 0.08);
      font-size: 0.78rem;
      font-weight: 800;
    }
    .mmd-review-proof-link {
      color: #f3d58d;
      font-weight: 900;
      text-decoration: none;
    }
    .mmd-review-policy-panel h3 {
      margin: 10px 0;
      color: #f3d58d;
      font-size: 1rem;
    }
    .mmd-review-policy-panel ol {
      margin: 0;
      padding-left: 20px;
      color: rgba(248, 239, 225, 0.82);
      line-height: 1.75;
    }
    .mmd-review-modal[hidden] {
      display: none;
    }
    .mmd-review-modal {
      position: fixed;
      inset: 0;
      z-index: 30;
      display: grid;
      place-items: center;
      padding: 18px;
    }
    .mmd-review-modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(8px);
    }
    .mmd-review-dialog {
      position: relative;
      z-index: 1;
      width: min(680px, 100%);
      max-height: calc(100vh - 36px);
      overflow: auto;
      border: 1px solid rgba(232, 190, 105, 0.26);
      border-radius: 14px;
      background: #0d0b08;
      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.62);
    }
    .mmd-review-dialog-inner {
      padding: 22px;
    }
    .mmd-review-modal-close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 36px;
      height: 36px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #fff7e7;
      background: rgba(255, 255, 255, 0.06);
      cursor: pointer;
    }
    .mmd-review-modal-title {
      margin: 5px 0 0;
      color: #fff7e7;
      font-size: 1.8rem;
    }
    .mmd-review-form-grid {
      display: grid;
      gap: 12px;
      margin-top: 18px;
    }
    .mmd-review-confirm {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      color: rgba(248, 239, 225, 0.84);
      line-height: 1.55;
    }
    .mmd-review-confirm input {
      width: 18px;
      height: 18px;
      margin-top: 2px;
      accent-color: #d6aa50;
    }
    .mmd-review-modal-note,
    .mmd-review-status-line {
      margin: 10px 0 0;
      color: rgba(248, 239, 225, 0.72);
      line-height: 1.65;
    }
    @media (max-width: 900px) {
      .mmd-review-hero,
      .mmd-review-main-grid,
      .mmd-review-toolbar,
      .mmd-review-kpi-grid {
        grid-template-columns: 1fr;
      }
      .mmd-review-shell {
        width: min(100% - 18px, 1180px);
        padding-top: 10px;
      }
    }
  </style>
</head>
<body class="mmd-review-page">
  <main class="mmd-review-shell">
    <section class="mmd-review-hero" aria-labelledby="mmd-review-title">
      <div>
        <p class="mmd-review-kicker">Payment Review Console</p>
        <h1 id="mmd-review-title" class="mmd-review-title">Payment Review Console</h1>
        <p class="mmd-review-thai-title">ตรวจรายการต่ออายุสมาชิก</p>
        <p class="mmd-review-copy">หน้านี้ใช้สำหรับตรวจหลักฐานการชำระเงินจากหน้า “ชำระเงิน”

ก่อนกดยืนยัน ต้องตรวจยอดเงินจริงจากบัญชีธนาคารหรือบอร์ดชำระเงินทุกครั้ง</p>
        <div class="mmd-review-warning" role="note" aria-label="คำเตือนสำคัญ">
          <h2>คำเตือนสำคัญ</h2>
          <p>สลิปเป็นเพียงหลักฐานประกอบเท่านั้น
ห้ามกดยืนยันจากรูปสลิปอย่างเดียว หากยังไม่พบยอดเงินจริงในช่องทางทางการ</p>
        </div>
      </div>
      <div class="mmd-review-status-grid" aria-label="Review status">
        <div class="mmd-review-status-item"><p class="mmd-review-label">Review Mode</p><p class="mmd-review-value">MMD Payment ตรวจสอบ</p></div>
        <div class="mmd-review-status-item"><p class="mmd-review-label">Payment Type</p><p class="mmd-review-value">ต่ออายุสมาชิก</p></div>
        <div class="mmd-review-status-item"><p class="mmd-review-label">Access Action</p><p class="mmd-review-value">รอระบบยืนยันหลังตรวจเสร็จ</p></div>
      </div>
    </section>

    <section class="mmd-review-toolbar" aria-label="Review filters">
      <label class="mmd-review-field"><span>ค้นหาชื่อสมาชิก เบอร์ติดต่อ หรือเลขอ้างอิง</span><input class="mmd-review-input" data-review-search type="search" autocomplete="off"></label>
      <label class="mmd-review-field"><span>สถานะรายการ</span><select class="mmd-review-select" data-review-status><option value="">ทั้งหมด</option><option value="pending">รอตรวจสอบ</option><option value="approved">ยืนยันแล้ว</option><option value="rejected">ไม่ผ่าน</option><option value="needs_more_info">ขอข้อมูลเพิ่ม</option><option value="duplicate">รายการซ้ำ</option></select></label>
      <label class="mmd-review-field"><span>ช่องทางชำระเงิน</span><select class="mmd-review-select" data-review-method><option value="">ทั้งหมด</option><option value="promptpay_bank_transfer">PromptPay / Bank</option><option value="bank_transfer">Bank Transfer</option><option value="paypal_card">PayPal / Card</option></select></label>
      <button class="mmd-review-button" type="button" data-review-refresh>โหลดรายการใหม่</button>
      <button class="mmd-review-button mmd-review-button-secondary" type="button" data-review-policy>วิธีตรวจรายการ</button>
    </section>

    <section class="mmd-review-kpi-grid" aria-label="Review summary">
      <div class="mmd-review-kpi-card"><p class="mmd-review-label">รอตรวจสอบ</p><p class="mmd-review-kpi-number" data-kpi-pending>0</p></div>
      <div class="mmd-review-kpi-card"><p class="mmd-review-label">ยืนยันแล้ววันนี้</p><p class="mmd-review-kpi-number" data-kpi-approved>0</p></div>
      <div class="mmd-review-kpi-card"><p class="mmd-review-label">ไม่ผ่านการตรวจสอบ</p><p class="mmd-review-kpi-number" data-kpi-rejected>0</p></div>
      <div class="mmd-review-kpi-card"><p class="mmd-review-label">ยอดรวมของรายการที่แสดง</p><p class="mmd-review-kpi-number" data-kpi-total>฿0</p></div>
    </section>

    <section class="mmd-review-main-grid">
      <div class="mmd-review-queue">
        <div class="mmd-review-section-head">
          <h2>รายการต่ออายุที่รอตรวจสอบ</h2>
          <span class="mmd-review-pill" data-review-count>0 รายการ</span>
        </div>
        <p class="mmd-review-empty" data-review-empty>กำลังโหลดรายการ…</p>
        <div class="mmd-review-table-wrap" data-review-table-wrap hidden>
          <table class="mmd-review-table">
            <thead>
              <tr>
                <th>สมาชิก</th>
                <th>ยอดชำระ</th>
                <th>ช่องทาง</th>
                <th>แพ็กเกจ</th>
                <th>เลขอ้างอิง</th>
                <th>สถานะ</th>
                <th>หลักฐาน</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody data-review-rows></tbody>
          </table>
        </div>
      </div>

      <aside class="mmd-review-policy-panel" data-policy-panel>
        <p class="mmd-review-label">วิธีตรวจรายการ</p>
        <h2>สลิปยังไม่ใช่การยืนยัน</h2>
        <h3>วิธีตรวจรายการ</h3>
        <ol>
          <li>ตรวจยอดเงินจริงจากบัญชีธนาคารหรือบอร์ดชำระเงินก่อนเสมอ</li>
          <li>ตรวจว่าเลขอ้างอิงไม่ใช่รายการที่เคยส่งเข้ามาแล้ว</li>
          <li>ถ้ายอดไม่ตรงหรือหลักฐานไม่ชัด ให้เลือก “ไม่ผ่าน” หรือ “ขอข้อมูลเพิ่ม”</li>
          <li>ใส่หมายเหตุสั้น ๆ ทุกครั้ง เพื่อให้ MMD รู้ว่าตรวจจากอะไร</li>
          <li>เมื่อบันทึกผลแล้ว ระบบจะจัดการขั้นตอนต่อไปตามสถานะที่เลือก</li>
        </ol>
      </aside>
    </section>
  </main>

  <section class="mmd-review-modal" data-review-modal hidden>
    <div class="mmd-review-modal-backdrop" data-review-close></div>
    <div class="mmd-review-dialog" role="dialog" aria-modal="true" aria-labelledby="mmd-review-modal-title">
      <button class="mmd-review-modal-close" type="button" data-review-close aria-label="Close">×</button>
      <div class="mmd-review-dialog-inner">
        <p class="mmd-review-label">ผลการตรวจสอบ</p>
        <h2 id="mmd-review-modal-title" class="mmd-review-modal-title">ตรวจหลักฐานการชำระเงิน</h2>
        <p class="mmd-review-status-line" data-review-modal-summary></p>
        <form class="mmd-review-form-grid" data-review-form>
          <label class="mmd-review-field"><span>เลือกผลการตรวจ</span><select class="mmd-review-select" name="decision" required><option value="">เลือกผลการตรวจสอบ</option><option value="approved">ยืนยันยอดนี้</option><option value="rejected">ไม่ผ่านการตรวจสอบ</option><option value="needs_more_info">ขอข้อมูลเพิ่มเติม</option><option value="duplicate">รายการซ้ำ</option></select></label>
          <label class="mmd-review-field"><span>ยอดเงินจริงที่ตรวจพบ</span><input class="mmd-review-input" name="verified_amount" type="number" min="0" step="1" inputmode="decimal"></label>
          <label class="mmd-review-field"><span>เลขอ้างอิงจากธนาคารหรือบอร์ดชำระเงิน</span><input class="mmd-review-input" name="official_ref" type="text" autocomplete="off"></label>
          <label class="mmd-review-field"><span>หมายเหตุการตรวจสอบ</span><textarea class="mmd-review-textarea" name="audit_note" placeholder="เช่น ยอดตรงแล้ว / ยอดไม่ตรง / สลิปไม่ชัด / ขอหลักฐานใหม่ / ติดต่อสมาชิกแล้ว" required></textarea></label>
          <label class="mmd-review-confirm"><input type="checkbox" name="official_verification_confirmed" required><span>ตรวจยอดเงินจริงจากช่องทางทางการแล้ว</span></label>
          <button class="mmd-review-button" type="submit">บันทึกผลการตรวจสอบ</button>
          <p class="mmd-review-modal-note">หลังบันทึกผล ระบบจะนำข้อมูลไปจัดการสถานะสมาชิกตามขั้นตอนต่อไป</p>
          <p class="mmd-review-status-line" data-review-form-status></p>
        </form>
      </div>
    </div>
  </section>

  <script>
    (() => {
      const state = { records: [], filtered: [], current: null };
      const els = {
        search: document.querySelector("[data-review-search]"),
        status: document.querySelector("[data-review-status]"),
        method: document.querySelector("[data-review-method]"),
        refresh: document.querySelector("[data-review-refresh]"),
        rows: document.querySelector("[data-review-rows]"),
        empty: document.querySelector("[data-review-empty]"),
        tableWrap: document.querySelector("[data-review-table-wrap]"),
        count: document.querySelector("[data-review-count]"),
        modal: document.querySelector("[data-review-modal]"),
        summary: document.querySelector("[data-review-modal-summary]"),
        form: document.querySelector("[data-review-form]"),
        formStatus: document.querySelector("[data-review-form-status]"),
        kPending: document.querySelector("[data-kpi-pending]"),
        kApproved: document.querySelector("[data-kpi-approved]"),
        kRejected: document.querySelector("[data-kpi-rejected]"),
        kTotal: document.querySelector("[data-kpi-total]")
      };
      const params = new URLSearchParams(window.location.search);
      const accessT = params.get("t") || "";
      const statusLabels = {
        pending: "รอ MMD Payment ตรวจสอบ",
        pending_official_review: "รอ MMD Payment ตรวจสอบ",
        approved: "ยืนยันแล้ว",
        rejected: "ไม่ผ่าน",
        needs_more_info: "ขอข้อมูลเพิ่ม",
        duplicate: "รายการซ้ำ"
      };
      function escapeText(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
      }
      function money(value) {
        return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(Number(value || 0));
      }
      function displayStatus(value) {
        return statusLabels[value] || statusLabels.pending;
      }
      function matchesFilters(record) {
        const q = els.search.value.trim().toLowerCase();
        const status = els.status.value;
        const method = els.method.value;
        const haystack = [record.member_name, record.contact, record.payment_ref, record.transaction_ref, record.session_id].join(" ").toLowerCase();
        if (q && !haystack.includes(q)) return false;
        if (status && record.status !== status && !(status === "pending" && record.status === "pending_official_review")) return false;
        if (method && record.payment_method !== method) return false;
        return true;
      }
      function applyFilters() {
        state.filtered = state.records.filter(matchesFilters);
        renderRows();
        renderKpis();
      }
      function renderKpis() {
        const pending = state.filtered.filter((r) => r.status === "pending" || r.status === "pending_official_review").length;
        const approved = state.filtered.filter((r) => r.status === "approved" && String(r.reviewed_at || "").slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
        const rejected = state.filtered.filter((r) => r.status === "rejected").length;
        const total = state.filtered.reduce((sum, r) => sum + Number(r.amount_thb || 0), 0);
        els.kPending.textContent = String(pending);
        els.kApproved.textContent = String(approved);
        els.kRejected.textContent = String(rejected);
        els.kTotal.textContent = money(total);
        els.count.textContent = state.filtered.length + " รายการ";
      }
      function renderRows() {
        if (!state.filtered.length) {
          els.empty.textContent = "ไม่พบรายการ";
          els.empty.hidden = false;
          els.tableWrap.hidden = true;
          els.rows.innerHTML = "";
          return;
        }
        els.empty.hidden = true;
        els.tableWrap.hidden = false;
        els.rows.innerHTML = state.filtered.map((record, index) => {
          const proof = record.evidence_url
            ? '<a class="mmd-review-proof-link" href="' + escapeText(record.evidence_url) + '" target="_blank" rel="noopener">เปิดหลักฐาน</a>'
            : '<span class="mmd-review-pill">มีหลักฐานในระบบ</span>';
          return '<tr>'
            + '<td><strong>' + escapeText(record.member_name || "Member") + '</strong><br><span>' + escapeText(record.contact || "") + '</span></td>'
            + '<td>' + money(record.amount_thb) + '</td>'
            + '<td>' + escapeText(record.payment_method || "-") + '</td>'
            + '<td>' + escapeText(record.package_code || "-") + '</td>'
            + '<td>' + escapeText(record.payment_ref || record.transaction_ref || "-") + '</td>'
            + '<td><span class="mmd-review-pill">' + escapeText(displayStatus(record.status)) + '</span></td>'
            + '<td>' + proof + '</td>'
            + '<td><button class="mmd-review-button mmd-review-button-secondary" type="button" data-open-review="' + index + '">ตรวจรายการ</button></td>'
            + '</tr>';
        }).join("");
      }
      async function loadRecords() {
        els.refresh.disabled = true;
        els.refresh.textContent = "กำลังโหลดรายการ…";
        els.empty.textContent = "กำลังโหลดรายการ…";
        els.empty.hidden = false;
        els.tableWrap.hidden = true;
        try {
          const url = new URL("/api/pay/renewal/review/list", window.location.origin);
          if (accessT) url.searchParams.set("t", accessT);
          const response = await fetch(url.toString(), { method: "GET", credentials: "include" });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data && data.error ? data.error.message || data.error.code || data.error : "load_failed");
          state.records = Array.isArray(data.records) ? data.records : [];
          applyFilters();
        } catch (error) {
          els.empty.textContent = "ไม่พบรายการ";
          els.tableWrap.hidden = true;
        } finally {
          els.refresh.disabled = false;
          els.refresh.textContent = "โหลดรายการใหม่";
        }
      }
      function openModal(record) {
        state.current = record;
        els.form.reset();
        els.formStatus.textContent = "";
        els.summary.textContent = [record.member_name, money(record.amount_thb), record.payment_ref].filter(Boolean).join(" · ");
        els.modal.hidden = false;
      }
      function closeModal() {
        els.modal.hidden = true;
        state.current = null;
      }
      els.rows.addEventListener("click", (event) => {
        const button = event.target.closest("[data-open-review]");
        if (!button) return;
        const record = state.filtered[Number(button.getAttribute("data-open-review"))];
        if (record) openModal(record);
      });
      Array.prototype.forEach.call(document.querySelectorAll("[data-review-close]"), (node) => node.addEventListener("click", closeModal));
      Array.prototype.forEach.call([els.search, els.status, els.method], (node) => node.addEventListener("input", applyFilters));
      els.refresh.addEventListener("click", loadRecords);
      document.querySelector("[data-review-policy]").addEventListener("click", () => document.querySelector("[data-policy-panel]").scrollIntoView({ behavior: "smooth", block: "start" }));
      els.form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!state.current) return;
        const form = new FormData(els.form);
        const payload = {
          record_id: state.current.record_id,
          payment_ref: state.current.payment_ref,
          session_id: state.current.session_id,
          payment_type: "renewal",
          decision: String(form.get("decision") || ""),
          verified_amount: Number(form.get("verified_amount") || 0),
          official_ref: String(form.get("official_ref") || ""),
          audit_note: String(form.get("audit_note") || ""),
          official_verification_confirmed: Boolean(form.get("official_verification_confirmed")),
          t: accessT || undefined
        };
        els.formStatus.textContent = "กำลังบันทึกผลการตรวจสอบ…";
        try {
          const response = await fetch("/api/pay/renewal/review/decision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload)
          });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data && data.error ? data.error.message || data.error.code || data.error : "decision_failed");
          els.formStatus.textContent = "บันทึกผลการตรวจสอบแล้ว";
          await loadRecords();
          window.setTimeout(closeModal, 500);
        } catch (error) {
          els.formStatus.textContent = "บันทึกผลไม่สำเร็จ";
        }
      });
      loadRecords();
    })();
  </script>
</body>
</html>`;

  return new Response(isHead ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function handleRenewalReviewList(req, env) {
  if (!(await isPaymentReviewAuthed(req, env))) {
    const response = json({ ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  const url = new URL(req.url);
  const tableId = env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi";
  const records = await airtableList(env, tableId, { limit: 100 });
  const normalized = records
    .map(normalizeRenewalProofReviewRecord)
    .filter((record) => record.payment_type === "renewal");

  const status = str(url.searchParams.get("status")).toLowerCase();
  const method = str(url.searchParams.get("method")).toLowerCase();
  const q = str(url.searchParams.get("q")).toLowerCase();
  const filtered = normalized.filter((record) => {
    const statusMatch = !status || record.status === status || (status === "pending" && record.status === "pending_official_review");
    const methodMatch = !method || record.payment_method === method;
    const searchMatch = !q || [
      record.member_name,
      record.contact,
      record.payment_ref,
      record.transaction_ref,
      record.session_id,
    ].join(" ").toLowerCase().includes(q);
    return statusMatch && methodMatch && searchMatch;
  });

  const response = json({
    ok: true,
    payment_type: "renewal",
    records: filtered,
    meta: {
      count: filtered.length,
      source: tableId,
    },
  });
  response.headers.set("cache-control", "no-store");
  return response;
}

async function handleRenewalReviewDecision(req, env) {
  const body = await safeJson(req);
  if (!(await isPaymentReviewAuthed(req, env, body))) {
    const response = json({ ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  const payload = normalizeRenewalReviewDecisionPayload(body);
  const missing = [];
  if (!payload.record_id) missing.push("record_id");
  if (!payload.decision) missing.push("decision");
  if (payload.payment_type !== "renewal") missing.push("payment_type");
  if (!payload.official_verification_confirmed) missing.push("official_verification_confirmed");
  if (!payload.audit_note) missing.push("audit_note");

  if (missing.length) {
    const response = json({
      ok: false,
      error: {
        code: "validation_failed",
        message: `Missing or invalid required fields: ${missing.join(", ")}`,
      },
    }, 400);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  const tableId = env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi";
  const now = new Date().toISOString();
  const patch = {
    status: payload.decision,
    note: [
      `payment_type=${payload.payment_type}`,
      `decision=${payload.decision}`,
      `payment_ref=${payload.payment_ref}`,
      `session_id=${payload.session_id}`,
      `verified_amount=${payload.verified_amount}`,
      `official_ref=${payload.official_ref}`,
      `audit_note=${payload.audit_note}`,
      `official_verification_confirmed=${payload.official_verification_confirmed}`,
      `reviewed_at=${now}`,
    ].filter(Boolean).join("\n"),
  };

  const result = await airtablePatchById(env, tableId, payload.record_id, patch);
  if (!result.ok) {
    const response = json({ ok: false, error: { code: "review_decision_failed", message: "Could not save review decision.", detail: result } }, 500);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  const response = json({
    ok: true,
    record_id: payload.record_id,
    payment_ref: payload.payment_ref,
    session_id: payload.session_id,
    payment_type: payload.payment_type,
    decision: payload.decision,
    official_verification_confirmed: payload.official_verification_confirmed,
    reviewed_at: now,
    next_step_owner: "backend",
  });
  response.headers.set("cache-control", "no-store");
  return response;
}

async function isPaymentReviewAuthed(req, env, body = null) {
  if (await isAdminRouteAuthed(req, env)) return true;
  const url = new URL(req.url);
  const t = str(url.searchParams.get("t") || body?.t);
  if (!t) return false;
  return [
    env.PAYMENT_REVIEW_TOKEN,
    env.ADMIN_BEARER,
    env.INTERNAL_TOKEN,
    env.CONFIRM_KEY,
  ].filter(Boolean).includes(t);
}

function normalizeRenewalProofReviewRecord(record) {
  const fields = record?.fields || {};
  const note = str(fields.note || fields.notes || fields.Note || "");
  const meta = parseKeyValueNote(note);
  const status = normalizeReviewStatus(fields.status || fields.Status || meta.review_status || "pending");
  const paymentRef = str(fields.payment_ref || fields["Payment Ref"] || meta.payment_ref || record?.id);
  const transactionRef = str(fields.transaction_ref || meta.transaction_ref || paymentRef);
  return {
    record_id: record?.id || "",
    proof_id: str(fields.proof_id || meta.proof_id || record?.id),
    member_name: str(fields.payer_name || fields.member_name || fields.display_name || meta.display_name || "Member"),
    contact: str(fields.contact_id || fields.contact || meta.contact_id || ""),
    amount_thb: Number(fields.amount_thb || fields.amount || meta.amount_thb || 0),
    payment_method: str(fields.channel || fields.payment_method || meta.payment_method || ""),
    package_code: str(fields.package_code || fields.selected_package || meta.selected_package || ""),
    payment_ref: paymentRef,
    transaction_ref: transactionRef,
    session_id: str(fields.session_id || meta.session_id || ""),
    status,
    payment_type: str(fields.payment_type || meta.payment_type || "renewal").toLowerCase(),
    evidence_url: normalizeEvidenceUrl(fields.slip_url || fields.evidence_url || meta.evidence_ref || ""),
    reviewed_at: str(fields.verified_at || meta.reviewed_at || ""),
    raw_created_time: record?.createdTime || "",
  };
}

function normalizeRenewalReviewDecisionPayload(body = {}) {
  return {
    record_id: str(body.record_id),
    payment_ref: str(body.payment_ref),
    session_id: str(body.session_id),
    payment_type: str(body.payment_type || "renewal").toLowerCase(),
    decision: normalizeReviewStatus(body.decision),
    verified_amount: Number(body.verified_amount || 0),
    official_ref: str(body.official_ref),
    audit_note: str(body.audit_note),
    official_verification_confirmed: Boolean(body.official_verification_confirmed),
    t: str(body.t),
  };
}

function normalizeReviewStatus(value) {
  const raw = str(value).toLowerCase();
  if (["approved", "verified", "confirm", "confirmed"].includes(raw)) return "approved";
  if (["reject", "rejected", "failed", "invalid"].includes(raw)) return "rejected";
  if (["need_more_info", "needs_more_info", "needs-info", "more_info"].includes(raw)) return "needs_more_info";
  if (["duplicate", "duplicated"].includes(raw)) return "duplicate";
  if (["pending_official_review", "pending_review", "pending"].includes(raw)) return raw === "pending" ? "pending" : "pending_official_review";
  return raw || "pending";
}

function parseKeyValueNote(note) {
  const out = {};
  for (const line of str(note).split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function normalizeEvidenceUrl(value) {
  const raw = str(value);
  return /^https?:\/\//i.test(raw) ? raw : "";
}

async function handlePublicRenewalProofSubmit(req, env) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    const response = json({ ok: false, error: { code: "missing_airtable_env", message: "Airtable env is missing." } }, 500);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  const payload = await readPublicRenewalProofPayload(req);
  const testBypass = getRenewalReviewTestBypass(req, env, payload);
  const missing = [];
  if (!payload.display_name) missing.push("display_name");
  if (!payload.contact_id) missing.push("contact_id");
  if (!payload.selected_package) missing.push("selected_package");
  if (!(payload.amount_thb > 0) && !testBypass.allowed) missing.push("amount_paid");
  if (!payload.paid_at) missing.push("paid_at");
  if (!payload.payment_method) missing.push("payment_method");
  if (!payload.proof_file) missing.push("proof");
  if (payload.payment_type !== "renewal") missing.push("payment_type");

  if (missing.length) {
    const response = json({
      ok: false,
      error: {
        code: "validation_failed",
        message: `Missing or invalid required fields: ${missing.join(", ")}`,
      },
    }, 400);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  if (!testBypass.allowed) {
    const turnstileSecret = str(env.TURNSTILE_SECRET || env.TURNSTILE_SECRET_KEY);
    if (!turnstileSecret) {
      const response = json({
        ok: false,
        error: {
          code: "turnstile_unconfigured",
          message: "Turnstile verification is not configured.",
        },
      }, 503);
      response.headers.set("cache-control", "no-store");
      return response;
    }

    if (!payload.cf_turnstile_response) {
      const response = json({
        ok: false,
        error: {
          code: "turnstile_required",
          message: "Turnstile verification is required.",
        },
      }, 400);
      response.headers.set("cache-control", "no-store");
      return response;
    }

    const turnstile = await verifyRenewalTurnstile(payload.cf_turnstile_response, getClientIp(req), turnstileSecret);
    if (!turnstile.ok) {
      const response = json({
        ok: false,
        error: {
          code: "turnstile_failed",
          message: "Turnstile verification failed.",
          detail: turnstile.detail || "",
        },
      }, 403);
      response.headers.set("cache-control", "no-store");
      return response;
    }
  }

  const tableId = env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi";
  const existing = payload.payment_ref
    ? await airtableFindOne(env, tableId, `{payment_ref}="${escapeFormulaValue(payload.payment_ref)}"`)
    : null;

  if (existing?.id) {
    const response = json({
      ok: true,
      proof_received: true,
      pending_review: true,
      status: "pending_official_review",
      payment_type: "renewal",
      proof_id: str(existing.fields?.proof_id || payload.proof_id),
      payment_ref: payload.payment_ref,
      session_id: payload.session_id,
      record_id: existing.id,
      duplicate: true,
      test_mode: testBypass.allowed || undefined,
      turnstile_bypassed_for_test: testBypass.allowed || undefined,
      next_step_owner: "backend",
      message: "Proof already received and is still pending official review.",
    });
    response.headers.set("cache-control", "no-store");
    return response;
  }

  const proofId = payload.proof_id || `renewal_proof_${crypto.randomUUID()}`;
  const file = payload.proof_file;
  const evidenceRef = `urn:renewal-proof:${proofId}:${encodeURIComponent(file.name || "slip")}`;
  const noteLines = [
    `payment_type=renewal`,
    `review_status=pending_official_review`,
    `session_id=${payload.session_id}`,
    `payment_ref=${payload.payment_ref}`,
    `transaction_ref=${payload.transaction_ref}`,
    `contact_id=${payload.contact_id}`,
    `selected_package=${payload.selected_package}`,
    `payment_method=${payload.payment_method}`,
    `amount_thb=${payload.amount_thb}`,
    `paid_at=${payload.paid_at}`,
    `evidence_ref=${evidenceRef}`,
    `proof_name=${file.name || ""}`,
    `proof_type=${file.type || ""}`,
    `proof_size=${file.size || 0}`,
    testBypass.allowed ? "TEST_ONLY_RENEWAL_REVIEW_MUTATION" : "",
    payload.additional_note ? `note=${payload.additional_note}` : "",
    payload.package_note ? `package_note=${payload.package_note}` : "",
  ].filter(Boolean);

  try {
    const rec = await airtableCreate({
      baseId: env.AIRTABLE_BASE_ID,
      tableId,
      apiKey: env.AIRTABLE_API_KEY,
      fields: {
        proof_id: proofId,
        payer_name: payload.display_name,
        amount_thb: payload.amount_thb,
        channel: payload.payment_method,
        payment_ref: payload.payment_ref,
        slip_url: evidenceRef,
        note: noteLines.join("\n"),
        status: "pending",
      },
    });

    const notification = await notifyRenewalProofAdmin(env, {
      proof_id: proofId,
      display_name: payload.display_name,
      contact_id: payload.contact_id,
      selected_package: payload.selected_package,
      payment_method: payload.payment_method,
      amount_thb: payload.amount_thb,
      paid_at: payload.paid_at,
      payment_ref: payload.payment_ref,
      evidence_ref: evidenceRef,
      test_mode: testBypass.allowed,
    });

    const response = json({
      ok: true,
      proof_received: true,
      pending_review: true,
      status: "pending_official_review",
      payment_type: "renewal",
      proof_id: proofId,
      payment_ref: payload.payment_ref,
      transaction_ref: payload.transaction_ref,
      session_id: payload.session_id,
      record_id: rec?.id || "",
      evidence_ref: evidenceRef,
      notification,
      test_mode: testBypass.allowed || undefined,
      turnstile_bypassed_for_test: testBypass.allowed || undefined,
      next_step_owner: "backend",
      message: "Proof received and pending official review.",
    });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    const response = json({
      ok: false,
      error: {
        code: "proof_storage_failed",
        message: String(error?.message || error),
      },
    }, 500);
    response.headers.set("cache-control", "no-store");
    return response;
  }
}

function getRenewalReviewTestBypass(req, env, payload) {
  const configuredSecret = str(env.MMD_RENEWAL_TEST_KEY);
  if (!configuredSecret) return { allowed: false };

  const headerMode = str(req.headers.get("X-MMD-Test-Mode"));
  const headerKey = str(req.headers.get("X-MMD-Test-Key"));
  const proofName = str(payload.proof_file?.name);
  const amount = Number(payload.amount_thb);
  const packageCode = str(payload.selected_package).toLowerCase();
  const method = str(payload.payment_method).toLowerCase();

  const allowed = [
    headerMode === "renewal-review-only",
    Boolean(headerKey) && headerKey === configuredSecret,
    payload.payment_type === "renewal",
    payload.display_name === "MMD_TEST_RENEWAL_REVIEW",
    str(payload.payment_ref).startsWith("renewal_test_only_"),
    str(payload.session_id).startsWith("renewal_test_session_"),
    str(payload.transaction_ref).startsWith("renewal_test_txn_"),
    amount === 0 || amount === 1,
    str(payload.additional_note).includes("SAFE MUTATION TEST ONLY"),
    proofName.includes("MMD_TEST_RENEWAL_REVIEW"),
    packageCode === "standard" || packageCode === "test",
    method === "promptpay" || method === "test",
  ].every(Boolean);

  return { allowed };
}

async function readPublicRenewalProofPayload(req) {
  const contentType = str(req.headers.get("content-type")).toLowerCase();
  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    const proof = form.get("proof");
    const proofFile = proof && typeof proof === "object" && "name" in proof && "size" in proof
      ? { name: str(proof.name), size: Number(proof.size || 0), type: str(proof.type || "") }
      : null;
    const paymentRef = str(form.get("payment_ref") || form.get("transaction_ref")) || `renewal_ref_${crypto.randomUUID()}`;
    const sessionId = str(form.get("session_id")) || `renewal_session_${crypto.randomUUID()}`;
    return {
      proof_id: str(form.get("proof_id")) || "",
      display_name: str(form.get("display_name") || form.get("member_name") || form.get("nickname")),
      contact_id: str(form.get("contact_id") || form.get("contact") || form.get("telegram_username") || form.get("line_id")),
      amount_thb: toNum(form.get("amount_paid") || form.get("amount_thb")),
      paid_at: normalizeSubmittedDateTime(form.get("paid_at") || form.get("transfer_datetime")),
      selected_package: str(form.get("selected_package") || form.get("package") || form.get("renewal_package")),
      payment_method: str(form.get("payment_method") || form.get("channel")),
      package_note: str(form.get("package_note")),
      additional_note: str(form.get("verification_note") || form.get("note")),
      payment_type: str(form.get("payment_type") || "renewal").toLowerCase(),
      cf_turnstile_response: str(form.get("cf_turnstile_response") || form.get("turnstile_token") || form.get("cf-turnstile-response")),
      payment_ref: paymentRef,
      transaction_ref: str(form.get("transaction_ref")) || paymentRef,
      session_id: sessionId,
      proof_file: proofFile,
    };
  }

  const body = await safeJson(req);
  const paymentRef = str(body.payment_ref || body.transaction_ref) || `renewal_ref_${crypto.randomUUID()}`;
  const sessionId = str(body.session_id) || `renewal_session_${crypto.randomUUID()}`;
  return {
    proof_id: str(body.proof_id),
    display_name: str(body.display_name || body.member_name || body.nickname),
    contact_id: str(body.contact_id || body.contact || body.telegram_username || body.line_id),
    amount_thb: toNum(body.amount_paid || body.amount_thb),
    paid_at: normalizeSubmittedDateTime(body.paid_at || body.transfer_datetime),
    selected_package: str(body.selected_package || body.package || body.renewal_package),
    payment_method: str(body.payment_method || body.channel),
    package_note: str(body.package_note),
    additional_note: str(body.verification_note || body.note),
    payment_type: str(body.payment_type || "renewal").toLowerCase(),
    cf_turnstile_response: str(body.cf_turnstile_response || body.turnstile_token || body["cf-turnstile-response"]),
    payment_ref: paymentRef,
    transaction_ref: str(body.transaction_ref) || paymentRef,
    session_id: sessionId,
    proof_file: body.evidence_ref ? { name: str(body.evidence_ref), size: 1, type: "reference" } : null,
  };
}

async function verifyRenewalTurnstile(token, ip, secret) {
  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", str(token));
    if (ip) form.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return { ok: false, detail: "turnstile_verify_failed" };
    if (!data.success) return { ok: false, detail: Array.isArray(data["error-codes"]) ? data["error-codes"].join(",") : String(data["error-codes"] || "not_success") };
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: String(error?.message || error) };
  }
}

function getClientIp(req) {
  return str(
    req.headers.get("CF-Connecting-IP") ||
    req.headers.get("X-Forwarded-For")?.split(",")[0] ||
    ""
  );
}

async function notifyRenewalProofAdmin(env, payload) {
  const text = [
    payload.test_mode ? "TEST ONLY - DO NOT PROCESS AS REAL PAYMENT" : "",
    "RENEWAL PROOF RECEIVED",
    `Name: ${payload.display_name}`,
    `Contact: ${payload.contact_id}`,
    `Package: ${payload.selected_package}`,
    `Method: ${payload.payment_method}`,
    `Amount: ${payload.amount_thb}`,
    `Paid at: ${payload.paid_at}`,
    `Payment Ref: ${payload.payment_ref}`,
    `Evidence Ref: ${payload.evidence_ref}`,
    `Status: pending_official_review`,
  ].join("\n");

  const result = await telegramInternalSend(env, {
    text,
    parse_mode: null,
    message_thread_id: str(env.TG_THREAD_PRICING_REVIEW || "61"),
    disable_web_page_preview: true,
  });

  return {
    attempted: true,
    ok: Boolean(result && result.ok),
    error: result && !result.ok ? (result.error || result.data || result.reason || "notification_failed") : "",
  };
}

function normalizeSubmittedDateTime(value) {
  const raw = str(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    const parsedLocal = new Date(raw);
    if (!Number.isNaN(parsedLocal.getTime())) return parsedLocal.toISOString();
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return raw;
}

function isAllowedOrigin(req, env) {
  const allow = getAllowedOrigins(env);
  const origin = req.headers.get("Origin") || "";
  const requestOrigin = new URL(req.url).origin;

  // server-to-server / curl (no Origin) => allow
  if (!origin) return true;

  // same-origin browser call => allow
  if (origin === requestOrigin) return true;

  // if allowlist not configured => allow
  if (allow.size === 0) return true;

  return allow.has(origin);
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = getAllowedOrigins(env);
  const h = new Headers();

  if (allow.size > 0 && allow.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
    h.set("Access-Control-Allow-Credentials", "true");
  }

  h.set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

function corsPreflight(req, env) {
  return new Response(null, { status: 204, headers: corsHeaders(req, env) });
}

function withCors(req, env, res) {
  const h = new Headers(res.headers);
  const extra = corsHeaders(req, env);
  extra.forEach((v, k) => h.set(k, v));
  return new Response(res.body, { status: res.status, headers: h });
}

function redirectToInternalAdminLogin(req) {
  const url = new URL(req.url);
  const next = `${url.pathname}${url.search}`;
  return new Response(null, {
    status: 302,
    headers: {
      // /sigil/admin/login is the canonical internal admin login.
      Location: `/sigil/admin/login?next=${encodeURIComponent(next)}`,
      "Cache-Control": "no-store",
      "x-mmd-worker": "admin-worker",
    },
  });
}

function logConsoleAudit(event, req, details = {}) {
  const url = new URL(req.url);
  const record = {
    event,
    worker: "admin-worker",
    surface: "public_safe_ceo_console",
    path: url.pathname,
    host: url.host,
    origin: str(req.headers.get("Origin") || ""),
    cf_ray: str(req.headers.get("CF-Ray") || ""),
    ts: new Date().toISOString(),
    ...details,
  };

  try {
    console.info(JSON.stringify(record));
  } catch (_) {
    console.info(event);
  }
}

function buildPublicSafeCeoConsole(result, eventId) {
  const summary = isPlainObject(result?.summary) ? result.summary : {};
  const trend = Array.isArray(result?.trend) ? result.trend : [];
  const suppliers = Array.isArray(result?.supplier_balances) ? result.supplier_balances : [];
  const lastTrend = trend.length ? trend[trend.length - 1] : null;

  return {
    ok: true,
    public_safe: true,
    endpoint: "/v1/admin/ceo",
    console_log_event_id: eventId,
    console: {
      status: result?.ok ? "online" : "degraded",
      data_ready: Boolean(result?.ok),
      checked_at: new Date().toISOString(),
      last_trend_date: str(lastTrend?.date || ""),
      metrics: {
        trend_points: trend.length,
        supplier_balance_count: suppliers.length,
        low_stock_batches: safePublicCount(summary.low_stock_batches),
        depleted_batches: safePublicCount(summary.depleted_batches),
        has_financial_data: hasFiniteNumber(summary.revenue) || hasFiniteNumber(summary.margin),
      },
    },
  };
}

function safePublicCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function hasFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/* =========================
   Auth
========================= */
function isAuthed(req, env) {
  if (isInternalServiceRequest(req)) return true;

  // Bearer
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (env.ADMIN_BEARER && bearer && bearer === env.ADMIN_BEARER) return true;
  if (env.INTERNAL_TOKEN && bearer && bearer === env.INTERNAL_TOKEN) return true;

  // Confirm key header (system/internal)
  const ck = (req.headers.get("X-Confirm-Key") || "").trim();
  if (env.CONFIRM_KEY && ck && ck === env.CONFIRM_KEY) return true;

  return false;
}

async function isAdminRouteAuthed(req, env) {
  if (isAuthed(req, env)) return true;
  return Boolean(await readValidAdminSessionCookie(req, env));
}

function isInternalServiceRequest(req) {
  try {
    const url = new URL(req.url);
    return url.hostname === "admin-worker.internal";
  } catch {
    return false;
  }
}

function isConfirmKeyAuthed(req, env) {
  const ck = (req.headers.get("X-Confirm-Key") || "").trim();
  return Boolean(env.CONFIRM_KEY && ck && ck === env.CONFIRM_KEY);
}

function isBodyAuthed(body, env) {
  const bearer = str(body?.bearer || body?.token || "").trim();
  if (env.ADMIN_BEARER && bearer && bearer === env.ADMIN_BEARER) return true;
  if (env.INTERNAL_TOKEN && bearer && bearer === env.INTERNAL_TOKEN) return true;

  const confirmKey = str(body?.confirmKey || body?.accessCode || body?.access_code || "").trim();
  if (env.CONFIRM_KEY && confirmKey && confirmKey === env.CONFIRM_KEY) return true;

  return false;
}

function parseCookies(req) {
  const cookieHeader = req.headers.get("Cookie") || "";
  const out = new Map();
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out.set(key, value);
  }
  return out;
}

function getAdminSessionSecret(env) {
  return str(env.ADMIN_SESSION_SECRET || env.CONFIRM_KEY || env.ADMIN_BEARER || "");
}

function base64UrlEncodeString(input) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeString(input) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return atob(padded);
}

async function mintAdminSessionCookieValue(env) {
  const secret = getAdminSessionSecret(env);
  if (!secret) throw new Error("missing_admin_session_secret");

  const payload = {
    sub: "admin",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS,
  };
  const encoded = base64UrlEncodeString(JSON.stringify(payload));
  const sig = await hmacSha256Hex(encoded, secret);
  return `${encoded}.${sig}`;
}

function readAdminSessionCookie(req) {
  return parseCookies(req).get(ADMIN_SESSION_COOKIE) || "";
}

async function readValidAdminSessionCookie(req, env) {
  const token = readAdminSessionCookie(req);
  if (!token) return null;
  const secret = getAdminSessionSecret(env);
  if (!secret) return null;

  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;

  const expected = await hmacSha256Hex(encoded, secret);
  if (expected !== sig) return null;

  try {
    const payload = JSON.parse(base64UrlDecodeString(encoded));
    const exp = Number(payload?.exp || 0);
    if (!exp || exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function buildAdminSessionCookie(value, maxAgeSeconds) {
  return [
    `${ADMIN_SESSION_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${Math.max(0, Number(maxAgeSeconds || 0))}`,
    "HttpOnly",
    "Secure",
    "SameSite=None",
  ].join("; ");
}

function clearAdminSessionCookie() {
  return [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=None",
  ].join("; ");
}

/* =========================
   Model Session facade
========================= */
class ModelSessionHttpError extends Error {
  constructor(status, code, message, detail = null) {
    super(message || code || "model_session_error");
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const MODEL_SESSION_FLOW = [
  "confirmed",
  "reminder",
  "en_route",
  "arrived",
  "met",
  "final_payment_pending",
  "final_payment_confirmed",
  "work_started",
  "work_finished",
  "separated",
  "review",
  "payout",
  "closed",
];
const MODEL_SESSION_FLOW_INDEX = new Map(MODEL_SESSION_FLOW.map((name, index) => [name, index]));

function modelSessionError(status, code, message, detail = null) {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
      },
      ...(detail ? { detail } : {}),
    },
    status
  );
}

function normalizeModelSessionError(error) {
  if (error instanceof ModelSessionHttpError) return error;

  const message = str(error?.message || error || "model_session_failed");
  const table = {
    missing_t: [400, "MISSING_T"],
    invalid_request_body: [400, "INVALID_REQUEST_BODY"],
    missing_status: [400, "MISSING_STATUS"],
    invalid_status: [400, "INVALID_STATUS"],
    missing_confirm_key: [503, "SERVICE_UNAVAILABLE"],
    invalid_token_format: [401, "INVALID_TOKEN"],
    invalid_token_signature: [401, "INVALID_TOKEN"],
    invalid_invite_payload: [401, "INVALID_TOKEN"],
    invalid_model_session_token: [401, "INVALID_TOKEN"],
    expired_invite_token: [410, "TOKEN_EXPIRED"],
    missing_model_session_assignment: [400, "INVALID_TOKEN"],
    session_not_found: [404, "SESSION_NOT_FOUND"],
    session_job_not_found: [404, "SESSION_JOB_NOT_FOUND"],
    missing_job_id: [409, "MISSING_JOB_ID"],
    events_worker_not_configured: [503, "EVENTS_WORKER_NOT_CONFIGURED"],
  };
  const [status, code] = table[message] || [500, "MODEL_SESSION_FAILED"];
  return new ModelSessionHttpError(status, code, message);
}

function readModelSessionToken(req, body = null) {
  const url = new URL(req.url);
  return str(url.searchParams.get("t") || body?.t || "");
}

function normalizeModelSessionStatus(value) {
  const raw = str(value).toLowerCase().replace(/\s+/g, "_");
  return MODEL_SESSION_STATUS_ALIASES[raw] || raw;
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => str(value)).filter(Boolean))];
}

function exactModelFormula(field, value) {
  return `{${field}}="${escapeFormulaValue(value)}"`;
}

function modelSessionField(env, envKey, fallback) {
  return str(env?.[envKey] || fallback);
}

function modelSessionTable(env) {
  return str(env.AIRTABLE_TABLE_SESSIONS || "sessions");
}

function modelPaymentsTable(env) {
  return str(env.AIRTABLE_TABLE_PAYMENTS || "payments");
}

function modelJobsTable(env) {
  return str(env.AIRTABLE_TABLE_JOBS || "jobs");
}

function sessionIdFromModelFields(env, fields) {
  return str(
    pickAny(fields, [
      modelSessionField(env, "AT_SESSIONS__SESSION_ID", "session_id"),
      "session_id",
      "Session ID",
      "SESSION_ID",
    ])
  );
}

function paymentRefFromModelFields(env, fields) {
  return str(
    pickAny(fields, [
      modelSessionField(env, "AT_SESSIONS__PAYMENT_REF", "payment_ref"),
      "payment_ref",
      "Payment Reference",
      "paymentReference",
    ])
  );
}

function modelNameFromSessionFields(fields) {
  return str(pickAny(fields, ["model_name", "Model Name", "model_display_name", "Model Display Name"]));
}

function modelRecordIdFromSessionFields(fields) {
  return str(pickAny(fields, ["model_record_id", "Model Record ID", "model_id", "Model", "model_airtable_id"]));
}

function listFieldStrings(fields, names) {
  const out = [];
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = str(firstScalar(item));
        if (text) out.push(text);
      }
    } else {
      const text = str(firstScalar(value));
      if (text) out.push(text);
    }
  }
  return uniqueValues(out);
}

function isAssignedModelSession(record, invite, assignmentKey, env) {
  const fields = record?.fields || {};
  const sessionId = sessionIdFromModelFields(env, fields);
  const paymentRef = paymentRefFromModelFields(env, fields);
  if (sessionId !== assignmentKey && paymentRef !== assignmentKey) return false;

  const tokenModelRecordId = str(invite.model_record_id);
  const sessionModelIds = listFieldStrings(fields, [
    "model_record_id",
    "Model Record ID",
    "model_id",
    "Model",
    "model_airtable_id",
  ]);
  if (tokenModelRecordId && sessionModelIds.length && !sessionModelIds.includes(tokenModelRecordId)) {
    return false;
  }

  const tokenModelName = normalizeLooseToken(invite.model_name);
  const sessionModelName = normalizeLooseToken(modelNameFromSessionFields(fields));
  if (tokenModelName && sessionModelName && tokenModelName !== sessionModelName) {
    return false;
  }

  return true;
}

function base64UrlDecodeUtf8(input) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

async function verifyModelInviteToken(token, env) {
  const secret = str(env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!secret) throw new Error("missing_confirm_key");

  const parts = str(token).split(".");
  if (parts.length !== 2) throw new Error("invalid_token_format");

  const [encodedPayload, signature] = parts;
  const expected = await hmacSha256Hex(encodedPayload, secret);
  if (signature !== expected) throw new Error("invalid_token_signature");

  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecodeUtf8(encodedPayload));
  } catch {
    throw new Error("invalid_invite_payload");
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    payload?.kind !== "customer_invite" ||
    payload?.role !== "model" ||
    payload?.lane !== "model_console" ||
    !payload?.invite_id ||
    !payload?.exp
  ) {
    throw new Error("invalid_model_session_token");
  }

  if (Number(payload.exp) <= now) throw new Error("expired_invite_token");
  return payload;
}

function modelSessionLookupFormulas(env, assignmentKey) {
  return uniqueValues([
    modelSessionField(env, "AT_SESSIONS__SESSION_ID", "session_id"),
    "session_id",
    "Session ID",
    "SESSION_ID",
    modelSessionField(env, "AT_SESSIONS__PAYMENT_REF", "payment_ref"),
    "payment_ref",
    "Payment Reference",
  ]).map((field) => exactModelFormula(field, assignmentKey));
}

async function resolveModelSessionContext(env, token) {
  const invite = await verifyModelInviteToken(token, env);
  const assignmentKey = str(invite.immigration_id);
  if (!assignmentKey) throw new Error("missing_model_session_assignment");

  const table = modelSessionTable(env);
  for (const formula of modelSessionLookupFormulas(env, assignmentKey)) {
    const record = await airtableFindOne(env, table, formula);
    if (record && isAssignedModelSession(record, invite, assignmentKey, env)) {
      return { invite, assignmentKey, session: record };
    }
  }

  throw new Error("session_not_found");
}

function jobIdFromFields(fields) {
  return str(pickAny(fields, ["job_id", "Job ID", "jobId", "job_record_id", "Job Record ID"]));
}

function modelJobLookupFormulas(env, session) {
  const fields = session?.fields || {};
  const sessionId = sessionIdFromModelFields(env, fields);
  const paymentRef = paymentRefFromModelFields(env, fields);
  const jobId = jobIdFromFields(fields);
  const formulas = [];

  for (const field of uniqueValues(["job_id", "Job ID"])) {
    if (jobId) formulas.push(exactModelFormula(field, jobId));
  }
  for (const field of uniqueValues(["session_id", "Session ID"])) {
    if (sessionId) formulas.push(exactModelFormula(field, sessionId));
  }
  for (const field of uniqueValues(["payment_ref", "Payment Reference"])) {
    if (paymentRef) formulas.push(exactModelFormula(field, paymentRef));
  }

  return uniqueValues(formulas);
}

async function findModelSessionJob(env, session) {
  const table = modelJobsTable(env);
  for (const formula of modelJobLookupFormulas(env, session)) {
    const record = await airtableFindOne(env, table, formula);
    if (record) return record;
  }
  return null;
}

async function airtableListRecordsByFormula(env, tableName, formula, limit = 20) {
  const params = new URLSearchParams();
  params.set("pageSize", String(Math.max(1, Math.min(Number(limit) || 20, 100))));
  params.set("filterByFormula", formula);
  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}?${params.toString()}`);
  if (!r.ok) return [];
  return (r.data?.records || []).map((rec) => ({
    id: rec.id,
    fields: rec.fields || {},
    createdTime: rec.createdTime || "",
  }));
}

async function findModelPaymentRecords(env, session) {
  const fields = session?.fields || {};
  const sessionId = sessionIdFromModelFields(env, fields);
  const paymentRef = paymentRefFromModelFields(env, fields);
  const table = modelPaymentsTable(env);
  const formulas = [];

  for (const field of uniqueValues(["session_id", "Session ID"])) {
    if (sessionId) formulas.push(exactModelFormula(field, sessionId));
  }
  for (const field of uniqueValues([
    modelSessionField(env, "AT_PAYMENTS__PAYMENT_REF", "payment_ref"),
    "payment_ref",
    "Payment Reference",
  ])) {
    if (paymentRef) formulas.push(exactModelFormula(field, paymentRef));
  }

  const records = [];
  const seen = new Set();
  for (const formula of uniqueValues(formulas)) {
    for (const record of await airtableListRecordsByFormula(env, table, formula)) {
      if (!record?.id || seen.has(record.id)) continue;
      seen.add(record.id);
      records.push(record);
    }
  }
  return records;
}

function parseJobEvents(fields) {
  try {
    const parsed = JSON.parse(str(fields?.events_json || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function collectModelLifecycle(job) {
  const seen = new Set();
  let current = "";
  let currentIndex = -1;
  const mark = (value) => {
    const normalized = normalizeModelSessionStatus(value);
    if (!MODEL_SESSION_FLOW_INDEX.has(normalized)) return;
    seen.add(normalized);
    const index = MODEL_SESSION_FLOW_INDEX.get(normalized);
    if (index >= currentIndex) {
      current = normalized;
      currentIndex = index;
    }
  };

  for (const event of parseJobEvents(job?.fields || {})) mark(event?.event);
  mark(job?.fields?.status);
  return { seen, current, currentIndex };
}

function paymentValue(fields, env, envKey, aliases) {
  return str(pickAny(fields, [modelSessionField(env, envKey, aliases[0]), ...aliases]));
}

function normalizePaymentWord(value) {
  return str(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isConfirmedPaymentValue(value) {
  const raw = normalizePaymentWord(value);
  if (!raw || raw.includes("deposit")) return false;
  if (raw.includes("unpaid") || raw.includes("not_paid") || raw.includes("pending") || raw.includes("failed")) {
    return false;
  }
  if (raw.includes("verified") || raw.includes("success") || raw.includes("succeeded") || raw.includes("cleared")) {
    return true;
  }
  if (raw.includes("paid") || raw.includes("complete")) {
    return true;
  }
  return [
    "paid",
    "success",
    "succeeded",
    "verified",
    "cleared",
    "complete",
    "completed",
    "final_paid",
    "final_payment_paid",
    "final_payment_confirmed",
  ].includes(raw);
}

function isFinalStageValue(value) {
  const raw = normalizePaymentWord(value);
  return ["final", "full", "balance", "final_payment", "remaining_balance"].includes(raw);
}

function isFinalPaymentRecord(record, env) {
  const fields = record?.fields || {};
  const stage = paymentValue(fields, env, "AT_PAYMENTS__PAYMENT_STAGE", [
    "payment_stage",
    "payment_type",
    "stage",
    "Payment Stage",
    "Payment Type",
  ]);
  const paymentStatus = paymentValue(fields, env, "AT_PAYMENTS__PAYMENT_STATUS", [
    "payment_status",
    "Payment Status",
    "status",
  ]);
  const verificationStatus = paymentValue(fields, env, "AT_PAYMENTS__VERIFICATION_STATUS", [
    "verification_status",
    "Verification Status",
  ]);

  return isFinalStageValue(stage) && (isConfirmedPaymentValue(paymentStatus) || isConfirmedPaymentValue(verificationStatus));
}

function derivePaymentSummary(env, session, job, paymentRecords) {
  const sessionFields = session?.fields || {};
  const lifecycle = collectModelLifecycle(job);
  const eventConfirmed = lifecycle.seen.has("final_payment_confirmed");
  const finalRecord = (paymentRecords || []).find((record) => isFinalPaymentRecord(record, env));
  const finalFields = finalRecord?.fields || {};
  const sessionPaymentStatus = str(
    pickAny(sessionFields, [
      modelSessionField(env, "AT_SESSIONS__PAYMENT_STATUS", "payment_status"),
      "payment_status",
      "Payment Status",
      "payment_stage",
    ])
  );
  const sessionFinalStatus = str(
    pickAny(sessionFields, [
      "final_payment_status",
      "Final Payment Status",
      "final_payment_confirmed",
      "Final Payment Confirmed",
    ])
  );
  const recordPaymentStatus = paymentValue(finalFields, env, "AT_PAYMENTS__PAYMENT_STATUS", [
    "payment_status",
    "Payment Status",
    "status",
  ]);
  const recordVerificationStatus = paymentValue(finalFields, env, "AT_PAYMENTS__VERIFICATION_STATUS", [
    "verification_status",
    "Verification Status",
  ]);
  const finalPaymentStatus =
    eventConfirmed
      ? "final_payment_confirmed"
      : sessionFinalStatus || recordVerificationStatus || recordPaymentStatus || sessionPaymentStatus || "pending";

  return {
    payment_status: sessionPaymentStatus || recordPaymentStatus || recordVerificationStatus || "pending",
    final_payment_status: finalPaymentStatus,
    final_payment_confirmed:
      eventConfirmed ||
      isConfirmedPaymentValue(sessionFinalStatus) ||
      Boolean(finalRecord) ||
      isConfirmedPaymentValue(sessionPaymentStatus),
  };
}

function buildModelDashboardSession(env, context, job, paymentSummary) {
  const fields = context.session?.fields || {};
  const lifecycle = collectModelLifecycle(job);
  const status =
    lifecycle.current ||
    str(pickAny(fields, [modelSessionField(env, "AT_SESSIONS__STATUS", "status"), "status", "session_status", "Status"])) ||
    "confirmed";
  const startTime = str(pickAny(fields, ["start_time", "Start Time", "start", "schedule_start_at"]));
  const endTime = str(pickAny(fields, ["end_time", "End Time", "end", "schedule_end_at"]));
  const gpsStatus = str(pickAny(fields, ["gps_status", "GPS Status", "live_location_status", "realtime_status"]));
  const consolePopup = str(pickAny(fields, ["console_popup", "Console Popup", "model_console_popup"]));

  return {
    session_id: sessionIdFromModelFields(env, fields) || context.assignmentKey,
    status,
    job_type: str(
      pickAny(fields, [
        "job_type",
        "work_type",
        "Job Type",
        "Work Type",
        modelSessionField(env, "AT_SESSIONS__PACKAGE_CODE", "package_code"),
        "package_code",
      ])
    ),
    job_date: str(pickAny(fields, ["job_date", "service_date", "Date", "Service Date"])),
    start_time: startTime,
    end_time: endTime,
    location_name: str(pickAny(fields, ["location_name", "Location Name", "location", "meeting_point_text"])),
    google_map_url: str(pickAny(fields, ["google_map_url", "Google Map URL", "google_maps_url", "map_url"])),
    amount_thb: toNum(
      pickAny(fields, [
        modelSessionField(env, "AT_SESSIONS__AMOUNT_THB", "amount_thb"),
        "amount_thb",
        "amount_total_thb",
        "final_price_thb",
        "Amount THB",
        "Final Price THB",
      ])
    ),
    payment_status: paymentSummary.payment_status,
    final_payment_status: paymentSummary.final_payment_status,
    gps_status: gpsStatus || (status === "en_route" ? "active" : "idle"),
    client_vibe: str(pickAny(fields, ["client_vibe", "Client Vibe", "model_client_vibe"])),
    suggested_tone: str(pickAny(fields, ["suggested_tone", "Suggested Tone", "model_suggested_tone"])),
    caution: str(pickAny(fields, ["model_caution", "model_console_caution", "caution", "Caution"])),
    do_note: str(pickAny(fields, ["do_note", "Do Note", "model_do_note"])),
    dont_note: str(pickAny(fields, ["dont_note", "Don't Note", "dont_note_model", "model_dont_note"])),
    last_update:
      str(pickAny(job?.fields || {}, ["last_update_at", "updated_at", "Last Update"])) ||
      str(pickAny(fields, ["last_update", "updated_at", "Last Update", "last_modified"])),
    console_popup:
      consolePopup ||
      (paymentSummary.final_payment_confirmed ? "" : "Start Work is locked until final payment is confirmed."),
  };
}

async function handleModelSessionDashboard(req, env) {
  const token = readModelSessionToken(req);
  if (!token) return modelSessionError(400, "MISSING_T", "missing_t");

  try {
    const context = await resolveModelSessionContext(env, token);
    const [job, paymentRecords] = await Promise.all([
      findModelSessionJob(env, context.session),
      findModelPaymentRecords(env, context.session),
    ]);
    const paymentSummary = derivePaymentSummary(env, context.session, job, paymentRecords);

    return json({
      ok: true,
      session: buildModelDashboardSession(env, context, job, paymentSummary),
    });
  } catch (error) {
    const err = normalizeModelSessionError(error);
    return modelSessionError(err.status, err.code, err.message, err.detail);
  }
}

async function callEventsWorkerModelEvent(env, payload) {
  const confirmKey = str(env.CONFIRM_KEY);
  if (!confirmKey) throw new ModelSessionHttpError(503, "SERVICE_UNAVAILABLE", "missing_confirm_key");

  const requestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Confirm-Key": confirmKey,
    },
    body: JSON.stringify(payload || {}),
  };
  const base = str(env.EVENTS_WORKER_BASE_URL || env.EVENTS_BASE_URL || "").replace(/\/+$/, "");
  const res = env.EVENTS_WORKER
    ? await env.EVENTS_WORKER.fetch(new Request("https://events-worker.internal/v1/model/console/event", requestInit))
    : base
      ? await fetch(`${base}/v1/model/console/event`, requestInit)
      : null;

  if (!res) throw new ModelSessionHttpError(503, "EVENTS_WORKER_NOT_CONFIGURED", "events_worker_not_configured");

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error || data?.code || "events_worker_failed";
    throw new ModelSessionHttpError(res.status, String(code).toUpperCase(), String(code), data);
  }
  return data;
}

async function ensureFinalPaymentConfirmedInEvents(env, job, eventPayload) {
  const lifecycle = collectModelLifecycle(job);
  const workStartedIndex = MODEL_SESSION_FLOW_INDEX.get("work_started");
  if (lifecycle.seen.has("final_payment_confirmed") || lifecycle.currentIndex >= workStartedIndex) return [];

  const writes = [];
  if (!lifecycle.seen.has("final_payment_pending")) {
    writes.push(await callEventsWorkerModelEvent(env, { ...eventPayload, event: "final_payment_pending" }));
  }
  writes.push(await callEventsWorkerModelEvent(env, { ...eventPayload, event: "final_payment_confirmed" }));
  return writes;
}

async function handleModelSessionStatus(req, env) {
  const body = await safeJson(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return modelSessionError(400, "INVALID_REQUEST_BODY", "invalid_request_body");
  }

  const token = readModelSessionToken(req, body);
  const status = normalizeModelSessionStatus(body.status || body.event || body.action);
  if (!token) return modelSessionError(400, "MISSING_T", "missing_t");
  if (!status) return modelSessionError(400, "MISSING_STATUS", "missing_status");
  if (!MODEL_SESSION_ALLOWED_STATUSES.has(status)) {
    return modelSessionError(400, "INVALID_STATUS", "invalid_status", {
      allowed: [...MODEL_SESSION_ALLOWED_STATUSES],
    });
  }

  try {
    const context = await resolveModelSessionContext(env, token);
    const job = await findModelSessionJob(env, context.session);
    if (!job) throw new Error("session_job_not_found");

    const jobId = jobIdFromFields(job.fields || {}) || jobIdFromFields(context.session.fields || {});
    if (!jobId) throw new Error("missing_job_id");

    const paymentRecords = await findModelPaymentRecords(env, context.session);
    const paymentSummary = derivePaymentSummary(env, context.session, job, paymentRecords);
    if (status === "work_started" && !paymentSummary.final_payment_confirmed) {
      return modelSessionError(423, "FINAL_PAYMENT_REQUIRED", "final_payment_required_before_work_started");
    }

    const sessionId = sessionIdFromModelFields(env, context.session.fields || {}) || context.assignmentKey;
    const eventPayload = {
      job_id: jobId,
      session_id: sessionId,
      event: status,
      eta_text: str(body.eta_text || body.eta || ""),
      lat: body.lat,
      lng: body.lng,
      source_surface: "model_dashboard",
      source: "admin_worker_model_session_facade",
    };
    const preflight_events =
      status === "work_started"
        ? await ensureFinalPaymentConfirmedInEvents(env, job, {
            ...eventPayload,
            event: "final_payment_confirmed",
            payment_status: paymentSummary.payment_status,
            final_payment_status: paymentSummary.final_payment_status,
          })
        : [];
    const events = await callEventsWorkerModelEvent(env, eventPayload);

    return json({
      ok: true,
      session_id: sessionId,
      status: events?.status || status,
      preflight_events,
      events,
    });
  } catch (error) {
    const err = normalizeModelSessionError(error);
    return modelSessionError(err.status, err.code, err.message, err.detail);
  }
}

async function handleModelSessionStub(req, env, path) {
  const body = await safeJson(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return modelSessionError(400, "INVALID_REQUEST_BODY", "invalid_request_body");
  }

  const token = readModelSessionToken(req, body);
  if (!token) return modelSessionError(400, "MISSING_T", "missing_t");

  try {
    const context = await resolveModelSessionContext(env, token);
    const sessionId = sessionIdFromModelFields(env, context.session.fields || {}) || context.assignmentKey;
    const action = path === MODEL_SESSION_GPS_PATH
      ? "gps"
      : path === MODEL_SESSION_EMERGENCY_PATH
        ? "emergency"
        : "update";

    return json(
      {
        ok: true,
        stubbed: true,
        implemented: false,
        action,
        session_id: sessionId,
        message: "Accepted by admin-worker facade without writing truth state.",
      },
      202
    );
  } catch (error) {
    const err = normalizeModelSessionError(error);
    return modelSessionError(err.status, err.code, err.message, err.detail);
  }
}

/* =========================
   Utils
========================= */
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

function str(value) {
  return value == null ? "" : String(value).trim();
}

function toNum(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeEmail(value) {
  return str(value).toLowerCase();
}

function readObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry == null) return false;
      if (typeof entry === "string") return entry.trim().length > 0;
      return true;
    })
  );
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickAllowedFields(obj, allowed) {
  const out = {};
  const source = readObject(obj);
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

function memberRecordData(record) {
  if (!record || typeof record !== "object") return {};
  const data = record.data;
  return data && typeof data === "object" && !Array.isArray(data) ? data : record;
}

function randomPassword() {
  return `Mmd!${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}aA9`;
}

function deriveMemberstackId(parts) {
  const raw = parts.map((value) => str(value)).find(Boolean) || crypto.randomUUID();
  const normalized = raw.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `mem_${(normalized || crypto.randomUUID().replace(/-/g, "")).slice(0, 40)}`;
}

function slugToken(value, fallback = "draft") {
  const normalized = str(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function escapeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeLooseToken(value) {
  return str(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, "");
}

function modelManifestKeys(entry) {
  return [
    entry.working_name,
    entry.nickname,
    entry.folder_name,
    entry.folder_slug,
    entry.username,
    entry.vanity_slug,
    entry.model_id,
  ]
    .map((value) => str(value))
    .filter(Boolean);
}

function resolveModelManifestEntry(input) {
  const query = normalizeLooseToken(input);
  if (!query) return null;

  for (const alias of MODEL_ALIAS_CANDIDATES) {
    if (normalizeLooseToken(alias.alias) === query && alias.matched_model_id) {
      const byId = MODEL_MANIFEST.find((entry) => normalizeLooseToken(entry.model_id) === normalizeLooseToken(alias.matched_model_id));
      if (byId) return byId;
    }
  }

  for (const entry of MODEL_MANIFEST) {
    const keys = modelManifestKeys(entry);
    if (keys.some((value) => normalizeLooseToken(value) === query)) {
      return entry;
    }
  }

  for (const entry of MODEL_MANIFEST) {
    const keys = modelManifestKeys(entry);
    if (keys.some((value) => normalizeLooseToken(value).includes(query) || query.includes(normalizeLooseToken(value)))) {
      return entry;
    }
  }

  return null;
}

async function findExistingModelByManifest(env, tableName, entry) {
  const clauses = [
    `{unique_key}="${escapeFormulaValue(entry.model_id || "")}"`,
    `{unique_key}="${escapeFormulaValue(entry.folder_slug || "")}"`,
    `{name}="${escapeFormulaValue(entry.working_name || "")}"`,
    `{nickname}="${escapeFormulaValue(entry.nickname || "")}"`,
  ].filter((value) => !value.includes('=""'));

  if (!clauses.length) return null;
  return await airtableFindOne(env, tableName, `OR(${clauses.join(",")})`);
}

async function ensureModelFromManifest(env, tableName, entry) {
  const existing = await findExistingModelByManifest(env, tableName, entry);
  if (existing) return existing;

  const fields = compactObject({
    name: str(entry.working_name || entry.folder_name || entry.nickname),
    nickname: str(entry.nickname || entry.working_name || entry.folder_name),
    unique_key: str(entry.model_id || entry.folder_slug || entry.username || entry.vanity_slug),
  });

  return await airtableCreateRecord(env, tableName, fields);
}

async function findPromotedMember(env, { memberstackId, email }) {
  if (memberstackId) {
    const member = await dtFindMember({ memberstack_id: memberstackId }, env);
    if (member) return member;
  }

  if (email) {
    const member = await dtFindMember({ email }, env);
    if (member) return member;
  }

  return null;
}

async function promoteImmigrationMember(env, body) {
  const identity = readObject(body.identity);
  const membership = readObject(body.membership);
  const notes = readObject(body.notes);
  const payloadJson = readObject(body.payload_json);
  const promotionPolicy = readObject(body.promotion_policy);

  const requestedMemberId =
    str(identity.member_id) ||
    str(body.member_id) ||
    str(body.memberstack_id) ||
    str(payloadJson.memberstack_id);
  const email =
    normalizeEmail(payloadJson.email) ||
    normalizeEmail(payloadJson.member_email) ||
    normalizeEmail(body.email);
  const fullName =
    str(identity.full_name) ||
    str(payloadJson.display_name) ||
    str(payloadJson.name) ||
    str(payloadJson.nickname) ||
    "LINE Client";
  const phone =
    str(identity.phone) ||
    str(payloadJson.phone) ||
    str(payloadJson.member_phone);
  const lineUserId = str(identity.line_user_id) || str(payloadJson.line_user_id);
  const lineId = str(identity.line_id) || str(payloadJson.line_id);
  const currentTier = str(membership.current_tier);
  const targetTier = str(membership.target_tier);
  const requestedStatus = str(payloadJson.membership_status || payloadJson.status);
  const immigrationId = str(body.immigration_id) || str(payloadJson.immigration_id);
  const createIfMissing = promotionPolicy.create_if_missing !== false;
  const fallbackEmailLocal = deriveMemberstackId([
    lineUserId,
    lineId,
    immigrationId,
    fullName,
  ]).slice(4);
  const signupEmail = email || `${fallbackEmailLocal}@line.mmd.invalid`;

  const existing = await findPromotedMember(env, {
    memberstackId: requestedMemberId,
    email: email || requestedMemberId,
  });

  if (existing) {
    const existingData = memberRecordData(existing);
    const memberId =
      str(existingData.id) ||
      str(existingData.memberstack_id) ||
      str(existingData.member_id) ||
      requestedMemberId;

    return {
      immigration_id: immigrationId,
      member_id: memberId,
      promotion_status: "promoted",
      created_new_member: false,
      service_history_summary: str(body.service_history_summary),
      member_record_id: str(existing.id || existingData.id),
      email,
    };
  }

  if (!createIfMissing) {
    throw new Error("member_not_found");
  }

  const memberId = requestedMemberId || deriveMemberstackId([
    lineUserId,
    lineId,
    immigrationId,
    signupEmail,
    fullName,
  ]);

  const record = await dtCreateRecord(
    env,
    membersTableId(env),
    compactObject({
      email: signupEmail,
      password: randomPassword(),
      name: fullName,
      full_name: fullName,
      phone,
      line_user_id: lineUserId,
      line_id: lineId,
      source: "line",
      primary_channel: "line",
      status: requestedStatus || "active",
      tier: targetTier || currentTier || "premium",
      immigration_id: immigrationId,
      requested_memberstack_id: memberId,
      operator_summary: str(notes.operator_summary),
      notes_raw: str(notes.manual_note_raw),
    })
  );

  const createdData = memberRecordData(record);
  const createdMemberId =
    str(createdData.id) ||
    str(createdData.memberstack_id) ||
    str(createdData.member_id) ||
    memberId;

  return {
    immigration_id: immigrationId,
    member_id: createdMemberId,
    promotion_status: "promoted",
    created_new_member: true,
    service_history_summary: str(body.service_history_summary),
    member_record_id: str(createdData.id || record?.id),
    email: signupEmail,
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCreateSessionRebuiltPage(method) {
  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SIGIL Internal Create Session</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">

    <style>
      .mmd-session-rebuilt {
        --bg: #060504;
        --panel: rgba(13, 11, 8, 0.88);
        --line: rgba(218, 176, 92, 0.20);
        --line-2: rgba(218, 176, 92, 0.45);
        --gold: #d9b66d;
        --gold-soft: #f4d58f;
        --text: #f7ecd9;
        --muted: rgba(247, 236, 217, 0.64);
        --radius: 20px;

        position: relative;
        min-height: 100vh;
        overflow: hidden;
        color: var(--text);
        background:
          radial-gradient(circle at 14% 8%, rgba(217, 182, 109, 0.13), transparent 26%),
          radial-gradient(circle at 88% 14%, rgba(217, 182, 109, 0.08), transparent 34%),
          linear-gradient(135deg, #060504 0%, #100c08 50%, #050403 100%);
        font-family: "Noto Sans Thai", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .mmd-session-rebuilt * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #060504;
      }

      .mmd-session-rebuilt__pattern {
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.42;
        background:
          linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px),
          linear-gradient(180deg, rgba(255,255,255,0.016) 1px, transparent 1px),
          linear-gradient(135deg, transparent 0 48%, rgba(217,182,109,0.07) 49%, transparent 51% 100%);
        background-size: 72px 72px, 72px 72px, 240px 240px;
        mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
      }

      .mmd-session-rebuilt__wrap {
        position: relative;
        z-index: 1;
        width: min(1680px, calc(100% - 36px));
        margin: 0 auto;
        padding: 18px 0 64px;
      }

      .mmd-session-rebuilt__hero {
        position: relative;
        min-height: clamp(640px, 84vh, 900px);
        overflow: hidden;
        border: 1px solid rgba(218, 176, 92, 0.28);
        border-radius: 34px;
        background:
          radial-gradient(circle at top left, rgba(217,182,109,0.12), transparent 34%),
          rgba(8, 6, 4, 0.92);
        box-shadow:
          0 30px 90px rgba(0,0,0,0.48),
          inset 0 1px 0 rgba(255,255,255,0.06);
      }

      .mmd-session-rebuilt__hero-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center center;
        transform: scale(1.02);
        filter: brightness(0.9) contrast(1.04) saturate(0.98);
      }

      .mmd-session-rebuilt__hero-overlay {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        background:
          linear-gradient(90deg,
            rgba(4,4,4,0.78) 0%,
            rgba(4,4,4,0.68) 20%,
            rgba(4,4,4,0.48) 38%,
            rgba(4,4,4,0.22) 58%,
            rgba(4,4,4,0.12) 100%
          ),
          linear-gradient(180deg,
            rgba(8,8,8,0.08) 0%,
            rgba(8,8,8,0.22) 100%
          );
      }

      .mmd-session-rebuilt__hero-grid {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        opacity: 0.08;
        background-image:
          linear-gradient(rgba(217,182,109,0.14) 1px, transparent 1px),
          linear-gradient(90deg, rgba(217,182,109,0.14) 1px, transparent 1px);
        background-size: 120px 120px;
        mask-image: linear-gradient(90deg, black 0%, black 62%, transparent 90%);
      }

      .mmd-session-rebuilt__hero-content {
        position: relative;
        z-index: 3;
        min-height: clamp(640px, 84vh, 900px);
        width: min(760px, 52%);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        padding:
          clamp(42px, 5vw, 82px)
          clamp(42px, 5vw, 72px)
          clamp(42px, 5vw, 82px)
          clamp(72px, 7vw, 120px);
      }

      .mmd-session-rebuilt__hero-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        margin: 0 0 22px;
        color: var(--gold);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.24em;
        text-transform: uppercase;
      }

      .mmd-session-rebuilt__hero-eyebrow::before {
        content: "";
        width: 42px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(244,213,143,0.92));
      }

      .mmd-session-rebuilt__hero-title {
        margin: 0 0 28px;
        font-size: clamp(70px, 8.8vw, 136px);
        line-height: 0.86;
        font-weight: 800;
        letter-spacing: -0.07em;
        color: transparent;
        background: linear-gradient(180deg, #fff1b2 0%, #e2bc68 45%, #a9772f 100%);
        -webkit-background-clip: text;
        background-clip: text;
        text-shadow:
          0 16px 44px rgba(0,0,0,0.28),
          0 0 28px rgba(217,182,109,0.08);
      }

      .mmd-session-rebuilt__per-voice {
        max-width: 640px;
        color: rgba(255, 248, 235, 0.88);
        font-size: clamp(17px, 1.35vw, 22px);
        line-height: 1.86;
        font-weight: 400;
      }

      .mmd-session-rebuilt__per-voice p {
        margin: 0 0 21px;
      }

      .mmd-session-rebuilt__hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-top: 18px;
      }

      .mmd-session-rebuilt__status {
        margin: 14px 0 0;
        min-height: 22px;
        color: rgba(247,236,217,0.68);
        font-size: 13px;
        line-height: 1.5;
      }

      .mmd-session-rebuilt__status[data-tone="ok"] {
        color: rgba(244, 213, 143, 0.94);
      }

      .mmd-session-rebuilt__status[data-tone="error"] {
        color: rgba(255, 190, 145, 0.94);
      }

      .mmd-session-rebuilt__status[data-tone="loading"] {
        color: rgba(247,236,217,0.78);
      }

      .mmd-session-rebuilt__ready-item,
      .mmd-session-rebuilt__panel,
      .mmd-session-rebuilt__actions {
        border: 1px solid var(--line);
        background:
          linear-gradient(145deg, rgba(255,255,255,0.05), transparent 34%),
          var(--panel);
        box-shadow: 0 24px 72px rgba(0,0,0,0.32);
        backdrop-filter: blur(18px);
      }

      .mmd-session-rebuilt__readiness {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 9px;
        margin-top: 16px;
      }

      .mmd-session-rebuilt__ready-item {
        border-radius: 16px;
        padding: 12px;
        min-height: 92px;
      }

      .mmd-session-rebuilt__ready-item span,
      .mmd-session-rebuilt__panel-head p,
      .mmd-session-rebuilt__checklist p {
        display: block;
        margin: 0 0 9px;
        color: var(--gold);
        font-size: 10px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .mmd-session-rebuilt__ready-item strong {
        display: block;
        margin-top: 7px;
        font-size: 13px;
      }

      .mmd-session-rebuilt__ready-item em {
        display: block;
        margin-top: 6px;
        color: var(--muted);
        font-style: normal;
        font-size: 12px;
      }

      .mmd-session-rebuilt__ready-item.is-ready {
        border-color: rgba(217,182,109,0.54);
        background:
          linear-gradient(145deg, rgba(217,182,109,0.12), transparent 42%),
          var(--panel);
      }

      .mmd-session-rebuilt__grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 360px;
        gap: 18px;
        margin-top: 18px;
        align-items: start;
      }

      .mmd-session-rebuilt__form {
        display: grid;
        gap: 14px;
      }

      .mmd-session-rebuilt__form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }

      .mmd-session-rebuilt__panel {
        border-radius: var(--radius);
        padding: 18px;
      }

      .mmd-session-rebuilt__panel.is-hidden {
        display: none;
      }

      .mmd-session-rebuilt__panel-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--line);
      }

      .mmd-session-rebuilt__panel-head h2 {
        margin: 0;
        font-size: 18px;
        letter-spacing: -0.03em;
      }

      .mmd-session-rebuilt__fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .mmd-session-rebuilt__fields--three {
        grid-template-columns: repeat(3, 1fr);
      }

      .mmd-session-rebuilt__fields--four {
        grid-template-columns: repeat(4, 1fr);
      }

      .mmd-session-rebuilt label {
        display: grid;
        gap: 7px;
        color: var(--muted);
        font-size: 12px;
      }

      .mmd-session-rebuilt input,
      .mmd-session-rebuilt select,
      .mmd-session-rebuilt textarea {
        width: 100%;
        border: 1px solid rgba(217,182,109,0.22);
        border-radius: 13px;
        padding: 12px 13px;
        color: var(--text);
        background: rgba(0,0,0,0.28);
        font: inherit;
        font-size: 14px;
        outline: none;
      }

      .mmd-session-rebuilt textarea {
        resize: vertical;
      }

      .mmd-session-rebuilt input:focus,
      .mmd-session-rebuilt select:focus,
      .mmd-session-rebuilt textarea:focus {
        border-color: rgba(217,182,109,0.72);
        box-shadow: 0 0 0 4px rgba(217,182,109,0.08);
      }

      .mmd-session-rebuilt__full {
        margin-top: 12px;
      }

      .mmd-session-rebuilt__work-explain,
      .mmd-session-rebuilt__warning,
      .mmd-session-rebuilt__empty {
        margin-top: 12px;
        border: 1px solid rgba(217,182,109,0.16);
        border-radius: 14px;
        padding: 12px 14px;
        color: var(--muted);
        background: rgba(0,0,0,0.20);
        line-height: 1.65;
        font-size: 13px;
      }

      .mmd-session-rebuilt__warning {
        border-color: rgba(224,167,95,0.34);
        color: rgba(255,233,200,0.88);
        background: rgba(224,167,95,0.08);
      }

      .mmd-session-rebuilt__searchbar {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        margin-bottom: 14px;
      }

      .mmd-session-rebuilt__model-results {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }

      .mmd-session-rebuilt__model-card {
        position: relative;
        overflow: hidden;
        width: 100%;
        display: grid;
        grid-template-columns: 48px 1fr auto;
        gap: 13px;
        align-items: center;
        border: 1px solid rgba(217,182,109,0.18);
        border-radius: 18px;
        padding: 13px;
        color: inherit;
        background:
          linear-gradient(145deg, rgba(255,255,255,0.035), transparent 38%),
          rgba(0,0,0,0.22);
        cursor: pointer;
        text-align: left;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.04),
          0 10px 26px rgba(0,0,0,0.22);
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          box-shadow 180ms ease,
          background 180ms ease;
      }

      .mmd-session-rebuilt__model-card::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 0% 0%, rgba(217,182,109,0.16), transparent 34%),
          linear-gradient(135deg, rgba(217,182,109,0.07), transparent 54%);
        opacity: 0;
        transition: opacity 180ms ease;
      }

      .mmd-session-rebuilt__model-card:hover {
        transform: translateY(-1px);
        border-color: rgba(217,182,109,0.48);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.06),
          0 14px 34px rgba(0,0,0,0.34);
      }

      .mmd-session-rebuilt__model-card:hover::before {
        opacity: 0.7;
      }

      .mmd-session-rebuilt__model-card.is-selected {
        border-color: rgba(241,210,139,0.78);
        background:
          linear-gradient(145deg, rgba(217,182,109,0.14), transparent 46%),
          rgba(0,0,0,0.30);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.08),
          0 16px 40px rgba(0,0,0,0.38),
          0 0 0 4px rgba(217,182,109,0.045);
      }

      .mmd-session-rebuilt__model-avatar {
        position: relative;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border: 1px solid rgba(217,182,109,0.34);
        border-radius: 16px;
        color: #140f08;
        background: linear-gradient(180deg, #f1d28b, #ad7d34);
        font-weight: 900;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.35),
          0 8px 22px rgba(0,0,0,0.28);
      }

      .mmd-session-rebuilt__model-card > div {
        position: relative;
        z-index: 1;
      }

      .mmd-session-rebuilt__model-card strong {
        display: block;
        color: var(--text);
        font-size: 15px;
        letter-spacing: -0.01em;
      }

      .mmd-session-rebuilt__model-card span {
        display: block;
        margin-top: 3px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }

      .mmd-session-rebuilt__model-tags {
        position: relative;
        z-index: 1;
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
        max-width: 280px;
      }

      .mmd-session-rebuilt__tag {
        border: 1px solid rgba(217,182,109,0.18);
        border-radius: 999px;
        padding: 5px 8px;
        color: var(--muted);
        font-size: 11px;
        font-style: normal;
        white-space: nowrap;
      }

      .mmd-session-rebuilt__tag.is-online,
      .mmd-session-rebuilt__tag.is-age {
        color: #120e08;
        border-color: transparent;
        background: linear-gradient(135deg, #f1d28b, #b88636);
        font-weight: 800;
      }

      .mmd-session-rebuilt__tag.is-missing {
        color: rgba(255,233,200,0.92);
        border-color: rgba(224,167,95,0.34);
        background: rgba(224,167,95,0.08);
      }

      .mmd-session-rebuilt__preview {
        display: grid;
        gap: 8px;
      }

      .mmd-session-rebuilt__preview div,
      .mmd-session-rebuilt__route,
      .mmd-session-rebuilt__checklist {
        border: 1px solid rgba(217,182,109,0.16);
        border-radius: 14px;
        padding: 12px;
        background: rgba(0,0,0,0.2);
      }

      .mmd-session-rebuilt__preview span,
      .mmd-session-rebuilt__route span {
        display: block;
        color: var(--muted);
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .mmd-session-rebuilt__preview strong,
      .mmd-session-rebuilt__route strong {
        display: block;
        margin-top: 6px;
        font-size: 13px;
        word-break: break-word;
      }

      .mmd-session-rebuilt__sticky {
        position: sticky;
        top: 18px;
      }

      .mmd-session-rebuilt__checklist {
        display: grid;
        gap: 9px;
        margin-top: 12px;
      }

      .mmd-session-rebuilt__checklist label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--muted);
        font-size: 12px;
      }

      .mmd-session-rebuilt__checklist input {
        width: auto;
      }

      .mmd-session-rebuilt__route {
        margin-top: 12px;
      }

      .mmd-session-rebuilt__route p {
        margin: 9px 0 0;
        color: var(--muted);
        line-height: 1.65;
        font-size: 12px;
      }

      .mmd-session-rebuilt__btn,
      .mmd-session-rebuilt__panel-head button,
      .mmd-session-rebuilt__searchbar button {
        position: relative;
        isolation: isolate;
        border: 1px solid rgba(217, 182, 109, 0.28);
        border-radius: 999px;
        color: var(--text);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)),
          rgba(8, 6, 4, 0.72);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.08),
          0 10px 26px rgba(0,0,0,0.28);
        cursor: pointer;
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          background 180ms ease,
          box-shadow 180ms ease,
          color 180ms ease;
      }

      .mmd-session-rebuilt__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 13px 20px;
        font: inherit;
        font-size: 14px;
        text-decoration: none;
      }

      .mmd-session-rebuilt__btn:hover,
      .mmd-session-rebuilt__panel-head button:hover,
      .mmd-session-rebuilt__searchbar button:hover {
        transform: translateY(-1px);
        border-color: rgba(217,182,109,0.72);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.12),
          0 14px 34px rgba(0,0,0,0.38),
          0 0 0 4px rgba(217,182,109,0.055);
      }

      .mmd-session-rebuilt__btn--primary,
      .mmd-session-rebuilt__searchbar button {
        border-color: rgba(241,210,139,0.74);
        color: #130e07;
        font-weight: 850;
        letter-spacing: 0.025em;
        background:
          linear-gradient(180deg, #ffe2a0 0%, #d8ad59 46%, #a7742c 100%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.45),
          inset 0 -1px 0 rgba(79,48,10,0.42),
          0 16px 38px rgba(0,0,0,0.38),
          0 0 28px rgba(217,182,109,0.12);
      }

      .mmd-session-rebuilt__btn--soft {
        color: #f8e8c8;
        border-color: rgba(217,182,109,0.38);
        background:
          linear-gradient(180deg, rgba(217,182,109,0.17), rgba(217,182,109,0.055)),
          rgba(8,6,4,0.74);
      }

      .mmd-session-rebuilt__btn--ghost {
        color: rgba(247,236,217,0.72);
        border-color: rgba(247,236,217,0.14);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.012)),
          rgba(0,0,0,0.18);
      }

      .mmd-session-rebuilt__panel-head button {
        width: 34px;
        height: 34px;
        padding: 0;
        color: var(--gold);
        font-size: 14px;
        flex: 0 0 auto;
      }

      .mmd-session-rebuilt__searchbar button {
        border-radius: 13px;
        padding: 0 18px;
      }

      .mmd-session-rebuilt__actions {
        position: sticky;
        bottom: 14px;
        z-index: 8;
        justify-content: flex-end;
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        border-radius: var(--radius);
        padding: 15px;
        border: 1px solid rgba(217,182,109,0.24);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.055), transparent 42%),
          rgba(9,7,5,0.82);
        backdrop-filter: blur(20px);
        box-shadow:
          0 20px 60px rgba(0,0,0,0.42),
          inset 0 1px 0 rgba(255,255,255,0.06);
      }

      .mmd-session-rebuilt__actions::before {
        content: "SESSION COMMAND";
        margin-right: auto;
        align-self: center;
        color: var(--muted);
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .mmd-session-rebuilt__work-switch {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .mmd-session-rebuilt__work-switch button {
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(217,182,109,0.18);
        border-radius: 18px;
        padding: 18px;
        color: var(--text);
        background:
          linear-gradient(145deg, rgba(255,255,255,0.035), transparent 38%),
          rgba(0,0,0,0.24);
        text-align: left;
        cursor: pointer;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.04),
          0 10px 26px rgba(0,0,0,0.22);
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          background 180ms ease,
          box-shadow 180ms ease;
      }

      .mmd-session-rebuilt__work-switch button::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 16% 0%, rgba(217,182,109,0.18), transparent 34%),
          linear-gradient(135deg, rgba(217,182,109,0.08), transparent 52%);
        opacity: 0;
        transition: opacity 180ms ease;
      }

      .mmd-session-rebuilt__work-switch button::after {
        content: "";
        position: absolute;
        top: 14px;
        right: 14px;
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: rgba(247,236,217,0.22);
        transition: background 180ms ease, box-shadow 180ms ease;
      }

      .mmd-session-rebuilt__work-switch button span,
      .mmd-session-rebuilt__work-switch button strong {
        position: relative;
        z-index: 1;
      }

      .mmd-session-rebuilt__work-switch button:hover {
        transform: translateY(-1px);
        border-color: rgba(217,182,109,0.46);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.06),
          0 14px 34px rgba(0,0,0,0.32);
      }

      .mmd-session-rebuilt__work-switch button:hover::before {
        opacity: 0.65;
      }

      .mmd-session-rebuilt__work-switch button.is-active {
        border-color: rgba(241,210,139,0.78);
        background:
          linear-gradient(145deg, rgba(217,182,109,0.16), transparent 48%),
          rgba(0,0,0,0.30);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.08),
          0 16px 40px rgba(0,0,0,0.36),
          0 0 0 4px rgba(217,182,109,0.045);
      }

      .mmd-session-rebuilt__work-switch button.is-active::before {
        opacity: 1;
      }

      .mmd-session-rebuilt__work-switch button.is-active::after {
        background: var(--gold);
        box-shadow: 0 0 18px rgba(217,182,109,0.95);
      }

      .mmd-session-rebuilt__work-switch span {
        display: block;
        margin-bottom: 8px;
        color: var(--gold);
        font-size: 14px;
        font-weight: 850;
        letter-spacing: 0.015em;
      }

      .mmd-session-rebuilt__work-switch strong {
        display: block;
        color: rgba(247,236,217,0.66);
        font-size: 12px;
        line-height: 1.58;
        font-weight: 400;
      }

      @media (max-width: 1280px) {
        .mmd-session-rebuilt__wrap {
          width: min(1280px, calc(100% - 28px));
        }

        .mmd-session-rebuilt__hero {
          min-height: 720px;
        }

        .mmd-session-rebuilt__hero-content {
          width: min(700px, 56%);
          min-height: 720px;
          padding:
            46px
            42px
            46px
            clamp(52px, 6vw, 88px);
        }

        .mmd-session-rebuilt__hero-title {
          font-size: clamp(66px, 8.3vw, 118px);
        }

        .mmd-session-rebuilt__per-voice {
          font-size: clamp(16px, 1.35vw, 20px);
        }
      }

      @media (max-width: 1180px) {
        .mmd-session-rebuilt__grid {
          grid-template-columns: 1fr;
        }

        .mmd-session-rebuilt__sticky {
          position: static;
        }

        .mmd-session-rebuilt__readiness {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      @media (max-width: 980px) {
        .mmd-session-rebuilt__hero {
          min-height: auto;
        }

        .mmd-session-rebuilt__hero-bg {
          object-position: 62% center;
          opacity: 0.82;
          transform: scale(1.01);
          filter: brightness(0.92) contrast(1.02) saturate(0.96);
        }

        .mmd-session-rebuilt__hero-overlay {
          background:
            linear-gradient(180deg,
              rgba(4,4,4,0.44) 0%,
              rgba(4,4,4,0.56) 28%,
              rgba(4,4,4,0.74) 62%,
              rgba(4,4,4,0.88) 100%
            );
        }

        .mmd-session-rebuilt__hero-grid {
          mask-image: linear-gradient(180deg, black 0%, transparent 100%);
        }

        .mmd-session-rebuilt__hero-content {
          width: 100%;
          max-width: none;
          min-height: auto;
          padding: 42px 30px 42px 30px;
        }

        .mmd-session-rebuilt__hero-title {
          font-size: clamp(56px, 12vw, 92px);
        }

        .mmd-session-rebuilt__per-voice {
          max-width: 100%;
          font-size: 17px;
          line-height: 1.76;
        }
      }

      @media (max-width: 900px) {
        .mmd-session-rebuilt__form-row,
        .mmd-session-rebuilt__fields--four,
        .mmd-session-rebuilt__fields--three {
          grid-template-columns: 1fr 1fr;
        }

        .mmd-session-rebuilt__model-card {
          grid-template-columns: 44px 1fr;
        }

        .mmd-session-rebuilt__model-tags {
          grid-column: 1 / -1;
          justify-content: flex-start;
          max-width: none;
        }
      }

      @media (max-width: 760px) {
        .mmd-session-rebuilt__wrap {
          width: min(100% - 18px, 1280px);
          padding-top: 10px;
        }

        .mmd-session-rebuilt__hero {
          border-radius: 24px;
        }

        .mmd-session-rebuilt__hero-bg {
          object-position: 66% top;
        }

        .mmd-session-rebuilt__hero-content {
          padding: 32px 22px 34px 22px;
        }

        .mmd-session-rebuilt__hero-eyebrow {
          font-size: 10px;
          letter-spacing: 0.18em;
          margin-bottom: 16px;
        }

        .mmd-session-rebuilt__hero-title {
          font-size: clamp(48px, 16vw, 74px);
          line-height: 0.92;
          margin-bottom: 22px;
        }

        .mmd-session-rebuilt__per-voice {
          font-size: 16px;
          line-height: 1.72;
        }

        .mmd-session-rebuilt__per-voice p {
          margin-bottom: 18px;
        }

        .mmd-session-rebuilt__hero-actions {
          width: 100%;
          flex-direction: column;
        }

        .mmd-session-rebuilt__fields,
        .mmd-session-rebuilt__fields--three,
        .mmd-session-rebuilt__fields--four,
        .mmd-session-rebuilt__readiness,
        .mmd-session-rebuilt__work-switch,
        .mmd-session-rebuilt__form-row,
        .mmd-session-rebuilt__searchbar {
          grid-template-columns: 1fr;
        }

        .mmd-session-rebuilt__actions {
          justify-content: stretch;
        }

        .mmd-session-rebuilt__actions::before {
          width: 100%;
          margin-bottom: 4px;
        }

        .mmd-session-rebuilt__btn {
          width: 100%;
        }

        .mmd-session-rebuilt__searchbar button {
          padding: 12px 18px;
        }
      }
    </style>

    <style id="mmd-session-rebuilt-emergency-css">
      [data-mmd-session-rebuilt].mmd-session-rebuilt {
        --mmd-session-bg: #060504;
        --mmd-session-panel: rgba(13, 11, 8, 0.9);
        --mmd-session-line: rgba(218, 176, 92, 0.24);
        --mmd-session-gold: #d9b66d;
        --mmd-session-text: #f7ecd9;
        --mmd-session-muted: rgba(247, 236, 217, 0.66);
        min-height: 100vh;
        color: var(--mmd-session-text);
        background:
          radial-gradient(circle at 14% 8%, rgba(217, 182, 109, 0.13), transparent 26%),
          linear-gradient(135deg, #060504 0%, #100c08 50%, #050403 100%);
        font-family: "Noto Sans Thai", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .mmd-session-rebuilt__hero {
        position: relative;
        min-height: clamp(640px, 84vh, 900px);
        overflow: hidden;
        border: 1px solid rgba(218, 176, 92, 0.28);
        border-radius: 34px;
        background: rgba(8, 6, 4, 0.92);
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }

      .mmd-session-rebuilt__title,
      .mmd-session-rebuilt__hero-title {
        margin: 0 0 28px;
        font-size: clamp(70px, 8.8vw, 136px);
        line-height: 0.86;
        font-weight: 800;
        letter-spacing: -0.07em;
        color: transparent;
        background: linear-gradient(180deg, #fff1b2 0%, #e2bc68 45%, #a9772f 100%);
        -webkit-background-clip: text;
        background-clip: text;
        text-shadow: 0 16px 44px rgba(0, 0, 0, 0.28), 0 0 28px rgba(217, 182, 109, 0.08);
      }

      .mmd-session-rebuilt__grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 360px;
        gap: 18px;
        margin-top: 18px;
        align-items: start;
      }

      .mmd-session-rebuilt__panel {
        border: 1px solid var(--mmd-session-line);
        border-radius: 20px;
        padding: 18px;
        color: var(--mmd-session-text);
        background:
          linear-gradient(145deg, rgba(255, 255, 255, 0.05), transparent 34%),
          var(--mmd-session-panel);
        box-shadow: 0 24px 72px rgba(0, 0, 0, 0.32);
        backdrop-filter: blur(18px);
      }

      @media (max-width: 1180px) {
        .mmd-session-rebuilt__grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 760px) {
        .mmd-session-rebuilt__hero {
          min-height: auto;
          border-radius: 24px;
        }

        .mmd-session-rebuilt__title,
        .mmd-session-rebuilt__hero-title {
          font-size: clamp(48px, 16vw, 74px);
          line-height: 0.92;
        }
      }
    </style>
  </head>
  <body>
    <!-- MMD_SESSION_REBUILT_LV12_RENDERED -->
    <section class="mmd-session-rebuilt" data-mmd-session-rebuilt data-dev-auth="false" aria-label="SĪGIL internal create session page">
      <div class="mmd-session-rebuilt__pattern" aria-hidden="true"></div>

      <div class="mmd-session-rebuilt__wrap">
        <header class="mmd-session-rebuilt__hero" aria-label="Create Session hero">
          <img
            class="mmd-session-rebuilt__hero-bg"
            src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a07c395c2cd7d5bc2c36f74_Studio%202.webp"
            alt=""
            aria-hidden="true"
            loading="eager"
          >

          <div class="mmd-session-rebuilt__hero-overlay" aria-hidden="true"></div>
          <div class="mmd-session-rebuilt__hero-grid" aria-hidden="true"></div>

          <div class="mmd-session-rebuilt__hero-content">
            <p class="mmd-session-rebuilt__hero-eyebrow">SĪGIL INTERNAL</p>

            <h1 class="mmd-session-rebuilt__hero-title mmd-session-rebuilt__title">
              Create<br>Session
            </h1>

            <div class="mmd-session-rebuilt__per-voice">
              <p>
                โอเว่น ก่อนจะสร้าง “งาน” หรือ Session<br>
                เราต้องรู้ก่อนว่างานนี้เป็น Public หรือ Private นะครับ
              </p>

              <p>
                ถ้าลูกค้าเลือกนายแบบมาแล้ว<br>
                ให้ค้นชื่อนั้นก่อนด้วยตัวอักษรภาษาอังกฤษ
              </p>

              <p>
                ถ้าลูกค้ายังไม่ได้ระบุชื่อ<br>
                ให้ใช้ Search Engine ช่วยหาคนที่เหมาะตามสเปคลูกค้า
              </p>

              <p>
                ถ้ามีอะไรที่ยังไม่มั่นใจ<br>
                Save Draft ไว้ก่อนได้<br>
                พี่จะได้เข้ามาตรวจสอบให้
              </p>

              <p>
                อย่ากดส่ง ถ้ายังไม่ชัวร์<br>
                หรือข้อมูลยังไม่ครบ
              </p>

              <p>
                ค่อย ๆ ทำไป<br>
                เดี๋ยวก็เก่งกว่าพี่แล้วนะ
              </p>

              <p>: )</p>
            </div>

            <div class="mmd-session-rebuilt__hero-actions">
              <a class="mmd-session-rebuilt__btn mmd-session-rebuilt__btn--primary" href="#mmdSessionRebuiltForm">
                Start Form
              </a>

              <button class="mmd-session-rebuilt__btn mmd-session-rebuilt__btn--ghost" type="button" data-help-topic="work-type">
                Public / Private คืออะไร
              </button>
            </div>

            <p id="mmd-session-rebuilt-status" class="mmd-session-rebuilt__status" role="status" aria-live="polite"></p>
          </div>
        </header>

        <section class="mmd-session-rebuilt__readiness" aria-label="Session readiness">
          <div class="mmd-session-rebuilt__ready-item is-ready" data-ready="work">
            <span>00</span>
            <strong>Work</strong>
            <em id="readyWork">Public</em>
          </div>

          <div class="mmd-session-rebuilt__ready-item" data-ready="client">
            <span>01</span>
            <strong>Client</strong>
            <em id="readyClient">Waiting</em>
          </div>

          <div class="mmd-session-rebuilt__ready-item" data-ready="match">
            <span>02</span>
            <strong>Match</strong>
            <em id="readyMatch">Waiting</em>
          </div>

          <div class="mmd-session-rebuilt__ready-item" data-ready="model">
            <span>03</span>
            <strong>Model</strong>
            <em id="readyModel">Waiting</em>
          </div>

          <div class="mmd-session-rebuilt__ready-item" data-ready="brief">
            <span>04</span>
            <strong>Brief</strong>
            <em id="readyBrief">Draft</em>
          </div>

          <div class="mmd-session-rebuilt__ready-item" data-ready="place">
            <span>05</span>
            <strong>Place</strong>
            <em id="readyPlace">Waiting</em>
          </div>

          <div class="mmd-session-rebuilt__ready-item" data-ready="amount">
            <span>06</span>
            <strong>Amount</strong>
            <em id="readyAmount">Waiting</em>
          </div>

          <div class="mmd-session-rebuilt__ready-item" data-ready="create">
            <span>07</span>
            <strong>Create</strong>
            <em id="readyCreate">Locked</em>
          </div>
        </section>

        <main class="mmd-session-rebuilt__grid">
          <form id="mmdSessionRebuiltForm" class="mmd-session-rebuilt__form">
            <section class="mmd-session-rebuilt__panel">
              <div class="mmd-session-rebuilt__panel-head">
                <div>
                  <p>STEP 00</p>
                  <h2>งานนี้เป็น Public หรือ Private?</h2>
                </div>
                <button type="button" data-help-topic="work-type">?</button>
              </div>

              <div class="mmd-session-rebuilt__work-switch">
                <button type="button" class="is-active" data-work-type="public">
                  <span>Public Job</span>
                  <strong>Travel / Extreme / รายละเอียดไม่ลึก / ใช้ข้อมูลเท่าที่จำเป็น</strong>
                </button>

                <button type="button" data-work-type="private">
                  <span>Private Job</span>
                  <strong>Straight / Gay + VIP / PN / ต้องเช็กบรีฟละเอียดกว่า</strong>
                </button>
              </div>

              <div class="mmd-session-rebuilt__work-explain" data-work-explain>
                Public Job คือ งานที่จัดการแบบมาตรฐาน ใช้ข้อมูลเท่าที่จำเป็น และไม่ใส่ private note ลึก ๆ
              </div>
            </section>

            <div class="mmd-session-rebuilt__form-row">
              <section class="mmd-session-rebuilt__panel">
                <div class="mmd-session-rebuilt__panel-head">
                  <div>
                    <p>STEP 01</p>
                    <h2>ลูกค้า</h2>
                  </div>
                  <button type="button" data-help-topic="client">?</button>
                </div>

                <div class="mmd-session-rebuilt__fields">
                  <label>
                    <span>ชื่อลูกค้า</span>
                    <input type="text" name="client_name" placeholder="เช่น คุณ A / ชื่อเล่นลูกค้า" autocomplete="off">
                  </label>

                  <label>
                    <span>ระดับสมาชิก</span>
                    <select name="member_tier">
                      <option value="">เลือกสถานะ</option>
                      <option value="standard">Standard</option>
                      <option value="vip">VIP</option>
                      <option value="svip">SVIP</option>
                      <option value="blackcard">Black Card</option>
                    </select>
                  </label>

                  <label>
                    <span>ช่องทางติดต่อ</span>
                    <input type="text" name="contact_channel" placeholder="LINE / Telegram / Phone" autocomplete="off">
                  </label>

                  <label>
                    <span>Client ID / Member ID</span>
                    <input type="text" name="client_id" placeholder="ใส่ถ้ามี" autocomplete="off">
                  </label>
                </div>
              </section>

              <section class="mmd-session-rebuilt__panel">
                <div class="mmd-session-rebuilt__panel-head">
                  <div>
                    <p>STEP 02</p>
                    <h2>วิธีเลือกนายแบบ</h2>
                  </div>
                  <button type="button" data-help-topic="model-mode">?</button>
                </div>

                <div class="mmd-session-rebuilt__work-switch">
                  <button type="button" class="is-active" data-model-mode="named">
                    <span>ลูกค้าระบุชื่อมาแล้ว</span>
                    <strong>ค้นชื่อนายแบบ แล้วเช็กว่ายังเหมาะกับงานนี้ไหม</strong>
                  </button>

                  <button type="button" data-model-mode="recommend">
                    <span>ให้ระบบแนะนำ</span>
                    <strong>ใช้ Search Engine หา model ที่ online และเหมาะกับงาน</strong>
                  </button>
                </div>

                <div class="mmd-session-rebuilt__work-explain" data-model-mode-explain>
                  ถ้าลูกค้าระบุชื่อมาแล้ว ให้ค้นชื่อนั้นก่อน ถ้ายังไม่ระบุ ให้ระบบช่วยคัดคนที่เหมาะกับงานนี้
                </div>
              </section>
            </div>

            <section class="mmd-session-rebuilt__panel" data-work-panel="public">
              <div class="mmd-session-rebuilt__panel-head">
                <div>
                  <p>PUBLIC JOB</p>
                  <h2>รายละเอียดงาน Public</h2>
                </div>
                <button type="button" data-help-topic="public-job">?</button>
              </div>

              <div class="mmd-session-rebuilt__fields mmd-session-rebuilt__fields--four">
                <label>
                  <span>Public Job Type</span>
                  <select name="public_job_type">
                    <option value="">เลือกรูปแบบงาน</option>
                    <option value="travel">Travel</option>
                    <option value="extreme">Extreme</option>
                  </select>
                </label>

                <label>
                  <span>Visibility</span>
                  <select name="visibility">
                    <option value="internal_only">Internal Only</option>
                    <option value="premium_members">Premium Members</option>
                    <option value="vip_members">VIP Members</option>
                    <option value="public_listing">Public Listing</option>
                  </select>
                </label>

                <label>
                  <span>Public Rate</span>
                  <input type="number" name="public_rate" placeholder="0" min="0">
                </label>

                <label>
                  <span>Standard Time</span>
                  <select name="public_duration">
                    <option value="5h">Standard 5 hours</option>
                    <option value="custom">Custom duration</option>
                  </select>
                </label>
              </div>

              <label class="mmd-session-rebuilt__full">
                <span>Public-safe brief</span>
                <textarea name="public_brief" rows="4" placeholder="เขียนบรีฟแบบที่ทีมอ่านเข้าใจ หลีกเลี่ยง private note ลึก ๆ หรือข้อมูลส่วนตัวเกินจำเป็น"></textarea>
              </label>
            </section>

            <section class="mmd-session-rebuilt__panel is-hidden" data-work-panel="private">
              <div class="mmd-session-rebuilt__panel-head">
                <div>
                  <p>PRIVATE JOB</p>
                  <h2>รายละเอียดงาน Private</h2>
                </div>
                <button type="button" data-help-topic="private-job">?</button>
              </div>

              <div class="mmd-session-rebuilt__fields mmd-session-rebuilt__fields--four">
                <label>
                  <span>Role Type</span>
                  <select name="private_role_type">
                    <option value="">เลือก Role</option>
                    <option value="straight">Straight</option>
                    <option value="gay">Gay</option>
                  </select>
                </label>

                <label>
                  <span>Service Level</span>
                  <select name="private_service_level">
                    <option value="">เลือกระดับงาน</option>
                    <option value="vip">VIP</option>
                    <option value="pn">PN</option>
                  </select>
                </label>

                <label>
                  <span>Private Job Type</span>
                  <select name="private_job_type">
                    <option value="">เลือกรูปแบบงาน</option>
                    <option value="private_session">Private Session</option>
                    <option value="companion_experience">Companion Experience</option>
                    <option value="tailored_request">Tailored Request</option>
                    <option value="blackcard_request">Black Card Request</option>
                    <option value="custom_private">Custom Private Brief</option>
                  </select>
                </label>

                <label>
                  <span>ให้บอสเช็กไหม</span>
                  <select name="boss_review">
                    <option value="no">ไม่ต้อง</option>
                    <option value="yes">ต้องให้บอสเช็ก</option>
                  </select>
                </label>
              </div>

              <label class="mmd-session-rebuilt__full">
                <span>Private brief</span>
                <textarea name="private_brief" rows="5" placeholder="สรุปบรีฟส่วนตัวให้ชัด เช่น สิ่งที่ลูกค้าต้องการ ความเหมาะสมของนายแบบ ข้อควรระวัง"></textarea>
              </label>

              <label class="mmd-session-rebuilt__full">
                <span>Admin caution note</span>
                <textarea name="admin_caution" rows="3" placeholder="note เฉพาะทีม เช่น จุดที่ต้องระวัง หรือเหตุผลที่ควร Save Draft ก่อน"></textarea>
              </label>
            </section>

            <section class="mmd-session-rebuilt__panel">
              <div class="mmd-session-rebuilt__panel-head">
                <div>
                  <p>MODEL SEARCH ENGINE</p>
                  <h2>ค้นหานายแบบที่เหมาะกับงานนี้</h2>
                </div>
                <button type="button" data-help-topic="model-search">?</button>
              </div>

              <div class="mmd-session-rebuilt__searchbar">
                <input
                  type="search"
                  name="model_query"
                  placeholder="ค้นหา เช่น Hito / สูง 180 / อายุ 25 / athletic / gay / VIP / online / Korean look"
                  autocomplete="off"
                >
                <button type="button" data-model-search>Search</button>
              </div>

              <div class="mmd-session-rebuilt__fields mmd-session-rebuilt__fields--four">
                <label>
                  <span>Online Status</span>
                  <select name="model_online_filter">
                    <option value="online_first">Online first</option>
                    <option value="online_only">Online only</option>
                    <option value="all">All models</option>
                  </select>
                </label>

                <label>
                  <span>Age Range</span>
                  <select name="model_age_range">
                    <option value="">Any age</option>
                    <option value="18_21">18-21</option>
                    <option value="22_25">22-25</option>
                    <option value="26_30">26-30</option>
                    <option value="31_35">31-35</option>
                    <option value="36_plus">36+</option>
                  </select>
                </label>

                <label>
                  <span>Height</span>
                  <select name="model_height_range">
                    <option value="">Any height</option>
                    <option value="165_170">165-170</option>
                    <option value="171_175">171-175</option>
                    <option value="176_180">176-180</option>
                    <option value="181_185">181-185</option>
                    <option value="186_plus">186+</option>
                  </select>
                </label>

                <label>
                  <span>Body Type</span>
                  <select name="model_body_type">
                    <option value="">Any body</option>
                    <option value="slim">Slim</option>
                    <option value="lean">Lean</option>
                    <option value="athletic">Athletic</option>
                    <option value="muscular">Muscular</option>
                    <option value="big_strong">Big / Strong</option>
                    <option value="soft_cute">Soft / Cute</option>
                  </select>
                </label>
              </div>

              <div class="mmd-session-rebuilt__fields mmd-session-rebuilt__fields--four">
                <label>
                  <span>Look / Style</span>
                  <select name="model_style">
                    <option value="">Any style</option>
                    <option value="cute">Cute</option>
                    <option value="masculine">Masculine</option>
                    <option value="sporty">Sporty</option>
                    <option value="elegant">Elegant</option>
                    <option value="thai">Thai</option>
                    <option value="korean">Korean</option>
                    <option value="international">International</option>
                    <option value="mature">Mature</option>
                  </select>
                </label>

                <label>
                  <span>Role Type</span>
                  <select name="model_role_type">
                    <option value="">Auto from job</option>
                    <option value="straight">Straight</option>
                    <option value="gay">Gay</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </label>

                <label>
                  <span>Service Level</span>
                  <select name="model_service_level">
                    <option value="">Auto from job</option>
                    <option value="travel">Travel</option>
                    <option value="extreme">Extreme</option>
                    <option value="vip">VIP</option>
                    <option value="pn">PN</option>
                    <option value="blackcard">Black Card</option>
                  </select>
                </label>

                <label>
                  <span>Language</span>
                  <select name="model_language">
                    <option value="">Any language</option>
                    <option value="thai">Thai</option>
                    <option value="english">English</option>
                    <option value="chinese">Chinese</option>
                    <option value="japanese">Japanese</option>
                  </select>
                </label>
              </div>

              <div class="mmd-session-rebuilt__model-results" data-model-results>
                <div class="mmd-session-rebuilt__empty">
                  ใส่ keyword หรือเลือก filter เพื่อค้นหานายแบบที่เหมาะกับงานนี้
                </div>
              </div>
            </section>

            <section class="mmd-session-rebuilt__panel">
              <div class="mmd-session-rebuilt__panel-head">
                <div>
                  <p>STEP 03</p>
                  <h2>วัน เวลา และสถานที่</h2>
                </div>
                <button type="button" data-help-topic="schedule">?</button>
              </div>

              <div class="mmd-session-rebuilt__fields mmd-session-rebuilt__fields--three">
                <label>
                  <span>วันที่</span>
                  <input type="date" name="service_date">
                </label>

                <label>
                  <span>เวลาเริ่ม</span>
                  <input type="time" name="service_time">
                </label>

                <label>
                  <span>ระยะเวลา</span>
                  <select name="duration">
                    <option value="">เลือกเวลา</option>
                    <option value="2h">2 ชั่วโมง</option>
                    <option value="3h">3 ชั่วโมง</option>
                    <option value="5h">5 ชั่วโมง</option>
                    <option value="overnight">Overnight</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>

                <label>
                  <span>ชื่อสถานที่</span>
                  <input type="text" name="place_name" placeholder="เช่น The Standard Bangkok / ร้านอาหาร / โรงแรม" autocomplete="off">
                </label>

                <label>
                  <span>Google Map URL</span>
                  <input type="url" name="google_map_url" placeholder="https://maps.google.com/..." autocomplete="off">
                </label>

                <label>
                  <span>สถานะ Session</span>
                  <select name="session_status">
                    <option value="draft">draft</option>
                    <option value="confirmed">confirmed</option>
                    <option value="reminder">reminder</option>
                    <option value="en_route">en_route</option>
                    <option value="arrived">arrived</option>
                    <option value="final_payment_pending">final_payment_pending</option>
                  </select>
                </label>
              </div>
            </section>

            <section class="mmd-session-rebuilt__panel">
              <div class="mmd-session-rebuilt__panel-head">
                <div>
                  <p>STEP 04</p>
                  <h2>ยอดที่ต้องส่งให้ลูกค้า</h2>
                </div>
                <button type="button" data-help-topic="amount">?</button>
              </div>

              <div class="mmd-session-rebuilt__fields">
                <label>
                  <span>ยอดที่ต้องชำระ</span>
                  <input type="number" name="amount_thb" placeholder="0" min="0">
                </label>

                <label>
                  <span>ประเภทของยอดนี้</span>
                  <select name="amount_purpose">
                    <option value="session_amount">ยอด Session</option>
                    <option value="deposit_amount">ยอดมัดจำ</option>
                    <option value="remaining_amount">ยอดคงเหลือ</option>
                    <option value="adjusted_amount">ยอดปรับแก้</option>
                  </select>
                </label>
              </div>

              <label class="mmd-session-rebuilt__full">
                <span>ข้อความสั้น ๆ ให้ลูกค้าเห็น</span>
                <textarea name="client_amount_note" rows="3" placeholder="เช่น ยอดนี้เป็นยอดสำหรับยืนยัน Session ตามบรีฟที่ตกลงไว้"></textarea>
              </label>

              <div class="mmd-session-rebuilt__warning">
                หน้านี้ใช้ส่งยอดให้ลูกค้าเท่านั้น ลูกค้าจะเลือกวิธีจ่ายในขั้นตอนชำระเงินเอง
              </div>
            </section>

            <section class="mmd-session-rebuilt__actions">
              <button type="submit" class="mmd-session-rebuilt__btn mmd-session-rebuilt__btn--primary">
                Create Session
              </button>

              <button type="button" class="mmd-session-rebuilt__btn mmd-session-rebuilt__btn--soft" data-save-draft>
                Save Draft
              </button>

              <button type="reset" class="mmd-session-rebuilt__btn mmd-session-rebuilt__btn--ghost">
                Clear
              </button>
            </section>
          </form>

          <aside class="mmd-session-rebuilt__side">
            <section class="mmd-session-rebuilt__panel mmd-session-rebuilt__sticky">
              <div class="mmd-session-rebuilt__panel-head">
                <div>
                  <p>LIVE DRAFT</p>
                  <h2>Session Preview</h2>
                </div>
              </div>

              <div class="mmd-session-rebuilt__preview" data-session-preview>
                <div><span>session_id</span><strong data-preview="session_id">MMD-DRAFT</strong></div>
                <div><span>work_type</span><strong data-preview="work_type">public</strong></div>
                <div><span>model_mode</span><strong data-preview="model_mode">named</strong></div>
                <div><span>ลูกค้า</span><strong data-preview="client">ยังไม่ระบุ</strong></div>
                <div><span>นายแบบ</span><strong data-preview="model">ยังไม่ระบุ</strong></div>
                <div><span>subtype</span><strong data-preview="subtype">ยังไม่ระบุ</strong></div>
                <div><span>สถานที่</span><strong data-preview="place">ยังไม่ระบุ</strong></div>
                <div><span>ยอด</span><strong data-preview="amount">0 THB</strong></div>
              </div>

              <div class="mmd-session-rebuilt__checklist">
                <p>CHECKLIST</p>
                <label><input type="checkbox" data-check="work"> เลือก Public / Private แล้ว</label>
                <label><input type="checkbox" data-check="client"> เช็คลูกค้าแล้ว</label>
                <label><input type="checkbox" data-check="model"> ใช้ Model Search Engine แล้ว</label>
                <label><input type="checkbox"> เห็น Age / Height / Body ใน Model Card แล้ว</label>
                <label><input type="checkbox" data-check="brief"> อ่านบรีฟครบแล้ว</label>
                <label><input type="checkbox" data-check="place"> ตรวจชื่อสถานที่และ Google Map แล้ว</label>
                <label><input type="checkbox" data-check="amount"> ตรวจยอดที่ต้องส่งให้ลูกค้าแล้ว</label>
              </div>

              <div id="mmd-session-rebuilt-result" class="mmd-session-rebuilt__route">
                <span>SĪGIL</span>
                <strong>Internal Create Session</strong>
                <p>
                  ถ้าข้อมูลยังไม่ครบ ให้เก็บเป็น Draft ก่อน อย่าเปิด Session จริงจากบรีฟที่ยังไม่นิ่ง
                </p>
              </div>
            </section>
          </aside>
        </main>
      </div>
    </section>

    <script>
      (function () {
        const root = document.querySelector('[data-mmd-session-rebuilt]');
        if (!root) return;

        const form = document.getElementById('mmdSessionRebuiltForm');
        if (!form) return;

        const statusEl = document.getElementById('mmd-session-rebuilt-status');
        const modelResults = root.querySelector('[data-model-results]');
        const modal = root.querySelector('[data-help-modal]');
        const helpBody = root.querySelector('[data-help-body]');
        const helpTitle = document.getElementById('mmdSessionHelpTitle');

        let selectedWorkType = 'public';
        let selectedModelMode = 'named';
        let selectedModel = null;
        let currentModels = [];
        let lastSearchController = null;

        const API = {
          modelSearch: '/v1/admin/models/search',
          createSession: '/v1/admin/jobs/create-session'
        };

        const fallbackModels = [
          {
            model_id: 'hito',
            model_name: 'HITO',
            age: 24,
            height_cm: 180,
            body_type: 'athletic',
            style_tags: ['masculine', 'clean', 'thai'],
            folders: ['travel', 'extreme', 'vip', 'pn'],
            role_type: ['straight', 'gay'],
            service_level: ['vip', 'pn'],
            language_tags: ['thai', 'english'],
            availability: 'online',
            status: 'available',
            reliability_score: 94,
            fit_score: 96,
            note: 'เหมาะกับงานที่ต้องการความนิ่ง สุขุม และเชื่อถือได้'
          },
          {
            model_id: 'kenji',
            model_name: 'Kenji',
            age: 27,
            height_cm: 178,
            body_type: 'lean',
            style_tags: ['elegant', 'mature', 'clean'],
            folders: ['travel', 'vip', 'pn'],
            role_type: ['gay', 'flexible'],
            service_level: ['vip', 'pn'],
            language_tags: ['thai', 'english'],
            availability: 'online',
            status: 'available',
            reliability_score: 98,
            fit_score: 91,
            note: 'เหมาะกับลูกค้าที่ต้องการการดูแลละเอียดและต่อเนื่อง'
          },
          {
            model_id: 'hiei',
            model_name: 'Hiei',
            age: 27,
            height_cm: 183,
            body_type: 'muscular',
            style_tags: ['masculine', 'sporty', 'mature'],
            folders: ['extreme', 'vip', 'pn'],
            role_type: ['straight'],
            service_level: ['vip', 'pn'],
            language_tags: ['thai', 'english'],
            availability: 'online',
            status: 'available',
            reliability_score: 89,
            fit_score: 93,
            note: 'เหมาะกับงานที่ต้องการ physical presence และความนิ่งแบบเข้ม'
          },
          {
            model_id: 'hima',
            model_name: 'Hima',
            age: null,
            height_cm: 174,
            body_type: 'lean',
            style_tags: ['sporty', 'cute', 'international'],
            folders: ['travel', 'extreme'],
            role_type: ['gay', 'flexible'],
            service_level: ['vip'],
            language_tags: ['thai', 'english'],
            availability: 'online',
            status: 'available',
            reliability_score: 86,
            fit_score: 88,
            note: 'เหมาะกับงานที่ต้องการพลังสดใสและ interaction สูง'
          }
        ];

        const helpCopy = {
          'work-type': {
            title: 'Public / Private คืออะไร',
            body: 'Public คือ Travel / Extreme ที่ใช้ข้อมูลเท่าที่จำเป็น ส่วน Private คือ Straight / Gay + VIP / PN ที่ต้องเช็กบรีฟ ลูกค้า นายแบบ เวลา สถานที่ และความเหมาะสมละเอียดกว่า ถ้ายังไม่มั่นใจ ให้ Save Draft ก่อนครับ'
          },
          client: {
            title: 'เช็คลูกค้า',
            body: 'เช็คลูกค้าว่าเป็นใคร ระดับสมาชิกอะไร มีช่องทางติดต่อชัดไหม และข้อมูลพอจะเปิดงานจริงหรือยัง ถ้ายังไม่ชัด อย่าเปิด Session จริง ให้ Save Draft ไว้ก่อน'
          },
          'model-mode': {
            title: 'วิธีเลือกนายแบบ',
            body: 'ถ้าลูกค้าระบุชื่อมาแล้ว ให้ค้นชื่อนั้นก่อนด้วยตัวอักษรภาษาอังกฤษ ถ้าลูกค้ายังไม่ได้ระบุชื่อ ให้ใช้ Search Engine คัดจากสเปค เช่น อายุ ส่วนสูง รูปร่าง Role Type, Service Level และสถานะ online'
          },
          'public-job': {
            title: 'รายละเอียดงาน Public',
            body: 'งาน Public ต้องอ่านง่าย ใช้ข้อมูลเท่าที่จำเป็น และไม่ใส่ข้อมูลส่วนตัวลึก ๆ เหมาะกับ Travel / Extreme หรือบรีฟมาตรฐาน'
          },
          'private-job': {
            title: 'รายละเอียดงาน Private',
            body: 'งาน Private ต้องเลือก Role Type และ Service Level เพื่อช่วยคัดนายแบบให้ตรงขึ้น ต้องมีบรีฟที่ละเอียดพอ และควร Save Draft ถ้ายังไม่แน่ใจ'
          },
          'model-search': {
            title: 'Model Search Engine',
            body: 'ใช้ค้นจากชื่อหรือสเปคได้ เช่น Hito, สูง 180, athletic, gay, VIP, online. Age ต้องโชว์ในผลลัพธ์ แต่ไม่จำเป็นต้องกรอกเอง ถ้า Age missing ให้ถือว่า profile ยังไม่ครบ'
          },
          schedule: {
            title: 'วัน เวลา และสถานที่',
            body: 'เช็กวันที่ เวลา ระยะเวลา ชื่อสถานที่ และ Google Map URL ให้ครบก่อนสร้าง Session. ตอนนี้สถานที่ใช้ชื่อสถานที่กับ URL Google Map'
          },
          amount: {
            title: 'ยอดที่ต้องส่งให้ลูกค้า',
            body: 'ใส่แค่ยอดที่ต้องส่งให้ลูกค้า ลูกค้าจะเลือกวิธีจ่ายเองในขั้นตอนชำระเงิน หน้านี้ไม่ต้องเลือก payment method'
          },
          'create-blocked': {
            title: 'ยังสร้าง Session ไม่ได้',
            body: 'ข้อมูลยังไม่ครบหรือยังไม่ชัวร์ ให้ Save Draft ไว้ก่อน แล้วค่อยกลับมาเช็กกับพี่'
          }
        };

        function escapeHTML(value) {
          return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        }

        function setStatus(message, tone) {
          if (!statusEl) return;
          statusEl.textContent = message || '';
          statusEl.dataset.tone = tone || '';
        }

        function fieldValue(name) {
          const field = form.elements[name];
          return field && field.value ? String(field.value).trim() : '';
        }

        function fieldNumber(name) {
          const raw = fieldValue(name);
          const num = Number(raw || 0);
          return Number.isFinite(num) ? num : 0;
        }

        function createDraftSessionId() {
          const date = new Date();
          const yyyy = String(date.getFullYear());
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          const seed = Math.random().toString(36).slice(2, 8).toUpperCase();
          return \`MMD-\${yyyy}\${mm}\${dd}-\${seed}\`;
        }

        const draftSessionId = createDraftSessionId();

        function setPreview(key, value) {
          const node = root.querySelector(\`[data-preview="\${key}"]\`);
          if (node) node.textContent = value;
        }

        function setReady(key, isReady, text) {
          const item = root.querySelector(\`[data-ready="\${key}"]\`);

          if (item) {
            item.classList.toggle('is-ready', Boolean(isReady));
            const em = item.querySelector('em');
            if (em) em.textContent = text;
          }

          const idMap = {
            work: 'readyWork',
            client: 'readyClient',
            match: 'readyMatch',
            model: 'readyModel',
            brief: 'readyBrief',
            place: 'readyPlace',
            amount: 'readyAmount',
            create: 'readyCreate'
          };

          const byId = document.getElementById(idMap[key]);
          if (byId) byId.textContent = text;
        }

        function setCheck(key, checked) {
          const box = root.querySelector(\`[data-check="\${key}"]\`);
          if (box) box.checked = Boolean(checked);
        }

        function isLikelyMapUrl(url) {
          const u = String(url || '').toLowerCase();
          return (
            u.includes('maps.google') ||
            u.includes('google.com/maps') ||
            u.includes('maps.app.goo.gl') ||
            u.includes('goo.gl/maps')
          );
        }

        function currentSubtype() {
          if (selectedWorkType === 'public') return fieldValue('public_job_type');
          return fieldValue('private_job_type');
        }

        function currentBrief() {
          if (selectedWorkType === 'public') return fieldValue('public_brief');
          return fieldValue('private_brief');
        }

        function getMatchReady() {
          if (selectedWorkType === 'public') {
            return Boolean(fieldValue('public_job_type'));
          }

          return Boolean(
            fieldValue('private_role_type') &&
            fieldValue('private_service_level') &&
            fieldValue('private_job_type')
          );
        }

        function updatePreview() {
          const client = fieldValue('client_name');
          const subtype = currentSubtype();
          const brief = currentBrief();
          const amount = fieldNumber('amount_thb');
          const placeName = fieldValue('place_name');
          const mapUrl = fieldValue('google_map_url');

          const matchReady = getMatchReady();
          const placeReady = Boolean(placeName && isLikelyMapUrl(mapUrl));
          const amountReady = amount > 0;
          const briefReady = brief.length >= 20;
          const clientReady = Boolean(client);
          const modelReady = Boolean(selectedModel);

          setPreview('session_id', draftSessionId);
          setPreview('work_type', selectedWorkType);
          setPreview('model_mode', selectedModelMode);
          setPreview('client', client || 'ยังไม่ระบุ');
          setPreview('model', selectedModel ? selectedModel.model_name : 'ยังไม่ระบุ');
          setPreview('subtype', subtype || 'ยังไม่ระบุ');
          setPreview('place', placeName || 'ยังไม่ระบุ');
          setPreview('amount', \`\${amount.toLocaleString('th-TH')} THB\`);

          setReady('work', Boolean(selectedWorkType), selectedWorkType);
          setReady('client', clientReady, clientReady ? 'Ready' : 'Waiting');
          setReady('match', matchReady, matchReady ? 'Ready' : 'Waiting');
          setReady('model', modelReady, modelReady ? 'Ready' : 'Waiting');
          setReady('brief', briefReady, briefReady ? 'Clear' : 'Draft');
          setReady('place', placeReady, placeReady ? 'Ready' : 'Waiting');
          setReady('amount', amountReady, amountReady ? 'Ready' : 'Waiting');

          setCheck('work', Boolean(selectedWorkType));
          setCheck('client', clientReady);
          setCheck('model', modelReady);
          setCheck('brief', briefReady);
          setCheck('place', placeReady);
          setCheck('amount', amountReady);

          const canCreate = Boolean(
            selectedWorkType &&
            clientReady &&
            modelReady &&
            subtype &&
            matchReady &&
            briefReady &&
            placeReady &&
            amountReady &&
            fieldValue('service_date') &&
            fieldValue('service_time') &&
            fieldValue('duration')
          );

          setReady('create', canCreate, canCreate ? 'Ready' : 'Locked');

          return {
            canCreate,
            clientReady,
            modelReady,
            matchReady,
            briefReady,
            placeReady,
            amountReady
          };
        }

        function setWorkType(type) {
          selectedWorkType = type === 'private' ? 'private' : 'public';

          root.querySelectorAll('[data-work-type]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.workType === selectedWorkType);
          });

          root.querySelectorAll('[data-work-panel]').forEach((panel) => {
            panel.classList.toggle('is-hidden', panel.dataset.workPanel !== selectedWorkType);
          });

          const explain = root.querySelector('[data-work-explain]');
          if (explain) {
            explain.textContent = selectedWorkType === 'public'
              ? 'Public Job คือ งานมาตรฐาน เช่น Travel / Extreme ใช้ข้อมูลเท่าที่จำเป็น และไม่ใส่ private note ลึก ๆ'
              : 'Private Job คือ งานส่วนตัว ต้องเลือก Role Type และ Service Level เพื่อช่วยคัดนายแบบให้ตรงขึ้น';
          }

          selectedModel = null;
          renderModelCards(currentModels.length ? currentModels : fallbackModels);
          updatePreview();

          setStatus(
            selectedWorkType === 'public'
              ? 'เลือก Public Job แล้ว'
              : 'เลือก Private Job แล้ว เช็ก Role Type และ Service Level ให้ครบก่อนส่ง',
            'ok'
          );
        }

        function setModelMode(mode) {
          selectedModelMode = mode === 'recommend' ? 'recommend' : 'named';

          root.querySelectorAll('[data-model-mode]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.modelMode === selectedModelMode);
          });

          const explain = root.querySelector('[data-model-mode-explain]');
          if (explain) {
            explain.textContent = selectedModelMode === 'named'
              ? 'ลูกค้าระบุชื่อมาแล้ว ให้ค้นชื่อนั้นก่อนด้วยตัวอักษรภาษาอังกฤษ แล้วเช็กว่ายังเหมาะกับงานนี้ไหม'
              : 'ลูกค้ายังไม่ระบุ ให้ใช้ Search Engine ช่วยคัดจาก Age, Height, Body, Role, Level และ Online Status';
          }

          selectedModel = null;
          renderModelCards(currentModels.length ? currentModels : fallbackModels);
          updatePreview();

          setStatus(
            selectedModelMode === 'named'
              ? 'ใช้โหมดค้นหาจากชื่อนายแบบ'
              : 'ใช้โหมด Search Engine แนะนำจากสเปค',
            'ok'
          );
        }

        function normalizeArray(value) {
          if (Array.isArray(value)) return value;

          if (typeof value === 'string' && value.trim()) {
            return value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean);
          }

          return [];
        }

        function normalizeApiModel(item) {
          return {
            model_id:
              item.model_id ||
              item.id ||
              item.record_id ||
              item.unique_key ||
              item.name ||
              item.model_name ||
              \`model-\${Math.random().toString(36).slice(2)}\`,
            model_name:
              item.model_name ||
              item.name ||
              item.nickname ||
              item.display_name ||
              'Unnamed model',
            age:
              item.age ||
              item.model_age ||
              item.age_years ||
              null,
            height_cm:
              item.height_cm ||
              item.height ||
              item.model_height_cm ||
              null,
            body_type:
              item.body_type ||
              item.body ||
              item.model_body_type ||
              'n/a',
            style_tags:
              normalizeArray(item.style_tags || item.tags || item.look_tags),
            folders:
              normalizeArray(item.folders || item.service_tags || item.categories),
            role_type:
              normalizeArray(item.role_type || item.roles || item.role_tags),
            service_level:
              normalizeArray(item.service_level || item.levels || item.package_tags),
            language_tags:
              normalizeArray(item.language_tags || item.languages),
            availability:
              item.availability ||
              item.online_status ||
              item.status_online ||
              item.model_console_status ||
              'unknown',
            status:
              item.status ||
              item.model_status ||
              'available',
            reliability_score:
              item.reliability_score ||
              item.reliability ||
              0,
            fit_score:
              item.fit_score ||
              item.score ||
              item.match_score ||
              0,
            note:
              item.note ||
              item.summary ||
              item.short_summary ||
              'ยังไม่มี note'
          };
        }

        function getManualFilters() {
          return {
            query: fieldValue('model_query').toLowerCase(),
            online: fieldValue('model_online_filter'),
            ageRange: fieldValue('model_age_range'),
            heightRange: fieldValue('model_height_range'),
            bodyType: fieldValue('model_body_type'),
            style: fieldValue('model_style'),
            roleType: fieldValue('model_role_type'),
            serviceLevel: fieldValue('model_service_level'),
            language: fieldValue('model_language')
          };
        }

        function inAgeRange(model, range) {
          if (!range) return true;

          const age = Number(model.age || 0);
          if (!age) return false;

          if (range === '18_21') return age >= 18 && age <= 21;
          if (range === '22_25') return age >= 22 && age <= 25;
          if (range === '26_30') return age >= 26 && age <= 30;
          if (range === '31_35') return age >= 31 && age <= 35;
          if (range === '36_plus') return age >= 36;

          return true;
        }

        function inHeightRange(model, range) {
          if (!range) return true;

          const height = Number(model.height_cm || 0);
          if (!height) return false;

          if (range === '165_170') return height >= 165 && height <= 170;
          if (range === '171_175') return height >= 171 && height <= 175;
          if (range === '176_180') return height >= 176 && height <= 180;
          if (range === '181_185') return height >= 181 && height <= 185;
          if (range === '186_plus') return height >= 186;

          return true;
        }

        function modelMatchesFilters(model) {
          const filters = getManualFilters();

          const haystack = [
            model.model_name,
            model.note,
            model.body_type,
            model.availability,
            model.status,
            ...(model.style_tags || []),
            ...(model.folders || []),
            ...(model.role_type || []),
            ...(model.service_level || []),
            ...(model.language_tags || [])
          ]
            .join(' ')
            .toLowerCase();

          if (filters.query && !haystack.includes(filters.query)) return false;

          if (filters.online === 'online_only' && model.availability !== 'online') return false;
          if (filters.bodyType && model.body_type !== filters.bodyType) return false;
          if (filters.style && !(model.style_tags || []).includes(filters.style)) return false;
          if (filters.roleType && !(model.role_type || []).includes(filters.roleType)) return false;
          if (filters.serviceLevel && !(model.service_level || []).includes(filters.serviceLevel)) return false;
          if (filters.language && !(model.language_tags || []).includes(filters.language)) return false;
          if (!inAgeRange(model, filters.ageRange)) return false;
          if (!inHeightRange(model, filters.heightRange)) return false;

          return true;
        }

        function sortModels(models) {
          const filters = getManualFilters();

          return models.slice().sort((a, b) => {
            if (filters.online === 'online_first') {
              if (a.availability === 'online' && b.availability !== 'online') return -1;
              if (a.availability !== 'online' && b.availability === 'online') return 1;
            }

            return Number(b.fit_score || 0) - Number(a.fit_score || 0);
          });
        }

        function localFilteredFallbackModels() {
          return sortModels(fallbackModels.filter(modelMatchesFilters));
        }

        function renderModelCards(models) {
          if (!modelResults) return;

          currentModels = Array.isArray(models) ? models : [];

          if (!currentModels.length) {
            modelResults.innerHTML = '<div class="mmd-session-rebuilt__empty">ยังไม่พบนายแบบที่ตรง filter นี้ ลองเปลี่ยน Online Filter หรือ Save Draft แล้วถามบรีฟเพิ่ม</div>';
            return;
          }

          modelResults.innerHTML = currentModels.map((model) => {
            const modelId = String(model.model_id || '');
            const isSelected = selectedModel && String(selectedModel.model_id) === modelId;
            const onlineClass = model.availability === 'online' ? ' is-online' : '';
            const ageTag = model.age
              ? \`<em class="mmd-session-rebuilt__tag is-age">Age \${escapeHTML(model.age)}</em>\`
              : '<em class="mmd-session-rebuilt__tag is-missing">Age missing</em>';

            return \`
              <button type="button" class="mmd-session-rebuilt__model-card\${isSelected ? ' is-selected' : ''}" data-select-model="\${escapeHTML(modelId)}">
                <div class="mmd-session-rebuilt__model-avatar">\${escapeHTML(String(model.model_name || 'M').charAt(0).toUpperCase())}</div>

                <div>
                  <strong>\${escapeHTML(model.model_name)}</strong>
                  <span>\${escapeHTML(model.note)}</span>
                  <span>\${escapeHTML(model.height_cm || '-')}cm · \${escapeHTML(model.body_type || 'body n/a')} · Fit \${escapeHTML(model.fit_score || 0)}% · Reliability \${escapeHTML(model.reliability_score || 0)}%</span>
                </div>

                <div class="mmd-session-rebuilt__model-tags">
                  \${ageTag}
                  <em class="mmd-session-rebuilt__tag">\${escapeHTML(model.height_cm || '-')}cm</em>
                  <em class="mmd-session-rebuilt__tag">\${escapeHTML(model.body_type || 'body n/a')}</em>
                  <em class="mmd-session-rebuilt__tag\${onlineClass}">\${escapeHTML(model.availability || 'unknown')}</em>
                  <em class="mmd-session-rebuilt__tag">\${escapeHTML(model.status || 'available')}</em>
                </div>
              </button>
            \`;
          }).join('');

          modelResults.querySelectorAll('[data-select-model]').forEach((button) => {
            button.addEventListener('click', () => {
              selectedModel = currentModels.find((model) => {
                return String(model.model_id) === String(button.dataset.selectModel);
              }) || null;

              renderModelCards(currentModels);
              updatePreview();

              setStatus(
                selectedModel ? \`เลือกนายแบบ \${selectedModel.model_name} แล้ว\` : '',
                'ok'
              );
            });
          });
        }

        function buildSearchParams() {
          const params = new URLSearchParams();

          const query = fieldValue('model_query');
          if (query) params.set('q', query);

          params.set('limit', '12');
          params.set('work_type', selectedWorkType);
          params.set('model_mode', selectedModelMode);

          const filters = {
            online: fieldValue('model_online_filter'),
            age_range: fieldValue('model_age_range'),
            height_range: fieldValue('model_height_range'),
            body_type: fieldValue('model_body_type'),
            style: fieldValue('model_style'),
            role_type: fieldValue('model_role_type'),
            service_level: fieldValue('model_service_level'),
            language: fieldValue('model_language')
          };

          Object.keys(filters).forEach((key) => {
            if (filters[key]) params.set(key, filters[key]);
          });

          return params;
        }

        async function runModelSearch() {
          const params = buildSearchParams();

          if (lastSearchController) {
            lastSearchController.abort();
          }

          lastSearchController = new AbortController();

          setStatus('กำลังค้นหานายแบบจาก Model Console...', 'loading');

          try {
            const response = await fetch(\`\${API.modelSearch}?\${params.toString()}\`, {
              method: 'GET',
              credentials: 'include',
              headers: { Accept: 'application/json' },
              signal: lastSearchController.signal
            });

            if (response.status === 401) {
              setStatus('ยังไม่ได้รับสิทธิ์ admin session หรือ cookie หมดอายุ กรุณา login ใหม่', 'error');
              renderModelCards(localFilteredFallbackModels());
              return;
            }

            const data = await response.json().catch(() => ({}));

            if (!response.ok || data.ok === false) {
              setStatus(data.error || 'ค้นหาไม่สำเร็จ ใช้ fallback list ชั่วคราว', 'error');
              renderModelCards(localFilteredFallbackModels());
              return;
            }

            const items = Array.isArray(data.items)
              ? data.items.map(normalizeApiModel)
              : [];

            selectedModel = null;
            renderModelCards(items);
            updatePreview();

            setStatus(
              items.length
                ? \`ค้นหาสำเร็จ พบ \${items.length} รายการ\`
                : 'ค้นหาสำเร็จ แต่ยังไม่พบ model ที่ตรงเงื่อนไข',
              items.length ? 'ok' : 'error'
            );
          } catch (error) {
            if (error.name === 'AbortError') return;

            console.error('Model search failed:', error);
            setStatus('เชื่อมต่อ model search ไม่สำเร็จ ใช้ fallback list ชั่วคราว', 'error');
            renderModelCards(localFilteredFallbackModels());
          }
        }

        function buildPayload(status) {
          const amount = fieldNumber('amount_thb');

          return {
            session_id: draftSessionId,
            status: status || fieldValue('session_status') || 'draft',
            work_type: selectedWorkType,
            model_selection_mode: selectedModelMode,
            subtype: currentSubtype(),

            client_name: fieldValue('client_name'),
            member_tier: fieldValue('member_tier'),
            contact_channel: fieldValue('contact_channel'),
            client_id: fieldValue('client_id'),

            model: selectedModel,

            schedule: {
              date: fieldValue('service_date'),
              time: fieldValue('service_time'),
              duration: fieldValue('duration')
            },

            location: {
              place_name: fieldValue('place_name'),
              google_map_url: fieldValue('google_map_url')
            },

            amount: {
              amount_thb: amount,
              amount_purpose: fieldValue('amount_purpose'),
              client_amount_note: fieldValue('client_amount_note')
            },

            public: selectedWorkType === 'public'
              ? {
                  public_job_type: fieldValue('public_job_type'),
                  visibility: fieldValue('visibility'),
                  public_rate: fieldNumber('public_rate'),
                  public_duration: fieldValue('public_duration'),
                  public_brief: fieldValue('public_brief')
                }
              : null,

            private: selectedWorkType === 'private'
              ? {
                  role_type: fieldValue('private_role_type'),
                  service_level: fieldValue('private_service_level'),
                  private_job_type: fieldValue('private_job_type'),
                  boss_review: fieldValue('boss_review'),
                  private_brief: fieldValue('private_brief'),
                  admin_caution: fieldValue('admin_caution')
                }
              : null,

            meta: {
              source: 'internal_admin_create_session',
              ui_version: 'mmd-session-rebuilt-lv12',
              created_from_cookie_session: true
            }
          };
        }

        function validateCreatePayload() {
          const missing = [];

          if (!selectedWorkType) missing.push('Public / Private');
          if (!fieldValue('client_name')) missing.push('ชื่อลูกค้า');
          if (!selectedModel) missing.push('นายแบบ');
          if (!currentSubtype()) missing.push('รูปแบบงาน');

          if (selectedWorkType === 'private') {
            if (!fieldValue('private_role_type')) missing.push('Role Type');
            if (!fieldValue('private_service_level')) missing.push('Service Level');
          }

          if (currentBrief().length < 20) missing.push('Brief อย่างน้อย 20 ตัวอักษร');
          if (!fieldValue('service_date')) missing.push('วันที่');
          if (!fieldValue('service_time')) missing.push('เวลาเริ่ม');
          if (!fieldValue('duration')) missing.push('ระยะเวลา');
          if (!fieldValue('place_name')) missing.push('ชื่อสถานที่');
          if (!isLikelyMapUrl(fieldValue('google_map_url'))) missing.push('Google Map URL');
          if (fieldNumber('amount_thb') <= 0) missing.push('ยอดที่ต้องส่งให้ลูกค้า');

          return missing;
        }

        async function postSession(payload, isDraft) {
          const endpoint = isDraft
            ? \`\${API.createSession}?draft=1\`
            : API.createSession;

          const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const data = await response.json().catch(() => ({}));

          if (response.status === 401) {
            throw new Error('unauthorized');
          }

          if (!response.ok || data.ok === false) {
            const error = new Error(data.error || 'request_failed');
            error.data = data;
            error.status = response.status;
            throw error;
          }

          return data;
        }

        function openHelp(topic, override) {
          const item = override || helpCopy[topic] || {
            title: 'คำอธิบาย',
            body: 'ถ้ายังไม่มั่นใจ ให้ Save Draft ก่อนครับ'
          };

          if (helpTitle) helpTitle.textContent = item.title;
          if (helpBody) helpBody.textContent = item.body;
          if (modal) modal.setAttribute('aria-hidden', 'false');
        }

        function closeHelp() {
          if (modal) modal.setAttribute('aria-hidden', 'true');
        }

        function wireEvents() {
          root.querySelectorAll('[data-work-type]').forEach((button) => {
            button.addEventListener('click', () => setWorkType(button.dataset.workType));
          });

          root.querySelectorAll('[data-model-mode]').forEach((button) => {
            button.addEventListener('click', () => setModelMode(button.dataset.modelMode));
          });

          root.querySelector('[data-model-search]')?.addEventListener('click', runModelSearch);

          root.querySelectorAll('[data-help-topic]').forEach((button) => {
            button.addEventListener('click', () => openHelp(button.dataset.helpTopic));
          });

          root.querySelectorAll('[data-help-close]').forEach((button) => {
            button.addEventListener('click', closeHelp);
          });

          document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeHelp();
          });

          root.querySelectorAll('[data-scroll-target]').forEach((button) => {
            button.addEventListener('click', () => {
              const target = document.querySelector(button.dataset.scrollTarget);
              if (!target) return;

              root.querySelectorAll('[data-scroll-target]').forEach((chip) => {
                chip.classList.remove('is-active');
              });

              button.classList.add('is-active');
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          });

          root.querySelector('[data-save-draft]')?.addEventListener('click', async () => {
            const payload = buildPayload('draft');
            console.log('SĪGIL Save Draft Payload:', payload);

            setStatus('กำลัง Save Draft...', 'loading');

            try {
              const result = await postSession(payload, true);
              console.log('SĪGIL Save Draft Result:', result);
              setStatus('Save Draft แล้วครับ พี่จะเข้ามาตรวจสอบให้ทีหลัง', 'ok');
            } catch (error) {
              console.error(error);

              setStatus(
                error.message === 'unauthorized'
                  ? 'admin session หมดอายุ กรุณา login ใหม่'
                  : 'Save Draft ไม่สำเร็จ แต่ payload ถูก log ไว้ใน console แล้ว',
                'error'
              );
            }
          });

          form.addEventListener('input', () => {
            updatePreview();
          });

          form.addEventListener('change', () => {
            updatePreview();

            const activeName = document.activeElement && document.activeElement.name;
            const modelFilterNames = [
              'model_online_filter',
              'model_age_range',
              'model_height_range',
              'model_body_type',
              'model_style',
              'model_role_type',
              'model_service_level',
              'model_language'
            ];

            if (modelFilterNames.includes(activeName)) {
              renderModelCards(localFilteredFallbackModels());
            }
          });

          const modelQuery = form.elements.model_query;

          if (modelQuery) {
            let typingTimer = null;

            modelQuery.addEventListener('input', () => {
              window.clearTimeout(typingTimer);

              typingTimer = window.setTimeout(() => {
                renderModelCards(localFilteredFallbackModels());
                updatePreview();
              }, 180);
            });

            modelQuery.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                runModelSearch();
              }
            });
          }

          form.addEventListener('reset', () => {
            setTimeout(() => {
              selectedWorkType = 'public';
              selectedModelMode = 'named';
              selectedModel = null;
              currentModels = fallbackModels.slice();

              setWorkType('public');
              setModelMode('named');
              renderModelCards(fallbackModels);
              updatePreview();
              setStatus('', '');
            }, 0);
          });

          form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const missing = validateCreatePayload();

            if (missing.length) {
              const body = \`ข้อมูลที่ยังต้องเช็ก: \${missing.join(', ')}. ถ้ายังไม่ชัวร์ ให้ Save Draft ไว้ก่อนครับ\`;

              setStatus(\`ยังไม่ควรสร้าง Session นี้ ขาด: \${missing.join(', ')}\`, 'error');
              openHelp('create-blocked', {
                title: 'ยังสร้าง Session ไม่ได้',
                body
              });

              return;
            }

            const payload = buildPayload('draft');
            console.log('SĪGIL Create Session Payload:', payload);

            setStatus('กำลังสร้าง Session...', 'loading');

            try {
              const result = await postSession(payload, false);
              console.log('SĪGIL Create Session Result:', result);
              setStatus('สร้าง Session สำเร็จแล้วครับ', 'ok');
            } catch (error) {
              console.error(error);

              setStatus(
                error.message === 'unauthorized'
                  ? 'admin session หมดอายุ กรุณา login ใหม่'
                  : 'สร้าง Session ไม่สำเร็จ ตรวจ console หรือ worker response อีกครั้ง',
                'error'
              );
            }
          });
        }

        function init() {
          currentModels = fallbackModels.slice();

          wireEvents();
          setWorkType('public');
          setModelMode('named');
          renderModelCards(fallbackModels);
          updatePreview();
          setStatus('', '');
        }

        init();
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function renderCreateSessionPage(method) {
  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin สร้างเซสชัน</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08070a;
        --panel: rgba(19,15,24,.82);
        --line: rgba(247,240,232,.14);
        --text: #f7f0e8;
        --muted: #c4b3a7;
        --gold: #d1a66a;
        --success: #9ad7b2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 24px;
        color: var(--text);
        background: radial-gradient(circle at top, rgba(164,91,91,.18), transparent 28%), radial-gradient(circle at bottom right, rgba(95,127,132,.12), transparent 30%), linear-gradient(180deg, #110d14 0%, #09080d 52%, #060507 100%);
        font-family: Baskerville, "Iowan Old Style", Palatino, Georgia, serif;
      }
      .shell {
        width: min(100%, 1040px);
        margin: 0 auto;
        padding: 32px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--panel);
        box-shadow: 0 24px 80px rgba(0,0,0,.35);
        backdrop-filter: blur(18px);
      }
      .topbar { display:flex; justify-content:space-between; gap:16px; align-items:center; margin-bottom:24px; }
      .kicker { margin:0 0 10px; color:var(--gold); font:600 .8rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.24em; text-transform:uppercase; }
      h1 { margin:0; font-size:clamp(2.1rem,7vw,4rem); line-height:.95; letter-spacing:-.04em; }
      .lead { margin:16px 0 0; color:var(--muted); line-height:1.7; max-width:60ch; }
      form { display:grid; gap:18px; margin-top:28px; }
      .grid { display:grid; gap:16px; grid-template-columns:repeat(2, minmax(0,1fr)); }
      .grid-full { grid-column:1 / -1; }
      label { display:grid; gap:8px; color:var(--gold); font:600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.16em; text-transform:uppercase; }
      input, textarea, select { width:100%; min-height:52px; padding:14px 16px; border:1px solid var(--line); border-radius:16px; background:rgba(7,6,10,.72); color:var(--text); font:inherit; }
      textarea { min-height:110px; resize:vertical; }
      select { min-height:148px; padding:10px 12px; }
      .actions { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
      button { min-height:48px; padding:0 18px; border-radius:999px; border:1px solid rgba(209,166,106,.36); background:linear-gradient(135deg, rgba(209,166,106,.24), rgba(164,91,91,.28)); color:var(--text); font:600 .92rem/1 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; }
      .ghost { background:transparent; }
      .status { min-height:1.2em; margin:0; color:var(--muted); }
      .status.error { color:#f2b0b0; }
      .status.success { color:var(--success); }
      .hint { margin:0; color:var(--muted); font-size:.92rem; }
      .summary-grid { display:grid; gap:14px; grid-template-columns:repeat(2, minmax(0,1fr)); margin-top:18px; }
      .summary-card { padding:16px 18px; border:1px solid var(--line); border-radius:18px; background:rgba(255,255,255,.03); }
      .summary-label { margin:0 0 8px; color:var(--gold); font:600 .74rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.14em; text-transform:uppercase; }
      .summary-value { margin:0; color:var(--text); line-height:1.6; white-space:pre-wrap; word-break:break-word; }
      .asset-stack { display:grid; gap:12px; }
      .asset-box { padding:14px 16px; border:1px solid var(--line); border-radius:16px; background:rgba(255,255,255,.025); }
      .asset-box-title { margin:0 0 6px; color:var(--text); font:600 .98rem/1.3 "Avenir Next", "Gill Sans", sans-serif; }
      .asset-box-meta { margin:0; color:var(--muted); line-height:1.5; white-space:pre-wrap; }
      .asset-links { display:grid; gap:10px; margin-top:10px; }
      .asset-link { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:12px 14px; border:1px solid var(--line); border-radius:14px; background:rgba(7,6,10,.5); }
      .asset-link-label { margin:0; color:var(--text); }
      .asset-link-meta { margin:2px 0 0; color:var(--muted); font-size:.9rem; }
      .asset-link a { color:var(--gold); text-decoration:none; font:600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.1em; text-transform:uppercase; }
      .asset-empty { color:var(--muted); }
      .quick-grid { display:grid; gap:16px; grid-template-columns:minmax(0,1fr); }
      .result-block[hidden] { display:none; }
      details.advanced { margin-top:8px; border:1px solid var(--line); border-radius:20px; background:rgba(255,255,255,.02); padding:8px 16px 16px; }
      details.advanced > summary { cursor:pointer; color:var(--gold); font:600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.16em; text-transform:uppercase; padding:10px 0; }
      pre { overflow:auto; padding:18px; border-radius:20px; border:1px solid var(--line); background:rgba(7,6,10,.72); color:var(--text); font:.9rem/1.6 SFMono-Regular, Consolas, Menlo, monospace; }
      @media (max-width: 720px) { .grid, .summary-grid, .quick-grid { grid-template-columns:1fr; } .topbar { align-items:flex-start; flex-direction:column; } }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="topbar">
        <div>
          <p class="kicker">Internal Admin / Jobs</p>
          <h1>สร้างเซสชัน</h1>
          <p class="lead">ใส่ auth ครั้งเดียว จากนั้นพิมพ์ชื่อลูกค้า พิมพ์ชื่อโมเดล ใส่ราคา แล้วกดสร้างเซสชันได้เลย ถ้ายังไม่มี record ระบบจะสร้าง draft ให้เอง</p>
        </div>
        <button id="clearAuth" class="ghost" type="button">ล้าง Auth</button>
      </div>

      <form id="auth-form">
        <div class="grid">
          <label>Bearer Token<input id="bearer" type="password" autocomplete="off" /></label>
          <label>Confirm Key<input id="confirmKey" type="password" autocomplete="off" /></label>
        </div>
        <p class="hint">ใส่อย่างใดอย่างหนึ่งก็พอ และค่าจะถูกเก็บไว้เฉพาะ browser session นี้เท่านั้น</p>
      </form>

      <form id="create-session-form">
        <div class="grid">
          <label>ลูกค้า<input id="member_search" type="text" placeholder="ชื่อลูกค้า, nickname, memberstack id, telegram" /></label>
          <label>โมเดล<input id="model_search" type="text" placeholder="ชื่อโมเดล, nickname, telegram, unique key" /></label>
          <label id="member_results_block" class="grid-full result-block" hidden>ผลการค้นหา Member<select id="member_results" size="5"></select></label>
          <label id="model_results_block" class="grid-full result-block" hidden>ผลการค้นหา Model<select id="model_results" size="5"></select></label>
        </div>

        <div class="quick-grid">
          <label>จำนวนเงิน THB<input id="amount_thb" type="number" min="1" step="1" required /></label>
        </div>

        <input id="memberstack_id" type="hidden" />
        <input id="model_id" type="hidden" />
        <input id="model_airtable_id" type="hidden" />
        <input id="model_lookup_key" type="hidden" />
        <input id="model_asset_source" type="hidden" />
        <input id="model_package_tier" type="hidden" />
        <input id="model_asset_folder_id" type="hidden" />
        <input id="model_asset_folder_url" type="hidden" />
        <input id="model_r2_folder_prefix" type="hidden" />
        <input id="selected_profile_image_key" type="hidden" />

        <details class="advanced">
          <summary>ตัวเลือกเพิ่มเติม</summary>
          <div class="grid">
            <label>จ่ายโมเดล THB<input id="pay_model_thb" type="number" min="0" step="1" /></label>
            <label>Currency<input id="currency" type="text" value="THB" /></label>
            <label>Package Tier
              <select id="package_tier_override">
                <option value="">Auto from model tier</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
                <option value="vip">VIP / SVIP / Blackcard</option>
              </select>
            </label>
            <label>Payment Ref<input id="payment_ref" type="text" /></label>
            <label>Session ID<input id="session_id" type="text" /></label>
            <label>Return URL<input id="return_url" type="url" /></label>
            <label>Cancel URL<input id="cancel_url" type="url" /></label>
            <label class="grid-full">Metadata JSON<textarea id="metadata" placeholder='{"source":"manual_immigrate","line_user_id":"..."}'></textarea></label>
          </div>
        </details>

        <p class="hint">ใช้งานหลักมีแค่ 3 อย่าง: พิมพ์ชื่อลูกค้า, พิมพ์ชื่อโมเดล, ใส่ราคา ถ้ายังไม่มี record ระบบจะช่วยสร้าง draft ให้เอง</p>
        <div class="actions">
          <button id="submit" type="submit">สร้างเซสชัน</button>
          <button id="copy_confirmation_url" class="ghost" type="button" disabled>คัดลอก confirmation_url</button>
          <p id="status" class="status" role="status"></p>
        </div>
      </form>

      <div class="summary-grid">
        <div class="summary-card"><p class="summary-label">Member ที่เลือก</p><p id="member_summary" class="summary-value">ยังไม่ได้เลือก member</p></div>
        <div class="summary-card"><p class="summary-label">Model ที่เลือก</p><p id="model_summary" class="summary-value">ยังไม่ได้เลือก model</p></div>
        <div class="summary-card">
          <p class="summary-label">Model Asset Resolver</p>
          <p id="model_folder_summary" class="summary-value">ยังไม่ได้ resolve asset folder</p>
          <div class="asset-stack">
            <div class="asset-box">
              <p class="asset-box-title">Primary Package</p>
              <p id="primary_package_summary" class="asset-box-meta">ยังไม่ได้ resolve</p>
              <p class="summary-value"><a id="open_drive_folder" href="#" target="_blank" rel="noopener noreferrer" hidden>Open Drive folder</a></p>
            </div>
            <div class="asset-box">
              <p class="asset-box-title">Inherited Packages</p>
              <div id="inherited_package_list" class="asset-links"><p class="asset-empty">ยังไม่มี inherited package</p></div>
            </div>
          </div>
        </div>
        <div class="summary-card"><p class="summary-label">Model Preview</p><p id="model_preview_summary" class="summary-value">ยังไม่มี preview</p></div>
      </div>

      <pre id="result">${escapeHtml("รอการส่งข้อมูล...")}</pre>
    </main>

    <script>
      (() => {
        const KEY = "mmd_admin_create_session_auth_v1";
        const submit = document.getElementById("submit");
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const clearAuth = document.getElementById("clearAuth");
        const copyConfirmationUrlButton = document.getElementById("copy_confirmation_url");
        const memberSummary = document.getElementById("member_summary");
        const modelSummary = document.getElementById("model_summary");
        const modelFolderSummary = document.getElementById("model_folder_summary");
        const modelPreviewSummary = document.getElementById("model_preview_summary");
        const primaryPackageSummary = document.getElementById("primary_package_summary");
        const inheritedPackageList = document.getElementById("inherited_package_list");
        const openDriveFolder = document.getElementById("open_drive_folder");
        const bearer = document.getElementById("bearer");
        const confirmKey = document.getElementById("confirmKey");
        const packageTierOverride = document.getElementById("package_tier_override");
        const form = document.getElementById("create-session-form");
        const memberSearch = document.getElementById("member_search");
        const modelSearch = document.getElementById("model_search");
        const memberResultsBlock = document.getElementById("member_results_block");
        const modelResultsBlock = document.getElementById("model_results_block");
        const memberResults = document.getElementById("member_results");
        const modelResults = document.getElementById("model_results");

        function setStatus(message, kind) {
          status.textContent = message || "";
          status.className = "status" + (kind ? " " + kind : "");
        }
        function setResult(payload) {
          result.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
        }
        function setSelectionSummary(target, lines) {
          target.textContent = Array.isArray(lines) && lines.length ? lines.filter(Boolean).join("\\n") : "-";
        }
        function setHiddenValue(id, value) {
          const el = document.getElementById(id);
          if (el) el.value = value || "";
        }
        function renderInheritedPackages(items) {
          inheritedPackageList.innerHTML = "";
          if (!Array.isArray(items) || !items.length) {
            const empty = document.createElement("p");
            empty.className = "asset-empty";
            empty.textContent = "ยังไม่มี inherited package";
            inheritedPackageList.appendChild(empty);
            return;
          }
          for (const item of items) {
            const row = document.createElement("div");
            row.className = "asset-link";

            const copy = document.createElement("div");
            const label = document.createElement("p");
            label.className = "asset-link-label";
            label.textContent = item.label || item.tier || "Package";
            const meta = document.createElement("p");
            meta.className = "asset-link-meta";
            meta.textContent = [item.tier ? "tier: " + item.tier : "", item.folder_id ? "folder_id: " + item.folder_id : ""].filter(Boolean).join(" | ");
            copy.appendChild(label);
            copy.appendChild(meta);

            const linkWrap = document.createElement("div");
            const link = document.createElement("a");
            link.href = item.folder_url || "#";
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = item.open_label || "Open Drive folder";
            linkWrap.appendChild(link);

            row.appendChild(copy);
            row.appendChild(linkWrap);
            inheritedPackageList.appendChild(row);
          }
        }
        function clearModelFolderState() {
          setHiddenValue("model_airtable_id", "");
          setHiddenValue("model_lookup_key", "");
          setHiddenValue("model_asset_source", "");
          setHiddenValue("model_package_tier", "");
          setHiddenValue("model_asset_folder_id", "");
          setHiddenValue("model_asset_folder_url", "");
          setHiddenValue("model_r2_folder_prefix", "");
          setHiddenValue("selected_profile_image_key", "");
          openDriveFolder.hidden = true;
          openDriveFolder.href = "#";
          setSelectionSummary(modelFolderSummary, ["ยังไม่ได้ resolve asset folder"]);
          primaryPackageSummary.textContent = "ยังไม่ได้ resolve";
          renderInheritedPackages([]);
          setSelectionSummary(modelPreviewSummary, ["ยังไม่มี preview"]);
        }
        function updateCopyButton(payload) {
          const confirmationUrl = payload && (payload.confirmation_url || payload.confirm_url || "");
          copyConfirmationUrlButton.disabled = !confirmationUrl;
          copyConfirmationUrlButton.dataset.url = confirmationUrl || "";
        }
        function loadAuth() {
          try {
            const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
            if (saved && typeof saved === "object") {
              bearer.value = saved.bearer || "";
              confirmKey.value = saved.confirmKey || "";
            }
          } catch {}
        }
        function saveAuth() {
          sessionStorage.setItem(KEY, JSON.stringify({ bearer: bearer.value.trim(), confirmKey: confirmKey.value.trim() }));
        }
        function buildHeaders() {
          const headers = { "Content-Type": "application/json" };
          const bearerValue = bearer.value.trim();
          const confirmKeyValue = confirmKey.value.trim();
          if (bearerValue) headers.Authorization = "Bearer " + bearerValue;
          if (confirmKeyValue) headers["X-Confirm-Key"] = confirmKeyValue;
          return headers;
        }
        function setResultsVisibility(kind, visible) {
          const block = kind === "member" ? memberResultsBlock : modelResultsBlock;
          block.hidden = !visible;
        }
        function applyOptions(select, items, kind) {
          select.innerHTML = "";
          if (!Array.isArray(items) || !items.length) {
            setResultsVisibility(kind, false);
            const option = document.createElement("option");
            option.textContent = kind === "member" ? "ไม่พบ member" : "ไม่พบ model";
            option.value = "";
            select.appendChild(option);
            return;
          }
          setResultsVisibility(kind, true);
          for (const item of items) {
            const fields = item && item.fields ? item.fields : {};
            const modelRecord = kind === "model" && (!item.fields || item.airtable_record_id)
              ? item
              : null;
            const label = kind === "member"
              ? [fields.name || fields.Name || fields.nickname || "Member", fields.memberstack_id || "", fields.telegram_username || fields.telegram_id || ""].filter(Boolean).join(" | ")
              : [modelRecord?.model_name || fields.name || fields.Name || fields.nickname || "Model", modelRecord?.model_lookup_key || fields.unique_key || "", modelRecord?.status || ""].filter(Boolean).join(" | ");
            const option = document.createElement("option");
            option.value = kind === "member"
              ? String(fields.memberstack_id || "")
              : String(modelRecord?.airtable_record_id || item.id || fields.id || "");
            option.textContent = label;
            option.dataset.recordId = String(modelRecord?.airtable_record_id || item.id || "");
            option.dataset.summary = JSON.stringify({
              kind,
              recordId: String(modelRecord?.airtable_record_id || item.id || ""),
              name: String(modelRecord?.model_name || fields.name || fields.Name || fields.nickname || ""),
              memberstackId: String(fields.memberstack_id || ""),
              uniqueKey: String(modelRecord?.model_lookup_key || fields.unique_key || ""),
              telegram: String(modelRecord?.telegram_status || fields.telegram_username || fields.telegram_id || ""),
              folderStatus: String(modelRecord?.r2_folder_status || ""),
            });
            select.appendChild(option);
          }
        }
        function selectFirstOption(select) {
          if (!select.options.length) return;
          select.selectedIndex = 0;
          select.dispatchEvent(new Event("change"));
        }
        function resetResolvedEntity(kind) {
          const isMember = kind === "member";
          document.getElementById(isMember ? "memberstack_id" : "model_id").value = "";
          if (isMember) {
            setSelectionSummary(memberSummary, ["ยังไม่ได้เลือก member"]);
          } else {
            setSelectionSummary(modelSummary, ["ยังไม่ได้เลือก model"]);
            clearModelFolderState();
          }
        }
        async function fetchModelFolder(modelId) {
          const params = new URLSearchParams();
          if (packageTierOverride.value) params.set("package_tier", packageTierOverride.value);
          const response = await fetch("/v1/admin/models/" + encodeURIComponent(modelId) + "/folder" + (params.toString() ? "?" + params.toString() : ""), {
            method: "GET",
            headers: buildHeaders(),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data || !data.ok) {
            throw new Error((data && (data.error?.message || data.error)) || "model_folder_lookup_failed");
          }
          return data;
        }
        async function resolveModelFolder(modelId) {
          const response = await fetch("/v1/admin/models/" + encodeURIComponent(modelId) + "/resolve-folder", {
            method: "POST",
            headers: buildHeaders(),
            body: JSON.stringify({ package_tier: packageTierOverride.value || "" }),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data || !data.ok) {
            throw new Error((data && (data.error?.message || data.error)) || "model_folder_resolve_failed");
          }
          return data;
        }
        async function bindModelFolder(modelId, summaryInfo) {
          setStatus("กำลัง resolve model asset folder...");
          const folderData = await fetchModelFolder(modelId).catch(async () => {
            const resolved = await resolveModelFolder(modelId);
            if (resolved && Array.isArray(resolved.matches) && resolved.matches.length && !resolved.requires_operator_review) {
              const best = resolved.matches[0];
              return {
                ok: true,
                model: {
                  airtable_record_id: modelId,
                  model_name: summaryInfo?.name || "Model",
                  model_lookup_key: summaryInfo?.uniqueKey || "",
                  model_code: "",
                },
                asset_source: "google_drive",
                package: {
                  tier: best.package_tier || "standard",
                  inherits: Array.isArray(best.package_inherits) ? best.package_inherits : [],
                  drive_folder_key: best.drive_folder_key || (best.package_tier || "standard"),
                  matched_from: best.match_reason || "resolve",
                  requires_operator_review: false,
                },
                primary_package: {
                  tier: best.package_tier || "standard",
                  drive_folder_key: best.drive_folder_key || (best.package_tier || "standard"),
                  folder_id: best.folder_id || "",
                  folder_url: best.folder_url || "",
                  label: best.package_tier || "standard",
                  open_label: best.open_label || "Open Drive folder",
                },
                inherited_packages: [],
                open_drive_links: best.folder_url ? [{
                  tier: best.package_tier || "standard",
                  drive_folder_key: best.drive_folder_key || (best.package_tier || "standard"),
                  folder_id: best.folder_id || "",
                  folder_url: best.folder_url || "",
                  label: best.package_tier || "standard",
                  open_label: best.open_label || "Open Drive folder",
                }] : [],
                google_drive: {
                  folder_id: best.folder_id || "",
                  folder_url: best.folder_url || "",
                  owner_account: best.owner_account || "mmdprive@gmail.com",
                  drive_folder_key: best.drive_folder_key || "",
                  package_inherits: Array.isArray(best.package_inherits) ? best.package_inherits : [],
                  includes_package_tiers: Array.isArray(best.includes_package_tiers) ? best.includes_package_tiers : [],
                  access_note: best.access_note || "",
                  legacy_source_status: "not_fully_reconciled",
                  open_label: best.open_label || "Open Drive folder",
                },
                preview: {
                  profile_image_url: null,
                  gallery_preview_urls: [],
                },
              };
            }
            throw new Error(
              resolved && resolved.matches && resolved.matches.length
                ? "ต้องให้ operator confirm folder ก่อน"
                : "ยังหา folder ไม่เจอ"
            );
          });

          const model = folderData.model || {};
          const r2 = folderData.r2 || {};
          const pkg = folderData.package || {};
          const primaryPackage = folderData.primary_package || {};
          const inheritedPackages = Array.isArray(folderData.inherited_packages) ? folderData.inherited_packages : [];
          const drive = folderData.google_drive || {};
          const preview = folderData.preview || {};

          setHiddenValue("model_airtable_id", model.airtable_record_id || modelId);
          setHiddenValue("model_lookup_key", model.model_lookup_key || summaryInfo?.uniqueKey || "");
          setHiddenValue("model_asset_source", folderData.asset_source || "google_drive");
          setHiddenValue("model_package_tier", pkg.tier || packageTierOverride.value || "standard");
          setHiddenValue("model_asset_folder_id", drive.folder_id || "");
          setHiddenValue("model_asset_folder_url", drive.folder_url || "");
          setHiddenValue("model_r2_folder_prefix", r2.folder_prefix || "");
          setHiddenValue("selected_profile_image_key", r2.profile_image_key || "");

          openDriveFolder.hidden = !drive.folder_url;
          openDriveFolder.href = drive.folder_url || "#";
          openDriveFolder.textContent = primaryPackage.open_label || drive.open_label || "Open Drive folder";

          setSelectionSummary(modelFolderSummary, [
            model.model_name || summaryInfo?.name || "Model",
            model.model_lookup_key ? "lookup_key: " + model.model_lookup_key : "",
            pkg.tier ? "package: " + pkg.tier : "package: standard",
            Array.isArray(pkg.inherits) && pkg.inherits.length
              ? "inherits: " + pkg.inherits.join(", ")
              : "",
            drive.folder_id ? "drive_folder_id: " + drive.folder_id : "drive folder: missing",
            drive.owner_account ? "owner: " + drive.owner_account : "",
            Array.isArray(drive.includes_package_tiers) && drive.includes_package_tiers.length
              ? "includes: " + drive.includes_package_tiers.join(", ")
              : "",
            drive.access_note ? drive.access_note : "",
            pkg.requires_operator_review ? "review: package fallback standard" : "",
          ]);
          primaryPackageSummary.textContent = [
            primaryPackage.label || drive.folder_label || "Package",
            primaryPackage.tier ? "tier: " + primaryPackage.tier : "",
            primaryPackage.drive_folder_key ? "drive_key: " + primaryPackage.drive_folder_key : "",
            primaryPackage.folder_id ? "folder_id: " + primaryPackage.folder_id : "",
          ].filter(Boolean).join("\\n");
          renderInheritedPackages(inheritedPackages);
          setSelectionSummary(modelPreviewSummary, [
            preview.profile_image_url ? "profile: ready" : "profile: none",
            drive.folder_url ? "drive folder: ready" : "drive folder: none",
          ]);
          setStatus(drive.folder_url ? "เลือก model และ resolve Google Drive folder แล้ว" : "เลือก model แล้ว แต่ยัง resolve asset folder ไม่สำเร็จ", drive.folder_url ? "success" : "error");
        }
        async function runLookup(kind) {
          const query = (kind === "member" ? memberSearch.value : modelSearch.value).trim();
          const select = kind === "member" ? memberResults : modelResults;
          const path = kind === "member" ? "/v1/admin/members/list" : "/v1/admin/models/search";
          try {
            const params = new URLSearchParams();
            if (query) params.set("q", query);
            params.set("limit", "10");
            const response = await fetch(path + "?" + params.toString(), { method: "GET", headers: buildHeaders() });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              throw new Error((data && (data.error?.message || data.error)) || "lookup_failed");
            }
            applyOptions(select, data.items || [], kind);
            return data.items || [];
          } catch (error) {
            throw error;
          }
        }
        async function createDraft(kind) {
          const isMember = kind === "member";
          const queryInput = isMember ? memberSearch : modelSearch;
          const query = queryInput.value.trim();
          const name = query || (isMember ? document.getElementById("memberstack_id").value.trim() : document.getElementById("model_id").value.trim());
          if (!name) {
            setStatus(isMember ? "พิมพ์ชื่อหรือ memberstack id ก่อนสร้าง draft member" : "พิมพ์ชื่อหรือ unique key ก่อนสร้าง draft model", "error");
            return;
          }
          const path = isMember ? "/v1/admin/members/draft" : "/v1/admin/models/draft";
          const payload = isMember
            ? {
                query,
                name,
                nickname: query,
                memberstack_id: document.getElementById("memberstack_id").value.trim(),
              }
            : {
                query,
                name,
                nickname: query,
                unique_key: query,
                record_id_hint: document.getElementById("model_id").value.trim(),
              };
          const select = isMember ? memberResults : modelResults;
          try {
            const response = await fetch(path, { method: "POST", headers: buildHeaders(), body: JSON.stringify(payload) });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data || !data.item) {
              throw new Error((data && (data.error?.message || data.error)) || "draft_failed");
            }
            applyOptions(select, [data.item], kind);
            selectFirstOption(select);
            return data.item;
          } catch (error) {
            throw error;
          }
        }
        async function ensureEntity(kind, options) {
          const isMember = kind === "member";
          const queryInput = isMember ? memberSearch : modelSearch;
          const idInput = document.getElementById(isMember ? "memberstack_id" : "model_id");
          const select = isMember ? memberResults : modelResults;
          const idleStatus = options && options.quiet;
          const actionLabel = isMember ? "member" : "model";
          const query = queryInput.value.trim();
          const currentId = idInput.value.trim();
          if (!query && currentId) {
            return currentId;
          }

          if (!idleStatus) {
            setStatus(isMember ? "กำลังหา / สร้าง member..." : "กำลังหา / สร้าง model...");
            setResult("Working...");
          }
          try {
            const items = await runLookup(kind);
            if (items.length) {
              selectFirstOption(select);
              if (!idleStatus) {
                setStatus(isMember ? "เจอ member แล้ว" : "เจอ model แล้ว", "success");
                setResult({ ok: true, source: "lookup", items });
              }
              return idInput.value.trim();
            }

            const draft = await createDraft(kind);
            if (!idleStatus) {
              setStatus(isMember ? "สร้าง draft member แล้ว" : "สร้าง draft model แล้ว", "success");
              setResult({ ok: true, source: "draft", item: draft });
            }
            return idInput.value.trim();
          } catch (error) {
            if (!idleStatus) {
              setStatus(isMember ? "หา / สร้าง member ไม่สำเร็จ" : "หา / สร้าง model ไม่สำเร็จ", "error");
              setResult({ ok: false, error: String(error && error.message ? error.message : error), entity: actionLabel });
            }
            throw error;
          }
        }
        function readOptionalNumber(id) {
          const raw = document.getElementById(id).value.trim();
          if (!raw) return null;
          const num = Number(raw);
          return Number.isFinite(num) ? num : NaN;
        }
        loadAuth();
        setResultsVisibility("member", false);
        setResultsVisibility("model", false);
        bearer.addEventListener("change", saveAuth);
        confirmKey.addEventListener("change", saveAuth);
        memberSearch.addEventListener("input", () => {
          resetResolvedEntity("member");
          setResultsVisibility("member", false);
        });
        modelSearch.addEventListener("input", () => {
          resetResolvedEntity("model");
          setResultsVisibility("model", false);
        });
        packageTierOverride.addEventListener("change", async () => {
          const modelId = document.getElementById("model_id").value.trim();
          if (!modelId) return;
          try {
            const option = modelResults.options[modelResults.selectedIndex];
            const info = option ? JSON.parse(option.dataset.summary || "{}") : {};
            await bindModelFolder(modelId, info);
          } catch (error) {
            clearModelFolderState();
            setStatus(String(error && error.message ? error.message : error) || "resolve asset folder ไม่สำเร็จ", "error");
          }
        });
        memberSearch.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            ensureEntity("member");
          }
        });
        modelSearch.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            ensureEntity("model");
          }
        });
        clearAuth.addEventListener("click", () => {
          sessionStorage.removeItem(KEY);
          bearer.value = "";
          confirmKey.value = "";
          setStatus("ล้าง auth ที่บันทึกไว้แล้ว", "success");
        });
        copyConfirmationUrlButton.addEventListener("click", async () => {
          const url = copyConfirmationUrlButton.dataset.url || "";
          if (!url) return;
          try {
            await navigator.clipboard.writeText(url);
            setStatus("คัดลอก confirmation_url แล้ว", "success");
          } catch {
            setStatus("คัดลอก confirmation_url ไม่สำเร็จ", "error");
          }
        });
        memberResults.addEventListener("change", () => {
          const option = memberResults.options[memberResults.selectedIndex];
          if (option && option.value) {
            document.getElementById("memberstack_id").value = option.value;
            try {
              const info = JSON.parse(option.dataset.summary || "{}");
              setSelectionSummary(memberSummary, [info.name || "Member", info.memberstackId ? "memberstack_id: " + info.memberstackId : "", info.telegram ? "telegram: " + info.telegram : ""]);
            } catch {}
            setStatus("เลือก member แล้ว", "success");
          }
        });
        modelResults.addEventListener("change", async () => {
          const option = modelResults.options[modelResults.selectedIndex];
          if (option && option.value) {
            const recordId = option.dataset.recordId || option.value;
            document.getElementById("model_id").value = recordId;
            try {
              const info = JSON.parse(option.dataset.summary || "{}");
              setSelectionSummary(modelSummary, [
                info.name || "Model",
                info.recordId ? "record_id: " + info.recordId : "",
                info.uniqueKey ? "lookup_key: " + info.uniqueKey : "",
                info.folderStatus ? "folder: " + info.folderStatus : "",
              ]);
              await bindModelFolder(recordId, info);
            } catch (error) {
              clearModelFolderState();
              setStatus(String(error && error.message ? error.message : error) || "เลือก model แล้วแต่ resolve folder ไม่สำเร็จ", "error");
            }
          }
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setStatus("");
          saveAuth();
          if (!bearer.value.trim() && !confirmKey.value.trim()) {
            setStatus("กรอก Bearer Token หรือ Confirm Key ก่อน", "error");
            return;
          }
          if (!memberSearch.value.trim() && !document.getElementById("memberstack_id").value.trim()) {
            setStatus("พิมพ์ชื่อลูกค้าหรือ memberstack id ก่อน", "error");
            return;
          }
          if (!modelSearch.value.trim() && !document.getElementById("model_id").value.trim()) {
            setStatus("พิมพ์ชื่อโมเดลหรือ model id ก่อน", "error");
            return;
          }
          if (!document.getElementById("model_asset_folder_url").value.trim()) {
            setStatus("เลือก model แล้ว resolve Google Drive folder ให้เรียบร้อยก่อน", "error");
            return;
          }
          let metadata = {};
          const metadataRaw = document.getElementById("metadata").value.trim();
          if (metadataRaw) {
            try {
              metadata = JSON.parse(metadataRaw);
            } catch {
              setStatus("Metadata JSON ไม่ถูกต้อง", "error");
              return;
            }
          }
          const payModelThb = readOptionalNumber("pay_model_thb");
          if (Number.isNaN(payModelThb)) {
            setStatus("จ่ายโมเดล THB ต้องเป็นตัวเลขที่ถูกต้อง", "error");
            return;
          }
          submit.disabled = true;
          submit.textContent = "กำลังสร้าง...";
          setStatus("กำลังส่งคำขอ create-session...");
          setResult("Working...");
          try {
            await ensureEntity("member", { quiet: true });
            await ensureEntity("model", { quiet: true });
            const payload = {
              memberstack_id: document.getElementById("memberstack_id").value.trim(),
              model_id: document.getElementById("model_id").value.trim(),
              model_airtable_id: document.getElementById("model_airtable_id").value.trim(),
              model_lookup_key: document.getElementById("model_lookup_key").value.trim(),
              model_asset_source: document.getElementById("model_asset_source").value.trim(),
              model_package_tier: document.getElementById("model_package_tier").value.trim(),
              model_asset_folder_id: document.getElementById("model_asset_folder_id").value.trim(),
              model_asset_folder_url: document.getElementById("model_asset_folder_url").value.trim(),
              model_r2_folder_prefix: document.getElementById("model_r2_folder_prefix").value.trim(),
              selected_profile_image_key: document.getElementById("selected_profile_image_key").value.trim(),
              amount_thb: Number(document.getElementById("amount_thb").value),
              currency: document.getElementById("currency").value.trim() || "THB",
              payment_ref: document.getElementById("payment_ref").value.trim(),
              session_id: document.getElementById("session_id").value.trim(),
              return_url: document.getElementById("return_url").value.trim(),
              cancel_url: document.getElementById("cancel_url").value.trim(),
              metadata,
            };
            if (payModelThb != null) payload.pay_model_thb = payModelThb;
            const response = await fetch("/internal/admin/jobs/create-session", { method: "POST", headers: buildHeaders(), body: JSON.stringify(payload) });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              updateCopyButton(null);
              setStatus((data && (data.error?.message || data.error)) || "สร้างเซสชันไม่สำเร็จ", "error");
              setResult(data || { ok: false, status: response.status });
              return;
            }
            updateCopyButton(data);
            setStatus("สร้างเซสชันสำเร็จ", "success");
            setResult(data);
          } catch (error) {
            updateCopyButton(null);
            setStatus("ยังเชื่อม create-session ไม่ได้ตอนนี้", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          } finally {
            submit.disabled = false;
            submit.textContent = "สร้างเซสชัน";
          }
        });
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function renderNotesHubPage(method) {
  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin Notes Hub</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08070a;
        --panel: rgba(19,15,24,.82);
        --line: rgba(247,240,232,.14);
        --text: #f7f0e8;
        --muted: #c4b3a7;
        --gold: #d1a66a;
        --success: #9ad7b2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 24px;
        color: var(--text);
        background: radial-gradient(circle at top, rgba(164,91,91,.18), transparent 28%), radial-gradient(circle at bottom right, rgba(95,127,132,.12), transparent 30%), linear-gradient(180deg, #110d14 0%, #09080d 52%, #060507 100%);
        font-family: Baskerville, "Iowan Old Style", Palatino, Georgia, serif;
      }
      .shell {
        width: min(100%, 1180px);
        margin: 0 auto;
        padding: 32px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--panel);
        box-shadow: 0 24px 80px rgba(0,0,0,.35);
        backdrop-filter: blur(18px);
      }
      .topbar { display:flex; justify-content:space-between; gap:16px; align-items:center; margin-bottom:24px; }
      .kicker { margin:0 0 10px; color:var(--gold); font:600 .8rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.24em; text-transform:uppercase; }
      h1 { margin:0; font-size:clamp(2.1rem,7vw,4rem); line-height:.95; letter-spacing:-.04em; }
      .lead { margin:16px 0 0; color:var(--muted); line-height:1.7; max-width:70ch; }
      form { display:grid; gap:18px; margin-top:28px; }
      .grid { display:grid; gap:16px; grid-template-columns:repeat(2, minmax(0,1fr)); }
      .grid-full { grid-column:1 / -1; }
      label { display:grid; gap:8px; color:var(--gold); font:600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.16em; text-transform:uppercase; }
      input, select { width:100%; min-height:52px; padding:14px 16px; border:1px solid var(--line); border-radius:16px; background:rgba(7,6,10,.72); color:var(--text); font:inherit; }
      select { min-height:148px; padding:10px 12px; }
      .actions { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
      button { min-height:48px; padding:0 18px; border-radius:999px; border:1px solid rgba(209,166,106,.36); background:linear-gradient(135deg, rgba(209,166,106,.24), rgba(164,91,91,.28)); color:var(--text); font:600 .92rem/1 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; }
      .ghost { background:transparent; }
      .status { min-height:1.2em; margin:0; color:var(--muted); }
      .status.error { color:#f2b0b0; }
      .status.success { color:var(--success); }
      .hint { margin:0; color:var(--muted); font-size:.92rem; }
      .summary-grid { display:grid; gap:14px; grid-template-columns:repeat(2, minmax(0,1fr)); margin-top:18px; }
      .summary-card { padding:16px 18px; border:1px solid var(--line); border-radius:18px; background:rgba(255,255,255,.03); }
      .summary-label { margin:0 0 8px; color:var(--gold); font:600 .74rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.14em; text-transform:uppercase; }
      .summary-value { margin:0; color:var(--text); line-height:1.6; white-space:pre-wrap; word-break:break-word; }
      .result-block[hidden] { display:none; }
      .columns { display:grid; gap:16px; grid-template-columns:repeat(2, minmax(0,1fr)); margin-top:20px; }
      .note-panel { border:1px solid var(--line); border-radius:22px; background:rgba(255,255,255,.03); padding:18px; min-height:220px; }
      .note-list { display:grid; gap:12px; }
      .note-card { padding:14px 16px; border-radius:16px; border:1px solid var(--line); background:rgba(7,6,10,.58); }
      .note-card h3 { margin:0 0 8px; font-size:1rem; }
      .meta { margin:0 0 8px; color:var(--muted); font-size:.88rem; }
      .content { margin:0; color:var(--text); white-space:pre-wrap; line-height:1.55; }
      pre { overflow:auto; padding:18px; border-radius:20px; border:1px solid var(--line); background:rgba(7,6,10,.72); color:var(--text); font:.9rem/1.6 SFMono-Regular, Consolas, Menlo, monospace; }
      @media (max-width: 860px) { .grid, .summary-grid, .columns { grid-template-columns:1fr; } .topbar { align-items:flex-start; flex-direction:column; } }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="topbar">
        <div>
          <p class="kicker">Internal Admin / Notes</p>
          <h1>Notes Hub</h1>
          <p class="lead">ค้นหา client กับ model แล้วดู Internal Notes ของทั้งสองฝั่งในหน้าจอเดียวได้เลย เหมาะสำหรับเช็ก immigrate note, private profile, และ context ก่อนทำงานต่อ</p>
        </div>
        <button id="clearAuth" class="ghost" type="button">ล้าง Auth</button>
      </div>

      <form id="auth-form">
        <div class="grid">
          <label>Bearer Token<input id="bearer" type="password" autocomplete="off" /></label>
          <label>Confirm Key<input id="confirmKey" type="password" autocomplete="off" /></label>
        </div>
        <p class="hint">ใส่อย่างใดอย่างหนึ่งก็พอ และค่าจะถูกเก็บไว้เฉพาะ browser session นี้เท่านั้น</p>
      </form>

      <form id="notes-form">
        <div class="grid">
          <label>Client<input id="client_search" type="text" placeholder="Client Name, nickname, line, phone, email" /></label>
          <label>Model<input id="model_search" type="text" placeholder="working_name, nickname, unique key, phone" /></label>
          <label id="client_results_block" class="grid-full result-block" hidden>ผลการค้นหา Client<select id="client_results" size="5"></select></label>
          <label id="model_results_block" class="grid-full result-block" hidden>ผลการค้นหา Model<select id="model_results" size="5"></select></label>
        </div>
        <input id="client_id" type="hidden" />
        <input id="model_id" type="hidden" />
        <div class="actions">
          <button id="load_notes" type="submit">โหลด Notes</button>
          <p id="status" class="status" role="status"></p>
        </div>
      </form>

      <div class="summary-grid">
        <div class="summary-card"><p class="summary-label">Client ที่เลือก</p><p id="client_summary" class="summary-value">ยังไม่ได้เลือก client</p></div>
        <div class="summary-card"><p class="summary-label">Model ที่เลือก</p><p id="model_summary" class="summary-value">ยังไม่ได้เลือก model</p></div>
      </div>

      <div class="columns">
        <section class="note-panel">
          <p class="summary-label">Client Notes</p>
          <div id="client_notes" class="note-list"><p class="hint">ยังไม่มีข้อมูล</p></div>
        </section>
        <section class="note-panel">
          <p class="summary-label">Model Notes</p>
          <div id="model_notes" class="note-list"><p class="hint">ยังไม่มีข้อมูล</p></div>
        </section>
      </div>

      <section class="note-panel" style="margin-top:16px;">
        <p class="summary-label">Merged Notes</p>
        <div id="merged_notes" class="note-list"><p class="hint">ยังไม่มีข้อมูล</p></div>
      </section>

      <pre id="result">${escapeHtml("รอการโหลด notes...")}</pre>
    </main>

    <script>
      (() => {
        const KEY = "mmd_admin_notes_hub_auth_v1";
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const clearAuth = document.getElementById("clearAuth");
        const bearer = document.getElementById("bearer");
        const confirmKey = document.getElementById("confirmKey");
        const form = document.getElementById("notes-form");
        const clientSearch = document.getElementById("client_search");
        const modelSearch = document.getElementById("model_search");
        const clientResults = document.getElementById("client_results");
        const modelResults = document.getElementById("model_results");
        const clientResultsBlock = document.getElementById("client_results_block");
        const modelResultsBlock = document.getElementById("model_results_block");
        const clientSummary = document.getElementById("client_summary");
        const modelSummary = document.getElementById("model_summary");
        const clientNotes = document.getElementById("client_notes");
        const modelNotes = document.getElementById("model_notes");
        const mergedNotes = document.getElementById("merged_notes");

        function setStatus(message, kind) {
          status.textContent = message || "";
          status.className = "status" + (kind ? " " + kind : "");
        }
        function setResult(payload) {
          result.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
        }
        function loadAuth() {
          try {
            const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
            if (saved && typeof saved === "object") {
              bearer.value = saved.bearer || "";
              confirmKey.value = saved.confirmKey || "";
            }
          } catch {}
        }
        function saveAuth() {
          sessionStorage.setItem(KEY, JSON.stringify({ bearer: bearer.value.trim(), confirmKey: confirmKey.value.trim() }));
        }
        function buildHeaders() {
          const headers = {};
          const bearerValue = bearer.value.trim();
          const confirmKeyValue = confirmKey.value.trim();
          if (bearerValue) headers.Authorization = "Bearer " + bearerValue;
          if (confirmKeyValue) headers["X-Confirm-Key"] = confirmKeyValue;
          return headers;
        }
        function showResults(kind, visible) {
          (kind === "client" ? clientResultsBlock : modelResultsBlock).hidden = !visible;
        }
        function setSummary(target, lines) {
          target.textContent = Array.isArray(lines) && lines.length ? lines.filter(Boolean).join("\\n") : "-";
        }
        function renderNoteList(target, notes) {
          target.innerHTML = "";
          if (!Array.isArray(notes) || !notes.length) {
            target.innerHTML = '<p class="hint">ยังไม่มีข้อมูล</p>';
            return;
          }
          for (const note of notes) {
            const article = document.createElement("article");
            article.className = "note-card";
            const title = document.createElement("h3");
            title.textContent = note.title || "Untitled Note";
            const meta = document.createElement("p");
            meta.className = "meta";
            meta.textContent = [note.created_date || "", note.author || "", Array.isArray(note.scopes) ? note.scopes.join(", ") : ""].filter(Boolean).join(" | ");
            const content = document.createElement("p");
            content.className = "content";
            content.textContent = note.content || "";
            article.appendChild(title);
            article.appendChild(meta);
            article.appendChild(content);
            target.appendChild(article);
          }
        }
        function applyOptions(select, items, kind) {
          select.innerHTML = "";
          if (!Array.isArray(items) || !items.length) {
            showResults(kind, false);
            return;
          }
          showResults(kind, true);
          for (const item of items) {
            const fields = item && item.fields ? item.fields : {};
            const label = kind === "client"
              ? [fields["Client Name"] || fields.nickname || "Client", fields.memberstack_id || "", fields.line_display_name || fields.email || fields["Phone Number"] || ""].filter(Boolean).join(" | ")
              : [fields.working_name || fields.nickname || "Model", fields.unique_key || "", fields.phone || fields.line_id || ""].filter(Boolean).join(" | ");
            const option = document.createElement("option");
            option.value = String(item.id || "");
            option.textContent = label;
            option.dataset.summary = JSON.stringify({
              id: String(item.id || ""),
              name: String(fields["Client Name"] || fields.working_name || fields.nickname || ""),
              nickname: String(fields.nickname || ""),
              meta: kind === "client"
                ? [fields.memberstack_id || "", fields.line_display_name || "", fields.email || fields["Phone Number"] || ""].filter(Boolean)
                : [fields.unique_key || "", fields.phone || "", fields.line_id || ""].filter(Boolean),
            });
            select.appendChild(option);
          }
        }
        async function runLookup(kind) {
          const query = (kind === "client" ? clientSearch.value : modelSearch.value).trim();
          const path = kind === "client" ? "/v1/admin/clients/list" : "/v1/admin/models/list";
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          params.set("limit", "10");
          const response = await fetch(path + "?" + params.toString(), { method: "GET", headers: buildHeaders() });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data) throw new Error((data && (data.error?.message || data.error)) || "lookup_failed");
          applyOptions(kind === "client" ? clientResults : modelResults, data.items || [], kind);
          return data.items || [];
        }
        function applySelection(kind) {
          const select = kind === "client" ? clientResults : modelResults;
          const targetId = document.getElementById(kind + "_id");
          const option = select.options[select.selectedIndex];
          if (!option || !option.value) return;
          targetId.value = option.value;
          try {
            const info = JSON.parse(option.dataset.summary || "{}");
            setSummary(kind === "client" ? clientSummary : modelSummary, [
              info.name || (kind === "client" ? "Client" : "Model"),
              info.nickname ? "nickname: " + info.nickname : "",
              ...(Array.isArray(info.meta) ? info.meta : []),
            ]);
          } catch {}
        }
        async function loadContext() {
          const clientId = document.getElementById("client_id").value.trim();
          const modelId = document.getElementById("model_id").value.trim();
          const params = new URLSearchParams();
          if (clientId) params.set("client_id", clientId);
          if (modelId) params.set("model_id", modelId);
          const response = await fetch("/v1/admin/notes/context?" + params.toString(), { method: "GET", headers: buildHeaders() });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data) throw new Error((data && (data.error?.message || data.error)) || "notes_context_failed");
          renderNoteList(clientNotes, data.client_notes || []);
          renderNoteList(modelNotes, data.model_notes || []);
          renderNoteList(mergedNotes, data.merged_notes || []);
          setResult(data);
          return data;
        }
        loadAuth();
        saveAuth();
        showResults("client", false);
        showResults("model", false);
        bearer.addEventListener("change", saveAuth);
        confirmKey.addEventListener("change", saveAuth);
        clearAuth.addEventListener("click", () => {
          sessionStorage.removeItem(KEY);
          bearer.value = "";
          confirmKey.value = "";
          setStatus("ล้าง auth ที่บันทึกไว้แล้ว", "success");
        });
        clientSearch.addEventListener("keydown", async (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          try {
            setStatus("กำลังค้นหา client...");
            const items = await runLookup("client");
            if (items.length) {
              clientResults.selectedIndex = 0;
              applySelection("client");
              setStatus("เจอ client แล้ว", "success");
            } else {
              setStatus("ไม่พบ client", "error");
            }
          } catch (error) {
            setStatus("ค้นหา client ไม่สำเร็จ", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          }
        });
        modelSearch.addEventListener("keydown", async (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          try {
            setStatus("กำลังค้นหา model...");
            const items = await runLookup("model");
            if (items.length) {
              modelResults.selectedIndex = 0;
              applySelection("model");
              setStatus("เจอ model แล้ว", "success");
            } else {
              setStatus("ไม่พบ model", "error");
            }
          } catch (error) {
            setStatus("ค้นหา model ไม่สำเร็จ", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          }
        });
        clientResults.addEventListener("change", () => applySelection("client"));
        modelResults.addEventListener("change", () => applySelection("model"));
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          saveAuth();
          if (!bearer.value.trim() && !confirmKey.value.trim()) {
            setStatus("กรอก Bearer Token หรือ Confirm Key ก่อน", "error");
            return;
          }
          try {
            setStatus("กำลังโหลด notes...");
            if (!document.getElementById("client_id").value.trim() && clientSearch.value.trim()) {
              const items = await runLookup("client");
              if (items.length) {
                clientResults.selectedIndex = 0;
                applySelection("client");
              }
            }
            if (!document.getElementById("model_id").value.trim() && modelSearch.value.trim()) {
              const items = await runLookup("model");
              if (items.length) {
                modelResults.selectedIndex = 0;
                applySelection("model");
              }
            }
            const data = await loadContext();
            setStatus("โหลด notes แล้ว", "success");
            setResult(data);
          } catch (error) {
            setStatus("โหลด notes ไม่สำเร็จ", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          }
        });
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/* =========================
   Airtable (optional)
========================= */
async function airtableFetch(env, path, init) {
  const key = env.AIRTABLE_API_KEY;
  const base = env.AIRTABLE_BASE_ID;
  if (!key || !base) return { ok: false, error: "missing_airtable_env" };

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
  } catch (_) {}

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, data };
}

async function airtableList(env, tableName, { q = "", limit = 50, matchFields = [] } = {}) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return [];

  const params = new URLSearchParams();
  params.set("pageSize", String(limit));

  if (q && matchFields.length) {
    const safe = q.replace(/"/g, '\\"');
    const ors = matchFields.map((f) => `FIND("${safe}", {${f}})`).join(",");
    params.set("filterByFormula", `OR(${ors})`);
  }

  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}?${params.toString()}`);
  if (!r.ok) return [];
  const records = r.data?.records || [];
  return records.map((rec) => ({ id: rec.id, fields: rec.fields || {}, createdTime: rec.createdTime }));
}

async function listAdminClientLineage(env, { q = "", limit = 12 } = {}) {
  const records = await airtableList(env, env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS", {
    q,
    limit,
    matchFields: [
      "Client Name",
      "nickname",
      "memberstack_id",
      "line_display_name",
      "email",
      "Phone Number",
      "line_user_id",
      "legacy_tags",
      "purchased_history",
      "package_code",
    ],
  });
  return records.map(normalizeClientLineageRecord);
}

function pickAny(fields, names) {
  for (const name of names) {
    const value = firstScalar(fields?.[name]);
    if (value !== null && value !== undefined && str(value)) return value;
  }
  return "";
}

function pickList(fields, names) {
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value)) return value.map((item) => str(firstScalar(item))).filter(Boolean);
    if (str(value)) return str(value).split(/[,#]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeClientLineageRecord(record) {
  const fields = record?.fields || {};
  const name = str(
    pickAny(fields, ["Client Name", "client_name", "name", "nickname", "line_display_name"])
  );
  const lineUserId = str(pickAny(fields, ["line_user_id", "Line User ID", "line_id"]));
  const lineDisplayName = str(pickAny(fields, ["line_display_name", "Line Display Name", "display_name"]));
  const packageCode = str(pickAny(fields, ["package_code", "Package", "tier", "mmd_tier"]));
  const membershipStatus = str(
    pickAny(fields, ["membership_status", "mmd_status", "status", "Status"])
  );

  return {
    id: record?.id || "",
    record_id: record?.id || "",
    client_id: record?.id || "",
    client_name: name || lineDisplayName || lineUserId || "Unknown Client",
    username: str(pickAny(fields, ["username", "member_username", "memberstack_id", "email"])),
    phone: str(pickAny(fields, ["Phone Number", "phone", "member_phone"])),
    package_code: packageCode,
    tier: str(pickAny(fields, ["tier", "mmd_tier"])) || packageCode,
    membership_status: membershipStatus,
    purchased_history: str(pickAny(fields, ["purchased_history", "purchase_history", "last_purchase"])),
    line_record_id: record?.id || "",
    line_user_id: lineUserId,
    line_display_name: lineDisplayName,
    legacy_tags: pickList(fields, ["legacy_tags", "tags", "Legacy Tags"]),
    last_line_message: str(pickAny(fields, ["last_line_message", "last_message", "Latest LINE Message"])),
    customer_telegram_username: str(
      pickAny(fields, ["customer_telegram_username", "telegram_username", "Telegram Username"])
    ),
    customer_telegram_status:
      str(pickAny(fields, ["customer_telegram_status", "telegram_status", "Telegram Status"])) ||
      "missing",
    confidence: 80,
    fields,
  };
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

async function airtableGetById(env, tableName, id) {
  if (!id) return null;
  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  return { id: r.data?.id || id, fields: r.data?.fields || {}, createdTime: r.data?.createdTime || "" };
}

async function airtableListByRecordIds(env, tableName, ids) {
  const safeIds = [...new Set((Array.isArray(ids) ? ids : []).map((value) => str(value)).filter(Boolean))];
  if (!safeIds.length) return [];
  const formula = `OR(${safeIds.map((id) => `RECORD_ID()="${escapeFormulaValue(id)}"`).join(",")})`;
  const params = new URLSearchParams();
  params.set("pageSize", String(Math.min(safeIds.length, 100)));
  params.set("filterByFormula", formula);
  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}?${params.toString()}`);
  if (!r.ok) return [];
  const records = r.data?.records || [];
  return records.map((rec) => ({ id: rec.id, fields: rec.fields || {}, createdTime: rec.createdTime || "" }));
}

function extractLinkedRecordIds(value) {
  return Array.isArray(value) ? value.map((item) => str(item)).filter(Boolean) : [];
}

function normalizeInternalNote(record, scopes = []) {
  const fields = record?.fields || {};
  return {
    id: str(record?.id),
    title: str(fields["Note Title"]),
    content: str(fields["Note Content"]),
    created_date: str(fields["Created Date"]),
    author: str(fields.Author),
    confidentiality: str(fields["Confidentiality Level"]),
    visibility: str(fields.Visibility),
    scopes,
  };
}

function sortNotesByDate(a, b) {
  const left = str(b.created_date);
  const right = str(a.created_date);
  if (left !== right) return left.localeCompare(right);
  return str(a.title).localeCompare(str(b.title));
}

async function buildNotesHubContext(env, { clientId = "", modelId = "" } = {}) {
  const clientsTable = env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS";
  const modelsTable = env.AIRTABLE_TABLE_MODELS || "tblI4B0bI446vp9GX";
  const notesTable = env.AIRTABLE_TABLE_INTERNAL_NOTES || "tbl1Tt1IXDc9k0zxK";

  const client = clientId ? await airtableGetById(env, clientsTable, clientId) : null;
  const model = modelId ? await airtableGetById(env, modelsTable, modelId) : null;

  const clientNoteIds = extractLinkedRecordIds(client?.fields?.["Internal Notes"]);
  const modelNoteIds = extractLinkedRecordIds(model?.fields?.["Internal Notes"]);
  const allNoteIds = [...new Set([...clientNoteIds, ...modelNoteIds])];
  const noteRecords = await airtableListByRecordIds(env, notesTable, allNoteIds);
  const noteMap = new Map(noteRecords.map((record) => [record.id, record]));

  const clientNotes = clientNoteIds
    .map((id) => noteMap.get(id))
    .filter(Boolean)
    .map((record) => normalizeInternalNote(record, ["client"]))
    .sort(sortNotesByDate);

  const modelNotes = modelNoteIds
    .map((id) => noteMap.get(id))
    .filter(Boolean)
    .map((record) => normalizeInternalNote(record, ["model"]))
    .sort(sortNotesByDate);

  const mergedNotes = allNoteIds
    .map((id) => {
      const record = noteMap.get(id);
      if (!record) return null;
      const scopes = [];
      if (clientNoteIds.includes(id)) scopes.push("client");
      if (modelNoteIds.includes(id)) scopes.push("model");
      return normalizeInternalNote(record, scopes);
    })
    .filter(Boolean)
    .sort(sortNotesByDate);

  return {
    client: client
      ? {
          id: client.id,
          fields: client.fields,
          note_count: clientNotes.length,
        }
      : null,
    model: model
      ? {
          id: model.id,
          fields: model.fields,
          note_count: modelNotes.length,
        }
      : null,
    client_notes: clientNotes,
    model_notes: modelNotes,
    merged_notes: mergedNotes,
  };
}

const MODEL_TABLE_ID = "tblI4B0bI446vp9GX";
const DEFAULT_ALLOWED_MODEL_FIELDS = [
  "name",
  "working_name",
  "model_name",
  "nickname",
  "telegram_username",
  "telegram_id",
  "unique_key",
  "status",
  "notes",
  "line_id",
  "storage_source_primary",
  "r2_prefix",
  "source_folder",
  "source_owner",
  "requires_per_approval",
  "service_layer",
  "orientation_label",
  "sales_layer",
  "private_tier",
  "private_work_format",
  "exclusive_group",
  "can_work_public",
  "can_work_private",
  "pn_ability",
  "mk_ability",
  "burn_ability",
  "pn_condition_note",
  "mk_condition_note",
  "burn_condition_note",
  "private_admin_note",
  "private_review_status",
  "immigration_source",
  "immigration_job_id",
  "immigration_session_id",
  "immigrated_at",
  "immigrated_by",
  "approved_for_private_sales",
  "model_ability_snapshot",
];
const JOB_MODEL_SNAPSHOT_FIELDS = [
  "model_immigration_status",
  "immigrated_model_id",
  "model_private_work_format_snapshot",
  "model_private_tier_snapshot",
  "model_ability_snapshot",
];
const MODEL_SEARCH_FIELDS = [
  "Model Name",
  "model_name",
  "nickname",
  "model_code",
  "model_lookup_key",
  "unique_key",
  "telegram_username",
  "telegram_id",
];
const GOOGLE_DRIVE_OWNER_EMAIL = "mmdprive@gmail.com";
const GOOGLE_DRIVE_LEGACY_EMAIL = "malemodel.bkk@gmail.com";
const GOOGLE_DRIVE_LEGACY_STATUS = "not_fully_reconciled";
const GOOGLE_DRIVE_PACKAGE_FOLDERS = {
  standard: {
    folder_id: "1SHK47mydJBtj1TlmOHrhYk7GN72swjvX",
    folder_url: "https://drive.google.com/open?id=1SHK47mydJBtj1TlmOHrhYk7GN72swjvX&usp=drive_fs",
    label: "Standard",
    open_label: "Open Standard folder",
  },
  premium: {
    folder_id: "1ecvIZUYdjHAsZ-ujDbb1d76MXzx5BseN",
    folder_url: "https://drive.google.com/open?id=1ecvIZUYdjHAsZ-ujDbb1d76MXzx5BseN&usp=drive_fs",
    label: "Premium",
    open_label: "Open Premium folder",
    access_note: "Premium members inherit Standard access.",
  },
  vip: {
    folder_id: "1P8XRSgbRhpv4ELzVZ2NjA13X6LMYShfQ",
    folder_url: "https://drive.google.com/open?id=1P8XRSgbRhpv4ELzVZ2NjA13X6LMYShfQ&usp=drive_fs",
    label: "VIP / SVIP / Blackcard",
    open_label: "Open VIP folder",
  },
};
const MODEL_FIELD_ALIASES = {
  model_name: ["Model Name", "model_name", "name", "working_name"],
  model_code: ["model_code", "Model Code", "code"],
  model_lookup_key: ["model_lookup_key", "unique_key", "lookup_key"],
  nickname: ["nickname", "Nickname"],
  telegram_username: ["telegram_username", "Telegram Username", "telegram"],
  telegram_id: ["telegram_id", "Telegram ID"],
  status: ["status", "Status"],
  tier: ["tier", "Tier"],
  visibility_status: ["visibility_status", "Visibility Status", "visibility"],
  r2_folder_prefix: ["r2_folder_prefix", "r2_folder_key", "folder_prefix"],
  profile_image_key: ["profile_image_key", "profile_key"],
  gallery_prefix: ["gallery_prefix", "gallery_key"],
  preview_image_url: [
    "preview_image_url",
    "profile_image_url",
    "profile_photo_attachment_url",
    "profile_photo",
    "main_photo",
    "avatar_url",
  ],
  legacy_folder_name: ["legacy_folder_name", "folder_name"],
  model_dashboard_url: ["model_dashboard_url", "dashboard_url"],
  last_synced_at: ["last_synced_at", "Last Synced At", "updated_at"],
};
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
  "MMD Private Models/Standard Package",
  "MMD Private Models/Premium Package",
  "MMD Exclusive/MMD Exclusive Models",
  "Public Models/Travel",
  "Public Models/Extreme Models",
  "Public Models/Extreme Models/Straight",
  "Public Models/Extreme Models/Gay",
  "Public Models/Extreme Models/Both",
];

function getModelsTableName(env) {
  return str(env.AIRTABLE_MODELS_TABLE_ID || env.AIRTABLE_TABLE_MODELS || MODEL_TABLE_ID) || MODEL_TABLE_ID;
}

function firstScalar(value) {
  if (Array.isArray(value)) return firstScalar(value[0]);
  if (value && typeof value === "object") {
    return value.url || value.name || value.filename || value.id || "";
  }
  return value;
}

function pickFieldValue(fields, aliases) {
  for (const key of aliases) {
    const value = firstScalar(fields?.[key]);
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function normalizeR2Prefix(value) {
  const raw = str(value).replace(/^\/+/, "");
  if (!raw) return "";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function normalizeModelPathPart(value) {
  return str(value)
    .replace(/>/g, "/")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

function slugPathPart(value) {
  return str(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCategoryPath(value) {
  return normalizeModelPathPart(value).replace(/\s*\/\s*/g, "/");
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

function redactedPrefix(prefix) {
  const clean = normalizeR2Prefix(prefix);
  if (!clean) return "";
  const parts = clean.split("/").filter(Boolean);
  if (parts.length <= 2) return `${parts.join("/")}/`;
  return `${parts.slice(0, 3).join("/")}/.../`;
}

function getModelSourceOwner(env, sourceOwner = "") {
  return str(sourceOwner || env.MODEL_SOURCE_OWNER_DEFAULT || DEFAULT_MODEL_SOURCE_OWNER) || DEFAULT_MODEL_SOURCE_OWNER;
}

function getModelR2RootPrefix(env) {
  return normalizeCategoryPath(env.MODEL_R2_ROOT_PREFIX || env.MODEL_R2_SOURCE_ROOT || "");
}

function getModelR2CategoryPaths(env, categoryPath = "") {
  const explicit = normalizeCategoryPath(categoryPath);
  if (explicit) return [explicit];
  return uniqueStrings([
    ...splitConfiguredPaths(env.MODEL_R2_CATEGORY_PATHS),
    ...DEFAULT_MODEL_R2_CATEGORY_PATHS,
  ]);
}

function sourceLookupEnabled(env) {
  return str(env.MODEL_R2_LOOKUP_ENABLED || "true").toLowerCase() !== "false";
}

function normalizePackageTier(value) {
  const raw = str(value).trim().toLowerCase();
  if (!raw) return "";
  if (raw === "black card") return "blackcard";
  if (["vip", "svip", "blackcard"].includes(raw)) return raw;
  if (raw === "premium") return "premium";
  if (["standard", "basic", "default"].includes(raw)) return "standard";
  return "";
}

function resolvePackageInheritance(packageTier) {
  if (packageTier === "premium") return ["standard"];
  if (["vip", "svip", "blackcard"].includes(packageTier)) return ["premium", "standard"];
  return [];
}

function resolveGoogleDrivePackage(identity, requestedTier = "") {
  const requested = normalizePackageTier(requestedTier);
  const modelTier = normalizePackageTier(identity?.tier);
  const packageTier = requested || modelTier || "standard";
  const driveFolderKey = ["vip", "svip", "blackcard"].includes(packageTier) ? "vip" : packageTier;
  const folder = GOOGLE_DRIVE_PACKAGE_FOLDERS[driveFolderKey] || GOOGLE_DRIVE_PACKAGE_FOLDERS.standard;
  const requiresOperatorReview = !requested && !modelTier;
  const packageInherits = resolvePackageInheritance(packageTier);
  return {
    asset_source: "google_drive",
    package_tier: packageTier,
    drive_folder_key: driveFolderKey,
    folder_id: folder.folder_id,
    folder_url: folder.folder_url,
    folder_label: folder.label,
    owner_account: folder.owner_account || GOOGLE_DRIVE_OWNER_EMAIL,
    package_inherits: packageInherits,
    includes_package_tiers: [packageTier, ...packageInherits],
    access_note: str(folder.access_note),
    open_label: str(folder.open_label || "Open Drive folder"),
    legacy_source_account: GOOGLE_DRIVE_LEGACY_EMAIL,
    legacy_source_status: GOOGLE_DRIVE_LEGACY_STATUS,
    requires_operator_review: requiresOperatorReview,
    matched_from: requested ? "operator_override" : modelTier ? "airtable_tier" : "fallback_standard",
  };
}

function buildInheritedDriveLinks(packageInherits) {
  return (Array.isArray(packageInherits) ? packageInherits : [])
    .map((tier) => {
      const normalizedTier = normalizePackageTier(tier);
      const folder = GOOGLE_DRIVE_PACKAGE_FOLDERS[normalizedTier];
      if (!normalizedTier || !folder) return null;
      return {
        tier: normalizedTier,
        folder_id: folder.folder_id,
        folder_url: folder.folder_url,
        label: folder.label,
        open_label: str(folder.open_label || "Open Drive folder"),
      };
    })
    .filter(Boolean);
}

function buildDriveAssetContract(drivePackage) {
  const inheritedPackages = buildInheritedDriveLinks(drivePackage.package_inherits);
  const primaryPackage = {
    tier: drivePackage.package_tier,
    drive_folder_key: drivePackage.drive_folder_key,
    folder_id: drivePackage.folder_id,
    folder_url: drivePackage.folder_url,
    label: drivePackage.folder_label,
    open_label: drivePackage.open_label,
  };

  return {
    primary_package: primaryPackage,
    inherited_packages: inheritedPackages,
    open_drive_links: [primaryPackage, ...inheritedPackages],
  };
}

function normalizePublicUrl(value) {
  const raw = str(value).trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  return raw;
}

function buildModelIdentity(record) {
  const fields = record?.fields || {};
  const modelName = str(pickFieldValue(fields, MODEL_FIELD_ALIASES.model_name));
  const modelCode = str(pickFieldValue(fields, MODEL_FIELD_ALIASES.model_code));
  const modelLookupKey =
    str(pickFieldValue(fields, MODEL_FIELD_ALIASES.model_lookup_key)) ||
    slugToken(modelName || modelCode || record?.id || "model");
  const nickname = str(pickFieldValue(fields, MODEL_FIELD_ALIASES.nickname)) || modelName;
  const telegramUsername = str(pickFieldValue(fields, MODEL_FIELD_ALIASES.telegram_username));
  const telegramId = str(pickFieldValue(fields, MODEL_FIELD_ALIASES.telegram_id));
  const telegramLinked = Boolean(telegramUsername) || Boolean(telegramId);
  const r2FolderPrefix = normalizeR2Prefix(pickFieldValue(fields, MODEL_FIELD_ALIASES.r2_folder_prefix));
  const profileImageKey = str(pickFieldValue(fields, MODEL_FIELD_ALIASES.profile_image_key));
  const galleryPrefix = normalizeR2Prefix(pickFieldValue(fields, MODEL_FIELD_ALIASES.gallery_prefix));
  const previewImageUrl = normalizePublicUrl(
    pickFieldValue(fields, MODEL_FIELD_ALIASES.preview_image_url)
  );

  return {
    airtable_record_id: str(record?.id),
    model_name: modelName,
    model_code: modelCode,
    model_lookup_key: modelLookupKey,
    nickname,
    telegram_username: telegramUsername,
    telegram_id: telegramId,
    telegram_status: telegramLinked ? "linked" : "unlinked",
    status: str(pickFieldValue(fields, MODEL_FIELD_ALIASES.status)) || "unknown",
    tier: str(pickFieldValue(fields, MODEL_FIELD_ALIASES.tier)) || "",
    visibility_status: str(pickFieldValue(fields, MODEL_FIELD_ALIASES.visibility_status)) || "",
    r2_folder_prefix: r2FolderPrefix,
    r2_folder_status: r2FolderPrefix ? "linked" : "missing",
    profile_image_key: profileImageKey,
    preview_image_url: previewImageUrl,
    gallery_prefix: galleryPrefix,
    legacy_folder_name: str(pickFieldValue(fields, MODEL_FIELD_ALIASES.legacy_folder_name)),
    model_dashboard_url: str(pickFieldValue(fields, MODEL_FIELD_ALIASES.model_dashboard_url)),
    last_synced_at: str(pickFieldValue(fields, MODEL_FIELD_ALIASES.last_synced_at)) || null,
    raw_fields: fields,
  };
}

async function fetchModelRecordById(env, modelId) {
  const tableName = getModelsTableName(env);
  const record = await airtableGetById(env, tableName, modelId);
  if (!record) throw new Error("model_not_found");
  return record;
}

function normalizeManifestPrefix(entry) {
  const raw = str(entry?.r2_prefix);
  if (!raw || raw.startsWith("local://")) return "";
  return normalizeR2Prefix(raw);
}

function buildAssetUrl(env, key) {
  const cleanKey = str(key).replace(/^\/+/, "");
  if (!cleanKey || !validatePublicModelAssetKey(cleanKey).ok) return null;
  const base = str(env.MODEL_ASSETS_PUBLIC_BASE_URL || env.R2_PUBLIC_BASE_URL || "");
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${cleanKey}`;
}

const PUBLIC_MODEL_ASSET_PREFIX_RE = /^models\/[^/]+\/(?:profile|gallery|compcard)\/$/;
const PUBLIC_MODEL_ASSET_KEY_RE = /^models\/[^/]+\/(?:(?:profile\/main)|(?:gallery\/[^/]+)|(?:compcard\/[^/]+))\.jpg$/;
const PROTECTED_MODEL_ASSET_PREFIXES = [
  "private/",
  "evidence/",
  "line-notes/",
  "sigil/",
  "blackcard/",
  "slips/",
];

function validateModelAssetPathSyntax(value) {
  const raw = str(value);
  if (!raw) return { ok: false, error: "missing_model_asset_path" };
  if (/^https?:\/\//i.test(raw)) return { ok: false, error: "model_asset_path_must_not_be_url" };
  if (raw.startsWith("/")) return { ok: false, error: "model_asset_path_must_not_start_with_slash" };
  if (raw.includes("\\")) return { ok: false, error: "model_asset_path_must_not_contain_backslash" };
  if (raw.includes("..")) return { ok: false, error: "model_asset_path_must_not_contain_dotdot" };

  const clean = raw.replace(/\/+$/g, raw.endsWith("/") ? "/" : "");
  const segmentPath = clean.endsWith("/") ? clean.slice(0, -1) : clean;
  const parts = segmentPath.split("/");
  if (parts.some((part) => part === "")) {
    return { ok: false, error: "model_asset_path_must_not_contain_empty_segments" };
  }

  const lower = clean.toLowerCase();
  if (PROTECTED_MODEL_ASSET_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return { ok: false, error: "protected_model_asset_prefix_not_allowed" };
  }

  return { ok: true, path: clean };
}

export function validatePublicModelAssetPrefix(value) {
  const syntax = validateModelAssetPathSyntax(value);
  if (!syntax.ok) return syntax;
  const prefix = normalizeR2Prefix(syntax.path);
  if (!PUBLIC_MODEL_ASSET_PREFIX_RE.test(prefix)) {
    return { ok: false, error: "model_asset_prefix_not_public_safe", path: prefix };
  }
  return { ok: true, prefix };
}

export function validatePublicModelAssetKey(value) {
  const syntax = validateModelAssetPathSyntax(value);
  if (!syntax.ok) return syntax;
  const key = syntax.path.replace(/\/+$/g, "");
  if (!PUBLIC_MODEL_ASSET_KEY_RE.test(key)) {
    return { ok: false, error: "model_asset_key_not_public_safe", path: key };
  }
  return { ok: true, key };
}

function assertPublicModelAssetPrefix(value) {
  const validation = validatePublicModelAssetPrefix(value);
  if (!validation.ok) {
    throw new Error(validation.error || "invalid_model_asset_prefix");
  }
  return validation.prefix;
}

async function listR2FolderPreview(env, folderPrefix) {
  const bucket = env.MMD_MODEL_ASSETS;
  const prefix = assertPublicModelAssetPrefix(folderPrefix);
  if (!bucket || !prefix || typeof bucket.list !== "function") {
    return { asset_count: null, preview_keys: [] };
  }

  const listing = await bucket.list({ prefix, limit: 200 });
  const objects = Array.isArray(listing?.objects) ? listing.objects : [];
  const imageKeys = objects
    .map((object) => str(object?.key))
    .filter((key) => /\.(avif|webp|png|jpe?g)$/i.test(key));

  return {
    asset_count: objects.length,
    preview_keys: imageKeys.slice(0, 6),
  };
}

async function listR2ObjectCount(env, folderPrefix, limit = 1000) {
  const bucket = env.MMD_MODEL_ASSETS;
  const prefix = assertPublicModelAssetPrefix(folderPrefix);
  if (!bucket || !prefix || typeof bucket.list !== "function") {
    return { object_count: null, exists: false };
  }

  const listing = await bucket.list({ prefix, limit });
  const objects = Array.isArray(listing?.objects) ? listing.objects : [];
  return { object_count: objects.length, exists: objects.length > 0 };
}

function buildR2ExactPrefixCandidates({ q, sourceOwner, categoryPath, env }) {
  const query = str(q);
  const querySlug = slugPathPart(query);
  const rootPrefix = getModelR2RootPrefix(env);
  const owner = getModelSourceOwner(env, sourceOwner);
  const categories = getModelR2CategoryPaths(env, categoryPath);
  const names = uniqueStrings([query, querySlug, slugToken(query), normalizeLooseToken(query)]).filter(Boolean);
  const prefixes = [];

  for (const category of categories) {
    const categorySlug = category
      .split("/")
      .map((part) => slugPathPart(part))
      .filter(Boolean)
      .join("/");

    for (const name of names) {
      prefixes.push(joinR2Path(rootPrefix, owner, category, name));
      prefixes.push(joinR2Path(rootPrefix, owner, categorySlug, name));
      prefixes.push(joinR2Path(rootPrefix, category, name));
      prefixes.push(joinR2Path(rootPrefix, categorySlug, name));
      prefixes.push(joinR2Path(owner, category, name));
      prefixes.push(joinR2Path(owner, categorySlug, name));
      prefixes.push(joinR2Path(category, name));
      prefixes.push(joinR2Path(categorySlug, name));
    }
  }

  for (const name of names) {
    prefixes.push(joinR2Path(rootPrefix, owner, name));
    prefixes.push(joinR2Path(rootPrefix, name));
    prefixes.push(joinR2Path(owner, name));
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
  if (!bucket || typeof bucket.list !== "function") {
    return null;
  }

  const queryToken = normalizeLooseToken(q);
  if (!queryToken) return null;

  const rootPrefix = getModelR2RootPrefix(env);
  const owner = getModelSourceOwner(env, sourceOwner);
  const categories = getModelR2CategoryPaths(env, categoryPath);
  const bases = [];
  for (const category of categories) {
    const categorySlug = category
      .split("/")
      .map((part) => slugPathPart(part))
      .filter(Boolean)
      .join("/");
    bases.push(joinR2Path(rootPrefix, owner, category));
    bases.push(joinR2Path(rootPrefix, owner, categorySlug));
    bases.push(joinR2Path(rootPrefix, category));
    bases.push(joinR2Path(rootPrefix, categorySlug));
    bases.push(joinR2Path(owner, category));
    bases.push(joinR2Path(owner, categorySlug));
    bases.push(joinR2Path(category));
    bases.push(joinR2Path(categorySlug));
  }

  for (const basePrefix of uniqueStrings(bases)) {
    const validation = validatePublicModelAssetPrefix(basePrefix);
    if (!validation.ok) continue;
    const safeBasePrefix = validation.prefix;
    const listing = await bucket.list({ prefix: safeBasePrefix, limit: 1000 });
    const objects = Array.isArray(listing?.objects) ? listing.objects : [];
    const folderCounts = new Map();
    for (const object of objects) {
      const segment = segmentAfterBase(object?.key, safeBasePrefix);
      if (!segment) continue;
      folderCounts.set(segment, (folderCounts.get(segment) || 0) + 1);
    }

    for (const [folderName, objectCount] of folderCounts.entries()) {
      const folderToken = normalizeLooseToken(folderName);
      if (folderToken === queryToken || folderToken.includes(queryToken) || queryToken.includes(folderToken)) {
        const matchedPrefix = joinR2Path(safeBasePrefix, folderName);
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
    source_folder: sourceOwner ? `${sourceOwner}/${category}` : category,
    source_owner: sourceOwner,
    requires_per_approval: true,
    private_review_status: "Needs Review",
    notes: `source: R2/${sourceOwner || DEFAULT_MODEL_SOURCE_OWNER} | category path: ${category || "unclassified"} | imported as pre-canonical draft`,
  };

  if (categoryToken.includes("public")) fields.sales_layer = "public";
  if (categoryToken.includes("private")) fields.sales_layer = "private";
  if (categoryToken.includes("exclusive")) fields.private_tier = "black_card_review";
  if (categoryToken.includes("premium")) fields.private_tier = "premium_review";
  if (categoryToken.includes("standard")) fields.private_tier = "standard_review";
  if (categoryToken.includes("extreme")) fields.service_layer = "extreme";
  if (categoryToken.includes("travel")) fields.service_layer = "travel";
  if (categoryToken.includes("straight")) fields.orientation_label = "straight";
  if (categoryToken.includes("gay")) fields.orientation_label = "gay";
  if (categoryToken.includes("both")) fields.orientation_label = "both";

  return compactObject(fields);
}

async function searchR2ModelSource(env, { q, sourceOwner, categoryPath }) {
  if (!sourceLookupEnabled(env)) return null;
  const bucket = env.MMD_MODEL_ASSETS;
  if (!bucket || typeof bucket.list !== "function") return null;

  const owner = getModelSourceOwner(env, sourceOwner);
  const exactCandidates = buildR2ExactPrefixCandidates({ q, sourceOwner: owner, categoryPath, env });
  for (const prefix of exactCandidates) {
    const validation = validatePublicModelAssetPrefix(prefix);
    if (!validation.ok) continue;
    const count = await listR2ObjectCount(env, validation.prefix, 200);
    if (count.exists) {
      return {
        matched_name: str(q),
        matched_prefix: validation.prefix,
        category_path: normalizeCategoryPath(categoryPath || inferCategoryFromPrefix(prefix, owner)),
        object_count: count.object_count,
      };
    }
  }

  return await searchR2ByConfiguredCategories(env, { q, sourceOwner: owner, categoryPath });
}

async function resolveModelSource(env, { q, sourceOwner = "", categoryPath = "" } = {}) {
  const query = str(q);
  if (!query) throw new Error("missing_q");
  const owner = getModelSourceOwner(env, sourceOwner);
  const airtableItems = await searchAdminModels(env, { q: query, limit: 12 });
  if (airtableItems.length) {
    const first = airtableItems[0] || {};
    return {
      ok: true,
      found: true,
      source: "airtable",
      query,
      source_owner: owner,
      matched_name: str(first.model_name || first.nickname || query),
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
    const suggested = inferModelFieldsFromSource({
      modelName: r2Match.matched_name || query,
      sourceOwner: owner,
      categoryPath: r2Match.category_path || categoryPath,
      matchedPrefix: r2Match.matched_prefix,
    });
    return {
      ok: true,
      found: true,
      source: "r2",
      query,
      source_owner: owner,
      matched_name: r2Match.matched_name || query,
      matched_prefix: r2Match.matched_prefix,
      matched_prefix_redacted: redactedPrefix(r2Match.matched_prefix),
      category_path: r2Match.category_path || normalizeCategoryPath(categoryPath),
      object_count: r2Match.object_count,
      airtable_items_count: 0,
      suggested_model_fields: suggested,
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
    category_path: normalizeCategoryPath(categoryPath),
    object_count: 0,
    airtable_items_count: 0,
    suggested_model_fields: {},
  };
}

async function stageModelFromSource(env, body = {}) {
  const modelName = str(body.model_name || body.name || body.q);
  const sourceOwner = getModelSourceOwner(env, body.source_owner);
  const categoryPath = normalizeCategoryPath(body.category_path);
  const rawR2Prefix = str(body.r2_prefix);
  const r2Prefix = normalizeR2Prefix(rawR2Prefix);
  if (!modelName) throw new Error("missing_model_name");

  let resolved = null;
  if (r2Prefix) {
    const prefixValidation = validatePublicModelAssetPrefix(rawR2Prefix);
    if (!prefixValidation.ok) throw new Error(prefixValidation.error || "invalid_model_asset_prefix");
    const count = await listR2ObjectCount(env, prefixValidation.prefix, 200);
    resolved = {
      ok: true,
      found: count.exists,
      source: count.exists ? "r2" : "none",
      query: modelName,
      source_owner: sourceOwner,
      matched_name: modelName,
      matched_prefix: prefixValidation.prefix,
      category_path: categoryPath || inferCategoryFromPrefix(r2Prefix, sourceOwner),
      object_count: count.object_count,
    };
  } else {
    resolved = await resolveModelSource(env, { q: modelName, sourceOwner, categoryPath });
  }

  if (resolved.source === "airtable") {
    return { ok: true, staged: false, reason: "already_exists_in_airtable", resolved };
  }
  if (resolved.source !== "r2" || !resolved.found) {
    return { ok: false, staged: false, reason: "r2_source_not_found", resolved };
  }

  const fields = inferModelFieldsFromSource({
    modelName,
    sourceOwner,
    categoryPath: resolved.category_path || categoryPath,
    matchedPrefix: resolved.matched_prefix,
  });
  const out = await airtableUpsertModel(env, getModelsTableName(env), {
    unique_key: fields.unique_key,
    fields,
  });

  return {
    ok: Boolean(out?.ok),
    staged: Boolean(out?.ok),
    model: out,
    resolved: {
      ...resolved,
      matched_prefix_redacted: redactedPrefix(resolved.matched_prefix),
    },
  };
}

async function buildModelPreview(env, identity, manifestEntry = null, r2Listing = null) {
  const profileImageKey =
    str(identity.profile_image_key) ||
    str(manifestEntry?.local_primary_path ? "" : "");
  const previewImageUrl =
    normalizePublicUrl(identity.preview_image_url) ||
    buildAssetUrl(env, profileImageKey);
  const galleryPrefix =
    normalizeR2Prefix(identity.gallery_prefix) ||
    normalizeManifestPrefix(manifestEntry);
  const previewKeys = Array.isArray(r2Listing?.preview_keys) ? r2Listing.preview_keys : [];

  return {
    profile_image_url: previewImageUrl,
    gallery_preview_urls: previewKeys.map((key) => buildAssetUrl(env, key)).filter(Boolean),
    gallery_prefix,
  };
}

async function searchAdminModels(env, { q = "", limit = 12, folder = "" } = {}) {
  const items = await airtableList(env, getModelsTableName(env), {
    q,
    limit,
    matchFields: MODEL_SEARCH_FIELDS,
  });

  return items.map((record) => {
    const identity = normalizeModelSearchItem(record, env, folder);
    return identity;
  });
}

function normalizeModelSearchItem(record, env, requestedTier = "") {
  const identity = buildModelIdentity(record);
  const drivePackage = resolveGoogleDrivePackage(identity, requestedTier);
  const folders = [
    drivePackage.drive_folder_key,
    drivePackage.package_tier,
    ...drivePackage.package_inherits,
  ].filter(Boolean);
  return {
    id: identity.airtable_record_id,
    model_id: identity.airtable_record_id,
    airtable_record_id: identity.airtable_record_id,
    model_name: identity.model_name || identity.nickname || "Model",
    model_code: identity.model_code || "",
    model_lookup_key: identity.model_lookup_key || "",
    lookup_key: identity.model_lookup_key || "",
    nickname: identity.nickname || "",
    telegram_username: identity.telegram_username || "",
    telegram_id: identity.telegram_id || "",
    telegram_status: identity.telegram_status,
    status: identity.status,
    tier: identity.tier,
    folders: [...new Set(folders)],
    vip_can_pn: ["vip", "svip", "blackcard"].includes(drivePackage.package_tier),
    asset_source: "google_drive",
    package_tier: drivePackage.package_tier,
    r2_folder_status: identity.r2_folder_status,
    asset_folder_status: drivePackage.folder_id ? "linked" : "missing",
    preview_image_url:
      normalizePublicUrl(identity.preview_image_url) ||
      buildAssetUrl(env, identity.profile_image_key),
  };
}

function resolveManifestCandidates(identity) {
  const queries = [
    identity.model_lookup_key,
    identity.model_code,
    identity.model_name,
    identity.nickname,
    identity.legacy_folder_name,
  ].filter(Boolean);

  const matches = [];
  const seen = new Set();

  for (const query of queries) {
    const entry = resolveModelManifestEntry(query);
    const prefix = normalizeManifestPrefix(entry);
    if (!entry || !prefix || seen.has(prefix)) continue;

    let reason = "manifest match";
    if (normalizeLooseToken(query) === normalizeLooseToken(identity.model_lookup_key)) {
      reason = "model_lookup_key exact match";
    } else if (normalizeLooseToken(query) === normalizeLooseToken(identity.model_code)) {
      reason = "model_code exact match";
    } else if (normalizeLooseToken(query) === normalizeLooseToken(identity.model_name)) {
      reason = "normalized model_name match";
    } else if (normalizeLooseToken(query) === normalizeLooseToken(identity.nickname)) {
      reason = "nickname match";
    } else if (normalizeLooseToken(query) === normalizeLooseToken(identity.legacy_folder_name)) {
      reason = "legacy_folder_name match";
    }

    matches.push({
      folder_prefix: prefix,
      match_reason: reason,
      asset_count: Number(entry.asset_count || 0) || null,
      manifest_entry: entry,
    });
    seen.add(prefix);
  }

  return matches;
}

function confidenceFromMatches(matches, linkedPrefix = "") {
  if (linkedPrefix) return "high";
  if (!matches.length) return "low";
  const exact = matches.some((match) => /exact match/.test(match.match_reason));
  if (exact) return "high";
  if (matches.length === 1) return "medium";
  return "low";
}

async function getAdminModelFolder(env, modelId, requestedTier = "") {
  const record = await fetchModelRecordById(env, modelId);
  const identity = buildModelIdentity(record);
  const drivePackage = resolveGoogleDrivePackage(identity, requestedTier);
  const manifestMatches = resolveManifestCandidates(identity);
  const manifestEntry = manifestMatches[0]?.manifest_entry || null;
  const folderPrefix = identity.r2_folder_prefix || normalizeManifestPrefix(manifestEntry);
  const profileImageKey =
    identity.profile_image_key ||
    (folderPrefix ? `${folderPrefix}profile.webp` : "");
  const galleryPrefix =
    normalizeR2Prefix(identity.gallery_prefix) ||
    (folderPrefix ? `${folderPrefix}gallery/` : "");
  const r2Listing = await listR2FolderPreview(env, folderPrefix);
  const preview = await buildModelPreview(
    env,
    { ...identity, profile_image_key: profileImageKey, gallery_prefix: galleryPrefix },
    manifestEntry,
    r2Listing
  );
  const driveAssets = buildDriveAssetContract(drivePackage);

  return {
    ok: true,
    model: {
      airtable_record_id: identity.airtable_record_id,
      model_name: identity.model_name,
      model_lookup_key: identity.model_lookup_key,
      model_code: identity.model_code,
      tier: identity.tier,
    },
    asset_source: "google_drive",
    package: {
      tier: drivePackage.package_tier,
      inherits: drivePackage.package_inherits,
      drive_folder_key: drivePackage.drive_folder_key,
      matched_from: drivePackage.matched_from,
      requires_operator_review: drivePackage.requires_operator_review,
    },
    primary_package: driveAssets.primary_package,
    inherited_packages: driveAssets.inherited_packages,
    open_drive_links: driveAssets.open_drive_links,
    google_drive: {
      owner_account: drivePackage.owner_account,
      legacy_source_account: drivePackage.legacy_source_account,
      legacy_source_status: drivePackage.legacy_source_status,
      folder_id: drivePackage.folder_id,
      folder_url: drivePackage.folder_url,
      folder_label: drivePackage.folder_label,
      open_label: drivePackage.open_label,
      drive_folder_key: drivePackage.drive_folder_key,
      package_inherits: drivePackage.package_inherits,
      includes_package_tiers: drivePackage.includes_package_tiers,
      access_note: drivePackage.access_note,
    },
    r2: {
      bucket: env.MMD_MODEL_ASSETS ? "MMD_MODEL_ASSETS" : str(env.MODEL_ASSETS_BUCKET_NAME || "MMD_MODEL_ASSETS"),
      folder_prefix: folderPrefix || null,
      profile_image_key: profileImageKey || null,
      gallery_prefix: galleryPrefix || null,
      asset_count: r2Listing.asset_count,
      last_synced_at: identity.last_synced_at,
    },
    preview,
  };
}

async function resolveAdminModelFolder(env, modelId, requestedTier = "") {
  const record = await fetchModelRecordById(env, modelId);
  const identity = buildModelIdentity(record);
  const drivePackage = resolveGoogleDrivePackage(identity, requestedTier);
  const matches = resolveManifestCandidates(identity).slice(0, 6).map((match) => ({
    folder_prefix: match.folder_prefix,
    match_reason: match.match_reason,
    asset_count: match.asset_count,
  }));
  matches.unshift({
    package_tier: drivePackage.package_tier,
    package_inherits: drivePackage.package_inherits,
    drive_folder_key: drivePackage.drive_folder_key,
    folder_id: drivePackage.folder_id,
    folder_url: drivePackage.folder_url,
    match_reason: drivePackage.matched_from,
    asset_count: null,
  });
  const confidence = drivePackage.requires_operator_review ? "medium" : "high";
  const driveAssets = buildDriveAssetContract(drivePackage);

  return {
    ok: true,
    asset_source: "google_drive",
    package_tier: drivePackage.package_tier,
    primary_package: driveAssets.primary_package,
    inherited_packages: driveAssets.inherited_packages,
    open_drive_links: driveAssets.open_drive_links,
    google_drive: {
      folder_id: drivePackage.folder_id,
      folder_url: drivePackage.folder_url,
      owner_account: drivePackage.owner_account,
      drive_folder_key: drivePackage.drive_folder_key,
      package_inherits: drivePackage.package_inherits,
      includes_package_tiers: drivePackage.includes_package_tiers,
      access_note: drivePackage.access_note,
      legacy_source_status: drivePackage.legacy_source_status,
      open_label: drivePackage.open_label,
    },
    confidence,
    matches,
    requires_operator_review: drivePackage.requires_operator_review,
  };
}

async function writeModelFolderAuditLog(env, payload) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return { ok: false, skipped: true };
  try {
    const rec = await airtableCreate({
      baseId: env.AIRTABLE_BASE_ID,
      tableId: env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e",
      apiKey: env.AIRTABLE_API_KEY,
      fields: {
        inbox_id: crypto.randomUUID(),
        source: "model_folder_resolver",
        intent: "link_model_folder",
        member_name: payload.model_name || "",
        admin_note: payload.note || "",
        payload_json: JSON.stringify(payload),
        status: "logged",
        error_message: "",
      },
    });
    return { ok: true, record_id: rec?.id || "" };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

async function patchAdminModelFolder(env, modelId, body, req) {
  const rawFolderPrefix = str(body.r2_folder_prefix);
  const folderPrefix = normalizeR2Prefix(rawFolderPrefix);
  const profileImageKey = str(body.profile_image_key);
  const rawGalleryPrefix = str(body.gallery_prefix);
  const galleryPrefix = normalizeR2Prefix(rawGalleryPrefix);
  if (!folderPrefix) throw new Error("missing_r2_folder_prefix");
  const folderValidation = validatePublicModelAssetPrefix(rawFolderPrefix);
  if (!folderValidation.ok) throw new Error(folderValidation.error || "invalid_model_asset_prefix");
  if (profileImageKey) {
    const profileValidation = validatePublicModelAssetKey(profileImageKey);
    if (!profileValidation.ok) throw new Error(profileValidation.error || "invalid_model_asset_key");
  }
  let safeGalleryPrefix = galleryPrefix;
  if (galleryPrefix) {
    const galleryValidation = validatePublicModelAssetPrefix(rawGalleryPrefix);
    if (!galleryValidation.ok) throw new Error(galleryValidation.error || "invalid_model_asset_prefix");
    safeGalleryPrefix = galleryValidation.prefix;
  }

  const update = compactObject({
    r2_folder_prefix: folderValidation.prefix,
    profile_image_key: profileImageKey,
    gallery_prefix: safeGalleryPrefix,
  });

  const patched = await airtablePatchById(env, getModelsTableName(env), modelId, update);
  if (!patched.ok) {
    throw new Error(patched.error || "model_folder_patch_failed");
  }

  const record = await fetchModelRecordById(env, modelId);
  const identity = buildModelIdentity(record);
  const actor =
    str(req.headers.get("X-Admin-Actor") || "") ||
    "admin-worker";
  const audit = await writeModelFolderAuditLog(env, {
    actor,
    airtable_record_id: modelId,
    model_name: identity.model_name,
    model_lookup_key: identity.model_lookup_key,
    r2_folder_prefix: folderValidation.prefix,
    profile_image_key: profileImageKey,
    gallery_prefix: safeGalleryPrefix,
    note: `Operator linked model folder to ${folderValidation.prefix}`,
  });

  const payload = await getAdminModelFolder(env, modelId);
  return {
    ok: true,
    audit,
    ...payload,
  };
}

async function airtablePatchById(env, tableName, id, patch) {
  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: patch || {} }),
  });
  if (!r.ok) return { ok: false, error: "airtable_patch_failed", detail: r };
  return { ok: true, id: r.data.id, fields: r.data.fields || {} };
}

async function airtableCreateRecord(env, tableName, fields) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    throw new Error("missing_airtable_env");
  }

  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });

  if (!r.ok) {
    throw new Error(r?.data ? JSON.stringify(r.data) : "airtable_create_failed");
  }

  const rec = r.data?.records?.[0];
  return { id: rec?.id || "", fields: rec?.fields || {} };
}

// Body format:
//   { id:"recXXXX", patch:{...} }
//   OR { memberstack_id:"...", patch:{...} }
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

// Body format:
//   { id?: "recXXXX", unique_key?: "...", fields:{...} }
async function airtableUpsertModel(env, tableName, body) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return { ok: false, error: "missing_airtable_env" };
  }

  const fields = normalizeModelUpsertFields(env, body);
  const id = str(body?.id || body?.record_id);
  const uniqueKey = str(body?.unique_key || fields.unique_key);
  const write = async (recordId, patchFields) => {
    const model = await airtablePatchById(env, tableName, recordId, patchFields);
    if (!model?.ok) return model;
    const job_snapshot = await maybeWriteModelJobSnapshot(env, fields, model);
    return { ...model, job_snapshot };
  };

  if (id) return await write(id, fields);

  if (uniqueKey) {
    const safe = escapeFormulaValue(uniqueKey);
    const found = await airtableFindOne(env, tableName, `{unique_key}="${safe}"`);
    if (found?.id) return await write(found.id, fields);

    const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields: { ...fields, unique_key: uniqueKey } }] }),
    });
    if (!r.ok) return { ok: false, error: "airtable_create_failed", detail: r };
    const rec = r.data?.records?.[0];
    const model = { ok: true, id: rec?.id, fields: rec?.fields || {} };
    const job_snapshot = await maybeWriteModelJobSnapshot(env, fields, model);
    return { ...model, job_snapshot };
  }

  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!r.ok) return { ok: false, error: "airtable_create_failed", detail: r };
  const rec = r.data?.records?.[0];
  const model = { ok: true, id: rec?.id, fields: rec?.fields || {} };
  const job_snapshot = await maybeWriteModelJobSnapshot(env, fields, model);
  return { ...model, job_snapshot };
}

function getAllowedModelFields(env) {
  return parseCsv(env.ALLOWED_MODEL_FIELDS || DEFAULT_ALLOWED_MODEL_FIELDS.join(","));
}

function normalizeModelUpsertFields(env, body) {
  const allowed = getAllowedModelFields(env);
  const direct = pickAllowedFields(body, allowed);
  const nested = pickAllowedFields(body?.fields, allowed);
  return compactObject({ ...direct, ...nested });
}

function buildModelAbilitySnapshot(fields) {
  const existing = str(fields.model_ability_snapshot);
  if (existing) return existing;
  return JSON.stringify(
    compactObject({
      private_tier: str(fields.private_tier),
      private_work_format: str(fields.private_work_format),
      pn_ability: str(fields.pn_ability),
      mk_ability: str(fields.mk_ability),
      burn_ability: str(fields.burn_ability),
    })
  );
}

function shouldWriteJobModelSnapshot(fields) {
  const source = str(fields.immigration_source).toLowerCase();
  return Boolean(fields.immigration_job_id || source.includes("job"));
}

async function maybeWriteModelJobSnapshot(env, fields, model) {
  if (!shouldWriteJobModelSnapshot(fields)) return { ok: true, skipped: true };

  const tableName = modelJobsTable(env);
  const jobId = str(fields.immigration_job_id);
  const sessionId = str(fields.immigration_session_id);
  const snapshotFields = compactObject({
    model_immigration_status: "model_created",
    immigrated_model_id: str(model?.id),
    model_private_work_format_snapshot: str(fields.private_work_format),
    model_private_tier_snapshot: str(fields.private_tier),
    model_ability_snapshot: buildModelAbilitySnapshot(fields),
  });

  if (!Object.keys(snapshotFields).some((key) => JOB_MODEL_SNAPSHOT_FIELDS.includes(key))) {
    return { ok: true, skipped: true };
  }

  let recordId = /^rec[a-zA-Z0-9]{14,}$/.test(jobId) ? jobId : "";
  if (!recordId) {
    const formulas = [];
    for (const field of uniqueValues(["job_id", "Job ID", "jobId", "Job Record ID"])) {
      if (jobId) formulas.push(exactModelFormula(field, jobId));
    }
    for (const field of uniqueValues(["session_id", "Session ID"])) {
      if (sessionId) formulas.push(exactModelFormula(field, sessionId));
    }
    for (const formula of formulas) {
      const found = await airtableFindOne(env, tableName, formula);
      if (found?.id) {
        recordId = found.id;
        break;
      }
    }
  }

  if (!recordId) return { ok: false, error: "job_not_found", job_id: jobId, session_id: sessionId };
  return await airtablePatchById(env, tableName, recordId, snapshotFields);
}

async function createDraftMember(env, body) {
  const tableName = env.AIRTABLE_TABLE_MEMBERS || "members";
  const seed = str(body.query || body.name || body.nickname || body.memberstack_id || body.telegram_username);
  const memberstackId = str(body.memberstack_id) || deriveMemberstackId([seed, body.telegram_username, body.telegram_id]);

  const existing = await airtableFindOne(
    env,
    tableName,
    `{memberstack_id}="${escapeFormulaValue(memberstackId)}"`
  );
  if (existing) return existing;

  const name = str(body.name || seed || memberstackId);
  const nickname = str(body.nickname || seed || name);
  const fields = compactObject({
    name,
    nickname,
    memberstack_id: memberstackId,
    telegram_username: str(body.telegram_username),
    telegram_id: str(body.telegram_id),
  });

  return await airtableCreateRecord(env, tableName, fields);
}

async function createDraftModel(env, body) {
  const tableName = env.AIRTABLE_TABLE_MODELS || "models";
  const seed = str(body.query || body.name || body.nickname || body.unique_key || body.telegram_username);
  const manifestEntry = resolveModelManifestEntry(
    seed || body.folder_name || body.model_name || body.username
  );
  if (manifestEntry) {
    return await ensureModelFromManifest(env, tableName, manifestEntry);
  }

  const uniqueKey = str(body.unique_key) || `draft_${slugToken(seed, "model")}`;

  const existing = await airtableFindOne(
    env,
    tableName,
    `{unique_key}="${escapeFormulaValue(uniqueKey)}"`
  );
  if (existing) return existing;

  const name = str(body.name || seed || uniqueKey);
  const nickname = str(body.nickname || seed || name);
  const fields = compactObject({
    name,
    nickname,
    unique_key: uniqueKey,
    telegram_username: str(body.telegram_username),
    telegram_id: str(body.telegram_id),
  });

  return await airtableCreateRecord(env, tableName, fields);
}

/* =========================
   Airtable Writer helpers
========================= */
async function airtableCreate({ baseId, tableId, apiKey, fields }) {
  const r = await fetch(`${AIRTABLE_API}/${baseId}/${tableId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records: [{ fields }] }),
  });

  const t = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(t));
  return t.records?.[0];
}

function collectPrivateModelImmigrationFields(body = {}, context = {}) {
  if (body.__model_immigration_done) return {};
  const model = readObject(body.model);
  const source = { ...body, ...model };
  const fields = pickAllowedFields(source, DEFAULT_ALLOWED_MODEL_FIELDS);
  const hasPrivateSignal = [
    "sales_layer",
    "private_tier",
    "private_work_format",
    "exclusive_group",
    "can_work_public",
    "can_work_private",
    "pn_ability",
    "mk_ability",
    "burn_ability",
    "approved_for_private_sales",
  ].some((key) => Object.prototype.hasOwnProperty.call(source, key));

  if (!hasPrivateSignal) return {};

  return compactObject({
    working_name: str(source.working_name || source.model_name || source.name || body.talent_name),
    nickname: str(source.nickname || source.working_name || source.model_name || body.talent_name),
    sales_layer: str(source.sales_layer || "private"),
    ...fields,
    immigration_source: str(source.immigration_source || context.source),
    immigration_job_id: str(source.immigration_job_id || context.job_id),
    immigration_session_id: str(source.immigration_session_id || context.session_id),
    immigrated_at: str(source.immigrated_at || new Date().toISOString()),
    immigrated_by: str(source.immigrated_by || context.actor || "admin-worker"),
  });
}

async function maybeUpsertPrivateModelFromAdminFlow(env, body = {}, context = {}) {
  const fields = collectPrivateModelImmigrationFields(body, context);
  if (!Object.keys(fields).length) return null;

  const id = str(body.model_airtable_id || body.model_id || body.model_ref || body.model?.model_id);
  const payload = {
    ...(id.startsWith("rec") ? { id } : {}),
    unique_key: str(body.unique_key || body.model_unique_key || body.model?.unique_key),
    fields,
  };
  const model = await airtableUpsertModel(env, getModelsTableName(env), payload);
  return { ok: Boolean(model?.ok), model };
}

async function createAdminSession(env, body) {
  const modelImmigration = await maybeUpsertPrivateModelFromAdminFlow(env, body, {
    source: "session_created",
    job_id: body?.job_id || body?.metadata?.job_id,
    session_id: body?.session_id || body?.sessionId,
    actor: body?.actor || body?.created_by || body?.metadata?.actor,
  });
  if (modelImmigration?.model?.id) {
    body = {
      ...body,
      model_id: body.model_id || modelImmigration.model.id,
      model_airtable_id: body.model_airtable_id || modelImmigration.model.id,
    };
  }

  const amount = toNum(body?.amount_thb ?? body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount_thb");

  const payModelAmount = Number(
    body.pay_model_thb ?? body.pay_model ?? body.model_pay_thb ?? body.model_pay
  );
  const hasPayModelAmount =
    body?.pay_model_thb != null ||
    body?.pay_model != null ||
    body?.model_pay_thb != null ||
    body?.model_pay != null;
  if (hasPayModelAmount && (!Number.isFinite(payModelAmount) || payModelAmount < 0)) {
    throw new Error("invalid_pay_model_thb");
  }

  const payload = {
    session_id: str(body.session_id || body.sessionId || `sess_${crypto.randomUUID()}`),
    payment_ref: str(
      body.payment_ref ||
        body.paymentRef ||
        `admin_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
    ),
    client_name: str(body.client_name || body.member_name || body.customer_name),
    model_name: str(body.model_name || body.talent_name),
    memberstack_id: str(body.memberstack_id || body.member_id || body.member_ref),
    model_id: str(body.model_id || body.model_ref),
    model_airtable_id: str(body.model_airtable_id || body.model_id || body.model_ref),
    model_lookup_key: str(body.model_lookup_key || body.model_unique_key || body.unique_key),
    model_asset_source: str(body.model_asset_source || "google_drive"),
    model_package_tier: str(body.model_package_tier || body.package_tier || body.tier || "standard"),
    model_asset_folder_id: str(body.model_asset_folder_id || body.folder_id),
    model_asset_folder_url: str(body.model_asset_folder_url || body.folder_url),
    model_r2_folder_prefix: normalizeR2Prefix(body.model_r2_folder_prefix || body.r2_folder_prefix),
    selected_profile_image_key: str(body.selected_profile_image_key || body.profile_image_key),
    job_type: str(body.job_type || body.session_type || "session"),
    job_date: str(body.job_date || body.service_date || body.date),
    start_time: str(body.start_time || body.time_start),
    end_time: str(body.end_time || body.time_end),
    location_name: str(body.location_name || body.location || body.venue_name),
    google_map_url: str(body.google_map_url || body.google_maps_url || body.maps_url),
    note: str(body.note || body.notes),
    amount_thb: amount,
    pay_model_thb: hasPayModelAmount ? payModelAmount : null,
    currency: str(body.currency || "THB"),
    payment_mode: str(body.payment_mode || body.metadata?.payment_mode || "manual_transfer"),
    payment_type: str(body.payment_type || body.payment_stage || "full"),
    payment_method: str(body.payment_method || "promptpay"),
    confirm_page: body.confirm_page || null,
    model_confirm_page: body.model_confirm_page || null,
    return_url: body.return_url || body.success_url || null,
    cancel_url: body.cancel_url || null,
    partner_snapshot: body.partner_snapshot || null,
    referral_snapshot: body.referral_snapshot || null,
    commission_splits: Array.isArray(body.commission_splits) ? body.commission_splits : [],
    commission_snapshot: body.commission_snapshot || null,
    commission_group_key: str(body.commission_group_key || ""),
    commission_snapshot_locked:
      body.commission_snapshot_locked == null ? true : Boolean(body.commission_snapshot_locked),
    metadata: {
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
      payment_mode: str(body.payment_mode || body.metadata?.payment_mode || "manual_transfer"),
    },
  };

  const missing = [];
  if (!payload.client_name && !payload.memberstack_id) missing.push("client_name");
  if (!payload.model_name && !payload.model_id) missing.push("model_name");
  if (!payload.job_date) missing.push("job_date");
  if (!payload.start_time) missing.push("start_time");
  if (!payload.end_time) missing.push("end_time");
  if (!payload.location_name) missing.push("location_name");
  if (missing.length) throw new Error(`missing_required_fields:${missing.join(",")}`);

  let confirmData = {};
  try {
    confirmData = await callPaymentsCreateLink(env, payload);
  } catch (error) {
    if (!isMissingConfirmRoute(error)) throw error;
    confirmData = await mintLocalConfirmLinks(env, payload);
  }

  const confirmation_url =
    confirmData.confirmation_url ||
    confirmData.customer_confirmation_url ||
    confirmData.confirm_url ||
    confirmData.url ||
    confirmData.link ||
    null;

  return {
    mode: confirmData.mode || "payments_worker",
    session_id: payload.session_id,
    payment_ref: payload.payment_ref,
    amount_thb: payload.amount_thb,
    pay_model_thb: payload.pay_model_thb,
    memberstack_id: payload.memberstack_id,
    model_id: payload.model_id,
    model_airtable_id: payload.model_airtable_id,
    model_lookup_key: payload.model_lookup_key,
    model_asset_source: payload.model_asset_source,
    model_package_tier: payload.model_package_tier,
    model_asset_folder_id: payload.model_asset_folder_id,
    model_asset_folder_url: payload.model_asset_folder_url,
    model_r2_folder_prefix: payload.model_r2_folder_prefix,
    selected_profile_image_key: payload.selected_profile_image_key,
    client_name: payload.client_name,
    model_name: payload.model_name,
    confirmation_url,
    confirm_url: confirmData.confirm_url || confirmation_url,
    customer_confirmation_url: confirmData.customer_confirmation_url || confirmation_url,
    model_confirmation_url: confirmData.model_confirmation_url || null,
    short_url: confirmData.short_url || null,
    payments_response: confirmData,
    model_immigration: modelImmigration,
  };
}

async function createAdminJob(env, body, req) {
  const job = normalizeCreateJobPayload(body);
  const modelImmigration = await maybeUpsertPrivateModelFromAdminFlow(env, body, {
    source: "job_created",
    job_id: job.job_id,
    session_id: job.session_payload.session_id,
    actor: job.actor,
  });
  if (modelImmigration?.model?.id) {
    job.session_payload.model_id = job.session_payload.model_id || modelImmigration.model.id;
    job.session_payload.model_airtable_id =
      job.session_payload.model_airtable_id || modelImmigration.model.id;
    job.session_payload.__model_immigration_done = true;
  }
  const session = await createAdminSession(env, job.session_payload);
  const links = buildCreateJobLinks(env, job, session);
  const line = buildLineJobDelivery(job, links);
  const linePush = await maybePushLineJob(env, job, line);
  const lineInbox = await maybePatchLineInboxForJob(env, job, session, links, linePush);
  const telegramGate = await notifyTelegramCreateJobGate(env, job, session, links, line, linePush, req);

  return {
    contract_version: "create_job_v1b",
    source: "line_inbox",
    telegram_gate: telegramGate,
    job: {
      job_id: job.job_id,
      visibility: job.visibility,
      public_job: job.visibility === "public",
      private_job: job.visibility === "private",
      status: "session_created",
      client_name: job.client_name,
      model_name: job.model_name,
      job_type: job.job_type,
      job_date: job.job_date,
      start_time: job.start_time,
      end_time: job.end_time,
      location_name: job.location_name,
    },
    session: {
      session_id: session.session_id,
      payment_ref: session.payment_ref,
      amount_thb: session.amount_thb,
      pay_model_thb: session.pay_model_thb,
      created: true,
      source_response_mode: session.mode,
    },
    links,
    line: {
      copy_text: line.copy_text,
      push: linePush,
      line_user_id: job.line_user_id,
    },
    airtable: {
      line_inbox: lineInbox,
      model_immigration: modelImmigration,
    },
    payments_response: session.payments_response,
  };
}

function flattenCreateJobResponse(out) {
  const session = out?.session || {};
  const links = out?.links || {};
  const linePush = out?.line?.push || {};
  const telegramGate = out?.telegram_gate || {};

  return {
    ...out,
    session_id: session.session_id || out?.session_id || "",
    payment_ref: session.payment_ref || out?.payment_ref || "",
    amount_thb: session.amount_thb ?? out?.amount_thb ?? null,
    customer_confirmation_url:
      links.customer_confirmation_url || links.confirmation_url || out?.customer_confirmation_url || "",
    model_confirmation_url: links.model_confirmation_url || out?.model_confirmation_url || "",
    member_return_url: links.member_return_url || links.customer_confirmation_url || "",
    model_return_url: links.model_return_url || links.model_confirmation_url || "",
    line_push_status: linePush.ok ? "sent" : linePush.mode || "copy_ready",
    telegram_notify_status: telegramGate.ok ? "notified" : telegramGate.reason || "pending",
  };
}

function normalizeCreateJobPayload(body) {
  const metadata = readObject(body.metadata);
  const payloadJson = readObject(body.payload_json);
  const identity = readObject(body.identity);
  const notes = readObject(body.notes);
  const clientLineage = readObject(body.client_lineage);
  const lineIdentity = readObject(body.line_identity);
  const work = readObject(body.work);
  const model = readObject(body.model);
  const telegramGate = readObject(body.telegram_gate);
  const jobDetails = readObject(body.job_details);
  const payment = readObject(body.payment);
  const humanSupport = readObject(body.human_support);

  const clientName =
    str(
      body.client_name ||
        body.member_name ||
        body.customer_name ||
        body.display_name ||
        body.line_display_name ||
        clientLineage.client_name ||
        lineIdentity.line_display_name ||
        identity.display_name ||
        identity.full_name
    ) ||
    str(body.email || body.member_email || clientLineage.email || identity.email) ||
    str(body.line_user_id || lineIdentity.line_user_id || identity.line_user_id);
  const modelName = str(body.model_name || body.talent_name || model.model_name || payloadJson.model_name);
  const jobType = str(body.job_type || body.session_type || work.job_type || work.job_lane || payloadJson.job_type || "booking");
  const jobDate = str(body.job_date || body.service_date || body.date || jobDetails.job_date || payloadJson.job_date);
  const startTime = str(body.start_time || body.time_start || jobDetails.start_time || payloadJson.start_time);
  const endTime = str(body.end_time || body.time_end || jobDetails.end_time || payloadJson.end_time);
  const locationName = str(body.location_name || body.location || body.venue_name || jobDetails.location_name || payloadJson.location_name);
  const amount = toNum(body.amount_thb ?? body.amount ?? payment.amount_thb ?? payloadJson.amount_thb);
  const payModelAmount = toNum(
    body.pay_model_thb ?? body.pay_model ?? body.model_pay_thb ?? payment.pay_model_thb ?? payloadJson.pay_model_thb
  );
  const lineInboxRecordId = str(
    body.line_inbox_record_id ||
      body.inbox_record_id ||
      body.line_inbox_id ||
      lineIdentity.line_record_id ||
      metadata.line_inbox_record_id
  );
  const lineUserId = str(body.line_user_id || lineIdentity.line_user_id || identity.line_user_id || metadata.line_user_id);
  const visibility = normalizeJobVisibility(
    body.job_visibility ||
      body.visibility ||
      body.job_privacy ||
      work.job_visibility ||
      work.privacy_level ||
      payloadJson.job_visibility
  );
  const sessionId = str(body.session_id || body.sessionId || metadata.session_id);
  const paymentRef = str(body.payment_ref || body.paymentRef || metadata.payment_ref);
  const jobId = str(body.job_id || body.jobId || metadata.job_id) || sessionId || `job_${crypto.randomUUID()}`;

  const sessionPayload = {
    ...body,
    session_id: sessionId || undefined,
    payment_ref: paymentRef || undefined,
    client_name: clientName,
    model_name: modelName,
    memberstack_id: str(
      body.memberstack_id || body.member_id || body.member_ref || clientLineage.memberstack_id || identity.member_id
    ),
    model_id: str(body.model_id || body.model_ref || body.model_record_id || model.model_id || payloadJson.model_record_id),
    model_airtable_id: str(
      body.model_airtable_id ||
        body.model_id ||
        body.model_record_id ||
        model.model_id ||
        payloadJson.model_airtable_id
    ),
    model_lookup_key: str(body.model_lookup_key || model.model_lookup_key || model.lookup_key || payloadJson.model_lookup_key),
    model_asset_source: str(body.model_asset_source || model.model_asset_source || payloadJson.model_asset_source || "google_drive"),
    model_package_tier: str(
      body.model_package_tier ||
        body.package_tier ||
        work.model_folder ||
        payloadJson.model_package_tier ||
        payloadJson.package_tier ||
        "standard"
    ),
    model_asset_folder_id: str(body.model_asset_folder_id || body.folder_id || payloadJson.model_asset_folder_id || payloadJson.folder_id),
    model_asset_folder_url: str(body.model_asset_folder_url || body.folder_url || payloadJson.model_asset_folder_url || payloadJson.folder_url),
    model_r2_folder_prefix: normalizeR2Prefix(body.model_r2_folder_prefix || payloadJson.model_r2_folder_prefix),
    selected_profile_image_key: str(body.selected_profile_image_key || payloadJson.selected_profile_image_key),
    job_type: jobType,
    job_date: jobDate,
    start_time: startTime,
    end_time: endTime,
    location_name: locationName,
    google_map_url: str(body.google_map_url || body.google_maps_url || body.maps_url || jobDetails.google_map_url || payloadJson.google_map_url),
    note: str(
      body.note ||
        body.booking_note ||
        body.manual_note ||
        notes.manual_note ||
        notes.handling_note ||
        notes.operation_note ||
        payloadJson.booking_note
    ),
    amount_thb: amount,
    pay_model_thb: payModelAmount,
    currency: str(body.currency || "THB"),
    payment_type: str(body.payment_type || body.payment_stage || payment.payment_type || payloadJson.payment_type || "deposit"),
    payment_method: str(body.payment_method || payment.payment_method || payloadJson.payment_method || "promptpay"),
    metadata: {
      ...metadata,
      source: str(metadata.source || body.source || "line_inbox"),
      line_user_id: lineUserId,
      line_inbox_record_id: lineInboxRecordId,
      job_visibility: visibility,
      job_id: jobId,
      flow_version: str(body.flow_version),
      frontend_surface: str(body.frontend_surface),
      assigned_assistant: str(humanSupport.assigned_assistant),
      escalation_owner: str(humanSupport.escalation_owner),
      telegram_gate,
      client_lineage: clientLineage,
      line_identity: lineIdentity,
      work,
      model,
      payment,
      notes,
      model_airtable_id: str(body.model_airtable_id || body.model_id || model.model_id || payloadJson.model_airtable_id),
      model_lookup_key: str(body.model_lookup_key || model.model_lookup_key || model.lookup_key || payloadJson.model_lookup_key),
      model_asset_source: str(body.model_asset_source || model.model_asset_source || payloadJson.model_asset_source || "google_drive"),
      model_package_tier: str(
        body.model_package_tier ||
          body.package_tier ||
          work.model_folder ||
          payloadJson.model_package_tier ||
          payloadJson.package_tier ||
          "standard"
      ),
      model_asset_folder_id: str(body.model_asset_folder_id || body.folder_id || payloadJson.model_asset_folder_id || payloadJson.folder_id),
      model_asset_folder_url: str(body.model_asset_folder_url || body.folder_url || payloadJson.model_asset_folder_url || payloadJson.folder_url),
      model_r2_folder_prefix: normalizeR2Prefix(body.model_r2_folder_prefix || payloadJson.model_r2_folder_prefix),
      selected_profile_image_key: str(body.selected_profile_image_key || payloadJson.selected_profile_image_key),
    },
  };

  return {
    raw: body,
    metadata,
    payload_json: payloadJson,
    job_id: jobId,
    visibility,
    client_name: clientName,
    model_name: modelName,
    job_type: jobType,
    job_date: jobDate,
    start_time: startTime,
    end_time: endTime,
    location_name: locationName,
    line_user_id: lineUserId,
    line_inbox_record_id: lineInboxRecordId,
    line_language: normalizeLineLanguage(body.line_language || body.language || metadata.language),
    push_line: body.push_line === true || str(body.delivery_mode || body.line_delivery_mode).toLowerCase() === "push",
    telegram_chat_id: str(body.telegram_chat_id || metadata.telegram_chat_id),
    telegram_message_thread_id: str(body.telegram_message_thread_id || metadata.telegram_message_thread_id || body.thread_id),
    actor: str(body.actor || body.created_by || metadata.actor || humanSupport.assigned_assistant || "admin-worker"),
    session_payload: sessionPayload,
  };
}

function normalizeJobVisibility(value) {
  const raw = str(value).toLowerCase();
  if (["public", "pub"].includes(raw)) return "public";
  return "private";
}

function normalizeLineLanguage(value) {
  const raw = str(value).toLowerCase();
  if (raw === "en" || raw === "english") return "en";
  return "th";
}

function buildCreateJobLinks(env, job, session) {
  const base = getWebBaseUrl(env);
  const customerConfirmationUrl = str(session.customer_confirmation_url || session.confirmation_url || session.confirm_url);
  const modelConfirmationUrl = str(session.model_confirmation_url);
  const privateJobUrl = str(job.raw.private_job_url || job.raw.private_url) || customerConfirmationUrl;
  const publicJobUrl =
    str(job.raw.public_job_url || job.raw.public_url) ||
    (job.visibility === "public"
      ? buildAbsoluteUrl(`/jobs/${encodeURIComponent(slugToken(job.job_id, "job"))}`, base)
      : "");

  return {
    customer_confirmation_url: customerConfirmationUrl,
    model_confirmation_url: modelConfirmationUrl,
    confirmation_url: customerConfirmationUrl,
    public_job_url: publicJobUrl,
    private_job_url: privateJobUrl,
    has_customer_token: customerConfirmationUrl.includes("?t="),
    has_model_token: modelConfirmationUrl.includes("?t="),
  };
}

function buildLineJobDelivery(job, links) {
  const url = links.customer_confirmation_url || links.private_job_url || links.public_job_url;
  const isEnglish = job.line_language === "en";
  const details = [
    job.model_name ? (isEnglish ? `Model: ${job.model_name}` : `นายแบบ: ${job.model_name}`) : "",
    job.job_date ? (isEnglish ? `Date: ${job.job_date}` : `วันที่: ${job.job_date}`) : "",
    job.start_time || job.end_time
      ? (isEnglish ? `Time: ${[job.start_time, job.end_time].filter(Boolean).join(" - ")}` : `เวลา: ${[job.start_time, job.end_time].filter(Boolean).join(" - ")}`)
      : "",
    job.location_name ? (isEnglish ? `Location: ${job.location_name}` : `สถานที่: ${job.location_name}`) : "",
  ].filter(Boolean);

  const lines = isEnglish
    ? [
        "Your MMD booking link is ready.",
        ...details,
        "",
        url ? `Please confirm here: ${url}` : "",
        "If anything needs to be adjusted, reply here and we will assist discreetly.",
      ]
    : [
        "ลิงก์คอนเฟิร์มงาน MMD พร้อมแล้วค่ะ",
        ...details,
        "",
        url ? `กรุณาคอนเฟิร์มที่ลิงก์นี้: ${url}` : "",
        "หากต้องการปรับรายละเอียด ตอบกลับใน LINE นี้ได้เลยค่ะ",
      ];

  return {
    copy_text: lines.filter(Boolean).join("\n"),
  };
}

async function maybePushLineJob(env, job, line) {
  if (!job.push_line) return { attempted: false, ok: false, mode: "copy_only", reason: "push_not_requested" };
  if (!job.line_user_id) return { attempted: false, ok: false, mode: "copy_only", reason: "missing_line_user_id" };

  const linePushUrl = str(env.LINE_PUSH_URL || env.LINE_INTERNAL_PUSH_URL);
  if (linePushUrl) {
    const res = await fetch(linePushUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.INTERNAL_TOKEN ? { "X-Internal-Token": env.INTERNAL_TOKEN } : {}),
      },
      body: JSON.stringify({
        line_user_id: job.line_user_id,
        to: job.line_user_id,
        text: line.copy_text,
        messages: [{ type: "text", text: line.copy_text }],
      }),
    });
    const data = await res.json().catch(() => null);
    return { attempted: true, ok: res.ok, mode: "internal_line_push", status: res.status, data };
  }

  if (env.LINE_CHANNEL_ACCESS_TOKEN) {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: job.line_user_id,
        messages: [{ type: "text", text: line.copy_text }],
      }),
    });
    const data = await res.json().catch(() => null);
    return { attempted: true, ok: res.ok, mode: "line_api", status: res.status, data };
  }

  return { attempted: false, ok: false, mode: "copy_only", reason: "missing_line_push_env" };
}

async function maybePatchLineInboxForJob(env, job, session, links, linePush) {
  if (!job.line_inbox_record_id) {
    return { attempted: false, ok: false, reason: "missing_line_inbox_record_id" };
  }
  if (job.raw.update_line_inbox === false) {
    return { attempted: false, ok: false, reason: "disabled_by_payload" };
  }

  const table = env.AIRTABLE_TABLE_LINE_INBOX || "Line Inbox";
  const fields = compactObject({
    status: str(job.raw.line_inbox_status || "job_created"),
    job_status: "session_created",
    session_id: session.session_id,
    payment_ref: session.payment_ref,
    customer_confirmation_url: links.customer_confirmation_url,
    model_confirmation_url: links.model_confirmation_url,
    line_delivery_mode: linePush?.mode || "copy_only",
    line_delivery_status: linePush?.ok ? "pushed" : "copy_ready",
  });

  try {
    return await airtablePatchById(env, table, job.line_inbox_record_id, fields);
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: String(error?.message || error),
    };
  }
}

async function notifyTelegramCreateJobGate(env, job, session, links, line, linePush, req) {
  const notify = job.raw.notify_telegram !== false && str(job.raw.notify_telegram).toLowerCase() !== "false";
  if (!notify) return { attempted: false, ok: false, reason: "disabled_by_payload" };

  const lines = [
    "<b>CREATE JOB GATE</b>",
    `Visibility: <b>${escapeHtml(job.visibility)}</b>`,
    `Session: <code>${escapeHtml(session.session_id)}</code>`,
    `Payment: <code>${escapeHtml(session.payment_ref)}</code>`,
    `Client: <b>${escapeHtml(job.client_name)}</b>`,
    `Model: <b>${escapeHtml(job.model_name)}</b>`,
    `Date: <b>${escapeHtml(job.job_date)}</b>`,
    `Time: <b>${escapeHtml([job.start_time, job.end_time].filter(Boolean).join(" - "))}</b>`,
    `Location: ${escapeHtml(job.location_name)}`,
    `Amount: <b>${escapeHtml(String(session.amount_thb))} THB</b>`,
    "",
    `Client link: ${escapeHtml(links.customer_confirmation_url)}`,
    links.model_confirmation_url ? `Model link: ${escapeHtml(links.model_confirmation_url)}` : "",
    "",
    `LINE: <b>${escapeHtml(linePush?.ok ? "pushed" : "copy_ready")}</b>`,
    job.line_user_id ? `LINE User: <code>${escapeHtml(job.line_user_id)}</code>` : "",
    job.line_inbox_record_id ? `Inbox: <code>${escapeHtml(job.line_inbox_record_id)}</code>` : "",
    req ? `Actor: <code>${escapeHtml(job.actor)}</code>` : "",
  ].filter(Boolean);

  return await telegramInternalSend(env, {
    chat_id: job.telegram_chat_id,
    message_thread_id: job.telegram_message_thread_id || env.TG_THREAD_CONFIRM || "61",
    text: lines.join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

async function callPaymentsCreateLink(env, payload) {
  const base = str(env.PAYMENTS_WORKER_BASE_URL || env.PAYMENTS_BASE_URL || "").replace(/\/+$/, "");
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
  } catch (_) {}

  if (!res.ok) {
    const error = new Error(data?.error || data?.message || `payments_worker_http_${res.status}`);
    error.status = 502;
    error.upstreamStatus = res.status;
    error.response = data;
    throw error;
  }

  return data || {};
}

function isMissingConfirmRoute(error) {
  const message = str(error?.message).toLowerCase();
  const responseError = str(error?.response?.error).toLowerCase();
  const responseMessage = str(error?.response?.message).toLowerCase();
  return (
    Number(error?.upstreamStatus) === 404 ||
    message.includes("not_found") ||
    message.includes("route not found") ||
    responseError === "not_found" ||
    responseMessage.includes("route not found")
  );
}

function getWebBaseUrl(env) {
  return str(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
}

function buildAbsoluteUrl(value, fallbackBase) {
  const raw = str(value);
  if (!raw) return fallbackBase;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${fallbackBase}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function base64UrlEncode(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(message || "")));
  return bytesToHex(sig);
}

async function signConfirmToken(payload, secret) {
  const encoded = base64UrlEncode(JSON.stringify(payload || {}));
  const signature = await hmacSha256Hex(encoded, secret);
  return `${encoded}.${signature}`;
}

async function mintLocalConfirmLinks(env, payload) {
  const confirmKey = str(env.CONFIRM_KEY);
  if (!confirmKey) throw new Error("missing_confirm_key");

  const session_id = str(payload.session_id) || `sess_${crypto.randomUUID()}`;
  const payment_ref = str(payload.payment_ref) || `pay_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const payment_type = str(payload.payment_type || payload.payment_stage || "full") || "full";
  const base = getWebBaseUrl(env);
  const customerConfirmPage = buildAbsoluteUrl(
    payload.confirm_page || "/confirm/job-confirmation",
    base
  );
  const modelConfirmPage = buildAbsoluteUrl(
    payload.model_confirm_page || "/confirm/job-model",
    base
  );

  const customer_t = await signConfirmToken(
    {
      kind: "customer_confirm",
      role: "customer",
      session_id,
      payment_ref,
      payment_type,
    },
    confirmKey
  );
  const model_t = await signConfirmToken(
    {
      kind: "model_confirm",
      role: "model",
      session_id,
      payment_ref,
      payment_type,
    },
    confirmKey
  );

  return {
    mode: "local_fallback",
    session_id,
    payment_ref,
    customer_t,
    model_t,
    customer_confirmation_url: `${customerConfirmPage}?t=${encodeURIComponent(customer_t)}`,
    model_confirmation_url: `${modelConfirmPage}?t=${encodeURIComponent(model_t)}`,
    confirmation_url: `${customerConfirmPage}?t=${encodeURIComponent(customer_t)}`,
    confirm_url: `${customerConfirmPage}?t=${encodeURIComponent(customer_t)}`,
  };
}

/* =========================
   Telegram internal send (optional)
========================= */
async function telegramInternalSend(env, payload) {
  const url = env.TELEGRAM_INTERNAL_SEND_URL;
  const token = env.INTERNAL_TOKEN;
  if ((!url && !env.TELEGRAM_WORKER) || !token) {
    return { ok: false, error: "missing_telegram_internal_env" };
  }

  const body = {
    chat_id: payload.chat_id,
    message_thread_id: payload.message_thread_id,
    text: payload.text,
    disable_web_page_preview: payload.disable_web_page_preview ?? true,
  };
  if (payload.parse_mode !== undefined) {
    body.parse_mode = payload.parse_mode;
  } else {
    body.parse_mode = "HTML";
  }

  const requestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": token,
    },
    body: JSON.stringify(body),
  };
  const res = env.TELEGRAM_WORKER
    ? await env.TELEGRAM_WORKER.fetch(
        new Request("https://telegram-worker.internal/telegram/internal/send", requestInit),
      )
    : await fetch(url, requestInit);

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, data };
}
