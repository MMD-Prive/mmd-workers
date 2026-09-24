import type { Deal } from "@/lib/types";
import { ActionBar } from "./action-bar";

function formatThb(value?: number) {
  return value == null ? "-" : `${value.toLocaleString()} THB`;
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className="mt-2 text-sm text-white/85">{value || "-"}</div>
    </div>
  );
}

export function DealDetailPanel({ deal }: { deal: Deal }) {
  return (
    <section className="min-w-0 space-y-5">
      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">
              Deal Detail
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-white">{deal.deal_id}</h2>
            <p className="mt-2 text-white/65">{deal.client_name}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-amber-300/10 px-2 py-1 text-amber-100">
              {deal.client_tier}
            </span>
            <span className="rounded bg-white/10 px-2 py-1 text-white/75">
              {deal.deal_status}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Occasion" value={deal.occasion} />
            <Field label="Timing" value={deal.timing_label} />
            <Field label="Venue" value={deal.venue_name} />
            <Field label="Budget" value={formatThb(deal.budget_amount_thb)} />
            <Field label="Budget Signal" value={deal.budget_signal} />
            <Field label="History Signal" value={deal.history_signal} />
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <h3 className="font-semibold text-white">AI Recommendation</h3>
            <div className="mt-4 rounded-lg bg-black/25 p-4 text-sm leading-6 text-white/75">
              <div className="font-medium text-white">
                Top model: {deal.ai_top_model || "-"}
              </div>
              <p className="mt-2">{deal.ai_reply_draft || "No draft returned yet."}</p>
            </div>
          </div>
        </div>

        <ActionBar deal={deal} />
      </div>
    </section>
  );
}
