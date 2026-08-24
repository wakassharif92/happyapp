"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// REQ-021: bulk "Investigate" trigger for the untriaged filter view.
export function BulkInvestigateBar({ issueIds }: { issueIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await fetch("/api/issues/triage/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
    >
      {busy ? "Starting…" : `Investigate all ${issueIds.length} shown`}
    </button>
  );
}
