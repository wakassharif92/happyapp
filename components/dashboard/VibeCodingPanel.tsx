"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Issue, TabKey } from "@/lib/board/types";
import { TAB_LABELS, TAB_ORDER } from "@/lib/board/types";
import type { FeatureRequest, FeatureRequestKind } from "@/lib/types/database";

type SourceType = "issue" | FeatureRequestKind;

// "For Vibe Coding": pick an existing tracked item (an issue at a given
// workflow stage, a feature, or a suggestion), refine its description in
// a "Dev Description" field (pre-filled from the item, editable — this is
// where a dev adds the extra context an AI coding tool needs), then
// generate a PDF containing ONLY that text, to paste into whatever tool
// they're using.
//
// Closes the loop with the AI Fix tab: after sharing the PDF with an
// external AI tool (Claude, Codex, etc. — that work happens outside this
// app entirely), "Send to AI Fix" moves the issue to the ai_fix tab so it
// shows up as "needs verification." If verification finds it's NOT
// actually fixed, the dev adds a normal comment on the issue explaining
// why (the existing Notes section in IssueDetailPanel — no new UI needed
// there) and moves it back to a workflow tab; picking it again here pulls
// the original description AND every comment added since (including that
// "why it wasn't fixed" note) into the Dev Description field, so the next
// PDF carries the full history instead of just the original report.
export function VibeCodingPanel({
  projectId,
  issues,
  onSendToAiFix,
}: {
  projectId: string;
  issues: Issue[];
  onSendToAiFix: (issueId: string) => void;
}) {
  const [sourceType, setSourceType] = useState<SourceType>("issue");
  const [issueStatus, setIssueStatus] = useState<TabKey>("pending");
  const [featureItems, setFeatureItems] = useState<FeatureRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [devDescription, setDevDescription] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (sourceType === "issue") return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("feature_requests")
      .select("*")
      .eq("project_id", projectId)
      .eq("kind", sourceType)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setFeatureItems(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceType, projectId]);

  const items = useMemo(() => {
    if (sourceType === "issue") {
      return issues
        .filter((i) => i.tab === issueStatus)
        .map((i) => ({ id: i.id, title: i.title, text: i.message }));
    }
    return featureItems.map((f) => ({ id: f.id, title: f.title, text: f.description ?? "" }));
  }, [sourceType, issueStatus, issues, featureItems]);

  async function selectItem(id: string) {
    setSelectedId(id);
    const item = items.find((i) => i.id === id);
    let text = item?.text ?? "";

    // Issues carry their verification history as normal comments
    // (IssueDetailPanel's existing Notes section) — fold them in so a
    // re-generated PDF has the full "why it wasn't fixed" trail, not just
    // the original report. Features/suggestions have no comment thread.
    if (sourceType === "issue") {
      const supabase = createClient();
      const { data: comments } = await supabase
        .from("board_issue_comments")
        .select("author, text, created_at")
        .eq("issue_id", id)
        .order("created_at", { ascending: true });
      if (comments && comments.length > 0) {
        const trail = comments
          .map((c) => `— ${c.author} (${new Date(c.created_at).toLocaleDateString()}): ${c.text}`)
          .join("\n");
        text = `${text}\n\n--- Notes ---\n${trail}`;
      }
    }

    setDevDescription(text);
  }

  // Dynamic import — jsPDF only runs inside this click handler, never at
  // module load time, so there's no risk of it touching browser globals
  // during SSR just because this component happens to be mounted.
  async function handleGeneratePdf() {
    if (!devDescription.trim()) return;
    setGenerating(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const margin = 15;
      const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
      const lines = doc.splitTextToSize(devDescription, maxWidth);
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
            setSelectedId(null);
            setDevDescription("");
          }}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
        >
          <option value="issue">Issues</option>
          <option value="feature">Features</option>
          <option value="suggestion">Suggestions</option>
        </select>

        {sourceType === "issue" && (
          <select
            value={issueStatus}
            onChange={(e) => {
              setIssueStatus(e.target.value as TabKey);
              setSelectedId(null);
              setDevDescription("");
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            {TAB_ORDER.map((tab) => (
              <option key={tab} value={tab}>
                {TAB_LABELS[tab]}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing here yet.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectItem(item.id)}
              className={`card w-full p-3.5 text-left transition-colors ${
                selectedId === item.id
                  ? "border-indigo-400 ring-1 ring-indigo-400"
                  : "hover:border-slate-300"
              }`}
            >
              <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
            </button>
          ))
        )}
      </div>

      {selectedId && (
        <div className="card flex flex-col gap-2 p-4">
          <label className="text-sm font-medium text-slate-700">Dev Description</label>
          <p className="text-xs text-slate-500">
            Pre-filled from the original report — add whatever extra context the AI needs, then
            generate a PDF with just this text.
          </p>
          <textarea
            value={devDescription}
            onChange={(e) => setDevDescription(e.target.value)}
            rows={10}
            className="input font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={generating || !devDescription.trim()}
              className="btn-primary"
            >
              {generating ? "Generating…" : "Generate PDF"}
            </button>
            {sourceType === "issue" && (
              <button
                type="button"
                onClick={() => onSendToAiFix(selectedId)}
                title="Once the AI tool has attempted a fix outside HappyApp, move this issue to AI Fix for verification"
                className="btn-secondary"
              >
                Send to AI Fix
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
