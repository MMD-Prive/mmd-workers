import type { DashboardSummary, Deal, DealsListResponse } from "./types";

export const ADMIN_API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_BASE || "http://localhost:8787";

export const ADMIN_INTERNAL_TOKEN =
  process.env.ADMIN_INTERNAL_TOKEN ||
  process.env.NEXT_PUBLIC_ADMIN_INTERNAL_TOKEN ||
  "";

const CLOSED_STATUSES = new Set([
  "confirmed",
  "expired",
  "declined",
  "cancelled",
]);

function adminHeaders(): HeadersInit {
  return ADMIN_INTERNAL_TOKEN
    ? { authorization: `Bearer ${ADMIN_INTERNAL_TOKEN}` }
    : {};
}

export async function getDeals(): Promise<DealsListResponse> {
  const response = await fetch(`${ADMIN_API_BASE}/v1/admin/deals/list-lite`, {
    method: "GET",
    headers: adminHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to load deals: ${response.status} ${text}`);
  }

  return (await response.json()) as DealsListResponse;
}

export async function getDealById(dealId: string): Promise<Deal> {
  const { deals } = await getDeals();
  const deal = deals.find((item) => item.deal_id === dealId);

  if (!deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  return deal;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const { deals } = await getDeals();

  return {
    open_deals: deals.filter((deal) => !CLOSED_STATUSES.has(deal.deal_status)).length,
    needs_per: deals.filter(
      (deal) =>
        deal.deal_status === "needs_per_review" || deal.ai_requires_per_review,
    ).length,
    pending_payments: deals.filter((deal) =>
      ["awaiting_payment", "payment_received"].includes(deal.deal_status),
    ).length,
    active_models: new Set(
      deals
        .map((deal) => deal.ai_top_model)
        .filter((model): model is string => Boolean(model)),
    ).size,
  };
}
