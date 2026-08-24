"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";

export function IssueRow({
  projectId,
  issue,
  moduleName,
}: {
  projectId: string;
  issue: {
    id: string;
    title: string;
    module_id: string;
    tag: string | null;
    status: string;
    source: string;
  };
  moduleName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function investigate(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      await fetch(`/api/issues/${issue.id}/triage`, { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Link
      href={`/projects/${projectId}/issues/${issue.id}`}
      className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900"
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{issue.title}</span>
        <span className="text-xs text-slate-500">
          {moduleName} · {issue.source}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {issue.tag === null && (
          <button
            onClick={investigate}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Starting…" : "Investigate"}
          </button>
        )}
        <Badge value={issue.tag} />
        <Badge value={issue.status} />
      </div>
    </Link>
  );
}
