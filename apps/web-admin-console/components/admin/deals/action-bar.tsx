"use client";

import type { Deal } from "@/lib/types";

export function ActionBar({ deal }: { deal: Deal }) {
  return (
    <aside className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <h3 className="font-semibold text-white">Actions</h3>
      <div className="mt-4 grid gap-3">
        <button className="rounded-md bg-amber-300 px-4 py-3 text-sm font-semibold text-black transition hover:bg-amber-200">
          Approve AI
        </button>
        <button className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
          Ask More
        </button>
        <button className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
          Send Payment
        </button>
        <button className="rounded-md border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 transition hover:bg-rose-500/15">
          Close Deal
        </button>
      </div>
      <div className="mt-4 text-xs text-white/35">Deal: {deal.deal_id}</div>
    </aside>
  );
}
