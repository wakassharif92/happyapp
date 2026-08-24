"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// REQ-011: "Generate Test Cases" or "QA It" depending on state.
export function ModuleCardButton({
  projectId,
  moduleId,
  hasTestCases,
}: {
  projectId: string;
  moduleId: string;
  hasTestCases: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      if (!hasTestCases) {
        const res = await fetch(`/api/modules/${moduleId}/test-cases/generate`, {
          method: "POST",
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to generate test cases");
        router.push(`/projects/${projectId}/testing/${moduleId}`);
      } else {
        const res = await fetch(`/api/modules/${moduleId}/run`, { method: "POST" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to start run");
        router.push(`/projects/${projectId}/testing/${moduleId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={busy}
        className="mt-2 self-start rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? "Working…" : hasTestCases ? "QA It" : "Generate Test Cases"}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
