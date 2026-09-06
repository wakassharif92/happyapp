"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Release, ReleaseCategory, ReleaseOs, ReleasePlatform } from "@/lib/types/database";
import { createRelease, deleteRelease } from "@/app/dashboard/releasesActions";
import { formatRelativeTime } from "@/lib/board/relativeTime";

type CategoryFilter = ReleaseCategory | "all";
type PlatformFilter = ReleasePlatform | "all";
type OsFilter = ReleaseOs | "all";

const CATEGORY_LABELS: Record<ReleaseCategory, string> = {
  backend: "Backend",
  frontend: "Frontend",
};
const PLATFORM_LABELS: Record<ReleasePlatform, string> = {
  web: "Web",
  mobile: "Mobile",
};
const OS_LABELS: Record<ReleaseOs, string> = {
  ios: "iOS",
  android: "Android",
};

function badgeText(r: Release): string {
  if (r.category === "backend") return "Backend";
  if (r.platform === "mobile") return `Frontend · Mobile · ${r.os ? OS_LABELS[r.os] : ""}`.trim();
  return "Frontend · Web";
}

// A log of backend PRs and frontend builds — entries come from either
// this panel's "Add Release" form, or an external AI coding tool
// calling POST /api/releases/[projectId] directly (see
// app/api/releases/[projectId]/route.ts) after finishing a change. The
// "Copy AI Instructions" button hands over a standing, reusable prompt
// covering that API — meant to be pasted once into Claude Code's/
// Codex's own project (its CLAUDE.md, or just given once in a chat), not
// regenerated per release the way Vibe Coding's PDF export is.
export function ReleasesPanel({ projectId }: { projectId: string }) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [osFilter, setOsFilter] = useState<OsFilter>("all");

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ReleaseCategory>("backend");
  const [platform, setPlatform] = useState<ReleasePlatform>("web");
  const [os, setOs] = useState<ReleaseOs>("ios");
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [instructionsCopied, setInstructionsCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("releases")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setReleases(data ?? []);
      });

    supabase
      .from("projects")
      .select("api_token")
      .eq("id", projectId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setApiToken(data?.api_token ?? null);
      });

    // No server-side `filter:` — same reasoning as every other
    // postgres_changes subscription in this app.
    const channel = supabase
      .channel(`releases-${projectId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "releases" },
        (payload) => {
          const row = payload.new as Release;
          if (row.project_id !== projectId) return;
          setReleases((prev) => (prev.some((r) => r.id === row.id) ? prev : [row, ...prev]));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "releases" },
        (payload) => {
          const row = payload.old as { id: string };
          setReleases((prev) => prev.filter((r) => r.id !== row.id));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  async function handleAdd() {
    if (!title.trim() || !link.trim()) return;
    setSubmitting(true);
    try {
      const created = await createRelease({
        projectId,
        category,
        platform: category === "frontend" ? platform : null,
        os: category === "frontend" && platform === "mobile" ? os : null,
        title: title.trim(),
        description: description.trim(),
        link: link.trim(),
      });
      setReleases((prev) => (prev.some((r) => r.id === created.id) ? prev : [created, ...prev]));
      setTitle("");
      setLink("");
      setDescription("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setReleases((prev) => prev.filter((r) => r.id !== id));
    await deleteRelease(id);
  }

  function buildInstructionsText(): string {
    const origin =
      process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
    return `HappyApp — Release Logging Instructions

Keep this file in the project (e.g. commit it alongside CLAUDE.md/AGENTS.md as a reference) so it survives across sessions.

One-time setup (for the developer, not the AI): this curl call is an outbound network request, so your AI coding tool's own permission system will very likely block or ask you to approve it the first time — that is correct, expected behavior, and this document cannot and should not try to bypass it. Approve the call once, and if your tool supports a permanent allow-rule for this exact endpoint (${origin}/api/releases/${projectId}), add that rule yourself so future builds don't need re-approval every time.

For the AI: whenever you finish a backend PR or a frontend build/release for this project, log it in HappyApp automatically, on your own — right after the change ships. "Don't ask first" here means the business decision only (never ask the developer "should I log this?" — the answer is always yes); it does NOT mean trying to bypass your own tool's permission/safety prompts for running the command, which are the developer's call to configure, not yours to override. Call this every time, every build, no exceptions once the developer has approved/allow-listed it:

curl -X POST ${origin}/api/releases/${projectId} \\
  -H "Authorization: Bearer ${apiToken ?? "<project api token>"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "category": "backend" | "frontend",
    "platform": "web" | "mobile",
    "os": "ios" | "android",
    "title": "Short summary of what shipped",
    "description": "What changed, what was fixed, what was added",
    "link": "URL to the PR or build",
    "createdBy": "Claude" | "Codex"
  }'

Rules:
- category "backend": omit platform and os entirely.
- category "frontend", platform "web": omit os.
- category "frontend", platform "mobile": os is required ("ios" or "android").
- "createdBy" is optional (defaults to "AI").

This is a standing instruction, not a one-time task — treat every future PR merge or shippable build in this project as something that must end with this call, so the team always sees it in HappyApp's Releases tab without anyone having to remind you or tell them separately.`;
  }

  async function handleCopyInstructions() {
    await navigator.clipboard.writeText(buildInstructionsText());
    setInstructionsCopied(true);
    setTimeout(() => setInstructionsCopied(false), 2000);
  }

  // A downloadable counterpart to "Copy AI Instructions" — meant to be
  // saved as a real file and committed into the project's own repo
  // (next to CLAUDE.md/AGENTS.md) as a permanent reference, rather than
  // only living in a clipboard that gets overwritten. Rendered as plain
  // monospace text (courier) since the content is meant to be read
  // verbatim, same reasoning as VibeCodingPanel's curl-command blocks.
  async function handleDownloadInstructions() {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const margin = 15;
    const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = margin;

    function ensureSpace(lineHeight: number) {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    }

    doc.setFont("courier", "normal");
    doc.setFontSize(9.5);
    for (const rawLine of buildInstructionsText().split("\n")) {
      const wrapped = rawLine.length ? doc.splitTextToSize(rawLine, maxWidth) : [""];
      for (const line of wrapped) {
        ensureSpace(5);
        doc.text(line, margin, y);
        y += 5;
      }
    }

    doc.save(`happyapp-release-instructions-${projectId}.pdf`);
  }

  const visible = releases.filter((r) => {
    if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
    if (categoryFilter === "frontend" || (categoryFilter === "all" && r.category === "frontend")) {
      if (platformFilter !== "all" && r.platform !== platformFilter) return false;
      if (platformFilter === "mobile" || (platformFilter === "all" && r.platform === "mobile")) {
        if (osFilter !== "all" && r.os !== osFilter) return false;
      }
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value as CategoryFilter);
            setPlatformFilter("all");
            setOsFilter("all");
          }}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
        >
          <option value="all">All categories</option>
          <option value="backend">Backend</option>
          <option value="frontend">Frontend</option>
        </select>

        {(categoryFilter === "frontend" || categoryFilter === "all") && (
          <select
            value={platformFilter}
            onChange={(e) => {
              setPlatformFilter(e.target.value as PlatformFilter);
              setOsFilter("all");
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            <option value="all">All platforms</option>
            <option value="web">Web</option>
            <option value="mobile">Mobile</option>
          </select>
        )}

        {(platformFilter === "mobile" || platformFilter === "all") &&
          (categoryFilter === "frontend" || categoryFilter === "all") && (
            <select
              value={osFilter}
              onChange={(e) => setOsFilter(e.target.value as OsFilter)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
            >
              <option value="all">All OS</option>
              <option value="ios">iOS</option>
              <option value="android">Android</option>
            </select>
          )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyInstructions}
            disabled={!apiToken}
            className="btn-secondary"
          >
            {instructionsCopied ? "Copied!" : "Copy AI Instructions"}
          </button>
          <button
            type="button"
            onClick={handleDownloadInstructions}
            disabled={!apiToken}
            className="btn-secondary"
          >
            Download Instructions
          </button>
        </div>
      </div>

      <div className="card flex flex-col gap-2 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ReleaseCategory)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            {(Object.keys(CATEGORY_LABELS) as ReleaseCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>

          {category === "frontend" && (
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as ReleasePlatform)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
            >
              {(Object.keys(PLATFORM_LABELS) as ReleasePlatform[]).map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          )}

          {category === "frontend" && platform === "mobile" && (
            <select
              value={os}
              onChange={(e) => setOs(e.target.value as ReleaseOs)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
            >
              {(Object.keys(OS_LABELS) as ReleaseOs[]).map((o) => (
                <option key={o} value={o}>
                  {OS_LABELS[o]}
                </option>
              ))}
            </select>
          )}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (what shipped)"
          className="input"
        />
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="PR or build link"
          className="input"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What changed, fixed, or was added (optional)"
          className="input"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={submitting || !title.trim() || !link.trim()}
          className="btn-primary self-start"
        >
          {submitting ? "Logging…" : "Log Release"}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {visible.length === 0 ? (
          <p className="text-sm text-slate-400">No releases logged yet.</p>
        ) : (
          visible.map((r) => (
            <div key={r.id} className="card flex flex-col gap-2 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{r.title}</p>
                  {r.description && (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-500">
                      {r.description}
                    </p>
                  )}
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block truncate text-xs text-indigo-600 hover:underline"
                  >
                    {r.link}
                  </a>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {badgeText(r)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400" suppressHydrationWarning>
                  {r.created_by} · {formatRelativeTime(r.created_at)}
                </p>
                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
