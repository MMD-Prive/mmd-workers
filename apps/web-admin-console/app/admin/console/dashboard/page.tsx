import { getDashboardSummary } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const summary = await getDashboardSummary();

  const metrics = [
    { label: "Open Deals", value: summary.open_deals },
    { label: "Needs Per", value: summary.needs_per },
    { label: "Pending Payments", value: summary.pending_payments },
    { label: "Active Models", value: summary.active_models },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-white/10 pb-6">
        <p className="text-xs uppercase tracking-[0.26em] text-amber-200/70">
          Deal Operations
        </p>
        <h1 className="text-3xl font-semibold text-white">Admin Dashboard</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-white/10 bg-white/[0.04] p-5"
          >
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
              {metric.label}
            </div>
            <div className="mt-3 text-3xl font-semibold text-amber-100">
              {metric.value}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
