import type { Env } from "./types";
import { json, makeMeta } from "./lib/response";

const VIP_POINTS_REQUIRED = 1200;
const POINT_THB_RATE = 100;
const RENEWAL_PACKAGE_LABELS = {
  premium: "Premium Package",
  standard: "Standard Package",
  vip: "VIP",
  black_card: "Black Card",
} as const;
const RENEWAL_PAYMENT_LABELS = {
  bank_transfer: "Bank Transfer",
  promptpay_qr: "QR PromptPay",
  credit_card: "Credit Card",
} as const;

type UpstreamResponseJson = {
  ok?: boolean;
  payment_url?: string;
  url?: string;
  data?: {
    payment_url?: string;
    url?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown): number | null {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function toBool(value: unknown): boolean {
  if (value === true) return true;
  const raw = toStr(value).toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || toStr(value) === "") return null;
  return toNum(value);
}

function normalizeRenewalPackage(value: unknown): keyof typeof RENEWAL_PACKAGE_LABELS {
  const raw = toStr(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (raw.includes("black") || raw.includes("svip")) return "black_card";
  if (raw.includes("vip")) return "vip";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  return "premium";
}

function normalizeRenewalPaymentMethod(value: unknown): keyof typeof RENEWAL_PAYMENT_LABELS {
  const raw = toStr(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (raw.includes("credit") || raw.includes("card") || raw.includes("paypal")) return "credit_card";
  if (raw.includes("promptpay") || raw.includes("qr")) return "promptpay_qr";
  return "bank_transfer";
}

function renewalPaymentReferenceUrl(method: keyof typeof RENEWAL_PAYMENT_LABELS, amount: number | null): string {
  if (method === "credit_card") return "https://www.paypal.com/ncp/payment/M697T7AW2QZZJ";
  if (method === "promptpay_qr") {
    const amountPart = amount && Number.isFinite(amount) && amount > 0 ? `/${amount}` : "";
    return `https://promptpay.io/0829528889${amountPart}`;
  }
  return "bank_transfer:ktb:1420335898";
}

function withDynamicRenewalFields(payload: Record<string, unknown>): Record<string, unknown> {
  const amount = toNum(payload.amount_thb ?? payload.total);
  const targetPackage = normalizeRenewalPackage(
    payload.target_package || payload.target_tier || payload.package_code || payload.package_label || payload.package,
  );
  const membershipExpiryRule =
    targetPackage === "black_card" ? "long_term_dynamic_points_extension" : "dynamic_points_extension";
  const paymentMethod = normalizeRenewalPaymentMethod(payload.payment_method);
  const pointsBalance = nullableNumber(payload.points_balance);
  const pointsRequired = nullableNumber(payload.points_required);
  const pointsShortfall = nullableNumber(payload.points_shortfall);
  const thresholdReached = pointsBalance !== null && pointsRequired !== null && pointsRequired > 0 && pointsBalance >= pointsRequired;
  const reason = toStr(payload.expiry_extension_reason) ||
    (thresholdReached ? "points_threshold_reached" : targetPackage === "vip" || targetPackage === "black_card" ? "upgrade_review" : "manual_review");

  return {
    ...payload,
    target_package: targetPackage,
    target_package_label: RENEWAL_PACKAGE_LABELS[targetPackage],
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
    expiry_extension_reason: reason,
    payment_method: paymentMethod,
    payment_method_label: RENEWAL_PAYMENT_LABELS[paymentMethod],
    payment_reference_url: toStr(payload.payment_reference_url) || renewalPaymentReferenceUrl(paymentMethod, amount),
  };
}

function withProofReviewFields(payload: Record<string, unknown>): Record<string, unknown> {
  const proofImageBase64 = toStr(payload.proof_image_base64);
  const proofFilename = toStr(payload.proof_filename);
  const proofAttached = toBool(payload.proof_attached) || Boolean(proofFilename || proofImageBase64);
  const proofMimeType = toStr(payload.proof_mime_type);
  const proofSize = toNum(payload.proof_size) || 0;
  const proofSource = toStr(payload.proof_source) || "oldProof";
  const existingNote = toStr(payload.service_history_note || payload.manual_note || payload.note);
  const proofNote = [
    `proof:${proofAttached ? "attached" : "none"}`,
    `proof_attached:${proofAttached}`,
    proofFilename ? `proof_filename:${proofFilename}` : "",
    proofMimeType ? `proof_mime_type:${proofMimeType}` : "",
    proofSize ? `proof_size:${proofSize}` : "",
    proofImageBase64 ? "proof_image_base64:present" : "",
    `proof_source:${proofSource}`,
  ]
    .filter(Boolean)
    .join("; ");

  return {
    ...withDynamicRenewalFields(payload),
    proof_attached: proofAttached,
    proof_filename: proofFilename,
    proof_mime_type: proofMimeType,
    proof_size: proofSize,
    proof_image_base64: proofImageBase64,
    proof_source: proofSource,
    service_history_note: existingNote.includes("proof_attached:")
      ? existingNote
      : [existingNote, proofNote].filter(Boolean).join("; "),
  };
}

function publicCors(request: Request, env: Env): Headers {
  const headers = new Headers();
  const allowed = String(
    env.PUBLIC_ALLOWED_ORIGINS ||
      "https://mmdbkk.com,https://www.mmdbkk.com,https://sigil.mmdbkk.com,https://mmdprive.com,https://www.mmdprive.com,https://mmdprive.webflow.io",
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin") || "";
  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "origin");
  }
  headers.set("access-control-allow-methods", "POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization, x-internal-token");
  headers.set("access-control-max-age", "86400");
  return headers;
}

function withCors(request: Request, env: Env, response: Response): Response {
  const headers = new Headers(response.headers);
  publicCors(request, env).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

function publicJson(request: Request, env: Env, data: unknown, init?: ResponseInit): Response {
  return withCors(request, env, json(data, init));
}

function readBearer(env: Env): string {
  return toStr(env.CONFIRM_KEY || env.INTERNAL_TOKEN);
}

async function forwardJson(url: string, env: Env, payload: Record<string, unknown>): Promise<Response | null> {
  if (!url) return null;
  const bearer = readBearer(env);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}`, "x-internal-token": bearer } : {}),
    },
    body: JSON.stringify(payload),
  });
  return response;
}

async function readResponseJson(response: Response): Promise<UpstreamResponseJson | null> {
  return (await response.json().catch(() => null)) as UpstreamResponseJson | null;
}

async function intakeFallback(request: Request, env: Env, payload: Record<string, unknown>, reason: string): Promise<Record<string, unknown>> {
  const url = new URL(request.url);
  const fallbackUrl = `${url.origin}/member/api/renewal/intake`;
  const fallbackPayload = withProofReviewFields({
    ...payload,
    flow: "review",
    points_action: payload.points_action || reason,
    fallback_reason: reason,
    source_page: payload.source_page || "sigil_inme_renewal",
    notify_telegram: true,
  });

  try {
    const response = await fetch(fallbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fallbackPayload),
    });
    const data = await readResponseJson(response);
    return {
      attempted: true,
      ok: response.ok && data?.ok !== false,
      data,
      payload: fallbackPayload,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : "fallback_failed",
      payload: fallbackPayload,
    };
  }
}

export async function handlePublicPointsTopup(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  if (request.method === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
  if (request.method !== "POST") {
    return publicJson(request, env, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required" }, meta }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return publicJson(request, env, { ok: false, error: { code: "INVALID_INPUT", message: "valid JSON payload required" }, meta }, { status: 400 });
  }

  const pointsShortfall = toNum(body.points_shortfall ?? body.points_to_add) || 0;
  const amountThb = toNum(body.amount_thb ?? body.topup_amount_thb) || pointsShortfall * POINT_THB_RATE;

  if (!pointsShortfall || pointsShortfall <= 0 || !amountThb || amountThb <= 0) {
    return publicJson(request, env, { ok: false, error: { code: "INVALID_TOPUP", message: "points_shortfall and amount_thb are required" }, meta }, { status: 400 });
  }

  const payload = withProofReviewFields({
    ...body,
    flow: "points_topup",
    payment_type: "points_topup",
    points_to_add: pointsShortfall,
    amount_thb: amountThb,
    points_required: toNum(body.points_required) || VIP_POINTS_REQUIRED,
    points_action: "points_topup_required",
  });

  const paymentsBase = toStr((env as unknown as { PAYMENTS_WORKER_BASE_URL?: string }).PAYMENTS_WORKER_BASE_URL || env.CREATE_LINKS_URL).replace(/\/$/, "");
  const candidateUrls = [
    paymentsBase && `${paymentsBase}/member/api/points/topup`,
    paymentsBase && `${paymentsBase}/v1/points/topup`,
    env.CREATE_LINKS_URL,
  ].filter(Boolean) as string[];

  for (const url of candidateUrls) {
    try {
      const upstream = await forwardJson(url, env, payload);
      if (!upstream) continue;
      const data = await readResponseJson(upstream);
      if (upstream.ok && data?.ok !== false) {
        return publicJson(request, env, {
          ok: true,
          data: {
            mode: "forwarded_to_payments_worker",
            upstream_url: url,
            points_to_add: pointsShortfall,
            amount_thb: amountThb,
            payment_url: data?.data?.payment_url || data?.payment_url || data?.data?.url || data?.url || "",
            upstream: data,
          },
          meta,
        });
      }
    } catch (_) {
      // Try the next candidate, then fallback to Per review.
    }
  }

  const fallback = await intakeFallback(request, env, payload, "points_topup_bridge_unavailable");
  if (!fallback.ok) {
    return publicJson(request, env, {
      ok: false,
      error: {
        code: "PER_REVIEW_FALLBACK_FAILED",
        message: "points topup fallback to renewal intake failed",
      },
      data: {
        mode: "per_review_fallback_failed",
        points_to_add: pointsShortfall,
        amount_thb: amountThb,
        fallback,
      },
      meta,
    }, { status: 502 });
  }

  return publicJson(request, env, {
    ok: true,
    data: {
      mode: "per_review_fallback",
      points_to_add: pointsShortfall,
      amount_thb: amountThb,
      fallback,
    },
    meta,
  });
}

export async function handlePublicActivateVip(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  if (request.method === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
  if (request.method !== "POST") {
    return publicJson(request, env, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required" }, meta }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return publicJson(request, env, { ok: false, error: { code: "INVALID_INPUT", message: "valid JSON payload required" }, meta }, { status: 400 });
  }

  const pointsBalance = toNum(body.points_balance);
  const pointsToDeduct = toNum(body.points_to_deduct ?? body.points_required) || VIP_POINTS_REQUIRED;

  if (pointsBalance !== null && pointsBalance < pointsToDeduct) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "INSUFFICIENT_POINTS", message: "not enough points to activate VIP" },
      meta,
    }, { status: 409 });
  }

  const payload = withProofReviewFields({
    ...body,
    flow: "vip_auto_activate",
    target_tier: "vip",
    points_to_deduct: pointsToDeduct,
    points_action: "vip_auto",
    activation_type: "vip_renewal",
  });

  const adminBase = toStr(env.ADMIN_WORKER_BASE_URL).replace(/\/$/, "");
  const paymentsBase = toStr((env as unknown as { PAYMENTS_WORKER_BASE_URL?: string }).PAYMENTS_WORKER_BASE_URL).replace(/\/$/, "");
  const candidateUrls = [
    adminBase && `${adminBase}/member/api/renewal/activate-vip`,
    adminBase && `${adminBase}/v1/member/activate-vip`,
    paymentsBase && `${paymentsBase}/member/api/renewal/activate-vip`,
    paymentsBase && `${paymentsBase}/v1/points/redeem-vip`,
  ].filter(Boolean) as string[];

  for (const url of candidateUrls) {
    try {
      const upstream = await forwardJson(url, env, payload);
      if (!upstream) continue;
      const data = await readResponseJson(upstream);
      if (upstream.ok && data?.ok !== false) {
        return publicJson(request, env, {
          ok: true,
          data: {
            mode: "forwarded_to_canonical_worker",
            upstream_url: url,
            target_tier: "vip",
            points_deducted: pointsToDeduct,
            upstream: data,
          },
          meta,
        });
      }
    } catch (_) {
      // Try the next candidate, then fallback to Per review.
    }
  }

  const fallback = await intakeFallback(request, env, payload, "vip_activation_bridge_unavailable");
  if (!fallback.ok) {
    return publicJson(request, env, {
      ok: false,
      error: {
        code: "PER_REVIEW_FALLBACK_FAILED",
        message: "VIP activation fallback to renewal intake failed",
      },
      data: {
        mode: "per_review_fallback_failed",
        target_tier: "vip",
        points_to_deduct: pointsToDeduct,
        fallback,
      },
      meta,
    }, { status: 502 });
  }

  return publicJson(request, env, {
    ok: true,
    data: {
      mode: "per_review_fallback",
      target_tier: "vip",
      points_to_deduct: pointsToDeduct,
      fallback,
    },
    meta,
  });
}
