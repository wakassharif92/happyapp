"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Issue, TabKey } from "@/lib/board/types";
import { TAB_LABELS, TAB_ORDER } from "@/lib/board/types";
import type { FeatureRequest } from "@/lib/types/database";

type SourceType = "issue" | "feature" | "suggestion" | "all";
type StatusFilter = TabKey | "all";

type PickerItem = {
  id: string;
  title: string;
  text: string;
  kind: "issue" | "feature" | "suggestion";
};

// "For Vibe Coding": check off one or more tracked items (issues at a
// given workflow stage, features, or suggestions — or everything via the
// "All" filters), then generate ONE PDF with every checked item's
// description (and, for issues, that issue's own callback command),
// ready to hand an external AI coding tool. Each issue's description is
// composed automatically (original report + any comments since — see
// buildIssueText) rather than hand-edited here, and there is no manual
// "send to AI Fix" — that only ever happens when the AI itself calls the
// callback command after finishing, keeping AI Fix meaning "an AI
// actually reported a fix attempt," not "a human queued something."
export function VibeCodingPanel({ projectId, issues }: { projectId: string; issues: Issue[] }) {
  const [sourceType, setSourceType] = useState<SourceType>("issue");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [featureItems, setFeatureItems] = useState<FeatureRequest[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [apiToken, setApiToken] = useState<string | null>(null);

  useEffect(() => {
    // Stale featureItems from a previous sourceType are harmless left as-is
    // here — the `items` memo below only ever reads them when sourceType
    // is 'all'/'feature'/'suggestion', never 'issue'.
    if (sourceType === "issue") return;
    let cancelled = false;
    const supabase = createClient();
    let query = supabase.from("feature_requests").select("*").eq("project_id", projectId);
    if (sourceType !== "all") query = query.eq("kind", sourceType);
    query.order("created_at", { ascending: false }).then(({ data }) => {
      if (!cancelled) setFeatureItems(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceType, projectId]);

  // Used only to build each issue's callback command below — this
  // component never calls the endpoint itself, it just shows the dev
  // what to hand their AI tool.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("projects")
      .select("api_token")
      .eq("id", projectId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setApiToken(data?.api_token ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const items = useMemo<PickerItem[]>(() => {
    const issueItems: PickerItem[] =
      sourceType === "issue" || sourceType === "all"
        ? issues
            .filter((i) => statusFilter === "all" || i.tab === statusFilter)
            .map((i) => ({ id: i.id, title: i.title, text: i.message, kind: "issue" as const }))
        : [];
    const requestItems: PickerItem[] =
      sourceType === "all" || sourceType === "feature" || sourceType === "suggestion"
        ? featureItems.map((f) => ({
            id: f.id,
            title: f.title,
            text: f.description ?? "",
            kind: f.kind,
          }))
        : [];
    return [...issueItems, ...requestItems];
  }, [sourceType, statusFilter, issues, featureItems]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildCurlCommand(issueId: string): string | null {
    if (!apiToken) return null;
    const origin =
      process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
    return `curl -X POST ${origin}/api/vibe-coding/issues/${issueId} \\
  -H "Authorization: Bearer ${apiToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"summary": "Describe what you changed here"}'`;
  }

  // Issues carry their verification history as normal comments
  // (IssueDetailPanel's existing Notes section) — folded in so the PDF
  // has the full "why it wasn't fixed" trail, not just the original
  // report. Features/suggestions have no comment thread.
  async function buildIssueText(item: PickerItem): Promise<string> {
    let text = item.text;
    const supabase = createClient();
    const { data: comments } = await supabase
      .from("board_issue_comments")
      .select("author, text, created_at")
      .eq("issue_id", item.id)
      .order("created_at", { ascending: true });
    if (comments && comments.length > 0) {
      const trail = comments
        .map((c) => `— ${c.author} (${new Date(c.created_at).toLocaleDateString()}): ${c.text}`)
        .join("\n");
      text = `${text}\n\n--- Notes ---\n${trail}`;
    }
    const curl = buildCurlCommand(item.id);
    if (curl) {
      text = `${text}\n\n--- When you're done, run this to report back ---\n${curl}`;
    }
    return text;
  }

  // Dynamic import — jsPDF only runs inside this click handler, never at
  // module load time, so there's no risk of it touching browser globals
  // during SSR just because this component happens to be mounted.
  async function handleGeneratePdf() {
    const selected = items.filter((i) => selectedIds.has(i.id));
    if (selected.length === 0) return;
    setGenerating(true);
    try {
      const sections = await Promise.all(
        selected.map(async (item) => {
          const text = item.kind === "issue" ? await buildIssueText(item) : item.text;
          return `${item.title}\n${"=".repeat(item.title.length)}\n${text}`;
        })
      );
      const fullText = sections.join("\n\n\n");

      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const margin = 15;
      const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
      const lines = doc.splitTextToSize(fullText, maxWidth);
      doc.setFontSize(11);
      doc.text(lines, margin, 20);
      doc.save(`dev-description-${Date.now()}.pdf`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <select
          value={sourceType}
          onChange={(e) => {
            setSourceType(e.target.value as SourceType);
            setSelectedIds(new Set());
          }}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
        >
          <option value="all">All</option>
          <option value="issue">Issues</option>
          <option value="feature">Features</option>
          <option value="suggestion">Suggestions</option>
        </select>

        {(sourceType === "issue" || sourceType === "all") && (
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setSelectedIds(new Set());
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            <option value="all">All statuses</option>
            {TAB_ORDER.map((tab) => (
              <option key={tab} value={tab}>
                {TAB_LABELS[tab]}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={handleGeneratePdf}
          disabled={generating || selectedIds.size === 0}
          className="btn-primary ml-auto"
        >
          {generating ? "Generating…" : `Generate PDF${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing here yet.</p>
        ) : (
          items.map((item) => (
            <label
              key={item.id}
              className="card flex cursor-pointer items-center gap-3 p-3.5 transition-colors hover:border-slate-300"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggleSelected(item.id)}
                className="h-4 w-4 shrink-0 rounded border-slate-300"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                {item.title}
              </span>
              {item.kind !== "issue" && (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-500">
                  {item.kind}
                </span>
              )}
            </label>
          ))
        )}
      </div>
    </div>
  );
}
