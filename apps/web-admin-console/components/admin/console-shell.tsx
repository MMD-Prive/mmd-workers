import { Sidebar } from "./sidebar";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f7f3ea]">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[260px_1fr]">
        <Sidebar />
        <main className="min-w-0 p-5 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
