"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function navItems(projectId: string) {
  const base = `/projects/${projectId}`;
  return [
    { href: base, label: "Dashboard", exact: true },
    { href: `${base}/testing`, label: "Automated Testing" },
    { href: `${base}/report`, label: "Report Issue" },
    { href: `${base}/issues`, label: "All Issues" },
    { href: `${base}/approval`, label: "Approval Queue" },
    { href: `${base}/modules`, label: "Modules" },
    { href: `${base}/settings`, label: "Project Settings" },
  ];
}

export function NavLinks({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const items = navItems(projectId);

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-indigo-600 font-medium text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
