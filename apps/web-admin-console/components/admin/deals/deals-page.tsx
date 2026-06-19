import type { Deal } from "@/lib/types";
import { DealDetailPanel } from "./deal-detail-panel";
import { DealList } from "./deal-list";

export function DealsPage({ deals }: { deals: Deal[] }) {
  const selected = deals[0];

  return (
    <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
      <DealList deals={deals} />
      {selected ? (
        <DealDetailPanel deal={selected} />
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-8 text-white/55">
          No deals returned from admin-worker.
        </div>
      )}
    </div>
  );
}
