import { buildImmigrationLinkContext, writeLinkAuditRecord } from "../lib/airtable";
import { buildAbsoluteUrl, generateInviteLink, parseInviteIdentity } from "../lib/invite";
import { badRequest, json, makeMeta } from "../lib/response";
import {
  buildSessionLinkArtifacts,
  writeCreateLinksMigrationRecords,
} from "../lib/session-links";
import type { Env, ImmigrationLinkContext } from "../types";
import type { InviteLane, InviteRole } from "../lib/invite";

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
  phone?: string;
  deposit_amount_thb?: number | string;
  model_history_note?: string;
  model_note?: string;
  private_profile_note?: string;
  model_history_source?: string;
  model_history_status?: string;
  model_history_payload_json?: Record<string, unknown>;
  payload_json?: Record<string, unknown>;
  confirm_page?: string;
  model_confirm_page?: string;
  membership_status?: string;
  current_tier?: string;
  target_tier?: string;
};

type LinkBundle = {
  immigration_id: string;
  expires_at: string;
  expires_in_hours: number;
  customer_token: string;
  model_token: string;
  customer_url: string;
  model_url: string;
  customer_rules_url: string;
  model_rules_url: string;
  customer_dashboard_url: string;
  model_dashboard_url: string;
  context: ImmigrationLinkContext;
};

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

function normalizeCreateLinksPayload(payload: InvitePayload, env: Env): Record<string, unknown> {
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
  normalized.promptpay_id = toStr(env.PROMPTPAY_ID);
  normalized.google_map_url = toStr(payload.google_map_url);
  normalized.note = toStr(payload.note || payload.notes) || buildDefaultBookingNote(payload);

  return normalized;
}

function clampExpiryHours(value: unknown): number {
  const fallback = 24 * 3;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(24 * 14, Math.round(raw)));
}

function defaultPublicBaseUrl(env: Env): string {
  return toStr(env.SIGIL_BASE_URL || env.PUBLIC_WEB_BASE_URL) || "https://sigil.mmdbkk.com";
}

function defaultCustomerDashboardBaseUrl(env: Env): string {
  return toStr(env.WEB_BASE_URL) || "https://mmdbkk.com";
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
): Promise<LinkBundle> {
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

function auditLinkBundle(env: Env, invitePayload: InvitePayload, linkBundle: LinkBundle): void {
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
}

export async function handleCreateLinks(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        allow: "POST, OPTIONS",
      },
    });
  }

  if (request.method !== "POST") {
    return json(
      {
        ok: false,
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Method not allowed",
        },
        meta,
      },
      {
        status: 405,
        headers: {
          allow: "POST, OPTIONS",
        },
      },
    );
  }

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
    membership_status: toStr(invitePayload.membership_status),
    current_tier: toStr(invitePayload.current_tier),
    target_tier: toStr(invitePayload.target_tier),
    requires_rules_ack: boolFromUnknown(invitePayload.requires_rules_ack, role === "model"),
    requires_model_binding: boolFromUnknown(invitePayload.requires_model_binding, role === "model"),
    customer_onboarding_path: role === "customer" ? toStr(invitePayload.invite_page) : undefined,
    model_onboarding_path: role === "model" ? toStr(invitePayload.invite_page) : undefined,
    expires_in_hours: Number(invitePayload.expires_in_hours || 24 * 7),
  });
  const baseSessionLinks = buildSessionLinkArtifacts(env, invitePayload, linkBundle);
  upstreamPayload = {
    ...upstreamPayload,
    promptpay_id: baseSessionLinks.promptpay_id,
    dashboard_url: baseSessionLinks.customer_dashboard_url,
    payment_url: baseSessionLinks.customer_payment_url,
    model_console_url: baseSessionLinks.model_console_url,
  };

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
        const sessionLinks = buildSessionLinkArtifacts(env, invitePayload, linkBundle, payloadJson);
        const airtable = await writeCreateLinksMigrationRecords(env, invitePayload, sessionLinks, payloadJson);
        const merged = {
          ...payloadJson,
          onboarding_url: role === "model" ? linkBundle.model_url : linkBundle.customer_url,
          customer_onboarding_url: linkBundle.customer_url,
          model_onboarding_url: linkBundle.model_url,
          customer_payment_url: sessionLinks.customer_payment_url,
          customer_rules_url: linkBundle.customer_rules_url,
          model_rules_url: linkBundle.model_rules_url,
          customer_dashboard_url: sessionLinks.customer_dashboard_url,
          model_dashboard_url: linkBundle.model_dashboard_url,
          model_console_url: sessionLinks.model_console_url,
          next_booking_url: sessionLinks.next_booking_url,
          promptpay_id: sessionLinks.promptpay_id,
          link_context: linkBundle.context,
          migration_airtable: airtable,
          customer_username: identity.username,
          customer_invite_expires_at: linkBundle.expires_at,
          invite_role: role,
          invite_lane: lane,
        };

        auditLinkBundle(env, invitePayload, linkBundle);

        return json(merged);
      } catch (error) {
        console.warn("immigrate-worker create-links upstream json parse failed", error);
      }
    }

    await writeCreateLinksMigrationRecords(env, invitePayload, baseSessionLinks, null);

    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": contentType,
      },
    });
  }

  const airtable = await writeCreateLinksMigrationRecords(env, invitePayload, baseSessionLinks, null);

  return json(
    {
      ok: true,
      url: `/jobs/mock/${String((payload as Record<string, unknown>).client || "client").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client"}-${String((payload as Record<string, unknown>).package || "session").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session"}`,
      message: "Mock job link created from immigrate-worker compatibility route.",
      onboarding_url: role === "model" ? linkBundle.model_url : linkBundle.customer_url,
      customer_onboarding_url: linkBundle.customer_url,
      model_onboarding_url: linkBundle.model_url,
      customer_payment_url: baseSessionLinks.customer_payment_url,
      customer_rules_url: linkBundle.customer_rules_url,
      model_rules_url: linkBundle.model_rules_url,
      customer_dashboard_url: baseSessionLinks.customer_dashboard_url,
      model_dashboard_url: linkBundle.model_dashboard_url,
      model_console_url: baseSessionLinks.model_console_url,
      next_booking_url: baseSessionLinks.next_booking_url,
      promptpay_id: baseSessionLinks.promptpay_id,
      link_context: linkBundle.context,
      migration_airtable: airtable,
      customer_username: identity.username,
      customer_invite_expires_at: linkBundle.expires_at,
      invite_role: role,
      invite_lane: lane,
      meta,
    },
  );
}
