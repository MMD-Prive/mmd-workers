import type { Deal } from "@/lib/types";
import { DealCard } from "./deal-card";

export function DealList({ deals }: { deals: Deal[] }) {
  return (
    <section className="min-w-0 space-y-4">
      <div className="border-b border-white/10 pb-4">
        <p className="text-xs uppercase tracking-[0.24em] text-amber-200/70">
          Deals
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Control Panel</h1>
      </div>

      <div className="space-y-3">
        {deals.map((deal) => (
          <DealCard key={deal.deal_id} deal={deal} />
        ))}
      </div>
    </section>
  );
}
