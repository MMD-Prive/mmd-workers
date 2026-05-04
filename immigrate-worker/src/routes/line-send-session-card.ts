import { buildLineSessionFlexMessage, type LineSessionCardInput } from "../lib/line-flex-session-card";
import { json, makeMeta } from "../lib/response";
import type { Env, Meta } from "../types";

type SessionCardPayload = {
  line_user_id?: unknown;
  session_id?: unknown;
  client_name?: unknown;
  amount_thb?: unknown;
  deposit_amount_thb?: unknown;
  expire_at?: unknown;
  points_balance?: unknown;
  dashboard_url?: unknown;
  payment_url?: unknown;
};

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(num) ? num : null;
}

function bearerToken(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function errorResponse(
  meta: Meta,
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      meta,
    },
    { status },
  );
}

function requireBearerAuth(request: Request, env: Env, meta: Meta): Response | null {
  const expected = toStr(env.INTERNAL_TOKEN);
  if (!expected) return null;

  if (bearerToken(request) !== expected) {
    return errorResponse(meta, "UNAUTHORIZED", "Bearer authorization is required", 401);
  }

  return null;
}

function requireString(payload: SessionCardPayload, field: keyof SessionCardPayload): string {
  const value = toStr(payload[field]);
  if (!value) throw new Error(`missing_${String(field)}`);
  return value;
}

function requireNumber(payload: SessionCardPayload, field: keyof SessionCardPayload): number {
  const value = toNum(payload[field]);
  if (value == null) throw new Error(`invalid_${String(field)}`);
  return value;
}

function requireHttpUrl(payload: SessionCardPayload, field: keyof SessionCardPayload): string {
  const value = requireString(payload, field);
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`invalid_${String(field)}`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`invalid_${String(field)}`);
  }

  return value;
}

function normalizePayload(payload: SessionCardPayload): LineSessionCardInput {
  return {
    line_user_id: requireString(payload, "line_user_id"),
    session_id: requireString(payload, "session_id"),
    client_name: requireString(payload, "client_name"),
    amount_thb: requireNumber(payload, "amount_thb"),
    deposit_amount_thb: requireNumber(payload, "deposit_amount_thb"),
    expire_at: requireString(payload, "expire_at"),
    points_balance: requireNumber(payload, "points_balance"),
    dashboard_url: requireHttpUrl(payload, "dashboard_url"),
    payment_url: requireHttpUrl(payload, "payment_url"),
  };
}

function webBaseUrl(env: Env): string {
  return (toStr(env.WEB_BASE_URL) || "https://mmdbkk.com").replace(/\/+$/, "");
}

function memberDashboardUrl(env: Env, token: string): string {
  return `${webBaseUrl(env)}/member/first-db?t=${encodeURIComponent(token)}`;
}

function normalizeMemberDashboardUrl(env: Env, value: string): string {
  const url = new URL(value);
  const token = url.searchParams.get("t");
  return token ? memberDashboardUrl(env, token) : value;
}

function sanitizeLineError(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .slice(0, 1000);
}

export async function handleSendLineSessionCard(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        allow: "POST, OPTIONS",
      },
    });
  }

  const authError = requireBearerAuth(request, env, meta);
  if (authError) return authError;

  if (request.method !== "POST") {
    return errorResponse(meta, "METHOD_NOT_ALLOWED", "Method not allowed", 405, {
      allow: "POST, OPTIONS",
    });
  }

  const lineToken = toStr(env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!lineToken) {
    return errorResponse(meta, "LINE_TOKEN_NOT_CONFIGURED", "LINE_CHANNEL_ACCESS_TOKEN is not configured", 500);
  }

  const payload = (await request.json().catch(() => null)) as SessionCardPayload | null;
  if (!payload || typeof payload !== "object") {
    return errorResponse(meta, "INVALID_INPUT", "Valid JSON body is required", 400);
  }

  let input: LineSessionCardInput;
  try {
    input = normalizePayload(payload);
    input = {
      ...input,
      dashboard_url: normalizeMemberDashboardUrl(env, input.dashboard_url),
    };
  } catch (error) {
    return errorResponse(
      meta,
      "INVALID_INPUT",
      error instanceof Error ? error.message : "Invalid session card payload",
      400,
    );
  }

  const response = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${lineToken}`,
    },
    body: JSON.stringify({
      to: input.line_user_id,
      messages: [buildLineSessionFlexMessage({ ...input, next_booking_url: webBaseUrl(env) })],
    }),
  });

  if (!response.ok) {
    const body = sanitizeLineError(await response.text().catch(() => ""));
    return errorResponse(meta, "LINE_PUSH_FAILED", "LINE push message failed", 502, {
      status: response.status,
      body,
    });
  }

  return json({ ok: true });
}
