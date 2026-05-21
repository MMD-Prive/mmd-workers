import Link from "next/link";
import type { Deal } from "@/lib/types";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded px-2 py-1 text-xs font-medium text-amber-100 ring-1 ring-amber-300/20">
      {children}
    </span>
  );
}

export function DealCard({ deal }: { deal: Deal }) {
  return (
    <Link
      href={`/admin/console/deals/${deal.deal_id}`}
      className="block rounded-lg border border-white/10 bg-white/[0.04] p-4 transition hover:border-amber-300/25 hover:bg-white/[0.07]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{deal.client_name}</div>
          <div className="mt-1 truncate text-xs text-white/45">
            {deal.deal_id} · {deal.channel}
          </div>
        </div>
        <Badge>{deal.client_tier}</Badge>
      </div>

      <div className="mt-3 text-sm text-white/75">
        {[deal.occasion, deal.timing_label, deal.venue_name]
          .filter(Boolean)
          .join(" · ") || "No request context"}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
        <span>{deal.deal_status}</span>
        {deal.urgency_level ? <span>{deal.urgency_level}</span> : null}
        {deal.budget_amount_thb ? (
          <span>{deal.budget_amount_thb.toLocaleString()} THB</span>
        ) : null}
      </div>
    </Link>
  );
}
