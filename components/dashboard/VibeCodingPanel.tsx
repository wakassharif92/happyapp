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
// description (and, for issues, that issue's own callback command).
//
// Checking the box and opening a card are deliberately separate actions
// (the checkbox stops its own click from bubbling) — tapping the card
// itself expands it to show an editable "Dev Description" textarea,
// pre-filled from the original report plus any comments since, so a dev
// can refine the wording before it goes in the PDF without that also
// toggling the item in/out of the batch. There is no manual "send to AI
// Fix" — that only ever happens when the AI itself calls the callback
// command after finishing, keeping AI Fix meaning "an AI actually
// reported a fix attempt," not "a human queued something."
export function VibeCodingPanel({ projectId, issues }: { projectId: string; issues: Issue[] }) {
  const [sourceType, setSourceType] = useState<SourceType>("issue");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [featureItems, setFeatureItems] = useState<FeatureRequest[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Per-item Dev Description text, keyed by item id — seeded lazily the
  // first time a card is expanded, then holds whatever the dev has typed
  // since. Falls back to a fresh composition at PDF-generation time for
  // any checked item that was never expanded/edited.
  const [descriptionEdits, setDescriptionEdits] = useState<Map<string, string>>(new Map());
  const [generating, setGenerating] = useState(false);
  const [apiToken, setApiToken] = useState<string | null>(null);

  // Fetches every kind unconditionally (not re-fetched per sourceType) —
  // both so switching the type filter is instant, and so a selection made
  // under one filter still resolves correctly if the dev changes the
  // filter afterward (see allItems below — a selection must never depend
  // on which filter happened to be active when it was checked).
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("feature_requests")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setFeatureItems(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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

  // Every issue/feature/suggestion the component knows about, regardless
  // of the current filter — the source of truth for resolving a checked
  // item's title/text/kind at PDF-generation time, so a selection made
  // under one filter still resolves correctly after switching filters
  // (see the bug this fixes: the type/status dropdowns used to reset
  // selectedIds on change, silently dropping earlier picks).
  const allItems = useMemo<PickerItem[]>(() => {
    const issueItems: PickerItem[] = issues.map((i) => ({
      id: i.id,
      title: i.title,
      text: i.message,
      kind: "issue" as const,
    }));
    const requestItems: PickerItem[] = featureItems.map((f) => ({
      id: f.id,
      title: f.title,
      text: f.description ?? "",
      kind: f.kind,
    }));
    return [...issueItems, ...requestItems];
  }, [issues, featureItems]);

  // The filtered subset actually shown in the picker list below.
  const items = useMemo<PickerItem[]>(() => {
    return allItems.filter((item) => {
      if (item.kind === "issue") {
        if (sourceType !== "issue" && sourceType !== "all") return false;
        const issue = issues.find((i) => i.id === item.id);
        return statusFilter === "all" || issue?.tab === statusFilter;
      }
      return sourceType === "all" || sourceType === item.kind;
    });
  }, [allItems, issues, sourceType, statusFilter]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Issues carry their verification history as normal comments
  // (IssueDetailPanel's existing Notes section) — folded in so the
  // description has the full "why it wasn't fixed" trail, not just the
  // original report. Features/suggestions have no comment thread.
  async function fetchComposedText(item: PickerItem): Promise<string> {
    if (item.kind !== "issue") return item.text;
    const supabase = createClient();
    const { data: comments } = await supabase
      .from("board_issue_comments")
      .select("author, text, created_at")
      .eq("issue_id", item.id)
      .order("created_at", { ascending: true });
    if (!comments || comments.length === 0) return item.text;
    const trail = comments
      .map((c) => `— ${c.author} (${new Date(c.created_at).toLocaleDateString()}): ${c.text}`)
      .join("\n");
    return `${item.text}\n\n--- Notes ---\n${trail}`;
  }

  function toggleExpand(item: PickerItem) {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    if (descriptionEdits.has(item.id)) return;
    // Seed immediately with the plain text so the textarea isn't empty
    // while comments load, then replace once they arrive.
    setDescriptionEdits((prev) => new Map(prev).set(item.id, item.text));
    fetchComposedText(item).then((text) => {
      setDescriptionEdits((prev) => {
        if (prev.get(item.id) !== item.text) return prev; // dev already started typing — don't clobber
        return new Map(prev).set(item.id, text);
      });
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

  // Dynamic import — jsPDF only runs inside this click handler, never at
  // module load time, so there's no risk of it touching browser globals
  // during SSR just because this component happens to be mounted.
  //
  // Laid out as an actual document (title page, an explicit "confirm
  // before executing" instruction for the AI, then one heading-led
  // section per item) rather than one long unbroken paragraph dump.
  // Items flow one after another on the same page, separated by a
  // horizontal rule — pages only break where content naturally runs out
  // of room (ensureSpace), not once per item.
  async function handleGeneratePdf() {
    const selected = allItems.filter((i) => selectedIds.has(i.id));
    if (selected.length === 0) return;
    setGenerating(true);
    try {
      const resolved = await Promise.all(
        selected.map(async (item) => ({
          item,
          description: descriptionEdits.get(item.id) ?? (await fetchComposedText(item)),
          curl: item.kind === "issue" ? buildCurlCommand(item.id) : null,
        }))
      );

      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const margin = 15;
      const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
      const pageHeight = doc.internal.pageSize.getHeight();
      let y = margin;

      function ensureSpace(lines: number, lineHeight: number) {
        if (y + lines * lineHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      }

      function addHeading(text: string, size: number) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(text, maxWidth);
        ensureSpace(lines.length, size * 0.5);
        doc.text(lines, margin, y);
        y += lines.length * (size * 0.5) + 3;
      }

      function addBody(text: string, opts: { font?: "helvetica" | "courier"; size?: number } = {}) {
        const font = opts.font ?? "helvetica";
        const size = opts.size ?? 10.5;
        doc.setFont(font, "normal");
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(text, maxWidth);
        for (const line of lines) {
          ensureSpace(1, size * 0.5);
          doc.text(line, margin, y);
          y += size * 0.5;
        }
        y += 3;
      }

      function addSeparator() {
        ensureSpace(1, 6);
        y += 3;
        doc.setDrawColor(200);
        doc.line(margin, y, margin + maxWidth, y);
        doc.setDrawColor(0);
        y += 7;
      }

      addHeading("HappyApp — Vibe Coding Export", 16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(130);
      doc.text(new Date().toLocaleString(), margin, y);
      doc.setTextColor(0);
      y += 9;

      addHeading("Instructions for AI", 12);
      addBody(
        "Before making any changes, read through every item below and confirm your " +
          "understanding of the requirements back to the user first. Do not begin " +
          "implementing or executing anything until the user has explicitly confirmed " +
          "your understanding is correct."
      );
      y += 3;

      const counters: Record<PickerItem["kind"], number> = { issue: 0, feature: 0, suggestion: 0 };
      const kindLabel: Record<PickerItem["kind"], string> = {
        issue: "Issue",
        feature: "Feature",
        suggestion: "Suggestion",
      };

      resolved.forEach(({ item, description, curl }, index) => {
        counters[item.kind] += 1;
        if (index > 0) addSeparator();
        addHeading(`${kindLabel[item.kind]} ${counters[item.kind]}: ${item.title}`, 14);
        addHeading("Details", 10.5);
        addBody(description);
        if (curl) {
          y += 2;
          addHeading("Report back (run this once the fix is made)", 10.5);
          addBody(curl, { font: "courier", size: 9 });
        }
      });

      doc.save(`vibe-coding-export-${Date.now()}.pdf`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as SourceType)}
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
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
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
          items.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 p-3.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelected(item.id)}
                    className="h-4 w-4 shrink-0 rounded border-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => toggleExpand(item)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-900"
                  >
                    {item.title}
                  </button>
                  {item.kind !== "issue" && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-500">
                      {item.kind}
                    </span>
                  )}
                </div>

                {isExpanded && (
                  <div className="flex flex-col gap-1.5 border-t border-slate-100 p-3.5">
                    <label className="text-xs font-medium text-slate-500">Dev Description</label>
                    <textarea
                      value={descriptionEdits.get(item.id) ?? ""}
                      onChange={(e) =>
                        setDescriptionEdits((prev) => new Map(prev).set(item.id, e.target.value))
                      }
                      rows={8}
                      className="input font-mono text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
