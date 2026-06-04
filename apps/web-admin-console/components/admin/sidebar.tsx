import Link from "next/link";

const items = [
  { href: "/admin/console/dashboard", label: "Dashboard" },
  { href: "/admin/console/deals", label: "Deals" },
];

export function Sidebar() {
  return (
    <aside className="border-b border-white/10 bg-black/50 p-5 xl:border-b-0 xl:border-r">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-[0.26em] text-amber-200/70">
          MMD Privé
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">Admin Console</div>
      </div>

      <nav className="flex gap-2 xl:block xl:space-y-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md border border-transparent px-3 py-2 text-sm text-white/70 transition hover:border-white/10 hover:bg-white/5 hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
