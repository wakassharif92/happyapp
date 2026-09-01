"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Issue, TabKey } from "@/lib/board/types";
import { TAB_LABELS, TAB_ORDER } from "@/lib/board/types";
import type { FeatureRequest, FeatureRequestKind } from "@/lib/types/database";
import { FEATURE_REQUEST_KIND_LABELS } from "@/lib/types/database";
import { IconChevronDown, IconClose } from "./icons";

type SourceType = "issue" | FeatureRequestKind | "all";
type StatusFilter = TabKey | "all";

const KIND_LABEL: Record<"issue" | FeatureRequestKind, string> = {
  issue: "Issue",
  ...FEATURE_REQUEST_KIND_LABELS,
};

type PickerItem = {
  id: string;
  title: string;
  text: string;
  kind: "issue" | FeatureRequestKind;
  // Only ever set for issues (features/suggestions carry no attachment) —
  // the same signed URL already resolved by app/dashboard/page.tsx /
  // DashboardClient.tsx's Realtime handler, not re-resolved here.
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "none";
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
  // One free-text note for the whole export (not per item) — e.g.
  // "run npm install before testing" or "ignore the styling on #2 for
  // now" — included in the PDF right after the AI instructions, ahead of
  // every item's own section.
  const [noteForAi, setNoteForAi] = useState("");
  const [generating, setGenerating] = useState(false);
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  // Transient feedback next to the Generate PDF button — the popover
  // itself closes as soon as an option is picked (the upload/signing for
  // "Copy PDF Link" takes a moment), so "Link copied!"/an error can't be
  // shown inside the menu the way CopyRow.tsx shows it inline.
  const [pdfStatus, setPdfStatus] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxUrl) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxUrl(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxUrl]);

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
    // Once an issue is in AI Fix it's already been sent off and fixed (or
    // claimed fixed) once — it has no business being picked again here
    // until a human sends it back to Pending/In Progress from the AI Fix
    // tab, so it's excluded outright rather than just another status
    // filter option.
    const issueItems: PickerItem[] = issues
      .filter((i) => i.tab !== "ai_fix")
      .map((i) => ({
        id: i.id,
        title: i.title,
        text: i.message,
        kind: "issue" as const,
        mediaUrl: i.mediaUrl,
        mediaType: i.mediaType,
      }));
    const requestItems: PickerItem[] = featureItems.map((f) => ({
      id: f.id,
      title: f.title,
      text: f.description ?? "",
      kind: f.kind,
    }));
    return [...issueItems, ...requestItems];
  }, [issues, featureItems]);

  // Stable, per-kind numbering (Issue 1, Issue 2, Feature 1, …) based on
  // each item's position in the full unfiltered list — NOT which ones are
  // currently checked, so "Issue 3" always means the same issue whether
  // you're looking at the picker, the generated PDF, or (matching
  // numbers, not the same physical issue) the AI Fix tab (IssueCard.tsx).
  // Previously the PDF numbered only the selected subset in selection
  // order, so the same issue could be "Issue 1" one export and "Issue 2"
  // the next depending on what else was checked alongside it.
  const itemNumbers = useMemo(() => {
    const map = new Map<string, number>();
    const counters: Record<PickerItem["kind"], number> = {
      issue: 0,
      feature: 0,
      suggestion: 0,
      later_on: 0,
    };
    for (const item of allItems) {
      counters[item.kind] += 1;
      map.set(item.id, counters[item.kind]);
    }
    return map;
  }, [allItems]);

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

  // Fetches the attached screenshot (already a signed, fetchable URL) and
  // converts it to a data URL — jsPDF's addImage() needs the actual image
  // bytes inline, not a remote src, the same reason ChatWindow.tsx's
  // lightbox works with a plain <img> but a PDF can't just reference a URL.
  async function fetchImageDataUrl(url: string): Promise<string | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
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

  // Dynamic import — jsPDF only runs inside this function, never at
  // module load time, so there's no risk of it touching browser globals
  // during SSR just because this component happens to be mounted.
  //
  // Laid out as an actual document (title page, an explicit "confirm
  // before executing" instruction for the AI, then one heading-led
  // section per item) rather than one long unbroken paragraph dump.
  // Items flow one after another on the same page, separated by a
  // horizontal rule — pages only break where content naturally runs out
  // of room (ensureSpace), not once per item.
  //
  // Shared by both "Download as PDF" and "Copy PDF Link" — the document
  // itself is identical either way, only what happens to the finished
  // jsPDF instance differs (doc.save() vs. doc.output("blob") + upload).
  async function buildPdfDocument() {
    const selected = allItems.filter((i) => selectedIds.has(i.id));
    if (selected.length === 0) return null;

    const resolved = await Promise.all(
      selected.map(async (item) => ({
        item,
        description: descriptionEdits.get(item.id) ?? (await fetchComposedText(item)),
        curl: item.kind === "issue" ? buildCurlCommand(item.id) : null,
        imageDataUrl:
          item.kind === "issue" && item.mediaType === "image" && item.mediaUrl
            ? await fetchImageDataUrl(item.mediaUrl)
            : null,
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

    function addImage(dataUrl: string) {
      const props = doc.getImageProperties(dataUrl);
      const ratio = props.width / props.height;
      let imgWidth = maxWidth;
      let imgHeight = imgWidth / ratio;
      const maxImgHeight = 100; // cap so a tall screenshot doesn't dominate the page
      if (imgHeight > maxImgHeight) {
        imgHeight = maxImgHeight;
        imgWidth = imgHeight * ratio;
      }
      ensureSpace(1, imgHeight);
      doc.addImage(dataUrl, props.fileType, margin, y, imgWidth, imgHeight);
      y += imgHeight + 5;
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
    addBody(
      "Every item below must end with its \"Report back\" command being run — this is " +
        "required even if you could not find the issue in the codebase, could not " +
        "reproduce it, or determined it was already fixed. Updating the status is " +
        "mandatory in every case; what changes is only the summary text you send: " +
        "explain clearly what you found (or didn't find) so a human can review it in " +
        "AI Fix and decide what to do next."
    );
    y += 3;

    if (noteForAi.trim()) {
      addHeading("Note from the team", 12);
      addBody(noteForAi.trim());
      y += 3;
    }

    resolved.forEach(({ item, description, curl, imageDataUrl }, index) => {
      if (index > 0) addSeparator();
      addHeading(`${KIND_LABEL[item.kind]} ${itemNumbers.get(item.id)}: ${item.title}`, 14);
      addHeading("Details", 10.5);
      addBody(description);
      if (imageDataUrl) {
        y += 1;
        addHeading("Attached screenshot", 10.5);
        addImage(imageDataUrl);
      }
      if (curl) {
        y += 2;
        addHeading("Report back (run this once the fix is made)", 10.5);
        addBody(curl, { font: "courier", size: 9 });
      }
    });

    return doc;
  }

  async function handleDownloadPdf() {
    setGenerating(true);
    try {
      const doc = await buildPdfDocument();
      if (!doc) return;
      doc.save(`vibe-coding-export-${Date.now()}.pdf`);
    } finally {
      setGenerating(false);
    }
  }

  // Uploads the same generated PDF to the existing private "whatsapp-media"
  // Storage bucket (already used for report/support screenshots — its
  // is_staff() insert/select policies, migration 0009, cover any signed-in
  // company member) under a random filename, then copies a signed URL —
  // long-lived (7 days) since the whole point is pasting it somewhere
  // (an AI chat tool) to be fetched later, not downloaded immediately.
  async function handleCopyPdfLink() {
    setGenerating(true);
    setPdfStatus(null);
    try {
      const doc = await buildPdfDocument();
      if (!doc) return;
      const blob = doc.output("blob");
      const path = `vibe-coding-${crypto.randomUUID()}.pdf`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("whatsapp-media")
        .upload(path, blob, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;
      const { data, error: signError } = await supabase.storage
        .from("whatsapp-media")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      if (signError || !data?.signedUrl) throw signError ?? new Error("Failed to create link");
      await navigator.clipboard.writeText(data.signedUrl);
      setPdfStatus({ type: "success", text: "Link copied!" });
    } catch {
      setPdfStatus({ type: "error", text: "Failed to copy link" });
    } finally {
      setGenerating(false);
      setTimeout(() => setPdfStatus(null), 3000);
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
          <option value="later_on">Later On</option>
        </select>

        {(sourceType === "issue" || sourceType === "all") && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            <option value="all">All statuses</option>
            {TAB_ORDER.filter((tab) => tab !== "ai_fix").map((tab) => (
              <option key={tab} value={tab}>
                {TAB_LABELS[tab]}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto flex items-center gap-2">
          {pdfStatus && (
            <span
              className={`text-xs ${pdfStatus.type === "success" ? "text-emerald-600" : "text-red-600"}`}
            >
              {pdfStatus.text}
            </span>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPdfMenuOpen((o) => !o)}
              disabled={generating || selectedIds.size === 0}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              {generating
                ? "Generating…"
                : `Generate PDF${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
              <IconChevronDown className="h-3.5 w-3.5" />
            </button>

            {pdfMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPdfMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setPdfMenuOpen(false);
                      handleDownloadPdf();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Download as PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPdfMenuOpen(false);
                      handleCopyPdfLink();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Copy PDF Link
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card flex flex-col gap-1.5 p-4">
        <label className="text-sm font-medium text-slate-900" htmlFor="vibe-coding-note">
          Note for AI (optional)
        </label>
        <p className="text-xs text-slate-500">
          Applies to the whole export, not one item — e.g. setup steps, or something to ignore
          for now. Included in the generated PDF right below the instructions.
        </p>
        <textarea
          id="vibe-coding-note"
          value={noteForAi}
          onChange={(e) => setNoteForAi(e.target.value)}
          rows={2}
          placeholder="Anything the AI should know before starting…"
          className="input mt-1 text-sm"
        />
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
                    <span className="text-slate-400">
                      {KIND_LABEL[item.kind]} {itemNumbers.get(item.id)}:
                    </span>{" "}
                    {item.title}
                  </button>
                  {item.kind !== "issue" && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-500">
                      {item.kind}
                    </span>
                  )}
                  {item.kind === "issue" && item.mediaType === "image" && item.mediaUrl && (
                    <span
                      title="Has an attached screenshot"
                      className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600"
                    >
                      📷
                    </span>
                  )}
                </div>

                {isExpanded && (
                  <div className="flex flex-col gap-3 border-t border-slate-100 p-3.5">
                    {item.kind === "issue" && item.mediaType === "image" && item.mediaUrl && (
                      <div>
                        <label className="text-xs font-medium text-slate-500">Screenshot</label>
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(item.mediaUrl!)}
                          className="mt-1 block cursor-zoom-in"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.mediaUrl}
                            alt="Attached to issue"
                            className="max-h-48 rounded-lg border border-slate-200 object-contain"
                          />
                        </button>
                      </div>
                    )}
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

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            title="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <IconClose className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Attachment, full size"
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
