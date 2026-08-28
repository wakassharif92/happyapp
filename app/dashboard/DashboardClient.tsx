"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./theme.css";
import type { Category, Issue, Project, TabKey } from "@/lib/board/types";
import { TAB_ORDER } from "@/lib/board/types";
import { colorForId } from "@/lib/board/format";
import { createClient } from "@/lib/supabase/client";
import type { BoardIssue } from "@/lib/types/database";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { TabNav } from "@/components/dashboard/TabNav";
import { IssueCard } from "@/components/dashboard/IssueCard";
import { IssueDetailPanel } from "@/components/dashboard/IssueDetailPanel";
import { NewIssueModal, type NewIssueInput } from "@/components/dashboard/NewIssueModal";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  addComment,
  createIssue,
  getIssueThread,
  moveIssue,
  updateIssueCategory,
} from "./actions";

function toUiIssue(row: BoardIssue): Issue {
  return {
    id: row.id,
    projectId: row.project_id,
    tab: row.tab,
    title: row.title,
    message: row.message,
    senderName: row.sender_name,
    sourceChannel: row.source_channel,
    category: row.category,
    severity: row.severity ?? undefined,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    thumbnailColor: colorForId(row.id),
    createdAt: row.created_at,
    comments: [],
    activity: [],
  };
}

export function DashboardClient({
  initialProjects,
  initialIssues,
}: {
  initialProjects: Project[];
  initialIssues: BoardIssue[];
}) {
  const [issues, setIssues] = useState<Issue[]>(() => initialIssues.map(toUiIssue));
  const [loadedThreads, setLoadedThreads] = useState<Set<string>>(new Set());
  const [currentProjectId, setCurrentProjectId] = useState(initialProjects[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [newIssueOpen, setNewIssueOpen] = useState(false);

  const currentProject = initialProjects.find((p) => p.id === currentProjectId) ?? null;

  // Live updates: a Slack message landing in a connected channel inserts
  // a board_issues row server-side (app/api/slack/events/route.ts) — this
  // is what makes it show up in an already-open Pending tab without a
  // manual refresh, same Realtime pattern as components/ActivityFeed.tsx.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("board_issues-inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "board_issues" },
        (payload) => {
          const row = payload.new as BoardIssue;
          setIssues((prev) =>
            prev.some((i) => i.id === row.id) ? prev : [toUiIssue(row), ...prev]
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const projectIssues = useMemo(
    () => issues.filter((i) => i.projectId === currentProjectId),
    [issues, currentProjectId]
  );

  const counts = useMemo(() => {
    const result = {} as Record<TabKey, number>;
    for (const tab of TAB_ORDER) {
      result[tab] = projectIssues.filter((i) => i.tab === tab).length;
    }
    return result;
  }, [projectIssues]);

  const visibleIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projectIssues
      .filter((i) => i.tab === activeTab)
      .filter(
        (i) =>
          !q ||
          i.title.toLowerCase().includes(q) ||
          i.message.toLowerCase().includes(q) ||
          i.senderName.toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [projectIssues, activeTab, search]);

  const selectedIssue = issues.find((i) => i.id === selectedIssueId) ?? null;

  // Comments/activity are lazy-loaded per issue (not fetched for the whole
  // board up front) — only the currently open detail panel needs them.
  useEffect(() => {
    if (!selectedIssueId || loadedThreads.has(selectedIssueId)) return;
    let cancelled = false;
    getIssueThread(selectedIssueId).then(({ comments, activity }) => {
      if (cancelled) return;
      setIssues((prev) =>
        prev.map((i) =>
          i.id === selectedIssueId
            ? {
                ...i,
                comments: comments.map((c) => ({
                  id: c.id,
                  author: c.author,
                  text: c.text,
                  createdAt: c.created_at,
                })),
                activity: activity.map((a) => ({
                  id: a.id,
                  text: a.text,
                  actor: a.actor,
                  createdAt: a.created_at,
                })),
              }
            : i
        )
      );
      setLoadedThreads((prev) => new Set(prev).add(selectedIssueId));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedIssueId, loadedThreads]);

  function updateIssueLocal(id: string, updater: (issue: Issue) => Issue) {
    setIssues((prev) => prev.map((i) => (i.id === id ? updater(i) : i)));
  }

  function handleCategoryChange(id: string, category: Category) {
    updateIssueLocal(id, (i) => ({ ...i, category }));
    updateIssueCategory(id, category);
  }

  function handleMove(id: string, tab: TabKey) {
    updateIssueLocal(id, (i) => ({
      ...i,
      tab,
      activity: [
        ...i.activity,
        {
          id: `local-${Date.now()}`,
          text: `Moved to ${tab.replace("_", " ")}`,
          actor: "You",
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    moveIssue(id, tab);
  }

  function handleConvertToDev(id: string) {
    handleMove(id, "pending");
  }

  function handleCopyLink(id: string) {
    const url = `https://qa-agent.internal/issues/${id}/pdf`;
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  async function handleAddComment(id: string, text: string) {
    const optimisticId = `local-${Date.now()}`;
    updateIssueLocal(id, (i) => ({
      ...i,
      comments: [
        ...i.comments,
        { id: optimisticId, author: "You", text, createdAt: new Date().toISOString() },
      ],
    }));
    const saved = await addComment(id, text);
    if (saved) {
      updateIssueLocal(id, (i) => ({
        ...i,
        comments: i.comments.map((c) =>
          c.id === optimisticId
            ? { id: saved.id, author: saved.author, text: saved.text, createdAt: saved.created_at }
            : c
        ),
      }));
    }
  }

  async function handleCreateIssue(input: NewIssueInput) {
    if (!currentProjectId) return;
    const created = await createIssue({
      projectId: currentProjectId,
      title: input.title,
      message: input.message,
      category: input.category,
      sourceChannel: input.sourceChannel,
      severity: input.severity,
      mediaType: input.mediaType,
    });
    setIssues((prev) => [toUiIssue(created), ...prev]);
    setActiveTab(created.tab);
    setNewIssueOpen(false);
  }

  if (!currentProject) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        No projects yet — create one from{" "}
        <Link href="/projects/new" className="ml-1 font-medium text-indigo-600 underline">
          Add Project
        </Link>
        .
      </div>
    );
  }

  return (
    <div
      className="qa-board flex h-screen overflow-hidden bg-[var(--db-bg)] text-[var(--db-fg)]"
      data-theme={theme}
    >
      <Sidebar
        projects={initialProjects}
        currentProjectId={currentProjectId}
        onProjectChange={setCurrentProjectId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={counts}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          projects={initialProjects}
          currentProjectId={currentProjectId}
          onProjectChange={setCurrentProjectId}
          search={search}
          onSearchChange={setSearch}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          onNewIssue={() => setNewIssueOpen(true)}
          userInitial="Y"
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <TabNav activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />

          <div className="mt-4 flex flex-col gap-3">
            {visibleIssues.length === 0 ? (
              <EmptyState tab={activeTab} />
            ) : (
              visibleIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onOpenDetail={setSelectedIssueId}
                  onCategoryChange={handleCategoryChange}
                  onMove={handleMove}
                  onCopyLink={handleCopyLink}
                  onConvertToDev={handleConvertToDev}
                />
              ))
            )}
          </div>
        </main>
      </div>

      <IssueDetailPanel
        issue={selectedIssue}
        projectName={currentProject.name}
        onClose={() => setSelectedIssueId(null)}
        onCategoryChange={handleCategoryChange}
        onMove={handleMove}
        onCopyLink={handleCopyLink}
        onAddComment={handleAddComment}
        onConvertToDev={handleConvertToDev}
      />

      <NewIssueModal
        open={newIssueOpen}
        onClose={() => setNewIssueOpen(false)}
        projectName={currentProject.name}
        onCreate={handleCreateIssue}
      />
    </div>
  );
}
