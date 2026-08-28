import Link from "next/link";

// REQ-112: not scoped to a specific project, so no ProjectSwitcher/project
// sidebar here — just enough chrome to get back to a project.
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-slate-200 bg-white px-8 py-4">
        <Link href="/projects" className="text-sm font-medium text-slate-500 hover:text-slate-700">
          ← All projects
        </Link>
      </div>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
