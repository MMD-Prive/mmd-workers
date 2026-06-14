import { authorizeWriteRequest, isAuthorized, readInternalToken } from "./lib/auth";
import { handleInternalRoutes } from "./internal-routes";
import { handleCreateLinks } from "./routes/create-links";
import { handleSendLineSessionCard } from "./routes/line-send-session-card";
import { handleModelPromoteImmigration } from "./lib/model-promote-immigration";
import {
  MODEL_SESSION_DASHBOARD_PATH,
  MODEL_SESSION_STATUS_PATH,
} from "./routes/model-session";
import {
  PAYMENT_PAGE_PATH,
  canonicalPaymentRedirect,
  handlePaymentPage,
  isPaymentPageRoute,
} from "./routes/payment-page";
import {
  handleSigilRenewalAssetRoute,
  isSigilRenewalPageRoute,
  maybeRedirectLegacySigilRenew,
  renderSigilRenewalPage,
} from "./routes/sigil-renewal-page";
import {
  handlePublicActivateVip,
  handlePublicPointsTopup,
} from "./public-renewal-bridge";
import {
  getValidSigilAdminSession,
  handleInternalAdminInviteCreateRoute,
  handleSigilAdminAuthRoute,
  isSigilAdminPath,
  makeSigilAdminLoginRedirect,
  sigilAdminBrowserBootstrapScript,
} from "./routes/admin-auth";
import {
  buildImmigrationLinkContext,
  canReadAirtable,
  confirmCustomerBookingToAirtable,
  findBookingClient,
  intakeLineClientUpsert,
  listRecordsFromAirtable,
  listSessionsFromAirtable,
  patchClientMemberstackId,
  previewLineClientUpsert,
  searchBookingModel,
  syncRecordsToAirtable,
  writeLinkAuditRecord,
} from "./lib/airtable";
import { buildAbsoluteUrl, generateInviteLink, parseInviteIdentity, verifyInviteToken } from "./lib/invite";
import { badRequest, internalError, json, makeMeta, redirect, unauthorized } from "./lib/response";
import { seedLineInboxRecords, seedLogs, seedSessions } from "./lib/seed";
import type {
  CreateJobRequest,
  CreateJobResponse,
  CustomerBookingConfirmRequest,
  CustomerBookingConfirmResponse,
  ExperienceContract,
  Env,
  HealthResponse,
  ImmigrationLinkContext,
  ImmigrationGetResponse,
  ImmigrationIntakeRequest,
  ImmigrationIntakeResponse,
  ImmigrationLinksRequest,
  ImmigrationLinksResponse,
  LineClientIntakeRequest,
  LineClientIntakeResponse,
  LineClientPreviewResponse,
  ImmigrationPromoteRequest,
  ImmigrationPromoteResponse,
  ImmigrationPromotionRecord,
  ImmigrationSourceChannel,
  ImmigrationIntent,
  InviteLane,
  InviteRole,
  LineInboxListResponse,
  LogsResponse,
  Meta,
  MigrationRecord,
  InviteResolveResponse,
  InvitePrefill,
  InviteRequirements,
  RefreshStatusRequest,
  RefreshStatusResponse,
  SessionsResponse,
  SyncAirtableRequest,
  SyncAirtableResponse,
} from "./types";

const VERSION = "v0-mvp";
const CANONICAL = {
  ping: "/ping",
  health: "/v1/immigrate/health",
  lineWebhook: "/webhooks/line",
  linePreview: "/v1/immigrate/line/preview",
  lineIntake: "/v1/immigrate/line/intake",
  createJob: "/v1/admin/create-job",
  list: "/v1/immigrate/line-inbox",
  refresh: "/v1/immigrate/line-inbox/refresh-status",
  sync: "/v1/immigrate/line-inbox/sync-airtable",
  intake: "/v1/immigration/intake",
  promote: "/v1/immigration/promote",
  links: "/v1/immigration/links",
} as const;

const CONTROL_ROOM = {
  adminRoot: "/internal/admin",
  login: "/internal/admin/login",
  loginSession: "/internal/admin/login/session",
  verifyAccessCode: "/internal/admin/verify-access-code",
  root: "/internal/admin/control-room",
  health: "/internal/admin/control-room/health",
  list: "/internal/admin/control-room/line-inbox",
  refresh: "/internal/admin/control-room/refresh-status",
  sync: "/internal/admin/control-room/sync-airtable",
  logs: "/internal/admin/control-room/logs",
  sessions: "/internal/admin/control-room/sessions/live",
  sessionRefresh: "/internal/admin/control-room/sessions/refresh",
} as const;

const SIGIL = {
  root: "/sigil",
  adminRoot: "/sigil/admin",
  login: "/sigil/admin/login",
  loginSession: "/sigil/admin/login/session",
  verifyAccessCode: "/sigil/admin/verify-access-code",
  controlRoom: "/sigil/admin/control-room",
  controlRoomHealth: "/sigil/admin/control-room/health",
  controlRoomList: "/sigil/admin/control-room/line-inbox",
  controlRoomRefresh: "/sigil/admin/control-room/refresh-status",
  controlRoomSync: "/sigil/admin/control-room/sync-airtable",
  controlRoomLogs: "/sigil/admin/control-room/logs",
  controlRoomSessions: "/sigil/admin/control-room/sessions/live",
  controlRoomSessionRefresh: "/sigil/admin/control-room/sessions/refresh",
  booking: "/sigil/booking",
  apply: "/sigil/apply",
  applyStatus: "/sigil/apply/status",
  // Apply status/received means "received and waiting for Per to read privately".
  // It is not an approved state; approval/official consideration must stay separate.
  modelApply: "/sigil/model/apply",
  modelApplyPrivate: "/sigil/model/apply/private-model",
  modelApplyPrivateReceived: "/sigil/model/apply/private-model/received",
  createSession: "/sigil/admin/jobs/create-session",
  createJob: "/sigil/admin/jobs/create-job",
  modelPromoteImmigration: "/sigil/admin/models/promote-immigration",
  privateModelReplayAirtable: "/sigil/admin/private-model/replay-airtable",
  privateModelAirtableCheck: "/sigil/admin/private-model/airtable-check",
  inviteResolve: "/sigil/api/invite/resolve",
  renewalStatus: "/sigil/api/renewal/status",
  renewalIntake: "/sigil/api/renewal/intake",
  pointsTopup: "/sigil/api/points/topup",
  renewalActivateVip: "/sigil/api/renewal/activate-vip",
  recoveryAck: "/sigil/api/recovery/ack",
  recoveryComplaintEvidence: "/sigil/api/recovery/complaint-evidence",
  customerConfirm: "/sigil/api/jobs/customer-confirm",
  clientResolve: "/sigil/api/client/resolve",
  modelSearch: "/sigil/api/models/search",
  privateModelApply: "/sigil/api/private-model/apply",
  privateModelUploadUrl: "/sigil/api/private-model/upload-url",
  privateModelUploadFile: "/sigil/api/private-model/upload-file",
  publicModelApply: "/sigil/api/public-model/apply",
  publicModelUploadUrl: "/sigil/api/public-model/upload-url",
  publicModelUploadFile: "/sigil/api/public-model/upload-file",
  sendLineSessionCard: "/sigil/admin/jobs/send-line-session-card",
} as const;

const PUBLIC_LEGAL_ORIGIN_PATHS = new Set([
  "/terms",
  "/terms/",
  "/legal/terms",
  "/legal/terms/",
]);

const PUBLIC_LEGAL_CANONICAL_PATHS = new Map([
  ["/terms", "/terms"],
  ["/terms/", "/terms"],
  ["/legal/terms", "/legal/terms"],
  ["/legal/terms/", "/legal/terms"],
]);

const PUBLIC_LEGAL_CANONICAL_HOST = "mmdbkk.com";
const SIGIL_PUBLIC_HOST = "sigil.mmdbkk.com";

function isPublicLegalOriginRoute(request: Request, url: URL): boolean {
  return (request.method === "GET" || request.method === "HEAD") && PUBLIC_LEGAL_ORIGIN_PATHS.has(url.pathname);
}

function publicLegalCanonicalRedirect(request: Request, url: URL): Response | null {
  if (!isPublicLegalOriginRoute(request, url)) return null;
  if (url.hostname.toLowerCase() !== SIGIL_PUBLIC_HOST) return null;

  const canonicalUrl = new URL(url.toString());
  canonicalUrl.protocol = "https:";
  canonicalUrl.hostname = PUBLIC_LEGAL_CANONICAL_HOST;
  canonicalUrl.port = "";
  canonicalUrl.pathname = PUBLIC_LEGAL_CANONICAL_PATHS.get(url.pathname) || url.pathname;
  return redirect(canonicalUrl.toString(), 302, { "cache-control": "no-store" });
}

const LEGACY_ADMIN_LOGIN_PATHS = new Set([
  CONTROL_ROOM.login,
  "/admin/login",
]);

const SIGIL_ADMIN_CANONICAL_HOST = "sigil.mmdbkk.com";
const SIGIL_ADMIN_LEGACY_HOSTS = new Set(["mmdbkk.com", "www.mmdbkk.com"]);

function canonicalSigilAdminRedirect(url: URL): Response | null {
  if (!url.pathname.startsWith(SIGIL.adminRoot)) return null;
  if (!SIGIL_ADMIN_LEGACY_HOSTS.has(url.hostname.toLowerCase())) return null;

  const canonicalUrl = new URL(url.toString());
  canonicalUrl.protocol = "https:";
  canonicalUrl.hostname = SIGIL_ADMIN_CANONICAL_HOST;
  canonicalUrl.port = "";
  return redirect(canonicalUrl.toString(), 302);
}

function watchUnexpectedSigilGatewayHit(request: Request, url: URL): void {
  if (url.hostname.toLowerCase() !== SIGIL_ADMIN_CANONICAL_HOST) return;
  if (!url.pathname.startsWith("/sigil/")) return;

  console.warn("sigil_gateway_unexpected_hit", {
    worker: "immigrate-worker",
    host: url.hostname,
    path: url.pathname,
    method: request.method,
    ray: request.headers.get("cf-ray") || "",
    userAgent: request.headers.get("user-agent") || "",
    at: new Date().toISOString(),
  });
}

function canonicalAdminLoginAliasRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (!LEGACY_ADMIN_LOGIN_PATHS.has(url.pathname)) return null;

  // /sigil/admin/login is the canonical internal admin login.
  const canonicalUrl = new URL(SIGIL.login, url.origin);
  const next = url.searchParams.get("next");
  if (next) canonicalUrl.searchParams.set("next", next);
  return redirect(canonicalUrl.toString(), 302);
}

const ADMIN_JOBS = {
  createSession: "/internal/admin/create-session",
  createSessionLegacy: "/internal/admin/jobs/create-session",
} as const;

const JOBS = {
  root: "/internal/jobs",
  createJob: "/internal/jobs/create-job",
  modelHistoryBatch: "/internal/jobs/model-history-batch",
  modelHistoryImport: "/internal/jobs/model-history-import",
  privateProfileImport: "/internal/jobs/private-profile-import",
  bookingImport: "/internal/jobs/booking-import",
  importAll: "/internal/jobs/import-all",
  importLogs: "/internal/jobs/import-logs",
  createLinks: "/internal/jobs/create-links",
  createInvite: "/internal/jobs/create-invite-link",
  customerConfirm: "/internal/jobs/customer-confirm",
} as const;

const PUBLIC = {
  onboardingResolve: "/member/api/invite/resolve",
  renewalStatus: "/member/api/renewal/status",
  renewalIntake: "/member/api/renewal/intake",
  pointsTopup: "/member/api/points/topup",
  renewalActivateVip: "/member/api/renewal/activate-vip",
  recoveryComplaintEvidence: "/member/api/recovery/complaint-evidence",
  bookingRequest: "/v1/public/booking-request",
  customerConfirm: "/member/api/jobs/customer-confirm",
  privateModelApply: "/v1/private-model/apply",
  privateModelUploadUrl: "/v1/private-model/upload-url",
  privateModelUploadFile: "/v1/private-model/upload-file",
  publicModelApply: "/v1/public-model/apply",
  publicModelUploadUrl: "/v1/public-model/upload-url",
  publicModelUploadFile: "/v1/public-model/upload-file",
} as const;

const ADMIN_GATE_SESSION_KEY = "mmd_admin_gate_v1";
const ADMIN_GATE_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_GATE_DEFAULT_NEXT = CONTROL_ROOM.root;
const SIGIL_ADMIN_LOGIN_BUILD = "SIGIL_ADMIN_LOGIN_V3_20260602_WORKER_SOURCE";
const ADMIN_GATE_ALLOWED_BASE_URLS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://admin-worker.malemodel-bkk.workers.dev",
  "https://immigrate-worker.malemodel-bkk.workers.dev",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);

type AdminGateSession = {
  ok: true;
  at: number;
  baseUrl: string;
  bearer?: string;
  confirmKey?: string;
};

function readSeedRecords(): MigrationRecord[] {
  return seedLineInboxRecords.map((record) => ({ ...record, flags: [...record.flags] }));
}

function applyFilters(records: MigrationRecord[], url: URL): MigrationRecord[] {
  const status = url.searchParams.get("status");
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();
  let filtered = records;

  if (status) {
    filtered = filtered.filter((record) => record.migration_status === status);
  }

  if (search) {
    filtered = filtered.filter((record) => {
      return [
        record.migration_id,
        record.raw_text,
        record.parsed_name || "",
        record.parsed_location || "",
        record.parsed_intent || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }

  return filtered;
}

function refreshRecord(record: MigrationRecord): MigrationRecord {
  const refreshedFlags = [...record.flags];
  if (!record.parsed_name && !refreshedFlags.includes("missing_name")) refreshedFlags.push("missing_name");
  if (!record.parsed_budget_thb && !refreshedFlags.includes("missing_budget")) refreshedFlags.push("missing_budget");
  if (!record.parsed_date && !refreshedFlags.includes("missing_date")) refreshedFlags.push("missing_date");

  let nextStatus = record.migration_status;
  if (record.parsed_name && record.parsed_intent === "booking") {
    nextStatus = record.parsed_budget_thb ? "ready_to_sync" : "needs_review";
  } else if (record.parsed_intent) {
    nextStatus = "parsed";
  }

  return {
    ...record,
    confidence_score: Math.min(0.99, Number((record.confidence_score + 0.03).toFixed(2))),
    flags: Array.from(new Set(refreshedFlags)),
    migration_status: nextStatus,
  };
}

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown): number | null {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function requiredString(value: unknown, field: string): string {
  const s = toStr(value);
  if (!s) throw new Error(`missing_${field}`);
  return s;
}

function makeInviteId(): string {
  return `invite_${crypto.randomUUID().slice(0, 8)}_${Date.now().toString(36)}`;
}

function makeImmigrationId(): string {
  return `img_${crypto.randomUUID().slice(0, 8)}_${Date.now().toString(36)}`;
}

function parseSourceChannel(value: unknown): ImmigrationSourceChannel {
  const raw = toStr(value).toLowerCase();
  if (
    raw === "renewal" ||
    raw === "signup" ||
    raw === "upgrade" ||
    raw === "import" ||
    raw === "operator"
  ) {
    return raw;
  }
  return "line";
}

function parseImmigrationIntent(value: unknown): ImmigrationIntent {
  const raw = toStr(value).toLowerCase();
  if (
    raw === "renewal" ||
    raw === "signup" ||
    raw === "upgrade" ||
    raw === "contact_import" ||
    raw === "service_history_import"
  ) {
    return raw;
  }
  return "general";
}

function buildServiceHistorySummary(
  notes: { manual_note_raw: string; operator_summary?: string },
  identity?: { full_name?: string },
): string {
  const summaryParts = [
    identity?.full_name ? `Client: ${identity.full_name}` : "",
    notes.operator_summary ? `Operator summary: ${notes.operator_summary}` : "",
    notes.manual_note_raw ? `Manual notes: ${notes.manual_note_raw}` : "",
  ].filter(Boolean);

  return summaryParts.join(" | ").slice(0, 1000);
}

function buildPromotionRecord(
  payload: ImmigrationIntakeRequest | ImmigrationPromoteRequest,
  overrides?: Partial<ImmigrationPromotionRecord>,
): ImmigrationPromotionRecord {
  const archivedAt = new Date().toISOString();
  return {
    immigration_id: toStr(payload.immigration_id) || makeImmigrationId(),
    source_channel: parseSourceChannel(payload.source_channel),
    intent: parseImmigrationIntent(payload.intent),
    identity: {
      member_id: toStr(payload.identity?.member_id) || undefined,
      line_id: toStr(payload.identity?.line_id) || undefined,
      line_user_id: toStr(payload.identity?.line_user_id) || undefined,
      full_name: toStr(payload.identity?.full_name) || undefined,
      phone: toStr(payload.identity?.phone) || undefined,
    },
    membership: payload.membership
      ? {
          current_tier: toStr(payload.membership.current_tier) || undefined,
          target_tier: toStr(payload.membership.target_tier) || undefined,
        }
      : undefined,
    notes: {
      manual_note_raw: toStr(payload.notes.manual_note_raw),
      operator_summary: toStr(payload.notes.operator_summary) || undefined,
    },
    payload_json: payload.payload_json,
    service_history_summary: buildServiceHistorySummary(payload.notes, payload.identity),
    promotion_status: "archived_raw",
    archived_at: archivedAt,
    ...overrides,
  };
}

function promoteRecord(record: ImmigrationPromotionRecord): ImmigrationPromotionRecord {
  const existingMemberId = toStr(record.identity.member_id);
  const derivedMemberId =
    existingMemberId ||
    `mem_${(record.identity.line_user_id || record.identity.line_id || record.immigration_id).replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 32)}`;

  return {
    ...record,
    promoted_member_id: derivedMemberId,
    created_new_member: !existingMemberId,
    promotion_status: derivedMemberId ? "promoted" : "needs_manual_review",
    promoted_at: new Date().toISOString(),
  };
}

function isIntakeRoute(pathname: string): boolean {
  return pathname === CANONICAL.intake;
}

function isLinePreviewRoute(pathname: string): boolean {
  return pathname === CANONICAL.linePreview;
}

function isLineIntakeRoute(pathname: string): boolean {
  return pathname === CANONICAL.lineIntake;
}

function isLineWebhookRoute(pathname: string): boolean {
  return pathname === CANONICAL.lineWebhook;
}

function isCreateJobRoute(pathname: string): boolean {
  return pathname === CANONICAL.createJob;
}

function isPromoteRoute(pathname: string): boolean {
  return pathname === CANONICAL.promote;
}

function isLinksRoute(pathname: string): boolean {
  return pathname === CANONICAL.links;
}

function getImmigrationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/v1\/immigration\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

type InvitePayload = {
  username?: string;
  nickname?: string;
  suffix_code?: string;
  mmd_client_name?: string;
  client_name?: string;
  folder_name?: string;
  line_user_id?: string;
  telegram_username?: string;
  customer_telegram_username?: string;
  memberstack_id?: string;
  email?: string;
  gmail?: string;
  invite_page?: string;
  expires_in_hours?: number;
  invite_role?: InviteRole;
  invite_lane?: InviteLane;
  model_name?: string;
  model_record_id?: string;
  rules_url?: string;
  console_url?: string;
  requires_rules_ack?: boolean;
  requires_model_binding?: boolean;
  session_id?: string;
  payment_ref?: string;
  job_type?: string;
  job_date?: string;
  start_time?: string;
  end_time?: string;
  location_name?: string;
  google_map_url?: string;
  amount_thb?: number | string;
  amount?: number | string;
  payment_type?: string;
  payment_stage?: string;
  payment_method?: string;
  note?: string;
  notes?: string;
  confirm_page?: string;
  model_confirm_page?: string;
};

function toInviteIdentityPayload(payload: InvitePayload) {
  return {
    username: payload.username,
    nickname: payload.nickname,
    suffix_code: payload.suffix_code,
    mmd_client_name: payload.mmd_client_name,
    client_name: payload.client_name,
    folder_name: payload.folder_name || payload.model_name,
    line_user_id: payload.line_user_id,
    telegram_username: payload.telegram_username || payload.customer_telegram_username,
    memberstack_id: payload.memberstack_id,
    email: payload.email,
    gmail: payload.gmail,
  };
}

function parseInviteRole(value: unknown): InviteRole {
  return String(value || "").trim().toLowerCase() === "model" ? "model" : "customer";
}

function parseInviteLane(value: unknown, role: InviteRole): InviteLane {
  const lane = String(value || "").trim().toLowerCase();
  if (lane === "model_console") return "model_console";
  if (lane === "customer_onboarding") return "customer_onboarding";
  return role === "model" ? "model_console" : "customer_onboarding";
}

function boolFromUnknown(value: unknown, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(raw)) return true;
  if (["0", "false", "no", "n"].includes(raw)) return false;
  return fallback;
}

function hasCreateLinksUpstream(env: Env): boolean {
  return Boolean(toStr(env.CREATE_LINKS_URL) || toStr(env.JOBS_WORKER_BASE_URL));
}

function isPaymentsConfirmLinkMode(env: Env): boolean {
  return Boolean(toStr(env.CREATE_LINKS_URL)) && !toStr(env.JOBS_WORKER_BASE_URL);
}

function buildDefaultBookingNote(payload: InvitePayload): string {
  return [
    toStr(payload.job_type) || "job",
    toStr(payload.job_date),
    toStr(payload.start_time) && toStr(payload.end_time)
      ? `${toStr(payload.start_time)}-${toStr(payload.end_time)}`
      : "",
    toStr(payload.location_name),
  ]
    .filter(Boolean)
    .join(" | ");
}

function normalizeCreateLinksPayload(
  payload: InvitePayload,
  env: Env,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...payload };

  if (!isPaymentsConfirmLinkMode(env)) {
    return normalized;
  }

  const requiredFields = [
    "client_name",
    "model_name",
    "job_type",
    "job_date",
    "start_time",
    "end_time",
    "location_name",
  ] as const;

  for (const field of requiredFields) {
    requiredString(payload[field], field);
    normalized[field] = toStr(payload[field]);
  }

  const amountThb = toNum(payload.amount_thb ?? payload.amount);
  if (!amountThb || amountThb <= 0) {
    throw new Error("missing_amount_thb");
  }

  normalized.amount_thb = amountThb;
  normalized.payment_type = toStr(payload.payment_type || payload.payment_stage || "deposit");
  normalized.payment_method = toStr(payload.payment_method || "promptpay");
  normalized.confirm_page = toStr(payload.confirm_page || "/pay");
  normalized.model_confirm_page = toStr(payload.model_confirm_page || "/model/console");
  normalized.google_map_url = toStr(payload.google_map_url);
  normalized.note = toStr(payload.note || payload.notes) || buildDefaultBookingNote(payload);

  return normalized;
}

function buildExperienceContract(role: InviteRole, lane: InviteLane): ExperienceContract {
  if (role === "model" || lane === "model_console") {
    return {
      assistant_core: "KENJI",
      route_guide: "HIMA",
      access_type: "invitation_only",
      lane: "model",
      layer: "model_recruitment_gate",
    };
  }

  return {
    assistant_core: "KENJI",
    route_guide: "HITO",
    access_type: "invitation_only",
    lane: "client",
    layer: "trust_inme_underground",
  };
}

function getPublicAllowedOrigins(env: Env): string[] {
  return String(
    env.PUBLIC_ALLOWED_ORIGINS ||
      "https://mmdbkk.com,https://www.mmdbkk.com,https://mmdprive.com,https://www.mmdprive.com,https://mmdprive.webflow.io",
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin") || "";
  const allowed = getPublicAllowedOrigins(env);
  const requestOrigin = new URL(request.url).origin;

  if (origin && (origin === requestOrigin || allowed.includes(origin))) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "origin");
  }

  headers.set("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization, x-internal-token, x-request-id, x-line-signature");
  headers.set("access-control-max-age", "86400");
  return headers;
}

function withCors(request: Request, env: Env, response: Response): Response {
  const headers = new Headers(response.headers);
  const cors = buildCorsHeaders(request, env);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

async function forwardModelSessionToAdminWorker(request: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(request.url);
  const targetPath = `${requestUrl.pathname}${requestUrl.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  };

  if (env.ADMIN_WORKER) {
    return env.ADMIN_WORKER.fetch(new Request(`https://admin-worker.internal${targetPath}`, init));
  }

  const base = toStr(env.ADMIN_WORKER_BASE_URL).replace(/\/+$/, "");
  if (!base) {
    return json({ ok: false, error: "admin_worker_not_configured" }, { status: 503 });
  }

  return fetch(`${base}${targetPath}`, init);
}

function isModelSessionAdminPath(pathname: string): boolean {
  return pathname === MODEL_SESSION_DASHBOARD_PATH ||
    pathname === MODEL_SESSION_STATUS_PATH ||
    pathname === "/v1/model/session/gps" ||
    pathname === "/v1/model/session/update" ||
    pathname === "/v1/model/session/emergency";
}

function publicJson(request: Request, env: Env, data: unknown, init?: ResponseInit): Response {
  return withCors(request, env, json(data, init));
}

type BookingAccessScope = "none" | "member" | "private";
type BookingMemberStatus = "active" | "expired" | "migration_pending" | "membership_required" | "unknown";
type BookingLookupStatus = "member_found" | "legacy_line_found" | "not_found" | "client_found";
type BookingNextAction =
  | "continue_booking"
  | "renew_membership"
  | "complete_membership_signup"
  | "signup_or_login"
  | "private_access_review";

type BookingClientResolveInput = {
  t?: string;
  memberstack_id?: string;
  line_user_id?: string;
  line_note?: string;
  client_name?: string;
  client_contact?: string;
  booking_ref?: string;
  intent?: string;
};

type BookingClientAccess = {
  ok: true;
  client_lookup_status: BookingLookupStatus;
  member_status: BookingMemberStatus;
  membership_tier: string | null;
  access_scope: BookingAccessScope;
  can_search_public_models: boolean;
  can_search_private_models: boolean;
  next_required_action: BookingNextAction;
  client_id?: string;
};

const BOOKING_ALLOWED_ORIGIN_HOSTS = new Set(["sigil.mmdbkk.com", "mmdbkk.com", "www.mmdbkk.com"]);
const BOOKING_MEMBER_REQUIRED_REDIRECT = "/sigil/inme?mode=signup&next=/sigil/booking";
const BOOKING_RENEWAL_REDIRECT = "/sigil/pay/renewal?next=/sigil/booking";
const BOOKING_MIGRATION_REDIRECT = "/sigil/inme?mode=immigrate&next=/sigil/booking";
const BOOKING_PRIVATE_ACCESS_REDIRECT = "/sigil/inme?mode=private_access&next=/sigil/booking";

function bookingCorsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin") || "";
  if (origin) {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      if (BOOKING_ALLOWED_ORIGIN_HOSTS.has(host)) {
        headers.set("access-control-allow-origin", origin);
        headers.set("vary", "origin");
      }
    } catch {
      // Ignore malformed Origin headers.
    }
  }
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type, x-request-id");
  headers.set("access-control-max-age", "86400");
  return headers;
}

function withBookingCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  bookingCorsHeaders(request).forEach((value, key) => headers.set(key, value));
  headers.set("cache-control", "no-store");
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

function bookingJson(request: Request, data: unknown, init?: ResponseInit): Response {
  return withBookingCors(request, json(data, init));
}

function isSigilBookingApiRoute(pathname: string): boolean {
  return pathname === SIGIL.clientResolve || pathname === SIGIL.modelSearch;
}

function fieldString(fields: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
  }
  return "";
}

function fieldBool(fields: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = fields[key];
    if (typeof value === "boolean") return value;
    const text = toStr(value).toLowerCase();
    return ["true", "yes", "y", "approved", "active", "vip", "private"].includes(text);
  });
}

function fieldNumber(fields: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = Number(fields[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeMembershipTier(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/[_-]+/g, " ");
  if (lower.includes("black")) return "Black Card";
  if (lower.includes("vip") || lower.includes("svip")) return "VIP";
  if (lower.includes("premium")) return "Premium";
  if (lower.includes("standard") || lower.includes("member")) return "Standard";
  return raw;
}

function isExpiredDate(value: string): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
}

function inferMemberStatus(fields: Record<string, unknown>, hasMemberstack: boolean, matchedField: string): BookingMemberStatus {
  const raw = fieldString(fields, [
    "member_status",
    "membership_status",
    "Membership Status",
    "client_status",
    "Status",
    "verification_status",
  ]).toLowerCase();
  const expiry = fieldString(fields, [
    "membership_expire_at",
    "membership_expiry",
    "expire_at",
    "expires_at",
    "Expiry",
    "Expiration Date",
  ]);

  if (raw.includes("expired") || isExpiredDate(expiry)) return "expired";
  if (raw.includes("migration") || raw.includes("immigration") || raw.includes("pending_link")) return "migration_pending";
  if (raw.includes("active") || raw.includes("approved") || raw.includes("paid")) return "active";
  if (hasMemberstack) return "active";
  if (matchedField.toLowerCase().includes("line")) return "migration_pending";
  return "membership_required";
}

function hasPrivateBookingAccess(fields: Record<string, unknown>, membershipTier: string | null): boolean {
  if (membershipTier === "VIP" || membershipTier === "Black Card") return true;
  return fieldBool(fields, [
    "private_access",
    "private_access_approved",
    "private_access_active",
    "Private Access",
    "VIP Approved",
    "approved_private_status",
  ]);
}

function bookingActionForStatus(status: BookingMemberStatus, privateAccess: boolean): BookingNextAction {
  if (status === "active") return privateAccess ? "continue_booking" : "continue_booking";
  if (status === "expired") return "renew_membership";
  if (status === "migration_pending") return "complete_membership_signup";
  if (status === "membership_required") return "signup_or_login";
  return "signup_or_login";
}

async function resolveInviteIdentityForBooking(env: Env, input: BookingClientResolveInput): Promise<BookingClientResolveInput> {
  const token = toStr(input.t);
  if (!token) return input;
  const secret = toStr(env.CONFIRM_KEY) || toStr(env.INTERNAL_TOKEN);
  if (!secret) return input;

  try {
    const payload = await verifyInviteToken(token, secret);
    return {
      ...input,
      memberstack_id: toStr(input.memberstack_id) || toStr(payload.memberstack_id),
      line_user_id: toStr(input.line_user_id) || toStr(payload.line_user_id),
      client_name: toStr(input.client_name) || toStr(payload.mmd_client_name || payload.nickname),
      client_contact: toStr(input.client_contact) || toStr(payload.email),
    };
  } catch {
    return input;
  }
}

async function resolveBookingClientAccess(env: Env, input: BookingClientResolveInput): Promise<BookingClientAccess> {
  const enriched = await resolveInviteIdentityForBooking(env, input);
  const lookup = await findBookingClient(env, enriched);

  if (!lookup) {
    return {
      ok: true,
      client_lookup_status: "not_found",
      member_status: "membership_required",
      membership_tier: null,
      access_scope: "none",
      can_search_public_models: false,
      can_search_private_models: false,
      next_required_action: "signup_or_login",
    };
  }

  const fields = lookup.fields as Record<string, unknown>;
  const memberstackId = toStr(enriched.memberstack_id) || fieldString(fields, ["memberstack_id", "Memberstack ID"]);
  const membershipTier = normalizeMembershipTier(fieldString(fields, [
    "membership_tier",
    "current_tier",
    "tier",
    "Membership Tier",
    "vip_level",
  ]));
  const memberStatus = inferMemberStatus(fields, Boolean(memberstackId), lookup.matched_field);
  const privateAccess = memberStatus === "active" && hasPrivateBookingAccess(fields, membershipTier);
  const activeMember = memberStatus === "active";
  const lookupStatus: BookingLookupStatus = memberstackId
    ? "member_found"
    : lookup.matched_field.toLowerCase().includes("line")
      ? "legacy_line_found"
      : "client_found";

  return {
    ok: true,
    client_lookup_status: lookupStatus,
    member_status: memberStatus,
    membership_tier: membershipTier,
    access_scope: privateAccess ? "private" : activeMember ? "member" : "none",
    can_search_public_models: activeMember,
    can_search_private_models: privateAccess,
    next_required_action: bookingActionForStatus(memberStatus, privateAccess),
    client_id: lookup.record_id,
  };
}

async function readBookingResolveBody(request: Request): Promise<BookingClientResolveInput | null> {
  const body = (await request.json().catch(() => null)) as BookingClientResolveInput | null;
  if (!body || typeof body !== "object") return null;
  return {
    t: toStr(body.t),
    memberstack_id: toStr(body.memberstack_id),
    line_user_id: toStr(body.line_user_id),
    line_note: toStr(body.line_note),
    client_name: toStr(body.client_name),
    client_contact: toStr(body.client_contact),
    booking_ref: toStr(body.booking_ref),
    intent: toStr(body.intent),
  };
}

async function handleSigilClientResolve(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return withBookingCors(request, new Response(null, { status: 204 }));
  }
  if (request.method !== "POST") {
    return bookingJson(request, { ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { allow: "POST, OPTIONS" } });
  }

  const body = await readBookingResolveBody(request);
  if (!body) {
    return bookingJson(request, { ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }

  return bookingJson(request, await resolveBookingClientAccess(env, body));
}

function bookingLockedResponse(request: Request, error: "MEMBER_REQUIRED" | "PRIVATE_ACCESS_REQUIRED", action: BookingNextAction, redirectUrl: string): Response {
  return bookingJson(
    request,
    {
      ok: false,
      matched: false,
      error,
      next_required_action: action,
      redirect_url: redirectUrl,
    },
    { status: 403 },
  );
}

function isModelBookable(fields: Record<string, unknown>, scope: string): boolean {
  const status = fieldString(fields, ["status", "Status", "model_status"]).toLowerCase();
  const visibility = fieldString(fields, ["booking_visibility", "Booking Visibility", "visibility"]).toLowerCase();
  if (status && !["active", "bookable", "available"].some((word) => status.includes(word))) return false;
  if (fieldBool(fields, ["inactive", "archived", "hidden"])) return false;
  if (scope === "public" && visibility.includes("private")) return false;
  if (visibility && ["hidden", "internal", "admin"].some((word) => visibility.includes(word))) return false;
  return true;
}

function modelCoverUrl(env: Env, fields: Record<string, unknown>): { cover_url: string; asset_status: string; source: string } {
  const direct = fieldString(fields, ["r2_cover_url", "cover_url", "Cover URL"]);
  if (direct.startsWith("https://")) return { cover_url: direct, asset_status: "r2_found", source: "airtable+r2" };

  const prefix = fieldString(fields, ["r2_prefix", "R2 Prefix", "model_asset_prefix"]);
  const publicBase = toStr(env.R2_PUBLIC_BASE_URL).replace(/\/+$/, "");
  if (prefix && publicBase) {
    return {
      cover_url: `${publicBase}/${prefix.replace(/^\/+|\/+$/g, "")}/cover.webp`,
      asset_status: "r2_found",
      source: "airtable+r2",
    };
  }

  const driveHint = fieldString(fields, ["drive_folder_id", "google_drive_folder", "Drive Folder"]);
  return {
    cover_url: "",
    asset_status: driveHint ? "drive_pending_sync" : "missing_asset",
    source: driveHint ? "airtable+drive_index" : "airtable",
  };
}

function publicSafeModel(env: Env, record: { record_id: string; fields: Record<string, unknown> }) {
  const fields = record.fields;
  const assets = modelCoverUrl(env, fields);
  return {
    model_id: fieldString(fields, ["model_id", "Model ID"]) || record.record_id,
    display_name: fieldString(fields, ["display_name", "Display Name", "nickname", "Nickname"]) || "Model",
    status: fieldString(fields, ["status", "Status", "model_status"]) || "active",
    cover_url: assets.cover_url,
    gallery_count: fieldNumber(fields, ["gallery_count", "Gallery Count", "r2_gallery_count"]),
    asset_status: assets.asset_status,
    source: assets.source,
    public_safe: true,
  };
}

async function handleSigilModelSearch(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return withBookingCors(request, new Response(null, { status: 204 }));
  }
  if (request.method !== "GET") {
    return bookingJson(request, { ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { allow: "GET, OPTIONS" } });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "private" ? "private" : "public";
  const access = await resolveBookingClientAccess(env, {
    t: url.searchParams.get("t") || "",
    memberstack_id: url.searchParams.get("memberstack_id") || "",
    line_user_id: url.searchParams.get("line_user_id") || "",
    client_name: url.searchParams.get("client_name") || "",
    client_contact: url.searchParams.get("client_contact") || "",
    booking_ref: url.searchParams.get("booking_ref") || "",
  });

  if (!access.can_search_public_models) {
    const redirectUrl = access.member_status === "expired"
      ? BOOKING_RENEWAL_REDIRECT
      : access.member_status === "migration_pending"
        ? BOOKING_MIGRATION_REDIRECT
        : BOOKING_MEMBER_REQUIRED_REDIRECT;
    return bookingLockedResponse(request, "MEMBER_REQUIRED", access.next_required_action, redirectUrl);
  }

  if (scope === "private" && !access.can_search_private_models) {
    return bookingLockedResponse(request, "PRIVATE_ACCESS_REQUIRED", "private_access_review", BOOKING_PRIVATE_ACCESS_REDIRECT);
  }

  const query = url.searchParams.get("q") || "";
  const match = await searchBookingModel(env, query);
  if (!match || !isModelBookable(match.fields as Record<string, unknown>, scope)) {
    return bookingJson(request, { ok: true, matched: false });
  }

  return bookingJson(request, {
    ok: true,
    matched: true,
    model: publicSafeModel(env, {
      record_id: match.record_id,
      fields: match.fields as Record<string, unknown>,
    }),
  });
}

type PublicRenewalStatusRequest = {
  email?: string;
  email_primary?: string;
  email_secondary?: string;
  nickname?: string;
  display_name?: string;
  line_user_id?: string;
  line_display_name?: string;
  memberstack_id?: string;
  include_context?: boolean;
  source_page?: string;
  search_priority?: string;
};

type PublicBookingRequestBody = Record<string, unknown> & {
  brief?: string;
  booking_lane?: string;
  request_mode?: string;
  job_type?: string;
  package_tier?: string;
  duration_hours?: string | number;
  booking_date?: string;
  start_time?: string;
  area?: string;
  client_name?: string;
  contact?: string;
  t?: string;
  code?: string;
  promo?: string;
  session_id?: string;
  booking_id?: string;
  booking_ref?: string;
  payment_ref?: string;
};

const PUBLIC_BOOKING_REQUIRED_FIELDS = [
  "brief",
  "booking_lane",
  "request_mode",
  "job_type",
  "package_tier",
  "duration_hours",
  "booking_date",
  "start_time",
  "area",
  "client_name",
  "contact",
] as const;

function makeBookingRequestId(): string {
  return `bkreq_${crypto.randomUUID().slice(0, 8)}_${Date.now().toString(36)}`;
}

function sanitizePublicBookingPayload(body: PublicBookingRequestBody): Record<string, unknown> {
  const safeKeys = [
    "source",
    "mode",
    "build_marker",
    "t",
    "code",
    "promo",
    "session_id",
    "booking_id",
    "booking_ref",
    "payment_ref",
    "request_mode",
    "booking_lane",
    "request_type",
    "matching_mode",
    "request_status",
    "model_acceptance_status",
    "admin_approval_status",
    "needs_availability_check",
    "needs_model_matching",
    "needs_model_acceptance",
    "needs_admin_approval",
    "requires_operator_review",
    "brief",
    "client_tier",
    "telegram_ready",
    "selected_model_id",
    "selected_model_name",
    "model_lookup_key",
    "model_current_status",
    "backup_model_name",
    "job_type",
    "package_tier",
    "duration_hours",
    "budget",
    "booking_date",
    "start_time",
    "end_time",
    "area",
    "location_name",
    "preferred_vibe",
    "language_preference",
    "style_preference",
    "client_name",
    "contact",
    "note",
    "page_path",
    "created_from_url",
    "created_at_client",
  ];

  const out: Record<string, unknown> = {};
  for (const key of safeKeys) {
    const value = body[key];
    if (value !== undefined && value !== null && value !== "") {
      out[key] = typeof value === "string" ? value.slice(0, 5000) : value;
    }
  }
  return out;
}

function bookingRequestRawText(payload: Record<string, unknown>): string {
  return [
    "Booking request",
    `client=${toStr(payload.client_name)}`,
    `contact=${toStr(payload.contact)}`,
    `lane=${toStr(payload.booking_lane)}`,
    `mode=${toStr(payload.request_mode)}`,
    `job_type=${toStr(payload.job_type)}`,
    `package=${toStr(payload.package_tier)}`,
    `duration=${toStr(payload.duration_hours)}`,
    `date=${toStr(payload.booking_date)}`,
    `start=${toStr(payload.start_time)}`,
    `area=${toStr(payload.area)}`,
    `budget=${toStr(payload.budget)}`,
    `model=${toStr(payload.selected_model_name || payload.selected_model_id || payload.model_lookup_key)}`,
    `brief=${toStr(payload.brief)}`,
    `note=${toStr(payload.note)}`,
  ]
    .filter((part) => !part.endsWith("="))
    .join(" | ");
}

async function handlePublicBookingRequest(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const body = (await request.json().catch(() => null)) as PublicBookingRequestBody | null;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: { code: "INVALID_JSON", message: "valid JSON body is required" },
        meta,
      },
      { status: 400 },
    );
  }

  const missing = PUBLIC_BOOKING_REQUIRED_FIELDS.filter((field) => !toStr(body[field]));
  if (missing.length) {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: `Missing required fields: ${missing.join(", ")}`,
          details: { missing },
        },
        meta,
      },
      { status: 400 },
    );
  }

  const duration = toNum(body.duration_hours);
  if (duration === null || duration <= 0) {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "duration_hours must be a positive number",
          details: { field: "duration_hours" },
        },
        meta,
      },
      { status: 400 },
    );
  }

  const requestId = makeBookingRequestId();
  const now = new Date().toISOString();
  const safePayload = sanitizePublicBookingPayload(body);
  safePayload.request_id = requestId;
  safePayload.booking_id = toStr(body.booking_id) || requestId;
  safePayload.booking_ref = toStr(body.booking_ref) || requestId;
  safePayload.received_at = now;
  const nextUrl = bookingRequestNextUrl(request, {
    booking_id: requestId,
    booking_ref: requestId,
    t: toStr(body.t),
    code: toStr(body.code),
    promo: toStr(body.promo),
    session_id: toStr(body.session_id),
    payment_ref: toStr(body.payment_ref),
  });

  const record: MigrationRecord = {
    migration_id: requestId,
    source_channel: "line",
    source_user_id: toStr(body.contact) || requestId,
    source_message_id: `sigil_booking_${Date.now().toString(36)}`,
    received_at: now,
    raw_text: bookingRequestRawText(safePayload),
    parsed_name: toStr(body.client_name),
    parsed_phone: toStr(body.contact),
    parsed_intent: "booking_request",
    parsed_budget_thb: toNum(body.budget) ?? undefined,
    parsed_date: toStr(body.booking_date),
    parsed_location: toStr(body.area),
    confidence_score: 0.94,
    dedupe_status: "unresolved",
    linked_client_id: null,
    flags: [
      "sigil_booking",
      "public_booking_request",
      toStr(body.booking_lane) || "booking_lane_missing",
      toStr(body.request_mode) || "request_mode_missing",
    ],
    migration_status: "ready_to_sync",
  };

  try {
    const sync = await syncRecordsToAirtable(env, [
      {
        ...record,
        raw_text: `${record.raw_text} | payload_json=${JSON.stringify(safePayload)}`,
      },
    ]);
    const result = sync.results[0];

    return publicJson(request, env, {
      ok: true,
      request_id: requestId,
      booking_id: requestId,
      booking_ref: requestId,
      session_id: toStr(body.session_id) || undefined,
      payment_ref: toStr(body.payment_ref) || undefined,
      record_id: result?.airtable_record_id || result?.migration_id || requestId,
      next_url: nextUrl,
      storage: {
        worker: "immigrate-worker",
        mode: sync.mode,
        target: sync.mode === "airtable" ? "Airtable MMD — Console Inbox" : "mock_draft",
      },
      meta,
    });
  } catch (error) {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: {
          code: "BOOKING_REQUEST_WRITE_FAILED",
          message: error instanceof Error ? error.message : "Booking request write failed",
        },
        meta,
      },
      { status: 502 },
    );
  }
}

function bookingRequestNextUrl(
  request: Request,
  ids: {
    booking_id: string;
    booking_ref: string;
    t?: string;
    code?: string;
    promo?: string;
    session_id?: string;
    payment_ref?: string;
  },
): string {
  const current = new URL(request.url);
  const next = new URL(PAYMENT_PAGE_PATH, current.origin);
  for (const key of ["t", "code", "promo"] as const) {
    const value = current.searchParams.get(key) || toStr(ids[key]);
    if (value) next.searchParams.set(key, value);
  }
  next.searchParams.set("booking_id", ids.booking_id);
  next.searchParams.set("booking_ref", ids.booking_ref);
  if (ids.session_id) next.searchParams.set("session_id", ids.session_id);
  if (ids.payment_ref) next.searchParams.set("payment_ref", ids.payment_ref);
  return `${next.pathname}${next.search}`;
}

type PublicRenewalStatusResponse = {
  ok: true;
  data: {
    found: boolean;
    email: string;
    member_id: string;
    memberstack_id: string;
    display_name: string;
    membership_status: string;
    current_tier: string;
    expire_at: string;
    total_sessions: number;
    total_spend_thb: number;
    points_balance: number;
    points_total_earned: number;
    points_total_redeemed: number;
    service_history_summary: string;
    promotion_status: string;
    pricing_decision_thb: number;
    pricing_reason: string;
    line_context_found: boolean;
    context?: ImmigrationLinkContext;
  };
  meta: Meta;
};

type RenewalStatusProjection = PublicRenewalStatusResponse["data"];

function sumTotalSpendFromContext(context: ImmigrationLinkContext): number {
  return (context.service_history || []).reduce((sum, row) => {
    const amount = Number(row.amount_total_thb || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

function deriveMembershipStatus(input: {
  current_status_latest_session_status: string;
  membership_status: string;
  expire_at?: string;
  found: boolean;
}): string {
  if (!input.found) return "not_found";
  const raw = toStr(input.membership_status).toLowerCase();
  if (raw) return raw;

  const expireAt = toStr(input.expire_at);
  if (expireAt) {
    const t = new Date(expireAt).getTime();
    if (Number.isFinite(t)) {
      return t >= Date.now() ? "active" : "expired";
    }
  }

  const latest = toStr(input.current_status_latest_session_status).toLowerCase();
  if (["confirmed", "en_route", "arrived", "met", "work_started"].includes(latest)) {
    return "active";
  }

  return "found";
}

function derivePricingDecision(
  totalSpendTHB: number,
  currentTier: string,
  intentHint?: string,
): { pricing_decision_thb: number; pricing_reason: string } {
  const tier = toStr(currentTier).toLowerCase();
  const intent = toStr(intentHint).toLowerCase();

  if (totalSpendTHB >= 100000) {
    return { pricing_decision_thb: 0, pricing_reason: "service_spend_gte_100000" };
  }

  if (totalSpendTHB >= 15000) {
    return {
      pricing_decision_thb: 2000,
      pricing_reason: "service_spend_between_15000_and_99999",
    };
  }

  if (intent === "upgrade") {
    return { pricing_decision_thb: 2000, pricing_reason: "upgrade_default" };
  }

  if (["premium", "vip", "svip", "blackcard"].includes(tier)) {
    return {
      pricing_decision_thb: 2000,
      pricing_reason: "existing_paid_tier_but_below_free_threshold",
    };
  }

  return { pricing_decision_thb: 2500, pricing_reason: "gap_or_new_or_low_history" };
}

async function buildRenewalStatusProjection(
  env: Env,
  input: {
    email?: string;
    display_name?: string;
    line_user_id?: string;
    memberstack_id?: string;
    current_tier?: string;
    target_tier?: string;
    membership_status?: string;
    expire_at?: string;
    intent_hint?: string;
  },
): Promise<{ projection: RenewalStatusProjection; context: ImmigrationLinkContext }> {
  const context = await buildImmigrationLinkContext(env, {
    line_user_id: input.line_user_id,
    memberstack_id: input.memberstack_id,
    email: input.email,
    display_name: input.display_name,
    current_tier: input.current_tier,
    target_tier: input.target_tier,
    membership_status: input.membership_status,
  });

  const totalSpendTHB = sumTotalSpendFromContext(context);
  const totalSessions = Array.isArray(context.service_history) ? context.service_history.length : 0;
  const lineContextFound = Array.isArray(context.line_history) && context.line_history.length > 0;
  const memberstackId = toStr(context.membership?.memberstack_id || input.memberstack_id);
  const found = Boolean(memberstackId || totalSessions > 0 || lineContextFound);
  const membershipExpireAt = toStr(context.membership?.expire_at || input.expire_at);
  const membershipStatus = deriveMembershipStatus({
    current_status_latest_session_status: context.current_status?.latest_session_status || "",
    membership_status: toStr(context.membership?.status || input.membership_status),
    expire_at: membershipExpireAt,
    found,
  });
  const currentTier = toStr(context.membership?.current_tier || input.current_tier);
  const pricing = derivePricingDecision(totalSpendTHB, currentTier, input.intent_hint);
  const normalizedContext: ImmigrationLinkContext = {
    ...context,
    membership: {
      ...context.membership,
      status: found ? membershipStatus : "not_found",
      expire_at: membershipExpireAt,
    },
  };

  return {
    projection: {
      found,
      email: toStr(input.email).toLowerCase(),
      member_id: memberstackId,
      memberstack_id: memberstackId,
      display_name: toStr(input.display_name),
      membership_status: found ? membershipStatus : "not_found",
      current_tier: currentTier,
      expire_at: membershipExpireAt,
      total_sessions: totalSessions,
      total_spend_thb: totalSpendTHB,
      points_balance: Number(context.points?.balance || 0),
      points_total_earned: Number(context.points?.total_earned || 0),
      points_total_redeemed: Number(context.points?.total_redeemed || 0),
      service_history_summary: toStr(context.service_history_summary),
      promotion_status: lineContextFound ? "identity_checked" : "",
      pricing_decision_thb: pricing.pricing_decision_thb,
      pricing_reason: pricing.pricing_reason,
      line_context_found: lineContextFound,
      context: normalizedContext,
    },
    context: normalizedContext,
  };
}

async function handlePublicRenewalStatus(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const body = (await request.json().catch(() => null)) as PublicRenewalStatusRequest | null;

  if (!body || typeof body !== "object") {
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "INVALID_INPUT", message: "valid renewal status payload is required" }, meta },
      { status: 400 },
    );
  }

  const emailPrimary = toStr(body.email_primary || body.email).toLowerCase();
  const emailSecondary = toStr(body.email_secondary).toLowerCase();
  const email = emailPrimary || emailSecondary;

  if (!email) {
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "INVALID_INPUT", message: "email or email_primary is required" }, meta },
      { status: 400 },
    );
  }

  if (!isValidEmailAddress(email)) {
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "INVALID_INPUT", message: "email format is invalid" }, meta },
      { status: 400 },
    );
  }

  const displayName = toStr(body.display_name || body.nickname || body.line_display_name);
  const { projection, context } = await buildRenewalStatusProjection(env, {
    email,
    display_name: displayName,
    line_user_id: toStr(body.line_user_id),
    memberstack_id: toStr(body.memberstack_id),
    intent_hint: toStr(body.search_priority) === "upgrade" ? "upgrade" : "renewal",
  });

  return publicJson(request, env, {
    ok: true,
    data: body.include_context ? projection : { ...projection, context: undefined },
    meta,
  } satisfies PublicRenewalStatusResponse);
}

type PublicRenewalBody = {
  display_name?: string;
  name?: string;
  nickname?: string;
  email?: string;
  email_primary?: string;
  email_secondary?: string;
  line_id?: string;
  line_user_id?: string;
  phone?: string;
  contact?: string;
  telegram?: string;
  telegram_username?: string;
  member_ref?: string;
  member_id?: string;
  memberstack_id?: string;
  current_tier_hint?: string;
  target_package?: string;
  target_package_label?: string;
  target_tier?: string;
  package?: string;
  package_code?: string;
  package_label?: string;
  total?: number | string;
  payment_method?: string;
  payment_method_label?: string;
  payment_reference_url?: string;
  membership_expiry_rule?: string;
  renewal_days_fixed?: boolean | string;
  points_can_extend_expiry?: boolean | string;
  points_balance?: number | string | null;
  points_required?: number | string | null;
  points_shortfall?: number | string | null;
  expiry_extension_reason?: string;
  flow?: string;
  page?: string;
  source_page?: string;
  admin_context?: string;
  service_history_note?: string;
  note?: string;
  manual_note?: string;
  raw_json?: string;
  model_name?: string;
  model_record_id?: string;
  telegram_chat_id?: string;
  telegram_message_thread_id?: string | number;
  notify_telegram?: boolean | string;
  proof_attached?: boolean | string;
  proof_filename?: string;
  proof_mime_type?: string;
  proof_size?: number | string;
  proof_image_base64?: string;
  proof_source?: string;
  [key: string]: unknown;
};

type RenewalPackage = "premium" | "standard" | "vip" | "black_card";
type RenewalPaymentMethod = "bank_transfer" | "promptpay_qr" | "credit_card";
type RenewalExtensionReason =
  | "paid_renewal"
  | "points_threshold_reached"
  | "spending_threshold_reached"
  | "manual_review"
  | "upgrade_review";

const RENEWAL_PACKAGE_LABELS: Record<RenewalPackage, string> = {
  premium: "Premium Package",
  standard: "Standard Package",
  vip: "VIP",
  black_card: "Black Card",
};

const RENEWAL_PAYMENT_LABELS: Record<RenewalPaymentMethod, string> = {
  bank_transfer: "Bank Transfer",
  promptpay_qr: "QR PromptPay",
  credit_card: "Credit Card",
};

function normalizeRenewalPackage(value: unknown): RenewalPackage {
  const raw = toStr(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (raw.includes("black") || raw.includes("svip")) return "black_card";
  if (raw.includes("vip")) return "vip";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  return "premium";
}

function normalizeRenewalPaymentMethod(value: unknown): RenewalPaymentMethod {
  const raw = toStr(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (raw.includes("credit") || raw.includes("card") || raw.includes("paypal")) return "credit_card";
  if (raw.includes("promptpay") || raw.includes("qr")) return "promptpay_qr";
  return "bank_transfer";
}

function renewalPaymentReferenceUrl(method: RenewalPaymentMethod, amount: number | null): string {
  if (method === "credit_card") return "https://www.paypal.com/ncp/payment/M697T7AW2QZZJ";
  if (method === "promptpay_qr") {
    const amountPart = amount && Number.isFinite(amount) && amount > 0 ? `/${amount}` : "";
    return `https://promptpay.io/0829528889${amountPart}`;
  }
  return "bank_transfer:ktb:1420335898";
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || toStr(value) === "") return null;
  return toNum(value);
}

function normalizeExtensionReason(value: unknown, fallback: RenewalExtensionReason): RenewalExtensionReason {
  const raw = toStr(value).toLowerCase();
  if (
    raw === "paid_renewal" ||
    raw === "points_threshold_reached" ||
    raw === "spending_threshold_reached" ||
    raw === "manual_review" ||
    raw === "upgrade_review"
  ) {
    return raw;
  }
  return fallback;
}

function inferRenewalExtensionReason(input: {
  targetPackage: RenewalPackage;
  pointsBalance: number | null;
  pointsRequired: number | null;
  proofAttached: boolean;
}): RenewalExtensionReason {
  if (
    input.pointsBalance !== null &&
    input.pointsRequired !== null &&
    input.pointsRequired > 0 &&
    input.pointsBalance >= input.pointsRequired
  ) {
    return "points_threshold_reached";
  }
  if (input.targetPackage === "vip" || input.targetPackage === "black_card") return "upgrade_review";
  if (input.proofAttached) return "paid_renewal";
  return "manual_review";
}

function renewalDynamicPolicyNote(): string {
  return "วันหมดอายุสมาชิกอาจขยายเพิ่มเติมได้ตามยอดใช้งานที่เข้าเกณฑ์ points และสถานะแพ็กเกจ โดย Per จะตรวจสอบและยืนยันวันหมดอายุสุดท้ายอีกครั้ง";
}

function blackCardPolicyNote(): string {
  return "สถานะ Black Card เป็นสิทธิ์สมาชิกระยะยาวระดับสูง โดยวันหมดอายุสามารถขยายเพิ่มเติมได้ตามยอดใช้งาน points และการอนุมัติจาก MMD Privé สถานะสุดท้ายจะได้รับการตรวจสอบและยืนยันเป็นรายกรณี";
}

function toBool(value: unknown): boolean {
  if (value === true) return true;
  const raw = toStr(value).toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function renewalProofFields(body: PublicRenewalBody): {
  proof_attached: boolean;
  proof_filename: string;
  proof_mime_type: string;
  proof_size: number;
  proof_image_base64_present: boolean;
  proof_source: string;
} {
  const proofImageBase64 = toStr(body.proof_image_base64);
  const proofFilename = toStr(body.proof_filename);
  const proofAttached = toBool(body.proof_attached) || Boolean(proofFilename || proofImageBase64);
  return {
    proof_attached: proofAttached,
    proof_filename: proofFilename,
    proof_mime_type: toStr(body.proof_mime_type),
    proof_size: toNum(body.proof_size) || 0,
    proof_image_base64_present: Boolean(proofImageBase64),
    proof_source: toStr(body.proof_source) || "oldProof",
  };
}

function renewalProofNote(fields: ReturnType<typeof renewalProofFields>): string {
  return [
    `proof:${fields.proof_attached ? "attached" : "none"}`,
    `proof_attached:${fields.proof_attached}`,
    fields.proof_filename ? `proof_filename:${fields.proof_filename}` : "",
    fields.proof_mime_type ? `proof_mime_type:${fields.proof_mime_type}` : "",
    fields.proof_size ? `proof_size:${fields.proof_size}` : "",
    fields.proof_image_base64_present ? "proof_image_base64:present" : "",
    `proof_source:${fields.proof_source}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function buildPublicRenewalPayload(body: PublicRenewalBody): ImmigrationIntakeRequest {
  const displayName = toStr(body.display_name || body.name);
  const currentTier = toStr(body.current_tier_hint);
  const amount = toNum(body.total);
  const proof = renewalProofFields(body);
  const targetPackage = normalizeRenewalPackage(
    body.target_package || body.target_tier || body.package_code || body.package_label || body.package,
  );
  const targetPackageLabel = RENEWAL_PACKAGE_LABELS[targetPackage];
  const targetTier = targetPackage;
  const membershipExpiryRule =
    targetPackage === "black_card" ? "long_term_dynamic_points_extension" : "dynamic_points_extension";
  const paymentMethod = normalizeRenewalPaymentMethod(body.payment_method);
  const paymentMethodLabel = RENEWAL_PAYMENT_LABELS[paymentMethod];
  const paymentReferenceUrl = toStr(body.payment_reference_url) || renewalPaymentReferenceUrl(paymentMethod, amount);
  const pointsBalance = nullableNumber(body.points_balance);
  const pointsRequired = nullableNumber(body.points_required);
  const pointsShortfall = nullableNumber(body.points_shortfall);
  const inferredReason = inferRenewalExtensionReason({
    targetPackage,
    pointsBalance,
    pointsRequired,
    proofAttached: proof.proof_attached,
  });
  const expiryExtensionReason = normalizeExtensionReason(body.expiry_extension_reason, inferredReason);
  const baseHistoryNote = toStr(body.service_history_note || body.manual_note || body.note);
  const proofNote = proof.proof_attached || baseHistoryNote ? renewalProofNote(proof) : "";
  const dynamicPolicyNote = [
    `membership_expiry_rule:${membershipExpiryRule}`,
    "renewal_days_fixed:false",
    "points_can_extend_expiry:true",
    `target_package:${targetPackage}`,
    `target_package_label:${targetPackageLabel}`,
    `expiry_extension_reason:${expiryExtensionReason}`,
    pointsBalance !== null ? `points_balance:${pointsBalance}` : "",
    pointsRequired !== null ? `points_required:${pointsRequired}` : "",
    pointsShortfall !== null ? `points_shortfall:${pointsShortfall}` : "",
  ].filter(Boolean).join("; ");
  const historyNote = baseHistoryNote.includes("proof_attached:")
    ? baseHistoryNote
    : [baseHistoryNote, proofNote, dynamicPolicyNote].filter(Boolean).join("; ");
  const lineUserId = toStr(body.line_user_id);
  const lineId = toStr(body.line_id);

  const sourceChannel = lineUserId || lineId ? "line" : "renewal";
  const intent = toStr(body.flow).toLowerCase() === "upgrade" ? "upgrade" : "renewal";
  const operatorSummary = [
    "renewal_web_intake",
    targetTier ? `target:${targetTier}` : "",
    currentTier ? `current:${currentTier}` : "",
    paymentMethod ? `payment:${paymentMethod}` : "",
    `expiry_rule:${membershipExpiryRule}`,
    `expiry_reason:${expiryExtensionReason}`,
    proof.proof_attached ? "proof:attached" : "proof:none",
    Number.isFinite(amount) ? `amount:${amount}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    source_channel: sourceChannel,
    intent,
    identity: {
      member_id: toStr(body.member_id || body.memberstack_id || body.member_ref) || undefined,
      line_id: lineId || undefined,
      line_user_id: lineUserId || undefined,
      full_name: displayName || undefined,
      phone: toStr(body.phone || body.contact) || undefined,
    },
    membership: {
      current_tier: currentTier || undefined,
      target_tier: targetTier || undefined,
      target_package: targetPackage,
      target_package_label: targetPackageLabel,
      membership_expiry_rule: membershipExpiryRule,
      renewal_days_fixed: false,
      points_can_extend_expiry: true,
      expiry_extension_reason: expiryExtensionReason,
      black_card_default_validity_months: targetPackage === "black_card" ? 36 : undefined,
      black_card_review_cycle_months: targetPackage === "black_card" ? 12 : undefined,
      black_card_expiry_rule: targetPackage === "black_card" ? "long_term_dynamic_points_extension" : undefined,
      black_card_lifetime: targetPackage === "black_card" ? false : undefined,
    },
    notes: {
      manual_note_raw: historyNote || "",
      operator_summary: operatorSummary || undefined,
    },
    payload_json: {
      email: toStr(body.email),
      package: toStr(body.package),
      package_code: targetPackage,
      package_label: targetPackageLabel,
      target_package: targetPackage,
      target_package_label: targetPackageLabel,
      amount_thb: amount ?? undefined,
      payment_method: paymentMethod,
      payment_method_label: paymentMethodLabel,
      payment_reference_url: paymentReferenceUrl,
      membership_expiry_rule: membershipExpiryRule,
      renewal_days_fixed: false,
      points_can_extend_expiry: true,
      black_card_default_validity_months: targetPackage === "black_card" ? 36 : undefined,
      black_card_review_cycle_months: targetPackage === "black_card" ? 12 : undefined,
      black_card_expiry_rule: targetPackage === "black_card" ? "long_term_dynamic_points_extension" : undefined,
      black_card_lifetime: targetPackage === "black_card" ? false : undefined,
      points_balance: pointsBalance,
      points_required: pointsRequired,
      points_shortfall: pointsShortfall,
      expiry_extension_reason: expiryExtensionReason,
      customer_expiry_policy_note_th: targetPackage === "black_card" ? blackCardPolicyNote() : renewalDynamicPolicyNote(),
      customer_expiry_policy_note_en:
        "Membership validity may be extended based on eligible spending, points activity, and package status. Final expiry will be confirmed after review.",
      page: toStr(body.page),
      source_page: toStr(body.source_page),
      admin_context: toStr(body.admin_context),
      raw_json: toStr(body.raw_json),
      ...proof,
    },
  };
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildRenewalLineIntakePayload(
  body: PublicRenewalBody,
  payload: ImmigrationIntakeRequest,
  immigrationId: string,
): LineClientIntakeRequest {
  const emailPrimary = toStr(body.email_primary || body.email);
  const emailSecondary = toStr(body.email_secondary);
  const emailCandidates = [emailPrimary, emailSecondary].filter(Boolean);
  const phone = toStr(body.phone || body.contact);
  const telegramUsername = toStr(body.telegram_username || body.telegram);
  const nickname = toStr(body.nickname || body.display_name || body.name);
  const messageThreadId = toStr(body.telegram_message_thread_id) || "61";
  const proof = renewalProofFields(body);
  const targetPackage = normalizeRenewalPackage(
    payload.payload_json?.target_package || body.target_package || body.target_tier || body.package_code || body.package_label || body.package,
  );
  const targetPackageLabel = RENEWAL_PACKAGE_LABELS[targetPackage];
  const membershipExpiryRule =
    targetPackage === "black_card" ? "long_term_dynamic_points_extension" : "dynamic_points_extension";
  const paymentMethod = normalizeRenewalPaymentMethod(payload.payload_json?.payment_method || body.payment_method);
  const paymentMethodLabel = RENEWAL_PAYMENT_LABELS[paymentMethod];

  return {
    immigration_id: immigrationId,
    memberstack_id: toStr(body.memberstack_id || body.member_id || body.member_ref),
    source_channel: payload.source_channel,
    intake_source: payload.source_channel === "renewal" ? "renewal_web" : "line",
    display_name: toStr(payload.identity.full_name),
    nickname: nickname || toStr(payload.identity.full_name),
    line_user_id: toStr(body.line_user_id),
    line_id: toStr(body.line_id),
    email: emailPrimary || toStr(payload.payload_json?.email),
    member_email: emailPrimary || toStr(payload.payload_json?.email),
    phone,
    member_phone: phone,
    model_name: toStr(body.model_name),
    model_record_id: toStr(body.model_record_id),
    telegram_chat_id: toStr(body.telegram_chat_id),
    telegram_message_thread_id: messageThreadId,
    notify_telegram: body.notify_telegram !== false && toStr(body.notify_telegram).toLowerCase() !== "false",
    manual_note: toStr(payload.notes.manual_note_raw),
    operator_summary: toStr(payload.notes.operator_summary),
    payload_json: {
      ...(payload.payload_json && typeof payload.payload_json === "object" ? payload.payload_json : {}),
      source_channel: payload.source_channel,
      intake_source: payload.source_channel === "renewal" ? "renewal_web" : "line",
      email_primary: emailPrimary,
      email_secondary: emailSecondary,
      email_candidates: emailCandidates,
      telegram_username: telegramUsername,
      renewal_flow: toStr(body.flow),
      renewal_source_page: toStr(body.source_page || body.page),
      requested_goal: toStr(body.desired_goal),
      target_package: targetPackage,
      target_package_label: targetPackageLabel,
      payment_method: paymentMethod,
      payment_method_label: paymentMethodLabel,
      payment_reference_url: toStr(payload.payload_json?.payment_reference_url || body.payment_reference_url),
      membership_expiry_rule: membershipExpiryRule,
      renewal_days_fixed: false,
      points_can_extend_expiry: true,
      black_card_default_validity_months: targetPackage === "black_card" ? 36 : undefined,
      black_card_review_cycle_months: targetPackage === "black_card" ? 12 : undefined,
      black_card_expiry_rule: targetPackage === "black_card" ? "long_term_dynamic_points_extension" : undefined,
      black_card_lifetime: targetPackage === "black_card" ? false : undefined,
      points_balance: nullableNumber(payload.payload_json?.points_balance ?? body.points_balance),
      points_required: nullableNumber(payload.payload_json?.points_required ?? body.points_required),
      points_shortfall: nullableNumber(payload.payload_json?.points_shortfall ?? body.points_shortfall),
      expiry_extension_reason: normalizeExtensionReason(
        payload.payload_json?.expiry_extension_reason || body.expiry_extension_reason,
        "manual_review",
      ),
      customer_expiry_policy_note_th: targetPackage === "black_card" ? blackCardPolicyNote() : renewalDynamicPolicyNote(),
      legacy_membership_proof_name: toStr(body.legacy_membership_proof_name),
      legacy_membership_proof_present: Boolean(body.legacy_membership_proof_present),
      confirmation_mode: toStr(body.confirmation_mode),
      ...proof,
    },
    original_payload: Object.fromEntries(Object.entries(body)),
  };
}

function buildRenewalMigrationRecord(
  payload: ImmigrationIntakeRequest,
  immigrationId: string,
): MigrationRecord {
  const rawText = [
    payload.notes.manual_note_raw,
    payload.notes.operator_summary || "",
    payload.identity.full_name ? `Client: ${payload.identity.full_name}` : "",
    payload.membership?.current_tier ? `Current tier: ${payload.membership.current_tier}` : "",
    payload.membership?.target_tier ? `Target tier: ${payload.membership.target_tier}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    migration_id: immigrationId,
    source_channel: "line",
    source_user_id: payload.identity.line_user_id || payload.identity.line_id || payload.identity.member_id || immigrationId,
    source_message_id: `renewal_${Date.now().toString(36)}`,
    received_at: new Date().toISOString(),
    raw_text: rawText,
    parsed_name: payload.identity.full_name,
    parsed_phone: payload.identity.phone,
    parsed_intent: payload.intent,
    parsed_budget_thb: toNum(payload.payload_json?.amount_thb) ?? undefined,
    parsed_date: undefined,
    parsed_location: "renewal_web",
    confidence_score: 0.99,
    dedupe_status: "unresolved",
    linked_client_id: null,
    flags: ["renewal_web", "manual_history_seed"],
    migration_status: "ready_to_sync",
  };
}

async function handlePublicRenewalIntake(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const rawBody = (await request.json().catch(() => null)) as PublicRenewalBody | null;

  if (!rawBody || typeof rawBody !== "object") {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: { code: "INVALID_INPUT", message: "valid renewal payload is required" },
        meta,
      },
      { status: 400 },
    );
  }

  const payload = buildPublicRenewalPayload(rawBody);
  const validationErrors: string[] = [];
  const fullName = toStr(payload.identity.full_name);
  const email = toStr(payload.payload_json?.email).toLowerCase();
  const historyNote = toStr(payload.notes.manual_note_raw);

  if (!fullName) validationErrors.push("display_name or name is required");
  if (!email) validationErrors.push("email is required");
  else if (!isValidEmailAddress(email)) validationErrors.push("email format is invalid");
  if (!historyNote) validationErrors.push("service_history_note or note is required");

  if (validationErrors.length) {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: { code: "INVALID_INPUT", message: validationErrors.join("; ") },
        meta,
      },
      { status: 400 },
    );
  }

  const record = buildPromotionRecord(payload, {
    promotion_status: "archived_raw",
  });
  const promotePreview = promoteRecord(record);
  const renewalLinePayload = buildRenewalLineIntakePayload(rawBody, payload, record.immigration_id);

  let intakeResult: Awaited<ReturnType<typeof intakeLineClientUpsert>> | null = null;
  let promotion:
    | {
        attempted: boolean;
        ok: boolean;
        member_id: string;
        promotion_status: string;
        created_new_member: boolean;
        error?: string;
      }
    | null = null;
  let links: Awaited<ReturnType<typeof createLineLinksAfterPromotion>> | null = null;
  let telegram:
    | {
        attempted: boolean;
        ok: boolean;
        status?: number;
        error?: string;
      }
    | null = null;
  const warnings: string[] = [];

  try {
    intakeResult = await intakeLineClientUpsert(env, renewalLinePayload);
  } catch (error) {
    const fallbackInbox = await writeRenewalFallbackInbox(env, payload, record.immigration_id, {
      reason: error instanceof Error ? error.message : "Renewal intake pipeline failed",
      source_page: toStr(rawBody.source_page || rawBody.sourcePage) || "sigil_pay_renewal",
    });
    if (fallbackInbox.ok) {
      warnings.push(`intake_fallback:${fallbackInbox.record_id}`);
      return publicJson(request, env, {
        ok: true,
        data: {
          immigration_id: record.immigration_id,
          service_history_summary: record.service_history_summary,
          promotion_status: "manual_review_required",
          member_id_preview: promotePreview.promoted_member_id || "",
          created_new_member_preview: Boolean(promotePreview.created_new_member),
          sync: {
            mode: "admin_worker_fallback",
            result: {
              migration_id: record.immigration_id,
              airtable_record_id: fallbackInbox.record_id,
              client_id: null,
              migration_status: "fallback_synced_to_admin_inbox" as const,
            },
          },
          airtable: null,
          promotion: null,
          links: null,
          telegram: null,
          warnings,
        },
        meta,
      });
    }
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: {
          code: "RENEWAL_INTAKE_PIPELINE_FAILED",
          message: error instanceof Error ? error.message : "Renewal intake pipeline failed",
        },
        meta,
      },
      { status: 502 },
    );
  }

  try {
    promotion = await promoteLineClientAfterIntake(env, renewalLinePayload, intakeResult);
    if (promotion && !promotion.ok && promotion.error) warnings.push(`promotion:${promotion.error}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "promotion_failed";
    warnings.push(`promotion:${message}`);
    promotion = {
      attempted: true,
      ok: false,
      member_id: "",
      promotion_status: "promotion_failed",
      created_new_member: false,
      error: message,
    };
  }

  try {
    links = await createLineLinksAfterPromotion(env, renewalLinePayload, intakeResult, promotion);
    if (promotion?.ok && !links) warnings.push("links:missing_links");
  } catch (error) {
    const message = error instanceof Error ? error.message : "links_failed";
    warnings.push(`links:${message}`);
    links = null;
  }

  try {
    telegram = await notifyTelegramForLineIntake(env, renewalLinePayload, promotion, links);
    if (telegram && !telegram.ok && telegram.error) warnings.push(`telegram:${telegram.error}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "telegram_failed";
    warnings.push(`telegram:${message}`);
    telegram = {
      attempted: true,
      ok: false,
      error: message,
    };
  }

  return publicJson(request, env, {
    ok: true,
    data: {
      immigration_id: record.immigration_id,
      service_history_summary: record.service_history_summary,
      promotion_status: promotion?.promotion_status || record.promotion_status,
      member_id_preview: promotion?.member_id || promotePreview.promoted_member_id || "",
      created_new_member_preview: promotion?.created_new_member ?? Boolean(promotePreview.created_new_member),
      sync: intakeResult
        ? {
            mode: intakeResult.mode,
            result: {
              migration_id: intakeResult.immigration_id,
              airtable_record_id: intakeResult.inbox_record?.airtable_record_id || "",
              client_id: intakeResult.client?.airtable_record_id || null,
              migration_status: "synced_to_airtable" as const,
            },
          }
        : null,
      airtable: intakeResult
        ? {
            action: intakeResult.action,
            target_table: intakeResult.target_table,
            existing_match: intakeResult.existing_match,
            client: intakeResult.client,
            inbox_record: intakeResult.inbox_record,
          }
        : null,
      promotion: promotion || null,
      links: links || null,
      telegram: telegram || null,
      warnings,
    },
    meta,
  });
}

async function writeRenewalFallbackInbox(
  env: Env,
  payload: ImmigrationIntakeRequest,
  immigrationId: string,
  options: { reason: string; source_page: string },
): Promise<{ ok: true; record_id: string } | { ok: false; error: string }> {
  if (!env.ADMIN_WORKER_BASE_URL && !env.ADMIN_WORKER) {
    return { ok: false, error: "missing_ADMIN_WORKER_target" };
  }

  const upstreamPath = "/internal/console/inbox";
  const upstreamUrl = env.ADMIN_WORKER_BASE_URL
    ? `${env.ADMIN_WORKER_BASE_URL.replace(/\/+$/, "")}${upstreamPath}`
    : upstreamPath;
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
  });

  if (env.INTERNAL_TOKEN) headers.set("authorization", `Bearer ${env.INTERNAL_TOKEN}`);
  if (env.CONFIRM_KEY) headers.set("x-confirm-key", env.CONFIRM_KEY);

  const adminNote = [
    "[Renewal Fallback Inbox]",
    `Reason: ${options.reason}`,
    `Immigration ID: ${immigrationId}`,
    `Name: ${toStr(payload.identity.full_name) || "-"}`,
    `Email: ${toStr(payload.payload_json?.email) || "-"}`,
    `Phone: ${toStr(payload.payload_json?.phone) || "-"}`,
    `Target Package: ${toStr(payload.payload_json?.target_package || payload.payload_json?.target_tier) || "-"}`,
    `Source Page: ${options.source_page}`,
  ].join("\n");

  const requestInit: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify({
      inbox_id: immigrationId,
      source: "renewal_web",
      intent: "note_only",
      member_name: toStr(payload.identity.full_name),
      member_email: toStr(payload.payload_json?.email),
      member_phone: toStr(payload.payload_json?.phone),
      telegram_username: toStr(payload.payload_json?.telegram_username),
      legacy_tags: "renewal_web,api_connected,fallback_inbox",
      admin_note: adminNote,
      payload_json: payload,
      status: "new",
    }),
  };

  const response = env.ADMIN_WORKER
    ? await env.ADMIN_WORKER.fetch(
        new Request(`https://admin-worker.internal${upstreamPath}`, requestInit),
      )
    : await fetch(upstreamUrl, requestInit);

  const data = await response.json().catch(() => null) as { ok?: boolean; record_id?: string; error?: string } | null;
  if (!response.ok || !data?.ok || !toStr(data.record_id)) {
    return { ok: false, error: toStr(data?.error) || `admin_worker_fallback_failed_${response.status}` };
  }

  return { ok: true, record_id: toStr(data.record_id) };
}

type PublicRecoveryAckBody = {
  case_id?: string;
  caseId?: string;
  client_name?: string;
  clientName?: string;
  model_name?: string;
  modelName?: string;
  incident?: string;
  context_note?: string;
  contextNote?: string;
  work_type?: string;
  workType?: string;
  status?: string;
  action?: string;
  source_page?: string;
  sourcePage?: string;
  page_url?: string;
  pageUrl?: string;
  details?: Record<string, unknown>;
};

type RecoveryAckRecordResult = {
  mode: "airtable" | "mock";
  action: "created" | "updated" | "mock";
  inbox_id: string;
  airtable_record_id?: string;
};

function recoveryString(value: unknown, maxLength = 240): string {
  return toStr(value).replace(/\s+/g, " ").slice(0, maxLength);
}

function buildRecoveryCaseId(body: PublicRecoveryAckBody, clientName: string, modelName: string): string {
  const explicit = recoveryString(body.case_id || body.caseId, 96);
  if (explicit) return explicit;

  const source = [clientName, modelName, new Date().toISOString().slice(0, 10)]
    .filter(Boolean)
    .join("_");
  return `recovery_${slugifyValue(source, "case")}`;
}

function isAllowedRecoveryOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return getPublicAllowedOrigins(env).includes(origin);
}

function recoveryInboxTable(): string {
  return "MMD — Console Inbox";
}

async function findRecoveryInboxRecord(env: Env, inboxId: string): Promise<{ id?: string } | null> {
  const data = await airtableImportRequest(env, recoveryInboxTable(), {
    query: {
      maxRecords: "1",
      filterByFormula: `{inbox_id}="${encodeFormulaValue(inboxId)}"`,
    },
  });
  const records = Array.isArray(data.records) ? data.records : [];
  const record = records[0] && typeof records[0] === "object" ? records[0] as { id?: string } : null;
  return record?.id ? record : null;
}

async function writeRecoveryAckRecord(
  env: Env,
  input: {
    caseId: string;
    clientName: string;
    modelName: string;
    incident: string;
    contextNote: string;
    workType: string;
    status: string;
    action: string;
    sourcePage: string;
    pageUrl: string;
    receivedAt: string;
    userAgent: string;
    country: string;
    details?: Record<string, unknown>;
  },
): Promise<RecoveryAckRecordResult> {
  const inboxId = `recovery_${slugifyValue(input.caseId, "case")}`.slice(0, 120);
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return { mode: "mock", action: "mock", inbox_id: inboxId };
  }

  const adminNote = [
    "SIGIL Recovery ACK",
    `Client: ${input.clientName}`,
    `Model: ${input.modelName}`,
    input.incident ? `Incident: ${input.incident}` : "",
    input.contextNote ? `Context: ${input.contextNote}` : "",
    input.workType ? `Work: ${input.workType}` : "",
  ].filter(Boolean).join(" | ");

  const fields = compactFields({
    inbox_id: inboxId,
    created_by: "sigil-recovery-page",
    source: "line",
    intent: "upsert_member",
    member_name: input.clientName,
    legacy_tags: "recovery_ack, sigil_care_layer, service_recovery",
    admin_note: adminNote,
    payload_json: JSON.stringify({
      case_id: input.caseId,
      care_layer: "sigil_care_layer",
      recovery_status: input.status,
      recovery_action: input.action,
      client_name: input.clientName,
      model_name: input.modelName,
      incident: input.incident,
      context_note: input.contextNote,
      work_type: input.workType,
      source_page: input.sourcePage,
      page_url: input.pageUrl,
      acknowledged_at: input.receivedAt,
      request_context: {
        user_agent: input.userAgent,
        country: input.country,
      },
      details: input.details || {},
    }),
    status: "new",
  });

  const existing = await findRecoveryInboxRecord(env, inboxId);
  if (existing?.id) {
    const updated = await patchAirtableImportRecordWithFallbacks(
      env,
      recoveryInboxTable(),
      existing.id,
      fields,
    );
    return {
      mode: "airtable",
      action: "updated",
      inbox_id: inboxId,
      airtable_record_id: toStr(updated.id) || existing.id,
    };
  }

  const created = await createAirtableImportRecordWithFallbacks(env, recoveryInboxTable(), fields);
  return {
    mode: "airtable",
    action: "created",
    inbox_id: inboxId,
    airtable_record_id: toStr(created.id),
  };
}

type RecoveryEvidenceSide = "client" | "model";

type RecoveryEvidenceMetadata = {
  name: string;
  type: string;
  size: number;
  key: string;
  url: string;
};

type RecoveryComplaintEvidenceInput = {
  type: string;
  lane: string;
  brand: string;
  voice: string;
  token: string;
  sessionId: string;
  clientName: string;
  modelName: string;
  caseDate: string;
  caseTime: string;
  caseLocation: string;
  laneStatement: string;
  statement: string;
  submittedWorkflowStatus: string;
  submittedNextStep: string;
  submittedFinalApprover: string;
  submittedTimestamp: string;
};

type RecoveryEvidenceRecordResult = {
  mode: "airtable" | "mock";
  action: "created" | "updated" | "mock";
  inbox_id: string;
  airtable_record_id?: string;
};

const RECOVERY_EVIDENCE_MAX_FILES_PER_SIDE = 12;
const RECOVERY_EVIDENCE_MAX_FILE_BYTES = 15 * 1024 * 1024;
const RECOVERY_EVIDENCE_WORKFLOW_STATUS = "received_with_evidence";
const RECOVERY_EVIDENCE_NEXT_STEP = "mmd_assistant_review";
const RECOVERY_EVIDENCE_FINAL_APPROVER = "Boss Per";
const RECOVERY_EVIDENCE_EMPTY_TYPE_ALLOWED_EXTENSIONS = new Set([".heic", ".heif", ".pdf"]);
const RECOVERY_EVIDENCE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

function recoveryText(value: unknown, maxLength = 1000): string {
  return toStr(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, maxLength)
    .trim();
}

function recoveryFormString(form: FormData, field: string, maxLength = 240): string {
  return recoveryString(form.get(field), maxLength);
}

function recoveryComplaintEvidenceInputFromForm(form: FormData): RecoveryComplaintEvidenceInput {
  return {
    type: recoveryFormString(form, "type", 80),
    lane: recoveryFormString(form, "lane", 80),
    brand: recoveryFormString(form, "brand", 120),
    voice: recoveryFormString(form, "voice", 120),
    token: recoveryFormString(form, "token", 2048),
    sessionId: recoveryFormString(form, "session_id", 160),
    clientName: recoveryFormString(form, "client_name", 160),
    modelName: recoveryFormString(form, "model_name", 160),
    caseDate: recoveryFormString(form, "case_date", 40),
    caseTime: recoveryFormString(form, "case_time", 40),
    caseLocation: recoveryFormString(form, "case_location", 240),
    laneStatement: recoveryText(form.get("lane_statement"), 3000),
    statement: recoveryText(form.get("statement"), 6000),
    submittedWorkflowStatus: recoveryFormString(form, "workflow_status", 120),
    submittedNextStep: recoveryFormString(form, "next_step", 120),
    submittedFinalApprover: recoveryFormString(form, "final_approver", 120),
    submittedTimestamp: recoveryFormString(form, "timestamp", 120),
  };
}

function recoveryEvidenceFiles(form: FormData, field: string): File[] {
  const alternateField = field.endsWith("[]") ? field.slice(0, -2) : `${field}[]`;
  const values = [
    ...form.getAll(field),
    ...(alternateField === field ? [] : form.getAll(alternateField)),
  ];
  return values.filter((value): value is File => value instanceof File && (Boolean(value.name) || value.size > 0));
}

function evidenceContentType(file: File): string {
  return recoveryString(file.type, 120).toLowerCase();
}

function recoveryEvidenceExtension(file: File): string {
  const match = recoveryString(file.name, 160).toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

function isRecoveryEvidenceFileTypeAllowed(file: File): boolean {
  const contentType = evidenceContentType(file);
  if (contentType) return RECOVERY_EVIDENCE_ALLOWED_TYPES.has(contentType);
  return RECOVERY_EVIDENCE_EMPTY_TYPE_ALLOWED_EXTENSIONS.has(recoveryEvidenceExtension(file));
}

function validateRecoveryEvidenceFiles(files: File[], side: RecoveryEvidenceSide): string[] {
  const errors: string[] = [];
  if (files.length > RECOVERY_EVIDENCE_MAX_FILES_PER_SIDE) {
    errors.push(`${side}_evidence[] supports at most ${RECOVERY_EVIDENCE_MAX_FILES_PER_SIDE} files`);
  }

  for (const file of files) {
    const name = recoveryString(file.name, 160) || "unnamed";
    const contentType = evidenceContentType(file);
    if (file.size <= 0) {
      errors.push(`${side}_evidence[] file is empty: ${name}`);
    }
    if (file.size > RECOVERY_EVIDENCE_MAX_FILE_BYTES) {
      errors.push(`${side}_evidence[] file exceeds 15MB: ${name}`);
    }
    if (!isRecoveryEvidenceFileTypeAllowed(file)) {
      errors.push(`${side}_evidence[] unsupported file type for ${name}: ${contentType || recoveryEvidenceExtension(file) || "unknown"}`);
    }
  }

  return errors;
}

function safeEvidenceFilename(filename: string): string {
  const leaf = (toStr(filename).split(/[\\/]/).pop() || "evidence")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 120);
  return leaf || "evidence";
}

function evidenceTimestampSegment(value: string): string {
  const raw = recoveryString(value, 120) || new Date().toISOString();
  const parsed = Date.parse(raw);
  const source = Number.isFinite(parsed) ? new Date(parsed).toISOString() : raw;
  return source
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || Date.now().toString(36);
}

function urlEncodeEvidenceKey(key: string): string {
  return key.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function buildEvidencePublicUrl(env: Env, key: string): string {
  const base = recoveryString(env.EVIDENCE_PUBLIC_BASE_URL || env.R2_PUBLIC_BASE_URL, 300).replace(/\/+$/, "");
  return base ? `${base}/${urlEncodeEvidenceKey(key)}` : "";
}

function hexFromBytes(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function shortSha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return hexFromBytes(await crypto.subtle.digest("SHA-256", bytes)).slice(0, 16);
}

async function buildRecoveryComplaintCaseId(
  form: FormData,
  input: RecoveryComplaintEvidenceInput,
): Promise<string> {
  void form;
  const clientSlug = slugifyValue(input.clientName || "client", "client");
  const modelSlug = slugifyValue(input.modelName || "model", "model");
  return `complaint_${clientSlug}_${modelSlug}_${Date.now().toString(36)}`.slice(0, 140);
}

async function uploadRecoveryEvidenceFiles(
  env: Env,
  caseId: string,
  side: RecoveryEvidenceSide,
  files: File[],
  timestamp: string,
): Promise<RecoveryEvidenceMetadata[]> {
  if (!files.length) return [];
  if (!env.EVIDENCE_BUCKET || typeof env.EVIDENCE_BUCKET.put !== "function") {
    throw new Error("missing_evidence_bucket");
  }

  const uploaded: RecoveryEvidenceMetadata[] = [];
  for (const file of files) {
    const originalName = recoveryString(file.name, 160) || "evidence";
    const key = `sigil/recovery/evidence/${caseId}/${side}/${timestamp}-${safeEvidenceFilename(originalName)}`;
    const contentType = recoveryString(file.type, 120) || "application/octet-stream";

    await env.EVIDENCE_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        case_id: caseId,
        side,
        original_name: originalName.slice(0, 512),
      },
    });

    uploaded.push({
      name: originalName,
      type: contentType,
      size: file.size,
      key,
      url: buildEvidencePublicUrl(env, key),
    });
  }

  return uploaded;
}

async function writeRecoveryComplaintEvidenceCaseRecord(
  env: Env,
  input: RecoveryComplaintEvidenceInput & {
    caseId: string;
    evidence: Record<RecoveryEvidenceSide, RecoveryEvidenceMetadata[]>;
    createdAt: string;
    userAgent: string;
    country: string;
  },
): Promise<RecoveryEvidenceRecordResult> {
  const inboxId = `recovery_complaint_${slugifyValue(input.caseId, "case")}`.slice(0, 120);
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return { mode: "mock", action: "mock", inbox_id: inboxId };
  }

  const evidenceJson = JSON.stringify(input.evidence);
  const adminNote = [
    "SIGIL Recovery Complaint Evidence",
    `Case: ${input.caseId}`,
    input.clientName ? `Client: ${input.clientName}` : "",
    input.modelName ? `Model: ${input.modelName}` : "",
    input.caseDate || input.caseTime ? `When: ${[input.caseDate, input.caseTime].filter(Boolean).join(" ")}` : "",
    input.caseLocation ? `Location: ${input.caseLocation}` : "",
    `Evidence: client=${input.evidence.client.length}, model=${input.evidence.model.length}`,
  ].filter(Boolean).join(" | ");

  const fields = compactFields({
    inbox_id: inboxId,
    created_by: "sigil-recovery-complaint-page",
    source: "line",
    intent: "upsert_member",
    member_name: input.clientName,
    legacy_tags: "recovery_complaint, sigil_care_layer, evidence_upload",
    admin_note: adminNote,
    case_id: input.caseId,
    token: input.token,
    session_id: input.sessionId,
    lane: input.lane,
    client_name: input.clientName,
    model_name: input.modelName,
    case_date: input.caseDate,
    case_time: input.caseTime,
    case_location: input.caseLocation,
    lane_statement: input.laneStatement,
    statement: input.statement,
    workflow_status: RECOVERY_EVIDENCE_WORKFLOW_STATUS,
    next_step: RECOVERY_EVIDENCE_NEXT_STEP,
    final_approver: RECOVERY_EVIDENCE_FINAL_APPROVER,
    evidence_metadata_json: evidenceJson,
    created_at: input.createdAt,
    payload_json: JSON.stringify({
      case_id: input.caseId,
      type: input.type,
      lane: input.lane,
      brand: input.brand,
      voice: input.voice,
      token: input.token,
      session_id: input.sessionId,
      client_name: input.clientName,
      model_name: input.modelName,
      case_date: input.caseDate,
      case_time: input.caseTime,
      case_location: input.caseLocation,
      lane_statement: input.laneStatement,
      statement: input.statement,
      workflow_status: RECOVERY_EVIDENCE_WORKFLOW_STATUS,
      next_step: RECOVERY_EVIDENCE_NEXT_STEP,
      final_approver: RECOVERY_EVIDENCE_FINAL_APPROVER,
      submitted_workflow_status: input.submittedWorkflowStatus,
      submitted_next_step: input.submittedNextStep,
      submitted_final_approver: input.submittedFinalApprover,
      submitted_timestamp: input.submittedTimestamp,
      evidence: input.evidence,
      created_at: input.createdAt,
      request_context: {
        user_agent: input.userAgent,
        country: input.country,
      },
    }),
    status: "new",
  });

  const existing = await findRecoveryInboxRecord(env, inboxId);
  if (existing?.id) {
    const updated = await patchAirtableImportRecordWithFallbacks(env, recoveryInboxTable(), existing.id, fields);
    return {
      mode: "airtable",
      action: "updated",
      inbox_id: inboxId,
      airtable_record_id: toStr(updated.id) || existing.id,
    };
  }

  const created = await createAirtableImportRecordWithFallbacks(env, recoveryInboxTable(), fields);
  return {
    mode: "airtable",
    action: "created",
    inbox_id: inboxId,
    airtable_record_id: toStr(created.id),
  };
}

async function handlePublicRecoveryAck(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (!isAllowedRecoveryOrigin(request, env)) {
    return json(
      {
        ok: false,
        error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed" },
        meta,
      },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as PublicRecoveryAckBody | null;
  if (!body || typeof body !== "object") {
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "INVALID_INPUT", message: "valid recovery payload is required" }, meta },
      { status: 400 },
    );
  }

  const clientName = recoveryString(body.client_name || body.clientName, 120);
  const modelName = recoveryString(body.model_name || body.modelName, 120);
  const validationErrors: string[] = [];
  if (!clientName) validationErrors.push("client_name is required");
  if (!modelName) validationErrors.push("model_name is required");

  if (validationErrors.length) {
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "INVALID_INPUT", message: validationErrors.join("; ") }, meta },
      { status: 400 },
    );
  }

  const receivedAt = new Date().toISOString();
  const caseId = buildRecoveryCaseId(body, clientName, modelName);
  const record = await writeRecoveryAckRecord(env, {
    caseId,
    clientName,
    modelName,
    incident: recoveryString(body.incident, 180),
    contextNote: recoveryString(body.context_note || body.contextNote, 300),
    workType: recoveryString(body.work_type || body.workType, 180),
    status: recoveryString(body.status, 80) || "acknowledged",
    action: recoveryString(body.action, 80) || "enter_sigil_care",
    sourcePage: recoveryString(body.source_page || body.sourcePage, 160) || "sigil_recovery_page",
    pageUrl: recoveryString(body.page_url || body.pageUrl, 300),
    receivedAt,
    userAgent: recoveryString(request.headers.get("user-agent"), 300),
    country: recoveryString(request.headers.get("cf-ipcountry"), 12),
    details: body.details && typeof body.details === "object" ? body.details : undefined,
  });

  return publicJson(request, env, {
    ok: true,
    data: {
      case_id: caseId,
      inbox_id: record.inbox_id,
      care_layer: "SIGIL Care Layer",
      recovery_status: "acknowledged",
      acknowledged_at: receivedAt,
      record,
    },
    meta,
  });
}

async function handlePublicRecoveryComplaintEvidence(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (!isAllowedRecoveryOrigin(request, env)) {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed" },
        meta,
      },
      { status: 403 },
    );
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "INVALID_INPUT", message: "multipart/form-data is required" }, meta },
      { status: 400 },
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "INVALID_INPUT", message: "valid multipart form data is required" }, meta },
      { status: 400 },
    );
  }

  const input = recoveryComplaintEvidenceInputFromForm(form);
  const clientFiles = recoveryEvidenceFiles(form, "client_evidence[]");
  const modelFiles = recoveryEvidenceFiles(form, "model_evidence[]");
  const validationErrors = [
    ...validateRecoveryEvidenceFiles(clientFiles, "client"),
    ...validateRecoveryEvidenceFiles(modelFiles, "model"),
  ];

  if (validationErrors.length) {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: validationErrors.join("; "),
          details: { validation_errors: validationErrors },
        },
        meta,
      },
      { status: 400 },
    );
  }

  if (!env.EVIDENCE_BUCKET || typeof env.EVIDENCE_BUCKET.put !== "function") {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: {
          code: "EVIDENCE_STORAGE_NOT_CONFIGURED",
          message: "EVIDENCE_BUCKET R2 binding is not configured",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const createdAt = new Date().toISOString();
  const caseId = await buildRecoveryComplaintCaseId(form, input);
  const timestamp = evidenceTimestampSegment(input.submittedTimestamp || createdAt);

  let evidence: Record<RecoveryEvidenceSide, RecoveryEvidenceMetadata[]>;
  try {
    evidence = {
      client: await uploadRecoveryEvidenceFiles(env, caseId, "client", clientFiles, timestamp),
      model: await uploadRecoveryEvidenceFiles(env, caseId, "model", modelFiles, timestamp),
    };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Evidence upload failed";
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "EVIDENCE_UPLOAD_FAILED", message }, meta },
      { status: 500 },
    );
  }

  let record: RecoveryEvidenceRecordResult;
  try {
    record = await writeRecoveryComplaintEvidenceCaseRecord(env, {
      ...input,
      caseId,
      evidence,
      createdAt,
      userAgent: recoveryString(request.headers.get("user-agent"), 300),
      country: recoveryString(request.headers.get("cf-ipcountry"), 12),
    });
  } catch {
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "CASE_RECORD_WRITE_FAILED", message: "Recovery case record write failed" }, meta },
      { status: 500 },
    );
  }

  return publicJson(request, env, {
    ok: true,
    case_id: caseId,
    evidence,
    next_step: RECOVERY_EVIDENCE_NEXT_STEP,
    record,
    meta,
  });
}

const PRIVATE_MODEL_ALLOWED_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PRIVATE_MODEL_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type PrivateModelApplyBody = Record<string, unknown> & {
  nickname?: string;
  age?: string | number;
  phone?: string;
  telegram_username?: string;
  line_id?: string;
  instagram?: string;
  consent?: boolean;
  honeypot?: string;
  cf_turnstile_response?: string;
};

type PrivateModelAirtableWarning = {
  target: "airtable";
  code: string;
  message?: string;
  configured_table?: string;
};

type PrivateModelStorageResult = {
  r2: boolean;
  r2_key?: string;
  airtable: boolean;
  airtable_record_id?: string;
  airtable_table?: string;
  warnings: PrivateModelAirtableWarning[];
};

function privateModelApplicationId(): string {
  return `pm_app_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function privateModelText(value: unknown, maxLength = 240): string {
  return toStr(value)
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .trim();
}

function privateModelLongText(value: unknown, maxLength = 5000): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, maxLength)
    .trim();
}

function privateModelBool(value: unknown): boolean {
  return value === true || toStr(value).toLowerCase() === "true" || toStr(value) === "1";
}

function privateModelContactChannels(body: PrivateModelApplyBody): string[] {
  return [
    privateModelText(body.phone, 40),
    privateModelText(body.telegram_username, 120),
    privateModelText(body.line_id, 120),
    privateModelText(body.instagram, 500),
  ].filter(Boolean);
}

function validatePrivateModelApply(body: PrivateModelApplyBody): string[] {
  const errors: string[] = [];
  const nickname = privateModelText(body.nickname, 100);
  const age = Number(privateModelText(body.age, 8));
  if (!nickname) errors.push("nickname is required");
  if (!Number.isFinite(age) || age < 18 || age > 99) errors.push("age must be between 18 and 99");
  if (!privateModelContactChannels(body).length) {
    errors.push("at least one contact channel is required");
  }
  if (!privateModelBool(body.consent)) {
    errors.push("consent is required");
  }
  return errors;
}

async function verifyPrivateModelTurnstile(request: Request, env: Env, token: string): Promise<boolean> {
  const secret = toStr(env.TURNSTILE_SECRET_KEY);
  if (!token) return false;
  if (!secret) return true;

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) form.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = await response.json().catch(() => ({})) as { success?: boolean };
  return Boolean(response.ok && data.success);
}

async function privateModelUploadSignature(secret: string, key: string, expires: number, contentType: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = `${key}\n${expires}\n${contentType}`;
  return hexFromBytes(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)));
}

async function isValidPrivateModelUploadSignature(
  env: Env,
  key: string,
  expires: number,
  contentType: string,
  signature: string,
): Promise<boolean> {
  const secret = toStr(env.LINK_SIGNING_SECRET || env.INTERNAL_TOKEN);
  if (!secret || !key || !expires || !signature) return false;
  if (Date.now() > expires) return false;
  const expected = await privateModelUploadSignature(secret, key, expires, contentType);
  return expected === signature;
}

function privateModelUploadUrl(request: Request, key: string, expires: number, contentType: string, signature: string): string {
  const requestUrl = new URL(request.url);
  const uploadPath = isSigilPath(requestUrl.pathname) ? SIGIL.privateModelUploadFile : PUBLIC.privateModelUploadFile;
  const url = new URL(uploadPath, requestUrl.origin);
  url.searchParams.set("key", key);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("content_type", contentType);
  url.searchParams.set("sig", signature);
  return url.toString();
}

function privateModelFileUrl(env: Env, key: string): string {
  return buildEvidencePublicUrl(env, key);
}

function privateModelFileReference(env: Env, key: string): string {
  return privateModelFileUrl(env, key) || `r2://${key}`;
}

function privateModelApplicationsTable(env: Env): string {
  return env.AIRTABLE_TABLE_PRIVATE_MODEL_APPLICATIONS ||
    env.AIRTABLE_TABLE_IMPORT_LOGS ||
    "MMD Import Logs";
}

function parseAirtableError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const jsonMatch = message.match(/Airtable\s+\d+:\s+({.*})$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as { error?: { type?: string; message?: string } };
      return {
        code: toStr(parsed.error?.type) || "AIRTABLE_ERROR",
        message: toStr(parsed.error?.message) || message,
      };
    } catch {
      // Fall through to regex parsing.
    }
  }

  const typeMatch = message.match(/"type"\s*:\s*"([^"]+)"/);
  return {
    code: typeMatch?.[1] || "AIRTABLE_WRITE_FAILED",
    message,
  };
}

function logPrivateModelAirtableFailure(input: {
  applicationId: string;
  table: string;
  error: unknown;
  phase: string;
}) {
  const parsed = parseAirtableError(input.error);
  console.warn(JSON.stringify({
    source: "private_model_apply",
    event: "airtable_write_failed",
    phase: input.phase,
    application_id: input.applicationId,
    airtable_table: input.table,
    airtable_error_code: parsed.code,
    airtable_error_message: parsed.message,
    timestamp: new Date().toISOString(),
  }));
  return parsed;
}

function privateModelAirtableFields(applicationId: string, payload: Record<string, unknown>) {
  const now = new Date().toISOString();
  const requestContext = payload.request_context && typeof payload.request_context === "object"
    ? payload.request_context as Record<string, unknown>
    : {};
  const photoUrl = toStr(payload.photo_url) || toStr(payload.profile_photo_url);
  return compactFields({
    application_id: applicationId,
    status: "submitted",
    review_status: "pending_review",
    nickname: payload.nickname,
    age: payload.age,
    phone: payload.phone,
    telegram_username: payload.telegram_username,
    line_id: payload.line_id,
    application_type: payload.application_type,
    source: "model_apply_private_model",
    handler: "TarT",
    r2_key: payload.r2_key,
    photo_url: photoUrl,
    payload_json: JSON.stringify(payload),
    summary_json: JSON.stringify({
      application_id: applicationId,
      status: "submitted",
      review_status: "pending_review",
      r2_key: payload.r2_key,
    }),
    created_at: toStr(payload.submitted_at) || now,
    submitted_at: payload.submitted_at,
    occupation: payload.occupation,
    working_name: payload.working_name,
    location: payload.location,
    height: payload.height,
    weight: payload.weight,
    private_standard: payload.private_standard,
    minimum_rate_thb: payload.minimum_rate_thb,
    private_note: payload.private_note,
    instagram: payload.instagram,
    intro: payload.intro,
    experience: payload.experience,
    strengths: payload.strengths,
    skills: payload.skills,
    work_type: payload.work_type,
    lgbt_professional: payload.lgbt_professional,
    privacy_level: payload.privacy_level,
    boundaries: payload.boundaries,
    goal: payload.goal,
    consent: payload.consent,
    page_url: payload.page_url,
    user_agent: payload.user_agent || requestContext.user_agent,
    timezone: payload.timezone,
    language: payload.language,
  });
}

async function writePrivateModelApplicationToAirtable(
  env: Env,
  applicationId: string,
  payload: Record<string, unknown>,
): Promise<{ table: string; recordId: string; action: string }> {
  const table = privateModelApplicationsTable(env);
  const fields = privateModelAirtableFields(applicationId, payload);

  let existingId = "";
  try {
    const existing = await findAirtableImportRecords(env, table, "application_id", applicationId);
    existingId = toStr((existing[0] as Record<string, unknown> | undefined)?.id);
  } catch {
    existingId = "";
  }

  if (existingId) {
    const fallbackFields = [
      fields,
      compactFields({
        application_id: fields.application_id,
        status: fields.status,
        review_status: fields.review_status,
        source: fields.source,
        handler: fields.handler,
        nickname: fields.nickname,
        age: fields.age,
        phone: fields.phone,
        telegram_username: fields.telegram_username,
        line_id: fields.line_id,
        payload_json: fields.payload_json,
        created_at: fields.created_at,
      }),
      compactFields({
        application_id: fields.application_id,
        status: fields.status,
        review_status: fields.review_status,
        nickname: fields.nickname,
        payload_json: fields.payload_json,
      }),
      compactFields({
        application_id: fields.application_id,
        status: fields.status,
        payload_json: fields.payload_json,
      }),
      compactFields({
        application_id: fields.application_id,
        payload_json: fields.payload_json,
      }),
      compactFields({
        application_id: fields.application_id,
        status: fields.status,
      }),
      compactFields({
        application_id: fields.application_id,
      }),
    ];
    let lastError: unknown = null;
    for (const candidate of fallbackFields) {
      if (!Object.keys(candidate).length) continue;
      try {
        const updated = await patchAirtableImportRecordWithFallbacks(env, table, existingId, candidate);
        return { table, recordId: toStr((updated as Record<string, unknown>).id) || existingId, action: "updated" };
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return { table, recordId: existingId, action: "skipped_no_fields" };
  }

  const fallbackFields = [
    fields,
    compactFields({
      application_id: fields.application_id,
      status: fields.status,
      review_status: fields.review_status,
      source: fields.source,
      handler: fields.handler,
      nickname: fields.nickname,
      age: fields.age,
      phone: fields.phone,
      telegram_username: fields.telegram_username,
      line_id: fields.line_id,
      payload_json: fields.payload_json,
      created_at: fields.created_at,
    }),
    compactFields({
      application_id: fields.application_id,
      status: fields.status,
      review_status: fields.review_status,
      nickname: fields.nickname,
      payload_json: fields.payload_json,
    }),
    compactFields({
      application_id: fields.application_id,
      status: fields.status,
      payload_json: fields.payload_json,
    }),
    compactFields({
      application_id: fields.application_id,
      payload_json: fields.payload_json,
    }),
    compactFields({
      application_id: fields.application_id,
      status: fields.status,
    }),
    compactFields({
      application_id: fields.application_id,
    }),
  ];

  let lastError: unknown = null;
  for (const candidate of fallbackFields) {
    if (!Object.keys(candidate).length) continue;
    try {
      const created = await createAirtableImportRecordWithFallbacks(env, table, candidate);
      return { table, recordId: toStr((created as Record<string, unknown>).id), action: "created" };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  const created = await createAirtableImportRecordWithFallbacks(env, table, fields);
  return { table, recordId: toStr((created as Record<string, unknown>).id), action: "created" };
}

async function storePrivateModelApplication(
  env: Env,
  applicationId: string,
  payload: Record<string, unknown>,
): Promise<PrivateModelStorageResult> {
  const key = `sigil/private-model/applications/${applicationId}.json`;
  const payloadWithStorage = {
    ...payload,
    r2_key: key,
    photo_url: toStr(payload.photo_url) || toStr(payload.profile_photo_url),
  };
  let r2Stored = false;
  let r2Error = "";
  let airtableRecordId = "";
  let airtableTable = privateModelApplicationsTable(env);
  const warnings: PrivateModelAirtableWarning[] = [];

  if (env.EVIDENCE_BUCKET && typeof env.EVIDENCE_BUCKET.put === "function") {
    try {
      await env.EVIDENCE_BUCKET.put(key, JSON.stringify(payloadWithStorage, null, 2), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: {
          application_id: applicationId,
          application_type: "private_model",
          handler: "TarT",
        },
      });
      r2Stored = true;
    } catch (error) {
      r2Error = error instanceof Error ? error.message : String(error);
    }
  } else {
    r2Error = "EVIDENCE_BUCKET is not configured";
  }

  if (env.AIRTABLE_API_KEY && env.AIRTABLE_BASE_ID) {
    try {
      const record = await writePrivateModelApplicationToAirtable(env, applicationId, payloadWithStorage);
      airtableTable = record.table;
      airtableRecordId = record.recordId;
    } catch (error) {
      const parsed = logPrivateModelAirtableFailure({
        applicationId,
        table: airtableTable,
        error,
        phase: "submit",
      });
      warnings.push({
        target: "airtable",
        code: parsed.code,
        message: parsed.message,
        configured_table: airtableTable,
      });
    }
  } else {
    warnings.push({
      target: "airtable",
      code: "AIRTABLE_NOT_CONFIGURED",
      message: "AIRTABLE_API_KEY or AIRTABLE_BASE_ID is not configured",
      configured_table: airtableTable,
    });
  }

  const storedPayload = {
    ...payloadWithStorage,
    storage: {
      r2: r2Stored,
      r2_key: r2Stored ? key : "",
      r2_error: r2Error,
      airtable: Boolean(airtableRecordId),
      airtable_record_id: airtableRecordId,
      airtable_table: airtableTable,
    },
    warnings,
  };

  if (r2Stored && env.EVIDENCE_BUCKET && typeof env.EVIDENCE_BUCKET.put === "function") {
    await env.EVIDENCE_BUCKET.put(key, JSON.stringify(storedPayload, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: {
        application_id: applicationId,
        application_type: "private_model",
        handler: "TarT",
        airtable_synced: airtableRecordId ? "true" : "false",
      },
    });
  }

  if (!r2Stored && !airtableRecordId) {
    throw new Error(r2Error || "private_model_application_storage_failed");
  }

  return {
    r2: r2Stored,
    ...(r2Stored ? { r2_key: key } : {}),
    airtable: Boolean(airtableRecordId),
    ...(airtableRecordId ? { airtable_record_id: airtableRecordId } : {}),
    airtable_table: airtableTable,
    warnings,
  };
}

async function handlePrivateModelApply(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (!buildCorsHeaders(request, env).has("access-control-allow-origin")) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "origin_not_allowed", message: "Origin is not allowed" },
      meta,
    }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as PrivateModelApplyBody | null;
  if (!body || typeof body !== "object") {
    return publicJson(request, env, {
      ok: false,
      error: { code: "validation_error", message: "valid JSON payload is required" },
      meta,
    }, { status: 400 });
  }

  if (privateModelText(body.honeypot, 100)) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "submission_rejected", message: "Submission rejected" },
      meta,
    }, { status: 400 });
  }

  const validationErrors = validatePrivateModelApply(body);
  if (validationErrors.length) {
    return publicJson(request, env, {
      ok: false,
      error: {
        code: "validation_error",
        message: validationErrors.join("; "),
        details: { validation_errors: validationErrors },
      },
      meta,
    }, { status: 400 });
  }

  const turnstileToken = privateModelText(body.cf_turnstile_response, 4096);
  if (turnstileToken) {
    const verified = await verifyPrivateModelTurnstile(request, env, turnstileToken);
    if (!verified) {
      return publicJson(request, env, {
        ok: false,
        error: { code: "turnstile_failed", message: "Turnstile verification failed" },
        meta,
      }, { status: 400 });
    }
  }

  const applicationId = privateModelApplicationId();
  const submittedAt = new Date().toISOString();
  const payload = compactFields({
    application_id: applicationId,
    status: "submitted",
    review_status: "pending_review",
    submitted_at: submittedAt,
    application_type: "private_model",
    work_type: "private_model",
    source: "model_apply_private_model",
    privacy_layer: "SIGIL",
    handler: "TarT",
    handler_role: "SIGIL private application concierge",
    channel: privateModelText(body.channel, 60) || "web",
    page_url: privateModelText(body.page_url, 700),
    form_version: privateModelText(body.form_version, 160),
    nickname: privateModelText(body.nickname, 100),
    working_name: privateModelText(body.working_name || body.nickname, 100),
    age: privateModelText(body.age, 8),
    parent_brand: privateModelText(body.parent_brand, 120),
    layer: privateModelText(body.layer, 120),
    occupation: privateModelText(body.occupation, 160),
    location: privateModelText(body.location, 200),
    height: privateModelText(body.height, 20),
    weight: privateModelText(body.weight, 20),
    phone: privateModelText(body.phone, 40),
    telegram_username: privateModelText(body.telegram_username, 120),
    line_id: privateModelText(body.line_id, 120),
    instagram: privateModelText(body.instagram, 700),
    intro: privateModelLongText(body.intro),
    experience: privateModelLongText(body.experience),
    strengths: privateModelLongText(body.strengths),
    skills: privateModelLongText(body.skills),
    taste_lifestyle_collectibles: privateModelLongText(body.taste_lifestyle_collectibles),
    private_readiness: privateModelText(body.private_readiness, 180),
    private_standard: privateModelText(body.private_standard, 180),
    minimum_rate_thb: toNum(body.minimum_rate_thb),
    private_note: privateModelLongText(body.private_note, 2000),
    lgbt_professional: privateModelText(body.lgbt_professional, 180),
    privacy_level: privateModelText(body.privacy_level, 180),
    protection_notes: privateModelLongText(body.protection_notes),
    boundaries: privateModelLongText(body.boundaries),
    goal: privateModelLongText(body.goal),
    profile_photo_url: privateModelText(body.profile_photo_url, 1000),
    profile_photo_filename: privateModelText(body.profile_photo_filename, 180),
    profile_photo_size: privateModelText(body.profile_photo_size, 40),
    profile_photo_type: privateModelText(body.profile_photo_type, 120),
    consent: true,
    user_agent: privateModelText(body.user_agent || request.headers.get("user-agent"), 500),
    timezone: privateModelText(body.timezone, 120),
    language: privateModelText(body.language, 80),
    request_context: {
      user_agent: privateModelText(body.user_agent || request.headers.get("user-agent"), 500),
      country: privateModelText(request.headers.get("cf-ipcountry"), 12),
      ip_hash: await shortSha256(privateModelText(request.headers.get("cf-connecting-ip"), 80)),
    },
  });

  let storage: PrivateModelStorageResult;
  try {
    storage = await storePrivateModelApplication(env, applicationId, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return publicJson(request, env, {
      ok: false,
      error: { code: "storage_failed", message },
      meta,
    }, { status: 503 });
  }

  return publicJson(request, env, {
    ok: true,
    application_id: applicationId,
    status: "submitted",
    review_status: "pending_review",
    storage: {
      r2: storage.r2,
      airtable: storage.airtable,
    },
    ...(storage.r2_key ? { r2_key: storage.r2_key } : {}),
    ...(storage.airtable_record_id ? { airtable_record_id: storage.airtable_record_id } : {}),
    ...(storage.warnings.length ? { warnings: storage.warnings } : {}),
    meta,
  });
}

async function handlePrivateModelUploadUrl(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (!buildCorsHeaders(request, env).has("access-control-allow-origin")) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "origin_not_allowed", message: "Origin is not allowed" },
      meta,
    }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return publicJson(request, env, {
      ok: false,
      error: { code: "validation_error", message: "valid JSON payload is required" },
      meta,
    }, { status: 400 });
  }

  const filename = privateModelText(body.filename, 180) || "private-model-photo";
  const contentType = privateModelText(body.content_type || body.contentType, 120).toLowerCase();
  if (!PRIVATE_MODEL_ALLOWED_UPLOAD_TYPES.has(contentType)) {
    return publicJson(request, env, {
      ok: false,
      error: {
        code: "validation_error",
        message: "Unsupported file type. JPG, PNG, and WEBP are supported.",
      },
      meta,
    }, { status: 400 });
  }

  const size = Number(privateModelText(body.size || body.file_size || body.fileSize, 40));
  if (Number.isFinite(size) && size > PRIVATE_MODEL_MAX_UPLOAD_BYTES) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "validation_error", message: "File exceeds 10MB limit." },
      meta,
    }, { status: 400 });
  }

  if (!env.EVIDENCE_BUCKET || typeof env.EVIDENCE_BUCKET.put !== "function") {
    return publicJson(request, env, {
      ok: false,
      error: {
        code: "upload_storage_not_configured",
        message: "ตอนนี้ระบบอัปโหลดรูปยังไม่พร้อม กรุณาส่งรูปเพิ่มเติมผ่าน Telegram",
      },
      meta,
    }, { status: 503 });
  }

  const key = `sigil/private-model/uploads/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}-${safeEvidenceFilename(filename)}`;
  const expires = Date.now() + 10 * 60 * 1000;
  const secret = toStr(env.LINK_SIGNING_SECRET || env.INTERNAL_TOKEN);
  const signature = await privateModelUploadSignature(secret, key, expires, contentType);

  return publicJson(request, env, {
    ok: true,
    upload_url: privateModelUploadUrl(request, key, expires, contentType, signature),
    file_url: privateModelFileReference(env, key),
    key,
    expires_at: new Date(expires).toISOString(),
    meta,
  });
}

async function handlePrivateModelUploadFile(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  const expires = Number(url.searchParams.get("expires") || "0");
  const contentType = (url.searchParams.get("content_type") || request.headers.get("content-type") || "").toLowerCase();
  const signature = url.searchParams.get("sig") || "";

  if (!PRIVATE_MODEL_ALLOWED_UPLOAD_TYPES.has(contentType)) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "validation_error", message: "Unsupported file type. JPG, PNG, and WEBP are supported." },
      meta,
    }, { status: 400 });
  }

  const valid = await isValidPrivateModelUploadSignature(env, key, expires, contentType, signature);
  if (!valid) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "upload_signature_invalid", message: "Upload URL is invalid or expired." },
      meta,
    }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > PRIVATE_MODEL_MAX_UPLOAD_BYTES) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "validation_error", message: "File exceeds 10MB limit." },
      meta,
    }, { status: 400 });
  }

  if (!env.EVIDENCE_BUCKET || typeof env.EVIDENCE_BUCKET.put !== "function") {
    return publicJson(request, env, {
      ok: false,
      error: {
        code: "upload_storage_not_configured",
        message: "ตอนนี้ระบบอัปโหลดรูปยังไม่พร้อม กรุณาส่งรูปเพิ่มเติมผ่าน Telegram",
      },
      meta,
    }, { status: 503 });
  }

  await env.EVIDENCE_BUCKET.put(key, request.body, {
    httpMetadata: { contentType },
    customMetadata: {
      source: "mmd_apply_private_model",
      handler: "TarT",
    },
  });

  return publicJson(request, env, {
    ok: true,
    file_url: privateModelFileReference(env, key),
    key,
    meta,
  });
}

function publicModelApplicationId(): string {
  return `pub_app_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function publicModelUploadUrl(request: Request, key: string, expires: number, contentType: string, signature: string): string {
  const requestUrl = new URL(request.url);
  const uploadPath = isSigilPath(requestUrl.pathname) ? SIGIL.publicModelUploadFile : PUBLIC.publicModelUploadFile;
  const url = new URL(uploadPath, requestUrl.origin);
  url.searchParams.set("key", key);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("content_type", contentType);
  url.searchParams.set("sig", signature);
  return url.toString();
}

function publicModelAirtableFields(applicationId: string, payload: Record<string, unknown>) {
  const now = new Date().toISOString();
  const requestContext = payload.request_context && typeof payload.request_context === "object"
    ? payload.request_context as Record<string, unknown>
    : {};
  const photoUrl = toStr(payload.photo_url) || toStr(payload.profile_photo_url);
  return compactFields({
    application_id: applicationId,
    status: "submitted",
    review_status: "pending_review",
    nickname: payload.nickname,
    age: payload.age,
    phone: payload.phone,
    telegram_username: payload.telegram_username,
    line_id: payload.line_id,
    application_type: "public_model",
    source: "model_apply_public_model",
    handler: "TarT",
    r2_key: payload.r2_key,
    photo_url: photoUrl,
    payload_json: JSON.stringify(payload),
    summary_json: JSON.stringify({
      application_id: applicationId,
      status: "submitted",
      review_status: "pending_review",
      application_type: "public_model",
      source: "model_apply_public_model",
      privacy_level: "public",
      work_type: "public_model",
      r2_key: payload.r2_key,
    }),
    created_at: toStr(payload.submitted_at) || now,
    submitted_at: payload.submitted_at,
    occupation: payload.occupation,
    location: payload.location,
    height: payload.height,
    weight: payload.weight,
    instagram: payload.instagram,
    intro: payload.intro,
    experience: payload.experience,
    strengths: payload.strengths,
    skills: payload.skills,
    work_type: "public_model",
    privacy_level: "public",
    boundaries: payload.boundaries,
    goal: payload.goal,
    consent: payload.consent,
    page_url: payload.page_url,
    user_agent: payload.user_agent || requestContext.user_agent,
    timezone: payload.timezone,
    language: payload.language,
  });
}

function logPublicModelAirtableFailure(input: {
  applicationId: string;
  table: string;
  error: unknown;
  phase: string;
}) {
  const parsed = parseAirtableError(input.error);
  console.warn(JSON.stringify({
    source: "public_model_apply",
    event: "airtable_write_failed",
    phase: input.phase,
    application_id: input.applicationId,
    airtable_table: input.table,
    airtable_error_code: parsed.code,
    airtable_error_message: parsed.message,
    timestamp: new Date().toISOString(),
  }));
  return parsed;
}

async function writePublicModelApplicationToAirtable(
  env: Env,
  applicationId: string,
  payload: Record<string, unknown>,
): Promise<{ table: string; recordId: string; action: string }> {
  const table = privateModelApplicationsTable(env);
  const fields = publicModelAirtableFields(applicationId, payload);

  let existingId = "";
  try {
    const existing = await findAirtableImportRecords(env, table, "application_id", applicationId);
    existingId = toStr((existing[0] as Record<string, unknown> | undefined)?.id);
  } catch {
    existingId = "";
  }

  const fallbackFields = [
    fields,
    compactFields({
      application_id: fields.application_id,
      status: fields.status,
      review_status: fields.review_status,
      application_type: fields.application_type,
      source: fields.source,
      handler: fields.handler,
      nickname: fields.nickname,
      age: fields.age,
      phone: fields.phone,
      telegram_username: fields.telegram_username,
      line_id: fields.line_id,
      payload_json: fields.payload_json,
      created_at: fields.created_at,
    }),
    compactFields({
      application_id: fields.application_id,
      status: fields.status,
      review_status: fields.review_status,
      nickname: fields.nickname,
      payload_json: fields.payload_json,
    }),
    compactFields({
      application_id: fields.application_id,
      status: fields.status,
      payload_json: fields.payload_json,
    }),
    compactFields({
      application_id: fields.application_id,
      payload_json: fields.payload_json,
    }),
    compactFields({
      application_id: fields.application_id,
      status: fields.status,
    }),
    compactFields({
      application_id: fields.application_id,
    }),
  ];

  let lastError: unknown = null;
  for (const candidate of fallbackFields) {
    if (!Object.keys(candidate).length) continue;
    try {
      if (existingId) {
        const updated = await patchAirtableImportRecordWithFallbacks(env, table, existingId, candidate);
        return { table, recordId: toStr((updated as Record<string, unknown>).id) || existingId, action: "updated" };
      }
      const created = await createAirtableImportRecordWithFallbacks(env, table, candidate);
      return { table, recordId: toStr((created as Record<string, unknown>).id), action: "created" };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return { table, recordId: existingId, action: "skipped_no_fields" };
}

async function storePublicModelApplication(
  env: Env,
  applicationId: string,
  payload: Record<string, unknown>,
): Promise<PrivateModelStorageResult> {
  const key = `sigil/public-model/applications/${applicationId}.json`;
  const payloadWithStorage = {
    ...payload,
    r2_key: key,
    photo_url: toStr(payload.photo_url) || toStr(payload.profile_photo_url),
  };
  let r2Stored = false;
  let r2Error = "";
  let airtableRecordId = "";
  let airtableTable = privateModelApplicationsTable(env);
  const warnings: PrivateModelAirtableWarning[] = [];

  if (env.EVIDENCE_BUCKET && typeof env.EVIDENCE_BUCKET.put === "function") {
    try {
      await env.EVIDENCE_BUCKET.put(key, JSON.stringify(payloadWithStorage, null, 2), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: {
          application_id: applicationId,
          application_type: "public_model",
          handler: "TarT",
        },
      });
      r2Stored = true;
    } catch (error) {
      r2Error = error instanceof Error ? error.message : String(error);
    }
  } else {
    r2Error = "EVIDENCE_BUCKET is not configured";
  }

  if (env.AIRTABLE_API_KEY && env.AIRTABLE_BASE_ID) {
    try {
      const record = await writePublicModelApplicationToAirtable(env, applicationId, payloadWithStorage);
      airtableTable = record.table;
      airtableRecordId = record.recordId;
    } catch (error) {
      const parsed = logPublicModelAirtableFailure({
        applicationId,
        table: airtableTable,
        error,
        phase: "submit",
      });
      warnings.push({
        target: "airtable",
        code: parsed.code,
        message: parsed.message,
        configured_table: airtableTable,
      });
    }
  } else {
    warnings.push({
      target: "airtable",
      code: "AIRTABLE_NOT_CONFIGURED",
      message: "AIRTABLE_API_KEY or AIRTABLE_BASE_ID is not configured",
      configured_table: airtableTable,
    });
  }

  const storedPayload = {
    ...payloadWithStorage,
    storage: {
      r2: r2Stored,
      r2_key: r2Stored ? key : "",
      r2_error: r2Error,
      airtable: Boolean(airtableRecordId),
      airtable_record_id: airtableRecordId,
      airtable_table: airtableTable,
    },
    warnings,
  };

  if (r2Stored && env.EVIDENCE_BUCKET && typeof env.EVIDENCE_BUCKET.put === "function") {
    await env.EVIDENCE_BUCKET.put(key, JSON.stringify(storedPayload, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: {
        application_id: applicationId,
        application_type: "public_model",
        handler: "TarT",
        airtable_synced: airtableRecordId ? "true" : "false",
      },
    });
  }

  if (!r2Stored && !airtableRecordId) {
    throw new Error(r2Error || "public_model_application_storage_failed");
  }

  return {
    r2: r2Stored,
    ...(r2Stored ? { r2_key: key } : {}),
    airtable: Boolean(airtableRecordId),
    ...(airtableRecordId ? { airtable_record_id: airtableRecordId } : {}),
    airtable_table: airtableTable,
    warnings,
  };
}

async function handlePublicModelApply(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (!buildCorsHeaders(request, env).has("access-control-allow-origin")) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "origin_not_allowed", message: "Origin is not allowed" },
      meta,
    }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as PrivateModelApplyBody | null;
  if (!body || typeof body !== "object") {
    return publicJson(request, env, {
      ok: false,
      error: { code: "validation_error", message: "valid JSON payload is required" },
      meta,
    }, { status: 400 });
  }

  if (privateModelText(body.honeypot, 100)) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "submission_rejected", message: "Submission rejected" },
      meta,
    }, { status: 400 });
  }

  const validationErrors = validatePrivateModelApply(body);
  if (validationErrors.length) {
    return publicJson(request, env, {
      ok: false,
      error: {
        code: "validation_error",
        message: validationErrors.join("; "),
        details: { validation_errors: validationErrors },
      },
      meta,
    }, { status: 400 });
  }

  const turnstileToken = privateModelText(body.cf_turnstile_response, 4096);
  if (turnstileToken) {
    const verified = await verifyPrivateModelTurnstile(request, env, turnstileToken);
    if (!verified) {
      return publicJson(request, env, {
        ok: false,
        error: { code: "turnstile_failed", message: "Turnstile verification failed" },
        meta,
      }, { status: 400 });
    }
  }

  const applicationId = publicModelApplicationId();
  const submittedAt = new Date().toISOString();
  const payload = compactFields({
    application_id: applicationId,
    status: "submitted",
    review_status: "pending_review",
    submitted_at: submittedAt,
    application_type: "public_model",
    work_type: "public_model",
    source: "model_apply_public_model",
    privacy_layer: "SIGIL",
    handler: "TarT",
    handler_role: "SIGIL public application concierge",
    channel: privateModelText(body.channel, 60) || "web",
    page_url: privateModelText(body.page_url, 700),
    form_version: privateModelText(body.form_version, 160),
    nickname: privateModelText(body.nickname, 100),
    age: privateModelText(body.age, 8),
    occupation: privateModelText(body.occupation, 160),
    location: privateModelText(body.location, 200),
    height: privateModelText(body.height, 20),
    weight: privateModelText(body.weight, 20),
    phone: privateModelText(body.phone, 40),
    telegram_username: privateModelText(body.telegram_username, 120),
    line_id: privateModelText(body.line_id, 120),
    instagram: privateModelText(body.instagram, 700),
    intro: privateModelLongText(body.intro),
    experience: privateModelLongText(body.experience),
    strengths: privateModelLongText(body.strengths),
    skills: privateModelLongText(body.skills),
    special_awards: privateModelLongText(body.special_awards),
    honours: privateModelLongText(body.honours),
    service_interests: privateModelLongText(body.service_interests),
    public_profile_note: privateModelLongText(body.public_profile_note),
    public_profile_consent: privateModelBool(body.public_profile_consent),
    privacy_level: "public",
    boundaries: privateModelLongText(body.boundaries),
    goal: privateModelLongText(body.goal),
    profile_photo_url: privateModelText(body.profile_photo_url, 1000),
    profile_photo_filename: privateModelText(body.profile_photo_filename, 180),
    profile_photo_size: privateModelText(body.profile_photo_size, 40),
    profile_photo_type: privateModelText(body.profile_photo_type, 120),
    consent: true,
    user_agent: privateModelText(body.user_agent || request.headers.get("user-agent"), 500),
    timezone: privateModelText(body.timezone, 120),
    language: privateModelText(body.language, 80),
    request_context: {
      user_agent: privateModelText(body.user_agent || request.headers.get("user-agent"), 500),
      country: privateModelText(request.headers.get("cf-ipcountry"), 12),
      ip_hash: await shortSha256(privateModelText(request.headers.get("cf-connecting-ip"), 80)),
    },
  });

  let storage: PrivateModelStorageResult;
  try {
    storage = await storePublicModelApplication(env, applicationId, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return publicJson(request, env, {
      ok: false,
      error: { code: "storage_failed", message },
      meta,
    }, { status: 503 });
  }

  return publicJson(request, env, {
    ok: true,
    application_id: applicationId,
    status: "submitted",
    review_status: "pending_review",
    storage: {
      r2: storage.r2,
      airtable: storage.airtable,
    },
    ...(storage.r2_key ? { r2_key: storage.r2_key } : {}),
    ...(storage.airtable_record_id ? { airtable_record_id: storage.airtable_record_id } : {}),
    ...(storage.warnings.length ? { warnings: storage.warnings } : {}),
    meta,
  });
}

async function handlePublicModelUploadUrl(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (!buildCorsHeaders(request, env).has("access-control-allow-origin")) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "origin_not_allowed", message: "Origin is not allowed" },
      meta,
    }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return publicJson(request, env, {
      ok: false,
      error: { code: "validation_error", message: "valid JSON payload is required" },
      meta,
    }, { status: 400 });
  }

  const filename = privateModelText(body.filename, 180) || "public-model-photo";
  const contentType = privateModelText(body.content_type || body.contentType, 120).toLowerCase();
  if (!PRIVATE_MODEL_ALLOWED_UPLOAD_TYPES.has(contentType)) {
    return publicJson(request, env, {
      ok: false,
      error: {
        code: "validation_error",
        message: "Unsupported file type. JPG, PNG, and WEBP are supported.",
      },
      meta,
    }, { status: 400 });
  }

  const size = Number(privateModelText(body.size || body.file_size || body.fileSize, 40));
  if (Number.isFinite(size) && size > PRIVATE_MODEL_MAX_UPLOAD_BYTES) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "validation_error", message: "File exceeds 10MB limit." },
      meta,
    }, { status: 400 });
  }

  if (!env.EVIDENCE_BUCKET || typeof env.EVIDENCE_BUCKET.put !== "function") {
    return publicJson(request, env, {
      ok: false,
      error: {
        code: "upload_storage_not_configured",
        message: "ตอนนี้ระบบอัปโหลดรูปยังไม่พร้อม กรุณาส่งรูปเพิ่มเติมผ่าน Telegram",
      },
      meta,
    }, { status: 503 });
  }

  const key = `sigil/public-model/uploads/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}-${safeEvidenceFilename(filename)}`;
  const expires = Date.now() + 10 * 60 * 1000;
  const secret = toStr(env.LINK_SIGNING_SECRET || env.INTERNAL_TOKEN);
  const signature = await privateModelUploadSignature(secret, key, expires, contentType);

  return publicJson(request, env, {
    ok: true,
    upload_url: publicModelUploadUrl(request, key, expires, contentType, signature),
    file_url: privateModelFileReference(env, key),
    key,
    expires_at: new Date(expires).toISOString(),
    meta,
  });
}

async function handlePublicModelUploadFile(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  const expires = Number(url.searchParams.get("expires") || "0");
  const contentType = (url.searchParams.get("content_type") || request.headers.get("content-type") || "").toLowerCase();
  const signature = url.searchParams.get("sig") || "";

  if (!key.startsWith("sigil/public-model/uploads/")) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "upload_signature_invalid", message: "Upload URL is invalid or expired." },
      meta,
    }, { status: 403 });
  }

  if (!PRIVATE_MODEL_ALLOWED_UPLOAD_TYPES.has(contentType)) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "validation_error", message: "Unsupported file type. JPG, PNG, and WEBP are supported." },
      meta,
    }, { status: 400 });
  }

  const valid = await isValidPrivateModelUploadSignature(env, key, expires, contentType, signature);
  if (!valid) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "upload_signature_invalid", message: "Upload URL is invalid or expired." },
      meta,
    }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > PRIVATE_MODEL_MAX_UPLOAD_BYTES) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "validation_error", message: "File exceeds 10MB limit." },
      meta,
    }, { status: 400 });
  }

  if (!env.EVIDENCE_BUCKET || typeof env.EVIDENCE_BUCKET.put !== "function") {
    return publicJson(request, env, {
      ok: false,
      error: {
        code: "upload_storage_not_configured",
        message: "ตอนนี้ระบบอัปโหลดรูปยังไม่พร้อม กรุณาส่งรูปเพิ่มเติมผ่าน Telegram",
      },
      meta,
    }, { status: 503 });
  }

  await env.EVIDENCE_BUCKET.put(key, request.body, {
    httpMetadata: { contentType },
    customMetadata: {
      source: "mmd_apply_public_model",
      handler: "TarT",
    },
  });

  return publicJson(request, env, {
    ok: true,
    file_url: privateModelFileReference(env, key),
    key,
    meta,
  });
}

async function readPrivateModelApplicationFromR2(env: Env, key: string): Promise<Record<string, unknown> | null> {
  if (!env.EVIDENCE_BUCKET || typeof env.EVIDENCE_BUCKET.get !== "function") return null;
  const object = await env.EVIDENCE_BUCKET.get(key);
  if (!object) return null;
  const text = await object.text();
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function markPrivateModelApplicationReplayResult(
  env: Env,
  key: string,
  payload: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  if (!env.EVIDENCE_BUCKET || typeof env.EVIDENCE_BUCKET.put !== "function") return;
  const nextPayload = {
    ...payload,
    replay: {
      ...((payload.replay && typeof payload.replay === "object") ? payload.replay as Record<string, unknown> : {}),
      airtable: result,
      replayed_at: new Date().toISOString(),
    },
  };
  await env.EVIDENCE_BUCKET.put(key, JSON.stringify(nextPayload, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: {
      application_id: toStr(payload.application_id),
      application_type: "private_model",
      handler: "TarT",
      airtable_synced: toStr(result.airtable_record_id) ? "true" : "false",
    },
  });
}

async function handlePrivateModelReplayAirtable(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  if (!env.EVIDENCE_BUCKET || typeof env.EVIDENCE_BUCKET.list !== "function") {
    return json({
      ok: false,
      error: {
        code: "R2_NOT_CONFIGURED",
        message: "EVIDENCE_BUCKET R2 binding is not configured",
      },
      meta,
    }, { status: 503 });
  }

  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return json({
      ok: false,
      error: {
        code: "AIRTABLE_NOT_CONFIGURED",
        message: "AIRTABLE_API_KEY or AIRTABLE_BASE_ID is not configured",
      },
      meta,
    }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const limit = Math.min(Math.max(Number(body.limit || 25), 1), 100);
  const cursor = privateModelText(body.cursor, 300);
  const dryRun = privateModelBool(body.dry_run);
  const prefix = privateModelText(body.prefix, 300) || "sigil/private-model/applications/";
  const listing = await env.EVIDENCE_BUCKET.list({
    prefix,
    limit,
    ...(cursor ? { cursor } : {}),
  });
  const objects = Array.isArray(listing.objects) ? listing.objects : [];
  const results: Array<Record<string, unknown>> = [];

  for (const object of objects) {
    const key = toStr(object.key);
    if (!key.endsWith(".json")) continue;

    const payload = await readPrivateModelApplicationFromR2(env, key);
    const applicationId = toStr(payload?.application_id) || key.split("/").pop()?.replace(/\.json$/, "") || "";
    if (!payload || !applicationId) {
      results.push({ key, ok: false, error_code: "INVALID_R2_PAYLOAD" });
      continue;
    }

    if (dryRun) {
      results.push({
        key,
        application_id: applicationId,
        ok: true,
        dry_run: true,
        airtable_table: privateModelApplicationsTable(env),
      });
      continue;
    }

    try {
      const airtable = await writePrivateModelApplicationToAirtable(env, applicationId, payload);
      const result = {
        key,
        application_id: applicationId,
        ok: true,
        airtable_record_id: airtable.recordId,
        airtable_table: airtable.table,
        action: airtable.action,
      };
      results.push(result);
      await markPrivateModelApplicationReplayResult(env, key, payload, result);
    } catch (error) {
      const parsed = logPrivateModelAirtableFailure({
        applicationId,
        table: privateModelApplicationsTable(env),
        error,
        phase: "replay",
      });
      results.push({
        key,
        application_id: applicationId,
        ok: false,
        airtable_table: privateModelApplicationsTable(env),
        error_code: parsed.code,
        error_message: parsed.message,
      });
    }
  }

  const synced = results.filter((result) => result.ok && result.airtable_record_id).length;
  const failed = results.filter((result) => result.ok === false).length;
  return json({
    ok: failed === 0,
    dry_run: dryRun,
    source: "private_model_apply",
    storage_prefix: prefix,
    airtable_table: privateModelApplicationsTable(env),
    scanned: objects.length,
    synced,
    failed,
    results,
    cursor: listing.truncated ? listing.cursor || "" : "",
    truncated: Boolean(listing.truncated),
    meta,
  }, { status: failed ? 207 : 200 });
}

async function airtableMetadataTables(env: Env): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${env.AIRTABLE_BASE_ID}/tables`, {
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const data = (() => {
    try {
      return JSON.parse(text) as { tables?: Array<Record<string, unknown>> };
    } catch {
      return { raw: text } as Record<string, unknown>;
    }
  })();

  if (!response.ok) {
    throw new Error(`Airtable metadata ${response.status}: ${JSON.stringify(data)}`);
  }

  return Array.isArray(data.tables) ? data.tables : [];
}

function privateModelTableCandidate(table: Record<string, unknown>): boolean {
  const name = privateModelText(table.name, 200).toLowerCase();
  const id = privateModelText(table.id, 80);
  const fields = Array.isArray(table.fields) ? table.fields as Array<Record<string, unknown>> : [];
  const fieldNames = fields.map((field) => privateModelText(field.name, 120).toLowerCase());
  return Boolean(
    id &&
    (
      (name.includes("private") && name.includes("model") && name.includes("application")) ||
      (fieldNames.includes("application_id") && fieldNames.includes("review_status") && fieldNames.includes("payload_json"))
    )
  );
}

async function handlePrivateModelAirtableCheck(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const configuredTable = privateModelApplicationsTable(env);
  const explicitTable = privateModelText(body.table_id || body.table || "", 120);
  const tableToCheck = explicitTable || configuredTable;
  const writeTest = privateModelBool(body.write_test);
  const result: Record<string, unknown> = {
    ok: true,
    source: "private_model_apply",
    base_id: env.AIRTABLE_BASE_ID,
    configured_table: configuredTable,
    checked_table: tableToCheck,
    has_private_model_binding: Boolean(env.AIRTABLE_TABLE_PRIVATE_MODEL_APPLICATIONS),
    checks: {},
    meta,
  };

  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return json({
      ...result,
      ok: false,
      error: {
        code: "AIRTABLE_NOT_CONFIGURED",
        message: "AIRTABLE_API_KEY or AIRTABLE_BASE_ID is not configured",
      },
    }, { status: 503 });
  }

  try {
    await airtableImportRequest(env, tableToCheck, {
      query: { maxRecords: "1" },
    });
    (result.checks as Record<string, unknown>).read = { ok: true };
  } catch (error) {
    const parsed = parseAirtableError(error);
    (result.checks as Record<string, unknown>).read = {
      ok: false,
      code: parsed.code,
      message: parsed.message,
    };
  }

  try {
    const tables = await airtableMetadataTables(env);
    const candidates = tables
      .filter(privateModelTableCandidate)
      .map((table) => ({
        id: table.id,
        name: table.name,
        fields: (Array.isArray(table.fields) ? table.fields as Array<Record<string, unknown>> : [])
          .map((field) => field.name)
          .filter(Boolean),
      }));
    (result.checks as Record<string, unknown>).metadata = {
      ok: true,
      table_count: tables.length,
      private_model_application_candidates: candidates,
    };
  } catch (error) {
    const parsed = parseAirtableError(error);
    (result.checks as Record<string, unknown>).metadata = {
      ok: false,
      code: parsed.code,
      message: parsed.message,
    };
  }

  if (writeTest) {
    const testApplicationId = `pm_app_airtable_check_${Date.now().toString(36)}`;
    const payload = {
      application_id: testApplicationId,
      status: "submitted",
      review_status: "pending_review",
      source: "model_apply_private_model",
      handler: "TarT",
      submitted_at: new Date().toISOString(),
      nickname: "Airtable Config Check",
      age: "25",
      payload_json: { smoke: true },
    };
    try {
      const fields = privateModelAirtableFields(testApplicationId, payload);
      const created = await createAirtableImportRecordWithFallbacks(env, tableToCheck, fields);
      (result.checks as Record<string, unknown>).write = {
        ok: true,
        airtable_record_id: toStr((created as Record<string, unknown>).id),
      };
    } catch (error) {
      const parsed = logPrivateModelAirtableFailure({
        applicationId: testApplicationId,
        table: tableToCheck,
        error,
        phase: "airtable_check",
      });
      (result.checks as Record<string, unknown>).write = {
        ok: false,
        code: parsed.code,
        message: parsed.message,
      };
    }
  }

  return json(result);
}

async function handleList(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");

  let records = readSeedRecords();
  let next_cursor: string | null = null;
  let source: "seed" | "airtable" = "seed";

  if (canReadAirtable(env)) {
    try {
      const airtable = await listRecordsFromAirtable(env, cursor);
      records = airtable.records;
      next_cursor = airtable.next_cursor;
      source = "airtable";
    } catch (error) {
      console.warn("immigrate-worker list fallback to seed", error);
    }
  }

  records = applyFilters(records, url);

  const body: LineInboxListResponse = {
    ok: true,
    data: {
      records,
      next_cursor,
      source,
    },
    meta,
  };

  return json(body);
}

async function handleRefresh(request: Request): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json()) as Partial<RefreshStatusRequest>;
  const migrationIds = Array.isArray(payload.migration_ids) ? payload.migration_ids : [];

  if (!migrationIds.length) {
    return badRequest("migration_ids is required", meta, { field: "migration_ids" });
  }

  const refreshed = readSeedRecords()
    .filter((record) => migrationIds.includes(record.migration_id))
    .map(refreshRecord);

  const body: RefreshStatusResponse = {
    ok: true,
    data: {
      updated: refreshed.length,
      records: refreshed,
    },
    meta,
  };

  return json(body);
}

async function handleSync(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json()) as Partial<SyncAirtableRequest>;
  const migrationIds = Array.isArray(payload.migration_ids) ? payload.migration_ids : [];

  if (!migrationIds.length) {
    return badRequest("migration_ids is required", meta, { field: "migration_ids" });
  }

  const records = readSeedRecords()
    .filter((record) => migrationIds.includes(record.migration_id))
    .map((record) => ({ ...record, migration_status: "synced_to_airtable" as const }));

  const result = await syncRecordsToAirtable(env, records);

  const body: SyncAirtableResponse = {
    ok: true,
    data: {
      synced: result.results.length,
      mode: result.mode,
      results: result.results,
    },
    meta,
  };

  return json(body);
}

async function handleIntake(request: Request): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as ImmigrationIntakeRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid intake payload is required", meta);
  }

  if (!toStr(payload.notes?.manual_note_raw)) {
    return badRequest("notes.manual_note_raw is required", meta, {
      field: "notes.manual_note_raw",
    });
  }

  const record = buildPromotionRecord(payload, {
    promotion_status: "archived_raw",
  });

  const body: ImmigrationIntakeResponse = {
    ok: true,
    data: record,
    meta,
  };

  return json(body);
}

async function handleLinePreview(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as LineClientIntakeRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid LINE preview payload is required", meta);
  }

  const preview = await previewLineClientUpsert(env, payload);
  const body: LineClientPreviewResponse = {
    ok: true,
    data: preview,
    meta,
  };

  return json(body);
}

const PER_AI_REPLY_COPY = `สวัสดีครับ ผมคือ Per AI ของ MMD Privé ครับ
ผมช่วยรับเรื่อง เช็กข้อมูลเบื้องต้นจากระบบ และส่งให้ Per ดูได้ถ้าเป็นเคสที่ต้องดูเป็นพิเศษครับ

ตอนนี้พี่อยากให้ผมช่วยเรื่องไหนก่อนครับ
1) สมัครสมาชิก / ต่ออายุ
2) เช็กแพ็กเกจหรือสถานะสมาชิก
3) สอบถามบริการหรือนายแบบ
4) ส่งรูปหรือโปรไฟล์คนที่อยากให้ MMD พิจารณา
5) ให้ Per ดูเป็นเคสส่วนตัว

พิมพ์เล่าได้เลยครับ เดี๋ยวผมช่วยจัดเรื่องให้เป็นขั้นตอนครับ`;

function normalizeLineIntentText(value: unknown): string {
  return toStr(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[._\-]+/g, " ")
    .replace(/[^a-z0-9ก-๙\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTalkToPerAi(text: unknown): boolean {
  const compact = normalizeLineIntentText(text).replace(/\s+/g, "");
  return (
    compact.includes("คุยกับperai") ||
    compact.includes("คุยกับper") ||
    compact.includes("คุยกับเปอร์") ||
    compact.includes("ขอคุยกับperai") ||
    compact.includes("ขอคุยกับper") ||
    compact.includes("ขอคุยกับเปอร์") ||
    compact === "perai" ||
    compact.includes("perai")
  );
}

function inferLineWebhookIntent(text: unknown): string {
  if (isTalkToPerAi(text)) return "talk_to_per_ai";
  return "line_message";
}

function lineAutoReplyEnabled(env: Env): boolean {
  return String(env.LINE_AUTO_REPLY_ENABLED ?? "true").toLowerCase() !== "false";
}

function getLineWebhookText(event: Record<string, unknown>): string {
  const message = event.message && typeof event.message === "object"
    ? event.message as Record<string, unknown>
    : {};
  return event.type === "message" && message.type === "text" ? toStr(message.text) : "";
}

function getLineWebhookReplyToken(event: Record<string, unknown>): string {
  return toStr(event.replyToken);
}

function getLineWebhookUserId(event: Record<string, unknown>): string {
  const source = event.source && typeof event.source === "object"
    ? event.source as Record<string, unknown>
    : {};
  return toStr(source.userId || source.groupId || source.roomId);
}

function getLineWebhookMessageId(event: Record<string, unknown>): string {
  const message = event.message && typeof event.message === "object"
    ? event.message as Record<string, unknown>
    : {};
  return toStr(message.id || event.webhookEventId) || `evt_${crypto.randomUUID()}`;
}

function lineConsoleInboxTable(env: Env): string {
  return env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e";
}

async function verifyLineWebhookSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  if (!rawBody || !signature || !secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const generated = arrayBufferToBase64(signed);
  return timingSafeStringEqual(generated, signature);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function fetchLineProfile(env: Env, userId: string): Promise<Record<string, unknown> | null> {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !userId || userId.startsWith("C") || userId.startsWith("R")) {
    return null;
  }
  const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
  });
  if (!response.ok) return null;
  return await response.json().catch(() => null) as Record<string, unknown> | null;
}

async function writeLineWebhookTrace(
  env: Env,
  event: Record<string, unknown>,
  input: {
    text: string;
    intent: string;
    profile: Record<string, unknown> | null;
  },
): Promise<{ ok: boolean; id: string; deduped: boolean; error?: string }> {
  const eventId = getLineWebhookMessageId(event);
  const inboxId = `line_${eventId}`;
  const lineUserId = getLineWebhookUserId(event);
  const now = new Date().toISOString();
  const message = event.message && typeof event.message === "object"
    ? event.message as Record<string, unknown>
    : {};

  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return { ok: false, id: inboxId, deduped: false, error: "airtable_not_configured" };
  }

  try {
    const existing = await airtableImportRequest(env, lineConsoleInboxTable(env), {
      query: {
        maxRecords: "1",
        filterByFormula: `{inbox_id}="${encodeFormulaValue(inboxId)}"`,
      },
    });
    const existingRecord = Array.isArray(existing.records) ? existing.records[0] as { id?: string } | undefined : undefined;
    if (existingRecord?.id) {
      return { ok: true, id: existingRecord.id, deduped: true };
    }

    const record = await airtableImportRequest(env, lineConsoleInboxTable(env), {
      method: "POST",
      body: {
        records: [
          {
            fields: compactFields({
              inbox_id: inboxId,
              created_by: "cloudflare-line-webhook",
              source: "LINE_OFC",
              intent: input.intent,
              member_name: toStr(input.profile?.displayName),
              member_phone: "",
              line_user_id: lineUserId,
              line_id: eventId,
              legacy_tags: [
                "line_webhook",
                "production:mmdbkk_webhooks_line",
                event.type ? `event:${toStr(event.type)}` : "",
                message.type ? `message:${toStr(message.type)}` : "",
                input.intent ? `intent:${input.intent}` : "",
              ].filter(Boolean).join(", "),
              admin_note: `LINE webhook inbound trace\nIntent: ${input.intent}\nMessage: ${input.text || "-"}`,
              payload_json: JSON.stringify({
                source_channel: "line",
                production_route: "https://mmdbkk.com/webhooks/line",
                source_user_id: lineUserId,
                source_message_id: eventId,
                received_at: now,
                raw_text: input.text,
                parsed_intent: input.intent,
                event_type: toStr(event.type),
                message_type: toStr(message.type),
                profile: input.profile ? { displayName: toStr(input.profile.displayName) } : null,
              }, null, 2),
              status: "new",
            }),
          },
        ],
      },
    });
    const created = Array.isArray(record.records) ? record.records[0] as { id?: string } | undefined : undefined;
    return { ok: true, id: toStr(created?.id || inboxId), deduped: false };
  } catch (error) {
    return {
      ok: false,
      id: inboxId,
      deduped: false,
      error: error instanceof Error ? error.message : "airtable_trace_failed",
    };
  }
}

async function replyLineWebhook(env: Env, replyToken: string, text: string): Promise<boolean> {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !replyToken || !text) return false;
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(`line_reply_failed:${response.status}${responseText ? `:${responseText.slice(0, 240)}` : ""}`);
  }
  return true;
}

async function handleLineWebhook(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  if (request.method === "GET" || request.method === "HEAD") {
    return json({ ok: true, service: "immigrate-worker", route: CANONICAL.lineWebhook, meta });
  }
  if (request.method === "OPTIONS") {
    return withCors(request, env, new Response(null, { status: 204 }));
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, meta }, { status: 405 });
  }
  if (!env.LINE_CHANNEL_SECRET) {
    return json({ ok: false, error: { code: "LINE_SECRET_NOT_CONFIGURED", message: "LINE_CHANNEL_SECRET is not configured" }, meta }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") || "";
  if (!(await verifyLineWebhookSignature(rawBody, signature, env.LINE_CHANNEL_SECRET))) {
    return json({ ok: false, error: { code: "INVALID_LINE_SIGNATURE", message: "Invalid LINE signature" }, meta }, { status: 401 });
  }

  let payload: { events?: unknown[] };
  try {
    payload = JSON.parse(rawBody || "{}") as { events?: unknown[] };
  } catch {
    return json({ ok: false, error: { code: "INVALID_JSON", message: "Invalid JSON body" }, meta }, { status: 400 });
  }
  const events = Array.isArray(payload.events) ? payload.events : [];
  const processed = [];

  for (const item of events) {
    const event = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const text = getLineWebhookText(event);
    const intent = inferLineWebhookIntent(text);
    const profile = await fetchLineProfile(env, getLineWebhookUserId(event));
    const trace = await writeLineWebhookTrace(env, event, { text, intent, profile });
    let replied = false;
    let reply_error = "";

    if (!trace.deduped && lineAutoReplyEnabled(env) && intent === "talk_to_per_ai") {
      try {
        replied = await replyLineWebhook(env, getLineWebhookReplyToken(event), PER_AI_REPLY_COPY);
      } catch (error) {
        reply_error = error instanceof Error ? error.message : "line_reply_failed";
      }
    }

    processed.push({
      intent,
      trace_ok: trace.ok,
      trace_id: trace.id,
      trace_deduped: trace.deduped,
      trace_error: trace.error || "",
      replied,
      reply_error,
    });
  }

  return json({ ok: true, processed, meta });
}

async function promoteLineClientAfterIntake(
  env: Env,
  payload: LineClientIntakeRequest,
  intakeResult: Awaited<ReturnType<typeof intakeLineClientUpsert>>,
) {
  if (!env.ADMIN_WORKER_BASE_URL) {
    return {
      attempted: false,
      ok: false,
      member_id: "",
      promotion_status: "needs_manual_review",
      created_new_member: false,
      error: "missing_ADMIN_WORKER_BASE_URL",
    };
  }

  const promotionPayload = {
    immigration_id: intakeResult.immigration_id,
    source_channel: "line",
    intent: "contact_import",
    identity: {
      member_id: toStr(payload.memberstack_id),
      line_id: toStr(payload.line_id || payload.identity?.line_id),
      line_user_id: toStr(payload.line_user_id || payload.identity?.line_user_id),
      full_name: toStr(payload.display_name || payload.identity?.display_name || payload.nickname),
      phone: toStr(payload.member_phone || payload.phone || payload.identity?.member_phone || payload.identity?.phone),
    },
    membership: {
      current_tier: "",
      target_tier: "",
    },
    notes: {
      manual_note_raw: toStr(payload.manual_note || payload.notes?.manual_note || "LINE legacy identity intake"),
      operator_summary: toStr(payload.operator_summary || payload.notes?.operator_summary),
    },
    payload_json: {
      ...(payload.payload_json && typeof payload.payload_json === "object" ? payload.payload_json : {}),
      ...(payload.original_payload && typeof payload.original_payload === "object" ? payload.original_payload : {}),
      email: toStr(payload.member_email || payload.email || payload.identity?.member_email || payload.identity?.email),
      member_email: toStr(payload.member_email || payload.email || payload.identity?.member_email || payload.identity?.email),
      phone: toStr(payload.member_phone || payload.phone || payload.identity?.member_phone || payload.identity?.phone),
      member_phone: toStr(payload.member_phone || payload.phone || payload.identity?.member_phone || payload.identity?.phone),
      display_name: toStr(payload.display_name || payload.identity?.display_name),
      nickname: toStr(payload.nickname || payload.identity?.nickname),
      line_user_id: toStr(payload.line_user_id || payload.identity?.line_user_id),
      line_id: toStr(payload.line_id || payload.identity?.line_id),
      immigration_id: intakeResult.immigration_id,
    },
    service_history_summary: "",
    promotion_policy: {
      create_if_missing: true,
      overwrite_if_exists: false,
      archive_raw_notes: true,
    },
  };

  const promotePath = "/v1/admin/members/promote-immigration";
  const promoteUrl = env.ADMIN_WORKER_BASE_URL
    ? `${env.ADMIN_WORKER_BASE_URL.replace(/\/+$/, "")}${promotePath}`
    : promotePath;
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.INTERNAL_TOKEN}`,
    },
    body: JSON.stringify(promotionPayload),
  };
  const response = env.ADMIN_WORKER
    ? await env.ADMIN_WORKER.fetch(
        new Request(`https://admin-worker.internal${promotePath}`, requestInit),
      )
    : await fetch(promoteUrl, requestInit);

  const responseText = await response.text();
  const responseJson = (() => {
    try {
      return JSON.parse(responseText) as
        | { data?: { member_id?: string; promotion_status?: string; created_new_member?: boolean }; error?: unknown }
        | null;
    } catch {
      return null;
    }
  })() as
    | { data?: { member_id?: string; promotion_status?: string; created_new_member?: boolean }; error?: unknown }
    | null;

  if (!response.ok) {
    const responseSnippet = toStr(responseText).slice(0, 240);
    return {
      attempted: true,
      ok: false,
      member_id: "",
      promotion_status: "promotion_failed",
      created_new_member: false,
      error:
        toStr((responseJson as { error?: { message?: string } } | null)?.error?.message) ||
        toStr((responseJson as { error?: string } | null)?.error) ||
        `promotion_http_${response.status} via ${promoteUrl}${responseSnippet ? ` :: ${responseSnippet}` : ""}`,
    };
  }

  const promotedMemberId = toStr(responseJson?.data?.member_id);
  if (promotedMemberId && intakeResult.client.airtable_record_id) {
    const patchedClient = await patchClientMemberstackId(
      env,
      intakeResult.client.airtable_record_id,
      promotedMemberId,
    );

    intakeResult.client.fields = {
      ...intakeResult.client.fields,
      ...(patchedClient.fields || {}),
    };
  }

  return {
    attempted: true,
    ok: true,
    member_id: promotedMemberId,
    promotion_status: toStr(responseJson?.data?.promotion_status) || "promoted",
    created_new_member: Boolean(responseJson?.data?.created_new_member),
  };
}

async function createLineLinksAfterPromotion(
  env: Env,
  payload: LineClientIntakeRequest,
  intakeResult: Awaited<ReturnType<typeof intakeLineClientUpsert>>,
  promotion: {
    attempted: boolean;
    ok: boolean;
    member_id: string;
  } | null,
) {
  if (!promotion?.ok || !toStr(promotion.member_id)) {
    return null;
  }

  return await buildLinksBundle(env, {
    immigration_id: intakeResult.immigration_id,
    display_name: toStr(payload.display_name || payload.identity?.display_name || payload.nickname),
    email: toStr(payload.member_email || payload.email || payload.identity?.member_email || payload.identity?.email).toLowerCase(),
    line_user_id: toStr(payload.line_user_id || payload.identity?.line_user_id),
    memberstack_id: toStr(promotion.member_id),
    model_name: toStr(payload.model_name),
    model_record_id: toStr(payload.model_record_id),
    expires_in_hours: Number(payload.expires_in_hours || 24 * 7),
  });
}

async function createConfirmLinksAfterCreateJob(
  env: Env,
  payload: CreateJobRequest,
  intakeResult: Awaited<ReturnType<typeof intakeLineClientUpsert>>,
): Promise<{
  attempted: boolean;
  ok: boolean;
  session_id?: string;
  payment_ref?: string;
  customer_confirmation_url?: string;
  model_confirmation_url?: string;
  error?: string;
}> {
  const upstreamUrl = toStr(env.CREATE_LINKS_URL);
  if (!upstreamUrl) {
    return {
      attempted: false,
      ok: false,
      error: "missing_CREATE_LINKS_URL",
    };
  }

  const clientName =
    toStr(payload.display_name || payload.identity?.display_name || payload.nickname) ||
    toStr(payload.email) ||
    toStr(payload.line_user_id) ||
    intakeResult.immigration_id;
  const modelName = toStr(payload.model_name);
  const jobType = toStr(payload.job_type || payload.payload_json?.job_type);
  const jobDate = toStr(payload.job_date || payload.payload_json?.job_date);
  const startTime = toStr(payload.start_time || payload.payload_json?.start_time);
  const endTime = toStr(payload.end_time || payload.payload_json?.end_time);
  const locationName = toStr(payload.location_name || payload.payload_json?.location_name);
  const amountThb = toNum(payload.amount_thb ?? payload.payload_json?.amount_thb);

  if (!clientName || !modelName || !jobType || !jobDate || !startTime || !endTime || !locationName || !amountThb || amountThb <= 0) {
    return {
      attempted: false,
      ok: false,
      error: "missing_booking_fields",
    };
  }

  const requestBody = {
    session_id: toStr(payload.session_id) || intakeResult.immigration_id,
    payment_ref: toStr(payload.payment_ref),
    client_name: clientName,
    model_name: modelName,
    job_type: jobType,
    job_date: jobDate,
    start_time: startTime,
    end_time: endTime,
    location_name: locationName,
    google_map_url: toStr(payload.google_map_url || payload.payload_json?.google_map_url),
    amount_thb: amountThb,
    pay_model_thb: toNum(payload.pay_model_thb ?? payload.payload_json?.pay_model_thb) ?? undefined,
    payment_type: toStr(payload.payment_type || payload.payload_json?.payment_type || "deposit"),
    payment_method: toStr(payload.payment_method || payload.payload_json?.payment_method || "promptpay"),
    confirm_page: "/pay",
    model_confirm_page: "/model/console",
    note:
      toStr(payload.booking_note) ||
      toStr(payload.payload_json?.booking_note) ||
      toStr(payload.manual_note_raw) ||
      toStr(payload.manual_note) ||
      toStr(payload.notes?.manual_note),
  };

  try {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const text = await response.text();
    const responseJson = (() => {
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        return null;
      }
    })();

    if (!response.ok) {
      return {
        attempted: true,
        ok: false,
        error:
          toStr(responseJson?.error) ||
          `confirm_links_http_${response.status}`,
      };
    }

    return {
      attempted: true,
      ok: Boolean(
        toStr(responseJson?.customer_confirmation_url) &&
        toStr(responseJson?.model_confirmation_url),
      ),
      session_id: toStr(responseJson?.session_id) || requestBody.session_id,
      payment_ref: toStr(responseJson?.payment_ref) || requestBody.payment_ref,
      customer_confirmation_url: toStr(responseJson?.customer_confirmation_url),
      model_confirmation_url: toStr(responseJson?.model_confirmation_url),
      error:
        toStr(responseJson?.customer_confirmation_url) &&
        toStr(responseJson?.model_confirmation_url)
          ? undefined
          : "missing_confirmation_urls",
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : "confirm_links_failed",
    };
  }
}

async function notifyTelegramForLineIntake(
  env: Env,
  payload: LineClientIntakeRequest,
  promotion: {
    attempted: boolean;
    ok: boolean;
    member_id: string;
  } | null,
  links: Awaited<ReturnType<typeof buildLinksBundle>> | null,
) {
  if (payload.notify_telegram === false) {
    return {
      attempted: false,
      ok: false,
      error: "telegram_disabled_by_payload",
    };
  }

  if (!promotion?.ok || !links) {
    return {
      attempted: false,
      ok: false,
      error: "missing_promotion_or_links",
    };
  }

  if (!env.ADMIN_WORKER_BASE_URL && !env.ADMIN_WORKER) {
    return {
      attempted: false,
      ok: false,
      error: "missing_admin_worker_binding",
    };
  }

  const lineUserId = toStr(payload.line_user_id || payload.identity?.line_user_id);
  const displayName = toStr(payload.display_name || payload.identity?.display_name || payload.nickname) || "Client";
  const modelName = toStr(payload.model_name) || `model_${links.immigration_id.slice(-6)}`;
  const intakeSource = toStr(payload.payload_json?.source_channel || payload.payload_json?.intake_source).toLowerCase();
  const isRenewalIntake = intakeSource === "renewal" || intakeSource === "renewal_web"
    || Boolean(toStr(payload.payload_json?.renewal_source_page));
  const proofAttached = toBool(payload.payload_json?.proof_attached) || Boolean(toStr(payload.payload_json?.proof_filename));
  const proofFilename = toStr(payload.payload_json?.proof_filename);
  const proofMimeType = toStr(payload.payload_json?.proof_mime_type);
  const proofSize = toNum(payload.payload_json?.proof_size) || 0;
  const proofBase64Present = toBool(payload.payload_json?.proof_image_base64_present);
  const proofSource = toStr(payload.payload_json?.proof_source) || "oldProof";
  const targetPackageLabel = toStr(payload.payload_json?.target_package_label);
  const targetPackage = toStr(payload.payload_json?.target_package);
  const paymentMethodLabel = toStr(payload.payload_json?.payment_method_label);
  const expiryRule = toStr(payload.payload_json?.membership_expiry_rule);
  const expiryReason = toStr(payload.payload_json?.expiry_extension_reason);
  const pointsBalance = payload.payload_json?.points_balance;
  const pointsRequired = payload.payload_json?.points_required;
  const pointsShortfall = payload.payload_json?.points_shortfall;
  const lines = [
    isRenewalIntake ? "<b>RENEWAL INTAKE PROMOTED</b>" : "<b>LINE INTAKE PROMOTED</b>",
    `Client: <b>${escapeHtml(displayName)}</b>`,
    `Model: <b>${escapeHtml(modelName)}</b>`,
    `Member ID: <code>${escapeHtml(toStr(promotion.member_id))}</code>`,
    !isRenewalIntake && lineUserId ? `LINE User ID: <code>${escapeHtml(lineUserId)}</code>` : "",
    `Immigration ID: <code>${escapeHtml(links.immigration_id)}</code>`,
    isRenewalIntake && targetPackageLabel ? `Target Package: <b>${escapeHtml(targetPackageLabel)}</b>` : "",
    isRenewalIntake && targetPackage ? `Target Package Code: <code>${escapeHtml(targetPackage)}</code>` : "",
    isRenewalIntake && paymentMethodLabel ? `Payment Method: <b>${escapeHtml(paymentMethodLabel)}</b>` : "",
    isRenewalIntake && expiryRule ? `Expiry Rule: <code>${escapeHtml(expiryRule)}</code>` : "",
    isRenewalIntake && expiryReason ? `Expiry Reason: <code>${escapeHtml(expiryReason)}</code>` : "",
    isRenewalIntake && pointsBalance !== null && pointsBalance !== undefined ? `Points Balance: ${escapeHtml(toStr(pointsBalance))}` : "",
    isRenewalIntake && pointsRequired !== null && pointsRequired !== undefined ? `Points Required: ${escapeHtml(toStr(pointsRequired))}` : "",
    isRenewalIntake && pointsShortfall !== null && pointsShortfall !== undefined ? `Points Shortfall: ${escapeHtml(toStr(pointsShortfall))}` : "",
    isRenewalIntake && proofAttached
      ? `Proof: proof_attached=<b>true</b>`
      : "",
    isRenewalIntake && proofAttached && proofFilename ? `Proof Filename: ${escapeHtml(proofFilename)}` : "",
    isRenewalIntake && proofAttached && proofMimeType ? `Proof MIME: ${escapeHtml(proofMimeType)}` : "",
    isRenewalIntake && proofAttached && proofSize ? `Proof Size: ${proofSize} bytes` : "",
    isRenewalIntake && proofAttached && proofSource ? `Proof Source: ${escapeHtml(proofSource)}` : "",
    isRenewalIntake && proofAttached && proofBase64Present
      ? "Proof Base64: [base64 omitted]"
      : "",
    "",
    `Member Link: ${escapeHtml(links.customer_url)}`,
    `Model Link: ${escapeHtml(links.model_url)}`,
    "",
    `Member Dashboard: ${escapeHtml(links.customer_dashboard_url)}`,
    `Model Dashboard: ${escapeHtml(links.model_dashboard_url)}`,
  ].filter(Boolean);

  const telegramPayload = {
    chat_id: toStr(payload.telegram_chat_id),
    message_thread_id: toStr(payload.telegram_message_thread_id),
    text: isRenewalIntake ? stripTelegramHtml(lines.join("\n")) : lines.join("\n"),
    parse_mode: isRenewalIntake ? null : "HTML",
    disable_web_page_preview: true,
  };

  const telegramPath = "/v1/admin/telegram/dm";
  const telegramUrl = env.ADMIN_WORKER_BASE_URL
    ? `${env.ADMIN_WORKER_BASE_URL.replace(/\/+$/, "")}${telegramPath}`
    : telegramPath;
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.INTERNAL_TOKEN}`,
    },
    body: JSON.stringify(telegramPayload),
  };

  const response = env.ADMIN_WORKER
    ? await env.ADMIN_WORKER.fetch(
        new Request(`https://admin-worker.internal${telegramPath}`, requestInit),
      )
    : await fetch(telegramUrl, requestInit);
  const responseText = await response.text();
  const responseJson = (() => {
    try {
      return JSON.parse(responseText) as
        | { telegram?: { ok?: boolean; status?: number; error?: string; data?: unknown } }
        | { error?: string }
        | null;
    } catch {
      return null;
    }
  })();

  if (!response.ok) {
    return {
      attempted: true,
      ok: false,
      status: response.status,
      error:
        toStr((responseJson as { error?: string } | null)?.error) ||
        `telegram_http_${response.status}`,
    };
  }

  const telegramResult = (responseJson as { telegram?: { ok?: boolean; status?: number; error?: string } } | null)?.telegram;
  return {
    attempted: true,
    ok: Boolean(telegramResult?.ok),
    status: telegramResult?.status,
    error: telegramResult?.ok ? undefined : toStr(telegramResult?.error) || "telegram_send_failed",
  };
}

function lineIntakeSideEffectsEnabled(payload: LineClientIntakeRequest): boolean {
  return toBool(payload.allow_side_effects || payload.payload_json?.allow_side_effects);
}

function lineIntakeLinkCreationEnabled(payload: LineClientIntakeRequest): boolean {
  return lineIntakeSideEffectsEnabled(payload) &&
    toBool(payload.allow_link_creation || payload.payload_json?.allow_link_creation);
}

function lineIntakeTelegramEnabled(payload: LineClientIntakeRequest): boolean {
  return lineIntakeSideEffectsEnabled(payload) &&
    toBool(payload.allow_telegram_notification || payload.payload_json?.allow_telegram_notification);
}

async function handleLineIntake(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as LineClientIntakeRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid LINE intake payload is required", meta);
  }

  try {
    const result = await intakeLineClientUpsert(env, payload);
    const sideEffectsEnabled = lineIntakeSideEffectsEnabled(payload) &&
      result.mode === "airtable" &&
      result.action !== "needs_review";
    const promotion = sideEffectsEnabled
      ? await promoteLineClientAfterIntake(env, payload, result)
      : {
          attempted: false,
          ok: false,
          member_id: "",
          promotion_status: result.action === "needs_review" ? "needs_manual_review" : "side_effects_disabled",
          created_new_member: false,
          error: ("review_reason" in result ? result.review_reason : "") || "side_effects_disabled_by_default",
        };
    const links = sideEffectsEnabled && lineIntakeLinkCreationEnabled(payload)
      ? await createLineLinksAfterPromotion(env, payload, result, promotion)
      : null;
    const telegram = sideEffectsEnabled && lineIntakeTelegramEnabled(payload)
      ? await notifyTelegramForLineIntake(env, payload, promotion, links)
      : {
          attempted: false,
          ok: false,
          error: "telegram_disabled_by_default",
        };
    const body: LineClientIntakeResponse = {
      ok: true,
      data: {
        ...result,
        promotion,
        links,
        telegram,
      },
      meta,
    };

    return json(body);
  } catch (error) {
    return json(
      {
        ok: false,
        error: {
          code: "LINE_INTAKE_FAILED",
          message: error instanceof Error ? error.message : "LINE intake failed",
        },
        meta,
      },
      { status: 502 },
    );
  }
}

async function handleAdminCreateSessionProxy(
  request: Request,
  env: Env,
  meta: Meta,
): Promise<Response> {
  if (!env.ADMIN_WORKER_BASE_URL && !env.ADMIN_WORKER) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_ADMIN_WORKER_TARGET",
          message: "missing_ADMIN_WORKER_BASE_URL",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const gateSession = getValidatedGateSession(request);
  const sigilAdminSession = isSigilAdminPath(new URL(request.url).pathname)
    ? await getValidSigilAdminSession(request, env)
    : null;
  if (!gateSession && !sigilAdminSession && !isAuthorized(request, env)) {
    return unauthorized(meta);
  }

  const upstreamPath = ADMIN_JOBS.createSessionLegacy;
  const upstreamUrl = env.ADMIN_WORKER_BASE_URL
    ? `${env.ADMIN_WORKER_BASE_URL.replace(/\/+$/, "")}${upstreamPath}`
    : upstreamPath;
  const bodyText = await request.text();
  const headers = new Headers({
    accept: "application/json",
    "content-type": request.headers.get("content-type") || "application/json",
  });

  const requestBearer = toStr(request.headers.get("authorization")).replace(/^Bearer\s+/i, "").trim();
  const bearer = gateSession?.bearer || readInternalToken(request) || requestBearer || env.INTERNAL_TOKEN;
  const confirmKey = gateSession?.confirmKey || toStr(request.headers.get("x-confirm-key")) || env.CONFIRM_KEY;

  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  if (confirmKey) headers.set("x-confirm-key", confirmKey);

  const requestInit: RequestInit = {
    method: "POST",
    headers,
    body: bodyText,
  };

  const upstreamResponse = env.ADMIN_WORKER
    ? await env.ADMIN_WORKER.fetch(
        new Request(`https://admin-worker.internal${upstreamPath}`, requestInit),
      )
    : await fetch(upstreamUrl, requestInit);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: upstreamResponse.headers,
  });
}

async function handleSigilSendLineSessionCard(
  request: Request,
  env: Env,
  meta: Meta,
): Promise<Response> {
  const sigilAdminSession = await getValidSigilAdminSession(request, env);
  if (!sigilAdminSession && !isAuthorized(request, env)) {
    return unauthorized(meta);
  }

  const bodyText = await request.text();
  const headers = new Headers({
    "content-type": request.headers.get("content-type") || "application/json",
  });
  if (env.INTERNAL_TOKEN) {
    headers.set("authorization", `Bearer ${env.INTERNAL_TOKEN}`);
  }

  return handleSendLineSessionCard(
    new Request(new URL("/internal/line/send-session-card", request.url).toString(), {
      method: "POST",
      headers,
      body: bodyText,
    }),
    env,
  );
}

async function handleCreateJob(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as CreateJobRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid create-job payload is required", meta);
  }

  const normalizedPayload: LineClientIntakeRequest = {
    ...payload,
    manual_note:
      toStr(payload.manual_note) ||
      toStr(payload.notes?.manual_note) ||
      toStr(payload.manual_note_raw),
    payload_json: {
      ...(payload.payload_json && typeof payload.payload_json === "object" ? payload.payload_json : {}),
      ...(payload.model_history_note ? { model_history_note: payload.model_history_note } : {}),
      ...(payload.model_history_source ? { model_history_source: payload.model_history_source } : {}),
      ...(payload.model_history_status ? { model_history_status: payload.model_history_status } : {}),
      ...(payload.model_history_payload_json && typeof payload.model_history_payload_json === "object"
        ? { model_history_payload_json: payload.model_history_payload_json }
        : {}),
    },
  };

  try {
    const result = await intakeLineClientUpsert(env, normalizedPayload);
    const promotion = await promoteLineClientAfterIntake(env, normalizedPayload, result);
    const links = await createLineLinksAfterPromotion(env, normalizedPayload, result, promotion);
    const confirmLinks = await createConfirmLinksAfterCreateJob(env, payload, result);
    const modelHistory = buildModelHistoryArtifact(payload);
    const telegram = await notifyTelegramForLineIntake(env, normalizedPayload, promotion, links);
    const airtable = {
      client_record_id: toStr(result.client?.airtable_record_id) || null,
      inbox_record_id: toStr(result.inbox_record?.airtable_record_id) || null,
    };

    const body: CreateJobResponse = {
      ok: true,
      data: {
        contract_version: "create_job_v1",
        immigration_id: result.immigration_id,
        promotion,
        links,
        confirm_links: confirmLinks,
        model_history: modelHistory,
        telegram,
        airtable,
        artifacts: {
          member_id: toStr(promotion?.member_id),
          customer_url: toStr(links?.customer_url),
          model_url: toStr(links?.model_url),
          customer_dashboard_url: toStr(links?.customer_dashboard_url),
          model_dashboard_url: toStr(links?.model_dashboard_url),
          customer_confirmation_url: toStr(confirmLinks?.customer_confirmation_url),
          model_confirmation_url: toStr(confirmLinks?.model_confirmation_url),
          model_history_status: modelHistory.status,
          model_history_source: modelHistory.source,
          airtable,
          telegram,
        },
      },
      meta,
    };

    return json(body);
  } catch (error) {
    return json(
      {
        ok: false,
        error: {
          code: "CREATE_JOB_FAILED",
          message: error instanceof Error ? error.message : "create job failed",
        },
        meta,
      },
      { status: 502 },
    );
  }
}

async function handleModelHistoryBatch(request: Request): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as CreateJobRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid model-history payload is required", meta);
  }

  return json({
    ...buildModelHistoryBatchPreview(payload),
    meta,
  });
}

async function handleModelHistoryImport(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const route = new URL(request.url).pathname;
  const body = (await request.json().catch(() => null)) as
    | { payload?: CreateJobRequest; apply?: boolean }
    | CreateJobRequest
    | null;

  const payload =
    body && typeof body === "object" && "payload" in body
      ? (body.payload as CreateJobRequest | undefined) || null
      : (body as CreateJobRequest | null);
  const apply =
    body && typeof body === "object" && "apply" in body
      ? Boolean((body as { apply?: boolean }).apply)
      : false;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid model-history import payload is required", meta);
  }

  if (!env.AIRTABLE_API_KEY) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_AIRTABLE_API_KEY",
          message: "Airtable import is not configured on this worker",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const result = {
    ...(await performModelHistoryImport(env, payload, apply)),
    meta,
  };
  await writeImportLogToAirtable(env, {
    label: "Model History Import",
    route,
    import_type: "model_history",
    mode: result.mode,
    status: "ok",
    payload,
    request: body && typeof body === "object" && "payload" in body ? body : { payload, apply },
    summary: result.summary,
    counts: result.counts,
  });
  return json(result);
}

async function handlePrivateProfileImport(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const route = new URL(request.url).pathname;
  const body = (await request.json().catch(() => null)) as
    | { payload?: CreateJobRequest; apply?: boolean }
    | CreateJobRequest
    | null;

  const payload =
    body && typeof body === "object" && "payload" in body
      ? (body.payload as CreateJobRequest | undefined) || null
      : (body as CreateJobRequest | null);
  const apply =
    body && typeof body === "object" && "apply" in body
      ? Boolean((body as { apply?: boolean }).apply)
      : false;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid private-profile import payload is required", meta);
  }

  if (!env.AIRTABLE_API_KEY) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_AIRTABLE_API_KEY",
          message: "Airtable import is not configured on this worker",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const result = {
    ...(await performPrivateProfileImport(env, payload, apply)),
    meta,
  };
  await writeImportLogToAirtable(env, {
    label: "Private Profile Import",
    route,
    import_type: "private_profile",
    mode: result.mode,
    status: "ok",
    payload,
    request: body && typeof body === "object" && "payload" in body ? body : { payload, apply },
    summary: result.summary,
    counts: result.counts,
  });
  return json(result);
}

async function performBookingImport(env: Env, payload: CreateJobRequest, apply: boolean) {
  const preview = buildBookingImportPreview(payload);

  const clients = await processModelHistoryImportEntity(
    env,
    preview.rows.clients,
    {
      tableId: env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS",
      lookupForRow: modelHistoryClientLookup,
      mapFields: normalizeImportClientFields,
    },
    apply,
  );
  const sessions = await processModelHistoryImportEntity(
    env,
    preview.rows.sessions,
    {
      tableId: env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX",
      lookupForRow: (row) => ({ field: "session_id", value: toStr(row.session_id) }),
      mapFields: normalizeImportSessionFields,
    },
    apply,
  );
  const payments = await processModelHistoryImportEntity(
    env,
    preview.rows.payments,
    {
      tableId: env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ",
      lookupForRow: (row) => ({ field: "Payment Reference", value: toStr(row.payment_ref) }),
      mapFields: normalizeImportPaymentFields,
    },
    apply,
  );

  return {
    ok: true,
    mode: apply ? "apply" : "dry_run",
    import_type: "booking" as const,
    counts: preview.counts,
    summary: { clients, sessions, payments },
  };
}

async function handleBookingImport(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const route = new URL(request.url).pathname;
  const body = (await request.json().catch(() => null)) as
    | { payload?: CreateJobRequest; apply?: boolean }
    | CreateJobRequest
    | null;

  const payload =
    body && typeof body === "object" && "payload" in body
      ? (body.payload as CreateJobRequest | undefined) || null
      : (body as CreateJobRequest | null);
  const apply =
    body && typeof body === "object" && "apply" in body
      ? Boolean((body as { apply?: boolean }).apply)
      : false;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid booking import payload is required", meta);
  }

  if (!env.AIRTABLE_API_KEY) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_AIRTABLE_API_KEY",
          message: "Airtable import is not configured on this worker",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const result = {
    ...(await performBookingImport(env, payload, apply)),
    meta,
  };
  await writeImportLogToAirtable(env, {
    label: "Booking Import",
    route,
    import_type: "booking",
    mode: result.mode,
    status: "ok",
    payload,
    request: body && typeof body === "object" && "payload" in body ? body : { payload, apply },
    summary: result.summary,
    counts: result.counts,
  });
  return json(result);
}

async function performModelHistoryImport(env: Env, payload: CreateJobRequest, apply: boolean) {
  const preview = buildModelHistoryBatchPreview(payload) as {
    files: Record<string, string>;
    counts: { clients: number; sessions: number; payments: number; private_profiles?: number };
    model_history: { status: string; source: string; note: string; has_payload: boolean };
    rows: {
      clients: Array<Record<string, unknown>>;
      sessions: Array<Record<string, unknown>>;
      payments: Array<Record<string, unknown>>;
      private_profiles?: Array<Record<string, unknown>>;
    };
  };
  const clientRows = preview.rows.clients;
  const sessionRows = preview.rows.sessions;
  const paymentRows = preview.rows.payments;
  const privateProfileRows = Array.isArray(preview.rows.private_profiles) ? preview.rows.private_profiles : [];

  const clients = await processModelHistoryImportEntity(
    env,
    clientRows,
    {
      tableId: env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS",
      lookupForRow: modelHistoryClientLookup,
      mapFields: normalizeImportClientFields,
    },
    apply,
  );
  const sessions = await processModelHistoryImportEntity(
    env,
    sessionRows,
    {
      tableId: env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX",
      lookupForRow: (row) => ({ field: "session_id", value: toStr(row.session_id) }),
      mapFields: normalizeImportSessionFields,
    },
    apply,
  );
  const payments = await processModelHistoryImportEntity(
    env,
    paymentRows,
    {
      tableId: env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ",
      lookupForRow: (row) => ({ field: "Payment Reference", value: toStr(row.payment_ref) }),
      mapFields: normalizeImportPaymentFields,
    },
    apply,
  );
  const private_profiles = env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES
    ? await processModelHistoryImportEntity(
        env,
        privateProfileRows,
        {
          tableId: env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES,
          lookupForRow: privateProfileLookup,
          mapFields: normalizePrivateProfileFields,
          allowUpdate: true,
          afterWrite: async (row, result) => {
            await attachPrivateProfileContext(env, row, result);
          },
        },
        apply,
      )
    : privateProfileRows.map((row) => ({
        source_key: toStr(row.profile_key || row.model_id || row.display_name),
        action: "skipped_unconfigured",
        lookup_field: "profile_key",
        fields: normalizePrivateProfileFields(row),
      }));

  return {
    ok: true,
    mode: apply ? "apply" : "dry_run",
    import_type: "model_history" as const,
    model_history: preview.model_history,
    counts: preview.counts,
    summary: { clients, sessions, payments, private_profiles },
  };
}

async function performPrivateProfileImport(env: Env, payload: CreateJobRequest, apply: boolean) {
  const preview = buildPrivateProfilePreview(payload);
  const rows = preview.row ? [preview.row] : [];
  const private_profiles = env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES
    ? await processModelHistoryImportEntity(
        env,
        rows,
        {
          tableId: env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES,
          lookupForRow: privateProfileLookup,
          mapFields: normalizePrivateProfileFields,
          allowUpdate: true,
          afterWrite: async (row, result) => {
            await attachPrivateProfileContext(env, row, result);
          },
        },
        apply,
      )
    : rows.map((row) => ({
        source_key: toStr(row.profile_key || row.model_id || row.display_name),
        action: "skipped_unconfigured",
        lookup_field: "profile_key",
        fields: normalizePrivateProfileFields(row),
      }));

  return {
    ok: true,
    mode: apply ? "apply" : "dry_run",
    import_type: "private_profile" as const,
    counts: {
      private_profiles: rows.length,
    },
    summary: {
      private_profiles,
    },
  };
}

async function handleImportAll(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const route = new URL(request.url).pathname;
  const body = (await request.json().catch(() => null)) as
    | { payload?: CreateJobRequest; booking_apply?: boolean; model_history_apply?: boolean }
    | CreateJobRequest
    | null;

  const payload =
    body && typeof body === "object" && "payload" in body
      ? (body.payload as CreateJobRequest | undefined) || null
      : (body as CreateJobRequest | null);
  const bookingApply =
    body && typeof body === "object" && "booking_apply" in body
      ? Boolean((body as { booking_apply?: boolean }).booking_apply)
      : false;
  const modelHistoryApply =
    body && typeof body === "object" && "model_history_apply" in body
      ? Boolean((body as { model_history_apply?: boolean }).model_history_apply)
      : false;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid import-all payload is required", meta);
  }

  if (!env.AIRTABLE_API_KEY) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_AIRTABLE_API_KEY",
          message: "Airtable import is not configured on this worker",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const booking = await performBookingImport(env, payload, bookingApply);
  const model_history = await performModelHistoryImport(env, payload, modelHistoryApply);

  const result = {
    ok: true,
    import_type: "all",
    mode:
      booking.mode === "apply" || model_history.mode === "apply"
        ? "mixed"
        : "dry_run",
    booking,
    model_history,
    counts: {
      clients: (booking.counts.clients || 0) + (model_history.counts.clients || 0),
      sessions: (booking.counts.sessions || 0) + (model_history.counts.sessions || 0),
      payments: (booking.counts.payments || 0) + (model_history.counts.payments || 0),
      private_profiles: (model_history.counts.private_profiles || 0),
    },
    summary: {
      clients: [...booking.summary.clients, ...model_history.summary.clients],
      sessions: [...booking.summary.sessions, ...model_history.summary.sessions],
      payments: [...booking.summary.payments, ...model_history.summary.payments],
      private_profiles: [...((model_history.summary as { private_profiles?: Array<Record<string, unknown>> }).private_profiles || [])],
    },
    meta,
  };
  await writeImportLogToAirtable(env, {
    label: "Import All",
    route,
    import_type: "all",
    mode: result.mode,
    status: "ok",
    payload,
    request:
      body && typeof body === "object" && "payload" in body
        ? body
        : { payload, booking_apply: bookingApply, model_history_apply: modelHistoryApply },
    summary: result.summary,
    counts: result.counts,
  });
  return json(result);
}

async function handleImportLogs(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  if (!env.AIRTABLE_API_KEY) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_AIRTABLE_API_KEY",
          message: "Airtable import logs are not configured on this worker",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") || "30");
  try {
    const entries = await readImportLogsFromAirtable(env, limitRaw);
    return json({
      ok: true,
      source: "airtable",
      count: entries.length,
      entries,
      meta,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: {
          code: "IMPORT_LOGS_READ_FAILED",
          message: error instanceof Error ? error.message : "unable to read import logs",
        },
        meta,
      },
      { status: 502 },
    );
  }
}

async function handlePromote(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as ImmigrationPromoteRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid promotion payload is required", meta);
  }

  if (!toStr(payload.immigration_id)) {
    return badRequest("immigration_id is required", meta, { field: "immigration_id" });
  }

  if (!toStr(payload.notes?.manual_note_raw)) {
    return badRequest("notes.manual_note_raw is required", meta, {
      field: "notes.manual_note_raw",
    });
  }

  const promoted = promoteRecord(
    buildPromotionRecord(payload, {
      promotion_status: "promotion_pending",
    }),
  );

  if (env.ADMIN_WORKER_BASE_URL) {
    const response = await fetch(
      `${env.ADMIN_WORKER_BASE_URL.replace(/\/+$/, "")}/v1/admin/members/promote-immigration`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.INTERNAL_TOKEN}`,
        },
        body: JSON.stringify({
          immigration_id: promoted.immigration_id,
          source_channel: promoted.source_channel,
          intent: promoted.intent,
          identity: promoted.identity,
          membership: promoted.membership,
          notes: promoted.notes,
          service_history_summary: promoted.service_history_summary,
          payload_json: promoted.payload_json,
          promotion_policy: {
            create_if_missing: true,
            overwrite_if_exists: false,
            archive_raw_notes: true,
          },
        }),
      },
    );

    const responseJson = await response.json().catch(() => null);
    if (!response.ok) {
      return json(
        {
          ok: false,
          error: {
            code: "PROMOTION_UPSTREAM_FAILED",
            message: "admin-worker promotion failed",
            details: responseJson ?? {},
          },
          meta,
        },
        { status: 502 },
      );
    }

    const data = (responseJson as { data?: Record<string, unknown> } | null)?.data || {};
    const body: ImmigrationPromoteResponse = {
      ok: true,
      data: {
        immigration_id: promoted.immigration_id,
        member_id: toStr(data.member_id) || promoted.promoted_member_id || "",
        promotion_status:
          toStr(data.promotion_status) === "needs_manual_review"
            ? "needs_manual_review"
            : "promoted",
        created_new_member: Boolean(data.created_new_member),
        service_history_summary: promoted.service_history_summary,
      },
      meta,
    };

    return json(body);
  }

  const body: ImmigrationPromoteResponse = {
    ok: true,
    data: {
      immigration_id: promoted.immigration_id,
      member_id: promoted.promoted_member_id || "",
      promotion_status: promoted.promotion_status,
      created_new_member: Boolean(promoted.created_new_member),
      service_history_summary: promoted.service_history_summary,
    },
    meta,
  };

  return json(body);
}

async function handleGetImmigration(request: Request, immigrationId: string, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  let record = readSeedRecords().find((item) => item.migration_id === immigrationId) || null;

  if (!record && canReadAirtable(env)) {
    try {
      const airtable = await listRecordsFromAirtable(env);
      record = airtable.records.find((item) => item.migration_id === immigrationId) || null;
    } catch (error) {
      console.warn("immigrate-worker get fallback to seed", error);
    }
  }

  if (!record) {
    return json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Immigration record not found",
        },
        meta,
      },
      { status: 404 },
    );
  }

  const projected = buildPromotionRecord(
    {
      immigration_id: record.migration_id,
      source_channel: "line",
      intent: parseImmigrationIntent(record.parsed_intent),
      identity: {
        line_user_id: record.source_user_id,
        full_name: record.parsed_name,
        phone: record.parsed_phone,
      },
      notes: {
        manual_note_raw: record.raw_text,
      },
      payload_json: {
        source_message_id: record.source_message_id,
        parsed_budget_thb: record.parsed_budget_thb,
        parsed_date: record.parsed_date,
        parsed_location: record.parsed_location,
        dedupe_status: record.dedupe_status,
        flags: record.flags,
      },
    },
    {
      promotion_status:
        record.migration_status === "promoted_to_core"
          ? "promoted"
          : record.migration_status === "failed"
            ? "promotion_failed"
            : "archived_raw",
      promoted_member_id: record.linked_client_id || undefined,
      created_new_member: record.dedupe_status === "create_new",
      archived_at: record.received_at,
      promoted_at:
        record.migration_status === "promoted_to_core"
          ? record.received_at
          : undefined,
    },
  );

  const body: ImmigrationGetResponse = {
    ok: true,
    data: projected,
    meta,
  };

  return json(body);
}

function clampExpiryHours(value: unknown): number {
  const fallback = 24 * 3;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(24 * 14, Math.round(raw)));
}

function defaultPublicBaseUrl(env: Env): string {
  return toStr(env.PUBLIC_WEB_BASE_URL) || "https://www.mmdbkk.com";
}

function defaultCustomerDashboardBaseUrl(env: Env): string {
  return toStr(env.WEB_BASE_URL) || "https://mmdbkk.com";
}

function buildModelHistoryArtifact(payload: CreateJobRequest): {
  status: "missing" | "pending_import" | "attached" | "imported";
  source: string;
  note: string;
  has_payload: boolean;
} {
  const note =
    toStr(payload.model_history_note) ||
    toStr(payload.payload_json?.model_history_note) ||
    toStr(payload.payload_json?.legacy_model_history_note);
  const source =
    toStr(payload.model_history_source) ||
    toStr(payload.payload_json?.model_history_source) ||
    "line_group_note";
  const explicitStatus = toStr(payload.model_history_status || payload.payload_json?.model_history_status).toLowerCase();
  const hasPayload = Boolean(
    payload.model_history_payload_json &&
      typeof payload.model_history_payload_json === "object" &&
      Object.keys(payload.model_history_payload_json).length,
  );

  if (explicitStatus === "imported") {
    return { status: "imported", source, note, has_payload: hasPayload };
  }

  if (explicitStatus === "attached") {
    return { status: "attached", source, note, has_payload: hasPayload };
  }

  if (note || hasPayload) {
    return { status: "pending_import", source, note, has_payload: hasPayload };
  }

  return { status: "missing", source: "", note: "", has_payload: false };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => toStr(item)).filter(Boolean);
  }
  const raw = toStr(value);
  return raw ? [raw] : [];
}

function toMaybeNumber(value: unknown): number | null {
  const raw = toStr(value).replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPrivateProfilePreview(payload: CreateJobRequest) {
  const root = asRecord(payload as unknown);
  const historyPayload = asRecord(payload.model_history_payload_json);
  const clientNote = asRecord(root.client_note_json);
  const personalNote = asRecord(historyPayload.personal_note_json);
  const personalProfile = asRecord(historyPayload.personal_profile);
  const source = Object.keys(clientNote).length
    ? clientNote
    : Object.keys(personalNote).length
      ? personalNote
      : personalProfile;

  const modelId =
    toStr(source.model_id) ||
    toStr(historyPayload.model_id) ||
    toStr(payload.payload_json?.model_id) ||
    toStr(payload.model_record_id);
  const modelName =
    toStr(source.model_name) ||
    toStr(historyPayload.model_name) ||
    toStr(payload.model_name) ||
    toStr(payload.display_name);
  const displayName =
    toStr(source.line_display_name) ||
    toStr(personalProfile.display_name) ||
    toStr(payload.display_name) ||
    modelName;
  const nickname =
    toStr(source.nickname) ||
    toStr(personalProfile.real_nickname_th) ||
    toStr(payload.nickname) ||
    modelName;
  const lineContactId =
    toStr(personalProfile.line_contact_id) ||
    toStr(source.line_contact_id) ||
    toStr(source.line_id) ||
    toStr(personalNote.line_id);
  const phone =
    toStr(source.phone) ||
    toStr(personalProfile.phone) ||
    toStr(payload.phone);
  const ig =
    toStr(personalProfile.ig) ||
    toStr(source.ig);
  const rawNote =
    toStr(source.raw_note) ||
    toStr(payload.model_history_note);
  const noteSummary =
    toStr(source.notes_summary) ||
    (rawNote ? rawNote.replace(/\s+/g, " ").slice(0, 180) : "");
  const sourceFacts = asStringArray(source.source_facts);
  const tags = asStringArray(source.tags);
  const warnings = asStringArray(source.warnings);
  const privacyLevel =
    toStr(source.privacy_level) ||
    toStr(personalProfile.privacy_level) ||
    (warnings.length || rawNote ? "sensitive" : "");
  const bankAccountNumber =
    toStr(personalProfile.bank_account_number) ||
    toStr(source.bank_account_number);
  const bankAccountLast4 =
    toStr(source.bank_account_last4) ||
    (bankAccountNumber ? bankAccountNumber.replace(/\D/g, "").slice(-4) : "");
  const profileKey = slugifyValue(
    modelId || lineContactId || phone || displayName || modelName,
    "private_profile",
  );
  const payloadJson = {
    source_note_json: source,
    personal_profile: personalProfile,
    model_history_payload_json: historyPayload,
    original_payload: payload.payload_json || {},
  };

  const hasMeaningfulData = Boolean(
    modelId ||
    modelName ||
    lineContactId ||
    phone ||
    ig ||
    rawNote ||
    Object.keys(personalProfile).length,
  );

  const row = hasMeaningfulData
    ? {
        profile_key: profileKey,
        note_title: `Private Profile — ${modelName || displayName || profileKey}`,
        note_content: rawNote,
        author: "immigrate-worker",
        model_id: modelId,
        model_name: modelName,
        display_name: displayName,
        nickname,
        alias: toStr(personalProfile.alias_th) || toStr(source.alias),
        gender: toStr(personalProfile.gender) || toStr(source.gender),
        phone,
        line_contact_id: lineContactId,
        ig,
        origin_country: toStr(personalProfile.origin_country) || toStr(source.origin_country),
        location_area: toStr(personalProfile.location_area) || toStr(source.location_area),
        bangkok_area: toStr(personalProfile.bangkok_area) || toStr(source.bangkok_area),
        availability: toStr(personalProfile.availability) || toStr(source.availability),
        tattoo_area: toStr(personalProfile.tattoo_area) || toStr(source.tattoo_area),
        lgbt_experience: toStr(personalProfile.lgbt_experience) || toStr(source.lgbt_experience),
        age: toMaybeNumber(personalProfile.age ?? source.age),
        height_cm: toMaybeNumber(personalProfile.height_cm ?? source.height_cm),
        weight_kg: toMaybeNumber(personalProfile.weight_kg ?? source.weight_kg),
        minimum_rate_thb: toMaybeNumber(personalProfile.minimum_rate_thb ?? source.minimum_rate_thb),
        bank_name: toStr(personalProfile.bank_name) || toStr(source.bank_name),
        bank_account_name: toStr(personalProfile.bank_account_name) || toStr(source.bank_account_name),
        bank_account_last4: bankAccountLast4,
        privacy_level: privacyLevel,
        note_summary: noteSummary,
        raw_note: rawNote,
        source_facts: sourceFacts.join("|"),
        tags: tags.join("|"),
        warnings: warnings.join(" | "),
        payload_json: JSON.stringify(payloadJson),
        import_source: "model_history_private_profile",
        updated_at: new Date().toISOString(),
      }
    : null;

  return {
    has_private_profile: Boolean(row),
    row,
  };
}

function slugifyValue(value: unknown, fallback: string): string {
  const normalized = toStr(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return normalized || fallback;
}

function csvEscape(value: unknown): string {
  const stringValue = String(value == null ? "" : value);
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n") + "\n";
}

function buildModelHistoryBatchPreview(payload: CreateJobRequest) {
  const modelHistory = buildModelHistoryArtifact(payload);
  const privateProfile = buildPrivateProfilePreview(payload);
  const historyPayload =
    payload.model_history_payload_json && typeof payload.model_history_payload_json === "object"
      ? payload.model_history_payload_json
      : {};
  const clientKey = slugifyValue(
    toStr((historyPayload as Record<string, unknown>).client_key) ||
      toStr(payload.line_user_id) ||
      toStr(payload.display_name) ||
      toStr(payload.email),
    "client_history",
  );
  const clientRow = {
    unique_key: clientKey,
    "Client Name": toStr(payload.display_name || payload.nickname) || "unknown",
    nickname: toStr(payload.nickname || payload.display_name) || "unknown",
    line_user_id: toStr(payload.line_user_id) || "unknown",
    line_display_name: toStr(payload.display_name) || "unknown",
    phone: toStr(payload.phone) || "unknown",
    email: toStr(payload.email).toLowerCase() || "unknown",
    telegram_username: "unknown",
    preferred_language: "th",
    notes_summary: modelHistory.note ? modelHistory.note.slice(0, 180) : "",
    vip_level: "unknown",
    verification_status: "unknown",
    client_status: "repeat",
    risk_level: "unknown",
    privacy_level: "unknown",
    first_contact_at: "unknown",
    last_booking_count: "unknown",
    total_paid_estimate: "unknown",
    confidence: "0.6",
    raw_note: modelHistory.note,
    source_facts: [modelHistory.source ? `model_history_source:${modelHistory.source}` : "", payload.model_name ? `model_name:${payload.model_name}` : ""]
      .filter(Boolean)
      .join("|"),
    tags: "",
    safety_flags: "",
    automations: "",
    legacy_tags: modelHistory.status,
    notes: "",
  };

  const sessions = Array.isArray((historyPayload as Record<string, unknown>).sessions)
    ? ((historyPayload as Record<string, unknown>).sessions as Array<Record<string, unknown>>)
    : [];
  const payments = Array.isArray((historyPayload as Record<string, unknown>).payments)
    ? ((historyPayload as Record<string, unknown>).payments as Array<Record<string, unknown>>)
    : [];

  const sessionRows = sessions.map((session, index) => ({
    session_id: toStr(session.session_id) || `sess_${clientKey}_${String(index + 1).padStart(2, "0")}`,
    client_key: clientKey,
    job_type: toStr(session.job_type || session.work_type || "legacy_history"),
    model_name: toStr(session.model_name || payload.model_name),
    job_date: toStr(session.job_date || session.service_date),
    start_time: toStr(session.start_time),
    end_time: toStr(session.end_time),
    location_name: toStr(session.location_name || session.location || "legacy_note"),
    google_map_url: toStr(session.google_map_url),
    amount_thb: toStr(session.amount_thb || session.amount_total_thb),
  }));

  const paymentRows = payments.map((payment, index) => ({
    payment_ref:
      toStr(payment.payment_ref) ||
      `pay_${slugifyValue(payment.session_id || sessionRows[index]?.session_id || "legacy", "legacy")}_${index + 1}`,
    session_id: toStr(payment.session_id || sessionRows[index]?.session_id),
    amount: toStr(payment.amount || payment.amount_thb),
    payment_type: toStr(payment.payment_type || "full"),
    payment_date: toStr(payment.payment_date),
    receipt_photo: toStr(payment.receipt_photo),
  }));

  const files = {
    "clients.csv": toCsv(
      ["unique_key", "Client Name", "nickname", "line_user_id", "line_display_name", "phone", "email", "telegram_username", "preferred_language", "notes_summary", "vip_level", "verification_status", "client_status", "risk_level", "privacy_level", "first_contact_at", "last_booking_count", "total_paid_estimate", "confidence", "raw_note", "source_facts", "tags", "safety_flags", "automations", "legacy_tags", "notes"],
      [clientRow],
    ),
    "sessions.csv": toCsv(
      ["session_id", "client_key", "job_type", "model_name", "job_date", "start_time", "end_time", "location_name", "google_map_url", "amount_thb"],
      sessionRows,
    ),
    "payments.csv": toCsv(
      ["payment_ref", "session_id", "amount", "payment_type", "payment_date", "receipt_photo"],
      paymentRows,
    ),
    "private-profile.json": privateProfile.row ? `${JSON.stringify(privateProfile.row, null, 2)}\n` : "",
  };

  return {
    ok: true,
    batch_type: "model_history_import",
    model_history: modelHistory,
    counts: {
      clients: 1,
      sessions: sessionRows.length,
      payments: paymentRows.length,
      private_profiles: privateProfile.row ? 1 : 0,
    },
    rows: {
      clients: [clientRow],
      sessions: sessionRows,
      payments: paymentRows,
      private_profiles: privateProfile.row ? [privateProfile.row] : [],
    },
    files,
    import_payload: {
      batch_type: "model_history_import",
      generated_at: new Date().toISOString(),
      source_model_name: toStr(payload.model_name),
      source_model_record_id: toStr(payload.model_record_id),
      model_history_status: modelHistory.status,
      notes: [
        "clients.csv is always generated from model_history_note",
        "sessions.csv and payments.csv only include rows from model_history_payload_json",
        "private-profile.json is included when a sensitive personal note/profile payload exists",
        "review before import",
      ],
    },
  };
}

function buildBookingImportPreview(payload: CreateJobRequest) {
  const clientKey = slugifyValue(
    toStr(payload.line_user_id) || toStr(payload.email) || toStr(payload.display_name) || toStr(payload.nickname),
    "client_booking",
  );
  const sessionId = toStr(payload.session_id) || `sess_${slugifyValue(payload.display_name || payload.model_name, "booking")}`;
  const paymentRef = toStr(payload.payment_ref) || `pay_${slugifyValue(sessionId, "booking")}`;
  const amountThb = toStr(payload.amount_thb);
  const payModelThb = toStr(payload.pay_model_thb);

  const clientRow = {
    unique_key: clientKey,
    "Client Name": toStr(payload.display_name || payload.nickname) || "unknown",
    nickname: toStr(payload.nickname || payload.display_name) || "unknown",
    line_user_id: toStr(payload.line_user_id) || "unknown",
    line_display_name: toStr(payload.display_name) || "unknown",
    phone: toStr(payload.phone) || "unknown",
    email: toStr(payload.email).toLowerCase() || "unknown",
    telegram_username: "unknown",
    preferred_language: "th",
    notes_summary: toStr(payload.booking_note || payload.manual_note_raw).slice(0, 180),
    vip_level: "unknown",
    verification_status: "unknown",
    client_status: "active",
    risk_level: "unknown",
    privacy_level: "unknown",
    first_contact_at: payload.job_date || "unknown",
    last_booking_count: "unknown",
    total_paid_estimate: amountThb || "unknown",
    confidence: "0.8",
    raw_note: toStr(payload.booking_note || payload.manual_note_raw),
    source_facts: [
      payload.model_name ? `model_name:${payload.model_name}` : "",
      payload.job_type ? `job_type:${payload.job_type}` : "",
      payload.location_name ? `location_name:${payload.location_name}` : "",
    ].filter(Boolean).join("|"),
    tags: "",
    safety_flags: "",
    automations: "",
    legacy_tags: "booking_import",
    notes: "",
  };

  const sessionRow = {
    session_id: sessionId,
    client_key: clientKey,
    job_type: toStr(payload.job_type || "booking"),
    model_name: toStr(payload.model_name),
    job_date: toStr(payload.job_date),
    start_time: toStr(payload.start_time),
    end_time: toStr(payload.end_time),
    location_name: toStr(payload.location_name),
    google_map_url: toStr(payload.google_map_url),
    amount_thb: amountThb,
    payment_ref: paymentRef,
    payment_type: toStr(payload.payment_type || "deposit"),
    payment_status: "pending",
    pay_model_thb: payModelThb,
    note: toStr(payload.booking_note || payload.manual_note_raw),
  };

  const paymentRow = {
    payment_ref: paymentRef,
    session_id: sessionId,
    amount: amountThb,
    payment_type: toStr(payload.payment_type || "deposit"),
    payment_date: toStr(payload.job_date),
    receipt_photo: "",
    payment_method: toStr(payload.payment_method || "promptpay"),
    payment_status: "pending",
    verification_status: "pending",
    notes: toStr(payload.booking_note || payload.manual_note_raw),
    pay_model_thb: payModelThb,
  };

  return {
    ok: true,
    batch_type: "booking_import",
    counts: {
      clients: 1,
      sessions: toStr(payload.model_name) && toStr(payload.job_date) ? 1 : 0,
      payments: amountThb ? 1 : 0,
    },
    rows: {
      clients: [clientRow],
      sessions: toStr(payload.model_name) && toStr(payload.job_date) ? [sessionRow] : [],
      payments: amountThb ? [paymentRow] : [],
    },
  };
}

function compactFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== "" && value !== null && value !== undefined),
  );
}

function encodeFormulaValue(value: string): string {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function modelHistoryClientLookup(row: Record<string, unknown>) {
  const lineUserId = toStr(row.line_user_id);
  if (lineUserId && lineUserId !== "unknown") return { field: "line_user_id", value: lineUserId };
  const email = toStr(row.email).toLowerCase();
  if (email && email !== "unknown") return { field: "email", value: email };
  return { field: "Client Name", value: toStr(row["Client Name"]) };
}

function normalizeImportClientFields(row: Record<string, unknown>) {
  return compactFields({
    "Client Name": row["Client Name"],
    nickname: row.nickname,
    line_user_id: row.line_user_id,
    line_display_name: row.line_display_name,
    phone: row.phone,
    email: row.email,
    telegram_username: row.telegram_username,
    preferred_language: row.preferred_language,
    notes_summary: row.notes_summary,
    vip_level: row.vip_level,
    verification_status: row.verification_status,
    client_status: row.client_status,
    risk_level: row.risk_level,
    privacy_level: row.privacy_level,
    first_contact_at: row.first_contact_at,
    last_booking_count: toStr(row.last_booking_count) && toStr(row.last_booking_count) !== "unknown" ? Number(row.last_booking_count) : "",
    total_paid_estimate: toStr(row.total_paid_estimate) && toStr(row.total_paid_estimate) !== "unknown" ? Number(row.total_paid_estimate) : "",
    confidence: toStr(row.confidence) && toStr(row.confidence) !== "unknown" ? Number(row.confidence) : "",
    raw_note: row.raw_note,
    source_facts: row.source_facts,
    tags: row.tags,
    safety_flags: row.safety_flags,
    automations: row.automations,
  });
}

function normalizeImportSessionFields(row: Record<string, unknown>) {
  return compactFields({
    session_id: row.session_id,
    job_type: row.job_type,
    model_name: row.model_name,
    job_date: row.job_date,
    start_time: row.start_time,
    end_time: row.end_time,
    location_name: row.location_name,
    google_map_url: row.google_map_url,
    amount_thb: toStr(row.amount_thb) ? Number(row.amount_thb) : "",
    payment_ref: row.payment_ref,
    payment_type: row.payment_type,
    pay_model_thb: toStr(row.pay_model_thb) ? Number(row.pay_model_thb) : "",
    "Pay Model": toStr(row.pay_model_thb) ? Number(row.pay_model_thb) : "",
    "Payment Status": row.payment_status,
    status: row.payment_status || "pending",
    "Session Status": row.payment_status || "pending",
    note: row.note,
    notes: row.note,
  });
}

function normalizeImportPaymentFields(row: Record<string, unknown>) {
  return compactFields({
    "Payment Reference": row.payment_ref,
    session_id: row.session_id,
    Amount: toStr(row.amount) ? Number(row.amount) : "",
    amount_thb: toStr(row.amount) ? Number(row.amount) : "",
    payment_type: row.payment_type,
    payment_date: row.payment_date,
    receipt_photo: row.receipt_photo,
    "Payment Method": row.payment_method,
    "Payment Status": row.payment_status,
    "Verification Status": row.verification_status,
    notes: row.notes,
    pay_model_thb: toStr(row.pay_model_thb) ? Number(row.pay_model_thb) : "",
    "Pay Model": toStr(row.pay_model_thb) ? Number(row.pay_model_thb) : "",
  });
}

function privateProfileLookup(row: Record<string, unknown>) {
  const noteTitle = toStr(row.note_title);
  if (noteTitle) return { field: "Note Title", value: noteTitle };
  const modelId = toStr(row.model_id);
  if (modelId) return { field: "model_id", value: modelId };
  const lineContactId = toStr(row.line_contact_id);
  if (lineContactId) return { field: "line_contact_id", value: lineContactId };
  const phone = toStr(row.phone);
  if (phone && phone !== "unknown") return { field: "phone", value: phone };
  return { field: "profile_key", value: toStr(row.profile_key) };
}

function normalizePrivateProfileFields(row: Record<string, unknown>) {
  const createdDate = toStr(row.updated_at).split("T")[0];
  return compactFields({
    "Note Title": row.note_title,
    "Note Content": row.note_content,
    "Created Date": createdDate,
    Author: row.author,
    profile_key: row.profile_key,
    model_id: row.model_id,
    model_name: row.model_name,
    display_name: row.display_name,
    nickname: row.nickname,
    alias: row.alias,
    gender: row.gender,
    phone: row.phone,
    line_contact_id: row.line_contact_id,
    ig: row.ig,
    origin_country: row.origin_country,
    location_area: row.location_area,
    bangkok_area: row.bangkok_area,
    availability: row.availability,
    tattoo_area: row.tattoo_area,
    lgbt_experience: row.lgbt_experience,
    age: toMaybeNumber(row.age),
    height_cm: toMaybeNumber(row.height_cm),
    weight_kg: toMaybeNumber(row.weight_kg),
    minimum_rate_thb: toMaybeNumber(row.minimum_rate_thb),
    bank_name: row.bank_name,
    bank_account_name: row.bank_account_name,
    bank_account_last4: row.bank_account_last4,
    privacy_level: row.privacy_level,
    note_summary: row.note_summary,
    raw_note: row.raw_note,
    source_facts: row.source_facts,
    tags: row.tags,
    warnings: row.warnings,
    payload_json: row.payload_json,
    import_source: row.import_source,
    updated_at: row.updated_at,
  });
}

const AIRTABLE_MODELS_TABLE_DEFAULT = "tblI4B0bI446vp9GX";
const AIRTABLE_MODELS_INTERNAL_NOTES_LINK_FIELD = "Internal Notes";

async function getAirtableImportRecord(
  env: Env,
  tableId: string,
  recordId: string,
) {
  return await airtableImportRequest(env, `${tableId}/${encodeURIComponent(recordId)}`);
}

async function findModelRecordForPrivateProfile(env: Env, row: Record<string, unknown>) {
  const modelName = toStr(row.model_name);
  const nickname = toStr(row.nickname);
  const phone = toStr(row.phone);
  const modelsTableId = env.AIRTABLE_TABLE_MODELS || AIRTABLE_MODELS_TABLE_DEFAULT;

  if (modelName) {
    const records = await findAirtableImportRecords(env, modelsTableId, "working_name", modelName);
    if (records.length) return records[0] as Record<string, unknown>;
  }
  if (nickname) {
    const records = await findAirtableImportRecords(env, modelsTableId, "nickname", nickname);
    if (records.length) return records[0] as Record<string, unknown>;
  }
  if (phone && phone !== "unknown") {
    const records = await findAirtableImportRecords(env, modelsTableId, "phone", phone);
    if (records.length) return records[0] as Record<string, unknown>;
  }
  return null;
}

async function attachPrivateProfileContext(
  env: Env,
  row: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  const noteRecordId = toStr(result.record_id);
  if (!noteRecordId || !env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES) return;

  const modelName = toStr(row.model_name);
  const displayName = toStr(row.display_name);

  let relatedClientId = "";
  if (modelName) {
    const clientMatch = await findAirtableImportRecords(
      env,
      env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS",
      "Client Name",
      modelName,
    );
    relatedClientId = toStr((clientMatch[0] as { id?: string } | undefined)?.id);
  }
  if (!relatedClientId && displayName) {
    const clientMatch = await findAirtableImportRecords(
      env,
      env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS",
      "Client Name",
      displayName,
    );
    relatedClientId = toStr((clientMatch[0] as { id?: string } | undefined)?.id);
  }
  if (relatedClientId) {
    await patchAirtableImportRecordWithFallbacks(env, env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES, noteRecordId, {
      "Related Client": [relatedClientId],
    });
  }

  const modelRecord = await findModelRecordForPrivateProfile(env, row);
  const modelRecordId = toStr((modelRecord as { id?: string } | null)?.id);
  if (!modelRecordId) return;

  const modelsTableId = env.AIRTABLE_TABLE_MODELS || AIRTABLE_MODELS_TABLE_DEFAULT;
  const current = await getAirtableImportRecord(env, modelsTableId, modelRecordId);
  const currentFields = current?.fields && typeof current.fields === "object"
    ? current.fields as Record<string, unknown>
    : {};
  const linkedNoteIds = Array.isArray(currentFields[AIRTABLE_MODELS_INTERNAL_NOTES_LINK_FIELD])
    ? currentFields[AIRTABLE_MODELS_INTERNAL_NOTES_LINK_FIELD].map((value) => toStr(value)).filter(Boolean)
    : [];
  const nextLinkedNoteIds = Array.from(new Set([...linkedNoteIds, noteRecordId]));
  const now = new Date().toISOString().slice(0, 10);
  const noteTitle = toStr(row.note_title);
  const summary = toStr(row.note_summary);
  const snippet = `[${now}] ${noteTitle}${summary ? ` :: ${summary}` : ""}`;
  const existingInternal = toStr(currentFields.internal_notes);

  const patchFields: Record<string, unknown> = {};
  if (!linkedNoteIds.includes(noteRecordId)) {
    patchFields[AIRTABLE_MODELS_INTERNAL_NOTES_LINK_FIELD] = nextLinkedNoteIds;
  }
  if (noteTitle && !existingInternal.includes(noteTitle)) {
    patchFields.internal_notes = [existingInternal, snippet].filter(Boolean).join("\n\n");
  }
  if (Object.keys(patchFields).length) {
    await patchAirtableImportRecordWithFallbacks(env, modelsTableId, modelRecordId, patchFields);
  }
}

async function airtableImportRequest(
  env: Env,
  tableId: string,
  init?: {
    method?: string;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  },
) {
  const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableId}`);
  if (init?.query) {
    Object.entries(init.query).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  const response = await fetch(url.toString(), {
    method: init?.method || "GET",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  const data = (() => {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  })();

  if (!response.ok) {
    throw new Error(`Airtable ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function findAirtableImportRecords(env: Env, tableId: string, fieldName: string, fieldValue: string) {
  const formula = `{${fieldName}}="${encodeFormulaValue(fieldValue)}"`;
  const data = await airtableImportRequest(env, tableId, {
    query: { filterByFormula: formula },
  });
  return Array.isArray(data.records) ? data.records : [];
}

async function createAirtableImportRecord(env: Env, tableId: string, fields: Record<string, unknown>) {
  return await airtableImportRequest(env, tableId, {
    method: "POST",
    body: { fields },
  });
}

async function patchAirtableImportRecord(
  env: Env,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
) {
  return await airtableImportRequest(env, `${tableId}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: { fields },
  });
}

function parseUnknownFieldName(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const jsonMatch = message.match(/Airtable\s+\d+:\s+({.*})$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as { error?: { message?: string } };
      const apiMessage = toStr(parsed.error?.message);
      const apiMatch = apiMessage.match(/Unknown field name:\s+"([^"]+)"/);
      if (apiMatch?.[1]) return apiMatch[1];
    } catch {
      // Fall through to regex parsing.
    }
  }
  const match =
    message.match(/Unknown field name:\s+\\?"([^"\\]+)\\?"/) ||
    message.match(/Unknown field name:\s+\\"([^"]+)\\"/) ||
    message.match(/Unknown field name:\s+"([^"]+)"/);
  return match?.[1] || "";
}

async function createAirtableImportRecordWithFallbacks(
  env: Env,
  tableId: string,
  fields: Record<string, unknown>,
) {
  const candidate = { ...fields };
  while (true) {
    try {
      return await createAirtableImportRecord(env, tableId, candidate);
    } catch (error) {
      const fieldName = parseUnknownFieldName(error);
      if (!fieldName) throw error;
      delete candidate[fieldName];
      if (!Object.keys(candidate).length) throw error;
    }
  }
}

async function patchAirtableImportRecordWithFallbacks(
  env: Env,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
) {
  const candidate = { ...fields };
  while (true) {
    try {
      return await patchAirtableImportRecord(env, tableId, recordId, candidate);
    } catch (error) {
      const fieldName = parseUnknownFieldName(error);
      if (!fieldName) throw error;
      delete candidate[fieldName];
      if (!Object.keys(candidate).length) throw error;
    }
  }
}

function importLogsTable(env: Env): string {
  return env.AIRTABLE_TABLE_IMPORT_LOGS || "MMD Import Logs";
}

async function writeImportLogToAirtable(
  env: Env,
  input: {
    label: string;
    route: string;
    import_type: string;
    mode: string;
    status: string;
    payload: unknown;
    request?: unknown;
    summary: unknown;
    counts?: unknown;
    error?: string;
  },
) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return;
  try {
    await createAirtableImportRecord(env, importLogsTable(env), compactFields({
      log_id: `import_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
      label: input.label,
      route: input.route,
      import_type: input.import_type,
      mode: input.mode,
      status: input.status,
      error: input.error || "",
      created_at: new Date().toISOString(),
      payload_json: JSON.stringify(input.payload || {}),
      request_json: JSON.stringify(input.request || {}),
      summary_json: JSON.stringify(input.summary || {}),
      counts_json: JSON.stringify(input.counts || {}),
    }));
  } catch (error) {
    console.warn("import log airtable write failed", error);
  }
}

function parseImportLogJson(value: unknown) {
  const raw = toStr(value).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown> | Array<unknown>;
  } catch {
    return null;
  }
}

function buildImportLogRequest(fields: Record<string, unknown>) {
  const request = parseImportLogJson(fields.request_json);
  if (request && typeof request === "object" && !Array.isArray(request)) {
    return request as Record<string, unknown>;
  }

  const payload = parseImportLogJson(fields.payload_json);
  const importType = toStr(fields.import_type);
  const mode = toStr(fields.mode);
  const route = toStr(fields.route);
  const apply = mode === "apply";

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { route };
  }

  if (importType === "all") {
    return {
      payload,
      booking_apply: mode === "apply" || mode === "mixed",
      model_history_apply: mode === "apply" || mode === "mixed",
    };
  }

  return {
    payload,
    apply,
  };
}

async function readImportLogsFromAirtable(env: Env, limit: number) {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 30;
  const data = await airtableImportRequest(env, importLogsTable(env), {
    query: {
      maxRecords: String(safeLimit),
      "sort[0][field]": "created_at",
      "sort[0][direction]": "desc",
    },
  });
  const records = Array.isArray(data.records) ? data.records : [];
  return records.map((record) => {
    const normalized = (record && typeof record === "object") ? record as Record<string, unknown> : {};
    const fields = normalized.fields && typeof normalized.fields === "object"
      ? normalized.fields as Record<string, unknown>
      : {};
    return {
      id: toStr(normalized.id) || toStr(fields.log_id),
      log_id: toStr(fields.log_id),
      label: toStr(fields.label) || "Import",
      route: toStr(fields.route),
      import_type: toStr(fields.import_type),
      mode: toStr(fields.mode) || "dry_run",
      status: toStr(fields.status) || "ok",
      error: toStr(fields.error),
      at: toStr(fields.created_at),
      source: "airtable",
      payload: parseImportLogJson(fields.payload_json),
      request: buildImportLogRequest(fields),
      summary: parseImportLogJson(fields.summary_json) || {},
      counts: parseImportLogJson(fields.counts_json) || {},
    };
  });
}

async function processModelHistoryImportEntity(
  env: Env,
  rows: Array<Record<string, unknown>>,
  config: {
    tableId: string;
    lookupForRow: (row: Record<string, unknown>) => { field: string; value: string };
    mapFields: (row: Record<string, unknown>) => Record<string, unknown>;
    allowUpdate?: boolean;
    afterWrite?: (
      row: Record<string, unknown>,
      result: Record<string, unknown>,
    ) => Promise<void>;
  },
  apply: boolean,
) {
  const results: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const lookup = config.lookupForRow(row);
    const fields = config.mapFields(row);
    if (!lookup.value) {
      results.push({
        source_key: "",
        action: "skipped_missing_lookup",
        lookup_field: lookup.field,
        fields,
      });
      continue;
    }

    const existing = await findAirtableImportRecords(env, config.tableId, lookup.field, lookup.value);
    if (existing.length) {
      const existingRecordIds = existing.map((record) => (record as { id?: string }).id).filter(Boolean);
      if (config.allowUpdate) {
        if (!apply) {
          results.push({
            source_key: lookup.value,
            action: "would_update",
            lookup_field: lookup.field,
            existing_record_ids: existingRecordIds,
            fields,
          });
          continue;
        }
        const recordId = toStr(existingRecordIds[0]);
        const updated = await patchAirtableImportRecordWithFallbacks(env, config.tableId, recordId, fields);
        results.push({
          source_key: lookup.value,
          action: "updated",
          lookup_field: lookup.field,
          existing_record_ids: existingRecordIds,
          record_id: toStr(updated.id) || recordId,
          fields,
        });
        if (config.afterWrite) {
          await config.afterWrite(row, results[results.length - 1] as Record<string, unknown>);
        }
        continue;
      }
      results.push({
        source_key: lookup.value,
        action: "skipped_existing",
        lookup_field: lookup.field,
        existing_record_ids: existingRecordIds,
        fields,
      });
      continue;
    }

    if (!apply) {
      results.push({
        source_key: lookup.value,
        action: "would_create",
        lookup_field: lookup.field,
        fields,
      });
      continue;
    }

    const created = await createAirtableImportRecordWithFallbacks(env, config.tableId, fields);
    results.push({
      source_key: lookup.value,
      action: "created",
      lookup_field: lookup.field,
      record_id: toStr(created.id),
      fields,
    });
    if (config.afterWrite) {
      await config.afterWrite(row, results[results.length - 1] as Record<string, unknown>);
    }
  }
  return results;
}

function buildRulesUrl(baseUrl: string, directUrl: string, pathOverride: string | undefined, fallbackPath: string): string {
  if (toStr(directUrl)) {
    return buildAbsoluteUrl(baseUrl, directUrl, fallbackPath);
  }
  return buildAbsoluteUrl(baseUrl, pathOverride, fallbackPath);
}

async function buildLinksBundle(
  env: Env,
  payload: {
    immigration_id: string;
    display_name?: string;
    email?: string;
    line_user_id?: string;
    memberstack_id?: string;
    model_name?: string;
    model_record_id?: string;
    rules_url?: string;
    customer_rules_path?: string;
    model_rules_path?: string;
    console_url?: string;
    membership_status?: string;
    current_tier?: string;
    target_tier?: string;
    requires_rules_ack?: boolean;
    requires_model_binding?: boolean;
    customer_onboarding_path?: string;
    model_onboarding_path?: string;
    customer_dashboard_path?: string;
    model_dashboard_path?: string;
    expires_in_hours?: number;
  },
) {
  const baseUrl = defaultPublicBaseUrl(env);
  const immigrationId = requiredString(payload.immigration_id, "immigration_id");
  const expiresInHours = clampExpiryHours(payload.expires_in_hours);
  const displayName = toStr(payload.display_name) || immigrationId;
  const modelName = toStr(payload.model_name) || `model_${immigrationId.slice(-6)}`;

  const customerIdentity = parseInviteIdentity({
    client_name: displayName,
    nickname: displayName,
    email: toStr(payload.email).toLowerCase(),
    line_user_id: toStr(payload.line_user_id),
    memberstack_id: toStr(payload.memberstack_id),
  });

  const modelIdentity = parseInviteIdentity({
    folder_name: modelName,
    nickname: modelName,
  });

  const customerRulesUrl = buildRulesUrl(
    baseUrl,
    toStr(payload.rules_url),
    payload.customer_rules_path,
    "/rules/customer",
  );
  const modelRulesUrl = buildRulesUrl(
    baseUrl,
    "",
    payload.model_rules_path,
    "/rules/private-model-work",
  );

  const customerInvite = await generateInviteLink(env, {
    invite_id: makeInviteId(),
    immigration_id: immigrationId,
    username: customerIdentity.username,
    nickname: customerIdentity.nickname,
    suffix_code: customerIdentity.suffix_code,
    mmd_client_name: customerIdentity.mmd_client_name,
    email: toStr(payload.email).toLowerCase(),
    line_user_id: toStr(payload.line_user_id),
    memberstack_id: toStr(payload.memberstack_id),
    invite_page: toStr(payload.customer_onboarding_path) || "/sigil/onboarding",
    expires_in_hours: expiresInHours,
    role: "customer",
    lane: "customer_onboarding",
    model_name: modelName,
    model_record_id: toStr(payload.model_record_id),
    rules_url: customerRulesUrl,
    console_url: toStr(payload.console_url),
    requires_rules_ack: boolFromUnknown(payload.requires_rules_ack, false),
    requires_model_binding: boolFromUnknown(payload.requires_model_binding, false),
  });

  const modelInvite = await generateInviteLink(env, {
    invite_id: makeInviteId(),
    immigration_id: immigrationId,
    username: modelIdentity.username,
    nickname: modelIdentity.nickname,
    suffix_code: modelIdentity.suffix_code,
    mmd_client_name: modelIdentity.mmd_client_name,
    invite_page: toStr(payload.model_onboarding_path) || "/model/onboarding",
    expires_in_hours: expiresInHours,
    role: "model",
    lane: "model_console",
    model_name: modelName,
    model_record_id: toStr(payload.model_record_id),
    rules_url: modelRulesUrl,
    console_url: toStr(payload.console_url),
    requires_rules_ack: boolFromUnknown(payload.requires_rules_ack, true),
    requires_model_binding: boolFromUnknown(payload.requires_model_binding, true),
  });

  const customerDashboardUrl = `${buildAbsoluteUrl(
    defaultCustomerDashboardBaseUrl(env),
    "/member/first-db",
    "/member/first-db",
  )}?t=${encodeURIComponent(customerInvite.customer_invite_t)}`;

  const modelDashboardUrl = `${buildAbsoluteUrl(
    baseUrl,
    toStr(payload.model_dashboard_path) || "/model/dashboard",
    "/model/dashboard",
  )}?t=${encodeURIComponent(modelInvite.customer_invite_t)}`;

  const context = await buildImmigrationLinkContext(env, {
    immigration_id: immigrationId,
    line_user_id: toStr(payload.line_user_id),
    memberstack_id: toStr(payload.memberstack_id),
    email: toStr(payload.email).toLowerCase(),
    display_name: displayName,
    membership_status: toStr(payload.membership_status),
    current_tier: toStr(payload.current_tier),
    target_tier: toStr(payload.target_tier),
  });

  return {
    immigration_id: immigrationId,
    expires_at: customerInvite.expires_at,
    expires_in_hours: expiresInHours,
    customer_token: customerInvite.customer_invite_t,
    model_token: modelInvite.customer_invite_t,
    customer_url: customerInvite.customer_onboarding_url,
    model_url: modelInvite.customer_onboarding_url,
    customer_rules_url: customerRulesUrl,
    model_rules_url: modelRulesUrl,
    customer_dashboard_url: customerDashboardUrl,
    model_dashboard_url: modelDashboardUrl,
    context,
  };
}

async function handleCreateImmigrationLinks(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as ImmigrationLinksRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid links payload is required", meta);
  }

  const data = await buildLinksBundle(env, payload);

  const body: ImmigrationLinksResponse = {
    ok: true,
    data,
    meta,
  };

  writeLinkAuditRecord(env, {
    immigration_id: data.immigration_id,
    display_name: payload.display_name,
    line_user_id: payload.line_user_id,
    memberstack_id: payload.memberstack_id,
    customer_url: data.customer_url,
    model_url: data.model_url,
    customer_rules_url: data.customer_rules_url,
    model_rules_url: data.model_rules_url,
    customer_dashboard_url: data.customer_dashboard_url,
    model_dashboard_url: data.model_dashboard_url,
    context: data.context,
  }).catch((error) => {
    console.warn("immigrate-worker create-links audit failed", error);
  });

  return json(body);
}

async function handleLogs(request: Request): Promise<Response> {
  const meta = makeMeta(request);
  const scope = new URL(request.url).searchParams.get("scope");
  const logs = scope ? seedLogs.filter((log) => log.scope === scope) : seedLogs;

  const body: LogsResponse = {
    ok: true,
    logs,
    message: "Mock logs loaded from immigrate-worker.",
    meta,
  };

  return json(body);
}

async function handleSessions(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const status = new URL(request.url).searchParams.get("status");

  if (env.REALTIME_SESSIONS_URL) {
    const response = await fetch(env.REALTIME_SESSIONS_URL + (status ? `?status=${encodeURIComponent(status)}` : ""), {
      headers: {
        "X-Internal-Token": readInternalToken(request) || env.INTERNAL_TOKEN,
      },
    });

    if (response.ok) {
      const payload = (await response.json()) as { sessions?: unknown[]; message?: string };
      return json({
        ok: true,
        sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
        message: payload.message || "Loaded sessions from realtime upstream.",
        meta,
      });
    }
  }

  if (canReadAirtable(env)) {
    try {
      const sessions = await listSessionsFromAirtable(env);
      const filtered = status ? sessions.filter((session) => session.status === status) : sessions;

      return json({
        ok: true,
        sessions: filtered,
        message: `Loaded ${filtered.length} sessions from Airtable.`,
        meta,
      });
    } catch (error) {
      console.warn("immigrate-worker sessions fallback to seed", error);
    }
  }

  const sessions = status ? seedSessions.filter((session) => session.status === status) : seedSessions;

  const body: SessionsResponse = {
    ok: true,
    sessions,
    message: `Loaded ${sessions.length} sessions from immigrate-worker placeholder feed.`,
    meta,
  };

  return json(body);
}

async function handleCreateLinksLegacy(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as InvitePayload | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("invalid request body", meta);
  }

  if (!hasCreateLinksUpstream(env)) {
    return badRequest("create-links upstream is not configured", meta, {
      field: "CREATE_LINKS_URL",
    });
  }

  const upstreamUrl = env.CREATE_LINKS_URL
    ? env.CREATE_LINKS_URL
    : env.JOBS_WORKER_BASE_URL
      ? `${env.JOBS_WORKER_BASE_URL.replace(/\/+$/, "")}/v1/jobs/create-links`
      : "";

  const invitePayload = payload as InvitePayload;
  const identity = parseInviteIdentity(toInviteIdentityPayload(invitePayload));
  const role = parseInviteRole(invitePayload.invite_role);
  const lane = parseInviteLane(invitePayload.invite_lane, role);
  let upstreamPayload: Record<string, unknown>;

  try {
    upstreamPayload = normalizeCreateLinksPayload(invitePayload, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_create_links_payload";
    return badRequest(message, meta);
  }

  const linkBundle = await buildLinksBundle(env, {
    immigration_id: toStr(invitePayload.session_id || invitePayload.payment_ref || `job_${Date.now().toString(36)}`),
    display_name: toStr(invitePayload.client_name || invitePayload.mmd_client_name),
    email: toStr(invitePayload.email || invitePayload.gmail).toLowerCase(),
    line_user_id: toStr(invitePayload.line_user_id),
    memberstack_id: toStr(invitePayload.memberstack_id),
    model_name: toStr(invitePayload.model_name),
    model_record_id: toStr(invitePayload.model_record_id),
    rules_url: toStr(invitePayload.rules_url),
    customer_rules_path: undefined,
    model_rules_path: undefined,
    console_url: toStr(invitePayload.console_url),
    requires_rules_ack: boolFromUnknown(invitePayload.requires_rules_ack, role === "model"),
    requires_model_binding: boolFromUnknown(invitePayload.requires_model_binding, role === "model"),
    customer_onboarding_path: role === "customer" ? toStr(invitePayload.invite_page) : undefined,
    model_onboarding_path: role === "model" ? toStr(invitePayload.invite_page) : undefined,
    expires_in_hours: Number(invitePayload.expires_in_hours || 24 * 7),
  });

  if (upstreamUrl) {
      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(upstreamPayload),
      });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";

    if (contentType.includes("application/json")) {
      try {
        const payloadJson = JSON.parse(text) as Record<string, unknown>;
        const merged = {
          ...payloadJson,
          onboarding_url: role === "model" ? linkBundle.model_url : linkBundle.customer_url,
          customer_onboarding_url: linkBundle.customer_url,
          model_onboarding_url: linkBundle.model_url,
          customer_rules_url: linkBundle.customer_rules_url,
          model_rules_url: linkBundle.model_rules_url,
          customer_dashboard_url: linkBundle.customer_dashboard_url,
          model_dashboard_url: linkBundle.model_dashboard_url,
          link_context: linkBundle.context,
          customer_username: identity.username,
          customer_invite_expires_at: linkBundle.expires_at,
          invite_role: role,
          invite_lane: lane,
        };

        writeLinkAuditRecord(env, {
          immigration_id: linkBundle.immigration_id,
          display_name: toStr(invitePayload.client_name || invitePayload.mmd_client_name),
          line_user_id: toStr(invitePayload.line_user_id),
          memberstack_id: toStr(invitePayload.memberstack_id),
          customer_url: linkBundle.customer_url,
          model_url: linkBundle.model_url,
          customer_rules_url: linkBundle.customer_rules_url,
          model_rules_url: linkBundle.model_rules_url,
          customer_dashboard_url: linkBundle.customer_dashboard_url,
          model_dashboard_url: linkBundle.model_dashboard_url,
          context: linkBundle.context,
        }).catch((error) => {
          console.warn("immigrate-worker internal create-links audit failed", error);
        });

        return json(merged);
      } catch (error) {
        console.warn("immigrate-worker create-links upstream json parse failed", error);
      }
    }

    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": contentType,
      },
    });
  }

  return json(
    {
      ok: true,
      url: `/jobs/mock/${String((payload as Record<string, unknown>).client || "client").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client"}-${String((payload as Record<string, unknown>).package || "session").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session"}`,
      message: "Mock job link created from immigrate-worker compatibility route.",
      onboarding_url: role === "model" ? linkBundle.model_url : linkBundle.customer_url,
      customer_onboarding_url: linkBundle.customer_url,
      model_onboarding_url: linkBundle.model_url,
      customer_rules_url: linkBundle.customer_rules_url,
      model_rules_url: linkBundle.model_rules_url,
      customer_dashboard_url: linkBundle.customer_dashboard_url,
      model_dashboard_url: linkBundle.model_dashboard_url,
      link_context: linkBundle.context,
      customer_username: identity.username,
      customer_invite_expires_at: linkBundle.expires_at,
      invite_role: role,
      invite_lane: lane,
      meta,
    },
  );
}

async function handleCustomerConfirm(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as CustomerBookingConfirmRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("invalid request body", meta);
  }

  const sessionId = toStr(payload.session_id);
  if (!sessionId) {
    return badRequest("missing_session_id", meta);
  }

  const paymentType = toStr(payload.payment_type).toLowerCase() === "full" ? "full" : "deposit";
  const selectedAmountRaw =
    payload.selected_amount_thb == null ? null : Number(payload.selected_amount_thb);
  const selectedAmount =
    selectedAmountRaw != null && Number.isFinite(selectedAmountRaw) ? selectedAmountRaw : null;

  try {
    const result = await confirmCustomerBookingToAirtable(env, {
      session_id: sessionId,
      payment_ref: toStr(payload.payment_ref),
      payment_type: paymentType,
      selected_amount_thb: selectedAmount ?? undefined,
      note: toStr(payload.note),
      client_name: toStr(payload.client_name),
    });

    const body: CustomerBookingConfirmResponse = {
      ok: true,
      data: {
        session_id: sessionId,
        payment_ref: result.payment_ref,
        payment_type: result.payment_type === "full" ? "full" : "deposit",
        selected_amount_thb: result.selected_amount_thb,
        session_status: result.session_status,
        payment_status: result.payment_status,
        confirmed_at: result.confirmed_at,
        mode: result.mode,
      },
      meta,
    };

    return publicJson(request, env, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "customer_confirm_failed";
    const status = message === "session_not_found" ? 404 : 400;
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: {
          code: status === 404 ? "SESSION_NOT_FOUND" : "INVALID_INPUT",
          message,
        },
        meta,
      },
      { status },
    );
  }
}

async function handleCreateInvite(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as InvitePayload | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("invalid request body", meta);
  }

  const role = parseInviteRole(payload.invite_role);
  const identitySource =
    role === "model"
      ? payload.folder_name || payload.model_name || payload.client_name || payload.nickname
      : payload.client_name || payload.nickname;
  requiredString(identitySource, role === "model" ? "folder_name" : "client_name");

  const identity = parseInviteIdentity(toInviteIdentityPayload(payload));
  const lane = parseInviteLane(payload.invite_lane, role);
  const invite = await generateInviteLink(env, {
    invite_id: makeInviteId(),
    username: identity.username,
    nickname: identity.nickname,
    suffix_code: identity.suffix_code,
    mmd_client_name: identity.mmd_client_name,
    email: toStr(payload.email || payload.gmail).toLowerCase(),
    line_user_id: toStr(payload.line_user_id),
    telegram_username: toStr(payload.telegram_username || payload.customer_telegram_username),
    memberstack_id: toStr(payload.memberstack_id),
    invite_page: toStr(payload.invite_page),
    expires_in_hours: Number(payload.expires_in_hours || 24 * 7),
    role,
    lane,
    model_name: toStr(payload.model_name),
    model_record_id: toStr(payload.model_record_id),
    rules_url: toStr(payload.rules_url),
    console_url: toStr(payload.console_url),
    requires_rules_ack: boolFromUnknown(payload.requires_rules_ack, role === "model"),
    requires_model_binding: boolFromUnknown(payload.requires_model_binding, role === "model"),
  });

  return json({
    ok: true,
    username: identity.username,
    nickname: identity.nickname,
    suffix_code: identity.suffix_code,
    mmd_client_name: identity.mmd_client_name,
    onboarding_url: invite.onboarding_url,
    customer_onboarding_url: invite.customer_onboarding_url,
    invite_role: role,
    invite_lane: lane,
    expires_at: invite.expires_at,
    meta,
  });
}

async function handleResolveInvite(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  try {
    const token = requiredString(new URL(request.url).searchParams.get("t"), "t");
    const invite = await verifyInviteToken(token, String(env.CONFIRM_KEY || env.INTERNAL_TOKEN || ""));
    const prefill: InvitePrefill = {
      username: invite.username,
      nickname: invite.nickname,
      suffix_code: invite.suffix_code,
      client_name: invite.mmd_client_name,
      display_name: invite.mmd_client_name,
      email: invite.email || "",
      line_user_id: invite.line_user_id || "",
      telegram_username: invite.telegram_username || "",
      memberstack_id: invite.memberstack_id || "",
      model_name: invite.model_name || "",
      model_record_id: invite.model_record_id || "",
    };
    const requirements: InviteRequirements = {
      rules_ack_required: Boolean(invite.requires_rules_ack),
      model_binding_required: Boolean(invite.requires_model_binding),
    };
    const experienceContract = buildExperienceContract(invite.role, invite.lane);

    const body: InviteResolveResponse = {
      ok: true,
      invite_id: invite.invite_id,
      role: invite.role,
      lane: invite.lane,
      prefill,
      requirements,
      immigration_id: invite.immigration_id || "",
      model_profile: {
        model_name: invite.model_name || "",
        model_record_id: invite.model_record_id || "",
      },
      routes: {
        rules_url: invite.rules_url || "",
        console_url: invite.console_url || "",
      },
      experience_contract: experienceContract,
      expires_at: new Date(invite.exp * 1000).toISOString(),
      meta,
    };

    return json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_invite_token";
    const status = message === "expired_invite_token" ? 410 : 400;
    return json(
      {
        ok: false,
        error: {
          code: status === 410 ? "INVITE_EXPIRED" : "INVALID_INVITE",
          message,
        },
        meta,
      },
      { status },
    );
  }
}

function isHealthRoute(pathname: string): boolean {
  return (
    pathname === CANONICAL.ping ||
    pathname === CANONICAL.health ||
    pathname === CONTROL_ROOM.health ||
    pathname === SIGIL.controlRoomHealth
  );
}

function isListRoute(pathname: string): boolean {
  return pathname === CANONICAL.list || pathname === CONTROL_ROOM.list || pathname === SIGIL.controlRoomList;
}

function isRefreshRoute(pathname: string): boolean {
  return pathname === CANONICAL.refresh || pathname === CONTROL_ROOM.refresh || pathname === SIGIL.controlRoomRefresh;
}

function isSyncRoute(pathname: string): boolean {
  return pathname === CANONICAL.sync || pathname === CONTROL_ROOM.sync || pathname === SIGIL.controlRoomSync;
}

function isPublicRenewalIntakeRoute(pathname: string): boolean {
  return pathname === PUBLIC.renewalIntake || pathname === SIGIL.renewalIntake;
}

function isPublicRenewalStatusRoute(pathname: string): boolean {
  return pathname === PUBLIC.renewalStatus || pathname === SIGIL.renewalStatus;
}

function isPublicBookingRequestRoute(pathname: string): boolean {
  return pathname === PUBLIC.bookingRequest;
}

function isPublicPointsTopupRoute(pathname: string): boolean {
  return pathname === PUBLIC.pointsTopup || pathname === SIGIL.pointsTopup;
}

function isPublicRenewalActivateVipRoute(pathname: string): boolean {
  return pathname === PUBLIC.renewalActivateVip || pathname === SIGIL.renewalActivateVip;
}

function isPublicRecoveryAckRoute(pathname: string): boolean {
  return pathname === SIGIL.recoveryAck;
}

function isPublicRecoveryComplaintEvidenceRoute(pathname: string): boolean {
  return pathname === PUBLIC.recoveryComplaintEvidence || pathname === SIGIL.recoveryComplaintEvidence;
}

function isPublicCustomerConfirmRoute(pathname: string): boolean {
  return pathname === PUBLIC.customerConfirm || pathname === JOBS.customerConfirm || pathname === SIGIL.customerConfirm;
}

function isPublicPrivateModelRoute(pathname: string): boolean {
  return pathname === PUBLIC.privateModelApply ||
    pathname === PUBLIC.privateModelUploadUrl ||
    pathname === PUBLIC.privateModelUploadFile ||
    pathname === SIGIL.privateModelApply ||
    pathname === SIGIL.privateModelUploadUrl ||
    pathname === SIGIL.privateModelUploadFile;
}

function isPublicPublicModelRoute(pathname: string): boolean {
  return pathname === PUBLIC.publicModelApply ||
    pathname === PUBLIC.publicModelUploadUrl ||
    pathname === PUBLIC.publicModelUploadFile ||
    pathname === SIGIL.publicModelApply ||
    pathname === SIGIL.publicModelUploadUrl ||
    pathname === SIGIL.publicModelUploadFile;
}

function isLogsRoute(pathname: string): boolean {
  return pathname === CONTROL_ROOM.logs || pathname === SIGIL.controlRoomLogs;
}

function isSessionsRoute(pathname: string): boolean {
  return (
    pathname === CONTROL_ROOM.sessions ||
    pathname === CONTROL_ROOM.sessionRefresh ||
    pathname === SIGIL.controlRoomSessions ||
    pathname === SIGIL.controlRoomSessionRefresh
  );
}

function parseCookieMap(request: Request): Map<string, string> {
  const raw = request.headers.get("cookie") || "";
  const map = new Map<string, string>();

  for (const part of raw.split(";")) {
    const [name, ...rest] = part.split("=");
    const key = name.trim();
    if (!key) continue;
    map.set(key, rest.join("=").trim());
  }

  return map;
}

function isProtectedBrowserRoute(pathname: string): boolean {
  // This worker only gates the immigration control-room surface, not the separate admin console.
  if (pathname === "/internal/admin/console" || pathname.startsWith("/internal/admin/console/")) {
    return false;
  }

  // /sigil/guide is a client/member route, not an admin route.
  // /mmd-blackcard is a public Black Card landing route, not an admin route.
  // /sigil/admin/login is the canonical internal admin login.
  const isAdminPage =
    pathname === CONTROL_ROOM.root ||
    pathname.startsWith(`${CONTROL_ROOM.root}/`) ||
    pathname === SIGIL.controlRoom ||
    pathname.startsWith(`${SIGIL.controlRoom}/`) ||
    pathname === SIGIL.booking ||
    pathname === SIGIL.createSession ||
    pathname === SIGIL.createJob;
  const isJobsPage = pathname === JOBS.root || pathname.startsWith(`${JOBS.root}/`);

  if (!isAdminPage && !isJobsPage) return false;
  if (
    pathname === CONTROL_ROOM.login ||
    pathname === CONTROL_ROOM.loginSession ||
    pathname === SIGIL.login ||
    pathname === SIGIL.loginSession
  ) return false;
  if (isHealthRoute(pathname)) return false;
  if (isListRoute(pathname)) return false;
  if (isRefreshRoute(pathname)) return false;
  if (isSyncRoute(pathname)) return false;
  if (isLogsRoute(pathname)) return false;
  if (isSessionsRoute(pathname)) return false;
  if (pathname === JOBS.createLinks || pathname === JOBS.createInvite) return false;

  return true;
}

function isSigilPath(pathname: string): boolean {
  return pathname === SIGIL.root || pathname.startsWith(`${SIGIL.root}/`);
}

function selectAdminLoginPath(pathname: string): string {
  return SIGIL.login;
}

function selectAdminDefaultNext(pathname: string): string {
  return isSigilPath(pathname) ? SIGIL.booking : ADMIN_GATE_DEFAULT_NEXT;
}

function getLegacyAdminPath(pathname: string): string {
  switch (pathname) {
    case SIGIL.login:
      return CONTROL_ROOM.login;
    case SIGIL.loginSession:
      return CONTROL_ROOM.loginSession;
    case SIGIL.verifyAccessCode:
      return CONTROL_ROOM.verifyAccessCode;
    case SIGIL.controlRoom:
      return CONTROL_ROOM.root;
    case SIGIL.controlRoomHealth:
      return CONTROL_ROOM.health;
    case SIGIL.controlRoomList:
      return CONTROL_ROOM.list;
    case SIGIL.controlRoomRefresh:
      return CONTROL_ROOM.refresh;
    case SIGIL.controlRoomSync:
      return CONTROL_ROOM.sync;
    case SIGIL.controlRoomLogs:
      return CONTROL_ROOM.logs;
    case SIGIL.controlRoomSessions:
      return CONTROL_ROOM.sessions;
    case SIGIL.controlRoomSessionRefresh:
      return CONTROL_ROOM.sessionRefresh;
    case SIGIL.booking:
    case SIGIL.createSession:
      return ADMIN_JOBS.createSessionLegacy;
    case SIGIL.createJob:
      return JOBS.createJob;
    case SIGIL.inviteResolve:
      return PUBLIC.onboardingResolve;
    case SIGIL.renewalStatus:
      return PUBLIC.renewalStatus;
    case SIGIL.renewalIntake:
      return PUBLIC.renewalIntake;
    case SIGIL.pointsTopup:
      return PUBLIC.pointsTopup;
    case SIGIL.renewalActivateVip:
      return PUBLIC.renewalActivateVip;
    case SIGIL.customerConfirm:
      return PUBLIC.customerConfirm;
    default:
      return pathname;
  }
}

function makeLoginRedirect(request: Request, pathname: string): Response {
  const url = new URL(request.url);
  const next = pathname + url.search;
  const loginUrl = new URL(selectAdminLoginPath(pathname), url.origin);
  loginUrl.searchParams.set("next", next);
  return redirect(loginUrl.toString(), 302);
}

function encodeGateSession(session: AdminGateSession): string {
  return btoa(JSON.stringify(session));
}

function decodeGateSession(value: string): AdminGateSession | null {
  try {
    const parsed = JSON.parse(atob(value)) as AdminGateSession;
    return parsed && parsed.ok === true ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeAdminBaseUrl(value: unknown, request: Request): string {
  const rawInput = toStr(value) || new URL(request.url).origin;
  const withProtocol = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("invalid_base_url");
  }

  const normalized = `https://${url.hostname.replace(/\/+$/, "")}`;
  if (!ADMIN_GATE_ALLOWED_BASE_URLS.has(normalized)) {
    throw new Error("base_url_not_allowed");
  }

  return normalized;
}

function defaultAdminGateBaseUrl(env: Env): string {
  const configured = toStr(env.ADMIN_WORKER_BASE_URL).replace(/\/+$/, "");
  if (configured.startsWith("https://")) return configured;
  return "https://admin-worker.malemodel-bkk.workers.dev";
}

function collectAdminVerifyCandidates(baseUrl: string, request: Request, env: Env): string[] {
  const candidates = new Set<string>();
  candidates.add(baseUrl);

  const adminWorkerBaseUrl = toStr(env.ADMIN_WORKER_BASE_URL).replace(/\/+$/, "");
  if (adminWorkerBaseUrl.startsWith("https://")) {
    candidates.add(adminWorkerBaseUrl);
  }

  const requestOrigin = new URL(request.url).origin.replace(/\/+$/, "");
  if (requestOrigin.startsWith("https://")) {
    candidates.add(requestOrigin);
  }

  if (baseUrl === "https://mmdbkk.com") {
    candidates.add("https://www.mmdbkk.com");
  } else if (baseUrl === "https://www.mmdbkk.com") {
    candidates.add("https://mmdbkk.com");
  }

  return [...candidates].filter(Boolean);
}

async function verifyAdminAuthority(
  baseUrl: string,
  request: Request,
  env: Env,
  headers: Headers,
): Promise<boolean> {
  if (env.ADMIN_WORKER) {
    try {
      const serviceRequest = new Request("https://admin-worker.internal/v1/admin/ping", {
        method: "GET",
        headers: new Headers(headers),
      });
      const serviceResponse = await env.ADMIN_WORKER.fetch(serviceRequest);
      if (serviceResponse.ok) return true;
    } catch (error) {
      console.warn("admin ping verify failed via service binding", error);
    }
  }

  for (const candidate of collectAdminVerifyCandidates(baseUrl, request, env)) {
    try {
      const response = await fetch(`${candidate}/v1/admin/ping`, {
        method: "GET",
        headers: new Headers(headers),
      });
      if (response.ok) return true;
    } catch (error) {
      console.warn("admin ping verify failed", candidate, error);
    }
  }

  return false;
}

function makeGateSessionCookie(request: Request, session: AdminGateSession): string {
  const isSecure = new URL(request.url).protocol === "https:";
  const parts = [
    `${ADMIN_GATE_SESSION_KEY}=${encodeURIComponent(encodeGateSession(session))}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(ADMIN_GATE_TTL_MS / 1000)}`,
  ];

  if (isSecure) parts.push("Secure");
  return parts.join("; ");
}

function clearGateSessionCookie(request: Request): string {
  const isSecure = new URL(request.url).protocol === "https:";
  const parts = [
    `${ADMIN_GATE_SESSION_KEY}=`,
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (isSecure) parts.push("Secure");
  return parts.join("; ");
}

function normalizeAdminNextPath(value: unknown, fallback: string = ADMIN_GATE_DEFAULT_NEXT): string {
  const raw = toStr(value);
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(raw, "https://mmdbkk.com");
    if (parsed.origin !== "https://mmdbkk.com") {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function readGateSession(request: Request): AdminGateSession | null {
  const cookieValue = parseCookieMap(request).get(ADMIN_GATE_SESSION_KEY);
  if (!cookieValue) return null;
  return decodeGateSession(decodeURIComponent(cookieValue));
}

function isGateSessionValid(session: AdminGateSession | null): session is AdminGateSession {
  if (!session || session.ok !== true) return false;
  if (!session.baseUrl || !ADMIN_GATE_ALLOWED_BASE_URLS.has(session.baseUrl)) return false;
  if (!session.bearer && !session.confirmKey) return false;
  if (!Number.isFinite(session.at)) return false;
  if (Date.now() - session.at > ADMIN_GATE_TTL_MS) return false;
  return true;
}

function getValidatedGateSession(request: Request): AdminGateSession | null {
  const session = readGateSession(request);
  return isGateSessionValid(session) ? session : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripTelegramHtml(value: string): string {
  return String(value || "")
    .replace(/<\/?(?:b|code)>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function adminGateBootstrapScript(session: AdminGateSession, next: string, loginPath: string): string {
  return `
<script>
(() => {
  const KEY = ${JSON.stringify(ADMIN_GATE_SESSION_KEY)};
  const TTL_MS = ${String(ADMIN_GATE_TTL_MS)};
  const LOGIN_PATH = ${JSON.stringify(loginPath)};
  const serverSession = ${JSON.stringify(session)};
  const defaultNext = ${JSON.stringify(next)};

  function isValid(value) {
    return !!value &&
      value.ok === true &&
      typeof value.at === "number" &&
      Date.now() - value.at <= TTL_MS &&
      typeof value.baseUrl === "string" &&
      value.baseUrl.length > 0 &&
      (value.bearer || value.confirmKey);
  }

  function getNextUrl() {
    return location.pathname + location.search + location.hash;
  }

  function redirectToLogin() {
    try { sessionStorage.removeItem(KEY); } catch {}
    location.replace(LOGIN_PATH + "?next=" + encodeURIComponent(getNextUrl() || defaultNext));
  }

  let session = null;
  try {
    session = JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    session = null;
  }

  if (!isValid(session) && isValid(serverSession)) {
    session = serverSession;
    try { sessionStorage.setItem(KEY, JSON.stringify(session)); } catch {}
  }

  if (!isValid(session)) {
    redirectToLogin();
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.__MMD_ADMIN_GATE__ = {
    key: KEY,
    session,
    getSession() {
      return session;
    },
    buildHeaders(extraHeaders) {
      const headers = new Headers(extraHeaders || {});
      if (session.bearer) headers.set("Authorization", "Bearer " + session.bearer);
      if (session.confirmKey) headers.set("X-Confirm-Key", session.confirmKey);
      return headers;
    },
    logout() {
      try { sessionStorage.removeItem(KEY); } catch {}
      return originalFetch(${JSON.stringify(loginPath === SIGIL.login ? SIGIL.loginSession : CONTROL_ROOM.loginSession)}, { method: "DELETE", credentials: "same-origin" })
        .finally(() => location.replace(LOGIN_PATH + "?next=" + encodeURIComponent(defaultNext)));
    }
  };

  window.fetch = function(input, init) {
    const raw = typeof input === "string" || input instanceof URL ? String(input) : "";
    if (!raw) return originalFetch(input, init);

    const url = new URL(raw, location.origin);
    if (!url.pathname.startsWith("/v1/admin/")) {
      return originalFetch(input, init);
    }

    const target = session.baseUrl.replace(/\\/+$/, "") + url.pathname + url.search + url.hash;
    const headers = window.__MMD_ADMIN_GATE__.buildHeaders(init && init.headers);
    return originalFetch(target, { ...init, headers });
  };
})();
</script>`;
}

async function withInjectedAdminBootstrap(
  request: Request,
  response: Response,
  session: AdminGateSession,
): Promise<Response> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return response;
  }

  const html = await response.text();
  const requestUrl = new URL(request.url);
  const next = normalizeAdminNextPath(
    requestUrl.pathname + requestUrl.search,
    selectAdminDefaultNext(requestUrl.pathname),
  );
  const loginPath = selectAdminLoginPath(requestUrl.pathname);
  const injected = html.includes("</head>")
    ? html.replace("</head>", `${adminGateBootstrapScript(session, next, loginPath)}</head>`)
    : `${adminGateBootstrapScript(session, next, loginPath)}${html}`;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function withInjectedSigilAdminBootstrap(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return response;
  }

  const html = await response.text();
  const injected = html.includes("</head>")
    ? html.replace("</head>", `${sigilAdminBrowserBootstrapScript()}</head>`)
    : `${sigilAdminBrowserBootstrapScript()}${html}`;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function renderAdminLoginPage(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const fallbackNext = url.pathname === SIGIL.login ? SIGIL.createSession : CONTROL_ROOM.root;
  const normalizedNext = normalizeAdminNextPath(url.searchParams.get("next"), fallbackNext);
  const next = normalizedNext === "/internal" ||
    normalizedNext.startsWith("/internal/") ||
    normalizedNext === SIGIL.booking ||
    isSigilAdminPath(normalizedNext)
    ? normalizedNext
    : fallbackNext;

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SIGIL Admin Gate</title>
    <style>
      :root {
        color-scheme: dark;
        --login12-text: #fff7e8;
        --login12-muted: rgba(255, 247, 232, 0.66);
        --login12-line: rgba(232, 198, 126, 0.28);
        --login12-gold: #d9b66d;
        --login12-danger: #ffbea2;
      }

      * { box-sizing: border-box; }
      html, body { min-height: 100%; }

      body {
        margin: 0;
        color: var(--login12-text);
        background: #050403;
        font-family: Inter, "Avenir Next", "Segoe UI", "Noto Sans Thai", Arial, sans-serif;
      }

      .mmd-admin-login12 {
        position: relative;
        min-height: 100vh;
        overflow: hidden;
        isolation: isolate;
        background: #050403;
      }

      .mmd-admin-login12__bg {
        position: absolute;
        inset: 0;
        z-index: -2;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center center;
      }

      .mmd-admin-login12__shade {
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background:
          radial-gradient(circle at 51% 49%, rgba(0, 0, 0, 0.34), transparent 21%),
          radial-gradient(circle at 51% 49%, rgba(6, 5, 3, 0.62), transparent 40%),
          linear-gradient(90deg, rgba(0, 0, 0, 0.38), rgba(0, 0, 0, 0.08) 44%, rgba(0, 0, 0, 0.44));
      }

      .mmd-admin-login12__stage {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(18px, 1fr) minmax(300px, 420px) minmax(18px, 1fr);
        align-items: center;
        padding: clamp(18px, 4vw, 56px);
      }

      .mmd-admin-login12__panel {
        grid-column: 2;
        position: relative;
        width: min(100%, 402px);
        justify-self: center;
        transform: translateY(4vh);
        border: 1px solid var(--login12-line);
        border-radius: 20px;
        padding: 25px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.03)),
          rgba(6, 5, 4, 0.72);
        box-shadow:
          0 30px 86px rgba(0, 0, 0, 0.54),
          0 0 0 1px rgba(0, 0, 0, 0.22),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(24px) saturate(1.05);
      }

      .mmd-admin-login12__panel::before {
        content: "";
        position: absolute;
        inset: -18px;
        z-index: -1;
        border-radius: 28px;
        background: rgba(0, 0, 0, 0.24);
        filter: blur(18px);
      }

      .mmd-admin-login12__kicker {
        margin: 0 0 14px;
        color: var(--login12-gold);
        font-size: 11px;
        line-height: 1;
        font-weight: 800;
        letter-spacing: 0.22em;
        text-transform: uppercase;
      }

      .mmd-admin-login12__form {
        display: grid;
        gap: 12px;
        margin: 0;
      }

      .mmd-admin-login12__label {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      .mmd-admin-login12__input {
        width: 100%;
        min-height: 52px;
        border: 1px solid rgba(232, 198, 126, 0.24);
        border-radius: 14px;
        padding: 0 15px;
        outline: none;
        color: var(--login12-text);
        background: rgba(0, 0, 0, 0.42);
        font: inherit;
      }

      .mmd-admin-login12__input::placeholder { color: rgba(255, 247, 232, 0.46); }
      .mmd-admin-login12__input:focus {
        border-color: rgba(232, 198, 126, 0.72);
        box-shadow: 0 0 0 4px rgba(217, 182, 109, 0.10);
      }

      .mmd-admin-login12__button {
        min-height: 52px;
        border: 1px solid rgba(232, 198, 126, 0.58);
        border-radius: 999px;
        color: #140f08;
        background: linear-gradient(180deg, #ffe4a6 0%, #d8ad59 48%, #a7742c 100%);
        font: 850 13px/1 Inter, "Avenir Next", "Segoe UI", Arial, sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 14px 34px rgba(0, 0, 0, 0.34);
      }

      .mmd-admin-login12__button:disabled {
        cursor: wait;
        opacity: 0.68;
      }

      .mmd-admin-login12__status {
        min-height: 20px;
        margin: 1px 0 0;
        color: var(--login12-muted);
        font-size: 12px;
        line-height: 1.5;
        text-align: center;
      }

      .mmd-admin-login12__status[data-tone="error"] { color: var(--login12-danger); }
      .mmd-admin-login12__status[data-tone="ok"] { color: rgba(244, 213, 143, 0.94); }

      .mmd-admin-login12__note {
        margin: 2px 0 0;
        color: rgba(255, 247, 232, 0.58);
        font-size: 11px;
        line-height: 1.5;
        text-align: center;
      }
      .mmd-admin-login12__canary {
        width: fit-content;
        margin: 0 0 12px;
        padding: 6px 9px;
        border: 1px solid rgba(232, 198, 126, 0.28);
        border-radius: 8px;
        color: rgba(255, 228, 166, 0.82);
        background: rgba(0, 0, 0, 0.28);
        font-size: 10px;
        line-height: 1;
        font-weight: 850;
      }

      @media (min-width: 980px) {
        .mmd-admin-login12__panel { transform: translate(2vw, 4vh); }
      }

      @media (max-width: 760px) {
        .mmd-admin-login12__bg { object-position: center top; }
        .mmd-admin-login12__stage {
          align-items: end;
          padding: 18px;
        }
        .mmd-admin-login12__panel {
          transform: none;
          margin-bottom: 9vh;
        }
      }
    </style>
  </head>
  <body>
    <main id="sigil-admin-login" class="sigil-admin-login mmd-admin-login12" data-mmd-admin-login12 data-route="${url.pathname}" data-action="${url.pathname === SIGIL.login ? SIGIL.loginSession : CONTROL_ROOM.loginSession}" data-next="${next}">
      <img
        class="mmd-admin-login12__bg"
        src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a09e4421f8599631d51a35f_Login%20Ewvon.webp"
        alt=""
        aria-hidden="true"
        loading="eager"
      />
      <div class="mmd-admin-login12__shade" aria-hidden="true"></div>

      <div class="mmd-admin-login12__stage">
        <section class="mmd-admin-login12__panel" aria-label="Admin authorization">
          <p class="mmd-admin-login12__canary">${SIGIL_ADMIN_LOGIN_BUILD}</p>
          <p class="mmd-admin-login12__kicker">SIGIL Admin Gate</p>

          <form id="admin-login-form" class="mmd-admin-login12__form" method="post" action="${url.pathname === SIGIL.login ? SIGIL.loginSession : CONTROL_ROOM.loginSession}">
            <input name="next" type="hidden" value="${next}" />
            <input name="t" type="hidden" value="" />
            <label class="mmd-admin-login12__label" for="accessCode">Admin password or access code</label>
            <input id="accessCode" class="mmd-admin-login12__input" name="accessCode" type="password" placeholder="Admin password" autocomplete="current-password" autofocus />
            <button id="submit" class="mmd-admin-login12__button" type="submit">Enter Control Room</button>
            <p class="mmd-admin-login12__note">Authorized internal operators only.</p>
            <p id="status" class="mmd-admin-login12__status" role="status" aria-live="polite"></p>
          </form>
        </section>
      </div>
    </main>

    <script>
      (() => {
        const next = ${JSON.stringify(next)};
        const form = document.getElementById("admin-login-form");
        const accessCode = document.getElementById("accessCode");
        const status = document.getElementById("status");
        const submit = document.getElementById("submit");
        const authSessionPath = "/v1/admin/auth/session";
        const authMePath = "/v1/admin/auth/me";

        function setStatus(message, tone) {
          status.textContent = message || "";
          status.dataset.tone = tone || "";
        }

        setStatus("", "");

        function normalizeNext(value) {
          try {
            const url = new URL(value || next, location.origin);
            if (url.origin !== location.origin) return ${JSON.stringify(fallbackNext)};
            const out = url.pathname + url.search + url.hash;
            return out === "/internal" || out.indexOf("/internal/") === 0 || out.indexOf("/sigil/admin/") === 0
              ? out
              : ${JSON.stringify(fallbackNext)};
          } catch {
            return ${JSON.stringify(fallbackNext)};
          }
        }

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setStatus("", "");
          const code = accessCode.value.trim();
          if (!code) {
            setStatus("Enter the access code.", "error");
            accessCode.focus();
            return;
          }

          submit.disabled = true;
          submit.textContent = "Checking";

          try {
            const response = await fetch(authSessionPath, {
              method: "POST",
              credentials: "include",
              headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ accessCode: code, next: normalizeNext(next) })
            });

            const data = await response.json().catch(() => null);
            if (!response.ok || !data || !data.ok) {
              setStatus("Access denied.", "error");
              return;
            }

            const me = await fetch(authMePath, {
              method: "GET",
              credentials: "include",
              headers: { "Accept": "application/json" }
            });

            if (!me.ok) {
              setStatus("Authorized, but session check failed. Try again.", "error");
              return;
            }

            setStatus("Authorized.", "ok");
            location.replace(normalizeNext(next));
          } catch (err) {
            setStatus("Unable to sign in right now.", "error");
          } finally {
            submit.disabled = false;
            submit.textContent = "Enter Control Room";
          }
        });
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": "immigrate-worker",
      "x-mmd-sigil-login-build": SIGIL_ADMIN_LOGIN_BUILD,
    },
  });
}

function renderMemberLoginPage(): Response {
  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD SĪGIL Member Access</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Noto+Sans+Thai:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <script
      data-memberstack-domain="https://memberstack-client.mmdbkk.com"
      data-memberstack-app="app_cmjajuv1600150su284ov77w1"
      src="https://static.memberstack.com/scripts/v2/memberstack.js"
      type="text/javascript"></script>
    <style>
      :root {
        color-scheme: dark;
        --member-login-bg: #050403;
        --member-login-panel: rgba(10, 8, 6, 0.72);
        --member-login-line: rgba(226, 190, 111, 0.28);
        --member-login-gold: #d9b66d;
        --member-login-text: #fff3dd;
        --member-login-muted: rgba(255, 243, 221, 0.66);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        min-height: 100%;
      }

      body {
        margin: 0;
        color: var(--member-login-text);
        background: var(--member-login-bg);
        font-family: Inter, "Noto Sans Thai", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .sigil-member-login {
        position: relative;
        min-height: 100vh;
        overflow: hidden;
        isolation: isolate;
        background: var(--member-login-bg);
      }

      .sigil-member-login__hero {
        position: absolute;
        inset: 0;
        z-index: -2;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center center;
      }

      .sigil-member-login__veil {
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background:
          linear-gradient(90deg, rgba(0, 0, 0, 0.74), rgba(0, 0, 0, 0.44) 42%, rgba(0, 0, 0, 0.16)),
          linear-gradient(180deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.62));
      }

      .sigil-member-login__layout {
        min-height: 100vh;
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
        gap: clamp(18px, 4vw, 56px);
        align-items: center;
        padding: clamp(24px, 6vw, 72px) 0;
      }

      .sigil-member-login__copy {
        max-width: 520px;
        align-self: end;
        padding-bottom: clamp(18px, 8vh, 92px);
      }

      .sigil-member-login__eyebrow,
      .sigil-member-login__help-kicker {
        margin: 0 0 12px;
        color: var(--member-login-gold);
        font-size: 11px;
        line-height: 1;
        font-weight: 800;
        letter-spacing: 0.22em;
        text-transform: uppercase;
      }

      .sigil-member-login__title {
        margin: 0 0 16px;
        font-size: clamp(44px, 6vw, 86px);
        line-height: 0.94;
        font-weight: 850;
        letter-spacing: 0;
      }

      .sigil-member-login__text {
        margin: 0;
        max-width: 460px;
        color: var(--member-login-muted);
        font-size: 16px;
        line-height: 1.72;
      }

      .sigil-member-login__stack {
        display: grid;
        gap: 14px;
      }

      .sigil-member-login__card,
      .sigil-member-login__help {
        border: 1px solid var(--member-login-line);
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.018)),
          var(--member-login-panel);
        box-shadow: 0 24px 76px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(18px);
      }

      .sigil-member-login__card {
        padding: 24px;
      }

      .sigil-member-login__card h1 {
        margin: 0 0 8px;
        font-size: 25px;
        line-height: 1.12;
        letter-spacing: 0;
      }

      .sigil-member-login__card p {
        margin: 0 0 20px;
        color: var(--member-login-muted);
        font-size: 13px;
        line-height: 1.6;
      }

      .sigil-member-login__form {
        display: grid;
        gap: 12px;
      }

      .sigil-member-login__form label {
        display: grid;
        gap: 7px;
        color: rgba(255, 243, 221, 0.72);
        font-size: 12px;
      }

      .sigil-member-login__form input {
        width: 100%;
        min-height: 48px;
        border: 1px solid rgba(226, 190, 111, 0.24);
        border-radius: 12px;
        padding: 0 14px;
        outline: none;
        color: var(--member-login-text);
        background: rgba(0, 0, 0, 0.34);
        font: inherit;
      }

      .sigil-member-login__form input:focus {
        border-color: rgba(226, 190, 111, 0.72);
        box-shadow: 0 0 0 4px rgba(217, 182, 109, 0.10);
      }

      .sigil-member-login__button {
        min-height: 48px;
        border: 1px solid rgba(232, 198, 126, 0.62);
        border-radius: 999px;
        color: #140f08;
        background: linear-gradient(180deg, #ffe4a6 0%, #d8ad59 48%, #a7742c 100%);
        font: 850 13px/1 Inter, "Noto Sans Thai", sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
      }

      .sigil-member-login__links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 14px;
        margin-top: 16px;
      }

      .sigil-member-login__links a,
      .sigil-member-login__help a {
        color: rgba(255, 232, 180, 0.92);
        text-decoration: none;
        font-size: 12px;
      }

      .sigil-member-login__links a:hover,
      .sigil-member-login__help a:hover {
        text-decoration: underline;
      }

      .sigil-member-login__help {
        padding: 18px;
      }

      .sigil-member-login__help p {
        margin: 0;
        color: var(--member-login-muted);
        font-size: 13px;
        line-height: 1.65;
      }

      .sigil-member-login__help-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 14px;
        margin-top: 14px;
      }

      @media (max-width: 860px) {
        .sigil-member-login__layout {
          grid-template-columns: 1fr;
          align-items: end;
        }

        .sigil-member-login__copy {
          padding-bottom: 0;
        }

        .sigil-member-login__title {
          font-size: clamp(38px, 13vw, 58px);
        }
      }
    </style>
  </head>
  <body>
    <section class="sigil-member-login" data-sigil-member-login>
      <img
        class="sigil-member-login__hero"
        src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69e357bcd29016c25aba0b63_Kenji%20PN%20Dashboard.webp"
        alt=""
        aria-hidden="true"
        loading="eager"
      />
      <div class="sigil-member-login__veil" aria-hidden="true"></div>

      <div class="sigil-member-login__layout">
        <div class="sigil-member-login__copy" aria-label="Member access introduction">
          <p class="sigil-member-login__eyebrow">Member Access</p>
          <h2 class="sigil-member-login__title">Welcome Back</h2>
          <p class="sigil-member-login__text">
            Continue your private member route with Kenji. Sign in to review membership, renewal, payment, and booking continuity.
          </p>
        </div>

        <div class="sigil-member-login__stack">
          <main class="sigil-member-login__card" aria-label="Member login">
            <h1>Member Access</h1>
            <p>Use the email and password connected to your MMD Privé membership.</p>

            <form class="sigil-member-login__form" data-ms-form="login">
              <label>
                <span>Email</span>
                <input type="email" name="email" autocomplete="email" data-ms-member="email" required />
              </label>
              <label>
                <span>Password</span>
                <input type="password" name="password" autocomplete="current-password" data-ms-member="password" required />
              </label>
              <button class="sigil-member-login__button" type="submit">Login</button>
            </form>

            <nav class="sigil-member-login__links" aria-label="Member account links">
              <a href="/password-reset">Password reset</a>
              <a href="${SIGIL_RENEWAL_URL}">Renewal</a>
              <a href="/contact">Contact team</a>
            </nav>
          </main>

          <aside class="sigil-member-login__help" aria-label="Member support">
            <p class="sigil-member-login__help-kicker">Need Help?</p>
            <p>If your access expired or your renewal is pending, continue through renewal or contact the team for a private support check.</p>
            <div class="sigil-member-login__help-actions">
              <a href="${SIGIL_RENEWAL_URL}">Renew membership</a>
              <a href="/contact">Contact team</a>
            </div>
          </aside>
        </div>
      </div>
    </section>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": "immigrate-worker",
      "x-mmd-page": "member-login",
    },
  });
}

const SIGIL_LOGIN_PATH = "/sigil/login";
const SIGIL_LOGIN_BUILD = "sigil-login-only-memberstack-shell-20260517a";
const SIGIL_RENEWAL_PATH = "/sigil/pay/renewal";
const SIGIL_RENEWAL_URL = "https://www.mmdbkk.com/sigil/pay/renewal";

function renderSigilLoginOnlyPage(request: Request): Response {
  const url = new URL(request.url);
  const rawMode = (url.searchParams.get("mode") || "login").toLowerCase();
  const mode = rawMode === "recovery" || rawMode === "recover" || rawMode === "forgot" || rawMode === "password" || rawMode === "reset"
    ? "recovery"
    : rawMode === "renewal" || rawMode === "renew" || rawMode === "expired"
      ? "renewal"
      : "login";
  const afterLogin = "/sigil/member/account";
  const renewalUrl = SIGIL_RENEWAL_URL;
  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SIGIL Member Login</title>
    <!-- SIGIL_LOGIN_BUILD: ${SIGIL_LOGIN_BUILD} -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
    <script
      data-memberstack-domain="https://memberstack-client.mmdbkk.com"
      data-memberstack-app="app_cmjajuv1600150su284ov77w1"
      src="https://static.memberstack.com/scripts/v2/memberstack.js"
      type="text/javascript"></script>
    <style>
      :root { color-scheme: dark; --bg:#050403; --panel:rgba(12,9,6,.84); --line:rgba(184,135,61,.34); --text:rgba(243,229,203,.94); --muted:rgba(224,207,178,.72); --gold:#d9b66b; --gold2:#ead18a; --ink:#100b04; --red:#ffb0a0; --green:#91e0ac; }
      * { box-sizing: border-box; letter-spacing: 0; }
      body { margin:0; min-height:100vh; color:var(--text); background: radial-gradient(circle at 50% 0%, rgba(184,135,61,.14), transparent 34%), linear-gradient(180deg,#0a0704,var(--bg)); font-family:"Noto Sans Thai", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .sigil-login-only { min-height:100vh; display:grid; place-items:center; padding:22px 16px; }
      .sigil-login-only__card { width:min(100%, 430px); border:1px solid var(--line); border-radius:24px; overflow:hidden; background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.025)), var(--panel); box-shadow:0 30px 90px rgba(0,0,0,.48); backdrop-filter:blur(18px); }
      .sigil-login-only__head { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:22px 22px 14px; }
      .sigil-login-only__head small { display:block; margin-bottom:5px; color:var(--gold); font-size:11px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
      .sigil-login-only__head strong { display:block; font-size:22px; line-height:1.1; }
      .sigil-login-only__logo { display:grid; place-items:center; width:54px; height:54px; border:1px solid rgba(217,182,107,.34); border-radius:18px; background:rgba(0,0,0,.24); overflow:hidden; }
      .sigil-login-only__logo img { width:72%; height:72%; object-fit:contain; }
      .sigil-login-only__tabs { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; padding:12px; margin:0 14px; border:1px solid rgba(145,103,45,.26); border-radius:18px; background:rgba(0,0,0,.18); }
      .sigil-login-only__tabs button { min-height:40px; border:0; border-radius:13px; color:var(--muted); background:transparent; font:800 13px/1 inherit; cursor:pointer; }
      .sigil-login-only__tabs button.is-active { color:var(--ink); background:linear-gradient(135deg,#ead18a,#c19043 48%,#8a571f); }
      .sigil-login-only__body { padding:18px 22px 22px; }
      .sigil-login-only__form { display:none; gap:14px; }
      .sigil-login-only__form.is-active { display:grid; }
      .sigil-login-only__field { display:grid; gap:8px; color:var(--gold); font-size:12px; font-weight:800; }
      .sigil-login-only__field input, .sigil-login-only__field textarea { width:100%; min-height:48px; border:1px solid rgba(184,135,61,.34); border-radius:14px; padding:0 14px; outline:none; color:var(--text); background:rgba(0,0,0,.30); font:inherit; }
      .sigil-login-only__field textarea { min-height:96px; padding-top:12px; resize:vertical; }
      .sigil-login-only__field input:focus, .sigil-login-only__field textarea:focus { border-color:rgba(234,209,138,.78); box-shadow:0 0 0 4px rgba(217,182,107,.10); }
      .sigil-login-only__password { display:grid; grid-template-columns:1fr auto; gap:8px; }
      .sigil-login-only__password button, .sigil-login-only__textBtn { border:1px solid rgba(184,135,61,.28); border-radius:14px; padding:0 12px; color:var(--muted); background:rgba(0,0,0,.18); cursor:pointer; }
      .sigil-login-only__row { display:flex; justify-content:space-between; align-items:center; gap:12px; color:var(--muted); font-size:12px; }
      .sigil-login-only__check { display:inline-flex; align-items:center; gap:8px; }
      .sigil-login-only__submit { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; min-height:50px; border:1px solid rgba(234,209,138,.72); border-radius:999px; padding:0 18px; color:var(--ink); background:linear-gradient(135deg,#ead18a,#c19043 48%,#8a571f); font:900 14px/1 inherit; text-decoration:none; cursor:pointer; }
      .sigil-login-only__submit--dark { color:var(--text); background:rgba(0,0,0,.24); border-color:rgba(184,135,61,.30); }
      .sigil-login-only__renewBox { border:1px solid rgba(184,135,61,.24); border-radius:18px; padding:16px; background:rgba(0,0,0,.22); }
      .sigil-login-only__renewBox small { color:var(--gold); font-weight:900; letter-spacing:.14em; }
      .sigil-login-only__renewBox strong { display:block; margin-top:8px; }
      .sigil-login-only__renewBox p, .sigil-login-only__micro { margin:8px 0 0; color:var(--muted); font-size:12px; line-height:1.55; }
      .sigil-login-only__status { min-height:20px; margin:14px 0 0; color:var(--muted); font-size:12px; text-align:center; line-height:1.5; }
      .sigil-login-only__status.is-ok { color:var(--green); }
      .sigil-login-only__status.is-warn { color:var(--gold2); }
      .sigil-login-only__status.is-bad { color:var(--red); }
    </style>
  </head>
  <body>
    <main class="sigil-login-only" data-sigil-login-only data-mode="${mode}" data-build="${SIGIL_LOGIN_BUILD}">
      <div hidden>SIGIL_LOGIN_BUILD: ${SIGIL_LOGIN_BUILD}</div>
      <section class="sigil-login-only__card" aria-label="SIGIL login form">
        <header class="sigil-login-only__head">
          <div>
            <small>ACCESS STATE</small>
            <strong data-login-title>Member Login</strong>
          </div>
          <span class="sigil-login-only__logo" aria-hidden="true">
            <img src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69fecc6678e39b59002adbb5_SIGILWeb%20Logo.webp" alt="" />
          </span>
        </header>
        <nav class="sigil-login-only__tabs" aria-label="Login modes">
          <button type="button" data-login-tab="login">Login</button>
          <button type="button" data-login-tab="recovery">Recovery</button>
          <button type="button" data-login-tab="renewal">Renewal</button>
        </nav>
        <div class="sigil-login-only__body">
          <form class="sigil-login-only__form" data-login-panel="login" data-ms-form="login" autocomplete="on">
            <input type="hidden" name="redirect" value="${afterLogin}" />
            <label class="sigil-login-only__field"><span>Email</span><input type="email" name="email" data-ms-member="email" autocomplete="username" placeholder="email used for membership" required /></label>
            <label class="sigil-login-only__field"><span>Password</span><span class="sigil-login-only__password"><input type="password" name="password" data-ms-member="password" autocomplete="current-password" placeholder="password" required /><button type="button" data-password-toggle>Show</button></span></label>
            <div class="sigil-login-only__row"><label class="sigil-login-only__check"><input type="checkbox" name="remember" checked /><span>Keep this browser trusted</span></label><button type="button" class="sigil-login-only__textBtn" data-login-jump="recovery">Forgot?</button></div>
            <button class="sigil-login-only__submit" type="submit"><span>Enter SIGIL</span><b>→</b></button>
            <p class="sigil-login-only__micro">Active member จะถูกพาไปยัง Member Account หลังยืนยันสำเร็จ</p>
          </form>
          <form class="sigil-login-only__form" data-login-panel="recovery" data-ms-form="forgot-password" autocomplete="on">
            <label class="sigil-login-only__field"><span>Email / account contact</span><input type="email" name="email" data-ms-member="email" autocomplete="email" placeholder="email used for membership" required /></label>
            <label class="sigil-login-only__field"><span>Optional note</span><textarea name="recovery_note" rows="3" placeholder="ชื่อเล่นเดิม / LINE display / เบอร์ที่เคยใช้ / package ที่จำได้"></textarea></label>
            <button class="sigil-login-only__submit" type="submit"><span>Send Recovery Request</span><b>↗</b></button>
            <p class="sigil-login-only__micro">Recovery ใช้สำหรับ reset password หรือช่วยตรวจสอบ access จากข้อมูลสมาชิกเดิม</p>
          </form>
          <div class="sigil-login-only__form" data-login-panel="renewal">
            <div class="sigil-login-only__renewBox"><small>RENEWAL MEMBER</small><strong>ต่ออายุสมาชิกก่อนกลับเข้า SIGIL</strong><p>ถ้าสถานะหมดอายุหรือรอการตรวจสอบ ให้ไปหน้า renewal/payment ก่อน</p></div>
            <a class="sigil-login-only__submit" href="${renewalUrl}"><span>Go to Renewal</span><b>→</b></a>
            <button type="button" class="sigil-login-only__submit sigil-login-only__submit--dark" data-login-jump="login"><span>Back to Login</span><b>←</b></button>
          </div>
          <p class="sigil-login-only__status" data-login-status role="status" aria-live="polite"></p>
        </div>
      </section>
    </main>
    <script>
      (function () {
        const root = document.querySelector("[data-sigil-login-only]");
        if (!root) return;
        const title = root.querySelector("[data-login-title]");
        const status = root.querySelector("[data-login-status]");
        function setStatus(message, kind) {
          if (!status) return;
          status.className = "sigil-login-only__status" + (kind ? " is-" + kind : "");
          status.textContent = message || "";
        }
        function setMode(mode) {
          const next = mode === "recovery" ? "recovery" : mode === "renewal" ? "renewal" : "login";
          root.dataset.mode = next;
          root.querySelectorAll("[data-login-tab]").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.loginTab === next));
          root.querySelectorAll("[data-login-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.loginPanel === next));
          if (title) title.textContent = next === "recovery" ? "Access Recovery" : next === "renewal" ? "Renewal Required" : "Member Login";
          if (next === "login") setStatus("Ready.", "");
          if (next === "recovery") setStatus("Recovery mode ready.", "warn");
          if (next === "renewal") setStatus("Renewal mode ready.", "warn");
          const state = new URL(window.location.href);
          state.searchParams.set("mode", next);
          history.replaceState(null, "", state.toString());
        }
        root.querySelectorAll("[data-login-tab]").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.loginTab)));
        root.querySelectorAll("[data-login-jump]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.loginJump)));
        root.querySelectorAll("[data-password-toggle]").forEach((button) => button.addEventListener("click", () => {
          const input = button.parentElement ? button.parentElement.querySelector("input") : null;
          if (!input) return;
          input.type = input.type === "password" ? "text" : "password";
          button.textContent = input.type === "password" ? "Show" : "Hide";
        }));
        root.querySelectorAll("form").forEach((form) => {
          form.addEventListener("submit", () => {
            if (form.dataset.loginPanel === "login") setStatus("Checking member access...", "warn");
            if (form.dataset.loginPanel === "recovery") setStatus("Sending recovery request...", "warn");
          });
        });
        setMode(root.dataset.mode || "login");
      })();
    </script>
  </body>
</html>`;

  return new Response(request.method === "HEAD" ? null : html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": "immigrate-worker",
      "x-mmd-page": "sigil-login-only",
    },
  });
}

function renderSigilApplyPage(request: Request): Response {
  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SIGIL Apply | MMD Privé</title>
  <style>
    html,body{margin:0;min-height:100%;background:#050403;color:#fff4df;font-family:"Avenir Next",Inter,"Noto Sans Thai",system-ui,sans-serif}
    *{box-sizing:border-box}
    .sps{min-height:100vh;background:radial-gradient(circle at 78% 14%,rgba(236,196,111,.18),transparent 30%),linear-gradient(135deg,#050403 0%,#0e0b08 52%,#1b1308 100%);overflow:hidden}
    .sps-shell{width:min(1180px,calc(100% - 28px));margin:0 auto;padding:clamp(18px,3vw,34px) 0;display:grid;gap:14px}
    .sps-hero,.sps-panel{border:1px solid rgba(233,193,106,.2);border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.014)),rgba(17,14,10,.88);box-shadow:0 28px 72px rgba(0,0,0,.34)}
    .sps-hero{min-height:min(620px,84vh);display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.36fr);gap:18px;align-items:end;padding:clamp(22px,4vw,50px)}
    .sps-hero-copy,.sps-context,.sps-form,.sps-form-head,.sps-field,.sps-fieldset,.sps-actions{display:grid;gap:12px}
    .sps-hero-copy{gap:18px;max-width:840px}.sps-kicker,.sps-section-label,.sps-hero-note span,.sps-foot{margin:0;color:rgba(255,244,223,.5);font-size:.74rem;line-height:1.35;font-weight:850;text-transform:uppercase}
    h1,h2,p,fieldset,legend{margin:0}h1{font-size:clamp(3rem,8vw,6.7rem);line-height:.93;font-weight:900;letter-spacing:0}h2{font-size:clamp(1.2rem,2.5vw,2rem);line-height:1.1;font-weight:850;letter-spacing:0}
    .sps-lede,.sps-context p,.sps-hero-note p,.sps-field small,.sps-option small,.sps-consent,.sps-status{color:rgba(255,244,223,.72);font-size:clamp(.96rem,1.5vw,1.12rem);line-height:1.72}
    .sps-hero-note{min-height:220px;display:grid;align-content:end;gap:10px;padding:20px;border:1px solid rgba(246,213,139,.52);border-radius:8px;background:rgba(0,0,0,.2)}
    .sps-layout{display:grid;grid-template-columns:minmax(280px,.45fr) minmax(0,.75fr);gap:14px;align-items:start}.sps-panel{padding:clamp(18px,3vw,28px)}.sps-context{position:sticky;top:16px}.sps-fieldset{padding:0;border:0}
    label,legend{color:#fff4df;font-size:.94rem;line-height:1.45;font-weight:800}.sps-contact-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    input[type=text],input[type=tel],input[type=number],textarea{width:100%;min-height:50px;border:1px solid rgba(255,255,255,.13);border-radius:8px;padding:12px 14px;color:#fff4df;background:rgba(0,0,0,.26);outline:none;font:inherit}
    textarea{min-height:112px;resize:vertical}input:focus,textarea:focus{border-color:rgba(246,213,139,.52);box-shadow:0 0 0 3px rgba(236,196,111,.13)}.sps-options{display:grid;gap:10px}
    .sps-option{min-height:78px;display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:start;padding:14px;border:1px solid rgba(255,255,255,.11);border-radius:8px;background:rgba(0,0,0,.18);cursor:pointer}
    .sps-option:has(input:checked){border-color:rgba(246,213,139,.52);background:rgba(236,196,111,.12)}.sps-option input,.sps-consent input{width:18px;height:18px;accent-color:#ecc46f}.sps-option span,.sps-consent{display:grid;gap:4px}
    .sps-consent{grid-template-columns:22px minmax(0,1fr);align-items:start}.sps-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
    .sps-button{width:100%;min-height:62px;border:1px solid rgba(246,213,139,.8);border-radius:8px;background:linear-gradient(135deg,#f5d58d,#bd8734);color:#171006;cursor:pointer;display:grid;gap:2px;place-items:center;font:inherit;font-weight:850}
    .sps-button small{color:rgba(23,16,6,.72);font-size:.78rem;font-weight:750}.sps-button[disabled]{opacity:.55;cursor:not-allowed}.sps-status.is-error{color:#ffaaa4}.sps-status.is-ok{color:#a8e6ba}.sps-foot{text-transform:none}
    @media(max-width:940px){.sps-hero,.sps-layout{grid-template-columns:1fr}.sps-context{position:relative;top:auto}}@media(max-width:640px){.sps-shell{width:min(100% - 16px,1180px)}h1{font-size:clamp(2.6rem,15vw,4.1rem)}.sps-contact-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <section id="sigil-private-setup" class="sps" data-endpoint="${SIGIL.privateModelApply}" data-dashboard-url="${SIGIL.applyStatus}">
    <div class="sps-shell">
      <header class="sps-hero" aria-labelledby="sps-title"><div class="sps-hero-copy"><p class="sps-kicker">MMD PRIVÉ / SIGIL ACCESS</p><h1 id="sps-title">ถ้าจะเข้าชั้น private ให้ตั้งขอบเขตก่อน</h1><p class="sps-lede">ต้าอยู่ตรงนี้เพื่อรับข้อมูลเบื้องต้นของพี่น้องครับ ตอบเฉพาะสิ่งที่จำเป็นก่อน: ชื่อที่ใช้ทำงาน, ช่องทางติดต่อ, standard ที่รับได้, และ rate ขั้นต่ำที่สบายใจจริง.</p></div><aside class="sps-hero-note" aria-label="Private apply note"><span>Private Apply</span><p>ข้อมูลนี้ไม่ใช่ public profile. พี่เปอร์จะได้อ่านโปรไฟล์แบบส่วนตัว และพิจารณาความเหมาะสมก่อนมีการติดต่อกลับครับ.</p></aside></header>
      <main class="sps-layout"><section class="sps-panel sps-context"><p class="sps-section-label">Per Voice</p><h2>ไม่ต้องรับทุกอย่าง แค่บอกเส้นที่คุณถือได้จริง</h2><p>SIGIL อยู่ใต้ MMD Privé ในฐานะ private access layer. ต้าได้รับข้อมูลไว้ก่อน แล้วพี่เปอร์จะอ่านความเหมาะสมของงาน ลูกค้า และจังหวะการดูแลแบบส่วนตัวครับ.</p></section>
        <form class="sps-panel sps-form" data-private-setup-form novalidate><div class="sps-form-head"><p class="sps-section-label">Setup</p><h2>เปิดทางสมัครแบบมีขอบเขต</h2></div>
          <label class="sps-field" for="sps-nickname"><span>ชื่อที่ให้ TarT เรียก</span><input id="sps-nickname" name="nickname" type="text" autocomplete="nickname" maxlength="100" required></label>
          <fieldset class="sps-fieldset"><legend>ช่องทางติดต่ออย่างน้อย 1 ช่องทาง</legend><div class="sps-contact-grid"><label class="sps-field" for="sps-phone"><span>Phone</span><input id="sps-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></label><label class="sps-field" for="sps-telegram"><span>Telegram</span><input id="sps-telegram" name="telegram_username" type="text" maxlength="80" placeholder="@username"></label><label class="sps-field" for="sps-line"><span>LINE ID</span><input id="sps-line" name="line_id" type="text" maxlength="80"></label></div></fieldset>
          <fieldset class="sps-fieldset"><legend>Private Standard</legend><div class="sps-options"><label class="sps-option"><input type="radio" name="private_standard" value="standard_private" required><span><strong>Standard Private</strong><small>ขอบเขตชัด รับเฉพาะงานที่อ่านแล้วสบายใจ</small></span></label><label class="sps-option"><input type="radio" name="private_standard" value="premium_private"><span><strong>Premium Private</strong><small>เลือกงานน้อยลง แต่ต้องเหมาะกับบุคลิกและ rate สูงขึ้น</small></span></label><label class="sps-option"><input type="radio" name="private_standard" value="selective_case_by_case"><span><strong>Selective</strong><small>ให้พี่เปอร์อ่านความเหมาะสมเป็นเคสก่อนทุกครั้ง</small></span></label></div></fieldset>
          <label class="sps-field" for="sps-rate"><span>Minimum Rate (THB)</span><input id="sps-rate" name="minimum_rate_thb" type="number" inputmode="numeric" min="0" step="500" placeholder="8000" required><small>ใส่ตัวเลขที่คุณรับได้จริง ไม่ต้องกดตัวเองให้ต่ำเพื่อผ่านหน้าแรก</small></label>
          <label class="sps-field" for="sps-note"><span>Private Note</span><textarea id="sps-note" name="private_note" rows="4" maxlength="700" placeholder="มีขอบเขต เวลา โซน หรือเรื่องที่อยากให้ TarT รู้ก่อน บอกไว้ตรงนี้ได้ครับ"></textarea></label>
          <label class="sps-consent"><input name="consent" type="checkbox" required><span>ผมเข้าใจว่า SIGIL เป็น private access layer ใต้ MMD Privé และข้อมูลนี้เป็นข้อมูลเบื้องต้นให้พี่เปอร์อ่านแบบส่วนตัวก่อนเท่านั้น</span></label><input class="sps-hp" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="sps-actions"><button class="sps-button" type="submit"><span>ส่งให้ TarT อ่านต่อ</span><small>Continue private apply</small></button><p class="sps-status" data-private-setup-status role="status" aria-live="polite"></p></div>
        </form></main><footer class="sps-foot">SIGIL private apply แยกจากเส้นจองของลูกค้า.</footer>
    </div>
  </section>
  <script>
  (function(){"use strict";var root=document.getElementById("sigil-private-setup");if(!root)return;var form=root.querySelector("[data-private-setup-form]");var status=root.querySelector("[data-private-setup-status]");if(!form)return;var endpoint=root.getAttribute("data-endpoint")||"/sigil/api/private-model/apply";var dashboardUrl=root.getAttribute("data-dashboard-url")||"/sigil/apply/status";function clean(value){return String(value||"").trim()}function field(name){return form.elements[name]}function value(name){var input=field(name);return input?clean(input.value):""}function setStatus(message,tone){if(!status)return;status.textContent=message||"";status.classList.toggle("is-error",tone==="error");status.classList.toggle("is-ok",tone==="ok")}function selectedStandard(){var selected=form.querySelector('input[name="private_standard"]:checked');return selected?selected.value:""}function hasContact(payload){return Boolean(payload.phone||payload.telegram_username||payload.line_id)}function setSubmitting(isSubmitting){var button=form.querySelector('button[type="submit"]');if(button)button.disabled=isSubmitting}function redirectTarget(applicationId){var target=new URL(dashboardUrl,window.location.origin);if(applicationId)target.searchParams.set("application_id",applicationId);target.searchParams.set("source","private_setup");return target.toString()}function payload(){var rate=Number(value("minimum_rate_thb"));var nickname=value("nickname");return{application_type:"private_model",source:"sigil_apply_private_model",handler:"TarT",parent_brand:"MMD PRIVÉ",layer:"SIGIL",privacy_level:"private",work_type:"private_model",nickname:nickname,working_name:nickname,age:18,phone:value("phone"),telegram_username:value("telegram_username"),line_id:value("line_id"),private_standard:selectedStandard(),minimum_rate_thb:Number.isFinite(rate)?rate:0,private_note:value("private_note"),consent:Boolean(field("consent")&&field("consent").checked),page_url:window.location.href.split("?")[0],language:"th",timezone:"Asia/Bangkok",form_version:"sigil_apply_private_setup_20260530"}}function validate(data){if(!data.nickname)return"ขอชื่อที่ให้ต้าเรียกก่อนครับ";if(!hasContact(data))return"ขอช่องทางติดต่ออย่างน้อย 1 ช่องทางครับ";if(!data.private_standard)return"ขอเลือก private standard ก่อนครับ";if(!data.minimum_rate_thb||data.minimum_rate_thb<0)return"ขอ minimum rate ที่รับได้จริงก่อนครับ";if(!data.consent)return"ขอให้ยืนยัน consent ก่อนส่งข้อมูลให้ต้าอ่านต่อครับ";return""}function readJson(response){return response.json().catch(function(){return{}}).then(function(data){if(!response.ok||data.ok===false)throw new Error(data.error&&data.error.message||data.error||data.message||"submit_failed");return data})}form.addEventListener("submit",function(event){event.preventDefault();if(value("website"))return;var data=payload();var error=validate(data);if(error){setStatus(error,"error");return}setSubmitting(true);setStatus("ต้าได้รับข้อมูลแล้วครับ กำลังพาไปหน้ารับข้อมูล...");fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)}).then(readJson).then(function(result){setStatus("เรียบร้อยครับ ไม่ต้องส่งข้อมูลซ้ำนะครับ","ok");window.location.assign(redirectTarget(result.application_id||result.id||""))}).catch(function(submitError){setSubmitting(false);setStatus("ส่งไม่สำเร็จครับ ลองเช็กข้อมูลอีกครั้ง หรือส่งให้ต้าช่วยดูได้เลย","error");if(window.console&&window.console.warn)window.console.warn("SIGIL apply failed",submitError&&submitError.message?submitError.message:submitError)})})}());
  </script>
</body>
</html>`;

  return new Response(request.method === "HEAD" ? null : html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": "immigrate-worker",
      "x-mmd-page": "sigil-apply",
    },
  });
}

function renderSigilApplyStatusPage(request: Request): Response {
  const url = new URL(request.url);
  const applicationId = escapeHtml(url.searchParams.get("application_id") || "");
  const html = `<!doctype html>
<html lang="th">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SIGIL Apply Received | MMD Privé</title><style>
html,body{margin:0;min-height:100%;background:#050403;color:#fff4df;font-family:"Avenir Next",Inter,"Noto Sans Thai",system-ui,sans-serif}*{box-sizing:border-box}main{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 70% 18%,rgba(236,196,111,.18),transparent 32%),linear-gradient(135deg,#050403,#161008)}section{width:min(760px,100%);border:1px solid rgba(233,193,106,.24);border-radius:8px;background:rgba(17,14,10,.9);box-shadow:0 28px 72px rgba(0,0,0,.34);padding:clamp(24px,5vw,48px);display:grid;gap:16px}p{margin:0;color:rgba(255,244,223,.72);font-size:1rem;line-height:1.75}.kicker{color:rgba(255,244,223,.5);font-size:.74rem;font-weight:850;text-transform:uppercase}h1{margin:0;font-size:clamp(2.4rem,8vw,5.4rem);line-height:.94;letter-spacing:0}code{display:inline-block;margin-top:6px;padding:8px 10px;border:1px solid rgba(233,193,106,.18);border-radius:8px;color:#f5d58d;background:rgba(0,0,0,.2)}a{min-height:48px;display:inline-grid;place-items:center;margin-top:8px;padding:12px 16px;border:1px solid rgba(246,213,139,.7);border-radius:8px;background:linear-gradient(135deg,#f5d58d,#bd8734);color:#171006;text-decoration:none;font-weight:850}
</style></head>
<body><main><section><p class="kicker">SIGIL / PRIVATE APPLY</p><h1>ต้าได้รับข้อมูลของพี่น้องแล้วนะครับ</h1><p>เดี๋ยวขอเวลาไม่นาน พี่เปอร์จะได้อ่านโปรไฟล์ของพี่แบบส่วนตัว และจะพิจารณาทุกความเหมาะสมนะครับ</p><p>ไม่ต้องส่งข้อมูลซ้ำนะครับ รอการติดต่อกลับถ้าผ่านการพิจารณาครับผม</p><p>ได้รับโปรไฟล์แล้วครับ ที่เหลือคือรอการยืนยัน หรือติดต่อกลับ ถึงจะแปลว่าได้รับการพิจารณาอย่างเป็นทางการครับ</p>${applicationId ? `<p>Application ID<br><code>${applicationId}</code></p>` : ""}<a href="${SIGIL.apply}">กลับไปหน้า Apply</a></section></main></body>
</html>`;

  return new Response(request.method === "HEAD" ? null : html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": "immigrate-worker",
      "x-mmd-page": "sigil-apply-status",
    },
  });
}

const MEMBER_ACCOUNT_PATH = "/sigil/member/account";
const MEMBER_DASHBOARD_ALIAS_PATH = "/member/dashboard";
const MEMBER_MEMBERSHIP_ALIAS_PATH = "/member/membership";
const MODEL_CONSOLE_PATH = "/sigil/model/console";
const MODEL_CONSOLE_ALIAS_PATH = "/model/console";
const MODEL_CONFIRM_ALIAS_PATH = "/model/confirm";
const SIGIL_MEMBER_BUILD = "member-dashboard-home-20260612a";
const SIGIL_MODEL_BUILD = "model-console-bridge-20260517a";
const MMD_MODEL_BUILD = "model-console-mmd-skin-20260520a";

function bridgeHeaders(page: string): Headers {
  return new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-mmd-worker": "immigrate-worker",
    "x-mmd-sigil-bridge": "v1",
    "x-mmd-page": page,
  });
}

function bridgeRedirect(request: Request, targetPath: string): Response {
  const current = new URL(request.url);
  const target = new URL(current.toString());
  target.pathname = targetPath;
  target.search = current.search;
  return redirect(target.toString(), 302);
}

function renderSigilMemberAccountPage(request: Request): Response {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") || "";
  const sessionId = url.searchParams.get("session_id") || "";
  const query = url.search || "";
  const renewalHref = `${SIGIL_RENEWAL_URL}${query}`;
  const paymentHref = `/pay${query}`;
  const startHref = `/sigil/start${query}`;
  const guideHref = `/sigil/guide${query}`;
  const bookingHref = `/sigil/booking${query}`;
  const supportHref = `/contact${query}`;
  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SIGIL Member Dashboard</title>
    <!-- SIGIL_MEMBER_BUILD: ${SIGIL_MEMBER_BUILD} -->
    <style>
      :root { color-scheme: dark; --bg:#070604; --panel:rgba(18,15,11,.82); --line:rgba(223,186,103,.24); --gold:#dfba67; --gold2:#ffe39a; --text:#fff6e8; --muted:rgba(255,246,232,.68); --ink:#120d07; }
      * { box-sizing: border-box; letter-spacing: 0; }
      body { margin: 0; min-height: 100vh; color: var(--text); background: var(--bg); font-family: Inter, "Avenir Next", "Segoe UI", "Noto Sans Thai", Arial, sans-serif; }
      .sigil-member-bridge { position: relative; min-height: 100vh; overflow: hidden; isolation: isolate; padding: 24px; }
      .sigil-member-bridge::before { content: ""; position: absolute; inset: 0; z-index: -2; background: linear-gradient(90deg, rgba(4,3,2,.90), rgba(4,3,2,.58) 48%, rgba(4,3,2,.22)), url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69e357bcd29016c25aba0b63_Kenji%20PN%20Dashboard.webp") center / cover; transform: scale(1.02); }
      .sigil-member-bridge::after { content: ""; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(7,6,4,.18), var(--bg)); }
      .sigil-member-bridge__shell { width: min(1160px, 100%); margin: 0 auto; display: grid; gap: 18px; }
      .sigil-member-bridge__hero { min-height: 54vh; display: grid; align-content: end; padding: clamp(28px, 5vw, 64px) 0; }
      .sigil-member-bridge__eyebrow, .sigil-member-bridge__kicker { color: var(--gold2); font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .14em; }
      .sigil-member-bridge h1 { max-width: 780px; margin: 14px 0 0; font-size: clamp(48px, 8vw, 104px); line-height: .9; text-transform: uppercase; }
      .sigil-member-bridge__lead { max-width: 680px; color: var(--muted); font-size: clamp(16px, 2vw, 20px); line-height: 1.65; }
      .sigil-member-bridge__grid { display: grid; grid-template-columns: 1fr 380px; gap: 16px; align-items: start; }
      .sigil-member-bridge__panel, .sigil-member-bridge__card { border: 1px solid var(--line); border-radius: 14px; background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025)), var(--panel); backdrop-filter: blur(18px); box-shadow: 0 24px 72px rgba(0,0,0,.32); }
      .sigil-member-bridge__panel { padding: 20px; }
      .sigil-member-bridge__cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .sigil-member-bridge__card { padding: 16px; min-height: 126px; }
      .sigil-member-bridge__card span { display:block; color: var(--muted); font-size: 12px; margin-bottom: 10px; }
      .sigil-member-bridge__card strong { display:block; font-size: 20px; }
      .sigil-member-bridge__card em { display:block; margin-top: 8px; color: var(--muted); font-style: normal; line-height: 1.5; }
      .sigil-member-bridge__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
      .sigil-member-bridge__btn { display:inline-flex; align-items:center; justify-content:center; min-height: 46px; padding: 0 16px; border: 1px solid rgba(223,186,103,.38); border-radius: 999px; color: var(--text); background: rgba(255,255,255,.055); text-decoration:none; font-weight: 850; }
      .sigil-member-bridge__btn--gold { color: var(--ink); border-color: rgba(255,227,154,.86); background: linear-gradient(180deg, #ffe39a, #bd862f); }
      .sigil-member-bridge__side { display:grid; gap: 12px; }
      .sigil-member-bridge__meta { display:grid; gap: 8px; color: var(--muted); font-size: 13px; line-height: 1.5; }
      .sigil-member-bridge__meta code { color: var(--gold2); overflow-wrap: anywhere; }
      @media (max-width: 900px) { .sigil-member-bridge { padding: 16px; } .sigil-member-bridge__grid, .sigil-member-bridge__cards { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="sigil-member-bridge" data-sigil-member-bridge data-build="${SIGIL_MEMBER_BUILD}">
      <div hidden>SIGIL_MEMBER_BUILD: ${SIGIL_MEMBER_BUILD}</div>
      <div class="sigil-member-bridge__shell">
        <section class="sigil-member-bridge__hero">
          <p class="sigil-member-bridge__eyebrow">Kenji / Member Continuity</p>
          <h1>Member Dashboard</h1>
          <p class="sigil-member-bridge__lead">พื้นที่สะพานสำหรับสมาชิกระหว่าง immigration phase. หน้านี้แสดงสถานะเพื่อช่วยพาคุณไป action ถัดไป แต่ backend ยังเป็นแหล่งความจริงเสมอ.</p>
        </section>
        <section class="sigil-member-bridge__grid">
          <div class="sigil-member-bridge__panel">
            <p class="sigil-member-bridge__kicker">Access snapshot</p>
            <div class="sigil-member-bridge__cards">
              <article class="sigil-member-bridge__card"><span>Membership / Access</span><strong data-member-access>Bridge Check</strong><em data-member-access-note>ตรวจสิทธิ์จาก token/session server-side ในขั้นตอนถัดไป</em></article>
              <article class="sigil-member-bridge__card"><span>Package / Tier</span><strong data-member-tier>Pending Sync</strong><em data-member-tier-note>ไม่ให้ frontend ตัดสิน package truth เอง</em></article>
              <article class="sigil-member-bridge__card"><span>Renewal State</span><strong data-member-renewal>Review</strong><em data-member-renewal-note>ถ้าหมดอายุหรือ renewal pending ให้ไป renewal/pay flow</em></article>
            </div>
            <div class="sigil-member-bridge__actions">
              <a class="sigil-member-bridge__btn sigil-member-bridge__btn--gold" href="${startHref}">Continue with Kenji</a>
              <a class="sigil-member-bridge__btn" href="${guideHref}">Choose Guide</a>
              <a class="sigil-member-bridge__btn" href="${bookingHref}">Book an Experience</a>
              <a class="sigil-member-bridge__btn" href="${renewalHref}">Renew Membership</a>
              <a class="sigil-member-bridge__btn" href="${paymentHref}">View Payment / Confirm</a>
              <a class="sigil-member-bridge__btn" href="${supportHref}">Contact Support</a>
            </div>
          </div>
          <aside class="sigil-member-bridge__panel sigil-member-bridge__side">
            <p class="sigil-member-bridge__kicker">Next action</p>
            <h2>Continue the member route</h2>
            <p class="sigil-member-bridge__lead" data-member-next-copy>ถ้าสถานะ active ให้ไป start, guide หรือ booking. ถ้า expired หรือ renewal pending ให้ไป renewal/pay ก่อน.</p>
            <div class="sigil-member-bridge__meta">
              <span>token t: <code>${escapeHtml(token || "not provided")}</code></span>
              <span>session_id: <code>${escapeHtml(sessionId || "not provided")}</code></span>
              <span>dashboard: <code data-member-dashboard-state>${token ? "loading" : "token required"}</code></span>
            </div>
          </aside>
        </section>
      </div>
    </main>
    <script>
      (function(){
        var token = ${JSON.stringify(token)};
        function setText(selector, value){
          var node = document.querySelector(selector);
          if (node) node.textContent = value || "-";
        }
        function pick(obj, path){
          return path.split(".").reduce(function(value, key){
            return value && value[key] != null ? value[key] : "";
          }, obj || {});
        }
        function label(value, fallback){
          return String(value || fallback || "-").trim();
        }
        if (!token) return;
        fetch("/api/member/dashboard?t=" + encodeURIComponent(token), { credentials: "include" })
          .then(function(response){
            return response.json().catch(function(){ return {}; }).then(function(payload){
              if (!response.ok || payload.ok === false) {
                throw new Error(payload && payload.error && payload.error.message || "dashboard_unavailable");
              }
              return payload;
            });
          })
          .then(function(payload){
            var member = payload.member || {};
            var status = payload.status || {};
            setText("[data-member-access]", label(status.member_status || member.status, "Active"));
            setText("[data-member-access-note]", label(member.display_name || member.full_name, "Dashboard verified"));
            setText("[data-member-tier]", label(member.tier || member.package_code, "Member"));
            setText("[data-member-tier-note]", label(member.expires_at ? "Expires " + member.expires_at : member.member_id, "Synced from backend"));
            setText("[data-member-renewal]", label(status.renewal_status || status.payment_status || "Ready"));
            setText("[data-member-renewal-note]", label(status.dashboard_status || "Backend dashboard loaded"));
            setText("[data-member-next-copy]", "สิทธิ์สมาชิกโหลดจาก backend แล้ว คุณสามารถไป start, guide หรือ booking ต่อได้เลย.");
            setText("[data-member-dashboard-state]", "verified");
          })
          .catch(function(error){
            setText("[data-member-dashboard-state]", error && error.message ? error.message : "dashboard_unavailable");
          });
      })();
    </script>
  </body>
</html>`;

  return new Response(request.method === "HEAD" ? null : html, {
    headers: bridgeHeaders("member-dashboard"),
  });
}

function renderMmdMemberDashboardPage(request: Request): Response {
  const url = new URL(request.url);
  const query = url.search || "";
  const membershipHref = `/member/membership${query}`;
  const trustHref = `/trust/inme${query}`;
  const bookingHref = `/sigil/booking${query}`;
  const paymentHref = `/pay${query}`;
  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kenji Member Dashboard | MMD Privé</title>
    <!-- SIGIL_MEMBER_BUILD: ${SIGIL_MEMBER_BUILD} -->
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; letter-spacing: 0; }
      html, body { margin: 0; min-height: 100%; background: #050403; }
      body { color: #fff4df; font-family: Inter, "Avenir Next", "Segoe UI", "Noto Sans Thai", Arial, sans-serif; }
      #mmd-member-dashboard,
      #mmd-member-dashboard * { box-sizing: border-box; }
      #mmd-member-dashboard.mmddash {
        position: relative;
        min-height: 100vh;
        overflow: hidden;
        isolation: isolate;
        background: #050403;
      }
      #mmd-member-dashboard .mmddash-hero-img {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center top;
        z-index: -4;
        filter: saturate(1.08) contrast(1.05) brightness(.72);
      }
      #mmd-member-dashboard .mmddash-shade {
        position: fixed;
        inset: 0;
        z-index: -3;
        background:
          linear-gradient(90deg, rgba(4,3,2,.96) 0%, rgba(4,3,2,.78) 42%, rgba(4,3,2,.36) 100%),
          linear-gradient(180deg, rgba(4,3,2,.15) 0%, rgba(4,3,2,.72) 78%, #050403 100%);
      }
      #mmd-member-dashboard .mmddash-aura {
        position: fixed;
        inset: -20%;
        z-index: -2;
        background:
          radial-gradient(circle at 20% 12%, rgba(233, 190, 103, .23), transparent 30%),
          radial-gradient(circle at 78% 10%, rgba(255, 231, 174, .14), transparent 26%),
          radial-gradient(circle at 50% 105%, rgba(160, 103, 31, .18), transparent 36%);
        pointer-events: none;
      }
      #mmd-member-dashboard .mmddash-top,
      #mmd-member-dashboard .mmddash-hero,
      #mmd-member-dashboard .mmddash-livebar,
      #mmd-member-dashboard .mmddash-grid {
        position: relative;
        z-index: 1;
        width: min(1180px, calc(100% - 28px));
        margin-inline: auto;
      }
      #mmd-member-dashboard .mmddash-top {
        min-height: 74px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding-top: 16px;
      }
      #mmd-member-dashboard .mmddash-brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        color: #fff4df;
        text-decoration: none;
        font-weight: 900;
      }
      #mmd-member-dashboard .mmddash-logo { width: 38px; height: 38px; object-fit: contain; filter: drop-shadow(0 10px 26px rgba(0,0,0,.45)); }
      #mmd-member-dashboard .mmddash-status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding: 0 12px;
        border: 1px solid rgba(230, 189, 103, .28);
        border-radius: 999px;
        color: #f3d99c;
        background: rgba(12, 9, 5, .52);
        font-size: 12px;
        font-weight: 850;
        text-transform: uppercase;
      }
      #mmd-member-dashboard .mmddash-status::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #d9ae58; box-shadow: 0 0 18px rgba(217, 174, 88, .72); }
      #mmd-member-dashboard .mmddash-hero {
        min-height: clamp(540px, 74vh, 760px);
        display: grid;
        align-items: end;
        padding: clamp(44px, 10vw, 116px) 0 clamp(24px, 6vw, 58px);
      }
      #mmd-member-dashboard .mmddash-copy { max-width: 700px; display: grid; gap: 14px; }
      #mmd-member-dashboard .mmddash-kicker,
      #mmd-member-dashboard .mmddash-panel span,
      #mmd-member-dashboard .mmddash-kenji span,
      #mmd-member-dashboard .mmddash-promo span {
        color: #e7c579;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
      }
      #mmd-member-dashboard h1 {
        margin: 0;
        color: #fff7e9;
        font-size: clamp(54px, 14vw, 128px);
        line-height: .86;
        font-weight: 950;
        text-wrap: balance;
      }
      #mmd-member-dashboard .mmddash-thai {
        margin: 0;
        color: #f0d89e;
        font-size: clamp(22px, 5vw, 42px);
        line-height: 1.18;
        font-weight: 850;
      }
      #mmd-member-dashboard .mmddash-message {
        margin: 0;
        max-width: 590px;
        color: rgba(255, 244, 223, .78);
        font-size: 16px;
        line-height: 1.74;
      }
      #mmd-member-dashboard .mmddash-livebar {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 14px;
        align-items: center;
        margin-top: -28px;
        margin-bottom: 14px;
        padding: 14px;
        border: 1px solid rgba(230, 189, 103, .20);
        border-radius: 14px;
        background: rgba(8, 6, 4, .72);
        backdrop-filter: blur(16px);
        box-shadow: 0 20px 70px rgba(0,0,0,.34);
      }
      #mmd-member-dashboard .mmddash-livebar strong { color: #fff3d6; }
      #mmd-member-dashboard .mmddash-livebar small { color: rgba(255,244,223,.66); line-height: 1.5; }
      #mmd-member-dashboard .mmddash-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; padding-bottom: 34px; }
      #mmd-member-dashboard .mmddash-panel,
      #mmd-member-dashboard .mmddash-kenji,
      #mmd-member-dashboard .mmddash-promo {
        min-height: 150px;
        display: grid;
        align-content: space-between;
        gap: 14px;
        padding: 18px;
        border: 1px solid rgba(230, 189, 103, .18);
        border-radius: 14px;
        background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.024)), rgba(9, 7, 5, .76);
        box-shadow: 0 20px 70px rgba(0,0,0,.28);
        backdrop-filter: blur(18px);
      }
      #mmd-member-dashboard .mmddash-panel strong,
      #mmd-member-dashboard .mmddash-kenji strong,
      #mmd-member-dashboard .mmddash-promo strong { color: #fff6e7; font-size: 22px; line-height: 1.15; }
      #mmd-member-dashboard .mmddash-panel small,
      #mmd-member-dashboard .mmddash-kenji small,
      #mmd-member-dashboard .mmddash-promo small { color: rgba(255,244,223,.67); line-height: 1.55; }
      #mmd-member-dashboard .mmddash-kenji { grid-column: span 2; background: linear-gradient(135deg, rgba(231,197,121,.14), rgba(255,255,255,.025)), rgba(9,7,5,.78); }
      #mmd-member-dashboard .mmddash-promo[hidden] { display: none !important; }
      #mmd-member-dashboard .mmddash-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 2px; }
      #mmd-member-dashboard .mmddash-btn { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 0 15px; border: 1px solid rgba(230,189,103,.34); border-radius: 999px; color: #fff4df; background: rgba(255,255,255,.055); text-decoration: none; font-weight: 850; }
      #mmd-member-dashboard .mmddash-btn.primary { color: #160f07; background: linear-gradient(180deg, #ffe6a7, #bd862f); border-color: rgba(255,231,174,.72); }
      @media (max-width: 820px) {
        #mmd-member-dashboard .mmddash-top { align-items: flex-start; flex-direction: column; }
        #mmd-member-dashboard .mmddash-livebar { grid-template-columns: 1fr; }
        #mmd-member-dashboard .mmddash-grid { grid-template-columns: 1fr; }
        #mmd-member-dashboard .mmddash-kenji { grid-column: auto; }
        #mmd-member-dashboard .mmddash-hero { min-height: 650px; }
        #mmd-member-dashboard .mmddash-hero-img { object-position: 62% top; }
      }
    </style>
  </head>
  <body>
    <div id="mmd-member-dashboard" class="mmddash" data-state="boot">
      <img class="mmddash-hero-img" src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69fdb49288f202d72aabca66_ChatGPT%20Image%20Apr%2029%2C%202026%2C%2002_09_24%20AM.webp" alt="Kenji Member Dashboard" loading="eager" />
      <div class="mmddash-shade" aria-hidden="true"></div>
      <div class="mmddash-aura" aria-hidden="true"></div>

      <header class="mmddash-top">
        <a class="mmddash-brand" href="/trust/inme" aria-label="MMD SIGIL">
          <img class="mmddash-logo" src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0f2cbc7e26b6735aee4cb2_SIGIL%20LOGO%20Transp.webp" alt="" aria-hidden="true" />
          <span>MMD SIGIL</span>
        </a>
        <div class="mmddash-status" id="dashSystemState">Checking member route</div>
      </header>

      <main>
        <section class="mmddash-hero" aria-labelledby="mmd-member-dashboard-title">
          <div class="mmddash-copy">
            <p class="mmddash-kicker">PRIVATE MEMBER HOME</p>
            <h1 id="mmd-member-dashboard-title">Welcome back.</h1>
            <p class="mmddash-thai">ผมดูทางหลักให้คุณเอง</p>
            <p class="mmddash-message" id="dashHeroText">กำลังตรวจสอบสิทธิ์สมาชิก session และทางต่อที่ปลอดภัยที่สุดสำหรับคุณครับ</p>
            <div class="mmddash-actions">
              <a class="mmddash-btn primary" id="dashHeroCta" href="${membershipHref}">Membership</a>
              <a class="mmddash-btn" href="${trustHref}">Back to Trust</a>
            </div>
          </div>
        </section>

        <section class="mmddash-livebar" aria-label="Dashboard live status">
          <div>
            <strong id="dashLiveTitle">Member Home / Status Hub</strong><br />
            <small id="dashLiveCopy">Kenji is holding the route while member data syncs from the secure dashboard endpoint.</small>
          </div>
          <small><span id="dashTokenPreview">Token t: checking</span> · <span id="dashSessionId">Session: checking</span> · <span id="dashPaymentStatus">Payment: checking</span> · <span id="dashGuideMini">Guide: Kenji</span></small>
        </section>

        <section class="mmddash-grid" aria-label="Member status cards">
          <article class="mmddash-kenji">
            <span>Kenji Route</span>
            <strong id="dashGuideTitle">Kenji is standing by</strong>
            <small id="dashKenjiCopy">Full member dashboard controls are loaded here. Secure data appears after access validation.</small>
          </article>
          <article class="mmddash-panel">
            <span>Access Signal</span>
            <strong id="dashStatus">Checking access</strong>
            <small id="dashStatusText">Kenji will show the correct access state after dashboard validation.</small>
          </article>
          <article class="mmddash-panel">
            <span>Session Signal</span>
            <strong id="dashSessionState">Checking session</strong>
            <small id="dashSessionCopy">Session details remain inside the secure member route.</small>
          </article>
          <article class="mmddash-panel">
            <span>Path Signal</span>
            <strong id="dashPathState">Checking route</strong>
            <small id="dashPathCopy">Kenji keeps this page focused on member status and next actions.</small>
          </article>
          <article class="mmddash-panel">
            <span>Member Actions</span>
            <strong>Next step</strong>
            <small><a class="mmddash-btn primary" id="dashBookingCta" href="${bookingHref}">Booking</a> <a class="mmddash-btn" id="dashPaymentCta" href="${paymentHref}">Payment</a> <a class="mmddash-btn" id="dashRenewCta" href="${membershipHref}">Membership</a></small>
          </article>
          <article class="mmddash-promo" id="dashPromotionBox" hidden>
            <span>Promotion Status</span>
            <strong id="dashPromotionCode">Code detected</strong>
            <small id="dashPromotionStatus">Checking promotion status.</small>
          </article>
        </section>
      </main>
    </div>
    <script>
      (() => {
        const root = document.getElementById("mmd-member-dashboard");
        if (!root) return;

        const params = new URLSearchParams(window.location.search);
        const token = params.get("t") || "";
        const urlPromo = params.get("code") || params.get("promo") || "";
        const setText = (id, value) => {
          const node = document.getElementById(id);
          if (node) node.textContent = value == null || value === "" ? "-" : String(value);
        };
        const first = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
        const promoFromPayload = (payload) => ({
          code: first(payload?.promo_code, payload?.promotion_code, payload?.access_code, payload?.promotion?.code, payload?.promotion?.promo_code),
          status: first(payload?.promo_status, payload?.promotion_status, payload?.promotion?.status)
        });
        const showPromo = (code, status) => {
          const box = document.getElementById("dashPromotionBox");
          if (!box || !code) return;
          box.hidden = false;
          setText("dashPromotionCode", code);
          setText("dashPromotionStatus", status || "Promotion code attached.");
        };

        if (urlPromo) showPromo(urlPromo, "Promotion code attached.");
        setText("dashTokenPreview", token ? "Token t: present" : "Token t: checking");

        function lockNoToken() {
          root.dataset.state = "locked";
          setText("dashSystemState", "TOKEN REQUIRED");
          setText("dashStatus", "Access locked");
          setText("dashStatusText", "Open this dashboard from the latest secure member link to unlock live status.");
          setText("dashHeroText", "ต้องใช้ลิงก์สมาชิกที่มี token t เพื่อโหลดสถานะจริงครับ");
          setText("dashLiveCopy", "The full dashboard is loaded. Live data is locked until token t is present.");
          setText("dashTokenPreview", "Token t: required");
          setText("dashSessionId", "Session: locked");
          setText("dashPaymentStatus", "Payment: locked");
          setText("dashGuideMini", "Guide: locked");
        }

        async function loadDashboard() {
          if (!token) {
            lockNoToken();
            return;
          }

          try {
            root.dataset.state = "loading";
            setText("dashSystemState", "Loading secure status");
            const endpoint = new URL("https://mmdbkk.com/v1/member/dashboard");
            endpoint.searchParams.set("t", token);
            const response = await fetch(endpoint.toString(), {
              method: "GET",
              credentials: "include",
              headers: { Accept: "application/json" }
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || "dashboard_unavailable");

            const member = payload?.member || {};
            const status = payload?.status || {};
            const session = payload?.next_session || payload?.session || {};
            const promo = promoFromPayload(payload);
            const promoCode = promo.code || urlPromo;

            root.dataset.state = "ready";
            setText("dashSystemState", "Member route ready");
            setText("dashHeroText", "Your secure member route is ready. Kenji will keep the next step clean.");
            setText("dashLiveTitle", first(member.display_name, member.full_name, "Member Home / Status Hub"));
            setText("dashLiveCopy", first(status.dashboard_status, status.member_status, "Official status loaded from the member dashboard endpoint."));
            setText("dashStatus", first(member.tier, member.package_code, status.member_status, "Member"));
            setText("dashStatusText", first(member.member_id, member.identity, "Access verified by the dashboard endpoint."));
            setText("dashSessionState", first(session.name, session.date_label, "Session route ready"));
            setText("dashSessionCopy", first(session.meta, session.session_status, "Session details remain protected."));
            setText("dashPathState", first(payload.route_guide, payload.layer, "Route checked"));
            setText("dashSessionId", first(session.session_id, session.id, "Session: ready"));
            setText("dashPaymentStatus", first(payload?.payments_summary?.latest_payout_status, payload?.payment_status, "Payment: checking"));
            setText("dashGuideMini", first(payload?.route_guide, payload?.assistant_core, "Guide: Kenji"));
            if (promoCode) showPromo(promoCode, promo.status || "Promotion code attached.");
          } catch (error) {
            root.dataset.state = "error";
            setText("dashSystemState", "Secure status unavailable");
            setText("dashLiveCopy", error?.message || "Unable to load dashboard at the moment.");
          }
        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => void loadDashboard(), { once: true });
        } else {
          void loadDashboard();
        }
      })();
    </script>
  </body>
</html>`;

  return new Response(request.method === "HEAD" ? null : html, {
    headers: bridgeHeaders("member-dashboard"),
  });
}

function renderMmdMemberMembershipPage(request: Request): Response {
  const url = new URL(request.url);
  const query = url.search || "";
  const dashboardHref = `/member/dashboard${query}`;
  const paymentHref = `/pay/membership${query}`;
  const packages = [
    {
      name: "Essential",
      line: "Private member access, status hub, and guided next steps.",
      tag: "Member-facing",
    },
    {
      name: "Premium",
      line: "Priority continuity for booking, renewal, and private route support.",
      tag: "Recommended",
    },
    {
      name: "Black Card",
      line: "Highest-touch private access reviewed through the member layer.",
      tag: "Private review",
    },
  ];
  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Member Membership | MMD Privé</title>
    <!-- SIGIL_MEMBER_BUILD: ${SIGIL_MEMBER_BUILD} -->
    <style>
      :root { color-scheme: dark; --bg:#050403; --panel:rgba(14,11,8,.78); --line:rgba(231,197,121,.22); --gold:#e7c579; --gold2:#ffe6a7; --text:#fff4df; --muted:rgba(255,244,223,.70); --ink:#160f07; }
      * { box-sizing: border-box; letter-spacing: 0; }
      html, body { margin: 0; min-height: 100%; background: var(--bg); }
      body { color: var(--text); font-family: Inter, "Avenir Next", "Segoe UI", "Noto Sans Thai", Arial, sans-serif; }
      .mmdmem { min-height: 100vh; position: relative; isolation: isolate; overflow: hidden; padding: 22px; background: #050403; }
      .mmdmem::before { content:""; position: fixed; inset: 0; z-index:-3; background: linear-gradient(90deg, rgba(4,3,2,.94), rgba(4,3,2,.70) 46%, rgba(4,3,2,.38)), url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69f7868b147766ca087fd499_Hito%20membership.webp") center top / cover no-repeat; filter: saturate(1.02) contrast(1.04) brightness(.72); }
      .mmdmem::after { content:""; position: fixed; inset: 0; z-index:-2; background: linear-gradient(180deg, rgba(5,4,3,.08), #050403 88%); }
      .mmdmem__shell { width: min(1160px, 100%); margin: 0 auto; display: grid; gap: 18px; }
      .mmdmem__top { min-height: 64px; display:flex; align-items:center; justify-content:space-between; gap: 14px; }
      .mmdmem__brand { color: var(--text); text-decoration:none; font-weight: 950; }
      .mmdmem__status { min-height: 34px; display:inline-flex; align-items:center; padding: 0 12px; border:1px solid var(--line); border-radius:999px; color: var(--gold2); background:rgba(0,0,0,.24); font-size:12px; font-weight:850; text-transform:uppercase; }
      .mmdmem__hero { min-height: clamp(470px, 64vh, 680px); display:grid; align-content:end; padding: clamp(42px, 8vw, 92px) 0 22px; }
      .mmdmem__kicker, .mmdmem__card span { color: var(--gold); font-size:12px; font-weight:900; text-transform:uppercase; }
      .mmdmem h1 { max-width: 780px; margin: 12px 0 0; color:#fff7e9; font-size: clamp(52px, 12vw, 118px); line-height:.88; font-weight:950; }
      .mmdmem__lead { max-width: 650px; margin: 14px 0 0; color: var(--muted); font-size: 17px; line-height:1.72; }
      .mmdmem__grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; padding-bottom: 26px; }
      .mmdmem__card { min-height: 230px; display:grid; align-content:space-between; gap: 18px; padding: 18px; border:1px solid var(--line); border-radius:14px; background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.025)), var(--panel); box-shadow:0 22px 70px rgba(0,0,0,.34); backdrop-filter: blur(16px); }
      .mmdmem__card strong { display:block; margin-top: 8px; color:#fff6e7; font-size:28px; line-height:1.05; }
      .mmdmem__card p { margin: 0; color: var(--muted); line-height:1.6; }
      .mmdmem__actions { display:flex; flex-wrap:wrap; gap:10px; }
      .mmdmem__btn { min-height:44px; display:inline-flex; align-items:center; justify-content:center; padding:0 15px; border:1px solid rgba(230,189,103,.34); border-radius:999px; color:var(--text); background:rgba(255,255,255,.055); text-decoration:none; font-weight:850; }
      .mmdmem__btn.primary { color:var(--ink); background:linear-gradient(180deg, #ffe6a7, #bd862f); border-color:rgba(255,231,174,.72); }
      .mmdmem__note { display:grid; grid-template-columns: 1fr auto; gap: 14px; align-items:center; margin-bottom: 36px; padding: 16px; border:1px solid var(--line); border-radius:14px; background:rgba(8,6,4,.74); }
      .mmdmem__note p { margin:0; color:var(--muted); line-height:1.6; }
      @media (max-width: 840px) { .mmdmem { padding: 16px; } .mmdmem__top, .mmdmem__note { align-items:flex-start; flex-direction:column; display:flex; } .mmdmem__grid { grid-template-columns:1fr; } .mmdmem__hero { min-height: 610px; } }
    </style>
  </head>
  <body>
    <main class="mmdmem" data-mmd-member-membership data-build="${SIGIL_MEMBER_BUILD}">
      <div class="mmdmem__shell">
        <header class="mmdmem__top">
          <a class="mmdmem__brand" href="${dashboardHref}">MMD PRIVÉ / MEMBER</a>
          <span class="mmdmem__status">Package selection</span>
        </header>
        <section class="mmdmem__hero">
          <p class="mmdmem__kicker">Member-facing membership</p>
          <h1>Choose your private access.</h1>
          <p class="mmdmem__lead">หน้านี้เป็น package selection สำหรับสมาชิก ไม่ใช่ payment layer. เลือกเส้นทางสมาชิกก่อน แล้วค่อยไปชำระเงินเมื่อพร้อมครับ</p>
          <div class="mmdmem__actions">
            <a class="mmdmem__btn primary" href="${dashboardHref}">Member Dashboard</a>
            <a class="mmdmem__btn" href="${paymentHref}">Continue to Payment</a>
          </div>
        </section>
        <section class="mmdmem__grid" aria-label="Membership packages">
          ${packages.map((item) => `<article class="mmdmem__card"><div><span>${item.tag}</span><strong>${item.name}</strong></div><p>${item.line}</p><div class="mmdmem__actions"><a class="mmdmem__btn primary" href="${paymentHref}">Select ${item.name}</a></div></article>`).join("")}
        </section>
        <section class="mmdmem__note" aria-label="Route lock">
          <p><strong>Route lock:</strong> /member/membership stays in the member layer. /pay/membership remains the separate payment page.</p>
          <a class="mmdmem__btn" href="${dashboardHref}">Back to Status Hub</a>
        </section>
      </div>
    </main>
  </body>
</html>`;

  return new Response(request.method === "HEAD" ? null : html, {
    headers: bridgeHeaders("member-membership"),
  });
}

function renderSigilModelConsolePage(request: Request): Response {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") || "";
  const sessionId = url.searchParams.get("session_id") || "";
  const query = url.search || "";
  const profileHref = `/sigil/model/profile${query}`;
  const telegramHref = `/sigil/model/telegram${query}`;
  const briefHref = `/sigil/model/brief${query}`;
  const readinessHref = `/sigil/model/readiness${query}`;
  const supportHref = `/contact${query}`;
  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SIGIL Model Console</title>
    <!-- SIGIL_MODEL_BUILD: ${SIGIL_MODEL_BUILD} -->
    <style>
      :root { color-scheme: dark; --bg:#060607; --panel:rgba(13,15,18,.84); --line:rgba(126,204,232,.22); --blue:#9bdcf2; --gold:#dfba67; --text:#f3fbff; --muted:rgba(243,251,255,.66); --ink:#071015; }
      * { box-sizing: border-box; letter-spacing: 0; }
      body { margin: 0; min-height: 100vh; color: var(--text); background: radial-gradient(circle at 82% 12%, rgba(155,220,242,.16), transparent 32%), linear-gradient(180deg, #111316, var(--bg)); font-family: Inter, "Avenir Next", "Segoe UI", "Noto Sans Thai", Arial, sans-serif; }
      .sigil-model-bridge { min-height: 100vh; padding: 24px; }
      .sigil-model-bridge__shell { width: min(1160px, 100%); margin: 0 auto; display:grid; gap:18px; }
      .sigil-model-bridge__hero { min-height: 44vh; display:grid; align-content:end; padding: clamp(28px, 5vw, 62px) 0; }
      .sigil-model-bridge__eyebrow, .sigil-model-bridge__kicker { color: var(--blue); font-size:12px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; }
      .sigil-model-bridge h1 { max-width: 780px; margin: 14px 0 0; font-size: clamp(48px, 8vw, 100px); line-height: .9; text-transform: uppercase; }
      .sigil-model-bridge__lead { max-width: 700px; color: var(--muted); font-size: clamp(16px, 2vw, 20px); line-height: 1.65; }
      .sigil-model-bridge__grid { display:grid; grid-template-columns: 1fr 360px; gap:16px; align-items:start; }
      .sigil-model-bridge__panel, .sigil-model-bridge__item { border:1px solid var(--line); border-radius:14px; background:linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.02)), var(--panel); box-shadow:0 24px 72px rgba(0,0,0,.28); backdrop-filter:blur(18px); }
      .sigil-model-bridge__panel { padding:20px; }
      .sigil-model-bridge__items { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:12px; }
      .sigil-model-bridge__item { padding:16px; min-height:124px; }
      .sigil-model-bridge__item span { display:block; color:var(--muted); font-size:12px; margin-bottom:10px; }
      .sigil-model-bridge__item strong { display:block; font-size:20px; }
      .sigil-model-bridge__item em { display:block; margin-top:8px; color:var(--muted); font-style:normal; line-height:1.5; }
      .sigil-model-bridge__actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
      .sigil-model-bridge__btn { display:inline-flex; align-items:center; justify-content:center; min-height:46px; padding:0 16px; border:1px solid rgba(155,220,242,.34); border-radius:999px; color:var(--text); background:rgba(255,255,255,.055); text-decoration:none; font-weight:850; }
      .sigil-model-bridge__btn--primary { color:var(--ink); border-color:rgba(155,220,242,.82); background:linear-gradient(180deg, #d9f7ff, #76c6dd); }
      .sigil-model-bridge__meta { display:grid; gap:8px; color:var(--muted); font-size:13px; line-height:1.5; }
      .sigil-model-bridge__meta code { color:var(--blue); overflow-wrap:anywhere; }
      @media (max-width: 900px) { .sigil-model-bridge { padding:16px; } .sigil-model-bridge__grid, .sigil-model-bridge__items { grid-template-columns:1fr; } }
    </style>
  </head>
  <body>
    <main class="sigil-model-bridge" data-sigil-model-bridge data-build="${SIGIL_MODEL_BUILD}">
      <div hidden>SIGIL_MODEL_BUILD: ${SIGIL_MODEL_BUILD}</div>
      <div class="sigil-model-bridge__shell">
        <section class="sigil-model-bridge__hero">
          <p class="sigil-model-bridge__eyebrow">TarT / Model Immigration</p>
          <h1>Model Console</h1>
          <p class="sigil-model-bridge__lead">คอนโซลฝั่งโมเดลสำหรับ migration และ briefing เท่านั้น ไม่ใช่ client purchase flow และไม่ให้ frontend เป็นแหล่งความจริงของสถานะ.</p>
        </section>
        <section class="sigil-model-bridge__grid">
          <div class="sigil-model-bridge__panel">
            <p class="sigil-model-bridge__kicker">Readiness snapshot</p>
            <div class="sigil-model-bridge__items">
              <article class="sigil-model-bridge__item"><span>Profile readiness</span><strong>Pending Review</strong><em>ข้อมูลโปรไฟล์ต้องถูกยืนยันผ่าน backend/source of truth</em></article>
              <article class="sigil-model-bridge__item"><span>Telegram gate</span><strong>Check Required</strong><em>ใช้สำหรับ notification gateway เท่านั้น</em></article>
              <article class="sigil-model-bridge__item"><span>Onboarding / Verification</span><strong>Bridge Mode</strong><em>สถานะจริงต้องตรวจจากระบบหลังบ้าน</em></article>
              <article class="sigil-model-bridge__item"><span>Job readiness</span><strong>Not Final</strong><em>ยังต้อง confirm readiness ก่อนรับ brief</em></article>
            </div>
            <div class="sigil-model-bridge__actions">
              <a class="sigil-model-bridge__btn sigil-model-bridge__btn--primary" href="${profileHref}">Complete Profile</a>
              <a class="sigil-model-bridge__btn" href="${telegramHref}">Verify Telegram</a>
              <a class="sigil-model-bridge__btn" href="${briefHref}">Open Client Brief</a>
              <a class="sigil-model-bridge__btn" href="${readinessHref}">Confirm Readiness</a>
              <a class="sigil-model-bridge__btn" href="${supportHref}">Contact Support</a>
            </div>
          </div>
          <aside class="sigil-model-bridge__panel">
            <p class="sigil-model-bridge__kicker">Client brief entry</p>
            <h2>Review before action</h2>
            <p class="sigil-model-bridge__lead">TarT ช่วยพาโมเดลเข้า onboarding, verification, readiness และ client brief โดยไม่เปิดเผย secret หรือ admin credential ใน browser.</p>
            <div class="sigil-model-bridge__meta">
              <span>token t: <code>${escapeHtml(token || "not provided")}</code></span>
              <span>session_id: <code>${escapeHtml(sessionId || "not provided")}</code></span>
            </div>
          </aside>
        </section>
      </div>
    </main>
  </body>
</html>`;

  return new Response(request.method === "HEAD" ? null : html, {
    headers: bridgeHeaders("model-console"),
  });
}

function renderMmdModelConsolePage(request: Request): Response {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") || "";
  const sessionId = url.searchParams.get("session_id") || "";
  const query = url.search || "";
  const briefHref = `/model/brief${query}`;
  const scheduleHref = `/model/schedule${query}`;
  const payoutHref = `/model/payout${query}`;
  const supportHref = `/contact${query}`;
  const sigilHref = `/sigil/model/console${query}`;
  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Model Console</title>
    <!-- MMD_MODEL_BUILD: ${MMD_MODEL_BUILD} -->
    <style>
      :root { color-scheme: dark; --bg:#0b0908; --panel:rgba(25,21,17,.86); --soft:rgba(255,255,255,.055); --line:rgba(232,201,142,.22); --line-strong:rgba(244,218,166,.58); --warm:#f0c978; --amber:#d39443; --text:#fff8ee; --muted:rgba(255,248,238,.68); --ink:#17100a; }
      * { box-sizing:border-box; letter-spacing:0; }
      body { margin:0; min-height:100vh; color:var(--text); background:linear-gradient(180deg,#15100d,var(--bg)); font-family:Inter,"Avenir Next","Segoe UI","Noto Sans Thai",Arial,sans-serif; }
      .mmd-model-console { position:relative; min-height:100vh; overflow:hidden; isolation:isolate; padding:24px; }
      .mmd-model-console::before { content:""; position:absolute; inset:0; z-index:-2; background:linear-gradient(90deg,rgba(11,9,8,.92),rgba(11,9,8,.68) 46%,rgba(11,9,8,.34)),url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69f7868b147766ca087fd499_Hito%20membership.webp") 62% 18%/cover no-repeat; transform:scale(1.02); filter:saturate(.92) contrast(1.04); }
      .mmd-model-console::after { content:""; position:absolute; inset:0; z-index:-1; background:linear-gradient(180deg,rgba(11,9,8,.04),var(--bg)); }
      .mmd-model-console__shell { width:min(1160px,100%); margin:0 auto; display:grid; gap:18px; }
      .mmd-model-console__hero { min-height:48vh; display:grid; align-content:end; padding:clamp(28px,5vw,62px) 0; }
      .mmd-model-console__eyebrow, .mmd-model-console__kicker { color:var(--warm); font-size:12px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; }
      .mmd-model-console h1 { max-width:820px; margin:14px 0 0; font-size:clamp(46px,8vw,96px); line-height:.92; text-transform:uppercase; }
      .mmd-model-console__lead { max-width:700px; color:var(--muted); font-size:clamp(16px,2vw,20px); line-height:1.65; }
      .mmd-model-console__grid { display:grid; grid-template-columns:1fr 360px; gap:16px; align-items:start; }
      .mmd-model-console__panel, .mmd-model-console__item { border:1px solid var(--line); border-radius:12px; background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.02)),var(--panel); box-shadow:0 24px 74px rgba(0,0,0,.34); backdrop-filter:blur(18px); }
      .mmd-model-console__panel { padding:20px; }
      .mmd-model-console__items { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .mmd-model-console__item { padding:16px; min-height:124px; }
      .mmd-model-console__item span { display:block; color:var(--muted); font-size:12px; margin-bottom:10px; }
      .mmd-model-console__item strong { display:block; font-size:20px; }
      .mmd-model-console__item em { display:block; margin-top:8px; color:var(--muted); font-style:normal; line-height:1.5; }
      .mmd-model-console__actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
      .mmd-model-console__btn { display:inline-flex; align-items:center; justify-content:center; min-height:46px; padding:0 16px; border:1px solid var(--line-strong); border-radius:10px; color:var(--text); background:var(--soft); text-decoration:none; font-weight:850; }
      .mmd-model-console__btn--primary { color:var(--ink); border-color:rgba(240,201,120,.88); background:linear-gradient(180deg,#ffe5a4,var(--amber)); }
      .mmd-model-console__meta { display:grid; gap:8px; color:var(--muted); font-size:13px; line-height:1.5; }
      .mmd-model-console__meta code { color:var(--warm); overflow-wrap:anywhere; }
      @media (max-width:900px) { .mmd-model-console { padding:16px; } .mmd-model-console__grid, .mmd-model-console__items { grid-template-columns:1fr; } }
    </style>
  </head>
  <body>
    <main class="mmd-model-console" data-mmd-model-console data-build="${MMD_MODEL_BUILD}">
      <div hidden>MMD_MODEL_BUILD: ${MMD_MODEL_BUILD}</div>
      <div class="mmd-model-console__shell">
        <section class="mmd-model-console__hero">
          <p class="mmd-model-console__eyebrow">MMD / Model Workbench</p>
          <h1>Model Console</h1>
          <p class="mmd-model-console__lead">พื้นที่ทำงานของโมเดลสำหรับ brief, schedule, payout และ readiness แบบ MMD โดยตรง แยกจาก SIGIL operating layer.</p>
        </section>
        <section class="mmd-model-console__grid">
          <div class="mmd-model-console__panel">
            <p class="mmd-model-console__kicker">Today snapshot</p>
            <div class="mmd-model-console__items">
              <article class="mmd-model-console__item"><span>Brief</span><strong>Review Queue</strong><em>เช็ค brief และข้อมูล session ก่อนเริ่มงาน</em></article>
              <article class="mmd-model-console__item"><span>Schedule</span><strong>Model Lane</strong><em>สถานะเวลาและการเดินทางอยู่ฝั่งงานจริง</em></article>
              <article class="mmd-model-console__item"><span>Payout</span><strong>Separated</strong><em>ไม่ผูกกับ proof-only หรือ client payment slip</em></article>
              <article class="mmd-model-console__item"><span>Support</span><strong>MMD Team</strong><em>ใช้สำหรับถามทีม ไม่ใช่ admin credential surface</em></article>
            </div>
            <div class="mmd-model-console__actions">
              <a class="mmd-model-console__btn mmd-model-console__btn--primary" href="${briefHref}">Open Brief</a>
              <a class="mmd-model-console__btn" href="${scheduleHref}">Schedule</a>
              <a class="mmd-model-console__btn" href="${payoutHref}">Payout</a>
              <a class="mmd-model-console__btn" href="${supportHref}">Contact Support</a>
            </div>
          </div>
          <aside class="mmd-model-console__panel">
            <p class="mmd-model-console__kicker">Skin boundary</p>
            <h2>MMD surface</h2>
            <p class="mmd-model-console__lead">หน้านี้เป็น MMD model workbench ถ้าต้องเข้าชั้น SIGIL ให้ใช้ route แยกด้านล่าง.</p>
            <div class="mmd-model-console__actions">
              <a class="mmd-model-console__btn" href="${sigilHref}">Open SIGIL Console</a>
            </div>
            <div class="mmd-model-console__meta">
              <span>token t: <code>${escapeHtml(token || "not provided")}</code></span>
              <span>session_id: <code>${escapeHtml(sessionId || "not provided")}</code></span>
            </div>
          </aside>
        </section>
      </div>
    </main>
  </body>
</html>`;

  return new Response(request.method === "HEAD" ? null : html, {
    headers: bridgeHeaders("mmd-model-console"),
  });
}

function renderSigilBookingPage(request: Request): Response {
  const bootstrap = sigilAdminBrowserBootstrapScript();
  const submitPath = SIGIL.booking;
  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SIGIL Booking Request</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #070706;
        --panel: rgba(18, 17, 15, .82);
        --panel-soft: rgba(255, 255, 255, .055);
        --line: rgba(219, 185, 109, .24);
        --line-strong: rgba(237, 207, 141, .72);
        --text: #f7efe2;
        --muted: rgba(235, 224, 207, .72);
        --gold: #d8aa4d;
        --gold-bright: #f2d28a;
        --ink: #151009;
        --success: #a6d9b3;
        --danger: #f1aaaa;
      }
      * { box-sizing: border-box; letter-spacing: 0; }
      html { min-height: 100%; scroll-behavior: smooth; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        background:
          linear-gradient(135deg, rgba(216, 170, 77, .18), transparent 34%),
          linear-gradient(180deg, #15120e 0%, #070706 48%, #020202 100%);
        font-family: Inter, "Avenir Next", "Segoe UI", "Noto Sans Thai", Arial, sans-serif;
      }
      button, input, select, textarea { font: inherit; }
      .sigil-booking {
        min-height: 100vh;
      }
      .sigil-booking__hero {
        position: relative;
        min-height: 64vh;
        display: grid;
        align-items: end;
        overflow: hidden;
        padding: 28px;
        isolation: isolate;
      }
      .sigil-booking__hero::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -2;
        background:
          linear-gradient(90deg, rgba(3, 3, 3, .86) 0%, rgba(3, 3, 3, .56) 45%, rgba(3, 3, 3, .20) 100%),
          url("https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1800&q=82") center / cover;
        transform: scale(1.02);
      }
      .sigil-booking__hero::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: -1;
        background:
          linear-gradient(180deg, transparent 0%, rgba(7, 7, 6, .58) 72%, var(--bg) 100%),
          radial-gradient(circle at 18% 24%, rgba(242, 210, 138, .18), transparent 32%);
      }
      .sigil-booking__hero-grid {
        width: min(100%, 1180px);
        margin: 0 auto;
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(300px, .45fr);
        gap: 28px;
        align-items: end;
      }
      .sigil-booking__label {
        margin: 0 0 14px;
        color: var(--gold-bright);
        font-size: .82rem;
        font-weight: 1000;
        text-transform: uppercase;
      }
      .sigil-booking__title {
        max-width: 820px;
        margin: 0;
        color: var(--text);
        font-family: "Antonio", Inter, "Avenir Next", "Noto Sans Thai", sans-serif;
        font-size: clamp(3.2rem, 8vw, 7.6rem);
        line-height: .9;
        font-weight: 1000;
        text-transform: uppercase;
      }
      .sigil-booking__copy {
        max-width: 660px;
        margin: 22px 0 0;
        color: rgba(247, 239, 226, .82);
        font-size: 1.05rem;
        line-height: 1.62;
      }
      .sigil-booking__logic {
        display: grid;
        gap: 12px;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(7, 7, 6, .62);
        backdrop-filter: blur(18px);
      }
      .sigil-booking__logic-label {
        margin: 0;
        color: var(--gold-bright);
        font-weight: 1000;
        text-transform: uppercase;
        font-size: .78rem;
      }
      .sigil-booking__logic-title {
        margin: 0;
        color: var(--text);
        font-size: 1.45rem;
        line-height: 1.1;
        font-weight: 1000;
      }
      .sigil-booking__logic-text {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .sigil-booking__body {
        width: min(100%, 1180px);
        margin: -34px auto 0;
        padding: 0 28px 48px;
        position: relative;
        z-index: 2;
      }
      .sigil-booking__workspace {
        display: grid;
        gap: 18px;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .075), rgba(255, 255, 255, .025)),
          var(--panel);
        box-shadow: 0 30px 90px rgba(0, 0, 0, .38);
        backdrop-filter: blur(20px);
      }
      .sigil-booking__lanes {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .sigil-booking__lane {
        display: grid;
        gap: 10px;
        min-height: 132px;
        padding: 16px;
        border: 1px solid rgba(219, 185, 109, .22);
        border-radius: 8px;
        background: var(--panel-soft);
        color: var(--text);
        text-align: left;
        cursor: pointer;
      }
      .sigil-booking__lane[aria-pressed="true"] {
        border-color: var(--line-strong);
        background: linear-gradient(180deg, rgba(216, 170, 77, .22), rgba(255, 255, 255, .055));
      }
      .sigil-booking__lane-kicker {
        color: var(--gold-bright);
        font-size: .78rem;
        font-weight: 1000;
        text-transform: uppercase;
      }
      .sigil-booking__lane-title {
        font-size: 1.24rem;
        font-weight: 1000;
      }
      .sigil-booking__lane-copy {
        color: var(--muted);
        line-height: 1.45;
      }
      .sigil-booking__form {
        display: grid;
        gap: 18px;
      }
      .sigil-booking__panel {
        display: none;
        gap: 16px;
      }
      .sigil-booking__panel[data-active="true"] {
        display: grid;
      }
      .sigil-booking__fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }
      .sigil-booking__field {
        display: grid;
        gap: 8px;
        min-width: 0;
        color: var(--gold-bright);
        font-weight: 900;
      }
      .sigil-booking__field--full { grid-column: 1 / -1; }
      input, select, textarea {
        width: 100%;
        min-height: 52px;
        padding: 13px 14px;
        border: 1px solid rgba(219, 185, 109, .28);
        border-radius: 8px;
        outline: none;
        background: rgba(0, 0, 0, .42);
        color: var(--text);
      }
      textarea {
        min-height: 112px;
        resize: vertical;
      }
      input:focus, select:focus, textarea:focus {
        border-color: var(--line-strong);
        box-shadow: 0 0 0 3px rgba(216, 170, 77, .14);
      }
      .sigil-booking__search-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
      }
      .sigil-booking__results {
        min-height: 58px;
        padding: 12px;
        border: 1px dashed rgba(219, 185, 109, .26);
        border-radius: 8px;
        color: var(--muted);
        background: rgba(0, 0, 0, .24);
      }
      .sigil-booking__actions {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      .sigil-booking__button {
        min-height: 46px;
        padding: 0 16px;
        border: 1px solid rgba(216, 170, 77, .52);
        border-radius: 8px;
        background: rgba(255, 255, 255, .055);
        color: var(--text);
        font-weight: 1000;
        cursor: pointer;
      }
      .sigil-booking__button--primary {
        min-width: 210px;
        border-color: rgba(242, 210, 138, .9);
        background: linear-gradient(180deg, #f2d28a 0%, #b9822e 100%);
        color: var(--ink);
      }
      .sigil-booking__status {
        min-height: 1.2em;
        margin: 0;
        color: var(--muted);
      }
      .sigil-booking__status[data-kind="success"] { color: var(--success); }
      .sigil-booking__status[data-kind="error"] { color: var(--danger); }
      .sigil-booking__result {
        display: none;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(0, 0, 0, .32);
        color: var(--muted);
        overflow-wrap: anywhere;
      }
      .sigil-booking__result[data-visible="true"] { display: block; }
      @media (max-width: 860px) {
        .sigil-booking__hero { padding: 18px; }
        .sigil-booking__hero-grid,
        .sigil-booking__lanes,
        .sigil-booking__fields {
          grid-template-columns: 1fr;
        }
        .sigil-booking__body {
          margin-top: -16px;
          padding: 0 14px 34px;
        }
        .sigil-booking__search-row {
          grid-template-columns: 1fr;
        }
      }
    </style>
    ${bootstrap}
  </head>
  <body>
    <main class="sigil-booking" data-build="booking-lane-standard-plus-assisted-20260516c">
      <div hidden>SIGIL_BOOKING_BUILD: booking-lane-standard-plus-assisted-20260516c</div>
      <section class="sigil-booking__hero" aria-labelledby="sigil-booking-title">
        <div class="sigil-booking__hero-grid">
          <div>
            <p class="sigil-booking__label">PRIVATE MEMBER GATE</p>
            <h1 id="sigil-booking-title" class="sigil-booking__title">SĪGIL / BOOKING / REQUEST</h1>
            <p class="sigil-booking__copy">Create a private booking request through the clean member gate. Choose a standard model search when the client knows the lane, or assisted request when Per should shape the recommendation.</p>
          </div>
          <aside class="sigil-booking__logic" aria-label="Booking logic">
            <p class="sigil-booking__logic-label">Booking logic</p>
            <h2 class="sigil-booking__logic-title">Two Lanes</h2>
            <p class="sigil-booking__logic-text">Standard Search keeps the flow direct. Assisted Request captures preference, mood, and constraints for a guided match.</p>
          </aside>
        </div>
      </section>

      <section class="sigil-booking__body">
        <div class="sigil-booking__workspace">
          <div class="sigil-booking__lanes" role="group" aria-label="Booking lanes">
            <button class="sigil-booking__lane" type="button" data-lane="standard" aria-pressed="true">
              <span class="sigil-booking__lane-kicker">Lane 01</span>
              <span class="sigil-booking__lane-title">Standard Search</span>
              <span class="sigil-booking__lane-copy">Search or name a model, then create a booking request with clear schedule and payment details.</span>
            </button>
            <button class="sigil-booking__lane" type="button" data-lane="assisted" aria-pressed="false">
              <span class="sigil-booking__lane-kicker">Lane 02</span>
              <span class="sigil-booking__lane-title">Assisted Request</span>
              <span class="sigil-booking__lane-copy">Send a preference-led request when the best match needs operator recommendation.</span>
            </button>
          </div>

          <form id="sigilBookingForm" class="sigil-booking__form">
            <input id="lane" name="lane" type="hidden" value="standard" />
            <section class="sigil-booking__panel" data-panel="standard" data-active="true" aria-label="Standard Search">
              <div class="sigil-booking__search-row">
                <label class="sigil-booking__field">
                  Standard Search
                  <input id="model_search" name="model_search" type="search" placeholder="Search model name or code" autocomplete="off" />
                </label>
                <button id="modelSearchButton" class="sigil-booking__button" type="button">Search</button>
              </div>
              <div id="modelSearchResults" class="sigil-booking__results" role="status">Ready for Standard Search.</div>
            </section>

            <section class="sigil-booking__panel" data-panel="assisted" aria-label="Assisted Request">
              <label class="sigil-booking__field sigil-booking__field--full">
                Assisted Request
                <textarea id="assisted_note" name="assisted_note" placeholder="Preference, vibe, language, area, timing, and any constraints"></textarea>
              </label>
            </section>

            <div class="sigil-booking__fields">
              <label class="sigil-booking__field">
                Client name
                <input id="customer_name" name="customer_name" type="text" autocomplete="name" required />
              </label>
              <label class="sigil-booking__field">
                Model name
                <input id="model_name" name="model_name" type="text" autocomplete="off" />
              </label>
              <label class="sigil-booking__field">
                Work type
                <select id="job_type" name="job_type" required>
                  <option value="">Select work type</option>
                  <option value="private_booking">Private booking</option>
                  <option value="public_booking">Public booking</option>
                  <option value="travel_booking">Travel booking</option>
                </select>
              </label>
              <label class="sigil-booking__field">
                Date and time
                <input id="job_datetime" name="job_datetime" type="datetime-local" required />
              </label>
              <label class="sigil-booking__field">
                Duration hours
                <input id="duration_hours" name="duration_hours" type="number" min="0.5" step="0.5" value="2" inputmode="decimal" required />
              </label>
              <label class="sigil-booking__field">
                Deposit percent
                <select id="deposit_percent" name="deposit_percent">
                  <option value="30">30%</option>
                  <option value="50">50%</option>
                  <option value="100">100%</option>
                </select>
              </label>
              <label class="sigil-booking__field">
                Total amount THB
                <input id="total_amount_thb" name="total_amount_thb" type="number" min="0" step="1" inputmode="numeric" required />
              </label>
              <label class="sigil-booking__field">
                Location
                <input id="service_location" name="service_location" type="text" required />
              </label>
              <label class="sigil-booking__field sigil-booking__field--full">
                Notes
                <textarea id="notes" name="notes" placeholder="Room, map, client instruction, or model brief"></textarea>
              </label>
            </div>

            <div class="sigil-booking__actions">
              <button id="submit" class="sigil-booking__button sigil-booking__button--primary" type="submit">Create booking request</button>
              <button id="logout" class="sigil-booking__button" type="button">Logout</button>
              <p id="status" class="sigil-booking__status" role="status" aria-live="polite"></p>
            </div>
            <pre id="result" class="sigil-booking__result" aria-live="polite"></pre>
          </form>
        </div>
      </section>
    </main>

    <script>
      (() => {
        const form = document.getElementById("sigilBookingForm");
        const laneInput = document.getElementById("lane");
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const submit = document.getElementById("submit");
        const logout = document.getElementById("logout");
        const searchInput = document.getElementById("model_search");
        const searchButton = document.getElementById("modelSearchButton");
        const searchResults = document.getElementById("modelSearchResults");

        function read(id) {
          const element = document.getElementById(id);
          return element && "value" in element ? element.value.trim() : "";
        }

        function setStatus(message, kind) {
          status.textContent = message || "";
          status.dataset.kind = kind || "";
        }

        function setLane(nextLane) {
          laneInput.value = nextLane;
          document.querySelectorAll("[data-lane]").forEach((button) => {
            button.setAttribute("aria-pressed", button.getAttribute("data-lane") === nextLane ? "true" : "false");
          });
          document.querySelectorAll("[data-panel]").forEach((panel) => {
            panel.dataset.active = panel.getAttribute("data-panel") === nextLane ? "true" : "false";
          });
        }

        function slug(value, fallback) {
          const normalized = String(value || "")
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\\u0300-\\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
          return normalized || fallback;
        }

        function makeId(prefix, seed) {
          return prefix + "_" + slug(seed, "booking") + "_" + Date.now().toString(36);
        }

        function splitDateTime(value) {
          const parts = String(value || "").split("T");
          return { date: parts[0] || "", time: (parts[1] || "").slice(0, 5) };
        }

        function addHoursToDateTime(value, hours) {
          const start = new Date(value);
          if (!Number.isFinite(start.getTime()) || !Number.isFinite(hours)) return "";
          const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
          return String(end.getHours()).padStart(2, "0") + ":" + String(end.getMinutes()).padStart(2, "0");
        }

        function compactObject(input) {
          return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== "" && value !== null && value !== undefined));
        }

        function preservedSearch(allowed) {
          const current = new URLSearchParams(window.location.search);
          const next = new URLSearchParams();
          allowed.forEach((key) => {
            const value = current.get(key);
            if (value) next.set(key, value);
          });
          const out = next.toString();
          return out ? "?" + out : "";
        }

        function preserveOnPath(path) {
          return path + preservedSearch(["t", "code", "promo", "booking_ref", "session_id"]);
        }

        document.querySelectorAll("[data-lane]").forEach((button) => {
          button.addEventListener("click", () => setLane(button.getAttribute("data-lane") || "standard"));
        });

        searchButton.addEventListener("click", async () => {
          const query = searchInput.value.trim();
          if (!query) {
            searchResults.textContent = "Enter a model name or code for Standard Search.";
            return;
          }

          const params = new URLSearchParams(window.location.search);
          params.set("q", query);
          params.set("scope", read("job_type") === "private_booking" ? "private" : "public");
          if (read("customer_name")) params.set("client_name", read("customer_name"));

          searchResults.textContent = "Checking member access...";
          try {
            const response = await fetch("/sigil/api/models/search?" + params.toString(), { credentials: "include" });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data || data.ok === false) {
              searchResults.textContent = data && data.next_required_action
                ? "Model list locked: " + data.next_required_action
                : "Model list locked. Sign in or renew before searching.";
              if (data && data.redirect_url) window.location.href = data.redirect_url;
              return;
            }
            searchResults.textContent = data.matched && data.model
              ? "Matched: " + data.model.display_name + " (" + data.model.model_id + ")"
              : "No active, visible model matched that search.";
          } catch {
            searchResults.textContent = "Model search is temporarily unavailable.";
          }
        });

        logout.addEventListener("click", () => {
          if (window.__MMD_SIGIL_ADMIN__) {
            window.__MMD_SIGIL_ADMIN__.logout();
            return;
          }
          location.href = "/sigil/admin/login";
        });

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setStatus("");
          result.dataset.visible = "false";
          result.textContent = "";

          const lane = read("lane") || "standard";
          const customerName = read("customer_name");
          const modelName = read("model_name") || read("model_search");
          const jobType = read("job_type");
          const jobDateTime = read("job_datetime");
          const durationHours = Number(read("duration_hours"));
          const totalAmount = Number(read("total_amount_thb"));
          const depositPercent = Number(read("deposit_percent")) || 30;
          const dateParts = splitDateTime(jobDateTime);
          const endTime = addHoursToDateTime(jobDateTime, durationHours);
          const locationName = read("service_location");
          const assistedNote = read("assisted_note");
          const notes = read("notes");

          if (!customerName || !jobType || !dateParts.date || !dateParts.time || !endTime || !locationName || !Number.isFinite(durationHours) || durationHours <= 0 || !Number.isFinite(totalAmount) || totalAmount <= 0) {
            setStatus("Complete the required booking details.", "error");
            return;
          }
          if (lane === "standard" && !modelName) {
            setStatus("Standard Search needs a selected or named model.", "error");
            return;
          }
          if (lane === "assisted" && !assistedNote) {
            setStatus("Assisted Request needs preference notes.", "error");
            return;
          }

          const depositAmount = Math.round(totalAmount * depositPercent / 100);
          const finalAmount = Math.max(0, totalAmount - depositAmount);
          const sessionId = makeId("sess", customerName + " " + (modelName || lane));
          const paymentRef = makeId("pay", customerName + " " + dateParts.date);
          const bookingNote = [
            "lane: " + lane,
            modelName ? "model: " + modelName : "",
            assistedNote ? "assisted: " + assistedNote : "",
            notes ? "notes: " + notes : ""
          ].filter(Boolean).join(" | ");

          const metadata = compactObject({
            source: "sigil_booking_request",
            build: "booking-lane-standard-plus-assisted-20260516c",
            booking_lane: lane,
            assisted_note: assistedNote,
            total_amount_thb: totalAmount,
            deposit_percent: depositPercent,
            deposit_amount_thb: depositAmount,
            final_amount_thb: finalAmount
          });

          const payload = compactObject({
            username: slug(customerName, "client"),
            nickname: customerName,
            client_name: customerName,
            customer_name: customerName,
            model_name: modelName || "Assisted Recommendation",
            model_lookup_key: slug(modelName || "assisted_recommendation", "model"),
            session_id: sessionId,
            payment_ref: paymentRef,
            job_type: jobType,
            package_code: slug(jobType, "package"),
            job_date: dateParts.date,
            start_time: dateParts.time,
            end_time: endTime,
            duration_hours: durationHours,
            location_name: locationName,
            amount_thb: depositAmount,
            payment_amount_thb: depositAmount,
            total_amount_thb: totalAmount,
            deposit_percent: depositPercent,
            deposit_amount_thb: depositAmount,
            final_amount_thb: finalAmount,
            currency: "THB",
            payment_type: depositPercent >= 100 ? "full" : "deposit",
            payment_stage: depositPercent >= 100 ? "full" : "deposit",
            payment_method: "promptpay",
            return_url: "/member/first-db",
            cancel_url: preserveOnPath("/sigil/booking"),
            confirm_page: preserveOnPath("/sigil/pay"),
            model_confirm_page: "/model/console",
            note: bookingNote,
            notes: bookingNote,
            metadata_json: metadata,
            payload_json: metadata
          });

          submit.disabled = true;
          submit.textContent = "Creating...";
          setStatus("Creating booking request...");

          try {
            const response = await fetch(${JSON.stringify(submitPath)}, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
              setStatus((data && (data.error || data.message)) || "Could not create booking request.", "error");
              return;
            }
            setStatus("Booking request created.", "success");
            result.dataset.visible = "true";
            result.textContent = JSON.stringify(data, null, 2);
          } catch (error) {
            setStatus("Network error while creating booking request.", "error");
          } finally {
            submit.disabled = false;
            submit.textContent = "Create booking request";
          }
        });
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderCreateSessionLinksPage(request: Request, session: AdminGateSession | null): Response {
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname === SIGIL.booking) {
    return renderSigilBookingPage(request);
  }

  const next = normalizeAdminNextPath(requestUrl.pathname + requestUrl.search);
  const isSigilBooking = requestUrl.pathname === SIGIL.booking || isSigilAdminPath(requestUrl.pathname);
  const bootstrap = isSigilBooking
    ? sigilAdminBrowserBootstrapScript()
    : adminGateBootstrapScript(session as AdminGateSession, next, selectAdminLoginPath(requestUrl.pathname));
  const submitPath = isSigilBooking ? SIGIL.booking : ADMIN_JOBS.createSession;
  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Create Session</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #050505;
        --ink: #0b0906;
        --panel: rgba(17,15,12,.76);
        --panel-strong: rgba(24,21,16,.84);
        --panel-soft: rgba(255,255,255,.045);
        --field: rgba(3,3,3,.54);
        --line: rgba(218,174,82,.24);
        --line-strong: rgba(246,207,126,.68);
        --text: #f8efe2;
        --cream: #fff5df;
        --muted: rgba(235,222,201,.72);
        --gold: #d8aa4d;
        --gold-strong: #f4ce78;
        --gold-deep: #9a6b24;
        --success: #9ad7b2;
        --danger: #f2b0b0;
      }
      * { box-sizing: border-box; letter-spacing: 0; }
      html { min-height: 100%; }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 30px;
        color: var(--text);
        background:
          linear-gradient(160deg, rgba(219,176,84,.18) 0%, rgba(219,176,84,0) 30%),
          linear-gradient(90deg, rgba(255,255,255,.035), rgba(255,255,255,0) 38%),
          linear-gradient(135deg, #13110d 0%, #050505 52%, #010101 100%);
        font-family: Inter, "Avenir Next", "Segoe UI", "Noto Sans Thai", Arial, sans-serif;
      }
      .shell {
        display: grid;
        gap: 24px;
        width: min(100%, 1280px);
        margin: 0 auto;
      }
      .brandbar {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: center;
        padding: 14px 16px;
        border: 1px solid rgba(218,174,82,.2);
        border-radius: 8px;
        background: rgba(8,7,6,.54);
        box-shadow: 0 20px 70px rgba(0,0,0,.32);
        backdrop-filter: blur(18px);
      }
      .brand {
        margin: 0;
        color: var(--cream);
        font: 900 1.08rem/1.2 Inter, "Avenir Next", "Noto Sans Thai", sans-serif;
      }
      .surface {
        margin: 6px 0 0;
        color: var(--gold-strong);
        font-size: .94rem;
        font-weight: 800;
      }
      .masthead {
        display: flex;
        justify-content: space-between;
        gap: 22px;
        align-items: end;
        padding: 10px 2px 0;
      }
      h1 {
        margin: 0;
        color: var(--cream);
        font-family: "Antonio", Inter, "Avenir Next", "Noto Sans Thai", sans-serif;
        font-size: 4rem;
        line-height: .98;
      }
      .admin-chip {
        display: inline-flex;
        min-height: 36px;
        align-items: center;
        justify-content: center;
        padding: 0 14px;
        border: 1px solid rgba(244,206,120,.42);
        border-radius: 8px;
        color: var(--gold-strong);
        background: rgba(216,170,77,.08);
        font-size: .86rem;
        font-weight: 900;
      }
      form {
        display: grid;
        gap: 18px;
      }
      .form-grid {
        display: grid;
        gap: 18px;
        grid-template-columns: minmax(0, 1.06fr) minmax(360px, .94fr);
        align-items: start;
      }
      .form-section {
        display: grid;
        gap: 18px;
        min-width: 0;
        padding: 22px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background:
          linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.018)),
          var(--panel);
        box-shadow: 0 26px 80px rgba(0,0,0,.38);
        backdrop-filter: blur(18px);
      }
      .form-section--pricing {
        background:
          linear-gradient(180deg, rgba(244,206,120,.095), rgba(255,255,255,.02)),
          var(--panel-strong);
      }
      .section-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .section-index {
        display: inline-flex;
        width: 34px;
        height: 34px;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        border: 1px solid rgba(244,206,120,.52);
        border-radius: 8px;
        color: #170f05;
        background: linear-gradient(180deg, #f6d385, #b9822e);
        font-size: .82rem;
        font-weight: 1000;
      }
      .section-title {
        margin: 0;
        color: var(--cream);
        font: 900 1.28rem/1.22 Inter, "Avenir Next", "Noto Sans Thai", sans-serif;
      }
      .fields {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      label,
      .field {
        display: grid;
        gap: 8px;
        min-width: 0;
        color: var(--gold-strong);
        font: 900 1.02rem/1.38 Inter, "Avenir Next", "Noto Sans Thai", sans-serif;
      }
      .span-2 { grid-column: 1 / -1; }
      input,
      select,
      textarea {
        width: 100%;
        min-height: 54px;
        padding: 14px 15px;
        border: 1px solid rgba(218,174,82,.28);
        border-radius: 8px;
        background: var(--field);
        color: var(--text);
        font: 700 1rem/1.36 Inter, "Avenir Next", "Noto Sans Thai", sans-serif;
        outline: none;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
      }
      input::placeholder,
      textarea::placeholder {
        color: rgba(235,222,201,.45);
      }
      input:focus,
      select:focus,
      textarea:focus {
        border-color: var(--line-strong);
        box-shadow: 0 0 0 3px rgba(216,170,77,.13), inset 0 1px 0 rgba(255,255,255,.05);
      }
      input[readonly] {
        color: var(--cream);
        border-color: rgba(244,206,120,.48);
        background: rgba(216,170,77,.12);
      }
      input[type="hidden"] { display: none; }
      select { appearance: none; }
      .deposit-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
      }
      .deposit-option {
        position: relative;
        display: grid;
        min-height: 44px;
        place-items: center;
        border: 1px solid rgba(218,174,82,.28);
        border-radius: 8px;
        background: rgba(0,0,0,.28);
        color: var(--muted);
        font-size: .9rem;
        font-weight: 1000;
        cursor: pointer;
      }
      .deposit-option input {
        position: absolute;
        width: 1px;
        height: 1px;
        min-height: 1px;
        margin: 0;
        padding: 0;
        border: 0;
        opacity: 0;
        pointer-events: none;
      }
      .deposit-option:has(input:checked) {
        border-color: rgba(244,206,120,.9);
        background: linear-gradient(180deg, rgba(244,206,120,.28), rgba(185,130,46,.18));
        color: var(--cream);
        box-shadow: 0 0 0 3px rgba(216,170,77,.1);
      }
      .money-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .addons {
        display: grid;
        gap: 10px;
        padding-top: 2px;
      }
      .actions {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        padding: 16px;
        border: 1px solid rgba(218,174,82,.18);
        border-radius: 8px;
        background: rgba(8,7,6,.46);
        backdrop-filter: blur(16px);
      }
      button {
        min-height: 42px;
        padding: 0 14px;
        border-radius: 8px;
        border: 1px solid rgba(216,170,77,.36);
        background: rgba(255,255,255,.045);
        color: var(--text);
        font: 900 .86rem/1 Inter, "Avenir Next", "Noto Sans Thai", sans-serif;
        cursor: pointer;
      }
      button:hover,
      .open:hover {
        border-color: rgba(244,206,120,.72);
      }
      button.primary {
        min-width: 230px;
        min-height: 52px;
        border-color: rgba(244,206,120,.9);
        background: linear-gradient(180deg, #f6d385 0%, #c69238 100%);
        color: #160f06;
        box-shadow: 0 16px 36px rgba(195,145,53,.27);
      }
      button:disabled {
        cursor: wait;
        opacity: .68;
      }
      .ghost {
        min-height: 36px;
        padding: 0 12px;
        background: transparent;
        color: var(--muted);
        font-size: .82rem;
      }
      .status {
        min-height: 1.2em;
        margin: 0;
        color: var(--muted);
        font-size: .96rem;
        line-height: 1.45;
      }
      .status.error { color: var(--danger); }
      .status.success { color: var(--success); }
      .result {
        display: none;
      }
      .result.visible {
        display: grid;
        gap: 16px;
        padding: 20px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background:
          linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.018)),
          rgba(15,13,10,.78);
        box-shadow: 0 24px 76px rgba(0,0,0,.36);
        backdrop-filter: blur(18px);
      }
      .result h2 {
        margin: 0;
        color: var(--cream);
        font: 900 1.34rem/1.2 Inter, "Avenir Next", "Noto Sans Thai", sans-serif;
      }
      .result-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .result-card {
        display: grid;
        gap: 10px;
        min-width: 0;
        padding: 14px;
        border-radius: 8px;
        border: 1px solid rgba(218,174,82,.22);
        background: var(--panel-soft);
      }
      .result-label {
        color: var(--gold-strong);
        font: 900 .92rem/1.2 Inter, "Avenir Next", "Noto Sans Thai", sans-serif;
      }
      .result-desc {
        margin: 0;
        color: var(--muted);
        font-size: .9rem;
        line-height: 1.45;
      }
      .result-url {
        min-width: 0;
        overflow-wrap: anywhere;
        color: var(--text);
        font-size: .92rem;
        line-height: 1.45;
        text-decoration-color: rgba(216,170,77,.55);
      }
      .result-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }
      .copy,
      .open {
        min-height: 36px;
        padding: 0 12px;
        border-radius: 8px;
        font-size: .8rem;
      }
      .open {
        display: inline-flex;
        align-items: center;
        border: 1px solid rgba(216,170,77,.36);
        color: var(--text);
        background: rgba(255,255,255,.045);
        font: 900 .8rem/1 Inter, "Avenir Next", "Noto Sans Thai", sans-serif;
        text-decoration: none;
      }
      .line-action {
        display: flex;
        justify-content: flex-start;
      }
      .empty { color: var(--muted); }
      @media (max-width: 960px) {
        .form-grid,
        .result-grid { grid-template-columns: 1fr; }
        h1 { font-size: 3rem; }
      }
      @media (max-width: 720px) {
        body { padding: 14px; }
        .shell { gap: 18px; }
        .brandbar,
        .masthead,
        .actions {
          align-items: stretch;
          flex-direction: column;
        }
        .fields,
        .money-grid,
        .deposit-grid { grid-template-columns: 1fr; }
        .form-section,
        .result.visible { padding: 18px; }
        .span-2 { grid-column: auto; }
        button.primary { width: 100%; }
      }
    </style>
    ${bootstrap}
  </head>
  <body>
    <main class="shell">
      <div class="brandbar">
        <div>
          <p class="brand">MMD SĪGIL</p>
          <p class="surface">Create Session</p>
        </div>
        <button id="logout" class="ghost" type="button">Logout</button>
      </div>

      <header class="masthead">
        <h1>Create Session</h1>
        <span class="admin-chip">Admin</span>
      </header>

      <form id="create-session-form">
        <div class="form-grid">
          <section class="form-section" aria-labelledby="service-section">
            <div class="section-heading">
              <span class="section-index">01</span>
              <h2 id="service-section" class="section-title">รายละเอียดบริการ</h2>
            </div>
            <div class="fields">
              <label>
                ชื่อนายแบบ
                <input id="model_name" name="model_name" type="text" autocomplete="off" required />
              </label>
              <label>
                ชื่อลูกค้า
                <input id="customer_name" name="customer_name" type="text" autocomplete="name" required />
              </label>
              <label>
                รูปแบบงาน
                <input id="job_type" name="job_type" type="text" required />
              </label>
              <label>
                วันและเวลา
                <input id="job_datetime" name="job_datetime" type="datetime-local" required />
              </label>
              <label>
                ระยะเวลา
                <input id="duration_hours" name="duration_hours" type="number" min="0.5" step="0.5" value="2" inputmode="decimal" required />
              </label>
              <label>
                สถานที่
                <input id="service_location" name="service_location" type="text" required />
              </label>
              <label>
                เลขที่บ้าน / ห้อง
                <input id="room_address" name="room_address" type="text" />
              </label>
              <label>
                ชื่อสถานที่ (ค้นหา)
                <input id="venue_search_name" name="venue_search_name" type="text" />
              </label>
              <label class="span-2">
                ลิงก์แผนที่ (URL)
                <input id="google_map_url" name="google_map_url" type="url" />
              </label>
              <label class="span-2">
                พิกัดปัจจุบัน
                <input id="current_coordinates" name="current_coordinates" type="text" placeholder="13.7563, 100.5018" />
              </label>
            </div>
          </section>

          <section class="form-section form-section--pricing" aria-labelledby="pricing-section">
            <div class="section-heading">
              <span class="section-index">02</span>
              <h2 id="pricing-section" class="section-title">สรุปราคาค่าบริการ</h2>
            </div>
            <div class="money-grid">
              <label>
                ราคาพื้นฐาน
                <input id="base_price_thb" name="base_price_thb" type="number" min="0" step="1" inputmode="numeric" required />
              </label>
              <div class="field">
                มัดจำ (%)
                <div class="deposit-grid" role="radiogroup" aria-label="มัดจำ (%)">
                  <label class="deposit-option"><input name="deposit_percent" type="radio" value="10" />10%</label>
                  <label class="deposit-option"><input name="deposit_percent" type="radio" value="30" checked />30%</label>
                  <label class="deposit-option"><input name="deposit_percent" type="radio" value="50" />50%</label>
                  <label class="deposit-option"><input name="deposit_percent" type="radio" value="70" />70%</label>
                  <label class="deposit-option"><input name="deposit_percent" type="radio" value="100" />100%</label>
                </div>
              </div>
              <label>
                รายการเพิ่มเติม
                <input id="addons_total_thb" name="addons_total_thb" type="text" readonly />
              </label>
              <label>
                ราคารวมทั้งสิ้น
                <input id="total_amount_thb" name="total_amount_thb" type="text" readonly />
              </label>
            </div>
            <div class="addons">
              <label>
                รายการเพิ่มเติม 1
                <input id="addon_1_thb" name="addon_1_thb" type="number" min="0" step="1" inputmode="numeric" />
              </label>
              <label>
                รายการเพิ่มเติม 2
                <input id="addon_2_thb" name="addon_2_thb" type="number" min="0" step="1" inputmode="numeric" />
              </label>
              <label>
                รายการเพิ่มเติม 3
                <input id="addon_3_thb" name="addon_3_thb" type="number" min="0" step="1" inputmode="numeric" />
              </label>
              <label>
                รายการเพิ่มเติม 4
                <input id="addon_4_thb" name="addon_4_thb" type="number" min="0" step="1" inputmode="numeric" />
              </label>
              <label>
                รายการเพิ่มเติม 5
                <input id="addon_5_thb" name="addon_5_thb" type="number" min="0" step="1" inputmode="numeric" />
              </label>
            </div>
            <input id="addons_note" name="addons_note" type="hidden" />
            <div class="money-grid">
              <label>
                ยอดมัดจำ
                <input id="deposit_amount_thb" name="deposit_amount_thb" type="text" readonly />
              </label>
              <label>
                ยอดค้างชำระ
                <input id="final_amount_thb" name="final_amount_thb" type="text" readonly />
              </label>
            </div>
          </section>
        </div>

        <div class="actions">
          <button id="submit" class="primary" type="submit">สร้างลิงก์ชำระเงิน</button>
          <p id="status" class="status" role="status"></p>
        </div>
      </form>

      <section id="result" class="result" aria-live="polite"></section>
    </main>

    <script>
      (() => {
        const form = document.getElementById("create-session-form");
        const submit = document.getElementById("submit");
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const logout = document.getElementById("logout");
        let lastLineCardPayload = null;

        function read(id) {
          const element = document.getElementById(id);
          return element && "value" in element ? element.value.trim() : "";
        }

        function setStatus(message, kind) {
          status.textContent = message || "";
          status.className = "status" + (kind ? " " + kind : "");
        }

        function clearResult() {
          result.className = "result";
          result.innerHTML = "";
        }

        function readAmount(id, fallback) {
          const raw = read(id).replace(/,/g, "");
          if (!raw) return fallback;
          const num = Number(raw);
          return Number.isFinite(num) ? num : NaN;
        }

        const addonIds = ["addon_1_thb", "addon_2_thb", "addon_3_thb", "addon_4_thb", "addon_5_thb"];

        function formatAmount(value) {
          return Math.round(value).toLocaleString("en-US");
        }

        function writeAmount(id, value) {
          const element = document.getElementById(id);
          if (element && "value" in element) {
            element.value = Number.isFinite(value) ? formatAmount(value) : "";
          }
        }

        function readDepositPercent() {
          const selected = document.querySelector('input[name="deposit_percent"]:checked');
          return selected && "value" in selected ? Number(selected.value) || 30 : 30;
        }

        function calculatePricing() {
          const basePrice = readAmount("base_price_thb", 0);
          const addons = addonIds.map((id) => readAmount(id, 0));
          const depositPercent = readDepositPercent();
          if ([basePrice, depositPercent, ...addons].some(Number.isNaN)) {
            writeAmount("addons_total_thb", NaN);
            writeAmount("total_amount_thb", NaN);
            writeAmount("deposit_amount_thb", NaN);
            writeAmount("final_amount_thb", NaN);
            return {
              basePrice: NaN,
              addonAmounts: addons,
              addonsTotal: NaN,
              totalAmount: NaN,
              depositPercent,
              depositAmount: NaN,
              finalAmount: NaN
            };
          }

          const addonsTotal = addons.reduce((sum, amount) => sum + amount, 0);
          const totalAmount = basePrice + addonsTotal;
          const depositAmount = Math.round(totalAmount * (depositPercent / 100));
          const finalAmount = Math.max(0, totalAmount - depositAmount);
          writeAmount("addons_total_thb", addonsTotal);
          writeAmount("total_amount_thb", totalAmount);
          writeAmount("deposit_amount_thb", depositAmount);
          writeAmount("final_amount_thb", finalAmount);
          return {
            basePrice,
            addonAmounts: addons,
            addonsTotal,
            totalAmount,
            depositPercent,
            depositAmount,
            finalAmount
          };
        }

        function splitDateTime(value) {
          const parts = String(value || "").split("T");
          return {
            date: parts[0] || "",
            time: (parts[1] || "").slice(0, 5)
          };
        }

        function addHoursToDateTime(value, hours) {
          const start = new Date(value);
          if (!Number.isFinite(start.getTime()) || !Number.isFinite(hours)) return "";
          const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
          return String(end.getHours()).padStart(2, "0") + ":" + String(end.getMinutes()).padStart(2, "0");
        }

        function slug(value, fallback) {
          const normalized = String(value || "")
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\\u0300-\\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
          return normalized || fallback;
        }

        function tokenPart() {
          const browserCrypto = globalThis.crypto;
          if (browserCrypto && browserCrypto.getRandomValues) {
            const bytes = new Uint8Array(4);
            browserCrypto.getRandomValues(bytes);
            return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
          }
          return Date.now().toString(36);
        }

        function makeId(prefix, seed) {
          return prefix + "_" + slug(seed, "manual") + "_" + Date.now().toString(36) + "_" + tokenPart();
        }

        function firstString() {
          for (const value of arguments) {
            if (typeof value === "string" && value.trim()) return value.trim();
          }
          return "";
        }

        function compactObject(input) {
          return Object.fromEntries(
            Object.entries(input).filter(([, value]) => value !== "" && value !== null && value !== undefined)
          );
        }

        function escapeAttr(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        }

        function displayLink(value) {
          try {
            const url = new URL(value, location.origin);
            return url.pathname + url.search + url.hash;
          } catch {
            return String(value || "");
          }
        }

        function isLineUserId(value) {
          return /^U[a-zA-Z0-9_-]{20,}$/.test(String(value || "").trim());
        }

        function readTokenFromUrl(value) {
          if (!value) return "";
          try {
            return new URL(value, location.origin).searchParams.get("t") || "";
          } catch {
            return "";
          }
        }

        function linkFor(path, token) {
          if (!token) return "";
          const url = new URL(path, location.origin);
          url.searchParams.set("t", token);
          return url.toString();
        }

        function linkNear(source, path, token) {
          if (!token) return "";
          let origin = location.origin;
          try {
            if (source) origin = new URL(source, location.origin).origin;
          } catch {}
          const url = new URL(path, origin);
          url.searchParams.set("t", token);
          return url.toString();
        }

        function linkCard(label, description, href) {
          if (!href) {
            return [
              '<article class="result-card">',
              '<div class="result-label">' + label + '</div>',
              '<p class="result-desc">' + description + '</p>',
              '<span class="empty">No link returned</span>',
              '</article>'
            ].join("");
          }
          const safeHref = escapeAttr(href);
          const safeDisplay = escapeAttr(displayLink(href));
          return [
            '<article class="result-card">',
            '<div class="result-label">' + label + '</div>',
            '<p class="result-desc">' + description + '</p>',
            '<a class="result-url" href="' + safeHref + '" target="_blank" rel="noopener noreferrer">' + safeDisplay + '</a>',
            '<div class="result-actions">',
            '<button class="copy" type="button" data-copy="' + safeHref + '">Copy</button>',
            '<a class="open" href="' + safeHref + '" target="_blank" rel="noopener noreferrer">Open</a>',
            '</div>',
            '</article>'
          ].join("");
        }

        function lineActionRow(lineUserId) {
          if (!isLineUserId(lineUserId)) return "";
          return [
            '<div class="line-action">',
            '<button class="copy" type="button" data-send-line-card="true">Send LINE Card</button>',
            '</div>',
          ].join("");
        }

        function renderLinks(data, payload, lineUserId) {
          const payments = data && typeof data.payments_response === "object" ? data.payments_response : {};
          const customerDashboardSource = firstString(data && data.customer_dashboard_url, payments && payments.dashboard_url);
          const modelDashboardSource = firstString(data && data.model_dashboard_url, payments && payments.model_dashboard_url);
          const paymentSource = firstString(data && data.customer_payment_url, data && data.payment_url, payments && payments.payment_url);
          const modelConsoleSource = firstString(data && data.model_console_url, payments && payments.model_console_url);
          const customerSource = firstString(
            customerDashboardSource,
            paymentSource,
            data && data.customer_confirmation_url,
            data && data.confirmation_url,
            data && data.confirm_url,
            payments && payments.customer_confirmation_url,
            payments && payments.confirmation_url,
            payments && payments.confirm_url
          );
          const modelSource = firstString(
            modelConsoleSource,
            data && data.model_confirmation_url,
            payments && payments.model_confirmation_url
          );
          const customerToken = firstString(data && data.customer_token, data && data.customer_t, payments && payments.customer_t) || readTokenFromUrl(customerSource);
          const modelToken = firstString(data && data.model_token, data && data.model_t, payments && payments.model_t) || readTokenFromUrl(modelSource);
          const customerFirstDb = customerDashboardSource || linkFor("/member/first-db", customerToken);
          const paymentLink = paymentSource.includes("/pay")
            ? paymentSource
            : linkNear(customerFirstDb || paymentSource, "/pay", customerToken) || paymentSource;
          const modelDashboard = modelDashboardSource || linkNear(customerFirstDb || modelSource, "/model/dashboard", modelToken);
          const modelConsole = modelConsoleSource || linkNear(customerFirstDb || modelSource, "/model/console", modelToken);

          lastLineCardPayload = isLineUserId(lineUserId) && customerFirstDb && paymentLink
            ? {
                line_user_id: lineUserId,
                session_id: payload.session_id,
                client_name: payload.client_name,
                amount_thb: payload.amount_thb,
                deposit_amount_thb: payload.deposit_amount_thb,
                expire_at: firstString(data && data.customer_invite_expires_at, data && data.expires_at, payments && payments.expires_at) || new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
                points_balance: 0,
                dashboard_url: customerFirstDb,
                payment_url: paymentLink
              }
            : null;

          result.className = "result visible";
          result.innerHTML = [
            "<h2>Links ready</h2>",
            '<div class="result-grid">',
            linkCard("Client Dashboard:", "Client first dashboard and session details.", customerFirstDb),
            linkCard("Payment Confirmation:", "Payment proof and confirmation page.", paymentLink),
            linkCard("Model Dashboard:", "Model dashboard and session overview.", modelDashboard),
            linkCard("Model Console:", "Model-side session console.", modelConsole),
            '</div>',
            lineActionRow(lineUserId)
          ].join("");
        }

        logout.addEventListener("click", () => {
          if (window.__MMD_ADMIN_GATE__) {
            window.__MMD_ADMIN_GATE__.logout();
          }
        });

        ["base_price_thb", ...addonIds].forEach((id) => {
          const element = document.getElementById(id);
          if (!element) return;
          element.addEventListener("input", calculatePricing);
          element.addEventListener("change", calculatePricing);
        });
        document.querySelectorAll('input[name="deposit_percent"]').forEach((element) => {
          element.addEventListener("change", calculatePricing);
        });
        calculatePricing();

        result.addEventListener("click", async (event) => {
          const button = event.target instanceof Element ? event.target.closest("[data-copy]") : null;
          if (button) {
            const value = button.getAttribute("data-copy") || "";
            try {
              await navigator.clipboard.writeText(value);
              button.textContent = "Copied";
              setTimeout(() => { button.textContent = "Copy"; }, 1200);
            } catch {
              setStatus("Copy failed.", "error");
            }
            return;
          }

          const lineButton = event.target instanceof Element ? event.target.closest("[data-send-line-card]") : null;
          if (!lineButton || !lastLineCardPayload) return;
          lineButton.disabled = true;
          lineButton.textContent = "Sending...";
          setStatus("");
          try {
            const response = await fetch(${JSON.stringify(SIGIL.sendLineSessionCard)}, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(lastLineCardPayload),
            });
            if (!response.ok) {
              setStatus("Could not send LINE card.", "error");
              return;
            }
            setStatus("LINE card sent.", "success");
            lineButton.textContent = "Sent";
          } catch {
            setStatus("Could not send LINE card.", "error");
          } finally {
            if (lineButton.textContent !== "Sent") {
              lineButton.disabled = false;
              lineButton.textContent = "Send LINE Card";
            }
          }
        });

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setStatus("");
          clearResult();

          const pricing = calculatePricing();
          if ([pricing.basePrice, pricing.totalAmount, pricing.depositAmount, pricing.finalAmount].some(Number.isNaN) || pricing.totalAmount <= 0) {
            setStatus("ตรวจสอบราคาค่าบริการอีกครั้ง", "error");
            return;
          }

          const customerName = read("customer_name");
          const customerUsername = slug(customerName, "client");
          const customerPhone = "";
          const jobType = read("job_type");
          const modelName = read("model_name");
          const modelUsername = "";
          const jobDateTime = read("job_datetime");
          const durationHours = readAmount("duration_hours", NaN);
          const dateTimeParts = splitDateTime(jobDateTime);
          const jobDate = dateTimeParts.date;
          const startTime = dateTimeParts.time;
          const endTime = addHoursToDateTime(jobDateTime, durationHours);
          const serviceLocation = read("service_location");
          const roomAddress = read("room_address");
          const venueSearchName = read("venue_search_name");
          const locationName = serviceLocation || venueSearchName || roomAddress;
          const googleMapUrl = read("google_map_url");
          const currentCoordinates = read("current_coordinates");
          const addonsNote = read("addons_note");
          if (!customerName || !modelName || !jobType || !jobDate || !startTime || !endTime || !locationName || Number.isNaN(durationHours) || durationHours <= 0) {
            setStatus("กรอกข้อมูลบริการที่จำเป็นให้ครบถ้วน", "error");
            return;
          }

          const paymentType = pricing.depositPercent >= 100 ? "full" : "deposit";
          const paymentAmountThb = pricing.depositAmount;
          const sessionId = makeId("sess", customerName + " " + modelName);
          const paymentRef = makeId("pay", customerName + " " + jobDate);
          const customerNote = [
            "รูปแบบงาน: " + jobType,
            "วันและเวลา: " + jobDate + " " + startTime,
            "ระยะเวลา: " + durationHours + " ชั่วโมง",
            "สถานที่: " + locationName,
            roomAddress ? "เลขที่บ้าน / ห้อง: " + roomAddress : "",
            venueSearchName ? "ชื่อสถานที่ (ค้นหา): " + venueSearchName : "",
            currentCoordinates ? "พิกัดปัจจุบัน: " + currentCoordinates : "",
            addonsNote ? "รายการเพิ่มเติม: " + addonsNote : ""
          ].filter(Boolean).join(" | ");
          const metadataJson = compactObject({
            source: "sigil_admin_create_session_links",
            customer_username: customerUsername,
            customer_phone: customerPhone,
            model_username: modelUsername,
            service_location: serviceLocation,
            room_address: roomAddress,
            venue_search_name: venueSearchName,
            current_coordinates: currentCoordinates,
            duration_hours: durationHours,
            base_price_thb: pricing.basePrice,
            addon_1_thb: pricing.addonAmounts[0] || 0,
            addon_2_thb: pricing.addonAmounts[1] || 0,
            addon_3_thb: pricing.addonAmounts[2] || 0,
            addon_4_thb: pricing.addonAmounts[3] || 0,
            addon_5_thb: pricing.addonAmounts[4] || 0,
            addon_amounts_thb: pricing.addonAmounts,
            addons_total_thb: pricing.addonsTotal,
            addons_note: addonsNote,
            total_amount_thb: pricing.totalAmount,
            totalAmount: pricing.totalAmount,
            payment_amount_thb: paymentAmountThb,
            deposit_percent: pricing.depositPercent,
            deposit_amount_thb: pricing.depositAmount,
            depositAmount: pricing.depositAmount,
            final_amount_thb: pricing.finalAmount,
            finalAmount: pricing.finalAmount,
            payment_type: paymentType,
            customer_note: customerNote,
            model_brief_note: ""
          });

          const payload = compactObject({
            username: customerUsername,
            nickname: customerName,
            mmd_client_name: customerName,
            client_name: customerName,
            customer_name: customerName,
            phone: customerPhone,
            model_name: modelName,
            model_lookup_key: slug(modelName, "manual_model"),
            session_id: sessionId,
            payment_ref: paymentRef,
            job_type: jobType,
            package_code: slug(jobType, "package"),
            job_date: jobDate,
            start_time: startTime,
            end_time: endTime,
            duration_hours: durationHours,
            location_name: locationName,
            room_address: roomAddress,
            venue_search_name: venueSearchName,
            google_map_url: googleMapUrl,
            current_coordinates: currentCoordinates,
            amount_thb: paymentAmountThb,
            payment_amount_thb: paymentAmountThb,
            base_price_thb: pricing.basePrice,
            addon_1_thb: pricing.addonAmounts[0] || 0,
            addon_2_thb: pricing.addonAmounts[1] || 0,
            addon_3_thb: pricing.addonAmounts[2] || 0,
            addon_4_thb: pricing.addonAmounts[3] || 0,
            addon_5_thb: pricing.addonAmounts[4] || 0,
            addons_note: addonsNote,
            addons_total_thb: pricing.addonsTotal,
            total_amount_thb: pricing.totalAmount,
            totalAmount: pricing.totalAmount,
            deposit_percent: pricing.depositPercent,
            deposit_amount_thb: pricing.depositAmount,
            depositAmount: pricing.depositAmount,
            final_amount_thb: pricing.finalAmount,
            finalAmount: pricing.finalAmount,
            pay_model_thb: 0,
            currency: "THB",
            payment_type: paymentType,
            payment_stage: paymentType,
            payment_method: "promptpay",
            return_url: "/member/first-db",
            cancel_url: "/sigil/admin/jobs/create-session",
            confirm_page: "/pay",
            model_confirm_page: "/model/console",
            note: customerNote,
            notes: customerNote,
            model_brief_note: "",
            model_history_note: "",
            model_note: "",
            model_history_source: "sigil_admin_create_session_links",
            metadata_json: metadataJson,
            payload_json: metadataJson
          });

          submit.disabled = true;
          submit.textContent = "กำลังสร้างลิงก์...";
          setStatus("กำลังสร้างลิงก์ชำระเงิน...");

          try {
            const response = await fetch(${JSON.stringify(submitPath)}, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              setStatus(response.status === 401 ? "Session expired. Please log in again." : "สร้างลิงก์ไม่สำเร็จ", "error");
              return;
            }

            setStatus("สร้างลิงก์เรียบร้อย", "success");
            renderLinks(data, payload, firstString(payload.line_user_id, data && data.line_user_id));
          } catch {
            setStatus("ไม่สามารถสร้างลิงก์ได้ในตอนนี้", "error");
          } finally {
            submit.disabled = false;
            submit.textContent = "สร้างลิงก์ชำระเงิน";
          }
        });
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderCreateSessionPage(request: Request, session: AdminGateSession | null): Response {
  const requestUrl = new URL(request.url);
  const next = normalizeAdminNextPath(requestUrl.pathname + requestUrl.search);
  const isSigilAdmin = isSigilAdminPath(requestUrl.pathname);
  const bootstrap = isSigilAdmin
    ? sigilAdminBrowserBootstrapScript()
    : adminGateBootstrapScript(session as AdminGateSession, next, selectAdminLoginPath(requestUrl.pathname));
  const submitPath = isSigilAdmin ? SIGIL.createSession : ADMIN_JOBS.createSession;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin Create Session</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08070a;
        --panel: rgba(19,15,24,.82);
        --line: rgba(247,240,232,.14);
        --text: #f7f0e8;
        --muted: #c4b3a7;
        --gold: #d1a66a;
        --rose: #a45b5b;
        --success: #9ad7b2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 24px;
        color: var(--text);
        background:
          radial-gradient(circle at top, rgba(164,91,91,.18), transparent 28%),
          radial-gradient(circle at bottom right, rgba(95,127,132,.12), transparent 30%),
          linear-gradient(180deg, #110d14 0%, #09080d 52%, #060507 100%);
        font-family: Baskerville, "Iowan Old Style", Palatino, Georgia, serif;
      }
      .shell {
        width: min(100%, 980px);
        margin: 0 auto;
        padding: 32px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--panel);
        box-shadow: 0 24px 80px rgba(0,0,0,.35);
        backdrop-filter: blur(18px);
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        margin-bottom: 24px;
      }
      .kicker {
        margin: 0 0 10px;
        color: var(--gold);
        font: 600 .8rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .24em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(2.1rem, 7vw, 4rem);
        line-height: .95;
        letter-spacing: -.04em;
      }
      .lead {
        margin: 16px 0 0;
        color: var(--muted);
        line-height: 1.7;
        max-width: 60ch;
      }
      form {
        display: grid;
        gap: 18px;
        margin-top: 28px;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .grid-full {
        grid-column: 1 / -1;
      }
      label {
        display: grid;
        gap: 8px;
        color: var(--gold);
        font: 600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .16em;
        text-transform: uppercase;
      }
      input, textarea {
        width: 100%;
        min-height: 52px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(7,6,10,.72);
        color: var(--text);
        font: inherit;
      }
      textarea {
        min-height: 124px;
        resize: vertical;
      }
      .actions {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      button {
        min-height: 48px;
        padding: 0 18px;
        border-radius: 999px;
        border: 1px solid rgba(209,166,106,.36);
        background: linear-gradient(135deg, rgba(209,166,106,.24), rgba(164,91,91,.28));
        color: var(--text);
        font: 600 .92rem/1 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .12em;
        text-transform: uppercase;
        cursor: pointer;
      }
      .ghost {
        background: transparent;
      }
      .status {
        min-height: 1.2em;
        margin: 0;
        color: var(--muted);
      }
      .status.error { color: #f2b0b0; }
      .status.success { color: var(--success); }
      pre {
        overflow: auto;
        padding: 18px;
        border-radius: 20px;
        border: 1px solid var(--line);
        background: rgba(7,6,10,.72);
        color: var(--text);
        font: .9rem/1.6 SFMono-Regular, Consolas, Menlo, monospace;
      }
      .hint {
        margin: 0;
        color: var(--muted);
        font-size: .92rem;
      }
      @media (max-width: 720px) {
        .grid { grid-template-columns: 1fr; }
        .topbar { align-items: flex-start; flex-direction: column; }
      }
    </style>
    ${bootstrap}
  </head>
  <body>
    <main class="shell">
      <div class="topbar">
        <div>
          <p class="kicker">Internal Admin / Jobs</p>
          <h1>Create Session</h1>
          <p class="lead">Create a payment confirmation link for a session. This page sends the form to <code>/v1/admin/create-session</code> through the existing admin gate session, so no raw bearer token is exposed in the page itself.</p>
        </div>
        <button id="logout" class="ghost" type="button">Logout</button>
      </div>

      <form id="create-session-form">
        <div class="grid">
          <label>
            Memberstack ID
            <input id="memberstack_id" name="memberstack_id" type="text" required />
          </label>
          <label>
            Model ID
            <input id="model_id" name="model_id" type="text" required />
          </label>
          <label>
            Amount THB
            <input id="amount_thb" name="amount_thb" type="number" min="1" step="1" required />
          </label>
          <label>
            Pay Model THB
            <input id="pay_model_thb" name="pay_model_thb" type="number" min="0" step="1" />
          </label>
          <label>
            Currency
            <input id="currency" name="currency" type="text" value="THB" />
          </label>
          <label>
            Payment Ref
            <input id="payment_ref" name="payment_ref" type="text" />
          </label>
          <label>
            Session ID
            <input id="session_id" name="session_id" type="text" />
          </label>
          <label>
            Return URL
            <input id="return_url" name="return_url" type="url" />
          </label>
          <label class="grid-full">
            Cancel URL
            <input id="cancel_url" name="cancel_url" type="url" />
          </label>
          <label class="grid-full">
            Metadata JSON
            <textarea id="metadata" name="metadata" placeholder='{"source":"manual_immigrate","line_user_id":"..."}'></textarea>
          </label>
        </div>

        <p class="hint">Required fields are <code>memberstack_id</code>, <code>model_id</code>, and <code>amount_thb</code>. Metadata is optional but must be valid JSON if provided.</p>

        <div class="actions">
          <button id="submit" type="submit">Create Session</button>
          <p id="status" class="status" role="status"></p>
        </div>
      </form>

      <pre id="result">Waiting for submission…</pre>
    </main>

    <script>
      (() => {
        const form = document.getElementById("create-session-form");
        const submit = document.getElementById("submit");
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const logout = document.getElementById("logout");

        function setStatus(message, kind) {
          status.textContent = message || "";
          status.className = "status" + (kind ? " " + kind : "");
        }

        function setResult(payload) {
          result.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
        }

        function readOptionalNumber(id) {
          const raw = document.getElementById(id).value.trim();
          if (!raw) return null;
          const num = Number(raw);
          return Number.isFinite(num) ? num : NaN;
        }

        logout.addEventListener("click", () => {
          if (window.__MMD_ADMIN_GATE__) {
            window.__MMD_ADMIN_GATE__.logout();
          }
        });

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setStatus("");

          let metadata = {};
          const metadataRaw = document.getElementById("metadata").value.trim();
          if (metadataRaw) {
            try {
              metadata = JSON.parse(metadataRaw);
            } catch {
              setStatus("Metadata JSON is invalid.", "error");
              return;
            }
          }

          const payModelThb = readOptionalNumber("pay_model_thb");
          if (Number.isNaN(payModelThb)) {
            setStatus("Pay Model THB must be a valid number.", "error");
            return;
          }

          const payload = {
            memberstack_id: document.getElementById("memberstack_id").value.trim(),
            model_id: document.getElementById("model_id").value.trim(),
            amount_thb: Number(document.getElementById("amount_thb").value),
            currency: document.getElementById("currency").value.trim() || "THB",
            payment_ref: document.getElementById("payment_ref").value.trim(),
            session_id: document.getElementById("session_id").value.trim(),
            return_url: document.getElementById("return_url").value.trim(),
            cancel_url: document.getElementById("cancel_url").value.trim(),
            metadata,
          };

          if (payModelThb != null) payload.pay_model_thb = payModelThb;

          submit.disabled = true;
          submit.textContent = "Creating...";
          setStatus("Submitting create-session request…");
          setResult("Working…");

          try {
            const response = await fetch(${JSON.stringify(submitPath)}, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              setStatus((data && (data.error?.message || data.error)) || "Create session failed.", "error");
              setResult(data || { ok: false, status: response.status });
              return;
            }

            setStatus("Session created successfully.", "success");
            setResult(data);
          } catch (error) {
            setStatus("Unable to reach the create-session endpoint right now.", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          } finally {
            submit.disabled = false;
            submit.textContent = "Create Session";
          }
        });
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderCreateJobPage(request: Request, session: AdminGateSession | null): Response {
  const requestUrl = new URL(request.url);
  const next = normalizeAdminNextPath(requestUrl.pathname + requestUrl.search);
  const isSigilAdmin = isSigilAdminPath(requestUrl.pathname);
  const bootstrap = isSigilAdmin
    ? sigilAdminBrowserBootstrapScript()
    : adminGateBootstrapScript(session as AdminGateSession, next, selectAdminLoginPath(requestUrl.pathname));
  const submitPath = isSigilAdmin ? SIGIL.createJob : JOBS.createJob;
  const lineTemplate = `ส่งบรีฟตามนี้ได้เลยค่ะ

1. ชื่อเล่น:
2. วันที่ต้องการใช้บริการ:
3. เวลาที่ต้องการ:
4. สถานที่ / เขต:
5. รูปแบบงาน:
6. งบประมาณ:
7. โมเดลที่สนใจ / สไตล์ที่ต้องการ:
8. เบอร์ติดต่อ:
9. อีเมล:
10. รายละเอียดเพิ่มเติม:`;
  const adminTemplate = `สรุปบรีฟสำหรับสร้าง job
- ชื่อลูกค้า:
- LINE user id:
- เบอร์:
- อีเมล:
- รูปแบบงาน:
- วันที่/เวลา:
- โลเคชัน:
- โมเดล:
- งบ/มัดจำ:
- หมายเหตุสำคัญ:`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin Create Job</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08070a;
        --panel: rgba(19,15,24,.82);
        --line: rgba(247,240,232,.14);
        --text: #f7f0e8;
        --muted: #c4b3a7;
        --gold: #d1a66a;
        --rose: #a45b5b;
        --success: #9ad7b2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 24px;
        color: var(--text);
        background:
          radial-gradient(circle at top, rgba(164,91,91,.18), transparent 28%),
          radial-gradient(circle at bottom right, rgba(95,127,132,.12), transparent 30%),
          linear-gradient(180deg, #110d14 0%, #09080d 52%, #060507 100%);
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
      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        margin-bottom: 24px;
      }
      .kicker {
        margin: 0 0 10px;
        color: var(--gold);
        font: 600 .8rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .24em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(2.1rem, 7vw, 4rem);
        line-height: .95;
        letter-spacing: -.04em;
      }
      .lead {
        margin: 16px 0 0;
        color: var(--muted);
        line-height: 1.7;
        max-width: 70ch;
      }
      .layout {
        display: grid;
        gap: 24px;
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr);
      }
      form {
        display: grid;
        gap: 18px;
        margin-top: 28px;
      }
      .section-title {
        margin: 8px 0 0;
        color: var(--gold);
        font: 600 .82rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .22em;
        text-transform: uppercase;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .grid-full {
        grid-column: 1 / -1;
      }
      label {
        display: grid;
        gap: 8px;
        color: var(--gold);
        font: 600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .16em;
        text-transform: uppercase;
      }
      input, textarea, select {
        width: 100%;
        min-height: 52px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(7,6,10,.72);
        color: var(--text);
        font: inherit;
      }
      textarea { min-height: 124px; resize: vertical; }
      select {
        appearance: none;
      }
      .panel {
        padding: 20px;
        border: 1px solid var(--line);
        border-radius: 24px;
        background: rgba(7,6,10,.46);
      }
      .panel h2 {
        margin: 0 0 10px;
        font-size: 1.1rem;
        letter-spacing: .02em;
      }
      .panel p, .hint {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .actions {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      button {
        min-height: 48px;
        padding: 0 18px;
        border-radius: 999px;
        border: 1px solid rgba(209,166,106,.36);
        background: linear-gradient(135deg, rgba(209,166,106,.24), rgba(164,91,91,.28));
        color: var(--text);
        font: 600 .92rem/1 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .12em;
        text-transform: uppercase;
        cursor: pointer;
      }
      .ghost { background: transparent; }
      .status { min-height: 1.2em; margin: 0; color: var(--muted); }
      .status.error { color: #f2b0b0; }
      .status.success { color: var(--success); }
      pre {
        overflow: auto;
        padding: 18px;
        border-radius: 20px;
        border: 1px solid var(--line);
        background: rgba(7,6,10,.72);
        color: var(--text);
        font: .88rem/1.6 SFMono-Regular, Consolas, Menlo, monospace;
        white-space: pre-wrap;
      }
      .copy {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .summary-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .metric {
        padding: 16px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(247,240,232,.03);
      }
      .metric .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        font: 600 .72rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .18em;
        text-transform: uppercase;
      }
      .metric strong {
        display: block;
        font-size: 1rem;
        line-height: 1.45;
      }
      .result-list {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }
      .result-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(247,240,232,.03);
      }
      .result-row strong,
      .result-row span {
        display: block;
      }
      .result-row span {
        margin-top: 6px;
        color: var(--muted);
        line-height: 1.55;
        word-break: break-word;
      }
      .result-row a {
        color: var(--text);
        text-decoration: none;
      }
      .result-row a:hover {
        text-decoration: underline;
      }
      .mini {
        min-height: 38px;
        padding: 0 14px;
        font-size: .74rem;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(209,166,106,.28);
        background: rgba(209,166,106,.12);
        color: var(--text);
        font: 600 .72rem/1 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .14em;
        text-transform: uppercase;
      }
      .note {
        margin-top: 10px;
        color: var(--muted);
        line-height: 1.6;
      }
      .history-list {
        display: grid;
        gap: 10px;
      }
      .history-item {
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(247,240,232,.03);
      }
      .history-item p {
        margin: 0;
      }
      .history-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }
      .history-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .toolbar {
        display: grid;
        gap: 10px;
        grid-template-columns: 1.4fr .8fr .8fr;
        margin-top: 14px;
      }
      .toolbar input,
      .toolbar select {
        width: 100%;
        min-height: 42px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--line);
        background: rgba(7,6,10,.72);
        color: var(--text);
        font: inherit;
      }
      .toolbar-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .check {
        display: flex;
        gap: 10px;
        align-items: center;
        color: var(--muted);
        font-size: .92rem;
      }
      .check input {
        min-height: 18px;
        width: 18px;
        padding: 0;
      }
      @media (max-width: 920px) {
        .layout { grid-template-columns: 1fr; }
      }
      @media (max-width: 720px) {
        .grid { grid-template-columns: 1fr; }
        .summary-grid { grid-template-columns: 1fr; }
        .result-row { flex-direction: column; }
        .toolbar { grid-template-columns: 1fr; }
        .topbar { align-items: flex-start; flex-direction: column; }
      }
    </style>
    ${bootstrap}
  </head>
  <body>
    <main class="shell">
      <div class="topbar">
        <div>
          <p class="kicker">Internal Admin / Jobs</p>
          <h1>Create Job</h1>
          <p class="lead">Use this page when we receive a brief from LINE or collect the brief manually. When booking fields are filled, one submit creates Airtable intake, member promotion, customer/model onboarding links, customer/model confirm links, and ready-to-use dashboard links in one response.</p>
        </div>
        <button id="logout" class="ghost" type="button">Logout</button>
      </div>

      <div class="layout">
        <section>
          <form id="create-job-form">
            <p class="section-title">Client Identity</p>
            <div class="grid">
              <label>
                Display Name
                <input id="display_name" name="display_name" type="text" required />
              </label>
              <label>
                Nickname
                <input id="nickname" name="nickname" type="text" />
              </label>
              <label>
                LINE User ID
                <input id="line_user_id" name="line_user_id" type="text" />
              </label>
              <label>
                LINE ID
                <input id="line_id" name="line_id" type="text" />
              </label>
              <label>
                Email
                <input id="email" name="email" type="email" />
              </label>
              <label>
                Phone
                <input id="phone" name="phone" type="text" />
              </label>
            </div>

            <p class="section-title">Booking Details</p>
            <div class="grid">
              <label>
                Session ID
                <input id="session_id" name="session_id" type="text" placeholder="optional - auto generated if blank" />
              </label>
              <label>
                Payment Ref
                <input id="payment_ref" name="payment_ref" type="text" placeholder="optional - auto generated if blank" />
              </label>
              <label>
                Job Type
                <input id="job_type" name="job_type" type="text" placeholder="private_vip / dinner / event" />
              </label>
              <label>
                Job Date
                <input id="job_date" name="job_date" type="date" />
              </label>
              <label>
                Start Time
                <input id="start_time" name="start_time" type="time" />
              </label>
              <label>
                End Time
                <input id="end_time" name="end_time" type="time" />
              </label>
              <label>
                Location Name
                <input id="location_name" name="location_name" type="text" placeholder="Hotel / เขต / venue" />
              </label>
              <label>
                Google Map URL
                <input id="google_map_url" name="google_map_url" type="url" placeholder="https://maps.google.com/..." />
              </label>
              <label>
                Amount THB
                <input id="amount_thb" name="amount_thb" type="number" min="0" step="1" placeholder="6500" />
              </label>
              <label>
                Pay Model THB
                <input id="pay_model_thb" name="pay_model_thb" type="number" min="0" step="1" placeholder="2500" />
              </label>
              <label>
                Payment Type
                <select id="payment_type" name="payment_type">
                  <option value="deposit">Deposit</option>
                  <option value="full">Full</option>
                </select>
              </label>
              <label>
                Payment Method
                <input id="payment_method" name="payment_method" type="text" value="promptpay" />
              </label>
              <label class="grid-full">
                Booking Note
                <textarea id="booking_note" name="booking_note" placeholder="รายละเอียดที่ลูกค้าและโมเดลต้องเห็นตอนกด confirm"></textarea>
              </label>
            </div>

            <p class="section-title">Model / Membership</p>
            <div class="grid">
              <label>
                Model Name
                <input id="model_name" name="model_name" type="text" required />
              </label>
              <label>
                Model Record ID
                <input id="model_record_id" name="model_record_id" type="text" />
              </label>
              <label>
                Current Tier
                <input id="current_tier" name="current_tier" type="text" placeholder="standard" />
              </label>
              <label>
                Target Tier
                <input id="target_tier" name="target_tier" type="text" placeholder="premium" />
              </label>
              <label>
                Expires In Hours
                <input id="expires_in_hours" name="expires_in_hours" type="number" min="1" step="1" value="168" />
              </label>
              <label>
                Telegram Thread ID
                <input id="telegram_message_thread_id" name="telegram_message_thread_id" type="number" min="0" step="1" value="61" />
              </label>
              <label class="grid-full">
                Model History Note
                <textarea id="model_history_note" name="model_history_note" placeholder="วางโน้ตสรุปจาก LINE group ของโมเดล หรือสรุปประวัติงานย้อนหลังที่มีอยู่"></textarea>
              </label>
              <label>
                Model History Source
                <input id="model_history_source" name="model_history_source" type="text" value="line_group_note" />
              </label>
              <label>
                Model History Status
                <select id="model_history_status" name="model_history_status">
                  <option value="pending_import">Pending Import</option>
                  <option value="attached">Attached</option>
                  <option value="imported">Imported</option>
                </select>
              </label>
              <label class="grid-full">
                Manual Note Raw
                <textarea id="manual_note_raw" name="manual_note_raw" required placeholder="สรุปบรีฟลูกค้า / รายละเอียดที่ตกลงกัน"></textarea>
              </label>
              <label class="grid-full">
                Model History Payload JSON
                <textarea id="model_history_payload_json" name="model_history_payload_json" placeholder='{"line_group_id":"...","last_summary_at":"2026-04-23","worked_with_clients":["..."]}'></textarea>
              </label>
              <label class="grid-full">
                Operator Summary
                <textarea id="operator_summary" name="operator_summary" placeholder="summary สั้นสำหรับทีม"></textarea>
              </label>
              <label class="grid-full">
                Payload JSON
                <textarea id="payload_json" name="payload_json" placeholder='{"source":"line_brief","job_type":"private_vip","brief":"..."}'></textarea>
              </label>
            </div>

            <label class="check">
              <input id="notify_telegram" name="notify_telegram" type="checkbox" checked />
              <span>Send Telegram notification after create-job</span>
            </label>

            <div class="actions">
              <button id="submit" type="submit">Create Job</button>
              <button id="import-all-airtable" type="button" class="ghost">Import All</button>
              <button id="retry-last-import" type="button" class="ghost">Retry Last Import</button>
              <button id="import-booking-airtable" type="button" class="ghost">Import Booking To Airtable</button>
              <button id="export-model-history-json" type="button" class="ghost">Export JSON</button>
              <button id="generate-model-history-batch" type="button" class="ghost">Generate Batch</button>
              <button id="import-model-history-airtable" type="button" class="ghost">Import To Airtable</button>
              <p id="status" class="status" role="status"></p>
            </div>
            <label class="check">
              <input id="apply-booking-import" name="apply_booking_import" type="checkbox" />
              <span>Apply booking import now to Airtable (unticked = dry run only)</span>
            </label>
            <label class="check">
              <input id="apply-model-history-import" name="apply_model_history_import" type="checkbox" />
              <span>Apply now to Airtable (unticked = dry run only)</span>
            </label>
          </form>

          <section id="result-summary" class="panel" style="margin-top:18px;">
            <div class="copy">
              <h2>Launch Bundle</h2>
              <span class="pill" id="result-pill">waiting</span>
            </div>
            <div id="summary-metrics" class="summary-grid"></div>
            <div id="summary-links" class="result-list"></div>
            <div id="summary-meta" class="result-list"></div>
            <p class="note">Model work history from legacy LINE group notes is not auto-hydrated yet. This flow is ready for Airtable/member signup now, and we can plug the history import in next as a dedicated migration step.</p>
          </section>

          <pre id="result">Waiting for submission…</pre>
        </section>

        <aside class="panel-stack" style="display:grid;gap:18px;">
          <section class="panel">
            <div class="copy">
              <h2>LINE Brief Template</h2>
              <button type="button" data-copy="line-template">Copy</button>
            </div>
            <p class="hint">Send this to the customer when you want them to fill in the brief themselves.</p>
            <pre id="line-template">${escapeHtml(lineTemplate)}</pre>
          </section>

          <section class="panel">
            <div class="copy">
              <h2>Admin Summary Template</h2>
              <button type="button" data-copy="admin-template">Copy</button>
            </div>
            <p class="hint">Use this when the team already talked to the customer and only needs to summarize the brief before creating the job.</p>
            <pre id="admin-template">${escapeHtml(adminTemplate)}</pre>
          </section>

          <section class="panel">
            <h2>What Happens</h2>
            <p>1. Upsert Airtable client and inbox record</p>
            <p>2. Promote or create member</p>
            <p>3. Generate customer/model onboarding + dashboard links</p>
            <p>4. Generate customer/model confirmation links when booking fields are filled</p>
            <p>5. Attach model-history note/payload for later migration</p>
            <p>6. Send Telegram notification and return <code>create_job_v1</code> response</p>
          </section>

          <section class="panel">
            <div class="copy">
              <h2>History Console</h2>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button id="refresh-shared-import-history" type="button">Refresh Shared Logs</button>
                <button id="export-import-history" type="button">Export</button>
                <button id="import-import-history" type="button">Import</button>
                <button id="clear-import-history" type="button">Clear</button>
              </div>
            </div>
            <p class="hint">You can review this browser's recent imports or pull shared import logs back from Airtable for the whole team.</p>
            <div class="toolbar">
              <select id="history-source">
                <option value="local">Local Only</option>
                <option value="airtable">Shared Airtable</option>
                <option value="merged">Merged</option>
              </select>
              <input id="history-search" type="search" placeholder="Search label, route, mode, or payload..." />
              <select id="history-filter-type">
                <option value="">All Types</option>
                <option value="Import All">Import All</option>
                <option value="Booking Import">Booking Import</option>
                <option value="Model History Import">Model History Import</option>
              </select>
              <select id="history-filter-mode">
                <option value="">All Modes</option>
                <option value="dry_run">Dry Run</option>
                <option value="apply">Apply</option>
                <option value="mixed">Mixed</option>
              </select>
              <select id="history-filter-outcome">
                <option value="">All Outcomes</option>
                <option value="failed">Failed Only</option>
                <option value="skipped">Skipped Only</option>
                <option value="created">Created Only</option>
                <option value="ready">Ready Only</option>
              </select>
            </div>
            <div class="toolbar-actions">
              <button id="reset-history-filters" type="button" class="ghost mini">Reset Filters</button>
              <button id="retry-visible-history" type="button" class="ghost mini">Retry Visible</button>
              <span id="history-count" class="hint"></span>
            </div>
            <div id="import-history-list" class="history-list" style="margin-top:14px;"></div>
            <input id="import-history-file" type="file" accept="application/json" style="display:none;" />
          </section>
        </aside>
      </div>
    </main>

    <script>
      (() => {
        const form = document.getElementById("create-job-form");
        const submit = document.getElementById("submit");
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const resultPill = document.getElementById("result-pill");
        const summaryMetrics = document.getElementById("summary-metrics");
        const summaryLinks = document.getElementById("summary-links");
        const summaryMeta = document.getElementById("summary-meta");
        const resultSummary = document.getElementById("result-summary");
        const logout = document.getElementById("logout");
        const importAllAirtable = document.getElementById("import-all-airtable");
        const retryLastImport = document.getElementById("retry-last-import");
        const importBookingAirtable = document.getElementById("import-booking-airtable");
        const applyBookingImport = document.getElementById("apply-booking-import");
        const exportModelHistoryJson = document.getElementById("export-model-history-json");
        const generateModelHistoryBatch = document.getElementById("generate-model-history-batch");
        const importModelHistoryAirtable = document.getElementById("import-model-history-airtable");
        const applyModelHistoryImport = document.getElementById("apply-model-history-import");
        const importHistoryList = document.getElementById("import-history-list");
        const refreshSharedImportHistory = document.getElementById("refresh-shared-import-history");
        const clearImportHistory = document.getElementById("clear-import-history");
        const exportImportHistory = document.getElementById("export-import-history");
        const importImportHistory = document.getElementById("import-import-history");
        const importHistoryFile = document.getElementById("import-history-file");
        const historySource = document.getElementById("history-source");
        const historySearch = document.getElementById("history-search");
        const historyFilterType = document.getElementById("history-filter-type");
        const historyFilterMode = document.getElementById("history-filter-mode");
        const historyFilterOutcome = document.getElementById("history-filter-outcome");
        const resetHistoryFilters = document.getElementById("reset-history-filters");
        const retryVisibleHistory = document.getElementById("retry-visible-history");
        const historyCount = document.getElementById("history-count");
        const IMPORT_HISTORY_KEY = "mmd_import_history_v1";
        let lastArtifacts = null;
        let sharedImportHistory = [];

        function setStatus(message, kind) {
          status.textContent = message || "";
          status.className = "status" + (kind ? " " + kind : "");
        }

        function escapeHtml(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function linkRow(label, value) {
          if (!value) return "";
          const safe = escapeHtml(value);
          return '<div class="result-row"><div><strong>' + escapeHtml(label) + '</strong><span><a href="' + safe + '" target="_blank" rel="noreferrer">' + safe + '</a></span></div><button type="button" class="ghost mini" data-copy-link="' + safe + '">Copy</button></div>';
        }

        function metaRow(label, value) {
          if (!value && value !== 0) return "";
          return '<div class="result-row"><div><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(String(value)) + '</span></div></div>';
        }

        function metricCard(label, value) {
          return '<div class="metric"><p class="eyebrow">' + escapeHtml(label) + '</p><strong>' + escapeHtml(value || "-") + '</strong></div>';
        }

        function summarizeImportRows(rows) {
          const list = Array.isArray(rows) ? rows : [];
          return list.reduce((acc, row) => {
            const action = row && row.action ? String(row.action) : "unknown";
            acc[action] = (acc[action] || 0) + 1;
            return acc;
          }, {});
        }

        function importActionLabel(summary) {
          const parts = [];
          if (summary.created) parts.push(summary.created + " created");
          if (summary.would_create) parts.push(summary.would_create + " ready");
          if (summary.skipped_existing) parts.push(summary.skipped_existing + " existing");
          if (summary.skipped_missing_lookup) parts.push(summary.skipped_missing_lookup + " missing lookup");
          return parts.join(" / ") || "no rows";
        }

        function setResult(payload) {
          const artifacts = payload && typeof payload === "object" ? payload.data?.artifacts || null : null;
          const data = payload && typeof payload === "object" ? payload.data || null : null;
          const links = data?.links || null;
          const confirmLinks = data?.confirm_links || null;
          const membership = links?.context?.membership || null;
          const importSummary = payload && typeof payload === "object" ? payload.summary || null : null;
          const importCounts = payload && typeof payload === "object" ? payload.counts || null : null;
          const importType = payload && typeof payload === "object" ? payload.import_type || "" : "";
          const importAllBooking = payload && typeof payload === "object" ? payload.booking || null : null;
          const importAllModelHistory = payload && typeof payload === "object" ? payload.model_history || null : null;
          const effectiveImportSummary = importSummary || (importType === "all"
            ? {
                clients: [
                  ...((importAllBooking && importAllBooking.summary && Array.isArray(importAllBooking.summary.clients)) ? importAllBooking.summary.clients : []),
                  ...((importAllModelHistory && importAllModelHistory.summary && Array.isArray(importAllModelHistory.summary.clients)) ? importAllModelHistory.summary.clients : []),
                ],
                sessions: [
                  ...((importAllBooking && importAllBooking.summary && Array.isArray(importAllBooking.summary.sessions)) ? importAllBooking.summary.sessions : []),
                  ...((importAllModelHistory && importAllModelHistory.summary && Array.isArray(importAllModelHistory.summary.sessions)) ? importAllModelHistory.summary.sessions : []),
                ],
                payments: [
                  ...((importAllBooking && importAllBooking.summary && Array.isArray(importAllBooking.summary.payments)) ? importAllBooking.summary.payments : []),
                  ...((importAllModelHistory && importAllModelHistory.summary && Array.isArray(importAllModelHistory.summary.payments)) ? importAllModelHistory.summary.payments : []),
                ],
              }
            : null);
          const clientImportSummary = summarizeImportRows(effectiveImportSummary?.clients);
          const sessionImportSummary = summarizeImportRows(effectiveImportSummary?.sessions);
          const paymentImportSummary = summarizeImportRows(effectiveImportSummary?.payments);
          const importMode = payload && typeof payload === "object" ? payload.mode || "" : "";
          lastArtifacts = artifacts;
          result.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
          resultPill.textContent = payload && payload.ok ? "ready" : "waiting";
          resultPill.style.opacity = payload && payload.ok ? "1" : ".6";
          summaryMetrics.innerHTML = [
            metricCard("Member ID", artifacts?.member_id || "pending"),
            metricCard("Promotion", data?.promotion?.promotion_status || "pending"),
            metricCard("Airtable Client", data?.airtable?.client_record_id || "pending"),
            metricCard("Confirm Links", confirmLinks?.ok ? "generated" : (confirmLinks?.attempted ? "blocked" : "not requested")),
            metricCard("Model History", data?.model_history?.status || "missing"),
            metricCard("Import Type", importType ? String(importType).replace(/_/g, " ") : "idle"),
            metricCard("Import Mode", importMode ? String(importMode).replace(/_/g, " ") : "idle"),
            metricCard("Client Import", effectiveImportSummary ? importActionLabel(clientImportSummary) : "idle"),
            metricCard("Session Import", effectiveImportSummary ? importActionLabel(sessionImportSummary) : "idle"),
            metricCard("Payment Import", effectiveImportSummary ? importActionLabel(paymentImportSummary) : "idle"),
            metricCard("Customer Signup", membership?.auto_signup_ready ? "pending member create" : "ready"),
            metricCard("Telegram", data?.telegram?.ok ? "sent" : (data?.telegram?.attempted ? "failed" : "skipped")),
          ].join("");
          summaryLinks.innerHTML = [
            linkRow("Customer Confirm Link", artifacts?.customer_confirmation_url),
            linkRow("Model Confirm Link", artifacts?.model_confirmation_url),
            linkRow("Customer Onboarding", artifacts?.customer_url),
            linkRow("Model Onboarding", artifacts?.model_url),
            linkRow("Customer Dashboard", artifacts?.customer_dashboard_url),
            linkRow("Model Dashboard", artifacts?.model_dashboard_url),
          ].join("") || '<div class="result-row"><div><strong>Links</strong><span>No links yet.</span></div></div>';
          summaryMeta.innerHTML = [
            metaRow("Immigration ID", data?.immigration_id),
            metaRow("Session ID", confirmLinks?.session_id),
            metaRow("Payment Ref", confirmLinks?.payment_ref),
            metaRow("Current Tier", membership?.current_tier),
            metaRow("Target Tier", membership?.target_tier),
            metaRow("Model History Source", data?.model_history?.source),
            metaRow("Model History Note", data?.model_history?.note),
            metaRow("Import Clients", importCounts?.clients),
            metaRow("Import Sessions", importCounts?.sessions),
            metaRow("Import Payments", importCounts?.payments),
            metaRow("Booking Import Mode", importAllBooking?.mode),
            metaRow("History Import Mode", importAllModelHistory?.mode),
            metaRow("Confirm Link Error", confirmLinks?.ok ? "" : confirmLinks?.error),
          ].join("");
          resultSummary.style.display = "block";
        }

        async function copyFrom(id) {
          const value = document.getElementById(id).textContent || "";
          await navigator.clipboard.writeText(value);
        }

        function downloadText(filename, text, type) {
          const blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        }

        function getImportHistory() {
          try {
            const raw = window.localStorage.getItem(IMPORT_HISTORY_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }

        function setImportHistory(entries) {
          window.localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(entries.slice(0, 12)));
        }

        function getHistorySourceEntries() {
          const source = String(historySource.value || "local");
          const localEntries = getImportHistory().map((entry, index) => ({
            ...entry,
            __source: "local",
            __index: index,
            source: entry.source || "local",
          }));
          const sharedEntries = sharedImportHistory.map((entry, index) => ({
            ...entry,
            __source: "airtable",
            __index: index,
            source: entry.source || "airtable",
          }));
          if (source === "airtable") return sharedEntries;
          if (source === "merged") {
            return [...sharedEntries, ...localEntries]
              .sort((left, right) => new Date(right.at || 0).getTime() - new Date(left.at || 0).getTime());
          }
          return localEntries;
        }

        function summarizeCounts(summary) {
          const clients = importActionLabel(summarizeImportRows(summary?.clients));
          const sessions = importActionLabel(summarizeImportRows(summary?.sessions));
          const payments = importActionLabel(summarizeImportRows(summary?.payments));
          return "C: " + clients + " | S: " + sessions + " | P: " + payments;
        }

        function entryMatchesOutcome(entry, outcome) {
          if (!outcome) return true;
          if (outcome === "failed") {
            return entry.status === "failed";
          }
          const summary = entry.summary || {};
          const clients = summarizeImportRows(summary.clients);
          const sessions = summarizeImportRows(summary.sessions);
          const payments = summarizeImportRows(summary.payments);
          if (outcome === "skipped") {
            return !!(clients.skipped_existing || clients.skipped_missing_lookup || sessions.skipped_existing || sessions.skipped_missing_lookup || payments.skipped_existing || payments.skipped_missing_lookup);
          }
          if (outcome === "created") {
            return !!(clients.created || sessions.created || payments.created);
          }
          if (outcome === "ready") {
            return !!(clients.would_create || sessions.would_create || payments.would_create);
          }
          return true;
        }

        function getFilteredImportHistory() {
          const entries = getHistorySourceEntries();
          const search = String(historySearch.value || "").trim().toLowerCase();
          const type = String(historyFilterType.value || "").trim();
          const mode = String(historyFilterMode.value || "").trim();
          const outcome = String(historyFilterOutcome.value || "").trim();
          return entries.filter((entry) => {
            const haystack = [
              entry.label,
              entry.mode,
              entry.route,
              entry.status,
              JSON.stringify(entry.payload || {}),
            ].join(" ").toLowerCase();
            if (search && !haystack.includes(search)) return false;
            if (type && String(entry.label || "") !== type) return false;
            if (mode && String(entry.mode || "") !== mode) return false;
            if (!entryMatchesOutcome(entry, outcome)) return false;
            return true;
          });
        }

        function renderImportHistory() {
          const entries = getHistorySourceEntries();
          const filtered = getFilteredImportHistory();
          historyCount.textContent = filtered.length + " / " + entries.length + " items";
          if (!filtered.length) {
            importHistoryList.innerHTML = '<div class="history-item"><p class="hint">' + (entries.length ? "No matching history items." : "No imports yet.") + '</p></div>';
            return;
          }
          importHistoryList.innerHTML = filtered.map((entry) => {
            return '<div class="history-item">' +
              '<div class="history-head">' +
              '<p><strong>' + escapeHtml(entry.label || "Import") + '</strong></p>' +
              '<span class="pill">' + escapeHtml(entry.mode || "dry_run") + ' / ' + escapeHtml(entry.source || "local") + '</span>' +
              '</div>' +
              '<p class="hint" style="margin-top:8px;">' + escapeHtml(entry.at || "") + '</p>' +
              (entry.error ? '<p class="hint" style="margin-top:8px;color:#b91c1c;">' + escapeHtml(entry.error) + '</p>' : '') +
              '<p class="hint" style="margin-top:8px;">' + escapeHtml(summarizeCounts(entry.summary || {})) + '</p>' +
              '<div class="history-actions">' +
              '<button type="button" class="ghost mini" data-history-retry-source="' + escapeHtml(entry.__source || "local") + '" data-history-retry="' + escapeHtml(String(entry.__index || 0)) + '">Retry</button>' +
              '<button type="button" class="ghost mini" data-history-load-source="' + escapeHtml(entry.__source || "local") + '" data-history-load="' + escapeHtml(String(entry.__index || 0)) + '">Load Payload</button>' +
              '</div>' +
              '</div>';
          }).join("");
        }

        function pushImportHistory(entry) {
          const current = getImportHistory();
          current.unshift(entry);
          setImportHistory(current);
          renderImportHistory();
        }

        function fillFormFromPayload(payload) {
          const set = (id, value) => {
            const element = document.getElementById(id);
            if (!element) return;
            if (element.type === "checkbox") {
              element.checked = !!value;
              return;
            }
            element.value = value == null ? "" : String(value);
          };

          set("display_name", payload.display_name);
          set("nickname", payload.nickname);
          set("line_user_id", payload.line_user_id);
          set("line_id", payload.line_id);
          set("email", payload.email);
          set("phone", payload.phone);
          set("session_id", payload.session_id);
          set("payment_ref", payload.payment_ref);
          set("job_type", payload.job_type);
          set("job_date", payload.job_date);
          set("start_time", payload.start_time);
          set("end_time", payload.end_time);
          set("location_name", payload.location_name);
          set("google_map_url", payload.google_map_url);
          set("amount_thb", payload.amount_thb);
          set("pay_model_thb", payload.pay_model_thb);
          set("payment_type", payload.payment_type);
          set("payment_method", payload.payment_method);
          set("booking_note", payload.booking_note);
          set("model_name", payload.model_name);
          set("model_record_id", payload.model_record_id);
          set("model_history_note", payload.model_history_note);
          set("model_history_source", payload.model_history_source);
          set("model_history_status", payload.model_history_status);
          set("current_tier", payload.current_tier);
          set("target_tier", payload.target_tier);
          set("manual_note_raw", payload.manual_note_raw);
          set("operator_summary", payload.operator_summary);
          set("payload_json", payload.payload_json ? JSON.stringify(payload.payload_json, null, 2) : "");
          set("model_history_payload_json", payload.model_history_payload_json ? JSON.stringify(payload.model_history_payload_json, null, 2) : "");
          set("expires_in_hours", payload.expires_in_hours);
          set("telegram_message_thread_id", payload.telegram_message_thread_id);
          set("notify_telegram", payload.notify_telegram !== false);
        }

        function getHistoryEntryFromDataset(kind, index) {
          const targetIndex = Number(index);
          if (!Number.isFinite(targetIndex)) return null;
          if (kind === "airtable") {
            return sharedImportHistory[targetIndex] || null;
          }
          return getImportHistory()[targetIndex] || null;
        }

        async function refreshSharedHistory() {
          const headers = window.__MMD_ADMIN_GATE__
            ? window.__MMD_ADMIN_GATE__.buildHeaders()
            : new Headers();
          const response = await fetch(${JSON.stringify(JOBS.importLogs)} + "?limit=50", {
            method: "GET",
            headers,
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data || !Array.isArray(data.entries)) {
            throw new Error((data && data.error && data.error.message) || "Unable to load shared logs");
          }
          sharedImportHistory = data.entries;
          renderImportHistory();
          return data.entries;
        }

        async function runImportRequest(label, url, requestBody) {
          const headers = window.__MMD_ADMIN_GATE__
            ? window.__MMD_ADMIN_GATE__.buildHeaders({ "Content-Type": "application/json" })
            : new Headers({ "Content-Type": "application/json" });
          const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data) {
            pushImportHistory({
              label,
              at: new Date().toLocaleString(),
              mode: data?.mode || (requestBody.apply ? "apply" : "dry_run"),
              status: "failed",
              summary: data?.summary || {},
              payload: requestBody.payload || requestBody,
              request: requestBody,
              route: url,
            });
            setStatus("Unable to run " + label.toLowerCase() + ".", "error");
            setResult(data || { ok: false, status: response.status });
            return null;
          }
          pushImportHistory({
            label,
            at: new Date().toLocaleString(),
            mode: data.mode || (requestBody.apply ? "apply" : "dry_run"),
            status: "ok",
            summary: data.summary || {
              clients: data.booking?.summary?.clients || data.model_history?.summary?.clients || [],
              sessions: data.booking?.summary?.sessions || data.model_history?.summary?.sessions || [],
              payments: data.booking?.summary?.payments || data.model_history?.summary?.payments || [],
            },
            payload: requestBody.payload || requestBody,
            request: requestBody,
            route: url,
          });
          setResult(data);
          return data;
        }

        function collectPayload() {
          let payloadJson = {};
          let modelHistoryPayloadJson = {};
          const payloadRaw = document.getElementById("payload_json").value.trim();
          if (payloadRaw) {
            payloadJson = JSON.parse(payloadRaw);
          }
          const modelHistoryPayloadRaw = document.getElementById("model_history_payload_json").value.trim();
          if (modelHistoryPayloadRaw) {
            modelHistoryPayloadJson = JSON.parse(modelHistoryPayloadRaw);
          }

          const payload = {
            display_name: document.getElementById("display_name").value.trim(),
            nickname: document.getElementById("nickname").value.trim(),
            line_user_id: document.getElementById("line_user_id").value.trim(),
            line_id: document.getElementById("line_id").value.trim(),
            email: document.getElementById("email").value.trim(),
            phone: document.getElementById("phone").value.trim(),
            session_id: document.getElementById("session_id").value.trim(),
            payment_ref: document.getElementById("payment_ref").value.trim(),
            job_type: document.getElementById("job_type").value.trim(),
            job_date: document.getElementById("job_date").value.trim(),
            start_time: document.getElementById("start_time").value.trim(),
            end_time: document.getElementById("end_time").value.trim(),
            location_name: document.getElementById("location_name").value.trim(),
            google_map_url: document.getElementById("google_map_url").value.trim(),
            amount_thb: document.getElementById("amount_thb").value.trim(),
            pay_model_thb: document.getElementById("pay_model_thb").value.trim(),
            payment_type: document.getElementById("payment_type").value.trim(),
            payment_method: document.getElementById("payment_method").value.trim(),
            booking_note: document.getElementById("booking_note").value.trim(),
            model_name: document.getElementById("model_name").value.trim(),
            model_record_id: document.getElementById("model_record_id").value.trim(),
            model_history_note: document.getElementById("model_history_note").value.trim(),
            model_history_source: document.getElementById("model_history_source").value.trim(),
            model_history_status: document.getElementById("model_history_status").value.trim(),
            model_history_payload_json: modelHistoryPayloadJson,
            current_tier: document.getElementById("current_tier").value.trim(),
            target_tier: document.getElementById("target_tier").value.trim(),
            manual_note_raw: document.getElementById("manual_note_raw").value.trim(),
            operator_summary: document.getElementById("operator_summary").value.trim(),
            payload_json: payloadJson,
            notify_telegram: document.getElementById("notify_telegram").checked,
          };

          const hoursRaw = document.getElementById("expires_in_hours").value.trim();
          const threadRaw = document.getElementById("telegram_message_thread_id").value.trim();
          if (hoursRaw) payload.expires_in_hours = Number(hoursRaw);
          if (threadRaw) payload.telegram_message_thread_id = Number(threadRaw);
          if (payload.amount_thb) payload.amount_thb = Number(payload.amount_thb);
          if (!payload.amount_thb) delete payload.amount_thb;
          if (payload.pay_model_thb) payload.pay_model_thb = Number(payload.pay_model_thb);
          if (!payload.pay_model_thb && payload.pay_model_thb !== 0) delete payload.pay_model_thb;

          return payload;
        }

        document.querySelectorAll("[data-copy]").forEach((button) => {
          button.addEventListener("click", async () => {
            try {
              await copyFrom(button.getAttribute("data-copy"));
              setStatus("Copied to clipboard.", "success");
            } catch {
              setStatus("Unable to copy right now.", "error");
            }
          });
        });

        resultSummary.addEventListener("click", async (event) => {
          const target = event.target.closest("[data-copy-link]");
          if (!target) return;
          try {
            await navigator.clipboard.writeText(target.getAttribute("data-copy-link") || "");
            setStatus("Link copied.", "success");
          } catch {
            setStatus("Unable to copy right now.", "error");
          }
        });

        importHistoryList.addEventListener("click", async (event) => {
          const retryButton = event.target.closest("[data-history-retry]");
          const loadButton = event.target.closest("[data-history-load]");

          if (retryButton) {
            const index = Number(retryButton.getAttribute("data-history-retry"));
            const source = retryButton.getAttribute("data-history-retry-source") || "local";
            const entry = getHistoryEntryFromDataset(source, index);
            if (!entry) return;
            try {
              fillFormFromPayload(entry.payload || {});
              const data = await runImportRequest(entry.label || "Import", entry.route, entry.request || { payload: entry.payload || {} });
              if (data) setStatus((entry.label || "Import") + " retried.", "success");
            } catch {
              setStatus("Unable to retry selected import.", "error");
            }
            return;
          }

          if (loadButton) {
            const index = Number(loadButton.getAttribute("data-history-load"));
            const source = loadButton.getAttribute("data-history-load-source") || "local";
            const entry = getHistoryEntryFromDataset(source, index);
            if (!entry) return;
            fillFormFromPayload(entry.payload || {});
            setStatus("Payload loaded from history.", "success");
          }
        });

        logout.addEventListener("click", () => {
          if (window.__MMD_ADMIN_GATE__) {
            window.__MMD_ADMIN_GATE__.logout();
          }
        });

        clearImportHistory.addEventListener("click", () => {
          setImportHistory([]);
          renderImportHistory();
          setStatus("Import history cleared.", "success");
        });

        exportImportHistory.addEventListener("click", () => {
          const history = getHistorySourceEntries().map(({ __index, __source, ...entry }) => entry);
          downloadText(
            "mmd-import-history.json",
            JSON.stringify({ exported_at: new Date().toISOString(), entries: history }, null, 2),
            "application/json;charset=utf-8",
          );
          setStatus("Import history exported.", "success");
        });

        importImportHistory.addEventListener("click", () => {
          importHistoryFile.click();
        });

        refreshSharedImportHistory.addEventListener("click", async () => {
          try {
            const entries = await refreshSharedHistory();
            setStatus("Shared Airtable logs refreshed (" + entries.length + ").", "success");
          } catch (error) {
            setStatus(error && error.message ? error.message : "Unable to load shared logs.", "error");
          }
        });

        importHistoryFile.addEventListener("change", async () => {
          const file = importHistoryFile.files && importHistoryFile.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : [];
            if (!Array.isArray(entries)) throw new Error("invalid_import_history_file");
            setImportHistory(entries);
            renderImportHistory();
            setStatus("Import history loaded.", "success");
          } catch {
            setStatus("Unable to import history file.", "error");
          } finally {
            importHistoryFile.value = "";
          }
        });

        [historySource, historySearch, historyFilterType, historyFilterMode].forEach((element) => {
          element.addEventListener("input", renderImportHistory);
          element.addEventListener("change", renderImportHistory);
        });
        historyFilterOutcome.addEventListener("input", renderImportHistory);
        historyFilterOutcome.addEventListener("change", renderImportHistory);

        resetHistoryFilters.addEventListener("click", () => {
          historySearch.value = "";
          historyFilterType.value = "";
          historyFilterMode.value = "";
          historyFilterOutcome.value = "";
          renderImportHistory();
          setStatus("History filters reset.", "success");
        });

        retryVisibleHistory.addEventListener("click", async () => {
          const entries = getFilteredImportHistory();
          if (!entries.length) {
            setStatus("No visible history items to retry.", "error");
            return;
          }
          let completed = 0;
          for (const entry of entries) {
            const data = await runImportRequest(entry.label || "Import", entry.route, entry.request);
            if (data) completed += 1;
          }
          setStatus("Retried " + completed + " visible history item(s).", "success");
        });

        importAllAirtable.addEventListener("click", async () => {
          try {
            const payload = collectPayload();
            const data = await runImportRequest(
              "Import All",
              ${JSON.stringify(JOBS.importAll)},
              {
                payload,
                booking_apply: !!applyBookingImport.checked,
                model_history_apply: !!applyModelHistoryImport.checked,
              },
            );
            if (!data) return;
            setStatus("Import all completed. Review result below.", "success");
          } catch {
            setStatus("Unable to run import all right now.", "error");
          }
        });

        importBookingAirtable.addEventListener("click", async () => {
          try {
            const payload = collectPayload();
            const apply = !!applyBookingImport.checked;
            const data = await runImportRequest("Booking Import", ${JSON.stringify(JOBS.bookingImport)}, { payload, apply });
            if (!data) return;
            setStatus(apply ? "Booking imported to Airtable." : "Booking dry run complete. Review result below.", "success");
          } catch {
            setStatus("Unable to import booking right now.", "error");
          }
        });

        exportModelHistoryJson.addEventListener("click", () => {
          try {
            const payload = collectPayload();
            downloadText(
              (payload.model_name || "model-history") + ".json",
              JSON.stringify(payload, null, 2),
              "application/json;charset=utf-8",
            );
            setStatus("Model history JSON exported.", "success");
          } catch {
            setStatus("Unable to export JSON. Check payload fields first.", "error");
          }
        });

        generateModelHistoryBatch.addEventListener("click", async () => {
          try {
            const payload = collectPayload();
            const headers = window.__MMD_ADMIN_GATE__
              ? window.__MMD_ADMIN_GATE__.buildHeaders({ "Content-Type": "application/json" })
              : new Headers({ "Content-Type": "application/json" });
            const response = await fetch(${JSON.stringify(JOBS.modelHistoryBatch)}, {
              method: "POST",
              headers,
              body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              setStatus("Unable to generate model history batch.", "error");
              return;
            }
            const base = (payload.model_name || payload.display_name || "model-history").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
            downloadText(base + "-clients.csv", data.files["clients.csv"] || "", "text/csv;charset=utf-8");
            downloadText(base + "-sessions.csv", data.files["sessions.csv"] || "", "text/csv;charset=utf-8");
            downloadText(base + "-payments.csv", data.files["payments.csv"] || "", "text/csv;charset=utf-8");
            downloadText(base + "-import-payload.json", JSON.stringify(data.import_payload || {}, null, 2), "application/json;charset=utf-8");
            setStatus("Model history batch generated.", "success");
          } catch {
            setStatus("Unable to generate model history batch right now.", "error");
          }
        });

        importModelHistoryAirtable.addEventListener("click", async () => {
          try {
            const payload = collectPayload();
            const apply = !!applyModelHistoryImport.checked;
            const data = await runImportRequest("Model History Import", ${JSON.stringify(JOBS.modelHistoryImport)}, { payload, apply });
            if (!data) return;
            setStatus(apply ? "Model history imported to Airtable." : "Dry run complete. Review result below.", "success");
          } catch {
            setStatus("Unable to import model history right now.", "error");
          }
        });

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setStatus("");
          let payload;
          try {
            payload = collectPayload();
          } catch {
            setStatus("Payload JSON is invalid.", "error");
            return;
          }

          submit.disabled = true;
          submit.textContent = "Creating...";
          setStatus("Submitting create-job request…");
          setResult("Working…");

          try {
            const headers = window.__MMD_ADMIN_GATE__
              ? window.__MMD_ADMIN_GATE__.buildHeaders({ "Content-Type": "application/json" })
              : new Headers({ "Content-Type": "application/json" });
            const response = await fetch(${JSON.stringify(submitPath)}, {
              method: "POST",
              headers,
              body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              setStatus((data && (data.error?.message || data.error)) || "Create job failed.", "error");
              setResult(data || { ok: false, status: response.status });
              return;
            }

            setStatus("Job created successfully.", "success");
            setResult(data);
          } catch (error) {
            setStatus("Unable to reach create-job right now.", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          } finally {
            submit.disabled = false;
            submit.textContent = "Create Job";
          }
        });

        retryLastImport.addEventListener("click", async () => {
          const entry = getImportHistory()[0];
          if (!entry) {
            setStatus("No recent import to retry.", "error");
            return;
          }
          try {
            fillFormFromPayload(entry.payload || {});
            const data = await runImportRequest(entry.label || "Import", entry.route, entry.request);
            if (!data) return;
            setStatus("Last import retried.", "success");
          } catch {
            setStatus("Unable to retry last import.", "error");
          }
        });

        renderImportHistory();
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function handleAdminLoginSession(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (request.method === "DELETE") {
    return json(
      { ok: true, data: { cleared: true, redirect_to: SIGIL.login }, meta },
      { headers: { "set-cookie": clearGateSessionCookie(request) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    baseUrl?: string;
    accessCode?: string;
    bearer?: string;
    confirmKey?: string;
    next?: string;
  } | null;
  const accessCode = toStr(body?.accessCode);
  const explicitBearer = toStr(body?.bearer);
  const explicitConfirmKey = toStr(body?.confirmKey);
  const requestPath = new URL(request.url).pathname;
  const defaultNext = requestPath === SIGIL.loginSession ? SIGIL.booking : selectAdminDefaultNext(requestPath);
  const next = normalizeAdminNextPath(body?.next, defaultNext);
  let baseUrl = "";

  try {
    baseUrl = normalizeAdminBaseUrl(body?.baseUrl, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_base_url";
    return badRequest(message, meta, { field: "baseUrl" });
  }

  if (!accessCode && !explicitBearer && !explicitConfirmKey) {
    return badRequest("accessCode, bearer, or confirmKey is required", meta, {
      field: "accessCode",
    });
  }

  const candidates: {
    bearer?: string;
    confirmKey?: string;
    sessionBearer?: string;
    sessionConfirmKey?: string;
  }[] = [];

  if (explicitBearer || explicitConfirmKey) {
    const bearer = explicitBearer || accessCode;
    candidates.push({
      ...(bearer ? { bearer, sessionBearer: bearer } : {}),
      ...(explicitConfirmKey ? { confirmKey: explicitConfirmKey, sessionConfirmKey: explicitConfirmKey } : {}),
    });
  } else if (accessCode) {
    candidates.push({ bearer: accessCode, sessionBearer: accessCode });
    candidates.push({ confirmKey: accessCode, sessionConfirmKey: accessCode });

    const expectedGatePassword = String(env.BROWSER_GATE_PASSWORD || env.INTERNAL_TOKEN || "").trim();
    const envBearer = toStr(env.INTERNAL_TOKEN);
    const envConfirmKey = toStr(env.CONFIRM_KEY);
    if (expectedGatePassword && accessCode === expectedGatePassword && (envBearer || envConfirmKey)) {
      candidates.push({
        ...(envBearer ? { bearer: envBearer, sessionBearer: envBearer } : {}),
        ...(envConfirmKey ? { confirmKey: envConfirmKey, sessionConfirmKey: envConfirmKey } : {}),
      });
    }
  }

  const seenCandidates = new Set<string>();
  let verifiedSession: AdminGateSession | null = null;
  for (const candidate of candidates) {
    if (!candidate.bearer && !candidate.confirmKey) continue;

    const candidateKey = JSON.stringify([candidate.bearer || "", candidate.confirmKey || ""]);
    if (seenCandidates.has(candidateKey)) continue;
    seenCandidates.add(candidateKey);

    const headers = new Headers();
    if (candidate.bearer) headers.set("Authorization", `Bearer ${candidate.bearer}`);
    if (candidate.confirmKey) headers.set("X-Confirm-Key", candidate.confirmKey);

    const verified = await verifyAdminAuthority(baseUrl, request, env, headers);
    if (!verified) continue;

    verifiedSession = {
      ok: true,
      at: Date.now(),
      baseUrl,
      ...(candidate.sessionBearer ? { bearer: candidate.sessionBearer } : {}),
      ...(candidate.sessionConfirmKey ? { confirmKey: candidate.sessionConfirmKey } : {}),
    };
    break;
  }

  if (!verifiedSession) {
    return json(
      {
        ok: false,
        error: { code: "ADMIN_VERIFY_FAILED", message: "Access denied." },
        meta,
      },
      { status: 401 },
    );
  }

  return json(
    { ok: true, data: { unlocked: true, redirect_to: next, session: verifiedSession }, meta },
    { headers: { "set-cookie": makeGateSessionCookie(request, verifiedSession) } },
  );
}

async function handleVerifyAccessCode(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (!isAuthorized(request, env)) {
    return unauthorized(meta);
  }

  const body = (await request.json().catch(() => null)) as { accessCode?: string } | null;
  const accessCode = toStr(body?.accessCode);
  const expectedPassword = String(env.BROWSER_GATE_PASSWORD || env.INTERNAL_TOKEN || "").trim();

  if (!accessCode) {
    return badRequest("accessCode is required", meta, { field: "accessCode" });
  }

  if (!expectedPassword || accessCode !== expectedPassword) {
    return json(
      {
        ok: false,
        error: { code: "ACCESS_CODE_INVALID", message: "Access code invalid" },
        meta,
      },
      { status: 401 },
    );
  }

  return json({ ok: true, data: { verified: true }, meta });
}

function writeAuthErrorResponse(request: Request, env: Env): Response | null {
  const auth = authorizeWriteRequest(request, env);
  if (auth.ok) return null;
  return json(
    {
      ok: false,
      error: {
        code: auth.code,
        message: auth.message,
      },
      meta: makeMeta(request),
    },
    { status: auth.status },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const meta = makeMeta(request);

    try {
      const url = new URL(request.url);
      watchUnexpectedSigilGatewayHit(request, url);

      if (isLineWebhookRoute(url.pathname)) {
        return await handleLineWebhook(request, env);
      }

      const legalCanonicalRedirect = publicLegalCanonicalRedirect(request, url);
      if (legalCanonicalRedirect) {
        return legalCanonicalRedirect;
      }

      if (isPublicLegalOriginRoute(request, url)) {
        return fetch(request);
      }

      const sigilAdminCanonicalRedirect = canonicalSigilAdminRedirect(url);
      if (sigilAdminCanonicalRedirect) {
        return sigilAdminCanonicalRedirect;
      }
      const paymentCanonicalRedirect = canonicalPaymentRedirect(request);
      if (paymentCanonicalRedirect) {
        return paymentCanonicalRedirect;
      }
      const legacySigilRenewRedirect = maybeRedirectLegacySigilRenew(request);
      if (legacySigilRenewRedirect) {
        return legacySigilRenewRedirect;
      }
      const sigilRenewalAssetRes = await handleSigilRenewalAssetRoute(request, env);
      if (sigilRenewalAssetRes) {
        return sigilRenewalAssetRes;
      }

      const internalRouteRes = await handleInternalRoutes(request, env);
      if (internalRouteRes) return internalRouteRes;

      const internalAdminInviteCreateResponse = await handleInternalAdminInviteCreateRoute(request, env);
      if (internalAdminInviteCreateResponse) {
        return internalAdminInviteCreateResponse;
      }

      if (
        request.method === "OPTIONS" &&
        (
          isPublicRenewalStatusRoute(url.pathname)
          || isPublicRenewalIntakeRoute(url.pathname)
          || isPublicBookingRequestRoute(url.pathname)
          || isPublicPointsTopupRoute(url.pathname)
          || isPublicRenewalActivateVipRoute(url.pathname)
          || isPublicRecoveryAckRoute(url.pathname)
          || isPublicRecoveryComplaintEvidenceRoute(url.pathname)
          || isPublicCustomerConfirmRoute(url.pathname)
          || isPublicPrivateModelRoute(url.pathname)
          || isPublicPublicModelRoute(url.pathname)
          || isSigilBookingApiRoute(url.pathname)
          || isPaymentPageRoute(url.pathname)
          || isModelSessionAdminPath(url.pathname)
        )
      ) {
        return isSigilBookingApiRoute(url.pathname)
          ? withBookingCors(request, new Response(null, { status: 204 }))
          : withCors(request, env, new Response(null, { status: 204 }));
      }

      const sigilAdminAuthResponse = await handleSigilAdminAuthRoute(request, env);
      if (sigilAdminAuthResponse) {
        return sigilAdminAuthResponse;
      }

      const adminLoginAliasRedirect = canonicalAdminLoginAliasRedirect(request);
      if (adminLoginAliasRedirect) {
        return adminLoginAliasRedirect;
      }

      if (url.pathname === SIGIL.modelPromoteImmigration) {
        return await handleModelPromoteImmigration(request, env);
      }

      if (isSigilAdminPath(url.pathname)) {
        const sigilAdminSession = await getValidSigilAdminSession(request, env);
        if (!sigilAdminSession) {
          return makeSigilAdminLoginRedirect(request);
        }
      }

      if (request.method === "GET" && isHealthRoute(url.pathname)) {
        const body: HealthResponse = {
          ok: true,
          service: "immigrate-worker",
          version: VERSION,
          airtable_sync_enabled: String(env.ENABLE_AIRTABLE_SYNC || "false").toLowerCase() === "true",
          meta,
        };
        return json(body);
      }

      if ((request.method === "GET" || request.method === "HEAD") && isSigilRenewalPageRoute(url.pathname)) {
        return renderSigilRenewalPage(request);
      }

      if (isPaymentPageRoute(url.pathname)) {
        return await handlePaymentPage(request, env);
      }

      if (request.method === "GET" && (url.pathname === PUBLIC.onboardingResolve || url.pathname === SIGIL.inviteResolve)) {
        return await handleResolveInvite(request, env);
      }

      if (url.pathname === SIGIL.clientResolve) {
        return await handleSigilClientResolve(request, env);
      }

      if (url.pathname === SIGIL.modelSearch) {
        return await handleSigilModelSearch(request, env);
      }

      if (request.method === "GET" && url.pathname === MODEL_SESSION_DASHBOARD_PATH) {
        return withCors(request, env, await forwardModelSessionToAdminWorker(request, env));
      }

      if (
        request.method === "POST" &&
        (
          url.pathname === MODEL_SESSION_STATUS_PATH ||
          url.pathname === "/v1/model/session/gps" ||
          url.pathname === "/v1/model/session/update" ||
          url.pathname === "/v1/model/session/emergency"
        )
      ) {
        return withCors(request, env, await forwardModelSessionToAdminWorker(request, env));
      }

      if (request.method === "POST" && isPublicRenewalStatusRoute(url.pathname)) {
        return await handlePublicRenewalStatus(request, env);
      }

      if (request.method === "POST" && isPublicRenewalIntakeRoute(url.pathname)) {
        return await handlePublicRenewalIntake(request, env);
      }

      if (request.method === "POST" && isPublicBookingRequestRoute(url.pathname)) {
        return await handlePublicBookingRequest(request, env);
      }

      if (request.method === "POST" && isPublicPointsTopupRoute(url.pathname)) {
        return await handlePublicPointsTopup(request, env);
      }

      if (request.method === "POST" && isPublicRenewalActivateVipRoute(url.pathname)) {
        return await handlePublicActivateVip(request, env);
      }

      if (request.method === "POST" && isPublicRecoveryAckRoute(url.pathname)) {
        return await handlePublicRecoveryAck(request, env);
      }

      if (request.method === "POST" && isPublicRecoveryComplaintEvidenceRoute(url.pathname)) {
        return await handlePublicRecoveryComplaintEvidence(request, env);
      }

      if (request.method === "POST" && isPublicCustomerConfirmRoute(url.pathname)) {
        return await handleCustomerConfirm(request, env);
      }

      if (request.method === "POST" && (url.pathname === PUBLIC.privateModelApply || url.pathname === SIGIL.privateModelApply)) {
        return await handlePrivateModelApply(request, env);
      }

      if (request.method === "POST" && (url.pathname === PUBLIC.privateModelUploadUrl || url.pathname === SIGIL.privateModelUploadUrl)) {
        return await handlePrivateModelUploadUrl(request, env);
      }

      if (request.method === "PUT" && (url.pathname === PUBLIC.privateModelUploadFile || url.pathname === SIGIL.privateModelUploadFile)) {
        return await handlePrivateModelUploadFile(request, env);
      }

      if (request.method === "POST" && (url.pathname === PUBLIC.publicModelApply || url.pathname === SIGIL.publicModelApply)) {
        return await handlePublicModelApply(request, env);
      }

      if (request.method === "POST" && (url.pathname === PUBLIC.publicModelUploadUrl || url.pathname === SIGIL.publicModelUploadUrl)) {
        return await handlePublicModelUploadUrl(request, env);
      }

      if (request.method === "PUT" && (url.pathname === PUBLIC.publicModelUploadFile || url.pathname === SIGIL.publicModelUploadFile)) {
        return await handlePublicModelUploadFile(request, env);
      }

      if (url.pathname === "/internal/line/send-session-card") {
        return handleSendLineSessionCard(request, env);
      }

      if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === "/login" || url.pathname === "/member/login")) {
        return renderMemberLoginPage();
      }

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === SIGIL_LOGIN_PATH) {
        return renderSigilLoginOnlyPage(request);
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === SIGIL.apply || url.pathname === SIGIL.modelApply || url.pathname === SIGIL.modelApplyPrivate)
      ) {
        return renderSigilApplyPage(request);
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === SIGIL.applyStatus || url.pathname === SIGIL.modelApplyPrivateReceived)
      ) {
        return renderSigilApplyStatusPage(request);
      }

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === MEMBER_ACCOUNT_PATH) {
        return renderSigilMemberAccountPage(request);
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === MEMBER_DASHBOARD_ALIAS_PATH || url.pathname === `${MEMBER_DASHBOARD_ALIAS_PATH}/`)
      ) {
        return renderMmdMemberDashboardPage(request);
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === MEMBER_MEMBERSHIP_ALIAS_PATH || url.pathname === `${MEMBER_MEMBERSHIP_ALIAS_PATH}/`)
      ) {
        return renderMmdMemberMembershipPage(request);
      }

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === MODEL_CONSOLE_PATH) {
        return renderSigilModelConsolePage(request);
      }

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === MODEL_CONSOLE_ALIAS_PATH) {
        return renderMmdModelConsolePage(request);
      }

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === MODEL_CONFIRM_ALIAS_PATH) {
        return bridgeRedirect(request, MODEL_CONSOLE_ALIAS_PATH);
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === CONTROL_ROOM.login || url.pathname === SIGIL.login)
      ) {
        return renderAdminLoginPage(request, env);
      }

      if (
        (request.method === "POST" || request.method === "DELETE") &&
        (url.pathname === CONTROL_ROOM.loginSession || url.pathname === SIGIL.loginSession)
      ) {
        return await handleAdminLoginSession(request, env);
      }

      if (
        request.method === "POST" &&
        (url.pathname === CONTROL_ROOM.verifyAccessCode || url.pathname === SIGIL.verifyAccessCode)
      ) {
        return await handleVerifyAccessCode(request, env);
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === ADMIN_JOBS.createSession ||
          url.pathname === ADMIN_JOBS.createSessionLegacy ||
          url.pathname === SIGIL.booking ||
          url.pathname === SIGIL.createSession)
      ) {
        if (request.method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        }

        const gateSession = getValidatedGateSession(request);
        const sigilAdminSession = (url.pathname === SIGIL.booking || isSigilAdminPath(url.pathname))
          ? await getValidSigilAdminSession(request, env)
          : null;
        if (url.pathname !== SIGIL.booking && !gateSession && !sigilAdminSession && !isAuthorized(request, env)) {
          return makeLoginRedirect(request, url.pathname);
        }

        const session =
          sigilAdminSession ? null :
          gateSession ||
          ({
            ok: true,
            at: Date.now(),
            baseUrl: new URL(request.url).origin,
            bearer: readInternalToken(request) || env.INTERNAL_TOKEN,
          } satisfies AdminGateSession);

        return (url.pathname === SIGIL.booking || url.pathname === SIGIL.createSession)
          ? renderCreateSessionLinksPage(request, session)
          : renderCreateSessionPage(request, session);
      }

      if (
        request.method === "POST" &&
        url.pathname === SIGIL.sendLineSessionCard
      ) {
        return await handleSigilSendLineSessionCard(request, env, meta);
      }

      if (
        request.method === "POST" &&
        (url.pathname === SIGIL.booking || url.pathname === SIGIL.createSession)
      ) {
        const sigilAdminSession = await getValidSigilAdminSession(request, env);
        if (!sigilAdminSession) {
          return makeSigilAdminLoginRedirect(request);
        }
        return await handleCreateLinks(request, env);
      }

      if (
        request.method === "POST" &&
        (url.pathname === ADMIN_JOBS.createSession ||
          url.pathname === ADMIN_JOBS.createSessionLegacy)
      ) {
        return await handleAdminCreateSessionProxy(request, env, meta);
      }

      if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === JOBS.createJob || url.pathname === SIGIL.createJob)) {
        if (request.method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        }

        const gateSession = getValidatedGateSession(request);
        const sigilAdminSession = isSigilAdminPath(url.pathname)
          ? await getValidSigilAdminSession(request, env)
          : null;
        if (!gateSession && !sigilAdminSession && !isAuthorized(request, env)) {
          return makeLoginRedirect(request, url.pathname);
        }

        const session =
          sigilAdminSession ? null :
          gateSession ||
          ({
            ok: true,
            at: Date.now(),
            baseUrl: new URL(request.url).origin,
            bearer: readInternalToken(request) || env.INTERNAL_TOKEN,
          } satisfies AdminGateSession);

        return renderCreateJobPage(request, session);
      }

      if ((request.method === "GET" || request.method === "HEAD") && isProtectedBrowserRoute(url.pathname)) {
        const legacyPath = getLegacyAdminPath(url.pathname);
        const upstreamUrl = new URL(request.url);
        upstreamUrl.pathname = legacyPath;
        const upstreamRequest = legacyPath === url.pathname ? request : new Request(upstreamUrl.toString(), request);

        if (isAuthorized(request, env)) {
          return fetch(upstreamRequest);
        }

        const gateSession = getValidatedGateSession(request);
        const sigilAdminSession = isSigilAdminPath(url.pathname)
          ? await getValidSigilAdminSession(request, env)
          : null;
        if (!gateSession && !sigilAdminSession) {
          return makeLoginRedirect(request, url.pathname);
        }

        const upstream = await fetch(upstreamRequest);
        if (request.method === "HEAD") {
          return upstream;
        }

        if (sigilAdminSession) {
          return await withInjectedSigilAdminBootstrap(upstream);
        }

        return await withInjectedAdminBootstrap(request, upstream, gateSession as AdminGateSession);
      }

      if (request.method === "POST" && isLineIntakeRoute(url.pathname)) {
        const authError = writeAuthErrorResponse(request, env);
        if (authError) return authError;
        return await handleLineIntake(request, env);
      }

      if (!isAuthorized(request, env)) {
        const sigilAdminSession = isSigilAdminPath(url.pathname)
          ? await getValidSigilAdminSession(request, env)
          : null;
        if (!sigilAdminSession) return unauthorized(meta);
      }

      if (request.method === "POST" && url.pathname === SIGIL.privateModelReplayAirtable) {
        return await handlePrivateModelReplayAirtable(request, env);
      }

      if (request.method === "POST" && url.pathname === SIGIL.privateModelAirtableCheck) {
        return await handlePrivateModelAirtableCheck(request, env);
      }

      if (request.method === "POST" && isLinePreviewRoute(url.pathname)) {
        return await handleLinePreview(request, env);
      }

      if (request.method === "POST" && isCreateJobRoute(url.pathname)) {
        return await handleCreateJob(request, env);
      }

      if (request.method === "POST" && (url.pathname === JOBS.createJob || url.pathname === SIGIL.createJob)) {
        return await handleCreateJob(request, env);
      }

      if (request.method === "POST" && url.pathname === JOBS.modelHistoryBatch) {
        return await handleModelHistoryBatch(request);
      }

      if (request.method === "POST" && url.pathname === JOBS.modelHistoryImport) {
        return await handleModelHistoryImport(request, env);
      }

      if (request.method === "POST" && url.pathname === JOBS.privateProfileImport) {
        return await handlePrivateProfileImport(request, env);
      }

      if (request.method === "POST" && url.pathname === JOBS.bookingImport) {
        return await handleBookingImport(request, env);
      }

      if (request.method === "POST" && url.pathname === JOBS.importAll) {
        return await handleImportAll(request, env);
      }

      if (request.method === "GET" && url.pathname === JOBS.importLogs) {
        return await handleImportLogs(request, env);
      }

      if (request.method === "POST" && isIntakeRoute(url.pathname)) {
        return await handleIntake(request);
      }

      if (request.method === "POST" && isPromoteRoute(url.pathname)) {
        return await handlePromote(request, env);
      }

      if (request.method === "POST" && isLinksRoute(url.pathname)) {
        return await handleCreateImmigrationLinks(request, env);
      }

      const immigrationId = getImmigrationIdFromPath(url.pathname);
      if (request.method === "GET" && immigrationId) {
        return await handleGetImmigration(request, immigrationId, env);
      }

      if (request.method === "GET" && isListRoute(url.pathname)) {
        return await handleList(request, env);
      }

      if (request.method === "POST" && isRefreshRoute(url.pathname)) {
        return await handleRefresh(request);
      }

      if (request.method === "POST" && isSyncRoute(url.pathname)) {
        return await handleSync(request, env);
      }

      if (request.method === "GET" && isLogsRoute(url.pathname)) {
        return await handleLogs(request);
      }

      if ((request.method === "GET" || request.method === "POST") && isSessionsRoute(url.pathname)) {
        return await handleSessions(request, env);
      }

      if (url.pathname === "/internal/jobs/create-links") {
        if (!isAuthorized(request, env)) return unauthorized(meta);
        return handleCreateLinks(request, env);
      }

      if (request.method === "POST" && url.pathname === JOBS.createInvite) {
        return await handleCreateInvite(request, env);
      }

      return json(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Route not found",
          },
          meta,
        },
        { status: 404 },
      );
    } catch (error) {
      console.error("immigrate-worker error", error);
      return internalError(meta, error instanceof Error ? error.message : "Internal Server Error");
    }
  },
};
