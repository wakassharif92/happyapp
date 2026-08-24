"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ProgressBar } from "@/components/ProgressBar";
import type { AgentEvent, TestRun } from "@/lib/types/database";

// REQ-013/REQ-014/REQ-070/REQ-073: run controls + live progress for a module.
export function TestRunPanel({
  moduleId,
  testCaseCount,
  initialRun,
  initialEvents,
}: {
  moduleId: string;
  testCaseCount: number;
  initialRun: TestRun | null;
  initialEvents: AgentEvent[];
}) {
  const router = useRouter();
  const [run, setRun] = useState<TestRun | null>(initialRun);
  const [busy, setBusy] = useState<"generate" | "run" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevStatus = useRef<string | undefined>(initialRun?.status);

  useEffect(() => {
    if (!run) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`test_run-${run.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "test_runs",
          filter: `id=eq.${run.id}`,
        },
        (payload) => {
          const updated = payload.new as TestRun;
          setRun(updated);
          if (prevStatus.current === "running" && updated.status !== "running") {
            router.refresh(); // pick up final per-test-case statuses below
          }
          prevStatus.current = updated.status;
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id]);

  async function handleGenerate() {
    setBusy("generate");
    setError(null);
    try {
      const res = await fetch(`/api/modules/${moduleId}/test-cases/generate`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to generate test cases");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRun() {
    setBusy("run");
    setError(null);
    try {
      const res = await fetch(`/api/modules/${moduleId}/run`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start run");
      prevStatus.current = "running";
      setRun({
        id: body.test_run_id,
        module_id: moduleId,
        started_at: new Date().toISOString(),
        completed_at: null,
        status: "running",
        total_cases: 0,
        passed_count: 0,
        failed_count: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleStop() {
    if (!run) return;
    setBusy("stop");
    try {
      await fetch(`/api/test-runs/${run.id}/stop`, { method: "POST" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 card p-4">
      <div className="flex items-center gap-2">
        <button
          onClick={handleGenerate}
          disabled={busy !== null}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "generate" ? "Generating…" : "Generate Test Cases"}
        </button>
        <button
          onClick={handleRun}
          disabled={busy !== null || testCaseCount === 0 || run?.status === "running"}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy === "run" ? "Starting…" : "QA It"}
        </button>
        {run?.status === "running" && (
          <button
            onClick={handleStop}
            disabled={busy !== null}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
          >
            {busy === "stop" ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {run && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="capitalize">{run.status}</span>
            <span className="text-slate-500">
              {run.passed_count}/{run.total_cases} passed, {run.failed_count} failed
            </span>
          </div>
          <ProgressBar passed={run.passed_count} failed={run.failed_count} total={run.total_cases} />
          <ActivityFeed runId={run.id} initialEvents={initialEvents} />
        </div>
      )}
    </div>
  );
}
