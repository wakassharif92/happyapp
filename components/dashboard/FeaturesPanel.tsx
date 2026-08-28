"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FeatureRequest, FeatureRequestKind, FeatureRequestStatus } from "@/lib/types/database";
import { createFeatureRequest, updateFeatureRequestStatus } from "@/app/dashboard/featuresActions";

const STATUS_LABELS: Record<FeatureRequestStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
};

const STATUS_ORDER: FeatureRequestStatus[] = ["pending", "in_progress", "done"];

// Shared by both the Features and Suggestions tabs (DashboardClient.tsx
// passes `kind`) — self-contained (fetch + Realtime + add form), matching
// the pattern SupportNavLink.tsx established for self-contained
// company/project-scoped widgets.
export function FeaturesPanel({ projectId, kind }: { projectId: string; kind: FeatureRequestKind }) {
  const [items, setItems] = useState<FeatureRequest[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("feature_requests")
      .select("*")
      .eq("project_id", projectId)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setItems(data ?? []);
      });

    // No server-side `filter:` — same reasoning as every other
    // postgres_changes subscription in this app.
    const channel = supabase
      .channel(`feature_requests-${projectId}-${kind}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feature_requests" },
        (payload) => {
          const row = payload.new as FeatureRequest;
          if (row.project_id !== projectId || row.kind !== kind) return;
          setItems((prev) => (prev.some((i) => i.id === row.id) ? prev : [row, ...prev]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "feature_requests" },
        (payload) => {
          const row = payload.new as FeatureRequest;
          if (row.project_id !== projectId || row.kind !== kind) return;
          setItems((prev) => prev.map((i) => (i.id === row.id ? row : i)));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [projectId, kind]);

  async function handleAdd() {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const created = await createFeatureRequest({
        projectId,
        kind,
        title: title.trim(),
        description: description.trim(),
      });
      setItems((prev) => (prev.some((i) => i.id === created.id) ? prev : [created, ...prev]));
      setTitle("");
      setDescription("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, status: FeatureRequestStatus) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    await updateFeatureRequestStatus(id, status);
  }

  const noun = kind === "feature" ? "feature idea" : "suggestion";

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-2 p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`Title of the ${noun}`}
          className="input"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Details (optional)"
          className="input"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={submitting || !title.trim()}
          className="btn-primary self-start"
        >
          {submitting ? "Adding…" : `Add ${noun}`}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">No {noun}s yet.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="card flex flex-col gap-2 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  {item.description && (
                    <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>
                  )}
                  {item.source_issue_id && (
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Converted from an issue
                    </span>
                  )}
                </div>
                <select
                  value={item.status}
                  onChange={(e) =>
                    handleStatusChange(item.id, e.target.value as FeatureRequestStatus)
                  }
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-400">
                {item.created_by} · {new Date(item.created_at).toLocaleDateString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
