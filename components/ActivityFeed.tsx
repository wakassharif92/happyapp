"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentEvent } from "@/lib/types/database";

const ICONS: Record<string, string> = {
  info: "•",
  pass: "✓",
  fail: "✗",
  bug_found: "🐛",
  fix_applied: "🔧",
  error: "⚠",
};

// REQ-070: subscribes to agent_events via Supabase Realtime and renders new
// events as they arrive, no page refresh.
export function ActivityFeed({
  runId,
  initialEvents,
}: {
  runId: string;
  initialEvents: AgentEvent[];
}) {
  const [events, setEvents] = useState(initialEvents);
  // Reset the feed when we're handed a different run — computed during
  // render (React's documented pattern for "adjusting state on prop
  // change") rather than in an effect, to avoid the extra render pass.
  const [trackedRunId, setTrackedRunId] = useState(runId);
  if (runId !== trackedRunId) {
    setTrackedRunId(runId);
    setEvents([]);
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`agent_events-${runId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_events",
          filter: `run_id=eq.${runId}`,
        },
        (payload) => {
          setEvents((prev) => [...prev, payload.new as AgentEvent]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId]);

  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No activity yet.</p>;
  }

  return (
    <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto card p-3 font-mono text-xs">
      {events.map((e) => (
        <li key={e.id} className="flex gap-2">
          <span className="shrink-0 text-slate-400">
            {new Date(e.created_at).toLocaleTimeString()}
          </span>
          <span>{ICONS[e.event_type] ?? "•"}</span>
          <span>{e.event_text}</span>
        </li>
      ))}
    </ul>
  );
}
