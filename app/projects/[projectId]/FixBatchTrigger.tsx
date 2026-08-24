"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// REQ-060: "Fix N issues now."
export function FixBatchTrigger({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start fix batch");
      setMessage(
        `Started fixing ${body.count} issue${body.count === 1 ? "" : "s"} — check each issue's detail page for progress.`
      );
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 card p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Fix</span>
        <input
          type="number"
          min={1}
          max={20}
          value={count}
          onChange={(e) => setCount(Number(e.target.value) || 1)}
          className="input w-16"
        />
        <span className="text-sm font-medium">issues now</span>
        <button
          onClick={handleClick}
          disabled={busy}
          className="ml-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Fix now"}
        </button>
      </div>
      {message && <p className="text-sm text-slate-500">{message}</p>}
    </div>
  );
}
